import unittest
import math
from backend.calculators.pcalc_geometry import (
    compute_polygon_properties,
    mesh_arbitrary_section,
    make_rectangular_polygon,
    make_circular_polygon,
    make_L_polygon,
    make_T_polygon,
    make_I_polygon,
    make_hollow_box_polygon
)


class TestPCalcGeometryEngine(unittest.TestCase):
    def test_rectangular_properties_and_mesh(self):
        b, h = 30.0, 50.0
        ext, holes = make_rectangular_polygon(b, h)
        props = compute_polygon_properties(ext, holes)

        self.assertAlmostEqual(props['Ac'], 1500.0, places=4)
        self.assertAlmostEqual(props['xm'], 15.0, places=4)
        self.assertAlmostEqual(props['ym'], 25.0, places=4)
        # Ix = b*h^3/12 = 30*125000/12 = 312500
        self.assertAlmostEqual(props['Ix'], 312500.0, places=2)
        # Iy = h*b^3/12 = 50*27000/12 = 112500
        self.assertAlmostEqual(props['Iy'], 112500.0, places=2)
        self.assertAlmostEqual(props['Ixy'], 0.0, places=4)

        # Meshing
        fibers, _ = mesh_arbitrary_section(ext, holes, target_fibers=200)
        mesh_area = sum(f['dA'] for f in fibers)
        self.assertAlmostEqual(mesh_area, 1500.0, places=1)
        self.assertGreater(len(fibers), 50)

    def test_circular_properties(self):
        D = 40.0
        ext, holes = make_circular_polygon(D, n=72)
        props = compute_polygon_properties(ext, holes)
        expected_area = math.pi * 20.0**2
        expected_I = (math.pi * 40.0**4) / 64.0

        self.assertAlmostEqual(props['Ac'] / expected_area, 1.0, delta=0.01)
        self.assertAlmostEqual(props['Ix'] / expected_I, 1.0, delta=0.01)
        self.assertAlmostEqual(props['Iy'] / expected_I, 1.0, delta=0.01)
        self.assertAlmostEqual(props['Ixy'], 0.0, delta=1.0)

    def test_L_section_properties_and_mesh(self):
        # L 30x50 with tf=10, tw=10
        bf, h, tf, tw = 30.0, 50.0, 10.0, 10.0
        ext, holes = make_L_polygon(bf, h, tf, tw)
        props = compute_polygon_properties(ext, holes)

        expected_area = 700.0
        expected_xm = (300.0 * 15.0 + 400.0 * 5.0) / 700.0
        expected_ym = (300.0 * 5.0 + 400.0 * 30.0) / 700.0

        self.assertAlmostEqual(props['Ac'], expected_area, places=3)
        self.assertAlmostEqual(props['xm'], expected_xm, places=3)
        self.assertAlmostEqual(props['ym'], expected_ym, places=3)
        self.assertNotEqual(round(props['Ixy'], 1), 0.0)
        self.assertGreater(props['i_min'], 0.0)

        # Meshing
        fibers, _ = mesh_arbitrary_section(ext, holes, target_fibers=200)
        mesh_area = sum(f['dA'] for f in fibers)
        self.assertAlmostEqual(mesh_area, expected_area, places=1)

    def test_T_section_properties_and_mesh(self):
        bf, h, tf, bw = 50.0, 60.0, 12.0, 20.0
        ext, holes = make_T_polygon(bf, h, tf, bw)
        props = compute_polygon_properties(ext, holes)

        expected_area = 600.0 + 960.0 # 1560
        self.assertAlmostEqual(props['Ac'], expected_area, places=3)
        self.assertAlmostEqual(props['xm'], 25.0, places=3)
        self.assertAlmostEqual(props['Ixy'], 0.0, places=2)

        # Meshing
        fibers, _ = mesh_arbitrary_section(ext, holes, target_fibers=200)
        mesh_area = sum(f['dA'] for f in fibers)
        self.assertAlmostEqual(mesh_area, expected_area, places=1)

    def test_hollow_box_properties_and_mesh(self):
        b, h, tw = 40.0, 60.0, 10.0
        ext, holes = make_hollow_box_polygon(b, h, tw)
        props = compute_polygon_properties(ext, holes)

        # Ext: 40x60 = 2400, Hole: 20x40 = 800 -> Net = 1600
        self.assertAlmostEqual(props['Ac'], 1600.0, places=3)
        self.assertAlmostEqual(props['xm'], 20.0, places=3)
        self.assertAlmostEqual(props['ym'], 30.0, places=3)
        self.assertAlmostEqual(props['Ix'], 613333.33, delta=1.0)
        self.assertAlmostEqual(props['Ixy'], 0.0, places=2)

        # Meshing with hole
        fibers, _ = mesh_arbitrary_section(ext, holes, target_fibers=250)
        mesh_area = sum(f['dA'] for f in fibers)
        self.assertAlmostEqual(mesh_area, 1600.0, places=1)


if __name__ == '__main__':
    unittest.main()
