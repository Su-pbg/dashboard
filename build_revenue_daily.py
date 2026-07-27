"""
최근 90일치 매출을 날짜별로 집계해 revenue-daily.json으로 저장.
report.py와 동일한 Gist 기반 refresh_token 인증을 재사용.
필요한 환경변수(Secrets): GIST_ID, GH_PAT, MALL_ID, CLIENT_ID, CLIENT_SECRET
대시보드 레포(Su-pbg/dashboard)의 GitHub Actions Secrets에도 동일하게 등록 필요.
"""
import requests
import os
import json
import time
from datetime import datetime, timedelta

DAYS_BACK = 90


def get_access_token():
    gist_id = os.environ.get('GIST_ID')
    gh_pat = os.environ.get('GH_PAT')
    mall_id = os.environ.get('MALL_ID')
    client_id = os.environ.get('CLIENT_ID')
    client_secret = os.environ.get('CLIENT_SECRET')

    missing = [k for k, v in {
        "GIST_ID": gist_id, "GH_PAT": gh_pat, "MALL_ID": mall_id,
        "CLIENT_ID": client_id, "CLIENT_SECRET": client_secret
    }.items() if not v]
    if missing:
        print(f"[인증 실패] 다음 환경변수(Secrets)가 비어 있습니다: {missing}")
        return None, None

    gist_url = f"https://api.github.com/gists/{gist_id}"
    headers = {"Authorization": f"token {gh_pat}"}

    res = requests.get(gist_url, headers=headers)
    if res.status_code != 200:
        print(f"[인증 실패] Gist 조회 실패 - status={res.status_code}")
        return None, None
    refresh_token = res.json()['files']['token.txt']['content'].strip()

    auth_url = f"https://{mall_id}.cafe24api.com/api/v2/oauth/token"
    r = requests.post(auth_url,
                       data={"grant_type": "refresh_token", "refresh_token": refresh_token},
                       auth=(client_id, client_secret))
    if r.status_code != 200:
        print(f"[인증 실패] 카페24 토큰 갱신 실패 - status={r.status_code}, body={r.text[:300]}")
        return None, None

    data = r.json()
    patch_res = requests.patch(gist_url, headers=headers,
                                json={"files": {"token.txt": {"content": data['refresh_token']}}})
    if patch_res.status_code != 200:
        print(f"[경고] Gist 리프레시 토큰 갱신 실패 - status={patch_res.status_code}")

    return data['access_token'], mall_id


def get_orders(token, mall_id, start_date, end_date):
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    all_orders = []
    offset, limit = 0, 500
    while True:
        params = {
            "start_date": start_date, "end_date": end_date, "date_type": "order_date",
            "embed": "items", "limit": limit, "offset": offset,
        }
        r = requests.get(f"https://{mall_id}.cafe24api.com/api/v2/admin/orders",
                          headers=headers, params=params, timeout=30)
        if r.status_code != 200:
            print(f"[경고] 주문 조회 실패 status={r.status_code}")
            break
        orders = r.json().get('orders', [])
        if not orders:
            break
        all_orders.extend(orders)
        if len(orders) < limit:
            break
        offset += limit
        time.sleep(0.05)
    return all_orders


def val(v):
    return float(str(v).replace(',', '')) if v else 0.0


def bucket_by_day(orders):
    """주문들을 order_date(일자) 기준으로 묶어 일별 집계 dict 생성."""
    days = {}

    def ensure(d):
        if d not in days:
            days[d] = {
                'date': d, 'gmv': 0.0, 'net': 0.0, 'count': 0, 'refund': 0.0,
                '_items': {},
            }
        return days[d]

    for o in orders:
        order_day = (o.get('order_date') or '')[:10]
        if not order_day:
            continue
        rec = ensure(order_day)

        i = o.get('initial_order_amount', {}) or {}
        a = o.get('actual_order_amount', {}) or {}
        cancel_day = (o.get('canceled_date') or '')[:10] if o.get('canceled_date') else None
        is_canceled = o.get('canceled') == 'T'

        order_total = val(i.get('order_price_amount')) + val(i.get('shipping_fee'))
        if not (is_canceled and cancel_day == order_day):
            rec['gmv'] += order_total

        actual = val(a.get('payment_amount')) + val(o.get('naver_point', 0))
        rec['net'] += actual
        rec['refund'] += (val(i.get('payment_amount')) + val(o.get('naver_point', 0)) - actual)
        rec['count'] += 1

        for it in o.get('items', []):
            pno = it.get('product_no')
            name = it.get('product_name')
            qty = int(it.get('quantity') or 1)
            amt = (val(it.get('product_price')) + val(it.get('option_price'))) * qty
            key = pno
            if key not in rec['_items']:
                rec['_items'][key] = {'product_no': pno, 'name': name, 'amt': 0.0, 'qty': 0}
            rec['_items'][key]['amt'] += amt
            rec['_items'][key]['qty'] += qty

    # top 10 items per day만 남기고 내부용 필드 정리
    out = []
    for d, rec in sorted(days.items()):
        top = sorted(rec['_items'].values(), key=lambda x: x['amt'], reverse=True)[:10]
        out.append({
            'date': rec['date'], 'gmv': round(rec['gmv']), 'net': round(rec['net']),
            'count': rec['count'], 'refund': round(rec['refund']), 'topItems': top,
        })
    return out


def main():
    token, mall_id = get_access_token()
    if not token:
        print("[중단] 토큰 발급 실패로 종료")
        return

    today = datetime.utcnow() + timedelta(hours=9)
    end_date = (today - timedelta(days=1)).strftime('%Y-%m-%d')
    start_date = (today - timedelta(days=DAYS_BACK)).strftime('%Y-%m-%d')

    print(f"[수집 기간] {start_date} ~ {end_date}")
    orders = get_orders(token, mall_id, start_date, end_date)
    print(f"[주문 수집 완료] {len(orders)}건")

    daily = bucket_by_day(orders)
    payload = json.dumps({'updatedAt': today.isoformat(), 'daily': daily}, ensure_ascii=False)

    # 로컬에도 남겨둠 (로그/디버그용)
    with open('revenue-daily.json', 'w', encoding='utf-8') as f:
        f.write(payload)
    print(f"[완료] revenue-daily.json 생성 ({len(daily)}일치)")

    # 대시보드 공개 레포로 직접 푸시 (비공개 레포의 GH_PAT를 재사용)
    push_to_dashboard_repo(payload)


def push_to_dashboard_repo(payload_str):
    gh_pat = os.environ.get('GH_PAT')
    repo = os.environ.get('DASHBOARD_REPO', 'Su-pbg/dashboard')
    path = os.environ.get('DASHBOARD_PATH', 'revenue-daily.json')
    branch = os.environ.get('DASHBOARD_BRANCH', 'main')

    if not gh_pat:
        print("[경고] GH_PAT 없어서 대시보드 레포 푸시를 건너뜁니다.")
        return

    api_url = f"https://api.github.com/repos/{repo}/contents/{path}"
    headers = {"Authorization": f"token {gh_pat}", "Accept": "application/vnd.github+json"}

    # 기존 파일 sha 조회 (있으면 업데이트, 없으면 새로 생성)
    sha = None
    r = requests.get(api_url, headers=headers, params={"ref": branch})
    if r.status_code == 200:
        sha = r.json().get('sha')
    elif r.status_code != 404:
        print(f"[경고] 기존 파일 조회 실패 status={r.status_code}, body={r.text[:200]}")

    import base64
    content_b64 = base64.b64encode(payload_str.encode('utf-8')).decode('utf-8')
    body = {
        "message": "chore: update revenue-daily.json",
        "content": content_b64,
        "branch": branch,
    }
    if sha:
        body["sha"] = sha

    put_res = requests.put(api_url, headers=headers, json=body)
    if put_res.status_code in (200, 201):
        print(f"[완료] {repo}/{path} 에 푸시 성공")
    else:
        print(f"[실패] {repo}/{path} 푸시 실패 status={put_res.status_code}, body={put_res.text[:300]}")


if __name__ == "__main__":
    main()
