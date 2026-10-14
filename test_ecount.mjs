// 이카운트 판매 입력(ecount-tab.js) 점검.  실행: node test_ecount.mjs
// ecount-tab.js 를 그대로 불러와 ① 계산 함수 ② 화면 네 개가 오류 없이 그려지는지 본다.
// 저장소가 공개라 실제 고객 데이터는 쓰지 않는다 — 아래는 모두 가짜 값이다.
// 이카운트 화면 코드를 고치면 push 전에 이것부터 돌린다(2026-10-14 sumTxt 가 빠져 첫 화면이 깨진 일 이후).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let bad = 0, ok = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) ok++; else { bad++; console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`); }
};
const truthy = (name, v) => { if (v) ok++; else { bad++; console.log(`FAIL ${name}`); } };

// ---------- 가짜 데이터 ----------
const DATE = '2026-10-13';
const line = (o, i, x) => ({ order_id: o, product_no: 100 + i, product_name: `상품${i}`, supplier_id: 'S000000A', supplier_name: '공급사A',
  qty: 1, sale: 10000, disc: 0, net: 10000, tax_rate: 10, status: 'N10', paid: 'Y', canceled: 'N', paywin: 'N', variant_code: `P0000AAA00${i}`, option_value: '', ...x });
const order = (id, x) => ({ date: DATE, order_id: id, time: '10:00', payment_amount: 0, naver_point: 0, shipping_fee: 0, shipping_discount: 0,
  paid: 'Y', canceled: 'N', pay_methods: ['card'], pg: 'dacom', easypay: '', market: 'self', buyer: '가주문', rc_name: '가수령', rc_phone: '010-0000-0000', rc_addr: '가짜 주소', ...x });
const O1 = '20261013-0000001', O2 = '20261013-0000002', O3 = '20261013-0000003', O4 = '20261013-0000004', O5 = '20261013-0000005';
const ORDERS = [
  order(O1, { payment_amount: 23000, shipping_fee: 3000 }),                       // 일반: 상품 2개 + 배송비
  order(O2, { payment_amount: 23000, shipping_fee: 3000 }),                       // 부분취소, 환불 전(결제액 그대로)
  order(O3, { payment_amount: 10000 }),                                           // 부분취소, 환불 끝(결제액 줄어듦)
  order(O4, { payment_amount: 20000 }),                                           // 교환
  order(O5, { payment_amount: 10000 }),                                           // 이카운트에 없음
];
const LINES = [
  line(O1, 1), line(O1, 2),
  line(O2, 1), line(O2, 2, { canceled: 'Y', status: 'R10' }),
  line(O3, 1), line(O3, 2, { canceled: 'Y', status: 'C40' }),
  line(O4, 1), line(O4, 2, { canceled: 'Y', status: 'E00' }),
  line(O5, 1),
];
const DAY = { date: DATE, at: '2026-10-14 10:00', file: '가짜.xlsx', summary: { total: 2, 정상: 1, 미입력: 1, missAmt: 10000, issues: [{ o: O5, st: '미입력', tags: '퀵', paid: 10000 }] },
  rows: [{ o: O1, st: '정상', tags: '선수금(완납)', paid: 23000, ec: 23000, diff: 0, items: '상품1 ×1' }, { o: O5, st: '미입력', tags: '퀵', paid: 10000 }] };

// ---------- 브라우저 흉내 ----------
const el = () => ({ innerHTML: '', style: {}, dataset: {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], appendChild() {}, remove() {}, focus() {}, setSelectionRange() {} });
const store = {};
const json = (o) => ({ ok: true, status: 200, json: async () => o });
const fetchStub = async (url, opt = {}) => {
  const u = String(url);
  if (opt.method === 'POST') return json({ ok: true, at: '2026-10-14 10:00', saved: 0, attached: [], note: null, sign: {} });
  if (u.includes('/ecmap')) return json({ map: { P0000AAA001: { code: 'EC001', name: '가 / 상품1', src: 'auto' }, P0000AAA002: { code: 'EC002', name: '가 / 상품2', src: 'auto' } }, sign: { EC001: 'EC001SI' } });
  if (u.includes('/ecsales')) return json({ log: [] });
  if (u.includes('/ecrecon?month')) return json({ idx: { [DATE]: { at: DAY.at, file: DAY.file, summary: DAY.summary } }, notes: {} });
  if (u.includes('/ecrecon?date')) return json({ day: DAY, notes: {} });
  if (u.includes('tab=settleprod')) return json({ shipping: { S000000A: { type: 'M', fee: 3000, free_over: 50000 } } });
  if (u.includes('tab=orderitems')) return json({ orders: ORDERS, lines: LINES, truncated: false });
  return json({ error: 'stub: ' + u });
};
const ctx = {
  window: {}, console, setTimeout: () => 0, clearTimeout() {}, Intl, Math, Date, JSON, Promise, Object, Array, String, Number, RegExp, Set, Map, Error, encodeURIComponent, atob: (s) => s,
  WORKER: 'https://worker.test', authHeaders: () => ({}), setMenu() {}, fetch: fetchStub, confirm: () => true, alert() {},
  localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  CSS: { escape: (s) => s },
  document: { getElementById: () => null, createElement: el, head: el(), body: el() },
  XLSX: { utils: { sheet_to_json: (ws) => ws.rows } },
};
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('./ecount-tab.js', import.meta.url), 'utf8'), ctx, { filename: 'ecount-tab.js' });
const E = ctx.__ecount;
truthy('불러오기: window.__ecount 와 loadEcountTab', E && typeof ctx.loadEcountTab === 'function');

// ---------- ① 날짜 읽기 (이카운트 판매번호·일자 형식) ----------
eq('vdayOf 판매현황 일자 08/01-18', E.vdayOf('08/01-18', '20260801-0000001'), '20260801');
eq('vdayOf 판매조회 20261014-28', E.vdayOf('20261014-28'), '20261014');
eq('vdayOf 2026/10/14', E.vdayOf('2026/10/14'), '20261014');
eq('vdayOf 판매조회 26/10/14-28 (연도 2자리)', E.vdayOf('26/10/14-28'), '20261014');
eq('vdayOf 엑셀 날짜 숫자', E.vdayOf(46309), '20261014');
eq('vdayOf 연말→연초: 12/30 주문의 01/03 전표', E.vdayOf('01/03-5', '20261230-0000001'), '20270103');
eq('vdayOf 빈 값', E.vdayOf(''), '');

// ---------- ② 결제유형 ----------
const pt = (x) => E.payType(order('x', x));
eq('결제유형 토스페이먼츠 카드', pt({ pg: 'dacom', pay_methods: ['card'] }), '14. PG(카드)');
eq('결제유형 토스페이 카드', pt({ pg: 'toss', easypay: 'toss', pay_methods: ['card'] }), '22.토스페이(카드)');
eq('결제유형 토스머니', pt({ pg: 'toss', easypay: 'toss', pay_methods: ['prepaid'] }), '27.토스페이(토스머니)');
eq('결제유형 카카오페이', pt({ pg: 'kakaokakaopay', easypay: 'kakaopay', pay_methods: ['card', 'coupon'] }), '17.카카오페이');
eq('결제유형 페이코 포인트', pt({ pg: 'nhnentpayco', pay_methods: ['prepaid'] }), '26.페이코-페이코 포인트');
eq('결제유형 무통장(현금, PG 없음)', pt({ pg: '', pay_methods: ['cash'] }), '6.현금영수증(계좌이체)');

// ---------- ③ 화면 + 계산 (가짜 서버로 실제 흐름) ----------
const root = el();
const pages = {};
for (const p of ['map', 'log', 'daily', 'recon']) {
  try { await ctx.loadEcountTab(root, p); pages[p] = root.innerHTML.length > 200 && !/불러오지 못했습니다/.test(root.innerHTML) ? 'ok' : 'empty'; }
  catch (e) { pages[p] = 'ERR ' + e.message; }
}
eq('화면 네 개', pages, { map: 'ok', log: 'ok', daily: 'ok', recon: 'ok' });
// 대조 현황: 날짜 상세 · 판매입력 파일 이력
try { E.S.page = 'log'; E.S.logView = 'rv'; E.RV.date = DATE; E.RV.day = DAY; E.render(); truthy('대조 현황 날짜 상세', root.innerHTML.includes(O5)); } catch (e) { bad++; console.log('FAIL 대조 현황 날짜 상세 ' + e.message); }
try { E.RV.date = ''; E.S.logView = 'files'; E.render(); truthy('판매입력 파일 이력', root.innerHTML.includes('판매입력 파일 이력')); } catch (e) { bad++; console.log('FAIL 판매입력 파일 이력 ' + e.message); }

// 데일리 상태
const D = E.D, row = (id) => D.rows.find((r) => r.o.order_id === id);
eq('데일리 상태', [O1, O2, O3, O4, O5].map((id) => row(id).gst), ['새 주문', '환불 대기', '새 주문', '새 주문', '새 주문']);
eq('기본 선택에서 환불 대기 제외', [O1, O2].map((id) => !!D.sel[id]), [true, false]);

// 남은 금액
eq('일반 주문', E.remainOf(row(O1)).mode, 'none');
const r2 = E.remainOf(row(O2));
eq('환불 전: 23000 − 취소 10000, 남은 10000 < 무료 기준이라 배송비 3000 유지', [r2.mode, r2.amt, r2.oldShip, r2.newShip, r2.known], ['pending', 13000, 3000, 3000, true]);
eq('환불 끝: 결제액 그대로', [E.remainOf(row(O3)).mode, E.remainOf(row(O3)).amt], ['refunded', 10000]);
eq('교환은 취소 아님', [E.remainOf(row(O4)).mode, row(O4).live.length], ['none', 2]);

// 판매입력 줄 금액: 주문별 합계 = 결제액(부분취소면 남은 금액), 사인지 줄 0원
for (const id of [O2, O3, O4]) D.sel[id] = true;
const B = E.buildRows(), sum = {};
for (const r of B.rows) sum[r[9]] = (sum[r[9]] || 0) + r[23] + r[24];
eq('판매입력 주문별 합계', [O1, O2, O3, O4, O5].map((id) => sum[id]), [23000, 13000, 10000, 20000, 10000]);
const si = B.rows.find((r) => r[15] === 'EC001SI');
truthy('사인지 줄(EC001SI, 0원)', si && si[23] === 0 && si[24] === 0);
eq('판매일 = 주문일', B.rows[0][0], '20261013');
eq('부가세 = 공급가액 나머지', B.rows.filter((r) => r[9] === O1 && r[15] !== 'EC001SI').map((r) => [r[23], r[24]]), [[10455, 1045], [10455, 1045]]);

// 대조: 가짜 이카운트 판매조회(전표 단위)
const vrow = (no, ord, item, amt, qty, cust = '') => [no, ord, '온라인 직영몰', item, amt, '온라인 (직영몰)', '담당', cust, '', '14. PG(카드)', qty, '', '', '', '', ''];
const head = ['판매번호', '결제일', '거래처', '품 목', '금 액', '유 형', '담당자명', '[택배/차량배송/설치여부] 고객명', '고객연락처', '결제유형', '수량', '배송주소', '배송일자', '인쇄', '배송결과', '출고창고'];
const ecRows = E.parseEcount({ SheetNames: ['s'], Sheets: { s: { rows: [['회사명'], head,
  vrow('26/10/14-1', O1, '선수금(완납) 상품1 외 1건', 23000, 2, '퀵) 가수령'),
  vrow('26/10/20-1', O1, '선수금(완납) 상품1 외 1건', 0, 0),
  vrow('26/10/14-2', O2, '상품1', 23000, 2),
  vrow('26/10/14-3', O3, '상품1', 10000, 1),
  vrow('26/10/14-4', O4, '상품1 외 1건', 20000, 2),
  vrow('26/10/14-5', '20260901-0000009', '상품9', -5000, -1),
] } } }, '가짜.xlsx', true);
eq('판매조회 읽기: 줄 수', ecRows.length, 6);
D.ec = ecRows; D.date = DATE; E.compute();
eq('대조 상태', [O1, O2, O3, O4, O5].map((id) => row(id).st), ['정상', '정상', '정상', '정상', '미입력']);
eq('선수금·퀵·정산 전표 표시', row(O1).tags, '선수금(완납) · 퀵 · 선수금 정산 전표 10/20');
eq('파일 기간 (전표 10/14~10/20, 시작 2일 전부터)', [E.covered('2026-10-12'), E.covered('2026-10-11'), E.covered('2026-10-20')], [true, false, true]);

// 연말연초: 12/28~01/03 파일이면 12/26 주문까지만 기간 안
D.ec = [{ order: '20261229-0000001', vday: '20261228', total: 1 }, { order: '20261231-0000001', vday: '20270103', total: 1 }];
eq('연말연초 기간', [E.covered('2026-12-26'), E.covered('2026-12-25'), E.covered('2027-01-03'), E.covered('2026-07-01')], [true, false, true, false]);

console.log(bad ? `${bad}건 실패 · ${ok}건 통과` : `전부 통과 (${ok}건)`);
process.exit(bad ? 1 : 0);
