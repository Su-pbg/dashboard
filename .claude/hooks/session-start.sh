#!/bin/bash
# SessionStart 훅: 인수인계 문서와 최근 이력을 보여 준다.
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 0
echo "=== HANDOFF.md ==="
cat HANDOFF.md 2>/dev/null || echo "(HANDOFF.md 없음)"
echo
echo "=== git log --oneline -5 ==="
git log --oneline -5 2>/dev/null
echo
echo "=== git status --short ==="
git status --short 2>/dev/null
exit 0
