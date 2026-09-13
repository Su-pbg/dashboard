#!/usr/bin/env python3
"""
worker.js 최소 패치. 손으로 끼워넣을 필요 없음.

  [필수] 정렬 구좌 구분 — cate_no 는 같고 sort_method 로만 갈리는 구좌를 별도 집계
         (안 고치면 '조회수 TOP'·'인기 상품' 유입이 글로벌네비 '아트' 실적에 잘못 더해짐)
  [선택] tab=membercount — 과거 시점 총 회원 수 조회 (순수 추가, 기존 코드 안 건드림)
  [필수] cafe24 API 버전 헤더 — X-Cafe24-Api-Version 이 없으면 구버전으로 붙어
         /admin/customers/count 가 404 "No API found" 를 뱉는다 (회원수 수집 정지의 원인)

미등록 구좌 감지는 워커가 아니라 index.html 에서 한다 (프론트만 Git 으로 관리하기 위해).

사용법:
  python3 apply_worker_patches.py worker.js            # 둘 다
  python3 apply_worker_patches.py worker.js --only sort   # 정렬 구좌만
  python3 apply_worker_patches.py worker.js --only member # membercount 만
  python3 apply_worker_patches.py worker.js --only apiver # API 버전 헤더만

앵커를 정확히 1번 못 찾으면 아무것도 쓰지 않고 멈춘다.
"""
import sys, os, re, argparse, subprocess, shutil

# ─────────────────────────────────────────────────────────────────────────────
# 패치 1 (필수): 정렬 구좌 구분 — 6군데 작은 치환
# ─────────────────────────────────────────────────────────────────────────────

EDITS_SORT = [
    # ── ① ART SLOT_MAP 에 정렬 구좌 2개 ──
    ("ART 구좌 추가",
     """    {o:58,name:'전시소식 전체',cate:'874',section:'전시 소식'},
  ],""",
     """    {o:58,name:'전시소식 전체',cate:'874',section:'전시 소식'},
    // [2026-09-10] 메인에 새로 붙은 정렬 구좌. cate_no 는 608(아트)로 같고 sort_method 로만 갈린다.
    // 이걸 안 나누면 두 구좌 유입이 글로벌네비 '아트' 실적으로 잘못 더해진다.
    {o:59,name:'조회수 TOP',cate:'608',sort:'8',section:'정렬 구좌'},
    {o:60,name:'인기 상품',cate:'608',sort:'6',section:'정렬 구좌'},
  ],"""),

    # ── ② LIFE SLOT_MAP 에 정렬 구좌 2개 ──
    ("LIFE 구좌 추가",
     """    {o:60,name:'프로모션 (전체 캠페인)',promoPath:true,section:'프로모션'},
  ],""",
     """    {o:60,name:'프로모션 (전체 캠페인)',promoPath:true,section:'프로모션'},
    // LIFE 메인의 정렬 구좌 (GA4 에서 609&sort_method=6 / =5 확인)
    {o:61,name:'인기 상품',cate:'609',sort:'6',section:'정렬 구좌'},
    {o:62,name:'신상품',cate:'609',sort:'5',section:'정렬 구좌'},
  ],"""),

    # ── ③ 집계 버킷 2개 추가 ──
    ("집계 버킷 추가",
     "    const byP={}, byC={}, byCP={}, byPromo={}, byPath={}, byKeyword={};",
     """    // byCsortless: sort_method 가 없는 유입만 (부모 구좌용) / byCS: `cate|sort` 조합 (정렬 구좌용)
    const byP={}, byC={}, byCP={}, byPromo={}, byPath={}, byKeyword={}, byCS={}, byCsortless={};"""),

    # ── ④ cate 집계할 때 sort_method 로 갈라 담기 ──
    ("cate 집계 분리",
     """      if(cm){ (byC[cm[1]]=byC[cm[1]]||{s:0,e:0}); byC[cm[1]].s+=se; byC[cm[1]].e+=en; }""",
     """      if(cm){
        (byC[cm[1]]=byC[cm[1]]||{s:0,e:0}); byC[cm[1]].s+=se; byC[cm[1]].e+=en;
        const smm=path.match(/sort_method=(\\d+)/);
        if(smm){ const k=`${cm[1]}|${smm[1]}`; (byCS[k]=byCS[k]||{s:0,e:0}); byCS[k].s+=se; byCS[k].e+=en; }
        else   { (byCsortless[cm[1]]=byCsortless[cm[1]]||{s:0,e:0}); byCsortless[cm[1]].s+=se; byCsortless[cm[1]].e+=en; }
      }"""),

    # ── ⑤ 반환값에 버킷 2개 ──
    ("반환값 확장",
     "    return {byP,byC,byCP,byPromo,byPath,byKeyword};",
     "    return {byP,byC,byCP,byPromo,byPath,byKeyword,byCS,byCsortless};"),

    # ── ⑥ get() 에 sort 분기 + 부모 구좌 이중 계상 제거 ──
    ("get() 정렬 분기",
     """  const get=(agg,slot)=>{
    let v;
    if(slot.promoPath) v = Object.values(agg.byPromo).reduce((acc,x)=>({s:acc.s+x.s,e:acc.e+x.e}),{s:0,e:0});
    else if(slot.keyword) v = agg.byKeyword[slot.keyword];
    else if(slot.path) v = agg.byPath[slot.path];
    else v = slot.pno ? agg.byP[slot.pno] : (slot.cate ? agg.byC[slot.cate] : null);
    const s=v?v.s:0, e=v?v.e:0;
    return { sessions:s, dwell: s?Math.round(e/s):0 };
  };""",
     """  // 이 탭에서 sort 변형 구좌가 있는 cate 목록. 그런 cate 의 부모 구좌(글로벌네비 등)는
  // sort_method 없는 유입만 세야 정렬 구좌 트래픽이 중복으로 더해지지 않는다.
  const SORT_LABEL = { '5':'신상품순', '6':'인기순', '8':'조회수순' };
  const sortedCatesOf = (tab)=>new Set((SLOT_MAP[tab]||[]).filter(s=>s.sort).map(s=>s.cate));
  const get=(agg,slot,sortedCates)=>{
    let v;
    if(slot.promoPath) v = Object.values(agg.byPromo).reduce((acc,x)=>({s:acc.s+x.s,e:acc.e+x.e}),{s:0,e:0});
    else if(slot.keyword) v = agg.byKeyword[slot.keyword];
    else if(slot.path) v = agg.byPath[slot.path];
    else if(slot.sort) v = agg.byCS[`${slot.cate}|${slot.sort}`];
    else if(slot.pno) v = agg.byP[slot.pno];
    else if(slot.cate) v = (sortedCates && sortedCates.has(slot.cate)) ? agg.byCsortless[slot.cate] : agg.byC[slot.cate];
    const s=v?v.s:0, e=v?v.e:0;
    return { sessions:s, dwell: s?Math.round(e/s):0 };
  };"""),

    # ── ⑦ 합계·행 생성에 sortedCates 전달 + sort 필드 노출 ──
    ("행 생성",
     """    const totB=SLOT_MAP[tab].reduce((s,sl)=>s+get(B,sl).sessions,0)||1;
    const totA=SLOT_MAP[tab].reduce((s,sl)=>s+get(A,sl).sessions,0)||1;
    out[tab]=SLOT_MAP[tab].map(sl=>{
      const b=get(B,sl), a=get(A,sl);
      return {order:sl.o,name:sl.name,section:sl.section,pno:sl.pno||null,cate:sl.cate||null,staticName:sl.name,""",
     """    const SC=sortedCatesOf(tab);
    const totB=SLOT_MAP[tab].reduce((s,sl)=>s+get(B,sl,SC).sessions,0)||1;
    const totA=SLOT_MAP[tab].reduce((s,sl)=>s+get(A,sl,SC).sessions,0)||1;
    out[tab]=SLOT_MAP[tab].map(sl=>{
      const b=get(B,sl,SC), a=get(A,sl,SC);
      const nm = sl.sort ? `${sl.name} (${SORT_LABEL[sl.sort]||'sort_method='+sl.sort})` : sl.name;
      return {order:sl.o,name:nm,section:sl.section,pno:sl.pno||null,cate:sl.cate||null,sort:sl.sort||null,staticName:nm,"""),

    # ── ⑧ 정렬 구좌는 이름에 정렬방식이 들어 있으니 카테고리명을 덧붙이지 않는다 ──
    ("이름 처리",
     "      else if (row.cate && bundle.c[row.cate]) row.name = `${prefix} (${bundle.c[row.cate]})`;",
     "      else if (row.cate && bundle.c[row.cate] && !row.sort) row.name = `${prefix} (${bundle.c[row.cate]})`;"),
]

# ─────────────────────────────────────────────────────────────────────────────
# 패치 2 (선택): tab=membercount — 순수 추가
# ─────────────────────────────────────────────────────────────────────────────

MEMBER_ROUTE_ANCHOR = """      if (q.get('tab') === 'activeusers') {"""

MEMBER_ROUTE = """      if (q.get('tab') === 'membercount') {
        try {
          const mc = await buildMemberCounts(
            env, ranges.after.start, ranges.after.end,
            q.get('anchorDate'), q.get('anchorTotal') ? Number(q.get('anchorTotal')) : null,
          );
          if (mc.error) return json({ error: mc.error, detail: mc.detail || null }, 500);
          return jsonCached(mc, 200);
        } catch (e) {
          return json({ error: '회원 수 조회 실패: ' + String(e && e.message || e) }, 500);
        }
      }
"""

MEMBER_FUNCS = """

// ===== 과거 시점 총 회원 수 (tab=membercount) =====
// totalMembers 가 2026-08-01부터 revenue-daily.json 에서 비어 있다.
// /admin/customers/count 에 가입일 상한을 걸면 "그 날짜까지 가입한 회원 수",
// 즉 그 시점의 누적 회원 수를 과거까지 되짚어 구할 수 있다.
//
// [정확도] 그 뒤 탈퇴한 회원은 지금 목록에 없으므로 과거로 갈수록 실제보다 낮게 나온다.
// 그래서 마지막 실측일을 같은 방식으로 계산해 오차율(anchor.diffPct)을 함께 돌려준다.
// 오차가 크면 화면에서 이 값을 쓰면 안 된다 — 추정치를 조용히 정답처럼 쓰지 않기 위한 장치다.
const CUSTOMER_END_DATE_PARAMS = ['created_end_date', 'end_date', 'join_date_end'];
const MEMBER_PARAM_KEY = 'customerCountParam:v1';
const MEMBER_MAX_POINTS = 31;   // 서브요청 한도(무료 50) 여유

async function cafe24CustomerCount(mallId, tok, qs) {
  const r = await fetch(`https://${mallId}.cafe24api.com/api/v2/admin/customers/count${qs || ''}`, {
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
  });
  if (!r.ok) {
    console.log(`[회원수] count 실패 status=${r.status} qs=${qs} body=${(await r.text()).slice(0, 200)}`);
    return null;
  }
  const j = await r.json();
  return (j && j.count != null) ? Number(j.count) : null;
}

// cafe24 는 인식하지 못하는 쿼리 파라미터를 에러 없이 무시한다. 파라미터명이 틀리면
// 날짜 조건이 사라져 "전체 회원 수"가 그대로 돌아오는데 값이 그럴듯해 알아채기 어렵다.
// 그래서 아주 과거 날짜를 넣어 값이 실제로 줄어드는지 확인해 파라미터를 판별한다.
async function resolveCustomerCountParam(env, mallId, tok) {
  const kv = env.CAFE24_TOKEN_KV;
  if (kv) {
    try {
      const cached = await kv.get(MEMBER_PARAM_KEY);
      if (cached) return { param: cached, cached: true };
    } catch (e) { /* 캐시 실패는 무시 */ }
  }
  const total = await cafe24CustomerCount(mallId, tok, '');
  if (total == null) return { error: 'count 엔드포인트 호출 실패 (scope mall.read_customer 확인)' };
  for (const p of CUSTOMER_END_DATE_PARAMS) {
    const old = await cafe24CustomerCount(mallId, tok, `?${p}=2020-01-01`);
    if (old == null) continue;
    if (old < total) {
      if (kv) { try { await kv.put(MEMBER_PARAM_KEY, p, { expirationTtl: 60 * 60 * 24 * 30 }); } catch (e) {} }
      return { param: p, total };
    }
    console.log(`[회원수] ${p}: 전체와 동일(${old}) → 무시되는 파라미터`);
  }
  return { error: '가입일 상한 파라미터를 찾지 못했다', detail: `전체 ${total}명 기준으로 후보가 모두 무시됨` };
}

function memberDateRange(startDate, endDate, maxPoints) {
  const out = [];
  const s = Date.parse(startDate + 'T00:00:00Z'), e = Date.parse(endDate + 'T00:00:00Z');
  if (!(s <= e)) return out;
  const days = Math.round((e - s) / 86400000) + 1;
  const step = Math.max(1, Math.ceil(days / maxPoints));
  for (let i = 0; i < days; i += step) out.push(new Date(s + i * 86400000).toISOString().slice(0, 10));
  if (out[out.length - 1] !== endDate) out.push(endDate);
  return out;
}

async function buildMemberCounts(env, startDate, endDate, anchorDate, anchorTotal) {
  const tok = await getCafe24AccessToken(env);
  if (!tok) return { error: 'cafe24 인증 실패 (Gist/토큰 확인)' };
  const mallId = env.CAFE24_MALL_ID;
  const resolved = await resolveCustomerCountParam(env, mallId, tok);
  if (resolved.error) return resolved;
  const P = resolved.param;

  const points = [];
  for (const d of memberDateRange(startDate, endDate, MEMBER_MAX_POINTS)) {
    const n = await cafe24CustomerCount(mallId, tok, `?${P}=${d}`);
    if (n != null) points.push({ date: d, total: n });
  }
  if (!points.length) return { error: '회원 수를 한 건도 못 읽었다' };

  let anchor = null;
  if (anchorDate && anchorTotal) {
    const calc = await cafe24CustomerCount(mallId, tok, `?${P}=${anchorDate}`);
    if (calc != null) {
      const diffPct = anchorTotal ? (calc - anchorTotal) / anchorTotal * 100 : 0;
      anchor = { date: anchorDate, actual: anchorTotal, calculated: calc,
                 diff: calc - anchorTotal, diffPct, reliable: Math.abs(diffPct) <= 1.0 };
    }
  }
  return {
    dimUsed: P, paramCached: !!resolved.cached, points, anchor, estimated: true,
    note: '탈퇴 회원은 현재 목록에서 빠지므로 과거로 갈수록 실제보다 낮게 나옵니다. '
        + 'anchor.diffPct 로 오차를 확인하세요 (reliable=false 면 이 값을 지표로 쓰지 마세요).',
  };
}
"""


def replace_once(src, old, new, label):
    n = src.count(old)
    if n != 1:
        raise SystemExit(
            f"[중단] '{label}' 앵커를 {n}번 찾았습니다 (1번이어야 함).\n"
            f"        worker.js 버전이 다르거나 이미 수정됐습니다. 아무것도 쓰지 않았습니다."
        )
    print(f"  [ok] {label}")
    return src.replace(old, new)


def patch_sort(src):
    print("패치: 정렬 구좌 구분 (필수)")
    if "byCsortless" in src:
        print("  [건너뜀] 이미 적용돼 있습니다")
        return src
    for label, old, new in EDITS_SORT:
        src = replace_once(src, old, new, label)
    return src


def patch_member(src):
    print("패치: tab=membercount (선택)")
    if "buildMemberCounts" in src:
        print("  [건너뜀] 이미 적용돼 있습니다")
        return src
    src = replace_once(src, MEMBER_ROUTE_ANCHOR, MEMBER_ROUTE + MEMBER_ROUTE_ANCHOR, "라우팅 삽입")
    src = src.rstrip() + "\n" + MEMBER_FUNCS
    print("  [ok] 함수 추가 (파일 끝)")
    return src


# ─────────────────────────────────────────────────────────────────────────────
# 패치 3 (필수): cafe24 API 버전 헤더
#
# [2026-09-14] tab=membercount 가 죽던 진짜 원인.
#   [회원수] count 실패 status=404 body={"error":{"code":404,"message":"No API found."}}
# 403 insufficient_scope 가 아니라 404 였다 — 스코프가 아니라 **엔드포인트가 없다**는 뜻.
# 워커의 cafe24 호출은 X-Cafe24-Api-Version 을 안 보내서 앱 기본(구) 버전으로 붙는데,
# 그 버전에는 /admin/customers/count 가 없다.
# 같은 경로를 쓰는 snapshot_new_members.py 는 2024-06-01 을 보내고 정상 동작한다.
#
# 호출부마다 따로 고치지 않고 헤더 리터럴을 한 번에 치환한다 (호출부가 늘어도 같은 모양이면 잡힌다).
# GA4 호출(`Bearer ${token}`)은 ${tok}/${accessToken} 만 매칭하므로 건드리지 않는다.
CAFE24_API_VERSION_CONST = """const CAFE24_API_VERSION = '2024-06-01';   // 없으면 구버전으로 붙어 customers/count 가 404

"""
CAFE24_HEADER_RE = re.compile(
    r"(Authorization['\"]?: `Bearer \$\{(?:tok|accessToken)\}`, ['\"]Content-Type['\"]: 'application/json')"
)


def patch_apiver(src):
    print("패치: cafe24 API 버전 헤더 (필수)")
    if 'CAFE24_API_VERSION' in src:
        print("  [건너뜀] 이미 적용돼 있습니다")
        return src

    src, n = CAFE24_HEADER_RE.subn(
        r"\1, 'X-Cafe24-Api-Version': CAFE24_API_VERSION", src)
    if n == 0:
        sys.exit("  [실패] cafe24 헤더 리터럴을 찾지 못했습니다. 아무것도 쓰지 않았습니다.")
    print(f"  [ok] 헤더 {n}곳에 버전 추가")

    anchor = 'async function getCafe24AccessToken(env) {'
    src = replace_once(src, anchor, CAFE24_API_VERSION_CONST + anchor, '상수 선언')
    return src


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('worker', help='원본 worker.js 경로')
    ap.add_argument('-o', '--out', help='출력 파일 (기본: worker.patched.js)')
    ap.add_argument('--only', choices=['sort', 'member', 'apiver'], help='패치 하나만 적용')
    a = ap.parse_args()

    src = open(a.worker, encoding='utf-8').read()
    print(f"입력: {a.worker} ({len(src):,} bytes)\n")

    if a.only in (None, 'sort'):
        src = patch_sort(src); print()
    if a.only in (None, 'member'):
        src = patch_member(src); print()
    if a.only in (None, 'apiver'):
        src = patch_apiver(src); print()

    out = a.out or os.path.join(os.path.dirname(os.path.abspath(a.worker)), 'worker.patched.js')
    open(out, 'w', encoding='utf-8').write(src)
    print(f"출력: {out} ({len(src):,} bytes)")

    if shutil.which('node'):
        r = subprocess.run(['node', '--check', out], capture_output=True, text=True)
        if r.returncode == 0:
            print("문법 검사: 통과")
        else:
            print("문법 검사: 실패 ↓\n" + (r.stderr or '')[:1500]); sys.exit(1)
    else:
        print("문법 검사: node 가 없어 건너뜀")

    print("\n이 파일 내용을 Cloudflare 워커 편집기에 통째로 붙여넣고 배포하세요.")


if __name__ == '__main__':
    main()
