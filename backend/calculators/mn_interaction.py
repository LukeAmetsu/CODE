import math

def calculate_mn_interaction(inputs):
    """
    Calculates the N-M Interaction Diagram for a given concrete section.

    Args:
        inputs (dict):
            section_type (str): 'rect', 'section_t', 'section_i'
            b, h, bw, bf_sup, hf_sup, bf_inf, hf_inf (float): Geometry in cm.
            fck (float): MPa
            fyk (float): MPa
            gamma_c (float)
            gamma_s (float)
            d, d_linha (float): Effective depths (cm).
            As, As_linha (float): Steel areas (cm2).
            has_prestress (bool)
            Ap (float): Prestress steel area (cm2).
            dp (float): Depth to prestress (cm).
            fptk (float): Prestress strength (MPa).
            Ep (float): Prestress Modulus (MPa).
            sigma_pi (float): Initial stress (MPa).
            loss_pct (float): Loss percentage (0-100).

    Returns:
        dict: { points: list of {Nrd (kN), Mrd (kNm), label, ...} }
    """
    i = inputs.copy()
    geom = normalize_geometry(i)
    params = calculate_design_parameters(i)
    
    # Generate points
    # Logic mirrors `calculateKeyPoints` in JS
    
    points = calculate_key_points(i, geom, params)
    
    return {'points': points}

def normalize_geometry(inputs):
    sect_type = inputs.get('section_type', 'rect')
    h = float(inputs.get('h', 0))
    b = float(inputs.get('b', 0))
    bw = float(inputs.get('bw', 0))
    bf_sup = float(inputs.get('bf_sup', 0))
    hf_sup = float(inputs.get('hf_sup', 0))
    bf_inf = float(inputs.get('bf_inf', 0))
    hf_inf = float(inputs.get('hf_inf', 0))

    if sect_type == 'rect':
        return {'h': h, 'bw': b, 'bf_sup': b, 'hf_sup': 0, 'bf_inf': b, 'hf_inf': 0}
    elif sect_type == 'section_t':
        return {'h': h, 'bw': bw, 'bf_sup': bf_sup, 'hf_sup': hf_sup, 'bf_inf': bw, 'hf_inf': 0}
    else:
        return {'h': h, 'bw': bw, 'bf_sup': bf_sup, 'hf_sup': hf_sup, 'bf_inf': bf_inf, 'hf_inf': hf_inf}

def calculate_design_parameters(inputs):
    fck = float(inputs.get('fck', 25))
    fyk = float(inputs.get('fyk', 500))
    gamma_c = float(inputs.get('gamma_c', 1.4))
    gamma_s = float(inputs.get('gamma_s', 1.15))
    
    # Stress conversions to kN/cm2
    fcd_kn_cm = (fck / gamma_c) * 0.1
    fyd_kn_cm = (fyk / gamma_s) * 0.1
    Es = 21000.0 # kN/cm2 (210 GPa)
    eyd = fyd_kn_cm / Es
    
    has_prestress = inputs.get('has_prestress', False)
    fptd_kn_cm = 0
    Ep = 0
    eps_p0 = 0
    sigma_p_effective = 0
    
    if has_prestress:
        fptk = float(inputs.get('fptk', 1900))
        Ep_val = float(inputs.get('Ep', 200000)) # MPa
        sigma_pi = float(inputs.get('sigma_pi', 0))
        loss_pct = float(inputs.get('loss_pct', 0))
        
        fptd_kn_cm = (fptk / gamma_s) * 0.1
        sigma_p_effective = sigma_pi * (1 - loss_pct / 100.0)
        eps_p0 = sigma_p_effective / Ep_val if Ep_val > 0 else 0
        Ep = Ep_val # Keep in MPa for consistency with JS usage or convert? 
        # JS: `Ep = Number(inputs.Ep) || 200000;`
        # JS usage: `Ep_kn_cm = Ep / 10;`
        # So our Ep param here should be MPa, and converted later.
    
    ecu = -0.0035
    esu = 0.010
    ec2 = -0.002
    
    if fck <= 50:
        lam = 0.8
        alphac = 0.85
    elif fck <= 90:
        lam = 0.8 - (fck - 50) / 400.0
        alphac = 0.85 * (1 - (fck - 50) / 200.0)
    else:
        lam = 0.72
        alphac = 0.7225
        
    fcd_design = alphac * fcd_kn_cm
    
    return {
        'fcd_kn_cm': fcd_kn_cm,
        'fyd_kn_cm': fyd_kn_cm,
        'Es': Es,
        'eyd': eyd,
        'ecu': ecu,
        'esu': esu,
        'ec2': ec2,
        'lambda': lam,
        'fcd_design': fcd_design,
        'has_prestress': has_prestress,
        'fptd_kn_cm': fptd_kn_cm,
        'Ep': Ep, # MPa
        'eps_p0': eps_p0,
        'sigma_p_effective': sigma_p_effective
    }

def get_concrete_compression(y_block, geom):
    # Returns Area and Centroid (y from bottom? No, JS uses relative to start I think)
    # JS: `let current_y_start = 0;` from top? 
    # Logic in JS:
    # `h_seg = ...`, `y_cg_seg = current_y_start + h_seg / 2`
    # `y_rem` decreases.
    # It assumes `y_block` starts from top fiber (compressed face).
    # Centroid is distance from top fiber.
    
    # Wait, in JS `Mc = Nc * (concProps.Centroid - h / 2)`
    # If Centroid is from top, and h/2 is mid, this implies negative moment for top compression?
    # Usually coordinate system: y positive up? Or down?
    # JS: `Centroid` calculation sums `A_seg * y_cg_seg`. `current_y_start` increases downwards (accumulating height).
    # So `Centroid` is distance from Top Fiber.
    # Moment arm: `Centroid - h/2`. 
    # If Top is 0, Mid is h/2. `0 - h/2` = `-h/2`. 
    # Compressive force Nc is negative (usually). `Nc * (-h/2)` = Positive Moment. Correct.
    
    if y_block <= 0:
        return {'Area': 0, 'Centroid': 0}
        
    Area = 0.0
    MomentArea = 0.0
    
    y_rem = y_block
    current_y_start = 0.0
    
    h = geom['h']
    
    # Top Flange
    if y_rem > 0:
        hf_sup = geom['hf_sup']
        h_seg = min(y_rem, hf_sup) if hf_sup > 0 else 0
        if h_seg > 0:
            A_seg = h_seg * geom['bf_sup']
            y_cg = current_y_start + h_seg / 2.0
            Area += A_seg
            MomentArea += A_seg * y_cg
            y_rem -= h_seg
            current_y_start += h_seg
            
    # Web
    h_web = h - geom['hf_sup'] - geom['hf_inf']
    if y_rem > 0 and h_web > 0:
        h_seg = min(y_rem, h_web)
        A_seg = h_seg * geom['bw']
        y_cg = current_y_start + h_seg / 2.0
        Area += A_seg
        MomentArea += A_seg * y_cg
        y_rem -= h_seg
        current_y_start += h_seg
        
    # Bottom Flange
    if y_rem > 0 and geom['hf_inf'] > 0:
        h_seg = min(y_rem, geom['hf_inf'])
        A_seg = h_seg * geom['bf_inf']
        y_cg = current_y_start + h_seg / 2.0
        Area += A_seg
        MomentArea += A_seg * y_cg
        # y_rem -= h_seg # Not needed
        # current_y_start += h_seg
        
    Centroid = MomentArea / Area if Area > 0 else 0
    return {'Area': Area, 'Centroid': Centroid}

def get_state(x, eps_top_atual, inputs, geom, params):
    h = geom['h']
    d = float(inputs.get('d', h-5))
    d_linha = float(inputs.get('d_linha', 5))
    As = float(inputs.get('As', 0))
    As_linha = float(inputs.get('As_linha', 0))
    Ap = float(inputs.get('Ap', 0))
    dp = float(inputs.get('dp', 0))
    
    safe_x = x if abs(x) >= 1e-6 else 1e-6
    
    # Strains
    # eps = eps_top * (x - y) / x
    # Top is y=0. x is neutral axis depth from top.
    # Strain at d: eps_s = eps_top * (x - d) / x
    es_s = eps_top_atual * (safe_x - d) / safe_x
    es_s_linha = eps_top_atual * (safe_x - d_linha) / safe_x
    
    def get_sigma(eps):
        sig = eps * params['Es']
        fyd = params['fyd_kn_cm']
        return max(-fyd, min(fyd, sig))
        
    fs_s = get_sigma(es_s)
    fs_s_linha = get_sigma(es_s_linha)
    
    Ns = As * fs_s
    Ns_linha = As_linha * fs_s_linha
    
    # Concrete
    Nc = 0.0
    Mc = 0.0
    
    if x > 0:
        y_block = params['lambda'] * x
        if y_block > h: y_block = h
        
        conc = get_concrete_compression(y_block, geom)
        Nc = -params['fcd_design'] * conc['Area']
        Mc = Nc * (conc['Centroid'] - h/2.0)
        
    # Prestress
    Np = 0.0
    Mp = 0.0
    if params['has_prestress'] and Ap > 0:
        eps_p_delta = eps_top_atual * (safe_x - dp) / safe_x
        eps_p_total = params['eps_p0'] + eps_p_delta
        Ep_kn_cm = params['Ep'] / 10.0
        sig_p = eps_p_total * Ep_kn_cm
        fptd = params['fptd_kn_cm']
        sig_p = max(-fptd, min(fptd, sig_p))
        
        Np = Ap * sig_p
        Mp = Np * (dp - h/2.0)
        
    Ms = Ns * (d - h/2.0)
    Ms_linha = Ns_linha * (d_linha - h/2.0)
    
    Nrd = Nc + Ns + Ns_linha + Np
    Mrd = (Mc + Ms + Ms_linha + Mp) / 100.0 # Convert to kNm
    
    return {'Nrd': Nrd, 'Mrd': Mrd}

def get_x_from_ec_domain5(ec_permil, h):
    c = (3.0/7.0) * h
    ec = abs(ec_permil)
    if abs(ec - 2.0) < 1e-6: return 1e9
    return (ec * c) / (ec - 2.0)

def calculate_key_points(inputs, geom, params):
    h = geom['h']
    d = float(inputs.get('d', h))
    ecu = params['ecu'] # -0.0035
    esu = params['esu'] # 0.010
    ec2 = params['ec2']
    
    def calculate_lobe(curr_in, curr_geom):
        pts = []
        
        # Point 1: Pure Tension (approx x=0)
        # Actually x=0 is singular.
        # Calc pure tension manually:
        # All steel yields in tension. Concrete 0.
        # N = As*fyd + As'*fyd (+ prestress) ...
        # But let's follow the domain sweep logic
        
        # The sweep:
        # 1. Pivot A: x from 0 to x_23 (Strain at steel fixed at esu = 10 permil, concrete strain varies 0 to ecu)
        # x_23: Concrete reaches ecu (-3.5 permil) while Steel is at esu (10 permil)
        # Compatibility: ecu/x = (esu+ecu)/d ? No.
        # Strain profile linear. top=eps_c, d=eps_s
        # x = d * eps_c / (eps_c - eps_s)   (check signs)
        # If eps_c is comp (neg), eps_s tens (pos).
        # x = d * |eps_c| / (|eps_c| + eps_s)
        x23 = (d * abs(ecu)) / (abs(ecu) + esu)
        
        # Sweep A: x goes 0 -> x23. eps_top goes 0 -> ecu. eps_s fixed at esu.
        # x = d * |eps_top| / (|eps_top| + esu)
        # => |eps_top| = x * esu / (d - x)
        
        # 1. Pure Tension (x=0)
        # Handled inside the loop or explicitly? JS does x=0 explicitly.
        # Manual calc for x=0
        fyd = params['fyd_kn_cm']
        N_trac = (curr_in.get('As',0) + curr_in.get('As_linha',0)) * fyd
        M_trac = (curr_in.get('As',0)*fyd*(d-h/2) + curr_in.get('As_linha',0)*fyd*(curr_in.get('d_linha',0)-h/2))
        if params['has_prestress']:
            # For pure tension, prestress strain adds esu?
            # JS: `es_p_total = params.eps_p0 + esu;`
            # Yes, strain is huge.
            es_p_total = params['eps_p0'] + esu
            Ep_kn = params['Ep']/10.0
            sig_p = min(params['fptd_kn_cm'], max(-params['fptd_kn_cm'], es_p_total * Ep_kn))
            N_trac += curr_in.get('Ap',0) * sig_p
            M_trac += curr_in.get('Ap',0) * sig_p * (curr_in.get('dp',0) - h/2)
            
        pts.append({'Nrd': N_trac, 'Mrd': M_trac/100.0, 'x_val': 0})
        
        # Sweep Domain 2 (Pivot A)
        steps = 15
        for i in range(1, steps+1):
            t = i / steps
            x = x23 * t
            if x < 1e-6: continue
            # Check sign of esu (pos)
            ec_pivoA = (x * esu) / (d - x) # This is abs value of top strain
            pts.append({**get_state(x, -ec_pivoA, curr_in, curr_geom, params), 'x_val': x})
            
        # Sweep Domain 3 & 4 (Pivot B)
        # x from x23 to h (or d? Domain 4 ends at h generally? Or limit x_ud?)
        # Pivot B: Top strain fixed at ecu (-3.5 permil). x increases.
        # x goes from x23 to h (Domain 4 limit usually considered h in simple interaction)
        # Actually Domain 4 ends when steel strain = 0 (x=d). Domain 4b extends to h?
        # JS sweeps x23 to h.
        steps = 30
        for i in range(1, steps+1):
            t = i / steps
            x = x23 + (h - x23) * t
            pts.append({**get_state(x, ecu, curr_in, curr_geom, params), 'x_val': x})
            
        # Sweep Domain 5 (Pivot C)
        # x from h to infinity.
        # Point C is at h_frac = 3/7 h for NBR. Pivot at this point with strain -2 permil.
        # Top strain varies from -3.5 to -2.0.
        # x goes h -> inf
        ec_start = 3.5
        ec_end = 2.001
        steps_d5 = 100 # High res for compression spike
        for i in range(steps_d5 + 1):
            t = i / steps_d5
            ec_permil = ec_start + (ec_end - ec_start) * t
            x_val = get_x_from_ec_domain5(ec_permil, h)
            pts.append({**get_state(x_val, -ec_permil/1000.0, curr_in, curr_geom, params), 'x_val': x_val})
            
        # Pure Compression (x -> inf)
        # eps constant = ec2 (-2.0 permil)
        pts.append({**get_state(1e9, ec2, curr_in, curr_geom, params), 'x_val': 1e9})
        
        return pts

    pos_points = calculate_lobe(inputs, geom)
    
    # Negative Moment Lobe (Top in tension)
    # Invert geometry and steel
    inputs_inv = inputs.copy()
    inputs_inv['d'] = h - inputs.get('d_linha', 0)
    inputs_inv['d_linha'] = h - inputs.get('d', 0)
    inputs_inv['As'] = inputs.get('As_linha', 0)
    inputs_inv['As_linha'] = inputs.get('As', 0)
    if inputs.get('has_prestress'):
        inputs_inv['dp'] = h - inputs.get('dp', 0)
        
    geom_inv = geom.copy()
    geom_inv['bf_sup'] = geom['bf_inf']
    geom_inv['hf_sup'] = geom['hf_inf']
    geom_inv['bf_inf'] = geom['bf_sup']
    geom_inv['hf_inf'] = geom['hf_sup']
    
    neg_points_raw = calculate_lobe(inputs_inv, geom_inv)
    neg_points = []
    for p in neg_points_raw:
        neg_points.append({
            'Nrd': p['Nrd'],
            'Mrd': -p['Mrd'], # Invert moment sign
            'x_val': p['x_val']
        })
    neg_points.reverse() # Order for polygon drawing
    
    return neg_points + pos_points
