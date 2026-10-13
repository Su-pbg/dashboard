# -*- coding: utf-8 -*-
"""풀 키워드에서 브랜드·작가 이름 후보를 뽑는다. **추가 API 호출이 없다.**

왜 이 방식인가 (2026-10-13, 앞선 방식을 실측으로 폐기하고 다시 짰다)
  처음엔 블로그·카페·웹문서·뉴스 **제목에서** 브랜드를 뽑으려 했다. 실제로 돌려보니
  129개 이름 중 브랜드는 LG·디오스·제네시스·GV90 4개뿐이었고(그마저 '오브제'가 LG 가전과
  충돌한 것) 나머지는 '있는'(27개 키워드) · '함께' · '작은' · '맛집' · 'quot' · '안녕하세요'.
  한국어 리빙 블로그 제목은 구어체 산문이라 브랜드가 빈도로 구분되지 않는다.
  불용어를 늘려도 안 된다 — 남는 것도 브랜드가 아니었다. 그 경로는 버렸다.

  대신 **검색광고 연관검색어로 만든 풀 자체**에 브랜드가 이미 들어와 있다.
  다만 혼자 오지 않고 카테고리 단어에 붙어서 온다:
      FLOS조명 · 루이스폴센조명 · 웨지우드접시 · 나그참파인센스 · 허먼밀러조명
  그래서 씨앗·사전·수식어를 떼고 **남는 말**을 세면 그대로 떨어진다.
  실측(풀 1,187개): 잔여 토큰 약 180종 중 진짜 브랜드 15~20개.

판정이 아니라 **소싱 후보 목록**이다. 소재(본차이나·디아섹)·대상(교수님·신생아)이 섞인다.
사람이 한 번 훑는 분량이라 정밀도 100%일 필요가 없다.

한계: 풀에 들어온 것만 보인다(월 300회 미만은 애초에 안 들어온다).
넓히려면 확인된 브랜드를 radar-config.json 의 seeds 에 되먹이면 된다 — 연관검색어가
그 브랜드의 제품군과 경쟁 브랜드를 물어온다. 역시 추가 호출이 없다.

자체 검사:  python3 scripts/market_brands.py
"""
import re
from collections import defaultdict

# 떼어낼 말 — 카테고리·수식어·대상·용도. 씨앗/사전/제외어는 config 에서 받아 여기에 더한다.
GENERIC = set("""
추천 선물 세트 가격 브랜드 종류 사이즈 인기 순위 후기 모음 비교 저렴한 저렴 고급 명품 가성비
모던 심플 미니멀 미니 대형 소형 중형 원형 사각 라운드 led 전구 리빙 집 방 거실 주방 침실 욕실
현관 베란다 사무실 카페 매장 아울렛 백화점 쇼핑몰 파는곳 업체 온라인 대여 할인 프레임
돌잔치 집들이 개업 결혼 생일 기념일 환갑 칠순 생신 어버이날 스승의날 명절 추석 설날 한가위
크리스마스 발렌타인 빼빼로데이 청첩장 예단 답례품 답례 축하 이사 입학 졸업 승진 퇴직 정년퇴직
첫월급 합격기원 주년 백일 신생아 임산부 어린이 유치원 중학생 교수님 선생님 상사 직장상사 회사단체
남자 여자 남친 여친 엄마 아빠 부모님 어머니 아버지 어머님 아버님 할머니 할아버지 와이프 친구
아이 신혼 부부 커플 외국인 기독교
조명 액자 포스터 그림 쿠션 러그 캔들 향 그릇 접시 컵 잔 머그 머그컵 찻잔 트레이 화병 꽃병 수저
수저통 도자기 소품 굿즈 오브제 인테리어 디퓨저 향수 스프레이 스탠드 램프 장식 테이블 의자 소파
쇼파 선반 수납 홀더 스틱 커버 패드 매트 침구 이불 베개 시계 거울 화분 식물 거치대 정리대 건조대
받침 등받이 라이터 파우치 명함케이스 보석함 펜던트 팬던트 플로어 스탠딩 디자인 플레이팅 티라이트
나무 스텐 빈티지 아크릴 라탄 종이 수입 티타늄 알루미늄 세라믹 유리 내열 천연 본차이나 오일파스텔
수채화 유화 가을풍경 해바라기 고양이 매듭 나전칠기 디아섹 워셔블 물빠짐 먼지없는 촉촉한 비정형
전통 한국 한지 유기 자개 옻칠 백자 청자 달항아리 인센스 사이즈별 실내 실외 사진 촬영 북유럽 일본
식탁 화장대 화장실 벽난로 바닥 오븐 에어프라이어 그라탕 비빔밥 영양제 초콜릿 그래놀라 표고버섯
만원 센스있는 간단한 예쁜 이쁜 감성 무선 충전식 휴대용 벽걸이 스마트 할로겐 케이블 공익광고
책상 가구 레일 시세 퇴사 재료 문양 증상 의미 나눔 남편 아내 초등학생 고등학생 대학생
안방 서재 다용도실 제주도 셀프 캔버스 멜라민 워머 귀여운 심플한 따뜻한 시원한 부드러운
원목 대리석 스테인리스 사용법 세척 관리 보관 설치 조립 배송 반품 교환 초등 중등 고등
""".split())

RE_LATIN = re.compile(r'[A-Za-z]{2,}')


def _strip_set(config):
    s = set(GENERIC)
    seeds = (config or {}).get('seeds') or {}
    for k, v in (seeds.items() if isinstance(seeds, dict) else [(x, []) for x in seeds]):
        s.add(k)
        s.update(v or [])
    s.update((config or {}).get('lexicon') or [])
    s.update((config or {}).get('exclude') or [])
    # 띄어쓴 씨앗('리빙 오브제')은 조각으로도 떼야 한다
    for w in list(s):
        for part in re.split(r'\s+', w):
            if len(part) >= 2:
                s.add(part)
    return sorted({w for w in s if len(w) >= 2}, key=len, reverse=True)


def _vol(entry):
    h = (entry or {}).get('hist') or {}
    return max(h.values()) if h else 0


def brand_candidates(pool, config, products=None, top=120, min_len=2):
    """pool: keyword-pool.json 의 keywords. config: radar-config.json.
    products: product-snapshot.json 의 products (우리가 이미 가진 이름인지 표시용).
    반환: [{name, search, keywordCount, keywords, latin, ours}] — 검색량 내림차순."""
    strip = _strip_set(config)
    ours_text = ' '.join((p.get('name') or '') for p in (products or [])).lower()

    agg = defaultdict(lambda: {'search': 0, 'keywords': []})
    for k, e in (pool or {}).items():
        s = re.sub(r'\s+', '', k)
        for g in strip:
            s = s.replace(g, '|')
        for part in re.split(r'[|\d]+', s):
            part = part.strip()
            if len(part) < min_len or part.lower() in GENERIC:
                continue
            a = agg[part]
            a['search'] = max(a['search'], _vol(e))
            a['keywords'].append(k)

    out = [{'name': n, 'search': v['search'], 'keywordCount': len(v['keywords']),
            'keywords': sorted(v['keywords'])[:8],
            'latin': bool(RE_LATIN.search(n)),
            # ponytail: 상품명 부분일치. 2자 한글은 9,317개 중 아무데나 걸려 전부 True 가 되므로
            #   3자 이상 또는 로마자일 때만 본다. 정확히 하려면 상품 브랜드 필드가 필요하다.
            'ours': (len(n) >= 3 or RE_LATIN.fullmatch(n) is not None) and n.lower() in ours_text}
           for n, v in agg.items()]
    out.sort(key=lambda x: -x['search'])
    return out[:top]


def demo():
    cfg = {'seeds': {'조명': ['무드등', '스탠드조명'], '테이블웨어': ['접시', '그릇']},
           'lexicon': ['오브제', '소품'], 'exclude': ['도매']}
    pool = {
        'FLOS조명':      {'hist': {'2026-10-13': 880}},
        '루이스폴센조명':   {'hist': {'2026-10-13': 3960}},
        '웨지우드접시':     {'hist': {'2026-10-13': 3020}},
        '스탠드조명추천':   {'hist': {'2026-10-13': 5000}},
        '2단트레이':      {'hist': {'2026-10-13': 900}},
        '빈티지오브제':     {'hist': {'2026-10-13': 2050}},
    }
    got = {b['name']: b for b in brand_candidates(pool, cfg)}
    for want in ('FLOS', '루이스폴센', '웨지우드'):
        assert want in got, (want, sorted(got))
    for junk in ('추천', '빈티지', '트레이', '조명', '접시'):
        assert junk not in got, (junk, sorted(got))
    assert got['FLOS']['latin'] and not got['루이스폴센']['latin']
    assert got['루이스폴센']['search'] == 3960

    # 우리가 가진 브랜드는 표시된다
    got2 = {b['name']: b for b in brand_candidates(pool, cfg, products=[{'name': 'FLOS IC Lights T'}])}
    assert got2['FLOS']['ours'] and not got2['웨지우드']['ours']
    print('market_brands 자체검사 통과')


if __name__ == '__main__':
    demo()
