// scripts/fetch-data.mjs
// GA4 Data API로 여러 기간 프리셋을 계산해 data.json 생성 (드롭다운 전환용).
// 매출/cafe24 제외, GA4만. 자격증명은 GitHub Secrets(GA_SA_KEY).
//
// 프리셋: 리뉴얼 전후(7/1 고정) / 최근7 vs 직전7 / 최근28 vs 직전28 / 지난달 vs 이번달
// L포인트 제외: EXCLUDE_SOURCES 에 소스/매체 문자열 추가 (부분일치, 소문자 비교). 지금은 비어있음.

import { BetaAnalyticsDataClient } from '@google-analytics/data';
import fs from 'node:fs';

const {
  GA4_PROPERTY_ID = '511333372',
  GA_SA_KEY,
  SHOP_NAME = 'PrintBakery',
  RENEWAL_DATE = '2026-07-01',
  LIST_SOURCES,
} = process.env;

const EXCLUDE_SOURCES = [
  // 'lpoint',  // ← L포인트 소스/매체 확인되면 추가
];

const ga = new BetaAnalyticsDataClient({ credentials: JSON.parse(GA_SA_KEY) });
const property = `properties/${GA4_PROPERTY_ID}`;
const excluded = (sm) => EXCLUDE_SOURCES.some((s) => (sm || '').toLowerCase().includes(s.toLowerCase()));

// ── 날짜 유틸 (UTC 기준으로 KST 날짜 계산) ──
const pad = (n) => String(n).padStart(2, '0');
function todayKST() {
  const k = new Date(Date.now() + 9 * 3600 * 1000); // UTC+9
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}
function addDays(s, n) {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
// 빈 문자열/미설정 모두 방어 → 기본값 사용
const RENEWAL = (RENEWAL_DATE && RENEWAL_DATE.trim()) ? RENEWAL_DATE.trim() : '2026-07-01';

function buildPresets() {
  const todayStr = todayKST();
  const y = addDays(todayStr, -1); // 어제(데이터 완결일)

  const lastN = (n) => ({
    before: { start: addDays(y, -(2 * n - 1)), end: addDays(y, -n) },
    after:  { start: addDays(y, -(n - 1)),     end: y },
  });

  // 리뉴얼 전후: 오픈일 기준 직후 최대 7일(단, 어제까지), 직전은 동일 길이
  const afterStart = RENEWAL;
  const afterEnd = (y < addDays(afterStart, 6)) ? y : addDays(afterStart, 6);
  const span = Math.max(1, Math.round((Date.parse(afterEnd) - Date.parse(afterStart)) / 86400000) + 1);
  const renewal = {
    before: { start: addDays(afterStart, -span), end: addDays(afterStart, -1) },
    after:  { start: afterStart, end: afterEnd },
  };

  // 월별: 지난달(1일~말일) vs 이번달(1일~어제)
  const [Y, M] = todayStr.split('-').map(Number);
  const thisStart = `${Y}-${pad(M)}-01`;
  const prevY = M === 1 ? Y - 1 : Y;
  const prevM = M === 1 ? 12 : M - 1;
  const prevStart = `${prevY}-${pad(prevM)}-01`;
  const prevEnd = addDays(thisStart, -1);
  const monthly = { before: { start: prevStart, end: prevEnd }, after: { start: thisStart, end: y } };

  return [
    { id: 'renewal', label: '리뉴얼 전후',      ...renewal },
    { id: 'd7',      label: '최근 7일',          ...lastN(7) },
    { id: 'd28',     label: '최근 28일',         ...lastN(28) },
    { id: 'month',   label: '지난달 vs 이번달',   ...monthly },
  ];
}

// ── GA4 조회 (한 프리셋: 전/후 2개 dateRange) ──
async function fetchWindow(ranges) {

  async function oneRange(startDate, endDate){
    const [evR] = await ga.runReport({
      property, dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'eventName' }, { name: 'sessionSourceMedium' }],
      metrics: [{ name: 'eventCount' }, { name: 'sessions' }], limit: 100000,
    });
    const evc = {}; let ss = 0;
    for (const row of evR.rows ?? []) {
      const name = row.dimensionValues[0].value, sm = row.dimensionValues[1].value;
      if (excluded(sm)) continue;
      evc[name] = (evc[name] || 0) + Number(row.metricValues[0].value);
      if (name === 'session_start') ss += Number(row.metricValues[1].value);
    }
    const PAGE_DEFS = {
      home: ['/art.html', '/life.html'], list: '/product/list.html', detail: '/product/detail.html',
      search: '/product/search.html', basket: '/order/basket.html', order: '/order/orderform.html',
    };
    const [pgR] = await ga.runReport({
      property, dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }, { name: 'sessionSourceMedium' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }], limit: 100000,
    });
    const pgc = {};
    for (const row of pgR.rows ?? []) {
      const path = row.dimensionValues[0].value, sm = row.dimensionValues[1].value;
      if (excluded(sm)) continue;
      const hit = Object.entries(PAGE_DEFS).find(([, p]) =>
        Array.isArray(p) ? p.some((x) => path.startsWith(x)) : path.startsWith(p));
      if (!hit) continue;
      pgc[hit[0]] ??= { views: 0, users: 0 };
      pgc[hit[0]].views += Number(row.metricValues[0].value);
      pgc[hit[0]].users += Number(row.metricValues[1].value);
    }
    return { evc, ss, pgc };
  }

  const B = await oneRange(ranges.before.start, ranges.before.end);
  const A = await oneRange(ranges.after.start, ranges.after.end);
  const ev = { before: B.evc, after: A.evc };
  const sess = { before: B.ss, after: A.ss };
  const pg = {
    before: B.pgc, after: A.pgc,
  };
  // P 접근을 위해 재구성: pg[key][k]
  const pgByKey = {};
  for (const k of ['before','after']) for (const key of Object.keys(pg[k])) {
    pgByKey[key] ??= { before:{views:0,users:0}, after:{views:0,users:0} };
    pgByKey[key][k] = pg[k][key];
  }

  const S = (k) => sess[k] || ev[k].session_start || 0;
  const E = (k, n) => ev[k][n] || 0;
  const P = (key, k, f) => pgByKey[key]?.[k]?.[f] ?? 0;

  return {
    kpis: [
      { label: '세션(방문)',   before: S('before'),               after: S('after'),               unit: 'count' },
      { label: '신규 방문자',   before: E('before','first_visit'), after: E('after','first_visit'), unit: 'count' },
      { label: '상품상세 조회', before: P('detail','before','views'), after: P('detail','after','views'), unit: 'count' },
      { label: '장바구니 담기', before: E('before','add_to_cart'), after: E('after','add_to_cart'), unit: 'count' },
      { label: '구매',         before: E('before','purchase'),    after: E('after','purchase'),    unit: 'count' },
    ],
    funnel: [
      { name: '방문',        before: S('before'), after: S('after') },
      { name: '상품조회',     before: P('detail','before','views'), after: P('detail','after','views') },
      { name: '장바구니 담기', before: E('before','add_to_cart'), after: E('after','add_to_cart') },
      { name: '결제(주문서)', before: P('order','before','views'), after: P('order','after','views') },
      { name: '구매',        before: E('before','purchase'), after: E('after','purchase') },
    ],
    pages: [
      { name: '메인 (art · life)', icon: 'home', metrics: [
          { label: '조회수', before: P('home','before','views'), after: P('home','after','views') },
          { label: '활성 사용자', before: P('home','before','users'), after: P('home','after','users') },
        ], note: '실제 메인인 <b>/art.html · /life.html</b> 합산.' },
      { name: '상품 목록', icon: 'grid', metrics: [
          { label: '조회수', before: P('list','before','views'), after: P('list','after','views') },
          { label: '활성 사용자', before: P('list','before','users'), after: P('list','after','users') },
        ], note: '상품 목록 페이지 트래픽.' },
      { name: '상품 상세', icon: 'tag', metrics: [
          { label: '조회수', before: P('detail','before','views'), after: P('detail','after','views') },
          { label: '활성 사용자', before: P('detail','before','users'), after: P('detail','after','users') },
        ], note: '상품 상세 조회.' },
      { name: '상품 검색', icon: 'search', metrics: [
          { label: '조회수', before: P('search','before','views'), after: P('search','after','views') },
          { label: '활성 사용자', before: P('search','before','users'), after: P('search','after','users') },
        ], note: '검색 사용자 유입.' },
      { name: '장바구니', icon: 'cart', metrics: [
          { label: '조회수', before: P('basket','before','views'), after: P('basket','after','views') },
          { label: '활성 사용자', before: P('basket','before','users'), after: P('basket','after','users') },
        ], note: '장바구니 도달.' },
      { name: '주문서(결제)', icon: 'card', metrics: [
          { label: '조회수', before: P('order','before','views'), after: P('order','after','views') },
          { label: '활성 사용자', before: P('order','before','users'), after: P('order','after','users') },
        ], note: '결제 단계 도달. 구매 전환을 높이는 것이 과제.' },
    ],
  };
}

async function listSources() {
  const [r] = await ga.runReport({
    property, dateRanges: [{ startDate: '90daysAgo', endDate: 'yesterday' }],
    dimensions: [{ name: 'sessionSourceMedium' }], metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 100,
  });
  console.log('=== 소스/매체별 세션 (많은 순) ===');
  for (const row of r.rows ?? []) console.log(`${row.dimensionValues[0].value}\t${row.metricValues[0].value}`);
}

async function main() {
  if (LIST_SOURCES === '1') { await listSources(); return; }
  const presets = buildPresets();
  const out = {};
  for (const p of presets) {
    out[p.id] = {
      label: p.label,
      periodBefore: `${p.before.start} ~ ${p.before.end}`,
      periodAfter:  `${p.after.start} ~ ${p.after.end}`,
      ...(await fetchWindow(p)),
    };
    console.log(`✓ ${p.label}: 전 ${p.before.start}~${p.before.end} / 후 ${p.after.start}~${p.after.end}`);
  }
  const data = {
    shopName: SHOP_NAME,
    source: 'GA4 (자동 연동)' + (EXCLUDE_SOURCES.length ? ` · ${EXCLUDE_SOURCES.join('/')} 제외` : ''),
    updatedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
    defaultPreset: 'renewal',
    presets: presets.map((p) => ({ id: p.id, label: p.label })),
    data: out,
  };
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
  console.log('data.json 생성 완료');
}

main().catch((e) => { console.error(e); process.exit(1); });
