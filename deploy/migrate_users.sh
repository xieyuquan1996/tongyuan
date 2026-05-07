#!/usr/bin/env bash
# Migrate users table from local docker postgres → remote Lightsail postgres.
#
# Usage:
#   chmod +x deploy/migrate_users.sh
#   ./deploy/migrate_users.sh
#
# What it does:
#   1. pg_dump users table from local deploy-postgres-1 (claude_link db)
#   2. scp the dump to remote
#   3. psql import into remote maplelink db (inside maplelink-postgres-1 container)
#   4. Clean up temp files

set -euo pipefail

REMOTE="${REMOTE:-ubuntu@3.99.180.72}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/LightsailDefaultKey-ca-central-1.pem}"
REMOTE_DIR="${REMOTE_DIR:-/home/ubuntu/maplelink}"

LOCAL_CONTAINER="deploy-postgres-1"
LOCAL_DB="claude_link"
LOCAL_PG_USER="postgres"

REMOTE_CONTAINER="maplelink-postgres-1"
REMOTE_DB="maplelink"
REMOTE_PG_USER="postgres"

DUMP_FILE="/tmp/users_migration_$(date +%Y%m%d_%H%M%S).sql"

ssh_cmd() { ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE" "$@"; }
scp_cmd() { scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$@"; }

echo "==> [1/4] Dumping users table from local $LOCAL_CONTAINER ($LOCAL_DB)..."
docker exec "$LOCAL_CONTAINER" pg_dump \
  -U "$LOCAL_PG_USER" \
  -d "$LOCAL_DB" \
  --table=users \
  --data-only \
  --column-inserts \
  --on-conflict-do-nothing \
  > "$DUMP_FILE"

echo "    Dump written to $DUMP_FILE ($(wc -l < "$DUMP_FILE") lines)"

echo "==> [2/4] Transferring dump to remote $REMOTE..."
scp_cmd "$DUMP_FILE" "$REMOTE:/tmp/users_migration.sql"

echo "==> [3/4] Importing into remote $REMOTE_CONTAINER ($REMOTE_DB)..."
ssh_cmd "
  set -e
  docker cp /tmp/users_migration.sql $REMOTE_CONTAINER:/tmp/users_migration.sql
  docker exec $REMOTE_CONTAINER psql -U $REMOTE_PG_USER -d $REMOTE_DB -f /tmp/users_migration.sql
  docker exec $REMOTE_CONTAINER rm /tmp/users_migration.sql
  rm /tmp/users_migration.sql
"

echo "==> [4/4] Verifying remote user count..."
ssh_cmd "docker exec $REMOTE_CONTAINER psql -U $REMOTE_PG_USER -d $REMOTE_DB -c 'SELECT COUNT(*) AS user_count FROM users;'"

echo "==> Cleaning up local dump..."
rm -f "$DUMP_FILE"

echo "==> Done. Users migrated successfully."
