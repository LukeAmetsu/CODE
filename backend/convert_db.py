import json
import os
import re

# Define absolute paths
base_dir = os.path.dirname(os.path.abspath(__file__)) # backend/
project_root = os.path.abspath(os.path.join(base_dir, '..'))
input_js = os.path.join(project_root, 'aisc', 'aisc-shapes-database-v16.0.js')
output_json = os.path.join(base_dir, 'aisc_shapes.json')

def convert_db():
    print(f"Reading from: {input_js}")
    if not os.path.exists(input_js):
        print(f"Error: Input file not found: {input_js}")
        return

    try:
        with open(input_js, 'r', encoding='utf-8') as f:
            content = f.read()

        # Extract JSON object from JS assignment
        # Look for "const AISC_SHAPES_DATABASE = { ... };"
        match = re.search(r'const AISC_SHAPES_DATABASE\s*=\s*(\{.*\});', content, re.DOTALL)
        if not match:
            # Maybe it doesn't end with ; or uses var/let
            match = re.search(r'=\s*(\{.*\})', content, re.DOTALL)
        
        if match:
            json_str = match.group(1)
            data = json.loads(json_str)
            print(f"Successfully parsed {len(data)} shapes from JS.")
            
            # Write to JSON
            with open(output_json, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            
            print(f"Saved to {output_json}")
            
            # Verify W count
            w_count = sum(1 for k, v in data.items() if v.get('type') == 'W' or v.get('Type') == 'W')
            print(f"W-Shapes count: {w_count}")
            
        else:
            print("Failed to extract JSON from JS file.")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    convert_db()
