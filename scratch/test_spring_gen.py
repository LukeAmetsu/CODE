import math

def generate_excel_springs_table(layers, H, L_total, zw_ret, q_sur, pile_w=1.0, gamma_w=1.0, is_tf=True):
    """
    Generates the discrete nodal springs table and global equilibrium matching the Excel structure.
    If is_tf is True, inputs/outputs are in (tf, m). If False, (kN, m, kPa).
    """
    # Build list of z stations: 0.5m grid + interface boundaries
    z_raw = []
    # Layer boundaries
    layer_bounds = [lay['top'] for lay in layers] + [lay['bottom'] for lay in layers]
    layer_bounds = sorted(list(set([round(b, 3) for b in layer_bounds if 0 <= b <= L_total])))
    
    # 0.5m increments
    cur_z = 0.0
    while cur_z <= L_total + 1e-4:
        z_raw.append(round(cur_z, 3))
        cur_z += 0.5
    
    # Combine and handle interfaces with small epsilon if matching Excel style
    z_all = sorted(list(set(z_raw + layer_bounds)))
    
    # To match Excel interface duplicates or 0.001 transitions:
    z_stations = []
    for z in z_all:
        # If z is an internal boundary between layers (not 0 and not L_total), add z and z + 0.001
        is_inner_bound = any(abs(z - b) < 1e-4 for b in layer_bounds if 0 < b < L_total)
        if is_inner_bound:
            z_stations.append(z)
            z_stations.append(round(z + 0.001, 3))
        elif abs(z - H) < 1e-4:
            # At excavation boundary H, duplicate like row 42 and 43 in Excel if desired
            z_stations.append(z)
            z_stations.append(z)
        else:
            z_stations.append(z)
            
    # Sort
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

    # Pre-calculate tributary lengths L_inf
    n = len(z_stations)
    l_inf_list = []
    for i in range(n):
        if i == 0:
            l_inf = (z_stations[1] - z_stations[0]) / 2.0
        elif i == n - 1:
            l_inf = (z_stations[n-1] - z_stations[n-2]) / 2.0
        else:
            # Excel formula: (A[i+1] - A[i-1])/2, or if duplicate / interface:
            if abs(z_stations[i] - z_stations[i-1]) < 0.005:
                # bottom side of interface
                if i + 1 < n:
                    l_inf = (z_stations[i+1] - z_stations[i]) / 2.0
                else:
                    l_inf = 0.25
            elif i + 1 < n and abs(z_stations[i+1] - z_stations[i]) < 0.005:
                # top side of interface
                l_inf = (z_stations[i] - z_stations[i-1]) / 2.0
            else:
                l_inf = (z_stations[i+1] - z_stations[i-1]) / 2.0
        l_inf_list.append(max(0.001, l_inf))

    rows = []
    tot_Fa = 0.0
    tot_Fp = 0.0
    M_tom = 0.0
    M_res = 0.0

    sigma_v_act_accum = 0.0
    sigma_v_pas_accum = 0.0
    prev_z = 0.0

    for i, z in enumerate(z_stations):
        # Determine if this station is top or bottom of interface
        is_bottom_of_interface = (i > 0 and abs(z - z_stations[i-1]) < 0.005)
        lay = get_layer(z, prefer_lower=is_bottom_of_interface)
        
        # Accumulate vertical stress
        dz = max(0.0, z - prev_z)
        if dz > 0:
            sigma_v_act_accum += lay['gamma'] * dz
            if z > H:
                dz_pas = z - max(H, prev_z)
                sigma_v_pas_accum += lay['gamma'] * dz_pas
        prev_z = z

        phi_rad = math.radians(lay['phi'])
        ka = (math.tan(math.pi/4.0 - phi_rad/2.0))**2
        kp = (math.tan(math.pi/4.0 + phi_rad/2.0))**2
        kh = lay.get('Kh', 1000.0)
        c = lay.get('c', 0.0)
        l_inf = l_inf_list[i]

        u_act = max(0.0, (z - zw_ret) * gamma_w)
        sigma_v_prime_act = max(0.0, sigma_v_act_accum - u_act)
        
        sigma_a_solo_eff = max(0.0, sigma_v_prime_act * ka - 2.0 * c * math.sqrt(ka))
        sigma_a_q_eff = q_sur * ka
        sigma_a_total = sigma_a_solo_eff + sigma_a_q_eff + u_act

        # Passive
        if z >= H:
            u_pas = max(0.0, (z - max(H, zw_ret)) * gamma_w)
            sigma_v_prime_pas = max(0.0, sigma_v_pas_accum - u_pas)
            sigma_p_solo_eff = sigma_v_prime_pas * kp + 2.0 * c * math.sqrt(kp)
            sigma_p_total = sigma_p_solo_eff + u_pas
            k_mola = kh * pile_w * l_inf
            f_max = sigma_p_solo_eff * pile_w * l_inf
            x2 = (f_max / k_mola * 1000.0) if k_mola > 0 else 0.0
        else:
            u_pas = 0.0
            sigma_v_prime_pas = 0.0
            sigma_p_solo_eff = 0.0
            sigma_p_total = 0.0
            k_mola = 0.0
            f_max = 0.0
            x2 = 0.0

        q_a_solo = sigma_a_solo_eff * pile_w
        q_a_q = sigma_a_q_eff * pile_w
        q_a_w = u_act * pile_w

        # Note: in Excel, Col Y (Força Ativa Nó) = (sigma_a_solo + sigma_a_q) * B * l_inf
        f_a_no = (sigma_a_solo_eff + sigma_a_q_eff) * pile_w * l_inf
        f_p_no = sigma_p_total * pile_w * l_inf

        tot_Fa += f_a_no
        tot_Fp += f_p_no
        M_tom += f_a_no * (L_total - z)
        M_res += f_p_no * (L_total - z)

        rows.append({
            'node': i + 1,
            'z': z,
            'layer': lay['name'],
            'nspt': lay.get('nspt', '-'),
            'gamma': lay['gamma'],
            'c': c,
            'phi': lay['phi'],
            'Ka': round(ka, 3),
            'Kp': round(kp, 3),
            'Kh': round(kh, 1),
            'L_inf': round(l_inf, 3),
            'u_act': round(u_act, 2),
            'sigma_v_prime_act': round(sigma_v_prime_act, 2),
            'sigma_a_solo': round(sigma_a_solo_eff, 2),
            'sigma_a_q': round(sigma_a_q_eff, 2),
            'sigma_a_tot': round(sigma_a_total, 2),
            'sigma_p_solo': round(sigma_p_solo_eff, 2),
            'sigma_p_tot': round(sigma_p_total, 2),
            'q_a_solo': round(q_a_solo, 2),
            'q_a_q': round(q_a_q, 2),
            'q_a_w': round(q_a_w, 2),
            'Fa_no': round(f_a_no, 3),
            'Fp_no': round(f_p_no, 3),
            'K_mola': round(k_mola, 1),
            'Fmax': round(f_max, 3),
            'x2_mm': round(x2, 2)
        })

    fs_desl = (tot_Fp / tot_Fa) if tot_Fa > 0 else 999.0
    fs_tomb = (M_res / M_tom) if M_tom > 0 else 999.0

    status_desl = "OK (Seguro)" if fs_desl > 1.5 else ("Limítrofe" if fs_desl > 1.0 else "FALHA (Sem Equilíbrio)")
    status_tomb = "OK (Seguro)" if fs_tomb > 1.5 else ("Limítrofe" if fs_tomb > 1.0 else "FALHA (Sem Equilíbrio)")

    equilibrium = {
        'total_Fa': round(tot_Fa, 2),
        'total_Fp': round(tot_Fp, 2),
        'M_tom_base': round(M_tom, 2),
        'M_res_base': round(M_res, 2),
        'fs_sliding': round(fs_desl, 3),
        'status_sliding': status_desl,
        'fs_overturning': round(fs_tomb, 3),
        'status_overturning': status_tomb
    }

    return rows, equilibrium

# Run with Excel inputs
layers = [
    {"name": "Aterro", "top": 0.0, "bottom": 4.0, "gamma": 1.7, "c": 0.5, "phi": 20.0, "Kh": 400.0, "nspt": 2},
    {"name": "Aluvionar Argiloso", "top": 4.0, "bottom": 5.5, "gamma": 1.6, "c": 1.2, "phi": 20.0, "Kh": 200.0, "nspt": 5},
    {"name": "Aluvionar Arenoso", "top": 5.5, "bottom": 10.5, "gamma": 1.7, "c": 0.5, "phi": 25.0, "Kh": 300.0, "nspt": 6},
    {"name": "Solo Residual", "top": 10.5, "bottom": 12.0, "gamma": 1.9, "c": 1.75, "phi": 31.0, "Kh": 3000.0, "nspt": 25}
]

rows, eq = generate_excel_springs_table(layers, H=2.5, L_total=12.0, zw_ret=2.5, q_sur=3.0)
print("Computed Equilibrium:", eq)
