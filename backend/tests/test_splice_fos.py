import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from backend.calculators.splice import splice_calc

def test_fos_override():
    print("\nTesting Global FOS Override...")
    inputs = {
        'develop_capacity_check': False,
        'global_fos': 2.0, # Override
        'jurisdiction': 'AISC', # Should be ignored
        
        # Standard Inputs
        'member_Zx': 100, 'member_Fy': 50, 'design_method': 'ASD',
        'member_d': 18, 'member_tf': 1, 'member_tw': 0.5,
        'M_load': 100, 'V_load': 0, 'Axial_load': 0,
        'D_fp': 0.875, 'D_wp': 0.875,
        'num_flange_plates': 2, # Required for flange checks
        'num_web_plates': 2,
        'Nc_fp': 2, 'Nr_fp': 2,
        'Nc_wp': 2, 'Nr_wp': 2,
        'H_fp': 8, 't_fp': 0.5, 'L_fp': 12,
        'H_wp': 12, 't_wp': 0.375, 'L_wp': 8
    }
    
    # Run calculation
    res = splice_calc.run(inputs)
    
    # Check a specific capacity, e.g., Bolt Shear
    # Bolt Shear Rn (A325, 0.875, 1 plane):
    # Ab = 0.6013, Fnv = 54 -> Rn = 32.47 kips per bolt
    
    # Check results
    shear_check = res['checks'].get('Flange Bolt Shear')
    if not shear_check:
        print("FAIL: Flange Bolt Shear check missing")
        return

    # Check factors
    phi = shear_check['check']['phi']
    omega = shear_check['check']['omega']
    
    print(f"FOS: {inputs['global_fos']}")
    print(f"Phi: {phi}, Omega: {omega}")
    
    if abs(omega - 2.0) < 0.001 and abs(phi - 0.5) < 0.001:
        print("PASS: Factors correctly overridden")
    else:
        print("FAIL: Factors NOT overridden")

if __name__ == '__main__':
    # ... previous tests ...
    try:
        test_plate_optimization()
    except: pass
    
    try:
        test_fos_override()
    except Exception as e:
        print(f"Error in FOS test: {e}")
