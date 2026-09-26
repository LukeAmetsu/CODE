import math

def calc_strap_springs_table(layers, H, total_L, zw_retained, q_surcharge, pile_width=1.0, gamma_w=9.81):
    """
    Computes Winkler spring stiffnesses, plastification threshold forces,
    and STRAP yield displacements x2 (mm) based on Empuxos_Atualizados_Interfaces.xlsx.
    Supports both kN and tf output.
    """
    # Grid of stations along the pile
    step = 0.5
    raw_stations = []
    curr = 0.0
    while curr <= total_L + 1e-4:
        raw_stations.append(round(curr, 3))
        curr += step

    # Insert layer boundaries & excavation depth H
    specials = [round(H, 3)]
    for lay in layers:
        top_z = round(lay.get('top', 0.0), 3)
        bot_z = round(lay.get('bottom', total_L), 3)
        if 0 < top_z < total_L:
            specials.append(top_z)
        if 0 < bot_z < total_L:
            specials.append(bot_z)

    all_z = sorted(list(set(raw_stations + specials)))

    # Handle infinitesimal transitions at layer boundaries for stratum transition
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

    # Tributary lengths L_inf
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

        # Kh
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

        # Active
        u_act = max(0.0, (z - zw_retained) * gamma_w)
        sigma_v_prime_act = max(0.0, sigma_v_act - u_act)
        sigma_a_solo_eff = max(0.0, sigma_v_prime_act * ka - 2.0 * c_val * math.sqrt(ka))
        sigma_a_q_eff = q_surcharge * ka
        sigma_a_total = sigma_a_solo_eff + sigma_a_q_eff + u_act

        # Passive
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

        f_a_solo_kN = q_a_solo_kN * l_inf
        f_a_q_kN = q_a_q_kN * l_inf
        f_a_w_kN = q_a_w_kN * l_inf
        f_a_tot_kN = (sigma_a_solo_eff + sigma_a_q_eff) * pile_width * l_inf  # effective soil + q
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

    # Build STRAP export text (TSV for easy copy-paste into STRAP or Excel)
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

print("Function defined and compiled cleanly.")
