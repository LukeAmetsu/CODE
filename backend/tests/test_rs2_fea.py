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

    def test_ssr_mohr_coulomb_modes(self):
        slope_model = get_preset_model("slope")
        slope_model['target_elem_size'] = 5.0
        # Test c_only mode
        res_c = full_analysis_pipeline({**slope_model, 'ssr_mode': 'c_only'}, run_ssr=True)
        self.assertEqual(res_c['status'], 'success')
        self.assertIn('critical_srf', res_c['results'])
        # Test phi_only mode
        res_phi = full_analysis_pipeline({**slope_model, 'ssr_mode': 'phi_only', 'ssr_reduce_tension': False}, run_ssr=True)
        self.assertEqual(res_phi['status'], 'success')
        self.assertIn('critical_srf', res_phi['results'])

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

        # Methods comparison (all 8 methods)
        methods = {m['name']: m['min_fs'] for m in res['methods_comparison']}
        self.assertEqual(len(methods), 8)
        self.assertEqual(methods['Spencer'], 1.56)
        self.assertEqual(methods['GLE / Morgenstern-Price'], 1.56)
        self.assertEqual(methods['Bishop Simplificado'], 1.57)
        self.assertEqual(methods['Janbu Simplificado'], 1.52)
        self.assertEqual(methods['Fellenius (Ordinário)'], 1.48)
        self.assertEqual(methods['Lowe & Karafiath'], 1.59)
        self.assertEqual(methods['Corps of Engineers (USACE)'], 1.60)
        self.assertEqual(methods['SSR (MEF RS2)'], 1.55)

        # Boundary check: every arc point must strictly lie between bottom and top domain boundary
        from backend.calculators.rs2_fea import _surface_y_at_x, _bottom_y_at_x
        for pt in crit['arc_points']:
            y_surf = _surface_y_at_x(pt[0], model['domain_poly'])
            y_bot = _bottom_y_at_x(pt[0], model['domain_poly'])
            self.assertGreaterEqual(pt[1], y_bot - 0.05, f"Arc point {pt} dips below bottom boundary {y_bot}")
            self.assertLessEqual(pt[1], y_surf + 0.05, f"Arc point {pt} rises above surface {y_surf}")

        # Cloud and rainbow surfaces
        self.assertGreater(len(res['search_centers']), 100)
        self.assertGreater(len(res['slip_surfaces']), 20)
        self.assertEqual(len(res['materials_summary']), 5)

    def test_no_slip_surfaces_for_non_slopes(self):
        """Verify that slope stability circular slip surfaces are NOT computed for footings, tunnels, and excavations."""
        from backend.calculators.rs2_fea import get_preset_model, calculate_slope_slip_surfaces, full_analysis_pipeline
        for p in ['footing', 'tunnel', 'excavation']:
            model = get_preset_model(p)
            res = calculate_slope_slip_surfaces(model)
            self.assertIsNone(res, f"Preset {p} should NOT return slope slip surfaces!")

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

    def test_staged_analysis_embankment(self):
        """Verify 4-stage construction on embankment: in-situ reset disp, sequential lift activations and displacement accumulation."""
        model = get_preset_model('embankment_multiphase')
        model['target_elem_size'] = 3.0  # coarser for test speed
        res = full_analysis_pipeline(model, run_ssr=False)

        self.assertEqual(res['status'], 'success')
        self.assertIn('stages', res)
        stages = res['stages']
        self.assertEqual(len(stages), 4)

        self.assertIn('elem_layer', res['mesh'])
        self.assertEqual(len(res['mesh']['elem_layer']), len(res['mesh']['elements']))

        # Stage 1: In-situ reset disp = True
        st1 = stages[0]
        self.assertTrue(st1['reset_disp'])
        self.assertEqual(st1.get('active_layers'), [0, 1])
        self.assertEqual(st1['max_total_displacement'], 0.0)
        self.assertGreater(st1['max_stage_displacement'], 0.0)

        # Stage 2: Lift 1 added -> total disp starts accumulating
        st2 = stages[1]
        self.assertFalse(st2['reset_disp'])
        self.assertGreater(st2['max_total_displacement'], 0.0)
        self.assertGreater(len(st2['active_elements']), len(st1['active_elements']))

        # Stage 3: Lift 2 + Envelopamento added
        st3 = stages[2]
        self.assertGreater(len(st3['active_elements']), len(st2['active_elements']))
        self.assertGreater(st3['max_total_displacement'], 0.0)

        # Stage 4: Surcharges applied
        st4 = stages[3]
        self.assertEqual(len(st4['active_elements']), len(st3['active_elements']))
        self.assertGreaterEqual(st4['max_total_displacement'], st3['max_total_displacement'])

        # Both Stage Incremental and Total Accumulated fields must be present in nodes
        for key in ['Utot', 'Ux', 'Uy', 'U_stage', 'Ux_stage', 'Uy_stage']:
            self.assertIn(key, st4['nodes'])

    def test_staged_analysis_excavation(self):
        """Verify 3-stage excavation: in-situ full domain -> excavated pit -> surface surcharge."""
        model = get_preset_model('excavation')
        model['target_elem_size'] = 3.5
        res = full_analysis_pipeline(model, run_ssr=False)

        self.assertEqual(res['status'], 'success')
        stages = res['stages']
        self.assertEqual(len(stages), 3)

        # Stage 1: full solid in-situ
        st1 = stages[0]
        self.assertEqual(st1['max_total_displacement'], 0.0)

        # Stage 2: pit excavated (fewer active elements)
        st2 = stages[1]
        self.assertLess(len(st2['active_elements']), len(st1['active_elements']))
        self.assertGreater(st2['max_total_displacement'], 0.0)

        # Stage 3: surcharge applied
        st3 = stages[2]
        self.assertEqual(len(st3['active_elements']), len(st2['active_elements']))
        self.assertGreater(st3['max_total_displacement'], 0.0)
        self.assertGreater(st3['max_stage_displacement'], 0.0)

    def test_stage_specific_surcharges(self):
        """Verify that surcharges can be applied to specific stages only, including both stage.active_surcharges and surcharge.active_stages."""
        model = get_preset_model('slope')
        model['target_elem_size'] = 4.0
        model['surcharges'] = [
            {'x1': 38.0, 'x2': 55.0, 'q': 30.0, 'active_stages': [1]}
        ]
        model['stages'] = [
            {'id': 1, 'name': 'Fase 1: In-Situ', 'reset_disp': True},
            {'id': 2, 'name': 'Fase 2: Carga Aplicada', 'reset_disp': False},
            {'id': 3, 'name': 'Fase 3: Carga Removida', 'reset_disp': False, 'active_surcharges': []}
        ]
        res = full_analysis_pipeline(model, run_ssr=False)
        self.assertEqual(res['status'], 'success')
        stages = res['stages']
        self.assertEqual(len(stages), 3)

        # Stage 1: should not have surcharge active
        self.assertEqual(stages[0]['active_surcharges'], [])
        # Stage 2: derived from surcharge.active_stages=[1]
        self.assertEqual(stages[1]['active_surcharges'], [0])
        self.assertGreater(stages[1]['max_stage_displacement'], 0.0)
        # Stage 3: explicitly active_surcharges=[]
        self.assertEqual(stages[2]['active_surcharges'], [])

    def test_ssr_rupture_stage_visualization(self):
        """Verify that SSR produces an interactive rupture stage in stages_results with displacements, yielding, and plastic strains."""
        model = get_preset_model('slope')
        model['target_elem_size'] = 4.5
        res = full_analysis_pipeline(model, run_ssr=True)
        self.assertEqual(res['status'], 'success')
        self.assertIn('stages', res)
        stages = res['stages']
        self.assertGreater(len(stages), 1)

        # Last stage must be the SSR rupture stage
        ssr_stg = stages[-1]
        self.assertTrue(ssr_stg.get('is_ssr'))
        self.assertIn('Ruptura SSR', ssr_stg['name'])
        self.assertEqual(ssr_stg['srf'], res['results']['critical_srf'])
        self.assertEqual(res['active_stage_idx'], len(stages) - 1)

        # Displacements and plastic strains must be present
        self.assertIn('Ux', ssr_stg['nodes'])
        self.assertIn('Uy', ssr_stg['nodes'])
        self.assertIn('Utot', ssr_stg['nodes'])
        self.assertIn('eps_p', ssr_stg['nodes'])
        self.assertGreater(ssr_stg['max_total_displacement'], 0.0)

        # Element yields and plastic shear strains
        self.assertIn('yield', ssr_stg['elements'])
        self.assertIn('eps_p', ssr_stg['elements'])
        self.assertGreater(ssr_stg['yield_percent'], 0.0)

        # Also verified on fea_results
        self.assertIn('ssr_stage', res['results'])
        self.assertEqual(res['results']['ssr_stage']['id'], 'ssr')

    def test_retaining_wall_presets(self):
        """Test all unified retaining structure presets (cantilever, gravity, diaphragm, sheet pile)."""
        from backend.calculators.rs2_fea import get_preset_model, full_analysis_pipeline, calculate_slope_slip_surfaces
        for p in ['cantilever_wall', 'gravity_wall', 'diaphragm_wall', 'sheet_pile_wall']:
            model = get_preset_model(p)
            self.assertEqual(model['type'], 'retaining_wall')
            self.assertGreater(len(model['layer_polygons']), 2)

            # Circular slope slip surfaces should NOT run on retaining walls
            slip_res = calculate_slope_slip_surfaces(model)
            self.assertIsNone(slip_res, f"Preset {p} should NOT compute circular slope slip surfaces!")

            # Run full FEA solve
            res = full_analysis_pipeline(model, run_ssr=False)
            self.assertEqual(res['status'], 'success')
            self.assertGreater(res['mesh']['num_nodes'], 100)
            self.assertEqual(len(res['stages']), 4)

            # Retaining metrics
            rm = res.get('retaining_metrics')
            self.assertIsNotNone(rm, f"Preset {p} must include retaining_metrics!")
            self.assertTrue(rm['is_retaining'])
            self.assertGreater(rm['max_deflection_mm'], 0.0)
            self.assertGreater(rm['crest_settlement_mm'], 0.0)
            self.assertGreater(rm['max_moment_knm'], 0.0)
            self.assertGreater(len(rm['deflection_profile']), 5)

    def test_diaphragm_wall_anchors(self):
        """Test anchored diaphragm wall with tieback tension force calculation."""
        from backend.calculators.rs2_fea import get_preset_model, full_analysis_pipeline
        model = get_preset_model('diaphragm_wall')
        self.assertIn('anchors', model)
        self.assertEqual(len(model['anchors']), 1)

        res = full_analysis_pipeline(model, run_ssr=False)
        last_stage = res['stages'][-1]
        self.assertIn('anchors', last_stage)
        self.assertEqual(len(last_stage['anchors']), 1)
        anc = last_stage['anchors'][0]
        self.assertGreater(anc['force_kn'], 100.0) # Prestress 150 kN

    def test_phase2_alignment_incremental_ssr(self):
        """Test that SSR stage plots incremental failure mechanism (eliminating footing settlement) and computes gamma_max."""
        from backend.calculators.rs2_fea import get_preset_model, full_analysis_pipeline
        model = get_preset_model('embankment_multiphase')
        model['target_elem_size'] = 3.5 # Fast test
        res = full_analysis_pipeline(model, run_ssr=True)
        self.assertEqual(res['status'], 'success')
        self.assertEqual(len(res['stages']), 5)

        ssr_stage = res['stages'][-1]
        self.assertTrue(ssr_stage['is_ssr'])
        self.assertIn('gamma_max', ssr_stage['nodes'])
        self.assertGreater(max(ssr_stage['nodes']['gamma_max']), 0.0)

        # Stage 4 displacement has accumulated footing settlement
        stg4_disp = res['stages'][-2]['max_total_displacement']
        # In SSR stage, incremental failure displacement is isolated and much smaller than Stage 4 settlement
        ssr_disp = ssr_stage['max_total_displacement']
        self.assertLess(ssr_disp, stg4_disp)

    def test_footings_conformal_and_participate_ssr(self):
        """Test process_model_footings integration and non-participating SSR material."""
        from backend.calculators.rs2_fea import get_preset_model, process_model_footings, full_analysis_pipeline
        model = get_preset_model('embankment_multiphase')
        model['footings'] = [{
            'name': 'Sapata Teste',
            'x1': 196.0,
            'x2': 200.0,
            'y_top': 24.7,
            'height': 0.8,
            'q': 150.0,
            'participate_ssr': False
        }]
        processed = process_model_footings(model)
        self.assertTrue(any('sapata' in m['name'].lower() for m in processed['materials']))
        footing_mat = next(m for m in processed['materials'] if 'sapata' in m['name'].lower())
        self.assertFalse(footing_mat.get('participate_ssr', True))

    def test_ssr_search_area_limiting(self):
        """Test that SSR search area bounds are accepted and filter reduction."""
        from backend.calculators.rs2_fea import get_preset_model, full_analysis_pipeline
        model = get_preset_model('embankment_multiphase')
        model['target_elem_size'] = 4.0
        model['ssr_search_area'] = {
            'enabled': True,
            'bounds': [210.0, 245.0, 10.0, 30.0]
        }
        res = full_analysis_pipeline(model, run_ssr=True)
        self.assertEqual(res['status'], 'success')
        self.assertIn('critical_srf', res['results'])

    def test_footing_below_ground_excavation_and_lateral_containment(self):
        """Test that footing placed below ground elevation creates trench excavation and lateral containment shoring (Ux=0)."""
        from backend.calculators.rs2_fea import get_preset_model, process_model_footings, full_analysis_pipeline
        model = get_preset_model('footing')
        model['target_elem_size'] = 3.0
        # Embankment/Footing crest is at y = 20. Place footing at y_top = 16 (below ground)
        model['footings'] = [{
            'name': 'Sapata Embutida',
            'x1': 16.0,
            'x2': 24.0,
            'y_top': 16.0,
            'height': 1.0,
            'q': 180.0
        }]
        processed = process_model_footings(model)

        # 1. Trench polygon must be created in excavation_polys
        self.assertIn('excavation_polys', processed)
        self.assertGreaterEqual(len(processed['excavation_polys']), 1)
        trench = processed['excavation_polys'][0]
        # Trench must cover x in [16, 24] and y from 16 to 20
        trench_ys = [p[1] for p in trench]
        self.assertEqual(min(trench_ys), 16.0)
        self.assertEqual(max(trench_ys), 20.0)

        # 2. Lateral containment walls must constrain Ux = 0
        self.assertIn('lateral_containments', processed)
        containments = processed['lateral_containments']
        self.assertEqual(len(containments), 2)
        x_containments = [c['x'] for c in containments]
        self.assertIn(16.0, x_containments)
        self.assertIn(24.0, x_containments)
        for c in containments:
            self.assertTrue(c['fix_x'])
            self.assertFalse(c['fix_y'])

        # 3. Footing concrete material must have E = 25 GPa and participate_ssr = False
        footing_mat = next(m for m in processed['materials'] if 'sapata' in m['name'].lower())
        self.assertGreaterEqual(footing_mat['E'], 25e6)
        self.assertEqual(footing_mat['model'], 'elastic')
        self.assertFalse(footing_mat.get('participate_ssr', True))

        # 4. Surcharge must be targeted at y = 16.0 (top of footing block)
        footing_sur = next(s for s in processed['surcharges'] if s.get('y') == 16.0)
        self.assertEqual(footing_sur['q'], 180.0)

        # 5. Full analysis pipeline execution
        res = full_analysis_pipeline(processed, run_ssr=False)
        self.assertEqual(res['status'], 'success')
        self.assertIn('lateral_containments', res)
        self.assertEqual(len(res['lateral_containments']), 2)

    def test_footing_rigidity_load_distribution(self):
        """Verify that rigid concrete footing (E = 25 GPa) distributes load without excessive local pad deformation."""
        from backend.calculators.rs2_fea import get_preset_model, process_model_footings, full_analysis_pipeline
        model = get_preset_model('footing')
        model['target_elem_size'] = 2.5
        model['footings'] = [{
            'name': 'Sapata Rígida',
            'x1': 17.0,
            'x2': 23.0,
            'y_top': 20.0,
            'height': 0.8,
            'q': 150.0
        }]
        res = full_analysis_pipeline(model, run_ssr=False)
        self.assertEqual(res['status'], 'success')
        # Footing nodes must show smooth, uniform downward settlement across the rigid contact
        nodes = res['mesh']['nodes']
        uy = res['results']['nodes']['Uy']
        footing_settlements = [uy[i] for i, (nx, ny) in enumerate(nodes) if 17.0 <= nx <= 23.0 and abs(ny - 20.0) < 0.2]
        self.assertGreater(len(footing_settlements), 0)
        # All settlements on the rigid pad should be negative (downward) and bounded
        for s in footing_settlements:
            self.assertLess(s, 0.0)

    def test_footing_fck_stiffness_estimation(self):
        """Verify that footing concrete stiffness E is estimated from fck per NBR 6118 (E = 5600*sqrt(fck)*1000 kPa)."""
        from backend.calculators.rs2_fea import get_preset_model, process_model_footings
        import math
        model = get_preset_model('footing')
        model['footings'] = [
            {'name': 'Sapata C20', 'x1': 10.0, 'x2': 14.0, 'y_top': 20.0, 'height': 0.8, 'q': 100.0, 'fck': 20.0},
            {'name': 'Sapata C40', 'x1': 20.0, 'x2': 24.0, 'y_top': 20.0, 'height': 0.8, 'q': 100.0, 'fck': 40.0}
        ]
        processed = process_model_footings(model)
        mats = {m['name']: m for m in processed['materials'] if 'sapata' in m['name'].lower()}
        self.assertGreaterEqual(len(mats), 2)
        
        # Verify E calculated per NBR 6118
        mat_c20 = next(m for m in mats.values() if '20' in m['name'])
        mat_c40 = next(m for m in mats.values() if '40' in m['name'])
        
        expected_e20 = 5600.0 * math.sqrt(20.0) * 1000.0
        expected_e40 = 5600.0 * math.sqrt(40.0) * 1000.0
        
        self.assertAlmostEqual(mat_c20['E'], expected_e20, delta=100.0)
        self.assertAlmostEqual(mat_c40['E'], expected_e40, delta=100.0)
        self.assertGreater(mat_c40['E'], mat_c20['E'])

    def test_footing_staged_addition(self):
        """Verify that loaded footing added in specific stage is inactive in prior stages and active in assigned stage onwards."""
        from backend.calculators.rs2_fea import get_preset_model, full_analysis_pipeline
        model = get_preset_model('footing')
        model['target_elem_size'] = 3.5
        model['surcharges'] = []  # Clear background surcharge to isolate footing load
        # Footing installed only in Stage 2 (index 1)
        model['footings'] = [{
            'name': 'Sapata Fase 2',
            'x1': 17.0, 'x2': 23.0, 'y_top': 20.0, 'height': 0.8,
            'q': 150.0, 'fck': 30.0, 'stage_idx': 1
        }]
        res = full_analysis_pipeline(model, run_ssr=False)
        self.assertEqual(res['status'], 'success')
        stages = res['stages']
        self.assertGreaterEqual(len(stages), 3)
        
        # Stage 1 (index 0 - In-Situ): footing is NOT yet installed/loaded
        st1 = stages[0]
        self.assertEqual(st1.get('max_total_displacement', 0.0), 0.0)
        
        # Stage 2 (index 1 - Footing installed): footing is activated with load
        st2 = stages[1]
        self.assertGreater(st2.get('max_total_displacement', 0.0), 0.001)
        
        # Stage 3 (index 2 - 100% load): settlement increases
        st3 = stages[2]
        self.assertGreater(st3.get('max_total_displacement', 0.0), st2.get('max_total_displacement', 0.0))

    def test_footing_separate_install_and_load_stages(self):
        """Verify independent stage_install (concrete pour) and stage_load (surcharge q) stages."""
        from backend.calculators.rs2_fea import get_preset_model, full_analysis_pipeline, process_model_footings
        model = get_preset_model('footing')
        model['target_elem_size'] = 3.5
        model['surcharges'] = []
        model['footings'] = [{
            'name': 'Sapata Bifásica',
            'x1': 17.0, 'x2': 23.0, 'y_top': 20.0, 'height': 0.8,
            'q': 150.0, 'fck': 30.0,
            'stage_install': 1,
            'stage_load': 2
        }]
        processed = process_model_footings(model)
        self.assertEqual(processed['surcharges'][0]['stage_load'], 2)
        self.assertEqual(processed['layer_polygons'][-1]['stage_install'], 1)

        res = full_analysis_pipeline(model, run_ssr=False)
        self.assertEqual(res['status'], 'success')
        stages = res['stages']
        # Stage 1 (index 0): In-situ virgem, u = 0
        self.assertEqual(stages[0].get('max_total_displacement', 0.0), 0.0)
        # Stage 2 (index 1): Concrete installed, no surcharge applied yet
        st2_disp = stages[1].get('max_total_displacement', 0.0)
        # Stage 3 (index 2): Surcharge q=150 kPa applied, settlement develops
        st3_disp = stages[2].get('max_total_displacement', 0.0)
        self.assertGreater(st3_disp, st2_disp)

    def test_axisymmetric_cst(self):
        """Verify CST axisymmetric formulation, element volume, and stiffness matrix symmetry."""
        from backend.calculators.rs2_fea import compute_element_cst
        import numpy as np
        pts = np.array([[5.0, 0.0], [6.0, 0.0], [5.5, 1.0]])
        Ke_axi, B_axi, D_axi, vol = compute_element_cst(pts, 100000.0, 0.25, axisymmetric=True)
        self.assertEqual(Ke_axi.shape, (6, 6))
        self.assertEqual(B_axi.shape, (4, 6))
        self.assertEqual(D_axi.shape, (4, 4))
        self.assertTrue(np.allclose(Ke_axi, Ke_axi.T))
        expected_vol = 2.0 * np.pi * 5.5 * 0.5
        self.assertAlmostEqual(vol, expected_vol, places=3)

    def test_liner_beam_element(self):
        """Verify structural liner beam element stiffness and internal force recovery."""
        from backend.calculators.rs2_fea import compute_liner_beam_element, compute_liner_forces
        import numpy as np
        p1 = (0.0, 0.0)
        p2 = (2.0, 0.0)
        E_lin = 30e6  # 30 GPa
        t_lin = 0.20  # 20 cm
        k_glob, T, L, ka, kb, E, A, I = compute_liner_beam_element(p1, p2, E_lin, t_lin)
        self.assertEqual(k_glob.shape, (4, 4))
        self.assertTrue(np.allclose(k_glob, k_glob.T))

        # 1 mm transverse displacement at tip
        u1 = (0.0, 0.0)
        u2 = (0.0, 0.001)
        forces = compute_liner_forces(p1, p2, u1, u2, E_lin, t_lin)
        self.assertEqual(forces['L'], 2.0)
        self.assertAlmostEqual(forces['N'], 0.0, places=2)
        self.assertGreater(forces['V'], 0.0)
        self.assertGreater(forces['M'], 0.0)

    def test_steady_state_seepage_darcy(self):
        """Verify 1D Darcy flow column steady-state seepage: q = -k * dH/dy."""
        from backend.calculators.rs2_fea import solve_steady_state_seepage
        import numpy as np
        nodes = np.array([[0.0, 0.0], [1.0, 0.0], [1.0, 2.0], [0.0, 2.0]])
        elements = np.array([[0, 1, 2], [0, 2, 3]])
        materials = [{'k': 1e-4}]
        elem_mat = [0, 0]
        fixed_heads = [
            {'node': 0, 'head': 4.0}, {'node': 1, 'head': 4.0},
            {'node': 2, 'head': 1.0}, {'node': 3, 'head': 1.0}
        ]
        res = solve_steady_state_seepage(nodes, elements, elem_mat, materials, {'fixed_heads': fixed_heads})
        self.assertIsNotNone(res)
        self.assertEqual(len(res['H_total']), 4)
        # Check velocity vy = -k * (1.0 - 4.0)/2.0 = 1.5e-4
        vy = res['elem_vel'][0][1]
        self.assertAlmostEqual(vy, 1.5e-4, places=6)

    def test_probabilistic_point_estimate(self):
        """Verify Rosenblueth 2-point estimate method for stochastic params."""
        from backend.calculators.rs2_fea import run_probabilistic_point_estimate, get_preset_model
        model = get_preset_model('slope')
        model['target_elem_size'] = 4.0
        stochastic_params = [
            {'param': 'c', 'mat_idx': 0, 'mean': 15.0, 'std': 2.0}
        ]
        res = run_probabilistic_point_estimate(model, stochastic_params, response_key='fs')
        self.assertIn('mean', res)
        self.assertIn('std', res)
        self.assertGreater(res['mean'], 0.5)


if __name__ == '__main__':
    unittest.main()



