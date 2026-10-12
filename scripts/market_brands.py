# -*- coding: utf-8 -*-
"""검색 결과 제목에서 '시장에서 같이 자주 나오는 이름'(브랜드·작가·몰)을 뽑는다.

왜 필요한가: 네이버 쇼핑 검색 API 가 2026-07-31 에 종료돼(유예 없음, 대체 없음)
키워드별 시장 상품·브랜드를 받을 길이 없다. 그런데 블로그·카페·유튜브 검색은
살아 있고 slackbot 이 이미 매일 부르고 있다 — 다만 **개수만 세고 제목은 버린다.**
그 제목에 브랜드가 들어 있다. 호출을 더 하지 않으므로 키도 쿼터도 추가로 안 든다.

어디서 도나: 이 파일은 참고 구현이다. 실제로는 slackbot 의 trend_metrics.py 에
복사해 넣고 build_keyword_radar.py 에서 부른다 (아래 '붙이는 법').

판정이 아니라 단서다. 작가명·몰 이름·일반어가 섞일 수 있으니 화면에도
'같이 자주 나오는 이름' 으로 보여줄 것.

붙이는 법 (slackbot):
  1) trend_metrics.py — naver_blog_7d 가 제목도 돌려주게
       fresh = [it for it in items if (it.get('postdate') or '') >= since]
       count += len(fresh)
       titles += [f"{it.get('title','')} {it.get('description','')}" for it in fresh]
       ...
       return count, titles
  2) trend_metrics.py — youtube_7d 는 part 를 id → snippet 으로
       params={"key": YT_KEY, "part": "snippet", ...}
       titles = [it['snippet']['title'] for it in r.json().get('items', [])]
  3) build_keyword_radar.py
       row['marketBrands'] = extract(blog_titles + yt_titles, k)
  4) searchad_volume() 이 받는 r.json()['keywordList'] 의 relKeyword 를 버리지 말고
       rel = [row['relKeyword'] for row in r.json().get('keywordList', [])]
     로 모아 두었다가
       row['relBrands'] = from_rel_keywords(rel, k)
     연관어는 호출을 더 하지 않는다 — 이미 풀 확장에 쓰고 버리는 값이다.

자체 검사:  python3 scripts/market_brands.py
"""
import re
from collections import Counter

# 브랜드가 아닌 말. 리빙·공예 블로그에 흔한 일반어 + 협찬 글 상용구.
STOP = set("""추천 후기 내돈내산 리뷰 비교 정리 솔직 사용기 언박싱 구매 가격 최저가 할인 세일
브이로그 일상 집들이 선물 인테리어 소품 꾸미기 데일리 추천템 아이템 모음 베스트 top 신상
진짜 완전 너무 정말 그냥 요즘 올해 이번 한번 하기 좋은 예쁜 이쁜 괜찮은 쓰는 사는 산
홈카페 홈파티 집꾸미기 오늘 어제 가성비 득템 세트 시리즈 공식 정품 무료배송 당일발송
vs VS ft FT with and the for 광고 협찬 체험단 내돈 구입 개봉 세팅 사용 설치 제품 상품
스타일링 코디 활용 후기글 솔직후기 느낌 분위기 감성 인기 요즘핫한 나만의""".split())

# 29CM·W컨셉처럼 숫자·영문·한글이 섞인 브랜드도 한 덩어리로 잡는다
RE_TOKEN = re.compile(r"\d{0,3}[A-Za-z][A-Za-z0-9&'\-\.]{1,19}|[A-Za-z]?[가-힣]{2,10}\d{0,2}")
RE_TAG = re.compile(r'<[^>]+>')
# 조사를 안 떼면 '오늘의집' 과 '오늘의집에서' 가 다른 이름으로 세어져 둘 다 문턱을 못 넘는다.
# 여러 글자 조사만 뗀다(한 글자는 브랜드 끝글자를 깎을 위험이 크다). 남는 줄기가 2자 이상일 때만.
JOSA = ('에서는', '에서도', '으로는', '이랑은', '에서', '에게', '으로', '이랑', '부터', '까지',
        '에는', '에도', '하고', '라고', '처럼', '보다', '마다', '밖에')
RE_BRACKET = re.compile(r'[\[\(]\s*([^\]\)]{2,20})\s*[\]\)]')   # "[브랜드] 상품명" 패턴


def strip_josa(w):
    for j in JOSA:
        if w.endswith(j) and len(w) - len(j) >= 2:
            return w[:-len(j)]
    return w


def extract(titles, keyword, top=8, min_docs=2, max_share=0.6):
    """titles: 블로그/유튜브 제목(+설명) 문자열 목록. keyword: 그 검색어.
    반환: [{name, docs, share, bracket}] — docs 는 '몇 개의 글에 나왔나'(문서빈도)."""
    kw = re.sub(r'\s+', '', keyword or '')
    docs, bracket = [], Counter()
    for t in titles or []:
        t = RE_TAG.sub(' ', t or '')
        for b in RE_BRACKET.findall(t):
            b = re.sub(r'\s+', '', b)
            if b and b not in STOP and (not kw or kw not in b):
                bracket[b] += 1
        toks = {strip_josa(w) for w in RE_TOKEN.findall(t)}
        docs.append({w for w in toks
                     if w.lower() not in STOP and w not in STOP
                     and (not kw or (kw not in w and w not in kw))})

    df = Counter()                      # 한 글에서 여러 번 나와도 1 — 제목 반복에 안 속는다
    for d in docs:
        for w in d:
            df[w] += 1
    n = max(len(docs), 1)
    out = []
    for w, c in df.most_common(80):
        if c < min_docs:
            break
        if c / n > max_share:           # 거의 모든 글에 나오면 브랜드가 아니라 일반어다
            continue
        out.append({'name': w, 'docs': c, 'share': round(c / n, 2), 'bracket': bracket.get(w, 0)})
    # 대괄호 안에 있던 건 브랜드일 확률이 높다 → 가산
    out.sort(key=lambda x: (-(x['docs'] + x['bracket'] * 2), x['name']))
    return out[:top]


def from_rel_keywords(rel, keyword, top=8, min_hits=2):
    """검색광고 연관검색어(relKeyword)에서 브랜드 후보를 뽑는다.
    연관어는 '마리몬드디퓨저' '디퓨저추천' 처럼 씨앗이 붙어 오므로, 씨앗을 떼어낸 나머지를 본다.
    제목과 달리 문장이 아니라 덩어리라 문서빈도 대신 '몇 개의 연관어에 나왔나' 로 센다."""
    kw = re.sub(r'\s+', '', keyword or '')
    cnt = Counter()
    for r in rel or []:
        t = re.sub(r'\s+', '', str(r or ''))
        if not t or t == kw:
            continue
        rest = t.replace(kw, ' ') if kw and kw in t else t
        for w in RE_TOKEN.findall(rest):
            w = strip_josa(w)
            if len(w) < 2 or w in STOP or w.lower() in STOP:
                continue
            if kw and (w in kw or kw in w):
                continue
            cnt[w] += 1
    out = [{'name': w, 'hits': c} for w, c in cnt.most_common(40) if c >= min_hits]
    return out[:top]


def demo():
    sample = [
        "[마리몬드] 인센스홀더 추천 내돈내산 후기",
        "집들이 선물로 좋은 인센스홀더 BEST 5 - 마리몬드, 그릿시즌 비교",
        "그릿시즌 인센스홀더 솔직 리뷰 (ft. 오늘의집 구매)",
        "오늘의집에서 산 인센스홀더 3종 비교 / 마리몬드 vs 챕터원",
        "챕터원 인센스홀더 언박싱, 가격 할인 정보",
        "인센스홀더 추천 | 무신사 vs 29CM 가격비교",
        "[29CM] 인센스홀더 세일 소식",
        "요즘 유행하는 인센스홀더 인테리어 - 챕터원 신상",
    ]
    got = extract(sample, "인센스홀더")
    names = [g['name'] for g in got]
    assert '마리몬드' in names, names
    assert '챕터원' in names, names
    assert '29CM' in names, names            # 숫자로 시작하는 브랜드가 잘리지 않는다
    assert '오늘의집' in names, names          # 경쟁 채널도 같이 잡힌다
    assert 'vs' not in names and 'CM' not in names, names
    assert '인센스홀더' not in names, names     # 검색어 자신은 빠진다
    # 한 글에만 나온 이름은 안 올라온다
    assert all(g['docs'] >= 2 for g in got), got

    # 검색광고 연관어에서도 뽑힌다 (씨앗이 붙어 오는 덩어리 형태)
    rel = ['디퓨저추천', '마리몬드디퓨저', '마리몬드디퓨저추천', '챕터원디퓨저',
           '디퓨저선물', '마리몬드', '논픽션디퓨저', '논픽션디퓨저추천', '디퓨저가격']
    names2 = [r['name'] for r in from_rel_keywords(rel, '디퓨저')]
    assert '마리몬드' in names2, names2
    assert '논픽션' in names2, names2
    assert '디퓨저' not in names2, names2       # 씨앗은 빠진다
    assert '추천' not in names2, names2         # 일반어는 빠진다
    # 조사가 떨어져 '오늘의집' 과 '오늘의집에서' 가 한 이름으로 합쳐진다
    assert strip_josa('오늘의집에서') == '오늘의집'
    assert strip_josa('마리몬드') == '마리몬드'      # 브랜드는 안 깎는다
    assert strip_josa('에서') == '에서'              # 줄기가 2자 미만이면 그대로
    print('전부 통과')
    print('  [연관어]', ', '.join(f"{r['name']}({r['hits']})" for r in from_rel_keywords(rel, '디퓨저')))
    for g in got:
        print(f"  {g['name']:<12} 글 {g['docs']}개 ({int(g['share']*100)}%) 대괄호 {g['bracket']}")


if __name__ == '__main__':
    demo()
