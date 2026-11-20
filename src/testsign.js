// FOR AUTOMATED TESTS ONLY - never enabled unless EVV_TEST_SIGN=1, and refused on Mainnet.
//
// Real use confirms every vote in Xaman. Automated tests can't scan a QR code, so in test mode the test script signs a
// throwaway "proof" transaction locally with a test wallet (it is never sent to any ledger) and the app checks that
// signature instead. This needs the `xrpl` package, which is only a development dependency.
export async function testSigner(networkId) {
  if (networkId === 0) throw new Error('EVV_TEST_SIGN=1 is refused on Mainnet. Test mode only works with Testnet or Devnet.');
  const xrpl = await import('xrpl');
  const hex = (s) => Buffer.from(s).toString('hex').toUpperCase();
  return {
    challenge: (pid) => ({ memoType: hex('evv-vote'), memoData: hex('evv-vote:' + pid) }),
    async verify(txBlob, memo) {
      if (!xrpl.verifySignature(txBlob)) throw Object.assign(new Error('Bad test signature.'), { status: 400 });
      const t = xrpl.decode(txBlob), m = ((t.Memos || [])[0] || {}).Memo || {};
      if (String(m.MemoData || '').toUpperCase() !== memo.memoData) throw Object.assign(new Error('Test signature is for another request.'), { status: 400 });
      return t.Account;
    },
  };
}
