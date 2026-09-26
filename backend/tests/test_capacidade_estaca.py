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
    # Planilha de referência utilizou Areias manualmente para o solo extrapolado
    data["extrapolation_soil_group"] = "Areias"
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


if __name__ == "__main__":
    print("Executando test_default_data_loading()...")
    test_default_data_loading()
    print("Executando test_full_analysis()...")
    test_full_analysis()
    print("Executando test_casing_length_reduction()...")
    test_casing_length_reduction()
    print("Executando test_auto_extrapolation_detection()...")
    test_auto_extrapolation_detection()
    print("Executando test_statistical_profile()...")
    test_statistical_profile()
    print("Executando test_excel_export()...")
    test_excel_export()
    print("TODOS OS TESTES PASSARAM COM SUCESSO!")

