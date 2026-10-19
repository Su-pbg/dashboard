# -*- coding: utf-8 -*-
"""쇼핑몰 상품 제목에서 브랜드를 뽑는다. 구글 Custom Search(CSE)로 읽는다.

왜 이 경로인가 (2026-10-19)
  앞의 두 번은 **브랜드 사전이 없어서** 실패했다:
    블로그·뉴스 제목   산문이라 브랜드가 빈도로 안 갈린다 (129개 중 브랜드 4개)
    유튜브 snippet.tags  태그는 토큰이지만 브랜드가 아니라 SEO 검색어다 (8개 중 브랜드 0개)
    연관검색어 잔여      브랜드도 섞이지만 대부분 수식어다 (페르시안·장모님·달마도·도시락)
  공통 원인: 고유명사와 일반명사를 가를 수단이 없다. **brand 필드가 있는 카탈로그가 답이다.**

  한국 쇼핑 카탈로그 API 는 거의 닫혔다 — 네이버 쇼핑 검색 2026-07-31 종료(대체 없음),
  쿠팡 파트너스·11번가는 안 쓰기로 함, 오늘의집·29CM·텐바이텐은 공개 API 없음.
  남은 깨끗한 길이 **구글 색인을 공식 API 로 읽는 것**이다. 그 사이트를 직접 때리지 않으므로
  약관 문제가 없다.

  상품 제목은 커머스 텍스트라 구조가 일정하다 — 브랜드가 맨 앞에 온다:
    "루이스폴센 PH5 조명 - 오늘의집"  /  "아르테미데 톨로메오 … | 29CM"
  산문도 아니고 SEO 덩어리도 아니라서 앞선 두 실패의 원인이 여기엔 없다.

쿼터: 하루 100쿼리 무료(이후 1,000건당 $5), 쿼리당 10개 결과.
  테마 10개 x 사이트 4개 = 40쿼리/일 → 무료 안.

시크릿: GOOGLE_CSE_KEY · GOOGLE_CSE_CX (GitHub Secret)

자체 검사:  python3 scripts/shop_catalog.py
"""
import os
import re
import time

SITES = ['ohou.se', '29cm.co.kr', '10x10.co.kr', 'idus.com']

# 제목에서 떼어낼 쇼핑몰 꼬리·판촉 문구
RE_TAIL = re.compile(r'\s*[-|–—]\s*(오늘의집|29CM|텐바이텐|10x10|아이디어스|idus)\s*$', re.I)
RE_BRACKET = re.compile(r'[\[\(][^\]\)]{1,20}[\]\)]')     # [무료배송] [단독] …
RE_CLEAN = re.compile(r'[^0-9A-Za-z가-힣&\'\.\- ]')

# 제목 맨 앞에 오지만 브랜드가 아닌 말
HEAD_STOP = set("""
무료배송 단독 특가 세일 신상 best 베스트 기획전 사은품 증정 한정 당일발송 오늘출발 주문제작 맞춤제작
리빙 인테리어 홈데코 데코 소품 조명 가구 패브릭 주방 욕실 침실 거실 테이블웨어 식기 그릇 접시 컵 잔
머그 트레이 러그 쿠션 커튼 조명등 스탠드 램프 디퓨저 캔들 향 오브제 화병 액자 포스터 아트 작품 공예
세트 set 신제품 new 추천 인기 리뷰 할인 쿠폰 적립 이벤트 선물 기프트 gift
""".split())


def search(query, key, cx, site=None, num=10, timeout=20):
    """CSE 한 번. 결과 제목 리스트를 돌려준다. 실패하면 빈 리스트(조용히 넘어간다)."""
    import requests
    if not (key and cx):
        return []
    q = f'{query} site:{site}' if site else query
    try:
        r = requests.get('https://www.googleapis.com/customsearch/v1', timeout=timeout,
                         params={'key': key, 'cx': cx, 'q': q, 'num': num, 'hl': 'ko', 'gl': 'kr'})
    except Exception as e:
        print(f'[CSE] 요청 실패 {type(e).__name__}')
        return []
    if r.status_code != 200:
        print(f'[CSE] status={r.status_code} {r.text[:160]}')
        return []
    time.sleep(0.2)
    return [it.get('title', '') for it in r.json().get('items', [])]


def head_brand(title, strip=()):
    """상품 제목 맨 앞 토큰 = 브랜드. 없으면 None.

    '루이스폴센 PH5 조명 - 오늘의집' → '루이스폴센'
    로마자 두 단어 브랜드('Louis Poulsen'·'Petite Friture')는 붙여서 본다."""
    t = RE_TAIL.sub('', title or '')
    t = RE_BRACKET.sub(' ', t)
    t = RE_CLEAN.sub(' ', t)
    toks = [w for w in t.split() if w]
    if not toks:
        return None
    head = toks[0]
    if head.lower() in HEAD_STOP or head in strip or len(head) < 2 or head.isdigit():
        return None
    # 'Louis Poulsen' · 'Petite Friture' 처럼 로마자 두 단어가 한 브랜드인 경우
    if len(toks) > 1 and len(head) <= 10 and re.fullmatch(r"[A-Za-z&'\.\-]{2,}", head) \
            and re.fullmatch(r"[A-Za-z&'\.\-]{2,}", toks[1]):
        return head + ' ' + toks[1]
    return head


def brands_from_titles(titles, strip=(), min_docs=1):
    """제목 목록 → [{name, docs}]. docs = 그 브랜드로 시작한 상품 수."""
    from collections import Counter
    c = Counter()
    for t in titles or []:
        b = head_brand(t, strip)
        if b:
            c[b] += 1
    return [{'name': n, 'docs': d} for n, d in c.most_common() if d >= min_docs]


def collect(queries, key, cx, sites=SITES, strip=()):
    """queries: 테마/카테고리어 목록. 반환 {브랜드: {docs, queries:[...], sites:[...]}}"""
    out = {}
    for q in queries:
        for s in sites:
            for t in search(q, key, cx, site=s):
                b = head_brand(t, strip)
                if not b:
                    continue
                e = out.setdefault(b, {'docs': 0, 'queries': set(), 'sites': set()})
                e['docs'] += 1
                e['queries'].add(q)
                e['sites'].add(s)
    return {k: {'docs': v['docs'], 'queries': sorted(v['queries']),
                'sites': sorted(v['sites'])} for k, v in out.items()}


def demo():
    assert head_brand('루이스폴센 PH5 조명 - 오늘의집') == '루이스폴센'
    assert head_brand('아르테미데 톨로메오 테이블 램프 | 29CM') == '아르테미데'
    assert head_brand('[무료배송] 웨지우드 와일드 스트로베리 찻잔 - 오늘의집') == '웨지우드'
    assert head_brand('Louis Poulsen PH 5 Pendant') == 'Louis Poulsen'
    assert head_brand('조명 스탠드 북유럽 인테리어 - 오늘의집') is None      # 카테고리어로 시작
    assert head_brand('무료배송 러그 거실 - 텐바이텐') is None
    assert head_brand('') is None
    assert head_brand('2024 캘린더') is None                                # 숫자로 시작

    b = brands_from_titles(['루이스폴센 PH5 - 오늘의집', '루이스폴센 토르보 - 오늘의집',
                            '아르테미데 톨로메오 | 29CM', '조명 추천 - 오늘의집'])
    assert b[0] == {'name': '루이스폴센', 'docs': 2}, b
    assert {'name': '아르테미데', 'docs': 1} in b
    assert len(b) == 2, b                                                   # 카테고리어는 안 센다

    assert search('조명', None, None) == []                                 # 키 없으면 조용히 빈 값
    print('shop_catalog 자체검사 통과')


if __name__ == '__main__':
    demo()
