#!/usr/bin/env node
// Easy Validator Voting: a small local web page for XRP Ledger validator operators.
//
// What this program does, and nothing else:
//   - serves the page in ./public on http://127.0.0.1:8742 (by default only this machine can open it)
//   - reads amendments from rippled's admin port on this machine (server_info, feature, ledger_entry)
//   - after a vote is confirmed in Xaman by an operator wallet, sets that vote with rippled's `feature` command
//   - optionally sends Telegram alerts
// Outside addresses it ever contacts: xumm.app (sign requests) and, only if you set it up, api.telegram.org.
// No analytics, no tracking, no update checks, nothing loaded from other websites.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as config from './config.js';
import { client } from './rippled.js';
import { xaman as xamanClient } from './xaman.js';
import { read } from './amendments.js';
import { voting, voteLog } from './votes.js';
import { telegram, watch } from './alerts.js';
import { testSigner } from './testsign.js';

const VERSION = '1.0.0';
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const log = (m) => console.log(new Date().toISOString() + ' ' + m);

const cfg = config.load();
const bad = config.problems(cfg);
if (bad.length) { console.error('Easy Validator Voting cannot start:\n - ' + bad.join('\n - ') + '\nSettings file: ' + config.CONFIG_FILE); process.exit(1); }

const rippled = client(cfg.rippledUrl);
const xaman = xamanClient(cfg.xaman);
const notify = telegram(cfg.telegram);
let testSign = null;
if (process.env.EVV_TEST_SIGN === '1') {
  const info = await rippled.call('server_info');
  testSign = await testSigner(info.info && info.info.network_id || 0);   // throws on Mainnet
  log('TEST MODE: votes can be confirmed with locally signed test proofs (Testnet/Devnet only)');
}
const votes = voting({ rippled, xaman, wallets: cfg.operatorWallets, testSign, notify });
const alerts = watch({ rippled, notify, closeToMajorityPct: cfg.closeToMajorityPct, log });

// ---------- http ----------
// Strict browser rules: this page may only load its own files; QR codes arrive as data: images.
const HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { ...HEADERS, 'Content-Type': type }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };

// Changes (vote buttons) must come from this page itself: JSON, same origin. Another website can't press them for you.
function sameOrigin(req) {
  const site = req.headers['sec-fetch-site'], origin = req.headers.origin, host = req.headers.host;
  if (site && site !== 'same-origin') return false;
  if (origin && host && origin.replace(/^https?:\/\//, '') !== host) return false;
  return /^application\/json/.test(req.headers['content-type'] || '');
}
async function body(req) { let s = ''; for await (const c of req) { s += c; if (s.length > 20000) throw Object.assign(new Error('Request too big.'), { status: 413 }); } try { return JSON.parse(s || '{}'); } catch { throw Object.assign(new Error('Bad request.'), { status: 400 }); } }

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true, version: VERSION });
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const s = await read(rippled);
      return send(res, 200, { ...s, version: VERSION, operatorWallets: cfg.operatorWallets.map(w => w.slice(0, 6) + '…' + w.slice(-4)), xamanReady: xaman.configured, testMode: !!testSign,
        alerts: { telegram: !!(cfg.telegram.botToken && cfg.telegram.chatId), closeToMajorityPct: cfg.closeToMajorityPct, lastCheck: alerts.lastCheck() }, votes: voteLog(30).reverse() });
    }
    if (req.method === 'POST' && (url.pathname === '/api/vote/start' || url.pathname === '/api/vote/finish')) {
      if (!sameOrigin(req)) return send(res, 403, { error: 'Forbidden.' });
      const b = await body(req);
      return send(res, 200, url.pathname.endsWith('start') ? await votes.start(String(b.id || ''), b.vote) : await votes.finish(b.pid, b.tx));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed.' });
    // the page's own files
    const f = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!/^[\w.-]+$/.test(f) || !TYPES[path.extname(f)]) return send(res, 404, 'Not found', 'text/plain');
    fs.readFile(path.join(PUBLIC, f), (err, data) => err ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, data, TYPES[path.extname(f)]));
  } catch (e) {
    send(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong: ' + e.message });
  }
}).listen(cfg.port, cfg.host, () => {
  log(`Easy Validator Voting ${VERSION} on http://${cfg.host.includes(':') ? '[' + cfg.host + ']' : cfg.host}:${cfg.port}  (rippled admin: ${cfg.rippledUrl})`);
  if (!['127.0.0.1', 'localhost', '::1'].includes(cfg.host)) log('NOTE: the page is reachable from other machines on your network. Every vote still needs your Xaman signature, but consider an SSH tunnel instead (see README).');
  if (!xaman.configured && !testSign) log('NOTE: Xaman is not set up, so votes cannot be confirmed yet. Run: npm run setup');
});
