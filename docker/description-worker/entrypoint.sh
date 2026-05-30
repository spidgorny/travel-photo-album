#!/bin/sh
set -eu

if ! command -v ollama >/dev/null 2>&1; then
	OLLAMA_NO_START=1 sh -c "$(curl -fsSL https://ollama.com/install.sh)"
fi

ollama serve >/tmp/ollama.log 2>&1 &
OLLAMA_PID=$!

cleanup() {
	kill "$OLLAMA_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

until curl -sf "${OLLAMA_BASE_URL:-http://127.0.0.1:11434}/api/tags" >/dev/null; do
	sleep 1
done

if [ -n "${OLLAMA_MODEL:-}" ]; then
	ollama pull "$OLLAMA_MODEL"
fi

exec npm run worker:description
