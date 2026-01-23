
import sys
import os
import json

# Add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

try:
    from backend.calculators.base_plate import calculate_base_plate
    from backend.calculators.splice import splice_calc
    from backend.calculators.steel_check import steel_checker
    print("Imports successful.")
except ImportError as e:
    print(f"Import Error: {e}")
    sys.exit(1)

def test_base_plate():
    print("\n--- Testing Base Plate Batch ---")
    base_inputs = {
        'design_method': 'ASD',
        'base_plate_Fy': 36,
        'base_plate_length_N': 12,
        'base_plate_width_B': 12,
        'axial_load_P_in': 50,
        'moment_Mx_in': 100, # Large moment
        'batch_loads': [
            {'axial_load_P_in': 10, 'moment_Mx_in': 10}, # Light load
            {'axial_load_P_in': 100, 'moment_Mx_in': 200} # Heavy load
        ]
    }
    
    res = calculate_base_plate(base_inputs)
    

    if isinstance(res, list) and len(res) == 2:
        print("SUCCESS: Returned list of 2 items.")
        # Base Plate returns {checks: { 'Concrete Bearing': ... } }
        val1 = res[0]['checks']['Concrete Bearing']['demand']
        val2 = res[1]['checks']['Concrete Bearing']['demand']
        print(f"Item 1 Bearing: {val1:.2f} (Expected low)")
        print(f"Item 2 Bearing: {val2:.2f} (Expected high)")
    else:
        print(f"FAILURE: Result is {type(res)}")
        if isinstance(res, list): print(f"Length: {len(res)}")

def test_splice():
    print("\n--- Testing Splice Batch ---")
    base_inputs = {
        'design_method': 'ASD',
        'M_load': 50,
        'batch_loads': [
            {'M_load': 10},
            {'M_load': 500}
        ]
    }
    
    res = splice_calc.run(base_inputs)
    
    if isinstance(res, list) and len(res) == 2:
        print("SUCCESS: Returned list of 2 items.")
        # Splice returns 'demands' dict
        print(f"Item 1 M_load: {res[0]['demands']['M_load']}")
        print(f"Item 2 M_load: {res[1]['demands']['M_load']}")
    else:
        print(f"FAILURE: Result is {type(res)}")

def test_steel_check():
    print("\n--- Testing Steel Check Batch ---")
    base_inputs = {
        'section_type': 'W_Shape',
        'd': 12, 'bf': 6, 'tf': 0.5, 'tw': 0.3, 'Ag_manual': 10, 'I_manual': 200, 'Sx_manual': 40, 'Zx_manual': 45, 'ry_manual': 1.5,
        'Fy': 50,
        'Mux_or_Max': 50,
        'batch_loads': [
            {'Mux_or_Max': 10},
            {'Mux_or_Max': 200}
        ]
    }
    
    res = steel_checker.run(base_inputs)
    
    if isinstance(res, list) and len(res) == 2:
        print("SUCCESS: Returned list of 2 items.")
        # Steel check returns inputs in result sometimes? Or check flexure ratio
        print(f"Item 1 Flexure Demand: {res[0]['inputs']['Mux_or_Max']}")
        print(f"Item 2 Flexure Demand: {res[1]['inputs']['Mux_or_Max']}")
    else:
        print(f"FAILURE: Result is {type(res)}")

if __name__ == "__main__":
    test_base_plate()
    test_splice()
    test_steel_check()
