
import sys
import os

# Add project root to path
sys.path.append(os.path.abspath('.'))

from backend.calculators.beam_selector import find_lightest_beam
from backend.database import db

# Initialize DB
db_path = 'aisc-shapes-database-v16.0.xlsx'
print(f"Loading DB from {db_path}...")
db.load_database(db_path)

# Test Data
inputs = {
    'design_method': 'ASD',
    'fy': 50,
    'lb_ft': 20, # Global Lb (User might have set this high)
    'cb': 1.0,
    'batch_loads': [
        {'span': 12, 'load': 0.45, 'lb': 12, 'cb': 1.0}, # Case 1: Lb=12. Should yield light beam.
        {'span': 12, 'load': 2.55, 'lb': 12, 'cb': 1.0}  # Case 2: Lb=12. Should yield heavier beam.
    ]
}

print("\nRunning Batch Calculation...")
results = find_lightest_beam(inputs)

for i, res in enumerate(results):
    print(f"\nCase {i+1}: Span={res['span']}, Load={res['load']}")
    if res['winner']:
        print(f"Winner: {res['winner']['name']} (Weight: {res['winner']['weight']})")
        print(f"Capacity: {res['winner']['capacity']:.2f}")
    else:
        print("No Valid Winner Found")

# Expected:
# Case 1 should be a very light beam (e.g. W6x9 or W8x10)
# Case 2 should be heavier (e.g. W12x14 or W10x15)
# If both are W14x22, then something is still wrong (or W14x22 is just the efficient one, but unlikely for 0.45 load).
