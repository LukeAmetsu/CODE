import math

# --- 1. CONFIGURAÇÕES E DADOS BASE (NBR 8681 e 6118) ---
LOAD_TYPES = {
    'Peso Próprio (PP)': {'isVariable': False, 'gamma_g': 1.35},
    'Permanente (G)': {'isVariable': False, 'gamma_g': 1.40},
    'Permanente (Retração/Recalque)': {'isVariable': False, 'gamma_g': 1.20},
    'Uso Residencial (Q)': {'isVariable': True, 'psi0': 0.5, 'psi1': 0.4, 'psi2': 0.3, 'gamma_q': 1.4},
    'Uso Escritório/Loja (Q)': {'isVariable': True, 'psi0': 0.7, 'psi1': 0.4, 'psi2': 0.3, 'gamma_q': 1.4},
    'Garagem/Estacionamento (Q)': {'isVariable': True, 'psi0': 0.7, 'psi1': 0.6, 'psi2': 0.4, 'gamma_q': 1.4},
    'Vento (W)': {'isVariable': True, 'psi0': 0.6, 'psi1': 0.3, 'psi2': 0.0, 'gamma_q': 1.4},
    'Temperatura (T)': {'isVariable': True, 'psi0': 0.6, 'psi1': 0.5, 'psi2': 0.3, 'gamma_q': 1.4},
    'Líquidos (Truncado)': {'isVariable': True, 'psi0': 0.5, 'psi1': 0.4, 'psi2': 0.3, 'gamma_q': 1.4},
    'Outras Ações Variáveis (Q)': {'isVariable': True, 'psi0': 0.8, 'psi1': 0.6, 'psi2': 0.4, 'gamma_q': 1.4},
    'Guarda-Corpo (Q)': {'isVariable': True, 'psi0': 0.8, 'psi1': 0.6, 'psi2': 0.4, 'gamma_q': 1.4},
}

def calculate_combinations(user_loads):
    """
    Calculates design load combinations according to NBR 8681 / 6118.
    
    Args:
        user_loads (list): List of dicts with keys 'name', 'type', 'value', 'group'.
    """
    
    permanentes = [l for l in user_loads if not LOAD_TYPES[l['type']]['isVariable']]
    variaveis = [l for l in user_loads if LOAD_TYPES[l['type']]['isVariable']]
    
    combinations = {
        'elu': [],
        'els_rara': [],
        'els_freq': [],
        'els_qp': []
    }

    # 1. Group variables
    groups = {}
    singletons = 0
    for v in variaveis:
        g = v.get('group', '').strip()
        if not g:
            g = f"__singleton_{singletons}__"
            singletons += 1
        if g not in groups:
            groups[g] = []
        groups[g].append(v)
    
    valid_variable_sets = [[]]
    for g, items in groups.items():
        new_sets = []
        for existing_set in valid_variable_sets:
            # Ação variável favorável (fator 0.00) = não entra na combinação
            new_sets.append(existing_set)
            # Ação variável atua (pega uma do grupo)
            for v in items:
                new_sets.append(existing_set + [v])
        valid_variable_sets = new_sets
        
    if not valid_variable_sets:
        valid_variable_sets = [[]]

    # 2. Permutations for Permanent Loads (ELU)
    perm_factor_sets = [[]]
    for p in permanentes:
        new_sets = []
        gamma_g = LOAD_TYPES[p['type']]['gamma_g']
        for existing_set in perm_factor_sets:
            new_sets.append(existing_set + [{'load': p, 'factor': gamma_g}])
            new_sets.append(existing_set + [{'load': p, 'factor': 1.0}])
        perm_factor_sets = new_sets
        
    if not perm_factor_sets:
        perm_factor_sets = [[]]

    # --- 1. ELU - Combinações Normais ---
    for perm_set in perm_factor_sets:
        for var_set in valid_variable_sets:
            if var_set:
                for q_principal in var_set:
                    formula_terms_val = []
                    formula_terms_str = []
                    
                    # Permanent loads
                    for p_data in perm_set:
                        factor = p_data['factor']
                        load = p_data['load']
                        formula_terms_val.append(factor * load['value'])
                        formula_terms_str.append(f"{factor:.2f}*{load['name']}")
                    
                    # Principal variable
                    qp_type = LOAD_TYPES[q_principal['type']]
                    formula_terms_val.append(qp_type['gamma_q'] * q_principal['value'])
                    formula_terms_str.append(f"{qp_type['gamma_q']:.2f}*{q_principal['name']}")
                    
                    # Secondary variables
                    for q_sec in var_set:
                        if q_sec == q_principal:
                            continue
                        qs_type = LOAD_TYPES[q_sec['type']]
                        factor = qp_type['gamma_q'] * qs_type['psi0']
                        formula_terms_val.append(factor * q_sec['value'])
                        formula_terms_str.append(f"{factor:.2f}*{q_sec['name']}")
                    
                    combinations['elu'].append({
                        'title': f"ELU (Principal: {q_principal['name']})",
                        'formula': " + ".join(formula_terms_str),
                        'result': sum(formula_terms_val)
                    })
            else:
                formula_terms_val = []
                formula_terms_str = []
                for p_data in perm_set:
                    factor = p_data['factor']
                    load = p_data['load']
                    formula_terms_val.append(factor * load['value'])
                    formula_terms_str.append(f"{factor:.2f}*{load['name']}")
                
                if formula_terms_val:
                    combinations['elu'].append({
                        'title': 'ELU (Apenas Cargas Permanentes)',
                        'formula': " + ".join(formula_terms_str),
                        'result': sum(formula_terms_val)
                    })

    # --- 2. ELS - Combinações ---
    for var_set in valid_variable_sets:
        # ELS - Quase-Permanente
        els_qp_val = [1.0 * g['value'] for g in permanentes]
        els_qp_str = [f"1.00*{g['name']}" for g in permanentes]
        
        for q in var_set:
            psi2 = LOAD_TYPES[q['type']]['psi2']
            els_qp_val.append(psi2 * q['value'])
            els_qp_str.append(f"{psi2:.2f}*{q['name']}")
            
        combinations['els_qp'].append({
            'title': 'ELS - Quase-Permanente',
            'formula': " + ".join(els_qp_str),
            'result': sum(els_qp_val)
        })

        # ELS - Frequente & Rara
        if var_set:
            for q_principal in var_set:
                els_freq_val = [1.0 * g['value'] for g in permanentes]
                els_freq_str = [f"1.00*{g['name']}" for g in permanentes]
                
                els_rara_val = list(els_freq_val)
                els_rara_str = list(els_freq_str)
                
                # Principal variable
                qp_type = LOAD_TYPES[q_principal['type']]
                els_freq_val.append(qp_type['psi1'] * q_principal['value'])
                els_freq_str.append(f"{qp_type['psi1']:.2f}*{q_principal['name']}")
                
                els_rara_val.append(1.0 * q_principal['value'])
                els_rara_str.append(f"1.00*{q_principal['name']}")
                
                # Secondary variables
                for q_sec in var_set:
                    if q_sec == q_principal:
                        continue
                    
                    qs_type = LOAD_TYPES[q_sec['type']]
                    
                    # Frequente: psi2 * Q_sec
                    els_freq_val.append(qs_type['psi2'] * q_sec['value'])
                    els_freq_str.append(f"{qs_type['psi2']:.2f}*{q_sec['name']}")
                    
                    # Rara: psi1 * Q_sec
                    els_rara_val.append(qs_type['psi1'] * q_sec['value'])
                    els_rara_str.append(f"{qs_type['psi1']:.2f}*{q_sec['name']}")
                
                combinations['els_freq'].append({
                    'title': f"ELS - Frequente (Principal: {q_principal['name']})",
                    'formula': " + ".join(els_freq_str),
                    'result': sum(els_freq_val)
                })
                
                combinations['els_rara'].append({
                    'title': f"ELS - Rara (Principal: {q_principal['name']})",
                    'formula': " + ".join(els_rara_str),
                    'result': sum(els_rara_val)
                })

    return {'combinations': combinations}
