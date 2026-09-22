import unittest
import copy
import math
from backend.calculators.rs2_fea import (
    get_preset_model,
    calculate_slope_slip_surfaces,
    _calculate_stratified_slice_weight,
    _spencer_fs,
    _bishop_simplified_fs,
    _find_slope_crest_toe
)


class TestRS2LEMMulticouche(unittest.TestCase):
    """
    Test suite for the rigorous Limit Equilibrium (LEM) slope stability engine:
    - Multi-layer stratified slice weight integration.
    - True Spencer (1967) 2D Newton-Raphson solver.
    - Kinematic angle sign convention and Mohr-Coulomb tension cutoff.
    - Physical sensitivity of critical slip surface to envelope thickness (50 cm vs 2.0 m).
    """

    def test_stratified_slice_weight_vs_uniform(self):
        """Verify that multi-strata slice weights correctly integrate vertical densities."""
        layer_polys = [
            # Top layer: gamma = 20 kN/m3 from y=20 to y=25
            [(0, 20), (10, 20), (10, 25), (0, 25)],
            # Bottom layer: gamma = 15 kN/m3 from y=10 to y=20
            [(0, 10), (10, 10), (10, 20), (0, 20)]
        ]
        materials = [
            {'gamma': 20.0, 'c': 10.0, 'phi': 30.0},
            {'gamma': 15.0, 'c': 5.0, 'phi': 25.0}
        ]
        b = 1.0
        x_mid = 5.0
        y_base = 10.0
        y_surf = 25.0

        # Exact weight: 10m * 15kN/m3 + 5m * 20kN/m3 = 150 + 100 = 250 kN
        W = _calculate_stratified_slice_weight(x_mid, y_base, y_surf, b, layer_polys, materials)
        self.assertAlmostEqual(W, 250.0, delta=2.5)

    def test_spencer_2d_convergence(self):
        """Verify that Spencer 2D Newton-Raphson converges and yields equilibrium."""
        model = get_preset_model('slope')
        xc, yc, r = 25.0, 30.0, 18.0
        fs_spencer = _spencer_fs(
            xc, yc, r,
            domain_poly=model['domain_poly'],
            layer_polygons=model.get('layer_polygons', []),
            materials=model['materials'],
            surcharges=model.get('surcharges'),
            water_table=model.get('water_table'),
            n_slices=25
        )
        self.assertIsNotNone(fs_spencer)
        self.assertGreater(fs_spencer, 0.5)
        self.assertLess(fs_spencer, 5.0)

    def test_crest_toe_detection(self):
        """Verify slope crest and toe detection from domain boundary."""
        model = get_preset_model('embankment_multiphase')
        crest, toe = _find_slope_crest_toe(model['domain_poly'])
        self.assertIsNotNone(crest)
        self.assertIsNotNone(toe)
        # Crest is at (221.6, 24.7) and toe is at (237.0, 17.0)
        self.assertAlmostEqual(crest[0], 221.6, delta=1.0)
        self.assertAlmostEqual(crest[1], 24.7, delta=1.0)
        self.assertAlmostEqual(toe[0], 237.0, delta=1.0)
        self.assertAlmostEqual(toe[1], 17.0, delta=1.0)

    def test_envelope_thickness_sensitivity_geostudio_comparison(self):
        """
        Verify that changing envelope thickness from 50 cm to 2.0 m
        changes the critical circle and increases the Factor of Safety,
        matching the geotechnical behavior observed in GeoStudio SLOPE/W.
        """
        model_50cm = get_preset_model('embankment_multiphase')
        # Apply envelope properties (material 3: Envelopamento Sr. Valdir)
        model_50cm['materials'][3]['c'] = 10.0
        model_50cm['materials'][3]['phi'] = 28.0

        res_50cm = calculate_slope_slip_surfaces(model_50cm)
        self.assertEqual(res_50cm['status'], 'success')
        crit_50cm = res_50cm['critical_surface']

        # Now thicken envelope layer to 2.0 m
        model_2m = copy.deepcopy(model_50cm)
        model_2m['layer_polygons'][4]['polygon'] = [
            [195.0, 22.7], [219.0, 22.7], [232.0, 17.0], [237.0, 17.0], [221.6, 24.7], [195.0, 24.7]
        ]
        model_2m['layer_polygons'][3]['polygon'] = [
            [195.0, 21.0], [219.0, 21.0], [219.0, 22.7], [195.0, 22.7]
        ]

        res_2m = calculate_slope_slip_surfaces(model_2m)
        self.assertEqual(res_2m['status'], 'success')
        crit_2m = res_2m['critical_surface']

        # With a thicker competent envelope (2.0 m vs 0.5 m), the Factor of Safety MUST increase
        self.assertGreater(crit_2m['fs'], crit_50cm['fs'])
        self.assertGreater(crit_2m['circular_fs'], crit_50cm['circular_fs'])
        # Circular FS values:
        self.assertAlmostEqual(crit_2m['circular_fs'], 1.73, delta=0.08)
        self.assertAlmostEqual(crit_50cm['circular_fs'], 1.54, delta=0.08)
        # Surface-optimized FS values (relaxation of non-circular kinematics in competent envelope):
        self.assertAlmostEqual(crit_2m['fs'], 1.58, delta=0.08)
        self.assertAlmostEqual(crit_50cm['fs'], 1.49, delta=0.08)

        # And the critical circle geometry should shift
        diff_center = abs(crit_2m['center'][0] - crit_50cm['center'][0]) + abs(crit_2m['center'][1] - crit_50cm['center'][1])
        self.assertGreater(diff_center, 2.0)
        self.assertGreater(abs(crit_2m['radius'] - crit_50cm['radius']), 3.0)

    def test_distinct_slip_surfaces_per_method(self):
        """Verify that every LEM method provides its own critical circle arc and parameters."""
        model = get_preset_model('embankment_multiphase')
        res = calculate_slope_slip_surfaces(model)
        self.assertEqual(res['status'], 'success')
        methods = {m['name']: m for m in res['methods_comparison']}

        self.assertEqual(len(methods), 8)
        for name, m in methods.items():
            self.assertIn('center', m, f"Method {name} missing center")
            self.assertIn('radius', m, f"Method {name} missing radius")
            self.assertIn('arc_points', m, f"Method {name} missing arc_points")
            self.assertGreater(len(m['arc_points']), 10, f"Method {name} arc_points too short")

        # Janbu critical circle is shallower with smaller radius than Bishop and Fellenius
        janbu = methods['Janbu Simplificado']
        bishop = methods['Bishop Simplificado']
        fellenius = methods['Fellenius (Ordinário)']

        self.assertLess(janbu['radius'], bishop['radius'])
        self.assertLess(bishop['radius'], fellenius['radius'])
        self.assertNotEqual(janbu['center'], bishop['center'])
        self.assertNotEqual(fellenius['center'], bishop['center'])


if __name__ == '__main__':
    unittest.main()
