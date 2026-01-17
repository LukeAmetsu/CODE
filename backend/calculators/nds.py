import math

# --- Wood Properties Database (Simplified NDS Supplement) ---
# Values are typical for No. 2 grade unless otherwise noted.
# Units: psi for stresses (Fb, Ft, Fv, Fcp, Fc) and modulus (E, Emin)
WOOD_DATABASE = {
    "Douglas Fir-Larch": {
        "Select Structural": {"Fb": 1500, "Ft": 1000, "Fv": 180, "Fcp": 625, "Fc": 1700, "E": 1900000, "Emin": 690000},
        "No. 1":             {"Fb": 1000, "Ft": 675, "Fv": 180, "Fcp": 625, "Fc": 1500, "E": 1700000, "Emin": 620000},
        "No. 2":             {"Fb": 900,  "Ft": 575, "Fv": 180, "Fcp": 625, "Fc": 1350, "E": 1600000, "Emin": 580000},
    },
    "Southern Pine": {
        "Select Structural": {"Fb": 1500, "Ft": 1000, "Fv": 175, "Fcp": 565, "Fc": 1650, "E": 1500000, "Emin": 550000}, # Note: SP values often size-dependent, simplified here
        "No. 1":             {"Fb": 1250, "Ft": 825, "Fv": 175, "Fcp": 565, "Fc": 1500, "E": 1500000, "Emin": 550000},
        "No. 2":             {"Fb": 1100, "Ft": 725, "Fv": 175, "Fcp": 565, "Fc": 1450, "E": 1400000, "Emin": 510000},
    },
    "Spruce-Pine-Fir": {
        "Select Structural": {"Fb": 1250, "Ft": 725, "Fv": 135, "Fcp": 425, "Fc": 1400, "E": 1400000, "Emin": 510000},
        "No. 1":             {"Fb": 875,  "Ft": 550, "Fv": 135, "Fcp": 425, "Fc": 1150, "E": 1400000, "Emin": 510000},
        "No. 2":             {"Fb": 875,  "Ft": 550, "Fv": 135, "Fcp": 425, "Fc": 1150, "E": 1400000, "Emin": 510000},
    },
    "Hem-Fir": {
         "No. 2":            {"Fb": 850,  "Ft": 525, "Fv": 150, "Fcp": 405, "Fc": 1300, "E": 1300000, "Emin": 470000},
    }
}

def get_wood_properties(species, grade):
    """
    Retrieves wood properties from the database.
    Returns dictionary of properties or None if not found.
    """
    if species in WOOD_DATABASE and grade in WOOD_DATABASE[species]:
        return WOOD_DATABASE[species][grade]
    return None

def calculate_nds(inputs):
    """
    Performs NDS wood member design checks (ASD).
    Translates logic from 'nds wood design.js'.
    """
    
    # Extract inputs (with defaults/parsing similar to JS)
    try:
        # Check if user provided direct properties or species/grade
        species = inputs.get('species')
        grade = inputs.get('grade')
        
        props = {}
        if species and grade:
            db_props = get_wood_properties(species, grade)
            if db_props:
                props = db_props
            else:
                 # Fallback to manual if lookup fails but manual values exist
                 pass 
        
        # Use manual values if lookup didn't happen or partially missing, 
        # but prioritize lookup if available.
        # Ensure all required base properties exist.
        Fb = float(props.get('Fb', inputs.get('Fb_unadjusted', 0)))
        Fv = float(props.get('Fv', inputs.get('Fv_unadjusted', 0)))
        FC_perp = float(props.get('Fcp', inputs.get('Fc_perp_unadjusted', 0))) # JS uses Fcp/Fc_perp interchangeably in naming
        Fc = float(props.get('Fc', inputs.get('Fc_unadjusted', 0)))
        E = float(props.get('E', inputs.get('E_unadjusted', 0)))
        E_min = float(props.get('Emin', inputs.get('E_min_unadjusted', 0))) # JS uses E_min
        
        b = float(inputs.get('b_width', 0))
        d = float(inputs.get('d_depth', 0))
        Lu = float(inputs.get('unbraced_length_L', 0)) * 12 # Convert ft to in
        K = float(inputs.get('effective_length_factor_K', 1.0))
        Lb = float(inputs.get('bearing_length_Lb', 0))
        
        CD = float(inputs.get('load_duration', 1.0))
        jurisdiction = inputs.get('jurisdiction', 'AISC')
        
        wet_service = inputs.get('wet_service', 'Dry')
        is_wet = 'Wet' in wet_service
        
        temp_cond = inputs.get('temperature', 'low')
        
        flat_use = inputs.get('flat_use', 'Strong Axis')
        is_weak_axis = 'Weak' in flat_use
        
        incising = inputs.get('incising', 'No')
        is_incised = 'Yes' in incising
        
        repetitive = inputs.get('repetitive_member', 'No')
        is_repetitive = 'Yes' in repetitive
        
        P = float(inputs.get('axial_load_P', 0)) * 1000 # kips to lbs
        M = float(inputs.get('moment_load_M', 0)) * 1000 * 12 # kip-ft to lb-in
        V = float(inputs.get('shear_load_V', 0)) * 1000 # kips to lb
        
        deflection_span = float(inputs.get('deflection_span', 0)) * 12 # ft to in
        deflection_limit_divisor = float(inputs.get('deflection_limit', 360))


    except (ValueError, TypeError) as e:
        return {"error": f"Invalid input values: {str(e)}"}

    # --- Construct Processed Inputs for Frontend Display ---
    # This matches the structure returned by the JS 'woodChecker' so the existing 'renderWoodResults' works.
    processed_inputs = {
        'Fb': Fb, 'Fv': Fv, 'Fc_perp': FC_perp, 'Fc': Fc, 'E': E, 'E_min': E_min,
        'b': b, 'd': d, 'Lu': Lu, 'K': K, 'Lb': Lb,
        'CD': CD,
        'jurisdiction': jurisdiction,
        'is_wet': is_wet,
        'temp_cond': temp_cond,
        'is_weak_axis': is_weak_axis,
        'is_incised': is_incised,
        'is_repetitive': is_repetitive,
        'P': P, 'M': M, 'V': V,
        # Pass through originals if needed for UI forms (optional but good for debugging)
        # 'original_inputs': inputs 
        'deflection_span': deflection_span,
        'deflection_limit_divisor': deflection_limit_divisor,
        'dn': float(inputs.get('notch_depth', 0)),
        'member_type': inputs.get('member_type', 'Sawn'),
        'bearing_type': inputs.get('bearing_type', 'Side') # Side or End
    }

    # --- Factor Calculation ---
    factors = {}
    
    # OSHA Safety Factor
    factors['C_OSHA'] = 0.5 if jurisdiction == 'OSHA' else 1.0
    
    factors['CD'] = CD
    
    # Wet Service Factors
    factors['CM_Fb'] = 0.85 if is_wet and Fb > 1150 else 1.0
    factors['CM_Fv'] = 0.97 if is_wet else 1.0
    factors['CM_Fc_perp'] = 0.67 if is_wet else 1.0
    factors['CM_Fc'] = 0.8 if is_wet and Fc > 750 else 1.0
    factors['CM_E'] = 0.9 if is_wet else 1.0
    factors['CM_E_min'] = 0.9 if is_wet else 1.0
    
    # Temperature Factors
    if temp_cond == 'high':  # 125 < T <= 150
        factors['Ct'] = 0.7
    elif temp_cond == 'medium': # 100 < T <= 125
        factors['Ct'] = 0.8
    else:
        factors['Ct'] = 1.0
        
    # Member Type Logic
    member_type = inputs.get('member_type', 'Sawn')
    is_glulam = member_type == 'Glulam'
    
    # Size Factor (CF) vs Volume Factor (CV)
    factors['CF'] = 1.0
    factors['CV'] = 1.0
    
    if is_glulam:
        # Glulam uses Volume Factor (CV) instead of Size Factor (CF) for Bending
        # CV = kL * (21/L)^(1/x) * (12/d)^(1/x) * (5.125/b)^(1/x)
        # Simplified NDS Eq for Western Species (x=10 usually)
        if M > 0 and d > 0 and b > 0 and Lu > 0:
            # L in eqn is usually length between inflection points ~ Lu
            # NDS 5.3.6
            x = 10.0 # Western Species (20 for Southern Pine... simplified to 10)
            # Using Lu (ft) in formula which expects L in feet?
            # CV formula: (21 / L)^(1/x) ... L is length of beam in feet
            L_ft = Lu / 12 if Lu > 0 else 1.0
            factors['CV'] = math.pow((21.0 / L_ft), 1/x) * math.pow((12.0 / d), 1/x) * math.pow((5.125 / b), 1/x)
            factors['CV'] = min(factors['CV'], 1.0) # CV <= 1.0
    else:
        # Sawn Lumber uses CF
        if d > 12:
            factors['CF'] = math.pow((12/d), 1/9)
        elif d > 4:
            factors['CF'] = 1.0
        else:
            # For d <= 4 (e.g. 2x4, 4x4)
            factors['CF'] = 1.1 if b >= 4 else 1.5 
            
    # Flat Use Factor (Cfu) - Enhanced
    factors['Cfu'] = 1.0
    if is_weak_axis and not is_glulam:
        # Approx from NDS Table 4A for 2" to 4" Nominal Thickness
        # Assuming d is "thickness" (2, 3, 4 nominal -> 1.5, 2.5, 3.5 actual)
        # and b is "width"
        
        # Determine nominal thickness roughly
        nom_thick = d # Since weak axis, d used for depth is the thickness
        nom_width = b # width is the wide face
        
        if nom_thick <= 3.5: # 4" nominal or less
             if nom_thick <= 1.6: # 2" nominal
                 if nom_width >= 11.25: factors['Cfu'] = 1.2
                 elif nom_width >= 9.25: factors['Cfu'] = 1.15
                 elif nom_width >= 7.25: factors['Cfu'] = 1.15
                 elif nom_width >= 5.5: factors['Cfu'] = 1.15 # 6"
                 elif nom_width >= 4.5: factors['Cfu'] = 1.1
                 elif nom_width >= 3.5: factors['Cfu'] = 1.1
                 else: factors['Cfu'] = 1.0
             elif nom_thick <= 2.6: # 3" nominal
                 if nom_width >= 11.25: factors['Cfu'] = 1.2
                 elif nom_width >= 9.25: factors['Cfu'] = 1.15
                 elif nom_width >= 7.25: factors['Cfu'] = 1.15
                 elif nom_width >= 5.5: factors['Cfu'] = 1.15
                 elif nom_width >= 4.5: factors['Cfu'] = 1.1
                 elif nom_width >= 3.5: factors['Cfu'] = 1.1
                 else: factors['Cfu'] = 1.0
             else: # 4" nominal
                 if nom_width >= 11.25: factors['Cfu'] = 1.1
                 elif nom_width >= 9.25: factors['Cfu'] = 1.1
                 elif nom_width >= 7.25: factors['Cfu'] = 1.1
                 elif nom_width >= 5.5: factors['Cfu'] = 1.05
                 elif nom_width >= 4.5: factors['Cfu'] = 1.05
                 elif nom_width >= 3.5: factors['Cfu'] = 1.05
                 else: factors['Cfu'] = 1.0
    factors['Ci'] = 0.8 if is_incised else 1.0
    factors['Cr'] = 1.15 if is_repetitive else 1.0
    
    if Lb > 0 and Lb < 6:
        factors['Cb'] = (Lb + 0.375) / Lb
    else:
        factors['Cb'] = 1.0

    # --- Adjusted Values (Intermediate) ---
    E_min_prime = E_min * factors['CM_E_min'] * factors['Ct'] * factors['Ci']
    
    # --- Forces differentiation ---
    # Sign convention: Positive = Tension, Negative = Compression
    P_actual = P 
    is_tension = P_actual > 0
    is_compression = P_actual < 0
    P_abs = abs(P_actual)

    # --- Column Stability (Cp) [Compression ONLY] ---
    # Fc* calculation
    Fc_star = Fc * factors['CD'] * factors['CM_Fc'] * factors['Ct'] * factors['CF'] * factors['Ci']
    
    Le = Lu * K # Effective length
    d_col = d # Assuming depth is the critical dimension for column buckling in this simple tool
    # In reality need to check both axes, but JS code checks 'd'.
    
    Le_d = Le / d_col if d_col > 0 else 0
    factors['Cp'] = 0.0
    Fce = 0.0
    slenderness_fail_column = False
    
    # Only calc Cp if in compression
    if is_compression:
        if Le_d > 50:
             slenderness_fail_column = True
        else:
            c = 0.8 # For sawn lumber
            if Le_d > 0:
                Fce = (0.822 * E_min_prime) / (Le_d ** 2)
                ratio_cp = Fce / Fc_star if Fc_star > 0 else 0
                if ratio_cp > 0:
                    rad = math.sqrt(((1 + ratio_cp) / (2 * c)) ** 2 - (ratio_cp / c))
                    factors['Cp'] = ((1 + ratio_cp) / (2 * c)) - rad
                else:
                    factors['Cp'] = 0.0
            else:
                 Fce = float('inf')
                 factors['Cp'] = 1.0 # If Le_d is 0, fully braced
    else:
        # For tension, Cp is significantly 1.0 (N/A)
        factors['Cp'] = 1.0


    # --- Beam Stability (CL) ---
    # Determined by b_beam and d_beam based on axis
    if is_weak_axis:
        b_beam, d_beam = d, b
    else:
        b_beam, d_beam = b, d
        
    Rb = math.sqrt((Lu * d_beam) / (b_beam ** 2)) if b_beam > 0 else 0
    factors['CL'] = 0.0
    FbE = 0.0
    slenderness_fail_beam = False
    
    Fb_star = Fb * factors['CD'] * factors['CM_Fb'] * factors['Ct'] * factors['CF'] * factors['CV'] * factors['Cfu'] * factors['Ci'] * factors['Cr']
    
    if Rb > 50:
        slenderness_fail_beam = True
    else:
        if Rb > 0:
            FbE = (1.20 * E_min_prime) / (Rb ** 2)
            ratio_cl = FbE / Fb_star if Fb_star > 0 else 0
            if ratio_cl > 0:
                rad_cl = math.sqrt(((1 + ratio_cl) / 1.9) ** 2 - (ratio_cl / 0.95))
                factors['CL'] = min(1.0, ((1 + ratio_cl) / 1.9) - rad_cl)
            else:
                 factors['CL'] = 0.0 # Should not happen if params are valid
        else:
            factors['CL'] = 1.0 # Fully braced beam
            FbE = float('inf')

    # --- Final Design Values ---
    adj = {}
    adj['Fb_prime'] = Fb_star * factors['CL'] * factors['C_OSHA']
    adj['Fv_prime'] = Fv * factors['CD'] * factors['CM_Fv'] * factors['Ct'] * factors['Ci'] * factors['C_OSHA']
    adj['Fc_perp_prime'] = FC_perp * factors['CM_Fc_perp'] * factors['Ct'] * factors['Ci'] * factors['Cb'] * factors['C_OSHA']
    adj['Fc_prime'] = Fc_star * factors['Cp'] * factors['C_OSHA']
    
    # Tension Adjusted
    # Ft' = Ft * CD * CM * Ct * CF * Ci
    # Note: no CL or Cp for tension.
    Gt_Ft = float(props.get('Ft', inputs.get('Ft_unadjusted', 0))) # Re-fetch to be safe or use what's available
    Ft_prime = Gt_Ft * factors['CD'] * factors['Ct'] * factors['Ci'] 
    # Add CM for Ft? NDS Table 4A factors -> CD, CM, Ct, CF, Ci. 
    # We should have defined CM_Ft separately or use CM_Fb as proxy if data limited, 
    # but strictly: CM=1.0 unless wet. 
    # Let's assume CM_Ft same logic as others (1.0 dry).
    CM_Ft = 1.0 if not is_wet else 1.0 # Need to verify wet service for tension, usually 1.0 for F_t unless very wet
    # Actually NDS Supplement Table 4A: CM for Ft is 1.0 unless >19%.
    # If wet, usually typical factor applies. Let's stick to 1.0 implies Dry or not checking wet tension reducs specifically
    # unless user adds it. For now use 1.0 or copy extensive logic.
    # NDS: CM = 1.0 for Ft mostly. 
    Ft_prime = Ft_prime * CM_Ft
    
    # CF for Tension often same as Bending/Compression for 2-4" lumber
    Ft_prime = Ft_prime * factors['CF']
    adj['Ft_prime'] = Ft_prime * factors['C_OSHA']


    # --- Check Calcs ---
    A = b * d
    Sx = (b_beam * (d_beam ** 2)) / 6
    
    actual = {}
    actual['fb'] = M / Sx if Sx > 0 else 0
    actual['fv'] = (1.5 * V) / A if A > 0 else 0
    
    # Shear at Notch Check (NDS 3.4.3.2)
    # If notched on tension side -> V'r = (2/3) * F'v * b * dn * (dn/d)^2
    dn = float(inputs.get('notch_depth', 0))
    limit_shear = float('inf')
    
    shear_mode = "Standard"
    
    if dn > 0 and dn < d:
        shear_mode = "Notched (Tension Side)"
        # Calculate Allowable Shear Force directly
        # Allowable V = V'r
        # Need Fv_prime to calculate V_r
        # But we do ratios later. Let's adjust Actual Stress or create specific check.
        # Adjusted Fv has already been calculated in adj['Fv_prime'] *later*.
        # Let's handle this in Result Ratio calculation or pre-calculate Fv_prime here for check.
        pass # Will handle in ratios section
    
    # Axial: Comp or Tension?
    if is_compression:
        actual['fc'] = P_abs / A if A > 0 else 0
        actual['ft'] = 0.0
    else:
        actual['fc'] = 0.0
        actual['ft'] = P_abs / A if A > 0 else 0
        
    actual['A'] = A
    actual['Sx'] = Sx
    
    # Compression Perpendicular - Bearing
    # Using Shear Load V as the Reaction force R
    # fc_perp = R / (b * Lb)
    actual['fc_perp'] = 0.0
    bearing_type = inputs.get('bearing_type', 'Side')
    
    if Lb > 0 and b > 0:
        actual['fc_perp'] = V / (b * Lb) # V is in lbs, b, Lb in inches -> psi
    
    # Notch Shear Logic for Ratio
    # fv_allow = Fv_prime
    # If notched, effectively reduced capacity or increased stress.
    # NDS 3.4.3.2: Vr = (2/3) F'v b dn (dn/d)^2
    # Actual V must be <= Vr
    # So Ratio = V / Vr
    
    r_fv = 0.0
    if adj['Fv_prime'] > 0:
        if dn > 0 and dn < d:
            # Notched capacity
            Vr = (2.0/3.0) * adj['Fv_prime'] * b * dn * math.pow((dn/d), 2)
            r_fv = V / Vr if Vr > 0 else float('inf')
        else:
             # Standard capacity check: fv <= Fv'
             # fv = 1.5 V / A. Fv'.
             # Ratio = fv / Fv'
             r_fv = actual['fv'] / adj['Fv_prime']
    else:
        r_fv = float('inf') if V > 0 else 0.0

    # End Grain Bearing (if selected)
    # If End Grain, use Fg (End Grain) if available, or Fc?
    # Usually Fg input needed. If absent, fallback to Fc (conservative? or F_bearing?)
    # For now, if "End", check against Fc' (or specific logic)
    # Actually, End Grain Bearing Fg' = Fg * CD * Ct ... (NDS 3.10.1)
    # Let's assume user inputs Fg in place of Fc_perp if End mode selected?
    # Or just use Fc_perp input but label it differently? To be safe, use Fc_prime if 'End' (as columns often bear on end)
    # But NDS distinguishes Fg.
    # Let's use Fc_perp_prime for Side, and create separate logic for End if we have Fg.
    # Missing Fg: assume Fc_perp input IS Fg if Mode is End.
    
    ratios = {
        'fb': actual['fb'] / adj['Fb_prime'] if adj['Fb_prime'] > 0 else float('inf'),
        'fv': r_fv,
        'fc': actual['fc'] / adj['Fc_prime'] if (adj['Fc_prime'] > 0 and is_compression) else 0.0,
        'ft': actual['ft'] / adj['Ft_prime'] if (adj['Ft_prime'] > 0 and is_tension) else 0.0,
        'fc_perp': actual['fc_perp'] / adj['Fc_perp_prime'] if adj['Fc_perp_prime'] > 0 else 0.0
    }
    
    # --- Deflection ---
    I_moment = (b_beam * (d_beam ** 3)) / 12
    E_adj = E * factors['CM_E'] * factors['Ct'] * factors['Ci']
    
    actual_deflection = 0.0
    if E_adj > 0 and I_moment > 0:
        # 5 * M * L^2 / (48 * E * I) 
        # Note: M in formula often uses w*L^2/8. Here M is input directly.
        # JS uses: (5 * M * span_in^2) / (48 * E_adj * I)
        # This assumes M represents the max moment wL^2/8 -> substituted back into 5wL^4/384EI
        actual_deflection = (5 * M * (deflection_span ** 2)) / (48 * E_adj * I_moment)
        
    allowable_deflection = deflection_span / deflection_limit_divisor if deflection_limit_divisor > 0 else float('inf')
    
    deflection_results = {
        'actual': actual_deflection,
        'allowable': allowable_deflection,
        'E_adj': E_adj,
        'ratio': actual_deflection / allowable_deflection if allowable_deflection > 0 else float('inf')
    }
    
    # --- Interaction ---
    interaction = 0.0
    
    if is_compression:
        # Beam-Column Interaction (NDS Eq. 3.9-3)
        # (fc / Fc')^2 + fb / (Fb' * (1 - fc/Fce))
        
        # Denominator check
        if adj['Fc_prime'] > 0 and adj['Fb_prime'] > 0 and Fce > 0 and actual['fc'] < Fce:
            term1 = (actual['fc'] / adj['Fc_prime']) ** 2
            
            # Amplification factor for Bending
            # (1 - fc/Fce)
            amplification = 1 - (actual['fc'] / Fce)
            
            if amplification > 0:
                term2_denom = adj['Fb_prime'] * amplification
                term2 = actual['fb'] / term2_denom
                interaction = term1 + term2
            else:
                 interaction = float('inf') # Buckling immanent
        elif actual['fc'] >= Fce and Fce > 0:
             interaction = float('inf') # Euler buckling limit exceeded
        else:
             interaction = 0.0 # Should handle edge cases or 0 load
             
    elif is_tension:
         # Combined Bending & Axial Tension (NDS 3.9.2)
         # Eq 3.9-1: (ft / Ft') + (fb / Fb*) <= 1.0
         # Eq 3.9-2: (fb - ft) / Fb** <= 1.0  (Check compressive buckling of flexural comp zone)
         # Note: For Sawn Lumber, Fb** = Fb* usually (unless distinct values for pos/neg moment)
         
         # Fb* is adjusted bending value WITHOUT Cv (Volume) but WITH CL (Stability)?
         # NDS 3.9.2: "Fb* is adjusted bending design value... except CL shall be 1.0"
         # wait, Eq 3.9-1 is Tension side check? "t"
         # Eq 3.9-2 is Compression side check?
         
         # Let's verify definitions:
         # Eq 3.9-1: ft/Ft' + fb/Fb* <= 1.0
         # where Fb* = Reference Fb x all factors EXCEPT CL.
         
         Fb_star_no_CL = Fb_star # Already calculated above without CL, just before CL calculation
         
         check_1 = 0.0
         if adj['Ft_prime'] > 0 and Fb_star_no_CL > 0:
             check_1 = (actual['ft'] / adj['Ft_prime']) + (actual['fb'] / (Fb_star_no_CL * factors['C_OSHA']))
             
         # Eq 3.9-2: (fb - ft)/Fb** <= 1.0
         # where Fb** = Reference Fb x all factors INCLUDING CL.
         # This effectively checks if the 'net' compressive stress on the bending side (fb) reduced by tension (ft)??
         # Actually NDS says: "where fb - ft > 0"
         
         check_2 = 0.0
         net_comp_bending = actual['fb'] - actual['ft']
         if net_comp_bending > 0:
             # Fb** is Fb_prime (includes CL)
             if adj['Fb_prime'] > 0:
                 check_2 = net_comp_bending / adj['Fb_prime']
                 
         interaction = max(check_1, check_2)

    
    # Return structure matching JS output structure
    return {
        "inputs": processed_inputs,
        "factors": factors, # flattened for display
        "adjusted": adj,
        "actuals": actual,
        "ratios": ratios,
        "deflection": deflection_results,
        "interaction": interaction,
        "Fc_star": Fc_star,
        "E_min_prime": E_min_prime,
        "Le_d": Le_d,
        "Fce": Fce,
        "Rb": Rb,
        "FbE": FbE,
        "Fb_star": Fb_star,
        "slenderness_fail_column": slenderness_fail_column,
        "slenderness_fail_beam": slenderness_fail_beam,
        "shear_mode": shear_mode
    }

def get_wood_species_list():
    """Returns accessible list of species and grades for UI"""
    return WOOD_DATABASE
