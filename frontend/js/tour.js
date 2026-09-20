"use strict";

(function () {
  const TOUR_STEPS = {
    dashboard: [
      { title: "Live network state", body: "These counters pull straight from the blockchain - projects registered, credits issued and total measured carbon stock.", sel: ".stat-strip" },
      { title: "Recent chain activity", body: "Every registration, verification, mint, purchase and retirement appears here with its block number.", sel: "#dash-events" },
      { title: "Quick actions", body: "Jump straight into the MRV pipeline: register a project, review verifications, or trade credits.", sel: null },
    ],
    projects: [
      { title: "Register a project", body: "Give the project a name, pick an ecosystem, and define its bounding box - or load a demo region like the Sundarbans with one click.", sel: ".card" },
      { title: "Run the engine", body: "Quantify runs satellite classification, the InVEST carbon model and an ML cross-check - then anchors a SHA-256 report hash.", sel: "#projects-list" },
      { title: "View the report", body: "Each project card opens the full verification report: classified map, carbon metrics, risk flags and a 20-year time-lapse projection.", sel: "#projects-list" },
    ],
    verification: [
      { title: "You are the verifier", body: "Review each project's quantification summary, risk flags and the system's recommendation before deciding.", sel: "#verification-list" },
      { title: "Approve or reject", body: "Approving writes the report hash on-chain. Rejected projects can be re-quantified and re-submitted.", sel: "#verification-list" },
      { title: "Mint credits", body: "Once approved, the owner mints CBX credits - 1 credit = 1 tonne of CO2-equivalent.", sel: "#verification-list" },
    ],
    marketplace: [
      { title: "List credits for sale", body: "Project owners escrow their CBX credits in the marketplace contract and set an ETH price per credit.", sel: ".grid-2 .card" },
      { title: "Buy or retire", body: "Buyers purchase whole listings. Retiring burns credits permanently and instantly generates a printable certificate.", sel: ".grid-2 .card:nth-child(2)" },
      { title: "Active listings", body: "Every trade emits an on-chain event - audit the whole history in the Chain Log.", sel: "#listings-table" },
    ],
  };

  const steps = TOUR_STEPS[document.body.dataset.page] || [];
  if (!steps.length) return;

  let idx = 0;
  const overlay = document.createElement("div");
  overlay.className = "tour-overlay";
  const spot = document.createElement("div");
  spot.className = "tour-spot";
  const card = document.createElement("div");
  card.className = "tour-card";

  function positionCard(target) {
    const t = target ? target.getBoundingClientRect()
      : { left: innerWidth / 2 - 180, top: innerHeight / 3, width: 0, height: 0 };
    let left = t.left + t.width / 2 - 180;
    let top = t.bottom + 18;
    left = Math.max(14, Math.min(innerWidth - 374, left));
    if (top + 190 > innerHeight) top = Math.max(14, t.top - 200);
    card.style.left = left + "px";
    card.style.top = top + "px";
  }

  function render() {
    const step = steps[idx];
    const target = step.sel ? $(step.sel) : null;
    if (target) {
      const r = target.getBoundingClientRect();
      spot.style.left = (r.left - 8) + "px";
      spot.style.top = (r.top - 8) + "px";
      spot.style.width = (r.width + 16) + "px";
      spot.style.height = (r.height + 16) + "px";
      spot.style.display = "block";
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      setTimeout(() => positionCard(target), 120);
    } else {
      spot.style.display = "none";
      positionCard(null);
    }
    card.innerHTML = `
      <h4>${step.title}</h4>
      <p>${step.body}</p>
      <div class="row">
        <span class="step">${idx + 1} / ${steps.length}</span>
        <span style="display:flex;gap:8px">
          ${idx > 0 ? '<button class="btn ghosty small" id="tour-prev">Back</button>' : ""}
          ${idx < steps.length - 1
            ? '<button class="btn primary small" id="tour-next">Next</button>'
            : '<button class="btn good small" id="tour-done">Finish</button>'}
          <button class="btn danger small" id="tour-skip">Skip</button>
        </span>
      </div>`;
    document.body.appendChild(overlay);
    document.body.appendChild(spot);
    document.body.appendChild(card);
    overlay.classList.add("active");
    card.querySelector("#tour-next")?.addEventListener("click", () => { idx++; render(); });
    card.querySelector("#tour-prev")?.addEventListener("click", () => { idx--; render(); });
    card.querySelector("#tour-done")?.addEventListener("click", close);
    card.querySelector("#tour-skip")?.addEventListener("click", close);
  }

  function close() {
    overlay.classList.remove("active");
    overlay.remove(); spot.remove(); card.remove();
  }

  const fab = document.createElement("button");
  fab.className = "tour-fab";
  fab.textContent = "Start guided tour";
  fab.addEventListener("click", () => { idx = 0; render(); });
  document.body.appendChild(fab);

  window.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("active")) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowRight" && idx < steps.length - 1) { idx++; render(); }
    if (e.key === "ArrowLeft" && idx > 0) { idx--; render(); }
  });
})();
