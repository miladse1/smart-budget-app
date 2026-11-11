"""Forgot the passphrase? Clear it from this computer, then create a new one in the app.

    cd backend && .venv/bin/python -m app.reset_passphrase
    docker compose exec backend python -m app.reset_passphrase

Budgets, accounts, and transactions are kept. Every browser is signed out. Running this needs
access to this computer and its database, which is what proves you are the owner.
"""

from app.auth import revoke_sessions
from app.database import SessionLocal
from app.services.users import get_local_user


def main() -> None:
    answer = input("Remove the BudgetFlow passphrase and sign out everywhere? Type 'reset' to continue: ")
    if answer.strip().lower() != "reset":
        print("Nothing changed.")
        return
    with SessionLocal() as db:
        owner = get_local_user(db)
        owner.password_hash = None
        signed_out = revoke_sessions(db, owner)
        db.commit()
    print(f"Passphrase removed; {signed_out} session(s) signed out. Open BudgetFlow to create a new one.")


if __name__ == "__main__":
    main()
