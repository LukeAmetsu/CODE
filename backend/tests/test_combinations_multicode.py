import unittest
from backend.calculators.nbr_6118_comb import calculate_combinations, generate_valid_load_subsets

class TestCombinationsMultiCode(unittest.TestCase):

    def setUp(self):
        # Scenario from user:
        # Solo Seco e Solo Saturado NÃO atuam juntos (grupo exclusivo 'Solo')
        # Solo Saturado e Água ATUAM juntos (requires: 'Água')
        self.geotech_loads = [
            {'name': 'Peso Próprio Estrutura', 'type': 'Peso Próprio (PP)', 'value': 50.0, 'group': ''},
            {'name': 'Solo Seco', 'type': 'Solo Seco (Empuxo)', 'value': 30.0, 'group': 'Solo'},
            {'name': 'Solo Saturado', 'type': 'Solo Saturado (Empuxo)', 'value': 22.0, 'group': 'Solo', 'requires': ['Água']},
            {'name': 'Água', 'type': 'Pressão Hidrostática / Água', 'value': 15.0, 'group': ''},
            {'name': 'Sobrecarga Uso', 'type': 'Uso Residencial (Q)', 'value': 10.0, 'group': ''}
        ]

    def test_valid_load_subsets_exclusion_and_coexistence(self):
        """Testa se os subconjuntos de cargas respeitam rigorosamente a exclusão e a coexistência."""
        subsets = generate_valid_load_subsets(self.geotech_loads)
        
        for s in subsets:
            names = [l['name'] for l in s]
            # 1. Solo Seco e Solo Saturado JAMAIS podem estar juntos
            self.assertFalse('Solo Seco' in names and 'Solo Saturado' in names,
                             f"Violação de exclusão mútua: {names}")
            
            # 2. Se Solo Saturado estiver ativo, Água DEVE estar presente
            if 'Solo Saturado' in names:
                self.assertIn('Água', names,
                              f"Violação de dependência: Solo Saturado ativo sem Água em {names}")
            
            # 3. Se Solo Seco estiver ativo, Água NÃO deve estar presente
            if 'Solo Seco' in names:
                self.assertNotIn('Água', names,
                                 f"Violação: Solo Seco com Água em {names}")

    def test_nbr_combinations_geotechnical_rules(self):
        """Testa combinações da NBR com regras geotécnicas."""
        res = calculate_combinations({
            'loads': self.geotech_loads,
            'standard': 'NBR 8681',
            'method': 'ELU_NORMAL'
        })
        self.assertIn('combinations', res)
        elu_combos = res['combinations']['elu']
        self.assertGreater(len(elu_combos), 0)

        for c in elu_combos:
            form = c['formula']
            # Jamais deve ter Solo Seco e Solo Saturado na mesma fórmula
            self.assertFalse('Solo Seco' in form and 'Solo Saturado' in form,
                             f"Fórmula NBR inválida: {form}")
            if 'Solo Saturado' in form:
                self.assertIn('Água', form,
                              f"Fórmula NBR com Solo Saturado sem Água: {form}")
            if 'Solo Seco' in form:
                self.assertNotIn('Água', form,
                                 f"Fórmula NBR com Solo Seco e Água: {form}")

    def test_eurocode_combinations_geotechnical_rules(self):
        """Testa combinações do Eurocode EN 1990 com regras geotécnicas."""
        res = calculate_combinations({
            'loads': self.geotech_loads,
            'standard': 'Eurocode EN 1990',
            'method': 'STR_GEO_B'
        })
        self.assertIn('combinations', res)
        elu_combos = res['combinations']['elu']
        self.assertGreater(len(elu_combos), 0)

        for c in elu_combos:
            form = c['formula']
            self.assertFalse('Solo Seco' in form and 'Solo Saturado' in form)
            if 'Solo Saturado' in form:
                self.assertIn('Água', form)
            if 'Solo Seco' in form:
                self.assertNotIn('Água', form)

    def test_asce_combinations_geotechnical_rules(self):
        """Testa combinações da ASCE 7 (LRFD e ASD) com regras geotécnicas."""
        for method in ['LRFD', 'ASD']:
            res = calculate_combinations({
                'loads': self.geotech_loads,
                'standard': 'ASCE 7-16',
                'method': method
            })
            combos = res['combinations']['elu'] if method == 'LRFD' else res['combinations']['els_rara']
            self.assertGreater(len(combos), 0)

            for c in combos:
                form = c['formula']
                self.assertFalse('Solo Seco' in form and 'Solo Saturado' in form)
                if 'Solo Saturado' in form:
                    self.assertIn('Água', form)
                if 'Solo Seco' in form:
                    self.assertNotIn('Água', form)

    def test_envelopes_calculation(self):
        """Testa o cálculo correto das envoltórias de máximo e mínimo."""
        res = calculate_combinations({
            'loads': self.geotech_loads,
            'standard': 'NBR 8681',
            'method': 'ELU_NORMAL'
        })
        env = res['envelopes']
        self.assertGreater(env['max_elu'], 0.0)
        self.assertGreater(env['max_elu'], env['min_elu'])
        self.assertIsNotNone(env['max_elu_comb'])

    def test_custom_companion_and_xor_rules(self):
        """Testa regras customizadas de exclusão e coexistência com outras cargas."""
        loads = [
            {'name': 'G1', 'type': 'Peso Próprio (PP)', 'value': 100.0, 'group': ''},
            {'name': 'Vento 0', 'type': 'Vento (W)', 'value': 20.0, 'group': 'Vento'},
            {'name': 'Vento 90', 'type': 'Vento (W)', 'value': 25.0, 'group': 'Vento'},
            {'name': 'Guindaste', 'type': 'Ponte Rolante / Guindaste (Q)', 'value': 40.0, 'group': '', 'requires': ['Manutencao']},
            {'name': 'Manutencao', 'type': 'Cobertura / Manutenção (Q)', 'value': 5.0, 'group': ''}
        ]
        subsets = generate_valid_load_subsets(loads)
        for s in subsets:
            names = [l['name'] for l in s]
            # Vento 0 e Vento 90 nunca juntos
            self.assertFalse('Vento 0' in names and 'Vento 90' in names)
            # Se Guindaste ativo, Manutencao deve estar presente
            if 'Guindaste' in names:
                self.assertIn('Manutencao', names)

    def test_geotechnical_ponderada_combinations(self):
        """Testa combinações geotécnicas ponderadas (EQU tombamento com alívio 0.90, GEO-SLI e GEO-STR)."""
        foundation_loads = [
            {'name': 'Sapata+Solo', 'type': 'Sapata: Peso Próprio + Solo (G_est)', 'value': 80.0, 'group': ''},
            {'name': 'Nk_g', 'type': 'Pilar: Carga Normal Permanente (Nk_g)', 'value': 300.0, 'group': ''},
            {'name': 'Nk_q', 'type': 'Pilar: Sobrecarga Normal (Nk_q)', 'value': 100.0, 'group': ''},
            {'name': 'Hk_w', 'type': 'Pilar: Força Horizontal Vento (Hk_w)', 'value': 40.0, 'group': ''},
            {'name': 'Mk_w', 'type': 'Pilar: Momento Fletor Vento (Mk_w)', 'value': 70.0, 'group': ''}
        ]
        res = calculate_combinations({
            'loads': foundation_loads,
            'standard': 'NBR 8681',
            'method': 'GEO_PONDERADA'
        })
        self.assertIn('combinations', res)
        elu_combos = res['combinations']['elu']
        self.assertGreater(len(elu_combos), 0)

        # 1. Deve haver combinações de EQU (Tombamento) com alívio 0.90 nas cargas verticais estabilizantes
        equ_combos = [c for c in elu_combos if c.get('category') == 'tombamento' or 'EQU' in c.get('title', '')]
        self.assertGreater(len(equ_combos), 0, "Deve gerar combinações de EQU Tombamento")
        for c in equ_combos:
            self.assertIn('0.90*Sapata+Solo', c['formula'])
            self.assertIn('0.90*Nk_g', c['formula'])
        self.assertTrue(any('1.40*Mk_w' in c['formula'] for c in equ_combos), "Ao menos uma combinação EQU deve ter 1.40*Mk_w como principal")

        # 2. Deve haver combinações de GEO-SLI (Deslizamento)
        sli_combos = [c for c in elu_combos if c.get('category') == 'deslizamento' or 'GEO-SLI' in c.get('title', '')]
        self.assertGreater(len(sli_combos), 0, "Deve gerar combinações de GEO-SLI Deslizamento")
        for c in sli_combos:
            self.assertIn('0.90*Sapata+Solo', c['formula'])
        self.assertTrue(any('1.40*Hk_w' in c['formula'] for c in sli_combos), "Ao menos uma combinação GEO-SLI deve ter 1.40*Hk_w como principal")

        # 3. Deve haver combinações de GEO-STR (Capacidade de Carga)
        str_combos = [c for c in elu_combos if c.get('category') == 'capacidade_carga' or 'GEO-STR' in c.get('title', '')]
        self.assertGreater(len(str_combos), 0, "Deve gerar combinações de GEO-STR Capacidade de Carga")
        self.assertTrue(any('1.40*Nk_g' in c['formula'] for c in str_combos), "Combinações GEO-STR devem majorar cargas desfavoráveis com 1.40")

    def test_geotechnical_fs_global_combinations(self):
        """Testa combinações geotécnicas por Fatores de Segurança Globais (valores característicos gamma=1.00)."""
        foundation_loads = [
            {'name': 'Sapata+Solo', 'type': 'Sapata: Peso Próprio + Solo (G_est)', 'value': 80.0, 'group': ''},
            {'name': 'Nk_g', 'type': 'Pilar: Carga Normal Permanente (Nk_g)', 'value': 300.0, 'group': ''},
            {'name': 'Hk_w', 'type': 'Pilar: Força Horizontal Vento (Hk_w)', 'value': 40.0, 'group': ''}
        ]
        res = calculate_combinations({
            'loads': foundation_loads,
            'standard': 'NBR 8681',
            'method': 'GEO_FS_GLOBAL'
        })
        self.assertIn('combinations', res)
        # Em FS Global, as combinações características vão para els_rara e els_qp
        rara_combos = res['combinations']['els_rara']
        self.assertGreater(len(rara_combos), 0, "Deve gerar combinações características ELS/ASD")
        for c in rara_combos:
            self.assertIn('1.00*Sapata+Solo', c['formula'])
            self.assertIn('1.00*Nk_g', c['formula'])

    def test_geotechnical_preset_shallow_foundation(self):
        """Testa a combinação completa GEO_COMPLETA para sapatas."""
        foundation_loads = [
            {'name': 'G_est', 'type': 'Sapata: Peso Próprio + Solo (G_est)', 'value': 85.0, 'group': ''},
            {'name': 'Nk_g', 'type': 'Pilar: Carga Normal Permanente (Nk_g)', 'value': 250.0, 'group': ''},
            {'name': 'Nk_q', 'type': 'Pilar: Sobrecarga Normal (Nk_q)', 'value': 120.0, 'group': ''},
            {'name': 'Hk_w', 'type': 'Pilar: Força Horizontal Vento (Hk_w)', 'value': 35.0, 'group': ''},
            {'name': 'Mk_w', 'type': 'Pilar: Momento Fletor Vento (Mk_w)', 'value': 65.0, 'group': ''}
        ]
        res = calculate_combinations({
            'loads': foundation_loads,
            'standard': 'NBR 8681',
            'method': 'GEO_COMPLETA'
        })
        self.assertIn('combinations', res)
        self.assertGreater(len(res['combinations']['elu']), 0)
        self.assertGreater(len(res['combinations']['els_rara']), 0)
        self.assertGreater(len(res['combinations']['els_qp']), 0)

if __name__ == '__main__':
    unittest.main()
