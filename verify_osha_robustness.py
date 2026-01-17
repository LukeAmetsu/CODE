import sys
import os

sys.path.append(os.path.abspath("g:/My Drive/CODE-2"))

# Need to import the function directly or via the module if not exposed in class
# get_design_factors is a helper in splice.py module scope
from backend.calculators.splice import get_design_factors

def verify_robustness():
    print("Verifying OSHA Robustness...")
    
    test_cases = [
        ("OSHA", 4.0),
        ("osha", 4.0),
        (" OSHA ", 4.0),
        ("OsHa", 4.0),
        ("AISC", 2.0), # Assuming default omega shear=2.0 passed in
        (None, 2.0)
    ]
    
    all_pass = True
    
    for jur, expected_omega in test_cases:
        # Pass dummy phi/omega defaults
        res = get_design_factors(jur, 0.75, 2.0)
        
        if res['omega'] == expected_omega:
            print(f"PASS: '{jur}' -> Omega {res['omega']}")
        else:
            print(f"FAIL: '{jur}' -> Omega {res['omega']} (Expected {expected_omega})")
            all_pass = False
            
    if all_pass:
        print("\nROBUSTNESS VERIFICATION SUCCESSFUL")
        return True
    else:
        print("\nROBUSTNESS VERIFICATION FAILED")
        return False

if __name__ == "__main__":
    verify_robustness()
