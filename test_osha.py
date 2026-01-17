import sys
import os

sys.path.append(os.path.abspath("g:/My Drive/CODE-2"))

from backend.calculators.splice import SpliceCalculator

def test_osha_fos():
    print("Testing OSHA Factor of Safety...")
    
    calculator = SpliceCalculator()
    
    # 1. Test check_bolt_shear directly
    print("\n[TEST] check_bolt_shear with jurisdiction='OSHA'")
    shear_inputs = {
        'grade': "A325", 'db': 0.875, 'num_planes': 1, 
        'jurisdiction': 'OSHA'
    }
    result = calculator.check_bolt_shear(shear_inputs)
    print(f"Omega: {result['omega']}")
    
    if result['omega'] == 4.0:
        print("PASS: Direct check_bolt_shear applied FOS 4.0")
    else:
        print(f"FAIL: Direct check_bolt_shear applied FOS {result['omega']}")

    # 2. Test full run
    print("\n[TEST] full run with jurisdiction='OSHA'")
    run_inputs = {
        "axis": "Strong",
        "method": "ASD", # User was using ASD
        "jurisdiction": "OSHA", # The key parameter
        "design_method": "ASD",
        
        # Minimal valid inputs to avoid errors
        "num_flange_plates": 2,
        "bolt_grade_fp": "A325",
        "D_fp": 0.875,
        "Nc_fp": 2, "Nr_fp": 3,
        "S1_col_spacing_fp": 3.0, "S2_row_spacing_fp": 3.0, "S3_end_dist_fp": 1.5, "g_gage_fp": 3.0,
        "L_fp": 10.0, "H_fp": 10.0, "t_fp": 0.5,
        "flange_plate_Fy": 36.0, "flange_plate_Fu": 58.0,

        "num_web_plates": 2,
        "bolt_grade_wp": "A325",
        "D_wp": 0.875,
        "Nc_wp": 2, "Nr_wp": 3,
        "S4_col_spacing_wp": 3.0, "S5_row_spacing_wp": 3.0, "S6_end_dist_wp": 1.5,
        "L_wp": 8.0, "H_wp": 12.0, "t_wp": 0.375,
        "web_plate_Fy": 36.0, "web_plate_Fu": 58.0,
        "gap": 0.5,

        "member_d": 14.0, "member_tf": 0.71, "member_bf": 14.5, "member_tw": 0.44,
        "member_Fy": 50.0, "member_Fu": 65.0, "member_Zx": 157.0, "member_Sx": 143.0,
        
        "M_load": 10.0, "V_load": 10.0, "Axial_load": 0.0, "H_load": 0.0
    }
    
    full_result = calculator.run(run_inputs)
    flange_shear = full_result.get('checks', {}).get('Flange Bolt Shear', {}).get('check', {})
    
    print(f"Full Run Flange Shear Omega: {flange_shear.get('omega')}")
    
    if flange_shear.get('omega') == 4.0:
        print("PASS: Full run applied FOS 4.0")
    else:
        print(f"FAIL: Full run applied FOS {flange_shear.get('omega')}")

if __name__ == "__main__":
    test_osha_fos()
