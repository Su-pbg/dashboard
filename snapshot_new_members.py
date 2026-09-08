#!/usr/bin/env python3
"""
cafe24 회원 가입자 수를 날짜별로 집계해 revenue-daily.json 에 채운다.

[이 파일이 다시 쓰여진 이유]
2026-07-30 개편 이후 이 잡이 한 번도 돌지 않아 2026-08-01 ~ 09-07 회원 데이터가
38일간 통째로 비었다. 그런데 아무 데서도 에러가 나지 않아 월간 분석 때까지 아무도 몰랐다.
그래서 이 버전은 "조용히 실패하지 않는 것"을 최우선으로 한다:
  - 값을 못 구하면 예외를 던지고 exit 1 → Actions 가 빨간 X 로 남는다
  - 부분 성공도 실패로 본다 (반쪽짜리 데이터가 정상처럼 보이는 게 제일 위험)
  - 추정값을 절대 쓰지 않는다. 모르는 건 비워 둔다

[환경변수]
  필수: MALL_ID, CLIENT_ID, CLIENT_SECRET, GIST_ID, GIST_TOKEN
  선택: REVENUE_PATH   (기본 dashboard/revenue-daily.json)
        LOOKBACK_DAYS  (기본 14 — 매일 최근 14일을 재집계해 과거 오류를 자동 교정)
        BACKFILL_FROM  (예: 2026-08-01 — 이 날짜부터 어제까지 전부 다시 집계)
"""
import os, sys, json, base64, urllib.request, urllib.error, urllib.parse
from datetime import date, timedelta, datetime, timezone

MALL_ID       = os.environ.get('MALL_ID', 'printbakery')
CLIENT_ID     = os.environ['CLIENT_ID']
CLIENT_SECRET = os.environ['CLIENT_SECRET']
GIST_ID       = os.environ['GIST_ID']
GIST_TOKEN    = os.environ['GIST_TOKEN']
REVENUE_PATH  = os.environ.get('REVENUE_PATH', 'dashboard/revenue-daily.json')
LOOKBACK_DAYS = int(os.environ.get('LOOKBACK_DAYS', '14'))
BACKFILL_FROM = (os.environ.get('BACKFILL_FROM') or '').strip()
API_VERSION   = os.environ.get('CAFE24_API_VERSION', '2024-06-01')
BASE          = f'https://{MALL_ID}.cafe24api.com'

# cafe24 는 인식 못 하는 쿼리 파라미터를 에러 없이 무시한다. 파라미터명이 틀리면
# "가입일 필터"가 사라져 전체 회원 목록이 돌아오고, offset 상한(8000) 때문에
# 최근 가입자에는 영영 도달하지 못한다. 그래서 후보를 실제로 때려보고 검증한다.
DATE_PARAMS = [
    ('created_start_date', 'created_end_date'),
    ('start_date',         'end_date'),
    ('join_date_start',    'join_date_end'),
]
PAGE_LIMIT  = 100    # cafe24 상한
OFFSET_MAX  = 8000   # cafe24 상한


class Fail(Exception):
    pass


def http(url, headers=None, data=None, method=None):
    r = urllib.request.Request(url, data=data, method=method)
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=40) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8', 'replace') or '{}')
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')
        try:
            body = json.loads(body)
        except Exception:
            pass
        return e.code, body
    except Exception as e:
        raise Fail(f'요청 실패 {url}: {e}')


# ── Gist 에 보관된 refresh token 읽기/쓰기 ────────────────────────────
GIST_HEADERS = {'Authorization': f'token {GIST_TOKEN}',
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'pbg-snapshot-new-members'}

def gist_load():
    st, body = http(f'https://api.github.com/gists/{GIST_ID}', GIST_HEADERS)
    if st != 200:
        raise Fail(f'Gist 읽기 실패({st}) — GIST_ID / GIST_TOKEN(gist 권한) 확인')
    for fname, f in (body.get('files') or {}).items():
        try:
            j = json.loads(f.get('content') or '')
        except Exception:
            continue
        if j.get('refresh_token'):
            return fname, j
    raise Fail('Gist 안에 refresh_token 을 못 찾음')

def gist_save(fname, payload):
    data = json.dumps({'files': {fname: {'content': json.dumps(payload, indent=2)}}}).encode()
    st, _ = http(f'https://api.github.com/gists/{GIST_ID}', GIST_HEADERS, data=data, method='PATCH')
    if st != 200:
        raise Fail(f'Gist 저장 실패({st}) — 새 refresh token 을 못 남겼다. 다음 실행이 반드시 깨진다')


# ── 토큰 ──────────────────────────────────────────────────────────────
def get_token():
    fname, payload = gist_load()
    basic = base64.b64encode(f'{CLIENT_ID}:{CLIENT_SECRET}'.encode()).decode()
    st, body = http(f'{BASE}/api/v2/oauth/token',
                    {'Authorization': f'Basic {basic}',
                     'Content-Type': 'application/x-www-form-urlencoded'},
                    data=urllib.parse.urlencode({
                        'grant_type': 'refresh_token',
                        'refresh_token': payload['refresh_token']}).encode())
    if st != 200:
        raise Fail(f'토큰 발급 실패({st}): {body}')

    scopes = body.get('scopes') or []
    if 'mall.read_customer' not in scopes:
        raise Fail('앱에 회원 읽기 권한(mall.read_customer)이 없다. '
                   f'현재 scope: {", ".join(scopes) or "(없음)"}')

    # refresh token 은 1회용이라 받자마자 저장한다. 여기서 실패하면 다음 실행이 깨지므로
    # 집계보다 먼저 처리한다.
    payload['refresh_token'] = body['refresh_token']
    payload['updated_at'] = datetime.now(timezone.utc).isoformat()
    gist_save(fname, payload)
    print('[ok] 토큰 발급 + refresh token 회전 저장 완료')
    return body['access_token']


def api_headers(tok):
    return {'Authorization': f'Bearer {tok}',
            'Content-Type': 'application/json',
            'X-Cafe24-Api-Version': API_VERSION}


def joined_on(c):
    """응답에서 가입일(YYYY-MM-DD)만 뽑는다. 몰마다 필드명이 조금씩 다르다."""
    for k in ('created_date', 'join_date', 'member_join_date'):
        v = c.get(k)
        if v:
            return str(v)[:10]
    return ''


# ── 날짜 파라미터 자동 판별 ───────────────────────────────────────────
def resolve_date_params(tok, probe_day):
    """가입일 필터가 '실제로 먹는' 파라미터명을 찾는다. 못 찾으면 실패로 끝낸다."""
    # 비교 기준: 필터 없이 첫 페이지
    st, body = http(f'{BASE}/api/v2/admin/customers?limit={PAGE_LIMIT}', api_headers(tok))
    if st != 200:
        raise Fail(f'/admin/customers 접근 실패({st}): {body}')
    unfiltered = {c.get('member_id') for c in (body.get('customers') or [])}

    for ps, pe in DATE_PARAMS:
        q = urllib.parse.urlencode({ps: probe_day, pe: probe_day, 'limit': PAGE_LIMIT})
        st, body = http(f'{BASE}/api/v2/admin/customers?{q}', api_headers(tok))
        if st != 200:
            print(f'[--] {ps}/{pe}: HTTP {st}')
            continue
        rows = body.get('customers') or []
        ids = {c.get('member_id') for c in rows}
        if unfiltered and ids == unfiltered:
            print(f'[--] {ps}/{pe}: 필터 없는 결과와 동일 → 무시되는 파라미터')
            continue
        dates = [joined_on(c) for c in rows]
        if rows and all(d == probe_day for d in dates):
            print(f'[ok] 가입일 필터 파라미터 = {ps}/{pe}')
            return ps, pe
        if not rows:
            # 그날 가입자가 0명일 수도 있으니 확답은 못 한다. 다음 후보를 먼저 본다.
            print(f'[--] {ps}/{pe}: 0건 (판정 보류)')
            continue
        print(f'[--] {ps}/{pe}: 범위 밖 데이터 섞임 {dates[:3]}')

    raise Fail('가입일 필터로 쓸 수 있는 파라미터를 찾지 못했다. '
               '필터 없이 조회하면 offset 상한(8000) 때문에 최근 가입자에 도달할 수 없으므로 중단한다. '
               'cafe24 API 문서에서 customers 목록의 가입일 파라미터명을 확인하고 DATE_PARAMS 에 추가할 것.')


# ── 집계 ──────────────────────────────────────────────────────────────
def count_by_day(tok, ps, pe, d_from, d_to):
    counts = {}
    offset = 0
    while True:
        if offset > OFFSET_MAX:
            raise Fail(f'offset 상한({OFFSET_MAX}) 초과 — 조회 범위를 좁혀야 한다 '
                       f'({d_from}~{d_to})')
        q = urllib.parse.urlencode({ps: d_from, pe: d_to,
                                    'limit': PAGE_LIMIT, 'offset': offset})
        st, body = http(f'{BASE}/api/v2/admin/customers?{q}', api_headers(tok))
        if st != 200:
            raise Fail(f'회원 목록 조회 실패({st}) offset={offset}: {body}')
        rows = body.get('customers') or []
        for c in rows:
            d = joined_on(c)
            # 필터를 믿지 않고 응답의 가입일로 한 번 더 거른다
            if d and d_from <= d <= d_to:
                counts[d] = counts.get(d, 0) + 1
        if len(rows) < PAGE_LIMIT:
            break
        offset += PAGE_LIMIT
    return counts


def total_members(tok):
    st, body = http(f'{BASE}/api/v2/admin/customers/count', api_headers(tok))
    if st != 200 or not isinstance(body, dict) or body.get('count') is None:
        print(f'[--] 총 회원 수 조회 실패({st}) — totalMembers 는 건드리지 않는다')
        return None
    return int(body['count'])


# ── revenue-daily.json 병합 ───────────────────────────────────────────
def merge(counts, total, d_from, d_to):
    if not os.path.exists(REVENUE_PATH):
        raise Fail(f'{REVENUE_PATH} 가 없다 — dashboard 레포 체크아웃 경로를 확인할 것')
    with open(REVENUE_PATH, encoding='utf-8') as f:
        doc = json.load(f)
    daily = doc.get('daily') or []
    by_date = {r['date']: r for r in daily}

    yesterday = str(date.today() - timedelta(days=1))
    wrote = 0
    missing_rows = []
    for d in sorted(counts | {k: 0 for k in _daterange(d_from, d_to)}):
        row = by_date.get(d)
        if row is None:
            missing_rows.append(d)
            continue
        row['newMembers'] = counts.get(d, 0)
        wrote += 1
    # 총 회원 수는 "지금" 시점의 값이라 어제 행에만 기록한다. 과거는 추정하지 않는다.
    if total is not None and yesterday in by_date:
        by_date[yesterday]['totalMembers'] = total

    if missing_rows:
        print(f'[--] 매출 행이 아직 없어 건너뛴 날짜 {len(missing_rows)}개: {missing_rows[:5]}...')
    if wrote == 0:
        raise Fail('한 건도 기록하지 못했다')

    doc['daily'] = sorted(daily, key=lambda r: r['date'])
    with open(REVENUE_PATH, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False)
    print(f'[ok] {wrote}일치 newMembers 기록'
          + (f' · totalMembers({yesterday}) = {total:,}' if total is not None else ''))


def _daterange(a, b):
    d0, d1 = date.fromisoformat(a), date.fromisoformat(b)
    while d0 <= d1:
        yield str(d0)
        d0 += timedelta(days=1)


def main():
    yesterday = date.today() - timedelta(days=1)
    d_to = str(yesterday)
    d_from = BACKFILL_FROM or str(yesterday - timedelta(days=LOOKBACK_DAYS - 1))
    if d_from > d_to:
        raise Fail(f'기간이 뒤집혔다: {d_from} ~ {d_to}')
    print(f'[..] 집계 기간 {d_from} ~ {d_to}')

    tok = get_token()
    ps, pe = resolve_date_params(tok, d_to)

    # 범위가 넓으면 offset 벽에 걸릴 수 있으니 31일씩 끊어서 조회한다
    counts = {}
    chunk_start = date.fromisoformat(d_from)
    end = date.fromisoformat(d_to)
    while chunk_start <= end:
        chunk_end = min(chunk_start + timedelta(days=30), end)
        counts.update(count_by_day(tok, ps, pe, str(chunk_start), str(chunk_end)))
        chunk_start = chunk_end + timedelta(days=1)

    got = sum(counts.values())
    print(f'[ok] 신규 가입 {got:,}명 / {len(counts)}일')
    if got == 0:
        raise Fail('기간 전체에서 신규 가입이 0명으로 나왔다. '
                   '실제로 0일 리는 없으므로 필터가 잘못 먹은 것으로 보고 중단한다')

    merge(counts, total_members(tok), d_from, d_to)


if __name__ == '__main__':
    try:
        main()
    except Fail as e:
        print(f'\n[FAIL] {e}', file=sys.stderr)
        sys.exit(1)
    except KeyError as e:
        print(f'\n[FAIL] 환경변수 {e} 가 비어 있다', file=sys.stderr)
        sys.exit(1)
