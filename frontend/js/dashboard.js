"use strict";

async function initDashboard() {
  try {
    const [projects, listings, events] = await Promise.all([
      api("/api/projects"), api("/api/marketplace"), api("/api/events?limit=8"),
    ]);
    const verified = projects.filter((p) => ["verified", "minted"].includes(p.status));
    const issued = projects
      .filter((p) => p.status === "minted")
      .reduce((s, p) => s + (p.report ? p.report.issueable_tco2e : 0), 0);
    const stock = projects.reduce(
      (s, p) => s + (p.report ? p.report.stock_tco2e : 0), 0);

    setCounter("d-projects", projects.length);
    setCounter("d-verified", verified.length);
    setCounter("d-issued", Math.round(issued));
    setCounter("d-listings", listings.length);
    setCounter("d-stock", Math.round(stock));
    animateCounters();

    const el = $("#dash-events");
    el.innerHTML = events.length
      ? events.map((e, i) => `
        <div class="event-item" style="--i:${i}">
          <span class="ev">${escapeHtml(e.event_name)}</span>
          <span class="mono">${e.actor ? short(e.actor) : ""} \u00b7 blk ${e.block_number}</span>
        </div>`).join("")
      : `<div class="empty">No activity yet - register a project to begin.</div>`;
  } catch (e) { toast("Failed to load dashboard: " + e.message, true); }
}

document.addEventListener("carbonyx:ready", initDashboard);
