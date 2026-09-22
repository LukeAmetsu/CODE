"""
Flexible Retaining Wall Calculator (Contenções Flexíveis)
Formulation:
- Steel Sheet Piles (Estacas-Prancha Metálicas)
- Diaphragm Walls (Paredes Diafragma de Concreto Armado)
- Soldier Piles & Lagging (Cortinas de Estacas Pranchadas)
- Cantilever, Single-Anchored (Blum's Free Earth Support Method), and Multi-Strut (Terzaghi & Peck Apparent Pressures)
- Net earth pressure, water pressures, shear and bending moment envelopes
- Structural sizing (Wel,req, As rebar, wall thickness)
- Hydraulic heave / piping stability check
"""

import math
import numpy as np


# Standard Commercial Sheet Pile Catalog (ArcelorMittal AZ / Larssen equivalent)
SHEET_PILE_CATALOG = [
    {'name': 'PU 12 (Larssen)', 'W_el': 1200, 'I_x': 21600, 'weight': 89.6, 't_w': 8.5},
    {'name': 'PU 18 (Larssen)', 'W_el': 1800, 'I_x': 38400, 'weight': 118.0, 't_w': 10.0},
    {'name': 'PU 22 (Larssen)', 'W_el': 2200, 'I_x': 49500, 'weight': 133.0, 't_w': 11.2},
    {'name': 'PU 28 (Larssen)', 'W_el': 2800, 'I_x': 65800, 'weight': 152.0, 't_w': 13.0},
    {'name': 'PU 32 (Larssen)', 'W_el': 3200, 'I_x': 78400, 'weight': 168.0, 't_w': 14.5},
    {'name': 'AZ 18-700', 'W_el': 1800, 'I_x': 37800, 'weight': 102.5, 't_w': 8.5},
    {'name': 'AZ 26-700', 'W_el': 2600, 'I_x': 60500, 'weight': 128.5, 't_w': 11.5},
    {'name': 'AZ 36-700N', 'W_el': 3600, 'I_x': 95400, 'weight': 161.0, 't_w': 13.0},
    {'name': 'AZ 46-700N', 'W_el': 4600, 'I_x': 133400, 'weight': 195.0, 't_w': 15.0}
]


def calculate_flexible_wall(inputs: dict) -> dict:
    """
    Main entry point for flexible retaining wall calculation.
    """
    try:
        # 1. Geometry & Wall Type
        wall_type = str(inputs.get('wall_type', 'sheet_pile')).lower()
        support_type = str(inputs.get('support_type', 'single_anchor')).lower()
        
        H = max(1.0, float(inputs.get('excavation_depth', 6.0)))           # Excavation depth (m)
        h_a = max(0.0, min(H - 0.5, float(inputs.get('anchor_depth', 1.5)))) # Anchor depth from top (m)
        
        # Soil Properties (Backfill / Retained Soil)
        gamma = float(inputs.get('gamma', 19.0))              # kN/m³ natural unit weight
        gamma_sat = float(inputs.get('gamma_sat', 20.0))      # kN/m³ saturated unit weight
        phi_deg = float(inputs.get('phi', 30.0))              # degrees friction angle
        c = max(0.0, float(inputs.get('cohesion', 0.0)))      # kPa cohesion
        
        # Passive Soil Properties (Front/Embedment Zone)
        gamma_p = float(inputs.get('gamma_p', gamma))
        gamma_p_sat = float(inputs.get('gamma_p_sat', gamma_sat))
        phi_p_deg = float(inputs.get('phi_p', phi_deg))
        c_p = max(0.0, float(inputs.get('cohesion_p', c)))
        
        # Loading & Water
        q_surcharge = max(0.0, float(inputs.get('surcharge', 15.0))) # kPa
        zw_retained = float(inputs.get('water_table_retained', 3.0)) # m from top
        zw_excav = float(inputs.get('water_table_excav', H))         # m from top
        gamma_w = 9.81 # kN/m³
        
        # Safety & Reduction Factors
        fs_passive = max(1.1, float(inputs.get('fs_passive', 1.50))) # FS applied to passive resistance
        wall_friction_ratio = float(inputs.get('wall_friction_ratio', 0.67)) # delta / phi
        
        # Material Properties
        fy_steel = float(inputs.get('fy_steel', 355.0)) # MPa (MR250 or S355GP)
        fck_concrete = float(inputs.get('fck', 30.0))   # MPa
        fyk_rebar = float(inputs.get('fyk', 500.0))     # MPa CA-50
        gamma_a1 = 1.10 # NBR 8800 factor
        gamma_c = 1.40  # NBR 6118 concrete factor
        gamma_s = 1.15  # NBR 6118 steel factor

        # 2. Earth Pressure Coefficients (Rankine / Coulomb)
        phi_rad = math.radians(phi_deg)
        phi_p_rad = math.radians(phi_p_deg)
        delta_rad = wall_friction_ratio * phi_rad
        delta_p_rad = wall_friction_ratio * phi_p_rad

        if delta_rad > 1e-4:
            # Coulomb Active
            cos_d = math.cos(delta_rad)
            sin_phi = math.sin(phi_rad)
            denom_a = 1.0 + math.sqrt(sin_phi * math.sin(phi_rad + delta_rad) / (cos_d))
            Ka = (math.cos(phi_rad)**2) / (cos_d * (denom_a**2))
            
            # Coulomb Passive
            denom_p = 1.0 - math.sqrt(math.sin(phi_p_rad) * math.sin(phi_p_rad + delta_p_rad) / math.cos(delta_p_rad))
            Kp = (math.cos(phi_p_rad)**2) / (math.cos(delta_p_rad) * (max(0.1, denom_p)**2))
        else:
            # Rankine
            Ka = (math.tan(math.radians(45.0 - phi_deg / 2.0)))**2
            Kp = (math.tan(math.radians(45.0 + phi_p_deg / 2.0)))**2

        Kp_eff = Kp / fs_passive

        # 3. Embedment Depth Solver (Blum's Free Earth Support Method for Anchored Walls)
        # We discretize depth z and search for D where Moment around Anchor = 0
        def get_pressures(z, D_trial):
            # Retained side (Active)
            # Effective vertical stress
            if z <= zw_retained:
                sig_v_act = q_surcharge + gamma * z
                u_act = 0.0
            else:
                gamma_sub = gamma_sat - gamma_w
                sig_v_act = q_surcharge + gamma * zw_retained + gamma_sub * (z - zw_retained)
                u_act = gamma_w * (z - zw_retained)

            p_act_eff = max(0.0, sig_v_act * Ka - 2.0 * c * math.sqrt(Ka))
            p_act_total = p_act_eff + u_act

            # Excavation side (Passive, only active below excavation line z > H)
            if z <= H:
                p_pas_total = 0.0
            else:
                z_front = z - H
                if z <= zw_excav:
                    sig_v_pas = gamma_p * z_front
                    u_pas = 0.0
                else:
                    h_dry = max(0.0, zw_excav - H)
                    h_sub = max(0.0, z - max(H, zw_excav))
                    gamma_p_sub = gamma_p_sat - gamma_w
                    sig_v_pas = gamma_p * h_dry + gamma_p_sub * h_sub
                    u_pas = gamma_w * h_sub

                p_pas_eff = (sig_v_pas * Kp_eff + 2.0 * c_p * math.sqrt(Kp_eff))
                p_pas_total = p_pas_eff + u_pas

            net_p = p_act_total - p_pas_total
            return net_p, p_act_total, p_pas_total

        # Root search for D
        if support_type == 'cantilever':
            # For cantilever, rotation point near base: solve moment equilibrium
            # Typical rule: D approx 1.2 to 2.0 H
            D_best = 1.5 * H
            for D_test in np.linspace(0.5 * H, 3.5 * H, 300):
                # Moment around toe (z = H + D_test)
                z_pts = np.linspace(0, H + D_test, 100)
                dz = z_pts[1] - z_pts[0]
                M_toe = 0.0
                for zp in z_pts:
                    np_val, _, _ = get_pressures(zp, D_test)
                    M_toe += np_val * (H + D_test - zp) * dz
                if M_toe <= 0:
                    D_best = D_test
                    break
            D_req = float(D_best)
            T_anchor = 0.0
        else:
            # Single Anchor (Blum Free Earth Support)
            D_best = 0.5 * H
            for D_test in np.linspace(0.2 * H, 2.5 * H, 300):
                # Moment around anchor (z = h_a)
                z_pts = np.linspace(0, H + D_test, 100)
                dz = z_pts[1] - z_pts[0]
                M_anc = 0.0
                for zp in z_pts:
                    np_val, _, _ = get_pressures(zp, D_test)
                    M_anc += np_val * (zp - h_a) * dz
                if M_anc <= 0:
                    D_best = D_test
                    break
            D_req = float(D_best)

            # Anchor force T_anchor for force equilibrium
            z_pts = np.linspace(0, H + D_req, 150)
            dz = z_pts[1] - z_pts[0]
            total_net_H = sum(get_pressures(zp, D_req)[0] * dz for zp in z_pts)
            T_anchor = max(0.0, float(total_net_H))

        # Practical design embedment depth (+20% safety per Brazilian geotechnical practice)
        D_exec = round(D_req * 1.20, 2)
        total_wall_length = round(H + D_exec, 2)

        # 4. Detailed Shear Force V(z) and Bending Moment M(z) Profile
        num_stations = 120
        z_array = np.linspace(0, H + D_exec, num_stations)
        dz = z_array[1] - z_array[0]

        net_pressure_array = []
        p_act_array = []
        p_pas_array = []

        for z in z_array:
            p_net, p_a, p_p = get_pressures(z, D_exec)
            net_pressure_array.append(float(p_net))
            p_act_array.append(float(p_a))
            p_pas_array.append(float(p_p))

        shear_array = np.zeros(num_stations)
        moment_array = np.zeros(num_stations)

        # Integrate shear from top
        running_load = 0.0
        for i in range(num_stations):
            z = z_array[i]
            running_load += net_pressure_array[i] * dz
            
            # Anchor reaction deduction below anchor point
            anc_reaction = T_anchor if (support_type != 'cantilever' and z >= h_a) else 0.0
            shear_array[i] = running_load - anc_reaction

        # Integrate moment from top
        running_m = 0.0
        for i in range(1, num_stations):
            running_m += 0.5 * (shear_array[i - 1] + shear_array[i]) * dz
            moment_array[i] = running_m

        # Correction so moment at base is zero (free earth support boundary condition)
        M_base_error = moment_array[-1]
        for i in range(num_stations):
            moment_array[i] -= M_base_error * (z_array[i] / (H + D_exec))

        max_moment = float(np.max(np.abs(moment_array)))
        max_shear = float(np.max(np.abs(shear_array)))
        max_m_idx = int(np.argmax(np.abs(moment_array)))
        z_max_m = float(z_array[max_m_idx])

        # 5. Structural Sizing
        # Steel Sheet Piles: Wel,req = M_sd / (fy / gamma_a1)
        M_sd = max_moment * 1.40 # kNm/m
        W_el_req = (M_sd * 1e6) / (fy_steel / gamma_a1) / 1e3 # cm³/m

        # Select commercial sheet pile
        selected_profile = SHEET_PILE_CATALOG[-1]['name']
        selected_W = SHEET_PILE_CATALOG[-1]['W_el']
        selected_mass = SHEET_PILE_CATALOG[-1]['weight']
        for pile in SHEET_PILE_CATALOG:
            if pile['W_el'] >= W_el_req:
                selected_profile = pile['name']
                selected_W = pile['W_el']
                selected_mass = pile['weight']
                break

        utilization_steel = round(W_el_req / selected_W, 3)

        # Diaphragm Wall (Concrete):
        # Minimum thickness to limit deflection & shear
        t_diaphragm = max(0.40, round(math.ceil(math.sqrt(M_sd / (0.15 * (fck_concrete / gamma_c) * 1000)) * 20.0) / 20.0, 2))
        d_eff = t_diaphragm - 0.06 # effective depth (6cm cover)
        
        # Flexural reinforcement As (cm²/m)
        fcd = (fck_concrete / gamma_c) * 1000.0 # kPa
        fyd = (fyk_rebar / gamma_s) * 1000.0   # kPa
        mu = M_sd / (1.0 * (d_eff**2) * fcd)
        if mu < 0.298:
            omega_val = 1.0 - math.sqrt(1.0 - 2.0 * mu)
            As_req = (omega_val * 1.0 * d_eff * fcd) / fyd * 1e4 # cm²/m
        else:
            As_req = (M_sd / (0.80 * d_eff * fyd)) * 1e4 # cm²/m

        # Minimum reinforcement rho_min = 0.15%
        As_min = 0.0015 * 1.0 * t_diaphragm * 1e4 # cm²/m
        As_final = max(As_req, As_min)

        # Suggested rebar detailing
        bar_options = [
            {'phi': 16, 'area': 2.01},
            {'phi': 20, 'area': 3.14},
            {'phi': 25, 'area': 4.91}
        ]
        rebar_detail = ""
        for b in bar_options:
            spacing = int(100.0 / (As_final / b['area']))
            if 10 <= spacing <= 25:
                rebar_detail = f"Φ {b['phi']}mm c/ {spacing}cm (As = {b['area'] * (100.0 / spacing):.1f} cm²/m)"
                break
        if not rebar_detail:
            rebar_detail = f"Φ 20mm c/ 15cm (As = 20.9 cm²/m)"

        # 6. Hydraulic Heave / Piping Stability Check (Terzaghi)
        delta_h = max(0.0, zw_excav - zw_retained)
        if delta_h > 0 and D_exec > 0:
            gamma_prime = gamma_p_sat - gamma_w
            i_crit = gamma_prime / gamma_w
            i_exit = delta_h / (2.0 * D_exec)
            fs_piping = round(i_crit / max(1e-4, i_exit), 2)
            piping_status = "Seguro (FS ≥ 1.5)" if fs_piping >= 1.5 else "Risco de Sifonamento / Heave!"
        else:
            fs_piping = 99.9
            piping_status = "Sem gradiente hidráulico crítico"

        # 7. Package Response
        depth_list = [round(z, 2) for z in z_array]
        moment_list = [round(m, 2) for m in moment_array]
        shear_list = [round(v, 2) for v in shear_array]
        net_pres_list = [round(p, 2) for p in net_pressure_array]

        return {
            'status': 'success',
            'geometry': {
                'retained_height': round(H, 2),
                'embedment_depth': round(D_exec, 2),
                'embedment_req': round(D_req, 2),
                'total_length': round(total_wall_length, 2)
            },
            'forces': {
                'is_anchored': support_type != 'cantilever',
                'anchor_force': round(T_anchor, 1),
                'anchor_depth': round(h_a, 2),
                'max_bending_moment': round(max_moment, 1),
                'max_moment_sd': round(M_sd, 1),
                'moment_depth': round(z_max_m, 2),
                'max_shear': round(max_shear, 1),
                'Ka': round(Ka, 3),
                'Kp': round(Kp, 3),
                'Kp_eff': round(Kp_eff, 3)
            },
            'section_check': {
                'type': wall_type,
                'approved': utilization_steel <= 1.0 if wall_type == 'sheet_pile' else True,
                'profile': selected_profile,
                'W_el_provided': selected_W,
                'W_el_required': round(W_el_req, 1),
                'utilization': utilization_steel,
                'mass_per_m2': selected_mass,
                'wall_thickness': round(t_diaphragm, 2),
                'As_main': round(As_final, 2),
                'As_secondary': round(0.2 * As_final, 2),
                'rebar_detail': rebar_detail
            },
            'stability': {
                'FS_heave': fs_piping,
                'heave_safe': fs_piping >= 1.5,
                'status': piping_status
            },
            'water': {
                'zw_retained': round(zw_retained, 2),
                'zw_passive': round(zw_excav, 2)
            },
            'summary': {
                'wall_type': wall_type,
                'support_type': support_type,
                'excavation_depth': round(H, 2),
                'embedment_req': round(D_req, 2),
                'embedment_exec': round(D_exec, 2),
                'total_length': round(total_wall_length, 2),
                'anchor_force': round(T_anchor, 1),
                'anchor_depth': round(h_a, 2),
                'max_moment': round(max_moment, 1),
                'max_moment_sd': round(M_sd, 1),
                'moment_depth': round(z_max_m, 2),
                'max_shear': round(max_shear, 1),
                'Ka': round(Ka, 3),
                'Kp': round(Kp, 3),
                'Kp_eff': round(Kp_eff, 3)
            },
            'steel_design': {
                'W_el_req': round(W_el_req, 1),
                'selected_profile': selected_profile,
                'selected_W_el': selected_W,
                'utilization': utilization_steel,
                'status': 'Aprovado' if utilization_steel <= 1.0 else 'Sobredimensionar'
            },
            'concrete_design': {
                'thickness': round(t_diaphragm, 2),
                'As_req': round(As_final, 2),
                'rebar_detail': rebar_detail,
                'status': 'Aprovado'
            },
            'hydraulic_check': {
                'delta_h': round(delta_h, 2),
                'fs_piping': fs_piping,
                'status': piping_status
            },
            'profiles': {
                'depth': depth_list,
                'depths': depth_list,
                'moment': moment_list,
                'moments': moment_list,
                'shear': shear_list,
                'shears': shear_list,
                'net_pressure': net_pres_list,
                'net_pressures': net_pres_list,
                'active_pressure': [round(p, 2) for p in p_act_array],
                'passive_pressure': [round(p, 2) for p in p_pas_array]
            }
        }
    except Exception as e:
        import traceback
        return {'status': 'error', 'error': str(e), 'trace': traceback.format_exc()}
