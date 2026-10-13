import unittest
from backend.calculators.seismic import (
    calculate_seismic_loads,
    get_site_coefficients,
    determine_seismic_design_category,
    calculate_cu,
    calculate_approx_period
)

class TestSeismicLoads(unittest.TestCase):
    def test_site_coefficients(self):
        # Class D at Ss=1.00 -> Fa=1.1, S1=0.40 -> Fv=1.9
        fa, fv = get_site_coefficients('D', 1.00, 0.40)
        self.assertEqual(fa, 1.1)
        self.assertEqual(fv, 1.9)
        
        # Class A at any Ss/S1 -> 0.8
        fa_a, fv_a = get_site_coefficients('A', 1.5, 0.6)
        self.assertEqual(fa_a, 0.8)
        self.assertEqual(fv_a, 0.8)

    def test_seismic_design_category(self):
        # High seismicity S1 >= 0.75 -> SDC E/F
        sdc_iv, _, _ = determine_seismic_design_category(1.2, 0.8, 0.80, "IV")
        self.assertEqual(sdc_iv, "F")
        sdc_ii, _, _ = determine_seismic_design_category(1.2, 0.8, 0.80, "II")
        self.assertEqual(sdc_ii, "E")
        
        # Moderate
        sdc_c, _, _ = determine_seismic_design_category(0.40, 0.15, 0.20, "II")
        self.assertEqual(sdc_c, "C")

    def test_cu_factor(self):
        self.assertEqual(calculate_cu(0.45), 1.40)
        self.assertEqual(calculate_cu(0.08), 1.70)

    def test_seismic_full_calculation_metric(self):
        inputs = {
            'seismic_asce_standard': 'ASCE 7-22',
            'seismic_unit_system': 'metric',
            'seismic_risk_category': 'IV',
            'seismic_site_class': 'D',
            'seismic_ss': 1.50,
            'seismic_s1': 0.60,
            'seismic_tl': 8.0,
            'seismic_sfrs_type': 'wharf_ductile_concrete_piles',
            'seismic_r': 3.0,
            'seismic_omega0': 2.0,
            'seismic_cd': 3.0,
            'seismic_height_hn': 24.0,
            'seismic_weight_w': 50000.0,
            'seismic_num_stories': 1,
            'seismic_is_wharf': True,
            'seismic_wharf_deck_w': 35000.0,
            'seismic_wharf_num_piles': 36,
            'seismic_wharf_pile_diam': 1.20,
            'seismic_wharf_pile_sub_len': 18.0,
            'seismic_wharf_pile_total_len': 24.0
        }
        res = calculate_seismic_loads(inputs)
        self.assertTrue(res['success'])
        self.assertEqual(res['importance_factor_Ie'], 1.50)
        self.assertEqual(res['sdc']['governing'], 'D')
        
        # Verify SDS = 2/3 * Fa * Ss
        # For D, Ss=1.50 -> Fa=1.0 -> SMS = 1.5 -> SDS = 1.00
        self.assertAlmostEqual(res['spectral_parameters']['SDS'], 1.00, delta=0.05)
        
        # Verify Cs and Base Shear
        self.assertGreater(res['seismic_coefficient_cs']['Cs_governing'], 0.10)
        self.assertGreater(res['base_shear']['V'], 5000.0)
        self.assertGreater(res['wharf_module']['V_wharf'], 4000.0)
        self.assertEqual(len(res['stories']), 1)
        self.assertGreater(len(res['spectrum_curve']), 30)

    def test_seismic_full_calculation_imperial(self):
        inputs = {
            'seismic_asce_standard': 'ASCE 7-16',
            'seismic_unit_system': 'imperial',
            'seismic_risk_category': 'II',
            'seismic_site_class': 'C',
            'seismic_ss': 1.00,
            'seismic_s1': 0.40,
            'seismic_tl': 6.0,
            'seismic_sfrs_type': 'steel_smf',
            'seismic_r': 8.0,
            'seismic_omega0': 3.0,
            'seismic_cd': 5.5,
            'seismic_height_hn': 120.0, # 120 ft
            'seismic_weight_w': 10000.0, # 10,000 kips
            'seismic_num_stories': 10
        }
        res = calculate_seismic_loads(inputs)
        self.assertTrue(res['success'])
        self.assertEqual(res['importance_factor_Ie'], 1.00)
        self.assertEqual(len(res['stories']), 10)
        self.assertAlmostEqual(sum(s['Fx_kN'] for s in res['stories']), res['base_shear']['V'], delta=1.0)

if __name__ == '__main__':
    unittest.main()
