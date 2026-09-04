import json
import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Protection

print("Reading JSON...")
with open('backend/aisc_shapes.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

imperial_w_shapes = []
for name, props in data.items():
    if props.get('type') == 'W' and 'X' in name:
        try:
            nominal_depth = float(name.split('X')[0][1:])
            if nominal_depth < 50:
                props['Name'] = name
                props['Weight'] = float(name.split('X')[1])
                
                # Ensure all required properties exist
                for col in ['d', 'Zx', 'Sx', 'ry', 'rts', 'J', 'ho']:
                    val = props.get(col, 0)
                    props[col] = float(val) if val is not None else 0
                    
                imperial_w_shapes.append(props)
        except:
            continue

imperial_w_shapes.sort(key=lambda x: x['Weight'])

wb = Workbook()
db_sheet = wb.active
db_sheet.title = "Database"

cols = ['Name', 'Weight', 'd', 'Zx', 'Sx', 'ry', 'rts', 'J', 'ho']
headers = cols + ['Lp', 'Lr', 'Mp', 'Fcr', 'Mn', 'Mn_Omega', 'Viability', 'RankKey']
db_sheet.append(headers)

# References:
# Dashboard!$B$8 = Fy
# Dashboard!$B$5 = Lb
# Dashboard!$B$9 = Cb
# Dashboard!$B$11 = Ma

for idx, shape in enumerate(imperial_w_shapes):
    row_num = idx + 2
    row_data = [shape.get(c, 0) for c in cols]
    
    # Formulas with updated cell references
    row_data.append(f"=1.76 * F{row_num} * SQRT(29000 / Dashboard!$B$8) / 12") # J
    row_data.append(f"=1.95 * G{row_num} * (29000 / (0.7 * Dashboard!$B$8)) / 12 * SQRT((H{row_num}*1)/(E{row_num}*I{row_num}) + SQRT(((H{row_num}*1)/(E{row_num}*I{row_num}))^2 + 6.76*((0.7*Dashboard!$B$8)/29000)^2))") # K
    row_data.append(f"=Dashboard!$B$8 * D{row_num} / 12") # L
    row_data.append(f"=(Dashboard!$B$9 * PI()^2 * 29000 / ((Dashboard!$B$5*12)/G{row_num})^2) * SQRT(1 + 0.078 * (H{row_num}*1)/(E{row_num}*I{row_num}) * ((Dashboard!$B$5*12)/G{row_num})^2)") # M
    row_data.append(f"=MIN( IF(Dashboard!$B$5 <= J{row_num}, L{row_num}, IF(Dashboard!$B$5 <= K{row_num}, Dashboard!$B$9 * (L{row_num} - (L{row_num} - 0.7*Dashboard!$B$8*E{row_num}/12) * ((Dashboard!$B$5 - J{row_num})/(K{row_num} - J{row_num}))), M{row_num} * E{row_num} / 12) ), L{row_num} )") # N
    
    # ASD uses Omega = 1.67 instead of phi = 0.9
    row_data.append(f"=N{row_num} / 1.67") # O
    
    # No more /25.4 since depth is imperial
    row_data.append(f'=IF(AND(O{row_num} >= Dashboard!$B$11, C{row_num} <= Dashboard!$B$6), "Pass", "Fail")') # P
    
    # Classic sorting key (Weight + tiebreaker)
    row_data.append(f'=IF(P{row_num}="Pass", B{row_num} + ROW()/100000, 9999999)') # Q
    
    db_sheet.append(row_data)

dash_sheet = wb.create_sheet("Dashboard")

# User Inputs
dash_sheet['A1'] = "Span Length (ft)"
dash_sheet['B1'] = 20
dash_sheet['B1'].protection = Protection(locked=False)

dash_sheet['A2'] = "Cantilever Length (ft)"
dash_sheet['B2'] = 0
dash_sheet['B2'].protection = Protection(locked=False)

dash_sheet['A3'] = "Tributary Width (ft)"
dash_sheet['B3'] = 10
dash_sheet['B3'].protection = Protection(locked=False)

dash_sheet['A4'] = "Area Load (psf)"
dash_sheet['B4'] = 50
dash_sheet['B4'].protection = Protection(locked=False)

dash_sheet['A5'] = "Unbraced Length Lb (ft)"
dash_sheet['B5'] = 20
dash_sheet['B5'].protection = Protection(locked=False)

dash_sheet['A6'] = "Max allowable depth (inches)"
dash_sheet['B6'] = 24
dash_sheet['B6'].protection = Protection(locked=False)

# Hidden Engineering Cells
dash_sheet['A8'] = "Fy (ksi)"
dash_sheet['B8'] = 50

dash_sheet['A9'] = "Cb"
dash_sheet['B9'] = 1.0

dash_sheet['A10'] = "Linear Load w (klf)"
dash_sheet['B10'] = "=(B4*B3)/1000"

dash_sheet['A11'] = "Ma (kip-ft)"
# Max moment comparing backspan vs cantilever
dash_sheet['B11'] = "=IF(B2 > 0, B10 * (B2 ^ 2) / 2, B10 * (B1 ^ 2) / 8)"

# Hide rows 8 to 11
for row in range(8, 12):
    dash_sheet.row_dimensions[row].hidden = True

# Results Table
dash_sheet['A14'] = "Shape"
dash_sheet['B14'] = "Weight"
dash_sheet['C14'] = "Depth"
dash_sheet['D14'] = "Mn/Omega"

# Use classic INDEX/MATCH/SMALL for robust compatibility across all Excel versions without dynamic array / @ bugs
for i in range(1, 11):
    row = 14 + i
    dash_sheet[f'A{row}'] = f'=IF(SMALL(Database!$Q$2:$Q$2000, {i})>=9999999, "", INDEX(Database!A$2:A$2000, MATCH(SMALL(Database!$Q$2:$Q$2000, {i}), Database!$Q$2:$Q$2000, 0)))'
    dash_sheet[f'B{row}'] = f'=IF($A${row}="", "", INDEX(Database!B$2:B$2000, MATCH(SMALL(Database!$Q$2:$Q$2000, {i}), Database!$Q$2:$Q$2000, 0)))'
    dash_sheet[f'C{row}'] = f'=IF($A${row}="", "", INDEX(Database!C$2:C$2000, MATCH(SMALL(Database!$Q$2:$Q$2000, {i}), Database!$Q$2:$Q$2000, 0)))'
    dash_sheet[f'D{row}'] = f'=IF($A${row}="", "", INDEX(Database!O$2:O$2000, MATCH(SMALL(Database!$Q$2:$Q$2000, {i}), Database!$Q$2:$Q$2000, 0)))'

dash_sheet.protection.sheet = True
wb.active = dash_sheet

wb.save("AISC_Beam_Selector_NonEngineer_v6.xlsx")
print("Saved AISC_Beam_Selector_NonEngineer_v6.xlsx successfully.")
