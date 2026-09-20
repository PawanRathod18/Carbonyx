import json
import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"
DATA_DIR = BACKEND_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "carbonyx.db"
DEPLOY_FILE = APP_DIR / "deployed.json"

RPC_URL = os.environ.get("CARBONYX_RPC_URL", "http://127.0.0.1:8545")
CHAIN_ID = int(os.environ.get("CARBONYX_CHAIN_ID", "31337"))

GEE_MODE = os.environ.get("CARBONYX_GEE_MODE", "sim")
EE_KEY_FILE = os.environ.get("CARBONYX_EE_KEY", "")

REQUIRE_AUTH = os.environ.get("CARBONYX_REQUIRE_AUTH", "false").lower() == "true"

ROLE_PASSWORDS = {
    "Platform Admin": os.environ.get("CARBONYX_ADMIN_PASSWORD", "carbonyx-admin"),
    "Verifier": os.environ.get("CARBONYX_VERIFIER_PASSWORD", "carbonyx-verify"),
}
ROLE_TOKEN_TTL = int(os.environ.get("CARBONYX_ROLE_TOKEN_TTL", "3600"))

EMBEDDED_CHAIN = os.environ.get("CARBONYX_EMBEDDED_CHAIN", "true").lower() != "false"

MINT_BUFFER = float(os.environ.get("CARBONYX_MINT_BUFFER", "0.90"))
PROJECTION_YEARS = int(os.environ.get("CARBONYX_PROJECTION_YEARS", "20"))

def load_deployment() -> dict | None:
    if not DEPLOY_FILE.exists():
        return None
    try:
        return json.loads(DEPLOY_FILE.read_text())
    except json.JSONDecodeError:
        return None
