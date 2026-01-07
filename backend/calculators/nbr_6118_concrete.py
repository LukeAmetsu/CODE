import math

def calculate_concrete_beam(inputs):
    """
    Calculates concrete beam capacity according to NBR 6118.
    
    Args:
        inputs (dict): Dictionary with keys:
            fck (float): MPa
            fyk (float): MPa
            bw (float): cm
            h (float): cm
            c (float): cm
            num_barras (float)
            diam_barra (float): mm
            diam_estribo (float): mm
            pernas_estribo (float)
            s_estribo (float): cm
            Msd (float): kN.m
            Vsd (float): kN
    
    Returns:
        dict: Results including flexure and shear details.
    """
    i = inputs.copy()
    
    # Conversions to kN, cm
    # Stress: 1 MPa = 0.1 kN/cm²
    gamma_c = 1.4
    gamma_s = 1.15
    
    fck_MPa = i['fck']
    fyk_MPa = i['fyk']
    
    fcd_kN_cm2 = (fck_MPa / gamma_c) * 0.1
    fyd_kN_cm2 = (fyk_MPa / gamma_s) * 0.1
    
    # Dimensions
    bw = i['bw']
    h = i['h']
    c_cov = i['c']
    
    # Reinforcement
    phi_long_cm = i['diam_barra'] / 10.0
    phi_est_cm = i['diam_estribo'] / 10.0
    
    # --- Flexure (Flexão) ---
    # d = h - cobrimento - estribo - phi_long/2
    # JS: const d = i.h - i.c - (i.diam_estribo / 10) - (i.diam_barra / 20);
    d = h - c_cov - phi_est_cm - (phi_long_cm / 2.0)
    
    As = i['num_barras'] * (math.pi * (phi_long_cm ** 2) / 4.0)
    
    # Depth of neutral axis x
    # Equilibrium: 0.85 * fcd * 0.8 * x * bw = As * fyd
    # x = (As * fyd) / (0.68 * fcd * bw)
    denom = 0.85 * fcd_kN_cm2 * 0.8 * bw
    if denom == 0:
        x = 0
    else:
        x = (As * fyd_kN_cm2) / denom
        
    x_d_ratio = (x / d) if d > 0 else float('inf')
    
    if x_d_ratio <= 0.45:
        dominio = '2 ou 3 (Dúctil)'
    else:
        dominio = '4 ou 5 (Frágil)'
        
    # Resistive Moment Mrd
    # Mrd = As * fyd * (d - 0.4 * x)
    Mrd_kNcm = As * fyd_kN_cm2 * (d - 0.4 * x)
    
    
    # --- Shear (Cisalhamento) ---
    # Asw (Area of shear reinforcement per spacing s) -> Total area of legs
    Asw = i['pernas_estribo'] * (math.pi * (phi_est_cm ** 2) / 4.0)
    
    # fctd = 0.21 * fck^(2/3) / gamma_c
    fctd_MPa = (0.21 * math.pow(fck_MPa, 2/3)) / gamma_c
    fctd_kN_cm2 = fctd_MPa * 0.1
    
    # Vc = 0.6 * fctd * bw * d
    Vc_kN = 0.6 * fctd_kN_cm2 * bw * d
    
    # Vsw = (Asw / s) * 0.9 * d * fyd
    # Note: Using fyd for stirrups (same steel strength assumed usually)
    s = i['s_estribo']
    if s > 0:
        Vsw_kN = (Asw / s) * 0.9 * d * fyd_kN_cm2
    else:
        Vsw_kN = 0
        
    # VRd2 (Crushing of strut)
    # VRd2 = 0.27 * (1 - fck/250) * fcd * bw * 0.9 * d
    alpha_v2 = (1 - fck_MPa / 250.0)
    VRd2_kN = 0.27 * alpha_v2 * fcd_kN_cm2 * bw * (0.9 * d)
    
    VRd_kN = Vc_kN + Vsw_kN
    
    res = {
        'flexure_details': {
            'Mrd': Mrd_kNcm,    # kN.cm (matches JS internal scaling if converted, JS uses native mix)
                                # To align with JS structure, let's keep keys similar but values correct.
                                # JS returns 'Mrd'. JS formatting divides by 100 for kN.m display.
                                # Python Mrd_kNcm is kN.cm. 
                                # If I return Mrd_kNcm, frontend will divide by 100 -> kN.m. Correct.
            'd': d,
            'As': As,
            'x': x,
            'x_d_ratio': x_d_ratio,
            'dominio': dominio
        },
        'shear_details': {
            'VRd': VRd_kN,
            'Vc': Vc_kN,
            'Vsw': Vsw_kN,
            'VRd2': VRd2_kN
        }
    }
    
    # Note on outputs:
    # JS expects `res.flexure_details.Mrd` to be in units such that `Mrd / 100` is kN.m.
    # So `Mrd` must be kN.cm. My calculation `Mrd_kNcm` IS kN.cm. So this works.
    # JS shear expects `VRd` in kN. JS formatting displays it directly.
    # My calculation `VRd_kN` is in kN. So this works.
    
    return {'inputs': i, 'results': res}
