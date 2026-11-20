'use strict';
// Easy Validator Voting page. Reads /api/state every 30 seconds and draws it. The only actions are the Yes / No buttons,
// and each one only creates a Xaman sign request: nothing changes until the operator signs it in Xaman.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
let S = null, busy = false;

async function api(path, body) {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
  return j;
}
function msg(text, ok) { const m = $('msg'); m.textContent = text || ''; m.className = 'msg ' + (text ? (ok ? 'ok' : 'bad') : ''); }

// ---------- drawing ----------
function card(a) {
  const canVote = !a.enabled && !a.obsolete && S.server.synced;
  const status = a.enabled ? '<span class="pill on">Enabled</span>' : a.obsolete ? '<span class="pill off">Obsolete</span>' : '<span class="pill off">Not enabled</span>';
  const vote = a.vote === 'yes' ? '<span class="pill yes">Your vote: YES</span>' : a.vote === 'no' ? '<span class="pill no">Your vote: NO</span>' : '';
  const maj = a.majoritySince ? '<span class="pill maj">Majority since ' + esc(when(a.majoritySince)) + ' · ' + a.daysLeft + ' days left</span>' : '';
  const support = a.enabled || a.obsolete ? '' : a.supportPct == null
    ? '<div class="support small">Support from other validators: ' + (S.server.validator ? 'appears after the next voting round in rippled (about every 15 minutes).' : 'shown when this server is a validator.') + '</div>'
    : '<div class="support"><div class="small"><b>' + a.supportPct + '%</b> support · ' + a.count + ' of ' + a.validations + ' trusted validators · needs ' + a.threshold + ' (80%)</div><div class="bar"><i data-w="' + Math.min(100, a.supportPct) + '"></i><b></b></div></div>';
  const btns = canVote ? '<div class="btns"><button class="btn yes" data-v="yes" data-id="' + esc(a.id) + '"' + (a.vote === 'yes' ? ' disabled' : '') + '>Vote Yes</button><button class="btn no" data-v="no" data-id="' + esc(a.id) + '"' + (a.vote === 'no' ? ' disabled' : '') + '>Vote No</button></div>' : '';
  return '<article class="card"><div class="row"><h3>' + esc(a.name) + '</h3>' + status + vote + maj + '</div><p class="sum">' + esc(a.summary) + '</p><div class="row">' + support + btns + '</div></article>';
}
function draw() {
  const s = S.server, open = S.amendments.filter((a) => !a.enabled && !a.obsolete), done = S.amendments.filter((a) => a.enabled || a.obsolete);
  $('srv').textContent = 'rippled ' + (s.version || '') + ' · ' + s.network + ' · ' + s.state + (s.ledger ? ' · ledger ' + s.ledger : '') + (s.validator ? ' · validator ' + s.pubkey.slice(0, 8) + '…' : ' · not a validator');
  $('nOpen').textContent = '(' + open.length + ')'; $('nDone').textContent = '(' + done.length + ')';
  const notes = [];
  if (S.testMode) notes.push('<div class="note info"><b>Test mode</b>: votes are confirmed with test signatures. Never used on Mainnet.</div>');
  if (!s.validator) notes.push('<div class="note">This rippled is <b>not a validator</b>, so its votes are not counted by the network, and support numbers are not shown.</div>');
  if (!s.synced) notes.push('<div class="note">' + (s.amendmentsLoaded === false && /full|proposing|validating/.test(s.state) ? 'rippled is still loading amendment status from the ledger' : 'rippled is still catching up (<b>' + esc(s.state) + '</b>)') + '. The list may be incomplete and voting is paused until it is ready.</div>');
  if (s.amendmentBlocked) notes.push('<div class="note"><b>Amendment blocked</b>: the network enabled an amendment this rippled version does not know. Upgrade rippled.</div>');
  if (!S.xamanReady && !S.testMode) notes.push('<div class="note">Xaman is not set up yet, so votes cannot be confirmed. On the server, run <span class="mono">npm run setup</span>.</div>');
  $('notes').innerHTML = notes.join('');
  $('open').innerHTML = '<p class="small">Pressing Vote Yes or Vote No opens a Xaman sign request. Your server\'s vote changes only after you sign it with your operator wallet (' + esc(S.operatorWallets.join(', ')) + '). rippled saves the vote, so it survives restarts.</p>' + (open.length ? open.map(card).join('') : '<div class="card">Nothing is waiting for a vote.</div>');
  $('done').innerHTML = '<p class="small">Enabled amendments are part of the ledger for good, and obsolete ones can never be enabled, so votes on them no longer matter.</p>' + done.map(card).join('');
  $('log').innerHTML = '<div class="card"><h3>Vote log</h3><p class="small">Every vote made through this page, newest first. Stored on this machine only.</p><div class="tw"><table><tr><th>When</th><th>Amendment</th><th>Vote</th><th>Signed by</th><th>Result</th></tr>' +
    (S.votes.length ? S.votes.map((v) => '<tr><td>' + esc(when(v.at)) + '</td><td>' + esc(v.amendment) + '</td><td>' + esc(String(v.vote).toUpperCase()) + '</td><td class="mono">' + esc(v.wallet) + '<div class="small">' + esc(v.via || '') + '</div></td><td>' + (v.ok ? '<span class="pill yes">saved</span>' : '<span class="pill no">refused</span><div class="small">' + esc(v.error || '') + '</div>') + '</td></tr>').join('') : '<tr><td colspan="5" class="small">No votes yet.</td></tr>') + '</table></div></div>';
  const f = S.fees;
  $('about').innerHTML = '<div class="card"><h3>This server</h3><table>' +
    '<tr><th>Network</th><td>' + esc(s.network) + '</td></tr><tr><th>rippled</th><td>' + esc(s.version) + ' · ' + esc(s.state) + '</td></tr><tr><th>Validator key</th><td class="mono">' + esc(s.pubkey || 'not a validator') + '</td></tr>' +
    '<tr><th>Network fees</th><td>' + (f ? f.baseFeeDrops + ' drops per transaction · ' + f.reserveBaseXrp + ' XRP account reserve · ' + f.reserveIncXrp + ' XRP per object' : '—') + '</td></tr>' +
    '<tr><th>Operator wallets</th><td class="mono">' + esc(S.operatorWallets.join(', ')) + '</td></tr><tr><th>Telegram alerts</th><td>' + (S.alerts.telegram ? 'on (new amendments, and ' + S.alerts.closeToMajorityPct + '%+ support on ones you have not voted on)' : 'off') + '</td></tr>' +
    '<tr><th>App version</th><td>' + esc(S.version) + '</td></tr></table></div>' +
    '<div class="card"><h3>What this app touches</h3><p class="sum">Only your rippled admin port on this machine (server_info, feature, ledger_entry), xumm.app for sign requests, and api.telegram.org if you turned alerts on. No keys or seeds are ever asked for. Settings can only be changed on the server with <span class="mono">npm run setup</span>.</p></div>';
  document.querySelectorAll('.bar i[data-w]').forEach((i) => { i.style.width = i.dataset.w + '%'; });
  document.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => vote(b.dataset.id, b.dataset.v); });
}
async function load() { try { S = await api('/api/state'); draw(); } catch (e) { $('srv').textContent = e.message; } }

// ---------- voting ----------
function modal(title, html) { $('mTitle').textContent = title; $('mBody').innerHTML = html; $('modal').hidden = false; }
function closeModal() { $('modal').hidden = true; $('mBody').innerHTML = ''; }
async function vote(id, v) {
  if (busy) return; const a = S.amendments.find((x) => x.id === id); if (!a) return;
  busy = true; msg('');
  let stop = false;
  try {
    modal('Vote ' + v.toUpperCase() + ' on ' + a.name, '<p class="small">Creating the Xaman sign request…</p>');
    const r = await api('/api/vote/start', { id, vote: v });
    modal('Vote ' + v.toUpperCase() + ' on ' + a.name, (r.xaman && r.xaman.qr ? '<img alt="Xaman QR code" src="' + esc(r.xaman.qr) + '">' : '') +
      '<p>' + esc(r.instruction) + '</p><p class="small">Scan with Xaman, or open it on this phone, and sign with your operator wallet. The request ends in 5 minutes. Nothing changes if you decline.</p>' +
      '<div class="row">' + (r.xaman && r.xaman.link ? '<a class="btn pri" target="_blank" rel="noopener noreferrer" href="' + esc(r.xaman.link) + '">Open in Xaman</a>' : '') + '<button class="btn" id="mCancel">Cancel</button></div><p class="small" id="mState">Waiting for your signature…</p>');
    $('mCancel').onclick = () => { stop = true; busy = false; closeModal(); msg('Cancelled. Nothing was changed.', true); };
    const tx = r.test && window.evvTestSign ? await window.evvTestSign(r.test) : null;   // automated tests only
    const t0 = Date.now();
    for (;;) {
      if (stop) return;
      const o = await api('/api/vote/finish', tx ? { pid: r.pid, tx } : { pid: r.pid });
      if (!o.waiting) { closeModal(); msg('Saved: this validator now votes ' + o.vote.toUpperCase() + ' on ' + o.name + '.', true); break; }
      if (Date.now() - t0 > 310000) { closeModal(); msg('The request expired. Nothing was changed.'); break; }
      const st = $('mState'); if (st) st.textContent = o.opened ? 'Opened in Xaman, waiting for your signature…' : 'Waiting for your signature…';
      await new Promise((res) => setTimeout(res, 2500));
    }
  } catch (e) { closeModal(); msg(e.message); }
  busy = false; load();
}

// ---------- tabs ----------
document.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => {
  document.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
  document.querySelectorAll('.tab').forEach((s) => { s.hidden = s.id !== b.dataset.tab; });
}; });
load(); setInterval(() => { if (!busy) load(); }, 30000);
