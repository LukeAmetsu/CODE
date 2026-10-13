import os
import base64
import json
from typing import Dict, Any, List, Optional, Callable
from .db_manager import TakeoffDB
from .extractor import DrawingExtractor
from .estimator import BudgetEstimator
from .seed_data import ensure_seed_data
from .export_service import export_takeoff_to_excel

# Initialize DB singleton and ensure seed data
db_instance = TakeoffDB()
ensure_seed_data(db_instance)
estimator_instance = BudgetEstimator(db_instance)


def api_upload_and_extract(file_base64: str, filename: str) -> Dict[str, Any]:
    """
    Receives base64 encoded drawing/sheet file (PDF, Excel, image).
    Saves file to storage/drawings and performs intelligent extraction.
    Returns extracted parameters + line items + drawing preview info.
    """
    try:
        # Strip header if data URL like 'data:application/pdf;base64,...'
        if ',' in file_base64:
            file_base64 = file_base64.split(',', 1)[1]

        file_bytes = base64.b64decode(file_base64)
        saved_filename = db_instance.save_drawing_file(filename, file_bytes)

        # Run extraction
        extracted = DrawingExtractor.extract_from_file(file_bytes, filename)
        extracted['drawing_filename'] = saved_filename
        extracted['file_size_kb'] = round(len(file_bytes) / 1024.0, 1)

        return {
            "success": True,
            "data": extracted
        }
    except Exception as e:
        import traceback
        return {
            "success": False,
            "error": str(e),
            "trace": traceback.format_exc()
        }


def api_save_entry(entry_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Saves new or edited entry to the database.
    """
    try:
        entry_id = entry_data.get('id')
        if entry_id and db_instance.get_entry(entry_id):
            updated = db_instance.update_entry(entry_id, entry_data)
            return {"success": True, "entry": updated, "action": "updated"}
        else:
            saved = db_instance.add_entry(entry_data)
            return {"success": True, "entry": saved, "action": "created"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def api_list_entries(category: Optional[str] = None, search: Optional[str] = None, structure_type: Optional[str] = None, review_status: Optional[str] = None, doc_type: Optional[str] = None) -> Dict[str, Any]:
    try:
        entries = db_instance.list_entries(category=category, search=search, structure_type=structure_type, review_status=review_status, doc_type=doc_type)
        stats = db_instance.get_statistics(category=category)
        return {
            "success": True,
            "entries": entries,
            "statistics": stats
        }
    except Exception as e:
        return {"success": False, "error": str(e), "entries": [], "statistics": {}}


def api_get_entry(entry_id: str) -> Dict[str, Any]:
    try:
        from .db_manager import resolve_entry_file_path
        entry = db_instance.get_entry(entry_id)
        if not entry:
            return {"success": False, "error": "Registro não encontrado"}
        # Attach resolved local file existence info
        local_path = resolve_entry_file_path(entry)
        entry['local_file_path'] = local_path
        entry['has_local_file'] = bool(local_path and os.path.isfile(local_path))
        return {"success": True, "entry": entry}
    except Exception as e:
        return {"success": False, "error": str(e)}


def api_open_drawing(entry_id: str) -> Dict[str, Any]:
    """Opens drawing PDF/Excel locally via Windows default app or SharePoint URL."""
    try:
        from .db_manager import resolve_entry_file_path
        entry = db_instance.get_entry(entry_id)
        if not entry:
            return {"success": False, "error": "Registro não encontrado"}

        local_path = resolve_entry_file_path(entry)
        if local_path and os.path.isfile(local_path):
            try:
                os.startfile(local_path)
                return {"success": True, "opened": "local", "path": local_path}
            except Exception as err:
                return {"success": False, "error": f"Erro ao abrir arquivo no Windows: {err}", "path": local_path}

        sp_url = entry.get('sharepoint_url')
        if sp_url:
            import webbrowser
            webbrowser.open(sp_url)
            return {"success": True, "opened": "sharepoint", "url": sp_url}

        return {"success": False, "error": "Arquivo físico ou link do SharePoint não localizado para este registro."}
    except Exception as e:
        return {"success": False, "error": str(e)}


def api_update_review_status(entry_id: str, status: str) -> Dict[str, Any]:
    """Updates review status to 'verified' or 'pending_review'."""
    try:
        updated = db_instance.set_review_status(entry_id, status)
        return {"success": updated, "id": entry_id, "status": status}
    except Exception as e:
        return {"success": False, "error": str(e)}


def api_get_default_onedrive_path() -> Dict[str, Any]:
    """Returns detected OneDrive root directory path."""
    try:
        from .db_manager import get_onedrive_root
        root = get_onedrive_root()
        return {"success": True, "onedrive_root": root, "exists": os.path.exists(root)}
    except Exception as e:
        return {"success": False, "error": str(e), "onedrive_root": ""}


def api_batch_scan(
    folder_path: str,
    recursive: bool = True,
    category: str = "termoeletrica",
    skip_existing: bool = True,
    keyword_filter: Optional[str] = None,
    focus_civil: bool = False,
    max_files: Optional[int] = None,
    on_progress: Optional[Callable] = None
) -> Dict[str, Any]:
    """Scans OneDrive or local folder and imports drawing takeoffs for review."""
    try:
        from .scanner import FolderBatchScanner
        scanner = FolderBatchScanner(db_instance)
        return scanner.scan_and_ingest(
            folder_path=folder_path,
            recursive=recursive,
            default_category=category,
            skip_existing=skip_existing,
            keyword_filter=keyword_filter,
            focus_civil=focus_civil,
            max_files=max_files,
            on_progress=on_progress
        )
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}



def api_delete_entry(entry_id: str) -> Dict[str, Any]:
    try:
        deleted = db_instance.delete_entry(entry_id)
        return {"success": deleted}
    except Exception as e:
        return {"success": False, "error": str(e)}


def api_run_estimate(parameters: Dict[str, Any]) -> Dict[str, Any]:
    try:
        result = estimator_instance.run_estimate(parameters)
        return {"success": True, "estimate": result}
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}


def api_export_excel(category: Optional[str] = None, entry_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    try:
        all_entries = db_instance.list_entries(category=category)
        if entry_ids:
            filtered = [e for e in all_entries if e['id'] in entry_ids]
        else:
            filtered = all_entries

        excel_bytes = export_takeoff_to_excel(filtered, title=f"Quantitativos {category.upper() if category else 'Gerais'}")
        b64 = base64.b64encode(excel_bytes).decode('utf-8')
        return {
            "success": True,
            "filename": f"Quantitativos_{category or 'Geral'}.xlsx",
            "base64": b64
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def create_flask_blueprint():
    """Returns a Flask Blueprint for online cloud server deployment."""
    from flask import Blueprint, request, jsonify, send_from_directory

    bp = Blueprint('takeoff_api', __name__, url_prefix='/api/takeoff')

    @bp.route('/upload', methods=['POST'])
    def upload():
        data = request.json or {}
        res = api_upload_and_extract(data.get('file_base64', ''), data.get('filename', 'arquivo.pdf'))
        return jsonify(res)

    @bp.route('/entries', methods=['GET'])
    def list_all():
        cat = request.args.get('category')
        search = request.args.get('search')
        stype = request.args.get('structure_type')
        status = request.args.get('review_status')
        return jsonify(api_list_entries(cat, search, stype, status))

    @bp.route('/entries', methods=['POST'])
    def save():
        return jsonify(api_save_entry(request.json or {}))

    @bp.route('/entries/<entry_id>', methods=['GET'])
    def get_one(entry_id):
        return jsonify(api_get_entry(entry_id))

    @bp.route('/entries/<entry_id>/open', methods=['POST', 'GET'])
    def open_drawing(entry_id):
        return jsonify(api_open_drawing(entry_id))

    @bp.route('/entries/<entry_id>/status', methods=['POST', 'PUT'])
    def update_status(entry_id):
        data = request.json or {}
        return jsonify(api_update_review_status(entry_id, data.get('status', 'verified')))

    @bp.route('/entries/<entry_id>', methods=['DELETE'])
    def remove(entry_id):
        return jsonify(api_delete_entry(entry_id))

    @bp.route('/batch-scan', methods=['POST'])
    def batch_scan():
        data = request.json or {}
        return jsonify(api_batch_scan(
            folder_path=data.get('folder_path', ''),
            recursive=data.get('recursive', True),
            category=data.get('category', 'termoeletrica'),
            skip_existing=data.get('skip_existing', True)
        ))

    @bp.route('/onedrive-path', methods=['GET'])
    def onedrive_path():
        return jsonify(api_get_default_onedrive_path())

    @bp.route('/estimate', methods=['POST'])
    def estimate():
        return jsonify(api_run_estimate(request.json or {}))

    @bp.route('/export-excel', methods=['POST'])
    def export_xl():
        data = request.json or {}
        return jsonify(api_export_excel(data.get('category'), data.get('entry_ids')))

    @bp.route('/drawings/<path:filename>', methods=['GET'])
    def get_drawing(filename):
        drawings_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../storage/drawings'))
        return send_from_directory(drawings_dir, filename)

    return bp

