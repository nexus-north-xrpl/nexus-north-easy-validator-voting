// Settings for Easy Validator Voting.
//
// Everything lives in one file, <data dir>/config.json, readable only by the account that runs the app (mode 600).
// It is written by `npm run setup` on the server itself; the web page can never change it.
//
// What is in it:
//   rippledUrl      the rippled admin port on THIS machine, e.g. http://127.0.0.1:5005
//   operatorWallets the XRP Ledger address(es) allowed to confirm votes (public addresses, never secrets)
//   xaman           { apiKey, apiSecret } of YOUR OWN Xaman developer app (used only to talk to xumm.app)
//   telegram        optional { botToken, chatId } for alerts (used only to talk to api.telegram.org)
//   host, port      where the web page listens (127.0.0.1 by default: only this machine can open it)
//   closeToMajorityPct  when to send the "getting close to 80 %" alert (default 70)
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.EVV_DATA_DIR || './data');
export const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

export const DEFAULTS = {
  rippledUrl: 'http://127.0.0.1:5005',
  operatorWallets: [],
  xaman: { apiKey: '', apiSecret: '' },
  telegram: { botToken: '', chatId: '' },
  host: '127.0.0.1',
  port: 8742,
  closeToMajorityPct: 70,
};

// An XRP Ledger classic address: starts with r, 25-35 characters from the XRPL base58 alphabet.
export const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

// Only addresses on this machine are accepted for rippled, so the app can never be pointed at someone else's server.
export function isLoopbackUrl(u) {
  try { const h = new URL(u).hostname.replace(/^\[|\]$/g, ''); return h === '127.0.0.1' || h === 'localhost' || h === '::1'; } catch { return false; }
}

export function load() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw new Error('Could not read ' + CONFIG_FILE + ': ' + e.message); }
  const c = { ...DEFAULTS, ...saved, xaman: { ...DEFAULTS.xaman, ...(saved.xaman || {}) }, telegram: { ...DEFAULTS.telegram, ...(saved.telegram || {}) } };
  // environment overrides (handy for Docker); never required
  if (process.env.EVV_RIPPLED_URL) c.rippledUrl = process.env.EVV_RIPPLED_URL;
  if (process.env.EVV_HOST) c.host = process.env.EVV_HOST;
  if (process.env.EVV_PORT) c.port = Number(process.env.EVV_PORT);
  return c;
}

export function save(c) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const tmp = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, CONFIG_FILE);
  try { fs.chmodSync(CONFIG_FILE, 0o600); } catch { /* not supported on every file system */ }
}

// Problems that stop the app from starting safely. Returns a list of plain-English messages (empty = fine).
export function problems(c) {
  const p = [];
  if (!isLoopbackUrl(c.rippledUrl) && process.env.EVV_ALLOW_NON_LOCAL_RIPPLED !== '1') p.push('rippledUrl must point at this machine (127.0.0.1, localhost or ::1). The admin port should never be reachable from other machines.');
  if (!Array.isArray(c.operatorWallets) || !c.operatorWallets.length) p.push('No operator wallet is set. Run: npm run setup');
  for (const w of c.operatorWallets || []) if (!ADDRESS.test(w)) p.push('"' + w + '" is not an XRP Ledger address.');
  if (!(c.port > 0 && c.port < 65536)) p.push('port must be a number between 1 and 65535.');
  return p;
}
