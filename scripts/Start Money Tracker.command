#!/bin/bash
# Double-click this file to set up (first run) and start Money Tracker.
# Safe to run again any time — it only does first-time setup once.
set -e
cd "$(dirname "$0")/.."

# If anything below fails, say so and keep the window open — otherwise a
# failure just closes the Terminal window with no visible explanation.
on_error() {
  echo ""
  echo "!!! Something went wrong (see the message above this line) !!!"
  echo "Press Return to close this window."
  read -r
}
trap on_error ERR

echo "=== Money Tracker ==="
echo ""

# --- 1. Homebrew (installs git/python/node if you don't already have them) ---
if ! command -v brew &>/dev/null; then
  echo "Installing Homebrew (a Mac package manager) — you'll be asked for your Mac password..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [ -d "/opt/homebrew/bin" ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  else
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi

command -v python3 &>/dev/null || brew install python@3.11
command -v node &>/dev/null || brew install node

# --- 2. Backend setup ---
cd backend

if [ ! -d ".venv" ]; then
  echo "Setting up the backend (first time only, may take a minute)..."
  python3 -m venv .venv
fi
source .venv/bin/activate
echo "Installing backend dependencies (first time only, may take a minute)..."
pip install -r requirements.txt

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo ""
  echo "=== One-time setup: connect your own bank account ==="
  echo "1. Go to https://dashboard.plaid.com/signup and make a free account."
  echo "2. Once signed in, click 'Keys' in the left sidebar."
  echo "3. Copy the 'client_id' and the 'Production' secret shown there."
  echo ""
  read -p "Paste your Plaid Client ID, then press Enter: " PLAID_ID
  read -p "Paste your Plaid Production Secret, then press Enter: " PLAID_SECRET
  # macOS ships BSD sed, which needs an explicit (empty) backup extension after -i.
  sed -i '' "s#^PLAID_CLIENT_ID=.*#PLAID_CLIENT_ID=${PLAID_ID}#" .env
  sed -i '' "s#^PLAID_SECRET=.*#PLAID_SECRET=${PLAID_SECRET}#" .env
  sed -i '' "s#^PLAID_ENV=.*#PLAID_ENV=production#" .env
  echo ""
  echo "Saved. You won't need to do this again."
fi

uvicorn app.main:app --port 8000 &
BACKEND_PID=$!
cd ..

# --- 3. Frontend setup ---
cd frontend
if [ ! -d "node_modules" ]; then
  echo "Setting up the app itself (first time only, may take a minute or two)..."
  npm install
fi
npm run dev &
FRONTEND_PID=$!
cd ..

cleanup() {
  echo ""
  echo "Stopping Money Tracker..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
}
trap cleanup EXIT

echo "Waiting for the app to start..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null "http://localhost:5173"; then
    break
  fi
  sleep 1
done
open "http://localhost:5173"

echo ""
echo "Money Tracker is running in your browser at http://localhost:5173"
echo "Leave this window open while you're using it."
echo "To stop, close this window or press Control+C."
wait
