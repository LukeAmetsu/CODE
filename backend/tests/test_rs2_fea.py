import unittest
import numpy as np
from backend.calculators.rs2_fea import (
    generate_triangular_mesh,
    assign_materials_to_elements,
    solve_fea_plane_strain,
    run_ssr_factor_of_safety,
    get_preset_model,
    full_analysis_pipeline
)

class TestRS2FEA(unittest.TestCase):

    def test_mesh_generation_convex(self):
        domain_poly = [[0, 0], [10, 0], [10, 10], [0, 10]]
        nodes, elements = generate_triangular_mesh(domain_poly, target_elem_size=3.0)
        self.assertGreater(len(nodes), 4)
        self.assertGreater(len(elements), 2)
        # Check all node coordinates are within bounding box
        self.assertTrue(np.all(nodes[:, 0] >= -1e-5))
        self.assertTrue(np.all(nodes[:, 0] <= 10 + 1e-5))
        self.assertTrue(np.all(nodes[:, 1] >= -1e-5))
        self.assertTrue(np.all(nodes[:, 1] <= 10 + 1e-5))

    def test_mesh_generation_with_excavation(self):
        domain_poly = [[0, 0], [20, 0], [20, 20], [0, 20]]
        excavation_poly = [[8, 8], [12, 8], [12, 12], [8, 12]]
        nodes, elements = generate_triangular_mesh(
            domain_poly, excavation_poly=excavation_poly, target_elem_size=3.0
        )
        # Verify no element centroid is inside the excavation box
        for elem in elements:
            centroid = nodes[elem].mean(axis=0)
            in_hole = (8.01 < centroid[0] < 11.99) and (8.01 < centroid[1] < 11.99)
            self.assertFalse(in_hole, f"Element centroid {centroid} is inside excavation!")

    def test_preset_slope_solve(self):
        slope_model = get_preset_model("slope")
        # Use slightly coarser mesh for fast test
        slope_model['target_elem_size'] = 4.0
        res = full_analysis_pipeline(slope_model, run_ssr=False)
        self.assertEqual(res['status'], 'success')
        self.assertIn('mesh', res)
        self.assertIn('results', res)
        fea = res['results']
        self.assertTrue(fea['converged'])
        self.assertGreater(fea['max_displacement'], 0.0)
        self.assertIn('Utot', fea['nodes'])
        self.assertIn('sig1', fea['nodes'])

    def test_preset_ssr_slope(self):
        slope_model = get_preset_model("slope")
        slope_model['target_elem_size'] = 4.5
        res = full_analysis_pipeline(slope_model, run_ssr=True)
        self.assertEqual(res['status'], 'success')
        fea = res['results']
        self.assertIn('critical_srf', fea)
        self.assertGreater(fea['critical_srf'], 0.5)
        self.assertIn(fea['fs_status'], ['Safe', 'Marginal', 'Unstable'])

    def test_tunnel_preset(self):
        tunnel_model = get_preset_model("tunnel")
        tunnel_model['target_elem_size'] = 3.5
        res = full_analysis_pipeline(tunnel_model, run_ssr=False)
        self.assertEqual(res['status'], 'success')
        self.assertGreater(res['mesh']['num_elements'], 20)

    def test_conforming_multiphase_embankment_mesh(self):
        model = get_preset_model("embankment_multiphase")
        nodes, elements = generate_triangular_mesh(
            domain_poly=model['domain_poly'],
            internal_boundaries=model['internal_boundaries'],
            target_elem_size=2.0,
            layer_polygons=model['layer_polygons']
        )
        elem_mat = assign_materials_to_elements(nodes, elements, model['materials'], model['layer_polygons'])
        self.assertGreater(len(elements), 100)

        # Verify all 5 materials are assigned
        unique_mats = np.unique(elem_mat)
        self.assertEqual(len(unique_mats), 5)

        # Verify envelopamento elements at crest (X < 221, material_idx == 3)
        # MUST have Y coordinates strictly within [24.2, 24.7] with ZERO straddling!
        env_crest_elems = [
            i for i, m in enumerate(elem_mat) 
            if m == 3 and nodes[elements[i], 0].mean() < 221.0
        ]
        self.assertGreater(len(env_crest_elems), 0)
        for e_idx in env_crest_elems:
            tri_nodes = nodes[elements[e_idx]]
            min_y = tri_nodes[:, 1].min()
            max_y = tri_nodes[:, 1].max()
            self.assertGreaterEqual(min_y, 24.19, f"Element {e_idx} crosses below bottom boundary: {min_y}")
            self.assertLessEqual(max_y, 24.71, f"Element {e_idx} crosses above top boundary: {max_y}")

    def test_critical_slip_surfaces_embankment(self):
        """Test Slide2/RS2 critical slip surfaces and search grid output."""
        from backend.calculators.rs2_fea import get_preset_model, calculate_slope_slip_surfaces
        model = get_preset_model('embankment_multiphase')
        res = calculate_slope_slip_surfaces(model)

        self.assertEqual(res['status'], 'success')
        crit = res['critical_surface']
        self.assertEqual(crit['fs'], 1.56)
        self.assertEqual(crit['method'], 'Spencer')
        self.assertAlmostEqual(crit['center'][0], 237.5, delta=0.5)
        self.assertAlmostEqual(crit['center'][1], 42.0, delta=0.5)
        self.assertAlmostEqual(crit['radius'], 25.4, delta=0.5)

        # Methods comparison
        methods = {m['name']: m['min_fs'] for m in res['methods_comparison']}
        self.assertEqual(methods['Spencer'], 1.56)
        self.assertEqual(methods['GLE / Morgenstern-Price'], 1.56)
        self.assertEqual(methods['Bishop Simplificado'], 1.57)
        self.assertEqual(methods['SSR (MEF RS2)'], 1.55)

        # Cloud and rainbow surfaces
        self.assertGreater(len(res['search_centers']), 100)
        self.assertGreater(len(res['slip_surfaces']), 20)
        self.assertEqual(len(res['materials_summary']), 5)

    def test_elastic_vs_mohr_coulomb_difference(self):
        """Verify that Linear Elastic and Mohr-Coulomb produce different displacements and yielding."""
        model_el = get_preset_model('slope')
        model_el['target_elem_size'] = 3.5
        model_el['constitutive_model'] = 'elastic'
        res_el = full_analysis_pipeline(model_el)

        model_mc = get_preset_model('slope')
        model_mc['target_elem_size'] = 3.5
        model_mc['constitutive_model'] = 'mohr_coulomb'
        res_mc = full_analysis_pipeline(model_mc)

        # Elastic must have 0 yield and 1 iteration
        self.assertEqual(res_el['results']['yield_percent'], 0.0)
        self.assertEqual(res_el['results']['iterations'], 1)

        # Mohr-Coulomb on slope must yield and perform plastic redistribution
        self.assertGreater(res_mc['results']['yield_percent'], 0.0)
        self.assertGreater(res_mc['results']['iterations'], 1)
        # Mohr-Coulomb redistribution causes additional plastic deformation
        self.assertGreater(res_mc['results']['max_displacement'], res_el['results']['max_displacement'])

if __name__ == '__main__':
    unittest.main()
