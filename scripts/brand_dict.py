# -*- coding: utf-8 -*-
"""브랜드 사전을 **우리가 이미 쓰는 API 로** 만든다. 추가 키도 비용도 없다.

왜 이게 답인가 (2026-10-19, 네 번째 시도)
  앞선 세 번은 전부 '어떤 글뭉치에서 브랜드를 골라내기'였고 전부 실패했다:
    블로그·뉴스 제목      산문이라 빈도로 안 갈린다            129개 중 브랜드 4개
    유튜브 snippet.tags   토큰이지만 SEO 검색어다              8개 중 브랜드 0개
    연관검색어 잔여        대부분 수식어다                     페르시안·장모님·달마도
  공통 원인은 하나다 — **고유명사와 일반명사를 가를 사전이 없다.**
  그래서 사전을 사오려 했는데 시장에 공짜 카탈로그가 안 남아 있었다:
    네이버 쇼핑 검색 2026-07-31 종료 · 구글 CSE 신규 가입 불가(2027-01-01 종료) ·
    Bing 2025-08 종료 · Brave 2026-02 무료 폐지 · 오늘의집/아이디어스 robots 금지.

  **사오지 말고 만들면 된다.** 네이버 검색광고 키워드도구는 아무 질의나 받고 연관검색어를
  돌려준다. 지금까지 `조명` 으로 물어서 조명 키워드를 받았을 뿐이다.
  **`조명브랜드` 로 물으면 브랜드 이름이 온다** — 그 말과 같이 검색되는 게 브랜드명이니까.
  질의 설계를 바꾸는 것뿐이라 키도 쿼터도 그대로다(하루 3회 추가 호출).

  이렇게 모은 이름은 '추측'이 아니다. **'브랜드' 질의의 연관검색어로 들어왔다**는 근거가 있다.

사전은 쌓인다(`brand-dictionary.json`). 하루에 질의 15개씩 돌려 쓰므로 날이 갈수록 넓어진다.

자체 검사:  python3 scripts/brand_dict.py
"""
import re

from market_brands import GENERIC, _strip_set

# '<말>브랜드' 로 물으면 그 분야 브랜드가 연관검색어로 온다. 뒤에 붙이는 꼬리들.
SUFFIXES = ['브랜드', '브랜드추천', '브랜드순위']
# 씨앗 말고도 넣어두는 상위 질의 — 카테고리를 안 좁혀도 리빙 브랜드가 통으로 온다.
EXTRA = ['리빙브랜드', '인테리어브랜드', '북유럽브랜드', '해외리빙브랜드', '디자인브랜드',
         '수입그릇브랜드', '명품그릇브랜드', '조명브랜드순위', '가구브랜드']
ROTATE = 15                                  # 하루에 돌릴 질의 수 (5개씩 묶여 3회 호출)


# 질의 뼈대는 **카테고리어**여야 한다. 씨앗 값에는 브랜드가 섞여 있어서(되먹임으로 넣었다)
#   그대로 쓰면 '나그참파브랜드'·'기안84그림브랜드' 같은 쓸모없는 질의가 나온다.
#   lexicon(=카테고리 사전) + 테마 이름만 쓰고, 이미 사전에 있는 이름은 뺀다.
def queries(config, day_index=0, rotate=ROTATE, known=()):
    """radar-config 의 카테고리 사전으로 '브랜드' 질의를 만든다. 날마다 돌려써서 넓힌다.

    known: 이미 사전에 있는 브랜드 이름 — '<브랜드>브랜드' 를 또 묻지 않는다."""
    seeds = (config or {}).get('seeds') or {}
    words = [re.sub(r'[^가-힣A-Za-z0-9]', '', t) for t in seeds.keys()]
    words += list((config or {}).get('lexicon') or [])
    known = {re.sub(r'\s+', '', k) for k in (known or ())}
    qs = []
    for w in words:
        w = re.sub(r'\s+', '', w)
        if len(w) < 2 or w in known:
            continue
        qs.append(w + SUFFIXES[0])
    qs += EXTRA
    seen, uniq = set(), []
    for q in qs:                             # 순서 유지 중복 제거
        if q not in seen:
            seen.add(q)
            uniq.append(q)
    if not uniq or rotate <= 0:
        return uniq
    start = (day_index * rotate) % len(uniq)
    out = uniq[start:start + rotate]
    if len(out) < rotate:                    # 끝에서 돌아 앞으로
        out += uniq[:rotate - len(out)]
    return out


# 질의에 붙는 꼬리. 이것만 뗀다.
TAILS = ('브랜드', '추천', '순위', '인기', '비교', '종류', '정리', '모음', '리스트', 'top', '탑')


def _residue(kw, base):
    """연관검색어에서 꼬리를 떼고, 카테고리어를 뗀 형태도 **같이** 낸다.

    사전 전체를 떼면 멀쩡한 이름이 부서진다 — 실측: 도자기→자기, 무드등→무드, 룸스프레이→스프.
    그렇다고 카테고리어를 안 떼면 루이스폴센조명이 그대로 남는다. 반대로 떼면 양키캔들이 양키가 된다.
    그래서 두 형태를 다 낸다. 일반어는 여기서 안 거른다 — 교차 질의 빈도가 거른다(더 정확하고 안 늙는다)."""
    full = re.sub(r'\s+', '', kw or '')
    for t in TAILS:
        full = full.replace(t, '')
    full = re.sub(r'\d+', '', full).strip()
    out = []
    for cand in (full, full.replace(base, '') if base else ''):
        # 둘 다 낸다. 카테고리어를 떼야 잡히는 것(루이스폴센조명→루이스폴센)과
        # 떼면 부서지는 것(양키캔들→양키)이 섞여 있어서 한쪽만 쓸 수 없다.
        cand = cand.strip()
        if len(cand) >= 2 and cand.lower() not in GENERIC and cand not in out:
            out.append(cand)
    return out


def harvest(rel_by_query, config=None):
    """rel_by_query: {질의: [연관검색어…]}. 반환 {이름: {hits, queries:[…]}}.

    **질의는 하나씩 보내야 한다.** 검색광고는 hintKeywords 5개를 묶어 keywordList 하나를
    돌려주므로, 배치로 보내면 그 전체가 5개 질의에 똑같이 붙는다(실측: 그릇/접시/머그브랜드가
    전부 같은 459개였다). 질의별 귀속이 깨지면 아래 교차 빈도 필터가 무의미해진다."""
    out = {}
    for q, rels in (rel_by_query or {}).items():
        base = re.sub(r'\s+', '', q or '')
        for t in TAILS:
            base = base.replace(t, '')
        for kw in rels or []:
            for name in _residue(kw, base):
                e = out.setdefault(name, {'hits': 0, 'queries': set()})
                e['hits'] += 1
                e['queries'].add(q)
    return {k: {'hits': v['hits'], 'queries': sorted(v['queries'])} for k, v in out.items()}


def merge(doc, found, date):
    """사전에 쌓는다. 하루 15질의씩 돌려쓰므로 날이 갈수록 넓어진다."""
    doc = doc or {'brands': {}}
    br = doc.setdefault('brands', {})
    for name, e in (found or {}).items():
        cur = br.setdefault(name, {'firstSeen': date, 'hits': 0, 'queries': [], 'days': 0})
        cur['lastSeen'] = date
        cur['hits'] += e['hits']
        cur['days'] += 1
        cur['queries'] = sorted(set(cur['queries']) | set(e['queries']))[:12]
    doc['updatedAt'] = date
    doc['count'] = len(br)
    return doc


def sourcing(doc, pool=None, products=None, top=120, min_days=1, max_queries=2):
    """사전 × 검색 수요 × 우리 보유 → 소싱 목록.

    쇼핑몰 카탈로그를 못 구해서 사전을 직접 만든 것이므로, 여기가 '브랜드 목록'이다.
    `카테고리에 붙는 말`(market_brands.brand_candidates) 과 섞지 말 것."""
    ours_text = ' '.join((p.get('name') or '') for p in (products or [])).lower()
    out = []
    for name, e in ((doc or {}).get('brands') or {}).items():
        if e.get('days', 1) < min_days:
            continue
        # [2026-10-19] 일반어는 여러 카테고리 질의에 공통으로 뜨고 브랜드는 한두 곳에만 뜬다.
        #   실측: 용기·사이트·호텔·판매·수제·핸드메이드는 그릇·캔들·디퓨저에 전부 나오고
        #   셀레티·시라쿠스·네스티단테는 한 곳에만 나온다. 불용어 목록보다 정확하고 안 늙는다.
        if len(e.get('queries') or []) > max_queries:
            continue
        n = re.sub(r'\s+', '', name).lower()
        hits = [k for k in (pool or {}) if n in re.sub(r'\s+', '', k).lower()]
        search = 0
        for k in hits:
            h = (pool[k].get('hist') or {})
            search = max(search, max(h.values()) if h else 0)
        out.append({'name': name, 'hits': e['hits'], 'days': e.get('days', 1),
                    'queries': e.get('queries', [])[:4],
                    'firstSeen': e.get('firstSeen'), 'lastSeen': e.get('lastSeen'),
                    'search': search, 'keywords': sorted(hits)[:5],
                    'ours': len(name) >= 3 and name.lower() in ours_text})
    # 브랜드는 대개 우리 풀에 없다(풀은 카테고리 키워드로 만들어졌다). 검색량 순으로만 세우면
    #   풀에 우연히 걸린 일반어가 위를 먹는다. 질의 수가 적은 쪽(= 더 고유한 쪽)을 먼저 본다.
    out.sort(key=lambda x: (len(x['queries']), -x['search'], -x['hits']))
    return out[:top]


def demo():
    cfg = {'seeds': {'조명': ['무드등', '스탠드조명'], '테이블웨어': ['접시', '그릇']},
           'lexicon': ['오브제', '소품'], 'exclude': ['도매']}

    qs = queries(cfg, day_index=0, rotate=5)
    assert qs[0] == '조명브랜드', qs
    assert '테이블웨어브랜드' in queries(cfg, 0, rotate=99)
    assert queries(cfg, 1, rotate=5) != qs                    # 날마다 돌아간다
    assert len(queries(cfg, 0, rotate=5)) == 5
    # 씨앗 값(브랜드가 섞여 있다)은 질의로 안 쓴다 — '무드등브랜드'·'스탠드조명브랜드' 금지
    assert '무드등브랜드' not in queries(cfg, 0, rotate=99)
    # 이미 아는 브랜드는 또 안 묻는다
    assert '오브제브랜드' not in queries({**cfg, 'lexicon': ['오브제']}, 0, rotate=99, known=['오브제'])

    # 실제로 오는 모양: 브랜드 맨이름 + 카테고리 붙은 변형 + 일반 수식어
    rel = {'조명브랜드': ['루이스폴센', '아르테미데', '무토조명', '조명브랜드추천',
                       '북유럽조명브랜드', '톰딕슨', '조명'],
           '접시브랜드': ['웨지우드', '아스티에드빌라트', '접시브랜드순위', '그릇']}
    got = harvest(rel, cfg)
    for want in ('루이스폴센', '아르테미데', '무토', '톰딕슨', '웨지우드', '아스티에드빌라트'):
        assert want in got, (want, sorted(got))
    for junk in ('조명', '접시', '그릇', '추천', '순위', '브랜드', '북유럽'):
        assert junk not in got, (junk, sorted(got))
    assert got['루이스폴센']['queries'] == ['조명브랜드']

    doc = merge(None, got, '2026-10-19')
    assert doc['count'] == len(got) and doc['brands']['무토']['days'] == 1
    doc = merge(doc, {'무토': {'hits': 2, 'queries': ['리빙브랜드']}}, '2026-10-20')
    assert doc['brands']['무토']['days'] == 2
    assert doc['brands']['무토']['queries'] == ['리빙브랜드', '조명브랜드']
    assert doc['brands']['무토']['firstSeen'] == '2026-10-19'

    pool = {'루이스폴센조명': {'hist': {'2026-10-19': 3960}}, '루이스폴센': {'hist': {'2026-10-19': 10270}}}
    src = sourcing(doc, pool, products=[{'name': '웨지우드 와일드 스트로베리 찻잔'}])
    assert src[0]['name'] == '루이스폴센' and src[0]['search'] == 10270, src[0]
    assert src[0]['ours'] is False
    assert [b for b in src if b['name'] == '웨지우드'][0]['ours'] is True
    print(f'brand_dict 자체검사 통과 — 사전 {doc["count"]}개, 소싱 {len(src)}개')


if __name__ == '__main__':
    demo()
