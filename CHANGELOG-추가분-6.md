# CHANGELOG 추가분 (6차)

2~5차분과 함께 `Su-pbg/dashboard/CHANGELOG.md` 상단에 붙여넣으세요.

---

## 2026-07-30 — 할인 필드 버그 2건 수정 · 쿠폰명별 내역 · 카테고리 복구

`probe_cafe24_api.py` 진단으로 실제 API 응답 구조를 확인하고, 그동안 추측으로 짜여 있던 부분을 실측 기준으로 바로잡았습니다.

### 버그 수정 (`build_revenue_daily.py`)

**① 예치금 필드명 오타 — 값을 계속 못 잡고 있었음**
`DISCOUNT_FIELDS` 의 예치금 후보가 `credit_spent_amount` 였으나 실제 응답은 **`credits_spent_amount`**(복수형). 예치금 사용액이 전부 누락돼 `기타` 로 흡수되고 있었음.

**② `items[]` 안의 할인을 아예 훑지 않았음**
`bucket_by_day()` 는 주문 최상위와 `initial_order_amount` 만 봤고 `items[]` 내부는 보지 않았음. 실측 주문 `20260729-0000617` 로 확인:

```
order_price_amount                      39,000
payment_amount                          32,370   → 실제 할인 6,630
  coupon_discount_price                  3,900   (잡고 있던 것)
  items[0].additional_discount_price     2,730   (놓치고 있던 것)
                                        ------
                                         6,630   정확히 일치
```

즉 `기타 2,730` 은 정체불명이 아니라 상품 추가할인이었음. `ITEM_DISCOUNT_FIELDS` 를 신설해 `items[].additional_discount_price` 를 `상품 추가할인` 으로 집계. **검증: 이 주문의 `기타` 가 2,730 → 0 으로 떨어짐.**

> **이중 계상 주의** — `items[].coupon_discount_price` 는 주문 레벨 `coupon_discount_price` 와 같은 금액이 중복 표기된 것(실측 양쪽 모두 3,900). `ITEM_DISCOUNT_FIELDS` 에는 `additional_discount_price` 만 넣었음.

**③ 할인 필드명을 추측에서 실측으로 전면 교체**
후보 키를 여러 개 나열하던 방식을 버리고 확인된 이름만 사용. 신규 확보: `coupon_shipping_fee_amount`(쿠폰 배송비), `app_discount_amount`(앱 할인), `market_other_discount_amount`(마켓 할인). `point_incentive_amount` 는 '적립 예정 포인트'이지 할인이 아니므로 제외, `total_amount_due` 도 제외.

### 추가: 쿠폰명별 할인 내역

**API 제약** — 목록 조회 `/admin/orders?embed=coupons` 응답에는 `coupons` 키가 **오지 않음**(진단에서 71개 키에 없음 확인). 쿠폰명·쿠폰별 금액은 **단건 조회**에만 존재:

```
/admin/orders/{order_id}?embed=coupons
→ coupons: [{coupon_name, coupon_code, coupon_percent, coupon_value, order_item_code}]
```

`/admin/coupons`(쿠폰 마스터)는 403 `insufficient_scope` 이지만, 주문에 쿠폰명이 직접 오므로 불필요.

- **`fetch_coupon_details()`** 신설. 주문 단건 조회로 `o['_coupons']` 를 붙임.
  - **호출 수 절감**: `coupon_discount_price` 와 `coupon_shipping_fee_amount` 가 모두 0인 주문은 조회하지 않음. 쿠폰을 쓴 주문만 대상.
- `bucket_by_day()` 가 `coupons: [{name, amt, count, percent}]` 를 일별 레코드에 추가 (금액순 상위 20종).
- `index.html`: `할인 종류별` 의 **쿠폰 행에 `자세히 ▾` 토글**. 펼치면 쿠폰명별 금액·사용 건수·할인율이 미니 막대와 함께 나옴. 5차에서 만든 `rowItem()`/`rowToggleBtn()` 재사용.

### 수정: 카테고리 집계 복구 (13개월간 0건이었던 원인)

**원인 확정** — 기존 `load_category_map()` 은 `/admin/products?product_no=1,2,3&limit=100` 목록 조회로 카테고리를 얻으려 했으나, **이 응답에는 `category` 필드가 아예 없음.** `embed=categories` 를 붙여도 무시됨(필드 목록 동일). 카테고리는 **단건 조회**에만 존재:

```
/admin/products/{product_no}
→ "category": [{"category_no": 939, "recommend": "F", "new": "F"}, ...]
```

`/admin/products/{no}/categories` 전용 경로는 404.

- 단건 조회 방식으로 재작성. 상품 하나가 여러 카테고리(실측 11개)에 속하므로 매출 이중 계상을 막기 위해 **`category_no` 가 가장 작은 것 하나**를 대표로 사용(cafe24는 상위 분류에 작은 번호를 부여).
- **캐시 신설** — 단건 조회는 상품 종류만큼 호출이 필요하므로 결과를 대시보드 레포의 **`product-categories.json`** 에 저장하고 재사용. Actions 러너는 실행마다 초기화되므로 원격 저장이 필요함. 상품의 카테고리는 거의 바뀌지 않아 캐시 적중률이 높음.
- `resolve_category_names()` 에 이름 캐시(`names`)를 연결해 카테고리명 재조회도 절약.
- `push_to_dashboard_repo()` 를 `path`·`message` 인자를 받도록 일반화 (기본값은 종전과 동일해 기존 호출부 영향 없음).

### 확정: 회원 API는 사용 불가

`/admin/customers` 는 모든 파라미터 조합에서 **422** — 메시지가 `Please enter the cellphone or member_id parameter.` 로, 개별 조회 전용이고 목록 조회를 지원하지 않음. `/admin/customers/count`, `/admin/customers/withdrawal`, `/admin/withdrawnmembers`, `/admin/customersgroups` 는 전부 **404**. API 버전을 명시하면 400과 함께 **이 앱의 버전은 2026-03-01 고정**이라는 응답.

→ **신규가입자·탈퇴 데이터는 관리자 CSV 수동 추출이 유일한 경로.** 자동화 계획 폐기.

### 백필 스크립트 (`backfill_revenue.py`)
- `core` 를 import 하는 구조라 위 할인 수정이 자동 반영됨.
- 쿠폰 상세 조회와 카테고리 캐시 연동 추가. `--skip-coupons` 플래그 신설.
- dry-run 에서는 카테고리 캐시를 저장하지 않음.
- 워크플로에 `skip_coupons` 입력 추가, `timeout-minutes` 60 → 120 (단건 조회 여유).

### 적용 후 해야 할 일
매일 도는 스크립트는 최근 90일만 재계산하므로, **2025-01-01 ~ 2026-04-xx 구간에는 쿠폰·카테고리가 채워지지 않습니다.** 전 구간에 반영하려면 백필을 `--overwrite` 로 한 번 돌려야 합니다 (기존 `newMembers` 는 보존됨).

### 검증
- `build_revenue_daily.py`, `backfill_revenue.py` 문법 통과.
- 진단 로그의 실제 주문 값으로 `bucket_by_day()` 를 실행해 `기타 = 0`, 할인 합계 6,630 일치, 쿠폰명·카테고리 정상 출력 확인.
- `index.html` 스크립트 `node --check` 통과, HTML 태그 균형 검사 통과, `$('...')` 참조 id 전수 존재 확인.
- 쿠폰 상세 렌더를 2종 쿠폰 더미로 실행해 막대 비율(100% / 24%) 정상 확인.
