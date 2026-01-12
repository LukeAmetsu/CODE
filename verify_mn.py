
import sys
import os
sys.path.append(os.getcwd())

from backend.calculators.mn_interaction import calculate_mn_interaction, calculate_cracking_limit_curve

inputs = {
    'section_type': 'rect',
    'h': 60,
    'b': 25,
    'd': 55,
    'd_linha': 5,
    'fck': 25,
    'fyk': 500,
    'As': 12.56,
    'As_linha': 4.02,
    'gamma_c': 1.4,
    'gamma_s': 1.15,
    'phi_l': 16.0,
    'wk_lim': 0.30,
    'has_prestress': False
}

print("Running calculate_mn_interaction...")
result = calculate_mn_interaction(inputs)

if 'cracking_points' in result:
    pts = result['cracking_points']
    print(f"Cracking points returned: {len(pts)}")
    if len(pts) > 0:
        print(f"Sample point: {pts[0]}")
        print(f"Mid point: {pts[len(pts)//2]}")
else:
    print("No 'cracking_points' in result!")

print("Keys in result:", result.keys())
