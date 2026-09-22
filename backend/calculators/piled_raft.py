"""
Piled Raft Foundation Calculator (Radier Estaqueado para Transbordo & Heavy Rigging)
Standards: NBR 6118:2023 (Concrete Structures) & NBR 6122:2019 (Deep Foundations)
Specialized for heavy industrial rigging operations, SPMT hydraulic transporters,
thick plate punching shear, pile group interaction, moving load transit envelopes,
reinforcement detailing and executive bill of quantities (BOM).
"""

import math
from typing import Dict, Any, List, Tuple

def calculate_piled_raft(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes soil-structure interaction, pile reactions under static and moving loads,
    transit envelope along traffic corridor, settlements, punching shear (NBR 6118 §20),
    top and bottom flexural reinforcement, crack widths, and executive bill of materials (BOM).
    """
    try:
        # 1. Raft Geometry
        Lx = float(inputs.get('raft_length_x', 16.0))         # m (length in X)
        Ly = float(inputs.get('raft_length_y', 12.0))         # m (length in Y)
        h_raft = float(inputs.get('raft_thickness', 1.20))    # m (thickness)
        gamma_c = float(inputs.get('gamma_concrete', 25.0))   # kN/m³
        
        # 2. Materials (NBR 6118:2023)
        fck = float(inputs.get('fck', 35.0))                  # MPa
        fyk = float(inputs.get('fyk', 500.0))                 # MPa (CA-50)
        cover_mm = float(inputs.get('cover', 50.0))           # mm
        pref_diam = float(inputs.get('bar_diam', 20.0))        # mm
        gamma_f = float(inputs.get('gamma_f', 1.4))           # Load factor
        gamma_c_mat = 1.4                                     # Concrete material factor
        gamma_s_mat = 1.15                                    # Steel material factor
        
        d_eff = max(0.20, h_raft - (cover_mm / 1000.0) - 0.015) # Effective depth (m)
        fcd = fck / gamma_c_mat                               # MPa
        fyd = fyk / gamma_s_mat                               # MPa
        
        # Secant Elastic Modulus (NBR 6118:2023)
        alpha_e = 1.0  # Granito / Gnaisse
        E_ci = alpha_e * 5600.0 * math.sqrt(fck)              # MPa
        alpha_i = min(1.0, 0.8 + 0.2 * (fck / 80.0))
        E_cs = alpha_i * E_ci                                 # MPa
        E_cs_kPa = E_cs * 1000.0                              # kPa
        
        # 3. Pile Layout & Geotechnical Characteristics (NBR 6122:2019)
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
        
        # Pile coordinates
        pile_coords = []
        for i in range(nx):
            px = edge_x + i * spacing_x if nx > 1 else Lx / 2.0
            for j in range(ny):
                py = edge_y + j * spacing_y if ny > 1 else Ly / 2.0
                pile_coords.append((round(px, 3), round(py, 3)))
                
        x_c_piles = sum(p[0] for p in pile_coords) / num_piles
        y_c_piles = sum(p[1] for p in pile_coords) / num_piles
        
        I_px = sum((p[0] - x_c_piles)**2 for p in pile_coords)
        I_py = sum((p[1] - y_c_piles)**2 for p in pile_coords)

        # 4. Group Interaction Factor (Randolph & Wroth / Poulos & Davis)
        s_avg = (spacing_x + spacing_y) / 2.0 if (nx > 1 and ny > 1) else max(spacing_x, spacing_y, 2.5)
        r0 = pile_diam / 2.0
        r_m = 2.5 * pile_len * (1.0 - 0.3) # Radius of influence in semi-infinite medium
        ratio_int = max(0.0, min(0.6, math.log(max(1.1, r_m / max(s_avg, 1.0))) / math.log(max(2.0, r_m / r0))))
        group_reduction_factor = 1.0 / (1.0 + (math.sqrt(num_piles) - 1.0) * ratio_int * 0.45)
        K_z_group = K_z0 * group_reduction_factor
        
        A_raft = Lx * Ly
        K_raft_soil = subgrade_ks * A_raft
        K_piles_total = num_piles * K_z_group
        K_total_sys = K_raft_soil + K_piles_total
        
        alpha_pr = K_piles_total / K_total_sys if K_total_sys > 0 else 0.85
        alpha_pr = max(0.65, min(0.96, alpha_pr))
        
        # Self-Weight and Surcharge
        W_raft = A_raft * h_raft * gamma_c
        q_live = float(inputs.get('q_live', 10.0)) # kPa
        W_live = A_raft * q_live
        
        # 5. Moving Loads & Equipment Presets
        spmt_lines = int(inputs.get('spmt_num_lines', 6))
        spmt_load_per_line = float(inputs.get('spmt_line_load', 350.0)) # kN per line
        spmt_line_spacing = float(inputs.get('spmt_line_spacing', 1.50)) # m
        spmt_gauge = float(inputs.get('spmt_gauge', 2.40)) # m
        spmt_corridor_y = float(inputs.get('spmt_corridor_y', Ly / 2.0))
        current_spmt_pos = float(inputs.get('spmt_current_pos', inputs.get('spmt_center_x', Lx / 2.0)))

        # Gantry Crane (Pórtico Rolante nas duas bordas do radier)
        # Modos de análise: 'concomitant' (Centro + Bordas), 'spmt_only' (Centro), 'gantry_only' (Bordas), 'governing_envelope' (Pior dos 3)
        moving_load_mode = str(inputs.get('moving_load_mode', 'concomitant')).strip().lower()
        if moving_load_mode not in ['concomitant', 'spmt_only', 'gantry_only', 'governing_envelope']:
            moving_load_mode = 'concomitant'

        gantry_total_load_tf = float(inputs.get('gantry_total_load_tf', 148.42)) # tf total
        gantry_leg_load_tf = float(inputs.get('gantry_leg_load_tf', gantry_total_load_tf / 2.0)) # tf por perna
        gantry_wheels_per_leg = int(inputs.get('gantry_wheels_per_leg', 4))
        gantry_wheel_spacing = float(inputs.get('gantry_wheel_spacing', 1.40)) # m
        gantry_edge_distance = float(inputs.get('gantry_edge_distance', 1.00)) # m da borda
        gantry_edge_distance = max(0.20, min(Ly / 2.0 - 0.5, gantry_edge_distance))
        gantry_y1 = gantry_edge_distance
        gantry_y2 = Ly - gantry_edge_distance
        gantry_sync_spmt = bool(inputs.get('gantry_sync_spmt', True))
        if gantry_sync_spmt:
            current_gantry_pos = current_spmt_pos
        else:
            current_gantry_pos = float(inputs.get('gantry_current_pos', Lx / 2.0))

        heavy_load = float(inputs.get('heavy_rigging_load', 2500.0)) # kN
        heavy_x = float(inputs.get('heavy_rigging_x', Lx / 2.0))
        heavy_y = float(inputs.get('heavy_rigging_y', Ly / 2.0))
        heavy_pad_w = float(inputs.get('heavy_pad_width', 1.20))
        
        # Crane outriggers configuration (4 patolas)
        crane_load_total = float(inputs.get('crane_total_load', 0.0)) # kN
        crane_cx = float(inputs.get('crane_center_x', Lx / 2.0))
        crane_cy = float(inputs.get('crane_center_y', Ly / 2.0))
        crane_span_x = float(inputs.get('crane_span_x', 8.0))
        crane_span_y = float(inputs.get('crane_span_y', 6.0))

        # 5B. Additional Point & Distributed Loads
        extra_point_loads = inputs.get('point_loads') or inputs.get('additional_point_loads') or []
        valid_point_loads = []
        for pl in extra_point_loads:
            try:
                valid_point_loads.append({
                    "name": str(pl.get('name', 'Carga Pontual')),
                    "x": float(pl.get('x', Lx / 2.0)),
                    "y": float(pl.get('y', Ly / 2.0)),
                    "P": float(pl.get('P', 0.0)),
                    "pad_width": float(pl.get('pad_width', 0.80))
                })
            except Exception:
                pass

        extra_dist_loads = inputs.get('distributed_loads') or inputs.get('additional_distributed_loads') or []
        valid_dist_loads = []
        for dl in extra_dist_loads:
            try:
                x1 = float(dl.get('x1', 0.0))
                x2 = float(dl.get('x2', 3.0))
                y1 = float(dl.get('y1', 0.0))
                y2 = float(dl.get('y2', 3.0))
                q_val = float(dl.get('q', 0.0))
                xmin, xmax = min(x1, x2), max(x1, x2)
                ymin, ymax = min(y1, y2), max(y1, y2)
                area_d = max(0.01, (xmax - xmin) * (ymax - ymin))
                p_d = q_val * area_d
                xc_d = (xmin + xmax) / 2.0
                yc_d = (ymin + ymax) / 2.0
                valid_dist_loads.append({
                    "name": str(dl.get('name', 'Sobrecarga Distribuída')),
                    "x1": xmin, "x2": xmax,
                    "y1": ymin, "y2": ymax,
                    "q": q_val,
                    "area_m2": round(area_d, 2),
                    "P_total_kN": round(p_d, 1),
                    "xc": round(xc_d, 2),
                    "yc": round(yc_d, 2)
                })
            except Exception:
                pass

        # Helper functions to generate equipment loads
        def get_static_additional_loads() -> List[Dict[str, Any]]:
            loads = []
            if heavy_load > 0:
                loads.append({"name": "Carga Pick-Up / Turbina", "x": heavy_x, "y": heavy_y, "P": heavy_load})
            if crane_load_total > 0:
                p_pad = crane_load_total / 4.0
                loads.append({"name": "Patola Diant-Esq", "x": crane_cx - crane_span_x/2.0, "y": crane_cy - crane_span_y/2.0, "P": p_pad})
                loads.append({"name": "Patola Diant-Dir", "x": crane_cx + crane_span_x/2.0, "y": crane_cy - crane_span_y/2.0, "P": p_pad})
                loads.append({"name": "Patola Tras-Esq", "x": crane_cx - crane_span_x/2.0, "y": crane_cy + crane_span_y/2.0, "P": p_pad})
                loads.append({"name": "Patola Tras-Dir", "x": crane_cx + crane_span_x/2.0, "y": crane_cy + crane_span_y/2.0, "P": p_pad})

            for pl in valid_point_loads:
                if pl["P"] > 0:
                    loads.append({"name": pl["name"], "x": pl["x"], "y": pl["y"], "P": pl["P"]})

            for dl in valid_dist_loads:
                p_tot = dl["P_total_kN"]
                if p_tot > 0:
                    for fx, fy in [(0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)]:
                        loads.append({
                            "name": f"{dl['name']} (sub)",
                            "x": dl["x1"] + fx * (dl["x2"] - dl["x1"]),
                            "y": dl["y1"] + fy * (dl["y2"] - dl["y1"]),
                            "P": p_tot / 4.0
                        })
            return loads

        def generate_spmt_loads_only(spmt_center_x: float) -> List[Dict[str, Any]]:
            loads = []
            if spmt_lines > 0 and spmt_load_per_line > 0:
                spmt_start_x = spmt_center_x - (spmt_lines - 1) * spmt_line_spacing / 2.0
                spmt_wheel_load = spmt_load_per_line / 2.0
                for li in range(spmt_lines):
                    lx = spmt_start_x + li * spmt_line_spacing
                    if -1.0 <= lx <= Lx + 1.0:
                        ly_left = spmt_corridor_y - spmt_gauge / 2.0
                        ly_right = spmt_corridor_y + spmt_gauge / 2.0
                        loads.append({"name": f"SPMT L{li+1}-Esq", "x": lx, "y": ly_left, "P": spmt_wheel_load})
                        loads.append({"name": f"SPMT L{li+1}-Dir", "x": lx, "y": ly_right, "P": spmt_wheel_load})
            return loads

        def generate_gantry_loads_only(gantry_center_x: float) -> List[Dict[str, Any]]:
            loads = []
            if gantry_leg_load_tf > 0 and gantry_wheels_per_leg > 0:
                p_leg_kN = gantry_leg_load_tf * 9.81
                p_wheel_kN = p_leg_kN / max(1, gantry_wheels_per_leg)
                start_wx = gantry_center_x - (gantry_wheels_per_leg - 1) * gantry_wheel_spacing / 2.0
                for wi in range(gantry_wheels_per_leg):
                    wx = start_wx + wi * gantry_wheel_spacing
                    if -1.0 <= wx <= Lx + 1.0:
                        loads.append({"name": f"Pórtico Borda Sul R{wi+1}", "x": wx, "y": gantry_y1, "P": p_wheel_kN})
                        loads.append({"name": f"Pórtico Borda Norte R{wi+1}", "x": wx, "y": gantry_y2, "P": p_wheel_kN})
            return loads

        def generate_loads_for_case(case_name: str, x_pos: float) -> List[Dict[str, Any]]:
            combined = list(get_static_additional_loads())
            if case_name in ['spmt_only', 'concomitant', 'governing_envelope']:
                combined.extend(generate_spmt_loads_only(x_pos))
            if case_name in ['gantry_only', 'concomitant', 'governing_envelope']:
                combined.extend(generate_gantry_loads_only(x_pos))
            return combined

        # Raft Plate Elastic Rigidity & Influence Radius
        nu_c = 0.20
        D_raft = (E_cs_kPa * (h_raft ** 3)) / (12.0 * (1.0 - nu_c ** 2))
        k_soil_equiv = subgrade_ks + (K_z_group / max(1.0, spacing_x * spacing_y))
        l_e = (4.0 * D_raft / max(1e3, k_soil_equiv)) ** 0.25
        l_e = max(1.5, min(8.0, l_e))
        
        # Influence radius calibrated to pile bay spacing and plate stiffness
        l_inf = max(1.2, min(0.90 * s_avg, l_e * 0.60))
        # Flexibility blending factor (captures plate load concentration on nearest piles vs rigid tilt)
        beta_flex = 0.50

        # Helper function to solve pile reactions for a given set of point loads
        def solve_reactions_for_loads(loads: List[Dict[str, Any]]) -> Tuple[List[float], float, float, float, float]:
            P_points = sum(l["P"] for l in loads)
            total_P = W_raft + W_live + P_points + (num_piles * q_neg_per_pile)
            
            sum_Px = (W_raft + W_live) * (Lx / 2.0) + sum(l["P"] * l["x"] for l in loads)
            sum_Py = (W_raft + W_live) * (Ly / 2.0) + sum(l["P"] * l["y"] for l in loads)
            x_G = sum_Px / total_P if total_P > 0 else Lx / 2.0
            y_G = sum_Py / total_P if total_P > 0 else Ly / 2.0
            
            e_x = x_G - x_c_piles
            e_y = y_G - y_c_piles
            
            P_to_piles = total_P * alpha_pr
            M_x_piles = P_to_piles * e_y  # Moment around X
            M_y_piles = P_to_piles * e_x  # Moment around Y
            
            # 1. Global Rigid-Body Planar Reactions
            R_rigid = []
            for px, py in pile_coords:
                term_x = (M_y_piles * (px - x_c_piles)) / I_py if I_py > 0 else 0.0
                term_y = (M_x_piles * (py - y_c_piles)) / I_px if I_px > 0 else 0.0
                r_i = (P_to_piles / num_piles) + term_x + term_y
                R_rigid.append(r_i)

            # 2. Local Plate Dispersion Reactions (sensitive to wheel track gauge and load proximities)
            P_pts_to_piles = P_points * alpha_pr
            P_unif_part = ((W_raft + W_live) * alpha_pr + num_piles * q_neg_per_pile) / num_piles
            R_local = [0.0] * num_piles

            if loads and P_pts_to_piles > 0:
                for lk in loads:
                    pk = lk["P"]
                    if pk <= 0:
                        continue
                    weights = []
                    for px, py in pile_coords:
                        dist = math.hypot(lk["x"] - px, lk["y"] - py)
                        w_i = math.exp(- (dist ** 2) / (2.0 * (l_inf ** 2)))
                        weights.append(w_i)
                    w_sum = sum(weights)
                    if w_sum > 0:
                        for i in range(num_piles):
                            R_local[i] += (pk * alpha_pr) * (weights[i] / w_sum)

                sum_r_local = sum(R_local)
                if sum_r_local > 0:
                    scale_local = P_pts_to_piles / sum_r_local
                    R_local = [r * scale_local for r in R_local]

            # 3. Hybrid Reaction (Rigid + Flexible Influence)
            reactions = []
            for i in range(num_piles):
                r_rig = R_rigid[i]
                r_flex = P_unif_part + R_local[i]
                r_comb = (1.0 - beta_flex) * r_rig + beta_flex * r_flex
                reactions.append(r_comb)

            # Enforce 100% exact vertical force equilibrium
            sum_comb = sum(reactions)
            if sum_comb > 0:
                corr = P_to_piles / sum_comb
                reactions = [r * corr for r in reactions]
                
            return reactions, total_P, P_to_piles, e_x, e_y

        # Helper functions for punching shear and flexural design
        u0_pile = math.pi * pile_diam
        u1_pile = math.pi * (pile_diam + 4.0 * d_eff)
        fctm = 0.3 * (fck ** (2.0 / 3.0))
        fctk_inf = 0.7 * fctm
        fctd = fctk_inf / gamma_c_mat
        tau_Rd2 = 0.27 * (1.0 - (fck / 250.0)) * fcd  # MPa
        rho_l = 0.0035
        xi_size = 1.0 + math.sqrt(0.20 / d_eff)
        tau_Rd1 = 0.13 * xi_size * ((100.0 * rho_l * fck) ** (1.0 / 3.0)) # MPa

        def evaluate_punching_for_r_max(r_max: float) -> Dict[str, Any]:
            f_sd_crit = gamma_f * r_max
            f_sd_mn = f_sd_crit / 1000.0
            tau_0 = f_sd_mn / (u0_pile * d_eff)
            tau_1 = f_sd_mn / (u1_pile * d_eff)
            status_0 = "APROVADO" if tau_0 <= tau_Rd2 else "REPROVADO (Esmagamento Biela)"
            needs_s = tau_1 > tau_Rd1
            if needs_s:
                fywd = 435.0
                a_sw_m2 = max(0.0, (tau_1 - 0.1 * tau_Rd1) / (1.5 * fywd)) * (u1_pile * d_eff)
                a_sw_cm2 = a_sw_m2 * 10000.0
                s_text = f"Requer Armadura de Punção (A_sw = {round(a_sw_cm2, 1)} cm²)"
            else:
                a_sw_cm2 = 0.0
                s_text = "Dispensada Armadura de Punção (Concreto Resiste)"
            overall = "APROVADO" if (tau_0 <= tau_Rd2 and (tau_1 <= tau_Rd1 or a_sw_cm2 > 0)) else "CRÍTICO"
            return {
                "critical_force_FSd_kN": round(f_sd_crit, 1),
                "tau_Sd0_MPa": round(tau_0, 2),
                "tau_Rd2_MPa": round(tau_Rd2, 2),
                "status_strut_0": status_0,
                "u0_m": round(u0_pile, 2),
                "tau_Sd1_MPa": round(tau_1, 2),
                "tau_Rd1_MPa": round(tau_Rd1, 2),
                "u1_m": round(u1_pile, 2),
                "needs_studs": needs_s,
                "A_sw_cm2": round(a_sw_cm2, 1),
                "stud_status": s_text,
                "overall_status": overall,
                "punching_ratio": round(tau_1 / tau_Rd1, 2) if tau_Rd1 > 0 else 1.0
            }

        def solve_slab_rebar(Md_kNm_m: float, pref_bar_mm: float) -> Dict[str, Any]:
            bw = 1.0
            Md_MNm = Md_kNm_m / 1000.0
            kmd = Md_MNm / (bw * (d_eff ** 2) * fcd)
            if kmd < 0.25:
                z = d_eff * (1.0 - 0.4 * kmd)
            else:
                z = d_eff * 0.85
            as_req = (Md_MNm / (z * fyd)) * 10000.0
            as_min = 0.0015 * bw * h_raft * 10000.0
            as_final = max(as_req, as_min)
            bar_area = (math.pi / 4.0) * ((pref_bar_mm / 10.0) ** 2)
            num_bars_m = as_final / bar_area
            spacing_cm = max(10.0, min(25.0, round((100.0 / max(1.0, num_bars_m)) * 2.0) / 2.0))
            as_provided = (100.0 / spacing_cm) * bar_area
            sigma_s = (Md_kNm_m / gamma_f / 1000.0) / (z * (as_provided / 10000.0))
            eta_1 = 2.25
            w_k = min(0.35, max(0.04, (pref_bar_mm / (12.5 * eta_1)) * (sigma_s / 200.0) * (sigma_s / 200000.0) * 1000.0))
            return {
                "Md_kNm_m": round(Md_kNm_m, 1),
                "As_req_cm2_m": round(as_req, 2),
                "As_min_cm2_m": round(as_min, 2),
                "As_final_cm2_m": round(as_final, 2),
                "bar_diam_mm": pref_bar_mm,
                "spacing_cm": spacing_cm,
                "as_provided_cm2_m": round(as_provided, 2),
                "text": f"Ø {pref_bar_mm:g} c/ {spacing_cm:g} cm ({round(as_provided, 2)} cm²/m)",
                "w_k_mm": round(w_k, 3),
                "crack_status": "APROVADO (w_k ≤ 0.20 mm)" if w_k <= 0.20 else "ATENÇÃO (w_k > 0.20 mm)"
            }

        def evaluate_flexure_for_case(r_max: float, total_p: float, has_spmt: bool) -> Tuple[Dict[str, Any], Dict[str, Any], float, float]:
            span_eff_x = max(1.5, spacing_x)
            span_eff_y = max(1.5, spacing_y)
            q_soil = (total_p * (1.0 - alpha_pr)) / A_raft
            m_px = (gamma_f * (r_max / span_eff_y) * span_eff_x) / 10.0 + (gamma_f * q_soil * (span_eff_x**2)) / 12.0
            m_trans = (gamma_f * (spmt_load_per_line / 2.0) * max(0.4, spmt_gauge / 2.0)) / max(1.0, spmt_line_spacing) if (has_spmt and spmt_lines > 0) else 0.0
            m_py = (gamma_f * (r_max / span_eff_x) * span_eff_y) / 10.0 + (gamma_f * q_soil * (span_eff_y**2)) / 12.0 + m_trans * 0.35
            m_pos = max(m_px, m_py)
            m_nx = (gamma_f * (r_max / span_eff_y) * span_eff_x) / 7.0
            m_ny = (gamma_f * (r_max / span_eff_x) * span_eff_y) / 7.0 + m_trans * 0.20
            m_neg = max(m_nx, m_ny)
            pref_d = float(inputs.get('bar_diam', 20.0))
            rb = solve_slab_rebar(m_pos, pref_d)
            rt = solve_slab_rebar(m_neg, pref_d)
            return rb, rt, m_pos, m_neg

        # 6. Moving Load Transit Sweep para Casos Concomitantes e Não Concomitantes
        sweep_step = max(0.25, (Lx + 4.0) / 30.0)
        x_positions = []
        curr_x = -2.0
        while curr_x <= Lx + 2.01:
            x_positions.append(round(curr_x, 2))
            curr_x += sweep_step

        def run_transit_sweep_for_mode(case_key: str):
            env_max = [-1e9] * num_piles
            env_min = [1e9] * num_piles
            history = []
            gov_pos_x = current_spmt_pos
            highest_r = -1e9
            max_tot_p = 0.0

            for sweep_x in x_positions:
                s_loads = generate_loads_for_case(case_key, sweep_x)
                s_reacs, s_tot, s_p_piles, s_ex, s_ey = solve_reactions_for_loads(s_loads)
                if s_tot > max_tot_p:
                    max_tot_p = s_tot

                for idx, r in enumerate(s_reacs):
                    if r > env_max[idx]:
                        env_max[idx] = r
                    if r < env_min[idx]:
                        env_min[idx] = r

                step_max = max(s_reacs)
                if step_max > highest_r:
                    highest_r = step_max
                    gov_pos_x = sweep_x

                history.append({
                    "pos_x": sweep_x,
                    "max_reaction_kN": round(step_max, 1),
                    "total_P_tf": round(s_tot / 9.81, 1),
                    "reactions_tf": [round(r / 9.81, 1) for r in s_reacs]
                })

            crit_pile_idx = int(max(range(num_piles), key=lambda i: env_max[i]))
            crit_pile_coord = pile_coords[crit_pile_idx]

            return {
                "env_max_reaction": env_max,
                "env_min_reaction": env_min,
                "highest_reaction_kN": highest_r,
                "governing_pos_x": gov_pos_x,
                "history": history,
                "max_total_P_kN": max_tot_p,
                "critical_pile_id": crit_pile_idx + 1,
                "critical_pile_coord": crit_pile_coord
            }

        # Executar os 3 cenários de carregamento
        sweep_spmt = run_transit_sweep_for_mode('spmt_only')
        sweep_gantry = run_transit_sweep_for_mode('gantry_only')
        sweep_concomitant = run_transit_sweep_for_mode('concomitant')

        # Envoltória governante de todos os 3 casos
        env_gov_max = [max(sweep_spmt["env_max_reaction"][i], sweep_gantry["env_max_reaction"][i], sweep_concomitant["env_max_reaction"][i]) for i in range(num_piles)]
        env_gov_min = [min(sweep_spmt["env_min_reaction"][i], sweep_gantry["env_min_reaction"][i], sweep_concomitant["env_min_reaction"][i]) for i in range(num_piles)]

        # Construir estudo comparativo dos 3 casos
        def build_case_summary(label: str, short_name: str, sw: Dict[str, Any], has_spmt: bool, equip_tf: float) -> Dict[str, Any]:
            r_max_kn = sw["highest_reaction_kN"]
            r_max_tf = r_max_kn / 9.81
            fs = pile_R_adm / r_max_kn if r_max_kn > 0 else 999.0
            settle = (r_max_kn / K_z_group) * 1000.0
            punc = evaluate_punching_for_r_max(r_max_kn)
            rb, rt, m_pos, m_neg = evaluate_flexure_for_case(r_max_kn, sw["max_total_P_kN"], has_spmt)
            return {
                "label": label,
                "short_name": short_name,
                "equipment_total_tf": round(equip_tf, 1),
                "total_vertical_tf": round(sw["max_total_P_kN"] / 9.81, 1),
                "total_vertical_kN": round(sw["max_total_P_kN"], 1),
                "max_reaction_tf": round(r_max_tf, 1),
                "max_reaction_kN": round(r_max_kn, 1),
                "fs_capacity": round(fs, 2),
                "status_capacity": "APROVADO" if r_max_kn <= pile_R_adm else "SOBRECARGA",
                "max_settlement_mm": round(settle, 2),
                "punching_ratio": punc["punching_ratio"],
                "punching_status": punc["overall_status"],
                "moment_pos_kNm_m": round(m_pos, 1),
                "moment_neg_kNm_m": round(m_neg, 1),
                "moment_design_kNm_m": round(max(m_pos, m_neg), 1),
                "as_req_cm2_m": round(rb["As_final_cm2_m"], 2),
                "critical_pile_id": sw["critical_pile_id"],
                "critical_pile_coord": sw["critical_pile_coord"],
                "governing_pos_x": sw["governing_pos_x"]
            }

        spmt_total_tf = (spmt_lines * spmt_load_per_line) / 9.81
        gantry_total_tf = gantry_total_load_tf

        case_spmt_data = build_case_summary("Não Concomitante: Apenas Linha de Eixo (Centro)", "Linha de Eixo (Centro)", sweep_spmt, True, spmt_total_tf)
        case_gantry_data = build_case_summary("Não Concomitante: Apenas Pórtico (2 Bordas)", "Pórtico Rolante (2 Bordas)", sweep_gantry, False, gantry_total_tf)
        case_concomitant_data = build_case_summary("Concomitante: Linha de Eixo + Pórtico (Transbordo)", "Concomitante (Centro + Bordas)", sweep_concomitant, True, spmt_total_tf + gantry_total_tf)

        comparative_cases = {
            "spmt_only": case_spmt_data,
            "gantry_only": case_gantry_data,
            "concomitant": case_concomitant_data,
            "governing": {
                "governing_case_name": "Concomitante (Centro + Bordas)",
                "max_reaction_tf": max(case_spmt_data["max_reaction_tf"], case_gantry_data["max_reaction_tf"], case_concomitant_data["max_reaction_tf"]),
                "min_fs_capacity": min(case_spmt_data["fs_capacity"], case_gantry_data["fs_capacity"], case_concomitant_data["fs_capacity"]),
                "max_settlement_mm": max(case_spmt_data["max_settlement_mm"], case_gantry_data["max_settlement_mm"], case_concomitant_data["max_settlement_mm"]),
                "max_moment_kNm_m": max(case_spmt_data["moment_design_kNm_m"], case_gantry_data["moment_design_kNm_m"], case_concomitant_data["moment_design_kNm_m"]),
                "max_as_req_cm2_m": max(case_spmt_data["as_req_cm2_m"], case_gantry_data["as_req_cm2_m"], case_concomitant_data["as_req_cm2_m"])
            }
        }

        # Selecionar o resultado ativo conforme o modo selecionado
        if moving_load_mode == 'spmt_only':
            active_sweep = sweep_spmt
            env_max_reaction = sweep_spmt["env_max_reaction"]
            env_min_reaction = sweep_spmt["env_min_reaction"]
            governing_spmt_pos = sweep_spmt["governing_pos_x"]
            transit_history = sweep_spmt["history"]
            has_spmt_active = True
        elif moving_load_mode == 'gantry_only':
            active_sweep = sweep_gantry
            env_max_reaction = sweep_gantry["env_max_reaction"]
            env_min_reaction = sweep_gantry["env_min_reaction"]
            governing_spmt_pos = sweep_gantry["governing_pos_x"]
            transit_history = sweep_gantry["history"]
            has_spmt_active = False
        elif moving_load_mode == 'governing_envelope':
            active_sweep = sweep_concomitant
            env_max_reaction = env_gov_max
            env_min_reaction = env_gov_min
            governing_spmt_pos = sweep_concomitant["governing_pos_x"]
            transit_history = sweep_concomitant["history"]
            has_spmt_active = True
        else: # 'concomitant'
            active_sweep = sweep_concomitant
            env_max_reaction = sweep_concomitant["env_max_reaction"]
            env_min_reaction = sweep_concomitant["env_min_reaction"]
            governing_spmt_pos = sweep_concomitant["governing_pos_x"]
            transit_history = sweep_concomitant["history"]
            has_spmt_active = True

        # Avaliar na posição instantânea atual do equipamento
        active_loads = generate_loads_for_case(moving_load_mode, current_spmt_pos)
        curr_reactions, curr_total_P, curr_P_piles, curr_ex, curr_ey = solve_reactions_for_loads(active_loads)

        global_max_reaction = max(env_max_reaction)
        global_min_reaction = min(env_min_reaction)

        piles_detail = []
        for idx, (px, py) in enumerate(pile_coords):
            r_max_env = env_max_reaction[idx]
            r_curr = curr_reactions[idx]
            settle_mm = (r_max_env / K_z_group) * 1000.0
            fs_cap = pile_R_adm / r_max_env if r_max_env > 0 else 999.0
            status_p = "APROVADO" if r_max_env <= pile_R_adm else "SOBRECARGA"
            
            piles_detail.append({
                "id": idx + 1,
                "x": px,
                "y": py,
                "reaction_kN": round(r_max_env, 1),
                "reaction_tf": round(r_max_env / 9.81, 1),
                "current_reaction_kN": round(r_curr, 1),
                "current_reaction_tf": round(r_curr / 9.81, 1),
                "min_reaction_kN": round(env_min_reaction[idx], 1),
                "settlement_mm": round(settle_mm, 2),
                "fs_capacity": round(fs_cap, 2),
                "status": status_p
            })

        max_settlement_mm = (global_max_reaction / K_z_group) * 1000.0
        min_settlement_mm = (max(0.0, global_min_reaction) / K_z_group) * 1000.0
        diff_settlement_mm = max_settlement_mm - min_settlement_mm
        angular_distortion = diff_settlement_mm / (1000.0 * max(Lx, Ly))

        # 7. Verificação de Punção (NBR 6118 §20) no modo ativo
        punch_eval = evaluate_punching_for_r_max(global_max_reaction)
        tau_Sd0 = punch_eval["tau_Sd0_MPa"]
        tau_Sd1 = punch_eval["tau_Sd1_MPa"]
        tau_Rd2 = punch_eval["tau_Rd2_MPa"]
        tau_Rd1 = punch_eval["tau_Rd1_MPa"]
        u0_pile = punch_eval["u0_m"]
        u1_pile = punch_eval["u1_m"]
        F_Sd_crit = punch_eval["critical_force_FSd_kN"]
        status_punching_0 = punch_eval["status_strut_0"]
        needs_studs = punch_eval["needs_studs"]
        A_sw_cm2 = punch_eval["A_sw_cm2"]
        stud_status = punch_eval["stud_status"]
        status_punching = punch_eval["overall_status"]

        # 8. Dimensionamento à Flexão e Fissuração no modo ativo
        rebar_bottom, rebar_top, M_pos_design, M_neg_design = evaluate_flexure_for_case(global_max_reaction, curr_total_P, has_spmt_active)
        q_soil_contact_avg = (curr_total_P * (1.0 - alpha_pr)) / A_raft
        M_pos_x = M_pos_design
        M_pos_y = M_pos_design
        M_neg_x = M_neg_design
        M_neg_y = M_neg_design


        # 9. Executive Quantities & Material Take-Off (Civil & Structural)
        vol_concrete_raft = Lx * Ly * h_raft
        vol_concrete_piles = num_piles * (math.pi * (pile_diam / 2.0)**2) * pile_len
        vol_concrete_total = vol_concrete_raft + vol_concrete_piles
        
        cava_overhang = 0.50 # m working space around raft boundary
        h_lean = 0.05        # 5 cm lean concrete bed
        excavation_piles_m3 = vol_concrete_piles
        excavation_mechanized_m3 = (Lx + 2.0 * cava_overhang) * (Ly + 2.0 * cava_overhang) * (h_raft + h_lean)
        lean_concrete_m3 = (Lx + 2.0 * 0.10) * (Ly + 2.0 * 0.10) * h_lean
        concrete_structural_m3 = vol_concrete_total
        backfill_m3 = max(0.0, excavation_mechanized_m3 - (vol_concrete_raft + lean_concrete_m3))
        disposal_m3 = excavation_piles_m3 + vol_concrete_raft + lean_concrete_m3
        formwork_area_m2 = 2.0 * (Lx + Ly) * h_raft
        
        steel_bottom_kg = (rebar_bottom["as_provided_cm2_m"] / 10000.0) * A_raft * 2.0 * 7850.0 * 1.10
        steel_top_kg = (rebar_top["as_provided_cm2_m"] / 10000.0) * A_raft * 2.0 * 7850.0 * 1.10
        critical_piles_punch = sum(1 for p in piles_detail if p["reaction_kN"] > (tau_Rd1 * u1_pile * d_eff * 1000.0 / gamma_f))
        steel_studs_kg = critical_piles_punch * (A_sw_cm2 / 10000.0) * (h_raft * 0.8) * 7850.0 if needs_studs else 0.0
        steel_piles_kg = vol_concrete_piles * 85.0
        
        steel_total_kg = steel_bottom_kg + steel_top_kg + steel_studs_kg + steel_piles_kg
        steel_consumption_kg_m3 = steel_total_kg / vol_concrete_total if vol_concrete_total > 0 else 0.0
        total_drilling_m = num_piles * pile_len
        
        # 10. Parametric Cost Estimation (R$)
        c_conc = float(inputs.get('unit_cost_concrete', 550.0))    # R$/m³
        c_steel = float(inputs.get('unit_cost_steel', 12.50))      # R$/kg
        c_form = float(inputs.get('unit_cost_formwork', 85.0))     # R$/m²
        c_drill = float(inputs.get('unit_cost_drilling', 180.0))   # R$/m
        
        cost_concrete = vol_concrete_total * c_conc
        cost_steel = steel_total_kg * c_steel
        cost_formwork = formwork_area_m2 * c_form
        cost_drilling = total_drilling_m * c_drill
        cost_total = cost_concrete + cost_steel + cost_formwork + cost_drilling
        cost_per_m2_raft = cost_total / A_raft if A_raft > 0 else 0.0

        # 11. Continuous 2D Heatmap Grid for the Raft
        grid_nx = 33
        grid_ny = 25
        xs_grid = [round(i * (Lx / (grid_nx - 1)), 2) for i in range(grid_nx)]
        ys_grid = [round(j * (Ly / (grid_ny - 1)), 2) for j in range(grid_ny)]
        
        w_avg = curr_total_P / max(1e3, K_total_sys) # m
        theta_x = curr_ey * (curr_total_P * alpha_pr) / max(1e3, K_z_group * I_px) if I_px > 0 else 0.0
        theta_y = curr_ex * (curr_total_P * alpha_pr) / max(1e3, K_z_group * I_py) if I_py > 0 else 0.0
        
        grid_settlements_mm = []
        grid_soil_pressure_kPa = []
        grid_pile_util_pct = []
        grid_moments_kNm_m = []
        
        for gy in ys_grid:
            row_w = []
            row_p = []
            row_u = []
            row_m = []
            for gx in xs_grid:
                w_plane = w_avg + theta_x * (gy - y_c_piles) + theta_y * (gx - x_c_piles)
                
                w_loads_local = 0.0
                for lk in active_loads:
                    pk = lk["P"]
                    if pk <= 0:
                        continue
                    d_k = math.hypot(gx - lk["x"], gy - lk["y"])
                    w_loads_local += (pk / max(1e3, K_raft_soil * 0.15 + K_piles_total * 0.35)) * math.exp(- (d_k ** 2) / (2.0 * (l_e ** 2)))
                
                w_piles_supp = 0.0
                for idx, (px, py) in enumerate(pile_coords):
                    d_p = math.hypot(gx - px, gy - py)
                    r_i = curr_reactions[idx]
                    w_piles_supp += (r_i / max(1e3, K_z_group * 1.5)) * math.exp(- (d_p ** 2) / (1.5 * (l_e ** 2)))
                
                w_val = max(0.2, (w_plane + 0.40 * w_loads_local - 0.18 * w_piles_supp) * 1000.0)
                p_val = subgrade_ks * (w_val / 1000.0)
                
                u_weights = []
                for idx, (px, py) in enumerate(pile_coords):
                    d_p = math.hypot(gx - px, gy - py)
                    r_pct = (curr_reactions[idx] / pile_R_adm) * 100.0
                    uw = math.exp(- (d_p ** 2) / (2.0 * (s_avg ** 2)))
                    u_weights.append((uw, r_pct))
                sum_uw = sum(uw for uw, _ in u_weights)
                u_val = sum(uw * rp for uw, rp in u_weights) / sum_uw if sum_uw > 0 else 50.0
                
                m_val = (M_pos_design * (w_val / max(0.1, max_settlement_mm))) if max_settlement_mm > 0 else M_pos_design
                
                row_w.append(round(w_val, 2))
                row_p.append(round(p_val, 1))
                row_u.append(round(u_val, 1))
                row_m.append(round(m_val, 1))
                
            grid_settlements_mm.append(row_w)
            grid_soil_pressure_kPa.append(row_p)
            grid_pile_util_pct.append(row_u)
            grid_moments_kNm_m.append(row_m)

        return {
            "success": True,
            "raft_geometry": {
                "Lx": round(Lx, 2),
                "Ly": round(Ly, 2),
                "thickness": round(h_raft, 2),
                "area_m2": round(A_raft, 2),
                "d_eff_m": round(d_eff, 3),
                "vol_concrete_m3": round(vol_concrete_raft, 2),
                "formwork_area_m2": round(formwork_area_m2, 2)
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
                "max_reaction_kN": round(global_max_reaction, 1),
                "max_reaction_tf": round(global_max_reaction / 9.81, 1),
                "min_reaction_kN": round(global_min_reaction, 1),
                "pile_capacity_adm_kN": round(pile_R_adm, 1),
                "fs_capacity_min": round(pile_R_adm / global_max_reaction, 2) if global_max_reaction > 0 else 999.0,
                "governing_spmt_x": round(governing_spmt_pos, 2),
                "piles_detail": piles_detail
            },
            "load_distribution": {
                "total_vertical_kN": round(curr_total_P, 1),
                "total_vertical_tf": round(curr_total_P / 9.81, 1),
                "alpha_pr": round(alpha_pr, 3),
                "load_to_piles_kN": round(curr_P_piles, 1),
                "load_to_piles_pct": round(alpha_pr * 100.0, 1),
                "load_to_soil_kN": round(curr_total_P * (1.0 - alpha_pr), 1),
                "load_to_soil_pct": round((1.0 - alpha_pr) * 100.0, 1),
                "q_soil_avg_kPa": round(q_soil_contact_avg, 1),
                "eccentricity_x_m": round(curr_ex, 3),
                "eccentricity_y_m": round(curr_ey, 3)
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
                "M_design_kNm_m": round(max(M_pos_design, M_neg_design), 1),
                "As_final_cm2_m": round(max(rebar_bottom["As_final_cm2_m"], rebar_top["As_final_cm2_m"]), 2),
                "bottom_mesh": rebar_bottom,
                "top_mesh": rebar_top,
                "detailing": {
                    "bar_diam_mm": pref_diam,
                    "spacing_cm": rebar_bottom["spacing_cm"],
                    "text": f"Malha Inf: {rebar_bottom['text']} | Malha Sup: {rebar_top['text']}",
                    "as_provided_cm2_m": rebar_bottom["as_provided_cm2_m"]
                },
                "crack_width": {
                    "w_k_mm": rebar_bottom["w_k_mm"],
                    "limit_mm": 0.20,
                    "status": rebar_bottom["crack_status"]
                }
            },
            "quantities": {
                "excavation_piles_m3": round(excavation_piles_m3, 2),
                "excavation_mechanized_m3": round(excavation_mechanized_m3, 2),
                "backfill_m3": round(backfill_m3, 2),
                "disposal_m3": round(disposal_m3, 2),
                "concrete_structural_m3": round(concrete_structural_m3, 2),
                "concrete_raft_m3": round(vol_concrete_raft, 2),
                "concrete_piles_m3": round(vol_concrete_piles, 2),
                "concrete_lean_m3": round(lean_concrete_m3, 2),
                "total_concrete_m3": round(vol_concrete_total, 2),
                "formwork_m2": round(formwork_area_m2, 2),
                "drilling_piles_m": round(total_drilling_m, 1),
                "steel_bottom_kg": round(steel_bottom_kg, 0),
                "steel_top_kg": round(steel_top_kg, 0),
                "steel_studs_kg": round(steel_studs_kg, 0),
                "steel_piles_kg": round(steel_piles_kg, 0),
                "total_steel_kg": round(steel_total_kg, 0),
                "total_steel_ton": round(steel_total_kg / 1000.0, 2),
                "steel_consumption_kg_m3": round(steel_consumption_kg_m3, 1),
                "items_table": [
                    {"id": "01", "description": f"Escavação de tubulão/estaca Ø {int(pile_diam*100)} cm", "unit": "m³", "qty": round(excavation_piles_m3, 1)},
                    {"id": "02", "description": "Escavação mecanizada da cava do radier", "unit": "m³", "qty": round(excavation_mechanized_m3, 1)},
                    {"id": "03", "description": "Reaterro compactado periférico da cava", "unit": "m³", "qty": round(backfill_m3, 1)},
                    {"id": "04", "description": "Bota-fora de solo excedente / descarte", "unit": "m³", "qty": round(disposal_m3, 1)},
                    {"id": "05", "description": f"Concreto usinado fck {int(fck)} MPa (Radier + Estacas)", "unit": "m³", "qty": round(concrete_structural_m3, 1)},
                    {"id": "06", "description": "Concreto de regularização / magro fck 10 MPa (e=5 cm)", "unit": "m³", "qty": round(lean_concrete_m3, 1)},
                    {"id": "07", "description": "Formas laterais periféricas de madeira", "unit": "m²", "qty": round(formwork_area_m2, 1)},
                    {"id": "08", "description": "Aço CA-50 cortado e dobrado (Malhas, Studs e Estacas)", "unit": "kg", "qty": round(steel_total_kg, 0)}
                ]
            },
            "cost_estimation": {
                "unit_cost_concrete": c_conc,
                "unit_cost_steel": c_steel,
                "unit_cost_formwork": c_form,
                "unit_cost_drilling": c_drill,
                "cost_concrete_brl": round(cost_concrete, 2),
                "cost_steel_brl": round(cost_steel, 2),
                "cost_formwork_brl": round(cost_formwork, 2),
                "cost_drilling_brl": round(cost_drilling, 2),
                "cost_total_brl": round(cost_total, 2),
                "cost_per_m2_brl": round(cost_per_m2_raft, 2)
            },
            "moving_load_mode": moving_load_mode,
            "comparative_cases": comparative_cases,
            "gantry_info": {
                "total_load_tf": round(gantry_total_load_tf, 2),
                "leg_load_tf": round(gantry_leg_load_tf, 2),
                "leg_load_kN": round(gantry_leg_load_tf * 9.81, 1),
                "wheels_per_leg": gantry_wheels_per_leg,
                "wheel_spacing_m": round(gantry_wheel_spacing, 2),
                "edge_distance_m": round(gantry_edge_distance, 2),
                "y_leg1": round(gantry_y1, 2),
                "y_leg2": round(gantry_y2, 2),
                "current_pos_x": round(current_gantry_pos, 2)
            },
            "transit_simulation": {
                "spmt_current_pos": round(current_spmt_pos, 2),
                "corridor_y": round(spmt_corridor_y, 2),
                "governing_pos_x": round(governing_spmt_pos, 2),
                "transit_points": transit_history
            },
            "loads_mapped": active_loads,
            "additional_point_loads": valid_point_loads,
            "additional_distributed_loads": valid_dist_loads,
            "heatmap_grid": {
                "nx": grid_nx,
                "ny": grid_ny,
                "xs": xs_grid,
                "ys": ys_grid,
                "settlements_mm": grid_settlements_mm,
                "soil_pressures_kPa": grid_soil_pressure_kPa,
                "pile_util_pct": grid_pile_util_pct,
                "moments_kNm_m": grid_moments_kNm_m,
                "min_settlement_mm": min(min(r) for r in grid_settlements_mm),
                "max_settlement_mm": max(max(r) for r in grid_settlements_mm),
                "min_soil_pressure_kPa": min(min(r) for r in grid_soil_pressure_kPa),
                "max_soil_pressure_kPa": max(max(r) for r in grid_soil_pressure_kPa),
                "min_pile_util_pct": min(min(r) for r in grid_pile_util_pct),
                "max_pile_util_pct": max(max(r) for r in grid_pile_util_pct),
                "min_moment_kNm_m": min(min(r) for r in grid_moments_kNm_m),
                "max_moment_kNm_m": max(max(r) for r in grid_moments_kNm_m)
            }
        }
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}
