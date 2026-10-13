import os
import re
import uuid
import datetime
import time
from typing import Dict, Any, List, Optional, Callable
from .db_manager import TakeoffDB, get_onedrive_root
from .extractor import DrawingExtractor


class FolderBatchScanner:
    """
    Automated scanner for OneDrive and local project directories.
    Discovers engineering drawing PDFs and Excel sheets, extracts material takeoffs,
    and populates the TakeoffDB as 'pending_review' for user verification.
    """

    SUPPORTED_EXTENSIONS = {'.pdf', '.xlsx', '.xls'}
    
    # Folders commonly belonging to other disciplines that can be skipped when focusing on civil/structures
    NON_CIVIL_FOLDER_PATTERNS = [
        'srel', 'electrical', 'eletrica', 'subestacao_eletrica',
        'srme', 'mechanical', 'mecanica', 'tubulacao', 'piping',
        'srin', 'instrumentation', 'instrumentacao', 'automacao',
        'srpr', 'process', 'processo',
        'srqa', 'quality', 'qualidade',
        'srcp', 'scheduling', 'cronograma',
        'srdp', 'management', 'gerenciamento',
        'reunioes', 'atas', 'comercial', 'contratos',
        'pdfsexp', 'pdfsam', 'books', 'vendors', 'painel de controle', 'pacote vendors'
    ]

    def __init__(self, db: Optional[TakeoffDB] = None):
        self.db = db or TakeoffDB()
        self._cancel_requested = False

    def cancel(self):
        """Signals the scanner to stop running as soon as possible."""
        self._cancel_requested = True

    def discover_files(
        self,
        root_dir: str,
        recursive: bool = True,
        keyword_filter: Optional[str] = None,
        focus_civil: bool = False,
        on_progress: Optional[Callable[[str], None]] = None
    ) -> List[str]:
        """
        Finds all supported engineering drawing files in directory.
        Provides live progress reporting as deep subfolders are crawled.
        """
        found = []
        if not os.path.exists(root_dir):
            return found

        kw = keyword_filter.strip().lower() if keyword_filter else None

        if not recursive:
            try:
                for fname in os.listdir(root_dir):
                    fpath = os.path.join(root_dir, fname)
                    if os.path.isfile(fpath) and os.path.splitext(fname)[1].lower() in self.SUPPORTED_EXTENSIONS:
                        if kw and kw not in fname.lower():
                            continue
                        found.append(fpath)
            except Exception:
                pass
            return sorted(found)

        scanned_dirs = 0
        last_progress_time = time.time()

        for dirpath, dirnames, filenames in os.walk(root_dir):
            if self._cancel_requested:
                break

            scanned_dirs += 1

            # Prune non-civil directories if focused
            if focus_civil:
                # Modify dirnames in-place to prevent os.walk from recursing into non-civil disciplines
                dirnames[:] = [
                    d for d in dirnames 
                    if not any(pat in d.lower() for pat in self.NON_CIVIL_FOLDER_PATTERNS)
                ]

            for fname in filenames:
                ext = os.path.splitext(fname)[1].lower()
                if ext in self.SUPPORTED_EXTENSIONS:
                    # Skip temporary office lock files
                    if fname.startswith('~$') or fname.startswith('.'):
                        continue

                    full_path = os.path.join(dirpath, fname)
                    
                    # Apply keyword filter against filename or folder name
                    if kw:
                        check_target = (fname + " " + dirpath).lower()
                        if kw not in check_target:
                            continue

                    found.append(full_path)

            # Update discovery feedback every ~0.35 seconds or 25 dirs
            now = time.time()
            if on_progress and (now - last_progress_time > 0.35 or scanned_dirs % 25 == 0):
                last_progress_time = now
                curr_folder = os.path.basename(dirpath) or dirpath
                on_progress(f"Mapeando pastas... {len(found)} pranchas encontradas ({scanned_dirs} pastas analisadas: {curr_folder[:35]})")

        return sorted(found)

    def compute_relative_path(self, full_path: str, scan_root: str) -> str:
        """
        Determines canonical relative path:
        1. If inside OneDrive root, relative to OneDrive root.
        2. Otherwise relative to scan_root.
        """
        od_root = get_onedrive_root()
        try:
            if os.path.commonpath([full_path, od_root]) == od_root:
                return os.path.relpath(full_path, od_root).replace('\\', '/')
        except Exception:
            pass

        try:
            return os.path.relpath(full_path, scan_root).replace('\\', '/')
        except Exception:
            return os.path.basename(full_path)

    def infer_metadata_from_path(self, full_path: str) -> Dict[str, str]:
        """Infers Project Name and Category from directory naming conventions."""
        inferred = {}
        parts = full_path.replace('\\', '/').split('/')
        filename = parts[-1] if parts else ""

        # Category heuristics
        path_lower = full_path.lower()
        if any(w in path_lower for w in ['lt ', 'lt-', 'linha', 'transmissao', 'torre', 'subestacao', 'se ']):
            inferred['category'] = 'linha_transmissao'
        elif any(w in path_lower for w in ['ute', 'termo', 'turbogerador', 'caldeira', 'ciclo combinado', 'tg-']):
            inferred['category'] = 'termoeletrica'

        # Project name heuristics: inspect ancestor folder names
        for folder in reversed(parts[:-1]):
            clean = folder.strip()
            # Ignore generic folder names
            ignore_names = (
                'drawings', 'pranchas', 'projetos', 'pdf', 'rev', 'civil',
                '00_planta', '01_planta', 'planta', 'plantas', 'estrutural',
                'fundacoes', 'documentos', 'pdfsexp', '01-projetos'
            )
            if len(clean) > 3 and clean.lower() not in ignore_names and not clean.startswith(('00.', '01.', '02.', '03.')):
                inferred['project_name'] = clean
                break

        return inferred

    def scan_and_ingest(
        self,
        folder_path: str,
        recursive: bool = True,
        default_category: str = "termoeletrica",
        skip_existing: bool = True,
        keyword_filter: Optional[str] = None,
        focus_civil: bool = False,
        max_files: Optional[int] = None,
        doc_type_filter: Optional[str] = None,
        on_progress: Optional[Callable[[int, str, Optional[Dict[str, Any]]], None]] = None
    ) -> Dict[str, Any]:
        """
        Scans folder, parses each document, and saves records into DB with 'pending_review' status.
        Supports cancellation and dynamic real-time progress.
        """
        self._cancel_requested = False
        folder_path = os.path.abspath(folder_path)
        if not os.path.exists(folder_path):
            return {
                "success": False,
                "error": f"Pasta não encontrada: {folder_path}",
                "total_found": 0,
                "imported": 0,
                "skipped": 0,
                "errors": []
            }

        # Step 1: Discover files with live feedback
        if on_progress:
            mode_desc = "busca recursiva profunda" if recursive else "busca apenas na pasta raiz"
            on_progress(0, f"Iniciando {mode_desc} em: {os.path.basename(folder_path)}...", None)

        def _disc_progress(msg: str):
            if on_progress:
                on_progress(0, msg, None)

        files = self.discover_files(
            folder_path,
            recursive=recursive,
            keyword_filter=keyword_filter,
            focus_civil=focus_civil,
            on_progress=_disc_progress
        )

        if self._cancel_requested:
            return {
                "success": True,
                "message": "Varredura interrompida pelo usuário.",
                "total_found": len(files),
                "imported": 0,
                "skipped": 0,
                "errors": []
            }

        total_files = len(files)
        if total_files == 0:
            subdirs = []
            try:
                subdirs = [d for d in os.listdir(folder_path) if os.path.isdir(os.path.join(folder_path, d)) and not d.startswith('.')]
            except Exception:
                pass

            if not recursive and subdirs:
                sample_dirs = ", ".join(subdirs[:4])
                msg = (
                    f"Nenhum arquivo encontrado diretamente na raiz da pasta. "
                    f"Foram detectadas {len(subdirs)} subpastas ({sample_dirs}...). "
                    f"Para ler as pranchas contidas nelas, ative a opção 'Varredura recursiva' e inicie novamente."
                )
            else:
                msg = "Nenhum arquivo PDF ou Excel correspondente encontrado na pasta selecionada."

            return {
                "success": True,
                "message": msg,
                "total_found": 0,
                "imported": 0,
                "skipped": 0,
                "errors": [],
                "entries": [],
                "has_subdirs": bool(subdirs),
                "subdirs_count": len(subdirs)
            }

        if max_files and max_files > 0 and total_files > max_files:
            files = files[:max_files]
            total_files = len(files)

        imported_entries = []
        skipped_count = 0
        errors = []

        existing_entries = self.db.list_entries()
        existing_codes = {e.get('drawing_code', '').strip().upper() for e in existing_entries if e.get('drawing_code')}
        existing_relpaths = {e.get('relative_path', '').strip().lower() for e in existing_entries if e.get('relative_path')}

        if on_progress:
            on_progress(1, f"Encontradas {total_files} pranchas. Iniciando extração de dados...", None)

        for idx, file_path in enumerate(files):
            if self._cancel_requested:
                if on_progress:
                    on_progress(int((idx / total_files) * 100), f"Varredura interrompida! {len(imported_entries)} pranchas salvas.", None)
                break

            filename = os.path.basename(file_path)
            rel_path = self.compute_relative_path(file_path, folder_path)
            pct = max(1, min(99, int(((idx + 1) / total_files) * 100)))

            # Check if already in DB
            code_candidate = os.path.splitext(filename)[0].strip().upper()
            if skip_existing and (rel_path.strip().lower() in existing_relpaths or code_candidate in existing_codes):
                skipped_count += 1
                if on_progress and (skipped_count % 15 == 0 or idx == total_files - 1):
                    on_progress(pct, f"Progresso: {idx + 1}/{total_files} ({len(imported_entries)} novas, {skipped_count} já cadastradas)...", None)
                continue

            if on_progress:
                on_progress(pct, f"Analisando ({idx + 1}/{total_files}): {filename[:45]}...", None)

            try:
                # Open with safe handling
                with open(file_path, 'rb') as f:
                    file_bytes = f.read()

                # Extract parameters and materials table
                extracted = DrawingExtractor.extract_from_file(file_bytes, filename)

                # Filter by doc_type if requested
                if doc_type_filter and doc_type_filter.lower() not in ['todas', 'todos', 'all']:
                    if extracted.get('doc_type', 'desenho').lower() != doc_type_filter.lower():
                        skipped_count += 1
                        continue

                inferred = self.infer_metadata_from_path(file_path)

                # Merge path inferences if extractor returned defaults
                if extracted.get('project_name') in ['Novo Projeto', 'Sem Projeto', '']:
                    extracted['project_name'] = inferred.get('project_name', 'Projeto Identificado na Pasta')

                if not extracted.get('category') or extracted.get('category') == 'termoeletrica':
                    if 'category' in inferred:
                        extracted['category'] = inferred['category']
                    elif default_category:
                        extracted['category'] = default_category

                extracted['relative_path'] = rel_path
                extracted['source_folder'] = folder_path
                extracted['drawing_filename'] = filename
                extracted['review_status'] = 'pending_review'  # Requires review
                extracted['created_by'] = 'Varredura Automática de Pastas'

                # Save copy to local drawings cache for fast thumbnail/viewing
                try:
                    self.db.save_drawing_file(filename, file_bytes)
                except Exception:
                    pass

                saved_entry = self.db.add_entry(extracted)
                imported_entries.append(saved_entry)

                # Keep local set updated to avoid duplicate sub-revisions
                existing_codes.add(code_candidate)
                existing_relpaths.add(rel_path.strip().lower())

                if on_progress:
                    entry_summary = {
                        "equipment": saved_entry.get('equipment_name', filename),
                        "code": saved_entry.get('drawing_code', code_candidate),
                        "vol": saved_entry.get('concrete_volume_m3', 0)
                    }
                    on_progress(
                        pct,
                        f"Importado ({idx + 1}/{total_files}): {filename[:40]}",
                        entry_summary
                    )

            except Exception as e:
                errors.append({"file": filename, "error": str(e)})

        return {
            "success": True,
            "total_found": total_files,
            "imported": len(imported_entries),
            "skipped": skipped_count,
            "errors": errors,
            "entries_count": len(imported_entries),
            "cancelled": self._cancel_requested
        }
