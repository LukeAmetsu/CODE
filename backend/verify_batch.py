import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.calculators.angle_support import calculate_angle_support
from backend.database import db

def verify():
    # Init DB
    db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'aisc-shapes-database-v16.0.xlsx')
    try:
        db.load_database(db_path)
    except:
        pass

    print("--- Verification: Batch Bolt Override ---")
    
    # Base inputs: 2 bolts default
    inputs = {
        'num_bolts': 2,
        'staggered': False,
        'beam_span': 15, 'beam_spacing': 5, 'area_load': 50,
        'angle_leg': 4, 'angle_thick': 0.375, 'bolt_diameter': 0.5,
        'moment_arm': 0, 'angle_fy': 36, 'angle_config': 'single', 'design_method': 'ASD', 'embedment_index': 0,
        'batch_loads': [
            {'span': 10, 'load': 50, 'spacing': 5, 'num_bolts': 2}, # Should match base
            {'span': 10, 'load': 50, 'spacing': 5, 'num_bolts': 5}, # Override: 5 bolts
        ]
    }
    
    results = calculate_angle_support(inputs)
    
    # Case 1 (2 bolts)
    print(f"Case 1 (2 bolts): {results[0]['layout_msg']}")
    
    # Case 2 (5 bolts)
    print(f"Case 2 (5 bolts): {results[1]['layout_msg']}")
    
    if "5 Bolts" in results[1]['layout_msg']:
        print("PASS: Bolt override working.")
    else:
        print("FAIL: Bolt override ignored.")
        
if __name__ == "__main__":
    verify()
