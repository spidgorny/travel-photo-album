#!/bin/sh
set -eu

OLLAMA_PID=""

cleanup() {
	if [ -n "${OLLAMA_PID:-}" ]; then
		kill "$OLLAMA_PID" 2>/dev/null || true
	fi
}

trap cleanup EXIT INT TERM

if [ "${DESCRIPTION_WORKER_EMBEDDED_OLLAMA:-0}" = "1" ]; then
	if ! command -v ollama >/dev/null 2>&1; then
		OLLAMA_NO_START=1 sh -c "$(curl -fsSL https://ollama.com/install.sh)"
	fi

	ollama serve >/tmp/ollama.log 2>&1 &
	OLLAMA_PID=$!
fi

until curl -sf "${OLLAMA_BASE_URL:-http://host.docker.internal:11434}/api/tags" >/dev/null; do
	sleep 1
done

if [ -n "${OLLAMA_MODEL:-}" ] && [ "${DESCRIPTION_WORKER_EMBEDDED_OLLAMA:-0}" = "1" ]; then
	ollama pull "$OLLAMA_MODEL"
fi

exec npm run worker:description
