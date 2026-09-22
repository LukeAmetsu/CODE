import unittest
import math
from backend.calculators.shallow_foundation import (
    calculate_shallow_foundation,
    get_shallow_foundation_reference_data
)

class TestShallowFoundation(unittest.TestCase):

    def test_reference_data(self):
        ref = get_shallow_foundation_reference_data()
        self.assertIn("soils", ref)
        self.assertIn("concrete_classes", ref)
        self.assertIn("default_params", ref)
        self.assertTrue(len(ref["soils"]) >= 5)

    def test_concentric_footing_zone1(self):
        """Pure vertical load should result in uniform pressure, Zone 1, and valid springs."""
        inputs = {
            "dim_A": 2.0,
            "dim_B": 2.0,
            "h_total": 0.70,
            "h0_edge": 0.30,
            "col_a": 0.40,
            "col_b": 0.40,
            "embedment_depth_Df": 1.50,
            "Nk_kN": 600.0,
            "Hxk_kN": 0.0,
            "Hyk_kN": 0.0,
            "Mxk_kNm": 0.0,
            "Myk_kNm": 0.0,
            "sigma_adm_kPa": 250.0,
            "soil_phi_deg": 32.0,
            "soil_cohesion_kPa": 0.0,
            "soil_gamma_kNm3": 18.0,
            "ks_subgrade_kNm3": 30000.0,
            "fck_MPa": 30.0,
            "fyk_MPa": 500.0
        }
        res = calculate_shallow_foundation(inputs)
        self.assertTrue(res["success"])
        self.assertTrue(res["overall_ok"])
        
        # Rigidity
        geom = res["geometry"]
        self.assertTrue(geom["is_rigid_footing"])
        self.assertGreaterEqual(geom["slope_angle_deg"], 25.0)

        # Base loads & Eccentricity
        loads = res["loads_at_base"]
        self.assertAlmostEqual(loads["ex_m"], 0.0, places=3)
        self.assertAlmostEqual(loads["ey_m"], 0.0, places=3)
        self.assertEqual(loads["kern_zone"], "Zona 1 (Compressão Total)")

        # Pressures
        press = res["contact_pressures"]
        self.assertAlmostEqual(press["sigma_max_kPa"], press["sigma_mean_kPa"], delta=1.0)
        self.assertAlmostEqual(press["compressed_area_ratio"], 1.0, places=2)
        self.assertTrue(press["ok_sigma_max"])
        self.assertTrue(press["ok_sigma_mean"])

        # Winkler springs
        springs = res["soil_springs"]
        expected_Kz = 30000.0 * 4.0 # ks * A * B = 120,000 kN/m
        self.assertAlmostEqual(springs["Kz_global_kN_m"], expected_Kz, delta=10.0)
        self.assertGreater(springs["Ktheta_x_kNm_rad"], 0)

        # Structural reinforcement
        rebar = res["structural_reinforcement"]
        self.assertGreater(rebar["As_x_final_cm2"], 0.0)
        self.assertGreater(rebar["As_y_final_cm2"], 0.0)
        self.assertGreaterEqual(rebar["num_bars_x"], 3)

        # Shear and punching
        sp = res["shear_and_punching"]
        self.assertTrue(sp["ok_shear"])
        self.assertTrue(sp["ok_punch_0"])

    def test_excel_reference_benchmark(self):
        """Test with parameters from Dimensionamento de sapata.xlsm benchmark."""
        inputs = {
            "dim_A": 1.20,
            "dim_B": 1.20,
            "h_total": 0.60,
            "h0_edge": 0.20,
            "col_a": 0.40,
            "col_b": 0.40,
            "embedment_depth_Df": 1.50,
            "Nk_kN": 15.3,
            "Hxk_kN": 2.9,
            "Hyk_kN": 3.7,
            "Mxk_kNm": 19.0,
            "Myk_kNm": 24.4,
            "sigma_adm_kPa": 120.0,
            "soil_phi_deg": 30.0,
            "soil_cohesion_kPa": 0.0,
            "fck_MPa": 25.0
        }
        res = calculate_shallow_foundation(inputs)
        self.assertTrue(res["success"])
        
        # High moments on small normal load -> kern ratio > 1
        loads = res["loads_at_base"]
        self.assertGreater(loads["kern_ratio"], 1.0)
        self.assertIn("Descolamento", loads["kern_zone"])
        
        # Stability factors computed
        stab = res["stability_checks"]
        self.assertIn("FS_overturning", stab)
        self.assertIn("FS_sliding", stab)

    def test_eccentricity_and_sliding_check(self):
        """Check high lateral force sliding and overturning factors."""
        inputs = {
            "dim_A": 2.50,
            "dim_B": 2.50,
            "h_total": 0.80,
            "h0_edge": 0.30,
            "col_a": 0.50,
            "col_b": 0.50,
            "Nk_kN": 500.0,
            "Hxk_kN": 120.0,
            "Hyk_kN": 80.0,
            "Mxk_kNm": 80.0,
            "Myk_kNm": 100.0,
            "sigma_adm_kPa": 200.0,
            "soil_phi_deg": 28.0,
            "soil_cohesion_kPa": 15.0
        }
        res = calculate_shallow_foundation(inputs)
        self.assertTrue(res["success"])
        stab = res["stability_checks"]
        self.assertGreater(stab["H_sliding_resist_kN"], 100.0)
        self.assertGreater(stab["FS_overturning"], 1.0)
        self.assertIn("ratio_overturning_ponderada", stab)
        self.assertIn("ratio_sliding_ponderada", stab)
        self.assertIn("ok_overturning_ponderada", stab)
        self.assertIn("ok_sliding_ponderada", stab)

    def test_geotechnical_ponderada_vs_fs_global(self):
        """Test dual verification with explicit geo_method selection."""
        base_inputs = {
            "dim_A": 2.0,
            "dim_B": 2.0,
            "h_total": 0.70,
            "h0_edge": 0.30,
            "col_a": 0.40,
            "col_b": 0.40,
            "Nk_kN": 400.0,
            "Hxk_kN": 25.0,
            "Hyk_kN": 30.0,
            "Mxk_kNm": 35.0,
            "Myk_kNm": 45.0,
            "sigma_adm_kPa": 220.0,
            "soil_phi_deg": 30.0,
            "soil_cohesion_kPa": 10.0
        }
        # 1. Global method
        inputs_global = dict(base_inputs, geo_method="global")
        res_global = calculate_shallow_foundation(inputs_global)
        self.assertTrue(res_global["success"])
        stab_g = res_global["stability_checks"]
        self.assertGreaterEqual(stab_g["FS_overturning"], 1.50)
        self.assertGreaterEqual(stab_g["FS_sliding"], 1.50)

        # 2. Ponderada method
        inputs_pond = dict(base_inputs, geo_method="ponderada")
        res_pond = calculate_shallow_foundation(inputs_pond)
        self.assertTrue(res_pond["success"])
        stab_p = res_pond["stability_checks"]
        self.assertTrue(stab_p["ok_overturning_ponderada"])
        self.assertTrue(stab_p["ok_sliding_ponderada"])
        self.assertLessEqual(stab_p["ratio_overturning_ponderada"], 1.0)
        self.assertLessEqual(stab_p["ratio_sliding_ponderada"], 1.0)

        # 3. Both methods
        inputs_both = dict(base_inputs, geo_method="ambos")
        res_both = calculate_shallow_foundation(inputs_both)
        self.assertTrue(res_both["success"])
        self.assertTrue(res_both["overall_ok"])

if __name__ == "__main__":
    unittest.main()
