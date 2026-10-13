import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from backend.calculators.capacidade_estaca import (
    calculate_layer_stresses_and_strengths,
    get_default_project_data
)

data = get_default_project_data()
layers = data['soundings']['SPT-01']

print("--- FHWA Mayne ---")
l_fhwa = calculate_layer_stresses_and_strengths(layers, lateral_method="mayne_fhwa")
for l in l_fhwa[:15]:
    print(f"z={l['z_ini']}-{l['z_fim']}m: sigma_v={l['sigma_v']:.1f}, beta={l['beta']:.2f}, qs={l['qs']:.1f} kPa, qp={l['qp']:.1f} kPa")

print("\n--- AASHTO 2007 (z_ref_offset=0) ---")
l_aashto_abs = calculate_layer_stresses_and_strengths(layers, lateral_method="aashto_2007", z_ref_offset_m=0.0)
for l in l_aashto_abs[:15]:
    print(f"z={l['z_ini']}-{l['z_fim']}m: sigma_v={l['sigma_v']:.1f}, beta={l['beta']:.2f}, qs={l['qs']:.1f} kPa, qp={l['qp']:.1f} kPa")

print("\n--- AASHTO 2007 (z_ref_offset=4.6m, Eixo E) ---")
l_aashto_rel = calculate_layer_stresses_and_strengths(layers, lateral_method="aashto_2007", z_ref_offset_m=4.6)
for l in l_aashto_rel[:15]:
    print(f"z={l['z_ini']}-{l['z_fim']}m: sigma_v={l['sigma_v']:.1f}, beta={l['beta']:.2f}, qs={l['qs']:.1f} kPa, qp={l['qp']:.1f} kPa")
