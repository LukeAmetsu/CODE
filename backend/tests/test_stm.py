"""
Unit Tests for 3D Strut-and-Tie Model (STM) Solver and Optimization Engine
ABNT NBR 6118:2023 / ACI 318-19
"""

import unittest
import math
from backend.calculators.STM_backend import (
    solve_truss_system,
    generate_template,
    optimize_stm_geometry
)


class TestStrutAndTie(unittest.TestCase):

    def test_2d_deep_beam(self):
        """Tests 2D deep beam model generation and equilibrium."""
        geom = {'L': 200, 'H': 100, 'B': 20}
        tpl = generate_template('deep-beam', geom)
        self.assertEqual(len(tpl['nodes']), 3)
        self.assertEqual(len(tpl['members']), 3)

        res = solve_truss_system(tpl)
        self.assertNotIn('error', res)
        self.assertTrue(res['summary']['angle_check_pass'])
        self.assertGreater(res['summary']['total_strain_energy_kNcm'], 0)
        self.assertGreater(res['summary']['max_compression_kN'], 100.0)
        self.assertGreater(res['summary']['max_tension_kN'], 50.0)

    def test_3d_pile_cap_3piles(self):
        """Tests 3D spatial pile cap on 3 piles (triangular geometry)."""
        geom = {'L': 220, 'H': 110, 'B': 220}
        tpl = generate_template('pile-cap-3d-3piles', geom)
        self.assertEqual(len(tpl['nodes']), 4)
        self.assertEqual(len(tpl['members']), 6) # 3 struts + 3 ties

        res = solve_truss_system(tpl)
        self.assertNotIn('error', res)
        results = res['results']

        # First 3 members are struts (compression, force < 0)
        struts = [r for r in results if r['type'] == 'strut']
        self.assertEqual(len(struts), 3)
        for s in struts:
            self.assertLess(s['force'], -50.0, "Strut must be under significant compression")
            self.assertGreater(s['ac_req_cm2'], 0.0, "Strut must have concrete area calculated")

        # Next 3 members are horizontal ring ties (tension, force > 0)
        ties = [r for r in results if r['type'] == 'tie']
        self.assertEqual(len(ties), 3)
        for t in ties:
            self.assertGreater(t['force'], 20.0, "Tie must be under tension")
            self.assertGreater(t['as_req_cm2'], 0.0, "Tie must have required steel area calculated")

        # Symmetry check: all struts should have approximately equal forces
        strut_forces = [abs(s['force']) for s in struts]
        self.assertAlmostEqual(strut_forces[0], strut_forces[1], delta=2.0)
        self.assertAlmostEqual(strut_forces[1], strut_forces[2], delta=2.0)

        # Tie forces should also be symmetric
        tie_forces = [t['force'] for t in ties]
        self.assertAlmostEqual(tie_forces[0], tie_forces[1], delta=2.0)
        self.assertAlmostEqual(tie_forces[1], tie_forces[2], delta=2.0)

        # NBR 6118 angle check
        self.assertGreaterEqual(res['summary']['min_angle_deg'], 25.0)
        self.assertTrue(res['summary']['angle_check_pass'])

    def test_3d_pile_cap_4piles(self):
        """Tests 3D spatial pile cap on 4 piles (pyramidal geometry)."""
        geom = {'L': 200, 'H': 100, 'B': 200}
        tpl = generate_template('pile-cap-3d-4piles', geom)
        self.assertEqual(len(tpl['nodes']), 5)
        self.assertEqual(len(tpl['members']), 8) # 4 struts + 4 ties

        res = solve_truss_system(tpl)
        self.assertNotIn('error', res)
        results = res['results']

        struts = [r for r in results if r['type'] == 'strut']
        ties = [r for r in results if r['type'] == 'tie']
        self.assertEqual(len(struts), 4)
        self.assertEqual(len(ties), 4)

        for s in struts:
            self.assertLess(s['force'], -50.0)
        for t in ties:
            self.assertGreater(t['force'], 20.0)

        # Global metrics check
        summary = res['summary']
        self.assertGreater(summary['total_strain_energy_kNcm'], 0.0)
        self.assertGreater(summary['total_tie_weight_kg'], 0.0)
        self.assertGreater(summary['total_strut_volume_cm3'], 0.0)

    def test_3d_corbel_biaxial(self):
        """Tests 3D corbel subjected to vertical and transverse horizontal loads."""
        geom = {'L': 90, 'H': 80, 'B': 40}
        tpl = generate_template('corbel-3d', geom)
        self.assertEqual(len(tpl['nodes']), 5)
        self.assertEqual(len(tpl['members']), 4)

        res = solve_truss_system(tpl)
        self.assertNotIn('error', res)
        self.assertGreater(res['summary']['max_compression_kN'], 50.0)
        self.assertGreater(res['summary']['max_tension_kN'], 20.0)

    def test_stm_optimization_strain_energy(self):
        """Tests topological/geometric optimization minimizing strain energy."""
        # Non-optimal initial geometry
        data = {
            'geometry': {'L': 200, 'H': 100, 'B': 20},
            'nodes': [
                {'id': 1, 'x': 20, 'y': 0, 'z': 0, 'fixedX': True, 'fixedY': True, 'fixedZ': True, 'load': 0},
                {'id': 2, 'x': 180, 'y': 0, 'z': 0, 'fixedX': False, 'fixedY': True, 'fixedZ': True, 'load': 0},
                {'id': 3, 'x': 100, 'y': 35, 'z': 0, 'fixed': False, 'load': -250} # artificially shallow height
            ],
            'members': [
                {'start': 1, 'end': 3, 'type': 'strut'},
                {'start': 2, 'end': 3, 'type': 'strut'},
                {'start': 1, 'end': 2, 'type': 'tie'}
            ],
            'objective': 'strain_energy',
            'min_angle': 25.0,
            'cover': 5.0
        }

        opt_res = optimize_stm_geometry(data)
        self.assertTrue(opt_res['success'])
        self.assertGreaterEqual(opt_res['optimized']['energy_reduction_pct'], 0.0)

        # Node 3 Y should move upwards towards higher lever arm (more optimal)
        opt_node_3 = next(n for n in opt_res['optimized']['nodes'] if n['id'] == 3)
        self.assertGreater(opt_node_3['y'], 35.0, "Node 3 should move up to reduce strut thrust and strain energy")
        self.assertLessEqual(opt_node_3['y'], 95.0, "Node 3 must respect concrete cover boundary")

    def test_stm_optimization_tie_volume(self):
        """Tests optimization targeting minimum tie steel volume."""
        data = {
            'geometry': {'L': 200, 'H': 100, 'B': 20},
            'nodes': [
                {'id': 1, 'x': 20, 'y': 0, 'z': 0, 'fixedX': True, 'fixedY': True, 'fixedZ': True, 'load': 0},
                {'id': 2, 'x': 180, 'y': 0, 'z': 0, 'fixedX': False, 'fixedY': True, 'fixedZ': True, 'load': 0},
                {'id': 3, 'x': 100, 'y': 40, 'z': 0, 'fixed': False, 'load': -250}
            ],
            'members': [
                {'start': 1, 'end': 3, 'type': 'strut'},
                {'start': 2, 'end': 3, 'type': 'strut'},
                {'start': 1, 'end': 2, 'type': 'tie'}
            ],
            'objective': 'tie_volume',
            'min_angle': 25.0,
            'cover': 5.0
        }

        opt_res = optimize_stm_geometry(data)
        self.assertTrue(opt_res['success'])
        self.assertGreater(opt_res['optimized']['tie_reduction_pct'], 10.0)
        self.assertGreaterEqual(opt_res['optimized']['min_angle_deg'], 25.0)


if __name__ == '__main__':
    unittest.main()

