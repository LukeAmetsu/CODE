"""
Aoki-Velloso Foundation Capacity & Dynamic Stiffness Calculator
Calculador de Capacidade de Carga e Rigidez de Estacas (Método Aoki-Velloso, 1975)

Calculates:
- Unit and total shaft skin friction (rl, Rl)
- Unit and total base tip resistance (rp, Rp)
- Allowable pile compressive capacity (Radm)
- Static vertical and horizontal soil-spring stiffness (Kz, Kh_min, Kh_max)
- Dynamic shear modulus (G), shear wave velocity (Vs), and radiation damping (Cv, Ch)
- Pile group critical damping ratios (Dgz, Dgxy)
"""

import math
from typing import Dict, List, Any

# 1. Soil Coefficients according to Aoki-Velloso (1975) and Geotechnical Practice
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

# 2. Pile Type Factors F1 (Tip) and F2 (Shaft)
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
    """Returns database constants and default reference profile."""
    return {
        "soil_types": list(SOIL_DATABASE.keys()),
        "soil_database": SOIL_DATABASE,
        "pile_types": list(PILE_FACTORS.keys()),
        "pile_factors": PILE_FACTORS,
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
        }
    }

def calculate_aoki_velloso(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main calculation function for Aoki-Velloso Deep Foundation method.
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

        # Factors F1, F2
        factors = PILE_FACTORS.get(pile_type, {"F1": 2.5, "F2": 3.5})
        F1 = float(inputs.get("custom_F1", factors["F1"]))
        F2 = float(inputs.get("custom_F2", factors["F2"]))

        # Layers
        layers_input = inputs.get("profile", DEFAULT_REFERENCE_PROFILE)
        sorted_layers = sorted(layers_input, key=lambda x: float(x.get("depth", 0)))

        # Step 1: Compute unit and depth metrics for each layer
        processed_layers = []
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
            # rl = (alpha / 100) * K * Nspt / F2 * 10000
            rl_kg_m2 = (alpha / 100.0) * K * nspt / F2 * 10000.0

            # Unit tip resistance: rp (kg/m²)
            # rp = K * Nspt / F1 * 10000
            rp_kg_m2 = K * nspt / F1 * 10000.0

            # Cumulative shaft contribution up to depth_pile
            in_pile = z <= depth_pile + 1e-6
            is_tip_layer = abs(z - depth_pile) < 1e-4 or (z >= depth_pile and (idx == 0 or sorted_layers[idx-1].get("depth", 0) < depth_pile))

            # Dynamic shear modulus: G = 12000 * Nspt^0.8 / 10 (tf/m²)
            G = 12000.0 * (nspt ** 0.8) / 10.0 if nspt > 0 else 0.0

            # Dynamic stiffnesses: Kz_dyn = 2.7 * G, Kh_dyn = 4.1 * G (tf/m)
            Kz_dyn = 2.7 * G
            Kh_dyn = 4.1 * G

            # Shear wave velocity: Vs = sqrt(G * 10 / gamma) (m/s)
            Vs = math.sqrt(G * 10.0 / gamma_soil) if (gamma_soil > 0 and G > 0) else 0.0

            # Dynamic radiation damping:
            # Cv = 6.7 * G * (dim_ref / 2) / Vs (tf.s/m)
            # Ch = 10.6 * G * (dim_ref / 2) / Vs (tf.s/m)
            r_ref = dim_ref / 2.0
            Cv = (6.7 * G * r_ref / Vs) if Vs > 0 else 0.0
            Ch = (10.6 * G * r_ref / Vs) if Vs > 0 else 0.0

            # Static horizontal spring: Kxy = beta * Nspt * z * dim_ref (tf/m)
            Kxy_min = beta_min * nspt * z * dim_ref
            Kxy_max = beta_max * nspt * z * dim_ref

            if in_pile:
                layer_rl_tf = (rl_kg_m2 * dz * perim_m) / 1000.0
                sum_rl_tf += layer_rl_tf

            if is_tip_layer or (z <= depth_pile):
                rp_at_pile_tip = rp_kg_m2

            processed_layers.append({
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
                "is_tip": is_tip_layer
            })

        # Total Tip Resistance Rp (tf)
        Rp_tf = (rp_at_pile_tip * area_m2) / 1000.0
        Rl_tf = sum_rl_tf
        Radm_tf = Rl_tf + Rp_tf

        # Conversions to kN (1 tf ≈ 9.80665 kN, common engineering ~10 kN)
        Radm_kN = Radm_tf * 9.80665
        Rl_kN = Rl_tf * 9.80665
        Rp_kN = Rp_tf * 9.80665

        # Static Vertical Spring Kz (tf/m)
        # In Excel: Kz = ROUNDDOWN(IF(A>depth, "", IF(A=depth, Rp / (0.10*dim) + (rl*dz)/(s_adm/1000)/1000 * U, (rl*dz)/(s_adm/1000)/1000 * U)))
        s_adm_m = s_adm_mm / 1000.0
        for lay in processed_layers:
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

        # Global Pile Group Sums (only for layers within pile depth <= depth_pile)
        active_layers = [l for l in processed_layers if l["in_pile"]]
        sum_Kz_dyn = sum(l["Kz_dyn_tf_m"] for l in active_layers) * num_piles
        sum_Kh_dyn = sum(l["Kh_dyn_tf_m"] for l in active_layers) * num_piles
        sum_Cv = sum(l["Cv_tf_s_m"] for l in active_layers) * num_piles
        sum_Ch = sum(l["Ch_tf_s_m"] for l in active_layers) * num_piles

        # Group critical damping:
        # Cgcz = 2 * sqrt(sum_Kz_dyn * mass_struct / 10)
        # Cgcxy = 2 * sqrt(sum_Kh_dyn * mass_struct / 10)
        term_z = sum_Kz_dyn * mass_struct / 10.0
        term_xy = sum_Kh_dyn * mass_struct / 10.0
        Cgcz = 2.0 * math.sqrt(term_z) if term_z > 0 else 0.0
        Cgcxy = 2.0 * math.sqrt(term_xy) if term_xy > 0 else 0.0

        # Damping ratios: Dgz = sum_Cv / Cgcz, Dgxy = sum_Ch / Cgcxy
        Dgz = (sum_Cv / Cgcz) if Cgcz > 0 else 0.0
        Dgxy = (sum_Ch / Cgcxy) if Cgcxy > 0 else 0.0

        # Total static vertical stiffness for whole pile (tf/m and kN/mm)
        Kz_static_total_tf_m = sum(l["Kz_static_tf_m"] for l in active_layers)
        Kz_static_total_kN_mm = (Kz_static_total_tf_m * 9.80665) / 1000.0

        # =========================================================================
        # STRUCTURAL SPRINGS FOR PILED RAFT AND PILED BEAM
        # =========================================================================
        # 1. Vertical Single Pile Spring Kz (kN/m)
        Kz_static_kN_m = Kz_static_total_tf_m * 9.80665
        Kz_secant_kN_m = (Radm_kN / s_adm_m) if s_adm_m > 0 else Kz_static_kN_m

        # 2. Horizontal Pile Spring Kx / Kh (kN/m) (Winkler Theory / Matlock-Reese)
        fck_pile = float(inputs.get("fck_pile", 30.0))  # MPa (concrete)
        Ep_pile = 5600.0 * math.sqrt(fck_pile) * 1000.0  # kPa
        if geometry.lower() == "circular":
            Ip_pile = math.pi * (dim_ref ** 4) / 64.0
        else:
            Ip_pile = (width_b * (height_h ** 3)) / 12.0
        EpIp = Ep_pile * Ip_pile  # kN·m²

        # Mean N_SPT in the top 5D active lateral zone
        z_5D = min(depth_pile, max(3.0, 5.0 * dim_ref))
        top_layers = [l for l in processed_layers if l["depth"] <= z_5D + 0.1]
        if top_layers:
            mean_nspt_top = sum(l["nspt"] for l in top_layers) / len(top_layers)
        else:
            mean_nspt_top = 3.0

        # Subgrade reaction modulus nh (kN/m³)
        nh = max(1000.0, 1200.0 * mean_nspt_top)
        T_char = (EpIp / nh) ** 0.20  # Characteristic length (m)

        # Fixed-head stiffness (engastada na viga/radier):
        # Kx = EpIp / (0.93 * T^3)
        Kx_fixed_kN_m = EpIp / (0.93 * (T_char ** 3)) if T_char > 0 else 40000.0
        # Pinned-head stiffness (rotulada):
        # Kx = EpIp / (2.43 * T^3)
        Kx_pinned_kN_m = EpIp / (2.43 * (T_char ** 3)) if T_char > 0 else 15000.0

        # 3. Negative Skin Friction (Q_neg) for Piled Raft
        # Upper soft layers with Nspt <= 4 or depth <= 8.5m (CONSAG default cutoff)
        h_soft_cutoff = float(inputs.get("h_soft_cutoff", 8.5))
        soft_layers = [l for l in processed_layers if l["depth"] <= h_soft_cutoff and l["in_pile"]]
        Q_neg_tf = 0.0
        last_d = 0.0
        for l in soft_layers:
            dz = l["depth"] - last_d
            last_d = l["depth"]
            Q_neg_tf += (l["rl_kg_m2"] * dz * perim_m) / 1000.0
        Q_neg_kN = Q_neg_tf * 9.80665

        # 4. Allowable Tension / Uplift Capacity (T_adm) for Piled Beam
        # NBR 6122: T_adm = (R_shaft - Q_neg) / FS_tension (FS = 1.4 with load test or 2.0)
        FS_tension = 1.4
        T_adm_tf = max(0.0, (Rl_tf - Q_neg_tf) / FS_tension)
        T_adm_kN = T_adm_tf * 9.80665

        # 5. Subgrade reaction of raft slab ks (kN/m³)
        nspt_surface = processed_layers[0]["nspt"] if processed_layers else 2.5
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
            "layers": processed_layers
        }
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}
