# PBG 대시보드 — 작업 컨텍스트

이 파일은 Claude Code 가 이 레포에서 작업을 시작할 때 자동으로 읽는다.
마지막 갱신: 2026-09-14 02:50 KST

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

세 덩어리이고, **하나만 Git 에 있다.**

| 구성요소 | 위치 | Git |
|---|---|---|
| 프론트엔드 `index.html` (~170KB 단일 파일) | `su-pbg/dashboard` | O |
| 데이터 수집 `scripts/*.mjs` + `.github/workflows/*` | `su-pbg/dashboard` | O |
| **Cloudflare Worker** `proud-sea-35f9.sugim-386.workers.dev` | Cloudflare 편집기 | **X** |
| 매출/카테고리 수집 `snapshot_new_members.py` 등 | `Su-pbg/slackbot` | 별도 레포 |

### 워커가 Git 에 없다는 뜻
워커를 고치려면 **전체 파일을 만들어서 Su 가 Cloudflare 편집기에 덮어쓰기** 해야 한다.
그래서 **워커 수정은 최소화**하고, 가능하면 프론트엔드(`index.html`)에서 처리하는 게 합의된 방향이다.
예: 미등록 구좌 탐지는 프론트에서 하도록 만들어서, 구좌가 늘어도 워커를 안 건드리게 했다.

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
`?bs=&be=&as=&ae=&key=pbg-secret-key-2026&tab=...`
`tab` = `overview`(기본) / `slots` / `cart` / `segfunnel` / `retention` / `acquisition` /
`activeusers` / `events` / `metricscsv` / `membercount`
**인식 못 하는 tab 은 조용히 overview 를 돌려준다** (디버깅 시 함정).

---

## 2. 지금 당장 열린 이슈 (우선순위 순)

### [P0] 워커 `tab=membercount` 가 500 을 뱉는다 — 회원수 수집 전면 정지
- 증상: `update-members` 워크플로우가 `[FAIL] 워커 응답 500` 으로 죽는다.
- `revenue-daily.json` 의 `totalMembers` 가 **2026-07-31 (37,697명) 이후 전부 비어 있다.**
  → 대시보드의 총 회원 수 / 순증 / 월 이탈률이 전부 추정값 or 공백.
- 워커 자체는 정상 (다른 tab 은 200). `buildMemberCounts()` 내부에서 터진다.
- **원인 미확정.** 500 이라 에러 본문이 중간 경로에서 잘려 안 보였다.
- 2026-09-14 에 워커를 고쳐 **실패도 200 + `{error, detail, stack}` 으로 반환**하게 했다.
  → 배포 후 아래를 실행하면 진짜 원인이 보인다:
  ```bash
  curl -s 'https://proud-sea-35f9.sugim-386.workers.dev/?bs=2026-09-12&be=2026-09-12&as=2026-09-12&ae=2026-09-12&key=pbg-secret-key-2026&tab=membercount' | head -c 600
  ```
- 유력 후보 (검증 필요, 단정하지 말 것):
  1. cafe24 앱에 `mall.read_customer` 스코프가 없어서 `/admin/customers/count` 가 401/403
  2. `resolveCustomerCountParam()` 이 가입일 상한 파라미터를 못 찾음
  3. Gist 기반 refresh token 회전 실패

### [P1] 카테고리 100% '미분류' — 아트/라이프 매출 분해 불가
- `product-categories.json`: `products` 1,097개는 정상, **`names` 가 0개**.
- 이 파일은 **slackbot 레포**가 생성해서 push 한다. dashboard 에서는 못 고친다.
- 매핑률도 42% 밖에 안 된다 (나머지 주문은 카테고리 집계에서 빠짐).
- → slackbot 레포의 카테고리 이름 조회 로직을 봐야 한다.

### [P2] 등록됐지만 트래픽 0 인 구좌 45개
- ART 23개 (807~812, 734~739, 740~744 등), LIFE 22개 (723~727, 718~721 등).
- 실제로 메인에서 내린 건지, 매칭이 틀린 건지 가려야 한다.

### [P3] `withdrawnMembers` 소스 없음
- 탈퇴자 수를 구할 방법이 없어서 순증·이탈률이 계속 공백.
- `/admin/customers/count` 방식으로는 원리상 불가 (탈퇴자는 목록에서 사라짐).

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

## 4. cafe24 API 함정 (반복해서 당했다)

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
- 워커 파일을 레포에 커밋하지 말 것 (`.gitignore` 에 있음).
