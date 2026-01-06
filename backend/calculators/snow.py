import math

def calculate_slope_factor(slope_deg, is_slippery, Ct, standard):
    if standard == "ASCE 7-22":
        if is_slippery:
            if slope_deg < 5: return 1.0
            if slope_deg > 70: return 0.0
            return 1.0 - (slope_deg - 5) / 65
        else:
            if slope_deg < 30: return 1.0
            if slope_deg > 70: return 0.0
            return 1.0 - (slope_deg - 30) / 40
    else: # ASCE 7-16
        if Ct <= 1.0: # Warm Roof
            if is_slippery:
                if slope_deg < 5: return 1.0
                if slope_deg > 70: return 0.0
                return 1.0 - (slope_deg - 5) / 65
            else:
                if slope_deg < 30: return 1.0
                if slope_deg > 70: return 0.0
                return 1.0 - (slope_deg - 30) / 40
        else: # Cold Roof
            if is_slippery:
                if slope_deg < 15: return 1.0
                if slope_deg > 70: return 0.0
                return 1.0 - (slope_deg - 15) / 55
            else:
                if slope_deg < 45: return 1.0
                if slope_deg > 70: return 0.0
                return 1.0 - (slope_deg - 45) / 25

def get_snow_factors(risk, exposure, thermal, surface_roughness):
    is_map = {"I": 0.8, "II": 1.0, "III": 1.1, "IV": 1.2}
    Is = is_map.get(risk, 1.0)
    
    ce_map = {
        "B": {"Fully Exposed": 0.9, "Partially Exposed": 1.0, "Sheltered": 1.2},
        "C": {"Fully Exposed": 0.9, "Partially Exposed": 1.0, "Sheltered": 1.1},
        "D": {"Fully Exposed": 0.8, "Partially Exposed": 0.9, "Sheltered": 1.0},
        "Above treeline (windswept)": {"Fully Exposed": 0.7, "Partially Exposed": 0.8},
        "Alaska (no trees)": {"Fully Exposed": 0.7, "Partially Exposed": 0.8}
    }
    
    # Get nested Ce value, default to 1.0
    Ce = 1.0
    if surface_roughness in ce_map:
        Ce = ce_map[surface_roughness].get(exposure, 1.0)
        
    ct_map = {"Heated Structure": 1.0, "Unheated Structure": 1.2}
    Ct = ct_map.get(thermal, 1.0)
    
    return Is, Ce, Ct

def calculate_snow_density(pg):
    if not math.isfinite(pg) or pg <= 0:
        return 13.0
    gamma = 0.13 * pg + 14
    return min(gamma, 30.0)

def calculate_unbalanced_loads(ps_balanced, pg, slope_deg, standard, W, is_simply_supported, W2, gamma, Is, roof_type):
    slope_ratio_val = math.tan(math.radians(slope_deg))
    min_slope_ratio = 0.5 / 12
    mid_slope_ratio = 7 / 12
    
    if roof_type == 'monoslope':
        slope_ratio_3_12 = 3 / 12
        if slope_ratio_val < min_slope_ratio:
            return {'applicable': False, 'reason': "Slope < 0.5:12, unbalanced not required for monoslope."}
        
        if slope_ratio_val <= slope_ratio_3_12:
             # Case (a)
             return {
                 'applicable': True,
                 'case': 'Monoslope: 0.5:12 < Slope <= 3:12',
                 'windward_nominal': ps_balanced,
                 'leeward_nominal': ps_balanced,
                 'surcharge_magnitude': Is * pg,
                 'surcharge_width': W / 2
             }
        else:
            # Case (b)
            return {
                'applicable': True,
                'case': 'Monoslope: Slope > 3:12',
                'windward_nominal': 0.5 * ps_balanced,
                'leeward_nominal': 2.0 * ps_balanced
            }

    if slope_ratio_val < min_slope_ratio:
        return {'applicable': False, 'reason': f"Slope < 0.5:12, unbalanced not required per {standard}."}

    S = 1 / slope_ratio_val if slope_ratio_val > 0 else 0
    
    if slope_ratio_val > mid_slope_ratio:
        if S <= 0 or gamma <= 0 or pg <= 0 or Is <= 0:
             return {'applicable': False, 'reason': 'Invalid inputs for surcharge.'}
             
        hd = 0
        if standard == "ASCE 7-22":
            hd = 1.5 * ((math.pow(pg, 0.74) * math.pow(W, 0.7) * math.pow(W2, 1.7)) / gamma)
        else: # 7-16
            lu_for_hd = W
            hd_calc = (0.43 * math.pow(lu_for_hd, 1/3) * math.pow(pg + 10, 0.25)) - 1.5
            hd = max(0, hd_calc) / math.sqrt(Is) if Is > 0 else 0
            
        surcharge_magnitude = (hd * gamma) / math.sqrt(S) if (S > 0 and gamma > 0) else 0
        surcharge_width = (8/3) * hd * math.sqrt(S)
        
        return {
            'applicable': True,
            'case': 'C: Slope > 7:12',
            'windward_nominal': 0.0,
            'leeward_nominal': ps_balanced,
            'surcharge_magnitude': surcharge_magnitude,
            'surcharge_width': surcharge_width,
            'hd_unbalanced': hd,
            'S_val': S
        }

    return {
        'applicable': True,
        'case': 'B: 0.5:12 < Slope <= 7:12',
        'windward_nominal': 0.3 * ps_balanced,
        'leeward_nominal': ps_balanced
    }

def calculate_drift_loads(pg, lu, hc, pf, standard, W2, lower_roof_length_ll, Is):
    gamma = calculate_snow_density(pg)
    hb = pf / gamma if gamma > 0 else 0
    
    if hc <= 0 or hb <= 0 or (hc / hb) <= 0.2:
        return {'applicable': False, 'reason': 'Drift surcharge not required per hc/hb <= 0.2.'}
        
    hd_final = 0
    w_final = 0
    
    if standard == "ASCE 7-22":
         def calc_hd_7_22(length):
             return 1.5 * ((math.pow(pg, 0.74) * math.pow(length, 0.7) * math.pow(W2, 1.7)) / gamma) if (gamma > 0 and W2 >= 0 and pg > 0 and length > 0) else 0
             
         hd_leeward = min(calc_hd_7_22(lu), 0.6 * lower_roof_length_ll)
         w_leeward = 4 * hd_leeward if hd_leeward <= hc else ( (4 * math.pow(hd_leeward, 2)) / hc if hc > 0 else 0)
         w_leeward = min(w_leeward, 8 * hc)
         
         hd_windward_initial = calc_hd_7_22(lower_roof_length_ll)
         hd_windward = 0.75 * hd_windward_initial
         w_windward = 6 * hd_windward_initial
         
         hd_final = max(hd_leeward, hd_windward)
         w_final = w_leeward if hd_leeward >= hd_windward else w_windward

    else: # 7-16
         def calc_hd_7_16(length, pg_val, is_val):
             return max(0, (0.43 * math.pow(length, 1/3) * math.pow(pg_val + 10, 0.25)) - 1.5) / math.sqrt(is_val) if (pg_val >= 0 and length > 0 and is_val > 0) else 0
             
         hd_leeward = min(calc_hd_7_16(lu, pg, Is), 0.6 * lower_roof_length_ll)
         hd_windward = 0.75 * calc_hd_7_16(lower_roof_length_ll, pg, Is) # Wait, is this correct for 7-16 windward? 
         # JS: let hd_windward = 0.75 * calc_hd_7_16(lower_roof_length_ll, pg, Is);
         # Yes.
         
         hd_controlling = max(hd_leeward, hd_windward)
         hd_final = hd_controlling
         
         w_calc = 4 * hd_controlling if hd_controlling <= hc else ( (4 * math.pow(hd_controlling, 2)) / hc if hc > 0 else 0)
         w_final = min(w_calc, 8 * hc)

    pd_nominal = hd_final * gamma
    return {
        'applicable': True, 'gamma': gamma, 'hb': hb, 'hd': hd_final, 'w': w_final, 'pd_nominal': pd_nominal
    }

def calculate_sliding_snow_load(pf, W, Cs, is_slippery, unit_system):
    if not is_slippery or Cs == 1.0:
        return {'applicable': False, 'reason': "Sliding snow only for slippery roofs where Cs < 1.0."}
        
    if W <= 0:
        return {'applicable': False, 'reason': "Eave-to-ridge distance (W) must be > 0."}
        
    Ws = 0.4 * pf * W
    distribution_width = 15.0 if unit_system == 'imperial' else 4.6
    ps_sliding = Ws / distribution_width if distribution_width > 0 else 0
    
    return {'applicable': True, 'Ws': Ws, 'distribution_width': distribution_width, 'ps_sliding': ps_sliding}
    

def calculate_snow_load(inputs):
    """
    Calculates snow loads.
    Ported from snow.js.
    """
    # Defaults and Inputs
    pg = float(inputs.get('snow_ground_snow_load', 0))
    if pg == 0:
        pg = 25
        
    warnings = []
    
    jurisdiction = inputs.get('snow_jurisdiction', '')
    if jurisdiction == "NYCBC 2022":
        nycbc_min = 25
        if pg < nycbc_min:
            warnings.append(f"Input ground snow load ({pg} psf) is less than NYCBC minimum ({nycbc_min} psf).")
            
    risk = inputs.get('snow_risk_category', 'II')
    exposure = inputs.get('snow_exposure_condition', 'Partially Exposed')
    thermal = inputs.get('snow_thermal_condition', 'Heated Structure')
    roughness = inputs.get('snow_surface_roughness_category', 'B')
    
    Is, Ce, Ct = get_snow_factors(risk, exposure, thermal, roughness)
    
    slope_deg = float(inputs.get('snow_roof_slope_degrees', 0))
    is_slippery = inputs.get('snow_is_roof_slippery', False)
    standard = inputs.get('snow_asce_standard', 'ASCE 7-16')
    
    Cs = calculate_slope_factor(slope_deg, is_slippery, Ct, standard)
    pf = 0.7 * Ce * Ct * Is * pg
    ps_calculated = Cs * pf
    
    ps_min_asce7 = 0
    is_low_slope = slope_deg < 15
    if is_low_slope:
        if pg <= 20:
             ps_min_asce7 = pg * Is
        else:
             ps_min_asce7 = 20 * Is
             
    ps_asce7 = max(ps_calculated, ps_min_asce7) if is_low_slope else ps_calculated
    
    ps_balanced = ps_asce7
    is_nycbc_min_governed = False
    nycbc_min_roof = float(inputs.get('snow_nycbc_minimum_roof_snow_load', 0))
    if jurisdiction == "NYCBC 2022" and ps_balanced < nycbc_min_roof:
         ps_balanced = nycbc_min_roof
         is_nycbc_min_governed = True
         
    # Optional Calculations
    unbalanced_results = {}
    if inputs.get('snow_calculate_unbalanced', 'No') == 'Yes':
        gamma = calculate_snow_density(pg)
        unbalanced_results = calculate_unbalanced_loads(
            ps_balanced, pg, slope_deg, standard,
            float(inputs.get('snow_eave_to_ridge_distance_W', 0)),
            inputs.get('snow_is_simply_supported_prismatic', False),
            float(inputs.get('snow_winter_wind_parameter_W2', 0)),
            gamma, Is, inputs.get('snow_roof_type', 'gable')
        )
        
    drift_results = {}
    if inputs.get('snow_calculate_drift', 'No') == 'Yes':
        drift_results = calculate_drift_loads(
            pg, float(inputs.get('snow_upper_roof_length_lu', 0)),
            float(inputs.get('snow_height_difference_hc', 0)),
            pf, standard, float(inputs.get('snow_winter_wind_parameter_W2', 0)),
            float(inputs.get('snow_lower_roof_length_ll', 0)), Is
        )
        
    sliding_results = {}
    if inputs.get('snow_calculate_sliding', 'No') == 'Yes':
        sliding_results = calculate_sliding_snow_load(
            pf, float(inputs.get('snow_eave_to_ridge_distance_W', 0)),
            Cs, is_slippery, inputs.get('snow_unit_system', 'imperial')
        )
        
    partial_results = {}
    if inputs.get('snow_is_simply_supported_prismatic', 'Yes') == 'No':
        partial_results = {
            'applicable': True,
            'load_on_adjacent_span': 0.5 * ps_balanced,
            'note': "Check 0.5 balanced load on adjacent span."
        }
        
    return {
        'inputs': inputs,
        'intermediate': {
            'Is': Is, 'Ce': Ce, 'Ct': Ct, 'Cs': Cs, 'pf': pf,
            'ps_asce7': ps_asce7, 'ps_min_asce7': ps_min_asce7,
            'is_low_slope': is_low_slope, 'asce7_min_governed': (ps_asce7 > ps_calculated),
            'ps_calculated': ps_calculated
        },
        'results': {'ps_balanced_nominal': ps_balanced},
        'unbalanced': unbalanced_results,
        'drift': drift_results,
        'sliding': sliding_results,
        'partial': partial_results,
        'is_nycbc_min_governed': is_nycbc_min_governed,
        'warnings': warnings,
        'success': True
    }
