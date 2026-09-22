import os
import json
import sys
sys.path.insert(0, os.path.abspath('.'))
from backend.calculators.rs2_fea import full_analysis_pipeline

adonis_files = [
    'adonis_tut01_kirsch_abertura_biaxial.json',
    'adonis_tut02_sapata_capacidade_carga_prandtl.json',
    'adonis_tut03_talude_camada_fraca_ssr.json',
    'adonis_tut04_cortina_estacas_prancha.json',
    'adonis_tut05_tunel_ferradura_caverna.json'
]

for fn in adonis_files:
    p = os.path.join('test_files', 'rs2', fn)
    with open(p, 'r', encoding='utf-8') as f:
        d = json.load(f)
    model = d['model']
    run_ssr = bool(d.get('run_ssr', False) or 'ssr' in fn)
    print(f"Processing {fn} (run_ssr={run_ssr})...")
    model_test = dict(model)
    model_test['mesh'] = None
    res = full_analysis_pipeline(model_test, run_ssr=run_ssr)
    if res.get('status') == 'success':
        d['mesh'] = res['mesh']
        d['results'] = res['results']
        d['stages_results'] = res.get('stages', [])
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(d, f, indent=2)
        n_nodes = res['mesh']['num_nodes']
        n_elems = res['mesh']['num_elements']
        print(f"  [OK] Saved {fn}: {n_nodes} nodes, {n_elems} elements")
    else:
        print(f"  [FAIL] {fn}: {res.get('error')}")

print("\nAdonis test files updated successfully.")
