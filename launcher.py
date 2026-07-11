import subprocess
import os

BACKEND_DIR = r"C:\Users\AMIN\Desktop\Fahim"
FRONTEND_DIR = r"C:\Users\AMIN\Desktop\Fahim\dashboard"

backend_cmd = (
    r'cmd /k ".venv\Scripts\activate.bat && '
    r'uvicorn api.main:app --reload --port 8000"'
)

frontend_cmd = r'cmd /k "npm run dev"'

subprocess.Popen(
    backend_cmd,
    cwd=BACKEND_DIR,
    creationflags=subprocess.CREATE_NEW_CONSOLE,
)

subprocess.Popen(
    frontend_cmd,
    cwd=FRONTEND_DIR,
    creationflags=subprocess.CREATE_NEW_CONSOLE,
)