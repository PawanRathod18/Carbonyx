set -e

echo "== CARBONYX setup =="

command -v node >/dev/null || { echo "ERROR: Node.js (>=18.17) is required."; exit 1; }
command -v python3 >/dev/null || { echo "ERROR: Python (>=3.10) is required."; exit 1; }

echo "-- installing contract toolchain (Hardhat) --"
( cd "$(dirname "$0")/contracts" && npm install )

echo "-- installing backend dependencies --"
( cd "$(dirname "$0")/backend" && python3 -m pip install -r requirements.txt )

echo ""
echo "Setup complete. Start everything with:  bash run_demo.sh"
