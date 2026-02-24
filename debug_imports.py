
import sys
import os
sys.path.append(os.getcwd())

def test_import(module_path):
    print(f"Importing {module_path}...")
    try:
        __import__(module_path)
        print(f"{module_path} imported successfully")
    except Exception as e:
        print(f"Error importing {module_path}: {e}")

test_import("fastapi")
test_import("app.core.config")
test_import("app.db.session")
test_import("app.db.base")
test_import("app.api.v1.router")
test_import("app.main")
