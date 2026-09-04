import json
import openpyxl
from openpyxl import Workbook

print("Reading JSON...")
with open('aisc-shapes-database-v16.0.json', 'r', encoding='utf-8', errors='replace') as f:
    text = f.read().strip()

# Fix formatting if needed
# Strip all leading/trailing whitespace and braces/brackets
import re

text = text.strip()
if text.startswith('{'): text = text[1:]
if text.endswith('}'): text = text[:-1]

text = "{" + text.strip() + "}"
    
try:
    data = json.loads(text)
    if isinstance(data, dict):
        rows = data.get("Database v16.0", [])
    elif isinstance(data, list):
        rows = data
    else:
        rows = []
except json.JSONDecodeError as e:
    print(f"Failed to load JSON with wrapper: {e}")
    # Try stripping it to just array
    import re
    text_arr = re.sub(r'^"Database v16.0":\s*', '', text)
    try:
        rows = json.loads(text_arr)
    except Exception as e2:
        print(f"Failed as array: {e2}")
        rows = []

if not rows:
    print("Could not find rows!")
    exit(1)

w_shapes = []
for props in rows:
    if props.get('Type') == 'W' or props.get('type') == 'W':
        name = props.get('AISC_Manual_Label') or props.get('EDI_Std_Nomenclature', '')
        props['Name'] = name
        
        weight = props.get('W')
        if not weight or isinstance(weight, str):
            try:
                weight = float(name.split('X')[1])
            except:
                weight = 0
        props['Weight'] = float(weight) if isinstance(weight, (int, float)) else 0
        
        for col in ['d', 'Zx', 'Sx', 'ry', 'rts', 'J', 'ho']:
            val = props.get(col, 0)
            if isinstance(val, str):
                try:
                    props[col] = float(val)
                except ValueError:
                    props[col] = 0
            else:
                props[col] = float(val) if val is not None else 0
            
        w_shapes.append(props)

# Sort them by weight
w_shapes.sort(key=lambda x: x['Weight'])

print(f"Filtered {len(w_shapes)} W-shapes. Building Excel...")

wb = Workbook()
# Database sheet
db_sheet = wb.active
db_sheet.title = "Database"

# Columns A-I
cols = ['Name', 'Weight', 'd', 'Zx', 'Sx', 'ry', 'rts', 'J', 'ho']
headers = cols + ['Lp', 'Lr', 'Mp', 'Fcr', 'Mn', 'phi_Mn', 'Viability']
db_sheet.append(headers)

for idx, shape in enumerate(w_shapes):
    row_num = idx + 2
    row_data = [shape.get(c, 0) for c in cols]
    
    # We write the formulas as strings
    # Excel will evaluate them.
    row_data.append(f"=1.76 * F{row_num} * SQRT(29000 / Dashboard!$B$1) / 12") # J
    row_data.append(f"=1.95 * G{row_num} * (29000 / (0.7 * Dashboard!$B$1)) / 12 * SQRT((H{row_num}*1)/(E{row_num}*I{row_num}) + SQRT(((H{row_num}*1)/(E{row_num}*I{row_num}))^2 + 6.76*((0.7*Dashboard!$B$1)/29000)^2))") # K
    row_data.append(f"=Dashboard!$B$1 * D{row_num} / 12") # L
    row_data.append(f"=(Dashboard!$B$3 * PI()^2 * 29000 / ((Dashboard!$B$2*12)/G{row_num})^2) * SQRT(1 + 0.078 * (H{row_num}*1)/(E{row_num}*I{row_num}) * ((Dashboard!$B$2*12)/G{row_num})^2)") # M
    row_data.append(f"=MIN( IF(Dashboard!$B$2 <= J{row_num}, L{row_num}, IF(Dashboard!$B$2 <= K{row_num}, Dashboard!$B$3 * (L{row_num} - (L{row_num} - 0.7*Dashboard!$B$1*E{row_num}/12) * ((Dashboard!$B$2 - J{row_num})/(K{row_num} - J{row_num}))), M{row_num} * E{row_num} / 12) ), L{row_num} )") # N
    row_data.append(f"=0.9 * N{row_num}") # O
    row_data.append(f'=IF(O{row_num} >= Dashboard!$B$4, "Pass", "Fail")') # P
    
    db_sheet.append(row_data)

# Dashboard sheet
dash_sheet = wb.create_sheet("Dashboard")
dash_sheet['A1'] = "Fy"
dash_sheet['B1'] = 50
dash_sheet['C1'] = "ksi"
dash_sheet['D1'] = "Yield Strength"

dash_sheet['A2'] = "Lb"
dash_sheet['B2'] = 20
dash_sheet['C2'] = "ft"
dash_sheet['D2'] = "Unbraced Length"

dash_sheet['A3'] = "Cb"
dash_sheet['B3'] = 1.0
dash_sheet['C3'] = "-"
dash_sheet['D3'] = "Bending Coefficient"

dash_sheet['A4'] = "Mu"
dash_sheet['B4'] = 500
dash_sheet['C4'] = "kip-ft"
dash_sheet['D4'] = "Required Moment (LRFD)"

dash_sheet['A8'] = "Shape"
dash_sheet['B8'] = "Weight"
dash_sheet['C8'] = "Depth"
dash_sheet['D8'] = "phi_Mn"

dash_sheet['A9'] = '=TAKE(CHOOSECOLS(SORT(FILTER(Database!A2:P2000, Database!P2:P2000="Pass"), 2, 1), 1, 2, 3, 15), 10)'

wb.save("AISC_Beam_Selector.xlsx")
print("Saved AISC_Beam_Selector.xlsx successfully.")
