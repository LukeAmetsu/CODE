import unittest
from backend.calculators.reliability_shear import (
    StructuralReliabilityAnalysis,
    calculate_beta_vs_load_ratio,
    calibrate_optimal_gamma_v,
    calibrate_optimal_constant_C,
    compare_all_codes_reliability,
    extract_theta_r_from_database,
    generate_latex_reliability_table,
)

class TestStructuralReliability(unittest.TestCase):
    def setUp(self):
        self.section = {
            "fck": 30.0,
            "bw": 250.0,
            "d": 400.0,
            "rho": 0.012,
            "ad": 3.0,
            "ddg": 32.0,
            "chi": 0.30,
            "gamma_v": 1.40,
            "gamma_g": 1.40,
            "gamma_q": 1.40,
            "k_k": 1.00,
        }
        self.params = {
            "C": 1.25,
            "alpha": 0.333,
            "beta": 0.333,
            "gamma": 0.333,
            "delta": -0.75,
            "mu": 0.15,
            "use_deff": False,
        }

    def test_form_convergence(self):
        sra = StructuralReliabilityAnalysis(self.section, self.params)
        res = sra.run_form()
        self.assertTrue(res["converged"])
        self.assertGreater(res["beta"], 2.0)
        self.assertLess(res["beta"], 6.0)
        self.assertIn("sensitivity_pct", res)
        # Sum of sensitivity should be approx 100%
        sum_sens = sum(res["sensitivity_pct"].values())
        self.assertAlmostEqual(sum_sens, 100.0, delta=1.0)

    def test_monte_carlo(self):
        sra = StructuralReliabilityAnalysis(self.section, self.params)
        mc_res = sra.run_monte_carlo(n_samples=5000, seed=123)
        self.assertIn("pf_mc", mc_res)
        self.assertIn("beta_mc", mc_res)

    def test_beta_vs_load_ratio(self):
        curve = calculate_beta_vs_load_ratio(self.section, self.params, chi_values=[0.20, 0.40, 0.60])
        self.assertEqual(len(curve), 3)
        for pt in curve:
            self.assertGreater(pt["beta"], 1.5)

    def test_latex_table_generation(self):
        sra = StructuralReliabilityAnalysis(self.section, self.params)
        res = sra.run_form()
        latex = generate_latex_reliability_table(res, self.section, self.params)
        self.assertIn("\\begin{table}", latex)
        self.assertIn("\\toprule", latex)
        self.assertIn("\\bottomrule", latex)

    def test_extract_theta_r(self):
        # With active thesis parameters
        thesis_params = {
            "C": 1.25,
            "alpha": 0.333,
            "beta": 0.333,
            "gamma": 0.333,
            "delta": -0.75,
            "mu": 0.25,
            "use_deff": True,
        }
        stats_no_pc = extract_theta_r_from_database(thesis_params, subset_key="ALL DATA", exclude_pc=True)
        self.assertEqual(stats_no_pc["samples"], 1649)
        self.assertAlmostEqual(stats_no_pc["mean"], 1.579, delta=0.01)
        self.assertAlmostEqual(stats_no_pc["cov"], 0.339, delta=0.01)

    def test_k_k_factor_separation(self):
        # Test that k_k modifies V_Rd deterministically
        sec_standard = dict(self.section)
        sec_standard["k_k"] = 1.00
        sec_standard["gamma_v"] = 1.40
        sra_standard = StructuralReliabilityAnalysis(sec_standard, self.params)

        sec_nbr = dict(self.section)
        sec_nbr["k_k"] = 0.70
        sec_nbr["gamma_v"] = 1.40
        sra_nbr = StructuralReliabilityAnalysis(sec_nbr, self.params)

        # V_Rd with k_k=0.70 should be exactly 0.70 * V_Rd(k_k=1.00)
        self.assertAlmostEqual(sra_nbr.design_values["V_Rd"], 0.70 * sra_standard.design_values["V_Rd"], places=4)

        # In g(X) = theta_R * V_R(X) - S(X), V_R(X) is invariant to k_k
        # Since V_R is identical, but design load S_d = V_Rd is 30% smaller for k_k=0.70,
        # the required nominal loads G_k and Q_k are lower, meaning higher beta.
        res_standard = sra_standard.run_form()
        res_nbr = sra_nbr.run_form()
        self.assertGreater(res_nbr["beta"], res_standard["beta"])

    def test_calibrate_optimal_constant_C(self):
        calib = calibrate_optimal_constant_C(
            self.section,
            self.params,
            target_beta=3.80,
            gamma_v=1.40
        )
        self.assertTrue(calib["reached_target"])
        self.assertAlmostEqual(calib["avg_beta"], 3.80, delta=0.15)
        self.assertAlmostEqual(calib["fixed_gamma_v"], 1.40)
        self.assertGreater(calib["optimal_C"], 0.1)
        self.assertLess(calib["optimal_C"], 5.0)

    def test_arch_action_correction_stats(self):
        # EC2 / NBR preset with delta = 0
        delta_zero_params = {
            "C": 0.60,
            "alpha": 0.333,
            "beta": 0.333,
            "gamma": 0.333,
            "delta": 0.0,
            "mu": 0.15,
            "use_deff": True,
        }
        # Raw evaluation over all tests without arch correction has large COV due to short beams
        stats_raw = extract_theta_r_from_database(
            delta_zero_params,
            subset_key="ALL DATA",
            exclude_pc=True,
            arch_correction=False,
            slender_only=False
        )
        # With arch correction (NBR 6118 item 17.4.1.2.1 / EC2)
        stats_arch = extract_theta_r_from_database(
            delta_zero_params,
            subset_key="ALL DATA",
            exclude_pc=True,
            arch_correction=True,
            slender_only=False
        )
        # Slender only
        stats_slender = extract_theta_r_from_database(
            delta_zero_params,
            subset_key="ALL DATA",
            exclude_pc=True,
            arch_correction=False,
            slender_only=True
        )

        # COV with arch correction should be significantly lower than raw without correction
        self.assertLess(stats_arch["cov"], stats_raw["cov"])
        self.assertLess(stats_slender["cov"], stats_raw["cov"])

    def test_gamma_v_expanded_bounds_and_optimization(self):
        # Check that optimizer searches up to 3.50 without crashing
        res = calibrate_optimal_gamma_v(
            self.section,
            self.params,
            target_beta=3.80,
            bounds=(0.80, 3.50)
        )
        self.assertIn("optimal_gamma_v", res)
        self.assertGreaterEqual(res["optimal_gamma_v"], 0.80)
        self.assertLessEqual(res["optimal_gamma_v"], 3.50)
        self.assertIn("reached_target", res)
        self.assertIn("hit_upper_bound", res)
        # Verify exact synchronization of optimal and recommended gamma
        self.assertEqual(res["optimal_gamma_v"], res["recommended_standard_gamma"])
        # Verify that beta reaches or exceeds target 3.800
        self.assertGreaterEqual(res["avg_beta"], 3.800 - 1e-4)

    def test_aci318_preset_scale(self):
        # ACI preset with C = 0.142 (0.66 / 100^(1/3)), mu = 0.150, gamma_v = 1.333
        aci_params = {
            "C": 0.142,
            "alpha": 0.0,
            "beta": 0.333,
            "gamma": 0.500,
            "delta": 0.0,
            "mu": 0.150,
            "use_deff": False,
        }
        sec_aci = dict(self.section)
        sec_aci["gamma_v"] = 1.333
        sec_aci["k_k"] = 1.00
        sra = StructuralReliabilityAnalysis(sec_aci, aci_params)
        # Nominal V_Rd should be in the realistic range ~62 kN (rather than ~288 kN with C=0.66)
        self.assertLess(sra.design_values["V_Rd"], 70.0)
        self.assertGreater(sra.design_values["V_Rd"], 50.0)

    def test_nbr6118_preset_constant(self):
        # NBR preset with C = 0.120 (0.25 * 0.30 * 1.60), beta = 0.333, k_k = 0.70, gamma_v = 1.40
        nbr_params = {
            "C": 0.120,
            "alpha": 0.0,
            "beta": 0.333,
            "gamma": 0.667,
            "delta": 0.0,
            "mu": 0.15,
            "use_deff": False,
            "use_nbr_scale": True,
        }
        sec_nbr = dict(self.section)
        sec_nbr["k_k"] = 0.70
        sec_nbr["gamma_v"] = 1.40
        calib = calibrate_optimal_gamma_v(sec_nbr, nbr_params, target_beta=3.80)
        self.assertTrue(calib["reached_target"])
        self.assertFalse(calib["hit_upper_bound"])
        self.assertLess(calib["optimal_gamma_v"], 2.00)
        self.assertGreaterEqual(calib["avg_beta"], 3.800 - 1e-4)

if __name__ == '__main__':
    unittest.main()

