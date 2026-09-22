import unittest
import numpy as np
from backend.calculators.interactive_shear import run_optimization, calibrate_constant_c, load_and_clean_data


class TestInteractiveShearOptimization(unittest.TestCase):

    def setUp(self):
        data = load_and_clean_data()
        self.assertNotIn("error", data)
        self.assertGreater(len(data['V_test']), 1000)

    def test_pure_cov_optimization_c_not_varied(self):
        """Test that in criterion='cov', Nelder-Mead minimizes COV and C is strictly NOT varied."""
        initial_c = 0.42
        current = {'C': initial_c, 'alpha': 0.37, 'beta': 0.18, 'gamma': 0.54, 'delta': -0.24, 'epsilon': 0.90, 'zeta': 1.32}
        locked = {k: False for k in current}

        res = run_optimization(target_safety=1.0, locked=locked, current_vals=current, criterion='cov')
        self.assertIn('_cov', res)
        self.assertIn('_mean', res)
        # CRITICAL USER REQUIREMENT: In COV mode, C must NOT be varied!
        self.assertEqual(res['C'], initial_c)
        # COV must be significantly minimized from initial (~59.6% down to < 48%)
        self.assertLess(res['_cov'], 48.0)

    def test_mean_r_optimization_c_free(self):
        """Test that in criterion='mean' with C free, C is calibrated to hit target mean."""
        current = {'C': 0.50, 'alpha': 0.37, 'beta': 0.18, 'gamma': 0.54, 'delta': -0.24, 'epsilon': 0.90, 'zeta': 1.32}
        locked = {k: False for k in current}

        res = run_optimization(target_safety=1.0, locked=locked, current_vals=current, criterion='mean')
        self.assertAlmostEqual(res['_mean'], 1.0, delta=0.03)
        self.assertLess(res['_cov'], 48.0)

    def test_mean_r_optimization_c_locked(self):
        """Test that in criterion='mean' with C locked, Nelder-Mead optimizes exponents to bring mean to target."""
        current = {'C': 0.85, 'alpha': 0.37, 'beta': 0.18, 'gamma': 0.54, 'delta': -0.24, 'epsilon': 0.90, 'zeta': 1.32}
        locked_c = {k: (k == 'C') for k in current}

        res = run_optimization(target_safety=1.0, locked=locked_c, current_vals=current, criterion='mean')
        self.assertEqual(res['C'], 0.85)
        self.assertAlmostEqual(res['_mean'], 1.0, delta=0.05)

    def test_only_c_free_mean_mode(self):
        """Test that when all shape exponents are locked in mean mode, C is calibrated analytically to hit target."""
        current = {'C': 0.50, 'alpha': 0.37, 'beta': 0.18, 'gamma': 0.54, 'delta': -0.24, 'epsilon': 0.90, 'zeta': 1.32}
        locked_exponents = {k: (k != 'C') for k in current}

        res = run_optimization(target_safety=1.25, locked=locked_exponents, current_vals=current, criterion='mean')
        self.assertAlmostEqual(res['_mean'], 1.25, delta=0.02)
        # Shape exponents must remain unchanged
        self.assertEqual(res['alpha'], 0.37)
        self.assertEqual(res['gamma'], 0.54)

    def test_calibrate_constant_c(self):
        """Test calibrate_constant_c function for hitting arbitrary safety margins with zero COV change."""
        current = {'C': 0.50, 'alpha': 0.37, 'beta': 0.18, 'gamma': 0.54, 'delta': -0.24, 'epsilon': 0.90, 'zeta': 1.32}

        calib1 = calibrate_constant_c(target_safety=1.00, current_vals=current)
        self.assertAlmostEqual(calib1['mean'], 1.00, delta=0.02)

        calib2 = calibrate_constant_c(target_safety=1.40, current_vals=current)
        self.assertAlmostEqual(calib2['mean'], 1.40, delta=0.02)

        # COV must be 100% identical regardless of target safety
        self.assertEqual(calib1['cov'], calib2['cov'])
    def test_subset_specific_optimization_thick_slabs(self):
        """Test that Nelder-Mead optimizes specifically on active data subsets (e.g. slabs_thick_600)."""
        current = {'C': 0.50, 'alpha': 0.37, 'beta': 0.18, 'gamma': 0.54, 'delta': -0.24, 'epsilon': 0.90, 'zeta': 1.32}
        locked = {k: (k == 'C') for k in current}

        res = run_optimization(target_safety=1.0, locked=locked, current_vals=current, criterion='cov', subset_key='slabs_thick_600')
        self.assertEqual(res['_subset'], 'slabs_thick_600')
        self.assertEqual(res['_count'], 154)
        # Baseline Reineck COV on thick slabs is 73.09%; optimization must drop it below 42%
        self.assertLess(res['_cov'], 42.0)
        self.assertEqual(res['C'], 0.50)

    def test_subset_specific_calibrate_c(self):
        """Test that analytical C calibration calculates C specifically for the active subset."""
        current = {'C': 0.50, 'alpha': 0.37, 'beta': 0.18, 'gamma': 0.54, 'delta': -0.24, 'epsilon': 0.90, 'zeta': 1.32}

        calib = calibrate_constant_c(target_safety=1.00, current_vals=current, subset_key='slabs_thick_600')
        self.assertEqual(calib['subset'], 'slabs_thick_600')
        self.assertEqual(calib['count'], 154)
        self.assertAlmostEqual(calib['mean'], 1.00, delta=0.02)

    def test_calculate_depth_flatness(self):
        """Test calculation of flatness and slope of safety factor vs effective depth."""
        from backend.calculators.interactive_shear import calculate_depth_flatness
        # Synthetic perfectly flat case
        d = [200.0, 300.0, 400.0, 500.0, 600.0, 700.0, 800.0]
        fs_flat = [1.20] * len(d)
        res_flat = calculate_depth_flatness(d, fs_flat)
        self.assertAlmostEqual(res_flat['mean_fs'], 1.20)
        self.assertAlmostEqual(res_flat['slope_per_meter'], 0.0)
        self.assertAlmostEqual(res_flat['flatness_score'], 100.0)

        # Tilted case (unsafe slope)
        fs_tilted = [1.50, 1.40, 1.30, 1.20, 1.10, 1.00, 0.90]
        res_tilted = calculate_depth_flatness(d, fs_tilted)
        self.assertLess(res_tilted['slope_per_meter'], -0.5)
        self.assertLess(res_tilted['flatness_score'], 90.0)

    def test_optimization_with_disabled_variables(self):
        """Test Nelder-Mead optimization when variables (e.g., alpha, delta) are disabled (locked at 0.0)."""
        current = {'C': 0.50, 'alpha': 0.0, 'beta': 0.18, 'gamma': 0.54, 'delta': 0.0, 'epsilon': 1.0, 'zeta': 1.0}
        locked = {
            'C': True,
            'alpha': True,  # disabled
            'beta': False,
            'gamma': False,
            'delta': True,  # disabled
            'epsilon': True, # fixed geometry
            'zeta': True    # fixed geometry
        }
        res = run_optimization(target_safety=1.0, locked=locked, current_vals=current, criterion='cov')
        self.assertEqual(res['alpha'], 0.0)
        self.assertEqual(res['delta'], 0.0)
        self.assertEqual(res['C'], 0.50)
        self.assertEqual(res['epsilon'], 1.0)
        self.assertEqual(res['zeta'], 1.0)
        self.assertIn('_cov', res)
        self.assertLess(res['_cov'], 70.0)

    def test_calibrate_c_with_disabled_variables(self):
        """Test analytical C calibration when size effect and shear span are disabled."""
        current = {'C': 0.50, 'alpha': 0.0, 'beta': 0.18, 'gamma': 0.54, 'delta': 0.0, 'epsilon': 1.0, 'zeta': 1.0}
        calib = calibrate_constant_c(target_safety=1.20, current_vals=current)
        self.assertAlmostEqual(calib['mean'], 1.20, delta=0.02)
        self.assertGreater(calib['C'], 0.0)


if __name__ == '__main__':
    unittest.main()



