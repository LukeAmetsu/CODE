import sys
import os
import pandas as pd

# Add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.database import db
from backend.calculators.beam_selector import find_lightest_beam

def debug_run():
    print("--- DEBUG BEAM SELECTOR LOGIc ---")
    
    # 1. Load DB
    db_path = 'aisc-shapes-database-v16.0.xlsx'
    print(f"Loading DB from {db_path}...")
    try:
        db.load_database(db_path)
    except Exception as e:
        print(f"FAILED to load DB: {e}")
        return

    shapes = db.get_shapes_by_type('W')
    print(f"Loaded {len(shapes)} W-shapes.")
    
    if not shapes:
        print("ERROR: No W-shapes found in DB.")
        return

    # 2. Inspect First Shape
    first_key = list(shapes.keys())[0]
    first_shape = shapes[first_key]
    print(f"\n[INSPECTION] First Shape: {first_key}")
    print(f"Keys available: {list(first_shape.keys())}")
    
    # Check for critical keys used in beam_selector.py
    critical_keys = ['d', 'Zx', 'Sx', 'ry', 'J', 'Iy', 'Cw', 'rts', 'ho', 'tf']
    missing_critical = [k for k in critical_keys if k not in first_shape]
    if missing_critical:
        print(f"WARNING: The following keys used in logic are MISSING from the DB: {missing_critical}")
    else:
        print("SUCCESS: All critical keys seemingly present.")

    # 3. Simulate a Run
    print("\n[SIMULATION] Running find_lightest_beam...")
    inputs = {
        'design_method': 'ASD',
        'fy': 50,
        'lb_ft': 10,
        'mu_req': 50, # 50 k-ft
        'max_depth': 24
    }
    print(f"Inputs: {inputs}")
    
    try:
        # We define a custom debug version of the loop here to catch print statements if needed,
        # or just run the actual function and catch warnings.
        # But better to just run the function and see result.
        results = find_lightest_beam(inputs)
        print(f"Results Count: {len(results)}")
        if len(results) == 0:
            print("No results returned. Investigating why...")
            # detailed debug of one shape
            w14x22 = shapes.get('W14X22')
            if w14x22:
                print("\n[DEEP DIVE] W14X22 Analysis:")
                print(f"Props: {w14x22}")
                # Manual Check
                d = w14x22.get('d', 0)
                print(f"Depth check: {d} <= {inputs['max_depth']}? {d <= inputs['max_depth']}")
                
                # Check keys again
                try:
                    ry = w14x22['ry']
                    sx = w14x22['Sx']
                    zx = w14x22['Zx']
                    iy = w14x22['Iy'] # This is the suspect one
                    print(f"Key Access Check: passed (ry={ry}, sx={sx}, zx={zx}, iy={iy})")
                except KeyError as e:
                    print(f"Key Access Check: FAILED on {e}")
                    
            else:
                print("W14X22 not found in DB keys.")
        else:
            print("Top result:")
            print(results[0])
            
    except Exception as e:
        print(f"CRASH during execution: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_run()
