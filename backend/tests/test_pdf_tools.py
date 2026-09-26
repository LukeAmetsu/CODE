import os
import sys
import io

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import pymupdf as fitz
import base64
from backend.calculators.pdf_tools import (
    pdf_inspect,
    pdf_merge,
    pdf_split,
    pdf_organize,
    pdf_protect,
    pdf_unlock,
    pdf_compress,
    pdf_sign_stamp,
    pdf_to_images,
    images_to_pdf
)

def create_sample_pdf(num_pages=3):
    """Creates an in-memory sample PDF with text on each page."""
    doc = fitz.open()
    for i in range(num_pages):
        page = doc.new_page(width=595, height=842)
        page.insert_text((72, 72), f"Teste de Engenharia - Pagina {i + 1}", fontsize=20)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()

def test_inspect_and_pages():
    raw_pdf = create_sample_pdf(3)
    res = pdf_inspect(raw_pdf)
    assert res["status"] == "success"
    assert res["page_count"] == 3
    assert len(res["pages"]) == 3
    assert res["pages"][0]["thumbnail"].startswith("data:image/jpeg;base64,")

def test_merge():
    pdf1 = create_sample_pdf(2)
    pdf2 = create_sample_pdf(3)
    payload = [
        {"file_data": pdf1, "page_ranges": "all"},
        {"file_data": pdf2, "page_ranges": "1"}
    ]
    res = pdf_merge(payload)
    assert res["status"] == "success"
    assert res["page_count"] == 3  # 2 from pdf1 + 1 from pdf2

def test_split():
    pdf = create_sample_pdf(5)
    # Extract
    res_extract = pdf_split(pdf, mode="extract", ranges="1, 3-4")
    assert res_extract["status"] == "success"
    assert res_extract["page_count"] == 3

    # Separate into ZIP
    res_zip = pdf_split(pdf, mode="separate")
    assert res_zip["status"] == "success"
    assert res_zip["mode"] == "zip"

def test_organize():
    pdf = create_sample_pdf(4)
    ops = [
        {"source_index": 2, "rotation": 90, "delete": False},
        {"source_index": 0, "rotation": 180, "delete": False},
        {"source_index": 1, "rotation": 0, "delete": True}
    ]
    res = pdf_organize(pdf, operations=ops)
    assert res["status"] == "success"
    assert res["page_count"] == 2

def test_protect_and_unlock():
    pdf = create_sample_pdf(2)
    # Protect
    res_prot = pdf_protect(pdf, user_password="senha_segura_123")
    assert res_prot["status"] == "success"

    # Unlock with wrong password
    res_fail = pdf_unlock(res_prot["data_url"], "senha_errada")
    assert res_fail["status"] == "error"

    # Unlock with correct password
    res_unlock = pdf_unlock(res_prot["data_url"], "senha_segura_123")
    assert res_unlock["status"] == "success"

def test_compress():
    pdf = create_sample_pdf(3)
    res = pdf_compress(pdf, level="medium")
    assert res["status"] == "success"
    assert res["new_size"] <= res["original_size"]

def test_images_to_pdf_and_pdf_to_images():
    # 1. Create a dummy PNG image
    import PIL.Image
    img = PIL.Image.new("RGB", (200, 200), color=(73, 109, 137))
    img_buf = io.BytesIO()
    img.save(img_buf, format="PNG")
    img_bytes = img_buf.getvalue()

    # Images to PDF
    res_pdf = images_to_pdf([img_bytes, img_bytes])
    assert res_pdf["status"] == "success"
    assert res_pdf["page_count"] == 2

    # PDF to Images
    res_img = pdf_to_images(res_pdf["data_url"], img_format="png", dpi=100)
    assert res_img["status"] == "success"
    assert res_img["mode"] == "zip"

def test_sign_stamp():
    pdf = create_sample_pdf(2)
    import PIL.Image
    sig_img = PIL.Image.new("RGBA", (150, 60), color=(0, 0, 0, 0))
    # Draw simple line in signature image
    import PIL.ImageDraw
    draw = PIL.ImageDraw.Draw(sig_img)
    draw.text((10, 20), "Assinatura Teste", fill=(0, 50, 200, 255))
    sig_buf = io.BytesIO()
    sig_img.save(sig_buf, format="PNG")
    sig_bytes = sig_buf.getvalue()

    signatures = [{
        "page_index": 0,
        "image_data": sig_bytes,
        "x": 60,
        "y": 80,
        "width": 30,
        "height": 10,
        "is_percentage": True,
        "opacity": 1.0
    }]
    res = pdf_sign_stamp(pdf, signatures=signatures)
    assert res["status"] == "success"
    assert res["file_size"] > 0

if __name__ == "__main__":
    test_inspect_and_pages()
    print("test_inspect_and_pages PASSED")
    test_merge()
    print("test_merge PASSED")
    test_split()
    print("test_split PASSED")
    test_organize()
    print("test_organize PASSED")
    test_protect_and_unlock()
    print("test_protect_and_unlock PASSED")
    test_compress()
    print("test_compress PASSED")
    test_sign_stamp()
    print("test_sign_stamp PASSED")
    test_images_to_pdf_and_pdf_to_images()
    print("test_images_to_pdf_and_pdf_to_images PASSED")
    print("\nALL PDF TESTS COMPLETED SUCCESSFULLY!")

