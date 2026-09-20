# CARBONYX — Verified Blue Carbon Infrastructure

**CARBONYX** is a full-stack blue carbon platform that turns mangrove restoration into verifiable, tradable carbon credits. It combines satellite-derived biomass estimation, an InVEST-based carbon model, machine-learning classification, and a blockchain settlement layer to deliver a complete **MRV pipeline** — Measure, Report, Verify — from remote sensing to credit retirement.

Register a coastline, let the engine quantify its carbon, get it verified, mint CBX credits (1 CBX = 1 tCO₂e), trade them on the marketplace, and retire them permanently — with every decision recorded on-chain.

---

## Highlights

- **Before/after satellite slider** — drag to compare degraded vs restored coastline inside every MRV report
- **Complete MRV pipeline** — synthetic Sentinel-2 analysis → NDVI/NDWI classification → InVEST carbon model → SHA-256 hashed reports anchored on-chain
- **Embedded blockchain** — a real in-process EVM chain (py-evm + eth-tester) running three Solidity contracts: registry, credit token, and marketplace escrow
- **Marketplace with settlement** — multi-seller cart, escrow-style checkout, 1% platform fee, permanent retirement
- **12 fully-built pages** — landing, auth, dashboard, analytics, interactive map, portfolio, projects & MRV, verification, marketplace, chain explorer, docs
- **Carbonyx Assistant assistant** — in-app chatbot for guidance and quick queries
- **Galaxy-glass design system** — dark cosmic UI with a rotating starfield, aurora background, iOS-style frosted glass cards, gold HUD accents, and a travelling border-beam animation on every card
- **Works offline** — if the backend is not running, the frontend falls back to localStorage auth and a demo marketplace, so the UI is always presentable

## Screenshots

| Home | Dashboard | Marketplace |
|---|---|---|
| *(add screenshot)* | *(add screenshot)* | *(add screenshot)* |

*Capture with `Win + Shift + S` after running `python start.py`, save as `screenshots/home.png` etc., and update this table.*

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11 — FastAPI (async REST API), SQLite, PBKDF2 auth |
| Frontend | Vanilla HTML / CSS / JavaScript — no build step, no Node.js |
| Blockchain | Embedded Python EVM chain (py-evm + eth-tester, pycryptodome keccak) |
| Smart contracts | 3 Solidity contracts (registry, CBX credit token, marketplace) |
| Machine learning | scikit-learn — mangrove health / degradation classification |
| Carbon modelling | InVEST coastal blue carbon storage & sequestration model |
| Earth observation | Sentinel-2 simulation — band math, NDVI/NDWI indices, synthetic scenes |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  FRONTEND — 12 pages, vanilla HTML/CSS/JS                    │
│  glass UI · starfield canvas · cart · Carbonyx Assistant chatbot        │
│  (auto-detects backend; localStorage fallback when offline)   │
└───────────────────────────┬──────────────────────────────────┘
                            │ REST (fetch)
┌───────────────────────────▼──────────────────────────────────┐
│  BACKEND — FastAPI                                           │
│  ├── auth (PBKDF2, sessions)                                 │
│  ├── projects & MRV reports (SQLite)                         │
│  ├── Sentinel-2 simulation + ML classifier                   │
│  ├── InVEST carbon model (stock / sequestration / buffer)     │
│  └── marketplace & settlement                                │
└───────────────────────────┬──────────────────────────────────┘
                            │ in-process calls
┌───────────────────────────▼──────────────────────────────────┐
│  EMBEDDED EVM CHAIN (py-evm)                                 │
│  Registry.sol · CBXToken.sol · Marketplace.sol              │
│  every mint / trade / retirement = transaction in a block    │
└──────────────────────────────────────────────────────────────┘
```

## Quick Start

Requires **Python 3.11+**. Nothing else — no Node.js, no Hardhat, no external chain.

```bash
cd carbonyx
python start.py
```

That's it. The launcher installs dependencies on first run, boots the API + embedded chain on `http://localhost:8000`, and opens your browser. A demo account is available from the account selector in the navbar.

To run manually:

```bash
pip install -r backend/requirements.txt
cd backend && python run.py
```

## The Demo Walkthrough (golden path)

1. **Sign up** (or pick the demo account) — accounts are PBKDF2-hashed and tied to chain addresses
2. **Register a project** — `Projects & MRV` → draw a bounding box on the coast
3. **Quantify** — run the satellite simulation + ML classification + InVEST carbon model; inspect the MRV report (its SHA-256 hash becomes its identity)
4. **Verify** — as the verifier role, approve the report; the hash is anchored on-chain
5. **Mint** — CBX credits are minted to the owner, gated by a conservative buffer
6. **Trade** — list credits on the marketplace, add to cart, checkout with escrow settlement
7. **Retire** — retire credits permanently and print the retirement certificate
8. **Audit** — open the Chain Log to see every block and transaction of the journey

## Project Structure

```
carbonyx/
├── start.py               # one-command launcher
├── backend/
│   ├── app/
│   │   ├── main.py        # FastAPI app, routes, static hosting
│   │   ├── routers/       # auth, projects, marketplace, chain API
│   │   ├── gee/           # Sentinel-2 simulation
│   │   ├── invest/        # carbon model
│   │   ├── ml/            # mangrove health classifier
│   │   └── chain/         # embedded EVM, contract deployment
│   └── requirements.txt
├── frontend/
│   ├── index.html … docs.html   # 12 pages
│   ├── css/               # base + per-page + cinema/ocean design layers
│   ├── js/                # core.js (navbar, API, starfield), per-page logic
│   └── data/              # map / ecosystem datasets
└── contracts/             # Solidity sources + artifacts (deployed into the embedded chain)
```

## Design System

Dark "galaxy glass" theme: deep navy-purple space background with a slowly rotating starfield (canvas), aurora nebula blobs, and a prism light wheel. Cards are true frosted glass (backdrop blur, ~20% fill) with gold HUD corner brackets, scanline textures, breathing auras, a cursor-following spotlight, and a travelling gold-to-purple beam that orbits every card border. Warm gold (`#f5a623`) is the primary accent; electric purple (`#a855f7`) the secondary. Layout CSS is kept separate from the design layer (`cinema.css`, `ocean.css`) so the two never fight.

## Known Limitations (honest list)

- Sentinel-2 scenes are **simulated** — synthetic band data, not live Copernicus imagery
- The chain is an **embedded demo network** with development keys — not a public chain
- Single-verifier flow — no multi-party verification or accredited third party yet
- Marketplace is peer-to-peer within the demo; no external liquidity or fiat rails
- Demo data resets when `backend/data/` is removed

## Roadmap

- **Real Earth observation** — swap the simulator for live Copernicus Data Space (Sentinel-2) imagery
- **Public chain anchoring** — anchor report hashes to an established network (e.g. Polygon) instead of the embedded chain
- **Methodology alignment** — align quantification with Verra VM0033 / IPCC Wetlands Supplement for credit eligibility
- **Field validation** — ground-truth plots with an NGO pilot project
- **Retirement certificates as signed PDFs** with QR-verifiable on-chain proof

## About the Builder

CARBONYX is an independent portfolio project, designed and built end-to-end by
**Pawan Rathod** — backend, embedded blockchain, quantification models,
smart contracts and the full frontend design system.

## License

MIT — see your team's naming preference before publishing.
