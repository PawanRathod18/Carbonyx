import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from .. import config
from ..blockchain import bridge, ChainNotConnected
from ..db import Base
from ..models import utcnow
from .projects import get_db
from .verification import _acting_role, issue_role_token

import sqlalchemy as sa

router = APIRouter(prefix="/api/auth", tags=["auth"])

PBKDF2_ITERATIONS = 120_000

class User(Base):
    __tablename__ = "users"

    id = sa.Column(sa.Integer, primary_key=True)
    name = sa.Column(sa.String(120), nullable=False)
    email = sa.Column(sa.String(200), unique=True, nullable=False)
    password_hash = sa.Column(sa.String(200), nullable=False)
    salt = sa.Column(sa.String(40), nullable=False)
    wallet_address = sa.Column(sa.String(42), nullable=True)
    role = sa.Column(sa.String(30), default="trader")
    created_at = sa.Column(sa.DateTime, default=utcnow)

class SessionToken(Base):
    __tablename__ = "sessions"

    token = sa.Column(sa.String(64), primary_key=True)
    user_id = sa.Column(sa.Integer, nullable=False, index=True)
    created_at = sa.Column(sa.DateTime, default=utcnow)

class SignupRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

def _hash(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS).hex()

def _next_wallet(db: Session) -> str | None:
    try:
        accounts = bridge.accounts()
        pool = accounts[2:] or accounts
    except ChainNotConnected:
        return None
    taken = {u.wallet_address for u in db.query(User).all()}
    for addr in pool:
        if addr not in taken:
            return addr
    return pool[0]

def _user_public(db: Session, user: User) -> dict:
    return {
        "id": user.id, "name": user.name, "email": user.email,
        "wallet_address": user.wallet_address, "role": user.role,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }

def _create_session(db: Session, user: User) -> str:
    token = secrets.token_hex(24)
    db.add(SessionToken(token=token, user_id=user.id))
    db.commit()
    return token

def user_for_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    row = db.query(SessionToken).filter_by(token=token).first()
    if not row:
        return None
    return db.get(User, row.user_id)

@router.post("/signup")
def signup(body: SignupRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter_by(email=body.email.lower()).first()
    if existing:
        raise HTTPException(409, "An account with this email already exists")
    salt = secrets.token_hex(12)
    user = User(
        name=body.name, email=body.email.lower(),
        password_hash=_hash(body.password, salt), salt=salt,
        wallet_address=_next_wallet(db))
    db.add(user)
    db.commit()
    token = _create_session(db, user)
    return {"token": token, "user": _user_public(db, user)}

@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=body.email.lower()).first()
    if not user or user.password_hash != _hash(body.password, user.salt):
        raise HTTPException(401, "Invalid email or password")
    token = _create_session(db, user)
    return {"token": token, "user": _user_public(db, user)}

@router.post("/logout")
def logout(request: Request, db: Session = Depends(get_db)):
    token = request.headers.get("X-Auth-Token")
    if token:
        db.query(SessionToken).filter_by(token=token).delete()
        db.commit()
    return {"ok": True}

@router.get("/me")
def me(request: Request, db: Session = Depends(get_db)):
    user = user_for_token(db, request.headers.get("X-Auth-Token"))
    if not user:
        raise HTTPException(401, "not signed in")
    return _user_public(db, user)

async def auth_middleware(request, call_next):
    if config.REQUIRE_AUTH and request.method not in ("GET", "HEAD", "OPTIONS") \
            and not request.url.path.startswith("/api/auth"):
        token = request.headers.get("X-Auth-Token")
        db = SessionLocal()
        try:
            if not user_for_token(db, token):
                return JSONResponse({"detail": "sign in required "
                                    "(CARBONYX_REQUIRE_AUTH is on)"}, status_code=401)
        finally:
            db.close()
    return await call_next(request)

def install(app):
    from ..db import engine
    Base.metadata.create_all(engine)
    app.middleware("http")(auth_middleware)

class RoleUnlockRequest(BaseModel):
    address: str
    password: str

@router.post("/unlock")
def unlock_role(body: RoleUnlockRequest, db: Session = Depends(get_db)):
    role = _acting_role(body.address)
    expected = config.ROLE_PASSWORDS.get(role)
    if expected is None:
        raise HTTPException(403, "This account does not require a password")
    if not secrets.compare_digest(body.password, expected):
        raise HTTPException(401, f"Wrong password for the {role} account")
    return {"ok": True, "role": role, "token": issue_role_token(body.address)}
