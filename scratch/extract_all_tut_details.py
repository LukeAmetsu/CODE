import os
import re
import json
from pypdf import PdfReader

refs = 'Refs'
pdfs = sorted([f for f in os.listdir(refs) if f.startswith('Tutorial_') and f.endswith('.pdf')])

results = {}

for f in pdfs:
    reader = PdfReader(os.path.join(refs, f))
    full = '\n'.join([p.extract_text() or '' for p in reader.pages])
    
    # Extract material names & props
    mats = re.findall(r'(?i)(?:material\s*\d+|name\s*:|young\'s\s*modulus|poisson\'s\s*ratio|friction\s*angle|cohesion|unit\s*weight)[^\n]*', full)
    
    # Extract coordinates
    coords = re.findall(r'(?:\([0-9\.\-\s,]+\)|[0-9\.\-]+,\s*[0-9\.\-]+)', full)
    
    # Extract stages
    stages = re.findall(r'(?i)(?:stage\s*\d+)[^\n]*', full)
    
    results[f] = {
        'mats': [m.strip() for m in mats[:15]],
        'stages': [s.strip() for s in stages[:10]],
        'total_pages': len(reader.pages)
    }

with open('scratch/extracted_tut_details.json', 'w', encoding='utf-8') as out:
    json.dump(results, out, indent=2, ensure_ascii=False)

print("Extracted details for all 31 PDFs.")
