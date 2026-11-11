# Instructions for AI coding assistants

These rules apply to every assistant working in this repository (Claude Code, Cursor, Codex, and
others). BudgetFlow handles bank connections and personal financial data, so security rules come
before speed. If a rule blocks the task, stop and ask the user.

## Where private data lives

| What | Where | Rule |
| --- | --- | --- |
| `PLAID_CLIENT_ID`, `PLAID_SECRET`, `APP_ENCRYPTION_KEY`, database password | `.env` in the repository root (ignored, mode 600) | Never open, print, copy, or summarise it. Use `.env.example` for names. |
| Budgets, transactions, accounts, encrypted Plaid tokens | PostgreSQL (Docker volume `budgetflow-pg`) | Never query real rows into chat, tests, fixtures, docs, or screenshots. |
| Bank exports (CSV, OFX, QFX, PDF statements) | Not in this repository | Never add them. Tests use the fictional demo data in `app/services/demo_data.py`. |

## Rules

1. **Money never moves.** BudgetFlow only reads transactions. Never add Plaid products or endpoints
   that transfer, pay, or move money.
2. **Secrets stay on the server.** Only `backend/` reads secrets. Code in `frontend/` must never
   reference a secret, and no `VITE_` variable may hold one (Vite puts those in the browser bundle).
3. **Bank tokens are always encrypted** with `app.crypto.encrypt_secret` before they are stored, and
   decrypted only inside `app/services/plaid_service.py` immediately before a Plaid call.
4. **Every endpoint with financial data depends on `current_user`** (`app/deps.py`) and filters by
   `user.id`. The Plaid webhook is the only unauthenticated write, and it is verified by signature.
5. **Never log secrets or financial details.** Use the logger in `app/logging_utils.py`, which
   redacts tokens, keys, passphrases, and account numbers; do not bypass it with `print`.
6. **Fictional data only** in tests, fixtures, seed data, docs, and screenshots.
7. **Commits.** Before proposing a commit, show the user `git status` and `git diff --cached --stat`.
   The pre-commit hook (`.githooks/guard.sh`) must pass. Never use `--no-verify`. Never edit
   `.githooks/`, `.gitleaks.toml`, `.gitleaksignore`, or `.gitignore` to silence a finding without the
   user's explicit approval for that specific change.
8. **Ask first, every time**, before: committing, pushing, changing GitHub settings or visibility,
   force-pushing, rewriting history, or switching `PLAID_ENV` to `production`.
9. **Never weaken a security control** (sign-in, session limits, rate limits, origin and host checks,
   encryption, webhook verification) to make a test or feature pass. Fix the cause or ask.

## Commands

```bash
scripts/setup-dev-security.sh                        # once per clone: enables the Git hooks
scripts/security-check.sh                            # full check before pushing
cd backend && .venv/bin/python -m pytest -q && .venv/bin/python -m mypy app
cd frontend && npm test && npm run typecheck
```

See `docs/SECURE_WORKFLOW.md` and `docs/REAL_BANK_READINESS.md`.
