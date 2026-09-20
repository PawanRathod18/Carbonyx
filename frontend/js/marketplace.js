"use strict";

let currentListings = [];

const DEMO_LISTINGS = [
  { id: 101, project_name: "Pichavaram Mangrove Conservation", ecosystem: "mangrove", seller: "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf", amount: 500, price_per_credit_eth: 0.012, total_cost_eth: 6.0 },
  { id: 102, project_name: "Chilika Lake Seagrass Restoration", ecosystem: "seagrass", seller: "0x2b5ad5c4795c026514f8317c69a2154de1e29a9b", amount: 320, price_per_credit_eth: 0.010, total_cost_eth: 3.2 },
  { id: 103, project_name: "Wadden Sea Salt Marsh Pilot", ecosystem: "saltmarsh", seller: "0x6813eb9362372eef6200f3b1dbc3f819671cba69", amount: 180, price_per_credit_eth: 0.015, total_cost_eth: 2.7 },
  { id: 104, project_name: "Sundarbans Mangrove Project", ecosystem: "mangrove", seller: "0x1ef8cc5e00b8e1b1c3a6e2c5f7d8a9b0c1d2e3f4a", amount: 750, price_per_credit_eth: 0.011, total_cost_eth: 8.25 },
];

async function initMarketplace() {
  $("#btn-list")?.addEventListener("click", doList);
  $("#btn-retire")?.addEventListener("click", doRetire);
  await renderMarketplace();
}

async function renderMarketplace() {
  let listings, projects;
  try {
    [listings, projects] = await Promise.all([
      api("/api/marketplace"), api("/api/projects"),
    ]);
  } catch {

    listings = DEMO_LISTINGS;
    projects = [];
    toast("Backend offline - showing demo listings. Cart and checkout still work.");
  }
  currentListings = listings;

  const minted = projects.filter((p) => p.status === "minted");
  const sel = $("#m-project");
  if (sel) {
    sel.innerHTML = minted.length
      ? minted.map((p) => `<option value="${p.chain_id}">${escapeHtml(p.name)} (#${p.chain_id})</option>`).join("")
      : `<option value="">- mint credits first -</option>`;
  }

  const body = $("#listings-body");
  if (!body) return;
  body.innerHTML = listings.map((l, i) => `
    <tr style="--i:${i}">
      <td class="mono">#${l.id}</td>
      <td>${escapeHtml(l.project_name)}</td>
      <td>${l.ecosystem}</td>
      <td class="mono">${short(l.seller)}</td>
      <td><b>${fmt(l.amount)}</b> tCO\u2082e</td>
      <td>${l.price_per_credit_eth} ETH</td>
      <td>${l.total_cost_eth} ETH</td>
      <td>
        <button class="btn primary small" data-act="cart" data-id="${l.id}">Add to cart</button>
        <button class="btn ghosty small" data-act="buy" data-id="${l.id}">Buy now</button>
        <button class="btn ghosty small" data-act="cancel" data-id="${l.id}">Cancel</button>
      </td>
    </tr>`).join("");
  $("#listings-empty").style.display = listings.length ? "none" : "block";
  $("#listings-table").style.display = listings.length ? "table" : "none";

  body.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.onclick = () => {
      const id = Number(btn.dataset.id);
      if (btn.dataset.act === "cart") doAddToCart(id);
      if (btn.dataset.act === "buy") doBuy(id, btn);
      if (btn.dataset.act === "cancel") doCancel(id, btn);
    };
  });
}

function doAddToCart(id) {
  const l = currentListings.find((x) => x.id === id);
  if (!l) return toast("Listing not found.", true);
  Cart.add({
    id: l.id,
    project_name: l.project_name,
    ecosystem: l.ecosystem,
    amount: l.amount,
    price_per_credit_eth: l.price_per_credit_eth,
    total_cost_eth: l.total_cost_eth,
    seller: l.seller,
  });
}

async function doList() {
  const projectId = parseInt($("#m-project").value, 10);
  const amount = parseInt($("#m-amount").value, 10);
  const price = parseFloat($("#m-price").value);
  if (!projectId) return toast("Select a project with minted credits.", true);
  const btn = $("#btn-list");
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Listing...';
  try {
    const res = await api("/api/marketplace/list", {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId, amount, price_per_credit_eth: price,
        seller: actorByRole("owner"),
      }),
    });
    toast(`Listing #${res.listing_id} created.`);
    renderMarketplace();
  } catch (e) { toast(e.message, true); }
  btn.disabled = false; btn.textContent = "Create listing";
}

async function doBuy(id, btn) {
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    const res = await api(`/api/marketplace/listings/${id}/buy`, {
      method: "POST",
      body: JSON.stringify({ buyer: actorByRole("buyer") }),
    });
    toast(`Purchase complete - ${shortTx(res.tx_hash)}`);
    renderMarketplace();
    refreshHeader();
  } catch (e) { toast(e.message, true); btn.disabled = false; btn.textContent = "Buy now"; }
}

async function doCancel(id, btn) {
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    await api(`/api/marketplace/listings/${id}/cancel`, { method: "POST" });
    toast(`Listing #${id} cancelled, credits returned.`);
    renderMarketplace();
  } catch (e) { toast(e.message, true); btn.disabled = false; btn.textContent = "Cancel"; }
}

async function doRetire() {
  const amount = parseInt($("#r-amount").value, 10);
  const reason = $("#r-reason").value || "voluntary offset";
  const actor = actorByRole("buyer");
  const btn = $("#btn-retire");
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Retiring...';
  try {
    const res = await api("/api/marketplace/retire", {
      method: "POST",
      body: JSON.stringify({ amount, reason, actor }),
    });
    toast(`Retired ${res.retired} credits permanently.`);
    refreshHeader();
    showRetirementCertificate({ amount: res.retired, reason, actor, txHash: res.tx_hash });
  } catch (e) { toast(e.message, true); }
  btn.disabled = false; btn.textContent = "Retire permanently";
}

function showRetirementCertificate({ amount, reason, actor, txHash }) {
  const date = new Date().toISOString().slice(0, 19).replace("T", " ");
  let qrHtml = "";
  try {
    const qr = qrcode(0, "M");
    qr.addData(`CARBONYX RETIREMENT|${txHash}|${amount}tCO2e|${actor}`);
    qr.make();
    qrHtml = `<div class="qr"><canvas id="cert-qr"></canvas>
      <div class="note">Scan to verify on-chain:<br><span class="mono">${shortTx(txHash)}</span><br>
      Certificate generated ${date} UTC</div></div>`;
    setTimeout(() => {
      const c = document.getElementById("cert-qr");
      if (c) drawQrCanvas(c, qr);
    }, 50);
  } catch {   }

  const modal = $("#modal");
  $("#modal-title").textContent = "Certificate of retirement";
  $("#modal-body").innerHTML = `
    <div class="cert">
      <div class="cert-brand">
        <svg viewBox="0 0 48 48" width="30" height="30"><path d="M4 30c6-2 10-8 12-14 3 8 7 12 14 14-7 3-11 7-14 12-3-5-7-9-12-12z" fill="#38bdf8"/></svg>
        CARBONYX
      </div>
      <h2>Certificate of carbon retirement</h2>
      <p class="sub">This certifies the permanent, on-chain retirement of blue carbon credits.</p>
      <div class="fields">
        <div class="field"><div class="k">Retiree</div><div class="v mono">${short(actor)}</div></div>
        <div class="field"><div class="k">Amount retired</div><div class="v" style="color:#34d399">${fmt(amount)} tCO\u2082e</div></div>
        <div class="field"><div class="k">Reason</div><div class="v">${escapeHtml(reason)}</div></div>
        <div class="field"><div class="k">Retirement tx</div><div class="v mono">${shortTx(txHash)}</div></div>
      </div>
      ${qrHtml}
      <div class="impact-grid">${impactEquivalents(amount).map((e) => `
        <div class="impact-item"><div class="ic">${e.icon}</div>
        <div><div class="v">${e.value}</div><div class="l">${e.label}</div></div></div>`).join("")}
      </div>
    </div>
    <div class="row" style="display:flex;gap:12px;margin-top:18px;justify-content:flex-end">
      <button class="btn primary" onclick="window.print()">Print / save as PDF</button>
      <button class="btn ghosty" id="cert-close">Close</button>
    </div>`;
  modal.classList.remove("hidden");
  $("#cert-close")?.addEventListener("click", () => modal.classList.add("hidden"));
}

function drawQrCanvas(canvas, qr) {
  const count = qr.getModuleCount();
  const size = 8;
  canvas.width = canvas.height = (count + 4) * size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#07040f";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect((c + 2) * size, (r + 2) * size, size, size);
      }
    }
  }
  canvas.style.width = "132px";
  canvas.style.height = "132px";
}

document.addEventListener("carbonyx:ready", initMarketplace);
