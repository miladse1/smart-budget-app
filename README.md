# BudgetFlow

BudgetFlow is a personal budgeting app. It reads transactions from a connected bank, sorts each purchase into a category, and subtracts that amount from the matching monthly budget.

Example:

- Food budget: $200
- Restaurant purchase: $20
- Remaining Food budget: $180

BudgetFlow never transfers, withdraws, or moves money. Bank sign-in happens inside Plaid Link. This app does not ask for a bank username or password.

This is a learning and portfolio project. It is a single-user app and is not ready for public deployment. See [Security limits](#security-limits-before-public-deployment).

## Architecture

```mermaid
flowchart LR
    User[User] --> Frontend[React frontend]
    Frontend --> Backend[FastAPI backend]
    Backend --> Database[(PostgreSQL)]
    Backend <--> Plaid[Plaid API]
    Plaid <--> Bank[Bank]
```

The browser talks only to the FastAPI backend. The backend stores budgets and transactions in PostgreSQL and, when you connect a bank, talks to Plaid. Plaid talks to the bank. Access tokens stay encrypted in the database.

You can use the whole app with demo data and no Plaid account. Plaid Link turns on after you add sandbox keys to `.env`.

## Folder structure

```text
smart-budget-app/
├── frontend/          React, TypeScript, Vite, Tailwind
├── backend/           FastAPI, SQLAlchemy, Alembic, Pytest
│   ├── app/           Models, budget maths, Plaid sync, API routes
│   ├── alembic/       Database migrations
│   └── tests/         Budget and API tests
├── docker-compose.yml PostgreSQL, backend, and frontend
├── .env.example       Environment variable template
└── README.md
```

Important backend files:

- `backend/app/models.py` — database tables
- `backend/app/services/budget_math.py` — how spending, income, and transfers affect a budget
- `backend/app/services/sync.py` — saving Plaid's added, modified, and removed transactions
- `backend/app/services/plaid_service.py` — Link tokens, token exchange, and webhooks
- `backend/app/routers/api.py` — HTTP routes
- `backend/app/services/demo_data.py` — the sample month, including the $20 Food purchase

## What you need installed

| Tool | Used for |
| --- | --- |
| Docker Desktop | Easiest way to run Postgres, the API, and the UI together |
| Python 3.12 or newer | Running the API without Docker. The Docker image uses 3.12. |
| Node.js 22 or newer and npm | Running the React app without Docker |

On this machine while the project was built: Docker and Node were installed, `psql` was not, and the `python3.12` command was not present. Python 3.14 was available and can run the backend. PostgreSQL is provided by Docker, so a local `psql` install is optional.

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
pip install -r requirements.txt
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

This project already includes the first migration at `backend/alembic/versions/0001_initial.py`.

## Load demo data

Either click **Load demo data** on the Settings page, or from `backend` with the virtualenv active:

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

## Plaid Sandbox credentials

1. Create a free account at https://dashboard.plaid.com/signup
2. Open https://dashboard.plaid.com/developers/keys
3. Copy the client ID and the **Sandbox** secret into `.env`:

```text
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_sandbox_secret
PLAID_ENV=sandbox
```

4. Restart the backend so it reads the new values.

Sandbox institutions are fake. They are not your real bank.

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

Plaid's older Development environment is not included in current SDK builds. This project still accepts `PLAID_ENV=development` and sends those requests to `https://development.plaid.com` when you have that access.

Linking a real bank generally requires Plaid **Production** access, which Plaid approves separately. Set `PLAID_ENV=production` and use the production secret only after that approval. Do not point production credentials at this project until the security limits below are handled.

## Test webhooks with a tunnel

Plaid cannot call `localhost` directly. Expose the backend with a tunnel, for example:

```bash
ngrok http 8000
```

Put the public HTTPS URL in `.env` before you connect the bank. The webhook is chosen when the Link token is created.

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

## Security limits before public deployment

This version is for local learning and a portfolio. Do not put it on the public internet as-is.

Still required before a real deployment:

- User accounts, passwords or passkeys, and sessions. The database already has a user id on budgets, items, and transactions so login can be added later.
- HTTPS everywhere.
- A secret manager for `APP_ENCRYPTION_KEY`, `PLAID_SECRET`, and the database password. The encryption key in a local `.env` file is not enough for production.
- Restrict who can call the API. Today anyone who can reach the backend can read the single user's data.
- Plaid production approval, a privacy policy, and a data-retention policy.
- Webhook verification is implemented, but the host, logs, and database also need production hardening.
- Backups, monitoring, rate limits, and a review of what you store. Transactions are personal financial data.
- Confirm the app still never requests Plaid products that move money. This code only uses Transactions.

CORS is limited to `FRONTEND_URL`. API errors return short messages and do not include tokens. Do not log `.env` or turn on debug pages that print request bodies.
