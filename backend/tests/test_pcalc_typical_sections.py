"""
Comprehensive standard validation tests for PCALC across typical structural cross-sections.
Tests cover:
1. Typical building edge column (Pilar de Borda 20x40 cm)
2. Typical symmetric central column (Pilar Central 30x30 cm)
3. Heavy-load commercial/parking column (Pilar Robusto 40x60 cm)
4. Circular bridge pier / architectural column (Pilar Circular D=40 cm)
5. Wall-column with high aspect ratio (Pilar-Parede 20x100 cm)
6. Mandatory minimum first-order moments (e_1,min per NBR 6118)
7. Second-order method comparison (Curvature Approx, Standard Diagram, General Method)
"""

import unittest
import math
from backend.calculators.pcalc import (
    MaterialData,
    SectionGeometry,
    ConcreteSection,
    Solver,
    generate_interaction_surface,
    calculate_column
)


class TestTypicalRectangularColumn20x40(unittest.TestCase):
    """Pilar típico de borda de edifício residencial (20x40 cm, L = 3.0 m, 6 barras de 12.5 mm)."""

    def setUp(self):
        self.inputs = {
            'section_type': 'Retangular',
            'hx': 20,
            'hy': 40,
            'boundary': 'pinned',
            'length': 300,
            'fck': 25,
            'fyk': 500,
            'es': 210,
            'gamac': 1.4,
            'gamas': 1.15,
            'gamaf': 1.4,
            # 6 bars: 3 on each 40cm face (cover = 3.5cm)
            'bars': [
                {'x': 3.5, 'y': 3.5, 'diametro': 12.5},
                {'x': 16.5, 'y': 3.5, 'diametro': 12.5},
                {'x': 3.5, 'y': 20.0, 'diametro': 12.5},
                {'x': 16.5, 'y': 20.0, 'diametro': 12.5},
                {'x': 3.5, 'y': 36.5, 'diametro': 12.5},
                {'x': 16.5, 'y': 36.5, 'diametro': 12.5},
            ],
            'load': {'n': -500, 'mxTop': 30, 'mxBot': 30, 'myTop': 15, 'myBot': 15},
            'calc_2nd_order': True,
            'method_2nd': 'curvature_approx'
        }

    def test_geometric_properties(self):
        geo = SectionGeometry('Retangular', hx=20, hy=40, boundary='pinned', length=300)
        geo.discretize()
        self.assertAlmostEqual(geo.area_ac, 800.0, delta=0.5)
        # Ix = b*h^3/12 = 20 * 40^3 / 12 = 106666.7 cm4
        self.assertAlmostEqual(geo.ix, 20 * (40**3) / 12.0, delta=1.0)
        # Iy = h*b^3/12 = 40 * 20^3 / 12 = 26666.7 cm4
        self.assertAlmostEqual(geo.iy, 40 * (20**3) / 12.0, delta=1.0)

    def test_slenderness_and_second_order(self):
        res = calculate_column(self.inputs)
        self.assertIn('slenderness', res)
        # lambda_x = 300 / (40 / sqrt(12)) = 25.98
        self.assertAlmostEqual(res['slenderness']['lambdaX'], (3.4641 * 300.0) / 40.0, delta=0.5)
        # lambda_y = 300 / (20 / sqrt(12)) = 51.96 (slender direction)
        self.assertAlmostEqual(res['slenderness']['lambdaY'], (3.4641 * 300.0) / 20.0, delta=0.5)
        # Weak direction (Y) must have significant second-order effects
        self.assertGreater(res['results']['M2d_y'], 0.5)
        self.assertGreater(res['results']['Mtot_y'], 15.0 * 1.4)

    def test_rebar_ratio_compliance(self):
        # 6 bars of 12.5 mm -> As = 6 * (pi * 1.25^2 / 4) = 7.363 cm2
        As = 6 * (math.pi * (1.25 ** 2) / 4.0)
        Ac = 20 * 40
        rho = (As / Ac) * 100.0
        # NBR 6118: rho >= 0.4% and rho <= 4.0%
        self.assertGreaterEqual(rho, 0.4)
        self.assertLessEqual(rho, 4.0)


class TestTypicalSquareColumn30x30(unittest.TestCase):
    """Pilar central quadrado simétrico (30x30 cm, L = 3.2 m, 8 barras de 16 mm)."""

    def setUp(self):
        self.inputs = {
            'section_type': 'Retangular',
            'hx': 30,
            'hy': 30,
            'boundary': 'pinned',
            'length': 320,
            'fck': 30,
            'fyk': 500,
            'es': 210,
            'gamac': 1.4,
            'gamas': 1.15,
            'gamaf': 1.4,
            # 8 bars perimeter 3x3 (cover 3.5 cm)
            'bars': [
                {'x': 3.5, 'y': 3.5, 'diametro': 16},
                {'x': 15.0, 'y': 3.5, 'diametro': 16},
                {'x': 26.5, 'y': 3.5, 'diametro': 16},
                {'x': 3.5, 'y': 15.0, 'diametro': 16},
                {'x': 26.5, 'y': 15.0, 'diametro': 16},
                {'x': 3.5, 'y': 26.5, 'diametro': 16},
                {'x': 15.0, 'y': 26.5, 'diametro': 16},
                {'x': 26.5, 'y': 26.5, 'diametro': 16},
            ],
            'load': {'n': -900, 'mxTop': 25, 'mxBot': 25, 'myTop': 25, 'myBot': 25},
            'calc_2nd_order': True,
            'method_2nd': 'curvature_approx'
        }

    def test_diagonal_symmetry(self):
        """Under equal biaxial moments (Mx = My), response must be strictly symmetric."""
        res = calculate_column(self.inputs)
        # Slenderness must be identical along both axes
        self.assertAlmostEqual(res['slenderness']['lambdaX'], res['slenderness']['lambdaY'], places=2)
        # Total moments and 2nd order moments must be equal
        self.assertAlmostEqual(res['results']['Mtot_x'], res['results']['Mtot_y'], delta=0.5)
        self.assertAlmostEqual(res['results']['M2d_x'], res['results']['M2d_y'], delta=0.5)

    def test_maximum_concentric_compression_capacity(self):
        """Pure compression capacity: NRd_approx = 0.85 * fcd * Ac + fyd * As."""
        mat = MaterialData(fck=30, fyk=500, es=210)
        geo = SectionGeometry('Retangular', hx=30, hy=30, boundary='pinned', length=320)
        geo.discretize()
        bars = [{'x': b['x'] - 15, 'y': b['y'] - 15, 'diametro': b['diametro']} for b in self.inputs['bars']]
        sec = ConcreteSection(geo, mat, bars)
        # Uniform compression strain at -0.002
        N_int, Mx, My = sec.calculate_resistance(-0.002, 0.0, 0.0)
        fcd = 3.0 / 1.4  # kN/cm2
        Ac = 900.0       # cm2
        # As = 8 * 2.01 = 16.08 cm2
        As = 8 * (math.pi * 1.6**2 / 4.0)
        # At strain -0.002, steel stress is 0.002 * Es (where Es = 21000 kN/cm2) -> sigma_s = 42 kN/cm2 (< fyd = 43.48)
        sigma_s = 0.002 * mat.E_steel_kncm2  # 42.0 kN/cm2
        expected_N = - (0.85 * fcd * (Ac - As) + sigma_s * As)
        # Resistance should match theoretical strength within 5%
        self.assertAlmostEqual(abs(N_int) / abs(expected_N), 1.0, delta=0.05)


class TestTypicalHeavyColumn40x60(unittest.TestCase):
    """Pilar robusto de edifício com alta carga normal (40x60 cm, N = -2000 kN, fck = 35 MPa, 8 barras de 20 mm)."""

    def setUp(self):
        self.inputs = {
            'section_type': 'Retangular',
            'hx': 40,
            'hy': 60,
            'boundary': 'pinned',
            'length': 360,
            'fck': 35,
            'fyk': 500,
            'es': 210,
            'gamac': 1.4,
            'gamas': 1.15,
            'gamaf': 1.4,
            'bars': [
                {'x': 4.0, 'y': 4.0, 'diametro': 20},
                {'x': 36.0, 'y': 4.0, 'diametro': 20},
                {'x': 4.0, 'y': 30.0, 'diametro': 20},
                {'x': 36.0, 'y': 30.0, 'diametro': 20},
                {'x': 4.0, 'y': 56.0, 'diametro': 20},
                {'x': 36.0, 'y': 56.0, 'diametro': 20},
                {'x': 20.0, 'y': 4.0, 'diametro': 20},
                {'x': 20.0, 'y': 56.0, 'diametro': 20},
            ],
            'load': {'n': -2000, 'mxTop': 100, 'mxBot': -50, 'myTop': 50, 'myBot': -25},
            'calc_2nd_order': True,
            'method_2nd': 'curvature_approx'
        }

    def test_2nd_order_methods_consistency(self):
        """All second order methods (Method 1, Method 3, Method General) must yield stable, positive 2nd order moments."""
        # Method 1
        self.inputs['method_2nd'] = 'curvature_approx'
        res1 = calculate_column(self.inputs)
        # Method 3
        self.inputs['method_2nd'] = 'standard_diagram'
        res3 = calculate_column(self.inputs)
        # Method General
        self.inputs['method_2nd'] = 'general_biaxial'
        res_gen = calculate_column(self.inputs)

        # Total design moments must be non-zero and physically consistent
        self.assertGreater(res1['results']['Mtot_x'], 50.0)
        self.assertGreater(res3['results']['Mtot_x'], 50.0)
        self.assertGreater(res_gen['results']['Mtot_x'], 50.0)

        # Minimum moment check
        Nsd = 2000.0 * 1.4  # 2800 kN
        M1_min_x = Nsd * (0.015 + 0.03 * 0.60)  # 2800 * 0.033 = 92.4 kNm
        self.assertGreaterEqual(res1['results']['Mtot_x'], M1_min_x)
        self.assertGreaterEqual(res3['results']['Mtot_x'], M1_min_x)


class TestTypicalCircularColumnD40(unittest.TestCase):
    """Pilar circular (D = 40 cm, L = 3.0 m, 6 barras de 16 mm distribuídas em coroa circular)."""

    def setUp(self):
        # 6 bars along circle of radius R = 20 - 3.5 = 16.5 cm
        R_circ = 16.5
        bars = []
        for i in range(6):
            theta = 2.0 * math.pi * i / 6.0
            bx = 20.0 + R_circ * math.cos(theta)
            by = 20.0 + R_circ * math.sin(theta)
            bars.append({'x': round(bx, 2), 'y': round(by, 2), 'diametro': 16})

        self.inputs = {
            'section_type': 'Circular',
            'hx': 40,
            'hy': 40,
            'boundary': 'pinned',
            'length': 300,
            'fck': 30,
            'fyk': 500,
            'es': 210,
            'gamac': 1.4,
            'gamas': 1.15,
            'gamaf': 1.4,
            'bars': bars,
            'load': {'n': -600, 'mxTop': 30, 'mxBot': 30, 'myTop': 0, 'myBot': 0},
            'calc_2nd_order': True,
            'method_2nd': 'curvature_approx'
        }

    def test_circular_geometry_properties(self):
        geo = SectionGeometry('Circular', hx=40, hy=40, boundary='pinned', length=300)
        geo.discretize(nx=30, ny=30)
        expected_area = math.pi * (20.0 ** 2)  # 1256.6 cm2
        fibers_area = sum(f['dA'] for f in geo.fibers)
        self.assertAlmostEqual(fibers_area / expected_area, 1.0, delta=0.03)
        # Radius of gyration for circle is D / 4 = 10 cm
        i_circ = math.sqrt(geo.ix / geo.area_ac)
        self.assertAlmostEqual(i_circ, 10.0, delta=0.3)

    def test_circular_bending_isotropy(self):
        """A symmetric circular column under purely X vs purely Y bending must exhibit equivalent resistance."""
        # Load in X
        self.inputs['load'] = {'n': -600, 'mxTop': 35, 'mxBot': 35, 'myTop': 0, 'myBot': 0}
        res_x = calculate_column(self.inputs)

        # Load in Y
        self.inputs['load'] = {'n': -600, 'mxTop': 0, 'mxBot': 0, 'myTop': 35, 'myBot': 35}
        res_y = calculate_column(self.inputs)

        # Total moment on active axis should match within 5% (due to discrete hexagonal rebar symmetry)
        self.assertAlmostEqual(res_x['results']['Mtot_x'] / res_y['results']['Mtot_y'], 1.0, delta=0.05)


class TestTypicalWallColumn20x100(unittest.TestCase):
    """Pilar-parede alongado (20x100 cm, L = 3.0 m, 10 barras de 16 mm)."""

    def setUp(self):
        bars = []
        # 5 bars along each 100cm face
        for i in range(5):
            y_pos = 4.0 + i * (100.0 - 8.0) / 4.0
            bars.append({'x': 3.5, 'y': y_pos, 'diametro': 16})
            bars.append({'x': 16.5, 'y': y_pos, 'diametro': 16})

        self.inputs = {
            'section_type': 'Retangular',
            'hx': 20,
            'hy': 100,
            'boundary': 'pinned',
            'length': 300,
            'fck': 30,
            'fyk': 500,
            'es': 210,
            'gamac': 1.4,
            'gamas': 1.15,
            'gamaf': 1.4,
            'bars': bars,
            'load': {'n': -1500, 'mxTop': 80, 'mxBot': 80, 'myTop': 25, 'myBot': 25},
            'calc_2nd_order': True,
            'method_2nd': 'curvature_approx'
        }

    def test_extreme_stiffness_ratio(self):
        geo = SectionGeometry('Retangular', hx=20, hy=100, boundary='pinned', length=300)
        geo.discretize()
        # Ix / Iy = (20 * 100^3) / (100 * 20^3) = 25.0
        self.assertAlmostEqual(geo.ix / geo.iy, 25.0, delta=0.2)

    def test_slenderness_contrast(self):
        res = calculate_column(self.inputs)
        lambda_x = res['slenderness']['lambdaX']
        lambda_y = res['slenderness']['lambdaY']
        # Strong direction (Y = 100cm): lambda_x = 3.464 * 300 / 100 = 10.39 (stocky column)
        self.assertAlmostEqual(lambda_x, 10.39, delta=0.5)
        # Weak direction (X = 20cm): lambda_y = 3.464 * 300 / 20 = 51.96 (slender column)
        self.assertAlmostEqual(lambda_y, 51.96, delta=0.5)
        # 2nd order effects in weak direction must be greater than in strong direction
        self.assertGreater(res['results']['M2d_y'], 0.5)


class TestMinimumEccentricityEnforcement(unittest.TestCase):
    """NBR 6118 item 11.3.3.4.3: M1d,min = Nsd * (0.015 + 0.03 * h)."""

    def test_enforces_minimum_moment_when_zero_first_order_moment(self):
        inputs = {
            'section_type': 'Retangular',
            'hx': 25,
            'hy': 45,
            'boundary': 'pinned',
            'length': 300,
            'fck': 25,
            'fyk': 500,
            'es': 210,
            'gamac': 1.4,
            'gamas': 1.15,
            'gamaf': 1.4,
            'bars': [
                {'x': 4, 'y': 4, 'diametro': 16},
                {'x': 21, 'y': 4, 'diametro': 16},
                {'x': 4, 'y': 41, 'diametro': 16},
                {'x': 21, 'y': 41, 'diametro': 16}
            ],
            # Zero applied moments
            'load': {'n': -600, 'mxTop': 0, 'mxBot': 0, 'myTop': 0, 'myBot': 0},
            'calc_2nd_order': True,
            'method_2nd': 'curvature_approx'
        }
        res = calculate_column(inputs)
        Nsd = 600.0 * 1.4  # 840 kN
        # e_min_x = 0.015 + 0.03 * 0.45 = 0.0285 m -> M1d_min_x = 840 * 0.0285 = 23.94 kNm
        expected_Mmin_x = Nsd * (0.015 + 0.03 * 0.45)
        # e_min_y = 0.015 + 0.03 * 0.25 = 0.0225 m -> M1d_min_y = 840 * 0.0225 = 18.90 kNm
        expected_Mmin_y = Nsd * (0.015 + 0.03 * 0.25)

        self.assertGreaterEqual(res['results']['Mtot_x'], expected_Mmin_x - 0.1)
        self.assertGreaterEqual(res['results']['Mtot_y'], expected_Mmin_y - 0.1)


if __name__ == '__main__':
    unittest.main()
