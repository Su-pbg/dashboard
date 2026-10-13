# slackbot 레이더 패치 — 현재 상태 (2026-10-13)

전부 `Su-pbg/slackbot` main 에 들어가 있다. 이 문서는 **무엇이 왜 그렇게 되어 있는지**만 적는다.
파일 사본은 `scripts/` 에 있고 (`market_brands.py` · `radar_score.py` · `radar_history.py`)
각각 `python3 scripts/<파일>.py` 로 자체검사가 돈다.

## slackbot 의 파일들

| 파일 | 역할 |
|---|---|
| `market_brands.py` | `brand_candidates(pool, config, products)` — 연관검색어 잔여 토큰에서 브랜드 후보 |
| `radar_score.py` | `score` · `decide` · `season_calendar` |
| `radar_history.py` | `append(doc, date, rows, pool, ad_spend)` → `radar-history.json` |
| `build_keyword_radar.py` | 위 셋을 부른다 |
| `build_trend_metrics.py` | HUB·검색광고·유튜브 수집 |

## 조심할 것

- **`salesPer1kSearch` 는 `match_ours()` 안에서 만든다.** 원래 `decide_v2()` 안에 있었고,
  호출부를 `decide()` 로 바꿨더니 120행 전부 `None` 이 돼서 새 점수의 전환효율 항이 죽었다.
  파생값을 판정 함수 안에서 만들지 말 것.
- **`ACTION_ORDER` 에 `decide()` 의 반환값이 다 있어야 한다.** 없으면 `rows.sort` 에서 KeyError.
  현재 8종: 재고확보 · 시즌 준비 · 시즌 소싱 · 밀기 · 안 팔림 점검 · 소싱 검토 · 유지 · 패스.
- **`pool_score` · `decide_v2` 는 아직 남아 있다.** `pool_score` 는 풀 랭킹에 쓰고(470·504·522줄),
  `decide_v2` 는 죽은 코드다. 지우려면 `salesPer1kSearch` 가 이미 옮겨진 걸 확인하고 지운다.
- **`build_trend_metrics.py` 의 `LAST_BLOG_TITLES`/`LAST_YT_TITLES` 는 지금 아무도 안 쓴다.**
  블로그 제목 브랜드 추출을 걷어내면서 호출부가 사라졌다. 유튜브 `snippet.tags` 실험에 쓸 수
  있어서 남겼다. 반환 시그니처는 안 바뀌었으니 기존 호출부에는 영향 없다.

## 폐기된 것

- `market_signals.py` (HUB 검색 4경로에서 제목 수집) — 삭제. 아래 참조.
- `market_brands.extract()` / `from_rel_keywords()` — 삭제.
- `radar_score.brand_rows()` — `brand_candidates()` 로 대체.

**왜 폐기했나:** 블로그·카페·웹문서·뉴스 **제목에서** 브랜드를 뽑는 방식이 실측에서 실패했다.
출력 129개 이름 중 브랜드는 `LG`·`디오스`·`제네시스`·`GV90` 4개뿐이고 그마저 '오브제'가
LG 가전과 충돌한 것이다. 나머지는 `있는`(27개 키워드)·`함께`·`작은`·`맛집`·`quot`·`안녕하세요`.
한국어 리빙 블로그 제목은 구어체 산문이라 브랜드가 빈도로 구분되지 않는다. 불용어 추가로는 안 된다.
게다가 행당 webkr+news 2회씩 × 30행 = 60회를 더 쓰고 있었다.

대신 **브랜드가 이미 연관검색어 풀에 들어와 있다** — 카테고리 단어에 붙어서.
`FLOS조명` · `루이스폴센조명` · `웨지우드접시` · `나그참파인센스` · `이솝디퓨저` · `쿤달디퓨저`.
떼어내면 그대로 떨어지고 호출이 한 번도 안 는다.
