
import sys
import os

# Mock the path to access backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.database import db

# Initialize DB (simulating main_eel.py)
# We assume we are in backend/ or root. Let's try to load from backend logic.
# The class loads relative to itself for JSON.
print("Loading database...")
db.load_database("dummy_path_that_might_fail_but_json_should_load.xlsx")

print("Testing W shapes retrieval...")
try:
    shapes = db.get_shapes_by_type('W')
    print(f"Found {len(shapes)} W shapes.")
    
    if len(shapes) > 0:
        first = list(shapes.values())[0]
        print(f"First shape sample: {first.get('type') or first.get('Type')}")
        print("SUCCESS: Shapes found.")
    else:
        print("FAILURE: No W shapes found.")

except Exception as e:
    print(f"ERROR: {e}")
