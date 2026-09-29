"""Store first-run onboarding status and the goal chosen during setup."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_onboarding"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("user_preferences", sa.Column("goal", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("user_preferences", "goal")
    op.drop_column("user_preferences", "onboarding_completed")
