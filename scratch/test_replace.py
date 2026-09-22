# test_replace.py
import re

with open(r"c:\OD\OneDrive - Andrade Gutierrez\CODE-2\nbr\viga_protendida.js", "r", encoding="utf-8") as f:
    js_content = f.read()

# Verify that key anchor points exist
assert "function renderResults(results) {" in js_content
assert "function addCableGroup(containerId, data = null) {" in js_content
assert "function drawCrossSectionDiagram(canvasId, vertices) {" in js_content
assert "function drawLongitudinalDiagram(canvasId, inputs) {" in js_content
assert "document.addEventListener('DOMContentLoaded', () => {" in js_content

print("All anchor points verified successfully!")
