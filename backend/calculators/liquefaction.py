"""
Soil Liquefaction Triggering Analysis (Análise de Liquefação de Solos)
Based on NCEER / Youd & Idriss (2001) and Idriss & Boulanger simplified procedure.

Supports:
- Mode 1: Parametric Profile Analysis across depth (reproducing Sheet 1 of reference)
- Mode 2: Borehole SPT Layer-by-Layer Analysis (reproducing Sheet 2 of reference)
"""

import math
from typing import Dict, List, Any

# Reference Borehole Data from Sheet 2 of "Planilha de Análise de Liquefação - LZC-3.xlsx"
DEFAULT_BOREHOLE_LAYERS: List[Dict[str, Any]] = [
    {"depth": 1.0, "water_depth": 3.5, "gamma": 19.0, "n1_60": 33.0, "fc_pct": 10.0, "a_max": 0.55, "mw": 7.5},
    {"depth": 2.0, "water_depth": 3.5, "gamma": 19.0, "n1_60": 12.0, "fc_pct": 15.0, "a_max": 0.55, "mw": 7.5},
    {"depth": 3.0, "water_depth": 3.5, "gamma": 19.0, "n1_60": 25.0, "fc_pct": 5.0, "a_max": 0.55, "mw": 7.5},
    {"depth": 4.0, "water_depth": 3.5, "gamma": 19.0, "n1_60": 8.0, "fc_pct": 30.0, "a_max": 0.55, "mw": 7.5},
    {"depth": 5.0, "water_depth": 3.5, "gamma": 19.0, "n1_60": 33.0, "fc_pct": 10.0, "a_max": 0.55, "mw": 8.0},
    {"depth": 6.0, "water_depth": 3.5, "gamma": 19.0, "n1_60": 28.0, "fc_pct": 10.0, "a_max": 0.55, "mw": 7.5},
    {"depth": 7.0, "water_depth": 3.5, "gamma": 19.0, "n1_60": 22.0, "fc_pct": 12.0, "a_max": 0.55, "mw": 7.5},
    {"depth": 8.0, "water_depth": 3.5, "gamma": 19.0, "n1_60": 18.0, "fc_pct": 15.0, "a_max": 0.55, "mw": 7.5},
    {"depth": 9.0, "water_depth": 3.5, "gamma": 19.0, "n1_60": 14.0, "fc_pct": 18.0, "a_max": 0.55, "mw": 7.5},
    {"depth": 10.0, "water_depth": 3.5, "gamma": 19.0, "n1_60": 26.0, "fc_pct": 10.0, "a_max": 0.55, "mw": 7.5},
    {"depth": 12.0, "water_depth": 3.5, "gamma": 19.0, "n1_60": 30.0, "fc_pct": 8.0, "a_max": 0.55, "mw": 7.5},
    {"depth": 14.0, "water_depth": 3.5, "gamma": 19.0, "n1_60": 32.0, "fc_pct": 10.0, "a_max": 0.55, "mw": 7.5},
    {"depth": 16.0, "water_depth": 3.5, "gamma": 19.0, "n1_60": 35.0, "fc_pct": 5.0, "a_max": 0.55, "mw": 7.5},
]

# Reference Defaults for Parametric Profile (Sheet 1)
DEFAULT_PARAMETRIC_INPUTS: Dict[str, Any] = {
    "water_depth": 3.5,      # m
    "soil_gamma": 19.0,      # kN/m³
    "fines_content_fc": 10.0,# %
    "n1_60_min": 27.0,
    "n1_60_med": 33.0,
    "n1_60_max": 58.0,
    "a0_min": 0.55,          # g
    "a0_max": 0.70,          # g
    "mw_min": 6.0,
    "mw_med": 7.5,
    "mw_max": 8.5,
    "max_depth": 20.0,       # m
    "depth_step": 0.5        # m
}

def get_liquefaction_reference_data() -> Dict[str, Any]:
    """Returns preset data for both modes."""
    return {
        "parametric_defaults": DEFAULT_PARAMETRIC_INPUTS,
        "borehole_layers_defaults": DEFAULT_BOREHOLE_LAYERS
    }

def compute_delta_n1_60(fc: float) -> float:
    """Fines content correction: ΔN1(60) = EXP(1.63 + 9.7/(FC + 0.01) - (15.7/(FC + 0.01))^2)"""
    fc_val = max(0.0, float(fc))
    denom = fc_val + 0.01
    term = 1.63 + (9.7 / denom) - ((15.7 / denom) ** 2)
    return math.exp(term)

def compute_crr_7_5(n1_60_cs: float) -> float:
    """
    Cyclic Resistance Ratio for Mw=7.5 and effective stress = 100 kPa:
    CRR_7.5 = EXP((x/14.1) + (x/126)^2 - (x/23.6)^3 + (x/25.4)^4 - 2.8)
    Capped if x >= 37.5.
    """
    x = min(37.5, max(0.0, float(n1_60_cs)))
    val = (x / 14.1) + ((x / 126.0) ** 2) - ((x / 23.6) ** 3) + ((x / 25.4) ** 4) - 2.8
    return math.exp(val)

def compute_c_sigma(n1_60_cs: float) -> float:
    """Cσ = 1 / (18.9 - 2.55 * SQRT(x))"""
    x = max(0.0, float(n1_60_cs))
    denom = 18.9 - 2.55 * math.sqrt(x)
    return 1.0 / denom if abs(denom) > 1e-6 else 0.25

def compute_msf(mw: float) -> float:
    """Magnitude Scaling Factor: MSF = MIN(1.8, 6.9 * EXP(-Mw / 4) - 0.058)"""
    mw_val = float(mw)
    val = 6.9 * math.exp(-mw_val / 4.0) - 0.058
    return min(1.8, max(0.2, val))

def compute_rd(z: float) -> float:
    """
    Shear stress reduction coefficient rd:
    z <= 9.15 m: 1.0 - 0.00765 * z
    9.15 < z <= 23 m: 1.174 - 0.0267 * z
    z > 23 m: max(0.50, 0.744 - 0.008 * z)
    """
    if z <= 9.15:
        return 1.0 - 0.00765 * z
    elif z <= 23.0:
        return 1.174 - 0.0267 * z
    else:
        return max(0.50, 0.744 - 0.008 * z)

def compute_k_sigma(c_sigma: float, sigma_v_eff: float) -> float:
    """Kσ = MIN(1.1, 1 - Cσ * LN(σv' / 100))"""
    if sigma_v_eff <= 0.1:
        return 1.1
    ratio = sigma_v_eff / 100.0
    val = 1.0 - c_sigma * math.log(ratio)
    return min(1.1, max(0.2, val))

def calculate_liquefaction_profile(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Mode 1: Parametric Profile Analysis across depth (Sheet 1).
    Generates depth steps and calculates all scenarios for (N1_60 min/med/max, a0 min/max, Mw min/med/max).
    """
    try:
        na = float(inputs.get("water_depth", 3.5))
        gamma = float(inputs.get("soil_gamma", 19.0))
        fc = float(inputs.get("fines_content_fc", 10.0))
        
        n1_min = float(inputs.get("n1_60_min", 27.0))
        n1_med = float(inputs.get("n1_60_med", 33.0))
        n1_max = float(inputs.get("n1_60_max", 58.0))
        
        a0_min = float(inputs.get("a0_min", 0.55))
        a0_max = float(inputs.get("a0_max", 0.70))
        
        mw_min = float(inputs.get("mw_min", 6.0))
        mw_med = float(inputs.get("mw_med", 7.5))
        mw_max = float(inputs.get("mw_max", 8.5))
        
        max_depth = float(inputs.get("max_depth", 20.0))
        depth_step = float(inputs.get("depth_step", 0.5))

        # 1. Base Soil & Earthquake Properties
        delta_n1 = compute_delta_n1_60(fc)
        
        cs_min = min(37.5, n1_min + delta_n1)
        cs_med = min(37.5, n1_med + delta_n1)
        cs_max = min(37.5, n1_max + delta_n1)

        c_sig_min = compute_c_sigma(cs_min)
        c_sig_med = compute_c_sigma(cs_med)
        c_sig_max = compute_c_sigma(cs_max)

        msf_min = compute_msf(mw_min)
        msf_med = compute_msf(mw_med)
        msf_max = compute_msf(mw_max)

        crr_min = compute_crr_7_5(cs_min)
        crr_med = compute_crr_7_5(cs_med)
        crr_max = compute_crr_7_5(cs_max)

        # 2. Generate Depth Profile Steps
        profile_rows = []
        current_z = depth_step
        
        fs_min_a0min_min = 999.0
        depth_min_a0min_min = current_z

        fs_min_a0min_med = 999.0
        depth_min_a0min_med = current_z

        fs_min_a0min_max = 999.0
        depth_min_a0min_max = current_z

        fs_min_a0max_min = 999.0
        depth_min_a0max_min = current_z

        fs_min_a0max_med = 999.0
        depth_min_a0max_med = current_z

        fs_min_a0max_max = 999.0
        depth_min_a0max_max = current_z

        while current_z <= max_depth + 1e-4:
            sigma_v = current_z * gamma
            u = max(0.0, (current_z - na) * 9.81)
            sigma_v_eff = max(0.1, sigma_v - u)
            rd = compute_rd(current_z)

            # CSR
            csr_a0_min = 0.65 * a0_min * (sigma_v / sigma_v_eff) * rd
            csr_a0_max = 0.65 * a0_max * (sigma_v / sigma_v_eff) * rd

            # K_sigma
            k_sig_min = compute_k_sigma(c_sig_min, sigma_v_eff)
            k_sig_med = compute_k_sigma(c_sig_med, sigma_v_eff)
            k_sig_max = compute_k_sigma(c_sig_max, sigma_v_eff)

            # Safety Factors according to spreadsheet formula: FS = (CRR * MSF) / (CSR * K_sigma)
            fs_a0min_min = (crr_min * msf_min) / (csr_a0_min * k_sig_min)
            fs_a0min_med = (crr_med * msf_med) / (csr_a0_min * k_sig_med)
            fs_a0min_max = (crr_max * msf_max) / (csr_a0_min * k_sig_max)

            fs_a0max_min = (crr_min * msf_min) / (csr_a0_max * k_sig_min)
            fs_a0max_med = (crr_med * msf_med) / (csr_a0_max * k_sig_med)
            # In excel cell P11: =(G7*I6)/(G11*J11) -> matches crr_med*msf_med/(csr_a0max*k_sig_max)
            fs_a0max_max = (crr_max * msf_max) / (csr_a0_max * k_sig_max)

            # Track minimums
            if fs_a0min_min < fs_min_a0min_min:
                fs_min_a0min_min = fs_a0min_min
                depth_min_a0min_min = current_z
            if fs_a0min_med < fs_min_a0min_med:
                fs_min_a0min_med = fs_a0min_med
                depth_min_a0min_med = current_z
            if fs_a0min_max < fs_min_a0min_max:
                fs_min_a0min_max = fs_a0min_max
                depth_min_a0min_max = current_z

            if fs_a0max_min < fs_min_a0max_min:
                fs_min_a0max_min = fs_a0max_min
                depth_min_a0max_min = current_z
            if fs_a0max_med < fs_min_a0max_med:
                fs_min_a0max_med = fs_a0max_med
                depth_min_a0max_med = current_z
            if fs_a0max_max < fs_min_a0max_max:
                fs_min_a0max_max = fs_a0max_max
                depth_min_a0max_max = current_z

            profile_rows.append({
                "depth": round(current_z, 2),
                "sigma_v": round(sigma_v, 2),
                "u": round(u, 2),
                "sigma_v_eff": round(sigma_v_eff, 2),
                "rd": round(rd, 4),
                "csr_a0_min": round(csr_a0_min, 4),
                "csr_a0_max": round(csr_a0_max, 4),
                "k_sig_min": round(k_sig_min, 4),
                "k_sig_med": round(k_sig_med, 4),
                "k_sig_max": round(k_sig_max, 4),
                "fs_a0min_min": round(fs_a0min_min, 3),
                "fs_a0min_med": round(fs_a0min_med, 3),
                "fs_a0min_max": round(fs_a0min_max, 3),
                "fs_a0max_min": round(fs_a0max_min, 3),
                "fs_a0max_med": round(fs_a0max_med, 3),
                "fs_a0max_max": round(fs_a0max_max, 3)
            })

            current_z += depth_step

        return {
            "success": True,
            "mode": "parametric_profile",
            "inputs": {
                "water_depth": na,
                "soil_gamma": gamma,
                "fines_content_fc": fc,
                "n1_60": {"min": n1_min, "med": n1_med, "max": n1_max},
                "a0": {"min": a0_min, "max": a0_max},
                "mw": {"min": mw_min, "med": mw_med, "max": mw_max}
            },
            "calcs": {
                "delta_n1_60": round(delta_n1, 3),
                "n1_60_cs": {"min": round(cs_min, 2), "med": round(cs_med, 2), "max": round(cs_max, 2)},
                "c_sigma": {"min": round(c_sig_min, 4), "med": round(c_sig_med, 4), "max": round(c_sig_max, 4)},
                "msf": {"min": round(msf_min, 4), "med": round(msf_med, 4), "max": round(msf_max, 4)},
                "crr_7_5": {"min": round(crr_min, 4), "med": round(crr_med, 4), "max": round(crr_max, 4)}
            },
            "summary_scenarios": {
                "a0_min": {
                    "scenario_min": {"fs_min": round(fs_min_a0min_min, 3), "depth_crit_m": depth_min_a0min_min, "status": "SEGURO" if fs_min_a0min_min >= 1.2 else ("MARGEM CRÍTICA" if fs_min_a0min_min >= 1.0 else "LIQUEFAÇÃO PROVÁVEL")},
                    "scenario_med": {"fs_min": round(fs_min_a0min_med, 3), "depth_crit_m": depth_min_a0min_med, "status": "SEGURO" if fs_min_a0min_med >= 1.2 else ("MARGEM CRÍTICA" if fs_min_a0min_med >= 1.0 else "LIQUEFAÇÃO PROVÁVEL")},
                    "scenario_max": {"fs_min": round(fs_min_a0min_max, 3), "depth_crit_m": depth_min_a0min_max, "status": "SEGURO" if fs_min_a0min_max >= 1.2 else ("MARGEM CRÍTICA" if fs_min_a0min_max >= 1.0 else "LIQUEFAÇÃO PROVÁVEL")},
                },
                "a0_max": {
                    "scenario_min": {"fs_min": round(fs_min_a0max_min, 3), "depth_crit_m": depth_min_a0max_min, "status": "SEGURO" if fs_min_a0max_min >= 1.2 else ("MARGEM CRÍTICA" if fs_min_a0max_min >= 1.0 else "LIQUEFAÇÃO PROVÁVEL")},
                    "scenario_med": {"fs_min": round(fs_min_a0max_med, 3), "depth_crit_m": depth_min_a0max_med, "status": "SEGURO" if fs_min_a0max_med >= 1.2 else ("MARGEM CRÍTICA" if fs_min_a0max_med >= 1.0 else "LIQUEFAÇÃO PROVÁVEL")},
                    "scenario_max": {"fs_min": round(fs_min_a0max_max, 3), "depth_crit_m": depth_min_a0max_max, "status": "SEGURO" if fs_min_a0max_max >= 1.2 else ("MARGEM CRÍTICA" if fs_min_a0max_max >= 1.0 else "LIQUEFAÇÃO PROVÁVEL")},
                }
            },
            "profile": profile_rows
        }
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}

def calculate_liquefaction_layers(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Mode 2: Borehole SPT Layer-by-Layer Analysis (Sheet 2).
    Evaluates individual layers from actual SPT field borehole tests.
    """
    try:
        layers = inputs.get("layers", DEFAULT_BOREHOLE_LAYERS)
        default_na = float(inputs.get("default_water_depth", 3.5))
        default_gamma = float(inputs.get("default_soil_gamma", 19.0))
        default_a_max = float(inputs.get("default_a_max", 0.55))
        default_mw = float(inputs.get("default_mw", 7.5))

        results_layers = []
        min_fs = 999.0
        crit_depth = 0.0
        num_liquefiable = 0
        total_liquefiable_thickness = 0.0

        sorted_layers = sorted(layers, key=lambda x: float(x.get("depth", 0)))

        for idx, lay in enumerate(sorted_layers):
            z = float(lay.get("depth", idx + 1.0))
            if z <= 0:
                continue

            na = float(lay.get("water_depth", default_na))
            gamma = float(lay.get("gamma", default_gamma))
            n1_60 = float(lay.get("n1_60", 15.0))
            fc = float(lay.get("fc_pct", 10.0))
            a_max = float(lay.get("a_max", default_a_max))
            mw = float(lay.get("mw", default_mw))

            sigma_v = z * gamma
            u = max(0.0, (z - na) * 9.81)
            sigma_v_eff = max(0.1, sigma_v - u)

            rd = compute_rd(z)
            csr = 0.65 * a_max * (sigma_v / sigma_v_eff) * rd

            delta_n1 = compute_delta_n1_60(fc)
            n1_60_cs = min(37.5, n1_60 + delta_n1)

            crr_7_5 = compute_crr_7_5(n1_60_cs)
            c_sig = compute_c_sigma(n1_60_cs)
            k_sig = compute_k_sigma(c_sig, sigma_v_eff)
            msf = compute_msf(mw)

            # FS formulation:
            # 1. Spreadsheet LZC-3 formula: FS = (CRR_7.5 * MSF) / (CSR * K_sigma)
            # 2. Canonical NCEER / Youd & Idriss (2001): FS = (CRR_7.5 * MSF * K_sigma) / CSR
            fs_spreadsheet = (crr_7_5 * msf) / (csr * k_sig) if (csr > 0 and k_sig > 0) else 999.0
            fs_nceer_standard = (crr_7_5 * msf * k_sig) / csr if csr > 0 else 999.0

            use_nceer = inputs.get("formulation", "spreadsheet").lower() in ("nceer", "standard", "nceer_standard")
            fs = fs_nceer_standard if use_nceer else fs_spreadsheet

            # Classification
            if n1_60_cs >= 37.5:
                status = "NÃO LIQUEFAZ (Solo Denso)"
                risk_level = "safe"
            elif fs < 1.0:
                status = "LIQUEFAÇÃO PROVÁVEL"
                risk_level = "critical"
                num_liquefiable += 1
                total_liquefiable_thickness += 1.0  # nominal 1m per SPT step
            elif fs < 1.2:
                status = "MARGEM CRÍTICA"
                risk_level = "warning"
            else:
                status = "SEGURO"
                risk_level = "safe"

            if fs < min_fs and risk_level != "safe":
                min_fs = fs
                crit_depth = z

            results_layers.append({
                "depth": round(z, 2),
                "water_depth": round(na, 2),
                "gamma": round(gamma, 2),
                "n1_60": round(n1_60, 1),
                "fc_pct": round(fc, 1),
                "a_max": round(a_max, 3),
                "mw": round(mw, 2),
                "sigma_v": round(sigma_v, 2),
                "u": round(u, 2),
                "sigma_v_eff": round(sigma_v_eff, 2),
                "rd": round(rd, 4),
                "csr": round(csr, 4),
                "delta_n1": round(delta_n1, 3),
                "n1_60_cs": round(n1_60_cs, 2),
                "crr_7_5": round(crr_7_5, 4),
                "c_sigma": round(c_sig, 4),
                "k_sigma": round(k_sig, 4),
                "msf": round(msf, 4),
                "fs": round(fs, 3),
                "fs_spreadsheet": round(fs_spreadsheet, 3),
                "fs_nceer_standard": round(fs_nceer_standard, 3),
                "status": status,
                "risk_level": risk_level
            })

        overall_status = "CRÍTICO (Risco de Liquefação)" if num_liquefiable > 0 else "ESTÁVEL (Sem Liquefação)"

        return {
            "success": True,
            "mode": "borehole_layers",
            "summary": {
                "min_fs": round(min_fs, 3) if min_fs < 999.0 else None,
                "crit_depth_m": crit_depth if min_fs < 999.0 else None,
                "num_liquefiable_layers": num_liquefiable,
                "estimated_liquefiable_thickness_m": total_liquefiable_thickness,
                "overall_status": overall_status
            },
            "layers": results_layers
        }
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}
