"""
Piled Beam on Elastic Supports under Moving Load Train (Viga de Coroamento Estaqueada sob Carga Móvel de Pórtico)
Standards: NBR 6118:2023 (Concrete Structures) & NBR 6122:2019 (Deep Foundations)
Specialized for heavy gantry crane runway beams, moving wheel bogies,
dynamic amplification, finite element discrete spring solver, bending and shear envelopes,
lateral crabbing / braking forces, skin reinforcement (armadura de pele), and executive BOM.
"""

import math
from typing import Dict, Any, List, Tuple
import numpy as np
import scipy.linalg

def calculate_piled_beam(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Solves continuous beam on discrete elastic pile springs subjected to a moving gantry load train
    using an exact Euler-Bernoulli 1D Finite Element Formulation with spring supports.
    Computes governing envelopes, pile reactions, lateral guide/braking effects,
    longitudinal, skin, and transverse reinforcement (NBR 6118), crack widths, and executive BOM.
    """
    try:
        # 1. Beam Geometry
        L_total = float(inputs.get('beam_length', 24.0))       # m (total runway length)
        bw = float(inputs.get('beam_width', 0.80))             # m (width)
        h = float(inputs.get('beam_height', 1.20))             # m (height)
        gamma_c = float(inputs.get('gamma_concrete', 25.0))    # kN/m³
        
        # 2. Pile Support Layout
        pile_spacing = float(inputs.get('pile_spacing', 3.0))  # m (span between piles)
        cantilever_left = float(inputs.get('cantilever_left', 1.50)) # m
        
        pile_positions = []
        curr_x = cantilever_left
        while curr_x <= L_total - 0.49:
            pile_positions.append(round(curr_x, 3))
            curr_x += pile_spacing
            
        num_piles = len(pile_positions)
        if num_piles < 2:
            return {"error": "A viga deve possuir pelo menos 2 estacas de apoio."}
            
        # Pile properties
        pile_diam = float(inputs.get('pile_diameter', 0.80))   # m
        pile_len = float(inputs.get('pile_length', 18.0))      # m
        K_z = float(inputs.get('pile_spring_kz', 180000.0))    # kN/m (vertical spring)
        K_x = float(inputs.get('pile_spring_kx', 40000.0))     # kN/m (horizontal spring)
        pile_R_adm = float(inputs.get('pile_capacity_adm', 1600.0)) # kN (allowable compression)
        pile_T_adm = float(inputs.get('pile_tension_adm', 300.0))   # kN (allowable uplift)
        
        # 3. Moving Gantry Load Train (Trem-Tipo do Pórtico)
        gantry_load_tf = float(inputs.get('gantry_load_tf', 148.42))
        phi_din = float(inputs.get('dynamic_factor', 1.25))    # Dynamic impact coefficient
        braking_ratio = float(inputs.get('braking_ratio', 0.15)) # 15% longitudinal braking
        transverse_ratio = float(inputs.get('transverse_ratio', 0.10)) # 10% transverse crabbing/guide
        rail_eccentricity_m = float(inputs.get('rail_eccentricity', 0.05)) # 5 cm rail eccentricity
        
        total_gantry_P_kN = gantry_load_tf * 9.81 * phi_din    # Total factored vertical force
        H_braking_kN = (gantry_load_tf * 9.81) * braking_ratio  # Total braking force
        H_transverse_kN = (gantry_load_tf * 9.81) * transverse_ratio # Total crabbing force
        
        num_wheels = int(inputs.get('num_wheels', 4))
        wheel_spacing = float(inputs.get('wheel_spacing', 1.40)) # m between adjacent wheels
        P_wheel = total_gantry_P_kN / num_wheels # kN per wheel
        wheel_offsets = [(i - (num_wheels - 1) / 2.0) * wheel_spacing for i in range(num_wheels)]
        
        # 4. Materials (NBR 6118:2023)
        fck = float(inputs.get('fck', 35.0))                   # MPa
        fyk = float(inputs.get('fyk', 500.0))                  # MPa
        cover_mm = float(inputs.get('cover', 50.0))            # mm
        gamma_f = float(inputs.get('gamma_f', 1.4))            # Load combination factor
        
        d_eff = max(0.20, h - (cover_mm / 1000.0) - 0.020)
        fcd = fck / 1.4
        fyd = fyk / 1.15
        
        # Flexural Rigidity of Beam (EI)
        alpha_i = min(1.0, 0.8 + 0.2 * (fck / 80.0))
        E_cs_MPa = alpha_i * 5600.0 * math.sqrt(fck)
        E_cs_kPa = E_cs_MPa * 1000.0
        I_beam = (bw * (h ** 3)) / 12.0
        EI = E_cs_kPa * I_beam                                 # kN·m²
        
        # Self-Weight of Beam
        w_beam = bw * h * gamma_c                              # kN/m
        
        # 5. Finite Element Discretization
        # Uniform node distribution every ~0.10m + exact pile positions
        dx_target = 0.10
        raw_x = [round(i * dx_target, 3) for i in range(int(round(L_total / dx_target)) + 1)]
        all_x = sorted(list(set(raw_x + pile_positions)))
        node_x = [x for x in all_x if 0.0 <= x <= L_total]
        n_nodes = len(node_x)
        pile_node_indices = [node_x.index(px) for px in pile_positions]
        
        n_dof = 2 * n_nodes
        
        # Assemble Base Stiffness Matrix K_beam + K_springs
        K_global = np.zeros((n_dof, n_dof), dtype=np.float64)
        
        for e in range(n_nodes - 1):
            x1 = node_x[e]
            x2 = node_x[e + 1]
            Le = x2 - x1
            Le2 = Le * Le
            Le3 = Le2 * Le
            
            # 4x4 Euler-Bernoulli element stiffness matrix
            ke = (EI / Le3) * np.array([
                [ 12.0,       6.0 * Le, -12.0,       6.0 * Le],
                [  6.0 * Le, 4.0 * Le2,  -6.0 * Le,  2.0 * Le2],
                [-12.0,      -6.0 * Le,  12.0,      -6.0 * Le],
                [  6.0 * Le, 2.0 * Le2,  -6.0 * Le,  4.0 * Le2]
            ], dtype=np.float64)
            
            dofs = [2 * e, 2 * e + 1, 2 * (e + 1), 2 * (e + 1) + 1]
            for i in range(4):
                for j in range(4):
                    K_global[dofs[i], dofs[j]] += ke[i, j]
                    
        # Add discrete pile springs K_z to vertical displacement DOFs (2 * p)
        for p_idx in pile_node_indices:
            K_global[2 * p_idx, 2 * p_idx] += K_z
            
        # Self-weight equivalent nodal loads
        F_sw = np.zeros(n_dof, dtype=np.float64)
        for e in range(n_nodes - 1):
            Le = node_x[e + 1] - node_x[e]
            # Uniform downward load: positive downward sign convention for formulation
            fe = w_beam * Le * np.array([0.5, Le / 12.0, 0.5, -Le / 12.0], dtype=np.float64)
            dofs = [2 * e, 2 * e + 1, 2 * (e + 1), 2 * (e + 1) + 1]
            for i in range(4):
                F_sw[dofs[i]] += fe[i]
                
        # Pre-factorize K_global with Cholesky or LU for ultra-fast solving
        lu, piv = scipy.linalg.lu_factor(K_global)
        
        # Helper function to solve response for given active wheels
        def solve_beam_state(active_wheel_coords: List[float]) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
            """Returns (deflections w(x), moments M(x), shears V(x), pile reactions R)"""
            F_total = F_sw.copy()
            for wx in active_wheel_coords:
                if 0.0 <= wx <= L_total:
                    # Find element containing wx
                    e = min(n_nodes - 2, max(0, int(np.searchsorted(node_x, wx) - 1)))
                    x1 = node_x[e]
                    x2 = node_x[e + 1]
                    Le = x2 - x1
                    xi = (wx - x1) / Le
                    xi = max(0.0, min(1.0, xi))
                    
                    # Hermite shape functions
                    N1 = 1.0 - 3.0 * (xi**2) + 2.0 * (xi**3)
                    N2 = Le * (xi - 2.0 * (xi**2) + (xi**3))
                    N3 = 3.0 * (xi**2) - 2.0 * (xi**3)
                    N4 = Le * (- (xi**2) + (xi**3))
                    
                    fe_w = P_wheel * np.array([N1, N2, N3, N4], dtype=np.float64)
                    dofs = [2 * e, 2 * e + 1, 2 * (e + 1), 2 * (e + 1) + 1]
                    for i in range(4):
                        F_total[dofs[i]] += fe_w[i]
                        
            U = scipy.linalg.lu_solve((lu, piv), F_total)
            
            # Extract nodal deflections w
            w_disp = U[0::2]
            
            # Compute pile reactions R_i = K_z * w(x_pile)
            pile_reacs = []
            for p_node in pile_node_indices:
                pile_reacs.append(K_z * w_disp[p_node])
                
            # Internal moments M(x) = EI * v''(x) and Shears V(x) = EI * v'''(x)
            M_arr = np.zeros(n_nodes, dtype=np.float64)
            V_arr = np.zeros(n_nodes, dtype=np.float64)
            
            for e in range(n_nodes - 1):
                Le = node_x[e + 1] - node_x[e]
                Le2 = Le * Le
                Le3 = Le2 * Le
                ue = U[[2 * e, 2 * e + 1, 2 * (e + 1), 2 * (e + 1) + 1]]
                
                # At xi = 0 (left node of element)
                # v''(0) = (-6/Le2)*v1 + (-4/Le)*th1 + (6/Le2)*v2 + (-2/Le)*th2
                curv_0 = (-6.0 / Le2) * ue[0] + (-4.0 / Le) * ue[1] + (6.0 / Le2) * ue[2] + (-2.0 / Le) * ue[3]
                # v'''(0) = (12/Le3)*v1 + (6/Le2)*th1 + (-12/Le3)*v2 + (6/Le2)*th2
                shear_grad_0 = (12.0 / Le3) * ue[0] + (6.0 / Le2) * ue[1] + (-12.0 / Le3) * ue[2] + (6.0 / Le2) * ue[3]
                
                M_left = EI * curv_0
                V_left = EI * shear_grad_0
                
                if e == 0:
                    M_arr[e] = M_left
                    V_arr[e] = V_left
                else:
                    # Average at internal nodes for smoothness
                    M_arr[e] = 0.5 * (M_arr[e] + M_left)
                    V_arr[e] = 0.5 * (V_arr[e] + V_left)
                    
                # At xi = 1 (right node of element)
                curv_1 = (6.0 / Le2) * ue[0] + (2.0 / Le) * ue[1] + (-6.0 / Le2) * ue[2] + (4.0 / Le) * ue[3]
                shear_grad_1 = (12.0 / Le3) * ue[0] + (6.0 / Le2) * ue[1] + (-12.0 / Le3) * ue[2] + (6.0 / Le2) * ue[3]
                M_arr[e + 1] = EI * curv_1
                V_arr[e + 1] = EI * shear_grad_1
                
            return w_disp, M_arr, V_arr, np.array(pile_reacs)

        # 6. Moving Load Train Sweep (Envelopes Calculation)
        sweep_step = 0.10 # m
        x_min_sweep = - (num_wheels * wheel_spacing)
        x_max_sweep = L_total + (num_wheels * wheel_spacing)
        num_sweep_steps = int((x_max_sweep - x_min_sweep) / sweep_step) + 1
        
        env_M_pos = np.zeros(n_nodes, dtype=np.float64)
        env_M_neg = np.zeros(n_nodes, dtype=np.float64)
        env_V_pos = np.zeros(n_nodes, dtype=np.float64)
        env_V_neg = np.zeros(n_nodes, dtype=np.float64)
        
        max_pile_reaction = [-1e9] * num_piles
        min_pile_reaction = [1e9] * num_piles
        
        governing_gantry_pos = L_total / 2.0
        peak_reaction_found = -1e9
        
        for step in range(num_sweep_steps):
            x_gantry = x_min_sweep + step * sweep_step
            active_wheels = [x_gantry + offset for offset in wheel_offsets if 0.0 <= x_gantry + offset <= L_total]
            
            if not active_wheels:
                continue
                
            w_disp, M_step, V_step, R_piles = solve_beam_state(active_wheels)
            
            # Update envelopes
            for i in range(n_nodes):
                m_val = M_step[i]
                if m_val > env_M_pos[i]:
                    env_M_pos[i] = m_val
                if m_val < env_M_neg[i]:
                    env_M_neg[i] = m_val
                    
                v_abs = abs(V_step[i])
                if v_abs > env_V_pos[i]:
                    env_V_pos[i] = v_abs
                    env_V_neg[i] = -v_abs
                    
            for p_i, r in enumerate(R_piles):
                if r > max_pile_reaction[p_i]:
                    max_pile_reaction[p_i] = r
                if r < min_pile_reaction[p_i]:
                    min_pile_reaction[p_i] = r
                    
            if max(R_piles) > peak_reaction_found:
                peak_reaction_found = max(R_piles)
                governing_gantry_pos = x_gantry

        # Solve for active gantry slider position chosen by user
        current_gantry_x = float(inputs.get('gantry_position', L_total / 2.0))
        active_slider_wheels = [current_gantry_x + offset for offset in wheel_offsets if 0.0 <= current_gantry_x + offset <= L_total]
        w_curr, M_curr, V_curr, R_curr = solve_beam_state(active_slider_wheels)

        # Extract Critical Envelope Quantities
        M_pos_max = float(np.max(env_M_pos))
        M_neg_max = float(abs(np.min(env_M_neg)))
        V_max = float(np.max(env_V_pos))
        R_max_overall = max(max_pile_reaction)
        R_min_overall = min(min_pile_reaction)
        
        # 7. Beam Structural Design (NBR 6118:2023)
        # Positive moment (Span - Bottom Rebar)
        Md_pos = gamma_f * M_pos_max
        Md_pos_MNm = Md_pos / 1000.0
        kmd_pos = Md_pos_MNm / (bw * (d_eff ** 2) * fcd)
        z_pos = d_eff * (1.0 - 0.4 * min(0.35, kmd_pos))
        As_inf_req = (Md_pos_MNm / (z_pos * fyd)) * 10000.0
        
        # Negative moment (Support over piles - Top Rebar)
        Md_neg = gamma_f * M_neg_max
        Md_neg_MNm = Md_neg / 1000.0
        kmd_neg = Md_neg_MNm / (bw * (d_eff ** 2) * fcd)
        z_neg = d_eff * (1.0 - 0.4 * min(0.35, kmd_neg))
        As_sup_req = (Md_neg_MNm / (z_neg * fyd)) * 10000.0
        
        # Minimum longitudinal steel (rho_min = 0.15% for beams - NBR 6118 Tabela 17.3)
        As_min_beam = 0.0015 * bw * h * 10000.0
        As_inf_final = max(As_inf_req, As_min_beam)
        As_sup_final = max(As_sup_req, As_min_beam)
        
        # Skin Reinforcement (Armadura de Pele Lateral - NBR 6118 §17.3.5.2.3)
        # Required for beams with h >= 60 cm to control web cracking
        needs_skin_rebar = (h >= 0.60)
        if needs_skin_rebar:
            # 0.10% Ac per face, capped at 5 cm²/m per face
            As_skin_req_face_cm2_m = min(5.0, max(1.0, 0.0010 * bw * 10000.0))
            phi_skin = 10.0 # mm
            area_1_skin = (math.pi / 4.0) * ((phi_skin / 10.0) ** 2)
            n_skin_per_face = max(2, math.ceil((h - 2.0 * 0.15) / 0.18))
            As_skin_provided_face = n_skin_per_face * area_1_skin
            skin_rebar_text = f"Armadura de Pele: {n_skin_per_face} Ø 10 mm por face (Total {2 * n_skin_per_face} barras)"
        else:
            As_skin_req_face_cm2_m = 0.0
            n_skin_per_face = 0
            As_skin_provided_face = 0.0
            skin_rebar_text = "Dispensada Armadura de Pele (h < 60 cm)"

        # Commercial Bar Detailing Helper
        def detail_beam_rebar(As_cm2: float, pref_diam_mm: float = 25.0) -> Dict[str, Any]:
            area_1 = (math.pi / 4.0) * ((pref_diam_mm / 10.0) ** 2)
            n_bars = max(2, math.ceil(As_cm2 / area_1))
            as_prov = n_bars * area_1
            # Layers determination based on beam width bw
            b_avail_cm = (bw * 100.0) - (2.0 * cover_mm / 10.0) - 2.5 # minus stirrups
            bars_per_layer = max(2, int(b_avail_cm // (pref_diam_mm / 10.0 + 3.0)))
            n_layers = math.ceil(n_bars / bars_per_layer)
            return {
                "num_bars": n_bars,
                "bar_diam_mm": pref_diam_mm,
                "layers": n_layers,
                "bars_per_layer": bars_per_layer,
                "as_provided_cm2": round(as_prov, 2),
                "text": f"{n_bars} Ø {pref_diam_mm:g} mm ({round(as_prov, 2)} cm² - {n_layers} camada{'s' if n_layers > 1 else ''})"
            }
            
        pref_diam_beam = float(inputs.get('bar_diam', 25.0))
        detail_inf = detail_beam_rebar(As_inf_final, pref_diam_beam)
        detail_sup = detail_beam_rebar(As_sup_final, pref_diam_beam)
        
        # Combined Shear & Torsion Verification (NBR 6118 Modelo I + Torção)
        V_sd = gamma_f * V_max
        V_sd_MN = V_sd / 1000.0
        
        # Torsion from rail eccentricity
        T_sd = gamma_f * (P_wheel * rail_eccentricity_m) # kN·m
        T_sd_MNm = T_sd / 1000.0
        
        # V_Rd2: Concrete compression strut crushing
        alpha_v = 1.0 - (fck / 250.0)
        VRd2_MN = 0.27 * alpha_v * fcd * bw * d_eff
        VRd2_kN = VRd2_MN * 1000.0
        
        # T_Rd2: Concrete torsion strut crushing
        # Equivalent thin-walled section
        t_wall = max(0.12, bw / 6.0)
        A_k = (bw - t_wall) * (h - t_wall)
        u_k = 2.0 * ((bw - t_wall) + (h - t_wall))
        TRd2_MNm = 0.50 * alpha_v * fcd * A_k * t_wall
        TRd2_kNm = TRd2_MNm * 1000.0
        
        combined_strut_ratio = (V_sd / VRd2_kN) + (T_sd / TRd2_kNm)
        status_shear_strut = "APROVADO (Biela OK)" if combined_strut_ratio <= 1.0 else "REPROVADO (Esmagamento Biela)"
        
        # Vc: Concrete shear capacity
        fctm = 0.3 * (fck ** (2.0 / 3.0))
        fctk_inf = 0.7 * fctm
        fctd = fctk_inf / 1.4
        Vc_MN = 0.6 * fctd * bw * d_eff
        Vc_kN = Vc_MN * 1000.0
        
        # Transverse reinforcement (Stirrups for V + T)
        Vsw_kN = max(0.0, V_sd - Vc_kN)
        Vsw_MN = Vsw_kN / 1000.0
        fywd = 435.0 # MPa
        
        # Asw/s for shear (2 branches)
        Asw_s_shear_m2_m = Vsw_MN / (0.9 * d_eff * fywd)
        # Asw/s for torsion (1 outer branch per face)
        Asw_s_torsion_m2_m = T_sd_MNm / (2.0 * A_k * fywd)
        
        Asw_s_total_cm2_m = (Asw_s_shear_m2_m + 2.0 * Asw_s_torsion_m2_m) * 10000.0
        Asw_min_cm2_m = 0.20 * (fctm / 500.0) * bw * 10000.0 # rho_w,min
        Asw_s_final_cm2_m = max(Asw_min_cm2_m, Asw_s_total_cm2_m)
        
        phi_st = 10.0 # mm
        area_st_2branches = 2.0 * (math.pi / 4.0) * ((phi_st / 10.0) ** 2)
        spacing_st_cm = max(8.0, min(25.0, round((area_st_2branches / (Asw_s_final_cm2_m / 100.0)) * 2.0) / 2.0))
        asw_prov_cm2_m = (area_st_2branches / (spacing_st_cm / 100.0))
        
        # Crack width check ELS-W
        sigma_s_inf = (M_pos_max / (z_pos * (detail_inf["as_provided_cm2"] / 10000.0))) / 1000.0
        eta_1 = 2.25
        w_k_mm = min(0.35, max(0.04, (detail_inf["bar_diam_mm"] / (12.5 * eta_1)) * (sigma_s_inf / 200.0) * (sigma_s_inf / 200000.0) * 1000.0))
        status_els = "APROVADO (w_k ≤ 0.20 mm)" if w_k_mm <= 0.20 else "ALERTA (w_k > 0.20 mm)"

        # 8. Geotechnical & Structural Check on Piles (NBR 6122:2019)
        fs_pile_comp = pile_R_adm / R_max_overall if R_max_overall > 0 else 999.0
        status_pile_comp = "APROVADO" if R_max_overall <= pile_R_adm else "SOBRECARGA"
        
        if R_min_overall < 0:
            uplift_kN = abs(R_min_overall)
            status_pile_uplift = "APROVADO (Arrancamento OK)" if uplift_kN <= pile_T_adm else "ALERTA (Arrancamento Excessivo)"
        else:
            uplift_kN = 0.0
            status_pile_uplift = "DISPENSADO (Sem Tração)"
            
        active_piles_braking = max(2, min(num_piles, int(math.ceil((num_wheels * wheel_spacing) / pile_spacing)) + 1))
        H_per_pile_kN = H_braking_kN / active_piles_braking
        M_pile_head_kNm = H_per_pile_kN * (1.5 * pile_diam)
        
        # 9. Span Optimization Study (Comparative Table for Different Pile Spacings)
        span_options = [2.0, 2.5, 3.0, 3.5, 4.0]
        span_optimization = []
        for s_opt in span_options:
            n_p_opt = int(math.ceil((L_total - 2.0 * cantilever_left) / s_opt)) + 1
            ratio_s = s_opt / pile_spacing
            M_pos_opt = M_pos_max * (ratio_s ** 1.3)
            M_neg_opt = M_neg_max * (ratio_s ** 1.3)
            V_opt = V_max * (ratio_s ** 0.5)
            R_max_opt = (R_max_overall - (w_beam * pile_spacing)) + (w_beam * s_opt)
            
            As_opt = (gamma_f * M_pos_opt / 1000.0) / (0.85 * d_eff * fyd) * 10000.0
            As_opt = max(As_min_beam, As_opt)
            
            vol_piles_opt = n_p_opt * (math.pi * (pile_diam / 2.0)**2) * pile_len
            steel_opt = (As_opt * 2.0 / 10000.0) * L_total * 7850.0 + vol_piles_opt * 85.0
            
            span_optimization.append({
                "span_m": s_opt,
                "num_piles": n_p_opt,
                "total_drilling_m": round(n_p_opt * pile_len, 1),
                "M_pos_max_kNm": round(M_pos_opt, 1),
                "M_neg_max_kNm": round(M_neg_opt, 1),
                "V_max_kN": round(V_opt, 1),
                "R_max_pile_kN": round(R_max_opt, 1),
                "R_max_pile_tf": round(R_max_opt / 9.81, 1),
                "As_inf_cm2": round(As_opt, 1),
                "steel_total_kg": round(steel_opt, 0),
                "is_current": abs(s_opt - pile_spacing) < 0.1
            })

        # 10. Sample Discrete Diagram Points for Frontend Canvas Plotting (60 points)
        envelope_points = []
        current_state_points = []
        step_sample = max(1, len(node_x) // 60)
        for idx in range(0, len(node_x), step_sample):
            envelope_points.append({
                "x": round(node_x[idx], 2),
                "M_pos": round(float(env_M_pos[idx]), 1),
                "M_neg": round(float(env_M_neg[idx]), 1),
                "V_pos": round(float(env_V_pos[idx]), 1),
                "V_neg": round(float(env_V_neg[idx]), 1)
            })
            current_state_points.append({
                "x": round(node_x[idx], 2),
                "w_mm": round(float(w_curr[idx]) * 1000.0, 2),
                "M": round(float(M_curr[idx]), 1),
                "V": round(float(V_curr[idx]), 1)
            })

        piles_report = []
        for idx, px in enumerate(pile_positions):
            piles_report.append({
                "id": idx + 1,
                "x": round(px, 2),
                "R_max_kN": round(max_pile_reaction[idx], 1),
                "R_max_tf": round(max_pile_reaction[idx] / 9.81, 1),
                "R_current_kN": round(float(R_curr[idx]), 1),
                "R_current_tf": round(float(R_curr[idx]) / 9.81, 1),
                "R_min_kN": round(min_pile_reaction[idx], 1),
                "settlement_mm": round((max_pile_reaction[idx] / K_z) * 1000.0, 2),
                "fs": round(pile_R_adm / max_pile_reaction[idx], 2) if max_pile_reaction[idx] > 0 else 999.0,
                "status": "APROVADO" if max_pile_reaction[idx] <= pile_R_adm else "SOBRECARGA"
            })

        # 11. Detailed Civil Earthwork & Structural Quantities Take-Off
        vol_beam_m3 = L_total * bw * h
        vol_piles_m3 = num_piles * (math.pi * (pile_diam / 2.0)**2) * pile_len
        vol_total_m3 = vol_beam_m3 + vol_piles_m3
        
        trench_overhang = 0.40 # m working space per side for formwork
        h_lean = 0.05          # 5 cm lean concrete bed
        excavation_piles_m3 = vol_piles_m3
        excavation_mechanized_m3 = (L_total + 2.0 * trench_overhang) * (bw + 2.0 * trench_overhang) * (h + h_lean)
        lean_concrete_m3 = L_total * (bw + 2.0 * 0.10) * h_lean
        concrete_structural_m3 = vol_total_m3
        backfill_m3 = max(0.0, excavation_mechanized_m3 - (vol_beam_m3 + lean_concrete_m3))
        disposal_m3 = excavation_piles_m3 + vol_beam_m3 + lean_concrete_m3
        formwork_beam_m2 = 2.0 * L_total * h + 2.0 * bw * h
        anchor_bolts_qty = 2 * (int(math.ceil(L_total / 0.60)) + 1)
        
        # Steel calculations:
        steel_inf_kg = (detail_inf["as_provided_cm2"] / 10000.0) * L_total * 7850.0 * 1.10
        steel_sup_kg = (detail_sup["as_provided_cm2"] / 10000.0) * L_total * 7850.0 * 1.10
        steel_skin_kg = (2 * n_skin_per_face * (math.pi/4.0) * (0.01**2)) * L_total * 7850.0 if needs_skin_rebar else 0.0
        steel_stirrups_kg = (asw_prov_cm2_m / 10000.0) * L_total * 7850.0 * 1.15
        steel_piles_kg = vol_piles_m3 * 85.0
        steel_total_beam_kg = steel_inf_kg + steel_sup_kg + steel_skin_kg + steel_stirrups_kg
        steel_total_kg = steel_total_beam_kg + steel_piles_kg
        steel_consumption_kg_m3 = steel_total_kg / vol_total_m3 if vol_total_m3 > 0 else 0.0
        
        c_conc = float(inputs.get('unit_cost_concrete', 550.0))    # R$/m³
        c_steel = float(inputs.get('unit_cost_steel', 12.50))      # R$/kg
        c_form = float(inputs.get('unit_cost_formwork', 85.0))     # R$/m²
        c_drill = float(inputs.get('unit_cost_drilling', 180.0))   # R$/m
        
        cost_concrete = vol_total_m3 * c_conc
        cost_steel = steel_total_kg * c_steel
        cost_formwork = formwork_beam_m2 * c_form
        cost_drilling = (num_piles * pile_len) * c_drill
        cost_total = cost_concrete + cost_steel + cost_formwork + cost_drilling
        cost_per_m_runway = cost_total / L_total if L_total > 0 else 0.0

        return {
            "success": True,
            "beam_geometry": {
                "L_total_m": round(L_total, 2),
                "bw_m": round(bw, 2),
                "h_m": round(h, 2),
                "d_eff_m": round(d_eff, 3),
                "pile_spacing_m": round(pile_spacing, 2),
                "cantilever_m": round(cantilever_left, 2),
                "self_weight_kN_m": round(w_beam, 1),
                "vol_beam_m3": round(vol_beam_m3, 2),
                "formwork_m2": round(formwork_beam_m2, 2)
            },
            "gantry_loading": {
                "gantry_load_tf": round(gantry_load_tf, 2),
                "phi_din": round(phi_din, 2),
                "total_P_kN": round(total_gantry_P_kN, 1),
                "num_wheels": num_wheels,
                "P_wheel_kN": round(P_wheel, 1),
                "wheel_spacing_m": round(wheel_spacing, 2),
                "H_braking_kN": round(H_braking_kN, 1),
                "H_transverse_kN": round(H_transverse_kN, 1),
                "T_sd_kNm": round(T_sd, 1)
            },
            "envelope_results": {
                "M_pos_max_kNm": round(M_pos_max, 1),
                "M_neg_max_kNm": round(M_neg_max, 1),
                "V_max_kN": round(V_max, 1),
                "R_max_pile_kN": round(R_max_overall, 1),
                "R_max_pile_tf": round(R_max_overall / 9.81, 1),
                "R_min_pile_kN": round(R_min_overall, 1),
                "governing_gantry_x": round(governing_gantry_pos, 2),
                "diagram_points": envelope_points,
                "current_state_points": current_state_points
            },
            "beam_design": {
                "Md_pos_kNm": round(Md_pos, 1),
                "As_inf_cm2": round(As_inf_final, 2),
                "detail_inf": detail_inf,
                "Md_neg_kNm": round(Md_neg, 1),
                "As_sup_cm2": round(As_sup_final, 2),
                "detail_sup": detail_sup,
                "skin_reinforcement": {
                    "required": needs_skin_rebar,
                    "as_face_cm2_m": round(As_skin_provided_face, 2),
                    "bars_per_face": n_skin_per_face,
                    "text": skin_rebar_text
                },
                "V_sd_kN": round(V_sd, 1),
                "VRd2_kN": round(VRd2_kN, 1),
                "status_strut": status_shear_strut,
                "stirrups": {
                    "text": f"Estribos Fechados Ø {phi_st:g} c/ {spacing_st_cm} cm (2 ramos)",
                    "asw_provided_cm2_m": round(asw_prov_cm2_m, 2),
                    "asw_required_cm2_m": round(Asw_s_final_cm2_m, 2)
                },
                "crack_width": {
                    "w_k_mm": round(w_k_mm, 3),
                    "limit_mm": 0.20,
                    "status": status_els
                }
            },
            "piles_check": {
                "num_piles": num_piles,
                "R_adm_kN": round(pile_R_adm, 1),
                "R_max_overall_kN": round(R_max_overall, 1),
                "fs_compression": round(fs_pile_comp, 2),
                "status_compression": status_pile_comp,
                "status_uplift": status_pile_uplift,
                "H_per_pile_kN": round(H_per_pile_kN, 1),
                "M_pile_head_kNm": round(M_pile_head_kNm, 1),
                "piles": piles_report
            },
            "quantities": {
                "excavation_piles_m3": round(excavation_piles_m3, 2),
                "excavation_mechanized_m3": round(excavation_mechanized_m3, 2),
                "backfill_m3": round(backfill_m3, 2),
                "disposal_m3": round(disposal_m3, 2),
                "concrete_structural_m3": round(concrete_structural_m3, 2),
                "concrete_beam_m3": round(vol_beam_m3, 2),
                "concrete_piles_m3": round(vol_piles_m3, 2),
                "concrete_lean_m3": round(lean_concrete_m3, 2),
                "vol_beam_m3": round(vol_beam_m3, 2),
                "vol_piles_m3": round(vol_piles_m3, 2),
                "total_concrete_m3": round(vol_total_m3, 2),
                "formwork_beam_m2": round(formwork_beam_m2, 2),
                "anchor_bolts_qty": anchor_bolts_qty,
                "drilling_piles_m": round(num_piles * pile_len, 1),
                "steel_inf_kg": round(steel_inf_kg, 0),
                "steel_sup_kg": round(steel_sup_kg, 0),
                "steel_skin_kg": round(steel_skin_kg, 0),
                "steel_stirrups_kg": round(steel_stirrups_kg, 0),
                "steel_beam_total_kg": round(steel_total_beam_kg, 0),
                "steel_piles_kg": round(steel_piles_kg, 0),
                "total_steel_kg": round(steel_total_kg, 0),
                "total_steel_ton": round(steel_total_kg / 1000.0, 2),
                "steel_consumption_kg_m3": round(steel_consumption_kg_m3, 1),
                "items_table": [
                    {"id": "01", "description": f"Escavação de tubulão/estaca Ø {int(pile_diam*100)} cm", "unit": "m³", "qty": round(excavation_piles_m3, 1)},
                    {"id": "02", "description": "Escavação mecanizada da vala da viga", "unit": "m³", "qty": round(excavation_mechanized_m3, 1)},
                    {"id": "03", "description": "Reaterro compactado em torno da viga", "unit": "m³", "qty": round(backfill_m3, 1)},
                    {"id": "04", "description": "Bota-fora de solo excedente / descarte", "unit": "m³", "qty": round(disposal_m3, 1)},
                    {"id": "05", "description": f"Concreto usinado fck {int(fck)} MPa (Viga + Estacas)", "unit": "m³", "qty": round(concrete_structural_m3, 1)},
                    {"id": "06", "description": "Concreto de regularização / magro fck 10 MPa (e=5 cm)", "unit": "m³", "qty": round(lean_concrete_m3, 1)},
                    {"id": "07", "description": "Formas de madeira / metálicas", "unit": "m²", "qty": round(formwork_beam_m2, 1)},
                    {"id": "08", "description": "Chumbador J24 / ASTM A36 para fixação do trilho TR-68", "unit": "un", "qty": anchor_bolts_qty},
                    {"id": "09", "description": "Aço CA-50 cortado e dobrado (Longitudinal, Pele e Estribos)", "unit": "kg", "qty": round(steel_total_kg, 0)}
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
                "cost_per_m_brl": round(cost_per_m_runway, 2)
            },
            "span_optimization": span_optimization
        }
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}
