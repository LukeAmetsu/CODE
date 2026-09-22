import os
import json
import unittest


class TestRS2BenchmarkFiles(unittest.TestCase):
    def setUp(self):
        self.base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
        self.test_dir = os.path.join(self.base_dir, 'test_files', 'rs2')

        # 21 Canonical Phase2 Tutorials
        self.phase2_files = [
            'phase2_tut01_tunel_circular_kirsch.json',
            'phase2_tut02_escavacao_solo_estratificado.json',
            'phase2_tut03_tunnel_support_bolts_shotcrete.json',
            'phase2_tut04_surface_excavation_trench.json',
            'phase2_tut05_joint_opening.json',
            'phase2_tut06_axisymmetric_shaft.json',
            'phase2_tut07_groundwater_seepage.json',
            'phase2_tut08_shear_strength_reduction.json',
            'phase2_tut09_slide_import_ssr.json',
            'phase2_tut10_ssr_search_area.json',
            'phase2_tut11_geogrid_embankment_no_slip.json',
            'phase2_tut13_cofferdam_seepage.json',
            'phase2_tut16_retaining_wall.json',
            'phase2_tut17_trench_piles_struts.json',
            'phase2_tut18_3d_tunnel_core_replacement.json',
            'phase2_tut21_levee_toe_drain.json',
            'phase2_tut23_anchored_sheet_pile_wall.json',
            'phase2_tut24_tunnel_lining_design.json',
            'phase2_tut26_drawdown_analysis_slope.json',
            'phase2_tut30_slope_angle_optimization.json',
            'phase2_tut32_probabilistic_slope_stability.json'
        ]

        # 5 Canonical Adonis Tutorials & Benchmarks
        self.adonis_files = [
            'adonis_tut01_kirsch_abertura_biaxial.json',
            'adonis_tut02_sapata_capacidade_carga_prandtl.json',
            'adonis_tut03_talude_camada_fraca_ssr.json',
            'adonis_tut04_cortina_estacas_prancha.json',
            'adonis_tut05_tunel_ferradura_caverna.json'
        ]

        # Legacy aliases
        self.legacy_files = [
            '01_talude_estabilidade_ssr.json',
            '02_escavacao_profunda_rebaixamento.json',
            '03_tunel_cavidade_rochosa.json',
            '04_sapata_capacidade_de_carga.json',
            '05_talude_com_camada_fraca.json',
            'phase2_tut03_barragem_terra_zoneada.json',
            'phase2_tut04_talude_ssr_estabilidade.json',
            'phase2_tut05_aterro_fundacao_mole.json',
            'phase2_tut06_cava_ancorada_parede_diafragma.json',
            'phase2_tut07_muro_balanco_concreto_armado.json'
        ]

        self.all_expected_files = self.phase2_files + self.adonis_files + self.legacy_files

    def test_all_files_exist_and_non_empty(self):
        """Verify that all 26 tutorial files and 10 legacy aliases exist and are robustly sized."""
        for fname in self.all_expected_files:
            fpath = os.path.join(self.test_dir, fname)
            self.assertTrue(os.path.exists(fpath), f"File {fname} missing from test_files/rs2")
            self.assertGreater(os.path.getsize(fpath), 20000, f"File {fname} is too small (< 20KB)")

    def test_load_and_validate_structure(self):
        """Verify the schema, mesh quality, and results fields for all 26 tutorial benchmarks."""
        for fname in self.phase2_files + self.adonis_files:
            fpath = os.path.join(self.test_dir, fname)
            with open(fpath, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Metadata verification
            self.assertEqual(data.get('app'), 'RS2_Geotechnical_FEA')
            self.assertEqual(data.get('version'), '2.0')
            self.assertIn('title', data)
            self.assertIn('suite', data)
            self.assertIn('tutorial_num', data)
            self.assertIn('summary', data)
            self.assertIn('theoretical_ref', data)
            self.assertIn('expected_results', data)

            # Core components
            self.assertIn('mesh', data)
            self.assertIn('results', data)
            self.assertIn('soilProps', data)
            self.assertIn('model', data)

            # Mesh quality
            mesh = data['mesh']
            self.assertGreater(mesh['num_nodes'], 100, f"{fname} has too few nodes")
            self.assertGreater(mesh['num_elements'], 150, f"{fname} has too few elements")
            self.assertEqual(len(mesh['nodes']), mesh['num_nodes'])
            self.assertEqual(len(mesh['elements']), mesh['num_elements'])

            # Results integrity
            results = data['results']
            is_unstable_benchmark = ('fraca' in fname) or ('Instável' in str(data.get('expected_results', {}).get('stability_status', '')))
            if is_unstable_benchmark:
                self.assertIsNotNone(results.get('critical_srf'), f"{fname} should have critical_srf")
                self.assertLessEqual(results['critical_srf'], 1.05, f"{fname} should be critical / unstable (FS <= 1.05)")
            else:
                self.assertTrue(results.get('converged', False), f"{fname} did not converge")
            self.assertIn('nodes', results)
            nodes_res = results['nodes']
            self.assertIn('Utot', nodes_res)
            self.assertIn('sig1', nodes_res)
            self.assertIn('sig3', nodes_res)
            self.assertIn('tau_max', nodes_res)

    def test_phase2_geotechnical_physics(self):
        """Verify physical validity and key metrics for Phase2 tutorials."""
        # Phase2 Tutorial 01: Arched Horseshoe Tunnel (Quick Start)
        p1_path = os.path.join(self.test_dir, 'phase2_tut01_tunel_circular_kirsch.json')
        with open(p1_path, 'r', encoding='utf-8') as f:
            p1 = json.load(f)
        max_d1 = p1['results'].get('max_displacement', 0.0) * 1000.0
        self.assertGreater(max_d1, 9.0, "Tunnel inward deformation too small")
        self.assertLess(max_d1, 15.0, "Tunnel deformation blew up")
        self.assertAlmostEqual(max_d1, 11.43, delta=1.5, msg="Should match Phase2 Tutorial 01 canonical benchmark (11.43 mm)")
        # Verify excavation shape is non-circular (horseshoe with arched crown, 23 vertices)
        exc_pts = p1['model'].get('excavation_poly', [])
        self.assertGreaterEqual(len(exc_pts), 20, "Should have discrete arched roof segments")

        # Phase2 Tutorial 03: Support (Liner & Bolts)
        p3_path = os.path.join(self.test_dir, 'phase2_tut03_tunnel_support_bolts_shotcrete.json')
        with open(p3_path, 'r', encoding='utf-8') as f:
            p3 = json.load(f)
        self.assertIn('bolts', p3['model'])
        self.assertIn('liners', p3['model'])
        self.assertGreater(len(p3['model']['bolts']), 0)
        self.assertGreater(len(p3['model']['liners']), 0)

        # Phase2 Tutorial 06: Axisymmetric Shaft
        p6_path = os.path.join(self.test_dir, 'phase2_tut06_axisymmetric_shaft.json')
        with open(p6_path, 'r', encoding='utf-8') as f:
            p6 = json.load(f)
        self.assertTrue(p6['model'].get('axisymmetric', False))

        # Phase2 Tutorial 07: Steady-State Darcy Seepage
        p7_path = os.path.join(self.test_dir, 'phase2_tut07_groundwater_seepage.json')
        with open(p7_path, 'r', encoding='utf-8') as f:
            p7 = json.load(f)
        self.assertIn('pore_pressure', p7['results']['nodes'])

        # Phase2 Tutorial 08: Slope SSR
        p8_path = os.path.join(self.test_dir, 'phase2_tut08_shear_strength_reduction.json')
        with open(p8_path, 'r', encoding='utf-8') as f:
            p8 = json.load(f)
        fs8 = p8['results'].get('critical_srf')
        self.assertIsNotNone(fs8)
        self.assertGreaterEqual(fs8, 1.10)
        self.assertLessEqual(fs8, 1.65)

        # Phase2 Tutorial 10: SSR Search Area
        p10_path = os.path.join(self.test_dir, 'phase2_tut10_ssr_search_area.json')
        with open(p10_path, 'r', encoding='utf-8') as f:
            p10 = json.load(f)
        self.assertIsNotNone(p10['model'].get('ssr_search_area'))

        # Phase2 Tutorial 32: Probabilistic Slope Stability
        p32_path = os.path.join(self.test_dir, 'phase2_tut32_probabilistic_slope_stability.json')
        with open(p32_path, 'r', encoding='utf-8') as f:
            p32 = json.load(f)
        self.assertIn('probabilistic_analysis', p32['results'])
        prob = p32['results']['probabilistic_analysis']
        self.assertIn('mean', prob)
        self.assertIn('std', prob)
        self.assertIn('beta', prob)
        self.assertIn('probability_of_failure', prob)

    def test_adonis_geotechnical_physics(self):
        """Verify physical validity and key metrics for Adonis tutorials."""
        # Adonis Tutorial 01: Kirsch biaxial compression
        ad1_path = os.path.join(self.test_dir, 'adonis_tut01_kirsch_abertura_biaxial.json')
        with open(ad1_path, 'r', encoding='utf-8') as f:
            ad1 = json.load(f)
        self.assertEqual(ad1['model']['k0'], 0.50)
        self.assertEqual(ad1['activeField'], 'sig1')

        # Adonis Tutorial 02: Footing Prandtl collapse
        ad2_path = os.path.join(self.test_dir, 'adonis_tut02_sapata_capacidade_carga_prandtl.json')
        with open(ad2_path, 'r', encoding='utf-8') as f:
            ad2 = json.load(f)
        self.assertEqual(ad2['model']['type'], 'footing')
        self.assertIn('tau_max', ad2['results']['nodes'])

        # Adonis Tutorial 03: Weak Seam Slope (Critical / Rupture FS <= 1.0)
        ad3_path = os.path.join(self.test_dir, 'adonis_tut03_talude_camada_fraca_ssr.json')
        with open(ad3_path, 'r', encoding='utf-8') as f:
            ad3 = json.load(f)
        fs_weak = ad3['results'].get('critical_srf')
        self.assertIsNotNone(fs_weak)
        self.assertLessEqual(fs_weak, 1.05, "Weak layer slope must be critical / unstable (FS <= 1.05)")


if __name__ == '__main__':
    unittest.main()
