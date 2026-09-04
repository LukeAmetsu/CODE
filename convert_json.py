import json
import pandas as pd
import sys

with open('aisc-shapes-database-v16.0.json', 'r', encoding='utf-8', errors='replace') as f:
    data = json.load(f)

rows = data.get("Database v16.0", [])
if not rows:
    # If the format is different, fallback
    if isinstance(data, list):
        rows = data

w_shapes = []
for props in rows:
    if props.get('Type') == 'W' or props.get('type') == 'W':
        name = props.get('AISC_Manual_Label') or props.get('EDI_Std_Nomenclature', '')
        props['Name'] = name
        
        # Extract the nominal weight from the shape name or 'W' key
        weight = props.get('W')
        if not weight or isinstance(weight, str):
            try:
                weight = float(name.split('X')[1])
            except:
                weight = 0
        props['Weight'] = weight
        
        # Clean numeric cols
        for col in ['d', 'Zx', 'Sx', 'ry', 'rts', 'J', 'ho']:
            val = props.get(col, 0)
            if isinstance(val, str):
                try:
                    props[col] = float(val)
                except ValueError:
                    props[col] = 0
            
        w_shapes.append(props)

df = pd.DataFrame(w_shapes)
cols = ['Name', 'Weight', 'd', 'Zx', 'Sx', 'ry', 'rts', 'J', 'ho']
df = df[[c for c in cols if c in df.columns]]

df.to_excel('AISC_Database.xlsx', index=False)
print("Successfully generated AISC_Database.xlsx!")
