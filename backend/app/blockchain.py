import json
import logging
import threading

from web3 import Web3
from web3.exceptions import Web3Exception

from . import config

log = logging.getLogger("carbonyx.chain")

SETUP_HINT = (
    "Blockchain not reachable. Start the Hardhat node and deploy the "
    "contracts first:  cd contracts && npx hardhat node  (terminal 1),  "
    "then  npx hardhat run scripts/deploy.js --network localhost  "
    "(terminal 2),  then restart the backend."
)

class ChainNotConnected(Exception):
    pass

class ContractError(Exception):
    pass

def _signed_raw(w3, tx, private_key):
    signed = w3.eth.account.sign_transaction(tx, private_key)
    raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction")
    return raw

class ChainBridge:

    def __init__(self):
        self._lock = threading.Lock()

        self.w3: Web3 | None = None
        self._keys: dict[str, str] = {}
        self.registry = None
        self.credit = None
        self.market = None
        self._embedded = False

    def connect(self) -> bool:
        self.w3 = None
        self.registry = self.credit = self.market = None
        self._keys = {}
        self._embedded = False

        deployment = config.load_deployment()
        if deployment:
            w3 = Web3(Web3.HTTPProvider(config.RPC_URL,
                                        request_kwargs={"timeout": 1}))
            try:
                if w3.is_connected():
                    return self._connect_to(w3, deployment)
            except Exception:
                pass

        if config.EMBEDDED_CHAIN:
            return self._start_embedded()
        return False

    def _connect_to(self, w3, deployment) -> bool:

        net = (deployment.get("networks") or {}).get("localhost") or {}
        try:
            self.registry = w3.eth.contract(
                address=Web3.to_checksum_address(net["registry"]["address"]),
                abi=net["registry"]["abi"])
            self.credit = w3.eth.contract(
                address=Web3.to_checksum_address(net["credit"]["address"]),
                abi=net["credit"]["abi"])
            self.market = w3.eth.contract(
                address=Web3.to_checksum_address(net["marketplace"]["address"]),
                abi=net["marketplace"]["abi"])
        except (KeyError, TypeError, ValueError):
            return False

        for acc in deployment.get("accounts") or []:
            self._keys[Web3.to_checksum_address(acc["address"]).lower()] = acc["private_key"]

        self.w3 = w3
        return True

    def _load_artifact(self, name: str):
        import json as _json
        art = (config.PROJECT_ROOT / "contracts" / "artifacts" / "contracts"
               / f"{name}.sol" / f"{name}.json")
        data = _json.loads(art.read_text())
        return data["abi"], data["bytecode"]

    def _start_embedded(self) -> bool:
        try:
            from eth_tester import EthereumTester
            from web3.providers.eth_tester import EthereumTesterProvider
        except ImportError:
            log.warning("eth-tester not installed - embedded chain disabled")
            return False
        try:
            tester = EthereumTester()
            w3 = Web3(EthereumTesterProvider(tester))
            accounts = tester.get_accounts()
            keys = [k.to_hex() if hasattr(k, "to_hex") else "0x" + bytes(k).hex()
                    for k in tester.backend.account_keys]

            def deploy(name, *args):
                abi, bytecode = self._load_artifact(name)
                factory = w3.eth.contract(abi=abi, bytecode=bytecode)
                tx = factory.constructor(*args).build_transaction({
                    "from": accounts[0],
                    "nonce": w3.eth.get_transaction_count(accounts[0]),
                    "gas": 4_000_000,
                    "gasPrice": 10 ** 9,
                    "chainId": w3.eth.chain_id,
                })
                tx_hash = w3.eth.send_transaction(tx)
                receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
                assert receipt["status"] == 1, f"{name} deployment reverted"
                return w3.eth.contract(address=receipt.contractAddress, abi=abi)

            self.registry = deploy("CarbonyxProjectRegistry")
            self.credit = deploy("CarbonyxCredit", self.registry.address)
            self.market = deploy("CarbonyxMarketplace",
                                 self.credit.address, accounts[0])

            for fn in (self.registry.functions.setCreditContract(self.credit.address),
                       self.registry.functions.grantVerifier(accounts[1])):
                tx = fn.build_transaction({
                    "from": accounts[0],
                    "nonce": w3.eth.get_transaction_count(accounts[0]),
                    "gas": 1_000_000,
                    "gasPrice": 10 ** 9,
                    "chainId": w3.eth.chain_id,
                })
                w3.eth.send_transaction(tx)

            self._keys = {Web3.to_checksum_address(a).lower(): k
                          for a, k in zip(accounts, keys)}
            self.w3 = w3
            self._embedded = True
            log.info("embedded Python chain started (eth-tester/py-evm)")
            return True
        except Exception as exc:
            log.warning("embedded chain failed to start: %s", exc)
            return False

    def warmup(self):
        with self._lock:
            if not self.w3:
                self.connect()

    def ensure(self):
        if self.w3:
            return
        with self._lock:
            if not self.w3:
                ok = self.connect()
                if not ok:
                    raise ChainNotConnected(SETUP_HINT)

    def accounts(self) -> list[str]:
        self.ensure()
        return list(self._keys.keys())

    def _actor(self, actor: str | None) -> tuple[str, str]:
        self.ensure()
        if actor is None:
            actor = next(iter(self._keys))
        key = self._keys.get(str(actor).lower())
        if key is None:
            raise ContractError(f"unknown actor {actor} (not a dev account)")
        return Web3.to_checksum_address(actor), key

    def _send(self, fn, actor: str | None, value: int = 0):
        w3 = self.w3
        address, key = self._actor(actor)
        nonce = w3.eth.get_transaction_count(address)
        tx = fn.build_transaction({
            "from": address,
            "nonce": nonce,
            "value": value,
            "gas": 1_500_000,
            "gasPrice": w3.eth.gas_price,
            "chainId": w3.eth.chain_id,
        })
        try:
            tx_hash = w3.eth.send_raw_transaction(_signed_raw(w3, tx, key))
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
        except Web3Exception as exc:
            raise ContractError(f"chain rejected the transaction: {exc}") from exc
        except ValueError as exc:
            raise ContractError(f"chain rejected the transaction: {exc}") from exc
        if receipt["status"] != 1:
            raise ContractError("transaction reverted on chain")
        return receipt

    def parse_events(self, receipt, contract, names: list[str]) -> list[dict]:
        events = []
        for name in names:
            try:
                codec = getattr(contract.events, name)
                for ev in codec().process_receipt(receipt):
                    args = {}
                    for k, v in dict(ev["args"]).items():
                        if v is not None and not isinstance(v, (int, float, bool, str)):
                            v = str(v)
                        args[k] = v
                    events.append({"event": name, "args": args})
            except (AttributeError, KeyError, TypeError):
                continue
        return events

    def status(self) -> dict:
        connected = False
        block = None
        chain_id = None
        try:
            self.ensure()
            if self.w3:
                connected = True
                block = self.w3.eth.block_number
                chain_id = self.w3.eth.chain_id
        except Exception:
            pass
        deployment = config.load_deployment()
        return {
            "connected": connected,
            "embedded": bool(getattr(self, "_embedded", False)),
            "chain_id": chain_id,
            "block_number": block,
            "deployed": bool(deployment) or bool(getattr(self, "_embedded", False)),
            "contracts": {
                "registry": self.registry.address if self.registry else None,
                "credit": self.credit.address if self.credit else None,
                "marketplace": self.market.address if self.market else None,
            },
        }

    def balances(self, address: str) -> dict:
        self.ensure()
        addr = Web3.to_checksum_address(address)
        return {
            "eth": float(Web3.from_wei(self.w3.eth.get_balance(addr), "ether")),
            "cbx": self.credit.functions.balanceOf(addr).call(),
        }

    def get_project(self, project_id: int) -> dict:
        self.ensure()
        (pid, name, ecosystem, country, bounds, area_ha, owner, status,
         report_hash, verified_at, credits_minted) = \
            self.registry.functions.projects(project_id).call()
        return {
            "id": pid, "name": name, "ecosystem": ecosystem, "country": country,
            "bounds": bounds, "area_ha": area_ha, "owner": owner,
            "status": ["pending", "verified", "rejected"][status],
            "report_hash": report_hash, "verified_at": verified_at,
            "credits_minted": credits_minted,
        }

    def marketplace_listings(self) -> list[dict]:
        self.ensure()
        count = self.market.functions.listingCount().call()
        out = []
        for lid in range(1, count + 1):
            (lid_, project_id, seller, amount, price, active) = \
                self.market.functions.listing(lid).call()
            if not active:
                continue
            out.append({
                "id": lid_, "project_id": project_id, "seller": seller,
                "amount": amount, "price_per_credit_wei": price,
                "price_per_credit_eth": float(Web3.from_wei(price, "ether")),
            })
        return out

    def register_project(self, actor, name, ecosystem, country, bounds, area_ha):
        fn = self.registry.functions.registerProject(
            name, ecosystem, country, bounds, int(area_ha))
        receipt = self._send(fn, actor)
        events = self.parse_events(receipt, self.registry,
                                   ["ProjectRegistered"])
        return receipt, events

    def verify_project(self, actor, project_id, report_hash):
        fn = self.registry.functions.verifyProject(project_id, report_hash)
        return self._send(fn, actor)

    def reject_project(self, actor, project_id, reason):
        fn = self.registry.functions.rejectProject(project_id, reason)
        return self._send(fn, actor)

    def mint_credits(self, actor, project_id, amount, report_hash):
        fn = self.credit.functions.mintProjectCredits(
            project_id, int(amount), report_hash)
        return self._send(fn, actor)

    def retire_credits(self, actor, amount, reason):
        fn = self.credit.functions.retire(int(amount), reason or "")
        return self._send(fn, actor)

    def list_credits(self, actor, project_id, amount, price_wei):
        self.ensure()

        self._send(self.credit.functions.approve(self.market.address, int(amount)), actor)

        fn = self.market.functions.list(int(project_id), int(amount), int(price_wei))
        return self._send(fn, actor)

    def buy_listing(self, actor, listing_id):
        self.ensure()
        listing = self.market.functions.listing(listing_id).call()
        amount, price = listing[3], listing[4]
        cost = amount * price
        fn = self.market.functions.buy(listing_id)
        return self._send(fn, actor, value=cost)

    def cancel_listing(self, actor, listing_id):
        fn = self.market.functions.cancel(listing_id)
        return self._send(fn, actor)

bridge = ChainBridge()
