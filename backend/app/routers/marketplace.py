from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import services
from ..blockchain import ChainNotConnected, ContractError, bridge
from ..models import Project
from ..schemas import BuyRequest, ListForSaleRequest, RetireRequest
from .projects import _chain_error, get_db

router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])

DEFAULT_SELLER_INDEX = 2
DEFAULT_BUYER_INDEX = 3

def _account(index: int) -> str:
    accounts = bridge.accounts()
    return accounts[index] if len(accounts) > index else accounts[-1]

@router.get("")
def marketplace(db: Session = Depends(get_db)):
    try:
        listings = bridge.marketplace_listings()
    except (ChainNotConnected, ContractError) as exc:
        _chain_error(exc)
    by_chain = {p.chain_id: p for p in db.query(Project).all() if p.chain_id}
    for listing in listings:
        p = by_chain.get(listing["project_id"])
        listing["project_name"] = p.name if p else f"project #{listing['project_id']}"
        listing["ecosystem"] = p.ecosystem if p else ""
        listing["total_cost_eth"] = round(
            listing["amount"] * listing["price_per_credit_eth"], 6)
    return listings

@router.post("/list")
def list_for_sale(body: ListForSaleRequest, db: Session = Depends(get_db)):
    try:
        seller = body.seller or _account(DEFAULT_SELLER_INDEX)
        return services.list_for_sale(
            db, seller=seller, project_id=body.project_id, amount=body.amount,
            price_per_credit_eth=body.price_per_credit_eth)
    except (ChainNotConnected, ContractError) as exc:
        _chain_error(exc)

@router.post("/listings/{listing_id}/buy")
def buy(listing_id: int, body: BuyRequest | None = None,
        db: Session = Depends(get_db)):
    try:
        buyer = (body.buyer if body and body.buyer else None) \
            or _account(DEFAULT_BUYER_INDEX)
        return services.buy_listing(db, buyer=buyer, listing_id=listing_id)
    except (ChainNotConnected, ContractError) as exc:
        _chain_error(exc)

@router.post("/listings/{listing_id}/cancel")
def cancel(listing_id: int, db: Session = Depends(get_db)):
    try:
        listings = bridge.marketplace_listings()
        listing = next((l for l in listings if l["id"] == listing_id), None)
        if not listing:
            raise HTTPException(404, f"active listing {listing_id} not found")
        return services.cancel_listing(db, seller=listing["seller"],
                                        listing_id=listing_id)
    except ChainNotConnected as exc:
        _chain_error(exc)

@router.post("/retire")
def retire(body: RetireRequest, db: Session = Depends(get_db)):
    try:
        actor = body.actor or _account(DEFAULT_BUYER_INDEX)
        return services.retire_credits(db, actor=actor, amount=body.amount,
                                        reason=body.reason)
    except (ChainNotConnected, ContractError) as exc:
        _chain_error(exc)
