# 적용 방법 (2026-09-13)

이 zip 을 `dashboard` 레포 **루트에 그대로 풀면** 됩니다. 기존 파일을 덮어씁니다.

```
dashboard/
├── index.html                    ← 덮어쓰기 (완성본, 패치 아님)
├── CHANGELOG.md                  ← 덮어쓰기
├── scripts/fetch-data.mjs        ← 덮어쓰기
└── tools/apply_worker_patches.py ← 새 파일 (워커가 Git 밖에 있어 패치 내용을 여기 남김)
```

## 1. 풀고 커밋

```bash
cd dashboard
git pull                       # 자동 데이터 커밋 먼저 받기
unzip -o ~/Downloads/pbg-dashboard-2026-09-13.zip -d .
git add -A && git commit -m "feat: 미등록 구좌 감지 + 총 회원수 되메우기"
git push
```

## 2. 워커 패치 (Cloudflare, 수동)

```bash
# Cloudflare 워커 편집기에서 코드 전체 복사 → worker.js 로 저장
python3 tools/apply_worker_patches.py worker.js
# → worker.patched.js 내용을 편집기에 붙여넣고 배포
```

`--only sort` 로 정렬 구좌 패치만, `--only member` 로 membercount 만 적용할 수도 있습니다.

## 이번에 index.html 에 들어간 것

- **구매하기 버튼 분리(9/7) 반영** — 장바구니를 퍼널 필수 단계에서 선택 분기로 분리
- **데이터 건강 검진 배너** — 수집이 멈춘 지표를 화면 최상단에서 경고
- **총 회원수 되메우기** — 워커 `tab=membercount` 로 08-01 이후 공백을 채움 (오차 1% 초과면 채우지 않고 사유 표시)
- **미등록 구좌 감지** — SLOT_MAP 에 없는 유입처를 자동 노출. 워커를 고치지 않아도 구좌가 늘면 화면에 뜸

## 남은 일

- 미등록 구좌 6개(`994`·`948`·`1034`·`1017`·`629`·`637`) 이름·섹션 확인 후 SLOT_MAP 등록
- `build_revenue_daily.py` (slackbot 레포): 카테고리 '미분류', `totalMembers` 원천 수집
