"use strict";

async function doShowReport(id) {
  try {
    const p = await api(`/api/projects/${id}`);
    const r = p.full_report;
    if (!r) return toast("No report yet - quantify the project first.", true);
    const c = r.classification, carbon = r.carbon, proj = r.projection;
    const ml = r.ml || { available: false };

    $("#modal-title").textContent = `Verification report - ${p.name}`;
    const mapHtml = c.mask_preview ? `
      <div>
        <canvas id="map-canvas" width="${c.mask_preview.length}" height="${c.mask_preview.length}"></canvas>
        <div class="map-legend">
          <span class="veg">Classified vegetation</span>
          <span class="water">Water / other / cloud</span>
        </div>
      </div>` : `<div class="empty">Map preview not available for GEE runs.</div>`;

    const baHtml = c.mask_preview ? `
      <div class="ba-block">
        <b style="font-size:.85rem;color:var(--muted)">Satellite view — drag to compare degradation vs restoration</b>
        <div class="ba-wrap">
          <div class="ba-after"><canvas id="ba-after-canvas" width="420" height="420"></canvas></div>
          <div class="ba-before"><canvas id="ba-before-canvas" width="420" height="420"></canvas></div>
          <div class="ba-divider"><div class="ba-handle">\u2039 \u203a</div></div>
          <span class="ba-label ba-lb">BEFORE \u00b7 degraded</span>
          <span class="ba-label ba-la">AFTER \u00b7 restored</span>
        </div>
      </div>` : "";

    const flags = r.risk_flags || [];
    const flagsHtml = `
      <div class="flags-panel ${flags.length ? "" : "ok"}">
        <h5>${flags.length ? "Risk flags detected" : "All automated checks passed"}</h5>
        ${flags.length ? `<ul>${flags.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>` : ""}
        <div class="reco-line">${escapeHtml(r.recommendation || "")}</div>
      </div>`;

    const mlHtml = ml.available ? `
      <div class="metric"><div class="v">${ml.agb_t_ha} t/ha</div><div class="l">ML AGB estimate (R\u00b2 ${ml.model_r2})</div></div>
      <div class="metric"><div class="v">${ml.deviation_pct > 0 ? "+" : ""}${ml.deviation_pct}%</div><div class="l">ML vs empirical deviation</div></div>` : "";

    $("#modal-body").innerHTML = `
      ${baHtml}
      ${flagsHtml}
      <div class="report-grid">
        <div class="metric"><div class="v">${fmt(c.classified_area_ha, 1)} ha</div><div class="l">Classified ecosystem area</div></div>
        <div class="metric"><div class="v">${fmt(r.region.bbox_area_ha, 1)} ha</div><div class="l">Bounding box area</div></div>
        <div class="metric"><div class="v">${r.indices.ndvi_mean.toFixed(3)}</div><div class="l">Mean NDVI</div></div>
        <div class="metric"><div class="v">${r.indices.ndwi_mean.toFixed(3)}</div><div class="l">Mean NDWI</div></div>
        <div class="metric"><div class="v">${(r.confidence * 100).toFixed(0)}%</div><div class="l">Verification confidence</div></div>
        <div class="metric"><div class="v">${(r.cloud_fraction * 100).toFixed(1)}%</div><div class="l">Cloud fraction</div></div>
        <div class="metric"><div class="v">${fmt(carbon.agb_t)} t</div><div class="l">Above-ground biomass (dry)</div></div>
        <div class="metric"><div class="v">${fmt(carbon.total_c_t)} tC</div><div class="l">Total carbon stock</div></div>
        <div class="metric"><div class="v">${fmt(carbon.stock_tco2e)} tCO\u2082e</div><div class="l">Stock in tCO\u2082e</div></div>
        <div class="metric"><div class="v">${fmt(proj.annual_seq_tco2_yr, 1)}</div><div class="l">Annual sequestration (tCO\u2082e/yr)</div></div>
        <div class="metric"><div class="v">${fmt(proj.projected_tco2e)}</div><div class="l">Projected ${proj.years}-yr sequestration</div></div>
        <div class="metric"><div class="v">${fmt(proj.issueable_tco2e)}</div><div class="l">Issueable credits (buffer ${((1 - proj.buffer) * 100).toFixed(0)}%)</div></div>
        ${mlHtml}
      </div>

      <div class="grid-2">
        ${mapHtml}
        <div>
          <b style="font-size:.85rem;color:var(--muted)">Cumulative sequestration - time-lapse (${proj.years} years)</b>
          <svg id="proj-chart" viewBox="0 0 420 200" style="width:100%;margin-top:8px"></svg>
          <div class="timelapse">
            <button class="btn primary small" id="tl-play">Play</button>
            <input type="range" id="tl-range" min="0" max="${proj.years}" value="${proj.years}" step="1">
            <span class="year" id="tl-year">year ${proj.years}</span>
          </div>
        </div>
      </div>

      <b style="font-size:.85rem;color:var(--muted)">What this stock means in the real world</b>
      ${impactHtml(carbon.stock_tco2e)}

      <p class="hint" style="margin-top:14px">Report hash (anchored on-chain when verified):
        <span class="mono">${r.report_hash}</span><br>
        Engine: ${r.engine === "sim" ? "synthetic Sentinel-2 simulator" : "Google Earth Engine"} \u00b7
        Generated ${r.generated_at.slice(0, 19).replace("T", " ")} UTC</p>
    `;
    $("#modal").classList.remove("hidden");
    if (c.mask_preview) drawMap(c.mask_preview);
    if (c.mask_preview) initSatCompare(c.mask_preview, p.id || 42);
    initTimelapse(p.sequestration_curve);
  } catch (e) { toast(e.message, true); }
}

function drawMap(mask) {
  const canvas = $("#map-canvas");
  const n = mask.length;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const idx = (i * n + j) * 4;
      if (mask[i][j]) {
        img.data[idx] = 22; img.data[idx + 1] = 163; img.data[idx + 2] = 74;
      } else {
        img.data[idx] = 14; img.data[idx + 1] = 58; img.data[idx + 2] = 92;
      }
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function initTimelapse(curve) {
  if (!curve || !curve.length) return;
  const range = $("#tl-range");
  const yearEl = $("#tl-year");
  const playBtn = $("#tl-play");
  let playing = false;

  const render = (year) => {
    drawProjection(curve.slice(0, year + 1));
    yearEl.textContent = `year ${year}`;
    range.value = year;
  };

  range.addEventListener("input", () => render(Number(range.value)));

  playBtn.addEventListener("click", () => {
    if (playing) { playing = false; playBtn.textContent = "Play"; return; }
    playing = true;
    playBtn.textContent = "Pause";
    let y = 0;
    const tick = () => {
      if (!playing) return;
      render(y);
      y += 1;
      if (y >= curve.length - 1) {
        playing = false; playBtn.textContent = "Replay";
        return;
      }
      setTimeout(tick, 240);
    };
    tick();
  });

  render(curve.length - 1);
}

function drawProjection(curve) {
  if (!curve || !curve.length) return;
  const svg = $("#proj-chart");
  if (!svg) return;
  const W = 420, H = 200, pad = 34;
  const maxY = Math.max(...curve) || 1;
  const x = (i) => pad + (i / (curve.length - 1 || 1)) * (W - 2 * pad);
  const y = (v) => H - pad - (v / maxY) * (H - 2 * pad);
  const path = curve.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = path + ` L${x(curve.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const ticks = [0, Math.round(maxY / 2), Math.round(maxY)];
  svg.innerHTML = `
    <defs><linearGradient id="fillg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#38bdf8" stop-opacity=".45"/>
      <stop offset="1" stop-color="#38bdf8" stop-opacity="0"/>
    </linearGradient></defs>
    ${[0, 1, 2, 3, 4].map((k) => `
      <line x1="${pad}" y1="${y(maxY * k / 4)}" x2="${W - pad}" y2="${y(maxY * k / 4)}" stroke="#0a2236" stroke-width="1"/>`).join("")}
    <path d="${area}" fill="url(#fillg)"/>
    <path d="${path}" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="${x(curve.length - 1).toFixed(1)}" cy="${y(curve[curve.length - 1]).toFixed(1)}" r="4.5" fill="#38bdf8"/>
    ${ticks.map((t) => `<text x="${pad - 4}" y="${y(t) + 4}" fill="#7fa3c0" font-size="10" text-anchor="end">${(t / 1000000).toFixed(1)}M</text>`).join("")}
    <text x="${W / 2}" y="${H - 6}" fill="#7fa3c0" font-size="10" text-anchor="middle">years of sequestration</text>
    <text x="${pad}" y="14" fill="#b9a6ff" font-size="10">cumulative tCO\u2082e</text>`;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function degradeMask(mask, seed) {

  const rnd = mulberry32(seed);
  const n = mask.length;
  return mask.map((row, i) => row.map((v, j) => {
    if (!v) return false;
    let cnt = 0;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const ii = Math.min(n - 1, Math.max(0, i + di));
        const jj = Math.min(n - 1, Math.max(0, j + dj));
        if (mask[ii][jj]) cnt++;
      }
    }
    return cnt >= 7 && rnd() > 0.55;
  }));
}

function drawScene(canvas, mask, mode, seed) {
  if (!canvas) return;
  const n = mask.length, S = canvas.width, cell = S / n;
  const rnd = mulberry32(mode === "before" ? seed + 7 : seed);
  const ctx = canvas.getContext("2d");
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let r, g, b;
      if (mask[i][j]) {
        if (mode === "after") {
          const t = rnd();
          r = 18 + t * 26; g = 118 + t * 64; b = 46 + t * 30;
        } else {
          const t = rnd();
          r = 98 + t * 30; g = 86 + t * 24; b = 50 + t * 16;
        }
      } else if (mode === "after") {
        r = 12 + rnd() * 10; g = 34 + rnd() * 14; b = 64 + rnd() * 18;
      } else {
        r = 28 + rnd() * 12; g = 34 + rnd() * 12; b = 52 + rnd() * 14;
      }
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.fillRect(j * cell, i * cell, cell + 1, cell + 1);
    }
  }
}

function initSatCompare(mask, seed) {
  drawScene($("#ba-after-canvas"), mask, "after", seed);
  drawScene($("#ba-before-canvas"), degradeMask(mask, seed), "before", seed);

  const wrap = $(".ba-wrap");
  if (!wrap) return;
  const setPos = (p) => {
    wrap.style.setProperty("--pos", Math.max(2, Math.min(98, p)).toFixed(1) + "%");
  };
  const fromEvent = (e) => {
    const r = wrap.getBoundingClientRect();
    setPos(((e.clientX - r.left) / r.width) * 100);
  };

  let drag = false;
  let sweep = null;
  wrap.addEventListener("pointerdown", (e) => {
    drag = true;
    if (sweep) { clearInterval(sweep); sweep = null; }
    wrap.setPointerCapture(e.pointerId);
    fromEvent(e);
  });
  wrap.addEventListener("pointermove", (e) => { if (drag) fromEvent(e); });
  wrap.addEventListener("pointerup", () => { drag = false; });
  wrap.addEventListener("pointercancel", () => { drag = false; });

  setPos(55);
  let t = 0;
  sweep = setInterval(() => {
    t += 1;
    setPos(55 + Math.sin(t / 3.2) * 17);
    if (t > 22) { clearInterval(sweep); sweep = null; setPos(55); }
  }, 40);
}
