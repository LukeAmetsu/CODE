import unittest
from backend.calculators.piled_beam import calculate_piled_beam

class TestPiledBeamCalculator(unittest.TestCase):
    def test_piled_beam_basic(self):
        inputs = {
            "beam_length": 24.0,
            "beam_width": 0.80,
            "beam_height": 1.20,
            "pile_spacing": 3.0,
            "cantilever_left": 1.5,
            "gantry_load_tf": 148.42,
            "dynamic_factor": 1.25,
            "num_wheels": 4,
            "wheel_spacing": 1.40,
            "fck": 35.0,
            "fyk": 500.0,
            "pile_capacity_adm": 1600.0
        }
        res = calculate_piled_beam(inputs)
        self.assertTrue(res.get("success"), f"Calculation failed: {res.get('error')}")
        
        # Geometry
        geo = res["beam_geometry"]
        self.assertEqual(geo["L_total_m"], 24.0)
        self.assertEqual(geo["bw_m"], 0.80)
        self.assertEqual(geo["h_m"], 1.20)
        
        # Envelopes
        env = res["envelope_results"]
        self.assertGreater(env["M_pos_max_kNm"], 0.0)
        self.assertGreater(env["M_neg_max_kNm"], 0.0)
        self.assertGreater(env["V_max_kN"], 0.0)
        self.assertGreater(env["R_max_pile_kN"], 0.0)
        self.assertGreater(len(env["diagram_points"]), 20)
        
        # Beam Design (NBR 6118)
        des = res["beam_design"]
        self.assertGreater(des["As_inf_cm2"], 0.0)
        self.assertGreater(des["As_sup_cm2"], 0.0)
        self.assertIn("detail_inf", des)
        self.assertIn("detail_sup", des)
        self.assertIn("stirrups", des)
        self.assertIn("crack_width", des)
        self.assertEqual(des["status_strut"], "APROVADO (Biela OK)")
        
        # Piles Check (NBR 6122)
        pcheck = res["piles_check"]
        self.assertGreater(pcheck["num_piles"], 5)
        self.assertIn("status_compression", pcheck)
        self.assertIn("status_uplift", pcheck)
        self.assertGreater(pcheck["H_per_pile_kN"], 0.0)
        
        # Span Optimization
        span_opt = res["span_optimization"]
        self.assertEqual(len(span_opt), 5)
        
    def test_span_variation_effects(self):
        # Smaller span (2.0m) should have smaller bending moment than larger span (4.0m)
        res_small = calculate_piled_beam({"pile_spacing": 2.0, "beam_length": 24.0})
        res_large = calculate_piled_beam({"pile_spacing": 4.0, "beam_length": 24.0})
        
        self.assertTrue(res_small.get("success"))
        self.assertTrue(res_large.get("success"))
        
        M_pos_small = res_small["envelope_results"]["M_pos_max_kNm"]
        M_pos_large = res_large["envelope_results"]["M_pos_max_kNm"]
        self.assertLess(M_pos_small, M_pos_large)

if __name__ == "__main__":
    unittest.main()
