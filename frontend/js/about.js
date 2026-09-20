"use strict";

document.addEventListener("carbonyx:ready", async () => {
  try {
    const projects = await api("/api/projects");
    const el = document.getElementById("about-projects");
    if (el) el.dataset.count = projects.length;
    const stock = projects.reduce((s, p) => s + (p.report ? p.report.stock_tco2e : 0), 0);
    const sEl = document.getElementById("about-stock");
    if (sEl) sEl.dataset.count = Math.round(stock);
    animateCounters();
  } catch {   }
});
