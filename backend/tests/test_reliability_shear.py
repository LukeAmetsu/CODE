import unittest
from backend.calculators.reliability_shear import (
    StructuralReliabilityAnalysis,
    calculate_beta_vs_load_ratio,
    calibrate_optimal_gamma_v,
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
        stats = extract_theta_r_from_database(self.params, subset_key="ALL DATA")
        self.assertGreater(stats["mean"], 0.5)
        self.assertGreater(stats["cov"], 0.05)

if __name__ == '__main__':
    unittest.main()
