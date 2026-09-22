"""
Motor Universal de Combinações de Ações Multicódigo
Suporte a:
- NBR 8681:2003 / NBR 6118:2023 (Brasil)
- Eurocode EN 1990 (STR/GEO Set B, Set C, EQU e ELS)
- ASCE 7-16 / ASCE 7-22 & IBC (LRFD e ASD)

Origens de Esforços Expandidas:
- Estruturais (Peso Próprio, Permanentes, Equipamentos)
- Geotécnicos & Hidráulicos (Solo Seco, Solo Saturado, Pressão Hidrostática, Subpressão, Sobrecarga)
- Sobrecargas de Utilização (Residencial, Comercial, Garagem Leve/Pesada, Cobertura, Guarda-Corpo, Pontes Rolantes)
- Climáticos (Vento Pressão/Sucção, Temperatura, Neve, Chuva)
- Acidentais / Sísmicos (Sismo, Impacto, Recalques, Retração)

Regras de Associação:
- Exclusão Mútua (XOR): Cargas no mesmo grupo jamais atuam juntas (ex: Solo Seco vs Solo Saturado).
- Coexistência Obrigatória (AND / Implies): Se carga A estiver ativa, carga B atua obrigatoriamente (ex: Solo Saturado requer Água).
- Incompatibilidade (NOT): Cargas mutuamente proibidas.
"""

import math
from typing import Dict, List, Any, Optional

# --- CATÁLOGO UNIFICADO DE ORIGENS DE ESFORÇOS ---
LOAD_CATALOG = {
    # 1. Geotécnicos e Hidráulicos
    'Solo Seco (Empuxo)': {
        'isVariable': False, 'category': 'geotech', 'asce_type': 'H',
        'nbr': {'gamma_g_unfav': 1.40, 'gamma_g_fav': 1.00},
        'ec': {'gamma_G_unfav': 1.35, 'gamma_G_fav': 1.00, 'xi': 0.85},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },
    'Solo Saturado (Empuxo)': {
        'isVariable': False, 'category': 'geotech', 'asce_type': 'H',
        'nbr': {'gamma_g_unfav': 1.40, 'gamma_g_fav': 1.00},
        'ec': {'gamma_G_unfav': 1.35, 'gamma_G_fav': 1.00, 'xi': 0.85},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },
    'Pressão Hidrostática / Água': {
        'isVariable': False, 'category': 'geotech', 'asce_type': 'F',
        'nbr': {'gamma_g_unfav': 1.40, 'gamma_g_fav': 1.00},
        'ec': {'gamma_G_unfav': 1.35, 'gamma_G_fav': 1.00, 'xi': 0.85},
        'asce': {'factor_lrfd': 1.20, 'factor_asd': 1.00}
    },
    'Subpressão / Uplift': {
        'isVariable': False, 'category': 'geotech', 'asce_type': 'F',
        'nbr': {'gamma_g_unfav': 1.40, 'gamma_g_fav': 0.90},
        'ec': {'gamma_G_unfav': 1.35, 'gamma_G_fav': 0.90, 'xi': 0.85},
        'asce': {'factor_lrfd': 1.20, 'factor_asd': 1.00}
    },
    'Sobrecarga no Tardoz (Q_solo)': {
        'isVariable': True, 'category': 'geotech', 'asce_type': 'H',
        'nbr': {'gamma_q': 1.40, 'psi0': 0.70, 'psi1': 0.60, 'psi2': 0.40},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.70, 'psi1': 0.50, 'psi2': 0.30},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },

    # 2. Estruturais e Permanentes
    'Peso Próprio (PP)': {
        'isVariable': False, 'category': 'structure', 'asce_type': 'D',
        'nbr': {'gamma_g_unfav': 1.35, 'gamma_g_fav': 1.00},
        'ec': {'gamma_G_unfav': 1.35, 'gamma_G_fav': 1.00, 'xi': 0.85},
        'asce': {'factor_lrfd': 1.20, 'factor_asd': 1.00}
    },
    'Permanente (G)': {
        'isVariable': False, 'category': 'structure', 'asce_type': 'D',
        'nbr': {'gamma_g_unfav': 1.40, 'gamma_g_fav': 1.00},
        'ec': {'gamma_G_unfav': 1.35, 'gamma_G_fav': 1.00, 'xi': 0.85},
        'asce': {'factor_lrfd': 1.20, 'factor_asd': 1.00}
    },
    'Permanente (Retração/Recalque)': {
        'isVariable': False, 'category': 'structure', 'asce_type': 'D',
        'nbr': {'gamma_g_unfav': 1.20, 'gamma_g_fav': 0.00},
        'ec': {'gamma_G_unfav': 1.20, 'gamma_G_fav': 0.00, 'xi': 1.00},
        'asce': {'factor_lrfd': 1.20, 'factor_asd': 1.00}
    },
    'Equipamentos Fixos': {
        'isVariable': False, 'category': 'structure', 'asce_type': 'D',
        'nbr': {'gamma_g_unfav': 1.40, 'gamma_g_fav': 1.00},
        'ec': {'gamma_G_unfav': 1.35, 'gamma_G_fav': 1.00, 'xi': 0.85},
        'asce': {'factor_lrfd': 1.20, 'factor_asd': 1.00}
    },

    # 3. Sobrecargas de Uso (Live Loads)
    'Uso Residencial (Q)': {
        'isVariable': True, 'category': 'use', 'asce_type': 'L',
        'nbr': {'gamma_q': 1.40, 'psi0': 0.50, 'psi1': 0.40, 'psi2': 0.30},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.70, 'psi1': 0.50, 'psi2': 0.30},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },
    'Uso Escritório/Loja (Q)': {
        'isVariable': True, 'category': 'use', 'asce_type': 'L',
        'nbr': {'gamma_q': 1.40, 'psi0': 0.70, 'psi1': 0.40, 'psi2': 0.30},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.70, 'psi1': 0.50, 'psi2': 0.30},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },
    'Garagem/Estacionamento (Q)': {
        'isVariable': True, 'category': 'use', 'asce_type': 'L',
        'nbr': {'gamma_q': 1.40, 'psi0': 0.70, 'psi1': 0.60, 'psi2': 0.40},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.70, 'psi1': 0.70, 'psi2': 0.60},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },
    'Garagem / Tráfego Pesado (Q)': {
        'isVariable': True, 'category': 'use', 'asce_type': 'L',
        'nbr': {'gamma_q': 1.40, 'psi0': 0.80, 'psi1': 0.70, 'psi2': 0.60},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.70, 'psi1': 0.50, 'psi2': 0.30},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },
    'Cobertura / Manutenção (Q)': {
        'isVariable': True, 'category': 'use', 'asce_type': 'Lr',
        'nbr': {'gamma_q': 1.40, 'psi0': 0.60, 'psi1': 0.30, 'psi2': 0.00},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.00, 'psi1': 0.00, 'psi2': 0.00},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },
    'Guarda-Corpo (Q)': {
        'isVariable': True, 'category': 'use', 'asce_type': 'L',
        'nbr': {'gamma_q': 1.40, 'psi0': 0.80, 'psi1': 0.60, 'psi2': 0.40},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.70, 'psi1': 0.50, 'psi2': 0.30},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },
    'Ponte Rolante / Guindaste (Q)': {
        'isVariable': True, 'category': 'use', 'asce_type': 'L',
        'nbr': {'gamma_q': 1.40, 'psi0': 0.80, 'psi1': 0.70, 'psi2': 0.50},
        'ec': {'gamma_Q': 1.50, 'psi0': 1.00, 'psi1': 0.90, 'psi2': 0.80},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },
    'Outras Ações Variáveis (Q)': {
        'isVariable': True, 'category': 'use', 'asce_type': 'L',
        'nbr': {'gamma_q': 1.40, 'psi0': 0.80, 'psi1': 0.60, 'psi2': 0.40},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.70, 'psi1': 0.50, 'psi2': 0.30},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },

    # 4. Climáticos & Ambientais
    'Vento (W)': {
        'isVariable': True, 'category': 'wind', 'asce_type': 'W',
        'nbr': {'gamma_q': 1.40, 'psi0': 0.60, 'psi1': 0.30, 'psi2': 0.00},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.60, 'psi1': 0.20, 'psi2': 0.00},
        'asce': {'factor_lrfd': 1.00, 'factor_asd': 0.60}
    },
    'Temperatura (T)': {
        'isVariable': True, 'category': 'temperature', 'asce_type': 'T',
        'nbr': {'gamma_q': 1.40, 'psi0': 0.60, 'psi1': 0.50, 'psi2': 0.30},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.60, 'psi1': 0.50, 'psi2': 0.00},
        'asce': {'factor_lrfd': 1.20, 'factor_asd': 0.75}
    },
    'Neve (S)': {
        'isVariable': True, 'category': 'snow', 'asce_type': 'S',
        'nbr': {'gamma_q': 1.40, 'psi0': 0.60, 'psi1': 0.30, 'psi2': 0.00},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.70, 'psi1': 0.50, 'psi2': 0.20},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },
    'Chuva / Empoçamento (R)': {
        'isVariable': True, 'category': 'rain', 'asce_type': 'R',
        'nbr': {'gamma_q': 1.40, 'psi0': 0.60, 'psi1': 0.30, 'psi2': 0.00},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.70, 'psi1': 0.50, 'psi2': 0.00},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },
    'Líquidos (Truncado)': {
        'isVariable': True, 'category': 'liquid', 'asce_type': 'F',
        'nbr': {'gamma_q': 1.40, 'psi0': 0.50, 'psi1': 0.40, 'psi2': 0.30},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.70, 'psi1': 0.50, 'psi2': 0.30},
        'asce': {'factor_lrfd': 1.20, 'factor_asd': 1.00}
    },

    # 5. Acidentais / Sísmicos
    'Sismo (E)': {
        'isVariable': True, 'category': 'seismic', 'asce_type': 'E',
        'nbr': {'gamma_q': 1.00, 'psi0': 0.30, 'psi1': 0.20, 'psi2': 0.00},
        'ec': {'gamma_Q': 1.00, 'psi0': 0.00, 'psi1': 0.00, 'psi2': 0.00},
        'asce': {'factor_lrfd': 1.00, 'factor_asd': 0.70}
    },
    'Impacto / Choque Acidental': {
        'isVariable': True, 'category': 'accidental', 'asce_type': 'A',
        'nbr': {'gamma_q': 1.00, 'psi0': 0.00, 'psi1': 0.00, 'psi2': 0.00},
        'ec': {'gamma_Q': 1.00, 'psi0': 0.00, 'psi1': 0.00, 'psi2': 0.00},
        'asce': {'factor_lrfd': 1.00, 'factor_asd': 1.00}
    },

    # 6. Fundações Rasas (Sapatas & Geotécnica NBR 6122)
    'Sapata: Peso Próprio + Solo (G_est)': {
        'isVariable': False, 'category': 'geotech_foundation', 'asce_type': 'D',
        'geo_role': 'stabilizing',
        'nbr': {'gamma_g_unfav': 1.35, 'gamma_g_fav': 0.90},
        'ec': {'gamma_G_unfav': 1.35, 'gamma_G_fav': 0.90, 'xi': 0.85},
        'asce': {'factor_lrfd': 1.20, 'factor_asd': 1.00}
    },
    'Pilar: Carga Normal Permanente (Nk_g)': {
        'isVariable': False, 'category': 'geotech_foundation', 'asce_type': 'D',
        'geo_role': 'stabilizing',
        'nbr': {'gamma_g_unfav': 1.40, 'gamma_g_fav': 0.90},
        'ec': {'gamma_G_unfav': 1.35, 'gamma_G_fav': 0.90, 'xi': 0.85},
        'asce': {'factor_lrfd': 1.20, 'factor_asd': 1.00}
    },
    'Pilar: Sobrecarga Normal (Nk_q)': {
        'isVariable': True, 'category': 'geotech_foundation', 'asce_type': 'L',
        'geo_role': 'vertical_variable',
        'nbr': {'gamma_q': 1.40, 'psi0': 0.70, 'psi1': 0.50, 'psi2': 0.30},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.70, 'psi1': 0.50, 'psi2': 0.30},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },
    'Pilar: Força Horizontal Permanente (Hk_g)': {
        'isVariable': False, 'category': 'geotech_foundation', 'asce_type': 'D',
        'geo_role': 'destabilizing_horizontal',
        'nbr': {'gamma_g_unfav': 1.40, 'gamma_g_fav': 0.00},
        'ec': {'gamma_G_unfav': 1.35, 'gamma_G_fav': 0.00, 'xi': 0.85},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },
    'Pilar: Força Horizontal Vento (Hk_w)': {
        'isVariable': True, 'category': 'geotech_foundation', 'asce_type': 'W',
        'geo_role': 'destabilizing_horizontal',
        'nbr': {'gamma_q': 1.40, 'psi0': 0.60, 'psi1': 0.30, 'psi2': 0.00},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.60, 'psi1': 0.20, 'psi2': 0.00},
        'asce': {'factor_lrfd': 1.00, 'factor_asd': 0.60}
    },
    'Pilar: Momento Fletor Permanente (Mk_g)': {
        'isVariable': False, 'category': 'geotech_foundation', 'asce_type': 'D',
        'geo_role': 'destabilizing_moment',
        'nbr': {'gamma_g_unfav': 1.40, 'gamma_g_fav': 0.00},
        'ec': {'gamma_G_unfav': 1.35, 'gamma_G_fav': 0.00, 'xi': 0.85},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },
    'Pilar: Momento Fletor Vento (Mk_w)': {
        'isVariable': True, 'category': 'geotech_foundation', 'asce_type': 'W',
        'geo_role': 'destabilizing_moment',
        'nbr': {'gamma_q': 1.40, 'psi0': 0.60, 'psi1': 0.30, 'psi2': 0.00},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.60, 'psi1': 0.20, 'psi2': 0.00},
        'asce': {'factor_lrfd': 1.00, 'factor_asd': 0.60}
    }
}

def get_load_meta(load_type: str) -> Dict[str, Any]:
    """Retorna os metadados do tipo de carga, com fallback seguro."""
    if load_type in LOAD_CATALOG:
        return LOAD_CATALOG[load_type]
    # Fallback genérico
    is_var = 'Q' in load_type or 'Vento' in load_type or 'Variável' in load_type
    return {
        'isVariable': is_var, 'category': 'use' if is_var else 'structure', 'asce_type': 'L' if is_var else 'D',
        'nbr': {'gamma_g_unfav': 1.40, 'gamma_g_fav': 1.00, 'gamma_q': 1.40, 'psi0': 0.70, 'psi1': 0.40, 'psi2': 0.30},
        'ec': {'gamma_G_unfav': 1.35, 'gamma_G_fav': 1.00, 'gamma_Q': 1.50, 'psi0': 0.70, 'psi1': 0.50, 'psi2': 0.30},
        'asce': {'factor_lrfd': 1.60 if is_var else 1.20, 'factor_asd': 1.00}
    }


def classify_geo_role(load: Dict[str, Any]) -> str:
    """Classifica o papel geotécnico da ação (estabilizante, horizontal desestabilizante, momento tombante, etc)."""
    meta = get_load_meta(load.get('type', ''))
    if 'geo_role' in meta:
        return meta['geo_role']
    name_type = (str(load.get('name', '')) + ' ' + str(load.get('type', ''))).lower()
    if any(k in name_type for k in ['subpress', 'uplift', 'flutua']):
        return 'uplift'
    if any(k in name_type for k in ['momento', 'm_', 'fletor', 'tomb']):
        return 'destabilizing_moment'
    if any(k in name_type for k in ['horizontal', 'h_', 'empuxo', 'vento', 'cortante', 'desliz']):
        return 'destabilizing_horizontal'
    if any(k in name_type for k in ['peso', 'pp', 'sapata', 'normal perm', 'g_est', 'estabiliz']):
        return 'stabilizing'
    if meta.get('isVariable', False):
        return 'vertical_variable'
    return 'stabilizing'


def generate_valid_load_subsets(user_loads: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    """
    Gera todos os subconjuntos válidos de ações respeitando:
    1. Regras de Exclusão Mútua (XOR): Cargas com mesmo `group` (não vazio) nunca atuam juntas.
    2. Regras de Coexistência Obrigatória (AND / Implies):
       Se uma carga possui `requires` (ex: Solo Saturado requer Água), ela só pode estar ativa
       se a carga requerida também estiver presente no subconjunto.
    3. Cargas com `excludes`: não podem coexistir.
    4. Cargas permanentes sem grupo de exclusão estão sempre presentes;
       cargas permanentes com grupo de exclusão (ex: Solo Seco vs Solo Sat) são alternadas uma por vez.
    """
    # Identificadores de referência para mapeamento de dependências
    # Pode ser name ou id
    name_to_load = {}
    for idx, l in enumerate(user_loads):
        load_id = l.get('id') or f"load_{idx}"
        l['_id'] = load_id
        name_to_load[l.get('name', '').strip()] = l
        name_to_load[load_id] = l

    # Separar em grupos de exclusão
    exclusive_groups: Dict[str, List[Dict[str, Any]]] = {}
    independent_permanents: List[Dict[str, Any]] = []
    independent_variables: List[Dict[str, Any]] = []

    for l in user_loads:
        meta = get_load_meta(l.get('type', ''))
        is_var = meta.get('isVariable', False)
        grp = (l.get('group') or '').strip()

        if grp:
            if grp not in exclusive_groups:
                exclusive_groups[grp] = []
            exclusive_groups[grp].append(l)
        else:
            if is_var:
                independent_variables.append(l)
            else:
                independent_permanents.append(l)

    # Base: permanentes independentes sempre presentes
    base_sets = [list(independent_permanents)]

    # Ramificar grupos exclusivos (XOR)
    for grp_name, grp_items in exclusive_groups.items():
        new_base_sets = []
        for b_set in base_sets:
            # Caso em que nenhuma carga do grupo atua (se permitido / opcional)
            # Para solo (empuxo), sempre atua uma condição, mas permitimos alívio
            # Se for solo/permanente exclusivo, tipicamente atua exatamente uma
            all_perm = all(not get_load_meta(item.get('type', '')).get('isVariable', False) for item in grp_items)
            if not all_perm:
                new_base_sets.append(list(b_set))  # nenhuma ativa
            
            # Uma e apenas uma ativa
            for item in grp_items:
                new_base_sets.append(b_set + [item])
        base_sets = new_base_sets

    # Ramificar variáveis independentes (cada uma pode atuar ou não)
    candidate_sets = base_sets
    for v in independent_variables:
        new_cand = []
        for c_set in candidate_sets:
            new_cand.append(list(c_set))       # não atua
            new_cand.append(c_set + [v])        # atua
        candidate_sets = new_cand

    # Filtrar por regras de dependência (requires / AND) e incompatibilidade (excludes / NOT)
    valid_sets = []
    for cand in candidate_sets:
        cand_ids = {l['_id'] for l in cand}
        cand_names = {l.get('name', '').strip() for l in cand}
        
        is_valid = True
        for l in cand:
            # Requisitos obrigatórios (AND / Implies)
            # Ex: Solo Saturado -> requer 'Água' ou ID
            req_list = l.get('requires')
            if req_list:
                if isinstance(req_list, str):
                    req_list = [req_list]
                for req in req_list:
                    req_str = str(req).strip()
                    if req_str and (req_str not in cand_ids and req_str not in cand_names):
                        is_valid = False
                        break
            if not is_valid:
                break

            # Incompatibilidades (NOT)
            excl_list = l.get('excludes')
            if excl_list:
                if isinstance(excl_list, str):
                    excl_list = [excl_list]
                for excl in excl_list:
                    excl_str = str(excl).strip()
                    if excl_str and (excl_str in cand_ids or excl_str in cand_names):
                        is_valid = False
                        break
            if not is_valid:
                break

        # Regra de Coexistência Explícita Geotécnica:
        # Se 'Solo Seco' estiver ativo, 'Água' / 'Pressão Hidrostática' NÃO pode estar ativo
        # Se 'Solo Saturado' estiver ativo e existir uma carga de 'Água', elas devem coexistir
        has_solo_seco = any('seco' in l.get('name', '').lower() or 'seco' in l.get('type', '').lower() for l in cand)
        has_solo_sat = any('saturado' in l.get('name', '').lower() or 'saturado' in l.get('type', '').lower() for l in cand)
        has_agua = any('água' in l.get('name', '').lower() or 'agua' in l.get('name', '').lower() or 'hidrostática' in l.get('name', '').lower() or 'hidrostatica' in l.get('name', '').lower() for l in cand)

        if has_solo_seco and has_agua:
            # Solo seco é incompatível com nível d'água ativo
            is_valid = False

        if is_valid:
            valid_sets.append(cand)

    # Remover duplicatas estruturais se houver
    unique_sets = []
    seen = set()
    for s in valid_sets:
        key = tuple(sorted(l['_id'] for l in s))
        if key not in seen:
            seen.add(key)
            unique_sets.append(s)

    return unique_sets if unique_sets else [user_loads]


def calculate_combinations(inputs: Any, standard: str = 'NBR 8681', method: str = 'ELU_NORMAL') -> Dict[str, Any]:
    """
    Função principal exposta ao Eel/Frontend.
    Aceita:
      inputs: list de cargas OU dict com 'loads', 'standard', 'method', 'options'.
      standard: (opcional) norma quando inputs é list.
      method: (opcional) método quando inputs é list.
    """
    if isinstance(inputs, list):
        user_loads = inputs
    elif isinstance(inputs, dict):
        user_loads = inputs.get('loads', [])
        standard = inputs.get('standard', standard)
        method = inputs.get('method', method)
    else:
        return {'error': 'Formato de entrada inválido'}

    if not user_loads:
        return {
            'combinations': {'elu': [], 'els_rara': [], 'els_freq': [], 'els_qp': []},
            'envelopes': {'max_elu': 0, 'min_elu': 0, 'max_els': 0, 'min_els': 0}
        }

    # 1. Obter todos os subconjuntos de cargas que respeitam as regras de exclusão e coexistência
    valid_subsets = generate_valid_load_subsets(user_loads)

    standard_upper = standard.upper()
    method_upper = (method or 'ELU_NORMAL').upper()
    if any(k in method_upper for k in ['GEO', 'GEOTEC', 'TOMB', 'DESL', 'FS_GLOBAL', 'PONDERADA']):
        return calc_geotechnical_combinations(valid_subsets, method, standard)
    elif 'EUROCODE' in standard_upper or 'EN 1990' in standard_upper or 'EC0' in standard_upper:
        return calc_eurocode_combinations(valid_subsets, method)
    elif 'ASCE' in standard_upper or 'IBC' in standard_upper:
        return calc_asce_combinations(valid_subsets, method)
    else:
        return calc_nbr_combinations(valid_subsets, method)


def calc_nbr_combinations(valid_subsets: List[List[Dict[str, Any]]], method: str = 'ELU_NORMAL') -> Dict[str, Any]:
    """Cálculo segundo NBR 8681:2003 / NBR 6118:2023."""
    combinations = {'elu': [], 'els_rara': [], 'els_freq': [], 'els_qp': []}
    is_special = ('ESPECIAL' in method.upper() or 'CONSTRUCAO' in method.upper())

    seen_formulas = {'elu': set(), 'els_rara': set(), 'els_freq': set(), 'els_qp': set()}

    for load_set in valid_subsets:
        perms = [l for l in load_set if not get_load_meta(l.get('type', '')).get('isVariable', False)]
        vars_ = [l for l in load_set if get_load_meta(l.get('type', '')).get('isVariable', False)]

        # Permutações favorável (1.00) vs desfavorável (gamma_g)
        perm_factor_sets = [[]]
        for p in perms:
            meta = get_load_meta(p.get('type', ''))
            gamma_unfav = 1.25 if is_special else meta['nbr']['gamma_g_unfav']
            gamma_fav = meta['nbr']['gamma_g_fav']
            new_sets = []
            for existing in perm_factor_sets:
                new_sets.append(existing + [{'load': p, 'factor': gamma_unfav}])
                if gamma_fav != gamma_unfav:
                    new_sets.append(existing + [{'load': p, 'factor': gamma_fav}])
            perm_factor_sets = new_sets

        # 1. ELU
        for perm_set in perm_factor_sets:
            if vars_:
                for q_princ in vars_:
                    val_terms = []
                    str_terms = []
                    for p_data in perm_set:
                        f = p_data['factor']
                        l = p_data['load']
                        val_terms.append(f * float(l['value']))
                        str_terms.append(f"{f:.2f}*{l['name']}")

                    meta_qp = get_load_meta(q_princ.get('type', ''))
                    gamma_q_princ = 1.20 if is_special else meta_qp['nbr']['gamma_q']
                    val_terms.append(gamma_q_princ * float(q_princ['value']))
                    str_terms.append(f"{gamma_q_princ:.2f}*{q_princ['name']}")

                    for q_sec in vars_:
                        if q_sec == q_princ:
                            continue
                        meta_qs = get_load_meta(q_sec.get('type', ''))
                        psi0 = meta_qs['nbr']['psi0']
                        factor = gamma_q_princ * psi0
                        val_terms.append(factor * float(q_sec['value']))
                        str_terms.append(f"{factor:.2f}*{q_sec['name']}")

                    form_str = " + ".join(str_terms)
                    if form_str not in seen_formulas['elu']:
                        seen_formulas['elu'].add(form_str)
                        combinations['elu'].append({
                            'title': f"ELU (Princ: {q_princ['name']})",
                            'formula': form_str,
                            'result': sum(val_terms),
                            'standard': 'NBR 8681'
                        })
            else:
                val_terms = []
                str_terms = []
                for p_data in perm_set:
                    f = p_data['factor']
                    l = p_data['load']
                    val_terms.append(f * float(l['value']))
                    str_terms.append(f"{f:.2f}*{l['name']}")
                if val_terms:
                    form_str = " + ".join(str_terms)
                    if form_str not in seen_formulas['elu']:
                        seen_formulas['elu'].add(form_str)
                        combinations['elu'].append({
                            'title': 'ELU (Apenas Permanentes)',
                            'formula': form_str,
                            'result': sum(val_terms),
                            'standard': 'NBR 8681'
                        })

        # 2. ELS Quase-Permanente
        qp_val = [1.0 * float(g['value']) for g in perms]
        qp_str = [f"1.00*{g['name']}" for g in perms]
        for q in vars_:
            psi2 = get_load_meta(q.get('type', ''))['nbr']['psi2']
            qp_val.append(psi2 * float(q['value']))
            qp_str.append(f"{psi2:.2f}*{q['name']}")
        qp_form = " + ".join(qp_str)
        if qp_form not in seen_formulas['els_qp']:
            seen_formulas['els_qp'].add(qp_form)
            combinations['els_qp'].append({
                'title': 'ELS - Quase-Permanente',
                'formula': qp_form,
                'result': sum(qp_val),
                'standard': 'NBR 8681'
            })

        # 3. ELS Frequente & Rara
        if vars_:
            for q_princ in vars_:
                freq_val = [1.0 * float(g['value']) for g in perms]
                freq_str = [f"1.00*{g['name']}" for g in perms]
                rara_val = list(freq_val)
                rara_str = list(freq_str)

                meta_qp = get_load_meta(q_princ.get('type', ''))
                # Frequente: psi1 * Q_princ
                freq_val.append(meta_qp['nbr']['psi1'] * float(q_princ['value']))
                freq_str.append(f"{meta_qp['nbr']['psi1']:.2f}*{q_princ['name']}")
                # Rara: 1.00 * Q_princ
                rara_val.append(1.0 * float(q_princ['value']))
                rara_str.append(f"1.00*{q_princ['name']}")

                for q_sec in vars_:
                    if q_sec == q_princ:
                        continue
                    meta_qs = get_load_meta(q_sec.get('type', ''))
                    # Frequente secundária: psi2 * Q_sec
                    freq_val.append(meta_qs['nbr']['psi2'] * float(q_sec['value']))
                    freq_str.append(f"{meta_qs['nbr']['psi2']:.2f}*{q_sec['name']}")
                    # Rara secundária: psi1 * Q_sec (ou psi0 dependendo da norma)
                    rara_val.append(meta_qs['nbr']['psi1'] * float(q_sec['value']))
                    rara_str.append(f"{meta_qs['nbr']['psi1']:.2f}*{q_sec['name']}")

                f_form = " + ".join(freq_str)
                if f_form not in seen_formulas['els_freq']:
                    seen_formulas['els_freq'].add(f_form)
                    combinations['els_freq'].append({
                        'title': f"ELS - Frequente (Princ: {q_princ['name']})",
                        'formula': f_form,
                        'result': sum(freq_val),
                        'standard': 'NBR 8681'
                    })

                r_form = " + ".join(rara_str)
                if r_form not in seen_formulas['els_rara']:
                    seen_formulas['els_rara'].add(r_form)
                    combinations['els_rara'].append({
                        'title': f"ELS - Rara (Princ: {q_princ['name']})",
                        'formula': r_form,
                        'result': sum(rara_val),
                        'standard': 'NBR 8681'
                    })

    envelopes = compute_envelopes(combinations)
    return {'combinations': combinations, 'envelopes': envelopes, 'standard': 'NBR 8681 / NBR 6118'}


def calc_geotechnical_combinations(valid_subsets: List[List[Dict[str, Any]]], method: str = 'GEO_COMPLETA', standard: str = 'NBR 8681') -> Dict[str, Any]:
    """
    Geração de combinações geotécnicas para fundações rasas e estruturas de apoio segundo NBR 6122 / NBR 8681 e Eurocode 7.
    Métodos:
      - GEO_FS_GLOBAL: Combinações características sem ponderação (gama=1.00) para verificação de FS Tombamento, FS Deslizamento e Tensão Admissível.
      - GEO_PONDERADA: Combinações ponderadas de ELU (EQU Tombamento com alívio 0.90G, GEO-SLI Deslizamento e GEO-STR Capacidade de Carga).
      - GEO_COMPLETA: Consolidação de ambos os conjuntos.
    """
    method_upper = method.upper()
    is_global_only = ('FS_GLOBAL' in method_upper) and ('COMPLETA' not in method_upper) and ('PONDERADA' not in method_upper)
    is_ponderada_only = ('PONDERADA' in method_upper) and ('COMPLETA' not in method_upper) and ('FS_GLOBAL' not in method_upper)
    include_ponderada = not is_global_only
    include_global = not is_ponderada_only

    combinations = {'elu': [], 'els_rara': [], 'els_freq': [], 'els_qp': []}
    seen_formulas = {'elu': set(), 'els_rara': set(), 'els_freq': set(), 'els_qp': set()}

    is_eurocode = any(k in standard.upper() for k in ['EUROCODE', 'EN 1990', 'EC7'])

    gamma_fav = 0.90
    gamma_unfav_g = 1.35 if is_eurocode else 1.40
    gamma_unfav_equ_g = 1.10 if is_eurocode else 1.35
    gamma_q = 1.50 if is_eurocode else 1.40

    for load_set in valid_subsets:
        perms = [l for l in load_set if not get_load_meta(l.get('type', '')).get('isVariable', False)]
        vars_ = [l for l in load_set if get_load_meta(l.get('type', '')).get('isVariable', False)]

        # ---------------------------------------------------------------------
        # 1. COMBINAÇÕES PONDERADAS (ELU / LRFD / NBR 6122 ANEXOS A E B)
        # ---------------------------------------------------------------------
        if include_ponderada:
            # 1.A - EQU: Tombamento Crítico (Alívio vertical 0.90G + Esforços desestabilizantes majorados)
            destab_vars = [v for v in vars_ if classify_geo_role(v) in ['destabilizing_moment', 'uplift']]
            if not destab_vars:
                destab_vars = [v for v in vars_ if classify_geo_role(v) in ['destabilizing_horizontal'] or 'vento' in v.get('name', '').lower() or 'vento' in v.get('type', '').lower()]

            if destab_vars:
                for q_princ in destab_vars:
                    val_terms = []
                    str_terms = []
                    for p in perms:
                        role = classify_geo_role(p)
                        val = float(p.get('value', 0.0))
                        f = gamma_fav if role in ['stabilizing'] else gamma_unfav_equ_g
                        val_terms.append(f * val)
                        str_terms.append(f"{f:.2f}*{p.get('name')}")

                    val_terms.append(gamma_q * float(q_princ.get('value', 0.0)))
                    str_terms.append(f"{gamma_q:.2f}*{q_princ.get('name')}")

                    for q_sec in destab_vars:
                        if q_sec == q_princ:
                            continue
                        meta_qs = get_load_meta(q_sec.get('type', ''))
                        psi0 = meta_qs['ec']['psi0'] if is_eurocode else meta_qs['nbr']['psi0']
                        f_sec = gamma_q * psi0
                        val_terms.append(f_sec * float(q_sec.get('value', 0.0)))
                        str_terms.append(f"{f_sec:.2f}*{q_sec.get('name')}")

                    form_str = " + ".join(str_terms)
                    seen_key = ('tombamento', form_str)
                    if seen_key not in seen_formulas['elu']:
                        seen_formulas['elu'].add(seen_key)
                        combinations['elu'].append({
                            'title': f"EQU - Tombamento Crítico (Alívio 0.90G + {q_princ.get('name')})",
                            'formula': form_str,
                            'result': sum(val_terms),
                            'category': 'tombamento',
                            'limit_state': 'EQU (Tombamento)',
                            'criterion': 'M_dst,d <= M_stb,d (NBR 6122 Anexo A / NBR 8681)',
                            'standard': 'NBR 6122 / NBR 8681' if not is_eurocode else 'Eurocode EN 1990 (EQU)'
                        })
            else:
                # EQU permanente (somente se houver ação permanente desestabilizante / tombante / empuxo)
                has_destab_perm = any(classify_geo_role(p) in ['destabilizing_moment', 'destabilizing_horizontal', 'uplift'] for p in perms)
                if has_destab_perm:
                    val_terms = []
                    str_terms = []
                    for p in perms:
                        role = classify_geo_role(p)
                        val = float(p.get('value', 0.0))
                        f = gamma_fav if role == 'stabilizing' else gamma_unfav_equ_g
                        val_terms.append(f * val)
                        str_terms.append(f"{f:.2f}*{p.get('name')}")
                    if val_terms:
                        form_str = " + ".join(str_terms)
                        seen_key = ('tombamento', form_str)
                        if seen_key not in seen_formulas['elu']:
                            seen_formulas['elu'].add(seen_key)
                            combinations['elu'].append({
                                'title': 'EQU - Tombamento Crítico (Alívio 0.90G + Permanente Desfavorável)',
                                'formula': form_str,
                                'result': sum(val_terms),
                                'category': 'tombamento',
                                'limit_state': 'EQU (Tombamento)',
                                'criterion': 'M_dst,d <= M_stb,d (NBR 6122 Anexo A / NBR 8681)',
                                'standard': 'NBR 6122 / NBR 8681' if not is_eurocode else 'Eurocode EN 1990 (EQU)'
                            })

            # 1.B - GEO-SLI: Deslizamento Crítico (Normal vertical estabilizante 0.90G + Cortantes desfavoráveis)
            horiz_vars = [v for v in vars_ if classify_geo_role(v) == 'destabilizing_horizontal' or ('horizontal' in v.get('name', '').lower() and 'momento' not in v.get('name', '').lower())]
            if horiz_vars:
                for q_princ in horiz_vars:
                    val_terms = []
                    str_terms = []
                    for p in perms:
                        role = classify_geo_role(p)
                        val = float(p.get('value', 0.0))
                        f = gamma_fav if role == 'stabilizing' else gamma_unfav_g
                        val_terms.append(f * val)
                        str_terms.append(f"{f:.2f}*{p.get('name')}")

                    val_terms.append(gamma_q * float(q_princ.get('value', 0.0)))
                    str_terms.append(f"{gamma_q:.2f}*{q_princ.get('name')}")

                    for q_sec in horiz_vars:
                        if q_sec == q_princ:
                            continue
                        meta_qs = get_load_meta(q_sec.get('type', ''))
                        psi0 = meta_qs['ec']['psi0'] if is_eurocode else meta_qs['nbr']['psi0']
                        f_sec = gamma_q * psi0
                        val_terms.append(f_sec * float(q_sec.get('value', 0.0)))
                        str_terms.append(f"{f_sec:.2f}*{q_sec.get('name')}")

                    form_str = " + ".join(str_terms)
                    seen_key = ('deslizamento', form_str)
                    if seen_key not in seen_formulas['elu']:
                        seen_formulas['elu'].add(seen_key)
                        combinations['elu'].append({
                            'title': f"GEO-SLI - Deslizamento Crítico (Normal 0.90G + H máx {q_princ.get('name')})",
                            'formula': form_str,
                            'result': sum(val_terms),
                            'category': 'deslizamento',
                            'limit_state': 'GEO-SLI (Deslizamento)',
                            'criterion': 'H_sd <= R_sd (NBR 6122 § 7.3 / Anexo B)',
                            'standard': 'NBR 6122 / NBR 8681' if not is_eurocode else 'Eurocode EN 1990 (GEO)'
                        })
            else:
                has_destab_horiz_perm = any(classify_geo_role(p) in ['destabilizing_horizontal'] for p in perms)
                if has_destab_horiz_perm:
                    val_terms = []
                    str_terms = []
                    for p in perms:
                        role = classify_geo_role(p)
                        val = float(p.get('value', 0.0))
                        f = gamma_fav if role == 'stabilizing' else gamma_unfav_g
                        val_terms.append(f * val)
                        str_terms.append(f"{f:.2f}*{p.get('name')}")
                    if val_terms:
                        form_str = " + ".join(str_terms)
                        seen_key = ('deslizamento', form_str)
                        if seen_key not in seen_formulas['elu']:
                            seen_formulas['elu'].add(seen_key)
                            combinations['elu'].append({
                                'title': 'GEO-SLI - Deslizamento Crítico (Normal 0.90G + Empuxo)',
                                'formula': form_str,
                                'result': sum(val_terms),
                                'category': 'deslizamento',
                                'limit_state': 'GEO-SLI (Deslizamento)',
                                'criterion': 'H_sd <= R_sd (NBR 6122 § 7.3 / Anexo B)',
                                'standard': 'NBR 6122 / NBR 8681' if not is_eurocode else 'Eurocode EN 1990 (GEO)'
                            })

            # 1.C - GEO-STR: Capacidade de Carga / Ruptura (Normal Máxima Desfavorável)
            if vars_:
                for q_princ in vars_:
                    val_terms = []
                    str_terms = []
                    for p in perms:
                        val = float(p.get('value', 0.0))
                        val_terms.append(gamma_unfav_g * val)
                        str_terms.append(f"{gamma_unfav_g:.2f}*{p.get('name')}")

                    val_terms.append(gamma_q * float(q_princ.get('value', 0.0)))
                    str_terms.append(f"{gamma_q:.2f}*{q_princ.get('name')}")

                    for q_sec in vars_:
                        if q_sec == q_princ:
                            continue
                        meta_qs = get_load_meta(q_sec.get('type', ''))
                        psi0 = meta_qs['ec']['psi0'] if is_eurocode else meta_qs['nbr']['psi0']
                        f_sec = gamma_q * psi0
                        val_terms.append(f_sec * float(q_sec.get('value', 0.0)))
                        str_terms.append(f"{f_sec:.2f}*{q_sec.get('name')}")

                    form_str = " + ".join(str_terms)
                    seen_key = ('capacidade_carga', form_str)
                    if seen_key not in seen_formulas['elu']:
                        seen_formulas['elu'].add(seen_key)
                        combinations['elu'].append({
                            'title': f"GEO-STR - Capacidade de Carga Máx (Princ: {q_princ.get('name')})",
                            'formula': form_str,
                            'result': sum(val_terms),
                            'category': 'capacidade_carga',
                            'limit_state': 'GEO-STR (Capacidade de Carga)',
                            'criterion': 'N_sd <= R_sd (NBR 6122 / NBR 6118)',
                            'standard': 'NBR 6122 / NBR 8681' if not is_eurocode else 'Eurocode EN 1990 (STR/GEO)'
                        })
            else:
                val_terms = []
                str_terms = []
                for p in perms:
                    val = float(p.get('value', 0.0))
                    val_terms.append(gamma_unfav_g * val)
                    str_terms.append(f"{gamma_unfav_g:.2f}*{p.get('name')}")
                if val_terms:
                    form_str = " + ".join(str_terms)
                    seen_key = ('capacidade_carga', form_str)
                    if seen_key not in seen_formulas['elu']:
                        seen_formulas['elu'].add(seen_key)
                        combinations['elu'].append({
                            'title': 'GEO-STR - Capacidade de Carga (Apenas Permanentes)',
                            'formula': form_str,
                            'result': sum(val_terms),
                            'category': 'capacidade_carga',
                            'limit_state': 'GEO-STR (Capacidade de Carga)',
                            'criterion': 'N_sd <= R_sd (NBR 6122 / NBR 6118)',
                            'standard': 'NBR 6122 / NBR 8681' if not is_eurocode else 'Eurocode EN 1990 (STR/GEO)'
                        })

        # ---------------------------------------------------------------------
        # 2. COMBINAÇÕES FS GLOBAL / ELS SERVIÇO (NBR 6122 / ASD)
        # ---------------------------------------------------------------------
        if include_global:
            # 2.A - FS Global: Tombamento (Valores Característicos sem ponderação gama=1.00)
            val_terms_tomb = []
            str_terms_tomb = []
            for p in perms:
                val_terms_tomb.append(1.0 * float(p.get('value', 0.0)))
                str_terms_tomb.append(f"1.00*{p.get('name')}")
            
            if vars_:
                for q_princ in vars_:
                    val_tomb = list(val_terms_tomb)
                    str_tomb = list(str_terms_tomb)
                    val_tomb.append(1.0 * float(q_princ.get('value', 0.0)))
                    str_tomb.append(f"1.00*{q_princ.get('name')}")

                    for q_sec in vars_:
                        if q_sec == q_princ:
                            continue
                        meta_qs = get_load_meta(q_sec.get('type', ''))
                        psi0 = meta_qs['ec']['psi0'] if is_eurocode else meta_qs['nbr']['psi0']
                        val_tomb.append(psi0 * float(q_sec.get('value', 0.0)))
                        str_tomb.append(f"{psi0:.2f}*{q_sec.get('name')}")

                    form_str = " + ".join(str_tomb)
                    seen_key = ('tombamento', form_str)
                    if seen_key not in seen_formulas['els_rara']:
                        seen_formulas['els_rara'].add(seen_key)
                        combinations['els_rara'].append({
                            'title': f"FS Global - Tombamento & Rara (Princ: {q_princ.get('name')})",
                            'formula': form_str,
                            'result': sum(val_tomb),
                            'category': 'tombamento',
                            'limit_state': 'FS Global (Tombamento)',
                            'criterion': 'FS_tomb >= 1.50 (ou 1.20 c/ vento) - NBR 6122',
                            'standard': 'NBR 6122 (FS Global)'
                        })
            else:
                if val_terms_tomb:
                    form_str = " + ".join(str_terms_tomb)
                    seen_key = ('tombamento', form_str)
                    if seen_key not in seen_formulas['els_rara']:
                        seen_formulas['els_rara'].add(seen_key)
                        combinations['els_rara'].append({
                            'title': 'FS Global - Tombamento (Permanente)',
                            'formula': form_str,
                            'result': sum(val_terms_tomb),
                            'category': 'tombamento',
                            'limit_state': 'FS Global (Tombamento)',
                            'criterion': 'FS_tomb >= 1.50 - NBR 6122',
                            'standard': 'NBR 6122 (FS Global)'
                        })

            # 2.B - FS Global: Deslizamento (Valores Característicos)
            form_desl = " + ".join([f"1.00*{l.get('name')}" for l in load_set])
            seen_key = ('deslizamento', form_desl)
            if form_desl and (seen_key not in seen_formulas['els_rara']):
                seen_formulas['els_rara'].add(seen_key)
                combinations['els_rara'].append({
                    'title': 'FS Global - Deslizamento (Cargas Características)',
                    'formula': form_desl,
                    'result': sum(float(l.get('value', 0.0)) for l in load_set),
                    'category': 'deslizamento',
                    'limit_state': 'FS Global (Deslizamento)',
                    'criterion': 'FS_desl >= 1.50 (ou 1.20 c/ vento) - NBR 6122',
                    'standard': 'NBR 6122 (FS Global)'
                })

            # 2.C - ELS Quase-Permanente (Recalques por adensamento / Longa Duração)
            qp_val = [1.0 * float(g.get('value', 0.0)) for g in perms]
            qp_str = [f"1.00*{g.get('name')}" for g in perms]
            for q in vars_:
                meta_q = get_load_meta(q.get('type', ''))
                psi2 = meta_q['ec']['psi2'] if is_eurocode else meta_q['nbr']['psi2']
                qp_val.append(psi2 * float(q.get('value', 0.0)))
                qp_str.append(f"{psi2:.2f}*{q.get('name')}")
            qp_form = " + ".join(qp_str)
            if qp_form not in seen_formulas['els_qp']:
                seen_formulas['els_qp'].add(qp_form)
                combinations['els_qp'].append({
                    'title': 'FS Global / ELS - Quase-Permanente (Recalques / Deformação Lenta)',
                    'formula': qp_form,
                    'result': sum(qp_val),
                    'category': 'capacidade_carga',
                    'limit_state': 'ELS (Quase-Permanente)',
                    'criterion': 'Recalques Admissíveis e Tensão Efetiva NBR 6122',
                    'standard': 'NBR 6122 / NBR 8681'
                })

            # 2.D - ELS Frequente (Fissuração e Vibrações)
            if vars_:
                for q_princ in vars_:
                    f_val = [1.0 * float(g.get('value', 0.0)) for g in perms]
                    f_str = [f"1.00*{g.get('name')}" for g in perms]
                    meta_qp = get_load_meta(q_princ.get('type', ''))
                    psi1_p = meta_qp['ec']['psi1'] if is_eurocode else meta_qp['nbr']['psi1']
                    f_val.append(psi1_p * float(q_princ.get('value', 0.0)))
                    f_str.append(f"{psi1_p:.2f}*{q_princ.get('name')}")

                    for q_sec in vars_:
                        if q_sec == q_princ:
                            continue
                        meta_qs = get_load_meta(q_sec.get('type', ''))
                        psi2_s = meta_qs['ec']['psi2'] if is_eurocode else meta_qs['nbr']['psi2']
                        f_val.append(psi2_s * float(q_sec.get('value', 0.0)))
                        f_str.append(f"{psi2_s:.2f}*{q_sec.get('name')}")

                    f_form = " + ".join(f_str)
                    if f_form not in seen_formulas['els_freq']:
                        seen_formulas['els_freq'].add(f_form)
                        combinations['els_freq'].append({
                            'title': f"FS Global / ELS - Frequente (Princ: {q_princ.get('name')})",
                            'formula': f_form,
                            'result': sum(f_val),
                            'category': 'servico',
                            'limit_state': 'ELS (Frequente)',
                            'criterion': 'Fissuração em fundações de concreto NBR 6118',
                            'standard': 'NBR 6122 / NBR 8681'
                        })

    envelopes = compute_envelopes(combinations)
    return {
        'combinations': combinations,
        'envelopes': envelopes,
        'standard': f"{standard} / NBR 6122 (Geotécnica)",
        'method': method
    }


def calc_eurocode_combinations(valid_subsets: List[List[Dict[str, Any]]], method: str = 'STR_GEO_B') -> Dict[str, Any]:
    """Cálculo segundo Eurocode EN 1990 (EC0 / EC7)."""
    combinations = {'elu': [], 'els_rara': [], 'els_freq': [], 'els_qp': []}
    seen_formulas = {'elu': set(), 'els_rara': set(), 'els_freq': set(), 'els_qp': set()}

    is_equ = 'EQU' in method.upper()
    is_610ab = '610AB' in method.upper()

    for load_set in valid_subsets:
        perms = [l for l in load_set if not get_load_meta(l.get('type', '')).get('isVariable', False)]
        vars_ = [l for l in load_set if get_load_meta(l.get('type', '')).get('isVariable', False)]

        # Fatores Eurocode
        gamma_G_unfav = 1.10 if is_equ else 1.35
        gamma_G_fav = 0.90 if is_equ else 1.00
        gamma_Q = 1.50

        perm_factor_sets = [[]]
        for p in perms:
            new_sets = []
            for existing in perm_factor_sets:
                new_sets.append(existing + [{'load': p, 'factor': gamma_G_unfav}])
                if gamma_G_fav != gamma_G_unfav:
                    new_sets.append(existing + [{'load': p, 'factor': gamma_G_fav}])
            perm_factor_sets = new_sets

        # 1. ELU (EN 1990 Eq. 6.10 ou 6.10a/b)
        for perm_set in perm_factor_sets:
            if vars_:
                for q_princ in vars_:
                    # Eq. 6.10 padrão: gamma_G * G + gamma_Q * Q1 + sum(gamma_Q * psi0_i * Qi)
                    val_terms = []
                    str_terms = []
                    for p_data in perm_set:
                        f = p_data['factor']
                        l = p_data['load']
                        val_terms.append(f * float(l['value']))
                        str_terms.append(f"{f:.2f}*{l['name']}")

                    val_terms.append(gamma_Q * float(q_princ['value']))
                    str_terms.append(f"{gamma_Q:.2f}*{q_princ['name']}")

                    for q_sec in vars_:
                        if q_sec == q_princ:
                            continue
                        psi0 = get_load_meta(q_sec.get('type', ''))['ec']['psi0']
                        f_sec = gamma_Q * psi0
                        val_terms.append(f_sec * float(q_sec['value']))
                        str_terms.append(f"{f_sec:.2f}*{q_sec['name']}")

                    form_str = " + ".join(str_terms)
                    if form_str not in seen_formulas['elu']:
                        seen_formulas['elu'].add(form_str)
                        combinations['elu'].append({
                            'title': f"EC-ELU (Q_princ: {q_princ['name']})",
                            'formula': form_str,
                            'result': sum(val_terms),
                            'standard': 'Eurocode EN 1990'
                        })
            else:
                val_terms = []
                str_terms = []
                for p_data in perm_set:
                    f = p_data['factor']
                    l = p_data['load']
                    val_terms.append(f * float(l['value']))
                    str_terms.append(f"{f:.2f}*{l['name']}")
                if val_terms:
                    form_str = " + ".join(str_terms)
                    if form_str not in seen_formulas['elu']:
                        seen_formulas['elu'].add(form_str)
                        combinations['elu'].append({
                            'title': 'EC-ELU (Permanentes)',
                            'formula': form_str,
                            'result': sum(val_terms),
                            'standard': 'Eurocode EN 1990'
                        })

        # 2. ELS Quase-Permanente (G + sum(psi2 * Q))
        qp_val = [1.0 * float(g['value']) for g in perms]
        qp_str = [f"1.00*{g['name']}" for g in perms]
        for q in vars_:
            psi2 = get_load_meta(q.get('type', ''))['ec']['psi2']
            qp_val.append(psi2 * float(q['value']))
            qp_str.append(f"{psi2:.2f}*{q['name']}")
        qp_form = " + ".join(qp_str)
        if qp_form not in seen_formulas['els_qp']:
            seen_formulas['els_qp'].add(qp_form)
            combinations['els_qp'].append({
                'title': 'EC-ELS Quase-Permanente',
                'formula': qp_form,
                'result': sum(qp_val),
                'standard': 'Eurocode EN 1990'
            })

        # 3. ELS Frequente (G + psi1 * Q1 + sum(psi2 * Qi))
        if vars_:
            for q_princ in vars_:
                freq_val = [1.0 * float(g['value']) for g in perms]
                freq_str = [f"1.00*{g['name']}" for g in perms]
                carac_val = list(freq_val)
                carac_str = list(freq_str)

                meta_qp = get_load_meta(q_princ.get('type', ''))
                # Frequente: psi1
                freq_val.append(meta_qp['ec']['psi1'] * float(q_princ['value']))
                freq_str.append(f"{meta_qp['ec']['psi1']:.2f}*{q_princ['name']}")
                # Característica (Rara no EC): 1.00 * Q1
                carac_val.append(1.0 * float(q_princ['value']))
                carac_str.append(f"1.00*{q_princ['name']}")

                for q_sec in vars_:
                    if q_sec == q_princ:
                        continue
                    meta_qs = get_load_meta(q_sec.get('type', ''))
                    # Frequente: psi2
                    freq_val.append(meta_qs['ec']['psi2'] * float(q_sec['value']))
                    freq_str.append(f"{meta_qs['ec']['psi2']:.2f}*{q_sec['name']}")
                    # Característica: psi0 * Qi
                    carac_val.append(meta_qs['ec']['psi0'] * float(q_sec['value']))
                    carac_str.append(f"{meta_qs['ec']['psi0']:.2f}*{q_sec['name']}")

                f_form = " + ".join(freq_str)
                if f_form not in seen_formulas['els_freq']:
                    seen_formulas['els_freq'].add(f_form)
                    combinations['els_freq'].append({
                        'title': f"EC-ELS Frequente (Q1: {q_princ['name']})",
                        'formula': f_form,
                        'result': sum(freq_val),
                        'standard': 'Eurocode EN 1990'
                    })

                c_form = " + ".join(carac_str)
                if c_form not in seen_formulas['els_rara']:
                    seen_formulas['els_rara'].add(c_form)
                    combinations['els_rara'].append({
                        'title': f"EC-ELS Característica (Q1: {q_princ['name']})",
                        'formula': c_form,
                        'result': sum(carac_val),
                        'standard': 'Eurocode EN 1990'
                    })

    envelopes = compute_envelopes(combinations)
    return {'combinations': combinations, 'envelopes': envelopes, 'standard': 'Eurocode EN 1990'}


def calc_asce_combinations(valid_subsets: List[List[Dict[str, Any]]], method: str = 'LRFD') -> Dict[str, Any]:
    """Cálculo segundo ASCE 7-16 / ASCE 7-22 (LRFD e ASD)."""
    is_asd = 'ASD' in method.upper()
    combinations = {'elu': [], 'els_rara': [], 'els_freq': [], 'els_qp': []}
    seen_formulas = set()

    for load_set in valid_subsets:
        # Mapear cargas por tipo ASCE: D, L, Lr, S, R, W, E, H, F
        by_asce: Dict[str, List[Dict[str, Any]]] = {}
        for l in load_set:
            meta = get_load_meta(l.get('type', ''))
            atype = meta.get('asce_type', 'D')
            if atype not in by_asce:
                by_asce[atype] = []
            by_asce[atype].append(l)

        def build_combo(factors: Dict[str, float], title: str):
            val_terms = []
            str_terms = []
            for atype, factor in factors.items():
                if factor == 0:
                    continue
                if atype in by_asce:
                    for l in by_asce[atype]:
                        val_terms.append(factor * float(l['value']))
                        str_terms.append(f"{factor:.2f}*{l['name']}")

            if val_terms:
                form_str = " + ".join(str_terms)
                if form_str not in seen_formulas:
                    seen_formulas.add(form_str)
                    target = 'els_rara' if is_asd else 'elu'
                    combinations[target].append({
                        'title': title,
                        'formula': form_str,
                        'result': sum(val_terms),
                        'standard': 'ASCE 7 (ASD)' if is_asd else 'ASCE 7 (LRFD)'
                    })

        if not is_asd:
            # --- ASCE LRFD Basic Combinations ---
            # 1. 1.4D + 1.4F
            build_combo({'D': 1.4, 'F': 1.4}, 'ASCE LRFD 1 (1.4D+1.4F)')
            # 2. 1.2D + 1.6L + 0.5(Lr/S/R) + 1.6H + 1.2F
            build_combo({'D': 1.2, 'L': 1.6, 'Lr': 0.5, 'S': 0.5, 'R': 0.5, 'H': 1.6, 'F': 1.2}, 'ASCE LRFD 2 (1.2D+1.6L+1.6H+1.2F)')
            # 3. 1.2D + 1.6(Lr/S/R) + (1.0L or 0.5W) + 1.6H + 1.2F
            build_combo({'D': 1.2, 'Lr': 1.6, 'S': 1.6, 'R': 1.6, 'L': 1.0, 'H': 1.6, 'F': 1.2}, 'ASCE LRFD 3 (1.2D+1.6Roof+L+1.6H+1.2F)')
            # 4. 1.2D + 1.0W + 1.0L + 0.5(Lr/S/R) + 1.6H + 1.2F
            build_combo({'D': 1.2, 'W': 1.0, 'L': 1.0, 'Lr': 0.5, 'S': 0.5, 'R': 0.5, 'H': 1.6, 'F': 1.2}, 'ASCE LRFD 4 (1.2D+1.0W+L+1.6H+1.2F)')
            # 5. 1.2D + 1.0E + 1.0L + 0.2S + 1.6H + 1.2F
            build_combo({'D': 1.2, 'E': 1.0, 'L': 1.0, 'S': 0.2, 'H': 1.6, 'F': 1.2}, 'ASCE LRFD 5 (1.2D+1.0E+L+1.6H+1.2F)')
            # 6. 0.9D + 1.0W + 1.6H + 1.2F (Uplift / Wind Desfavorável + H + F)
            build_combo({'D': 0.9, 'W': 1.0, 'H': 1.6, 'F': 1.2}, 'ASCE LRFD 6 (0.9D+1.0W+1.6H+1.2F)')
            # 7. 0.9D + 1.0E + 1.6H + 1.2F (Seismic Overturning)
            build_combo({'D': 0.9, 'E': 1.0, 'H': 1.6, 'F': 1.2}, 'ASCE LRFD 7 (0.9D+1.0E+1.6H+1.2F)')
            # 8. 0.9D + 1.6H + 1.2F (Sobrecarga de empuxo e hidrostática)
            build_combo({'D': 0.9, 'H': 1.6, 'F': 1.2}, 'ASCE LRFD 8 (0.9D+1.6H+1.2F)')
            # 9. 0.9D (Alívio / Arrancamento Puro)
            build_combo({'D': 0.9}, 'ASCE LRFD 9 (0.9D Alívio)')
        else:
            # --- ASCE ASD Basic Combinations ---
            # 1. D + F
            build_combo({'D': 1.0, 'F': 1.0}, 'ASCE ASD 1 (D+F)')
            # 2. D + L + H + F
            build_combo({'D': 1.0, 'L': 1.0, 'H': 1.0, 'F': 1.0}, 'ASCE ASD 2 (D+L+H+F)')
            # 3. D + (Lr or S or R) + H + F
            build_combo({'D': 1.0, 'Lr': 1.0, 'S': 1.0, 'R': 1.0, 'H': 1.0, 'F': 1.0}, 'ASCE ASD 3 (D+Roof+H+F)')
            # 4. D + 0.75L + 0.75(Lr/S/R) + H + F
            build_combo({'D': 1.0, 'L': 0.75, 'Lr': 0.75, 'S': 0.75, 'R': 0.75, 'H': 1.0, 'F': 1.0}, 'ASCE ASD 4 (D+0.75L+0.75Roof+H+F)')
            # 5. D + 0.6W + H + F
            build_combo({'D': 1.0, 'W': 0.6, 'H': 1.0, 'F': 1.0}, 'ASCE ASD 5 (D+0.6W+H+F)')
            # 6. D + 0.75L + 0.75(0.6W) + 0.75(Lr/S/R) + H + F
            build_combo({'D': 1.0, 'L': 0.75, 'W': 0.45, 'Lr': 0.75, 'S': 0.75, 'R': 0.75, 'H': 1.0, 'F': 1.0}, 'ASCE ASD 6 (D+0.75L+0.45W+H+F)')
            # 7. 0.6D + 0.6W + 1.0H + 1.0F (Uplift ASD)
            build_combo({'D': 0.6, 'W': 0.6, 'H': 1.0, 'F': 1.0}, 'ASCE ASD 7 (0.6D+0.6W+H+F)')
            # 8. 0.6D + 1.0H + 1.0F
            build_combo({'D': 0.6, 'H': 1.0, 'F': 1.0}, 'ASCE ASD 8 (0.6D+H+F)')
            # 9. 0.6D (Alívio ASD)
            build_combo({'D': 0.6}, 'ASCE ASD 9 (0.6D Alívio)')

    envelopes = compute_envelopes(combinations)
    return {'combinations': combinations, 'envelopes': envelopes, 'standard': 'ASCE 7 (ASD)' if is_asd else 'ASCE 7 (LRFD)'}


def compute_envelopes(combinations: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]:
    """Calcula os valores máximos e mínimos das envoltórias de combinações."""
    all_elu = [c['result'] for c in combinations.get('elu', [])]
    all_els = [c['result'] for c in (combinations.get('els_rara', []) + combinations.get('els_freq', []) + combinations.get('els_qp', []))]

    max_elu = max(all_elu) if all_elu else 0.0
    min_elu = min(all_elu) if all_elu else 0.0
    max_els = max(all_els) if all_els else 0.0
    min_els = min(all_els) if all_els else 0.0

    # Localizar quais combinações geraram os extremos
    max_elu_comb = next((c['title'] for c in combinations.get('elu', []) if math.isclose(c['result'], max_elu, abs_tol=1e-5)), '')
    min_elu_comb = next((c['title'] for c in combinations.get('elu', []) if math.isclose(c['result'], min_elu, abs_tol=1e-5)), '')

    return {
        'max_elu': max_elu,
        'min_elu': min_elu,
        'max_els': max_els,
        'min_els': min_els,
        'max_elu_comb': max_elu_comb,
        'min_elu_comb': min_elu_comb
    }


# Alias para retrocompatibilidade e flexibilidade de importação
generate_combinations_multicode = calculate_combinations
