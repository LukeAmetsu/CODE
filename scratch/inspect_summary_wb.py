import openpyxl

wb = openpyxl.load_workbook('dist/Results_FS_2.5-2.75.xlsx', data_only=True)
ws = wb['Summary axial lengths']

print("=== ROWS IN Summary axial lengths ===")
for r_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
    axis = row[0]
    diam = row[1]
    emb = row[4]
    tip = row[5]
    qall_gross = row[14]
    w = row[15]
    qall_net = row[16]
    
    # Check rows around our target load (5550 for A, 6400 for B)
    if axis == 'A' and diam == 1.2:
        if 5000 <= (qall_net or 0) <= 6500 or 20 <= (emb or 0) <= 27:
            print(f"Axis A D=1.2: L={emb}m, Tip={tip}m, Qnet={qall_net:.1f}, Qgross={qall_gross:.1f}, W={w:.1f}")
    if axis == 'B' and diam == 1.2:
        if 5500 <= (qall_net or 0) <= 7000 or 20 <= (emb or 0) <= 28:
            print(f"Axis B D=1.2: L={emb}m, Tip={tip}m, Qnet={qall_net:.1f}, Qgross={qall_gross:.1f}, W={w:.1f}")
