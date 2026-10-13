"""
Motor de Cálculo de Ações Sísmicas segundo a ABNT NBR 15421:2006
(Projeto de estruturas resistentes a sismos - Procedimento)

Implementa:
- Zonas Sísmicas do Brasil (Zonas 0 a 4) e aceleração de pico ag
- Classes de Terreno / Solos A a E
- Coeficientes de amplificação do solo Fa e Fv (Tabelas 3 e 4)
- Espectro de resposta elástico Sa(T)
- Período fundamental estimado Ta (Item 9.2.1)
- Força Cortante Basal Equivalente V0 (Método das Forças Equivalentes)
- Coeficiente de modificação de resposta R e Fator de Importância I
- Distribuição vertical de forças sísmicas nos andares Fx
"""

import math
from typing import Dict, List, Any, Optional

# Zonas Sísmicas Brasileiras (NBR 15421 - Figura 1)
ZONAS_SISMICAS_NBR = {
    '0': {'ag': 0.025, 'nome': 'Zona 0 (ag ≤ 0.025g) - Maior parte do território nacional (Sul, Sudeste, Centro-Oeste)'},
    '1': {'ag': 0.050, 'nome': 'Zona 1 (0.025g < ag ≤ 0.050g) - Faixas de transição e Centro-Norte'},
    '2': {'ag': 0.100, 'nome': 'Zona 2 (0.050g < ag ≤ 0.100g) - Região Sismogênica Nordeste (CE, RN, Bacia Potiguar)'},
    '3': {'ag': 0.150, 'nome': 'Zona 3 (0.100g < ag ≤ 0.150g) - Noroeste do Amazonas e Transição Acre'},
    '4': {'ag': 0.200, 'nome': 'Zona 4 (ag > 0.150g) - Região Oeste do Acre (Fronteira Andina)'},
}

# Tabela 3 - Coeficiente de Solo Fa (Períodos curtos)
# ag: [0.10, 0.20, 0.30, 0.40, 0.50]
TABELA_3_FA = {
    'A': [0.8, 0.8, 0.8, 0.8, 0.8],
    'B': [1.0, 1.0, 1.0, 1.0, 1.0],
    'C': [1.2, 1.2, 1.1, 1.0, 1.0],
    'D': [1.6, 1.4, 1.2, 1.1, 1.0],
    'E': [2.5, 1.7, 1.2, 0.9, 0.9],
}

# Tabela 4 - Coeficiente de Solo Fv (Períodos longos)
TABELA_4_FV = {
    'A': [0.8, 0.8, 0.8, 0.8, 0.8],
    'B': [1.0, 1.0, 1.0, 1.0, 1.0],
    'C': [1.7, 1.6, 1.5, 1.4, 1.3],
    'D': [2.4, 2.0, 1.8, 1.6, 1.5],
    'E': [3.5, 3.2, 2.8, 2.4, 2.4],
}

AG_GRID = [0.10, 0.20, 0.30, 0.40, 0.50]

# Sistemas estruturais e fatores R típicos (NBR 15421 - Tabela 5)
SISTEMAS_R = {
    'portico_concreto_especial': {'R': 7.0, 'desc': 'Pórticos espaciais de concreto armado com detalhamento especial'},
    'portico_concreto_intermediario': {'R': 4.5, 'desc': 'Pórticos espaciais de concreto armado intermediários'},
    'portico_concreto_ordinario': {'R': 3.0, 'desc': 'Pórticos de concreto armado com detalhamento ordinário/convencional'},
    'paredes_cisalhamento_concreto': {'R': 5.0, 'desc': 'Paredes de concreto armado (muros de cisalhamento especiais)'},
    'paredes_cisalhamento_ordinarias': {'R': 4.0, 'desc': 'Paredes de concreto armado ordinárias'},
    'portico_aco_especial': {'R': 7.0, 'desc': 'Pórticos espaciais de aço com ligações resistentes a momento especiais'},
    'portico_aco_intermediario': {'R': 4.5, 'desc': 'Pórticos de aço intermediários'},
    'portico_aco_ordinario': {'R': 3.5, 'desc': 'Pórticos de aço ordinários'},
    'contraventamento_aco_concentrico': {'R': 5.0, 'desc': 'Contraventamentos concêntricos em aço especiais'},
    'alvenaria_estrutural_armada': {'R': 2.5, 'desc': 'Paredes de alvenaria estrutural armada'},
    'alvenaria_nao_armada': {'R': 1.5, 'desc': 'Alvenaria não armada / sistemas não detalhados'},
}

def interpolate_site_factor(soil_class: str, ag: float, table: Dict[str, List[float]]) -> float:
    """Interpola os coeficientes de solo Fa ou Fv."""
    vals = table.get(soil_class.upper(), table['D'])
    if ag <= AG_GRID[0]:
        return vals[0]
    if ag >= AG_GRID[-1]:
        return vals[-1]
    for i in range(len(AG_GRID) - 1):
        if AG_GRID[i] <= ag <= AG_GRID[i+1]:
            t = (ag - AG_GRID[i]) / (AG_GRID[i+1] - AG_GRID[i])
            return vals[i] + t * (vals[i+1] - vals[i])
    return vals[0]

def calculate_spectral_acceleration(T: float, ag: float, Fa: float, Fv: float) -> float:
    """Calcula a aceleração espectral elástica Sa(T) em unidades de g."""
    if Fa <= 0: Fa = 1.0
    if Fv <= 0: Fv = 1.0
    
    T_s = Fv / Fa
    T_0 = 0.2 * T_s
    
    if T < T_0:
        if T_0 > 0:
            return ag * Fa * (1.0 + 1.5 * (T / T_0))
        return 2.5 * ag * Fa
    elif T <= T_s:
        return 2.5 * ag * Fa
    else:
        return (2.5 * ag * Fv) / T

def calculate_approximate_period(h_n: float, system_type: str = 'concrete_frame') -> float:
    """Calcula o período fundamental aproximado Ta = Ct * (hn)^x (Item 9.2.1)."""
    if 'steel' in system_type:
        Ct, x = 0.0724, 0.8
    elif 'concrete' in system_type:
        Ct, x = 0.0466, 0.9
    else:
        Ct, x = 0.0488, 0.75
    return Ct * (h_n ** x)

def calculate_nbr15421_seismic(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculadora Completa de Sismo conforme NBR 15421:2006.
    """
    # 1. Parâmetros de Entrada
    zona = str(inputs.get('seismic_zone', '1'))
    custom_ag = inputs.get('custom_ag')
    if custom_ag is not None and float(custom_ag) > 0:
        ag = float(custom_ag)
    else:
        ag = ZONAS_SISMICAS_NBR.get(zona, ZONAS_SISMICAS_NBR['1'])['ag']
        
    soil_class = str(inputs.get('soil_class', 'D')).upper()
    system_key = str(inputs.get('structural_system', 'portico_concreto_intermediario'))
    
    r_factor_val = inputs.get('r_factor')
    if r_factor_val is not None and float(r_factor_val) > 0:
        R = float(r_factor_val)
    else:
        R = SISTEMAS_R.get(system_key, SISTEMAS_R['portico_concreto_intermediario'])['R']
        
    importance_category = str(inputs.get('importance_category', 'II'))
    # Fator de Importância I (Item 6.3)
    # Categoria I: Instalações temporárias (0.80)
    # Categoria II: Comuns (1.00)
    # Categoria III: Ocupação substancial / Escolas (1.25)
    # Categoria IV: Essenciais / Hospitais / Segurança pública (1.50)
    I_factors = {'I': 0.80, 'II': 1.00, 'III': 1.25, 'IV': 1.50}
    I = I_factors.get(importance_category, 1.00)
    
    hn = float(inputs.get('total_height', 30.0)) # Altura total em m
    floors = int(inputs.get('num_floors', 10))
    total_weight = float(inputs.get('total_weight', 15000.0)) # Peso sísmico total W em kN
    
    user_period = inputs.get('user_period')
    if user_period is not None and float(user_period) > 0:
        T_a = float(user_period)
    else:
        T_a = calculate_approximate_period(hn, system_key)
        
    # 2. Coeficientes de Solo Fa e Fv
    Fa = interpolate_site_factor(soil_class, ag, TABELA_3_FA)
    Fv = interpolate_site_factor(soil_class, ag, TABELA_4_FV)
    
    Ts = Fv / Fa
    T0 = 0.2 * Ts
    
    # 3. Aceleração espectral no período Ta
    Sa_Ta = calculate_spectral_acceleration(T_a, ag, Fa, Fv)
    
    # Coeficiente sísmico Cs
    Cs = (Sa_Ta * I) / R
    Cs_min = 0.01
    Cs_final = max(Cs_min, Cs)
    
    # Cortante Basal V0
    V0_kn = Cs_final * total_weight
    
    # 4. Distribuição vertical por pavimento
    levels = []
    weight_per_floor = total_weight / max(1, floors)
    floor_height = hn / max(1, floors)
    
    # Expoente k de distribuição vertical
    if T_a <= 0.5:
        k = 1.0
    elif T_a >= 2.5:
        k = 2.0
    else:
        k = 1.0 + (T_a - 0.5) / 2.0
        
    sum_w_h_k = 0.0
    floor_props = []
    for fl in range(1, floors + 1):
        z = fl * floor_height
        w = weight_per_floor
        term = w * (z ** k)
        sum_w_h_k += term
        floor_props.append({'floor': fl, 'z': z, 'w': w, 'term': term})
        
    cumulative_shear = 0.0
    for fl_data in reversed(floor_props):
        cvx = fl_data['term'] / sum_w_h_k if sum_w_h_k > 0 else (1.0 / floors)
        fx = cvx * V0_kn
        cumulative_shear += fx
        levels.append({
            'floor': fl_data['floor'],
            'height_m': round(fl_data['z'], 2),
            'weight_kn': round(fl_data['w'], 1),
            'cvx': round(cvx, 4),
            'lateral_force_kn': round(fx, 2),
            'story_shear_kn': round(cumulative_shear, 2),
            'overturning_moment_knm': round(fx * fl_data['z'], 2)
        })
        
    levels.reverse() # Ordenar do 1º pavimento ao topo
    
    # 5. Espectro de Resposta para Plot (Curva Sa x T)
    spectrum_curve = []
    periods_to_eval = [round(0.02 * i, 3) for i in range(1, 201)] # 0.02s até 4.0s
    for t_val in periods_to_eval:
        sa_elastic = calculate_spectral_acceleration(t_val, ag, Fa, Fv)
        sa_design = (sa_elastic * I) / R
        spectrum_curve.append({
            'T': t_val,
            'Sa_elastic': round(sa_elastic, 4),
            'Sa_design': round(max(Cs_min, sa_design), 4)
        })
        
    # Dispensa de análise sísmica
    # NBR 15421 Item 1.1: Em Zona 0 para categorias ordinárias, verificação dispensada
    dispensado = (zona == '0' and ag <= 0.025 and importance_category in ['I', 'II'])
    
    return {
        'status': 'success',
        'standard': 'ABNT NBR 15421:2006',
        'parameters': {
            'seismic_zone': zona,
            'ag': round(ag, 3),
            'soil_class': soil_class,
            'Fa': round(Fa, 3),
            'Fv': round(Fv, 3),
            'T0': round(T0, 3),
            'Ts': round(Ts, 3),
            'R': round(R, 2),
            'I': round(I, 2),
            'Ta': round(T_a, 3),
            'k_exponent': round(k, 3),
            'total_height': hn,
            'num_floors': floors,
            'total_weight_kn': total_weight,
            'dispensado_nbr': dispensado
        },
        'results': {
            'Sa_Ta_g': round(Sa_Ta, 4),
            'Cs_calculated': round(Cs, 4),
            'Cs_design': round(Cs_final, 4),
            'base_shear_kn': round(V0_kn, 2),
            'base_moment_knm': round(sum(lvl['overturning_moment_knm'] for lvl in levels), 2)
        },
        'levels': levels,
        'spectrum': spectrum_curve
    }
