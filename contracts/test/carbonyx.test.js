const { expect } = require("chai");
const { ethers } = require("hardhat");

const BOUNDS = "88.85,21.55,89.15,21.95";

describe("CARBONYX contracts", function () {
  let registry, credit, market;
  let admin, verifier, owner, buyer;

  beforeEach(async function () {
    [admin, verifier, owner, buyer] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("CarbonyxProjectRegistry");
    registry = await Registry.deploy();

    const Credit = await ethers.getContractFactory("CarbonyxCredit");
    credit = await Credit.deploy(await registry.getAddress());

    const Market = await ethers.getContractFactory("CarbonyxMarketplace");
    market = await Market.deploy(await credit.getAddress(), admin.address);

    await registry.setCreditContract(await credit.getAddress());
    await registry.grantVerifier(verifier.address);
  });

  async function registerAndVerify() {
    await registry.connect(owner).registerProject(
      "Sundarbans", "mangrove", "India", BOUNDS, 120_000
    );
    await registry.connect(verifier).verifyProject(1, "0xreport");
  }

  it("registers a project with pending status", async function () {
    await expect(
      registry.connect(owner).registerProject(
        "Sundarbans", "mangrove", "India", BOUNDS, 120_000
      )
    ).to.emit(registry, "ProjectRegistered");

    const p = await registry.projects(1);
    expect(p.name).to.equal("Sundarbans");
    expect(p.ecosystem).to.equal("mangrove");
    expect(p.owner).to.equal(owner.address);
    expect(p.status).to.equal(0n); // Status.Pending
  });

  it("rejects verification from a non-verifier", async function () {
    await registry.connect(owner).registerProject(
      "Sundarbans", "mangrove", "India", BOUNDS, 120_000
    );
    await expect(
      registry.connect(owner).verifyProject(1, "0xreport")
    ).to.be.revertedWith("registry: verifier only");
  });

  it("verifier can approve and anchor the report hash", async function () {
    await registry.connect(owner).registerProject(
      "Sundarbans", "mangrove", "India", BOUNDS, 120_000
    );
    await expect(
      registry.connect(verifier).verifyProject(1, "0xreport")
    ).to.emit(registry, "ProjectVerified");

    const p = await registry.projects(1);
    expect(p.status).to.equal(1n); // Status.Verified
    expect(p.reportHash).to.equal("0xreport");
  });

  it("cannot mint credits for an unverified project", async function () {
    await registry.connect(owner).registerProject(
      "Sundarbans", "mangrove", "India", BOUNDS, 120_000
    );
    await expect(
      credit.connect(owner).mintProjectCredits(1, 500, "0xreport")
    ).to.be.revertedWith("credit: project not verified");
  });

  it("only the project owner can mint", async function () {
    await registerAndVerify();
    await expect(
      credit.connect(buyer).mintProjectCredits(1, 500, "0xreport")
    ).to.be.revertedWith("credit: only the project owner");
  });

  it("cannot mint twice for the same project", async function () {
    await registerAndVerify();
    await credit.connect(owner).mintProjectCredits(1, 500, "0xreport");
    await expect(
      credit.connect(owner).mintProjectCredits(1, 500, "0xreport")
    ).to.be.revertedWith("credit: credits already minted");
  });

  it("full lifecycle: mint -> trade -> retire", async function () {
    await registerAndVerify();

    // mint
    await expect(
      credit.connect(owner).mintProjectCredits(1, 500, "0xreport")
    ).to.emit(credit, "CreditsMinted");
    expect(await credit.balanceOf(owner.address)).to.equal(500);

    // the registry records the mint
    expect((await registry.projects(1)).creditsMinted).to.equal(500n);

    // list on the marketplace (approve + list)
    await credit.connect(owner).approve(await market.getAddress(), 500);
    await expect(
      market.connect(owner).list(1, 100, ethers.parseEther("0.01"))
    ).to.emit(market, "Listed");

    // buy
    const cost = 100n * ethers.parseEther("0.01");
    await expect(
      market.connect(buyer).buy(1, { value: cost })
    ).to.emit(market, "Purchased");
    expect(await credit.balanceOf(buyer.address)).to.equal(100);

    // retire
    await expect(
      credit.connect(buyer).retire(40, "corporate offsetting")
    ).to.emit(credit, "CreditsRetired");
    expect(await credit.balanceOf(buyer.address)).to.equal(60);
    expect(await credit.totalSupply()).to.equal(460);
  });

  it("rejects purchases with insufficient payment", async function () {
    await registerAndVerify();
    await credit.connect(owner).mintProjectCredits(1, 500, "0xreport");
    await credit.connect(owner).approve(await market.getAddress(), 500);
    await market.connect(owner).list(1, 100, ethers.parseEther("0.01"));

    await expect(
      market.connect(buyer).buy(1, { value: ethers.parseEther("0.001") })
    ).to.be.revertedWith("market: insufficient payment");
  });

  it("seller can cancel a listing and recover the credits", async function () {
    await registerAndVerify();
    await credit.connect(owner).mintProjectCredits(1, 500, "0xreport");
    await credit.connect(owner).approve(await market.getAddress(), 500);
    await market.connect(owner).list(1, 100, ethers.parseEther("0.01"));

    await expect(market.connect(owner).cancel(1)).to.emit(market, "Cancelled");
    expect(await credit.balanceOf(owner.address)).to.equal(500);
  });

  it("only the seller can cancel a listing", async function () {
    await registerAndVerify();
    await credit.connect(owner).mintProjectCredits(1, 500, "0xreport");
    await credit.connect(owner).approve(await market.getAddress(), 500);
    await market.connect(owner).list(1, 100, ethers.parseEther("0.01"));

    await expect(
      market.connect(buyer).cancel(1)
    ).to.be.revertedWith("market: not the seller");
  });
});
