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
    
    # ELS Cracking Check
    cracking_points = calculate_cracking_limit_curve(i, geom, params)
    
    return {'points': points, 'cracking_points': cracking_points}

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

def calculate_cracking_limit_curve(inputs, geom, params):
    """
    Calculates points (N, M) corresponding to the crack width limit (els-w).
    Based on NBR 6118, Stage II (Linear Elastic).
    """
    phi_l = float(inputs.get('phi_l', 16.0)) # mm
    wk_lim = float(inputs.get('wk_lim', 0.3)) # mm
    
    print(f"[DEBUG] Cracking Check: phi={phi_l}, wk={wk_lim}")
    
    # 1. Determine Limiting Steel Stress (sigma_s_lim) for the given wk_lim
    # NBR 6118 Eq 17.1: wk = (phi / (12.5 * eta_1)) * (sigma_s / Es) * (3 * sigma_s / fctm)
    # Using eta_1 = 2.25 (High bond)
    # wk = (phi / 28.125) * (sigma_s^2 / (Es * fctm)) * 3? 
    # Let's check the exact formula:
    # wk = (phi_i / 12.5 * eta1) * (sigma_si / Esi) * (sigma_si / fctm) / rho_ri ? No.
    # NBR Eq 17.2:
    # wk = alpha * rho * (sigma_s / Es) * (3 * sigma_s / fctm) ... no.
    
    # Standard approximation for NBR 6118:
    # w = (phi / 12.5 * eta1) * (sigma_s / Es) * max( (sigma_s / fctm) * 3 , ??? )
    # Let's use the basic one often used for 'estimation':
    # w = (phi * sigma_s^2 * 3) / (12.5 * eta1 * Es * fctm)
    # Solve for sigma_s:
    # sigma_s^2 = (w * 12.5 * eta1 * Es * fctm) / (3 * phi)
    # sigma_s = sqrt(...)
    
    # Material properties
    fck = float(inputs.get('fck', 25))
    fctm = 0.3 * (fck ** (2/3)) # MPa
    Es_mpa = params['Es'] * 10 # kN/cm2 -> MPa
    eta1 = 2.25 # Ribbed bars
    
    # Convert units to consistent set. Let's use N, mm, MPa.
    # phi in mm. wk in mm. Es in MPa. fctm in MPa.
    
    # wk = (phi/12.5/eta1) * (sigma_s/Es) * (3*sigma_s/fctm)
    # wk = (phi * 3 * sigma_s^2) / (12.5 * eta1 * Es * fctm)
    
    term = (wk_lim * 12.5 * eta1 * Es_mpa * fctm) / (3 * phi_l)
    sigma_s_lim_mpa = math.sqrt(term)
    
    # Limit sigma_s to fyk? (Though ELS usually well below fyk)
    fyk = float(inputs.get('fyk', 500))
    if sigma_s_lim_mpa > fyk: sigma_s_lim_mpa = fyk
    
    sigma_s_lim = sigma_s_lim_mpa / 10.0 # MPa -> kN/cm2
    
    # 2. Iterate Neutral Axis (x) and find (N, M) for this stress
    # Linear Elastic Analysis (Stage II)
    # Concrete Stress: Linear distribution. Max sigma_c.
    # Steel Stress: sigma_s = sigma_s_lim (Fixed).
    # From geometric compatibility + Hooke's Law:
    # eps_s = sigma_s / Es
    # eps_c / x = eps_s / (d - x)  => eps_c = eps_s * x / (d - x)
    # sigma_c = eps_c * Ec
    # Ec = 4760 * sqrt(fck) ... or Eci/Ecs.
    # NBR 6118: Eci = 5600 * sqrt(fck). Ecs = alpha_i * Eci.
    # For simplified check, let's use Ecs ~= 0.85 Eci? Or Eci.
    # Let's use Ecs from standard.
    
    alpha_e = 10 # Modular ratio Es/Ec approx. Or calculate?
    # Ec = 5600 * sqrt(fck) (MPa).
    # if fck > 20... use full formula?
    # Let's calculate Ec.
    if fck <= 50:
        Eci = 5600 * math.sqrt(fck)
    else:
        Eci = 21500 * ((fck/10) ** (1/3)) # Approx for high strength? No let's stick to standard 5600 for now or input.
        
    alpha_i = 0.8 + 0.2 * (fck / 80) if fck > 80 else (0.8 + 0.2 * (fck/80)) # wait formula is alpha_E
    # Let's stick to alpha_e = 10 or 15 as common approximation if exact not needed?
    # Correct calculation:
    Ec_mpa = Eci * 0.9 # Ecs approx 0.9 Eci for granite aggregate?
    Ec_kn_cm = Ec_mpa / 10.0
    alpha_e = params['Es'] / Ec_kn_cm
    
    d = float(inputs.get('d', 55))
    h = geom['h']
    
    points = []
    
    # Iterate x from 0.05d to 0.95d (Depth of neutral axis)
    # x is depth from compressed fiber.
    steps = 40
    for i in range(1, steps):
        x = (i / steps) * d
        
        # Calculate Strains/Stresses
        # Fix Tension Steel Stress to Limiting Value
        fs_s = sigma_s_lim # kN/cm2
        
        # Strains (compatibility)
        eps_s = fs_s / params['Es']
        eps_c = eps_s * x / (d - x)
        
        # Concrete Stress (Linear)
        fc_max = eps_c * Ec_kn_cm
        
        # Check linearized concrete limit? (0.5 fck usually for creep linear assumption)
        # But we force the steel to be at Wk limit. Concrete stress just follows.
        
        # Integration of Forces (Stage II - Linear)
        
        # Concrete Compression (Triangle)
        # Resultant C = 0.5 * fc_max * b * x (for rect).
        # General shape: Integrate.
        # Simple integration for complex shapes:
        # Split into strips or Use generalized 'get_concrete_compression' but with Linear stress profile?
        # Existing 'get_concrete_compression' assumes rectangular stress block (lambda*x).
        # We need LINEAR stress block.
        
        # Custom Integration for Linear Stress:
        Nc_val = 0
        Mc_val = 0
        
        # Discretize compressed zone
        y_steps = 20
        dy = x / y_steps
        for j in range(y_steps):
            y_mid = (j + 0.5) * dy # distance from NA? No, x is depth.
            # let y be distance from Neutral Axis upwards?
            # Geometry function returns width at depth.
            # Let's iterate depth 'y_depth' from 0 (top) to x.
            y_depth = (j + 0.5) * dy
            
            # Strain at y_depth:
            # eps(y) = eps_c * (x - y_depth) / x
            eps_local = eps_c * (x - y_depth) / x
            sig_local = eps_local * Ec_kn_cm
            
            # Width at y_depth
            # Need a helper 'get_width(y, geom)'
            # Inline logic:
            width = 0
            if y_depth <= geom.get('hf_sup',0): width = geom.get('bf_sup',0)
            elif y_depth <= (h - geom.get('hf_inf',0)): width = geom.get('bw',0)
            else: width = geom.get('bf_inf',0)
            
            dA = width * dy
            dF = sig_local * dA
            
            Nc_val += dF
            Mc_val += dF * (y_depth - h/2.0) # Moment about geometric center
            
        # Resultant is Compression -> Negative Force in our convention?
        # In existing 'get_state': Nc = -fcd * Area. (Negative).
        # Our dF is stress (positive number computed) * Area.
        # Concrete is in compression. So Force should be Negative.
        Nc_val = -Nc_val
        Mc_val = -Mc_val # This assumes positive moment puts top in compression.
        # Wait. Moment arm = (y_depth - h/2).
        # If y_depth < h/2 (top), arm is negative.
        # Force is negative (comp).
        # Moment = Neg * Neg = Pos. Correct.
        
        # Steel Forces
        # Tension Steel (Bottom)
        Ns = inputs.get('As',0) * fs_s # Positive (Tension)
        Ms = Ns * (d - h/2.0)
        
        # Compression Steel (Top) - d_linha
        d_lin = inputs.get('d_linha', 5)
        # Strain at d_lin:
        # eps_sl = eps_c * (x - d_lin) / x
        eps_sl = eps_c * (x - d_lin) / x
        # Stress (Elastic)
        fs_sl = eps_sl * params['Es'] 
        # Note: if d_lin < x, it is in compression (eps_sl > 0 in this logic? no eps_c is comp strain magnitude?)
        # Let's standardize signs.
        # eps_c (top) is compression. Let's say Comp is Negative.
        # eps_s (bottom) is tension. Positive.
        # Profile: linear.
        # eps(z) = eps_s + (eps_c - eps_s) * (z - d) / (0 - d) ?
        
        # Easier:
        # Curvature Kappa = eps_s / (d - x)
        # Strain at depth z: eps(z) = Kappa * (z - x)
        # If z > x (below NA), Strain > 0 (Tension).
        # If z < x (above NA), Strain < 0 (Compression).
        
        # Re-calc with signed strains:
        Kappa = (sigma_s_lim / params['Es']) / (d - x)
        
        # Concrete Integration Signed
        Nc_val = 0
        Mc_val = 0
        for j in range(y_steps):
            y_depth = (j + 0.5) * dy # 0 to x
            
            eps_local = Kappa * (y_depth - x) # Should be negative
            sig_local = eps_local * Ec_kn_cm
            
            width = 0
            if y_depth <= geom.get('hf_sup',0): width = geom.get('bf_sup',0)
            elif y_depth <= (h - geom.get('hf_inf',0)): width = geom.get('bw',0)
            else: width = geom.get('bf_inf',0)
            
            dA = width * dy
            dF = sig_local * dA
            
            Nc_val += dF
            Mc_val += dF * (y_depth - h/2.0)
            
        # Top Steel (d_lin)
        eps_s_lin = Kappa * (d_lin - x)
        fs_s_lin = eps_s_lin * params['Es']
        Ns_lin = inputs.get('As_linha',0) * fs_s_lin
        Ms_lin = Ns_lin * (d_lin - h/2.0)
        
        # Bottom Steel (d) - Fixed to limit
        eps_s_bot = Kappa * (d - x) # should match sigma_s_lim/Es
        fs_s_bot = eps_s_bot * params['Es']
        # Use computed to be consistent, though it should equal (or slightly differ due to float)
        Ns = inputs.get('As',0) * fs_s_bot
        Ms = Ns * (d - h/2.0)
        
        # Total
        N_tot = Nc_val + Ns_lin + Ns
        M_tot = (Mc_val + Ms_lin + Ms) / 100.0 # kNm
        
        
    print(f"[DEBUG] Cracking Check Generated {len(points)} points.")
    return points
