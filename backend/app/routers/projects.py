from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import services
from ..blockchain import ChainNotConnected, ContractError
from ..db import SessionLocal
from ..models import Project
from ..schemas import ProjectCreate, QuantifyRequest

router = APIRouter(prefix="/api/projects", tags=["projects"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def _project_or_404(db: Session, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, f"project {project_id} not found")
    return project

def _chain_error(exc: Exception):
    if isinstance(exc, ChainNotConnected):
        raise HTTPException(503, str(exc))
    raise HTTPException(400, str(exc))

@router.post("")
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    try:
        project = services.register_project(
            db, name=payload.name, ecosystem=payload.ecosystem,
            country=payload.country, bounds=payload.bounds, owner=payload.owner)
    except (ChainNotConnected, ContractError) as exc:
        _chain_error(exc)
    return services.serialize_project(db, project)

@router.get("")
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).order_by(Project.id.desc()).all()
    return [services.serialize_project(db, p) for p in projects]

@router.get("/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = _project_or_404(db, project_id)
    full = services.get_report_full(db, project)
    out = services.serialize_project(db, project)
    out["full_report"] = full
    out["sequestration_curve"] = (services.quant_engine
                                  .cumulative_sequestration_curve(full)) if full else []
    return out

@router.post("/{project_id}/quantify")
def quantify(project_id: int, body: QuantifyRequest | None = None,
             db: Session = Depends(get_db)):
    project = _project_or_404(db, project_id)
    try:
        report = services.quantify_project(db, project)
    except (ChainNotConnected, ContractError) as exc:
        _chain_error(exc)
    return services.serialize_project(db, project, report)
