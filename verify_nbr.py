import sys
import os

# Ensure backend module can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from backend.calculators.nbr_6118_comb import calculate_combinations
from backend.calculators.nbr_6118_concrete import calculate_concrete_beam
from backend.calculators.nbr_8800_steel import calculate_steel_structure

def test_combinations():
    print("Testing NBR Combinations...")
    loads = [
        {'name': 'G1', 'type': 'Permanente (G)', 'value': 10.0},
        {'name': 'Q1', 'type': 'Uso Residencial (Q)', 'value': 5.0}
    ]
    res = calculate_combinations(loads)
    elu = res['combinations']['elu'][0]
    # Expected: 1.4*10 + 1.4*5 = 14 + 7 = 21.0
    print(f"ELU Result: {elu['result']:.2f} (Expected 21.00)")
    assert abs(elu['result'] - 21.0) < 0.01

def test_concrete():
    print("\nTesting NBR Concrete...")
    inputs = {
        'fck': 25.0, # MPa
        'fyk': 500.0, # MPa
        'bw': 20.0, # cm
        'h': 50.0, # cm
        'c': 2.5, # cm
        'num_barras': 3.0,
        'diam_barra': 16.0, # mm
        'diam_estribo': 5.0, # mm
        'pernas_estribo': 2.0,
        's_estribo': 15.0, # cm
        'Msd': 100.0, # kN.m
        'Vsd': 50.0  # kN
    }
    res = calculate_concrete_beam(inputs)['results']
    print(f"Mrd: {res['flexure_details']['Mrd']:.2f} kN.cm")
    print(f"VRd: {res['shear_details']['VRd']:.2f} kN")
    # Basic sanity check: Mrd > 0
    assert res['flexure_details']['Mrd'] > 0

def test_steel():
    print("\nTesting NBR Steel...")
    inputs = {
        'fy': 345.0, # MPa
        'E': 200000.0, # MPa
        'd': 200.0, # mm
        'bf': 150.0, # mm
        'tf': 10.0, # mm
        'tw': 6.0, # mm
        'Ag': 4000.0, # mm^2 approx
        'Zx': 300000.0, # mm^3
        'rx': 80.0, # mm
        'ry': 40.0, # mm
        'Lb': 3.0, # m
        'Cb': 1.0, 
        'Nsd': 100.0, # kN
        'Msdx': 50.0 # kN.m
    }
    res = calculate_steel_structure(inputs)['results']
    print(f"NcRd: {res['NcRd']:.2f} N") # Should be > 0
    print(f"Mrd: {res['Mrd']:.2f} N.mm")
    print(f"Interaction: {res['interaction_ratio']:.3f} (Unitless)")
    
    assert res['NcRd'] > 0
    assert res['Mrd'] > 0

if __name__ == "__main__":
    try:
        test_combinations()
        test_concrete()
        test_steel()
        print("\nAll Tests Passed!")
    except AssertionError:
        print("\nTest Failed!")
    except Exception as e:
        print(f"\nError: {e}")
