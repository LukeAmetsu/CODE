import unittest
from backend.calculators.flexible_retaining_wall import calculate_flexible_wall, SHEET_PILE_CATALOG

class TestFlexibleRetainingWall(unittest.TestCase):

    def test_single_anchor_sheet_pile(self):
        inputs = {
            'wall_type': 'sheet_pile',
            'support_type': 'single_anchor',
            'excavation_depth': 6.0,
            'anchor_depth': 1.5,
            'gamma': 18.0,
            'gamma_sat': 20.0,
            'phi': 32.0,
            'cohesion': 0.0,
            'surcharge': 10.0,
            'water_table_retained': 3.0,
            'water_table_excav': 6.0,
            'fs_passive': 1.5,
            'fy_steel': 355.0
        }
        res = calculate_flexible_wall(inputs)
        self.assertEqual(res['status'], 'success')
        summary = res['summary']
        
        # Verify penetration depth was solved
        self.assertGreater(summary['embedment_req'], 1.0)
        self.assertGreater(summary['embedment_exec'], summary['embedment_req'])
        self.assertGreater(summary['total_length'], 7.0)
        self.assertGreater(summary['anchor_force'], 10.0) # Anchor carries significant load
        self.assertGreater(summary['max_moment'], 50.0)

        # Steel profile selection
        steel = res['steel_design']
        self.assertGreater(steel['W_el_req'], 100.0)
        self.assertIn(steel['selected_profile'], [p['name'] for p in SHEET_PILE_CATALOG])
        self.assertLessEqual(steel['utilization'], 1.0)

        # Profile arrays for plotting
        profiles = res['profiles']
        self.assertEqual(len(profiles['depth']), len(profiles['moment']))
        self.assertEqual(len(profiles['depth']), len(profiles['shear']))

    def test_cantilever_diaphragm_wall(self):
        inputs = {
            'wall_type': 'diaphragm_wall',
            'support_type': 'cantilever',
            'excavation_depth': 4.0,
            'gamma': 19.0,
            'phi': 30.0,
            'cohesion': 5.0,
            'surcharge': 15.0,
            'fck': 30.0
        }
        res = calculate_flexible_wall(inputs)
        self.assertEqual(res['status'], 'success')
        summary = res['summary']
        self.assertEqual(summary['anchor_force'], 0.0) # No anchor in cantilever
        self.assertGreater(summary['embedment_req'], 2.0)
        
        # Concrete sizing
        conc = res['concrete_design']
        self.assertGreaterEqual(conc['thickness'], 0.40)
        self.assertGreater(conc['As_req'], 5.0)

    def test_hydraulic_heave_check(self):
        inputs = {
            'wall_type': 'sheet_pile',
            'excavation_depth': 5.0,
            'water_table_retained': 1.0,
            'water_table_excav': 5.0,
            'gamma_sat': 19.5,
            'gamma_p_sat': 19.5
        }
        res = calculate_flexible_wall(inputs)
        self.assertEqual(res['status'], 'success')
        self.assertIn('hydraulic_check', res)
        self.assertGreater(res['hydraulic_check']['delta_h'], 0.0)
        self.assertGreater(res['hydraulic_check']['fs_piping'], 0.5)


if __name__ == '__main__':
    unittest.main()
