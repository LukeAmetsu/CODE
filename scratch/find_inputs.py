import re

with open('gui/capacidade_estaca.html', 'r', encoding='utf-8') as f:
    text = f.read()

for m in re.finditer(r'<input\s+[^>]*id=["\']([^"\']+)["\'][^>]*>', text):
    tag = m.group(0)
    inp_id = m.group(1)
    # extract type
    t_m = re.search(r'type=["\']([^"\']+)["\']', tag)
    inp_type = t_m.group(1) if t_m else 'text'
    if inp_type in ('number', 'text') or 'onchange' in tag or 'step' in tag:
        print(f"ID: {inp_id:30} | Type: {inp_type:10} | Tag: {tag[:80]}")
