"use strict";

async function initLanding() {
  try {
    const [projects, listings] = await Promise.all([
      api("/api/projects"), api("/api/marketplace"),
    ]);
    const issued = projects
      .filter((p) => p.status === "minted")
      .reduce((s, p) => s + (p.report ? p.report.issueable_tco2e : 0), 0);
    const stock = projects.reduce(
      (s, p) => s + (p.report ? p.report.stock_tco2e : 0), 0);
    setCounter("stat-projects", projects.length);
    setCounter("stat-issued", Math.round(issued));
    setCounter("stat-stock", Math.round(stock));
    setCounter("stat-listings", listings.length);

    const featured = projects.find((p) => p.status === "minted") || projects[0];
    if (featured && featured.report) {
      const el = (id) => document.getElementById(id);
      if (el("gc-stock")) el("gc-stock").textContent = fmt(Math.round(featured.report.stock_tco2e));
      if (el("gc-seq")) el("gc-seq").textContent = fmt(Math.round(featured.report.seq_rate_tco2_yr));
    }

    animateCounters();
  } catch {   }
}

function initRiverParallax() {
  const bg = document.querySelector(".river-bg");
  if (!bg) return;
  const glow = bg.querySelector(".river-glow");
  const fog1 = bg.querySelector(".fog-1");
  const fog2 = bg.querySelector(".fog-2");
  const mangrovesBack = bg.querySelector(".mangroves-back");
  const mangrovesFront = bg.querySelector(".mangroves-front");

  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    if (y > window.innerHeight) return;
    const factor = y / window.innerHeight;
    if (glow) glow.style.transform = `translateX(-50%) translateY(${factor * 40}px)`;
    if (mangrovesBack) mangrovesBack.style.transform = `translateY(${factor * 30}px)`;
    if (mangrovesFront) mangrovesFront.style.transform = `translateY(${factor * 50}px)`;
    if (fog1) fog1.style.opacity = Math.max(0, 1 - factor * 1.5);
    if (fog2) fog2.style.opacity = Math.max(0, 0.6 - factor);
  }, { passive: true });
}

function initMouseGlow() {
  const portal = document.querySelector(".portal");
  if (!portal) return;
  portal.addEventListener("mousemove", (e) => {
    const rect = portal.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    portal.style.setProperty("--mx", x + "%");
    portal.style.setProperty("--my", y + "%");
  });
}

document.addEventListener("carbonyx:ready", () => {
  initLanding();
  initRiverParallax();
  initMouseGlow();
});
