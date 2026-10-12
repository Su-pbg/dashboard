# PBG 대시보드 — 작업 컨텍스트

이 파일은 Claude Code 가 이 레포에서 작업을 시작할 때 자동으로 읽는다.
마지막 갱신: 2026-10-12

---

## 0. 작업 규칙 (Su 의 요구사항)

- **한국어, 짧게, 격식 없이.** 서론·요약 반복 금지.
- **부분 스니펫 말고 완전한 파일**로 줄 것. "이 줄을 이렇게 바꿔라" 는 거부당한다.
- **데이터 얘기는 반드시 "지금 시각" 기준**으로. 며칠 전 수치를 현재처럼 말하지 말 것.
  먼저 `date`, 그다음 실제 데이터를 읽고 나서 말한다.
- **추측으로 원인 단정 금지.** 코드·커밋 히스토리·주석을 먼저 읽고 나서 진단한다.
  (과거에 원인을 세 번 연속 틀리게 짚어서 크게 지적받았다. 아래 8번 참조.)
- 문제를 발견하면 **먼저 알린다.** 조용히 넘어가지 않는다.

---

## 1. 시스템 구성

네 덩어리. **2026-09-21 부터 워커도 Git 에 있다.**

| 구성요소 | 위치 | Git |
|---|---|---|
| 프론트엔드 `index.html` (~200KB 단일 파일) | `su-pbg/dashboard` | O |
| 경비환급 `expense.html` · 트렌드 `trend-tab.js`+`radar-config.json` | `su-pbg/dashboard` | O |
| 데이터 수집 `scripts/*.mjs` + `.github/workflows/*` | `su-pbg/dashboard` | O |
| **Cloudflare Worker** `proud-sea-35f9.sugim-386.workers.dev` | `su-pbg/dashboard` 의 `worker.js` | **O** |
| 매출/카테고리 수집 `build_revenue_daily.py` 등 | `Su-pbg/slackbot` | 별도 레포 |

### 워커 고치는 법 (편집기 붙여넣기는 끝났다)
```bash
# worker.js 를 고친 뒤
node --check worker.js
npx wrangler deploy          # wrangler.jsonc 사용. 시크릿은 건드리지 않는다
```
- **`no_bundle: true` 다.** `worker.js` 는 Cloudflare 에서 내려받은 '이미 번들된' 파일이라
  다시 번들하면 esbuild 의 `__name` 헬퍼가 깨져 업로드가 거부된다(`ReferenceError`).
  파일 맨 위 두 줄(`__defProp` / `__name` 정의)을 **지우면 안 된다.**
- 배포본이 로컬과 어긋났다 싶으면 API 로 현재 배포본을 그대로 받아올 수 있다:
  `GET /accounts/{acct}/workers/services/proud-sea-35f9/environments/production/content` (multipart)
- 비밀은 전부 Cloudflare 시크릿이라 **소스에 평문 비밀이 없다** — 그래서 커밋한다.
  (2026-09-16 인증 개편 전에는 접근키가 소스에 박혀 있어 커밋 금지였다.)


### 데이터 흐름
```
GA4 Data API ─┐
              ├─> Worker (KV 캐시) ─> index.html 이 직접 fetch
cafe24 Admin ─┘
slackbot 레포 ──> revenue-daily.json, product-categories.json 을 dashboard 로 push
dashboard/scripts/fetch-data.mjs ──> data.json
dashboard/scripts/update-members.mjs ──> revenue-daily.json 의 totalMembers
```

### 워커 주요 엔드포인트

**인증을 타지 않는 경로가 하나 있다 — `POST /receipt`** (2026-10-06).
경비환급 페이지를 전 팀이 로그인 없이 쓰기 때문에 **인증 검사보다 앞**에 있다.
막는 건 Origin 화이트리스트(`RECEIPT_ORIGINS` = `https://su-pbg.github.io`)와 IP당 분당 20회뿐.
→ **워커 라우팅을 건드릴 때 이 블록을 인증 뒤로 밀지 말 것.** 밀면 경비환급이 통째로 죽는다.
영수증 이미지(base64, 최대 6MB) → Gemini → `{date,merchant,amount,currency,foreignAmount,approvalNo,page,fullText}`.
시크릿 `GEMINI_API_KEY`(필수) · `GEMINI_MODEL`(기본 `gemini-2.5-flash`). 무료 등급이라 한도 넘으면 429.

나머지는 전부 **인증 필요**:
`?bs=&be=&as=&ae=&tab=...`
- 사람: `POST /login` 에 비번 → 토큰 → `Authorization: Bearer` (파일 받기만 `?t=`)
- 기계: `?key=<DASHBOARD_KEY>` (하드코딩 폴백 없음. 틀리면 403)
`tab` = `overview`(기본) / `slots` / `cart` / `segfunnel` / `retention` / `acquisition` /
`activeusers` / `events` / `metricscsv` / `membercount` / `suppliersales` / `buyerpath` /
`catnames` / `cohort` / `orderitems` · 경로 `/settle`(위탁 정산: 거래처 LIST 시트 읽기·브랜드 연결 저장) · 진단용(다 쓰면 삭제): `ga4probe` `funnelprobe` `orderstatus` `probecustomers`

- `tab=orderitems&from=&to=[&format=csv][&full=1]` — 주문 **건별·상품별 원장**. 집계가 아니라 raw 행.
  열: 주문일·주문번호·상품번호·상품명·**공급사코드·공급사명**·수량·판매가·할인금액·공급가액·부가세·
  매출합계·세율·주문상태·결제·취소·개인결제창
  - 공급사는 주문 아이템의 `supplier_id`/`supplier_name` 을 그대로 쓴다 (추가 API 호출 없음).
    담당자·구분은 `supplier-managers.json` + `/supplier-map` KV 오버라이드를 공급사코드로 조인하면 된다.
    2026-08 실측 1,356행 전부 매핑됨. 담당자 비어 있는 공급사 9곳은 '(미지정)'.
  - **`supply_price` 를 공급가액으로 쓰면 안 된다. 그건 매입원가다.**
    실측: 판매 129,000 / supply_price 121,040 / 129,000÷1.1 = 117,272 — 셋 다 다르다.
    공급가액은 `tax_rate` 로 역산한다. 면세(`product_tax_type=B`, rate 0)는 전액 공급가액.
  - **미술품은 면세다.** 2026-08 실측: 과세 187.0M(1,233행) · 면세 170.4M(123행) → 실효 부가세율 5.0%.
    부가세가 10% 가 아니라고 버그로 보지 말 것.
  - `product_price`·`additional_discount_price` 는 **라인 합계**다. 수량을 또 곱하면 안 된다.
  - 배송비는 주문 단위라 품목 행에 못 붙는다 → 품목 합계는 실거래가 아니다.
  - **실거래가 필요하면 `&level=order&format=csv`** (주문 1행: 상품정가·상품매출·배송비·배송비할인·
    포인트예치금·쿠폰할인·기타할인·실결제금액·결제수단). JSON 에는 `orders[]`·`orderTotals`.
    **실결제금액(`payment_amount`)이 정답이다.** 2026-08 합계 313,773,320 = `revenue-daily.json`
    8월 net 과 **정확히 일치**.
  - **품목 합계로 실결제금액을 역산하지 말 것.** 852건 중 104건이 안 맞는다 —
    부분취소 19(주문은 살아있고 일부 품목만 취소) · 배송비 표기만 되고 미부과 63(26.1만) · 기타 22.
    또 주문단위 `coupon_discount_price` 는 품목 `coupon_discount_price` 의 합이라 **이중차감 주의**.
  - 검증(2026-08): 취소·미결제 뺀 315,236,135 vs `revenue-daily.json` 8월 net 315,572,720 (0.11% 차,
    환불 시차 범위). 취소 42.2M · 미결제 4.7M · 개인결제창 10.0M 는 행에 플래그로 남긴다(안 지운다).
- `tab=searchterms&check=N` — 몰 안 검색어(GA4 `searchTerm`)를 **광고 유입과 갈라서** 돌려준다.
  **광고 랜딩은 수요가 아니다.** 실측(최근 30일): 전체 22,811 세션 중 10,230(45%)이 광고였고
  `lee bae` 는 1,781 중 1,455 가 광고라 빼면 326 이다. 수요는 `organic` 으로만 읽는다.
  - `check=N` 이면 상위 N개(최대 24)는 **진짜 몰 검색 페이지를 받아 결과 수를 센다.** KV 하루 캐시.
  - **상품 스냅샷으로 결과 수를 대신 세면 안 된다.** cafe24 검색은 `product-snapshot.json` 에 없는
    필드까지 인덱싱한다 — `lee bae` 가 스냅샷엔 0종인데 몰 검색은 6종이다. 이걸로 한 번 크게 틀렸다.
  - 검색 결과는 **한 쪽에 20종까지**다(실측: 달항아리 page=8, 허명욱 page=9). `pages>1` 이면 그 이상.
  - 전수는 워커로 못 한다(서브요청 한도 50) → `scripts/check-search-results.mjs` + `update-search-results` 액션.
**인식 못 하는 tab 은 조용히 overview 를 돌려준다** (디버깅 시 함정).

---

## 2. 지금 당장 열린 이슈 (우선순위 순)

### [보류] 워커 `tab=membercount` 실패 — **원인 확정(2026-09-17), 작업은 중단(2026-09-21)**

#### 결론 (probe 실측, 더 파지 말 것)
```
customers/count         + (헤더없음 / 2024-06-01 / 2026-03-01)  →  전부 404 "No API found"
customersprivacy/count  + (헤더없음 / 2026-03-01)               →  403 insufficient_scope
customersprivacy?limit=1                                        →  403 insufficient_scope
customers?limit=1                                               →  422 "cellphone 또는 member_id 를 입력하라"
```
- `customers/count` 는 **이 앱에 존재하지 않는 엔드포인트다.** 버전을 바꿔도 안 된다.
  → 9-16 에 넣은 "API 버전 자동탐색"(`resolveCustomerApiVersion`)은 **이 문제에 무효**다.
- 아래 3번에 적어둔 대안 "목록 페이징" 도 **불가**. `/admin/customers` 는 목록이 아니라
  cellphone/member_id 로 찾는 **조회 API** 라 파라미터 없이는 422 다.
  `snapshot_new_members.py:138` 이 이 경로를 목록처럼 쓰고 있어서 파이썬도 같은 이유로 막혀 있다.
- 되는 경로는 **`customersprivacy`** 다 (404 아니고 403 = 엔드포인트는 있고 스코프만 없음).

#### 결정 (2026-09-21, Su) — **지표 자체를 폐기**
**개인정보 스코프는 추가하지 않는다.** 그래서 회원수 API 자동화도 하지 않고,
**대시보드에서 회원 지표를 내렸다.** 내린 것:
- `index.html`: `loadMemberMetrics`(총 회원 수·순증·이탈률) · `memberTrendHTML`(월 추이) ·
  `memberRangeInfo` · `fillMissingTotalMembers`(워커 `tab=membercount` 유일한 호출부) ·
  건강검진의 `totalMembers` 항목 · `#memberWrap` — 전부 삭제.
- 워크플로 `update-members` / `update-new-members`: **스케줄 주석 처리** (파일·수동실행은 남김).
  되살리려면 각 파일의 `schedule:` 두 줄 주석만 풀면 된다.
- 워커의 `tab=membercount` · `buildMemberCounts` 는 **아직 남아 있다** (호출부가 없어 동면 상태).
- `revenue-daily.json` 의 기존 `totalMembers`(~2026-09-12) 와 `scripts/import-members-csv.mjs`
  (CSV 수동 입력 경로)는 **지우지 않았다.** 나중에 되살릴 때 쓴다.

#### (과거 조사 기록 — 결론은 위로 대체됨)

### [P0-old] 2026-09-14 시점 기록

#### [2026-09-14 03:25] 헤더 패치 배포했으나 안 고쳐졌다 — 반증 기록
- `X-Cafe24-Api-Version: 2024-06-01` 패치를 실제로 배포 완료 (Cloudflare Active deployment ≈03:19).
- 배포 **후** 호출(03:20:32) 워커 로그: `[회원수] count 실패 status=404 body={"error":{"code":404,"message":"No API found."}}`
  → **404 그대로.** 헤더 부재는 원인이 아니었다.
- **왜 헛짚었나 (중요):** 근거였던 "python 은 되는데 워커는 안 된다" 가 이 엔드포인트에 대해서는 성립하지 않았다.
  `snapshot_new_members.py:195 total_members()` 는 **똑같은 URL 을 똑같은 헤더로** 부르고,
  실패하면 조용히 넘어간다:
  ```python
  st, body = http(f'{BASE}/api/v2/admin/customers/count', api_headers(tok))
  if st != 200 or ...:
      print(f'[--] 총 회원 수 조회 실패({st}) — totalMembers 는 건드리지 않는다')
      return None
  ```
  즉 **python 이 이 엔드포인트에 성공한 적이 있다는 증거는 없다.**
  `totalMembers` 가 2026-07-31 이후 비어 있는 것 자체가 이 무음 실패의 결과와 정확히 일치한다.
  python 이 증명한 건 `/admin/customers` (목록) 이지 `/admin/customers/count` 가 아니다.
- **다음 가설 (아직 미검증, 또 단정하지 말 것):** `/api/v2/admin/customers/count` 가 이 앱/버전에
  아예 존재하지 않는다. 검증하려면 워커에 임시 probe tab 을 넣어 아래를 각각 status 로 찍어봐야 한다:
  `/admin/customers?limit=1` · `/admin/customers/count` · 다른 API 버전 문자열.
- 대안 경로: 목록(`/admin/customers`)은 python 이 실제로 쓰고 있으므로, count 대신 **목록 페이징으로
  가입일 기준 집계**하는 방식이 확실하다. (워커 서브요청 한도 50 은 별도 고려)
- 미확인 1건: 배포된 소스에 패치가 실제 들어갔는지는 Cloudflare 편집기 내용을 기계적으로 읽지 못해
  **소스 레벨로는 확인 못 했다.** 03:19 배포가 일어난 것과 건네준 파일이 `worker.patched.js` 뿐인 것은 확인됨.

#### (아래는 03:05 에 쓴 내용 — 결론은 반증됐고, 조사 경로 기록용으로 남긴다)

#### (반증됨) 원인이라고 봤던 것
Cloudflare 실시간 로그(대시보드 → 워커 → Observability)에서 직접 확인한 실제 응답:
```
[회원수] count 실패 status=404 qs= body={"error":{"code":404,"message":"No API found."}}
```
**403 insufficient_scope 가 아니라 404 "No API found" 다.**
→ 스코프 문제가 아니라 **그 API 버전에 엔드포인트가 없다**는 뜻.

워커의 cafe24 호출 4곳 전부 **`X-Cafe24-Api-Version` 헤더를 안 보낸다.**
헤더가 없으면 앱 기본(구) 버전으로 붙고, 거기엔 `/admin/customers/count` 가 없다.
같은 경로를 쓰는 `snapshot_new_members.py` 는 `X-Cafe24-Api-Version: 2024-06-01` 을
보내고 정상 동작한다 (`API_VERSION`, line 30 / `api_headers`, line 119).

→ CLAUDE.md 에 적혀 있던 유력 후보 3개(스코프 / 파라미터명 / Gist 토큰 회전)는 **전부 아니었다.**
   인증은 통과하고 있었다 (통과 못 했으면 `cafe24 인증 실패` 가 떴을 것).

#### 해놓은 것
`tools/apply_worker_patches.py` 에 **패치 3 `apiver`** 추가 (커밋 안 됨, working tree 에만 있음).
호출부 4곳을 정규식 한 방으로 고치고 `const CAFE24_API_VERSION = '2024-06-01'` 을 넣는다.
GA4 호출(`Bearer ${token}`)은 안 건드린다.

#### 남은 일 (배포 — 사람 손 필요)
**주의: 레포의 `worker.js` 는 09-13 시점 사본이라 구버전이다.**
09-14 에 넣은 SLOT_MAP 4종(994·948·1034·608+sort=5)과 500→200 변경이 빠져 있다.
**이 파일로 덮어쓰면 그 작업이 되돌아간다.** 반드시 아래 순서로:

```bash
# 1. Cloudflare 워커 편집기에서 "현재 배포본" 전체 복사 → worker.js 에 덮어쓰기
# 2. 패치 적용
python3 tools/apply_worker_patches.py worker.js --only apiver
# 3. worker.patched.js 를 편집기에 붙여넣고 배포
# 4. 검증
curl -s 'https://proud-sea-35f9.sugim-386.workers.dev/?bs=2026-09-12&be=2026-09-12&as=2026-09-12&ae=2026-09-12&key=pbg-secret-key-2026&tab=membercount' | head -c 600
```
`points` 가 돌아오면 성공. 또 404 면 API 버전 문자열을 올려본다.
그 다음 `anchor.diffPct` 로 오차 확인 (1% 초과면 화면에 쓰면 안 됨 — 이미 그렇게 짜여 있음).

#### 워커 디버깅 요령 (이번에 확보)
Su 의 Chrome 은 Cloudflare 에 로그인돼 있다. 워커 `console.log` 를 그대로 읽을 수 있다:
`dash.cloudflare.com` → Workers & Pages → proud-sea-35f9 → **Observability → Events**
워커를 고치지 않고 진짜 status/body 를 볼 수 있으므로 **에러 추적용 워커 수정은 이제 불필요.**
(`wrangler` 는 설치돼 있으나 로그인 안 돼 있음. `wrangler login` 하면 `tail`·`deploy` 로
 붙여넣기 루프 자체를 없앨 수 있다 — 미결정.)

#### [2026-09-14 03:40] 수동 우회로 확보 — 08-01~09-12 백필 완료
API 가 죽어 있는 동안 쓰는 경로. `scripts/import-members-csv.mjs` 추가.
```bash
# cafe24 관리자 → 회원 목록에서 CSV 2개 내보내기 (가입자 / 탈퇴자)
node scripts/import-members-csv.mjs <가입자.csv> <탈퇴자.csv>            # 미리보기
node scripts/import-members-csv.mjs <가입자.csv> <탈퇴자.csv> --write    # 기록
```
- 앵커(마지막 실측 totalMembers) 다음 날부터만 쓴다. **그 이전 누적은 안 건드린다.**
- 같은 범위로 매번 내보내도 이어붙는다 (앵커 이전 구간은 무시). 중복 실행 안전.
- 매출 행이 아직 없는 날은 건너뛴다 (`update-members.mjs` 와 같은 규칙).
- **자동 아니다.** 사람이 내보내야 한다. 자동화하려면 API 경로를 고쳐야 한다.
- 2026-09-14 실행 결과: 08-01 ~ 09-12 (43일) 기록. 09-12 = 38,757명.

### [P0-b] ~~카테고리명 조회 403 insufficient_scope~~ — **해결 (2026-09-21)**
관리자 API `/admin/categories/{no}` 는 이 앱 토큰에 스코프가 없어 403 이 맞다. 그런데
**스토어프론트 API 가 같은 정보를 client-id 만으로 내준다** — 스코프 추가·재인증이 필요 없다.
```
GET https://{mall}.cafe24api.com/api/v2/categories/234
헤더: X-Cafe24-Client-Id: <CAFE24_ADMIN_CLIENT_ID>   (Authorization 없음)
→ 200 {"category":{"category_name":"오리지널","full_category_name":{"1":"아트","2":"오리지널",...}}}
```
- `fetchCategoryName` 을 이 경로로 바꿨다 → 슬롯 이름 번들의 "남은 카테고리 N개" 가 풀린다.
- `tab=catnames` 신설: 전체 카테고리(483개)의 `cate_no → 최상위 분류명` 지도. KV 하루 캐시.
- **주의:** `CAFE24_FRONT_KEY` 시크릿으로는 안 된다 (`invalid_grant / Invalid client_id`).
  되는 건 **관리자 client-id** 다.

### [P1] 카테고리 '미분류' — **화면 쪽은 해결, 원천은 남음 (2026-09-21)**
- `revenue-daily.json` 의 `categories` 는 여전히 전부 `미분류` 로 들어온다(slackbot 이 만든다).
  대신 **대시보드가 화면에서 다시 나눈다**: `product-categories.json`(상품→카테고리 번호)
  × `tab=catnames`(번호→아트/라이프) → `relabelCategoryAxis()` in `index.html`.
  원본 파일은 안 건드린다. 실측(최근 30일): 아트 125.4M · 라이프 37.3M · 미분류 7.6M.
- **남은 문제: 매핑률 41~49%.** categories 합계가 GMV 의 절반도 안 된다 —
  slackbot 파이프라인이 주문의 일부만 카테고리로 집계한다. 이건 그쪽 레포를 봐야 한다.
- `categories[].products` 는 상위 몇 개만 담긴 목록이라 합이 `amt` 보다 작다.
  모자란 금액은 지어내지 않고 '미분류'로 남긴다.


### [P2] 등록됐지만 트래픽 0 인 구좌 45개
- ART 23개 (807~812, 734~739, 740~744 등), LIFE 22개 (723~727, 718~721 등).
- 실제로 메인에서 내린 건지, 매칭이 틀린 건지 가려야 한다.

### [P3] ~~`withdrawnMembers` 소스 없음~~ — **해결 (2026-09-14, 수동)**
- cafe24 관리자 → 회원 목록 **CSV 내보내기**에 `탈퇴일` 컬럼이 있다. 이게 탈퇴자 실측 소스다.
- API(`/admin/customers/count`)로는 원리상 불가한 게 맞았다(탈퇴자는 목록에서 사라짐).
  하지만 **탈퇴자 목록 자체를 내보내면** 날짜별로 셀 수 있다.
- 신뢰도 검증함: 2026-07 겹치는 19일 전부 기존 `withdrawnMembers` 와 **정확히 일치**.

### [P4] 7월 환불 62.6M (GMV의 14.7%) 원인 미조사

---

## 3. 2026-09-14 에 한 작업 (워커)

`SLOT_MAP` 에 미등록 구좌 4종 추가:

| cate | 이름 | 비고 |
|---|---|---|
| 994 | 추석 선물 준비 | GNB 기획전, art·life 양쪽 |
| 948 | ART WEEK | GNB 기획전, art·life 양쪽 |
| 1034 | 조명&가구 | GNB 기획전, art·life 양쪽 |
| 608 + `sort=5` | 신규 상품 | **ART 메인 신규 상품 구좌. 누락돼 있었음** |

+ membercount 에러를 500 → 200 으로 변경 (원인 추적용).

---

## 3-1. 2026-09-17 에 한 작업 (워커)

### 워커를 CLI 로 배포할 수 있게 됨 — **편집기 붙여넣기 루프 끝**
- Cloudflare 배포본을 API 로 내려받아 `worker.js` 를 프로덕션과 동기화했다.
  (9-14 사본은 `worker.0914-old.bak.js` 로 백업. 레포의 worker.js 가 구버전이라는 기존 함정은 해소됨)
- `wrangler.jsonc` 추가. 배포: `npx wrangler deploy` (2026-09-21 부터 `worker.js` 와 함께 커밋됨)
- **주의: `no_bundle: true` 다.** `worker.js` 는 이미 번들된 파일이라 다시 번들하면
  esbuild 의 `__name` 헬퍼가 깨져 `ReferenceError` 로 업로드가 거부된다.
  같은 이유로 파일 맨 위 두 줄(`__defProp` / `__name` 정의)을 **지우면 안 된다.**
- 시크릿은 wrangler deploy 로 안 지워진다. KV 바인딩만 설정에 적혀 있다.

### [고침] `CAFE24_API_VERSION` 2024-06-01 → 2026-03-01
상품명·카테고리명 조회 3곳이 `X-Cafe24-Api-Version: 2024-06-01` 을 보내고 있었는데,
이 버전은 **이제 이 앱에서 제공되지 않아 엔드포인트와 무관하게 400** 이 된다:
```
products?limit=1 + 2024-06-01 → 400 "2024-06-01 version you requested is not available"
products?limit=1 + 2026-03-01 → 200
```
9-14 의 apiver 패치는 당시엔 맞았지만 그 사이 cafe24 가 그 버전을 내렸다.
고친 뒤 `tab=slots` 에서 상품명 정상 조회 확인.

### 임시 probe 가 워커에 남아 있다
`?tab=probecustomers&paths=a|b&vers=-,2026-03-01&blen=3000` — 아무 admin 엔드포인트나
상태코드/본문을 찍어보는 진단용. 인증된 요청만 가능. **다 쓰면 지울 것.**

### `DASHBOARD_KEY` 교체함
검증 호출이 필요해서 Cloudflare 시크릿을 새 값으로 돌렸다. 값은 `~/dashboard/.dashboard_key.local`.
**GitHub Secret 쪽은 아직 옛 값** → `update-members` 액션이 403 으로 실패한다.
맞추려면 GitHub Settings → Secrets → Actions 에 같은 값을 넣으면 된다.
(su7aeng 계정은 이 레포에 read 권한뿐이라 CLI 로는 못 넣는다.)

---

## 3-2. 2026-09-22 에 한 작업 (매출 집계 구조 개편)

### 카테고리 버킷 재설계 — 서로 안 겹친다
`build_revenue_daily.py` (slackbot 레포) 가 내려주는 `categories[]` 구조가 바뀌었다.

| 버킷 | 판정 | 비고 |
|---|---|---|
| `오프라인 · <채널명>` | 채널 카테고리(`1043 일상비일상의틈`)에 걸림 | **가장 먼저 판정.** 매장에서 받아 온라인으로 넣는 주문 |
| `중복` | 아트·라이프 양쪽 | 예전엔 두 축에 중복 계상해 합계가 거래액을 넘었다 |
| `아트` | 608 하위만 | 아트는 통으로 본다 |
| `라이프 · <중카테고리>` | 609 하위만 | 시트 기준 10개(테이블웨어 615 ~ 푸드 624). 여러 중카면 번호 작은 쪽 |
| `미분류` | 어느 트리에도 없음 | 개인결제창(301)·페이코 기획전(911) 등 |

- 버킷마다 **거래액(`amt`, 정가)** 과 **매출액(`net`, 할인·결제 반영)** 을 함께 낸다.
  매출액은 주문 결제금액을 품목 거래액 비중대로 배분한 값이다(주문 단위로만 오므로).
  실측 검증: 버킷 매출액 합계 = 일별 `net` 합계와 **정확히 일치**.
- `products[]` 의 상위 10종 제한을 없앴다. 그 버킷에서 팔린 상품이 전부 들어온다.
- **주의:** 버킷 거래액 합계는 GMV 의 약 104% 다. GMV 에는 배송비가 들어가고 버킷은
  상품 정가만 더하기 때문. **정합성이 필요하면 매출액(net) 쪽을 쓴다.**

### 개인결제창 제외 (2026-09-01 이후 주문부터)
개인결제창은 상품 판매가 아니라 결제 링크다. 타 조직 건이 이커머스 월매출에 섞여 있었다
(8월 3,233만 · 3월 4,392만 규모).

```
남긴다  '이커머스팀 /' · '커머스 /' · 'E /' 접두, 접두 없는 '개인결제창 - OOO님'
뺀다    COM · HQ · IP · PB'S · PBG결제 · 커뮤니티(팀) · 판교 · 운영기획팀 · 저작권사업팀
```
- 주문 단위로 뺀다. 정상 상품이 섞인 주문은 남긴다(금액을 쪼갤 근거가 없다).
- 소급 안 함. 과거치를 맞추려면 백필을 따로 돌려야 한다.
- 규칙 고치기 전에 `python3 test_paywin.py` 부터 돌린다 (실제 상품명 26건).

### 워커에 추가된 것
- `tab=slotfunnel` — GA4 퍼널 리포트(v1alpha)로 구좌 조회 → 상품조회 → 담기 → 구매.
  **주의: '구좌를 본 사람이 이후에 샀다' 이지 '그 구좌로 샀다' 가 아니다.**
  GA4 에 `view_item_list`/`select_item` 이 없어서 진짜 귀속은 GTM 작업이 필요하다.
  구좌별 실매출이 필요하면 `suppliersales.products[]` × `product-categories.json` 조인이 낫다.
- `suppliersales` 응답에 `products[]`(상품번호별 수량·금액·취소·주문수) 추가.
- **죽은 토큰 401 재시도** — cafe24 는 새 access_token 을 내면 이전 것을 즉시 무효화하는데,
  KV 가 즉시 일관적이지 않아 동시 요청이 각자 갱신하면 죽은 토큰이 TTL(2시간) 내내 캐시에
  남는다. 그동안 대시보드가 통째로 401 이었다. `cafe24Get` 이 401 을 보면 강제 갱신 후 1회 재시도.
- 응답 캐시 키에 `paths·vers·client·blen·from·to·format·anchorDate·anchorTotal` 추가.
  안 넣었더니 같은 기간·같은 탭이면 다른 파라미터를 보내도 남의 응답이 돌아왔다.

### 화면
- 카테고리 섹션: 축 소계(아트·라이프·중복·오프라인·미분류) → 버킷별 세부 → 펼치면 상품 전부.
- 데이터 점검 배너는 **기본 숨김**(`?health=1` 로 켬). 고칠 사람만 보면 된다.
- 담당자 탭은 아트·라이프 **팀별**로 나눠서 표시(거래처 LIST 의 `cat` 기준).

---

## 3-3. 2026-10-06~07 (트렌드 탭 · 경비환급)

상세는 `CHANGELOG.md` 에 있다. 여기엔 함정만 적는다.

### 화면이 상위 메뉴 3개로 쪼개졌다
`?m=dashboard|trend|expense`. `m` 없으면 대시보드. 예전 북마크 `?tab=trend` 도 트렌드로 열린다.
`TAB` 변수는 그대로 쓰고 트렌드일 때만 `'trend'` 로 바꿔 기존 `load()` 분기를 재사용한다(`DASH_TAB` 이 대시보드 탭을 기억).
**로그인은 대시보드·트렌드만.** 로그인 창이 화면 전체가 아니라 본문만 덮는 건 의도다 —
로그인 전에도 왼쪽 메뉴에서 경비환급을 누를 수 있어야 한다.

### 트렌드 탭 (키워드 레이더)
`trend-tab.js` + `radar-config.json`. **워커를 안 쓴다.** 데이터는 slackbot 이 매일 06:50 KST 에
`trend-metrics.json` · `keyword-pool.json` · `shopping-insight.json` · `product-snapshot.json` 으로 push.
씨앗·사전·제외어는 `radar-config.json` 에서 고친다(다음 날 아침 반영).
- **네이버 쇼핑 검색 API 는 2026-07-31 종료. 대체 없음. 더 파지 말 것.**
  공지: https://developers.naver.com/notice/article/32530 (및 32564)
  > 검색 API 중 **'쇼핑·책·전문자료' 검색 API는 NAVER API HUB 이관 대상에서 제외**되며,
  > 단계별 일정과 관계없이 2026년 7월 31일에 서비스가 종료됩니다.
  > 해당 API는 **유예 기간이 적용되지 않으며**, 2026년 7월 31일 이후에는
  > **기존 발급 키를 포함하여 호출이 불가**합니다.
  > **NAVER API HUB를 포함한 별도의 대체 API는 제공되지 않습니다.**

  - 2027-06-30 유예는 **검색어 트렌드·쇼핑인사이트·나머지 검색 API** 에만 해당된다. 쇼핑은 아니다.
  - 그래서 "예전 개발자센터 키를 구하면 된다" 는 **틀렸다.** 기존 키도 이미 차단이다.
  - `openapi.naver.com/v1/search/shop.json` 이 401 을 돌려주는 건 인증 단계에서 먼저 끊기기 때문이지
    **경로가 살아 있다는 뜻이 아니다.** 401/404 만 보고 생사를 판정하면 이렇게 틀린다.
  - API HUB(`naverapihub.apigw.ntruss.com`)에는 `/search/v1/shop` 이 **404** 로 애초에 없다. 정상이다.

  **[2026-10-12 실패 기록]** 이 항목이 원래 `trend_metrics.py` 주석에 정확히 적혀 있었는데,
  내가 상태코드만 보고 "종료가 아니라 키 문제" 라고 뒤집었다가 공지를 읽고 되돌렸다.
  호스트도 세 번 헛짚었다(`openapi.naver.com` · `naveropenapi.*` · `apihub.naver.com`).
  **공급사 문서·공지를 먼저 읽는다. 상태코드 추측으로 뒤집지 않는다.**

  그래서 `trend-metrics.json` 의 `compTop`·`compPrice`·`marketPrice`·`priceGap` 은 계속 빈다(7일 내내 0/120).
  **시장가가 필요하면 사람이 네이버 쇼핑을 열어 적는 수밖에 없다.**
- 개발자센터 신규 키 발급이 막혀 API HUB 키(`NAVER_APIHUB_KEY_ID/KEY`)를 쓴다.

### 경비환급 (`expense.html`)
pdf.js → 캔버스 → OCR → ExcelJS. 읽기 경로가 **두 개**다.

#### AI 읽기 (`aiOn`, 2026-10-07 부터 기본 켜짐) — 워커 `/receipt` → Gemini
- 끈 상태는 `localStorage.pbg_exp_ai='0'` 으로만 기억한다(값이 없으면 켜짐). **영수증이 구글로 나간다** — 라벨에 적혀 있다.
- **[2026-10-07] 무료 등급은 모델당 하루 20건이다.** 9월 테크팀 영수증만 23장 —
  한 사람 한 달치가 팀 전체 하루 한도를 넘는다. **유료 전환은 하지 않기로 했다(Su, 2026-10-07).**
  그래서 AI 는 보조고 **기본 엔진이 본선**이다.
- **[2026-10-07 고침] `gemini-2.5-flash` 가 404 가 돼 AI 읽기가 통째로 죽어 있었다.**
  "no longer available to new users". 3연속 실패하면 조용히 기본 엔진으로 내려가므로(`AI.off`)
  겉으로는 "그냥 OCR 이 나쁜 것"처럼 보였다. → 기본을 `gemini-3.8-flash` 로 올리고,
  **404 본문에 구글이 적어주는 후속 모델 이름으로 한 번 더 부르는 자가복구**를 넣었다.
  cafe24 API 버전 때와 같은 함정이다(4번 참조). 모델명을 박아두면 언젠가 또 죽는다.
- 에러에 `code` 가 붙는다: `nokey`(설정 안 됨·포기) · `quota`(한도) · `busy`(혼잡) · `err`.
- 진단: 요청 본문에 `key`(=`DASHBOARD_KEY`)와 `model` 을 같이 보내면 모델을 바꿔 불러볼 수 있다.
  한도가 찼어도 429 본문에 `limit: N, model: X` 가 그대로 와서 모델별 한도를 볼 수 있다.

#### 기본 엔진 (tesseract.js) — 여기가 본선
`PASSES` 3회(400dpi / 300dpi+적응형이진화 / 400dpi psm4)로 읽어 투표. `isConfident` 면 일찍 끝낸다.
- **[2026-10-07] 1·3차를 200·300 → 400dpi 로 올렸다. 실측 48% → 67%.**
  감열지 키오스크 전표의 '일시' 줄이 200dpi 에서 통째로 뭉개졌다(금액은 멀쩡한데 일자만 깨짐).
  **600dpi 는 오히려 나빠진다** — 하이픈이 공백이 돼 `2026-09-08` 이 `2026-09 08` 이 된다. 올리면 좋은 게 아니다.
  400dpi A4 는 약 3300×4700 이라 `renderPage` 가 긴 변 5200px 로 상한을 건다.
- **[2026-10-07] 월 자리 오독 보정.** 09 가 03·08 로 읽히는 일이 잦다(실측 2건/21).
  영수증 전체에 신청월 날짜가 **하나도 없을 때만** 월·연을 신청월로 맞추고 `date.fix=true` 를 단다
  → 화면에 **빨간 '일자 보정됨 · 확인' 칩**. 조용히 바꾸지 않는다.
  - **보정한 일자는 `isConfident` 가 거부한다.** 처음에 이걸 빼먹었더니 추정 일자가 확신으로 잡혀
    투표를 일찍 끊었고, 멀쩡하던 장이 깨졌다(76% → 71%). 추정값으로 조기 종료하면 안 된다.
  - 투표에서도 보정본은 가산점 없이 1표. 같은 날짜면 실제로 읽은 쪽을 남긴다.

#### 정확도 (2026-10-07 실측, 9월 테크팀 23쪽 / 정답 21건)
| | 일자+금액 모두 정확 |
|---|---|
| 손대기 전 | 10/21 (48%) |
| 파싱만 고침 | 11/21 (52%) |
| 400dpi 만 | 14/21 (67%) |
| **둘 다 (현재)** | **16/21 (76%)** |

남은 5건 중 3건(Google·Postman·Claude)은 **USD 인보이스라 설계상 수동 입력**이고,
1건(노션)은 시트 값이 인보이스가 아니라 카드 청구 기준이라 애초에 OCR 로 맞출 수 없다.
**실제로 못 읽는 건 1건**(흐린 컴포즈 전표, 어느 해상도·psm 으로도 일자가 안 나온다).

#### 고치기 전에 이걸 돌린다
```bash
node test_expense.mjs                              # 내장 검사만 (월 보정·투표·금액·분류)
node test_expense.mjs expense-fixtures.local.json  # 실측세트까지 (정확도 + 바닥선 16)
```
실측세트는 **커밋하지 않는다**(`.gitignore`). 실제 영수증 글자라 카드·승인번호가 들어 있다.
다시 만들려면 영수증 PDF 를 3가지 PASSES 로 렌더해 tesseract.js 로 읽은 텍스트를
`{ym, pages:[{texts:[pass0,pass1,pass2]}], expect:[{date,amount,merchant}], floor}` 로 담으면 된다.

---

## 3-4. 2026-10-12 (트렌드 탭 · 몰 검색어)

### 키워드 레이더는 머리 키워드만 보여주고 있었다
`trend-metrics.json` 의 `score` 가 월간검색수와 **상관 1.00** 이라 사실상 검색량 순 정렬이었다.
실측: 풀 1,200개 중 `<1천 725 · 1천~3천 303 · 3천~1만 131 · 1만+ 41`(중앙값 790)인데
화면 120행에는 **1천~3천 구간이 0개**였다. 중간·상세 검색어가 통째로 묻혔다.
→ `trend-tab.js` 가 `keyword-pool.json`(풀 전체 + 일별 `hist`)을 직접 읽어 급상승으로 다시 세운다.
`hist` 가 7일치라 **매일 순위가 바뀐다.** 3버킷: 즉시 노출 · 광고 후보 · 소싱 검토.
`score` 수식 자체는 slackbot(`build_keyword_radar.py`)이라 손 못 댔다.

### 테마 사전이 부분 문자열이라 엉뚱한 영역이 섞인다
`lexicon` 의 '쿠션'이 **쿠션 파운데이션(화장품)** 까지 잡아 전부 '패브릭' 테마로 들어와 있었다.
풀의 '쿠션' 키워드 71개 중 절반이 화장품. **패브릭 테마 오염도 27%** (다른 테마는 0~4%).
→ `radar-config.json` 제외어 57 → 118. **'쿠션' 자체는 넣으면 안 된다** — 진짜 쿠션까지 죽는다.
제외어는 화면에서도 한 번 더 거른다(slackbot 은 다음 날 아침에야 풀에서 지우므로).

### 인스타그램은 발견 도구로 못 쓴다
Graph API 해시태그 검색이 **해시태그 30개 / 7일** 제한이고 최근 24시간 top media 만 준다.
Basic Display API 는 종료됐다. → `radar-config.json` 의 `instagramWatch` 에 매출 상위 브랜드·제품군
**22개를 고정**해 주 1회 온도만 본다. 발견은 네이버·유튜브로 한다.
유튜브는 이미 들어오지만 `search.list` 가 100 units/호출, 일 10,000 → **하루 100회**가 상한이라
120행 중 30행만 채워진다. 로테이션하거나 후보 좁힌 뒤 붙이는 게 맞다.

### 몰 검색 — 우리가 만든 API 가 따로 있다

**사용자가 쓰는 검색은 cafe24 가 아니다.** 검색창은 `printbakery.com/search.html?q=` 로 가고,
그 페이지가 부르는 건 우리 API 다. 경로는 `search.html` 인라인의 `window.APP_CONFIG.API_URL` 에 있다.

```
https://api.printbakery.com/v1/search/products?q=…&limit=  →  { total, data[{brand_name, supplier_name, price, …}] }
                              /search/products/brand?q=<code>   (이름 아니라 코드)
                              /search/autocomplete?q=
                              /search/ranking                   몰 실시간 인기 검색어 10위
```
`total` 이 사용자가 보는 그 숫자다. `data[]` 에 `brand_name`(한글+영문)이 같이 온다.

#### ⚠ 전수로 때리지 말 것
[2026-10-12] 2,238개를 동시 5개·60ms 로 돌렸다가 **AWS ALB 에 막혔다**
(`HTTP 429` · `server: awselb/2.0` · 본문 없음 — IP 단위 레이트룰로 보인다).
그 뒤로 이 IP 에서는 `ranking` 조차 전부 429 였다. 몰 페이지(`search.html`·메인)는 200 으로 멀쩡했다.
**고객 검색이 같은 엔드포인트를 쓴다.** 많이 필요하면 백엔드(검색 인덱스)에서 뽑아야 한다.
→ `scripts/check-search-results.mjs` 는 기본 **상위 100개 · 동시 1 · 초당 1회**로 묶었고,
429 를 만나면 바로 중단한다. 액션 기본값도 같다.

#### [실패 기록] 결과 건수를 세 번 틀렸다
1. **상품 스냅샷 대조** — cafe24 가 스냅샷에 없는 필드도 인덱싱한다. "33%가 상품 0개" 무효.
2. **`/product/search.html?keyword=` 긁기** — cafe24 기본 검색이고 사용자는 안 쓴다.
   `30만원대 선물` 이 구형 0건 / 실제 19건. "0건 696개" 무효.
3. **"SPA 라 셀 수 없다" 고 기능을 지움** — 우리가 만든 API 가 있었다.

세 번 다 **우리 코드를 안 보고 바깥에서 추측**해서 틀렸다. `search.html` 인라인에 API 주소가 그냥
적혀 있었다. **긁기 전에 우리 프론트 코드를 먼저 읽는다.**

#### 지금 쓰는 것
- 워커 `tab=searchterms` — GA4 검색어를 **광고 유입과 갈라서** 준다. 이건 믿을 수 있다.
  실측: 전체 22,811 세션 중 **45%가 광고**. `lee bae` 는 1,781 중 1,455 가 광고.
  **광고 랜딩은 수요가 아니다** — `organic` 으로만 읽는다.
- `scripts/check-search-results.mjs` → `search-results.json` (상위 100개 결과 수 + 브랜드 + 인기검색어)
  2026-10-12 현재 **파일 없음** — 429 가 풀린 뒤 액션이 처음 돌면 생긴다. 없으면 화면은 검색어 목록만 보여준다.
- 띄어쓰기 버그: `정희진 도자기` 0건 → `정희진도자기` **44건**. 공백을 AND 로 처리한다.

### 레이더의 범위 — 씨앗으로 영역을 묶는 건 설계다

[2026-10-12] 신호 대부분이 `radar-config.json` 의 씨앗 10개(우리 카테고리)로 질의한 결과다.
**이건 결함이 아니라 의도다.** 우리는 아트·라이프 플랫폼이고 가전·식품을 팔 일이 없다.
영역을 안 묶으면 `소고기선물세트 33,300` · `상견례선물 31,520` 같은 게 상위를 채운다
(실제로 올라와서 `패스` 가 120개 중 44개였다).

영역 **안에서의** 발견은 된다. 연관어 확장이 우리가 아직 안 가진 품목을 물어온다 —
실측: `뱅커스램프 +41%`(조명 씨앗에서 뻗음) · `사계절러그` · `사무실디퓨저`.

→ 실제로 신경 쓸 건 하나다: **씨앗이 낡으면 못 따라간다.**
우리 영역에 붙을 새 품목군이 생겼는데 씨앗 어디서도 연관어로 안 닿으면 안 보인다.
분기에 한 번 `radar-config.json` 의 `seeds` 를 손보면 된다.

**[기록] 내가 이걸 '근본 한계' 라고 과장했다가 되돌렸다.** 노이즈(패스 37%)를 문제라고 지적해놓고
뒤에서는 영역 밖이 안 보인다고 했다 — 앞뒤가 안 맞았다.

#### 다만 '외부'와 '우리'는 섞지 말 것 (2026-10-12 고침)
- `instagramWatch` 를 **우리 매출 상위 브랜드 → 시장 해시태그**로 교체.
  공간·연출 / 소비맥락 / 품목흐름 / **경쟁채널(오늘의집·29CM·텐바이텐·아이디어스)**.
  우리 브랜드를 넣으면 트렌드 발견이 아니라 우리 반응 확인이 된다.
- '몰 안 검색어' 카드에 **'시장 트렌드 아님'** 배지. 이미 우리 몰에 온 사람의 수요다.
- **쇼핑인사이트 '분야별 인기검색어' 는 API 가 없다.** 데이터랩 쇼핑인사이트는 *내가 지정한*
  키워드/카테고리의 클릭 추이만 준다. 랭킹은 데이터랩 웹 화면 전용이다.
  (`/shopping/v1/keywords` · `/category/rank` · `/category/top` 전부 404 — 실측)
  → "씨앗과 무관한 인기어를 받아온다" 는 이 경로로는 불가능하다. 씨앗 갱신은 사람이 한다.

- **HUB 쇼핑인사이트 경로 (2026-10-12 실측, 401=있음 / 404=없음)**
  ```
  /shopping/v1/categories               ← 지금 쓰는 것 (카테고리 클릭 추이)
  /shopping/v1/category/gender          ← 쓰는 중
  /shopping/v1/category/age             ← 쓰는 중
  /shopping/v1/category/device          ◀ 있는데 안 쓴다 (PC/모바일 비중 — 광고 집행에 쓸 수 있다)
  /shopping/v1/category/keywords        ◀ 있는데 안 쓴다
  /shopping/v1/category/keyword/age     ◀ 있는데 안 쓴다
  /shopping/v1/category/keyword/gender  ◀ 있는데 안 쓴다
  ```
  `/category/keywords` 로 **씨앗 키워드가 그 카테고리 안에서 점유를 잃는지 얻는지** 볼 수 있다.
  지금은 카테고리 전체 추이만 봐서 "가구/인테리어 -24.9%" 수준에 머문다.

  명명 규칙: `/{service}/v1/{method}` — `search` · `search-trend` · `shopping`.
  `shopping-insight` · `datalab` 접두어는 전부 404 다. 경로를 모르면 **404/401 로 훑어서 찾는다**
  (404=없음, 401=있고 키만 필요). 이번엔 8가지 찍어서 한 번에 나왔다.

### 시장 브랜드 — 외부 검색 결과에서 뽑는다 (`scripts/market_signals.py`)

네이버 쇼핑 검색 API 가 없으니 **이미 키가 있는 HUB 검색**에서 글 제목을 받아 이름을 줍는다.
`market_brands.py`(추출기·불용어) + `market_signals.py`(수집·조합) 두 파일이다.
slackbot 에 복사하고 두 줄이면 끝난다:

```python
from market_signals import market_brands
row['marketBrands'] = market_brands(k, tm.HUB_ID, tm.HUB_KEY, rel=rel_keywords_for_k)
```

**쓰는 경로 — 전부 401 로 실재 확인(2026-10-12), 키는 이미 있다**
```
/search/v1/blog         이미 호출 중 (개수만 세고 제목은 버리고 있었다)
/search/v1/cafearticle  〃
/search/v1/webkr        ◀ 안 쓰던 것
/search/v1/news         ◀ 안 쓰던 것
+ 검색광고 relKeyword    ◀ 풀 확장에만 쓰고 버리던 것 — 연관어에 브랜드가 그대로 섞여 온다
```
한도 여유: 블로그 당월 **3,063 / 775,000 (0.4%)**. 네 경로를 다 써도 넉넉하다.
추출은 **문서빈도**(한 글에 여러 번 나와도 1)라 제목 반복에 안 속고, 조사를 떼어
`오늘의집` 과 `오늘의집에서` 를 한 이름으로 합친다. 자체검사 포함.

**판정이 아니라 단서다.** 작가명·몰 이름·일반어가 섞인다. 화면엔 '같이 자주 나오는 이름' 으로.

#### 안 되는 것 / 보류
- **쿠팡 파트너스 · 11번가** — API 는 살아 있지만(401 / unregisteredKey) 쓰지 않기로 했다(Su).
- **오늘의집 403 · 29CM 404 · 텐바이텐 404** — 공개 API 없음. 프론트 엔드포인트 뚫는 건 약관 위반.
- **인스타그램** — `graph.facebook.com/v21.0/ig_hashtag_search` 는 **400**(경로 정상, 파라미터만 없음).
  **해시태그 30개/7일** 한도라 주 30개 로테이션이면 분기 ~390품목을 돈다. `top_media` 캡션에
  브랜드가 박혀 있어 같은 추출기를 쓸 수 있다. 필요한 것: IG 비즈니스 계정 ID + 장기 토큰.
  ※ 내가 "발견용으로 못 쓴다" 고 단정했다가 되돌렸다. 로테이션을 안 따져본 탓이다.
- **구글 Custom Search JSON API** — **400 "API key not valid"**(경로 정상). 무료 하루 100쿼리,
  이후 1,000건당 $5. 해외 브랜드·영문 표기가 네이버보다 잘 잡힌다. 키 발급만 하면 된다.


---

## 3-5. 2026-10-12 (위탁 정산 메뉴)

`settle-tab.js` + 워커 `/settle`. 대시보드와 같은 로그인을 쓴다(메뉴별 비번 없음). 상세·검증은 `CHANGELOG.md`. 여기엔 함정만.

- **정산 금액의 기준은 이카운트 판매내역서다.** 카페24(`orderitems`)는 대사용이다. 반품·이월·선수금 전표가 이카운트에만 있다.
  이카운트 `결제일` 열이 실제로는 cafe24 주문번호다(대사·배송비 묶음의 키).
- **담당자는 거래처 LIST 의 '담당자' 열이다.** 대시보드 담당자 탭(supplier-managers.json)이 아니다(Su, 2026-10-12).
- **위탁(또는 '매입 + 위탁') 공급사만 다룬다.** 매입은 이카운트 재고2(위탁)에 안 들어와 넣으면 전부 '이카운트 누락'이 된다. 계약 형태가 빈 곳은 빼되 화면에 알린다.
- **정가 기준이다.** 판매가·할인가로 계산하면 기존 정산서와 안 맞는다. 그래서 대사의 '금액 다름'은 막지 않는다(참고용).
- 배송비 행은 **무료배송 기준을 보지 않고** 주문마다 붙는다(기존 78개가 그렇다). 예외는 화면에서 주문별로 끈다.
- 시트의 요율 칸은 **PB 수수료**다(0.25 = 업체에 75% 지급). 문자열 요율("작품50%/상품25%")은 일부러 막는다 — 추측해서 계산하지 말 것.
- 시트 읽기가 403 이면 공유 문제다(응답 `saEmail`). 탭 이름을 바꾸면 batchGet 이 통째로 400 → 워커 `SETTLE_TABS` 를 같이 고친다.

## 4. cafe24 API 함정 (반복해서 당했다)

- **API 버전을 헤더에 박아두면 언젠가 전부 400 이 된다.** cafe24 가 옛 버전을 내리면
  엔드포인트와 무관하게 `"...version you requested is not available"` 400 이 온다.
  앱 기본값은 에러 메시지에 들어 있다(`The default value for the app version is ...`).
- **404 와 403 을 구분할 것.** 404 "No API found" = 그 엔드포인트가 없는 것(버전 바꿔도 소용없음).
  403 insufficient_scope = 엔드포인트는 있고 권한만 없는 것.
- **관리자 API 가 403 이면 스토어프론트 API 를 먼저 보라.** `/api/v2/{resource}` 를
  `X-Cafe24-Client-Id: <관리자 client-id>` 로 부르면 토큰·스코프 없이 열리는 게 있다
  (카테고리가 그랬다). 스코프 추가·재인증보다 훨씬 싸다.

- **인식 못 하는 쿼리 파라미터를 에러 없이 무시한다.**
  파라미터명이 틀리면 조건이 사라진 채 "전체 결과"가 그럴듯하게 돌아온다.
  → 항상 극단값을 넣어 값이 실제로 변하는지 검증할 것. (`resolveCustomerCountParam` 이 이 방식)
- `limit` 최대 100, `offset` 최대 8000.
- 목록 정렬 코드: **5 = 신상품순, 6 = 인기순, 8 = 조회수순**
- 워커 서브요청 한도: 무료 플랜 50개. `MEMBER_MAX_POINTS=31` 은 이것 때문.

---

## 4-1. 대시보드 vs cafe24 관리자 숫자가 다를 때 (2026-09-28 규명)

**셋 다 각자 다른 걸 센다. 버그가 아니라 정의 차이다.** 실측 예: 2026-09-21~27

| 항목 | 차이 | 원인 |
|---|---|---|
| GMV | cafe24 가 346만 많음 | **개인결제창.** 대시보드는 타 조직 건을 뺀다(9번 규칙), 관리자는 전부 포함. 그 주 제외분 360만 |
| 주문 건수 | cafe24 162 · 대시보드 164 · 워커 165 | **결제완료 기준 차이.** 실측 결제완료 163건 + 미결제 2건 = 165건. 관리자 표는 '결제완료 주문' 만 센다 |
| 환불 | 워커 취소 882만 vs 관리자 환불 481만 | **취소 ≠ 환불.** 상태코드 `C40`(입금 전 취소)은 돈이 나간 적이 없어 환불로 안 잡힌다. `C47`·`C48` 만 실제 환불 |
| 환불 (시차) | 대시보드가 관리자보다 적게 보일 때 | **구조 문제가 아니라 갱신 주기다.** `revenue-daily.json` 은 매일 재생성되며 과거 환불도 소급 반영된다(8월 실측: 기록 33,874,510 vs 최종 33,734,578, 차이 0.4%). 최근 며칠만 아직 안 잡힌 것 |

- 주문 상태코드: `N**` 정상 진행 · `C**` 취소 · `R**` 반품 · `E**` 교환
- 진단: `?tab=orderstatus&from=&to=` — 결제 상태별·품목 상태별 집계를 그대로 돌려준다
- 환불 최종값: `?tab=refundsync&from=&to=` — 주문일이 그 구간인 주문의 환불을 **오늘까지 추적**해
  주문일별로 되돌려 붙인다. cafe24 `refunds` API 기반(9/21~27 실측 4,803,633 vs 관리자 표 4,810,350,
  차이는 취소 수수료로 보임). **slackbot 을 대체하지 않는다** — 일별 보고는 slackbot, 지금 이 순간의
  최종값이 필요할 때만 이 탭을 쓴다.

## 5. GA4 구좌 귀속 방식

`pagePathPlusQueryString` × `pageReferrer` 조합으로 메인에서 나간 클릭을 구좌에 귀속시킨다.
`sort_method` 가 붙은 URL 은 **정렬 구좌**로 따로 잡아야 한다 —
안 그러면 글로벌네비 '아트'(cate 608)에 정렬 구좌 트래픽이 합산돼 오염된다 (실제로 239세션이 잘못 잡혔었다).
`byCS` (cate|sort) 와 `byCsortless` 버킷이 그 처리다.

---

## 6. 2026-09-07 구매하기 버튼 분리

기존: 구매하기 → 장바구니 담김
변경: 구매하기 → **주문서 직행**

`index.html` 에 `BUY_SPLIT_DATE='2026-09-07'`, `buySplitPhase()`, `hasDirectBuy()` 로 처리.
퍼널에서 장바구니를 **분기 단계**로 빼서 선형 체인에서 제외한다.
→ **`cartRate` 목표치는 분리 이전 기준이라 의미가 없다. 재설정 필요 (운영 결정 사항).**

---

## 7. 2026-08 분석 결론 (참고)

- 건수 -24% 는 7월 프로모션 종료 + 계절성 (2025년에도 7→8월 동일 패턴 확인).
- **순매출은 오히려 +22.5%.**
- 퍼널 병목은 `상품조회 → 담기` 단 한 군데. 하위 퍼널은 변화 없음.
- 후속 과제: 알림톡 발송량 회복.

---

## 8. 하지 말 것 (과거 실패)

- **`newMembers` 가 안 나온다고 "고장났다" 고 하지 말 것.**
  2026-08-03 에 **의도적으로 폐기**하고 GA4 `joinDone` 기반 '신규 가입' KPI 로 대체했다.
  워커 주석에 그렇게 적혀 있었는데 안 읽고 세 번 연속 엉뚱한 원인을 짚었다.
  → **가설 세우기 전에 코드 주석과 커밋 히스토리를 먼저 읽는다.**
- 헬스 배너에 폐기된 지표 체크를 넣지 말 것 (오탐 발생했었음).
- ~~워커 파일을 레포에 커밋하지 말 것~~ — **2026-09-21 폐기.** 소스에 평문 비밀이 있던 시절의
  규칙이다. 지금은 비밀이 전부 Cloudflare 시크릿이고, 워커가 Git 밖에 있어서 **어제 세션의
  워커 소스가 디스크에서 통째로 사라지는** 일이 실제로 있었다. `worker.js` 는 커밋한다.
  대신 **`.dashboard_key.local` 과 `worker.patched.js`·`worker.*.bak.js` 는 계속 무시**한다.
