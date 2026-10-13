import unittest
from backend.calculators.tsunami import calculate_tsunami_loads
from backend.calculators.combos import calculate_combinations

class TestTsunamiLoads(unittest.TestCase):
    def test_imperial_tsunami_calculation(self):
        inputs = {
            'tsunami_asce_standard': 'ASCE 7-22',
            'tsunami_unit_system': 'imperial',
            'tsunami_risk_category': 'II',
            'tsunami_design_method': 'LRFD',
            'tsunami_inundation_depth': 10.0,
            'tsunami_flow_velocity': 15.0,
            'tsunami_fluid_density': 75.0,
            'tsunami_internal_depth': 0.0,
            'tsunami_submerged_volume': 300.0,
            'tsunami_component_width': 15.0,
            'tsunami_drag_coefficient': 2.0,
            'tsunami_include_surge': True,
            'tsunami_include_damming': False,
            'tsunami_include_debris': True,
            'tsunami_debris_type': 'log',
            'tsunami_debris_mass': 1000.0,
            'tsunami_debris_stiffness': 1320000.0,
            'tsunami_orientation_factor': 0.65,
            'tsunami_target_stiffness': 'rigid'
        }
        res = calculate_tsunami_loads(inputs)
        self.assertTrue(res['success'])
        self.assertEqual(res['Its'], 1.0)
        
        # Verify Froude number
        # Fr = 15 / sqrt(32.174 * 10) = 15 / 17.937 = ~0.836
        self.assertAlmostEqual(res['hydraulic']['Fr'], 0.836, delta=0.01)
        
        # Verify Hydrodynamic Drag
        # rho_mass = 75 / 32.174 = 2.331
        # Fd = 0.5 * 2.331 * 2.0 * 15 * 10 * (15^2) = 0.5 * 2.331 * 2 * 150 * 225 = 78672.2 lb = ~78.67 kips
        self.assertAlmostEqual(res['forces']['drag']['force'], 78.67, delta=0.5)
        
        # Verify Hydrostatic
        # Fh = 0.5 * 75 * 15 * 10^2 = 56250 lb = 56.25 kips
        self.assertAlmostEqual(res['forces']['hydrostatic']['force'], 56.25, delta=0.5)
        
        # Verify Debris Impact
        # m = 1000 / 32.174 = 31.08 slugs
        # sqrt(k * m) = sqrt(1320000 * 31.08) = sqrt(41026916) = 6405.2
        # Fi = 1.0 * 0.65 * 15 * 6405.2 = 62451 lb = ~62.45 kips
        self.assertAlmostEqual(res['forces']['debris']['force'], 62.45, delta=0.5)
        
        # Verify Governing Force
        # Case 3 (impact + flow): 78.67 + 56.25 + 62.45 = ~197.37 kips
        self.assertGreater(res['results']['Ts_nominal'], 190.0)
        self.assertEqual(res['results']['design_method'], 'LRFD')
        self.assertEqual(res['results']['Ts_design'], res['results']['Ts_nominal'])

    def test_metric_tsunami_calculation(self):
        inputs = {
            'tsunami_asce_standard': 'ASCE 7-22',
            'tsunami_unit_system': 'metric',
            'tsunami_risk_category': 'III',
            'tsunami_design_method': 'ASD',
            'tsunami_inundation_depth': 3.0,
            'tsunami_flow_velocity': 4.5,
            'tsunami_fluid_density': 1200.0,
            'tsunami_internal_depth': 0.0,
            'tsunami_submerged_volume': 8.5,
            'tsunami_component_width': 4.5,
            'tsunami_drag_coefficient': 2.0,
            'tsunami_include_surge': True,
            'tsunami_include_damming': False,
            'tsunami_include_debris': True,
            'tsunami_debris_type': 'log',
            'tsunami_debris_mass': 454.0,
            'tsunami_debris_stiffness': 19200.0, # kN/m
            'tsunami_orientation_factor': 0.65,
            'tsunami_target_stiffness': 'rigid'
        }
        res = calculate_tsunami_loads(inputs)
        self.assertTrue(res['success'])
        self.assertEqual(res['Its'], 1.25)
        
        # Verify Froude number
        # Fr = 4.5 / sqrt(9.80665 * 3.0) = 4.5 / 5.424 = ~0.83
        self.assertAlmostEqual(res['hydraulic']['Fr'], 0.83, delta=0.02)
        
        # Fd = 0.5 * 1200 * 1.25 * 2.0 * 4.5 * 3.0 * (4.5^2) = 1500 * 13.5 * 20.25 = 410062.5 N = ~410.06 kN
        self.assertAlmostEqual(res['forces']['drag']['force'], 410.06, delta=1.0)
        
        # Fh = 0.5 * (1200 * 9.80665) * 4.5 * (3.0^2) = 0.5 * 11767.98 * 4.5 * 9 = ~238.30 kN
        self.assertAlmostEqual(res['forces']['hydrostatic']['force'], 238.30, delta=1.0)
        
        # Debris Fi = 1.25 * 0.65 * 4.5 * sqrt(19.2e6 * 454) = 3.65625 * 93363.8 = 341355 N = ~341.36 kN
        self.assertAlmostEqual(res['forces']['debris']['force'], 341.36, delta=2.0)
        
        # ASD design factor is 0.70
        self.assertEqual(res['results']['design_factor'], 0.70)
        self.assertAlmostEqual(res['results']['Ts_design'], res['results']['Ts_nominal'] * 0.70, delta=0.1)

    def test_combos_tsunami_integration(self):
        combo_inputs = {
            'combo_asce_standard': 'ASCE 7-22',
            'combo_design_method': 'LRFD',
            'combo_unit_system': 'imperial',
            'combo_dead_load_d': 50.0,
            'combo_live_load_l': 20.0,
            'combo_tsunami_load_ts': 35.0
        }
        combos_res = calculate_combinations(combo_inputs)
        # Check that tsunami combinations T1 and T2 are generated in base results
        # In ASCE 7-22 LRFD: T1 = 1.2 D + Ts + 0.5 L = 1.2(50) + 35 + 0.5(20) = 60 + 35 + 10 = 105
        base_results = combos_res.get('base', {}).get('results', {})
        self.assertIn('T1 (Tsunami)', base_results)
        self.assertAlmostEqual(base_results['T1 (Tsunami)'], 105.0, delta=0.1)
        
        # T2 = 0.9 D + Ts = 0.9(50) + 35 = 45 + 35 = 80
        self.assertIn('T2 (Tsunami)', base_results)
        self.assertAlmostEqual(base_results['T2 (Tsunami)'], 80.0, delta=0.1)


if __name__ == '__main__':
    unittest.main()
