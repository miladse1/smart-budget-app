"""HTTP routes. Spent totals are calculated here from transactions."""

import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session, joinedload

from app.config import bank_connection_block_reason, settings
from app.database import get_db
from app.deps import current_user
from app.models import Budget, Category, PlaidItem, Transaction, User, utcnow
from app.money import money
from app.presenters import account_out, budget_out, transaction_out
from app.schemas import (
    AppInfo,
    BudgetCreate,
    BudgetOut,
    BudgetUpdate,
    CategoryChange,
    CategoryOut,
    CopyBudgetsRequest,
    CopyBudgetsResult,
    DashboardOut,
    DashboardSummary,
    DemoResult,
    ExchangeIn,
    ItemOut,
    LinkTokenOut,
    OnboardingUpdate,
    OverspendOut,
    SettingsOut,
    SettingsUpdate,
    SpendingSlice,
    SyncResult,
    TransactionOut,
    TransactionPage,
)
from app.services.budget_math import current_budget_month, previous_month
from app.services.demo_data import clear_demo_data, load_demo_data
from app.crypto import EncryptionError, decrypt_secret
from app.ratelimit import rate_limit
from app.services.plaid_service import PlaidError, connect_item, create_link_token, disconnect_item, sync_item, verify_webhook
from app.services.reporting import build_month_report, list_accounts

router = APIRouter(prefix="/api")

# Limits per client address. Connecting and syncing call Plaid, which is rate limited and billed.
connect_limit = Depends(rate_limit("plaid-connect", limit=10, window_seconds=60))
exchange_limit = Depends(rate_limit("plaid-exchange", limit=5, window_seconds=60))
sync_limit = Depends(rate_limit("plaid-sync", limit=6, window_seconds=60))
disconnect_limit = Depends(rate_limit("plaid-disconnect", limit=10, window_seconds=60))
webhook_limit = Depends(rate_limit("plaid-webhook", limit=120, window_seconds=60))
demo_limit = Depends(rate_limit("demo-data", limit=10, window_seconds=60))


def _plaid_http_error(exc: PlaidError) -> HTTPException:
    """Map a Plaid failure to a status code. The message is already safe for people to read."""
    if exc.login_required:
        return HTTPException(status_code=409, detail=str(exc))
    if exc.retryable:
        return HTTPException(status_code=503, detail=str(exc))
    return HTTPException(status_code=502, detail=str(exc))


def _month_year(user: User, month: int | None, year: int | None) -> tuple[int, int]:
    start_day = user.preference.budget_start_day if user.preference else 1
    default_month, default_year = current_budget_month(date.today(), start_day)
    chosen_month = month or default_month
    chosen_year = year or default_year
    if not 1 <= chosen_month <= 12:
        raise HTTPException(status_code=422, detail="Month must be between 1 and 12.")
    if not 2000 <= chosen_year <= 2100:
        raise HTTPException(status_code=422, detail="Year is out of range.")
    return chosen_month, chosen_year


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/app", response_model=AppInfo)
def app_info(user: User = Depends(current_user), db: Session = Depends(get_db)) -> AppInfo:
    start_day = user.preference.budget_start_day if user.preference else 1
    month, year = current_budget_month(date.today(), start_day)
    demo_loaded = db.query(PlaidItem).filter(PlaidItem.user_id == user.id, PlaidItem.is_demo.is_(True)).count() > 0
    return AppInfo(
        name="BudgetFlow",
        user_name=user.name,
        plaid_env=settings.plaid_env,
        plaid_configured=settings.plaid_configured,
        currency=user.preference.currency if user.preference else "CAD",
        budget_start_day=start_day,
        onboarding_completed=user.preference.onboarding_completed if user.preference else False,
        goal=user.preference.goal if user.preference else None,
        month=month,
        year=year,
        demo_loaded=demo_loaded,
    )


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    month: int | None = None,
    year: int | None = None,
    account_id: int | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> DashboardOut:
    chosen_month, chosen_year = _month_year(user, month, year)
    if account_id is not None:
        owned = {account.id for account in list_accounts(db, user)}
        if account_id not in owned:
            raise HTTPException(status_code=404, detail="Account not found.")
    report = build_month_report(db, user, chosen_year, chosen_month, account_id)
    slices = [
        SpendingSlice(name=view.name, colour=view.colour, spent=view.spent)
        for view in report.budgets
        if view.spent > 0
    ]
    over = [
        OverspendOut(name=view.name, colour=view.colour, over_amount=view.over_amount)
        for view in report.budgets
        if view.status == "over"
    ]
    return DashboardOut(
        month=chosen_month,
        year=chosen_year,
        period_start=report.period_start,
        period_end=report.period_end,
        currency=report.currency,
        last_synced_at=report.last_synced_at,
        summary=DashboardSummary(
            remaining=report.remaining,
            spent=report.spent,
            income=report.income,
            total_budget=report.total_budget,
        ),
        budgets=[budget_out(view, chosen_month, chosen_year) for view in report.preview],
        budget_count=len(report.budgets),
        spending_by_category=slices,
        overspending=over,
        recent_transactions=[transaction_out(txn) for txn in report.transactions[:5]],
        accounts=[account_out(account) for account in list_accounts(db, user)],
        insight=report.insight,
    )


@router.get("/categories", response_model=list[CategoryOut])
def categories(db: Session = Depends(get_db), user: User = Depends(current_user)) -> list[Category]:
    del user
    return db.query(Category).order_by(Category.name).all()


@router.get("/budgets", response_model=list[BudgetOut])
def budgets(
    month: int | None = None,
    year: int | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[BudgetOut]:
    chosen_month, chosen_year = _month_year(user, month, year)
    report = build_month_report(db, user, chosen_year, chosen_month)
    return [budget_out(view, chosen_month, chosen_year) for view in report.budgets]


@router.post("/budgets", response_model=BudgetOut, status_code=201)
def create_budget(
    payload: BudgetCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> BudgetOut:
    category = db.query(Category).filter(Category.id == payload.category_id).one_or_none()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found.")
    if category.name in {"Income", "Transfer"}:
        raise HTTPException(status_code=422, detail="Income and transfers are not expense budgets.")
    existing = (
        db.query(Budget)
        .filter(
            Budget.user_id == user.id,
            Budget.category_id == category.id,
            Budget.month == payload.month,
            Budget.year == payload.year,
        )
        .one_or_none()
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="This category already has a budget for that month.")
    budget = Budget(
        user_id=user.id,
        category_id=category.id,
        month=payload.month,
        year=payload.year,
        limit_amount=money(payload.limit_amount),
        is_demo=False,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(budget)
    db.commit()
    report = build_month_report(db, user, payload.year, payload.month)
    view = next(item for item in report.budgets if item.budget_id == budget.id)
    return budget_out(view, payload.month, payload.year)


@router.put("/budgets/{budget_id}", response_model=BudgetOut)
def update_budget(
    budget_id: int,
    payload: BudgetUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> BudgetOut:
    budget = db.query(Budget).filter(Budget.id == budget_id, Budget.user_id == user.id).one_or_none()
    if budget is None:
        raise HTTPException(status_code=404, detail="Budget not found.")
    budget.limit_amount = money(payload.limit_amount)
    budget.updated_at = utcnow()
    db.commit()
    report = build_month_report(db, user, budget.year, budget.month)
    view = next(item for item in report.budgets if item.budget_id == budget.id)
    return budget_out(view, budget.month, budget.year)


@router.delete("/budgets/{budget_id}", status_code=204)
def delete_budget(
    budget_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> None:
    budget = db.query(Budget).filter(Budget.id == budget_id, Budget.user_id == user.id).one_or_none()
    if budget is None:
        raise HTTPException(status_code=404, detail="Budget not found.")
    db.delete(budget)
    db.commit()


@router.post("/budgets/copy", response_model=CopyBudgetsResult)
def copy_budgets(
    payload: CopyBudgetsRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> CopyBudgetsResult:
    source_year, source_month = previous_month(payload.year, payload.month)
    previous_rows = (
        db.query(Budget)
        .filter(Budget.user_id == user.id, Budget.year == source_year, Budget.month == source_month)
        .all()
    )
    if not previous_rows:
        return CopyBudgetsResult(copied=0, message="The previous month has no budgets to copy.")
    copied = 0
    for source in previous_rows:
        exists = (
            db.query(Budget)
            .filter(
                Budget.user_id == user.id,
                Budget.category_id == source.category_id,
                Budget.month == payload.month,
                Budget.year == payload.year,
            )
            .one_or_none()
        )
        if exists is not None:
            continue
        db.add(
            Budget(
                user_id=user.id,
                category_id=source.category_id,
                month=payload.month,
                year=payload.year,
                limit_amount=source.limit_amount,
                is_demo=False,
                created_at=utcnow(),
                updated_at=utcnow(),
            )
        )
        copied += 1
    db.commit()
    if copied == 0:
        message = "This month already has those category budgets."
    else:
        message = f"Copied {copied} budget{'s' if copied != 1 else ''} from the previous month."
    return CopyBudgetsResult(copied=copied, message=message)


@router.get("/transactions", response_model=TransactionPage)
def transactions(
    month: int | None = None,
    year: int | None = None,
    category_id: int | None = None,
    account_id: int | None = None,
    search: str = Query(default="", max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> TransactionPage:
    chosen_month, chosen_year = _month_year(user, month, year)
    if account_id is not None and account_id not in {account.id for account in list_accounts(db, user)}:
        raise HTTPException(status_code=404, detail="Account not found.")
    report = build_month_report(db, user, chosen_year, chosen_month, account_id)
    rows = report.transactions
    if category_id is not None:
        rows = [txn for txn in rows if txn.category_id == category_id]
    if search.strip():
        needle = search.strip().lower()
        rows = [
            txn
            for txn in rows
            if needle in txn.merchant_name.lower() or needle in txn.original_name.lower()
        ]
    total = len(rows)
    start = (page - 1) * page_size
    page_rows = rows[start : start + page_size]
    return TransactionPage(
        items=[transaction_out(txn) for txn in page_rows],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.patch("/transactions/{transaction_id}/category", response_model=TransactionOut)
def change_category(
    transaction_id: int,
    payload: CategoryChange,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> TransactionOut:
    txn = (
        db.query(Transaction)
        .options(joinedload(Transaction.category), joinedload(Transaction.bank_account))
        .filter(Transaction.id == transaction_id, Transaction.user_id == user.id)
        .one_or_none()
    )
    if txn is None:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    category = db.query(Category).filter(Category.id == payload.category_id).one_or_none()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found.")
    txn.category_id = category.id
    txn.user_overrode_category = True
    txn.updated_at = utcnow()
    db.commit()
    updated = (
        db.query(Transaction)
        .options(joinedload(Transaction.category), joinedload(Transaction.bank_account))
        .filter(Transaction.id == txn.id)
        .one()
    )
    return transaction_out(updated)


@router.get("/accounts", response_model=list[ItemOut])
def accounts(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[ItemOut]:
    items = (
        db.query(PlaidItem)
        .options(joinedload(PlaidItem.accounts))
        .filter(PlaidItem.user_id == user.id)
        .order_by(PlaidItem.institution_name)
        .all()
    )
    # joinedload can duplicate parents; keep the first of each id.
    seen: dict[int, PlaidItem] = {}
    for item in items:
        seen.setdefault(item.id, item)
    result = []
    for item in seen.values():
        result.append(
            ItemOut(
                id=item.id,
                institution_name=item.institution_name,
                status=item.status,
                last_synced_at=item.last_synced_at,
                is_demo=item.is_demo,
                accounts=[account_out(account) for account in item.accounts],
            )
        )
    return result


@router.get("/settings", response_model=SettingsOut)
def get_settings(user: User = Depends(current_user), db: Session = Depends(get_db)) -> SettingsOut:
    demo_loaded = db.query(PlaidItem).filter(PlaidItem.user_id == user.id, PlaidItem.is_demo.is_(True)).count() > 0
    return SettingsOut(
        user_name=user.name,
        email=user.email,
        currency=user.preference.currency if user.preference else "CAD",
        budget_start_day=user.preference.budget_start_day if user.preference else 1,
        plaid_env=settings.plaid_env,
        plaid_configured=settings.plaid_configured,
        demo_loaded=demo_loaded,
        onboarding_completed=user.preference.onboarding_completed if user.preference else False,
        goal=user.preference.goal if user.preference else None,
    )


@router.put("/settings", response_model=SettingsOut)
def update_settings(
    payload: SettingsUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> SettingsOut:
    if user.preference is None:
        raise HTTPException(status_code=404, detail="Settings not found.")
    user.preference.currency = payload.currency
    user.preference.budget_start_day = payload.budget_start_day
    db.commit()
    return get_settings(user, db)


@router.put("/onboarding", response_model=SettingsOut)
def update_onboarding(
    payload: OnboardingUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> SettingsOut:
    """Record whether first-run setup is finished and which goal was chosen. Stores no personal data."""
    if user.preference is None:
        raise HTTPException(status_code=404, detail="Settings not found.")
    user.preference.onboarding_completed = payload.completed
    if payload.goal is not None:
        user.preference.goal = payload.goal
    db.commit()
    return get_settings(user, db)


@router.post("/plaid/link-token", response_model=LinkTokenOut, dependencies=[connect_limit])
def link_token(user: User = Depends(current_user)) -> LinkTokenOut:
    reason = bank_connection_block_reason()
    if reason:
        raise HTTPException(status_code=503, detail=reason)
    try:
        payload = create_link_token(user)
    except PlaidError as exc:
        raise _plaid_http_error(exc) from None
    return LinkTokenOut(**payload)


@router.post("/plaid/items/{item_id}/link-token", response_model=LinkTokenOut, dependencies=[connect_limit])
def update_link_token(item_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> LinkTokenOut:
    """Link token in update mode, to repair a connection after ITEM_LOGIN_REQUIRED."""
    reason = bank_connection_block_reason()
    if reason:
        raise HTTPException(status_code=503, detail=reason)
    item = db.query(PlaidItem).filter(PlaidItem.id == item_id, PlaidItem.user_id == user.id).one_or_none()
    if item is None or not item.encrypted_access_token or item.is_demo:
        raise HTTPException(status_code=404, detail="Connection not found.")
    try:
        payload = create_link_token(user, access_token=decrypt_secret(item.encrypted_access_token))
    except EncryptionError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from None
    except PlaidError as exc:
        raise _plaid_http_error(exc) from None
    return LinkTokenOut(**payload)


@router.post("/plaid/exchange", response_model=ItemOut, dependencies=[exchange_limit])
def exchange(
    payload: ExchangeIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ItemOut:
    reason = bank_connection_block_reason()
    if reason:
        raise HTTPException(status_code=503, detail=reason)
    try:
        item = connect_item(db, user, payload.public_token, payload.institution_name)
    except PlaidError as exc:
        raise _plaid_http_error(exc) from None
    db.refresh(item)
    return ItemOut(
        id=item.id,
        institution_name=item.institution_name,
        status=item.status,
        last_synced_at=item.last_synced_at,
        is_demo=item.is_demo,
        accounts=[account_out(account) for account in item.accounts],
    )


def _sync_targets(db: Session, user: User, item_id: int | None = None) -> list[PlaidItem]:
    query = db.query(PlaidItem).filter(PlaidItem.user_id == user.id, PlaidItem.encrypted_access_token.is_not(None))
    if item_id is not None:
        query = query.filter(PlaidItem.id == item_id)
    return query.all()


@router.post("/plaid/sync", response_model=SyncResult, dependencies=[sync_limit])
def sync_all(user: User = Depends(current_user), db: Session = Depends(get_db)) -> SyncResult:
    return _run_sync(db, user, None)


@router.post("/plaid/items/{item_id}/sync", response_model=SyncResult, dependencies=[sync_limit])
def sync_one(item_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> SyncResult:
    return _run_sync(db, user, item_id)


def _run_sync(db: Session, user: User, item_id: int | None) -> SyncResult:
    items = _sync_targets(db, user, item_id)
    if item_id is not None and not items:
        exists = db.query(PlaidItem).filter(PlaidItem.id == item_id, PlaidItem.user_id == user.id).one_or_none()
        if exists is None:
            raise HTTPException(status_code=404, detail="Connection not found.")
        if exists.is_demo:
            return SyncResult(
                synced_items=0,
                added=0,
                modified=0,
                removed=0,
                message="Demo data is stored locally. Connect a bank to sync live transactions.",
            )
        return SyncResult(
            synced_items=0,
            added=0,
            modified=0,
            removed=0,
            message="This connection has no saved bank token.",
        )
    if not items:
        return SyncResult(
            synced_items=0,
            added=0,
            modified=0,
            removed=0,
            message="No connected bank accounts to sync.",
        )
    totals = {"added": 0, "modified": 0, "removed": 0}
    failures: list[PlaidError] = []
    synced = 0
    # One bank failing (for example ITEM_LOGIN_REQUIRED) must not stop the others from syncing.
    for item in items:
        try:
            counts = sync_item(db, user, item)
        except PlaidError as exc:
            failures.append(exc)
            continue
        synced += 1
        for key in totals:
            totals[key] += counts[key]
    if failures and synced == 0:
        raise _plaid_http_error(failures[0])
    message = f"Synced {synced} connection{'s' if synced != 1 else ''}."
    if failures:
        message += f" {len(failures)} could not sync: {failures[0]}"
    return SyncResult(
        synced_items=synced,
        added=totals["added"],
        modified=totals["modified"],
        removed=totals["removed"],
        message=message,
    )


@router.delete("/plaid/items/{item_id}", status_code=204, dependencies=[disconnect_limit])
def remove_connection(item_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> None:
    item = db.query(PlaidItem).filter(PlaidItem.id == item_id, PlaidItem.user_id == user.id).one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Connection not found.")
    disconnect_item(db, item)


@router.post("/plaid/webhook", dependencies=[webhook_limit])
async def plaid_webhook(request: Request, db: Session = Depends(get_db)) -> dict:
    """Plaid webhooks. Signature-verified, idempotent and safe to receive twice or out of order.

    Sync is cursor-based, so a duplicate or late SYNC_UPDATES_AVAILABLE just finds nothing new.
    Every rejection returns the same response, which reveals nothing about the reason.
    """
    raw = await request.body()
    if not settings.plaid_credentials_set:
        # Without Plaid keys no signature can be checked and no Items exist, so nothing is parsed.
        return {"status": "ignored"}
    try:
        verify_webhook(raw, request.headers.get("Plaid-Verification"))
        payload = json.loads(raw.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError
    except (PlaidError, UnicodeDecodeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid webhook.") from None

    webhook_type = str(payload.get("webhook_type", ""))[:64]
    webhook_code = str(payload.get("webhook_code", ""))[:64]
    item_key = payload.get("item_id")
    if not isinstance(item_key, str) or not item_key:
        return {"status": "ignored"}
    item = db.query(PlaidItem).filter(PlaidItem.plaid_item_id == item_key[:128]).one_or_none()
    if item is None or item.status == "disconnected":
        return {"status": "ignored"}

    if webhook_type == "ITEM":
        error_code = str((payload.get("error") or {}).get("error_code", "")) if isinstance(payload.get("error"), dict) else ""
        if webhook_code in {"ERROR", "PENDING_EXPIRATION", "PENDING_DISCONNECT", "USER_PERMISSION_REVOKED", "USER_ACCOUNT_REVOKED"} or error_code == "ITEM_LOGIN_REQUIRED":
            item.status = "error"
            db.commit()
            return {"status": "updated"}
        if webhook_code == "LOGIN_REPAIRED":
            item.status = "active"
            db.commit()
            return {"status": "updated"}
        return {"status": "ignored"}

    if webhook_type == "TRANSACTIONS" and webhook_code in {"SYNC_UPDATES_AVAILABLE", "DEFAULT_UPDATE", "INITIAL_UPDATE", "HISTORICAL_UPDATE"}:
        if not item.encrypted_access_token:
            return {"status": "ignored"}
        user = db.query(User).filter(User.id == item.user_id).one()
        try:
            sync_item(db, user, item)
        except PlaidError as exc:
            # A non-2xx response makes Plaid retry later; the cursor was not advanced.
            raise HTTPException(status_code=503, detail="Sync deferred.") from exc
        return {"status": "synced"}
    return {"status": "ignored"}


@router.post("/demo/load", response_model=DemoResult, dependencies=[demo_limit])
def demo_load(db: Session = Depends(get_db), user: User = Depends(current_user)) -> DemoResult:
    result = load_demo_data(db, user=user)
    return DemoResult(
        message="Demo data loaded. The $20 Food purchase leaves $180 of the $200 Food budget.",
        month=result["month"],
        year=result["year"],
        transactions=result["transactions"],
        budgets=result["budgets"],
    )


@router.post("/demo/clear", response_model=DemoResult, dependencies=[demo_limit])
def demo_clear(db: Session = Depends(get_db), user: User = Depends(current_user)) -> DemoResult:
    removed = clear_demo_data(db, user=user)
    total = removed["transactions"] + removed["budgets"] + removed["accounts"]
    if total == 0:
        message = "No demo data to clear."
    else:
        message = "Demo accounts, transactions, and budgets were removed. Real bank history was kept."
    return DemoResult(message=message, transactions=removed["transactions"], budgets=removed["budgets"])
