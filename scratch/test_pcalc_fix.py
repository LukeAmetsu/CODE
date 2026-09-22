# test_pcalc_fix.py
import sys
sys.path.append(r"c:\OD\OneDrive - Andrade Gutierrez\CODE-2")
from backend.calculators.pcalc import MaterialData, SectionGeometry, ConcreteSection, Solver

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

mat = MaterialData(test_input['fck'], test_input['fyk'], test_input['es'])
geo = SectionGeometry(test_input['section_type'], test_input['hx'], test_input['hy'], test_input['boundary'], test_input['length'])
geo.discretize()
bars = [{'x': b['x'] - 15, 'y': b['y'] - 25, 'diametro': b['diametro']} for b in test_input['bars']]
sec = ConcreteSection(geo, mat, bars)
solver = Solver(sec)
solver.length_eff = 4.0 # m

Nsd = -800 * 1.4
M1xt = 50 * 1.4
M1xb = -50 * 1.4
M1yt = 20 * 1.4
M1yb = -20 * 1.4

# Check solve_curvature output
curv = solver.solve_curvature(Nsd, M1xt, M1yt)
print("solve_curvature output:")
print("e0:", curv['e0'], "kx (1/cm):", curv['kx'], "ky (1/cm):", curv['ky'])
print("If multiplied by 100 -> 1/m: kx =", curv['kx']*100, "ky =", curv['ky']*100)
print("If divided by 100: kx =", curv['kx']/100, "ky =", curv['ky']/100)
