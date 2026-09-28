#!/usr/bin/env node
// 격주 주간회의용 노션 문서(.md)를 만든다. 노션에 그대로 붙여넣으면 표까지 살아난다.
//
// 사용:
//   node scripts/build-weekly-notion.mjs [--date YYYY-MM-DD] [--out 경로.md]
//                                        [--sup-cur a.json --sup-prev b.json --overlay o.json]
//
//   --date      회의 날짜(기본: 오늘). 이 날짜가 속한 월 + 직전 주를 대상으로 잡는다.
//   --sup-*     워커 tab=suppliersales 응답. 있으면 팀·담당자 절이 붙고 없으면 건너뛴다.
//   --overlay   워커 /supplier-map 응답. 화면에서 고친 담당자 값이다. 안 넣으면 자료가
//               대시보드와 어긋난다 (자체공급처럼 담당자를 옮긴 건이 옛 값으로 잡힌다).
//
// 비교는 전월 같은 일수 · 직전 주 · 전년 동월. revenue-daily.json 은 slackbot 이 최근
// 95일만 남기고 재생성하므로 과거분은 revenue-daily-archive.json 에서 합쳐 읽는다.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const addYears = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + n); return iso(d); };

const MEET = arg('--date') || iso(new Date(Date.now() + 9 * 3600 * 1000));
const OUT = arg('--out') || path.join(ROOT, `주간회의_${MEET}.md`);

// ── 데이터 (현재 파일 + 아카이브) ────────────────────────────────────────
const _cur = JSON.parse(fs.readFileSync(path.join(ROOT, 'revenue-daily.json'), 'utf8')).daily;
let _arch = null;
try { _arch = JSON.parse(fs.readFileSync(path.join(ROOT, 'revenue-daily-archive.json'), 'utf8')); } catch (e) {}
const rows = {};
if (_arch) for (const r of _arch.daily || []) rows[r.date] = { ...r };
for (const r of _cur) rows[r.date] = { ...rows[r.date], ...r };
if (_arch) for (const [d, v] of Object.entries(_arch.members || {})) {
  if (rows[d]) for (const [k, val] of Object.entries(v)) if (rows[d][k] == null) rows[d][k] = val;
}
const dates = Object.keys(rows).sort();
const lastData = dates[dates.length - 1];

// ── 기간 ────────────────────────────────────────────────────────────────
const dow = new Date(MEET + 'T00:00:00Z').getUTCDay();          // 0=일
const thisMon = addDays(MEET, dow === 0 ? -6 : 1 - dow);
let wCurS = addDays(thisMon, -7), wCurE = addDays(thisMon, -1);  // 직전 주(월~일)
if (wCurE > lastData) wCurE = lastData;
const wDays = Math.round((Date.parse(wCurE) - Date.parse(wCurS)) / 86400000);
const wPrevS = addDays(wCurS, -7), wPrevE = addDays(wPrevS, wDays);

const mCurS = MEET.slice(0, 7) + '-01';
let mCurE = addDays(MEET, -1);
if (mCurE > lastData) mCurE = lastData;
const mDays = Math.round((Date.parse(mCurE) - Date.parse(mCurS)) / 86400000);
const pm = new Date(mCurS + 'T00:00:00Z'); pm.setUTCMonth(pm.getUTCMonth() - 1);
const mPrevS = iso(pm), mPrevE = addDays(mPrevS, mDays);
const yCurS = addYears(mCurS, -1), yCurE = addYears(mCurE, -1);

// ── 집계 ────────────────────────────────────────────────────────────────
function agg(s, e) {
  const ks = dates.filter((k) => k >= s && k <= e);
  const sum = (f) => ks.reduce((a, k) => a + (rows[k][f] || 0), 0);
  const coup = ks.reduce((a, k) => a + (rows[k].coupons || []).reduce((x, c) => x + (c.amt || 0), 0), 0);
  const cats = {};
  for (const k of ks) for (const c of rows[k].categories || []) {
    const ax = c.axis || c.name || '미분류';
    cats[ax] = (cats[ax] || 0) + (c.amt || 0);
  }
  const tm = ks.map((k) => rows[k].totalMembers).filter((v) => v != null);
  const count = sum('count');
  return { has: ks.length > 0, days: ks.length, gmv: sum('gmv'), net: sum('net'), count,
           refund: sum('refund'), coup, cats, aov: count ? sum('net') / count : 0,
           newM: sum('newMembers'), outM: sum('withdrawnMembers'),
           totM: tm.length ? tm[tm.length - 1] : null };
}
const M = agg(mCurS, mCurE), MP = agg(mPrevS, mPrevE), MY = agg(yCurS, yCurE);
const W = agg(wCurS, wCurE), WP = agg(wPrevS, wPrevE);

const pct = (a, b) => (b ? (a - b) / b * 100 : null);
const sign = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
const won = (v) => Math.round(v / 10000).toLocaleString('ko-KR') + '만';
const eok = (v) => (v / 100000000).toFixed(2) + '억';
const num = (v) => Math.round(v).toLocaleString('ko-KR');

// 노션 표는 파이프 표를 그대로 받는다
function table(head, body) {
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`,
          ...body.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

// ── 팀·담당자 (워커 응답이 있을 때만) ────────────────────────────────────
function teamAgg(file) {
  if (!file || !fs.existsSync(file)) return null;
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'supplier-managers.json'), 'utf8')).suppliers;
  const ovf = arg('--overlay');
  if (ovf && fs.existsSync(ovf)) {
    const ov = JSON.parse(fs.readFileSync(ovf, 'utf8')).overrides || {};
    for (const [code, v] of Object.entries(ov)) m[code] = { ...(m[code] || {}), mgr: v.mgr, cat: v.cat };
  }
  const by = {};
  for (const s of d.suppliers || []) {
    const i = m[s.code] || {};
    if (!i.mgr) continue;
    const o = by[i.mgr] || (by[i.mgr] = { amt: 0, cats: {} });
    o.amt += s.amount;
    const c = i.cat || '기타';
    o.cats[c] = (o.cats[c] || 0) + s.amount;
  }
  const teams = {};
  for (const [mgr, v] of Object.entries(by)) {
    const t = Object.entries(v.cats).sort((a, b) => b[1] - a[1])[0];
    const k = t ? t[0] : '기타';
    (teams[k] || (teams[k] = { amt: 0, mgrs: [] }));
    teams[k].amt += v.amt;
    teams[k].mgrs.push([mgr, v.amt]);
  }
  for (const t of Object.values(teams)) t.mgrs.sort((a, b) => b[1] - a[1]);
  return teams;
}
const TC = teamAgg(arg('--sup-cur')), TP = teamAgg(arg('--sup-prev'));

// ── 문서 ────────────────────────────────────────────────────────────────
const L = [];
L.push(`# ${Number(mCurS.slice(5, 7))}월 실적 리뷰`);
L.push('');
L.push(`> ${MEET} 주간회의 · 월간 \`${mCurS} ~ ${mCurE}\` (${M.days}일) · 주간 \`${wCurS} ~ ${wCurE}\``);
L.push('');

L.push(`## 월간 — 전월 같은 일수 대비`);
L.push('');
L.push(table(['지표', '이번 달', '전월', '변화', '전년 동월', '전년 대비'], [
  ['GMV', eok(M.gmv), eok(MP.gmv), sign(pct(M.gmv, MP.gmv)), MY.has ? eok(MY.gmv) : '—', sign(pct(M.gmv, MY.gmv))],
  ['순매출', eok(M.net), eok(MP.net), sign(pct(M.net, MP.net)), MY.has ? eok(MY.net) : '—', sign(pct(M.net, MY.net))],
  ['주문 건수', num(M.count) + '건', num(MP.count) + '건', sign(pct(M.count, MP.count)), MY.has ? num(MY.count) + '건' : '—', sign(pct(M.count, MY.count))],
  ['객단가', won(M.aov), won(MP.aov), sign(pct(M.aov, MP.aov)), MY.has ? won(MY.aov) : '—', sign(pct(M.aov, MY.aov))],
  ['환불', won(M.refund), won(MP.refund), sign(pct(M.refund, MP.refund)), MY.has ? won(MY.refund) : '—', sign(pct(M.refund, MY.refund))],
  ['쿠폰 할인', won(M.coup), won(MP.coup), sign(pct(M.coup, MP.coup)), MY.has ? won(MY.coup) : '—', sign(pct(M.coup, MY.coup))],
]));
L.push('');
if (M.totM != null) {
  L.push(table(['회원', '값', '전월', '변화'], [
    ['누적 회원', num(M.totM) + '명', MP.totM != null ? num(MP.totM) + '명' : '—', sign(pct(M.totM, MP.totM))],
    ['신규 가입', num(M.newM) + '명', num(MP.newM) + '명', sign(pct(M.newM, MP.newM))],
    ['탈퇴', num(M.outM) + '명', num(MP.outM) + '명', sign(pct(M.outM, MP.outM))],
  ]));
  L.push('');
}

L.push(`## 지난 주 — 직전 주 대비`);
L.push('');
L.push(`\`${wCurS} ~ ${wCurE}\` vs \`${wPrevS} ~ ${wPrevE}\``);
L.push('');
L.push(table(['지표', '지난 주', '직전 주', '변화'], [
  ['GMV', won(W.gmv), won(WP.gmv), sign(pct(W.gmv, WP.gmv))],
  ['순매출', won(W.net), won(WP.net), sign(pct(W.net, WP.net))],
  ['주문 건수', num(W.count) + '건', num(WP.count) + '건', sign(pct(W.count, WP.count))],
  ['객단가', won(W.aov), won(WP.aov), sign(pct(W.aov, WP.aov))],
  ['환불', won(W.refund), won(WP.refund), sign(pct(W.refund, WP.refund))],
]));
L.push('');
L.push('일별 순매출 (만원)');
L.push('');
{
  const head = [], cur = [], prv = [];
  for (let i = 0; i <= wDays; i++) {
    const d = addDays(wCurS, i), p = addDays(wPrevS, i);
    head.push(d.slice(5));
    cur.push(Math.round((rows[d]?.net || 0) / 10000).toLocaleString('ko-KR'));
    prv.push(Math.round((rows[p]?.net || 0) / 10000).toLocaleString('ko-KR'));
  }
  L.push(table(['', ...head], [['지난 주', ...cur], ['직전 주', ...prv]]));
}
L.push('');

L.push(`## 카테고리별 매출`);
L.push('');
{
  const keys = [...new Set([...Object.keys(M.cats), ...Object.keys(MP.cats)])]
    .sort((a, b) => (M.cats[b] || 0) - (M.cats[a] || 0));
  const tot = Object.values(M.cats).reduce((a, b) => a + b, 0) || 1;
  L.push(table(['구분', '이번 달', '비중', '전월', '변화'], keys.map((k) => [
    k, won(M.cats[k] || 0), ((M.cats[k] || 0) / tot * 100).toFixed(0) + '%',
    MP.cats[k] ? won(MP.cats[k]) : '—', sign(pct(M.cats[k] || 0, MP.cats[k] || 0)),
  ])));
  L.push('');
  L.push('> `중복` 은 아트·라이프 양쪽 구좌에 걸린 상품입니다. 한쪽으로 몰아 세지 않습니다.');
  L.push('');
}

if (TC) {
  L.push(`## 팀 · 담당자별 실적`);
  L.push('');
  L.push(`\`${wCurS} ~ ${wCurE}\` · cafe24 공급사코드 기준 · 취소·반품 제외`);
  L.push('');
  const tk = Object.keys(TC).sort((a, b) => TC[b].amt - TC[a].amt);
  L.push(table(['팀', '지난 주', '직전 주', '변화'], tk.map((t) => [
    t, won(TC[t].amt), TP && TP[t] ? won(TP[t].amt) : '—',
    TP && TP[t] ? sign(pct(TC[t].amt, TP[t].amt)) : '—',
  ])));
  L.push('');
  for (const t of tk) {
    L.push(`**${t}**`);
    L.push('');
    L.push(table(['담당자', '금액'], TC[t].mgrs.map(([m, v]) => [m, won(v)])));
    L.push('');
  }
}

L.push(`## 할인 · 환불`);
L.push('');
{
  const gNet = pct(M.net, MP.net), gCoup = pct(M.coup, MP.coup), gRef = pct(M.refund, MP.refund);
  L.push(table(['항목', '증감', '판단'], [
    ['순매출', sign(gNet), '기준'],
    ['쿠폰 할인', sign(gCoup), gCoup > gNet ? '매출 성장률을 상회' : '매출 성장률 이내'],
    ['환불', sign(gRef), gRef > gNet ? '매출 성장률을 상회' : '매출 성장률 이내'],
  ]));
  L.push('');
  L.push(`- 쿠폰 할인 ${won(M.coup)} · 환불 ${won(M.refund)}`);
  L.push(`- 환불률 ${(M.gmv ? M.refund / M.gmv * 100 : 0).toFixed(1)}% (전월 ${(MP.gmv ? MP.refund / MP.gmv * 100 : 0).toFixed(1)}%)`);
  L.push('');
}

L.push(`## 다음 액션`);
L.push('');
{
  const acts = [];
  if (pct(M.count, MP.count) < -5) acts.push([`주문 건수 감소 원인 점검`,
    `전월 대비 ${sign(pct(M.count, MP.count))}. 유입과 전환 중 어디가 빠졌는지 분리 필요`]);
  if (pct(M.aov, MP.aov) < -5) acts.push([`객단가 하락 점검`,
    `${won(MP.aov)} → ${won(M.aov)}. 고가 상품 비중 변화 확인`]);
  if (pct(M.coup, MP.coup) > pct(M.net, MP.net)) acts.push([`쿠폰 할인 증가율 조정`,
    `할인 ${sign(pct(M.coup, MP.coup))} vs 순매출 ${sign(pct(M.net, MP.net))}. 마진 방어선 확인`]);
  if (pct(W.net, WP.net) < -10) acts.push([`주간 하락 원인 확인`,
    `지난 주 순매출 ${sign(pct(W.net, WP.net))}. 특정 요일·카테고리 편중 여부 확인`]);
  if (!acts.length) acts.push(['지표 유지', '이번 기간 특별한 경고 신호 없음']);
  acts.slice(0, 4).forEach(([t, d], i) => { L.push(`${i + 1}. **${t}** — ${d}`); });
  L.push('');
}

L.push('---');
L.push('');
L.push(`_비교 기준: 전월은 같은 일수(${mPrevS} ~ ${mPrevE}), 주간은 직전 주 같은 요일 수._`);
if (!MY.has) L.push(`_전년(${yCurS} ~ ${yCurE}) 데이터가 없어 전년 대비는 비워 둡니다._`);
if (!TC) L.push(`_팀·담당자별은 워커 데이터(\`--sup-cur\`)가 있을 때만 들어갑니다._`);
L.push('');

fs.writeFileSync(OUT, L.join('\n'), 'utf8');
console.log(`만들었다: ${OUT}`);
console.log(`  월간 ${mCurS}~${mCurE} (전월 ${mPrevS}~${mPrevE}${MY.has ? ` · 전년 ${yCurS}~${yCurE}` : ' · 전년 없음'})`);
console.log(`  주간 ${wCurS}~${wCurE} (전주 ${wPrevS}~${wPrevE})`);
console.log(`  팀 절: ${TC ? '포함' : '건너뜀'}`);
