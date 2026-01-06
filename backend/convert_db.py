import json
import re

input_path = r'g:\My Drive\CODE-2\aisc\aisc-shapes-database-v16.0.js'
output_path = r'g:\My Drive\CODE-2\backend\aisc_shapes.json'

try:
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract the object content
    match = re.search(r'const AISC_SHAPES_DATABASE =\s*({.*});?', content, re.DOTALL)
    if not match:
        print("Could not find AISC_SHAPES_DATABASE object.")
        exit(1)

    json_str = match.group(1)
    
    # Simple cleanup for JSON compatibility if needed
    # The file viewed had quoted keys, so it might be valid JSON already if we remove the variable declaration.
    # However, standard JSON doesn't allow trailing commas.
    
    # Try parsing directly
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError:
        print("Direct JSON parse failed. Attempting robust parsing with ast.literal_eval...")
        import ast
        try:
             # ast.literal_eval handles trailing commas and Python-like dict syntax (which matches JSON mostly)
             data = ast.literal_eval(json_str)
        except Exception as e:
            print(f"AST eval failed: {e}")
            # Last resort: simple regex cleanup for trailing commas
            print("Attempting regex cleanup of trailing commas...")
            json_str = re.sub(r',\s*}', '}', json_str)
            json_str = re.sub(r',\s*]', ']', json_str)
            data = json.loads(json_str)

    # Write to JSON
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    print(f"Successfully converted database to {output_path}. Total shapes: {len(data)}")

except Exception as e:
    print(f"Error converting database: {e}")
