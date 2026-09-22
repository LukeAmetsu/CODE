# update_viga_protendida.py
import re

with open(r"c:\OD\OneDrive - Andrade Gutierrez\CODE-2\nbr\viga_protendida.js", "r", encoding="utf-8") as f:
    content = f.read()

print(f"Total length: {len(content)} characters, {len(content.splitlines())} lines")
