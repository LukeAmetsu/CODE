
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from backend.calculators.splice import splice_calc

def test_capacity_check():
    print("Testing Capacity Check...")
    inputs = {
        'develop_capacity_check': True,
        'member_Zx': 100,
        'member_Fy': 50,
        'design_method': 'LRFD',
        'member_d': 18,
        'member_tf': 1,
        'member_tw': 0.5,
        'Axial_load': 0,
        # Minimum inputs to avoid errors
        'D_fp': 0.875, 'D_wp': 0.875,
        'Nc_fp': 2, 'Nr_fp': 2,
        'Nc_wp': 2, 'Nr_wp': 2,
        'H_fp': 8, 't_fp': 0.5, 'L_fp': 12,
        'H_wp': 12, 't_wp': 0.375, 'L_wp': 8
    }
    
    res = splice_calc.run(inputs)
    
    # Expected M_load: phi * Fy * Zx / 12 = 0.9 * 50 * 100 / 12 = 375 k-ft
    expected_m = 375.0
    actual_m = res['final_loads']['M_load']
    print(f"Expected M: {expected_m}, Actual M: {actual_m}")
    if abs(actual_m - expected_m) < 0.1:
        print("PASS")
    else:
        print("FAIL")

def test_optimization():
    print("\nTesting Optimization...")
    inputs = {
        'optimize_bolts_check': True,
        'optimize_flange_plates_check': True,
        'optimize_web_plates_check': False, # Skip web for speed
        'M_load': 1000, # High load to force optimization
        'V_load': 0,
        'Axial_load': 0,
        'member_d': 24, 'member_tf': 1, 'member_tw': 0.5, 'member_Fy': 50, 'member_Fu': 65, 'member_Zx': 200,
        'D_fp': 0.875, 'bolt_grade_fp': 'A325',
        'Nc_fp': 1, 'Nr_fp': 2, # Start small
        'H_fp': 8, 't_fp': 1.0, 'L_fp': 12,
        'flange_plate_Fy': 36, 'flange_plate_Fu': 58,
         # Valid geometry params
        'S1_col_spacing_fp': 3, 'S2_row_spacing_fp': 3, 'S3_end_dist_fp': 1.5, 'g_gage_fp': 4
    }
    # Add dummies for web to avoid errors
    inputs.update({'D_wp': 0.875, 'Nc_wp': 1, 'Nr_wp': 1, 'H_wp': 10, 't_wp': 0.5, 'L_wp': 8, 'bolt_grade_wp': 'A325'})
    
    res = splice_calc.run(inputs)
    
    nc = res['inputs']['Nc_fp']
    print(f"Optimized Nc_fp: {nc}")
    
    checks = res['checks']
    # Check if flange shear pass
    shear_check = checks.get('Flange Bolt Shear')
    if shear_check:
        rn = shear_check['check']['Rn'] * 0.75
        demand = shear_check['demand']
        print(f"Shear Capacity: {rn}, Demand: {demand}")
        if rn >= demand:
             print("PASS: Capacity > Demand")
        else:
             print("FAIL: Capacity < Demand (Optimization likely hit limit or failed)")
    
    if nc > 1:
        print("PASS: Bolt count increased")
    else:
        print("FAIL: Bolt count did not increase (or 1 col was enough?)")

def test_plate_optimization():
    print("\nTesting Plate Optimization...")
    inputs = {
        'optimize_bolts_check': True,
        'optimize_flange_plates_check': True,
        'optimize_web_plates_check': True,
        'M_load': 200, 
        'V_load': 100,
        'Axial_load': 0,
        'member_d': 24, 'member_tf': 1, 'member_tw': 0.5, 'member_Fy': 50, 'member_Fu': 65, 'member_Zx': 200,
        # Intentionally undersized plate
        'D_fp': 0.875, 'bolt_grade_fp': 'A325',
        'Nc_fp': 1, 'Nr_fp': 2,
        'H_fp': 8, 't_fp': 0.1, 'L_fp': 6, # Very thin and short
        'flange_plate_Fy': 36, 'flange_plate_Fu': 58,
        'S1_col_spacing_fp': 3, 'S2_row_spacing_fp': 3, 'S3_end_dist_fp': 1.5, 'g_gage_fp': 4,
        
        # Web Inputs undersized
        'D_wp': 0.875, 'Nc_wp': 1, 'Nr_wp': 2, 'H_wp': 10, 't_wp': 0.1, 'L_wp': 6, 'bolt_grade_wp': 'A325',
        'num_flange_plates': 2, 'num_web_plates': 2
    }

    
    res = splice_calc.run(inputs)
    
    with open('debug_output.txt', 'w') as f:
        f.write(f"Original t_fp: {inputs['t_fp']}, Optimized t_fp: {res['inputs']['t_fp']}\n")
        f.write(f"Original L_fp: {inputs['L_fp']}, Optimized L_fp: {res['inputs']['L_fp']}\n")
        
        if 'optimizationLog' in res:
            f.write("Optimization Log:\n")
            for log in res['optimizationLog']:
                f.write(f"  {log}\n")
        else:
            f.write("No optimization log found.\n")

        if res['inputs']['t_fp'] > 0.1:
            f.write("PASS: Flange Plate Thickness Increased\n")
        else:
            f.write("FAIL: Flange Plate Thickness NOT Increased\n")
            
        if res['inputs']['L_fp'] > 6:
            f.write("PASS: Flange Plate Length Increased\n")
        else:
            f.write("FAIL: Flange Plate Length NOT Increased\n")
            
    print("Test finished. Results written to debug_output.txt")


if __name__ == '__main__':
    # test_capacity_check()
    # test_optimization()
    try:
        test_plate_optimization()
    except Exception as e:
        with open('error.txt', 'w') as f:
            f.write(f"Type: {type(e)}\n")
            f.write(f"Error: {e}\n")
            import traceback
            traceback.print_exc(file=f)
        print("ERROR_WRITTEN_TO_FILE")






