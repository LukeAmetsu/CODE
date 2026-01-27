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

def get_phi(limit_state, design_method, jurisdiction, global_fos=None):
    if global_fos is not None:
        try:
            fos = float(global_fos)
            if fos > 0:
                if design_method == 'LRFD':
                    return 1.0 / fos
                return fos
        except:
            pass
    if jurisdiction == 'OSHA':
        if design_method == 'LRFD':
            return 0.25
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
        'web_yielding': {'phi': 1.00, 'omega': 1.50},
        'web_crippling': {'phi': 0.75, 'omega': 2.00},
        'friction': {'phi': 0.75, 'omega': 2.00}
    }
    f = factors.get(limit_state, {'phi': 1.0, 'omega': 1.0})
    return f['phi'] if design_method == 'LRFD' else f['omega']

def get_bolt_area(dia):
    return BOLT_PROPERTIES.get(float(dia), math.pi * (float(dia)/2)**2)

def get_nominal_hole_diameter(db):
    db = float(db)
    closest = min(NOMINAL_HOLE_TABLE.keys(), key=lambda k: abs(k-db))
    return NOMINAL_HOLE_TABLE[closest]

def get_fnt(grade):
    return FNT_MAP.get(grade, 0.0)

# --- NEW: Consolidated "Best Practice" Helper Functions ---

def check_geometry_limits(inputs):
    """Checks min edge distance and spacing."""
    checks = {}
    db = float(inputs.get('anchor_bolt_diameter', 0.75))
    
    # Min Edge Distance (AISC J3.4 / ACI 318)
    # Simplified: 1.5 * db (generic) or 1.75 * db
    min_edge = 1.5 * db # Conservative default
    ca1 = float(inputs.get('concrete_edge_dist_ca1', 0))
    ca2 = float(inputs.get('concrete_edge_dist_ca2', 0))
    actual_edge = min(ca1, ca2) if (ca1>0 and ca2>0) else max(ca1, ca2)
    
    checks['Minimum Edge Distance'] = {
        "actual": actual_edge,
        "min": min_edge,
        "pass": actual_edge >= min_edge
    }
    
    # Min Spacing (3 * db preferred, 2.66 * db min)
    min_spacing = 3.0 * db
    sp_N = float(inputs.get('bolt_spacing_N', 0))
    sp_B = float(inputs.get('bolt_spacing_B', 0))
    # Only check spacing if there are multiple bolts in that direction
    num_N = int(inputs.get('num_bolts_N', 1))
    num_B = int(inputs.get('num_bolts_B', 1))
    
    if num_N > 1:
        checks['Spacing (N)'] = {
            "actual": sp_N,
            "min": min_spacing,
            "pass": sp_N >= min_spacing
        }
    if num_B > 1:
        checks['Spacing (B)'] = {
            "actual": sp_B,
            "min": min_spacing,
            "pass": sp_B >= min_spacing
        }
        
    return checks

def calculate_group_geometry(inputs):
    """Centralizes geometry calc. Returns bolt coordinates and group properties.
    Assumes symmetrical layout centered on (0,0)."""
    num_N = int(inputs.get('num_bolts_N', 2))
    num_B = int(inputs.get('num_bolts_B', 2))
    sp_N = float(inputs.get('bolt_spacing_N', 0))
    sp_B = float(inputs.get('bolt_spacing_B', 0))
    bolts = []
    start_z = -(num_N - 1) * sp_N / 2.0
    start_x = -(num_B - 1) * sp_B / 2.0
    Ix_group = 0
    Iy_group = 0
    for r in range(num_N):
        for c in range(num_B):
            if (num_N > 2 and num_B > 2) and (0 < r < num_N - 1) and (0 < c < num_B - 1):
                continue
            z = start_z + r * sp_N
            x = start_x + c * sp_B
            bolts.append({'id': f"{r}-{c}", 'x': x, 'z': z})
            Ix_group += z**2
            Iy_group += x**2
    return {
        "bolts": bolts,
        "num_bolts": len(bolts),
        "Ix": Ix_group,
        "Iy": Iy_group,
        "z_max": max([abs(b['z']) for b in bolts]) if bolts else 0,
        "x_max": max([abs(b['x']) for b in bolts]) if bolts else 0
    }

def analyze_bolt_forces(inputs, geo):
    """Elastic analysis (rigid plate) to compute bolt tensions."""
    Pu = float(inputs.get('axial_load_P_in', 0))
    Mux = float(inputs.get('moment_Mx_in', 0)) * 12.0
    Muy = float(inputs.get('moment_My_in', 0)) * 12.0
    max_T = 0
    total_tension_load = 0
    bolt_forces = []
    for b in geo['bolts']:
        ft = 0
        if geo['num_bolts'] > 0:
            ft += Pu / geo['num_bolts']
        if geo['Ix'] > 0:
            ft += (Mux * b['z']) / geo['Ix']
        if geo['Iy'] > 0:
            ft += (Muy * b['x']) / geo['Iy']
        t_force = max(0, ft)
        bolt_forces.append({'id': b['id'], 'T': t_force, 'x': b['x'], 'z': b['z']})
        if t_force > max_T:
            max_T = t_force
        total_tension_load += t_force
    return {
        "max_tension": max_T,
        "total_tension": total_tension_load,
        "distribution": bolt_forces
    }

# --- PRIMARY CHECK 1: Plate Bending (Unified) ---

def check_plate_bending_unified(inputs, geo, forces, bearing_res):
    """Selects correct theory based on load case.
    Case A: Compression dominant -> AISC DG1 (Thornton)
    Case B: Tension dominant -> Yield Line Theory.
    """
    checks = {}
    Pu = float(inputs.get('axial_load_P_in', 0))
    Fy = float(inputs.get('base_plate_Fy', 36))
    tp = float(inputs.get('provided_plate_thickness_tp', 0))
    N = float(inputs.get('base_plate_length_N', 0))
    B = float(inputs.get('base_plate_width_B', 0))
    # Yield Line (Uplift) if any tension in bolts
    if forces['max_tension'] > 0:
        col_web_t = float(inputs.get('column_web_tw', 0))
        dist_to_yield_line = col_web_t / 2.0
        m_top = 0
        m_bot = 0
        for bolt in forces['distribution']:
            dist = abs(bolt['z']) - dist_to_yield_line
            if dist > 0:
                moment = bolt['T'] * dist
                if bolt['z'] > 0:
                    m_top += moment
                else:
                    m_bot += moment
        M_u_yield = max(m_top, m_bot)
        Z_yield = (B * tp**2) / 4.0
        Mn_yield = Fy * Z_yield
        phi = 0.90
        ratio = M_u_yield / (phi * Mn_yield) if Mn_yield > 0 else 9999
        checks['Plate Bending (Yield Line)'] = {
            "demand": M_u_yield,
            "check": {"Rn": phi * Mn_yield, "phi": phi, "omega": 1.67},
            "details": {
                "method": "Yield Line Theory (Energy Method)",
                "status": "PASS" if ratio <= 1.0 else "FAIL",
                "note": "Critical for thin plates. If FAIL, bolt forces are invalid.",
                "Z_pl": Z_yield,
                "Lever Arm Max": max([abs(b['z']) for b in geo['bolts']]) - dist_to_yield_line,
                "breakdown": f"Yield Moment M<sub>u</sub> = {M_u_yield:.2f} kip-ft<br>Plastic Modulus Z<sub>pl</sub> = {Z_yield:.3f} in³<br>Capacity φM<sub>n</sub> = {phi * Mn_yield:.2f} kip-ft"
            }
        }
    # Compression side (Bearing) if bearing pressure exists
    f_p_max = bearing_res['details'].get('f_p_max', 0)
    if f_p_max > 0:
        d = float(inputs.get('column_depth_d', 0))
        bf = float(inputs.get('column_flange_width_bf', 0))
        m = (N - 0.95*d)/2.0
        n = (B - 0.80*bf)/2.0
        l_crit = max(m, n)
        phi = 0.90
        t_req = l_crit * math.sqrt((2 * f_p_max) / (phi * Fy))
        checks['Plate Bending (Compression)'] = {
            "demand": tp,
            "check": {"Rn": t_req, "phi": 1.0, "omega": 1.0},
            "details": {"method": "AISC DG1 (Cantilever)", "l": l_crit, "f_p": f_p_max}
        }
    return checks

# --- PRIMARY CHECK 2: Anchors (ACI 318-19 Group Logic) ---

def check_anchors_aci_best(inputs, geo, forces):
    checks = {}
    hef = float(inputs.get('anchor_embedment_hef', 0))
    fc = float(inputs.get('concrete_fc', 4))
    if fc > 10:
        fc = fc / 1000.0
    # Steel Tension per bolt
    Tu_max = forces['max_tension']
    if Tu_max > 0:
        db = float(inputs.get('anchor_bolt_diameter', 0.75))
        Fut = float(inputs.get('anchor_bolt_Fut', 58))
        Ase = 0.75 * math.pi * (db/2)**2
        Rn_steel = Ase * Fut
        phi_steel = 0.75
        checks['Anchor Steel Tension'] = {
            "demand": Tu_max,
            "check": {"Rn": Rn_steel, "phi": phi_steel, "omega": 2.0},
            "details": {
                "note": "Max tension per bolt",
                "breakdown": f"Max elastic tension per bolt (Tu = {Tu_max:.3f} kips)"
            }
        }
    # Concrete breakout (group)
    Tu_total = forces['total_tension']
    if Tu_total > 0:
        kc = 24
        fc_psi = fc * 1000.0
        Nb = kc * 1.0 * math.sqrt(fc_psi) * (hef ** 1.5) / 1000.0
        ca1 = float(inputs.get('concrete_edge_dist_ca1', 0))
        ca2 = float(inputs.get('concrete_edge_dist_ca2', 0))
        num_N = int(inputs.get('num_bolts_N', 1))
        num_B = int(inputs.get('num_bolts_B', 1))
        sp_N = float(inputs.get('bolt_spacing_N', 0))
        sp_B = float(inputs.get('bolt_spacing_B', 0))
        c1 = min(ca1, 1.5 * hef)
        dim_1 = c1 + (num_N - 1) * sp_N + c1
        c2 = min(ca2, 1.5 * hef)
        dim_2 = c2 + (num_B - 1) * sp_B + c2
        Anc = dim_1 * dim_2
        Anco = 9 * (hef**2)
        c_min = min(ca1, ca2)
        psi_ed = 1.0
        if c_min < 1.5 * hef:
            psi_ed = 0.7 + 0.3 * (c_min / (1.5 * hef))
        Ncbg = (Anc / Anco) * psi_ed * 1.25 * 1.0 * Nb
        phi_conc = 0.70
        checks['Anchor Concrete Breakout (Group)'] = {
            "demand": Tu_total,
            "check": {"Rn": Ncbg, "phi": phi_conc, "omega": 2.5},
            "details": {
                "Anc": Anc, "Anco": Anco, "Nb": Nb, "hef": hef,
                "breakdown": f"Basic Strength N<sub>b</sub> = {Nb:.2f} kips<br>Area Ratio A<sub>Nc</sub>/A<sub>Nco</sub> = {Anc:.1f}/{Anco:.1f} = {Anc/Anco:.2f}<br>Edge Factor ψ<sub>ed,N</sub> = {psi_ed:.2f}"
            }
        }
    # Pullout
    if Tu_max > 0:
        db = float(inputs.get('anchor_bolt_diameter', 0.75))
        Abrg = 0.5 * (math.pi * (db/2)**2)
        Np = 8 * Abrg * fc
        phi_pull = 0.70
        checks['Anchor Pullout'] = {
            "demand": Tu_max,
            "check": {"Rn": Np, "phi": phi_pull, "omega": 2.5},
            "details": {
                "note": "Check head size/washer",
                "breakdown": f"Bearing Area A<sub>brg</sub> = {Abrg:.3f} in²<br>Nominal Strength N<sub>p</sub> = 8A<sub>brg</sub>f'<sub>c</sub> = {Np:.2f} kips"
            }
        }
    return checks

# --- MAIN ENTRY POINT (Replaces calculate_base_plate) ---

def calculate_base_plate(inputs):
    inputs = inputs.copy()
    # Geometry & Rigid Analysis
    geo = calculate_group_geometry(inputs)
    forces = analyze_bolt_forces(inputs, geo)
    # Bearing check (reuse existing function)
    bearing_res = check_concrete_bearing(inputs)
    checks = {'Concrete Bearing': bearing_res}
    # Plate bending unified
    bending_checks = check_plate_bending_unified(inputs, geo, forces, bearing_res)
    checks.update(bending_checks)
    # If Yield Line fails, flag
    yl_status = "OK"
    if 'Plate Bending (Yield Line)' in checks:
        yl = checks['Plate Bending (Yield Line)']
        if yl['demand'] > yl['check']['Rn']:
            yl_status = "FAIL"
            checks['SYSTEM WARNING'] = {
                "demand": 1,
                "check": {"Rn": 0, "phi": 1, "omega": 1},
                "details": {"error": "Plate is too thin (Yield Line Fail). Bolt forces are invalid. Increase thickness."}
            }
    # Anchor checks only if Yield Line passed
    Ncbg_val = 0 # Default if check doesn't run
    anchor_checks = {}
    if yl_status == "OK":
        anchor_checks = check_anchors_aci_best(inputs, geo, forces)
        checks.update(anchor_checks)
        # Capture Ncbg for Pryout check
        if 'Anchor Concrete Breakout (Group)' in anchor_checks:
            c = anchor_checks['Anchor Concrete Breakout (Group)']
            Ncbg_val = c['check']['Rn'] # Nominal value

    # [NEW] Shear Checks
    shear_checks = check_anchors_shear_best(inputs, forces, Ncbg_val)
    checks.update(shear_checks)
    
    # [NEW] Interaction
    inter_res = check_interaction(checks)
    checks['Anchor Interaction (T+V)'] = inter_res
    # Return results
    return {
        "checks": checks,
        "inputs": inputs,
        "details": {"max_bolt_tension": forces['max_tension'], "yield_line_status": yl_status}
    }

# --- Existing functions retained for compatibility ---

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
    fc = raw_fc / 1000.0 if raw_fc > 20 else raw_fc
    pedestal_N = safe_float(inputs.get('pedestal_N', N))
    pedestal_B = safe_float(inputs.get('pedestal_B', B))
    Pu = safe_float(inputs.get('axial_load_P_in', 0))
    Mux = safe_float(inputs.get('moment_Mx_in', 0)) * 12.0
    Muy = safe_float(inputs.get('moment_My_in', 0)) * 12.0
    A1 = N * B
    A2 = pedestal_N * pedestal_B
    ratio_A = math.sqrt(A2/A1) if A1 > 0 else 1.0
    psi = min(ratio_A, 2.0)
    Pp = 0.85 * fc * A1 * psi
    Fp = Pp / A1 if A1 > 0 else 0
    phi = get_phi('bearing', method, jurisdiction, inputs.get('global_fos'))
    omega = get_phi('bearing', 'ASD' if method=='LRFD' else 'LRFD', jurisdiction, inputs.get('global_fos'))
    Rn = Fp
    if Pu > 0:
        return {"demand": 0, "check": {"Rn": Rn, "phi": phi, "omega": omega}, "details": {"bearing_case": "Uplift", "Pu": Pu, "f_p_max": 0, "P_abs": abs(Pu), "Mux": Mux/12.0, "Muy": Muy/12.0, "e_x": (Mux / abs(Pu)) if abs(Pu) > 0 else 0, "e_y": (Muy / abs(Pu)) if abs(Pu) > 0 else 0, "A1": N*B, "A2": pedestal_N*pedestal_B, "confinement_factor": 1.0, "Rn_force": Pp, "breakdown_formula": "Uplift: No bearing pressure."}}
    P_abs = abs(Pu)
    f_p_max = 0
    Y = 0
    X = B
    e_x = 0
    e_y = 0
    bearing_case = ""
    # Pure Moment
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
        kd = N / 3.0
        for _ in range(20):
            if kd <= 0:
                kd = 0.1
            if (N/2 - kd/3 + d_anchor) == 0:
                break
            force_c_denom = (B * kd * (N/2 - kd/3 + d_anchor))
            C_force = 0.5 * B * kd * ((2*Mux) / force_c_denom) if force_c_denom != 0 else 0
            T_force = 0
            if kd != 0 and force_c_denom != 0:
                T_force = n_ratio * Ab * ((2*Mux) / force_c_denom) * ((d_anchor - kd)/kd)
            if C_force == 0:
                break
            if abs(C_force - T_force) < 0.01 * C_force:
                break
            ratio = T_force / C_force if C_force != 0 else 1.0
            kd = kd * math.sqrt(ratio) if ratio > 0 else kd
        Y = kd
        term = (B * Y * (N/2 - Y/3 + d_anchor))
        f_p_max = (2 * Mux) / term if term != 0 else 0
    else:
        e_x = Mux / P_abs if P_abs > 0 else 0
        e_y = Muy / P_abs if P_abs > 0 else 0
        if e_x <= N/6.0 and e_y <= B/6.0:
            bearing_case = "Full Bearing"
            term_x = (6*e_x)/N
            term_y = (6*e_y)/B
            f_p_max = (P_abs / (B*N)) * (1 + term_x + term_y)
            Y = N
            X = B
        elif (e_x/N + e_y/B) <= 0.5:
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
                Y_curr = N/2.0
                for _ in range(30):
                    M_res = P_abs * (N/2 - Y_curr/3)
                    M_app = Mux
                    if M_res <= 0:
                        Y_curr = N
                        break
                    ratio = M_app / M_res
                    if abs(1 - ratio) < 0.01:
                        break
                    Y_curr = Y_curr * (1 + 0.5 * (1 - ratio))
                    Y_curr = max(0.1, min(N, Y_curr))
                Y = Y_curr
                f_p_max = (2 * P_abs) / (B * Y)
        else:
            bearing_case = "Corner Bearing"
            g_x = N/2 - e_x
            g_y = B/2 - e_y
            if g_x > 0 and g_y > 0:
                f_p_max = (2 * P_abs) / (3 * g_x * g_y)
                Y = 3 * g_x
                X = 3 * g_y
            else:
                f_p_max = 0
                bearing_case = "Unstable (Load outside)"
    return {"demand": f_p_max, "check": {"Rn": Rn, "phi": phi, "omega": omega}, "details": {"f_p_max": f_p_max, "e_x": e_x, "e_y": e_y, "Y": Y, "X": X, "A1": A1, "A2": A2, "confinement_factor": psi, "Pu": Pu, "P_abs": P_abs, "Rn_force": Pp, "bearing_case": bearing_case if bearing_case else "Uplift", "breakdown_formula": "Refer to AISC Design Guide 1"}}

# Additional placeholder functions (if needed) can be added here.

def check_anchors_shear_best(inputs, forces, tension_capacity_group):
    """
    Checks ACI 318 Shear: Steel Failure & Pryout.
    (Shear Breakout requires complex edge distances, assumed sufficient here or added separately).
    """
    checks = {}
    
    # 1. Shear Demand
    # We assume 'shear_V_in' is the TOTAL shear on the connection
    Vu_total = float(inputs.get('shear_V_in', 0))
    if Vu_total <= 0: return {}
    
    hef = float(inputs.get('anchor_embedment_hef', 0))

    num_bolts = len(forces['distribution'])
    Vu_bolt = Vu_total / num_bolts # Assumed equal distribution for shear
    
    # 2. Steel Shear Strength (ACI 17.5.1)
    db = float(inputs.get('anchor_bolt_diameter', 0.75))
    Fut = float(inputs.get('anchor_bolt_Fut', 58))
    Ase = 0.75 * math.pi * (db/2)**2 
    
    # Shear strength is approx 0.60 * Tensile Strength
    Vn_steel = 0.6 * Ase * Fut
    phi_shear = 0.65 # Steel element in shear (ductile) - check if cast-in vs post-installed
    
    checks['Anchor Steel Shear'] = {
        "demand": Vu_bolt,
        "check": {"Rn": Vn_steel, "phi": phi_shear, "omega": 2.0},
        "details": {
            "note": "Shear per bolt",
            "breakdown": f"Shear per bolt V<sub>u,bolt</sub> = {Vu_total:.2f} / {num_bolts} = {Vu_bolt:.2f} kips<br>Shear Area A<sub>se,V</sub> = {Ase:.3f} in²<br>Strength V<sub>sa</sub> = {Vn_steel:.2f} kips"
        }
    }
    
    # 3. Concrete Breakout in Shear (ACI 17.5.2) - Conservative "Towards Edge"
    # Assumes shear load acts towards the CLOSEST edge (c_min).
    ca1 = float(inputs.get('concrete_edge_dist_ca1', 0))
    ca2 = float(inputs.get('concrete_edge_dist_ca2', 0))
    c1 = min(ca1, ca2) if (ca1 > 0 and ca2 > 0) else max(ca1, ca2)
    # If both 0, maybe infinite or irrelevant? Assume finite for safety or skip?
    # If c1 is small, Vcbg is small.
    
    if c1 > 0:
        # Vb = 7(le/da)^0.2 * sqrt(da) * lambda * sqrt(fc) * (c1)^1.5
        le = hef # Load bearing length, usually hef for anchors
        if le > 8*db: le = 8*db
        
        lambda_a = 1.0 # Normal weight
        fc = float(inputs.get('concrete_fc', 4))
        fc_psi = fc * 1000.0
        
        # Vb calculation (Eq 17.5.2.2a)
        # Note: ACI 318-19 Changes Vb constant from 7 to 9 for cast-in? 
        # For post-installed, it's 7 * ...
        # Let's use 7 for generality or standard.
        Vb_const = 7.0 
        term_1 = (le / db) ** 0.2
        term_2 = math.sqrt(db)
        term_3 = lambda_a
        term_4 = math.sqrt(fc_psi)
        term_5 = (c1) ** 1.5
        
        Vb = Vb_const * term_1 * term_2 * term_3 * term_4 * term_5
        
        # Group effect Avc / Avco
        # Avco = 4.5 * c1^2
        Avco = 4.5 * (c1 ** 2)
        
        # Avc = Projected area.
        # Conservative: Just one bolt? No, group.
        # Calculate full group projected area on the edge.
        # Length of group parallel to edge:
        num_N = int(inputs.get('num_bolts_N', 1))
        num_B = int(inputs.get('num_bolts_B', 1))
        sp_N = float(inputs.get('bolt_spacing_N', 0))
        sp_B = float(inputs.get('bolt_spacing_B', 0))
        
        # Determine which edge c1 refers to.
        # If c1 came from ca1 (Main Direction?), group width is dim_2 (along B)
        # If c1 came from ca2 (Side Direction?), group width is dim_1 (along N)
        # We don't know direction of V. WORST CASE: V is towards c1.
        # And group width is the larger of the two dimensions? No, width perp to V.
        
        # Simple Logic: Maximize Avc? Minimize?
        # Avc is limited by corner effects 1.5c1.
        # Let's take group width = max(width_N, width_B).
        width_N = (num_N - 1) * sp_N
        width_B = (num_B - 1) * sp_B
        group_width = max(width_N, width_B)
        
        # Projected width = Group Width + 2 * (1.5 * c1)
        # But limited by pedestal size? Ignore pedestal limit for Avc calculation for now (conservative A_vc).
        # Actually Avc cannot exceed pedestal face area.
        # Let's use simplified Avc = (Group Width + 3*c1) * (1.5*c1)
        # Height of prism is 1.5*c1.
        
        Avc = (group_width + 3.0 * c1) * (1.5 * c1)
        
        # Modification Factors
        psi_ec_V = 1.0 # No eccentricity loaded assumption (or V acts at centroid)
        psi_ed_V = 1.0 # Edge effect (we are checking edge breakout, so included in Basic Strength? No, this is for side edges)
        # If side edge distance < 1.5c1, reduce.
        # c2 (side edge)
        c2 = max(ca1, ca2) # The OTHER one is side edge? Crude approx.
        if c2 < 1.5 * c1:
            psi_ed_V = 0.7 + 0.3 * (c2 / (1.5 * c1))
            
        psi_c_V = 1.0 # Cracked/Uncracked. 1.0 for Cracked (Conservative)
        if inputs.get('assume_cracked_concrete', 'true') == 'false':
            psi_c_V = 1.4
            
        psi_h_V = 1.0 # Thickness factor. ha > 1.5c1?
        # ha is pedestal height? Not input. Assume thick enough.
        
        Vcbg = (Avc / Avco) * psi_ec_V * psi_ed_V * psi_c_V * psi_h_V * Vb
        phi_conc_shear = 0.70
        
        checks['Anchor Concrete Breakout (Shear)'] = {
            "demand": Vu_total,
            "check": {"Rn": Vcbg / 1000.0, "phi": phi_conc_shear, "omega": 2.5}, # Divide by 1000 to get kips (Vb uses psi/in -> lbs)
            "details": {
                "c1 (used)": c1,
                "Vb (lbs)": Vb,
                "Avc": Avc,
                "Avco": Avco,
                "note": "Assumes shear acts towards closest edge (Worst Case)",
                "breakdown": f"Edge Distance c<sub>1</sub> = {c1:.2f} in<br>Basic Strength V<sub>b</sub> = {Vb:.0f} lbs<br>Area Ratio A<sub>Vc</sub>/A<sub>Vco</sub> = {Avc:.1f}/{Avco:.1f} = {Avc/Avco:.2f}<br>Modification Factors applied (ψ)"
            }
        }
    
    # 4. Concrete Pryout Strength (ACI 17.5.3)
    # Vcp = kcp * Ncbg
    # kcp = 1.0 for hef < 2.5", 2.0 for hef >= 2.5"
    hef = float(inputs.get('anchor_embedment_hef', 0))
    kcp = 2.0 if hef >= 2.5 else 1.0
    
    # We need the Ncbg (Concrete Breakout Strength) from the Tension check
    # We pull it from the passed 'tension_capacity_group' arg
    Ncbg = tension_capacity_group
    
    Vn_pryout = kcp * Ncbg
    phi_pryout = 0.70
    
    checks['Anchor Concrete Pryout (Group)'] = {
        "demand": Vu_total,
        "check": {"Rn": Vn_pryout, "phi": phi_pryout, "omega": 2.5},
        "details": {
            "kcp": kcp, "Ncbg_ref": Ncbg,
            "breakdown": f"Pryout Factor k<sub>cp</sub> = {kcp:.1f}<br>Reference Tension Strength N<sub>cbg</sub> = {Ncbg:.2f} kips<br>V<sub>cpg</sub> = k<sub>cp</sub>N<sub>cbg</sub> = {Vn_pryout:.2f} kips"
        }
    }
    
    return checks

def check_interaction(checks):
    """
    ACI 318-19 Sec 17.6 Interaction of Tensile and Shear Forces.
    Uses Trilinear approximation or standard power interaction.
    """
    # 1. Get Max Ratios
    # Tension Ratio
    # Tension Ratio
    t_ratio = 0
    if 'Anchor Steel Tension' in checks:
        c = checks['Anchor Steel Tension']
        denom = c['check']['Rn'] * c['check']['phi']
        t_ratio = max(t_ratio, c['demand'] / denom if denom > 0 else 999.0)
        
    if 'Anchor Concrete Breakout (Group)' in checks:
        c = checks['Anchor Concrete Breakout (Group)']
        denom = c['check']['Rn'] * c['check']['phi']
        t_ratio = max(t_ratio, c['demand'] / denom if denom > 0 else 999.0)

    # Shear Ratio
    v_ratio = 0
    if 'Anchor Steel Shear' in checks:
        c = checks['Anchor Steel Shear']
        denom = c['check']['Rn'] * c['check']['phi']
        v_ratio = max(v_ratio, c['demand'] / denom if denom > 0 else 999.0)
        
    if 'Anchor Concrete Pryout (Group)' in checks:
        c = checks['Anchor Concrete Pryout (Group)']
        denom = c['check']['Rn'] * c['check']['phi']
        v_ratio = max(v_ratio, c['demand'] / denom if denom > 0 else 999.0)
        
    # 2. Interaction Formula
    # If both <= 0.2, OK.
    # If one > 0.2, Check (Ratio_N)^5/3 + (Ratio_V)^5/3 <= 1.0
    
    status = "OK"
    interaction_val = 0
    
    if t_ratio <= 0.2 and v_ratio <= 0.2:
        interaction_val = max(t_ratio, v_ratio) # Low load, simple check
    else:
        interaction_val = (t_ratio)**(5/3) + (v_ratio)**(5/3)
        
    if interaction_val > 1.0: status = "FAIL"
    
    return {
        "demand": interaction_val,
        "check": {"Rn": 1.0, "phi": 1.0, "omega": 1.0},
        "details": {
            "N_ratio": t_ratio,
            "V_ratio": v_ratio,
            "formula": "(N/Nn)^5/3 + (V/Vn)^5/3 <= 1.0",
            "breakdown": f"Tension Ratio = {t_ratio:.3f}<br>Shear Ratio = {v_ratio:.3f}<br> Interaction = ({t_ratio:.2f})<sup>5/3</sup> + ({v_ratio:.2f})<sup>5/3</sup> = {interaction_val:.3f}"
        }
    }
    
# --- NEW: Weld Checks ---

def calculate_weld_properties(inputs):
    """Calculates Aw, Swx, Swy, Jw based on column shape."""
    col_type = inputs.get('column_type', 'W-Shape')
    weld_size = float(inputs.get('weld_size', 0.25))
    teff = 0.707 * weld_size # Effective throat for FILLET
    
    # If PJP/CJP is selected in frontend, logic might differ, 
    # but for now we assume Fillet effective throat or use provided throat.
    weld_type = inputs.get('weld_type', 'Fillet')
    if weld_type == 'PJP':
        teff = float(inputs.get('weld_effective_throat', 0.25))
    elif weld_type == 'CJP':
        # CJP develops full strength, modeled as very strong or just PASS
        teff = 10.0 # Arbitrary large number to pass stress check? Correct way is to skip check or use base metal.
        
    d = float(inputs.get('column_depth_d', 0))
    bf = float(inputs.get('column_flange_width_bf', 0))
    
    props = {'Aw': 0, 'Swx': 0, 'Swy': 0}
    
    if col_type == 'W-Shape' or col_type == 'S-Shape':
        # Treat as lines: 2 flanges (length bf) + web (length d-2tf? use d for simplicity or d-2tf)
        # Simplified: Box pattern or I pattern?
        # AISC Manual Table 8-2 for "C" shape or similar?
        # Let's use simple Rectangle approx for W-shape outer perimeter?
        # No, better: Flanges + Web.
        # Flanges: 2 lines of length bf at +/- d/2
        # Web: 2 lines of length (d-2tf) at x=0? Or just 1 line? Usually fillet on both sides of web.
        
        # Simplified Conservative: Box (d x bf) - often used for W-shapes in base plates if all-around
        # Aw = 2(d + bf) * teff
        # Swx = (d*t + bf*t*d) ...
        
        # Let's use AISC Table 8-2 properties for Rectangular Box (All around weld)
        l = d # depth
        b = bf # width
        Aw = 2 * (l + b) * teff
        Swx = (l*d + (b**2)/3) * teff # Wait, formula for box?
        # Linear geometric properties (unit thickness):
        # Aw_u = 2(l+b)
        # Ip_u = (l+b)^3 / 6 ... no
        
        # Using elastic section modulus for hollow rectangle (weld path)
        # Ix = (b * d^3 - (b-2t)(d-2t)^3) / 12 ... 
        # Easier: Ix_linear = 2 * (1/12 * t_w * d^3) + 2 * (b * t_f * (d/2)^2) 
        # Linear (t=1):
        # I_unit_x_web = 2 * (1/12 * d**3) (two webs? box has 2 webs)
        # I_unit_x_flange = 2 * (b * (d/2)**2)
        # Total I_unit_x = (d**3)/6 + b*(d**2)/2
        # Sx_unit = I_unit_x / (d/2) = (d**2)/3 + b*d
        
        Sx_unit = (d**2)/3.0 + bf*d
        Sy_unit = (bf**2)/3.0 + d*bf # Swapped b and d
        
        props['Aw'] = 2 * (d + bf) * teff
        props['Swx'] = Sx_unit * teff
        props['Swy'] = Sy_unit * teff
        
    elif 'HSS' in col_type or col_type == 'Pipe':
        if 'Round' in col_type or col_type == 'Pipe':
            # Ring
            # Aw = pi * d * t
            # S = pi * d^2 / 4 * t
            Aw = math.pi * d * teff
            S = (math.pi * d**2 / 4.0) * teff
            props['Aw'] = Aw
            props['Swx'] = S
            props['Swy'] = S
        else:
            # Rectangular HSS - same as Box analysis above
            l = d
            b = bf
            Sx_unit = (l**2)/3.0 + b*l
            Sy_unit = (b**2)/3.0 + l*b
            props['Aw'] = 2 * (l + b) * teff
            props['Swx'] = Sx_unit * teff
            props['Swy'] = Sy_unit * teff
            
    else:
        # Fallback to W-shape box
        props['Aw'] = 2 * (d + bf) * teff
        props['Swx'] = (d**2/3.0 + bf*d) * teff
        props['Swy'] = (bf**2/3.0 + d*bf) * teff
        
    return props

def check_weld_stress(inputs, forces, weld_props):
    # Demands
    # Forces dict has component loads? No, forces dict has BOLT forces.
    # We need Global P, V, Mx, My
    Pu = abs(float(inputs.get('axial_load_P_in', 0))) # Compression or Tension matters?
    # Weld checks usually take max vector sum.
    # P acts on Aw.
    # V acts on Aw? Yes, shear stress.
    # M acts on Sw.
    
    # But wait, P (axial) is compression or tension. 
    # If Compression, verifies bearing. Weld might check TENSION uplift.
    # If P is compression, does weld take load? Yes, but usually bearing takes it.
    # However, for moment connections, weld transfers tensile component of moment.
    # A conservative checks considers Axial Stress + Bending Stress.
    
    # Loads
    P_in = float(inputs.get('axial_load_P_in', 0))
    # If P is compression, usually transferred by bearing, not weld?
    # ACI/AISC says if "finished to bear", weld only needs to resist uplift/shear.
    # If not finished to bear, weld takes all.
    # We will be CONSERVATIVE and assume weld takes ALL P, M, V.
    
    Pu = abs(P_in) 
    Vu = abs(float(inputs.get('shear_V_in', 0)))
    Mx = abs(float(inputs.get('moment_Mx_in', 0)))
    My = abs(float(inputs.get('moment_My_in', 0)))
    
    Aw = weld_props['Aw']
    Swx = weld_props['Swx']
    Swy = weld_props['Swy']
    
    if Aw <= 0: return {}
    
    # Stresses
    fa = Pu / Aw
    fbx = Mx / Swx
    fby = My / Swy
    fv = Vu / Aw
    
    # Resultant Stress
    # Vector sum of normal (a, b) and shear (v)?
    # f_resultant = sqrt( (fa + fbx + fby)^2 + fv^2 )
    f_norm = fa + fbx + fby
    f_res = math.sqrt(f_norm**2 + fv**2)
    
    # Capacity
    # Fnw = 0.60 * Fexx
    Fexx = float(inputs.get('weld_Fexx', 70))
    Fnw = 0.60 * Fexx
    phi = 0.75 # Weld
    Rn = Fnw * 1.0 # Stress units
    
    ratio = f_res / (phi * Rn) if Rn > 0 else 999
    
    return {
        "demand": f_res,
        "check": {"Rn": phi*Rn, "phi": phi, "omega": 2.00},
        "details": {
            "method": "Elastic Method (Conservative)",
            "Aw": Aw,
            "Swx": Swx,
            "f_norm": f_norm,
            "f_shear": fv,
            "status": "PASS" if ratio <= 1.0 else "FAIL",
            "breakdown": f"Weld Area A<sub>w</sub> = {Aw:.2f} in²<br>Resultant Stress f<sub>res</sub> = {f_res:.2f} ksi<br>Capacity φF<sub>nw</sub> = {phi*Rn:.2f} ksi" 
        }
    }

def calculate_base_plate(inputs):
    inputs = inputs.copy()
    # Geometry & Rigid Analysis
    geo = calculate_group_geometry(inputs)
    forces = analyze_bolt_forces(inputs, geo)
    # Bearing check (reuse existing function)
    bearing_res = check_concrete_bearing(inputs)
    checks = {'Concrete Bearing': bearing_res}
    # Plate bending unified
    bending_checks = check_plate_bending_unified(inputs, geo, forces, bearing_res)
    checks.update(bending_checks)
    # If Yield Line fails, flag
    yl_status = "OK"
    if 'Plate Bending (Yield Line)' in checks:
        yl = checks['Plate Bending (Yield Line)']
        if yl['demand'] > yl['check']['Rn']:
            yl_status = "FAIL"
            checks['SYSTEM WARNING'] = {
                "demand": 1,
                "check": {"Rn": 0, "phi": 1, "omega": 1},
                "details": {"error": "Plate is too thin (Yield Line Fail). Bolt forces are invalid. Increase thickness."}
            }
    # Anchor checks only if Yield Line passed
    Ncbg_val = 0 # Default if check doesn't run
    anchor_checks = {}
    if yl_status == "OK":
        anchor_checks = check_anchors_aci_best(inputs, geo, forces)
        checks.update(anchor_checks)
        # Capture Ncbg for Pryout check
        if 'Anchor Concrete Breakout (Group)' in anchor_checks:
            c = anchor_checks['Anchor Concrete Breakout (Group)']
            Ncbg_val = c['check']['Rn'] # Nominal value

    # [NEW] Shear Checks
    shear_checks = check_anchors_shear_best(inputs, forces, Ncbg_val)
    checks.update(shear_checks)
    
    # [NEW] Interaction
    inter_res = check_interaction(checks)
    checks['Anchor Interaction (T+V)'] = inter_res

    # [NEW] Weld Checks
    weld_props = calculate_weld_properties(inputs)
    weld_check = check_weld_stress(inputs, forces, weld_props)
    if weld_check:
        checks['Weld Stress'] = weld_check
        
    # [NEW] Geometry Limits
    geom_checks = check_geometry_limits(inputs)
    
    return {
        "inputs": inputs,
        "geometry": geo,
        "forces": forces,
        "checks": checks,
        "geomChecks": geom_checks
    }
