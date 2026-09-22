import unittest
import os
import tempfile
from backend.calculators.comb_bases_mietc import (
    parse_mietc_workbook,
    calculate_single_base_combinations,
    batch_calculate_sheet_bases,
    export_mietc_results_to_excel,
    auto_detect_subsequent_pairs,
    calculate_combined_footing_envelopes
)

class TestMietcCombinations(unittest.TestCase):
    def setUp(self):
        self.ref_file = os.path.join(os.path.dirname(__file__), "..", "..", "Refs", "Cópia de Cargas nas bases MIETC.xlsx")
        self.has_ref = os.path.exists(self.ref_file)

    def test_parse_workbook(self):
        if not self.has_ref:
            self.skipTest("Reference Excel file not found.")
        
        parsed = parse_mietc_workbook(self.ref_file)
        self.assertIn("sheets", parsed)
        self.assertIn("sheet_names", parsed)
        self.assertGreater(len(parsed["sheet_names"]), 0)
        
        # Test Cargas 01
        sheet1 = parsed["sheets"].get("Cargas 01")
        self.assertIsNotNone(sheet1)
        self.assertIn("bases_data", sheet1)
        self.assertIn("BT1", sheet1["bases_data"])
        self.assertIn("PP", sheet1["bases_data"]["BT1"])
        self.assertIn("V", sheet1["bases_data"]["BT1"]["PP"])
        self.assertIn("X", sheet1["bases_data"]["BT1"]["PP"])
        self.assertIn("Y", sheet1["bases_data"]["BT1"]["PP"])

    def test_calculate_single_base(self):
        if not self.has_ref:
            self.skipTest("Reference Excel file not found.")

        parsed = parse_mietc_workbook(self.ref_file)
        sheet1 = parsed["sheets"]["Cargas 01"]
        base_bt1 = sheet1["bases_data"]["BT1"]

        # Run ELU combinations
        res = calculate_single_base_combinations("BT1", base_bt1, standard="NBR 8681", method="ELU_NORMAL")
        self.assertIn("combinations", res)
        self.assertIn("envelopes", res)
        self.assertGreater(len(res["combinations"]), 0)

        combos = res["combinations"]
        for c in combos:
            self.assertIn("V", c)
            self.assertIn("X", c)
            self.assertIn("Y", c)
            self.assertIn("H_res", c)
            self.assertGreaterEqual(c["H_res"], 0.0)

        envs = res["envelopes"]
        self.assertIn("V_max", envs)
        self.assertIn("V_min", envs)
        self.assertIn("H_max", envs)
        self.assertGreaterEqual(envs["V_max"]["value"], envs["V_min"]["value"])

    def test_batch_calculate_and_export_excel(self):
        if not self.has_ref:
            self.skipTest("Reference Excel file not found.")

        parsed = parse_mietc_workbook(self.ref_file)
        sheet1 = parsed["sheets"]["Cargas 01"]

        batch_res = batch_calculate_sheet_bases(sheet1, standard="NBR 8681", method="ELU_NORMAL")
        self.assertIn("summary_table", batch_res)
        self.assertIn("global_kpi", batch_res)
        self.assertEqual(len(batch_res["summary_table"]), len(sheet1["bases_data"]))

        # Check export
        with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
            tmp_path = tmp.name

        try:
            out_file = export_mietc_results_to_excel(batch_res, tmp_path)
            self.assertTrue(os.path.exists(out_file))
            self.assertGreater(os.path.getsize(out_file), 1000)

            # Verificar a aba executiva de resumo de cargas para avaliação de terceiros
            import openpyxl
            wb = openpyxl.load_workbook(out_file)
            self.assertIn("Resumo_Cargas_Consideradas", wb.sheetnames)
            self.assertIn("Resumo_Envoltórias", wb.sheetnames)
            self.assertIn("Todas_Combinações", wb.sheetnames)
            self.assertEqual(wb.sheetnames[0], "Resumo_Cargas_Consideradas")

            ws_cargas = wb["Resumo_Cargas_Consideradas"]
            self.assertIn("RESUMO DAS CARGAS CONSIDERADAS", str(ws_cargas.cell(1, 1).value))
            self.assertEqual(ws_cargas.cell(5, 2).value, "Ação (Sigla)")
            self.assertEqual(ws_cargas.cell(5, 7).value, "Pode Zerar (Alívio Crítico)")
            wb.close()
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def test_exclusive_groups_and_requirements(self):
        """Verifica que ações com o mesmo grupo exclusivo (XOR) nunca atuam juntas e que AND é respeitado"""
        base_loads = {
            'PP': {'V': 100.0, 'X': 0.0, 'Y': 0.0},
            'SCM': {'V': 20.0, 'X': 0.0, 'Y': 0.0},
            'CVX+': {'V': 0.0, 'X': 30.0, 'Y': 0.0},
            'CVY+': {'V': 0.0, 'X': 0.0, 'Y': 30.0},
            'TCQ': {'V': 40.0, 'X': 5.0, 'Y': 0.0},
            'TCP': {'V': 15.0, 'X': 2.0, 'Y': 0.0},
            'SCA': {'V': 12.0, 'X': 0.0, 'Y': 0.0},
        }

        # Regras com XOR e AND
        options = {
            'action_rules': {
                'CVX+': {'group': 'Vento', 'requires': '', 'type': 'Vento (W)'},
                'CVY+': {'group': 'Vento', 'requires': '', 'type': 'Vento (W)'},
                'TCQ': {'group': 'Talha', 'requires': '', 'type': 'Ponte Rolante / Guindaste (Q)'},
                'TCP': {'group': 'Talha', 'requires': '', 'type': 'Ponte Rolante / Guindaste (Q)'},
                'SCA': {'group': '', 'requires': '', 'type': 'Sobrecarga Acidental (SCA)'},
            },
            'custom_loads': [
                {'name': 'Empuxo Solo Seco', 'type': 'Solo Seco (Empuxo)', 'value': 35.0, 'group': 'Solo', 'requires': '', 'direction': 'X'},
                {'name': 'Empuxo Solo Saturado', 'type': 'Solo Saturado (Empuxo)', 'value': 25.0, 'group': 'Solo', 'requires': 'Pressão da Água', 'direction': 'X'},
                {'name': 'Pressão da Água', 'type': 'Pressão Hidrostática / Água', 'value': 18.0, 'group': '', 'requires': '', 'direction': 'X'}
            ]
        }

        res = calculate_single_base_combinations("TEST_BASE", base_loads, standard="NBR 8681", method="ELU_NORMAL", options=options)
        combos = res["combinations"]
        self.assertGreater(len(combos), 0)

        for c in combos:
            factors = c.get("factors", {})
            # 1. Teste XOR Vento: CVX+ e CVY+ nunca podem ter fatores positivos simultaneamente
            self.assertFalse(
                factors.get('CVX+', 0) > 0 and factors.get('CVY+', 0) > 0,
                f"Combinação violou XOR Vento (CVX+ e CVY+ simultâneos): {c['title']}"
            )

            # 2. Teste XOR Talha: TCQ e TCP nunca podem ter fatores positivos simultaneamente
            self.assertFalse(
                factors.get('TCQ', 0) > 0 and factors.get('TCP', 0) > 0,
                f"Combinação violou XOR Talha (TCQ e TCP simultâneos): {c['title']}"
            )

            # 3. Teste XOR Solo: Solo Seco e Solo Saturado nunca podem ter fatores positivos simultaneamente
            self.assertFalse(
                factors.get('Empuxo Solo Seco', 0) > 0 and factors.get('Empuxo Solo Saturado', 0) > 0,
                f"Combinação violou XOR Solo: {c['title']}"
            )

            # 4. Teste AND: Empuxo Solo Saturado requer Pressão da Água
            if factors.get('Empuxo Solo Saturado', 0) > 0:
                self.assertGreater(
                    factors.get('Pressão da Água', 0), 0,
                    f"Combinação violou AND (Empuxo Solo Saturado sem Pressão da Água): {c['title']}"
                )

            # 5. Teste Condição Física: Solo Seco desativa Água
            if factors.get('Empuxo Solo Seco', 0) > 0:
                self.assertEqual(
                    factors.get('Pressão da Água', 0), 0,
                    f"Combinação violou condição física (Solo Seco com Pressão da Água): {c['title']}"
                )

    def test_formulas_no_trailing_plus_and_six_envelopes(self):
        """Verifica que as fórmulas geradas nunca terminam com '+' isolado e que as 6 envoltórias estão calculadas"""
        base_loads = {
            'PP': {'V': 150.0, 'X': 0.0, 'Y': 0.0},
            'CP': {'V': 50.0, 'X': 0.0, 'Y': 0.0},
            'SCM': {'V': 30.0, 'X': 0.0, 'Y': 0.0},
            'SCP': {'V': 25.0, 'X': 0.0, 'Y': 0.0},
            'T+': {'V': 5.0, 'X': 10.0, 'Y': 0.0},
            'CVX+': {'V': 0.0, 'X': 45.0, 'Y': 0.0},
            'CVY+': {'V': 0.0, 'X': 0.0, 'Y': 40.0},
        }

        res = calculate_single_base_combinations("B_TEST", base_loads, standard="NBR 8681", method="TODAS")
        combos = res["combinations"]
        self.assertGreater(len(combos), 0)

        for c in combos:
            formula = c.get("formula", "").strip()
            # A fórmula nunca deve terminar com o caractere '+' solto
            self.assertFalse(formula.endswith('+'), f"Fórmula terminou com '+': {formula}")
            # Ações com '+' no nome como CVX+, CVY+, T+ devem aparecer entre parênteses: (CVX+), (CVY+), (T+)
            for act in ['CVX+', 'CVY+', 'T+']:
                if act in formula:
                    self.assertIn(f"({act})", formula, f"Ação {act} não formatada com parênteses em: {formula}")

        # Verifica a estrutura completa das 6 envoltórias
        envs = res["envelopes"]
        self.assertIn("peaks", envs)
        self.assertIn("V_max", envs)
        self.assertIn("V_min", envs)
        self.assertIn("X_max", envs)
        self.assertIn("Y_max", envs)
        self.assertIn("H_max", envs)

        # 1. Picos Globais
        peaks = envs["peaks"]
        self.assertIn("V_max", peaks)
        self.assertIn("X_max", peaks)
        self.assertIn("Y_max", peaks)
        self.assertIn("H_max", peaks)

        # 2. V_max e concomitantes
        self.assertIn("concomitant_X", envs["V_max"])
        self.assertIn("concomitant_Y", envs["V_max"])
        self.assertIn("concomitant_H", envs["V_max"])

        # 3. V_min e concomitantes
        self.assertIn("concomitant_X", envs["V_min"])
        self.assertIn("concomitant_Y", envs["V_min"])
        self.assertIn("concomitant_H", envs["V_min"])

        # 4. X_max e concomitantes
        self.assertIn("concomitant_V", envs["X_max"])
        self.assertIn("concomitant_Y", envs["X_max"])
        self.assertIn("concomitant_H", envs["X_max"])

        # 5. Y_max e concomitantes
        self.assertIn("concomitant_V", envs["Y_max"])
        self.assertIn("concomitant_X", envs["Y_max"])
        self.assertIn("concomitant_H", envs["Y_max"])

        # 6. H_max e concomitantes
        self.assertIn("concomitant_V", envs["H_max"])
        self.assertIn("concomitant_X", envs["H_max"])
        self.assertIn("concomitant_Y", envs["H_max"])

        # Testar resumo de batch
        fake_sheet = {
            'sheet_name': 'Sheet1',
            'bases_data': {'B_TEST': base_loads}
        }
        batch = batch_calculate_sheet_bases(fake_sheet, standard="NBR 8681", method="ELU_NORMAL")
        row = batch["summary_table"][0]
        # Todos os 6 envelopes devem estar preenchidos no summary_table
        self.assertIn("peak_V", row)
        self.assertIn("peak_X", row)
        self.assertIn("peak_Y", row)
        self.assertIn("peak_H", row)
        self.assertIn("V_max", row)
        self.assertIn("V_min", row)
        self.assertIn("X_max", row)
        self.assertIn("Y_max", row)
        self.assertIn("H_max", row)
        self.assertIn("X_max_V", row)
        self.assertIn("Y_max_V", row)
        self.assertIn("H_max_V", row)

    def test_zeroed_load_conservative_uplift(self):
        """Verifica que cargas verticais zeráveis são desconsideradas para encontrar a máxima tração (arrancamento)"""
        base_loads = {
            'PP': {'V': 50.0, 'X': 0.0, 'Y': 0.0},
            'CVX+': {'V': -150.0, 'X': 60.0, 'Y': 0.0}, # Vento de tombamento causando tração (-150 kN)
            'SCA': {'V': 80.0, 'X': 0.0, 'Y': 0.0},     # Sobrecarga vertical (+80 kN) que aliviaria a tração se mantida
        }
        options = {
            'action_rules': {
                'PP': {'can_zero': False},
                'CVX+': {'type': 'Vento (W)', 'can_zero': False},
                'SCA': {'type': 'Sobrecarga Acidental (SCA)', 'can_zero': True} # Usuário indicou que SCA pode ser zerada
            },
            'enable_zero_load_scenarios': True
        }
        res = calculate_single_base_combinations("Sapata_Torre", base_loads, standard="NBR 8681", method="ELU_NORMAL", options=options)
        
        # O caso com SCA ativa daria: 1.0*50 + 1.4*(-150) + 0.98*(80) = 50 - 210 + 78.4 = -81.6 kN
        # O caso com SCA ZERADA dá: 1.0*50 + 1.4*(-150) + 0.00*(80) = 50 - 210 = -160.0 kN
        # Portanto, V_min deve atingir exatamente -160.0 kN!
        v_min_env = res['envelopes']['V_min']
        self.assertAlmostEqual(v_min_env['value'], -160.0, places=2)
        self.assertIn("SCA Zerada", v_min_env['combination'])

    def test_auto_detect_subsequent_pairs(self):
        """Verifica detecção automática de pares de bases subsequentes (ex: BT1+BT2, BT3+BT4)"""
        bases = ["BT1", "BT2", "BT3", "BT4", "BA1", "BA2"]
        pairs = auto_detect_subsequent_pairs(bases)
        self.assertEqual(len(pairs), 3)
        self.assertEqual(pairs[0]['bases'], ["BA1", "BA2"])
        self.assertEqual(pairs[1]['bases'], ["BT1", "BT2"])
        self.assertEqual(pairs[2]['bases'], ["BT3", "BT4"])

    def test_grouped_bases_combination_and_envelopes(self):
        """Verifica a soma algébrica das forças e a envoltória conjunta para sapatas agrupadas (BT1 + BT2)"""
        sheet_data = {
            'sheet_name': 'Teste_Sapata_Conjunta',
            'bases_data': {
                'BT1': {
                    'PP': {'V': 100.0, 'X': 10.0, 'Y': 5.0},
                    'CVX+': {'V': -40.0, 'X': 25.0, 'Y': 0.0}
                },
                'BT2': {
                    'PP': {'V': 150.0, 'X': -10.0, 'Y': 15.0},
                    'CVX+': {'V': 80.0, 'X': 20.0, 'Y': 0.0}
                }
            }
        }
        options = {
            'base_groups': [
                {'name': 'Sapata 1 (BT1 + BT2)', 'bases': ['BT1', 'BT2']}
            ]
        }

        res = batch_calculate_sheet_bases(sheet_data, standard="NBR 8681", method="ELU_NORMAL", options=options)
        self.assertIn("combined_footings", res)
        cf = res["combined_footings"]
        self.assertEqual(len(cf["summary_table"]), 1)
        row = cf["summary_table"][0]
        self.assertEqual(row["base"], "Sapata 1 (BT1 + BT2)")
        self.assertEqual(row["member_bases"], ["BT1", "BT2"])

        # Para cada combinação, V_total = V_BT1 + V_BT2
        footing_details = cf["footings_details"]["Sapata 1 (BT1 + BT2)"]
        combos = footing_details["combinations"]
        bt1_combos = res["bases_details"]["BT1"]["combinations"]
        bt2_combos = res["bases_details"]["BT2"]["combinations"]

        self.assertEqual(len(combos), len(bt1_combos))
        for i in range(len(combos)):
            expected_v = bt1_combos[i]["V"] + bt2_combos[i]["V"]
            expected_x = bt1_combos[i]["X"] + bt2_combos[i]["X"]
            expected_y = bt1_combos[i]["Y"] + bt2_combos[i]["Y"]
            self.assertAlmostEqual(combos[i]["V"], expected_v, places=2)
            self.assertAlmostEqual(combos[i]["X"], expected_x, places=2)
            self.assertAlmostEqual(combos[i]["Y"], expected_y, places=2)

        # Verificar que a envoltória V_max é a maior soma e contém o breakdown
        v_max_val = row["V_max"]
        self.assertGreater(v_max_val, 0.0)
        self.assertIn("BT1", row["V_max_breakdown"])
        self.assertIn("BT2", row["V_max_breakdown"])
        self.assertAlmostEqual(
            row["V_max_breakdown"]["BT1"]["V"] + row["V_max_breakdown"]["BT2"]["V"],
            v_max_val,
            places=2
        )

    def test_export_excel_with_combined_footings(self):
        """Verifica se a aba 'Sapatas_Conjuntas' é gerada na exportação para Excel"""
        sheet_data = {
            'sheet_name': 'Linha_Transmissao',
            'bases_data': {
                'BT1': {'PP': {'V': 80.0, 'X': 5.0, 'Y': 2.0}},
                'BT2': {'PP': {'V': 90.0, 'X': 4.0, 'Y': 1.0}}
            }
        }
        options = {
            'base_groups': [
                {'name': 'Sapata Perna A (BT1+BT2)', 'bases': ['BT1', 'BT2']}
            ]
        }
        res = batch_calculate_sheet_bases(sheet_data, standard="NBR 8681", method="ELU_NORMAL", options=options)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
            tmp_path = tmp.name

        try:
            out_file = export_mietc_results_to_excel(res, tmp_path)
            self.assertTrue(os.path.exists(out_file))

            import openpyxl
            wb = openpyxl.load_workbook(out_file)
            self.assertIn("Sapatas_Conjuntas", wb.sheetnames)
            ws_sc = wb["Sapatas_Conjuntas"]
            self.assertIn("ENVOLTÓRIAS CRÍTICAS DE SAPATAS CONJUNTAS", str(ws_sc.cell(1, 1).value))
            self.assertEqual(ws_sc.cell(6, 1).value, "Sapata Perna A (BT1+BT2)")
            self.assertEqual(ws_sc.cell(6, 2).value, "BT1 + BT2")
            wb.close()
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

if __name__ == "__main__":
    unittest.main()

