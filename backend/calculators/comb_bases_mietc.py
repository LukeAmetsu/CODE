"""
Motor de Combinações de Cargas nas Bases - Formato MIETC / Multi-Bases
Processamento em lote de planilhas de cargas nas bases (V, X, Y) com geração
de combinações normativas (NBR 8681, NBR 6118, NBR 6122, Eurocode, ASCE)
e envoltórias críticas para dimensionamento de fundações.
"""

import os
import sys
import io
import math
import openpyxl
from typing import Dict, List, Any, Optional, Tuple

# Coeficientes padrão das ações presentes nas planilhas MIETC
MIETC_ACTION_PROPS = {
    'PP': {
        'name': 'Peso Próprio (PP)',
        'category': 'permanent',
        'isVariable': False,
        'nbr': {'gamma_g_unfav': 1.35, 'gamma_g_fav': 1.00},
        'ec': {'gamma_G_unfav': 1.35, 'gamma_G_fav': 1.00},
        'asce': {'factor_lrfd': 1.20, 'factor_asd': 1.00}
    },
    'CP': {
        'name': 'Carga Permanente / Equipamentos (CP)',
        'category': 'permanent',
        'isVariable': False,
        'nbr': {'gamma_g_unfav': 1.35, 'gamma_g_fav': 1.00},
        'ec': {'gamma_G_unfav': 1.35, 'gamma_G_fav': 1.00},
        'asce': {'factor_lrfd': 1.20, 'factor_asd': 1.00}
    },
    'SCM': {
        'name': 'Sobrecarga de Manutenção (SCM)',
        'category': 'use',
        'isVariable': True,
        'nbr': {'gamma_q': 1.40, 'psi0': 0.70, 'psi1': 0.60, 'psi2': 0.40},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.70, 'psi1': 0.50, 'psi2': 0.30},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },
    'SCP': {
        'name': 'Sobrecarga de Operação / Piso (SCP)',
        'category': 'use',
        'isVariable': True,
        'nbr': {'gamma_q': 1.40, 'psi0': 0.70, 'psi1': 0.60, 'psi2': 0.40},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.70, 'psi1': 0.50, 'psi2': 0.30},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },
    'TCQ': {
        'name': 'Talha / Ponte com Carga (TCQ)',
        'category': 'crane',
        'isVariable': True,
        'nbr': {'gamma_q': 1.40, 'psi0': 0.70, 'psi1': 0.60, 'psi2': 0.40},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.70, 'psi1': 0.50, 'psi2': 0.30},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },
    'TCP': {
        'name': 'Talha / Ponte em Vazio (TCP)',
        'category': 'crane',
        'isVariable': True,
        'nbr': {'gamma_q': 1.40, 'psi0': 0.70, 'psi1': 0.60, 'psi2': 0.40},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.70, 'psi1': 0.50, 'psi2': 0.30},
        'asce': {'factor_lrfd': 1.60, 'factor_asd': 1.00}
    },
    'T+': {
        'name': 'Variação Térmica (T+)',
        'category': 'thermal',
        'isVariable': True,
        'nbr': {'gamma_q': 1.20, 'psi0': 0.60, 'psi1': 0.50, 'psi2': 0.30},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.60, 'psi1': 0.50, 'psi2': 0.00},
        'asce': {'factor_lrfd': 1.20, 'factor_asd': 1.00}
    },
    'CVX+': {
        'name': 'Vento Direção X (CVX+)',
        'category': 'wind_x',
        'isVariable': True,
        'nbr': {'gamma_q': 1.40, 'psi0': 0.60, 'psi1': 0.30, 'psi2': 0.00},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.60, 'psi1': 0.20, 'psi2': 0.00},
        'asce': {'factor_lrfd': 1.00, 'factor_asd': 0.60}
    },
    'CVY+': {
        'name': 'Vento Direção Y (CVY+)',
        'category': 'wind_y',
        'isVariable': True,
        'nbr': {'gamma_q': 1.40, 'psi0': 0.60, 'psi1': 0.30, 'psi2': 0.00},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.60, 'psi1': 0.20, 'psi2': 0.00},
        'asce': {'factor_lrfd': 1.00, 'factor_asd': 0.60}
    },
    'SCA': {
        'name': 'Sobrecarga Acidental (SCA)',
        'category': 'accidental',
        'isVariable': True,
        'nbr': {'gamma_q': 1.40, 'psi0': 0.50, 'psi1': 0.40, 'psi2': 0.20},
        'ec': {'gamma_Q': 1.50, 'psi0': 0.50, 'psi1': 0.30, 'psi2': 0.20},
        'asce': {'factor_lrfd': 1.00, 'factor_asd': 0.75}
    }
}

# Regras lógicas padrão para ações das planilhas MIETC
DEFAULT_ACTION_RULES: Dict[str, Dict[str, Any]] = {
    'CVX+': {'group': 'Vento', 'requires': '', 'type': 'Vento (W)'},
    'CVY+': {'group': 'Vento', 'requires': '', 'type': 'Vento (W)'},
    'TCQ': {'group': 'Talha', 'requires': '', 'type': 'Ponte Rolante / Guindaste (Q)'},
    'TCP': {'group': 'Talha', 'requires': '', 'type': 'Ponte Rolante / Guindaste (Q)'},
}

LOAD_CATALOG_TYPES: Dict[str, Dict[str, Any]] = {
    'Peso Próprio (PP)': {'isVariable': False, 'nbr': {'gamma_g_unfav': 1.35, 'gamma_g_fav': 1.00}},
    'Permanente (G)': {'isVariable': False, 'nbr': {'gamma_g_unfav': 1.35, 'gamma_g_fav': 1.00}},
    'Equipamentos Fixos': {'isVariable': False, 'nbr': {'gamma_g_unfav': 1.35, 'gamma_g_fav': 1.00}},
    'Solo Seco (Empuxo)': {'isVariable': False, 'nbr': {'gamma_g_unfav': 1.40, 'gamma_g_fav': 1.00}},
    'Solo Saturado (Empuxo)': {'isVariable': False, 'nbr': {'gamma_g_unfav': 1.40, 'gamma_g_fav': 1.00}},
    'Pressão Hidrostática / Água': {'isVariable': True, 'nbr': {'gamma_q': 1.40, 'psi0': 0.60, 'psi1': 0.50, 'psi2': 0.30}},
    'Subpressão / Uplift': {'isVariable': True, 'nbr': {'gamma_q': 1.40, 'psi0': 0.60, 'psi1': 0.50, 'psi2': 0.30}},
    'Sobrecarga no Tardoz (Q_solo)': {'isVariable': True, 'nbr': {'gamma_q': 1.40, 'psi0': 0.70, 'psi1': 0.60, 'psi2': 0.40}},
    'Uso Residencial (Q)': {'isVariable': True, 'nbr': {'gamma_q': 1.40, 'psi0': 0.50, 'psi1': 0.40, 'psi2': 0.30}},
    'Uso Escritório/Loja (Q)': {'isVariable': True, 'nbr': {'gamma_q': 1.40, 'psi0': 0.70, 'psi1': 0.60, 'psi2': 0.40}},
    'Garagem/Estacionamento (Q)': {'isVariable': True, 'nbr': {'gamma_q': 1.40, 'psi0': 0.70, 'psi1': 0.60, 'psi2': 0.40}},
    'Cobertura / Manutenção (Q)': {'isVariable': True, 'nbr': {'gamma_q': 1.40, 'psi0': 0.70, 'psi1': 0.60, 'psi2': 0.40}},
    'Ponte Rolante / Guindaste (Q)': {'isVariable': True, 'nbr': {'gamma_q': 1.40, 'psi0': 0.70, 'psi1': 0.60, 'psi2': 0.40}},
    'Outras Ações Variáveis (Q)': {'isVariable': True, 'nbr': {'gamma_q': 1.40, 'psi0': 0.70, 'psi1': 0.60, 'psi2': 0.40}},
    'Vento (W)': {'isVariable': True, 'nbr': {'gamma_q': 1.40, 'psi0': 0.60, 'psi1': 0.30, 'psi2': 0.00}},
    'Temperatura (T)': {'isVariable': True, 'nbr': {'gamma_q': 1.20, 'psi0': 0.60, 'psi1': 0.50, 'psi2': 0.30}},
    'Sobrecarga Acidental (SCA)': {'isVariable': True, 'nbr': {'gamma_q': 1.40, 'psi0': 0.50, 'psi1': 0.40, 'psi2': 0.20}},
    'Impacto / Choque Acidental': {'isVariable': True, 'nbr': {'gamma_q': 1.00, 'psi0': 0.00, 'psi1': 0.00, 'psi2': 0.00}},
    'Carga Acidental de Montagem': {'isVariable': True, 'nbr': {'gamma_q': 1.20, 'psi0': 0.50, 'psi1': 0.30, 'psi2': 0.00}},
    'Incêndio / Ação Excepcional': {'isVariable': True, 'nbr': {'gamma_q': 1.00, 'psi0': 0.00, 'psi1': 0.00, 'psi2': 0.00}},
    'Outras Ações Acidentais': {'isVariable': True, 'nbr': {'gamma_q': 1.30, 'psi0': 0.50, 'psi1': 0.30, 'psi2': 0.10}},
    'Sismo (E)': {'isVariable': True, 'nbr': {'gamma_q': 1.00, 'psi0': 0.30, 'psi1': 0.20, 'psi2': 0.00}},
}


def _fmt_action_token(name: str) -> str:
    """
    Formata o nome da ação para uso em fórmulas legíveis.
    Se a ação termina com '+' ou '-' (ex: 'CVX+', 'CVY+', 'T+'),
    envolve entre parênteses '(CVX+)' para que a fórmula não pareça
    incompleta ou terminando em operador aritmético '+'.
    """
    s = str(name).strip()
    if s.endswith('+') or s.endswith('-'):
        return f"({s})"
    return s


def _generate_companion_sets(
    p_item: str,
    var_items: List[str],
    action_rules: Dict[str, Any]
) -> List[List[str]]:
    """
    Gera conjuntos válidos de ações acompanhantes para uma ação principal p_item,
    respeitando:
    1. Exclusão Mútua (XOR): ações com o mesmo grupo não atuam juntas.
       Para outros grupos, seleciona-se no máximo 1 ação por combinação.
    2. Coexistência Obrigatória (AND): se uma ação requer R, ela só entra se R estiver no conjunto.
    3. Condição Física: 'Solo Seco' e 'Água' são mutuamente incompatíveis.
    """
    import itertools

    p_rule = action_rules.get(p_item, {})
    p_group = (p_rule.get('group') or '').strip()
    p_req = (p_rule.get('requires') or '').strip()

    # Candidatas a acompanhantes (excluindo p_item e ações com o mesmo grupo de p_item)
    cand_items = []
    for it in var_items:
        if it == p_item:
            continue
        it_grp = (action_rules.get(it, {}).get('group') or '').strip()
        if p_group and it_grp and it_grp.lower() == p_group.lower():
            continue  # Excluído pelo grupo XOR da ação principal
        cand_items.append(it)

    # Separar por grupos XOR e independentes
    grp_map: Dict[str, List[str]] = {}
    indep_items: List[str] = []

    for it in cand_items:
        it_grp = (action_rules.get(it, {}).get('group') or '').strip()
        if it_grp:
            g_key = it_grp.lower()
            if g_key not in grp_map:
                grp_map[g_key] = []
            grp_map[g_key].append(it)
        else:
            indep_items.append(it)

    # Opções para cada grupo XOR: escolher 1 item do grupo ou nenhum (None)
    branching_options = []
    for g_key, items in grp_map.items():
        branching_options.append([None] + items)

    if branching_options:
        cartesian = list(itertools.product(*branching_options))
    else:
        cartesian = [()]

    valid_sets: List[List[str]] = []
    for choice in cartesian:
        comps = list(indep_items)
        for it_choice in choice:
            if it_choice is not None:
                comps.append(it_choice)

        active_set = set([p_item] + comps)

        # Se a principal requer algo e esse algo não está presente
        if p_req and p_req not in active_set:
            continue

        # Verificar dependências AND nos acompanhantes
        valid = True
        for c in comps:
            c_req = (action_rules.get(c, {}).get('requires') or '').strip()
            if c_req and c_req not in active_set:
                valid = False
                break
        if not valid:
            continue

        # Incompatibilidade física Solo Seco x Água
        names_lower = [x.lower() for x in active_set]
        has_seco = any('seco' in x for x in names_lower)
        has_agua = any('água' in x or 'agua' in x or 'hidrostática' in x for x in names_lower)
        if has_seco and has_agua:
            continue

        valid_sets.append(comps)

    if not valid_sets and not p_req:
        valid_sets = [[]]

    return valid_sets


def _generate_valid_permanent_sets(
    perm_items: List[str],
    action_rules: Dict[str, Any]
) -> List[List[str]]:
    """
    Gera conjuntos de ações permanentes mutuamente compatíveis:
    - Permanentes independentes entram em todos os conjuntos.
    - Permanentes com grupo exclusivo (XOR) ramificam (no máximo 1 por conjunto).
    """
    import itertools
    indep_perms = []
    grp_map: Dict[str, List[str]] = {}

    for p in perm_items:
        grp = (action_rules.get(p, {}).get('group') or '').strip()
        if grp:
            g_key = grp.lower()
            if g_key not in grp_map:
                grp_map[g_key] = []
            grp_map[g_key].append(p)
        else:
            indep_perms.append(p)

    if not grp_map:
        return [indep_perms]

    # Para cada grupo permanente, escolhe 1 ação
    group_branches = list(grp_map.values())
    cartesian = list(itertools.product(*group_branches))

    perm_sets = []
    for choice in cartesian:
        pset = list(indep_perms) + list(choice)
        perm_sets.append(pset)

    return perm_sets or [indep_perms]



def _read_file_bytes_shared(filepath: str) -> bytes:
    """
    Lê os bytes de um arquivo permitindo compartilhamento total de leitura e escrita,
    evitando PermissionError caso o Excel esteja com a planilha aberta.
    """
    try:
        with open(filepath, 'rb') as f:
            return f.read()
    except PermissionError:
        if sys.platform == 'win32':
            import ctypes
            GENERIC_READ = 0x80000000
            FILE_SHARE_READ = 0x00000001
            FILE_SHARE_WRITE = 0x00000002
            FILE_SHARE_DELETE = 0x00000004
            OPEN_EXISTING = 3
            FILE_ATTRIBUTE_NORMAL = 0x80

            handle = ctypes.windll.kernel32.CreateFileW(
                os.path.abspath(filepath),
                GENERIC_READ,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                None,
                OPEN_EXISTING,
                FILE_ATTRIBUTE_NORMAL,
                None
            )
            if handle == -1 or handle == 0xFFFFFFFFFFFFFFFF or handle == 0xFFFFFFFF:
                raise PermissionError(f"Não foi possível abrir o arquivo bloqueado: {filepath}")

            try:
                size_high = ctypes.c_ulong(0)
                size_low = ctypes.windll.kernel32.GetFileSize(handle, ctypes.byref(size_high))
                file_size = (size_high.value << 32) + size_low
                buf = ctypes.create_string_buffer(file_size)
                bytes_read = ctypes.c_ulong(0)
                ctypes.windll.kernel32.ReadFile(handle, buf, file_size, ctypes.byref(bytes_read), None)
                return buf.raw[:bytes_read.value]
            finally:
                ctypes.windll.kernel32.CloseHandle(handle)
        raise


def parse_mietc_workbook(wb_path: str) -> Dict[str, Any]:
    """
    Analisa a planilha MIETC (arquivo .xlsx) e extrai todas as abas,
    bases cadastradas e seus vetores característicos nas direções V, X e Y.
    """
    import io
    if not os.path.exists(wb_path):
        raise FileNotFoundError(f"Arquivo não encontrado: {wb_path}")

    try:
        wb = openpyxl.load_workbook(wb_path, data_only=True)
    except PermissionError:
        raw_bytes = _read_file_bytes_shared(wb_path)
        wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), data_only=True)

    result = {
        'filename': os.path.basename(wb_path),
        'sheets': {},
        'sheet_names': []
    }

    try:
        for sname in wb.sheetnames:
            ws = wb[sname]
            if ws.max_row < 2 or ws.max_column < 4:
                continue

            # Cabeçalho da linha 1
            headers = [ws.cell(1, c).value for c in range(1, ws.max_column + 1)]
            base_cols: List[Tuple[str, int]] = []
            for col_idx in range(4, ws.max_column + 1):
                bname = ws.cell(1, col_idx).value
                if bname:
                    base_cols.append((str(bname).strip(), col_idx))

            if not base_cols:
                continue

            result['sheet_names'].append(sname)
            bases_data: Dict[str, Dict[str, Dict[str, float]]] = {
                bname: {} for bname, _ in base_cols
            }
            action_catalog_list = []

            for r in range(2, ws.max_row + 1):
                grupo = ws.cell(r, 1).value
                item = ws.cell(r, 2).value
                direcao = ws.cell(r, 3).value

                if not item or not direcao:
                    continue

                item_key = str(item).strip()
                dir_key = str(direcao).strip().upper()
                if dir_key not in ['V', 'X', 'Y']:
                    continue

                row_info = {
                    'group': str(grupo).strip() if grupo else '',
                    'item': item_key,
                    'direction': dir_key
                }
                if row_info not in action_catalog_list:
                    action_catalog_list.append(row_info)

                for bname, c_idx in base_cols:
                    val = ws.cell(r, c_idx).value
                    float_val = 0.0
                    if val is not None:
                        try:
                            float_val = float(val)
                        except (ValueError, TypeError):
                            float_val = 0.0

                    if item_key not in bases_data[bname]:
                        bases_data[bname][item_key] = {'V': 0.0, 'X': 0.0, 'Y': 0.0}

                    bases_data[bname][item_key][dir_key] = float_val

            result['sheets'][sname] = {
                'sheet_name': sname,
                'bases_count': len(base_cols),
                'bases_list': [b for b, _ in base_cols],
                'bases_names': [b for b, _ in base_cols],
                'actions_catalog': action_catalog_list,
                'bases_data': bases_data
            }
    finally:
        try:
            wb.close()
        except Exception:
            pass

    return result


def calculate_single_base_combinations(
    base_name: str,
    base_loads: Dict[str, Dict[str, float]],
    standard: str = 'NBR 8681',
    method: str = 'ELU_NORMAL',
    options: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Gera as combinações de ações para uma base específica nas três direções espaciais:
    Vertical (V), Horizontal X (X) e Horizontal Y (Y), e calcula H_res = sqrt(X^2 + Y^2).
    """
    opts = options or {}
    gamma_fav = opts.get('gamma_g_fav', 1.00)
    gamma_unfav = opts.get('gamma_g_unfav', 1.35 if 'NBR' in standard else 1.35)

    # 0. Mesclar cargas customizadas se fornecidas
    base_loads_work: Dict[str, Dict[str, float]] = {k: dict(v) for k, v in base_loads.items()}
    if opts.get('custom_loads'):
        for cl in opts['custom_loads']:
            c_name = (cl.get('name') or '').strip()
            if not c_name:
                continue
            c_val = float(cl.get('value', 0.0))
            c_dir = (cl.get('direction') or 'V').upper()
            if c_dir not in ['V', 'X', 'Y']:
                c_dir = 'V'
            if c_name not in base_loads_work:
                base_loads_work[c_name] = {'V': 0.0, 'X': 0.0, 'Y': 0.0}
            base_loads_work[c_name][c_dir] = c_val

    # 1. Mesclar regras lógicas
    action_rules = dict(DEFAULT_ACTION_RULES)
    if opts.get('action_rules'):
        action_rules.update(opts['action_rules'])

    if opts.get('custom_loads'):
        for cl in opts['custom_loads']:
            c_name = (cl.get('name') or '').strip()
            if not c_name:
                continue
            if c_name not in action_rules:
                action_rules[c_name] = {
                    'group': (cl.get('group') or '').strip(),
                    'requires': (cl.get('requires') or '').strip(),
                    'type': (cl.get('type') or '').strip(),
                    'is_variable': cl.get('is_variable')
                }
            else:
                if not action_rules[c_name].get('group') and cl.get('group'):
                    action_rules[c_name]['group'] = cl['group']
                if not action_rules[c_name].get('requires') and cl.get('requires'):
                    action_rules[c_name]['requires'] = cl['requires']
                if not action_rules[c_name].get('type') and cl.get('type'):
                    action_rules[c_name]['type'] = cl['type']

    perm_items = []
    var_items = []

    enable_zero_scenarios = True
    if options and isinstance(options, dict):
        if 'enable_zero_load_scenarios' in options:
            enable_zero_scenarios = bool(options['enable_zero_load_scenarios'])

    for item, comps in base_loads_work.items():
        has_val = abs(comps.get('V', 0.0)) > 1e-4 or abs(comps.get('X', 0.0)) > 1e-4 or abs(comps.get('Y', 0.0)) > 1e-4
        if not has_val:
            continue

        rule = action_rules.get(item, {})
        r_type = rule.get('type', '')
        type_meta = LOAD_CATALOG_TYPES.get(r_type, {})
        base_meta = MIETC_ACTION_PROPS.get(item, {})

        is_var = rule.get('is_variable')
        if is_var is None:
            if 'isVariable' in type_meta:
                is_var = type_meta['isVariable']
            elif 'isVariable' in base_meta:
                is_var = base_meta['isVariable']
            else:
                is_var = item not in ['PP', 'CP'] and 'permanente' not in item.lower() and 'peso próprio' not in item.lower()

        can_zero = rule.get('can_zero')
        if can_zero is None:
            item_low = item.lower()
            type_low = (r_type or '').lower()
            if any(k in item_low for k in ['sca', 'scm', 'scp', 'tcq', 'tcp', 'sobrecarga', 'acidental', 'manutencao', 'manutenção', 'talha', 'ponte']) or \
               any(k in type_low for k in ['sobrecarga', 'manutenção', 'manutencao', 'ponte', 'guindaste', 'acidental']):
                can_zero = True
            elif is_var and not any(k in item_low for k in ['pp', 'cp', 'permanente', 'peso próprio']):
                can_zero = True
            else:
                can_zero = False
        rule['can_zero'] = bool(can_zero)
        action_rules[item] = rule

        if is_var:
            var_items.append(item)
        else:
            perm_items.append(item)

    perm_sets = _generate_valid_permanent_sets(perm_items, action_rules)
    combos_list: List[Dict[str, Any]] = []

    def _add_combo_and_zeroed_variants(combo_dict, pset_items, var_names):
        """Adiciona a combinação padrão e gera variantes com ações selecionadas zeradas para alívio/máx tração."""
        combos_list.append(combo_dict)
        if not enable_zero_scenarios:
            return

        active_factors = combo_dict['factors']
        zeroable_candidates = [
            act for act in (pset_items + var_names)
            if action_rules.get(act, {}).get('can_zero', False) and active_factors.get(act, 0.0) > 1e-4
        ]
        if not zeroable_candidates:
            return

        def _cascade_zero(zk_list):
            zeroed = set(zk_list)
            changed = True
            while changed:
                changed = False
                for act, f in active_factors.items():
                    if f > 1e-4 and act not in zeroed:
                        req = (action_rules.get(act, {}).get('requires') or '').strip()
                        if req and req in zeroed:
                            zeroed.add(act)
                            changed = True
            return list(zeroed)

        # 1. Se há mais de 1 ação na combinação, zerar cada candidata individualmente (com propagação AND)
        if len(active_factors) > 1:
            for zk in zeroable_candidates:
                cascaded = _cascade_zero([zk])
                var_factors = dict(active_factors)
                for c_z in cascaded:
                    var_factors[c_z] = 0.0

                # Não gerar combinação totalmente nula
                if not any(f > 1e-4 for f in var_factors.values()):
                    continue

                v_val = sum(base_loads_work[k]['V'] * f for k, f in var_factors.items() if k in base_loads_work)
                x_val = sum(base_loads_work[k]['X'] * f for k, f in var_factors.items() if k in base_loads_work)
                y_val = sum(base_loads_work[k]['Y'] * f for k, f in var_factors.items() if k in base_loads_work)
                h_val = math.hypot(x_val, y_val)

                f_parts = []
                for k, f in var_factors.items():
                    if abs(f) > 1e-4:
                        f_parts.append(f"{f:.2f}{_fmt_action_token(k)}")
                    elif k in cascaded:
                        f_parts.append(f"0.00{_fmt_action_token(k)}")

                z_desc = " + ".join(cascaded)
                combos_list.append({
                    'limit_state': combo_dict['limit_state'],
                    'type': f"{combo_dict['type']}_Zero_{'_'.join(cascaded)}",
                    'title': f"{combo_dict['title']} + [{z_desc} Zerada - Alívio Crítico]",
                    'formula': " + ".join(f_parts) if f_parts else "0.00",
                    'factors': var_factors,
                    'V': v_val,
                    'X': x_val,
                    'Y': y_val,
                    'H_res': h_val,
                    'is_zeroed_variant': True,
                    'zeroed_actions': cascaded
                })

        # 2. Se há 2 ou mais ações zeráveis presentes, gerar também a variante com todas zeradas
        if len(zeroable_candidates) > 1:
            all_cascaded = _cascade_zero(zeroable_candidates)
            var_factors = dict(active_factors)
            for zk in all_cascaded:
                var_factors[zk] = 0.0

            if any(f > 1e-4 for f in var_factors.values()):
                v_val = sum(base_loads_work[k]['V'] * f for k, f in var_factors.items() if k in base_loads_work)
                x_val = sum(base_loads_work[k]['X'] * f for k, f in var_factors.items() if k in base_loads_work)
                y_val = sum(base_loads_work[k]['Y'] * f for k, f in var_factors.items() if k in base_loads_work)
                h_val = math.hypot(x_val, y_val)

                f_parts = []
                for k, f in var_factors.items():
                    if abs(f) > 1e-4:
                        f_parts.append(f"{f:.2f}{_fmt_action_token(k)}")
                    elif k in all_cascaded:
                        f_parts.append(f"0.00{_fmt_action_token(k)}")

                combos_list.append({
                    'limit_state': combo_dict['limit_state'],
                    'type': f"{combo_dict['type']}_Zero_All",
                    'title': f"{combo_dict['title']} + [{' + '.join(all_cascaded)} Zeradas - Alívio Crítico]",
                    'formula': " + ".join(f_parts) if f_parts else "0.00",
                    'factors': var_factors,
                    'V': v_val,
                    'X': x_val,
                    'Y': y_val,
                    'H_res': h_val,
                    'is_zeroed_variant': True,
                    'zeroed_actions': list(all_cascaded)
                })

    # 1. Combinações de Estado Limite Último (ELU Normal, Especial e Geotécnico)
    # ELU Normal    : γ_g=1.35/1.00, γ_q principal, acompanhantes com γ_q×ψ₀  (NBR 8681 comb. normal)
    # ELU Especial  : γ_g=1.35/1.00, γ_q principal, acompanhantes com γ_q×ψ₁  (NBR 8681 comb. especial)
    # GEO Ponderada : γ_g=1.40 solo/1.35 estrutural, diferenciado por tipo de ação (NBR 6122)

    # Tipos de ação permanente de origem geotécnica (NBR 6122 — γ_g=1.40 desfav.)
    _GEO_SOIL_TYPES = {
        'Solo Seco (Empuxo)', 'Solo Saturado (Empuxo)',
        'Pressão Hidrostática / Água', 'Subpressão / Uplift',
        'Sobrecarga no Tardoz (Q_solo)'
    }

    def _geo_gf(action_name: str, fav: bool) -> float:
        """Retorna o γ_g geotécnico diferenciado: 1.40 para solo, 1.35 para estrutural."""
        if fav:
            return 1.00
        r = action_rules.get(action_name, {})
        t = r.get('type', '')
        t_meta = LOAD_CATALOG_TYPES.get(t, {})
        if t in _GEO_SOIL_TYPES or t_meta.get('nbr', {}).get('gamma_g_unfav', 1.35) > 1.35:
            return 1.40
        # Verifica no próprio nome da ação
        nm = action_name.lower()
        if any(k in nm for k in ['empuxo', 'hidrostática', 'hidro', 'uplift', 'subpress', 'aterro', 'solo']):
            return 1.40
        return 1.35

    _elu_runs = []
    if method in ['ELU_NORMAL', 'GEO_COMPLETA', 'TODAS']:
        _elu_runs.append(('ELU', gamma_unfav, gamma_fav, 'psi0', 'ELU_Normal', 'ELU Normal', False))
    if method == 'GEO_PONDERADA':
        # GEO_PONDERADA sozinho: gera ELU Normal e Especial com γ_g geotécnico diferenciado
        _elu_runs.append(('GEO Ponderada', gamma_unfav, gamma_fav, 'psi0', 'GEO_Normal', 'GEO Ponderada Normal', True))
        _elu_runs.append(('GEO Especial', gamma_unfav, gamma_fav, 'psi1', 'GEO_Especial', 'GEO Ponderada Especial', True))
    if method in ['ELU_ESPECIAL', 'GEO_COMPLETA', 'TODAS']:
        _elu_runs.append(('ELU Especial', gamma_unfav, gamma_fav, 'psi1', 'ELU_Especial', 'ELU Especial', False))


    for _ls_label, _g_unfav, _g_fav, _psi_key, _type_prefix, _combo_prefix, _geo_mode in _elu_runs:
        _psi_default = 0.70 if _psi_key == 'psi0' else 0.50

        # Caso A: Apenas Permanentes (ELU 1.35G ou 1.40G)
        for pset_idx, pset in enumerate(perm_sets):
            # Se uma permanente requer uma ação que não está neste conjunto puro permanente, pula
            req_missing = False
            for p in pset:
                p_req = (action_rules.get(p, {}).get('requires') or '').strip()
                if p_req and p_req not in pset:
                    req_missing = True
                    break
            if req_missing:
                continue

            for perm_type in ['desfavoravel', 'favoravel']:
                _is_fav = (perm_type == 'favoravel')
                if _geo_mode:
                    # γ_g geotécnico diferenciado por tipo de ação (NBR 6122)
                    factors_perm = {p: (_g_fav if _is_fav else _geo_gf(p, False)) for p in pset}
                else:
                    gf_uniform = _g_fav if _is_fav else _g_unfav
                    factors_perm = {p: gf_uniform for p in pset}
                val_v = sum(base_loads_work[p]['V'] * factors_perm[p] for p in pset)
                val_x = sum(base_loads_work[p]['X'] * factors_perm[p] for p in pset)
                val_y = sum(base_loads_work[p]['Y'] * factors_perm[p] for p in pset)
                h_res = math.hypot(val_x, val_y)
                gf_display = factors_perm[pset[0]] if len(set(factors_perm.values())) == 1 else None
                formula_perm = (
                    f"{gf_display:.2f} × ({' + '.join(_fmt_action_token(p) for p in pset)})"
                    if gf_display is not None
                    else ' + '.join(f"{factors_perm[p]:.2f}{_fmt_action_token(p)}" for p in pset)
                )
                pset_desc = f" [{', '.join(pset)}]" if len(perm_sets) > 1 else ""
                _add_combo_and_zeroed_variants({
                    'limit_state': _ls_label,
                    'type': f"{_type_prefix}_Perm_{pset_idx}",
                    'title': f"{_combo_prefix} Permanente{pset_desc} ({'Desfavorável' if not _is_fav else 'Favorável/Alívio'})",
                    'formula': formula_perm,
                    'factors': factors_perm,
                    'V': val_v,
                    'X': val_x,
                    'Y': val_y,
                    'H_res': h_res
                }, pset, [])

        # Caso B: Cada variável como ação principal alternadamente com acompanhantes válidas
        for p_item in var_items:
            p_rule = action_rules.get(p_item, {})
            r_type = p_rule.get('type', '')
            p_meta = LOAD_CATALOG_TYPES.get(r_type) or MIETC_ACTION_PROPS.get(p_item, {})
            p_gamma = p_meta.get('nbr', {}).get('gamma_q', 1.40)

            comp_sets = _generate_companion_sets(p_item, var_items, action_rules)

            for comp_idx, companions in enumerate(comp_sets):
                all_var_names = [p_item] + companions

                for pset_idx, pset in enumerate(perm_sets):
                    # Verificar se todas as dependências de pset estão satisfeitas
                    all_active_names = pset + all_var_names
                    req_missing = False
                    for p in pset:
                        p_req = (action_rules.get(p, {}).get('requires') or '').strip()
                        if p_req and p_req not in all_active_names:
                            req_missing = True
                            break
                    if req_missing:
                        continue

                    # Verificar colisão XOR entre permanentes do conjunto e as variáveis
                    conflict_xor = False
                    for p in pset:
                        p_g = (action_rules.get(p, {}).get('group') or '').strip()
                        if p_g:
                            for v in all_var_names:
                                v_g = (action_rules.get(v, {}).get('group') or '').strip()
                                if v_g and v_g.lower() == p_g.lower():
                                    conflict_xor = True
                                    break
                        if conflict_xor:
                            break
                    if conflict_xor:
                        continue

                    # Verificar incompatibilidade física Solo Seco x Água
                    names_all = [x.lower() for x in pset + all_var_names]
                    if any('seco' in x for x in names_all) and any('água' in x or 'agua' in x or 'hidrostática' in x for x in names_all):
                        continue

                    for perm_type in ['desfavoravel', 'favoravel']:
                        _is_fav = (perm_type == 'favoravel')
                        if _geo_mode:
                            # γ_g geotécnico diferenciado por tipo de ação (NBR 6122)
                            factors_perm = {p: (_g_fav if _is_fav else _geo_gf(p, False)) for p in pset}
                        else:
                            gf_uniform = _g_fav if _is_fav else _g_unfav
                            factors_perm = {p: gf_uniform for p in pset}

                        gf_display = factors_perm[pset[0]] if pset and len(set(factors_perm.values())) == 1 else None
                        formula_g_str = (
                            f"{gf_display:.2f}G"
                            if gf_display is not None
                            else ' + '.join(f"{factors_perm[p]:.2f}{_fmt_action_token(p)}" for p in pset)
                        )
                        formula_parts = [formula_g_str, f"{p_gamma:.2f}{_fmt_action_token(p_item)}"]
                        factors_dict = dict(factors_perm)
                        factors_dict[p_item] = p_gamma

                        val_v = sum(base_loads_work[p]['V'] * factors_perm[p] for p in pset) + base_loads_work[p_item]['V'] * p_gamma
                        val_x = sum(base_loads_work[p]['X'] * factors_perm[p] for p in pset) + base_loads_work[p_item]['X'] * p_gamma
                        val_y = sum(base_loads_work[p]['Y'] * factors_perm[p] for p in pset) + base_loads_work[p_item]['Y'] * p_gamma

                        for s_item in companions:
                            s_rule = action_rules.get(s_item, {})
                            s_type = s_rule.get('type', '')
                            s_meta = LOAD_CATALOG_TYPES.get(s_type) or MIETC_ACTION_PROPS.get(s_item, {})
                            s_gamma = s_meta.get('nbr', {}).get('gamma_q', 1.40)
                            # Coeficiente de combinação parametrizado: ψ₀ (Normal) ou ψ₁ (Especial)
                            s_psi = s_meta.get('nbr', {}).get(_psi_key, _psi_default)
                            coeff = s_gamma * s_psi

                            factors_dict[s_item] = coeff
                            formula_parts.append(f"{coeff:.2f}{_fmt_action_token(s_item)}")

                            val_v += base_loads_work[s_item]['V'] * coeff
                            val_x += base_loads_work[s_item]['X'] * coeff
                            val_y += base_loads_work[s_item]['Y'] * coeff

                        h_res = math.hypot(val_x, val_y)
                        tag_perm = 'Desf' if perm_type == 'desfavoravel' else 'Fav/Alívio'

                        comp_desc = f" + {', '.join(companions)}" if companions else ""
                        pset_desc = f" [{', '.join(pset)}]" if len(perm_sets) > 1 else ""
                        combo_title = f"{_combo_prefix} {p_item} Princ{comp_desc}{pset_desc} ({tag_perm})"

                        _add_combo_and_zeroed_variants({
                            'limit_state': _ls_label,
                            'type': f"{_type_prefix}_Var_{p_item}_{comp_idx}_{pset_idx}",
                            'title': combo_title,
                            'formula': " + ".join(formula_parts),
                            'factors': factors_dict,
                            'V': val_v,
                            'X': val_x,
                            'Y': val_y,
                            'H_res': h_res
                        }, pset, all_var_names)


    # 2. Combinações de Serviço ELS Rara (Característica / ASD / FS Global)
    if method in ['ELS_RARA', 'GEO_FS_GLOBAL', 'GEO_COMPLETA', 'TODAS']:
        for pset_idx, pset in enumerate(perm_sets):
            # Se uma permanente requer uma ação que não está neste conjunto puro permanente, pula
            req_missing = False
            for p in pset:
                p_req = (action_rules.get(p, {}).get('requires') or '').strip()
                if p_req and p_req not in pset:
                    req_missing = True
                    break
            if req_missing:
                continue

            val_v = sum(base_loads_work[p]['V'] for p in pset)
            val_x = sum(base_loads_work[p]['X'] for p in pset)
            val_y = sum(base_loads_work[p]['Y'] for p in pset)
            pset_desc = f" [{', '.join(pset)}]" if len(perm_sets) > 1 else ""
            _add_combo_and_zeroed_variants({
                'limit_state': 'ELS Rara',
                'type': f"ELS_Rara_Perm_{pset_idx}",
                'title': f"ELS Rara Permanente{pset_desc}",
                'formula': f"1.00 × ({' + '.join(_fmt_action_token(p) for p in pset) if pset else 'Permanentes'})",
                'factors': {p: 1.0 for p in pset},
                'V': val_v,
                'X': val_x,
                'Y': val_y,
                'H_res': math.hypot(val_x, val_y)
            }, pset, [])

        for p_item in var_items:
            comp_sets = _generate_companion_sets(p_item, var_items, action_rules)

            for comp_idx, companions in enumerate(comp_sets):
                all_var_names = [p_item] + companions

                for pset_idx, pset in enumerate(perm_sets):
                    # Verificar se todas as dependências de pset estão satisfeitas
                    all_active_names = pset + all_var_names
                    req_missing = False
                    for p in pset:
                        p_req = (action_rules.get(p, {}).get('requires') or '').strip()
                        if p_req and p_req not in all_active_names:
                            req_missing = True
                            break
                    if req_missing:
                        continue

                    # Verificar colisão XOR entre permanentes do conjunto e as variáveis
                    conflict_xor = False
                    for p in pset:
                        p_g = (action_rules.get(p, {}).get('group') or '').strip()
                        if p_g:
                            for v in all_var_names:
                                v_g = (action_rules.get(v, {}).get('group') or '').strip()
                                if v_g and v_g.lower() == p_g.lower():
                                    conflict_xor = True
                                    break
                        if conflict_xor:
                            break
                    if conflict_xor:
                        continue

                    names_all = [x.lower() for x in pset + all_var_names]
                    if any('seco' in x for x in names_all) and any('água' in x or 'agua' in x or 'hidrostática' in x for x in names_all):
                        continue

                    formula_parts = ["1.0G", f"1.0{_fmt_action_token(p_item)}"]
                    factors_dict = {p: 1.0 for p in pset}
                    factors_dict[p_item] = 1.0

                    val_v = sum(base_loads_work[p]['V'] for p in pset) + base_loads_work[p_item]['V']
                    val_x = sum(base_loads_work[p]['X'] for p in pset) + base_loads_work[p_item]['X']
                    val_y = sum(base_loads_work[p]['Y'] for p in pset) + base_loads_work[p_item]['Y']

                    for s_item in companions:
                        s_rule = action_rules.get(s_item, {})
                        s_type = s_rule.get('type', '')
                        s_meta = LOAD_CATALOG_TYPES.get(s_type) or MIETC_ACTION_PROPS.get(s_item, {})
                        s_psi0 = s_meta.get('nbr', {}).get('psi0', 0.70)
                        factors_dict[s_item] = s_psi0
                        formula_parts.append(f"{s_psi0:.2f}{_fmt_action_token(s_item)}")
                        val_v += base_loads_work[s_item]['V'] * s_psi0
                        val_x += base_loads_work[s_item]['X'] * s_psi0
                        val_y += base_loads_work[s_item]['Y'] * s_psi0

                    comp_desc = f" + {', '.join(companions)}" if companions else ""
                    pset_desc = f" [{', '.join(pset)}]" if len(perm_sets) > 1 else ""
                    _add_combo_and_zeroed_variants({
                        'limit_state': 'ELS Rara',
                        'type': f"ELS_Rara_{p_item}_{comp_idx}_{pset_idx}",
                        'title': f"ELS Rara com {p_item} Principal{comp_desc}{pset_desc}",
                        'formula': " + ".join(formula_parts),
                        'factors': factors_dict,
                        'V': val_v,
                        'X': val_x,
                        'Y': val_y,
                        'H_res': math.hypot(val_x, val_y)
                    }, pset, all_var_names)

    # 3. Combinações ELS Quase-Permanente (Recalques / Deformações Longa Duração)
    if method in ['ELS_QP', 'GEO_COMPLETA', 'TODAS']:
        comp_sets_qp = _generate_companion_sets(var_items[0], var_items, action_rules) if var_items else [[]]
        for qp_idx, qp_vars in enumerate(comp_sets_qp):
            for pset_idx, pset in enumerate(perm_sets):
                # Verificar colisão XOR
                conflict_xor = False
                for p in pset:
                    p_g = (action_rules.get(p, {}).get('group') or '').strip()
                    if p_g:
                        for v in qp_vars:
                            v_g = (action_rules.get(v, {}).get('group') or '').strip()
                            if v_g and v_g.lower() == p_g.lower():
                                conflict_xor = True
                                break
                    if conflict_xor:
                        break
                if conflict_xor:
                    continue

                names_all = [x.lower() for x in pset + qp_vars]
                if any('seco' in x for x in names_all) and any('água' in x or 'agua' in x or 'hidrostática' in x for x in names_all):
                    continue

                factors_dict = {p: 1.0 for p in pset}
                formula_parts = ["1.0G"]
                val_v = sum(base_loads_work[p]['V'] for p in pset)
                val_x = sum(base_loads_work[p]['X'] for p in pset)
                val_y = sum(base_loads_work[p]['Y'] for p in pset)

                for v_item in qp_vars:
                    v_rule = action_rules.get(v_item, {})
                    v_type = v_rule.get('type', '')
                    v_meta = LOAD_CATALOG_TYPES.get(v_type) or MIETC_ACTION_PROPS.get(v_item, {})
                    psi2 = v_meta.get('nbr', {}).get('psi2', 0.30)
                    if psi2 > 0:
                        factors_dict[v_item] = psi2
                        formula_parts.append(f"{psi2:.2f}{_fmt_action_token(v_item)}")
                        val_v += base_loads_work[v_item]['V'] * psi2
                        val_x += base_loads_work[v_item]['X'] * psi2
                        val_y += base_loads_work[v_item]['Y'] * psi2

                pset_desc = f" [{', '.join(pset)}]" if len(perm_sets) > 1 else ""
                _add_combo_and_zeroed_variants({
                    'limit_state': 'ELS QP',
                    'type': f"ELS_Quase_Permanente_{qp_idx}_{pset_idx}",
                    'title': f"ELS Quase-Permanente (Recalques){' [' + ', '.join(qp_vars) + ']' if qp_vars else ''}{pset_desc}",
                    'formula': " + ".join(formula_parts),
                    'factors': factors_dict,
                    'V': val_v,
                    'X': val_x,
                    'Y': val_y,
                    'H_res': math.hypot(val_x, val_y)
                }, pset, qp_vars)

    # 4. Combinações Excepcionais (ELU Excepcional - Incêndio, Sismo, Impacto)
    # γ_g = 1.0 (permanentes), ação excepcional principal = 1.0, variáveis acompanhantes = γ_q × ψ₁
    # Ref: NBR 8681 item 6.2.3 / NBR 6118 item 11.7.2
    _EXCEPTIONAL_TYPES = {
        'Incêndio / Ação Excepcional', 'Sismo (E)',
        'Impacto / Choque Acidental', 'Carga Acidental de Montagem', 'Outras Ações Acidentais'
    }
    if method in ['ELU_EXCEPCIONAL', 'GEO_PONDERADA', 'GEO_COMPLETA', 'TODAS']:
        _geo_excep = method in ['GEO_PONDERADA', 'GEO_COMPLETA']
        excep_items = [
            v for v in var_items
            if action_rules.get(v, {}).get('type', '') in _EXCEPTIONAL_TYPES
            or any(k in v.lower() for k in ['excep', 'sismo', 'incêndio', 'incendio', 'impacto', 'montagem'])
        ]

        if excep_items:
            for ae_item in excep_items:
                comp_sets_excep = _generate_companion_sets(ae_item, var_items, action_rules)

                for comp_idx, companions in enumerate(comp_sets_excep):
                    # Exclui a própria ação excepcional dos acompanhantes
                    companions_filt = [c for c in companions if c != ae_item]
                    all_var_names = [ae_item] + companions_filt

                    for pset_idx, pset in enumerate(perm_sets):
                        # Verificar dependências
                        all_active_names = pset + all_var_names
                        req_missing = False
                        for p in pset:
                            p_req = (action_rules.get(p, {}).get('requires') or '').strip()
                            if p_req and p_req not in all_active_names:
                                req_missing = True
                                break
                        if req_missing:
                            continue

                        # Verificar incompatibilidade física Solo Seco x Água
                        names_all = [x.lower() for x in pset + all_var_names]
                        if any('seco' in x for x in names_all) and any('água' in x or 'agua' in x or 'hidrostática' in x for x in names_all):
                            continue

                        # Permanentes com γ_g = 1.0 (NBR 8681 combinação excepcional)
                        g_excep = 1.00
                        formula_parts = [f"1.00G", f"1.00{_fmt_action_token(ae_item)}"]
                        factors_dict = {p: g_excep for p in pset}
                        factors_dict[ae_item] = 1.00

                        val_v = sum(base_loads_work[p]['V'] * g_excep for p in pset) + base_loads_work[ae_item]['V']
                        val_x = sum(base_loads_work[p]['X'] * g_excep for p in pset) + base_loads_work[ae_item]['X']
                        val_y = sum(base_loads_work[p]['Y'] * g_excep for p in pset) + base_loads_work[ae_item]['Y']

                        for s_item in companions_filt:
                            s_rule = action_rules.get(s_item, {})
                            s_type = s_rule.get('type', '')
                            s_meta = LOAD_CATALOG_TYPES.get(s_type) or MIETC_ACTION_PROPS.get(s_item, {})
                            s_gamma = s_meta.get('nbr', {}).get('gamma_q', 1.40)
                            s_psi1 = s_meta.get('nbr', {}).get('psi1', 0.50)
                            coeff = s_gamma * s_psi1

                            factors_dict[s_item] = coeff
                            formula_parts.append(f"{coeff:.2f}{_fmt_action_token(s_item)}")
                            val_v += base_loads_work[s_item]['V'] * coeff
                            val_x += base_loads_work[s_item]['X'] * coeff
                            val_y += base_loads_work[s_item]['Y'] * coeff

                        h_res = math.hypot(val_x, val_y)
                        comp_desc = f" + {', '.join(companions_filt)}" if companions_filt else ""
                        pset_desc = f" [{', '.join(pset)}]" if len(perm_sets) > 1 else ""

                        _excep_ls = 'GEO Excepcional' if _geo_excep else 'ELU Excepcional'
                        _excep_prefix = 'GEO_Excep' if _geo_excep else 'ELU_Excep'
                        _add_combo_and_zeroed_variants({
                            'limit_state': _excep_ls,
                            'type': f"{_excep_prefix}_{ae_item}_{comp_idx}_{pset_idx}",
                            'title': f"{_excep_ls} {ae_item} Principal{comp_desc}{pset_desc}",
                            'formula': " + ".join(formula_parts),
                            'factors': factors_dict,
                            'V': val_v,
                            'X': val_x,
                            'Y': val_y,
                            'H_res': h_res
                        }, pset, all_var_names)

    # Determinar Envoltórias Críticas para a Base
    v_max = -float('inf')
    v_max_comb = None
    v_min = float('inf')
    v_min_comb = None
    h_max = -float('inf')
    h_max_comb = None
    x_abs_max = -float('inf')
    x_abs_max_comb = None
    y_abs_max = -float('inf')
    y_abs_max_comb = None

    for c in combos_list:
        if c['V'] > v_max:
            v_max = c['V']
            v_max_comb = c
        if c['V'] < v_min:
            v_min = c['V']
            v_min_comb = c
        if c['H_res'] > h_max:
            h_max = c['H_res']
            h_max_comb = c
        if abs(c['X']) > x_abs_max:
            x_abs_max = abs(c['X'])
            x_abs_max_comb = c
        if abs(c['Y']) > y_abs_max:
            y_abs_max = abs(c['Y'])
            y_abs_max_comb = c

    return {
        'base_name': base_name,
        'combinations_count': len(combos_list),
        'combinations': combos_list,
        'envelopes': {
            # 1. Picos Globais (Vmax, Xmax, Ymax, Hmax)
            'peaks': {
                'V_max': v_max if v_max != -float('inf') else 0.0,
                'V_min': v_min if v_min != float('inf') else 0.0,
                'X_max': x_abs_max if x_abs_max != -float('inf') else 0.0,
                'Y_max': y_abs_max if y_abs_max != -float('inf') else 0.0,
                'H_max': h_max if h_max != -float('inf') else 0.0
            },
            # 2. V max e concomitantes
            'V_max': {
                'value': v_max if v_max != -float('inf') else 0.0,
                'combination': v_max_comb['title'] if v_max_comb else '--',
                'formula': v_max_comb['formula'] if v_max_comb else '--',
                'concomitant_X': v_max_comb['X'] if v_max_comb else 0.0,
                'concomitant_Y': v_max_comb['Y'] if v_max_comb else 0.0,
                'concomitant_H': v_max_comb['H_res'] if v_max_comb else 0.0
            },
            # 3. V min e concomitantes
            'V_min': {
                'value': v_min if v_min != float('inf') else 0.0,
                'combination': v_min_comb['title'] if v_min_comb else '--',
                'formula': v_min_comb['formula'] if v_min_comb else '--',
                'concomitant_X': v_min_comb['X'] if v_min_comb else 0.0,
                'concomitant_Y': v_min_comb['Y'] if v_min_comb else 0.0,
                'concomitant_H': v_min_comb['H_res'] if v_min_comb else 0.0
            },
            # 4. X max e concomitantes
            'X_max': {
                'value': x_abs_max if x_abs_max != -float('inf') else 0.0,
                'real_value': x_abs_max_comb['X'] if x_abs_max_comb else 0.0,
                'combination': x_abs_max_comb['title'] if x_abs_max_comb else '--',
                'formula': x_abs_max_comb['formula'] if x_abs_max_comb else '--',
                'concomitant_V': x_abs_max_comb['V'] if x_abs_max_comb else 0.0,
                'concomitant_Y': x_abs_max_comb['Y'] if x_abs_max_comb else 0.0,
                'concomitant_H': x_abs_max_comb['H_res'] if x_abs_max_comb else 0.0
            },
            # 5. Y max e concomitantes
            'Y_max': {
                'value': y_abs_max if y_abs_max != -float('inf') else 0.0,
                'real_value': y_abs_max_comb['Y'] if y_abs_max_comb else 0.0,
                'combination': y_abs_max_comb['title'] if y_abs_max_comb else '--',
                'formula': y_abs_max_comb['formula'] if y_abs_max_comb else '--',
                'concomitant_V': y_abs_max_comb['V'] if y_abs_max_comb else 0.0,
                'concomitant_X': y_abs_max_comb['X'] if y_abs_max_comb else 0.0,
                'concomitant_H': y_abs_max_comb['H_res'] if y_abs_max_comb else 0.0
            },
            # 6. H max e concomitantes
            'H_max': {
                'value': h_max if h_max != -float('inf') else 0.0,
                'combination': h_max_comb['title'] if h_max_comb else '--',
                'formula': h_max_comb['formula'] if h_max_comb else '--',
                'concomitant_V': h_max_comb['V'] if h_max_comb else 0.0,
                'concomitant_X': h_max_comb['X'] if h_max_comb else 0.0,
                'concomitant_Y': h_max_comb['Y'] if h_max_comb else 0.0
            }
        }
    }


def auto_detect_subsequent_pairs(bases_list: List[str]) -> List[Dict[str, Any]]:
    """
    Detecta e agrupa automaticamente bases subsequentes que costumam pertencer
    à mesma sapata (ex: BT1+BT2, BT3+BT4, BT5+BT6, BA1+BA2, etc.).
    """
    import re
    if not bases_list:
        return []

    def natural_sort_key(s):
        return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', str(s))]

    sorted_bases = sorted(list(bases_list), key=natural_sort_key)

    groups_by_prefix: Dict[str, List[str]] = {}
    for b in sorted_bases:
        match = re.match(r'^([a-zA-Z_]+)(\d+)?', str(b).strip())
        if match:
            prefix = match.group(1).upper()
        else:
            prefix = "BASE"
        groups_by_prefix.setdefault(prefix, []).append(b)

    detected_groups: List[Dict[str, Any]] = []
    group_counter = 1

    for prefix, b_list in groups_by_prefix.items():
        i = 0
        while i < len(b_list):
            if i + 1 < len(b_list):
                pair = [b_list[i], b_list[i+1]]
                detected_groups.append({
                    'id': f"sapata_{group_counter}",
                    'name': f"Sapata {group_counter} ({pair[0]} + {pair[1]})",
                    'bases': pair
                })
                group_counter += 1
                i += 2
            else:
                detected_groups.append({
                    'id': f"sapata_{group_counter}",
                    'name': f"Sapata {group_counter} ({b_list[i]})",
                    'bases': [b_list[i]]
                })
                group_counter += 1
                i += 1

    return detected_groups


def calculate_combined_footing_envelopes(
    processed_bases: Dict[str, Any],
    base_groups: Any
) -> Dict[str, Any]:
    """
    Calcula combinações triaxiais e envoltórias para sapatas conjuntas / associadas.
    Para cada combinação normativa simultânea:
        V_total = sum(V_b)
        X_total = sum(X_b)
        Y_total = sum(Y_b)
        H_total = sqrt(X_total^2 + Y_total^2)
    Gera as 6 envoltórias críticas da sapata conjunta com detalhamento
    das contribuições individuais de cada montante/base.
    """
    if not processed_bases or not base_groups:
        return {
            'groups': [],
            'summary_table': [],
            'footings_details': {},
            'global_kpi': {
                'V_max': 0.0, 'V_max_footing': '--',
                'V_min': 0.0, 'V_min_footing': '--',
                'H_max': 0.0, 'H_max_footing': '--'
            }
        }

    normalized_groups: List[Dict[str, Any]] = []
    if isinstance(base_groups, dict):
        for idx, (gname, b_val) in enumerate(base_groups.items(), start=1):
            if isinstance(b_val, (list, tuple)):
                b_list = [str(b).strip() for b in b_val if str(b).strip()]
            elif isinstance(b_val, dict) and 'bases' in b_val:
                b_list = [str(b).strip() for b in b_val['bases'] if str(b).strip()]
            else:
                continue
            if b_list:
                normalized_groups.append({
                    'id': f"sapata_{idx}",
                    'name': str(gname).strip() or f"Sapata {idx} ({' + '.join(b_list)})",
                    'bases': b_list
                })
    elif isinstance(base_groups, (list, tuple)):
        for idx, item in enumerate(base_groups, start=1):
            if isinstance(item, dict):
                b_list = [str(b).strip() for b in item.get('bases', []) if str(b).strip()]
                if b_list:
                    gname = item.get('name') or f"Sapata {idx} ({' + '.join(b_list)})"
                    gid = item.get('id') or f"sapata_{idx}"
                    normalized_groups.append({
                        'id': gid,
                        'name': str(gname).strip(),
                        'bases': b_list
                    })
            elif isinstance(item, (list, tuple)):
                b_list = [str(b).strip() for b in item if str(b).strip()]
                if b_list:
                    normalized_groups.append({
                        'id': f"sapata_{idx}",
                        'name': f"Sapata {idx} ({' + '.join(b_list)})",
                        'bases': b_list
                    })

    if not normalized_groups:
        return {
            'groups': [],
            'summary_table': [],
            'footings_details': {},
            'global_kpi': {
                'V_max': 0.0, 'V_max_footing': '--',
                'V_min': 0.0, 'V_min_footing': '--',
                'H_max': 0.0, 'H_max_footing': '--'
            }
        }

    footings_details: Dict[str, Any] = {}
    summary_table: List[Dict[str, Any]] = []

    global_v_max = -float('inf')
    global_v_max_footing = None
    global_v_min = float('inf')
    global_v_min_footing = None
    global_h_max = -float('inf')
    global_h_max_footing = None

    for grp in normalized_groups:
        gid = grp['id']
        gname = grp['name']
        valid_bases = [b for b in grp['bases'] if b in processed_bases]

        if not valid_bases:
            continue

        base0 = processed_bases[valid_bases[0]]
        combos0 = base0.get('combinations', [])
        num_combos = len(combos0)

        combined_combos: List[Dict[str, Any]] = []

        for c_idx in range(num_combos):
            ref_c = combos0[c_idx]

            v_tot = 0.0
            x_tot = 0.0
            y_tot = 0.0
            breakdown: Dict[str, Dict[str, float]] = {}

            for b in valid_bases:
                b_combos = processed_bases[b].get('combinations', [])
                if c_idx < len(b_combos):
                    cb = b_combos[c_idx]
                else:
                    cb = {'V': 0.0, 'X': 0.0, 'Y': 0.0, 'H_res': 0.0}

                v_b = float(cb.get('V', 0.0))
                x_b = float(cb.get('X', 0.0))
                y_b = float(cb.get('Y', 0.0))
                h_b = float(cb.get('H_res', math.hypot(x_b, y_b)))

                v_tot += v_b
                x_tot += x_b
                y_tot += y_b

                breakdown[b] = {
                    'V': round(v_b, 2),
                    'X': round(x_b, 2),
                    'Y': round(y_b, 2),
                    'H_res': round(h_b, 2)
                }

            h_tot = math.hypot(x_tot, y_tot)

            combined_combos.append({
                'index': c_idx,
                'limit_state': ref_c.get('limit_state', 'ELU'),
                'type': ref_c.get('type', f"Combo_{c_idx}"),
                'title': ref_c.get('title', f"Combinação {c_idx+1}"),
                'formula': ref_c.get('formula', '--'),
                'factors': ref_c.get('factors', {}),
                'V': v_tot,
                'X': x_tot,
                'Y': y_tot,
                'H_res': h_tot,
                'base_breakdown': breakdown
            })

        # Encontrar Envoltórias da Sapata Conjunta
        v_max = -float('inf')
        v_max_comb = None
        v_min = float('inf')
        v_min_comb = None
        h_max = -float('inf')
        h_max_comb = None
        x_abs_max = -float('inf')
        x_abs_max_comb = None
        y_abs_max = -float('inf')
        y_abs_max_comb = None

        for c in combined_combos:
            if c['V'] > v_max:
                v_max = c['V']
                v_max_comb = c
            if c['V'] < v_min:
                v_min = c['V']
                v_min_comb = c
            if c['H_res'] > h_max:
                h_max = c['H_res']
                h_max_comb = c
            if abs(c['X']) > x_abs_max:
                x_abs_max = abs(c['X'])
                x_abs_max_comb = c
            if abs(c['Y']) > y_abs_max:
                y_abs_max = abs(c['Y'])
                y_abs_max_comb = c

        if v_max > global_v_max:
            global_v_max = v_max
            global_v_max_footing = gname
        if v_min < global_v_min:
            global_v_min = v_min
            global_v_min_footing = gname
        if h_max > global_h_max:
            global_h_max = h_max
            global_h_max_footing = gname

        envelopes = {
            'peaks': {
                'V_max': v_max if v_max != -float('inf') else 0.0,
                'V_min': v_min if v_min != float('inf') else 0.0,
                'X_max': x_abs_max if x_abs_max != -float('inf') else 0.0,
                'Y_max': y_abs_max if y_abs_max != -float('inf') else 0.0,
                'H_max': h_max if h_max != -float('inf') else 0.0
            },
            'V_max': {
                'value': v_max if v_max != -float('inf') else 0.0,
                'combination': v_max_comb['title'] if v_max_comb else '--',
                'formula': v_max_comb['formula'] if v_max_comb else '--',
                'concomitant_X': v_max_comb['X'] if v_max_comb else 0.0,
                'concomitant_Y': v_max_comb['Y'] if v_max_comb else 0.0,
                'concomitant_H': v_max_comb['H_res'] if v_max_comb else 0.0,
                'base_breakdown': v_max_comb['base_breakdown'] if v_max_comb else {}
            },
            'V_min': {
                'value': v_min if v_min != float('inf') else 0.0,
                'combination': v_min_comb['title'] if v_min_comb else '--',
                'formula': v_min_comb['formula'] if v_min_comb else '--',
                'concomitant_X': v_min_comb['X'] if v_min_comb else 0.0,
                'concomitant_Y': v_min_comb['Y'] if v_min_comb else 0.0,
                'concomitant_H': v_min_comb['H_res'] if v_min_comb else 0.0,
                'base_breakdown': v_min_comb['base_breakdown'] if v_min_comb else {}
            },
            'X_max': {
                'value': x_abs_max if x_abs_max != -float('inf') else 0.0,
                'real_value': x_abs_max_comb['X'] if x_abs_max_comb else 0.0,
                'combination': x_abs_max_comb['title'] if x_abs_max_comb else '--',
                'formula': x_abs_max_comb['formula'] if x_abs_max_comb else '--',
                'concomitant_V': x_abs_max_comb['V'] if x_abs_max_comb else 0.0,
                'concomitant_Y': x_abs_max_comb['Y'] if x_abs_max_comb else 0.0,
                'concomitant_H': x_abs_max_comb['H_res'] if x_abs_max_comb else 0.0,
                'base_breakdown': x_abs_max_comb['base_breakdown'] if x_abs_max_comb else {}
            },
            'Y_max': {
                'value': y_abs_max if y_abs_max != -float('inf') else 0.0,
                'real_value': y_abs_max_comb['Y'] if y_abs_max_comb else 0.0,
                'combination': y_abs_max_comb['title'] if y_abs_max_comb else '--',
                'formula': y_abs_max_comb['formula'] if y_abs_max_comb else '--',
                'concomitant_V': y_abs_max_comb['V'] if y_abs_max_comb else 0.0,
                'concomitant_X': y_abs_max_comb['X'] if y_abs_max_comb else 0.0,
                'concomitant_H': y_abs_max_comb['H_res'] if y_abs_max_comb else 0.0,
                'base_breakdown': y_abs_max_comb['base_breakdown'] if y_abs_max_comb else {}
            },
            'H_max': {
                'value': h_max if h_max != -float('inf') else 0.0,
                'combination': h_max_comb['title'] if h_max_comb else '--',
                'formula': h_max_comb['formula'] if h_max_comb else '--',
                'concomitant_V': h_max_comb['V'] if h_max_comb else 0.0,
                'concomitant_X': h_max_comb['X'] if h_max_comb else 0.0,
                'concomitant_Y': h_max_comb['Y'] if h_max_comb else 0.0,
                'base_breakdown': h_max_comb['base_breakdown'] if h_max_comb else {}
            }
        }

        footing_entry = {
            'id': gid,
            'base_name': gname,
            'group_name': gname,
            'member_bases': valid_bases,
            'combinations_count': len(combined_combos),
            'combinations': combined_combos,
            'envelopes': envelopes
        }

        footings_details[gname] = footing_entry

        summary_table.append({
            'base': gname,
            'group_name': gname,
            'member_bases': valid_bases,
            'is_combined': True,
            'peak_V': round(v_max, 2),
            'peak_X': round(x_abs_max, 2),
            'peak_Y': round(y_abs_max, 2),
            'peak_H': round(h_max, 2),

            'V_max': round(v_max, 2),
            'V_max_comb': envelopes['V_max']['combination'],
            'V_max_formula': envelopes['V_max']['formula'],
            'V_max_X': round(envelopes['V_max']['concomitant_X'], 2),
            'V_max_Y': round(envelopes['V_max']['concomitant_Y'], 2),
            'V_max_H': round(envelopes['V_max']['concomitant_H'], 2),
            'V_max_breakdown': envelopes['V_max']['base_breakdown'],

            'V_min': round(v_min, 2),
            'V_min_comb': envelopes['V_min']['combination'],
            'V_min_formula': envelopes['V_min']['formula'],
            'V_min_X': round(envelopes['V_min']['concomitant_X'], 2),
            'V_min_Y': round(envelopes['V_min']['concomitant_Y'], 2),
            'V_min_H': round(envelopes['V_min']['concomitant_H'], 2),
            'V_min_breakdown': envelopes['V_min']['base_breakdown'],

            'X_max': round(x_abs_max, 2),
            'X_max_real': round(envelopes['X_max'].get('real_value', x_abs_max), 2),
            'X_max_comb': envelopes['X_max']['combination'],
            'X_max_formula': envelopes['X_max']['formula'],
            'X_max_V': round(envelopes['X_max']['concomitant_V'], 2),
            'X_max_Y': round(envelopes['X_max']['concomitant_Y'], 2),
            'X_max_H': round(envelopes['X_max']['concomitant_H'], 2),
            'X_max_breakdown': envelopes['X_max']['base_breakdown'],

            'Y_max': round(y_abs_max, 2),
            'Y_max_real': round(envelopes['Y_max'].get('real_value', y_abs_max), 2),
            'Y_max_comb': envelopes['Y_max']['combination'],
            'Y_max_formula': envelopes['Y_max']['formula'],
            'Y_max_V': round(envelopes['Y_max']['concomitant_V'], 2),
            'Y_max_X': round(envelopes['Y_max']['concomitant_X'], 2),
            'Y_max_H': round(envelopes['Y_max']['concomitant_H'], 2),
            'Y_max_breakdown': envelopes['Y_max']['base_breakdown'],

            'H_max': round(h_max, 2),
            'H_max_comb': envelopes['H_max']['combination'],
            'H_max_formula': envelopes['H_max']['formula'],
            'H_max_V': round(envelopes['H_max']['concomitant_V'], 2),
            'H_max_X': round(envelopes['H_max']['concomitant_X'], 2),
            'H_max_Y': round(envelopes['H_max']['concomitant_Y'], 2),
            'H_max_breakdown': envelopes['H_max']['base_breakdown']
        })

    return {
        'groups': normalized_groups,
        'summary_table': summary_table,
        'footings_details': footings_details,
        'global_kpi': {
            'V_max': round(global_v_max, 2) if global_v_max != -float('inf') else 0.0,
            'V_max_footing': global_v_max_footing or '--',
            'V_min': round(global_v_min, 2) if global_v_min != float('inf') else 0.0,
            'V_min_footing': global_v_min_footing or '--',
            'H_max': round(global_h_max, 2) if global_h_max != -float('inf') else 0.0,
            'H_max_footing': global_h_max_footing or '--'
        }
    }


def _extract_actions_summary(
    sheet_data: Dict[str, Any],
    bases_to_process: List[str],
    options: Optional[Dict[str, Any]] = None,
    standard: str = 'NBR 8681'
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Gera síntese técnica e normativa de todas as ações consideradas no lote
    para fins de avaliação e auditoria de terceiros.
    """
    bases_dict = sheet_data.get('bases_data', {})
    opts = options or {}
    act_rules = dict(DEFAULT_ACTION_RULES)
    if 'action_rules' in opts:
        act_rules.update(opts['action_rules'])

    if 'custom_loads' in opts and isinstance(opts['custom_loads'], list):
        for cl in opts['custom_loads']:
            c_name = (cl.get('name') or '').strip()
            if c_name:
                if c_name not in act_rules:
                    act_rules[c_name] = {
                        'group': (cl.get('group') or '').strip(),
                        'requires': (cl.get('requires') or '').strip(),
                        'type': (cl.get('type') or '').strip(),
                        'is_variable': cl.get('is_variable'),
                        'can_zero': cl.get('can_zero')
                    }
                else:
                    for f in ['group', 'requires', 'type', 'is_variable', 'can_zero']:
                        if cl.get(f) is not None:
                            act_rules[c_name][f] = cl[f]

    all_action_names = set()
    for b in bases_to_process:
        all_action_names.update(bases_dict.get(b, {}).keys())

    sorted_actions = sorted(list(all_action_names))
    actions_summary = []

    for act in sorted_actions:
        rule = act_rules.get(act, {})
        r_type = rule.get('type', '')
        type_meta = LOAD_CATALOG_TYPES.get(r_type, {})
        base_meta = MIETC_ACTION_PROPS.get(act, {})

        is_var = rule.get('is_variable')
        if is_var is None:
            if 'isVariable' in type_meta:
                is_var = type_meta['isVariable']
            elif 'isVariable' in base_meta:
                is_var = base_meta['isVariable']
            else:
                is_var = act not in ['PP', 'CP'] and 'permanente' not in act.lower() and 'peso próprio' not in act.lower()

        can_zero = rule.get('can_zero')
        if can_zero is None:
            act_low = act.lower()
            t_low = (r_type or '').lower()
            if any(k in act_low for k in ['sca', 'scm', 'scp', 'tcq', 'tcp', 'sobrecarga', 'acidental', 'manutencao', 'manutenção', 'talha', 'ponte']) or \
               any(k in t_low for k in ['sobrecarga', 'manutenção', 'manutencao', 'ponte', 'guindaste', 'acidental']):
                can_zero = True
            elif is_var and not any(k in act_low for k in ['pp', 'cp', 'permanente', 'peso próprio']):
                can_zero = True
            else:
                can_zero = False

        # Coeficientes normativos
        gamma_unfav = 1.35 if not is_var else 1.40
        gamma_fav = 1.00 if not is_var else 0.00
        psi0 = 0.70
        psi1 = 0.50
        psi2 = 0.30

        if not is_var:
            if 'nbr' in type_meta:
                gamma_unfav = type_meta['nbr'].get('gamma_g_unfav', 1.35)
                gamma_fav = type_meta['nbr'].get('gamma_g_fav', 1.00)
            elif 'nbr' in base_meta:
                gamma_unfav = base_meta['nbr'].get('gamma_g_unfav', 1.35)
                gamma_fav = base_meta['nbr'].get('gamma_g_fav', 1.00)
        else:
            if 'nbr' in type_meta:
                gamma_unfav = type_meta['nbr'].get('gamma_q', 1.40)
                psi0 = type_meta['nbr'].get('psi0', 0.70)
                psi1 = type_meta['nbr'].get('psi1', 0.50)
                psi2 = type_meta['nbr'].get('psi2', 0.30)
            elif 'nbr' in base_meta:
                gamma_unfav = base_meta['nbr'].get('gamma_q', 1.40)
                psi0 = base_meta['nbr'].get('psi0', 0.70)
                psi1 = base_meta['nbr'].get('psi1', 0.50)
                psi2 = base_meta['nbr'].get('psi2', 0.30)

        # Estatísticas nominais
        v_min_val, v_min_b = float('inf'), None
        v_max_val, v_max_b = -float('inf'), None
        x_max_abs, x_max_b = 0.0, None
        y_max_abs, y_max_b = 0.0, None
        h_max_val, h_max_b = 0.0, None
        occurrences = 0

        for b_name in bases_to_process:
            b_load = bases_dict.get(b_name, {}).get(act)
            if b_load:
                v_k = float(b_load.get('V', 0.0))
                x_k = float(b_load.get('X', 0.0))
                y_k = float(b_load.get('Y', 0.0))
                h_k = math.hypot(x_k, y_k)

                if abs(v_k) > 1e-4 or abs(x_k) > 1e-4 or abs(y_k) > 1e-4:
                    occurrences += 1
                    if v_k < v_min_val:
                        v_min_val = v_k
                        v_min_b = b_name
                    if v_k > v_max_val:
                        v_max_val = v_k
                        v_max_b = b_name
                    if abs(x_k) > x_max_abs:
                        x_max_abs = abs(x_k)
                        x_max_b = b_name
                    if abs(y_k) > y_max_abs:
                        y_max_abs = abs(y_k)
                        y_max_b = b_name
                    if h_k > h_max_val:
                        h_max_val = h_k
                        h_max_b = b_name

        desc = base_meta.get('name') or r_type or act
        actions_summary.append({
            'name': act,
            'description': desc,
            'category': 'Variável (Q)' if is_var else 'Permanente (G)',
            'group': (rule.get('group') or '').strip() or 'Independente',
            'requires': (rule.get('requires') or '').strip() or 'Nenhum',
            'can_zero': bool(can_zero),
            'gamma_unfav': float(gamma_unfav),
            'gamma_fav': float(gamma_fav),
            'psi0': float(psi0) if is_var else 0.0,
            'psi1': float(psi1) if is_var else 0.0,
            'psi2': float(psi2) if is_var else 0.0,
            'occurrences': occurrences,
            'V_min': round(v_min_val, 2) if v_min_val != float('inf') else 0.0,
            'V_min_base': v_min_b or '--',
            'V_max': round(v_max_val, 2) if v_max_val != -float('inf') else 0.0,
            'V_max_base': v_max_b or '--',
            'X_max_abs': round(x_max_abs, 2),
            'X_max_base': x_max_b or '--',
            'Y_max_abs': round(y_max_abs, 2),
            'Y_max_base': y_max_b or '--',
            'H_max': round(h_max_val, 2),
            'H_max_base': h_max_b or '--'
        })

    bases_nominal = {b: bases_dict[b] for b in bases_to_process if b in bases_dict}
    return actions_summary, bases_nominal


def batch_calculate_sheet_bases(
    sheet_data: Dict[str, Any],
    standard: str = 'NBR 8681',
    method: str = 'ELU_NORMAL',
    selected_bases: Optional[List[str]] = None,
    options: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Executa o cálculo combinatório para todas as bases de uma aba em lote.
    """
    bases_dict = sheet_data.get('bases_data', {})
    bases_to_process = selected_bases or list(bases_dict.keys())

    processed_bases: Dict[str, Any] = {}
    summary_table: List[Dict[str, Any]] = []

    global_v_max = -float('inf')
    global_v_max_base = None
    global_v_min = float('inf')
    global_v_min_base = None
    global_h_max = -float('inf')
    global_h_max_base = None

    for bname in bases_to_process:
        if bname not in bases_dict:
            continue
        base_loads = bases_dict[bname]
        calc = calculate_single_base_combinations(bname, base_loads, standard, method, options)
        processed_bases[bname] = calc

        env = calc['envelopes']
        vm = env['V_max']['value']
        vmin = env['V_min']['value']
        hm = env['H_max']['value']
        xm = env['X_max']['value']
        ym = env['Y_max']['value']

        if vm > global_v_max:
            global_v_max = vm
            global_v_max_base = bname
        if vmin < global_v_min:
            global_v_min = vmin
            global_v_min_base = bname
        if hm > global_h_max:
            global_h_max = hm
            global_h_max_base = bname

        summary_table.append({
            'base': bname,
            # 1. Picos Globais (Vmax, Xmax, Ymax, Hmax)
            'peak_V': round(vm, 2),
            'peak_X': round(xm, 2),
            'peak_Y': round(ym, 2),
            'peak_H': round(hm, 2),

            # 2. V max e concomitantes
            'V_max': round(vm, 2),
            'V_max_comb': env['V_max']['combination'],
            'V_max_formula': env['V_max']['formula'],
            'V_max_X': round(env['V_max']['concomitant_X'], 2),
            'V_max_Y': round(env['V_max']['concomitant_Y'], 2),
            'V_max_H': round(env['V_max']['concomitant_H'], 2),

            # 3. V min e concomitantes
            'V_min': round(vmin, 2),
            'V_min_comb': env['V_min']['combination'],
            'V_min_formula': env['V_min']['formula'],
            'V_min_X': round(env['V_min']['concomitant_X'], 2),
            'V_min_Y': round(env['V_min']['concomitant_Y'], 2),
            'V_min_H': round(env['V_min']['concomitant_H'], 2),

            # 4. X max e concomitantes
            'X_max': round(xm, 2),
            'X_max_real': round(env['X_max'].get('real_value', xm), 2),
            'X_max_comb': env['X_max']['combination'],
            'X_max_formula': env['X_max']['formula'],
            'X_max_V': round(env['X_max']['concomitant_V'], 2),
            'X_max_Y': round(env['X_max']['concomitant_Y'], 2),
            'X_max_H': round(env['X_max']['concomitant_H'], 2),

            # 5. Y max e concomitantes
            'Y_max': round(ym, 2),
            'Y_max_real': round(env['Y_max'].get('real_value', ym), 2),
            'Y_max_comb': env['Y_max']['combination'],
            'Y_max_formula': env['Y_max']['formula'],
            'Y_max_V': round(env['Y_max']['concomitant_V'], 2),
            'Y_max_X': round(env['Y_max']['concomitant_X'], 2),
            'Y_max_H': round(env['Y_max']['concomitant_H'], 2),

            # 6. H max e concomitantes
            'H_max': round(hm, 2),
            'H_max_comb': env['H_max']['combination'],
            'H_max_formula': env['H_max']['formula'],
            'H_max_V': round(env['H_max']['concomitant_V'], 2),
            'H_max_X': round(env['H_max']['concomitant_X'], 2),
            'H_max_Y': round(env['H_max']['concomitant_Y'], 2)
        })

    actions_summary, bases_nominal = _extract_actions_summary(sheet_data, bases_to_process, options, standard)

    opts = options or {}
    base_groups = opts.get('base_groups')
    combined_footings = calculate_combined_footing_envelopes(processed_bases, base_groups)

    return {
        'sheet_name': sheet_data.get('sheet_name', ''),
        'standard': standard,
        'method': method,
        'total_bases': len(summary_table),
        'global_kpi': {
            'V_max': round(global_v_max, 2) if global_v_max != -float('inf') else 0.0,
            'V_max_base': global_v_max_base or '--',
            'V_min': round(global_v_min, 2) if global_v_min != float('inf') else 0.0,
            'V_min_base': global_v_min_base or '--',
            'H_max': round(global_h_max, 2) if global_h_max != -float('inf') else 0.0,
            'H_max_base': global_h_max_base or '--'
        },
        'summary_table': summary_table,
        'bases_details': processed_bases,
        'combined_footings': combined_footings,
        'actions_summary': actions_summary,
        'bases_nominal_loads': bases_nominal,
        'options': options or {}
    }


def export_mietc_results_to_excel(results_data: Dict[str, Any], output_path: str) -> str:
    """
    Exporta os resultados de todas as bases e combinações em uma planilha Excel
    com formatação executiva para avaliação de terceiros e auditoria técnica:
    1. Aba 'Resumo_Cargas_Consideradas': síntese das hipóteses de carregamento, coeficientes normativos,
       extremos nominais característicos e matriz de cargas nominais por base.
    2. Aba 'Resumo_Envoltórias': tabela executiva para dimensionamento de fundações.
    3. Aba 'Todas_Combinações': listagem exaustiva de V, X, Y e H_res para cada base.
    """
    wb = openpyxl.Workbook()

    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    # Estilos Visuais Profissionais
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    section_fill = PatternFill(start_color="334155", end_color="334155", fill_type="solid")
    accent_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    amber_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")

    header_font = Font(name="Arial", size=9, bold=True, color="FFFFFF")
    section_font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    data_font = Font(name="Arial", size=9)
    bold_font = Font(name="Arial", size=9, bold=True)
    mono_font = Font(name="Consolas", size=9)
    mono_bold = Font(name="Consolas", size=9, bold=True)
    amber_font = Font(name="Arial", size=9, bold=True, color="92400E")

    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )

    sheet_name = results_data.get('sheet_name', '')
    standard = results_data.get('standard', 'NBR 8681')
    method = results_data.get('method', 'ELU_NORMAL')
    total_bases = results_data.get('total_bases', len(results_data.get('summary_table', [])))

    opts = results_data.get('options', {})
    enable_zero = opts.get('enable_zero_load_scenarios', True)
    zero_status = "Habilitado (Variantes 0.00 p/ Tração Máx. / Alívio em Sapatas)" if enable_zero else "Desabilitado"

    actions_summary = results_data.get('actions_summary')
    bases_nominal = results_data.get('bases_nominal_loads', {})

    # Fallback se actions_summary não veio preenchido
    if not actions_summary:
        actions_summary = []
        bases_details = results_data.get('bases_details', {})
        factors_seen = {}
        for bname, bcalc in bases_details.items():
            for c in bcalc.get('combinations', []):
                for f_name, f_val in c.get('factors', {}).items():
                    if f_name not in factors_seen:
                        factors_seen[f_name] = f_val
        for f_name in sorted(list(factors_seen.keys())):
            meta = MIETC_ACTION_PROPS.get(f_name, {})
            is_var = meta.get('isVariable', f_name not in ['PP', 'CP'])
            actions_summary.append({
                'name': f_name,
                'description': meta.get('name', f_name),
                'category': 'Variável (Q)' if is_var else 'Permanente (G)',
                'group': 'Independente',
                'requires': 'Nenhum',
                'can_zero': is_var,
                'gamma_unfav': 1.40 if is_var else 1.35,
                'gamma_fav': 0.00 if is_var else 1.00,
                'psi0': 0.70 if is_var else 0.0,
                'psi1': 0.50 if is_var else 0.0,
                'psi2': 0.30 if is_var else 0.0,
                'occurrences': total_bases,
                'V_min': 0.0, 'V_min_base': '--',
                'V_max': 0.0, 'V_max_base': '--',
                'X_max_abs': 0.0, 'X_max_base': '--',
                'Y_max_abs': 0.0, 'Y_max_base': '--',
                'H_max': 0.0, 'H_max_base': '--'
            })

    # =========================================================================
    # 1. Aba 'Resumo_Cargas_Consideradas' (Avaliação de Terceiros e Auditoria)
    # =========================================================================
    ws_cargas = wb.active
    ws_cargas.title = "Resumo_Cargas_Consideradas"
    ws_cargas.views.sheetView[0].showGridLines = True

    # Banner de Cabeçalho
    ws_cargas.cell(1, 1, "RESUMO DAS CARGAS CONSIDERADAS E PREMISSAS NORMATIVAS (AVALIAÇÃO DE TERCEIROS)").font = Font(name="Arial", size=12, bold=True, color="0F172A")
    ws_cargas.cell(2, 1, f"Estrutura / Aba: {sheet_name} • Norma: {standard} • Método: {method} • Total de Bases: {total_bases} • Alívio Crítico (Ações Zeradas): {zero_status}").font = Font(name="Arial", size=9, italic=True, color="475569")

    # --- Tabela 1: Hipóteses Normativas e Coeficientes ---
    row_cargas = 4
    ws_cargas.cell(row_cargas, 1, "1. HIPÓTESES DE CARREGAMENTO E COEFICIENTES DE PONDERAÇÃO NORMATIVOS (NBR 8681 / NBR 6118)").font = Font(name="Arial", size=10, bold=True, color="0F172A")
    row_cargas += 1

    headers_tab1 = [
        "#", "Ação (Sigla)", "Denominação da Carga", "Natureza", "Grupo Exclusivo (XOR)",
        "Requisito Físico (AND)", "Pode Zerar (Alívio Crítico)", "γ_f Desf.", "γ_f Fav.",
        "ψ₀ (Combinação)", "ψ₁ (Frequente)", "ψ₂ (Quase-Perm.)", "Bases Ativas"
    ]
    for col_idx, h in enumerate(headers_tab1, start=1):
        cell = ws_cargas.cell(row_cargas, col_idx, h)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center" if col_idx in [1, 2, 4, 5, 6, 7, 13] else ("left" if col_idx == 3 else "right"), vertical="center", wrap_text=True)

    row_cargas += 1
    for idx, act in enumerate(actions_summary, start=1):
        ws_cargas.cell(row_cargas, 1, idx).alignment = Alignment(horizontal="center")
        ws_cargas.cell(row_cargas, 1).font = bold_font
        ws_cargas.cell(row_cargas, 1).border = thin_border

        ws_cargas.cell(row_cargas, 2, act['name']).alignment = Alignment(horizontal="center")
        ws_cargas.cell(row_cargas, 2).font = bold_font
        ws_cargas.cell(row_cargas, 2).border = thin_border

        ws_cargas.cell(row_cargas, 3, act['description']).font = data_font
        ws_cargas.cell(row_cargas, 3).border = thin_border

        ws_cargas.cell(row_cargas, 4, act['category']).alignment = Alignment(horizontal="center")
        ws_cargas.cell(row_cargas, 4).font = data_font
        ws_cargas.cell(row_cargas, 4).border = thin_border

        ws_cargas.cell(row_cargas, 5, act['group']).alignment = Alignment(horizontal="center")
        ws_cargas.cell(row_cargas, 5).font = data_font
        ws_cargas.cell(row_cargas, 5).border = thin_border

        ws_cargas.cell(row_cargas, 6, act['requires']).alignment = Alignment(horizontal="center")
        ws_cargas.cell(row_cargas, 6).font = data_font
        ws_cargas.cell(row_cargas, 6).border = thin_border

        cell_zero = ws_cargas.cell(row_cargas, 7, "SIM (Alívio Crítico)" if act['can_zero'] else "NÃO (Integral)")
        cell_zero.alignment = Alignment(horizontal="center")
        cell_zero.border = thin_border
        if act['can_zero']:
            cell_zero.fill = amber_fill
            cell_zero.font = amber_font
        else:
            cell_zero.font = data_font

        # Coeficientes
        for c_idx, val in enumerate([act['gamma_unfav'], act['gamma_fav'], act['psi0'], act['psi1'], act['psi2']], start=8):
            cell = ws_cargas.cell(row_cargas, c_idx, val)
            cell.font = mono_font
            cell.number_format = '0.00'
            cell.alignment = Alignment(horizontal="right")
            cell.border = thin_border

        cell_occ = ws_cargas.cell(row_cargas, 13, f"{act['occurrences']} / {total_bases}")
        cell_occ.alignment = Alignment(horizontal="center")
        cell_occ.font = mono_font
        cell_occ.border = thin_border

        row_cargas += 1

    # --- Tabela 2: Síntese das Cargas Características Nominais (Extremos) ---
    row_cargas += 2
    ws_cargas.cell(row_cargas, 1, "2. SÍNTESE DAS CARGAS CARACTERÍSTICAS NOMINAIS IMPORTADAS (VALORES EXTREMOS POR AÇÃO)").font = Font(name="Arial", size=10, bold=True, color="0F172A")
    row_cargas += 1

    headers_tab2 = [
        "Ação (Sigla)", "Denominação da Carga", "V_k Mín (kN)", "Base V_mín",
        "V_k Máx (kN)", "Base V_máx", "|X_k| Máx (kN)", "Base X_máx",
        "|Y_k| Máx (kN)", "Base Y_máx", "H_k Máx (kN)", "Base H_máx"
    ]
    for col_idx, h in enumerate(headers_tab2, start=1):
        cell = ws_cargas.cell(row_cargas, col_idx, h)
        cell.fill = section_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center" if col_idx in [1, 4, 6, 8, 10, 12] else ("left" if col_idx == 2 else "right"), vertical="center", wrap_text=True)

    row_cargas += 1
    for act in actions_summary:
        ws_cargas.cell(row_cargas, 1, act['name']).alignment = Alignment(horizontal="center")
        ws_cargas.cell(row_cargas, 1).font = bold_font
        ws_cargas.cell(row_cargas, 1).border = thin_border

        ws_cargas.cell(row_cargas, 2, act['description']).font = data_font
        ws_cargas.cell(row_cargas, 2).border = thin_border

        # V_min
        c_vmin = ws_cargas.cell(row_cargas, 3, act['V_min'])
        c_vmin.font = mono_bold if act['V_min'] < 0 else mono_font
        c_vmin.number_format = '0.00'
        c_vmin.alignment = Alignment(horizontal="right")
        c_vmin.border = thin_border

        c_vmin_b = ws_cargas.cell(row_cargas, 4, act['V_min_base'])
        c_vmin_b.alignment = Alignment(horizontal="center")
        c_vmin_b.font = data_font
        c_vmin_b.border = thin_border

        # V_max
        c_vmax = ws_cargas.cell(row_cargas, 5, act['V_max'])
        c_vmax.font = mono_bold
        c_vmax.number_format = '0.00'
        c_vmax.alignment = Alignment(horizontal="right")
        c_vmax.border = thin_border

        c_vmax_b = ws_cargas.cell(row_cargas, 6, act['V_max_base'])
        c_vmax_b.alignment = Alignment(horizontal="center")
        c_vmax_b.font = data_font
        c_vmax_b.border = thin_border

        # |X_max|
        c_xm = ws_cargas.cell(row_cargas, 7, act['X_max_abs'])
        c_xm.font = mono_font
        c_xm.number_format = '0.00'
        c_xm.alignment = Alignment(horizontal="right")
        c_xm.border = thin_border

        c_xm_b = ws_cargas.cell(row_cargas, 8, act['X_max_base'])
        c_xm_b.alignment = Alignment(horizontal="center")
        c_xm_b.font = data_font
        c_xm_b.border = thin_border

        # |Y_max|
        c_ym = ws_cargas.cell(row_cargas, 9, act['Y_max_abs'])
        c_ym.font = mono_font
        c_ym.number_format = '0.00'
        c_ym.alignment = Alignment(horizontal="right")
        c_ym.border = thin_border

        c_ym_b = ws_cargas.cell(row_cargas, 10, act['Y_max_base'])
        c_ym_b.alignment = Alignment(horizontal="center")
        c_ym_b.font = data_font
        c_ym_b.border = thin_border

        # H_max
        c_hm = ws_cargas.cell(row_cargas, 11, act['H_max'])
        c_hm.font = mono_bold
        c_hm.number_format = '0.00'
        c_hm.alignment = Alignment(horizontal="right")
        c_hm.border = thin_border

        c_hm_b = ws_cargas.cell(row_cargas, 12, act['H_max_base'])
        c_hm_b.alignment = Alignment(horizontal="center")
        c_hm_b.font = data_font
        c_hm_b.border = thin_border

        row_cargas += 1

    # --- Tabela 3: Matriz de Cargas Nominais por Base ---
    if bases_nominal:
        row_cargas += 2
        ws_cargas.cell(row_cargas, 1, "3. MATRIZ DE CARGAS CARACTERÍSTICAS NOMINAIS (V_k, X_k, Y_k) POR BASE").font = Font(name="Arial", size=10, bold=True, color="0F172A")
        row_cargas += 1

        headers_tab3 = ["Base"]
        for act in actions_summary:
            headers_tab3.extend([f"{act['name']} V_k (kN)", f"{act['name']} X_k (kN)", f"{act['name']} Y_k (kN)"])

        for col_idx, h in enumerate(headers_tab3, start=1):
            cell = ws_cargas.cell(row_cargas, col_idx, h)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center" if col_idx == 1 else "right", vertical="center", wrap_text=True)

        row_cargas += 1
        for b_name in sorted(list(bases_nominal.keys())):
            ws_cargas.cell(row_cargas, 1, b_name).font = bold_font
            ws_cargas.cell(row_cargas, 1).alignment = Alignment(horizontal="center")
            ws_cargas.cell(row_cargas, 1).border = thin_border

            c_off = 2
            for act in actions_summary:
                b_action_load = bases_nominal[b_name].get(act['name'], {})
                vk = float(b_action_load.get('V', 0.0))
                xk = float(b_action_load.get('X', 0.0))
                yk = float(b_action_load.get('Y', 0.0))

                for val in [vk, xk, yk]:
                    cell = ws_cargas.cell(row_cargas, c_off, val)
                    cell.font = mono_font
                    cell.number_format = '0.00'
                    cell.alignment = Alignment(horizontal="right")
                    cell.border = thin_border
                    c_off += 1

            row_cargas += 1

    # --- Seção 4: Notas Técnicas de Auditoria ---
    row_cargas += 2
    ws_cargas.cell(row_cargas, 1, "4. NOTAS TÉCNICAS E CRITÉRIOS DE AUDITORIA / AVALIAÇÃO DE TERCEIROS").font = Font(name="Arial", size=10, bold=True, color="0F172A")
    row_cargas += 1

    notas = [
        "a) Valores Nominais/Característicos: Os valores apresentados nas Tabelas 2 e 3 correspondem aos carregamentos nominais sem ponderação, extraídos dos softwares de análise estrutural.",
        "b) Coeficientes Normativos: A ponderação e combinação de esforços foi estabelecida em conformidade com as normas ABNT NBR 8681:2003 e NBR 6118:2023.",
        "c) Grupos Exclusivos (XOR): Ações pertencentes ao mesmo grupo (ex: ventos de diferentes direções ou estados de talha/ponte) são mutuamente exclusivas e não atuam simultaneamente.",
        "d) Dependência Física (AND): Ações com vínculo de dependência (ex: empuxo solo saturado) exigem a presença simultânea da ação predecessora (ex: pressão d'água).",
        "e) Alívio Crítico (Pode Zerar): As ações marcadas com 'SIM' geram variantes adicionais com fator 0.00 para avaliar com segurança a máxima tração (arrancamento) e alívio de peso em sapatas e estacas."
    ]
    for n in notas:
        ws_cargas.cell(row_cargas, 1, n).font = Font(name="Arial", size=8.5, italic=True, color="334155")
        row_cargas += 1

    # Auto-ajuste de colunas para ws_cargas
    for col in ws_cargas.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws_cargas.column_dimensions[col_letter].width = max(11, min(max_len + 3, 38))

    # =========================================================================
    # 2. Aba 'Resumo_Envoltórias' (Tabela Executiva de Fundações)
    # =========================================================================
    ws_sum = wb.create_sheet(title="Resumo_Envoltórias")
    ws_sum.views.sheetView[0].showGridLines = True

    ws_sum.cell(1, 1, f"RELATÓRIO DE ENVOLTÓRIAS DE CARGAS NAS BASES - {sheet_name}").font = Font(name="Arial", size=12, bold=True, color="0F172A")
    ws_sum.cell(2, 1, f"Norma: {standard} • Método: {method} • Unidades: Força em kN").font = Font(name="Arial", size=9, italic=True, color="64748B")

    headers_sum = [
        "Base",
        # 1. Picos Globais
        "1. V Máx Pico (kN)", "1. |X| Máx Pico (kN)", "1. |Y| Máx Pico (kN)", "1. H Máx Pico (kN)",
        # 2. V max e concomitantes
        "2. V Máx (kN)", "2. X Concom. (kN)", "2. Y Concom. (kN)", "2. H Concom. (kN)", "2. Comb. Crítica V_máx",
        # 3. V min e concomitantes
        "3. V Mín (kN)", "3. X Concom. (kN)", "3. Y Concom. (kN)", "3. H Concom. (kN)", "3. Comb. Crítica V_mín",
        # 4. X max e concomitantes
        "4. |X| Máx (kN)", "4. V Concom. (kN)", "4. Y Concom. (kN)", "4. H Concom. (kN)", "4. Comb. Crítica X_máx",
        # 5. Y max e concomitantes
        "5. |Y| Máx (kN)", "5. V Concom. (kN)", "5. X Concom. (kN)", "5. H Concom. (kN)", "5. Comb. Crítica Y_máx",
        # 6. H max e concomitantes
        "6. H Máx (kN)", "6. V Concom. (kN)", "6. X Concom. (kN)", "6. Y Concom. (kN)", "6. Comb. Crítica H_máx"
    ]

    for col_idx, h in enumerate(headers_sum, start=1):
        cell = ws_sum.cell(4, col_idx, h)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center" if col_idx == 1 else "right", vertical="center", wrap_text=True)

    row_curr = 5
    for item in results_data.get('summary_table', []):
        ws_sum.cell(row_curr, 1, item['base']).font = bold_font
        ws_sum.cell(row_curr, 1).alignment = Alignment(horizontal="center")
        ws_sum.cell(row_curr, 1).border = thin_border

        vals = [
            # 1. Picos Globais
            item.get('peak_V', item['V_max']), item.get('peak_X', item['X_max']), item.get('peak_Y', item['Y_max']), item.get('peak_H', item['H_max']),
            # 2. V max e concomitantes
            item['V_max'], item['V_max_X'], item['V_max_Y'], item.get('V_max_H', 0.0), item['V_max_comb'],
            # 3. V min e concomitantes
            item['V_min'], item['V_min_X'], item['V_min_Y'], item.get('V_min_H', 0.0), item['V_min_comb'],
            # 4. X max e concomitantes
            item['X_max'], item.get('X_max_V', 0.0), item.get('X_max_Y', 0.0), item.get('X_max_H', 0.0), item.get('X_max_comb', '--'),
            # 5. Y max e concomitantes
            item['Y_max'], item.get('Y_max_V', 0.0), item.get('Y_max_X', 0.0), item.get('Y_max_H', 0.0), item.get('Y_max_comb', '--'),
            # 6. H max e concomitantes
            item['H_max'], item.get('H_max_V', 0.0), item.get('H_max_X', 0.0), item.get('H_max_Y', 0.0), item['H_max_comb']
        ]

        for c_offset, v in enumerate(vals, start=2):
            cell = ws_sum.cell(row_curr, c_offset, v)
            cell.border = thin_border
            if isinstance(v, (int, float)):
                cell.font = mono_font
                cell.number_format = '0.00'
                cell.alignment = Alignment(horizontal="right")
            else:
                cell.font = data_font
                cell.alignment = Alignment(horizontal="left")
        row_curr += 1

    for col in ws_sum.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws_sum.column_dimensions[col_letter].width = max(11, min(max_len + 3, 35))

    # =========================================================================
    # 2.5 Aba 'Sapatas_Conjuntas' (Envoltórias e Decomposição de Bases Agrupadas)
    # =========================================================================
    combined_data = results_data.get('combined_footings', {})
    combined_summary = combined_data.get('summary_table', [])
    if combined_summary:
        ws_comb = wb.create_sheet(title="Sapatas_Conjuntas")
        ws_comb.views.sheetView[0].showGridLines = True

        ws_comb.cell(1, 1, "ENVOLTÓRIAS CRÍTICAS DE SAPATAS CONJUNTAS (BASES AGRUPADAS NA MESMA FUNDAÇÃO)").font = Font(name="Arial", size=12, bold=True, color="0F172A")
        ws_comb.cell(2, 1, f"Estrutura / Aba: {sheet_name} • Norma: {standard} • Método: {method} • Soma algébrica dos esforços (V, X, Y) em cada combinação simultânea").font = Font(name="Arial", size=9, italic=True, color="475569")

        ws_comb.cell(4, 1, "1. ENVOLTÓRIAS DE PROJETO DAS SAPATAS CONJUNTAS (kN)").font = Font(name="Arial", size=10, bold=True, color="0F172A")

        headers_comb = [
            "Sapata (Conjunto)", "Bases Integrantes",
            # 1. Picos Globais
            "1. V Máx Pico (kN)", "1. |X| Máx Pico (kN)", "1. |Y| Máx Pico (kN)", "1. H Máx Pico (kN)",
            # 2. V max e concomitantes
            "2. V Máx (kN)", "2. X Concom. (kN)", "2. Y Concom. (kN)", "2. H Concom. (kN)", "2. Comb. Crítica V_máx",
            # 3. V min e concomitantes
            "3. V Mín (kN)", "3. X Concom. (kN)", "3. Y Concom. (kN)", "3. H Concom. (kN)", "3. Comb. Crítica V_mín",
            # 4. X max e concomitantes
            "4. |X| Máx (kN)", "4. V Concom. (kN)", "4. Y Concom. (kN)", "4. H Concom. (kN)", "4. Comb. Crítica X_máx",
            # 5. Y max e concomitantes
            "5. |Y| Máx (kN)", "5. V Concom. (kN)", "5. X Concom. (kN)", "5. H Concom. (kN)", "5. Comb. Crítica Y_máx",
            # 6. H max e concomitantes
            "6. H Máx (kN)", "6. V Concom. (kN)", "6. X Concom. (kN)", "6. Y Concom. (kN)", "6. Comb. Crítica H_máx"
        ]

        for col_idx, h in enumerate(headers_comb, start=1):
            cell = ws_comb.cell(5, col_idx, h)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center" if col_idx <= 2 else "right", vertical="center", wrap_text=True)

        row_comb = 6
        for item in combined_summary:
            ws_comb.cell(row_comb, 1, item['base']).font = bold_font
            ws_comb.cell(row_comb, 1).alignment = Alignment(horizontal="center")
            ws_comb.cell(row_comb, 1).border = thin_border

            bases_str = " + ".join(item.get('member_bases', []))
            ws_comb.cell(row_comb, 2, bases_str).font = bold_font
            ws_comb.cell(row_comb, 2).alignment = Alignment(horizontal="center")
            ws_comb.cell(row_comb, 2).border = thin_border

            vals = [
                item.get('peak_V', item['V_max']), item.get('peak_X', item['X_max']), item.get('peak_Y', item['Y_max']), item.get('peak_H', item['H_max']),
                item['V_max'], item['V_max_X'], item['V_max_Y'], item.get('V_max_H', 0.0), item['V_max_comb'],
                item['V_min'], item['V_min_X'], item['V_min_Y'], item.get('V_min_H', 0.0), item['V_min_comb'],
                item['X_max'], item.get('X_max_V', 0.0), item.get('X_max_Y', 0.0), item.get('X_max_H', 0.0), item.get('X_max_comb', '--'),
                item['Y_max'], item.get('Y_max_V', 0.0), item.get('Y_max_X', 0.0), item.get('Y_max_H', 0.0), item.get('Y_max_comb', '--'),
                item['H_max'], item.get('H_max_V', 0.0), item.get('H_max_X', 0.0), item.get('H_max_Y', 0.0), item['H_max_comb']
            ]
            for c_offset, v in enumerate(vals, start=3):
                cell = ws_comb.cell(row_comb, c_offset, v)
                cell.border = thin_border
                if isinstance(v, (int, float)):
                    cell.font = mono_font
                    cell.number_format = '0.00'
                    cell.alignment = Alignment(horizontal="right")
                else:
                    cell.font = data_font
                    cell.alignment = Alignment(horizontal="left")
            row_comb += 1

        # Tabela 2: Detalhamento por Montante / Base
        row_comb += 2
        ws_comb.cell(row_comb, 1, "2. DETALHAMENTO DAS CONTRIBUIÇÕES INDIVIDUAIS DE CADA BASE NAS COMBINAÇÕES GOVERNANTES").font = Font(name="Arial", size=10, bold=True, color="0F172A")
        ws_comb.cell(row_comb + 1, 1, "Discriminação da parcela de esforços (V, X, Y) que cada montante transmite à sapata conjunta na combinação crítica de cada envoltória.").font = Font(name="Arial", size=9, italic=True, color="475569")
        row_comb += 3

        headers_decomp = [
            "Sapata (Conjunto)", "Caso de Envoltória Crítica", "Elemento / Montante",
            "Combinação Crítica Governante", "Vertical V (kN)", "Horizontal X (kN)", "Horizontal Y (kN)", "Resultante H (kN)"
        ]
        for col_idx, h in enumerate(headers_decomp, start=1):
            cell = ws_comb.cell(row_comb, col_idx, h)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center" if col_idx <= 3 else ("left" if col_idx == 4 else "right"), vertical="center")

        row_comb += 1
        decomp_cases = [
            ('V_max', '2. V Máximo (Compressão Total)', 'V_max_comb', 'V_max_breakdown', 'V_max', 'V_max_X', 'V_max_Y', 'V_max_H'),
            ('V_min', '3. V Mínimo (Alívio/Tração Total)', 'V_min_comb', 'V_min_breakdown', 'V_min', 'V_min_X', 'V_min_Y', 'V_min_H'),
            ('H_max', '6. H Resultante Máximo', 'H_max_comb', 'H_max_breakdown', 'H_max_V', 'H_max_X', 'H_max_Y', 'H_max')
        ]

        for item in combined_summary:
            s_name = item['base']
            for c_id, c_label, c_comb_key, c_bk_key, v_k, x_k, y_k, h_k in decomp_cases:
                comb_title = item.get(c_comb_key, '--')
                bk_dict = item.get(c_bk_key, {})

                # Linha TOTAL DA SAPATA
                ws_comb.cell(row_comb, 1, s_name).font = bold_font
                ws_comb.cell(row_comb, 1).border = thin_border
                ws_comb.cell(row_comb, 1).alignment = Alignment(horizontal="center")

                ws_comb.cell(row_comb, 2, c_label).font = bold_font
                ws_comb.cell(row_comb, 2).border = thin_border

                ws_comb.cell(row_comb, 3, "TOTAL SAPATA CONJUNTA").font = bold_font
                ws_comb.cell(row_comb, 3).border = thin_border
                ws_comb.cell(row_comb, 3).fill = accent_fill

                ws_comb.cell(row_comb, 4, comb_title).font = data_font
                ws_comb.cell(row_comb, 4).border = thin_border

                tot_vals = [item.get(v_k, 0.0), item.get(x_k, 0.0), item.get(y_k, 0.0), item.get(h_k, 0.0)]
                for c_off, tv in enumerate(tot_vals, start=5):
                    cell = ws_comb.cell(row_comb, c_off, tv)
                    cell.font = mono_bold
                    cell.number_format = '0.00'
                    cell.alignment = Alignment(horizontal="right")
                    cell.border = thin_border
                    cell.fill = accent_fill
                row_comb += 1

                # Linhas para cada base do grupo
                for mb in item.get('member_bases', []):
                    mb_loads = bk_dict.get(mb, {})
                    ws_comb.cell(row_comb, 1, s_name).font = data_font
                    ws_comb.cell(row_comb, 1).border = thin_border
                    ws_comb.cell(row_comb, 1).alignment = Alignment(horizontal="center")

                    ws_comb.cell(row_comb, 2, c_label).font = data_font
                    ws_comb.cell(row_comb, 2).border = thin_border

                    ws_comb.cell(row_comb, 3, f"↳ {mb} (Montante)").font = data_font
                    ws_comb.cell(row_comb, 3).border = thin_border

                    ws_comb.cell(row_comb, 4, "(mesma combinação acima)").font = data_font
                    ws_comb.cell(row_comb, 4).border = thin_border

                    b_vals = [mb_loads.get('V', 0.0), mb_loads.get('X', 0.0), mb_loads.get('Y', 0.0), mb_loads.get('H_res', 0.0)]
                    for c_off, bv in enumerate(b_vals, start=5):
                        cell = ws_comb.cell(row_comb, c_off, bv)
                        cell.font = mono_font
                        cell.number_format = '0.00'
                        cell.alignment = Alignment(horizontal="right")
                        cell.border = thin_border
                    row_comb += 1

        for col in ws_comb.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws_comb.column_dimensions[col_letter].width = max(11, min(max_len + 3, 38))

    # =========================================================================
    # 3. Aba 'Todas_Combinações' (Listagem Exaustiva)
    # =========================================================================
    ws_all = wb.create_sheet(title="Todas_Combinações")
    ws_all.views.sheetView[0].showGridLines = True

    headers_all = [
        "Base", "Estado Limite", "Identificação da Combinação", "Fórmula Analítica Ponderada",
        "Vertical V (kN)", "Horizontal X (kN)", "Horizontal Y (kN)", "Resultante H (kN)"
    ]

    for col_idx, h in enumerate(headers_all, start=1):
        cell = ws_all.cell(1, col_idx, h)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center" if col_idx <= 2 else ("left" if col_idx in [3, 4] else "right"), vertical="center")

    row_curr = 2
    details = results_data.get('bases_details', {})
    for bname, bdata in details.items():
        for c in bdata.get('combinations', []):
            ws_all.cell(row_curr, 1, bname).font = bold_font
            ws_all.cell(row_curr, 1).alignment = Alignment(horizontal="center")
            ws_all.cell(row_curr, 1).border = thin_border

            ws_all.cell(row_curr, 2, c.get('limit_state', 'ELU')).font = data_font
            ws_all.cell(row_curr, 2).alignment = Alignment(horizontal="center")
            ws_all.cell(row_curr, 2).border = thin_border

            ws_all.cell(row_curr, 3, c.get('title', '')).font = data_font
            ws_all.cell(row_curr, 3).border = thin_border

            ws_all.cell(row_curr, 4, c.get('formula', '')).font = mono_font
            ws_all.cell(row_curr, 4).border = thin_border

            for c_idx, k in enumerate(['V', 'X', 'Y', 'H_res'], start=5):
                cell = ws_all.cell(row_curr, c_idx, round(c.get(k, 0.0), 2))
                cell.font = mono_font
                cell.number_format = '0.00'
                cell.alignment = Alignment(horizontal="right")
                cell.border = thin_border

            row_curr += 1

    for col in ws_all.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws_all.column_dimensions[col_letter].width = max(11, min(max_len + 3, 45))

    wb.save(output_path)
    wb.close()
    return output_path
