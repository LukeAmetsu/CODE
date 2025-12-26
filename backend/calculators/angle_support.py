import math

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
    Calculates Single Angle Support capacity with STAGGERED BOLT Logic.
    """
    
    # --- 0. Batch Processing (Kept as is) ---
    batch_loads = inputs.get('batch_loads')
    if batch_loads:
        results = []
        base_inputs = inputs.copy()
        del base_inputs['batch_loads']
        for case in batch_loads:
             span_val = float(case.get('span', 0))
             load_val = float(case.get('load', 0))
             spacing_val = float(case.get('spacing', base_inputs.get('beam_spacing', 0)))
             case_input = base_inputs.copy()
             case_input.update({'beam_span': span_val, 'area_load': load_val, 'beam_spacing': spacing_val})
             res = calculate_angle_support(case_input)
             if "error" in res:
                 results.append({"span": span_val, "load": load_val, "error": res["error"]})
                 continue
             res.update({"span": span_val, "load": load_val})
             results.append(res)
        return results

    # --- 1. Inputs ---
    L = float(inputs.get('beam_span', 0))
    spacing = float(inputs.get('beam_spacing', 0))
    area_load = float(inputs.get('area_load', 0))
    
    n_bolts = int(inputs.get('num_bolts', 1))
    dia = str(inputs.get('bolt_diameter', '0.375'))
    dia_float = float(dia)
    embed_idx = int(inputs.get('embedment_index', 0))
    
    leg_size = float(inputs.get('angle_leg', 4))
    t = float(inputs.get('angle_thick', 0.375))
    fy = float(inputs.get('angle_fy', 36))
    config = inputs.get('angle_config', 'single')
    design_method = inputs.get('design_method', 'ASD')
    
    # NEW INPUTS FOR STAGGER
    is_staggered = inputs.get('staggered', False) # Boolean
    gage = float(inputs.get('gage', 2.5)) # Vertical distance between staggered rows (default 2.5")

    # Omega
    omega = 4.0 if design_method == 'OSHA' else 1.67

    # --- 2. Capacities & Masonry Data ---
    table_data = MASONRY_TABLE.get(dia)
    if not table_data or embed_idx >= len(table_data):
        return {"error": "Invalid anchor selection"}
    
    anchor = table_data[embed_idx]
    
    # --- 3. Geometry & Length Calculation (UPDATED) ---
    num_angles = 2 if config == 'double' else 1
    n_bolts_total = n_bolts
    n_bolts_angle = n_bolts_total / num_angles
    
    # Masonry Min Spacing (usually 16d)
    req_spacing = 16.0 * dia_float
    
    # [NEW] AISC Table J3.4 Min Edge Distances (Sheared Edges)
    # 1/2 -> 0.875 | 5/8 -> 1.125 | 3/4 -> 1.25 | 1 -> 1.75
    if dia_float <= 0.5:
        aisc_edge_min = 0.875
    elif dia_float <= 0.625:
        aisc_edge_min = 1.125
    elif dia_float <= 0.75:
        aisc_edge_min = 1.25
    else:
        aisc_edge_min = 1.75
        
    # User requested 2" buffer, but we must respect AISC min.
    steel_edge_dist = max(aisc_edge_min, 1.0) # Using 1.0 as a generous baseline, user can override

    # [NEW] Staggered Length Logic
    if is_staggered:
        # If staggered, bolts are in 2 rows. 
        # Number of "Columns" (horizontal steps) = ceil(n / 2)
        n_cols = math.ceil(n_bolts_angle / 2.0)
        
        # Horizontal Pitch (s):
        # We assume the diagonal distance is controlled by masonry req_spacing.
        # s_horiz = sqrt(req_spacing^2 - gage^2)
        # If gage is large, s_horiz might be small. 
        # For safety, let's keep s_horiz = req_spacing to define the "Span".
        s_horiz = req_spacing 
        
        if n_cols <= 1:
            span_length = 0
        else:
            span_length = (n_cols - 1) * s_horiz
            
        # Total Length = Horizontal Span + 2 * Edge
        rec_length_calc = span_length + (2 * steel_edge_dist)
        
        # Add a bit of extra tolerance for the stagger offset if odd number
        rec_length_calc += (s_horiz / 2.0) # Optional buffer for the "zig" vs "zag" end
        
    else:
        # Linear (Original Logic)
        if n_bolts_angle <= 1:
            rec_length_calc = 2 * steel_edge_dist
        else:
            rec_length_calc = ((n_bolts_angle - 1) * req_spacing) + (2 * steel_edge_dist)

    # --- 4. Load Calculations ---
    w_klf = (area_load * spacing) / 1000.0
    V_total = (w_klf * L) / 2.0
    V_angle = V_total / num_angles
    
    # Moment Calculation (Eccentricity)
    user_e = inputs.get('moment_arm')
    if user_e and float(user_e) > 0:
        e = float(user_e)
    else:
        e = leg_size / 2.0
    Mu = V_angle * e # k-in

    # --- 5. Bolt Tension (THE MATH CHANGE) ---
    v_bolt = V_angle / n_bolts_angle
    t_bolt = 0.0
    
    if config == 'single':
        t_bolt_shear_load = V_total / n_bolts_total # Direct Tension if applicable? No, usually V is shear.
        # For Angle, V is Shear, Tension comes from Moment (Mu)
    
    # TENSION CALCULATION
    if is_staggered:
        # [NEW] Elastic Method (Moment of Inertia)
        # Centroid is at 0. Top row at +g/2, Bottom row at -g/2.
        y_max = gage / 2.0
        
        # Sum of y^2
        # All bolts are at distance (g/2) from neutral axis
        sum_y_sq = n_bolts_angle * (y_max ** 2)
        
        if sum_y_sq > 0:
            # T = (M * y) / I
            t_bolt = (Mu * y_max) / sum_y_sq
        else:
            t_bolt = 0 # Should not happen if gage > 0
            
    else:
        # [OLD] Prying Method (Linear)
        # Assumes lever arm is roughly the leg size
        T_force_angle = Mu / leg_size
        t_bolt = T_force_angle / n_bolts_angle

    # --- 6. Interaction & Checks ---
    anchor_factor = 1.25 if design_method == 'OSHA' else 1.0
    V_allow = (anchor['V_allow'] * anchor_factor) / 1000.0
    T_allow = (anchor['T_allow'] * anchor_factor) / 1000.0

    ratio_v = v_bolt / V_allow
    ratio_t = t_bolt / T_allow
    interaction = ratio_v + ratio_t
    
    # Bending Check
    Z_plastic = (rec_length_calc * (t ** 2)) / 4.0
    Mn = fy * Z_plastic
    Ma_allow = Mn / omega 
    ratio_bend = Mu / Ma_allow

    pass_all = interaction <= 1.0 and ratio_bend <= 1.0
    
    config_str = "2L" if config == 'double' else "L"
    stagger_note = " (Staggered)" if is_staggered else ""
    spec_string = f"{config_str}{leg_size}x{leg_size}x{format_fraction(t)}x{rec_length_calc:.1f}\"{stagger_note}"

    return {
        "w_klf": w_klf,
        "V_total": V_total,
        "v_bolt": v_bolt,
        "t_bolt": t_bolt, # This is now calculated via Elastic Method if staggered
        "V_allow": V_allow,
        "T_allow": T_allow,
        "interaction": interaction,
        "pass_all": pass_all,
        "spec_string": spec_string,
        "rec_length_calc": rec_length_calc,
        "calc_method": "Elastic (My/I)" if is_staggered else "Simplified (M/d)"
    }
