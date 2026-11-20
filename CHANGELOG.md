# Changelog

## 1.0.0

- First version:
  - every amendment in plain English, with support from other validators, days left at majority, and your current vote;
  - Yes / No buttons, each vote confirmed with a Xaman sign request from your operator wallet;
  - votes set with rippled's `feature` command (saved by rippled), plus a local vote log;
  - optional Telegram alerts (new amendments, 70 % support on ones you have not voted on).
- Linux installer with a sandboxed systemd service, and Docker / Docker Compose.
- No npm dependencies at run time.
