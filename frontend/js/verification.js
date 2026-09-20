"use strict";

function actingRole() {
  const sel = document.getElementById("account-select");
  const addr = sel ? sel.value : "";
  const list = (typeof state !== "undefined" && state.accounts) || [];
  const acc = list.find((a) => a.address === addr) || list[0];
  return acc ? acc.label : null;
}

async function initVerification() {
  await renderVerification();

  const sel = document.getElementById("account-select");
  if (sel) sel.addEventListener("change", () => renderVerification());
}

async function renderVerification() {
  const el = $("#verification-list");
  if (!el) return;
  el.innerHTML = `<div class="skel"></div>`;
  try {
    const projects = await api("/api/projects");
    if (!projects.length) {
      el.innerHTML = `<div class="empty">No projects yet - register one on the Projects page first.</div>`;
      return;
    }
    const role = actingRole();
    const canVerifyRole = !role || role === "Verifier";
    const canMintRole = !role || role === "Project Owner";
    el.innerHTML = projects.map((p, i) => {
      const rep = p.report;
      const canDecide = ["quantified", "rejected", "pending"].includes(p.status);
      const canMint = p.status === "verified";
      const flags = rep && rep.risk_flags && rep.risk_flags.length
        ? `<div class="flags-panel"><h5>System risk flags</h5><ul>${rep.risk_flags.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul></div>` : "";
      const reco = rep && rep.recommendation
        ? `<div class="reco-line">${escapeHtml(rep.recommendation)}</div>` : "";
      return `
      <div class="verify-block" style="--i:${i}">
        <b>${escapeHtml(p.name)}</b>
        <span class="chip ${p.status}">${p.status}</span>
        <div class="meta hint" style="margin-top:8px">
          ${rep ? `Area ${fmt(rep.area_ha, 1)} ha \u00b7 stock ${fmt(rep.stock_tco2e)} tCO\u2082e \u00b7
                   projected credits ${fmt(rep.issueable_tco2e)} \u00b7 confidence ${(rep.confidence * 100).toFixed(0)}%` :
                  "Not quantified yet."}
          ${p.verifier_note ? `<br>Verifier note: ${escapeHtml(p.verifier_note)}` : ""}
        </div>
        ${flags}${reco}
        <div class="row">
          ${canDecide ? (canVerifyRole ? `
            <input type="text" id="note-${p.id}" placeholder="Verification note (optional)" style="flex:1;min-width:220px">
            <button class="btn good small" data-act="approve" data-id="${p.id}">Approve</button>
            <button class="btn danger small" data-act="reject" data-id="${p.id}">Reject</button>` : `<span class="locked-chip">\uD83D\uDD12 Verifier role required \u2014 switch to the Verifier account</span>`) : ""}
          ${canMint ? (canMintRole ? `<button class="btn primary small" data-act="mint" data-id="${p.id}">Mint ${fmt(rep.issueable_tco2e)} CBX</button>` : `<span class="locked-chip">\uD83D\uDD12 Only the Project Owner can mint</span>`) : ""}
          ${p.status === "minted" ? `<span class="hint">Credits already minted for this project.</span>` : ""}
          ${p.status === "pending" ? `<span class="hint">Run quantification on the Projects page first.</span>` : ""}
        </div>
      </div>`;
    }).join("");

    el.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.onclick = () => {
        const id = Number(btn.dataset.id);
        const note = (document.getElementById(`note-${id}`) || {}).value || "";
        if (btn.dataset.act === "approve") doVerify(id, "approve", note, btn);
        if (btn.dataset.act === "reject") doVerify(id, "reject", note, btn);
        if (btn.dataset.act === "mint") doMint(id, btn);
      };
    });
  } catch (e) { el.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
}

async function doVerify(id, decision, note, btn) {
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    await api(`/api/projects/${id}/verify`, {
      method: "POST",
      body: JSON.stringify({ decision, note, verifier: actorByRole("verifier") }),
    });
    toast(decision === "approve"
      ? "Approved - report hash anchored on-chain."
      : "Project rejected.");
    renderVerification();
  } catch (e) {
    btn.disabled = false; btn.textContent = decision;
    if (String(e.message).includes("Password unlock required")) {
      toast("This role is password protected - unlock to continue", true);
      window.openRoleUnlock(document.getElementById("account-select").value);
    } else toast(e.message, true);
  }
}

async function doMint(id, btn) {
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Minting...';
  try {
    const p = await api(`/api/projects/${id}/mint`, {
      method: "POST",
      body: JSON.stringify({ owner: actorByRole("owner") }),
    });
    toast(`Minted ${fmt(p.mint.amount)} CBX credits (1 CBX = 1 tCO\u2082e).`);
    renderVerification();
    refreshHeader();
  } catch (e) {
    btn.disabled = false; btn.textContent = "Mint";
    if (String(e.message).includes("Password unlock required")) {
      toast("This role is password protected - unlock to continue", true);
      window.openRoleUnlock(document.getElementById("account-select").value);
    } else toast(e.message, true);
  }
}

document.addEventListener("carbonyx:ready", initVerification);
