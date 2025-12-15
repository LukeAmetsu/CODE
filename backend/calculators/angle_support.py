
# Masonry Anchors (DeWalt AC100+ Gold)
# Source: User Provided Table (Face of Brick)
MASONRY_TABLE = {
    "0.375": [
        { "h_nom": 3.5, "end": 2.5, "T_allow": 720, "V_allow": 900 },
        { "h_nom": 3.5, "end": 6.0, "label": "3.5\" (High Capacity - Min End 6\")", "T_allow": 1170, "V_allow": 915 },
        { "h_nom": 6.0, "end": 6.0, "T_allow": 2085, "V_allow": 915 }
    ],
    "0.5": [
        { "h_nom": 6.0, "end": 8.0, "T_allow": 2300, "V_allow": 1860 }
    ],
    "0.625": [
        { "h_nom": 3.125, "end": 9.5, "T_allow": 945, "V_allow": 1540 },
        { "h_nom": 6.0, "end": 9.5, "T_allow": 1985, "V_allow": 1540 }
    ]
}

def format_fraction(val):
    fractions = {
        0.125: "1/8", 0.1875: "3/16", 0.25: "1/4", 
        0.3125: "5/16", 0.375: "3/8", 0.5: "1/2", 
        0.625: "5/8", 0.75: "3/4", 1.0: "1"
    }
    return fractions.get(val, str(val))

def calculate_angle_support(inputs):
    """
    Calculates Single Angle Support capacity.
    
    Expected inputs dict:
    - beam_span (ft)
    - beam_spacing (ft)
    - area_load (psf)
    - num_bolts (int)
    - bolt_diameter (str): "0.375", "0.5", "0.625"
    - embedment_index (int): Index in MASONRY_TABLE array
    - angle_leg (in)
    - angle_thick (in)
    - angle_len (in)
    - angle_fy (ksi)
    - angle_config (str): "single" or "double"
    """
    
    # 1. Parse Inputs
    L = float(inputs.get('beam_span', 0))
    spacing = float(inputs.get('beam_spacing', 0))
    area_load = float(inputs.get('area_load', 0))
    
    n_bolts = int(inputs.get('num_bolts', 1))
    dia = str(inputs.get('bolt_diameter', '0.375'))
    embed_idx = int(inputs.get('embedment_index', 0))
    
    leg_size = float(inputs.get('angle_leg', 4))
    t = float(inputs.get('angle_thick', 0.375))
    user_angle_len = float(inputs.get('angle_len', 8))
    fy = float(inputs.get('angle_fy', 36))
    config = inputs.get('angle_config', 'single')

    # 2. Calculate Demands
    # Linear Load w (klf) = (psf * ft) / 1000
    w_klf = (area_load * spacing) / 1000.0
    
    # Total Reaction V (kips) = w * L / 2
    V_total = (w_klf * L) / 2.0
    
    # Side Configuration
    num_angles = 2 if config == 'double' else 1
    V_angle = V_total / num_angles
    n_bolts_total = n_bolts
    n_bolts_angle = n_bolts_total / num_angles
    
    # Angle Bending Demand
    e = leg_size / 2.0
    Mu = V_angle * e # k-in
    
    # Per Bolt Forces
    v_bolt = V_angle / n_bolts_angle
    t_bolt = 0.0
    
    if config == 'single':
        t_bolt = V_total / n_bolts_total
    else:
        # Double angle: Tension due to prying/moment couple?
        # JS Logic: T_force_angle = Mu / legSize; t_bolt = T_force_angle / nBoltsAngle
        # Note: This logic in JS seems simplified or specific to a certain assumption.
        # We duplicate it exactly for fidelity.
        T_force_angle = Mu / leg_size
        t_bolt = T_force_angle / n_bolts_angle

    # 3. Get Capacities
    table_data = MASONRY_TABLE.get(dia)
    if not table_data or embed_idx >= len(table_data):
        return {"error": "Invalid anchor selection"}
    
    anchor = table_data[embed_idx]
    
    # Capacities in Kips (Table is in lbs)
    V_allow = anchor['V_allow'] / 1000.0
    T_allow = anchor['T_allow'] / 1000.0
    
    # 4. Check Interaction
    ratio_v = v_bolt / V_allow
    ratio_t = t_bolt / T_allow
    interaction = ratio_v + ratio_t
    
    # Check Bending
    Z_plastic = (user_angle_len * (t ** 2)) / 4.0
    Mn = fy * Z_plastic
    Ma_allow = Mn / 1.67 # Omega = 1.67
    ratio_bend = Mu / Ma_allow
    
    # 5. Recommended Length
    req_spacing = 16.0 * float(dia)
    min_end_dist = anchor['end']
    
    rec_length_calc = 0.0
    if n_bolts_angle <= 1:
        rec_length_calc = 2 * min_end_dist
    else:
        rec_length_calc = ((n_bolts_angle - 1) * req_spacing) + (2 * min_end_dist)
    
    rec_length_calc += 2.0 # Buffer
    
    # String generation
    config_str = "2L" if config == 'double' else "L"
    spec_string = f"{config_str}{leg_size}x{leg_size}x{format_fraction(t)}x{rec_length_calc:.1f}\""
    
    pass_anchor = interaction <= 1.0
    pass_bend = ratio_bend <= 1.0
    pass_all = pass_anchor and pass_bend
    
    return {
        "w_klf": w_klf,
        "V_total": V_total,
        "v_bolt": v_bolt,
        "t_bolt": t_bolt,
        "V_allow": V_allow,
        "T_allow": T_allow,
        "ratio_v": ratio_v,
        "ratio_t": ratio_t,
        "interaction": interaction,
        "anchor_details": anchor,
        "e": e,
        "Mu": Mu,
        "Z_plastic": Z_plastic,
        "Ma_allow": Ma_allow,
        "ratio_bend": ratio_bend,
        "pass_all": pass_all,
        "spec_string": spec_string,
        "rec_length_calc": rec_length_calc,
        "n_bolts_total": n_bolts_total,
        "n_bolts_angle": n_bolts_angle
    }
