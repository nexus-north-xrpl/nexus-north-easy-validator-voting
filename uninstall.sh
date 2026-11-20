#!/usr/bin/env bash
# Removes Easy Validator Voting. Your votes stay in rippled (they are rippled's own setting).
# Your settings and vote log in /var/lib/easy-validator-voting are kept unless you add --purge.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "please run with sudo"; exit 1; }
systemctl disable --now easy-validator-voting 2>/dev/null || true
rm -f /etc/systemd/system/easy-validator-voting.service
systemctl daemon-reload
rm -rf /opt/easy-validator-voting
if [ "${1:-}" = "--purge" ]; then
  rm -rf /var/lib/easy-validator-voting
  userdel evv 2>/dev/null || true
  echo "Removed the app, its settings and its vote log."
else
  echo "Removed the app. Settings and vote log kept in /var/lib/easy-validator-voting (run with --purge to delete them)."
fi
