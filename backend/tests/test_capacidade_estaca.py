import os
import sys

try:
    import pytest
except ImportError:
    pytest = None

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.calculators.capacidade_estaca import (
    run_full_analysis,
    get_default_project_data,
    calculate_layer_stresses_and_strengths,
    calculate_pile_capacities,
    compute_statistical_profile,
    export_to_excel
)

def test_default_data_loading():
    data = get_default_project_data()
    assert "soundings" in data
    assert len(data["soundings"]) >= 6
    assert "SPT-01" in data["soundings"]
    assert "piles" in data
    assert len(data["piles"]) == 3

def test_full_analysis():
    data = get_default_project_data()
    data["target_load_kN"] = 21400.0
    data["consider_pile_weight"] = False
    data["casing_reduction_pct"] = 10.0
    data["casing_reduction_mode"] = "excel_formula"
    data["casing_length_m"] = None
    data["lateral_method"] = "mayne_fhwa"
    data["tip_method"] = "aashto_2007"
    data["fs_global"] = 2.0
    data["fs_lateral"] = 1.5
    data["fs_ponta"] = 3.0
    # Planilha de referência utilizou Areias manualmente para o solo extrapolado e cotas topo de referência
    data["extrapolation_soil_group"] = "Areias"
    ref_axes_top = {"A": 20.75, "B": 17.55, "C": 14.40, "D": 11.20, "E": 8.00}
    for ax in data.get("axes", []):
        ax["target_load_kN"] = 21400.0
        ax["casing_length_m"] = None
        if ax.get("name") in ref_axes_top:
            ax["cota_topo_m"] = ref_axes_top[ax["name"]]
    res = run_full_analysis(data)
    assert res["success"] is True
    assert "summary_table" in res
    assert len(res["summary_table"]) >= 7  # 6 sondagens + 1 média
    assert "axes_analysis" in res
    assert len(res["axes_analysis"]) == 5  # Eixos A a E

    # Verifica profundidades alvo para SPT-01 (Global FS=2 e Diferenciado FSs=1.5, FSp=3.0)
    spt01 = next(row for row in res["summary_table"] if row["sounding_name"] == "SPT-01")
    assert spt01["piles"]["pile_48in"]["depth_for_target_m"] == 51.0
    assert spt01["piles"]["pile_48in"]["depth_for_target_dif_m"] == 42.0
    assert spt01["piles"]["pile_54in"]["depth_for_target_m"] == 48.0
    assert spt01["piles"]["pile_54in"]["depth_for_target_dif_m"] == 39.6
    assert spt01["piles"]["pile_60in"]["depth_for_target_m"] == 40.8
    assert spt01["piles"]["pile_60in"]["depth_for_target_dif_m"] == 35.4

    # Verifica os Eixos com Cota TOPO, Fundo e Embutimento Útil para ambos os critérios
    eixo_a = next(a for a in res["axes_analysis"] if a["name"] == "A")
    # Caso 1: FS Global = 2.0 (Valores exatos da planilha de referência)
    assert eixo_a["piles"]["pile_48in"]["cota_fundo_global_m"] == 63.6
    assert eixo_a["piles"]["pile_48in"]["embutimento_global_m"] == 42.85
    assert eixo_a["piles"]["pile_54in"]["cota_fundo_global_m"] == 60.6
    assert eixo_a["piles"]["pile_54in"]["embutimento_global_m"] == 39.85
    assert eixo_a["piles"]["pile_60in"]["cota_fundo_global_m"] == 55.2
    assert eixo_a["piles"]["pile_60in"]["embutimento_global_m"] == 34.45

    # Caso 2: FS Diferenciados (FS_s = 1.5 lateral, FS_p = 3.0 ponta)
    assert eixo_a["piles"]["pile_48in"]["cota_fundo_dif_m"] == 54.6
    assert eixo_a["piles"]["pile_48in"]["embutimento_dif_m"] == 33.85
    assert eixo_a["piles"]["pile_54in"]["cota_fundo_dif_m"] == 52.2
    assert eixo_a["piles"]["pile_54in"]["embutimento_dif_m"] == 31.45
    assert eixo_a["piles"]["pile_60in"]["cota_fundo_dif_m"] == 47.4
    assert eixo_a["piles"]["pile_60in"]["embutimento_dif_m"] == 26.65

    eixo_c = next(a for a in res["axes_analysis"] if a["name"] == "C")
    assert eixo_c["cota_topo_m"] == 14.40
    assert eixo_c["piles"]["pile_48in"]["cota_fundo_global_m"] == 59.4
    assert eixo_c["piles"]["pile_48in"]["embutimento_global_m"] == 45.00
    assert eixo_c["piles"]["pile_48in"]["cota_fundo_dif_m"] == 49.8
    assert eixo_c["piles"]["pile_48in"]["embutimento_dif_m"] == 35.40

def test_statistical_profile():
    data = get_default_project_data()
    synth = compute_statistical_profile(data["soundings"], percentile=10.0)
    assert len(synth) > 0
    # Primeiro intervalo 0-0.6m deve ter N=35
    assert synth[0]["n1_60"] == 35
    assert synth[0]["soil_group"] == "Areias"

def test_excel_export(tmp_path=None):
    import tempfile
    data = get_default_project_data()
    res = run_full_analysis(data)
    out_dir = str(tmp_path) if tmp_path else tempfile.gettempdir()
    out_file = os.path.join(out_dir, "test_export.xlsx")
    export_to_excel(res, out_file)
    assert os.path.exists(out_file)
    assert os.path.getsize(out_file) > 1000

def test_casing_length_reduction():
    data = get_default_project_data()
    # 1. Toda a estaca com camisa (-10%)
    data["casing_reduction_pct"] = 10.0
    data["casing_length_m"] = None
    res_full = run_full_analysis(data)
    eixo_a_full = next(a for a in res_full["axes_analysis"] if a["name"] == "A")
    emb_full = eixo_a_full["piles"]["pile_48in"]["embutimento_global_m"]

    # 2. Camisa restrita aos primeiros 10 metros
    data["casing_length_m"] = 10.0
    res_10m = run_full_analysis(data)
    eixo_a_10m = next(a for a in res_10m["axes_analysis"] if a["name"] == "A")
    emb_10m = eixo_a_10m["piles"]["pile_48in"]["embutimento_global_m"]

    # 3. Sem camisa (0 metros)
    data["casing_length_m"] = 0.0
    res_0m = run_full_analysis(data)
    eixo_a_0m = next(a for a in res_0m["axes_analysis"] if a["name"] == "A")
    emb_0m = eixo_a_0m["piles"]["pile_48in"]["embutimento_global_m"]

    # Camisa apenas nos primeiros 10m deve requerer embutimento intermediário
    assert emb_full > emb_10m >= emb_0m
    assert res_10m["casing_length_m"] == 10.0


def test_auto_extrapolation_detection():
    data = get_default_project_data()
    # Modo automático: detecta menor profundidade e solo mais comum
    data["lateral_method"] = "mayne_fhwa"
    data["extrapolation_soil_group"] = "auto"
    res = run_full_analysis(data)
    assert res["success"] is True
    assert res["min_test_depth_m"] == 44.4
    assert res["min_test_sounding"] == "SPT-01"
    assert res["base_depth_m"] == 44.4

    est = res.get("extrapolation_estimates")
    assert est is not None
    assert est["modal_soil_group"] == "Gravas"
    assert est["modal_soil_count"] == 42
    assert est["total_measured_layers"] == 74
    assert est["modal_soil_pct"] == 56.8
    assert est["estimated_n60"] == 27
    assert est["estimated_phi_deg"] == 40.7
    assert est["avg_qs_kpa"] > 200.0
    assert est["avg_qp_kpa"] > 2000.0
    assert est["num_extrapolated_layers"] == 147


def test_aashto_methods():
    data = get_default_project_data()
    layers = data["soundings"]["SPT-01"]

    # 1. Test AASHTO 2007 Lateral Resistance
    proc_a07 = calculate_layer_stresses_and_strengths(
        layers,
        lateral_method="aashto_2007",
        tip_method="aashto_2024",
        qs_max_ksf=4.0,
        qp_max_ksf=60.0
    )
    # Unit side resistance should never exceed 4.0 ksf = 191.521 kPa
    max_qs = max(l["qs"] for l in proc_a07)
    assert max_qs <= 4.0 * 47.8802589 + 1e-3, f"qs excedeu 4.0 ksf: {max_qs}"

    # Unit tip resistance should never exceed 60.0 ksf = 2872.82 kPa
    max_qp = max(l["qp"] for l in proc_a07)
    assert max_qp <= 60.0 * 47.8802589 + 1e-3, f"qp excedeu 60.0 ksf: {max_qp}"

    # 2. Test full analysis with independent options
    # Combinação 1: AASHTO 2007 lateral + AASHTO 2007 tip
    d1 = dict(data)
    d1["lateral_method"] = "aashto_2007"
    d1["tip_method"] = "aashto_2007"
    res1 = run_full_analysis(d1)
    assert res1["success"] is True
    assert res1["lateral_method"] == "aashto_2007"
    assert res1["tip_method"] == "aashto_2007"

    # Combinação 2: FHWA lateral + AASHTO 2024 tip
    d2 = dict(data)
    d2["lateral_method"] = "mayne_fhwa"
    d2["tip_method"] = "aashto_2024"
    res2 = run_full_analysis(d2)
    assert res2["success"] is True
    assert res2["lateral_method"] == "mayne_fhwa"
    assert res2["tip_method"] == "aashto_2024"

    # Combinação 3: AASHTO 2007 lateral + AASHTO 2024 tip
    d3 = dict(data)
    d3["lateral_method"] = "aashto_2007"
    d3["tip_method"] = "aashto_2024"
    res3 = run_full_analysis(d3)
    assert res3["success"] is True
    assert res3["lateral_method"] == "aashto_2007"
    assert res3["tip_method"] == "aashto_2024"


def test_net_bearing_capacity():
    data = get_default_project_data()
    data["axes"] = [{k: (0.0 if k == "pile_length_above_start_m" else v) for k, v in ax.items()} for ax in data.get("axes", [])]
    # Análise Gross
    d_gross = dict(data)
    d_gross["target_load_kN"] = 21400.0
    d_gross["consider_pile_weight"] = False
    res_gross = run_full_analysis(d_gross)

    # Análise Net
    d_net = dict(data)
    d_net["target_load_kN"] = 21400.0
    d_net["consider_pile_weight"] = True
    d_net["concrete_unit_weight"] = 24.0
    d_net["water_unit_weight"] = 10.0  # γ' = 14 kN/m³
    res_net = run_full_analysis(d_net)

    # Verifica se peso próprio de estaca D=1.50m (área ~ 1.767 m²) em 45m de água resulta em ~1.100 kN
    ax_a_gross = res_gross["axes_analysis"][0]["piles"]["pile_60in"]
    ax_a_net = res_net["axes_analysis"][0]["piles"]["pile_60in"]

    # W_pile detalhado
    w_target = ax_a_net["w_pile_net_target_global_kN"]
    assert w_target > 800.0, f"Peso próprio esperado > 800 kN, obtido {w_target}"
    
    # Net capacity embutimento deve ser maior ou igual ao Gross (pois precisa compensar o peso próprio da estaca)
    if ax_a_net["embutimento_global_m"] != "N/A" and ax_a_gross["embutimento_global_m"] != "N/A":
        assert ax_a_net["embutimento_global_m"] >= ax_a_gross["embutimento_global_m"], (
            f"Embutimento Net ({ax_a_net['embutimento_global_m']}) deve ser >= Gross ({ax_a_gross['embutimento_global_m']})"
        )

    # Análise Net com trecho acima da cota de início (pile_length_above_start_m = 15.0m)
    d_net_above = dict(data)
    d_net_above["target_load_kN"] = 21400.0
    d_net_above["consider_pile_weight"] = True
    d_net_above["concrete_unit_weight"] = 24.0
    d_net_above["water_unit_weight"] = 10.0
    d_net_above["pile_length_above_start_m"] = 15.0  # 15m acima da cota de início
    d_net_above["axes"] = [{k: (None if k == "pile_length_above_start_m" else v) for k, v in ax.items()} for ax in data.get("axes", [])]
    res_net_above = run_full_analysis(d_net_above)

    ax_a_net_above = res_net_above["axes_analysis"][0]["piles"]["pile_60in"]
    # Para D=1.50m (Área = 1.767 m2), w_above = 1.767 * 15 * 14 = 371.1 kN
    assert ax_a_net_above["w_above_kN"] > 350.0, f"Esperado w_above > 350 kN, obtido {ax_a_net_above['w_above_kN']}"
    assert ax_a_net_above["pile_length_above_start_m"] == 15.0
    # O peso total ao atingir a carga deve ser maior do que sem o trecho acima
    assert ax_a_net_above["w_pile_net_target_global_kN"] > ax_a_net["w_pile_net_target_global_kN"]
    # E a cota de fundo necessária deve ser mais profunda ou igual
    if ax_a_net_above["cota_fundo_global_m"] != "N/A" and ax_a_net["cota_fundo_global_m"] != "N/A":
        assert ax_a_net_above["cota_fundo_global_m"] >= ax_a_net["cota_fundo_global_m"]


def test_save_project_data_to_cache():
    from backend.calculators.capacidade_estaca import save_project_data_to_cache, get_default_project_data
    # Testa salvamento de cotas de eixos modificadas
    payload = {
        "axes": [
            {"name": "A", "cota_topo_m": 22.50, "target_load_kN": 21400.0},
            {"name": "B", "cota_topo_m": 19.00, "target_load_kN": 21400.0},
            {"name": "C", "cota_topo_m": 14.40, "target_load_kN": 21400.0},
            {"name": "D", "cota_topo_m": 9.35, "target_load_kN": 21400.0},
            {"name": "E", "cota_topo_m": 4.60, "target_load_kN": 21400.0}
        ]
    }
    res_save = save_project_data_to_cache(payload)
    assert res_save.get("success") is True, f"Falha ao salvar: {res_save}"
    assert res_save.get("axes_saved") == 5

    # Recarrega dados
    loaded = get_default_project_data()
    ax_a = [a for a in loaded["axes"] if a["name"] == "A"][0]
    assert ax_a["cota_topo_m"] == 22.50, f"Esperado cota_topo_m = 22.50, obtido {ax_a['cota_topo_m']}"

    # Restaura cota original (20.75) para manter consistência com o projeto
    payload_orig = {
        "axes": [
            {"name": "A", "cota_topo_m": 20.75, "target_load_kN": 21400.0},
            {"name": "B", "cota_topo_m": 19.00, "target_load_kN": 21400.0},
            {"name": "C", "cota_topo_m": 14.40, "target_load_kN": 21400.0},
            {"name": "D", "cota_topo_m": 9.35, "target_load_kN": 21400.0},
            {"name": "E", "cota_topo_m": 4.60, "target_load_kN": 21400.0}
        ]
    }
    save_project_data_to_cache(payload_orig)


def test_per_sounding_extrapolation():
    """
    Verifica que a extrapolação do solo abaixo da sondagem é estritamente específica
    de cada sondagem (solo modal, SUCS, percentil de N e profundidade de início).
    """
    data = get_default_project_data()
    data["extrapolation_soil_group"] = "auto"
    data["extrapolation_n_percentile"] = 15.0
    res = run_full_analysis(data)

    by_s = res["extrapolation_estimates_by_sounding"]
    assert "SPT-01" in by_s
    assert "SPT-02" in by_s
    assert "SPT-03" in by_s
    assert "SPT-04" in by_s

    # 1. SPT-01: Termina aos 44.4m, solo modal é Gravas (42/74 camadas), P15=27
    s1 = by_s["SPT-01"]
    assert s1["base_depth_m"] == 44.4
    assert s1["modal_soil_group"] == "Gravas"
    assert s1["adopted_soil_group"] == "Gravas"
    assert s1["estimated_n60"] == 27
    assert s1["num_extrapolated_layers"] == 147

    # Camadas sintetizadas do SPT-01 devem conter Gravas e N=27
    s1_layers = res["soundings"]["SPT-01"]["layers"]
    s1_extrap = [l for l in s1_layers if l.get("is_extrapolated")]
    assert len(s1_extrap) == 147
    assert all(l["soil_group"] == "Gravas" for l in s1_extrap)
    assert all(l["n1_60"] == 27.0 for l in s1_extrap)

    # 2. SPT-02: Termina aos 48.0m, solo modal é Areias (66/80 camadas), P15=36
    s2 = by_s["SPT-02"]
    assert s2["base_depth_m"] == 48.0
    assert s2["modal_soil_group"] == "Areias"
    assert s2["adopted_soil_group"] == "Areias"
    assert s2["estimated_n60"] == 36
    assert s2["num_extrapolated_layers"] == 141

    # Camadas sintetizadas do SPT-02 devem conter Areias e N=36
    s2_layers = res["soundings"]["SPT-02"]["layers"]
    s2_extrap = [l for l in s2_layers if l.get("is_extrapolated")]
    assert len(s2_extrap) == 141
    assert all(l["soil_group"] == "Areias" for l in s2_extrap)
    assert all(l["n1_60"] == 36.0 for l in s2_extrap)

    # 3. SPT-04: Termina aos 45.6m, solo modal é Areias (37/76 camadas), P15=32
    s4 = by_s["SPT-04"]
    assert s4["base_depth_m"] == 45.6
    assert s4["modal_soil_group"] == "Areias"
    assert s4["estimated_n60"] == 32
    assert s4["num_extrapolated_layers"] == 145

    # 4. Teste de opção "last_layer" (adota o solo do fundo do furo específico)
    d_last = dict(data)
    d_last["extrapolation_soil_group"] = "last_layer"
    res_last = run_full_analysis(d_last)
    by_s_last = res_last["extrapolation_estimates_by_sounding"]

    # SPT-01 última camada medida é Areias
    assert by_s_last["SPT-01"]["adopted_soil_group"] == "Areias"
    # SPT-02 última camada medida é Gravas
    assert by_s_last["SPT-02"]["adopted_soil_group"] == "Gravas"


def test_aashto_soil_above_removed():
    data = get_default_project_data()
    # 1. AASHTO ativa automaticamente soil_above_removed=True
    d_aashto = dict(data)
    d_aashto["lateral_method"] = "aashto_2007"
    res_aashto = run_full_analysis(d_aashto)
    assert res_aashto["success"] is True
    assert res_aashto["soil_above_removed"] is True
    ax_a_aashto = next(a for a in res_aashto["axes_analysis"] if a["name"] == "A")
    assert ax_a_aashto["soil_above_removed"] is True
    # As camadas do eixo A começam na cota inicial (20.75m), onde sigma'_v inicia em 0
    layers_a = ax_a_aashto["layers"]
    assert layers_a[0]["z_ini"] >= 20.75 - 1e-4
    assert layers_a[0]["sigma_v"] < 15.0  # Tensão inicia na primeira sub-camada rasa

    # 2. Mayne FHWA mantém solo acima por padrão (soil_above_removed=False)
    d_fhwa = dict(data)
    d_fhwa["lateral_method"] = "mayne_fhwa"
    res_fhwa = run_full_analysis(d_fhwa)
    assert res_fhwa["soil_above_removed"] is False
    ax_a_fhwa = next(a for a in res_fhwa["axes_analysis"] if a["name"] == "A")
    assert ax_a_fhwa["soil_above_removed"] is False

    # 3. Forçar explicitamente soil_above_removed=True no FHWA
    d_fhwa_forced = dict(data)
    d_fhwa_forced["lateral_method"] = "mayne_fhwa"
    d_fhwa_forced["soil_above_removed"] = True
    res_forced = run_full_analysis(d_fhwa_forced)
    assert res_forced["soil_above_removed"] is True


if __name__ == "__main__":
    print("Executando test_default_data_loading()...")
    test_default_data_loading()
    print("Executando test_full_analysis()...")
    test_full_analysis()
    print("Executando test_casing_length_reduction()...")
    test_casing_length_reduction()
    print("Executando test_auto_extrapolation_detection()...")
    test_auto_extrapolation_detection()
    print("Executando test_per_sounding_extrapolation()...")
    test_per_sounding_extrapolation()
    print("Executando test_statistical_profile()...")
    test_statistical_profile()
    print("Executando test_excel_export()...")
    test_excel_export()
    print("Executando test_aashto_methods()...")
    test_aashto_methods()
    print("Executando test_net_bearing_capacity()...")
    test_net_bearing_capacity()
    print("Executando test_save_project_data_to_cache()...")
    test_save_project_data_to_cache()
    print("Executando test_aashto_soil_above_removed()...")
    test_aashto_soil_above_removed()
    print("TODOS OS TESTES PASSARAM COM SUCESSO!")



