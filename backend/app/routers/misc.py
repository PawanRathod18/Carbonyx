import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import config
from ..blockchain import ChainNotConnected, bridge
from ..models import Event
from .projects import get_db

router = APIRouter(prefix="/api", tags=["chain"])

ROLE_LABELS = {
    0: ("Platform Admin", "Deploys contracts, holds the platform fee wallet"),
    1: ("Verifier", "Independent body that approves or rejects projects"),
    2: ("Project Owner", "Registers projects and mints credits"),
    3: ("Buyer / Offsetter", "Purchases and retires credits"),
}

@router.get("/chain/status")
def chain_status():
    return bridge.status()

@router.get("/accounts")
def accounts(db: Session = Depends(get_db)):
    try:
        addresses = bridge.accounts()
    except ChainNotConnected as exc:
        raise _not_connected(str(exc))
    out = []
    for i, addr in enumerate(addresses):
        label, desc = ROLE_LABELS.get(i, ("User", "Additional demo account"))
        try:
            balances = bridge.balances(addr)
        except Exception:
            balances = {"eth": None, "cbx": None}
        out.append({
            "address": addr,
            "index": i,
            "label": label,
            "description": desc,
            "eth": balances["eth"],
            "cbx": balances["cbx"],
        })
    return out

@router.get("/chain/blocks")
def chain_blocks(limit: int = 12):
    try:
        bridge.ensure()
        w3 = bridge.w3
        latest = w3.eth.block_number
        blocks = []
        for number in range(latest, max(0, latest - min(limit, 40)), -1):
            b = w3.eth.get_block(number)
            blocks.append({
                "number": number,
                "hash": b["hash"].hex(),
                "tx_count": len(b["transactions"]),
                "gas_used": b["gasUsed"],
                "timestamp": b["timestamp"],
                "miner": b["miner"],
            })
        return blocks
    except ChainNotConnected as exc:
        raise _not_connected(str(exc))

@router.get("/accounts/{address}/portfolio")
def account_portfolio(address: str, db: Session = Depends(get_db)):
    try:
        bridge.ensure()
        balances = bridge.balances(address)
    except ChainNotConnected as exc:
        raise _not_connected(str(exc))

    addr = address.lower()
    retired = 0
    purchased = []
    activity = []
    for e in (db.query(Event).order_by(Event.id.desc()).limit(300).all()):
        payload = {}
        try:
            payload = json.loads(e.payload or "{}")
        except json.JSONDecodeError:
            payload = {}
        row = {
            "id": e.id, "event_name": e.event_name, "actor": e.actor,
            "payload": payload, "block_number": e.block_number,
            "tx_hash": e.tx_hash,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        if e.actor and e.actor.lower() == addr:
            activity.append(row)
        if e.event_name == "CreditsRetired" and payload.get("account", "").lower() == addr:
            retired += int(payload.get("amount", 0))
            activity.append(row)
        if e.event_name == "CreditsMinted" and str(payload.get("to", "")).lower() == addr:
            activity.append(row)

    try:
        listings = bridge.marketplace_listings()
    except (ChainNotConnected, Exception):
        listings = []
    own_listings = [l for l in listings if l["seller"].lower() == addr]

    return {
        "address": address,
        "eth": balances["eth"],
        "cbx": balances["cbx"],
        "retired_tco2e": retired,
        "active_listings": own_listings,
        "activity": activity[:20],
    }

@router.get("/ml/status")
def ml_status():
    from ..ml import get_model
    m = get_model()
    if not m.available:
        return {"available": False, "note": "scikit-learn not installed"}
    return {
        "available": True,
        "algorithm": "RandomForestRegressor",
        "n_training_samples": m.n_samples,
        "r2": m.r2,
        "features": m.features,
        "feature_importance": m.feature_importance,
    }

@router.get("/events")
def events(limit: int = 60, db: Session = Depends(get_db)):
    rows = (db.query(Event).order_by(Event.id.desc()).limit(min(limit, 200)).all())
    out = []
    for r in rows:
        payload = {}
        try:
            payload = json.loads(r.payload or "{}")
        except json.JSONDecodeError:
            payload = {}
        out.append({
            "id": r.id, "tx_hash": r.tx_hash, "block_number": r.block_number,
            "event_name": r.event_name, "actor": r.actor, "payload": payload,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return out

@router.get("/config")
def app_config():
    return {
        "gee_mode": config.GEE_MODE,
        "gee_available_key": bool(config.EE_KEY_FILE),
        "rpc_url": config.RPC_URL,
        "mint_buffer": config.MINT_BUFFER,
        "projection_years": config.PROJECTION_YEARS,
        "demo_regions": DEMO_REGIONS,
    }

DEMO_REGIONS = [
    {"name": "Sundarbans, India", "ecosystem": "mangrove", "country": "India",
     "bounds": [88.85, 21.55, 89.15, 21.95]},
    {"name": "Pichavaram, India", "ecosystem": "mangrove", "country": "India",
     "bounds": [79.75, 11.37, 79.84, 11.47]},
    {"name": "Gulf of Kachchh, India", "ecosystem": "mangrove", "country": "India",
     "bounds": [69.95, 22.35, 70.25, 22.60]},
    {"name": "Chilika Lake, India", "ecosystem": "seagrass", "country": "India",
     "bounds": [85.25, 19.65, 85.55, 19.95]},
    {"name": "Wadden Sea, Netherlands", "ecosystem": "saltmarsh",
     "country": "Netherlands", "bounds": [8.45, 53.42, 8.75, 53.62]},
]

def _not_connected(msg):
    from fastapi import HTTPException
    return HTTPException(503, msg)
