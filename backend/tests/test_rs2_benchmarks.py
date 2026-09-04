import os
import json
import unittest

class TestRS2BenchmarkFiles(unittest.TestCase):
    def setUp(self):
        self.base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
        self.test_dir = os.path.join(self.base_dir, 'test_files', 'rs2')
        self.expected_files = [
            '01_talude_estabilidade_ssr.json',
            '02_escavacao_profunda_rebaixamento.json',
            '03_tunel_cavidade_rochosa.json',
            '04_sapata_capacidade_de_carga.json',
            '05_talude_com_camada_fraca.json'
        ]

    def test_all_test_files_exist(self):
        for fname in self.expected_files:
            fpath = os.path.join(self.test_dir, fname)
            self.assertTrue(os.path.exists(fpath), f"File {fname} missing from test_files/rs2")
            self.assertGreater(os.path.getsize(fpath), 10000, f"File {fname} is too small")

    def test_load_and_validate_structure(self):
        for fname in self.expected_files:
            fpath = os.path.join(self.test_dir, fname)
            with open(fpath, 'r', encoding='utf-8') as f:
                data = json.load(f)

            self.assertEqual(data.get('app'), 'RS2_Geotechnical_FEA')
            self.assertIn('mesh', data)
            self.assertIn('results', data)
            self.assertIn('soilProps', data)

            mesh = data['mesh']
            self.assertGreater(mesh['num_nodes'], 100)
            self.assertGreater(mesh['num_elements'], 150)
            self.assertEqual(len(mesh['nodes']), mesh['num_nodes'])
            self.assertEqual(len(mesh['elements']), mesh['num_elements'])

            results = data['results']
            self.assertTrue(results.get('converged', False))
            self.assertIn('nodes', results)
            nodes_res = results['nodes']
            self.assertIn('Utot', nodes_res)
            self.assertIn('sig1', nodes_res)
            self.assertIn('sig3', nodes_res)
            self.assertIn('tau_max', nodes_res)

    def test_factor_of_safety_results(self):
        # Case 1: Standard slope must be stable (FS > 1.0)
        c1_path = os.path.join(self.test_dir, '01_talude_estabilidade_ssr.json')
        with open(c1_path, 'r', encoding='utf-8') as f:
            c1_data = json.load(f)
        c1_fs = c1_data['results'].get('critical_srf')
        self.assertIsNotNone(c1_fs)
        self.assertGreater(c1_fs, 1.20)
        self.assertLess(c1_fs, 1.60)

        # Case 5: Weak seam slope must be critical/unstable (FS < 1.0)
        c5_path = os.path.join(self.test_dir, '05_talude_com_camada_fraca.json')
        with open(c5_path, 'r', encoding='utf-8') as f:
            c5_data = json.load(f)
        c5_fs = c5_data['results'].get('critical_srf')
        self.assertIsNotNone(c5_fs)
        self.assertLess(c5_fs, 1.05)


if __name__ == '__main__':
    unittest.main()
