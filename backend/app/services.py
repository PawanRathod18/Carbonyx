import json
from decimal import Decimal

from sqlalchemy.orm import Session
from web3 import Web3

from . import config
from .blockchain import bridge, ChainNotConnected, ContractError
from .gee import engine as quant_engine
from .models import Event, Project, Report, utcnow

REGISTRY_EVENTS = ["ProjectRegistered", "ProjectVerified", "ProjectRejected"]
CREDIT_EVENTS = ["Transfer", "Approval", "CreditsMinted", "CreditsRetired"]
MARKET_EVENTS = ["Listed", "PriceUpdated", "Cancelled", "Purchased"]

def log_events(session: Session, receipt, contract, names, actor="") -> list[dict]:
    parsed = bridge.parse_events(receipt, contract, names)
    for e in parsed:
        session.add(Event(
            tx_hash=receipt["transactionHash"].hex(),
            block_number=receipt["blockNumber"],
            event_name=e["event"],
            actor=actor or "",
            payload=json.dumps(e["args"]),
        ))
    session.commit()
    return parsed

def serialize_project(session, project: Project, report: Report | None = None) -> dict:
    if report is None and session is not None:
        report = (session.query(Report)
                  .filter_by(project_id=project.id)
                  .order_by(Report.id.desc()).first())
    return {
        "id": project.id,
        "chain_id": project.chain_id,
        "name": project.name,
        "ecosystem": project.ecosystem,
        "country": project.country,
        "bounds": [float(x) for x in project.bounds.split(",")],
        "area_ha": project.area_ha,
        "owner_address": project.owner_address,
        "status": project.status,
        "verifier_address": project.verifier_address,
        "verifier_note": project.verifier_note,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "report": serialize_report(report),
    }

def serialize_report(report: Report | None) -> dict | None:
    if not report:
        return None
    extra = {}
    try:
        full = json.loads(report.report_json or "{}")
        extra = {
            "risk_flags": full.get("risk_flags", []),
            "recommendation": full.get("recommendation", ""),
            "ml": full.get("ml", {"available": False}),
        }
    except (json.JSONDecodeError, TypeError):
        pass
    return {
        "id": report.id,
        "engine": report.engine,
        "area_ha": report.area_ha,
        "ndvi_mean": report.ndvi_mean,
        "ndwi_mean": report.ndwi_mean,
        "agb_t": report.agb_t,
        "biomass_c_t": report.biomass_c_t,
        "soil_c_t": report.soil_c_t,
        "stock_tco2e": report.stock_tco2e,
        "seq_rate_tco2_yr": report.seq_rate_tco2_yr,
        "projection_tco2e": report.projection_tco2e,
        "issueable_tco2e": report.issueable_tco2e,
        "confidence": report.confidence,
        "cloud_fraction": report.cloud_fraction,
        "report_hash": report.report_hash,
        "created_at": report.created_at.isoformat() if report.created_at else None,
        **extra,
    }

def register_project(session: Session, *, name: str, ecosystem: str, country: str,
                     bounds: list[float], owner: str | None) -> Project:
    if ecosystem not in ("mangrove", "seagrass", "saltmarsh"):
        raise ContractError(f"unknown ecosystem {ecosystem!r}")
    bounds_str = ",".join(f"{b:.5f}" for b in bounds)
    area_ha = quant_engine._bbox_area_ha(bounds)

    receipt, events = bridge.register_project(
        actor=owner, name=name, ecosystem=ecosystem, country=country,
        bounds=bounds_str, area_ha=int(area_ha))

    chain_id = None
    for e in events:
        if e["event"] == "ProjectRegistered":
            chain_id = int(e["args"]["id"])
            owner = e["args"]["owner"]

    project = Project(
        chain_id=chain_id, name=name, ecosystem=ecosystem, country=country,
        bounds=bounds_str, area_ha=area_ha, owner_address=owner)
    session.add(project)
    session.commit()

    log_events(session, receipt, bridge.registry, REGISTRY_EVENTS, actor=owner)
    return project

def quantify_project(session: Session, project: Project) -> Report:
    report_dict = quant_engine.quantify_project(project)
    report = Report(
        project_id=project.id,
        engine=report_dict["engine"],
        area_ha=report_dict["classification"]["classified_area_ha"],
        ndvi_mean=report_dict["indices"]["ndvi_mean"],
        ndwi_mean=report_dict["indices"]["ndwi_mean"],
        agb_t=report_dict["carbon"]["agb_t"],
        biomass_c_t=report_dict["carbon"]["agb_c_t"] + report_dict["carbon"]["bgb_c_t"],
        soil_c_t=report_dict["carbon"]["soil_c_t"],
        stock_tco2e=report_dict["carbon"]["stock_tco2e"],
        seq_rate_tco2_yr=report_dict["projection"]["annual_seq_tco2_yr"],
        projection_tco2e=report_dict["projection"]["projected_tco2e"],
        issueable_tco2e=report_dict["projection"]["issueable_tco2e"],
        confidence=report_dict["confidence"],
        cloud_fraction=report_dict["cloud_fraction"],
        report_hash=report_dict["report_hash"],
        report_json=json.dumps(report_dict),
    )
    session.add(report)
    if project.status == "pending":
        project.status = "quantified"
    session.commit()
    return report

def get_report_full(session: Session, project: Project) -> dict:
    report = (session.query(Report)
              .filter_by(project_id=project.id)
              .order_by(Report.id.desc()).first())
    if not report:
        return {}
    return json.loads(report.report_json)

def verify_project(session: Session, project: Project, *, decision: str,
                   note: str, verifier: str | None) -> Project:
    report = (session.query(Report)
              .filter_by(project_id=project.id)
              .order_by(Report.id.desc()).first())
    if not report:
        raise ContractError("project has no quantification report yet - "
                           "run the quantification engine first")
    if project.chain_id is None:
        raise ContractError("project is not registered on chain")

    if decision == "approve":
        receipt = bridge.verify_project(verifier, project.chain_id, report.report_hash)
        project.status = "verified"
        log_events(session, receipt, bridge.registry, REGISTRY_EVENTS, actor=verifier)
    else:
        reason = (note or "not specified")[:180]
        receipt = bridge.reject_project(verifier, project.chain_id, reason)
        project.status = "rejected"
        log_events(session, receipt, bridge.registry, REGISTRY_EVENTS, actor=verifier)

    project.verifier_address = verifier
    project.verifier_note = note or ""
    project.verified_at = utcnow()
    session.commit()
    return project

def mint_credits(session: Session, project: Project, *, owner: str | None) -> dict:
    if project.status != "verified":
        raise ContractError("only verified projects can mint credits")
    report = (session.query(Report)
              .filter_by(project_id=project.id)
              .order_by(Report.id.desc()).first())
    amount = int(report.issueable_tco2e)
    if amount < 1:
        raise ContractError("computed issueable credits are zero")

    actor = owner or project.owner_address
    receipt = bridge.mint_credits(actor, project.chain_id, amount, report.report_hash)
    project.status = "minted"
    session.commit()
    log_events(session, receipt, bridge.credit, CREDIT_EVENTS, actor=actor)
    return {"amount": amount, "report_hash": report.report_hash,
            "tx_hash": receipt["transactionHash"].hex()}

def list_for_sale(session: Session, *, seller: str, project_id: int, amount: int,
                  price_per_credit_eth: float):
    price_wei = Web3.to_wei(Decimal(str(price_per_credit_eth)), "ether")
    receipt = bridge.list_credits(seller, project_id, amount, price_wei)
    events = log_events(session, receipt, bridge.market, MARKET_EVENTS, actor=seller)
    listing_id = None
    for e in events:
        if e["event"] == "Listed":
            listing_id = int(e["args"]["id"])
    return {"listing_id": listing_id, "tx_hash": receipt["transactionHash"].hex()}

def buy_listing(session: Session, *, buyer: str, listing_id: int):
    receipt = bridge.buy_listing(buyer, listing_id)
    events = log_events(session, receipt, bridge.market, MARKET_EVENTS, actor=buyer)
    return {"tx_hash": receipt["transactionHash"].hex(), "events": events}

def cancel_listing(session: Session, *, seller: str, listing_id: int):
    receipt = bridge.cancel_listing(seller, listing_id)
    log_events(session, receipt, bridge.market, MARKET_EVENTS, actor=seller)
    return {"tx_hash": receipt["transactionHash"].hex()}

def retire_credits(session: Session, *, actor: str, amount: int, reason: str):
    receipt = bridge.retire_credits(actor, amount, reason)
    log_events(session, receipt, bridge.credit, CREDIT_EVENTS, actor=actor)
    return {"tx_hash": receipt["transactionHash"].hex(),
            "retired": amount}
