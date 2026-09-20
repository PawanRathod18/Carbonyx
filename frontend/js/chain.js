"use strict";

async function initChainLog() {
  try {
    const events = await api("/api/events?limit=100");
    const body = $("#chainlog-body");
    body.innerHTML = events.map((e, i) => `
      <tr style="--i:${i}">
        <td class="mono">${e.id}</td>
        <td><b>${escapeHtml(e.event_name)}</b></td>
        <td class="mono">${e.actor ? short(e.actor) : "-"}</td>
        <td class="mono" style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(JSON.stringify(e.payload))}</td>
        <td class="mono">${e.block_number}</td>
        <td class="mono">${shortTx(e.tx_hash)}</td>
      </tr>`).join("");
    $("#chainlog-empty").style.display = events.length ? "none" : "block";
  } catch (e) { toast(e.message, true); }

  try {
    const blocks = await api("/api/chain/blocks?limit=12");
    const el = $("#chain-blocks");
    el.innerHTML = blocks.map((b, i) => `
      <div class="block-row" style="--i:${i}">
        <div class="head">
          <span class="bn">#${b.number}</span>
          <div class="meta">
            <span>${b.tx_count} tx</span>
            <span>gas ${fmt(b.gas_used)}</span>
            <span class="mono">${b.hash.slice(0, 22)}...</span>
          </div>
        </div>
        <div class="body">
          <span class="mono">full hash: ${b.hash}</span><br>
          <span class="mono">miner: ${b.miner}</span><br>
          <span class="mono">unix time: ${b.timestamp}</span>
        </div>
      </div>`).join("");
    el.querySelectorAll(".block-row .head").forEach((h) => {
      h.addEventListener("click", () => h.parentElement.classList.toggle("open"));
    });
    $("#chain-blocks-empty").style.display = blocks.length ? "none" : "block";
  } catch {   }
}

document.addEventListener("carbonyx:ready", initChainLog);
