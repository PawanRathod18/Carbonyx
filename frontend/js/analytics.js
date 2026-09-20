"use strict";

async function initAnalytics() {
  try {
    const [projects, events, mlStatus] = await Promise.all([
      api("/api/projects"), api("/api/events?limit=200"), api("/api/ml/status"),
    ]);

    drawEcosystemDonut(projects);
    drawFunnel(projects);
    drawActivityLine(events);
    drawPriceHistory(events);
    renderMlStatus(mlStatus);

    const stock = projects.reduce((s, p) => s + (p.report ? p.report.stock_tco2e : 0), 0);
    const issued = projects.filter((p) => p.status === "minted")
      .reduce((s, p) => s + (p.report ? p.report.issueable_tco2e : 0), 0);
    const el = $("#analytics-impact");
    if (el) el.innerHTML = `
      <p class="hint" style="margin-bottom:6px"><b style="color:var(--text)">${fmt(Math.round(issued))} tCO\u2082e</b> of credits have been issued on this network.</p>
      ${impactHtml(issued || stock)}`;
  } catch (e) { toast("Failed to load analytics: " + e.message, true); }
}

function drawEcosystemDonut(projects) {
  const svg = $("#eco-donut");
  const legend = $("#eco-legend");
  if (!svg) return;
  const colors = { mangrove: "#34d399", seagrass: "#38bdf8", saltmarsh: "#f5a623" };
  const byEco = {};
  for (const p of projects) {
    byEco[p.ecosystem] = (byEco[p.ecosystem] || 0) +
      (p.report ? p.report.stock_tco2e : 0);
  }
  const entries = Object.entries(byEco).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  if (!entries.length) {
    svg.innerHTML = `<text x="110" y="110" fill="#7fa3c0" font-size="12" text-anchor="middle">no data yet</text>`;
    return;
  }

  const R = 80, C = 2 * Math.PI * R;
  let offset = 0;
  let bars = "";
  for (const [eco, val] of entries) {
    const frac = val / total;
    bars += `
      <circle cx="110" cy="110" r="${R}" fill="none" stroke="${colors[eco]}" stroke-width="30"
        stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}"
        stroke-dashoffset="${(-offset * C).toFixed(1)}"
        transform="rotate(-90 110 110)" stroke-linecap="butt">
        <animate attributeName="stroke-dasharray" from="0 ${C}" to="${(frac * C).toFixed(1)} ${C}" dur="1.2s" fill="freeze"/>
      </circle>`;
    offset += frac;
  }
  svg.innerHTML = bars + `
    <circle cx="110" cy="110" r="62" fill="#0a051a"/>
    <text x="110" y="105" fill="#eef0ff" font-size="15" font-weight="800" text-anchor="middle">${fmt(Math.round(total))}</text>
    <text x="110" y="123" fill="#7fa3c0" font-size="9" text-anchor="middle" letter-spacing="2">tCO2e STOCK</text>`;

  legend.innerHTML = entries.map(([eco, val]) => `
    <div class="row"><span class="swatch" style="background:${colors[eco]}"></span>
      ${eco} \u00b7 <b style="color:var(--text)">${fmt(Math.round(val))} tCO\u2082e</b>
      <span style="margin-left:auto;color:#7fa3c0">${((val / total) * 100).toFixed(0)}%</span></div>`).join("");
}

function drawFunnel(projects) {
  const el = $("#funnel-bars");
  if (!el) return;
  const stages = ["pending", "quantified", "verified", "minted"];
  const labels = { pending: "Registered", quantified: "Quantified", verified: "Verified", minted: "Credits minted" };
  const counts = stages.map((s) => projects.filter((p) => p.status === s).length);
  const max = Math.max(1, ...counts);
  el.innerHTML = stages.map((s, i) => `
    <div class="bar-row">
      <span>${labels[s]}</span>
      <div class="track"><div class="fill" data-w="${(counts[i] / max * 100).toFixed(0)}"></div></div>
      <span class="val">${counts[i]}</span>
    </div>`).join("");
  setTimeout(() => {
    el.querySelectorAll(".fill").forEach((f) => { f.style.width = f.dataset.w + "%"; });
  }, 150);
}

function drawActivityLine(events) {
  const svg = $("#activity-line");
  if (!svg) return;
  const pts = events.slice(0, 40).reverse();
  if (pts.length < 2) {
    svg.innerHTML = `<text x="240" y="120" fill="#7fa3c0" font-size="12" text-anchor="middle">not enough activity yet</text>`;
    return;
  }
  const W = 480, H = 240, pad = 34;
  const blocks = pts.map((e) => e.block_number);
  const minB = Math.min(...blocks), maxB = Math.max(...blocks);
  const cum = [];
  pts.forEach((_, i) => cum.push(i + 1));
  const maxY = Math.max(...cum);
  const x = (i) => pad + (maxB === minB ? 0.5 : (pts[i].block_number - minB) / (maxB - minB)) * (W - 2 * pad);
  const y = (v) => H - pad - (v / maxY) * (H - 2 * pad);
  const path = cum.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = path + ` L${x(pts.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  svg.innerHTML = `
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#34d399" stop-opacity=".4"/>
      <stop offset="1" stop-color="#34d399" stop-opacity="0"/>
    </linearGradient></defs>
    ${[0, 1, 2, 3, 4].map((k) => `<line x1="${pad}" y1="${y(maxY * k / 4)}" x2="${W - pad}" y2="${y(maxY * k / 4)}" stroke="#0a2236"/>`).join("")}
    <path d="${area}" fill="url(#ag)"/>
    <path d="${path}" fill="none" stroke="#34d399" stroke-width="2.5"/>
    ${pts.map((_, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(cum[i]).toFixed(1)}" r="2.6" fill="#38bdf8"/>`).join("")}
    <text x="${W / 2}" y="${H - 6}" fill="#7fa3c0" font-size="10" text-anchor="middle">block number (${minB} ... ${maxB})</text>
    <text x="${pad}" y="14" fill="#b9a6ff" font-size="10">cumulative events</text>`;
}

function drawPriceHistory(events) {
  const svg = $("#price-chart");
  const note = $("#price-note");
  if (!svg) return;
  const trades = events
    .filter((e) => e.event_name === "Purchased")
    .map((e) => ({
      block: e.block_number,
      price: Number(e.payload.pricePerCredit || 0) / 1e18,
      amount: Number(e.payload.amount || 0),
    }))
    .filter((t) => t.price > 0)
    .sort((a, b) => a.block - b.block);

  if (trades.length < 1) {
    svg.innerHTML = `<text x="240" y="120" fill="#7fa3c0" font-size="12" text-anchor="middle">no trades yet - buy a listing on the marketplace</text>`;
    return;
  }
  const W = 480, H = 240, pad = 40;
  const prices = trades.map((t) => t.price);
  const minY = Math.min(...prices) * 0.9, maxY = Math.max(...prices) * 1.1;
  const x = (i) => pad + (trades.length === 1 ? 0.5 : i / (trades.length - 1)) * (W - 2 * pad);
  const y = (v) => H - pad - ((v - minY) / (maxY - minY || 1)) * (H - 2 * pad);
  const path = trades.map((t, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(t.price).toFixed(1)}`).join(" ");
  svg.innerHTML = `
    ${[0, 1, 2, 3, 4].map((k) => `<line x1="${pad}" y1="${H - pad - (k / 4) * (H - 2 * pad)}" x2="${W - pad}" y2="${H - pad - (k / 4) * (H - 2 * pad)}" stroke="#0a2236"/>`).join("")}
    <path d="${path}" fill="none" stroke="#34d399" stroke-width="2.5"/>
    ${trades.map((t, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(t.price).toFixed(1)}" r="4" fill="#34d399"/>`).join("")}
    ${trades.map((t, i) => `<text x="${x(i).toFixed(1)}" y="${y(t.price).toFixed(1) - 10}" fill="#bfe7ff" font-size="9" text-anchor="middle">${t.price.toFixed(3)}</text>`).join("")}
    <text x="${W / 2}" y="${H - 6}" fill="#7fa3c0" font-size="10" text-anchor="middle">trade sequence (oldest to newest)</text>
    <text x="${pad}" y="14" fill="#34d399" font-size="10">ETH per CBX credit</text>`;
  if (note) note.textContent = `${trades.length} completed purchase(s), average ${fmt(trades.reduce((s, t) => s + t.price, 0) / trades.length, 3)} ETH/credit.`;
}

function renderMlStatus(ml) {
  const el = $("#ml-status");
  if (!el) return;
  if (!ml.available) {
    el.innerHTML = `<div class="empty">ML layer unavailable: ${escapeHtml(ml.note || "scikit-learn not installed")}. Run: pip install scikit-learn</div>`;
    return;
  }
  el.innerHTML = `
    <div class="report-grid">
      <div class="metric"><div class="v">${ml.r2.toFixed(3)}</div><div class="l">Model R\u00b2 (test split)</div></div>
      <div class="metric"><div class="v">${ml.n_training_samples}</div><div class="l">Training samples</div></div>
      <div class="metric"><div class="v">${ml.algorithm.replace("Regressor", "")}</div><div class="l">Algorithm</div></div>
    </div>
    <div class="bars" style="margin-top:14px">
      ${ml.features.map((f, i) => `
        <div class="bar-row">
          <span>${f}</span>
          <div class="track"><div class="fill" data-w="${(ml.feature_importance[i] * 100).toFixed(0)}"></div></div>
          <span class="val">${(ml.feature_importance[i] * 100).toFixed(0)}%</span>
        </div>`).join("")}
    </div>
    <p class="hint" style="margin-top:12px">The ML model independently predicts above-ground biomass from
    satellite-observable features; its deviation from the empirical estimate feeds the risk-flag system.</p>`;
  setTimeout(() => {
    el.querySelectorAll(".fill").forEach((f) => { f.style.width = f.dataset.w + "%"; });
  }, 150);
}

document.addEventListener("carbonyx:ready", initAnalytics);
