"use strict";

async function initPortfolio() {
  await renderPortfolio();
  document.addEventListener("carbonyx:account", renderPortfolio);
}

async function renderPortfolio() {
  const addr = defaultActor();
  if (!addr) return;
  try {
    const [pf, label] = await Promise.all([
      api(`/api/accounts/${addr}/portfolio`),
      Promise.resolve((state.accounts.find((a) => a.address === addr) || {}).label || ""),
    ]);

    setCounter("p-cbx", pf.cbx);
    setCounter("p-retired", pf.retired_tco2e);
    setCounter("p-listings", pf.active_listings.length);
    setCounter("p-eth", pf.eth);
    document.querySelectorAll("[data-count]").forEach((el) => {
      el.dataset.decimals = el.dataset.decimals || "0";
    });
    const ethEl = document.getElementById("p-eth");
    if (ethEl) { ethEl.dataset.decimals = "3"; }
    animateCounters();

    const retired = pf.retired_tco2e;
    const ranks = [
      [100, "badge-100", "Blue Carbon Supporter"],
      [1000, "badge-1000", "Coastline Guardian"],
      [10000, "badge-10000", "Ocean Climate Champion"],
    ];
    let nextRank = ranks[0];
    for (const [threshold, bid, name] of ranks) {
      document.getElementById(bid)?.classList.toggle("earned", retired >= threshold);
      if (retired < threshold) { nextRank = [threshold, bid, name]; break; }
    }
    const top = ranks[ranks.length - 1][0];
    const bar = $("#hero-bar");
    const nextEl = $("#hero-next");
    const noteEl = $("#hero-note");
    if (bar) {
      bar.style.width = Math.min(100, retired / top * 100).toFixed(1) + "%";
    }
    if (nextEl) nextEl.textContent = retired >= top ? "Maximum rank achieved"
      : `${fmt(nextRank[0] - retired)} tCO\u2082e to "${nextRank[2]}"`;
    if (noteEl) noteEl.textContent = `${label || "This account"} has retired ${fmt(retired)} tCO\u2082e of blue carbon credits - permanently.`;

    const impEl = $("#portfolio-impact");
    if (impEl) impEl.innerHTML = retired > 0 ? impactHtml(retired)
      : `<div class="empty">Retire credits on the Marketplace page to see your climate impact here.</div>`;

    const lb = $("#p-listings-body");
    if (lb) {
      lb.innerHTML = pf.active_listings.map((l, i) => `
        <tr style="--i:${i}">
          <td class="mono">#${l.id}</td><td>${fmt(l.amount)}</td>
          <td>${l.price_per_credit_eth} ETH</td><td>${l.total_cost_eth} ETH</td>
        </tr>`).join("");
      $("#p-listings-empty").style.display = pf.active_listings.length ? "none" : "block";
    }

    const act = $("#p-activity");
    if (act) {
      act.innerHTML = pf.activity.length
        ? pf.activity.map((e, i) => `
          <div class="event-item" style="--i:${i}">
            <span class="ev">${escapeHtml(e.event_name)}</span>
            <span class="mono">blk ${e.block_number}</span>
          </div>`).join("")
        : `<div class="empty">No activity yet for this account.</div>`;
    }
  } catch (e) { toast("Failed to load portfolio: " + e.message, true); }
}

document.addEventListener("carbonyx:ready", initPortfolio);
