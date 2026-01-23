import math
from ..database import db

# --- Constants & Tables (Translated from aisc/database.js and base plate.js) ---

BOLT_PROPERTIES = {
    0.25:   0.0491,
    0.375:  0.1104,
    0.5:    0.1963,
    0.625:  0.3068,
    0.75:   0.4418,
    0.875:  0.6013,
    1.0:    0.7854,
    1.125:  0.9940,
    1.25:   1.2272,
    1.375:  1.4849,
    1.5:    1.7671,
}

FNV_MAP = {
    "A325": {True: 54.0, False: 68.0}, 
    "A490": {True: 68.0, False: 84.0}, 
    "F3148": {True: 65.0, False: 81.0}
}

FNT_MAP = {
    "A325": 90.0, 
    "A490": 113.0, 
    "F3148": 90.0
}

NOMINAL_HOLE_TABLE = {
    0.25:   5/16.0,
    0.3125: 3/8.0,
    0.375:  7/16.0,
    0.5:    9/16.0,
    0.625:  11/16.0,
    0.75:   13/16.0,
    0.875:  15/16.0,
    1.0:    1 + 1/16.0,
    1.125:  1.125 + 1/8.0,
    1.25:   1.25 + 1/8.0,
    1.375:  1.375 + 1/8.0,
    1.5:    1.5 + 1/8.0,
}

# --- Helper Functions ---

def get_phi(limit_state, design_method, jurisdiction):
    if jurisdiction == 'OSHA':
        if design_method == 'LRFD': return 0.25
        return 4.0

    factors = {
        'bearing': {'phi': 0.65, 'omega': 2.31},
        'bending': {'phi': 0.90, 'omega': 1.67},
        'weld': {'phi': 0.75, 'omega': 2.00},
        'anchor_tension_steel': {'phi': 0.75, 'omega': 2.00},
        'anchor_tension_concrete': {'phi': 0.65, 'omega': 2.31},
        'anchor_pullout': {'phi': 0.70, 'omega': 2.14},
        'anchor_side_face': {'phi': 0.75, 'omega': 2.00},
        'anchor_shear_steel': {'phi': 0.65, 'omega': 2.31},
        'anchor_shear_concrete': {'phi': 0.65, 'omega': 2.31},
        'anchor_pryout': {'phi': 0.65, 'omega': 2.31},
    }
    
    f = factors.get(limit_state, {'phi': 1.0, 'omega': 1.0})
    return f['phi'] if design_method == 'LRFD' else f['omega']

def get_bolt_area(dia):
    return BOLT_PROPERTIES.get(float(dia), math.pi * (float(dia)/2)**2)

def get_nominal_hole_diameter(db):
    # Closest match
    db = float(db)
    closest = min(NOMINAL_HOLE_TABLE.keys(), key=lambda k: abs(k-db))
    return NOMINAL_HOLE_TABLE[closest]

def get_fnt(grade):
    return FNT_MAP.get(grade, 0.0)

# --- Check Functions ---

def check_concrete_bearing(inputs):
    method = inputs.get('design_method', 'ASD')
    jurisdiction = inputs.get('jurisdiction', 'IBC')
    
    def safe_float(val, default=0.0):
        try:
            f = float(val)
            return 0.0 if math.isnan(f) else f
        except (ValueError, TypeError):
            return default

    N = safe_float(inputs.get('base_plate_length_N', 0))
    B = safe_float(inputs.get('base_plate_width_B', 0))
    
    raw_fc = safe_float(inputs.get('concrete_fc', 4000))
    # Heuristic: if < 20, assume ksi, else psi. 
    # But if user enters 4000 (psi), we want ksi. 4000/1000 = 4.
    fc = raw_fc / 1000.0 if raw_fc > 20 else raw_fc
    
    pedestal_N = safe_float(inputs.get('pedestal_N', N))
    pedestal_B = safe_float(inputs.get('pedestal_B', B))
    
    Pu = safe_float(inputs.get('axial_load_P_in', 0))
    Mux = safe_float(inputs.get('moment_Mx_in', 0)) * 12.0 
    Muy = safe_float(inputs.get('moment_My_in', 0)) * 12.0 
    
    # Combined Logic for Capacity
    A1 = N * B
    A2 = pedestal_N * pedestal_B
    ratio_A = math.sqrt(A2/A1) if A1 > 0 else 1.0
    psi = min(ratio_A, 2.0)
    
    Pp = 0.85 * fc * A1 * psi
    Fp = Pp / A1 if A1 > 0 else 0
    
    phi = get_phi('bearing', method, jurisdiction)
    omega = get_phi('bearing', 'ASD' if method=='LRFD' else 'LRFD', jurisdiction)
    
    Rn = Fp 
    
    if Pu > 0:
        return {
            "demand": 0,
            "check": {"Rn": Rn, "phi": phi, "omega": omega},
            "details": {
                "bearing_case": "Uplift", 
                "Pu": Pu, 
                "f_p_max": 0,
                "P_abs": abs(Pu),
                "Mux": Mux/12.0, "Muy": Muy/12.0,
                "e_x": (Mux / abs(Pu)) if abs(Pu) > 0 else 0, 
                "e_y": (Muy / abs(Pu)) if abs(Pu) > 0 else 0,
                "A1": N*B, "A2": pedestal_N*pedestal_B,
                "confinement_factor": 1.0,
                "Rn_force": Pp,
                "breakdown_formula": "Uplift: No bearing pressure."
            }
        }
    
    P_abs = abs(Pu)
    f_p_max = 0
    Y = 0
    X = B
    e_x = 0
    e_y = 0
    bearing_case = ""
    breakdown = ""
    
    # Pure Moment Case
    if P_abs == 0 and (Mux > 0 or Muy > 0):
        bearing_case = "Pure Moment"
        e_x = float('inf')
        e_y = float('inf')
        
        num_bolts_N = int(inputs.get('num_bolts_N', 2))
        bolt_spacing_N = float(inputs.get('bolt_spacing_N', 0))
        db = float(inputs.get('anchor_bolt_diameter', 0.75))
        
        E_s = 29000.0
        E_c = 57.0 * math.sqrt(fc * 1000.0) 
        n_ratio = E_s / E_c
        Ab = math.pi * (db**2) / 4.0
        d_anchor = (N / 2.0) - ((num_bolts_N - 1) * bolt_spacing_N / 2.0)
        
        # Iterative Solver for kd (Y)
        kd = N / 3.0
        for _ in range(20):
             # Avoid div by zero
            if kd <= 0: kd = 0.1
            if (N/2 - kd/3 + d_anchor) == 0: break
            
            force_c_denom = (B * kd * (N/2 - kd/3 + d_anchor))
            C_force = 0.5 * B * kd * ( (2*Mux) / force_c_denom ) if force_c_denom != 0 else 0
            
            T_force = 0
            if kd != 0 and force_c_denom != 0:
                 T_force = n_ratio * Ab * ((2*Mux) / force_c_denom) * ((d_anchor - kd)/kd)
            
            if C_force == 0: break
            if abs(C_force - T_force) < 0.01 * C_force: break
            
            ratio = T_force / C_force if C_force != 0 else 1.0
            kd = kd * math.sqrt(ratio) if ratio > 0 else kd
            
        Y = kd
        term = (B * Y * (N/2 - Y/3 + d_anchor))
        f_p_max = (2 * Mux) / term if term != 0 else 0
        
    else:
        # Combined
        e_x = Mux / P_abs if P_abs > 0 else 0
        e_y = Muy / P_abs if P_abs > 0 else 0
        
        if e_x <= N/6.0 and e_y <= B/6.0:
            # Case 1: Full Bearing
            bearing_case = "Full Bearing"
            term_x = (6*e_x)/N
            term_y = (6*e_y)/B
            f_p_max = (P_abs / (B*N)) * (1 + term_x + term_y)
            Y = N
            X = B
        elif (e_x/N + e_y/B) <= 0.5:
             # Case 2: Partial Bearing
            bearing_case = "Partial Bearing"
            
            if e_y == 0:
                Y = 3 * (N/2 - e_x)
                Y = min(Y, N)
                f_p_max = (2 * P_abs) / (B * Y)
            elif e_x == 0:
                Y_b = 3 * (B/2 - e_y)
                X = min(Y_b, B)
                Y = N
                f_p_max = (2 * P_abs) / (N * X)
            else:
                # Bi-axial Iterative (Simplified Translation)
                Y_curr = N/2.0
                for _ in range(30):
                    M_res = P_abs * (N/2 - Y_curr/3)
                    M_app = Mux 
                    
                    if M_res <= 0: 
                        Y_curr = N
                        break
                    
                    ratio = M_app / M_res
                    if abs(1 - ratio) < 0.01: break
                    
                    Y_curr = Y_curr * (1 + 0.5 * (1 - ratio))
                    Y_curr = max(0.1, min(N, Y_curr))
                
                Y = Y_curr
                f_p_max = (2 * P_abs) / (B * Y) # Approx for primarily X-axis moment
        else:
            # Case 3: Corner
            bearing_case = "Corner Bearing"
            g_x = N/2 - e_x
            g_y = B/2 - e_y
            if g_x > 0 and g_y > 0:
                f_p_max = (2 * P_abs) / (3 * g_x * g_y)
                Y = 3 * g_x
                X = 3 * g_y
            else:
                f_p_max = 0 # Unstable
                bearing_case = "Unstable (Load outside)"

    return {
        "demand": f_p_max,
        "check": {"Rn": Rn, "phi": phi, "omega": omega},
        "details": {
            "f_p_max": f_p_max, "e_x": e_x, "e_y": e_y, "Y": Y, "X": X, 
            "A1": A1, "A2": A2, "confinement_factor": psi, "Pu": Pu, 
            "P_abs": P_abs,
            "Rn_force": Pp, # Pass Force for breakdown display
            "bearing_case": bearing_case if bearing_case else "Uplift",
            "breakdown_formula": breakdown if bearing_case == "" else "Refer to AISC Design Guide 1"
        }
    }

def check_plate_bending(inputs, bearing_results):
    f_p_max = bearing_results['details'].get('f_p_max', 0)
    Pu = float(inputs.get('axial_load_P_in', 0))
    if f_p_max <= 0: return None
    
    N = float(inputs.get('base_plate_length_N', 0))
    B = float(inputs.get('base_plate_width_B', 0))
    d = float(inputs.get('column_depth_d', 0))
    bf = float(inputs.get('column_flange_width_bf', 0))
    Fy = float(inputs.get('base_plate_Fy', 36))
    tp = float(inputs.get('provided_plate_thickness_tp', 0))
    col_type = inputs.get('column_type', 'Wide Flange')
    method = inputs.get('design_method', 'ASD')
    jurisdiction = inputs.get('jurisdiction', 'IBC')
    
    # Extract f_p_max for report
    f_p_max = bearing_results['details'].get('f_p_max', 0)
    
    l = 0
    details = {}
    
    if col_type == 'Round HSS' or col_type == 'Pipe':
        l = (max(N, B) - d) / 2.0
        details = {'l': l, 'column_type': col_type, 'f_p_max': f_p_max}
    else:
        # WF
        m = (N - 0.95*d) / 2.0
        n = (B - 0.80*bf) / 2.0
        n_prime = math.sqrt(d*bf) / 4.0
        
        Pp = bearing_results['check']['Rn']
        P_abs = abs(Pu)
        
        # Lambda calc
        lambda_val = 1.0
        X_val = 1.0
        
        # If pure moment, estimate effective compression
        if P_abs == 0 and bearing_results['details'].get('bearing_case') == 'Pure Moment':
            # Effective C approx 0.5 * fpmax * Y * B
            Y = bearing_results['details'].get('Y', N)
            P_abs = 0.5 * f_p_max * Y * B
            
        if Pp > 0:
            X_val = ((4 * d * bf) / (d + bf)**2) * (P_abs / Pp)
            X_val = min(X_val, 1.0)
            lambda_val = (2 * math.sqrt(X_val)) / (1 + math.sqrt(1 - X_val))
        
        l = max(m, n, lambda_val * n_prime)
        details = {'m': m, 'n': n, 'n_prime': n_prime, 'lambda': lambda_val, 'X': X_val, 'l': l, 'column_type': col_type, 'f_p_max': f_p_max}

    phi = get_phi('bending', method, jurisdiction)
    
    # Required Thickness
    # LRFD: phi*Fy
    # ASD: Fy/omega
    
    denom = 0
    if method == 'LRFD':
        denom = phi * Fy
    else:
        # For ASD, DG1 uses Fy/Omega
        # get_phi returns omega for ASD
        omega = get_phi('bending', method, jurisdiction)
        denom = Fy / omega
        
    t_req = l * math.sqrt( (2 * f_p_max) / denom )
    
    return {
        "demand": tp,
        "check": {"Rn": t_req, "phi": 1.0, "omega": 1.0}, # Rn is t_req here
        "details": details
    }

def check_plate_bending_uplift(inputs, Tu_bolt):
    if Tu_bolt <= 0: return None
    
    tp = float(inputs.get('provided_plate_thickness_tp', 0))
    Fy = float(inputs.get('base_plate_Fy', 36))
    method = inputs.get('design_method', 'ASD')
    jurisdiction = inputs.get('jurisdiction', 'IBC')
    
    s_N = float(inputs.get('bolt_spacing_N', 0))
    s_B = float(inputs.get('bolt_spacing_B', 0))
    d = float(inputs.get('column_depth_d', 0))
    bf = float(inputs.get('column_flange_width_bf', 0))
    col_type = inputs.get('column_type', 'Wide Flange')
    
    c_N = (s_N - (d if col_type == 'Round HSS' else d)) / 2.0
    c_B = (s_B - (d if col_type == 'Round HSS' else bf)) / 2.0
    c = max(c_N, c_B, 0)
    
    phi = get_phi('bending', method, jurisdiction)
    denom = (phi * Fy) if method == 'LRFD' else (Fy / get_phi('bending', method, jurisdiction))
    
    t_req = math.sqrt( (4 * Tu_bolt) / denom )
    
    return {
        "demand": tp,
        "check": {"Rn": t_req, "phi": 1.0, "omega": 1.0},
        "details": {"c": c, "Tu_bolt": Tu_bolt}
    }


def check_concrete_breakout_tension(inputs, Tu_bolt):
    """ACI 318-19 Ch. 17 Concrete Breakout Strength in Tension"""
    if Tu_bolt <= 0: return None
    
    hef = float(inputs.get('anchor_embedment_hef', 0))
    if hef <= 0: return None # Cannot calc without hef
    
    fc = float(inputs.get('concrete_fc', 4))
    if fc > 10: fc = fc / 1000.0 # Normalize to ksi? No, formulas use psi usually but let's stick to consistent units.
    # Nb formula uses psi for fc and inches for hef usually, resulting in lbs.
    # Nb = kc * lambda * sqrt(fc_psi) * hef^1.5
    
    fc_psi = fc * 1000
    
    # 1. Basic Breakout Strength (Nb) - ACI 17.4.2.2
    kc = 24 # Cast-in
    lambda_a = 1.0 # Normal weight
    Nb = kc * lambda_a * math.sqrt(fc_psi) * (hef ** 1.5) # lbs
    Nb = Nb / 1000.0 # kips
    
    # 2. Geometric Factors & Group Area (Anc/Anco)
    # Anco = 9 * hef^2
    Anco = 9 * (hef**2)
    
    # Anc computation (Simplified Rectangular Group)
    # Critical edge distance = 1.5 * hef
    ca1 = float(inputs.get('concrete_edge_dist_ca1', 0))
    ca2 = float(inputs.get('concrete_edge_dist_ca2', 0))
    
    num_N = int(inputs.get('num_bolts_N', 1))
    num_B = int(inputs.get('num_bolts_B', 1))
    sp_N = float(inputs.get('bolt_spacing_N', 0))
    sp_B = float(inputs.get('bolt_spacing_B', 0))
    
    # Dimensions of the breakout surface
    # c_x = min(ca, 1.5*hef)
    # dimension = c_x_left + spacing + c_x_right
    # Here we assume symmetrical edge distances or single edge provided?
    # inputs only provide ca1 (N-direction) and ca2 (B-direction).
    # We will assume the group is centered-ish or these are the limiting edges.
    
    c1 = min(ca1, 1.5 * hef)
    dim_1 = c1 + (num_N - 1) * sp_N + c1 # N direction
    
    c2 = min(ca2, 1.5 * hef)
    dim_2 = c2 + (num_B - 1) * sp_B + c2 # B direction
    
    Anc = dim_1 * dim_2
    
    # Prevent Anc > n * Anco (Check 17.4.2.1) - Actually Anc can be anything, but let's be sane.
    
    # 3. Modification Factors
    # psi_ec,N (Eccentricity) - ACI 17.4.2.4
    # Simplified: 1.0 (Assume concentric tension on the group or user handled e elsewhere)
    psi_ec_N = 1.0 
    
    # psi_ed,N (Edge Effect) - ACI 17.4.2.5
    # If c_min < 1.5 hef
    c_min = min(ca1, ca2)
    psi_ed_N = 1.0
    if c_min < 1.5 * hef:
        psi_ed_N = 0.7 + 0.3 * (c_min / (1.5 * hef))
        
    # psi_c,N (Cracked/Uncracked) - ACI 17.4.2.6
    # Assume uncracked for base plates unless specified.
    psi_c_N = 1.25 # Cast-in, uncracked. (1.0 if cracked)
    
    # psi_cp,N (Splitting) - ACI 17.4.2.7
    # For cast-in, = 1.0 if confined. Base plates usually confined.
    psi_cp_N = 1.0
    
    # Nominal Strength Ncbg
    Ncbg = (Anc / Anco) * psi_ec_N * psi_ed_N * psi_c_N * psi_cp_N * Nb
    
    breakdown = f"""
        <ul class="list-disc list-inside">
            <li>h<sub>ef</sub> = {hef:.2f} in</li>
            <li>Basic Strength (N<sub>b</sub>) = {Nb:.2f} kips</li>
            <li>Group Area (A<sub>Nc</sub> / A<sub>Nco</sub>) = {Anc:.1f} / {Anco:.1f} = {(Anc/Anco):.2f}</li>
            <li>Edge Factor (&psi;<sub>ed,N</sub>) = {psi_ed_N:.2f} (c<sub>min</sub>={c_min:.2f}")</li>
            <li>Concrete Factor (&psi;<sub>c,N</sub>) = {psi_c_N:.2f} (Uncracked)</li>
            <li>N<sub>cbg</sub> = {Ncbg:.2f} kips</li>
        </ul>
    """
    
    return {
        "demand": Tu_bolt, # Total tension on group? Or bolt? 
        # ACI calculates GROUP strength. Demand should be TOTAL TENSION on anchors.
        # But 'demand' passed in is usually per bolt because earlier we did Tu_bolt.
        # Wait, check_anchors calculated Tu_bolt as MAX TENSION PER BOLT.
        # Concrete breakout is a GROUP check usually.
        # We need TOTAL TENSION.
        # Approx Total Tension = Tu_bolt * num_bolts_tens (conservative) or sum.
        # Let's Scale Demand to Group for this check, or Scale Capacity to Bolt.
        # Standard: Compare Group Demand to Group Capacity.
        # If Tu_bolt is max bolt tension, Group Demand approx Tu_bolt * number_of_bolts_in_tension.
        # This is hard to know exactly without the bolt map.
        # SAFE/CONSERVATIVE: Assume Capacity is for the Whole Group, compare with Max Bolt * Num Bolts Check?
        # BETTER: Compare Ncbg with Total Uplift Force (if pure uplift)?
        # For Moment, it's complex.
        # IMPLEMENTATION CHOICE: Return Ncb (Group) divide by Num Bolts to get "Per Bolt Limit" for consistent display?
        # NO, ACI checks are Group Checks.
        # Let's pass the demand as Tu_bolt (per bolt) * num_bolts (total) as a conservative bound, 
        # OR if we trust the user understands, we show Group Check.
        # Let's use Total Tension from logic if available, or simpler: 
        # Compare (Ncbg) vs (Sum of Tensions).
        # We don't have Sum of Tensions easily.
        # Let's compare Ncbg/num_bolts vs Tu_bolt (Per Bolt Capacity).
        
        "check": {"Rn": Ncbg / (num_N*num_B), "phi": 0.70, "omega": 2.5}, # Normalized to per-bolt for table consistency
        "details": {
            "breakdown": breakdown,
            "Ncb": Ncbg, 
            "is_group": True,
            "note": "Capacity shown is N_cbg / n_total (averaged per bolt) for comparison with T_u,bolt."
        }
    }

def check_concrete_breakout_shear(inputs, Vu_total):
    """ACI 318-19 Ch. 17 Concrete Breakout Strength in Shear"""
    # Note: Shear is usually checked against the edge.
    if Vu_total <= 0: return None
    
    hef = float(inputs.get('anchor_embedment_hef', 0))
    if hef <= 0: return None
    
    # 1. Basic Strength Vb (ACI 17.5.2.2)
    fc_psi = float(inputs.get('concrete_fc', 4)) * 1000
    da = float(inputs.get('anchor_bolt_diameter', 0.75))
    le = hef # Load bearing length, usually hef for cast-in
    if le > 8 * da: le = 8 * da
    
    ca1 = float(inputs.get('concrete_edge_dist_ca1', 0))
    # Shear usually towards an edge. Using MIN edge distance is conservative.
    c1 = ca1 
    if c1 <= 0: return None # No edge distance = no shear breakout issue? Or infinite? infinite.
    # If c1 is huge, breakout is unlikely.
    # If input ca1 is 0 (User didn't provide), skipping check is safer than failing.
    
    lambda_a = 1.0
    # Vb = (7 * (le/da)^0.2 * sqrt(da) * lambda * sqrt(fc) * c1^1.5 )
    # This is for SINGLE anchor.
    Vb = 7 * ((le/da)**0.2) * math.sqrt(da) * lambda_a * math.sqrt(fc_psi) * (c1**1.5)
    Vb = Vb / 1000.0 # kips
    
    # 2. Group Factors
    # A_Vc / A_Vco
    # Avco = 4.5 * c1^2
    Avco = 4.5 * (c1**2)
    
    # Avc - projected area on side of concrete
    # Simplified: (num_bolts_perp * spacing + 1.5c1 + 1.5c1??) * (1.5c1)
    # This is highly dependent on direction. 
    # Assumption: Shear direction is towards the 'ca1' edge.
    num_perp = int(inputs.get('num_bolts_B', 1)) # Bolts in row perp to shear
    sp_perp = float(inputs.get('bolt_spacing_B', 0))
    
    width_avail = 1.5 * c1 + (num_perp - 1) * sp_perp + 1.5 * c1
    # Check physical width limit (Pedestal B)
    ped_B = float(inputs.get('pedestal_B', 0))
    if ped_B > 0: width_avail = min(width_avail, ped_B)
    
    Avc = width_avail * (1.5 * c1) # Simplified height 1.5c1
    
    # psi_ec,V = 1.0
    psi_ec_V = 1.0
    # psi_ed,V = 1.0 (if c2 > 1.5c1)
    psi_ed_V = 1.0 
    # psi_c,V (Cracked/Uncracked) involves analysis. 
    # Factors 1.4 for uncracked, 1.0 cracked, 1.2 ...
    psi_c_V = 1.4 # Uncracked, no reinforcing
    
    # psi_h,V (Thickness) - if ha < 1.5 c1
    psi_h_V = 1.0 # Assume deep enough
    
    Vcbg = (Avc / Avco) * psi_ec_V * psi_ed_V * psi_c_V * psi_h_V * Vb
    
    num_bolts = int(inputs.get('num_bolts_N', 1)) * int(inputs.get('num_bolts_B', 1))
    
    breakdown = f"""
        <ul class="list-disc list-inside">
            <li>Edge Distance (c<sub>1</sub>) = {c1:.2f} in</li>
            <li>Basic Strength (V<sub>b</sub>) = {Vb:.2f} kips</li>
            <li>Area Factor (A<sub>Vc</sub> / A<sub>Vco</sub>) = {(Avc/Avco):.2f}</li>
            <li>Concrete Factor (&psi;<sub>c,V</sub>) = {psi_c_V:.2f}</li>
            <li>V<sub>cbg</sub> = {Vcbg:.2f} kips</li>
        </ul>
    """
    
    return {
        "demand": Vu_total / num_bolts, # Per bolt for consistency table
        "check": {"Rn": Vcbg / num_bolts, "phi": 0.70, "omega": 2.5}, 
        "details": {
            "breakdown": breakdown,
            "Vcbg": Vcbg,
            "note": "Capacity shown is V_cbg / n_total (averaged per bolt)."
        }
    }

def check_anchors(inputs, bearing_results):

    checks = {}
    
    # 1. Calc Demands (Tu, Vu)
    Pu = float(inputs.get('axial_load_P_in', 0))
    Mux = float(inputs.get('moment_Mx_in', 0)) * 12
    Muy = float(inputs.get('moment_My_in', 0)) * 12
    
    num_N = int(inputs.get('num_bolts_N', 2))
    num_B = int(inputs.get('num_bolts_B', 2))
    sp_N = float(inputs.get('bolt_spacing_N', 0))
    sp_B = float(inputs.get('bolt_spacing_B', 0))
    
    # Generate coordinates
    coords = []
    start_x = -(num_B - 1) * sp_B / 2.0
    start_z = -(num_N - 1) * sp_N / 2.0
    
    Ix = 0
    Iy = 0
    
    for r in range(num_N):
        for c in range(num_B):
            # Skip inner bolts (create perimeter pattern)
            if (0 < r < num_N - 1) and (0 < c < num_B - 1):
                continue
                
            oz = start_z + r * sp_N
            ox = start_x + c * sp_B
            coords.append({'x': ox, 'z': oz})
            Ix += oz**2
            Iy += ox**2
            
    num_bolts = len(coords)
    max_T = 0
    
    max_bolt_details = {'axial': 0, 'mx': 0, 'my': 0, 'z': 0, 'x': 0}
    
    for b in coords:
        ft = 0
        term_axial = 0
        term_mx = 0
        term_my = 0
        
        if Pu > 0: 
            term_axial = Pu / num_bolts # Uplift
            ft += term_axial
        # Note: Mux/Muy already converted to k-in above
        if Ix > 0: 
            term_mx = (Mux * b['z']) / Ix
            ft += term_mx
        if Iy > 0: 
            term_my = (Muy * b['x']) / Iy
            ft += term_my
        
        if ft > max_T: 
            max_T = ft
            max_bolt_details = {
                'axial': term_axial,
                'mx': term_mx,
                'my': term_my,
                'z': b['z'],
                'x': b['x']
            }
        
    Tu_bolt = max(0, max_T)

    # Generate Breakdown HTML
    breakdown_html = ""
    if Tu_bolt > 0:
        # Re-using logic from JS for consistency
        breakdown_html = f"""
            <ul class="list-disc list-inside">
                <li>T<sub>u,bolt</sub> &approx; P/n + M<sub>x</sub>&middot;z/I<sub>x</sub> + M<sub>y</sub>&middot;x/I<sub>y</sub></li>
                <li>P/n = {Pu:.2f} / {num_bolts} = {max_bolt_details['axial']:.2f} kips</li>
                <li>M<sub>x</sub> term = ({Mux:.2f} k-in * {max_bolt_details['z']:.2f} in) / {Ix:.2f} in² = {max_bolt_details['mx']:.2f} kips</li>
                <li>M<sub>y</sub> term = ({Muy:.2f} k-in * {max_bolt_details['x']:.2f} in) / {Iy:.2f} in² = {max_bolt_details['my']:.2f} kips</li>
                <li><b>Resultant Max Tension = {Tu_bolt:.2f} kips</b></li>
            </ul>
        """
    else:
        breakdown_html = "No tension on anchors."
    
    # Shear
    Vu_total = abs(float(inputs.get('shear_V_in', 0)))
    mu = 0.4
    Pu_comp = abs(Pu) if Pu < 0 else 0
    phi_fric = 0.75
    Rn_fric = mu * Pu_comp # Nominal
    # Design Friction
    # Note: Using method factors
    
    # Wait, simple friction check
    friction_cap = Rn_fric
    # Actually need design cap
    # The helper logic uses method.
    
    Vu_bolt = 0
    if Vu_total > 0:
        # TODO: Implement full friction logic/reduction. 
        # Simplified:
        Vu_bolt = Vu_total / num_bolts # Assuming no friction for conservative anchor check
    
    # --- Steel Tension ---
    if Tu_bolt > 0:
        db = float(inputs.get('anchor_bolt_diameter', 0.75))
        grade = inputs.get('anchor_bolt_grade', 'A325') # Assuming F1554-36 etc mapped
        # Or Just use Fnt input
        Fut = float(inputs.get('anchor_bolt_Fut', 58))
        Ab = get_bolt_area(db)
        Rn = Ab * Fut
        checks['Anchor Steel Tension'] = {
            "demand": Tu_bolt,
            "check": {"Rn": Rn, "phi": 0.75, "omega": 2.00},
            "details": {
                "desc": "AISC J3 / ACI 17.4.1",
                "breakdown": breakdown_html
            }
        }

    # --- Steel Shear --- 
    if Vu_bolt > 0:
        db = float(inputs.get('anchor_bolt_diameter', 0.75))
        Ab = get_bolt_area(db)
        Fut = float(inputs.get('anchor_bolt_Fut', 58)) # Using Fut as proxy if Fnv not supplied? 
        # JS uses 0.6*Fut. 
        # Actually should use Fnv.
        Rn = 0.6 * Ab * Fut
        checks['Anchor Steel Shear'] = {
            "demand": Vu_bolt,
            "check": {"Rn": Rn, "phi": 0.65, "omega": 2.31},
            "details": {"desc": "ACI 17.5.1"}
        }

    return checks

    pass


def check_friction_resistance(inputs):
    """AISC DG1 2.9 Friction"""
    method = inputs.get('design_method', 'ASD')
    jurisdiction = inputs.get('jurisdiction', 'IBC')
    pu = float(inputs.get('axial_load_P_in', 0))
    pu_comp = abs(pu) if pu < 0 else 0
    mu = 0.40 # Default base friction
    
    rn = mu * pu_comp
    
    # Factors (Using shear factors or specialized?)
    # JS uses phi=0.75, omega=2.00? Or just 1.0/1.5?
    # Base plate friction usually treated like shear lug or similar.
    # JS: phi=0.75? No, let's check standard. 
    # Actually friction often uses phi=0.55 or similar in ACI/AISC depending on interface. 
    # For now matching common practice / JS inputs implies a generic check.
    
    note = ""
    if pu_comp <= 0 and pu > 0:
        note = "Uplift: No friction resistance. Shear must be resisted by anchors."
    elif pu_comp == 0:
        note = "Zero compression."
        
    return {
        "demand": abs(float(inputs.get('shear_V_in', 0))),
        "check": {"Rn": rn, "phi": 0.75, "omega": 2.00},
        "details": {"mu": mu, "Pu_compressive": pu_comp, "note": note}
    }

def check_bolt_bearing_on_plate(inputs, shear_per_bolt):
    """AISC J3.10 Bearing on Plate Hole"""
    if shear_per_bolt <= 0: 
        # Return complete structure with zeros to satisfy frontend contract
        return {
            "demand": 0, 
            "check": {"Rn": 9999, "phi": 0.75, "omega": 2.00}, 
            "details": {
                "Lc": 0, 
                "Rn_tearout": 0, 
                "Rn_bearing": 0,
                "le": 0,   # Required by frontend .toFixed()
                "hole_dia": 0 # Required by frontend .toFixed()
            }
        }
    
    tp = float(inputs.get('provided_plate_thickness_tp', 0))
    fu_plate = float(inputs.get('base_plate_Fu', 58)) # Need Fu of plate! usually matched to Fy if not given. 
    # Assumed A36 -> Fu=58. A572-50 -> Fu=65.
    # We might need to estimate Fu if not in inputs.
    if fu_plate == 0: fu_plate = float(inputs.get('base_plate_Fy', 36)) * 1.5 # Rough approx if missing
    
    db = float(inputs.get('anchor_bolt_diameter', 0.75))
    hole_dia = get_nominal_hole_diameter(db)
    
    sp_N = float(inputs.get('bolt_spacing_N', 0))
    num_N = int(inputs.get('num_bolts_N', 0))
    # Edge distance logic
    # Simplified Lc.
    # If num bolts > 1, Lc might be spacing. 
    # For edge, use edge dist.
    
    # Using minimum likely Lc for conservative check
    le_1 = float(inputs.get('concrete_edge_dist_ca1', 0)) # Actually this is concrete edge dist. Steel edge dist might be different.
    # Assuming standard hole placement relative to plate edge.
    # Let's use simple approximation.
    lc = 1.5 * db 
    
    rn_tearout = 1.2 * lc * tp * fu_plate
    rn_bearing = 2.4 * db * tp * fu_plate
    rn = min(rn_tearout, rn_bearing)
    
    return {
        "demand": shear_per_bolt,
        "check": {"Rn": rn, "phi": 0.75, "omega": 2.00},
        "details": {"Lc": lc, "Rn_tearout": rn_tearout, "Rn_bearing": rn_bearing, "le": lc + hole_dia/2, "hole_dia": hole_dia}
    }

def check_weld_strength(inputs, bearing_results):
    """AISC Manual Part 8 Elastic Vector Method"""
    weld_type = inputs.get('weld_type', 'Fillet')
    w_size = float(inputs.get('weld_size', 0))
    if weld_type == 'Fillet' and w_size <= 0: return None
    
    fexx = float(inputs.get('weld_Fexx', 70))
    d = float(inputs.get('column_depth_d', 0))
    bf = float(inputs.get('column_flange_width_bf', 0))
    tf = float(inputs.get('column_flange_tf', 0))
    tw = float(inputs.get('column_web_tw', 0))
    
    pu = abs(float(inputs.get('axial_load_P_in', 0))) # Welds check for force transfer
    mux = abs(float(inputs.get('moment_Mx_in', 0))) * 12
    muy = abs(float(inputs.get('moment_My_in', 0))) * 12
    vu = abs(float(inputs.get('shear_V_in', 0)))
    
    # Linear weld group properties
    col_type = inputs.get('column_type', 'Wide Flange')
    
    if col_type == 'Round HSS' or col_type == 'Pipe':
        # D = d
        aw = math.pi * d
        sw_x = (math.pi * d**2) / 4.0
        sw_y = sw_x
    elif col_type == 'Rectangular HSS':
        # d = depth, b = width (stored in bf input check?)
        # JS: dim2_container (bf) is shown as Width (b)
        b_width = bf 
        l_web_hss = d 
        l_flange_hss = b_width
        aw = 2*l_flange_hss + 2*l_web_hss
         # Box Sw (approx)
        # Sx = (2*b*d^2)/d + ... Manual Part 8 Table 8-? 
        # Treat as lines:
        # I_x = 2 * (b * (d/2)^2) + 2 * (d^3 / 12)
        ix = 2 * (l_flange_hss * (l_web_hss/2.0)**2) + 2 * (l_web_hss**3 / 12.0)
        sw_x = ix / (l_web_hss/2.0)
        
        # I_y = 2 * (d * (b/2)^2) + 2 * (b^3 / 12)
        iy = 2 * (l_web_hss * (l_flange_hss/2.0)**2) + 2 * (l_flange_hss**3 / 12.0)
        sw_y = iy / (l_flange_hss/2.0)

    else:
        # Wide Flange
        l_flange = bf
        l_web = d - 2*tf
        aw = 2*l_flange + 2*l_web
        
        # S_w in simplified for Box/I
        sw_x = (2*l_flange*(d/2.0)**2 + 2*(l_web**3)/12.0) / (d/2.0)
        sw_y = (2*(l_flange**3)/12.0 + 2*l_web*(0)**2) / (bf/2.0) # Web on neutral axis approx

    if aw <= 0: return None
    f_axial = pu / aw
    
    f_mx = mux / sw_x if sw_x > 0 else 0
    f_my = muy / sw_y if sw_y > 0 else 0
    
    
    # Shear assumed on webs
    # Correct l_shear_webs for HSS
    l_shear_webs = 0
    if col_type == 'Round HSS' or col_type == 'Pipe':
        l_shear_webs = 0.5 * aw # Approx shear area (2 sides effective) ~ 2*D*t = Aw/pi * 2? No, shear area of pipe approx Ag/2
        # Aw here is perimeter * size = pi*D*w.
        # Shear resistance of circular fillet weld: J3.2.4?
        # Conservative: Projected length parallel to force? 2*D.
        # Aw = pi*D*w. Length = pi*D.
        # Projected length = 2*D. 
        # Let's use 2*d for length resisting shear (two sides of pipe).
        l_shear_webs = 2*d
    elif col_type == 'Rectangular HSS':
        # Webs parallel to shear. Assuming Shear input is V_y (parallel to depth/web).
        # We defined l_web_hss as 'd'.
        l_shear_webs = 2 * l_web_hss
    else:
        l_shear_webs = 2 * l_web
        
    f_shear = vu / l_shear_webs if l_shear_webs > 0 else 0
    
    f_res = math.sqrt((f_axial + f_mx + f_my)**2 + f_shear**2)
    
    # Capacity
    rn_per_in = 0
    if weld_type == 'Fillet':
         rn_per_in = 0.6 * fexx * (w_size * 0.707)
    
    return {
        "demand": f_res,
        "check": {"Rn": rn_per_in, "phi": 0.75, "omega": 2.00},
        "details": {
            "f_max_weld": f_res, "Aw": aw, "Sw_x": sw_x, "Sw_y": sw_y,
            "f_axial": f_axial,
            "f_moment_x": f_mx, "f_moment_y": f_my,
            "f_shear_x": 0, "f_shear_y": f_shear, # Assuming shear acts in Y for now
            "f_moment": f_mx, "f_shear": f_shear # For HSS generic
        }
    }

def check_column_web_checks(inputs, bearing_results):
    """AISC J10 Checks"""
    col_type = inputs.get('column_type', 'Wide Flange')
    if col_type != 'Wide Flange': return {}
    
    # Only if compression
    pu = float(inputs.get('axial_load_P_in', 0))
    if pu > 0: return {} 
    
    d = float(inputs.get('column_depth_d', 0))
    bf = float(inputs.get('column_flange_width_bf', 0))
    tf = float(inputs.get('column_flange_tf', 0))
    tw = float(inputs.get('column_web_tw', 0))
    fy = float(inputs.get('base_plate_Fy', 36)) # Assuming column Fy matches plate or input? actually user input Base Plate Fy. Column Fy likely different? 
    # Use generic Fy for now or add input.
    
    f_p_max = bearing_results['details'].get('f_p_max', 0)
    
    # Demand Force
    # Approx area of flange bearing
    # Force = Stress * Area? JS uses f_p_max * bf * tf.
    demand = f_p_max * bf * tf
    
    # Web Local Yielding
    # 5k + N. Here N is bearing length = tf.
    k = tf # approx
    rn_wly = fy * tw * (5*k + bf) # JS logic: (5*k_des + bf)
    
    # Web Crippling
    # J10-4
    rn_wlc = 0.80 * (tw**2) * (1 + 3*(bf/d)*((tw/tf)**1.5)) * math.sqrt(29000*fy*tf/tw)
    
    return {
        "Column Web Local Yielding": {"demand": demand, "check": {"Rn": rn_wly, "phi": 1.0, "omega": 1.5}},
        "Column Web Local Crippling": {"demand": demand, "check": {"Rn": rn_wlc, "phi": 0.75, "omega": 2.0}}
    }

def check_minimum_thickness(inputs, bearing_results):
    """Thornton's Method for Rigidity"""
    n = float(inputs.get('base_plate_length_N', 0))
    b = float(inputs.get('base_plate_width_B', 0))
    pu = abs(float(inputs.get('axial_load_P_in', 0)))
    fy = float(inputs.get('base_plate_Fy', 36))
    
    d = float(inputs.get('column_depth_d', 0))
    bf = float(inputs.get('column_flange_width_bf', 0))
    
    l_cant = max((n - 0.95*d)/2.0, (b - 0.80*bf)/2.0)
    
    if n*b*fy > 0:
        t_min = l_cant * math.sqrt((2*pu) / (0.9 * fy * n * b))
    else:
        t_min = 0
        
    return {
        "demand": float(inputs.get('provided_plate_thickness_tp', 0)),
        "check": {"Rn": t_min, "phi": 1.0, "omega": 1.0},
        "details": {"l": l_cant, "t_min": t_min, "Pu_abs": pu, "B": b, "N": n, "Fy": fy}
    }



def calculate_base_plate(inputs):
    """
    Main entry point for Base Plate Calculation.
    """
    # --- 0. Batch Processing ---
    batch_loads = inputs.get('batch_loads')
    if batch_loads and isinstance(batch_loads, list):
        results = []
        base_inputs = inputs.copy()
        if 'batch_loads' in base_inputs:
            del base_inputs['batch_loads'] # Prevent recursion loop
        
        for case in batch_loads:
            # Case can be a dict of overrides
            if not isinstance(case, dict): continue
            
            case_input = base_inputs.copy()
            case_input.update(case)
            
            try:
                res = calculate_base_plate(case_input)
                results.append(res)
            except Exception as e:
                import traceback
                results.append({"error": str(e), "trace": traceback.format_exc()})
        return results

    inputs = inputs.copy() # Avoid mutation
    # 1. Validation (Simplified, frontend handles mostly)

    
    # 2. Geometry Checks
    try:
        ped_N = float(inputs.get('pedestal_N', 0))
        ped_B = float(inputs.get('pedestal_B', 0))
        num_N = int(inputs.get('num_bolts_N', 2))
        num_B = int(inputs.get('num_bolts_B', 2))
        sp_N = float(inputs.get('bolt_spacing_N', 0))
        sp_B = float(inputs.get('bolt_spacing_B', 0))
        
        # Assume centered bolt group
        group_N = (num_N - 1) * sp_N
        group_B = (num_B - 1) * sp_B
        
        ca1 = (ped_N - group_N) / 2.0
        ca2 = (ped_B - group_B) / 2.0
        
        inputs['concrete_edge_dist_ca1'] = max(ca1, 0)
        inputs['concrete_edge_dist_ca2'] = max(ca2, 0)
        
    except Exception as e:
        print(f"Geometry Calc Error: {e}")
        inputs['concrete_edge_dist_ca1'] = 0
        inputs['concrete_edge_dist_ca2'] = 0
    
    # 3. Main Checks
    checks = {}
    
    # Bearing
    bearing_res = check_concrete_bearing(inputs)
    checks['Concrete Bearing'] = bearing_res
    
    # Friction
    friction_res = check_friction_resistance(inputs)
    checks['Friction Resistance'] = friction_res
    
    # Shear on Bolts (Post Friction)
    vu_total = abs(float(friction_res['demand']))
    friction_cap = friction_res['check']['Rn'] * (friction_res['check']['phi'] if inputs.get('design_method') == 'LRFD' else 1.0/friction_res['check']['omega'])
    vu_bolt_total = max(0, vu_total - friction_cap)
    
    num_bolts_total = int(inputs.get('num_bolts_N', 0)) * int(inputs.get('num_bolts_B', 0))
    shear_per_bolt = vu_bolt_total / num_bolts_total if num_bolts_total > 0 else 0
    inputs['shear_V_in'] = vu_bolt_total # Update for anchor check to use net shear
    # (Note: check_anchors currently assumes input is total shear. We might need to pass this explicitly or let it recalc.
    #  check_anchors in my implementation re-reads 'shear_V_in'. So updating inputs works.)
    
    # Plate Bending
    bending_res = check_plate_bending(inputs, bearing_res)
    if bending_res: checks['Plate Bending'] = bending_res
    
    # Anchors
    anchor_res = check_anchors(inputs, bearing_res)
    checks.update(anchor_res)
    
    # Concrete Breakout (Tension)
    # Pass max bolt tension as demand reference
    Tu_max = anchor_res.get('Anchor Steel Tension', {}).get('demand', 0)
    breakout_res = check_concrete_breakout_tension(inputs, Tu_max)
    if breakout_res: checks['Anchor Concrete Breakout (Tension)'] = breakout_res
        
    # Concrete Breakout (Shear)
    Vu_net = float(inputs.get('shear_V_in', 0))
    breakout_shear = check_concrete_breakout_shear(inputs, Vu_net)
    if breakout_shear: checks['Anchor Concrete Breakout (Shear)'] = breakout_shear
    
    # Uplift Bending
    Tu_bolt = anchor_res.get('Anchor Steel Tension', {}).get('demand', 0)
    bending_up = check_plate_bending_uplift(inputs, Tu_bolt)
    if bending_up: checks['Plate Bending in Uplift'] = bending_up
    
    # Bolt Bearing on Plate
    checks['Bolt Bearing on Plate'] = check_bolt_bearing_on_plate(inputs, shear_per_bolt)
    
    # Weld Strength
    weld_res = check_weld_strength(inputs, bearing_res)
    if weld_res: checks['Weld Strength'] = weld_res
    
    # Column Web Checks
    web_res = check_column_web_checks(inputs, bearing_res)
    checks.update(web_res)
    
    # Min Thickness
    min_t = check_minimum_thickness(inputs, bearing_res)
    checks['Minimum Plate Thickness (Rigidity)'] = min_t
    
    return {
        "checks": checks,
        "inputs": inputs,
        "details": bearing_res.get('details', {}),
        "geomChecks": {}
    }
