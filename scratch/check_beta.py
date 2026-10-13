import math

# Sandy: beta = 1.5 - 0.135*sqrt(z_ft)
# Gravel: beta = 2.0 - 0.15*sqrt(z_ft)
for z_m in [1, 2, 5, 10, 15, 20, 25]:
    z_ft = z_m / 0.3048
    b_sand = 1.5 - 0.135 * math.sqrt(z_ft)
    b_gravel = 2.0 - 0.15 * math.sqrt(z_ft)
    print(f"z={z_m:2d}m ({z_ft:4.1f}ft): b_sand={b_sand:.3f}, b_gravel={b_gravel:.3f}")
