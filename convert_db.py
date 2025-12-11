import json
import os
import re

input_file = 'aisc-shapes-database-v16.0.json'
output_file = os.path.join('aisc', 'aisc-shapes-database-v16.0.js')

try:
    with open(input_file, 'r', encoding='utf-8') as f:
        raw_data = f.read()

    # Regex to find JSON objects. 
    # Valid assumption based on analysis: Objects are { ... } blocks in a list.
    # We split by "}," to be robust against "Type" check (though Type is good).
    # But since we confirmed "Type" is only at the top of the object, the previous regex is fine.
    # object_pattern = re.compile(r'\{[^{}]*"Type":\s*"[^"]+"[^{}]*\}', re.DOTALL)
    # The [^{}]* logic is risky if the Metric section introduces braces (unlikely).
    # Since we saw correct extraction of 2299 objects, we stick with it BUT refine it to catch the whole block if needed.
    # Actually, the snippet for #139 seemed truncated? "Raw String Length: 2404".
    # That's plenty.
    
    # We will use the same object pattern.
    object_pattern = re.compile(r'\{[^{}]*"Type":\s*"[^"]+"[^{}]*\}', re.DOTALL)
    
    raw_objects = object_pattern.findall(raw_data)
    print(f"Found {len(raw_objects)} objects")

    output_db = {}
    
    def parse_num(s_val):
        if not s_val: return 0
        s_val = s_val.strip().strip('"')
        if s_val == "–" or s_val == "-" or s_val == "":
            return 0
        try:
            return float(s_val.replace(',', ''))
        except ValueError:
            return 0

    def get_first_val(text, key, is_string=False):
        # find "Key": value
        # value can be "string" or number.
        # Regex: "Key"\s*:\s*(".*?"|[^,}\s]+)
        # Note: value might contain escaped quotes if string.
        # But here keys like "d" have simple numbers.
        # "AISC_Manual_Label" has string.
        
        escaped_key = re.escape(key)
        if is_string:
            # Look for "Key": "Value"
            pattern = r'"' + escaped_key + r'"\s*:\s*"([^"]+)"'
        else:
            # Look for "Key": Value (number or "–")
            # Value could be number 14, or string "–"
            # It captures up to comma or end of line/brace.
            # Simplified: Capture "..." or token.
            pattern = r'"' + escaped_key + r'"\s*:\s*((?:"[^"]+")|[^,}\s]+)'
            
        matches = re.findall(pattern, text)
        if matches:
            return matches[0] # Return the FIRST match (Imperial)
        return None

    count = 0
    w_count = 0

    for raw_str in raw_objects:
        # Extract Type (only one)
        # We can use json.loads just for Type if we want, but might as well use regex for consistency and speed.
        # Type is at top.
        
        raw_type = get_first_val(raw_str, "Type", is_string=True)
        if not raw_type: continue
        
        # Extract Name (First match = Imperial)
        name = get_first_val(raw_str, "AISC_Manual_Label", is_string=True)
        if not name: continue

        # Filter Imperial validity? 
        # If we take first match, it *should* be Imperial.
        # But check d < 60 just in case.
        
        # Function to get numeric prop (first match)
        def get_n(k):
             val_str = get_first_val(raw_str, k, is_string=False)
             return parse_num(val_str)

        d = get_n("d")
        bf = get_n("bf")
        A = get_n("A") # Mapping A -> Ag in JS
        
        # Verify it is Imperial
        # W-shapes d should be < 50.
        if raw_type == 'W' and d > 60:
            # This would imply Metric was first? Or bad parsing.
            # Log it but skip.
            # print(f"Skipping {name} with d={d} (Metric?)")
            continue
            
        # Mapping Type
        shape_type = raw_type
        if raw_type == 'W':
            shape_type = 'W-Shape'
            w_count += 1
        elif raw_type == 'L':
            shape_type = 'Angle'
        elif raw_type == 'C':
            shape_type = 'Channel'
        elif raw_type == 'MC':
            shape_type = 'Channel'
        
        # Beam selector specifically wants W-Shape.
        # We process others for completeness if useful, but ensure W is robust.
        
        shape_entry = {
            "type": shape_type,
            "d": d,
            "bf": bf,
            "tf": get_n("tf"),
            "tw": get_n("tw"),
            "Ag": A,
            "Ix": get_n("Ix"),
            "Zx": get_n("Zx"),
            "Sx": get_n("Sx"),
            "rx": get_n("rx"),
            "Iy": get_n("Iy"),
            "Zy": get_n("Zy"),
            "Sy": get_n("Sy"),
            "ry": get_n("ry"),
            "J": get_n("J"),
            "Cw": get_n("Cw"),
            "cw": get_n("Cw"),
            "rts": get_n("rts"),
            "ho": get_n("ho"),
            "x": get_n("x"),
            "y": get_n("y"),
            "xp": get_n("xp"),
            "yp": get_n("yp")
        }

        output_db[name] = shape_entry
        count += 1

    # Write output
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("const AISC_SHAPES_DATABASE = " + json.dumps(output_db, indent=4) + ";\n")
    
    print(f"Successfully converted {count} shapes to {output_file}")
    print(f"Imperial W-Shapes: {w_count}")

except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"Error converting database: {e}")
