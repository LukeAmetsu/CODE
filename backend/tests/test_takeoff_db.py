import os
import tempfile
import unittest
import shutil
from backend.takeoff_db.db_manager import TakeoffDB, resolve_entry_file_path, get_onedrive_root
from backend.takeoff_db.scanner import FolderBatchScanner
import pymupdf as fitz


class TestTakeoffDBAndScanner(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.test_dir, 'test_takeoff.db')
        self.db = TakeoffDB(db_path=self.db_path)

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_schema_and_review_status(self):
        entry_data = {
            "category": "termoeletrica",
            "project_name": "UTE Teste",
            "equipment_name": "Bloco TG-99",
            "drawing_code": "DWG-TEST-001",
            "drawing_filename": "prancha_tg99.pdf",
            "relative_path": "Projetos/UTE_Teste/prancha_tg99.pdf",
            "sharepoint_url": "https://andradegutierrez.sharepoint.com/:b:/s/test",
            "review_status": "pending_review",
            "concrete_volume_m3": 150.5,
            "steel_weight_kg": 12500.0,
            "formwork_area_m2": 320.0
        }
        saved = self.db.add_entry(entry_data)
        self.assertIsNotNone(saved)
        self.assertEqual(saved['review_status'], 'pending_review')
        self.assertEqual(saved['relative_path'], 'Projetos/UTE_Teste/prancha_tg99.pdf')
        self.assertEqual(saved['sharepoint_url'], 'https://andradegutierrez.sharepoint.com/:b:/s/test')

        # Test set_review_status
        ok = self.db.set_review_status(saved['id'], 'verified')
        self.assertTrue(ok)
        reloaded = self.db.get_entry(saved['id'])
        self.assertEqual(reloaded['review_status'], 'verified')

        # Test filtering by review_status
        pending_list = self.db.list_entries(review_status='pending_review')
        self.assertEqual(len(pending_list), 0)

        verified_list = self.db.list_entries(review_status='verified')
        self.assertEqual(len(verified_list), 1)

    def test_scanner_with_real_pdf(self):
        # Create a sample PDF file in a subfolder
        sample_folder = os.path.join(self.test_dir, "Projetos", "UTE_Porto_Teste")
        os.makedirs(sample_folder, exist_ok=True)
        pdf_path = os.path.join(sample_folder, "DE-5000-01.pdf")

        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((50, 50), "PROJETO: UTE PORTO DE SERGIPE\nEQUIPAMENTO: BLOCO DO TURBOGERADOR TG-01\nPRANCHA: DE-5000-01 REV. 2")
        page.insert_text((50, 120), "CONCRETO ESTRUTURAL fck 30 MPa: 450,5 m3\nACO CA-50: 38.200 kg\nFORMA: 650 m2")
        doc.save(pdf_path)
        doc.close()

        scanner = FolderBatchScanner(self.db)
        res = scanner.scan_and_ingest(self.test_dir, recursive=True)

        self.assertTrue(res['success'])
        self.assertEqual(res['imported'], 1)

        entries = self.db.list_entries(review_status='pending_review')
        self.assertEqual(len(entries), 1)
        e = entries[0]
        self.assertEqual(e['review_status'], 'pending_review')
        self.assertIn("DE-5000-01", e['drawing_code'])
        self.assertGreater(e['concrete_volume_m3'], 400.0)

        # Test path resolution
        resolved = resolve_entry_file_path(e)
        self.assertIsNotNone(resolved)
        self.assertTrue(os.path.isfile(resolved))

    def test_doc_type_classification(self):
        from backend.takeoff_db.extractor import DrawingExtractor
        self.assertEqual(DrawingExtractor.detect_document_type("SECFD.01-500-PE-CV.DSN-0020.pdf"), "desenho")
        self.assertEqual(DrawingExtractor.detect_document_type("LTRD1.01-230-PE-CV.MCC-0013-00.pdf"), "memorial_calculo")
        self.assertEqual(DrawingExtractor.detect_document_type("OBRA_CROQUI_ESTACA_01.PDF"), "croqui")
        self.assertEqual(DrawingExtractor.detect_document_type("LTNEI.AC-230-PB-ME.RLT-5001-00.pdf"), "relatorio_tecnico")
        self.assertEqual(DrawingExtractor.detect_document_type("LTRH1.06-230-PE-ME.QMT-0003-00.pdf"), "quantitativo_material")

    def test_real_drawing_takeoff_extraction(self):
        from backend.takeoff_db.extractor import DrawingExtractor
        drawing_sample = os.path.join(os.path.dirname(__file__), '../../storage/drawings/99ac2675_SECFD.01-500-PE-CV.DSN-0020-00A-1.pdf')
        if not os.path.exists(drawing_sample):
            return

        with open(drawing_sample, 'rb') as f:
            b = f.read()

        res = DrawingExtractor.extract_from_file(b, "SECFD.01-500-PE-CV.DSN-0020-00A-1.pdf")
        self.assertEqual(res['doc_type'], 'desenho')
        self.assertEqual(res['drawing_code'], 'SECFD.01-500-PE-CV.DSN-0020')
        self.assertEqual(res['revision'], '00A')
        self.assertEqual(res['category'], 'linha_transmissao')
        self.assertEqual(res['fck_concrete'], 25.0)
        self.assertEqual(res['concrete_volume_m3'], 27.38)
        self.assertEqual(res['steel_weight_kg'], 1663.0)
        self.assertEqual(res['formwork_area_m2'], 44.48)
        self.assertEqual(res['excavation_m3'], 80.50)
        self.assertEqual(res['backfill_m3'], 51.64)
        self.assertEqual(res['lean_concrete_m3'], 1.87)
        self.assertAlmostEqual(res['steel_ratio_kg_m3'], 60.74, places=1)
        self.assertAlmostEqual(res['formwork_ratio_m2_m3'], 1.62, places=1)


if __name__ == '__main__':
    unittest.main()
