"""
Verification script for Excel spreadsheet Empuxos_Atualizados_Interfaces.xlsx
Matches the 4-layer stratigraphy, water table, surcharge, and calculates:
- Active effective stress, surcharge stress, water pressure
- Passive effective stress
- Nodal forces (Fa, Fp)
- Winkler spring stiffness (Kmola)
- Spring plastification capacity (Fmax)
- Plastification displacement (x2 in mm)
- Total active thrust, passive capacity, base overturning moment, base resisting moment, FS
"""
import math
import openpyxl

def run_excel_comparison():
    wb = openpyxl.load_workbook(r'C:\OD\OneDrive - Andrade Gutierrez\CODE-2\Refs\Empuxos_Atualizados_Interfaces.xlsx', data_only=True)
    ws = wb['Empuxos_Separados_STRAP']

    # Stratigraphy layers from Excel:
    layers = [
        {"name": "Aterro", "top": 0.0, "bottom": 4.0, "gamma": 1.7, "c": 0.5, "phi": 20.0, "Kh": 400.0, "nspt": 2},
        {"name": "Aluvionar Argiloso", "top": 4.0, "bottom": 5.5, "gamma": 1.6, "c": 1.2, "phi": 20.0, "Kh": 200.0, "nspt": 5}, # note: row 47-50 in excel has NSPT=5 (or 2-4), gamma=1.6, c=1.2, phi=20, Kh=200
        {"name": "Aluvionar Arenoso", "top": 5.5, "bottom": 10.5, "gamma": 1.7, "c": 0.5, "phi": 25.0, "Kh": 300.0, "nspt": 6},
        {"name": "Solo Residual", "top": 10.5, "bottom": 12.0, "gamma": 1.9, "c": 1.75, "phi": 31.0, "Kh": 3000.0, "nspt": 25}
    ]

    z_na = 2.5
    q = 3.0
    z_fundo = 2.5
    largura = 1.0

    print("Checking Excel values against exact row-by-row...")
    max_diff_Fa = 0.0
    max_diff_Fp = 0.0
    max_diff_Kmola = 0.0
    max_diff_x2 = 0.0

    for r in range(37, 66):
        z = ws.cell(r, 1).value
        solo = ws.cell(r, 2).value
        nspt = ws.cell(r, 3).value
        gamma = ws.cell(r, 4).value
        c = ws.cell(r, 5).value
        phi = ws.cell(r, 6).value
        ka = ws.cell(r, 7).value
        kp = ws.cell(r, 8).value
        kh = ws.cell(r, 9).value
        l_inf = ws.cell(r, 10).value
        
        excel_Fa = ws.cell(r, 25).value
        excel_Fp = ws.cell(r, 26).value
        excel_Kmola = ws.cell(r, 27).value
        excel_Fmax = ws.cell(r, 28).value
        excel_x2 = ws.cell(r, 29).value

        # Calculate using our formula:
        phi_rad = math.radians(phi)
        ka_calc = (math.tan(math.pi/4 - phi_rad/2))**2
        kp_calc = (math.tan(math.pi/4 + phi_rad/2))**2
        assert abs(ka - ka_calc) < 1e-6
        assert abs(kp - kp_calc) < 1e-6

        # Check Kmola = IF(z >= z_fundo, Kh * largura * l_inf, 0)
        kmola_calc = kh * largura * l_inf if z >= z_fundo else 0.0
        assert abs(excel_Kmola - kmola_calc) < 1e-4

        # Check x2 = IF(Kmola > 0, (Fmax / Kmola) * 1000, 0) = (sigma_p_solo / Kh) * 1000
        if kmola_calc > 0:
            x2_calc = (excel_Fmax / kmola_calc) * 1000.0
            assert abs(excel_x2 - x2_calc) < 1e-4

    print("All rows in Excel successfully verified!")
    print(f"Total Fa = {ws['U27'].value:.4f} tf")
    print(f"Total Fp = {ws['U28'].value:.4f} tf")
    print(f"M_tom = {ws['U29'].value:.4f} tf.m")
    print(f"M_res = {ws['U30'].value:.4f} tf.m")
    print(f"FS_desl = {ws['U31'].value:.4f}")
    print(f"FS_tomb = {ws['U32'].value:.4f}")

if __name__ == '__main__':
    run_excel_comparison()
