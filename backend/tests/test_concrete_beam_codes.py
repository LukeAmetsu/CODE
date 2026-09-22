import sys
import os
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from backend.calculators.nbr_6118_concrete import (
    calculate_nbr_6118,
    calculate_aci_318,
    calculate_eurocode_2,
    calculate_concrete_beam
)

class TestConcreteBeamCodes(unittest.TestCase):
    def setUp(self):
        # Conventional beam: 20x50 cm, fck=25 MPa, fyk=500 MPa, c=3.0 cm, 3 phi 16 mm, stirrups 2 legs phi 6.3 c/ 15 cm
        self.base_inputs = {
            'fck': 25,
            'fyk': 500,
            'bw': 20,
            'h': 50,
            'c': 3.0,
            'num_barras': 3,
            'diam_barra': 16.0,
            'diam_estribo': 6.3,
            'pernas_estribo': 2,
            's_estribo': 15,
            'Msd': 100,
            'Vsd': 80
        }

    def test_nbr_6118(self):
        res = calculate_nbr_6118(self.base_inputs)
        self.assertEqual(res['code'], 'nbr')
        self.assertAlmostEqual(res['safety_factors']['gamma_c'], 1.40)
        self.assertAlmostEqual(res['safety_factors']['gamma_s'], 1.15)
        
        flex = res['flexure_details']
        self.assertAlmostEqual(flex['d'], 50 - 3.0 - 0.63 - 0.8, places=2)
        self.assertAlmostEqual(flex['As'], 6.03, places=1)
        self.assertGreater(flex['Mrd_kNm'], 90.0)
        self.assertTrue(flex['is_ductile'])
        
        shear = res['shear_details']
        self.assertGreater(shear['VRd'], 60.0)
        self.assertGreater(shear['VRd2'], 200.0)

    def test_aci_318(self):
        res = calculate_aci_318(self.base_inputs)
        self.assertEqual(res['code'], 'aci')
        flex = res['flexure_details']
        self.assertAlmostEqual(flex['beta1'], 0.85, places=2)
        # For this beam, epsilon_t is well above 0.005 -> phi = 0.90
        self.assertAlmostEqual(flex['phi_flex'], 0.90, places=2)
        self.assertGreater(flex['Mrd_kNm'], 90.0)
        self.assertTrue(flex['is_ductile'])
        
        shear = res['shear_details']
        self.assertEqual(shear['phi_shear'], 0.75)
        self.assertGreater(shear['VRd'], 50.0)

    def test_eurocode_2(self):
        res = calculate_eurocode_2(self.base_inputs)
        self.assertEqual(res['code'], 'ec2')
        self.assertAlmostEqual(res['safety_factors']['gamma_c'], 1.50)
        self.assertAlmostEqual(res['safety_factors']['gamma_s'], 1.15)
        
        flex = res['flexure_details']
        self.assertGreater(flex['Mrd_kNm'], 85.0)
        self.assertTrue(flex['is_ductile'])
        
        shear = res['shear_details']
        self.assertEqual(shear['cot_theta'], 2.5)
        self.assertGreater(shear['VRd'], 60.0)
        self.assertGreater(shear['VRd2'], 200.0)

    def test_multi_code_comparison(self):
        full_res = calculate_concrete_beam({**self.base_inputs, 'code': 'all'})
        self.assertTrue(full_res['success'])
        self.assertIn('comparison', full_res)
        self.assertEqual(len(full_res['comparison']), 3)
        
        keys = [c['code_key'] for c in full_res['comparison']]
        self.assertEqual(keys, ['nbr', 'aci', 'ec2'])
        
        for c in full_res['comparison']:
            self.assertGreater(c['Mrd_kNm'], 50.0)
            self.assertGreater(c['VRd_kN'], 40.0)
            self.assertIsInstance(c['is_safe'], bool)

if __name__ == '__main__':
    unittest.main()
