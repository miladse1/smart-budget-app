"""Load or clear demo data from the command line: python -m app.seed"""

from app.database import SessionLocal
from app.services.demo_data import load_demo_data
from app.services.users import seed_categories


def main() -> None:
    db = SessionLocal()
    try:
        seed_categories(db)
        db.commit()
        result = load_demo_data(db)
        print(
            f"Demo data loaded for {result['year']}-{result['month']:02d}: "
            f"{result['budgets']} budgets, {result['transactions']} transactions."
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
