import math
from ..database import db
from .steel_check import steel_checker

def find_lightest_beam(inputs):
    """
    Finds the lightest W-shape for a given load.
    
    Expected inputs dict:
    - design_method (str): 'LRFD', 'ASD', 'OSHA'
    - fy (float): Yield strength in ksi
    - lb_ft (float): Unbraced length in ft
    - cb (float): Cb factor
    - mu_req (float): Required Moment in k-ft (optional, calculated if missing)
    - span_ft (float): Span in ft (for fallback Mu calc)
    - w_load (float): Load in k/ft (for fallback Mu calc)
    - max_depth (float): Max depth in inches (optional)
    - batch_loads (list): List of dicts {span_ft, w_load} for batch processing
    """
    
    # 0. Check for Batch Processing
    batch_loads = inputs.get('batch_loads', [])
    if batch_loads:
        results = []
        # Reuse this functions core logic by calling passing a modified input
        # Problem: recursion with 'batch_loads' in inputs -> Infinite loop?
        # Fix: Remove 'batch_loads' from copy.
        
        base_inputs = inputs.copy()
        del base_inputs['batch_loads']
        
        for case in batch_loads:
            # Parse case: "20, 1.2" (str) or {span: 20, load: 1.2} (obj)
            # Assuming logic handles parsing or prepared inputs
            span_val = float(case.get('span', 0))
            load_val = float(case.get('load', 0))
            
            case_input = base_inputs.copy()
            case_input['span_ft'] = span_val
            case_input['w_load'] = load_val
            
            # Map batch keys to input keys
            if 'lb' in case:
                case_input['lb_ft'] = float(case['lb'])
            if 'cb' in case:
                case_input['cb'] = float(case['cb'])
                
            case_input['mu_req'] = 0 # Force recalc
            
            # Run core
            res = find_lightest_beam(case_input)
            
            # Extract Winner
            winner = None
            if res.get('candidates'):
                winner = res['candidates'][0]
                
            results.append({
                "span": span_val,
                "load": load_val,
                "winner": winner
            })
            
        return results

    # --- 2x Beam Analysis Logic (if enabled and NOT in recursion) ---
    # We want to do this ONLY for single runs (or deeper recursion of single runs, but not infinite).
    # 'check_double' flag should be removed from recursive calls to prevent infinite loop if we call 'find_lightest_beam' recursively.
    # Actually, we can just process it right here before gathering inputs.
    
    check_double = inputs.get('check_double', False)
    if check_double:
        # 1. Run Standard Single Analysis
        # Create a clean input without 'check_double' to avoid recursion triggers
        single_inputs = inputs.copy()
        single_inputs['check_double'] = False 
        
        # Get Single Results
        res_single = find_lightest_beam(single_inputs)
        candidates_single = res_single.get('candidates', [])

        # REFINE LOGIC: Only look for 2x if NO Standard Single candidates found, OR if very few found (<10).
        # User wants option to compare if choices are limited.
        if len(candidates_single) >= 10:
            return res_single
        
        # 2. Run Double Analysis (Half Loads)
        # We need to halve the DEMAND.
        # Demand comes from 'mu_req' OR ('w_load' and 'span_ft').
        double_inputs = inputs.copy()
        double_inputs['check_double'] = False
        
        # Adjust Demand
        # If Mu is provided, halve it.
        mu_req_d = float(inputs.get('mu_req', 0))
        if mu_req_d != 0:
            double_inputs['mu_req'] = mu_req_d * 0.5
            
        # If w_load is provided, halve it.
        w_load_d = float(inputs.get('w_load', 0))
        if w_load_d != 0:
            double_inputs['w_load'] = w_load_d * 0.5
            
        # Run calculation for "Half Beam"
        res_double = find_lightest_beam(double_inputs)
        candidates_half = res_double.get('candidates', [])
        
        # 3. Process Double Candidates
        candidates_double = []
        for c in candidates_half:
            # Scale up properties to reflect 2 beams
            # We clone to avoid modifying the original references if cached
            new_c = c.copy()
            new_c['name'] = "2x " + c['name']
            new_c['weight'] = c['weight'] * 2
            new_c['capacity'] = c['capacity'] * 2
            new_c['Mp'] = c['Mp'] * 2
            new_c['Mr'] = c['Mr'] * 2
            new_c['Ix'] = c['Ix'] * 2
            # Deflection logic:
            # Deflection of 2 beams carrying Load W is SAME as 1 beam carrying Load W/2.
            # However, the c['deflection'] we got is for 1 beam carrying Half Load. 
            # So the deflection value is correct for the SYSTEM.
            # Defl ratio is also correct.
            # depth stays same.
            
            candidates_double.append(new_c)
            
        # 4. Process
        # Merge single (if any) and double
        all_candidates = candidates_single + candidates_double
        all_candidates.sort(key=lambda x: (x['weight'], x['depth']))
        
        return {
            "candidates": all_candidates[:20], 
            "desired": res_single.get('desired') 
        }

    
    # 1. Gather Inputs
    shape_type = inputs.get('shape_type', 'W')
    method = inputs.get('design_method', 'ASD')
    fy = float(inputs.get('fy', 50))
    E = 29000.0
    lb_ft = float(inputs.get('lb_ft', 0))
    lb_in = lb_ft * 12.0
    cb = float(inputs.get('cb', 1.0))
    
    # Determine Required Moment
    span_ft = float(inputs.get('span_ft', 0))
    w_load = float(inputs.get('w_load', 0))
    m_req = float(inputs.get('mu_req', 0))
    if m_req == 0:
        m_req = (w_load * span_ft * span_ft) / 8.0
        
    max_depth = float(inputs.get('max_depth', 9999))
    max_ratio = float(inputs.get('max_ratio', 1.0))
    if max_ratio <= 0: max_ratio = 1.0 # Safety fallback
    
    # 2. Fetch Database
    shapes = db.get_shapes_by_type(shape_type)
    
    valid_candidates = []
    desired_result = None
    desired_shape = inputs.get('desired_shape', '').upper()
    
    # 3. Iterate
    print(f"DEBUG: Processing {len(shapes)} shapes from DB.")
    
    cant_ft = float(inputs.get('cantilever_ft', 0))
    is_cantilever = cant_ft > 0
    # span_ft and w_load relative to "User" are already defined above.

    if is_cantilever:
        print(f"DEBUG: CANTILEVER MODE. L_cant={cant_ft}, L_back={span_ft}, w_user={w_load}")

    restricted_pool = inputs.get('restricted_pool')

    # --- Pre-calculate Support Capacities ---
    support_type = inputs.get('support_type', 'NONE')
    num_legs = int(inputs.get('num_legs', 1))
    col_lb = float(inputs.get('column_lb_ft', 12.0))
    brace_a = float(inputs.get('brace_a', 4.0))
    brace_theta = float(inputs.get('brace_theta', 45.0))
    
    leg_capacity = 0.0
    brace_capacity = 0.0
    leg_name = ""
    brace_name = ""
    
    if support_type == 'HSS_BRACE':
        leg_name = "HSS6X6X3/8"
        brace_name = "2L3X3X1/4"
        
        # Leg Capacity
        leg_props = db.get_shape_details(leg_name)
        if leg_props:
            leg_res = steel_checker.check_compression(leg_props, {'design_method': method, 'Fy': 50, 'Lb_input': col_lb, 'K': 1.0})
            leg_capacity = leg_res.get('phiPn_or_Pn_omega', 0) * num_legs
            
        # Brace Capacity
        brace_props = db.get_shape_details(brace_name)
        if brace_props:
            # For brace, unbraced length is sqrt(a^2 + (a*tan(theta))^2) approximately. 
            # Or just use the diagonal length: a / cos(theta)
            theta_rad = math.radians(brace_theta)
            brace_len_ft = brace_a / math.cos(theta_rad) if math.cos(theta_rad) != 0 else brace_a * 1.414
            brace_res = steel_checker.check_compression(brace_props, {'design_method': method, 'Fy': 36, 'Lb_input': brace_len_ft, 'K': 1.0})
            brace_capacity = brace_res.get('phiPn_or_Pn_omega', 0) * num_legs
            
    elif support_type == 'PIPE_NO_BRACE':
        leg_name = "PIPE3-1/2STD"
        leg_props = db.get_shape_details(leg_name)
        if leg_props:
            leg_res = steel_checker.check_compression(leg_props, {'design_method': method, 'Fy': 35, 'Lb_input': col_lb, 'K': 1.0})
            leg_capacity = leg_res.get('phiPn_or_Pn_omega', 0) * num_legs

    
    for name, props in shapes.items():
        # Metric check filter (some DBs have metric)
        if shape_type not in name: 
            # Basic check: Ensure the shape name starts with or contains the type.
            # For 'W' it works. For 'S' (S12x30) it works.
            continue 
            
        current_lb_ft = lb_ft
        current_lb_in = lb_in
        
        if restricted_pool is not None:
            if name not in restricted_pool:
                continue
            current_lb_ft = float(restricted_pool[name])
            current_lb_in = current_lb_ft * 12.0
        
        # Parse Weight from name W12x26 -> 26
        try:
            parts = name.split('X')
            weight = float(parts[1])
        except:
            continue
            
        d = props.get('d', 0)
        
        # Check required props
        if not all(k in props for k in ['Zx', 'Sx', 'ry', 'J']):
            continue
        
        # --- STATIC ANALYSIS (Moment & Deflection) ---
        # Calculate these PER SHAPE because Self-Weight matters
        
        current_m_req = m_req # Default from input
        fos_ot = 999.0
        max_reaction = 0.0
        
        if is_cantilever:
            w_beam = weight / 1000.0 # klf
            w_cant_total = w_load + w_beam
            w_back_total = w_beam # Backspan SW only
            
            # Moment at Support (Cantilever side) matches User input M usually, but we must add SW
            # M_cant = (w * a^2) / 2
            # Note: inputs['mu_req'] passed from frontend ALREADY includes User Load Moment.
            # But it DOES NOT include Self-Weight Moment.
            # We should recalculate TOTAL Required Moment here to be safe and accurate.
            
            m_cant_load = (w_load * cant_ft**2) / 2.0
            m_cant_sw = (w_beam * cant_ft**2) / 2.0
            m_cant_total = m_cant_load + m_cant_sw
            
            # Use this as the demand
            current_m_req = m_cant_total
            
            # Stability / Overturning
            # Overturning Moment about Fulcrum (Cantilever Load + SW)
            # Center of User Load is L_cant/2. Center of SW is L_cant/2.
            m_ot = (w_load * cant_ft * (cant_ft/2.0)) + (w_beam * cant_ft * (cant_ft/2.0))
            
            # Resisting Moment about Fulcrum (Backspan SW)
            # Center of Backspan SW is L_span/2
            m_res = (w_beam * span_ft * (span_ft/2.0))
            
            if m_ot > 0:
                fos_ot = m_res / m_ot
            else:
                fos_ot = 999.0 # No overturning force
            
            # Reactions
            R_fulcrum = (w_cant_total * cant_ft * (span_ft + cant_ft/2.0) + w_back_total * span_ft * (span_ft/2.0)) / span_ft
            R_back = w_back_total * span_ft / 2.0 - w_cant_total * cant_ft * (cant_ft/2.0) / span_ft
            max_reaction = max(abs(R_fulcrum), abs(R_back))
            
        else:
            # Simple Span / Continuous Envelope: Add SW Moment
            # Note: For continuous spans, the envelope peak negative moment is safely approximated as wL^2 / 8
            if inputs.get('w_load') is not None: # Meaning we are using Load-based
                 w_beam = weight / 1000.0
                 m_sw = (w_beam * span_ft**2) / 8.0
                 current_m_req = m_req + m_sw
                 max_reaction = (w_load + w_beam) * span_ft / 2.0
        
        # --- AISC F2 Logic ---
        ry = props['ry']
        sx = props['Sx']
        zx = props['Zx']
        j = props['J']
        iy = props['Iy']
        cw = props.get('Cw', 0)
        
        # rts Calculation
        rts = props.get('rts')
        if not rts:
            tf = props.get('tf', 0)
            if cw > 0:
                rts = math.sqrt(math.sqrt(iy * cw) / sx)
            else:
                rts = ry 
        
        ho = props.get('ho')
        if not ho:
            tf = props.get('tf', 0)
            ho = d - tf
            
        c = 1.0
        
        # Calculate Lp (Eq F2-5)
        lp_in = 1.76 * ry * math.sqrt(E / fy)
        lp_ft = lp_in / 12.0
        
        # Calculate Lr (Eq F2-6)
        term1 = (j * c) / (sx * ho)
        term2 = (term1 ** 2) + 6.76 * ((0.7 * fy / E) ** 2)
        lr_in = 1.95 * rts * (E / (0.7 * fy)) * math.sqrt(term1 + math.sqrt(term2))
        lr_ft = lr_in / 12.0
        
        # Nominal Capacity Mn
        mp_nominal = fy * zx
        mr_nominal = 0.7 * fy * sx
        
        mn = 0.0
        mode = ""
        
        if current_lb_in <= lp_in:
            mn = mp_nominal
            mode = "Plastic (Z1)"
        elif current_lb_in <= lr_in:
            term = (current_lb_in - lp_in) / (lr_in - lp_in)
            mn = cb * (mp_nominal - (mp_nominal - mr_nominal) * term)
            mn = min(mn, mp_nominal)
            mode = "Inelastic LTB (Z2)"
        else:
            fcr_term1 = (cb * math.pi * math.pi * E) / ((current_lb_in / rts) ** 2)
            fcr_term2 = math.sqrt(1 + 0.078 * (j * c / (sx * ho)) * ((current_lb_in / rts) ** 2))
            fcr = fcr_term1 * fcr_term2
            mn = fcr * sx
            mn = min(mn, mp_nominal)
            mode = "Elastic LTB (Z3)"
            
        # Apply Safety Factors
        capacity = 0.0 # k-ft
        mp_avail = 0.0
        mr_avail = 0.0
        
        if method == 'LRFD':
            phi = 0.9
            capacity = (phi * mn) / 12.0
            mp_avail = (phi * mp_nominal) / 12.0
            mr_avail = (phi * mr_nominal) / 12.0
        elif method == 'ASD':
            omega = 1.67
            capacity = (mn / omega) / 12.0
            mp_avail = (mp_nominal / omega) / 12.0
            mr_avail = (mr_nominal / omega) / 12.0
        elif method == 'OSHA':
            omega_osha = 4.0
            capacity = (mn / omega_osha) / 12.0
            mp_avail = (mp_nominal / omega_osha) / 12.0
            mr_avail = (mr_nominal / omega_osha) / 12.0
            
        ratio = current_m_req / capacity if capacity > 0 else 999
        
        # --- Support Loads Calculations ---
        leg_load = 0.0
        brace_load = 0.0
        leg_ratio = 0.0
        brace_ratio = 0.0
        
        if support_type != 'NONE':
            w_total = w_load + (weight / 1000.0) # klf
            if support_type == 'HSS_BRACE':
                # Shear at the interior support of a continuous beam is higher than a simple span.
                # We use 0.625 to ensure the brace isn't undersized for the interior reaction.
                r_v = 0.625 * w_total * span_ft 

                theta_rad = math.radians(brace_theta)
                brace_load = r_v / math.sin(theta_rad) if math.sin(theta_rad) != 0 else r_v
                brace_ratio = brace_load / brace_capacity if brace_capacity > 0 else 999
                
            # Leg Load (Calculated for the interior column taking the brunt of the spans)
            leg_load = 1.25 * w_total * span_ft / 2.0 
            leg_ratio = leg_load / leg_capacity if leg_capacity > 0 else 999
        
        result_obj = {
            "name": name,
            "weight": weight,
            "depth": d,
            "capacity": capacity,
            "demand": current_m_req,
            "ratio": ratio,
            "Mp": mp_avail,
            "Mr": mr_avail,
            "Lp": lp_ft,
            "Lr": lr_ft,
            "Ix": props.get('Ix', 0),
            "mode": mode,
            "pass": capacity >= current_m_req,
            "fos_ot": fos_ot,
            "rxn_kips": max_reaction,
            "support_type": support_type,
            "leg_name": leg_name,
            "leg_load": leg_load,
            "leg_capacity": leg_capacity,
            "leg_ratio": leg_ratio,
            "brace_name": brace_name,
            "brace_load": brace_load,
            "brace_capacity": brace_capacity,
            "brace_ratio": brace_ratio
        }
        
        # Capture Desired Shape (ignore depth limit)
        if name == desired_shape:
            desired_result = result_obj

        # Filter for Candidates (apply depth limit, pass check, and optional deflection check)
        is_valid = True
        
        # 1. Nominal Depth Check (Desired Family)
        nominal_target = float(inputs.get('nominal_depth', 0))
        if nominal_target > 0:
            # Check if beam name matches family (e.g. W12...)
            # We already parsed 'weight' from 'W12x26', but we need the first part 'W12'
            # Let's re-parse or use regex. 
            # Name format is W[Depth]X[Weight]
            try:
                # Remove W, split by X
                # Remove Prefix (W, S, etc), split by X
                depth_str = name.upper().replace(shape_type, '').split('X')[0]
                nominal_actual = float(depth_str)
                # Check match (tolerance? No, nominal is exact integer usually, but float safe)
                if abs(nominal_actual - nominal_target) > 0.1:
                    is_valid = False
            except:
                is_valid = False
            
        # 2. Capacity Check (Ratio <= Max Ratio)
        # Note: 'ratio' calculated above is m_req / capacity
        if ratio > max_ratio:
            is_valid = False
            
        # Support Capacity Check
        if leg_ratio > max_ratio:
            is_valid = False
            result_obj['mode'] = "Leg Cap Exceeded"
        if brace_ratio > max_ratio:
            is_valid = False
            result_obj['mode'] = "Brace Cap Exceeded"
            
        # 3. Deflection Check (Optional)
        check_deflection = inputs.get('check_deflection', False)
        defl_val = 0.0
        defl_limit = 0.0
        defl_ratio = 0.0
        
        if check_deflection or True: # Always calc deflection for display
            ix_val = props.get('Ix', 0)
            if ix_val > 0:
                if is_cantilever:
                    # Delta Tip Calculation
                    # 1. Cantilever Bending (Load + SW)
                    # Delta_1 = (w_total * L_cant^4) / (8 * E * I)
                    w_cant_in = w_cant_total / 12.0 # k/in
                    L_cant_in = cant_ft * 12.0
                    
                    term_bending = (w_cant_in * (L_cant_in**4)) / (8 * E * ix_val)
                    
                    # 2. Rotation from Backspan
                    # Rotation due to Moment M_sup (Load + SW)
                    # M_sup = m_cant_total (k-ft) -> convert to k-in
                    M_sup_in = m_cant_total * 12.0
                    L_back_in = span_ft * 12.0
                    
                    theta_moment = (M_sup_in * L_back_in) / (3 * E * ix_val)
                    
                    # Rotation due to Backspan SW (Opposing)
                    # theta_sw = q * L^3 / 24EI
                    w_back_in = w_back_total / 12.0
                    theta_sw = (w_back_in * (L_back_in**3)) / (24 * E * ix_val)
                    
                    theta_net = theta_moment - theta_sw # Net rotation towards cantilever
                    
                    delta_rotation = theta_net * L_cant_in
                    
                    defl_val = term_bending + delta_rotation
                    
                    # Limit L/180 for cantilever usually, or user's L/240
                    # Let's use 2x limit (L/120) strictly or just same L/240? 
                    # Use standard L/240 logic or just report it.
                    defl_limit = L_cant_in / 180.0 # Common cantilever limit? Or user 240? 
                    # Let's stick to user prompt "L/240" logic implicitly or 
                    if inputs.get('check_deflection'):
                         defl_limit = L_cant_in / 240.0 # Strict
                    
                else: 
                     # Standard Simple Span
                     if inputs.get('w_load') is not None:
                        w_total_in = (float(inputs.get('w_load',0)) + (weight/1000.0)) / 12.0
                        L_in = span_ft * 12.0
                        
                        numerator = 5 * w_total_in * (L_in ** 4)
                        denominator = 384 * E * ix_val
                        defl_val = numerator / denominator
                        defl_limit = L_in / 240.0
            
                if defl_limit > 0:
                    defl_ratio = defl_val / defl_limit
                    
                if check_deflection and defl_val > defl_limit:
                    is_valid = False
                    result_obj['mode'] += " (Fail Defl)" # Append fail reason
        
        result_obj['deflection'] = defl_val
        result_obj['defl_limit'] = defl_limit
        result_obj['defl_ratio'] = defl_ratio
        
        if is_valid:
            valid_candidates.append(result_obj)
            
    valid_candidates.sort(key=lambda x: (x['weight'], x['depth']))
    
    top_results = valid_candidates[:20]
    print(f"DEBUG: Found {len(top_results)} valid candidates. Desired found: {desired_result is not None}")
    
    return {
        "candidates": top_results,
        "desired": desired_result
    }

