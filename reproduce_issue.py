
import sys
import os

# Add the parent directory to sys.path to make imports work
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from backend.calculators.beam_selector import find_lightest_beam
from backend.database import db

# Force load database if needed
db_path = r'g:\My Drive\CODE-2\aisc-shapes-database-v16.0.xlsx'
print(f"Loading DB from {db_path}...")
db.load_database(db_path)

inputs = {
    'design_method': 'ASD', # User mentioned "Code gives me W14x90", assuming ASD or LRFD.
    'mu_req': 148.0,
    'lb_ft': 0.0,
    'fy': 50.0,
}

print("Running beam selector with inputs:", inputs)
results = find_lightest_beam(inputs)

print(f"\nFound {len(results)} candidates. Top 5:")
for r in results[:5]:
    print(f"{r['name']} - Weight: {r['weight']}, Capacity: {r['capacity']:.2f}")

print("\nChecking specifically for W14x48:")
shapes = db.get_shapes_by_type('W')



# 2. Run with User's Exact Inputs from Screenshot
# Method: OSHA (F.S. = 4.0)
# Lb: 14
# Cb: 1.14
# Mu: 148.14
print("\n--- RUN 1: OSHA, Lb=14, Cb=1.14, Mu=148.14 ---")
inputs['design_method'] = 'OSHA'
inputs['mu_req'] = 148.14
inputs['lb_ft'] = 14.0
inputs['cb'] = 1.14
inputs['max_depth'] = 9999
results = find_lightest_beam(inputs)

found = False
for r in results:
    if r['name'] == 'W14X48':
        found = True
        print("W14X48 Found in results!")
        print(f"Capacity: {r['capacity']:.2f} k-ft")
        print(f"Lp: {r['Lp']:.2f} ft")
        print(f"Lr: {r['Lr']:.2f} ft")
        print(f"Mode: {r['mode']}")
        print(f"Ratio: {r['ratio']:.2f}")
        break  # Found it, no need to keep printing

if not found:
    print("W14X48 NOT in top 20 results.")
    # Print top 3 to see what IS there
    for i, r in enumerate(results[:3]):
        print(f"Rank {i+1}: {r['name']} - W={r['weight']} Cap={r['capacity']:.2f}")

# Check W14x90 specificially
print("\nChecking W14X90 stats for comparison:")
w90_found = False
for r in results:
    if r['name'] == 'W14X90':
        print(f"W14X90: Cap={r['capacity']:.2f} k-ft")
        w90_found = True
        break
if not w90_found:
    print("W14X90 ALSO NOT in results (or lower down).")


print("\n--- INTERMEDIATE SHAPES CHECK ---")
for s in ['W14X53', 'W14X61', 'W14X68', 'W14X74']:
    if s in shapes:
        p = shapes[s]
        print(f"{s}: d={p.get('d')}, Zx={p.get('Zx')}")
    else:
        print(f"{s}: NOT IN DB")



