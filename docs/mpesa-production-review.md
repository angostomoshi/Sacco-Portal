# M-Pesa Production Review

Last checked: 14 September 2026

## Latest Test Run

- Production frontend build compiled successfully.
- Nineteen payment-focused tests passed, plus backend syntax checks.
- Fixed a newly identified B2C interest-posting parameter order error: the loan
  number was bound to the numeric debit amount, and the charge to invoice_no.
  Read-only schema inspection confirmed the column types. A full mocked B2C
  success test now checks principal, interest, cashbook and loan references.
- Read-only database checks still show both existing tests pending, without
  provider receipt, accounting posting or receipt email.
- Production OAuth succeeded as part of the status query. The old STK request
  again returned 500.001.1001, "The transaction does not Exist".
- REACT_APP_API_URL currently targets a private HTTP address. Confirm its
  deployment replacement and /api/v1 reverse-proxy routing before external use.
- No payment was initiated and no database records were changed.

## Launch Decision

Not ready for general member access. Production OAuth authentication succeeded,
but end-to-end settlement, callback delivery, accounting and receipts have not
been confirmed with the current Embesha callback configuration.

## Evidence

- Saved environment: production.
- STK shortcode: 777215. B2C shortcode: 3011803.
- A token-only request to https://api.safaricom.co.ke succeeded with HTTP 200.
  No token or credentials were printed. This verifies consumer authentication
  only, not product enablement, the passkey pairing, or B2C initiator permissions.
- No Node proxy listener was found on port 3023 during this review.
- Earlier transaction records have no stored API environment. The reported
  reversal does not establish which host handled the original request.
- Current STK and B2C callbacks point to Embesha. No forwarding integration or
  provider-result retrieval implementation was found in the portal.
- The existing KES 10 loan repayment and KES 4,000 advance were pending in the
  preceding read-only checks. Do not delete or replay them to test again.

## Changes Verified Locally

- Load the repository's .env regardless of the launch directory. Existing process
  environment variables still take precedence, as expected for deployment.
- Require an explicit sandbox or production environment; reject unknown values.
- Log the effective environment, API host and shortcodes on startup and before
  payment requests, without credentials or callback query secrets.
- Validate HTTPS callback addresses and numeric shortcodes before sending.
- Require explicit B2C callback URLs when the STK callback belongs to an external
  integration; do not construct B2C paths beneath an arbitrary STK address.
- Preserve successful payouts against late timeouts and keep unresolved loans
  pending until reconciled.
- Return HTTP 503 when callback database processing fails. This alone is not a
  durable retry mechanism and does not guarantee provider redelivery.
- Reject incomplete successful STK callbacks without a receipt and paid amount.
- Handle top-level B2C TransactionID and avoid successful messages for null results.

Verification command:

```powershell
node --test scripts/mpesa-runtime.test.cjs scripts/b2c-callbacks.test.cjs scripts/stk-callbacks.test.cjs
node --check proxy-server.js
```

These use mocked database clients. They do not prove production database
concurrency, provider delivery, or email delivery. No payments were initiated.

## Remaining Work

1. Obtain the original result payloads and delivery logs from Embesha for both
   pending tests. Reconcile the reversal and payout against provider records.
2. Establish how Embesha delivers results to the portal, including the public
   destination, authentication and payload format. Alternatively, use the
   portal's own publicly reachable HTTPS endpoints directly with Daraja.
3. Confirm that the passkey belongs to 777215 and that the production app has
   the required products. Confirm that the B2C initiator is authorized for
   3011803; this credential combination previously returned result 2001.
4. Provide production hosting, HTTPS and a supervised backend process. The
   React build alone does not run the proxy or its accounting callbacks.
5. Add durable callback recovery and reconciliation. The current flow sends the
   provider request before the local transaction record is committed. A fast
   callback or database failure after provider acceptance can leave an unmatched
   result. Address this before a general launch; do not automatically resend money.
6. Establish verification of incoming callbacks, especially B2C, before exposing
   the accounting endpoints publicly. A matching conversation ID alone is not
   proof of a legitimate payment result. The current B2C result route has no
   equivalent of the STK callback key check.
7. Complete a controlled pilot only after callback delivery is established:
   verify actual recipient/merchant, final result, accounting entries, statement,
   receipt and email. Test failed, duplicate and delayed outcomes without live
   repeated payouts. Monitor and reconcile pending records.

Manual PayBill C2B confirmation is distinct from the portal's STK flow. The
existing /api/v1/mpesa/callback handler expects Body.stkCallback. Do not register
it as a manual PayBill confirmation handler without implementing that contract.

## Follow-up Request Diagnostics

The production STK status query for `ws_CO_120920261350566702890446` returned
HTTP 500, error `500.001.1001`: `The transaction does not Exist`. This is the
provider's response under the current credentials and shortcode. It does not
by itself prove the old request used sandbox or establish a reversal outcome.

The actual proxy request builders were executed with Axios mocked and the saved
environment loaded. Both targeted api.safaricom.co.ke, with STK shortcode and
PartyB 777215, B2C PartyA 3011803, and the supplied Embesha callbacks. Credential
and callback fields matched the saved configuration. No payment was initiated.

Diagnostic commands:

```powershell
node scripts/inspect-mpesa-requests.cjs
node scripts/query-mpesa-stk.cjs ws_CO_120920261350566702890446
```

The first command makes no network requests. The second obtains an OAuth token
and queries an existing payment directly; it does not update the database or
start a payment. Do not treat a status-query response as a receipt or fabricate
accounting data from missing callback metadata.

Safaricom's SDK documents STK status queries and asynchronous callback delivery:
https://github.com/safaricom/mpesa-php-sdk/blob/master/src/Mpesa.php
https://github.com/safaricom/mpesa-php-sdk/blob/master/readme.md

## Official Documentation Consulted

- https://developer.safaricom.co.ke/
- https://developer.safaricom.co.ke/apis/Authorization
- https://developer.safaricom.co.ke/apis/MpesaExpressSimulate
- https://developer.safaricom.co.ke/apis/BusinessToCustomer

The public pages were accessible, but the detailed API contracts were not
available through this browsing session. Confirm account-specific product and
callback requirements in the signed-in Daraja portal or with Safaricom support.
