// The ONLY way this app talks to rippled.
//
// - It sends JSON-RPC requests to the admin port on this machine (see config.rippledUrl).
// - Only the commands in ALLOWED can ever be sent. There is no way to sign, submit, stop rippled or change its config.
// - `feature` is used both to read amendments and, after a confirmed Xaman signature, to set this server's vote:
//     { feature: <amendment id>, vetoed: false }  -> vote YES
//     { feature: <amendment id>, vetoed: true }   -> vote NO
//   rippled stores that vote in its own database (wallet.db), so it survives restarts of rippled and of this app.
const ALLOWED = new Set(['server_info', 'feature', 'ledger_entry']);

export class RippledError extends Error {}

export function client(url) {
  async function call(method, params = {}) {
    if (!ALLOWED.has(method)) throw new RippledError('Not allowed: ' + method);
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, params: [params] }), signal: AbortSignal.timeout(15000) });
    } catch (e) {
      throw new RippledError('rippled is not answering at ' + url + ' (' + (e.cause && e.cause.code || e.message) + '). Is it running, and is the admin port set in rippled.cfg?');
    }
    const j = await res.json().catch(() => null);
    const r = j && j.result;
    if (!r) throw new RippledError('rippled gave no answer (HTTP ' + res.status + ').');
    if (r.status === 'error') {
      if (r.error === 'forbidden' || r.error === 'noPermission') throw new RippledError('rippled refused the admin command. Use the admin port (the one with "admin = 127.0.0.1" in rippled.cfg).');
      throw new RippledError(r.error_message || r.error || 'rippled error');
    }
    return r;
  }
  return { call };
}
