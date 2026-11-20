// Optional Telegram alerts (only if a bot token and chat id were given during setup).
//   - a new amendment appears on this server
//   - an amendment you have not voted on through this app reaches `closeToMajorityPct` support (default 70 %)
// Checked every 10 minutes. Remembers what it already told you in <data dir>/alerts.json.
// The only outside address used here is api.telegram.org.
import fs from 'node:fs';
import path from 'node:path';
import { read } from './amendments.js';
import { DATA_DIR } from './config.js';
import { voteLog } from './votes.js';

const STATE_FILE = path.join(DATA_DIR, 'alerts.json');

export function telegram({ botToken, chatId }) {
  return async function send(text) {
    if (!botToken || !chatId) return false;
    const r = await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }), signal: AbortSignal.timeout(10000) });
    return r.ok;
  };
}

export function watch({ rippled, notify, closeToMajorityPct, log }) {
  let lastCheck = null;
  async function check() {
    try {
      const { amendments, server } = await read(rippled);
      if (!server.synced) return;   // while syncing the list can be incomplete; try again later
      let st = null; try { st = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { /* first run */ }
      if (!st) { st = { known: amendments.map(a => a.id), close: {} }; fs.writeFileSync(STATE_FILE, JSON.stringify(st), { mode: 0o600 }); log('alerts: remembered ' + amendments.length + ' amendments (no alert on first run)'); }
      const known = new Set(st.known), voted = new Set(voteLog(10000).filter(v => v.ok).map(v => v.id));
      for (const a of amendments) if (!known.has(a.id)) { known.add(a.id); await notify(`🗳 New amendment on your ${server.network} server: ${a.name}\n${a.summary}\nYour server currently votes ${String(a.vote || 'n/a').toUpperCase()}.`); }
      for (const a of amendments) {
        if (a.enabled || a.obsolete || voted.has(a.id) || a.supportPct == null) continue;
        if (a.supportPct >= closeToMajorityPct && !st.close[a.id]) { st.close[a.id] = new Date().toISOString(); await notify(`🗳 ${a.name} is getting close to 80 %: ${a.count} of ${a.validations} validators (${a.supportPct} %).\nYou have not voted on it in this app; your server says ${String(a.vote).toUpperCase()}.`); }
        else if (a.supportPct < closeToMajorityPct - 5 && st.close[a.id]) delete st.close[a.id];
      }
      st.known = [...known]; fs.writeFileSync(STATE_FILE, JSON.stringify(st), { mode: 0o600 }); lastCheck = new Date().toISOString();
    } catch (e) { log('alert check skipped: ' + e.message); }
  }
  setTimeout(check, 10000); setInterval(check, 10 * 60 * 1000);
  return { lastCheck: () => lastCheck };
}
