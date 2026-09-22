import unittest
from backend.calculators.piled_raft import calculate_piled_raft

class TestPiledRaftCalculator(unittest.TestCase):
    def test_piled_raft_basic(self):
        inputs = {
            "raft_length_x": 16.0,
            "raft_length_y": 12.0,
            "raft_thickness": 1.20,
            "fck": 35.0,
            "num_piles_x": 5,
            "num_piles_y": 4,
            "pile_diameter": 0.80,
            "pile_length": 18.0,
            "pile_capacity_adm": 1800.0,
            "spmt_num_lines": 6,
            "spmt_line_load": 350.0,
            "heavy_rigging_load": 2500.0,
            "unit_cost_concrete": 550.0,
            "unit_cost_steel": 12.50
        }
        res = calculate_piled_raft(inputs)
        self.assertTrue(res.get("success"), f"Calculation failed: {res.get('error')}")
        
        # Check geometric quantities
        geo = res["raft_geometry"]
        self.assertEqual(geo["Lx"], 16.0)
        self.assertEqual(geo["Ly"], 12.0)
        self.assertEqual(geo["thickness"], 1.20)
        self.assertAlmostEqual(geo["area_m2"], 192.0, places=1)
        self.assertGreater(geo["formwork_area_m2"], 0)
        
        # Check pile summaries
        piles = res["piles_summary"]
        self.assertEqual(piles["num_piles"], 20)
        self.assertGreater(piles["max_reaction_kN"], 0)
        self.assertGreater(piles["group_reduction_factor"], 0.3)
        self.assertLess(piles["group_reduction_factor"], 1.0)
        
        # Check load distribution (piled raft proportion alpha_pr)
        ld = res["load_distribution"]
        self.assertGreater(ld["alpha_pr"], 0.6)
        self.assertLess(ld["alpha_pr"], 1.0)
        self.assertAlmostEqual(ld["load_to_piles_pct"] + ld["load_to_soil_pct"], 100.0, places=1)
        
        # Check settlements
        settle = res["settlements"]
        self.assertGreater(settle["max_settlement_mm"], 0.0)
        self.assertLess(settle["max_settlement_mm"], 50.0)
        
        # Check punching shear (NBR 6118)
        punch = res["punching_shear"]
        self.assertIn("overall_status", punch)
        self.assertGreater(punch["tau_Sd0_MPa"], 0.0)
        self.assertGreater(punch["tau_Rd2_MPa"], punch["tau_Sd0_MPa"]) # Compression strut safe
        
        # Check reinforcement
        reinf = res["reinforcement"]
        self.assertGreater(reinf["As_final_cm2_m"], 0.0)
        self.assertIn("bottom_mesh", reinf)
        self.assertIn("top_mesh", reinf)
        self.assertIn("detailing", reinf)
        self.assertIn("crack_width", reinf)
        
        # Check executive quantities (BOM) and cost estimation
        qty = res["quantities"]
        self.assertGreater(qty["total_concrete_m3"], 0)
        self.assertGreater(qty["total_steel_kg"], 0)
        self.assertGreater(qty["formwork_m2"], 0)
        self.assertGreater(qty["drilling_piles_m"], 0)
        
        costs = res["cost_estimation"]
        self.assertGreater(costs["cost_total_brl"], 0)
        self.assertGreater(costs["cost_per_m2_brl"], 0)
        
        # Check transit sweep simulation
        transit = res["transit_simulation"]
        self.assertGreater(len(transit["transit_points"]), 10)
        self.assertIn("governing_pos_x", transit)

    def test_punching_shear_thick_vs_thin(self):
        thin_res = calculate_piled_raft({"raft_thickness": 0.50, "heavy_rigging_load": 4000.0})
        thick_res = calculate_piled_raft({"raft_thickness": 1.40, "heavy_rigging_load": 4000.0})
        
        self.assertTrue(thin_res.get("success"))
        self.assertTrue(thick_res.get("success"))
        
        tau_thin = thin_res["punching_shear"]["tau_Sd1_MPa"]
        tau_thick = thick_res["punching_shear"]["tau_Sd1_MPa"]
        self.assertGreater(tau_thin, tau_thick)

    def test_spmt_gauge_modifies_results(self):
        """Verify that modifying transversal gauge (spmt_gauge) changes pile reactions and moments."""
        base_inputs = {
            "raft_length_x": 16.0,
            "raft_length_y": 12.0,
            "raft_thickness": 1.20,
            "spmt_num_lines": 6,
            "spmt_line_load": 400.0,
            "spmt_line_spacing": 1.50,
            "spmt_corridor_y": 6.0,
            "heavy_rigging_load": 0.0
        }
        narrow_gauge = dict(base_inputs, spmt_gauge=1.80)
        wide_gauge = dict(base_inputs, spmt_gauge=3.60)
        
        res_narrow = calculate_piled_raft(narrow_gauge)
        res_wide = calculate_piled_raft(wide_gauge)
        
        self.assertTrue(res_narrow["success"])
        self.assertTrue(res_wide["success"])
        
        # Check individual pile reactions differ
        piles_narrow = [p["reaction_kN"] for p in res_narrow["piles_summary"]["piles_detail"]]
        piles_wide = [p["reaction_kN"] for p in res_wide["piles_summary"]["piles_detail"]]
        
        diffs = [abs(pn - pw) for pn, pw in zip(piles_narrow, piles_wide)]
        self.assertGreater(max(diffs), 1.0, "Changing spmt_gauge MUST modify individual pile reactions!")
        
        # Check design moments differ
        m_narrow = res_narrow["reinforcement"]["M_design_kNm_m"]
        m_wide = res_wide["reinforcement"]["M_design_kNm_m"]
        self.assertNotEqual(m_narrow, m_wide, "Changing spmt_gauge MUST modify slab design moments!")

    def test_additional_point_and_distributed_loads(self):
        """Verify that point and distributed loads increase total load and are mapped properly."""
        base_inputs = {
            "raft_length_x": 16.0,
            "raft_length_y": 12.0,
            "raft_thickness": 1.20,
            "spmt_num_lines": 4,
            "spmt_line_load": 300.0,
            "heavy_rigging_load": 0.0
        }
        res_base = calculate_piled_raft(base_inputs)
        
        with_loads = dict(base_inputs,
            point_loads=[
                {"name": "Pilar P1", "x": 4.0, "y": 3.0, "P": 800.0, "pad_width": 0.60}
            ],
            distributed_loads=[
                {"name": "Área Container", "x1": 1.0, "x2": 4.0, "y1": 8.0, "y2": 11.0, "q": 25.0} # 3x3x25 = 225 kN
            ]
        )
        res_loads = calculate_piled_raft(with_loads)
        
        self.assertTrue(res_loads["success"])
        self.assertIn("additional_point_loads", res_loads)
        self.assertIn("additional_distributed_loads", res_loads)
        self.assertEqual(len(res_loads["additional_point_loads"]), 1)
        self.assertEqual(len(res_loads["additional_distributed_loads"]), 1)
        
        total_base = res_base["load_distribution"]["total_vertical_kN"]
        total_loads = res_loads["load_distribution"]["total_vertical_kN"]
        # Expected increase: 800 kN + 225 kN = 1025 kN
        self.assertAlmostEqual(total_loads - total_base, 1025.0, delta=5.0)

    def test_heatmap_grid_returned(self):
        """Verify that 2D continuous heatmap grid is generated and populated."""
        res = calculate_piled_raft({"raft_length_x": 16.0, "raft_length_y": 12.0})
        self.assertTrue(res["success"])
        self.assertIn("heatmap_grid", res)
        grid = res["heatmap_grid"]
        self.assertEqual(grid["nx"], 33)
        self.assertEqual(grid["ny"], 25)
        self.assertEqual(len(grid["settlements_mm"]), 25)
        self.assertEqual(len(grid["settlements_mm"][0]), 33)
        self.assertGreater(grid["max_settlement_mm"], 0)
        self.assertGreater(grid["max_soil_pressure_kPa"], 0)

    def test_civil_quantities_and_earthwork_mass_balance(self):
        """Verify civil quantities and geotechnical earthwork mass balance for piled raft."""
        inputs = {
            "raft_length_x": 16.0,
            "raft_length_y": 12.0,
            "raft_thickness": 1.20,
            "num_piles_x": 5,
            "num_piles_y": 4,
            "pile_diameter": 0.80,
            "pile_length": 18.0
        }
        res = calculate_piled_raft(inputs)
        self.assertTrue(res["success"])
        qty = res["quantities"]

        # Check all 8 civil quantity items exist
        self.assertIn("excavation_piles_m3", qty)
        self.assertIn("excavation_mechanized_m3", qty)
        self.assertIn("backfill_m3", qty)
        self.assertIn("disposal_m3", qty)
        self.assertIn("concrete_structural_m3", qty)
        self.assertIn("concrete_lean_m3", qty)
        self.assertIn("formwork_m2", qty)
        self.assertIn("total_steel_kg", qty)
        self.assertIn("items_table", qty)
        self.assertEqual(len(qty["items_table"]), 8)

        # Values must be physically positive
        self.assertGreater(qty["excavation_piles_m3"], 0)
        self.assertGreater(qty["excavation_mechanized_m3"], 0)
        self.assertGreater(qty["backfill_m3"], 0)
        self.assertGreater(qty["disposal_m3"], 0)
        self.assertGreater(qty["concrete_structural_m3"], 0)
        self.assertGreater(qty["concrete_lean_m3"], 0)
        self.assertGreater(qty["formwork_m2"], 0)
        self.assertGreater(qty["total_steel_kg"], 0)

        # Mass balance verification:
        # V_esc_mec ~= V_reaterro + V_concreto_radier + V_concreto_magro
        v_raft = qty["concrete_raft_m3"]
        v_lean = qty["concrete_lean_m3"]
        self.assertAlmostEqual(qty["excavation_mechanized_m3"], qty["backfill_m3"] + v_raft + v_lean, places=1)

        # V_bota_fora ~= V_esc_estacas + V_concreto_radier + V_concreto_magro
        self.assertAlmostEqual(qty["disposal_m3"], qty["excavation_piles_m3"] + v_raft + v_lean, places=1)

    def test_concomitant_vs_non_concomitant_moving_loads(self):
        """Verify comparative analysis between SPMT only (center), Gantry only (edges), and Concomitant."""
        inputs = {
            "raft_length_x": 16.0,
            "raft_length_y": 12.0,
            "raft_thickness": 1.20,
            "spmt_num_lines": 6,
            "spmt_line_load": 350.0,
            "spmt_corridor_y": 6.0, # Center
            "gantry_total_load_tf": 150.0, # 75 tf each edge
            "gantry_edge_distance": 1.0,   # y1 = 1.0, y2 = 11.0
            "gantry_wheels_per_leg": 4,
            "gantry_wheel_spacing": 1.40
        }

        # 1. Run Concomitant
        inputs["moving_load_mode"] = "concomitant"
        res_concomitant = calculate_piled_raft(inputs)
        self.assertTrue(res_concomitant["success"])
        self.assertIn("comparative_cases", res_concomitant)
        comp = res_concomitant["comparative_cases"]

        self.assertIn("spmt_only", comp)
        self.assertIn("gantry_only", comp)
        self.assertIn("concomitant", comp)
        self.assertIn("governing", comp)

        c_spmt = comp["spmt_only"]
        c_gantry = comp["gantry_only"]
        c_conc = comp["concomitant"]

        # Concomitant total load must be higher than isolated cases
        self.assertGreater(c_conc["total_vertical_tf"], c_spmt["total_vertical_tf"])
        self.assertGreater(c_conc["total_vertical_tf"], c_gantry["total_vertical_tf"])

        # Concomitant max reaction on piles must be higher than isolated cases
        self.assertGreater(c_conc["max_reaction_kN"], c_spmt["max_reaction_kN"])
        self.assertGreater(c_conc["max_reaction_kN"], c_gantry["max_reaction_kN"])

        # Safety Factor is more critical in concomitant
        self.assertLess(c_conc["fs_capacity"], c_spmt["fs_capacity"])
        self.assertLess(c_conc["fs_capacity"], c_gantry["fs_capacity"])

        # Settlements are larger in concomitant
        self.assertGreater(c_conc["max_settlement_mm"], c_spmt["max_settlement_mm"])
        self.assertGreater(c_conc["max_settlement_mm"], c_gantry["max_settlement_mm"])

        # Check pile positions:
        # In SPMT-only, critical pile should be closer to corridor_y (6.0m)
        crit_spmt_y = c_spmt["critical_pile_coord"][1]
        self.assertTrue(abs(crit_spmt_y - 6.0) <= 2.5)

        # In Gantry-only, critical pile should be near the edges (y ~ 1.5m or y ~ 10.5m)
        crit_gantry_y = c_gantry["critical_pile_coord"][1]
        self.assertTrue(crit_gantry_y <= 2.0 or crit_gantry_y >= 10.0)

    def test_mode_selection_changes_active_results(self):
        """Verify that selecting moving_load_mode modifies piles_summary and load_distribution."""
        inputs = {
            "raft_length_x": 16.0,
            "raft_length_y": 12.0,
            "spmt_num_lines": 6,
            "spmt_line_load": 350.0,
            "gantry_total_load_tf": 150.0
        }

        res_spmt = calculate_piled_raft({**inputs, "moving_load_mode": "spmt_only"})
        res_gantry = calculate_piled_raft({**inputs, "moving_load_mode": "gantry_only"})
        res_conc = calculate_piled_raft({**inputs, "moving_load_mode": "concomitant"})

        self.assertEqual(res_spmt["moving_load_mode"], "spmt_only")
        self.assertEqual(res_gantry["moving_load_mode"], "gantry_only")
        self.assertEqual(res_conc["moving_load_mode"], "concomitant")

        # Active max reaction in concomitant is larger than spmt_only
        self.assertGreater(res_conc["piles_summary"]["max_reaction_kN"], res_spmt["piles_summary"]["max_reaction_kN"])

if __name__ == "__main__":
    unittest.main()

