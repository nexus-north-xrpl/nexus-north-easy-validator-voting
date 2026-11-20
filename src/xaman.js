// Xaman sign requests: how every vote is confirmed by the operator.
//
// The app asks Xaman (xumm.app) for a "SignIn" request. A SignIn is never sent to the XRP Ledger and moves no funds; it
// only proves that the person who scanned it controls the wallet that signed it. Xaman tells us which wallet signed.
// The vote goes ahead only if that wallet is one of the operator wallets chosen during setup.
//
// The Xaman API key and secret belong to the operator's own (free) Xaman developer app and are sent only to xumm.app.
// No wallet secret, seed or private key is ever asked for, received or stored.
const API = 'https://xumm.app/api/v1/platform';

export function xaman({ apiKey, apiSecret }) {
  const headers = { 'Content-Type': 'application/json', 'X-API-Key': apiKey, 'X-API-Secret': apiSecret };
  return {
    configured: !!(apiKey && apiSecret),
    // a new sign request; `identifier` ties it to one vote, `instruction` is shown to the operator in Xaman
    async create(identifier, instruction) {
      const r = await fetch(API + '/payload', { method: 'POST', headers, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ txjson: { TransactionType: 'SignIn' }, options: { expire: 5 }, custom_meta: { identifier, instruction } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.uuid) throw new Error('Xaman did not create the sign request (' + (j.error && j.error.message || r.status) + '). Check the Xaman API key and secret.');
      // the QR picture is fetched here and passed on as a data: image, so the page loads nothing from other sites
      let qr = null;
      try { const q = await fetch(j.refs.qr_png, { signal: AbortSignal.timeout(10000) }); if (q.ok) qr = 'data:image/png;base64,' + Buffer.from(await q.arrayBuffer()).toString('base64'); } catch { /* the link still works */ }
      return { uuid: j.uuid, qr, link: j.next && j.next.always };
    },
    // the request's state: waiting, signed (and by which wallet), declined or expired
    async status(uuid) {
      const r = await fetch(API + '/payload/' + encodeURIComponent(uuid), { headers, signal: AbortSignal.timeout(15000) });
      const j = await r.json().catch(() => ({}));
      const m = j.meta || {};
      return { signed: !!m.signed, declined: !!m.cancelled, expired: !!m.expired, opened: !!(m.opened_by_deeplink || m.app_opened),
        identifier: j.custom_meta && j.custom_meta.identifier, wallet: j.response && j.response.account };
    },
    async ping() {
      const r = await fetch(API + '/ping', { headers, signal: AbortSignal.timeout(10000) });
      const j = await r.json().catch(() => ({}));
      return r.ok && j.pong === true ? (j.auth && j.auth.application && j.auth.application.name) || 'ok' : null;
    },
  };
}
