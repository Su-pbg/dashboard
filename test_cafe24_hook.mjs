// 카페24 웹훅 수신(/hook/cafe24)과 진행 중 주문(tab=openorders) 점검.  실행: node test_cafe24_hook.mjs
// 가짜 KV · 가짜 fetch 로 worker.js 를 그대로 돌린다(운영 KV·카페24 를 건드리지 않는다). 데이터는 모두 가짜.
// 배경: 2026-11-09 /receipt 를 지우면서 handleCafe24Hook 이 같이 지워져 웹훅이 500 이 됐고,
//       KV 에 남은 11-09 '배송전' 값이 새 조회를 덮어 배송완료 주문이 일주일 동안 '배송전'으로 보였다.
// 확인: ① 웹훅이 받아져 KV 에 적힌다 ② 키·IP 가 틀리면 거절 ③ 오래된 웹훅 값은 새 조회를 덮지 않는다 ④ 방금 온 웹훅 값은 덮는다
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { generateKeyPairSync } from 'node:crypto';

let bad = 0, ok = 0;
const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) ok++; else { bad++; console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`); } };

const kv = new Map();
const KV = {
  get: async (k, o) => { const v = kv.has(k) ? kv.get(k) : null; return v != null && o && o.type === 'json' ? JSON.parse(v) : v; },
  put: async (k, v) => { kv.set(k, v); },
  delete: async (k) => { kv.delete(k); },
};
// 워커가 탭을 처리하기 전에 구글 토큰부터 받으므로, 그 자리에서 만든 가짜 키를 넣는다
const GA_SA_KEY = JSON.stringify({ client_email: 't@test', private_key: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) });
const env = { GA_SA_KEY, CAFE24_TOKEN_KV: KV, DASHBOARD_KEY: 'k', CAFE24_WEBHOOK_KEY: 'hk', CAFE24_MALL_ID: 'm' };
const IP = '119.205.223.208';
const A = '20261109-0000001', B = '20261109-0000002', C = '20261109-0000003';

// 가짜 카페24 주문 조회: A 는 배송완료, B·C 는 배송전
const order = (id, st) => ({ order_id: id, order_date: '2026-11-09T11:00:00+09:00', paid: 'T', canceled: 'F', shipping_status: st, payment_amount: '1000',
  items: [{ product_no: 1, product_name: '가짜 상품', quantity: 1, order_status: 'N40' }] });
const fakeFetch = async (url) => {
  url = String(url);
  if (url.includes('/admin/orders?')) return new Response(JSON.stringify({ orders: [order(A, 'T'), order(B, 'F'), order(C, 'F')] }));
  if (url.includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'g' }));
  throw new Error('예상 못 한 요청 ' + url);
};

let src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
src = src.replace(/export\s*\{\s*worker_default\s+as\s+default\s*\};?/, 'globalThis.__worker = worker_default;');
const ctx = { console: { log() {} }, URL, URLSearchParams, Response, Request, Headers, fetch: fakeFetch, crypto, TextEncoder, TextDecoder, atob, btoa, setTimeout, Date, Math, JSON, caches: undefined };
vm.createContext(ctx); vm.runInContext(src, ctx, { filename: 'worker.js' });
const W = ctx.__worker;
const hook = (body, key = 'hk', ip = IP) => W.fetch(new Request('https://w.test/hook/cafe24', { method: 'POST', body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json', 'X-API-Key': key, 'CF-Connecting-IP': ip } }), env);
const open = async () => (await W.fetch(new Request('https://w.test/?bs=2026-11-17&be=2026-11-17&as=2026-11-17&ae=2026-11-17&tab=openorders&days=60&nocache=1&key=k'), env, { waitUntil() {} })).json();

// ① 웹훅 수신
let r = await hook({ event_no: 90024, resource: { order_id: C, order_date: '2026-11-09', shipping_status: 'M', paid: 'T' } });
eq('웹훅 200', r.status, 200);
eq('웹훅 KV 기록', JSON.parse(kv.get('ecopen:o:' + C)).ship_status, 'M');
eq('최근 목록', JSON.parse(kv.get('ecopen:recent'))[0].id, C);
// ② 거절
eq('키 틀림 401', (await hook({}, 'x')).status, 401);
eq('IP 틀림 403', (await hook({}, 'hk', '1.2.3.4')).status, 403);

// ③ 일주일 전 웹훅(A 배송전)이 남아 있어도, 새 조회가 배송완료면 목록에서 빠진다
kv.set('access_token', JSON.stringify({ token: 'T', expiresAt: Date.now() + 3600e3 }));
kv.set('ecopen:o:' + A, JSON.stringify({ order_id: A, at: '2026-11-09 11:39:51', ev: 90023, ship_status: 'F', paid: 'T' }));
kv.set('ecopen:recent', JSON.stringify([{ id: C, ev: 90024, at: JSON.parse(kv.get('ecopen:o:' + C)).at, ship_status: 'M' }, { id: A, ev: 90023, at: '2026-11-09 11:39:51', ship_status: 'F' }]));
const d = await open();
const st = Object.fromEntries((d.orders || []).map((o) => [o.order_id, o.ship_status]));
eq('오래된 웹훅은 안 덮음(A 빠짐)', A in st, false);
eq('웹훅 없는 주문은 조회 값(B 배송전)', st[B], 'F');
// ④ 방금 온 웹훅은 덮는다
eq('방금 온 웹훅은 덮음(C 배송중)', st[C], 'M');

console.log(`${ok} ok, ${bad} fail`);
process.exit(bad ? 1 : 0);
