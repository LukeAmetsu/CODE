
import sys
import os
import json
# import pytest

# Add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from backend.calculators.base_plate import calculate_base_plate

def test_base_plate_fos_override():
    print("\n--- Testing Base Plate FOS Override ---")
    
    # Base Inputs
    inputs = {
        'design_method': 'ASD',
        'jurisdiction': 'AISC',
        'axial_load_P_in': -50, # Compression
        'moment_Mx_in': 0,
        'shear_V_in': 0,
        'concrete_fc': 4,
        'base_plate_length_N': 12,
        'base_plate_width_B': 12,
        'pedestal_N': 12,
        'pedestal_B': 12,
        'column_depth_d': 10,
        'column_flange_width_bf': 10,
        'column_web_tw': 0.5,
        'column_flange_tf': 0.5,
        'provided_plate_thickness_tp': 0.5,
        'base_plate_Fy': 36,
        'global_fos': '' # No FOS
    }
    
    # 1. Standard Run
    res_std = calculate_base_plate(inputs)
    check_bearing = res_std['checks']['Concrete Bearing']
    print(f"Standard Bearing Omega: {check_bearing['check']['omega']} (Expected ~2.31)")
    
    # 2. FOS Run
    inputs_fos = inputs.copy()
    inputs_fos['global_fos'] = 3.0
    res_fos = calculate_base_plate(inputs_fos)
    check_bearing_fos = res_fos['checks']['Concrete Bearing']
    print(f"FOS=3.0 Bearing Omega: {check_bearing_fos['check']['omega']} (Expected 3.0)")
    
    if abs(check_bearing_fos['check']['omega'] - 3.0) < 0.01:
        print("PASS: FOS Override Applied Correctly.")
    else:
        print("FAIL: FOS Override Not Applied.")

    # 3. Batch Run
    print("\n--- Testing Base Plate Batch ---")
    inputs_batch = inputs.copy()
    inputs_batch['batch_loads'] = [
        {'id': 'Case1', 'axial_load_P_in': -10},
        {'id': 'Case2', 'axial_load_P_in': -100}
    ]
    
    res_batch = calculate_base_plate(inputs_batch)
    print(f"Batch Result Length: {len(res_batch)} (Expected 2)")
    if len(res_batch) == 2:
        print("PASS: Batch Processing works.")
        print(f"Case 1 P: {res_batch[0]['inputs']['axial_load_P_in']}")
        print(f"Case 2 P: {res_batch[1]['inputs']['axial_load_P_in']}")
    else:
        print("FAIL: Batch Processing returned wrong length.")

if __name__ == "__main__":
    test_base_plate_fos_override()
