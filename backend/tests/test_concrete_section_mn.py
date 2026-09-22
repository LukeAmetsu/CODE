import unittest
from backend.calculators.nbr_6118_concrete import calculate_concrete_beam, calculate_nbr_6118, calculate_aci_318, calculate_eurocode_2

class TestConcreteSectionMN(unittest.TestCase):
    def setUp(self):
        self.base_inputs = {
            'bw': 25.0,
            'h': 60.0,
            'c': 3.0,
            'fck': 30.0,
            'fyk': 500.0,
            'num_barras': 4,
            'diam_barra': 16.0,
            'num_barras_top': 2,
            'diam_barra_top': 10.0,
            'Msd': 120.0,
            'Vsd': 60.0,
            'Nsd': 0.0,
            's_estribo': 15.0,
            'diam_estribo': 8.0,
            'pernas_estribo': 2
        }

    def test_pure_flexure(self):
        """Pure bending (Nsd = 0) produces valid ductile moment resistance."""
        res = calculate_concrete_beam(self.base_inputs)
        nbr = res['results']['flexure_details']
        self.assertGreater(nbr['Mrd_kNm'], 100.0)
        self.assertLess(nbr['x_d_ratio'], 0.45)
        self.assertIn('mn_curve', res['results'])
        self.assertGreater(len(res['results']['mn_curve']['N']), 20)

    def test_compression_axial_load(self):
        """Axial compression (Nsd < 0) increases neutral axis depth and enhances shear Vc."""
        inputs_comp = self.base_inputs.copy()
        inputs_comp['Nsd'] = -250.0  # 250 kN compression
        
        res_pure = calculate_concrete_beam(self.base_inputs)
        res_comp = calculate_concrete_beam(inputs_comp)
        
        nbr_pure = res_pure['results']
        nbr_comp = res_comp['results']
        
        # In compression, neutral axis depth x increases
        self.assertGreater(nbr_comp['flexure_details']['x'], nbr_pure['flexure_details']['x'])
        # Compression also enhances concrete shear capacity Vc
        self.assertGreater(nbr_comp['shear_details']['Vc'], nbr_pure['shear_details']['Vc'])

    def test_tension_axial_load(self):
        """Axial tension (Nsd > 0) decreases neutral axis depth and reduces shear Vc."""
        inputs_tens = self.base_inputs.copy()
        inputs_tens['Nsd'] = 150.0  # 150 kN tension
        
        res_pure = calculate_concrete_beam(self.base_inputs)
        res_tens = calculate_concrete_beam(inputs_tens)
        
        nbr_pure = res_pure['results']
        nbr_tens = res_tens['results']
        
        # In tension, neutral axis depth x decreases
        self.assertLess(nbr_tens['flexure_details']['x'], nbr_pure['flexure_details']['x'])
        # Tension reduces concrete shear capacity Vc
        self.assertLess(nbr_tens['shear_details']['Vc'], nbr_pure['shear_details']['Vc'])

    def test_multicode_comparison_with_axial(self):
        """ACI and EC2 also handle axial load and return interaction curves."""
        inputs_comp = self.base_inputs.copy()
        inputs_comp['Nsd'] = -100.0
        res = calculate_concrete_beam(inputs_comp)
        
        self.assertIn('all_codes', res)
        aci = res['all_codes']['aci']
        ec2 = res['all_codes']['ec2']
        
        self.assertIn('mn_curve', aci)
        self.assertIn('mn_curve', ec2)
        self.assertGreater(aci['flexure_details']['Mrd_kNm'], 50.0)
        self.assertGreater(ec2['flexure_details']['Mrd_kNm'], 50.0)

if __name__ == '__main__':
    unittest.main()
