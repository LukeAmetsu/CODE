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
    """
    
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
    
    # 3. Iterate
    for name, props in shapes.items():
        # Metric check filter (some DBs have metric)
        if 'W' not in name: continue 
        
        # Parse Weight from name W12x26 -> 26
        try:
            parts = name.split('X')
            weight = float(parts[1])
        except:
            continue
            
        d = props.get('d', 0)
        
        if d > max_depth:
            continue
            
        # Check required props
        if not all(k in props for k in ['Zx', 'Sx', 'ry', 'J']):
            continue
        
        # --- AISC F2 Logic ---
        ry = props['ry']
        sx = props['Sx']
        zx = props['Zx']
        j = props['J']
        iy = props['Iy']
        cw = props.get('Cw', 0) # Some might be missing
        
        # rts Calculation
        rts = props.get('rts')
        if not rts:
            tf = props.get('tf', 0)
            ho_calc = d - tf
            # Safe fallback if Cw present
            if cw > 0:
                rts = math.sqrt(math.sqrt(iy * cw) / sx)
            else:
                # Approximation if Cw missing (shouldn't happen for W shapes)
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
            
        if capacity >= m_req:
            ratio = m_req / capacity
            valid_candidates.append({
                "name": name,
                "weight": weight,
                "depth": d,
                "capacity": capacity,
                "ratio": ratio,
                "lp": lp_ft,
                "lr": lr_ft,
                "mp": mp_avail,
                "mr": mr_avail,
                "mode": mode
            })
            
    # Sort: Weight then Depth
    valid_candidates.sort(key=lambda x: (x['weight'], x['depth']))
    
    return valid_candidates[:20] # Return top 20
