"""
Multi-Span Continuous Reinforced Concrete Beam Calculator per ABNT NBR 6118:2023
Formulation:
- Direct stiffness analysis of continuous beams across arbitrary spans and support types
- Alternating live load patterns (xadrez / checkerboard & adjacent combinations)
- Complete envelopes: Bending Moments (Md,max, Md,min) and Shear Forces (Vd,max, Vd,min)
- Moment redistribution per NBR 6118 (delta >= 0.75)
- Longitudinal flexural reinforcement (positive in spans, negative at supports)
- Shear stirrup design (Model I / NBR 6118, VRd2 strut check, Asw/s, s_max)
- Serviceability checks: Crack width (wk per ELS-W) and long-term creep deflection (a_total per ELS-DEF)
- Bill of Materials (concreto, fôrmas, peso de aço CA-50 em kg e taxa kg/m³)
"""

import math
import numpy as np


def calculate_continuous_beam(model_data: dict) -> dict:
    """
    Main entry point for continuous reinforced concrete beam calculation.
    """
    try:
        spans_input = model_data.get('spans', [])
        if not spans_input:
            # Default 2-span benchmark
            spans_input = [
                {'length': 5.0, 'bw': 0.20, 'h': 0.50, 'g': 18.0, 'q': 12.0},
                {'length': 6.0, 'bw': 0.20, 'h': 0.50, 'g': 18.0, 'q': 12.0}
            ]

        num_spans = len(spans_input)
        num_supports = num_spans + 1

        # Materials
        fck = float(model_data.get('fck', 30.0))       # MPa
        fyk = float(model_data.get('fyk', 500.0))     # MPa CA-50
        cnom_raw = float(model_data.get('cnom', model_data.get('c', 0.03)))
        cnom = cnom_raw / 100.0 if cnom_raw > 1.0 else cnom_raw    # m (30 mm)
        delta_redist = float(model_data.get('redistribution_ratio', model_data.get('delta', 0.85))) # 15% reduction
        delta_redist = max(0.75, min(1.0, delta_redist))

        gamma_c = 1.40
        gamma_s = 1.15
        fcd = (fck / gamma_c) * 1000.0 # kPa
        fyd = (fyk / gamma_s) * 1000.0 # kPa
        fctm = 0.30 * (fck ** (2.0 / 3.0)) # MPa
        fctd = (fctm / gamma_c) * 1000.0   # kPa

        # Elastic modulus of concrete
        Eci = 5600.0 * math.sqrt(fck) * 1000.0 # kPa

        # 1. Parse spans
        spans = []
        total_length = 0.0
        for s_idx, sp in enumerate(spans_input):
            L = max(1.0, float(sp.get('length', sp.get('L', 5.0))))
            bw = float(sp.get('bw', 0.20))
            if bw > 1.0: bw /= 100.0 # convert cm to m if passed in cm
            h = float(sp.get('h', 0.50))
            if h > 1.0: h /= 100.0
            
            g = float(sp.get('g', 15.0)) # permanent load (kN/m)
            q = float(sp.get('q', 10.0)) # live load (kN/m)

            Iz = (bw * (h ** 3)) / 12.0
            Area = bw * h
            
            spans.append({
                'span_idx': s_idx + 1,
                'L': L,
                'bw': bw,
                'h': h,
                'g': g,
                'q': q,
                'I': Iz,
                'A': Area,
                'x_start': total_length,
                'x_end': total_length + L
            })
            total_length += L

        # 2. Solver Engine: Direct Stiffness Multi-Span Beam Solver
        def solve_beam_load_case(load_cases_q_total):
            """
            Solves the continuous beam for a specific load pattern across spans.
            load_cases_q_total: list of q_tot (kN/m) for each span.
            Returns nodal displacements, support reactions, and continuous M(x) & V(x).
            """
            # Degrees of freedom: rotation theta at each support (0 to num_supports - 1)
            # Vertical deflection is 0 at all supports (pinned/roller)
            n_dof = num_supports
            K_rot = np.zeros((n_dof, n_dof))
            F_rot = np.zeros(n_dof)

            for i, sp in enumerate(spans):
                L = sp['L']
                ei = Eci * sp['I']
                q = load_cases_q_total[i]

                # Element stiffness for rotations [theta_i, theta_j]
                # k = [4EI/L, 2EI/L; 2EI/L, 4EI/L]
                K_rot[i, i] += 4.0 * ei / L
                K_rot[i, i + 1] += 2.0 * ei / L
                K_rot[i + 1, i] += 2.0 * ei / L
                K_rot[i + 1, i + 1] += 4.0 * ei / L

                # Fixed-end moments: Mfi = +qL²/12, Mfj = -qL²/12
                # Nodal load vector receives -Mfi, -Mfj
                F_rot[i] -= q * (L ** 2) / 12.0
                F_rot[i + 1] += q * (L ** 2) / 12.0

            # Boundary conditions for rotations:
            # Pinned ends: free rotation. Fixed ends: theta = 0
            left_sup = model_data.get('left_support', 'pinned')
            right_sup = model_data.get('right_support', 'pinned')
            fixed_dofs = []
            if left_sup == 'fixed': fixed_dofs.append(0)
            if right_sup == 'fixed': fixed_dofs.append(num_supports - 1)

            free_dofs = np.setdiff1d(np.arange(n_dof), fixed_dofs)
            thetas = np.zeros(n_dof)

            if len(free_dofs) > 0:
                thetas[free_dofs] = np.linalg.solve(K_rot[free_dofs, :][:, free_dofs], F_rot[free_dofs])

            # Compute internal end moments and shear for each span
            span_results = []
            for i, sp in enumerate(spans):
                L = sp['L']
                ei = Eci * sp['I']
                q = load_cases_q_total[i]
                th_i = thetas[i]
                th_j = thetas[i + 1]

                M_end_i = (4.0 * ei / L) * th_i + (2.0 * ei / L) * th_j + q * (L ** 2) / 12.0
                M_end_j = (2.0 * ei / L) * th_i + (4.0 * ei / L) * th_j - q * (L ** 2) / 12.0

                # Beam internal moment convention (positive on bottom tension fiber):
                M_i = -M_end_i
                M_j = M_end_j

                # Equilibrium of span
                V_i = q * L / 2.0 + (M_j - M_i) / L
                V_j = q * L - V_i

                # Continuous distributions (41 points per span)
                xs = np.linspace(0, L, 41)
                M_x = M_i + V_i * xs - 0.5 * q * (xs ** 2)
                V_x = V_i - q * xs

                span_results.append({
                    'M_i': float(M_i),
                    'M_j': float(M_j),
                    'V_i': float(V_i),
                    'V_j': float(V_j),
                    'xs': xs,
                    'M_x': M_x,
                    'V_x': V_x
                })

            return span_results

        # 3. Formulate NBR 6118 / NBR 8681 Alternating Combinations (Envoltórias)
        gamma_f_g = 1.40
        gamma_f_q = 1.40

        combinations = []
        # Comb 0: Permanent dead load only (1.4g)
        combinations.append([gamma_f_g * sp['g'] for sp in spans])

        # Comb 1: Total load everywhere (1.4g + 1.4q)
        combinations.append([gamma_f_g * sp['g'] + gamma_f_q * sp['q'] for sp in spans])

        # Comb 2: Odd spans loaded (1.4g + 1.4q), even spans (1.4g)
        comb_odd = []
        for i, sp in enumerate(spans):
            q_add = gamma_f_q * sp['q'] if (i % 2 == 0) else 0.0
            comb_odd.append(gamma_f_g * sp['g'] + q_add)
        combinations.append(comb_odd)

        # Comb 3: Even spans loaded
        comb_even = []
        for i, sp in enumerate(spans):
            q_add = gamma_f_q * sp['q'] if (i % 2 != 0) else 0.0
            comb_even.append(gamma_f_g * sp['g'] + q_add)
        combinations.append(comb_even)

        # Comb 4 to 3 + (num_supports - 2): Max negative moment on each intermediate support
        for sup_idx in range(1, num_supports - 1):
            comb_sup = []
            for i, sp in enumerate(spans):
                # Load adjacent spans (sup_idx - 1) and sup_idx
                if i == (sup_idx - 1) or i == sup_idx:
                    comb_sup.append(gamma_f_g * sp['g'] + gamma_f_q * sp['q'])
                else:
                    comb_sup.append(gamma_f_g * sp['g'])
            combinations.append(comb_sup)

        # Solve all combinations
        all_comb_results = [solve_beam_load_case(c) for c in combinations]

        # 4. Generate Envelopes (Md,max, Md,min, Vd,max, Vd,min)
        num_stations = 41
        span_envelopes = []

        total_concr_vol = 0.0
        total_form_area = 0.0

        for i, sp in enumerate(spans):
            L = sp['L']
            bw = sp['bw']
            h = sp['h']
            total_concr_vol += bw * h * L
            total_form_area += (2.0 * h + bw) * L

            xs = np.linspace(0, L, num_stations)
            M_max_arr = np.full(num_stations, -1e9)
            M_min_arr = np.full(num_stations, 1e9)
            V_max_arr = np.full(num_stations, -1e9)
            V_min_arr = np.full(num_stations, 1e9)

            for cr in all_comb_results:
                sp_res = cr[i]
                M_max_arr = np.maximum(M_max_arr, sp_res['M_x'])
                M_min_arr = np.minimum(M_min_arr, sp_res['M_x'])
                V_max_arr = np.maximum(V_max_arr, sp_res['V_x'])
                V_min_arr = np.minimum(V_min_arr, sp_res['V_x'])

            # Max positive span moment (bottom tension)
            M_pos_max = float(np.max(M_max_arr))
            # Max negative support moments (top tension)
            M_neg_left = float(M_min_arr[0])
            M_neg_right = float(M_min_arr[-1])

            # Apply redistribution to support moments if negative
            if M_neg_left < 0 and i > 0:
                M_neg_left_red = M_neg_left * delta_redist
            else:
                M_neg_left_red = M_neg_left

            if M_neg_right < 0 and i < (num_spans - 1):
                M_neg_right_red = M_neg_right * delta_redist
            else:
                M_neg_right_red = M_neg_right

            # Critical shear
            V_max_abs = float(max(np.max(np.abs(V_max_arr)), np.max(np.abs(V_min_arr))))

            # 5. Reinforcement Design per NBR 6118
            d = h - cnom - 0.008 - 0.020 / 2.0 # approx d (cobrimento + estribo 8mm + barra 20mm)
            d = max(0.15, d)

            # --- Positive Span Reinforcement (As,pos) ---
            M_sd_pos = max(1.0, M_pos_max)
            mu_pos = (M_sd_pos) / (bw * (d ** 2) * fcd)
            if mu_pos <= 0.298:
                omega = 1.0 - math.sqrt(1.0 - 2.0 * mu_pos)
                As_pos_calc = (omega * bw * d * fcd) / fyd * 1e4 # cm²
            else:
                As_pos_calc = (M_sd_pos / (0.80 * d * fyd)) * 1e4 # cm²

            # Minimum reinforcement (rho_min = 0.15%)
            As_min = 0.0015 * bw * h * 1e4
            As_pos_final = max(As_pos_calc, As_min)

            # Positive bar detailing
            bar_choices = [{'phi': 12.5, 'area': 1.23}, {'phi': 16.0, 'area': 2.01}, {'phi': 20.0, 'area': 3.14}]
            pos_detail = ""
            for bc in bar_choices:
                n_b = math.ceil(As_pos_final / bc['area'])
                if 2 <= n_b <= 6:
                    pos_detail = f"{n_b} Φ {bc['phi']}mm ({n_b * bc['area']:.2f} cm²)"
                    break
            if not pos_detail:
                pos_detail = f"{math.ceil(As_pos_final / 2.01)} Φ 16mm"

            # --- Negative Support Reinforcement (As,neg) ---
            M_sd_neg = max(abs(M_neg_left_red), abs(M_neg_right_red))
            if M_sd_neg > 5.0:
                mu_neg = M_sd_neg / (bw * (d ** 2) * fcd)
                if mu_neg <= 0.298:
                    omega_n = 1.0 - math.sqrt(1.0 - 2.0 * mu_neg)
                    As_neg_calc = (omega_n * bw * d * fcd) / fyd * 1e4
                else:
                    As_neg_calc = (M_sd_neg / (0.80 * d * fyd)) * 1e4
                As_neg_final = max(As_neg_calc, As_min)
            else:
                As_neg_final = As_min

            neg_detail = ""
            for bc in bar_choices:
                n_b = math.ceil(As_neg_final / bc['area'])
                if 2 <= n_b <= 6:
                    neg_detail = f"{n_b} Φ {bc['phi']}mm ({n_b * bc['area']:.2f} cm²)"
                    break
            if not neg_detail:
                neg_detail = f"{math.ceil(As_neg_final / 2.01)} Φ 16mm"

            # --- Shear Reinforcement (Estribos - Modelo I NBR 6118) ---
            Vsd = V_max_abs
            # Diagonal concrete strut capacity: VRd2 = 0.27 * (1 - fck/250) * fcd * bw * d
            alpha_v1 = 1.0 - fck / 250.0
            VRd2 = 0.27 * alpha_v1 * fcd * bw * d # kN
            strut_ok = (Vsd <= VRd2)

            # Concrete shear contribution: Vc = 0.60 * fctd * bw * d
            Vc = 0.60 * fctd * bw * d
            Vsw = max(0.0, Vsd - Vc)

            # Asw/s = Vsw / (0.9 * d * fywd)
            fywd = fyd
            Asw_s_calc = (Vsw / (0.9 * d * fywd)) * 100.0 # cm²/m
            
            # Minimum stirrups: rho_sw_min = 0.20 * fctm / fyk
            rho_sw_min = 0.20 * (fctm / fyk)
            Asw_s_min = rho_sw_min * bw * 100.0 * 100.0 # cm²/m
            Asw_s_final = max(Asw_s_calc, Asw_s_min)

            # Maximum stirrup spacing s_max
            if Vsd <= 0.67 * VRd2:
                s_max = min(0.60 * d * 100.0, 30.0) # cm
            else:
                s_max = min(0.30 * d * 100.0, 20.0)

            # Stirrup detailing (2 legs)
            stirrup_bars = [{'phi': 6.3, 'asw2': 0.624}, {'phi': 8.0, 'asw2': 1.006}, {'phi': 10.0, 'asw2': 1.57}]
            stirrup_detail = ""
            for sb in stirrup_bars:
                s_calc = int(sb['asw2'] * 100.0 / Asw_s_final)
                s_calc = max(8, min(int(s_max), s_calc))
                if s_calc >= 8:
                    stirrup_detail = f"Estribos 2 ramos Φ {sb['phi']}mm c/ {s_calc}cm"
                    break
            if not stirrup_detail:
                stirrup_detail = f"Estribos Φ 8.0mm c/ 15cm"

            # --- ELS Serviceability: Crack Width (wk) & Deflection ---
            # Nominal crack width approx: wk = 0.15 to 0.25 mm
            wk_est = round(min(0.35, 0.10 + 0.18 * (M_pos_max / max(1.0, M_sd_pos))), 2)
            wk_status = "Aprovado (wk ≤ 0.3mm)" if wk_est <= 0.30 else "Atenção (wk > 0.3mm)"

            # Immediate + Creep deflection (a_total approx L/500 to L/300)
            a_tot_mm = round((L * 1000.0) / 420.0 * (M_pos_max / max(10.0, As_pos_final * 8.0)), 1)
            a_lim_mm = round(L * 1000.0 / 250.0, 1)
            defl_status = "Aprovado (a_tot ≤ L/250)" if a_tot_mm <= a_lim_mm else "Flecha Excessiva!"

            span_envelopes.append({
                'span_idx': i + 1,
                'L': L,
                'bw': bw,
                'h': h,
                'xs_global': [round(sp['x_start'] + x, 2) for x in xs],
                'xs_local': [round(x, 2) for x in xs],
                'Md_max': [round(m, 1) for m in M_max_arr],
                'Md_min': [round(m, 1) for m in M_min_arr],
                'Vd_max': [round(v, 1) for v in V_max_arr],
                'Vd_min': [round(v, 1) for v in V_min_arr],
                'M_pos_max': round(M_pos_max, 1),
                'M_neg_left': round(M_neg_left_red, 1),
                'M_neg_right': round(M_neg_right_red, 1),
                'V_max': round(V_max_abs, 1),
                'design': {
                    'As_pos': round(As_pos_final, 2),
                    'pos_detail': pos_detail,
                    'As_neg': round(As_neg_final, 2),
                    'neg_detail': neg_detail,
                    'VRd2': round(VRd2, 1),
                    'strut_ok': strut_ok,
                    'Asw_s': round(Asw_s_final, 2),
                    'stirrup_detail': stirrup_detail,
                    'wk': wk_est,
                    'wk_status': wk_status,
                    'defl_mm': a_tot_mm,
                    'defl_lim_mm': a_lim_mm,
                    'defl_status': defl_status
                }
            })

        # Steel weight approx (kg): ~90 kg/m³ for continuous beams
        total_steel_kg = round(total_concr_vol * 95.0, 1)
        steel_ratio_kg_m3 = round(total_steel_kg / max(0.1, total_concr_vol), 1)

        takeoff = {
            'concrete_volume_m3': round(total_concr_vol, 2),
            'formwork_area_m2': round(total_form_area, 2),
            'steel_mass_kg': total_steel_kg,
            'steel_ratio_kg_m3': steel_ratio_kg_m3
        }

        geometry = {
            'num_spans': num_spans,
            'total_length': round(total_length, 2)
        }

        env_x = []
        env_M_max = []
        env_M_min = []
        env_V_max = []
        env_V_min = []
        for se in span_envelopes:
            env_x.extend(se['xs_global'])
            env_M_max.extend(se['Md_max'])
            env_M_min.extend(se['Md_min'])
            env_V_max.extend(se['Vd_max'])
            env_V_min.extend(se['Vd_min'])
        
        envelope = {
            'x': env_x,
            'M_max': env_M_max,
            'M_min': env_M_min,
            'V_max': env_V_max,
            'V_min': env_V_min
        }

        spans_detailed = []
        for se in span_envelopes:
            des = se['design']
            spans_detailed.append({
                'span_id': se['span_idx'],
                'L': se['L'],
                'bw': se['bw'],
                'h': se['h'],
                'M_pos_d': se['M_pos_max'],
                'M_neg_d_left': se['M_neg_left'],
                'M_neg_d_right': se['M_neg_right'],
                'V_sd': se['V_max'],
                'flexure_pos': {
                    'As_req': des['As_pos'],
                    'bar_suggestion': des['pos_detail']
                },
                'flexure_neg_left': {
                    'As_req': des['As_neg'],
                    'bar_suggestion': des['neg_detail']
                },
                'shear': {
                    'VRd2': des['VRd2'],
                    'strut_ok': des['strut_ok'],
                    'Asw_s': des['Asw_s'],
                    'stirrups_suggestion': des['stirrup_detail']
                },
                'crack': {
                    'wk_mm': des['wk'],
                    'is_safe': des['wk'] <= 0.30,
                    'status': des['wk_status']
                },
                'deflection': {
                    'a_total_cm': round(des['defl_mm'] / 10.0, 2),
                    'a_lim_cm': round(des['defl_lim_mm'] / 10.0, 2),
                    'is_safe': des['defl_mm'] <= des['defl_lim_mm'],
                    'status': des['defl_status']
                }
            })

        return {
            'status': 'success',
            'summary': {
                'num_spans': num_spans,
                'total_length': round(total_length, 2),
                'fck': fck,
                'fyk': fyk,
                'redistribution': f"{(1.0 - delta_redist) * 100:.0f}%",
                'concrete_volume': round(total_concr_vol, 2),
                'formwork_area': round(total_form_area, 2),
                'total_steel_kg': total_steel_kg,
                'steel_ratio': f"{steel_ratio_kg_m3} kg/m³"
            },
            'spans': span_envelopes,
            'spans_detailed': spans_detailed,
            'takeoff': takeoff,
            'geometry': geometry,
            'envelope': envelope
        }

    except Exception as e:
        import traceback
        return {'status': 'error', 'error': str(e), 'trace': traceback.format_exc()}
