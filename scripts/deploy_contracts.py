import json
import sys
from pathlib import Path

from eth_account import Account
from web3 import Web3

Account.enable_unaudited_hdwallet_features()

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app import config

MNEMONIC = "test test test test test test test test test test test junk"
ACCOUNTS = 10

def load_artifact(name: str):
    art_path = (ROOT / "contracts" / "artifacts" / "contracts"
                / f"{name}.sol" / f"{name}.json")
    art = json.loads(art_path.read_text())
    return art["abi"], art["bytecode"]

def build_and_send(w3, account, contract_factory, *args):
    tx = contract_factory.constructor(*args).build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "gas": 3_000_000,
        "gasPrice": w3.eth.gas_price,
        "chainId": w3.eth.chain_id,
    })
    signed = account.sign_transaction(tx)
    raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction
    tx_hash = w3.eth.send_raw_transaction(raw)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
    assert receipt["status"] == 1, "deployment transaction reverted"
    return receipt.contractAddress

def send_call(w3, account, fn):
    tx = fn.build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "gas": 500_000,
        "gasPrice": w3.eth.gas_price,
        "chainId": w3.eth.chain_id,
    })
    signed = account.sign_transaction(tx)
    raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction
    tx_hash = w3.eth.send_raw_transaction(raw)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
    assert receipt["status"] == 1, "setup transaction reverted"

def main():
    w3 = Web3(Web3.HTTPProvider(config.RPC_URL,
                               request_kwargs={"timeout": 10}))
    if not w3.is_connected():
        print(f"ERROR: cannot reach the chain at {config.RPC_URL}")
        print("Start the Hardhat node first:  cd contracts && npx hardhat node")
        sys.exit(1)

    accounts = [
        Account.from_mnemonic(MNEMONIC, account_path=f"m/44'/60'/0'/0/{i}")
        for i in range(ACCOUNTS)
    ]
    admin, verifier = accounts[0], accounts[1]

    print("Deploying CARBONYX contracts")
    print("  admin    :", admin.address)
    print("  verifier :", verifier.address)

    reg_abi, reg_byte = load_artifact("CarbonyxProjectRegistry")
    crd_abi, crd_byte = load_artifact("CarbonyxCredit")
    mkt_abi, mkt_byte = load_artifact("CarbonyxMarketplace")

    registry = w3.eth.contract(abi=reg_abi, bytecode=reg_byte)
    credit = w3.eth.contract(abi=crd_abi, bytecode=crd_byte)
    market = w3.eth.contract(abi=mkt_abi, bytecode=mkt_byte)

    registry_addr = build_and_send(w3, admin, registry)
    print("  CarbonyxProjectRegistry :", registry_addr)
    credit_addr = build_and_send(w3, admin, credit, registry_addr)
    print("  CarbonyxCredit          :", credit_addr)
    market_addr = build_and_send(w3, admin, market, credit_addr, admin.address)
    print("  CarbonyxMarketplace     :", market_addr)

    registry = w3.eth.contract(address=registry_addr, abi=reg_abi)
    send_call(w3, admin, registry.functions.setCreditContract(credit_addr))
    send_call(w3, admin, registry.functions.grantVerifier(verifier.address))
    print("  wiring complete (credit contract set, verifier granted)")

    manifest = {
        "network": "localhost",
        "chain_id": w3.eth.chain_id,
        "deployed_at": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc).isoformat(),
        "warning": " ".join([
            "DEVELOPMENT MANIFEST. The accounts below are the well-known",
            "deterministic Hardhat accounts and are NOT secret. Never use",
            "them on a public network; in production, users sign",
            "transactions with their own wallets (e.g. MetaMask)."
        ]),
        "networks": {
            "localhost": {
                "registry": {"address": registry_addr, "abi": reg_abi},
                "credit": {"address": credit_addr, "abi": crd_abi},
                "marketplace": {"address": market_addr, "abi": mkt_abi},
            },
        },
        "accounts": [
            {"address": a.address, "private_key": a.key.hex()}
            for a in accounts
        ],
    }

    out = config.DEPLOY_FILE
    out.write_text(json.dumps(manifest, indent=2))
    print(f"\nManifest written to {out}")
    print("Start the backend next:  cd backend && python run.py")

if __name__ == "__main__":
    main()
