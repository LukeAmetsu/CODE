import pandas as pd
import os

# The exact name your code is looking for
filename = 'aisc-shapes-database-v16.0.xlsx'

print(f"--- DIAGNOSTIC START ---")
print(f"Looking for file: {filename}")

if not os.path.exists(filename):
    print(f"❌ ERROR: File not found in {os.getcwd()}")
    print("   Please ensure the Excel file is in this folder and named correctly.")
else:
    print(f"✅ File found.")
    try:
        # Try reading the file
        df = pd.read_excel(filename, sheet_name='Database v16.0') # Read database sheet
        print(f"✅ Successfully read Excel file using pandas.")
        print(f"   Sheet contains {len(df)} rows.")
        
        # Check Columns
        cols = [c.strip() for c in df.columns]
        print(f"   Found Columns (First 10): {cols[:10]}")
        
        required = ['Type', 'AISC_Manual_Label', 'd', 'Zx', 'Sx', 'ry', 'J']
        missing = [req for req in required if req not in cols]
        
        if missing:
            print(f"❌ CRITICAL ERROR: Missing required columns: {missing}")
            print("   The code requires these exact column names to work.")
            print("   Please rename the columns in your Excel file to match.")
        else:
            print(f"✅ All required columns are present!")
            print("   The database should load correctly.")
            
    except ImportError:
        print(f"❌ ERROR: Missing libraries.")
        print("   Run: pip install pandas openpyxl")
    except Exception as e:
        print(f"❌ ERROR: Failed to read Excel file.")
        print(f"   Details: {e}")

print(f"--- DIAGNOSTIC END ---")
