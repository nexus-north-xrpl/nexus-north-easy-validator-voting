// Reads everything the page shows from rippled (read-only):
//   - `feature`        every amendment this server knows, whether it is enabled, this server's vote, and (on a validator)
//                      how many trusted validators support it
//   - `ledger_entry`   the ledger's Amendments object, which lists amendments that currently have a majority and since when
//   - `server_info`    server state, network, ledger, fees, and whether this server is a validator
import { summary } from './summaries.js';

const AMENDMENTS_OBJECT = '7DB0788C020F02780A673DC74757F23823FA3014C1866E72CC4CD8B226CD6EF4';   // fixed index of the Amendments ledger object
const RIPPLE_EPOCH = 946684800;     // seconds between 1970-01-01 and 2000-01-01 (XRPL time starts in 2000)
const MAJORITY_DAYS = 14;           // an amendment must hold 80 % support for two weeks before it is enabled
export const NETWORKS = { 0: 'Mainnet', 1: 'Testnet', 2: 'Devnet' };

export async function read(rippled) {
  const [f, info] = await Promise.all([rippled.call('feature'), rippled.call('server_info')]);
  let majorities = [];
  try { const e = await rippled.call('ledger_entry', { index: AMENDMENTS_OBJECT, ledger_index: 'validated' }); majorities = (e.node && e.node.Majorities) || []; } catch { /* no amendment has a majority, or the server is still syncing */ }
  const since = Object.fromEntries(majorities.map(m => [m.Majority.Amendment, m.Majority.CloseTime]));
  const i = info.info || {}, v = i.validated_ledger || {};
  const stateOk = /^(full|proposing|validating)$/.test(i.server_state || '');
  const list = Object.entries(f.features || {}).map(([id, a]) => {
    const obsolete = a.vetoed === 'Obsolete', t = since[id];
    return {
      id, name: a.name || id.slice(0, 12), summary: summary(a.name), enabled: !!a.enabled, supported: a.supported !== false, obsolete,
      // support from trusted validators (rippled only reports this while it is a validator)
      count: a.count ?? null, threshold: a.threshold ?? null, validations: a.validations ?? null,
      supportPct: a.validations ? Math.round(a.count / a.validations * 1000) / 10 : null,
      majoritySince: t ? new Date((t + RIPPLE_EPOCH) * 1000).toISOString() : null,
      daysLeft: t ? Math.max(0, Math.round(((t + RIPPLE_EPOCH) * 1000 + MAJORITY_DAYS * 864e5 - Date.now()) / 864e5 * 10) / 10) : null,
      vote: a.enabled ? null : obsolete ? 'obsolete' : a.vetoed === true ? 'no' : 'yes',
    };
  }).sort((a, b) => (a.enabled - b.enabled) || (a.obsolete - b.obsolete) || ((b.supportPct || 0) - (a.supportPct || 0)) || a.name.localeCompare(b.name));
  // Right after a restart rippled can report "full" before it has read which amendments are enabled from the ledger.
  // Every real network has enabled amendments, so "none enabled yet" means: still loading. Voting waits for it.
  const amendmentsLoaded = list.some((a) => a.enabled);
  const synced = stateOk && amendmentsLoaded;
  return {
    amendments: list,
    server: { state: i.server_state || 'unknown', synced, amendmentsLoaded, validator: !!(i.pubkey_validator && i.pubkey_validator !== 'none'), pubkey: i.pubkey_validator && i.pubkey_validator !== 'none' ? i.pubkey_validator : null,
      network: NETWORKS[i.network_id ?? 0] || 'network ' + i.network_id, networkId: i.network_id ?? 0, version: i.build_version || null, ledger: v.seq || null,
      amendmentBlocked: !!i.amendment_blocked },
    fees: v.base_fee_xrp != null ? { baseFeeDrops: Math.round(v.base_fee_xrp * 1e6), reserveBaseXrp: v.reserve_base_xrp, reserveIncXrp: v.reserve_inc_xrp } : null,
  };
}
