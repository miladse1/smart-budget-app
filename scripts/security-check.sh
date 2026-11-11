#!/usr/bin/env bash
# Full security check. Run before pushing, before changing repository visibility, and after
# dependency updates. Nothing is printed that could reveal a secret.
#
#   scripts/security-check.sh          all checks
#   scripts/security-check.sh --quick  skip the dependency audits (no network)
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
fail=0
section() { printf '\n\033[1m%s\033[0m\n' "$*"; }
bad() { printf '\033[31mFAIL\033[0m  %s\n' "$*"; fail=1; }
ok() { printf '\033[32mok\033[0m    %s\n' "$*"; }

section "1. Files, private details, and secrets (working tree and full history)"
if .githooks/guard.sh all; then ok "git-guard"; else bad "git-guard (details above)"; fi

section "2. Secrets and financial data stay out of Git"
if [ -f .env ]; then
  git check-ignore -q .env && ok ".env is ignored by Git" || bad ".env is not ignored"
  perms="$(stat -f '%Lp' .env 2>/dev/null || stat -c '%a' .env)"
  [ "$perms" = 600 ] && ok ".env is readable only by you (mode 600)" || bad ".env mode is $perms; run: chmod 600 .env"
fi
exports="$(find . \( -path ./frontend/node_modules -o -path ./backend/.venv -o -path ./.git -o -name .mypy_cache -o -name .pytest_cache -o -name .ruff_cache \) -prune -o \
  \( -iname '*.csv' -o -iname '*.ofx' -o -iname '*.qfx' -o -iname '*.db' -o -iname '*.sqlite*' -o -iname '*.dump' \) -print 2>/dev/null)"
if [ -n "$exports" ]; then
  printf '%s\n' "$exports" | sed 's/^/      /'
  bad "bank exports or database files inside the repository folder (ignored, but keep them elsewhere)"
else
  ok "no bank exports or database files in the repository folder"
fi

section "3. No secret values in the built frontend"
if [ -f .env ] && [ -d frontend/dist ]; then
  if python3 -I - .env frontend/dist <<'PY'; then ok "no .env secret values in frontend/dist"; else bad "secret values found in frontend/dist"; fi
import os, re, sys
env, build = sys.argv[1], sys.argv[2]
values = []
for line in open(env):
    if "=" in line and not line.lstrip().startswith("#"):
        key, value = line.rstrip("\n").split("=", 1)
        value = value.strip().strip("\"'")
        if len(value) >= 12 and re.search(r"KEY|SECRET|TOKEN|PASSWORD|CLIENT_ID", key):
            values.append((key, value.encode()))
hits = set()
for folder, _dirs, files in os.walk(build):
    for name in files:
        data = open(os.path.join(folder, name), "rb").read()
        hits.update(key for key, value in values if value in data)
for key in sorted(hits):
    print(f"      {key} appears in {build}")
sys.exit(1 if hits else 0)
PY
else
  ok "no build or no .env; skipped"
fi

if [ "${1:-}" != "--quick" ]; then
  section "4. Known vulnerabilities in dependencies"
  if command -v pip-audit >/dev/null 2>&1; then
    if pip-audit -r backend/requirements-lock.txt --no-deps --disable-pip --progress-spinner off >/tmp/pip-audit.$$ 2>&1; then ok "Python (pip-audit)"; else cat /tmp/pip-audit.$$; bad "Python dependencies"; fi
    rm -f /tmp/pip-audit.$$
  else
    bad "pip-audit is not installed (brew install pip-audit)"
  fi
  if (cd frontend && npm audit --audit-level=moderate >/tmp/npm-audit.$$ 2>&1); then ok "JavaScript (npm audit, including dev tools)"; else tail -20 /tmp/npm-audit.$$; bad "JavaScript dependencies"; fi
  rm -f /tmp/npm-audit.$$
fi

echo
if [ "$fail" -ne 0 ]; then echo "Security check failed."; exit 1; fi
echo "Security check passed."
