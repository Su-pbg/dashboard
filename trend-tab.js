// 트렌드 탭 — 키워드 레이더 결과(trend-metrics.json · keyword-pool.json · shopping-insight.json)를 보여준다.
// 데이터는 slackbot 레포의 build_keyword_radar.py 가 매일 06:50 KST 에 이 레포로 push 한다.
// index.html 은 탭을 처음 열 때 이 파일을 불러와 loadTrendTab() 을 부른다.
(function(){
const CSS=`
/* 금액 카드 — 개수 말고 돈으로 말한다 */
.tr-moneys{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin:16px 0}
.tr-money{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.tr-money.hot{border-color:var(--down);background:linear-gradient(0deg,var(--card),var(--card))}
.tr-money.warn{border-color:var(--line)}
.tm-t{font-size:12.5px;color:var(--muted);font-weight:600}
.tm-b{font-size:30px;font-weight:700;letter-spacing:-.02em;margin:4px 0 2px;line-height:1.1}
.tr-money.hot .tm-b{color:var(--down)}
.tm-u{font-size:15px;font-weight:600;margin-left:3px;color:var(--muted)}
.tm-s{font-size:12px;color:var(--muted);line-height:1.6}
.tm-l{display:inline-block;margin-top:8px;font-size:12.5px;color:var(--accent);text-decoration:none;font-weight:600}
.tm-l:hover{text-decoration:underline}
/* 시즌 히트맵 */
.hm{margin-top:4px}
.hm-row{display:grid;grid-template-columns:150px repeat(12,1fr);gap:3px;align-items:stretch;cursor:pointer}
.hm-row.hm-head{cursor:default;margin-bottom:3px}
.hm-row:not(.hm-head):hover .hm-n{color:var(--accent)}
.hm-n{font-size:12.5px;font-weight:600;padding:5px 8px 5px 0;display:flex;flex-direction:column;justify-content:center;line-height:1.25}
.hm-n .t{font-weight:400;font-size:11px;color:var(--muted)}
.hm-w{text-align:center;font-size:11px;color:var(--muted);padding:1px}
.hm-w.now{background:var(--fill);border-radius:5px}
.hm-c{height:30px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff}
.hm-0{background:var(--fill);color:var(--muted)}
.hm-1{background:#dbeafe;color:#1e40af}
.hm-2{background:#93c5fd;color:#0b2f6b}
.hm-3{background:#4b8ef0;color:#fff}
.hm-4{background:#1d4ed8;color:#fff}
/* 기회 맵 */
.opm svg{width:100%;height:auto;max-height:340px;display:block}
.op-q{fill:var(--down);opacity:.07}
.op-ax{stroke:var(--line);stroke-width:1}
.op-qt{fill:var(--down);font-size:11.5px;font-weight:600;opacity:.85}
.op-lb{fill:var(--muted);font-size:10.5px}
.op-dot{fill:var(--muted);opacity:.5;cursor:pointer}
.op-dot:hover{opacity:1;fill:var(--accent)}
.op-dot.hot{fill:var(--down);opacity:.9}
.tr-act.lead{border-color:var(--accent);}
.tr-act.dim{opacity:.55}
.tr-sep{display:inline-block;width:1px;align-self:stretch;background:var(--line);margin:0 4px}

.tr-meta{display:flex;flex-wrap:wrap;gap:var(--s2) var(--s5);font-size:13px;color:var(--muted);margin:0 0 var(--s4);}
.tr-meta b{color:var(--ink-2);font-weight:600;}
.tr-warn{background:var(--down-soft);color:var(--ink);border-radius:var(--r-ctrl);padding:var(--s3) var(--s4);font-size:13px;margin-bottom:var(--s4);}
.tr-card{background:var(--surface);border-radius:var(--r-card);padding:var(--s5);margin-bottom:var(--s5);}
.tr-card h2{font-size:18px;font-weight:700;margin:0 0 var(--s1);letter-spacing:-.02em;}
.tr-card .tr-lead{font-size:13px;color:var(--muted);margin:0 0 var(--s4);}
.tr-acts{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:var(--s2);margin-bottom:var(--s4);}
.tr-act{background:var(--fill);border:0;border-radius:var(--r-ctrl);padding:var(--s3);text-align:left;cursor:pointer;font-family:var(--sans);}
.tr-act .n{font-size:22px;font-weight:700;color:var(--ink);display:block;}
.tr-act .l{font-size:12px;color:var(--muted);font-weight:600;}
.tr-act.on{background:var(--accent-soft);box-shadow:inset 0 0 0 2px var(--accent);}
.tr-filters{display:flex;flex-wrap:wrap;gap:var(--s2);align-items:center;margin-bottom:var(--s3);}
.tr-filters input[type=search],.tr-filters select{font-family:var(--sans);font-size:14px;border:0;border-radius:var(--r-ctrl);height:36px;padding:0 var(--s3);background:var(--fill);color:var(--ink);}
.tr-filters label{font-size:13px;color:var(--ink-2);display:flex;gap:6px;align-items:center;cursor:pointer;}
.tr-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
table.tr-t{width:100%;border-collapse:collapse;font-size:13px;min-width:980px;}
.tr-t th{position:sticky;top:0;background:var(--surface);text-align:right;font-weight:600;color:var(--muted);font-size:12px;padding:var(--s2);border-bottom:1px solid var(--hair);cursor:pointer;white-space:nowrap;user-select:none;}
.tr-t th.l,.tr-t td.l{text-align:left;}
.tr-t th.sorted{color:var(--ink);}
.tr-t td{padding:var(--s2);border-bottom:1px solid var(--hair);text-align:right;white-space:nowrap;vertical-align:middle;}
.tr-t tr.row{cursor:pointer;}
.tr-t tr.row:hover td{background:var(--paper);}
.tr-kw{font-weight:600;color:var(--ink);}
.tr-badge{display:inline-block;font-size:11px;font-weight:700;border-radius:6px;padding:1px 6px;margin-left:6px;vertical-align:1px;}
.tr-new{background:var(--accent-soft);color:var(--accent-press);}
.tr-seed{background:var(--fill);color:var(--muted);}
.tr-up{color:var(--up);font-weight:600;} .tr-down{color:var(--down);font-weight:600;} .tr-flat{color:var(--muted);}
.tr-pill{display:inline-block;border-radius:var(--r-pill);padding:2px 10px;font-size:12px;font-weight:700;}
.tr-p-소싱{background:#E8F3FF;color:#1B64DA;} .tr-p-밀기{background:#E7F9F0;color:#008A52;}
.tr-p-재고확보{background:#FFF3E0;color:#C25E00;} .tr-p-저가라인{background:#F3EEFF;color:#6B3FD4;}
.tr-p-지켜보기,.tr-p-소싱검토{background:var(--fill);color:var(--ink-2);} .tr-p-패스,.tr-p-유지{background:var(--fill);color:var(--ghost);}
.tr-p-안팔림점검{background:#FEECEE;color:#C4202F;}
.tr-p-시즌준비,.tr-p-시즌소싱{background:#FFF3E0;color:#C25E00;}
.tr-sbars{display:flex;align-items:flex-end;gap:3px;height:56px;margin-top:4px;}
.tr-sbars div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;}
.tr-sbars span.b{width:100%;border-radius:4px 4px 0 0;background:var(--hair);}
.tr-sbars span.b.pk{background:var(--accent);}
.tr-sbars span.m{font-size:10px;color:var(--muted);margin-top:2px;}
.tr-why{font-size:11px;color:var(--ink-2);margin-top:3px;white-space:normal;min-width:220px;max-width:280px;line-height:1.4;}
.tr-tt{font-size:11px;color:var(--muted);margin-left:6px;}
.tr-sub{font-size:11px;color:var(--muted);}
.tr-detail td{background:var(--paper);white-space:normal;text-align:left;padding:var(--s4);}
.tr-dgrid{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1.3fr);gap:var(--s5);}
@media (max-width:760px){.tr-dgrid{grid-template-columns:1fr;}}
.tr-dgrid h4{font-size:12px;color:var(--muted);margin:0 0 var(--s2);font-weight:600;}
.tr-bars div{display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:3px;}
.tr-bars span.k{width:42px;color:var(--ink-2);} .tr-bars span.b{height:8px;border-radius:0 4px 4px 0;background:var(--accent);}
.tr-prod a{color:var(--ink);text-decoration:none;} .tr-prod a:hover{text-decoration:underline;}
.tr-prod li{margin-bottom:4px;font-size:12px;}
.tr-cats{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:var(--s3);}
.tr-cat{background:var(--fill);border-radius:var(--r-ctrl);padding:var(--s3) var(--s4);}
.tr-cat .h{display:flex;justify-content:space-between;font-weight:700;font-size:14px;}
.tr-cat .s{font-size:12px;color:var(--muted);margin-top:2px;}
.tr-two{display:grid;grid-template-columns:1fr 1fr;gap:var(--s5);}
.tr-three{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--s5);}
@media (max-width:980px){.tr-three{grid-template-columns:1fr;}}
@media (max-width:760px){.tr-two{grid-template-columns:1fr;}}
.tr-list{list-style:none;margin:0;padding:0;font-size:13px;}
.tr-list li{display:flex;justify-content:space-between;gap:var(--s3);padding:6px 0;border-bottom:1px solid var(--hair);}
.tr-list li span.t{color:var(--muted);font-size:12px;}
.tr-tip{position:fixed;pointer-events:none;background:var(--ink);color:#fff;font-size:12px;padding:4px 8px;border-radius:6px;z-index:50;display:none;white-space:nowrap;}
.tr-foot{font-size:12px;color:var(--muted);line-height:1.7;}
.tr-foot a{color:var(--accent);}
.tr-dig{display:flex;flex-wrap:wrap;gap:6px;}
.tr-dig a{font-size:12px;font-weight:600;text-decoration:none;color:var(--ink-2);background:var(--fill);border-radius:var(--r-pill);padding:4px 10px;}
.tr-dig a:hover{background:var(--accent-soft);color:var(--accent-press);}
.tr-more{border:0;background:var(--fill);border-radius:var(--r-ctrl);padding:8px 14px;font-family:var(--sans);font-size:13px;font-weight:600;color:var(--ink-2);cursor:pointer;margin-top:var(--s3);}
`;
// '저가라인' 은 priceGap(우리가격÷시장가)이 있어야 나오는데 네이버 쇼핑 API 를 못 써서 영원히 안 나온다.
// 목록에 두면 '0' 칩이 계속 떠서 고장난 것처럼 보인다 — 시장가가 다시 들어오면 되살린다.
const ACTIONS=['재고확보','시즌 준비','시즌 소싱','소싱','밀기','안 팔림 점검','소싱 검토','지켜보기','유지','패스'];
const TODO=['재고확보','시즌 준비','시즌 소싱','소싱','밀기','안 팔림 점검'];
const ACT_HELP={'재고확보':'수요 있는데 우리 상품이 전부 품절','시즌 준비':'시즌 정점이 2개월 안 · 우리 몰에 있음 → 재고·기획전·광고 준비','시즌 소싱':'시즌 정점이 2개월 안 · 우리 몰에 없음 → 지금 들여야 시즌에 맞음','소싱':'뜨는 중 · 우리 몰에 없음','밀기':'뜨는 중 · 우리 상품이 팔리고 있음 → 광고·기획전',
  '안 팔림 점검':'수요 있는데 우리 상품이 안 팔림(30일 0개 또는 검색 1천 건당 0.2개 미만) → 가격·노출·상품명','저가라인':'우리 가격이 시장의 2배 이상',
  '소싱 검토':'꾸준한 큰 수요(월 5천+) · 경쟁 낮음/중간 · 우리 몰에 없음','지켜보기':'뜨는 중이지만 검색이 아직 작음','유지':'상시·보합 수요 · 우리 상품이 팔리고 있음 — 할 일 없음','패스':'그 외'};
const AGE={'10':'10대','20':'20대','30':'30대','40':'40대','50':'50대','60':'60대+'};
const S={data:null,pool:null,shop:null,cfg:null,prods:null,terms:null,sres:null,band:'mid',act:'할 일',theme:'',q:'',onlyNew:false,onlyRising:false,sort:'',dir:-1,open:null,limit:15};
const n=v=>v==null?'—':Number(v).toLocaleString('ko-KR');
const pct=v=>{if(v==null)return '<span class="tr-flat">—</span>';const p=Math.round(v*100);const c=p>=10?'tr-up':p<=-10?'tr-down':'tr-flat';return `<span class="${c}">${p>0?'+':''}${p}%</span>`;};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const bust=()=>'?v='+Math.floor(Date.now()/600000);

function spark(series,w=96,h=24){
  if(!series||series.length<2) return '';
  const v=series.map(p=>p[1]); const mx=Math.max(...v,1), mn=Math.min(...v,0);
  const x=i=>(i/(v.length-1))*(w-4)+2, y=a=>h-2-((a-mn)/(mx-mn||1))*(h-4);
  const d=v.map((a,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(a).toFixed(1)).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
// 상세용 큰 추이 차트 — 호버하면 날짜·지수
function bigChart(series,id){
  if(!series||series.length<2) return '<div class="tr-sub">검색어 트렌드 값 없음</div>';
  const w=520,h=140,pl=28,pb=18; const v=series.map(p=>p[1]); const mx=Math.max(...v,1);
  const x=i=>pl+(i/(v.length-1))*(w-pl-6), y=a=>h-pb-(a/mx)*(h-pb-8);
  const d=v.map((a,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(a).toFixed(1)).join('');
  const grid=[0,.5,1].map(t=>`<line x1="${pl}" x2="${w-6}" y1="${y(mx*t)}" y2="${y(mx*t)}" stroke="var(--hair)"/><text x="${pl-4}" y="${y(mx*t)+4}" font-size="10" fill="var(--muted)" text-anchor="end">${Math.round(mx*t)}</text>`).join('');
  const lab=[0,Math.floor(v.length/2),v.length-1].map(i=>`<text x="${x(i)}" y="${h-4}" font-size="10" fill="var(--muted)" text-anchor="middle">${series[i][0].slice(5)}</text>`).join('');
  return `<svg class="tr-big" data-id="${id}" width="100%" viewBox="0 0 ${w} ${h}" style="max-width:${w}px">${grid}${lab}
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
    <line class="xh" y1="8" y2="${h-pb}" stroke="var(--ink-2)" stroke-width="1" style="display:none"/>
    <circle class="pt" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2" style="display:none"/>
    <rect x="${pl}" y="0" width="${w-pl}" height="${h}" fill="transparent"/></svg>`;
}
function bindBig(root,rowsById){
  const tip=document.querySelector('.tr-tip');
  root.querySelectorAll('svg.tr-big').forEach(svg=>{
    const r=rowsById[svg.dataset.id]; const s=r.trendSeries; if(!s||s.length<2) return;
    const w=520,h=140,pl=28,pb=18; const mx=Math.max(...s.map(p=>p[1]),1);
    svg.addEventListener('mousemove',e=>{
      const b=svg.getBoundingClientRect(); const px=(e.clientX-b.left)/b.width*w;
      const i=Math.max(0,Math.min(s.length-1,Math.round((px-pl)/(w-pl-6)*(s.length-1))));
      const X=pl+(i/(s.length-1))*(w-pl-6), Y=h-pb-(s[i][1]/mx)*(h-pb-8);
      const xh=svg.querySelector('.xh'), pt=svg.querySelector('.pt');
      xh.setAttribute('x1',X);xh.setAttribute('x2',X);xh.style.display='';pt.setAttribute('cx',X);pt.setAttribute('cy',Y);pt.style.display='';
      tip.style.display='block';tip.textContent=`${s[i][0]} · 검색 지수 ${Math.round(s[i][1]*10)/10}`;
      tip.style.left=(e.clientX+12)+'px';tip.style.top=(e.clientY-28)+'px';});
    svg.addEventListener('mouseleave',()=>{tip.style.display='none';svg.querySelector('.xh').style.display='none';svg.querySelector('.pt').style.display='none';});
  });
}
function seasonBars(x){
  const s=x.seasonIdx; if(!s||!s.some(v=>v!=null)) return '<div class="tr-sub">월별 값 없음</div>';
  const mx=Math.max(...s.map(v=>v||0),1);
  return '<div class="tr-sbars">'+s.map((v,i)=>`<div title="${i+1}월 ${v??'—'}배"><span class="b ${i+1===x.peakMonth?'pk':''}" style="height:${Math.max(2,(v||0)/mx*44)}px"></span><span class="m">${i+1}</span></div>`).join('')+'</div>'
    +`<div class="tr-sub" style="margin-top:4px">${x.seasonal?`<b>${x.peakMonth}월 정점</b> · 평소의 ${x.seasonStrength}배 · ${x.monthsToPeak===0?'지금 정점':x.monthsToPeak+'개월 남음'}`:`시즌성 약함 (최고 ${x.seasonStrength??'—'}배)`}</div>`;
}
function bars(obj,label=k=>k){
  const e=Object.entries(obj||{}).sort((a,b)=>String(a[0]).localeCompare(String(b[0]),'ko',{numeric:true}));
  if(!e.length) return '<div class="tr-sub">쇼핑인사이트 값 없음</div>';
  const mx=Math.max(...e.map(x=>x[1]));
  return '<div class="tr-bars">'+e.map(([k,v])=>`<div><span class="k">${esc(label(k))}</span><span class="b" style="width:${Math.max(2,v/mx*120)}px"></span><span>${v}%</span></div>`).join('')+'</div>';
}

// [2026-10-20] 화면에서 재보니 11열 중 3열이 비어 있었다 —
//   '검색수 28일' 100% · '여성' 67% · '유튜브·블로그·카페' 67%. 빈 열은 눈만 가져간다.
//   60% 넘게 비는 열은 안 그린다. 데이터가 다시 들어오면 저절로 살아난다.
function liveCols(rows){
  return COLS.filter(c=>{
    if(c.l) return true;
    const blank=rows.filter(x=>x[c.k]==null||x[c.k]==='').length;
    return !rows.length || blank/rows.length < 0.6;
  });
}
const COLS=[
  {k:'keyword',t:'키워드',l:1},{k:'action',t:'판정 · 할 일',l:1},{k:'ourSales30',t:'우리 몰',l:1},
  {k:'monthlySearch',t:'월간 검색'},{k:'volGrowth28',t:'검색수 28일'},
  {k:'growth4w',t:'4주 추세'},{k:'yoy',t:'전년 대비'},{k:'shopGrowth4w',t:'쇼핑 클릭 4주'},{k:'femaleShare',t:'여성'},
  {k:'adCompetition',t:'광고 경쟁'},{k:'ytViews7d',t:'유튜브·블로그·카페'},
];
function filtered(rows){
  const q=S.q.trim().replace(/\s/g,'');
  let r=rows.filter(x=>(!S.act||(S.act==='할 일'?TODO.includes(x.action):x.action===S.act))&&(!S.theme||x.theme===S.theme)&&(!q||x.keyword.includes(q))
    &&(!S.onlyNew||x.isNew)&&(!S.onlyRising||(x.growth4w||0)>=.2||(x.volGrowth28||0)>=.2||(x.yoy||0)>=.3));
  if(S.sort){const k=S.sort;const comp=k==='adCompetition'?(v=>({'낮음':1,'중간':2,'높음':3}[v]||0)):(v=>v);
    r=[...r].sort((a,b)=>{const A=comp(a[k]),B=comp(b[k]);if(A==null&&B==null)return 0;if(A==null)return 1;if(B==null)return -1;
      return (typeof A==='string'?A.localeCompare(B,'ko'):A-B)*S.dir;});}
  return r;
}
function rowHTML(x,i){
  // [2026-10-20] 상위 상품을 행에 바로 보여준다. 전엔 행을 눌러야 나와서 훑을 수가 없었다.
  const t1=(x.ourTop||[])[0];
  const our=x.ourCount
    ? `${n(x.ourCount)}개 · <b>${n(x.ourSales30)}</b>개 판매<div class="tr-sub">${t1?esc(String(t1.name).slice(0,22))+(t1.soldOut?' · <b>품절</b>':'')+' · 30일 '+n(t1.q30)+'개':'최저 '+(x.ourMinPrice?n(x.ourMinPrice)+'원':'—')}</div>`
    : '<span class="tr-flat">없음</span>';
  const fem=x.femaleShare!=null?`${Math.round(x.femaleShare)}%<div class="tr-sub">${AGE[x.topAge]||''}</div>`:'—';
  const shopc=x.shopCategory?`${pct(x.shopGrowth4w)}<div class="tr-sub">${esc(x.shopCategory)}</div>`:'—';
  const yt=(x.ytViews7d!=null||x.blog7d!=null||x.cafeTotal!=null)?`${x.ytViews7d!=null?n(x.ytViews7d)+'회':'—'}<div class="tr-sub">블로그 ${n(x.blog7d)} · 카페 ${x.cafeNew!=null?'+'+n(x.cafeNew):'—'}</div>`:'—';
  return `<tr class="row" data-i="${i}"><td class="l"><span class="tr-kw">${esc(x.keyword)}</span>${x.isNew?'<span class="tr-badge tr-new">신규</span>':''}${x.isSeed?'<span class="tr-badge tr-seed">씨앗</span>':''}<div class="tr-sub">${esc(x.theme||'')}${x.trendType?' · <span class="tr-sub">'+esc(x.trendType)+'</span>':''}${x.seasonal?' · <b>'+x.peakMonth+'월 시즌</b>':''}</div></td>
  <td class="l"><span class="tr-pill tr-p-${esc(String(x.action).replace(/\s/g,''))}">${esc(x.action)}</span>${x.why?`<div class="tr-why">${esc(x.why)}</div>`:''}</td><td class="l" data-k="ourSales30">${our}</td><td data-k="monthlySearch">${n(x.monthlySearch)}<div class="tr-sub">모바일 ${x.mobileShare!=null?Math.round(x.mobileShare*100)+'%':'—'}</div></td>
  <td data-k="volGrowth28">${pct(x.volGrowth28)}</td><td data-k="growth4w"><div style="display:flex;gap:6px;align-items:center;justify-content:flex-end">${spark(x.trendSeries)}${pct(x.growth4w)}</div></td>
  <td data-k="yoy">${pct(x.yoy)}</td><td data-k="shopGrowth4w">${shopc}</td><td data-k="femaleShare">${fem}</td><td data-k="adCompetition">${esc(x.adCompetition||'—')}</td><td data-k="ytViews7d">${yt}</td></tr>`;
}
function detailHTML(x,i){
  const prods=(x.ourTop||[]).map(p=>`<li><a href="${esc(p.url||('https://www.printbakery.com/product/detail.html?product_no='+p.no))}" target="_blank" rel="noopener">${esc(p.name)}</a> · ${n(p.price)}원 · 30일 ${n(p.q30)}개${p.soldOut?' · <b>품절</b>':''}</li>`).join('')||'<li class="tr-sub">우리 몰에 매칭되는 상품 없음</li>';
  const comp=(x.compTop||[]).map(p=>`<li>${esc(p.name||p.title||'')} ${p.price?'· '+n(p.price)+'원':''}</li>`).join('');
  return `<tr class="tr-detail"><td colspan="99"><div class="tr-dgrid">
    <div><h4>검색 지수 추이 (최근 60일, 네이버 검색어 트렌드)</h4>${bigChart(x.trendSeries,i)}
      <div class="tr-sub" style="margin-top:6px">처음 잡힌 날 ${esc(x.firstSeen||'—')} · 월 클릭 ${n(x.monthlyClicks)} · 클릭률 ${x.ctr!=null?x.ctr+'%':'—'} · 유튜브 7일 ${n(x.yt7d)}개 영상 · 블로그 7일 ${n(x.blog7d)}건(누적 ${n(x.blogTotal)}) · 카페 새 글 ${n(x.cafeNew)}(누적 ${n(x.cafeTotal)})</div></div>
    <div><h4>쇼핑 클릭 연령 (최근 3개월)</h4>${bars(x.ageShare,k=>AGE[k]||k)}
      <h4 style="margin-top:var(--s3)">월별 시즌성 (최근 3년, 평균=1)</h4>${seasonBars(x)}</div>
    <div><h4>우리 몰 상품</h4><ul class="tr-prod" style="padding-left:16px;margin:0">${prods}</ul>
      <h4 style="margin-top:var(--s3)">더 파보기 — 왜 뜨는지는 우리 데이터로 안 나온다</h4>
      <div class="tr-dig">${digLinks(x.keyword)}</div>
      ${comp?`<h4 style="margin-top:var(--s3)">타사 상위</h4><ul class="tr-prod" style="padding-left:16px;margin:0">${comp}</ul>`
        :`<h4 style="margin-top:var(--s3)">시장가</h4><div class="tr-sub">네이버 쇼핑 상품·가격은 자동으로 못 가져온다 —
          API HUB 에 쇼핑 경로가 없고(404) 개발자센터 키는 신규 발급이 막혔다.
          위 '네이버 쇼핑' 링크로 직접 봐야 한다.</div>`}</div>
  </div></td></tr>`;
}
function renderTable(){
  const run=S.data.runs[S.data.runs.length-1]; const all=run.rows;
  const rows=filtered(all); const shown=rows.slice(0,S.limit);
  const CL=liveCols(rows);
  const box=document.getElementById('trTable');
  box.innerHTML=`<div class="tr-scroll"><table class="tr-t"><thead><tr>${CL.map(c=>`<th class="${c.l?'l':''} ${S.sort===c.k?'sorted':''}" data-k="${c.k}">${c.t}${S.sort===c.k?(S.dir<0?' ↓':' ↑'):''}</th>`).join('')}</tr></thead>
   <tbody>${shown.map((x,i)=>rowHTML(x,i)+(S.open===x.keyword?detailHTML(x,i):'')).join('')||`<tr><td colspan="99" class="l tr-sub">조건에 맞는 키워드가 없습니다</td></tr>`}</tbody></table></div>
   <div class="tr-sub" style="margin-top:6px">${rows.length}개 중 ${shown.length}개 표시 · 행을 누르면 추이·연령·우리 상품이 열립니다</div>
   ${rows.length>shown.length?'<button class="tr-more" id="trMore">더 보기</button>':''}`;
  // 비어 있는 열은 셀까지 걷어낸다 (헤더만 빼면 줄이 어긋난다)
  const keep=new Set(CL.map(c=>c.k));
  COLS.filter(c=>!c.l&&!keep.has(c.k)).forEach(c=>
    box.querySelectorAll(`td[data-k="${c.k}"]`).forEach(td=>td.remove()));
  const byId={}; shown.forEach((x,i)=>byId[i]=x);
  box.querySelectorAll('th').forEach(th=>th.onclick=()=>{const k=th.dataset.k;if(S.sort===k)S.dir*=-1;else{S.sort=k;S.dir=(k==='keyword'||k==='theme'||k==='action')?1:-1;}renderTable();});
  box.querySelectorAll('tr.row').forEach(tr=>tr.onclick=()=>{const x=shown[+tr.dataset.i];S.open=S.open===x.keyword?null:x.keyword;renderTable();});
  const m=document.getElementById('trMore'); if(m) m.onclick=()=>{S.limit+=30;renderTable();};
  bindBig(box,byId);
}
// [2026-10-20] 버튼 9개가 같은 무게로 늘어서 있어서 뭘 먼저 눌러야 할지 안 보였다.
//   급한 순(재고확보 → 시즌 소싱 → 소싱 검토 → 안 팔림 점검 → 시즌 준비 → 밀기)으로 세우고
//   참고군(유지·패스·전체)은 흐리게 뒤로 뺀다.
const URGENT=['재고확보','시즌 소싱','소싱 검토','안 팔림 점검','시즌 준비','밀기'];
function renderActs(){
  const rows=S.data.runs[S.data.runs.length-1].rows; const cnt={}; rows.forEach(r=>cnt[r.action]=(cnt[r.action]||0)+1);
  const el=document.getElementById('trActs');
  const todo=rows.filter(r=>TODO.includes(r.action)).length;
  const btn=(a,label,num,cls)=>`<button class="tr-act ${cls||''} ${S.act===a?'on':''}" data-a="${esc(a)}" title="${esc(ACT_HELP[a]||'')}"><span class="n">${num}</span><span class="l">${esc(label)}</span></button>`;
  el.innerHTML = btn('할 일','할 일',todo,'lead')
    + URGENT.filter(a=>cnt[a]).map(a=>btn(a,a,cnt[a])).join('')
    + '<span class="tr-sep"></span>'
    + ['유지','패스','지켜보기','저가라인','소싱'].filter(a=>cnt[a]).map(a=>btn(a,a,cnt[a],'dim')).join('')
    + btn('','전체',rows.length,'dim');
  el.querySelectorAll('.tr-act').forEach(b=>b.onclick=()=>{S.act=b.dataset.a;S.limit=15;renderActs();renderTable();});
}
function renderCats(){
  const c=(S.shop||{}).categories||{}; const el=document.getElementById('trCats');
  const e=Object.entries(c); if(!e.length){el.innerHTML='<div class="tr-sub">쇼핑인사이트 데이터가 아직 없습니다</div>';return;}
  el.innerHTML='<div class="tr-cats">'+e.map(([name,v])=>{const top=Object.entries(v.age||{}).sort((a,b)=>b[1]-a[1])[0];
    return `<div class="tr-cat"><div class="h"><span>${esc(name)}</span><span>${pct(v.growth4w)}</span></div>
    <div style="margin:6px 0">${spark(v.series,220,36)}</div>
    <div class="s">전년 대비 ${pct(v.yoy)} · 여성 ${v.gender&&v.gender.f!=null?Math.round(v.gender.f)+'%':'—'} · 주 연령 ${top?AGE[top[0]]+' '+Math.round(top[1])+'%':'—'}</div></div>`;}).join('')+'</div>';
}
// ── 오늘 뜨는 중간·상세 검색어 ───────────────────────────────────────────
// [2026-10-12] trend-metrics.json 의 상위 목록은 score 가 월간검색수와 상관 1.00 이라
//   검색량 큰 것만 올라온다. 실측: 풀 1,200개 중 1천~3천 구간 303개가 화면에 0개였다.
//   여기서는 keyword-pool.json(풀 전체 + 일별 hist)을 직접 읽어 '급상승' 순으로 다시 세운다.
//   hist 가 7일치라 순위가 매일 바뀐다 — 고정 목록이 아니라 '오늘 뜨는 것'이 나온다.
const BANDS={tail:[0,1000,'상세 (1천 미만)'],mid:[1000,5000,'중간 (1천~5천)'],head:[5000,1e9,'머리 (5천+)'],all:[0,1e9,'전체']};
const BUCKETS=[
 {id:'push',t:'즉시 노출',d:'상품은 있는데 30일 0개 — 구좌·기획전에 올리면 되는 것. 돈이 안 든다.',
  f:x=>x.n>0&&x.sold===0&&x.spike>=.10, s:(a,b)=>b.spike-a.spike},
 {id:'ad',t:'광고 후보',d:'이미 팔리는 중 + 수요 상승 — 광고를 태우면 바로 받는 것.',
  f:x=>x.n>0&&x.sold>0&&x.spike>=.05, s:(a,b)=>b.sold-a.sold},
 {id:'src',t:'소싱 검토',d:'수요는 오르는데 우리 상품이 없고 광고 경쟁이 높지 않은 것.',
  f:x=>x.n===0&&x.spike>=.15&&x.comp!=='높음', s:(a,b)=>b.spike-a.spike}];
function poolSpike(e){
  const h=e.hist||{}; const d=Object.keys(h).sort();
  if(d.length<2) return {cur:0,spike:null,days:d.length};
  const avg=a=>a.length?a.reduce((x,y)=>x+(y||0),0)/a.length:0;
  const recent=avg(d.slice(-3).map(k=>h[k])), base=avg(d.slice(0,3).map(k=>h[k]));
  return {cur:h[d[d.length-1]]||0, spike: base?recent/base-1:null, days:d.length};
}
// 테마 사전이 '쿠션' 같은 일반어를 잡아 화장품·식품이 섞인다. radar-config 의 제외어로 화면에서도 거른다
// (제외어를 고쳐도 slackbot 이 다음 날 아침에야 풀에서 지우므로, 여기서 한 겹 더 막는다).
function offDomain(k){ const ex=(S.cfg||{}).exclude||[]; return ex.some(w=>w&&k.includes(w)); }
function risingRows(){
  const P=(S.pool||{}).keywords||{}; const H=S.prods;
  const band=BANDS[S.band]||BANDS.mid;
  const out=[];
  for(const k in P){
    const e=P[k]; const {cur,spike}=poolSpike(e);
    if(spike==null||!(cur>=band[0]&&cur<band[1])) continue;
    if(offDomain(k)) continue;
    let n=0,sold=0;
    if(H){ const kk=k.replace(/\s+/g,''); for(let i=0;i<H.length;i++) if(H[i].s.includes(kk)){n++;sold+=H[i].q;} }
    out.push({k,cur,spike,theme:e.theme||'',comp:e.adCompetition||'—',n,sold});
  }
  return out;
}
function renderRising(){
  const el=document.getElementById('trRise2'); if(!el) return;
  if(!S.pool){ el.innerHTML='<div class="tr-sub">키워드 풀 불러오는 중…</div>'; return; }
  const rows=risingRows();
  const matched=!!S.prods;
  const cols=BUCKETS.map(b=>{
    const list=rows.filter(b.f).sort(b.s).slice(0,10);
    const items=list.map(x=>`<li><span>${esc(x.k)} <span class="t">${esc(x.theme)}</span>${links(x.k)}</span>`
      +`<span>${pct(x.spike)} <span class="t">${n(x.cur)}</span>${x.n?` <span class="t">· 상품 ${n(x.n)}${x.sold?' · '+n(x.sold)+'개 팔림':''}</span>`:''}</span></li>`).join('')
      || `<li class="tr-sub">${matched?'해당 없음':'우리 상품 대조 중…'}</li>`;
    return `<div><h4 class="tr-sub" style="font-weight:600;margin:0 0 2px">${b.t} <span style="font-weight:400">(${list.length})</span></h4>`
      +`<div class="tr-sub" style="margin:0 0 6px">${esc(b.d)}</div><ul class="tr-list">${items}</ul></div>`;
  }).join('');
  el.innerHTML=`<div class="tr-filters">
      <select id="trBand">${Object.entries(BANDS).map(([k,v])=>`<option value="${k}" ${S.band===k?'selected':''}>${v[2]}</option>`).join('')}</select>
      <span class="tr-sub">대상 ${n(rows.length)}개 · 제외어로 거른 뒤 · 상승률 = 최근 3일 평균 ÷ 가장 이른 3일 평균</span></div>
    <div class="tr-three">${cols}</div>`;
  const sel=document.getElementById('trBand');
  if(sel) sel.onchange=e=>{S.band=e.target.value;renderRising();};
}
// ── 금액 · 시즌 히트맵 · 기회 맵 ────────────────────────────────────
// [2026-10-21] 지금까지 전부 같은 모양의 회색 표였고 개수·검색수로만 말했다.
//   12개월 seasonIdx 와 amt30(금액)을 갖고 있으면서 표 안 숫자로만 쓰고 있었다.
const MONS=['1','2','3','4','5','6','7','8','9','10','11','12'];
const won=v=>v>=1e8?(v/1e8).toFixed(1)+'억':v>=1e4?Math.round(v/1e4).toLocaleString('ko-KR')+'만':Math.round(v).toLocaleString('ko-KR');

function moneyCards(){
  const rows=S.data.runs[S.data.runs.length-1].rows;
  const ps=S.prodsRaw||[];
  // 1점짜리 원화는 품절이 정상이라 섞으면 안 된다 — 반복 판매(30일 2개 이상)만 센다
  const rep=ps.filter(p=>(p.q30||0)>=2&&p.soldOut), one=ps.filter(p=>(p.q30||0)===1&&p.soldOut);
  const repAmt=rep.reduce((s,p)=>s+(p.amt30||0),0), oneAmt=one.reduce((s,p)=>s+(p.amt30||0),0);
  const off=ps.filter(p=>(p.stock||0)>0&&(!p.display||!p.selling));
  const offStock=off.reduce((s,p)=>s+(p.stock||0),0);
  const idle=rows.filter(r=>(r.monthlySearch||0)>=5000&&(r.ourCount||0)>0&&(r.ourSales30||0)===0);
  const idleSearch=idle.reduce((s,r)=>s+r.monthlySearch,0);
  const card=(tone,big,unit,title,sub,link)=>`<div class="tr-money ${tone}">
    <div class="tm-t">${title}</div><div class="tm-b">${big}<span class="tm-u">${unit}</span></div>
    <div class="tm-s">${sub}</div>${link?`<a class="tm-l" href="?m=ops">${link}</a>`:''}</div>`;
  return `<div class="tr-moneys">
    ${card('hot', won(repAmt),'원','품절로 멈춘 매출',
      `반복 판매 ${rep.length}종의 최근 30일 매출 · 재입고 안 하면 계속 발생<br><span class="t">1점짜리 원화 ${one.length}종 ${won(oneAmt)}원은 제외 — 품절이 정상</span>`,
      '재고 확보 '+rep.length+'건 →')}
    ${card('warn', nfmt(offStock),'개','진열이 꺼진 재고',
      `${off.length}종이 재고가 있는데 미진열·판매중지 상태`, '진열 확인 '+off.length+'건 →')}
    ${card('', nfmt(idleSearch),'회','수요는 있는데 판매 0',
      `월 검색 ${nfmt(idleSearch)}회짜리 ${idle.length}개 키워드에 우리 상품이 있는데 30일 판매가 없다`,
      '상품 점검 '+idle.length+'건 →')}
  </div>`;
}
const nfmt=v=>Number(v||0).toLocaleString('ko-KR');

function heatmap(){
  const rows=S.data.runs[S.data.runs.length-1].rows;
  const by={};
  rows.forEach(r=>{const si=r.seasonIdx; if(!si||si.length!==12)return;
    const t=r.theme||'기타'; (by[t]=by[t]||[]).push([r.monthlySearch||0,si,r]);});
  const now=new Date().getMonth();
  const themes=Object.keys(by).sort((a,b)=>by[b].reduce((s,x)=>s+x[0],0)-by[a].reduce((s,x)=>s+x[0],0));
  const cell=v=>{
    const c=v>=1.3?4:v>=1.15?3:v>=1.0?2:v>=0.85?1:0;
    return `<div class="hm-c hm-${c}" title="지수 ${v.toFixed(2)}">${v>=1.15?v.toFixed(1):''}</div>`;
  };
  const body=themes.map(t=>{
    const v=by[t], tot=v.reduce((s,x)=>s+x[0],0)||1;
    const avg=[...Array(12)].map((_,m)=>v.reduce((s,x)=>s+x[0]*x[1][m],0)/tot);
    const top=[...v].sort((a,b)=>b[1][(now+1)%12]-a[1][(now+1)%12])[0];
    return `<div class="hm-row" data-t="${esc(t)}"><div class="hm-n">${esc(t)}<div class="t">${esc(top?top[2].keyword:'')}</div></div>
      ${avg.map((a,m)=>`<div class="hm-w ${m===now?'now':''}">${cell(a)}</div>`).join('')}</div>`;
  }).join('');
  return `<div class="hm">
    <div class="hm-row hm-head"><div class="hm-n"></div>${MONS.map((m,i)=>`<div class="hm-w ${i===now?'now':''}">${m}</div>`).join('')}</div>
    ${body}
    <div class="tr-sub" style="margin-top:8px">최근 3년 월별 검색 지수(평균=1)를 검색량으로 가중한 값. 진할수록 그 달에 몰린다.
      세로줄이 이번 달이다 — <b>소싱은 한 달 뒤 도착</b>이라 한 칸 오른쪽을 봐야 한다.</div></div>`;
}

function oppMap(){
  const rows=S.data.runs[S.data.runs.length-1].rows.filter(r=>r.monthlySearch>0);
  const W=760,H=320,P=46;
  const xs=rows.map(r=>Math.log10(r.monthlySearch)), ys=rows.map(r=>Math.log10((r.ourSales30||0)+1));
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=0,y1=Math.max(...ys,1);
  const px=v=>P+(Math.log10(v)-x0)/(x1-x0||1)*(W-P-14);
  const py=v=>H-P-(Math.log10((v||0)+1)-y0)/(y1-y0||1)*(H-P-16);
  const mx=px(Math.pow(10,(x0+x1)/2)), my=py(Math.pow(10,(y0+y1)/2)-1);
  const dot=r=>{const hot=(r.ourSales30||0)===0&&r.monthlySearch>=8000;
    return `<circle cx="${px(r.monthlySearch).toFixed(1)}" cy="${py(r.ourSales30).toFixed(1)}" r="${hot?5:3.2}"
      class="op-dot ${hot?'hot':''}" data-k="${esc(r.keyword)}"><title>${esc(r.keyword)} · 검색 ${nfmt(r.monthlySearch)} · 30일 ${nfmt(r.ourSales30||0)}개</title></circle>`;};
  const lbl=rows.filter(r=>(r.ourSales30||0)===0&&r.monthlySearch>=12000).slice(0,7)
    .map(r=>`<text x="${(px(r.monthlySearch)+7).toFixed(1)}" y="${(py(r.ourSales30)+3).toFixed(1)}" class="op-lb">${esc(r.keyword)}</text>`).join('');
  return `<div class="opm"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <rect x="${P}" y="${my}" width="${mx-P}" height="${H-P-my}" class="op-q"/>
    <line x1="${mx}" y1="14" x2="${mx}" y2="${H-P}" class="op-ax"/><line x1="${P}" y1="${my}" x2="${W-14}" y2="${my}" class="op-ax"/>
    <text x="${P+8}" y="${H-P-8}" class="op-qt">수요는 큰데 우리가 약하다 — 소싱·점검</text>
    ${rows.map(dot).join('')}${lbl}
    <text x="${W-14}" y="${H-14}" text-anchor="end" class="op-lb">시장 검색 수요 →</text>
    <text x="8" y="22" class="op-lb">↑ 우리 30일 판매</text>
  </svg><div class="tr-sub">점 하나가 키워드다. 빨간 점은 <b>월 8,000회 넘게 찾는데 30일 판매가 0</b>인 것. 누르면 그 키워드로 표가 걸러진다.</div></div>`;
}

// ── 이번 주 할 일 ──────────────────────────────────────────────────
// [2026-10-19] 데이터만 쌓고 판단을 안 만들어놨다는 지적을 받고 붙였다.
//   키워드 판정 · 브랜드 사전 · 몰 검색 0건이 따로 놀고 있었다. 한 줄에 묶는다:
//   무엇을 / 왜 지금 / 우리 상태 / 어느 브랜드로.
function renderViz(){
  const el=document.getElementById('trViz'); if(!el||!S.data) return;
  el.innerHTML=(S.prodsRaw?moneyCards():'')
    +`<div class="tr-card"><h2>언제 뭐가 뜨나</h2><p class="tr-lead">최근 3년 월별 검색 지수. 세로줄이 이번 달 — 소싱은 한 달 뒤 도착이라 한 칸 오른쪽을 본다.</p>${heatmap()}</div>`
    +`<div class="tr-card"><h2>기회 맵</h2><p class="tr-lead">왼쪽 위 칸이 '시장은 찾는데 우리는 못 파는' 자리다.</p>${oppMap()}</div>`;
  el.querySelectorAll('.op-dot').forEach(c=>c.onclick=()=>{S.q=c.dataset.k;S.act='';S.limit=15;
    const q=document.getElementById('trQ'); if(q) q.value=c.dataset.k;
    renderActs();renderTable();document.getElementById('trTable').scrollIntoView({behavior:'smooth',block:'start'});});
  el.querySelectorAll('.hm-row[data-t]').forEach(r=>r.onclick=()=>{S.theme=r.dataset.t;S.act='';S.limit=15;
    const t=document.getElementById('trTheme'); if(t) t.value=r.dataset.t;
    renderActs();renderTable();document.getElementById('trTable').scrollIntoView({behavior:'smooth',block:'start'});});
}
function renderAction(){
  const el=document.getElementById('trAct'); if(!el) return;
  const run=S.data.runs[S.data.runs.length-1];
  const rows=run.rows||[], bd=run.brandDict||[];
  const byCat={};
  for(const b of bd){ if(b.ours) continue; for(const c of (b.cats||[])) (byCat[c]=byCat[c]||[]).push(b); }
  const brandsFor=kw=>{
    const k=String(kw).replace(/\s+/g,''); const seen={}, out=[];
    for(const c in byCat){ if(c.includes(k)||k.includes(c)) for(const b of byCat[c]) if(!seen[b.name]){seen[b.name]=1;out.push(b);} }
    // [2026-10-20] 검색 수요가 확인된 것만 보여준다. 카테고리마다 질이 갈린다 —
    //   조명/러그는 브랜드가 나오지만(베르판·사이잘·파펠리나) 액자/굿즈/캔들은
    //   '○○브랜드' 로 물으면 판촉물·DIY 업체가 나온다(칫솔살균기·이모티콘만들기·퀼트천).
    //   쓰레기를 보여주느니 비워두는 게 낫다.
    return out.filter(b=>b.search>0).sort((a,b)=>b.search-a.search).slice(0,5);
  };
  const bchips=bs=>bs.length?bs.map(b=>`<a href="https://search.naver.com/search.naver?query=${encodeURIComponent(b.name)}" target="_blank" rel="noopener" class="tr-pill" style="background:var(--fill);color:var(--ink-2);text-decoration:none" title="${b.search?n(b.search)+' 검색':'검색 수요 미포착'} · ${esc((b.cats||[]).join(' · '))}">${esc(b.name)}</a>`).join(' ')
    :'<span class="t">후보 없음 — 사전이 더 쌓여야 한다</span>';

  // 1) 광고로 데려왔는데 보여줄 게 없다. 가장 급하다.
  const T=(S.sres||{}).terms||[];
  // 광고든 자연이든 '수요는 왔는데 물건이 없다'가 핵심이다. 광고비만 보면 작가 이름들이 빠진다.
  const burn=T.filter(x=>x.results===0&&(x.organic+x.paid)>=20).sort((a,b)=>(b.organic+b.paid)-(a.organic+a.paid)).slice(0,10);
  const burnHTML=burn.length?`<table class="tr-t"><thead><tr><th>검색어</th><th>광고 세션</th><th>자연 유입</th><th>할 일</th></tr></thead><tbody>`
    +burn.map(x=>`<tr><td><b>${esc(x.term)}</b> ${links(x.term)}</td><td>${n(x.paid)}</td><td>${n(x.organic)}</td>`
      +`<td>0건 — 소싱하거나, 이미 있으면 검색어를 연결한다</td></tr>`).join('')+'</tbody></table>':'';

  const pick=(acts,why,what)=>rows.filter(r=>acts.includes(r.action)).sort((a,b)=>b.score-a.score).slice(0,8)
    .map(r=>({r, why:why(r), what:what(r), bs:brandsFor(r.keyword)}));
  const MON=['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const grp=(title,items,note)=>items.length?`<div style="margin-top:14px"><h4 class="tr-sub" style="font-weight:600;margin:0 0 2px">${title} (${items.length})</h4>`
    +`<div class="tr-sub" style="margin:0 0 6px">${note}</div>`
    +`<table class="tr-t"><thead><tr><th>품목</th><th>왜 지금</th><th>우리 상태</th><th>소싱 후보</th></tr></thead><tbody>`
    +items.map(({r,why,what,bs})=>`<tr><td><b>${esc(r.keyword)}</b> ${links(r.keyword)}</td><td>${why}</td><td>${what}</td><td>${bchips(bs)}</td></tr>`).join('')
    +'</tbody></table></div>':'';

  const vol=r=>`검색 ${n(r.monthlySearch)}`;
  const peak=r=>r.peakMonth?` · ${MON[r.peakMonth-1]} 정점`:'';
  const have=r=>`보유 ${n(r.ourCount||0)}종 · 30일 ${n(r.ourSales30||0)}개`;

  el.innerHTML=(burnHTML?`<div><h4 class="tr-sub" style="font-weight:600;margin:0 0 2px">찾아왔는데 물건이 없다 (${burn.length})</h4>`
      +`<div class="tr-sub" style="margin:0 0 6px">몰에서 이름을 쳤는데 결과 0건. 이미 온 수요라 제일 급하다.</div>${burnHTML}</div>`:'')
    + grp('지금 들여야 시즌에 맞는다', pick(['시즌 소싱'],r=>vol(r)+peak(r),r=>'우리 몰에 없음'), '정점이 2개월 안이다.')
    + grp('소싱 검토', pick(['소싱 검토'],vol,r=>'우리 몰에 없음'), '수요는 있고 우리에겐 없다.')
    + grp('품절 — 재고 확보', pick(['재고확보'],vol,have), '수요가 있는데 전부 품절이다.')
    + grp('있는데 안 팔린다', pick(['안 팔림 점검'],vol,have), '상품·가격·노출 중 하나가 문제다. 같은 카테고리에서 뭐가 도는지 같이 본다.')
    + grp('시즌 준비', pick(['시즌 준비'],r=>vol(r)+peak(r),have), '보유 중 — 재고·기획전·광고를 당긴다.')
    || '<div class="tr-sub">할 일 없음</div>';
}

// ── 브랜드 사전 ────────────────────────────────────────────────────
// [2026-10-19] 앞선 세 경로(블로그 제목·유튜브 태그·연관검색어 잔여)가 전부 '브랜드 사전이
//   없다'는 같은 이유로 실패했다. 사전을 **사오려** 했더니 공짜 카탈로그가 안 남아 있었다
//   (네이버 쇼핑 종료·구글 CSE 신규 불가·Bing 종료·Brave 무료 폐지·오늘의집 robots 금지).
//   → 사오지 말고 만든다. 이미 쓰는 검색광고 API 에 '조명브랜드' 로 물으면 브랜드가 온다.

// ── 카테고리에 붙는 말 ──────────────────────────────────────────────
// [2026-10-19] **이건 브랜드 목록이 아니다.** 연관검색어에서 카테고리 단어를 떼고 남는 말이고,
//   그 대부분은 수식어다 — 소재(페르시안·아로마·우드) · 대상(장모님·어르신) · 주제(달마도·모나리자) ·
//   용도(도시락·케이스) · 지명(이천·남대문). 브랜드는 소수다.
//   처음엔 '브랜드·작가 후보'로 띄웠는데 Su 가 바로 짚었다 — 페르시안이 브랜드로 보이냐고. 맞는 말이다.
//   고유명사/일반명사를 가를 수단이 없다. 길이·로마자·'○○ 브랜드' 문서비중 전부 약한 대리지표고
//   실제로 '하기'가 브랜드성 1위(42%)로 올라온다.
//   → 제대로 하려면 brand 필드가 있는 **쇼핑 카탈로그**가 있어야 한다. 그러면 추측이 조회가 된다.
//   그 전까지는 '우리 카테고리에 사람들이 뭘 붙여 찾나'로 읽는다 — 워셔블러그·단모러그·대용량디퓨저.

// ── 몰 안 검색어 (광고 제외) ────────────────────────────────────────────
// [2026-10-12] 워커 tab=searchterms. 광고로 들어온 세션은 '우리 몰에서 뭘 찾는지'가 아니라
//   '광고가 뭘 보여줬는지'라 수요로 읽으면 안 된다. 실측: 전체 22,811 중 10,230(45%)이 광고였고
//   'lee bae' 는 1,781 중 1,455 가 광고라 빼면 326 으로 5분의 1이 된다.
//   결과 수는 GA4 가 모르므로 상품 스냅샷과 대조해 '상품 0개'를 찾는다.
// search-results.json(매일 06:20 배치, 검색어 1,200개 전수)이 있으면 그걸 쓰고,
// 없으면 워커가 즉석에서 센 상위 24개로 버틴다.
function searchRows(){
  const code=/^B[0-9A-Z]{6,}$/i, enc=/%[0-9A-F]{2}/i;
  const batch=(S.sres||{}).terms;
  const byTerm={}; for(const b of (batch||[])) byTerm[b.term]=b;
  const T=(S.terms||{}).terms||[];
  return T.map(x=>({...x, ...(byTerm[x.term]||{}), junk:code.test(x.term)||enc.test(x.term)}));
}
function renderSearch(){
  const el=document.getElementById('trSearch'); if(!el) return;
  if(!S.terms){ el.innerHTML='<div class="tr-sub">검색어 불러오는 중…</div>'; return; }
  if(S.terms.error){ el.innerHTML='<div class="tr-sub">검색어를 불러오지 못했습니다: '+esc(String(S.terms.error)).slice(0,120)+'</div>'; return; }
  const R=searchRows(), has=!!(S.sres&&S.sres.counted);
  const res=x=>x.results==null?'<span class="t">—</span>':(x.results===0?'<b style="color:var(--down)">0건</b>':n(x.results)+'건');
  const li=x=>`<li><span>${esc(x.term)} ${links(x.term)}${x.brands&&x.brands.length?`<div class="tr-sub">${esc(x.brands.join(', ')).slice(0,60)}</div>`:''}</span>`
    +`<span>${n(x.organic)}<span class="t"> 세션${x.paid?' · 광고 '+n(x.paid):''} · </span>${res(x)}</span></li>`;
  const top=R.filter(x=>!x.junk).slice(0,15);
  const bad=R.filter(x=>!x.junk&&x.results!=null&&x.results<=3).sort((a,b)=>b.organic-a.organic).slice(0,15);
  const sp=R.filter(x=>x.noSpace).sort((a,b)=>b.organic-a.organic).slice(0,8);
  const adHeavy=R.filter(x=>!x.junk&&x.total>=40&&x.paid/x.total>=.5).sort((a,b)=>b.paid-a.paid).slice(0,10);
  const junk=R.filter(x=>x.junk&&x.organic>=5).sort((a,b)=>b.organic-a.organic).slice(0,8);
  const rank=(S.sres||{}).ranking||[];
  el.innerHTML=`<div class="tr-two">
    <div><h4 class="tr-sub" style="font-weight:600;margin:0 0 2px">많이 찾는 것 (광고 제외 상위 15)</h4>
      <div class="tr-sub" style="margin:0 0 6px">'건'은 우리 검색 API(<code>/v1/search/products</code>)의 total — 사용자가 보는 그 숫자다.</div>
      <ul class="tr-list">${top.map(li).join('')||'<li class="tr-sub">없음</li>'}</ul></div>
    <div><h4 class="tr-sub" style="font-weight:600;margin:0 0 2px">결과가 없거나 얇은 것 (${bad.length})</h4>
      <div class="tr-sub" style="margin:0 0 6px">0건은 소싱·표기, 1~3건은 상품이 모자란 것.</div>
      <ul class="tr-list">${has?(bad.map(li).join('')||'<li class="tr-sub">없음</li>'):'<li class="tr-sub">search-results.json 이 아직 없습니다</li>'}</ul></div></div>
   ${rank.length?`<div style="margin-top:12px"><h4 class="tr-sub" style="font-weight:600;margin:0 0 4px">몰 실시간 인기 검색어 (우리 API)</h4>
     <div style="display:flex;flex-wrap:wrap;gap:6px">${rank.slice(0,10).map(r=>`<span class="tr-pill" style="background:var(--fill);color:var(--ink-2)">${r.new_rank}. ${esc(r.keyword)}${r.old_rank&&r.old_rank!==r.new_rank?` <span class="t">${r.old_rank>r.new_rank?'▲':'▼'}</span>`:''}</span>`).join('')}</div></div>`:''}
   ${sp.length?`<div class="tr-sub" style="margin-top:10px"><b>띄어쓰기 때문에 0건</b> — 공백을 빼면 결과가 나온다:<br>${sp.map(x=>esc(x.term)+' → '+n(x.noSpace)+'건').join(' · ')}</div>`:''}
   ${adHeavy.length?`<div class="tr-sub" style="margin-top:8px"><b>광고가 절반 넘는 검색어</b> — 수요가 아니라 광고가 보여준 것이다:<br>${adHeavy.map(x=>esc(x.term)+' ('+n(x.paid)+'/'+n(x.total)+')').join(' · ')}</div>`:''}
   ${junk.length?`<div class="tr-sub" style="margin-top:8px"><b>깨진 검색어</b> — 인코딩이 안 풀렸거나 공급사 코드다:<br>${junk.map(x=>esc(x.term)+' ('+n(x.organic)+')').join(' · ')}</div>`:''}
   <div class="tr-sub" style="margin-top:8px">최근 30일 · <b>광고 유입 제외</b> · 검색어 ${n(R.length)}개${has?` · 결과 수는 매일 06:20 배치(${esc((S.sres.window||{}).to||'')})`:''}</div>`;
}

// 키워드 하나를 바깥에서 더 파볼 수 있는 링크 — 어디서 왜 뜨는지는 우리 데이터로 안 나온다
// 상세 패널용 — 작게 붙는 links() 와 달리 눌러보기 쉬운 버튼
function digLinks(k){
  const e=encodeURIComponent(k), h=encodeURIComponent(k.replace(/\s+/g,''));
  const L=[
    ['네이버 뉴스',`https://search.naver.com/search.naver?where=news&sort=1&query=${e}`,'최신순 — 왜 갑자기 뜨는지는 보통 여기에 있다'],
    ['네이버 통합',`https://search.naver.com/search.naver?query=${e}`,'연관검색어·인기글'],
    ['데이터랩',`https://datalab.naver.com/keyword/trendResult.naver?hashKey=&query=${e}`,'기간·성별·연령 직접 조정'],
    ['네이버 쇼핑',`https://search.shopping.naver.com/search/all?query=${e}`,'경쟁 상품·가격대'],
    ['유튜브 최신',`https://www.youtube.com/results?search_query=${e}&sp=CAI%253D`,'어떻게 쓰이는지'],
    ['인스타 태그',`https://www.instagram.com/explore/tags/${h}/`,'요즘 어떤 사진으로 도는지'],
    ['구글',`https://www.google.com/search?q=${e}`,''],
    ['구글 뉴스',`https://news.google.com/search?q=${e}&hl=ko`,''],
  ];
  return L.map(([t,u,d])=>`<a href="${u}" target="_blank" rel="noopener" title="${esc(d)}">${t}</a>`).join('');
}
function links(k){
  const e=encodeURIComponent(k);
  const a=(u,t,lab)=>`<a href="${u}" target="_blank" rel="noopener" title="${t}" style="color:var(--muted);text-decoration:none;font-size:11px;margin-left:5px">${lab}</a>`;
  return a(`https://search.naver.com/search.naver?query=${e}`,'네이버 통합검색','N')
       + a(`https://search.naver.com/search.naver?where=news&query=${e}`,'네이버 뉴스','뉴스')
       + a(`https://datalab.naver.com/keyword/trendResult.naver?hashKey=&query=${e}`,'네이버 데이터랩','랩')
       + a(`https://www.google.com/search?q=${e}`,'구글','G')
       + a(`https://www.youtube.com/results?search_query=${e}&sp=CAI%253D`,'유튜브 (최신순)','YT')
       + a(`https://www.instagram.com/explore/tags/${encodeURIComponent(k.replace(/\s+/g,''))}/`,'인스타그램 해시태그','IG');
}

function renderPool(){
  const el=document.getElementById('trPool'); const p=(S.pool||{}).keywords; if(!p){el.innerHTML='<div class="tr-sub">불러오는 중…</div>';return;}
  const last=h=>{const k=Object.keys(h||{}).sort();return k.length?h[k[k.length-1]]:null;};
  const arr=Object.entries(p).map(([k,e])=>({k,theme:e.theme,first:e.firstSeen,vol:last(e.hist),g:e.volGrowth28}));
  const newest=arr.filter(a=>a.first===arr.reduce((m,b)=>b.first>m?b.first:m,'')).sort((a,b)=>b.vol-a.vol).slice(0,15);
  const rising=arr.filter(a=>a.g!=null&&a.vol>=500).sort((a,b)=>b.g-a.g).slice(0,15);
  const li=(a,right)=>`<li><span>${esc(a.k)} <span class="t">${esc(a.theme||'')}</span></span><span>${right}</span></li>`;
  el.innerHTML=`<div class="tr-two"><div><h4 class="tr-sub" style="font-weight:600;margin:0 0 6px">가장 최근에 풀에 들어온 키워드 (${esc(newest[0]?.first||'')})</h4><ul class="tr-list">${newest.map(a=>li(a,n(a.vol)+'회/월')).join('')}</ul></div>
   <div><h4 class="tr-sub" style="font-weight:600;margin:0 0 6px">월간 검색수가 28일 새 가장 많이 늘어난 키워드</h4><ul class="tr-list">${rising.length?rising.map(a=>li(a,pct(a.g)+' · '+n(a.vol))).join(''):'<li class="tr-sub">기록이 28일 쌓이면 나옵니다</li>'}</ul></div></div>
   <div class="tr-sub" style="margin-top:8px">풀 전체 ${n(arr.length)}개 · 매일 씨앗 키워드의 연관어로 넓혀 가고, 검색수가 오른 키워드를 다음 날 2차 씨앗으로 씁니다</div>`;
}
window.loadTrendTab=async function(){
  if(!document.getElementById('trCss')){const s=document.createElement('style');s.id='trCss';s.textContent=CSS;document.head.appendChild(s);
    const t=document.createElement('div');t.className='tr-tip';document.body.appendChild(t);}
  const c=document.getElementById('content');
  c.innerHTML='<div class="state"><div class="spinner"></div>트렌드 불러오는 중…</div>';
  try{
    const [d,sh]=await Promise.all([fetch('trend-metrics.json'+bust()).then(r=>r.json()),fetch('shopping-insight.json'+bust()).then(r=>r.ok?r.json():null).catch(()=>null)]);
    S.data=d; S.shop=sh;
  }catch(e){c.innerHTML='<div class="state">trend-metrics.json 을 불러오지 못했습니다</div>';return;}
  const run=S.data.runs[S.data.runs.length-1]; const rows=run.rows;
  // 첫 회차에 들어온 키워드는 전부 '신규'로 찍히므로, 가장 이른 firstSeen 은 신규로 보지 않는다
  const firstRun=rows.reduce((m,r)=>r.firstSeen&&(!m||r.firstSeen<m)?r.firstSeen:m,'');
  rows.forEach(r=>{if(r.firstSeen===firstRun)r.isNew=false;});
  const themes=[...new Set(rows.map(r=>r.theme).filter(Boolean))];
  const errs=Object.entries(run.hubErrors||{});
  c.innerHTML=`
   <div class="tr-meta"><span>기준 <b>${esc(run.date)}</b> (매일 06:50 갱신)</span><span>키워드 풀 <b>${n(run.poolSize)}</b>개</span><span>오늘 새로 들어옴 <b>${n(run.newToday)}</b>개</span><span>추석(9/14~9/28)은 추세 계산에서 제외</span></div>
   ${errs.length?`<div class="tr-warn">일부 네이버 API 호출이 실패했습니다: ${errs.map(([k,v])=>esc(k)+' '+esc(v).slice(0,80)).join(' / ')}</div>`:''}
   <div id="trViz"></div>
   <div class="tr-card"><h2>이번 주 할 일</h2><p class="tr-lead">무엇을 · 왜 지금 · 우리 상태 · 어느 브랜드로. 키워드 판정과 브랜드 사전을 카테고리로 붙인 것이다.</p><div id="trAct"></div></div>
   <div class="tr-card"><h2>키워드 판정</h2><p class="tr-lead">점수(월간 검색수 × 상승률, 신규 가산) 상위 ${rows.length}개. 처음엔 할 일(재고확보·시즌 준비·시즌 소싱·소싱·밀기·안 팔림 점검)만 보입니다. 상시 수요인데 잘 팔리는 키워드는 '유지'로 빠집니다.</p>
     <div class="tr-acts" id="trActs"></div>
     <div class="tr-filters"><input type="search" id="trQ" placeholder="키워드 검색" value="${esc(S.q)}">
       <select id="trTheme"><option value="">전체 테마</option>${themes.map(t=>`<option ${S.theme===t?'selected':''}>${esc(t)}</option>`).join('')}</select>
       <label><input type="checkbox" id="trNew" ${S.onlyNew?'checked':''}>신규만</label>
       <label title="백테스트에서 모멘텀 적중률 46% — 동전던지기보다 낮다. 소싱 결정에 쓰지 말 것."><input type="checkbox" id="trRise" ${S.onlyRising?'checked':''}>최근 오른 것만 <span class="tr-sub">(참고용)</span></label></div>
     <div id="trTable"></div></div>
   <div class="tr-card"><h2>오늘 뜨는 중간·상세 검색어</h2><p class="tr-lead">위 판정표는 검색량 상위만 담겨 중간·상세 구간이 빠진다(실측: 풀 1,200개 중 1천~3천 303개가 0개로 표시됨). 여기는 풀 전체를 일별 기록으로 다시 세운 것이라 <b>매일 순위가 바뀐다</b>.</p><div id="trRise2"></div></div>
   <div class="tr-card"><h2>몰 내 검색어 <span class="badge" style="font-weight:500">시장 트렌드 아님</span></h2><p class="tr-lead">이건 <b>이미 우리 몰에 온 사람</b>의 수요지 시장 트렌드가 아니다. 위 레이더(외부)와 섞어 읽지 말 것. <b>광고로 들어온 세션은 뺐다</b> — 광고 랜딩은 수요가 아니라 광고가 보여준 것이다(실측 전체 22,811 중 45%가 광고). 결과 건수는 우리 검색 API(<code>api.printbakery.com/v1/search/products</code>)의 total 이다 — 사용자가 보는 그 숫자.</p><div id="trSearch"></div></div>
   <div class="tr-card"><h2>쇼핑 카테고리 흐름</h2><p class="tr-lead">네이버 쇼핑인사이트 클릭 지수. 4주 추세는 최근 7일 평균 ÷ 직전 28일 평균.</p><div id="trCats"></div></div>
   <div class="tr-card"><h2>키워드 풀</h2><p class="tr-lead">레이더가 스스로 찾아 쌓는 키워드.</p><div id="trPool"></div></div>
   <div class="tr-card tr-foot"><b>읽는 법</b><br>
     월간 검색 = 네이버 검색광고 키워드도구(PC+모바일, 최근 30일) · 검색수 28일 = 그 값이 28일 전 기록보다 몇 % 변했나 ·
     4주 추세 = 검색어 트렌드 최근 7일 ÷ 직전 28일 · 전년 대비 = 최근 28일 ÷ 1년 전 같은 28일 ·
     쇼핑 클릭·여성·연령 = 쇼핑인사이트(가구/인테리어·생활/건강 중 클릭이 많은 쪽) · 광고 경쟁 = 검색광고 경쟁 정도(네이버 쇼핑 검색 API 종료로 상품 수 대신) ·
     유튜브 = 최근 7일 올라온 영상의 조회수 합(상위 30개 키워드) · 블로그 = 최근 7일 새 글 · 카페 = 카페 글 누적 수의 전날 대비 증가분 ·
     우리 몰 = 상품명·분류·태그에 키워드가 들어간 상품, 30일 판매수량.<br>
     <b>※ 모멘텀은 예측력이 없다.</b> 120키워드×60일 백테스트: '이번 주 상승 → 다음 주도 상승' 적중률 <b>46%</b>(동전 50%), 예측오차 모멘텀 1.94 vs 단순유지 1.41. 검색량은 평균회귀한다 — <b>'뜨는 중' 으로 소싱을 결정하지 말 것.</b> 판정은 수준×전환효율×경쟁여지×시즌으로 한다.<br>
     흐름(참고): <b>뜨는 중</b> 4주 +20% 또는 전년 +30% 또는 검색수 28일 +20% · <b>식는 중</b> 4주·전년 모두 −20% · <b>상시</b> 60일 일별 등락이 작고(변동계수 0.3 미만) 전년과 ±25% 안 · <b>불규칙</b> 그 외(등락이 크거나 전년과 차이가 큼) ·
     <b>시즌</b> 최근 3년 월별 검색에서 같은 달이 평균의 1.5배 이상이고 매년 그 달(±1개월)에 정점이 옴.<br>
     판정: ${ACTIONS.map(a=>`<b>${a}</b> ${ACT_HELP[a]}`).join(' · ')}<br>
     시장가·경쟁강도(상품수÷검색수)는 비어 있습니다 — 네이버 쇼핑 검색 API 를 부를 키가 없습니다. 경쟁은 검색광고 경쟁정도로 대신합니다.<br>
     씨앗·사전·제외어 고치기: <a href="https://github.com/Su-pbg/dashboard/edit/main/radar-config.json" target="_blank" rel="noopener">radar-config.json</a> (다음 날 아침 반영)</div>`;
  renderActs(); renderTable(); renderCats(); renderPool(); renderRising(); renderSearch(); renderAction(); renderViz();
  document.getElementById('trQ').oninput=e=>{S.q=e.target.value;S.limit=15;renderTable();};
  document.getElementById('trTheme').onchange=e=>{S.theme=e.target.value;S.limit=60;renderTable();};
  document.getElementById('trNew').onchange=e=>{S.onlyNew=e.target.checked;renderTable();};
  document.getElementById('trRise').onchange=e=>{S.onlyRising=e.target.checked;renderTable();};
  fetch('keyword-pool.json'+bust()).then(r=>r.json()).then(p=>{S.pool=p;renderPool();renderRising();}).catch(()=>{document.getElementById('trPool').innerHTML='<div class="tr-sub">keyword-pool.json 을 불러오지 못했습니다</div>';});
  fetch('search-results.json'+bust()).then(r=>r.ok?r.json():null).then(x=>{if(x){S.sres=x;renderSearch();renderAction();}}).catch(()=>{});
  wfetch(WORKER+'/?'+q()+'&tab=searchterms').then(t=>{S.terms=t;renderSearch();}).catch(e=>{S.terms={error:String(e&&e.message||e)};renderSearch();});
  fetch('radar-config.json'+bust()).then(r=>r.json()).then(c=>{S.cfg=c;renderRising();}).catch(()=>{});
  // 상품 스냅샷은 5.8MB 라 마지막에 따로 받는다. 받기 전에는 '우리 상품' 대조 없이 목록만 뜬다.
  fetch('product-snapshot.json'+bust()).then(r=>r.json()).then(j=>{
    S.prodsRaw=Object.values(j.products||{});          // 금액 카드는 품절·미진열도 봐야 한다
    S.prods=Object.values(j.products||{}).filter(p=>p.selling&&p.display&&!p.soldOut)
      .map(p=>{const t=((p.name||'')+' '+(p.tags||[]).join(' ')+' '+(p.categories||[]).join(' ')).replace(/\s+/g,'');return {q:p.q30||0,s:t,sl:t.toLowerCase()};});
    renderRising(); renderViz();
  }).catch(()=>{});
};
})();
// 트렌드 탭 — 키워드 레이더 결과(trend-metrics.json · keyword-pool.json · shopping-insight.json)를 보여준다.
