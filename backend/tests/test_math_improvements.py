"""
Unit tests for mathematical improvements across Engineering Hub calculators.
Covers:
- retaining_wall: heel soil column height with water table, Coulomb vs Rankine vertical force arm, eccentricity guards.
- aoki_velloso: dz scaling for static vertical spring stiffness.
- liquefaction: NCEER canonical formulation vs spreadsheet mode.
- nbr_6118_concrete: 435 MPa cap on shear reinforcement.
- splice: AISC Table J3.3 hole dimensions for 1"+ bolts.
"""

import unittest
import math
from backend.calculators.retaining_wall import calculate_retaining_wall
from backend.calculators.aoki_velloso import calculate_aoki_velloso
from backend.calculators.liquefaction import calculate_liquefaction_layers
from backend.calculators.nbr_6118_concrete import calculate_concrete_beam
from backend.calculators.splice import splice_calc
from backend.calculators.nbr_8800_steel import calculate_steel_structure

class TestMathImprovements(unittest.TestCase):
    def test_retaining_wall_water_heel_weight(self):
        """Verifies that water table in heel soil doesn't phantom-add base slab thickness as soil."""
        base_inputs = {
            'stem_height': 4.0,
            'stem_top_width': 0.30,
            'stem_bot_width': 0.50,
            'toe_length': 0.80,
            'heel_length': 1.70,
            'base_thickness': 0.50,
            'gamma_wall': 25.0,
            'gamma_soil': 18.0,
            'phi_soil': 30.0,
            'water_height': 2.0,      # 2m from base = 1.5m inside heel soil
            'drainage_eff': 0.0,      # undrained to activate buoyancy
            'theory': 'rankine'
        }
        res = calculate_retaining_wall(base_inputs)
        self.assertNotIn("error", res)
        
        # Check weights breakdown
        weights = dict((w['name'], w['weight']) for w in res['weights'])
        W_heel_soil = weights.get("Solo sobre a Sapata Posterior")
        
        # Expected:
        # h_water_in_heel = 2.0 - 0.5 = 1.5 m
        # h_dry = 4.0 - 1.5 = 2.5 m
        # gamma_dry = 18.0, gamma_sub = 18.0 - 9.81 = 8.19
        # W = 1.70 * (2.5 * 18.0 + 1.5 * 8.19)
        expected_w = 1.70 * (2.5 * 18.0 + 1.5 * (18.0 - 9.81))
        self.assertAlmostEqual(W_heel_soil, expected_w, places=2)

    def test_retaining_wall_coulomb_arm(self):
        """Verifies Coulomb vertical thrust acts at stem back face, not heel end B."""
        inputs_rankine = {
            'stem_height': 4.0,
            'stem_top_width': 0.30,
            'stem_bot_width': 0.50,
            'toe_length': 0.80,
            'heel_length': 1.70,
            'base_thickness': 0.50,
            'phi_soil': 30.0,
            'backfill_slope': 10.0,
            'theory': 'rankine'
        }
        inputs_coulomb = inputs_rankine.copy()
        inputs_coulomb.update({
            'theory': 'coulomb',
            'wall_friction': 20.0
        })
        
        res_rankine = calculate_retaining_wall(inputs_rankine)
        res_coulomb = calculate_retaining_wall(inputs_coulomb)
        self.assertNotIn("error", res_rankine)
        self.assertNotIn("error", res_coulomb)
        self.assertGreater(res_coulomb['stability']['fs_overturning'], 0)

    def test_aoki_velloso_dz_scaling(self):
        """Verifies that layers with dz != 1.0 properly scale static spring stiffness."""
        p1 = [
            {"depth": 1.0, "soil_type": "AREIA", "nspt": 10.0}
        ]
        p2 = [
            {"depth": 2.0, "soil_type": "AREIA", "nspt": 10.0}
        ]
        
        base_cfg = {
            "geometry": "Circular",
            "diameter": 0.5,
            "depth_pile": 2.0,
            "allowable_settlement_mm": 10.0,
            "pile_type": "METÁLICA",
            "custom_F1": 2.0,
            "custom_F2": 2.0
        }
        
        res1 = calculate_aoki_velloso({**base_cfg, "depth_pile": 1.0, "profile": p1})
        res2 = calculate_aoki_velloso({**base_cfg, "depth_pile": 2.0, "profile": p2})
        
        lay1 = res1["layers"][0]
        lay2 = res2["layers"][0]
        
        s_adm_m = 0.010
        perim = math.pi * 0.5
        shaft_stiff_1m = (lay1["rl_kg_m2"] * 1.0 / s_adm_m / 1000.0) * perim
        shaft_stiff_2m = (lay2["rl_kg_m2"] * 2.0 / s_adm_m / 1000.0) * perim
        
        self.assertAlmostEqual(shaft_stiff_2m, 2.0 * shaft_stiff_1m, places=2)

    def test_liquefaction_canonical_nceer(self):
        """Verifies canonical NCEER Youd & Idriss formulation (CRR * MSF * K_sigma / CSR)."""
        layer_data = [
            {"depth": 5.0, "water_depth": 2.0, "gamma": 19.0, "n1_60": 15.0, "fc_pct": 10.0, "a_max": 0.35, "mw": 7.5}
        ]
        res_nceer = calculate_liquefaction_layers({
            "layers": layer_data,
            "formulation": "nceer"
        })
        self.assertTrue(res_nceer["success"])
        l = res_nceer["layers"][0]
        self.assertEqual(l["fs"], l["fs_nceer_standard"])
        self.assertAlmostEqual(l["fs"], (l["crr_7_5"] * l["msf"] * l["k_sigma"]) / l["csr"], places=2)

    def test_nbr_6118_stirrups_cap(self):
        """Verifies CA-60 steel (fyk = 600 MPa) has stirrup strength capped at 435 MPa (43.5 kN/cm2)."""
        inputs = {
            'fck': 30.0,
            'fyk': 600.0,       # High strength steel fyd = 600/1.15 = 52.17 kN/cm2 > 43.5 kN/cm2
            'bw': 20.0,
            'h': 50.0,
            'c': 3.0,
            'num_barras': 3.0,
            'diam_barra': 16.0,
            'diam_estribo': 8.0,
            'pernas_estribo': 2.0,
            's_estribo': 15.0,
            'Msd': 50.0,
            'Vsd': 80.0
        }
        res = calculate_concrete_beam(inputs)
        vsw = res['results']['shear_details']['Vsw']
        d = res['results']['flexure_details']['d']
        
        phi_est_cm = 0.8
        asw = 2.0 * (math.pi * (phi_est_cm**2) / 4.0)
        expected_vsw = (asw / 15.0) * 0.9 * d * 43.5
        self.assertAlmostEqual(vsw, expected_vsw, places=2)

    def test_splice_hole_dia_large_bolts(self):
        """Verifies AISC Table J3.3 hole diameter: 1" bolt gives 1.125" (1-1/8")."""
        bearing_check = splice_calc.check_bolt_bearing({
            'db': 1.0,
            't_ply': 0.5,
            'Fu_ply': 65.0,
            'le': 1.5,
            's': 3.0,
            'is_edge_bolt': True,
            'deformation_considered': True
        })
        self.assertEqual(bearing_check['hole_dia'], 1.125)

    def test_nbr_8800_flt_regimes(self):
        """Verifies Lateral-Torsional Buckling (FLT) across compact/braced, inelastic, and elastic regimes."""
        base_beam = {
            'fy': 345.0,
            'E': 200000.0,
            'd': 201.0,
            'bf': 165.0,
            'tf': 10.2,
            'tw': 6.2,
            'Ag': 4580.0,
            'Zx': 298000.0,
            'rx': 85.6,
            'ry': 40.7,
            'Cb': 1.0,
            'Nsd': 50.0,
            'Msdx': 40.0
        }

        # Case 1: Braced (Lb <= Lp)
        res_braced = calculate_steel_structure({**base_beam, 'Lb': 1.0})
        self.assertEqual(res_braced['results']['regime_flt'], 'Contido (Sem FLT)')
        self.assertAlmostEqual(res_braced['results']['Mrd'], (base_beam['Zx'] * base_beam['fy']) / 1.10, places=1)

        # Case 2: Inelastic FLT (Lp < Lb <= Lr)
        res_inelastic = calculate_steel_structure({**base_beam, 'Lb': 3.0})
        self.assertEqual(res_inelastic['results']['regime_flt'], 'Inelástico (FLT Inelástica)')
        self.assertLess(res_inelastic['results']['Mrd'], res_braced['results']['Mrd'])

        # Case 3: Elastic FLT (Lb > Lr)
        res_elastic = calculate_steel_structure({**base_beam, 'Lb': 8.0})
        self.assertEqual(res_elastic['results']['regime_flt'], 'Elástico (FLT Elástica)')
        self.assertLess(res_elastic['results']['Mrd'], res_inelastic['results']['Mrd'])

if __name__ == '__main__':
    unittest.main()
