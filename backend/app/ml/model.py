import threading

import numpy as np

from ..gee import simulator
from ..invest import carbon_model

_TRAIN_N = 350
_TRAIN_TILE = 64
_RANDOM_STATE = 42

_lock = threading.Lock()
_model_cache = None

class _MLModel:
    def __init__(self, model, r2, n_samples, features_importance):
        self.model = model
        self.r2 = r2
        self.n_samples = n_samples
        self.feature_importance = features_importance
        self.features = ["ndvi_mean", "vegetation_fraction", "ecosystem_index"]

    @property
    def available(self) -> bool:
        return self.model is not None

def _generate_sample(rng):
    eco = str(rng.choice(np.array(["mangrove", "seagrass", "saltmarsh"])))
    seed = int(rng.integers(0, 2**31 - 1))

    tile = simulator.synth_tile(seed, eco, size=_TRAIN_TILE)
    indices = simulator.compute_indices(tile)
    eco_def = carbon_model.ECOSYSTEM_DEFAULTS[eco]
    mask = simulator.classify(tile, indices, eco_def["ndvi_threshold"])

    veg_fraction = float(mask.mean())
    ndvi_mean = float(indices["NDVI"][mask].mean()) if mask.any() else 0.0

    vigour = carbon_model.vigour_index(ndvi_mean, eco)
    agb_density = vigour * eco_def["max_agb_t_ha"]

    return [ndvi_mean, veg_fraction, ["mangrove", "seagrass", "saltmarsh"].index(eco)], agb_density

def get_model():
    global _model_cache
    if _model_cache is not None:
        return _model_cache

    with _lock:
        if _model_cache is not None:
            return _model_cache
        try:
            from sklearn.ensemble import RandomForestRegressor
            from sklearn.metrics import r2_score
            from sklearn.model_selection import train_test_split
        except ImportError:
            _model_cache = _MLModel(None, None, 0, None)
            return _model_cache

        rng = np.random.default_rng(_RANDOM_STATE)
        X, y = [], []
        for _ in range(_TRAIN_N):
            feats, target = _generate_sample(rng)
            X.append(feats)
            y.append(target)
        X, y = np.array(X), np.array(y)

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.25, random_state=_RANDOM_STATE)

        rf = RandomForestRegressor(n_estimators=60, max_depth=12,
                                   random_state=_RANDOM_STATE, n_jobs=1)
        rf.fit(X_train, y_train)
        r2 = float(r2_score(y_test, rf.predict(X_test)))
        _model_cache = _MLModel(rf, r2, len(X),
                                [round(float(v), 3) for v in rf.feature_importances_])
        return _model_cache

def ml_agb_estimate(ndvi_mean: float, veg_fraction: float, ecosystem: str):
    m = get_model()
    if not m.available:
        return {"available": False, "agb_t_ha": None, "model_r2": None}
    eco_index = ["mangrove", "seagrass", "saltmarsh"].index(ecosystem)
    pred = float(m.model.predict([[ndvi_mean, veg_fraction, eco_index]])[0])
    return {"available": True, "agb_t_ha": pred, "model_r2": m.r2}

def risk_flags(report: dict) -> list[str]:
    flags = []
    cls = report["classification"]
    idx = report["indices"]
    conf = report["confidence"]

    if report["cloud_fraction"] > 0.15:
        flags.append(f"High cloud fraction ({report['cloud_fraction']*100:.0f}%) - "
                     "imagery quality is marginal")
    if cls["ecosystem_fraction"] < 0.05:
        flags.append("Very low vegetation fraction (<5%) - the classified area "
                     "may not support meaningful crediting")
    if cls["ecosystem_fraction"] > 0.95:
        flags.append("Vegetation fraction above 95% - unusually uniform, "
                     "check the bounding box")
    if idx["ndvi_mean"] > 0.92:
        flags.append("NDVI above plausible canopy ceiling (0.92)")
    if conf < 0.55:
        flags.append(f"Verification confidence is low ({conf*100:.0f}%)")
    if report.get("ml", {}).get("deviation_pct", 0) and \
            abs(report["ml"]["deviation_pct"]) > 40:
        flags.append(f"ML cross-check deviates {report['ml']['deviation_pct']:+.0f}% "
                     "from the empirical estimate - manual review recommended")

    if not flags:
        flags = []
    return flags

def recommendation(flags: list[str], confidence: float) -> str:
    if confidence >= 0.75 and not flags:
        return "SYSTEM RECOMMENDATION: APPROVE - all automated checks passed."
    if confidence < 0.55 or len(flags) >= 3:
        return "SYSTEM RECOMMENDATION: REJECT - multiple anomalies detected."
    return "SYSTEM RECOMMENDATION: REVIEW MANUALLY - some checks require attention."
