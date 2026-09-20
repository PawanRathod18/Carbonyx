from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from .db import Base

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    chain_id = Column(Integer, unique=True)
    name = Column(String(200), nullable=False)
    ecosystem = Column(String(50), nullable=False)
    country = Column(String(100), default="")
    bounds = Column(String(120), nullable=False)
    area_ha = Column(Float, default=0.0)
    owner_address = Column(String(42), nullable=False)
    status = Column(String(20), default="pending")
    verifier_address = Column(String(42), nullable=True)
    verifier_note = Column(Text, default="")
    verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)

class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, nullable=False, index=True)
    engine = Column(String(20))
    area_ha = Column(Float)
    ndvi_mean = Column(Float)
    ndwi_mean = Column(Float)
    agb_t = Column(Float)
    biomass_c_t = Column(Float)
    soil_c_t = Column(Float)
    stock_tco2e = Column(Float)
    seq_rate_tco2_yr = Column(Float)
    projection_tco2e = Column(Float)
    issueable_tco2e = Column(Float)
    confidence = Column(Float)
    cloud_fraction = Column(Float)
    report_hash = Column(String(80))
    report_json = Column(Text)
    created_at = Column(DateTime, default=utcnow)

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True)
    tx_hash = Column(String(70))
    block_number = Column(Integer)
    event_name = Column(String(60))
    actor = Column(String(42), default="")
    payload = Column(Text, default="{}")
    created_at = Column(DateTime, default=utcnow)
