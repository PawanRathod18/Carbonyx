import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.blockchain import bridge
from app.db import SessionLocal
from app.seed import seed_demo

def main():
    accounts = bridge.accounts()
    print(f"chain ok ({len(accounts)} accounts) - seeding demo data ...")
    db = SessionLocal()
    try:
        summary = seed_demo(db)
        print("seeded:", summary)
        print("Demo data ready. The website now shows 3 projects and a listing.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
