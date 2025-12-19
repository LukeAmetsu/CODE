import eel
import sys
import os

# Ensure backend module can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.calculators.angle_support import calculate_angle_support as py_calculate_angle
from backend.calculators.beam_selector import find_lightest_beam as py_find_lightest
from backend.database import db

# Initialize Eel and point to the project root (where .js and html files are relatively accessible)
# Since we are in backend/, the root is one level up.
# However, Eel likes to serve a specific folder. 
# We'll set the root to '..' (CODE-2) so we can access 'aisc/' and 'js/' folders.
# WARNING: This exposes the whole project folder to the local browser. Okay for local app.

# HELPER: Finds files in both Dev mode and EXE mode
def resource_path(relative_path):
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath("."), relative_path)

# Initialize DB on startup
db_path = resource_path('aisc-shapes-database-v16.0.xlsx')
print(f"Server loading DB from: {db_path}")
try:
    db.load_database(db_path)
    print("Database loaded successfully.")
except Exception as e:
    print(f"Error loading database: {e}")

# --- Expose Functions ---

@eel.expose
def calculate_angle_support(inputs):
    try:
        return py_calculate_angle(inputs)
    except Exception as e:
        return {"error": str(e)}

@eel.expose
def find_lightest_beam(inputs):
    try:
        return py_find_lightest(inputs)
    except Exception as e:
        return {"error": str(e)}

@eel.expose
def get_w_shapes():
    try:
        # DB is loaded on startup
        shapes = db.get_shapes_by_type('W')
        # Return sorted keys (sorting logic: W{Deep}X{Weight})
        # Simple string sort is okay, but numerical is better. 
        # For simplicity in this step, assume standard sorting or just return keys. 
        # Actually, let's try to be smart about sorting.
        def sort_key(k):
            try:
                parts = k.upper().replace('W', '').split('X')
                return (float(parts[0]), float(parts[1]))
            except:
                return (0, 0)
        
        return sorted(list(shapes.keys()), key=sort_key, reverse=True)
    except Exception as e:
        print(f"Error getting shapes: {e}")
        return []

if __name__ == '__main__':
    # Initialize with the absolute path to gui folder
    gui_path = resource_path('gui')
    print(f"Eel serving from: {gui_path}")
    eel.init(gui_path)
    
    print("Starting Eel App...")
    # Start the app opening the angle calculator by default
    # Start the app opening the main menu
    try:
        eel.start('index.html', size=(1200, 800), port=0)
    except EnvironmentError:
        # Fallback if Chrome/Edge not found (opens in default browser)
        eel.start('index.html', mode='default', size=(1200, 800), port=0)
    except (SystemExit, KeyboardInterrupt):
        pass
