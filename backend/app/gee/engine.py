import hashlib
import json
import math
from datetime import datetime, timezone

import numpy as np

from .. import config
from ..invest import carbon_model
from ..ml import ml_agb_estimate, recommendation, risk_flags
from . import simulator

def _bbox_area_ha(bounds: list[float]) -> float:
    min_lon, min_lat, max_lon, max_lat = bounds
    mid_lat = math.radians((min_lat + max_lat) / 2)
    width_m = (max_lon - min_lon) * 111_320 * math.cos(mid_lat)
    height_m = (max_lat - min_lat) * 110_540
    return (width_m * height_m) / 10_000

def _deterministic_seed(project) -> int:
    raw = f"{project.id}:{project.name}:{project.bounds}".encode()
    return int(hashlib.sha256(raw).hexdigest()[:12], 16)

def _confidence(cloud_fraction: float, eco_fraction: float) -> float:
    conf = 0.92
    conf -= 1.6 * cloud_fraction
    if eco_fraction < 0.05:
        conf -= 0.25
    if eco_fraction > 0.95:
        conf -= 0.10
    conf -= 0.05 * abs(eco_fraction - 0.55)
    return float(max(0.10, min(0.99, conf)))

def _sim_classify(project, bounds) -> dict:
    eco = carbon_model.ECOSYSTEM_DEFAULTS[project.ecosystem]
    seed = _deterministic_seed(project)
    tile = simulator.synth_tile(seed, project.ecosystem)
    indices = simulator.compute_indices(tile)
    veg_mask = simulator.classify(tile, indices, eco["ndvi_threshold"])

    bbox_ha = _bbox_area_ha(bounds)
    pixel_ha = bbox_ha / (simulator.TILE_SIZE ** 2)
    classified_ha = float(veg_mask.sum()) * pixel_ha

    ndvi_mean = float(indices["NDVI"][veg_mask].mean()) if veg_mask.any() else 0.0
    ndwi_mean = float(indices["NDWI"][veg_mask].mean()) if veg_mask.any() else 0.0

    return {
        "classified_ha": classified_ha,
        "bbox_ha": bbox_ha,
        "ndvi_mean": ndvi_mean,
        "ndwi_mean": ndwi_mean,
        "cloud_fraction": tile["cloud_fraction"],
        "mask": veg_mask,
        "mask_preview": simulator.downsample_mask(veg_mask),
        "pixel_ha": pixel_ha,
    }

def _gee_classify(project, bounds) -> dict:
    from .gee_client import GEEClient

    eco = carbon_model.ECOSYSTEM_DEFAULTS[project.ecosystem]
    client = GEEClient(config.EE_KEY_FILE)
    res = client.quantify(bounds, project.ecosystem, eco["ndvi_threshold"])

    return {
        "classified_ha": res["classified_ha"],
        "bbox_ha": _bbox_area_ha(bounds),
        "ndvi_mean": res["ndvi_mean"],
        "ndwi_mean": res["ndwi_mean"],
        "cloud_fraction": res["cloud_fraction"],
        "mask": None,
        "mask_preview": None,
        "pixel_ha": None,
    }

def quantify_project(project) -> dict:
    bounds = [float(x) for x in project.bounds.split(",")]
    if len(bounds) != 4:
        raise ValueError(f"bad bounds: {project.bounds!r}")

    if config.GEE_MODE == "gee" and config.EE_KEY_FILE:
        cls = _gee_classify(project, bounds)
        engine = "gee"
    else:
        cls = _sim_classify(project, bounds)
        engine = "sim"

    eco_fraction = cls["classified_ha"] / cls["bbox_ha"] if cls["bbox_ha"] else 0

    eco = carbon_model.ECOSYSTEM_DEFAULTS[project.ecosystem]
    vigour = carbon_model.vigour_index(cls["ndvi_mean"], project.ecosystem)

    carbon = carbon_model.carbon_stock(cls["classified_ha"], vigour, project.ecosystem)
    proj = carbon_model.sequestration(
        cls["classified_ha"], project.ecosystem,
        years=config.PROJECTION_YEARS, buffer=config.MINT_BUFFER)

    ml = ml_agb_estimate(cls["ndvi_mean"], eco_fraction, project.ecosystem)
    ml_section = {"available": False}
    if ml["available"]:
        empirical_density = carbon["agb_t"] / cls["classified_ha"] if cls["classified_ha"] else 0
        ml_total = ml["agb_t_ha"] * cls["classified_ha"]
        deviation = 0.0
        if empirical_density:
            deviation = (ml["agb_t_ha"] - empirical_density) / empirical_density * 100
        ml_section = {
            "available": True,
            "agb_t_ha": round(ml["agb_t_ha"], 1),
            "agb_t": round(ml_total, 1),
            "deviation_pct": round(deviation, 1),
            "model_r2": round(ml["model_r2"], 3),
        }

    report = {
        "project_id": project.id,
        "engine": engine,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "region": {
            "bounds": bounds,
            "bbox_area_ha": round(cls["bbox_ha"], 2),
            "tile_size": simulator.TILE_SIZE if engine == "sim" else None,
        },
        "classification": {
            "ecosystem": project.ecosystem,
            "ndvi_threshold": eco["ndvi_threshold"],
            "classified_area_ha": round(cls["classified_ha"], 2),
            "ecosystem_fraction": round(eco_fraction, 4),
            "pixel_ha": cls["pixel_ha"],
            "mask_preview": cls["mask_preview"],
        },
        "indices": {
            "ndvi_mean": round(cls["ndvi_mean"], 4),
            "ndwi_mean": round(cls["ndwi_mean"], 4),
        },
        "carbon": {
            "agb_t": round(carbon["agb_t"], 1),
            "agb_c_t": round(carbon["agb_c_t"], 1),
            "bgb_c_t": round(carbon["bgb_c_t"], 1),
            "soil_c_t": round(carbon["soil_c_t"], 1),
            "total_c_t": round(carbon["total_c_t"], 1),
            "stock_tco2e": round(carbon["stock_tco2e"], 1),
        },
        "projection": {
            "annual_seq_tco2_yr": round(proj["annual_tco2_yr"], 1),
            "years": proj["years"],
            "projected_tco2e": round(proj["projected_tco2e"], 1),
            "buffer": proj["buffer"],
            "issueable_tco2e": round(proj["buffered_tco2e"], 1),
        },
        "confidence": round(_confidence(cls["cloud_fraction"], eco_fraction), 3),
        "cloud_fraction": round(cls["cloud_fraction"], 4),
        "ml": ml_section,
    }

    report["risk_flags"] = risk_flags(report)
    report["recommendation"] = recommendation(report["risk_flags"], report["confidence"])

    report["report_hash"] = _hash_report(report)
    return report

def _hash_report(report: dict) -> str:
    payload = {k: v for k, v in report.items() if k != "report_hash"}

    def _normalise(o):
        if isinstance(o, dict):
            return {k: _normalise(v) for k, v in sorted(o.items())}
        if isinstance(o, list):
            return [_normalise(v) for v in o]
        if isinstance(o, float):
            return round(o, 6)
        return o

    blob = json.dumps(_normalise(payload), sort_keys=True,
                      separators=(",", ":"), ensure_ascii=True)
    return "0x" + hashlib.sha256(blob.encode()).hexdigest()

def cumulative_sequestration_curve(report: dict, years: int = 20) -> list[float]:
    rate = report["projection"]["annual_seq_tco2_yr"]
    return [round(rate * y, 1) for y in range(0, years + 1)]
