import logging

log = logging.getLogger("carbonyx.gee")

SENTINEL2_COLLECTION = "COPERNICUS/S2_SR_HARMONIZED"

def available() -> bool:
    try:
        import ee
        return True
    except ImportError:
        return False

class GEEClient:

    def __init__(self, key_file: str):
        import ee
        self.ee = ee
        try:
            credentials = ee.ServiceAccountCredentials(None, key_file)
            ee.Initialize(credentials)
        except Exception as exc:
            raise RuntimeError(
                "Could not initialise Earth Engine with the provided key "
                f"({exc}). Check that the Earth Engine API is enabled for "
                "your project and the service account is registered."
            ) from exc

    def quantify(self, bounds: list[float], ecosystem: str,
                 ndvi_threshold: float, start: str = "2024-01-01",
                 end: str = "2024-12-31") -> dict:
        ee = self.ee
        region = ee.Geometry.Rectangle(bounds)
        col = (ee.ImageCollection(SENTINEL2_COLLECTION)
               .filterBounds(region)
               .filterDate(start, end)
               .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40)))

        img = col.median().clip(region)
        ndvi = img.normalizedDifference(["B8", "B4"]).rename("NDVI")
        ndwi = img.normalizedDifference(["B3", "B8"]).rename("NDWI")

        veg_mask = ndvi.gt(ndvi_threshold)

        veg_area = (veg_mask.selfMask()
                    .multiply(ee.Image.pixelArea())
                    .reduceRegion(reducer=ee.Reducer.sum(),
                                  geometry=region, scale=20, maxPixels=1e9)
                    .get("NDVI"))

        means = ndvi.addBands(ndwi).reduceRegion(
            reducer=ee.Reducer.mean(), geometry=region,
            scale=60, maxPixels=1e9)

        cloudiness = (col.mean()
                      .reduceRegion(reducer=ee.Reducer.mean(), geometry=region,
                                    scale=1000, maxPixels=1e9)
                      .get("CLOUDY_PIXEL_PERCENTAGE"))

        info = ee.Dictionary({
            "veg_area": veg_area,
            "ndvi": means.get("NDVI"),
            "ndwi": means.get("NDWI"),
            "cloud": cloudiness,
        }).getInfo()

        classified_ha = float(info.get("veg_area") or 0) / 1e4
        cloud = float(info.get("cloud") or 0) / 100.0

        return {
            "classified_ha": classified_ha,
            "ndvi_mean": float(info.get("ndvi") or 0),
            "ndwi_mean": float(info.get("ndwi") or 0),
            "cloud_fraction": min(cloud, 1.0),
            "source": "google-earth-engine",
        }
