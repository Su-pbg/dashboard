# PBG 대시보드 — 작업 컨텍스트

이 파일은 Claude Code 가 이 레포에서 작업을 시작할 때 자동으로 읽는다.
마지막 갱신: 2026-09-21

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
`?bs=&be=&as=&ae=&tab=...` + **인증 필요**
- 사람: `POST /login` 에 비번 → 토큰 → `Authorization: Bearer` (파일 받기만 `?t=`)
- 기계: `?key=<DASHBOARD_KEY>` (하드코딩 폴백 없음. 틀리면 403)
`tab` = `overview`(기본) / `slots` / `cart` / `segfunnel` / `retention` / `acquisition` /
`activeusers` / `events` / `metricscsv` / `membercount` / `suppliersales` / `probecustomers`(임시)
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
