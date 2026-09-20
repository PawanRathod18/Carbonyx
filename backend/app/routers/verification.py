import secrets
import time

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .. import config, services
from ..blockchain import ChainNotConnected, ContractError, bridge
from ..models import Project
from ..schemas import MintRequest, VerifyRequest
from .misc import ROLE_LABELS
from .projects import _chain_error, _project_or_404, get_db

router = APIRouter(prefix="/api/projects", tags=["verification"])

ROLE_TOKENS: dict[str, dict] = {}

def issue_role_token(address: str) -> str:
    token = secrets.token_hex(24)
    now = time.time()
    for k, v in list(ROLE_TOKENS.items()):
        if v["expires"] < now:
            ROLE_TOKENS.pop(k, None)
    ROLE_TOKENS[token] = {"address": address.lower(),
                          "expires": now + config.ROLE_TOKEN_TTL}
    return token

def role_token_valid(address: str | None, token: str | None) -> bool:
    if not address or not token:
        return False
    t = ROLE_TOKENS.get(token)
    return bool(t and t["address"] == address.lower() and t["expires"] > time.time())

VERIFY_ROLES = {"Verifier"}
MINT_ROLES = {"Project Owner"}

def _acting_role(x_account: str | None) -> str | None:
    if not x_account:
        return None
    try:
        for i, addr in enumerate(bridge.accounts()):
            if addr.lower() == x_account.lower():
                return ROLE_LABELS.get(i, ("User", ""))[0]
    except Exception:
        return None
    return None

@router.post("/{project_id}/verify")
def verify(project_id: int, body: VerifyRequest, db: Session = Depends(get_db),
           x_account: str | None = Header(default=None, alias="X-Account"),
           x_role_token: str | None = Header(default=None, alias="X-Role-Token")):
    role = _acting_role(x_account)
    if role not in VERIFY_ROLES:
        raise HTTPException(
            403, "Verifier role required - only the independent Verifier "
                 "account can approve or reject reports.")
    if role in config.ROLE_PASSWORDS and not role_token_valid(x_account, x_role_token):
        raise HTTPException(
            403, "Password unlock required for this role - enter the role "
                 "password to continue")
    project = _project_or_404(db, project_id)
    try:
        services.verify_project(db, project, decision=body.decision,
                                note=body.note, verifier=x_account)
    except (ChainNotConnected, ContractError) as exc:
        _chain_error(exc)
    return services.serialize_project(db, project)

@router.post("/{project_id}/mint")
def mint(project_id: int, body: MintRequest | None = None,
         db: Session = Depends(get_db),
         x_account: str | None = Header(default=None, alias="X-Account"),
         x_role_token: str | None = Header(default=None, alias="X-Role-Token")):
    role = _acting_role(x_account)
    if role not in MINT_ROLES:
        raise HTTPException(
            403, "Project Owner role required - only the account that "
                 "registered the project can mint credits.")
    if role in config.ROLE_PASSWORDS and not role_token_valid(x_account, x_role_token):
        raise HTTPException(
            403, "Password unlock required for this role - enter the role "
                 "password to continue")
    project = _project_or_404(db, project_id)
    try:
        result = services.mint_credits(db, project, owner=(body.owner if body else None))
    except (ChainNotConnected, ContractError) as exc:
        _chain_error(exc)
    out = services.serialize_project(db, project)
    out["mint"] = result
    return out
