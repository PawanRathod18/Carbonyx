from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config, models
from .db import Base, engine
from .routers import auth, marketplace, misc, projects, verification

Base.metadata.create_all(engine)

app = FastAPI(
    title="CARBONYX API",
    description=("An intelligent decentralized framework for verified "
                 "quantification and transparent trading of blue carbon "
                 "assets."),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

auth.install(app)

@app.on_event("startup")
def _prewarm():
    import threading

    def _boot():
        from .blockchain import bridge
        bridge.warmup()
        if not bridge.w3:
            return
        if not getattr(bridge, "_embedded", False):
            return

        from .db import SessionLocal
        from .models import Project
        db = SessionLocal()
        try:
            if db.query(Project).count() == 0:
                from .seed import seed_demo
                seed_demo(db)
                print("[i] demo data seeded (embedded chain)")
        except Exception as exc:
            print(f"[!] auto-seed skipped: {exc}")
        finally:
            db.close()

    threading.Thread(target=_boot, daemon=True).start()
app.include_router(auth.router)
app.include_router(misc.router)
app.include_router(projects.router)
app.include_router(verification.router)
app.include_router(marketplace.router)

PAGES = {
    "": "index.html",
    "dashboard": "dashboard.html",
    "login": "login.html",
    "about": "about.html",
    "analytics": "analytics.html",
    "map": "map.html",
    "portfolio": "portfolio.html",
    "projects": "projects.html",
    "verification": "verification.html",
    "marketplace": "marketplace.html",
    "chain": "chain.html",
    "docs": "docs.html",
}

@app.get("/favicon.svg", include_in_schema=False)
def favicon():
    return FileResponse(config.FRONTEND_DIR / "favicon.svg")

@app.get("/logo.png", include_in_schema=False)
def logo():
    return FileResponse(config.FRONTEND_DIR / "logo.png")

@app.get("/manifest.json", include_in_schema=False)
def manifest():
    return FileResponse(config.FRONTEND_DIR / "manifest.json")

@app.get("/{page}", include_in_schema=False)
def serve_page(page: str):
    filename = PAGES.get(page)
    if filename:
        return FileResponse(config.FRONTEND_DIR / filename,
                            headers={"Cache-Control": "no-cache"})
    import re as _re
    if _re.fullmatch(r"[A-Za-z0-9_-]+\.html", page):
        candidate = config.FRONTEND_DIR / page
        if candidate.is_file():
            return FileResponse(candidate,
                                headers={"Cache-Control": "no-cache"})
    raise HTTPException(404, "page not found")
    return FileResponse(config.FRONTEND_DIR / filename)

app.mount("/", StaticFiles(directory=str(config.FRONTEND_DIR), html=True),
          name="frontend")
