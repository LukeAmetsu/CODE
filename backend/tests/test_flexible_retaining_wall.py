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

    def test_excel_strap_preset_and_springs(self):
        """Verifies STRAP spreadsheet reference preset from Empuxos_Atualizados_Interfaces.xlsx."""
        inputs = {
            'preset': 'strap_excel',
            'support_type': 'cantilever',
            'H': 2.5,
            'total_length': 12.0,
            'length_mode': 'manual',
            'zw_retained': 2.5,
            'zw_passive': 2.5,
            'q_surcharge': 30.0,
            'pile_width': 1.0
        }
        res = calculate_flexible_wall(inputs)
        self.assertEqual(res['status'], 'success')
        
        # Verify springs table
        self.assertIn('springs_table', res)
        springs = res['springs_table']
        self.assertGreater(len(springs), 20)
        
        first_node = springs[0]
        self.assertEqual(first_node['z'], 0.0)
        self.assertEqual(first_node['K_mola_kN'], 0.0) # No passive spring above excavation
        
        bottom_node = springs[-1]
        self.assertEqual(bottom_node['z'], 12.0)
        self.assertGreater(bottom_node['K_mola_kN'], 0.0)
        self.assertGreater(bottom_node['Fmax_kN'], 0.0)
        self.assertGreater(bottom_node['x2_mm'], 0.0)
        
        # Verify global cantilever equilibrium
        self.assertIn('global_cantilever_equilibrium', res)
        eq = res['global_cantilever_equilibrium']
        self.assertGreater(eq['fs_sliding'], 1.5)
        self.assertGreater(eq['fs_overturning'], 1.5)
        self.assertEqual(eq['status_sliding'], 'OK (Seguro)')
        self.assertEqual(eq['status_overturning'], 'OK (Seguro)')
        
        # Verify STRAP export text
        self.assertIn('strap_export', res)
        self.assertIn('Fa_Solo', res['strap_export'])
        self.assertIn('K_mola', res['strap_export'])

    def test_geotechnical_correlations(self):
        """Tests geotechnical relations: E = alpha * N_SPT * 100, K0 = 1 - sin(phi), nu, Bulk, Shear."""
        from backend.calculators.flexible_retaining_wall import calc_geotechnical_correlations
        corr = calc_geotechnical_correlations(phi_deg=30.0, nspt=10.0, alpha=2.0)
        self.assertAlmostEqual(corr['K0'], 0.5, places=2)
        self.assertAlmostEqual(corr['nu'], 0.333, places=2)
        self.assertAlmostEqual(corr['E_tf_m2'], 2000.0, places=1)
        self.assertAlmostEqual(corr['E_kPa'], 20000.0, places=1)
        self.assertAlmostEqual(corr['Ka'], 0.333, places=2)
        self.assertAlmostEqual(corr['Kp'], 3.0, places=2)


if __name__ == '__main__':
    unittest.main()
