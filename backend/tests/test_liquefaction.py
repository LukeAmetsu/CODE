"""
Unit tests for Soil Liquefaction Triggering Calculator (NCEER / Youd & Idriss)
Verifies against Excel reference: Planilha de Análise de Liquefação - LZC-3.xlsx
"""

import unittest
from backend.calculators.liquefaction import (
    calculate_liquefaction_profile,
    calculate_liquefaction_layers,
    calculate_liquefaction_combinatorial_statistics,
    generate_liquefaction_report_plots,
    export_liquefaction_profile_excel,
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

    def test_combinatorial_statistics_default(self):
        """Tests the combinatorial matrix generation and descriptive statistics."""
        res = calculate_liquefaction_combinatorial_statistics()
        self.assertTrue(res["success"])
        self.assertEqual(res["mode"], "combinatorial_statistics")
        
        # 3 Mw * 2 a_max * 3 N1 = 18 scenarios
        self.assertEqual(res["metadata"]["total_scenarios"], 18)
        self.assertEqual(len(res["scenarios"]), 18)
        self.assertEqual(len(res["scenarios_summary_table"]), 18)
        
        # Check global statistics structure
        g_stats = res["global_statistics"]
        self.assertIn("mean", g_stats)
        self.assertIn("std", g_stats)
        self.assertIn("min", g_stats)
        self.assertIn("median", g_stats)
        self.assertIn("max", g_stats)
        self.assertIn("fail_pct", g_stats)
        
        # Check sensitivity analysis structure
        sens = res["sensitivity_analysis"]
        self.assertIn("marginal_soil_n1", sens)
        self.assertIn("marginal_seismic_amax", sens)
        self.assertIn("sensitivity_ratio_n1_vs_amax", sens)
        # N1 impact should be significantly larger than a_max impact
        self.assertGreater(sens["marginal_soil_n1"]["max_delta_fs"], sens["marginal_seismic_amax"]["max_delta_fs"])

    def test_combinatorial_statistics_custom_inputs_and_metrics(self):
        """Validates numerical statistics against known benchmark values from prompt."""
        inputs = {
            "mw_values": [7.5],
            "a_max_values": [0.55, 0.70],
            "n1_values": [15.0, 33.0],
            "water_depth": 3.5,
            "soil_gamma": 19.0,
            "fines_content_fc": 10.0,
            "max_depth": 20.0,
            "depth_step": 0.5
        }
        res = calculate_liquefaction_combinatorial_statistics(inputs)
        self.assertTrue(res["success"])
        
        # 4 scenarios: (a0 min/max) x (N1 min/med)
        self.assertEqual(res["metadata"]["total_scenarios"], 4)
        
        # Find critical scenario (a_max=0.70, N1=15.0)
        crit_scenario = next(
            s for s in res["scenarios"]
            if s["parameters"]["a_max"] == 0.70
            and s["parameters"]["n1_60"] == 15.0
        )
        # Critical scenario has min FS around 0.272 (matching prompt table)
        self.assertAlmostEqual(crit_scenario["min_fs"], 0.273, places=2)
        self.assertAlmostEqual(crit_scenario["statistics"]["mean"], 0.310, places=2)
        self.assertEqual(crit_scenario["statistics"]["fail_pct"], 100.0)
        self.assertEqual(crit_scenario["status"], "LIQUEFAÇÃO PROVÁVEL")

        # Find moderate scenario (a_max=0.70, N1=33.0)
        med_scenario = next(
            s for s in res["scenarios"]
            if s["parameters"]["a_max"] == 0.70
            and s["parameters"]["n1_60"] == 33.0
        )
        self.assertAlmostEqual(med_scenario["min_fs"], 1.573, places=2)
        self.assertAlmostEqual(med_scenario["statistics"]["mean"], 1.818, places=2)
        self.assertEqual(med_scenario["statistics"]["fail_pct"], 0.0)
        self.assertEqual(med_scenario["status"], "SEGURO")

        # Check pairwise sensitivity deltas (matching prompt values: delta_a0 ~ 0.085, delta_N1 ~ 1.508)
        pairwise = res["sensitivity_analysis"]["pairwise_reference"]
        self.assertAlmostEqual(pairwise["delta_a0_mean_impact"], 0.085, places=2)
        self.assertAlmostEqual(pairwise["delta_n1_mean_impact"], 1.508, places=2)
        self.assertGreater(pairwise["ratio_n1_over_a0"], 15.0)

    def test_combinatorial_custom_depths(self):
        """Ensures custom discrete depths are handled properly."""
        custom_depths = [1.0, 3.5, 7.0, 15.0]
        inputs = {
            "mw_values": [7.5],
            "a_max_values": [0.60],
            "n1_values": [30.0],
            "depths": custom_depths
        }
        res = calculate_liquefaction_combinatorial_statistics(inputs)
        self.assertTrue(res["success"])
        self.assertEqual(res["metadata"]["total_scenarios"], 1)
        self.assertEqual(res["metadata"]["depth_points_count"], 4)
        self.assertEqual(len(res["depth_profile_table"]), 4)

    def test_generate_liquefaction_report_plots(self):
        """Validates generation of publication charts, base64 strings and executive tables."""
        import tempfile
        import shutil

        temp_dir = tempfile.mkdtemp()
        try:
            inputs = {
                "mw_values": [7.5],
                "a_max_values": [0.55, 0.70],
                "n1_values": [15.0, 33.0, 45.0],
                "water_depth": 3.5,
                "soil_gamma": 19.0,
                "fines_content_fc": 10.0,
                "max_depth": 15.0,
                "depth_step": 1.0
            }
            res = generate_liquefaction_report_plots(inputs, output_dir=temp_dir)
            self.assertTrue(res["success"])
            self.assertIn("plots", res)
            
            # Check base64 strings
            self.assertTrue(res["plots"]["profile_envelope_png_base64"].startswith("data:image/png;base64,"))
            self.assertTrue(res["plots"]["tornado_sensitivity_png_base64"].startswith("data:image/png;base64,"))
            
            # Check file saves
            saved = res["plots"]["saved_files"]
            self.assertIn("profile_plot_path", saved)
            self.assertIn("tornado_plot_path", saved)
            
            import os
            self.assertTrue(os.path.exists(saved["profile_plot_path"]))
            self.assertTrue(os.path.exists(saved["tornado_plot_path"]))
            self.assertGreater(os.path.getsize(saved["profile_plot_path"]), 1000)
            self.assertGreater(os.path.getsize(saved["tornado_plot_path"]), 1000)
            
            # Check executive table rows
            exec_table = res["executive_table"]
            self.assertEqual(len(exec_table), 3)
            self.assertEqual(exec_table[0]["status"], "SEGURO (FS >= 1.2)")
            self.assertIn("SEGURO", exec_table[1]["status"])
            
            # Check technical note text
            self.assertIn("NOTA TÉCNICA", res["technical_note_text"])
            self.assertIn("PREMISSAS METODOLÓGICAS", res["technical_note_text"])
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    def test_export_liquefaction_profile_excel(self):
        """Validates generation of styled Excel workbook with native number formats and base64."""
        import tempfile
        import shutil
        import os

        temp_dir = tempfile.mkdtemp()
        try:
            excel_path = os.path.join(temp_dir, "test_perfil.xlsx")
            res = export_liquefaction_profile_excel(self.ref_data["parametric_defaults"], output_path=excel_path)
            self.assertTrue(res["success"])
            self.assertTrue(res["base64"].startswith("data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,"))
            self.assertTrue(os.path.exists(excel_path))
            self.assertGreater(os.path.getsize(excel_path), 2000)

            # Check contents with openpyxl
            import openpyxl
            wb = openpyxl.load_workbook(excel_path)
            ws = wb.active
            self.assertEqual(ws.title, "Perfil de Liquefação")
            # Row 7 is first data row: check depth is float
            depth_cell = ws.cell(row=7, column=1)
            self.assertIsInstance(depth_cell.value, (int, float))
            self.assertEqual(depth_cell.number_format, "0.00")
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == '__main__':
    unittest.main()
