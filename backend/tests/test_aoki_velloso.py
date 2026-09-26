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

    def test_springs_per_meter_output(self):
        res = calculate_aoki_velloso(self.inputs)
        self.assertTrue(res["success"])
        self.assertIn("springs_per_meter", res)
        spm = res["springs_per_meter"]
        self.assertGreater(len(spm), 0)
        first_layer = spm[0]
        self.assertIn("Kz_dyn_kN_m_per_m", first_layer)
        self.assertIn("Kh_dyn_kN_m_per_m", first_layer)
        self.assertIn("Kz_static_kN_m_per_m", first_layer)
        self.assertGreater(first_layer["Kz_dyn_kN_m_per_m"], 0.0)
        self.assertGreater(first_layer["Kh_dyn_kN_m_per_m"], 0.0)

    def test_earth_pressure_separated_active_passive(self):
        res = calculate_aoki_velloso(self.inputs)
        self.assertTrue(res["success"])
        self.assertIn("earth_pressure", res)
        ep = res["earth_pressure"]

        # Seções separadas
        self.assertIn("active", ep)
        self.assertIn("passive", ep)

        active = ep["active"]
        passive = ep["passive"]

        # Empuxo Ativo
        self.assertIn("Ka_rankine", active)
        self.assertIn("Ka_coulomb", active)
        self.assertIn("Ea_rankine_kN_m", active)
        self.assertIn("Ea_coulomb_kN_m", active)
        self.assertIn("ya_rankine_m", active)
        self.assertIn("stress_diagram", active)
        self.assertGreater(active["Ea_rankine_kN_m"], 0.0)

        # Empuxo Passivo
        self.assertIn("Kp_rankine", passive)
        self.assertIn("Kp_coulomb", passive)
        self.assertIn("Ep_rankine_kN_m", passive)
        self.assertIn("Ep_coulomb_kN_m", passive)
        self.assertIn("yp_rankine_m", passive)
        self.assertIn("stress_diagram", passive)
        self.assertGreater(passive["Ep_rankine_kN_m"], active["Ea_rankine_kN_m"])

    def test_coulomb_converges_to_rankine_when_delta_zero(self):
        inputs = self.inputs.copy()
        inputs["earth_pressure"] = {
            "H_m": 6.0,
            "phi_deg": 30.0,
            "gamma_kN_m3": 18.0,
            "c_kPa": 0.0,
            "delta_deg": 0.0,
            "beta_deg": 0.0
        }
        res = calculate_aoki_velloso(inputs)
        ep = res["earth_pressure"]
        act = ep["active"]
        pas = ep["passive"]

        # Para phi=30°, Ka = 1/3 ~ 0.3333, Kp = 3.0
        self.assertAlmostEqual(act["Ka_rankine"], 0.3333, places=3)
        self.assertAlmostEqual(act["Ka_coulomb"], act["Ka_rankine"], places=3)
        self.assertAlmostEqual(pas["Kp_rankine"], 3.0, places=3)
        self.assertAlmostEqual(pas["Kp_coulomb"], pas["Kp_rankine"], places=3)

        # Ponto de aplicação para triângulo puro = H/3 = 2.0m da base
        self.assertAlmostEqual(act["ya_rankine_m"], 2.0, places=2)
        self.assertAlmostEqual(pas["yp_rankine_m"], 2.0, places=2)

if __name__ == '__main__':
    unittest.main()
