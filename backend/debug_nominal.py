import sys
import os

# Add root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.calculators.beam_selector import find_lightest_beam
from backend.database import db

# Helper to load DB
def load_db():
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'aisc-shapes-database-v16.0.xlsx'))
    print(f"Loading DB from {db_path}...")
    db.load_database(db_path)

if __name__ == "__main__":
    load_db()
    
    # 1. Test Nominal Depth = 12
    # Should get W12
    inputs_12 = {
        'design_method': 'ASD',
        'fy': 50,
        'lb_ft': 0,
        'cb': 1.0,
        'mu_req': 50.0, # 50 k-ft
        'nominal_depth': 12
    }
    
    print("\n--- Testing Nominal Depth = 12 ---")
    res_12 = find_lightest_beam(inputs_12)
    if res_12['candidates']:
        top = res_12['candidates'][0]
        print(f"Winner: {top['name']} (Depth: {top['depth']})")
        if 'W12' in top['name']:
            print("PASS: Winner is W12")
        else:
            print("FAIL: Winner is NOT W12")
    else:
        print("FAIL: No candidates found")
        
    # 2. Test Nominal Depth = 14
    inputs_14 = inputs_12.copy()
    inputs_14['nominal_depth'] = 14
    
    print("\n--- Testing Nominal Depth = 14 ---")
    res_14 = find_lightest_beam(inputs_14)
    if res_14['candidates']:
        top = res_14['candidates'][0]
        print(f"Winner: {top['name']} (Depth: {top['depth']})")
        if 'W14' in top['name']:
            print("PASS: Winner is W14")
        else:
            print("FAIL: Winner is NOT W14")
            
    # 3. Test Invalid Nominal Depth (e.g. 13) - Should be empty?
    inputs_13 = inputs_12.copy()
    inputs_13['nominal_depth'] = 13
    
    print("\n--- Testing Nominal Depth = 13 (Invalid) ---")
    res_13 = find_lightest_beam(inputs_13)
    if not res_13['candidates']:
        print("PASS: No candidates for W13 (Correct)")
    else:
        print(f"FAIL: Found shapes for W13? {res_13['candidates'][0]['name']}")
