import sys
import os
import json

# Add the project root to the python path
sys.path.append(os.path.abspath("g:/My Drive/CODE-2"))

from backend.calculators.splice import SpliceCalculator

def verify_splice_output():
    print("Verifying Splice Calculator Output...")
    
    # Define standard inputs
    inputs = {
        "axis": "Strong",
        "method": "AISC",
        "jurisdiction": "AISC",
        "design_method": "LRFD",
        
        # Flange Plate Inputs
        "num_flange_plates": 2,
        "bolt_grade_fp": "A325",
        "D_fp": 0.875, # Bolt diameter
        "Nc_fp": 2, # Columns
        "Nr_fp": 3, # Rows
        "S1_col_spacing_fp": 3.0,
        "S2_row_spacing_fp": 3.0,
        "S3_end_dist_fp": 1.5,
        "g_gage_fp": 3.0,
        "L_fp": 10.0,
        "H_fp": 10.0,
        "t_fp": 0.5,
        "flange_plate_Fy": 36.0,
        "flange_plate_Fu": 58.0,

        # Web Plate Inputs
        "num_web_plates": 2,
        "bolt_grade_wp": "A325",
        "D_wp": 0.875,
        "Nc_wp": 2,
        "Nr_wp": 3,
        "S4_col_spacing_wp": 3.0,
        "S5_row_spacing_wp": 3.0,
        "S6_end_dist_wp": 1.5,
        "L_wp": 8.0,
        "H_wp": 12.0,
        "t_wp": 0.375,
        "web_plate_Fy": 36.0,
        "web_plate_Fu": 58.0,
        "gap": 0.5,

        # Member Inputs (W14x90 approx)
        "member_d": 14.0,
        "member_tf": 0.71,
        "member_bf": 14.5,
        "member_tw": 0.44,
        "member_Fy": 50.0,
        "member_Fu": 65.0,
        "member_Zx": 157.0,
        "member_Sx": 143.0
    }

    # Merge demands into inputs for SpliceCalculator.run()
    inputs.update({
        "M_load": 100.0, # Moment in k-ft
        "V_load": 50.0,  # Shear in kips
        "Axial_load": 20.0, # Axial in kips
        "H_load": 10.0   # Horizontal load
    })

    calculator = SpliceCalculator()
    # run() takes only inputs, calculates demands internally
    results = calculator.run(inputs)
    
    checks = results.get('checks', {})
    
    # 1. Verify Flange Bolt Shear Details
    print("\n[CHECK] Flange Bolt Shear details...")
    flange_shear = checks.get('Flange Bolt Shear')
    if not flange_shear:
        print("FAIL: 'Flange Bolt Shear' check missing.")
        return False
    
    check_data_flange = flange_shear.get('check', {})
    required_flange_keys = ['Fnv', 'Ab', 'num_planes']
    missing_flange = [key for key in required_flange_keys if key not in check_data_flange]
    
    if missing_flange:
        print(f"FAIL: Missing keys in Flange Bolt Shear check: {missing_flange}")
    else:
        print(f"PASS: Found {required_flange_keys}")
        print(f"      Values: Fnv={check_data_flange.get('Fnv')}, Ab={check_data_flange.get('Ab')}, num_planes={check_data_flange.get('num_planes')}")

    # 2. Verify Web Bolt Group Shear (ICR) Details
    print("\n[CHECK] Web Bolt Group Shear (ICR) details...")
    web_shear = checks.get('Web Bolt Group Shear (ICR)')
    if not web_shear:
        print("FAIL: 'Web Bolt Group Shear (ICR)' check missing.")
        return False

    details_web = web_shear.get('details', {})
    required_web_keys = ['C', 'theta_deg', 'e_eff']
    missing_web = [key for key in required_web_keys if key not in details_web]

    if missing_web:
        print(f"FAIL: Missing keys in Web Bolt Group Shear details: {missing_web}")
    else:
        print(f"PASS: Found {required_web_keys}")
        print(f"      Values: C={details_web.get('C')}, theta={details_web.get('theta_deg')}, e_eff={details_web.get('e_eff')}")

    # 3. Verify Geometry Checks
    print("\n[CHECK] Geometry Checks...")
    geom_checks = results.get('geomChecks', {})
    if not geom_checks:
         print("FAIL: 'geomChecks' missing from results.")
    else:
        print(f"PASS: geomChecks found with keys: {list(geom_checks.keys())}")
        if 'Flange Bolts' in geom_checks and 'Web Bolts' in geom_checks:
            print("PASS: Both Flange and Web geometry checks present.")
        else:
            print(f"FAIL: Missing sub-checks. Found: {list(geom_checks.keys())}")

    return True

if __name__ == "__main__":
    import traceback
    try:
        if verify_splice_output():
            print("\nVERIFICATION SUCCESSFUL")
        else:
            print("\nVERIFICATION FAILED")
    except Exception:
        print("\nVERIFICATION ERROR:")
        traceback.print_exc()
