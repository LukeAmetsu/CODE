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
        'deflection_limit_divisor': deflection_limit_divisor
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
        
    # Size Factor (CF) - Simplified approximations from JS logic
    # Note: Real NDS CF depends on species and grade. JS logic uses general size rules.
    if d > 12:
        factors['CF'] = math.pow((12/d), 1/9)
    elif d > 4:
        factors['CF'] = 1.0
    else:
        # For d <= 4 (e.g. 2x4, 4x4)
        factors['CF'] = 1.1 if b >= 4 else 1.5 # 1.5 for 2in thick, 1.1 for 4in thick roughly
        
    factors['Cfu'] = 1.0 # Flat use factor - simplified 1.0 in JS
    factors['Ci'] = 0.8 if is_incised else 1.0
    factors['Cr'] = 1.15 if is_repetitive else 1.0
    
    if Lb > 0 and Lb < 6:
        factors['Cb'] = (Lb + 0.375) / Lb
    else:
        factors['Cb'] = 1.0

    # --- Adjusted Values (Intermediate) ---
    E_min_prime = E_min * factors['CM_E_min'] * factors['Ct'] * factors['Ci']
    
    # --- Column Stability (Cp) ---
    # Fc* calculation
    Fc_star = Fc * factors['CD'] * factors['CM_Fc'] * factors['Ct'] * factors['CF'] * factors['Ci']
    
    Le = Lu * K # Effective length
    d_col = d # Assuming depth is the critical dimension for column buckling in this simple tool
    # In reality need to check both axes, but JS code checks 'd'.
    
    Le_d = Le / d_col if d_col > 0 else 0
    factors['Cp'] = 0.0
    Fce = 0.0
    slenderness_fail_column = False
    
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
             factors['Cp'] = 1.0 # If Le_d is 0, fully braced? JS logic essentially yields Cp logic only if valid.
             # Actually if Le_d is 0 (braced), Cp should be 1.0. 
             # JS sets Fce=inf, ratio_cp=inf, which solves to Cp=1.0 via limit.

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
    
    Fb_star = Fb * factors['CD'] * factors['CM_Fb'] * factors['Ct'] * factors['CF'] * factors['Cfu'] * factors['Ci'] * factors['Cr']
    
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
    
    # --- Check Calcs ---
    A = b * d
    Sx = (b_beam * (d_beam ** 2)) / 6
    
    actual = {}
    actual['fb'] = M / Sx if Sx > 0 else 0
    actual['fv'] = (1.5 * V) / A if A > 0 else 0
    actual['fc'] = P / A if A > 0 else 0
    actual['A'] = A
    actual['Sx'] = Sx
    
    ratios = {
        'fb': actual['fb'] / adj['Fb_prime'] if adj['Fb_prime'] > 0 else float('inf'),
        'fv': actual['fv'] / adj['Fv_prime'] if adj['Fv_prime'] > 0 else float('inf'),
        'fc': actual['fc'] / adj['Fc_prime'] if adj['Fc_prime'] > 0 else float('inf')
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
    interaction = float('inf')
    # (fc / Fc')^2 + fb / (Fb' * (1 - fc/Fce))
    # Denominator check
    if adj['Fc_prime'] > 0 and adj['Fb_prime'] > 0 and Fce > 0 and actual['fc'] < Fce:
        term1 = (actual['fc'] / adj['Fc_prime']) ** 2
        term2_denom = adj['Fb_prime'] * (1 - (actual['fc'] / Fce))
        term2 = actual['fb'] / term2_denom
        interaction = term1 + term2
    
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
        "slenderness_fail_beam": slenderness_fail_beam
    }

def get_wood_species_list():
    """Returns accessible list of species and grades for UI"""
    return WOOD_DATABASE
