
import sys
import os
sys.path.append(os.getcwd())

print("DEBUG: Importing app.main...", flush=True)
from app.main import create_app

print("DEBUG: Calling create_app()...", flush=True)
try:
    app = create_app()
    print("DEBUG: create_app() SUCCESS", flush=True)
except Exception as e:
    print(f"DEBUG: create_app() FAILED: {e}", flush=True)
    import traceback
    traceback.print_exc()
