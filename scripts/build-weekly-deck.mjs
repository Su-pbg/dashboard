#!/usr/bin/env node
// 격주 주간회의용 발표자료(.pptx)를 만든다.
//
// 왜 스크립트인가: 회의 때마다 사람이 다시 뽑지 않게 하려는 것이라, 숫자 집계부터
// 슬라이드 조립까지 한 번에 돌아야 한다. 클라우드 루틴이 이 파일을 실행한다.
//
// 사용:
//   node scripts/build-weekly-deck.mjs [--date YYYY-MM-DD] [--out 경로.pptx]
//                                      [--sup-cur a.json --sup-prev b.json]
//
//   --date      회의 날짜(기본: 오늘). 이 날짜가 속한 월 + 직전 주를 대상으로 잡는다.
//   --sup-*     워커 tab=suppliersales 응답 파일. 있으면 팀·담당자 슬라이드가 붙고,
//               없으면 그 슬라이드를 건너뛴다(자료가 아예 안 나오는 것보다 낫다).
//
// 비교 기준은 전년 동월이 아니라 '전월 같은 일수' 와 '직전 주' 다.
// revenue-daily.json 이 2026-06-24 부터라 전년 데이터가 아예 없다.

import fs from 'node:fs';
import path from 'node:path';
import pptxgen from 'pptxgenjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

const MEET = arg('--date') || iso(new Date(Date.now() + 9 * 3600 * 1000));
const OUT = arg('--out') || path.join(ROOT, `PBG_주간회의_${MEET}.pptx`);

// ── 기간 잡기 ────────────────────────────────────────────────────────────
// 주간: 회의일 직전 월요일부터 일요일까지. 월간: 회의일이 속한 달의 1일부터.
// 데이터가 아직 없는 날은 뒤에서 잘라낸다(매출 수집이 하루 늦게 붙는다).
const daily = JSON.parse(fs.readFileSync(path.join(ROOT, 'revenue-daily.json'), 'utf8')).daily;
const rows = Object.fromEntries(daily.map((r) => [r.date, r]));
const lastData = daily[daily.length - 1].date;

const dow = new Date(MEET + 'T00:00:00Z').getUTCDay();           // 0=일
const thisMon = addDays(MEET, dow === 0 ? -6 : 1 - dow);
let wCurS = addDays(thisMon, -7), wCurE = addDays(thisMon, -1);   // 직전 주(월~일)
if (wCurE > lastData) wCurE = lastData;
const wPrevS = addDays(wCurS, -7);
const wPrevE = addDays(wCurS, -1);
// 주간 비교는 같은 일수로 맞춘다 (직전 주가 데이터 부족으로 잘렸을 때 불공정해진다)
const wDays = Math.round((Date.parse(wCurE) - Date.parse(wCurS)) / 86400000);
const wPrevEcut = addDays(wPrevS, wDays);

const mCurS = MEET.slice(0, 7) + '-01';
let mCurE = addDays(MEET, -1);
if (mCurE > lastData) mCurE = lastData;
const mDays = Math.round((Date.parse(mCurE) - Date.parse(mCurS)) / 86400000);
const prevMonth = new Date(mCurS + 'T00:00:00Z');
prevMonth.setUTCMonth(prevMonth.getUTCMonth() - 1);
const mPrevS = iso(prevMonth);
const mPrevE = addDays(mPrevS, mDays);

// ── 집계 ────────────────────────────────────────────────────────────────
function agg(s, e) {
  const ks = Object.keys(rows).filter((k) => k >= s && k <= e);
  const sum = (f) => ks.reduce((a, k) => a + (rows[k][f] || 0), 0);
  const disc = ks.reduce((a, k) => a + Object.values(rows[k].discounts || {}).reduce((x, y) => x + y, 0), 0);
  const coup = ks.reduce((a, k) => a + (rows[k].coupons || []).reduce((x, c) => x + (c.amt || 0), 0), 0);
  const cats = {};
  for (const k of ks) for (const c of rows[k].categories || []) {
    const ax = c.axis || c.name || '미분류';
    cats[ax] = (cats[ax] || 0) + (c.amt || 0);
  }
  const count = sum('count');
  return { days: ks.length, gmv: sum('gmv'), net: sum('net'), count, refund: sum('refund'), disc, coup, cats,
           aov: count ? sum('net') / count : 0 };
}
const M = agg(mCurS, mCurE), MP = agg(mPrevS, mPrevE);
const W = agg(wCurS, wCurE), WP = agg(wPrevS, wPrevEcut);

const pct = (a, b) => (b ? (a - b) / b * 100 : 0);
const sign = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
const man = (v) => Math.round(v / 10000).toLocaleString('ko-KR') + '만';
const eok = (v) => (v / 100000000).toFixed(2) + '억';

// 팀·담당자 (워커 응답이 있을 때만)
function teamAgg(file) {
  if (!file || !fs.existsSync(file)) return null;
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const mapPath = path.join(ROOT, 'supplier-managers.json');
  const m = JSON.parse(fs.readFileSync(mapPath, 'utf8')).suppliers;
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
    const top = Object.entries(v.cats).sort((a, b) => b[1] - a[1])[0];
    const t = top ? top[0] : '기타';
    teams[t] = (teams[t] || 0) + v.amt;
  }
  return { teams, mgrs: Object.entries(by).map(([k, v]) => [k, v.amt]).sort((a, b) => b[1] - a[1]) };
}
const TC = teamAgg(arg('--sup-cur')), TP = teamAgg(arg('--sup-prev'));

// ── 슬라이드 ─────────────────────────────────────────────────────────────
const INK = '1B1E23', MUTE = '8B95A1', LINE = 'E5E8EB', BG = 'F7F8F9';
const UP = '00A86B', DOWN = 'E03131', ART = '3182F6', LIFE = '00B26B';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';                     // 13.3 x 7.5
pres.author = 'PrintBakery Dashboard';

const title = (s, t, sub) => {
  s.addText(t, { x: 0.7, y: 0.45, w: 12, h: 0.6, fontSize: 30, bold: true, color: INK,
                 fontFace: 'Calibri', isTextBox: true, margin: 0 });
  if (sub) s.addText(sub, { x: 0.7, y: 1.08, w: 12, h: 0.35, fontSize: 14, color: MUTE,
                            fontFace: 'Calibri', isTextBox: true, margin: 0 });
};

// 큰 숫자 카드
function statCard(s, x, y, w, label, value, delta, note) {
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h: 1.85, fill: { color: 'FFFFFF' },
    line: { color: LINE, width: 1 }, rectRadius: 0.08,
    shadow: { type: 'outer', angle: 90, blur: 6, offset: 1, opacity: 0.06, color: '000000' } });
  s.addText(label, { x: x + 0.25, y: y + 0.18, w: w - 0.5, h: 0.3, fontSize: 12, color: MUTE,
                     fontFace: 'Calibri', isTextBox: true, margin: 0 });
  s.addText(value, { x: x + 0.25, y: y + 0.52, w: w - 0.5, h: 0.62, fontSize: 30, bold: true,
                     color: INK, fontFace: 'Calibri', isTextBox: true, margin: 0 });
  if (delta != null) {
    s.addText(sign(delta), { x: x + 0.25, y: y + 1.14, w: w - 0.5, h: 0.32, fontSize: 16, bold: true,
                             color: delta >= 0 ? UP : DOWN, fontFace: 'Calibri', isTextBox: true, margin: 0 });
  }
  if (note) s.addText(note, { x: x + 0.25, y: y + 1.46, w: w - 0.5, h: 0.3, fontSize: 10, color: MUTE,
                              fontFace: 'Calibri', isTextBox: true, margin: 0 });
}

// 1. 표지
{
  const s = pres.addSlide();
  s.background = { color: INK };
  s.addText('PRINTBAKERY', { x: 0.9, y: 2.2, w: 8, h: 0.35, fontSize: 13, color: '9AA3AD',
                             charSpacing: 3, fontFace: 'Calibri', isTextBox: true, margin: 0 });
  s.addText(`${Number(MEET.slice(5, 7))}월 실적 리뷰`, { x: 0.9, y: 2.65, w: 11, h: 1.0, fontSize: 46,
    bold: true, color: 'FFFFFF', fontFace: 'Calibri', isTextBox: true, margin: 0 });
  s.addText(`월간 ${mCurS.slice(5)} ~ ${mCurE.slice(5)}  ·  주간 ${wCurS.slice(5)} ~ ${wCurE.slice(5)}`,
    { x: 0.9, y: 3.75, w: 11, h: 0.4, fontSize: 15, color: 'C3C9D0', fontFace: 'Calibri', isTextBox: true, margin: 0 });
  s.addText(`주간회의 ${MEET}`, { x: 0.9, y: 4.25, w: 11, h: 0.4, fontSize: 13, color: '7C848D',
    fontFace: 'Calibri', isTextBox: true, margin: 0 });
  s.addNotes(`전년 동월 데이터가 없어(수집 시작 2026-06-24) 전월 같은 일수와 직전 주를 기준으로 비교했습니다.`);
}

// 2. 월간 핵심 지표
{
  const s = pres.addSlide();
  s.background = { color: BG };
  title(s, `${Number(mCurS.slice(5, 7))}월 핵심 지표`, `${mCurS} ~ ${mCurE} (${M.days}일)  ·  전월 같은 일수와 비교`);
  const w = 2.86, gap = 0.22;
  const cards = [
    ['GMV', eok(M.gmv), pct(M.gmv, MP.gmv), `전월 ${eok(MP.gmv)}`],
    ['순매출', eok(M.net), pct(M.net, MP.net), `전월 ${eok(MP.net)}`],
    ['주문 건수', M.count.toLocaleString('ko-KR') + '건', pct(M.count, MP.count), `전월 ${MP.count.toLocaleString('ko-KR')}건`],
    ['객단가', man(M.aov), pct(M.aov, MP.aov), `전월 ${man(MP.aov)}`],
  ];
  cards.forEach((c, i) => statCard(s, 0.7 + i * (w + gap), 1.75, w, ...c));
  const cards2 = [
    ['환불', man(M.refund), pct(M.refund, MP.refund), `전월 ${man(MP.refund)}`],
    ['쿠폰 할인', man(M.coup), pct(M.coup, MP.coup), `전월 ${man(MP.coup)}`],
    ['일평균 순매출', man(M.net / (M.days || 1)), pct(M.net / (M.days || 1), MP.net / (MP.days || 1)), `${M.days}일 기준`],
    ['환불률', (M.gmv ? M.refund / M.gmv * 100 : 0).toFixed(1) + '%', null, `전월 ${(MP.gmv ? MP.refund / MP.gmv * 100 : 0).toFixed(1)}%`],
  ];
  cards2.forEach((c, i) => statCard(s, 0.7 + i * (w + gap), 3.85, w, ...c));
  const dir = pct(M.net, MP.net) >= 0 ? '늘었다' : '줄었다';
  s.addText(`순매출이 전월 같은 기간보다 ${sign(pct(M.net, MP.net))} ${dir}. `
    + `건수 ${sign(pct(M.count, MP.count))}, 객단가 ${sign(pct(M.aov, MP.aov))}.`,
    { x: 0.7, y: 6.05, w: 12, h: 0.5, fontSize: 14, color: INK, fontFace: 'Calibri', isTextBox: true, margin: 0 });
}

// 3. 주간
{
  const s = pres.addSlide();
  s.background = { color: BG };
  title(s, '지난 주 성과', `${wCurS} ~ ${wCurE}  ·  직전 주(${wPrevS} ~ ${wPrevEcut})와 비교`);
  const w = 2.86, gap = 0.22;
  [
    ['GMV', man(W.gmv), pct(W.gmv, WP.gmv), `전주 ${man(WP.gmv)}`],
    ['순매출', man(W.net), pct(W.net, WP.net), `전주 ${man(WP.net)}`],
    ['주문 건수', W.count.toLocaleString('ko-KR') + '건', pct(W.count, WP.count), `전주 ${WP.count.toLocaleString('ko-KR')}건`],
    ['객단가', man(W.aov), pct(W.aov, WP.aov), `전주 ${man(WP.aov)}`],
  ].forEach((c, i) => statCard(s, 0.7 + i * (w + gap), 1.75, w, ...c));

  const labels = [], cur = [], prv = [];
  for (let i = 0; i <= wDays; i++) {
    const d = addDays(wCurS, i), p = addDays(wPrevS, i);
    labels.push(d.slice(5));
    cur.push(Math.round((rows[d]?.net || 0) / 10000));
    prv.push(Math.round((rows[p]?.net || 0) / 10000));
  }
  s.addChart(pres.ChartType.bar, [
    { name: '지난 주', labels, values: cur },
    { name: '직전 주', labels, values: prv },
  ], { x: 0.7, y: 3.9, w: 12, h: 2.55, barDir: 'col', chartColors: [ART, 'C9D2DB'],
       showTitle: true, title: '일별 순매출 (만원)', titleFontSize: 13, titleColor: INK,
       showValue: false, showLegend: true, legendPos: 'b', legendFontSize: 11,
       catAxisLabelColor: MUTE, valAxisLabelColor: MUTE, catAxisLabelFontSize: 10, valAxisLabelFontSize: 10,
       valGridLine: { color: LINE, size: 1 }, catGridLine: { style: 'none' } });
}

// 4. 카테고리
{
  const s = pres.addSlide();
  s.background = { color: BG };
  title(s, '카테고리별 매출', `${mCurS} ~ ${mCurE}  ·  아트 / 라이프 축 기준`);
  const keys = [...new Set([...Object.keys(M.cats), ...Object.keys(MP.cats)])]
    .sort((a, b) => (M.cats[b] || 0) - (M.cats[a] || 0));
  const tot = Object.values(M.cats).reduce((a, b) => a + b, 0) || 1;
  s.addChart(pres.ChartType.bar, [
    { name: '이번 달', labels: keys, values: keys.map((k) => Math.round((M.cats[k] || 0) / 10000)) },
    { name: '전월 같은 일수', labels: keys, values: keys.map((k) => Math.round((MP.cats[k] || 0) / 10000)) },
  ], { x: 0.7, y: 1.75, w: 7.5, h: 4.3, barDir: 'col', chartColors: [ART, 'C9D2DB'],
       showTitle: false, showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 10,
       dataLabelColor: INK, showLegend: true, legendPos: 'b', legendFontSize: 11,
       catAxisLabelColor: MUTE, valAxisLabelColor: MUTE, catAxisLabelFontSize: 11, valAxisLabelFontSize: 10,
       valGridLine: { color: LINE, size: 1 }, catGridLine: { style: 'none' } });
  let y = 1.9;
  for (const k of keys.slice(0, 5)) {
    const v = M.cats[k] || 0;
    s.addText(k, { x: 8.5, y, w: 2.0, h: 0.32, fontSize: 14, bold: true, color: INK,
                   fontFace: 'Calibri', isTextBox: true, margin: 0 });
    s.addText(`${man(v)}  ·  ${(v / tot * 100).toFixed(0)}%`, { x: 10.4, y, w: 2.3, h: 0.32,
      fontSize: 14, color: MUTE, align: 'right', fontFace: 'Calibri', isTextBox: true, margin: 0 });
    const p = pct(v, MP.cats[k] || 0);
    s.addText(MP.cats[k] ? `전월 대비 ${sign(p)}` : '전월 없음', { x: 8.5, y: y + 0.33, w: 4.2, h: 0.28,
      fontSize: 11, color: MP.cats[k] ? (p >= 0 ? UP : DOWN) : MUTE, fontFace: 'Calibri', isTextBox: true, margin: 0 });
    y += 0.82;
  }
  s.addText("'중복' 은 아트·라이프 양쪽 구좌에 걸린 상품입니다. 한쪽으로 몰아 세지 않습니다.",
    { x: 8.5, y: 5.95, w: 4.2, h: 0.5, fontSize: 10, color: MUTE, fontFace: 'Calibri', isTextBox: true, margin: 0 });
}

// 5. 팀·담당자 (워커 데이터가 있을 때만)
if (TC) {
  const s = pres.addSlide();
  s.background = { color: BG };
  title(s, '팀 · 담당자별 실적', `${wCurS} ~ ${wCurE}  ·  cafe24 공급사코드 기준 · 취소·반품 제외`);
  const tk = Object.keys(TC.teams).sort((a, b) => TC.teams[b] - TC.teams[a]);
  tk.slice(0, 2).forEach((t, i) => {
    const prev = TP ? (TP.teams[t] || 0) : null;
    statCard(s, 0.7 + i * 3.08, 1.75, 2.86, `${t} 팀`, man(TC.teams[t]),
      prev ? pct(TC.teams[t], prev) : null, prev ? `전주 ${man(prev)}` : null);
  });
  const rowsM = TC.mgrs.slice(0, 8);
  const maxA = Math.max(...rowsM.map((r) => r[1]), 1);
  let y = 1.85;
  for (const [mgr, amt] of rowsM) {
    s.addText(mgr, { x: 7.2, y, w: 1.7, h: 0.3, fontSize: 13, color: INK, fontFace: 'Calibri',
                     isTextBox: true, margin: 0 });
    s.addShape(pres.ShapeType.roundRect, { x: 8.95, y: y + 0.06, w: 2.6, h: 0.18,
      fill: { color: 'E9EDF1' }, line: { color: 'E9EDF1', width: 0 }, rectRadius: 0.09 });
    s.addShape(pres.ShapeType.roundRect, { x: 8.95, y: y + 0.06, w: Math.max(2.6 * amt / maxA, 0.12), h: 0.18,
      fill: { color: ART }, line: { color: ART, width: 0 }, rectRadius: 0.09 });
    s.addText(man(amt), { x: 11.65, y, w: 1.0, h: 0.3, fontSize: 12, color: MUTE, align: 'right',
                          fontFace: 'Calibri', isTextBox: true, margin: 0 });
    y += 0.42;
  }
  s.addText('담당자별 판매 (지난 주)', { x: 7.2, y: 1.45, w: 5.4, h: 0.3, fontSize: 12, bold: true,
    color: MUTE, fontFace: 'Calibri', isTextBox: true, margin: 0 });
}

// 6. 할인 · 환불
{
  const s = pres.addSlide();
  s.background = { color: BG };
  title(s, '할인 · 환불', `${mCurS} ~ ${mCurE}  ·  매출 성장률과 비교`);
  const gNet = pct(M.net, MP.net), gCoup = pct(M.coup, MP.coup), gRef = pct(M.refund, MP.refund);
  const w = 3.9, gap = 0.3;
  [['순매출 증감', sign(gNet), gNet, '기준'],
   ['쿠폰 할인 증감', sign(gCoup), gCoup, gCoup > gNet ? '매출 성장률을 상회' : '매출 성장률 이내'],
   ['환불 증감', sign(gRef), gRef, gRef > gNet ? '매출 성장률을 상회' : '매출 성장률 이내'],
  ].forEach((c, i) => {
    const x = 0.7 + i * (w + gap);
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.85, w, h: 2.0, fill: { color: 'FFFFFF' },
      line: { color: LINE, width: 1 }, rectRadius: 0.08 });
    s.addText(c[0], { x: x + 0.3, y: 2.05, w: w - 0.6, h: 0.3, fontSize: 13, color: MUTE,
                      fontFace: 'Calibri', isTextBox: true, margin: 0 });
    s.addText(c[1], { x: x + 0.3, y: 2.42, w: w - 0.6, h: 0.75, fontSize: 40, bold: true,
                      color: i === 0 ? INK : (c[2] > gNet ? DOWN : UP), fontFace: 'Calibri', isTextBox: true, margin: 0 });
    s.addText(c[3], { x: x + 0.3, y: 3.25, w: w - 0.6, h: 0.4, fontSize: 11, color: MUTE,
                      fontFace: 'Calibri', isTextBox: true, margin: 0 });
  });
  s.addText([
    { text: `쿠폰 할인 ${man(M.coup)} · 환불 ${man(M.refund)}`, options: { bullet: true, breakLine: true } },
    { text: `환불률 ${(M.gmv ? M.refund / M.gmv * 100 : 0).toFixed(1)}% (전월 ${(MP.gmv ? MP.refund / MP.gmv * 100 : 0).toFixed(1)}%)`,
      options: { bullet: true, breakLine: true } },
    { text: gCoup > gNet ? '할인 증가율이 매출 성장률을 앞선다 — 마진 확인 필요'
                         : '할인 증가율이 매출 성장률 이내 — 마진 방어 중', options: { bullet: true } },
  ], { x: 0.7, y: 4.25, w: 12, h: 1.6, fontSize: 14, color: INK, fontFace: 'Calibri',
       isTextBox: true, paraSpaceAfter: 8, margin: 0 });
}

// 7. 다음 액션 — 숫자에서 자동으로 뽑는다
{
  const s = pres.addSlide();
  s.background = { color: BG };
  title(s, '다음 액션', '이번 기간 숫자에서 바로 나오는 것들');
  const acts = [];
  if (pct(M.count, MP.count) < -5) acts.push(['주문 건수 감소 원인 점검',
    `전월 대비 ${sign(pct(M.count, MP.count))}. 유입과 전환 중 어디가 빠졌는지 분리 필요`]);
  if (pct(M.aov, MP.aov) < -5) acts.push(['객단가 하락 점검',
    `${man(MP.aov)} → ${man(M.aov)}. 고가 상품 비중 변화 확인`]);
  if (pct(M.coup, MP.coup) > pct(M.net, MP.net)) acts.push(['쿠폰 할인 증가율 조정',
    `할인 ${sign(pct(M.coup, MP.coup))} vs 순매출 ${sign(pct(M.net, MP.net))}. 마진 방어선 확인`]);
  if (pct(W.net, WP.net) < -10) acts.push(['주간 하락 원인 확인',
    `지난 주 순매출 ${sign(pct(W.net, WP.net))}. 특정 요일·카테고리 편중 여부 확인`]);
  if (!acts.length) acts.push(['지표 유지', '이번 기간 특별한 경고 신호 없음']);
  acts.slice(0, 4).forEach((a, i) => {
    const y = 1.8 + i * 1.15;
    s.addShape(pres.ShapeType.ellipse, { x: 0.7, y, w: 0.6, h: 0.6, fill: { color: INK },
      line: { color: INK, width: 0 } });
    s.addText(String(i + 1).padStart(2, '0'), { x: 0.7, y: y + 0.13, w: 0.6, h: 0.35, fontSize: 14,
      bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Calibri', isTextBox: true, margin: 0 });
    s.addText(a[0], { x: 1.55, y: y + 0.02, w: 11, h: 0.36, fontSize: 18, bold: true, color: INK,
      fontFace: 'Calibri', isTextBox: true, margin: 0 });
    s.addText(a[1], { x: 1.55, y: y + 0.42, w: 11, h: 0.4, fontSize: 13, color: MUTE,
      fontFace: 'Calibri', isTextBox: true, margin: 0 });
  });
}

// 8. 마무리
{
  const s = pres.addSlide();
  s.background = { color: INK };
  s.addText('감사합니다', { x: 0.9, y: 3.0, w: 11, h: 0.9, fontSize: 40, bold: true, color: 'FFFFFF',
    fontFace: 'Calibri', isTextBox: true, margin: 0 });
  s.addText(`PrintBakery · ${MEET} 주간회의`, { x: 0.9, y: 4.0, w: 11, h: 0.4, fontSize: 14,
    color: '9AA3AD', fontFace: 'Calibri', isTextBox: true, margin: 0 });
}

await pres.writeFile({ fileName: OUT });
console.log(`만들었다: ${OUT}`);
console.log(`  월간 ${mCurS}~${mCurE} (전월 ${mPrevS}~${mPrevE})`);
console.log(`  주간 ${wCurS}~${wCurE} (전주 ${wPrevS}~${wPrevEcut})`);
console.log(`  팀 슬라이드: ${TC ? '포함' : '건너뜀 (워커 데이터 없음)'}`);
