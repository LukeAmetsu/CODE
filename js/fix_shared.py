
import os

file_path = 'g:/My Drive/CODE-2/js/shared-utils.js'

try:
    # Read all lines
    # We use 'latin-1' to ensure we read every byte without decoding errors, 
    # then we can inspect the content.
    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()
    
    print(f"Total lines read: {len(lines)}")
    
    # We know the file should end around line 1954.
    # Let's verify line 1953 (0-indexed 1952)
    cutoff_line = 1953 # 1-indexed, so we want up to index 1953 (inclusive of 0-1953 which is 1954 lines?)
    # Wait, lines are 1-indexed in view_file.
    # Line 1953 is '}'.
    # We want lines[0] to lines[1953] (which is line 1954 in 1-based).
    
    # Let's check the content to be sure.
    # line 1952 (1-based 1953) should comprise '}'
    
    if len(lines) >= 1953:
        print(f"Line 1953 content: {lines[1952]}")
        
    # Truncate
    new_lines = lines[:1954]
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    
    print("File truncated successfully.")

except Exception as e:
    print(f"Error: {e}")
