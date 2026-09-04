"""
Unit tests for Aoki-Velloso Deep Foundation Capacity & Dynamic Stiffness Calculator
Verifies against Excel reference: AOKI VELOSO (version 1).xlsb.xlsx
"""

import unittest
from backend.calculators.aoki_velloso import calculate_aoki_velloso, get_aoki_reference_data

class TestAokiVelloso(unittest.TestCase):
    def setUp(self):
        self.ref_data = get_aoki_reference_data()
        self.inputs = self.ref_data["default_inputs"].copy()
        self.inputs["profile"] = self.ref_data["default_profile"].copy()

    def test_reference_spreadsheet_capacities(self):
        res = calculate_aoki_velloso(self.inputs)
        self.assertTrue(res["success"])
        
        cap = res["capacities"]
        # Shaft and Tip resistances calculated via Aoki-Velloso formula
        self.assertAlmostEqual(cap["R_shaft_tf"], 162.74, places=1)
        self.assertAlmostEqual(cap["R_tip_tf"], 213.57, places=1)
        self.assertAlmostEqual(cap["R_adm_tf"], 376.31, places=1)
        self.assertGreater(cap["R_adm_group_tf"], 5000.0)

    def test_reference_dynamic_and_damping(self):
        res = calculate_aoki_velloso(self.inputs)
        stiff = res["stiffness_and_damping"]
        
        # Match exact values from Excel cells: J11, K11, M11, N11, J2, J3, J4, J5
        self.assertAlmostEqual(stiff["Kz_dyn_group_tf_m"], 4067722.72, delta=5.0)
        self.assertAlmostEqual(stiff["Kh_dyn_group_tf_m"], 6176912.28, delta=5.0)
        self.assertAlmostEqual(stiff["Cv_group_tf_s_m"], 25706.93, delta=5.0)
        self.assertAlmostEqual(stiff["Ch_group_tf_s_m"], 40670.67, delta=5.0)
        self.assertAlmostEqual(stiff["Cgcz_tf_s_m"], 52444.56, delta=2.0)
        self.assertAlmostEqual(stiff["Cgcxy_tf_s_m"], 64626.47, delta=2.0)
        self.assertAlmostEqual(stiff["Dgz"], 0.4902, places=3)
        self.assertAlmostEqual(stiff["Dgxy"], 0.6293, places=3)

    def test_square_pile_geometry(self):
        inputs = self.inputs.copy()
        inputs["geometry"] = "Quadrada"
        inputs["width_b"] = 0.8
        inputs["height_h"] = 0.8
        
        res = calculate_aoki_velloso(inputs)
        self.assertTrue(res["success"])
        self.assertAlmostEqual(res["geometry"]["area_m2"], 0.64, places=2)
        self.assertAlmostEqual(res["geometry"]["perimeter_m"], 3.20, places=2)
    def test_structural_springs_output(self):
        res = calculate_aoki_velloso(self.inputs)
        self.assertTrue(res["success"])
        self.assertIn("structural_springs", res)

        springs = res["structural_springs"]
        self.assertIn("for_piled_raft", springs)
        self.assertIn("for_piled_beam", springs)

        raft = springs["for_piled_raft"]
        self.assertGreater(raft["pile_spring_kz_kN_m"], 100000.0)
        self.assertGreater(raft["pile_capacity_adm_kN"], 1000.0)
        self.assertGreater(raft["q_negative_friction_kN"], 0.0)
        self.assertGreater(raft["subgrade_ks_kN_m3"], 1000.0)

        beam = springs["for_piled_beam"]
        self.assertGreater(beam["pile_spring_kz_kN_m"], 100000.0)
        self.assertGreater(beam["pile_spring_kx_fixed_kN_m"], 10000.0)
        self.assertGreater(beam["pile_spring_kx_pinned_kN_m"], 5000.0)
        self.assertGreater(beam["pile_capacity_adm_kN"], 1000.0)
        self.assertGreater(beam["pile_tension_adm_kN"], 100.0)
        self.assertGreater(beam["elastic_length_T_m"], 1.0)

if __name__ == '__main__':
    unittest.main()
