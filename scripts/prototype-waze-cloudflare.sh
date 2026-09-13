#!/usr/bin/env bash
# THROWAWAY PROTOTYPE: deploy, call, and remove an isolated Cloudflare Worker.

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CONFIG="$ROOT/wrangler.waze-prototype.jsonc"
WORKER_NAME="find-me-home-waze-prototype"
DEPLOYED=0

cleanup() {
  if [[ "$DEPLOYED" == 1 ]]; then
    printf '\nRemoving temporary Worker %s...\n' "$WORKER_NAME"
    pnpm exec wrangler delete --config "$CONFIG" --force || true
  fi
}
trap cleanup EXIT INT TERM

printf '\n[1/4] Verify Cloudflare access\n'
pnpm exec wrangler whoami

printf '\n[2/4] Deploy isolated temporary Worker\n'
read -r -p "Deploy $WORKER_NAME? It will not touch production. [y/N] " reply
[[ "$reply" =~ ^[Yy]$ ]] || exit 0
output=$(pnpm exec wrangler deploy --config "$CONFIG" 2>&1)
printf '%s\n' "$output"
DEPLOYED=1

worker_url=$(printf '%s\n' "$output" | grep -Eo 'https://[^[:space:]]+\.workers\.dev' | tail -n 1 || true)
if [[ -z "$worker_url" ]]; then
  read -r -p "Wrangler did not print the URL. Paste the temporary workers.dev URL: " worker_url
fi

printf '\n[3/4] Make one anonymous Waze request through Cloudflare\n'
curl --fail-with-body --show-error --silent \
  "$worker_url/?latitude=54.7&longitude=25.3&at=0"
printf '\n'

printf '\n[4/4] Remove temporary Worker\n'
pnpm exec wrangler delete --config "$CONFIG" --force
DEPLOYED=0
printf 'Temporary Worker removed.\n'
