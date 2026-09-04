"""
Unit tests for Soil Liquefaction Triggering Calculator (NCEER / Youd & Idriss)
Verifies against Excel reference: Planilha de Análise de Liquefação - LZC-3.xlsx
"""

import unittest
from backend.calculators.liquefaction import (
    calculate_liquefaction_profile,
    calculate_liquefaction_layers,
    get_liquefaction_reference_data
)

class TestLiquefaction(unittest.TestCase):
    def setUp(self):
        self.ref_data = get_liquefaction_reference_data()

    def test_parametric_profile_against_sheet1(self):
        res = calculate_liquefaction_profile(self.ref_data["parametric_defaults"])
        self.assertTrue(res["success"])
        
        scenarios = res["summary_scenarios"]
        # Sheet 1: Critical depth is 9.0 m for all combinations
        self.assertEqual(scenarios["a0_min"]["scenario_min"]["depth_crit_m"], 9.0)
        self.assertAlmostEqual(scenarios["a0_min"]["scenario_min"]["fs_min"], 1.223, places=2)
        self.assertAlmostEqual(scenarios["a0_min"]["scenario_med"]["fs_min"], 2.002, places=2)
        self.assertAlmostEqual(scenarios["a0_min"]["scenario_max"]["fs_min"], 3.289, places=2)
        
        self.assertEqual(scenarios["a0_max"]["scenario_min"]["depth_crit_m"], 9.0)
        self.assertAlmostEqual(scenarios["a0_max"]["scenario_min"]["fs_min"], 0.961, places=2)
        self.assertAlmostEqual(scenarios["a0_max"]["scenario_med"]["fs_min"], 1.573, places=2)

    def test_borehole_layers_against_sheet2(self):
        res = calculate_liquefaction_layers({"layers": self.ref_data["borehole_layers_defaults"]})
        self.assertTrue(res["success"])
        
        layers = res["layers"]
        # Depth 1m: FS ~ 2.397
        self.assertAlmostEqual(layers[0]["fs"], 2.397, places=2)
        self.assertEqual(layers[0]["status"], "SEGURO")

        # Depth 2m: FS ~ 0.409 (Liquefaction probable)
        self.assertAlmostEqual(layers[1]["fs"], 0.409, places=2)
        self.assertEqual(layers[1]["status"], "LIQUEFAÇÃO PROVÁVEL")

        # Depth 3m: FS ~ 0.761
        self.assertAlmostEqual(layers[2]["fs"], 0.761, places=2)
        self.assertEqual(layers[2]["status"], "LIQUEFAÇÃO PROVÁVEL")

        # Depth 4m: FS ~ 0.372 (Minimum FS)
        self.assertAlmostEqual(layers[3]["fs"], 0.372, places=2)
        self.assertEqual(layers[3]["status"], "LIQUEFAÇÃO PROVÁVEL")

        # Summary check
        self.assertEqual(res["summary"]["crit_depth_m"], 4.0)
        self.assertAlmostEqual(res["summary"]["min_fs"], 0.372, places=2)

if __name__ == '__main__':
    unittest.main()
