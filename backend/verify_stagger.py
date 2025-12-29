import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.calculators.angle_support import calculate_angle_support
from backend.database import db

def verify():
    # Init DB
    db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'aisc-shapes-database-v16.0.xlsx')
    print(f"Loading DB from {db_path}...")
    try:
        db.load_database(db_path)
    except Exception as e:
        print(f"DB Load Warning: {e}") 

    with open("result.txt", "w", encoding="utf-8") as f:
        f.write("--- Verification: Staggered Angle Support (Layout Msg Check) ---\n")
        
        # Define inputs
        inputs_1 = {
            'num_bolts': 5,
            'staggered': True,
            'gage': 2.5,
            'beam_span': 15, 'beam_spacing': 5, 'area_load': 50,
            'angle_leg': 4, 'angle_thick': 0.375, 'bolt_diameter': 0.5,
            'moment_arm': 0, 'angle_fy': 36, 'angle_config': 'single', 'design_method': 'ASD', 'embedment_index': 0
        }
        
        # CASE 1: Standard Stagger (Gage 2.5)
        # Horiz = sqrt(8^2 - 2.5^2) = sqrt(64 - 6.25) = sqrt(57.75) ~= 7.60
        f.write("\nCase 1: Staggered (Gage 2.5)\n")
        res_1 = calculate_angle_support(inputs_1)
        f.write(f"Layout: {res_1['layout_msg']}\n")
        
        # CASE 3: Linear
        f.write("\nCase 3: Linear\n")
        inputs_3 = inputs_1.copy()
        inputs_3['staggered'] = False
        res_3 = calculate_angle_support(inputs_3)
        f.write(f"Layout: {res_3['layout_msg']}\n")

        # CASE 4: Pythagorean Check (Gage 4.0)
        # Horiz = sqrt(8^2 - 4^2) = 6.93
        f.write("\nCase 4: Staggered (Gage 4.0)\n")
        inputs_4 = inputs_1.copy()
        inputs_4['gage'] = 4.0
        res_4 = calculate_angle_support(inputs_4)
        f.write(f"Layout: {res_4['layout_msg']}\n")
        
    print("Verification complete. Wrote result.txt")

if __name__ == "__main__":
    verify()
