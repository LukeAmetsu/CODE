import math
from ..database import db

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

    
    # 1. Gather Inputs
    method = inputs.get('design_method', 'ASD')
    fy = float(inputs.get('fy', 50))
    E = 29000.0
    lb_ft = float(inputs.get('lb_ft', 0))
    lb_in = lb_ft * 12.0
    cb = float(inputs.get('cb', 1.0))
    
    # Determine Required Moment
    m_req = float(inputs.get('mu_req', 0))
    if m_req == 0:
        span = float(inputs.get('span_ft', 0))
        w = float(inputs.get('w_load', 0))
        m_req = (w * span * span) / 8.0
        
    max_depth = float(inputs.get('max_depth', 9999))
    
    # 2. Fetch Database
    shapes = db.get_shapes_by_type('W')
    
    valid_candidates = []
    desired_result = None
    desired_shape = inputs.get('desired_shape', '').upper()
    
    # 3. Iterate
    print(f"DEBUG: Processing {len(shapes)} shapes from DB.")
    
    for name, props in shapes.items():
        # Metric check filter (some DBs have metric)
        if 'W' not in name: 
            continue 
        
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
        
        if lb_in <= lp_in:
            mn = mp_nominal
            mode = "Plastic (Z1)"
        elif lb_in <= lr_in:
            term = (lb_in - lp_in) / (lr_in - lp_in)
            mn = cb * (mp_nominal - (mp_nominal - mr_nominal) * term)
            mn = min(mn, mp_nominal)
            mode = "Inelastic LTB (Z2)"
        else:
            fcr_term1 = (cb * math.pi * math.pi * E) / ((lb_in / rts) ** 2)
            fcr_term2 = math.sqrt(1 + 0.078 * (j * c / (sx * ho)) * ((lb_in / rts) ** 2))
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
            
        ratio = m_req / capacity if capacity > 0 else 999
        
        result_obj = {
            "name": name,
            "weight": weight,
            "depth": d,
            "capacity": capacity,
            "ratio": ratio,
            "Mp": mp_avail,
            "Mr": mr_avail,
            "Lp": lp_ft,
            "Lr": lr_ft,
            "Ix": props.get('Ix', 0),
            "mode": mode,
            "pass": capacity >= m_req
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
                depth_str = name.upper().replace('W', '').split('X')[0]
                nominal_actual = float(depth_str)
                # Check match (tolerance? No, nominal is exact integer usually, but float safe)
                if abs(nominal_actual - nominal_target) > 0.1:
                    is_valid = False
            except:
                is_valid = False
            
        # 2. Capacity Check
        if capacity < m_req:
            is_valid = False
            
        # 3. Deflection Check (Optional)
        check_deflection = inputs.get('check_deflection', False)
        defl_val = 0.0
        defl_limit = 0.0
        defl_ratio = 0.0
        
        if check_deflection:
            # Need w_load and span. 
            # If M_req was entered directly, we might not have reliable w/span unless user entered them.
            # We will use the ones from inputs if available.
            w = float(inputs.get('w_load', 0))
            span = float(inputs.get('span_ft', 0))
            
            if w > 0 and span > 0:
                # Delta = 5 * w * L^4 / (384 * E * I)
                # w in k/ft -> convert to k/in: w / 12
                # L in ft -> convert to in: L * 12
                w_in = w / 12.0
                L_in = span * 12.0
                ix_val = props.get('Ix', 0)
                
                if ix_val > 0:
                    numerator = 5 * w_in * (L_in ** 4)
                    denominator = 384 * E * ix_val
                    defl_val = numerator / denominator
                    
                    defl_limit = L_in / 240.0
                    if defl_limit > 0:
                        defl_ratio = defl_val / defl_limit
                        
                    if defl_val > defl_limit:
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
