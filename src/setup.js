#!/usr/bin/env node
// First-time setup (and later changes). Run it on the server:   npm run setup
// It asks a few questions, tests each answer, and writes <data dir>/config.json (mode 600). Nothing is sent anywhere
// except the tests you can see: one call to your rippled, one "ping" to Xaman, and (if you choose) one Telegram message.
//
// Non-interactive (for Docker or scripts):   node src/setup.js --from-env
//   EVV_RIPPLED_URL, EVV_OPERATOR_WALLETS (comma separated), EVV_XAMAN_API_KEY, EVV_XAMAN_API_SECRET,
//   EVV_TELEGRAM_BOT_TOKEN, EVV_TELEGRAM_CHAT_ID, EVV_HOST, EVV_PORT, EVV_CLOSE_PCT
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import * as config from './config.js';
import { client } from './rippled.js';
import { xaman as xamanClient } from './xaman.js';
import { telegram } from './alerts.js';
import { NETWORKS } from './amendments.js';

const c = config.load();
const fromEnv = process.argv.includes('--from-env');
const rl = fromEnv ? null : readline.createInterface({ input: stdin, output: stdout });
const ask = async (q, def, envName) => {
  if (fromEnv) { const v = process.env[envName]; return v === undefined ? def : v; }
  const a = (await rl.question(q + (def ? ` [${def}]` : '') + ': ')).trim(); return a || def || '';
};
const hide = (s) => s ? s.slice(0, 4) + '…' : '';

console.log('\nEasy Validator Voting setup. Press Enter to keep the value in [brackets].\n');

// 1. rippled admin port (must be on this machine)
for (;;) {
  c.rippledUrl = await ask('rippled admin port URL on this machine', c.rippledUrl, 'EVV_RIPPLED_URL');
  if (!config.isLoopbackUrl(c.rippledUrl)) { console.log('  Please use 127.0.0.1, localhost or ::1. The admin port must never be reachable from other machines.'); if (fromEnv) process.exit(1); continue; }
  try {
    const i = (await client(c.rippledUrl).call('server_info')).info || {};
    console.log(`  OK: rippled ${i.build_version}, ${NETWORKS[i.network_id ?? 0] || 'network ' + i.network_id}, state ${i.server_state}, ${i.pubkey_validator && i.pubkey_validator !== 'none' ? 'validator ' + i.pubkey_validator : 'NOT a validator (votes are only used by validators)'}`);
    const f = await client(c.rippledUrl).call('feature'); console.log(`  OK: admin access works (${Object.keys(f.features || {}).length} amendments)`);
    break;
  } catch (e) { console.log('  ' + e.message); if (fromEnv) process.exit(1); }
}

// 2. operator wallet(s): the only wallets allowed to confirm votes
for (;;) {
  const w = await ask('Operator wallet address(es) that may confirm votes (comma separated, r...)', c.operatorWallets.join(','), 'EVV_OPERATOR_WALLETS');
  const list = w.split(/[\s,]+/).filter(Boolean);
  const badOnes = list.filter(x => !config.ADDRESS.test(x));
  if (list.length && !badOnes.length) { c.operatorWallets = [...new Set(list)]; break; }
  console.log('  Please enter XRP Ledger addresses (they start with r). Never enter a secret or seed here.' + (badOnes.length ? ' Not valid: ' + badOnes.join(', ') : '')); if (fromEnv) process.exit(1);
}

// 3. Xaman developer app (free at https://apps.xumm.dev) for sign requests
console.log('\nXaman sign requests need your own free Xaman developer app: https://apps.xumm.dev (create an app, copy its API key and secret).');
c.xaman.apiKey = await ask('Xaman API key', c.xaman.apiKey, 'EVV_XAMAN_API_KEY');
const sec = await ask('Xaman API secret' + (c.xaman.apiSecret ? ' (Enter keeps ' + hide(c.xaman.apiSecret) + ')' : ''), '', 'EVV_XAMAN_API_SECRET'); if (sec) c.xaman.apiSecret = sec;
if (c.xaman.apiKey && c.xaman.apiSecret) { const name = await xamanClient(c.xaman).ping().catch(() => null); console.log(name ? '  OK: Xaman app "' + name + '"' : '  Xaman did not accept this key/secret. Votes cannot be confirmed until it does (run setup again).'); }
else console.log('  Skipped. Votes cannot be confirmed until you add a Xaman key and secret.');

// 4. where the page listens
c.host = await ask('Web page address (127.0.0.1 = only this machine; recommended)', c.host, 'EVV_HOST');
c.port = Number(await ask('Web page port', String(c.port), 'EVV_PORT')) || 8742;
if (!['127.0.0.1', 'localhost', '::1'].includes(c.host)) console.log('  Note: other machines on your network can open the page. Every vote still needs your Xaman signature.');

// 5. optional Telegram alerts
c.telegram.botToken = await ask('Telegram bot token for alerts (optional, Enter to skip)', c.telegram.botToken, 'EVV_TELEGRAM_BOT_TOKEN');
if (c.telegram.botToken) {
  c.telegram.chatId = await ask('Telegram chat id', c.telegram.chatId, 'EVV_TELEGRAM_CHAT_ID');
  c.closeToMajorityPct = Number(await ask('Alert when an amendment you have not voted on reaches this % support', String(c.closeToMajorityPct), 'EVV_CLOSE_PCT')) || 70;
  const ok = await telegram(c.telegram)('✅ Easy Validator Voting: Telegram alerts are set up.').catch(() => false);
  console.log(ok ? '  OK: test message sent' : '  The test message did not arrive. Check the token and chat id.');
}

config.save(c);
console.log('\nSaved to ' + config.CONFIG_FILE + ' (readable only by this user).');
const p = config.problems(c); if (p.length) console.log('Still to fix:\n - ' + p.join('\n - '));
console.log(`Start it with: npm start   (then open http://${c.host}:${c.port})\n`);
if (rl) rl.close();
