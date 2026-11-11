#!/bin/sh
set -e

echo "Applying database migrations..."
tries=0
until alembic upgrade head; do
  tries=$((tries + 1))
  if [ "$tries" -ge 20 ]; then
    echo "Could not apply migrations. Is PostgreSQL running?"
    exit 1
  fi
  echo "Database is not ready yet. Retrying..."
  sleep 2
done

echo "Starting BudgetFlow API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
