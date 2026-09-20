/**
 * Deploys the three CARBONYX contracts to the local Hardhat node, wires them
 * together, and writes a manifest (addresses + ABIs + dev accounts) to
 * backend/app/deployed.json which the FastAPI backend loads at startup.
 *
 * Usage:
 *   npx hardhat node                                  (terminal 1)
 *   npx hardhat run scripts/deploy.js --network localhost   (terminal 2)
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const MNEMONIC = "test test test test test test test test test test test junk";

function readAbi(contractName) {
  const p = path.join(
    __dirname, "..", "artifacts", "contracts",
    `${contractName}.sol`, `${contractName}.json`
  );
  return JSON.parse(fs.readFileSync(p, "utf8")).abi;
}

function deriveAccounts() {
  const accounts = [];
  for (let i = 0; i < 10; i++) {
    const w = hre.ethers.HDNodeWallet.fromPhrase(
      MNEMONIC, `m/44'/60'/0'/0/${i}`
    );
    accounts.push({ address: w.address, private_key: w.privateKey });
  }
  return accounts;
}

async function main() {
  const [admin, verifier] = await hre.ethers.getSigners();
  console.log("Deploying CARBONYX contracts");
  console.log("  admin    :", admin.address);
  console.log("  verifier :", verifier.address);

  const Registry = await hre.ethers.getContractFactory("CarbonyxProjectRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  const Credit = await hre.ethers.getContractFactory("CarbonyxCredit");
  const credit = await Credit.deploy(await registry.getAddress());
  await credit.waitForDeployment();

  const Market = await hre.ethers.getContractFactory("CarbonyxMarketplace");
  const market = await Market.deploy(await credit.getAddress(), admin.address);
  await market.waitForDeployment();

  // wire contracts together
  await (await registry.setCreditContract(await credit.getAddress())).wait();
  await (await registry.grantVerifier(verifier.address)).wait();

  const registryAddr = await registry.getAddress();
  const creditAddr = await credit.getAddress();
  const marketAddr = await market.getAddress();

  console.log("\nDeployed:");
  console.log("  CarbonyxProjectRegistry :", registryAddr);
  console.log("  CarbonyxCredit         :", creditAddr);
  console.log("  CarbonyxMarketplace    :", marketAddr);

  const manifest = {
    network: "localhost",
    chain_id: 31337,
    deployed_at: new Date().toISOString(),
    warning: [
      "DEVELOPMENT MANIFEST. The accounts below are the well-known",
      "deterministic Hardhat accounts and are NOT secret. Never use them",
      "on a public network; in production, users sign transactions with",
      "their own wallets (e.g. MetaMask)."
    ].join(" "),
    networks: {
      localhost: {
        registry: { address: registryAddr, abi: readAbi("CarbonyxProjectRegistry") },
        credit: { address: creditAddr, abi: readAbi("CarbonyxCredit") },
        marketplace: { address: marketAddr, abi: readAbi("CarbonyxMarketplace") },
      },
    },
    accounts: deriveAccounts(),
  };

  const outPath = path.join(__dirname, "..", "..", "backend", "app", "deployed.json");
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest written to ${outPath}`);
  console.log("You can now start the backend:  cd ../backend && python run.py");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
