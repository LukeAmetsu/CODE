# test_pcalc_math.py
import sys
sys.path.append(r"c:\OD\OneDrive - Andrade Gutierrez\CODE-2")
from backend.calculators.pcalc import calculate_column

test_input = {
    'section_type': 'Retangular',
    'hx': 30, # cm
    'hy': 50, # cm
    'boundary': 'pinned',
    'length': 400, # cm
    'fck': 25, # MPa
    'fyk': 500, # MPa
    'es': 210, # GPa
    'gamac': 1.4,
    'gamas': 1.15,
    'gamaf': 1.4,
    'calc_2nd_order': True,
    'method_2nd': 'general_biaxial',
    'bars': [
        {'x': 4, 'y': 4, 'diametro': 16},
        {'x': 26, 'y': 4, 'diametro': 16},
        {'x': 4, 'y': 46, 'diametro': 16},
        {'x': 26, 'y': 46, 'diametro': 16},
    ],
    'load': {
        'n': -800, # kN
        'mxTop': 50, # kNm
        'mxBot': -50, # kNm
        'myTop': 20, # kNm
        'myBot': -20  # kNm
    }
}

res = calculate_column(test_input)
print("Results with general method:")
print(res['results'])

test_input['method_2nd'] = 'curvature_approx'
res1 = calculate_column(test_input)
print("Results with curvature approx:")
print(res1['results'])
