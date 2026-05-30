#!/bin/sh
set -eu

if ! command -v ollama >/dev/null 2>&1; then
	node /app/docker/description-worker/install-ollama.mjs
fi

ollama serve >/tmp/ollama.log 2>&1 &
OLLAMA_PID=$!

cleanup() {
	kill "$OLLAMA_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

until node -e "fetch(process.argv[1]).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))" "${OLLAMA_BASE_URL:-http://127.0.0.1:11434}/api/tags"; do
	sleep 1
done

if [ -n "${OLLAMA_MODEL:-}" ]; then
	ollama pull "$OLLAMA_MODEL"
fi

exec npm run worker:description
