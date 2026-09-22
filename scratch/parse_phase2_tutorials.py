import os
import sys
import re
import json
from pypdf import PdfReader

def clean(s):
    if not s:
        return ""
    return re.sub(r'\s+', ' ', s).strip()

refs_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'Refs')
pdf_files = sorted([f for f in os.listdir(refs_dir) if f.startswith('Tutorial_') and f.endswith('.pdf')])

tutorials_data = []

for f in pdf_files:
    pdf_path = os.path.join(refs_dir, f)
    reader = PdfReader(pdf_path)
    num_pages = len(reader.pages)
    full_text = "\n".join([page.extract_text() or "" for page in reader.pages])
    
    # Extract tutorial number and title
    tut_match = re.search(r'Tutorial_(\d+)_([^\.]+)', f)
    tut_num = tut_match.group(1) if tut_match else "00"
    tut_name = tut_match.group(2).replace('_', ' ') if tut_match else f
    
    # Extract topics covered
    topics = []
    topics_match = re.search(r'Topics covered:?(.*?)(?:\n\n|\n[A-Z][a-z]+|\Z)', full_text, re.DOTALL | re.IGNORECASE)
    if topics_match:
        raw_topics = topics_match.group(1).split('\n')
        topics = [clean(t.replace('•', '').replace('-', '')) for t in raw_topics if clean(t)]
    
    # Extract first page overview
    first_page = reader.pages[0].extract_text() or ""
    lines = [clean(l) for l in first_page.split('\n') if clean(l)]
    desc_lines = []
    capture = False
    for l in lines:
        if 'Tutorial' in l and ('Manual' in l or '-' in l):
            capture = True
            continue
        if capture:
            if len(l) > 15:
                desc_lines.append(l)
            if len(desc_lines) >= 4:
                break
    summary = " ".join(desc_lines)

    tutorials_data.append({
        'filename': f,
        'number': int(tut_num),
        'title': f"Phase2 Tutorial {tut_num}: {tut_name}",
        'short_title': tut_name,
        'pages': num_pages,
        'summary': summary,
        'topics': topics,
        'text_len': len(full_text)
    })

output_json = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'phase2_summary.json')
with open(output_json, 'w', encoding='utf-8') as out:
    json.dump(tutorials_data, out, indent=2, ensure_ascii=False)

print(f"Parsed {len(tutorials_data)} tutorial PDFs successfully.")
