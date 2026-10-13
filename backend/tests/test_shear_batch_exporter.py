import os
import shutil
import unittest
from backend.calculators.shear_batch_exporter import (
    run_batch_shear_variations,
    get_available_metadata,
    SUBSET_DEFINITIONS,
    X_VARIABLES,
)


class TestShearBatchExporter(unittest.TestCase):

    def setUp(self):
        self.test_dir = os.path.join(os.path.dirname(__file__), 'tmp_shear_batch_test')
        os.makedirs(self.test_dir, exist_ok=True)

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_metadata_available(self):
        meta = get_available_metadata()
        self.assertIn("subsets", meta)
        self.assertIn("variables", meta)
        self.assertGreaterEqual(len(meta["subsets"]), 15)
        self.assertGreaterEqual(len(meta["variables"]), 5)

    def test_run_batch_shear_variations(self):
        # Run small batch with 2 subsets and 2 variables
        res = run_batch_shear_variations(
            out_dir=self.test_dir,
            selected_subsets=['slabs_all', 'members_long_span'],
            selected_vars=['d (mm)', 'a_d'],
            exclude_prestressed=True,
            include_codes=True,
            dpi=100,
        )

        self.assertEqual(res['status'], 'success')
        self.assertGreaterEqual(res['plots_count'], 2)
        self.assertTrue(os.path.exists(res['summary_csv']))
        self.assertTrue(os.path.exists(res['summary_json']))

        # Verify images exist
        for fname in res['files']:
            fpath = os.path.join(self.test_dir, fname)
            self.assertTrue(os.path.exists(fpath))
            self.assertGreater(os.path.getsize(fpath), 1000)


if __name__ == '__main__':
    unittest.main()
