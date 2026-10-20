// 소싱 — 브랜드가 행이다.
// [2026-10-20] '이번 주 할 일' 은 품목이 주인공이라 "그래서 누구한테 연락하냐" 가 안 나왔다.
//   여기는 브랜드 단위로 뒤집고, 사람이 한 번 확인한 것(brand-review.json)만 올린다.
//   기계가 뽑은 사전에는 일반명사·소재·원산지가 섞여서 그대로 쓰면 MD 가 못 쓴다.
(function(){
const CSS=`
.sc-wrap{max-width:1600px;margin:0 auto;padding:0 20px 60px}
.sc-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin:16px 0}
.sc-card h2{font-size:17px;margin:0 0 4px}
.sc-lead{color:var(--muted);font-size:12.5px;margin:0 0 12px;line-height:1.6}
.sc-t{width:100%;border-collapse:collapse;font-size:13px}
.sc-t th{text-align:left;font-weight:600;color:var(--muted);font-size:11.5px;padding:7px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
.sc-t td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.sc-t tr:hover td{background:var(--fill)}
.sc-b{font-weight:600;font-size:14px}
.sc-why{color:var(--muted);font-size:12px;line-height:1.5}
.sc-gap{font-size:12px}
.sc-hot{color:var(--down);font-weight:600}
.sc-pill{display:inline-block;padding:1px 7px;border-radius:9px;background:var(--fill);color:var(--ink-2);font-size:11px;margin-right:4px}
.sc-a{color:var(--muted);text-decoration:none;font-size:11.5px;margin-right:7px}
.sc-a:hover{text-decoration:underline}
.sc-sub{color:var(--muted);font-size:12px}
.sc-new{display:flex;flex-wrap:wrap;gap:6px}
.sc-new span{padding:2px 8px;border-radius:10px;background:var(--fill);color:var(--ink-2);font-size:12px}
`;
const MON=['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const n=v=>v==null?'—':Number(v).toLocaleString('ko-KR');
const bust=()=>'?v='+Math.floor(Date.now()/600000);
const norm=s=>String(s||'').replace(/\s+/g,'');
// [2026-10-20] 지금 보고 소싱하면 도착은 한 달 뒤다. 스파이크는 이미 늦은 것이고
//   **꾸준한 수요**(연중 들쭉날쭉하지 않은 것)가 소싱 리스크가 가장 낮다.
const NEXT=(new Date().getMonth()+1)%12;          // 다음 달 0-based
function profile(r){
  const idx=r&&r.seasonIdx;
  if(!idx||idx.length!==12) return null;
  const mean=idx.reduce((a,b)=>a+b,0)/12;
  const cv=Math.sqrt(idx.reduce((a,b)=>a+(b-mean)*(b-mean),0)/12)/(mean||1);
  const lo=Math.min(...idx), hi=Math.max(...idx);
  return {next:idx[NEXT], lo, hi, cv,
          kind: cv<0.20?'상시':(cv<0.45?'계절':'들쭉날쭉'),
          peak: MON[idx.indexOf(hi)]};
}
function verdict(p){
  if(!p) return ['<span class="sc-sub">시즌 자료 없음</span>',0];
  if(p.kind==='상시') return [`<b>사철 수요</b> <span class="sc-sub">연중 최저 ${p.lo.toFixed(2)} — 타이밍 부담 적음</span>`,3];
  if(p.next>=1.15) return [`<span class="sc-hot">정점에 맞음</span> <span class="sc-sub">${MON[NEXT]} 지수 ${p.next.toFixed(2)}</span>`,4];
  if(p.next>=0.95) return [`평년 수준 <span class="sc-sub">${MON[NEXT]} 지수 ${p.next.toFixed(2)} · 정점 ${p.peak}</span>`,2];
  return [`<span class="sc-sub">비수기 — 급하지 않음 (${MON[NEXT]} 지수 ${p.next.toFixed(2)} · 정점 ${p.peak})</span>`,1];
}
const pc=v=>v==null?'':`${v>0?'+':''}${Math.round(v*100)}%`;
// [2026-10-20] 변이할당분석(shift-share). 전년 대비 변화를 세 몫으로 쪼갠다 —
//   전체효과(시장 전체) · 구성효과(그 카테고리) · 경쟁효과(그 키워드 고유).
//   실측: 전체 -27.5% 라 개별 하락의 대부분이 시장 몫이다. '카테고리가 죽었다' 로 읽으면 틀린다.
//   경쟁효과가 진짜 신호다 — 국립중앙박물관굿즈 -25,206 ↔ 국중박굿즈 +26,409 로 거의 상쇄된다
//   (수요가 준 게 아니라 줄임말로 표기가 이동했다).
// 분해만 보여주면 "그래서?" 가 남는다. 숫자를 판단으로 옮긴다.
function ssVerdict(e, top){
  if(!e||!top) return '';
  const V0=top.monthlySearch/(1+top.yoy);
  const compR=e.comp/(V0||1), mixR=e.gT-e.G;
  if(compR<=-0.25) return '<span class="sc-hot">고유 이탈</span> <span class="sc-sub">시장 탓이 아니다 — 대체어·경쟁 이동 확인</span>';
  if(compR>=0.25)  return '<b>혼자 가져감</b> <span class="sc-sub">시장이 빠지는데 이 품목만 늘었다 — 밀어도 된다</span>';
  if(mixR>=0.08)   return '<b>버티는 카테고리</b> <span class="sc-sub">시장보다 덜 빠진다 — 소싱 무게를 둘 만하다</span>';
  if(mixR<=-0.08)  return '<span class="sc-sub">역풍 카테고리 — 시장보다 더 빠진다. 서두르지 말 것</span>';
  return '<span class="sc-sub">시장 전체가 빠진 몫 — 이 품목 고유 문제는 아니다</span>';
}
function shiftShare(rows){
  const ok=rows.filter(r=>r.yoy!=null&&r.monthlySearch&&(1+r.yoy)>0.01)
               .map(r=>({r, V1:r.monthlySearch, V0:r.monthlySearch/(1+r.yoy), t:r.theme||'-'}));
  if(!ok.length) return null;
  const sum=(a,f)=>a.reduce((s,x)=>s+f(x),0);
  const G=sum(ok,x=>x.V1)/sum(ok,x=>x.V0)-1;
  const byT={}; for(const x of ok) (byT[x.t]=byT[x.t]||[]).push(x);
  const gT={}; for(const t in byT) gT[t]=sum(byT[t],x=>x.V1)/sum(byT[t],x=>x.V0)-1;
  const per={};
  for(const x of ok) per[x.r.keyword]={G, gT:gT[x.t], comp:x.V0*(x.r.yoy-gT[x.t]), mix:x.V0*(gT[x.t]-G)};
  return {G, gT, per};
}

function links(name){
  const e=encodeURIComponent(name);
  const a=(u,t)=>`<a class="sc-a" href="${u}" target="_blank" rel="noopener">${t}</a>`;
  return a(`https://search.naver.com/search.naver?query=${e}`,'네이버')
       + a(`https://search.shopping.naver.com/search/all?query=${e}`,'쇼핑')
       + a(`https://www.google.com/search?q=${e}`,'구글')
       + a(`https://ohou.se/search?query=${e}`,'오늘의집')
       + a(`https://www.instagram.com/explore/tags/${encodeURIComponent(norm(name))}/`,'인스타');
}

window.loadSourcingTab = async function(root){
  if(!document.getElementById('scCss')){ const st=document.createElement('style'); st.id='scCss'; st.textContent=CSS; document.head.appendChild(st); }
  root.innerHTML='<div class="sc-wrap"><div class="sc-sub">불러오는 중…</div></div>';
  const [tmR,revR,snapR,dictR] = await Promise.all([
    fetch('trend-metrics.json'+bust()).then(r=>r.json()),
    fetch('brand-review.json'+bust()).then(r=>r.json()).catch(()=>({confirmed:{},material:{},rejected:[]})),
    fetch('product-snapshot.json'+bust()).then(r=>r.json()).catch(()=>({products:[]})),
    fetch('brand-dictionary.json'+bust()).then(r=>r.json()).catch(()=>({brands:{}}))
  ]);
  const run=tmR.runs[tmR.runs.length-1];
  const rows=run.rows||[], dict=run.brandDict||[];
  const SS=shiftShare(rows);
  const conf=revR.confirmed||{}, mat=revR.material||{}, rej=new Set(revR.rejected||[]);
  const ourText=(snapR.products||[]).map(p=>p.name||'').join(' ').toLowerCase();

  // 브랜드가 걸리는 레이더 키워드 → 그 카테고리에서 우리 공백
  const byName={}; for(const b of dict) byName[b.name]=b;
  const kwFor=cats=>rows.filter(r=>{const k=norm(r.keyword); return (cats||[]).some(c=>k.includes(c)||c.includes(k));});
  const TODO={'재고확보':1,'시즌 소싱':1,'소싱 검토':1,'안 팔림 점검':1,'시즌 준비':1,'밀기':1};

  function row(name, note){
    const b=byName[name]||{};
    const ks=kwFor(b.cats||[]);
    const have=name.length>=3 && ourText.includes(name.toLowerCase());
    const top=ks.length?ks.reduce((a,c)=>c.monthlySearch>a.monthlySearch?c:a):null;
    const ourCount=ks.reduce((s,r)=>s+(r.ourCount||0),0), sold=ks.reduce((s,r)=>s+(r.ourSales30||0),0);
    const todo=ks.filter(r=>TODO[r.action]);
    const p=profile(top), vd=verdict(p);
    const trend=top?[top.growth4w!=null?`4주 ${pc(top.growth4w)}`:'', top.yoy!=null?`전년 ${pc(top.yoy)}`:''].filter(Boolean).join(' · '):'';
    // 전년 하락을 시장 몫과 고유 몫으로 가른다
    let ss='';
    if(SS&&top&&SS.per[top.keyword]){
      const e=SS.per[top.keyword];
      const sign=e.comp>0?'고유 +':'고유 ';
      ss=`<br><span class="sc-sub">시장 ${pc(SS.G)} · 카테고리 ${(e.gT-SS.G)>=0?'+':''}${Math.round((e.gT-SS.G)*100)}p · <b>${sign}${n(Math.round(e.comp))}</b></span>`
         +`<br>${ssVerdict(e, top)}`;
    }
    const why = top
      ? `<b>${esc(top.keyword)}</b> ${n(top.monthlySearch)}<br><span class="sc-sub">${esc(trend)||'추세 자료 없음'}</span>${ss}`
      : '<span class="sc-sub">레이더에 안 걸림</span>';
    const when = `${vd[0]}${p?`<br><span class="sc-sub">${p.kind} · 연중 ${p.lo.toFixed(2)}~${p.hi.toFixed(2)}</span>`:''}`;
    const gap = ks.length
      ? `우리 ${n(ourCount)}종 · 30일 ${n(sold)}개${todo.length?`<br><span class="sc-hot">${esc(todo[0].action)}</span>`:''}`
      : '<span class="sc-sub">—</span>';
    return [`<tr><td><span class="sc-b">${esc(name)}</span>${have?' <span class="sc-pill">보유</span>':''}<br><span class="sc-sub">${esc(note||'')}</span></td>`
      + `<td class="sc-why">${why}</td>`
      + `<td class="sc-why">${when}</td>`
      + `<td class="sc-gap">${gap}</td>`
      + `<td>${links(name)}</td></tr>`, vd[1], top?top.monthlySearch:0, have];
  }
  const head=`<thead><tr><th style="width:20%">브랜드</th><th style="width:26%">수요 · 추세 · 몫 분해</th>`
    +`<th style="width:25%">${MON[NEXT]} 도착 기준</th><th style="width:16%">우리 상태</th><th>확인</th></tr></thead>`;

  // 확인된 브랜드 — 우리에게 없는 것 먼저, 검색량 순
  const built=Object.keys(conf).map(nm=>[nm].concat(row(nm,conf[nm])));
  // 미보유 먼저 → 사철/정점 판정 높은 순 → 검색량
  built.sort((a,b)=>(a[4]?1:0)-(b[4]?1:0)||b[2]-a[2]||b[3]-a[3]);
  const confHTML=built.length?`<table class="sc-t">${head}<tbody>${built.map(x=>x[1]).join('')}</tbody></table>`
    :'<div class="sc-sub">brand-review.json 의 confirmed 가 비어 있습니다.</div>';

  // 소재·원산지 — 브랜드는 아니지만 소싱 품목으로 쓴다
  const matNames=Object.keys(mat).filter(k=>k!=='_설명');
  const matHTML=matNames.length?`<table class="sc-t">${head}<tbody>${matNames.map(nm=>row(nm,mat[nm])[0]).join('')}</tbody></table>`:'';

  // 아직 안 가른 후보 — 사전 전체에서 카테고리별로. [2026-10-20] 전엔 search>0 만 봐서
  //   검색량이 안 잡히는 해외 브랜드(MAGIS·USM·크로스노·큐티폴)가 통째로 안 보였다.
  const all=dictR.brands||{};
  const CATWORD=/조명|러그|그릇|접시|액자|포스터|캔들|디퓨저|가구|쿠션|패브릭|커트러리|식기|방향제|향초|인테리어|소품|굿즈|오브제|수저|트레이|화병/;
  const TRADEW=/납품|도매|구매|견적|제작|주문|업체|공장|판매|사이트|쇼핑몰|매장|도안|원단|재료|부자재|용품|브랜딩|리모델링|컨설팅|전시회|가볼만한곳|놀거리/;
  const un={};
  for(const nm in all){
    const e=all[nm], cats=e.cats||[];
    if(conf[nm]||mat[nm]||rej.has(nm)) continue;
    if(cats.length>3) continue;
    const t=norm(nm);
    if(t.length<3&&!/[A-Za-z]{2,}/.test(t)) continue;
    if(CATWORD.test(t)||TRADEW.test(t)) continue;
    const c=cats[0]||'기타'; (un[c]=un[c]||[]).push({name:nm,hits:e.hits||0,search:(byName[nm]||{}).search||0});
  }
  const unCats=Object.keys(un).sort((a,b)=>un[b].length-un[a].length);
  const unTot=unCats.reduce((s,c)=>s+un[c].length,0);
  const unHTML=unTot?unCats.map(c=>`<div style="margin-bottom:10px"><div class="sc-sub" style="margin-bottom:4px"><b>${esc(c)}</b> (${un[c].length})</div>`
      +`<div class="sc-new">${un[c].sort((a,b)=>b.hits-a.hits||b.search-a.search).slice(0,40)
          .map(b=>`<span title="${b.search?n(b.search)+' 검색':'검색 수요 미포착'}">${esc(b.name)}</span>`).join('')}</div></div>`).join('')
    :'<div class="sc-sub">새 후보 없음</div>';

  // 이름 치고 왔는데 결과 0건 — 작가 소싱 신호
  const zero=(window.__scSearch&&window.__scSearch.terms||[]).filter(x=>x.results===0&&(x.organic+x.paid)>=20)
    .sort((a,b)=>(b.organic+b.paid)-(a.organic+a.paid)).slice(0,10);
  const zeroHTML=zero.length?`<table class="sc-t"><thead><tr><th>검색어</th><th>자연</th><th>광고</th><th>확인</th></tr></thead><tbody>`
    +zero.map(x=>`<tr><td class="sc-b">${esc(x.term)}</td><td>${n(x.organic)}</td><td>${n(x.paid)}</td><td>${links(x.term)}</td></tr>`).join('')
    +'</tbody></table>':'';

  root.innerHTML=`<div class="sc-wrap">
    ${zeroHTML?`<div class="sc-card"><h2>이름 치고 왔는데 물건이 없다</h2>
      <p class="sc-lead">우리 몰에서 검색했는데 결과 0건. 이미 온 수요라 제일 급하다. 아트·굿즈는 브랜드가 아니라 작가 단위라 이쪽에 잡힌다.</p>${zeroHTML}</div>`:''}
    <div class="sc-card"><h2>소싱 목록</h2>
      ${SS?`<div class="sc-sub" style="margin:0 0 8px;padding:8px 10px;background:var(--fill);border-radius:8px">
        <b>시장 전체 ${pc(SS.G)}</b> (전년 대비, 검색량 가중). 개별 하락의 대부분은 이 몫이다 —
        <b>카테고리가 죽은 것으로 읽으면 틀린다.</b> 볼 건 <b>고유(경쟁효과)</b> 쪽이다.
        버티는 카테고리: ${Object.entries(SS.gT).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t,g])=>`${esc(t)} ${(g-SS.G)>=0?'+':''}${Math.round((g-SS.G)*100)}p`).join(' · ')}</div>`:''}
      <p class="sc-lead">지금 정하면 <b>물건은 한 달 뒤</b> 들어온다. 그래서 '지금 뜨는 것'이 아니라 <b>${MON[NEXT]}에 수요가 있는 것</b>으로 세운다.
        사철 수요(연중 들쭉날쭉하지 않은 것)가 타이밍 부담이 가장 적다. <b>보유</b> 표시가 없으면 우리에게 없는 것.</p>${confHTML}</div>
    ${matHTML?`<div class="sc-card"><h2>소재 · 원산지</h2><p class="sc-lead">브랜드는 아니지만 소싱 품목으로 쓴다.</p>${matHTML}</div>`:''}
    <div class="sc-card"><h2>아직 안 가른 후보 (${unTot})</h2>
      <p class="sc-lead">기계가 뽑은 이름 중 아직 사람이 안 본 것. 브랜드면 <code>confirmed</code>, 소재·원산지면 <code>material</code>, 아니면 <code>rejected</code> 로 옮긴다 →
        <a class="sc-a" href="https://github.com/Su-pbg/dashboard/edit/main/brand-review.json" target="_blank" rel="noopener">brand-review.json 고치기</a></p>${unHTML}</div>
  </div>`;
};

// 몰 검색 0건은 워커가 아니라 배치 파일에서 온다 — 없으면 그 칸만 빠진다
fetch('search-results.json'+bust()).then(r=>r.ok?r.json():null).then(x=>{
  if(x){ window.__scSearch=x; const el=document.getElementById('sourcingContent');
         if(el&&el.innerHTML&&window.loadSourcingTab) window.loadSourcingTab(el); }
}).catch(()=>{});
})();
