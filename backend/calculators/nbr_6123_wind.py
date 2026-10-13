"""
Motor de Cálculo de Ações do Vento segundo a ABNT NBR 6123:1988
(Forças devidas ao vento em edificações)

Implementa:
- Velocidade básica V0 com base no mapa de isopletas do Brasil ou capitais
- Fator topográfico S1 (terreno plano, taludes e morros)
- Fator de rugosidade, dimensões e altura S2 (Categorias I a V, Classes A a C)
- Fator estatístico S3 (Grupos 1 a 5)
- Velocidade característica Vk = V0 * S1 * S2 * S3
- Pressão dinâmica q = 0.613 * Vk^2 (N/m²)
- Coeficientes de arrasto Ca e forças de arrasto global
- Coeficientes de pressão externa Cpe e interna Cpi
- Forças e momentos por pavimento/cota z
"""

import math
from typing import Dict, List, Any, Optional

# Capitais brasileiras e velocidades básicas V0 típicas (NBR 6123 - Figura 1)
CAPITAIS_V0 = {
    'Porto Alegre (RS)': 45.0,
    'Caxias do Sul / Serra Gaúcha (RS)': 48.0,
    'Florianópolis (SC)': 42.0,
    'Curitiba (PR)': 42.0,
    'Foz do Iguaçu (PR)': 45.0,
    'São Paulo (SP)': 40.0,
    'Campinas / Interior (SP)': 42.0,
    'Santos / Litoral (SP)': 42.0,
    'Rio de Janeiro (RJ)': 35.0,
    'Belo Horizonte (MG)': 35.0,
    'Vitória (ES)': 35.0,
    'Brasília (DF)': 35.0,
    'Goiânia (GO)': 35.0,
    'Campo Grande (MS)': 40.0,
    'Cuiabá (MT)': 35.0,
    'Salvador (BA)': 30.0,
    'Recife (PE)': 30.0,
    'Fortaleza (CE)': 30.0,
    'Natal (RN)': 30.0,
    'João Pessoa (PB)': 30.0,
    'Maceió (AL)': 30.0,
    'Aracaju (SE)': 30.0,
    'São Luís (MA)': 30.0,
    'Teresina (PI)': 30.0,
    'Belém (PA)': 30.0,
    'Manaus (AM)': 30.0,
    'Porto Velho (RO)': 32.0,
    'Rio Branco (AC)': 32.0,
    'Boa Vista (RR)': 30.0,
    'Macapá (AP)': 30.0,
    'Palmas (TO)': 32.0,
}

# Parâmetros meteorológicos da Tabela 2 da NBR 6123 (b, Fr, p)
# Categorias I a V; Classes A, B, C
TABELA_2_S2 = {
    # Categoria: { Classe: (b, Fr, p, z_min) }
    'I': {
        'A': (1.10, 1.00, 0.06, 5.0),
        'B': (1.10, 0.98, 0.06, 5.0),
        'C': (1.10, 0.95, 0.06, 5.0),
    },
    'II': {
        'A': (1.00, 1.00, 0.09, 5.0),
        'B': (1.00, 0.98, 0.09, 5.0),
        'C': (1.00, 0.95, 0.09, 5.0),
    },
    'III': {
        'A': (0.94, 1.00, 0.12, 5.0),
        'B': (0.94, 0.98, 0.12, 5.0),
        'C': (0.94, 0.93, 0.12, 5.0),
    },
    'IV': {
        'A': (0.86, 1.00, 0.15, 10.0),
        'B': (0.86, 0.98, 0.15, 10.0),
        'C': (0.86, 0.92, 0.15, 10.0),
    },
    'V': {
        'A': (0.74, 1.00, 0.23, 10.0),
        'B': (0.74, 0.98, 0.23, 10.0),
        'C': (0.74, 0.89, 0.23, 10.0),
    }
}

# Fator estatístico S3 por grupo de ocupação (Tabela 3)
S3_GRUPOS = {
    '1': {'valor': 1.10, 'desc': 'Grupo 1 - Edificações de alta segurança (hospitais, bombeiros, comunicações)'},
    '2': {'valor': 1.00, 'desc': 'Grupo 2 - Edificações habitacionais, comerciais, escritórios e hotéis (vida útil 50 anos)'},
    '3': {'valor': 0.95, 'desc': 'Grupo 3 - Edificações com baixo fator de ocupação (depósitos, silos, indústria)'},
    '4': {'valor': 0.88, 'desc': 'Grupo 4 - Galpões rurais, agrícolas e estufas'},
    '5': {'valor': 0.83, 'desc': 'Grupo 5 - Construções e estruturas provisórias (durante montagem)'},
}

def calculate_s1(topography_type: str, slope_deg: float = 0.0, z: float = 10.0, d: float = 100.0) -> float:
    """Calcula o fator topográfico S1 conforme NBR 6123 (Item 5.2)."""
    if topography_type == 'flat' or slope_deg <= 3.0:
        return 1.0
    
    theta_rad = math.radians(min(slope_deg, 45.0))
    if topography_type == 'cliff': # Talude / encosta
        s1_crest = 1.0 + 0.5 * math.tan(theta_rad)
        if z >= d or d <= 0:
            return 1.0
        return max(1.0, 1.0 + (s1_crest - 1.0) * (1.0 - z / d))
    elif topography_type == 'hill': # Morro / crista
        s1_crest = 1.0 + math.tan(theta_rad)
        if z >= d or d <= 0:
            return 1.0
        return max(1.0, 1.0 + (s1_crest - 1.0) * (1.0 - z / d))
    return 1.0

def calculate_s2(z: float, category: str, building_class: str) -> float:
    """Calcula o fator S2 conforme NBR 6123 (Item 5.3 e Tabela 2)."""
    cat_data = TABELA_2_S2.get(category, TABELA_2_S2['IV'])
    params = cat_data.get(building_class, cat_data['B'])
    b, Fr, p, z_min = params
    
    z_eff = max(z, z_min)
    s2 = b * Fr * math.pow(z_eff / 10.0, p)
    return max(0.5, s2)

def calculate_drag_coefficient_ca(h: float, l1: float, l2: float) -> float:
    """
    Calcula coeficiente de arrasto Ca para edificações retangulares em planta (Tabela 4 NBR 6123).
    h: altura total
    l1: dimensão frontal atingida pelo vento
    l2: dimensão paralela à direção do vento (profundidade)
    """
    if l1 <= 0 or l2 <= 0:
        return 1.2
    
    h_over_l1 = h / l1
    l2_over_l1 = l2 / l1 # Profundidade / largura frontal
    
    # Estimativa e interpolação baseada na Tabela 4 da NBR 6123
    if l2_over_l1 <= 0.5:
        base_ca = 1.40
    elif l2_over_l1 <= 1.0:
        base_ca = 1.20
    elif l2_over_l1 <= 2.0:
        base_ca = 1.00
    elif l2_over_l1 <= 4.0:
        base_ca = 0.85
    else:
        base_ca = 0.80
        
    if h_over_l1 > 4.0:
        factor_h = 1.20
    elif h_over_l1 > 2.0:
        factor_h = 1.10
    elif h_over_l1 > 1.0:
        factor_h = 1.00
    elif h_over_l1 > 0.5:
        factor_h = 0.90
    else:
        factor_h = 0.80
        
    ca = base_ca * factor_h
    return max(0.7, min(2.0, round(ca, 2)))

def calculate_nbr6123_wind(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculadora Completa de Vento conforme NBR 6123:1988.
    """
    # 1. Parâmetros de entrada
    v0 = float(inputs.get('v0', 40.0))
    city_preset = inputs.get('city_preset', '')
    if city_preset in CAPITAIS_V0:
        v0 = CAPITAIS_V0[city_preset]
        
    topography = inputs.get('topography', 'flat')
    slope_deg = float(inputs.get('slope_deg', 0.0))
    hill_length = float(inputs.get('hill_length', 100.0))
    
    category = str(inputs.get('category', 'IV')).upper()
    building_class = str(inputs.get('building_class', 'B')).upper()
    s3_group = str(inputs.get('s3_group', '2'))
    
    h = float(inputs.get('height', 30.0)) # Altura total
    l1 = float(inputs.get('width', 20.0)) # Largura frontal (atingida pelo vento)
    l2 = float(inputs.get('depth', 30.0)) # Profundidade
    floors = int(inputs.get('floors', 10))
    cpi = float(inputs.get('cpi', -0.30)) # Coeficiente de pressão interna
    
    # 2. Fatores S1 e S3
    s1_topo = calculate_s1(topography, slope_deg, h, hill_length)
    s3 = S3_GRUPOS.get(s3_group, S3_GRUPOS['2'])['valor']
    
    # 3. Perfis verticais por cota e pavimentos
    levels = []
    floor_height = h / max(1, floors)
    total_shear_base = 0.0
    total_moment_base = 0.0
    ca = calculate_drag_coefficient_ca(h, l1, l2)
    
    # Perfil contínuo ao longo da altura
    num_points = max(10, floors)
    profile_heights = [round(i * (h / num_points), 2) for i in range(1, num_points + 1)]
    profile_data = []
    
    for z in profile_heights:
        s1_z = calculate_s1(topography, slope_deg, z, hill_length)
        s2_z = calculate_s2(z, category, building_class)
        vk_z = v0 * s1_z * s2_z * s3
        q_z_pa = 0.613 * (vk_z ** 2)
        q_z_kpa = q_z_pa / 1000.0 # kN/m²
        profile_data.append({
            'z': z,
            's1': round(s1_z, 3),
            's2': round(s2_z, 3),
            's3': round(s3, 3),
            'vk': round(vk_z, 2),
            'q_pa': round(q_z_pa, 1),
            'q_kpa': round(q_z_kpa, 3)
        })
        
    # Análise por pavimento
    for fl in range(1, floors + 1):
        z_floor = fl * floor_height
        z_mid = z_floor - floor_height / 2.0
        
        s1_mid = calculate_s1(topography, slope_deg, z_mid, hill_length)
        s2_mid = calculate_s2(z_mid, category, building_class)
        vk_mid = v0 * s1_mid * s2_mid * s3
        q_mid_pa = 0.613 * (vk_mid ** 2)
        q_mid_kpa = q_mid_pa / 1000.0
        
        area_floor = l1 * floor_height
        force_floor_kn = ca * q_mid_kpa * area_floor
        moment_floor_knm = force_floor_kn * z_mid
        
        total_shear_base += force_floor_kn
        total_moment_base += moment_floor_knm
        
        levels.append({
            'floor': fl,
            'z': round(z_floor, 2),
            'z_mid': round(z_mid, 2),
            's2': round(s2_mid, 3),
            'vk': round(vk_mid, 2),
            'q_kpa': round(q_mid_kpa, 3),
            'trib_area': round(area_floor, 2),
            'force_kn': round(force_floor_kn, 2),
            'moment_knm': round(moment_floor_knm, 2),
        })
        
    # No topo
    s2_top = calculate_s2(h, category, building_class)
    vk_top = v0 * s1_topo * s2_top * s3
    q_top_pa = 0.613 * (vk_top ** 2)
    q_top_kpa = q_top_pa / 1000.0
    
    # Coeficientes de pressão externa nas faces (Tabela 4 / Item 6)
    # Paredes para vento frontal a 0°
    cpe_windward = 0.70 if h / l1 < 2.0 else 0.80
    cpe_leeward = -0.40 if l2 / l1 >= 2.0 else -0.50
    cpe_sides = -0.60
    
    pressures = {
        'windward': {
            'cpe': cpe_windward,
            'net_cp_pos': round(cpe_windward - cpi, 2),
            'p_kpa': round((cpe_windward - cpi) * q_top_kpa, 3),
            'desc': 'Face a Barlavento (Pressão)'
        },
        'leeward': {
            'cpe': cpe_leeward,
            'net_cp_neg': round(cpe_leeward - cpi, 2),
            'p_kpa': round((cpe_leeward - cpi) * q_top_kpa, 3),
            'desc': 'Face a Sotavento (Sucção)'
        },
        'sides': {
            'cpe': cpe_sides,
            'net_cp': round(cpe_sides - cpi, 2),
            'p_kpa': round((cpe_sides - cpi) * q_top_kpa, 3),
            'desc': 'Faces Laterais (Sucção)'
        }
    }
    
    # 5. Cálculo Especializado do Pórtico 2D para o STRAP (Galpão / Treliça)
    span = float(inputs.get('frame_span', inputs.get('span', 18.0)))
    eaves_h = float(inputs.get('frame_eaves_h', inputs.get('eaves_h', min(h, 15.0))))
    truss_h_eaves = float(inputs.get('frame_truss_h_eaves', 1.0))
    truss_h_ridge = float(inputs.get('frame_truss_h_ridge', 2.0))
    frame_spacing = float(inputs.get('frame_spacing', 6.0))
    purlin_spacing = float(inputs.get('purlin_spacing', 1.5))
    dead_roof_kpa = float(inputs.get('dead_roof_kpa', 0.20))
    live_roof_kpa = float(inputs.get('live_roof_kpa', 0.25))
    equip_roof_kpa = float(inputs.get('equip_roof_kpa', 0.15))

    portal_frame_strap = calculate_portal_frame_strap(
        span=span,
        eaves_h=eaves_h,
        truss_h_eaves=truss_h_eaves,
        truss_h_ridge=truss_h_ridge,
        frame_spacing=frame_spacing,
        purlin_spacing=purlin_spacing,
        dead_roof_kpa=dead_roof_kpa,
        live_roof_kpa=live_roof_kpa,
        equip_roof_kpa=equip_roof_kpa,
        q_kpa=q_top_kpa
    )

    return {
        'status': 'success',
        'standard': 'ABNT NBR 6123:1988',
        'parameters': {
            'v0': v0,
            'topography': topography,
            's1': round(s1_topo, 3),
            'category': category,
            'building_class': building_class,
            's2_top': round(s2_top, 3),
            's3': round(s3, 3),
            'vk_top': round(vk_top, 2),
            'q_top_pa': round(q_top_pa, 1),
            'q_top_kpa': round(q_top_kpa, 3),
            'ca': ca,
            'cpi': cpi,
            'height': h,
            'width': l1,
            'depth': l2,
            'floors': floors,
        },
        'summary': {
            'base_shear_kn': round(total_shear_base, 2),
            'base_overturning_moment_knm': round(total_moment_base, 2),
            'projected_area_m2': round(l1 * h, 2),
            'mean_pressure_kpa': round(total_shear_base / (l1 * h), 3) if (l1 * h) > 0 else 0.0
        },
        'pressures': pressures,
        'profile': profile_data,
        'levels': levels,
        'portal_frame_strap': portal_frame_strap
    }


def calculate_portal_frame_strap(
    span: float = 18.0,
    eaves_h: float = 15.0,
    truss_h_eaves: float = 1.0,
    truss_h_ridge: float = 2.0,
    frame_spacing: float = 6.0,
    purlin_spacing: float = 1.5,
    dead_roof_kpa: float = 0.20,
    live_roof_kpa: float = 0.25,
    equip_roof_kpa: float = 0.15,
    q_kpa: float = 0.536
) -> Dict[str, Any]:
    """
    Calcula detalhadamente as cargas a aplicar em pórticos planos 2D no STRAP,
    fornecendo os 7 Casos de Carga (Load Cases) e as 16 Combinações Normativas (NBR 8681/8800).
    """
    delta_h = max(0.0, truss_h_ridge - truss_h_eaves)
    half_span = span / 2.0 if span > 0 else 9.0
    slope_tan = delta_h / half_span if half_span > 0 else 0.0
    slope_rad = math.atan(slope_tan)
    slope_deg = math.degrees(slope_rad)
    slope_pct = slope_tan * 100.0
    rafter_len = math.sqrt(half_span**2 + delta_h**2)
    
    # 1. Coeficientes de Pressão Externa Cpe (NBR 6123)
    # Pilares (Paredes - Tabela 4)
    cpe_wall_windward = 0.70
    cpe_wall_leeward = -0.50
    cpe_wall_sides = -0.60
    
    # Telhado de 2 águas (Tabela 5)
    if slope_deg <= 10.0:
        cpe_roof_windward = -0.80 # Média no banzo (zona de borda local pode chegar a -1.20)
        cpe_roof_leeward = -0.50
    else:
        cpe_roof_windward = -0.70
        cpe_roof_leeward = -0.40
        
    cpi_suction = -0.30
    cpi_overpressure = 0.20
    
    # 2. Cargas Permanentes e Sobrecargas (kN/m e kN nodal)
    # LOAD 2: Telhas + Terças
    w_d2 = round(dead_roof_kpa * frame_spacing, 2)
    p_d2 = round(w_d2 * purlin_spacing, 2)
    
    # LOAD 3: Sobrecarga de telhado NBR 6120
    w_l3 = round(live_roof_kpa * frame_spacing, 2)
    p_l3 = round(w_l3 * purlin_spacing, 2)

    # LOAD 4: Sobrecarga de equipamentos / utilidades
    w_l4 = round(equip_roof_kpa * frame_spacing, 2)
    p_l4 = round(w_l4 * purlin_spacing, 2)
    
    # 3. Vento Transversal +90° com Sucção Interna (Cpi = -0.30) -> LOAD 5 (W1)
    cp_liq_pilar_w_5 = round(cpe_wall_windward - cpi_suction, 2) # +1.00
    p_pilar_w_5 = round(cp_liq_pilar_w_5 * q_kpa, 3)
    w_pilar_w_5 = round(p_pilar_w_5 * frame_spacing, 2)
    
    cp_liq_pilar_l_5 = round(cpe_wall_leeward - cpi_suction, 2) # -0.20
    p_pilar_l_5 = round(cp_liq_pilar_l_5 * q_kpa, 3)
    w_pilar_l_5 = round(p_pilar_l_5 * frame_spacing, 2)
    
    cp_liq_roof_w_5 = round(cpe_roof_windward - cpi_suction, 2) # -0.50
    p_roof_w_5 = round(cp_liq_roof_w_5 * q_kpa, 3)
    w_roof_w_5 = round(p_roof_w_5 * frame_spacing, 2)
    nodal_roof_w_5 = round(w_roof_w_5 * purlin_spacing, 2)
    
    cp_liq_roof_l_5 = round(cpe_roof_leeward - cpi_suction, 2) # -0.20
    p_roof_l_5 = round(cp_liq_roof_l_5 * q_kpa, 3)
    w_roof_l_5 = round(p_roof_l_5 * frame_spacing, 2)
    nodal_roof_l_5 = round(w_roof_l_5 * purlin_spacing, 2)
    
    # 4. Vento Transversal +90° com Sobrepressão Interna (Cpi = +0.20) -> LOAD 6 (W2 - CRÍTICO ARRANCAMENTO)
    cp_liq_pilar_w_6 = round(cpe_wall_windward - cpi_overpressure, 2) # +0.50
    p_pilar_w_6 = round(cp_liq_pilar_w_6 * q_kpa, 3)
    w_pilar_w_6 = round(p_pilar_w_6 * frame_spacing, 2)
    
    cp_liq_pilar_l_6 = round(cpe_wall_leeward - cpi_overpressure, 2) # -0.70
    p_pilar_l_6 = round(cp_liq_pilar_l_6 * q_kpa, 3)
    w_pilar_l_6 = round(p_pilar_l_6 * frame_spacing, 2)
    
    cp_liq_roof_w_6 = round(cpe_roof_windward - cpi_overpressure, 2) # -1.00
    p_roof_w_6 = round(cp_liq_roof_w_6 * q_kpa, 3)
    w_roof_w_6 = round(p_roof_w_6 * frame_spacing, 2)
    nodal_roof_w_6 = round(w_roof_w_6 * purlin_spacing, 2)
    
    cp_liq_roof_l_6 = round(cpe_roof_leeward - cpi_overpressure, 2) # -0.70
    p_roof_l_6 = round(cp_liq_roof_l_6 * q_kpa, 3)
    w_roof_l_6 = round(p_roof_l_6 * frame_spacing, 2)
    nodal_roof_l_6 = round(w_roof_l_6 * purlin_spacing, 2)

    # 5. Vento Transversal Invertido -90° -> LOAD 7 (W3)
    w_pilar_w_7 = -w_pilar_w_6
    w_pilar_l_7 = -w_pilar_l_6
    w_roof_w_7 = w_roof_w_6
    w_roof_l_7 = w_roof_l_6
    nodal_roof_w_7 = nodal_roof_w_6
    nodal_roof_l_7 = nodal_roof_l_6
    
    # 7 Casos de Carregamento estruturados para o STRAP
    load_cases = [
        {
            'id': '1:pp',
            'name': '1:pp - Peso Próprio Estrutura',
            'type_strap': 'Self-weight (Automático)',
            'where': 'Todas as barras (pilares e treliça)',
            'direction': 'Global Z (-1.0)',
            'pressure_kpa': 'Calculado p/ STRAP',
            'linear_load_knm': 'Auto (aço 78.5 kN/m³)',
            'nodal_load_kn': 'Auto',
            'notes': 'Ativar no STRAP em Edit > Loads > Self-weight com fator -1.0 em Z.'
        },
        {
            'id': '2:Peso telhas',
            'name': '2:Peso telhas - Telhas, Terças e Fixadores',
            'type_strap': 'Beam Load / Joint Load',
            'where': 'Banzo Superior (Água Esq e Água Dir)',
            'direction': 'Global Z (para baixo)',
            'pressure_kpa': f'{dead_roof_kpa:.2f}',
            'linear_load_knm': f'-{w_d2:.2f}',
            'nodal_load_kn': f'-{p_d2:.2f}',
            'notes': 'Carga permanente de cobertura.'
        },
        {
            'id': '3:SC Telhado',
            'name': '3:SC Telhado - Sobrecarga de Manutenção (NBR 6120)',
            'type_strap': 'Beam Load / Joint Load',
            'where': 'Banzo Superior (projeção horizontal)',
            'direction': 'Global Z (para baixo)',
            'pressure_kpa': f'{live_roof_kpa:.2f}',
            'linear_load_knm': f'-{w_l3:.2f}',
            'nodal_load_kn': f'-{p_l3:.2f}',
            'notes': 'Sobrecarga normativa de manutenção sem acesso ao público.'
        },
        {
            'id': '4:SC EQUIPA...',
            'name': '4:SC EQUIPAMENTOS - Utilidades e Cargas Suspensas',
            'type_strap': 'Beam Load / Joint Load',
            'where': 'Banzo Superior / Nós das Terças',
            'direction': 'Global Z (para baixo)',
            'pressure_kpa': f'{equip_roof_kpa:.2f}',
            'linear_load_knm': f'-{w_l4:.2f}',
            'nodal_load_kn': f'-{p_l4:.2f}',
            'notes': 'Sobrecarga de instalações, equipamentos mecânicos e bandejamentos.'
        },
        {
            'id': '5:W1',
            'name': '5:W1 - Vento 90° Sucção Interna (Cpi = -0.30)',
            'type_strap': 'Beam Load / Joint Load',
            'where': 'Pilares e Banzo Superior',
            'direction': 'Horiz. em X e Normal às barras',
            'pressure_kpa': f'Pilar W: +{p_pilar_w_5:.2f} | Pilar L: {p_pilar_l_5:.2f} | Teto W: {p_roof_w_5:.2f} | Teto L: {p_roof_l_5:.2f}',
            'linear_load_knm': f'Pilar W: +{w_pilar_w_5:.2f} | Pilar L: {w_pilar_l_5:.2f} | Teto W: {w_roof_w_5:.2f} | Teto L: {w_roof_l_5:.2f}',
            'nodal_roof_kn': f'Teto W: {nodal_roof_w_5:.2f} | Teto L: {nodal_roof_l_5:.2f}',
            'notes': 'Crítico para momento fletor máximo na base do pilar a barlavento.'
        },
        {
            'id': '6:W2',
            'name': '6:W2 - Vento 90° Sobrepressão (Cpi = +0.20) [ARRANCAMENTO]',
            'type_strap': 'Beam Load / Joint Load',
            'where': 'Pilares e Banzo Superior',
            'direction': 'Horiz. em X e Normal às barras',
            'pressure_kpa': f'Pilar W: +{p_pilar_w_6:.2f} | Pilar L: {p_pilar_l_6:.2f} | Teto W: {p_roof_w_6:.2f} | Teto L: {p_roof_l_6:.2f}',
            'linear_load_knm': f'Pilar W: +{w_pilar_w_6:.2f} | Pilar L: {w_pilar_l_6:.2f} | Teto W: {w_roof_w_6:.2f} | Teto L: {w_roof_l_6:.2f}',
            'nodal_roof_kn': f'Teto W: {nodal_roof_w_6:.2f} | Teto L: {nodal_roof_l_6:.2f}',
            'notes': 'CRÍTICO: Maior sucção na cobertura. Arrancamento de sapatas e compressão no banzo inferior.'
        },
        {
            'id': '7:W3',
            'name': '7:W3 - Vento -90° (Sentido Oposto Direita->Esquerda)',
            'type_strap': 'Beam Load / Joint Load',
            'where': 'Pilares e Banzo Superior (Invertido)',
            'direction': 'Horiz. em X (-) e Normal às barras',
            'pressure_kpa': f'Pilar Dir: -{p_pilar_w_6:.2f} | Pilar Esq: -{p_pilar_l_6:.2f}',
            'linear_load_knm': f'Pilar Dir: {w_pilar_w_7:.2f} | Pilar Esq: {w_pilar_l_7:.2f}',
            'nodal_roof_kn': f'Teto Dir: {nodal_roof_w_7:.2f} | Teto Esq: {nodal_roof_l_7:.2f}',
            'notes': 'Simetria inversa para dimensionamento de ambos os pilares e chumbadores.'
        }
    ]
    
    # 16 Combinações Normativas Exatas do STRAP
    strap_combinations = [
        {
            'no': 1, 'title': '1*1.25+2*1.25+3*1.50+4*1.50+5*0.84',
            'c1': 1.25, 'c2': 1.25, 'c3': 1.5, 'c4': 1.5, 'c5': 0.84, 'c6': None, 'c7': None,
            'type': 'ELU - Gravitacional com W1',
            'goal': 'Compressão máxima em pilares e banzos com W1 secundário (1.4 * 0.60 = 0.84).'
        },
        {
            'no': 2, 'title': '1*1.00+2*1.00+5*1.40',
            'c1': 1.0, 'c2': 1.0, 'c3': None, 'c4': None, 'c5': 1.4, 'c6': None, 'c7': None,
            'type': 'ELU - Arrancamento com W1',
            'goal': 'Tração em chumbadores e sapatas com W1 (peso favorável 1.0, sem sobrecargas).'
        },
        {
            'no': 3, 'title': '1*1.25+2*1.25+3*1.50+4*1.50+6*0.84',
            'c1': 1.25, 'c2': 1.25, 'c3': 1.5, 'c4': 1.5, 'c5': None, 'c6': 0.84, 'c7': None,
            'type': 'ELU - Gravitacional com W2',
            'goal': 'Compressão máxima em pilares e banzos com W2 secundário.'
        },
        {
            'no': 4, 'title': '1*1.00+2*1.00+6*1.40',
            'c1': 1.0, 'c2': 1.0, 'c3': None, 'c4': None, 'c5': None, 'c6': 1.4, 'c7': None,
            'type': 'ELU - Arrancamento Crítico com W2',
            'goal': 'CRÍTICA: Máxima tração em chumbadores e compressão no banzo inferior com W2 (+0.20).'
        },
        {
            'no': 5, 'title': '1*1.25+2*1.25+3*1.50+4*1.50+7*0.84',
            'c1': 1.25, 'c2': 1.25, 'c3': 1.5, 'c4': 1.5, 'c5': None, 'c6': None, 'c7': 0.84,
            'type': 'ELU - Gravitacional com W3',
            'goal': 'Compressão máxima com W3 secundário.'
        },
        {
            'no': 6, 'title': '1*1.00+2*1.00+7*1.40',
            'c1': 1.0, 'c2': 1.0, 'c3': None, 'c4': None, 'c5': None, 'c6': None, 'c7': 1.4,
            'type': 'ELU - Arrancamento com W3',
            'goal': 'Arrancamento e tração nas fundações com W3.'
        },
        {
            'no': 7, 'title': '1*1.00+2*1.00+3*0.30+4*0.30',
            'c1': 1.0, 'c2': 1.0, 'c3': 0.3, 'c4': 0.3, 'c5': None, 'c6': None, 'c7': None,
            'type': 'ELS - Quase-Permanente / Gravitacional',
            'goal': 'Flecha vertical da treliça sob cargas permanentes e quase-permanentes (L/250 a L/350).'
        },
        {
            'no': 8, 'title': '1*1.00+2*1.00+3*0.30+4*0.30+5*0.60',
            'c1': 1.0, 'c2': 1.0, 'c3': 0.3, 'c4': 0.3, 'c5': 0.6, 'c6': None, 'c7': None,
            'type': 'ELS - Deslocamento em Serviço com W1',
            'goal': 'Deriva lateral e flecha com W1 (limite H/300 a H/400 nos pilares).'
        },
        {
            'no': 9, 'title': '1*1.00+2*1.00+3*0.30+4*0.30+6*0.60',
            'c1': 1.0, 'c2': 1.0, 'c3': 0.3, 'c4': 0.3, 'c5': None, 'c6': 0.6, 'c7': None,
            'type': 'ELS - Deslocamento em Serviço com W2',
            'goal': 'Deriva lateral e flecha sob vento W2.'
        },
        {
            'no': 10, 'title': '1*1.00+2*1.00+3*0.30+4*0.30+7*0.60',
            'c1': 1.0, 'c2': 1.0, 'c3': 0.3, 'c4': 0.3, 'c5': None, 'c6': None, 'c7': 0.6,
            'type': 'ELS - Deslocamento em Serviço com W3',
            'goal': 'Deriva lateral e flecha sob vento W3.'
        },
        {
            'no': 11, 'title': '1*1.00+2*1.00+5*0.60',
            'c1': 1.0, 'c2': 1.0, 'c3': None, 'c4': None, 'c5': 0.6, 'c6': None, 'c7': None,
            'type': 'ELS - Levantamento da Cobertura com W1',
            'goal': 'Verificação de descolamento de fixadores e vedações de cobertura sob W1.'
        },
        {
            'no': 12, 'title': '1*1.00+2*1.00+6*0.60',
            'c1': 1.0, 'c2': 1.0, 'c3': None, 'c4': None, 'c5': None, 'c6': 0.6, 'c7': None,
            'type': 'ELS - Levantamento da Cobertura com W2',
            'goal': 'Máximo levantamento da cobertura em serviço sob sucção de W2.'
        },
        {
            'no': 13, 'title': '1*1.00+2*1.00+7*0.60',
            'c1': 1.0, 'c2': 1.0, 'c3': None, 'c4': None, 'c5': None, 'c6': None, 'c7': 0.6,
            'type': 'ELS - Levantamento da Cobertura com W3',
            'goal': 'Levantamento da cobertura sob vento oposto W3.'
        },
        {
            'no': 14, 'title': '1*1.25+2*1.25+3*1.05+4*1.05+5*1.40',
            'c1': 1.25, 'c2': 1.25, 'c3': 1.05, 'c4': 1.05, 'c5': 1.4, 'c6': None, 'c7': None,
            'type': 'ELU - Momento Máximo na Base com W1',
            'goal': 'Momento fletor máximo na base do pilar a barlavento (W1 principal 1.4, sobrecarga ψ0 = 0.70 -> 1.05).'
        },
        {
            'no': 15, 'title': '1*1.25+2*1.25+3*1.05+4*1.05+6*1.40',
            'c1': 1.25, 'c2': 1.25, 'c3': 1.05, 'c4': 1.05, 'c5': None, 'c6': 1.4, 'c7': None,
            'type': 'ELU - Momento Máximo na Base com W2',
            'goal': 'Momento fletor na base sob W2 principal.'
        },
        {
            'no': 16, 'title': '1*1.25+2*1.25+3*1.05+4*1.05+7*1.40',
            'c1': 1.25, 'c2': 1.25, 'c3': 1.05, 'c4': 1.05, 'c5': None, 'c6': None, 'c7': 1.4,
            'type': 'ELU - Momento Máximo na Base com W3',
            'goal': 'Momento fletor na base do pilar sob W3 principal.'
        }
    ]
    
    rules = {
        'never_combine': [
            'NUNCA JUNTAR W1 (Caso 5), W2 (Caso 6) e W3 (Caso 7) na mesma combinação: São hipóteses de vento mutuamente exclusivas!',
            'NUNCA SOMAR SOBRECARGAS (Casos 3 e 4) EM COMBINAÇÕES DE ARRANCAMENTO (Comb 2, 4 e 6): Fator ZERO (vazio). Somá-las aliviaria a tração nas fundações contra a segurança!',
            'NUNCA MAJORAR PESO PRÓPRIO NO ARRANCAMENTO: Utilizar fator favorável 1.00 para 1:pp e 2:Peso telhas nas combinações de arrancamento (Comb 2, 4, 6).'
        ],
        'always_combine': [
            'DEVEM SER JUNTOS: 1:pp e 2:Peso telhas atuam juntos em todas as 16 combinações reais.',
            'DEVEM SER JUNTOS NO ELU GRAVITACIONAL (Comb 1, 3, 5): 1:pp (1.25) + 2:Peso telhas (1.25) + 3:SC Telhado (1.50) + 4:SC EQUIPA (1.50) + Vento secundário (0.84).',
            'DEVEM SER JUNTOS NO ELU VENTO PREPONDERANTE (Comb 14, 15, 16): 1:pp (1.25) + 2:Peso telhas (1.25) + 3:SC Telhado (1.05) + 4:SC EQUIPA (1.05) + Vento principal (1.40).'
        ]
    }
    
    return {
        'geometry': {
            'span': span,
            'eaves_h': eaves_h,
            'truss_h_eaves': truss_h_eaves,
            'truss_h_ridge': truss_h_ridge,
            'delta_h': round(delta_h, 2),
            'slope_deg': round(slope_deg, 2),
            'slope_pct': round(slope_pct, 1),
            'rafter_len': round(rafter_len, 2),
            'frame_spacing': frame_spacing,
            'purlin_spacing': purlin_spacing
        },
        'coefficients': {
            'cpe_wall_windward': cpe_wall_windward,
            'cpe_wall_leeward': cpe_wall_leeward,
            'cpe_roof_windward': cpe_roof_windward,
            'cpe_roof_leeward': cpe_roof_leeward,
            'cpi_suction': cpi_suction,
            'cpi_overpressure': cpi_overpressure
        },
        'loads': {
            'w_d2': w_d2,
            'p_d2': p_d2,
            'w_l3': w_l3,
            'p_l3': p_l3,
            'w_l4': w_l4,
            'p_l4': p_l4,
            'wind_suction_cpi_neg': {
                'w_pilar_windward': w_pilar_w_5,
                'w_pilar_leeward': w_pilar_l_5,
                'w_roof_windward': w_roof_w_5,
                'w_roof_leeward': w_roof_l_5,
                'p_roof_windward': nodal_roof_w_5,
                'p_roof_leeward': nodal_roof_l_5
            },
            'wind_overpressure_cpi_pos': {
                'w_pilar_windward': w_pilar_w_6,
                'w_pilar_leeward': w_pilar_l_6,
                'w_roof_windward': w_roof_w_6,
                'w_roof_leeward': w_roof_l_6,
                'p_roof_windward': nodal_roof_w_6,
                'p_roof_leeward': nodal_roof_l_6
            }
        },
        'load_cases': load_cases,
        'combinations': strap_combinations,
        'rules': rules
    }

