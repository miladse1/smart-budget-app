# BudgetFlow setup and operation

Detailed instructions. For an overview, see the [README](../README.md).

## What you need installed

| Tool | Used for |
| --- | --- |
| Docker Desktop | Easiest way to run Postgres, the API, and the UI together |
| Python 3.14 (3.12+ works) | Running the API without Docker. `requirements-lock.txt` is tested on 3.14; the Docker image uses 3.12. |
| Node.js 22 or newer and npm | Running the React app without Docker |

If Docker is missing, install [Docker Desktop](https://www.docker.com/products/docker-desktop/).

If you want to run the API outside Docker and `python3` is missing, install Python 3.12 or newer from [python.org](https://www.python.org/downloads/).

If `node` or `npm` is missing, install Node.js from [nodejs.org](https://nodejs.org/).

## Create `.env`

From the project root:

```bash
cp .env.example .env
```

`.env` is listed in `.gitignore`. Do not commit it.

### Generate `APP_ENCRYPTION_KEY`

This key encrypts Plaid access tokens before they are saved. Generate one with Python. You do not need extra packages:

```bash
python3 -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
```

Paste the result into `.env` as `APP_ENCRYPTION_KEY`. Keep the key private. If you lose it, saved bank tokens cannot be read and those banks must be connected again.

Leave `PLAID_CLIENT_ID` and `PLAID_SECRET` empty until you want a sandbox bank. The app still runs on demo data.

`PLAID_ENV` defaults to `sandbox`.

## Start with Docker Compose

From the project root, with Docker Desktop running:

```bash
docker compose up --build
```

Then open:

- App: http://localhost:5173
- API docs: http://localhost:8000/docs

The backend container applies Alembic migrations on startup. Postgres data is kept in a Docker volume named `budgetflow-pg`.

Stop the app with Ctrl+C, or from another terminal:

```bash
docker compose down
```

`docker compose down -v` also deletes the database volume.

## Start without Docker

You still need PostgreSQL. The simplest option is to run only the database in Docker:

```bash
docker compose up -d db
```

If you already have PostgreSQL, create a database named `budgetflow` and set `DATABASE_URL` in `.env` to match it. The default URL is:

```text
postgresql+psycopg://budgetflow:budgetflow@localhost:5432/budgetflow
```

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-lock.txt
alembic upgrade head
uvicorn app.main:app --reload
```

The API listens on http://localhost:8000. Interactive docs are at http://localhost:8000/docs.

### Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The UI listens on http://localhost:5173 and proxies `/api` to the backend.

## Alembic migrations

Run these from `backend` with the virtualenv active and Postgres running:

```bash
alembic upgrade head
```

That creates the tables and inserts the default categories. The API also inserts those categories on startup if they are missing, so either path is safe to repeat.

A later schema change would be created with:

```bash
alembic revision -m "describe the change"
```

Migrations so far: `0001_initial` (tables and categories), `0002_onboarding` (setup answers), `0003_owner_auth` (owner passphrase and sessions).

## First run: passphrase, then onboarding

The first time BudgetFlow opens, it asks you to create a passphrase (at least 12 characters). Every later visit needs it. Existing budgets and accounts are kept when the passphrase is added to an older install. If you forget it, see [Reset the passphrase](#reset-the-passphrase).

After that, it shows a short setup instead of the dashboard:

1. Welcome
2. What you want help with (spending, saving, tracking, or all three)
3. Currency and the day your budget month starts
4. Connect a bank through Plaid, or use demo mode
5. Suggested category budgets you can edit, then a confirmation

Answers are saved through the API: currency and start day in user preferences, the chosen goal and a completion flag through `PUT /api/onboarding`. Setup does not ask for any personal details. To see it again, open **Settings → Restart onboarding**. Your data is kept.

Migration `0002_onboarding` adds the two preference columns. Run `alembic upgrade head` after pulling this change (Docker does this on startup).

## Install as an app

BudgetFlow is a progressive web app. It has a web app manifest, app icons and a small service worker, so it can be installed and opens in its own full-screen window:

- **iPhone or iPad:** open it in Safari, tap **Share**, then **Add to Home Screen**.
- **Chrome or Edge:** use the install icon in the address bar, or **Settings → App → Install**.

It is still a web app, not an App Store download. The service worker runs only in production builds (`npm run build` then `npm run preview`) and never caches `/api` responses, so balances and transactions always come from the server. Installation requires HTTPS, except on `localhost`.

## Load demo data

Either click **Load demo data** on the Settings page (or choose demo mode during onboarding), or from `backend` with the virtualenv active:

```bash
python -m app.seed
```

The demo month includes:

- A demo user and a Demo Bank chequing account
- A $200 Food budget and a $20 Corner Bistro purchase, so $180 remains
- Groceries close to the limit
- Entertainment over the limit
- Income and a transfer, which do not reduce expense budgets
- One pending City Transit purchase

Loading demo data again replaces the previous demo records. **Clear demo data** removes the demo account, demo transactions, and demo budgets. It does not delete transactions that came from a real Plaid connection.

## Run tests

Backend, from `backend` with the virtualenv active:

```bash
pytest
mypy app
```

Frontend, from `frontend`:

```bash
npm test
npm run typecheck
npm run build
```

Backend tests use an in-memory database. They do not call Plaid or Postgres.

Security checks (secrets, sensitive files, full history, dependency audits):

```bash
scripts/setup-dev-security.sh   # once: enables the Git hooks
scripts/security-check.sh
```

## Plaid Sandbox credentials

Follow **[SECURITY.md → Adding Plaid Sandbox credentials locally](../SECURITY.md#adding-plaid-sandbox-credentials-locally)**. In short: create a free account at https://dashboard.plaid.com/signup, then type the client ID and the **Sandbox** secret into your local `.env` (`PLAID_CLIENT_ID`, `PLAID_SECRET`, with `PLAID_ENV=sandbox`) in your own editor, and restart the backend. Never paste these values into chat tools, issues, commits or documentation.

Sandbox institutions are fake. They are not your real bank. BudgetFlow refuses `PLAID_ENV=production` unless `APP_ENV=production`, and shows a "Sandbox mode" strip on every screen while it is not in Production.

## Test Plaid Sandbox

1. Open Accounts and click **Connect a bank**.
2. Plaid Link opens. Search for an institution such as **First Platypus Bank**.
3. Use the public sandbox login:
   - Username: `user_good`
   - Password: `pass_good`
   - If asked for a code, use `1234`
4. After Link closes, BudgetFlow exchanges the public token on the server, encrypts the access token, and calls `/transactions/sync`.
5. Use **Sync Transactions** on the Dashboard if the first sync returns no purchases yet. Sandbox data can take a few seconds to appear.

Confirm the API responses in http://localhost:8000/docs. They include account names and transactions. They do not include the access token or the Plaid secret.

## Real bank connections

Sandbox never links a real bank account.

Plaid has retired its Development environment, so `PLAID_ENV` accepts only `sandbox` and `production`. Production is refused unless `APP_ENV=production`; see [SECURITY.md](../SECURITY.md) for what must be in place first.

Linking a real bank generally requires Plaid **Production** access, which Plaid approves separately. Set `PLAID_ENV=production` and use the production secret only after that approval. Do not point production credentials at this project until every item in [REAL_BANK_READINESS.md](REAL_BANK_READINESS.md) is done.

## Test webhooks with a tunnel

Plaid cannot call `localhost` directly. Expose the backend with a tunnel, for example:

```bash
ngrok http 8000
```

Put the public HTTPS URL in `.env` before you connect the bank, and add the tunnel's host name to `ALLOWED_HOSTS` (the API refuses unknown host names). The webhook is chosen when the Link token is created.

```text
PLAID_WEBHOOK_URL=https://your-subdomain.ngrok-free.app/api/plaid/webhook
```

Restart the backend, connect a sandbox bank again, and watch the API log. A `TRANSACTIONS` / `SYNC_UPDATES_AVAILABLE` webhook syncs that item.

When Plaid credentials are set, the webhook route checks Plaid's `Plaid-Verification` signature. Requests without a valid signature are rejected. **Sync Transactions** remains available when a webhook cannot reach your machine.

## How the budget maths works

Plaid's amount sign is the opposite of a normal bank statement:

- A positive amount is money leaving the account, such as a $20 restaurant purchase.
- A negative amount is money entering the account, such as payroll or a refund.

Income and transfers are stored, but they do not reduce Food, Groceries, or other expense budgets. A refund in Food does reduce that category's spending.

Pending and posted copies of one purchase are not both counted. When the posted transaction arrives, it replaces the pending one. Pending purchases that have not posted yet still count, and the transaction list marks them as pending.

If you change a category by hand, later syncs update the amount and date but leave your category in place. Both the old and new budgets update immediately because spent amounts are calculated from transactions rather than stored on the budget.

## Reset the passphrase

There is no recovery email. On the computer that runs BudgetFlow:

```bash
cd backend && .venv/bin/python -m app.reset_passphrase       # or:
docker compose exec backend python -m app.reset_passphrase
```

It removes the passphrase and signs out every browser; budgets, accounts, and transactions are kept. Open BudgetFlow and create a new one.
