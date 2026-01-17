
import sys
import os

# Adjust path to import backend modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))

from calculators.nds import calculate_nds

def run_test(name, inputs, expected_check):
    print(f"--- Running Test: {name} ---")
    result = calculate_nds(inputs)
    
    if "error" in result:
        print(f"FAILED: {result['error']}")
        return

    expected_check(result)
    print("--------------------------------\n")

# Test 1: Shear at Notch
# Standard Shear: fv = 1.5 V / A. Fv'.
# Notched: V_allow reduced. Ratio = V / V_allow.
def check_notch(res):
    print("Checking Notched Shear...")
    # Inputs: V=1000, b=1.5, d=5.5. dn=1.5. Fv=180.
    # Unnotched Area: 8.25. fv = 1500/8.25 = 181.8 psi.
    # Fv' approx 180 (CD=1.0 etc).
    
    # Notched Logic:
    # Vr = (2/3) * Fv' * b * dn * (dn/d)^2
    # Fv' = 180 (assume standard factors).
    # Vr = 0.666 * 180 * 1.5 * 1.5 * (1.5/5.5)^2
    # Vr = 270 * 0.07438 = ~20 lbs? Very low.
    
    # Let's see results
    ratios = res['ratios']
    actual = res['actuals']
    factors = res['factors']
    
    print(f"Shear Mode: {res.get('shear_mode', 'N/A')}")
    print(f"Actual fv (unadjusted based on full depth): {actual['fv']:.2f}")
    print(f"Ratio fv: {ratios['fv']:.3f}")
    
    if res.get('shear_mode') == 'Notched (Tension Side)':
        print("PASS: Detected Notched Mode.")
    else:
        print("FAIL: Did not detect Notched Mode.")

base_inputs = {
    'b_width': 1.5, 'd_depth': 5.5, 'shear_load_V': 1.0, # 1 kip
    'Fv_unadjusted': 180, 'Fb_unadjusted': 900, 'E_unadjusted': 1600000,
    'load_duration': 1.0, 'wet_service': 'Dry'
}

notch_inputs = base_inputs.copy()
notch_inputs['notch_depth'] = 1.5

run_test("Notched Shear Test", notch_inputs, check_notch)


# Test 2: Glulam Volume Factor
# If Glulam, CF should be 1.0, CV should be calculated.
def check_glulam(res):
    print("Checking Glulam CV...")
    factors = res['factors']
    print(f"CF: {factors.get('CF', 'N/A')}")
    print(f"CV: {factors.get('CV', 'N/A')}")
    
    if factors.get('CV', 1.0) < 1.0 and factors.get('CF') == 1.0:
        print("PASS: CV calculated and CF is 1.0.")
    else:
        print("FAIL: CV logic not applied correctly.")

glulam_inputs = base_inputs.copy()
glulam_inputs['member_type'] = 'Glulam'
glulam_inputs['unbraced_length_L'] = 20 # 20ft
glulam_inputs['moment_load_M'] = 5.0

run_test("Glulam Member Test", glulam_inputs, check_glulam)

# Test 3: Flat Use
# Weak Axis, 2x4 (d=1.5, b=3.5 nominal... wait Inputs are actual dimensions)
# 2x4 Flat: b_width=3.5, d_depth=1.5. 'flat_use'='Weak Axis'. 
# Note: Input logic says d_depth is "Depth". If Flat, d is the Thickness (1.5).
# Cfu should be > 1.0.
def check_flat_use(res):
    print("Checking Flat Use Cfu...")
    factors = res['factors']
    print(f"Cfu: {factors.get('Cfu', 'N/A')}")
    
    if factors.get('Cfu', 1.0) > 1.0:
        print("PASS: Cfu > 1.0 detected.")
    else:
        print("FAIL: Cfu not applied.")

flat_inputs = base_inputs.copy()
flat_inputs['b_width'] = 3.5
flat_inputs['d_depth'] = 1.5
flat_inputs['flat_use'] = 'Weak Axis'

run_test("Flat Use Test", flat_inputs, check_flat_use)
