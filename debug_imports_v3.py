
import sys
import os
import time

sys.path.append(os.getcwd())

def test_import(module_path):
    print(f"DEBUG: Importing {module_path}...", flush=True)
    start = time.time()
    try:
        __import__(module_path, fromlist=['*'])
        print(f"DEBUG: {module_path} SUCCESS in {time.time()-start:.2f}s", flush=True)
    except Exception as e:
        print(f"DEBUG: {module_path} ERROR: {e}", flush=True)

test_import("app.core.config")
test_import("app.db.session")
test_import("app.db.base")
test_import("app.api.v1.auth")
test_import("app.api.v1.meetings")
test_import("app.api.v1.ai")
test_import("app.api.v1.tasks")
test_import("app.api.v1.process_meeting")
test_import("app.api.v1.video_meeting")
test_import("app.api.v1.integrations")
test_import("app.api.v1.router")
test_import("app.main")
print("DEBUG: ALL IMPORTS SUCCESSFUL")
