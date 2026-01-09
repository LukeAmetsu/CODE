
import json
import re
import os

js_path = r"g:\My Drive\CODE-2\aisc\aisc-shapes-database-v16.0.js"

try:
    with open(js_path, 'r', encoding='utf-8') as f:
        content = f.read()

    match = re.search(r'const AISC_SHAPES_DATABASE\s*=\s*(\{.*\});', content, re.DOTALL)
    if not match:
        match = re.search(r'=\s*(\{.*\})', content, re.DOTALL)

    if match:
        data = json.loads(match.group(1))
        
        # Find a WT shape
        wt_shape_key = next((k for k in data.keys() if k.startswith("WT")), None)
        
        if wt_shape_key:
            print(f"Found Key: {wt_shape_key}")
            print(f"Type: {data[wt_shape_key].get('type')}")
        else:
            print("No WT shape found.")

    else:
        print("Could not parse JS.")

except Exception as e:
    print(e)
