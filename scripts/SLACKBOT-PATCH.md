# slackbot 레이더 패치 (2026-10-13)

대시보드 레포에서 만든 모듈 4개를 레이더 파이프라인에 붙인다.
**파일 4개 복사 + 호출 7줄.** 외부 API 호출량은 안 늘어난다(이미 부르고 버리던 걸 줍는다).

> 왜 대시보드 레포에 있나: 레이더 코드가 비공개 레포에 있어 내가 직접 커밋을 못 한다.
> 권한을 주면 다음부터는 바로 넣는다.

---

## 0. 파일 복사

`dashboard/scripts/` 에서 레이더 파이프라인 폴더(= `trend_metrics.py` 옆)로:

```
market_brands.py    제목·연관어에서 이름 뽑는 추출기 (불용어·조사처리 포함)
market_signals.py   HUB 검색 4경로에서 제목을 모아 위 추출기에 넘긴다
radar_score.py      점수·판정·시즌달력·브랜드축
radar_history.py    풀 전체 일별 기록
```

각 파일은 `python3 <파일>` 로 자체검사가 돈다. 복사 후 한 번씩 돌려볼 것.

---

## 1. `trend_metrics.py` — 블로그 제목을 버리지 않는다

`naver_blog_7d()` 안:

```python
        fresh = [it for it in items if (it.get('postdate') or '') >= since]
        count += len(fresh)
+       titles += [f"{it.get('title','')} {it.get('description','')}" for it in fresh]
```

함수 맨 위에 `titles = []` 추가하고, `return count` → `return count, titles`.
호출부(`build_keyword_radar.py`)도 같이 고친다:

```python
-       row['blog7d'] = tm.naver_blog_7d(k)
+       row['blog7d'], blog_titles = tm.naver_blog_7d(k)
```

## 2. `trend_metrics.py` — 유튜브도 제목을 받는다

`youtube_7d()` 의 search 호출에서 `"part": "id"` → `"part": "snippet"`, 그리고:

```python
+   titles = [it['snippet']['title'] for it in r.json().get('items', []) if it.get('snippet')]
-   return len(ids), views
+   return len(ids), views, titles
```

호출부:
```python
-       row['yt7d'], row['ytViews7d'] = tm.youtube_7d(k)
+       row['yt7d'], row['ytViews7d'], yt_titles = tm.youtube_7d(k)
```

## 3. `searchad_volume()` — 연관검색어를 버리지 않는다

`rel = {row['relKeyword']: row for row in ...}` 로 이미 받고 있다. 그 키 목록을 밖으로 넘긴다:

```python
-           out[k] = {'monthlySearch': pc + mo, 'pc': pc, 'mobile': mo, 'adCompetition': row.get('compIdx')}
+           out[k] = {'monthlySearch': pc + mo, 'pc': pc, 'mobile': mo,
+                     'adCompetition': row.get('compIdx'), 'rel': list(rel.keys())}
```

## 4. `build_keyword_radar.py` — 시장 브랜드·점수·판정

키워드 루프 안, `match_ours(row, products)` 다음:

```python
+       from market_signals import market_brands
+       from radar_score import score, decide
+       ms = market_brands(k, tm.HUB_ID, tm.HUB_KEY, rel=(v.get('rel') or []))
+       row['marketBrands'] = ms['brands']
+       row['relBrands']    = ms['rel']
+       row['score']  = score(row)
+       row['action'] = decide(row)
-       decide_v2(row)
-       row['score'] = round(pool_score(e, d0))
```

## 5. 문서 레벨 — 시즌 달력 · 브랜드 축 · 기록

`hist_doc['runs'].append({...})` 하는 곳 근처:

```python
+   from radar_score import season_calendar, brand_rows
+   from radar_history import append as hist_append
+   run = {'date': d0.isoformat(), ..., 'rows': rows[:RUN_ROWS],
+          'seasonCalendar': season_calendar(rows, d0.month),
+          'brands': brand_rows(rows)}

+   rh, rsha = tm.load_json('radar-history.json')
+   rh = hist_append(rh, d0.isoformat(), rows, pool, ad_spend=TODAY_AD_SPEND)
+   tm.save_json('radar-history.json', rh, rsha)
```

`TODAY_AD_SPEND` 는 그날 광고 집행액(만원). 없으면 `None` 으로 둬도 되지만,
**넣는 게 좋다** — 안 넣으면 우리 광고를 시장 수요로 착각한다(실측: 라이프 매출이
광고 집행을 그대로 따라갔다. 7월 Display 23만 세션 → 8월 285).

---

## 왜 이렇게 바꾸나 (근거)

**모멘텀은 예측력이 없다.** 120키워드 × 60일 백테스트:
```
이번 주 상승 → 다음 주도 상승   46.0%   (동전 50%)
예측 오차: 모멘텀 1.94  vs  단순 유지 1.41
```
검색량은 평균회귀하는데 기존 판정은 `growth4w >= 0.2` 로 소싱·밀기를 결정했다.

**기존 `score` 는 `monthlySearch` 와 상관 1.00**(볼륨 순 정렬),
`salesPer1kSearch`(전환 효율)와는 **0.06** 이었다. 효율이 순위에 안 들어갔다.

새 점수 적용 시 실측 변화(120행):
```
빠짐:  국중박굿즈 45,680(보유 0) · 소고기선물세트 33,300(0) · 상견례선물 31,520(0)
들어옴: 트레이(262개·137팔림) · 찻잔(71·58) · 수저(104·70) · 도자기(435·183)
할 일:  32개 → 65개
```

**브랜드는 외부에서 와야 소싱이 된다.** `brand_rows()` 가
`sourcing`(외부 2개 키워드 이상 + 우리에겐 없음) / `external` / `ours` 로 갈라준다.

**기록이 없으면 예측도 없다.** 지금 상위 120개만 전체 지표를 남겨서 순위가 밀리면
이력이 끊긴다. `radar_history.append()` 가 풀 전체를 남긴다(120일, 약 7MB).

---

## 확인

붙인 다음 날 아침 레이더가 돌면:
- `trend-metrics.json` 의 행에 `marketBrands` · `relBrands` 가 생긴다
- `runs[-1]` 에 `seasonCalendar` · `brands` 가 생긴다
- `radar-history.json` 이 새로 생긴다
- 대시보드 트렌드 탭은 이미 이 필드들을 읽게 돼 있다
