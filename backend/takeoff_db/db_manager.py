import sqlite3
import json
import os
import uuid
import datetime
from typing import Dict, Any, List, Optional

DB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../storage'))
DB_PATH = os.path.join(DB_DIR, 'takeoff_database.db')
JSON_PATH = os.path.join(DB_DIR, 'takeoff_database.json')
DRAWINGS_DIR = os.path.join(DB_DIR, 'drawings')

os.makedirs(DB_DIR, exist_ok=True)
os.makedirs(DRAWINGS_DIR, exist_ok=True)


class TakeoffDB:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS takeoff_entries (
                    id TEXT PRIMARY KEY,
                    category TEXT NOT NULL,           -- 'termoeletrica' or 'linha_transmissao'
                    sub_category TEXT,                -- 'Turbogerador', 'Transformador', 'Torre Suspensao', etc.
                    project_name TEXT NOT NULL,       -- 'UTE Porto de Sergipe', 'LT 500kV Tucuruí-Manaus', etc.
                    equipment_name TEXT NOT NULL,     -- 'Bloco TG-01', 'Torre T120 Ancoragem', etc.
                    structure_type TEXT,              -- 'Bloco Maciço', 'Sapata Isolada', 'Grelha Metálica', etc.
                    drawing_code TEXT,                -- 'DE-4020-001', 'LT-DWG-500-12', etc.
                    revision TEXT DEFAULT '0',        -- 'Rev. A', 'Rev. 01'
                    drawing_filename TEXT,            -- stored filename in storage/drawings
                    relative_path TEXT,               -- relative path from OneDrive or project folder
                    sharepoint_url TEXT,              -- cloud web link (SharePoint/OneDrive)
                    review_status TEXT DEFAULT 'verified', -- 'pending_review' or 'verified'
                    source_folder TEXT,               -- root folder where file was scanned from
                    soil_condition TEXT,              -- 'Solo Normal', 'Solo Mole', 'Rocha Branda', 'Rocha Sã'
                    fck_concrete REAL DEFAULT 30.0,   -- MPa
                    steel_type TEXT DEFAULT 'CA-50',  -- 'CA-50', 'CA-60'
                    concrete_volume_m3 REAL DEFAULT 0.0,
                    steel_weight_kg REAL DEFAULT 0.0,
                    formwork_area_m2 REAL DEFAULT 0.0,
                    excavation_m3 REAL DEFAULT 0.0,
                    backfill_m3 REAL DEFAULT 0.0,
                    lean_concrete_m3 REAL DEFAULT 0.0,
                    anchor_bolts_kg REAL DEFAULT 0.0,
                    pile_count INTEGER DEFAULT 0,
                    pile_diameter_cm REAL DEFAULT 0.0,
                    pile_depth_m REAL DEFAULT 0.0,
                    steel_ratio_kg_m3 REAL DEFAULT 0.0,
                    formwork_ratio_m2_m3 REAL DEFAULT 0.0,
                    notes TEXT,
                    line_items_json TEXT,             -- JSON string of individual materials
                    raw_extracted_text TEXT,
                    doc_type TEXT DEFAULT 'desenho',  -- 'desenho', 'memorial_calculo', 'croqui', 'relatorio_tecnico', etc.
                    created_by TEXT DEFAULT 'Engenharia',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            # Automatic schema migration for existing databases
            migrations = [
                ("relative_path", "TEXT"),
                ("sharepoint_url", "TEXT"),
                ("review_status", "TEXT DEFAULT 'verified'"),
                ("source_folder", "TEXT"),
                ("doc_type", "TEXT DEFAULT 'desenho'")
            ]
            for col_name, col_type in migrations:
                try:
                    cursor.execute(f"ALTER TABLE takeoff_entries ADD COLUMN {col_name} {col_type}")
                except Exception:
                    pass

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_takeoff_category ON takeoff_entries(category);
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_takeoff_project ON takeoff_entries(project_name);
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_takeoff_equipment ON takeoff_entries(equipment_name);
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_takeoff_review_status ON takeoff_entries(review_status);
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_takeoff_doctype ON takeoff_entries(doc_type);
            """)
            conn.commit()

    def _calc_ratios(self, data: Dict[str, Any]) -> Dict[str, Any]:
        vol = float(data.get('concrete_volume_m3') or 0.0)
        steel = float(data.get('steel_weight_kg') or 0.0)
        formwork = float(data.get('formwork_area_m2') or 0.0)

        if vol > 0.001:
            data['steel_ratio_kg_m3'] = round(steel / vol, 2)
            data['formwork_ratio_m2_m3'] = round(formwork / vol, 2)
        else:
            data['steel_ratio_kg_m3'] = 0.0
            data['formwork_ratio_m2_m3'] = 0.0
        return data

    def save_drawing_file(self, filename: str, content_bytes: bytes) -> str:
        safe_name = f"{uuid.uuid4().hex[:8]}_{os.path.basename(filename)}"
        dest_path = os.path.join(DRAWINGS_DIR, safe_name)
        with open(dest_path, 'wb') as f:
            f.write(content_bytes)
        return safe_name

    def add_entry(self, data: Dict[str, Any]) -> Dict[str, Any]:
        entry_id = data.get('id') or str(uuid.uuid4())
        data['id'] = entry_id
        now = datetime.datetime.now().isoformat()
        data['created_at'] = data.get('created_at') or now
        data['updated_at'] = now

        self._calc_ratios(data)

        line_items = data.get('line_items') or []
        line_items_json = json.dumps(line_items, ensure_ascii=False) if isinstance(line_items, list) else str(line_items)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO takeoff_entries (
                    id, category, sub_category, project_name, equipment_name,
                    structure_type, drawing_code, revision, drawing_filename,
                    relative_path, sharepoint_url, review_status, source_folder,
                    soil_condition, fck_concrete, steel_type, concrete_volume_m3,
                    steel_weight_kg, formwork_area_m2, excavation_m3, backfill_m3,
                    lean_concrete_m3, anchor_bolts_kg, pile_count, pile_diameter_cm,
                    pile_depth_m, steel_ratio_kg_m3, formwork_ratio_m2_m3,
                    notes, line_items_json, raw_extracted_text, doc_type, created_by,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                entry_id,
                data.get('category', 'termoeletrica'),
                data.get('sub_category', ''),
                data.get('project_name', 'Sem Projeto'),
                data.get('equipment_name', 'Equipamento Indefinido'),
                data.get('structure_type', 'Fundação'),
                data.get('drawing_code', ''),
                data.get('revision', '0'),
                data.get('drawing_filename', ''),
                data.get('relative_path', ''),
                data.get('sharepoint_url', ''),
                data.get('review_status', 'verified'),
                data.get('source_folder', ''),
                data.get('soil_condition', 'Solo Normal'),
                float(data.get('fck_concrete') or 30.0),
                data.get('steel_type', 'CA-50'),
                float(data.get('concrete_volume_m3') or 0.0),
                float(data.get('steel_weight_kg') or 0.0),
                float(data.get('formwork_area_m2') or 0.0),
                float(data.get('excavation_m3') or 0.0),
                float(data.get('backfill_m3') or 0.0),
                float(data.get('lean_concrete_m3') or 0.0),
                float(data.get('anchor_bolts_kg') or 0.0),
                int(data.get('pile_count') or 0),
                float(data.get('pile_diameter_cm') or 0.0),
                float(data.get('pile_depth_m') or 0.0),
                float(data.get('steel_ratio_kg_m3') or 0.0),
                float(data.get('formwork_ratio_m2_m3') or 0.0),
                data.get('notes', ''),
                line_items_json,
                data.get('raw_extracted_text', ''),
                data.get('doc_type', 'desenho'),
                data.get('created_by', 'Equipe de Engenharia'),
                data['created_at'],
                data['updated_at']
            ))
            conn.commit()

        self._export_sync_json()
        return self.get_entry(entry_id)

    def update_entry(self, entry_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        existing = self.get_entry(entry_id)
        if not existing:
            return None

        # Merge fields
        merged = dict(existing)
        merged.update(data)
        merged['updated_at'] = datetime.datetime.now().isoformat()
        self._calc_ratios(merged)

        line_items = merged.get('line_items') or []
        line_items_json = json.dumps(line_items, ensure_ascii=False) if isinstance(line_items, list) else str(line_items)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE takeoff_entries SET
                    category = ?,
                    sub_category = ?,
                    project_name = ?,
                    equipment_name = ?,
                    structure_type = ?,
                    drawing_code = ?,
                    revision = ?,
                    drawing_filename = ?,
                    relative_path = ?,
                    sharepoint_url = ?,
                    review_status = ?,
                    source_folder = ?,
                    soil_condition = ?,
                    fck_concrete = ?,
                    steel_type = ?,
                    concrete_volume_m3 = ?,
                    steel_weight_kg = ?,
                    formwork_area_m2 = ?,
                    excavation_m3 = ?,
                    backfill_m3 = ?,
                    lean_concrete_m3 = ?,
                    anchor_bolts_kg = ?,
                    pile_count = ?,
                    pile_diameter_cm = ?,
                    pile_depth_m = ?,
                    steel_ratio_kg_m3 = ?,
                    formwork_ratio_m2_m3 = ?,
                    notes = ?,
                    line_items_json = ?,
                    raw_extracted_text = ?,
                    doc_type = ?,
                    updated_at = ?
                WHERE id = ?
            """, (
                merged.get('category'),
                merged.get('sub_category'),
                merged.get('project_name'),
                merged.get('equipment_name'),
                merged.get('structure_type'),
                merged.get('drawing_code'),
                merged.get('revision'),
                merged.get('drawing_filename'),
                merged.get('relative_path'),
                merged.get('sharepoint_url'),
                merged.get('review_status', 'verified'),
                merged.get('source_folder'),
                merged.get('soil_condition'),
                float(merged.get('fck_concrete') or 30.0),
                merged.get('steel_type'),
                float(merged.get('concrete_volume_m3') or 0.0),
                float(merged.get('steel_weight_kg') or 0.0),
                float(merged.get('formwork_area_m2') or 0.0),
                float(merged.get('excavation_m3') or 0.0),
                float(merged.get('backfill_m3') or 0.0),
                float(merged.get('lean_concrete_m3') or 0.0),
                float(merged.get('anchor_bolts_kg') or 0.0),
                int(merged.get('pile_count') or 0),
                float(merged.get('pile_diameter_cm') or 0.0),
                float(merged.get('pile_depth_m') or 0.0),
                float(merged.get('steel_ratio_kg_m3') or 0.0),
                float(merged.get('formwork_ratio_m2_m3') or 0.0),
                merged.get('notes'),
                line_items_json,
                merged.get('raw_extracted_text'),
                merged.get('doc_type', 'desenho'),
                merged['updated_at'],
                entry_id
            ))
            conn.commit()

        self._export_sync_json()
        return self.get_entry(entry_id)

    def set_review_status(self, entry_id: str, status: str) -> bool:
        """One-click helper to toggle between 'pending_review' and 'verified'."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE takeoff_entries SET review_status = ?, updated_at = ? WHERE id = ?",
                (status, datetime.datetime.now().isoformat(), entry_id)
            )
            updated = cursor.rowcount > 0
            conn.commit()
        if updated:
            self._export_sync_json()
        return updated

    def delete_entry(self, entry_id: str) -> bool:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM takeoff_entries WHERE id = ?", (entry_id,))
            deleted = cursor.rowcount > 0
            conn.commit()
        if deleted:
            self._export_sync_json()
        return deleted

    def get_entry(self, entry_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM takeoff_entries WHERE id = ?", (entry_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return self._row_to_dict(row)

    def list_entries(
        self,
        category: Optional[str] = None,
        search: Optional[str] = None,
        structure_type: Optional[str] = None,
        review_status: Optional[str] = None,
        doc_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        query = "SELECT * FROM takeoff_entries WHERE 1=1"
        params = []

        if category and category.lower() != 'todas' and category.lower() != 'all':
            query += " AND LOWER(category) = LOWER(?)"
            params.append(category)

        if structure_type and structure_type.lower() != 'todas':
            query += " AND LOWER(structure_type) = LOWER(?)"
            params.append(structure_type)

        if review_status and review_status.lower() != 'todas' and review_status.lower() != 'all':
            query += " AND LOWER(review_status) = LOWER(?)"
            params.append(review_status)

        if doc_type and doc_type.lower() != 'todas' and doc_type.lower() != 'all':
            query += " AND LOWER(doc_type) = LOWER(?)"
            params.append(doc_type)

        if search:
            search_pattern = f"%{search.strip().lower()}%"
            query += """ AND (
                LOWER(equipment_name) LIKE ? OR
                LOWER(project_name) LIKE ? OR
                LOWER(drawing_code) LIKE ? OR
                LOWER(sub_category) LIKE ? OR
                LOWER(relative_path) LIKE ? OR
                LOWER(notes) LIKE ?
            )"""
            params.extend([search_pattern] * 6)

        query += " ORDER BY updated_at DESC"

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, tuple(params))
            rows = cursor.fetchall()
            return [self._row_to_dict(row) for row in rows]

    def get_statistics(self, category: Optional[str] = None) -> Dict[str, Any]:
        entries = self.list_entries(category=category)
        if not entries:
            return {
                "total_count": 0,
                "pending_review_count": 0,
                "verified_count": 0,
                "total_concrete_m3": 0.0,
                "total_steel_kg": 0.0,
                "total_steel_ton": 0.0,
                "avg_steel_ratio": 0.0,
                "avg_formwork_ratio": 0.0,
                "by_category": {},
                "by_structure_type": {},
                "by_doc_type": {}
            }

        total_vol = sum(e['concrete_volume_m3'] for e in entries)
        total_steel = sum(e['steel_weight_kg'] for e in entries)
        ratios = [e['steel_ratio_kg_m3'] for e in entries if e['steel_ratio_kg_m3'] > 0]
        avg_ratio = round(sum(ratios) / len(ratios), 1) if ratios else 0.0

        form_ratios = [e['formwork_ratio_m2_m3'] for e in entries if e['formwork_ratio_m2_m3'] > 0]
        avg_form = round(sum(form_ratios) / len(form_ratios), 2) if form_ratios else 0.0

        pending_count = sum(1 for e in entries if e.get('review_status') == 'pending_review')
        verified_count = len(entries) - pending_count

        by_cat = {}
        by_type = {}
        by_doc_type = {}
        for e in entries:
            cat = e.get('category', 'Outros')
            by_cat[cat] = by_cat.get(cat, 0) + 1
            stype = e.get('structure_type', 'Outros')
            by_type[stype] = by_type.get(stype, 0) + 1
            dtype = e.get('doc_type', 'desenho')
            by_doc_type[dtype] = by_doc_type.get(dtype, 0) + 1

        return {
            "total_count": len(entries),
            "pending_review_count": pending_count,
            "verified_count": verified_count,
            "total_concrete_m3": round(total_vol, 2),
            "total_steel_kg": round(total_steel, 2),
            "total_steel_ton": round(total_steel / 1000.0, 2),
            "avg_steel_ratio": avg_ratio,
            "avg_formwork_ratio": avg_form,
            "by_category": by_cat,
            "by_structure_type": by_type,
            "by_doc_type": by_doc_type
        }

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        d = dict(row)
        # Parse JSON line items safely
        raw_items = d.get('line_items_json')
        if raw_items:
            try:
                d['line_items'] = json.loads(raw_items)
            except Exception:
                d['line_items'] = []
        else:
            d['line_items'] = []
        return d

    def _export_sync_json(self):
        """Auto-sync to JSON file for easy cloud backup, git tracking and export."""
        try:
            entries = self.list_entries()
            with open(JSON_PATH, 'w', encoding='utf-8') as f:
                json.dump(entries, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[TakeoffDB] Warning: could not sync JSON: {e}")

    def import_from_json(self, json_filepath: str = JSON_PATH):
        if not os.path.exists(json_filepath):
            return 0
        with open(json_filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        count = 0
        for item in data:
            if not self.get_entry(item.get('id', '')):
                self.add_entry(item)
                count += 1
        return count


def get_onedrive_root() -> str:
    """Detects corporate OneDrive commercial root directory on Windows."""
    return (
        os.environ.get('OneDriveCommercial') or
        os.environ.get('OneDrive') or
        r"C:\OD\OneDrive - Andrade Gutierrez"
    )


def resolve_entry_file_path(entry: Dict[str, Any]) -> Optional[str]:
    """Finds absolute path to drawing file locally if available on the machine."""
    # 1. Check relative_path against OneDrive or source_folder
    rel = entry.get('relative_path')
    if rel:
        if os.path.isabs(rel) and os.path.isfile(rel):
            return rel
        od_root = get_onedrive_root()
        candidate = os.path.join(od_root, rel)
        if os.path.isfile(candidate):
            return candidate
        src_folder = entry.get('source_folder')
        if src_folder:
            candidate2 = os.path.join(src_folder, rel)
            if os.path.isfile(candidate2):
                return candidate2

    # 2. Check storage/drawings folder
    fn = entry.get('drawing_filename')
    if fn:
        candidate_storage = os.path.join(DRAWINGS_DIR, fn)
        if os.path.isfile(candidate_storage):
            return candidate_storage

    return None

