// scripts/fetch-data.mjs
// GA4 Data API만 사용해 리뉴얼 전/후 비교용 data.json 생성.
// GitHub Actions에서 무인 실행. 자격증명은 GitHub Secrets(GA_SA_KEY)로 주입.
//
// 필요한 값:
//   GA4_PROPERTY_ID (기본 511333372)
//   GA_SA_KEY       서비스계정 JSON 키 전체
//   BEFORE_START, BEFORE_END, AFTER_START, AFTER_END  (YYYY-MM-DD)
//
// L포인트(및 기타) 유입 제외: 아래 EXCLUDE_SOURCES 에 소스/매체 문자열을 넣으면
//   해당 문자열이 포함된 sessionSourceMedium 은 집계에서 제외됩니다. (부분일치, 소문자 비교)
//   지금은 비어 있음 → 나중에 소스 목록 확인 후 한 줄 채우면 됩니다.
//   예: const EXCLUDE_SOURCES = ['lpoint', 'l.point', 'lotte'];

import { BetaAnalyticsDataClient } from '@google-analytics/data';
import fs from 'node:fs';

const {
  GA4_PROPERTY_ID = '511333372',
  GA_SA_KEY,
  BEFORE_START, BEFORE_END, AFTER_START, AFTER_END,
  SHOP_NAME = 'PrintBakery',
  LIST_SOURCES, // '1' 이면 소스/매체 목록만 출력하고 종료 (L포인트 찾기용)
} = process.env;

const EXCLUDE_SOURCES = [
  // 'lpoint',  // ← L포인트 소스/매체 확인되면 여기 추가
];

const ga = new BetaAnalyticsDataClient({ credentials: JSON.parse(GA_SA_KEY) });
const property = `properties/${GA4_PROPERTY_ID}`;
const RANGES = [
  { startDate: BEFORE_START, endDate: BEFORE_END }, // date_range_0 = 전
  { startDate: AFTER_START,  endDate: AFTER_END  }, // date_range_1 = 후
];
const bucket = (v) => (v.endsWith('0') ? 'before' : 'after');
const excluded = (sm) => EXCLUDE_SOURCES.some((s) => (sm || '').toLowerCase().includes(s.toLowerCase()));

// ── 소스/매체 목록만 뽑기 (L포인트 찾기용): LIST_SOURCES=1 로 실행 ──
async function listSources() {
  const [r] = await ga.runReport({
    property, dateRanges: [{ startDate: BEFORE_START, endDate: AFTER_END }],
    dimensions: [{ name: 'sessionSourceMedium' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 100,
  });
  console.log('=== 소스/매체별 세션 (많은 순) ===');
  for (const row of r.rows ?? []) {
    console.log(`${row.dimensionValues[0].value}\t${row.metricValues[0].value}`);
  }
  console.log('\n→ 위 목록에서 L포인트에 해당하는 문자열을 EXCLUDE_SOURCES 에 추가하세요.');
}

// 이벤트 집계 (소스/매체별로 받아 제외 소스 걸러내고 합산)
async function events() {
  const [r] = await ga.runReport({
    property, dateRanges: RANGES,
    dimensions: [{ name: 'dateRange' }, { name: 'eventName' }, { name: 'sessionSourceMedium' }],
    metrics: [{ name: 'eventCount' }, { name: 'sessions' }],
    limit: 100000,
  });
  const out = { before: {}, after: {} };
  const sess = { before: 0, after: 0 };
  const sessByEvent = { before: {}, after: {} };
  for (const row of r.rows ?? []) {
    const k = bucket(row.dimensionValues[0].value);
    const ev = row.dimensionValues[1].value;
    const sm = row.dimensionValues[2].value;
    if (excluded(sm)) continue;
    out[k][ev] = (out[k][ev] || 0) + Number(row.metricValues[0].value);
    if (ev === 'session_start') sess[k] += Number(row.metricValues[1].value);
    sessByEvent[k][ev] = (sessByEvent[k][ev] || 0) + Number(row.metricValues[1].value);
  }
  return { out, sess, sessByEvent };
}

// 페이지별 조회수/사용자 (소스/매체별로 받아 제외 후 합산)
async function pages(prefixes) {
  const [r] = await ga.runReport({
    property, dateRanges: RANGES,
    dimensions: [{ name: 'dateRange' }, { name: 'pagePath' }, { name: 'sessionSourceMedium' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
    limit: 100000,
  });
  const acc = {}; // path -> {before:{views,users}, after:{...}}
  for (const row of r.rows ?? []) {
    const k = bucket(row.dimensionValues[0].value);
    const path = row.dimensionValues[1].value;
    const sm = row.dimensionValues[2].value;
    if (excluded(sm)) continue;
    // prefix 매칭
    const hit = Object.entries(prefixes).find(([, pfx]) =>
      Array.isArray(pfx) ? pfx.some((p) => path.startsWith(p)) : path.startsWith(pfx));
    if (!hit) continue;
    const key = hit[0];
    acc[key] ??= { before: { views: 0, users: 0 }, after: { views: 0, users: 0 } };
    acc[key][k].views += Number(row.metricValues[0].value);
    acc[key][k].users += Number(row.metricValues[1].value);
  }
  return acc;
}

async function main() {
  if (LIST_SOURCES === '1') { await listSources(); return; }

  const PAGE_DEFS = {
    home:   ['/art.html', '/life.html'],
    list:   '/product/list.html',
    detail: '/product/detail.html',
    search: '/product/search.html',
    basket: '/order/basket.html',
    order:  '/order/orderform.html',
  };

  const [ev, pg] = await Promise.all([events(), pages(PAGE_DEFS)]);

  const S = (k) => ev.sess[k] || ev.out[k].session_start || 0;
  const E = (k, name) => ev.out[k][name] || 0;
  const P = (key, k, f) => pg[key]?.[k]?.[f] ?? 0;

  const data = {
    shopName: SHOP_NAME,
    periodBefore: `${BEFORE_START} ~ ${BEFORE_END}`,
    periodAfter:  `${AFTER_START} ~ ${AFTER_END}`,
    source: 'GA4 (자동 연동)' + (EXCLUDE_SOURCES.length ? ` · ${EXCLUDE_SOURCES.join('/')} 제외` : ''),
    updatedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),

    kpis: [
      { label: '세션(방문)',   before: S('before'),                after: S('after'),                unit: 'count' },
      { label: '신규 방문자',   before: E('before','first_visit'),  after: E('after','first_visit'),  unit: 'count' },
      { label: '상품상세 조회', before: P('detail','before','views'), after: P('detail','after','views'), unit: 'count' },
      { label: '장바구니 담기', before: E('before','add_to_cart'),  after: E('after','add_to_cart'),  unit: 'count' },
      { label: '구매',         before: E('before','purchase'),     after: E('after','purchase'),     unit: 'count' },
    ],

    funnel: [
      { name: '방문',        before: S('before'),                  after: S('after') },
      { name: '상품조회',     before: P('detail','before','views'), after: P('detail','after','views') },
      { name: '장바구니 담기', before: E('before','add_to_cart'),    after: E('after','add_to_cart') },
      { name: '결제(주문서)', before: P('order','before','views'),  after: P('order','after','views') },
      { name: '구매',        before: E('before','purchase'),       after: E('after','purchase') },
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

  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
  console.log('data.json 생성 완료', EXCLUDE_SOURCES.length ? `(제외: ${EXCLUDE_SOURCES.join(', ')})` : '(제외 없음)');
}

main().catch((e) => { console.error(e); process.exit(1); });
