#!/usr/bin/env bash
# Easy Validator Voting - installer for Linux with systemd (Ubuntu, Debian, Fedora, RHEL, ...).
#
# Run it on the machine where your rippled runs:
#   curl -fsSL https://raw.githubusercontent.com/nexus-north-xrpl/nexus-north-easy-validator-voting/main/install.sh -o install.sh
#   less install.sh          # read it first - it is short
#   sudo bash install.sh
# or, from a downloaded copy of the repository:   sudo ./install.sh
#
# What it does (and nothing else):
#   1. checks for Node.js 20 or newer (it does not install Node for you)
#   2. creates a system user "evv" with no login shell and no home directory
#   3. copies the app to /opt/easy-validator-voting (owned by root, read-only for the app)
#   4. creates /var/lib/easy-validator-voting for settings and the vote log (only "evv" can read it)
#   5. runs the guided setup (rippled admin URL, your operator wallet, your Xaman app, optional Telegram)
#   6. installs and starts the systemd service "easy-validator-voting" (sandboxed; see the unit below)
# It never opens firewall ports, never changes rippled or rippled.cfg, and needs no npm packages.
set -euo pipefail

REPO="${EVV_REPO:-nexus-north-xrpl/nexus-north-easy-validator-voting}"
BRANCH="${EVV_BRANCH:-main}"
APP_DIR=/opt/easy-validator-voting
DATA_DIR=/var/lib/easy-validator-voting
SERVICE=easy-validator-voting
APP_USER=evv

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\nError: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "please run with sudo:  sudo bash install.sh"
[ "$(uname -s)" = "Linux" ] || die "this installer is for Linux. On other systems use Docker (see README)."
command -v systemctl >/dev/null || die "systemd was not found. Use Docker instead (see README)."

# 1. Node.js 20+
command -v node >/dev/null || die "Node.js 20 or newer is needed. Install it from https://nodejs.org (or your package manager) and run this again."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node.js $NODE_MAJOR found; version 20 or newer is needed."
NODE_BIN="$(command -v node)"

# 2. the app's own user
if ! id "$APP_USER" >/dev/null 2>&1; then
  say "Creating system user $APP_USER"
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$APP_USER"
fi

# 3. the app files: from this folder if it is a copy of the repository, otherwise downloaded from GitHub
SRC="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
TMP=""
if [ -z "$SRC" ] || [ ! -f "$SRC/src/server.js" ]; then
  command -v curl >/dev/null || die "curl is needed to download the app."
  TMP="$(mktemp -d)"; trap '[ -n "$TMP" ] && rm -rf "$TMP"' EXIT
  say "Downloading $REPO ($BRANCH)"
  curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" | tar -xz -C "$TMP" --strip-components=1
  SRC="$TMP"
fi
say "Installing to $APP_DIR"
mkdir -p "$APP_DIR"
rm -rf "$APP_DIR/src" "$APP_DIR/public"
cp -r "$SRC/src" "$SRC/public" "$SRC/package.json" "$SRC/LICENSE" "$SRC/README.md" "$APP_DIR/"
chown -R root:root "$APP_DIR"; chmod -R go-w "$APP_DIR"

# 4. settings and vote log
mkdir -p "$DATA_DIR"; chown "$APP_USER:$APP_USER" "$DATA_DIR"; chmod 700 "$DATA_DIR"

# 5. guided setup (reads answers from your terminal even when this script was piped)
say "Setup"
if (exec </dev/tty) 2>/dev/null; then
  ( cd "$APP_DIR" && runuser -u "$APP_USER" -- env EVV_DATA_DIR="$DATA_DIR" "$NODE_BIN" src/setup.js < /dev/tty )
else
  echo "No terminal found; run the setup later with:  sudo -u $APP_USER EVV_DATA_DIR=$DATA_DIR $NODE_BIN $APP_DIR/src/setup.js"
fi

# 6. the service, sandboxed: it can only write its own data folder and only use the network (no other system access)
say "Installing the systemd service $SERVICE"
cat > "/etc/systemd/system/$SERVICE.service" <<UNIT
[Unit]
Description=Easy Validator Voting (local amendment voting page for rippled)
After=network-online.target rippled.service
Wants=network-online.target

[Service]
User=$APP_USER
Group=$APP_USER
Environment=EVV_DATA_DIR=$DATA_DIR
WorkingDirectory=$APP_DIR
ExecStart=$NODE_BIN $APP_DIR/src/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ReadWritePaths=$DATA_DIR
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6
RestrictNamespaces=yes
LockPersonality=yes
MemoryDenyWriteExecute=no
CapabilityBoundingSet=
SystemCallArchitectures=native

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now "$SERVICE"
sleep 2
if systemctl is-active --quiet "$SERVICE"; then
  PORT="$(runuser -u "$APP_USER" -- "$NODE_BIN" -e "try{const c=require('$DATA_DIR/config.json');console.log(c.port||8742)}catch{console.log(8742)}")"
  say "Done. Easy Validator Voting is running."
  echo "Open http://127.0.0.1:$PORT on this machine."
  echo "From your laptop or phone, use an SSH tunnel:  ssh -L $PORT:127.0.0.1:$PORT you@this-server   then open http://127.0.0.1:$PORT"
  echo "Logs: journalctl -u $SERVICE -f      Change settings: sudo -u $APP_USER EVV_DATA_DIR=$DATA_DIR $NODE_BIN $APP_DIR/src/setup.js && sudo systemctl restart $SERVICE"
else
  echo "The service did not start. See: journalctl -u $SERVICE -n 50"
  exit 1
fi
