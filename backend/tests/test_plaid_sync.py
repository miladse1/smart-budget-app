"""/transactions/sync handling with a mocked Plaid. No network calls and no real credentials."""

import json
from decimal import Decimal
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet

from app.config import settings
from app.crypto import encrypt_secret
from app.models import BankAccount, Budget, PlaidItem, Transaction, utcnow
from app.money import money
from app.services import plaid_service
from app.services.reporting import build_month_report
from app.services.users import category_by_name, get_local_user

TOKEN = "access-sandbox-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


@pytest.fixture()
def item(db, monkeypatch):
    monkeypatch.setattr(settings, "app_encryption_key", Fernet.generate_key().decode())
    user = get_local_user(db)
    row = PlaidItem(
        user_id=user.id,
        institution_name="Sandbox Bank",
        encrypted_access_token=encrypt_secret(TOKEN),
        plaid_item_id="item-sync",
        status="active",
        is_demo=False,
        created_at=utcnow(),
    )
    db.add(row)
    for name, limit in (("Food", "200.00"), ("Transportation", "100.00")):
        db.add(
            Budget(
                user_id=user.id,
                category_id=category_by_name(db, name).id,
                month=9,
                year=2026,
                limit_amount=money(limit),
                is_demo=False,
                created_at=utcnow(),
                updated_at=utcnow(),
            )
        )
    db.commit()
    return row


ACCOUNTS = [
    {"account_id": "acc-chq", "name": "Plaid Checking", "type": "depository", "subtype": "checking", "balances": {"current": 500, "available": 450, "iso_currency_code": "CAD"}},
    {"account_id": "acc-sav", "name": "Plaid Saving", "type": "depository", "subtype": "savings", "balances": {"current": 900, "available": 900, "iso_currency_code": "CAD"}},
]


def txn(txn_id, amount="20.00", account="acc-chq", pending=False, pending_id=None, category="FOOD_AND_DRINK_RESTAURANT", day="2026-09-10"):
    primary = category.split("_AND_")[0] if "FOOD" in category else category.rsplit("_", 1)[0]
    return {
        "transaction_id": txn_id,
        "account_id": account,
        "amount": amount,
        "date": day,
        "name": txn_id.upper(),
        "merchant_name": f"Merchant {txn_id}",
        "pending": pending,
        "pending_transaction_id": pending_id,
        "personal_finance_category": {"primary": "FOOD_AND_DRINK" if "FOOD" in category else primary, "detailed": category},
    }


def page(added=(), modified=(), removed=(), cursor="c1", has_more=False, accounts=ACCOUNTS):
    return {
        "added": list(added),
        "modified": list(modified),
        "removed": [{"transaction_id": r} for r in removed],
        "accounts": accounts,
        "next_cursor": cursor,
        "has_more": has_more,
    }


class ScriptedPlaid:
    """Returns prepared pages in order and records each cursor it was called with."""

    def __init__(self, steps):
        self.steps = list(steps)
        self.cursors: list[str | None] = []
        self.tokens: set[str] = set()

    def __call__(self, access_token, cursor):
        self.tokens.add(access_token)
        self.cursors.append(cursor)
        step = self.steps.pop(0)
        if isinstance(step, Exception):
            raise step
        return step


def plaid_error(code, error_type="ITEM_ERROR"):
    body = json.dumps({"error_type": error_type, "error_code": code, "request_id": "req-1", "error_message": f"details {TOKEN}"})
    return plaid_service._failure(SimpleNamespace(body=body), "transactions sync")


def run(db, monkeypatch, item, steps):
    script = ScriptedPlaid(steps)
    monkeypatch.setattr(plaid_service, "pull_sync_page", script)
    user = get_local_user(db)
    return plaid_service.sync_item(db, user, item), script


def spent(db, name):
    report = build_month_report(db, get_local_user(db), 2026, 9)
    return next(view.spent for view in report.budgets if view.name == name)


def test_pages_are_followed_and_the_final_cursor_is_saved(db, monkeypatch, item):
    totals, script = run(
        db,
        monkeypatch,
        item,
        [
            page(added=[txn("t1")], cursor="c1", has_more=True),
            page(added=[txn("t2", account="acc-sav")], cursor="c2", has_more=True),
            page(added=[txn("t3")], cursor="c3", has_more=False),
        ],
    )
    assert script.cursors == [None, "c1", "c2"]
    assert script.tokens == {TOKEN}  # Decrypted only to call Plaid.
    assert totals == {"added": 3, "modified": 0, "removed": 0}
    db.refresh(item)
    assert item.transaction_cursor == "c3" and item.status == "active" and item.last_synced_at
    assert db.query(Transaction).count() == 3
    assert {a.plaid_account_id for a in db.query(BankAccount).all()} == {"acc-chq", "acc-sav"}

    # The next sync resumes from the saved cursor.
    _totals, script = run(db, monkeypatch, item, [page(cursor="c4")])
    assert script.cursors == ["c3"]


def test_interrupted_sync_rolls_back_and_keeps_the_old_cursor(db, monkeypatch, item):
    item.transaction_cursor = "start"
    db.commit()
    with pytest.raises(plaid_service.PlaidError) as caught:
        run(
            db,
            monkeypatch,
            item,
            [page(added=[txn("t1")], cursor="c1", has_more=True), plaid_error("INSTITUTION_DOWN", "INSTITUTION_ERROR")],
        )
    assert caught.value.retryable
    assert TOKEN not in str(caught.value)
    db.expire_all()
    assert db.query(Transaction).count() == 0  # Page 1 was not half-applied.
    assert db.query(PlaidItem).one().transaction_cursor == "start"
    assert db.query(PlaidItem).one().status == "active"


def test_mutation_during_pagination_restarts_from_the_original_cursor(db, monkeypatch, item):
    totals, script = run(
        db,
        monkeypatch,
        item,
        [
            page(added=[txn("t1")], cursor="c1", has_more=True),
            plaid_error("TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION", "TRANSACTIONS_ERROR"),
            page(added=[txn("t1")], cursor="c1b", has_more=True),
            page(added=[txn("t2")], cursor="c2b", has_more=False),
        ],
    )
    assert script.cursors == [None, "c1", None, "c1b"]
    assert db.query(Transaction).count() == 2
    db.refresh(item)
    assert item.transaction_cursor == "c2b"
    assert totals["added"] == 2


def test_added_modified_and_removed_are_applied(db, monkeypatch, item):
    run(db, monkeypatch, item, [page(added=[txn("t1", "20.00"), txn("t2", "15.00")], cursor="c1")])
    totals, _ = run(db, monkeypatch, item, [page(modified=[txn("t1", "25.00")], removed=["t2"], cursor="c2")])
    assert totals == {"added": 0, "modified": 1, "removed": 1}
    rows = {row.plaid_transaction_id: row.amount for row in db.query(Transaction).all()}
    assert rows == {"t1": Decimal("25.00")}
    assert spent(db, "Food") == Decimal("25.00")


def test_repeating_the_same_page_creates_no_duplicates(db, monkeypatch, item):
    same = page(added=[txn("t1")], cursor="c1")
    run(db, monkeypatch, item, [same])
    item.transaction_cursor = None  # Simulate a lost cursor: Plaid replays everything.
    db.commit()
    run(db, monkeypatch, item, [same])
    assert db.query(Transaction).count() == 1
    assert spent(db, "Food") == Decimal("20.00")


def test_pending_then_posted_is_counted_once(db, monkeypatch, item):
    transit = "TRANSPORTATION_PUBLIC_TRANSIT"
    run(db, monkeypatch, item, [page(added=[txn("pend-1", "18.00", pending=True, category=transit)], cursor="c1")])
    assert spent(db, "Transportation") == Decimal("18.00")

    # Posted version arrives with a pointer to the pending one, before Plaid sends the removal.
    run(db, monkeypatch, item, [page(added=[txn("post-1", "18.50", pending_id="pend-1", category=transit)], cursor="c2")])
    assert spent(db, "Transportation") == Decimal("18.50")
    assert [row.plaid_transaction_id for row in db.query(Transaction).all()] == ["post-1"]

    # Plaid's later removal of the pending row is harmless.
    totals, _ = run(db, monkeypatch, item, [page(removed=["pend-1"], cursor="c3")])
    assert totals["removed"] == 0
    assert spent(db, "Transportation") == Decimal("18.50")


def test_login_required_marks_the_connection_and_explains_safely(db, client, monkeypatch, item):
    monkeypatch.setattr(plaid_service, "pull_sync_page", ScriptedPlaid([plaid_error("ITEM_LOGIN_REQUIRED")]))
    response = client.post(f"/api/plaid/items/{item.id}/sync")
    assert response.status_code == 409
    assert "sign in again" in response.json()["detail"]
    assert TOKEN not in response.text
    db.expire_all()
    stored = db.query(PlaidItem).one()
    assert stored.status == "error"
    assert stored.encrypted_access_token is not None  # Kept for update-mode Link.


def test_outage_returns_a_retryable_message(db, client, monkeypatch, item):
    monkeypatch.setattr(plaid_service, "pull_sync_page", ScriptedPlaid([plaid_error("INSTITUTION_NOT_RESPONDING", "INSTITUTION_ERROR")]))
    response = client.post("/api/plaid/sync")
    assert response.status_code == 503
    assert "temporarily unavailable" in response.json()["detail"]


def test_one_failing_bank_does_not_block_the_others(db, client, monkeypatch, item):
    user = get_local_user(db)
    second = PlaidItem(
        user_id=user.id,
        institution_name="Second Bank",
        encrypted_access_token=encrypt_secret("access-sandbox-second-0000"),
        plaid_item_id="item-second",
        status="active",
        is_demo=False,
        created_at=utcnow(),
    )
    db.add(second)
    db.commit()

    def pull(access_token, cursor):
        if access_token == TOKEN:
            raise plaid_error("ITEM_LOGIN_REQUIRED")
        return page(added=[txn("ok-1", account="acc-other")], accounts=[{"account_id": "acc-other", "name": "Other", "type": "depository", "balances": {"current": 1}}])

    monkeypatch.setattr(plaid_service, "pull_sync_page", pull)
    response = client.post("/api/plaid/sync")
    assert response.status_code == 200
    body = response.json()
    assert body["synced_items"] == 1 and body["added"] == 1
    assert "could not sync" in body["message"]


def test_sync_refuses_another_profiles_item(db, monkeypatch, item):
    from app.models import User

    stranger = User(name="Other", email="other@example.invalid", created_at=utcnow())
    db.add(stranger)
    db.commit()
    monkeypatch.setattr(plaid_service, "pull_sync_page", ScriptedPlaid([]))
    with pytest.raises(plaid_service.PlaidError):
        plaid_service.sync_item(db, stranger, item)
