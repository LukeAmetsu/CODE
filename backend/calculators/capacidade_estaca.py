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
from typing import List, Dict, Any, Optional, Tuple
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
        "name": "Estaca D=1.20m (48\")",
        "diam_in": 48.0,
        "diam_m": 1.20,
        "perimeter_m": 3.76,  # =ROUNDDOWN(1.2 * PI, 2)
        "area_m2": 1.13       # =ROUNDDOWN(PI * (1.2/2)^2, 2)
    },
    {
        "id": "pile_54in",
        "name": "Estaca D=1.30m (54\")",
        "diam_in": 54.0,
        "diam_m": 1.30,
        "perimeter_m": 4.08,  # =ROUNDDOWN(1.3 * PI, 2)
        "area_m2": 1.32       # =ROUNDDOWN(PI * (1.3/2)^2, 2)
    },
    {
        "id": "pile_60in",
        "name": "Estaca D=1.50m (60\")",
        "diam_in": 60.0,
        "diam_m": 1.50,
        "perimeter_m": 4.71,  # =ROUNDDOWN(1.5 * PI, 2)
        "area_m2": 1.76       # =ROUNDDOWN(PI * (1.5/2)^2, 2)
    }
]

# Eixos da nova versão da planilha (Cota TOPO: Eixo C agora é 14.40m)
DEFAULT_AXES = [
    {"name": "A", "cota_inicio_m": 20.75, "target_load_kN": 21400.0},
    {"name": "B", "cota_inicio_m": 19.00, "target_load_kN": 21400.0},
    {"name": "C", "cota_inicio_m": 14.40, "target_load_kN": 21400.0},
    {"name": "D", "cota_inicio_m": 9.35, "target_load_kN": 21400.0},
    {"name": "E", "cota_inicio_m": 4.60, "target_load_kN": 21400.0}
]

DEFAULT_MODEL_FACTORS = {
    "fs": 2.0,                                   # Fator de Segurança global (padrão 2.0)
    "fs_lateral": 1.5,                           # Fator de Segurança para atrito lateral (padrão 1.5)
    "fs_ponta": 3.0,                             # Fator de Segurança para resistência de ponta (padrão 3.0)
    "casing_reduction_pct": 10.0,                # Redução da camisa metálica em % (padrão 10% -> fator 0.90)
    "casing_reduction_mode": "excel_formula",     # 'excel_formula' (Radm * (1 - red)) ou 'lateral_only' (Rs * (1 - red))
    "casing_length_m": None,                     # Extensão da camisa metálica em metros (None = estaca inteira)
    "apply_beta_fhwa_limit": True,               # Critério FHWA 10-13 (beta <= Kp*tan(phi') e limite 900 psf raso)
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
    "extrapolation_soil_group": "auto"           # 'auto' = busca o solo mais comum da sondagem
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
    measured_depth_m: float = 44.4,
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
    beta_cap_kp_tan_phi: bool = True
) -> Dict[str, Any]:
    """
    Calcula detalhadamente as estimativas geotécnicas do solo extrapolado:
    - Solo modal da sondagem (sem hardcode)
    - Percentil de N60 e estatísticas (média, mediana)
    - Parâmetros derivados: phi', gamma, qs médio, qp médio
    - Trecho e camadas sintetizadas
    """
    measured_layers = [
        l for l in layers
        if float(l.get("z_fim", 0.0)) <= measured_depth_m + 1e-4
    ]
    if not measured_layers:
        measured_layers = list(layers)
        measured_depth_m = max([float(l.get("z_fim", 0.0)) for l in measured_layers]) if measured_layers else 0.0

    groups = [l.get("soil_group", "") for l in measured_layers if l.get("soil_group")]
    group_counts = dict(Counter(groups))
    modal_group = Counter(groups).most_common(1)[0][0] if groups else "Areias"
    modal_count = Counter(groups).most_common(1)[0][1] if groups else 0
    modal_pct = round((modal_count / max(1, len(groups))) * 100.0, 1)

    sucs_list = [l.get("sucs", "") for l in measured_layers if l.get("sucs")]
    modal_sucs = Counter(sucs_list).most_common(1)[0][0] if sucs_list else "SP-SM"

    adopted_group = forced_soil_group if (forced_soil_group and forced_soil_group != "auto") else modal_group

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
        measured_depth_m=measured_depth_m,
        n_percentile=n_percentile,
        max_depth_m=max_depth_m,
        forced_soil_group=adopted_group
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
        beta_cap_kp_tan_phi=beta_cap_kp_tan_phi
    )

    synth_layers = [l for l in proc_layers if l.get("is_extrapolated") or l["z_fim"] > measured_depth_m + 1e-4]
    extrap_len = max(0.0, max_depth_m - measured_depth_m)
    num_layers = len(synth_layers) if synth_layers else int(round(extrap_len / 0.6))

    avg_qs = round(float(np.mean([l["qs"] for l in synth_layers])), 1) if synth_layers else 0.0
    avg_qp = round(float(np.mean([l["qp"] for l in synth_layers])), 1) if synth_layers else 0.0
    min_qs = round(float(min([l["qs"] for l in synth_layers])), 1) if synth_layers else 0.0
    max_qs = round(float(max([l["qs"] for l in synth_layers])), 1) if synth_layers else 0.0

    return {
        "base_depth_m": round(measured_depth_m, 2),
        "max_depth_m": round(max_depth_m, 2),
        "extrapolated_length_m": round(extrap_len, 2),
        "num_extrapolated_layers": num_layers,
        "modal_soil_group": modal_group,
        "modal_soil_count": modal_count,
        "total_measured_layers": len(groups),
        "modal_soil_pct": modal_pct,
        "modal_sucs": modal_sucs,
        "adopted_soil_group": adopted_group,
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
    measured_depth_m: float = 44.4,
    n_percentile: float = 15.0,
    max_depth_m: float = 132.6,
    forced_soil_group: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Mantém as camadas reais medidas até measured_depth_m e sintetiza camadas profundas
    além de measured_depth_m baseando-se no tipo de solo mais comum na sondagem e em um
    percentil de N60/Nspt da sondagem medida.
    """
    step_dz = 0.6
    # 1. Filtra camadas reais até a profundidade medida
    measured_layers = [
        l for l in layers
        if float(l.get("z_fim", 0.0)) <= measured_depth_m + 1e-4
    ]
    if not measured_layers:
        measured_layers = list(layers)
        measured_depth_m = max([float(l.get("z_fim", 0.0)) for l in measured_layers]) if measured_layers else 0.0

    # 2. Identifica tipo de solo mais comum e SUCS mais comum
    groups = [l.get("soil_group", "Areias") for l in measured_layers if l.get("soil_group")]
    modal_group = forced_soil_group if (forced_soil_group and forced_soil_group != "auto") else (Counter(groups).most_common(1)[0][0] if groups else "Areias")

    sucs_list = [l.get("sucs", "") for l in measured_layers if l.get("sucs")]
    modal_sucs = Counter(sucs_list).most_common(1)[0][0] if sucs_list else "SP-SM"

    # 3. Calcula percentil de N60 / N_spt nas camadas medidas
    n_vals = [float(l.get("n1_60", l.get("nspt", 10.0))) for l in measured_layers]
    if n_vals:
        n_extrap = int(round(float(np.percentile(n_vals, n_percentile))))
    else:
        n_extrap = 27
    n_extrap = max(1, n_extrap)

    # 4. Constrói a lista final: medidas + extrapoladas
    final_layers = []
    for l in measured_layers:
        item = dict(l)
        item["is_extrapolated"] = False
        final_layers.append(item)

    current_z = measured_depth_m
    while current_z + 1e-4 < max_depth_m:
        z_next = round(current_z + step_dz, 2)
        final_layers.append({
            "z_ini": round(current_z, 2),
            "z_fim": z_next,
            "n1_60": n_extrap,
            "soil_group": modal_group,
            "sucs": modal_sucs,
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
    beta_cap_kp_tan_phi: bool = True
) -> List[Dict[str, Any]]:
    """
    Calcula tensões verticais efetivas no ponto médio, parâmetros de sobrecarga,
    ângulo de atrito, tensão de pré-adensamento e resistências unitárias qs e qp.
    Inclui o critério da Equação 10-13 do FHWA GEC 010:
      beta <= Kp * tan(phi') e limitação para profundidades rasas (sigma'_v >= 900 psf ~ 43.1 kPa).
    """
    if soil_groups is None:
        soil_groups = DEFAULT_SOIL_GROUPS

    processed_layers = []
    sigma_v_prev = 0.0

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
            sigma_v = (dz / 2.0) * gamma
        else:
            prev_lyr = processed_layers[idx - 1]
            prev_dz = prev_lyr["dz"]
            prev_gamma = prev_lyr["gamma"]
            sigma_v = sigma_v_prev + (prev_dz / 2.0) * prev_gamma + (dz / 2.0) * gamma

        sigma_v_prev = sigma_v

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

        # Aplicação do critério FHWA GEC 010 Equação 10-13:
        # beta <= Kp * tan(phi') e limitação para profundidades rasas (sigma'_v >= 900 psf ~ 43.1 kPa)
        if apply_beta_fhwa_limit:
            sigma_v_beta = max(sigma_v, beta_shallow_stress_limit_kpa)
            ocr_ratio_beta = max(sigma_p / max(sigma_v_beta, 0.01), 0.01)
            beta_calc = (1.0 - sin_phi) * (ocr_ratio_beta ** sin_phi) * tan_phi
            if beta_cap_kp_tan_phi:
                beta = min(beta_calc, kp_tan_phi)
            else:
                beta = beta_calc
            beta_capped = (beta < (beta_raw - 1e-4))
        else:
            beta = beta_raw
            beta_capped = False

        # Resistência lateral unitária qs
        qs = beta * sigma_v

        # Resistência de ponta unitária qp
        term = (n60 * pa_kpa / max(sigma_v, 0.01))
        qp = kp_base * (term ** 0.8) * sigma_v

        layer_data = {
            "index": idx,
            "z_ini": round(z_ini, 3),
            "z_fim": round(z_fim, 3),
            "dz": round(dz, 3),
            "z_mid": round(z_ini + dz / 2.0, 3),
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
            "qs": round(qs, 3),
            "qp": round(qp, 3),
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
    casing_length_m: Optional[float] = None
) -> Dict[str, Any]:
    """
    Calcula as capacidades ao longo da profundidade para cada estaca.
    Apresenta tanto o Método Global (FS único) quanto o Método Diferenciado (FS_s e FS_p distintos):
      - Global: Radm_glob = floor(Rn / FS) * casing_factor
      - Diferenciado: Radm_dif = floor((Rs / FS_s) + (Rp / FS_p)) * casing_factor
    Caso casing_length_m seja especificado (> 0), a redução da camisa metálica incide apenas
    nos primeiros casing_length_m a partir da cota de início (start_depth_m).
    """
    if piles is None:
        piles = DEFAULT_PILES

    casing_factor = max(0.0, 1.0 - (casing_reduction_pct / 100.0))

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

        sum_rs = 0.0
        depth_for_target = None
        depth_for_target_dif = None
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

            sum_rs += rs_seg
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

            if rn > max_rn:
                max_rn = rn
                max_radm = radm
                max_radm_dif = radm_dif
                depth_at_max = z_fim

            if depth_for_target is None and radm >= target_load_kN:
                depth_for_target = z_fim

            if depth_for_target_dif is None and radm_dif >= target_load_kN:
                depth_for_target_dif = z_fim

            depths.append(z_fim)
            rs_segments.append(round(rs_seg, 2))
            rs_cum_list.append(round(sum_rs, 2))
            rp_list.append(round(rp, 2))
            rn_list.append(round(rn, 2))
            radm_list.append(round(radm, 1))
            radm_dif_list.append(round(radm_dif, 1))

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
            "radm": radm_list,
            "radm_global": radm_list,
            "radm_dif": radm_dif_list,
            "max_rn": round(max_rn, 2),
            "max_radm": round(max_radm, 1),
            "max_radm_global": round(max_radm, 1),
            "max_radm_dif": round(max_radm_dif, 1),
            "depth_at_max": depth_at_max,
            "depth_for_target": depth_for_target,
            "depth_for_target_global": depth_for_target,
            "depth_for_target_dif": depth_for_target_dif,
            "reached_target": (depth_for_target is not None),
            "reached_target_dif": (depth_for_target_dif is not None)
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
    beta_cap_kp_tan_phi: bool = True
) -> List[Dict[str, Any]]:
    """
    Calcula a capacidade axial considerando a Cota TOPO de cada eixo e a redução por camisa metálica.
    Calcula Cotas de Fundo e Embutimentos Úteis para AMBOS os critérios de segurança:
      - Caso A: FS Global (FS = 2.0 padrão da planilha)
      - Caso B: FS Diferenciado (FS_s lateral e FS_p ponta)
    Caso casing_length_m seja especificado (> 0), a redução da camisa metálica incide apenas
    nos primeiros casing_length_m a partir da cota de início/TOPO de cada eixo.
    """
    proc_layers = calculate_layer_stresses_and_strengths(
        sounding_layers,
        water_table_m=water_table_m,
        soil_groups=soil_groups,
        kp_base=kp_base,
        pa_kpa=pa_kpa,
        cn_max=cn_max,
        apply_beta_fhwa_limit=apply_beta_fhwa_limit,
        beta_shallow_stress_limit_kpa=beta_shallow_stress_limit_kpa,
        beta_cap_kp_tan_phi=beta_cap_kp_tan_phi
    )

    casing_factor = max(0.0, 1.0 - (casing_reduction_pct / 100.0))
    safe_fs_s = max(0.1, fs_lateral)
    safe_fs_p = max(0.1, fs_ponta)

    results = []
    for ax in axes:
        axis_name = ax.get("name", "Eixo")
        cota_topo = float(ax.get("cota_inicio_m", ax.get("cota_topo_m", 0.0)))
        p_target = float(ax.get("target_load_kN", target_load_kN))
        casing_len = ax.get("casing_length_m", casing_length_m)
        if casing_len is not None:
            try:
                casing_len = float(casing_len)
            except (ValueError, TypeError):
                casing_len = None

        # Determina primeira cota de discretização (múltiplo de 0.6 superior ou igual à cota topo)
        step_dz = 0.6
        first_prof = round(math.ceil(round(cota_topo, 4) / step_dz) * step_dz, 2)
        start_row_idx = round(first_prof / step_dz)

        axis_info = {
            "name": axis_name,
            "cota_topo_m": round(cota_topo, 2),
            "cota_inicio_m": round(cota_topo, 2),
            "target_load_kN": round(p_target, 2),
            "casing_reduction_pct": casing_reduction_pct,
            "casing_factor": round(casing_factor, 2),
            "casing_length_m": casing_len,
            "fs_global": fs,
            "fs_lateral": safe_fs_s,
            "fs_ponta": safe_fs_p,
            "piles": {}
        }

        for p in piles:
            pid = p.get("id", f"pile_{p.get('diam_m', 1.0)}m")
            perimeter = float(p.get("perimeter_m", 3.76))
            area = float(p.get("area_m2", 1.13))

            sum_rs = 0.0
            depth_fundo_glob = None
            depth_fundo_dif = None
            max_radm_glob = 0.0
            max_radm_dif = 0.0

            # Soma incremental a partir da camada inicial (idêntica ao Excel: SUM(N$37:N37))
            max_steps = len(proc_layers) - start_row_idx
            for step in range(max_steps):
                idx = start_row_idx + step
                if idx >= len(proc_layers):
                    break
                lyr = proc_layers[idx]
                prof = first_prof + step * step_dz
                dz = lyr["dz"]

                if casing_len is not None and casing_len >= 0:
                    z_a = max(lyr["z_ini"], cota_topo)
                    z_b = lyr["z_fim"]
                    eff_dz = max(0.0, z_b - z_a)
                    casing_end = cota_topo + casing_len
                    cased_dz = max(0.0, min(z_b, casing_end) - z_a)
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

                if radm_glob > max_radm_glob:
                    max_radm_glob = radm_glob
                if radm_dif > max_radm_dif:
                    max_radm_dif = radm_dif

                if depth_fundo_glob is None and radm_glob >= p_target:
                    depth_fundo_glob = prof

                if depth_fundo_dif is None and radm_dif >= p_target:
                    depth_fundo_dif = prof

            emb_glob = (depth_fundo_glob - cota_topo) if depth_fundo_glob is not None else None
            emb_dif = (depth_fundo_dif - cota_topo) if depth_fundo_dif is not None else None

            axis_info["piles"][pid] = {
                "name": p.get("name", pid),
                "diam_m": p.get("diam_m", 1.0),
                # Global (Padrão da planilha)
                "cota_fundo_m": round(depth_fundo_glob, 1) if depth_fundo_glob is not None else "N/A",
                "embutimento_m": round(emb_glob, 2) if emb_glob is not None else "N/A",
                "comprimento_util_m": round(emb_glob, 2) if emb_glob is not None else "N/A",
                "cota_fundo_global_m": round(depth_fundo_glob, 1) if depth_fundo_glob is not None else "N/A",
                "embutimento_global_m": round(emb_glob, 2) if emb_glob is not None else "N/A",
                "reached_target": (depth_fundo_glob is not None),
                "max_radm": round(max_radm_glob, 1),
                "max_radm_global": round(max_radm_glob, 1),
                # Diferenciado (FS_s e FS_p)
                "cota_fundo_dif_m": round(depth_fundo_dif, 1) if depth_fundo_dif is not None else "N/A",
                "embutimento_dif_m": round(emb_dif, 2) if emb_dif is not None else "N/A",
                "reached_target_dif": (depth_fundo_dif is not None),
                "max_radm_dif": round(max_radm_dif, 1)
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
    fs = float(payload.get("fs", payload.get("fs_global", 2.0)))
    fs_lateral = float(payload.get("fs_lateral", payload.get("fs_s", 1.5)))
    fs_ponta = float(payload.get("fs_ponta", payload.get("fs_p", 3.0)))

    apply_beta_fhwa_limit = bool(payload.get("apply_beta_fhwa_limit", True))
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

    # Alvo da extrapolação: sondagem que atinge a menor profundidade (normalmente SPT-01)
    target_extrap_sounding = "SPT-01" if "SPT-01" in soundings else min_test_sounding

    # Extrapolação das sondagens caso ativado
    prepared_soundings = {}
    for s_name, s_layers in soundings.items():
        if extrapolate_soundings and s_name == target_extrap_sounding:
            prepared_soundings[s_name] = extrapolate_sounding_layers(
                s_layers,
                measured_depth_m=base_depth_m,
                n_percentile=extrapolation_n_percentile,
                max_depth_m=extrapolation_max_depth_m,
                forced_soil_group=None if extrapolation_soil_group == "auto" else extrapolation_soil_group
            )
        else:
            prepared_soundings[s_name] = s_layers

    # Estimativas detalhadas da camada extrapolada
    extrapolation_estimates = None
    if target_extrap_sounding in soundings:
        extrapolation_estimates = compute_extrapolation_estimates(
            soundings[target_extrap_sounding],
            measured_depth_m=base_depth_m,
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
            beta_cap_kp_tan_phi=beta_cap_kp_tan_phi
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
            beta_cap_kp_tan_phi=beta_cap_kp_tan_phi
        )
        cap_results = calculate_pile_capacities(
            proc_layers,
            piles=piles,
            fs=fs,
            fs_lateral=fs_lateral,
            fs_ponta=fs_ponta,
            start_depth_m=0.0,
            target_load_kN=target_load_kN,
            casing_reduction_pct=0.0  # Na tabela geral de sondagens sem camisa
        )

        analyzed_soundings[s_name] = {
            "name": s_name,
            "layers": proc_layers,
            "capacities": cap_results
        }

        # Linha para a tabela resumo
        row = {"sounding_name": s_name, "piles": {}}
        for pid, pdata in cap_results.items():
            row["piles"][pid] = {
                "diam_m": pdata["diam_m"],
                "max_rn_kN": pdata["max_rn"],
                "max_radm_kN": pdata["max_radm"],
                "max_radm_global_kN": pdata["max_radm_global"],
                "max_radm_dif_kN": pdata["max_radm_dif"],
                "depth_at_max_m": pdata["depth_at_max"],
                "depth_for_target_m": pdata["depth_for_target"] if pdata["depth_for_target"] is not None else "N/A",
                "depth_for_target_global_m": pdata["depth_for_target_global"] if pdata["depth_for_target_global"] is not None else "N/A",
                "depth_for_target_dif_m": pdata["depth_for_target_dif"] if pdata["depth_for_target_dif"] is not None else "N/A"
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
        beta_cap_kp_tan_phi=beta_cap_kp_tan_phi
    )

    return {
        "success": True,
        "fs": fs,
        "fs_global": fs,
        "fs_lateral": fs_lateral,
        "fs_ponta": fs_ponta,
        "apply_beta_fhwa_limit": apply_beta_fhwa_limit,
        "beta_shallow_stress_limit_kpa": beta_shallow_stress_limit_kpa,
        "extrapolate_soundings": extrapolate_soundings,
        "base_depth_m": base_depth_m,
        "spt01_measured_depth_m": base_depth_m,
        "min_test_depth_m": min_test_depth,
        "min_test_sounding": min_test_sounding,
        "sounding_depths": sounding_depths,
        "extrapolation_estimates": extrapolation_estimates,
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
        "apply_beta_fhwa_limit": True,
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
        "critical_sounding": "SPT-01",
        "soil_groups": DEFAULT_SOIL_GROUPS,
        "piles": DEFAULT_PILES,
        "axes": DEFAULT_AXES,
        "soundings": {}
    }


def extract_data_from_excel(excel_path: str) -> Dict[str, Any]:
    """
    Extrai todos os dados da versão atualizada de Refs/capacidade estaca.xlsx
    """
    import openpyxl

    wb = openpyxl.load_workbook(excel_path, data_only=True)

    # 1. Soil groups
    ws_aux = wb["TABELA AUXILIAR"]
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

    # 4. Eixos da aba 'Capacidade por eixo'
    axes = []
    if "Capacidade por eixo" in wb.sheetnames:
        ws_eixo = wb["Capacidade por eixo"]
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
    Gera a planilha Excel atualizada:
    - ABA 'TABELA AUXILIAR' com comparativo FS Global (FS=2) vs FS Diferenciado (FS_s / FS_p)
    - ABA 'Capacidade por eixo' com Cota TOPO, Fundo e Embutimento para ambos os critérios
    - Abas individuais para SPT-01 a SPT-06 e SPT médio com beta_raw, Kp*tan(phi'), beta e Radm de ambos os métodos
    """
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    font_bold = Font(name="Calibri", size=10, bold=True)
    font_norm = Font(name="Calibri", size=10)

    fs_glob = analysis_result.get("fs_global", analysis_result.get("fs", 2.0))
    fs_s = analysis_result.get("fs_lateral", 1.5)
    fs_p = analysis_result.get("fs_ponta", 3.0)
    target_load = analysis_result.get("target_load_kN", 21400.0)

    # 1. TABELA AUXILIAR
    ws_aux = wb.create_sheet(title="TABELA AUXILIAR")
    ws_aux.append(["Grupo Solo", "Peso (kN/m³)", "Peso sub (kN/m³)", "", "", "", "Estacas - Propriedades geométricas", "", "", ""])
    ws_aux.append(["", "", "", "", "", "", "Diameter (in)", "Diametro (m)", "Perímetro (m)", "Área (m²)"])

    r_idx = 3
    for grp, p in analysis_result.get("soil_groups", {}).items():
        ws_aux.cell(r_idx, 1, grp)
        ws_aux.cell(r_idx, 2, p.get("gamma_dry", 18.0))
        ws_aux.cell(r_idx, 3, p.get("gamma_sub", 10.0))
        r_idx += 1

    r_idx_p = 3
    for p in analysis_result.get("piles", []):
        ws_aux.cell(r_idx_p, 7, p.get("diam_in", 48))
        ws_aux.cell(r_idx_p, 8, p.get("diam_m", 1.2))
        ws_aux.cell(r_idx_p, 9, p.get("perimeter_m", 3.76))
        ws_aux.cell(r_idx_p, 10, p.get("area_m2", 1.13))
        r_idx_p += 1

    casing_p = analysis_result.get("casing_reduction_pct", 10.0)
    casing_l = analysis_result.get("casing_length_m")
    casing_info_str = f" | Camisa: -{casing_p:.0f}% ({casing_l:.1f}m)" if casing_l is not None else f" | Camisa: -{casing_p:.0f}%"
    ws_aux.cell(10, 1, f"Carga Alvo: {target_load:,.0f} kN | Critério 1: FS Global = {fs_glob:.2f} | Critério 2: FS Lateral = {fs_s:.2f} e FS Ponta = {fs_p:.2f}{casing_info_str}").font = font_norm

    piles = analysis_result.get("piles", [])
    headers_resumo_1 = ["Sondagem"]
    headers_resumo_2 = [""]
    for title in [
        "Resistência Última Rn (kN)",
        f"Radm Global (kN - FS={fs_glob:.1f})",
        f"Radm Diferenciado (kN - FSs={fs_s:.1f}, FSp={fs_p:.1f})",
        f"Prof. Alvo Global ({target_load:,.0f} kN)",
        f"Prof. Alvo Diferenciado ({target_load:,.0f} kN)"
    ]:
        for p in piles:
            headers_resumo_1.append(title)
            headers_resumo_2.append(f"D={p.get('diam_m', 1.2):.2f}m")

    ws_aux.append(headers_resumo_1)
    ws_aux.append(headers_resumo_2)

    for row_data in analysis_result.get("summary_table", []):
        row_vals = [row_data["sounding_name"]]
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
            row_vals.append(p_inf.get("depth_for_target_global_m", p_inf.get("depth_for_target_m", "N/A")))
        # Prof Alvo Diferenciado
        for p in piles:
            pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
            p_inf = row_data["piles"].get(pid, {})
            row_vals.append(p_inf.get("depth_for_target_dif_m", "N/A"))
        ws_aux.append(row_vals)

    # 2. CAPACIDADE POR EIXO (COM COTA TOPO, GLOBAL E DIFERENCIADO)
    ws_eixo = wb.create_sheet(title="Capacidade por eixo")
    ws_eixo.append([
        "Eixo", "Cota TOPO (m)",
        f"Fundo 1.2m (FS={fs_glob:.1f})", f"Fundo 1.3m (FS={fs_glob:.1f})", f"Fundo 1.5m (FS={fs_glob:.1f})",
        f"Embutimento 1.2m (FS={fs_glob:.1f})", f"Embutimento 1.3m (FS={fs_glob:.1f})", f"Embutimento 1.5m (FS={fs_glob:.1f})",
        f"Fundo 1.2m (DIF: {fs_s}/{fs_p})", f"Fundo 1.3m (DIF: {fs_s}/{fs_p})", f"Fundo 1.5m (DIF: {fs_s}/{fs_p})",
        f"Embutimento 1.2m (DIF)", f"Embutimento 1.3m (DIF)", f"Embutimento 1.5m (DIF)"
    ])

    for ax_info in analysis_result.get("axes_analysis", []):
        r_row = [ax_info["name"], ax_info.get("cota_topo_m", ax_info.get("cota_inicio_m", 0.0))]
        # Cotas de fundo Global
        for p in piles:
            pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
            p_res = ax_info["piles"].get(pid, {})
            r_row.append(p_res.get("cota_fundo_global_m", p_res.get("cota_fundo_m", "N/A")))
        # Embutimentos Global
        for p in piles:
            pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
            p_res = ax_info["piles"].get(pid, {})
            r_row.append(p_res.get("embutimento_global_m", p_res.get("embutimento_m", "N/A")))
        # Cotas de fundo Diferenciado
        for p in piles:
            pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
            p_res = ax_info["piles"].get(pid, {})
            r_row.append(p_res.get("cota_fundo_dif_m", "N/A"))
        # Embutimentos Diferenciado
        for p in piles:
            pid = p.get("id", f"pile_{p.get('diam_m', 1.2)}m")
            p_res = ax_info["piles"].get(pid, {})
            r_row.append(p_res.get("embutimento_dif_m", "N/A"))
        ws_eixo.append(r_row)

    # 3. ABAS DE SONDAGENS COM DETALHAMENTO DE BETA (FHWA EQ. 10-13)
    for s_name, s_data in analysis_result.get("soundings", {}).items():
        sheet_title = s_name[:31]
        ws_s = wb.create_sheet(title=sheet_title)

        s_headers = [
            "Prof_Inicial_m", "Prof_Final_m", "N1_60", "Grupo_Solo", "Classe_SUCS",
            "Peso", "N60", "phi'_f (deg)", "sigma'_p (kPa)", "sigma'_v (kPa)",
            "Kp_Rankine", "Kp*tan(phi')", "beta_raw", "beta_adotado",
            "qs (kPa)", "qp (kPa)"
        ]
        for p in piles:
            s_headers.append(f"Rs-{p.get('diam_m', 1.2):.1f}m (kN)")
        for p in piles:
            s_headers.append(f"Rn-{p.get('diam_m', 1.2):.1f}m (kN)")
        for p in piles:
            s_headers.append(f"Radm_Glob-{p.get('diam_m', 1.2):.1f}m (kN)")
        for p in piles:
            s_headers.append(f"Radm_Dif-{p.get('diam_m', 1.2):.1f}m (kN)")

        ws_s.append(s_headers)

        layers = s_data.get("layers", [])
        caps = s_data.get("capacities", {})

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

    wb.save(output_path)
    return output_path
