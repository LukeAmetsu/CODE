import pandas as pd
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
            
            print(f"Loading database from: {db_path}")
            
            # --- DETECT FILE TYPE ---
            _, ext = os.path.splitext(db_path)
            
            if ext.lower() in ['.xlsx', '.xls']:
                # READ EXCEL
                try:
                    # Try loading the specific sheet usually found in AISC DB
                    df = pd.read_excel(db_path, sheet_name='Database v16.0')
                except:
                    # Fallback to the first sheet if name doesn't match
                    print("Sheet 'Database v16.0' not found, loading first sheet...")
                    df = pd.read_excel(db_path, sheet_name=0)
                
                # Fill NaN values with 0 to prevent calculation errors
                df.fillna(0, inplace=True)
                
                # Clean column names (remove extra spaces)
                df.columns = df.columns.str.strip()
                
                self._shapes = {}
                records = df.to_dict('records')
                
                for item in records:
                    # Prefer 'AISC_Manual_Label' (e.g., W14x22), fallback to EDI
                    raw_key = item.get('AISC_Manual_Label')
                    if not raw_key:
                        raw_key = item.get('EDI_Std_Nomenclature')
                        
                    if raw_key:
                        # FORCE UPPERCASE KEY: "W14x22" -> "W14X22"
                        # This fixes the beam selector splitting by 'X'
                        key = str(raw_key).upper()
                        self._shapes[key] = item
                        
                print(f"Successfully loaded {len(self._shapes)} shapes from Excel.")

            else:
                raise ValueError("Unsupported file format. Please use .xlsx")

    def get_shapes_by_type(self, shape_type):
        if self._shapes is None:
            raise Exception("Database not loaded. Call load_database() first.")
        
        # Filter shapes where 'Type' matches (e.g., 'W', 'L', etc.)
        # We assume the 'Type' column exists and matches AISC codes.
        return {k: v for k, v in self._shapes.items() if v.get('Type') == shape_type}

# Global instance
db = AISCDatabase()
