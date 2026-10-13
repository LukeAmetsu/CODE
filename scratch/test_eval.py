import re
import math

def safe_math_eval(expression):
    if expression is None:
        return None
    if isinstance(expression, (int, float)):
        return expression

    s = str(expression).strip()
    if not s:
        return None

    # Replace decimal commas between digits: "1,5" -> "1.5"
    s = re.sub(r'(\d+),(\d+)', r'\1.\2', s)

    # Replace ^ with **
    s = s.replace('^', '**')

    # Replace percentage: "10%" -> "(10/100)"
    s = re.sub(r'(\d+(?:\.\d+)?)%', r'(\1/100)', s)

    # Test replacements for math functions
    allowed = ['sqrt', 'abs', 'round', 'floor', 'ceil', 'sin', 'cos', 'tan', 'min', 'max', 'pi']
    for fn in allowed:
        if fn == 'pi':
            s = re.sub(r'\bpi\b', 'math.pi', s, flags=re.IGNORECASE)
        else:
            s = re.sub(r'\b' + fn + r'\b', f'math.{fn}', s, flags=re.IGNORECASE)

    # Whitelist check: allow digits, dots, operators +, -, *, /, (, ), spaces, and commas
    check_str = re.sub(r'math\.(sqrt|abs|round|floor|ceil|sin|cos|tan|min|max|pi)', '', s)
    if not re.match(r'^[0-9+\-*/().\s,]+$', check_str):
        return None

    try:
        res = eval(s, {"__builtins__": None, "math": math})
        return res
    except Exception as e:
        return None

test_cases = [
    "21400 / 2",
    "12050 * 1.4",
    "1,5 + 2,3",
    "25 - 4.6",
    "4 * 47.88",
    "2^3",
    "sqrt(16)",
    "pi * 1.5^2 / 4",
    "21400 * 10%",
    "43.1",
    "max(10, 20)",
    "invalid"
]

for t in test_cases:
    print(f"{t:20} => {safe_math_eval(t)}")
