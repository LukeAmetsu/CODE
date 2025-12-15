import json
import os

class AISCDatabase:
    _instance = None
    _shapes = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(AISCDatabase, cls).__new__(cls)
        return cls._instance

    def load_database(self, db_path):
        if self._shapes is None:
            if not os.path.exists(db_path):
                raise FileNotFoundError(f"Database file not found at {db_path}")
            
            with open(db_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                
                # Fix malformed JSON (missing start brace)
                if content.startswith('"Database v16.0":'):
                    content = "{" + content
                
                data = json.loads(content)
                
                # Normalize structure
                if "Database v16.0" in data:
                    data = data["Database v16.0"]
                    
                if isinstance(data, list):
                    # Convert list to dict keyed by EDI_Std_Nomenclature (e.g. W12X26)
                    # Fallback to AISC_Manual_Label if needed, but EDI seems more consistent for W-shapes
                    self._shapes = {}
                    for item in data:
                        key = item.get('EDI_Std_Nomenclature') or item.get('AISC_Manual_Label')
                        if key:
                            self._shapes[key] = item
                else:
                    self._shapes = data

    def get_shapes_by_type(self, shape_type):
        if self._shapes is None:
            raise Exception("Database not loaded. Call load_database() first.")
        
        return {k: v for k, v in self._shapes.items() if v.get('Type') == shape_type}

# Global instance
db = AISCDatabase()
