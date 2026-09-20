import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))

try:
    import fastapi, uvicorn, web3, eth_tester
    have_deps = True
except ImportError:
    have_deps = False

if not have_deps:
    print("[i] First run: installing Python packages, please wait...")
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r",
                    os.path.join(ROOT, "backend", "requirements.txt")],
                   check=True)

os.chdir(os.path.join(ROOT, "backend"))
subprocess.run([sys.executable, "run.py"])
