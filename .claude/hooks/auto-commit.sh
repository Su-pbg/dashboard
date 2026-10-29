#!/bin/bash
# Stop 훅: 변경이 있으면 조용히 wip 커밋. 출력 없음, 항상 exit 0.
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 0
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  git add -A >/dev/null 2>&1
  git commit --no-verify -q -m "[claude] wip: auto-save $(date '+%m-%d %H:%M')" >/dev/null 2>&1
fi
exit 0
