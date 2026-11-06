# HANDOFF — 세션 인수인계

## 마지막 세션
2026-11-06 (MacBook Pro, Claude). 이 맥북프로를 두 번째 로컬로 세팅: 레포 `~/Desktop/업무/프린트베이커리/pbg-dashboard` 최신화, npm ci · openpyxl/requests · wrangler 4.155(npx) · 레포 git 사용자 Su-pbg. 한글 경로에서 `new URL(import.meta.url).pathname` 이 퍼센트 인코딩돼 ENOENT → `fileURLToPath` 로 4곳 고침(test_expense · build-weekly-notion · build-weekly-deck · check-search-results). 테스트 전부 통과. `.dashboard_key.local`·`.cloudflare_token.local` 은 이 맥에 없음(Mac mini 에서 옮겨야 함).

2026-11-05 (Mac mini, Claude). 카페24 토큰 유실 복구(재인증 라우트 `/cafe24auth`) · Gist 쓰기 재시도(워커·슬랙봇) · 쿠폰 API 개통 · 데일리 전표 할인 표시 기획(Su 선택 대기).

2026-10-29 (Mac mini, Claude). Mac mini 를 유일한 로컬로 세팅(node 24·wrangler·openpyxl, 레포 4개 클론), 워커 배포 2회(95b634fb → 4015ff2b), KPI 시트 수집 효율화 기획(8단계), 에이전트 협업 세팅(AGENTS/HANDOFF/훅).

## 현재 상태
- **[2026-11-06] 판매 입력 대조에 일별 금액 대조 추가**(`ecount-tab.js` `amtOf`·`fillRVAmt`). 주문일 기준 · 카페24 실결제 ↔ 이카운트 합계(선수금 포함) · 차액. 실데이터로는 아직 안 봤다(맥북프로에 키 없음·로그인 안 됨) — 화면에서 차액이 큰 날짜를 열어 금액불일치·미입력과 맞는지 확인할 것.
- **[2026-11-06 클라우드 세션] 손입력 광고비가 매일 밤 지워지던 것 고침 — 배포 대기.** 원인 셋: ① `part=ext` 1-4 구간이 rawLast 이후 줄을 비움(M·AD 만 제외) ② `sync` strict 구간(원본 RAW 마지막 날까지)이 원본 빈 칸을 우리 쪽에도 빈 칸으로 강제 ③ 1-3/6-3/엠디별 줄 늘리기가 템플릿 값 칸까지 매일 다시 씀. 고침: ① 비우지 않음(수식만 fmlCopy) ② 우리 쪽 손입력 값(수식 아님)은 원본이 비어도 둠 ③ 값 칸은 null 로 보내 건드리지 않음(Sheets API 는 null 건너뜀). 지워진 광고비는 복구 못 함 — 시트 버전 기록에서 찾거나 다시 입력.
- **[2026-11-05] 카페24 토큰 유실 사고 → 복구 완료.** 10:26 슬랙봇 상품 스냅샷 잡이 토큰 갱신 뒤 Gist 쓰기에 GitHub 500 → 새 리프레시 토큰 유실 → 워커·슬랙봇 전부 `invalid_grant`. 15:05 Su 가 `/cafe24auth` 로 재인증해 복구. 배포 워커 = 커밋 이후(버전 69e977df).
  - `GET /cafe24auth?key=…` → 카페24 동의 화면(state = KV 난수 10분) → 콜백에서 토큰 교환·Gist 교체·KV access_token 삭제. 스코프 13개 전부(앱 쓰기 포함, Su). 콜백 화면 새로고침하면 "state 불일치" 가 뜨지만 첫 요청은 이미 성공한 것 — Gist 커밋 시각으로 확인.
  - Gist PATCH 재시도: 워커 4회(`getCafe24AccessToken`), 슬랙봇 5회(`build_revenue_daily.save_refresh_token`, `report.py`). 실패 시 로그 `[심각]`.
  - 토큰 스코프에 `mall.read_promotion` 들어옴 → `coupons`(100개↑, coupon_name·benefit) · `coupons/{no}/issues?used_coupon=T`(related_order_id 있음) 조회 가능. `feed=c24` path 는 숫자 불가 → `tab=couponlist&path=` 로.
- **데일리 전표 생성 할인 표시 기획(Su 선택 대기).** 기획 에이전트 2개 합의안: 카드 머리줄 배지 `할인 −N (p%)` · 품목 줄 `정가 → net (−disc · p%)` · 카페24 상세를 상품정가/품목할인/주문쿠폰/기타할인/배송비할인/적립금/실결제로 분해 + 검증식 한 줄 · 할인율 = (품목할인+주문쿠폰+기타)÷상품정가합. 프론트만 ~20행. 쿠폰 이름까지 붙이려면 issues 스캔(쿠폰 수 × 페이지, 서브요청 50 주의) → KV 캐시 설계 필요.
- **[2026-11-03 클라우드 세션] 위탁 정산 ② 고침 3건**(슬랙 정산 검토 스레드, `settle-tab.js` 61be5c5): ① 매입 공급사(자체공급 S0000000) 이카운트 행이 '카페24에 없음' — 카페24 쪽만 위탁 필터라 생긴 비대칭, 이카운트 쪽도 같은 기준 + 안내문. ② 대조 조정 금액 입력 중 ③으로 튐 — 불일치 풀리면 목록에서 사라지던 것, 펼친 공급사 유지 + 스크롤/포커스 복원. ③ 과세 '추정' — 공급사 단위 판정(supTax) 추가, 섞인 업체에서만 배지. 자체공급은 코드 하나를 슬로렌스·티암트리(라이프)·작품(아트)이 같이 써서 코드 단위 담당자 지정으로는 못 가른다.
- **[2026-11-02 클라우드 세션] 위탁 정산 과세·면세 구분 추가**(`settle-tab.js`, CHANGELOG 2026-11-02). 11월 정산 때 헤르시·갤러리 콜론비 정산서로 실물 검증 필요. 섞인 주문에서 '추정' 뜨는 건이 많으면 품명 매칭 기준(0.3) 조정.
- **[2026-10-31 00:40 KST, 클라우드 세션] 밤 크론이 어제 넣은 값을 지웠다 — 커밋으로 고쳤고 배포 대기.** 10-30 아침 실행 뒤 시트: 1-4 AD(SKU) 10-20~29 전부 빈칸(요약 10월 289 로 복귀) · 1-4 M(매출) 10-20~29 빈칸 · 6-3 10월 4주 WAU/새 사용자가 3주 값(15,917/12,170) 그대로. 6-4 10-29 는 정상(가입 13·DAU 2,670·새 1,870).
  원인(코드): `part=ext` 의 1-4 구간이 rawLast 이후 줄을 C~AH 통째로 비운 뒤 수식만 복사한다 → sheet 단계가 쓴 M, raw 단계가 쓴 AD 가 날아간다. 크론은 raw→ext 순서고 `users2` 가 밤에 ext 를 한 번 더 넣어 sheet 이후에도 지운다. 6-3 새 줄은 템플릿(3주) 값 칸(F·I)을 그대로 복사하고 users2 의 ext 뒤엔 wk 가 안 돈다.
  고침: 1-4 비우기에서 M·AD 열 제외 · 6-3 새 줄 F/I 는 빈칸(wk 가 채움) · users2 가 ext 뒤에 wk 도 넣음 · 진단 `GET /kpisheet?job=1`(kpijob 로그·kpisheet:last). **배포 후 복구 순서: `part=ext&step=raw`(SKU) → `part=ext&step=wk`(W4) → `GET /kpisheet?id=…`(M 매출) → `?job=1` 로 밤 로그 확인.**
- 배포된 워커 = 커밋 ce53e2a(버전 40818fab, 2026-11-02). ab4af2a(ext 가 1-4 M·AD·6-3 새 주 WAU 지우던 것) 포함. 배포 뒤 복구 4단계(raw→wk→sheet→job) 돌려 시트 실측 확인: 1-4 M·AD 10-20~11-01 채워짐, 6-3 10월 4주 WAU 11,317.
- `part=ext` 정상(ok). `step=wk` 로 6-3 WAU 2주(2026-10-W3·W4) 채워짐. 서브요청 초과 해소.
- KV `kpiweeks:v1` 에 2026-10-W3(WAU 15,917) · W4(7,170, 진행 중) 들어감. `kpiusers:v1` 10-28 채워짐.
- GitHub Actions `deploy-worker.yml` 은 있으나 시크릿 `CLOUDFLARE_API_TOKEN` 미설정. Actions 의 `DASHBOARD_KEY` 도 옛 값(403).
- 테스트 전부 통과(expense · ecount 60 · paywin 13).
- **slackbot 스케줄 잡 3개(revenue 01:17 · product-snapshot 06:10 · trend-metrics 06:50 KST)는 2026-10-30 부터 Mac mini self-hosted 러너에서 돈다**(GitHub Actions 무료 2,000분 소진 때문). 러너 `~/actions-runner`, launchd `actions.runner.Su-pbg-slackbot.mac-mini`(재부팅 자동 시작), 로그 `~/Library/Logs/actions.runner.Su-pbg-slackbot.mac-mini/`. 상태: `~/actions-runner/svc.sh status`. Mac mini 가 꺼져 있으면 잡이 큐에 걸린다. 11월 1일 한도 리셋 후에도 그대로 둔다.
- 첫 self-hosted 실행(10-30 11:38)에서 슬랙봇 잠복 버그 발현: 실행 중 토큰이 갱신되면 client-id 전용 스토어프론트 `/categories` 호출에도 Bearer 가 끼어 401 → 분류트리 비어 **라이프 중카테고리 전부 0**(revenue-daily.json 7ae7dfb). slackbot 1987f31 로 고치고 재실행해 복구 확인(12:12, revenue-daily.json f454a6b, 라이프 중카 행 404). 깨지면 행 수가 97 로 준다.
- Mac mini 에 `gh`(2.103) 설치·Su-pbg 로그인됨(`~/.local/bin/gh`, 키체인). `gh secret set` 으로 시크릿 입력 가능.

## 진행 중 (건드리지 말 것)
- `worker.js` KPI 수집 효율화 — 클라우드 세션(KPI 대시보드 엑셀 시트)이 1단계 완료 후 **대기 중**. 2단계(ext 를 daily/blocks/weekly 분할)부터는 Su 가 "하나씩" 하자고 함. 다음 단계 시작 전 그 세션과 조율.

## 다음 할 일
0. (Su 수동) 거래처 LIST (라이프) 시트의 담당자 이지혜 50·'이아롬 ' 84 → 홍영주. 대시보드 `supplier-managers.json` 은 2026-10-29 에 바꿨음(122곳). 워커는 그 시트에 쓰기 권한 없음(SA pbg-51@…, 편집자 공유하면 POST /kpisheet {id,data[]} 로 가능).
1. 기획 2단계: `part=ext` 를 `step=daily|blocks|weekly` 로 분할(worker.js 863~1006행). 각 응답에 서브요청 카운트 `sub:` 추가.
2. GitHub Secrets 에 `CLOUDFLARE_API_TOKEN` 입력(`DASHBOARD_KEY` 는 10-29 에 이미 갱신됨). 에이전트의 `gh secret set` 은 분류기(Secret-Store Writes)가 막는다 → Su 가 직접: Mac mini 터미널 `cd ~/Projects/dashboard && ~/.local/bin/gh secret set CLOUDFLARE_API_TOKEN < .cloudflare_token.local`, 또는 폰에서 Cloudflare 새 토큰(Edit Cloudflare Workers 템플릿) 만들어 GitHub 웹에 입력. 넣기 전까지 배포는 "배포해" 로 수동.
3. 10/22 판매 입력 대조 오저장 16건 되돌리기(워커 undo 또는 파일 재업로드).
4. `revenue-daily-archive.json`(~06-23) 과 `revenue-daily.json`(07-31~) 사이 **2026-06-24~07-30 공백** 확인(7월이 47건으로 집계됨).

## 결정 사항 (누적)
| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-07 | Gemini 유료 전환 안 함. 기본 OCR 이 본선 | 무료 한도 20건/일 |
| 2026-10-13 | 몰 검색어는 브랜드 발견에 안 씀(소싱 신호로만) | 이미 온 사람의 수요 |
| 2026-10-27 | KPI 시트 매출 = 슬랙봇 net − 타팀 개인결제창. 선수금은 안 뺌 | Su |
| 2026-10-27 | 원본 KPI_Dashboard 가 값 넣은 칸은 원본이 이긴다(part=sync) | 원본 팀 손입력 존중 |
| 2026-10-29 | 맥북프로 퇴역, Mac mini 가 유일한 로컬 | Su |
| 2026-10-29 | 6-3 WAU·새 사용자 = 대시보드 정의(totalUsers·봇 제외). GA4 원값 아님 | 원값은 손입력의 2배 |
| 2026-10-29 | 전체 재수집은 월말이 아니라 **월초 1~5일**. 매일은 당월+전월 | 전월 환불 흡수 후 확정 |
| 2026-10-29 | 수집 효율화는 한 단계씩 배포·실측 후 다음으로 | 토큰·위험 |
| 2026-11-06 | 지난달 주문을 환불하고 다시 결제한 건(예: 이배 '붓질 4-10' 1,000만, 10-09 주문 → 11-05 환불·재결제)은 카페24 그대로 둔다. 원래 주문일은 환불, 새 주문일은 매출. 판매 입력 대조(이카운트 반품·판매 전표)로 확인 | Su |
| 2026-11-06 | 맥북프로도 로컬로 다시 쓴다(Mac mini 와 병행). 슬랙봇 self-hosted 러너는 Mac mini 그대로 | Su |
| 2026-11-05 | 카페24 앱 스코프는 13개 전부 받는다(앱 쓰기 포함). 재인증은 `/cafe24auth` 로만 | Su, 재인증 반복 방지 |
| 2026-10-30 | slackbot 은 비공개 유지, 잡은 Mac mini self-hosted 러너로 | 히스토리에 cafe24 refresh token 85건 → 공개 불가. 시크릿은 GitHub 에 그대로 |

## 메모
- **로컬 두 대(Mac mini · 맥북프로).** SessionStart 훅이 `git pull --rebase --autostash` 를 먼저 돈다(실패하면 rebase 되돌리고 `[주의]` 출력). push 는 자동으로 안 한다 — 작업 끝나면 직접 push. 같은 파일을 두 대에서 동시에 고치지 않는다.
- 워커 배포는 auto 모드 분류기가 막는다. Su 가 그 턴에 직접 "배포해" 라고 해야 통과. 허용 규칙 추가도 하드 블록.
- 서브요청 50 한도: 시트 읽기(줄·블록 위치, 원본 B열)가 주범. 자세한 추정표는 2026-10-29 기획안(클라우드 세션 전달).
- 클라우드 세션은 이쪽으로 답을 못 보낸다(단방향). 결과는 그 세션 화면에서.
