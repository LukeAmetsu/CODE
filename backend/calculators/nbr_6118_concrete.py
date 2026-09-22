import math

def safe_div(a, b, default=0.0):
    return a / b if b != 0 else default

def solve_neutral_axis(fcd_kN_cm2, alpha_c, lambda_c, bw, h, d, d_prime, As1, As2, fyd_kN_cm2, Es_kN_cm2, Nsd_kN):
    """
    Solves for neutral axis depth x (cm) satisfying normal force equilibrium:
    Fc(x) + Fs2(x) - Fs1(x) = -Nsd_kN
    where Nsd_kN > 0 is tension and Nsd_kN < 0 is compression.
    """
    # Objective function: F_internal(x) - Nsd_kN = 0
    # where compression is positive for internal resisting concrete force:
    # Fc + Fs_comp - Fs_tens + Nsd = 0
    # (If Nsd < 0 is external compression, Fc + Fs_comp = Fs_tens - Nsd)
    ecu = 0.0035

    def f_equil(x_try):
        if x_try <= 0.0001:
            # Pure tension, concrete zero
            Fc = 0.0
            sig_s1 = fyd_kN_cm2
            sig_s2 = fyd_kN_cm2
            return -(As1 * sig_s1 + As2 * sig_s2) - Nsd_kN
        
        # Concrete compression force
        x_comp = min(x_try, h / lambda_c)
        Fc = alpha_c * fcd_kN_cm2 * lambda_c * x_comp * bw
        
        # Bottom steel strain and stress (tension is negative in this force balance)
        eps_s1 = ecu * (d - x_try) / x_try
        sig_s1 = max(-fyd_kN_cm2, min(fyd_kN_cm2, eps_s1 * Es_kN_cm2))
        
        # Top steel strain and stress (compression is positive)
        eps_s2 = ecu * (x_try - d_prime) / x_try
        sig_s2 = max(-fyd_kN_cm2, min(fyd_kN_cm2, eps_s2 * Es_kN_cm2))
        
        # Equilibrium: Fc (comp) + As2 * sig_s2 (comp) - As1 * sig_s1 (tens) + Nsd (tens>0, comp<0) = 0
        return (Fc + As2 * sig_s2 - As1 * sig_s1) + Nsd_kN

    # Bisection search in [0.001, 3.0 * h]
    low = 0.001
    high = max(2.5 * h, 100.0)
    
    f_low = f_equil(low)
    f_high = f_equil(high)
    
    if f_low * f_high > 0:
        # Fallback simple bending estimation if monotonic or extreme
        denom = alpha_c * fcd_kN_cm2 * lambda_c * bw
        x_est = (As1 * fyd_kN_cm2 - Nsd_kN) / denom if denom > 0 else 0.25 * d
        return max(0.01, min(h, x_est))

    for _ in range(60):
        mid = (low + high) / 2.0
        f_mid = f_equil(mid)
        if abs(f_mid) < 1e-4 or (high - low) < 1e-4:
            return mid
        if f_low * f_mid < 0:
            high = mid
            f_high = f_mid
        else:
            low = mid
            f_low = f_mid

    return (low + high) / 2.0

def generate_interaction_curve(bw, h, d, d_prime, As1, As2, fcd_kN_cm2, fyd_kN_cm2, alpha_c=0.85, lambda_c=0.8, n_points=40):
    """
    Generates N-M interaction curve (envelope) for reinforced concrete section.
    Returns lists of N_kN (positive = tension, negative = compression) and Mrd_kNm (>= 0).
    """
    Es_kN_cm2 = 20000.0
    ecu = 0.0035
    curve = {'N': [], 'M': []}
    
    # 1. Pure Tension
    N_pure_tens = (As1 + As2) * fyd_kN_cm2
    M_pure_tens = (As1 * (d - h/2.0) - As2 * (h/2.0 - d_prime)) * fyd_kN_cm2 / 100.0
    curve['N'].append(round(N_pure_tens, 1))
    curve['M'].append(round(max(0.0, M_pure_tens), 2))
    
    # 2. Transition from Domain 2 to Domain 5 (x from 0.05*d to 1.5*h)
    x_steps = [d * (i / 20.0) for i in range(1, 21)] + [d + (h - d) * (i / 10.0) for i in range(1, 11)] + [h * (1.0 + i * 0.05) for i in range(1, 11)]
    
    for x_val in x_steps:
        if x_val <= 0: continue
        
        x_comp = min(x_val, h / lambda_c)
        Fc = alpha_c * fcd_kN_cm2 * min(lambda_c * x_comp, h) * bw
        arm_c = h/2.0 - (min(lambda_c * x_comp, h) / 2.0)
        
        eps_s1 = ecu * (d - x_val) / x_val
        sig_s1 = max(-fyd_kN_cm2, min(fyd_kN_cm2, eps_s1 * Es_kN_cm2))
        Fs1 = As1 * sig_s1
        arm_s1 = d - h/2.0
        
        eps_s2 = ecu * (x_val - d_prime) / x_val
        sig_s2 = max(-fyd_kN_cm2, min(fyd_kN_cm2, eps_s2 * Es_kN_cm2))
        Fs2 = As2 * sig_s2
        arm_s2 = h/2.0 - d_prime
        
        # N: compression is negative, tension is positive
        # N_internal = -(Fc + Fs2 - Fs1)
        N_res = -(Fc + Fs2 - Fs1)
        M_res = (Fc * arm_c + Fs2 * arm_s2 + Fs1 * arm_s1) / 100.0 # kN.m
        
        curve['N'].append(round(N_res, 1))
        curve['M'].append(round(max(0.0, M_res), 2))
        
    # 3. Pure Compression (epsilon = 0.002 uniform)
    Fc_max = alpha_c * fcd_kN_cm2 * bw * h
    Fs_max = (As1 + As2) * min(fyd_kN_cm2, 0.002 * Es_kN_cm2)
    N_pure_comp = -(Fc_max + Fs_max)
    M_pure_comp = (As2 * (h/2.0 - d_prime) - As1 * (d - h/2.0)) * min(fyd_kN_cm2, 0.002 * Es_kN_cm2) / 100.0
    curve['N'].append(round(N_pure_comp, 1))
    curve['M'].append(round(max(0.0, M_pure_comp), 2))
    
    # Sort by N ascending (from maximum compression to maximum tension)
    pts = sorted(zip(curve['N'], curve['M']), key=lambda p: p[0])
    return {
        'N': [p[0] for p in pts],
        'M': [p[1] for p in pts]
    }


def calculate_nbr_6118(inputs):
    """
    Calculates concrete section capacity according to NBR 6118:2014/2023.
    Supports simple bending or combined bending + axial force (M-N).
    Safety factors: gamma_c = 1.40, gamma_s = 1.15
    """
    i = inputs.copy()
    gamma_c = float(i.get('gamma_c', 1.40))
    gamma_s = float(i.get('gamma_s', 1.15))
    
    fck_MPa = float(i['fck'])
    fyk_MPa = float(i['fyk'])
    bw = float(i['bw'])      # cm
    h = float(i['h'])        # cm
    c_cov = float(i['c'])    # cm
    
    # Material design strengths (1 MPa = 0.1 kN/cm²)
    fcd_kN_cm2 = (fck_MPa / gamma_c) * 0.1
    fyd_kN_cm2 = (fyk_MPa / gamma_s) * 0.1
    Es_kN_cm2 = 20000.0 # 200 GPa
    
    phi_long_cm = float(i.get('diam_barra', 16.0)) / 10.0
    phi_est_cm = float(i.get('diam_estribo', 8.0)) / 10.0
    
    # Effective depth d (bottom steel)
    d = h - c_cov - phi_est_cm - (phi_long_cm / 2.0)
    d_prime = c_cov + phi_est_cm + (phi_long_cm / 2.0)
    
    As1 = float(i.get('num_barras', 3)) * (math.pi * (phi_long_cm ** 2) / 4.0)
    
    # Optional top reinforcement (As2)
    num_top = float(i.get('num_barras_top', 2))
    phi_top_cm = float(i.get('diam_barra_top', 10.0)) / 10.0
    As2 = num_top * (math.pi * (phi_top_cm ** 2) / 4.0) if num_top > 0 else 0.0
    
    # Axial force (kN): positive = tension, negative = compression
    Nsd = float(i.get('Nsd', 0.0))
    
    # Stress block parameters (NBR 6118 item 17.2.2)
    if fck_MPa <= 50:
        lambda_c = 0.8
        alpha_c = 0.85
        lim_xd = 0.45
    else:
        lambda_c = 0.8 - (fck_MPa - 50.0) / 400.0
        alpha_c = 0.85 * (1.0 - (fck_MPa - 50.0) / 200.0)
        lim_xd = 0.35
        
    # Solve neutral axis depth x
    if abs(Nsd) < 0.01 and As2 == 0:
        # Classical simple bending formula
        denom = alpha_c * fcd_kN_cm2 * lambda_c * bw
        x = (As1 * fyd_kN_cm2) / denom if denom > 0 else 0.0
    else:
        x = solve_neutral_axis(fcd_kN_cm2, alpha_c, lambda_c, bw, h, d, d_prime, As1, As2, fyd_kN_cm2, Es_kN_cm2, Nsd)

    x_d_ratio = (x / d) if d > 0 else float('inf')
    
    # Domain classification
    if x_d_ratio <= 0.259:
        dominio = 'Domínio 2 (Dúctil - Aço Escoa)'
    elif x_d_ratio <= lim_xd:
        dominio = 'Domínio 3 (Dúctil - Concreto e Aço)'
    elif x_d_ratio <= 0.628:
        dominio = 'Domínio 4 (Frágil - Redimensionar)'
    else:
        dominio = 'Domínio 5 (Compressão Excessiva)'
        
    # Lever arm z and Resisting Moment Mrd
    z = d - 0.5 * lambda_c * min(x, h / lambda_c)
    
    # Moments about centroid (h/2)
    arm_c = h/2.0 - (lambda_c * min(x, h / lambda_c) / 2.0)
    arm_s1 = d - h/2.0
    arm_s2 = h/2.0 - d_prime
    
    Fc = alpha_c * fcd_kN_cm2 * lambda_c * min(x, h / lambda_c) * bw
    eps_s1 = 0.0035 * (d - x) / x if x > 0 else 0.01
    sig_s1 = max(-fyd_kN_cm2, min(fyd_kN_cm2, eps_s1 * Es_kN_cm2))
    
    eps_s2 = 0.0035 * (x - d_prime) / x if x > 0 else -0.002
    sig_s2 = max(-fyd_kN_cm2, min(fyd_kN_cm2, eps_s2 * Es_kN_cm2))
    
    Mrd_kNcm = Fc * arm_c + (As2 * sig_s2) * arm_s2 + (As1 * sig_s1) * arm_s1
    if abs(Nsd) < 0.01 and As2 == 0:
        # Exact agreement with standard pure flexure
        Mrd_kNcm = As1 * fyd_kN_cm2 * z
    Mrd_kNm = max(0.0, Mrd_kNcm / 100.0)
    
    # Minimum and maximum longitudinal steel
    if fck_MPa <= 30:
        rho_min = 0.150 / 100.0
    elif fck_MPa <= 35:
        rho_min = 0.164 / 100.0
    elif fck_MPa <= 40:
        rho_min = 0.179 / 100.0
    elif fck_MPa <= 45:
        rho_min = 0.194 / 100.0
    elif fck_MPa <= 50:
        rho_min = 0.208 / 100.0
    else:
        rho_min = max(0.15, 0.208 + 0.002 * (fck_MPa - 50)) / 100.0
        
    As_min = rho_min * bw * h
    As_max = 0.04 * bw * h
    
    # --- Shear (Modelo I com efeito do Esforço Normal) ---
    Asw = float(i.get('pernas_estribo', 2)) * (math.pi * (phi_est_cm ** 2) / 4.0)
    fctd_MPa = (0.21 * math.pow(fck_MPa, 2.0 / 3.0)) / gamma_c
    fctd_kN_cm2 = fctd_MPa * 0.1
    Vc0_kN = 0.6 * fctd_kN_cm2 * bw * d
    
    # Axial stress sigma_cp (compression positive in NBR shear equation)
    sigma_cp_kN_cm2 = (-Nsd) / (bw * h)
    sigma_cp_MPa = sigma_cp_kN_cm2 * 10.0
    
    if sigma_cp_kN_cm2 > 0: # Compression increases Vc
        factor_axial_v = min(2.0, 1.0 + 0.15 * (sigma_cp_kN_cm2 / fcd_kN_cm2))
        Vc_kN = Vc0_kN * factor_axial_v
    elif sigma_cp_kN_cm2 < 0: # Tension reduces Vc
        factor_axial_v = max(0.0, 1.0 + (sigma_cp_kN_cm2 / fctd_kN_cm2))
        Vc_kN = Vc0_kN * factor_axial_v
    else:
        Vc_kN = Vc0_kN
        
    fywd_kN_cm2 = min(fyd_kN_cm2, 43.5)  # Capped at 435 MPa per NBR 6118 item 17.4.2.2
    s = float(i.get('s_estribo', 15.0))
    Vsw_kN = (Asw / s) * 0.9 * d * fywd_kN_cm2 if s > 0 else 0.0
    
    alpha_v2 = 1.0 - (fck_MPa / 250.0)
    # Biela de compressão
    VRd2_kN = 0.27 * alpha_v2 * fcd_kN_cm2 * bw * (0.9 * d)
    if sigma_cp_kN_cm2 > 0:
        VRd2_kN *= (1.0 - min(0.3, sigma_cp_kN_cm2 / fcd_kN_cm2))
        
    VRd_kN = Vc_kN + Vsw_kN
    
    Msd = float(i.get('Msd', 100.0))
    Vsd = float(i.get('Vsd', 50.0))
    
    util_flex = (Msd / Mrd_kNm) if Mrd_kNm > 0 else 999.0
    util_shear = (Vsd / VRd_kN) if VRd_kN > 0 else 999.0
    util_biela = (Vsd / VRd2_kN) if VRd2_kN > 0 else 999.0
    max_util = max(util_flex, util_shear, util_biela)
    is_safe = (Msd <= Mrd_kNm) and (Vsd <= VRd_kN) and (Vsd <= VRd2_kN) and (x_d_ratio <= lim_xd)
    
    # Interaction Curve
    mn_curve = generate_interaction_curve(bw, h, d, d_prime, As1, As2, fcd_kN_cm2, fyd_kN_cm2, alpha_c, lambda_c)
    
    return {
        'code': 'nbr',
        'code_name': 'ABNT NBR 6118:2023',
        'country': 'Brasil',
        'flag': '🇧🇷',
        'safety_factors': {
            'gamma_c': gamma_c,
            'gamma_s': gamma_s,
            'description': f'γc = {gamma_c:.2f}, γs = {gamma_s:.2f}'
        },
        'flexure_details': {
            'Mrd': round(Mrd_kNcm, 2),
            'Mrd_kNm': round(Mrd_kNm, 2),
            'Nsd_kN': round(Nsd, 2),
            'd': round(d, 2),
            'd_prime': round(d_prime, 2),
            'As': round(As1, 2),
            'As1': round(As1, 2),
            'As2': round(As2, 2),
            'As_min': round(As_min, 2),
            'As_max': round(As_max, 2),
            'x': round(x, 2),
            'x_d_ratio': round(x_d_ratio, 3),
            'x_d_limit': lim_xd,
            'dominio': dominio,
            'rho_s_pct': round(((As1 + As2) / (bw * h)) * 100.0, 3),
            'is_ductile': (x_d_ratio <= lim_xd)
        },
        'shear_details': {
            'VRd': round(VRd_kN, 2),
            'Vc': round(Vc_kN, 2),
            'Vsw': round(Vsw_kN, 2),
            'VRd2': round(VRd2_kN, 2),
            'sigma_cp_MPa': round(sigma_cp_MPa, 2),
            'Asw_per_m': round((Asw / s) * 100.0, 2) if s > 0 else 0.0
        },
        'summary': {
            'utilization_flexure': round(util_flex, 3),
            'utilization_shear': round(util_shear, 3),
            'utilization_biela': round(util_biela, 3),
            'max_util': round(max_util, 3),
            'is_safe': is_safe,
            'governing_failure': 'Flexão (M-N)' if util_flex >= util_shear else 'Cisalhamento'
        },
        'mn_curve': mn_curve
    }

def calculate_aci_318(inputs):
    """
    Calculates concrete section capacity according to ACI 318-22 (LRFD Method).
    Supports pure bending or combined axial force (Pu) and bending (Mu).
    """
    i = inputs.copy()
    fc_MPa = float(i['fck'])     # f'c
    fy_MPa = float(i['fyk'])     # fy
    bw = float(i['bw'])          # cm
    h = float(i['h'])            # cm
    c_cov = float(i['c'])        # cm
    
    phi_long_cm = float(i.get('diam_barra', 16.0)) / 10.0
    phi_est_cm = float(i.get('diam_estribo', 8.0)) / 10.0
    
    d = h - c_cov - phi_est_cm - (phi_long_cm / 2.0)
    d_prime = c_cov + phi_est_cm + (phi_long_cm / 2.0)
    
    As1 = float(i.get('num_barras', 3)) * (math.pi * (phi_long_cm ** 2) / 4.0)
    num_top = float(i.get('num_barras_top', 2))
    phi_top_cm = float(i.get('diam_barra_top', 10.0)) / 10.0
    As2 = num_top * (math.pi * (phi_top_cm ** 2) / 4.0) if num_top > 0 else 0.0
    
    # Pu: axial load in kN (positive tension, negative compression)
    Pu_kN = float(i.get('Nsd', 0.0))
    
    # Whitney Stress Block factor beta1 (ACI 318-22 Table 22.2.2.4.3)
    if fc_MPa <= 28.0:
        beta1 = 0.85
    elif fc_MPa < 55.0:
        beta1 = 0.85 - (0.05 * (fc_MPa - 28.0) / 7.0)
    else:
        beta1 = 0.65
    beta1 = max(0.65, min(0.85, beta1))
    
    fc_kN_cm2 = fc_MPa * 0.1
    fy_kN_cm2 = fy_MPa * 0.1
    Es_kN_cm2 = 20000.0
    
    if abs(Pu_kN) < 0.01 and As2 == 0:
        denom = 0.85 * fc_kN_cm2 * bw
        a = (As1 * fy_kN_cm2) / denom if denom > 0 else 0.0
        c_na = a / beta1 if beta1 > 0 else 0.0
    else:
        c_na = solve_neutral_axis(fc_kN_cm2, 0.85, beta1, bw, h, d, d_prime, As1, As2, fy_kN_cm2, Es_kN_cm2, Pu_kN)
        a = beta1 * min(c_na, h / beta1)
        
    eps_cu = 0.003
    Es_MPa = 200000.0
    eps_ty = fy_MPa / Es_MPa
    
    if c_na > 0 and d > 0:
        eps_t = eps_cu * ((d - c_na) / c_na)
    else:
        eps_t = 0.05
        
    # Strength reduction factor phi for flexure (ACI 318-22 Table 21.2.2)
    if eps_t >= (eps_ty + 0.003):
        phi_flex = 0.90
        failure_mode = 'Tension-Controlled (Dúctil)'
    elif eps_t <= eps_ty:
        phi_flex = 0.65
        failure_mode = 'Compression-Controlled (Frágil)'
    else:
        phi_flex = 0.65 + 0.25 * ((eps_t - eps_ty) / 0.003)
        failure_mode = 'Transition Zone'
        
    phi_flex = max(0.65, min(0.90, phi_flex))
    
    # Nominal and design flexural strength
    if abs(Pu_kN) < 0.01 and As2 == 0:
        Mn_kNcm = As1 * fy_kN_cm2 * (d - a / 2.0)
    else:
        Fc = 0.85 * fc_kN_cm2 * min(a, h) * bw
        arm_c = h/2.0 - (min(a, h) / 2.0)
        eps_s1 = eps_cu * (d - c_na) / c_na if c_na > 0 else 0.01
        sig_s1 = max(-fy_kN_cm2, min(fy_kN_cm2, eps_s1 * Es_kN_cm2))
        eps_s2 = eps_cu * (c_na - d_prime) / c_na if c_na > 0 else -0.002
        sig_s2 = max(-fy_kN_cm2, min(fy_kN_cm2, eps_s2 * Es_kN_cm2))
        Mn_kNcm = Fc * arm_c + (As2 * sig_s2) * (h/2.0 - d_prime) + (As1 * sig_s1) * (d - h/2.0)
        
    Mn_kNm = max(0.0, Mn_kNcm / 100.0)
    phiMn_kNm = phi_flex * Mn_kNm
    
    # Minimum flexural steel (ACI 318-22 §9.6.1.2)
    as_min_term1 = (0.25 * math.sqrt(fc_MPa) / fy_MPa) * bw * d
    as_min_term2 = (1.4 / fy_MPa) * bw * d
    As_min = max(as_min_term1, as_min_term2)
    is_ductile = (eps_t >= 0.004)
    
    # --- Shear (ACI 318-22 §22.5 com efeito de Carga Axial Nu) ---
    phi_v = 0.75
    phi_est_mm = float(i.get('diam_estribo', 8.0))
    d_mm = d * 10.0
    bw_mm = bw * 10.0
    s_mm = float(i.get('s_estribo', 15.0)) * 10.0
    n_legs = float(i.get('pernas_estribo', 2))
    
    Av_mm2 = n_legs * (math.pi * (phi_est_mm ** 2) / 4.0)
    Asw_cm2 = Av_mm2 / 100.0
    Ag_mm2 = bw_mm * (h * 10.0)
    
    # Nu in N (compression positive in ACI shear formula)
    Nu_N = -Pu_kN * 1000.0
    if Nu_N > 0: # Compression
        axial_mod = 1.0 + (Nu_N / (14.0 * Ag_mm2))
    else: # Tension
        axial_mod = max(0.0, 1.0 + (0.29 * Nu_N / Ag_mm2))
        
    Vc_N = 0.17 * axial_mod * math.sqrt(fc_MPa) * bw_mm * d_mm
    Vc_kN = max(0.0, Vc_N / 1000.0)
    
    fyt_MPa = min(fy_MPa, 420.0)
    if s_mm > 0:
        Vs_N = (Av_mm2 * fyt_MPa * d_mm) / s_mm
        Vs_kN = Vs_N / 1000.0
    else:
        Vs_kN = 0.0
        
    Vs_max_N = 0.66 * math.sqrt(fc_MPa) * bw_mm * d_mm
    Vs_max_kN = Vs_max_N / 1000.0
    Vs_actual_kN = min(Vs_kN, Vs_max_kN)
    
    Vn_kN = Vc_kN + Vs_actual_kN
    phiVn_kN = phi_v * Vn_kN
    phiVn_max_kN = phi_v * (Vc_kN + Vs_max_kN)
    
    Mu = float(i.get('Msd', 100.0))
    Vu = float(i.get('Vsd', 50.0))
    
    util_flex = (Mu / phiMn_kNm) if phiMn_kNm > 0 else 999.0
    util_shear = (Vu / phiVn_kN) if phiVn_kN > 0 else 999.0
    util_web = (Vu / phiVn_max_kN) if phiVn_max_kN > 0 else 999.0
    max_util = max(util_flex, util_shear, util_web)
    is_safe = (Mu <= phiMn_kNm) and (Vu <= phiVn_kN) and (Vu <= phiVn_max_kN) and is_ductile
    
    mn_curve = generate_interaction_curve(bw, h, d, d_prime, As1, As2, fc_kN_cm2, fy_kN_cm2, 0.85, beta1)
    # Apply ACI phi factor to interaction curve
    mn_curve['M'] = [round(m * phi_flex, 2) for m in mn_curve['M']]
    mn_curve['N'] = [round(n * phi_flex, 1) for n in mn_curve['N']]
    
    return {
        'code': 'aci',
        'code_name': 'ACI 318-22 (LRFD)',
        'country': 'EUA',
        'flag': '🇺🇸',
        'safety_factors': {
            'phi_flex': round(phi_flex, 3),
            'phi_shear': phi_v,
            'description': f'ϕ_flex = {phi_flex:.3f} (εt={eps_t:.4f}), ϕ_v = {phi_v:.2f}'
        },
        'flexure_details': {
            'Mrd': round(phiMn_kNm * 100.0, 2),
            'Mrd_kNm': round(phiMn_kNm, 2),
            'Mn_nominal_kNm': round(Mn_kNm, 2),
            'Nsd_kN': round(Pu_kN, 2),
            'phi_flex': round(phi_flex, 3),
            'd': round(d, 2),
            'As': round(As1, 2),
            'As1': round(As1, 2),
            'As2': round(As2, 2),
            'As_min': round(As_min, 2),
            'a': round(a, 2),
            'x': round(c_na, 2),
            'beta1': round(beta1, 3),
            'x_d_ratio': round(c_na / d, 3) if d > 0 else float('inf'),
            'epsilon_t': round(eps_t, 5),
            'failure_mode': failure_mode,
            'rho_s_pct': round(((As1 + As2) / (bw * h)) * 100.0, 3),
            'is_ductile': is_ductile
        },
        'shear_details': {
            'VRd': round(phiVn_kN, 2),
            'Vn_nominal': round(Vn_kN, 2),
            'Vc': round(phi_v * Vc_kN, 2),
            'Vsw': round(phi_v * Vs_actual_kN, 2),
            'VRd2': round(phiVn_max_kN, 2),
            'phi_shear': phi_v,
            'Asw_per_m': round((Asw_cm2 / float(i.get('s_estribo', 15.0))) * 100.0, 2) if float(i.get('s_estribo', 15.0)) > 0 else 0.0
        },
        'summary': {
            'utilization_flexure': round(util_flex, 3),
            'utilization_shear': round(util_shear, 3),
            'utilization_biela': round(util_web, 3),
            'max_util': round(max_util, 3),
            'is_safe': is_safe,
            'governing_failure': 'Flexão (M-N)' if util_flex >= util_shear else 'Cisalhamento'
        },
        'mn_curve': mn_curve
    }

def calculate_eurocode_2(inputs):
    """
    Calculates concrete section capacity according to Eurocode 2 (EN 1992-1-1:2004+A1:2014).
    Supports pure bending and combined axial force (Ned) and bending (Med).
    """
    i = inputs.copy()
    gamma_C = float(i.get('gamma_c_ec2', 1.50))
    gamma_S = float(i.get('gamma_s_ec2', 1.15))
    alpha_cc = float(i.get('alpha_cc', 1.00))
    
    fck_MPa = float(i['fck'])
    fyk_MPa = float(i['fyk'])
    bw = float(i['bw'])      # cm
    h = float(i['h'])        # cm
    c_cov = float(i['c'])    # cm
    
    fcd_kN_cm2 = (alpha_cc * fck_MPa / gamma_C) * 0.1
    fyd_kN_cm2 = (fyk_MPa / gamma_S) * 0.1
    Es_kN_cm2 = 20000.0
    
    phi_long_cm = float(i.get('diam_barra', 16.0)) / 10.0
    phi_est_cm = float(i.get('diam_estribo', 8.0)) / 10.0
    
    d = h - c_cov - phi_est_cm - (phi_long_cm / 2.0)
    d_prime = c_cov + phi_est_cm + (phi_long_cm / 2.0)
    
    As1 = float(i.get('num_barras', 3)) * (math.pi * (phi_long_cm ** 2) / 4.0)
    num_top = float(i.get('num_barras_top', 2))
    phi_top_cm = float(i.get('diam_barra_top', 10.0)) / 10.0
    As2 = num_top * (math.pi * (phi_top_cm ** 2) / 4.0) if num_top > 0 else 0.0
    
    Ned_kN = float(i.get('Nsd', 0.0))
    
    # Stress block factors (EC2 Section 3.1.7)
    if fck_MPa <= 50.0:
        lambda_ec = 0.80
        eta_ec = 1.00
        lim_xd = 0.45
    else:
        lambda_ec = 0.80 - (fck_MPa - 50.0) / 400.0
        eta_ec = 1.00 - (fck_MPa - 50.0) / 200.0
        lim_xd = 0.35
        
    if abs(Ned_kN) < 0.01 and As2 == 0:
        denom = eta_ec * fcd_kN_cm2 * lambda_ec * bw
        x = (As1 * fyd_kN_cm2) / denom if denom > 0 else 0.0
    else:
        x = solve_neutral_axis(fcd_kN_cm2, eta_ec, lambda_ec, bw, h, d, d_prime, As1, As2, fyd_kN_cm2, Es_kN_cm2, Ned_kN)
        
    x_d_ratio = (x / d) if d > 0 else float('inf')
    
    z = d - 0.5 * lambda_ec * min(x, h / lambda_ec)
    if abs(Ned_kN) < 0.01 and As2 == 0:
        Mrd_kNcm = As1 * fyd_kN_cm2 * z
    else:
        Fc = eta_ec * fcd_kN_cm2 * min(lambda_ec * x, h) * bw
        arm_c = h/2.0 - (min(lambda_ec * x, h) / 2.0)
        eps_s1 = 0.0035 * (d - x) / x if x > 0 else 0.01
        sig_s1 = max(-fyd_kN_cm2, min(fyd_kN_cm2, eps_s1 * Es_kN_cm2))
        eps_s2 = 0.0035 * (x - d_prime) / x if x > 0 else -0.002
        sig_s2 = max(-fyd_kN_cm2, min(fyd_kN_cm2, eps_s2 * Es_kN_cm2))
        Mrd_kNcm = Fc * arm_c + (As2 * sig_s2) * (h/2.0 - d_prime) + (As1 * sig_s1) * (d - h/2.0)
        
    Mrd_kNm = max(0.0, Mrd_kNcm / 100.0)
    
    # Minimum flexural reinforcement (EC2 §9.2.1.1)
    if fck_MPa <= 50.0:
        fctm_MPa = 0.30 * math.pow(fck_MPa, 2.0 / 3.0)
    else:
        fctm_MPa = 2.12 * math.log(1.0 + (fck_MPa + 8.0) / 10.0)
        
    As_min = max(0.26 * (fctm_MPa / fyk_MPa) * bw * d, 0.0013 * bw * d)
    As_max = 0.04 * bw * h
    
    # --- Shear (EC2 §6.2.3 Variable Strut Angle com Carga Axial) ---
    cot_theta = 2.5
    tan_theta = 1.0 / cot_theta
    z_shear_cm = 0.9 * d
    
    Asw = float(i.get('pernas_estribo', 2)) * (math.pi * (phi_est_cm ** 2) / 4.0)
    s = float(i.get('s_estribo', 15.0))
    
    nu1 = 0.6 * (1.0 - (fck_MPa / 250.0))
    
    # Axial stress sigma_cp (compression positive in EC2)
    sigma_cp_MPa = (-Ned_kN * 10.0) / (bw * h)
    sigma_cp_MPa = max(-fctm_MPa, min(0.2 * fcd_kN_cm2 * 10.0, sigma_cp_MPa))
    
    alpha_cw = 1.0
    if sigma_cp_MPa > 0:
        alpha_cw = 1.0 + (sigma_cp_MPa / (fcd_kN_cm2 * 10.0))
    elif sigma_cp_MPa < 0:
        alpha_cw = 1.0 + (sigma_cp_MPa / fctm_MPa)
    alpha_cw = max(0.5, min(1.25, alpha_cw))
    
    VRd_max_kN = (alpha_cw * bw * z_shear_cm * nu1 * fcd_kN_cm2) / (cot_theta + tan_theta)
    fywd_kN_cm2 = fyd_kN_cm2
    VRd_s_kN = (Asw / s) * z_shear_cm * fywd_kN_cm2 * cot_theta if s > 0 else 0.0
    VRd_kN = min(VRd_s_kN, VRd_max_kN)
    
    k_size = min(2.0, 1.0 + math.sqrt(20.0 / d)) if d > 0 else 1.0
    rho_l = min(0.02, As1 / (bw * d)) if (bw * d) > 0 else 0.0
    CRd_c = 0.18 / gamma_C
    v_min_MPa = 0.035 * math.pow(k_size, 1.5) * math.sqrt(fck_MPa)
    
    # Term k1 * sigma_cp
    k1 = 0.15
    VRd_c_MPa = max(CRd_c * k_size * math.pow(100.0 * rho_l * fck_MPa, 1.0 / 3.0), v_min_MPa) + k1 * (sigma_cp_MPa if sigma_cp_MPa > 0 else 0)
    Vc_ref_kN = VRd_c_MPa * 0.1 * bw * d
    
    Med = float(i.get('Msd', 100.0))
    Ved = float(i.get('Vsd', 50.0))
    
    util_flex = (Med / Mrd_kNm) if Mrd_kNm > 0 else 999.0
    util_shear = (Ved / VRd_kN) if VRd_kN > 0 else 999.0
    util_biela = (Ved / VRd_max_kN) if VRd_max_kN > 0 else 999.0
    max_util = max(util_flex, util_shear, util_biela)
    is_safe = (Med <= Mrd_kNm) and (Ved <= VRd_kN) and (Ved <= VRd_max_kN) and (x_d_ratio <= lim_xd)
    
    mn_curve = generate_interaction_curve(bw, h, d, d_prime, As1, As2, fcd_kN_cm2, fyd_kN_cm2, eta_ec, lambda_ec)
    
    return {
        'code': 'ec2',
        'code_name': 'Eurocode 2 (EN 1992-1-1)',
        'country': 'Europa',
        'flag': '🇪🇺',
        'safety_factors': {
            'gamma_c': gamma_C,
            'gamma_s': gamma_S,
            'description': f'γC = {gamma_C:.2f}, γS = {gamma_S:.2f}, cotθ = {cot_theta:.1f}'
        },
        'flexure_details': {
            'Mrd': round(Mrd_kNcm, 2),
            'Mrd_kNm': round(Mrd_kNm, 2),
            'Nsd_kN': round(Ned_kN, 2),
            'd': round(d, 2),
            'As': round(As1, 2),
            'As1': round(As1, 2),
            'As2': round(As2, 2),
            'As_min': round(As_min, 2),
            'As_max': round(As_max, 2),
            'x': round(x, 2),
            'x_d_ratio': round(x_d_ratio, 3),
            'x_d_limit': lim_xd,
            'dominio': f'x/d = {x_d_ratio:.3f} ≤ {lim_xd}',
            'rho_s_pct': round(((As1 + As2) / (bw * h)) * 100.0, 3),
            'is_ductile': (x_d_ratio <= lim_xd)
        },
        'shear_details': {
            'VRd': round(VRd_kN, 2),
            'Vc': round(Vc_ref_kN, 2),
            'Vsw': round(VRd_s_kN, 2),
            'VRd2': round(VRd_max_kN, 2),
            'cot_theta': cot_theta,
            'sigma_cp_MPa': round(sigma_cp_MPa, 2),
            'Asw_per_m': round((Asw / s) * 100.0, 2) if s > 0 else 0.0
        },
        'summary': {
            'utilization_flexure': round(util_flex, 3),
            'utilization_shear': round(util_shear, 3),
            'utilization_biela': round(util_biela, 3),
            'max_util': round(max_util, 3),
            'is_safe': is_safe,
            'governing_failure': 'Flexão (M-N)' if util_flex >= util_shear else 'Cisalhamento'
        },
        'mn_curve': mn_curve
    }

def calculate_concrete_beam(inputs):
    """
    Main entry point for concrete cross-section design supporting NBR 6118, ACI 318-22,
    and Eurocode 2 (EC2), with axial load Nsd and multi-code comparison.
    """
    i = inputs.copy()
    code = str(i.get('code', 'nbr')).lower().strip()
    
    nbr_res = calculate_nbr_6118(i)
    aci_res = calculate_aci_318(i)
    ec2_res = calculate_eurocode_2(i)
    
    comparison = [
        {
            'code_key': 'nbr',
            'code_name': nbr_res['code_name'],
            'country': nbr_res['country'],
            'flag': nbr_res['flag'],
            'factors': 'γc = 1.40, γs = 1.15',
            'Mrd_kNm': nbr_res['flexure_details']['Mrd_kNm'],
            'util_flex_pct': round(nbr_res['summary']['utilization_flexure'] * 100.0, 1),
            'VRd_kN': nbr_res['shear_details']['VRd'],
            'util_shear_pct': round(nbr_res['summary']['utilization_shear'] * 100.0, 1),
            'VRd2_kN': nbr_res['shear_details']['VRd2'],
            'max_util_pct': round(nbr_res['summary']['max_util'] * 100.0, 1),
            'is_safe': nbr_res['summary']['is_safe']
        },
        {
            'code_key': 'aci',
            'code_name': aci_res['code_name'],
            'country': aci_res['country'],
            'flag': aci_res['flag'],
            'factors': f"ϕ_f = {aci_res['safety_factors']['phi_flex']}, ϕ_v = {aci_res['safety_factors']['phi_shear']}",
            'Mrd_kNm': aci_res['flexure_details']['Mrd_kNm'],
            'util_flex_pct': round(aci_res['summary']['utilization_flexure'] * 100.0, 1),
            'VRd_kN': aci_res['shear_details']['VRd'],
            'util_shear_pct': round(aci_res['summary']['utilization_shear'] * 100.0, 1),
            'VRd2_kN': aci_res['shear_details']['VRd2'],
            'max_util_pct': round(aci_res['summary']['max_util'] * 100.0, 1),
            'is_safe': aci_res['summary']['is_safe']
        },
        {
            'code_key': 'ec2',
            'code_name': ec2_res['code_name'],
            'country': ec2_res['country'],
            'flag': ec2_res['flag'],
            'factors': 'γC = 1.50, γS = 1.15, cotθ = 2.5',
            'Mrd_kNm': ec2_res['flexure_details']['Mrd_kNm'],
            'util_flex_pct': round(ec2_res['summary']['utilization_flexure'] * 100.0, 1),
            'VRd_kN': ec2_res['shear_details']['VRd'],
            'util_shear_pct': round(ec2_res['summary']['utilization_shear'] * 100.0, 1),
            'VRd2_kN': ec2_res['shear_details']['VRd2'],
            'max_util_pct': round(ec2_res['summary']['max_util'] * 100.0, 1),
            'is_safe': ec2_res['summary']['is_safe']
        }
    ]
    
    if code == 'aci':
        active = aci_res
    elif code == 'ec2':
        active = ec2_res
    else:
        active = nbr_res
        
    return {
        'success': True,
        'active_code': code,
        'inputs': i,
        'results': active,
        'comparison': comparison,
        'all_codes': {
            'nbr': nbr_res,
            'aci': aci_res,
            'ec2': ec2_res
        }
    }
