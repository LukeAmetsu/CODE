import unittest
from backend.calculators.frame_2d import solve_frame_2d

class TestFrame2D(unittest.TestCase):

    def test_simply_supported_beam_udl(self):
        """Simply supported beam L=6m, q=10 kN/m -> R=30 kN, Mmax=45 kNm, Vmax=30 kN"""
        model = {
            'nodes': [
                {'id': 1, 'x': 0.0, 'y': 0.0},
                {'id': 2, 'x': 6.0, 'y': 0.0}
            ],
            'members': [
                {'id': 1, 'node_i': 1, 'node_j': 2, 'E': 200e6, 'A': 0.015, 'I': 0.00035}
            ],
            'supports': {
                1: {'type': 'pinned'},
                2: {'type': 'roller_x'}
            },
            'member_loads': [
                {'member_id': 1, 'type': 'uniform', 'qy': 10.0}
            ]
        }
        res = solve_frame_2d(model)
        self.assertEqual(res['status'], 'success')
        
        # Check reactions
        r1 = res['reactions'][1]
        r2 = res['reactions'][2]
        self.assertAlmostEqual(r1['Ry'], 30.0, delta=0.2)
        self.assertAlmostEqual(r2['Ry'], 30.0, delta=0.2)
        self.assertAlmostEqual(r1['Rx'], 0.0, delta=0.1)

        # Check maximum moment and shear in member
        m1 = res['members'][0]
        self.assertAlmostEqual(m1['max_M'], 45.0, delta=0.5)
        self.assertAlmostEqual(m1['max_V'], 30.0, delta=0.5)
        self.assertAlmostEqual(m1['min_V'], -30.0, delta=0.5)

    def test_cantilever_beam_point_load(self):
        """Cantilever L=4m, fixed at node 1, P=20 kN at tip -> Ry=20 kN, M=80 kNm"""
        model = {
            'nodes': [
                {'id': 1, 'x': 0.0, 'y': 0.0},
                {'id': 2, 'x': 4.0, 'y': 0.0}
            ],
            'members': [
                {'id': 1, 'node_i': 1, 'node_j': 2, 'E': 200e6, 'A': 0.015, 'I': 0.00035}
            ],
            'supports': {
                1: {'type': 'fixed'}
            },
            'nodal_loads': [
                {'node_id': 2, 'Fy': -20.0}
            ]
        }
        res = solve_frame_2d(model)
        self.assertEqual(res['status'], 'success')
        r1 = res['reactions'][1]
        self.assertAlmostEqual(r1['Ry'], 20.0, delta=0.1)
        self.assertAlmostEqual(abs(r1['Mz']), 80.0, delta=0.5)

    def test_portal_frame_lateral_load(self):
        """Portal frame 4m high x 6m wide with lateral load 15 kN at eaves"""
        model = {
            'nodes': [
                {'id': 1, 'x': 0.0, 'y': 0.0},
                {'id': 2, 'x': 0.0, 'y': 4.0},
                {'id': 3, 'x': 6.0, 'y': 4.0},
                {'id': 4, 'x': 6.0, 'y': 0.0}
            ],
            'members': [
                {'id': 1, 'node_i': 1, 'node_j': 2, 'E': 200e6, 'A': 0.02, 'I': 0.0005},
                {'id': 2, 'node_i': 2, 'node_j': 3, 'E': 200e6, 'A': 0.02, 'I': 0.0005},
                {'id': 3, 'node_i': 4, 'node_j': 3, 'E': 200e6, 'A': 0.02, 'I': 0.0005}
            ],
            'supports': {
                1: {'type': 'pinned'},
                4: {'type': 'pinned'}
            },
            'nodal_loads': [
                {'node_id': 2, 'Fx': 15.0}
            ]
        }
        res = solve_frame_2d(model)
        self.assertEqual(res['status'], 'success')
        r1 = res['reactions'][1]
        r4 = res['reactions'][4]
        # Sum of horizontal reactions must balance 15 kN external load (Rx1 + Rx4 = -15 kN)
        self.assertAlmostEqual(r1['Rx'] + r4['Rx'], -15.0, delta=0.2)
        # Vertical equilibrium: R1_y + R4_y = 0
        self.assertAlmostEqual(r1['Ry'] + r4['Ry'], 0.0, delta=0.2)

    def test_gui_portal_preset(self):
        """Portal frame matching GUI preset: fixed base, pinned base, lateral 20 kN and UDL -25 kN/m."""
        model = {
            'nodes': [
                {'id': 0, 'x': 0.0, 'y': 0.0, 'support': 'fixed', 'k_x': 0, 'k_y': 0, 'k_rot': 0},
                {'id': 1, 'x': 0.0, 'y': 4.0, 'support': 'free', 'k_x': 0, 'k_y': 0, 'k_rot': 0},
                {'id': 2, 'x': 6.0, 'y': 4.0, 'support': 'free', 'k_x': 0, 'k_y': 0, 'k_rot': 0},
                {'id': 3, 'x': 6.0, 'y': 0.0, 'support': 'pinned', 'k_x': 0, 'k_y': 0, 'k_rot': 0}
            ],
            'members': [
                {'id': 0, 'node_i': 0, 'node_j': 1, 'E': 200.0, 'A': 60.0, 'I': 12000.0, 'hinge_i': False, 'hinge_j': False},
                {'id': 1, 'node_i': 1, 'node_j': 2, 'E': 200.0, 'A': 60.0, 'I': 12000.0, 'hinge_i': False, 'hinge_j': False},
                {'id': 2, 'node_i': 3, 'node_j': 2, 'E': 200.0, 'A': 60.0, 'I': 12000.0, 'hinge_i': False, 'hinge_j': False}
            ],
            'node_loads': [
                {'node_id': 1, 'F_x': 20.0, 'F_y': 0.0, 'M_z': 0.0}
            ],
            'member_loads': [
                {'member_id': 1, 'q_y': -25.0, 'q_x': 0.0}
            ]
        }
        res = solve_frame_2d(model)
        self.assertEqual(res['status'], 'success')
        r0 = res['reactions'][0]
        r3 = res['reactions'][3]
        # Sum of horizontal reactions balances 20 kN: Rx0 + Rx3 = -20
        self.assertAlmostEqual(r0['Rx'] + r3['Rx'], -20.0, delta=0.2)
        # Sum of vertical reactions balances 25*6 = 150 kN: Ry0 + Ry3 = 150
        self.assertAlmostEqual(r0['Ry'] + r3['Ry'], 150.0, delta=0.2)
        # Moment must be non-zero
        self.assertGreater(abs(res['summary']['extrema']['max_M']), 50.0)

    def test_gui_continuous_beam_preset(self):
        """Continuous beam with roller_y supports matching GUI preset."""
        model = {
            'nodes': [
                {'id': 0, 'x': 0.0, 'y': 0.0, 'support': 'pinned', 'k_x': 0, 'k_y': 0, 'k_rot': 0},
                {'id': 1, 'x': 5.0, 'y': 0.0, 'support': 'roller_y', 'k_x': 0, 'k_y': 0, 'k_rot': 0},
                {'id': 2, 'x': 11.0, 'y': 0.0, 'support': 'roller_y', 'k_x': 0, 'k_y': 0, 'k_rot': 0}
            ],
            'members': [
                {'id': 0, 'node_i': 0, 'node_j': 1, 'E': 30.0, 'A': 1200.0, 'I': 900000.0, 'hinge_i': False, 'hinge_j': False},
                {'id': 1, 'node_i': 1, 'node_j': 2, 'E': 30.0, 'A': 1200.0, 'I': 900000.0, 'hinge_i': False, 'hinge_j': False}
            ],
            'node_loads': [
                {'node_id': 1, 'F_x': 0.0, 'F_y': -40.0, 'M_z': 0.0}
            ],
            'member_loads': [
                {'member_id': 0, 'q_y': -20.0, 'q_x': 0.0},
                {'member_id': 1, 'q_y': -30.0, 'q_x': 0.0}
            ]
        }
        res = solve_frame_2d(model)
        self.assertEqual(res['status'], 'success')
        r0 = res['reactions'][0]
        r1 = res['reactions'][1]
        r2 = res['reactions'][2]
        total_Ry = r0['Ry'] + r1['Ry'] + r2['Ry']
        # Total load: 20*5 + 30*6 + 40 = 320 kN
        self.assertAlmostEqual(total_Ry, 320.0, delta=0.5)

    def test_gui_gerber_preset(self):
        """Gerber frame with internal hinge."""
        model = {
            'nodes': [
                {'id': 0, 'x': 0.0, 'y': 0.0, 'support': 'fixed', 'k_x': 0, 'k_y': 0, 'k_rot': 0},
                {'id': 1, 'x': 0.0, 'y': 4.0, 'support': 'free', 'k_x': 0, 'k_y': 0, 'k_rot': 0},
                {'id': 2, 'x': 4.0, 'y': 4.0, 'support': 'free', 'k_x': 0, 'k_y': 0, 'k_rot': 0},
                {'id': 3, 'x': 8.0, 'y': 4.0, 'support': 'free', 'k_x': 0, 'k_y': 0, 'k_rot': 0},
                {'id': 4, 'x': 8.0, 'y': 0.0, 'support': 'pinned', 'k_x': 0, 'k_y': 0, 'k_rot': 0}
            ],
            'members': [
                {'id': 0, 'node_i': 0, 'node_j': 1, 'E': 200.0, 'A': 80.0, 'I': 20000.0, 'hinge_i': False, 'hinge_j': False},
                {'id': 1, 'node_i': 1, 'node_j': 2, 'E': 200.0, 'A': 80.0, 'I': 20000.0, 'hinge_i': False, 'hinge_j': True},
                {'id': 2, 'node_i': 2, 'node_j': 3, 'E': 200.0, 'A': 80.0, 'I': 20000.0, 'hinge_i': False, 'hinge_j': False},
                {'id': 3, 'node_i': 4, 'node_j': 3, 'E': 200.0, 'A': 80.0, 'I': 20000.0, 'hinge_i': False, 'hinge_j': False}
            ],
            'node_loads': [],
            'member_loads': [
                {'member_id': 1, 'q_y': -20.0, 'q_x': 0.0},
                {'member_id': 2, 'q_y': -20.0, 'q_x': 0.0}
            ]
        }
        res = solve_frame_2d(model)
        self.assertEqual(res['status'], 'success')
        r0 = res['reactions'][0]
        r4 = res['reactions'][4]
        # Total vertical: 20*4 + 20*4 = 160 kN
        self.assertAlmostEqual(r0['Ry'] + r4['Ry'], 160.0, delta=0.5)

    def test_gui_truss_preset(self):
        """Pin-jointed plane truss (all members hinged)."""
        model = {
            'nodes': [
                {'id': 0, 'x': 0.0, 'y': 0.0, 'support': 'pinned', 'k_x': 0, 'k_y': 0, 'k_rot': 0},
                {'id': 1, 'x': 3.0, 'y': 0.0, 'support': 'free', 'k_x': 0, 'k_y': 0, 'k_rot': 0},
                {'id': 2, 'x': 6.0, 'y': 0.0, 'support': 'roller_y', 'k_x': 0, 'k_y': 0, 'k_rot': 0},
                {'id': 3, 'x': 1.5, 'y': 2.5, 'support': 'free', 'k_x': 0, 'k_y': 0, 'k_rot': 0},
                {'id': 4, 'x': 4.5, 'y': 2.5, 'support': 'free', 'k_x': 0, 'k_y': 0, 'k_rot': 0}
            ],
            'members': [
                {'id': 0, 'node_i': 0, 'node_j': 1, 'E': 200.0, 'A': 25.0, 'I': 100.0, 'hinge_i': True, 'hinge_j': True},
                {'id': 1, 'node_i': 1, 'node_j': 2, 'E': 200.0, 'A': 25.0, 'I': 100.0, 'hinge_i': True, 'hinge_j': True},
                {'id': 2, 'node_i': 3, 'node_j': 4, 'E': 200.0, 'A': 25.0, 'I': 100.0, 'hinge_i': True, 'hinge_j': True},
                {'id': 3, 'node_i': 0, 'node_j': 3, 'E': 200.0, 'A': 20.0, 'I': 100.0, 'hinge_i': True, 'hinge_j': True},
                {'id': 4, 'node_i': 1, 'node_j': 3, 'E': 200.0, 'A': 20.0, 'I': 100.0, 'hinge_i': True, 'hinge_j': True},
                {'id': 5, 'node_i': 1, 'node_j': 4, 'E': 200.0, 'A': 20.0, 'I': 100.0, 'hinge_i': True, 'hinge_j': True},
                {'id': 6, 'node_i': 2, 'node_j': 4, 'E': 200.0, 'A': 20.0, 'I': 100.0, 'hinge_i': True, 'hinge_j': True}
            ],
            'node_loads': [
                {'node_id': 1, 'F_x': 0.0, 'F_y': -50.0, 'M_z': 0.0},
                {'node_id': 3, 'F_x': 15.0, 'F_y': 0.0, 'M_z': 0.0}
            ],
            'member_loads': []
        }
        res = solve_frame_2d(model)
        self.assertEqual(res['status'], 'success')
        r0 = res['reactions'][0]
        r2 = res['reactions'][2]
        # Rx0 + 15 = 0 -> Rx0 = -15
        self.assertAlmostEqual(r0['Rx'], -15.0, delta=0.2)
        # Ry0 + Ry2 = 50
        self.assertAlmostEqual(r0['Ry'] + r2['Ry'], 50.0, delta=0.2)

    def test_triangular_soil_pressure(self):
        """Cantilever retaining wall column (4m high) under triangular soil pressure (30 kN/m at base to 0 at top)."""
        model = {
            'nodes': [
                {'id': 0, 'x': 0.0, 'y': 0.0, 'support': 'fixed'},
                {'id': 1, 'x': 0.0, 'y': 4.0, 'support': 'free'}
            ],
            'members': [
                {'id': 0, 'node_i': 0, 'node_j': 1, 'E': 30e6, 'A': 0.3, 'I': 0.00225}
            ],
            'member_loads': [
                # At base (node 0 / i): q = 30 kN/m pushing in +X, at top (node 1 / j): q = 0
                # For vertical element from (0,0) to (0,4): local x is +Y, local y is -X.
                # Lateral load pushing right (+X) is pointing in local -y direction: qy = 30 at base, 0 at top
                {'member_id': 0, 'type': 'trapezoidal', 'qy_i': 30.0, 'qy_j': 0.0}
            ]
        }
        res = solve_frame_2d(model)
        self.assertEqual(res['status'], 'success')
        r0 = res['reactions'][0]
        # Total lateral force is 0.5 * 30 * 4 = 60 kN
        # Sum of horizontal forces balances: Rx0 = 60 kN (reaction in +local y = -global X)
        self.assertAlmostEqual(abs(r0['Rx']), 60.0, delta=0.5)
        # Base moment is (60 kN) * (4/3 m) = 80 kNm
        self.assertAlmostEqual(abs(r0['Mz']), 80.0, delta=0.5)

    def test_triangular_soil_pressure_global_coords(self):
        """Retaining wall using global coordinates: QX_i = 30 kN/m at base, QX_j = 0 at top."""
        model = {
            'nodes': [
                {'id': 0, 'x': 0.0, 'y': 0.0, 'support': 'fixed'},
                {'id': 1, 'x': 0.0, 'y': 4.0, 'support': 'free'}
            ],
            'members': [
                {'id': 0, 'node_i': 0, 'node_j': 1, 'E': 30e6, 'A': 0.3, 'I': 0.00225}
            ],
            'member_loads': [
                {'member_id': 0, 'type': 'trapezoidal', 'coord_sys': 'global', 'QX_i': 30.0, 'QX_j': 0.0}
            ]
        }
        res = solve_frame_2d(model)
        self.assertEqual(res['status'], 'success')
        r0 = res['reactions'][0]
        # Total lateral load is +60 kN (+X direction).
        # Reaction at fixed base must be -60 kN (balances +60 kN external force).
        self.assertAlmostEqual(r0['Rx'], -60.0, delta=0.5)
        # Base moment balances 60 * 4/3 = 80 kNm
        self.assertAlmostEqual(abs(r0['Mz']), 80.0, delta=0.5)


if __name__ == '__main__':
    unittest.main()
