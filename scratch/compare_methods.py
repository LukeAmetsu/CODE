# compare_methods.py
import math

# Let's inspect calculateMethod1 and calculateMethod2 and calculateMethod3 from PCALC.js
hy = 50.0 # cm
hx = 30.0 # cm
Ac = 30.0 * 50.0 # 1500 cm2
fck = 25.0 # MPa
fcd = (fck / 10.0) / 1.4 # kN/cm2
Nsd = -800.0 * 1.4 # -1120 kN
M1xt = 50.0 * 1.4 # 70 kNm
M1xb = -50.0 * 1.4 # -70 kNm
M1yt = 20.0 * 1.4 # 28 kNm
M1yb = -20.0 * 1.4 # -28 kNm
Le = 4.0 # m

# Minimum Moments
e_min_x = 1.5 + 0.03 * hy # 3.0 cm -> 0.03 m
e_min_y = 1.5 + 0.03 * hx # 2.4 cm -> 0.024 m
MinX = abs(Nsd) * (e_min_x / 100.0) # 1120 * 0.03 = 33.6 kNm
MinY = abs(Nsd) * (e_min_y / 100.0) # 1120 * 0.024 = 26.88 kNm

print(f"MinX: {MinX:.2f} kNm, MinY: {MinY:.2f} kNm")

# Method 1
hy_m = hy / 100.0 # 0.5 m
hx_m = hx / 100.0 # 0.3 m
nu_x = abs(Nsd) / (Ac * fcd)
print(f"nu_x: {nu_x:.4f}")

invRx = min((0.005 / hy_m) / (nu_x + 0.5), 0.005 / hy_m)
invRy = min((0.005 / hx_m) / (nu_x + 0.5), 0.005 / hx_m)
print(f"invRx: {invRx:.4f} m^-1, invRy: {invRy:.4f} m^-1")

M2d_x = abs(Nsd) * (Le**2 / 10.0) * invRx
M2d_y = abs(Nsd) * (Le**2 / 10.0) * invRy
print(f"Method 1: M2d_x = {M2d_x:.2f} kNm, M2d_y = {M2d_y:.2f} kNm")

# alphaB
def getAlphaB(M1, M2):
    Ma = max(abs(M1), abs(M2))
    Mb = min(abs(M1), abs(M2))
    if Ma == 0: return 1.0
    ratio = (Mb / Ma) if (M1 * M2 >= 0) else -(Mb / Ma)
    return max(0.4, 0.6 + 0.4 * ratio)

ab_x = getAlphaB(M1xt, M1xb)
ab_y = getAlphaB(M1yt, M1yb)
print(f"alpha_b_x: {ab_x:.2f}, alpha_b_y: {ab_y:.2f}")

M1d_eq_x = ab_x * max(abs(M1xt), abs(M1xb))
M1d_eq_y = ab_y * max(abs(M1yt), abs(M1yb))
print(f"M1d_eq_x: {M1d_eq_x:.2f} kNm, M1d_eq_y: {M1d_eq_y:.2f} kNm")

Mtot_x_1 = max(M1d_eq_x, MinX) + M2d_x
Mtot_y_1 = max(M1d_eq_y, MinY) + M2d_y
print(f"Method 1 TOTAL: Mtot_x = {Mtot_x_1:.2f} kNm, Mtot_y = {Mtot_y_1:.2f} kNm")
