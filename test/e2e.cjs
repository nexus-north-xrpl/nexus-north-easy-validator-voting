// End-to-end test (development only), run by test/testnet/run.sh next to a THROWAWAY Testnet rippled.
//   node e2e.cjs main            checks + vote + screenshots (docs/screenshots)
//   node e2e.cjs after-restart   after rippled was restarted: the vote is still there; then it is put back
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright'), xrpl = require('xrpl');
const APP = 'http://127.0.0.1:8742', DATA = '/data', SHOTS = path.join(__dirname, '..', 'docs', 'screenshots');
const phase = process.argv[2] || 'main';
let passed = 0, failed = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? passed++ : failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proof = (w, t) => w.sign({ TransactionType: 'AccountSet', Account: w.address, Fee: '12', Sequence: 1, Flags: 0, LastLedgerSequence: 1, Memos: [{ Memo: { MemoType: t.memoType, MemoData: t.memoData } }] }).tx_blob;
const api = (p, b, h = {}) => fetch(APP + p, b === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => ({})) }));
const voteVia = async (w, id, vote) => { const s = await api('/api/vote/start', { id, vote }); if (s.status !== 200) return s; return api('/api/vote/finish', { pid: s.j.pid, tx: proof(w, s.j.test) }); };
async function waitApp() { for (let i = 0; i < 300; i++) { try { if ((await fetch(APP + '/healthz')).ok) return; } catch { } await sleep(1000); } throw new Error('app did not start'); }

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  if (phase === 'main') {
    const op = xrpl.Wallet.generate(), stranger = xrpl.Wallet.generate();
    fs.writeFileSync(path.join(DATA, 'config.json'), JSON.stringify({ rippledUrl: 'http://127.0.0.1:5005', operatorWallets: [op.address], host: '127.0.0.1', port: 8742, closeToMajorityPct: 70, xaman: { apiKey: '', apiSecret: '' }, telegram: { botToken: '', chatId: '' } }, null, 2));
    fs.writeFileSync(path.join(DATA, 'test-wallet.json'), JSON.stringify({ seed: op.seed }));   // throwaway Testnet test wallet, deleted with the temp folder
    await waitApp();
    let st = (await api('/api/state')).j;
    // a freshly started validator needs a voting round (flag ledger, about every 15 minutes) before support numbers appear
    for (let i = 0; i < 240 && !st.server.synced; i++) { await sleep(5000); st = (await api('/api/state')).j; }   // wait until amendment status is loaded
    console.log('  ready after waiting for rippled: ' + st.amendments.filter((a) => a.enabled).length + ' enabled amendments loaded');
    const open = st.amendments.filter((a) => !a.enabled && !a.obsolete);
    ok(st.server.network === 'Testnet' && st.amendments.length > 50, `reads rippled: ${st.amendments.length} amendments on ${st.server.network}, ${open.length} open`);
    ok(st.server.validator, 'this throwaway Testnet rippled is a validator: ' + (st.server.pubkey || '').slice(0, 10) + '…');
    ok(st.amendments.every((a) => a.name && a.summary), 'every amendment has a name and a plain-English summary');
    console.log('INFO support numbers: ' + (open.some((a) => a.supportPct != null) ? open.filter((a) => a.supportPct != null).length + ' open amendments show support' : 'not reported yet (rippled adds them after a voting round on a stable validator)'));
    ok(st.testMode && st.operatorWallets.length === 1, 'test mode on, one operator wallet set');
    const t = open.find((a) => a.vote === 'no') || open[0], want = t.vote === 'yes' ? 'no' : 'yes';
    // safety checks
    ok((await api('/api/vote/start', { id: t.id, vote: want }, { 'Sec-Fetch-Site': 'cross-site' })).status === 403, 'another website cannot press the vote buttons (403)');
    ok((await api('/api/vote/start', { id: st.amendments.find((a) => a.enabled).id, vote: 'no' })).status === 400, 'enabled amendments cannot be voted on');
    const s1 = await api('/api/vote/start', { id: t.id, vote: want });
    ok(s1.status === 200 && /Confirm: this validator votes/.test(s1.j.instruction), 'pressing a button only creates a sign request: "' + s1.j.instruction + '"');
    ok((await api('/api/state')).j.amendments.find((a) => a.id === t.id).vote === t.vote, 'before signing, nothing has changed in rippled');
    const bad = await api('/api/vote/finish', { pid: s1.j.pid, tx: proof(stranger, s1.j.test) });
    ok(bad.status === 403 && (await api('/api/state')).j.amendments.find((a) => a.id === t.id).vote === t.vote, 'signed by a wallet that is not the operator wallet: refused, nothing changed');
    ok((await api('/api/vote/finish', { pid: s1.j.pid, tx: proof(op, s1.j.test) })).status === 410, 'a used sign request cannot be used again');
    // the page
    const b = await chromium.launch(), errs = [];
    const page = async (phone) => { const c = await b.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' } : { viewport: { width: 1280, height: 860 }, colorScheme: 'light' });
      const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message)); await p.exposeFunction('evvTestSignNode', (x) => proof(op, x));
      await p.addInitScript(() => { window.evvTestSign = (x) => window.evvTestSignNode(x); }); await p.goto(APP); await p.waitForSelector('.card h3'); await sleep(600); return p; };
    const p = await page(false);
    await p.screenshot({ path: path.join(SHOTS, '1-amendments-desktop.png') });
    await p.click(`[data-id="${t.id}"][data-v="${want}"]`); await p.waitForFunction(() => /Saved: this validator now votes/.test(document.getElementById('msg').textContent), null, { timeout: 30000 });
    ok((await api('/api/state')).j.amendments.find((a) => a.id === t.id).vote === want, `voted ${want.toUpperCase()} on ${t.name} from the page (signed by the operator wallet): rippled now says ${want.toUpperCase()}`);
    await sleep(800); await p.screenshot({ path: path.join(SHOTS, '2-after-vote-desktop.png') });
    await p.click('[data-tab="log"]'); await sleep(300); await p.screenshot({ path: path.join(SHOTS, '3-vote-log-desktop.png') });
    await p.click('[data-tab="about"]'); await sleep(300); await p.screenshot({ path: path.join(SHOTS, '4-about-desktop.png') });
    const q = await page(true); await q.screenshot({ path: path.join(SHOTS, '5-amendments-phone.png') });
    ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no sideways scrolling');
    ok(await q.$$eval('.btn', (bs) => bs.every((x) => x.getBoundingClientRect().height >= 40)), 'phone: buttons at least 40 px tall');
    await q.evaluate(() => { window.evvTestSign = undefined; }); await q.click(`[data-id="${t.id}"][data-v="${t.vote}"]`); await q.waitForSelector('#mCancel'); await sleep(400);
    await q.screenshot({ path: path.join(SHOTS, '6-confirm-in-xaman-phone.png') }); await q.click('#mCancel'); await sleep(500);
    ok((await api('/api/state')).j.amendments.find((a) => a.id === t.id).vote === want, 'cancelled sign request: nothing changed');
    const log = (await api('/api/state')).j.votes; ok(log.some((v) => v.ok && v.wallet === op.address && v.vote === want) && log.some((v) => !v.ok && v.wallet === stranger.address), 'vote log: the saved vote and the refused one, with time and wallet');
    ok(errs.length === 0, 'page errors: ' + (errs.join(' | ') || 'none'));
    fs.writeFileSync(path.join(DATA, 'test-state.json'), JSON.stringify({ id: t.id, name: t.name, original: t.vote, want }));
    await b.close();
  } else {
    await waitApp(); const ts = JSON.parse(fs.readFileSync(path.join(DATA, 'test-state.json'), 'utf8')), op = xrpl.Wallet.fromSeed(JSON.parse(fs.readFileSync(path.join(DATA, 'test-wallet.json'), 'utf8')).seed);
    let st = null; for (let i = 0; i < 60; i++) { st = (await api('/api/state')).j; if (st.server && st.server.synced) break; await sleep(5000); }
    ok(st.amendments.find((a) => a.id === ts.id).vote === ts.want, `after restarting rippled, ${ts.name} still votes ${ts.want.toUpperCase()} (rippled saved it)`);
    const back = await voteVia(op, ts.id, ts.original); ok(back.status === 200 && (await api('/api/state')).j.amendments.find((a) => a.id === ts.id).vote === ts.original, `vote put back to ${ts.original.toUpperCase()}`);
  }
  console.log(`${phase}: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('CRASH', e.stack.split('\n').slice(0, 3).join(' | ')); process.exit(1); });
