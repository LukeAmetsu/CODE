import math
from backend.database import db

# Masonry Anchors (DeWalt AC100+ Gold)
MASONRY_TABLE = {
    "0.375": [
        { "h_nom": 3.5, "end": 2.5, "T_allow": 720, "V_allow": 900 },
        { "h_nom": 3.5, "end": 6.0, "label": "3.5\" (High Capacity)", "T_allow": 1170, "V_allow": 915 },
        { "h_nom": 6.0, "end": 6.0, "T_allow": 2085, "V_allow": 915 }
    ],
    "0.5": [
        { "h_nom": 6.0, "end": 8.0, "T_allow": 2300, "V_allow": 1860 }
    ],
    "0.625": [
        { "h_nom": 3.125, "end": 9.5, "T_allow": 945, "V_allow": 1540 },
        { "h_nom": 6.0, "end": 9.5, "T_allow": 1985, "V_allow": 1540 }
    ],
    "0.75": [] # Add data if needed
}

def format_fraction(val):
    fractions = {
        0.125: "1/8", 0.1875: "3/16", 0.25: "1/4", 
        0.3125: "5/16", 0.375: "3/8", 0.5: "1/2", 
        0.625: "5/8", 0.75: "3/4", 1.0: "1"
    }
    return fractions.get(val, str(val))

def ceiling_round(val, step=0.25):
    """Rounds up to the nearest step (e.g. 0.25)."""
    return math.ceil(val / step) * step

def calculate_angle_support(inputs):
    """
    Calculates Single Angle Support with ZIG-ZAG (Staggered) checks.
    """
    
    # --- 0. Batch Processing ---
    batch_loads = inputs.get('batch_loads')
    if batch_loads:
        results = []
        base_inputs = inputs.copy()
        del base_inputs['batch_loads']
        for case in batch_loads:
             span_val = float(case.get('span', 0))
             load_val = float(case.get('load', 0))
             spacing_val = float(case.get('spacing', base_inputs.get('beam_spacing', 0)))
             bolts_val = int(case.get('num_bolts', base_inputs.get('num_bolts', 1)))
             
             case_input = base_inputs.copy()
             case_input.update({
                 'beam_span': span_val, 
                 'area_load': load_val, 
                 'beam_spacing': spacing_val,
                 'num_bolts': bolts_val
             })
             res = calculate_angle_support(case_input)
             
             if "error" in res:
                 results.append({"span": span_val, "load": load_val, "error": res["error"]})
                 continue
             res.update({"span": span_val, "load": load_val, "num_bolts": bolts_val})
             results.append(res)
        return results

    # --- 1. Inputs & Setup ---
    L = float(inputs.get('beam_span', 0))
    spacing = float(inputs.get('beam_spacing', 0))
    area_load = float(inputs.get('area_load', 0))
    n_bolts = int(inputs.get('num_bolts', 1))
    dia_str = str(inputs.get('bolt_diameter', '0.375'))
    dia = float(dia_str)
    embed_idx = int(inputs.get('embedment_index', 0))
    
    leg_size = float(inputs.get('angle_leg', 4))
    t = float(inputs.get('angle_thick', 0.375))
    fy = float(inputs.get('angle_fy', 36))
    config = inputs.get('angle_config', 'single')
    design_method = inputs.get('design_method', 'ASD')
    omega = 4.0 if design_method == 'OSHA' else 1.67

    # --- STAGGERED INPUT CHECK ---
    # Ensure this captures strings "true"/"True" from UI forms if necessary
    raw_stagger = inputs.get('staggered', False)
    is_staggered = str(raw_stagger).lower() == 'true' if isinstance(raw_stagger, str) else bool(raw_stagger)

    # Gage (Vertical distance)
    user_gage = inputs.get('gage')
    gage = float(user_gage) if user_gage else 2.5 

    # --- 2. Masonry & Edge Constants ---
    # AISC Table J3.4 Min Edge Distances
    if dia <= 0.5:
        aisc_edge_min = 0.875
    elif dia <= 0.625:
        aisc_edge_min = 1.125
    elif dia <= 0.75:
        aisc_edge_min = 1.25
    else:
        aisc_edge_min = 1.75
        
    user_buffer = float(inputs.get('edge_buffer', 0.0))
    steel_edge_dist = max(aisc_edge_min, user_buffer)
    
    table_data = MASONRY_TABLE.get(dia_str)
    if not table_data or embed_idx >= len(table_data):
         return {"error": f"Invalid anchor data for {dia_str}"}
         
    anchor = table_data[embed_idx]
    h_nom = anchor.get('h_nom', 0)
    req_spacing = 16.0 * dia 

    # --- 3. LAYOUT & LENGTH CALCULATION ---
    num_angles = 2 if (config == 'double' or config == 'top_bottom') else 1
    n_bolts_total = n_bolts
    n_bolts_angle = n_bolts_total / num_angles
    
    warnings = []
    
    if is_staggered:
        # --- STAGGERED LOGIC ---
        
        # A. Vertical Edge Check [USER REQUESTED]
        # Leg must fit: Top Edge + Gage + Bottom Edge
        min_leg_height = gage + (2 * steel_edge_dist)
        
        if leg_size < min_leg_height:
             warnings.append(f"Vertical Fail: Leg {leg_size}\" too small for {gage}\" gage. Min req: {min_leg_height:.2f}\"")
        
        if req_spacing > gage:
            raw_s = math.sqrt((req_spacing ** 2) - (gage ** 2))
            s_horiz = ceiling_round(raw_s, 0.25)
        else:
            s_horiz = 0.0

        # Total Span (Zig-Zag advances s_horiz for every bolt after the first)
        if n_bolts_angle > 1:
            span_length = (n_bolts_angle - 1) * s_horiz
        else:
            span_length = 0.0

        # Total Length
        raw_length = span_length + (2 * steel_edge_dist)
        rec_length_calc = ceiling_round(raw_length, 0.25)
            
        layout_msg = f"Zig-Zag: {int(n_bolts_angle)} Bolts (Gage {gage}\", Horiz {s_horiz:.2f}\")"
        
    else:
        # --- LINEAR LOGIC ---
        if leg_size < (2 * steel_edge_dist):
            warnings.append(f"Vertical Fail: Leg {leg_size}\" too small for edge dist.")
            
        if n_bolts_angle <= 1:
            raw_length = 2 * steel_edge_dist
            rec_length_calc = ceiling_round(raw_length, 0.25)
        else:
            raw_length = ((n_bolts_angle - 1) * req_spacing) + (2 * steel_edge_dist)
            rec_length_calc = ceiling_round(raw_length, 0.25)
            
        layout_msg = f"Linear: 1 Row x {int(n_bolts_angle)} Bolts (Spacing {req_spacing:.2f}\")"

    # --- 4. Load & Tension Analysis ---
    w_klf = (area_load * spacing) / 1000.0
    V_total = (w_klf * L) / 2.0
    V_angle = V_total / num_angles
    
    # --- Calc Allowables Early ---
    anchor_factor = 1.25 if design_method == 'OSHA' else 1.0
    V_allow = (anchor['V_allow'] * anchor_factor) / 1000.0
    T_allow = (anchor['T_allow'] * anchor_factor) / 1000.0
    
    user_e = inputs.get('moment_arm')
    e = float(user_e) if (user_e and float(user_e) > 0) else (leg_size / 2.0)
    Mu = V_angle * e

    # Tension Calc (Elastic vs Linear vs Top/Bottom)
    beam_depth = float(inputs.get('beam_depth', 0))
    
    if config == 'top_bottom':
        # Top & Bottom Angle Logic
        # 1. Moments are generated by the FULL reaction (V_total) acting at ecc (e).
        # Previous logic incorrectly used V_angle (half load) -> Fixed.
        Mu = V_total * e
        
        # Arm = Beam Depth + Leg (approx couple arm)
        d_arm = beam_depth + leg_size
        if d_arm <= 0: d_arm = 1.0 # Safety
        
        T_couple = Mu / d_arm
        
        # 2. Force Distribution
        # Seat (Bottom) takes 100% of Shear.
        # Cap (Top) takes 100% of Tension Couple.
        
        # Assume bolts split 50/50 for now (e.g. 6 bolts -> 3 top, 3 bot)
        n_bolts_top = max(1, int(n_bolts_total / 2))
        n_bolts_bot = max(1, n_bolts_total - n_bolts_top)
        
        # Tension per Bolt (on Cap)
        t_bolt = T_couple / n_bolts_top
        
        # Shear per Bolt (on Seat)
        v_bolt = V_total / n_bolts_bot
        
        # Interaction: Check Worst Case
        # Cap: Tension Only
        ratio_t_cap = t_bolt / T_allow
        # Seat: Shear Only
        ratio_v_seat = v_bolt / V_allow
        
        # Overall interaction is the worst of the two independent checks
        interaction = max(ratio_t_cap, ratio_v_seat)
        
        # Map back to generic ratio_t/v for display (showing the worst cases)
        ratio_t = ratio_t_cap
        ratio_v = ratio_v_seat
        
        layout_msg = f"Top/Bot: {int(n_bolts_total)} Total Bolts ({n_bolts_top} Top, {n_bolts_bot} Seat)"

    elif is_staggered:
        # Elastic Method (My/I)
        y = gage / 2.0
        sum_y_sq = n_bolts_angle * (y**2)
        
        if sum_y_sq > 0:
            t_bolt = (Mu * y) / sum_y_sq
        else:
             t_bolt = (Mu / leg_size) / n_bolts_angle 
    else:
        # Standard Bracket assumption (Linear/Prying)
        t_bolt = (Mu / leg_size) / n_bolts_angle
        
    # Only overwrite v_bolt if NOT top_bottom (since we calculated specific v_bolt for seat above)
    if config != 'top_bottom':
        v_bolt = V_angle / n_bolts_angle
        ratio_v = v_bolt / V_allow
        ratio_t = t_bolt / T_allow
        interaction = ratio_v + ratio_t

    # --- 5. Interaction Checks ---
    # RE-FACTORING: Allowables calculated early.
    
    # 2. Logic Split updates ratios directly?
    # actually, let's just re-calc ratios at end if NOT TB.
    if config != 'top_bottom':
         ratio_v = v_bolt / V_allow
         ratio_t = t_bolt / T_allow
         interaction = ratio_v + ratio_t
    
    # --- 6. Angle Bending Check ---
    Z_plastic = (rec_length_calc * (t ** 2)) / 4.0
    Ma_allow = (fy * Z_plastic) / omega
    ratio_bend = Mu / Ma_allow
    
    # --- 7. Longitudinal Bending Check ---
    leg_str = str(int(leg_size)) if float(leg_size).is_integer() else str(leg_size)
    t_str = format_fraction(t)
    shape_name = f"L{leg_str}X{leg_str}X{t_str}"
    
    db_shape = db.get_shape_details(shape_name)
    Zx_val = float(db_shape.get('Zx', 0)) if db_shape else 0.0
    
    L_long = req_spacing 
    w_lin = w_klf / 12.0
    M_long = (w_lin * (L_long ** 2)) / 8.0
    Mn_long = fy * Zx_val
    Ma_long = Mn_long / omega
    
    ratio_long = (M_long / Ma_long) if Ma_long > 0 else 999.0
    
    # --- 8. Final Spec String ---
    if config == 'top_bottom':
        config_str = "TB"
    else:
        config_str = "2L" if config == 'double' else "L"
        
    stag_lbl = " (Staggered)" if is_staggered else ""
    spec_string = f"{config_str}{leg_size}x{leg_size}x{format_fraction(t)}x{rec_length_calc:g}\"{stag_lbl}"

    pass_all = interaction <= 1.0 and ratio_bend <= 1.0 and ratio_long <= 1.0 and len(warnings) == 0

    # --- 9. Calculation Breakdown ---
    breakdown = {}
    
    if config == 'top_bottom':
         # Specialized Breakdown for TB
         breakdown['shear_steps'] = [
            f"Linear Load w = {w_klf:.2f} klf",
            f"Beam Reaction V_total = {V_total:.2f} kips",
            f"<strong>Seat Angle (Bottom) takes 100% Gravity Shear</strong>",
            f"Bolts on Seat n_seat = {n_bolts_bot}",
            f"Shear per Bolt (Seat) v = V_total / n_seat = {V_total:.2f} / {n_bolts_bot} = {v_bolt:.3f} kips"
        ]
        
         breakdown['tension_steps'] = [
             f"Eccentricity e = {e:.2f} in",
             f"<strong>Full Reaction Moment</strong> M_u = V_total × e = {V_total:.2f} × {e:.2f} = {Mu:.2f} kip-in",
             f"Lever Arm d = Depth + Leg = {beam_depth:.2f} + {leg_size:.2f} = {d_arm:.2f} in",
             f"Couple Force T = M_u / d = {Mu:.2f} / {d_arm:.2f} = {T_couple:.2f} kips",
             f"<strong>Cap Angle (Top) takes 100% Tension</strong>",
             f"Bolts on Cap n_cap = {n_bolts_top}",
             f"Tension per Bolt (Cap) t = T / n_cap = {T_couple:.2f} / {n_bolts_top} = {t_bolt:.3f} kips",
             f"<em>Note: Interaction is Max(ShearRatio, TensionRatio) for independent angles.</em>"
        ]
    else:
        # Standard Breakdown
        # Shear Breakdown
        breakdown['shear_steps'] = [
            f"Linear Load w = {w_klf:.2f} klf",
            f"Beam Reaction V_total = (w × L) / 2 = ({w_klf:.2f} × {L:.1f}) / 2 = {V_total:.2f} kips",
            f"Shear per Angle V_angle = V_total / {num_angles} = {V_total:.2f} / {num_angles} = {V_angle:.2f} kips",
            f"Shear per Bolt v = V_angle / {int(n_bolts_angle)} = {V_angle:.2f} / {int(n_bolts_angle)} = {v_bolt:.3f} kips"
        ]

        # Tension Breakdown
        breakdown['tension_steps'] = []
        breakdown['tension_steps'].append(f"Eccentricity e = {e:.2f} in")
        breakdown['tension_steps'].append(f"Moment M_u = V_angle × e = {V_angle:.2f} × {e:.2f} = {Mu:.2f} kip-in")
        
        if is_staggered and n_bolts_angle > 1:
            breakdown['tension_steps'].append(f"Elastic Method (Staggered Bolt Group)")
            breakdown['tension_steps'].append(f"Max Bolt Distance y = {y:.2f} in")
            breakdown['tension_steps'].append(f"Sum of y² = {sum_y_sq:.2f} in²")
            breakdown['tension_steps'].append(f"Tension t = (M_u × y) / Σy² = ({Mu:.2f} × {y:.2f}) / {sum_y_sq:.2f} = {t_bolt:.3f} kips")
        else:
            breakdown['tension_steps'].append(f"Simplified Prying Method")
            breakdown['tension_steps'].append(f"Approx. Lever Arm = Angle Leg = {leg_size:.2f} in")
            t_total_tension = Mu / leg_size
            breakdown['tension_steps'].append(f"Total Tension Required = M_u / Leg = {Mu:.2f} / {leg_size:.2f} = {t_total_tension:.2f} kips")
            breakdown['tension_steps'].append(f"Tension per Bolt t = Total / n = {t_total_tension:.2f} / {int(n_bolts_angle)} = {t_bolt:.3f} kips")

    return {
        "spec_string": spec_string,
        "layout_msg": layout_msg,
        "rec_length_calc": rec_length_calc,
        "warnings": warnings,
        "interaction": interaction,
        "ratio_bend": ratio_bend,
        "ratio_long": ratio_long,
        "pass_all": pass_all,
        "t_bolt": t_bolt,
        "v_bolt": v_bolt,
        "V_total": V_total,
        "w_klf": w_klf,
        "V_allow": V_allow,
        "T_allow": T_allow,
        "ratio_v": ratio_v,
        "ratio_t": ratio_t,
        "anchor_details": {"h_nom": h_nom, "type": "DeWalt AC100+"},
        "e": e,
        "Mu": Mu,
        "Z_plastic": Z_plastic,
        "Ma_allow": Ma_allow,
        "span_long": L_long,
        "M_long": M_long,
        "section_modulus": Zx_val,
        "Ma_long_allow": Ma_long,
        "n_bolts_total": n_bolts_total,
        "n_bolts_angle": n_bolts_angle,
        "edge_dist": steel_edge_dist,
        "breakdown": breakdown
    }
