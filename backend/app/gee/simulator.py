import numpy as np

TILE_SIZE = 256

_WATER = {"B2": 0.10, "B3": 0.08, "B4": 0.04, "B8": 0.012, "B11": 0.006}
_VEGETATION = {"B2": 0.03, "B3": 0.06, "B4": 0.035, "B8": 0.42, "B11": 0.16}
_SOIL = {"B2": 0.15, "B3": 0.22, "B4": 0.28, "B8": 0.32, "B11": 0.38}

def _patchy_field(rng: np.random.Generator, size: int, cells: int = 16) -> np.ndarray:
    small = rng.random((cells, cells))
    step = size // cells
    field = np.kron(small, np.ones((step, step)))

    k = 9
    pad = np.pad(field, k // 2, mode="edge")
    acc = np.zeros_like(field)
    for di in range(k):
        for dj in range(k):
            acc += pad[di:di + size, dj:dj + size]
    field = acc / (k * k)
    return field

def synth_tile(seed: int, ecosystem: str, size: int = TILE_SIZE) -> dict:
    rng = np.random.default_rng(seed)

    veg_field = _patchy_field(rng, size)
    soil_field = _patchy_field(rng, size)
    fine = rng.normal(0, 0.025, (size, size))

    bias = {"mangrove": 0.10, "seagrass": -0.05, "saltmarsh": 0.0}[ecosystem]
    veg_frac = np.clip((veg_field + bias) * 1.4, 0, 1)

    bands = {}
    for name in ("B2", "B3", "B4", "B8", "B11"):
        band = (_WATER[name] * (1 - veg_frac - 0.3 * soil_field)
                + _VEGETATION[name] * veg_frac
                + _SOIL[name] * 0.3 * soil_field * (1 - veg_frac))
        band = band + fine * (0.3 + 0.7 * veg_frac)
        bands[name] = np.clip(band, 0, 1).astype(np.float64)

    cloud_field = _patchy_field(rng, size, cells=8)
    cloud_mask = cloud_field > 0.93
    for name in bands:
        bands[name][cloud_mask] = 0.55

    return {"bands": bands, "cloud_mask": cloud_mask,
            "cloud_fraction": float(cloud_mask.mean())}

def compute_indices(tile: dict) -> dict:
    b3, b4, b8 = tile["bands"]["B3"], tile["bands"]["B4"], tile["bands"]["B8"]
    eps = 1e-6
    ndvi = (b8 - b4) / (b8 + b4 + eps)
    ndwi = (b3 - b8) / (b3 + b8 + eps)
    return {"NDVI": np.clip(ndvi, -1, 1), "NDWI": np.clip(ndwi, -1, 1)}

def classify(tile: dict, indices: dict, ndvi_threshold: float) -> np.ndarray:
    return (indices["NDVI"] > ndvi_threshold) & (~tile["cloud_mask"])

def downsample_mask(mask: np.ndarray, grid: int = 48) -> list:
    h, w = mask.shape
    out = []
    for i in range(grid):
        row = []
        for j in range(grid):
            block = mask[i * h // grid:(i + 1) * h // grid,
                         j * w // grid:(j + 1) * w // grid]
            row.append(1 if block.mean() > 0.5 else 0)
        out.append(row)
    return out
