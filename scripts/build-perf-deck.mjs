#!/usr/bin/env node
// 성과 공유 발표자료(.pptx) — 슬랙 "전주/월간 성과 공유" 형식을 월간 + 주간 두 파트로.
//
// 사용: node scripts/build-perf-deck.mjs --data perf-data.json [--out 경로.pptx]
//   --data  집계 JSON. { meta, month:{cur,prev,yoy,mau,join,newSku,supAmt,supQty}, week:{cur,prev,yoy,wau,join},
//           ga4weeks:[[주,데스크톱신규,모바일신규,재방문]...], insights:{month|week:{pos,neg,act:[[제목,본문]...]}} }
//   cur/prev/yoy = { gmv, net, count, aov, refund, coupon, art:{amt,orders,aov}, life:{...}, topAmt:[{brand,name,amt,qty}], topQty }
// 숫자 집계는 이 스크립트 밖(대시보드 JSON + 워커)에서 하고 여기선 그리기만 한다.
import fs from 'node:fs';
import path from 'node:path';
import pptxgen from 'pptxgenjs';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const D = JSON.parse(fs.readFileSync(arg('--data'), 'utf8'));
const OUT = arg('--out') || path.resolve(`PBG_성과공유_${D.meta.meet}.pptx`);

const INK = '1B1E23', MUTE = '8B95A1', LINE = 'E5E8EB', BG = 'F7F8F9', UP = '00A86B', DOWN = 'E03131', ART = '3182F6', LIFE = '00B26B', GOLD = 'B8860B';
const F = 'Calibri';
const pct = (a, b) => (b ? (a - b) / b * 100 : null);
const sign = (v, d = 0) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(d) + '%';
const won = (v) => Math.round(v).toLocaleString('ko-KR') + '원';
const man = (v) => Math.round(v / 10000).toLocaleString('ko-KR') + '만';
const eok = (v) => (v / 1e8).toFixed(2) + '억';
const num = (v) => (v == null ? '—' : Math.round(v).toLocaleString('ko-KR'));

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.author = 'PrintBakery Dashboard';
const T = (s, x, y, w, h, text, o = {}) => s.addText(text, { x, y, w, h, fontFace: F, color: INK, isTextBox: true, margin: 0, ...o });
const title = (s, t, sub, tag) => {
  s.background = { color: BG };
  if (tag) T(s, 0.7, 0.3, 2, 0.3, tag, { fontSize: 11, bold: true, color: tag === '월간' ? ART : LIFE, charSpacing: 2 });
  T(s, 0.7, 0.55, 12, 0.6, t, { fontSize: 28, bold: true });
  if (sub) T(s, 0.7, 1.12, 12, 0.35, sub, { fontSize: 13, color: MUTE });
};
function card(s, x, y, w, label, value, d1, d2) {
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h: 1.6, fill: { color: 'FFFFFF' }, line: { color: LINE, width: 1 }, rectRadius: 0.08 });
  T(s, x + 0.22, y + 0.15, w - 0.4, 0.3, label, { fontSize: 11, color: MUTE });
  T(s, x + 0.22, y + 0.45, w - 0.4, 0.55, value, { fontSize: 24, bold: true });
  const line = (yy, txt) => {
    if (!txt) return;
    const m = txt.match(/^(\S+)\s(.*)$/); const v = parseFloat(m[2]);
    s.addText([{ text: m[1] + ' ', options: { fontSize: 11, color: MUTE } }, { text: m[2], options: { fontSize: 12, bold: true, color: isNaN(v) ? MUTE : v >= 0 ? UP : DOWN } }],
      { x: x + 0.22, y: yy, w: w - 0.4, h: 0.26, fontFace: F, isTextBox: true, margin: 0 });
  };
  line(y + 1.02, d1); line(y + 1.28, d2);
}
function rankBox(s, x, y, w, head, rows, fmt) {
  T(s, x, y, w, 0.3, head, { fontSize: 12, bold: true, color: MUTE });
  rows.forEach((r, i) => {
    const yy = y + 0.36 + i * 0.4;
    T(s, x, yy, 0.4, 0.3, `${i + 1}위`, { fontSize: 11, color: GOLD, bold: true });
    T(s, x + 0.4, yy, w - 2.6, 0.3, fmt.name(r), { fontSize: 12 });
    T(s, x + w - 2.2, yy, 2.2, 0.3, fmt.val(r), { fontSize: 12, align: 'right', color: INK });
  });
}
function insightSlide(tag, label, I) {
  const s = pres.addSlide();
  title(s, `${label} 진단`, '긍정 · 부정 · 액션 플랜', tag);
  const cols = [['긍정', I.pos, UP, '🔵'], ['부정', I.neg, DOWN, '🔴'], ['액션 플랜', I.act, ART, '🚀']];
  cols.forEach(([h, items, c, ico], i) => {
    const x = 0.7 + i * 4.1, w = 3.9;
    s.addShape(pres.ShapeType.rect, { x, y: 1.7, w, h: 0.05, fill: { color: c }, line: { color: c, width: 0 } });
    T(s, x, 1.8, w, 0.4, `${ico} ${h}`, { fontSize: 15, bold: true, color: c });
    let y = 2.3;
    for (const [t, body] of items) {
      T(s, x, y, w, 0.34, t, { fontSize: 12.5, bold: true }); y += 0.36;
      const lines = Math.ceil(body.length / 27);
      T(s, x, y, w, 0.21 * lines + 0.1, body, { fontSize: 10, color: "3A4048", valign: "top" }); y += 0.21 * lines + 0.26;
    }
  });
}
const catBox = (s, x, y, name, c, p, color) => {
  s.addShape(pres.ShapeType.roundRect, { x, y, w: 5.9, h: 1.45, fill: { color: 'FFFFFF' }, line: { color: LINE, width: 1 }, rectRadius: 0.08 });
  s.addShape(pres.ShapeType.rect, { x, y, w: 0.08, h: 1.45, fill: { color }, line: { color, width: 0 } });
  T(s, x + 0.3, y + 0.12, 2, 0.3, name, { fontSize: 13, bold: true, color });
  T(s, x + 0.3, y + 0.45, 5.4, 0.3, `거래액 ${won(c.amt)}  (${sign(pct(c.amt, p.amt))})`, { fontSize: 13, bold: true });
  T(s, x + 0.3, y + 0.8, 5.4, 0.3, `거래 건수 ${c.orders}건  ·  객단가 ${won(c.aov)}`, { fontSize: 11.5, color: MUTE });
  T(s, x + 0.3, y + 1.08, 5.4, 0.3, `전기 ${won(p.amt)} · ${p.orders}건`, { fontSize: 10, color: MUTE });
};

// ── 표지
{
  const s = pres.addSlide(); s.background = { color: INK };
  T(s, 0.9, 2.1, 8, 0.35, 'PRINTBAKERY · E-COMMERCE', { fontSize: 13, color: '9AA3AD', charSpacing: 3 });
  T(s, 0.9, 2.55, 11, 1.0, `${D.meta.monthLabel} 성과 공유`, { fontSize: 44, bold: true, color: 'FFFFFF' });
  T(s, 0.9, 3.6, 11, 0.5, `월간 ${D.meta.month}  ·  주간 ${D.meta.weekLabel}`, { fontSize: 16, color: 'C3C9D0' });
  T(s, 0.9, 4.1, 11, 0.4, `주간회의 ${D.meta.meet}`, { fontSize: 13, color: '7C848D' });
}

// ── 월간
{
  const M = D.month, c = M.cur, p = M.prev, y = M.yoy;
  const s = pres.addSlide();
  title(s, `${D.meta.monthLabel} 요약`, `${D.meta.month}-01 ~ ${D.meta.month}-31  ·  MoM = 9월, YoY = 전년 10월`, '월간');
  const w = 2.86, g = 0.22;
  [['거래액(GMV)', won(c.gmv), `MoM ${sign(pct(c.gmv, p.gmv))}`, `YoY ${sign(pct(c.gmv, y.gmv))}`],
   ['매출액', won(c.net), `MoM ${sign(pct(c.net, p.net))}`, `YoY ${sign(pct(c.net, y.net))}`],
   ['거래 건수', num(c.count) + '건', `MoM ${sign(pct(c.count, p.count))}`, `YoY ${sign(pct(c.count, y.count))}`],
   ['객단가(AOV)', won(c.aov), `MoM ${sign(pct(c.aov, p.aov))}`, `YoY ${sign(pct(c.aov, y.aov))}`],
  ].forEach((k, i) => card(s, 0.7 + i * (w + g), 1.7, w, ...k));
  [['환불액', won(c.refund), `MoM ${sign(pct(c.refund, p.refund))}`, `GMV대비 ${(c.refund / c.gmv * 100).toFixed(1)}%`],
   ['쿠폰 할인', won(c.coupon), `MoM ${sign(pct(c.coupon, p.coupon))}`, `GMV대비 ${(c.coupon / c.gmv * 100).toFixed(1)}%`],
   ['활성 사용자(MAU)', `약 ${num(M.mau.cur)}명`, `MoM ${sign(pct(M.mau.cur, M.mau.prev))}`, `참고 봇제외 기준 변동(부록)`],
   ['회원가입', `${num(M.join.cur)}명`, `MoM ${sign(pct(M.join.cur, M.join.prev))}`, `9월 ${num(M.join.prev)}명`],
  ].forEach((k, i) => card(s, 0.7 + i * (w + g), 3.55, w, ...k));
  T(s, 0.7, 5.4, 12, 0.9, `신규 등록 상품 ${num(M.newSku.cur)}개(9월 ${num(M.newSku.prev)}개, 스냅샷 등록일 기준).  매출액 = 거래액 − 할인·쿠폰·환불.  객단가 = 거래액 ÷ 거래 건수.`, { fontSize: 11, color: MUTE });

  const s2 = pres.addSlide();
  title(s2, `${D.meta.monthLabel} 카테고리 · 공급사 순위`, '아트·라이프는 양쪽 구좌에 걸린 상품을 각각 포함(합이 거래액보다 큼)', '월간');
  catBox(s2, 0.7, 1.7, '아트', c.art, p.art, ART); catBox(s2, 6.8, 1.7, '라이프', c.life, p.life, LIFE);
  const fmtS = { name: (r) => r.name, val: (r) => `${man(r.amt)} / ${r.qty}ea  ${r.mom == null ? '' : '(' + sign(r.mom) + ')'}` };
  rankBox(s2, 0.7, 3.45, 5.9, '공급사 · 판매 금액 순 (MoM)', M.supAmt, fmtS);
  rankBox(s2, 6.8, 3.45, 5.9, '공급사 · 판매 수량 순 (MoM 수량)', M.supQty, fmtS);

  const s3 = pres.addSlide();
  title(s3, `${D.meta.monthLabel} 상품 판매 순위`, '같은 상품의 중복 등록은 합산', '월간');
  const fmtP = { name: (r) => `${r.brand || '-'} - ${r.name}`, val: (r) => `${won(r.amt)} / ${r.qty}ea` };
  rankBox(s3, 0.7, 1.7, 5.9, '판매 금액 순', c.topAmt, fmtP);
  rankBox(s3, 6.8, 1.7, 5.9, '판매 수량 순', c.topQty, fmtP);
  insightSlide('월간', D.meta.monthLabel, D.insights.month);
}

// ── 주간
{
  const Wk = D.week, c = Wk.cur, p = Wk.prev, y = Wk.yoy;
  const s = pres.addSlide();
  title(s, `지난 주 요약  ${D.meta.weekLabel}`, `WoW = ${D.meta.prevWeekLabel}, YoY = ${D.meta.yoyWeekLabel}`, '주간');
  const w = 2.86, g = 0.22;
  [['거래액(GMV)', won(c.gmv), `WoW ${sign(pct(c.gmv, p.gmv))}`, `YoY ${sign(pct(c.gmv, y.gmv))}`],
   ['매출액', won(c.net), `WoW ${sign(pct(c.net, p.net))}`, `YoY ${sign(pct(c.net, y.net))}`],
   ['거래 건수', num(c.count) + '건', `WoW ${sign(pct(c.count, p.count))}`, `YoY ${sign(pct(c.count, y.count))}`],
   ['객단가(AOV)', won(c.aov), `WoW ${sign(pct(c.aov, p.aov))}`, `YoY ${sign(pct(c.aov, y.aov))}`],
  ].forEach((k, i) => card(s, 0.7 + i * (w + g), 1.7, w, ...k));
  const conv = c.count / Wk.wau.cur * 100, convP = p.count / Wk.wau.prev * 100;
  [['환불액', won(c.refund), `WoW ${sign(pct(c.refund, p.refund))}`, `GMV대비 ${(c.refund / c.gmv * 100).toFixed(1)}%`],
   ['WAU', `약 ${num(Wk.wau.cur)}명`, `WoW ${sign(pct(Wk.wau.cur, Wk.wau.prev))}`, `참고 봇 소멸 영향(부록)`],
   ['회원가입', `${num(Wk.join.cur)}명`, `WoW ${sign(pct(Wk.join.cur, Wk.join.prev))}`, `전주 ${num(Wk.join.prev)}명`],
   ['구매 전환율', conv.toFixed(1) + '%', `WoW ${sign(conv - convP, 1).replace('%', '%p')}`, `기준 거래 건수 ÷ WAU`],
  ].forEach((k, i) => card(s, 0.7 + i * (w + g), 3.55, w, ...k));

  const s2 = pres.addSlide();
  title(s2, '지난 주 카테고리 · 상품 순위', `${D.meta.weekLabel}  ·  전기 = ${D.meta.prevWeekLabel}`, '주간');
  catBox(s2, 0.7, 1.7, '아트', c.art, p.art, ART); catBox(s2, 6.8, 1.7, '라이프', c.life, p.life, LIFE);
  const fmtP = { name: (r) => `${r.brand || '-'} - ${r.name}`, val: (r) => `${won(r.amt)} / ${r.qty}ea` };
  rankBox(s2, 0.7, 3.45, 5.9, '판매 금액 순', c.topAmt, fmtP);
  rankBox(s2, 6.8, 3.45, 5.9, '판매 수량 순', c.topQty, fmtP);
  insightSlide('주간', '지난 주', D.insights.week);
}

// ── 부록: WAU 하락 원인
{
  const s = pres.addSlide();
  title(s, '부록 · WAU 하락의 정체', 'GA4 활성 사용자 원값(봇 제외 전) 주별 · 기기 × 신규/재방문', '부록');
  const labels = D.ga4weeks.map((r) => r[0]);
  s.addChart(pres.ChartType.bar, [
    { name: '데스크톱 · 신규 (봇 의심)', labels, values: D.ga4weeks.map((r) => r[1]) },
    { name: '모바일 · 신규', labels, values: D.ga4weeks.map((r) => r[2]) },
    { name: '재방문', labels, values: D.ga4weeks.map((r) => r[3]) },
  ], { x: 0.7, y: 1.7, w: 7.4, h: 4.6, barDir: 'col', barGrouping: 'clustered', chartColors: ['C9D2DB', ART, LIFE],
       showLegend: true, legendPos: 'b', legendFontSize: 11, catAxisLabelColor: MUTE, valAxisLabelColor: MUTE,
       catAxisLabelFontSize: 11, valAxisLabelFontSize: 10, valGridLine: { color: LINE, size: 1 }, catGridLine: { style: 'none' } });
  const notes = [
    ['10/20 하루 만에 데스크톱·Direct·신규가 하루 4천 → 1.5천', '사람 행동이 아니라 봇 트래픽이 끊긴 것. 모바일 신규는 +9%, 재방문은 하루 약 800명 보합'],
    ['시트 WAU·리텐션의 하락은 대부분 이 봇의 잔여분', '봇 제외 로직이 "새 사용자"에서만 빼고 DAU에선 덜 빼서 남은 몫이 리텐션으로 잡혔음. 10/20 이전 수치가 부풀려져 있었다'],
    ['실제로 줄어든 유입은 둘', '인스타 오가닉(ig/social) 994 → 332명(−67%), 데이터라이즈 브랜드메시지 495 → 228명(−54%). 알림톡 +148%, 유료 소셜·검색 보합'],
    ['전년 대비 −30%의 기저', "'25 같은 주 이배 붓질 3점(3,600만)·개인결제창(690만) 제외 시 약 5,800만 → 올해 7,037만(+20%)"],
  ];
  let y = 1.75;
  for (const [t, b] of notes) { T(s, 8.4, y, 4.3, 0.32, t, { fontSize: 12, bold: true }); y += 0.34; const n = Math.ceil(b.length / 30); T(s, 8.4, y, 4.3, 0.21 * n + 0.1, b, { fontSize: 10, color: "3A4048", valign: "top" }); y += 0.21 * n + 0.26; }
}

await pres.writeFile({ fileName: OUT });
console.log(`만들었다: ${OUT}`);
