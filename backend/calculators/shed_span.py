import math
import numpy as np
from ..database import db

def build_and_solve_beam(L, a_left, a_right, w_klf, E_ksf, I_ft4):
    """
    Solves for Max Moment, Shear, and Deflection of a beam with pinned supports at ends
    and optional intermediate rigid supports (knee braces).
    Outputs absolute maximums.
    """
    # If no braces or braces are tiny
    if (a_left <= 0.1 and a_right <= 0.1) or L <= 0.1:
        M = max(0, w_klf * L**2 / 8.0)
        V = max(0, w_klf * L / 2.0)
        D = max(0, 5 * w_klf * L**4 / (384 * E_ksf * I_ft4))
        return M, V, D

    # Define span segments
    supports = [0]
    if a_left > 0.1: supports.append(a_left)
    if a_right > 0.1: supports.append(L - a_right)
    supports.append(L)
    
    # Sort and remove duplicates or very close supports
    supports = sorted([s for s in supports if 0 <= s <= L])
    filtered_supports = [supports[0]]
    for s in supports[1:]:
        if s - filtered_supports[-1] > 0.1:
            filtered_supports.append(s)
            
    supports = filtered_supports
    num_spans = len(supports) - 1
    
    if num_spans == 1:
        # Simple beam due to overlapping/missing braces
        length = supports[1] - supports[0]
        M = max(0, w_klf * length**2 / 8.0)
        V = max(0, w_klf * length / 2.0)
        D = max(0, 5 * w_klf * length**4 / (384 * E_ksf * I_ft4))
        return M, V, D

    nodes = len(supports)
    K = np.zeros((nodes, nodes))
    F = np.zeros(nodes)
    
    for i in range(num_spans):
        Li = supports[i+1] - supports[i]
        
        k11 = 4 * E_ksf * I_ft4 / Li
        k12 = 2 * E_ksf * I_ft4 / Li
        k22 = 4 * E_ksf * I_ft4 / Li
        
        K[i, i] += k11
        K[i, i+1] += k12
        K[i+1, i] += k12
        K[i+1, i+1] += k22
        
        fem1 = -w_klf * Li**2 / 12.0
        fem2 = w_klf * Li**2 / 12.0
        
        F[i] -= fem1
        F[i+1] -= fem2
        
    try:
        theta = np.linalg.solve(K, F)
    except np.linalg.LinAlgError:
        # Fallback to simple span if matrix is singular (shouldn't happen)
        return (w_klf * L**2 / 8.0), (w_klf * L / 2.0), (5 * w_klf * L**4 / (384 * E_ksf * I_ft4))

    max_M, max_V, max_D = 0.0, 0.0, 0.0
    
    for i in range(num_spans):
        Li = supports[i+1] - supports[i]
        t1, t2 = theta[i], theta[i+1]
        
        # Test points within span
        x = np.linspace(0, Li, 50)
        xi = x / Li
        
        # Shape functions
        N2 = Li * (xi - 2*xi**2 + xi**3)
        N4 = Li * (-xi**2 + xi**3)
        v_homog = N2 * t1 + N4 * t2
        v_part = -(w_klf * (x**2) * ((Li - x)**2)) / (24 * E_ksf * I_ft4)
        v = v_homog + v_part
        max_D = max(max_D, np.max(np.abs(v)))
        
        # Moment
        B2 = (1/Li) * (-4 + 6*xi)
        B4 = (1/Li) * (-2 + 6*xi)
        M_homog = E_ksf * I_ft4 * (B2 * t1 + B4 * t2)
        M_part = w_klf * Li**2 / 12.0 - w_klf * Li * x / 2.0 + w_klf * x**2 / 2.0
        M = M_homog + M_part
        max_M = max(max_M, np.max(np.abs(M)))
        
        # Shear
        V_homog = E_ksf * I_ft4 * (6 * t1 / Li**2 + 6 * t2 / Li**2)
        V_part = w_klf * Li / 2.0 - w_klf * x
        V = V_homog + V_part
        max_V = max(max_V, np.max(np.abs(V)))

    return max_M, max_V, max_D


def calculate_max_span(inputs):
    """
    Calculates the maximum span for a shed section.
    """
    shape_name = inputs.get('section', 'W8X15').upper()
    method = inputs.get('design_method', 'ASD').upper()
    w_plf = float(inputs.get('load_plf', 300))
    fy = float(inputs.get('fy', 50))
    limit_defl = float(inputs.get('defl_limit', 240)) # L/240
    has_knee_brace = inputs.get('has_knee_brace', False)
    
    # Brace Geometry
    brace_height = float(inputs.get('brace_height', 8.0))
    beam_height = float(inputs.get('beam_height', 16.0))
    brace_angle = float(inputs.get('brace_angle', 45.0))
    
    # Calculate horizontal brace distance 'a'
    if has_knee_brace:
        # Distance = (beam_H - brace_H) / tan(angle)
        # using angle from column
        rad = math.radians(brace_angle)
        # if 45 deg, tan(45) = 1.
        a = (beam_height - brace_height) * math.tan(rad)
        # Ensure a is positive
        a = max(0.0, a)
    else:
        a = 0.0

    w_klf = w_plf / 1000.0
    
    # Database shape props
    shapes = db.get_shapes_by_type('W') # default search
    if 'HSS' in shape_name: shapes = db.get_shapes_by_type('HSS')
    elif 'C' in shape_name: shapes = db.get_shapes_by_type('C')
    # Fallback to get any matching shape if exact not in subset
    props = shapes.get(shape_name)
    if not props:
        # search all
        all_s = db.get_all_shapes()
        props = all_s.get(shape_name)
        if not props:
            return {"error": f"Section {shape_name} not found."}

    # Capacity Calculation (Simplified AISC Chapter F for W/HSS)
    zx = props.get('Zx', 0) or props.get('Z', 0)
    sx = props.get('Sx', 0) or props.get('S', 0)
    ix = props.get('Ix', 0) or props.get('I', 0)
    A = props.get('A', 0)
    tw = props.get('tw', 0) or props.get('tdes', 0)
    d = props.get('d', 0) or props.get('Ht', 0) or props.get('B', 0)
    
    if not (zx and sx and ix):
         return {"error": "Missing section properties (Zx, Sx, Ix)."}

    # Moment Capacity (Assuming fully braced by deck/parapet continuously)
    # Lb = 0 for shedding header beam.
    Mp = fy * zx / 12.0 # k-ft
    Mn = Mp 
    
    # Shear Capacity
    # Cv1 = 1.0 generally
    Aw = d * tw
    Vn = 0.6 * fy * Aw

    # Allowable/Design Capacities
    if method == 'LRFD':
        phi_b = 0.9
        phi_v = 1.0
        M_cap = phi_b * Mn
        V_cap = phi_v * Vn
    else: # ASD
        omega_b = 1.67
        omega_v = 1.5
        M_cap = Mn / omega_b
        V_cap = Vn / omega_v

    E = 29000.0 # ksi
    E_ksf = E * 144.0
    I_ft4 = ix / (12.0**4)

    # Iterative Solver
    max_L = 0.0
    critical_mode = "None"
    
    # Binary search for max L
    L_low = 1.0
    L_high = 60.0
    
    # We will test L. If it passes, L_low = L. Else, L_high = L
    best_res = None

    for _ in range(50):
        L_test = (L_low + L_high) / 2.0
        
        # If brace horizontal span 'a' is too large, it might overlap.
        # We apply braces at 'a' from left and 'a' from right.
        eff_a = a
        if eff_a > L_test/2.0:
            eff_a = L_test/2.0 # They meet in the middle
            
        M_req, V_req, D_req = build_and_solve_beam(L_test, eff_a, eff_a, w_klf, E_ksf, I_ft4)
        
        # Check limits
        defl_limit = L_test / limit_defl
        
        ok_M = M_req <= M_cap
        ok_V = V_req <= V_cap
        ok_D = D_req <= defl_limit
        
        if ok_M and ok_V and ok_D:
            L_low = L_test
            best_res = {
                "L": L_test,
                "M_req": M_req, "M_cap": M_cap, "M_ratio": M_req/(M_cap or 1),
                "V_req": V_req, "V_cap": V_cap, "V_ratio": V_req/(V_cap or 1),
                "D_req": D_req, "D_limit": defl_limit, "D_ratio": D_req/(defl_limit or 1),
                "a": eff_a,
                "w_klf": w_klf
            }
        else:
            L_high = L_test
            # Determine which failed
            if not ok_M: critical_mode = "Moment"
            elif not ok_V: critical_mode = "Shear"
            elif not ok_D: critical_mode = "Deflection"

    if best_res is None:
        return {"error": "Failed to find any passing span. Loads might exceed capacity even at 1ft span."}

    best_res["critical_mode"] = critical_mode
    
    # Add geometry details for frontend plotting
    best_res["geometry"] = {
        "brace_height": brace_height,
        "beam_height": beam_height,
        "brace_a": best_res["a"]
    }

    return best_res

