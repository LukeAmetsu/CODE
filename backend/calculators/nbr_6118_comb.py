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
}

def calculate_combinations(user_loads):
    """
    Calculates design load combinations according to NBR 8681 / 6118.
    
    Args:
        user_loads (list): List of dicts with keys 'name', 'type', 'value'.
                           Example: [{'name': 'G1', 'type': 'Peso Próprio (PP)', 'value': 10}]
    
    Returns:
        dict: Dictionary containing lists of combinations for 'elu', 'els_rara', 'els_freq', 'els_qp'.
    """
    
    # Filter loads
    permanentes = [l for l in user_loads if not LOAD_TYPES[l['type']]['isVariable']]
    variaveis = [l for l in user_loads if LOAD_TYPES[l['type']]['isVariable']]
    
    combinations = {
        'elu': [],
        'els_rara': [],
        'els_freq': [],
        'els_qp': []
    }

    # --- 1. ELU - Combinações Normais ---
    if variaveis:
        for index, q_principal in enumerate(variaveis):
            formula_terms_val = []
            formula_terms_str = []
            
            # Add permanent loads
            for g in permanentes:
                factor = LOAD_TYPES[g['type']]['gamma_g']
                formula_terms_val.append(factor * g['value'])
                formula_terms_str.append(f"{factor:.2f}*{g['name']}")
            
            # Add principal variable load
            qp_type = LOAD_TYPES[q_principal['type']]
            formula_terms_val.append(qp_type['gamma_q'] * q_principal['value'])
            formula_terms_str.append(f"{qp_type['gamma_q']:.2f}*{q_principal['name']}")
            
            # Add other variable loads
            for sec_index, q_sec in enumerate(variaveis):
                if index == sec_index:
                    continue # Skip the principal one
                
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
        # Only permanent loads
        formula_terms_val = [LOAD_TYPES[g['type']]['gamma_g'] * g['value'] for g in permanentes]
        formula_terms_str = [f"{LOAD_TYPES[g['type']]['gamma_g']:.2f}*{g['name']}" for g in permanentes]
        
        combinations['elu'].append({
            'title': 'ELU (Apenas Cargas Permanentes)',
            'formula': " + ".join(formula_terms_str),
            'result': sum(formula_terms_val)
        })

    # --- 2. ELS - Combinações ---
    
    # ELS - Quase-Permanente (one combination)
    els_qp_val = [1.0 * g['value'] for g in permanentes]
    els_qp_str = [f"1.00*{g['name']}" for g in permanentes]
    
    for q in variaveis:
        psi2 = LOAD_TYPES[q['type']]['psi2']
        els_qp_val.append(psi2 * q['value'])
        els_qp_str.append(f"{psi2:.2f}*{q['name']}")
        
    combinations['els_qp'].append({
        'title': 'ELS - Quase-Permanente',
        'formula': " + ".join(els_qp_str),
        'result': sum(els_qp_val)
    })

    # ELS - Frequente & Rara (iterate through each variable load as principal)
    if variaveis:
        for index, q_principal in enumerate(variaveis):
            # Init with permanent loads
            els_freq_val = [1.0 * g['value'] for g in permanentes]
            els_freq_str = [f"1.00*{g['name']}" for g in permanentes]
            
            els_rara_val = list(els_freq_val)
            els_rara_str = list(els_freq_str)
            
            # Add principal variable load
            # Frequente: psi1 * Q
            # Rara: 1.0 * Q
            q_type = LOAD_TYPES[q_principal['type']]
            
            els_freq_val.append(q_type['psi1'] * q_principal['value'])
            els_freq_str.append(f"{q_type['psi1']:.2f}*{q_principal['name']}")
            
            els_rara_val.append(1.0 * q_principal['value'])
            els_rara_str.append(f"1.00*{q_principal['name']}")
            
            # Add other variable loads
            for sec_index, q_sec in enumerate(variaveis):
                if index == sec_index:
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
