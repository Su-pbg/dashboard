// KPI 시트 마감 갱신 점검.  실행: node test_kpi_close.mjs
// 가짜 KV · 가짜 시계로 worker.js 를 그대로 돌린다(운영 KV·시트·카페24 를 건드리지 않는다).
// 배경: 2026-11-21 주·월 합계는 일별 수식(sumif)으로 두고, 월요일엔 지난주 · 1일엔 지난달 일별 값을 다시 받아 맞춘다.
// 확인: ① 마감 날짜 계산 ② 합계 수식이 sumif 로 바뀐다 ③ 월요일 크론이 지난주 7일을 다 받고 끝난다 ④ 평일엔 최근 3일만
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let bad = 0, ok = 0;
const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) ok++; else { bad++; console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`); } };

let src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
src = src.replace(/export\s*\{\s*worker_default\s+as\s+default\s*\};?/, 'globalThis.__worker = worker_default; globalThis.__t = { kpiCloseDays, kpiSumIf };');
const load = (nowIso) => {
  const now = Date.parse(nowIso);
  class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } }
  const ctx = { console: { log() {} }, URL, URLSearchParams, Response, Request, Headers, fetch: async () => { throw new Error('외부 요청 없음'); }, crypto, TextEncoder, TextDecoder, atob, btoa, setTimeout, Date: FakeDate, Math, JSON, caches: undefined };
  vm.createContext(ctx); vm.runInContext(src, ctx, { filename: 'worker.js' });
  return ctx;
};

// ① 마감 날짜
const T = load('2026-11-23T00:00:00Z').__t;
eq('월요일 → 지난주 월~일', T.kpiCloseDays('2026-11-23'), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
eq('평일 → 없음', T.kpiCloseDays('2026-11-24'), []);
const dec = T.kpiCloseDays('2026-12-01');
eq('1일 → 지난달 전체', [dec.length, dec[0], dec[29]], [30, '2026-11-01', '2026-11-30']);
const feb = T.kpiCloseDays('2027-03-01');
eq('1일이 월요일 → 지난달 + 지난주(겹침 없이)', [feb.length, feb[0], feb[27]], [28, '2027-02-01', '2027-02-28']);
// ② 합계 수식
eq('sum → sumif', T.kpiSumIf("=sum('1-4. 자사몰: GMV(일별)'!C1055:C1061)"), `=sumif('1-4. 자사몰: GMV(일별)'!C1055:C1061,"<>#N/A")`);
eq('이미 sumif 면 그대로', T.kpiSumIf(`=sumif('1-4. 자사몰: GMV(일별)'!C1055:C1061,"<>#N/A")`), `=sumif('1-4. 자사몰: GMV(일별)'!C1055:C1061,"<>#N/A")`);
eq('같은 탭 합계·다른 수식은 그대로', T.kpiSumIf('=sum(C5:C9)/D5'), '=sum(C5:C9)/D5');

// ③④ 크론 users 단계 — 받은 날짜를 세고, 단계가 끝나는지 본다
const run = async (nowIso) => {
  const ctx = load(nowIso), W = ctx.__worker, kv = new Map(), got = [];
  const KV = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
  // 이미 다 받아 둔 상태(카페24 값)로 시작 — 그래야 '마감이라 다시 받는 날'만 보인다
  const U = {}; for (let t = Date.parse('2026-09-01T00:00:00Z'); t < Date.parse(nowIso); t += 864e5) U[new Date(t).toISOString().slice(0, 10)] = { dau: 1, src: 'c24' };
  kv.set('kpiusers:v1', JSON.stringify(U));
  W.fetch = async (req) => { const u = new URL(req.url); if (u.searchParams.get('feed') === 'users' && u.searchParams.get('date')) got.push(u.searchParams.get('date')); return new Response('{"ok":true}'); };
  const env = { CAFE24_TOKEN_KV: KV, DASHBOARD_KEY: 'k' };
  let ticks = 0;
  for (; ticks < 20; ticks++) { await W.scheduled({}, env, { waitUntil() {} }); const j = JSON.parse(kv.get('kpijob') || 'null'); if (!j || j.todo[0] !== 'users') break; }
  return { got: got.sort(), ticks, uniq: new Set(got).size === got.length };
};
// 2026-11-23(월) 08:00 KST
let r = await run('2026-11-22T23:00:00Z');
eq('월요일: 지난주 7일 다 받음', r.got, ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
eq('월요일: 같은 날 두 번 안 받고 끝남', [r.uniq, r.ticks < 20], [true, true]);
// 2026-11-25(수) 08:00 KST
r = await run('2026-11-24T23:00:00Z');
eq('평일: 최근 3일만', r.got, ['2026-11-22', '2026-11-23', '2026-11-24']);

console.log(`${ok} ok, ${bad} fail`);
process.exit(bad ? 1 : 0);
