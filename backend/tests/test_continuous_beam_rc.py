import unittest
from backend.calculators.continuous_beam_rc import calculate_continuous_beam

class TestContinuousBeamRC(unittest.TestCase):

    def test_two_span_continuous_beam(self):
        """2-span beam L1=5m, L2=6m with g=15 kN/m and q=10 kN/m"""
        model = {
            'spans': [
                {'length': 5.0, 'bw': 0.20, 'h': 0.50, 'g': 15.0, 'q': 10.0},
                {'length': 6.0, 'bw': 0.20, 'h': 0.50, 'g': 15.0, 'q': 10.0}
            ],
            'fck': 30.0,
            'fyk': 500.0,
            'redistribution_ratio': 0.85
        }
        res = calculate_continuous_beam(model)
        self.assertEqual(res['status'], 'success')
        summary = res['summary']
        self.assertEqual(summary['num_spans'], 2)
        self.assertEqual(summary['total_length'], 11.0)
        self.assertGreater(summary['concrete_volume'], 0.5)

        # Spans check
        spans = res['spans']
        self.assertEqual(len(spans), 2)

        # Span 1 check
        sp1 = spans[0]
        self.assertGreater(sp1['M_pos_max'], 20.0) # Positive span moment
        self.assertLess(sp1['M_neg_right'], 0.0)   # Negative intermediate support moment
        self.assertGreater(sp1['design']['As_pos'], 2.0)
        self.assertGreater(sp1['design']['As_neg'], 2.0)
        self.assertTrue(sp1['design']['strut_ok']) # VRd2 strut check

        # Check envelope arrays
        self.assertEqual(len(sp1['Md_max']), len(sp1['xs_local']))
        self.assertEqual(len(sp1['Md_min']), len(sp1['xs_local']))
        self.assertTrue(all(max_val >= min_val for max_val, min_val in zip(sp1['Md_max'], sp1['Md_min'])))

    def test_three_span_symmetrical_beam(self):
        """3-span symmetrical beam L=5m, 5m, 5m"""
        model = {
            'spans': [
                {'length': 5.0, 'bw': 0.20, 'h': 0.45, 'g': 20.0, 'q': 15.0},
                {'length': 5.0, 'bw': 0.20, 'h': 0.45, 'g': 20.0, 'q': 15.0},
                {'length': 5.0, 'bw': 0.20, 'h': 0.45, 'g': 20.0, 'q': 15.0}
            ]
        }
        res = calculate_continuous_beam(model)
        self.assertEqual(res['status'], 'success')
        self.assertEqual(len(res['spans']), 3)
        # End spans should have similar positive moments due to symmetry
        sp1_m = res['spans'][0]['M_pos_max']
        sp3_m = res['spans'][2]['M_pos_max']
        self.assertAlmostEqual(sp1_m, sp3_m, delta=1.0)


if __name__ == '__main__':
    unittest.main()
