import unittest
from backend.calculators.nbr_8800_steel import calculate_steel_structure as nbr_steel_calc
from backend.calculators.steel_check import steel_checker


class TestUnifiedSteelStructures(unittest.TestCase):

    def setUp(self):
        # Gerdau W 530 x 82.0 profile properties
        self.w530_82 = {
            'fy': 345.0,        # MPa
            'E': 200000.0,      # MPa
            'd': 528.0,         # mm
            'bf': 209.0,        # mm
            'tf': 13.3,         # mm
            'tw': 8.9,          # mm
            'Ag': 10500.0,      # mm^2
            'Zx': 2060000.0,    # mm^3
            'rx': 213.0,        # mm
            'ry': 43.8,         # mm
            'Lb': 5.0,          # m
            'Cb': 1.0,
            'Nsd': 500.0,       # kN
            'Msdx': 220.0       # kN.m
        }

    def test_nbr8800_w530_82_nominal_check(self):
        """Test standard NBR 8800:2008 verification for W 530 x 82."""
        res = nbr_steel_calc(self.w530_82)
        r = res['results']

        self.assertEqual(r['classificacao_mesa'], 'Compacta')
        self.assertEqual(r['classificacao_alma'], 'Compacta')

        # Compression Nc,Rd must be positive and reasonable (~1500-2500 kN)
        ncrd_kn = r['NcRd'] / 1000.0
        self.assertGreater(ncrd_kn, 1200.0)
        self.assertLess(ncrd_kn, 3000.0)

        # Flexure Mrd must be positive and reasonable (~400-650 kN.m)
        mrd_knm = r['Mrd'] / 1e6
        self.assertGreater(mrd_knm, 350.0)
        self.assertLess(mrd_knm, 700.0)

        # Inelastic FLT regime for Lb = 5.0m
        self.assertIn('Inelástica', r['regime_flt'])

        # Interaction ratio check
        self.assertGreater(r['interaction_ratio'], 0.4)
        self.assertLess(r['interaction_ratio'], 1.2)

    def test_nbr8800_flt_regimes(self):
        """Verify transitions between Contido (Lp), Inelástico, and Elástico (Lr)."""
        # Case 1: Lb <= Lp -> Full Plastic Moment
        inputs_compact = self.w530_82.copy()
        inputs_compact['Lb'] = 1.0  # 1m < Lp (~2.2m)
        r_compact = nbr_steel_calc(inputs_compact)['results']
        self.assertEqual(r_compact['regime_flt'], 'Contido (Sem FLT)')
        gamma_a1 = 1.10
        expected_mpl_rd = (self.w530_82['Zx'] * self.w530_82['fy']) / gamma_a1
        self.assertAlmostEqual(r_compact['Mrd'], expected_mpl_rd, places=1)

        # Case 2: Lb > Lr -> Elastic LTB
        inputs_slender = self.w530_82.copy()
        inputs_slender['Lb'] = 12.0  # 12m > Lr (~6.5m)
        r_slender = nbr_steel_calc(inputs_slender)['results']
        self.assertEqual(r_slender['regime_flt'], 'Elástico (FLT Elástica)')
        self.assertLess(r_slender['Mrd'], expected_mpl_rd)

    def test_aisc_steel_checker_lrfd(self):
        """Test AISC 360 LRFD calculation using SteelChecker engine."""
        inputs = {
            'design_method': 'LRFD',
            'section_type': 'I-Shape',
            'Fy': 50.0,         # ksi
            'Fu': 65.0,         # ksi
            'd': 14.0,          # in
            'bf': 14.5,         # in
            'tf': 0.71,         # in
            'tw': 0.44,         # in
            'Ag_manual': 26.5,   # in^2
            'Zx_manual': 157.0,  # in^3
            'Sx_manual': 143.0,  # in^3
            'rx': 6.14,         # in
            'ry_manual': 3.70,  # in
            'rts_manual': 4.11, # in
            'J_manual': 4.06,   # in^4
            'k_des': 1.31,
            'Lb_input': 15.0,   # ft
            'Cb': 1.0,
            'K': 1.0,
            'Pu_or_Pa': -150.0, # kips (compression negative)
            'Mux_or_Max': 200.0, # kip-ft
            'Muy_or_May': 0.0,
            'Vu_or_Va': 30.0
        }
        res = steel_checker.run(inputs)

        self.assertIn('flexure', res)
        self.assertIn('axial', res)
        self.assertIn('interaction', res)

        phi_mn = res['flexure']['phiMn']
        self.assertGreater(phi_mn, 400.0) # kip-ft

        phi_pn = res['axial']['phiPn']
        self.assertGreater(phi_pn, 700.0) # kips

        dcr = res['interaction']['ratio']
        self.assertGreater(dcr, 0.2)
        self.assertLess(dcr, 1.0)
        self.assertIn(res['interaction']['equation'], ['H1-1a', 'H1-1b'])

    def test_aisc_steel_checker_asd(self):
        """Test AISC 360 ASD calculation."""
        inputs = {
            'design_method': 'ASD',
            'section_type': 'I-Shape',
            'Fy': 50.0,
            'Fu': 65.0,
            'd': 14.0,
            'bf': 14.5,
            'tf': 0.71,
            'tw': 0.44,
            'Ag_manual': 26.5,
            'Zx_manual': 157.0,
            'Sx_manual': 143.0,
            'rx': 6.14,
            'ry_manual': 3.70,
            'rts_manual': 4.11,
            'J_manual': 4.06,
            'k_des': 1.31,
            'Lb_input': 15.0,
            'Cb': 1.0,
            'K': 1.0,
            'Pu_or_Pa': -100.0,
            'Mux_or_Max': 130.0,
            'Muy_or_May': 0.0,
            'Vu_or_Va': 20.0
        }
        res = steel_checker.run(inputs)
        # ASD capacity must be lower than LRFD (nominal / 1.67 vs nominal * 0.9)
        mn_omega = res['flexure']['phiMn'] # in ASD phiMn is Mn / Omega
        self.assertGreater(mn_omega, 250.0)
        self.assertLess(mn_omega, 550.0)

    def test_main_eel_calculate_steel_structure(self):
        """Test dispatcher in main_eel for unified steel structure calculation."""
        import backend.main_eel as me

        # NBR call
        nbr_in = self.w530_82.copy()
        nbr_in['standard'] = 'nbr'
        res_nbr = me.calculate_steel_structure(nbr_in)
        self.assertIn('results', res_nbr)
        self.assertIn('interaction_ratio', res_nbr['results'])

        # AISC call
        aisc_in = {
            'standard': 'aisc',
            'design_method': 'LRFD',
            'section_type': 'I-Shape',
            'Fy': 50.0,
            'Fu': 65.0,
            'd': 14.0,
            'bf': 14.5,
            'tf': 0.71,
            'tw': 0.44,
            'Ag_manual': 26.5,
            'Zx_manual': 157.0,
            'Sx_manual': 143.0,
            'rx': 6.14,
            'ry_manual': 3.70,
            'rts_manual': 4.11,
            'J_manual': 4.06,
            'k_des': 1.31,
            'Lb_input': 15.0,
            'Cb': 1.0,
            'K': 1.0,
            'Pu_or_Pa': -150.0,
            'Mux_or_Max': 200.0
        }
        res_aisc = me.calculate_steel_structure(aisc_in)
        self.assertIn('interaction', res_aisc)
        self.assertIn('ratio', res_aisc['interaction'])


if __name__ == '__main__':
    unittest.main()
