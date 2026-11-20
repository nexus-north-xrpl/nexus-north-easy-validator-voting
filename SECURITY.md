# Security

Easy Validator Voting runs next to your validator, so it is built to do as little as possible.

- **rippled:** only the admin port on this machine, with only three commands (`server_info`, `feature`, `ledger_entry`). See `src/rippled.js`, which is the only file that talks to rippled.
- **Votes:** set only after a Xaman SignIn signed by one of your operator wallets. See `src/votes.js`.
- **Keys:** no wallet secrets, seeds or private keys, ever. Your Xaman developer app's API key and secret stay in `config.json` (mode 600) and go only to xumm.app.
- **The web page:** binds to 127.0.0.1 by default. It sends a strict Content-Security-Policy, accepts changes only from the same origin, and can't change settings.
- **Outside contact:** only xumm.app and, if you enable alerts, api.telegram.org. No analytics or tracking.

## Reporting a problem

If you find a security problem, please **don't open a public issue**. Use GitHub's private vulnerability reporting ("Report a vulnerability" on the repository's Security tab). Please include what you found and how to reproduce it.
