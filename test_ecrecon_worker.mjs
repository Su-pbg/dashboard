// 워커 /ecrecon 메모 · /ecsales 이력 저장 점검.  실행: node test_ecrecon_worker.mjs
// 가짜 KV 로 worker.js 를 그대로 돌린다(운영 KV 를 건드리지 않는다). 데이터는 모두 가짜.
// 확인: ① 바꾼 칸만 합쳐 저장(다른 칸을 덮지 않음) ② 예전 한 달 묶음(ecrecon:note:{월}) 도 같이 읽음
//       ③ 지운 메모가 예전 값으로 되살아나지 않음 ④ 판매입력 이력이 파일마다 남고 예전 묶음과 합쳐 읽힘
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let bad = 0, ok = 0;
const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) ok++; else { bad++; console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`); } };

const kv = new Map();   // key → {value, metadata}
const KV = {
  get: async (k) => (kv.has(k) ? kv.get(k).value : null),
  getWithMetadata: async (k) => (kv.has(k) ? { value: kv.get(k).value, metadata: kv.get(k).metadata ?? null } : { value: null, metadata: null }),
  put: async (k, v, o = {}) => { if (o.metadata && JSON.stringify(o.metadata).length > 1024) throw new Error('metadata > 1KB'); kv.set(k, { value: v, metadata: o.metadata }); },
  delete: async (k) => { kv.delete(k); },
  list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name, metadata: kv.get(name).metadata })), list_complete: true }),
};
const env = { CAFE24_TOKEN_KV: KV, DASHBOARD_KEY: 'k' };

// worker.js 는 ES 모듈(export default) — 마지막 export 를 globalThis 로 바꿔 vm 에서 돌린다
let src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
src = src.replace(/export\s*\{\s*worker_default\s+as\s+default\s*\};?/, 'globalThis.__worker = worker_default;');
const ctx = { console, URL, Response, Request, Headers, fetch, crypto, TextEncoder, TextDecoder, atob, btoa, setTimeout, Date, Math, JSON };
vm.createContext(ctx); vm.runInContext(src, ctx, { filename: 'worker.js' });
const W = ctx.__worker;
const call = async (path, body) => {
  const r = await W.fetch(new Request('https://w.test' + path + (path.includes('?') ? '&' : '?') + 'key=k', body ? { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}), env);
  return r.json();
};
const D = '2026-10-13', A = '20261013-0000001', B = '20261013-0000002', C = '20261013-0000003';

// 예전 한 달 묶음에 B·C 메모가 있다
await KV.put('ecrecon:note:2026-10', JSON.stringify({ [B]: { date: D, memo: '예전 메모', done: false }, [C]: { date: D, memo: '지울 메모', done: false } }));

// ① 두 사람이 같은 주문의 다른 칸을 따로 저장
await call('/ecrecon', { note: { date: D, order: A, ast: '발주 완료' } });
await call('/ecrecon', { note: { date: D, order: A, memo: '퀵 픽업 예정' } });
let n = (await call('/ecrecon?month=2026-10')).notes;
eq('바꾼 칸만 합침', [n[A].ast, n[A].memo, n[A].done], ['발주 완료', '퀵 픽업 예정', false]);
// ② 예전 묶음 같이 읽고, 그 위에 칸 하나 바꿔도 메모 유지
await call('/ecrecon', { note: { date: D, order: B, done: true } });
n = (await call('/ecrecon?date=' + D)).notes;
eq('예전 메모 위에 처리완료', [n[B].memo, n[B].done], ['예전 메모', true]);
// ③ 지운 메모는 되살아나지 않음
const r = await call('/ecrecon', { note: { date: D, order: C, memo: '' } });
n = (await call('/ecrecon?month=2026-10')).notes;
eq('지운 메모', [r.note, C in n], [null, false]);
// 긴 메모(200자 넘음)도 저장 실패하지 않음
await call('/ecrecon', { note: { date: D, order: A, memo: '가'.repeat(400) } });
n = (await call('/ecrecon?month=2026-10')).notes;
eq('긴 메모는 200자로', n[A].memo.length, 200);

// ④ 판매입력 이력: 예전 묶음 + 파일마다
await KV.put('ecsales:log:2026-10', JSON.stringify([{ id: 'old1', at: '2026-10-01 09:00', dates: ['2026-10-01'], ids: [A] }]));
await call('/ecsales', { dates: [D], by: '가', orders: 1, rows: 1, filename: 'a.xlsx', b64: 'QQ==', ids: [B] });
await call('/ecsales', { dates: [D], by: '나', orders: 1, rows: 1, filename: 'b.xlsx', b64: 'QQ==', ids: [C] });
const log = (await call('/ecsales?month=2026-10')).log;
eq('이력 3건(예전 1 + 새 2), 모든 주문번호', [log.length, log.flatMap((e) => e.ids).sort()], [3, [A, B, C].sort()]);

// ⑤ 월간요약: 예전 묶음 + 날짜별 키, 동시 저장해도 안 지워짐, 지우면 둘 다
await KV.put('ecrecon:idx:2026-10', JSON.stringify({ '2026-10-01': { at: 'x', summary: { total: 1 } } }));
await Promise.all([
  call('/ecrecon', { date: '2026-10-02', summary: { total: 2 }, rows: [] }),
  call('/ecrecon', { date: '2026-10-03', summary: { total: 3 }, rows: [] }),
]);
let idx = (await call('/ecrecon?month=2026-10')).idx;
eq('월간요약 날짜 3개(예전 1 + 동시 저장 2)', Object.keys(idx).sort().map((d) => idx[d].summary.total), [1, 2, 3]);
await call('/ecrecon', { remove: { date: '2026-10-02' } });
idx = (await call('/ecrecon?month=2026-10')).idx;
eq('지우기', Object.keys(idx).sort(), ['2026-10-01', '2026-10-03']);

// ⑥ 품목코드 예비 목록: 쌓임(근거 합산) → 확정하면 대응표에 담당자 값으로 들어가고 예비에서 빠짐 → 담당자 값 있는 옵션은 다시 안 쌓임
await call('/ecmap', { cand: [{ key: 'P1', label: '상품1', price: 100, cands: { EC1: 2 }, names: { EC1: '품1' } }, { key: 'P2', label: '상품2', cands: { EC2: 1, EC3: 1 } }] });
let m = await call('/ecmap', { cand: [{ key: 'P1', cands: { EC1: 3 } }] });
eq('예비 목록 쌓임·근거 합산', [Object.keys(m.cand).sort(), m.cand.P1.cands.EC1, m.cand.P1.label], [['P1', 'P2'], 5, '상품1']);
m = await call('/ecmap', { entries: [{ key: 'P1', code: 'EC1', name: '품1', label: '상품1', src: 'manual' }], candremove: ['P1'] });
m = await call('/ecmap');
eq('확정 → 대응표 담당자 값 · 예비에서 빠짐', [m.map.P1.code, m.map.P1.src, Object.keys(m.cand)], ['EC1', 'manual', ['P2']]);
m = await call('/ecmap', { cand: [{ key: 'P1', cands: { EC9: 1 } }], candremove: ['P2'] });
eq('담당자 값 있으면 다시 안 쌓임 · 버리기', Object.keys(m.cand), []);

console.log(bad ? `${bad}건 실패 · ${ok}건 통과` : `전부 통과 (${ok}건)`);
process.exit(bad ? 1 : 0);
