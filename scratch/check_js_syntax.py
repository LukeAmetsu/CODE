# check_js_syntax.py
import sys

def check_brackets(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()

    stack = []
    pairs = {')': '(', ']': '[', '}': '{'}
    in_single = False
    in_double = False
    in_template = False
    in_line_comment = False
    in_block_comment = False

    i = 0
    line = 1
    col = 1

    while i < len(text):
        c = text[i]
        next_c = text[i+1] if i + 1 < len(text) else ''

        if c == '\n':
            line += 1
            col = 1
            in_line_comment = False
            i += 1
            continue

        if in_line_comment:
            i += 1
            col += 1
            continue

        if in_block_comment:
            if c == '*' and next_c == '/':
                in_block_comment = False
                i += 2
                col += 2
            else:
                i += 1
                col += 1
            continue

        if not (in_single or in_double or in_template):
            if c == '/' and next_c == '/':
                in_line_comment = True
                i += 2
                col += 2
                continue
            if c == '/' and next_c == '*':
                in_block_comment = True
                i += 2
                col += 2
                continue

        # Handle strings
        if c == "'" and not (in_double or in_template):
            if not in_single:
                in_single = True
            elif text[i-1] != '\\':
                in_single = False
        elif c == '"' and not (in_single or in_template):
            if not in_double:
                in_double = True
            elif text[i-1] != '\\':
                in_double = False
        elif c == '`' and not (in_single or in_double):
            if not in_template:
                in_template = True
            elif text[i-1] != '\\':
                in_template = False

        if not (in_single or in_double or in_template):
            if c in '({[':
                stack.append((c, line, col))
            elif c in ')}]':
                if not stack:
                    print(f"Error: unexpected closing {c} at line {line}, col {col}")
                    return False
                top, top_line, top_col = stack.pop()
                if pairs[c] != top:
                    print(f"Error: mismatched {c} at line {line}, col {col}, opened with {top} at line {top_line}, col {top_col}")
                    return False

        i += 1
        col += 1

    if stack:
        print(f"Error: unclosed brackets remaining: {stack[-5:]}")
        return False

    print("Success: All brackets, braces, and parenthesis are perfectly balanced!")
    return True

check_brackets(r"nbr\viga_protendida.js")
