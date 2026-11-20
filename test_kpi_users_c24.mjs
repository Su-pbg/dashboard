// KPI 시트 사용자 수(활성·새 사용자)를 카페24 접속통계에서 더하는 kpiC24Visitors 점검.  실행: node test_kpi_users_c24.mjs
// 가짜 KV · 가짜 fetch 로 worker.js 를 그대로 돌린다(운영 KV·카페24 를 건드리지 않는다). 데이터는 모두 가짜.
// 배경: 2026-11-20 손입력 값은 카페24 방문자·처음 방문자인데 워커가 GA4 로 채워 10-20 이후 값이 어긋났다.
// 확인: ① 하루 값 ② 기간은 일별 합 ③ 하루라도 없거나 0 이면 null(집계 전 값을 시트에 쓰지 않는다) ④ 카페24 오류면 null
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let bad = 0, ok = 0;
const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) ok++; else { bad++; console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`); } };

const kv = new Map([['access_token', JSON.stringify({ token: 'T', expiresAt: Date.now() + 3600e3 })]]);
const KV = { get: async (k, o) => { const v = kv.has(k) ? kv.get(k) : null; return v != null && o && o.type === 'json' ? JSON.parse(v) : v; }, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { CAFE24_TOKEN_KV: KV, CAFE24_MALL_ID: 'm' };
const DAYS = { '2026-11-01': [100, 40], '2026-11-02': [200, 90], '2026-11-03': [300, 110], '2026-11-05': [0, 0] };
let fail = false; const seen = [];
const fakeFetch = async (url, init) => {
  url = String(url); seen.push({ url, auth: init && init.headers && init.headers.Authorization });
  if (!url.startsWith('https://ca-api.cafe24data.com/visitors/view?')) throw new Error('예상 못 한 요청 ' + url);
  if (fail) return new Response('{}', { status: 500 });
  const q = new URL(url).searchParams, view = [];
  for (const [d, [v, f]] of Object.entries(DAYS)) if (d >= q.get('start_date') && d <= q.get('end_date')) view.push({ date: d + 'T00:00:00+09:00', visit_count: v, first_visit_count: f, re_visit_count: v - f });
  return new Response(JSON.stringify({ view }));
};

let src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
src = src.replace(/export\s*\{\s*worker_default\s+as\s+default\s*\};?/, 'globalThis.__c24 = kpiC24Visitors;');
const ctx = { console: { log() {} }, URL, URLSearchParams, Response, Request, Headers, fetch: fakeFetch, crypto, TextEncoder, TextDecoder, atob, btoa, setTimeout, Date, Math, JSON, caches: undefined };
vm.createContext(ctx); vm.runInContext(src, ctx, { filename: 'worker.js' });
const f = ctx.__c24;

eq('하루', await f(env, '2026-11-02', '2026-11-02'), { dau: 200, nu: 90, days: 1 });
eq('몰·토큰이 요청에 실린다', [seen[0].url.includes('mall_id=m'), seen[0].auth], [true, 'Bearer T']);
eq('기간은 일별 합', await f(env, '2026-11-01', '2026-11-03'), { dau: 600, nu: 240, days: 3 });
eq('빠진 날이 있으면 null', await f(env, '2026-11-03', '2026-11-04'), null);
eq('0 인 날이 있으면 null', await f(env, '2026-11-05', '2026-11-05'), null);
fail = true;
eq('카페24 오류면 null', await f(env, '2026-11-02', '2026-11-02'), null);

console.log(`${ok} ok, ${bad} fail`);
process.exit(bad ? 1 : 0);
