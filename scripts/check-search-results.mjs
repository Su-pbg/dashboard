#!/usr/bin/env node
// 몰 검색어별 '실제 검색 결과 수'를 배치로 센다 → search-results.json
//
// 왜 배치인가: 워커로 하면 서브요청 한도(무료 50)에 걸려 상위 24개밖에 못 본다.
// 여기선 한도가 없으니 전부 돌린다. 대신 몰에 부담을 주지 않게 동시 4개·간격을 둔다.
//
// 사용:
//   DASHBOARD_KEY=... node scripts/check-search-results.mjs [--max 1200] [--min 3]
//     --max  확인할 검색어 수 (광고 제외 세션 많은 순, 기본 1200)
//     --min  이 세션 수 미만은 건너뜀 (기본 3)
//     --force 같은 날 캐시를 무시하고 다시 센다
//
// 결과 한 줄: { term, organic, paid, results, pages, checkedAt }
//   results = 검색 결과 1쪽에 걸린 상품 수(최대 20). pages>1 이면 그보다 많다.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const MAX = Number(arg('--max', 1200));
const MIN = Number(arg('--min', 3));
const FORCE = argv.includes('--force');   // 같은 날 이미 센 것도 다시 센다
const KEY = process.env.DASHBOARD_KEY;
const WORKER = 'https://proud-sea-35f9.sugim-386.workers.dev';
const MALL = 'https://www.printbakery.com';
const UA = 'Mozilla/5.0 (compatible; pbg-dashboard/1.0; +https://su-pbg.github.io/dashboard/)';

if (!KEY) { console.error('DASHBOARD_KEY 가 없습니다'); process.exit(1); }

const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date(Date.now() + 9 * 3600 * 1000);
const to = iso(today), from = iso(new Date(today.getTime() - 29 * 86400000));

// 1) 검색어 목록 (광고 제외 세션 포함). check=0 — 결과 수는 여기서 직접 센다.
const url = `${WORKER}/?bs=${from}&be=${to}&as=${from}&ae=${to}&tab=searchterms&check=0&key=${KEY}`;
const r = await fetch(url, { headers: { 'User-Agent': UA } });
const j = await r.json();
if (j.error) { console.error('워커 오류:', j.error); process.exit(1); }

const JUNK = /^B[0-9A-Z]{6,}$/i, ENC = /%[0-9A-F]{2}/i;
const terms = (j.terms || [])
  .filter((t) => t.term && t.organic >= MIN && !JUNK.test(t.term) && !ENC.test(t.term))
  .slice(0, MAX);
console.log(`검색어 ${j.count}개 중 ${terms.length}개 확인 (기간 ${from}~${to}, 광고제외 ${MIN}세션 이상)`);

// 2) 이전 결과를 읽어 오늘 이미 본 건 건너뛴다 (재실행 안전)
const OUT = path.join(ROOT, 'search-results.json');
let prev = {};
try { prev = (JSON.parse(fs.readFileSync(OUT, 'utf8')).terms || []).reduce((m, t) => (m[t.term] = t, m), {}); } catch {}

async function count(term) {
  const u = `${MALL}/product/search.html?keyword=${encodeURIComponent(term)}`;
  const res = await fetch(u, { headers: { 'User-Agent': UA } });
  if (!res.ok) return { results: null, pages: null };
  const html = await res.text();
  const set = new Set((html.match(/product_no=(\d+)/g) || []).map((m) => m.slice(11)));
  const pages = Math.max(1, ...(html.match(/page=(\d+)/g) || []).map((m) => Number(m.slice(5)) || 1));
  return { results: set.size, pages };
}

const out = [];
let i = 0, done = 0, reused = 0, failed = 0;
const CONC = 4;
await Promise.all([...Array(CONC)].map(async () => {
  while (true) {
    const k = i++; if (k >= terms.length) break;
    const t = terms[k];
    const old = prev[t.term];
    if (!FORCE && old && old.checkedAt === to) { out.push({ ...t, results: old.results, pages: old.pages, checkedAt: to }); reused++; continue; }
    try {
      const c = await count(t.term);
      out.push({ ...t, ...c, checkedAt: to });
      if (c.results == null) failed++;
    } catch { out.push({ ...t, results: null, pages: null, checkedAt: to }); failed++; }
    done++;
    if (done % 100 === 0) console.log(`  ${done}/${terms.length - reused} …`);
    await new Promise((s) => setTimeout(s, 120));   // 몰에 부담 주지 않게
  }
}));

out.sort((a, b) => b.organic - a.organic);
const zero = out.filter((t) => t.results === 0).length;
const thin = out.filter((t) => t.results > 0 && t.results <= 3 && t.pages === 1).length;
fs.writeFileSync(OUT, JSON.stringify({
  updatedAt: new Date().toISOString(), window: { from, to },
  _설명: 'results = 몰 검색 1쪽에 걸린 상품 수(최대 20). pages>1 이면 그보다 많다. organic = 광고 외 유입 세션.',
  counted: out.length, zero, thin, terms: out
}, null, 1));
console.log(`끝. ${out.length}개 (재사용 ${reused} · 실패 ${failed}) → 결과 0건 ${zero}개 · 1~3종 ${thin}개`);
