"use strict";

(function () {
  const canvas = document.getElementById("worldmap");
  if (!canvas) return;

  const ECO_COLOR = { mangrove: "#34d399", seagrass: "#38bdf8", saltmarsh: "#f5a623" };
  const ECO_LABEL = { mangrove: "Mangrove", seagrass: "Seagrass", saltmarsh: "Salt marsh" };
  const ctx = canvas.getContext("2d");

  let view = { cx: 78, cy: 14, scale: 7.4 };
  let projects = [];
  let filtered = [];
  let hoverItem = null;
  let activeFilter = "all";
  let searchTerm = "";
  let searchMarker = null;
  let dragging = false, dragMoved = false, lastX = 0, lastY = 0;
  let ecoZones = window.ECO_DB || [];

  const tooltip = document.createElement("div");
  tooltip.className = "map-tip";
  document.body.appendChild(tooltip);

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  function lonLatToXY(lon, lat) {
    const r = canvas.getBoundingClientRect();
    const w = r.width, h = r.height;
    const ux = (lon + 180) / 360, uy = (90 - lat) / 180;
    const spanX = 360 / view.scale;
    const spanY = spanX * (h / w);
    const left = view.cx - spanX / 2, top = view.cy - spanY / 2;
    return [((ux * 360 - left) / spanX) * w, ((uy * 180 - top) / spanY) * h];
  }

  function xyToLonLat(px, py) {
    const r = canvas.getBoundingClientRect();
    const w = r.width, h = r.height;
    const spanX = 360 / view.scale;
    const spanY = spanX * (h / w);
    const left = view.cx - spanX / 2, top = view.cy - spanY / 2;
    const lon = (px / w) * spanX + left - 180;
    const lat = 90 - ((py / h) * spanY + top);
    return [lon, lat];
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw() {
    const r = canvas.getBoundingClientRect();
    const w = r.width, h = r.height;
    ctx.clearRect(0, 0, w, h);

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#0a1a24");
    grad.addColorStop(0.5, "#061826");
    grad.addColorStop(1, "#02080f");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const rg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
    rg.addColorStop(0, "rgba(14,58,74,0.3)");
    rg.addColorStop(1, "transparent");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(34,211,238,0.04)";
    ctx.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 30) {
      const [x] = lonLatToXY(lon, 0);
      if (x >= 0 && x <= w) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    }
    for (let lat = -60; lat <= 90; lat += 30) {
      const [, y] = lonLatToXY(0, lat);
      if (y >= 0 && y <= h) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    }

    ctx.strokeStyle = "rgba(16,185,129,0.12)";
    const [, eq] = lonLatToXY(0, 0);
    if (eq >= 0 && eq <= h) { ctx.beginPath(); ctx.moveTo(0, eq); ctx.lineTo(w, eq); ctx.stroke(); }

    ctx.fillStyle = "#0e2030";
    ctx.strokeStyle = "rgba(16,185,129,0.22)";
    ctx.lineWidth = 1;
    for (const country of window.WORLD_GEOJSON || []) {
      for (const ring of country.p) {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < ring.length; i++) {
          const [x, y] = lonLatToXY(ring[i][0], ring[i][1]);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        if (view.scale > 3) ctx.stroke();
      }
    }

    for (let i = 0; i < ecoZones.length; i++) {
      const e = ecoZones[i];
      const [x, y] = lonLatToXY(e[2], e[3]);
      if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
      const color = ECO_COLOR[e[1]] || "#34d399";
      const isHover = hoverItem && hoverItem.type === "eco" && hoverItem.id === i;
      const t = performance.now() / 600;
      const pulse = 3 + Math.sin(t + i) * 1.5;

      ctx.beginPath();
      ctx.arc(x, y, pulse + 6, 0, Math.PI * 2);
      ctx.fillStyle = color + "15";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, isHover ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = isHover ? 18 : 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (view.scale > 15 || isHover) {
        ctx.font = "600 10px Inter, sans-serif";
        ctx.fillStyle = isHover ? "#fff" : "rgba(255,255,255,0.6)";
        ctx.textAlign = "center";
        const name = e[0].length > 20 ? e[0].slice(0, 18) + "..." : e[0];
        ctx.fillText(name, x, y - 12);
      }
    }

    for (const p of filtered) {
      const b = p.bounds;
      const [x1, y1] = lonLatToXY(b[0], b[3]);
      const [x2, y2] = lonLatToXY(b[2], b[1]);
      const color = ECO_COLOR[p.ecosystem] || "#34d399";
      const isHover = hoverItem && hoverItem.type === "project" && hoverItem.id === p.id;

      ctx.fillStyle = color + (isHover ? "44" : "22");
      ctx.strokeStyle = color + (isHover ? "ff" : "99");
      ctx.lineWidth = isHover ? 2.5 : 1.5;
      const rx = Math.max(5, x2 - x1), ry = Math.max(5, y2 - y1);
      ctx.beginPath();
      if (ctx.roundRect) { ctx.roundRect(x1, y1, rx, ry, 5); }
      else { ctx.rect(x1, y1, rx, ry); }
      ctx.fill(); ctx.stroke();

      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      const t = performance.now() / 500;
      const pulse = 4 + Math.sin(t + p.id) * 2.2;
      ctx.beginPath();
      ctx.arc(cx, cy, pulse + 7, 0, Math.PI * 2);
      ctx.fillStyle = color + "22";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = isHover ? 22 : 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (view.scale > 12 || isHover) {
        ctx.font = "600 11px Inter, sans-serif";
        ctx.fillStyle = isHover ? "#fff" : "rgba(255,255,255,0.7)";
        ctx.textAlign = "center";
        ctx.fillText(p.name, cx, cy - Math.max(ry, 12) - 8);
      }
    }

    if (searchMarker) {
      const [mx, my] = lonLatToXY(searchMarker.lon, searchMarker.lat);
      const t = performance.now() / 400;
      const pulse = 10 + Math.sin(t) * 4;

      ctx.beginPath();
      ctx.arc(mx, my, pulse + 14, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(34,211,238,0.08)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(mx, my, pulse, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(34,211,238,0.5)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mx, my, 7, 0, Math.PI * 2);
      ctx.fillStyle = "#f5a623";
      ctx.shadowColor = "#f5a623";
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();

      ctx.font = "700 12px Inter, sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(searchMarker.label, mx, my - 24);

      if (searchMarker.nearby) {
        for (const n of searchMarker.nearby.slice(0, 5)) {
          const [ex, ey] = lonLatToXY(n.lon, n.lat);
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(ex, ey);
          ctx.strokeStyle = ECO_COLOR[n.eco] + "33";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  }

  setInterval(() => { if (!dragging) draw(); }, 220);

  function itemAt(mx, my) {

    for (let i = ecoZones.length - 1; i >= 0; i--) {
      const e = ecoZones[i];
      const [x, y] = lonLatToXY(e[2], e[3]);
      const dx = mx - x, dy = my - y;
      if (dx * dx + dy * dy < 144) return { type: "eco", id: i, data: e };
    }

    for (const p of filtered) {
      const b = p.bounds;
      let [x1, y1] = lonLatToXY(b[0], b[3]);
      let [x2, y2] = lonLatToXY(b[2], b[1]);
      const w = Math.max(16, x2 - x1), h = Math.max(16, y2 - y1);
      x2 = x1 + w; y2 = y1 + h;
      if (mx >= x1 && mx <= x2 && my >= y1 && my <= y2) return { type: "project", id: p.id, data: p };
    }
    return null;
  }

  canvas.addEventListener("mousedown", (e) => {
    dragging = true; dragMoved = false; lastX = e.clientX; lastY = e.clientY;
    canvas.classList.add("dragging");
  });
  window.addEventListener("mouseup", () => { dragging = false; canvas.classList.remove("dragging"); });
  canvas.addEventListener("mousemove", (e) => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
      const spanX = 360 / view.scale;
      const spanY = spanX * (r.height / r.width);
      view.cx -= (dx / r.width) * spanX;
      view.cy -= (dy / r.height) * spanY;
      lastX = e.clientX; lastY = e.clientY;
      draw(); return;
    }
    const item = itemAt(mx, my);
    const newHover = item ? item.type + ":" + item.id : null;
    const oldHover = hoverItem ? hoverItem.type + ":" + hoverItem.id : null;
    if (newHover !== oldHover) {
      hoverItem = item;
      draw();
    }
    if (item) {
      tooltip.style.display = "block";
      if (item.type === "eco") {
        const e = item.data;
        tooltip.innerHTML = '<b style="color:#fff">' + escapeHtml(e[0]) + '</b><br>' +
          '<span class="mono" style="color:' + ECO_COLOR[e[1]] + '">' + ECO_LABEL[e[1]] + '</span> \u2014 ' +
          escapeHtml(e[4]) + '<br><span style="color:var(--muted);font-size:.7rem">' + escapeHtml(e[5]) + '</span>';
      } else {
        const p = item.data;
        tooltip.innerHTML = '<b style="color:#fff">' + escapeHtml(p.name) + '</b><br>' +
          '<span class="mono">' + ECO_LABEL[p.ecosystem] + ' \u2014 ' + escapeHtml(p.country || "") + '</span><br>' +
          (p.report ? '<span style="color:#34d399">' + fmt(p.report.stock_tco2e) + ' tCO\u2082e stock</span>' : 'registered project');
      }
      tooltip.style.left = (e.clientX + 16) + "px";
      tooltip.style.top = (e.clientY + 12) + "px";
      canvas.style.cursor = "pointer";
    } else {
      tooltip.style.display = "none";
      canvas.style.cursor = "";
    }
    const [lon, lat] = xyToLonLat(mx, my);
    const cd = document.getElementById("map-coords");
    if (cd) cd.textContent = Math.abs(lat).toFixed(1) + "\u00b0" + (lat >= 0 ? "N" : "S") + "  " + Math.abs(lon).toFixed(1) + "\u00b0" + (lon >= 0 ? "E" : "W");
  });
  canvas.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
    const cd = document.getElementById("map-coords");
    if (cd) cd.textContent = "\u2014";
  });
  canvas.addEventListener("click", (e) => {
    if (dragMoved) return;
    const r = canvas.getBoundingClientRect();
    const item = itemAt(e.clientX - r.left, e.clientY - r.top);
    if (item && item.type === "project" && typeof doShowReport === "function") doShowReport(item.id);
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    view.scale = Math.min(160, Math.max(1.2, view.scale * factor));
    draw();
  }, { passive: false });

  $("#map-zoom-in")?.addEventListener("click", () => { view.scale = Math.min(160, view.scale * 1.4); draw(); });
  $("#map-zoom-out")?.addEventListener("click", () => { view.scale = Math.max(1.2, view.scale / 1.4); draw(); });
  $("#map-reset")?.addEventListener("click", () => {
    view = { cx: 78, cy: 14, scale: 7.4 };
    searchMarker = null;
    draw();
  });
  window.addEventListener("resize", resize);

  function applyFilters() {
    const term = searchTerm.toLowerCase().trim();
    filtered = projects.filter((p) => {
      if (activeFilter !== "all" && p.ecosystem !== activeFilter) return false;
      if (!term) return true;
      const hay = ((p.name || "") + " " + (p.country || "") + " " + (p.ecosystem || "") + " " + (ECO_LABEL[p.ecosystem] || "")).toLowerCase();
      return hay.includes(term);
    });
    draw();
    renderResults();
    updateStats();
  }

  function renderResults() {
    const box = document.getElementById("map-results");
    if (!box) return;
    const term = searchTerm.toLowerCase().trim();

    let cityResults = [];
    if (term && term.length >= 1) {
      cityResults = (window.CITY_DB || []).filter((c) => {
        return (c[0] + " " + c[1]).toLowerCase().includes(term);
      }).slice(0, 6);
    }

    let ecoResults = [];
    if (term && term.length >= 1) {
      ecoResults = ecoZones.filter((e) => {
        return (e[0] + " " + e[4] + " " + e[1] + " " + ECO_LABEL[e[1]]).toLowerCase().includes(term);
      }).slice(0, 6);
    }

    let nearbyHtml = "";
    if (searchMarker && searchMarker.nearby) {
      nearbyHtml = '<div class="results-section"><div class="results-section-label">Near ' + escapeHtml(searchMarker.label) + '</div>';
      nearbyHtml += searchMarker.nearby.slice(0, 10).map((n) => {
        const color = ECO_COLOR[n.eco];
        return '<div class="proj-result" data-eco-lon="' + n.lon + '" data-eco-lat="' + n.lat + '" data-eco-name="' + escapeHtml(n.name) + '">' +
          '<div class="pr-dot" style="background:' + color + ';box-shadow:0 0 8px ' + color + '"></div>' +
          '<div class="pr-info"><div class="pr-name">' + escapeHtml(n.name) + '</div>' +
          '<div class="pr-meta">' + ECO_LABEL[n.eco] + ' \u00b7 ' + escapeHtml(n.country) + '</div></div>' +
          '<div class="pr-stock">' + n.dist + '<small>km away</small></div></div>';
      }).join("");
      nearbyHtml += '</div>';
    }

    let projHtml = "";
    if (filtered.length > 0) {
      projHtml = '<div class="results-section"><div class="results-section-label">Registered Projects (' + filtered.length + ')</div>';
      projHtml += filtered.map((p) => {
        const color = ECO_COLOR[p.ecosystem] || "#34d399";
        const stock = p.report ? fmt(Math.round(p.report.stock_tco2e)) : "\u2014";
        return '<div class="proj-result" data-pid="' + p.id + '">' +
          '<div class="pr-dot" style="background:' + color + ';box-shadow:0 0 8px ' + color + '"></div>' +
          '<div class="pr-info"><div class="pr-name">' + escapeHtml(p.name) + '</div>' +
          '<div class="pr-meta">' + escapeHtml(p.country || "") + ' \u00b7 ' + ECO_LABEL[p.ecosystem] + '</div></div>' +
          '<div class="pr-stock">' + stock + '<small>tCO\u2082e</small></div></div>';
      }).join("");
      projHtml += '</div>';
    }

    let ecoHtml = "";
    if (ecoResults.length > 0) {
      ecoHtml = '<div class="results-section"><div class="results-section-label">Ecosystem Sites (' + ecoResults.length + ')</div>';
      ecoHtml += ecoResults.map((e) => {
        const color = ECO_COLOR[e[1]];
        return '<div class="proj-result" data-eco-lon="' + e[2] + '" data-eco-lat="' + e[3] + '" data-eco-name="' + escapeHtml(e[0]) + '">' +
          '<div class="pr-dot" style="background:' + color + ';box-shadow:0 0 8px ' + color + '"></div>' +
          '<div class="pr-info"><div class="pr-name">' + escapeHtml(e[0]) + '</div>' +
          '<div class="pr-meta">' + escapeHtml(e[4]) + ' \u00b7 ' + ECO_LABEL[e[1]] + '</div></div>' +
          '<div class="pr-stock" style="color:' + color + '">' + ECO_LABEL[e[1]] + '</div></div>';
      }).join("");
      ecoHtml += '</div>';
    }

    let cityHtml = "";
    if (cityResults.length > 0) {
      cityHtml = '<div class="results-section"><div class="results-section-label">Locations (' + cityResults.length + ')</div>';
      cityHtml += cityResults.map((c) => {
        return '<div class="city-result" data-lon="' + c[2] + '" data-lat="' + c[3] + '" data-name="' + escapeHtml(c[0]) + '">' +
          '<svg class="city-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
          '<div class="city-info"><div class="city-name">' + escapeHtml(c[0]) + '</div><div class="city-country">' + escapeHtml(c[1]) + '</div></div>' +
          '<div class="city-fly">\u2192</div></div>';
      }).join("");
      cityHtml += '</div>';
    }

    let html = nearbyHtml + projHtml + ecoHtml + cityHtml;
    if (!html) {
      if (!term) {
        html = '<div class="results-section"><div class="results-section-label">All Ecosystem Sites (' + ecoZones.length + ')</div>';
        html += ecoZones.slice(0, 20).map((e) => {
          const color = ECO_COLOR[e[1]];
          return '<div class="proj-result" data-eco-lon="' + e[2] + '" data-eco-lat="' + e[3] + '" data-eco-name="' + escapeHtml(e[0]) + '">' +
            '<div class="pr-dot" style="background:' + color + ';box-shadow:0 0 8px ' + color + '"></div>' +
            '<div class="pr-info"><div class="pr-name">' + escapeHtml(e[0]) + '</div>' +
            '<div class="pr-meta">' + escapeHtml(e[4]) + ' \u00b7 ' + ECO_LABEL[e[1]] + '</div></div></div>';
        }).join("");
        html += '</div>';
      } else {
        html = '<p class="map-empty">No results. Try "Nagpur", "mangrove", "Australia", etc.</p>';
      }
    }

    box.innerHTML = html;

    box.querySelectorAll("[data-pid]").forEach((el) => {
      el.addEventListener("click", () => {
        const pid = parseInt(el.dataset.pid);
        const p = projects.find((x) => x.id === pid);
        if (p) flyToProject(p);
        if (typeof doShowReport === "function") doShowReport(pid);
      });
    });
    box.querySelectorAll("[data-lon]").forEach((el) => {
      el.addEventListener("click", () => {
        flyToLocation(parseFloat(el.dataset.lon), parseFloat(el.dataset.lat), el.dataset.name);
      });
    });
    box.querySelectorAll("[data-eco-lon]").forEach((el) => {
      el.addEventListener("click", () => {
        flyToLocation(parseFloat(el.dataset.ecoLon), parseFloat(el.dataset.ecoLat), el.dataset.ecoName);
      });
    });
  }

  function flyToProject(p) {
    const b = p.bounds;
    const cx = (b[0] + b[2]) / 2;
    const cy = (b[1] + b[3]) / 2;
    const span = Math.max(b[2] - b[0], b[3] - b[1]);
    view.cx = cx + 180;
    view.cy = 90 - cy;
    view.scale = Math.min(80, Math.max(10, 30 / Math.max(span, 1)));
    searchMarker = null;
    draw();
  }

  function flyToLocation(lon, lat, name) {
    view.cx = lon + 180;
    view.cy = 90 - lat;
    view.scale = 50;

    const nearby = ecoZones.map((e) => ({
      name: e[0], eco: e[1], lon: e[2], lat: e[3], country: e[4], dist: haversine(lat, lon, e[3], e[2])
    })).sort((a, b) => a.dist - b.dist);
    searchMarker = { lon, lat, label: name, nearby: nearby };
    draw();
    renderResults();
    toast("Showing " + name + " \u2014 " + nearby.length + " ecosystem sites found nearby");
  }

  function updateStats() {
    const sc = (id) => document.getElementById(id);
    if (sc("ms-count")) sc("ms-count").textContent = filtered.length;
    const stock = filtered.reduce((s, p) => s + (p.report ? p.report.stock_tco2e : 0), 0);
    if (sc("ms-stock")) sc("ms-stock").textContent = fmt(Math.round(stock));
    const countries = new Set(filtered.map((p) => p.country).filter(Boolean));
    if (sc("ms-countries")) sc("ms-countries").textContent = countries.size;
  }

  const searchInput = document.getElementById("map-search");
  if (searchInput) {
    searchInput.addEventListener("input", () => { searchTerm = searchInput.value; applyFilters(); });
  }
  const clearBtn = document.getElementById("map-search-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      searchInput.value = ""; searchTerm = ""; searchMarker = null;
      activeFilter = "all";
      document.querySelectorAll(".filter-chip").forEach((c) => c.classList.toggle("active", c.dataset.filter === "all"));
      applyFilters();
    });
  }
  document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      activeFilter = chip.dataset.filter;
      applyFilters();
    });
  });

  document.addEventListener("carbonyx:ready", async () => {
    try { projects = await api("/api/projects"); } catch { projects = []; }
    filtered = projects;
    resize();
    renderResults();
    updateStats();
  });
})();
