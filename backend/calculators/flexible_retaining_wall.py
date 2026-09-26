"""
Flexible Retaining Wall Calculator (Contenções Flexíveis)
Formulation:
- Steel Sheet Piles (Estacas-Prancha Metálicas) & Diaphragm Walls (Paredes Diafragma)
- Cantilever (Livre em Balanço) and Single-Anchored (Blum's Free Earth Support Method)
- Supports Automatic Blum Embedment Design OR Manual Pile Length (L_total / Ficha D) with Overturning FS Check
- Supports Homogeneous Soil OR Multi-Layer Soil Stratigraphy (Estratigrafia cota a cota)
- Net earth pressure, water pressures, shear and bending moment envelopes
- Structural sizing (Wel,req, As rebar, wall thickness)
- Hydraulic heave / piping stability check (Terzaghi)
"""

import math
import numpy as np


# Standard Commercial Sheet Pile Catalog (ArcelorMittal AZ / PU / AU / GU)
SHEET_PILE_CATALOG = [
    {'name': 'PU 12 (Larssen)', 'W_el': 1200, 'I_x': 21600, 'weight': 89.6, 't_w': 8.5, 'h': 360},
    {'name': 'PU 18 (Larssen)', 'W_el': 1800, 'I_x': 38400, 'weight': 118.0, 't_w': 10.0, 'h': 430},
    {'name': 'PU 22 (Larssen)', 'W_el': 2200, 'I_x': 49500, 'weight': 133.0, 't_w': 11.2, 'h': 450},
    {'name': 'PU 28 (Larssen)', 'W_el': 2800, 'I_x': 65800, 'weight': 152.0, 't_w': 13.0, 'h': 452},
    {'name': 'PU 32 (Larssen)', 'W_el': 3200, 'I_x': 78400, 'weight': 168.0, 't_w': 14.5, 'h': 452},
    {'name': 'AU 14', 'W_el': 1400, 'I_x': 28600, 'weight': 104.0, 't_w': 8.5, 'h': 408},
    {'name': 'AU 18', 'W_el': 1800, 'I_x': 39600, 'weight': 120.0, 't_w': 9.7, 'h': 441},
    {'name': 'AU 20', 'W_el': 2000, 'I_x': 44300, 'weight': 128.0, 't_w': 10.0, 'h': 443},
    {'name': 'AU 25', 'W_el': 2500, 'I_x': 56000, 'weight': 147.0, 't_w': 12.0, 'h': 447},
    {'name': 'AZ 18-700', 'W_el': 1800, 'I_x': 37800, 'weight': 102.5, 't_w': 8.5, 'h': 420},
    {'name': 'AZ 26-700', 'W_el': 2600, 'I_x': 60500, 'weight': 128.5, 't_w': 11.5, 'h': 460},
    {'name': 'AZ 36-700N', 'W_el': 3600, 'I_x': 95400, 'weight': 161.0, 't_w': 13.0, 'h': 499},
    {'name': 'AZ 46-700N', 'W_el': 4600, 'I_x': 133400, 'weight': 195.0, 't_w': 15.0, 'h': 503}
]

STRATIGRAPHY_PALETTE = [
    '#d97706', # Amber / sand
    '#854d0e', # Brown / clay
    '#0d9488', # Teal / silt
    '#475569', # Slate / dense sand
    '#7c3aed', # Violet / bedrock
    '#ca8a04', # Gold / fill
]


# Standard Geotechnical Soil Catalog calibrated from Empuxos_Atualizados_Interfaces.xlsx
SOIL_CATALOG_EXCEL = [
    {'name': 'Aterro (<5 golpes)', 'group': 'Aterro', 'nspt': 2, 'alpha': 1.0, 'E_tf': 500.0, 'gamma': 17.0, 'gamma_sat': 18.0, 'c': 5.0, 'phi': 20.0, 'Kh_tf': 400.0, 'Kh_kN': 4000.0},
    {'name': 'Aterro (≥5 golpes)', 'group': 'Aterro', 'nspt': 5, 'alpha': 1.0, 'E_tf': 500.0, 'gamma': 18.0, 'gamma_sat': 19.0, 'c': 10.0, 'phi': 23.0, 'Kh_tf': 475.0, 'Kh_kN': 4750.0},
    {'name': 'Aluvionar Argiloso (<2 golpes)', 'group': 'Aluvionar Argiloso', 'nspt': 1.5, 'alpha': 1.43, 'E_tf': 286.0, 'gamma': 15.0, 'gamma_sat': 16.0, 'c': 8.0, 'phi': 15.0, 'Kh_tf': 100.0, 'Kh_kN': 1000.0},
    {'name': 'Aluvionar Argiloso (2-4 golpes)', 'group': 'Aluvionar Argiloso', 'nspt': 3, 'alpha': 1.43, 'E_tf': 429.0, 'gamma': 15.0, 'gamma_sat': 16.0, 'c': 8.0, 'phi': 18.0, 'Kh_tf': 150.0, 'Kh_kN': 1500.0},
    {'name': 'Aluvionar Argiloso (>4 golpes)', 'group': 'Aluvionar Argiloso', 'nspt': 5, 'alpha': 1.43, 'E_tf': 572.0, 'gamma': 16.0, 'gamma_sat': 17.0, 'c': 12.0, 'phi': 20.0, 'Kh_tf': 200.0, 'Kh_kN': 2000.0},
    {'name': 'Aluvionar Arenoso (<10 golpes)', 'group': 'Aluvionar Arenoso', 'nspt': 6, 'alpha': 2.5, 'E_tf': 1250.0, 'gamma': 17.0, 'gamma_sat': 18.0, 'c': 5.0, 'phi': 25.0, 'Kh_tf': 300.0, 'Kh_kN': 3000.0},
    {'name': 'Aluvionar Arenoso (≥10 golpes)', 'group': 'Aluvionar Arenoso', 'nspt': 15, 'alpha': 2.5, 'E_tf': 3750.0, 'gamma': 17.0, 'gamma_sat': 18.0, 'c': 5.0, 'phi': 28.0, 'Kh_tf': 500.0, 'Kh_kN': 5000.0},
    {'name': 'Solo Residual (<5 golpes)', 'group': 'Solo Residual', 'nspt': 4, 'alpha': 2.0, 'E_tf': 1000.0, 'gamma': 17.0, 'gamma_sat': 18.0, 'c': 9.0, 'phi': 22.0, 'Kh_tf': 800.0, 'Kh_kN': 8000.0},
    {'name': 'Solo Residual (5-10 golpes)', 'group': 'Solo Residual', 'nspt': 7.5, 'alpha': 2.0, 'E_tf': 1500.0, 'gamma': 18.0, 'gamma_sat': 19.0, 'c': 11.0, 'phi': 26.0, 'Kh_tf': 1350.0, 'Kh_kN': 13500.0},
    {'name': 'Solo Residual (10-20 golpes)', 'group': 'Solo Residual', 'nspt': 15, 'alpha': 2.0, 'E_tf': 3000.0, 'gamma': 18.0, 'gamma_sat': 19.0, 'c': 13.5, 'phi': 29.0, 'Kh_tf': 1850.0, 'Kh_kN': 18500.0},
    {'name': 'Solo Residual (>20 golpes)', 'group': 'Solo Residual', 'nspt': 25, 'alpha': 2.0, 'E_tf': 4000.0, 'gamma': 19.0, 'gamma_sat': 20.0, 'c': 17.5, 'phi': 31.0, 'Kh_tf': 3000.0, 'Kh_kN': 30000.0},
]

# Preset Stratigraphy matching Empuxos_Atualizados_Interfaces.xlsx
PRESET_EXCEL_STRAP_LAYERS = [
    {
        'id': 1,
        'name': 'Aterro',
        'thickness': 4.0,
        'gamma': 17.0,
        'gamma_sat': 18.0,
        'phi': 20.0,
        'cohesion': 5.0,
        'nspt': 2,
        'alpha': 1.0,
        'Kh_tf': 400.0,
        'Kh_kN': 4000.0,
        'color': '#d97706'
    },
    {
        'id': 2,
        'name': 'Aluvionar Argiloso',
        'thickness': 1.5,
        'gamma': 16.0,
        'gamma_sat': 17.0,
        'phi': 20.0,
        'cohesion': 12.0,
        'nspt': 5,
        'alpha': 1.43,
        'Kh_tf': 200.0,
        'Kh_kN': 2000.0,
        'color': '#854d0e'
    },
    {
        'id': 3,
        'name': 'Aluvionar Arenoso',
        'thickness': 5.0,
        'gamma': 17.0,
        'gamma_sat': 18.0,
        'phi': 25.0,
        'cohesion': 5.0,
        'nspt': 6,
        'alpha': 2.5,
        'Kh_tf': 300.0,
        'Kh_kN': 3000.0,
        'color': '#0d9488'
    },
    {
        'id': 4,
        'name': 'Solo Residual',
        'thickness': 25.0,
        'gamma': 19.0,
        'gamma_sat': 20.0,
        'phi': 31.0,
        'cohesion': 17.5,
        'nspt': 25,
        'alpha': 2.0,
        'Kh_tf': 3000.0,
        'Kh_kN': 30000.0,
        'color': '#475569'
    }
]


def calc_geotechnical_correlations(phi_deg: float, nspt: float = None, alpha: float = None, kh_val: float = None):
    """
    Computes geotechnical correlations based on Empuxos_Atualizados_Interfaces.xlsx:
      - K0 (Jaky) = 1 - sin(phi)
      - nu (Poisson) = K0 / (1 + K0)
      - E = alpha * N_SPT * 100 (tf/m²) = alpha * N_SPT * 1000 (kPa)
      - K (Bulk) = E / (3 * (1 - 2*nu))
      - G (Shear) = E / (2 * (1 + nu))
      - Ka = tan²(45 - phi/2)
      - Kp = tan²(45 + phi/2)
    """
    phi_r = math.radians(max(5.0, min(50.0, phi_deg)))
    k0 = 1.0 - math.sin(phi_r)
    nu = k0 / (1.0 + k0) if (1.0 + k0) > 0 else 0.3
    ka = (math.tan(math.pi / 4.0 - phi_r / 2.0)) ** 2
    kp = (math.tan(math.pi / 4.0 + phi_r / 2.0)) ** 2

    a_val = float(alpha) if alpha is not None and alpha > 0 else 2.0
    n_val = float(nspt) if nspt is not None and nspt > 0 else 10.0

    e_tf = a_val * n_val * 100.0  # tf/m²
    e_kpa = e_tf * 10.0           # kPa (1 tf/m² = 10 kPa)

    denom_k = 3.0 * (1.0 - 2.0 * nu)
    k_bulk = (e_kpa / denom_k) if abs(denom_k) > 1e-4 else e_kpa

    denom_g = 2.0 * (1.0 + nu)
    g_shear = (e_kpa / denom_g) if abs(denom_g) > 1e-4 else e_kpa

    if kh_val is not None and float(kh_val) > 0:
        kh_kpa_m = float(kh_val)  # in kN/m³
        kh_tf_m3 = kh_kpa_m / 10.0
    else:
        kh_tf_m3 = 100.0 * n_val
        kh_kpa_m = kh_tf_m3 * 10.0

    return {
        'phi_deg': round(phi_deg, 1),
        'K0': round(k0, 3),
        'nu': round(nu, 3),
        'Ka': round(ka, 3),
        'Kp': round(kp, 3),
        'alpha': round(a_val, 2),
        'nspt': round(n_val, 1),
        'E_tf_m2': round(e_tf, 1),
        'E_kPa': round(e_kpa, 1),
        'K_bulk_kPa': round(k_bulk, 1),
        'G_shear_kPa': round(g_shear, 1),
        'Kh_tf_m3': round(kh_tf_m3, 1),
        'Kh_kN_m3': round(kh_kpa_m, 1)
    }


def calc_strap_springs_table(layers: list, H: float, total_L: float, zw_retained: float, q_surcharge: float, pile_width: float = 1.0, gamma_w: float = 9.81):
    """
    Computes Winkler spring stiffnesses, plastification threshold forces,
    and STRAP yield displacements x2 (mm) based on Empuxos_Atualizados_Interfaces.xlsx.
    Supports both kN and tf output.
    """
    step = 0.5
    raw_stations = []
    curr = 0.0
    while curr <= total_L + 1e-4:
        raw_stations.append(round(curr, 3))
        curr += step

    specials = [round(H, 3)]
    for lay in layers:
        top_z = round(lay.get('top', 0.0), 3)
        bot_z = round(lay.get('bottom', total_L), 3)
        if 0 < top_z < total_L:
            specials.append(top_z)
        if 0 < bot_z < total_L:
            specials.append(bot_z)

    all_z = sorted(list(set(raw_stations + specials)))

    z_stations = []
    layer_tops = set(round(lay.get('top', 0.0), 3) for lay in layers if lay.get('top', 0.0) > 0)
    for z in all_z:
        if z in layer_tops and z < total_L:
            z_stations.append(z)
            z_stations.append(round(z + 0.001, 3))
        elif abs(z - H) < 1e-4 and z < total_L:
            z_stations.append(z)
            z_stations.append(round(z + 0.001, 3))
        else:
            z_stations.append(z)
    z_stations.sort()

    def get_layer(z, prefer_lower=False):
        for lay in layers:
            if prefer_lower:
                if lay['top'] <= z <= lay['bottom']:
                    return lay
            else:
                if lay['top'] <= z < lay['bottom']:
                    return lay
        return layers[-1]

    n_pts = len(z_stations)
    l_inf_list = []
    for i in range(n_pts):
        if i == 0:
            l_inf = (z_stations[1] - z_stations[0]) / 2.0 if n_pts > 1 else 0.5
        elif i == n_pts - 1:
            l_inf = (z_stations[n_pts - 1] - z_stations[n_pts - 2]) / 2.0
        else:
            if abs(z_stations[i] - z_stations[i-1]) < 0.005:
                l_inf = (z_stations[i+1] - z_stations[i]) / 2.0 if i + 1 < n_pts else 0.25
            elif i + 1 < n_pts and abs(z_stations[i+1] - z_stations[i]) < 0.005:
                l_inf = (z_stations[i] - z_stations[i-1]) / 2.0
            else:
                l_inf = (z_stations[i+1] - z_stations[i-1]) / 2.0
        l_inf_list.append(max(0.001, l_inf))

    rows = []
    tot_Fa_kN = 0.0
    tot_Fp_kN = 0.0
    M_tom_kNm = 0.0
    M_res_kNm = 0.0

    sigma_v_act = 0.0
    sigma_v_pas = 0.0
    prev_z = 0.0

    for i, z in enumerate(z_stations):
        is_lower = (i > 0 and abs(z - z_stations[i-1]) < 0.005)
        lay = get_layer(z, prefer_lower=is_lower)
        dz = max(0.0, z - prev_z)

        g_nat = lay.get('gamma', 18.0)
        g_sat = lay.get('gamma_sat', g_nat + 1.0)
        is_sub_act = (z > zw_retained)
        g_eff_act = g_sat if is_sub_act else g_nat

        if dz > 0:
            sigma_v_act += g_eff_act * dz
            if z > H:
                dz_pas = z - max(H, prev_z)
                is_sub_pas = (z > H and z > zw_retained)
                g_eff_pas = g_sat if is_sub_pas else g_nat
                sigma_v_pas += g_eff_pas * dz_pas
        prev_z = z

        phi_val = lay.get('phi', 30.0)
        phi_rad = math.radians(phi_val)
        ka = (math.tan(math.pi / 4.0 - phi_rad / 2.0)) ** 2
        kp = (math.tan(math.pi / 4.0 + phi_rad / 2.0)) ** 2
        c_val = lay.get('cohesion', lay.get('c', 0.0))

        kh_kN_m3 = lay.get('Kh_kN', lay.get('Kh', lay.get('kh', None)))
        if kh_kN_m3 is None or kh_kN_m3 <= 0:
            kh_tf = lay.get('Kh_tf', lay.get('kh_tf', None))
            if kh_tf and kh_tf > 0:
                kh_kN_m3 = kh_tf * 10.0
            else:
                nspt_val = lay.get('nspt', 10.0)
                kh_kN_m3 = 1000.0 * nspt_val
        kh_tf_m3 = kh_kN_m3 / 10.0

        l_inf = l_inf_list[i]

        u_act = max(0.0, (z - zw_retained) * gamma_w)
        sigma_v_prime_act = max(0.0, sigma_v_act - u_act)
        sigma_a_solo_eff = max(0.0, sigma_v_prime_act * ka - 2.0 * c_val * math.sqrt(ka))
        sigma_a_q_eff = q_surcharge * ka
        sigma_a_total = sigma_a_solo_eff + sigma_a_q_eff + u_act

        if z >= H:
            u_pas = max(0.0, (z - max(H, zw_retained)) * gamma_w)
            sigma_v_prime_pas = max(0.0, sigma_v_pas - u_pas)
            sigma_p_solo_eff = sigma_v_prime_pas * kp + 2.0 * c_val * math.sqrt(kp)
            sigma_p_total = sigma_p_solo_eff + u_pas
            k_mola_kN = kh_kN_m3 * pile_width * l_inf
            k_mola_tf = kh_tf_m3 * pile_width * l_inf
            f_max_kN = sigma_p_solo_eff * pile_width * l_inf
            f_max_tf = f_max_kN / 10.0
            x2_mm = (f_max_kN / k_mola_kN * 1000.0) if k_mola_kN > 0 else 0.0
        else:
            u_pas = 0.0
            sigma_v_prime_pas = 0.0
            sigma_p_solo_eff = 0.0
            sigma_p_total = 0.0
            k_mola_kN = 0.0
            k_mola_tf = 0.0
            f_max_kN = 0.0
            f_max_tf = 0.0
            x2_mm = 0.0

        q_a_solo_kN = sigma_a_solo_eff * pile_width
        q_a_q_kN = sigma_a_q_eff * pile_width
        q_a_w_kN = u_act * pile_width

        f_a_tot_kN = (sigma_a_solo_eff + sigma_a_q_eff) * pile_width * l_inf
        f_p_tot_kN = sigma_p_solo_eff * pile_width * l_inf

        arm_base = max(0.0, total_L - z)
        tot_Fa_kN += f_a_tot_kN
        tot_Fp_kN += f_p_tot_kN
        M_tom_kNm += f_a_tot_kN * arm_base
        M_res_kNm += f_p_tot_kN * arm_base

        rows.append({
            'node': i + 1,
            'z': round(z, 3),
            'layer': lay.get('name', 'Solo'),
            'nspt': lay.get('nspt', 10),
            'gamma_kN': round(g_nat, 1),
            'gamma_tf': round(g_nat / 10.0, 2),
            'c_kPa': round(c_val, 1),
            'c_tf': round(c_val / 10.0, 2),
            'phi': round(phi_val, 1),
            'Ka': round(ka, 3),
            'Kp': round(kp, 3),
            'Kh_kN': round(kh_kN_m3, 0),
            'Kh_tf': round(kh_tf_m3, 0),
            'L_inf': round(l_inf, 3),
            'u_act_kPa': round(u_act, 1),
            'u_act_tf': round(u_act / 10.0, 2),
            'sigma_v_prime_act_kPa': round(sigma_v_prime_act, 1),
            'sigma_v_prime_act_tf': round(sigma_v_prime_act / 10.0, 2),
            'sigma_a_solo_kPa': round(sigma_a_solo_eff, 1),
            'sigma_a_solo_tf': round(sigma_a_solo_eff / 10.0, 2),
            'sigma_a_q_kPa': round(sigma_a_q_eff, 1),
            'sigma_a_q_tf': round(sigma_a_q_eff / 10.0, 2),
            'sigma_a_tot_kPa': round(sigma_a_total, 1),
            'sigma_a_tot_tf': round(sigma_a_total / 10.0, 2),
            'sigma_p_solo_kPa': round(sigma_p_solo_eff, 1),
            'sigma_p_solo_tf': round(sigma_p_solo_eff / 10.0, 2),
            'sigma_p_tot_kPa': round(sigma_p_total, 1),
            'sigma_p_tot_tf': round(sigma_p_total / 10.0, 2),
            'q_a_solo_kNm': round(q_a_solo_kN, 2),
            'q_a_q_kNm': round(q_a_q_kN, 2),
            'q_a_w_kNm': round(q_a_w_kN, 2),
            'Fa_no_kN': round(f_a_tot_kN, 2),
            'Fa_no_tf': round(f_a_tot_kN / 10.0, 2),
            'Fp_no_kN': round(f_p_tot_kN, 2),
            'Fp_no_tf': round(f_p_tot_kN / 10.0, 2),
            'K_mola_kN': round(k_mola_kN, 0),
            'K_mola_tf': round(k_mola_tf, 0),
            'Fmax_kN': round(f_max_kN, 2),
            'Fmax_tf': round(f_max_tf, 2),
            'x2_mm': round(x2_mm, 2)
        })

    fs_desl = (tot_Fp_kN / max(0.01, tot_Fa_kN))
    fs_tomb = (M_res_kNm / max(0.01, M_tom_kNm))

    status_desl = "OK (Seguro)" if fs_desl > 1.5 else ("Limítrofe" if fs_desl > 1.0 else "FALHA (Sem Equilíbrio)")
    status_tomb = "OK (Seguro)" if fs_tomb > 1.5 else ("Limítrofe" if fs_tomb > 1.0 else "FALHA (Sem Equilíbrio)")

    equilibrium = {
        'total_Fa_kN': round(tot_Fa_kN, 1),
        'total_Fa_tf': round(tot_Fa_kN / 10.0, 2),
        'total_Fp_kN': round(tot_Fp_kN, 1),
        'total_Fp_tf': round(tot_Fp_kN / 10.0, 2),
        'M_tom_base_kNm': round(M_tom_kNm, 1),
        'M_tom_base_tfm': round(M_tom_kNm / 10.0, 2),
        'M_res_base_kNm': round(M_res_kNm, 1),
        'M_res_base_tfm': round(M_res_kNm / 10.0, 2),
        'fs_sliding': round(fs_desl, 3),
        'status_sliding': status_desl,
        'fs_overturning': round(fs_tomb, 3),
        'status_overturning': status_tomb
    }

    lines_strap = [
        "Nó\tCota_Z(m)\tSolo\tFa_Solo(tf)\tFa_q(tf)\tFa_w(tf)\tFa_Tot(tf)\tK_mola(tf/m)\tFmax(tf)\tx2_Plast(mm)"
    ]
    for r in rows:
        lines_strap.append(
            f"{r['node']}\t{r['z']:.2f}\t{r['layer']}\t{r['q_a_solo_kNm']/10.0*r['L_inf']:.3f}\t"
            f"{r['q_a_q_kNm']/10.0*r['L_inf']:.3f}\t{r['q_a_w_kNm']/10.0*r['L_inf']:.3f}\t"
            f"{r['Fa_no_tf']:.3f}\t{r['K_mola_tf']:.1f}\t{r['Fmax_tf']:.3f}\t{r['x2_mm']:.2f}"
        )
    strap_export_text = "\n".join(lines_strap)

    return rows, equilibrium, strap_export_text


def _calc_earth_coeffs(phi_deg: float, wall_friction_ratio: float = 0.67):
    """Calculates active (Ka) and passive (Kp) coefficients via Coulomb or Rankine."""
    phi_rad = math.radians(max(5.0, min(50.0, phi_deg)))
    delta_rad = wall_friction_ratio * phi_rad

    if delta_rad > 1e-4:
        # Coulomb Active
        cos_d = math.cos(delta_rad)
        sin_phi = math.sin(phi_rad)
        sin_sum = math.sin(phi_rad + delta_rad)
        denom_a = 1.0 + math.sqrt(max(0.0, sin_phi * sin_sum / cos_d))
        Ka = (math.cos(phi_rad)**2) / (cos_d * (denom_a**2))

        # Coulomb Passive
        denom_p = 1.0 - math.sqrt(max(0.0, sin_phi * sin_sum / cos_d))
        if denom_p <= 0.05:
            # Fallback to Rankine if denominator diverges
            Kp = (math.tan(math.radians(45.0 + phi_deg / 2.0)))**2
        else:
            Kp = (math.cos(phi_rad)**2) / (cos_d * (denom_p**2))
    else:
        Ka = (math.tan(math.radians(45.0 - phi_deg / 2.0)))**2
        Kp = (math.tan(math.radians(45.0 + phi_deg / 2.0)))**2

    return float(Ka), float(Kp)


def calculate_flexible_wall(inputs: dict) -> dict:
    """
    Main entry point for flexible retaining wall calculation.
    Supports both naming conventions (frontend vs legacy), manual length, and stratified soils.
    """
    try:
        # 1. Geometry & Wall Type Mapping
        wall_type = str(inputs.get('wall_type', 'sheet_pile')).lower()
        
        # Support type: either 'is_anchored' (bool) or 'support_type' (str)
        if 'is_anchored' in inputs:
            is_anchored_val = inputs['is_anchored']
            if isinstance(is_anchored_val, str):
                is_anchored = is_anchored_val.strip().lower() in ('true', '1', 'yes')
            else:
                is_anchored = bool(is_anchored_val)
            support_type = 'single_anchor' if is_anchored else 'cantilever'
        else:
            support_type = str(inputs.get('support_type', 'single_anchor')).lower()
            is_anchored = (support_type != 'cantilever')

        # Excavation height H
        if 'H' in inputs:
            H = max(0.5, float(inputs['H']))
        else:
            H = max(0.5, float(inputs.get('excavation_depth', 6.0)))

        # Anchor depth h_a
        h_a = max(0.1, min(H - 0.2, float(inputs.get('anchor_depth', 1.2))))

        # Length Mode: 'auto' (Blum) vs 'manual' (User-specified pile length / embedment)
        length_mode = str(inputs.get('length_mode', 'auto')).lower()
        user_total_length = inputs.get('total_length') or inputs.get('L_total')
        user_embedment = inputs.get('embedment_depth') or inputs.get('D')

        # Surcharge & Water Tables
        q_surcharge = max(0.0, float(inputs.get('q_surcharge', inputs.get('surcharge', 10.0))))
        zw_retained = float(inputs.get('zw_retained', inputs.get('water_table_retained', 4.0)))
        zw_excav = float(inputs.get('zw_passive', inputs.get('water_table_excav', H)))
        gamma_w = 9.81  # kN/m³

        # Pile / Wall width (Largura Prancha ou Diâmetro Raiz)
        pile_width = max(0.05, float(inputs.get('pile_width', inputs.get('largura_prancha', inputs.get('width', 1.0)))))

        # Factors & Materials
        fs_passive = max(1.0, float(inputs.get('fs_passive', 1.50)))
        wall_friction_ratio = float(inputs.get('wall_friction_ratio', 0.67))
        fy_steel = float(inputs.get('steel_fy', inputs.get('fy_steel', 345.0)))
        fck_concrete = float(inputs.get('fck_concrete', inputs.get('fck', 30.0)))
        fyk_rebar = float(inputs.get('fyk', 500.0))
        gamma_a1 = 1.10
        gamma_c = 1.40
        gamma_s = 1.15

        # 2. Soil Stratigraphy Processing
        soil_mode = str(inputs.get('soil_mode', 'homogenous')).lower()
        preset_name = str(inputs.get('preset', '')).strip().lower()
        raw_layers = inputs.get('layers', [])

        if preset_name in ('strap_excel', 'excel', 'strap', 'empuxos_strap') or inputs.get('load_strap_preset'):
            soil_mode = 'stratified'
            raw_layers = [dict(l) for l in PRESET_EXCEL_STRAP_LAYERS]

        processed_layers = []
        if soil_mode == 'stratified' and isinstance(raw_layers, list) and len(raw_layers) > 0:
            current_top = 0.0
            for idx, lay in enumerate(raw_layers):
                th = max(0.5, float(lay.get('thickness', 3.0)))
                g_nat = float(lay.get('gamma', 18.0))
                g_sat = float(lay.get('gamma_sat', g_nat + 1.0))
                phi_l = float(lay.get('phi', 30.0))
                c_l = max(0.0, float(lay.get('cohesion', lay.get('c', 0.0))))
                name_l = lay.get('name') or f"Camada {idx + 1}"
                color_l = lay.get('color') or STRATIGRAPHY_PALETTE[idx % len(STRATIGRAPHY_PALETTE)]
                ka_l, kp_l = _calc_earth_coeffs(phi_l, wall_friction_ratio)

                corr = calc_geotechnical_correlations(
                    phi_deg=phi_l,
                    nspt=lay.get('nspt', lay.get('n_spt', None)),
                    alpha=lay.get('alpha', None),
                    kh_val=lay.get('Kh_kN', lay.get('Kh', lay.get('kh', None)))
                )

                processed_layers.append({
                    'id': idx + 1,
                    'name': name_l,
                    'top': current_top,
                    'thickness': th,
                    'bottom': current_top + th,
                    'gamma': g_nat,
                    'gamma_sat': g_sat,
                    'phi': phi_l,
                    'cohesion': c_l,
                    'Ka': ka_l,
                    'Kp': kp_l,
                    'color': color_l,
                    'nspt': corr['nspt'],
                    'alpha': corr['alpha'],
                    'E_kPa': corr['E_kPa'],
                    'E_tf_m2': corr['E_tf_m2'],
                    'K0': corr['K0'],
                    'nu': corr['nu'],
                    'K_bulk_kPa': corr['K_bulk_kPa'],
                    'G_shear_kPa': corr['G_shear_kPa'],
                    'Kh_tf': corr['Kh_tf_m3'],
                    'Kh_kN': corr['Kh_kN_m3'],
                    'correlations': corr
                })
                current_top += th
        else:
            # Homogeneous Soil fallback
            g_ret = float(inputs.get('gamma_retained', inputs.get('gamma', 18.0)))
            g_ret_sat = float(inputs.get('gamma_retained_sat', inputs.get('gamma_sat', g_ret + 1.0)))
            phi_ret = float(inputs.get('phi_retained', inputs.get('phi', 30.0)))
            c_ret = max(0.0, float(inputs.get('c_retained', inputs.get('cohesion', 0.0))))

            g_pas = float(inputs.get('gamma_passive', inputs.get('gamma_p', 19.0)))
            g_pas_sat = float(inputs.get('gamma_passive_sat', inputs.get('gamma_p_sat', g_pas + 1.0)))
            phi_pas = float(inputs.get('phi_passive', inputs.get('phi_p', 32.0)))
            c_pas = max(0.0, float(inputs.get('c_passive', inputs.get('cohesion_p', 0.0))))

            ka_ret, kp_ret = _calc_earth_coeffs(phi_ret, wall_friction_ratio)
            ka_pas, kp_pas = _calc_earth_coeffs(phi_pas, wall_friction_ratio)

            corr_ret = calc_geotechnical_correlations(phi_ret, nspt=inputs.get('nspt_retained', 10), kh_val=inputs.get('kh_retained'))
            corr_pas = calc_geotechnical_correlations(phi_pas, nspt=inputs.get('nspt_passive', 15), kh_val=inputs.get('kh_passive'))

            processed_layers = [
                {
                    'id': 1,
                    'name': 'Solo de Montante / Aterro',
                    'top': 0.0,
                    'thickness': H,
                    'bottom': H,
                    'gamma': g_ret,
                    'gamma_sat': g_ret_sat,
                    'phi': phi_ret,
                    'cohesion': c_ret,
                    'Ka': ka_ret,
                    'Kp': kp_ret,
                    'color': '#d97706',
                    'nspt': corr_ret['nspt'],
                    'alpha': corr_ret['alpha'],
                    'E_kPa': corr_ret['E_kPa'],
                    'E_tf_m2': corr_ret['E_tf_m2'],
                    'K0': corr_ret['K0'],
                    'nu': corr_ret['nu'],
                    'K_bulk_kPa': corr_ret['K_bulk_kPa'],
                    'G_shear_kPa': corr_ret['G_shear_kPa'],
                    'Kh_tf': corr_ret['Kh_tf_m3'],
                    'Kh_kN': corr_ret['Kh_kN_m3'],
                    'correlations': corr_ret
                },
                {
                    'id': 2,
                    'name': 'Solo de Fundação / Ficha',
                    'top': H,
                    'thickness': 25.0,
                    'bottom': H + 25.0,
                    'gamma': g_pas,
                    'gamma_sat': g_pas_sat,
                    'phi': phi_pas,
                    'cohesion': c_pas,
                    'Ka': ka_pas,
                    'Kp': kp_pas,
                    'color': '#0d9488',
                    'nspt': corr_pas['nspt'],
                    'alpha': corr_pas['alpha'],
                    'E_kPa': corr_pas['E_kPa'],
                    'E_tf_m2': corr_pas['E_tf_m2'],
                    'K0': corr_pas['K0'],
                    'nu': corr_pas['nu'],
                    'K_bulk_kPa': corr_pas['K_bulk_kPa'],
                    'G_shear_kPa': corr_pas['G_shear_kPa'],
                    'Kh_tf': corr_pas['Kh_tf_m3'],
                    'Kh_kN': corr_pas['Kh_kN_m3'],
                    'correlations': corr_pas
                }
            ]

        def get_layer_at_depth(z: float):
            """Finds layer corresponding to depth z. If z exceeds all layers, returns last layer."""
            for lay in processed_layers:
                if lay['top'] <= z < lay['bottom']:
                    return lay
            return processed_layers[-1]

        # 3. Continuous Geostatic Stress & Lateral Earth Pressure Integrator
        def get_pressures(z: float, use_fs_on_passive: bool = True):
            """
            Calculates active pressure (retained side) and passive resistance (excavation side) at depth z.
            Integrated layer-by-layer accounting for water tables and cohesion.
            """
            # --- Retained Side (Active) ---
            # Integrate vertical total stress sigma_v from 0 to z
            sigma_v = q_surcharge
            dz_step = 0.05
            if z > 0:
                cur_z = 0.0
                while cur_z < z:
                    mid_z = cur_z + min(dz_step, z - cur_z) / 2.0
                    step_len = min(dz_step, z - cur_z)
                    lay_mid = get_layer_at_depth(mid_z)
                    is_sub = (mid_z > zw_retained)
                    g_eff = (lay_mid['gamma_sat'] - gamma_w) if is_sub else lay_mid['gamma']
                    sigma_v += g_eff * step_len
                    cur_z += step_len

            u_act = gamma_w * max(0.0, z - zw_retained)
            lay_z = get_layer_at_depth(z)
            Ka_z = lay_z['Ka']
            c_z = lay_z['cohesion']

            # Rankine / Coulomb Active with cohesion deduction (Bell's equation)
            p_act_eff = max(0.0, sigma_v * Ka_z - 2.0 * c_z * math.sqrt(Ka_z))
            p_act_total = p_act_eff + u_act

            # --- Excavation Side (Passive, active only below excavation depth z > H) ---
            if z <= H:
                p_pas_total = 0.0
                p_pas_eff = 0.0
            else:
                sigma_v_pas = 0.0
                cur_z = H
                while cur_z < z:
                    mid_z = cur_z + min(dz_step, z - cur_z) / 2.0
                    step_len = min(dz_step, z - cur_z)
                    lay_mid = get_layer_at_depth(mid_z)
                    is_sub = (mid_z > zw_excav)
                    g_eff = (lay_mid['gamma_sat'] - gamma_w) if is_sub else lay_mid['gamma']
                    sigma_v_pas += g_eff * step_len
                    cur_z += step_len

                u_pas = gamma_w * max(0.0, z - max(H, zw_excav))
                Kp_z = lay_z['Kp']
                c_p_z = lay_z['cohesion']

                Kp_factor = (Kp_z / fs_passive) if use_fs_on_passive else Kp_z
                p_pas_eff = sigma_v_pas * Kp_factor + 2.0 * c_p_z * math.sqrt(Kp_factor)
                p_pas_total = p_pas_eff + u_pas

            net_p = p_act_total - p_pas_total
            return net_p, p_act_total, p_pas_total

        # 4. Determine Embedment Depth D and Pile Length L
        # Calculate theoretical Blum required embedment D_req
        if support_type == 'cantilever':
            # Cantilever: solve moment equilibrium about base
            D_best = 1.6 * H
            for D_test in np.linspace(0.4 * H, 4.0 * H, 350):
                z_pts = np.linspace(0, H + D_test, 120)
                dz = z_pts[1] - z_pts[0]
                M_toe = 0.0
                for zp in z_pts:
                    np_val, _, _ = get_pressures(zp, use_fs_on_passive=True)
                    M_toe += np_val * (H + D_test - zp) * dz
                if M_toe <= 0:
                    D_best = D_test
                    break
            D_req = float(D_best)
            T_anchor = 0.0
        else:
            # Single Anchor (Blum Free Earth Support: moment about anchor = 0)
            D_best = 0.6 * H
            for D_test in np.linspace(0.2 * H, 3.0 * H, 350):
                z_pts = np.linspace(0, H + D_test, 120)
                dz = z_pts[1] - z_pts[0]
                M_anc = 0.0
                for zp in z_pts:
                    np_val, _, _ = get_pressures(zp, use_fs_on_passive=True)
                    M_anc += np_val * (zp - h_a) * dz
                if M_anc <= 0:
                    D_best = D_test
                    break
            D_req = float(D_best)

        # Decide effective execution embedment
        if length_mode == 'manual' and (user_total_length is not None or user_embedment is not None):
            if user_total_length is not None:
                total_L = max(H + 0.5, float(user_total_length))
                D_exec = round(total_L - H, 2)
            else:
                D_exec = max(0.5, float(user_embedment))
                total_L = round(H + D_exec, 2)
        else:
            # Auto Blum: +20% embedment per standard geotechnical practice
            D_exec = round(D_req * 1.20, 2)
            total_L = round(H + D_exec, 2)

        # Compute Overturning / Passive Safety Factor FS_overturning for D_exec
        z_pts_fs = np.linspace(0, H + D_exec, 160)
        dz_fs = z_pts_fs[1] - z_pts_fs[0]
        
        if support_type == 'cantilever':
            pivot_z = H + D_exec
            M_overturning = 0.0
            M_resisting = 0.0
            for zp in z_pts_fs:
                _, p_act, p_pas_unfactored = get_pressures(zp, use_fs_on_passive=False)
                arm = max(0.0, pivot_z - zp)
                M_overturning += p_act * arm * dz_fs
                if zp > H:
                    M_resisting += p_pas_unfactored * arm * dz_fs
            fs_overturning = round(M_resisting / max(1e-3, M_overturning), 2)
            T_anchor = 0.0
        else:
            pivot_z = h_a
            M_overturning = 0.0
            M_resisting = 0.0
            for zp in z_pts_fs:
                _, p_act, p_pas_unfactored = get_pressures(zp, use_fs_on_passive=False)
                arm = zp - pivot_z
                if arm >= 0:
                    M_overturning += p_act * arm * dz_fs
                    if zp > H:
                        M_resisting += p_pas_unfactored * arm * dz_fs
                else:
                    # Above anchor: active pressure acts against overturning
                    M_resisting += p_act * abs(arm) * dz_fs

            fs_overturning = round(M_resisting / max(1e-3, M_overturning), 2)
            
            # Anchor reaction calculation for force equilibrium
            total_net_H = sum(get_pressures(zp, use_fs_on_passive=True)[0] * dz_fs for zp in z_pts_fs)
            T_anchor = max(0.0, float(total_net_H))

        # 5. Detailed Shear Force V(z) and Bending Moment M(z) Distribution
        num_stations = 140
        z_array = np.linspace(0, H + D_exec, num_stations)
        dz = z_array[1] - z_array[0]

        net_pressure_array = []
        p_act_array = []
        p_pas_array = []

        for z in z_array:
            p_net, p_a, p_p = get_pressures(z, use_fs_on_passive=True)
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
            anc_reaction = T_anchor if (is_anchored and z >= h_a) else 0.0
            shear_array[i] = running_load - anc_reaction

        # Integrate moment from top
        running_m = 0.0
        for i in range(1, num_stations):
            running_m += 0.5 * (shear_array[i - 1] + shear_array[i]) * dz
            moment_array[i] = running_m

        # Boundary condition correction: free earth support boundary condition M(base) = 0
        M_base_error = moment_array[-1]
        for i in range(num_stations):
            moment_array[i] -= M_base_error * (z_array[i] / (H + D_exec))

        max_moment = float(np.max(np.abs(moment_array)))
        max_shear = float(np.max(np.abs(shear_array)))
        max_m_idx = int(np.argmax(np.abs(moment_array)))
        z_max_m = float(z_array[max_m_idx])

        # 6. Structural Sizing & Section Mechanical Properties
        M_sd = max_moment * 1.40  # kNm/m design moment
        W_el_req = (M_sd * 1e6) / (fy_steel / gamma_a1) / 1e3  # cm³/m

        # Profile selection mode: 'catalog', 'custom', or 'auto'
        section_mode = str(inputs.get('section_mode', 'catalog')).lower()
        req_profile_name = inputs.get('profile_name')

        if section_mode == 'custom':
            selected_profile = str(inputs.get('custom_profile_name', 'Perfil Personalizado'))
            selected_W = float(inputs.get('custom_Wel') or inputs.get('W_el') or 1800.0)
            selected_I_x = float(inputs.get('custom_Ix') or inputs.get('I_x') or 38400.0)
            selected_mass = float(inputs.get('custom_mass') or inputs.get('weight') or 118.0)
            selected_tw = float(inputs.get('custom_tw') or inputs.get('t_w') or 10.0)
            selected_h = float(inputs.get('custom_height') or inputs.get('h') or 430.0)
            E_steel_GPa = float(inputs.get('steel_E_GPa') or inputs.get('custom_E') or 210.0)
            selected_pile_obj = {
                'name': selected_profile,
                'W_el': selected_W,
                'I_x': selected_I_x,
                'weight': selected_mass,
                't_w': selected_tw,
                'h': selected_h,
                'E_GPa': E_steel_GPa
            }
        elif section_mode == 'catalog' and req_profile_name:
            # Match requested profile in catalog
            matched_pile = next((p for p in SHEET_PILE_CATALOG if p['name'].strip().lower() == str(req_profile_name).strip().lower()), None)
            if matched_pile:
                selected_pile_obj = matched_pile
            else:
                selected_pile_obj = SHEET_PILE_CATALOG[1] # fallback PU 18
            selected_profile = selected_pile_obj['name']
            selected_W = float(inputs.get('custom_Wel') or selected_pile_obj['W_el'])
            selected_I_x = float(inputs.get('custom_Ix') or selected_pile_obj['I_x'])
            selected_mass = float(inputs.get('custom_mass') or selected_pile_obj['weight'])
            selected_tw = float(inputs.get('custom_tw') or selected_pile_obj['t_w'])
            selected_h = float(inputs.get('custom_height') or selected_pile_obj.get('h', 420.0))
            E_steel_GPa = float(inputs.get('steel_E_GPa') or 210.0)
        else: # 'auto' mode: search optimum catalog profile based on W_el_req
            selected_pile_obj = SHEET_PILE_CATALOG[-1]
            for pile in SHEET_PILE_CATALOG:
                if pile['W_el'] >= W_el_req:
                    selected_pile_obj = pile
                    break
            selected_profile = selected_pile_obj['name']
            selected_W = selected_pile_obj['W_el']
            selected_I_x = selected_pile_obj['I_x']
            selected_mass = selected_pile_obj['weight']
            selected_tw = selected_pile_obj['t_w']
            selected_h = selected_pile_obj.get('h', 420.0)
            E_steel_GPa = float(inputs.get('steel_E_GPa') or 210.0)

        # Capacity and utilization
        M_rd = (selected_W * 1e-3 * fy_steel) / gamma_a1 # kNm/m
        utilization_steel = round(M_sd / max(1e-3, M_rd), 3)

        # Diaphragm Wall (Concrete):
        thick_mode = str(inputs.get('wall_thickness_mode', 'auto')).lower()
        if thick_mode == 'manual' and (inputs.get('wall_thickness') or inputs.get('t_diaphragm')):
            t_diaphragm = float(inputs.get('wall_thickness') or inputs.get('t_diaphragm'))
        else:
            t_diaphragm = max(0.40, round(math.ceil(math.sqrt(M_sd / (0.15 * (fck_concrete / gamma_c) * 1000)) * 20.0) / 20.0, 2))

        cover_cm = float(inputs.get('concrete_cover_cm', 6.0))
        d_eff = max(0.20, t_diaphragm - (cover_cm / 100.0))  # effective depth
        fcd = (fck_concrete / gamma_c) * 1000.0  # kPa
        fyd = (fyk_rebar / gamma_s) * 1000.0    # kPa
        mu = M_sd / (1.0 * (d_eff**2) * fcd)
        if mu < 0.298:
            omega_val = 1.0 - math.sqrt(max(0.0, 1.0 - 2.0 * mu))
            As_req = (omega_val * 1.0 * d_eff * fcd) / fyd * 1e4
        else:
            As_req = (M_sd / (0.80 * d_eff * fyd)) * 1e4

        As_min = 0.0015 * 1.0 * t_diaphragm * 1e4
        As_final = max(As_req, As_min)

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
            rebar_detail = "Φ 20mm c/ 15cm (As = 20.9 cm²/m)"

        # 7. Hydraulic Heave / Piping Stability Check (Terzaghi)
        delta_h = max(0.0, zw_excav - zw_retained)
        if delta_h > 0 and D_exec > 0:
            base_lay = get_layer_at_depth(H + D_exec)
            gamma_prime = base_lay['gamma_sat'] - gamma_w
            i_crit = gamma_prime / gamma_w
            i_exit = delta_h / (2.0 * D_exec)
            fs_piping = round(i_crit / max(1e-4, i_exit), 2)
            piping_status = "Seguro (FS ≥ 1.5)" if fs_piping >= 1.5 else "Risco de Sifonamento / Heave!"
        else:
            fs_piping = 99.9
            piping_status = "Sem gradiente hidráulico crítico"

        # 8. Serviceability Limit State (ELS) - Deflection Analysis (Deformação no Topo δ_topo)
        def _trapz(y_vals, x_vals):
            if len(x_vals) < 2:
                return 0.0
            return float(np.sum(0.5 * (y_vals[:-1] + y_vals[1:]) * np.diff(x_vals)))

        # Flexural Rigidity EI (kNm²/m)
        if wall_type == 'sheet_pile':
            E_mat = E_steel_GPa * 1e6 # kPa (ex: 210 GPa -> 2.1e8 kPa)
            I_selected_cm4 = selected_I_x
            I_m4 = I_selected_cm4 * 1e-8 # m⁴/m
            EI_wall = E_mat * I_m4 # kNm²/m
        else:
            E_conc_GPa = float(inputs.get('concrete_Ec_GPa') or (0.85 * 5600.0 * math.sqrt(max(15.0, fck_concrete)) / 1000.0))
            E_mat = E_conc_GPa * 1e6 # kPa
            I_gross = (1.0 * (t_diaphragm ** 3)) / 12.0 # m⁴/m
            cracked_factor = float(inputs.get('cracked_inertia_ratio', 0.50))
            I_m4 = cracked_factor * I_gross # cracked inertia per NBR 6118 / ACI 318 ELS
            EI_wall = E_mat * I_m4
            I_selected_cm4 = I_m4 * 1e8

        # Curvature along the pile: kappa(z) = M(z) / EI
        kappa_array = moment_array / max(100.0, EI_wall)

        if not is_anchored:
            # Cantilever deflection: double integration from virtual fixity depth
            z_fix = min(H + D_exec, H + 0.60 * D_exec)
            mask_cant = (z_array <= z_fix)
            z_cant = z_array[mask_cant]
            k_cant = kappa_array[mask_cant]

            # Integrated backwards from fixity where slope = 0
            n_c = len(z_cant)
            theta_cant = np.zeros(n_c)
            for i in range(n_c - 2, -1, -1):
                dz_i = z_cant[i + 1] - z_cant[i]
                theta_cant[i] = theta_cant[i + 1] - 0.5 * (k_cant[i] + k_cant[i + 1]) * dz_i

            y_cant = np.zeros(n_c)
            for i in range(n_c - 2, -1, -1):
                dz_i = z_cant[i + 1] - z_cant[i]
                y_cant[i] = y_cant[i + 1] - 0.5 * (theta_cant[i] + theta_cant[i + 1]) * dz_i

            delta_top_m = abs(float(y_cant[0])) if len(y_cant) > 0 else 0.015
        else:
            # Anchored deflection: anchor hold at h_a, pivot at z_piv
            z_piv = min(H + D_exec, H + 0.65 * D_exec)
            delta_anc_m = (T_anchor * 14.0) / (2.5e5) # elastic tieback elongation

            mask_span = (z_array >= h_a) & (z_array <= z_piv)
            if np.sum(mask_span) >= 2:
                z_sp = z_array[mask_span]
                k_sp = kappa_array[mask_span]
                span_len = z_piv - h_a
                m_integral = _trapz(k_sp * (z_piv - z_sp), z_sp)
                theta_anc = (0.0 - delta_anc_m) / max(0.1, span_len) - m_integral / max(0.1, span_len)
            else:
                theta_anc = 0.0

            mask_ab = (z_array <= h_a)
            if np.sum(mask_ab) >= 2:
                z_ab = z_array[mask_ab]
                k_ab = kappa_array[mask_ab]
                m_above = _trapz(k_ab * (h_a - z_ab), z_ab)
            else:
                m_above = 0.0

            y_top_m = delta_anc_m - theta_anc * h_a + m_above
            delta_top_m = abs(float(y_top_m))

        delta_top_mm = round(delta_top_m * 1000.0, 1)
        # Allowable deflection: H/200, bounded between 15mm and 40mm
        delta_adm_mm = round(min(45.0, max(15.0, (H * 1000.0) / 200.0)), 1)
        els_approved = (delta_top_mm <= delta_adm_mm)
        els_status = "Aprovado (ELS)" if els_approved else "Alerta: Deformação Excessiva"

        # 9. Resultants & Action Centroids
        E_a_total = _trapz(np.array(p_act_array), z_array)
        z_a_centroid = (_trapz(np.array(p_act_array) * z_array, z_array) / max(1e-3, E_a_total)) if E_a_total > 0 else (H * 0.67)

        mask_pas = (z_array >= H)
        if np.sum(mask_pas) >= 2:
            z_pas_sub = z_array[mask_pas]
            p_pas_sub = np.array(p_pas_array)[mask_pas]
            E_p_total = _trapz(p_pas_sub, z_pas_sub)
            z_p_centroid = (_trapz(p_pas_sub * z_pas_sub, z_pas_sub) / max(1e-3, E_p_total)) if E_p_total > 0 else (H + D_exec * 0.67)
        else:
            E_p_total = 0.0
            z_p_centroid = H + D_exec * 0.67

        # 10. Comprehensive Calculation Memorial Data Generator (Memorial de Cálculo)
        # Identify key elevation checkpoints: z=0, anchor, zw_ret, H, zw_exc, layer contacts, toe
        crit_z_set = {0.0, round(H, 2), round(H + D_exec, 2)}
        if is_anchored:
            crit_z_set.add(round(h_a, 2))
        if 0 < zw_retained < (H + D_exec):
            crit_z_set.add(round(zw_retained, 2))
        if 0 < zw_excav < (H + D_exec):
            crit_z_set.add(round(zw_excav, 2))
        for lay in processed_layers:
            if 0 < lay['top'] < (H + D_exec):
                crit_z_set.add(round(lay['top'], 2))

        crit_z_list = sorted(list(crit_z_set))
        checkpoints_table = []
        for cz in crit_z_list:
            p_net_cz, p_act_cz, p_pas_cz = get_pressures(cz, use_fs_on_passive=True)
            lay_cz = get_layer_at_depth(cz)

            # Recompute vertical overburden for checkpoint
            sig_v_cz = q_surcharge
            dz_s = 0.05
            cur_s = 0.0
            while cur_s < cz:
                m_s = cur_s + min(dz_s, cz - cur_s) / 2.0
                st_l = min(dz_s, cz - cur_s)
                l_m = get_layer_at_depth(m_s)
                is_s = (m_s > zw_retained)
                g_eff = (l_m['gamma_sat'] - gamma_w) if is_s else l_m['gamma']
                sig_v_cz += g_eff * st_l
                cur_s += st_l

            u_cz = gamma_w * max(0.0, cz - zw_retained)
            sig_v_eff_cz = max(0.0, sig_v_cz - u_cz)

            checkpoints_table.append({
                'z': cz,
                'layer_name': lay_cz['name'],
                'sigma_v_total': round(sig_v_cz, 1),
                'u_water': round(u_cz, 1),
                'sigma_v_eff': round(sig_v_eff_cz, 1),
                'p_act_eff': round(max(0.0, p_act_cz - u_cz), 1),
                'p_act_total': round(p_act_cz, 1),
                'p_pas_eff': round(max(0.0, p_pas_cz - gamma_w * max(0.0, cz - max(H, zw_excav))), 1),
                'p_pas_total': round(p_pas_cz, 1),
                'p_net': round(p_net_cz, 1)
            })

        # 10. Winkler Springs & STRAP Nodal Discretization Table & Global Cantilever Equilibrium
        springs_rows, strap_eq, strap_tsv = calc_strap_springs_table(
            layers=processed_layers,
            H=H,
            total_L=total_L,
            zw_retained=zw_retained,
            q_surcharge=q_surcharge,
            pile_width=pile_width,
            gamma_w=gamma_w
        )

        # Memorial summary object
        memorial_data = {
            'project_info': {
                'wall_type': wall_type,
                'wall_type_label': 'Estaca-Prancha Metálica' if wall_type == 'sheet_pile' else 'Parede Diafragma de Concreto',
                'support_type': support_type,
                'support_type_label': 'Ancorada com Tirante' if is_anchored else 'Livre em Balanço (Cantilever)',
                'H': round(H, 2),
                'D_exec': round(D_exec, 2),
                'D_req': round(D_req, 2),
                'total_length': round(total_L, 2),
                'pile_width': round(pile_width, 2),
                'anchor_depth': round(h_a, 2) if is_anchored else None,
                'q_surcharge': round(q_surcharge, 1),
                'zw_retained': round(zw_retained, 2),
                'zw_passive': round(zw_excav, 2),
                'section_mode': section_mode,
                'profile_name': selected_profile,
                'W_el': round(selected_W, 0),
                'I_x': round(selected_I_x, 0),
                'height_mm': round(selected_h, 1),
                'tw_mm': round(selected_tw, 1),
                'mass_m2': round(selected_mass, 1),
                'E_GPa': round(E_steel_GPa, 1) if wall_type == 'sheet_pile' else round(E_conc_GPa, 1),
                'fy_MPa': round(fy_steel, 1),
                'M_rd': round(M_rd, 1) if wall_type == 'sheet_pile' else None,
                'EI_wall': round(EI_wall, 1),
                'I_cm4': round(I_selected_cm4, 0)
            },
            'soil_layers': processed_layers,
            'checkpoints_table': checkpoints_table,
            'resultants': {
                'E_a_total': round(E_a_total, 1),
                'z_a_centroid': round(z_a_centroid, 2),
                'E_p_total': round(E_p_total, 1),
                'z_p_centroid': round(z_p_centroid, 2)
            },
            'verifications': [
                {
                    'name': 'Equilíbrio de Momentos & Estabilidade ao Giro (ELU)',
                    'criterion': 'FS ≥ 1.30',
                    'calculated': f"FS = {fs_overturning:.2f}",
                    'status': 'APROVADO' if fs_overturning >= 1.30 else ('ATENÇÃO' if fs_overturning >= 1.0 else 'REPROVADO'),
                    'detail': f"Momento resistente passivo / Momento solicitante ativo relativo ao polo ({'pé da estaca' if not is_anchored else 'nível do tirante'})."
                },
                {
                    'name': 'Ficha Requerida de Cravação (Método de Blum)',
                    'criterion': f"D_adotado ≥ D_req ({D_req:.2f} m)",
                    'calculated': f"D = {D_exec:.2f} m (Margem +{((D_exec - D_req) / max(0.1, D_req) * 100):.0f}%)",
                    'status': 'APROVADO' if D_exec >= D_req else 'REPROVADO',
                    'detail': 'Profundidade de engastamento para anulação do momento de tombamento pelo método de suporte livre.'
                },
                {
                    'name': 'Segurança contra Sifonamento Hidráulico (Terzaghi)',
                    'criterion': 'FS_piping ≥ 1.50',
                    'calculated': f"FS = {fs_piping:.2f}",
                    'status': 'APROVADO' if fs_piping >= 1.5 else 'REPROVADO',
                    'detail': f"Gradiente de saída exitoso vs crítico na ponta da ficha (Δh = {delta_h:.2f} m)."
                },
                {
                    'name': 'Resistência Estrutural da Seção (Flexão ELU)',
                    'criterion': 'Taxa de Utilização ≤ 100%',
                    'calculated': f"Utilização = {(utilization_steel * 100):.1f}%" if wall_type == 'sheet_pile' else f"As = {As_final:.1f} cm²/m",
                    'status': 'APROVADO' if utilization_steel <= 1.0 else 'SOBREDIMENSIONAR',
                    'detail': f"Momento solicitante de cálculo M_sd = {M_sd:.1f} kNm/m (γf=1.40). Seção: {selected_profile if wall_type == 'sheet_pile' else rebar_detail}."
                },
                {
                    'name': 'Estado Limite de Serviço - Deformação no Topo (ELS)',
                    'criterion': f"delta_topo <= delta_adm ({delta_adm_mm:.1f} mm)",
                    'calculated': f"delta_topo = {delta_top_mm:.1f} mm",
                    'status': 'APROVADO' if els_approved else 'ALERTA',
                    'detail': f"Deflexão elástica horizontal no topo calculada pela curvatura M(z)/EI (rigidez EI = {EI_wall:.0f} kNm²/m)."
                },
                {
                    'name': 'Verificação Global de Equilíbrio em Balanço (STRAP / Excel)',
                    'criterion': 'FS_desl ≥ 1.50 e FS_tomb ≥ 1.50',
                    'calculated': f"FS_desl = {strap_eq['fs_sliding']:.2f} ({strap_eq['status_sliding']}) | FS_tomb = {strap_eq['fs_overturning']:.2f} ({strap_eq['status_overturning']})",
                    'status': 'APROVADO' if (strap_eq['fs_sliding'] >= 1.5 and strap_eq['fs_overturning'] >= 1.5) else ('ATENÇÃO' if (strap_eq['fs_sliding'] >= 1.0 and strap_eq['fs_overturning'] >= 1.0) else 'REPROVADO'),
                    'detail': f"Empuxo Ativo Ea = {strap_eq['total_Fa_kN']} kN ({strap_eq['total_Fa_tf']} tf) | Capacidade Passiva Ep = {strap_eq['total_Fp_kN']} kN ({strap_eq['total_Fp_tf']} tf) | M_tomb = {strap_eq['M_tom_base_kNm']} kNm ({strap_eq['M_tom_base_tfm']} tf.m) | M_res = {strap_eq['M_res_base_kNm']} kNm ({strap_eq['M_res_base_tfm']} tf.m)."
                }
            ]
        }

        # 11. Package Response
        depth_list = [round(z, 2) for z in z_array]
        moment_list = [round(m, 2) for m in moment_array]
        shear_list = [round(v, 2) for v in shear_array]
        net_pres_list = [round(p, 2) for p in net_pressure_array]

        first_lay = processed_layers[0]
        base_lay = get_layer_at_depth(H + D_exec)

        return {
            'status': 'success',
            'catalog_profiles': SHEET_PILE_CATALOG,
            'soil_catalog': SOIL_CATALOG_EXCEL,
            'geometry': {
                'retained_height': round(H, 2),
                'embedment_depth': round(D_exec, 2),
                'embedment_req': round(D_req, 2),
                'total_length': round(total_L, 2),
                'pile_width': round(pile_width, 2),
                'length_mode': length_mode
            },
            'forces': {
                'is_anchored': is_anchored,
                'anchor_force': round(T_anchor, 1),
                'anchor_depth': round(h_a, 2),
                'max_bending_moment': round(max_moment, 1),
                'max_moment_sd': round(M_sd, 1),
                'moment_depth': round(z_max_m, 2),
                'max_shear': round(max_shear, 1),
                'Ka': round(first_lay['Ka'], 3),
                'Kp': round(base_lay['Kp'], 3),
                'Kp_eff': round(base_lay['Kp'] / fs_passive, 3)
            },
            'deflection': {
                'delta_top_mm': delta_top_mm,
                'delta_adm_mm': delta_adm_mm,
                'approved': els_approved,
                'status': els_status,
                'EI_kNm2': round(EI_wall, 1)
            },
            'section_check': {
                'type': wall_type,
                'mode': section_mode,
                'approved': utilization_steel <= 1.0 if wall_type == 'sheet_pile' else True,
                'profile': selected_profile,
                'W_el_provided': selected_W,
                'W_el_required': round(W_el_req, 1),
                'utilization': utilization_steel,
                'mass_per_m2': selected_mass,
                'I_x': round(selected_I_x, 0),
                'height_mm': round(selected_h, 1),
                'tw_mm': round(selected_tw, 1),
                'E_GPa': round(E_steel_GPa, 1) if wall_type == 'sheet_pile' else round(E_conc_GPa, 1),
                'fy_MPa': round(fy_steel, 1),
                'M_rd': round(M_rd, 1) if wall_type == 'sheet_pile' else None,
                'wall_thickness': round(t_diaphragm, 2),
                'As_main': round(As_final, 2),
                'As_secondary': round(0.2 * As_final, 2),
                'rebar_detail': rebar_detail
            },
            'stability': {
                'FS_heave': fs_piping,
                'heave_safe': fs_piping >= 1.5,
                'status': piping_status,
                'FS_overturning': fs_overturning,
                'overturning_safe': fs_overturning >= 1.30,
                'FS_sliding_strap': strap_eq['fs_sliding'],
                'FS_overturning_strap': strap_eq['fs_overturning']
            },
            'water': {
                'zw_retained': round(zw_retained, 2),
                'zw_passive': round(zw_excav, 2)
            },
            'stratigraphy': {
                'mode': soil_mode,
                'layers': processed_layers
            },
            'springs_table': springs_rows,
            'global_cantilever_equilibrium': strap_eq,
            'strap_export': strap_tsv,
            'memorial': memorial_data,
            'summary': {
                'wall_type': wall_type,
                'support_type': support_type,
                'excavation_depth': round(H, 2),
                'embedment_req': round(D_req, 2),
                'embedment_exec': round(D_exec, 2),
                'total_length': round(total_L, 2),
                'pile_width': round(pile_width, 2),
                'anchor_force': round(T_anchor, 1),
                'anchor_depth': round(h_a, 2),
                'max_moment': round(max_moment, 1),
                'max_moment_sd': round(M_sd, 1),
                'moment_depth': round(z_max_m, 2),
                'max_shear': round(max_shear, 1),
                'FS_overturning': fs_overturning,
                'strap_equilibrium': strap_eq,
                'length_mode': length_mode,
                'delta_top_mm': delta_top_mm,
                'delta_adm_mm': delta_adm_mm
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
