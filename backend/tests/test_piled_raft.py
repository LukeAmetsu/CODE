import unittest
from backend.calculators.piled_raft import calculate_piled_raft

class TestPiledRaftCalculator(unittest.TestCase):
    def test_piled_raft_basic(self):
        inputs = {
            "raft_length_x": 16.0,
            "raft_length_y": 12.0,
            "raft_thickness": 1.20,
            "fck": 35.0,
            "num_piles_x": 5,
            "num_piles_y": 4,
            "pile_diameter": 0.80,
            "pile_length": 18.0,
            "pile_capacity_adm": 1800.0,
            "spmt_num_lines": 6,
            "spmt_line_load": 350.0,
            "heavy_rigging_load": 2500.0
        }
        res = calculate_piled_raft(inputs)
        self.assertTrue(res.get("success"), f"Calculation failed: {res.get('error')}")
        
        # Check geometric quantities
        geo = res["raft_geometry"]
        self.assertEqual(geo["Lx"], 16.0)
        self.assertEqual(geo["Ly"], 12.0)
        self.assertEqual(geo["thickness"], 1.20)
        self.assertAlmostEqual(geo["area_m2"], 192.0, places=1)
        
        # Check pile summaries
        piles = res["piles_summary"]
        self.assertEqual(piles["num_piles"], 20)
        self.assertGreater(piles["max_reaction_kN"], 0)
        self.assertGreater(piles["group_reduction_factor"], 0.3)
        self.assertLess(piles["group_reduction_factor"], 1.0)
        
        # Check load distribution (piled raft proportion alpha_pr)
        ld = res["load_distribution"]
        self.assertGreater(ld["alpha_pr"], 0.6)
        self.assertLess(ld["alpha_pr"], 1.0)
        self.assertAlmostEqual(ld["load_to_piles_pct"] + ld["load_to_soil_pct"], 100.0, places=1)
        
        # Check settlements
        settle = res["settlements"]
        self.assertGreater(settle["max_settlement_mm"], 0.0)
        self.assertLess(settle["max_settlement_mm"], 50.0)
        
        # Check punching shear (NBR 6118)
        punch = res["punching_shear"]
        self.assertIn("overall_status", punch)
        self.assertGreater(punch["tau_Sd0_MPa"], 0.0)
        self.assertGreater(punch["tau_Rd2_MPa"], punch["tau_Sd0_MPa"]) # Compression strut safe
        
        # Check reinforcement
        reinf = res["reinforcement"]
        self.assertGreater(reinf["As_final_cm2_m"], 0.0)
        self.assertIn("detailing", reinf)
        self.assertIn("crack_width", reinf)
        
    def test_punching_shear_thick_vs_thin(self):
        # A very thin raft (0.4m) under heavy rigging should trigger punching shear alert or higher tau_Sd
        thin_res = calculate_piled_raft({"raft_thickness": 0.50, "heavy_rigging_load": 4000.0})
        thick_res = calculate_piled_raft({"raft_thickness": 1.40, "heavy_rigging_load": 4000.0})
        
        self.assertTrue(thin_res.get("success"))
        self.assertTrue(thick_res.get("success"))
        
        tau_thin = thin_res["punching_shear"]["tau_Sd1_MPa"]
        tau_thick = thick_res["punching_shear"]["tau_Sd1_MPa"]
        self.assertGreater(tau_thin, tau_thick)

if __name__ == "__main__":
    unittest.main()
