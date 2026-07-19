#!/usr/bin/env bash
set -euo pipefail

# Codex runs this script from the root of the newly-created worktree.
# It creates only worktree-local, untracked state. Secrets are copied from the
# main worktree when available; they are never printed or committed.

ROOT="${CODEX_WORKTREE_PATH:-$(pwd)}"
cd "$ROOT"

name="${CODEX_WORKTREE_NAME:-$(basename "$ROOT")}" 
slug="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//; s/-$//')"
[ -n "$slug" ] || slug="worktree"

# Keep ports stable for a worktree, while allowing many worktrees to run at once.
hash="$(printf '%s' "$slug" | shasum | cut -c1-8)"
port=$((3100 + (16#$hash % 700)))

main_root="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
if [ ! -f .env.local ] && [ -n "$main_root" ] && [ -f "$main_root/.env.local" ] && [ "$main_root" != "$ROOT" ]; then
  cp "$main_root/.env.local" .env.local
fi

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "已从 .env.example 创建 .env.local；请补齐密钥。"
fi

tmp="$(mktemp)"
awk -v port="$port" -v url="http://127.0.0.1:$port" '
  BEGIN { seen_port=0; seen_auth=0; seen_app=0 }
  /^PORT=/ { print "PORT=" port; seen_port=1; next }
  /^BETTER_AUTH_URL=/ { print "BETTER_AUTH_URL=" url; seen_auth=1; next }
  /^NEXT_PUBLIC_APP_URL=/ { print "NEXT_PUBLIC_APP_URL=" url; seen_app=1; next }
  { print }
  END {
    if (!seen_port) print "PORT=" port
    if (!seen_auth) print "BETTER_AUTH_URL=" url
    if (!seen_app) print "NEXT_PUBLIC_APP_URL=" url
  }
' .env.local > "$tmp"
mv "$tmp" .env.local

cat > .codex-worktree-env <<EOF
WORKTREE_NAME=$name
WORKTREE_SLUG=$slug
WORKTREE_PORT=$port
WORKTREE_URL=http://127.0.0.1:$port
EOF

echo "工作树环境已准备：$slug"
echo "前端地址：http://127.0.0.1:$port"
echo "启动命令：npm run dev"
echo "注意：不要在每个工作树启动 scheduler:dev；调度器只能运行一个实例。"
echo "注意：DATABASE_URL 仍需指向独立的开发数据库，不能使用生产 hirelix 库。"
