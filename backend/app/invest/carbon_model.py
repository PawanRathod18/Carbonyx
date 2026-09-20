
C_TO_CO2 = 44.0 / 12.0

BIOMASS_C_FRACTION = 0.47

ECOSYSTEM_DEFAULTS = {
    "mangrove": {
        "label": "Mangrove forest",
        "max_agb_t_ha": 380.0,
        "ndvi_threshold": 0.45,
        "root_shoot_ratio": 0.87,
        "soil_c_t_ha": 550.0,
        "accumulation_t_ha_yr": 1.80,
    },
    "seagrass": {
        "label": "Seagrass meadow",
        "max_agb_t_ha": 8.0,
        "ndvi_threshold": 0.15,
        "root_shoot_ratio": 1.30,
        "soil_c_t_ha": 110.0,
        "accumulation_t_ha_yr": 0.80,
    },
    "saltmarsh": {
        "label": "Salt marsh",
        "max_agb_t_ha": 60.0,
        "ndvi_threshold": 0.35,
        "root_shoot_ratio": 1.20,
        "soil_c_t_ha": 255.0,
        "accumulation_t_ha_yr": 1.20,
    },
}

def vigour_index(ndvi_mean: float, ecosystem: str) -> float:
    d = ECOSYSTEM_DEFAULTS[ecosystem]
    span = max(d["max_agb_t_ha"] * 0.01, 0.30)
    return max(0.0, min(1.0, (ndvi_mean - d["ndvi_threshold"]) / span))

def carbon_stock(classified_ha: float, mean_ndvi: float, ecosystem: str) -> dict:
    d = ECOSYSTEM_DEFAULTS[ecosystem]
    vigour = vigour_index(mean_ndvi, ecosystem)

    agb_t_ha = vigour * d["max_agb_t_ha"]
    agb_t = agb_t_ha * classified_ha
    agb_c = agb_t * BIOMASS_C_FRACTION
    bgb_c = agb_c * d["root_shoot_ratio"]
    soil_c = d["soil_c_t_ha"] * classified_ha

    total_c = agb_c + bgb_c + soil_c
    return {
        "agb_t": agb_t,
        "agb_c_t": agb_c,
        "bgb_c_t": bgb_c,
        "soil_c_t": soil_c,
        "total_c_t": total_c,
        "stock_tco2e": total_c * C_TO_CO2,
    }

def sequestration(classified_ha: float, ecosystem: str, years: int = 20,
                  buffer: float = 0.90) -> dict:
    d = ECOSYSTEM_DEFAULTS[ecosystem]
    annual_c = d["accumulation_t_ha_yr"] * classified_ha
    projected_c = annual_c * years
    projected_tco2e = projected_c * C_TO_CO2
    return {
        "annual_tco2_yr": annual_c * C_TO_CO2,
        "projected_tco2e": projected_tco2e,
        "buffered_tco2e": projected_tco2e * buffer,
        "buffer": buffer,
        "years": years,
    }
