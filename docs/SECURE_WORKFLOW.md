# Secure development workflow

How to change BudgetFlow, alone or with an AI assistant, without leaking secrets or personal data.

## Once per computer or clone

```bash
brew install gitleaks pip-audit
scripts/setup-dev-security.sh     # enables .githooks, creates ~/.config/git-guard/private-patterns.txt
```

Open `~/.config/git-guard/private-patterns.txt` and add your personal email, phone number (with and
without dashes), student number, and street address, one per line. The hooks block any commit that
contains them. The file never leaves your computer.

## Where things live

| | Location | In Git? |
| --- | --- | --- |
| Source code, fictional demo and test data | this repository | yes |
| `.env` (Plaid credentials, encryption key) | repository root, mode 600, ignored | never |
| Budgets, transactions, encrypted bank tokens | PostgreSQL (Docker volume `budgetflow-pg`) | never |
| Bank exports (CSV, OFX, statements) | keep outside this folder | never |

Edit `.env` in your own editor; never paste Plaid credentials or keys into chat with an AI assistant
or into source files.

## Everyday loop

1. **Develop.** `docker compose up` (see `docs/SETUP.md`). Claude Code and Cursor read `AGENTS.md`;
   Claude Code also enforces `.claude/settings.json` (asks before commit/push, denies reading `.env`).
2. **Test.** `cd backend && .venv/bin/python -m pytest -q && .venv/bin/python -m mypy app` and `cd frontend && npm test`.
3. **Review.** Before staging, read the diff yourself:
   ```bash
   git status
   git diff                 # what changed
   git add -p               # stage hunk by hunk instead of `git add .`
   git diff --cached --stat # exactly what the commit will contain
   ```
   Screenshots must show demo data only (Settings → Load demo data), never real balances or merchants.
4. **Commit.** `git commit`. The pre-commit hook checks blocked file types, sizes, browser-exposed
   secrets, your private details, and secrets (gitleaks). If it blocks, read the message; do not use
   `--no-verify`.
5. **Check before pushing.** `scripts/security-check.sh` (working tree, full history, `.env`
   permissions, built frontend, dependency audits).
6. **Push.** `git push`. The pre-push hook scans every outgoing commit again.
7. **Watch.** GitHub runs the Security workflow on every push and weekly. Dependabot opens
   grouped update pull requests on Mondays and security fixes immediately; review and merge them
   after CI passes.

## If something goes wrong

- **The hook blocks a file that should be committed** (for example a fictional PDF fixture): move
  it under `backend/tests/fixtures/` or add a narrow, reviewed line to `.githooks/allowed-paths`.
- **The hook reports a false-positive secret:** add its fingerprint (printed by gitleaks) to
  `.gitleaksignore` with a comment saying why.
- **A real secret was committed but not pushed:** `git reset --soft HEAD~1`, remove the secret,
  commit again. Rotate the secret anyway if it was ever pushed or shared.
- **A real secret reached GitHub:** rotate it immediately (Plaid Dashboard → Keys for `PLAID_SECRET`;
  a new `APP_ENCRYPTION_KEY` means reconnecting banks), then clean history only with a deliberate plan; deleting the file in a new commit
  does not remove it from history.

## Publishing

Before making this repository public or pushing to a public remote:

1. `scripts/security-check.sh` passes.
2. `gitleaks git --redact` over the full history is clean (part of the check above).
3. `git ls-files` contains nothing from the "never" rows above.
4. Screenshots and docs show demo data only.
5. On GitHub: Settings → Code security → enable secret scanning, push protection, Dependabot
   alerts and security updates, and private vulnerability reporting.
