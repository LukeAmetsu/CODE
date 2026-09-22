"""
Test Suite for Unified Steel Connections Module (NBR 8800 & AISC 360 LRFD / ASD)
Validates mathematical consistency of capacity checks, safety factors, and geometry across standards.
"""

import unittest
from backend.calculators.steel_connections import calculate_steel_connection


class TestSteelConnectionsUnified(unittest.TestCase):

    def setUp(self):
        # Base common input geometries
        self.fep_inputs = {
            'type': 'flexible_end_plate',
            'V_sd': 150.0,
            'num_rows': 4,
            'pitch': 75.0,
            'gauge': 100.0,
            'edge_dist': 35.0,
            't_plate': 9.5,
            't_web': 6.3,
            'weld_leg': 6.0,
            'bolt_diameter': '3/4"',
            'bolt_grade': 'ASTM A325',
            'steel_grade': 'ASTM A572 Gr50'
        }

        self.da_inputs = {
            'type': 'double_angle',
            'V_sd': 150.0,
            'num_rows': 4,
            't_angle': 7.9,
            't_web': 7.1,
            'bolt_diameter': '3/4"',
            'bolt_grade': 'ASTM A325',
            'steel_grade': 'ASTM A36'
        }

        self.st_inputs = {
            'type': 'shear_tab',
            'V_sd': 100.0,
            'num_bolts': 4,
            'eccentricity': 65.0,
            't_plate': 9.5,
            'weld_leg': 6.0,
            'bolt_diameter': '3/4"',
            'bolt_grade': 'ASTM A325',
            'steel_grade': 'ASTM A572 Gr50'
        }

        self.eep_inputs = {
            'type': 'extended_end_plate',
            'M_sd': 150.0,
            'V_sd': 70.0,
            'd_beam': 400.0,
            'b_f': 180.0,
            'tf_beam': 13.5,
            't_plate': 22.0,
            'bolt_diameter': '7/8"',
            'bolt_grade': 'ASTM A325',
            'steel_grade': 'ASTM A572 Gr50'
        }

        self.bp_inputs = {
            'type': 'base_plate',
            'N_sd': 450.0,
            'V_sd': 40.0,
            'M_sd': 20.0,
            'B': 400.0,
            'N': 400.0,
            't_plate': 25.0,
            'd_col': 200.0,
            'bf_col': 200.0,
            'fck': 25.0,
            'bolt_diameter': '3/4"',
            'steel_grade': 'ASTM A572 Gr50'
        }

    # -------------------------------------------------------------
    # 1. Flexible End Plate Checks Across Standards
    # -------------------------------------------------------------
    def test_flexible_end_plate_standards(self):
        res_nbr = calculate_steel_connection({**self.fep_inputs, 'standard': 'NBR 8800'})
        res_lrfd = calculate_steel_connection({**self.fep_inputs, 'standard': 'AISC 360', 'method': 'LRFD'})
        res_asd = calculate_steel_connection({**self.fep_inputs, 'standard': 'AISC 360', 'method': 'ASD'})

        self.assertEqual(res_nbr['status'], 'success')
        self.assertEqual(res_lrfd['status'], 'success')
        self.assertEqual(res_asd['status'], 'success')

        # Check that standards and citations are correctly identified
        self.assertIn('NBR 8800', res_nbr['standard'])
        self.assertIn('LRFD', res_lrfd['standard'])
        self.assertIn('ASD', res_asd['standard'])

        # Compare bolt shear capacity:
        # NBR uses γa2=1.35 on 0.40*Ares*fub
        # LRFD uses φ=0.75 on Fnv*Ab
        # ASD uses Fnv*Ab / 2.00 -> ASD capacity must be strictly less than LRFD (by factor 1.5/2 = 0.75 / 1.0)
        cap_bolt_nbr = next(c['capacity'] for c in res_nbr['limit_states'] if 'Parafusos' in c['limit_state'])
        cap_bolt_lrfd = next(c['capacity'] for c in res_lrfd['limit_states'] if 'Parafusos' in c['limit_state'])
        cap_bolt_asd = next(c['capacity'] for c in res_asd['limit_states'] if 'Parafusos' in c['limit_state'])

        self.assertGreater(cap_bolt_nbr, 0)
        self.assertGreater(cap_bolt_lrfd, 0)
        self.assertGreater(cap_bolt_asd, 0)
        self.assertAlmostEqual(cap_bolt_lrfd / cap_bolt_asd, 1.5, delta=0.01)

    # -------------------------------------------------------------
    # 2. Double Angle Checks Across Standards
    # -------------------------------------------------------------
    def test_double_angle_standards(self):
        res_nbr = calculate_steel_connection({**self.da_inputs, 'standard': 'NBR 8800'})
        res_lrfd = calculate_steel_connection({**self.da_inputs, 'standard': 'AISC 360', 'method': 'LRFD'})
        res_asd = calculate_steel_connection({**self.da_inputs, 'standard': 'AISC 360', 'method': 'ASD'})

        self.assertEqual(res_nbr['status'], 'success')
        self.assertEqual(res_lrfd['status'], 'success')
        self.assertEqual(res_asd['status'], 'success')

        # Angle shear gross yielding:
        # NBR: (0.60 * Agv * fy) / 1.10
        # AISC LRFD: 1.00 * (0.60 * Agv * fy)
        # AISC ASD: (0.60 * Agv * fy) / 1.50
        sy_nbr = next(c['capacity'] for c in res_nbr['limit_states'] if 'Escoamento' in c['limit_state'])
        sy_lrfd = next(c['capacity'] for c in res_lrfd['limit_states'] if 'Escoamento' in c['limit_state'])
        sy_asd = next(c['capacity'] for c in res_asd['limit_states'] if 'Escoamento' in c['limit_state'])

        self.assertAlmostEqual(sy_lrfd / sy_asd, 1.50, delta=0.01)
        self.assertAlmostEqual(sy_lrfd / sy_nbr, 1.10, delta=0.01)

    # -------------------------------------------------------------
    # 3. Shear Tab Checks Across Standards
    # -------------------------------------------------------------
    def test_shear_tab_standards(self):
        res_nbr = calculate_steel_connection({**self.st_inputs, 'standard': 'NBR 8800'})
        res_lrfd = calculate_steel_connection({**self.st_inputs, 'standard': 'AISC 360', 'method': 'LRFD'})
        res_asd = calculate_steel_connection({**self.st_inputs, 'standard': 'AISC 360', 'method': 'ASD'})

        self.assertEqual(res_nbr['status'], 'success')
        self.assertEqual(res_lrfd['status'], 'success')
        self.assertEqual(res_asd['status'], 'success')

        # Plate flexure check:
        # NBR uses γa1=1.10
        # AISC LRFD uses φ=0.90
        # AISC ASD uses Ω=1.67
        flex_nbr = next(c['ref'] for c in res_nbr['limit_states'] if 'Flexão' in c['limit_state'])
        flex_lrfd = next(c['ref'] for c in res_lrfd['limit_states'] if 'Flexão' in c['limit_state'])
        flex_asd = next(c['ref'] for c in res_asd['limit_states'] if 'Flexão' in c['limit_state'])

        self.assertIn('NBR 8800', flex_nbr)
        self.assertIn('AISC 360-22', flex_lrfd)
        self.assertIn('AISC 360-22', flex_asd)

    # -------------------------------------------------------------
    # 4. Extended End Plate (Moment) Checks Across Standards
    # -------------------------------------------------------------
    def test_extended_end_plate_standards(self):
        res_nbr = calculate_steel_connection({**self.eep_inputs, 'standard': 'NBR 8800'})
        res_lrfd = calculate_steel_connection({**self.eep_inputs, 'standard': 'AISC 360', 'method': 'LRFD'})
        res_asd = calculate_steel_connection({**self.eep_inputs, 'standard': 'AISC 360', 'method': 'ASD'})

        self.assertEqual(res_nbr['status'], 'success')
        self.assertEqual(res_lrfd['status'], 'success')
        self.assertEqual(res_asd['status'], 'success')

        # Bolt tensile capacity:
        # LRFD vs ASD ratio must be 0.75 / (1/2.0) = 1.50
        ft_lrfd = next(c['capacity'] for c in res_lrfd['limit_states'] if 'Tração' in c['limit_state'])
        ft_asd = next(c['capacity'] for c in res_asd['limit_states'] if 'Tração' in c['limit_state'])
        self.assertAlmostEqual(ft_lrfd / ft_asd, 1.50, delta=0.01)

        # Detailing must show prying action status in all
        self.assertIn('prying_status', res_nbr['detailing'])
        self.assertIn('prying_status', res_lrfd['detailing'])
        self.assertIn('prying_status', res_asd['detailing'])

    # -------------------------------------------------------------
    # 5. Column Base Plate Checks Across Standards
    # -------------------------------------------------------------
    def test_base_plate_standards(self):
        res_nbr = calculate_steel_connection({**self.bp_inputs, 'standard': 'NBR 8800'})
        res_lrfd = calculate_steel_connection({**self.bp_inputs, 'standard': 'AISC 360', 'method': 'LRFD'})
        res_asd = calculate_steel_connection({**self.bp_inputs, 'standard': 'AISC 360', 'method': 'ASD'})

        self.assertEqual(res_nbr['status'], 'success')
        self.assertEqual(res_lrfd['status'], 'success')
        self.assertEqual(res_asd['status'], 'success')

        # Concrete bearing design capacity f_cd:
        # NBR uses γc=1.40
        # AISC LRFD uses φ=0.65
        # AISC ASD uses Ω=2.31
        conc_nbr = next(c['capacity'] for c in res_nbr['limit_states'] if 'Concreto' in c['limit_state'])
        conc_lrfd = next(c['capacity'] for c in res_lrfd['limit_states'] if 'Concreto' in c['limit_state'])
        conc_asd = next(c['capacity'] for c in res_asd['limit_states'] if 'Concreto' in c['limit_state'])

        self.assertGreater(conc_nbr, 0)
        self.assertGreater(conc_lrfd, 0)
        self.assertGreater(conc_asd, 0)
        # LRFD vs ASD ratio: 0.65 * 2.31 = 1.5015
        self.assertAlmostEqual(conc_lrfd / conc_asd, 1.5015, delta=0.02)


if __name__ == '__main__':
    unittest.main()
