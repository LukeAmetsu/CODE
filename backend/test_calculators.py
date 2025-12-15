import sys
import os
import unittest

# Ensure we can import from backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.database import db
from backend.calculators.angle_support import calculate_angle_support
from backend.calculators.beam_selector import find_lightest_beam

class TestCalculators(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Mock DB for testing logic
        print("Using Mock DB for verification")
        
        # Mock Angle Support Table
        # (It is hardcoded in angle_support.py so no need to mock db for that, 
        # but Beam Selector needs db.get_shapes_by_type)
        
        # Mock get_shapes_by_type
        def mock_get_shapes(type_):
            if type_ == 'W':
                return {
                    'W12X26': {
                        'Type': 'W',
                        'AISC_Manual_Label': 'W12X26',
                        'EDI_Std_Nomenclature': 'W12X26',
                        'd': 12.2,
                        'Zx': 37.2,
                        'Sx': 33.4,
                        'ry': 1.51,
                        'J': 0.30,
                        'Iy': 17.3,
                        'Cw': 720, # Guess
                        'rts': 1.5, # Guess
                        'ho': 11.5,
                        'tf': 0.38
                    }
                }
            return {}
            
        db.get_shapes_by_type = mock_get_shapes

    def test_angle_support(self):
        print("\nTesting Angle Support...")
        inputs = {
            'beam_span': 10,
            'beam_spacing': 5,
            'area_load': 50, # 50psf
            'num_bolts': 2,
            'bolt_diameter': '0.375',
            'embedment_index': 0,
            'angle_leg': 4,
            'angle_config': 'single'
        }
        res = calculate_angle_support(inputs)
        
        # Validation
        # w_klf = 50 * 5 / 1000 = 0.25 klf
        # V = 0.25 * 10 / 2 = 1.25 kips
        self.assertAlmostEqual(res['w_klf'], 0.25)
        self.assertAlmostEqual(res['V_total'], 1.25)
        self.assertTrue('pass_all' in res)
        print("Angle Support Result:", res['pass_all'], res['interaction'])

    def test_beam_selector(self):
        print("\nTesting Beam Selector...")
        inputs = {
            'design_method': 'ASD',
            'span_ft': 20,
            'w_load': 0.5, # 0.5 k/ft -> M = 0.5*400/8 = 25 k-ft
            'lb_ft': 0, # Fully braced
            'max_depth': 14
        }
        candidates = find_lightest_beam(inputs)
        
        self.assertTrue(len(candidates) > 0)
        winner = candidates[0]
        print(f"Winner for 20ft, 0.5k/ft: {winner['name']} ({winner['weight']} lb/ft)")
        
        # M_req = 25 k-ft. 
        # W10x12 (ASD Mp ~ 24 k-ft?) Let's see what it picks.
        self.assertTrue(winner['capacity'] >= 25.0)

if __name__ == '__main__':
    unittest.main()
