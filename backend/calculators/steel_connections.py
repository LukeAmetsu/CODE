"""
Unified Structural Steel Connections Engine
Standards Supported:
1. ABNT NBR 8800:2008 / NBR 8800:2024 & CBCA Manuals
2. AISC 360-16 / AISC 360-22 (LRFD & ASD)

Covers 5 Core Typologies:
1. Flexible End Plate (Chapa de Topo Simples / Flexível)
2. Double Angle Web Cleats (Dupla Cantoneira de Alma - 2L)
3. Shear Tab / Single Plate (Chapa Simples de Alma)
4. Extended End Plate Moment Connection (Chapa de Topo Estendida de Momento)
5. Column Base Plate (Placa de Base com Chumbadores)
"""

import math


# Standard Metric & Imperial Structural Bolts (diameters in mm, areas in cm²)
BOLT_DATABASE = {
    'M12': {'d_b': 12.0, 'A_b': 1.13, 'A_res': 0.843, 'hole_nbr': 13.5, 'hole_aisc': 14.0, 'emin_nbr': 20.0, 'emin_aisc': 19.0},
    'M16': {'d_b': 16.0, 'A_b': 2.01, 'A_res': 1.57,  'hole_nbr': 17.5, 'hole_aisc': 18.0, 'emin_nbr': 25.0, 'emin_aisc': 22.0},
    'M20': {'d_b': 20.0, 'A_b': 3.14, 'A_res': 2.45,  'hole_nbr': 22.0, 'hole_aisc': 22.0, 'emin_nbr': 30.0, 'emin_aisc': 27.0},
    'M22': {'d_b': 22.0, 'A_b': 3.80, 'A_res': 3.03,  'hole_nbr': 24.0, 'hole_aisc': 24.0, 'emin_nbr': 35.0, 'emin_aisc': 29.0},
    'M24': {'d_b': 24.0, 'A_b': 4.52, 'A_res': 3.53,  'hole_nbr': 26.0, 'hole_aisc': 27.0, 'emin_nbr': 40.0, 'emin_aisc': 32.0},
    'M27': {'d_b': 27.0, 'A_b': 5.73, 'A_res': 4.59,  'hole_nbr': 30.0, 'hole_aisc': 30.0, 'emin_nbr': 45.0, 'emin_aisc': 38.0},
    'M30': {'d_b': 30.0, 'A_b': 7.07, 'A_res': 5.61,  'hole_nbr': 33.0, 'hole_aisc': 33.0, 'emin_nbr': 50.0, 'emin_aisc': 38.0},
    '1/2"': {'d_b': 12.7, 'A_b': 1.27, 'A_res': 0.92, 'hole_nbr': 14.5, 'hole_aisc': 14.3, 'emin_nbr': 22.0, 'emin_aisc': 19.0},
    '5/8"': {'d_b': 15.9, 'A_b': 1.98, 'A_res': 1.46, 'hole_nbr': 17.5, 'hole_aisc': 17.5, 'emin_nbr': 25.0, 'emin_aisc': 22.0},
    '3/4"': {'d_b': 19.05,'A_b': 2.85, 'A_res': 2.16, 'hole_nbr': 21.0, 'hole_aisc': 20.6, 'emin_nbr': 32.0, 'emin_aisc': 25.4},
    '7/8"': {'d_b': 22.2, 'A_b': 3.88, 'A_res': 2.98, 'hole_nbr': 24.0, 'hole_aisc': 23.8, 'emin_nbr': 38.0, 'emin_aisc': 28.6},
    '1"':   {'d_b': 25.4, 'A_b': 5.07, 'A_res': 3.91, 'hole_nbr': 27.0, 'hole_aisc': 27.0, 'emin_nbr': 45.0, 'emin_aisc': 31.8}
}

# Bolt Grades: Ultimate tensile fub (MPa) and nominal shear/tension for AISC (MPa)
BOLT_GRADES = {
    'ASTM A325': {'f_ub': 825.0, 'f_yb': 635.0, 'F_nv_aisc': 372.0, 'F_nt_aisc': 620.0},
    'ASTM A490': {'f_ub': 1035.0, 'f_yb': 895.0, 'F_nv_aisc': 469.0, 'F_nt_aisc': 779.0},
    'ISO 8.8':   {'f_ub': 800.0, 'f_yb': 640.0, 'F_nv_aisc': 360.0, 'F_nt_aisc': 600.0},
    'ISO 10.9':  {'f_ub': 1000.0, 'f_yb': 900.0, 'F_nv_aisc': 450.0, 'F_nt_aisc': 750.0},
    'ASTM A307': {'f_ub': 415.0, 'f_yb': 250.0, 'F_nv_aisc': 186.0, 'F_nt_aisc': 310.0}
}

# Structural Steel Grades (MPa)
STEEL_GRADES = {
    'ASTM A36':       {'f_y': 250.0, 'f_u': 400.0},
    'ASTM A572 Gr50': {'f_y': 345.0, 'f_u': 450.0},
    'USI CIVIL 300':  {'f_y': 300.0, 'f_u': 415.0},
    'USI CIVIL 350':  {'f_y': 350.0, 'f_u': 485.0}
}


def calculate_steel_connection(inputs: dict) -> dict:
    """
    Main unified calculator for Structural Steel Connections.
    Adapts verification formulas, safety factors, and geometric limits
    to ABNT NBR 8800 (CBCA) or AISC 360-22 (LRFD / ASD).
    """
    try:
        conn_type = str(inputs.get('type', 'flexible_end_plate')).lower()

        # Identify standard & method
        std_raw = str(inputs.get('standard', inputs.get('design_standard', 'NBR'))).strip().upper()
        method_raw = str(inputs.get('method', inputs.get('design_method', 'LRFD'))).strip().upper()

        is_nbr = ('NBR' in std_raw) or ('8800' in std_raw) or ('CBCA' in std_raw)
        is_asd = (not is_nbr) and ('ASD' in method_raw or 'ASD' in std_raw)

        if is_nbr:
            std_label = 'ABNT NBR 8800 (CBCA)'
            std_code = 'NBR 8800'
        elif is_asd:
            std_label = 'AISC 360-22 (ASD)'
            std_code = 'AISC 360 ASD'
        else:
            std_label = 'AISC 360-22 (LRFD)'
            std_code = 'AISC 360 LRFD'

        # Materials
        steel_name = inputs.get('steel_grade', 'ASTM A572 Gr50')
        steel_mat = STEEL_GRADES.get(steel_name, STEEL_GRADES['ASTM A572 Gr50'])
        fy_plate = float(inputs.get('fy_plate', steel_mat['f_y']))
        fu_plate = float(inputs.get('fu_plate', steel_mat['f_u']))

        bolt_key = inputs.get('bolt_diameter', inputs.get('bolt_d', '3/4"'))
        bolt_data = BOLT_DATABASE.get(bolt_key, BOLT_DATABASE['3/4"'])
        d_b = bolt_data['d_b']
        A_b = bolt_data['A_b'] * 1e2     # mm²
        A_res = bolt_data['A_res'] * 1e2 # mm²
        hole_d = bolt_data['hole_nbr'] if is_nbr else bolt_data['hole_aisc']
        e_min_code = bolt_data['emin_nbr'] if is_nbr else bolt_data['emin_aisc']

        bolt_grade_key = inputs.get('bolt_grade', 'ASTM A325')
        bolt_grade = BOLT_GRADES.get(bolt_grade_key, BOLT_GRADES['ASTM A325'])
        f_ub = bolt_grade['f_ub']
        F_nv = bolt_grade['F_nv_aisc']
        F_nt = bolt_grade['F_nt_aisc']

        f_w = float(inputs.get('f_w', 485.0)) # E70XX electrode tensile strength (MPa)

        checks = []
        detailing = {
            'standard': std_label,
            'hole_dia': round(hole_d, 1),
            'e_min': round(e_min_code, 1),
            'p_min': round(2.67 * d_b, 1),
            'p_preferred': round(3.0 * d_b, 1),
            'bolt_spec': f"{bolt_key} ({bolt_grade_key})",
            'steel_spec': f"{steel_name} (fy={fy_plate} MPa, fu={fu_plate} MPa)"
        }

        # -------------------------------------------------------------
        # 1. Chapa de Topo Flexível (Flexible End Plate)
        # -------------------------------------------------------------
        if conn_type in ('flexible_end_plate', 'end_plate_shear'):
            V_sd = float(inputs.get('V_sd', 150.0)) # kN
            num_bolt_rows = int(inputs.get('num_rows', inputs.get('num_bolt_rows', 4)))
            num_bolts = num_bolt_rows * 2 # 2 columns
            pitch = float(inputs.get('pitch', 75.0))
            gauge = float(inputs.get('gauge', 100.0))
            edge_dist = float(inputs.get('edge_dist', 35.0))
            t_plate = float(inputs.get('t_plate', 9.5))
            t_web = float(inputs.get('t_web', 6.3))
            weld_size = float(inputs.get('weld_leg', inputs.get('weld_size', 6.0)))

            h_plate = (num_bolt_rows - 1) * pitch + 2.0 * edge_dist
            b_plate = gauge + 2.0 * edge_dist

            # 1.1 Bolt Shear
            if is_nbr:
                F_v_1 = (0.40 * A_res * f_ub / 1.35) / 1000.0
                F_v_total = F_v_1 * num_bolts
                ref_bolt = 'NBR 8800: Item 6.5.4 (γa2=1.35)'
            elif is_asd:
                F_v_1 = (F_nv * A_b / 2.00) / 1000.0
                F_v_total = F_v_1 * num_bolts
                ref_bolt = 'AISC 360-22: Table J3.2 (Ω=2.00)'
            else: # LRFD
                F_v_1 = (0.75 * F_nv * A_b) / 1000.0
                F_v_total = F_v_1 * num_bolts
                ref_bolt = 'AISC 360-22: Table J3.2 (φ=0.75)'

            # 1.2 Bearing / Tearout
            l_c_edge = max(1.0, edge_dist - 0.5 * hole_d)
            l_c_inner = max(1.0, pitch - hole_d)
            t_crit = min(t_plate, t_web)
            R_n_edge = min(1.2 * l_c_edge * t_crit * fu_plate, 2.4 * d_b * t_crit * fu_plate) / 1000.0
            R_n_inner = min(1.2 * l_c_inner * t_crit * fu_plate, 2.4 * d_b * t_crit * fu_plate) / 1000.0
            R_n_bearing = 2.0 * (R_n_edge + (num_bolt_rows - 1) * R_n_inner)

            if is_nbr:
                F_b_total = R_n_bearing / 1.35
                ref_bear = 'NBR 8800: Item 6.5.6 (γa2=1.35)'
            elif is_asd:
                F_b_total = R_n_bearing / 2.00
                ref_bear = 'AISC 360-22: Section J3.10 (Ω=2.00)'
            else:
                F_b_total = 0.75 * R_n_bearing
                ref_bear = 'AISC 360-22: Section J3.10 (φ=0.75)'

            # 1.3 Block Shear Rupture
            L_v = (num_bolt_rows - 1) * pitch + edge_dist
            A_gv = 2.0 * t_plate * L_v
            A_nv = 2.0 * t_plate * (L_v - (num_bolt_rows - 0.5) * hole_d)
            A_nt = 2.0 * t_plate * (edge_dist - 0.5 * hole_d)
            
            if is_nbr:
                r1 = (0.60 * A_nv * fu_plate + 1.0 * A_nt * fu_plate) / 1000.0
                r2 = (0.60 * A_gv * fy_plate + 1.0 * A_nt * fu_plate) / 1000.0
                F_bs_total = min(r1, r2) / 1.35
                ref_bs = 'NBR 8800: Anexo H (γa2=1.35)'
            elif is_asd:
                r_nom = min(0.60 * fu_plate * A_nv + 1.0 * fu_plate * A_nt, 0.60 * fy_plate * A_gv + 1.0 * fu_plate * A_nt) / 1000.0
                F_bs_total = r_nom / 2.00
                ref_bs = 'AISC 360-22: Section J4.3 (Ω=2.00)'
            else:
                r_nom = min(0.60 * fu_plate * A_nv + 1.0 * fu_plate * A_nt, 0.60 * fy_plate * A_gv + 1.0 * fu_plate * A_nt) / 1000.0
                F_bs_total = 0.75 * r_nom
                ref_bs = 'AISC 360-22: Section J4.3 (φ=0.75)'

            # 1.4 Fillet Weld on Beam Web
            A_w = 2.0 * 0.707 * weld_size * h_plate
            R_n_weld = (0.60 * f_w * A_w) / 1000.0
            if is_nbr:
                F_w_total = R_n_weld / 1.35
                ref_weld = 'NBR 8800: Item 6.2 (γw2=1.35)'
            elif is_asd:
                F_w_total = R_n_weld / 2.00
                ref_weld = 'AISC 360-22: Section J2.4 (Ω=2.00)'
            else:
                F_w_total = 0.75 * R_n_weld
                ref_weld = 'AISC 360-22: Section J2.4 (φ=0.75)'

            checks.append({'limit_state': 'Cisalhamento nos Parafusos', 'ref': ref_bolt, 'capacity': F_v_total, 'demand': V_sd, 'ratio': V_sd / F_v_total, 'status': 'OK' if V_sd <= F_v_total else 'NG', 'unit': 'kN'})
            checks.append({'limit_state': 'Pressão de Contato e Rasgamento da Chapa', 'ref': ref_bear, 'capacity': F_b_total, 'demand': V_sd, 'ratio': V_sd / F_b_total, 'status': 'OK' if V_sd <= F_b_total else 'NG', 'unit': 'kN'})
            checks.append({'limit_state': 'Cisalhamento em Bloco (Block Shear)', 'ref': ref_bs, 'capacity': F_bs_total, 'demand': V_sd, 'ratio': V_sd / F_bs_total, 'status': 'OK' if V_sd <= F_bs_total else 'NG', 'unit': 'kN'})
            checks.append({'limit_state': 'Solda de Filete na Alma da Viga', 'ref': ref_weld, 'capacity': F_w_total, 'demand': V_sd, 'ratio': V_sd / F_w_total, 'status': 'OK' if V_sd <= F_w_total else 'NG', 'unit': 'kN'})

            detailing['plate_h'] = round(h_plate, 1)
            detailing['plate_w'] = round(b_plate, 1)
            detailing['weld_throat'] = round(0.707 * weld_size, 1)

            cap_limiting = min(F_v_total, F_b_total, F_bs_total, F_w_total)
            ur_max = V_sd / cap_limiting
            is_approved = (ur_max <= 1.0)

            summary = {
                'demand': V_sd,
                'capacity': round(cap_limiting, 1),
                'capacity_limiting': round(cap_limiting, 1),
                'V_sd': V_sd,
                'V_Rd': round(cap_limiting, 1),
                'utilization': round(ur_max, 3),
                'utilization_ratio': round(ur_max, 3),
                'is_approved': is_approved,
                'status': 'Aprovado' if is_approved else 'Reprovado'
            }

            return {
                'status': 'success',
                'standard': std_label,
                'connection': 'Chapa de Topo Simples / Flexível (Flexible End Plate)',
                'demand': V_sd,
                'capacity_limiting': round(cap_limiting, 1),
                'utilization_ratio': round(ur_max, 3),
                'status_overall': 'OK' if is_approved else 'NG',
                'summary': summary,
                'limit_states': checks,
                'checks': checks,
                'detailing': detailing,
                'details': detailing
            }

        # -------------------------------------------------------------
        # 2. Dupla Cantoneira de Alma (Double Angle - 2L)
        # -------------------------------------------------------------
        elif conn_type in ('double_angle', 'web_angle'):
            V_sd = float(inputs.get('V_sd', 180.0))
            num_rows = int(inputs.get('num_rows', inputs.get('num_bolt_rows', 4)))
            t_angle = float(inputs.get('t_angle', 7.9))
            t_web = float(inputs.get('t_web', 7.1))

            L_ang = (num_rows - 1) * 75.0 + 2.0 * 35.0
            A_gv = 2.0 * t_angle * L_ang
            A_nv = 2.0 * t_angle * (L_ang - num_rows * hole_d)

            # 2.1 Double Shear Bolts
            if is_nbr:
                F_v_web = (num_rows * 2.0 * (0.40 * A_res * f_ub / 1.35)) / 1000.0
                ref_bolt = 'NBR 8800: Item 6.5.4 (Corte Duplo)'
            elif is_asd:
                F_v_web = (num_rows * 2.0 * (F_nv * A_b / 2.00)) / 1000.0
                ref_bolt = 'AISC 360-22: Table J3.2 (Double Shear, Ω=2.00)'
            else:
                F_v_web = (num_rows * 2.0 * (0.75 * F_nv * A_b)) / 1000.0
                ref_bolt = 'AISC 360-22: Table J3.2 (Double Shear, φ=0.75)'

            # 2.2 Bearing on Web
            t_crit = min(2.0 * t_angle, t_web)
            R_n_b = (num_rows * 2.4 * d_b * t_crit * fu_plate) / 1000.0
            if is_nbr:
                F_b_web = R_n_b / 1.35
                ref_bear = 'NBR 8800: Item 6.5.6 (Esmagamento)'
            elif is_asd:
                F_b_web = R_n_b / 2.00
                ref_bear = 'AISC 360-22: Section J3.10 (Bearing, Ω=2.00)'
            else:
                F_b_web = 0.75 * R_n_b
                ref_bear = 'AISC 360-22: Section J3.10 (Bearing, φ=0.75)'

            # 2.3 Gross Shear Yielding of Angles
            R_n_sy = (0.60 * fy_plate * A_gv) / 1000.0
            if is_nbr:
                V_Rd_sy = R_n_sy / 1.10
                ref_sy = 'NBR 8800: Item 6.5.6 (Escoamento Bruto)'
            elif is_asd:
                V_Rd_sy = R_n_sy / 1.50
                ref_sy = 'AISC 360-22: Section J4.2 (Shear Yield, Ω=1.50)'
            else:
                V_Rd_sy = 1.00 * R_n_sy
                ref_sy = 'AISC 360-22: Section J4.2 (Shear Yield, φ=1.00)'

            # 2.4 Net Shear Rupture of Angles
            R_n_sr = (0.60 * fu_plate * A_nv) / 1000.0
            if is_nbr:
                V_Rd_sr = R_n_sr / 1.35
                ref_sr = 'NBR 8800: Item 6.5.6 (Ruptura Líquida)'
            elif is_asd:
                V_Rd_sr = R_n_sr / 2.00
                ref_sr = 'AISC 360-22: Section J4.2 (Shear Rupture, Ω=2.00)'
            else:
                V_Rd_sr = 0.75 * R_n_sr
                ref_sr = 'AISC 360-22: Section J4.2 (Shear Rupture, φ=0.75)'

            checks.append({'limit_state': 'Cisalhamento dos Parafusos da Alma (Corte Duplo)', 'ref': ref_bolt, 'capacity': F_v_web, 'demand': V_sd, 'ratio': V_sd / F_v_web, 'status': 'OK' if V_sd <= F_v_web else 'NG', 'unit': 'kN'})
            checks.append({'limit_state': 'Pressão de Contato e Esmagamento na Alma', 'ref': ref_bear, 'capacity': F_b_web, 'demand': V_sd, 'ratio': V_sd / F_b_web, 'status': 'OK' if V_sd <= F_b_web else 'NG', 'unit': 'kN'})
            checks.append({'limit_state': 'Escoamento por Cisalhamento Bruto das Cantoneiras', 'ref': ref_sy, 'capacity': V_Rd_sy, 'demand': V_sd, 'ratio': V_sd / V_Rd_sy, 'status': 'OK' if V_sd <= V_Rd_sy else 'NG', 'unit': 'kN'})
            checks.append({'limit_state': 'Ruptura por Cisalhamento Líquido das Cantoneiras', 'ref': ref_sr, 'capacity': V_Rd_sr, 'demand': V_sd, 'ratio': V_sd / V_Rd_sr, 'status': 'OK' if V_sd <= V_Rd_sr else 'NG', 'unit': 'kN'})

            detailing['plate_h'] = round(L_ang, 1)

            cap_limiting = min(F_v_web, F_b_web, V_Rd_sy, V_Rd_sr)
            ur_max = V_sd / cap_limiting
            is_approved = (ur_max <= 1.0)

            summary = {
                'demand': V_sd,
                'capacity': round(cap_limiting, 1),
                'capacity_limiting': round(cap_limiting, 1),
                'V_sd': V_sd,
                'V_Rd': round(cap_limiting, 1),
                'utilization': round(ur_max, 3),
                'utilization_ratio': round(ur_max, 3),
                'is_approved': is_approved,
                'status': 'Aprovado' if is_approved else 'Reprovado'
            }

            return {
                'status': 'success',
                'standard': std_label,
                'connection': 'Dupla Cantoneira de Alma (Double Angle Cleats)',
                'demand': V_sd,
                'capacity_limiting': round(cap_limiting, 1),
                'utilization_ratio': round(ur_max, 3),
                'status_overall': 'OK' if is_approved else 'NG',
                'summary': summary,
                'limit_states': checks,
                'checks': checks,
                'detailing': detailing,
                'details': detailing
            }

        # -------------------------------------------------------------
        # 3. Chapa Simples de Alma (Shear Tab / Fin Plate)
        # -------------------------------------------------------------
        elif conn_type in ('shear_tab', 'fin_plate', 'single_plate'):
            V_sd = float(inputs.get('V_sd', 120.0))
            num_bolts = int(inputs.get('num_bolts', 4))
            e_dist = float(inputs.get('eccentricity', 65.0))
            t_plate = float(inputs.get('t_plate', 9.5))
            weld_size = float(inputs.get('weld_leg', inputs.get('weld_size', 6.0)))

            h_plate = (num_bolts - 1) * 75.0 + 2.0 * 35.0
            M_sd = V_sd * (e_dist / 1000.0) # kNm
            Z_p = (t_plate * (h_plate ** 2)) / 4.0 * 1e-3 # cm³

            # 3.1 Eccentric Bolt Group
            C_ecc = max(1.0, num_bolts * (1.0 - 0.25 * (e_dist / (num_bolts * 75.0))))
            if is_nbr:
                F_v_1 = (0.40 * A_res * f_ub / 1.35) / 1000.0
                V_Rd_bolts = C_ecc * F_v_1
                ref_bolt = 'NBR 8800: Tabela CBCA (Excentricidade)'
            elif is_asd:
                F_v_1 = (F_nv * A_b / 2.00) / 1000.0
                V_Rd_bolts = C_ecc * F_v_1
                ref_bolt = 'AISC 360-22: Manual Table 7-1 (Ω=2.00)'
            else:
                F_v_1 = (0.75 * F_nv * A_b) / 1000.0
                V_Rd_bolts = C_ecc * F_v_1
                ref_bolt = 'AISC 360-22: Manual Table 7-1 (φ=0.75)'

            # 3.2 Plate Flexure
            M_n_pl = (Z_p * fy_plate) / 100.0 # kNm
            if is_nbr:
                M_Rd_pl = M_n_pl / 1.10
                ref_flex = 'NBR 8800: Item 6.5.6 (Flexão Plástica)'
            elif is_asd:
                M_Rd_pl = M_n_pl / 1.67
                ref_flex = 'AISC 360-22: Section F11 (Flexure, Ω=1.67)'
            else:
                M_Rd_pl = 0.90 * M_n_pl
                ref_flex = 'AISC 360-22: Section F11 (Flexure, φ=0.90)'
            V_Rd_flex = M_Rd_pl / (e_dist / 1000.0)

            # 3.3 Fillet Weld to Column/Girder
            A_w = 2.0 * 0.707 * weld_size * h_plate
            R_n_weld = (0.60 * f_w * A_w) / 1000.0
            if is_nbr:
                V_Rd_weld = R_n_weld / 1.35
                ref_weld = 'NBR 8800: Item 6.2 (Filete Duplo)'
            elif is_asd:
                V_Rd_weld = R_n_weld / 2.00
                ref_weld = 'AISC 360-22: Section J2.4 (Weld, Ω=2.00)'
            else:
                V_Rd_weld = 0.75 * R_n_weld
                ref_weld = 'AISC 360-22: Section J2.4 (Weld, φ=0.75)'

            checks.append({'limit_state': 'Grupo de Parafusos com Excentricidade', 'ref': ref_bolt, 'capacity': V_Rd_bolts, 'demand': V_sd, 'ratio': V_sd / V_Rd_bolts, 'status': 'OK' if V_sd <= V_Rd_bolts else 'NG', 'unit': 'kN'})
            checks.append({'limit_state': 'Flexão da Chapa Simples (Msd / MRd)', 'ref': ref_flex, 'capacity': V_Rd_flex, 'demand': V_sd, 'ratio': V_sd / V_Rd_flex, 'status': 'OK' if V_sd <= V_Rd_flex else 'NG', 'unit': 'kN'})
            checks.append({'limit_state': 'Solda Filete de Fixação no Apoio', 'ref': ref_weld, 'capacity': V_Rd_weld, 'demand': V_sd, 'ratio': V_sd / V_Rd_weld, 'status': 'OK' if V_sd <= V_Rd_weld else 'NG', 'unit': 'kN'})

            detailing['plate_h'] = round(h_plate, 1)
            detailing['weld_throat'] = round(0.707 * weld_size, 1)

            cap_limiting = min(V_Rd_bolts, V_Rd_flex, V_Rd_weld)
            ur_max = V_sd / cap_limiting
            is_approved = (ur_max <= 1.0)

            summary = {
                'demand': V_sd,
                'capacity': round(cap_limiting, 1),
                'capacity_limiting': round(cap_limiting, 1),
                'V_sd': V_sd,
                'V_Rd': round(cap_limiting, 1),
                'utilization': round(ur_max, 3),
                'utilization_ratio': round(ur_max, 3),
                'is_approved': is_approved,
                'status': 'Aprovado' if is_approved else 'Reprovado'
            }

            return {
                'status': 'success',
                'standard': std_label,
                'connection': 'Chapa Simples de Alma (Shear Tab)',
                'demand': V_sd,
                'capacity_limiting': round(cap_limiting, 1),
                'utilization_ratio': round(ur_max, 3),
                'status_overall': 'OK' if is_approved else 'NG',
                'summary': summary,
                'limit_states': checks,
                'checks': checks,
                'detailing': detailing,
                'details': detailing
            }

        # -------------------------------------------------------------
        # 4. Chapa Estendida de Momento (Extended End Plate)
        # -------------------------------------------------------------
        elif conn_type in ('extended_end_plate', 'moment_end_plate', 'rigid_connection'):
            M_sd = float(inputs.get('M_sd', 120.0)) # kNm
            V_sd = float(inputs.get('V_sd', 80.0))   # kN
            d_beam = float(inputs.get('d_beam', 400.0))
            bf_beam = float(inputs.get('b_f', inputs.get('bf_beam', 180.0)))
            tf_beam = float(inputs.get('tf_beam', 13.5))
            t_plate = float(inputs.get('t_plate', 19.0))
            num_bolts_flange = int(inputs.get('num_bolts_flange', 4))

            h_arm = max(0.1, (d_beam - tf_beam) / 1000.0) # m
            F_t_flange = M_sd / h_arm # kN

            # 4.1 Bolt Tensile Capacity
            if is_nbr:
                F_t_1 = (0.75 * A_res * f_ub / 1.35) / 1000.0
                ref_bolt = 'NBR 8800: Item 6.5.4 (Tração)'
            elif is_asd:
                F_t_1 = (F_nt * A_b / 2.00) / 1000.0
                ref_bolt = 'AISC 360-22: Table J3.2 (Tension, Ω=2.00)'
            else:
                F_t_1 = (0.75 * F_nt * A_b) / 1000.0
                ref_bolt = 'AISC 360-22: Table J3.2 (Tension, φ=0.75)'

            # 4.2 Prying Action & End-Plate Required Thickness
            b_prime = max(5.0, 35.0 - d_b / 2.0)
            p_pitch = 75.0
            if is_nbr:
                t_c = math.sqrt((4.0 * 1.35 * (F_t_flange / num_bolts_flange) * 1000.0 * b_prime) / max(1.0, 0.90 * fy_plate * p_pitch))
                ref_tc = 'NBR 8800: Anexo G / CBCA (Alavanca)'
            elif is_asd:
                t_c = math.sqrt((2.0 * 1.67 * (F_t_flange / num_bolts_flange) * 1000.0 * b_prime) / max(1.0, fy_plate * p_pitch))
                ref_tc = 'AISC DG4 / DG16 (Prying Action, Ω=1.67)'
            else:
                t_c = math.sqrt((4.0 * (F_t_flange / num_bolts_flange) * 1000.0 * b_prime) / max(1.0, 0.90 * fy_plate * p_pitch))
                ref_tc = 'AISC DG4 / DG16 (Prying Action, φ=0.90)'

            has_prying = (t_plate < t_c)
            Q_prying = (0.20 * F_t_flange / num_bolts_flange) if has_prying else 0.0
            T_demand_bolt = (F_t_flange / num_bolts_flange) + Q_prying

            # 4.3 Shear in Compression Zone Bolts
            if is_nbr:
                V_Rd_shear = (4 * (0.40 * A_res * f_ub / 1.35)) / 1000.0
                ref_vs = 'NBR 8800: Parafusos da Zona Comprimida'
            elif is_asd:
                V_Rd_shear = (4 * (F_nv * A_b / 2.00)) / 1000.0
                ref_vs = 'AISC 360-22: Shear in Compression Bolts (Ω=2.00)'
            else:
                V_Rd_shear = (4 * (0.75 * F_nv * A_b)) / 1000.0
                ref_vs = 'AISC 360-22: Shear in Compression Bolts (φ=0.75)'

            UR_t = T_demand_bolt / F_t_1
            UR_plate = (t_c / t_plate) ** 2
            UR_v = V_sd / V_Rd_shear

            checks.append({'limit_state': 'Tração nos Parafusos de Momento com Alavanca', 'ref': ref_bolt, 'capacity': F_t_1, 'demand': T_demand_bolt, 'ratio': UR_t, 'status': 'OK' if UR_t <= 1.0 else 'NG', 'unit': 'kN'})
            checks.append({'limit_state': 'Espessura da Chapa de Topo contra Flexão Plástica', 'ref': ref_tc, 'capacity': t_plate, 'demand': t_c, 'ratio': t_c / t_plate, 'status': 'OK' if t_plate >= t_c else 'NG', 'unit': 'mm'})
            checks.append({'limit_state': 'Cisalhamento nos Parafusos da Zona Comprimida', 'ref': ref_vs, 'capacity': V_Rd_shear, 'demand': V_sd, 'ratio': UR_v, 'status': 'OK' if UR_v <= 1.0 else 'NG', 'unit': 'kN'})

            prying_text = 'Efeito de Alavanca Ativo' if has_prying else 'Sem Efeito de Alavanca (Chapa Rígida)'
            detailing['plate_h'] = round(d_beam + 100.0, 1)
            detailing['t_c_recommended'] = round(t_c, 1)
            detailing['prying_status'] = prying_text
            detailing['prying_action'] = prying_text

            ur_max = max(UR_t, UR_plate, UR_v)
            is_approved = (ur_max <= 1.0)
            M_Rd_total = M_sd / ur_max if ur_max > 0 else 0.0

            summary = {
                'demand': M_sd,
                'capacity': round(M_Rd_total, 1),
                'capacity_limiting': round(M_Rd_total, 1),
                'M_sd': M_sd,
                'M_Rd': round(M_Rd_total, 1),
                'V_sd': V_sd,
                'utilization': round(ur_max, 3),
                'utilization_ratio': round(ur_max, 3),
                'is_approved': is_approved,
                'status': 'Aprovado' if is_approved else 'Reprovado (Aumentar chapa/parafusos)'
            }

            return {
                'status': 'success',
                'standard': std_label,
                'connection': 'Chapa de Topo Estendida de Momento (Extended End Plate)',
                'demand': M_sd,
                'capacity_limiting': round(M_Rd_total, 1),
                'utilization_ratio': round(ur_max, 3),
                'status_overall': 'OK' if is_approved else 'NG',
                'summary': summary,
                'limit_states': checks,
                'checks': checks,
                'detailing': detailing,
                'details': detailing
            }

        # -------------------------------------------------------------
        # 5. Placa de Base de Pilar (Column Base Plate)
        # -------------------------------------------------------------
        elif conn_type in ('base_plate', 'column_base'):
            N_sd = float(inputs.get('N_sd', 350.0))
            V_sd = float(inputs.get('V_sd', 50.0))
            M_sd = float(inputs.get('M_sd', 0.0))
            B_p = float(inputs.get('B', inputs.get('B_p', 350.0)))
            A_p = float(inputs.get('N', inputs.get('A_p', 350.0)))
            t_p = float(inputs.get('t_plate', inputs.get('t_p', 22.2)))
            fck_conc = float(inputs.get('fck', inputs.get('fck_concrete', 25.0)))
            d_col = float(inputs.get('d_col', 200.0))
            bf_col = float(inputs.get('bf_col', 200.0))

            Area_p = (B_p * A_p) / 1e6 # m²
            W_p = (B_p * (A_p ** 2)) / 6.0 / 1e9 # m³
            sigma_max = (N_sd / (Area_p * 1000.0)) + ((M_sd / (W_p * 1000.0)) if M_sd else 0.0)

            # Concrete Bearing Resistance
            if is_nbr:
                f_cd_base = (0.85 * fck_conc * math.sqrt(2.0) / 1.40)
                ref_conc = 'NBR 8800 / NBR 6118 (γc=1.40)'
            elif is_asd:
                f_cd_base = (0.85 * fck_conc * math.sqrt(2.0)) / 2.31
                ref_conc = 'AISC 360-22: Section J8 / DG1 (Ω=2.31)'
            else: # LRFD
                f_cd_base = 0.65 * (0.85 * fck_conc * math.sqrt(2.0))
                ref_conc = 'AISC 360-22: Section J8 / DG1 (φ=0.65)'

            # Anchor bolts count and parameters
            num_anchors = int(inputs.get('num_anchors', inputs.get('n_anchors', 4)))
            anchor_d_val = float(inputs.get('anchor_d', d_bolt))
            A_b_anchor = (math.pi * (anchor_d_val ** 2)) / 4.0
            A_res_anchor = 0.78 * A_b_anchor

            # Pedestal Confinement Ratio sqrt(A2/A1)
            B_ped = float(inputs.get('pedestal_B', inputs.get('pedestal_w', B_p + 100.0)))
            N_ped = float(inputs.get('pedestal_N', inputs.get('pedestal_h', A_p + 100.0)))
            A1 = (B_p * A_p)
            A2 = (B_ped * N_ped)
            conf_factor = min(2.0, max(1.0, math.sqrt(A2 / A1)))

            # Cantilever Overhangs m, n, lambda_n'
            m = max(1.0, (A_p - 0.95 * d_col) / 2.0)
            n = max(1.0, (B_p - 0.80 * bf_col) / 2.0)
            lambda_np = math.sqrt(d_col * bf_col) / 4.0
            l_crit = max(m, n, lambda_np)

            # Concrete Bearing Resistance
            if is_nbr:
                f_cd_base = (0.85 * fck_conc * conf_factor / 1.40)
                ref_conc = f'NBR 8800 / NBR 6118 (γc=1.40, √(A2/A1)={conf_factor:.2f})'
            elif is_asd:
                f_cd_base = (0.85 * fck_conc * conf_factor) / 2.31
                ref_conc = f'AISC 360-22: Sec. J8 / DG1 (Ω=2.31, √(A2/A1)={conf_factor:.2f})'
            else: # LRFD
                f_cd_base = 0.65 * (0.85 * fck_conc * conf_factor)
                ref_conc = f'AISC 360-22: Sec. J8 / DG1 (φ=0.65, √(A2/A1)={conf_factor:.2f})'

            if is_nbr:
                tp_req = l_crit * math.sqrt((2.0 * sigma_max) / (fy_plate / 1.10))
                ref_tp = 'NBR 8800: Item 6.7 (Balanço Crítico)'
            elif is_asd:
                tp_req = l_crit * math.sqrt((2.0 * sigma_max) / (fy_plate / 1.67))
                ref_tp = 'AISC DG1: Equation 3.3.14 (Ω=1.67)'
            else:
                tp_req = l_crit * math.sqrt((2.0 * sigma_max) / (0.90 * fy_plate))
                ref_tp = 'AISC DG1: Equation 3.3.14 (φ=0.90)'

            # Basal Shear (Friction + Anchor Bolts)
            mu_fric = 0.45
            V_fric = mu_fric * N_sd
            if is_nbr:
                V_bolts = (num_anchors * 0.40 * A_res_anchor * 415.0 / 1.35) / 1000.0
                ref_shear = f'NBR 8800: Atrito (μ=0.45) + {num_anchors} Chumbadores'
            elif is_asd:
                V_bolts = (num_anchors * 186.0 * A_b_anchor / 2.00) / 1000.0
                ref_shear = f'AISC 360-22: Friction + {num_anchors} Anchor Bolts (Ω=2.00)'
            else:
                V_bolts = (num_anchors * 0.75 * 186.0 * A_b_anchor) / 1000.0
                ref_shear = f'AISC 360-22: Friction + {num_anchors} Anchor Bolts (φ=0.75)'
            V_Rd_total = V_fric + V_bolts

            # Anchor Tension for Eccentricity M/N
            eccentricity = (M_sd * 1000.0 / N_sd) if N_sd > 0 else 0.0 # mm
            e_kern = A_p / 6.0
            if eccentricity > e_kern and M_sd > 0:
                arm = max(10.0, A_p - 2.0 * 50.0) # distance between anchor lines
                T_anchor_dem = ((M_sd * 1000.0 - N_sd * (A_p / 2.0 - 50.0)) / arm) / max(1, num_anchors // 2)
            else:
                T_anchor_dem = 0.0

            if is_nbr:
                T_anchor_cap = (0.75 * A_res_anchor * 415.0 / 1.35) / 1000.0
                ref_tension = 'NBR 8800: Tração nos Chumbadores (γa2=1.35)'
            elif is_asd:
                T_anchor_cap = (310.0 * A_b_anchor / 2.00) / 1000.0
                ref_tension = 'AISC 360-22: Anchor Tension (Ω=2.00)'
            else:
                T_anchor_cap = (0.75 * 310.0 * A_b_anchor) / 1000.0
                ref_tension = 'AISC 360-22: Anchor Tension (φ=0.75)'

            UR_conc = sigma_max / f_cd_base
            UR_plate = tp_req / t_p
            UR_shear = V_sd / V_Rd_total
            UR_anchor = T_anchor_dem / T_anchor_cap if T_anchor_cap > 0 else 0.0

            checks.append({'limit_state': 'Pressão de Contato no Pedestal de Concreto', 'ref': ref_conc, 'capacity': f_cd_base, 'demand': sigma_max, 'ratio': UR_conc, 'status': 'OK' if UR_conc <= 1.0 else 'NG', 'unit': 'MPa'})
            checks.append({'limit_state': 'Espessura da Placa de Base nos Balanços (m, n)', 'ref': ref_tp, 'capacity': t_p, 'demand': tp_req, 'ratio': UR_plate, 'status': 'OK' if UR_plate <= 1.0 else 'NG', 'unit': 'mm'})
            checks.append({'limit_state': 'Cisalhamento Basal (Atrito + Chumbadores)', 'ref': ref_shear, 'capacity': V_Rd_total, 'demand': V_sd, 'ratio': UR_shear, 'status': 'OK' if UR_shear <= 1.0 else 'NG', 'unit': 'kN'})
            if T_anchor_dem > 0:
                checks.append({'limit_state': 'Tração nos Chumbadores (Flexão Biaxial/Excentricidade)', 'ref': ref_tension, 'capacity': T_anchor_cap, 'demand': T_anchor_dem, 'ratio': UR_anchor, 'status': 'OK' if UR_anchor <= 1.0 else 'NG', 'unit': 'kN'})

            detailing['plate_h'] = round(A_p, 1)
            detailing['plate_w'] = round(B_p, 1)
            detailing['tp_recommended'] = round(tp_req, 1)
            detailing['l_crit'] = round(l_crit, 1)
            detailing['anchor_count'] = num_anchors
            detailing['anchor_dia'] = anchor_d_val

            ur_max = max(UR_conc, UR_plate, UR_shear, UR_anchor)
            is_approved = (ur_max <= 1.0)
            N_Rd_total = N_sd / ur_max if ur_max > 0 else 0.0

            summary = {
                'demand': N_sd,
                'capacity': round(N_Rd_total, 1),
                'capacity_limiting': round(N_Rd_total, 1),
                'N_sd': N_sd,
                'N_Rd': round(N_Rd_total, 1),
                'M_sd': M_sd,
                'V_sd': V_sd,
                'tp_req': round(tp_req, 1),
                't_p': t_p,
                'utilization': round(ur_max, 3),
                'utilization_ratio': round(ur_max, 3),
                'is_approved': is_approved,
                'status': 'Aprovado' if is_approved else 'Reprovado'
            }

            return {
                'status': 'success',
                'standard': std_label,
                'connection': 'Placa de Base de Pilar (Column Base Plate)',
                'demand': N_sd,
                'capacity_limiting': round(N_Rd_total, 1),
                'utilization_ratio': round(ur_max, 3),
                'status_overall': 'OK' if is_approved else 'NG',
                'summary': summary,
                'limit_states': checks,
                'checks': checks,
                'detailing': detailing,
                'details': detailing
            }

        # -------------------------------------------------------------
        # 6. Emenda de Perfis Viga/Pilar (Splice Connection)
        # -------------------------------------------------------------
        elif conn_type in ('splice', 'beam_splice', 'column_splice', 'emenda'):
            M_sd = float(inputs.get('M_sd', inputs.get('M_load', 100.0))) # kNm
            V_sd = float(inputs.get('V_sd', inputs.get('V_load', 120.0))) # kN
            N_sd = float(inputs.get('N_sd', inputs.get('Axial_load', 0.0))) # kN

            d_beam = float(inputs.get('d_beam', inputs.get('member_d', 310.0))) # mm
            b_f = float(inputs.get('b_f', inputs.get('member_bf', 165.0))) # mm
            t_f = float(inputs.get('t_f', inputs.get('member_tf', 9.7))) # mm
            t_w = float(inputs.get('t_w', inputs.get('member_tw', 5.8))) # mm

            # Flange Splice Plates (Mesa)
            t_fp = float(inputs.get('t_fp', 12.7)) # mm
            b_fp = float(inputs.get('b_fp', inputs.get('H_fp', b_f))) # mm
            L_fp = float(inputs.get('L_fp', 400.0)) # mm
            num_bolts_f = int(inputs.get('num_bolts_f', inputs.get('Nc_fp', 2) * inputs.get('Nr_fp', 2))) # per flange per side

            # Web Splice Plates (Alma)
            t_wp = float(inputs.get('t_wp', 6.35)) # mm (single plate or per plate)
            num_web_plates = int(inputs.get('num_web_plates', 2))
            h_wp = float(inputs.get('h_wp', inputs.get('H_wp', max(100.0, d_beam - 2.0 * t_f - 40.0))))
            L_wp = float(inputs.get('L_wp', 250.0))
            num_bolts_w = int(inputs.get('num_bolts_w', inputs.get('Nc_wp', 2) * inputs.get('Nr_wp', 3))) # per side

            # 1. Flange Force Demands
            arm_y = max(10.0, d_beam - t_f)
            T_flange_dem = ((M_sd * 1000.0) / (arm_y / 1000.0)) + (N_sd / 2.0) # kN

            # Flange Bolt Shear
            F_v_Rd_1bolt = calculate_bolt_shear_capacity(A_res, A_b, fub_bolt, is_nbr, is_asd)
            F_v_flange_cap = num_bolts_f * F_v_Rd_1bolt
            UR_fb = T_flange_dem / F_v_flange_cap if F_v_flange_cap > 0 else 0.0
            checks.append({
                'limit_state': 'Cisalhamento dos Parafusos da Mesa (Flange)',
                'ref': 'NBR 8800: 6.3.3 / AISC Table J3.2' if is_nbr else ('AISC 360-22 Table J3.2 (ASD)' if is_asd else 'AISC 360-22 Table J3.2 (LRFD)'),
                'capacity': round(F_v_flange_cap, 1),
                'demand': round(T_flange_dem, 1),
                'ratio': round(UR_fb, 3),
                'status': 'OK' if UR_fb <= 1.0 else 'NG',
                'unit': 'kN'
            })

            # Flange Plate Tension Gross Yielding
            Ag_fp = b_fp * t_fp
            if is_nbr:
                N_t_Rd_fp_yield = (Ag_fp * fy_plate / 1.10) / 1000.0
                ref_fpy = 'NBR 8800: 5.2.2 (Escoamento Mesa γa1=1.10)'
            elif is_asd:
                N_t_Rd_fp_yield = (Ag_fp * fy_plate / 1.67) / 1000.0
                ref_fpy = 'AISC 360-22: Eq. J4-1 (Yielding Ω=1.67)'
            else:
                N_t_Rd_fp_yield = (0.90 * Ag_fp * fy_plate) / 1000.0
                ref_fpy = 'AISC 360-22: Eq. J4-1 (Yielding φ=0.90)'
            UR_fpy = T_flange_dem / N_t_Rd_fp_yield if N_t_Rd_fp_yield > 0 else 0.0
            checks.append({
                'limit_state': 'Escoamento da Chapa de Emenda da Mesa',
                'ref': ref_fpy,
                'capacity': round(N_t_Rd_fp_yield, 1),
                'demand': round(T_flange_dem, 1),
                'ratio': round(UR_fpy, 3),
                'status': 'OK' if UR_fpy <= 1.0 else 'NG',
                'unit': 'kN'
            })

            # Flange Plate Tension Net Rupture
            An_fp = (b_fp - 2.0 * d_hole) * t_fp
            if is_nbr:
                N_t_Rd_fp_rup = (An_fp * fu_plate / 1.35) / 1000.0
                ref_fpr = 'NBR 8800: 5.2.3 (Ruptura Líquida γa2=1.35)'
            elif is_asd:
                N_t_Rd_fp_rup = (An_fp * fu_plate / 2.00) / 1000.0
                ref_fpr = 'AISC 360-22: Eq. J4-2 (Rupture Ω=2.00)'
            else:
                N_t_Rd_fp_rup = (0.75 * An_fp * fu_plate) / 1000.0
                ref_fpr = 'AISC 360-22: Eq. J4-2 (Rupture φ=0.75)'
            UR_fpr = T_flange_dem / N_t_Rd_fp_rup if N_t_Rd_fp_rup > 0 else 0.0
            checks.append({
                'limit_state': 'Ruptura Líquida da Chapa de Emenda da Mesa',
                'ref': ref_fpr,
                'capacity': round(N_t_Rd_fp_rup, 1),
                'demand': round(T_flange_dem, 1),
                'ratio': round(UR_fpr, 3),
                'status': 'OK' if UR_fpr <= 1.0 else 'NG',
                'unit': 'kN'
            })

            # 2. Web Splice Shear Checks
            # Web Bolts in Double Shear (num_web_plates = 2)
            n_shear_planes = num_web_plates
            V_bolts_web_cap = num_bolts_w * n_shear_planes * F_v_Rd_1bolt
            UR_wb = V_sd / V_bolts_web_cap if V_bolts_web_cap > 0 else 0.0
            checks.append({
                'limit_state': f'Cisalhamento dos Parafusos da Alma ({n_shear_planes} planos de corte)',
                'ref': 'NBR 8800: 6.3.3 / AISC Table J3.2' if is_nbr else ('AISC 360-22 Table J3.2 (ASD)' if is_asd else 'AISC 360-22 Table J3.2 (LRFD)'),
                'capacity': round(V_bolts_web_cap, 1),
                'demand': round(V_sd, 1),
                'ratio': round(UR_wb, 3),
                'status': 'OK' if UR_wb <= 1.0 else 'NG',
                'unit': 'kN'
            })

            # Web Plates Gross Shear Yielding
            Ag_wp = num_web_plates * h_wp * t_wp
            if is_nbr:
                V_Rd_wp_yield = (0.60 * Ag_wp * fy_plate / 1.10) / 1000.0
                ref_wpy = 'NBR 8800: 6.5.6 (Escoamento Alma γa1=1.10)'
            elif is_asd:
                V_Rd_wp_yield = (0.60 * Ag_wp * fy_plate / 1.50) / 1000.0
                ref_wpy = 'AISC 360-22: Eq. J4-3 (Yielding Ω=1.50)'
            else:
                V_Rd_wp_yield = (1.00 * 0.60 * Ag_wp * fy_plate) / 1000.0
                ref_wpy = 'AISC 360-22: Eq. J4-3 (Yielding φ=1.00)'
            UR_wpy = V_sd / V_Rd_wp_yield if V_Rd_wp_yield > 0 else 0.0
            checks.append({
                'limit_state': 'Escoamento Bruto das Chapas de Emenda da Alma',
                'ref': ref_wpy,
                'capacity': round(V_Rd_wp_yield, 1),
                'demand': round(V_sd, 1),
                'ratio': round(UR_wpy, 3),
                'status': 'OK' if UR_wpy <= 1.0 else 'NG',
                'unit': 'kN'
            })

            # Web Plates Net Shear Rupture
            An_wp = num_web_plates * (h_wp - (num_bolts_w // 2) * d_hole) * t_wp
            if is_nbr:
                V_Rd_wp_rup = (0.60 * An_wp * fu_plate / 1.35) / 1000.0
                ref_wpr = 'NBR 8800: 6.5.6 (Ruptura Líquida γa2=1.35)'
            elif is_asd:
                V_Rd_wp_rup = (0.60 * An_wp * fu_plate / 2.00) / 1000.0
                ref_wpr = 'AISC 360-22: Eq. J4-4 (Rupture Ω=2.00)'
            else:
                V_Rd_wp_rup = (0.75 * 0.60 * An_wp * fu_plate) / 1000.0
                ref_wpr = 'AISC 360-22: Eq. J4-4 (Rupture φ=0.75)'
            UR_wpr = V_sd / V_Rd_wp_rup if V_Rd_wp_rup > 0 else 0.0
            checks.append({
                'limit_state': 'Ruptura Líquida por Cisalhamento das Chapas de Alma',
                'ref': ref_wpr,
                'capacity': round(V_Rd_wp_rup, 1),
                'demand': round(V_sd, 1),
                'ratio': round(UR_wpr, 3),
                'status': 'OK' if UR_wpr <= 1.0 else 'NG',
                'unit': 'kN'
            })

            # Moment Capacity of Splice
            M_Rd_splice = min(F_v_flange_cap, N_t_Rd_fp_yield, N_t_Rd_fp_rup) * (arm_y / 1000.0)
            UR_M = M_sd / M_Rd_splice if M_Rd_splice > 0 else 0.0

            ur_max = max(UR_fb, UR_fpy, UR_fpr, UR_wb, UR_wpy, UR_wpr, UR_M)
            is_approved = (ur_max <= 1.0)

            detailing['flange_bolts_per_side'] = num_bolts_f
            detailing['web_bolts_per_side'] = num_bolts_w
            detailing['flange_plate_dim'] = f'{b_fp:.0f}x{t_fp:.1f}x{L_fp:.0f} mm'
            detailing['web_plate_dim'] = f'2x {h_wp:.0f}x{t_wp:.1f}x{L_wp:.0f} mm'
            detailing['hole_dia'] = round(d_hole, 1)
            detailing['e_min'] = round(e_min_norm, 1)
            detailing['p_min'] = round(p_min_norm, 1)

            summary = {
                'demand': M_sd,
                'capacity': round(M_Rd_splice, 1),
                'capacity_limiting': round(M_Rd_splice, 1),
                'M_sd': M_sd,
                'M_Rd': round(M_Rd_splice, 1),
                'V_sd': V_sd,
                'V_Rd': round(min(V_bolts_web_cap, V_Rd_wp_yield, V_Rd_wp_rup), 1),
                'utilization': round(ur_max, 3),
                'utilization_ratio': round(ur_max, 3),
                'is_approved': is_approved,
                'status': 'Aprovado' if is_approved else 'Reprovado'
            }

            return {
                'status': 'success',
                'standard': std_label,
                'connection': 'Emenda Parafusada de Perfis (Splice Connection)',
                'demand': M_sd,
                'capacity_limiting': round(M_Rd_splice, 1),
                'utilization_ratio': round(ur_max, 3),
                'status_overall': 'OK' if is_approved else 'NG',
                'summary': summary,
                'limit_states': checks,
                'checks': checks,
                'detailing': detailing,
                'details': detailing
            }

        else:
            return {'status': 'error', 'error': f'Tipo de ligação desconhecido: {conn_type}'}

    except Exception as e:
        import traceback
        return {'status': 'error', 'error': str(e), 'trace': traceback.format_exc()}


# Compatibility alias
def calculate_nbr8800_connection(inputs: dict) -> dict:
    return calculate_steel_connection(inputs)
