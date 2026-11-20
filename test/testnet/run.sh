#!/usr/bin/env bash
# End-to-end test against a THROWAWAY Testnet rippled. Development only; never point this at a real server.
#
#   RIPPLED_IMAGE=<a rippled or xrpld image> bash test/testnet/run.sh
#   SEED_DB=<folder>   optional: copy of an existing TESTNET rippled database folder, so the throwaway node starts
#                      almost in sync (a fresh Testnet sync can take an hour). The copy is used, never the original.
#
# 1. starts a fresh Testnet rippled in its own Docker network (no ports published to the host or the internet)
# 2. makes it a throwaway Testnet validator with a freshly generated validation seed (kept only in the temp folder),
#    so the "support from other validators" numbers appear
# 3. starts the app next to it in test mode (votes confirmed with locally signed test proofs instead of Xaman)
# 4. runs test/e2e.mjs (Playwright): checks + the README screenshots
# 5. restarts rippled and checks that the vote survived, then puts the vote back
# 6. removes everything it created (set KEEP=1 to keep it for a look)
set -euo pipefail
cd "$(dirname "$0")/../.."
IMG="${RIPPLED_IMAGE:?set RIPPLED_IMAGE to a rippled image}"; BIN="${RIPPLED_BIN:-/usr/bin/xrpld}"
RUN="evv-test-$$"; NET="$RUN-net"; W="$(mktemp -d)"; PW="mcr.microsoft.com/playwright:v1.65.0-noble"
cleanup() { if [ "${KEEP:-0}" = 1 ]; then echo "kept: $RUN-rippled $RUN-app, folder $W"; return; fi
  docker rm -f "$RUN-rippled" "$RUN-app" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; rm -rf "$W"; }
trap cleanup EXIT
mkdir -p "$W/db" "$W/log" "$W/data" "$W/nm" "$W/nm-app"; cp test/testnet/rippled.cfg test/testnet/validators.txt "$W/"
if [ -n "${SEED_DB:-}" ]; then echo "copying the Testnet database from $SEED_DB"; cp -a "$SEED_DB"/. "$W/db/"; fi
chmod -R 777 "$W"
docker network create "$NET" >/dev/null

start_rippled() {
  docker rm -f "$RUN-rippled" >/dev/null 2>&1 || true
  docker run -d --name "$RUN-rippled" --network "$NET" --memory "${RIPPLED_MEMORY:-16g}" ${CPUSET:+--cpuset-cpus "$CPUSET"} \
    -v "$W/rippled.cfg:/etc/xrpld/xrpld.cfg:ro" -v "$W/validators.txt:/etc/xrpld/validators.txt:ro" -v "$W/db:/var/lib/xrpld/db" -v "$W/log:/var/log/xrpld" \
    --entrypoint "$BIN" "$IMG" --conf /etc/xrpld/xrpld.cfg >/dev/null
}
# admin calls from inside the rippled container's own network (the admin port is 127.0.0.1 there)
rpc() { docker run --rm --network "container:$RUN-rippled" node:22-alpine wget -qO- --header 'Content-Type: application/json' --post-data "$1" http://127.0.0.1:5005 2>/dev/null || true; }
wait_synced() {
  for _ in $(seq 1 180); do s="$(rpc '{"method":"server_info"}' | grep -oE '"server_state" *: *"[a-z]+"' | grep -oE '[a-z]+"$' | tr -d '"' || true)"
    case "$s" in full|proposing|validating) echo "  rippled is $s"; return 0;; esac; sleep 5; done
  echo "rippled did not sync"; return 1
}
start_app() {
  docker rm -f "$RUN-app" >/dev/null 2>&1 || true
  # the app runs from a copy, with the test-only `xrpl` package next to it; it waits until the test has written the settings
  docker run -d --name "$RUN-app" --network "container:$RUN-rippled" -v "$PWD:/src:ro" -v "$W/data:/data" -v "$W/nm-app:/deps" -e EVV_DATA_DIR=/data -e EVV_TEST_SIGN=1 node:22-alpine \
    sh -c 'mkdir -p /work && cp -r /src/src /src/public /src/package.json /work/ && cd /work && ([ -d /deps/node_modules/xrpl ] || npm install --prefix /deps xrpl@4.4.2 --no-audit --no-fund --silent) && ln -s /deps/node_modules /work/node_modules && until [ -f /data/config.json ]; do sleep 1; done; exec node src/server.js' >/dev/null
}
e2e() { docker run --rm --network "container:$RUN-rippled" -v "$PWD:/repo" -v "$W/data:/data" -v "$W/nm:/nm" -w /repo/test "$PW" \
  sh -c '([ -d /nm/playwright ] || (npm install --prefix /tmp/p playwright@1.65.0 xrpl@4.4.2 --no-audit --no-fund --silent && cp -r /tmp/p/node_modules/. /nm/)) && NODE_PATH=/nm node e2e.cjs '"$1"; }

echo "1. starting a throwaway Testnet rippled"; start_rippled; wait_synced
echo "2. making it a throwaway Testnet validator"
SEED="$(rpc '{"method":"validation_create"}' | grep -oE '"validation_seed" *: *"[^"]+"' | grep -oE '"[^"]+"$' | tr -d '"')"
[ -n "$SEED" ] || { echo "could not create a validation seed"; exit 1; }
printf '\n[validation_seed]\n%s\n' "$SEED" >> "$W/rippled.cfg"; unset SEED
start_rippled; wait_synced
echo "3. starting the app (test mode)"; start_app
echo "4. end-to-end test"; e2e main || { echo '--- app log:'; docker logs --tail 40 "$RUN-app" 2>&1; exit 1; }
echo "5. restarting rippled to check the vote was saved by rippled"; docker restart "$RUN-rippled" >/dev/null; wait_synced; docker restart "$RUN-app" >/dev/null; sleep 6
e2e after-restart || { echo '--- app log:'; docker logs --tail 40 "$RUN-app" 2>&1; exit 1; }
