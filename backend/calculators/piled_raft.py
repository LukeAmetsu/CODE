"""
Piled Raft Foundation Calculator (Radier Estaqueado para Transbordo & Heavy Rigging)
Standards: NBR 6118:2023 (Concrete Structures) & NBR 6122:2019 (Deep Foundations)
Specialized for heavy industrial rigging operations, SPMT hydraulic transporters,
thick plate punching shear, pile group interaction, and discrete elastic springs.
"""

import math
from typing import Dict, Any, List

def calculate_piled_raft(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes soil-structure interaction, pile reactions, settlements,
    punching shear (NBR 6118 §20), flexural reinforcement, and crack widths
    for a heavy rigging piled raft.
    """
    try:
        # 1. Raft Geometry
        Lx = float(inputs.get('raft_length_x', 16.0))         # m (length in X)
        Ly = float(inputs.get('raft_length_y', 12.0))         # m (length in Y)
        h_raft = float(inputs.get('raft_thickness', 1.20))    # m (thickness)
        gamma_c = float(inputs.get('gamma_concrete', 25.0))   # kN/m³
        
        # 2. Materials (NBR 6118)
        fck = float(inputs.get('fck', 35.0))                  # MPa
        fyk = float(inputs.get('fyk', 500.0))                 # MPa (CA-50)
        cover_mm = float(inputs.get('cover', 50.0))           # mm
        gamma_f = float(inputs.get('gamma_f', 1.4))           # Load factor
        gamma_c_mat = 1.4                                     # Concrete material factor
        gamma_s_mat = 1.15                                    # Steel material factor
        
        d_eff = max(0.20, h_raft - (cover_mm / 1000.0) - 0.015) # Effective depth (m)
        fcd = fck / gamma_c_mat                               # MPa
        fyd = fyk / gamma_s_mat                               # MPa
        
        # Secant Elastic Modulus (NBR 6118:2023)
        alpha_e = 1.0  # Granito/Gnaisse
        E_ci = alpha_e * 5600.0 * math.sqrt(fck)              # MPa
        alpha_i = min(1.0, 0.8 + 0.2 * (fck / 80.0))
        E_cs = alpha_i * E_ci                                 # MPa
        E_cs_kPa = E_cs * 1000.0                              # kPa
        
        # 3. Pile Layout & Geotechnical Characteristics (NBR 6122)
        pile_diam = float(inputs.get('pile_diameter', 0.80))   # m
        pile_len = float(inputs.get('pile_length', 18.0))      # m
        nx = int(inputs.get('num_piles_x', 5))                 # piles along X
        ny = int(inputs.get('num_piles_y', 4))                 # piles along Y
        edge_x = float(inputs.get('edge_dist_x', 1.50))        # m (edge to first pile center)
        edge_y = float(inputs.get('edge_dist_y', 1.50))        # m
        
        num_piles = nx * ny
        if num_piles <= 0:
            return {"error": "O número total de estacas deve ser maior que zero."}
            
        spacing_x = (Lx - 2.0 * edge_x) / max(1, nx - 1) if nx > 1 else 0.0
        spacing_y = (Ly - 2.0 * edge_y) / max(1, ny - 1) if ny > 1 else 0.0
        
        # Stratigraphy & Cut-off of soft layer (CONSAG guideline: first 8.5m ignored)
        h_soft = float(inputs.get('h_soft_layer', 8.50))       # m (ignored soft layer)
        q_neg_per_pile = float(inputs.get('q_negative_friction', 0.0)) # kN/pile (drag load)
        pile_R_adm = float(inputs.get('pile_capacity_adm', 1800.0)) # kN (allowable capacity)
        K_z0 = float(inputs.get('pile_spring_kz', 180000.0))    # kN/m (single pile axial stiffness)
        subgrade_ks = float(inputs.get('subgrade_ks', 8000.0))  # kN/m³ (soil reaction under raft)
        
        # 4. Heavy Rigging & SPMT Load Mapping
        # SPMT: lines of hydraulic axles
        spmt_lines = int(inputs.get('spmt_num_lines', 6))       # e.g. 6 lines of axles
        spmt_load_per_line = float(inputs.get('spmt_line_load', 350.0)) # kN per line of axle (~35.7 tf)
        spmt_line_spacing = float(inputs.get('spmt_line_spacing', 1.50)) # m
        spmt_gauge = float(inputs.get('spmt_gauge', 2.40))      # m (track width)
        spmt_cx = float(inputs.get('spmt_center_x', Lx / 2.0))  # m
        spmt_cy = float(inputs.get('spmt_center_y', Ly / 2.0))  # m
        
        # Heavy Concentrated Pick-up / Turbine Load
        heavy_load = float(inputs.get('heavy_rigging_load', 2500.0)) # kN (~255 tf)
        heavy_x = float(inputs.get('heavy_rigging_x', Lx / 2.0))     # m
        heavy_y = float(inputs.get('heavy_rigging_y', Ly / 2.0))     # m
        heavy_pad_w = float(inputs.get('heavy_pad_width', 1.20))    # m
        
        # Uniform Live / Surcharge on Raft
        q_live = float(inputs.get('q_live', 10.0))              # kPa
        
        # Build Point Load Discretization
        point_loads = []
        
        # SPMT wheels (2 bogie contacts per axle line: left & right)
        spmt_start_x = spmt_cx - (spmt_lines - 1) * spmt_line_spacing / 2.0
        spmt_wheel_load = spmt_load_per_line / 2.0
        
        for li in range(spmt_lines):
            lx = spmt_start_x + li * spmt_line_spacing
            ly_left = spmt_cy - spmt_gauge / 2.0
            ly_right = spmt_cy + spmt_gauge / 2.0
            point_loads.append({"name": f"SPMT L{li+1}-Esq", "x": lx, "y": ly_left, "P": spmt_wheel_load})
            point_loads.append({"name": f"SPMT L{li+1}-Dir", "x": lx, "y": ly_right, "P": spmt_wheel_load})
            
        # Heavy Rigging Load
        if heavy_load > 0:
            point_loads.append({"name": "Carga Pick-Up / Turbina", "x": heavy_x, "y": heavy_y, "P": heavy_load})
            
        # Self-Weight of Raft
        A_raft = Lx * Ly
        W_raft = A_raft * h_raft * gamma_c
        W_live = A_raft * q_live
        
        total_applied_P = W_raft + W_live + sum(p["P"] for p in point_loads) + (num_piles * q_neg_per_pile)
        
        # Center of gravity of loads
        sum_Px = (W_raft + W_live) * (Lx / 2.0) + sum(p["P"] * p["x"] for p in point_loads)
        sum_Py = (W_raft + W_live) * (Ly / 2.0) + sum(p["P"] * p["y"] for p in point_loads)
        x_G = sum_Px / (W_raft + W_live + sum(p["P"] for p in point_loads))
        y_G = sum_Py / (W_raft + W_live + sum(p["P"] for p in point_loads))
        
        e_x = x_G - (Lx / 2.0)
        e_y = y_G - (Ly / 2.0)
        
        # 5. Pile Group Coordinates & Group Interaction (Randolph / Poulos)
        piles = []
        pile_coords = []
        for i in range(nx):
            px = edge_x + i * spacing_x if nx > 1 else Lx / 2.0
            for j in range(ny):
                py = edge_y + j * spacing_y if ny > 1 else Ly / 2.0
                pile_coords.append((px, py))
                
        # Group stiffness reduction factor (Superposition of stress bulbs)
        s_avg = (spacing_x + spacing_y) / 2.0 if (nx > 1 and ny > 1) else max(spacing_x, spacing_y, 2.5)
        r0 = pile_diam / 2.0
        r_m = 2.5 * pile_len * (1.0 - 0.3) # Radius of influence
        ratio_int = max(0.0, min(0.6, math.log(max(1.1, r_m / max(s_avg, 1.0))) / math.log(max(2.0, r_m / r0))))
        group_reduction_factor = 1.0 / (1.0 + (math.sqrt(num_piles) - 1.0) * ratio_int * 0.45)
        K_z_group = K_z0 * group_reduction_factor
        
        # Raft-Soil Stiffness vs Pile System Stiffness (Poulos / Randolph Piled Raft Proportion alpha_pr)
        K_raft_soil = subgrade_ks * A_raft
        K_piles_total = num_piles * K_z_group
        K_total_sys = K_raft_soil + K_piles_total
        
        alpha_pr = K_piles_total / K_total_sys if K_total_sys > 0 else 0.85
        alpha_pr = max(0.65, min(0.96, alpha_pr))
        
        P_to_piles = total_applied_P * alpha_pr
        P_to_soil_contact = total_applied_P * (1.0 - alpha_pr)
        q_soil_contact_avg = P_to_soil_contact / A_raft
        
        # 6. Pile Reactions (Rigid-Elastic Distribution considering e_x, e_y)
        x_c_piles = sum(p[0] for p in pile_coords) / num_piles
        y_c_piles = sum(p[1] for p in pile_coords) / num_piles
        
        I_px = sum((p[0] - x_c_piles)**2 for p in pile_coords)
        I_py = sum((p[1] - y_c_piles)**2 for p in pile_coords)
        
        M_x_piles = P_to_piles * e_x
        M_y_piles = P_to_piles * e_y
        
        pile_reactions = []
        max_reaction = -1e9
        min_reaction = 1e9
        
        for idx, (px, py) in enumerate(pile_coords):
            term_x = (M_x_piles * (px - x_c_piles)) / I_px if I_px > 0 else 0.0
            term_y = (M_y_piles * (py - y_c_piles)) / I_py if I_py > 0 else 0.0
            R_i = (P_to_piles / num_piles) + term_x + term_y
            
            settlement_mm = (R_i / K_z_group) * 1000.0
            
            if R_i > max_reaction:
                max_reaction = R_i
            if R_i < min_reaction:
                min_reaction = R_i
                
            fs_pile = pile_R_adm / R_i if R_i > 0 else 999.0
            status_pile = "APROVADO" if R_i <= pile_R_adm else "SOBRECARGA"
            
            piles.append({
                "id": idx + 1,
                "x": round(px, 2),
                "y": round(py, 2),
                "reaction_kN": round(R_i, 1),
                "reaction_tf": round(R_i / 9.81, 1),
                "settlement_mm": round(settlement_mm, 2),
                "fs_capacity": round(fs_pile, 2),
                "status": status_pile
            })
            
        max_settlement_mm = (max_reaction / K_z_group) * 1000.0
        min_settlement_mm = (min_reaction / K_z_group) * 1000.0
        diff_settlement_mm = max_settlement_mm - min_settlement_mm
        angular_distortion = diff_settlement_mm / (1000.0 * max(Lx, Ly))
        
        # 7. Punching Shear Verification (NBR 6118 §20)
        u0_pile = math.pi * pile_diam
        u1_pile = math.pi * (pile_diam + 4.0 * d_eff)
        
        fctm = 0.3 * (fck ** (2.0 / 3.0))
        fctk_inf = 0.7 * fctm
        fctd = fctk_inf / gamma_c_mat
        
        tau_Rd2 = 0.27 * (1.0 - (fck / 250.0)) * fcd  # MPa
        
        rho_l = 0.0035
        xi_size = 1.0 + math.sqrt(0.20 / d_eff)
        tau_Rd1 = 0.13 * xi_size * ((100.0 * rho_l * fck) ** (1.0 / 3.0)) # MPa
        
        F_Sd_crit = gamma_f * max_reaction  # kN
        F_Sd_MN = F_Sd_crit / 1000.0       # MN
        
        tau_Sd0 = F_Sd_MN / (u0_pile * d_eff) # MPa
        tau_Sd1 = F_Sd_MN / (u1_pile * d_eff) # MPa
        
        status_punching_0 = "APROVADO" if tau_Sd0 <= tau_Rd2 else "REPROVADO (Esmagamento Biela)"
        needs_studs = tau_Sd1 > tau_Rd1
        
        if needs_studs:
            fywd = 435.0  # MPa
            A_sw_m2 = max(0.0, (tau_Sd1 - 0.1 * tau_Rd1) / (1.5 * fywd)) * (u1_pile * d_eff)
            A_sw_cm2 = A_sw_m2 * 10000.0
            stud_status = f"Requer Armadura de Punção (A_sw = {round(A_sw_cm2, 1)} cm²)"
        else:
            A_sw_cm2 = 0.0
            stud_status = "Dispensada Armadura de Punção (Concreto Resiste)"
            
        status_punching = "APROVADO" if (tau_Sd0 <= tau_Rd2 and (tau_Sd1 <= tau_Rd1 or A_sw_cm2 > 0)) else "CRÍTICO"

        # 8. Flexural Design & Crack Width ELS-W (NBR 6118)
        M_span_kNm_m = (gamma_f * (max_reaction / max(1.0, spacing_x)) * spacing_x) / 8.0
        M_support_kNm_m = (gamma_f * (max_reaction / max(1.0, spacing_x)) * spacing_x) / 6.0
        M_design = max(M_span_kNm_m, M_support_kNm_m) # kNm/m
        
        bw = 1.0
        Md_kNm = M_design
        Md_MNm = Md_kNm / 1000.0
        
        kmd = Md_MNm / (bw * (d_eff ** 2) * fcd)
        if kmd < 0.25:
            z_arm = d_eff * (1.0 - 0.4 * kmd)
            As_req_cm2 = (Md_MNm / (z_arm * fyd)) * 10000.0
        else:
            z_arm = d_eff * 0.85
            As_req_cm2 = (Md_MNm / (z_arm * fyd)) * 10000.0
            
        As_min_cm2 = 0.0015 * bw * h_raft * 10000.0
        As_final_cm2 = max(As_req_cm2, As_min_cm2)
        
        pref_diam = float(inputs.get('bar_diam', 20.0)) # mm
        area_bar = (math.pi / 4.0) * ((pref_diam / 10.0) ** 2)
        num_bars = As_final_cm2 / area_bar
        spacing_cm = max(10.0, min(25.0, round((100.0 / num_bars) * 2.0) / 2.0))
        as_provided = (100.0 / spacing_cm) * area_bar
        
        sigma_s = (M_design / gamma_f / 1000.0) / (z_arm * (as_provided / 10000.0)) # MPa
        eta_1 = 2.25
        w_k_mm = min(0.35, max(0.05, (pref_diam / (12.5 * eta_1)) * (sigma_s / 200.0) * (sigma_s / 200000.0) * 1000.0))
        status_fissuration = "APROVADO (w_k ≤ 0.20 mm)" if w_k_mm <= 0.20 else "ATENÇÃO (w_k > 0.20 mm)"
        
        # 9. Concrete Quantities
        vol_concrete_m3 = Lx * Ly * h_raft
        vol_piles_concrete_m3 = num_piles * (math.pi * (pile_diam / 2.0)**2) * pile_len
        steel_raft_kg = vol_concrete_m3 * 95.0
        steel_piles_kg = vol_piles_concrete_m3 * 80.0

        return {
            "success": True,
            "raft_geometry": {
                "Lx": round(Lx, 2),
                "Ly": round(Ly, 2),
                "thickness": round(h_raft, 2),
                "area_m2": round(A_raft, 2),
                "d_eff_m": round(d_eff, 3),
                "vol_concrete_m3": round(vol_concrete_m3, 2)
            },
            "piles_summary": {
                "num_piles": num_piles,
                "nx": nx,
                "ny": ny,
                "diameter_m": round(pile_diam, 2),
                "length_m": round(pile_len, 2),
                "spacing_x_m": round(spacing_x, 2),
                "spacing_y_m": round(spacing_y, 2),
                "K_z0_kN_m": round(K_z0, 0),
                "K_z_group_kN_m": round(K_z_group, 0),
                "group_reduction_factor": round(group_reduction_factor, 3),
                "max_reaction_kN": round(max_reaction, 1),
                "max_reaction_tf": round(max_reaction / 9.81, 1),
                "min_reaction_kN": round(min_reaction, 1),
                "pile_capacity_adm_kN": round(pile_R_adm, 1),
                "fs_capacity_min": round(pile_R_adm / max_reaction, 2) if max_reaction > 0 else 999.0,
                "piles_detail": piles
            },
            "load_distribution": {
                "total_vertical_kN": round(total_applied_P, 1),
                "total_vertical_tf": round(total_applied_P / 9.81, 1),
                "alpha_pr": round(alpha_pr, 3),
                "load_to_piles_kN": round(P_to_piles, 1),
                "load_to_piles_pct": round(alpha_pr * 100.0, 1),
                "load_to_soil_kN": round(P_to_soil_contact, 1),
                "load_to_soil_pct": round((1.0 - alpha_pr) * 100.0, 1),
                "q_soil_avg_kPa": round(q_soil_contact_avg, 1),
                "eccentricity_x_m": round(e_x, 3),
                "eccentricity_y_m": round(e_y, 3)
            },
            "settlements": {
                "max_settlement_mm": round(max_settlement_mm, 2),
                "min_settlement_mm": round(min_settlement_mm, 2),
                "differential_mm": round(diff_settlement_mm, 2),
                "angular_distortion": f"1/{round(1.0 / max(1e-6, angular_distortion))}",
                "status": "APROVADO (Recalque Admissível)" if max_settlement_mm <= 25.0 else "ALERTA (> 25mm)"
            },
            "punching_shear": {
                "critical_force_FSd_kN": round(F_Sd_crit, 1),
                "u0_m": round(u0_pile, 3),
                "u1_m": round(u1_pile, 3),
                "tau_Sd0_MPa": round(tau_Sd0, 3),
                "tau_Rd2_MPa": round(tau_Rd2, 3),
                "status_strut_0": status_punching_0,
                "tau_Sd1_MPa": round(tau_Sd1, 3),
                "tau_Rd1_MPa": round(tau_Rd1, 3),
                "needs_studs": needs_studs,
                "A_sw_cm2": round(A_sw_cm2, 1),
                "stud_status": stud_status,
                "overall_status": status_punching
            },
            "reinforcement": {
                "M_design_kNm_m": round(M_design, 1),
                "As_req_cm2_m": round(As_req_cm2, 2),
                "As_min_cm2_m": round(As_min_cm2, 2),
                "As_final_cm2_m": round(As_final_cm2, 2),
                "detailing": {
                    "bar_diam_mm": pref_diam,
                    "spacing_cm": spacing_cm,
                    "text": f"Ø {pref_diam:g} c/ {spacing_cm} cm (Malha Dupla Sup e Inf)",
                    "as_provided_cm2_m": round(as_provided, 2)
                },
                "crack_width": {
                    "w_k_mm": round(w_k_mm, 3),
                    "limit_mm": 0.20,
                    "status": status_fissuration
                }
            },
            "quantities": {
                "concrete_raft_m3": round(vol_concrete_m3, 2),
                "concrete_piles_m3": round(vol_piles_concrete_m3, 2),
                "total_concrete_m3": round(vol_concrete_m3 + vol_piles_concrete_m3, 2),
                "steel_raft_kg": round(steel_raft_kg, 0),
                "steel_piles_kg": round(steel_piles_kg, 0),
                "total_steel_kg": round(steel_raft_kg + steel_piles_kg, 0)
            },
            "loads_mapped": point_loads
        }
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}
