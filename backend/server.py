from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import sys

# Ensure backend module can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.calculators.angle_support import calculate_angle_support
from backend.calculators.beam_selector import find_lightest_beam
from backend.database import db

# Serve static files from the project root (../)
static_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
app = Flask(__name__, static_folder=static_path, static_url_path='')
CORS(app) # Enable Cross-Origin Resource Sharing for local development

@app.route('/')
def index():
    return "<h1>Engineering Tools Backend Running</h1><p>Go to <a href='/aisc/angle_support.html'>Angle Support Calculator</a></p><p>Go to <a href='/aisc/beam selector.html'>Beam Selector</a></p>"

# Initialize DB on startup
db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../aisc-shapes-database-v16.0.xlsx'))
print(f"Server loading DB from: {db_path}")
try:
    db.load_database(db_path)
    print("Database loaded successfully.")
except Exception as e:
    print(f"Error loading database: {e}")

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "db_loaded": db._shapes is not None})

@app.route('/api/calculate-angle', methods=['POST'])
def api_angle_support():
    try:
        data = request.json
        result = calculate_angle_support(data)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/api/beam-selector', methods=['POST'])
def api_beam_selector():
    try:
        data = request.json
        result = find_lightest_beam(data)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == '__main__':
    # Run on port 5000 by default
    print("Starting Flask server on http://localhost:5000")
    app.run(debug=True, port=5000)
