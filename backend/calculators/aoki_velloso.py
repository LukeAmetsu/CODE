"""
Aoki-Velloso & Décourt-Quaresma Foundation Capacity & Dynamic Stiffness Calculator
Calculador Completo de Fundações Profundas (Métodos Aoki-Velloso 1975 & Décourt-Quaresma 1978/1996 + Blévot NBR 6118)

Features:
- Aoki-Velloso (1975): Unit/total shaft skin friction (rl, Rl), base tip resistance (rp, Rp), allowable capacity (Radm)
- Décourt-Quaresma (1978 / 1996): C factor, Np 3-point tip average, shaft friction ql, alpha/beta pile factors, global and partial Radm
- Side-by-Side Comparison: Direct comparison of Aoki-Velloso vs Décourt-Quaresma, mean values, conservative envelope, and dual depth profiles
- Static vertical and horizontal soil-spring stiffness (Kz, Kh_min, Kh_max)
- Dynamic shear modulus (G), shear wave velocity (Vs), and radiation damping (Cv, Ch)
- Structural springs for Piled Raft and Piled Beam (Kz, Kx, Q_neg, T_adm)
- Pile Cap Design (Método de Blévot & Frémy, 1967 / NBR 6118): 1 to 6 piles, strut-and-tie stresses, and tie rebar As
"""

import math
from typing import Dict, List, Any

# 1. Soil Coefficients according to Aoki-Velloso (1975)
# K in kg/cm², alpha in %, beta_min and beta_max (horizontal coefficient)
SOIL_DATABASE: Dict[str, Dict[str, float]] = {
    "AREIA": {"K": 7.3, "alpha": 2.1, "beta_min": 20.0, "beta_max": 30.0},
    "AREIA SILTOSA": {"K": 6.8, "alpha": 2.3, "beta_min": 15.0, "beta_max": 20.0},
    "AREIA SILTOARGILOSA": {"K": 6.3, "alpha": 2.4, "beta_min": 15.0, "beta_max": 20.0},
    "AREIA ARGILOSSILTOSA": {"K": 5.7, "alpha": 2.9, "beta_min": 15.0, "beta_max": 20.0},
    "AREIA ARGILOSA": {"K": 5.4, "alpha": 2.8, "beta_min": 15.0, "beta_max": 20.0},
    "SILTE ARENOSO": {"K": 5.0, "alpha": 3.0, "beta_min": 15.0, "beta_max": 20.0},
    "SILTE ARENOARGILOSO": {"K": 4.5, "alpha": 3.2, "beta_min": 15.0, "beta_max": 20.0},
    "SILTE ARGILOARENOSO": {"K": 4.0, "alpha": 3.3, "beta_min": 15.0, "beta_max": 20.0},
    "SILTE ARGILOSO": {"K": 3.2, "alpha": 3.6, "beta_min": 15.0, "beta_max": 20.0},
    "ARGILA ARENOSA": {"K": 4.4, "alpha": 3.2, "beta_min": 15.0, "beta_max": 20.0},
    "ARGILA ARENOSSILTOSA": {"K": 3.0, "alpha": 3.8, "beta_min": 15.0, "beta_max": 20.0},
    "ARGILA SILTOARENOSA": {"K": 3.3, "alpha": 4.1, "beta_min": 15.0, "beta_max": 20.0},
    "ARGILA SILTOSA": {"K": 2.6, "alpha": 4.5, "beta_min": 15.0, "beta_max": 20.0},
    "ARGILA": {"K": 2.5, "alpha": 5.5, "beta_min": 10.0, "beta_max": 15.0},
    "ROCHA": {"K": 100.0, "alpha": 100.0, "beta_min": 100.0, "beta_max": 100.0},
}

# Propriedades geotécnicas típicas por tipo de solo para inferência de empuxo
# phi_deg: ângulo de atrito interno estimado (Peck / Meyerhof)
# gamma_kN_m3: peso específico natural típico (kN/m³)
# c_kPa: coesão típica (0 para solos granulares)
SOIL_PHI_GAMMA: Dict[str, Dict[str, float]] = {
    "AREIA":                    {"phi_deg": 35.0, "gamma_kN_m3": 18.0, "c_kPa": 0.0},
    "AREIA SILTOSA":            {"phi_deg": 32.0, "gamma_kN_m3": 18.0, "c_kPa": 0.0},
    "AREIA SILTOARGILOSA":      {"phi_deg": 30.0, "gamma_kN_m3": 17.5, "c_kPa": 2.0},
    "AREIA ARGILOSSILTOSA":     {"phi_deg": 28.0, "gamma_kN_m3": 17.5, "c_kPa": 3.0},
    "AREIA ARGILOSA":           {"phi_deg": 28.0, "gamma_kN_m3": 17.0, "c_kPa": 5.0},
    "SILTE ARENOSO":            {"phi_deg": 28.0, "gamma_kN_m3": 17.5, "c_kPa": 3.0},
    "SILTE ARENOARGILOSO":      {"phi_deg": 26.0, "gamma_kN_m3": 17.0, "c_kPa": 5.0},
    "SILTE ARGILOARENOSO":      {"phi_deg": 24.0, "gamma_kN_m3": 17.0, "c_kPa": 8.0},
    "SILTE ARGILOSO":           {"phi_deg": 22.0, "gamma_kN_m3": 16.5, "c_kPa": 10.0},
    "ARGILA ARENOSA":           {"phi_deg": 25.0, "gamma_kN_m3": 17.0, "c_kPa": 10.0},
    "ARGILA ARENOSSILTOSA":     {"phi_deg": 22.0, "gamma_kN_m3": 16.5, "c_kPa": 12.0},
    "ARGILA SILTOARENOSA":      {"phi_deg": 20.0, "gamma_kN_m3": 16.5, "c_kPa": 15.0},
    "ARGILA SILTOSA":           {"phi_deg": 18.0, "gamma_kN_m3": 16.0, "c_kPa": 18.0},
    "ARGILA":                   {"phi_deg": 15.0, "gamma_kN_m3": 16.0, "c_kPa": 25.0},
    "ROCHA":                    {"phi_deg": 45.0, "gamma_kN_m3": 25.0, "c_kPa": 0.0},
}

# 2. Pile Type Factors F1 (Tip) and F2 (Shaft) - Aoki-Velloso
PILE_FACTORS: Dict[str, Dict[str, float]] = {
    "FRANKI DE FUSTE APILOADO": {"F1": 2.3, "F2": 3.0},
    "FRANKI DE FUSTE VIBRADO": {"F1": 2.3, "F2": 3.2},
    "METÁLICA": {"F1": 1.75, "F2": 3.5},
    "PRÉ-MOLDADA DE CONCRETO CRAVA A PERCUSSÃO": {"F1": 2.5, "F2": 3.5},
    "PRÉ-MOLDADA DE CONCRETO CRAVADA POR PRENSAGEM": {"F1": 1.2, "F2": 2.3},
    "ESCAVADA COM LAMA BENTONÍTICA": {"F1": 3.5, "F2": 4.5},
    "RAIZ": {"F1": 2.2, "F2": 2.4},
    "STRAUSS": {"F1": 4.2, "F2": 3.9},
    "HÉLICE CONTÍNUA": {"F1": 3.0, "F2": 3.8},
}

# 3. Décourt-Quaresma (1978 / 1996) Characteristic Tip Coefficient C (in kPa)
# Standard: Sand: 400 kPa; Clayey Sand/Sandy Silt: 250 kPa; Clayey Silt: 200 kPa; Clay: 120 kPa
DECOURT_C_DATABASE: Dict[str, float] = {
    "AREIA": 400.0,
    "AREIA SILTOSA": 330.0,
    "AREIA SILTOARGILOSA": 300.0,
    "AREIA ARGILOSSILTOSA": 250.0,
    "AREIA ARGILOSA": 250.0,
    "SILTE ARENOSO": 250.0,
    "SILTE ARENOARGILOSO": 230.0,
    "SILTE ARGILOARENOSO": 220.0,
    "SILTE ARGILOSO": 200.0,
    "ARGILA ARENOSA": 200.0,
    "ARGILA ARENOSSILTOSA": 160.0,
    "ARGILA SILTOARENOSA": 160.0,
    "ARGILA SILTOSA": 140.0,
    "ARGILA": 120.0,
    "ROCHA": 1000.0,
}

# 4. Décourt (1996) Pile Factors: alpha (Tip) and beta (Shaft)
DECOURT_PILE_FACTORS: Dict[str, Dict[str, float]] = {
    "PRÉ-MOLDADA DE CONCRETO CRAVA A PERCUSSÃO": {"alpha": 1.0, "beta": 1.0},
    "PRÉ-MOLDADA DE CONCRETO CRAVADA POR PRENSAGEM": {"alpha": 1.0, "beta": 1.0},
    "METÁLICA": {"alpha": 1.0, "beta": 1.0},
    "FRANKI DE FUSTE APILOADO": {"alpha": 1.0, "beta": 1.0},
    "FRANKI DE FUSTE VIBRADO": {"alpha": 1.0, "beta": 1.0},
    "HÉLICE CONTÍNUA": {"alpha": 0.3, "beta": 1.0},
    "ESCAVADA COM LAMA BENTONÍTICA": {"alpha": 0.5, "beta": 0.8},
    "ESCAVADA A SECO": {"alpha": 0.5, "beta": 0.8},
    "RAIZ": {"alpha": 0.85, "beta": 1.5},
    "STRAUSS": {"alpha": 0.5, "beta": 1.0},
    "ÔMEGA": {"alpha": 1.0, "beta": 1.1},
}

# Reference Borehole Profile from Excel Sheet (AOKI VELOSO version 1.xlsb.xlsx)
DEFAULT_REFERENCE_PROFILE: List[Dict[str, Any]] = [
    {"depth": 1, "soil_type": "ARGILA SILTOARENOSA", "nspt": 2.4},
    {"depth": 2, "soil_type": "ARGILA SILTOARENOSA", "nspt": 1.4},
    {"depth": 3, "soil_type": "ARGILA SILTOARENOSA", "nspt": 1.9},
    {"depth": 4, "soil_type": "ARGILA SILTOARENOSA", "nspt": 2.6},
    {"depth": 5, "soil_type": "ARGILA SILTOARENOSA", "nspt": 3.6},
    {"depth": 6, "soil_type": "ARGILA SILTOARENOSA", "nspt": 3.6},
    {"depth": 7, "soil_type": "ARGILA SILTOARENOSA", "nspt": 3.9},
    {"depth": 8, "soil_type": "ARGILA SILTOARENOSA", "nspt": 7.3},
    {"depth": 9, "soil_type": "ARGILA SILTOARENOSA", "nspt": 7.3},
    {"depth": 10, "soil_type": "ARGILA SILTOARENOSA", "nspt": 8.4},
    {"depth": 11, "soil_type": "ARGILA SILTOARENOSA", "nspt": 12.6},
    {"depth": 12, "soil_type": "ARGILA SILTOARENOSA", "nspt": 11.0},
    {"depth": 13, "soil_type": "ARGILA SILTOARENOSA", "nspt": 10.0},
    {"depth": 14, "soil_type": "ARGILA SILTOARENOSA", "nspt": 15.0},
    {"depth": 15, "soil_type": "ARGILA SILTOARENOSA", "nspt": 22.4},
    {"depth": 16, "soil_type": "ARGILA SILTOARENOSA", "nspt": 20.6},
    {"depth": 17, "soil_type": "ROCHA", "nspt": 60.0},
]

def get_aoki_reference_data() -> Dict[str, Any]:
    """Returns database constants and default reference profile for deep foundations."""
    return {
        "soil_types": list(SOIL_DATABASE.keys()),
        "soil_database": SOIL_DATABASE,
        "pile_types": list(PILE_FACTORS.keys()),
        "pile_factors": PILE_FACTORS,
        "decourt_c_database": DECOURT_C_DATABASE,
        "decourt_pile_factors": DECOURT_PILE_FACTORS,
        "default_profile": DEFAULT_REFERENCE_PROFILE,
        "default_inputs": {
            "geometry": "Circular",
            "diameter": 1.0,
            "width_b": 1.0,
            "height_h": 1.0,
            "depth_pile": 16.0,
            "pile_type": "PRÉ-MOLDADA DE CONCRETO CRAVA A PERCUSSÃO",
            "allowable_settlement_mm": 5.0,
            "soil_gamma": 1.8, # tf/m³
            "num_piles": 15,
            "structure_mass_ton": 1690.4
        },
        "default_cap_inputs": {
            "cap_num_piles": 2,
            "cap_pile_diam_m": 0.60,
            "cap_pile_spacing_m": 1.80,
            "cap_col_a_m": 0.40,
            "cap_col_b_m": 0.40,
            "cap_load_Nk_kN": 1500.0,
            "cap_fck_mpa": 30.0,
            "cap_fyk_mpa": 500.0,
            "cap_cover_cm": 5.0,
            "cap_embedment_cm": 5.0
        }
    }

def calculate_decourt_quaresma(
    sorted_layers: List[Dict[str, Any]],
    depth_pile: float,
    area_m2: float,
    perim_m: float,
    pile_type: str,
    custom_alpha: float = None,
    custom_beta: float = None,
    fs_global: float = 2.0
) -> Dict[str, Any]:
    """
    Calculates pile capacity using the Décourt-Quaresma (1978 / 1996) method.
    """
    factors = DECOURT_PILE_FACTORS.get(pile_type, {"alpha": 1.0, "beta": 1.0})
    alpha = float(custom_alpha) if custom_alpha is not None else factors["alpha"]
    beta = float(custom_beta) if custom_beta is not None else factors["beta"]

    # Locate tip layer index (layer corresponding to depth_pile)
    tip_layer_idx = 0
    for idx, l in enumerate(sorted_layers):
        z = float(l.get("depth", idx + 1))
        if z <= depth_pile + 1e-4:
            tip_layer_idx = idx

    # 1. Lateral resistance (Atrito lateral)
    processed_layers_decourt = []
    sum_rl_base_kN = 0.0
    last_depth = 0.0

    for idx, layer in enumerate(sorted_layers):
        z = float(layer.get("depth", idx + 1))
        dz = z - last_depth if idx > 0 else z
        last_depth = z

        stype = layer.get("soil_type", "ARGILA SILTOARENOSA").strip().upper()
        C_kpa = DECOURT_C_DATABASE.get(stype, 200.0)
        nspt = float(layer.get("nspt", 1.0))

        # Décourt rule for shaft: N_L clamped between 3 and 50
        nl_clamped = max(3.0, min(50.0, nspt))
        # ql in kPa: ql = 10 * (N_L / 3 + 1)
        ql_kpa = 10.0 * ((nl_clamped / 3.0) + 1.0)

        in_pile = (z <= depth_pile + 1e-6)

        layer_rl_base_kN = 0.0
        if in_pile:
            layer_rl_base_kN = ql_kpa * dz * perim_m
            sum_rl_base_kN += layer_rl_base_kN

        # Cumulative Décourt Radm at this specific depth z
        # (considering pile tip placed at depth z)
        # Tip average at z
        tip_candidates = []
        if idx > 0:
            tip_candidates.append(float(sorted_layers[idx - 1].get("nspt", 1.0)))
        tip_candidates.append(nspt)
        if idx < len(sorted_layers) - 1:
            tip_candidates.append(float(sorted_layers[idx + 1].get("nspt", 1.0)))
        np_at_z = sum(tip_candidates) / len(tip_candidates)
        np_at_z_clamped = max(1.0, min(50.0, np_at_z))
        rp_at_z_kN = alpha * (C_kpa * np_at_z_clamped * area_m2)
        rl_accum_at_z_kN = beta * sum_rl_base_kN
        radm_at_z_kN = (rp_at_z_kN + rl_accum_at_z_kN) / fs_global

        processed_layers_decourt.append({
            "depth": z,
            "soil_type": stype,
            "nspt": nspt,
            "C_kpa": C_kpa,
            "ql_kpa": round(ql_kpa, 2),
            "delta_rl_base_kN": round(layer_rl_base_kN, 2),
            "accum_rl_kN": round(rl_accum_at_z_kN, 2),
            "accum_rl_tf": round(rl_accum_at_z_kN / 9.80665, 2),
            "rp_kN": round(rp_at_z_kN, 2),
            "rp_tf": round(rp_at_z_kN / 9.80665, 2),
            "radm_kN": round(radm_at_z_kN, 2),
            "radm_tf": round(radm_at_z_kN / 9.80665, 2),
            "dz": dz,
            "in_pile": in_pile
        })

    # Total shaft resistance up to depth_pile
    Rl_base_kN = sum_rl_base_kN
    Rl_kN = beta * Rl_base_kN
    Rl_tf = Rl_kN / 9.80665

    # 2. Tip resistance (Resistência de Ponta) at actual depth_pile
    # Np: 3-point average (layer above, tip layer, layer below)
    tip_nspts = []
    if tip_layer_idx > 0:
        tip_nspts.append(float(sorted_layers[tip_layer_idx - 1].get("nspt", 1.0)))
    tip_nspts.append(float(sorted_layers[tip_layer_idx].get("nspt", 1.0)))
    if tip_layer_idx < len(sorted_layers) - 1:
        tip_nspts.append(float(sorted_layers[tip_layer_idx + 1].get("nspt", 1.0)))

    np_mean = sum(tip_nspts) / len(tip_nspts)
    np_clamped = max(1.0, min(50.0, np_mean))

    tip_stype = sorted_layers[tip_layer_idx].get("soil_type", "ARGILA SILTOARENOSA").strip().upper()
    tip_C_kpa = DECOURT_C_DATABASE.get(tip_stype, 200.0)

    # qp in kPa: qp = C * Np
    qp_kpa = tip_C_kpa * np_clamped
    Rp_base_kN = qp_kpa * area_m2
    Rp_kN = alpha * Rp_base_kN
    Rp_tf = Rp_kN / 9.80665

    # 3. Ultimate and Allowable capacities
    Q_ult_kN = Rl_kN + Rp_kN
    Q_ult_tf = Q_ult_kN / 9.80665

    Radm_kN = Q_ult_kN / fs_global
    Radm_tf = Radm_kN / 9.80665

    # Partial safety factor criteria: Radm = Rp_base / 4.0 + Rl_base / 1.3
    Radm_partial_kN = (Rp_base_kN / 4.0) + (Rl_base_kN / 1.3)
    Radm_partial_tf = Radm_partial_kN / 9.80665

    return {
        "alpha": alpha,
        "beta": beta,
        "fs_global": fs_global,
        "np_mean": round(np_mean, 2),
        "np_clamped": round(np_clamped, 2),
        "tip_C_kpa": tip_C_kpa,
        "qp_kpa": round(qp_kpa, 2),
        "R_shaft_base_kN": round(Rl_base_kN, 2),
        "R_shaft_kN": round(Rl_kN, 2),
        "R_shaft_tf": round(Rl_tf, 2),
        "R_tip_base_kN": round(Rp_base_kN, 2),
        "R_tip_kN": round(Rp_kN, 2),
        "R_tip_tf": round(Rp_tf, 2),
        "Q_ult_kN": round(Q_ult_kN, 2),
        "Q_ult_tf": round(Q_ult_tf, 2),
        "R_adm_kN": round(Radm_kN, 2),
        "R_adm_tf": round(Radm_tf, 2),
        "R_adm_partial_kN": round(Radm_partial_kN, 2),
        "R_adm_partial_tf": round(Radm_partial_tf, 2),
        "ratio_shaft_pct": round((Rl_kN / Q_ult_kN * 100.0) if Q_ult_kN > 0 else 0.0, 1),
        "ratio_tip_pct": round((Rp_kN / Q_ult_kN * 100.0) if Q_ult_kN > 0 else 0.0, 1),
        "layers": processed_layers_decourt
    }

def calculate_blevot_pile_cap(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Design and verification of rigid pile caps according to Blévot & Frémy (1967) and NBR 6118.
    Supports 1, 2, 3, 4, 5, and 6 piles.
    """
    num_piles = int(inputs.get("cap_num_piles", 2))
    pile_diam = float(inputs.get("cap_pile_diam_m", inputs.get("diameter", 0.6)))
    pile_spacing = float(inputs.get("cap_pile_spacing_m", 3.0 * pile_diam))
    col_a = float(inputs.get("cap_col_a_m", 0.40))  # Pillar dimension in X (m)
    col_b = float(inputs.get("cap_col_b_m", 0.40))  # Pillar dimension in Y (m)
    Nk_kN = float(inputs.get("cap_load_Nk_kN", 1500.0))
    fck = float(inputs.get("cap_fck_mpa", 30.0))
    fyk = float(inputs.get("cap_fyk_mpa", 500.0))  # CA-50
    cover_cm = float(inputs.get("cap_cover_cm", 5.0))
    embedment_cm = float(inputs.get("cap_embedment_cm", 5.0))

    # Safety coefficients NBR 6118
    gamma_f = 1.4
    gamma_c = 1.4
    gamma_s = 1.15

    Nd_kN = Nk_kN * gamma_f
    fcd_mpa = fck / gamma_c
    fcd_kpa = fcd_mpa * 1000.0
    fyd_mpa = fyk / gamma_s
    alpha_v2 = 1.0 - (fck / 250.0)
    sigma_cd_lim_kpa = 0.85 * fcd_kpa * alpha_v2

    # Load per pile
    Pd_kN = Nd_kN / max(1, num_piles)
    Pk_kN = Nk_kN / max(1, num_piles)
    area_pile_m2 = math.pi * ((pile_diam / 2.0) ** 2)

    # Geometry and Strut-and-Tie Modeling per pile count
    overhang = max(0.15, 0.25 * pile_diam)

    if num_piles == 1:
        # Pedestal / Centered column block
        L_cap = pile_diam + 2 * overhang
        B_cap = pile_diam + 2 * overhang
        de = 0.0
        H_cap = max(0.60, round(1.5 * pile_diam, 2))
        d_eff = round(H_cap - (cover_cm / 100.0) - (embedment_cm / 100.0), 2)
        theta_deg = 90.0
        Ftd_kN = 0.0
        As_cm2 = max(2.5, round(0.0015 * B_cap * H_cap * 10000.0, 2))
        sigma_pilar_kpa = Nd_kN / (col_a * col_b)
        sigma_estaca_kpa = Nd_kN / area_pile_m2
    elif num_piles == 2:
        # 2-pile aligned block
        L_cap = round(pile_spacing + pile_diam + 2 * overhang, 2)
        B_cap = round(pile_diam + 2 * overhang, 2)
        de = pile_spacing / 2.0
        x_lever = max(0.10, de - (col_a / 4.0))
        theta_target_deg = 50.0
        d_req = x_lever * math.tan(math.radians(theta_target_deg))
        d_eff = max(0.50, round(d_req, 2))
        H_cap = round(d_eff + (cover_cm / 100.0) + (embedment_cm / 100.0) + 0.05, 2)
        theta_rad = math.atan2(d_eff, x_lever)
        theta_deg = math.degrees(theta_rad)

        # Strut stresses
        sigma_pilar_kpa = Nd_kN / (col_a * col_b * (math.sin(theta_rad) ** 2))
        sigma_estaca_kpa = Pd_kN / (area_pile_m2 * (math.sin(theta_rad) ** 2))

        # Tie tension: Ftd = Nd * (de - a/4) / (2 * d)
        Ftd_kN = (Nd_kN * x_lever) / (2.0 * d_eff)
        As_cm2 = max(2.5, (Ftd_kN / (fyd_mpa * 1000.0)) * 10000.0)
    elif num_piles == 3:
        # 3-pile triangular block
        R_circle = pile_spacing / math.sqrt(3.0)
        L_cap = round(pile_spacing + pile_diam + 2 * overhang, 2)
        B_cap = round((math.sqrt(3.0) / 2.0) * pile_spacing + pile_diam + 2 * overhang, 2)
        de = R_circle
        col_dim_eff = (col_a + col_b) / 2.0
        x_lever = max(0.10, de - (col_dim_eff / 4.0))
        theta_target_deg = 50.0
        d_req = x_lever * math.tan(math.radians(theta_target_deg))
        d_eff = max(0.50, round(d_req, 2))
        H_cap = round(d_eff + (cover_cm / 100.0) + (embedment_cm / 100.0) + 0.05, 2)
        theta_rad = math.atan2(d_eff, x_lever)
        theta_deg = math.degrees(theta_rad)

        sigma_pilar_kpa = Nd_kN / (col_a * col_b * (math.sin(theta_rad) ** 2))
        sigma_estaca_kpa = Pd_kN / (area_pile_m2 * (math.sin(theta_rad) ** 2))

        # Ftd per side
        Ftd_kN = (Nd_kN * x_lever) / (3.0 * math.sqrt(3.0) * d_eff)
        As_cm2 = max(2.5, (Ftd_kN / (fyd_mpa * 1000.0)) * 10000.0)
    elif num_piles == 4:
        # 4-pile square block
        L_cap = round(pile_spacing + pile_diam + 2 * overhang, 2)
        B_cap = L_cap
        de = pile_spacing / math.sqrt(2.0)
        col_dim_eff = math.sqrt(col_a * col_b)
        x_lever = max(0.10, de - (col_dim_eff / 4.0))
        theta_target_deg = 50.0
        d_req = x_lever * math.tan(math.radians(theta_target_deg))
        d_eff = max(0.55, round(d_req, 2))
        H_cap = round(d_eff + (cover_cm / 100.0) + (embedment_cm / 100.0) + 0.05, 2)
        theta_rad = math.atan2(d_eff, x_lever)
        theta_deg = math.degrees(theta_rad)

        sigma_pilar_kpa = Nd_kN / (col_a * col_b * (math.sin(theta_rad) ** 2))
        sigma_estaca_kpa = Pd_kN / (area_pile_m2 * (math.sin(theta_rad) ** 2))

        # Tie tension in X and Y grid
        x_lever_grid = max(0.10, pile_spacing / 2.0 - col_a / 4.0)
        Ftd_kN = (Nd_kN * x_lever_grid) / (2.0 * d_eff)
        As_cm2 = max(3.0, (Ftd_kN / (fyd_mpa * 1000.0)) * 10000.0)
    else:
        # 5 or 6 piles rectangular grid
        cols = math.ceil(num_piles / 2.0)
        L_cap = round((cols - 1) * pile_spacing + pile_diam + 2 * overhang, 2)
        B_cap = round(pile_spacing + pile_diam + 2 * overhang, 2)
        de = pile_spacing / 2.0
        x_lever = max(0.10, de - (col_a / 4.0))
        d_eff = max(0.60, round(x_lever * math.tan(math.radians(50.0)), 2))
        H_cap = round(d_eff + (cover_cm / 100.0) + (embedment_cm / 100.0) + 0.05, 2)
        theta_rad = math.atan2(d_eff, x_lever)
        theta_deg = math.degrees(theta_rad)
        sigma_pilar_kpa = Nd_kN / (col_a * col_b * (math.sin(theta_rad) ** 2))
        sigma_estaca_kpa = Pd_kN / (area_pile_m2 * (math.sin(theta_rad) ** 2))
        Ftd_kN = (Nd_kN * x_lever) / (2.0 * d_eff)
        As_cm2 = max(3.0, (Ftd_kN / (fyd_mpa * 1000.0)) * 10000.0)

    # Verifications
    is_rigid = (theta_deg >= 45.0) and (theta_deg <= 55.0)
    ok_pilar = sigma_pilar_kpa <= sigma_cd_lim_kpa
    ok_estaca = sigma_estaca_kpa <= sigma_cd_lim_kpa
    ratio_pilar = sigma_pilar_kpa / sigma_cd_lim_kpa if sigma_cd_lim_kpa > 0 else 1.0
    ratio_estaca = sigma_estaca_kpa / sigma_cd_lim_kpa if sigma_cd_lim_kpa > 0 else 1.0

    # Suggested rebar detailing (CA-50)
    bar_diam_mm = 16.0
    bar_area_cm2 = (math.pi * (bar_diam_mm / 10.0) ** 2) / 4.0
    n_bars = max(4, math.ceil(As_cm2 / bar_area_cm2))

    return {
        "num_piles": num_piles,
        "pile_diam_m": pile_diam,
        "pile_spacing_m": pile_spacing,
        "column_a_m": col_a,
        "column_b_m": col_b,
        "Nk_kN": Nk_kN,
        "Nd_kN": round(Nd_kN, 1),
        "Pk_kN": round(Pk_kN, 1),
        "Pd_kN": round(Pd_kN, 1),
        "dimensions": {
            "L_cap_m": round(L_cap, 2),
            "B_cap_m": round(B_cap, 2),
            "H_cap_m": round(H_cap, 2),
            "d_eff_m": round(d_eff, 2),
            "volume_m3": round(L_cap * B_cap * H_cap, 2)
        },
        "strut_and_tie": {
            "theta_deg": round(theta_deg, 1),
            "is_rigid_valid": is_rigid,
            "sigma_cd_lim_kpa": round(sigma_cd_lim_kpa, 1),
            "sigma_cd_lim_mpa": round(sigma_cd_lim_kpa / 1000.0, 2),
            "sigma_pilar_kpa": round(sigma_pilar_kpa, 1),
            "sigma_pilar_mpa": round(sigma_pilar_kpa / 1000.0, 2),
            "ok_pilar": ok_pilar,
            "ratio_pilar": round(ratio_pilar, 2),
            "sigma_estaca_kpa": round(sigma_estaca_kpa, 1),
            "sigma_estaca_mpa": round(sigma_estaca_kpa / 1000.0, 2),
            "ok_estaca": ok_estaca,
            "ratio_estaca": round(ratio_estaca, 2)
        },
        "reinforcement": {
            "Ftd_kN": round(Ftd_kN, 1),
            "As_cm2": round(As_cm2, 2),
            "suggested_bars": f"{n_bars} Ø {bar_diam_mm:.0f} mm (As = {n_bars * bar_area_cm2:.2f} cm²)"
        }
    }

def calculate_aoki_velloso(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main calculation function for Deep Foundations suite:
    - Aoki-Velloso (1975)
    - Décourt-Quaresma (1978 / 1996)
    - Side-by-Side Comparison
    - Blévot & Frémy (1967) Pile Cap Design
    """
    try:
        geometry = inputs.get("geometry", "Circular").strip()
        diameter = float(inputs.get("diameter", 1.0))
        width_b = float(inputs.get("width_b", 1.0))
        height_h = float(inputs.get("height_h", 1.0))
        depth_pile = float(inputs.get("depth_pile", 16.0))
        pile_type = inputs.get("pile_type", "PRÉ-MOLDADA DE CONCRETO CRAVA A PERCUSSÃO").strip()
        s_adm_mm = float(inputs.get("allowable_settlement_mm", 5.0))
        gamma_soil = float(inputs.get("soil_gamma", 1.8))  # tf/m³
        num_piles = int(inputs.get("num_piles", 15))
        mass_struct = float(inputs.get("structure_mass_ton", 1690.4))  # ton

        # Area and Perimeter
        if geometry.lower() == "circular":
            area_m2 = math.pi * ((diameter / 2.0) ** 2)
            perim_m = math.pi * diameter
            dim_ref = diameter
        else:
            area_m2 = width_b * height_h
            perim_m = 2.0 * width_b + 2.0 * height_h
            dim_ref = max(width_b, height_h)

        # Factors F1, F2 for Aoki-Velloso
        factors_aoki = PILE_FACTORS.get(pile_type, {"F1": 2.5, "F2": 3.5})
        F1 = float(inputs.get("custom_F1", factors_aoki["F1"]))
        F2 = float(inputs.get("custom_F2", factors_aoki["F2"]))

        # Layers
        layers_input = inputs.get("profile", DEFAULT_REFERENCE_PROFILE)
        sorted_layers = sorted(layers_input, key=lambda x: float(x.get("depth", 0)))

        # -------------------------------------------------------------------------
        # 1. AOKI-VELLOSO CALCULATION
        # -------------------------------------------------------------------------
        processed_layers_aoki = []
        sum_rl_tf = 0.0
        rp_at_pile_tip = 0.0
        last_depth = 0.0

        for idx, layer in enumerate(sorted_layers):
            z = float(layer.get("depth", idx + 1))
            dz = z - last_depth if idx > 0 else z
            last_depth = z

            stype = layer.get("soil_type", "ARGILA SILTOARENOSA").strip().upper()
            s_props = SOIL_DATABASE.get(stype, {"K": 4.0, "alpha": 3.0, "beta_min": 15.0, "beta_max": 20.0})
            K = s_props["K"]
            alpha = s_props["alpha"]
            beta_min = s_props["beta_min"]
            beta_max = s_props["beta_max"]

            nspt = float(layer.get("nspt", 1.0))

            # Unit lateral friction: rl (kg/m²)
            rl_kg_m2 = (alpha / 100.0) * K * nspt / F2 * 10000.0

            # Unit tip resistance: rp (kg/m²)
            rp_kg_m2 = K * nspt / F1 * 10000.0

            in_pile = z <= depth_pile + 1e-6
            is_tip_layer = abs(z - depth_pile) < 1e-4 or (z >= depth_pile and (idx == 0 or sorted_layers[idx-1].get("depth", 0) < depth_pile))

            # Dynamic shear modulus: G = 12000 * Nspt^0.8 / 10 (tf/m²)
            G = 12000.0 * (nspt ** 0.8) / 10.0 if nspt > 0 else 0.0

            # Dynamic stiffnesses: Kz_dyn = 2.7 * G, Kh_dyn = 4.1 * G (tf/m)
            Kz_dyn = 2.7 * G
            Kh_dyn = 4.1 * G

            # Shear wave velocity: Vs = sqrt(G * 10 / gamma) (m/s)
            Vs = math.sqrt(G * 10.0 / gamma_soil) if (gamma_soil > 0 and G > 0) else 0.0

            r_ref = dim_ref / 2.0
            Cv = (6.7 * G * r_ref / Vs) if Vs > 0 else 0.0
            Ch = (10.6 * G * r_ref / Vs) if Vs > 0 else 0.0

            Kxy_min = beta_min * nspt * z * dim_ref
            Kxy_max = beta_max * nspt * z * dim_ref

            layer_rl_tf = 0.0
            if in_pile:
                layer_rl_tf = (rl_kg_m2 * dz * perim_m) / 1000.0
                sum_rl_tf += layer_rl_tf

            if is_tip_layer or (z <= depth_pile):
                rp_at_pile_tip = rp_kg_m2

            # Cumulative capacity up to depth z (for graph)
            rl_accum_z_tf = sum_rl_tf
            rp_z_tf = (rp_kg_m2 * area_m2) / 1000.0
            radm_z_tf = rl_accum_z_tf + rp_z_tf

            processed_layers_aoki.append({
                "depth": z,
                "soil_type": stype,
                "nspt": nspt,
                "rl_kg_m2": round(rl_kg_m2, 2),
                "rp_kg_m2": round(rp_kg_m2, 2),
                "G_tf_m2": round(G, 2),
                "Kz_dyn_tf_m": round(Kz_dyn, 2),
                "Kh_dyn_tf_m": round(Kh_dyn, 2),
                "Vs_m_s": round(Vs, 2),
                "Cv_tf_s_m": round(Cv, 2),
                "Ch_tf_s_m": round(Ch, 2),
                "Kxy_min_tf_m": round(Kxy_min, 2),
                "Kxy_max_tf_m": round(Kxy_max, 2),
                "dz": dz,
                "in_pile": in_pile,
                "is_tip": is_tip_layer,
                "accum_rl_tf": round(rl_accum_z_tf, 2),
                "rp_tf": round(rp_z_tf, 2),
                "radm_tf": round(radm_z_tf, 2),
                "radm_kN": round(radm_z_tf * 9.80665, 2)
            })

        # Total Tip Resistance Rp (tf) and Allowable Load (tf)
        Rp_tf = (rp_at_pile_tip * area_m2) / 1000.0
        Rl_tf = sum_rl_tf
        Radm_tf = Rl_tf + Rp_tf

        Radm_kN = Radm_tf * 9.80665
        Rl_kN = Rl_tf * 9.80665
        Rp_kN = Rp_tf * 9.80665

        # Static Vertical Spring Kz (tf/m)
        s_adm_m = s_adm_mm / 1000.0
        for lay in processed_layers_aoki:
            z = lay["depth"]
            dz_lay = float(lay.get("dz", 1.0))
            if z > depth_pile:
                lay["Kz_static_tf_m"] = 0.0
            elif abs(z - depth_pile) < 1e-4:
                tip_stiffness = Rp_tf / (0.10 * dim_ref) if dim_ref > 0 else 0.0
                shaft_stiffness = ((lay["rl_kg_m2"] * dz_lay) / s_adm_m / 1000.0) * perim_m
                lay["Kz_static_tf_m"] = math.floor(tip_stiffness + shaft_stiffness)
            else:
                shaft_stiffness = ((lay["rl_kg_m2"] * dz_lay) / s_adm_m / 1000.0) * perim_m
                lay["Kz_static_tf_m"] = math.floor(shaft_stiffness)

        # Global Pile Group Sums
        active_layers = [l for l in processed_layers_aoki if l["in_pile"]]
        sum_Kz_dyn = sum(l["Kz_dyn_tf_m"] for l in active_layers) * num_piles
        sum_Kh_dyn = sum(l["Kh_dyn_tf_m"] for l in active_layers) * num_piles
        sum_Cv = sum(l["Cv_tf_s_m"] for l in active_layers) * num_piles
        sum_Ch = sum(l["Ch_tf_s_m"] for l in active_layers) * num_piles

        term_z = sum_Kz_dyn * mass_struct / 10.0
        term_xy = sum_Kh_dyn * mass_struct / 10.0
        Cgcz = 2.0 * math.sqrt(term_z) if term_z > 0 else 0.0
        Cgcxy = 2.0 * math.sqrt(term_xy) if term_xy > 0 else 0.0

        Dgz = (sum_Cv / Cgcz) if Cgcz > 0 else 0.0
        Dgxy = (sum_Ch / Cgcxy) if Cgcxy > 0 else 0.0

        Kz_static_total_tf_m = sum(l["Kz_static_tf_m"] for l in active_layers)
        Kz_static_total_kN_mm = (Kz_static_total_tf_m * 9.80665) / 1000.0

        # Structural Springs for Piled Raft and Piled Beam
        Kz_static_kN_m = Kz_static_total_tf_m * 9.80665
        Kz_secant_kN_m = (Radm_kN / s_adm_m) if s_adm_m > 0 else Kz_static_kN_m

        fck_pile = float(inputs.get("fck_pile", 30.0))  # MPa (concrete)
        Ep_pile = 5600.0 * math.sqrt(fck_pile) * 1000.0  # kPa
        if geometry.lower() == "circular":
            Ip_pile = math.pi * (dim_ref ** 4) / 64.0
        else:
            Ip_pile = (width_b * (height_h ** 3)) / 12.0
        EpIp = Ep_pile * Ip_pile

        z_5D = min(depth_pile, max(3.0, 5.0 * dim_ref))
        top_layers = [l for l in processed_layers_aoki if l["depth"] <= z_5D + 0.1]
        mean_nspt_top = (sum(l["nspt"] for l in top_layers) / len(top_layers)) if top_layers else 3.0

        nh = max(1000.0, 1200.0 * mean_nspt_top)
        T_char = (EpIp / nh) ** 0.20

        Kx_fixed_kN_m = EpIp / (0.93 * (T_char ** 3)) if T_char > 0 else 40000.0
        Kx_pinned_kN_m = EpIp / (2.43 * (T_char ** 3)) if T_char > 0 else 15000.0

        h_soft_cutoff = float(inputs.get("h_soft_cutoff", 8.5))
        soft_layers = [l for l in processed_layers_aoki if l["depth"] <= h_soft_cutoff and l["in_pile"]]
        Q_neg_tf = 0.0
        last_d = 0.0
        for l in soft_layers:
            dz = l["depth"] - last_d
            last_d = l["depth"]
            Q_neg_tf += (l["rl_kg_m2"] * dz * perim_m) / 1000.0
        Q_neg_kN = Q_neg_tf * 9.80665

        FS_tension = 1.4
        T_adm_tf = max(0.0, (Rl_tf - Q_neg_tf) / FS_tension)
        T_adm_kN = T_adm_tf * 9.80665

        nspt_surface = processed_layers_aoki[0]["nspt"] if processed_layers_aoki else 2.5
        subgrade_ks_kN_m3 = max(3000.0, 2500.0 * nspt_surface)

        structural_springs = {
            "for_piled_raft": {
                "pile_spring_kz_kN_m": round(Kz_static_kN_m, 1),
                "pile_spring_kz_tf_m": round(Kz_static_total_tf_m, 1),
                "pile_spring_kz_kN_mm": round(Kz_static_total_kN_mm, 2),
                "pile_spring_kz_secant_kN_m": round(Kz_secant_kN_m, 1),
                "pile_capacity_adm_kN": round(Radm_kN, 1),
                "pile_capacity_adm_tf": round(Radm_tf, 1),
                "q_negative_friction_kN": round(Q_neg_kN, 1),
                "q_negative_friction_tf": round(Q_neg_tf, 1),
                "subgrade_ks_kN_m3": round(subgrade_ks_kN_m3, 1),
                "pile_diameter_m": dim_ref,
                "pile_length_m": depth_pile,
                "h_soft_cutoff_m": h_soft_cutoff
            },
            "for_piled_beam": {
                "pile_spring_kz_kN_m": round(Kz_static_kN_m, 1),
                "pile_spring_kz_tf_m": round(Kz_static_total_tf_m, 1),
                "pile_spring_kz_kN_mm": round(Kz_static_total_kN_mm, 2),
                "pile_spring_kx_fixed_kN_m": round(Kx_fixed_kN_m, 1),
                "pile_spring_kx_fixed_tf_m": round(Kx_fixed_kN_m / 9.80665, 1),
                "pile_spring_kx_pinned_kN_m": round(Kx_pinned_kN_m, 1),
                "pile_capacity_adm_kN": round(Radm_kN, 1),
                "pile_capacity_adm_tf": round(Radm_tf, 1),
                "pile_tension_adm_kN": round(T_adm_kN, 1),
                "pile_tension_adm_tf": round(T_adm_tf, 1),
                "elastic_length_T_m": round(T_char, 2),
                "pile_diameter_m": dim_ref,
                "pile_length_m": depth_pile
            }
        }

        # -------------------------------------------------------------------------
        # 2. DÉCOURT-QUARESMA (1978 / 1996) CALCULATION
        # -------------------------------------------------------------------------
        custom_alpha = inputs.get("custom_alpha")
        custom_beta = inputs.get("custom_beta")
        fs_decourt = float(inputs.get("fs_decourt", 2.0))

        decourt_res = calculate_decourt_quaresma(
            sorted_layers=sorted_layers,
            depth_pile=depth_pile,
            area_m2=area_m2,
            perim_m=perim_m,
            pile_type=pile_type,
            custom_alpha=custom_alpha,
            custom_beta=custom_beta,
            fs_global=fs_decourt
        )

        # Merge Décourt metrics into processed layers for direct tabular comparison
        comparison_layers = []
        for aoki_l, dec_l in zip(processed_layers_aoki, decourt_res["layers"]):
            merged = {
                **aoki_l,
                "decourt_C_kpa": dec_l["C_kpa"],
                "decourt_ql_kpa": dec_l["ql_kpa"],
                "decourt_accum_rl_kN": dec_l["accum_rl_kN"],
                "decourt_accum_rl_tf": dec_l["accum_rl_tf"],
                "decourt_rp_tf": dec_l["rp_tf"],
                "decourt_radm_tf": dec_l["radm_tf"],
                "decourt_radm_kN": dec_l["radm_kN"]
            }
            comparison_layers.append(merged)

        # -------------------------------------------------------------------------
        # 3. SIDE-BY-SIDE COMPARISON & ENVELOPE
        # -------------------------------------------------------------------------
        dec_Radm_tf = decourt_res["R_adm_tf"]
        dec_Radm_kN = decourt_res["R_adm_kN"]
        mean_Radm_tf = (Radm_tf + dec_Radm_tf) / 2.0
        mean_Radm_kN = mean_Radm_tf * 9.80665
        conservative_Radm_tf = min(Radm_tf, dec_Radm_tf)
        conservative_Radm_kN = min(Radm_kN, dec_Radm_kN)
        diff_pct = round(abs(Radm_tf - dec_Radm_tf) / max(1e-3, conservative_Radm_tf) * 100.0, 1)

        comparison = {
            "aoki_velloso": {
                "R_shaft_tf": round(Rl_tf, 2),
                "R_shaft_kN": round(Rl_kN, 2),
                "R_tip_tf": round(Rp_tf, 2),
                "R_tip_kN": round(Rp_kN, 2),
                "Q_ult_tf": round(Rl_tf + Rp_tf, 2),
                "Q_ult_kN": round(Rl_kN + Rp_kN, 2),
                "R_adm_tf": round(Radm_tf, 2),
                "R_adm_kN": round(Radm_kN, 2),
                "ratio_shaft_pct": round((Rl_tf / Radm_tf * 100.0) if Radm_tf > 0 else 0.0, 1),
                "ratio_tip_pct": round((Rp_tf / Radm_tf * 100.0) if Radm_tf > 0 else 0.0, 1)
            },
            "decourt_quaresma": {
                "R_shaft_tf": decourt_res["R_shaft_tf"],
                "R_shaft_kN": decourt_res["R_shaft_kN"],
                "R_tip_tf": decourt_res["R_tip_tf"],
                "R_tip_kN": decourt_res["R_tip_kN"],
                "Q_ult_tf": decourt_res["Q_ult_tf"],
                "Q_ult_kN": decourt_res["Q_ult_kN"],
                "R_adm_tf": decourt_res["R_adm_tf"],
                "R_adm_kN": decourt_res["R_adm_kN"],
                "R_adm_partial_tf": decourt_res["R_adm_partial_tf"],
                "R_adm_partial_kN": decourt_res["R_adm_partial_kN"],
                "ratio_shaft_pct": decourt_res["ratio_shaft_pct"],
                "ratio_tip_pct": decourt_res["ratio_tip_pct"]
            },
            "mean": {
                "R_shaft_tf": round((Rl_tf + decourt_res["R_shaft_tf"]) / 2.0, 2),
                "R_shaft_kN": round((Rl_kN + decourt_res["R_shaft_kN"]) / 2.0, 2),
                "R_tip_tf": round((Rp_tf + decourt_res["R_tip_tf"]) / 2.0, 2),
                "R_tip_kN": round((Rp_kN + decourt_res["R_tip_kN"]) / 2.0, 2),
                "Q_ult_tf": round(((Rl_tf + Rp_tf) + decourt_res["Q_ult_tf"]) / 2.0, 2),
                "Q_ult_kN": round(((Rl_kN + Rp_kN) + decourt_res["Q_ult_kN"]) / 2.0, 2),
                "R_adm_tf": round(mean_Radm_tf, 2),
                "R_adm_kN": round(mean_Radm_kN, 2)
            },
            "conservative": {
                "governing_method": "Aoki-Velloso" if Radm_tf <= dec_Radm_tf else "Décourt-Quaresma",
                "R_adm_tf": round(conservative_Radm_tf, 2),
                "R_adm_kN": round(conservative_Radm_kN, 2),
                "diff_percent": diff_pct
            }
        }

        # -------------------------------------------------------------------------
        # 4. BLÉVOT & FRÉMY PILE CAP DESIGN (1 to 6 piles)
        # -------------------------------------------------------------------------
        cap_inputs = {
            **inputs,
            "cap_pile_diam_m": dim_ref,
            "cap_load_Nk_kN": inputs.get("cap_load_Nk_kN", Radm_kN * float(inputs.get("cap_num_piles", 2)))
        }
        pile_cap_res = calculate_blevot_pile_cap(cap_inputs)

        # -------------------------------------------------------------------------
        # 5. MOLAS DINÂMICAS E ESTÁTICAS POR METRO DE COMPRIMENTO
        # -------------------------------------------------------------------------
        springs_per_meter = []
        for lay in processed_layers_aoki:
            if not lay.get("in_pile"):
                continue
            dz_lay = float(lay.get("dz", 1.0))
            if dz_lay < 1e-6:
                continue
            kz_dyn_pm = lay["Kz_dyn_tf_m"] / dz_lay
            kh_dyn_pm = lay["Kh_dyn_tf_m"] / dz_lay
            kz_sta_pm = lay.get("Kz_static_tf_m", 0.0) / dz_lay if dz_lay > 0 else 0.0
            springs_per_meter.append({
                "depth": lay["depth"],
                "depth_top": round(lay["depth"] - dz_lay, 3),
                "dz": dz_lay,
                "soil_type": lay["soil_type"],
                "nspt": lay["nspt"],
                "G_tf_m2": lay["G_tf_m2"],
                "Vs_m_s": lay["Vs_m_s"],
                "Kz_dyn_tf_m_per_m": round(kz_dyn_pm, 2),
                "Kh_dyn_tf_m_per_m": round(kh_dyn_pm, 2),
                "Kz_static_tf_m_per_m": round(kz_sta_pm, 2),
                # kN/m por metro (para uso directo em SAP2000/ETABS)
                "Kz_dyn_kN_m_per_m": round(kz_dyn_pm * 9.80665, 2),
                "Kh_dyn_kN_m_per_m": round(kh_dyn_pm * 9.80665, 2),
                "Kz_static_kN_m_per_m": round(kz_sta_pm * 9.80665, 2),
            })

        # -------------------------------------------------------------------------
        # 6. EMPUXO ATIVO E PASSIVO (Rankine + Coulomb) — Inferido do Perfil SPT
        # -------------------------------------------------------------------------
        ep_opts = inputs.get("earth_pressure", {})

        # Estimar φ e γ médios a partir do perfil SPT (camadas acima de H_muro)
        H_wall = float(ep_opts.get("H_m", 5.0))
        delta_deg = float(ep_opts.get("delta_deg", 0.0))        # atrito muro-solo (0 = Rankine puro)
        beta_deg = float(ep_opts.get("beta_deg", 0.0))          # inclinação do talude de aterro

        # Se o usuário sobrescrever phi/gamma/c, use; senão, infira do perfil
        if "phi_deg" in ep_opts:
            phi_mean = float(ep_opts["phi_deg"])
        else:
            phi_vals = []
            for lay in sorted_layers:
                z = float(lay.get("depth", 0))
                if z > H_wall + 1e-3:
                    break
                stype = lay.get("soil_type", "ARGILA SILTOARENOSA").strip().upper()
                spg = SOIL_PHI_GAMMA.get(stype, {"phi_deg": 25.0})
                # Correclão de Meyerhof: phi cresce com Nspt (cap em 45°)
                nspt_lay = float(lay.get("nspt", 5.0))
                phi_raw = spg["phi_deg"] + max(0.0, (nspt_lay - 10.0) * 0.3)
                phi_vals.append(min(phi_raw, 45.0))
            phi_mean = float(sum(phi_vals) / len(phi_vals)) if phi_vals else 25.0

        if "gamma_kN_m3" in ep_opts:
            gamma_kN_m3 = float(ep_opts["gamma_kN_m3"])
        else:
            gamma_vals = []
            for lay in sorted_layers:
                z = float(lay.get("depth", 0))
                if z > H_wall + 1e-3:
                    break
                stype = lay.get("soil_type", "ARGILA SILTOARENOSA").strip().upper()
                spg = SOIL_PHI_GAMMA.get(stype, {"gamma_kN_m3": 17.0})
                gamma_vals.append(spg["gamma_kN_m3"])
            gamma_kN_m3 = float(sum(gamma_vals) / len(gamma_vals)) if gamma_vals else 17.0

        if "c_kPa" in ep_opts:
            c_kPa = float(ep_opts["c_kPa"])
        else:
            c_vals = []
            for lay in sorted_layers:
                z = float(lay.get("depth", 0))
                if z > H_wall + 1e-3:
                    break
                stype = lay.get("soil_type", "ARGILA SILTOARENOSA").strip().upper()
                spg = SOIL_PHI_GAMMA.get(stype, {"c_kPa": 0.0})
                c_vals.append(spg.get("c_kPa", 0.0))
            c_kPa = float(sum(c_vals) / len(c_vals)) if c_vals else 0.0

        phi_rad = math.radians(phi_mean)
        delta_rad = math.radians(delta_deg)
        beta_rad = math.radians(beta_deg)

        # Rankine
        Ka_rank = math.tan(math.pi / 4.0 - phi_rad / 2.0) ** 2
        Kp_rank = math.tan(math.pi / 4.0 + phi_rad / 2.0) ** 2

        # Coulomb ativo (parede vertical α=90°)
        try:
            num_ca = math.sin(phi_rad + math.pi / 2.0 - phi_rad)  # = sin(90°) = 1 para parede vertical
            # Fórmula Coulomb ativo generalizada (parede vertical, β qualquer)
            sin_phi = math.sin(phi_rad)
            sin_d = math.sin(delta_rad)
            sin_b = math.sin(beta_rad)
            cos_d = math.cos(delta_rad)
            cos_b = math.cos(beta_rad)

            denom_coulomb_a = (1.0 + math.sqrt((sin_phi + sin_d) * (sin_phi - sin_b) / (cos_d * cos_b))) ** 2
            if denom_coulomb_a > 1e-9:
                Ka_coul = sin_phi ** 2 / (1.0 * denom_coulomb_a * cos_d)
            else:
                Ka_coul = Ka_rank
        except Exception:
            Ka_coul = Ka_rank

        # Coulomb passivo (parede vertical)
        try:
            denom_coulomb_p = (1.0 - math.sqrt((sin_phi + sin_d) * (sin_phi + sin_b) / (cos_d * cos_b))) ** 2
            if denom_coulomb_p > 1e-9 and abs(denom_coulomb_p) > 1e-9:
                Kp_coul = sin_phi ** 2 / (1.0 * denom_coulomb_p * cos_d)
            else:
                Kp_coul = Kp_rank
        except Exception:
            Kp_coul = Kp_rank

        # Diagrama de tensões: pontos a cada 0.25m de 0 a H_wall
        n_pts = max(21, int(H_wall / 0.25) + 2)
        stress_diagram = []
        for i in range(n_pts):
            z_pt = H_wall * i / (n_pts - 1)
            sv = gamma_kN_m3 * z_pt
            # Rankine
            sa_rank = Ka_rank * sv - 2.0 * c_kPa * math.sqrt(Ka_rank)
            sp_rank = Kp_rank * sv + 2.0 * c_kPa * math.sqrt(Kp_rank)
            # Coulomb
            sa_coul = Ka_coul * sv
            sp_coul = Kp_coul * sv
            stress_diagram.append({
                "z": round(z_pt, 3),
                "sigma_v": round(sv, 2),
                "sigma_a_rankine": round(max(0.0, sa_rank), 2),
                "sigma_p_rankine": round(sp_rank, 2),
                "sigma_a_coulomb": round(max(0.0, sa_coul), 2),
                "sigma_p_coulomb": round(sp_coul, 2),
            })

        # Resultantes
        Ea_rank = 0.5 * Ka_rank * gamma_kN_m3 * H_wall ** 2 - 2.0 * c_kPa * math.sqrt(Ka_rank) * H_wall
        Ep_rank = 0.5 * Kp_rank * gamma_kN_m3 * H_wall ** 2 + 2.0 * c_kPa * math.sqrt(Kp_rank) * H_wall
        Ea_coul = 0.5 * Ka_coul * gamma_kN_m3 * H_wall ** 2
        Ep_coul = 0.5 * Kp_coul * gamma_kN_m3 * H_wall ** 2

        # Ponto de aplicação (centroide do diagrama triangular = H/3 da base)
        ya_rank = H_wall / 3.0
        yp_rank = H_wall / 3.0

        earth_pressure = {
            "inferred": "phi_deg" not in ep_opts,
            "phi_deg": round(phi_mean, 2),
            "gamma_kN_m3": round(gamma_kN_m3, 2),
            "c_kPa": round(c_kPa, 2),
            "delta_deg": delta_deg,
            "beta_deg": beta_deg,
            "H_m": H_wall,
            # Coeficientes
            "Ka_rankine": round(Ka_rank, 4),
            "Kp_rankine": round(Kp_rank, 4),
            "Ka_coulomb": round(Ka_coul, 4),
            "Kp_coulomb": round(Kp_coul, 4),
            # Resultantes (kN/m de muro)
            "Ea_rankine_kN_m": round(max(0.0, Ea_rank), 2),
            "Ep_rankine_kN_m": round(Ep_rank, 2),
            "Ea_coulomb_kN_m": round(max(0.0, Ea_coul), 2),
            "Ep_coulomb_kN_m": round(Ep_coul, 2),
            # Ponto de aplicação
            "ya_rankine_m": round(ya_rank, 3),   # da base do muro
            "yp_rankine_m": round(yp_rank, 3),
            # Diagrama
            "stress_diagram": stress_diagram,
        }

        return {
            "success": True,
            "geometry": {
                "type": geometry,
                "diameter": diameter,
                "width_b": width_b,
                "height_h": height_h,
                "area_m2": round(area_m2, 4),
                "perimeter_m": round(perim_m, 4),
                "depth_pile_m": depth_pile
            },
            "parameters": {
                "pile_type": pile_type,
                "F1": F1,
                "F2": F2,
                "alpha_decourt": decourt_res["alpha"],
                "beta_decourt": decourt_res["beta"],
                "allowable_settlement_mm": s_adm_mm,
                "soil_gamma": gamma_soil,
                "num_piles": num_piles,
                "structure_mass_ton": mass_struct
            },
            "capacities": {
                "R_shaft_tf": round(Rl_tf, 2),
                "R_shaft_kN": round(Rl_kN, 2),
                "R_tip_tf": round(Rp_tf, 2),
                "R_tip_kN": round(Rp_kN, 2),
                "R_adm_tf": round(Radm_tf, 2),
                "R_adm_kN": round(Radm_kN, 2),
                "R_adm_group_tf": round(Radm_tf * num_piles, 2),
                "R_adm_group_kN": round(Radm_kN * num_piles, 2),
                "ratio_shaft_pct": round((Rl_tf / Radm_tf * 100.0) if Radm_tf > 0 else 0.0, 1),
                "ratio_tip_pct": round((Rp_tf / Radm_tf * 100.0) if Radm_tf > 0 else 0.0, 1)
            },
            "decourt_quaresma": decourt_res,
            "comparison": comparison,
            "pile_cap": pile_cap_res,
            "stiffness_and_damping": {
                "Kz_static_single_tf_m": round(Kz_static_total_tf_m, 2),
                "Kz_static_single_kN_mm": round(Kz_static_total_kN_mm, 3),
                "Kz_static_group_tf_m": round(Kz_static_total_tf_m * num_piles, 2),
                "Kz_dyn_group_tf_m": round(sum_Kz_dyn, 2),
                "Kh_dyn_group_tf_m": round(sum_Kh_dyn, 2),
                "Cv_group_tf_s_m": round(sum_Cv, 2),
                "Ch_group_tf_s_m": round(sum_Ch, 2),
                "Cgcz_tf_s_m": round(Cgcz, 2),
                "Cgcxy_tf_s_m": round(Cgcxy, 2),
                "Dgz": round(Dgz, 4),
                "Dgxy": round(Dgxy, 4),
                "Dgz_percent": round(Dgz * 100.0, 2),
                "Dgxy_percent": round(Dgxy * 100.0, 2)
            },
            "structural_springs": structural_springs,
            "springs_per_meter": springs_per_meter,
            "earth_pressure": earth_pressure,
            "layers": comparison_layers
        }
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}
