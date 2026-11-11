# BudgetFlow security notes

BudgetFlow is a personal, read-only budgeting app. It uses the Plaid **Transactions** product only and never requests a product that can move money. This document describes how secrets and bank data are protected, how to add Plaid Sandbox credentials safely, and what must change before the app is hosted or used with a real bank.

Current status: **local development, Plaid Sandbox only, single local profile, no login.** Do not expose it to the internet.

## Where secrets live

| Secret | Where it lives | Reaches the browser? |
| --- | --- | --- |
| `PLAID_CLIENT_ID`, `PLAID_SECRET` | `.env` on the server, read by the API only | No |
| `APP_ENCRYPTION_KEY` | `.env` on the server | No |
| `DATABASE_URL` | `.env` on the server | No |
| Plaid access token | Database, Fernet-encrypted (`plaid_items.encrypted_access_token`) | No |
| Plaid Item ID, account IDs, transaction IDs | Database | No. The API returns internal numeric IDs only |
| Plaid Link token | Created per request, returned to the browser | Yes, by design: Plaid Link needs it. It is short-lived and cannot read data |
| Plaid public token | Created by Link in the browser, sent once to `POST /api/plaid/exchange` | Yes, by design. Single-use, exchanged immediately on the server, never stored or logged |

Guarantees enforced in code and covered by tests (`backend/tests/test_security.py`, `test_plaid_sync.py`):

- `.env` and `.env.*` are ignored by Git; `.env.example` holds names and blank placeholders only. Docker build contexts exclude `.env`.
- The frontend reads no secrets. Vite only exposes `VITE_`-prefixed variables, and none are secrets. The production bundle is scanned for secret patterns.
- Access tokens are encrypted before storage. The `PlaidItem` model refuses any value that is not Fernet ciphertext, so a plaintext token cannot be saved by mistake.
- Tokens are decrypted only inside `plaid_service.py`, immediately before a call to Plaid (sync, update-mode Link, removal). Read endpoints never decrypt.
- No API response contains a secret, token, ciphertext, cursor or Plaid identifier.
- Request validation errors list field names only and never echo submitted values.
- Unexpected errors return `Something went wrong. Reference <id>.` The ID matches the `X-Request-ID` header and the server log line.

## Configuration checks at startup

The API refuses to start, and logs which **variable names** are wrong (never their values), when:

- `APP_ENV` is not `development` or `production`, or `PLAID_ENV` is not `sandbox` or `production`.
- `PLAID_ENV=production` is set without `APP_ENV=production`. Local development is Sandbox only.
- `APP_ENCRYPTION_KEY` is set but is not a valid Fernet key.
- Only one of `PLAID_CLIENT_ID` and `PLAID_SECRET` is set.
- `FRONTEND_URL` is not a single exact origin (wildcards are rejected), or is not https in production.
- `PLAID_WEBHOOK_URL` is set but is not https.
- In production: `APP_ENCRYPTION_KEY` is missing, or `DATABASE_URL` still uses the local development password.

Plaid defaults to Sandbox when `PLAID_ENV` is unset. While Plaid is not in Production, every screen shows a "Sandbox mode: test banks only" strip.

## Logging

A redaction filter runs on every log handler (root, uvicorn and application loggers), including exception tracebacks. It removes:

- Plaid access, public and Link tokens;
- Fernet ciphertext;
- `Authorization`, Bearer, `Cookie` and `Plaid-Verification` values;
- `secret`, `client_id`, `password` and token fields;
- passwords inside connection URLs;
- digit runs of 9 to 17 characters, such as account and routing numbers;
- the configured secret values themselves.

Plaid failures are logged as `error_type`, `error_code` and Plaid's `request_id` only. Raw Plaid responses are never logged.

## API protections

- **CORS:** one exact origin from `FRONTEND_URL`, no credentials, only the methods and the `Content-Type` header the app uses. The browser reaches the API through Vite's same-origin proxy, so the session cookie never needs CORS credentials.
- **Sign-in and sessions:** see *Known limits* below for the single-owner design; `app/auth.py` holds the implementation and `tests/test_auth.py` the tests.
- **Origin and host checks:** state-changing requests with a foreign `Origin` (or a cross-site `Sec-Fetch-Site`) are refused with `403`; requests for host names outside `ALLOWED_HOSTS` are refused with `400`.
- **Security headers:**
  - `X-Content-Type-Options: nosniff`;
  - `X-Frame-Options: DENY`;
  - `Referrer-Policy: no-referrer`;
  - a restrictive `Content-Security-Policy` on JSON responses;
  - `Cache-Control: no-store` on `/api`;
  - `Permissions-Policy`;
  - HSTS when `APP_ENV=production`.
- **Body size:** request bodies over 64 KB are rejected with `413`.
- **Rate limits** per client address:

  | Endpoint group | Limit |
  | --- | --- |
  | Link token | 10 per minute |
  | Public token exchange | 5 per minute |
  | Sync | 6 per minute |
  | Disconnect | 10 per minute |
  | Webhook | 120 per minute |
  | Demo data | 10 per minute |
  | Sign-in | 8 per 5 minutes |
  | Passphrase creation / change | 5 per 5 minutes |

  The limiter is in-memory, so it protects a single API process only.
- **Authorization:** every budget, transaction, account and Plaid query is filtered by the current profile. Records belonging to another profile return `404`. A reconnect can never move an Item to a different profile, and a sync can never update another profile's account.
- **API docs:** `/docs` and `/openapi.json` are disabled when `APP_ENV=production`.

## Plaid flow

1. `POST /api/plaid/link-token`: the server creates a Link token for an opaque internal user ID. No name or email is sent to Plaid.
2. The browser opens Plaid Link. The bank sign-in happens inside Plaid, never in BudgetFlow.
3. The browser sends the single-use public token to `POST /api/plaid/exchange`.
4. The server exchanges it for an access token.
5. The server encrypts the access token and stores only the ciphertext. The plaintext is deleted immediately.
6. The server syncs accounts and transactions with `/transactions/sync`.
7. The browser receives account names, balances and counts only. It never receives the access token.

**Sync behaviour**

- **Atomic:** every page of one sync runs inside a single database transaction, and the new cursor is saved in the same commit. An interrupted sync rolls back completely and resumes from the last saved cursor.
- **Idempotent:** transactions are upserted by Plaid transaction ID, so repeated pages create no duplicates.
- **Mutation during pagination:** `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION` restarts the sync from the original cursor, up to 3 times.
- **Pending and posted:** a pending transaction and its posted replacement are never both counted against a budget.
- **Bank needs sign-in:** `ITEM_LOGIN_REQUIRED` and related errors mark the connection "Needs attention". The token is kept so the person can repair the connection with update-mode Link (the **Reconnect** button).
- **Temporary problems:** outages, rate limits and Plaid API errors return a "try again later" message without advancing the cursor.
- **Concurrency:** a row lock prevents two syncs of the same Item from running at once (PostgreSQL).
- **Failure isolation:** one failing bank does not stop the others from syncing.

**Disconnect** first asks Plaid to invalidate the access token (`/item/remove`). It then deletes the token and cursor locally, even if Plaid could not be reached. Transaction history is kept.

**Webhooks:**

- The `Plaid-Verification` header must be an ES256 JWT. Other algorithms are refused before any network call.
- The signing key is fetched from Plaid by `kid`, cached for 24 hours, and refused if expired.
- `iat` must be within 5 minutes, and the SHA-256 of the raw body must match `request_body_sha256` (constant-time comparison).
- Every rejection returns the same `401 Invalid webhook.`
- Handling is idempotent: sync is cursor-based, so duplicate or out-of-order deliveries are harmless. `ITEM` error and repair events update the connection status.

## Adding Plaid Sandbox credentials locally

Do this yourself, on your own machine. Do not paste credentials into Claude, chat, Discord, issues, commits or documentation.

1. Sign in at https://dashboard.plaid.com and open **Developers → Keys**.
2. In a terminal, from the project root, create your local file if it does not exist yet: `cp .env.example .env`.
3. Open `.env` in your own editor. Type or paste the **client ID** into `PLAID_CLIENT_ID` and the **Sandbox** secret into `PLAID_SECRET`. Never use the Production secret.
4. Make sure `PLAID_ENV=sandbox` and `APP_ENV=development`.
5. If `APP_ENCRYPTION_KEY` is empty, generate a key with the command in `.env.example` and paste the output into `.env` yourself.
6. Save the file. Confirm it is ignored: `git check-ignore .env` should print `.env`.
7. Restart the API, for example `docker compose restart backend`, or stop and start `uvicorn`. The startup log prints `plaid_configured=True`, but never the values.
8. Open Accounts, choose **Connect a bank**, pick a Sandbox institution such as First Platypus Bank, and sign in with Plaid's public Sandbox test login (`user_good` / `pass_good`). These are Plaid's documented test values, not your credentials.

If a key is ever exposed, rotate it in the Plaid dashboard.

## Known limits of this phase

- **Single-owner login (added).** Every financial endpoint requires a session. The owner creates a passphrase on first run (scrypt, 32 MB, salted). Sessions are 256-bit random tokens stored only as SHA-256 hashes, sent in an `HttpOnly`, `SameSite=Strict` cookie scoped to `/api`, with a 60-minute idle timeout and 12-hour lifetime. Sign-in is limited to 8 attempts per 5 minutes. Changing the passphrase signs out other browsers. State-changing requests from other origins are refused, and the API answers only to `ALLOWED_HOSTS` (DNS-rebinding protection). Forgotten passphrase: `python -m app.reset_passphrase` on this computer. There is no MFA yet; add it before any hosted or real-bank use.
- **Rate limiting is in-memory** and keyed by the direct client address. It is not shared across processes, and it is not aware of proxies.
- **Encryption-key storage.** The encryption key sits in a local `.env` next to the database credentials. Anyone with both can decrypt tokens.
- **Dependencies** are pinned in `backend/requirements-lock.txt` and checked with `pip-audit` and `npm audit` (0 known issues on 2026-11-11).
- **Webhook keys** are cached in process memory.

## Next phase: managed authentication and private hosting

> Local single-owner sign-in now exists (see *Known limits* above and `app/auth.py`). This section covers the larger step: several users or a hosted deployment. For connecting a real bank, follow [docs/REAL_BANK_READINESS.md](docs/REAL_BANK_READINESS.md).

### What must change in the code

1. **Replace `current_user` in `backend/app/deps.py`.**
   - Today it always returns the single local profile (`get_local_user`).
   - Replace it with a dependency that verifies a session or ID token from a managed identity provider (for example Auth0, Clerk, AWS Cognito or Supabase Auth). The token should carry passkeys or MFA.
   - Map the provider's stable subject (`sub`) to `users.id`. Add a unique `users.auth_subject` column with a migration.
   - Remove the automatic creation of the local profile.
2. **Every route already scopes by `user.id`.** Keep it that way.
   - The isolation tests in `test_security.py` use a second profile and should be extended for each new endpoint.
   - `categories` is shared reference data on purpose.
3. **Session handling.**
   - Prefer the provider's hosted login with short-lived access tokens, sent as `Authorization: Bearer` or in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
   - With cookies: add `allow_credentials=True` for the exact origin, plus CSRF protection on state-changing requests.
4. **Rate limiting.** Key limits by user ID as well as IP, and move the counters to a shared store (Redis) when there is more than one process.
5. **Account deletion.** Add a "delete my account" endpoint that:
   - calls `/item/remove` for every Item;
   - deletes all of that user's rows in one transaction;
   - requires recent re-authentication.

   No such endpoint exists today, deliberately, because without login it would let anyone erase the data.
6. **Production Plaid access.** Request Plaid Production access, publish a privacy policy and data-retention policy, then set `APP_ENV=production` and `PLAID_ENV=production` only on the hosted environment.

### Hosting

- Use a private, managed setup:
  - a managed PostgreSQL database with encryption at rest and automated backups;
  - the API behind HTTPS;
  - the frontend served as static files from the same origin or one exact origin.
- Put the app behind the identity provider. Additionally restrict network access (for example an allowlist, a private network or Cloudflare Access) while it is personal-use only.
- Store `PLAID_SECRET`, `APP_ENCRYPTION_KEY` and `DATABASE_URL` in the host's secret manager, not in a file.
  - Rotate the encryption key by decrypting and re-encrypting stored tokens (Fernet `MultiFernet` supports this).
- Run behind a reverse proxy that sets the real client IP, and configure the API to trust only that proxy.
- Add monitoring and alerting on `5xx` responses, on webhook rejections and on Items in "Needs attention".
- Add `pip-audit`, `npm audit` and a secret scanner (for example gitleaks) to CI.
