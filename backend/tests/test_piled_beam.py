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
            "pile_capacity_adm": 1600.0,
            "unit_cost_concrete": 550.0,
            "unit_cost_steel": 12.50
        }
        res = calculate_piled_beam(inputs)
        self.assertTrue(res.get("success"), f"Calculation failed: {res.get('error')}")
        
        # Geometry
        geo = res["beam_geometry"]
        self.assertEqual(geo["L_total_m"], 24.0)
        self.assertEqual(geo["bw_m"], 0.80)
        self.assertEqual(geo["h_m"], 1.20)
        self.assertGreater(geo["formwork_m2"], 0)
        
        # Envelopes
        env = res["envelope_results"]
        self.assertGreater(env["M_pos_max_kNm"], 0.0)
        self.assertGreater(env["M_neg_max_kNm"], 0.0)
        self.assertGreater(env["V_max_kN"], 0.0)
        self.assertGreater(env["R_max_pile_kN"], 0.0)
        self.assertGreater(len(env["diagram_points"]), 20)
        self.assertIn("current_state_points", env)
        
        # Beam Design (NBR 6118)
        des = res["beam_design"]
        self.assertGreater(des["As_inf_cm2"], 0.0)
        self.assertGreater(des["As_sup_cm2"], 0.0)
        self.assertIn("detail_inf", des)
        self.assertIn("detail_sup", des)
        self.assertIn("skin_reinforcement", des)
        self.assertTrue(des["skin_reinforcement"]["required"]) # h = 1.20m >= 0.60m
        self.assertIn("stirrups", des)
        self.assertIn("crack_width", des)
        self.assertEqual(des["status_strut"], "APROVADO (Biela OK)")
        
        # Piles Check (NBR 6122)
        pcheck = res["piles_check"]
        self.assertGreater(pcheck["num_piles"], 5)
        self.assertIn("status_compression", pcheck)
        self.assertIn("status_uplift", pcheck)
        self.assertGreater(pcheck["H_per_pile_kN"], 0.0)
        
        # Executive Quantities (BOM) & Costs
        qty = res["quantities"]
        self.assertGreater(qty["total_concrete_m3"], 0)
        self.assertGreater(qty["total_steel_kg"], 0)
        self.assertGreater(qty["steel_consumption_kg_m3"], 0)
        
        costs = res["cost_estimation"]
        self.assertGreater(costs["cost_total_brl"], 0)
        self.assertGreater(costs["cost_per_m_brl"], 0)
        
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

    def test_civil_earthwork_and_concrete_quantities(self):
        inputs = {
            "beam_length": 24.0,
            "beam_width": 0.80,
            "beam_height": 1.20,
            "pile_spacing": 3.0,
            "cantilever_left": 1.5,
            "pile_diameter": 0.80,
            "pile_length": 18.0
        }
        res = calculate_piled_beam(inputs)
        self.assertTrue(res.get("success"))
        qty = res["quantities"]

        # Check all 9 civil quantity items exist
        self.assertIn("excavation_piles_m3", qty)
        self.assertIn("excavation_mechanized_m3", qty)
        self.assertIn("backfill_m3", qty)
        self.assertIn("disposal_m3", qty)
        self.assertIn("concrete_structural_m3", qty)
        self.assertIn("concrete_lean_m3", qty)
        self.assertIn("formwork_beam_m2", qty)
        self.assertIn("anchor_bolts_qty", qty)
        self.assertIn("total_steel_kg", qty)
        self.assertIn("items_table", qty)
        self.assertEqual(len(qty["items_table"]), 9)

        # Values must be physically positive
        self.assertGreater(qty["excavation_piles_m3"], 0)
        self.assertGreater(qty["excavation_mechanized_m3"], 0)
        self.assertGreater(qty["backfill_m3"], 0)
        self.assertGreater(qty["disposal_m3"], 0)
        self.assertGreater(qty["concrete_structural_m3"], 0)
        self.assertGreater(qty["concrete_lean_m3"], 0)
        self.assertGreater(qty["formwork_beam_m2"], 0)
        self.assertGreater(qty["anchor_bolts_qty"], 0)
        self.assertGreater(qty["total_steel_kg"], 0)

        # Mass balance verification:
        # V_esc_mec ~= V_reaterro + V_concreto_viga + V_concreto_magro
        v_beam = qty["concrete_beam_m3"]
        v_lean = qty["concrete_lean_m3"]
        self.assertAlmostEqual(qty["excavation_mechanized_m3"], qty["backfill_m3"] + v_beam + v_lean, places=1)

        # V_bota_fora ~= V_esc_estacas + V_concreto_viga + V_concreto_magro
        self.assertAlmostEqual(qty["disposal_m3"], qty["excavation_piles_m3"] + v_beam + v_lean, places=1)

if __name__ == "__main__":
    unittest.main()
