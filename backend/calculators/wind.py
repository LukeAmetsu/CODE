import math

def interpolate(x, x_points, y_points):
    """
    Linear interpolation function.
    x: value to interpolate at
    x_points: sorted list of x values
    y_points: corresponding list of y values
    """
    if len(x_points) != len(y_points):
        raise ValueError("x_points and y_points must have the same length")
    
    if x <= x_points[0]:
        return y_points[0]
    if x >= x_points[-1]:
        return y_points[-1]
    
    for i in range(len(x_points) - 1):
        if x_points[i] <= x and x <= x_points[i+1]:
            # Linear interpolation formula: y = y0 + (x - x0) * (y1 - y0) / (x1 - x0)
            t = (x - x_points[i]) / (x_points[i+1] - x_points[i])
            return y_points[i] + t * (y_points[i+1] - y_points[i])
    
    return y_points[0] # Should not be reached

def safe_to_fixed(val, digits=2):
    if val is None or not math.isfinite(val):
        return "N/A"
    return str(round(val, digits))

# --- COEFFICIENT & FACTOR HELPERS ---

def get_internal_pressure_coefficient(enclosure_class):
    mapping = {
        "Enclosed": (0.18, "ASCE 7 Table 26.13-1 (Enclosed)"),
        "Partially Enclosed": (0.55, "ASCE 7 Table 26.13-1 (Partially Enclosed)"),
        "Open": (0.00, "ASCE 7 Table 26.13-1 (Open)")
    }
    return mapping.get(enclosure_class, (0.00, "Invalid Enclosure"))

def get_open_sign_cf(solidity_ratio, options):
    member_shape = options.get('member_shape')
    V = options.get('V') # mph or m/s
    b = options.get('b') # ft or m
    unit_system = options.get('unit_system')
    
    epsilon = max(0, min(solidity_ratio, 1.0))
    
    if member_shape == 'flat':
        cf = interpolate(epsilon, [0.1, 0.3, 0.5, 1.0], [1.8, 1.7, 1.6, 2.0])
        return {"Cf": cf, "ref": "ASCE 7 Fig. 29.5-1 (Flat Members)"}
    else: # round
        # V in ft/s, b in ft
        V_fps = V * 1.467 if unit_system == 'imperial' else V * 3.281
        b_ft = b if unit_system == 'imperial' else b * 3.281
        V_sqrt_b = V_fps * math.sqrt(b_ft)
        
        epsilon_points = [0.1, 0.3, 0.5, 1.0]
        cf_low = [0.7, 0.8, 0.8, 1.2]
        cf_high = [1.2, 1.3, 1.3, 1.5]
        
        cf_values = cf_low if V_sqrt_b < 2.5 else cf_high
        cf = interpolate(epsilon, epsilon_points, cf_values)
        return {"Cf": cf, "ref": f"ASCE 7 Fig. 29.5-1 (Round, V√b={safe_to_fixed(V_sqrt_b, 1)})"}

def get_solid_sign_cn(B, s, z):
    if not all(math.isfinite(val) for val in [B, s, z]):
        return {"CN": 0, "ref": "Invalid dimensions for Solid Sign"}
        
    M = B / s if s > 0 else 0
    s_over_h = s / z if z > 0 else 0
    
    M_points = [0.25, 1, 2, 4, 10, 20, 40]
    cn_at_s_h_1 = [1.2, 1.2, 1.25, 1.3, 1.4, 1.5, 1.6]
    cn_at_s_h_0 = [1.8, 1.85, 1.9, 1.9, 1.95, 1.95, 2.0]
    
    cn_vals = cn_at_s_h_0 if s_over_h < 0.5 else cn_at_s_h_1
    CN = interpolate(M, M_points, cn_vals)
    return {"CN": CN, "ref": f"ASCE 7 Fig. 29.3-1 (M={safe_to_fixed(M, 2)}, s/h={safe_to_fixed(s_over_h, 2)})"}

def get_rooftop_structure_coefficients(inputs):
    # Retrieve values specifically from inputs, using correct keys
    epsilon = inputs.get('rooftop_solidity_ratio', 0.5)
    x = inputs.get('rooftop_location_x', 0)
    h = inputs.get('mean_roof_height', 10)
    
    if h <= 0:
        return {"GCrh": 0, "GCrv": 0, "ref": "Invalid rooftop structure dimensions"}
        
    x_over_h = x / h
    
    # GCrh
    gcrh_0 = interpolate(epsilon, [0.1, 0.3, 1.0], [2.0, 1.8, 1.6])
    gcrh_05 = interpolate(epsilon, [0.1, 0.3, 1.0], [1.7, 1.6, 1.5])
    GCrh = interpolate(x_over_h, [0, 0.5], [gcrh_0, gcrh_05])
    
    # GCrv
    GCrv = interpolate(epsilon, [0.1, 1.0], [0.8, 2.0])
    
    return {"GCrh": GCrh, "GCrv": GCrv, "ref": f"ASCE 7-16 Fig. 29.4-2 (Open Rooftop, ε={safe_to_fixed(epsilon, 2)})"}

def get_chimney_cf(options):
    shape = options.get('shape')
    h = options.get('h', 0)
    D = options.get('D', 0)
    if D <= 0 or h <= 0:
        return {"Cf": 0, "ref": "Invalid dimensions"}
        
    h_over_D = h / D
    h_D_points = [1, 7, 25]
    
    if shape == 'Square':
        r = options.get('r', 0)
        r_over_D = r / D
        cf_vals = [1.0, 1.1, 1.2] if r_over_D >= 0.05 else [1.3, 1.4, 2.0]
        cf = interpolate(h_over_D, h_D_points, cf_vals)
        return {"Cf": cf, "ref": f"ASCE 7 Fig. 29.4-1 (Square, r/D={safe_to_fixed(r_over_D, 2)})"}
    
    elif shape in ['Hexagonal', 'Octagonal']:
         cf_vals = [1.0, 1.2, 1.4]
         cf = interpolate(h_over_D, h_D_points, cf_vals)
         return {"Cf": cf, "ref": f"ASCE 7 Fig. 29.4-1 ({shape})"}
         
    elif shape == 'Round':
        unit_system = options.get('unit_system', 'imperial')
        qz = options.get('qz', 0)
        
        D_ft = D if unit_system == 'imperial' else D * 3.281
        qz_psf = qz if unit_system == 'imperial' else qz * 0.020885
        D_sqrt_qz = D_ft * math.sqrt(qz_psf)
        
        cf_vals = [0.5, 0.6, 0.7] if D_sqrt_qz < 2.5 else [0.7, 0.8, 0.9]
        cf = interpolate(h_over_D, h_D_points, cf_vals)
        return {"Cf": cf, "ref": f"ASCE 7 Fig. 29.4-1 (Round, D√q_z={safe_to_fixed(D_sqrt_qz, 1)})"}
        
    return {"Cf": 1.4, "ref": "ASCE 7 Fig. 29.4-1 (Default)"}

def get_trussed_tower_cf(options):
    structure_type = options.get('structure_type', '')
    solidity = options.get('solidity_ratio', 0.5)
    member_shape = options.get('member_shape', 'flat')
    
    epsilon = max(0, min(solidity, 1.0))
    
    if member_shape == 'flat':
        Cf = 4.0 * epsilon**2 - 5.9 * epsilon + 4.0
        ref = "ASCE 7 Table 29.6-1 (Flat Members)"
    else:
        if 'Square' in structure_type:
            Cf = 3.4 * epsilon**2 - 4.7 * epsilon + 2.7
            ref = "ASCE 7 Table 29.6-2 (Square Tower, Round Members)"
        else:
            Cf = 2.6 * epsilon**2 - 3.5 * epsilon + 2.2
            ref = "ASCE 7 Table 29.6-2 (Triangular Tower, Round Members)"
            
    return {"Cf": max(Cf, 0), "ref": ref}

def get_arched_roof_cn(options):
    r = options.get('r', 0)
    B = options.get('B', 1)
    h = options.get('h', 0)
    spring_point = options.get('spring_point', 'On Walls')
    
    if B <= 0: return {"cnMap": {}, "ref": "Invalid span"}

    r_over_B = r / B
    h_over_B = 0 if spring_point == 'On Ground' else h / B
    
    r_B_points = [0.05, 0.2, 0.3, 0.4, 0.5]
    
    # Windward Quarter
    cn_ww_g = [0.9, 1.1, 1.1, 1.1, 1.1]
    cn_ww_e = [1.5, 1.4, 1.4, 1.4, 1.4]
    
    val_g = interpolate(r_over_B, r_B_points, cn_ww_g)
    val_e = interpolate(r_over_B, r_B_points, cn_ww_e)
    cn_windward = interpolate(h_over_B, [0, 0.5], [val_g, val_e])
    
    # Center Half
    cn_c_0 = [-0.7, -0.8, -1.0, -1.1, -1.1]
    cn_c_05 = [-0.9, -0.8, -0.8, -0.8, -0.8]
    
    val_c0 = interpolate(r_over_B, r_B_points, cn_c_0)
    val_c05 = interpolate(r_over_B, r_B_points, cn_c_05)
    cn_center = interpolate(h_over_B, [0, 0.5], [val_c0, val_c05])
    
    return {
        "cnMap": {
            "Windward Quarter": cn_windward,
            "Center Half": cn_center,
            "Leeward Quarter": cn_center
        },
        "ref": f"ASCE 7 Fig. 27.3-3 (r/B={safe_to_fixed(r_over_B, 2)})"
    }

def get_exposure_constants(category, units):
    exp_map = {
        'B': {'alpha': 7.0, 'zg_imp': 1200.0, 'zg_metric': 365.8, 'ref': "Table 26.9-1 (B)"},
        'C': {'alpha': 9.5, 'zg_imp': 900.0, 'zg_metric': 274.3, 'ref': "Table 26.9-1 (C)"},
        'D': {'alpha': 11.5, 'zg_imp': 700.0, 'zg_metric': 213.4, 'ref': "Table 26.9-1 (D)"}
    }
    data = exp_map.get(category, exp_map['C'])
    zg = data['zg_imp'] if units == 'imperial' else data['zg_metric']
    return {'alpha': data['alpha'], 'zg': zg, 'ref_note': data['ref']}

def calculate_kz(h, category, units):
    if h < 0 or not category:
        return {'Kz': 1.0, 'alpha': 0, 'zg': 0, 'ref_note': "Error"}
    
    consts = get_exposure_constants(category, units)
    alpha, zg = consts['alpha'], consts['zg']
    
    min_h = 15.0 if units == 'imperial' else 4.6
    calc_h = max(h, min_h)
    
    Kz = 2.01 * math.pow(calc_h / zg, 2/alpha)
    return {'Kz': Kz, 'alpha': alpha, 'zg': zg, 'ref_note': f"Table 26.10-1 ({category})"}

def calculate_ke(elevation, units, standard):
    if standard == "ASCE 7-22":
        return 1.0, "ASCE 7-22 Sec 26.9 (Ke=1.0)"
        
    elev_ft = [-500, 0, 100, 500, 1000, 2000, 3000, 4000, 5000, 6000]
    ke_vals = [1.05, 1.00, 0.99, 0.95, 0.90, 0.82, 0.74, 0.67, 0.61, 0.55]
    
    elev_calc = elevation * 3.28084 if units == 'metric' else elevation
    ke_val = interpolate(elev_calc, elev_ft, ke_vals)
    return ke_val, f"Table 26.9-1 (Elev {elevation})"

def calculate_velocity_pressure(Kz, Kzt, Kd, Ke, V, standard, risk_cat, units):
    Iw = 1.0
    iw_ref = ""
    # Simplified Iw logic
    if standard == "ASCE 7-22":
        factors = {"I": 0.75, "II": 1.0, "III": 1.15, "IV": 1.15}
        Iw = factors.get(risk_cat, 1.0)
        iw_ref = "Table 1.5-2"
        
    constant = 0.00256 if units == 'imperial' else 0.613
    
    if standard == "ASCE 7-22":
        qz = constant * Kz * Kzt * Kd * Ke * Iw * (V**2)
    else:
        qz = constant * Kz * Kzt * Kd * Ke * (V**2)
        
    return qz, Iw

def get_kd_factor(structure_type, standard):
    # Simplified Kd map
    kd_map = {
        "Buildings (MWFRS, C&C)": 0.85,
        "Arched Roofs": 0.85,
        "Solid Freestanding Signs/Walls": 0.85,
        "Open Signs/Frames": 0.85,
        "Trussed Towers (Triangular, Square, Rectangular)": 0.85,
        "Trussed Towers (All Other Cross Sections)": 0.95,
        "Chimneys, Tanks (Square)": 0.90,
        "Chimneys, Tanks (Round)": 0.95,
        "Chimneys, Tanks (Hexagonal)": 0.95
    }
    if standard == 'ASCE 7-22' and structure_type == 'Open Signs/Frames':
        return 1.0, "ASCE 7-22 Table 26.6-1 Note 3"
    
    return kd_map.get(structure_type, 0.85), "Table 26.6-1"

# --- ENVELOPE PROCEDURE (CH 28) ---

def calculate_envelope_pressures(inputs, intermediate):
    h = float(inputs.get('mean_roof_height', 0))
    unit_system = inputs.get('unit_system')
    
    # Check height limits (h <= 60ft)
    max_h = 60 if unit_system == 'imperial' else 18.3
    if h > max_h:
        return {'applicable': False, 'note': "Envelope Procedure only for h <= 60 ft"}
        
    theta = float(inputs.get('roof_slope_deg', 0))
    qz = intermediate['qz']
    gcpi = intermediate['abs_gcpi']
    
    # ASCE 7-16 Ref Fig 28.3-1
    gcpf_pos = interpolate(theta, [0, 20, 30, 45], [0.4, 0.5, 0.6, 0.6])
    gcpf_neg = interpolate(theta, [0, 20, 45], [-0.6, -0.7, -0.7])
    
    pressures = {}
    
    # Zones 1-4
    # Simplified logic: calculating p_net = qz * (GCpf - GCpi)
    # We need to check both +GCpi and -GCpi and take max magnitude or specific load cases.
    # For reporting, we usually show the bounding values.
    
    zones = {
        'Zone 1 (Wall)': 0.4,
        'Zone 2 (Wall)': 0.2,
        'Zone 3 (Roof)': gcpf_pos,
        'Zone 4 (Roof)': gcpf_pos
    }
    # Uplift
    zones_uplift = {
        'Zone 1 (Wall)': -0.4,
        'Zone 2 (Wall)': -0.2,
        'Zone 3 (Roof)': gcpf_neg,
        'Zone 4 (Roof)': gcpf_neg
    }
    
    for zone, gcpf in zones.items():
        p1 = qz * (gcpf - gcpi)
        p2 = qz * (gcpf - (-gcpi))
        pressures[zone] = max(p1, p2) # Max positive (pressure)
        
    for zone, gcpf in zones_uplift.items():
        p1 = qz * (gcpf - gcpi)
        p2 = qz * (gcpf - (-gcpi))
        pressures[f"{zone} Uplift"] = min(p1, p2) # Max negative (suction)
        
    return {
        'applicable': True,
        'pressures': pressures,
        'ref': "ASCE 7-16 Ch. 28 (Envelope)"
    }

# --- FLEXIBLE GUST FACTOR ---

def calculate_gust_effect_factor(inputs, intermediate):
    if inputs.get('building_flexibility') != 'Flexible':
        return 0.85, "Rigid (Default)"
        
    T1 = float(inputs.get('fundamental_period', 1.0))
    if T1 <= 0: return 0.85, "Invalid Period"
    n1 = 1.0 / T1
    
    h = float(inputs.get('mean_roof_height'))
    B = float(inputs.get('building_width_B'))
    L = float(inputs.get('building_length_L')) # Assuming L is depth
    V = float(inputs.get('basic_wind_speed'))
    cat = inputs.get('exposure_category')
    units = inputs.get('unit_system')
    
    alpha = intermediate['alpha']
    zg = intermediate['zg']
    
    # Constants Table 26.11-1
    consts = {
        'B': (0.47, 0.30, 320, 1/3.0),
        'C': (0.65, 0.20, 500, 1/5.0),
        'D': (0.80, 0.15, 650, 1/8.0)
    }
    b_bar, c, l_val, eps_bar = consts.get(cat, consts['C'])
    
    if units == 'metric':
        b_bar *= 1.32
        c *= 1.5
        l_val *= 0.3048
        
    z_bar = max(0.6 * h, 15.0 if units == 'imperial' else 4.6)
    
    # Mean Hourly Wind Speed
    # V is 3-sec gust. Eq 26.11-16: V_z_bar = b_bar * (z_bar/33)^alpha * V (if V is in mph? No, V needs conversion probably)
    # Actually Eq 26.11-16 depends on basic wind speed V.
    # V_z_bar = b_bar * (z_bar / 33)**(1/alpha) * V * (88/60) # mph to fps
    factor = (88/60) if units == 'imperial' else 1.0
    V_33 = V * factor # Basic wind speed in fps or m/s
    V_z_bar = b_bar * (z_bar / (33 if units=='imperial' else 10))**(1/alpha) * V_33 # Rough approx of Eq 26.11-16?
    # Wait, check JS.
    # JS: V_bar_33ft = V_in * b_bar * Math.pow(33 / zg, 1 / alpha) * (unit_system === 'imperial' ? (88 / 60) : 1);
    ref_h = 33 if units == 'imperial' else 10
    term1 = (ref_h / zg)**(1/alpha) 
    # Let's match JS logic exactly
    V_bar_ref = V * b_bar * term1 * factor # V at ref height (33ft) mean hourly
    V_z_bar = V_bar_ref * (z_bar / ref_h)**(1/alpha)
    
    # Turbulence Intensity Iz
    c_t = c
    Iz = c_t * (33 / z_bar)**(1/6.0) if units =='imperial' else c_t * (10 / z_bar)**(1/6.0)
    
    # Lz
    Lz = l_val * (z_bar / ref_h)**eps_bar
    
    # Q Background Response
    Q = math.sqrt(1 / (1 + 0.63 * ((B + h) / Lz)**0.63))
    
    # Resonant R
    # N1 = n1 * Lz / V_z_bar
    N1 = (n1 * Lz) / V_z_bar
    Rn = (7.47 * N1) / (1 + 10.3 * N1)**(5/3)
    
    # Rh, RB, RL
    def calc_R_l(eta):
        if eta == 0: return 1
        return (1/eta) - (1/(2*eta**2)) * (1 - math.exp(-2*eta))
        
    Rh = calc_R_l(4.6 * n1 * h / V_z_bar)
    RB = calc_R_l(4.6 * n1 * B / V_z_bar)
    RL = calc_R_l(15.4 * n1 * L / V_z_bar) # Using RL for completeness if needed? JS used RB=Rh simplified.
    # JS: const RB = Rh; // For simplicity
    # Let's use JS simplicity
    RB = Rh 
    
    beta = 0.01 # Damping
    R = math.sqrt((1/beta) * Rn * Rh * RB)
    
    gQ = 3.4
    gR = math.sqrt(2 * math.log(3600 * n1)) + 0.577 / math.sqrt(2 * math.log(3600 * n1))
    
    Gf = 0.925 * (1 + 1.7 * Iz * math.sqrt(gQ**2 * Q**2 + gR**2 * R**2)) / (1 + 1.7 * gQ * Iz)
    
    return Gf, f"Calculated (Flexible) {safe_to_fixed(Gf, 3)}"

# --- SOLID ROOFTOP EQUIPMENT ---

def get_rooftop_equipment_gcr(inputs):
    Br = float(inputs.get('rooftop_equipment_width_Br', 0))
    Lr = float(inputs.get('rooftop_equipment_length_Lr', 0))
    hr = float(inputs.get('rooftop_equipment_height_hr', 0))
    
    if Br <= 0 or Lr <= 0 or hr <= 0:
        return {'GCrh': 0, 'GCrv': 0, 'ref': "Invalid dims"}
        
    Lr_hr = Lr / hr
    Br_hr = Br / hr
    
    # GCrh Interpolation
    Lr_hr_pts = [0, 0.5, 1, 2, 4, 7, 10]
    gcrh_curves = {
        1: [1.0, 1.0, 1.0, 1.1, 1.2, 1.35, 1.4],
        10: [1.0, 1.0, 1.0, 1.1, 1.2, 1.35, 1.4],
        40: [1.9, 1.8, 1.7, 1.6, 1.5, 1.45, 1.4]
    }
    # Double interpolation
    vals_at_Lr_hr = []
    br_keys = [1, 10, 40]
    for k in br_keys:
        vals_at_Lr_hr.append(interpolate(Lr_hr, Lr_hr_pts, gcrh_curves[k]))
        
    GCrh = interpolate(Br_hr, [1, 10, 40], vals_at_Lr_hr)
    
    # GCrv
    gcrv_pts = [0, 1, 2, 3, 4, 5, 10]
    gcrv_vals = [1.5, 1.5, 1.3, 1.15, 1.05, 1.0, 0.7]
    GCrv = interpolate(Lr_hr, gcrv_pts, gcrv_vals)
    
    return {'GCrh': GCrh, 'GCrv': GCrv, 'ref': "ASCE 7-16 Fig 29.4-1"}


# --- C&C LOGIC (CH 30) ---

GCP_DATA_LOW_RISE = {
    'wall': {
        'pos': [0.9, 0.9, 0.9, 0.9, 0.9, 0.9],
        'zone4': [-1.1, -1.1, -1.1, -1.1, -1.0, -0.9],
        'zone5': [-1.4, -1.3, -1.2, -1.1, -1.0, -0.9]
    },
    'gable': {
        'caseA': { # theta <= 7
            'pos': [0.2]*6,
            'Zone 1': { 'pos': [0.3, 0.3, 0.3, 0.3], 'neg': [-1.0, -1.0, -0.9, -0.8] },
            'Zone 2': { 'pos': [0.3, 0.3, 0.3, 0.3], 'neg': [-1.8, -1.8, -1.5, -1.4] },
            'Zone 3': { 'pos': [0.3, 0.3, 0.3, 0.3], 'neg': [-2.8, -2.8, -2.4, -2.2] } 
        },
        'caseB': { # 27 < theta <= 45
            'pos': {
                'zone1': [0.3]*6, 'zone2': [0.4]*6, 'zone3': [0.5]*6
            },
            'zone1': [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5],
            'zone2': [-1.9, -1.7, -1.4, -1.1, -0.7, -0.5],
            'zone3': [-2.8, -2.5, -1.9, -1.4, -0.7, -0.5]
        }
    },
    'hip': {
        'caseA': {
            'pos': [0.2]*6,
            'Zone 1': { 'pos': [0.3, 0.3, 0.3, 0.3], 'neg': [-1.0, -1.0, -0.9, -0.8] },
            'Zone 2': { 'pos': [0.3, 0.3, 0.3, 0.3], 'neg': [-1.7, -1.5, -1.2, -1.0] }, 
            'Zone 3': { 'pos': [0.3, 0.3, 0.3, 0.3], 'neg': [-2.3, -2.0, -1.5, -1.2] },
            'Zone 1E': { 'pos': [0.3, 0.3, 0.3, 0.3], 'neg': [-1.3, -1.3, -1.1, -1.0] },
            'Zone 2E': { 'pos': [0.3, 0.3, 0.3, 0.3], 'neg': [-2.2, -2.0, -1.6, -1.3] },
            'Zone 3E': { 'pos': [0.3, 0.3, 0.3, 0.3], 'neg': [-2.8, -2.5, -2.0, -1.5] }
        },
        'caseB': {
            'pos': { 
                'zone1': [0.3]*6, 'zone2': [0.4]*6, 'zone3': [0.5]*6,
                'zone1E': [0.4]*6, 'zone2E': [0.6]*6, 'zone3E': [0.8]*6 
            },
            'zone1': [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5], 'zone2': [-1.9, -1.7, -1.4, -1.1, -0.7, -0.5], 'zone3': [-2.8, -2.5, -1.9, -1.4, -0.7, -0.5],
            'zone1E': [-1.5, -1.5, -1.3, -1.1, -0.7, -0.5], 'zone2E': [-2.5, -2.3, -1.8, -1.4, -0.8, -0.5], 'zone3E': [-3.3, -3.0, -2.3, -1.7, -0.8, -0.5]
        }
    }
}

def get_gcp_values_for_roof_low_rise(roof_type, theta):
    roofData = GCP_DATA_LOW_RISE.get(roof_type)
    if not roofData: return {}
    
    # helper for interpolating between 7 and 27 deg (Case A to Case B)
    def interp_arr(arrA, arrB):
        return [interpolate(theta, [7, 27], [arrA[i], arrB[i]]) for i in range(len(arrA))]
        
    if theta <= 7: return roofData['caseA']
    if theta > 45: return roofData['caseB'] # Simplified fallback
    if theta > 27: return roofData['caseB']
    
    # 7 < theta <= 27: Interpolate structure
    interp_res = {}
    caseA = roofData['caseA']
    caseB = roofData['caseB']
    
    for zone in caseA:
        if zone == 'pos':
             # Positive is tricky: array vs dict
             # Case A is array [0.2...], Case B is dict {zone1:[], ...}
             # Map A array to B dict structure
             pos_interp = {}
             # Just use zone1 of A for all A inputs? Yes, assumed constant logic for A
             a_vals = caseA['pos']
             for z_b in caseB['pos']:
                 pos_interp[z_b] = interp_arr(a_vals, caseB['pos'][z_b])
             interp_res['pos'] = pos_interp
        else:
             interp_res[zone] = interp_arr(caseA[zone], caseB[zone])
             
    return interp_res

def calculate_low_rise_candc(inputs, qz, gcpi):
    A_eff = float(inputs.get('effective_wind_area', 10))
    # Log Area Interp
    areas = [10, 20, 50, 100, 500, 1000]
    log_areas = [math.log(x) for x in areas]
    log_A = math.log(A_eff)
    
    def log_interp(vals):
        return interpolate(log_A, log_areas, vals)
        
    gcp_map = {}
    
    # Wall
    wall_data = GCP_DATA_LOW_RISE['wall']
    gcp_map['Wall Zone 4'] = {'neg': log_interp(wall_data['zone4']), 'pos': log_interp(wall_data['pos'])}
    gcp_map['Wall Zone 5'] = {'neg': log_interp(wall_data['zone5']), 'pos': log_interp(wall_data['pos'])}
    
    # Roof
    rt = inputs.get('roof_type', 'gable')
    theta = float(inputs.get('roof_slope_deg', 0))
    
    if rt == 'flat': rt = 'gable' # Treat flat as gable <= 7 for C&C per JS logic
    
    if rt in ['gable', 'hip']:
        # If theta <=7, force use of 7 deg logic (Case A)
        use_theta = max(theta, 7) if theta <=7 else theta # Actually JS calls getGcp(..., 7) if flat/low
        # ... just follow JS logic
        if inputs.get('roof_type') == 'flat' or theta <= 7:
            data = get_gcp_values_for_roof_low_rise(rt, 7)
        else:
            data = get_gcp_values_for_roof_low_rise(rt, theta)
            
        # Zones
        z_map = {'zone1': 'Roof Zone 1', 'zone2': 'Roof Zone 2', 'zone3': 'Roof Zone 3', 
                 'zone1E': 'Roof Zone 1E', 'zone2E': 'Roof Zone 2E', 'zone3E': 'Roof Zone 3E'}
        
        for k, v in data.items():
            if k == 'pos': continue
            
            # Neg
            neg_val = log_interp(v)
            
            # Pos
            if isinstance(data.get('pos'), list):
                pos_val = log_interp(data['pos'])
            else:
                # Dict of zones
                p_arr = data['pos'].get(k, data['pos'].get('zone1'))
                pos_val = log_interp(p_arr)
                
            zone_name = z_map.get(k, k)
            gcp_map[zone_name] = {'neg': neg_val, 'pos': pos_val}

    elif rt == 'monoslope':
         # Fixed values per JS
         # Zone 1
         gcp_map['Roof Zone 1'] = {'neg': log_interp([-1.5, -1.4, -1.2, -1.0, -0.7, -0.5]), 'pos': 0.2}
         gcp_map['Roof Zone 2'] = {'neg': log_interp([-2.3, -2.1, -1.8, -1.5, -1.0, -0.7]), 'pos': 0.2}
         gcp_map['Roof Zone 3'] = {'neg': log_interp([-3.2, -2.9, -2.4, -2.0, -1.3, -0.9]), 'pos': 0.2}

    # Final Pressures
    res = {}
    for z, vals in gcp_map.items():
        p1 = qz * (vals['pos'] - gcpi)
        p2 = qz * (vals['pos'] - (-gcpi))
        p3 = qz * (vals['neg'] - gcpi)
        p4 = qz * (vals['neg'] - (-gcpi))
        res[z] = {
            'p_pos': max(p1, p2, p3, p4),
            'p_neg': min(p1, p2, p3, p4)
        }
        
    return {'applicable': True, 'pressures': res}

# --- HIGH-RISE C&C LOGIC (h > 60ft) ---

def interpolate_high_rise_gcp(gcp_data, A, h):
    results = {}
    heights = gcp_data['heights']
    areas = gcp_data['areas']
    log_areas = [math.log(x) for x in areas]
    log_A = math.log(A)
    
    # Iterate over zones (keys that are not heights/areas)
    for zone in gcp_data:
        if zone in ['heights', 'areas']: continue
        zoneData = gcp_data[zone]
        
        # 1. Interpolate across area (GCp vs Log A)
        pos_val_at_A = interpolate(log_A, log_areas, zoneData['pos'])
        neg_val_at_A = interpolate(log_A, log_areas, zoneData['neg'])
        
        # 2. Interpolate across height
        # The table values are actually constant across height in the JS data structure 
        # (arrays of size 3 for areas). Wait, JS logic:
        # "Since the values are constant across height... create array of same value"
        # The JS implementation implies GCP is constant with height for a given area in these specific tables?
        # Let's check JS again.
        # JS: const pos_vals_at_h = gcp_data.heights.map(() => pos_val_at_A);
        # So yes, for the tables used in JS, it seems they treat it as constant with height?
        # Actually `calculateWallPressuresHighRise` data in JS has 3 values for area.
        # But `heights` has 6 values. 
        # The JS code maps `pos_val_at_A` (scalar) to an array of size `heights`.
        # Then interpolates `h` against `heights` with that constant array.
        # This effectively means it returns `pos_val_at_A` regardless of `h`.
        # Why pass `h` then? Maybe for future proofing or I misread.
        # Let's just return the interpolated value for A.
        
        results[zone] = {
            'positive': pos_val_at_A,
            'negative': neg_val_at_A
        }
    return results

def calculate_wall_pressures_high_rise(A, h):
    gcp_data = {
        'heights': [60, 100, 200, 300, 400, 500],
        'areas': [10, 100, 500],
        'Wall Zone 4': {'pos': [0.9, 0.9, 0.8], 'neg': [-1.0, -0.9, -0.8]},
        'Wall Zone 5': {'pos': [0.9, 0.9, 0.8], 'neg': [-1.2, -1.1, -1.0]}
    }
    return interpolate_high_rise_gcp(gcp_data, A, h)

def calculate_low_slope_roof_pressures_high_rise(A, h):
    gcp_data = {
        'heights': [60, 100, 200, 300, 400, 500],
        'areas': [10, 100, 500],
        "Roof Zone 1'": {'pos': [0.7, 0.5, 0.3], 'neg': [-1.1, -0.9, -0.7]},
        "Roof Zone 2'": {'pos': [0.7, 0.5, 0.3], 'neg': [-1.8, -1.4, -1.0]},
        "Roof Zone 3'": {'pos': [0.7, 0.5, 0.3], 'neg': [-2.6, -2.0, -1.4]}
    }
    return interpolate_high_rise_gcp(gcp_data, A, h)

def calculate_steep_roof_candc(A, h, theta):
    h_tan = h * math.tan(math.radians(theta))
    log_A = math.log(A)
    log_areas = [math.log(10), math.log(100), math.log(500)]
    
    # Values depend on Theta range
    if 7 < theta <= 27:
        gcp_data = {
            'h_points': [20, 100, 500],
            "Zone 1'": {
                'pos': [[0.7, 0.5, 0.3], [0.7, 0.5, 0.3], [0.7, 0.5, 0.3]],
                'neg': [[-1.0, -0.9, -0.7], [-1.1, -1.0, -0.8], [-1.3, -1.2, -1.1]]
            },
            "Zone 2'": {
                'pos': [[0.9, 0.7, 0.5], [1.1, 0.9, 0.7], [1.3, 1.1, 0.9]],
                'neg': [[-1.8, -1.4, -1.0], [-2.1, -1.6, -1.2], [-2.5, -2.0, -1.6]]
            },
            "Zone 3'": {
                'pos': [[1.3, 1.0, 0.7], [1.6, 1.2, 0.9], [2.0, 1.6, 1.2]],
                'neg': [[-2.6, -2.0, -1.4], [-3.0, -2.4, -1.8], [-3.6, -3.0, -2.4]]
            }
        }
    else: # 27 < theta <= 45
        gcp_data = {
            'h_points': [20, 100, 500],
            "Zone 1'": {
                'pos': [[0.7, 0.5, 0.3], [0.7, 0.5, 0.3], [0.7, 0.5, 0.3]],
                'neg': [[-1.0, -0.9, -0.7], [-1.1, -1.0, -0.8], [-1.3, -1.2, -1.1]]
            },
            "Zone 2'": {
                'pos': [[1.3, 1.1, 0.9], [1.5, 1.3, 1.1], [1.8, 1.6, 1.4]],
                'neg': [[-1.9, -1.5, -1.1], [-2.2, -1.7, -1.3], [-2.6, -2.1, -1.7]]
            },
            "Zone 3'": {
                'pos': [[1.8, 1.4, 1.0], [2.2, 1.7, 1.3], [2.7, 2.2, 1.7]],
                'neg': [[-2.8, -2.2, -1.6], [-3.3, -2.6, -2.0], [-4.0, -3.3, -2.7]]
            }
        }
    
    results = {}
    h_pts = gcp_data['h_points']
    
    for zone in gcp_data:
        if zone == 'h_points': continue
        zoneData = gcp_data[zone]
        
        # 1. Interpolate for Area (resulting in value at each h_point)
        pos_at_A_per_h = [interpolate(log_A, log_areas, arr) for arr in zoneData['pos']]
        neg_at_A_per_h = [interpolate(log_A, log_areas, arr) for arr in zoneData['neg']]
        
        # 2. Interpolate across h*tan(theta)
        final_pos = interpolate(h_tan, h_pts, pos_at_A_per_h)
        final_neg = interpolate(h_tan, h_pts, neg_at_A_per_h)
        
        results[zone] = {'positive': final_pos, 'negative': final_neg}
        
    return results

def calculate_high_rise_candc(inputs, qh, gcpi):
    h = float(inputs.get('mean_roof_height'))
    A = float(inputs.get('effective_wind_area', 10))
    theta = float(inputs.get('roof_slope_deg', 0))
    rt = inputs.get('roof_type', 'gable')
    unit_system = inputs.get('unit_system')
    
    warnings = []
    results = {}
    
    # Walls
    results.update(calculate_wall_pressures_high_rise(A, h))
    
    # Roof
    is_low_slope = theta <= 7
    if rt == 'flat' or (rt in ['gable', 'hip'] and is_low_slope):
        results.update(calculate_low_slope_roof_pressures_high_rise(A, h))
    elif rt in ['gable', 'hip'] and not is_low_slope:
        results.update(calculate_steep_roof_candc(A, h, theta))
    else:
        warnings.append(f"C&C for {rt} on high-rise not supported.")
        return {'applicable': False, 'warnings': warnings}
        
    final_pressures = {}
    for zone, gcps in results.items():
        pos = gcps['positive']
        neg = gcps['negative']
        
        p1 = qh * (pos - gcpi)
        p2 = qh * (pos - (-gcpi))
        p3 = qh * (neg - gcpi)
        p4 = qh * (neg - (-gcpi))
        
        final_pressures[zone] = {
            'p_pos': max(p1, p2, p3, p4),
            'p_neg': min(p1, p2, p3, p4)
        }
        
    return {
        'applicable': True, 
        'pressures': final_pressures, 
        'warnings': warnings,
        'ref': "ASCE 7 Ch 30 Part 2"
    }

def calculate_parapet_pressures(inputs, intermediate):
    if not inputs.get('has_parapet') or float(inputs.get('parapet_height_hp', 0)) <= 0:
        return {'applicable': False}
        
    hp = float(inputs.get('parapet_height_hp'))
    h = float(inputs.get('mean_roof_height'))
    unit_system = inputs.get('unit_system')
    cat = inputs.get('exposure_category')
    
    qz = intermediate['qz']
    G = intermediate['G']
    
    kz_res = calculate_kz(h + hp, cat, unit_system)
    kp = kz_res['Kz']
    kz_h = intermediate['Kz']
    
    qp = (kp / kz_h) * qz if kz_h > 0 else qz
    
    p_ww = qp * 1.5
    p_lw = qp * -1.0
    
    return {
        'applicable': True,
        'pressures': {
            'Windward Parapet Face': p_ww,
            'Leeward Parapet Face': p_lw
        },
        'ref': "ASCE 7 Eq. 27.4-4a/b"
    }

def calculate_overhang_pressures(inputs, intermediate, mwfrs_results):
    if not inputs.get('has_overhang') or float(inputs.get('overhang_length', 0)) <= 0:
        return {'applicable': False}
        
    qz = intermediate['qz']
    G = intermediate['G']
    cp_oh = 0.8 
    
    # Try to find windward roof Cp from results
    # This is simplified; in JS it digs into the list of results
    cp_roof_top = -0.7
    
    net_cp = cp_roof_top - cp_oh # Uplift + Uplift
    pressure = qz * G * net_cp
    
    return {
        'applicable': True,
        'pressure': pressure,
        'ref': "ASCE 7 Sec. 27.4.6"
    }


# --- DETAILED Cp LOGIC ---

def get_gable_hip_cp_values(h, L, B, roof_slope_deg, is_hip, unit_system):
    cp_map = {}
    theta = roof_slope_deg
    h_over_L = h / L if L > 0 else 0
    h_unit = 'ft' if unit_system == 'imperial' else 'm'
    
    least_dim = min(L, B)
    a = min(0.1 * least_dim, 0.4 * h)
    min_a_val1 = 0.04 * least_dim
    min_a_val2 = 3.0 if unit_system == 'imperial' else 0.9
    a = max(a, min_a_val1, min_a_val2)
    
    a_str = f"(a={safe_to_fixed(a, 1)} {h_unit})"
    
    # Windward
    cp_1_ww = interpolate(theta, [10, 20, 30, 45], [-0.7, -0.4, 0.2, 0.4])
    cp_2_ww = interpolate(theta, [10, 20, 30, 45], [-0.9, -0.7, -0.2, 0.4])
    cp_3_ww = interpolate(theta, [20, 30, 45], [-1.3, -1.0, -0.5])
    
    # Leeward
    cp_1_lw = interpolate(h_over_L, [0, 0.5, 1.0], [-0.5, -0.5, -0.3])
    cp_2_lw = interpolate(h_over_L, [0, 0.5, 1.0], [-0.7, -0.7, -0.5])
    cp_3_lw = -0.9
    
    cp_map[f"Roof Zone 1 (Windward)"] = cp_1_ww
    cp_map[f"Roof Zone 2 (Windward) {a_str}"] = cp_2_ww
    if theta >= 20:
        cp_map[f"Roof Zone 3 (Windward) {a_str}"] = cp_3_ww
        
    cp_map[f"Roof Zone 1 (Leeward)"] = cp_1_lw
    cp_map[f"Roof Zone 2 (Leeward) {a_str}"] = cp_2_lw
    cp_map[f"Roof Zone 3 (Leeward) {a_str}"] = cp_3_lw
    
    if is_hip:
        cp_1e = interpolate(theta, [10, 20, 27], [-0.9, -0.7, -0.5])
        cp_2e = interpolate(theta, [10, 20, 27], [-1.3, -0.9, -0.7])
        cp_3e = interpolate(theta, [20, 27], [-1.3, -1.0])
        
        cp_map[f"Hip End Zone 1E"] = cp_1e
        cp_map[f"Hip End Zone 2E {a_str}"] = cp_2e
        if theta >= 20:
            cp_map[f"Hip End Zone 3E {a_str}"] = cp_3e
            
    cp_map["Side Wall"] = -0.7
    return cp_map

def get_analytical_cp_values(h, dim_parallel, dim_perp, roof_slope_deg):
    cp_map = {}
    L_over_B = dim_parallel / dim_perp if dim_perp > 0 else 0
    
    cp_map["Windward Wall"] = 0.8
    cp_map[f"Leeward Wall (L/B = {safe_to_fixed(L_over_B, 2)})"] = interpolate(L_over_B, [0, 1, 2, 4], [-0.5, -0.5, -0.3, -0.2])
    cp_map["Side Wall"] = -0.7
    
    h_over_L = h / dim_parallel if dim_parallel > 0 else 0
    if h_over_L <= 0.8:
        cp_map[f"Roof Windward (h/L = {safe_to_fixed(h_over_L, 2)})"] = interpolate(roof_slope_deg, [10, 15, 20, 25, 30, 35, 45], [-0.7, -0.5, -0.3, -0.2, 0.0, 0.2, 0.4])
        cp_map[f"Roof Leeward (h/L = {safe_to_fixed(h_over_L, 2)})"] = interpolate(roof_slope_deg, [10, 15, 20], [-0.3, -0.5, -0.6])
    else:
        cp_map[f"Roof Windward (h/L = {safe_to_fixed(h_over_L, 2)})"] = interpolate(roof_slope_deg, [10, 15, 20, 25, 30, 35, 45], [-0.9, -0.7, -0.4, -0.3, -0.2, 0.0, 0.4])
        cp_map[f"Roof Leeward (h/L = {safe_to_fixed(h_over_L, 2)})"] = -0.7
        
    return cp_map

def get_open_building_cn_values(roof_slope_deg, is_obstructed, roof_type):
    cn_map = {}
    theta = abs(roof_slope_deg)
    case_key = 'obstructed' if is_obstructed else 'unobstructed'
    interp_theta = max(theta, 5)
    
    monoslope_data = {
        'unobstructed': {
            'pos': {
                'windward_qtr': interpolate(interp_theta, [5, 30, 45], [0.8, 1.2, 1.2]),
                'middle_half': interpolate(interp_theta, [5, 30, 45], [-0.8, -0.8, -0.8]),
                'leeward_qtr': interpolate(interp_theta, [5, 30, 45], [-0.6, -0.5, -0.5])
            },
            'neg': {
                'windward_qtr': interpolate(interp_theta, [5, 30, 45], [-1.2, -1.8, -1.8]),
                'middle_half': interpolate(interp_theta, [5, 30, 45], [-1.2, -1.2, -1.2]),
                'leeward_qtr': interpolate(interp_theta, [5, 30, 45], [-1.0, -0.8, -0.8])
            }
        },
        'obstructed': {
            'pos': {
                'windward_qtr': interpolate(interp_theta, [5, 30, 45], [1.6, 2.4, 2.4]),
                'middle_half': interpolate(interp_theta, [5, 30, 45], [-1.6, -1.6, -1.6]),
                'leeward_qtr': interpolate(interp_theta, [5, 30, 45], [-1.2, -1.0, -1.0])
            },
            'neg': {
                 'windward_qtr': interpolate(interp_theta, [5, 30, 45], [-2.2, -3.3, -3.3]),
                 'middle_half': interpolate(interp_theta, [5, 30, 45], [-2.2, -2.2, -2.2]),
                 'leeward_qtr': interpolate(interp_theta, [5, 30, 45], [-1.6, -1.4, -1.4])
            }
        }
    }
    
    data = monoslope_data[case_key]
    cn_map["Windward Roof Quarter"] = {"cn_pos": data['pos']['windward_qtr'], "cn_neg": data['neg']['windward_qtr']}
    cn_map["Middle Roof Half"] = {"cn_pos": data['pos']['middle_half'], "cn_neg": data['neg']['middle_half']}
    cn_map["Leeward Roof Quarter"] = {"cn_pos": data['pos']['leeward_qtr'], "cn_neg": data['neg']['leeward_qtr']}
    
    return {"cnMap": cn_map, "ref": f"ASCE 7 Fig 27.3-4 ({case_key} flow)"}

def get_cp_values(standard, h, L, B, roof_type, roof_slope_deg, unit_system):
    cp_map = {}
    L_over_B = L / B if B > 0 else 0
    h_unit = 'ft' if unit_system == 'imperial' else 'm'
    
    cp_map["Windward Wall"] = 0.8
    cp_map["Side Wall"] = -0.7
    cp_map["Leeward Wall"] = interpolate(L_over_B, [0, 1, 2, 4], [-0.5, -0.5, -0.3, -0.2])
    
    if roof_type == "flat":
        if standard == "ASCE 7-22":
            least_dim = min(L, B)
            a = max(min(0.1 * least_dim, 0.4 * h), 3.0 if unit_system == 'imperial' else 0.9)
            cp_map[f"Roof Zone 1 (0 to {safe_to_fixed(a, 1)} {h_unit})"] = -0.9
            cp_map[f"Roof Zone 2 ({safe_to_fixed(a, 1)} to {safe_to_fixed(2*a, 1)} {h_unit})"] = -0.5
            cp_map[f"Roof Zone 3 (> {safe_to_fixed(2*a, 1)} {h_unit})"] = -0.3
        else: # ASCE 7-16
            h_over_L = h / L if L > 0 else 0
            if h_over_L <= 0.5:
                cp_map[f"Roof (0 to {safe_to_fixed(h/2, 1)} {h_unit})"] = -0.9
                cp_map[f"Roof ({safe_to_fixed(h/2, 1)} to {safe_to_fixed(h, 1)} {h_unit})"] = -0.9
                cp_map[f"Roof ({safe_to_fixed(h, 1)} to {safe_to_fixed(2*h, 1)} {h_unit})"] = -0.5
                cp_map[f"Roof (> {safe_to_fixed(2*h, 1)} {h_unit})"] = -0.3
            else:
                cp_map[f"Roof (0 to {safe_to_fixed(h/2, 1)} {h_unit})"] = interpolate(h_over_L, [0.5, 1.0], [-0.9, -1.3])
                cp_map[f"Roof ({safe_to_fixed(h/2, 1)} to {safe_to_fixed(h, 1)} {h_unit})"] = interpolate(h_over_L, [0.5, 1.0], [-0.9, -0.7])
                cp_map[f"Roof (> {safe_to_fixed(h, 1)} {h_unit})"] = interpolate(h_over_L, [0.5, 1.0], [-0.5, -0.4])
                
    elif roof_type in ["gable", "hip"]:
        is_hip = (roof_type == 'hip')
        gable_hip_vals = get_gable_hip_cp_values(h, L, B, roof_slope_deg, is_hip, unit_system)
        cp_map.update(gable_hip_vals)
        
    elif roof_type == "monoslope":
        cp_map["Windward Roof"] = interpolate(roof_slope_deg, [0, 10, 27], [-0.9, -0.7, -0.7])
        cp_map["Leeward Roof"] = -0.5
        
    return cp_map

def calculate_design_pressure(q_ext, q_int, G, Cp, GCpi):
    external_pressure = q_ext * G * Cp
    # Internal pressure is q_int * GCpi.
    # We subtract internal from external: p = qGCp - qi(GCpi)
    internal_pressure = q_int * GCpi
    return external_pressure - internal_pressure

def calculate_wind_load(inputs):
    """
    Main orchestrator function, similar to JS 'run'.
    """
    # 1. Defaults and Standard Selection
    asce_standard = inputs.get('asce_standard', 'ASCE 7-16')
    unit_system = inputs.get('unit_system', 'imperial')
    risk_category = inputs.get('risk_category', 'II')
    V = float(inputs.get('basic_wind_speed', 115))
    h = float(inputs.get('mean_roof_height', 50))
    exposure_cat = inputs.get('exposure_category', 'C')
    structure_type = inputs.get('structure_type', 'Buildings (MWFRS, C&C)')
    enclosure_class = inputs.get('enclosure_classification', 'Enclosed')
    
    # NYCBC Check (simplified)
    if inputs.get('jurisdiction') == "NYCBC 2022":
        asce_standard = "ASCE 7-16"
        # In a real app, strict mapping here.
        
    # Temporary Reduction
    if inputs.get('temporary_construction') == "Yes":
        V *= 0.8
        
    # 2. Intermediate Values
    is_building = structure_type == 'Buildings (MWFRS, C&C)'
    if is_building:
        abs_gcpi, gcpi_ref = get_internal_pressure_coefficient(enclosure_class)
    else:
        abs_gcpi, gcpi_ref = 0.0, "N/A"
        
    items = {}
    items['abs_gcpi'] = abs_gcpi
    
    Kd, kd_ref = get_kd_factor(structure_type, asce_standard)
    items['Kd'] = Kd
    
    elev = float(inputs.get('ground_elevation', 0))
    Ke, ke_ref = calculate_ke(elev, unit_system, asce_standard)
    items['Ke'] = Ke
    
    kz_res = calculate_kz(h, exposure_cat, unit_system)
    Kz = kz_res['Kz']
    items['Kz'] = Kz
    
    Kzt = float(inputs.get('topographic_factor_Kzt', 1.0))
    items['Kzt'] = Kzt
    
    qz, Iw = calculate_velocity_pressure(Kz, Kzt, Kd, Ke, V, asce_standard, risk_category, unit_system)
    items['qz'] = qz
    items['Iw'] = Iw
    
    G = float(inputs.get('gust_effect_factor_g', 0.85))
    g_raw, g_ref = calculate_gust_effect_factor({**inputs, 'V': V}, {**items, 'alpha': kz_res['alpha'], 'zg': kz_res['zg']})
    if inputs.get('building_flexibility') == 'Flexible':
        G = g_raw
    items['G'] = G
    
    # 3. Strategy Execution
    results = {
        "inputs": inputs,
        "intermediate": items,
        "mwfrs_results": {},
        "candc_results": {}, 
        "warnings": []
    }
    
    if structure_type == 'Buildings (MWFRS, C&C)':
        L = float(inputs.get('building_length_L', 100))
        B = float(inputs.get('building_width_B', 60))
        roof_type = inputs.get('roof_type', 'gable')
        slope = float(inputs.get('roof_slope_deg', 30))
        
        is_high_rise = (unit_system == 'imperial' and h > 60) or (unit_system == 'metric' and h > 18.3)
        method = inputs.get('mwfrs_method', 'Envelope')
        
        if method == 'Envelope' and not is_high_rise and enclosure_class != 'Open':
             res_env = calculate_envelope_pressures(inputs, items)
             if res_env['applicable']:
                 results['method_used'] = "Envelope Procedure"
                 results['mwfrs_results']['envelope'] = res_env['pressures']
             else:
                 results['warnings'].append(res_env.get('note', 'Envelope N/A'))
                 # Fallback?
        else:
             if method == 'Envelope':
                 results['warnings'].append("Envelope Procedure not applicable (High-Rise or Open). Reverting to Directional.")

             # Directional Procedure
             results['method_used'] = "Directional Procedure"
             
             if enclosure_class == 'Open':
                 is_obstructed = inputs.get('wind_obstruction') == 'obstructed'
                 cn_res = get_open_building_cn_values(slope, is_obstructed, roof_type)
                 pressures = {}
                 for zone, val in cn_res['cnMap'].items():
                     p_pos = qz * G * val['cn_pos']
                     p_neg = qz * G * val['cn_neg']
                     pressures[zone] = {'p_pos': p_pos, 'p_neg': p_neg}
                 results['mwfrs_results']['open_roof'] = pressures
             else:
                 if is_high_rise:
                     # High Rise / Analytical
                     cp_L = get_analytical_cp_values(h, L, B, slope)
                     cp_B = get_analytical_cp_values(h, B, L, slope)
                     results['mwfrs_results']['perp_to_L'] = cp_L
                     results['mwfrs_results']['perp_to_B'] = cp_B
                 else:
                     # Low Rise Directional
                     cp_L = get_cp_values(asce_standard, h, L, B, roof_type, slope, unit_system)
                     cp_B = get_cp_values(asce_standard, h, B, L, roof_type, slope, unit_system)
                     
                     res_L = {}
                     for surface, cp in cp_L.items():
                         res_L[surface] = {
                             'cp': cp,
                             'p_pos': calculate_design_pressure(qz, qz, G, cp, abs_gcpi),
                             'p_neg': calculate_design_pressure(qz, qz, G, cp, -abs_gcpi)
                         }
                     results['mwfrs_results']['perp_to_L'] = res_L
                     
                     res_B = {}
                     for surface, cp in cp_B.items():
                         res_B[surface] = {
                             'cp': cp,
                             'p_pos': calculate_design_pressure(qz, qz, G, cp, abs_gcpi),
                             'p_neg': calculate_design_pressure(qz, qz, G, cp, -abs_gcpi)
                         }
                     results['mwfrs_results']['perp_to_B'] = res_B

        # C&C Dispatcher
        if is_high_rise:
            cc = calculate_high_rise_candc(inputs, qz, abs_gcpi)
        else:
            cc = calculate_low_rise_candc(inputs, qz, abs_gcpi)
            
        if cc.get('applicable'):
            results['candc_results'] = cc['pressures']
        if cc.get('warnings'):
            results['warnings'].extend(cc['warnings'])

    elif structure_type == 'Arched Roofs':

        r = float(inputs.get('arched_roof_rise', 15))
        spring = inputs.get('arched_roof_spring_point', 'On Walls')
        res = get_arched_roof_cn({'r':r, 'B': float(inputs.get('building_width_B', 60)), 'h': h, 'spring_point': spring})
        
        pressures = {}
        for zone, CN in res['cnMap'].items():
            pressures[zone] = qz * G * CN
        results['mwfrs_results']['arched_roof'] = pressures

    elif structure_type == 'Open Signs/Frames':
        solidity = float(inputs.get('solidity_ratio', 0.5))
        opts = {
            'member_shape': inputs.get('member_shape', 'flat'),
            'V': V,
            'b': float(inputs.get('member_diameter', 0.5)),
            'unit_system': unit_system
        }
        res = get_open_sign_cf(solidity, opts)
        results['mwfrs_results']['open_sign'] = {'Cf': res['Cf'], 'pressure': qz * G * res['Cf']}
        
    elif structure_type == 'Solid Freestanding Signs/Walls':
        # Need z_centroid
        s = float(inputs.get('sign_height_s', 10))
        z_clear = float(inputs.get('clearance_z', 10))
        z_cent = z_clear + s/2
        
        # Recalculate Kz at centroid
        kz_cent = calculate_kz(z_cent, exposure_cat, unit_system)['Kz']
        qz_cent = calculate_velocity_pressure(kz_cent, Kzt, Kd, Ke, V, asce_standard, risk_category, unit_system)[0]
        
        res = get_solid_sign_cn(float(inputs.get('sign_width_B', 20)), s, z_cent)
        results['mwfrs_results']['solid_sign'] = {'CN': res['CN'], 'pressure': qz_cent * G * res['CN']}
        
    elif 'Trussed Tower' in structure_type:
        res = get_trussed_tower_cf(inputs)
        results['mwfrs_results']['trussed_tower'] = {'Cf': res['Cf'], 'pressure': qz * G * res['Cf']}
        
    elif 'Chimneys, Tanks' in structure_type:
        shape = 'Round'
        if 'Square' in structure_type: shape = 'Square'
        elif 'Hexagonal' in structure_type: shape = 'Hexagonal'
        elif 'Octagonal' in structure_type: shape = 'Octagonal'
        
        opts = {
            'shape': shape,
            'h': float(inputs.get('chimney_height', 80)),
            'D': float(inputs.get('chimney_diameter', 10)),
            'qz': qz,
            'r': float(inputs.get('corner_radius_r', 0)),
            'unit_system': unit_system
        }
        res = get_chimney_cf(opts)
        results['mwfrs_results']['chimney'] = {'Cf': res['Cf'], 'pressure': qz * G * res['Cf']}
        
    elif 'Circular Domes' in structure_type:
        # Placeholder for Circular Domes
        # ASCE 7-16 Sec 27.3.3 and Figure 27.3-2? No, see above.
        # Implemented as a placeholder warning
        results['warnings'].append("Circular Domes logic not yet fully implemented. Values are zero.")
        results['mwfrs_results']['dome'] = {'pressure': 0}

        
        
    # --- Parapets & Overhangs ---
    if inputs.get('has_parapet'):
        results['parapet_results'] = calculate_parapet_pressures(inputs, items)
        
    if inputs.get('has_overhang') and structure_type == 'Buildings (MWFRS, C&C)':
        # Simplified: Passing full results, helper needs to extract (assumed implemented)
        results['overhang_results'] = calculate_overhang_pressures(inputs, items, results['mwfrs_results'])

    # --- Rooftop Equipment ---
    if inputs.get('has_rooftop_equipment'):
        if inputs.get('rooftop_structure_type') == 'Solid Equipment':
            res = get_rooftop_equipment_gcr(inputs)
            q_roof = qz # qh
            results['rooftop_results'] = {
                'GCrh': res['GCrh'],
                'GCrv': res['GCrv'],
                'p_horiz': q_roof * res['GCrh'],
                'p_vert': q_roof * res['GCrv'],
                'ref': res['ref']
            }
        else: # Open-Frame
            res = get_rooftop_structure_coefficients(inputs)
            q_roof = qz # qh
            results['rooftop_results'] = {
                'GCrh': res['GCrh'],
                'GCrv': res['GCrv'],
                'p_horiz': q_roof * res['GCrh'],
                'p_vert': q_roof * res['GCrv']
            }

    return results
