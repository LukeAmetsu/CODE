import sys
sys.path.insert(0, '.')
from backend.calculators.capacidade_estaca import run_full_analysis

p = {
    'fs_global': 2.0,
    'fs_lateral': 2.50,
    'fs_ponta': 2.75,
    'consider_pile_weight': True,
    'casing_reduction_pct': 0.0,
    'casing_length_m': 0.0,
    'axes': [
        {'name': 'A', 'cota_topo_m': 20.40, 'target_load_kN': 5550},
        {'name': 'B', 'cota_topo_m': 18.60, 'target_load_kN': 6400}
    ]
}
res = run_full_analysis(p)
spt = res['soundings']['SPT-01']['layers']

print("--- LAYERS BETWEEN 35m and 48m ---")
for l in spt:
    if 35.0 <= l['z_fim'] <= 48.0:
        print(f"z={l['z_ini']:.1f}-{l['z_fim']:.1f}m: soil={l.get('soil_group','?')}, N={l.get('n1_60', '?')}, qs={l.get('qs', 0):.1f} kPa, qp={l.get('qp', 0):.1f} kPa")
