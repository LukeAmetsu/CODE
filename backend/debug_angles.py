import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.database import db

# Path to DB
db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../aisc-shapes-database-v16.0.xlsx'))

try:
    db.load_database(db_path)
    print("DB Loaded.")
    
    print("DB Loaded.")
    
    target = "L4X4X3/8"
    if target in db._shapes:
        item = db._shapes[target]
        print(f"--- {target} ---")
        for k, v in item.items():
            if 'Zx' in k or 'Sx' in k or 'W' in k or 'Depth' in k:
                print(f"{k}: {v}")
    else:
        print(f"{target} not found. First 5 keys: {list(db._shapes.keys())[:5]}")
        
except Exception as e:
    print(e)
