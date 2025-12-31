import sys
import os

# Adjust path to include the root of the project (CODE-2)
# Current file is in backend/verify_pcalc.py
# We want to add .../CODE-2 to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.calculators import pcalc

def test_pcalc():
    inputs = {
        'fck': 25, 'fyk': 500, 'es': 210,
        'section_type': 'Retangular',
        'hx': 30, 'hy': 50,
        'boundary': 'pinned',
        'length': 300,
        'bars': [
            {'x': 4, 'y': 4, 'diametro': 16},
            {'x': 26, 'y': 4, 'diametro': 16},
            {'x': 4, 'y': 46, 'diametro': 16},
            {'x': 26, 'y': 46, 'diametro': 16}
        ],
        'load': {'n': -500, 'mxTop': 10, 'mxBot': 10, 'myTop': 0, 'myBot': 0},
        'gamac': 1.4,
        'gamaf': 1.4,
        'calc_2nd_order': True,
        'method_2nd': 'general_biaxial' # Test general method
    }
    
    print("Running PCALC test...")
    try:
        res = pcalc.calculate_column(inputs)
        
        print("Interaction Surface Points:", len(res['surface']['z']))
        print("2nd Order Results:", res['results'])
        
        # Basic Checks
        if len(res['surface']['z']) > 0:
            print("PASS: Surface generation")
        else:
            print("FAIL: Surface generation empty")
            
        if res['results'].get('Mtot_x', 0) > 0:
            print(f"PASS: Mtot_x calculated ({res['results']['Mtot_x']:.2f})")
        else:
            print("FAIL: Mtot_x is zero/missing")
    except Exception as e:
        print(f"FAIL: Calculation raised exception: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_pcalc()
