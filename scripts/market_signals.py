# -*- coding: utf-8 -*-
"""시장에서 도는 브랜드를 외부 검색 결과에서 뽑는다.

왜: 네이버 쇼핑 검색 API 가 2026-07-31 종료(유예 없음·대체 없음)라 키워드별 시장 상품·브랜드를
받을 길이 없다. 대신 **이미 키가 있는 HUB 검색 API** 로 글 제목을 받아 거기서 이름을 줍는다.

쓰는 경로 (전부 X-NCP-APIGW-* 헤더, HUB = https://naverapihub.apigw.ntruss.com)
  /search/v1/blog         블로그      ← 이미 호출 중(개수만 세고 제목은 버리고 있었다)
  /search/v1/cafearticle  카페        ← 〃
  /search/v1/webkr        웹문서      ◀ 안 쓰던 것
  /search/v1/news         뉴스        ◀ 안 쓰던 것
  + 검색광고 relKeyword(연관검색어)   ◀ 풀 확장에만 쓰고 버리던 것

한도 여유: 블로그 당월 3,063 / 775,000 (0.4%). 네 경로를 다 써도 넉넉하다.

slackbot 붙이는 법 (두 줄):
    from market_signals import market_brands          # 이 파일을 같은 폴더에 둔다
    row['marketBrands'] = market_brands(k, tm.HUB_ID, tm.HUB_KEY, rel=rel_keywords_for_k)

자체 검사:  python3 scripts/market_signals.py
"""
import re
import time
from collections import Counter

try:                      # slackbot 에선 requests 가 있다. 없으면 표준 라이브러리로 돈다.
    import requests
except ImportError:
    requests = None

from market_brands import extract, from_rel_keywords, RE_TAG   # 추출·불용어는 한 군데서 관리

HUB = 'https://naverapihub.apigw.ntruss.com'
KINDS = ('blog', 'cafearticle', 'webkr', 'news')


def _get(url, headers, params, timeout=20):
    if requests is not None:
        return requests.get(url, headers=headers, params=params, timeout=timeout).json()
    import json as _j, urllib.parse, urllib.request
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request(f'{url}?{q}', headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return _j.loads(r.read())


def fetch_titles(kind, keyword, hub_id, hub_key, display=30, sort='date'):
    """한 경로에서 제목+설명 문자열 목록. 실패하면 빈 목록(레이더 전체를 멈추지 않는다)."""
    if not (hub_id and hub_key):
        return []
    try:
        j = _get(f'{HUB}/search/v1/{kind}',
                 {'X-NCP-APIGW-API-KEY-ID': hub_id, 'X-NCP-APIGW-API-KEY': hub_key},
                 {'query': keyword, 'display': display, 'sort': sort})
    except Exception as e:
        print(f'[market_signals] {kind} 실패: {e}')
        return []
    out = []
    for it in (j.get('items') or []):
        t = f"{it.get('title', '')} {it.get('description', '')}"
        out.append(RE_TAG.sub(' ', t))
    return out


def market_brands(keyword, hub_id, hub_key, rel=None, kinds=KINDS, top=8, pause=0.1):
    """키워드 하나에 대해 '시장에서 같이 도는 이름' 을 돌려준다.

    반환: {'brands': [{name, docs, share, bracket}], 'rel': [{name, hits}], 'sources': {kind: 글수}}
    판정이 아니라 단서다 — 작가명·몰 이름·일반어가 섞일 수 있다."""
    titles, sources = [], {}
    for kind in kinds:
        t = fetch_titles(kind, keyword, hub_id, hub_key)
        sources[kind] = len(t)
        titles += t
        if pause:
            time.sleep(pause)
    return {
        'brands': extract(titles, keyword, top=top),
        'rel': from_rel_keywords(rel or [], keyword, top=top),
        'sources': sources,
    }


def demo():
    # 키 없이도 돌아가는지 + 추출 경로가 이어지는지만 본다(네트워크 호출 없음)
    assert fetch_titles('blog', '디퓨저', None, None) == []
    r = market_brands('디퓨저', None, None,
                      rel=['마리몬드디퓨저', '마리몬드디퓨저추천', '논픽션디퓨저', '논픽션디퓨저가격', '디퓨저추천'])
    assert r['sources'] == {k: 0 for k in KINDS}, r['sources']
    names = [x['name'] for x in r['rel']]
    assert '마리몬드' in names and '논픽션' in names, names
    assert '디퓨저' not in names and '추천' not in names, names
    print('전부 통과 (키 없이 — 네트워크 호출 없음)')
    print('  연관어에서:', ', '.join(f"{x['name']}({x['hits']})" for x in r['rel']))
    print('  경로:', ' · '.join(KINDS))


if __name__ == '__main__':
    demo()
