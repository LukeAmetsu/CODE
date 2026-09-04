"""
Unit tests for Retaining Wall Stability Calculator (Standard unittest format)
"""
import unittest
from backend.calculators.retaining_wall import calculate_retaining_wall

class TestRetainingWall(unittest.TestCase):
    def test_standard_cantilever_wall(self):
        inputs = {
            "stem_height": 4.0,
            "stem_top_width": 0.30,
            "stem_bot_width": 0.50,
            "toe_length": 0.80,
            "heel_length": 1.70,
            "base_thickness": 0.50,
            "gamma_wall": 25.0,
            "gamma_soil": 18.0,
            "phi_soil": 30.0,
            "backfill_slope": 0.0,
            "gamma_found": 19.0,
            "phi_found": 30.0,
            "q_adm": 200.0,
            "q_surcharge": 10.0,
            "theory": "rankine"
        }
        
        res = calculate_retaining_wall(inputs)
        self.assertTrue(res.get("success"))
        self.assertIn("stability", res)
        
        st = res["stability"]
        self.assertGreater(st["fs_overturning"], 1.0)
        self.assertGreater(st["fs_sliding"], 1.0)
        self.assertGreater(st["q_max"], 0)
        
        geo = res["geometry"]
        self.assertAlmostEqual(geo["base_width_B"], 3.0, places=2)
        self.assertAlmostEqual(geo["total_height_H"], 4.5, places=2)

    def test_wall_with_shear_key(self):
        inputs = {
            "stem_height": 5.0,
            "stem_top_width": 0.40,
            "stem_bot_width": 0.60,
            "toe_length": 1.00,
            "heel_length": 2.00,
            "base_thickness": 0.60,
            "has_key": True,
            "key_depth": 0.60,
            "key_width": 0.50,
            "key_pos": 1.50,
            "use_passive": True,
            "gamma_wall": 25.0,
            "gamma_soil": 18.0,
            "phi_soil": 32.0,
            "phi_found": 32.0,
            "q_surcharge": 0.0
        }
        
        res = calculate_retaining_wall(inputs)
        self.assertTrue(res.get("success"))
        self.assertGreater(res["stability"]["total_sliding_resistance"], res["stability"]["base_friction_resistance"])

    def test_wall_with_water_table(self):
        inputs = {
            "stem_height": 4.0,
            "toe_length": 0.8,
            "heel_length": 1.7,
            "base_thickness": 0.5,
            "water_height": 2.5,
            "drainage_eff": 0.0
        }
        
        res = calculate_retaining_wall(inputs)
        self.assertTrue(res.get("success"))
        self.assertGreater(res["earth_pressures"]["P_h_water"], 0)

    def test_wall_reinforcement_and_takeoff(self):
        inputs = {
            "stem_height": 4.0,
            "stem_top_width": 0.30,
            "stem_bot_width": 0.50,
            "toe_length": 0.80,
            "heel_length": 1.70,
            "base_thickness": 0.50,
            "fck": 25.0,
            "fyk": 500.0,
            "cover_stem": 40.0,
            "cover_base": 50.0,
            "bar_diam": 16.0,
            "gamma_f": 1.4
        }
        res = calculate_retaining_wall(inputs)
        self.assertTrue(res.get("success"))
        self.assertIn("reinforcement", res)
        reinf = res["reinforcement"]

        # 3 critical sections
        self.assertIn("haste", reinf)
        self.assertIn("puntera", reinf)
        self.assertIn("calcanhar", reinf)
        self.assertIn("shear", reinf)

        # Flexural design values
        self.assertGreater(reinf["haste"]["As_final"], 0)
        self.assertGreater(reinf["puntera"]["As_final"], 0)
        self.assertGreater(reinf["calcanhar"]["As_final"], 0)

        # Commercial bar detailing
        self.assertIn("detailing", reinf["haste"])
        self.assertIn("text", reinf["haste"]["detailing"])
        self.assertIn("detailing", reinf["puntera"])
        self.assertIn("detailing", reinf["calcanhar"])

        # Secondary rebar
        self.assertIn("haste_horizontal", reinf)
        self.assertIn("haste_frontal", reinf)
        self.assertIn("sapata_distrib", reinf)

        # Quantitative takeoff
        self.assertIn("quantities", reinf)
        qties = reinf["quantities"]
        self.assertGreater(qties["total_steel_kg_per_m"], 20.0)
        self.assertGreater(qties["steel_ratio_kg_m3"], 10.0)
        self.assertEqual(reinf["shear"]["status"], "APROVADO")

    def test_coulomb_vs_rankine_differences(self):
        base_inputs = {
            "stem_height": 4.0,
            "stem_top_width": 0.30,
            "stem_bot_width": 0.50,
            "toe_length": 0.80,
            "heel_length": 1.70,
            "base_thickness": 0.50,
            "gamma_soil": 18.0,
            "phi_soil": 30.0,
            "q_surcharge": 10.0
        }
        r_rankine = calculate_retaining_wall({**base_inputs, "theory": "rankine"})
        r_coulomb = calculate_retaining_wall({**base_inputs, "theory": "coulomb"})

        ep_r = r_rankine["earth_pressures"]
        ep_c = r_coulomb["earth_pressures"]

        # Ka in Coulomb with default delta = 2/3*phi must be strictly lower than Rankine
        self.assertLess(ep_c["Ka"], ep_r["Ka"])
        # Horizontal thrust must be strictly lower in Coulomb
        self.assertLess(ep_c["total_P_h"], ep_r["total_P_h"])
        # Vertical stabilizing thrust must be positive in Coulomb
        self.assertGreater(ep_c["total_P_v"], 0.0)
        self.assertEqual(ep_r["total_P_v"], 0.0)

        # Overturning FS in Coulomb must be higher due to lower Ph and stabilizing Pv
        st_r = r_rankine["stability"]
        st_c = r_coulomb["stability"]
        self.assertGreater(st_c["fs_overturning"], st_r["fs_overturning"])
        self.assertGreater(st_c["fs_sliding"], st_r["fs_sliding"])

if __name__ == "__main__":
    unittest.main()
