# PBG 대시보드 — 에이전트 규칙 (Claude · Codex 공용, CLAUDE.md 는 이 파일의 심링크)

매 턴 읽히는 파일이라 100줄 이내로 유지한다. **함정·이력·API 메모는 `PROJECT-CONTEXT.md`** 에 있다 —
통째로 읽지 말고 `rg -n "키워드" PROJECT-CONTEXT.md` 로 찾아 그 절만 `sed -n` 으로 읽는다.

## 개요 · 스택
프린트베이커리 이커머스 운영 대시보드. GitHub Pages 정적 프론트(바닐라 JS, 빌드 없음) +
Cloudflare Worker `proud-sea-35f9`(API·KPI 시트 크론, 무료 플랜 **호출당 서브요청 50**) + 수집 스크립트.
외부: cafe24 Admin/Storefront · GA4 Data API · Google Sheets · Gemini · 네이버 검색광고/API HUB.
런타임: Node 24 ESM · Python 3.9(openpyxl·requests) · wrangler 4(devDependency). 시크릿은 전부 Cloudflare 에만.

## 지도 (어디에 뭐가 있나)
| 경로 | 역할 |
|---|---|
| `index.html` | 대시보드 본체(~200KB 단일 파일). `WORKER` 상수 551행 부근 |
| `trend-tab.js` · `settle-tab.js` · `ecount-tab.js` | 트렌드 · 위탁 정산 · 주문 처리 탭 |
| `expense.html` | 경비환급(로그인 없음, tesseract + Gemini `/receipt`) |
| `worker.js` | 워커 전체(~4,800행, **이미 번들됨**). 상단 45~150행 KPI 메모·`kpiScanMonth`·`kpiRawDays`, 150~240행 `scheduled`(크론 단계), `/kpisheet` 315행~, `part=ext` 750행~ |
| `wrangler.jsonc` | 배포 설정. `no_bundle: true`, 크론 01~10시 KST |
| `scripts/*.mjs` · `scripts/*.py` | 수집(fetch-data, check-search-results) · 레이더 점수/사전/이력 |
| `.github/workflows/` | 데이터 갱신 봇 · `deploy-worker.yml`(push 배포, 시크릿 미설정) |
| `*.json` | 데이터. **봇이 덮는다 — 손으로 고치지 않는다** |
| `test_*.mjs` | 테스트. `CHANGELOG.md` 변경 이력. `HANDOFF.md` 인수인계 |
| `.dashboard_key.local` · `.cloudflare_token.local` | 로컬 비밀(gitignore). 값은 절대 출력하지 않는다 |

## 명령
```bash
python3 -m http.server 8000                       # 프론트 로컬(워커는 배포본, CORS *)
node --check worker.js                            # 워커 문법 — 커밋 전 필수
node -e "const fs=require('fs');const s=fs.readFileSync('index.html','utf8');fs.writeFileSync('/tmp/c.js',[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'))" && node --check /tmp/c.js
node test_expense.mjs; node test_ecount.mjs; node test_paywin.mjs; node test_ecrecon_worker.mjs
python3 scripts/radar_score.py                    # 레이더 자체검사
CLOUDFLARE_API_TOKEN=$(cat .cloudflare_token.local) npx wrangler deploy   # 배포 — Su 가 그 턴에 직접 지시해야 분류기 통과
```
린트 없음. 문법 검사가 린트다. index.html·ecount-tab.js 를 고치면 위 검사·테스트를 푸시 전에 반드시 돌린다.

## 컨벤션
- 한국어, 짧게, 격식 없이. 완전한 파일로 줄 것. 데이터 얘기는 `date` 먼저, 지금 시각 기준.
- 추측으로 원인 단정 금지 — 코드·주석·커밋 히스토리 먼저. 주장엔 대상·기간·단위. 안 재본 건 "모른다".
- 커밋: `[claude] feat: ...` / `[codex] fix: ...` (에이전트 접두 + 타입). 워커는 `node --check` → 커밋 → 배포.
- `worker.js` 맨 위 `__defProp/__name` 두 줄 삭제 금지. 한 줄짜리 코드 중간에 `//` 주석 금지.

## 세션 시작
1. `HANDOFF.md` 읽기(현재 상태·진행 중·다음 할 일). 2. `git log --oneline -5`, 리모트가 앞서면 `git pull --ff-only`.
3. 이전 에이전트 코드를 이유 없이 갈아엎지 않는다. 바꾸면 커밋 메시지에 이유를 적는다.

## 작업 끝
검사·테스트 통과 확인 → `HANDOFF.md` 갱신(결정 사항은 표에 누적) → 커밋. Stop 훅이 `[claude] wip: auto-save` 를 남기지만 의미 있는 커밋은 직접.

## 토큰 절약
- 폴더 통째로 읽지 않는다. `rg`(없으면 `grep -n`)로 찾고 필요한 행 범위만 `sed -n`. 로그·출력은 `tail -50`/`head -c`.
- 한 번 읽은 파일 다시 읽지 않는다. 고친 코드를 채팅에 다시 붙이지 않는다. 답변 짧게, 중간 중계 금지.

## 금지
- 시크릿 커밋·출력(`.env*`, `*.pem`, `*.key`, `*.local`). 요청 없는 대규모 리팩터링·포맷 변경.
- `HANDOFF.md` "진행 중(건드리지 말 것)" 파일 수정. 테스트 삭제·skip·기대값 완화. 데이터 JSON 손수정.
