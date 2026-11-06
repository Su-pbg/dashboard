#!/bin/bash
# SessionStart 훅: 원격 최신을 받아오고, 인수인계 문서와 최근 이력을 보여 준다.
# 로컬이 두 대(Mac mini · 맥북프로)라 시작할 때마다 pull 한다. push 는 안 한다(push = 배포가 될 수 있다).
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 0

echo "=== git pull --rebase ==="
# macOS 에는 timeout 명령이 없다 → 느린 연결은 git 자체 설정으로 15초 뒤 끊는다
if out=$(GIT_TERMINAL_PROMPT=0 git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=15 pull --rebase --autostash -q 2>&1); then
  echo "최신으로 받음 ($(git rev-parse --short HEAD))"
else
  # 충돌 등으로 rebase 가 멈췄으면 되돌려서 작업 트리를 원래대로 둔다
  [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ] && git rebase --abort >/dev/null 2>&1
  echo "[주의] pull 실패 — 직접 확인할 것"
  echo "$out" | tail -5
fi
echo

echo "=== HANDOFF.md ==="
cat HANDOFF.md 2>/dev/null || echo "(HANDOFF.md 없음)"
echo
echo "=== git log --oneline -5 ==="
git log --oneline -5 2>/dev/null
echo
echo "=== git status --short ==="
git status --short 2>/dev/null
exit 0
