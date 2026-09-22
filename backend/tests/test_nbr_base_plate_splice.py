import unittest
import math
from backend.calculators.base_plate import (
    calculate_base_plate,
    is_nbr_standard as base_plate_is_nbr,
    get_phi as base_plate_get_phi,
    check_plate_bending_unified,
    check_concrete_bearing
)
from backend.calculators.splice import (
    splice_calc,
    is_nbr_standard as splice_is_nbr,
    get_design_factors as splice_get_design_factors
)


class TestNBRBasePlateAndSplice(unittest.TestCase):

    def setUp(self):
        # Base Plate Standard Inputs
        self.bp_inputs_aisc = {
            'design_standard': 'AISC 360-16',
            'design_method': 'LRFD',
            'base_plate_length_N': 16.0,
            'base_plate_width_B': 16.0,
            'provided_plate_thickness_tp': 1.25,
            'base_plate_Fy': 36.0,
            'base_plate_Fu': 58.0,
            'column_depth_d': 10.0,
            'column_flange_width_bf': 10.0,
            'column_flange_tf': 0.5,
            'column_web_tw': 0.3,
            'column_type': 'Wide Flange',
            'concrete_fc': 4.0,  # 4 ksi
            'pedestal_N': 24.0,
            'pedestal_B': 24.0,
            'axial_load_P_in': -100.0,  # 100 kips compression
            'moment_Mx_in': 15.0,       # 15 kip-ft
            'moment_My_in': 0.0,
            'shear_V_in': 25.0,         # 25 kips
            'num_bolts_N': 2,
            'num_bolts_B': 2,
            'bolt_spacing_N': 11.0,
            'bolt_spacing_B': 11.0,
            'anchor_bolt_diameter': 0.875,
            'anchor_bolt_Fut': 58.0,
            'anchor_embedment_hef': 12.0,
            'concrete_edge_dist_ca1': 6.5,
            'concrete_edge_dist_ca2': 6.5
        }

        self.bp_inputs_nbr = self.bp_inputs_aisc.copy()
        self.bp_inputs_nbr['design_standard'] = 'ABNT NBR 8800:2008'

        # Splice Standard Inputs
        self.splice_inputs_aisc = {
            'design_standard': 'AISC 360-16',
            'design_method': 'LRFD',
            'jurisdiction': 'AISC',
            'gap': 0.5,
            'member_d': 18.0,
            'member_bf': 7.5,
            'member_tf': 0.57,
            'member_tw': 0.355,
            'member_Fy': 50.0,
            'member_Fu': 65.0,
            'member_Zx': 100.0,
            'member_Sx': 88.9,
            'member_shape_type': 'W-Shape',
            'num_flange_plates': 1,
            'H_fp': 7.0,
            't_fp': 0.5,
            'L_fp': 24.0,
            'flange_plate_Fy': 36.0,
            'flange_plate_Fu': 58.0,
            'Nc_fp': 3,
            'Nr_fp': 1,
            'S1_col_spacing_fp': 3.0,
            'S2_row_spacing_fp': 0.0,
            'S3_end_dist_fp': 1.5,
            'g_gage_fp': 4.0,
            'D_fp': 0.75,
            'bolt_grade_fp': 'A325',
            'num_web_plates': 2,
            'H_wp': 12.0,
            't_wp': 0.375,
            'L_wp': 18.0,
            'web_plate_Fy': 36.0,
            'web_plate_Fu': 58.0,
            'Nc_wp': 2,
            'Nr_wp': 3,
            'S4_col_spacing_wp': 3.0,
            'S5_row_spacing_wp': 3.0,
            'S6_end_dist_wp': 1.5,
            'D_wp': 0.75,
            'bolt_grade_wp': 'A325',
            'M_load': 50.0,   # kip-ft
            'V_load': 30.0,   # kips
            'Axial_load': 0.0
        }

        self.splice_inputs_nbr = self.splice_inputs_aisc.copy()
        self.splice_inputs_nbr['design_standard'] = 'ABNT NBR 8800:2008'

    # --- Base Plate Tests ---

    def test_base_plate_is_nbr_detection(self):
        """Verify NBR detection helper for base plate."""
        self.assertTrue(base_plate_is_nbr({'design_standard': 'ABNT NBR 8800:2008'}))
        self.assertTrue(base_plate_is_nbr({'standard': 'NBR 8800'}))
        self.assertTrue(base_plate_is_nbr({'design_code': 'ABNT NBR 8800:2008 / NBR 6118:2023'}))
        self.assertFalse(base_plate_is_nbr({'design_standard': 'AISC 360-16'}))

    def test_base_plate_nbr_safety_factors(self):
        """Verify partial safety factors per NBR 8800 / NBR 6118."""
        # Concrete bearing: gamma_c = 1.40 -> phi = 1 / 1.40
        phi_bearing = base_plate_get_phi('bearing', 'LRFD', 'AISC', is_nbr=True)
        self.assertAlmostEqual(phi_bearing, 1.0 / 1.40, places=4)

        # Steel bending: gamma_a0 = 1.10 -> phi = 1 / 1.10
        phi_bending = base_plate_get_phi('bending', 'LRFD', 'AISC', is_nbr=True)
        self.assertAlmostEqual(phi_bending, 1.0 / 1.10, places=4)

        # Anchor steel: gamma_a2 = 1.35 -> phi = 1 / 1.35
        phi_anchor_steel = base_plate_get_phi('anchor_tension_steel', 'LRFD', 'AISC', is_nbr=True)
        self.assertAlmostEqual(phi_anchor_steel, 1.0 / 1.35, places=4)

        # Anchor concrete breakout: gamma_c = 1.40 -> phi = 1 / 1.40
        phi_anchor_conc = base_plate_get_phi('anchor_tension_concrete', 'LRFD', 'AISC', is_nbr=True)
        self.assertAlmostEqual(phi_anchor_conc, 1.0 / 1.40, places=4)

    def test_base_plate_concrete_bearing_nbr(self):
        """Verify NBR 6118 / NBR 8800 concrete bearing formulation."""
        res_nbr = check_concrete_bearing(self.bp_inputs_nbr)
        self.assertIn('check', res_nbr)
        self.assertAlmostEqual(res_nbr['check']['phi'], 1.0 / 1.40, places=4)
        self.assertIn('ABNT NBR 8800:2008 Item 6.5.2 / NBR 6118:2023', res_nbr['details']['breakdown'])

        # AISC contrast
        res_aisc = check_concrete_bearing(self.bp_inputs_aisc)
        self.assertAlmostEqual(res_aisc['check']['phi'], 0.65, places=2)

    def test_base_plate_unified_calculation_nbr(self):
        """Test complete base plate calculation execution under NBR 8800."""
        res = calculate_base_plate(self.bp_inputs_nbr)
        self.assertIn('checks', res)
        checks = res['checks']

        # Verify presence of key checks
        self.assertIn('Concrete Bearing', checks)
        self.assertIn('Plate Bending (Compression)', checks)
        self.assertIn('Anchor Steel Shear', checks)
        self.assertIn('Anchor Interaction (T+V)', checks)

        # Verify NBR specific formulas in Plate Bending
        pb = checks['Plate Bending (Compression)']
        self.assertIn('ABNT NBR 8800:2008', pb['details']['method'])
        self.assertIn('γa0', pb['details']['breakdown'])

    # --- Splice Tests ---

    def test_splice_is_nbr_detection(self):
        """Verify NBR detection helper for splice."""
        self.assertTrue(splice_is_nbr({'design_standard': 'ABNT NBR 8800:2008'}))
        self.assertTrue(splice_is_nbr({'standard': 'NBR 8800'}))
        self.assertFalse(splice_is_nbr({'design_standard': 'AISC 360-16'}))

    def test_splice_safety_factors_nbr(self):
        """Verify splice design factors for NBR (gamma_a0=1.10, gamma_a2=1.35)."""
        factors_yield = splice_get_design_factors(self.splice_inputs_nbr, 0.90, 1.67, limit_state='yield')
        self.assertAlmostEqual(factors_yield['phi'], 1.0 / 1.10, places=4)
        self.assertAlmostEqual(factors_yield['omega'], 1.10, places=4)

        factors_rupture = splice_get_design_factors(self.splice_inputs_nbr, 0.75, 2.00, limit_state='rupture')
        self.assertAlmostEqual(factors_rupture['phi'], 1.0 / 1.35, places=4)
        self.assertAlmostEqual(factors_rupture['omega'], 1.35, places=4)

        factors_shear = splice_get_design_factors(self.splice_inputs_nbr, 0.75, 2.00, limit_state='bolt_shear')
        self.assertAlmostEqual(factors_shear['phi'], 1.0 / 1.35, places=4)
        self.assertAlmostEqual(factors_shear['omega'], 1.35, places=4)

    def test_splice_bolt_shear_nbr(self):
        """Verify NBR 8800 Item 6.3.3.1 bolt shear: 0.40 * fub * Ab / gamma_a2."""
        bolt_res = splice_calc.check_bolt_shear({
            'grade': 'A325',
            'db': 0.75,
            'num_planes': 1,
            'threads_incl': True,
            'design_standard': 'ABNT NBR 8800:2008'
        })
        # For A325: fub = 120 ksi, coeff = 0.40 -> Fnv = 48 ksi
        ab = math.pi * (0.75**2) / 4.0
        expected_rn = 0.40 * 120.0 * ab
        self.assertAlmostEqual(bolt_res['Rn'], expected_rn, places=3)
        self.assertAlmostEqual(bolt_res['phi'], 1.0 / 1.35, places=4)

    def test_splice_bolt_bearing_nbr(self):
        """Verify NBR 8800 Item 6.3.3.4 bolt bearing with gamma_a2 = 1.35."""
        bearing_res = splice_calc.check_bolt_bearing({
            'db': 0.75,
            't_ply': 0.5,
            'Fu_ply': 58.0,
            'le': 1.5,
            's': 3.0,
            'is_edge_bolt': True,
            'design_standard': 'ABNT NBR 8800:2008'
        })
        self.assertAlmostEqual(bearing_res['phi'], 1.0 / 1.35, places=4)
        self.assertEqual(bearing_res['tearout_coeff'], 1.2)
        self.assertEqual(bearing_res['bearing_coeff'], 2.4)

    def test_splice_block_shear_nbr(self):
        """Verify NBR 8800 Item 6.5.6 Block shear with gamma_a0=1.10 and gamma_a2=1.35."""
        bs_res = splice_calc.check_block_shear({
            'Agv': 7.5,
            'Anv': 5.25,
            'Ant': 1.5,
            'Fu': 58.0,
            'Fy': 36.0,
            'Ubs': 1.0,
            'design_standard': 'ABNT NBR 8800:2008'
        })
        # Term 1: (0.60 * 5.25 * 58 + 1.0 * 1.5 * 58) / 1.35 = (182.7 + 87.0) / 1.35 = 199.778
        # Term 2: (0.60 * 7.5 * 36 / 1.10) + (1.0 * 1.5 * 58 / 1.35) = 147.273 + 64.444 = 211.717
        # Minimum = 199.778. Rn = 199.778 * 1.35 = 269.7
        self.assertAlmostEqual(bs_res['phi'], 1.0 / 1.35, places=4)
        expected_r_rd = min((0.60 * 5.25 * 58.0 + 1.0 * 1.5 * 58.0) / 1.35,
                            (0.60 * 7.5 * 36.0 / 1.10) + (1.0 * 1.5 * 58.0 / 1.35))
        self.assertAlmostEqual(bs_res['Rn'] * bs_res['phi'], expected_r_rd, places=3)

    def test_splice_full_run_nbr(self):
        """Test complete splice run execution under NBR 8800."""
        res = splice_calc.run(self.splice_inputs_nbr)
        self.assertIn('checks', res)
        checks = res['checks']

        # Ensure all checks executed and have NBR safety factors
        self.assertIn('Flange Bolt Shear', checks)
        self.assertIn('Outer Plate GSY', checks)
        self.assertIn('Outer Plate NSF', checks)
        self.assertIn('Outer Plate Block Shear', checks)
        self.assertIn('Web Bolt Group Shear (ICR)', checks)
        self.assertIn('Web Plate Gross Shear Yield', checks)
        self.assertIn('Web Plate Net Shear Rupture', checks)

        # Flange Bolt Shear factor should be 1/1.35
        self.assertAlmostEqual(checks['Flange Bolt Shear']['check']['phi'], 1.0 / 1.35, places=4)
        # Gross Yielding factor should be 1/1.10
        self.assertAlmostEqual(checks['Outer Plate GSY']['check']['phi'], 1.0 / 1.10, places=4)
        # Net Rupture factor should be 1/1.35
        self.assertAlmostEqual(checks['Outer Plate NSF']['check']['phi'], 1.0 / 1.35, places=4)


if __name__ == '__main__':
    unittest.main()
