"""
Motor de Cálculo de Cargas Pluviais, Empoçamento & Cargas Hidráulicas
conforme ABNT NBR 6120:2019 e NBR 10844

Implementa:
- Intensidade pluviométrica de projeto I (mm/h) e vazão pluvial de contribuição Q
- Nível estático ds e lâmina hidráulica sobre vertedor/ralo dh (Francis / Orifício)
- Carga nominal de empoçamento d'água pr (kN/m²)
- Verificação de instabilidade por empoçamento progressivo (Ponding Instability)
- Sobrecarga mínima de utilização de cobertura conforme NBR 6120
"""

import math
from typing import Dict, List, Any, Optional

# Capitais brasileiras e intensidades pluviométricas de projeto (NBR 10844 - Tabela de Chuvas Intensas, TR=100 anos, dur=5min a 15min)
INTENSIDADES_CHUVA_BR = {
    'São Paulo (SP)': 180.0,
    'Rio de Janeiro (RJ)': 195.0,
    'Belo Horizonte (MG)': 175.0,
    'Curitiba (PR)': 160.0,
    'Porto Alegre (RS)': 170.0,
    'Florianópolis (SC)': 175.0,
    'Brasília (DF)': 165.0,
    'Goiânia (GO)': 170.0,
    'Salvador (BA)': 185.0,
    'Recife (PE)': 190.0,
    'Fortaleza (CE)': 180.0,
    'Belém (PA)': 210.0,
    'Manaus (AM)': 200.0,
    'Cuiabá (MT)': 180.0,
    'Campo Grande (MS)': 175.0,
}

def calculate_hydraulic_head_francis(Q_m3s: float, width_m: float) -> float:
    """Calcula a lâmina hidráulica dh sobre vertedor retangular livre (Fórmula de Francis). Retorna em mm."""
    if width_m <= 0 or Q_m3s <= 0:
        return 0.0
    # Q = 1.838 * b * (dh)^1.5  =>  dh = (Q / (1.838 * b))^(2/3)
    dh_m = math.pow(Q_m3s / (1.838 * width_m), 2.0 / 3.0)
    return dh_m * 1000.0 # em mm

def calculate_hydraulic_head_orifice(Q_m3s: float, diam_m: float, cd: float = 0.60) -> float:
    """Calcula a lâmina hidráulica dh sobre ralo/orifício afogado. Retorna em mm."""
    if diam_m <= 0 or Q_m3s <= 0:
        return 0.0
    area = math.pi * (diam_m ** 2) / 4.0
    g = 9.81
    # Q = Cd * A * sqrt(2*g*dh) => dh = Q^2 / (2 * g * (Cd * A)^2)
    denom = 2.0 * g * ((cd * area) ** 2)
    if denom <= 0:
        return 0.0
    dh_m = (Q_m3s ** 2) / denom
    return dh_m * 1000.0 # em mm

def calculate_nbr6120_rain(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculadora Completa de Chuva e Empoçamento conforme NBR 6120:2019 e NBR 10844.
    """
    # 1. Parâmetros de Entrada
    city_preset = inputs.get('city_preset', '')
    if city_preset in INTENSIDADES_CHUVA_BR:
        i_mm_h = INTENSIDADES_CHUVA_BR[city_preset]
    else:
        i_mm_h = float(inputs.get('intensity_mm_h', 180.0))
        
    trib_area_m2 = float(inputs.get('tributary_area_m2', 200.0))
    ds_mm = float(inputs.get('static_head_ds_mm', 50.0)) # Altura da soleira do extravasor
    drain_type = inputs.get('drain_type', 'scupper') # 'scupper' (vertedor) ou 'drain' (ralo)
    scupper_width_mm = float(inputs.get('scupper_width_mm', 300.0))
    drain_diam_mm = float(inputs.get('drain_diam_mm', 150.0))
    manual_dh = inputs.get('manual_dh_mm')
    
    # 2. Vazão pluvial
    # Q (m³/s) = (I * A) / (3600 * 1000)
    Q_m3s = (i_mm_h * trib_area_m2) / (3.6e6)
    Q_L_min = Q_m3s * 60000.0
    
    # 3. Lâmina hidráulica dh
    if manual_dh is not None and float(manual_dh) > 0:
        dh_mm = float(manual_dh)
    else:
        if drain_type == 'scupper':
            dh_mm = calculate_hydraulic_head_francis(Q_m3s, scupper_width_mm / 1000.0)
        else:
            dh_mm = calculate_hydraulic_head_orifice(Q_m3s, drain_diam_mm / 1000.0)
            
    # Lâmina total de água hp
    hp_total_mm = ds_mm + dh_mm
    
    # Carga de chuva nominal (kN/m²)
    # gamma_w = 10 kN/m³ => p = 10 * (hp / 1000) = 0.010 * hp
    p_rain_kpa = 0.010 * hp_total_mm
    
    # 4. Sobrecarga mínima de utilização da NBR 6120:2019
    # Tabela 10: Coberturas sem acesso público (apenas manutenção) = 0.25 a 0.50 kN/m²
    # Coberturas com terraço / placas solares = 1.50 a 2.00 kN/m²
    roof_usage = inputs.get('roof_usage', 'manutencao')
    if roof_usage == 'manutencao':
        q_min_kpa = 0.25
    elif roof_usage == 'placas_solares':
        q_min_kpa = 0.50
    elif roof_usage == 'terraco':
        q_min_kpa = 1.50
    else:
        q_min_kpa = 0.50
        
    # 5. Verificação de empoçamento progressivo (Ponding Instability)
    # Se vigas forem informadas: span_L_m, spacing_s_m, I_cm4, E_gpa
    span_L_m = float(inputs.get('beam_span_m', 6.0))
    spacing_s_m = float(inputs.get('beam_spacing_m', 2.0))
    I_cm4 = float(inputs.get('beam_inertia_cm4', 2500.0))
    E_gpa = float(inputs.get('elastic_modulus_gpa', 200.0)) # Aço = 200 GPa, Concreto = ~30 GPa
    
    # Deflexão sob carga nominal de chuva
    # q_lin = p_rain_kpa * spacing_s_m (kN/m)
    q_lin = p_rain_kpa * spacing_s_m
    E_kpa = E_gpa * 1e6
    I_m4 = I_cm4 * 1e-8
    
    EI = E_kpa * I_m4 # kN*m²
    if EI > 0 and span_L_m > 0:
        # Flecha no meio do vão: delta = 5 * q * L^4 / (384 * E * I)
        delta_m = (5.0 * q_lin * (span_L_m ** 4)) / (384.0 * EI)
        delta_mm = delta_m * 1000.0
        limit_deflection_mm = (span_L_m * 1000.0) / 250.0
        
        # Parâmetro de estabilidade por empoçamento (índice de flexibilidade)
        # S_ponding = gamma_w * spacing * L^4 / (pi^4 * EI)
        gamma_w = 10.0 # kN/m³
        ponding_ratio = (gamma_w * spacing_s_m * (span_L_m ** 4)) / ((math.pi ** 4) * EI)
        ponding_stable = ponding_ratio < 0.60
    else:
        delta_mm = 0.0
        limit_deflection_mm = 0.0
        ponding_ratio = 0.0
        ponding_stable = True
        
    warnings = []
    if dh_mm > ds_mm:
        warnings.append(f"Atenção: A lâmina hidráulica calculada (dh = {dh_mm:.1f} mm) excede a altura da soleira (ds = {ds_mm:.1f} mm), indicando risco de transbordamento nos extravasores secundários.")
    if not ponding_stable:
        warnings.append(f"Alerta de Instabilidade: Índice de empoçamento ({ponding_ratio:.2f} ≥ 0.60). A cobertura é excessivamente flexível e está sujeita a colapso progressivo por acúmulo de água!")
    elif delta_mm > limit_deflection_mm:
        warnings.append(f"Aviso ELS: Flecha calculada por empoçamento ({delta_mm:.1f} mm) excede o limite L/250 ({limit_deflection_mm:.1f} mm).")

    return {
        'status': 'success',
        'standard': 'ABNT NBR 6120:2019 / NBR 10844',
        'parameters': {
            'intensity_mm_h': round(i_mm_h, 1),
            'tributary_area_m2': round(trib_area_m2, 2),
            'flow_rate_m3s': round(Q_m3s, 5),
            'flow_rate_L_min': round(Q_L_min, 1),
            'static_head_ds_mm': round(ds_mm, 1),
            'hydraulic_head_dh_mm': round(dh_mm, 1),
            'total_head_hp_mm': round(hp_total_mm, 1),
            'drain_type': drain_type,
            'roof_usage': roof_usage,
            'q_min_kpa': round(q_min_kpa, 2),
        },
        'results': {
            'rain_pressure_kpa': round(p_rain_kpa, 3), # kN/m²
            'rain_pressure_kgf_m2': round(p_rain_kpa * 100.0, 1), # kgf/m²
            'governing_roof_load_kpa': round(max(p_rain_kpa, q_min_kpa), 3),
            'deflection_mm': round(delta_mm, 2),
            'limit_deflection_mm': round(limit_deflection_mm, 2),
            'ponding_ratio': round(ponding_ratio, 3),
            'ponding_stable': ponding_stable
        },
        'warnings': warnings
    }
