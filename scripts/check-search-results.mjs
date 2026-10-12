#!/usr/bin/env node
// 몰 검색어별 '실제 결과 수'를 센다 → search-results.json
//
// [2026-10-12] 우리가 만든 검색 API 를 쓴다. 두 번 틀린 뒤에 찾았다:
//   1차 — product-snapshot.json 대조:  cafe24 가 스냅샷에 없는 필드도 인덱싱해서 전부 틀렸다
//   2차 — /product/search.html 긁기:   그건 cafe24 기본 검색이고 사용자는 안 쓴다
//   실제 — 검색창은 printbakery.com/search.html?q= 로 가고, 그 페이지가 부르는 건 아래 API 다
//          (search.html 인라인의 window.APP_CONFIG.API_URL)
//
//   GET https://api.printbakery.com/v1/search/products?q=…&limit=1  →  { total, data[] }
//   data[] 에 brand_name · supplier_name · price 가 들어 있어 브랜드 분포도 같이 낸다.
//
// ⚠ 이건 **우리 서비스 API** 다. 고객 검색이 같은 엔드포인트를 쓴다.
//   [2026-10-12] 2,238개를 동시 5개·60ms 로 때렸다가 AWS ALB 에 막혔다
//   (HTTP 429, server: awselb/2.0, 본문 없음 — IP 단위 레이트룰로 보인다).
//   그 뒤로 이 IP 에서는 한동안 전부 429 였다. **전수 수집은 하지 말 것.**
//   많이 필요하면 외부 호출 없이 백엔드(검색 인덱스 쪽)에서 뽑아야 한다.
//   그래서 기본값을 상위 100개 · 동시 1개 · 1초 간격으로 묶어뒀다.
//
// 사용: DASHBOARD_KEY=... node scripts/check-search-results.mjs [--max 100] [--min 5] [--force]

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const MAX = Number(arg('--max', 100));      // 기본 100개만. 전수는 돌리지 말 것 — 아래 경고 참조
const MIN = Number(arg('--min', 5));
const FORCE = argv.includes('--force');
const KEY = process.env.DASHBOARD_KEY;
const WORKER = 'https://proud-sea-35f9.sugim-386.workers.dev';
const API = 'https://api.printbakery.com/v1';
const UA = 'Mozilla/5.0 (compatible; pbg-dashboard/1.0; +https://su-pbg.github.io/dashboard/)';
const H = { 'User-Agent': UA, 'Origin': 'https://printbakery.com' };

if (!KEY) { console.error('DASHBOARD_KEY 가 없습니다'); process.exit(1); }

const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date(Date.now() + 9 * 3600 * 1000);
const to = iso(today), from = iso(new Date(today.getTime() - 29 * 86400000));

const j = await (await fetch(
  `${WORKER}/?bs=${from}&be=${to}&as=${from}&ae=${to}&tab=searchterms&check=0&key=${KEY}`, { headers: H })).json();
if (j.error) { console.error('워커 오류:', j.error); process.exit(1); }

const JUNK = /^B[0-9A-Z]{6,}$/i, ENC = /%[0-9A-F]{2}/i;
const terms = (j.terms || [])
  .filter((t) => t.term && t.organic >= MIN && !JUNK.test(t.term) && !ENC.test(t.term))
  .slice(0, MAX);
console.log(`검색어 ${j.count}개 중 ${terms.length}개 확인 (${from}~${to}, 광고제외 ${MIN}세션 이상)`);

const OUT = path.join(ROOT, 'search-results.json');
let prev = {};
try { prev = (JSON.parse(fs.readFileSync(OUT, 'utf8')).terms || []).reduce((m, t) => (m[t.term] = t, m), {}); } catch {}

// 동시에 몰아치면 막힌다(실측: 동시 5 · 60ms 로 2,238개 중 976개 실패).
// 동시 2 · 250ms 로 낮추고, 실패하면 한 번 쉬었다 다시 본다.
async function look(term, tries = 3) {
  let r = null;
  for (let a = 0; a < tries; a++) {
    try {
      r = await fetch(`${API}/search/products?q=${encodeURIComponent(term)}&limit=5`, { headers: H });
      if (r.ok) break;
    } catch { r = null; }
    await new Promise((s) => setTimeout(s, 600 * (a + 1)));
  }
  if (!r || !r.ok) { if (r && r.status === 429) { console.error('429 — 레이트리밋에 걸렸다. 중단한다.'); process.exit(2); } return { results: null }; }
  const d = await r.json();
  const brands = [...new Set((d.data || []).map((x) => x.brand_name || x.supplier_name).filter(Boolean))].slice(0, 3);
  return { results: d.total ?? null, brands };
}

const out = [];
let i = 0, done = 0, reused = 0, failed = 0;
await Promise.all([...Array(1)].map(async () => {
  while (true) {
    const k = i++; if (k >= terms.length) break;
    const t = terms[k], old = prev[t.term];
    if (!FORCE && old && old.checkedAt === to && old.results != null) { out.push({ ...t, ...old, checkedAt: to }); reused++; continue; }
    try {
      const c = await look(t.term);
      // 띄어쓰기 버그 확인: 0건이면서 공백이 있으면 공백을 뺀 변형도 본다
      let noSpace = null;
      if (c.results === 0 && /\s/.test(t.term)) {
        const c2 = await look(t.term.replace(/\s+/g, ''));
        if (c2.results > 0) noSpace = c2.results;
      }
      out.push({ ...t, ...c, ...(noSpace ? { noSpace } : {}), checkedAt: to });
      if (c.results == null) failed++;
    } catch { out.push({ ...t, results: null, checkedAt: to }); failed++; }
    done++;
    if (done % 200 === 0) console.log(`  ${done}/${terms.length - reused} …`);
    await new Promise((s) => setTimeout(s, 1000));   // 초당 1회 — 우리 서비스 API 다
  }
}));

let ranking = null;
try { ranking = (await (await fetch(`${API}/search/ranking`, { headers: H })).json()).data || null; } catch {}

out.sort((a, b) => b.organic - a.organic);
const zero = out.filter((t) => t.results === 0).length;
const thin = out.filter((t) => t.results > 0 && t.results <= 3).length;
const spaceBug = out.filter((t) => t.noSpace).length;
fs.writeFileSync(OUT, JSON.stringify({
  updatedAt: new Date().toISOString(), window: { from, to },
  _설명: 'results = api.printbakery.com/v1/search/products 의 total (사용자가 쓰는 그 검색). '
       + 'brands = 상위 결과의 브랜드. noSpace = 공백을 뺐을 때 결과 수(띄어쓰기 버그). organic = 광고 외 세션.',
  counted: out.length, zero, thin, spaceBug, ranking, terms: out
}, null, 1));
console.log(`끝. ${out.length}개 (재사용 ${reused} · 실패 ${failed}) → 0건 ${zero} · 1~3건 ${thin} · 띄어쓰기 ${spaceBug}`);
