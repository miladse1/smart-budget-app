"""Default spending categories and the Plaid labels that map onto them.

Detailed Plaid categories are matched before broader primary categories.
FOOD_AND_DRINK_GROCERIES becomes Groceries; other FOOD_AND_DRINK labels become Food.
"""

DEFAULT_CATEGORIES: list[dict] = [
    {
        "name": "Food",
        "colour": "#1B4332",
        "icon": "utensils",
        "plaid_category_mapping": [
            "FOOD_AND_DRINK",
            "FOOD_AND_DRINK_RESTAURANT",
            "FOOD_AND_DRINK_FAST_FOOD",
            "FOOD_AND_DRINK_COFFEE",
            "FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR",
            "FOOD_AND_DRINK_VENDING_MACHINES",
            "FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK",
        ],
    },
    {
        "name": "Groceries",
        "colour": "#2D6A4F",
        "icon": "cart",
        "plaid_category_mapping": ["FOOD_AND_DRINK_GROCERIES"],
    },
    {
        "name": "Transportation",
        "colour": "#52796F",
        "icon": "car",
        "plaid_category_mapping": [
            "TRANSPORTATION",
            "TRANSPORTATION_PUBLIC_TRANSIT",
            "TRANSPORTATION_TAXIS_AND_RIDE_SHARES",
            "TRANSPORTATION_GAS",
            "TRANSPORTATION_PARKING",
            "TRANSPORTATION_TOLLS",
            "TRANSPORTATION_OTHER_TRANSPORTATION",
            "TRAVEL",
            "TRAVEL_FLIGHTS",
        ],
    },
    {
        "name": "Shopping",
        "colour": "#8C6D2D",
        "icon": "bag",
        "plaid_category_mapping": [
            "GENERAL_MERCHANDISE",
            "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES",
            "GENERAL_MERCHANDISE_ELECTRONICS",
            "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES",
            "GENERAL_MERCHANDISE_SUPERSTORES",
            "HOME_IMPROVEMENT",
        ],
    },
    {
        "name": "Entertainment",
        "colour": "#6B705C",
        "icon": "film",
        "plaid_category_mapping": [
            "ENTERTAINMENT",
            "ENTERTAINMENT_MUSIC_AND_AUDIO",
            "ENTERTAINMENT_TV_AND_MOVIES",
            "ENTERTAINMENT_CASINOS_AND_GAMBLING",
            "ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS",
            "ENTERTAINMENT_OTHER_ENTERTAINMENT",
        ],
    },
    {
        "name": "Bills",
        "colour": "#3D5A80",
        "icon": "receipt",
        "plaid_category_mapping": [
            "RENT_AND_UTILITIES",
            "RENT_AND_UTILITIES_RENT",
            "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY",
            "RENT_AND_UTILITIES_INTERNET_AND_CABLE",
            "RENT_AND_UTILITIES_TELEPHONE",
            "RENT_AND_UTILITIES_WATER",
            "LOAN_PAYMENTS",
            "BANK_FEES",
            "GENERAL_SERVICES",
            "GOVERNMENT_AND_NON_PROFIT",
        ],
    },
    {
        "name": "Education",
        "colour": "#40531B",
        "icon": "book",
        "plaid_category_mapping": ["GENERAL_SERVICES_EDUCATION"],
    },
    {
        "name": "Health",
        "colour": "#9C6644",
        "icon": "heart",
        "plaid_category_mapping": [
            "MEDICAL",
            "MEDICAL_PRIMARY_CARE",
            "MEDICAL_PHARMACIES_AND_SUPPLEMENTS",
            "MEDICAL_DENTAL_CARE",
            "PERSONAL_CARE",
        ],
    },
    {
        "name": "Income",
        "colour": "#1B4332",
        "icon": "income",
        "plaid_category_mapping": [
            "INCOME",
            "INCOME_WAGES",
            "INCOME_OTHER_INCOME",
        ],
    },
    {
        "name": "Transfer",
        "colour": "#78716C",
        "icon": "transfer",
        "plaid_category_mapping": [
            "TRANSFER_IN",
            "TRANSFER_OUT",
            "TRANSFER_IN_ACCOUNT_TRANSFER",
            "TRANSFER_OUT_ACCOUNT_TRANSFER",
            "TRANSFER_IN_SAVINGS",
            "TRANSFER_OUT_SAVINGS",
        ],
    },
    {
        "name": "Other",
        "colour": "#A8A29E",
        "icon": "other",
        "plaid_category_mapping": [],
    },
]

# These categories are not monthly expense budgets.
NON_EXPENSE_CATEGORIES = {"Income", "Transfer"}
