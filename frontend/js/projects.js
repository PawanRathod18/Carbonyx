"use strict";

let projectsCache = [];

async function initProjects() {
  $("#btn-register")?.addEventListener("click", doRegister);
  $("#modal-close")?.addEventListener("click", () => $("#modal").classList.add("hidden"));
  $("#modal")?.addEventListener("click", (e) => {
    if (e.target === $("#modal")) $("#modal").classList.add("hidden");
  });
  await loadDemoRegions();
  await refreshProjects();
}

async function loadDemoRegions() {
  try {
    if (!state.config) state.config = await api("/api/config");
    const sel = $("#demo-regions");
    if (!sel) return;
    sel.innerHTML = `<option value="">select...</option>` +
      state.config.demo_regions.map((r, i) =>
        `<option value="${i}">${escapeHtml(r.name)} (${r.ecosystem})</option>`).join("");
    sel.onchange = () => {
      const r = state.config.demo_regions[sel.value];
      if (!r) return;
      $("#f-ecosystem").value = r.ecosystem;
      $("#f-country").value = r.country;
      $("#f-name").value = r.name;
      $("#f-lon1").value = r.bounds[0]; $("#f-lat1").value = r.bounds[1];
      $("#f-lon2").value = r.bounds[2]; $("#f-lat2").value = r.bounds[3];
    };
  } catch {   }
}

async function refreshProjects() {
  const grid = $("#projects-list");
  if (!grid) return;
  try {
    grid.innerHTML = `<div class="skel"></div><div class="skel"></div>`;
    projectsCache = await api("/api/projects");
    renderProjects();
  } catch (e) {
    grid.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
  }
}

function renderProjects() {
  const grid = $("#projects-list");
  const eco = { mangrove: "Mangrove", seagrass: "Seagrass", saltmarsh: "Salt marsh" };
  grid.innerHTML = projectsCache.length
    ? projectsCache.map((p, i) => {
        const rep = p.report;
        return `
        <div class="project-card" style="animation:rowIn .5s ease both;animation-delay:${i * 70}ms">
          <h4>${escapeHtml(p.name)}</h4>
          <span class="chip ${p.status}">${p.status}</span>
          <div class="meta">
            ${eco[p.ecosystem] || p.ecosystem} \u00b7 ${escapeHtml(p.country || "-")} \u00b7 chain id #${p.chain_id}<br>
            Owner <span class="mono">${short(p.owner_address)}</span><br>
            ${rep
              ? `Area <b>${fmt(rep.area_ha, 1)} ha</b> \u00b7 Stock <b>${fmt(rep.stock_tco2e)} tCO\u2082e</b> \u00b7 Confidence <b>${(rep.confidence * 100).toFixed(0)}%</b>`
              : "Not quantified yet."}
          </div>
          <div class="actions">
            <button class="btn warn small" data-act="quantify" data-id="${p.id}">${rep ? "Re-quantify" : "Quantify"}</button>
            <button class="btn good small" data-act="report" data-id="${p.id}" ${rep ? "" : "disabled"}>View report</button>
          </div>
        </div>`;
      }).join("")
    : `<div class="empty">No projects yet - register one above.</div>`;

  grid.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.onclick = () => {
      const id = Number(btn.dataset.id);
      if (btn.dataset.act === "quantify") doQuantify(id, btn);
      if (btn.dataset.act === "report") doShowReport(id);
    };
  });
}

async function doRegister() {
  const payload = {
    name: $("#f-name").value.trim(),
    ecosystem: $("#f-ecosystem").value,
    country: $("#f-country").value.trim(),
    bounds: [
      parseFloat($("#f-lon1").value), parseFloat($("#f-lat1").value),
      parseFloat($("#f-lon2").value), parseFloat($("#f-lat2").value),
    ],
    owner: actorByRole("owner"),
  };
  if (payload.name.length < 3) return toast("Give the project a name (3+ characters).", true);
  if (payload.bounds.some((b) => Number.isNaN(b)) ||
      payload.bounds[0] >= payload.bounds[2] || payload.bounds[1] >= payload.bounds[3]) {
    return toast("Invalid bounding box (min must be below max).", true);
  }
  const btn = $("#btn-register");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Registering...';
  try {
    const p = await api("/api/projects", { method: "POST", body: JSON.stringify(payload) });
    toast(`Project registered on chain as #${p.chain_id}.`);
    $("#f-name").value = "";
    await refreshProjects();
  } catch (e) { toast(e.message, true); }
  btn.disabled = false;
  btn.textContent = "Register project";
}

const Q_STAGES = [
  "Acquiring Sentinel-2 tile",
  "Computing NDVI / NDWI indices",
  "Classifying vegetation pixels",
  "Modelling carbon stock (InVEST)",
  "Running ML cross-check",
  "Projecting 20-year sequestration",
  "Hashing verification report",
];

function runProgress(promise) {
  const slot = $("#qprogress-slot");
  if (slot) {
    slot.innerHTML = `
      <div class="qprogress">
        <div class="bar"><i></i></div>
        <div class="stage"></div>
      </div>`;
  }
  const t0 = Date.now();
  const totalMs = 6000;
  const timer = setInterval(() => {
    const frac = Math.min(0.92, (Date.now() - t0) / totalMs);
    const bar = slot?.querySelector("i");
    const stage = slot?.querySelector(".stage");
    if (bar) bar.style.width = (frac * 100).toFixed(1) + "%";
    const s = Math.min(Q_STAGES.length - 1, Math.floor(frac * Q_STAGES.length));
    if (stage) stage.textContent = Q_STAGES[s] + "...";
  }, 250);
  return promise.finally(() => {
    clearInterval(timer);
    const bar = slot?.querySelector("i");
    const stage = slot?.querySelector(".stage");
    if (bar) bar.style.width = "100%";
    if (stage) stage.textContent = "Done.";
    setTimeout(() => { if (slot) slot.innerHTML = ""; }, 1600);
  });
}

async function doQuantify(id, btn) {
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Quantifying...';
  try {
    const p = await runProgress(api(`/api/projects/${id}/quantify`, { method: "POST", body: "{}" }));
    toast(`Quantified: ${fmt(p.report.area_ha, 1)} ha classified, ${fmt(p.report.stock_tco2e)} tCO\u2082e stock.`);
    await refreshProjects();
    doShowReport(id);
  } catch (e) { toast(e.message, true); }
  btn.disabled = false;
  btn.textContent = "Quantify";
}

document.addEventListener("carbonyx:ready", initProjects);
