set -e
cd "$(dirname "$0")"

LOG_DIR=/tmp/carbonyx
mkdir -p "$LOG_DIR"

cleanup() {
  echo ""
  echo "-- stopping services --"
  [ -n "$NODE_PID" ] && kill "$NODE_PID" 2>/dev/null
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

echo "== 1/4 starting Hardhat chain (localhost:8545) =="
( cd contracts && npx hardhat node ) > "$LOG_DIR/hardhat.log" 2>&1 &
NODE_PID=$!

echo "   waiting for the chain..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null --max-time 1 -X POST \
       -H 'Content-Type: application/json' \
       --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
       http://127.0.0.1:8545 > /dev/null; then
    break
  fi
  sleep 1
done
echo "   chain is up"

echo "== 2/4 deploying contracts =="
python3 scripts/deploy_contracts.py

echo "== 3/4 seeding demo data =="
python3 scripts/demo_seed.py || echo "   (seeding skipped/failed - the UI still works)"

echo "== 4/4 starting backend + UI =="
( cd backend && python3 run.py ) > "$LOG_DIR/backend.log" 2>&1 &
API_PID=$!

echo ""
echo "=========================================================="
echo "  CARBONYX is running:  http://localhost:8000"
echo "  Swagger API docs:    http://localhost:8000/docs"
echo "  logs:                $LOG_DIR/"
echo "  press Ctrl+C here to stop everything"
echo "=========================================================="

wait
