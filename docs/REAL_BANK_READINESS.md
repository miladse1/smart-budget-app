# Before connecting a real bank

BudgetFlow runs on Plaid **Sandbox** today: test institutions only, no real accounts. This page is
the review to complete before `PLAID_ENV=production` is ever set. The app enforces part of it:
it refuses `PLAID_ENV=production` unless `APP_ENV=production`, and production startup fails without
an encryption key or with the development database password.

## What is at stake

| Asset | If exposed |
| --- | --- |
| Plaid access tokens (encrypted in PostgreSQL) | Ongoing read access to your accounts and transactions until revoked |
| `APP_ENCRYPTION_KEY` | Decrypts every stored access token, given a copy of the database |
| `PLAID_SECRET` | Lets someone call Plaid as this app |
| Transactions and balances | Reveals where you live, shop, work, and travel |

BudgetFlow only requests the Transactions product. It cannot move money, and that must stay true.

## Already in place

- [x] Read-only Plaid product; no transfer or payment endpoints.
- [x] Access tokens encrypted with Fernet before storage; decrypted only immediately before a Plaid call.
- [x] Single-owner sign-in: scrypt passphrase hash, HttpOnly + SameSite=Strict session cookie, idle and absolute timeouts, rate-limited sign-in, sign-out of other browsers on passphrase change.
- [x] Every financial endpoint requires a session and filters by owner; cross-origin writes and unknown Host headers are refused.
- [x] Plaid webhook signatures verified (`Plaid-Verification` JWT); bodies over 64 KB rejected.
- [x] Logs redact tokens, keys, passphrases, cookies, and long account numbers.
- [x] Disconnecting a bank calls Plaid `/item/remove`.
- [x] Ports bound to `127.0.0.1`; secrets only in `.env` (mode 600, ignored by Git); Git hooks and CI scan for secrets.
- [x] Dependencies pinned and audited (`pip-audit`, `npm audit`, Dependabot).

## Required before the first real connection

### Access
- [ ] **Second factor.** Add TOTP or a passkey to sign-in. A passphrase alone is not enough for live bank data.
- [ ] **Decide where it runs.** Local-only on this Mac (simplest: keep every port on `127.0.0.1`, FileVault on), or hosted (then HTTPS everywhere, `APP_ENV=production` so the cookie is `Secure`, and a network restriction such as a VPN or an identity-aware proxy in front).
- [ ] **No webhook tunnels in production.** Use **Sync Transactions** locally, or a hosted HTTPS endpoint with a fixed host in `ALLOWED_HOSTS`.

### Secrets
- [ ] Move `APP_ENCRYPTION_KEY` and `PLAID_SECRET` out of `.env` into the macOS Keychain (local) or the host's secret manager (hosted), and load them at startup.
- [ ] Use a new, random PostgreSQL password, and a new encryption key and Plaid secret created only for Production (never reuse Sandbox values).
- [ ] Add key rotation: re-encrypt stored tokens with Fernet `MultiFernet`, then retire the old key.

### Data
- [ ] Encrypted backups of the database (for example `pg_dump` piped to an encrypted archive), and a tested restore.
- [ ] A retention rule (for example: delete transactions older than N years) and an "erase everything" action that removes every Item at Plaid and deletes all rows, behind re-authentication.
- [ ] An audit log of sign-ins, bank connections, disconnections, and syncs, without amounts or tokens.

### Plaid and Canada
- [ ] Apply for Plaid Production access and complete Plaid's review; check Plaid's current eligibility rules for personal projects and its coverage of your Canadian institution before building further.
- [ ] Request only the Transactions product and only the accounts you want included.
- [ ] Read your bank's terms on third-party aggregators, and check whether Canada's consumer-driven banking framework offers an accredited route at that time.
- [ ] Write a short privacy note for yourself: what is stored, where, for how long, and how to revoke access (Plaid Portal and the bank's connected-apps page).

### Verification
- [ ] `scripts/security-check.sh` passes; CI is green; no open Dependabot alerts.
- [ ] A fresh security review of the auth, Plaid, and logging code (for example with an AI-assisted review followed by your own reading).
- [ ] A dry run with Sandbox using the Production configuration (`APP_ENV=production`, HTTPS, real secrets store).

## If something leaks

1. Disconnect the bank in BudgetFlow (revokes the Item at Plaid), or remove the app in Plaid Portal.
2. Rotate `PLAID_SECRET` in the Plaid Dashboard and `APP_ENCRYPTION_KEY` locally; reconnect.
3. Run `python -m app.reset_passphrase` to sign out every browser, then set a new passphrase.
4. Check the bank's connected-apps page and recent activity.
