import sys
import os

# Adjust path to find backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from backend.calculators.mn_interaction import calculate_mn_interaction
from backend.calculators.prestressed_beam import calculate_prestressed_beam

def test_mn():
    print("Testing M-N Interaction...")
    inputs = {
        'section_type': 'rect',
        'h': 60, 'b': 30,
        'fck': 30, 'fyk': 500,
        'd': 55, 'd_linha': 5,
        'As': 12.5, 'As_linha': 5.0,
        'gamma_c': 1.4, 'gamma_s': 1.15
    }
    res = calculate_mn_interaction(inputs)
    pts = res.get('points', [])
    print(f"  Points generated: {len(pts)}")
    if len(pts) > 10:
        print("  [PASS] Points generated successfully.")
    else:
        print("  [FAIL] Too few points.")

def test_prestressed():
    print("\nTesting Prestressed Beam...")
    cables = [{
        'num_strands': 4,
        'age_at_prestress': 7,
        'path': [{'x': 0, 'y': 0.1, 'type': 'Straight'}, {'x': 10, 'y': 0.1, 'type': 'Straight'}]
    }]
    inputs = {
        'vertices': [[0,0], [0.3, 0], [0.3, 0.6], [0, 0.6]], # Rect 30x60
        'beam_length': 10,
        'fck': 35,
        'fptk': 1900,
        'Ep': 200000,
        'Ap': 1.4, # cm2 area of 1 strand
        'load_pp': 5,
        'load_perm': 10,
        'load_var': 5,
        'cables': cables,
        'mu': 0.2, 'k': 0.01, 'anchorage_slip': 6
    }
    
    res = calculate_prestressed_beam(inputs)
    
    if 'errors' in res:
        print(f"  [FAIL] Res returned errors: {res['errors']}")
        if 'trace' in res: print(res['trace'])
    else:
        checks = res.get('checks', {})
        props = checks.get('properties', {})
        print(f"  Area calculated: {props.get('area', 0)} cm2")
        
        loss_res = checks.get('loss_results', {})
        cables_res = loss_res.get('cables', [])
        if len(cables_res) > 0:
            print("  [PASS] Cable analysis ran.")
            print(f"  Cable 1 Friction Start: {cables_res[0]['sigma_p_friction'][0]['value']:.2f} MPa")
        else:
            print("  [FAIL] No cable results.")

if __name__ == "__main__":
    test_mn()
    test_prestressed()
