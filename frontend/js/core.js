"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  accounts: [],
  chain: null,
  config: null,
  user: null,
};

const ON_STATIC_PREVIEW = window.location.protocol === "file:"
  || /^55\d\d$/.test(window.location.port);
let API_BASE = ON_STATIC_PREVIEW ? "http://localhost:8000" : "";

async function probeBackend() {
  for (const port of [8000, 8001, 8002, 8003]) {
    try {
      const c = new AbortController();
      setTimeout(() => c.abort(), 2000);
      const res = await fetch(`http://localhost:${port}/api/chain/status`, { signal: c.signal });
      if (res.ok) return `http://localhost:${port}`;
    } catch {   }
  }
  return null;
}

async function api(path, opts = {}) {
  const token = localStorage.getItem("carbonyx_token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers["X-Auth-Token"] = token;
  const acct = document.getElementById("account-select");
  if (acct && acct.value) {
    headers["X-Account"] = acct.value;
    const tk = (state.roleTokens || {})[acct.value];
    if (tk) headers["X-Role-Token"] = tk;
  }
  const _c = new AbortController();
  const _t = setTimeout(() => _c.abort(), 8000);
  let res;
  try { res = await fetch(API_BASE + path, { headers, ...opts, signal: _c.signal }); }
  catch (e) { clearTimeout(_t); throw e; }
  clearTimeout(_t);
  let data = null;
  try { data = await res.json(); } catch {   }
  if (!res.ok) {
    const detail = data && data.detail ? data.detail : res.statusText;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}

function toast(msg, isError = false) {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 4200);
}

function fmt(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: digits });
}

function short(addr) { return addr ? addr.slice(0, 8) + "..." + addr.slice(-6) : "-"; }
function shortTx(h) { return h ? h.slice(0, 12) + "..." : "-"; }

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "\u0026amp;", "<": "\u0026lt;", ">": "\u0026gt;",
    '"': "\u0026quot;", "'": "\u0026#39;",
  }[c]));
}

function defaultActor() {
  if (state.user && state.user.wallet_address) return state.user.wallet_address;
  const sel = $("#account-select");
  return (sel && sel.value) || (state.accounts[0] && state.accounts[0].address);
}

function actorByRole(role) {
  const map = {
    verifier: "Verifier",
    owner: "Project Owner",
    buyer: "Buyer / Offsetter",
  };
  const acc = state.accounts.find((a) => a.label === map[role]);
  return acc ? acc.address : defaultActor();
}

const IMPACT = {
  carYearsPerTco2: 1 / 4.6,
  homeYearsPerTco2: 1 / 0.82,
  treesPerTco2: 1 / 0.021,
  flightTripsPerTco2: 1 / 0.30,
};

function impactEquivalents(tco2e) {
  const t = Number(tco2e) || 0;
  return [
    { icon: "\uD83D\uDE97", label: "car-years off the road", value: fmt(Math.round(t * IMPACT.carYearsPerTco2)) },
    { icon: "\uD83C\uDFE0", label: "Indian homes' yearly electricity", value: fmt(Math.round(t * IMPACT.homeYearsPerTco2)) },
    { icon: "\uD83C\uDF33", label: "mature trees sequestering for a year", value: fmt(Math.round(t * IMPACT.treesPerTco2)) },
    { icon: "\u2708\uFE0F", label: "Mumbai-Delhi round-trip flights avoided", value: fmt(Math.round(t * IMPACT.flightTripsPerTco2)) },
  ];
}

function impactHtml(tco2e) {
  return `<div class="impact-grid">` + impactEquivalents(tco2e).map((e) => `
    <div class="impact-item">
      <div class="ic">${e.icon}</div>
      <div><div class="v">${e.value}</div><div class="l">${e.label}</div></div>
    </div>`).join("") + `</div>`;
}

function protectedRole(addr) {
  const a = (state.accounts || []).find((x) => x.address === addr);
  return a && (a.label === "Platform Admin" || a.label === "Verifier") ? a.label : null;
}

function saveRoleToken(addr, token) {
  state.roleTokens = state.roleTokens || {};
  state.roleTokens[addr] = token;
  try { sessionStorage.setItem("carbonyx_role_tokens", JSON.stringify(state.roleTokens)); } catch {}
}

function openRoleUnlock(addr, onFail) {
  if (!addr) return;
  const label = protectedRole(addr) || "protected";
  closeRoleUnlock();
  const ov = document.createElement("div");
  ov.className = "role-modal";
  ov.innerHTML = `
    <div class="role-card">
      <div class="role-lock">\uD83D\uDD12</div>
      <h3>${escapeHtml(label)} password</h3>
      <p class="role-sub">This is a privileged role. Enter its password to act as this account.</p>
      <input type="password" id="role-pass" placeholder="Role password" autocomplete="off">
      <div class="role-err" id="role-err"></div>
      <div class="role-row">
        <button type="button" class="btn ghost small" id="role-cancel">Cancel</button>
        <button type="button" class="btn primary small" id="role-ok">Unlock</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const input = ov.querySelector("#role-pass");
  const err = ov.querySelector("#role-err");
  input.focus();
  const cancel = () => { closeRoleUnlock(); if (onFail) onFail(); };
  ov.querySelector("#role-cancel").onclick = cancel;
  ov.querySelector("#role-ok").onclick = async () => {
    err.textContent = "";
    try {
      const out = await api("/api/auth/unlock", {
        method: "POST", body: JSON.stringify({ address: addr, password: input.value })
      });
      saveRoleToken(addr, out.token);
      toast(`${out.role} unlocked`);
      closeRoleUnlock();
    } catch (e) {
      err.textContent = e.message || "Wrong password";
      const card = ov.querySelector(".role-card");
      card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
      input.select();
    }
  };
  input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") ov.querySelector("#role-ok").click(); });
}

function closeRoleUnlock() {
  document.querySelectorAll(".role-modal").forEach((m) => m.remove());
}
window.openRoleUnlock = openRoleUnlock;

function enhanceSelect(sel) {
  if (!sel || sel.dataset.enhanced) return;
  sel.dataset.enhanced = "1";

  const wrap = document.createElement("div");
  wrap.className = "csel";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "csel-btn";
  const menu = document.createElement("div");
  menu.className = "csel-menu";

  sel.parentElement.insertBefore(wrap, sel);
  wrap.appendChild(sel); wrap.appendChild(btn); wrap.appendChild(menu);
  sel.classList.add("csel-native");

  const currentLabel = () => {
    const opt = sel.options[sel.selectedIndex];
    const t = opt ? opt.textContent : "";
    return t.split(" (")[0].trim() || "select";
  };

  const renderBtn = () => {
    btn.innerHTML = `${escapeHtml(currentLabel())}<span class="chev">\u25BE</span>`;
  };

  const close = () => { wrap.classList.remove("open"); };

  const positionMenu = () => {
    const r = btn.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.top = (r.bottom + 8) + "px";
    menu.style.right = Math.max(8, window.innerWidth - r.right) + "px";
    menu.style.left = "auto";
    menu.style.maxHeight = Math.max(180, window.innerHeight - r.bottom - 16) + "px";
  };

  const open = () => {
    positionMenu();
    menu.innerHTML = "";
    Array.from(sel.options).forEach((o) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "csel-item" + (o.value === sel.value ? " active" : "");
      const parts = o.textContent.split(" (");
      item.innerHTML = `<b>${escapeHtml(parts[0].trim())}</b>` +
        (parts[1] ? `<span class="mono">${escapeHtml(parts[1].replace(")", ""))}</span>` : "");
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        sel.value = o.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        renderBtn();
        close();
      });
      menu.appendChild(item);
    });
    wrap.classList.add("open");
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = wrap.classList.contains("open");
    document.querySelectorAll(".csel.open").forEach((w) => { if (w !== wrap) w.classList.remove("open"); });
    if (wasOpen) close(); else open();
  });
  document.addEventListener("click", close);
  window.addEventListener("scroll", close, { passive: true });

  new MutationObserver(renderBtn).observe(sel, { childList: true });
  renderBtn();
}

const NAV_SVG = `
  <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
    <defs>
      <linearGradient id="cbleaf" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="#00806a"/><stop offset=".55" stop-color="#00b894"/><stop offset="1" stop-color="#8dc63f"/>
      </linearGradient>
      <linearGradient id="cbblue" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#00c3ff"/><stop offset="1" stop-color="#0057b8"/>
      </linearGradient>
    </defs>
    <path d="M10 27 C10 16 19 8 31 8 C36 8 40 9.5 43 12.5 C39 11.5 34.5 11.5 30.5 12.5 C21.5 14.8 15.8 19.6 13.5 27.5 Z" fill="url(#cbleaf)"/>
    <path d="M38 21 C38 32.5 29 40.5 17.5 40.5 C12.5 40.5 8.5 39 5.5 36 C9.5 37 14 37 18 36 C27 33.5 32.5 28 34.5 20 Z" fill="url(#cbblue)"/>
    <path d="M24 31 C24 27 24 23 24 19 M24 23 C21 22 19 20 18 17.5 M24 23 C27 22 29 20 30 17.5" stroke="#8dc63f" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M24 31 C23 33 21.5 34 19.5 35 M24 31 C25 33 26.5 34 28.5 35 M24 31 L24 36" stroke="#00b894" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".85"/>
    <circle cx="40.5" cy="10.5" r="4.2" fill="#00e5ff" opacity=".22"/>
    <circle cx="40.5" cy="10.5" r="2" fill="#4de9ff"/>
  </svg>`;

const NAV_MAIN = [
  ["index.html", "home", "Home"],
  ["about.html", "about", "About"],
];
const NAV_PLATFORM = [
  ["dashboard.html", "dashboard", "Dashboard"],
  ["analytics.html", "analytics", "Analytics"],
  ["map.html", "map", "World map"],
  ["portfolio.html", "portfolio", "Portfolio"],
  ["projects.html", "projects", "Projects & MRV"],
  ["verification.html", "verification", "Verification"],
  ["marketplace.html", "marketplace", "Marketplace"],
  ["chain.html", "chain", "Chain Log"],
];

function buildNavbar() {
  const bar = $("#topbar");
  if (!bar || bar.dataset.built) return;
  bar.dataset.built = "1";
  const page = document.body.dataset.page;
  const onPlatform = NAV_PLATFORM.some(([, p]) => p === page);

  bar.innerHTML = `
    <div class="tb-left">
      <a class="logo" href="index.html"><img src="logo.png" onerror="this.onerror=null;this.src='logo.png'" alt="CARBONYX" class="logo-lockup"><span class="brand-stack"><span class="brand-word">CARBONY<span class="brand-x">X</span></span><span class="brand-tag">Real ecosystems. Verified carbon.</span></span></a>
    </div>
    <div class="tb-center">
      <nav class="pillnav">
        ${NAV_MAIN.map(([href, p, label]) =>
          `<a href="${href}" data-page="${p}" class="${p === page ? "active" : ""}">${label}</a>`).join("")}
        <div class="navdrop ${onPlatform ? "open-active" : ""}" id="navdrop">
          <button type="button" id="navdrop-btn">Platform <span class="chev">\u25BE</span></button>
          <div class="navdrop-menu">
            ${NAV_PLATFORM.map(([href, p, label]) =>
              `<a href="${href}" data-page="${p}" class="${p === page ? "active" : ""}">${label}</a>`).join("")}
          </div>
        </div>
        <a href="docs.html" data-page="docs" class="${page === "docs" ? "active" : ""}">Docs</a>
      </nav>
    </div>
    <div class="tb-right" id="tb-right">
      <div id="chain-pill" class="pill offline"><span class="dot"></span><span id="chain-pill-text">connecting...</span></div>
      <select id="account-select" title="Demo account"></select>
      <div id="user-slot"></div>
    </div>`;

  const drop = $("#navdrop");
  const btn = $("#navdrop-btn");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    drop.classList.toggle("open");
  });
  if (onPlatform) drop.classList.add("open");
  document.addEventListener("click", () => drop.classList.remove("open"));
  drop.querySelector(".navdrop-menu").addEventListener("click", (e) => e.stopPropagation());
}

function renderUserSlot() {
  const slot = $("#user-slot");
  if (!slot) return;

  $$(".cart-open-trigger").forEach((b) => b.classList.toggle("logged-in", !!state.user));
  if (state.user) {
    const initials = state.user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    slot.innerHTML = `
      <span class="userchip" title="${escapeHtml(state.user.email)}">
        <span class="avatar">${initials}</span>
        <b>${escapeHtml(state.user.name.split(" ")[0])}</b>
        <button class="logout" id="btn-logout" title="Sign out">\u2716</button>
      </span>`;
    $("#btn-logout")?.addEventListener("click", async () => {
      try { await api("/api/auth/logout", { method: "POST" }); } catch {   }
      localStorage.removeItem("carbonyx_token");
      localStorage.removeItem("carbonyx_local_user");
      state.user = null;
      renderUserSlot();
      toast("Signed out. See you soon.");
      document.dispatchEvent(new CustomEvent("carbonyx:account"));
    });
  } else {
    slot.innerHTML = `<a class="btn primary small" href="login.html">Get started</a>`;
  }
}

function initCardBeams() {

  const SEL = ".card, .svc, .tstep, .stat, .project-card, .member, .chart-card, .verify-block, .gc-cart, .cart-fab, #chatbot-window, .glass-card";
  const beamify = () => {
    document.querySelectorAll(SEL).forEach((c) => {
      if (c.querySelector(":scope > .beam-ring")) return;
      if (getComputedStyle(c).position === "static") c.style.position = "relative";
      const b = document.createElement("i");
      b.className = "beam-ring";
      b.style.animationDelay = (-Math.random() * 7).toFixed(2) + "s";
      b.style.animationDuration = (6 + Math.random() * 3).toFixed(2) + "s";
      c.appendChild(b);
    });
  };
  beamify();
  let t;
  new MutationObserver(() => {
    clearTimeout(t);
    t = setTimeout(beamify, 150);
  }).observe(document.body, { childList: true, subtree: true });
}

function initCardSpotlight() {

  document.addEventListener("mousemove", (e) => {
    const card = e.target.closest(".card, .svc, .tstep, .project-card, .chart-card, .member, .verify-block, .stat");
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
    card.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
  }, { passive: true });
}

function initCartFab() {

  if ($(".cart-fab")) return;
  const fab = document.createElement("button");
  fab.className = "cart-fab cart-open-trigger";
  fab.title = "Your cart";
  fab.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
    <span class="cart-badge">0</span>`;
  document.body.appendChild(fab);
}

function initNavbar() {
  buildNavbar();
  const bar = $("#topbar");
  const onScroll = () => bar.classList.toggle("scrolled", window.scrollY > 24);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function renderHeader() {
  const sel = $("#account-select");
  if (sel && state.accounts.length) {
    const prev = sel.value;
    sel.innerHTML = state.accounts.map((a) =>
      `<option value="${a.address}">${escapeHtml(a.label)} (${short(a.address)})</option>`
    ).join("");
    if (prev && state.accounts.some((a) => a.address === prev)) sel.value = prev;
  }

  const pill = $("#chain-pill");
  if (pill) {
    const on = !!(state.chain && state.chain.connected);
    pill.classList.toggle("online", on);
    pill.classList.toggle("offline", !on);
    const txt = $("#chain-pill-text");
    if (txt) txt.textContent = on
      ? (state.chain.embedded
          ? `embedded chain \u00b7 block ${state.chain.block_number}`
          : `chain ${state.chain.chain_id} \u00b7 block ${state.chain.block_number}`)
      : "chain offline";
  }
}

function showBackendBanner() {

}

async function refreshHeader() {
  try {
    const [chain, accounts] = await Promise.all([
      api("/api/chain/status"), api("/api/accounts"),
    ]);
    state.chain = chain;
    state.accounts = accounts;
  } catch {

    const live = await probeBackend();
    if (live && live !== window.location.origin) {
      if (ON_STATIC_PREVIEW) API_BASE = live;
      showBackendBanner(live);
      state.chain = null;
      state.accounts = [];
    } else if (live) {
      showBackendBanner(live);
      state.chain = null;
      state.accounts = [];
    } else {
      showBackendBanner(null);
      state.chain = null;
      state.accounts = [];
    }
  }
  renderHeader();
}

async function refreshUser() {
  const token = localStorage.getItem("carbonyx_token");
  if (!token) { state.user = null; renderUserSlot(); return; }

  if (token.startsWith("local_")) {
    try { state.user = JSON.parse(localStorage.getItem("carbonyx_local_user") || "null"); }
    catch { state.user = null; }
    renderUserSlot();
    return;
  }
  try {
    state.user = await api("/api/auth/me");
  } catch {

    const local = JSON.parse(localStorage.getItem("carbonyx_local_user") || "null");
    if (local) { state.user = local; }
    else { localStorage.removeItem("carbonyx_token"); state.user = null; }
  }
  renderUserSlot();
}

function initReveal() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.16 });
  $$(".reveal, .timeline").forEach((el) => io.observe(el));
}

function setCounter(id, value) {
  const el = document.getElementById(id);
  if (el) el.dataset.count = value;
}

function animateCounters() {
  $$("[data-count]").forEach((el) => {
    const target = Number(el.dataset.count) || 0;
    const dur = 1300 + Math.random() * 500;
    const t0 = performance.now();
    const suffix = el.dataset.suffix || "";
    const dec = Number(el.dataset.decimals || 0);
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * eased, dec) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function initParticles() {
  let canvas = $("#particles");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "particles";
    ($(".bg-fx") || document.body).appendChild(canvas);
  }
  const ctx = canvas.getContext("2d");
  let W, H, dots = [], nodes = [], stars = [];
  let starRot = 0;
  const STAR_HUES = ["255,233,184", "255,233,184", "245,166,35", "167,139,250", "34,211,238"];
  const PRISM_HUES = ["245,166,35", "139,92,246", "34,211,238", "244,114,182", "255,213,126"];

  function resize() {
    W = canvas.width = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
    const count = Math.min(70, Math.floor((W * H) / 20000));
    dots = Array.from({ length: count }, () => spawnDot(true));
    const nodeCount = Math.min(26, Math.max(10, Math.floor((W * H) / 60000)));
    nodes = Array.from({ length: nodeCount }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      r: 1.4 + Math.random() * 2.2,
      tw: Math.random() * Math.PI * 2,
      tws: 0.005 + Math.random() * 0.015,
      hue: PRISM_HUES[Math.floor(Math.random() * PRISM_HUES.length)],
    }));
    const starCount = Math.min(190, Math.floor((W * H) / 8000));
    stars = Array.from({ length: starCount }, () => ({
      ang: Math.random() * Math.PI * 2,
      rad: (0.08 + Math.pow(Math.random(), 0.7)) * (Math.max(W, H) * 0.75),
      r: 0.5 + Math.random() * 1.6,
      tw: Math.random() * Math.PI * 2,
      tws: 0.006 + Math.random() * 0.022,
      hue: STAR_HUES[Math.floor(Math.random() * STAR_HUES.length)],
      drift: 0.00022 + Math.random() * 0.00045,
      spark: Math.random() < 0.07,
    }));
  }

  function spawnDot(anywhere) {

    const hues = PRISM_HUES;
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : H + 12,
      r: 0.6 + Math.random() * 2.0,
      vy: 0.10 + Math.random() * 0.4,
      vx: (Math.random() - 0.5) * 0.18,
      hue: hues[Math.floor(Math.random() * hues.length)],
      tw: Math.random() * Math.PI * 2,
      tws: 0.008 + Math.random() * 0.02,
    };
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);

    starRot += 0.00055;
    const cx = W * 0.5, cy = H * 0.44;
    for (const s of stars) {
      const a = s.ang + starRot * (0.5 + (s.r / 2.1) * 0.6);
      const x = cx + Math.cos(a) * s.rad;
      const y = cy + Math.sin(a) * s.rad * 0.62;
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      s.tw += s.tws;
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s.tw));
      const glow = s.r * 3.2 * tw;
      ctx.beginPath();
      ctx.arc(x, y, s.r * (0.75 + 0.45 * tw), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${s.hue},${Math.min(1, 0.95 * tw + 0.1).toFixed(3)})`;
      ctx.shadowColor = `rgba(${s.hue},0.95)`;
      ctx.shadowBlur = glow * 3.2;
      ctx.fill();
      ctx.shadowBlur = 0;
      if (s.spark) {

        const len = (5 + s.r * 4) * (0.6 + 0.7 * tw);
        const rot = a * 1.6 + s.tw * 0.4;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.strokeStyle = `rgba(${s.hue},${(0.75 * tw).toFixed(3)})`;
        ctx.lineWidth = 1;
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(len, 0);
          ctx.stroke();
          ctx.rotate(Math.PI / 2);
        }
        ctx.restore();
      }
    }

    const maxDist = 150;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;
      n.tw += n.tws;
      for (let j = i + 1; j < nodes.length; j++) {
        const m = nodes[j];
        const dx = n.x - m.x, dy = n.y - m.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist) {
          const a = (1 - dist / maxDist) * 0.14;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(m.x, m.y);
          ctx.strokeStyle = `rgba(${n.hue},${a.toFixed(3)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
      const glow = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(n.tw * 2));
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${n.hue},${(0.35 * glow).toFixed(3)})`;
      ctx.shadowColor = `rgba(${n.hue},0.8)`;
      ctx.shadowBlur = 10 * glow;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    dots.forEach((d) => {
      d.y -= d.vy;
      d.x += d.vx + Math.sin(d.tw) * 0.12;
      d.tw += d.tws;
      if (d.y < -12 || d.x < -12 || d.x > W + 12) Object.assign(d, spawnDot(false));
      const glow = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(d.tw * 2));
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${d.hue},${(0.28 * glow).toFixed(3)})`;
      ctx.shadowColor = `rgba(${d.hue},0.75)`;
      ctx.shadowBlur = 7 * glow;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);
}

function buildModal() {
  if ($("#modal")) return;
  const backdrop = document.createElement("div");
  backdrop.id = "modal";
  backdrop.className = "modal-backdrop hidden";
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h3 id="modal-title"></h3>
        <button id="modal-close" class="xbtn">\u00d7</button>
      </div>
      <div id="modal-body"></div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.classList.add("hidden");
  });
  backdrop.querySelector("#modal-close").addEventListener("click",
    () => backdrop.classList.add("hidden"));
}

document.addEventListener("DOMContentLoaded", async () => {
  initCardBeams();
  initCardSpotlight();
  initCartFab();
  initNavbar();
  buildModal();
  initReveal();
  initParticles();
  renderUserSlot();
  renderHeader();
  $$(".pillnav select, #account-select, #demo-regions, #m-project").forEach(enhanceSelect);

  const sel = $("#account-select");
  if (sel) {
    sel.addEventListener("change", () => {
      document.dispatchEvent(new CustomEvent("carbonyx:account", { detail: sel.value }));
      const addr = sel.value;
      if (!addr || !protectedRole(addr) || (state.roleTokens || {})[addr]) return;
      const safe = (state.accounts || []).find((a) =>
        a.label !== "Platform Admin" && a.label !== "Verifier");
      const safeAddr = safe ? safe.address : "";
      openRoleUnlock(addr, () => {
        if (!safeAddr) return;
        sel.value = safeAddr;
        sel.dispatchEvent(new Event("change"));
      });
    });
  }
  try { state.roleTokens = JSON.parse(sessionStorage.getItem("carbonyx_role_tokens") || "{}"); }
  catch { state.roleTokens = {}; }

  $$(".cart-open-trigger").forEach((b) => b.addEventListener("click", () => {
    if (typeof Cart !== "undefined") Cart.open();
  }));

  await refreshHeader();
  await refreshUser();
  if (state.config === null) {
    try { state.config = await api("/api/config"); } catch {   }
  }
  animateCounters();
  document.dispatchEvent(new CustomEvent("carbonyx:ready"));
});
