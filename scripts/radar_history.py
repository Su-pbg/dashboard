# -*- coding: utf-8 -*-
"""풀 전체의 핵심 지표를 매일 남긴다 → radar-history.json

왜: 지금은 상위 120개(RUN_ROWS)만 전체 지표를 남긴다. 순위가 밀리면 그 키워드 이력이 끊겨
    "블로그 글이 늘면 N주 뒤 검색이 오르나" 같은 리드-래그를 영영 못 잰다.
    예측을 하려면 기록이 먼저다. 2026-10-06 시작이라 지금 7일치뿐이다.

설계: 풀 전체(1,200)는 **검색량 한 숫자만**, 상위 행만 나머지 지표를 담는다.
      전부를 7칸 배열로 두면 null 이 대부분이라 40MB 가 된다(실측) → 두 갈래로 나눴다.
      광고비는 그날 하나뿐이라 날짜 레벨에 한 번만 둔다.

{ "fields": ["blog7d","yt7d","ourCount","ourSales30","score"],
  "days": { "2026-10-13": {
      "ad": 3505,                                   # 그날 광고 집행(만원) — 하루 한 번만
      "search": { "달항아리": 44800, "뱅커스램프": 770, ... },     # 풀 전체
      "rich":   { "달항아리": [120, 8, 20, 8, 1820], ... } } } }   # 상위 행만

**adSpend** 를 같이 남기는 이유: 우리 광고 집행이 우리 판매를 끌어올리므로, 그걸 빼지 않으면
우리 광고를 시장 수요로 착각한다(실측: 라이프 매출이 광고 집행을 그대로 따라갔다).

쓰는 법 (slackbot):
    from radar_history import append, FIELDS
    hist, sha = tm.load_json('radar-history.json')
    hist = append(hist, d0.isoformat(), rows, pool, ad_spend=today_ad_spend)
    tm.save_json('radar-history.json', hist, sha)

자체 검사:  python3 scripts/radar_history.py
"""
FIELDS = ['blog7d', 'yt7d', 'ourCount', 'ourSales30', 'score']   # search·ad 는 따로 둔다
KEEP = 120                      # 120일(~7MB). 리드-래그는 8~12주면 재진다.
                                # 180일이면 ~10MB, 400일이면 ~23MB 라 레포·Pages 에 과하다.
                                # 전년 동기 비교는 데이터랩(seasonIdx·yoy)이 따로 준다.


def _last(hist_map):
    if not hist_map:
        return None
    k = sorted(hist_map)[-1]
    return hist_map[k]


def append(doc, date, rows, pool=None, ad_spend=None, keep=KEEP):
    """rows: 그날 레이더 행(상위 N개, 전체 지표 있음). pool: keyword-pool 의 keywords(전부).
    풀에만 있는 키워드는 검색량만 남는다 — 그래도 남겨야 순위가 밀려도 이력이 안 끊긴다."""
    doc = doc or {}            # 주의: 받은 doc 을 그 자리에서 고친다
    doc.setdefault('fields', FIELDS)
    days = doc.setdefault('days', {})

    search = {}
    for k, e in (pool or {}).items():
        v = _last(e.get('hist'))
        if v is not None:
            search[k] = v

    rich = {}
    for r in rows or []:
        k = r.get('keyword')
        if not k:
            continue
        if r.get('monthlySearch') is not None:
            search[k] = r['monthlySearch']
        rich[k] = [r.get('blog7d'), r.get('yt7d'), r.get('ourCount'),
                   r.get('ourSales30'), r.get('score')]

    days[date] = {'ad': ad_spend, 'search': search, 'rich': rich}
    for d in sorted(days)[:-keep]:
        del days[d]
    doc['updatedAt'] = date
    doc['keywordCount'] = len(search)
    return doc


def series(doc, keyword, field):
    """한 키워드의 한 지표를 [(날짜, 값)] 로. 리드-래그 측정은 여기서 시작한다.
    field='search' 면 풀 전체 트랙, 'ad' 면 그날 광고비, 나머지는 rich 트랙."""
    out = []
    for d in sorted(doc.get('days', {})):
        day = doc['days'][d]
        if field == 'search':
            v = (day.get('search') or {}).get(keyword)
        elif field == 'ad':
            v = day.get('ad')
        else:
            try:
                i = doc['fields'].index(field)
            except (KeyError, ValueError):
                return []
            r = (day.get('rich') or {}).get(keyword)
            v = r[i] if r and i < len(r) else None
        if v is not None:
            out.append((d, v))
    return out


def demo():
    pool = {'달항아리': {'hist': {'2026-10-12': 44500, '2026-10-13': 44800}},
            '뱅커스램프': {'hist': {'2026-10-13': 770}}}
    rows = [{'keyword': '달항아리', 'monthlySearch': 44800, 'blog7d': 120, 'yt7d': 8,
             'ourCount': 20, 'ourSales30': 8, 'score': 1820}]
    doc = append(None, '2026-10-13', rows, pool, ad_spend=3505)

    assert doc['keywordCount'] == 2
    assert doc['days']['2026-10-13']['ad'] == 3505
    assert doc['days']['2026-10-13']['rich']['달항아리'] == [120, 8, 20, 8, 1820]
    # 풀에만 있는 키워드도 검색량은 남는다 — 순위가 밀려도 이력이 안 끊기는 핵심
    assert doc['days']['2026-10-13']['search']['뱅커스램프'] == 770
    assert '뱅커스램프' not in doc['days']['2026-10-13']['rich']

    doc = append(doc, '2026-10-14', [], {'달항아리': {'hist': {'2026-10-14': 45000}}}, ad_spend=3600)
    assert series(doc, '달항아리', 'search') == [('2026-10-13', 44800), ('2026-10-14', 45000)]
    assert series(doc, '달항아리', 'blog7d') == [('2026-10-13', 120)]
    assert series(doc, '달항아리', 'ad') == [('2026-10-13', 3505), ('2026-10-14', 3600)]

    import json
    per_day = len(json.dumps(doc['days']['2026-10-13'], ensure_ascii=False))

    # keep 로 자르는지 — append 는 받은 doc 을 그 자리에서 고치므로 크기 측정 뒤에 돌린다
    d2 = append(doc, '2026-10-15', [], pool, keep=2)
    assert sorted(d2['days']) == ['2026-10-14', '2026-10-15'], sorted(d2['days'])
    est = per_day / 2 * 1200 * KEEP / 1e6        # 2키워드 기준 → 1,200키워드 × KEEP일
    print('전부 통과')
    print(f'  하루 2키워드 {per_day}바이트 → 1,200키워드 × {KEEP}일 추정 약 {est:.1f}MB')


if __name__ == '__main__':
    demo()
