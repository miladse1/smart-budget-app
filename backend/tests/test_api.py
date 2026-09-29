"""API behaviour, including the rule that secrets never leave the server."""

from datetime import date

from cryptography.fernet import Fernet

from app.config import settings
from app.crypto import decrypt_secret
from app.models import Transaction
from app.services.demo_data import load_demo_data


FORBIDDEN = (
    "access-sandbox-secret-token",
    "super-secret-plaid-value",
    "encrypted_access_token",
)


def _walk_keys(value, found: list[str]) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            lowered = key.lower()
            if "secret" in lowered or ("token" in lowered and key != "link_token"):
                found.append(key)
            _walk_keys(item, found)
    elif isinstance(value, list):
        for item in value:
            _walk_keys(item, found)


def test_dashboard_api_shows_food_example(db, client):
    load_demo_data(db, today=date(2026, 9, 20))
    response = client.get("/api/dashboard", params={"month": 9, "year": 2026})
    assert response.status_code == 200
    body = response.json()
    food = next(row for row in body["budgets"] if row["name"] == "Food")
    assert food["limit_amount"] == "200.00"
    assert food["spent"] == "20.00"
    assert food["remaining"] == "180.00"
    assert body["summary"]["income"] == "2450.00"
    assert body["summary"]["spent"] == "574.50"
    assert any(row["name"] == "Entertainment" for row in body["overspending"])


def test_category_change_endpoint_moves_the_purchase(db, client):
    load_demo_data(db, today=date(2026, 9, 20))
    txns = client.get("/api/transactions", params={"month": 9, "year": 2026, "page_size": 50})
    food_txn = next(item for item in txns.json()["items"] if item["merchant_name"] == "Corner Bistro")
    categories = client.get("/api/categories").json()
    groceries = next(item for item in categories if item["name"] == "Groceries")
    changed = client.patch(
        f"/api/transactions/{food_txn['id']}/category",
        json={"category_id": groceries["id"]},
    )
    assert changed.status_code == 200
    assert changed.json()["category_name"] == "Groceries"
    assert changed.json()["user_overrode_category"] is True
    budgets = client.get("/api/budgets", params={"month": 9, "year": 2026}).json()
    food = next(row for row in budgets if row["name"] == "Food")
    grocery_budget = next(row for row in budgets if row["name"] == "Groceries")
    assert food["spent"] == "0.00"
    assert food["remaining"] == "200.00"
    assert grocery_budget["spent"] == "152.00"
    assert grocery_budget["remaining"] == "-2.00"


def test_responses_never_include_plaid_secrets(db, client, monkeypatch):
    key = Fernet.generate_key().decode()
    monkeypatch.setattr(settings, "plaid_client_id", "")
    monkeypatch.setattr(settings, "plaid_secret", "super-secret-plaid-value")
    monkeypatch.setattr(settings, "app_encryption_key", key)
    blocked = client.post("/api/plaid/link-token")
    assert blocked.status_code == 503
    assert "super-secret-plaid-value" not in blocked.text
    assert key not in blocked.text

    monkeypatch.setattr(settings, "plaid_client_id", "client-id")
    monkeypatch.setattr(
        "app.services.plaid_service.exchange_public_token",
        lambda public_token: ("access-sandbox-secret-token", "item-sandbox-1"),
    )
    monkeypatch.setattr(
        "app.services.plaid_service.pull_sync_page",
        lambda access_token, cursor: {
            "added": [
                {
                    "transaction_id": "sandbox-txn-1",
                    "account_id": "sandbox-account-1",
                    "amount": 12.5,
                    "date": "2026-09-03",
                    "name": "COFFEE",
                    "merchant_name": "Cafe",
                    "pending": False,
                    "personal_finance_category": {
                        "primary": "FOOD_AND_DRINK",
                        "detailed": "FOOD_AND_DRINK_COFFEE",
                    },
                }
            ],
            "modified": [],
            "removed": [],
            "accounts": [
                {
                    "account_id": "sandbox-account-1",
                    "name": "Plaid Checking",
                    "official_name": "Plaid Gold Checking",
                    "type": "depository",
                    "subtype": "checking",
                    "balances": {"current": 100, "available": 90, "iso_currency_code": "CAD"},
                }
            ],
            "next_cursor": "cursor-1",
            "has_more": False,
        },
    )

    created = client.post(
        "/api/plaid/exchange",
        json={"public_token": "public-sandbox-token", "institution_name": "First Platypus Bank"},
    )
    assert created.status_code == 200
    payload = created.json()
    leaked: list[str] = []
    _walk_keys(payload, leaked)
    assert leaked == []
    for marker in (*FORBIDDEN, key):
        assert marker not in created.text

    stored = created.json()["accounts"][0]["account_name"]
    assert stored == "Plaid Checking"
    from app.models import PlaidItem

    item = db.query(PlaidItem).filter(PlaidItem.plaid_item_id == "item-sandbox-1").one()
    assert item.encrypted_access_token is not None
    assert item.encrypted_access_token != "access-sandbox-secret-token"
    assert decrypt_secret(item.encrypted_access_token) == "access-sandbox-secret-token"
    assert db.query(Transaction).count() == 1

    for path in ("/api/accounts", "/api/dashboard", "/api/settings", "/openapi.json"):
        body = client.get(path).text
        for marker in (*FORBIDDEN, key, "access-sandbox-secret-token"):
            assert marker not in body


def test_webhook_without_signature_is_rejected_when_plaid_is_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "plaid_client_id", "client-id")
    monkeypatch.setattr(settings, "plaid_secret", "super-secret-plaid-value")
    response = client.post("/api/plaid/webhook", json={"webhook_type": "TRANSACTIONS", "webhook_code": "SYNC_UPDATES_AVAILABLE"})
    assert response.status_code == 401
    assert "super-secret-plaid-value" not in response.text


def test_sync_button_without_a_bank_is_a_real_empty_result(client):
    response = client.post("/api/plaid/sync")
    assert response.status_code == 200
    assert response.json()["synced_items"] == 0
    assert "No connected bank" in response.json()["message"]


def test_clear_demo_keeps_a_real_transaction(db, client):
    from app.models import BankAccount, PlaidItem, utcnow
    from app.money import money
    from app.services.users import category_by_name, get_local_user

    load_demo_data(db, today=date(2026, 9, 20))
    user = get_local_user(db)
    real_item = PlaidItem(
        user_id=user.id,
        institution_name="Real Bank",
        encrypted_access_token=None,
        plaid_item_id="real-item",
        status="disconnected",
        is_demo=False,
        created_at=utcnow(),
    )
    db.add(real_item)
    db.flush()
    account = BankAccount(
        plaid_item_id=real_item.id,
        plaid_account_id="real-account",
        account_name="Real Chequing",
        official_name=None,
        account_type="depository",
        account_subtype="checking",
        current_balance=money("10.00"),
        available_balance=money("10.00"),
        currency="CAD",
        is_demo=False,
    )
    db.add(account)
    db.flush()
    db.add(
        Transaction(
            user_id=user.id,
            bank_account_id=account.id,
            plaid_transaction_id="real-txn",
            merchant_name="Real Cafe",
            original_name="REAL CAFE",
            amount=money("4.00"),
            transaction_date=date(2026, 9, 2),
            pending=False,
            category_id=category_by_name(db, "Food").id,
            user_overrode_category=False,
            is_demo=False,
            created_at=utcnow(),
            updated_at=utcnow(),
        )
    )
    db.commit()
    cleared = client.post("/api/demo/clear")
    assert cleared.status_code == 200
    db.expire_all()
    remaining = db.query(Transaction).all()
    assert [txn.merchant_name for txn in remaining] == ["Real Cafe"]


def test_onboarding_status_persists_and_can_restart(client):
    assert client.get("/api/app").json()["onboarding_completed"] is False

    done = client.put("/api/onboarding", json={"completed": True, "goal": "saving"})
    assert done.status_code == 200
    assert done.json()["onboarding_completed"] is True
    assert client.get("/api/app").json()["goal"] == "saving"
    assert client.get("/api/settings").json()["onboarding_completed"] is True

    restart = client.put("/api/onboarding", json={"completed": False})
    assert restart.json()["onboarding_completed"] is False
    assert restart.json()["goal"] == "saving"


def test_onboarding_rejects_unknown_goal(client):
    response = client.put("/api/onboarding", json={"completed": True, "goal": "lottery"})
    assert response.status_code == 422
