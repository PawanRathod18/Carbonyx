"use strict";

function initAutoRefresh() {
  if (document.body.dataset.page !== "dashboard") return;
  let lastBlock = state.chain ? state.chain.block_number : 0;
  setInterval(async () => {
    try {
      const chain = await api("/api/chain/status");
      if (chain.block_number > lastBlock) {
        toast("Block #" + chain.block_number + " mined", false);
        lastBlock = chain.block_number;

        document.querySelectorAll(".stat").forEach((el) => {
          el.style.borderColor = "rgba(34,211,238,.5)";
          setTimeout(() => el.style.borderColor = "", 1000);
        });

        if (typeof initDashboard === "function") initDashboard();
      }
      state.chain = chain;
    } catch {   }
  }, 15000);
}

function showSkeleton(container, count) {
  if (!container) return;
  count = count || 3;
  let html = "";
  for (let i = 0; i < count; i++) {
    html += '<div class="skel" style="margin-bottom:12px"></div>';
  }
  container.innerHTML = html;
}

function emptyState(msg, ctaText, ctaHref) {
  const cta = ctaText ? '<a class="btn primary small" href="' + ctaHref + '">' + ctaText + '</a>' : "";
  return '<div class="empty-state">' +
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.3;margin-bottom:12px">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
    '<p>' + msg + '</p>' + cta + '</div>';
}

let lastEventBlock = 0;
function initChainEventPolling() {
  if (document.body.dataset.page === "home") return;
  setInterval(async () => {
    try {
      const events = await api("/api/events?limit=1");
      if (events.length > 0 && events[0].block_number > lastEventBlock) {
        if (lastEventBlock > 0) {
          const e = events[0];
          toast(e.event_name + " \u2014 block #" + e.block_number);
        }
        lastEventBlock = events[0].block_number;
      }
    } catch {   }
  }, 20000);
}

function initGlobalSearch() {
  const tbRight = document.querySelector(".tb-right");
  if (!tbRight || document.getElementById("global-search")) return;
  const wrap = document.createElement("div");
  wrap.className = "global-search";
  wrap.innerHTML = '<svg class="gs-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>' +
    '<input type="text" id="global-search" placeholder="Search..." autocomplete="off">' +
    '<div class="gs-results" id="gs-results"></div>';
  tbRight.insertBefore(wrap, tbRight.firstChild);

  const input = wrap.querySelector("input");
  const results = wrap.querySelector(".gs-results");

  const PAGES = [
    ["dashboard.html", "Dashboard", "stats overview chain events"],
    ["analytics.html", "Analytics", "charts biomass carbon NDVI"],
    ["map.html", "World Map", "mangrove seagrass saltmarsh locations search"],
    ["portfolio.html", "Portfolio", "my credits CBX balance retired"],
    ["projects.html", "Projects & MRV", "register quantify satellite report"],
    ["verification.html", "Verification", "verifier approve reject report hash"],
    ["marketplace.html", "Marketplace", "buy sell trade list credits cart"],
    ["chain.html", "Chain Log", "blocks transactions events blockchain"],
    ["docs.html", "Docs", "methodology architecture API"],
    ["about.html", "About", "team project college"],
    ["login.html", "Login / Signup", "sign in register account"],
  ];

  input.addEventListener("input", () => {
    const term = input.value.toLowerCase().trim();
    if (!term || term.length < 1) { results.style.display = "none"; return; }
    const matches = PAGES.filter((p) =>
      p[1].toLowerCase().includes(term) || p[2].toLowerCase().includes(term)
    );
    if (matches.length === 0) {
      results.innerHTML = '<div class="gs-empty">No pages found</div>';
    } else {
      results.innerHTML = matches.map((m) =>
        '<a href="' + m[0] + '"><b>' + m[1] + '</b><span>' + m[2].slice(0, 40) + '</span></a>'
      ).join("");
    }
    results.style.display = "block";
  });
  input.addEventListener("blur", () => {
    setTimeout(() => results.style.display = "none", 200);
  });
  input.addEventListener("focus", () => {
    if (input.value.length > 0) results.style.display = "block";
  });
}

function exportCSV(filename, rows) {
  const csv = rows.map((row) =>
    row.map((cell) => {
      const s = String(cell || "");
      return s.includes(",") || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(",")
  ).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("Exported " + filename);
}

function initExportButtons() {

  if (document.body.dataset.page === "portfolio") {
    const card = document.querySelector(".card");
    if (card && !document.getElementById("btn-export-portfolio")) {
      const btn = document.createElement("button");
      btn.id = "btn-export-portfolio";
      btn.className = "btn ghosty small";
      btn.textContent = "Export CSV";
      btn.style.cssText = "margin-top:14px";
      btn.addEventListener("click", async () => {
        try {
          const [pf, events] = await Promise.all([
            api("/api/portfolio/" + (state.user ? state.user.wallet_address : defaultActor())),
            api("/api/events?limit=50"),
          ]);
          const rows = [["Metric", "Value"]];
          rows.push(["CBX Balance", pf.cbx]);
          rows.push(["ETH Balance", pf.eth]);
          rows.push(["Retired tCO2e", pf.retired_tco2e]);
          rows.push(["Active Listings", pf.active_listings.length]);
          pf.active_listings.forEach((l) => {
            rows.push(["Listing #" + l.id, l.amount + " tCO2e @ " + l.price_per_credit_eth + " ETH"]);
          });
          exportCSV("carbonyx_portfolio.csv", rows);
        } catch (e) {
          toast("Export failed: " + e.message, true);
        }
      });
      card.appendChild(btn);
    }
  }

  if (document.body.dataset.page === "dashboard") {
    const card = document.querySelector(".card");
    if (card && !document.getElementById("btn-export-projects")) {
      const btn = document.createElement("button");
      btn.id = "btn-export-projects";
      btn.className = "btn ghosty small";
      btn.textContent = "Export CSV";
      btn.style.cssText = "margin-top:14px";
      btn.addEventListener("click", async () => {
        try {
          const projects = await api("/api/projects");
          const rows = [["ID", "Name", "Ecosystem", "Country", "Status", "Stock tCO2e", "Sequestration tCO2e/yr"]];
          projects.forEach((p) => {
            rows.push([
              p.id, p.name, p.ecosystem, p.country || "", p.status,
              p.report ? p.report.stock_tco2e : "0",
              p.report ? p.report.seq_rate_tco2_yr : "0",
            ]);
          });
          exportCSV("carbonyx_projects.csv", rows);
        } catch (e) {
          toast("Export failed: " + e.message, true);
        }
      });
      card.appendChild(btn);
    }
  }
}

function initThemeToggle() {

  document.body.classList.remove("light-mode");
  localStorage.removeItem("carbonyx_theme");
}

document.addEventListener("carbonyx:ready", () => {
  initGlobalSearch();
  initThemeToggle();
  initAutoRefresh();
  initChainEventPolling();
  initExportButtons();
});

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    initGlobalSearch();
    initThemeToggle();
  }, 500);
});
