
import sys
import os
import json

# Add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from backend.calculators.steel_check import steel_checker

def test_steel_check_fos():
    print("\n--- Testing Steel Check FOS Override ---")
    
    # Base Inputs (W14x90)
    inputs = {
        'design_method': 'ASD',
        'jurisdiction': 'AISC',
        'section_type': 'W-Shape',
        'd': 14.0, 'bf': 14.5, 'tf': 0.71, 'tw': 0.44,
        'Ag_manual': 26.5, 'Ix_manual': 999, 'Sx_manual': 143, 'Zx_manual': 157,
        'Iy_manual': 362, 'Sy_manual': 49.9, 'Zy_manual': 75.6,
        'ry_manual': 3.7, 'rts_manual': 4.0, 'J_manual': 4.0, 'Cw_manual': 16000,
        'Fy': 50, 'Fu': 65, 'E': 29000,
        'Pu_or_Pa': -100, # Compression
        'Mux_or_Max': 200, # Moment
        'Lb_input': 15,
        'K': 1.0,
        'Cb': 1.0,
        'global_fos': ''
    }
    
    # 1. Standard Run
    res_std = steel_checker.run(inputs)
    check_comp = res_std['axial']
    print(f"Standard Compression Pn: {check_comp['Pn']:.2f}, phiPn/PnOmega: {check_comp['phiPn_or_Pn_omega']:.2f}")
    # ASD Omega=1.67. Factor = 1/1.67 = 0.6.
    factor_std = check_comp['phiPn_or_Pn_omega'] / check_comp['Pn']
    print(f"Standard Factor: {factor_std:.4f} (Expected ~0.60)")
    
    # 2. FOS Run
    inputs_fos = inputs.copy()
    inputs_fos['global_fos'] = 2.0
    res_fos = steel_checker.run(inputs_fos)
    check_comp_fos = res_fos['axial']
    factor_fos = check_comp_fos['phiPn_or_Pn_omega'] / check_comp_fos['Pn']
    print(f"FOS=2.0 Factor: {factor_fos:.4f} (Expected 0.50)")
    
    if abs(factor_fos - 0.5) < 0.01:
        print("PASS: FOS Override Applied Correctly.")
    else:
        print("FAIL: FOS Override Not Applied.")

    # 3. Batch Run
    print("\n--- Testing Steel Check Batch ---")
    inputs_batch = inputs.copy()
    inputs_batch['batch_loads'] = [
        {'id': 'Case1', 'Pu_or_Pa': -50},
        {'id': 'Case2', 'Pu_or_Pa': -200}
    ]
    
    res_batch = steel_checker.run(inputs_batch)
    print(f"Batch Result Length: {len(res_batch)} (Expected 2)")
    if len(res_batch) == 2:
        print("PASS: Batch Processing works.")
        print(f"Case 1 P: {res_batch[0]['inputs']['Pu_or_Pa']}")
        print(f"Case 2 P: {res_batch[1]['inputs']['Pu_or_Pa']}")
    else:
        print("FAIL: Batch Processing returned wrong length.")

if __name__ == "__main__":
    test_steel_check_fos()
