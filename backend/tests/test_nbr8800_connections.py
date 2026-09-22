import unittest
from backend.calculators.nbr8800_connections import calculate_nbr8800_connection


class TestNBR8800Connections(unittest.TestCase):

    def test_flexible_end_plate(self):
        inputs = {
            'type': 'flexible_end_plate',
            'V_sd': 150.0,
            'num_bolt_rows': 4,
            'pitch': 75.0,
            'gauge': 100.0,
            'edge_dist': 35.0,
            't_plate': 9.5,
            't_web': 6.3,
            'weld_size': 6.0,
            'bolt_diameter': '3/4"',
            'bolt_grade': 'ASTM A325',
            'steel_grade': 'ASTM A572 Gr50'
        }
        res = calculate_nbr8800_connection(inputs)
        self.assertEqual(res['status'], 'success')
        self.assertIn('Flexible End Plate', res['connection'])
        self.assertIn('utilization', res['summary'])
        self.assertTrue(0 < res['summary']['utilization'] < 2.0)
        self.assertEqual(len(res['checks']), 4)

    def test_double_angle(self):
        inputs = {
            'type': 'double_angle',
            'V_sd': 120.0,
            'num_bolt_rows': 4,
            't_angle': 7.9,
            't_web': 7.1,
            'bolt_diameter': '3/4"',
            'bolt_grade': 'ASTM A325',
            'steel_grade': 'ASTM A36'
        }
        res = calculate_nbr8800_connection(inputs)
        self.assertEqual(res['status'], 'success')
        self.assertIn('Double Angle', res['connection'])
        self.assertTrue(res['summary']['is_approved'])

    def test_shear_tab(self):
        inputs = {
            'type': 'shear_tab',
            'V_sd': 80.0,
            'num_bolts': 3,
            'eccentricity': 65.0,
            't_plate': 9.5,
            'weld_size': 6.0,
            'bolt_diameter': 'M20',
            'bolt_grade': 'ISO 8.8',
            'steel_grade': 'ASTM A572 Gr50'
        }
        res = calculate_nbr8800_connection(inputs)
        self.assertEqual(res['status'], 'success')
        self.assertIn('Shear Tab', res['connection'])
        self.assertIn('checks', res)
        self.assertGreater(len(res['checks']), 0)

    def test_extended_end_plate_moment(self):
        inputs = {
            'type': 'extended_end_plate',
            'M_sd': 150.0,
            'V_sd': 70.0,
            'd_beam': 400.0,
            'bf_beam': 180.0,
            'tf_beam': 13.5,
            'tw_beam': 8.0,
            't_plate': 25.0,
            'bp_plate': 200.0,
            'num_bolts_flange': 4,
            'bolt_diameter': '7/8"',
            'bolt_grade': 'ASTM A325',
            'steel_grade': 'ASTM A572 Gr50'
        }
        res = calculate_nbr8800_connection(inputs)
        self.assertEqual(res['status'], 'success')
        self.assertIn('Extended End Plate', res['connection'])
        self.assertIn('prying_action', res['details'])
        self.assertIn('utilization', res['summary'])

    def test_column_base_plate(self):
        inputs = {
            'type': 'base_plate',
            'N_sd': 500.0,
            'M_sd': 20.0,
            'V_sd': 30.0,
            'B_p': 400.0,
            'A_p': 400.0,
            't_p': 25.0,
            'd_col': 250.0,
            'bf_col': 250.0,
            'fck_concrete': 30.0,
            'steel_grade': 'ASTM A572 Gr50'
        }
        res = calculate_nbr8800_connection(inputs)
        self.assertEqual(res['status'], 'success')
        self.assertIn('Base Plate', res['connection'])
        self.assertTrue(res['summary']['is_approved'])
        self.assertGreater(res['summary']['tp_req'], 0)


if __name__ == '__main__':
    unittest.main()
