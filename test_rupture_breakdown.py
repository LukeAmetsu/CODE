import sys
import os

sys.path.append(os.path.abspath("g:/My Drive/CODE-2"))

from backend.calculators.splice import SpliceCalculator

def test_rupture_breakdown():
    print("Testing Beam Flexural Rupture Breakdown...")
    
    calculator = SpliceCalculator()
    
    # Inputs that trigger the check
    inputs = {
        # ... standard inputs ...
        "axis": "Strong",
        "method": "ASD",
        "jurisdiction": "AISC",
        
        # Member Inputs
        "member_d": 14.0, "member_tf": 0.71, "member_bf": 14.5, "member_tw": 0.44,
        "member_Fy": 50.0, "member_Fu": 65.0, "member_Zx": 157.0, "member_Sx": 143.0,
        
        # Holes
        "D_fp": 0.875,
        "Nc_fp": 2, "Nr_fp": 3, # Implies num bolts
    }
    
    # We can test the private/helper method directly or the full run.
    # Testing the helper directly is more precise for unit testing.
    
    rupture_inputs = {
        'Sx': 143.0, 'Fy': 50.0, 'Fu': 65.0,
        'bf': 14.5, 'tf': 0.71, 'num_bolts_in_flange_cs': 4,
        'hole_dia_net_area': 0.875 + 0.125, 'jurisdiction': 'AISC'
    }
    
    result = calculator.check_beam_flexural_rupture(rupture_inputs)
    
    print("\nResult Keys:", result.keys())
    
    required_keys = ['Afn', 'Afg', 'Yt', 'Fy', 'Fu', 'Sx']
    missing = [k for k in required_keys if k not in result]
    
    if missing:
        print(f"FAIL: Missing keys in result: {missing}")
        return False
    else:
        print("PASS: All required keys present.")
        return True

if __name__ == "__main__":
    if test_rupture_breakdown():
        print("\nSUCCESS")
    else:
        print("\nFAILURE")
