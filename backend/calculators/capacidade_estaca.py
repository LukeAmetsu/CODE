"""
Calculador de Capacidade de Carga Geotécnica de Estacas Escavadas de Grande Diâmetro
Referência: Planilha 'capacidade estaca.xlsx' (Nova Versão Atualizada)
Método: FHWA GEC 010 / AASHTO / O'Neill & Reese / Mayne Beta-Method

Todos os fatores antes manuais agora são INPUTS totalmente parametrizáveis:
- Fator de Segurança (FS = 2.0 padrão)
- Redução de resistência por camisa metálica (10% padrão -> fator 0.90)
- Modo de aplicação da camisa (na capacidade admissível ou apenas no atrito lateral)
- Cota TOPO / arrasamento e cálculo do Embutimento útil (Cota Fundo - Cota Topo)
- Coeficiente de ponta kp (0.59 padrão)
- Limite máximo do fator de sobrecarga CN (2.0 padrão)
- Pressão atmosférica pa (101.3 kPa padrão)
- Cota do Nível d'Água N.A. (3.0m padrão)
- Carga de projeto alvo (21.400 kN padrão)
- Percentil da síntese estatística (10% padrão)
"""

import math
import os
import json
from typing import List, Dict, Any, Optional, Tuple, Union
from collections import Counter
import numpy as np

DEFAULT_SOIL_GROUPS = {
    "Relleno (Aterro)": {"gamma_dry": 17.0, "gamma_sub": 10.0, "descricao": "Aterro compactado / Relleno"},
    "Areias": {"gamma_dry": 18.5, "gamma_sub": 8.5, "descricao": "Areias e areias siltosas/argilosas"},
    "Gravas": {"gamma_dry": 20.0, "gamma_sub": 10.5, "descricao": "Solos pedregulhosos e gravas"},
    "Finos": {"gamma_dry": 18.0, "gamma_sub": 11.0, "descricao": "Solos argilosos e siltosos finos"}
}

DEFAULT_PILES = [
    {
        "id": "pile_48in",
        "name": "Drilled Shaft D=1.20m (48\")",
        "diam_in": 48.0,
        "diam_m": 1.20,
        "perimeter_m": 3.76,  # =ROUNDDOWN(1.2 * PI, 2)
        "area_m2": 1.13       # =ROUNDDOWN(PI * (1.2/2)^2, 2)
    },
    {
        "id": "pile_54in",
        "name": "Drilled Shaft D=1.30m (54\")",
        "diam_in": 54.0,
        "diam_m": 1.30,
        "perimeter_m": 4.08,  # =ROUNDDOWN(1.3 * PI, 2)
        "area_m2": 1.32       # =ROUNDDOWN(PI * (1.3/2)^2, 2)
    },
    {
        "id": "pile_60in",
        "name": "Drilled Shaft D=1.50m (60\")",
        "diam_in": 60.0,
        "diam_m": 1.50,
        "perimeter_m": 4.71,  # =ROUNDDOWN(1.5 * PI, 2)
        "area_m2": 1.76       # =ROUNDDOWN(PI * (1.5/2)^2, 2)
    }
]

# Eixos da nova versão da planilha (Cota TOPO: Eixo C agora é 14.40m)
DEFAULT_AXES = [
    {"name": "A", "cota_inicio_m": 20.75},
    {"name": "B", "cota_inicio_m": 19.00},
    {"name": "C", "cota_inicio_m": 14.40},
    {"name": "D", "cota_inicio_m": 9.35},
    {"name": "E", "cota_inicio_m": 4.60}
]

DEFAULT_MODEL_FACTORS = {
    "fs": 2.0,                                   # Fator de Segurança global (padrão 2.0)
    "fs_lateral": 1.5,                           # Fator de Segurança para atrito lateral (padrão 1.5)
    "fs_ponta": 3.0,                             # Fator de Segurança para resistência de ponta (padrão 3.0)
    "casing_reduction_pct": 10.0,                # Redução da camisa metálica em % (padrão 10% -> fator 0.90)
    "casing_reduction_mode": "excel_formula",     # 'excel_formula' (Radm * (1 - red)) ou 'lateral_only' (Rs * (1 - red))
    "casing_length_m": None,                     # Extensão da camisa metálica em metros (None = estaca inteira)
    "lateral_method": "mayne_fhwa",              # 'mayne_fhwa' (FHWA GEC 010) ou 'aashto_2007' (AASHTO 2007 β-method ≤ 4 ksf)
    "tip_method": "aashto_2007",                 # 'aashto_2007' (AASHTO 2007 kp) ou 'aashto_2024' (AASHTO 2024 1.2N ≤ 60 ksf)
    "apply_qs_cap": False,                       # Trava unitária qs <= 0.19 MPa (False = FHWA puro / planilha original; True = Haskoning / AASHTO 2017)
    "apply_qp_cap": True,                        # Trava unitária qp <= 60 ksf (True = AASHTO 2024; False = Sem limite / Haskoning)
    "soil_above_removed": False,                 # Se True, acima da cota inicial não há solo (ativado automaticamente pela AASHTO)
    "beta_depth_ref": "relative_to_top",         # 'relative_to_top' (Haskoning) ou 'absolute' (FHWA)
    "qs_max_ksf": 4.0,                           # Limite superior qs para AASHTO 2007 (4.0 ksf = 191.52 kPa ~ 192 kPa)
    "qp_max_ksf": 60.0,                          # Limite superior qp para AASHTO 2024 (60.0 ksf = 2872.82 kPa)
    "beta_min": 0.25,                            # Limite inferior de beta AASHTO (AASHTO 2017: 0.25)
    "beta_max": 1.8,                             # Limite superior de beta AASHTO (AASHTO 2017: 1.8)
    "apply_beta_limits": True,                   # Trava de valores de beta (beta_min <= beta <= beta_max): toggle de 1 clique
    "apply_beta_fhwa_limit": True,               # Critério FHWA 10-13 global
    "apply_shallow_stress_limit": True,          # Trava de tensão mínima rasa sigma'v >= 43.1 kPa para cálculo de beta: toggle de 1 clique
    "beta_shallow_stress_limit_kpa": 43.1,       # Limite de 900 psf (7.5 ft) ~ 43.1 kPa para profundidades rasas
    "beta_cap_kp_tan_phi": True,                 # Limite superior beta <= Kp * tan(phi')
    "kp_base": 0.59,                             # Coeficiente de ponta FHWA (0.59)
    "pa_kpa": 101.3,                             # Pressão atmosférica (101.3 kPa)
    "cn_max": 2.0,                               # Limite superior de CN (2.0)
    "water_table_m": 3.0,                        # Cota do N.A. (3.0 m)
    "target_load_kN": 21400.0,                   # Carga de projeto alvo (21.400 kN)
    "percentile": 10.0,                          # Percentil estatístico (10%)
    "phi_c1": 27.5,                              # Correlação phi': c1 + c2 * log10(N)
    "phi_c2": 9.2,
    "extrapolate_soundings": True,               # Extrapolação caso a estaca ultrapasse a sondagem medida
    "spt01_measured_depth_m": 44.4,              # Profundidade real medida do SPT-01 (44.4m)
    "extrapolation_n_percentile": 15.0,          # Percentil de N60/Nspt para solo extrapolado (15% gera N=27 no SPT-01)
    "extrapolation_max_depth_m": 132.6,          # Profundidade máxima de extrapolação (132.6m)
    "extrapolation_soil_group": "auto",          # 'auto' = busca o solo mais comum da sondagem
    "consider_pile_weight": False,               # Se True, desconta peso próprio efetivo (Net Capacity)
    "concrete_unit_weight": 24.0,                # Peso específico do concreto armado (kN/m³)
    "water_unit_weight": 10.0,                   # Peso específico da água (kN/m³)
    "pile_weight_mode": "submerged_concrete"     # 'submerged_concrete' (γ'c = 14 kN/m³) ou 'displaced_soil' (γc - γsoil)
}


def detect_min_sounding_depth(
    soundings: Dict[str, List[Dict[str, Any]]],
    spt01_depth: float = 44.4
) -> Tuple[float, str, Dict[str, float]]:
    """
    Busca a menor profundidade medida entre todos os furos de sondagem do projeto
    para usar como base da extrapolação em profundidade.
    """
    depths = {}
    for s_name, layers in soundings.items():
        if s_name == "SPT-01":
            depths[s_name] = round(spt01_depth, 2)
        else:
            real_layers = [l for l in layers if not l.get("is_extrapolated", False)]
            if real_layers:
                m_depth = max([float(l.get("z_fim", 0.0)) for l in real_layers])
            elif layers:
                m_depth = max([float(l.get("z_fim", 0.0)) for l in layers])
            else:
                m_depth = 0.0
            depths[s_name] = round(m_depth, 2)

    if depths:
        min_s_name = min(depths, key=depths.get)
        min_depth = depths[min_s_name]
    else:
        min_s_name = "SPT-01"
        min_depth = 44.4

    return min_depth, min_s_name, depths


def compute_extrapolation_estimates(
    layers: List[Dict[str, Any]],
    measured_depth_m: Optional[float] = None,
    n_percentile: float = 15.0,
    max_depth_m: float = 132.6,
    forced_soil_group: Optional[str] = None,
    water_table_m: float = 3.0,
    soil_groups: Optional[Dict[str, Dict[str, float]]] = None,
    kp_base: float = 0.59,
    pa_kpa: float = 101.3,
    cn_max: float = 2.0,
    apply_beta_fhwa_limit: bool = True,
    beta_shallow_stress_limit_kpa: float = 43.1,
    beta_cap_kp_tan_phi: bool = True,
    lateral_method: str = "mayne_fhwa",
    tip_method: str = "aashto_2007",
    qs_max_ksf: float = 4.0,
    qp_max_ksf: float = 60.0,
    beta_min: float = 0.25,
    beta_max: float = 1.8,
    apply_beta_limits: bool = True,
    apply_shallow_stress_limit: bool = True,
    apply_qs_cap: bool = False,
    apply_qp_cap: bool = True,
    sounding_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Calcula detalhadamente as estimativas geotécnicas do solo extrapolado ESPECÍFICAS
    da sondagem fornecida:
    - Profundidade medida real identificada a partir das camadas medidas da sondagem
    - Solo mais comum (moda) e SUCS exclusivamente da sondagem
    - Solo da última camada medida (last_layer)
    - Percentil de N60/Nspt exclusivamente da sondagem
    - Parâmetros derivados: phi', gamma, qs médio, qp médio
    - Trecho e camadas sintetizadas
    """
    # 1. Filtra camadas medidas da própria sondagem
    if measured_depth_m is not None and measured_depth_m > 0:
        if sounding_name == "SPT-01":
            measured_layers = [
                l for l in layers
                if not l.get("is_extrapolated", False) and float(l.get("z_fim", 0.0)) <= measured_depth_m + 1e-4
            ]
        else:
            measured_layers = [
                l for l in layers
                if float(l.get("z_fim", 0.0)) <= measured_depth_m + 1e-4
            ]
        if not measured_layers:
            measured_layers = list(layers)
        actual_measured_depth = float(measured_depth_m)
    else:
        if sounding_name == "SPT-01":
            measured_layers = [
                l for l in layers
                if not l.get("is_extrapolated", False) and float(l.get("z_fim", 0.0)) <= 44.401
            ]
        else:
            measured_layers = [l for l in layers if not l.get("is_extrapolated", False)]
        if not measured_layers:
            measured_layers = list(layers)
        actual_measured_depth = max([float(l.get("z_fim", 0.0)) for l in measured_layers]) if measured_layers else 44.4

    # 2. Informações de solo específicas da sondagem
    groups = [l.get("soil_group", "") for l in measured_layers if l.get("soil_group")]
    group_counts = dict(Counter(groups))
    modal_group = Counter(groups).most_common(1)[0][0] if groups else "Areias"
    modal_count = Counter(groups).most_common(1)[0][1] if groups else 0
    modal_pct = round((modal_count / max(1, len(groups))) * 100.0, 1)

    sucs_list = [l.get("sucs", "") for l in measured_layers if l.get("sucs")]
    modal_sucs = Counter(sucs_list).most_common(1)[0][0] if sucs_list else ("SP-SM" if modal_group == "Areias" else "GW-GM")

    last_group = measured_layers[-1].get("soil_group", modal_group) if measured_layers else modal_group
    last_sucs = measured_layers[-1].get("sucs", modal_sucs) if measured_layers else modal_sucs

    if forced_soil_group in ("last_layer", "bottom_layer"):
        adopted_group = last_group
        adopted_sucs = last_sucs
    elif forced_soil_group and forced_soil_group != "auto":
        adopted_group = forced_soil_group
        adopted_sucs = modal_sucs
    else:
        # Automático: solo modal exclusivo da própria sondagem
        adopted_group = modal_group
        adopted_sucs = modal_sucs

    # 3. Percentil de N específico desta sondagem
    n_vals = [float(l.get("n1_60", l.get("nspt", 10.0))) for l in measured_layers]
    if n_vals:
        n_extrap = int(round(float(np.percentile(n_vals, n_percentile))))
        n_mean = round(float(np.mean(n_vals)), 1)
        n_median = round(float(np.median(n_vals)), 1)
        n_min = min(n_vals)
        n_max = max(n_vals)
    else:
        n_extrap = 27
        n_mean = 27.0
        n_median = 27.0
        n_min = 27.0
        n_max = 27.0
    n_extrap = max(1, n_extrap)

    phi_deg = round(27.5 + 9.2 * math.log10(n_extrap), 1)

    extrap_layers = extrapolate_sounding_layers(
        layers,
        measured_depth_m=actual_measured_depth,
        n_percentile=n_percentile,
        max_depth_m=max_depth_m,
        forced_soil_group=adopted_group,
        sounding_name=sounding_name
    )
    proc_layers = calculate_layer_stresses_and_strengths(
        extrap_layers,
        water_table_m=water_table_m,
        soil_groups=soil_groups,
        kp_base=kp_base,
        pa_kpa=pa_kpa,
        cn_max=cn_max,
        apply_beta_fhwa_limit=apply_beta_fhwa_limit,
        beta_shallow_stress_limit_kpa=beta_shallow_stress_limit_kpa,
        beta_cap_kp_tan_phi=beta_cap_kp_tan_phi,
        lateral_method=lateral_method,
        tip_method=tip_method,
        qs_max_ksf=qs_max_ksf,
        qp_max_ksf=qp_max_ksf,
        beta_min=beta_min,
        beta_max=beta_max,
        apply_beta_limits=apply_beta_limits,
        apply_shallow_stress_limit=apply_shallow_stress_limit,
        apply_qs_cap=apply_qs_cap,
        apply_qp_cap=apply_qp_cap
    )

    synth_layers = [l for l in proc_layers if l.get("is_extrapolated") or l["z_fim"] > actual_measured_depth + 1e-4]
    extrap_len = max(0.0, max_depth_m - actual_measured_depth)
    num_layers = len(synth_layers) if synth_layers else int(round(extrap_len / 0.6))

    avg_qs = round(float(np.mean([l["qs"] for l in synth_layers])), 1) if synth_layers else 0.0
    avg_qp = round(float(np.mean([l["qp"] for l in synth_layers])), 1) if synth_layers else 0.0
    min_qs = round(float(min([l["qs"] for l in synth_layers])), 1) if synth_layers else 0.0
    max_qs = round(float(max([l["qs"] for l in synth_layers])), 1) if synth_layers else 0.0

    return {
        "sounding_name": sounding_name or "Sounding",
        "base_depth_m": round(actual_measured_depth, 2),
        "max_depth_m": round(max_depth_m, 2),
        "extrapolated_length_m": round(extrap_len, 2),
        "num_extrapolated_layers": num_layers,
        "modal_soil_group": modal_group,
        "modal_soil_count": modal_count,
        "total_measured_layers": len(groups),
        "modal_soil_pct": modal_pct,
        "modal_sucs": modal_sucs,
        "last_soil_group": last_group,
        "last_sucs": last_sucs,
        "adopted_soil_group": adopted_group,
        "adopted_sucs": adopted_sucs,
        "group_counts": group_counts,
        "n_percentile": n_percentile,
        "estimated_n60": n_extrap,
        "n_mean": n_mean,
        "n_median": n_median,
        "n_min": n_min,
        "n_max": n_max,
        "estimated_phi_deg": phi_deg,
        "avg_qs_kpa": avg_qs,
        "avg_qp_kpa": avg_qp,
        "min_qs_kpa": min_qs,
        "max_qs_kpa": max_qs
    }


def extrapolate_sounding_layers(
    layers: List[Dict[str, Any]],
    measured_depth_m: Optional[float] = None,
    n_percentile: float = 15.0,
    max_depth_m: float = 132.6,
    forced_soil_group: Optional[str] = None,
    sounding_name: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Mantém as camadas reais medidas até a profundidade da sondagem e sintetiza camadas profundas
    além dessa profundidade com base estritamente nas informações da própria sondagem:
    - O tipo de solo modal (ou última camada) desta sondagem
    - O SUCS modal desta sondagem
    - O percentil de N60/Nspt das camadas medidas desta sondagem
    """
    step_dz = 0.6

    # 1. Filtra camadas reais medidas exclusivamente desta sondagem
    if measured_depth_m is not None and measured_depth_m > 0:
        if sounding_name == "SPT-01":
            measured_layers = [
                l for l in layers
                if not l.get("is_extrapolated", False) and float(l.get("z_fim", 0.0)) <= measured_depth_m + 1e-4
            ]
        else:
            measured_layers = [
                l for l in layers
                if float(l.get("z_fim", 0.0)) <= measured_depth_m + 1e-4
            ]
        if not measured_layers:
            measured_layers = list(layers)
        actual_measured_depth = float(measured_depth_m)
    else:
        if sounding_name == "SPT-01":
            measured_layers = [
                l for l in layers
                if not l.get("is_extrapolated", False) and float(l.get("z_fim", 0.0)) <= 44.401
            ]
        else:
            measured_layers = [l for l in layers if not l.get("is_extrapolated", False)]
        if not measured_layers:
            measured_layers = list(layers)
        actual_measured_depth = max([float(l.get("z_fim", 0.0)) for l in measured_layers]) if measured_layers else 44.4

    # 2. Identifica tipo de solo e SUCS específicos da sondagem
    groups = [l.get("soil_group", "Areias") for l in measured_layers if l.get("soil_group")]
    modal_group = Counter(groups).most_common(1)[0][0] if groups else "Areias"

    sucs_list = [l.get("sucs", "") for l in measured_layers if l.get("sucs")]
    modal_sucs = Counter(sucs_list).most_common(1)[0][0] if sucs_list else ("SP-SM" if modal_group == "Areias" else "GW-GM")

    last_group = measured_layers[-1].get("soil_group", modal_group) if measured_layers else modal_group
    last_sucs = measured_layers[-1].get("sucs", modal_sucs) if measured_layers else modal_sucs

    if forced_soil_group in ("last_layer", "bottom_layer"):
        adopted_group = last_group
        adopted_sucs = last_sucs
    elif forced_soil_group and forced_soil_group != "auto":
        adopted_group = forced_soil_group
        adopted_sucs = modal_sucs
    else:
        # Automático: solo mais frequente nesta sondagem
        adopted_group = modal_group
        adopted_sucs = modal_sucs

    # 3. Calcula percentil de N60 / N_spt nas camadas medidas desta sondagem
    n_vals = [float(l.get("n1_60", l.get("nspt", 10.0))) for l in measured_layers]
    if n_vals:
        n_extrap = int(round(float(np.percentile(n_vals, n_percentile))))
    else:
        n_extrap = 27
    n_extrap = max(1, n_extrap)

    # 4. Constrói a lista final: medidas reais + extrapoladas
    final_layers = []
    for l in measured_layers:
        item = dict(l)
        item["is_extrapolated"] = False
        final_layers.append(item)

    current_z = actual_measured_depth
    while current_z + 1e-4 < max_depth_m:
        z_next = round(current_z + step_dz, 2)
        final_layers.append({
            "z_ini": round(current_z, 2),
            "z_fim": z_next,
            "n1_60": n_extrap,
            "soil_group": adopted_group,
            "sucs": adopted_sucs,
            "is_extrapolated": True
        })
        current_z = z_next

    return final_layers


def calculate_layer_stresses_and_strengths(
    layers: List[Dict[str, Any]],
    water_table_m: float = 3.0,
    soil_groups: Optional[Dict[str, Dict[str, float]]] = None,
    kp_base: float = 0.59,
    pa_kpa: float = 101.3,
    cn_max: float = 2.0,
    phi_c1: float = 27.5,
    phi_c2: float = 9.2,
    apply_beta_fhwa_limit: bool = True,
    beta_shallow_stress_limit_kpa: float = 43.1,
    beta_cap_kp_tan_phi: bool = True,
    lateral_method: str = "mayne_fhwa",
    tip_method: str = "aashto_2007",
    qs_max_ksf: float = 4.0,
    qp_max_ksf: float = 60.0,
    beta_min: float = 0.25,
    beta_max: float = 1.8,
    apply_beta_limits: bool = True,
    apply_shallow_stress_limit: bool = True,
    apply_qs_cap: bool = True,
    apply_qp_cap: bool = True,
    z_ref_offset_m: float = 0.0,
    initial_sigma_v_kpa: float = 0.0
) -> List[Dict[str, Any]]:
    """
    Calcula tensões verticais efetivas no ponto médio, parâmetros de sobrecarga,
    ângulo de atrito, tensão de pré-adensamento e resistências unitárias qs e qp.
    
    Métodos para Atrito Lateral (qs):
      - 'mayne_fhwa': FHWA GEC 010 / Mayne Beta-Method, com critério Eq. 10-13 (beta <= Kp*tan(phi') e sigma'_v >= 43.1 kPa).
      - 'aashto_2007': AASHTO 2007 / 2017 (Seção 10.8.3.5.2b):
                       Areias: beta = 1.5 - 0.135*sqrt(z_ft) [ou *(N60/15) se N60<15]
                       Gravas: beta = 2.0 - 0.150*sqrt(z_ft) [ou *(N60/15) se N60<15]
                       Limitado a beta_min <= beta <= beta_max (AASHTO 2017: 0.25 <= beta <= 1.8)
                       e qs <= qs_max_ksf (4.0 ksf = 191.52 kPa ~ 192 kPa).
                       Suporta profundidade relativa ao topo/leito marinho (z_ref_offset_m > 0, critério Haskoning).
                       Trava de atrito qs_max pode ser ativada/desativada via apply_qs_cap.
    
    Métodos para Resistência de Ponta (qp):
      - 'aashto_2007': AASHTO 2007 / O'Neill & Reese: qp = kp * [N60 * pa / sigma'_v]^0.8 * sigma'_v.
      - 'aashto_2024': AASHTO 2024 (Seção 10.8.3.5.2c / Brown et al. 2010): qp = 1.2 * N60 [ksf], limitado a qp_max_ksf (60.0 ksf = 2872.82 kPa).
                       Trava de ponta qp_max pode ser ativada/desativada via apply_qp_cap (critério Haskoning: sem limite).
    """
    if soil_groups is None:
        soil_groups = DEFAULT_SOIL_GROUPS

    processed_layers = []
    sigma_v_prev = float(initial_sigma_v_kpa or 0.0)

    for idx, lyr in enumerate(layers):
        z_ini = float(lyr.get("z_ini", 0.0))
        z_fim = float(lyr.get("z_fim", z_ini + 0.6))
        dz = z_fim - z_ini
        if dz <= 0:
            dz = 0.6

        n1_60 = float(lyr.get("n1_60", lyr.get("nspt", 10.0)))
        if n1_60 <= 0:
            n1_60 = 1.0

        grupo = lyr.get("soil_group", lyr.get("grupo", "Areias"))
        sucs = lyr.get("sucs", "")

        grp_params = soil_groups.get(grupo, soil_groups.get("Areias", {"gamma_dry": 18.5, "gamma_sub": 8.5}))
        is_dry = (z_ini < water_table_m)
        gamma = grp_params["gamma_dry"] if is_dry else grp_params["gamma_sub"]

        # Tensão vertical efetiva no ponto médio do segmento
        if idx == 0:
            sigma_v = sigma_v_prev + (dz / 2.0) * gamma
        else:
            prev_lyr = processed_layers[idx - 1]
            prev_dz = prev_lyr["dz"]
            prev_gamma = prev_lyr["gamma"]
            sigma_v = sigma_v_prev + (prev_dz / 2.0) * prev_gamma + (dz / 2.0) * gamma

        sigma_v_prev = sigma_v
        z_mid = z_ini + dz / 2.0

        # Fator de sobrecarga CN com limite superior cn_max
        cn = min(cn_max, math.sqrt(pa_kpa / max(sigma_v, 0.1)))
        n60 = n1_60 / max(cn, 0.01)

        # Ângulo de atrito interno phi'
        phi_deg = phi_c1 + phi_c2 * math.log10(n1_60)
        phi_rad = math.radians(phi_deg)
        sin_phi = math.sin(phi_rad)
        tan_phi = math.tan(phi_rad)

        # Coeficiente Kp de empuxo passivo (Rankine) e limite superior Kp * tan(phi') (FHWA Eq. 10-13)
        kp_rankine = (1.0 + sin_phi) / max(1.0 - sin_phi, 0.0001)
        kp_tan_phi = kp_rankine * tan_phi

        # Tensão de pré-adensamento aparente sigma'_p
        if grupo == "Areias":
            sigma_p = pa_kpa * 0.47 * (n60 ** 0.8)
        else:
            sigma_p = pa_kpa * 0.15 * n60

        # Coeficiente beta original (Mayne sem restrição)
        ocr_ratio_raw = max(sigma_p / max(sigma_v, 0.01), 0.01)
        beta_raw = (1.0 - sin_phi) * (ocr_ratio_raw ** sin_phi) * tan_phi

        # -------------------------------------------------------------
        # 1. Determinação de beta e da Resistência Lateral Unitária (qs)
        # -------------------------------------------------------------
        qs_capped = False
        beta_cap_reason = None
        qs_uncapped = beta_raw * sigma_v

        if lateral_method == "aashto_2007":
            # AASHTO 2007 / 2017 (Seção 10.8.3.5.2b):
            # z em pés no ponto médio da camada (suporta profundidade relativa ao topo se z_ref_offset_m > 0)
            z_mid_eff = max(0.0, z_mid - z_ref_offset_m)
            z_ft = max(0.0, z_mid_eff / 0.3048)
            sqrt_z = math.sqrt(z_ft)

            # Formulação AASHTO para Areias (1.5 - 0.135*sqrt(z)) vs Gravas (2.0 - 0.15*sqrt(z))
            if grupo == "Gravas":
                b_raw = 2.0 - 0.150 * sqrt_z
            else:
                b_raw = 1.5 - 0.135 * sqrt_z

            if n60 >= 15.0:
                b_calc = b_raw
            else:
                b_calc = (n60 / 15.0) * b_raw

            b_min_val = float(beta_min) if beta_min is not None else 0.25
            b_max_val = float(beta_max) if beta_max is not None else (1.8 if grupo == "Gravas" else 1.2)

            if apply_beta_limits:
                beta = max(b_min_val, min(b_max_val, b_calc))
                beta_capped = (beta < b_calc - 1e-4) or (b_calc < b_min_val - 1e-4)
                if beta < b_calc - 1e-4:
                    beta_cap_reason = f"upper_bound_{b_max_val:.2f}"
                elif b_calc < b_min_val - 1e-4:
                    beta_cap_reason = f"lower_bound_{b_min_val:.2f}"
            else:
                beta = b_calc
                beta_capped = False
                beta_cap_reason = None

            # Limitação unitária da tensão lateral a qs_max_ksf (4.0 ksf padrão = 191.521 kPa = 0.19 MPa ~ 192 kPa)
            qs_limit_kpa = qs_max_ksf * 47.8802589
            qs_uncapped = beta * sigma_v
            if apply_qs_cap and qs_max_ksf is not None and qs_max_ksf > 0:
                qs = min(qs_uncapped, qs_limit_kpa)
                qs_capped = (qs < qs_uncapped - 1e-4)
            else:
                qs = qs_uncapped
                qs_capped = False
        else:
            # Método padrão: FHWA GEC 010 (Mayne Beta-Method)
            # Aplicação do critério FHWA GEC 010 Equação 10-13:
            # 1) Elevação de tensão para camadas rasas: sigma'_v >= beta_shallow_stress_limit_kpa (43.1 kPa ~ 900 psf) para não ter valores altos de beta nas primeiras camadas
            # 2) Limitação superior beta <= Kp * tan(phi')
            if apply_beta_fhwa_limit:
                use_shallow = bool(apply_shallow_stress_limit)
                if use_shallow:
                    sigma_v_beta = max(sigma_v, beta_shallow_stress_limit_kpa)
                else:
                    sigma_v_beta = sigma_v

                ocr_ratio_beta = max(sigma_p / max(sigma_v_beta, 0.01), 0.01)
                beta_calc = (1.0 - sin_phi) * (ocr_ratio_beta ** sin_phi) * tan_phi
                
                hit_kp_tan_phi = False
                hit_shallow = use_shallow and (sigma_v < beta_shallow_stress_limit_kpa - 1e-4)
                
                if beta_cap_kp_tan_phi:
                    if beta_calc > kp_tan_phi + 1e-4:
                        beta = kp_tan_phi
                        hit_kp_tan_phi = True
                    else:
                        beta = beta_calc
                else:
                    beta = beta_calc

                if apply_beta_limits:
                    b_min_val = float(beta_min) if beta_min is not None else 0.25
                    b_max_val = float(beta_max) if beta_max is not None else (1.8 if grupo == "Gravas" else 1.2)
                    if beta > b_max_val + 1e-4:
                        beta = b_max_val
                        beta_cap_reason = f"upper_bound_{b_max_val:.2f}"
                        beta_capped = True
                    elif beta < b_min_val - 1e-4:
                        beta = b_min_val
                        beta_cap_reason = f"lower_bound_{b_min_val:.2f}"
                        beta_capped = True
                    else:
                        beta_capped = (beta < (beta_raw - 1e-4))
                else:
                    beta_capped = (beta < (beta_raw - 1e-4))

                if not beta_cap_reason:
                    if hit_kp_tan_phi and hit_shallow:
                        beta_cap_reason = "kp_tan_phi & shallow_stress"
                    elif hit_kp_tan_phi:
                        beta_cap_reason = "kp_tan_phi"
                    elif hit_shallow:
                        beta_cap_reason = "shallow_stress"
                    else:
                        beta_cap_reason = None
            else:
                beta = beta_raw
                beta_capped = False
                beta_cap_reason = None

            # Resistência lateral unitária qs (Mayne FHWA com suporte a trava qs <= qs_max se apply_qs_cap ativo)
            qs_limit_kpa = qs_max_ksf * 47.8802589
            qs_uncapped = beta * sigma_v
            if apply_qs_cap and qs_max_ksf is not None and qs_max_ksf > 0:
                qs = min(qs_uncapped, qs_limit_kpa)
                qs_capped = (qs < qs_uncapped - 1e-4)
            else:
                qs = qs_uncapped
                qs_capped = False

        # -------------------------------------------------------------
        # 2. Determinação da Resistência de Ponta Unitária (qp)
        # -------------------------------------------------------------
        qp_capped = False
        if tip_method == "aashto_2024":
            # AASHTO 2024 (Seção 10.8.3.5.2c / Brown et al. 2010):
            # Se N60 <= 50, qp = 1.2 * N60 [ksf], limitado a qp_max_ksf (60.0 ksf = 2872.82 kPa) se apply_qp_cap ativo
            qp_limit_kpa = qp_max_ksf * 47.8802589
            qp_uncapped = 1.2 * n60 * 47.8802589
            if apply_qp_cap and qp_max_ksf is not None and qp_max_ksf > 0:
                qp = min(qp_uncapped, qp_limit_kpa)
                qp_capped = (qp < qp_uncapped - 1e-4)
            else:
                qp = qp_uncapped
                qp_capped = False
        else:
            # AASHTO 2007 / O'Neill & Reese:
            # qp = kp * (n60 * pa / sigma'_v)^0.8 * sigma'_v
            term = (n60 * pa_kpa / max(sigma_v, 0.01))
            qp_uncapped = kp_base * (term ** 0.8) * sigma_v
            qp = qp_uncapped
            qp_capped = False

        layer_data = {
            "index": idx,
            "z_ini": round(z_ini, 3),
            "z_fim": round(z_fim, 3),
            "dz": round(dz, 3),
            "z_mid": round(z_mid, 3),
            "n1_60": round(n1_60, 2),
            "soil_group": grupo,
            "sucs": sucs,
            "gamma": gamma,
            "sigma_v": round(sigma_v, 3),
            "cn": round(cn, 4),
            "n60": round(n60, 2),
            "phi_deg": round(phi_deg, 2),
            "kp_rankine": round(kp_rankine, 3),
            "kp_tan_phi": round(kp_tan_phi, 3),
            "sigma_p": round(sigma_p, 2),
            "beta_raw": round(beta_raw, 4),
            "beta": round(beta, 4),
            "beta_capped": beta_capped,
            "beta_cap_reason": beta_cap_reason,
            "lateral_method": lateral_method,
            "tip_method": tip_method,
            "qs": round(qs, 3),
            "qs_uncapped": round(qs_uncapped, 3),
            "qs_capped": qs_capped,
            "qp": round(qp, 3),
            "qp_uncapped": round(qp_uncapped, 3),
            "qp_capped": qp_capped,
            "any_cap_active": bool(beta_capped or qs_capped or qp_capped),
            "is_extrapolated": bool(lyr.get("is_extrapolated", False))
        }
        processed_layers.append(layer_data)

    return processed_layers


def calculate_pile_capacities(
    processed_layers: List[Dict[str, Any]],
    piles: Optional[List[Dict[str, Any]]] = None,
    fs: float = 2.0,
    fs_lateral: float = 1.5,
    fs_ponta: float = 3.0,
    start_depth_m: float = 0.0,
    target_load_kN: float = 21400.0,
    casing_reduction_pct: float = 0.0,
    casing_reduction_mode: str = "excel_formula",
    casing_length_m: Optional[float] = None,
    consider_pile_weight: bool = False,
    concrete_unit_weight: float = 24.0,
    water_unit_weight: float = 10.0,
    water_table_m: float = 3.0,
    pile_weight_mode: str = "submerged_concrete",
    pile_length_above_start_m: float = 0.0
) -> Dict[str, Any]:
    """
    Calcula as capacidades ao longo da profundidade para cada estaca.
    Apresenta tanto o Método Global (FS único) quanto o Método Diferenciado (FS_s e FS_p distintos):
      - Global: Radm_glob = floor(Rn / FS) * casing_factor
      - Diferenciado: Radm_dif = floor((Rs / FS_s) + (Rp / FS_p)) * casing_factor
    Suporta também o desconto do Peso Próprio Efetivo Submerso (Net Bearing Capacity):
      - Radm_net = max(0, Radm_gross - W_pile_effective)
    Inclui o peso próprio submerso do trecho da estaca acima da cota de início (pile_length_above_start_m).
    Caso casing_length_m seja especificado (> 0), a redução da camisa metálica incide apenas
    nos primeiros casing_length_m a partir da cota de início (start_depth_m).
    """
    if piles is None:
        piles = DEFAULT_PILES

    casing_factor = max(0.0, 1.0 - (casing_reduction_pct / 100.0))
    gamma_sub_conc = max(0.0, concrete_unit_weight - water_unit_weight)

    pile_results = {}
    for p in piles:
        pid = p.get("id", f"pile_{p.get('diam_m', 1.0)}m")
        perimeter = float(p.get("perimeter_m", round(p.get("diam_m", 1.0) * math.pi, 2)))
        area = float(p.get("area_m2", round(math.pi * (p.get("diam_m", 1.0) / 2.0) ** 2, 2)))
        diam_m = float(p.get("diam_m", 1.0))
        name = p.get("name", f"D={diam_m:.2f}m")

        depths = []
        rs_segments = []
        rs_cum_list = []
        rp_list = []
        rn_list = []
        radm_list = []
        radm_dif_list = []
        w_pile_list = []
        radm_net_list = []
        radm_net_dif_list = []

        # Peso submerso do trecho acima da cota de início
        w_above = area * pile_length_above_start_m * gamma_sub_conc if pile_length_above_start_m > 0 else 0.0
        sum_rs = 0.0
        sum_w = w_above
        depth_for_target = None
        depth_for_target_dif = None
        depth_for_target_net_glob = None
        depth_for_target_net_dif = None
        max_rn = 0.0
        max_radm = 0.0
        max_radm_dif = 0.0
        depth_at_max = 0.0

        for lyr in processed_layers:
            z_fim = lyr["z_fim"]
            z_ini = lyr["z_ini"]
            dz = lyr["dz"]
            qs = lyr["qs"]
            qp = lyr["qp"]

            # Considera atrito apenas abaixo da cota de início
            if z_fim <= start_depth_m:
                rs_seg = 0.0
                w_seg = 0.0
            else:
                z_a = max(z_ini, start_depth_m)
                z_b = z_fim
                eff_dz = max(0.0, z_b - z_a)

                if casing_length_m is not None and casing_length_m >= 0:
                    casing_end = start_depth_m + casing_length_m
                    cased_dz = max(0.0, min(z_b, casing_end) - z_a)
                    uncased_dz = max(0.0, eff_dz - cased_dz)
                    rs_seg = qs * perimeter * (cased_dz * casing_factor + uncased_dz * 1.0)
                else:
                    rs_seg = qs * perimeter * eff_dz
                    if casing_reduction_mode == "lateral_only":
                        rs_seg *= casing_factor

                # Cálculo do peso próprio efetivo do segmento
                if eff_dz > 0:
                    if pile_weight_mode == "displaced_soil":
                        soil_gamma = lyr.get("gamma_sub", 10.0) if z_b > water_table_m else lyr.get("gamma_total", 18.0)
                        conc_g = gamma_sub_conc if z_b > water_table_m else concrete_unit_weight
                        eff_gamma = max(0.0, conc_g - soil_gamma)
                    else:
                        if z_b <= water_table_m:
                            eff_gamma = concrete_unit_weight
                        elif z_a >= water_table_m:
                            eff_gamma = gamma_sub_conc
                        else:
                            dz_dry = max(0.0, water_table_m - z_a)
                            dz_sub = max(0.0, z_b - water_table_m)
                            eff_gamma = (dz_dry * concrete_unit_weight + dz_sub * gamma_sub_conc) / eff_dz
                    w_seg = area * eff_dz * eff_gamma
                else:
                    w_seg = 0.0

            sum_rs += rs_seg
            sum_w += w_seg
            rp = qp * area
            rn = rp + sum_rs

            safe_fs_s = max(0.1, fs_lateral)
            safe_fs_p = max(0.1, fs_ponta)

            if casing_length_m is not None and casing_length_m >= 0:
                radm = math.floor(rn / fs) if fs > 0 else rn
                radm_dif = math.floor((sum_rs / safe_fs_s) + (rp / safe_fs_p))
            else:
                # 1. Método Global (FS único, padrão NBR / Planilha)
                if casing_reduction_mode == "excel_formula":
                    radm_base = math.floor(rn / fs) if fs > 0 else rn
                    radm = radm_base * casing_factor
                else:
                    radm = math.floor(rn / fs) if fs > 0 else rn

                # 2. Método Diferenciado (FS_s para lateral e FS_p para ponta)
                if casing_reduction_mode == "excel_formula":
                    radm_dif_base = math.floor((sum_rs / safe_fs_s) + (rp / safe_fs_p))
                    radm_dif = radm_dif_base * casing_factor
                else:
                    radm_dif = math.floor((sum_rs / safe_fs_s) + (rp / safe_fs_p))

            radm_net_glob = max(0.0, math.floor(radm - sum_w))
            radm_net_dif = max(0.0, math.floor(radm_dif - sum_w))

            if rn > max_rn:
                max_rn = rn
                max_radm = radm
                max_radm_dif = radm_dif
                depth_at_max = z_fim

            # Gross Target Checks
            if depth_for_target is None and radm >= target_load_kN:
                depth_for_target = z_fim

            if depth_for_target_dif is None and radm_dif >= target_load_kN:
                depth_for_target_dif = z_fim

            # Net Target Checks
            if depth_for_target_net_glob is None and radm_net_glob >= target_load_kN:
                depth_for_target_net_glob = z_fim

            if depth_for_target_net_dif is None and radm_net_dif >= target_load_kN:
                depth_for_target_net_dif = z_fim

            depths.append(z_fim)
            rs_segments.append(round(rs_seg, 2))
            rs_cum_list.append(round(sum_rs, 2))
            rp_list.append(round(rp, 2))
            rn_list.append(round(rn, 2))
            radm_list.append(round(radm, 1))
            radm_dif_list.append(round(radm_dif, 1))
            w_pile_list.append(round(sum_w, 1))
            radm_net_list.append(round(radm_net_glob, 1))
            radm_net_dif_list.append(round(radm_net_dif, 1))

        active_radm_glob = radm_net_list if consider_pile_weight else radm_list
        active_radm_dif = radm_net_dif_list if consider_pile_weight else radm_dif_list
        active_depth_target = depth_for_target_net_glob if consider_pile_weight else depth_for_target
        active_depth_target_dif = depth_for_target_net_dif if consider_pile_weight else depth_for_target_dif

        pile_results[pid] = {
            "id": pid,
            "name": name,
            "diam_m": diam_m,
            "perimeter_m": perimeter,
            "area_m2": area,
            "depths": depths,
            "rs_segment": rs_segments,
            "rs_cumulative": rs_cum_list,
            "rp": rp_list,
            "rn": rn_list,
            "w_pile_effective": round(sum_w, 1),
            "w_above_kN": round(w_above, 1),
            "pile_length_above_start_m": pile_length_above_start_m,
            "w_pile_cumulative": w_pile_list,
            "radm": active_radm_glob,
            "radm_global": active_radm_glob,
            "radm_gross_global": radm_list,
            "radm_net_global": radm_net_list,
            "radm_dif": active_radm_dif,
            "radm_gross_dif": radm_dif_list,
            "radm_net_dif": radm_net_dif_list,
            "max_rn": round(max_rn, 2),
            "max_radm": round(active_radm_glob[-1] if active_radm_glob else max_radm, 1),
            "max_radm_global": round(active_radm_glob[-1] if active_radm_glob else max_radm, 1),
            "max_radm_gross_global": round(max_radm, 1),
            "max_radm_net_global": round(radm_net_list[-1] if radm_net_list else 0.0, 1),
            "max_radm_dif": round(active_radm_dif[-1] if active_radm_dif else max_radm_dif, 1),
            "max_radm_gross_dif": round(max_radm_dif, 1),
            "max_radm_net_dif": round(radm_net_dif_list[-1] if radm_net_dif_list else 0.0, 1),
            "depth_at_max": depth_at_max,
            "depth_for_target": active_depth_target,
            "depth_for_target_global": active_depth_target,
            "depth_for_target_gross_global": depth_for_target,
            "depth_for_target_net_global": depth_for_target_net_glob,
            "depth_for_target_dif": active_depth_target_dif,
            "depth_for_target_gross_dif": depth_for_target_dif,
            "depth_for_target_net_dif": depth_for_target_net_dif,
            "reached_target": (active_depth_target is not None),
            "reached_target_dif": (active_depth_target_dif is not None)
        }

    return pile_results


def compute_statistical_profile(
    soundings: Dict[str, List[Dict[str, Any]]],
    percentile: float = 10.0
) -> List[Dict[str, Any]]:
    """
    Síntese estatística multi-furos (SPT médio):
    - Percentil configurável de N1_60 (padrão 10%)
    - Moda estatística para Grupo Solo e Classe SUCS
    """
    if not soundings:
        return []

    max_len = max(len(layers) for layers in soundings.values())
    if max_len == 0:
        return []

    import numpy as np
    from collections import Counter

    synth_layers = []

    for idx in range(max_len):
        n_vals = []
        grupos = []
        sucs_list = []
        z_ini = None
        z_fim = None

        for s_name, layers in soundings.items():
            if idx < len(layers):
                lyr = layers[idx]
                if z_ini is None:
                    z_ini = lyr.get("z_ini", idx * 0.6)
                    z_fim = lyr.get("z_fim", (idx + 1) * 0.6)
                n1 = float(lyr.get("n1_60", lyr.get("nspt", 10.0)))
                n_vals.append(n1)
                grp = lyr.get("soil_group", lyr.get("grupo", "Areias"))
                if grp:
                    grupos.append(grp)
                sucs = lyr.get("sucs", "")
                if sucs:
                    sucs_list.append(sucs)

        if not n_vals:
            continue

        p_val = float(np.percentile(n_vals, percentile))
        n_synth = int(math.floor(p_val))

        modal_grupo = Counter(grupos).most_common(1)[0][0] if grupos else "Areias"
        modal_sucs = Counter(sucs_list).most_common(1)[0][0] if sucs_list else ""

        synth_layers.append({
            "z_ini": z_ini,
            "z_fim": z_fim,
            "n1_60": n_synth,
            "soil_group": modal_grupo,
            "sucs": modal_sucs
        })

    return synth_layers


def calculate_axes_table(
    sounding_layers: List[Dict[str, Any]],
    axes: List[Dict[str, Any]],
    piles: List[Dict[str, Any]],
    water_table_m: float = 3.0,
    soil_groups: Optional[Dict[str, Dict[str, float]]] = None,
    fs: float = 2.0,
    fs_lateral: float = 1.5,
    fs_ponta: float = 3.0,
    target_load_kN: float = 21400.0,
    casing_reduction_pct: float = 10.0,
    casing_reduction_mode: str = "excel_formula",
    casing_length_m: Optional[float] = None,
    kp_base: float = 0.59,
    pa_kpa: float = 101.3,
    cn_max: float = 2.0,
    apply_beta_fhwa_limit: bool = True,
    beta_shallow_stress_limit_kpa: float = 43.1,
    beta_cap_kp_tan_phi: bool = True,
    lateral_method: str = "mayne_fhwa",
    tip_method: str = "aashto_2007",
    qs_max_ksf: float = 4.0,
    qp_max_ksf: float = 60.0,
    beta_min: float = 0.25,
    beta_max: float = 1.8,
    apply_beta_limits: bool = True,
    apply_shallow_stress_limit: bool = True,
    apply_qs_cap: bool = True,
    apply_qp_cap: bool = True,
    beta_depth_ref: str = "absolute",
    consider_pile_weight: bool = False,
    concrete_unit_weight: float = 24.0,
    water_unit_weight: float = 10.0,
    pile_weight_mode: str = "submerged_concrete",
    pile_length_above_start_m: float = 0.0,
    soil_above_removed: Optional[bool] = None,
    soil_above_height_m: Optional[Union[float, str]] = None
) -> List[Dict[str, Any]]:
    """
    Calcula a capacidade axial considerando a Cota TOPO de cada eixo e a redução por camisa metálica.
    Calcula Cotas de Fundo e Embutimentos Úteis para AMBOS os critérios de segurança:
      - Caso A: FS Global (FS = 2.0 padrão da planilha)
      - Caso B: FS Diferenciado (FS_s lateral e FS_p ponta)
    Suporta também o desconto do Peso Próprio Efetivo Submerso (Net Bearing Capacity):
      - Radm,net = Radm,gross - W_pile_effective
    Inclui o peso próprio submerso do trecho da estaca acima da cota de início (pile_length_above_start_m).
    Caso casing_length_m seja especificado (> 0), a redução da camisa metálica incide apenas
    nos primeiros casing_length_m a partir da cota de início/TOPO de cada eixo.
    Suporta travas de atrito (apply_qs_cap), de ponta (apply_qp_cap) e profundidade relativa de beta (beta_depth_ref).
    Quando soil_above_removed=True ou soil_above_height_m é fornecido, reflete que acima da cota de início/TOPO
    há uma espessura específica de solo (ou 0m se totalmente escavado/dragado), ajustando a tensão vertical efetiva
    inicial (sigma'_v) no topo da estaca.
    """
    is_aashto = (lateral_method == "aashto_2007" or str(lateral_method).startswith("aashto"))

    proc_layers_default = calculate_layer_stresses_and_strengths(
        sounding_layers,
        water_table_m=water_table_m,
        soil_groups=soil_groups,
        kp_base=kp_base,
        pa_kpa=pa_kpa,
        cn_max=cn_max,
        apply_beta_fhwa_limit=apply_beta_fhwa_limit,
        beta_shallow_stress_limit_kpa=beta_shallow_stress_limit_kpa,
        beta_cap_kp_tan_phi=beta_cap_kp_tan_phi,
        lateral_method=lateral_method,
        tip_method=tip_method,
        qs_max_ksf=qs_max_ksf,
        qp_max_ksf=qp_max_ksf,
        beta_min=beta_min,
        beta_max=beta_max,
        apply_beta_limits=apply_beta_limits,
        apply_shallow_stress_limit=apply_shallow_stress_limit,
        apply_qs_cap=apply_qs_cap,
        apply_qp_cap=apply_qp_cap,
        z_ref_offset_m=0.0
    )

    casing_factor = max(0.0, 1.0 - (casing_reduction_pct / 100.0))
    gamma_sub_conc = max(0.0, concrete_unit_weight - water_unit_weight)
    safe_fs_s = max(0.1, fs_lateral)
    safe_fs_p = max(0.1, fs_ponta)

    results = []
    for ax in axes:
        axis_name = ax.get("name", "Eixo")
        cota_topo_raw = ax.get("cota_topo_m") if ax.get("cota_topo_m") is not None else ax.get("cota_inicio_m", 0.0)
        cota_topo = float(cota_topo_raw)
        p_target_raw = ax.get("target_load_kN") if ax.get("target_load_kN") is not None else target_load_kN
        p_target = float(p_target_raw)
        casing_len = ax.get("casing_length_m") if ax.get("casing_length_m") is not None else casing_length_m
        if casing_len is not None:
            try:
                casing_len = float(casing_len)
            except (ValueError, TypeError):
                casing_len = None

        ax_len_above_raw = ax.get("pile_length_above_start_m")
        if ax_len_above_raw is not None and float(ax_len_above_raw) > 0:
            ax_len_above = float(ax_len_above_raw)
        else:
            ax_len_above = float(pile_length_above_start_m)

        ax_soil_height = ax.get("soil_above_height_m", soil_above_height_m)
        ax_soil_removed = ax.get("soil_above_removed", soil_above_removed)

        if ax_soil_height is not None and str(ax_soil_height).strip().lower() not in ["", "none", "null"]:
            val_str = str(ax_soil_height).strip().lower()
            if val_str in ["full", "all", "total"]:
                consider_height = None
                ax_soil_removed_eff = False
            else:
                try:
                    h_val = float(val_str)
                    if h_val < 0:
                        consider_height = None
                        ax_soil_removed_eff = False
                    else:
                        consider_height = h_val
                        ax_soil_removed_eff = True
                except (ValueError, TypeError):
                    consider_height = None
                    ax_soil_removed_eff = False
        else:
            if ax_soil_removed is None:
                ax_soil_removed = is_aashto
            ax_soil_removed_eff = bool(ax_soil_removed)
            consider_height = 0.0 if ax_soil_removed_eff else None

        # Se consider_height foi definido (ex: 0m = totalmente removido, ou H metros de solo acima considerados):
        if consider_height is not None and cota_topo > 0:
            eff_soil_removed = True
            initial_sigma_v_kpa = 0.0
            if consider_height > 0:
                z_start_soil = max(0.0, cota_topo - consider_height)
                for lyr_above in sounding_layers:
                    z1 = float(lyr_above.get("z_ini", 0.0))
                    z2 = float(lyr_above.get("z_fim", z1 + 0.6))
                    if z2 <= z_start_soil or z1 >= cota_topo:
                        continue
                    dz_eff = min(z2, cota_topo) - max(z1, z_start_soil)
                    if dz_eff <= 0:
                        continue
                    grp = lyr_above.get("soil_group", lyr_above.get("grupo", "Areias"))
                    grp_params = (soil_groups or DEFAULT_SOIL_GROUPS).get(grp, {"gamma_dry": 18.5, "gamma_sub": 8.5})
                    is_dry = (max(z1, z_start_soil) < water_table_m)
                    gamma_lyr = grp_params["gamma_dry"] if is_dry else grp_params["gamma_sub"]
                    initial_sigma_v_kpa += dz_eff * gamma_lyr
                if consider_height > cota_topo:
                    extra_h = consider_height - cota_topo
                    first_grp = sounding_layers[0].get("soil_group", "Areias") if sounding_layers else "Areias"
                    first_gamma = (soil_groups or DEFAULT_SOIL_GROUPS).get(first_grp, {}).get("gamma_dry", 18.5)
                    initial_sigma_v_kpa += extra_h * first_gamma

            axis_sounding_layers = []
            for lyr in sounding_layers:
                z_ini_l = float(lyr.get("z_ini", 0.0))
                z_fim_l = float(lyr.get("z_fim", z_ini_l + 0.6))
                if z_fim_l <= cota_topo:
                    continue
                z_a_eff = max(0.0, z_ini_l - cota_topo)
                z_b_eff = z_fim_l - cota_topo
                if z_b_eff <= z_a_eff:
                    continue
                axis_sounding_layers.append({
                    **lyr,
                    "z_ini": z_a_eff,
                    "z_fim": z_b_eff,
                    "z_ini_abs": max(z_ini_l, cota_topo),
                    "z_fim_abs": z_fim_l
                })

            wt_eff = max(0.0, water_table_m - cota_topo)
            proc_layers = calculate_layer_stresses_and_strengths(
                axis_sounding_layers,
                water_table_m=wt_eff,
                soil_groups=soil_groups,
                kp_base=kp_base,
                pa_kpa=pa_kpa,
                cn_max=cn_max,
                apply_beta_fhwa_limit=apply_beta_fhwa_limit,
                beta_shallow_stress_limit_kpa=beta_shallow_stress_limit_kpa,
                beta_cap_kp_tan_phi=beta_cap_kp_tan_phi,
                lateral_method=lateral_method,
                tip_method=tip_method,
                qs_max_ksf=qs_max_ksf,
                qp_max_ksf=qp_max_ksf,
                beta_min=beta_min,
                beta_max=beta_max,
                apply_beta_limits=apply_beta_limits,
                apply_shallow_stress_limit=apply_shallow_stress_limit,
                apply_qs_cap=apply_qs_cap,
                apply_qp_cap=apply_qp_cap,
                z_ref_offset_m=max(0.0, cota_topo - consider_height) if consider_height > 0 else 0.0,
                initial_sigma_v_kpa=initial_sigma_v_kpa
            )
            for idx_l, lyr in enumerate(proc_layers):
                orig = axis_sounding_layers[idx_l]
                lyr["z_ini_rel"] = lyr["z_ini"]
                lyr["z_fim_rel"] = lyr["z_fim"]
                lyr["z_ini"] = orig["z_ini_abs"]
                lyr["z_fim"] = orig["z_fim_abs"]

            first_prof = proc_layers[0]["z_fim"] if proc_layers else cota_topo
            start_row_idx = 0
            step_dz = proc_layers[0]["dz"] if proc_layers else 0.6
        else:
            eff_soil_removed = False
            initial_sigma_v_kpa = 0.0
            # Se a referência do beta for relativa ao topo/leito (critério Haskoning), calcula tensões e beta a partir da cota_topo
            if beta_depth_ref == "relative_to_top" and lateral_method == "aashto_2007":
                proc_layers = calculate_layer_stresses_and_strengths(
                    sounding_layers,
                    water_table_m=water_table_m,
                    soil_groups=soil_groups,
                    kp_base=kp_base,
                    pa_kpa=pa_kpa,
                    cn_max=cn_max,
                    apply_beta_fhwa_limit=apply_beta_fhwa_limit,
                    beta_shallow_stress_limit_kpa=beta_shallow_stress_limit_kpa,
                    beta_cap_kp_tan_phi=beta_cap_kp_tan_phi,
                    lateral_method=lateral_method,
                    tip_method=tip_method,
                    qs_max_ksf=qs_max_ksf,
                    qp_max_ksf=qp_max_ksf,
                    beta_min=beta_min,
                    beta_max=beta_max,
                    apply_beta_limits=apply_beta_limits,
                    apply_shallow_stress_limit=apply_shallow_stress_limit,
                    apply_qs_cap=apply_qs_cap,
                    apply_qp_cap=apply_qp_cap,
                    z_ref_offset_m=cota_topo
                )
            else:
                proc_layers = proc_layers_default

            # Determina primeira camada com topo abaixo da cota topo
            start_row_idx = next((i for i, l in enumerate(proc_layers) if l["z_fim"] > cota_topo), 0)
            step_dz = proc_layers[0]["dz"] if proc_layers else 0.6
            first_prof = proc_layers[start_row_idx]["z_fim"] if start_row_idx < len(proc_layers) else cota_topo

        axis_info = {
            "name": axis_name,
            "cota_topo_m": round(cota_topo, 2),
            "cota_inicio_m": round(cota_topo, 2),
            "target_load_kN": round(p_target, 2),
            "soil_above_removed": eff_soil_removed,
            "soil_above_height_m": consider_height,
            "initial_sigma_v_kpa": round(initial_sigma_v_kpa, 2) if eff_soil_removed else None,
            "layers": proc_layers,
            "casing_reduction_pct": casing_reduction_pct,
            "casing_factor": round(casing_factor, 2),
            "casing_length_m": casing_len,
            "pile_length_above_start_m": round(ax_len_above, 2),
            "lateral_method": lateral_method,
            "tip_method": tip_method,
            "apply_qs_cap": apply_qs_cap,
            "apply_qp_cap": apply_qp_cap,
            "beta_depth_ref": beta_depth_ref,
            "qs_max_ksf": qs_max_ksf,
            "qp_max_ksf": qp_max_ksf,
            "beta_min": beta_min,
            "beta_max": beta_max,
            "apply_beta_limits": apply_beta_limits,
            "apply_shallow_stress_limit": apply_shallow_stress_limit,
            "fs_global": fs,
            "fs_lateral": safe_fs_s,
            "fs_ponta": safe_fs_p,
            "consider_pile_weight": consider_pile_weight,
            "concrete_unit_weight": concrete_unit_weight,
            "water_unit_weight": water_unit_weight,
            "pile_weight_mode": pile_weight_mode,
            "piles": {}
        }

        for p in piles:
            pid = p.get("id", f"pile_{p.get('diam_m', 1.0)}m")
            perimeter = float(p.get("perimeter_m", 3.76))
            area = float(p.get("area_m2", 1.13))

            # Peso próprio submerso do trecho da estaca acima da cota de início
            w_above = area * ax_len_above * gamma_sub_conc if ax_len_above > 0 else 0.0
            sum_rs = 0.0
            sum_w = w_above
            depth_fundo_glob = None
            depth_fundo_dif = None
            depth_fundo_net_glob = None
            depth_fundo_net_dif = None
            w_at_target_glob = 0.0
            w_at_target_dif = 0.0
            w_at_target_net_glob = 0.0
            w_at_target_net_dif = 0.0
            max_radm_glob = 0.0
            max_radm_dif = 0.0
            max_radm_net_glob = 0.0
            max_radm_net_dif = 0.0

            # Soma incremental a partir da camada inicial (idêntica ao gráfico e ao Excel)
            max_steps = len(proc_layers) - start_row_idx
            for step in range(max_steps):
                idx = start_row_idx + step
                if idx >= len(proc_layers):
                    break
                lyr = proc_layers[idx]
                prof = round(lyr["z_fim"], 2)
                dz = lyr["dz"]

                z_a_seg = max(lyr["z_ini"], cota_topo)
                z_b_seg = lyr["z_fim"]
                eff_dz = max(0.0, z_b_seg - z_a_seg)

                if casing_len is not None and casing_len >= 0:
                    casing_end = cota_topo + casing_len
                    cased_dz = max(0.0, min(z_b_seg, casing_end) - z_a_seg)
                    uncased_dz = max(0.0, eff_dz - cased_dz)
                    rs_seg = lyr["qs"] * perimeter * (cased_dz * casing_factor + uncased_dz * 1.0)
                    sum_rs += rs_seg
                    rp = lyr["qp"] * area
                    rn = rp + sum_rs
                    radm_glob = math.floor(rn / fs) if fs > 0 else rn
                    radm_dif = math.floor((sum_rs / safe_fs_s) + (rp / safe_fs_p))
                else:
                    rs_seg = lyr["qs"] * perimeter * dz
                    if casing_reduction_mode == "lateral_only":
                        rs_seg *= casing_factor

                    sum_rs += rs_seg
                    rp = lyr["qp"] * area
                    rn = rp + sum_rs

                    # 1. Caso Global (FS único)
                    if casing_reduction_mode == "excel_formula":
                        radm_base = math.floor(rn / fs) if fs > 0 else rn
                        radm_glob = radm_base * casing_factor
                    else:
                        radm_glob = math.floor(rn / fs) if fs > 0 else rn

                    # 2. Caso Diferenciado (FS_s e FS_p)
                    if casing_reduction_mode == "excel_formula":
                        radm_dif_base = math.floor((sum_rs / safe_fs_s) + (rp / safe_fs_p))
                        radm_dif = radm_dif_base * casing_factor
                    else:
                        radm_dif = math.floor((sum_rs / safe_fs_s) + (rp / safe_fs_p))

                # Peso próprio efetivo do trecho da estaca
                if eff_dz > 0:
                    if pile_weight_mode == "displaced_soil":
                        soil_gamma = lyr.get("gamma_sub", 10.0) if z_b_seg > water_table_m else lyr.get("gamma_total", 18.0)
                        conc_g = gamma_sub_conc if z_b_seg > water_table_m else concrete_unit_weight
                        eff_gamma = max(0.0, conc_g - soil_gamma)
                    else:
                        if z_b_seg <= water_table_m:
                            eff_gamma = concrete_unit_weight
                        elif z_a_seg >= water_table_m:
                            eff_gamma = gamma_sub_conc
                        else:
                            dz_dry = max(0.0, water_table_m - z_a_seg)
                            dz_sub = max(0.0, z_b_seg - water_table_m)
                            eff_gamma = (dz_dry * concrete_unit_weight + dz_sub * gamma_sub_conc) / eff_dz
                    w_seg = area * eff_dz * eff_gamma
                else:
                    w_seg = 0.0

                sum_w += w_seg
                radm_net_glob = max(0.0, math.floor(radm_glob - sum_w))
                radm_net_dif = max(0.0, math.floor(radm_dif - sum_w))

                if radm_glob > max_radm_glob:
                    max_radm_glob = radm_glob
                if radm_dif > max_radm_dif:
                    max_radm_dif = radm_dif
                if radm_net_glob > max_radm_net_glob:
                    max_radm_net_glob = radm_net_glob
                if radm_net_dif > max_radm_net_dif:
                    max_radm_net_dif = radm_net_dif

                # Gross Target Checks
                if depth_fundo_glob is None and radm_glob >= p_target:
                    depth_fundo_glob = prof
                    w_at_target_glob = sum_w

                if depth_fundo_dif is None and radm_dif >= p_target:
                    depth_fundo_dif = prof
                    w_at_target_dif = sum_w

                # Net Target Checks
                if depth_fundo_net_glob is None and radm_net_glob >= p_target:
                    depth_fundo_net_glob = prof
                    w_at_target_net_glob = sum_w

                if depth_fundo_net_dif is None and radm_net_dif >= p_target:
                    depth_fundo_net_dif = prof
                    w_at_target_net_dif = sum_w

            emb_gross_glob = (depth_fundo_glob - cota_topo) if depth_fundo_glob is not None else None
            emb_gross_dif = (depth_fundo_dif - cota_topo) if depth_fundo_dif is not None else None
            emb_net_glob = (depth_fundo_net_glob - cota_topo) if depth_fundo_net_glob is not None else None
            emb_net_dif = (depth_fundo_net_dif - cota_topo) if depth_fundo_net_dif is not None else None

            # Decisão ativa dependendo de consider_pile_weight
            active_fundo_glob = depth_fundo_net_glob if consider_pile_weight else depth_fundo_glob
            active_emb_glob = emb_net_glob if consider_pile_weight else emb_gross_glob
            active_fundo_dif = depth_fundo_net_dif if consider_pile_weight else depth_fundo_dif
            active_emb_dif = emb_net_dif if consider_pile_weight else emb_gross_dif
            active_max_radm_glob = max_radm_net_glob if consider_pile_weight else max_radm_glob
            active_max_radm_dif = max_radm_net_dif if consider_pile_weight else max_radm_dif

            axis_info["piles"][pid] = {
                "name": p.get("name", pid),
                "diam_m": p.get("diam_m", 1.0),
                "area_m2": area,
                "perimeter_m": perimeter,
                # Ativos
                "cota_fundo_m": round(active_fundo_glob, 1) if active_fundo_glob is not None else "N/A",
                "embutimento_m": round(active_emb_glob, 2) if active_emb_glob is not None else "N/A",
                "comprimento_util_m": round(active_emb_glob, 2) if active_emb_glob is not None else "N/A",
                "reached_target": (active_fundo_glob is not None),
                "max_radm": round(active_max_radm_glob, 1),
                
                # Global
                "cota_fundo_global_m": round(active_fundo_glob, 1) if active_fundo_glob is not None else "N/A",
                "embutimento_global_m": round(active_emb_glob, 2) if active_emb_glob is not None else "N/A",
                "max_radm_global": round(active_max_radm_glob, 1),
                
                # Diferenciado
                "cota_fundo_dif_m": round(active_fundo_dif, 1) if active_fundo_dif is not None else "N/A",
                "embutimento_dif_m": round(active_emb_dif, 2) if active_emb_dif is not None else "N/A",
                "reached_target_dif": (active_fundo_dif is not None),
                "max_radm_dif": round(active_max_radm_dif, 1),

                # Detalhamento Gross vs Net
                "cota_fundo_gross_global_m": round(depth_fundo_glob, 1) if depth_fundo_glob is not None else "N/A",
                "embutimento_gross_global_m": round(emb_gross_glob, 2) if emb_gross_glob is not None else "N/A",
                "max_radm_gross_global": round(max_radm_glob, 1),
                "w_pile_gross_target_global_kN": round(w_at_target_glob, 1),

                "cota_fundo_net_global_m": round(depth_fundo_net_glob, 1) if depth_fundo_net_glob is not None else "N/A",
                "embutimento_net_global_m": round(emb_net_glob, 2) if emb_net_glob is not None else "N/A",
                "max_radm_net_global": round(max_radm_net_glob, 1),
                "w_pile_net_target_global_kN": round(w_at_target_net_glob, 1),

                "cota_fundo_gross_dif_m": round(depth_fundo_dif, 1) if depth_fundo_dif is not None else "N/A",
                "embutimento_gross_dif_m": round(emb_gross_dif, 2) if emb_gross_dif is not None else "N/A",
                "max_radm_gross_dif": round(max_radm_dif, 1),
                "w_pile_gross_target_dif_kN": round(w_at_target_dif, 1),

                "cota_fundo_net_dif_m": round(depth_fundo_net_dif, 1) if depth_fundo_net_dif is not None else "N/A",
                "embutimento_net_dif_m": round(emb_net_dif, 2) if emb_net_dif is not None else "N/A",
                "max_radm_net_dif": round(max_radm_net_dif, 1),
                "w_pile_net_target_dif_kN": round(w_at_target_net_dif, 1),
                "w_above_kN": round(w_above, 1),
                "pile_length_above_start_m": round(ax_len_above, 2),
                "w_pile_effective_total_kN": round(sum_w, 1)
            }

        results.append(axis_info)

    return results


def run_full_analysis(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executa a análise global de capacidade axial de estacas com todos os parâmetros e inputs:
    - FS Global (fs), FS Lateral (fs_lateral) e FS Ponta (fs_ponta)
    - Critério FHWA 10-13 para beta (apply_beta_fhwa_limit, beta_shallow_stress_limit_kpa)
    - Redução da camisa metálica (%), modo de aplicação da camisa
    - N.A., carga alvo, percentil, sondagem crítica
    - Coeficiente de ponta kp, pressão atmosférica pa, cn_max
    """
    # Inputs globais
    fs = float(payload.get("fs_global", payload.get("fs", 2.0)))
    fs_lateral = float(payload.get("fs_lateral", payload.get("fs_s", 1.5)))
    fs_ponta = float(payload.get("fs_ponta", payload.get("fs_p", 3.0)))

    lateral_method = payload.get("lateral_method", "mayne_fhwa")
    tip_method = payload.get("tip_method", "aashto_2007")
    qs_max_ksf = float(payload.get("qs_max_ksf", 4.0))
    qp_max_ksf = float(payload.get("qp_max_ksf", 60.0))
    beta_min = float(payload.get("beta_min", DEFAULT_MODEL_FACTORS.get("beta_min", 0.25)))
    beta_max = float(payload.get("beta_max", DEFAULT_MODEL_FACTORS.get("beta_max", 1.8)))
    apply_beta_limits = bool(payload.get("apply_beta_limits", DEFAULT_MODEL_FACTORS.get("apply_beta_limits", True)))
    apply_qs_cap = bool(payload.get("apply_qs_cap", DEFAULT_MODEL_FACTORS.get("apply_qs_cap", False)))
    apply_qp_cap = bool(payload.get("apply_qp_cap", DEFAULT_MODEL_FACTORS.get("apply_qp_cap", True)))
    beta_depth_ref = str(payload.get("beta_depth_ref", DEFAULT_MODEL_FACTORS.get("beta_depth_ref", "absolute")))

    apply_beta_fhwa_limit = bool(payload.get("apply_beta_fhwa_limit", True))
    apply_shallow_stress_limit = bool(payload.get("apply_shallow_stress_limit", DEFAULT_MODEL_FACTORS.get("apply_shallow_stress_limit", True)))
    beta_shallow_stress_limit_kpa = float(payload.get("beta_shallow_stress_limit_kpa", 43.1))
    beta_cap_kp_tan_phi = bool(payload.get("beta_cap_kp_tan_phi", True))

    casing_reduction_pct = float(payload.get("casing_reduction_pct", 10.0))
    casing_reduction_mode = payload.get("casing_reduction_mode", "excel_formula")
    casing_length_m_raw = payload.get("casing_length_m", None)
    if casing_length_m_raw is not None and casing_length_m_raw != "":
        try:
            casing_length_m = float(casing_length_m_raw)
        except (ValueError, TypeError):
            casing_length_m = None
    else:
        casing_length_m = None
    water_table_m = float(payload.get("water_table_m", 3.0))
    target_load_kN = float(payload.get("target_load_kN", 21400.0))
    percentile = float(payload.get("percentile", 10.0))
    kp_base = float(payload.get("kp_base", 0.59))
    pa_kpa = float(payload.get("pa_kpa", 101.3))
    cn_max = float(payload.get("cn_max", 2.0))

    consider_pile_weight = bool(payload.get("consider_pile_weight", False))
    concrete_unit_weight = float(payload.get("concrete_unit_weight", 24.0))
    water_unit_weight = float(payload.get("water_unit_weight", 10.0))
    pile_weight_mode = payload.get("pile_weight_mode", "submerged_concrete")
    pile_length_above_start_m = float(payload.get("pile_length_above_start_m", 0.0))
    is_aashto = (lateral_method == "aashto_2007" or str(lateral_method).startswith("aashto"))
    soil_above_height_m = payload.get("soil_above_height_m", None)
    soil_above_removed_raw = payload.get("soil_above_removed", None)
    if soil_above_removed_raw is not None:
        soil_above_removed = bool(soil_above_removed_raw)
    else:
        # Se estacas pela AASHTO, acima da cota inicial não há solo
        soil_above_removed = is_aashto

    extrapolate_soundings = bool(payload.get("extrapolate_soundings", True))
    extrapolation_n_percentile = float(payload.get("extrapolation_n_percentile", 15.0))
    extrapolation_max_depth_m = float(payload.get("extrapolation_max_depth_m", 132.6))
    extrapolation_soil_group = payload.get("extrapolation_soil_group", "auto")

    soil_groups = payload.get("soil_groups", DEFAULT_SOIL_GROUPS)
    raw_piles = payload.get("piles", DEFAULT_PILES)
    piles = []
    for p in raw_piles:
        p_dict = dict(p)
        diam_m = float(p_dict.get("diam_m", 1.20))
        diam_in = float(p_dict.get("diam_in", round(diam_m / 0.0254)))
        perimeter = float(p_dict.get("perimeter_m", math.floor(diam_m * math.pi * 100.0) / 100.0))
        area = float(p_dict.get("area_m2", math.floor(math.pi * (diam_m / 2.0) ** 2 * 100.0) / 100.0))
        name = p_dict.get("name", f"Estaca D={diam_m:.2f}m ({int(diam_in)}\")")
        p_dict["diam_m"] = diam_m
        p_dict["diam_in"] = diam_in
        p_dict["perimeter_m"] = perimeter
        p_dict["area_m2"] = area
        p_dict["name"] = name
        piles.append(p_dict)

    raw_axes = payload.get("axes", DEFAULT_AXES)
    axes = []
    for ax in raw_axes:
        ax_dict = dict(ax)
        cota_topo = float(ax_dict.get("cota_topo_m", ax_dict.get("cota_inicio_m", 0.0)))
        ax_dict["cota_topo_m"] = cota_topo
        ax_dict["cota_inicio_m"] = cota_topo
        if ax_dict.get("has_custom_target", False) or ax_dict.get("target_load_kN") is not None:
            ax_dict["target_load_kN"] = float(ax_dict.get("target_load_kN", target_load_kN))
        else:
            ax_dict["target_load_kN"] = target_load_kN
        axes.append(ax_dict)

    soundings = payload.get("soundings", {})
    if not soundings:
        default_data = get_default_project_data()
        soundings = default_data["soundings"]

    # 1. Menor profundidade medida entre todas as sondagens do projeto
    raw_base_depth = payload.get("base_depth_m", payload.get("spt01_measured_depth_m", 44.4))
    try:
        ref_depth = float(raw_base_depth) if (raw_base_depth not in (None, "", "auto")) else 44.4
    except (ValueError, TypeError):
        ref_depth = 44.4

    min_test_depth, min_test_sounding, sounding_depths = detect_min_sounding_depth(
        soundings, spt01_depth=ref_depth
    )

    # Se o usuário não especificou uma profundidade customizada, adota a menor detectada
    if raw_base_depth in (None, "", "auto"):
        base_depth_m = min_test_depth
    else:
        base_depth_m = ref_depth
    if base_depth_m <= 0:
        base_depth_m = min_test_depth

    # Alvo da extrapolação principal/padrão: normalmente SPT-01 ou menor profundidade
    target_extrap_sounding = payload.get("critical_sounding", "SPT-01")
    if target_extrap_sounding not in soundings:
        target_extrap_sounding = "SPT-01" if "SPT-01" in soundings else min_test_sounding

    # Extrapolação das sondagens: cada sondagem é extrapolada com base ESTRITAMENTE em suas informações
    prepared_soundings = {}
    extrapolation_estimates_by_sounding = {}

    for s_name, s_layers in soundings.items():
        if extrapolate_soundings:
            s_base_depth = base_depth_m if s_name == "SPT-01" else None
            prepared_soundings[s_name] = extrapolate_sounding_layers(
                s_layers,
                measured_depth_m=s_base_depth,
                n_percentile=extrapolation_n_percentile,
                max_depth_m=extrapolation_max_depth_m,
                forced_soil_group=None if extrapolation_soil_group == "auto" else extrapolation_soil_group,
                sounding_name=s_name
            )
            extrapolation_estimates_by_sounding[s_name] = compute_extrapolation_estimates(
                s_layers,
                measured_depth_m=s_base_depth,
                n_percentile=extrapolation_n_percentile,
                max_depth_m=extrapolation_max_depth_m,
                forced_soil_group=None if extrapolation_soil_group == "auto" else extrapolation_soil_group,
                water_table_m=water_table_m,
                soil_groups=soil_groups,
                kp_base=kp_base,
                pa_kpa=pa_kpa,
                cn_max=cn_max,
                apply_beta_fhwa_limit=apply_beta_fhwa_limit,
                beta_shallow_stress_limit_kpa=beta_shallow_stress_limit_kpa,
                beta_cap_kp_tan_phi=beta_cap_kp_tan_phi,
                lateral_method=lateral_method,
                tip_method=tip_method,
                qs_max_ksf=qs_max_ksf,
                qp_max_ksf=qp_max_ksf,
                beta_min=beta_min,
                beta_max=beta_max,
                apply_beta_limits=apply_beta_limits,
                apply_shallow_stress_limit=apply_shallow_stress_limit,
                apply_qs_cap=apply_qs_cap,
                apply_qp_cap=apply_qp_cap,
                sounding_name=s_name
            )
        else:
            prepared_soundings[s_name] = s_layers

    # Estimativas governantes / padrão (SPT-01 ou target_extrap_sounding)
    extrapolation_estimates = extrapolation_estimates_by_sounding.get(
        target_extrap_sounding,
        next(iter(extrapolation_estimates_by_sounding.values())) if extrapolation_estimates_by_sounding else None
    )

    # 1. Sondagem Síntese (SPT médio)
    synth_layers = compute_statistical_profile(prepared_soundings, percentile=percentile)
    synth_name = f"SPT médio (P{int(percentile)}%)"
    all_soundings = dict(prepared_soundings)
    all_soundings[synth_name] = synth_layers

    # 2. Processar cada sondagem individual
    analyzed_soundings = {}
    summary_table = []

    for s_name, layers in all_soundings.items():
        proc_layers = calculate_layer_stresses_and_strengths(
            layers,
            water_table_m=water_table_m,
            soil_groups=soil_groups,
            kp_base=kp_base,
            pa_kpa=pa_kpa,
            cn_max=cn_max,
            apply_beta_fhwa_limit=apply_beta_fhwa_limit,
            beta_shallow_stress_limit_kpa=beta_shallow_stress_limit_kpa,
            beta_cap_kp_tan_phi=beta_cap_kp_tan_phi,
            lateral_method=lateral_method,
            tip_method=tip_method,
            qs_max_ksf=qs_max_ksf,
            qp_max_ksf=qp_max_ksf,
            beta_min=beta_min,
            beta_max=beta_max,
            apply_beta_limits=apply_beta_limits,
            apply_shallow_stress_limit=apply_shallow_stress_limit,
            apply_qs_cap=apply_qs_cap,
            apply_qp_cap=apply_qp_cap
        )

        cap_results = calculate_pile_capacities(
            proc_layers,
            piles=piles,
            fs=fs,
            fs_lateral=fs_lateral,
            fs_ponta=fs_ponta,
            start_depth_m=0.0,
            target_load_kN=target_load_kN,
            casing_reduction_pct=0.0,  # Na tabela geral de sondagens sem camisa
            consider_pile_weight=consider_pile_weight,
            concrete_unit_weight=concrete_unit_weight,
            water_unit_weight=water_unit_weight,
            water_table_m=water_table_m,
            pile_weight_mode=pile_weight_mode,
            pile_length_above_start_m=pile_length_above_start_m
        )

        analyzed_soundings[s_name] = {
            "name": s_name,
            "layers": proc_layers,
            "capacities": cap_results,
            "extrapolation_estimates": extrapolation_estimates_by_sounding.get(s_name)
        }

        # Linha para a tabela resumo
        row = {"sounding_name": s_name, "piles": {}}
        for pid, pdata in cap_results.items():
            row["piles"][pid] = {
                "diam_m": pdata["diam_m"],
                "max_rn_kN": pdata["max_rn"],
                "max_radm_kN": pdata["max_radm"],
                "max_radm_global_kN": pdata["max_radm_global"],
                "max_radm_gross_global_kN": pdata["max_radm_gross_global"],
                "max_radm_net_global_kN": pdata["max_radm_net_global"],
                "max_radm_dif_kN": pdata["max_radm_dif"],
                "max_radm_gross_dif_kN": pdata["max_radm_gross_dif"],
                "max_radm_net_dif_kN": pdata["max_radm_net_dif"],
                "w_pile_effective_kN": pdata["w_pile_effective"],
                "depth_at_max_m": pdata["depth_at_max"],
                "depth_for_target_m": pdata["depth_for_target"] if pdata["depth_for_target"] is not None else "N/A",
                "depth_for_target_global_m": pdata["depth_for_target_global"] if pdata["depth_for_target_global"] is not None else "N/A",
                "depth_for_target_gross_global_m": pdata["depth_for_target_gross_global"] if pdata["depth_for_target_gross_global"] is not None else "N/A",
                "depth_for_target_net_global_m": pdata["depth_for_target_net_global"] if pdata["depth_for_target_net_global"] is not None else "N/A",
                "depth_for_target_dif_m": pdata["depth_for_target_dif"] if pdata["depth_for_target_dif"] is not None else "N/A",
                "depth_for_target_gross_dif_m": pdata["depth_for_target_gross_dif"] if pdata["depth_for_target_gross_dif"] is not None else "N/A",
                "depth_for_target_net_dif_m": pdata["depth_for_target_net_dif"] if pdata["depth_for_target_net_dif"] is not None else "N/A"
            }
        summary_table.append(row)

    # 3. Análise por Eixo (com Cota TOPO, redução de camisa metálica e cálculo de embutimento)
    worst_sounding_name = payload.get("critical_sounding", "SPT-01")
    if worst_sounding_name not in all_soundings:
        worst_sounding_name = list(prepared_soundings.keys())[0] if prepared_soundings else synth_name

    critical_layers = all_soundings[worst_sounding_name]
    axes_results = calculate_axes_table(
        critical_layers,
        axes=axes,
        piles=piles,
        water_table_m=water_table_m,
        soil_groups=soil_groups,
        fs=fs,
        fs_lateral=fs_lateral,
        fs_ponta=fs_ponta,
        target_load_kN=target_load_kN,
        casing_reduction_pct=casing_reduction_pct,
        casing_reduction_mode=casing_reduction_mode,
        casing_length_m=casing_length_m,
        kp_base=kp_base,
        pa_kpa=pa_kpa,
        cn_max=cn_max,
        apply_beta_fhwa_limit=apply_beta_fhwa_limit,
        beta_shallow_stress_limit_kpa=beta_shallow_stress_limit_kpa,
        beta_cap_kp_tan_phi=beta_cap_kp_tan_phi,
        lateral_method=lateral_method,
        tip_method=tip_method,
        qs_max_ksf=qs_max_ksf,
        qp_max_ksf=qp_max_ksf,
        beta_min=beta_min,
        beta_max=beta_max,
        apply_beta_limits=apply_beta_limits,
        apply_shallow_stress_limit=apply_shallow_stress_limit,
        apply_qs_cap=apply_qs_cap,
        apply_qp_cap=apply_qp_cap,
        beta_depth_ref=beta_depth_ref,
        consider_pile_weight=consider_pile_weight,
        concrete_unit_weight=concrete_unit_weight,
        water_unit_weight=water_unit_weight,
        pile_weight_mode=pile_weight_mode,
        pile_length_above_start_m=pile_length_above_start_m,
        soil_above_removed=soil_above_removed,
        soil_above_height_m=soil_above_height_m
    )

    return {
        "success": True,
        "fs": fs,
        "fs_global": fs,
        "fs_lateral": fs_lateral,
        "fs_ponta": fs_ponta,
        "lateral_method": lateral_method,
        "tip_method": tip_method,
        "qs_max_ksf": qs_max_ksf,
        "qp_max_ksf": qp_max_ksf,
        "beta_min": beta_min,
        "beta_max": beta_max,
        "apply_beta_limits": apply_beta_limits,
        "apply_shallow_stress_limit": apply_shallow_stress_limit,
        "apply_qs_cap": apply_qs_cap,
        "apply_qp_cap": apply_qp_cap,
        "beta_depth_ref": beta_depth_ref,
        "apply_beta_fhwa_limit": apply_beta_fhwa_limit,
        "beta_shallow_stress_limit_kpa": beta_shallow_stress_limit_kpa,
        "extrapolate_soundings": extrapolate_soundings,
        "base_depth_m": base_depth_m,
        "spt01_measured_depth_m": base_depth_m,
        "min_test_depth_m": min_test_depth,
        "min_test_sounding": min_test_sounding,
        "sounding_depths": sounding_depths,
        "extrapolation_estimates": extrapolation_estimates,
        "extrapolation_estimates_by_sounding": extrapolation_estimates_by_sounding,
        "extrapolation_n_percentile": extrapolation_n_percentile,
        "extrapolation_max_depth_m": extrapolation_max_depth_m,
        "extrapolation_soil_group": extrapolation_soil_group,
        "casing_reduction_pct": casing_reduction_pct,
        "casing_reduction_mode": casing_reduction_mode,
        "casing_length_m": casing_length_m,
        "casing_factor": round(max(0.0, 1.0 - (casing_reduction_pct / 100.0)), 2),
        "water_table_m": water_table_m,
        "target_load_kN": target_load_kN,
        "percentile": percentile,
        "kp_base": kp_base,
        "pa_kpa": pa_kpa,
        "cn_max": cn_max,
        "consider_pile_weight": consider_pile_weight,
        "concrete_unit_weight": concrete_unit_weight,
        "water_unit_weight": water_unit_weight,
        "pile_weight_mode": pile_weight_mode,
        "pile_length_above_start_m": pile_length_above_start_m,
        "soil_above_removed": soil_above_removed,
        "soil_above_height_m": soil_above_height_m,
        "critical_sounding_used": worst_sounding_name,
        "piles": piles,
        "soil_groups": soil_groups,
        "summary_table": summary_table,
        "axes_analysis": axes_results,
        "soundings": analyzed_soundings
    }


def get_default_project_data() -> Dict[str, Any]:
    """
    Carrega os dados completos da planilha atualizada.
    """
    cache_path = os.path.join(os.path.dirname(__file__), "capacidade_estaca_data.json")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Aviso ao ler cache JSON: {e}")

    ref_excel = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "Refs", "capacidade estaca.xlsx"))
    if os.path.exists(ref_excel):
        try:
            return extract_data_from_excel(ref_excel)
        except Exception as e:
            print(f"Aviso ao ler Excel: {e}")

    return {
        "fs": 2.0,
        "fs_global": 2.0,
        "fs_lateral": 1.5,
        "fs_ponta": 3.0,
        "lateral_method": "mayne_fhwa",
        "tip_method": "aashto_2007",
        "qs_max_ksf": 4.0,
        "qp_max_ksf": 60.0,
        "beta_min": 0.25,
        "beta_max": 1.8,
        "apply_beta_limits": True,
        "apply_beta_fhwa_limit": True,
        "apply_shallow_stress_limit": True,
        "beta_shallow_stress_limit_kpa": 43.1,
        "casing_reduction_pct": 10.0,
        "casing_reduction_mode": "excel_formula",
        "casing_length_m": None,
        "water_table_m": 3.0,
        "target_load_kN": 21400.0,
        "percentile": 10.0,
        "kp_base": 0.59,
        "pa_kpa": 101.3,
        "cn_max": 2.0,
        "pile_length_above_start_m": 0.0,
        "critical_sounding": "SPT-01",
        "soil_groups": DEFAULT_SOIL_GROUPS,
        "piles": DEFAULT_PILES,
        "axes": DEFAULT_AXES,
        "soundings": {}
    }


def save_project_data_to_cache(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Salva os dados do projeto (eixos, cotas de topo, parâmetros e fatores) no arquivo
    de cache JSON para que persistam entre reinicializações do app.
    """
    cache_path = os.path.join(os.path.dirname(__file__), "capacidade_estaca_data.json")
    try:
        existing = {}
        if os.path.exists(cache_path):
            with open(cache_path, "r", encoding="utf-8") as f:
                existing = json.load(f)

        merged = dict(existing)
        # Campos atualizáveis
        persistable_keys = [
            "axes", "fs", "fs_global", "fs_lateral", "fs_ponta",
            "lateral_method", "tip_method", "qs_max_ksf", "qp_max_ksf",
            "beta_min", "beta_max", "apply_beta_limits", "apply_qs_cap", "apply_qp_cap", "beta_depth_ref",
            "apply_beta_fhwa_limit", "apply_shallow_stress_limit", "beta_shallow_stress_limit_kpa", "beta_cap_kp_tan_phi",
            "casing_reduction_pct", "casing_reduction_mode", "casing_length_m",
            "consider_pile_weight", "concrete_unit_weight", "water_unit_weight", "pile_weight_mode",
            "pile_length_above_start_m", "soil_above_removed", "soil_above_height_m",
            "water_table_m", "target_load_kN", "percentile", "kp_base", "cn_max", "pa_kpa",
            "critical_sounding", "base_depth_m", "spt01_measured_depth_m", "extrap_percentile",
            "extrap_soil_group", "extrap_max_depth_m"
        ]

        for k in persistable_keys:
            if k in data and data[k] is not None:
                merged[k] = data[k]

        # Se axes foi fornecido, garante normalização de cota_topo_m e cota_inicio_m
        if "axes" in data and isinstance(data["axes"], list):
            clean_axes = []
            for ax in data["axes"]:
                cota = ax.get("cota_topo_m", ax.get("cota_inicio_m", 0.0))
                ax_len_above = ax.get("pile_length_above_start_m")
                clean_axes.append({
                    "name": ax.get("name", ""),
                    "cota_inicio_m": float(cota),
                    "cota_topo_m": float(cota),
                    "target_load_kN": float(ax.get("target_load_kN", data.get("target_load_kN", 21400.0))),
                    "casing_length_m": ax.get("casing_length_m", None),
                    "pile_length_above_start_m": float(ax_len_above) if ax_len_above is not None else None
                })
            merged["axes"] = clean_axes

        # Preserva sondagens caso não venham no payload
        if "soundings" not in merged or not merged["soundings"]:
            merged["soundings"] = existing.get("soundings", {})

        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(merged, f, indent=2, ensure_ascii=False)

        return {"success": True, "filepath": cache_path, "axes_saved": len(merged.get("axes", []))}
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}



def extract_data_from_excel(excel_path: str) -> Dict[str, Any]:
    """
    Extrai todos os dados da versão atualizada de Refs/capacidade estaca.xlsx
    """
    import openpyxl

    wb = openpyxl.load_workbook(excel_path, data_only=True)

    # 1. Soil groups
    ws_aux = wb["AUXILIARY TABLE"] if "AUXILIARY TABLE" in wb.sheetnames else wb["TABELA AUXILIAR"]
    soil_groups = {}
    for r in range(2, 6):
        name = ws_aux.cell(r, 1).value
        if name:
            soil_groups[name] = {
                "gamma_dry": float(ws_aux.cell(r, 2).value or 18.0),
                "gamma_sub": float(ws_aux.cell(r, 3).value or 10.0)
            }

    # 2. Piles
    piles = []
    for r in range(3, 6):
        d_in = float(ws_aux.cell(r, 7).value or 48.0)
        d_m = float(ws_aux.cell(r, 8).value or 1.2)
        p_m = float(ws_aux.cell(r, 9).value or 3.76)
        a_m2 = float(ws_aux.cell(r, 10).value or 1.13)
        pid = f"pile_{int(d_in)}in"
        piles.append({
            "id": pid,
            "name": f"Estaca D={d_m:.2f}m ({int(d_in)}\")",
            "diam_in": d_in,
            "diam_m": d_m,
            "perimeter_m": p_m,
            "area_m2": a_m2
        })

    # 3. Sondagens
    soundings = {}
    for s_name in ["SPT-01", "SPT-02", "SPT-03", "SPT-04", "SPT-05", "SPT-06"]:
        if s_name not in wb.sheetnames:
            continue
        ws = wb[s_name]
        layers = []
        for r in range(2, ws.max_row + 1):
            z_ini = ws.cell(r, 1).value
            z_fim = ws.cell(r, 2).value
            if z_ini is None or z_fim is None:
                continue
            n1_60 = float(ws.cell(r, 3).value or 10.0)
            grupo = ws.cell(r, 4).value or "Areias"
            sucs = ws.cell(r, 5).value or ""
            layers.append({
                "z_ini": float(z_ini),
                "z_fim": float(z_fim),
                "n1_60": n1_60,
                "soil_group": grupo,
                "sucs": sucs
            })
        soundings[s_name] = layers

    # 4. Eixos da aba 'Capacidade por eixo' / 'Capacity by Axis'
    axes = []
    eixo_sheet = "Capacity by Axis" if "Capacity by Axis" in wb.sheetnames else ("Capacidade por eixo" if "Capacidade por eixo" in wb.sheetnames else None)
    if eixo_sheet:
        ws_eixo = wb[eixo_sheet]
        for r in range(3, 8):
            name = ws_eixo.cell(r, 1).value
            cota = ws_eixo.cell(r, 2).value
            if name is not None and cota is not None:
                axes.append({
                    "name": str(name),
                    "cota_inicio_m": float(cota),
                    "cota_topo_m": float(cota),
                    "target_load_kN": 21400.0
                })

    result = {
        "fs": 2.0,
        "fs_global": 2.0,
        "fs_lateral": 1.5,
        "fs_ponta": 3.0,
        "apply_beta_fhwa_limit": True,
        "beta_shallow_stress_limit_kpa": 43.1,
        "casing_reduction_pct": 10.0,
        "casing_reduction_mode": "excel_formula",
        "water_table_m": 3.0,
        "target_load_kN": 21400.0,
        "percentile": 10.0,
        "kp_base": 0.59,
        "pa_kpa": 101.3,
        "cn_max": 2.0,
        "critical_sounding": "SPT-01",
        "soil_groups": soil_groups or DEFAULT_SOIL_GROUPS,
        "piles": piles or DEFAULT_PILES,
        "axes": axes or DEFAULT_AXES,
        "soundings": soundings
    }

    cache_path = os.path.join(os.path.dirname(__file__), "capacidade_estaca_data.json")
    try:
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Aviso ao salvar cache JSON: {e}")

    return result


def export_to_excel(analysis_result: Dict[str, Any], output_path: str) -> str:
    """
    Generates a professional Excel workbook (.xlsx) with:
    - Tab 'AUXILIARY TABLE': Design parameters, soil groups, pile properties, summary table, and native BarChart of Allowable Capacities.
    - Tab 'Capacity by Axis': Top cut-off elevation, tip elevation, embedment length (Global vs Differentiated), and native BarChart of Embedments by Axis.
    - Individual Sounding tabs (SPT-01 to SPT-06 and SPT Mean): Full numerical depth profiles and 3 native geotechnical ScatterCharts (Stratigraphy, Resistances/Stresses, and Allowable Capacity vs Depth).
    All labels, table headers, column titles, and chart elements are in English.
    """
    import openpyxl
    from openpyxl.chart import ScatterChart, BarChart, Reference, Series
    from openpyxl.chart.axis import ChartLines
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    # Corporate styling tokens
    NAVY_HEADER = "1B365D"
    SLATE_HEADER = "335C67"
    LIGHT_BLUE_BG = "EBF3FA"
    BORDER_GRAY = "D9D9D9"

    font_header = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    font_sub = Font(name="Calibri", size=9, bold=True, color="FFFFFF")
    font_bold = Font(name="Calibri", size=10, bold=True)
    font_norm = Font(name="Calibri", size=10)

    fill_primary = PatternFill(start_color=NAVY_HEADER, end_color=NAVY_HEADER, fill_type="solid")
    fill_secondary = PatternFill(start_color=SLATE_HEADER, end_color=SLATE_HEADER, fill_type="solid")
    fill_accent = PatternFill(start_color=LIGHT_BLUE_BG, end_color=LIGHT_BLUE_BG, fill_type="solid")

    thin_border = Border(
        left=Side(style="thin", color=BORDER_GRAY),
        right=Side(style="thin", color=BORDER_GRAY),
        top=Side(style="thin", color=BORDER_GRAY),
        bottom=Side(style="thin", color=BORDER_GRAY)
    )

    fs_glob = analysis_result.get("fs_global", analysis_result.get("fs", 2.0))
    fs_s = analysis_result.get("fs_lateral", 1.5)
    fs_p = analysis_result.get("fs_ponta", 3.0)
    target_load = analysis_result.get("target_load_kN", 21400.0)
    piles = analysis_result.get("piles", [])

    # ==========================================
    # 1. AUXILIARY TABLE
    # ==========================================
    ws_aux = wb.create_sheet(title="AUXILIARY TABLE")
    ws_aux.views.sheetView[0].showGridLines = True

    # Soil groups header
    ws_aux.merge_cells("A1:C1")
    ws_aux.cell(1, 1, "SOIL GROUPS").font = font_header
    ws_aux.cell(1, 1).fill = fill_primary
    ws_aux.cell(1, 1).alignment = Alignment(horizontal="center", vertical="center")

    # Piles geometry header
    ws_aux.merge_cells("E1:H1")
    ws_aux.cell(1, 5, "DRILLED SHAFTS - GEOMETRIC PROPERTIES").font = font_header
    ws_aux.cell(1, 5).fill = fill_primary
    ws_aux.cell(1, 5).alignment = Alignment(horizontal="center", vertical="center")

    # Column subheaders
    ws_aux.cell(2, 1, "Soil Group").font = font_sub
    ws_aux.cell(2, 1).fill = fill_secondary
    ws_aux.cell(2, 2, "Dry Unit Wt (kN/m³)").font = font_sub
    ws_aux.cell(2, 2).fill = fill_secondary
    ws_aux.cell(2, 3, "Sub Unit Wt (kN/m³)").font = font_sub
    ws_aux.cell(2, 3).fill = fill_secondary

    ws_aux.cell(2, 5, "Diameter (in)").font = font_sub
    ws_aux.cell(2, 5).fill = fill_secondary
    ws_aux.cell(2, 6, "Diameter (m)").font = font_sub
    ws_aux.cell(2, 6).fill = fill_secondary
    ws_aux.cell(2, 7, "Perimeter (m)").font = font_sub
    ws_aux.cell(2, 7).fill = fill_secondary
    ws_aux.cell(2, 8, "Base Area (m²)").font = font_sub
    ws_aux.cell(2, 8).fill = fill_secondary

    r_idx = 3
    for grp, p in analysis_result.get("soil_groups", {}).items():
        ws_aux.cell(r_idx, 1, grp).font = font_norm
        ws_aux.cell(r_idx, 2, p.get("gamma_dry", 18.0)).font = font_norm
        ws_aux.cell(r_idx, 2).number_format = "0.00"
        ws_aux.cell(r_idx, 3, p.get("gamma_sub", 10.0)).font = font_norm
        ws_aux.cell(r_idx, 3).number_format = "0.00"
        for c in range(1, 4):
            ws_aux.cell(r_idx, c).border = thin_border
        r_idx += 1

    r_idx_p = 3
    for p in piles:
        ws_aux.cell(r_idx_p, 5, p.get("diam_in", 48)).font = font_norm
        ws_aux.cell(r_idx_p, 6, p.get("diam_m", 1.2)).font = font_norm
        ws_aux.cell(r_idx_p, 6).number_format = "0.00"
        ws_aux.cell(r_idx_p, 7, p.get("perimeter_m", 3.76)).font = font_norm
        ws_aux.cell(r_idx_p, 7).number_format = "0.00"
        ws_aux.cell(r_idx_p, 8, p.get("area_m2", 1.13)).font = font_norm
        ws_aux.cell(r_idx_p, 8).number_format = "0.00"
        for c in range(5, 9):
            ws_aux.cell(r_idx_p, c).border = thin_border
        r_idx_p += 1

    max_top_row = max(r_idx, r_idx_p) + 1
    casing_p = analysis_result.get("casing_reduction_pct", 10.0)
    casing_l = analysis_result.get("casing_length_m")
    casing_str = f" | Steel Casing: -{casing_p:.0f}% ({casing_l:.1f}m)" if casing_l is not None else f" | Steel Casing: -{casing_p:.0f}% (Full Depth)"
    info_text = f"Target Axial Load: {target_load:,.0f} kN | Criterion 1: Global FS = {fs_glob:.2f} | Criterion 2: Lateral FS = {fs_s:.2f} & Tip FS = {fs_p:.2f}{casing_str}"

    ws_aux.cell(max_top_row, 1, info_text).font = font_bold
    ws_aux.cell(max_top_row, 1).fill = fill_accent

    start_sum_row = max_top_row + 2
    headers_resumo_1 = ["Sounding"]
    headers_resumo_2 = [""]
    for title in [
        "Ultimate Capacity Rn (kN)",
        f"Global Allowable Radm (kN - FS={fs_glob:.1f})",
        f"Diff Allowable Radm (kN - FSs={fs_s:.1f}, FSp={fs_p:.1f})",
        f"Required Depth Global ({target_load:,.0f} kN)",
        f"Required Depth Diff ({target_load:,.0f} kN)"
    ]:
        for p in piles:
            headers_resumo_1.append(title)
            headers_resumo_2.append(f"D={p.get('diam_m', 1.2):.2f}m")

    ws_aux.append(headers_resumo_1)
    ws_aux.append(headers_resumo_2)

    for col_idx in range(1, len(headers_resumo_1) + 1):
        c1 = ws_aux.cell(start_sum_row, col_idx)
        c1.font = font_header
        c1.fill = fill_primary
        c1.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c2 = ws_aux.cell(start_sum_row + 1, col_idx)
        c2.font = font_sub
        c2.fill = fill_secondary
        c2.alignment = Alignment(horizontal="center", vertical="center")

    curr_row = start_sum_row + 2
    sum_start_data_row = curr_row
    for row_data in analysis_result.get("summary_table", []):
        s_label = row_data["sounding_name"].replace("médio", "Mean").replace("Médio", "Mean")
        row_vals = [s_label]
        # Rn
        for p in piles:
            pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
            p_inf = row_data["piles"].get(pid, {})
            row_vals.append(p_inf.get("max_rn_kN", 0.0))
        # Radm Global
        for p in piles:
            pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
            p_inf = row_data["piles"].get(pid, {})
            row_vals.append(p_inf.get("max_radm_global_kN", p_inf.get("max_radm_kN", 0.0)))
        # Radm Diferenciado
        for p in piles:
            pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
            p_inf = row_data["piles"].get(pid, {})
            row_vals.append(p_inf.get("max_radm_dif_kN", 0.0))
        # Prof Alvo Global
        for p in piles:
            pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
            p_inf = row_data["piles"].get(pid, {})
            val = p_inf.get("depth_for_target_global_m", p_inf.get("depth_for_target_m", "N/A"))
            row_vals.append(val)
        # Prof Alvo Diferenciado
        for p in piles:
            pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
            p_inf = row_data["piles"].get(pid, {})
            val = p_inf.get("depth_for_target_dif_m", "N/A")
            row_vals.append(val)

        ws_aux.append(row_vals)
        for c_i, v in enumerate(row_vals, 1):
            cell = ws_aux.cell(curr_row, c_i)
            cell.font = font_norm
            cell.border = thin_border
            if c_i == 1:
                cell.alignment = Alignment(horizontal="left")
            else:
                if isinstance(v, (int, float)):
                    cell.number_format = "#,##0.0" if v < 1000 else "#,##0"
                    cell.alignment = Alignment(horizontal="right")
                else:
                    cell.alignment = Alignment(horizontal="center")
        curr_row += 1

    sum_end_data_row = curr_row - 1

    # Native Excel BarChart in AUXILIARY TABLE: Allowable Capacity Radm Global
    if sum_end_data_row >= sum_start_data_row:
        chart_aux = BarChart()
        chart_aux.type = "col"
        chart_aux.style = 10
        chart_aux.title = f"Allowable Axial Capacity Radm by Sounding (Global FS={fs_glob:.1f})"
        chart_aux.y_axis.title = "Allowable Capacity Radm (kN)"
        chart_aux.x_axis.title = "Sounding"
        chart_aux.width = 18
        chart_aux.height = 11

        col_radm_start = 1 + len(piles) + 1
        col_radm_end = col_radm_start + len(piles) - 1
        chart_data = Reference(ws_aux, min_col=col_radm_start, min_row=start_sum_row + 1, max_col=col_radm_end, max_row=sum_end_data_row)
        chart_cats = Reference(ws_aux, min_col=1, min_row=sum_start_data_row, max_row=sum_end_data_row)
        chart_aux.add_data(chart_data, titles_from_data=True)
        chart_aux.set_categories(chart_cats)

        ws_aux.add_chart(chart_aux, f"B{sum_end_data_row + 3}")

    for col in ws_aux.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            if cell.value and cell.row > 1 and cell.row != max_top_row:
                max_len = max(max_len, len(str(cell.value)))
        ws_aux.column_dimensions[col_letter].width = max(max_len + 3, 12)

    # ==========================================
    # 2. CAPACITY BY AXIS
    # ==========================================
    ws_eixo = wb.create_sheet(title="Capacity by Axis")
    ws_eixo.views.sheetView[0].showGridLines = True
    ws_eixo.freeze_panes = "C2"

    eixo_headers = ["Axis", "Top Cut-Off El. (m)"]
    for p in piles:
        eixo_headers.append(f"Tip El. D={p['diam_m']:.2f}m (FS={fs_glob:.2f})")
    for p in piles:
        eixo_headers.append(f"Embedment D={p['diam_m']:.2f}m (FS={fs_glob:.2f})")
    for p in piles:
        eixo_headers.append(f"Tip El. D={p['diam_m']:.2f}m (DIF: {fs_s:.2f}/{fs_p:.2f})")
    for p in piles:
        eixo_headers.append(f"Embedment D={p['diam_m']:.2f}m (DIF: {fs_s:.2f}/{fs_p:.2f})")

    ws_eixo.append(eixo_headers)
    for c_i in range(1, len(eixo_headers) + 1):
        c = ws_eixo.cell(1, c_i)
        c.font = font_header
        c.fill = fill_primary
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    eixo_r = 2
    for ax_info in analysis_result.get("axes_analysis", []):
        r_row = [ax_info["name"], ax_info.get("cota_topo_m", ax_info.get("cota_inicio_m", 0.0))]
        # Tip El Global
        for p in piles:
            pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
            p_res = ax_info["piles"].get(pid, {})
            r_row.append(p_res.get("cota_fundo_global_m", p_res.get("cota_fundo_m", "N/A")))
        # Embedment Global
        for p in piles:
            pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
            p_res = ax_info["piles"].get(pid, {})
            r_row.append(p_res.get("embutimento_global_m", p_res.get("embutimento_m", "N/A")))
        # Tip El Diff
        for p in piles:
            pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
            p_res = ax_info["piles"].get(pid, {})
            r_row.append(p_res.get("cota_fundo_dif_m", "N/A"))
        # Embedment Diff
        for p in piles:
            pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
            p_res = ax_info["piles"].get(pid, {})
            r_row.append(p_res.get("embutimento_dif_m", "N/A"))

        ws_eixo.append(r_row)
        for c_i, v in enumerate(r_row, 1):
            cell = ws_eixo.cell(eixo_r, c_i)
            cell.font = font_norm
            cell.border = thin_border
            if c_i == 1:
                cell.alignment = Alignment(horizontal="center")
            else:
                if isinstance(v, (int, float)):
                    cell.number_format = "0.00"
                    cell.alignment = Alignment(horizontal="right")
                else:
                    cell.alignment = Alignment(horizontal="center")
        eixo_r += 1

    eixo_end_row = eixo_r - 1

    # Native Excel BarChart for Capacity by Axis (Embedment Length per Axis) placed to the right of summary table
    if eixo_end_row >= 2:
        chart_axis = BarChart()
        chart_axis.type = "col"
        chart_axis.style = 10
        chart_axis.title = f"Required Pile Embedment by Axis (Global FS={fs_glob:.1f})"
        chart_axis.y_axis.title = "Embedment Length (m)"
        chart_axis.x_axis.title = "Axis"
        chart_axis.width = 16
        chart_axis.height = 10

        col_emb_start = 2 + len(piles) + 1
        col_emb_end = col_emb_start + len(piles) - 1
        axis_data = Reference(ws_eixo, min_col=col_emb_start, min_row=1, max_col=col_emb_end, max_row=eixo_end_row)
        axis_cats = Reference(ws_eixo, min_col=1, min_row=2, max_row=eixo_end_row)
        chart_axis.add_data(axis_data, titles_from_data=True)
        chart_axis.set_categories(axis_cats)
        pos_bar = get_column_letter(len(eixo_headers) + 2)
        ws_eixo.add_chart(chart_axis, f"{pos_bar}2")

    for col in ws_eixo.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            if cell.value:
                max_len = max(max_len, len(str(cell.value)))
        ws_eixo.column_dimensions[col_letter].width = max(max_len + 3, 14)

    # =========================================================================
    # 2.1 INDIVIDUAL AXIS SHEETS & SIDE-BY-SIDE CHARTS (TIP ELEVATION VS RADM)
    # =========================================================================
    wt = analysis_result.get("water_table_m", 3.0)
    conc_g = analysis_result.get("concrete_unit_weight", 25.0)
    water_g = analysis_result.get("water_unit_weight", 10.0)
    gamma_sub_conc = max(0.0, conc_g - water_g)

    crit_sounding_name = analysis_result.get("critical_sounding_used") or analysis_result.get("critical_sounding", "SPT-01")
    default_layers = analysis_result.get("soundings", {}).get(crit_sounding_name, {}).get("layers", [])
    if not default_layers:
        first_s = list(analysis_result.get("soundings", {}).values())
        if first_s:
            default_layers = first_s[0].get("layers", [])

    # Banner in ws_eixo for Axis charts section
    chart_start_row_eixo = max(eixo_end_row + 4, 12)
    ws_eixo.cell(chart_start_row_eixo, 1, "AXIS CAPACITY CHARTS — TIP ELEVATION VS CUMULATIVE NET ALLOWABLE CAPACITY").font = Font(name="Calibri", size=11, bold=True, color="1B365D")
    ws_eixo.cell(chart_start_row_eixo, 1).fill = fill_accent

    axis_colors = ["2563EB", "4338CA", "6D28D9", "B91C1C"]

    for ax_idx, ax_info in enumerate(analysis_result.get("axes_analysis", [])):
        ax_name = ax_info["name"]
        sheet_title = f"Axis {ax_name}"[:31]
        ws_ax = wb.create_sheet(title=sheet_title)
        ws_ax.views.sheetView[0].showGridLines = True
        ws_ax.freeze_panes = "C4"

        cota_topo = ax_info.get("cota_topo_m", ax_info.get("cota_inicio_m", 0.0))
        target_load = ax_info.get("target_load_kN") or analysis_result.get("target_load_kN", 21400.0)
        casing_pct = ax_info.get("casing_reduction_pct", analysis_result.get("casing_reduction_pct", 10.0))
        casing_factor = max(0.0, 1.0 - (casing_pct / 100.0))
        casing_len = ax_info.get("casing_length_m", analysis_result.get("casing_length_m"))
        ax_len_above = float(ax_info.get("pile_length_above_start_m") if ax_info.get("pile_length_above_start_m") is not None else analysis_result.get("pile_length_above_start_m", 0.0))

        # Top Header Banner
        casing_str = f"Casing: -{casing_pct:.0f}% ({casing_len:.1f}m)" if casing_len is not None else f"Casing: -{casing_pct:.0f}%"
        above_str = f" | L_above = {ax_len_above:.2f}m" if ax_len_above > 0 else ""
        ws_ax.merge_cells("A1:K1")
        ws_ax.cell(1, 1, f"AXIS {ax_name} — TIP AND LATERAL RESISTANCE").font = Font(name="Calibri", size=12, bold=True, color="1B365D")
        ws_ax.merge_cells("A2:K2")
        ws_ax.cell(2, 1, f"Top El. = {cota_topo:.2f} m | Target Load = {target_load:,.0f} kN | Sounding: {crit_sounding_name} | {casing_str}{above_str} | FS Lateral = {fs_s:.2f}, FS Tip = {fs_p:.2f}").font = Font(name="Calibri", size=9, italic=True)

        # Table Column Headers
        ax_headers = ["Tip_Elevation_m", "Embedment_m"]
        pile_col_indices = {}
        for p in piles:
            pid = p["id"]
            pile_col_indices[pid] = {}
            # Net DIF (Total)
            ax_headers.append(f"Net_DIF_D={p['diam_m']:.2f}m (kN)")
            pile_col_indices[pid]["net_dif"] = len(ax_headers)
            # Lateral DIF (Shaft)
            ax_headers.append(f"Rs_DIF_D={p['diam_m']:.2f}m (kN)")
            pile_col_indices[pid]["rs_dif"] = len(ax_headers)
            # Tip DIF (Ponta)
            ax_headers.append(f"Rp_DIF_D={p['diam_m']:.2f}m (kN)")
            pile_col_indices[pid]["rp_dif"] = len(ax_headers)
            # Gross DIF
            ax_headers.append(f"Gross_DIF_D={p['diam_m']:.2f}m (kN)")
            pile_col_indices[pid]["gross_dif"] = len(ax_headers)
            # Net Global
            ax_headers.append(f"Net_Glob_D={p['diam_m']:.2f}m (kN)")
            pile_col_indices[pid]["net_glob"] = len(ax_headers)
            # Lateral Global
            ax_headers.append(f"Rs_Glob_D={p['diam_m']:.2f}m (kN)")
            pile_col_indices[pid]["rs_glob"] = len(ax_headers)
            # Tip Global
            ax_headers.append(f"Rp_Glob_D={p['diam_m']:.2f}m (kN)")
            pile_col_indices[pid]["rp_glob"] = len(ax_headers)
            # W Pile
            ax_headers.append(f"W_pile_D={p['diam_m']:.2f}m (kN)")
            pile_col_indices[pid]["w_pile"] = len(ax_headers)

        col_target_x = len(ax_headers) + 1
        col_target_y = len(ax_headers) + 2
        col_top_x = len(ax_headers) + 3
        col_top_y = len(ax_headers) + 4
        ax_headers.extend(["Target_Load_X", "Target_Load_Y", "Top_El_X", "Top_El_Y"])

        ws_ax.append(ax_headers)
        for c_i in range(1, len(ax_headers) + 1):
            c = ws_ax.cell(3, c_i)
            c.font = font_header
            c.fill = fill_primary
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

        # Compute layer-by-layer progression for this axis
        ax_layers = ax_info.get("layers")
        if not ax_layers:
            ax_layers = analysis_result.get("soundings", {}).get(ax_info.get("sounding", crit_sounding_name), {}).get("layers", default_layers)
        row_count = 3
        max_x_val = target_load * 1.25

        consider_w = analysis_result.get("consider_pile_weight", True)
        pile_trackers = {
            p["id"]: {
                "sum_rs": 0.0,
                "sum_w": (p["area_m2"] * ax_len_above * gamma_sub_conc) if (ax_len_above > 0 and consider_w) else 0.0,
                "area": p["area_m2"],
                "perim": p["perimeter_m"],
                "diam": p["diam_m"]
            }
            for p in piles
        }

        # Ponto inicial na Cota de Topo (Embedment = 0.0 m)
        # No topo: atrito lateral Rs = 0. Se consider_pile_weight estiver ativo, desconta o peso acima da cota (W_above).
        lyr_topo = next((l for l in ax_layers if l["z_ini"] <= cota_topo <= l["z_fim"]), ax_layers[0] if ax_layers else None)
        qp_topo = lyr_topo["qp"] if lyr_topo else 0.0

        init_row_vals = [round(cota_topo, 2), 0.0]
        for p in piles:
            tr = pile_trackers[p["id"]]
            area = p["area_m2"]
            rp_topo = qp_topo * area
            rp_adm_dif_topo = rp_topo / fs_p
            rp_adm_glob_topo = rp_topo / fs_glob
            if casing_len is None and casing_reduction_mode == "excel_formula":
                rp_adm_dif_topo *= casing_factor
                rp_adm_glob_topo *= casing_factor

            w_init = tr["sum_w"] if consider_w else 0.0
            net_dif_init = max(0.0, rp_adm_dif_topo - w_init)
            net_glob_init = max(0.0, rp_adm_glob_topo - w_init)

            init_row_vals.extend([
                round(net_dif_init, 1),      # Net DIF = Rp_adm - W_above
                0.0,                         # Rs DIF = 0.0
                round(rp_adm_dif_topo, 1),   # Rp DIF
                round(rp_adm_dif_topo, 1),   # Gross DIF
                round(net_glob_init, 1),     # Net Glob
                0.0,                         # Rs Glob = 0.0
                round(rp_adm_glob_topo, 1),  # Rp Glob
                round(w_init, 1)             # W_pile
            ])
            max_x_val = max(max_x_val, rp_adm_dif_topo * 1.1)

        ws_ax.append(init_row_vals)
        row_count += 1
        for c_i, v in enumerate(init_row_vals, 1):
            cell = ws_ax.cell(row_count, c_i)
            cell.font = font_norm
            cell.border = thin_border
            if c_i in [1, 2]:
                cell.number_format = "0.00"
            else:
                cell.number_format = "#,##0.0"
            cell.alignment = Alignment(horizontal="right")

        max_tip_depth = cota_topo
        for lyr in ax_layers:
            z_ini = lyr["z_ini"]
            z_fim = lyr["z_fim"]
            if z_fim <= cota_topo:
                continue
            zA = max(z_ini, cota_topo)
            zB = z_fim
            eff_dz = zB - zA
            if eff_dz <= 0:
                continue

            max_tip_depth = max(max_tip_depth, zB)
            emb = zB - cota_topo
            row_vals = [round(zB, 2), round(emb, 2)]

            for p in piles:
                tr = pile_trackers[p["id"]]
                area = tr["area"]
                perim = tr["perim"]

                # Casing reduction
                if casing_len is not None and casing_len >= 0:
                    casing_end = cota_topo + casing_len
                    cased_dz = max(0.0, min(zB, casing_end) - zA)
                    uncased_dz = max(0.0, eff_dz - cased_dz)
                    d_rs = lyr["qs"] * perim * (cased_dz * casing_factor + uncased_dz * 1.0)
                else:
                    d_rs = lyr["qs"] * perim * eff_dz * casing_factor

                tr["sum_rs"] += d_rs
                rp = lyr["qp"] * area
                rn = rp + tr["sum_rs"]

                # Effective pile self-weight
                if zB <= wt:
                    eff_g = conc_g
                elif zA >= wt:
                    eff_g = gamma_sub_conc
                else:
                    eff_g = (max(0.0, wt - zA) * conc_g + max(0.0, zB - wt) * gamma_sub_conc) / eff_dz
                tr["sum_w"] += area * eff_dz * eff_g

                radm_glob = rn / fs_glob
                radm_dif = (tr["sum_rs"] / fs_s) + (rp / fs_p)

                rs_dif = tr["sum_rs"] / fs_s
                rp_dif = rp / fs_p
                rs_glob = tr["sum_rs"] / fs_glob
                rp_glob = rp / fs_glob

                net_glob = max(0.0, radm_glob - tr["sum_w"])
                net_dif = max(0.0, radm_dif - tr["sum_w"])

                max_x_val = max(max_x_val, net_dif * 1.1)

                row_vals.extend([
                    round(net_dif, 1),
                    round(rs_dif, 1),
                    round(rp_dif, 1),
                    round(radm_dif, 1),
                    round(net_glob, 1),
                    round(rs_glob, 1),
                    round(rp_glob, 1),
                    round(tr["sum_w"], 1),
                ])

            ws_ax.append(row_vals)
            row_count += 1
            for c_i, v in enumerate(row_vals, 1):
                cell = ws_ax.cell(row_count, c_i)
                cell.font = font_norm
                cell.border = thin_border
                if c_i in [1, 2]:
                    cell.number_format = "0.00"
                else:
                    cell.number_format = "#,##0.0"
                cell.alignment = Alignment(horizontal="right")

        # Reference lines data:
        chart_y_max = math.ceil((max_tip_depth + 4) / 5) * 5
        chart_x_max = math.ceil(max(target_load * 1.15, max_x_val) / 2500) * 2500

        # Target Load vertical line (2 points)
        ws_ax.cell(4, col_target_x, float(target_load))
        ws_ax.cell(4, col_target_y, float(cota_topo))
        ws_ax.cell(5, col_target_x, float(target_load))
        ws_ax.cell(5, col_target_y, float(chart_y_max))

        # Top Elevation horizontal line (2 points)
        ws_ax.cell(4, col_top_x, 0.0)
        ws_ax.cell(4, col_top_y, float(cota_topo))
        ws_ax.cell(5, col_top_x, float(chart_x_max))
        ws_ax.cell(5, col_top_y, float(cota_topo))

        # 1. Comparison ScatterChart (All Diameters)
        def build_axis_comparison_chart():
            chart = ScatterChart()
            chart.scatterStyle = "line"
            chart.title = f"AXIS {ax_name} — ALL DIAMETERS CAPACITY (Radm,net)"
            chart.style = 13
            chart.x_axis.tickLblPos = "high"
            chart.x_axis.scaling.min = 0
            chart.x_axis.majorGridlines = ChartLines()
            chart.y_axis.scaling.orientation = "maxMin"
            chart.y_axis.scaling.min = 0
            chart.y_axis.scaling.max = chart_y_max
            chart.y_axis.majorUnit = 5
            chart.y_axis.majorGridlines = ChartLines()
            chart.legend.legendPos = "b"
            chart.width = 14
            chart.height = 17

            y_axis_ref = Reference(ws_ax, min_col=1, min_row=4, max_row=row_count)

            # Top Elevation reference line (Blue dotted)
            s_top = Series(
                values=Reference(ws_ax, min_col=col_top_y, min_row=4, max_row=5),
                xvalues=Reference(ws_ax, min_col=col_top_x, min_row=4, max_row=5),
                title=f"Top El. ({cota_topo:.2f} m)"
            )
            s_top.graphicalProperties.line.solidFill = "2563EB"
            s_top.graphicalProperties.line.dashStyle = "sysDot"
            s_top.graphicalProperties.line.width = 18000
            chart.series.append(s_top)

            # Net DIF Capacity Curves for each pile
            for p_i, p in enumerate(piles):
                col_curve = pile_col_indices[p["id"]]["net_dif"]
                diam_in = p.get('diam_in', round(p.get('diam_m', 1.2) / 0.0254))
                title_str = f"Ø {p['diam_m']:.2f}m ({diam_in:.0f}\") - Net DIF (FSs={fs_s:.2f}/FSp={fs_p:.2f})"
                s_curve = Series(
                    values=y_axis_ref,
                    xvalues=Reference(ws_ax, min_col=col_curve, min_row=4, max_row=row_count),
                    title=title_str
                )
                s_curve.graphicalProperties.line.solidFill = axis_colors[p_i % len(axis_colors)]
                s_curve.graphicalProperties.line.width = 24000
                chart.series.append(s_curve)

            # Target Load vertical line (Red dotted)
            s_target = Series(
                values=Reference(ws_ax, min_col=col_target_y, min_row=4, max_row=5),
                xvalues=Reference(ws_ax, min_col=col_target_x, min_row=4, max_row=5),
                title=f"Target Load ({target_load:,.0f} kN)"
            )
            s_target.graphicalProperties.line.solidFill = "DC2626"
            s_target.graphicalProperties.line.dashStyle = "sysDot"
            s_target.graphicalProperties.line.width = 22000
            chart.series.append(s_target)

            return chart

        # 2. Individual Breakdown Chart for each pile (Lateral, Tip & Total) - EXACT MATCH TO USER'S REFERENCE
        def build_pile_breakdown_chart(p_idx, p):
            chart = ScatterChart()
            chart.scatterStyle = "line"
            diam_in = p.get('diam_in', round(p.get('diam_m', 1.2) / 0.0254))
            chart.title = f"AXIS {ax_name}" if (len(piles) == 1 or p_idx == 0) else f"AXIS {ax_name} — Ø {p['diam_m']:.2f}m ({diam_in:.0f}\")"
            chart.style = 13
            chart.x_axis.tickLblPos = "high"
            chart.x_axis.scaling.min = 0
            chart.x_axis.majorGridlines = ChartLines()
            chart.y_axis.scaling.orientation = "maxMin"
            chart.y_axis.scaling.min = 0
            chart.y_axis.scaling.max = chart_y_max
            chart.y_axis.majorUnit = 5
            chart.y_axis.majorGridlines = ChartLines()
            chart.legend.legendPos = "b"
            chart.width = 13.5
            chart.height = 17.5

            y_axis_ref = Reference(ws_ax, min_col=1, min_row=4, max_row=row_count)

            # 1. Top Elevation reference line (Blue dotted)
            s_top = Series(
                values=Reference(ws_ax, min_col=col_top_y, min_row=4, max_row=5),
                xvalues=Reference(ws_ax, min_col=col_top_x, min_row=4, max_row=5),
                title=f"Top El. ({cota_topo:.2f} m)"
            )
            s_top.graphicalProperties.line.solidFill = "2563EB"
            s_top.graphicalProperties.line.dashStyle = "sysDot"
            s_top.graphicalProperties.line.width = 18000
            chart.series.append(s_top)

            # 2. Total Net Capacity Radm,net (Orange Solid Line)
            col_net = pile_col_indices[p["id"]]["net_dif"]
            s_tot = Series(
                values=y_axis_ref,
                xvalues=Reference(ws_ax, min_col=col_net, min_row=4, max_row=row_count),
                title=f"Total Net Radm,net (DIF: FSs={fs_s:.2f}/FSp={fs_p:.2f})"
            )
            s_tot.graphicalProperties.line.solidFill = "EA580C"
            s_tot.graphicalProperties.line.width = 24000
            chart.series.append(s_tot)

            # 3. Lateral Capacity Rs_adm (Gray Dashed Line)
            col_rs = pile_col_indices[p["id"]]["rs_dif"]
            s_lat = Series(
                values=y_axis_ref,
                xvalues=Reference(ws_ax, min_col=col_rs, min_row=4, max_row=row_count),
                title=f"Lateral Capacity Rs_adm (FSs={fs_s:.2f})"
            )
            s_lat.graphicalProperties.line.solidFill = "9CA3AF"
            s_lat.graphicalProperties.line.dashStyle = "dash"
            s_lat.graphicalProperties.line.width = 20000
            chart.series.append(s_lat)

            # 4. Tip Capacity Rp_adm (Yellow/Gold Dashed Line)
            col_rp = pile_col_indices[p["id"]]["rp_dif"]
            s_tip = Series(
                values=y_axis_ref,
                xvalues=Reference(ws_ax, min_col=col_rp, min_row=4, max_row=row_count),
                title=f"Tip Capacity Rp_adm (FSp={fs_p:.2f})"
            )
            s_tip.graphicalProperties.line.solidFill = "EAB308"
            s_tip.graphicalProperties.line.dashStyle = "dash"
            s_tip.graphicalProperties.line.width = 20000
            chart.series.append(s_tip)

            # 5. Target Load (Red Dotted Line)
            s_target = Series(
                values=Reference(ws_ax, min_col=col_target_y, min_row=4, max_row=5),
                xvalues=Reference(ws_ax, min_col=col_target_x, min_row=4, max_row=5),
                title=f"Target Load ({target_load:,.0f} kN)"
            )
            s_target.graphicalProperties.line.solidFill = "DC2626"
            s_target.graphicalProperties.line.dashStyle = "sysDot"
            s_target.graphicalProperties.line.width = 22000
            chart.series.append(s_target)

            return chart

        # Add Charts to individual Axis sheet in a 2-column grid to the right of data
        start_chart_col = len(ax_headers) + 2
        col_c1 = get_column_letter(start_chart_col)
        col_c2 = get_column_letter(start_chart_col + 15)

        # Charts: Place the primary breakdown chart in prime position (C1), comparison in C2
        if piles:
            p_prime = piles[0]
            chart_prime = build_pile_breakdown_chart(0, p_prime)
            ws_ax.add_chart(chart_prime, f"{col_c1}3")

        chart_all = build_axis_comparison_chart()
        ws_ax.add_chart(chart_all, f"{col_c2}3")

        # Additional pile breakdown charts below
        for p_idx in range(1, len(piles)):
            p = piles[p_idx]
            chart_breakdown = build_pile_breakdown_chart(p_idx, p)
            grid_pos = p_idx + 1
            c_letter = col_c1 if (grid_pos % 2 == 0) else col_c2
            r_num = 3 + (grid_pos // 2) * 32
            ws_ax.add_chart(chart_breakdown, f"{c_letter}{r_num}")

        for c_idx in range(1, len(ax_headers) + 1):
            col_letter = get_column_letter(c_idx)
            ws_ax.column_dimensions[col_letter].width = 16

        # ALSO add comparison chart to Capacity by Axis sheet in side-by-side pairs!
        chart_for_eixo_sheet = build_axis_comparison_chart()
        chart_for_eixo_sheet.width = 15
        chart_for_eixo_sheet.height = 13
        grid_row = chart_start_row_eixo + 2 + (ax_idx // 2) * 25
        grid_col_letter = "B" if (ax_idx % 2 == 0) else "K"
        ws_eixo.add_chart(chart_for_eixo_sheet, f"{grid_col_letter}{grid_row}")

    # ==========================================
    # 3. SOUNDING SHEETS WITH SCATTERCHARTS
    # ==========================================
    # Pre-defined line colors for charts
    line_colors_glob = ["1D4ED8", "4338CA", "6D28D9", "B91C1C"]
    line_colors_dif = ["0D9488", "059669", "16A34A", "CA8A04"]

    for s_name, s_data in analysis_result.get("soundings", {}).items():
        clean_title = s_name.replace("médio", "Mean").replace("Médio", "Mean")[:31]
        ws_s = wb.create_sheet(title=clean_title)
        ws_s.views.sheetView[0].showGridLines = True
        ws_s.freeze_panes = "C2"

        s_headers = [
            "Start_Depth_m", "End_Depth_m", "N1_60", "Soil_Group", "USCS_Class",
            "Unit_Weight_kN_m3", "N60", "phi_prime_deg", "sigma_p_kPa", "sigma_v_prime_kPa",
            "Kp_Rankine", "Kp_tan_phi", "beta_raw", "beta_design",
            "qs_kPa", "qp_kPa"
        ]
        for p in piles:
            s_headers.append(f"Rs-{p.get('diam_m', 1.2):.2f}m (kN)")
        for p in piles:
            s_headers.append(f"Rn-{p.get('diam_m', 1.2):.2f}m (kN)")
        for p in piles:
            s_headers.append(f"Radm_Glob-{p.get('diam_m', 1.2):.2f}m (kN)")
        for p in piles:
            s_headers.append(f"Radm_Dif-{p.get('diam_m', 1.2):.2f}m (kN)")

        ws_s.append(s_headers)
        for c_i in range(1, len(s_headers) + 1):
            c = ws_s.cell(1, c_i)
            c.font = font_header
            c.fill = fill_primary
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

        layers = s_data.get("layers", [])
        caps = s_data.get("capacities", {})
        row_count = 1

        for idx, lyr in enumerate(layers):
            row_l = [
                lyr["z_ini"], lyr["z_fim"], lyr["n1_60"], lyr["soil_group"], lyr["sucs"],
                lyr["gamma"], lyr["n60"], lyr["phi_deg"], lyr["sigma_p"], lyr["sigma_v"],
                lyr.get("kp_rankine", "-"), lyr.get("kp_tan_phi", "-"),
                lyr.get("beta_raw", lyr["beta"]), lyr["beta"],
                lyr["qs"], lyr["qp"]
            ]
            for p in piles:
                pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
                p_cap = caps.get(pid, {})
                rs_val = p_cap.get("rs_segment", [])[idx] if idx < len(p_cap.get("rs_segment", [])) else 0.0
                row_l.append(rs_val)
            for p in piles:
                pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
                p_cap = caps.get(pid, {})
                rn_val = p_cap.get("rn", [])[idx] if idx < len(p_cap.get("rn", [])) else 0.0
                row_l.append(rn_val)
            for p in piles:
                pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
                p_cap = caps.get(pid, {})
                radm_val = p_cap.get("radm", [])[idx] if idx < len(p_cap.get("radm", [])) else 0
                row_l.append(radm_val)
            for p in piles:
                pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
                p_cap = caps.get(pid, {})
                radm_dif_val = p_cap.get("radm_dif", [])[idx] if idx < len(p_cap.get("radm_dif", [])) else 0
                row_l.append(radm_dif_val)

            ws_s.append(row_l)
            row_count += 1
            for c_i, v in enumerate(row_l, 1):
                cell = ws_s.cell(row_count, c_i)
                cell.font = font_norm
                cell.border = thin_border
                if isinstance(v, (int, float)):
                    if c_i in [1, 2]:
                        cell.number_format = "0.0"
                    elif c_i in [3, 7]:
                        cell.number_format = "0"
                    elif c_i in [6]:
                        cell.number_format = "0.00"
                    elif c_i in [8]:
                        cell.number_format = "0.0"
                    elif c_i in [13, 14]:
                        cell.number_format = "0.000"
                    elif c_i >= 15:
                        cell.number_format = "#,##0.0" if v < 1000 else "#,##0"
                    cell.alignment = Alignment(horizontal="right")
                else:
                    cell.alignment = Alignment(horizontal="center")

        # Native Excel Geotechnical ScatterCharts (Line Curves with Inverted Depth Axis)
        if row_count > 2:
            yvalues = Reference(ws_s, min_col=2, min_row=2, max_row=row_count)  # End_Depth_m

            # Chart 1: Stratigraphic Profile (N1,60, N60, phi')
            chart1 = ScatterChart()
            chart1.scatterStyle = "line"
            chart1.title = f"{clean_title} - Stratigraphic Profile"
            chart1.style = 13
            chart1.x_axis.title = "SPT Blowcount (N) / Friction Angle (°)"
            chart1.y_axis.title = "Depth z (m)"
            chart1.y_axis.scaling.orientation = "maxMin"
            chart1.width = 14
            chart1.height = 18

            s_n1 = Series(values=yvalues, xvalues=Reference(ws_s, min_col=3, min_row=2, max_row=row_count), title="N1,60")
            s_n1.graphicalProperties.line.solidFill = "2563EB"
            s_n1.graphicalProperties.line.width = 24000
            chart1.series.append(s_n1)

            s_n60 = Series(values=yvalues, xvalues=Reference(ws_s, min_col=7, min_row=2, max_row=row_count), title="N60")
            s_n60.graphicalProperties.line.solidFill = "64748B"
            s_n60.graphicalProperties.line.width = 18000
            chart1.series.append(s_n60)

            s_phi = Series(values=yvalues, xvalues=Reference(ws_s, min_col=8, min_row=2, max_row=row_count), title="phi' (deg)")
            s_phi.graphicalProperties.line.solidFill = "EA580C"
            s_phi.graphicalProperties.line.width = 20000
            chart1.series.append(s_phi)

            pos_col_1 = get_column_letter(len(s_headers) + 2)
            ws_s.add_chart(chart1, f"{pos_col_1}2")

            # Chart 2: Unit Resistances (qs, sigma'v, qp)
            chart2 = ScatterChart()
            chart2.scatterStyle = "line"
            chart2.title = f"{clean_title} - Unit Resistances & Stresses (kPa)"
            chart2.style = 13
            chart2.x_axis.title = "Stress / Unit Resistance (kPa)"
            chart2.y_axis.title = "Depth z (m)"
            chart2.y_axis.scaling.orientation = "maxMin"
            chart2.width = 14
            chart2.height = 18

            s_qs = Series(values=yvalues, xvalues=Reference(ws_s, min_col=15, min_row=2, max_row=row_count), title="Skin Friction qs (kPa)")
            s_qs.graphicalProperties.line.solidFill = "0284C7"
            s_qs.graphicalProperties.line.width = 24000
            chart2.series.append(s_qs)

            s_sigv = Series(values=yvalues, xvalues=Reference(ws_s, min_col=10, min_row=2, max_row=row_count), title="Effective Stress σ'v (kPa)")
            s_sigv.graphicalProperties.line.solidFill = "475569"
            s_sigv.graphicalProperties.line.width = 18000
            chart2.series.append(s_sigv)

            s_qp = Series(values=yvalues, xvalues=Reference(ws_s, min_col=16, min_row=2, max_row=row_count), title="End Bearing qp (kPa)")
            s_qp.graphicalProperties.line.solidFill = "DC2626"
            s_qp.graphicalProperties.line.width = 20000
            chart2.series.append(s_qp)

            pos_col_2 = get_column_letter(len(s_headers) + 12)
            ws_s.add_chart(chart2, f"{pos_col_2}2")

            # Chart 3: Allowable Capacity Radm vs Depth
            chart3 = ScatterChart()
            chart3.scatterStyle = "line"
            chart3.title = f"{clean_title} - Allowable Axial Capacity Radm (kN)"
            chart3.style = 13
            chart3.x_axis.title = "Allowable Axial Capacity Radm (kN)"
            chart3.y_axis.title = "Depth z (m)"
            chart3.y_axis.scaling.orientation = "maxMin"
            chart3.width = 16
            chart3.height = 18

            radm_glob_start = 16 + 2 * len(piles) + 1
            for p_idx, p in enumerate(piles):
                c_idx = radm_glob_start + p_idx
                s_radm = Series(values=yvalues, xvalues=Reference(ws_s, min_col=c_idx, min_row=2, max_row=row_count),
                                title=f"Radm (FS={fs_glob:.1f}) D={p['diam_m']:.2f}m")
                color = line_colors_glob[p_idx % len(line_colors_glob)]
                s_radm.graphicalProperties.line.solidFill = color
                s_radm.graphicalProperties.line.width = 24000
                chart3.series.append(s_radm)

            radm_dif_start = radm_glob_start + len(piles)
            for p_idx, p in enumerate(piles):
                c_idx = radm_dif_start + p_idx
                s_radm_d = Series(values=yvalues, xvalues=Reference(ws_s, min_col=c_idx, min_row=2, max_row=row_count),
                                  title=f"Radm (Diff) D={p['diam_m']:.2f}m")
                color = line_colors_dif[p_idx % len(line_colors_dif)]
                s_radm_d.graphicalProperties.line.solidFill = color
                s_radm_d.graphicalProperties.line.width = 18000
                chart3.series.append(s_radm_d)

            pos_col_3 = get_column_letter(len(s_headers) + 22)
            ws_s.add_chart(chart3, f"{pos_col_3}2")

        for col_idx in range(1, len(s_headers) + 1):
            col_letter = get_column_letter(col_idx)
            ws_s.column_dimensions[col_letter].width = 14

    wb.save(output_path)
    return output_path


def export_sounding_to_pptx(analysis_result: Dict[str, Any], sounding_name: str = None, output_path: str = None) -> str:
    """
    Gera apresentação PowerPoint (.pptx) com os 3 gráficos geotécnicos da sondagem como
    GRÁFICOS NATIVOS do PowerPoint (Office Chart com dados incorporados em planilha interna).
    Permite edição completa das curvas, eixos, cores, fontes e valores diretamente no PowerPoint.
    """
    from pptx import Presentation
    from pptx.chart.data import XyChartData
    from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor

    if not output_path:
        out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "dist"))
        os.makedirs(out_dir, exist_ok=True)
        safe_name = (sounding_name or "todas").replace("/", "_").replace("\\", "_")
        output_path = os.path.join(out_dir, f"perfil_{safe_name}_graficos_editaveis.pptx")

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    soundings_dict = analysis_result.get("soundings", {})
    if not soundings_dict:
        raise ValueError("Nenhum dado de sondagem encontrado no resultado da análise.")

    # Se sounding_name especificado e não for "ALL", processa apenas essa sondagem
    if sounding_name and sounding_name != "ALL" and sounding_name in soundings_dict:
        target_soundings = {sounding_name: soundings_dict[sounding_name]}
    else:
        target_soundings = soundings_dict

    target_load_kn = analysis_result.get("target_load_kN", 21400.0)
    piles = analysis_result.get("piles", [])

    for s_name, s_data in target_soundings.items():
        layers = s_data.get("layers", [])
        if not layers:
            continue

        slide = prs.slides.add_slide(prs.slide_layouts[6])

        # Cabeçalho do Slide
        tx_box = slide.shapes.add_textbox(Inches(0.6), Inches(0.4), Inches(12.133), Inches(0.75))
        tf = tx_box.text_frame
        tf.word_wrap = True

        p_title = tf.paragraphs[0]
        p_title.text = f"Sondagem {s_name} — Perfis Geotécnicos e Capacidade de Carga"
        p_title.font.name = "Arial"
        p_title.font.size = Pt(20)
        p_title.font.bold = True
        p_title.font.color.rgb = RGBColor(30, 41, 59)

        p_sub = tf.add_paragraph()
        max_d = max([l.get("z_fim", 0.0) for l in layers]) if layers else 0.0
        p_sub.text = f"Métodos FHWA GEC-010 / AASHTO / Mayne Beta-Method | Profundidade Máx: {max_d:.1f} m | Carga Alvo = {target_load_kn:,.0f} kN"
        p_sub.font.name = "Arial"
        p_sub.font.size = Pt(11)
        p_sub.font.color.rgb = RGBColor(100, 116, 139)

        chart_y = Inches(1.3)
        chart_h = Inches(5.8)
        chart_w = Inches(3.8)

        # 1. Gráfico Estratigráfico (N1_60, N60, phi)
        cd1 = XyChartData()
        s_n1 = cd1.add_series("N1_60 (Original)")
        s_n60 = cd1.add_series("N60 (Corrigido σ'v)")
        s_phi = cd1.add_series("Atrito φ' (°)")

        for lyr in layers:
            z = float(lyr.get("z_fim", 0.0))
            if lyr.get("n1_60") is not None:
                s_n1.add_data_point(float(lyr["n1_60"]), z)
            if lyr.get("n60") is not None:
                s_n60.add_data_point(float(lyr["n60"]), z)
            if lyr.get("phi_deg") is not None:
                s_phi.add_data_point(float(lyr["phi_deg"]), z)

        chart1_shape = slide.shapes.add_chart(
            XL_CHART_TYPE.XY_SCATTER_LINES_NO_MARKERS,
            Inches(0.6), chart_y, chart_w, chart_h, cd1
        )
        ch1 = chart1_shape.chart
        ch1.has_title = True
        ch1.chart_title.text_frame.text = "Perfil SPT e Atrito φ'"
        ch1.has_legend = True
        ch1.legend.position = XL_LEGEND_POSITION.TOP
        ch1.legend.include_in_layout = False
        ch1.value_axis.reverse_order = True
        ch1.value_axis.has_title = True
        ch1.value_axis.axis_title.text_frame.text = "Profundidade (m)"
        ch1.category_axis.has_title = True
        ch1.category_axis.axis_title.text_frame.text = "Blowcount N_SPT / φ' (°)"

        # 2. Gráfico de Tensões e Resistências (qs, qp, sigma_v)
        cd2 = XyChartData()
        s_qs = cd2.add_series("qs - Atrito Lateral (kPa)")
        s_qp = cd2.add_series("qp - Resistência Ponta (kPa)")
        s_sigv = cd2.add_series("σ'v - Sobrecarga Efetiva (kPa)")

        for lyr in layers:
            z = float(lyr.get("z_fim", 0.0))
            if lyr.get("qs") is not None:
                s_qs.add_data_point(float(lyr["qs"]), z)
            if lyr.get("qp") is not None:
                s_qp.add_data_point(float(lyr["qp"]), z)
            if lyr.get("sigma_v") is not None:
                s_sigv.add_data_point(float(lyr["sigma_v"]), z)

        chart2_shape = slide.shapes.add_chart(
            XL_CHART_TYPE.XY_SCATTER_LINES_NO_MARKERS,
            Inches(4.75), chart_y, chart_w, chart_h, cd2
        )
        ch2 = chart2_shape.chart
        ch2.has_title = True
        ch2.chart_title.text_frame.text = "Resistências qs, qp e Tensão σ'v"
        ch2.has_legend = True
        ch2.legend.position = XL_LEGEND_POSITION.TOP
        ch2.legend.include_in_layout = False
        ch2.value_axis.reverse_order = True
        ch2.value_axis.has_title = True
        ch2.value_axis.axis_title.text_frame.text = "Profundidade (m)"
        ch2.category_axis.has_title = True
        ch2.category_axis.axis_title.text_frame.text = "Resistência / Tensão (kPa)"

        # 3. Gráfico de Capacidade Admissível Radm(z)
        cd3 = XyChartData()
        caps = s_data.get("capacities", {})
        for p in piles:
            pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
            p_cap = caps.get(pid, {})
            p_depths = p_cap.get("depths", [])
            p_radm = p_cap.get("radm", [])
            if p_depths and p_radm:
                s_pile = cd3.add_series(f"Ø {p.get('diam_m', 1.2):.1f}m ({p.get('diam_in', 48)}\")")
                for zi, ri in zip(p_depths, p_radm):
                    s_pile.add_data_point(float(ri), float(zi))

        # Linha vertical da Carga Alvo
        s_tgt = cd3.add_series(f"Carga Alvo ({target_load_kn:,.0f} kN)")
        s_tgt.add_data_point(float(target_load_kn), 0.0)
        s_tgt.add_data_point(float(target_load_kn), float(max_d))

        chart3_shape = slide.shapes.add_chart(
            XL_CHART_TYPE.XY_SCATTER_LINES_NO_MARKERS,
            Inches(8.9), chart_y, chart_w, chart_h, cd3
        )
        ch3 = chart3_shape.chart
        ch3.has_title = True
        ch3.chart_title.text_frame.text = "Capacidade Admissível Radm(z)"
        ch3.has_legend = True
        ch3.legend.position = XL_LEGEND_POSITION.TOP
        ch3.legend.include_in_layout = False
        ch3.value_axis.reverse_order = True
        ch3.value_axis.has_title = True
        ch3.value_axis.axis_title.text_frame.text = "Profundidade (m)"
        ch3.category_axis.has_title = True
        ch3.category_axis.axis_title.text_frame.text = "Capacidade Admissível Radm (kN)"

    prs.save(output_path)
    return output_path


def export_axis_to_pptx(analysis_result: Dict[str, Any], axis_name: str = None, output_path: str = None) -> str:
    """
    Gera apresentação PowerPoint (.pptx) com o gráfico de perfil de capacidade de carga
    para o eixo especificado (ou todos os eixos) como GRÁFICO NATIVO do PowerPoint (Office Chart).
    Permite edição completa das curvas, eixos, cores, fontes e valores diretamente no PowerPoint.
    """
    from pptx import Presentation
    from pptx.chart.data import XyChartData
    from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor

    if not output_path:
        out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "dist"))
        os.makedirs(out_dir, exist_ok=True)
        safe_name = (axis_name or "todos_eixos").replace("/", "_").replace("\\", "_")
        output_path = os.path.join(out_dir, f"perfil_eixo_{safe_name}_graficos_editaveis.pptx")

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    axes_list = analysis_result.get("axes_analysis", [])
    if not axes_list:
        raise ValueError("Nenhum dado de análise por eixo encontrado no resultado da análise.")

    if axis_name and axis_name != "ALL":
        target_axes = [ax for ax in axes_list if ax.get("name") == axis_name]
        if not target_axes:
            target_axes = [axes_list[0]]
    else:
        target_axes = axes_list

    crit_sounding_name = analysis_result.get("critical_sounding_used") or analysis_result.get("critical_sounding", "SPT-01")
    s_data = analysis_result.get("soundings", {}).get(crit_sounding_name, {})
    layers = s_data.get("layers", [])
    if not layers:
        first_s = list(analysis_result.get("soundings", {}).values())
        if first_s:
            layers = first_s[0].get("layers", [])

    piles = analysis_result.get("piles", [])
    fs_glob = analysis_result.get("fs_global", analysis_result.get("fs", 2.0))
    casing_pct = analysis_result.get("casing_reduction_pct", 10.0)
    casing_factor = max(0.0, 1.0 - (casing_pct / 100.0))
    casing_mode = analysis_result.get("casing_reduction_mode", "excel_formula")
    consider_pile_weight = analysis_result.get("consider_pile_weight", False)
    conc_g = float(analysis_result.get("concrete_unit_weight", 24.0))
    water_g = float(analysis_result.get("water_unit_weight", 10.0))
    gamma_sub_conc = max(0.0, conc_g - water_g)
    wt = float(analysis_result.get("water_table_m", 3.0))
    pile_len_above_global = float(analysis_result.get("pile_length_above_start_m", 0.0))

    for ax in target_axes:
        ax_name = ax.get("name", "A")
        cota_topo = ax.get("cota_topo_m", ax.get("cota_inicio_m", 0.0))
        target_load = ax.get("target_load_kN") or analysis_result.get("target_load_kN", 21400.0)
        casing_len = ax.get("casing_length_m", analysis_result.get("casing_length_m"))
        ax_len_above = float(ax.get("pile_length_above_start_m") if ax.get("pile_length_above_start_m") is not None else pile_len_above_global)
        ax_layers = ax.get("layers") or layers

        slide = prs.slides.add_slide(prs.slide_layouts[6])

        # Cabeçalho
        tx_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(11.733), Inches(0.85))
        tf = tx_box.text_frame
        tf.word_wrap = True

        p_title = tf.paragraphs[0]
        p_title.text = f"Eixo {ax_name} — Perfil de Capacidade de Carga vs Cota de Fundo"
        p_title.font.name = "Arial"
        p_title.font.size = Pt(20)
        p_title.font.bold = True
        p_title.font.color.rgb = RGBColor(30, 41, 59)

        p_sub = tf.add_paragraph()
        casing_str = f"Camisa metálica: -{casing_pct:.0f}%" + (f" ({casing_len:.1f}m)" if casing_len else "")
        above_str = f" | L_acima = {ax_len_above:.2f} m" if ax_len_above > 0 else ""
        net_str = " (Net - com Peso Próprio)" if consider_pile_weight else ""
        p_sub.text = f"Cota de Topo = {cota_topo:.2f} m | Carga Alvo = {target_load:,.0f} kN | Sondagem Governante: {crit_sounding_name} | {casing_str}{above_str}{net_str}"
        p_sub.font.name = "Arial"
        p_sub.font.size = Pt(11)
        p_sub.font.color.rgb = RGBColor(100, 116, 139)

        # Gráfico Central Ampliado Widescreen
        cd = XyChartData()
        max_depth = max([l.get("z_fim", 65.0) for l in ax_layers]) if ax_layers else 65.0

        for p in piles:
            pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
            diam_m = p.get("diam_m", 1.2)
            perim = p.get("perimeter_m", 3.76)
            area = p.get("area_m2", 1.13)

            s_pile = cd.add_series(f"Ø {diam_m:.2f} m ({p.get('diam_in', 48)}\") - FS={fs_glob:.1f}")

            w_above = area * ax_len_above * gamma_sub_conc if ax_len_above > 0 else 0.0
            sum_rs = 0.0
            sum_w = w_above
            for lyr in ax_layers:
                z_ini = lyr.get("z_ini", 0.0)
                z_fim = lyr.get("z_fim", 0.0)
                dz = lyr.get("dz", max(0.0, z_fim - z_ini))
                if z_fim <= cota_topo:
                    continue

                zA = max(z_ini, cota_topo)
                zB = z_fim
                eff_dz = max(0.0, zB - zA)
                if eff_dz <= 0:
                    continue

                rp = lyr.get("qp", 0.0) * area

                if casing_len is not None and casing_len >= 0:
                    casing_end = cota_topo + casing_len
                    cased_dz = max(0.0, min(zB, casing_end) - zA)
                    uncased_dz = max(0.0, eff_dz - cased_dz)
                    sum_rs += lyr.get("qs", 0.0) * perim * (cased_dz * casing_factor + uncased_dz * 1.0)
                    rn = rp + sum_rs
                    radm_gross = rn / fs_glob
                else:
                    rs_seg = lyr.get("qs", 0.0) * perim * dz
                    if casing_mode == "lateral_only":
                        rs_seg *= casing_factor
                    sum_rs += rs_seg
                    rn = rp + sum_rs
                    if casing_mode == "excel_formula":
                        radm_gross = (rn / fs_glob) * casing_factor
                    else:
                        radm_gross = rn / fs_glob

                if zB <= wt:
                    eff_g = conc_g
                elif zA >= wt:
                    eff_g = gamma_sub_conc
                else:
                    eff_g = (max(0.0, wt - zA) * conc_g + max(0.0, zB - wt) * gamma_sub_conc) / eff_dz
                sum_w += area * eff_dz * eff_g

                radm = max(0.0, radm_gross - sum_w) if consider_pile_weight else radm_gross
                s_pile.add_data_point(float(round(radm, 1)), float(z_fim))

        # Linha Carga Alvo
        s_target = cd.add_series(f"Carga Alvo ({target_load:,.0f} kN)")
        s_target.add_data_point(float(target_load), float(cota_topo))
        s_target.add_data_point(float(target_load), float(max_depth))

        # Linha Cota de Topo
        s_topo = cd.add_series(f"Cota de Topo ({cota_topo:.2f} m)")
        s_topo.add_data_point(0.0, float(cota_topo))
        s_topo.add_data_point(float(target_load * 1.3), float(cota_topo))

        chart_shape = slide.shapes.add_chart(
            XL_CHART_TYPE.XY_SCATTER_LINES_NO_MARKERS,
            Inches(1.2), Inches(1.4), Inches(10.9), Inches(5.6), cd
        )
        ch = chart_shape.chart
        ch.has_title = True
        ch.chart_title.text_frame.text = f"Curvas de Capacidade Admissível Radm — Eixo {ax_name} (Comparativo de Diâmetros)"
        ch.has_legend = True
        ch.legend.position = XL_LEGEND_POSITION.TOP
        ch.legend.include_in_layout = False
        ch.value_axis.reverse_order = True
        ch.value_axis.has_title = True
        ch.value_axis.axis_title.text_frame.text = "Cota de Fundo da Estaca (m)"
        ch.category_axis.has_title = True
        ch.category_axis.axis_title.text_frame.text = "Capacidade Admissível Radm (kN)"

        # Slides específicos para cada diâmetro: Amostragem Separada (Lateral, Ponta e Total)
        for p in piles:
            diam_m = p.get("diam_m", 1.2)
            diam_in = p.get("diam_in", round(diam_m / 0.0254))
            perim = p.get("perimeter_m", 3.76)
            area = p.get("area_m2", 1.13)

            slide_p = prs.slides.add_slide(prs.slide_layouts[6])

            tx_p = slide_p.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(11.733), Inches(0.85))
            tf_p = tx_p.text_frame
            tf_p.word_wrap = True

            p_t = tf_p.paragraphs[0]
            p_t.text = f"Eixo {ax_name} — Ø {diam_m:.2f} m ({diam_in:.0f}\") — Amostragem Separada: Lateral, Ponta e Total"
            p_t.font.name = "Arial"
            p_t.font.size = Pt(18)
            p_t.font.bold = True
            p_t.font.color.rgb = RGBColor(30, 41, 59)

            p_s = tf_p.add_paragraph()
            p_s.text = f"Decomposição das parcelas de resistência lateral acumulada (Rs) e ponta (Rp) ao longo da profundidade | FSs = {analysis_result.get('fs_lateral', 1.5):.1f}, FSp = {analysis_result.get('fs_ponta', 3.0):.1f}"
            p_s.font.name = "Arial"
            p_s.font.size = Pt(11)
            p_s.font.color.rgb = RGBColor(100, 116, 139)

            cd_p = XyChartData()
            s_tot_p = cd_p.add_series("Capacidade Total Radm (kN)")
            s_lat_p = cd_p.add_series("Resistência Lateral Acumulada Rs_adm (kN)")
            s_tip_p = cd_p.add_series("Resistência de Ponta Rp_adm (kN)")

            fs_lat_val = float(analysis_result.get("fs_lateral", 1.5))
            fs_tip_val = float(analysis_result.get("fs_ponta", 3.0))

            w_above = area * ax_len_above * gamma_sub_conc if ax_len_above > 0 else 0.0
            sum_rs_p = 0.0
            sum_w_p = w_above

            for lyr in layers:
                z_ini = lyr.get("z_ini", 0.0)
                z_fim = lyr.get("z_fim", 0.0)
                dz = lyr.get("dz", max(0.0, z_fim - z_ini))
                if z_fim <= cota_topo:
                    continue

                zA = max(z_ini, cota_topo)
                zB = z_fim
                eff_dz = max(0.0, zB - zA)
                if eff_dz <= 0:
                    continue

                rp = lyr.get("qp", 0.0) * area

                if casing_len is not None and casing_len >= 0:
                    casing_end = cota_topo + casing_len
                    cased_dz = max(0.0, min(zB, casing_end) - zA)
                    uncased_dz = max(0.0, eff_dz - cased_dz)
                    sum_rs_p += lyr.get("qs", 0.0) * perim * (cased_dz * casing_factor + uncased_dz * 1.0)
                    radm_gross_p = (sum_rs_p / fs_lat_val) + (rp / fs_tip_val)
                    rs_adm_p = sum_rs_p / fs_lat_val
                    rp_adm_p = rp / fs_tip_val
                else:
                    rs_seg = lyr.get("qs", 0.0) * perim * dz
                    if casing_mode == "lateral_only":
                        rs_seg *= casing_factor
                    sum_rs_p += rs_seg
                    if casing_mode == "excel_formula":
                        radm_gross_p = ((sum_rs_p / fs_lat_val) + (rp / fs_tip_val)) * casing_factor
                        rs_adm_p = (sum_rs_p / fs_lat_val) * casing_factor
                        rp_adm_p = (rp / fs_tip_val) * casing_factor
                    else:
                        radm_gross_p = (sum_rs_p / fs_lat_val) + (rp / fs_tip_val)
                        rs_adm_p = sum_rs_p / fs_lat_val
                        rp_adm_p = rp / fs_tip_val

                if zB <= wt:
                    eff_g = conc_g
                elif zA >= wt:
                    eff_g = gamma_sub_conc
                else:
                    eff_g = (max(0.0, wt - zA) * conc_g + max(0.0, zB - wt) * gamma_sub_conc) / eff_dz
                sum_w_p += area * eff_dz * eff_g

                radm_p = max(0.0, radm_gross_p - sum_w_p) if consider_pile_weight else radm_gross_p

                s_tot_p.add_data_point(float(round(radm_p, 1)), float(z_fim))
                s_lat_p.add_data_point(float(round(rs_adm_p, 1)), float(z_fim))
                s_tip_p.add_data_point(float(round(rp_adm_p, 1)), float(z_fim))

            # Referências
            s_tgt_p = cd_p.add_series(f"Carga Alvo ({target_load:,.0f} kN)")
            s_tgt_p.add_data_point(float(target_load), float(cota_topo))
            s_tgt_p.add_data_point(float(target_load), float(max_depth))

            s_topo_p = cd_p.add_series(f"Cota de Topo ({cota_topo:.2f} m)")
            s_topo_p.add_data_point(0.0, float(cota_topo))
            s_topo_p.add_data_point(float(target_load * 1.3), float(cota_topo))

            ch_p_shape = slide_p.shapes.add_chart(
                XL_CHART_TYPE.XY_SCATTER_LINES_NO_MARKERS,
                Inches(1.2), Inches(1.4), Inches(10.9), Inches(5.6), cd_p
            )
            ch_p = ch_p_shape.chart
            ch_p.has_title = True
            ch_p.chart_title.text_frame.text = f"Eixo {ax_name} — Ø {diam_m:.2f} m: Lateral, Ponta e Total"
            ch_p.has_legend = True
            ch_p.legend.position = XL_LEGEND_POSITION.TOP
            ch_p.legend.include_in_layout = False
            ch_p.value_axis.reverse_order = True
            ch_p.value_axis.has_title = True
            ch_p.value_axis.axis_title.text_frame.text = "Cota de Fundo da Estaca (m)"
            ch_p.category_axis.has_title = True
            ch_p.category_axis.axis_title.text_frame.text = "Capacidade (kN)"

    prs.save(output_path)
    return output_path


