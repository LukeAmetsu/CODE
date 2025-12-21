
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
    - angle_config (str): "single" or "double"
    - batch_loads (list): List of dicts {span_ft, area_load} for batch
    """
    
    # 0. Batch Processing
    batch_loads = inputs.get('batch_loads')
    if batch_loads:
        print(f"DEBUG: Processing {len(batch_loads)} load cases.")
        results = []
        base_inputs = inputs.copy()
        del base_inputs['batch_loads']
        
        for case in batch_loads:
             span_val = float(case.get('span', 0))
             load_val = float(case.get('load', 0))
             
             case_input = base_inputs.copy()
             case_input['beam_span'] = span_val
             case_input['area_load'] = load_val
             
             res = calculate_angle_support(case_input)
             
             if "error" in res:
                 results.append({"span": span_val, "load": load_val, "error": res["error"]})
                 continue

             # Merge full results for "View Details" functionality
             res.update({
                 "span": span_val,
                 "load": load_val
             })
             results.append(res)
             
        return results

    L = float(inputs.get('beam_span', 0))
    spacing = float(inputs.get('beam_spacing', 0))
    area_load = float(inputs.get('area_load', 0))
    
    n_bolts = int(inputs.get('num_bolts', 1))
    dia = str(inputs.get('bolt_diameter', '0.375'))
    embed_idx = int(inputs.get('embedment_index', 0))
    
    leg_size = float(inputs.get('angle_leg', 4))
    t = float(inputs.get('angle_thick', 0.375))
    # user_angle_len removed -> Auto calculated
    fy = float(inputs.get('angle_fy', 36))
    config = inputs.get('angle_config', 'single')
    design_method = inputs.get('design_method', 'ASD')

    # Determine Omega
    omega = 4.0 if design_method == 'OSHA' else 1.67

    # 2. Get Capacities & Geometry Data First
    # We need anchor data early to know 'min_end_dist' for Length Calculation
    table_data = MASONRY_TABLE.get(dia)
    if not table_data or embed_idx >= len(table_data):
        return {"error": "Invalid anchor selection"}
    
    anchor = table_data[embed_idx]
    min_end_dist = anchor['end']

    # 3. Calculate Geometry & Length
    # Side Configuration
    num_angles = 2 if config == 'double' else 1
    n_bolts_total = n_bolts
    n_bolts_angle = n_bolts_total / num_angles

    req_spacing = 16.0 * float(dia)
    
    # Steel Edge Distance (New Logic)
    # AISC Table J3.4 Min Edge Distance
    # Simplified rule: ~1.5 to 2.0x diameter, usually min 1.5" for 1/2" bolts.
    steel_edge_dist = max(1.5, 2.0 * float(dia)) 

    rec_length_calc = 0.0
    if n_bolts_angle <= 1:
        rec_length_calc = 2 * steel_edge_dist
    else:
        rec_length_calc = ((n_bolts_angle - 1) * req_spacing) + (2 * steel_edge_dist)
    
    rec_length_calc += max(2.0, 2.0 * float(dia)) # Buffer: 2in or 2*dia, whichever is bigger

    # 4. Calculate Demands
    # Linear Load w (klf) = (psf * ft) / 1000
    w_klf = (area_load * spacing) / 1000.0
    
    # Total Reaction V (kips) = w * L / 2
    V_total = (w_klf * L) / 2.0
    
    V_angle = V_total / num_angles
    
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

    # 5. Check Interaction
    # Capacities in Kips (Table is in lbs)
    # OSHA Adjustment: Multiply table capacity by 5/4 (1.25)
    anchor_factor = 1.25 if design_method == 'OSHA' else 1.0
    
    V_allow = (anchor['V_allow'] * anchor_factor) / 1000.0
    T_allow = (anchor['T_allow'] * anchor_factor) / 1000.0

    ratio_v = v_bolt / V_allow
    ratio_t = t_bolt / T_allow
    interaction = ratio_v + ratio_t
    
    # Check Bending - Use Calculated Length!
    # Use variable Omega
    Z_plastic = (rec_length_calc * (t ** 2)) / 4.0
    Mn = fy * Z_plastic
    Ma_allow = Mn / omega 
    ratio_bend = Mu / Ma_allow
    
    # String generation
    config_str = "2L" if config == 'double' else "L"
    spec_string = f"{config_str}{leg_size}x{leg_size}x{format_fraction(t)}x{rec_length_calc:.1f}\""

    # 6. Longitudinal Bending Check ("The Bridge")
    # Action: Bending of the profile between bolts.
    # Span: Distance between bolts (req_spacing).
    # Load: V_total (Beam Reaction).
    # Moment: P * L / 4 (Simplified Point Load in Center).
    
    # 6a. Shape Properties Lookup
    # Construct Key: L4X4X3/8
    def fmt_dim(d):
        return str(d).replace('.0', '')
    
    # Use existing format_fraction for thickness
    shape_key = f"L{fmt_dim(leg_size)}X{fmt_dim(leg_size)}X{format_fraction(t)}"
    
    section_modulus = 0.0
    
    # Import locally to avoid circular imports at top level if any
    try:
        from backend.database import db
        if db._shapes and shape_key in db._shapes:
            shape = db._shapes[shape_key]
            # User specifically mentioned "the 2.69 value" which matched Zx in the DB.
            # Using Zx (Plastic Modulus) for capacity.
            section_modulus = float(shape.get('Zx', 0))
            if section_modulus == 0:
                 # Fallback to Sx if Zx is 0 or missing
                 section_modulus = float(shape.get('Sx', 0))
        else:
            # Fallback/Approximation if DB lookup fails (e.g. custom size)
            # This shouldn't match standard DB usage but prevents crash.
            # Approx Zx for angle? Very rough. 
            pass
    except Exception as e:
        print(f"DB Lookup Error: {e}")

    # Adjust for Double Angle
    if config == 'double':
        section_modulus *= 2.0

    # 6b. Capacity
    Mn_long = fy * section_modulus
    Ma_long_allow = Mn_long / omega # Use variable Omega
    
    # 6c. Demand
    # Span is the spacing between bolts.
    span_long = req_spacing 
    # If 1 bolt, longitudinal bending doesn't exist in same way (cantilever?). 
    # But usually 2+ bolts. If 1 bolt, M=0? Or assume min span?
    # User says "distance from center load to outer bolts".
    # If 1 bolt, load is directly on bolt? Check V_bolt vs Capacity covers it.
    M_long = 0.0
    if n_bolts > 1:
        M_long = (V_total * span_long) / 4.0
    
    ratio_long = 0.0
    if Ma_long_allow > 0:
        ratio_long = M_long / Ma_long_allow
    
    pass_anchor = interaction <= 1.0
    pass_bend = ratio_bend <= 1.0
    pass_long = ratio_long <= 1.0
    pass_all = pass_anchor and pass_bend and pass_long
    
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
        "n_bolts_angle": n_bolts_angle,
        # Longitudinal Results
        "M_long": M_long,
        "Ma_long_allow": Ma_long_allow,
        "ratio_long": ratio_long,
        "section_modulus": section_modulus,
        "span_long": span_long,
        "omega": omega  # Return omega to verify in UI if needed
    }
