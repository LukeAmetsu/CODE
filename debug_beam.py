import json
import os

db_path = 'aisc-shapes-database-v16.0.json'

if not os.path.exists(db_path):
    print(f"Error: {db_path} not found.")
else:
    with open(db_path, 'r', encoding='utf-8') as f:
        content = f.read().strip()
        
        if "W10X60" in content:
            print("FOUND 'W10X60' IN RAW CONTENT!")
        else:
            print("NOT FOUND 'W10X60' IN RAW CONTENT.")

        # Fix potential JSON formatting issues
        if content.startswith('"Database v16.0":'):
            content = "{" + content
        if not content.endswith("}"):
            content = content + "}"
        
        try:
            data = json.loads(content)
            # Unwrap if necessary
            if "Database v16.0" in data:
                data = data["Database v16.0"]
            
            print(f"Total Items: {len(data)}")
            
            # Search for W10X60
            target = "W10X60"
            found = None
            imperial_count = 0
            w_count = 0
            
            for item in data:
                if item.get("Type") == "W":
                    w_count += 1
                    # Rough check for Imperial: d < 100 (inches) vs 100+ (mm)
                    # W-shapes range up to ~44 inches.
                    d_val = item.get("d")
                    if d_val and isinstance(d_val, (int, float)) and d_val < 100:
                        imperial_count += 1
                        
                if item.get("AISC_Manual_Label") == target:
                    found = item
                    
            print(f"Total W-Shapes: {w_count}")
            print(f"Potential Imperial W-Shapes (d < 100): {imperial_count}")

            if found:
                print(f"\n--- FOUND {target} ---")
                for key, value in found.items():
                    print(f"{key}: {value}")
            else:
                print(f"\n--- {target} NOT FOUND ---")
                
        except Exception as e:
            print(f"JSON Error: {e}")
