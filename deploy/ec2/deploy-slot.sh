#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/c2-app}"
TARGET_SLOT="${1:-auto}"
LOW_MEMORY_DEPLOY="${LOW_MEMORY_DEPLOY:-false}"
COMPOSE_FILE="$APP_DIR/deploy/ec2/docker-compose.prod.yml"
ENV_FILE="$APP_DIR/deploy/ec2/.env.prod"
RUNTIME_ENV_FILE="$APP_DIR/deploy/ec2/.env.runtime"
ACTIVE_SLOT_FILE="$APP_DIR/deploy/ec2/.active_slot"
NGINX_CONF_DIR="$APP_DIR/deploy/ec2/nginx/conf.d"

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  SUDO="${SUDO:-sudo}"
fi

compose() {
  $SUDO docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --env-file "$RUNTIME_ENV_FILE" "$@"
}

write_runtime_env() {
  ACTIVE_SLOT="${1:-}"
  cat > "$RUNTIME_ENV_FILE" <<EOF
ZALO_BOT_ENABLED_BLUE=false
ZALO_BOT_ENABLED_GREEN=false
SCHEDULED_ZALO_WORKER_ENABLED_BLUE=false
SCHEDULED_ZALO_WORKER_ENABLED_GREEN=false
EOF
  if [ "$ACTIVE_SLOT" = "blue" ]; then
    cat >> "$RUNTIME_ENV_FILE" <<EOF
ZALO_BOT_ENABLED_BLUE=true
SCHEDULED_ZALO_WORKER_ENABLED_BLUE=true
EOF
  elif [ "$ACTIVE_SLOT" = "green" ]; then
    cat >> "$RUNTIME_ENV_FILE" <<EOF
ZALO_BOT_ENABLED_GREEN=true
SCHEDULED_ZALO_WORKER_ENABLED_GREEN=true
EOF
  fi
}

other_slot() {
  if [ "$1" = "blue" ]; then
    echo "green"
  else
    echo "blue"
  fi
}

stop_slot() {
  SLOT="$1"
  compose stop "backend-$SLOT" "frontend-$SLOT" "zalo-bot-service-$SLOT" >/dev/null 2>&1 || true
}

active_slot_from_nginx() {
  if ! compose ps -q nginx >/dev/null 2>&1; then
    return 1
  fi
  compose exec -T nginx nginx -T 2>/dev/null \
    | sed -n 's/.*server frontend-\(blue\|green\):3000;.*/\1/p' \
    | head -n 1
}

active_slot_from_file() {
  if [ -f "$ACTIVE_SLOT_FILE" ]; then
    cat "$ACTIVE_SLOT_FILE"
    return 0
  fi
  if [ -f "$NGINX_CONF_DIR/active-upstreams.conf" ]; then
    sed -n 's/.*server frontend-\(blue\|green\):3000;.*/\1/p' "$NGINX_CONF_DIR/active-upstreams.conf" | head -n 1
    return 0
  fi
  return 1
}

if [ "$TARGET_SLOT" = "auto" ]; then
  ACTIVE_SLOT="$(active_slot_from_nginx || active_slot_from_file || true)"
  if [ "$ACTIVE_SLOT" = "blue" ]; then
    TARGET_SLOT="green"
  else
    TARGET_SLOT="blue"
  fi
fi

if [ "$TARGET_SLOT" != "blue" ] && [ "$TARGET_SLOT" != "green" ]; then
  echo "Usage: APP_DIR=/opt/c2-app deploy-slot.sh [auto|blue|green]" >&2
  exit 2
fi

echo "Deploying $TARGET_SLOT slot"
OLD_SLOT="$(other_slot "$TARGET_SLOT")"

test -f "$COMPOSE_FILE"
test -f "$ENV_FILE"
test -f "$NGINX_CONF_DIR/upstreams.$TARGET_SLOT.conf"
write_runtime_env ""

cleanup_failed_deploy() {
  echo "Deploy failed; stopping partially started $TARGET_SLOT slot" >&2
  stop_slot "$TARGET_SLOT"
}

trap cleanup_failed_deploy EXIT

if [ "$LOW_MEMORY_DEPLOY" = "true" ]; then
  echo "Low-memory deploy enabled; stopping $OLD_SLOT slot before starting $TARGET_SLOT"
  stop_slot "$OLD_SLOT"
fi

compose build --pull "backend-$TARGET_SLOT" "frontend-$TARGET_SLOT" "zalo-bot-service-$TARGET_SLOT"
compose up -d db
write_runtime_env "$TARGET_SLOT"
compose up -d --force-recreate "backend-$TARGET_SLOT" "frontend-$TARGET_SLOT" "zalo-bot-service-$TARGET_SLOT"

wait_for_service() {
  SERVICE_NAME="$1"
  ATTEMPTS=36
  while [ "$ATTEMPTS" -gt 0 ]; do
    CONTAINER_ID="$(compose ps -q "$SERVICE_NAME")"
    if [ -n "$CONTAINER_ID" ]; then
      STATUS="$($SUDO docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CONTAINER_ID")"
      if [ "$STATUS" = "healthy" ] || [ "$STATUS" = "running" ]; then
        return 0
      fi
    fi
    ATTEMPTS=$((ATTEMPTS - 1))
    sleep 5
  done
  echo "Timed out waiting for $SERVICE_NAME" >&2
  echo "---- docker compose ps ----" >&2
  compose ps >&2 || true
  CONTAINER_ID="$(compose ps -q "$SERVICE_NAME" || true)"
  if [ -n "$CONTAINER_ID" ]; then
    echo "---- $SERVICE_NAME inspect ----" >&2
    $SUDO docker inspect --format='status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} exit={{.State.ExitCode}} error={{.State.Error}}' "$CONTAINER_ID" >&2 || true
    echo "---- $SERVICE_NAME health log ----" >&2
    $SUDO docker inspect --format='{{range .State.Health.Log}}{{printf "%s exit=%d output=%q\n" .End .ExitCode .Output}}{{end}}' "$CONTAINER_ID" >&2 || true
    echo "---- $SERVICE_NAME logs ----" >&2
    compose logs --tail=200 "$SERVICE_NAME" >&2 || true
  fi
  return 1
}

wait_for_service "backend-$TARGET_SLOT"
wait_for_service "frontend-$TARGET_SLOT"
wait_for_service "zalo-bot-service-$TARGET_SLOT"

# Preserve the mounted file path and then force-recreate nginx so Docker rebinds
# the config even if an older deploy deleted/recreated the file inode.
cat "$NGINX_CONF_DIR/upstreams.$TARGET_SLOT.conf" > "$NGINX_CONF_DIR/active-upstreams.conf"

compose up -d --force-recreate nginx
compose exec -T nginx nginx -t
compose exec -T nginx nginx -s reload

if ! compose exec -T nginx nginx -T 2>/dev/null | grep -q "server frontend-$TARGET_SLOT:3000;"; then
  echo "Nginx did not switch to frontend-$TARGET_SLOT" >&2
  exit 1
fi

if ! compose exec -T nginx nginx -T 2>/dev/null | grep -q "server backend-$TARGET_SLOT:8000;"; then
  echo "Nginx did not switch to backend-$TARGET_SLOT" >&2
  exit 1
fi

echo "$TARGET_SLOT" > "$ACTIVE_SLOT_FILE"
trap - EXIT
stop_slot "$OLD_SLOT"
$SUDO docker image prune -f

echo "Active slot is now $TARGET_SLOT"
