"""
Unit and regression tests for PCALC (Reinforced Concrete Column engine per NBR 6118:2023).
Tests material models, cross-section discretization, slenderness, interaction surfaces,
and 2nd order methods (Method 1 Curvature Approx, Method 3 Standard Diagram, Method General).
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


class TestPCalcMaterials(unittest.TestCase):
    def test_class_I_concrete(self):
        mat = MaterialData(fck=30, fyk=500, es=210)
        self.assertEqual(mat.fck, 30)
        self.assertAlmostEqual(mat.ec2, 0.0020, places=4)
        self.assertAlmostEqual(mat.ecu, 0.0035, places=4)
        self.assertEqual(mat.n, 2.0)
        self.assertAlmostEqual(mat.fcd, 3.0 / 1.4, places=4)

    def test_class_II_concrete(self):
        mat = MaterialData(fck=70, fyk=500, es=210)
        self.assertEqual(mat.fck, 70)
        # NBR 6118 item 8.2.10.1: ec2 = 0.0020 + 0.000085*(70-50)^0.53
        expected_ec2 = 0.0020 + 0.000085 * ((70 - 50) ** 0.53)
        self.assertAlmostEqual(mat.ec2, expected_ec2, places=4)
        # ecu and n decrease for high strength concrete
        self.assertLess(mat.ecu, 0.0035)
        self.assertLess(mat.n, 2.0)


class TestPCalcGeometry(unittest.TestCase):
    def test_rectangular_section(self):
        geo = SectionGeometry('Retangular', hx=30, hy=50, boundary='pinned', length=300)
        geo.discretize(nx=20, ny=20)
        self.assertAlmostEqual(geo.area_ac, 1500.0, places=1)
        # Ix = b*h^3/12 = 30 * 50^3 / 12 = 312500 cm4
        self.assertAlmostEqual(geo.ix, 312500.0, places=1)
        # Iy = h*b^3/12 = 50 * 30^3 / 12 = 112500 cm4
        self.assertAlmostEqual(geo.iy, 112500.0, places=1)
        self.assertEqual(len(geo.fibers), 400)

    def test_circular_section(self):
        geo = SectionGeometry('Circular', hx=40, hy=40, boundary='pinned', length=300)
        geo.discretize(nx=30, ny=30)
        expected_area = math.pi * (20.0 ** 2)
        # Numerical fiber sum approximates pi * R^2 within 2%
        fibers_area = sum(f['dA'] for f in geo.fibers)
        self.assertAlmostEqual(fibers_area / expected_area, 1.0, delta=0.03)

    def test_slenderness_analytical(self):
        # Rectangular: i_y = hx / sqrt(12) = 30 / 3.4641 = 8.66 cm
        # lambda = 300 / 8.66 = 34.64
        geo_rect = SectionGeometry('Retangular', hx=30, hy=50, boundary='pinned', length=300)
        iy_rect = math.sqrt(geo_rect.iy / geo_rect.area_ac)
        self.assertAlmostEqual(iy_rect, 30.0 / math.sqrt(12.0), places=3)
        lambda_rect = 300.0 / iy_rect
        self.assertAlmostEqual(lambda_rect, (3.4641 * 300.0) / 30.0, delta=0.01)

        # Circular: i = D / 4. For D = 40, i = 10 cm. lambda = 300 / 10 = 30.0
        geo_circ = SectionGeometry('Circular', hx=40, hy=40, boundary='pinned', length=300)
        i_circ = math.sqrt(geo_circ.ix / geo_circ.area_ac)
        self.assertAlmostEqual(i_circ, 10.0, places=3)
        lambda_circ = 300.0 / i_circ
        self.assertAlmostEqual(lambda_circ, 30.0, places=3)


class TestPCalcResistance(unittest.TestCase):
    def setUp(self):
        self.mat = MaterialData(fck=25, fyk=500, es=210)
        self.geo = SectionGeometry('Retangular', hx=30, hy=50, boundary='pinned', length=300)
        self.geo.discretize(nx=20, ny=20)
        # 4 bars of 16mm in corners
        self.bars = [
            {'x': -11, 'y': -21, 'diametro': 16},
            {'x': 11, 'y': -21, 'diametro': 16},
            {'x': -11, 'y': 21, 'diametro': 16},
            {'x': 11, 'y': 21, 'diametro': 16}
        ]
        self.sec = ConcreteSection(self.geo, self.mat, self.bars)

    def test_pure_compression(self):
        # Under uniform strain ec = -0.002, resistance should be negative (compression)
        N_int, Mx_int, My_int = self.sec.calculate_resistance(-0.002, 0.0, 0.0)
        self.assertLess(N_int, 0)
        # Symmetric rebar in rectangular section produces ~0 moment
        self.assertAlmostEqual(Mx_int, 0.0, delta=1.0)
        self.assertAlmostEqual(My_int, 0.0, delta=1.0)

    def test_pure_bending(self):
        # Pure curvature in X
        N_int, Mx_int, My_int = self.sec.calculate_resistance(0.0, 0.0001, 0.0)
        self.assertNotEqual(Mx_int, 0.0)
        self.assertAlmostEqual(My_int, 0.0, delta=0.5)


class TestPCalcSecondOrderMethods(unittest.TestCase):
    def setUp(self):
        self.mat = MaterialData(fck=25, fyk=500, es=210)
        self.geo = SectionGeometry('Retangular', hx=30, hy=50, boundary='pinned', length=400)
        self.geo.discretize(nx=20, ny=20)
        self.bars = [
            {'x': -11, 'y': -21, 'diametro': 16},
            {'x': 11, 'y': -21, 'diametro': 16},
            {'x': -11, 'y': 21, 'diametro': 16},
            {'x': 11, 'y': 21, 'diametro': 16}
        ]
        self.sec = ConcreteSection(self.geo, self.mat, self.bars)
        self.solver = Solver(self.sec)
        self.solver.length_eff = 4.0 # 4m

    def test_method1_curvature_approx(self):
        Nsd = -800.0  # kN
        M1xt, M1xb = 50.0, -50.0 # Double curvature
        M1yt, M1yb = 20.0, -20.0
        res = self.solver.calculate_method1(Nsd, M1xt, M1xb, M1yt, M1yb, lambdaX=45, lambdaY=55)
        # Total moment must be greater than or equal to minimum moment
        e_min_x = 0.015 + 0.03 * 0.50
        M1_min_x = abs(Nsd) * e_min_x
        self.assertGreaterEqual(res['Mtot_x'], M1_min_x)
        # 2nd order moment must be positive
        self.assertGreater(res['M2d_x'], 0.0)
        self.assertGreater(res['M2d_y'], 0.0)

    def test_method3_standard_diagram(self):
        Nsd = -800.0
        # Equal end moments (single curvature, alpha_b = 1.0)
        M1xt, M1xb = 60.0, 60.0
        M1yt, M1yb = 20.0, 20.0
        res = self.solver.calculate_method3(Nsd, M1xt, M1xb, M1yt, M1yb, lambdaX=45, lambdaY=55)
        self.assertGreater(res['Mtot_x'], 60.0)
        self.assertGreater(res['M2d_x'], 0.0)

    def test_method_general_non_zero_deflection(self):
        # Regression test for the 10^4 scale error and deflection sign:
        # Previously M2d was 0.00 kNm due to curvature scale bug and deflection sign.
        Nsd = -800.0
        M1xt, M1xb = 60.0, 60.0
        M1yt, M1yb = 30.0, 30.0
        res = self.solver.calculate_method_general(Nsd, M1xt, M1xb, M1yt, M1yb, biaxial=True)
        # M2d must be non-zero and physically meaningful (> 0.5 kNm)
        self.assertGreater(res['M2d_x'], 0.5, "Method General must compute real 2nd order effects (M2d > 0.5 kNm)")
        self.assertGreater(res['Mtot_x'], 60.0)



class TestPCalcPipeline(unittest.TestCase):
    def test_calculate_column_single_curvature(self):
        inputs = {
            'section_type': 'Retangular',
            'hx': 30,
            'hy': 50,
            'boundary': 'pinned',
            'length': 400,
            'fck': 25,
            'fyk': 500,
            'es': 210,
            'gamac': 1.4,
            'gamas': 1.15,
            'gamaf': 1.4,
            'bars': [
                {'x': 4, 'y': 4, 'diametro': 16},
                {'x': 26, 'y': 4, 'diametro': 16},
                {'x': 4, 'y': 46, 'diametro': 16},
                {'x': 26, 'y': 46, 'diametro': 16}
            ],
            'load': {'n': -600, 'mxTop': 50, 'mxBot': 50, 'myTop': 20, 'myBot': 20},
            'calc_2nd_order': True,
            'method_2nd': 'curvature_approx'
        }
        res = calculate_column(inputs)
        self.assertIn('surface', res)
        self.assertIn('results', res)
        self.assertIn('slenderness', res)
        self.assertGreater(res['slenderness']['lambdaX'], 20.0)
        # Single curvature (alpha_b = 1.0): Mtot must exceed first-order moment (50 * 1.4 = 70.0)
        self.assertGreater(res['results']['Mtot_x'], 50.0 * 1.4)
        self.assertGreater(res['results']['M2d_x'], 0.0)

    def test_calculate_column_double_curvature_alpha_b(self):
        inputs = {
            'section_type': 'Retangular',
            'hx': 30,
            'hy': 50,
            'boundary': 'pinned',
            'length': 400,
            'fck': 25,
            'fyk': 500,
            'es': 210,
            'gamac': 1.4,
            'gamas': 1.15,
            'gamaf': 1.4,
            'bars': [
                {'x': 4, 'y': 4, 'diametro': 16},
                {'x': 26, 'y': 4, 'diametro': 16},
                {'x': 4, 'y': 46, 'diametro': 16},
                {'x': 26, 'y': 46, 'diametro': 16}
            ],
            'load': {'n': -600, 'mxTop': 50, 'mxBot': -25, 'myTop': 20, 'myBot': -10},
            'calc_2nd_order': True,
            'method_2nd': 'curvature_approx'
        }
        res = calculate_column(inputs)
        # Double curvature: alpha_b = max(0.4, 0.6 - 0.2) = 0.40
        # M1d_eq = max(0.4 * 70, M1_min) = max(28, 25.2) = 28.0 kNm
        # Mtot = 28.0 + M2d (~13.44) = 41.44 kNm
        self.assertAlmostEqual(res['results']['Mtot_x'], 41.44, places=1)



if __name__ == '__main__':
    unittest.main()
