// Voting. Nothing changes on rippled until the operator signs the matching Xaman request with an operator wallet.
//
//   1. start(id, yes|no)  -> checks the amendment can be voted on, creates a Xaman SignIn request for this one vote
//   2. finish(pid)        -> asks Xaman whether it was signed and by which wallet; if (and only if) the signer is an
//                            operator wallet, sends `feature { feature: id, vetoed: <no> }` to rippled, reads the vote
//                            back to confirm it, and writes one line to <data dir>/votes.jsonl
// Each request is single-use and expires after 5 minutes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { read } from './amendments.js';
import { DATA_DIR } from './config.js';

export const LOG_FILE = path.join(DATA_DIR, 'votes.jsonl');
const EXPIRES_MS = 5 * 60 * 1000;
const fail = (status, message) => Object.assign(new Error(message), { status });

export function voteLog(limit = 200) {
  try { return fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).slice(-limit); } catch { return []; }
}
function writeLog(entry) { fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 }); fs.appendFileSync(LOG_FILE, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n', { mode: 0o600 }); }
const short = (a) => a ? a.slice(0, 6) + '…' + a.slice(-4) : '?';

export function voting({ rippled, xaman, wallets, testSign, notify }) {
  const pending = new Map();   // request id -> { id, name, vote, at, uuid?, memo? }
  const sweep = () => { for (const [k, p] of pending) if (Date.now() - p.at > EXPIRES_MS) pending.delete(k); };

  async function start(id, vote) {
    if (vote !== 'yes' && vote !== 'no') throw fail(400, 'Vote must be yes or no.');
    const { amendments, server } = await read(rippled);
    if (!server.synced) throw fail(503, server.amendmentsLoaded === false && /full|proposing|validating/.test(server.state) ? 'rippled is still loading amendment status from the ledger. Voting pauses for a minute or two.' : 'rippled is still catching up (' + server.state + '). Voting pauses until it is in sync.');
    const a = amendments.find(x => x.id === id); if (!a) throw fail(404, 'Unknown amendment.');
    if (a.enabled) throw fail(400, a.name + ' is already enabled; votes no longer matter.');
    if (a.obsolete) throw fail(400, a.name + ' is obsolete and cannot be voted on.');
    sweep(); if (pending.size > 20) throw fail(429, 'Too many open vote requests. Wait a few minutes.');
    const pid = crypto.randomBytes(16).toString('hex'), instruction = `Confirm: this validator votes ${vote.toUpperCase()} on ${a.name} (${server.network}).`;
    const p = { id, name: a.name, vote, before: a.vote, at: Date.now() }, out = { pid, name: a.name, vote, instruction, expiresInSec: EXPIRES_MS / 1000 };
    if (xaman.configured) { const r = await xaman.create(pid, instruction); p.uuid = r.uuid; out.xaman = { qr: r.qr, link: r.link }; }
    if (testSign) { p.memo = testSign.challenge(pid); out.test = p.memo; }
    if (!p.uuid && !p.memo) throw fail(503, 'Xaman is not set up. Run: npm run setup');
    pending.set(pid, p); return out;
  }

  async function finish(pid, testTx) {
    sweep(); const p = pending.get(String(pid || '')); if (!p) throw fail(410, 'This vote request has expired or was already used. Press the button again.');
    let wallet, via;
    if (testTx && testSign && p.memo) { wallet = await testSign.verify(testTx, p.memo); via = 'test signature'; }
    else if (p.uuid) {
      const s = await xaman.status(p.uuid);
      if (s.declined || s.expired) { pending.delete(pid); throw fail(409, s.declined ? 'Declined in Xaman. Nothing was changed.' : 'The Xaman request expired. Nothing was changed.'); }
      if (!s.signed) return { waiting: true, opened: s.opened };
      if (s.identifier !== pid) throw fail(400, 'Sign request mismatch. Nothing was changed.');
      wallet = s.wallet; via = 'Xaman';
    } else return { waiting: true };
    pending.delete(pid);   // single use, whatever happens next
    if (!wallets.includes(wallet)) {
      writeLog({ amendment: p.name, id: p.id, vote: p.vote, wallet, via, ok: false, error: 'not an operator wallet' });
      throw fail(403, 'Signed by ' + short(wallet) + ', which is not an operator wallet. Nothing was changed.');
    }
    let after = null, error = null;
    try {
      const r = await rippled.call('feature', { feature: p.id, vetoed: p.vote === 'no' });
      const f = r[p.id] || Object.values(r).find(x => x && x.name === p.name) || {};
      after = f.vetoed === true ? 'no' : f.vetoed === false ? 'yes' : String(f.vetoed);
      if (after !== p.vote) error = 'rippled reports the vote as ' + after;
    } catch (e) { error = e.message; }
    const ok = !error;
    writeLog({ amendment: p.name, id: p.id, vote: p.vote, before: p.before, after, wallet, via, ok, error });
    notify(ok ? `🗳 Vote saved: ${p.vote.toUpperCase()} on ${p.name} (signed by ${short(wallet)} via ${via}).` : `⚠️ Vote on ${p.name} failed: ${error}`).catch(() => {});
    if (!ok) throw fail(502, 'rippled did not accept the vote: ' + error);
    return { ok: true, name: p.name, vote: p.vote, wallet };
  }
  return { start, finish };
}
