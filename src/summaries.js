// Plain-English one-liners for XRP Ledger amendments, by amendment name.
// These are short explanations to help you decide; always read the full description on xrpl.org before voting:
//   https://xrpl.org/resources/known-amendments
// Amendments not listed here still appear on the page, with a generic description.
export const SUMMARIES = {
  // ---- newer amendments ----
  ConfidentialTransfer: 'Lets multi-purpose token (MPT) balances and transfers be hidden with encryption, while the issuer and auditors can still check them.',
  CryptoConditionsSuite: 'An old plan for extra crypto-condition types in escrows. Obsolete: it will never be enabled.',
  DynamicMPT: 'Lets an issuer change some settings of a multi-purpose token (MPT) after it is created, if it allowed that at creation.',
  LendingProtocol: 'Adds on-ledger loans: lenders put money into a vault, borrowers take fixed-term loans from it, with interest and repayment rules on the ledger.',
  LendingProtocolV1_1: 'Fixes and small improvements to the Lending Protocol, voted on together with it.',
  SingleAssetVault: 'Adds vaults that pool one asset (XRP, a token or an MPT) and give depositors shares. The Lending Protocol builds on it.',
  Sponsor: 'Lets one account pay the fees and/or reserves for another account or its objects (sponsorship), e.g. an app covering its users\' costs.',
  XChainBridge: 'Adds bridges for moving XRP and tokens between the XRP Ledger and sidechains such as an EVM sidechain.',
  fixXChainRewardRounding: 'Fixes rounding of the rewards paid to cross-chain bridge witnesses (only matters together with XChainBridge).',
  // ---- enabled ----
  AMM: 'Automated market makers: liquidity pools for any two assets, built into the ledger\'s exchange.',
  AMMClawback: 'Lets a token issuer claw back its tokens even when they are sitting in an AMM pool.',
  BatchV1_1: 'Batch transactions: several transactions sent as one, all-or-nothing or in other modes.',
  CheckCashMakesTrustLine: 'Cashing a check for a token creates the needed trust line automatically.',
  Checks: 'Checks: deferred payments the receiver can cash later, like paper checks.',
  Clawback: 'Lets issuers who opted in claw back their tokens from holders (for regulated tokens).',
  Credentials: 'On-ledger credentials: an issuer can give an account a credential (e.g. KYC done) that others can require.',
  CryptoConditions: 'Crypto-conditions for escrows, so an escrow can be released by revealing a secret.',
  DID: 'Decentralized identifiers (DIDs) stored on the ledger for accounts.',
  DeepFreeze: 'Issuers can deep-freeze a trust line so the holder can neither send nor receive the token.',
  DeletableAccounts: 'Accounts can be deleted, returning most of the reserve.',
  DepositAuth: 'Deposit authorization: an account can refuse payments from anyone it has not approved.',
  DepositPreauth: 'Lets an account pre-approve specific senders when Deposit Authorization is on.',
  DisallowIncoming: 'Accounts can block incoming checks, payment channels, NFT offers and trust lines.',
  DynamicNFT: 'NFTs can be marked as changeable so their URI can be updated later.',
  EnforceInvariants: 'Extra safety checks after every transaction that stop impossible results.',
  Escrow: 'Escrow: lock XRP until a time or a condition is met.',
  ExpandedSignerList: 'Multi-signing lists can have up to 32 signers and attach wallet locators.',
  FeeEscalation: 'Transaction costs rise when the network is busy, protecting it from spam.',
  Flow: 'The modern payment engine used for all payments and cross-currency paths.',
  FlowCross: 'Uses the Flow engine for matching offers on the exchange.',
  FlowSortStrands: 'Makes payments try the best-quality paths first.',
  HardenedValidations: 'Makes validations harder to fake or replay.',
  ImmediateOfferKilled: 'Immediate-or-cancel offers that trade nothing return a clear error.',
  MPTokensV1: 'Multi-purpose tokens (MPTs): a simpler, cheaper kind of fungible token.',
  MultiSign: 'Multi-signing: several keys together can authorize a transaction.',
  MultiSignReserve: 'Lowers the reserve needed for a multi-signing list.',
  NFTokenMintOffer: 'Mint an NFT and create its sell offer in one transaction.',
  NegativeUNL: 'Lets the network keep going when some trusted validators are offline.',
  NonFungibleTokensV1_1: 'Native NFTs on the XRP Ledger.',
  PayChan: 'Payment channels for fast, many-small-payment streams.',
  PermissionDelegationV1_1: 'An account can let another account send some kinds of transactions for it.',
  PermissionedDEX: 'Exchange order books that only approved (credentialed) accounts can trade on.',
  PermissionedDomains: 'Groups of accepted credentials that features like the permissioned DEX can require.',
  PriceOracle: 'On-ledger price oracles: accounts publish price data others can read.',
  RequireFullyCanonicalSig: 'Requires fully canonical signatures, stopping transaction malleability.',
  SortedDirectories: 'Keeps owner directories sorted for faster, predictable lookups.',
  TickSize: 'Issuers can limit how many digits an offer\'s exchange rate uses.',
  TicketBatch: 'Tickets: reserve sequence numbers to send transactions out of order.',
  TokenEscrow: 'Escrow for tokens and MPTs, not only XRP.',
  TrustSetAuth: 'Issuers can pre-authorize a trust line before it exists.',
  XRPFees: 'Fee and reserve votes are expressed in drops (simpler, more precise fee voting).',
};
const FIX = 'A bug fix to the XRP Ledger protocol';
export function summary(name) {
  if (SUMMARIES[name]) return SUMMARIES[name];
  if (/^fix/.test(name)) { const what = name.replace(/^fix/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/V(\d)/, 'v$1'); return FIX + (what ? ' (' + what.trim() + ')' : '') + '. It changes no features, only corrects how existing rules behave.'; }
  return 'No summary in this app yet. See https://xrpl.org/resources/known-amendments for details.';
}
