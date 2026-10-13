# -*- coding: utf-8 -*-
"""레이더 점수·판정 — 키워드 축과 브랜드 축.

[왜 바꾸나 — 2026-10-12 백테스트]
  · 모멘텀은 예측력이 없다. '이번 주 상승 → 다음 주도 상승' 적중률 46%(동전 50%),
    모멘텀 연장 오차 1.94 vs 단순 유지 1.41. 검색량은 평균회귀한다.
    그런데 기존 판정은 growth4w>=0.2 를 '뜨는 중' 으로 보고 소싱·밀기를 결정했다 → 노이즈 추종.
  · 기존 score 는 monthlySearch 와 상관 1.00 이었다. 사실상 볼륨 순 정렬.
    정작 salesPer1kSearch(검색 1천건당 우리 판매)는 상관 0.06 — 전환 효율이 순위에 안 들어갔다.
  · 시즌만 약한 선행 정보가 있다(예고 변화 vs 실제 r=0.30). 단 seasonal=True 로 찍힌 18개는
    오히려 r=0.09 라 그 플래그는 믿지 않는다. seasonIdx 원값을 직접 쓴다.

[그래서]
  score = 수준(검색량) × 효율(전환) × 여지(경쟁) × 시점(시즌)
  모멘텀은 점수에서 빼고 화면 참고값으로만 둔다.

쓰는 법 (slackbot):
    from radar_score import score, decide, season_calendar
    row['score']  = score(row)
    row['action'] = decide(row)
    doc['seasonCalendar'] = season_calendar(rows, month=kst_now().month)
    doc['brands']         = brand_candidates(pool, cfg, products)   # market_brands.py

자체 검사:  python3 scripts/radar_score.py
"""
import math
from collections import defaultdict

MIN_SEARCH = 1000


def _season_factor(row, month, lead=2):
    """앞으로 lead 개월 중 가장 높은 달 ÷ 이번 달. 값이 없으면 1(중립).
    decide() 와 season_calendar() 가 같은 창을 봐야 '달력엔 있는데 판정엔 없는' 어긋남이 안 생긴다."""
    s = row.get('seasonIdx') or []
    if len(s) != 12 or s[month - 1] in (None, 0):
        return 1.0
    cur = s[month - 1]
    best = max((s[(month - 1 + d) % 12] or cur) for d in range(1, lead + 1))
    return max(0.7, min(1.6, best / cur))   # ±60% 안으로 묶는다 — 시즌 신호가 약해서(r=0.30)


def _efficiency(row):
    """검색 1천 건당 우리 판매. 없으면 0.3 으로 둔다(모르는 것과 나쁜 것을 구분)."""
    v = row.get('salesPer1kSearch')
    if v is None:
        ms, sold = row.get('monthlySearch') or 0, row.get('ourSales30') or 0
        v = (sold / ms * 1000) if ms else None
    if v is None:
        return 0.3
    return min(5.0, v)                     # 상위 몇 개가 순위를 독식하지 않게 자른다


def _headroom(row):
    """경쟁 여지. 검색광고 경쟁 정도만 있으므로 그걸 쓴다."""
    return {'낮음': 1.3, '중간': 1.0, '높음': 0.7}.get(row.get('adCompetition'), 1.0)


def score(row, month=None):
    ms = row.get('monthlySearch') or 0
    if ms <= 0:
        return 0
    from datetime import datetime
    m = month or datetime.utcnow().month
    base = math.log10(ms + 1)              # 볼륨은 로그로 — 45,680 이 4,260 을 10배 누르지 않게
    v = base * (0.5 + _efficiency(row)) * _headroom(row) * _season_factor(row, m)
    return round(v * 100)


def decide(row, month=None):
    """모멘텀으로 소싱을 결정하지 않는다. 수요·보유·시즌으로만 가른다."""
    from datetime import datetime
    m = month or datetime.utcnow().month
    ms = row.get('monthlySearch') or 0
    demand = ms >= MIN_SEARCH
    have = (row.get('ourCount') or 0) > 0
    sells = (row.get('ourSales30') or 0) > 0
    sold_out = row.get('ourStatus') == '품절'
    season_soon = _season_factor(row, m) >= 1.25

    eff = _efficiency(row)
    big = ms >= 5000                       # '소싱 검토' 를 아무 키워드에나 붙이지 않는다
    quiet = row.get('adCompetition') in ('낮음', '중간')

    if demand and sold_out:                     return '재고확보'
    if demand and season_soon and have:         return '시즌 준비'
    if demand and season_soon and big:          return '시즌 소싱'
    if demand and have and not sells:           return '안 팔림 점검'
    # '밀기' 는 실제로 잘 파는 것만. 검색 1천건당 0.5개 미만이면 그냥 '유지'.
    if demand and sells and eff >= 0.5:         return '밀기'
    if demand and sells:                        return '유지'
    # '소싱 검토' 는 수요가 크고 경쟁이 빡세지 않은 것만. 나머지는 패스.
    if demand and not have and big and quiet:   return '소싱 검토'
    return '패스'


def season_calendar(rows, month, lead=2):
    """앞으로 `lead` 개월 안에 정점이 오는 것. 예측이 아니라 달력이라 이건 맞는다."""
    out = []
    for r in rows:
        s = r.get('seasonIdx') or []
        if len(s) != 12:
            continue
        for d in range(1, lead + 1):
            mi = (month - 1 + d) % 12
            cur = s[month - 1] or 1
            if cur and s[mi] and s[mi] / cur >= 1.3:
                out.append({'keyword': r.get('keyword'), 'peakMonth': mi + 1, 'inMonths': d,
                            'ratio': round(s[mi] / cur, 2), 'monthlySearch': r.get('monthlySearch'),
                            'ourCount': r.get('ourCount') or 0, 'ourSales30': r.get('ourSales30') or 0})
                break
    return sorted(out, key=lambda x: (x['inMonths'], -x['ratio']))


def demo():
    big_lowconv = {'keyword': '국중박굿즈', 'monthlySearch': 45680, 'ourCount': 0,
                   'ourSales30': 0, 'adCompetition': '높음'}
    mid_highconv = {'keyword': '도자기', 'monthlySearch': 7680, 'ourCount': 435,
                    'ourSales30': 183, 'adCompetition': '중간'}
    assert score(mid_highconv, 10) > score(big_lowconv, 10), (score(mid_highconv, 10), score(big_lowconv, 10))

    assert decide(big_lowconv, 10) == '패스'            # 검색은 크지만 경쟁 '높음' → 소싱 대상 아님
    assert decide({**big_lowconv, 'adCompetition': '중간'}, 10) == '소싱 검토'
    assert decide(mid_highconv, 10) == '밀기'
    assert decide({'monthlySearch': 5000, 'ourCount': 3, 'ourSales30': 0}, 10) == '안 팔림 점검'
    assert decide({'monthlySearch': 5000, 'ourCount': 3, 'ourStatus': '품절'}, 10) == '재고확보'

    idx = [0.8] * 12; idx[10] = 1.8                     # 11월 정점
    assert _season_factor({'seasonIdx': idx}, 10) > 1.25        # 10월에 보면 다음 달이 정점
    assert decide({'monthlySearch': 12240, 'ourCount': 5, 'seasonIdx': idx}, 10) == '시즌 준비'
    cal = season_calendar([{'keyword': '결혼기념일선물', 'seasonIdx': idx, 'monthlySearch': 12240,
                            'ourCount': 5, 'ourSales30': 0}], month=10)
    assert cal and cal[0]['peakMonth'] == 11 and cal[0]['inMonths'] == 1, cal

    print('전부 통과')
    print(f"  점수: 도자기(7,680·전환높음) {score(mid_highconv,10)}  >  국중박굿즈(45,680·전환0) {score(big_lowconv,10)}")


if __name__ == '__main__':
    demo()
