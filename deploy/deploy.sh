#!/usr/bin/env bash
set -euo pipefail

# Deploy claude-link to the Lightsail box.
# Same pattern as claude-gateway/deploy.sh: build local images, docker save|ssh load,
# retag :latest on remote, docker compose up -d, prune old tags.
#
# Usage:
#   ./deploy.sh                  # build + deploy (default)
#   ./deploy.sh rollback <tag>   # retag a prior tag as :latest and bounce
#   ./deploy.sh list             # list tags on remote
#   ./deploy.sh bootstrap        # first-time setup: stop old stack, install compose + .env
#
# Env vars:
#   SSH_KEY   — path to the Lightsail PEM (default: ~/.ssh/LightsailDefaultKey-ca-central-1.pem)
#   REMOTE    — ssh target (default: ubuntu@3.99.180.72)
#   REMOTE_DIR — remote compose dir (default: /home/ubuntu/claude-link)

REMOTE="${REMOTE:-ubuntu@3.99.180.72}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/LightsailDefaultKey-ca-central-1.pem}"
REMOTE_DIR="${REMOTE_DIR:-/home/ubuntu/claude-link}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEEP_VERSIONS=5

BACKEND_IMAGE="claude-link-backend"
FRONTEND_IMAGE="claude-link-frontend"

ssh_cmd() { ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE" "$@"; }
scp_cmd() { scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$@"; }

usage() {
  sed -n '4,16p' "$0"
  exit 1
}

# ---------------------------------------------------------------------------

list_remote_tags() {
  ssh_cmd "docker images $BACKEND_IMAGE --format '{{.Tag}}' | grep -v latest | sort -r"
}

build_and_transfer() {
  local tag="$1"
  echo "==> Building $BACKEND_IMAGE:$tag..."
  docker build -t "$BACKEND_IMAGE:$tag" -t "$BACKEND_IMAGE:latest" \
    -f "$REPO_ROOT/backend/Dockerfile" "$REPO_ROOT/backend"

  echo "==> Building $FRONTEND_IMAGE:$tag..."
  docker build -t "$FRONTEND_IMAGE:$tag" -t "$FRONTEND_IMAGE:latest" \
    -f "$REPO_ROOT/frontend/Dockerfile" "$REPO_ROOT/frontend"

  echo "==> Transferring $BACKEND_IMAGE:$tag..."
  docker save "$BACKEND_IMAGE:$tag" | gzip | ssh_cmd "gunzip | docker load"
  echo "==> Transferring $FRONTEND_IMAGE:$tag..."
  docker save "$FRONTEND_IMAGE:$tag" | gzip | ssh_cmd "gunzip | docker load"
}

activate_tag() {
  local tag="$1"
  echo "==> Activating tag $tag on remote..."
  ssh_cmd "
    set -e
    docker tag $BACKEND_IMAGE:$tag  $BACKEND_IMAGE:latest
    docker tag $FRONTEND_IMAGE:$tag $FRONTEND_IMAGE:latest
    cd $REMOTE_DIR
    # 'migrate' reuses the backend image, so force-recreate covers both
    # build steps. --no-build because the image is already loaded locally.
    docker compose up -d --no-build --force-recreate backend frontend
  "
}

wait_healthy() {
  echo "==> Waiting for /healthz on :80..."
  for i in $(seq 1 30); do
    if ssh_cmd "curl -sf http://localhost/healthz" >/dev/null 2>&1; then
      echo "==> Service is up."
      return 0
    fi
    sleep 2
  done
  echo "ERROR: service did not become healthy after 60s" >&2
  ssh_cmd "cd $REMOTE_DIR && docker compose logs --tail 50 backend frontend" >&2 || true
  return 1
}

prune_old_tags() {
  echo "==> Pruning old images (keeping last $KEEP_VERSIONS)..."
  for img in "$BACKEND_IMAGE" "$FRONTEND_IMAGE"; do
    ssh_cmd "
      tags=\$(docker images $img --format '{{.Tag}}' | grep -v latest | sort -r | tail -n +$((KEEP_VERSIONS + 1)))
      for t in \$tags; do
        echo \"  removing $img:\$t\"
        docker rmi $img:\$t || true
      done
    "
  done
}

bootstrap_remote() {
  echo "==> Bootstrapping remote $REMOTE_DIR ..."

  # 1. Stop the old claude-gateway stack if it's running.
  if ssh_cmd "test -d /home/ubuntu/claude-gateway"; then
    echo "==> Stopping old claude-gateway stack..."
    ssh_cmd "cd /home/ubuntu/claude-gateway && docker compose down" || true
  fi

  # 2. Create remote dir and push compose file.
  ssh_cmd "mkdir -p $REMOTE_DIR"
  scp_cmd "$REPO_ROOT/deploy/docker-compose.yml" "$REMOTE:$REMOTE_DIR/docker-compose.yml"

  # 3. Generate .env if it doesn't exist yet (preserves existing secrets on repeat).
  ssh_cmd "
    set -e
    cd $REMOTE_DIR
    if [ ! -f .env ]; then
      echo '   generating fresh .env with random secrets...'
      {
        echo \"SESSION_SECRET=\$(openssl rand -hex 32)\"
        echo \"UPSTREAM_KEY_KMS=\$(openssl rand -hex 32)\"
        echo \"METRICS_TOKEN=\$(openssl rand -hex 16)\"
        echo 'POSTGRES_USER=postgres'
        echo \"POSTGRES_PASSWORD=\$(openssl rand -hex 16)\"
        echo 'POSTGRES_DB=claude_link'
        echo 'ANTHROPIC_UPSTREAM_BASE_URL=https://api.anthropic.com'
        echo 'HTTP_PORT=80'
        echo 'LOG_LEVEL=info'
      } > .env
      chmod 600 .env
    else
      echo '   .env already exists, leaving it alone'
    fi
  "
  echo "==> Bootstrap done. Remote dir: $REMOTE_DIR"
}

ensure_bootstrapped() {
  if ! ssh_cmd "test -f $REMOTE_DIR/docker-compose.yml && test -f $REMOTE_DIR/.env"; then
    echo "==> Remote not bootstrapped yet, running bootstrap first..."
    bootstrap_remote
  else
    # Always refresh the compose file in case it changed in-repo.
    scp_cmd "$REPO_ROOT/deploy/docker-compose.yml" "$REMOTE:$REMOTE_DIR/docker-compose.yml"
  fi
}

# ---------------------------------------------------------------------------

CMD="${1:-deploy}"

case "$CMD" in
  deploy)
    ensure_bootstrapped
    TAG="$(date +%Y%m%d-%H%M%S)-$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo nogit)"
    build_and_transfer "$TAG"
    activate_tag "$TAG"
    wait_healthy
    prune_old_tags
    echo "==> Deployed $TAG"
    ;;

  rollback)
    TAG="${2:-}"
    if [[ -z "$TAG" ]]; then
      echo "Available tags on remote:"
      list_remote_tags
      echo ""
      read -rp "Tag to roll back to: " TAG
    fi
    activate_tag "$TAG"
    wait_healthy
    echo "==> Rolled back to $TAG"
    ;;

  list)
    echo "Available tags on remote:"
    list_remote_tags
    ;;

  bootstrap)
    bootstrap_remote
    ;;

  *)
    usage
    ;;
esac
