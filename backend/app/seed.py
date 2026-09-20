from .blockchain import bridge
from . import services
from .models import Project, Report

DEMOS = [
    {
        "name": "Pichavaram Mangrove Conservation",
        "ecosystem": "mangrove",
        "country": "India",
        "bounds": [79.75, 11.37, 79.84, 11.47],
        "verify": True,
    },
    {
        "name": "Chilika Lake Seagrass Restoration",
        "ecosystem": "seagrass",
        "country": "India",
        "bounds": [85.25, 19.65, 85.55, 19.95],
        "verify": False,
    },
    {
        "name": "Wadden Sea Salt Marsh Pilot",
        "ecosystem": "saltmarsh",
        "country": "Netherlands",
        "bounds": [8.45, 53.42, 8.75, 53.62],
        "verify": False,
    },
]

def seed_demo(db) -> dict:
    accounts = bridge.accounts()
    owner = accounts[2]
    verifier = accounts[1]

    for tbl in (Report, Project):
        db.query(tbl).delete()
    db.commit()

    minted_chain_id = None
    for demo in DEMOS:
        project = services.register_project(
            db,
            name=demo["name"], ecosystem=demo["ecosystem"],
            country=demo["country"], bounds=demo["bounds"], owner=owner)
        services.quantify_project(db, project)

        if demo["verify"]:
            services.verify_project(
                db, project, decision="approve",
                note="Independent review: report hash matches satellite "
                     "analysis; methodology accepted.",
                verifier=verifier)
            services.mint_credits(db, project, owner=owner)
            minted_chain_id = project.chain_id

    if minted_chain_id:
        services.list_for_sale(
            db, seller=owner, project_id=minted_chain_id,
            amount=50, price_per_credit_eth=0.01)

    return {"projects": len(DEMOS), "minted_project": minted_chain_id}
