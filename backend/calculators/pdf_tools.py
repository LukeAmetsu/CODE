"""
PDF Tools Engine (Smallpdf-like Suite)
Comprehensive, 100% offline, local PDF processing utilities:
- Merge (Juntar PDFs)
- Split (Dividir / Extrair páginas)
- Organize & Rotate (Reordenar, girar e excluir páginas com pré-visualização)
- Unlock (Remover senha / Desproteger)
- Protect (Adicionar senha e permissões)
- Compress (Redução de tamanho inteligente)
- Sign & Stamp (Assinatura digitalizada, rubrica e carimbos visuais)
- PDF to Images (PNG/JPG com alta resolução)
- Images to PDF (Converter imagens em PDF)
"""

import os
import io
import base64
import zipfile
from typing import List, Dict, Any, Optional

try:
    import pymupdf as fitz
except ImportError:
    try:
        import fitz
    except ImportError:
        fitz = None

try:
    import pypdf
except ImportError:
    pypdf = None

from PIL import Image


def _ensure_bytes(data: Any) -> bytes:
    """Helper to convert base64 data URL or raw string/bytes into bytes."""
    if isinstance(data, bytes):
        return data
    if isinstance(data, str):
        if data.startswith("data:") and ";base64," in data:
            data = data.split(";base64,")[1]
        return base64.b64decode(data)
    raise ValueError("Invalid file data type")


def _to_base64_data_url(data_bytes: bytes, mime_type: str = "application/pdf") -> str:
    """Helper to convert bytes into base64 data URL."""
    b64 = base64.b64encode(data_bytes).decode("utf-8")
    return f"data:{mime_type};base64,{b64}"


def parse_page_ranges(range_str: str, max_pages: int) -> List[int]:
    """
    Parses strings like "1-3, 5, 7-10" into 0-indexed list of page indices.
    Validates within [0, max_pages - 1].
    """
    if not range_str or range_str.strip().lower() in ("all", "*", ""):
        return list(range(max_pages))
    
    pages = set()
    parts = range_str.split(",")
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            sub = part.split("-")
            try:
                start = int(sub[0].strip())
                end = int(sub[1].strip())
                for p in range(min(start, end), max(start, end) + 1):
                    if 1 <= p <= max_pages:
                        pages.add(p - 1)
            except ValueError:
                continue
        else:
            try:
                p = int(part)
                if 1 <= p <= max_pages:
                    pages.add(p - 1)
            except ValueError:
                continue
    return sorted(list(pages))


def pdf_inspect(file_data: Any, password: Optional[str] = None) -> Dict[str, Any]:
    """
    Inspects PDF, retrieves page count, dimensions, metadata and visual thumbnails for all pages.
    """
    if not fitz:
        return {"status": "error", "message": "PyMuPDF (fitz) is not installed."}

    try:
        raw_bytes = _ensure_bytes(file_data)
        file_size = len(raw_bytes)

        doc = fitz.open(stream=raw_bytes, filetype="pdf")
        is_encrypted = doc.is_encrypted
        needs_password = False

        if is_encrypted:
            if password:
                auth = doc.authenticate(password)
                if not auth:
                    return {
                        "status": "error",
                        "is_encrypted": True,
                        "needs_password": True,
                        "message": "Senha incorreta."
                    }
            else:
                return {
                    "status": "success",
                    "is_encrypted": True,
                    "needs_password": True,
                    "page_count": 0,
                    "file_size": file_size,
                    "message": "Arquivo protegido por senha."
                }

        page_count = len(doc)
        meta = doc.metadata or {}
        
        pages_info = []
        for i, page in enumerate(doc):
            rect = page.rect
            # Generate small thumbnail (72 dpi, max width ~180px for swift loading)
            zoom = 180.0 / max(rect.width, 1.0)
            zoom = min(max(zoom, 0.2), 1.5)
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img_bytes = pix.tobytes("jpeg")
            thumb_b64 = "data:image/jpeg;base64," + base64.b64encode(img_bytes).decode("utf-8")

            pages_info.append({
                "page_index": i,
                "page_num": i + 1,
                "width": round(rect.width, 2),
                "height": round(rect.height, 2),
                "rotation": page.rotation,
                "thumbnail": thumb_b64
            })

        doc.close()

        return {
            "status": "success",
            "page_count": page_count,
            "file_size": file_size,
            "is_encrypted": is_encrypted,
            "needs_password": False,
            "metadata": {
                "title": meta.get("title", ""),
                "author": meta.get("author", ""),
                "creator": meta.get("creator", ""),
                "producer": meta.get("producer", ""),
                "creation_date": meta.get("creationDate", "")
            },
            "pages": pages_info
        }
    except Exception as e:
        return {"status": "error", "message": f"Erro ao analisar PDF: {str(e)}"}


def pdf_merge(files_data: List[Dict[str, Any]], output_name: str = "merged.pdf") -> Dict[str, Any]:
    """
    Merges multiple PDF files into one.
    Each item in files_data: {"file_data": bytes/b64, "page_ranges": "all"|"1-3,5", "password": ""}
    """
    if not fitz:
        return {"status": "error", "message": "PyMuPDF (fitz) is not installed."}

    if not files_data or len(files_data) < 1:
        return {"status": "error", "message": "Nenhum arquivo fornecido para mesclagem."}

    try:
        merged_doc = fitz.open()
        total_pages = 0

        for item in files_data:
            raw = _ensure_bytes(item["file_data"])
            pwd = item.get("password")
            src_doc = fitz.open(stream=raw, filetype="pdf")
            if src_doc.is_encrypted:
                if not pwd or not src_doc.authenticate(pwd):
                    return {"status": "error", "message": f"Arquivo protegido com senha não informada ou incorreta."}

            ranges_str = item.get("page_ranges", "all")
            selected_pages = parse_page_ranges(ranges_str, len(src_doc))

            for p_idx in selected_pages:
                merged_doc.insert_pdf(src_doc, from_page=p_idx, to_page=p_idx)
                total_pages += 1

            src_doc.close()

        out_buffer = io.BytesIO()
        merged_doc.save(out_buffer, garbage=3, deflate=True)
        merged_doc.close()
        out_bytes = out_buffer.getvalue()

        return {
            "status": "success",
            "file_name": output_name,
            "file_size": len(out_bytes),
            "page_count": total_pages,
            "data_url": _to_base64_data_url(out_bytes)
        }
    except Exception as e:
        return {"status": "error", "message": f"Erro ao mesclar PDFs: {str(e)}"}


def pdf_split(file_data: Any, mode: str = "extract", ranges: str = "1", fixed_every_n: int = 1, password: Optional[str] = None) -> Dict[str, Any]:
    """
    Splits PDF.
    Modes:
    - 'extract': extracts given ranges (e.g. '1-3, 5') into a single combined PDF.
    - 'separate': splits selected (or all) pages into individual 1-page PDFs packaged in a ZIP.
    - 'by_interval': splits every N pages into separate PDFs in a ZIP.
    """
    if not fitz:
        return {"status": "error", "message": "PyMuPDF (fitz) is not installed."}

    try:
        raw = _ensure_bytes(file_data)
        src_doc = fitz.open(stream=raw, filetype="pdf")
        if src_doc.is_encrypted:
            if not password or not src_doc.authenticate(password):
                return {"status": "error", "message": "PDF com senha não informada ou incorreta."}

        num_pages = len(src_doc)
        if num_pages == 0:
            return {"status": "error", "message": "O PDF não possui páginas."}

        if mode == "extract":
            pages_to_extract = parse_page_ranges(ranges, num_pages)
            if not pages_to_extract:
                return {"status": "error", "message": "Nenhuma página válida informada para extração."}

            out_doc = fitz.open()
            for p in pages_to_extract:
                out_doc.insert_pdf(src_doc, from_page=p, to_page=p)

            buf = io.BytesIO()
            out_doc.save(buf, garbage=3, deflate=True)
            out_doc.close()
            src_doc.close()
            out_bytes = buf.getvalue()

            return {
                "status": "success",
                "mode": "single_file",
                "file_name": "extraido.pdf",
                "page_count": len(pages_to_extract),
                "file_size": len(out_bytes),
                "data_url": _to_base64_data_url(out_bytes)
            }

        elif mode in ("separate", "by_interval"):
            zip_buf = io.BytesIO()
            with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zipf:
                if mode == "separate":
                    pages_to_split = parse_page_ranges(ranges, num_pages) if ranges else list(range(num_pages))
                    for idx in pages_to_split:
                        part_doc = fitz.open()
                        part_doc.insert_pdf(src_doc, from_page=idx, to_page=idx)
                        part_buf = io.BytesIO()
                        part_doc.save(part_buf, garbage=3, deflate=True)
                        part_doc.close()
                        zipf.writestr(f"pagina_{idx + 1:03d}.pdf", part_buf.getvalue())
                else:  # by_interval
                    n = max(1, int(fixed_every_n))
                    part_num = 1
                    for start_idx in range(0, num_pages, n):
                        end_idx = min(start_idx + n - 1, num_pages - 1)
                        part_doc = fitz.open()
                        part_doc.insert_pdf(src_doc, from_page=start_idx, to_page=end_idx)
                        part_buf = io.BytesIO()
                        part_doc.save(part_buf, garbage=3, deflate=True)
                        part_doc.close()
                        zipf.writestr(f"parte_{part_num:03d}_p{start_idx+1}-p{end_idx+1}.pdf", part_buf.getvalue())
                        part_num += 1

            src_doc.close()
            zip_bytes = zip_buf.getvalue()

            return {
                "status": "success",
                "mode": "zip",
                "file_name": "paginas_divididas.zip",
                "file_size": len(zip_bytes),
                "data_url": _to_base64_data_url(zip_bytes, mime_type="application/zip")
            }
        else:
            return {"status": "error", "message": f"Modo de divisão desconhecido: {mode}"}

    except Exception as e:
        return {"status": "error", "message": f"Erro ao dividir PDF: {str(e)}"}


def pdf_organize(file_data: Any, operations: List[Dict[str, Any]], password: Optional[str] = None) -> Dict[str, Any]:
    """
    Reorganize, rotate and delete pages.
    operations is a list of page dicts:
    [
      {"source_index": 0, "rotation": 90, "delete": False},
      {"source_index": 2, "rotation": 0, "delete": False},
      ...
    ]
    """
    if not fitz:
        return {"status": "error", "message": "PyMuPDF (fitz) is not installed."}

    try:
        raw = _ensure_bytes(file_data)
        src_doc = fitz.open(stream=raw, filetype="pdf")
        if src_doc.is_encrypted:
            if not password or not src_doc.authenticate(password):
                return {"status": "error", "message": "PDF com senha não informada ou incorreta."}

        num_pages = len(src_doc)
        out_doc = fitz.open()

        count = 0
        for op in operations:
            if op.get("delete", False):
                continue
            src_idx = int(op["source_index"])
            if 0 <= src_idx < num_pages:
                out_doc.insert_pdf(src_doc, from_page=src_idx, to_page=src_idx)
                new_page = out_doc[-1]
                rot = op.get("rotation", 0)
                if rot:
                    new_page.set_rotation((new_page.rotation + rot) % 360)
                count += 1

        if count == 0:
            return {"status": "error", "message": "Não restaram páginas no documento resultante."}

        buf = io.BytesIO()
        out_doc.save(buf, garbage=3, deflate=True)
        out_doc.close()
        src_doc.close()
        out_bytes = buf.getvalue()

        return {
            "status": "success",
            "file_name": "organizado.pdf",
            "page_count": count,
            "file_size": len(out_bytes),
            "data_url": _to_base64_data_url(out_bytes)
        }
    except Exception as e:
        return {"status": "error", "message": f"Erro ao organizar PDF: {str(e)}"}


def pdf_unlock(file_data: Any, password: str) -> Dict[str, Any]:
    """
    Removes password protection from a protected PDF.
    """
    if not fitz:
        return {"status": "error", "message": "PyMuPDF (fitz) is not installed."}

    try:
        raw = _ensure_bytes(file_data)
        doc = fitz.open(stream=raw, filetype="pdf")
        if not doc.is_encrypted:
            return {
                "status": "success",
                "message": "Este arquivo não possui proteção por senha.",
                "file_name": "desbloqueado.pdf",
                "file_size": len(raw),
                "data_url": _to_base64_data_url(raw)
            }

        auth = doc.authenticate(password)
        if not auth:
            return {"status": "error", "message": "Senha incorreta. Não foi possível desbloquear o PDF."}

        buf = io.BytesIO()
        doc.save(buf, encryption=fitz.PDF_ENCRYPT_NONE, garbage=3, deflate=True)
        doc.close()
        out_bytes = buf.getvalue()

        return {
            "status": "success",
            "message": "PDF desbloqueado com sucesso!",
            "file_name": "desbloqueado.pdf",
            "file_size": len(out_bytes),
            "data_url": _to_base64_data_url(out_bytes)
        }
    except Exception as e:
        return {"status": "error", "message": f"Erro ao desbloquear PDF: {str(e)}"}


def pdf_protect(file_data: Any, user_password: str, owner_password: Optional[str] = None, allow_printing: bool = True, allow_copying: bool = True) -> Dict[str, Any]:
    """
    Adds 256-bit AES password encryption to a PDF.
    """
    if not fitz:
        return {"status": "error", "message": "PyMuPDF (fitz) is not installed."}

    if not user_password:
        return {"status": "error", "message": "A senha de abertura não pode ser vazia."}

    try:
        raw = _ensure_bytes(file_data)
        doc = fitz.open(stream=raw, filetype="pdf")
        
        # Calculate permissions bitmask
        perm = fitz.PDF_PERM_ACCESSIBILITY
        if allow_printing:
            perm |= fitz.PDF_PERM_PRINT
        if allow_copying:
            perm |= fitz.PDF_PERM_COPY

        buf = io.BytesIO()
        owner_pw = owner_password or user_password
        doc.save(
            buf,
            encryption=fitz.PDF_ENCRYPT_AES_256,
            user_pw=user_password,
            owner_pw=owner_pw,
            permissions=perm,
            deflate=True
        )
        doc.close()
        out_bytes = buf.getvalue()

        return {
            "status": "success",
            "message": "PDF protegido com criptografia AES-256 com sucesso!",
            "file_name": "protegido.pdf",
            "file_size": len(out_bytes),
            "data_url": _to_base64_data_url(out_bytes)
        }
    except Exception as e:
        return {"status": "error", "message": f"Erro ao proteger PDF: {str(e)}"}


def pdf_compress(file_data: Any, level: str = "medium", password: Optional[str] = None) -> Dict[str, Any]:
    """
    Compresses PDF using PyMuPDF and Pillow image recompression.
    Levels:
    - 'low': lossless stream deflation, deduplication
    - 'medium': balances high readability with image recompression (~80% quality, 150 dpi)
    - 'high': strong compression, downscales images (~60% quality, 100 dpi)
    """
    if not fitz:
        return {"status": "error", "message": "PyMuPDF (fitz) is not installed."}

    try:
        raw = _ensure_bytes(file_data)
        orig_size = len(raw)
        doc = fitz.open(stream=raw, filetype="pdf")
        if doc.is_encrypted:
            if not password or not doc.authenticate(password):
                return {"status": "error", "message": "PDF protegido com senha não informada ou incorreta."}

        # If medium or high, recompress internal raster images
        if level in ("medium", "high"):
            quality = 65 if level == "high" else 82
            max_dim = 1200 if level == "high" else 1800

            for page in doc:
                img_list = page.get_images(full=True)
                for img_info in img_list:
                    xref = img_info[0]
                    base_image = doc.extract_image(xref)
                    if not base_image:
                        continue
                    
                    img_bytes = base_image.get("image")
                    ext = base_image.get("ext", "").lower()
                    if not img_bytes or ext not in ("png", "jpeg", "jpg", "webp", "tiff", "bmp"):
                        continue

                    try:
                        pil_img = Image.open(io.BytesIO(img_bytes))
                        orig_w, orig_h = pil_img.size
                        
                        # Downscale if larger than max_dim
                        if max(orig_w, orig_h) > max_dim:
                            scale = max_dim / float(max(orig_w, orig_h))
                            new_size = (int(orig_w * scale), int(orig_h * scale))
                            pil_img = pil_img.resize(new_size, Image.Resampling.LANCZOS)

                        # Convert RGBA to RGB for JPEG compression if no alpha
                        out_img_buf = io.BytesIO()
                        if pil_img.mode in ("RGBA", "LA") or (pil_img.mode == "P" and "transparency" in pil_img.info):
                            # Keep PNG with optimize
                            pil_img.save(out_img_buf, format="PNG", optimize=True)
                        else:
                            if pil_img.mode != "RGB":
                                pil_img = pil_img.convert("RGB")
                            pil_img.save(out_img_buf, format="JPEG", quality=quality, optimize=True)
                        
                        new_img_bytes = out_img_buf.getvalue()
                        # Only replace if newly compressed image is actually smaller
                        if len(new_img_bytes) < len(img_bytes):
                            doc.update_stream(xref, new_img_bytes)
                    except Exception:
                        continue

        buf = io.BytesIO()
        doc.save(
            buf,
            garbage=4,
            deflate=True,
            deflate_images=True,
            deflate_fonts=True,
            clean=True
        )
        doc.close()
        out_bytes = buf.getvalue()
        new_size = len(out_bytes)

        # In rare cases where compression resulted in slightly bigger file, fall back to deflated original
        if new_size > orig_size:
            out_bytes = raw
            new_size = orig_size

        saved_percent = round((1.0 - (new_size / max(orig_size, 1))) * 100, 1)

        return {
            "status": "success",
            "file_name": "comprimido.pdf",
            "original_size": orig_size,
            "new_size": new_size,
            "saved_percentage": saved_percent,
            "data_url": _to_base64_data_url(out_bytes)
        }
    except Exception as e:
        return {"status": "error", "message": f"Erro ao comprimir PDF: {str(e)}"}


def pdf_sign_stamp(file_data: Any, signatures: List[Dict[str, Any]], password: Optional[str] = None) -> Dict[str, Any]:
    """
    Overlays signatures, stamps, initials, or text watermarks onto PDF pages.
    Each signature dict:
    {
      "page_index": 0,
      "image_data": base64 string or data URL,
      "x": float (percentage 0-100 or points),
      "y": float (percentage 0-100 or points),
      "width": float (percentage or points),
      "height": float (percentage or points),
      "is_percentage": True/False,
      "opacity": float (0.0 to 1.0)
    }
    """
    if not fitz:
        return {"status": "error", "message": "PyMuPDF (fitz) is not installed."}

    try:
        raw = _ensure_bytes(file_data)
        doc = fitz.open(stream=raw, filetype="pdf")
        if doc.is_encrypted:
            if not password or not doc.authenticate(password):
                return {"status": "error", "message": "PDF protegido com senha não informada ou incorreta."}

        num_pages = len(doc)
        for sig in signatures:
            p_idx = int(sig.get("page_index", 0))
            if not (0 <= p_idx < num_pages):
                continue

            page = doc[p_idx]
            page_rect = page.rect
            img_raw = _ensure_bytes(sig["image_data"])

            is_pct = sig.get("is_percentage", True)
            x_val = float(sig.get("x", 10))
            y_val = float(sig.get("y", 10))
            w_val = float(sig.get("width", 20))
            h_val = float(sig.get("height", 10))

            if is_pct:
                x0 = (x_val / 100.0) * page_rect.width
                y0 = (y_val / 100.0) * page_rect.height
                w = (w_val / 100.0) * page_rect.width
                h = (h_val / 100.0) * page_rect.height
            else:
                x0 = x_val
                y0 = y_val
                w = w_val
                h = h_val

            target_rect = fitz.Rect(x0, y0, x0 + w, y0 + h)
            opacity = float(sig.get("opacity", 1.0))
            page.insert_image(target_rect, stream=img_raw, keep_proportion=True, overlay=True)

        buf = io.BytesIO()
        doc.save(buf, garbage=3, deflate=True)
        doc.close()
        out_bytes = buf.getvalue()

        return {
            "status": "success",
            "file_name": "assinado.pdf",
            "file_size": len(out_bytes),
            "data_url": _to_base64_data_url(out_bytes)
        }
    except Exception as e:
        return {"status": "error", "message": f"Erro ao aplicar assinatura: {str(e)}"}


def pdf_to_images(file_data: Any, img_format: str = "png", dpi: int = 150, password: Optional[str] = None) -> Dict[str, Any]:
    """
    Converts PDF pages into images. If single page, returns direct image data url.
    If multiple pages, packs into a ZIP file.
    """
    if not fitz:
        return {"status": "error", "message": "PyMuPDF (fitz) is not installed."}

    try:
        raw = _ensure_bytes(file_data)
        doc = fitz.open(stream=raw, filetype="pdf")
        if doc.is_encrypted:
            if not password or not doc.authenticate(password):
                return {"status": "error", "message": "PDF protegido com senha não informada ou incorreta."}

        num_pages = len(doc)
        if num_pages == 0:
            return {"status": "error", "message": "PDF vazio."}

        fmt = img_format.lower()
        if fmt not in ("png", "jpeg", "jpg"):
            fmt = "png"
        save_fmt = "jpeg" if fmt in ("jpeg", "jpg") else "png"

        scale = float(dpi) / 72.0
        mat = fitz.Matrix(scale, scale)

        if num_pages == 1:
            pix = doc[0].get_pixmap(matrix=mat, alpha=False)
            img_bytes = pix.tobytes(save_fmt)
            doc.close()
            mime = "image/jpeg" if save_fmt == "jpeg" else "image/png"
            return {
                "status": "success",
                "mode": "single_image",
                "file_name": f"pagina_1.{fmt}",
                "file_size": len(img_bytes),
                "data_url": _to_base64_data_url(img_bytes, mime_type=mime)
            }

        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zipf:
            for idx, page in enumerate(doc):
                pix = page.get_pixmap(matrix=mat, alpha=False)
                img_bytes = pix.tobytes(save_fmt)
                zipf.writestr(f"pagina_{idx + 1:03d}.{fmt}", img_bytes)

        doc.close()
        zip_bytes = zip_buf.getvalue()

        return {
            "status": "success",
            "mode": "zip",
            "file_name": "pdf_imagens.zip",
            "page_count": num_pages,
            "file_size": len(zip_bytes),
            "data_url": _to_base64_data_url(zip_bytes, mime_type="application/zip")
        }
    except Exception as e:
        return {"status": "error", "message": f"Erro ao converter PDF em imagens: {str(e)}"}


def images_to_pdf(images_data: List[Any], orientation: str = "auto", fit_mode: str = "contain") -> Dict[str, Any]:
    """
    Converts a list of images into a single clean PDF document.
    """
    if not fitz:
        return {"status": "error", "message": "PyMuPDF (fitz) is not installed."}

    if not images_data or len(images_data) < 1:
        return {"status": "error", "message": "Nenhuma imagem informada."}

    try:
        out_doc = fitz.open()

        for item in images_data:
            img_raw = _ensure_bytes(item)
            pil_img = Image.open(io.BytesIO(img_raw))
            w_px, h_px = pil_img.size

            # Standard A4 in points: 595.28 x 841.89
            a4_w, a4_h = 595.3, 841.9
            if orientation == "portrait":
                page_w, page_h = min(a4_w, a4_h), max(a4_w, a4_h)
            elif orientation == "landscape":
                page_w, page_h = max(a4_w, a4_h), min(a4_w, a4_h)
            else:  # auto
                if w_px > h_px:
                    page_w, page_h = max(a4_w, a4_h), min(a4_w, a4_h)
                else:
                    page_w, page_h = min(a4_w, a4_h), max(a4_w, a4_h)

            page = out_doc.new_page(width=page_w, height=page_h)
            
            # Margins (20 pt)
            margin = 20.0
            avail_w = page_w - (2 * margin)
            avail_h = page_h - (2 * margin)

            scale = min(avail_w / max(w_px, 1), avail_h / max(h_px, 1))
            dest_w = w_px * scale
            dest_h = h_px * scale

            # Center on page
            x0 = margin + (avail_w - dest_w) / 2.0
            y0 = margin + (avail_h - dest_h) / 2.0
            dest_rect = fitz.Rect(x0, y0, x0 + dest_w, y0 + dest_h)

            page.insert_image(dest_rect, stream=img_raw, keep_proportion=True)

        buf = io.BytesIO()
        out_doc.save(buf, garbage=3, deflate=True)
        out_doc.close()
        out_bytes = buf.getvalue()

        return {
            "status": "success",
            "file_name": "imagens_unidas.pdf",
            "page_count": len(images_data),
            "file_size": len(out_bytes),
            "data_url": _to_base64_data_url(out_bytes)
        }
    except Exception as e:
        return {"status": "error", "message": f"Erro ao converter imagens em PDF: {str(e)}"}
