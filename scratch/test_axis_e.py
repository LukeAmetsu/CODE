import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from backend.calculators.capacidade_estaca import run_full_analysis, get_default_project_data
import copy

base_data = get_default_project_data()
print("Base target load for E:", next(a for a in base_data.get('axes', []) if a.get('name')=='E'))
print("Base casing pct:", base_data.get('casing_reduction_pct'))
print("Base consider_pile_weight:", base_data.get('consider_pile_weight'))
print("Base fs_global / fs_dif:", base_data.get('fs_global'), base_data.get('fs_lateral'), base_data.get('fs_ponta'))

configs = [
    ("1. Base Saved Config", {}),
    ("2. AASHTO 2007 (lat=aashto_2007, tip=aashto_2007)", {"lateral_method": "aashto_2007", "tip_method": "aashto_2007"}),
    ("3. AASHTO lat + AASHTO 2024 tip", {"lateral_method": "aashto_2007", "tip_method": "aashto_2024"}),
    ("4. AASHTO 2007 (casing=10%, gross capacity, FS=2.0)", {"lateral_method": "aashto_2007", "tip_method": "aashto_2007", "casing_reduction_pct": 10.0, "consider_pile_weight": False, "fs_global": 2.0}),
    ("5. AASHTO 2007 (casing=0%, gross capacity, FS=2.0)", {"lateral_method": "aashto_2007", "tip_method": "aashto_2007", "casing_reduction_pct": 0.0, "consider_pile_weight": False, "fs_global": 2.0}),
    ("6. AASHTO with beta_max=1.8 (casing=10%, gross, FS=2.0)", {"lateral_method": "aashto_2007", "tip_method": "aashto_2007", "casing_reduction_pct": 10.0, "consider_pile_weight": False, "fs_global": 2.0, "beta_max": 1.8}),
    ("7. AASHTO without qs cap (apply_qs_cap=False, casing=10%, gross)", {"lateral_method": "aashto_2007", "tip_method": "aashto_2007", "apply_qs_cap": False, "casing_reduction_pct": 10.0, "consider_pile_weight": False, "fs_global": 2.0}),
]

for name, overrides in configs:
    d = copy.deepcopy(base_data)
    d.update(overrides)
    res = run_full_analysis(d)
    axE = next(a for a in res['axes_analysis'] if a['name']=='E')
    p60 = axE['piles']['pile_60in']
    p48 = axE['piles']['pile_48in']
    print(f"\n=== {name} ===")
    print(f"  D=1.20m: emb_glob={p48.get('embutimento_global_m')}m, emb_dif={p48.get('embutimento_dif_m')}m")
    print(f"  D=1.50m: emb_glob={p60.get('embutimento_global_m')}m, emb_dif={p60.get('embutimento_dif_m')}m")
