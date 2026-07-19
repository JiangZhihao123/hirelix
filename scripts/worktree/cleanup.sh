#!/usr/bin/env bash
set -euo pipefail

ROOT="${CODEX_WORKTREE_PATH:-$(pwd)}"
cd "$ROOT"

if [ -f .codex-worktree-env ]; then
  port="$(sed -n 's/^WORKTREE_PORT=//p' .codex-worktree-env | head -1)"
  if [ -n "${port:-}" ]; then
    echo "工作树端口为 $port。请在对应终端用 Ctrl-C 停止 npm run dev。"
  fi
fi

# Do not delete .env.local automatically: it may contain user-provided secrets.
rm -f .codex-worktree-env
echo "工作树清理完成（保留 .env.local，避免误删密钥）。"
