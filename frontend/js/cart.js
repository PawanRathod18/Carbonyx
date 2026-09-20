"use strict";

const Cart = {
  items: [],

  load() {
    try {
      this.items = JSON.parse(localStorage.getItem("carbonyx_cart") || "[]");
    } catch { this.items = []; }
    this.updateBadge();
  },

  save() {
    localStorage.setItem("carbonyx_cart", JSON.stringify(this.items));
    this.updateBadge();
  },

  add(listing) {

    const existing = this.items.find((i) => i.id === listing.id);
    if (existing) {
      toast("This listing is already in your cart.");
      return;
    }
    this.items.push(listing);
    this.save();
    toast("Added to cart — " + fmt(listing.amount) + " tCO2e from " + listing.project_name);
  },

  remove(id) {
    this.items = this.items.filter((i) => i.id !== id);
    this.save();
    this.renderCart();
  },

  clear() {
    this.items = [];
    this.save();
  },

  count() {
    return this.items.length;
  },

  totalEth() {
    return this.items.reduce((s, i) => s + parseFloat(i.total_cost_eth || 0), 0);
  },

  totalCredits() {
    return this.items.reduce((s, i) => s + parseInt(i.amount || 0), 0);
  },

  updateBadge() {
    const badges = document.querySelectorAll(".cart-badge");
    const c = this.count();
    badges.forEach((badge) => {
      badge.textContent = c;
      badge.style.display = c > 0 ? "flex" : "none";
    });
  },

  renderCart() {
    const body = document.getElementById("cb-cart-body");
    if (!body) return;

    if (this.items.length === 0) {
      body.innerHTML = '<div class="cart-empty">Your cart is empty. Browse the <a href="marketplace.html">Marketplace</a> to add credits.</div>';
      const footer = document.getElementById("cb-cart-footer");
      if (footer) footer.style.display = "none";
      return;
    }

    body.innerHTML = this.items.map((item) => {
      const color = { mangrove: "#34d399", seagrass: "#38bdf8", saltmarsh: "#f5a623" }[item.ecosystem] || "#34d399";
      return '<div class="cart-item">' +
        '<div class="ci-dot" style="background:' + color + '"></div>' +
        '<div class="ci-info">' +
          '<div class="ci-name">' + escapeHtml(item.project_name) + '</div>' +
          '<div class="ci-meta">' + fmt(item.amount) + ' tCO2e \u00b7 ' + item.price_per_credit_eth + ' ETH/credit</div>' +
        '</div>' +
        '<div class="ci-price">' + item.total_cost_eth + ' ETH</div>' +
        '<button class="ci-remove" data-cid="' + item.id + '">&times;</button>' +
      '</div>';
    }).join("");

    const total = document.getElementById("cb-cart-total");
    if (total) total.innerHTML = '<span class="ct-label">Total</span><span class="ct-value">' + this.totalEth().toFixed(4) + ' ETH</span><span class="ct-credits">' + fmt(this.totalCredits()) + ' tCO2e</span>';

    const footer = document.getElementById("cb-cart-footer");
    if (footer) footer.style.display = "flex";

    body.querySelectorAll(".ci-remove").forEach((btn) => {
      btn.addEventListener("click", () => this.remove(parseInt(btn.dataset.cid)));
    });
  },

  open() {
    let modal = document.getElementById("cart-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "cart-modal";
      modal.className = "modal-backdrop";
      modal.innerHTML = `
        <div class="modal cart-modal-box">
          <div class="modal-head">
            <h3>Your Cart</h3>
            <button class="xbtn" id="cart-xbtn">&times;</button>
          </div>
          <div id="cb-cart-body"></div>
          <div class="cart-total-row" id="cb-cart-total"></div>
          <div class="cart-footer" id="cb-cart-footer">
            <button class="btn ghosty" id="cart-clear">Clear cart</button>
            <button class="btn primary" id="cart-checkout">Proceed to checkout <span class="arr">\u2192</span></button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector("#cart-xbtn").addEventListener("click", () => modal.classList.add("hidden"));
      modal.querySelector("#cart-clear").addEventListener("click", () => {
        if (confirm("Clear all items from cart?")) { this.clear(); this.renderCart(); }
      });
      modal.querySelector("#cart-checkout").addEventListener("click", () => {
        modal.classList.add("hidden");
        Checkout.open();
      });
    }
    this.renderCart();
    modal.classList.remove("hidden");
  },
};

const Checkout = {
  open() {
    let modal = document.getElementById("checkout-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "checkout-modal";
      modal.className = "modal-backdrop";
      modal.innerHTML = `
        <div class="modal checkout-box">
          <div class="modal-head">
            <h3>Checkout</h3>
            <button class="xbtn" id="ck-xbtn">&times;</button>
          </div>
          <div class="ck-summary">
            <div class="ck-row"><span>Items</span><b id="ck-items">0</b></div>
            <div class="ck-row"><span>Total credits</span><b id="ck-credits">0 tCO2e</b></div>
            <div class="ck-row ck-total"><span>Total amount</span><b id="ck-total">0 ETH</b></div>
          </div>
          <div class="ck-divider"></div>
          <div class="ck-payment-form">
            <div class="ck-form-title">Payment details</div>
            <label class="ck-label">Cardholder name
              <input type="text" id="ck-name" placeholder="PAWAN RATHOD" autocomplete="off">
            </label>
            <label class="ck-label">Card number
              <input type="text" id="ck-card" placeholder="4111 1111 1111 1111" maxlength="19" autocomplete="off">
            </label>
            <div class="ck-form-row">
              <label class="ck-label">Expiry
                <input type="text" id="ck-expiry" placeholder="MM/YY" maxlength="5" autocomplete="off">
              </label>
              <label class="ck-label">CVV
                <input type="text" id="ck-cvv" placeholder="123" maxlength="3" autocomplete="off">
              </label>
            </div>
            <div class="ck-badge">Demo payment — no real charges. Use any card details.</div>
          </div>
          <div class="cart-footer">
            <button class="btn ghosty" id="ck-back">Back to cart</button>
            <button class="btn primary" id="ck-pay">Pay now <span class="arr">\u2192</span></button>
          </div>
          <div class="ck-processing" id="ck-processing">
            <div class="ck-spinner"></div>
            <div class="ck-proc-text">Processing payment...</div>
            <div class="ck-proc-sub">Executing on-chain purchases</div>
          </div>
          <div class="ck-success" id="ck-success">
            <div class="ck-check-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <div class="ck-success-title">Payment successful!</div>
            <div class="ck-success-sub" id="ck-success-sub"></div>
            <button class="btn primary" id="ck-done">Done</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector("#ck-xbtn").addEventListener("click", () => modal.classList.add("hidden"));
      modal.querySelector("#ck-back").addEventListener("click", () => {
        modal.classList.add("hidden");
        Cart.open();
      });
      modal.querySelector("#ck-done").addEventListener("click", () => modal.classList.add("hidden"));

      const cardInput = modal.querySelector("#ck-card");
      cardInput.addEventListener("input", () => {
        let v = cardInput.value.replace(/\D/g, "").slice(0, 16);
        cardInput.value = v.replace(/(.{4})/g, "$1 ").trim();
      });
      const expInput = modal.querySelector("#ck-expiry");
      expInput.addEventListener("input", () => {
        let v = expInput.value.replace(/\D/g, "").slice(0, 4);
        if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
        expInput.value = v;
      });
      const cvvInput = modal.querySelector("#ck-cvv");
      cvvInput.addEventListener("input", () => {
        cvvInput.value = cvvInput.value.replace(/\D/g, "").slice(0, 3);
      });

      modal.querySelector("#ck-pay").addEventListener("click", () => this.processPayment());
    }

    modal.querySelector("#ck-items").textContent = Cart.count();
    modal.querySelector("#ck-credits").textContent = fmt(Cart.totalCredits()) + " tCO2e";
    modal.querySelector("#ck-total").textContent = Cart.totalEth().toFixed(4) + " ETH";

    modal.querySelector("#ck-processing").style.display = "none";
    modal.querySelector("#ck-success").style.display = "none";
    modal.querySelector(".ck-payment-form").style.display = "block";
    modal.querySelector(".cart-footer").style.display = "flex";
    modal.querySelector(".ck-summary").style.display = "block";

    modal.classList.remove("hidden");
  },

  async processPayment() {
    const modal = document.getElementById("checkout-modal");
    const name = modal.querySelector("#ck-name").value.trim();
    const card = modal.querySelector("#ck-card").value.trim();
    const expiry = modal.querySelector("#ck-expiry").value.trim();
    const cvv = modal.querySelector("#ck-cvv").value.trim();

    if (!name || !card || !expiry || !cvv) {
      toast("Please fill in all payment fields.", true);
      return;
    }
    if (card.replace(/\s/g, "").length < 16) {
      toast("Please enter a valid 16-digit card number.", true);
      return;
    }

    modal.querySelector(".ck-payment-form").style.display = "none";
    modal.querySelector(".cart-footer").style.display = "none";
    modal.querySelector(".ck-summary").style.display = "none";
    modal.querySelector("#ck-processing").style.display = "flex";

    const results = [];
    let successCount = 0;
    let demoCount = 0;
    let failCount = 0;

    for (const item of Cart.items) {
      try {
        const res = await api(`/api/marketplace/listings/${item.id}/buy`, {
          method: "POST",
          body: JSON.stringify({ buyer: actorByRole("buyer") }),
        });
        results.push({ name: item.project_name, success: true, tx: res.tx_hash, demo: false });
        successCount++;
      } catch (e) {

        if (e instanceof TypeError || /failed to fetch|network|load failed/i.test(String(e.message))) {
          results.push({ name: item.project_name, success: true, tx: "demo-" + Math.random().toString(36).slice(2, 12), demo: true });
          demoCount++;
        } else {
          results.push({ name: item.project_name, success: false, error: e.message });
          failCount++;
        }
      }
    }

    await new Promise((r) => setTimeout(r, 800));

    modal.querySelector("#ck-processing").style.display = "none";
    const successEl = modal.querySelector("#ck-success");
    successEl.style.display = "flex";

    const subEl = modal.querySelector("#ck-success-sub");
    let headerText = "";
    if (demoCount > 0 && successCount === 0) {
      headerText = "Demo payment complete (backend offline). " + demoCount + " items processed.";
    } else if (failCount === 0) {
      headerText = (successCount + demoCount) + " purchases completed." + (demoCount > 0 ? " (" + demoCount + " demo)" : "");
    } else {
      headerText = (successCount + demoCount) + " succeeded, " + failCount + " failed.";
    }
    subEl.innerHTML = headerText + "<br>" +
      results.map((r) => {
        const cls = r.success ? (r.demo ? "ok" : "ok") : "fail";
        const tag = r.demo ? " [demo]" : "";
        const detail = r.success ? shortTx(r.tx) + tag : escapeHtml(r.error);
        return '<span class="ck-tx-line ' + cls + '">' + escapeHtml(r.name) + " \u2014 " + detail + "</span>";
      }).join("<br>");

    if (successCount > 0 || demoCount > 0) Cart.clear();

    if (typeof renderMarketplace === "function") renderMarketplace();
    if (typeof refreshHeader === "function") refreshHeader();
  },
};

document.addEventListener("DOMContentLoaded", () => {
  Cart.load();
});
