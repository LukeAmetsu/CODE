
import subprocess
import sys

# Run the test script and capture both stdout and stderr
result = subprocess.run(
    [sys.executable, "backend/tests/test_splice_backend.py"],
    capture_output=True,
    text=True,
    cwd="."
)

print("STDOUT:", result.stdout)
print("STDERR:", result.stderr)

with open('debug_full_log.txt', 'w') as f:
    f.write(result.stdout)
    f.write("\nSTDERR:\n")
    f.write(result.stderr)
