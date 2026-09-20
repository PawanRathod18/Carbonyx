"use strict";

(function () {

  const KB = [
    {
      keys: ["hello", "hi", "hey", "greetings"],
      reply: "Hello! I'm Carbonyx Assistant, your CARBONYX assistant. Ask me about blue carbon, how the platform works, or where to find things!",
    },
    {
      keys: ["what is carbonyx", "about carbonyx", "what does carbonyx"],
      reply: "CARBONYX is a decentralized blue carbon MRV platform. It quantifies coastal carbon from satellite imagery, verifies it on-chain, mints tradable CBX credits (1 CBX = 1 tCO2e), and lets you trade them transparently.",
    },
    {
      keys: ["what is blue carbon", "blue carbon"],
      reply: "Blue carbon is carbon captured by coastal ecosystems — mangroves, seagrass meadows, and salt marshes. These ecosystems sequester carbon 10x faster than forests per hectare. CARBONYX measures and monetizes this carbon.",
    },
    {
      keys: ["mangrove", "mangroves"],
      reply: "Mangroves are coastal trees that store carbon in biomass and deep sediment. They sequester 3-5x more carbon per hectare than tropical forests. The Sundarbans (India) is the world's largest mangrove forest.",
    },
    {
      keys: ["seagrass", "seagrasses"],
      reply: "Seagrass meadows are underwater flowering plants that store carbon in their roots and sediment. They cover only 0.1% of the ocean floor but store ~10% of ocean carbon. Chilika Lake in Odisha is a major Indian seagrass site.",
    },
    {
      keys: ["salt marsh", "saltmarsh", "salt-marsh"],
      reply: "Salt marshes are coastal wetlands flooded by tides. They store carbon in dense root systems and sediment. The Rann of Kutch in Gujarat has India's largest salt marsh area.",
    },
    {
      keys: ["how it works", "how does it work", "mrv", "pipeline"],
      reply: "The MRV pipeline has 5 steps: 1) Register a coastal project with its bounding box. 2) The engine quantifies carbon from satellite data. 3) A verifier approves the report (hash anchored on-chain). 4) CBX credits are minted. 5) Credits are traded and eventually retired (burned on-chain).",
    },
    {
      keys: ["cbx", "credit", "credits", "token"],
      reply: "1 CBX credit = exactly 1 tonne of CO2-equivalent (tCO2e). Credits are minted only after verification, with a conservative buffer held back. They're ERC-20 tokens on the embedded blockchain.",
    },
    {
      keys: ["buy", "purchase", "marketplace", "how to buy"],
      reply: "Go to the Marketplace page to browse listings. You can add credits to your cart and checkout with our payment system. Each purchase is recorded as an on-chain event visible in the Chain Log.",
    },
    {
      keys: ["sell", "list", "listing"],
      reply: "To sell credits, go to the Marketplace page and use the 'List credits for sale' form. You need minted credits from a verified project. Set your amount and price per credit in ETH.",
    },
    {
      keys: ["retire", "retirement", "offset"],
      reply: "Retiring credits permanently burns them on-chain — they can never be traded again. This is what makes them a true carbon offset. Go to Marketplace → Retire credits to get a retirement certificate with a QR code.",
    },
    {
      keys: ["dashboard", "how to see", "my credits", "portfolio"],
      reply: "Your Dashboard shows project stats and recent chain events. Your Portfolio shows your CBX balance, active listings, and retired credits. Log in first to see your personal data.",
    },
    {
      keys: ["map", "where", "location", "projects located"],
      reply: "The World Map page shows all registered projects and 80+ real ecosystem sites worldwide. You can search for any city (like 'Nagpur') and see the nearest mangroves, seagrass, and salt marshes with distances.",
    },
    {
      keys: ["verify", "verification", "verifier"],
      reply: "Verification is done by an independent verifier who reviews the quantification report. On approval, the report's SHA-256 hash is anchored on-chain — tamper-proof evidence anyone can audit. Go to the Verification page to review pending projects.",
    },
    {
      keys: ["sentinel", "satellite", "ndvi", "remote sensing"],
      reply: "CARBONYX uses Sentinel-2 multispectral satellite imagery. The engine calculates NDVI (vegetation) and NDWI (water) indices to classify ecosystem extent, then applies an InVEST-style model for biomass and soil carbon.",
    },
    {
      keys: ["blockchain", "chain", "smart contract", "solidity"],
      reply: "CARBONYX uses 3 Solidity contracts: ProjectRegistry (project registration), Credit (ERC-20 token), and Marketplace (escrow trading). The demo runs on an embedded Python EVM chain — no external wallet needed.",
    },
    {
      keys: ["login", "sign in", "signup", "register", "account"],
      reply: "Click 'Get started' or go to the Login page to sign up. You'll get a wallet address automatically assigned. No MetaMask or browser extension needed.",
    },
    {
      keys: ["cart", "checkout", "payment"],
      reply: "Add credits to your cart from the Marketplace, then checkout with our payment system. The mock payment simulates a card transaction — on success, the actual on-chain purchase is executed.",
    },
    {
      keys: ["thank", "thanks", "thx"],
      reply: "You're welcome! Feel free to ask anything else about blue carbon or the platform.",
    },
    {
      keys: ["help", "guide", "tour"],
      reply: "Take the guided tour by clicking the '?' icon. Or explore: Dashboard for stats, Map for locations, Projects for MRV, Marketplace for trading, Chain Log for on-chain events.",
    },
    {
      keys: ["who built", "project team", "creator", "developer", "solo"],
      reply: "CARBONYX is an independent portfolio project, designed and built end-to-end by Pawan Rathod — backend, embedded blockchain, quantification models and the full frontend.",
    },
  ];

  const DEFAULT_REPLY = "I'm not sure about that. Try asking about blue carbon, mangroves, seagrass, salt marsh, how CARBONYX works, the marketplace, blockchain, or navigation help. You can also type 'help'.";

  function findReply(text) {

    const lower = text.toLowerCase().trim().replace(/[?!.,]/g, "").replace(/\s+/g, " ");

    for (const entry of KB) {
      if (entry.keys.some((k) => lower.includes(k))) return entry.reply;
    }

    if (/\bhow\b|\bwork\b|\bworks\b|\bprocess\b/.test(lower)) {
      for (const entry of KB) {
        if (entry.keys.includes("mrv") || entry.keys.includes("how it works") || entry.keys.includes("pipeline"))
          return entry.reply;
      }
    }
    if (/\bwhat\b/.test(lower) && /\bcarbonyx\b|\bblue carbon\b|\bpelx\b|\bmangrove\b|\bseagrass\b/.test(lower)) {
      for (const entry of KB) {
        if (entry.keys.some((k) => lower.includes(k))) return entry.reply;
      }
    }
    return DEFAULT_REPLY;
  }

  function buildChatbot() {
    if (document.getElementById("chatbot-toggle")) return;

    const toggle = document.createElement("button");
    toggle.id = "chatbot-toggle";
    toggle.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="13" cy="10" r="1" fill="currentColor"/><circle cx="17" cy="10" r="1" fill="currentColor"/></svg>';
    toggle.title = "Ask Carbonyx Assistant";
    document.body.appendChild(toggle);

    const win = document.createElement("div");
    win.id = "chatbot-window";
    win.innerHTML = `
      <div class="cb-header">
        <div class="cb-bot-info">
          <div class="cb-avatar">P</div>
          <div>
            <div class="cb-name">Carbonyx Assistant</div>
            <div class="cb-status"><span class="cb-dot"></span> Online</div>
          </div>
        </div>
        <button class="cb-close" id="cb-close">&times;</button>
      </div>
      <div class="cb-messages" id="cb-messages">
        <div class="cb-msg bot">Hi! I'm Carbonyx Assistant, your CARBONYX assistant. Ask me anything about blue carbon, the platform, or where to find things!</div>
        <div class="cb-suggestions">
          <button class="cb-suggestion">What is blue carbon?</button>
          <button class="cb-suggestion">How does CARBONYX work?</button>
          <button class="cb-suggestion">How to buy credits?</button>
          <button class="cb-suggestion">What is CBX?</button>
        </div>
      </div>
      <div class="cb-input-row">
        <input type="text" id="cb-input" placeholder="Type your question..." autocomplete="off">
        <button id="cb-send" class="cb-send-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        </button>
      </div>
    `;
    document.body.appendChild(win);

    toggle.addEventListener("click", () => {
      win.classList.toggle("open");
      toggle.classList.toggle("hidden");
      if (win.classList.contains("open")) {
        setTimeout(() => document.getElementById("cb-input")?.focus(), 300);
      }
    });

    document.getElementById("cb-close").addEventListener("click", () => {
      win.classList.remove("open");
      toggle.classList.remove("hidden");
    });

    function send() {
      const input = document.getElementById("cb-input");
      const text = input.value.trim();
      if (!text) return;
      input.value = "";

      const msgs = document.getElementById("cb-messages");

      const userMsg = document.createElement("div");
      userMsg.className = "cb-msg user";
      userMsg.textContent = text;
      msgs.appendChild(userMsg);
      msgs.scrollTop = msgs.scrollHeight;

      const typing = document.createElement("div");
      typing.className = "cb-msg bot typing";
      typing.innerHTML = '<span class="cb-typing-dot"></span><span class="cb-typing-dot"></span><span class="cb-typing-dot"></span>';
      msgs.appendChild(typing);
      msgs.scrollTop = msgs.scrollHeight;

      setTimeout(() => {
        typing.remove();
        const reply = findReply(text);
        const botMsg = document.createElement("div");
        botMsg.className = "cb-msg bot";
        botMsg.textContent = reply;
        msgs.appendChild(botMsg);
        msgs.scrollTop = msgs.scrollHeight;
      }, 600 + Math.random() * 500);
    }

    document.getElementById("cb-send").addEventListener("click", send);
    document.getElementById("cb-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") send();
    });

    document.querySelectorAll(".cb-suggestion").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById("cb-input").value = btn.textContent;
        send();
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildChatbot);
  } else {
    buildChatbot();
  }
})();
