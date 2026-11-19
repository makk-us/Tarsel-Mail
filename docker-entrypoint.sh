#!/bin/sh
set -eu

OLLAMA_PID=""
APP_PID=""

cleanup() {
  if [ -n "$APP_PID" ]; then
    kill -TERM "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
  if [ -n "$OLLAMA_PID" ]; then
    kill -TERM "$OLLAMA_PID" 2>/dev/null || true
    wait "$OLLAMA_PID" 2>/dev/null || true
  fi
  exit 0
}

trap cleanup TERM INT

mkdir -p "${DATA_DIR:-/data}" "${OLLAMA_MODELS:-/data/ollama}"

BASE_URL="${AI_BASE_URL:-http://127.0.0.1:11434/v1}"

case "$BASE_URL" in
  http://127.0.0.1:*|http://localhost:*|http://\[::1\]:*)
    echo "Starting embedded local Ollama daemon on ${OLLAMA_HOST:-127.0.0.1:11434}..."
    ollama serve >/tmp/ollama.log 2>&1 &
    OLLAMA_PID="$!"

    i=0
    until node -e "fetch('http://127.0.0.1:11434/api/tags').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; do
      i=$((i + 1))
      if [ "$i" -ge 30 ]; then
        echo "Warning: Embedded Ollama did not respond within 15s; continuing with local fallback."
        break
      fi
      sleep 0.5
    done

    if [ "${OLLAMA_AUTO_PULL:-true}" = "true" ] && [ -n "${AI_MODEL:-}" ]; then
      (
        TARGET_MODEL="${AI_MODEL}"
        case "$TARGET_MODEL" in
          *:*) ;;
          *) TARGET_MODEL="${TARGET_MODEL}:latest" ;;
        esac
        if ! ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -Fxq "$TARGET_MODEL"; then
          echo "Pulling local Ollama model ${AI_MODEL} in background..."
          ollama pull "${AI_MODEL}" >/tmp/ollama-pull.log 2>&1 || echo "Warning: Auto-pull for ${AI_MODEL} did not finish; pull manually in Settings."
        fi
      ) &
    fi
    ;;
  *)
    echo "Using configured local/LAN Ollama endpoint: ${BASE_URL}"
    ;;
esac

node server.ts &
APP_PID="$!"
wait "$APP_PID"
