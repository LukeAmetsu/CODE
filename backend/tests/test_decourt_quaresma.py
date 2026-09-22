import unittest
import math
from backend.calculators.aoki_velloso import (
    calculate_aoki_velloso,
    calculate_decourt_quaresma,
    calculate_blevot_pile_cap,
    get_aoki_reference_data,
    DECOURT_C_DATABASE,
    DECOURT_PILE_FACTORS,
)

class TestDecourtQuaresmaAndBlevot(unittest.TestCase):
    def setUp(self):
        self.ref_data = get_aoki_reference_data()
        self.sample_layers = [
            {"depth": 2.0, "soil_type": "ARGILA ARENOSA", "nspt": 5.0},
            {"depth": 5.0, "soil_type": "SILTE ARENOSO", "nspt": 8.0},
            {"depth": 9.0, "soil_type": "AREIA SILTOSA", "nspt": 14.0},
            {"depth": 14.0, "soil_type": "AREIA", "nspt": 25.0},
        ]
        self.pile_type = "HÉLICE CONTÍNUA"
        self.diameter = 0.50
        self.depth_pile = 14.0
        self.area_m2 = math.pi * (self.diameter / 2.0) ** 2
        self.perim_m = math.pi * self.diameter

    def test_reference_data_contains_decourt_and_pile_cap(self):
        self.assertIn("decourt_c_database", self.ref_data)
        self.assertIn("decourt_pile_factors", self.ref_data)
        self.assertIn("default_cap_inputs", self.ref_data)
        self.assertIn("HÉLICE CONTÍNUA", self.ref_data["decourt_pile_factors"])
        self.assertEqual(self.ref_data["decourt_pile_factors"]["HÉLICE CONTÍNUA"]["alpha"], 0.30)
        self.assertEqual(self.ref_data["decourt_pile_factors"]["HÉLICE CONTÍNUA"]["beta"], 1.00)

    def test_decourt_quaresma_direct_calculation(self):
        res = calculate_decourt_quaresma(
            sorted_layers=self.sample_layers,
            depth_pile=self.depth_pile,
            area_m2=self.area_m2,
            perim_m=self.perim_m,
            pile_type=self.pile_type,
            fs_global=2.0
        )
        self.assertIn("layers", res)
        self.assertIn("R_adm_kN", res)
        self.assertIn("R_tip_kN", res)
        self.assertIn("R_shaft_kN", res)
        self.assertGreater(res["R_tip_kN"], 0)
        self.assertGreater(res["R_shaft_kN"], 0)
        self.assertGreater(res["R_adm_kN"], 0)
        self.assertAlmostEqual(res["R_adm_kN"], (res["R_tip_kN"] + res["R_shaft_kN"]) / 2.0, places=1)
        
        # Verify layer 1 calculations
        l0 = res["layers"][0]
        self.assertIn("C_kpa", l0)
        self.assertIn("ql_kpa", l0)
        self.assertIn("radm_kN", l0)
        self.assertGreater(l0["radm_kN"], 0)

    def test_calculate_aoki_velloso_integrated_bundle(self):
        # Full integrated calculation via calculate_aoki_velloso
        full_inputs = {
            "geometry": "Circular",
            "diameter": 0.50,
            "width_b": 0.50,
            "height_h": 0.50,
            "depth_pile": 14.0,
            "pile_type": "HÉLICE CONTÍNUA",
            "allowable_settlement_mm": 5.0,
            "soil_gamma": 1.8,
            "num_piles": 4,
            "structure_mass_ton": 240.0,
            "profile": self.sample_layers,
            "cap_num_piles": 4,
            "cap_pile_diam_m": 0.50,
            "cap_pile_spacing_m": 1.50,
            "cap_col_a_m": 0.40,
            "cap_col_b_m": 0.40,
            "cap_load_Nk_kN": 2400.0,
            "cap_fck_mpa": 30.0,
            "cap_fyk_mpa": 500.0,
            "cap_cover_cm": 5.0,
            "cap_embedment_cm": 5.0
        }
        res = calculate_aoki_velloso(full_inputs)
        self.assertTrue(res.get("success", False))
        
        # Must retain original Aoki-Velloso keys for 100% backwards compatibility
        self.assertIn("layers", res)
        self.assertIn("capacities", res)
        self.assertIn("stiffness_and_damping", res)
        self.assertIn("structural_springs", res)
        
        # Must include new Décourt-Quaresma, comparison and pile cap sections
        self.assertIn("decourt_quaresma", res)
        self.assertIn("comparison", res)
        self.assertIn("pile_cap", res)
        
        comp = res["comparison"]
        self.assertIn("aoki_velloso", comp)
        self.assertIn("decourt_quaresma", comp)
        self.assertIn("mean", comp)
        self.assertIn("conservative", comp)
        self.assertGreater(comp["aoki_velloso"]["R_adm_kN"], 0)
        self.assertGreater(comp["decourt_quaresma"]["R_adm_kN"], 0)
        self.assertGreater(comp["mean"]["R_adm_kN"], 0)
        self.assertGreater(comp["conservative"]["R_adm_kN"], 0)
        
        # Pile cap results
        cap = res["pile_cap"]
        self.assertIn("strut_and_tie", cap)
        self.assertIn("reinforcement", cap)
        self.assertIn("dimensions", cap)
        self.assertGreater(cap["reinforcement"]["As_cm2"], 0)

    def test_blevot_pile_cap_verifications(self):
        # Test 1 to 6 piles configurations
        for n in [1, 2, 3, 4, 5, 6]:
            cap_inputs = {
                "cap_num_piles": n,
                "cap_pile_diam_m": 0.50,
                "cap_pile_spacing_m": 1.50,
                "cap_col_a_m": 0.40,
                "cap_col_b_m": 0.40,
                "cap_load_Nk_kN": 400.0 * n,
                "cap_fck_mpa": 30.0,
                "cap_fyk_mpa": 500.0,
                "cap_cover_cm": 5.0,
                "cap_embedment_cm": 5.0
            }
            res = calculate_blevot_pile_cap(cap_inputs)
            self.assertEqual(res["num_piles"], n)
            self.assertIn("dimensions", res)
            self.assertIn("strut_and_tie", res)
            self.assertIn("reinforcement", res)
            self.assertGreater(res["reinforcement"]["As_cm2"], 0)
            self.assertGreater(res["strut_and_tie"]["theta_deg"], 0)

if __name__ == "__main__":
    unittest.main()
