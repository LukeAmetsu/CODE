import math

def calculate_combinations(inputs):
    """
    Calculates load combinations based on ASCE 7 standards.
    Ported from combos.js.
    """
    # Extract inputs
    standard = inputs.get('combo_asce_standard', 'ASCE 7-16')
    jurisdiction = inputs.get('combo_jurisdiction', '')
    if jurisdiction == "NYCBC 2022":
        standard = "ASCE 7-16"
        
    method = inputs.get('combo_design_method', 'ASD')
    load_level = inputs.get('combo_input_load_level', 'Strength (LRFD)')
    unit_system = inputs.get('combo_unit_system', 'imperial')
    
    # Base Loads
    D = float(inputs.get('combo_dead_load_d', 0))
    L = float(inputs.get('combo_live_load_l', 0))
    Lr = float(inputs.get('combo_roof_live_load_lr', 0))
    R = float(inputs.get('combo_rain_load_r', 0))
    Sb = float(inputs.get('combo_balanced_snow_load_sb', 0))
    E = float(inputs.get('combo_seismic_load_e', 0))
    
    # Wind Loads (Scenarios)
    # We will build scenarios dynamically similar to JS
    
    # Scenario Config matches JS logic
    scenario_config = [
        {'key': 'windward_wall', 'title': 'Windward Wall Analysis', 's_key': 'combo_unbalanced_windward_snow_load_suw', 'wMax_key': 'combo_wind_wall_ww_max', 'wMin_key': 'combo_wind_wall_ww_min'},
        {'key': 'leeward_wall', 'title': 'Leeward Wall Analysis', 's_key': 'combo_unbalanced_leeward_snow_load_sul', 'wMax_key': 'combo_wind_wall_lw_max', 'wMin_key': 'combo_wind_wall_lw_min'},
        {'key': 'windward_roof', 'title': 'Windward Roof Analysis', 's_key': 'combo_unbalanced_windward_snow_load_suw', 'wMax_key': 'combo_wind_roof_ww_max', 'wMin_key': 'combo_wind_roof_ww_min'},
        {'key': 'leeward_roof', 'title': 'Leeward Roof Analysis', 's_key': 'combo_unbalanced_leeward_snow_load_sul', 'wMax_key': 'combo_wind_roof_lw_max', 'wMin_key': 'combo_wind_roof_lw_min'},
        {'key': 'cc_roof', 'title': 'Components & Cladding (C&C) Roof Analysis', 's_key': 'combo_balanced_snow_load_sb', 'wMax_key': 'combo_wind_cc_max', 'wMin_key': 'combo_wind_cc_min'},
        {'key': 'cc_wall', 'title': 'Components & Cladding (C&C) Wall Analysis', 's_key': 'combo_balanced_snow_load_sb', 'wMax_key': 'combo_wind_cc_wall_max', 'wMin_key': 'combo_wind_cc_wall_min'},
        {'key': 'balanced_snow', 'title': 'Balanced Snow Analysis', 's_key': 'combo_balanced_snow_load_sb', 'wMax_key': None, 'wMin_key': None},
        {'key': 'drift_surcharge', 'title': 'Drift Surcharge Load Analysis', 's_val': (float(inputs.get('combo_balanced_snow_load_sb', 0)) + float(inputs.get('combo_drift_surcharge_sd', 0))), 'wMax_key': 'combo_wind_roof_ww_max', 'wMin_key': 'combo_wind_roof_ww_min'}
    ]

    # Helper to build scenarios
    scenarios = {}
    for cfg in scenario_config:
        S_val = 0
        if 's_val' in cfg:
            S_val = cfg['s_val']
        else:
            S_val = float(inputs.get(cfg['s_key'], 0))
            
        W_max = float(inputs.get(cfg['wMax_key'], 0)) if cfg['wMax_key'] else 0
        W_min = float(inputs.get(cfg['wMin_key'], 0)) if cfg['wMin_key'] else 0
        
        scenarios[cfg['key']] = {
            'title': cfg['title'],
            'S': S_val,
            'W_max': W_max,
            'W_min': W_min
        }

    # Strategies
    if standard == 'ASCE 7-16':
        strategy = ASCE7_16_Strategy()
    elif standard == 'ASCE 7-22':
        strategy = ASCE7_22_Strategy()
    else:
        # Fallback to 16
        strategy = ASCE7_16_Strategy()
        
    results = {}
    
    # 1. Base Combos (No Wind/Snow/Seismic variations, just static gravity)
    # Actually JS calculates base combos with S=0, W=0, E=0.
    base_loads = {'D': D, 'L': L, 'Lr': Lr, 'R': R, 'S': 0, 'W': 0, 'E': 0, 'unit_system': unit_system}
    base_res = calculate_single_set(base_loads, strategy, load_level, method)
    results['base'] = base_res
    
    # 2. Scenarios
    scenario_data = {}
    for key, scen in scenarios.items():
        is_wall = 'wall' in key and 'cc' not in key # JS logic: key.includes('wall'). Wait, JS: const isWallScenario = key.includes('wall');
        # Actually checking JS code: const isWallScenario = key.includes('wall');
        # So cc_wall is also a wall scenario? Yes.
        is_wall_scenario = 'wall' in key
        
        # Scenario loads
        # Start with base
        s_loads = {
            'D': D, 'L': L, 
            'Lr': Lr, 'R': R, 
            'S': scen['S'], 
            'E': E, 
            'unit_system': unit_system
        }
        
        if is_wall_scenario:
            s_loads['Lr'] = 0
            s_loads['R'] = 0
            s_loads['S'] = 0
            
        # Calc Max Wind
        s_loads_max = s_loads.copy()
        s_loads_max['W'] = scen['W_max']
        res_max = calculate_single_set(s_loads_max, strategy, load_level, method)
        
        # Calc Min Wind
        s_loads_min = s_loads.copy()
        s_loads_min['W'] = scen['W_min']
        res_min = calculate_single_set(s_loads_min, strategy, load_level, method)
        
        scenario_data[f"{key}_wmax"] = res_max
        scenario_data[f"{key}_wmin"] = res_min
        
    results['scenarios'] = scenario_data
    
    return results

def calculate_single_set(loads, strategy, level, method):
    scope, notes = strategy.prepare_loads(loads, level)
    
    defs = strategy.lrfd_defs if method == 'LRFD' else strategy.asd_defs
    
    # Pattern load check
    live_load_threshold = 100 if scope['unit_system'] == 'imperial' else 4.79
    pattern_load_required = scope['L'] > live_load_threshold
    
    # Evaluate
    regular_res = evaluate_formulas(defs, scope)
    pattern_res = {}
    if pattern_load_required:
        pattern_scope = scope.copy()
        pattern_scope['L'] = 0.75 * scope['L']
        pattern_res = evaluate_formulas(defs, pattern_scope)
        
    return {
        'results': regular_res['vals'],
        'strings': regular_res['strings'],
        'pattern_results': pattern_res.get('vals', {}),
        'pattern_strings': pattern_res.get('strings', {}),
        'pattern_load_required': pattern_load_required,
        'adjustment_notes': notes
    }

def evaluate_formulas(defs, scope):
    vals = {}
    strings = {}
    
    for name, terms in defs.items():
        # Calculate value
        total = 0.0
        calc_parts = []
        
        for term in terms:
            factor = term.get('factor', 1.0)
            
            if 'load' in term:
                load_key = term['load']
                val = scope.get(load_key, 0)
                term_val = factor * val
                total += term_val
                
                # String building
                f_str = f"{factor}*" if factor != 1.0 else ""
                calc_parts.append(f"{f_str}{val:.2f}")
                
            elif 'maxOf' in term:
                # maxOf: list of strings (load keys) or objects {factor, load}
                candidates = []
                cand_vals = []
                
                for item in term['maxOf']:
                    if isinstance(item, str):
                        c_val = scope.get(item, 0)
                        cand_vals.append(c_val)
                        candidates.append(f"{c_val:.2f}")
                    else:
                        c_factor = item.get('factor', 1.0)
                        c_load = item.get('load')
                        c_val = scope.get(c_load, 0)
                        cand_vals.append(c_factor * c_val)
                        cf_str = f"{c_factor}*" if c_factor != 1.0 else ""
                        candidates.append(f"{cf_str}{c_val:.2f}")
                
                max_val = max(cand_vals) if cand_vals else 0
                term_val = factor * max_val
                total += term_val
                
                f_str = f"{factor}*" if factor != 1.0 else ""
                calc_parts.append(f"{f_str}max({', '.join(candidates)})")
                
        vals[name] = total
        strings[name] = " + ".join(calc_parts) if calc_parts else "0"
        
    return {'vals': vals, 'strings': strings}


class ASCE7_16_Strategy:
    def prepare_loads(self, loads, level):
        new_scope = loads.copy()
        notes = {}
        
        # ASCE 7-16 LRFD combinations (e.g., 1.0W) expect a STRENGTH-level wind load.
        # ASCE 7-16 ASD combinations (e.g., 0.6W) expect a NOMINAL-level wind load.
        # If user provides NOMINAL load, we must convert for LRFD (W_strength = W_nominal / 0.6).
        # WAIT: JS Logic:
        # if (level === 'Nominal (Service/ASD)' && newScope.W) {
        #     newScope.W = newScope.W / 0.6;
        # }
        # The logic in JS is: Pre-convert Nominal to Strength W for EVERYONE.
        # Then the formulas handle the factoring.
        # LRFD formula uses 1.0 W. So 1.0 * (W_nom/0.6) = 1.67 * W_nom. Check: ASCE 7-10/16 LRFD is 1.0W? 
        # Actually ASCE 7-10 produced strength level maps. 7-16 is also strength level maps.
        # If input is Nominal (ASD level), it's 0.6 * Strength. 
        # So Strength = Nominal / 0.6.
        # Correct.
        # ASD formulas: 0.6 W. 0.6 * (W_nom / 0.6) = 1.0 * W_nom. Correct.
        
        if level == 'Nominal (Service/ASD)' and new_scope.get('W', 0) != 0:
            new_scope['W'] = new_scope['W'] / 0.6
            notes['Wind Load'] = "Input nominal wind load (W) was divided by 0.6 to get the required strength-level wind load for ASCE 7-16 LRFD combinations."
            
        return new_scope, notes

    lrfd_defs = {
        '1': [{'factor': 1.4, 'load': 'D'}],
        '2': [{'factor': 1.2, 'load': 'D'}, {'factor': 1.6, 'load': 'L'}, {'factor': 0.5, 'maxOf': ['Lr', 'S', 'R']}],
        '3': [{'factor': 1.2, 'load': 'D'}, {'factor': 1.6, 'maxOf': ['Lr', 'S', 'R']}, {'maxOf': [{'factor': 1.0, 'load': 'L'}, {'factor': 0.5, 'load': 'W'}]}],
        '4': [{'factor': 1.2, 'load': 'D'}, {'factor': 1.0, 'load': 'W'}, {'factor': 1.0, 'load': 'L'}, {'factor': 0.5, 'maxOf': ['Lr', 'S', 'R']}],
        '5': [{'factor': 1.2, 'load': 'D'}, {'factor': 1.0, 'load': 'E'}, {'factor': 1.0, 'load': 'L'}, {'factor': 0.2, 'load': 'S'}],
        '6': [{'factor': 0.9, 'load': 'D'}, {'factor': 1.0, 'load': 'W'}],
        '7': [{'factor': 0.9, 'load': 'D'}, {'factor': 1.0, 'load': 'E'}],
    }
    
    asd_defs = {
        '1. D': [{'factor': 1.0, 'load': 'D'}],
        '2. D + L': [{'factor': 1.0, 'load': 'D'}, {'factor': 1.0, 'load': 'L'}],
        '3. D + (Lr|S|R)': [{'factor': 1.0, 'load': 'D'}, {'factor': 1.0, 'maxOf': ['Lr', 'S', 'R']}],
        '4. D + 0.75L + 0.75(Lr|S|R)': [{'factor': 1.0, 'load': 'D'}, {'factor': 0.75, 'load': 'L'}, {'factor': 0.75, 'maxOf': ['Lr', 'S', 'R']}],
        '5a. D + 0.6W': [{'factor': 1.0, 'load': 'D'}, {'factor': 0.6, 'load': 'W'}],
        '5b. D + 0.7E': [{'factor': 1.0, 'load': 'D'}, {'factor': 0.7, 'load': 'E'}],
        '6a. D + 0.75L + 0.75(0.6W) + 0.75(Lr|S|R)': [{'factor': 1.0, 'load': 'D'}, {'factor': 0.75, 'load': 'L'}, {'factor': 0.45, 'load': 'W'}, {'factor': 0.75, 'maxOf': ['Lr', 'S', 'R']}],
        '6b. D + 0.75L + 0.75(0.7E) + 0.75S': [{'factor': 1.0, 'load': 'D'}, {'factor': 0.75, 'load': 'L'}, {'factor': 0.525, 'load': 'E'}, {'factor': 0.75, 'load': 'S'}],
        '7. 0.6D + 0.6W': [{'factor': 0.6, 'load': 'D'}, {'factor': 0.6, 'load': 'W'}],
        '8. 0.6D + 0.7E': [{'factor': 0.6, 'load': 'D'}, {'factor': 0.7, 'load': 'E'}]
    }

class ASCE7_22_Strategy:
    def prepare_loads(self, loads, level):
        # All formulas in ASCE 7-22 LRFD and ASD use nominal-level loads directly with factors?
        # Wait, JS says: "All formulas in ASCE 7-22 LRFD and ASD use nominal-level loads directly... No pre-adjustment".
        # This implies ASCE 7-22 maps are maybe different or the factors are adjusted.
        # Actually ASCE 7-22 uses Return Periods for everything.
        # But let's follow JS logic 1:1.
        return loads.copy(), {}

    lrfd_defs = {
        '1': [{'factor': 1.4, 'load': 'D'}],
        '2': [{'factor': 1.2, 'load': 'D'}, {'factor': 1.6, 'load': 'L'}, {'factor': 0.5, 'maxOf': ['Lr', 'S', 'R']}],
        '3a': [{'factor': 1.2, 'load': 'D'}, {'factor': 1.6, 'maxOf': ['Lr', 'R']}, {'maxOf': [{'factor': 1.0, 'load': 'L'}, {'factor': 0.5, 'load': 'W'}]}],
        '3b': [{'factor': 1.2, 'load': 'D'}, {'factor': 1.0, 'load': 'S'}, {'maxOf': [{'factor': 1.0, 'load': 'L'}, {'factor': 0.5, 'load': 'W'}]}],
        '4': [{'factor': 1.2, 'load': 'D'}, {'factor': 1.6, 'load': 'W'}, {'factor': 1.0, 'load': 'L'}, {'factor': 0.5, 'maxOf': ['Lr', 'S', 'R']}],
        '5': [{'factor': 1.2, 'load': 'D'}, {'factor': 1.0, 'load': 'E'}, {'factor': 1.0, 'load': 'L'}, {'factor': 1.0, 'load': 'S'}],
        '6': [{'factor': 0.9, 'load': 'D'}, {'factor': 1.6, 'load': 'W'}],
        '7': [{'factor': 0.9, 'load': 'D'}, {'factor': 1.0, 'load': 'E'}],
    }
    
    asd_defs = {
        '1. D': [{'factor': 1.0, 'load': 'D'}],
        '2. D + L': [{'factor': 1.0, 'load': 'D'}, {'factor': 1.0, 'load': 'L'}],
        '3. D + (Lr|0.7S|R)': [{'factor': 1.0, 'load': 'D'}, {'maxOf': [{'load': 'Lr'}, {'factor': 0.7, 'load': 'S'}, {'load': 'R'}]}],
        '4. D + 0.75L + 0.75(Lr|0.7S|R)': [{'factor': 1.0, 'load': 'D'}, {'factor': 0.75, 'load': 'L'}, {'factor': 0.75, 'maxOf': [{'load': 'Lr'}, {'factor': 0.7, 'load': 'S'}, {'load': 'R'}]}],
        '5a. D + W': [{'factor': 1.0, 'load': 'D'}, {'factor': 1.0, 'load': 'W'}],
        '5b. D + 0.7E': [{'factor': 1.0, 'load': 'D'}, {'factor': 0.7, 'load': 'E'}],
        '6. D + 0.75L + 0.75W + 0.75(Lr|0.7S|R)': [{'factor': 1.0, 'load': 'D'}, {'factor': 0.75, 'load': 'L'}, {'factor': 0.75, 'load': 'W'}, {'factor': 0.75, 'maxOf': [{'load': 'Lr'}, {'factor': 0.7, 'load': 'S'}, {'load': 'R'}]}],
        '7. 0.6D + W': [{'factor': 0.6, 'load': 'D'}, {'factor': 1.0, 'load': 'W'}],
        '8. 0.6D + 0.7E': [{'factor': 0.6, 'load': 'D'}, {'factor': 0.7, 'load': 'E'}]
    }
