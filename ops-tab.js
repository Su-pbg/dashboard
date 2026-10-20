// 상품 운영 — 할 일이 상품·키워드 단위로 떨어지고, 담당자·상태·메모가 남는다.
// [2026-10-20] '밀기' 같은 내부 은어로 된 지표 화면 말고 업무 목록으로 다시 짰다.
//   MD 가 수시로 보는 화면이라 '뭘 했는지' 가 안 남으면 같은 걸 계속 다시 본다.
//   담당자·상태는 사람 사이에 공유돼야 하므로 브라우저 저장소가 아니라 워커 KV(/worklist)에 둔다.
// 접근: 대시보드와 같은 로그인(index.html 의 authHeaders).
(function(){
const CSS=`
.op-wrap{max-width:1600px;margin:0 auto;padding:0 20px 60px}
.op-head{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:14px 0 6px}
.op-sum{display:flex;gap:8px;flex-wrap:wrap}
.op-chip{padding:7px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);cursor:pointer;font-size:13px}
.op-chip.on{border-color:var(--accent);background:var(--accent-soft);color:var(--accent-press)}
.op-chip b{font-size:15px;margin-right:6px}
.op-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:14px 0}
.op-card h2{font-size:16px;margin:0 0 2px}
.op-lead{color:var(--muted);font-size:12.5px;margin:0 0 10px}
.op-t{width:100%;border-collapse:collapse;font-size:13px}
.op-t th{text-align:left;font-weight:600;color:var(--muted);font-size:11.5px;padding:7px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
.op-t td{padding:8px;border-bottom:1px solid var(--line);vertical-align:middle}
.op-t tr.done td{opacity:.45}
.op-tgt{font-weight:600}
.op-why{color:var(--muted);font-size:12px}
.op-in{width:100%;border:1px solid var(--line);border-radius:7px;padding:4px 7px;background:var(--bg);color:var(--ink);font-size:12.5px;font-family:inherit}
.op-sel{border:1px solid var(--line);border-radius:7px;padding:4px 6px;background:var(--bg);color:var(--ink);font-size:12.5px}
.op-a{color:var(--muted);text-decoration:none;font-size:11.5px;margin-right:6px}
.op-a:hover{text-decoration:underline}
.op-sub{color:var(--muted);font-size:12px}
.op-btn{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:9px;padding:6px 12px;font-size:12.5px;cursor:pointer}
.op-st-완료{color:var(--up)} .op-st-보류{color:var(--muted)}
`;
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const n=v=>v==null?'—':Number(v).toLocaleString('ko-KR');
const bust=()=>'?v='+Math.floor(Date.now()/600000);
const STATUS=['미처리','진행','완료','보류'];
const S={items:{}, showDone:false, group:''};

// 작업 유형 — 이름은 업무 그대로. 내부 은어 금지.
const GROUPS=[
  {id:'stock', name:'재고 확보',   lead:'최근 30일에 팔렸는데 지금 품절. 파는 중에 끊긴 것이라 제일 급하다.'},
  {id:'display',name:'진열 확인',   lead:'재고가 있는데 진열이 꺼져 있거나 판매중이 아니다.'},
  {id:'listing',name:'상품 점검',   lead:'검색 수요는 큰데 30일 판매가 0이다. 가격·상세·노출 중 하나가 막혀 있다.'},
  {id:'drop',   name:'판매 급감',   lead:'전월 대비 절반 이하로 떨어졌다. 품절·가격·경쟁 중 무엇인지 확인한다.'},
  {id:'search', name:'검색어 연결', lead:'몰에서 이름을 쳤는데 결과가 없다. 상품이 있으면 검색어를 붙이고, 없으면 소싱이다.'},
];

function links(q){
  const e=encodeURIComponent(q);
  return `<a class="op-a" href="https://www.printbakery.com/search.html?q=${e}" target="_blank" rel="noopener">몰 검색</a>`
       + `<a class="op-a" href="https://search.naver.com/search.naver?query=${e}" target="_blank" rel="noopener">네이버</a>`;
}
const prodLink=p=>`<a class="op-a" href="${esc(p.url||('https://www.printbakery.com/product/detail.html?product_no='+p.no))}" target="_blank" rel="noopener">상품</a>`;

function buildTasks(tm, snap, sres){
  const rows=(tm.runs[tm.runs.length-1].rows)||[];
  const ps=snap.products||[];
  const terms=(sres&&sres.terms)||[];
  const T=[];
  // 1) 재고 확보 — 팔렸는데 품절
  ps.filter(p=>(p.q30||0)>0 && p.soldOut)
    .sort((a,b)=>b.q30-a.q30)
    .forEach(p=>T.push({g:'stock', id:'stock:'+p.no, tgt:p.name,
      why:`30일 ${n(p.q30)}개 판매 · 현재 품절${p.price?' · '+n(p.price)+'원':''}`, extra:prodLink(p)}));
  // 2) 진열 확인 — 재고 있는데 꺼져 있음
  ps.filter(p=>(p.stock||0)>0 && (!p.display||!p.selling))
    .forEach(p=>T.push({g:'display', id:'disp:'+p.no, tgt:p.name,
      why:`재고 ${n(p.stock)}개 · ${!p.display?'미진열':''}${(!p.display&&!p.selling)?' · ':''}${!p.selling?'판매중 아님':''}`, extra:prodLink(p)}));
  // 3) 상품 점검 — 수요 큰데 30일 0개
  rows.filter(r=>(r.monthlySearch||0)>=5000 && (r.ourCount||0)>0 && (r.ourSales30||0)===0)
    .sort((a,b)=>b.monthlySearch-a.monthlySearch)
    .forEach(r=>T.push({g:'listing', id:'list:'+r.keyword, tgt:r.keyword,
      why:`검색 ${n(r.monthlySearch)} · 보유 ${n(r.ourCount)}종 · 30일 0개${r.ourMinPrice?' · 최저 '+n(r.ourMinPrice)+'원':''}`, extra:links(r.keyword)}));
  // 4) 판매 급감 — 전월 대비 절반 이하
  rows.filter(r=>(r.ourSalesPrev30||0)>=10 && (r.ourSales30||0) < (r.ourSalesPrev30||0)*0.5)
    .sort((a,b)=>(b.ourSalesPrev30-b.ourSales30)-(a.ourSalesPrev30-a.ourSales30))
    .forEach(r=>T.push({g:'drop', id:'drop:'+r.keyword, tgt:r.keyword,
      why:`판매 ${n(r.ourSalesPrev30)} → ${n(r.ourSales30)}개 · 검색 ${n(r.monthlySearch)}`, extra:links(r.keyword)}));
  // 5) 검색어 연결 — 몰 검색 0건
  terms.filter(t=>t.results===0 && (t.organic+t.paid)>=20)
    .sort((a,b)=>(b.organic+b.paid)-(a.organic+a.paid))
    .forEach(t=>T.push({g:'search', id:'srch:'+t.term, tgt:t.term,
      why:`자연 ${n(t.organic)} · 광고 ${n(t.paid)} · 결과 0건`, extra:links(t.term)}));
  return T;
}

async function save(id, patch){
  S.items[id]={...(S.items[id]||{status:'미처리',owner:'',memo:''}), ...patch};
  try{
    const r=await fetch(WORKER+'/worklist',{method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json',...authHeaders()},
      body:JSON.stringify({id, ...patch})});
    const d=await r.json();
    if(d.items) S.items=d.items;
  }catch(e){ /* 저장 실패해도 화면은 유지 — 다음 저장 때 다시 시도된다 */ }
}

function render(root, T){
  const st=id=>(S.items[id]||{}).status||'미처리';
  const vis=T.filter(t=>S.showDone||st(t.id)!=='완료');
  const cnt={}; GROUPS.forEach(g=>cnt[g.id]=vis.filter(t=>t.g===g.id).length);
  const openN=T.filter(t=>st(t.id)!=='완료').length;
  const chips=GROUPS.map(g=>`<button class="op-chip ${S.group===g.id?'on':''}" data-g="${g.id}"><b>${cnt[g.id]}</b>${g.name}</button>`).join('');
  const row=t=>{
    const it=S.items[t.id]||{};
    const s=it.status||'미처리';
    return `<tr class="${s==='완료'?'done':''}" data-id="${esc(t.id)}">
      <td><span class="op-tgt">${esc(t.tgt)}</span><div class="op-why">${t.why} ${t.extra||''}</div></td>
      <td><select class="op-sel st">${STATUS.map(x=>`<option ${s===x?'selected':''}>${x}</option>`).join('')}</select></td>
      <td><input class="op-in ow" value="${esc(it.owner||'')}" placeholder="담당"></td>
      <td><input class="op-in mo" value="${esc(it.memo||'')}" placeholder="메모"></td>
      <td class="op-sub">${esc(it.at||'')}</td></tr>`;
  };
  const sections=GROUPS.filter(g=>!S.group||S.group===g.id).map(g=>{
    const rows=vis.filter(t=>t.g===g.id);
    if(!rows.length) return '';
    return `<div class="op-card"><h2>${g.name} <span class="op-sub">${rows.length}</span></h2><p class="op-lead">${g.lead}</p>
      <table class="op-t"><thead><tr><th>대상 · 근거</th><th style="width:88px">상태</th><th style="width:110px">담당</th><th style="width:28%">메모</th><th style="width:110px">최근 저장</th></tr></thead>
      <tbody>${rows.map(row).join('')}</tbody></table></div>`;
  }).join('');
  root.innerHTML=`<div class="op-wrap">
    <div class="op-head"><div class="op-sum">
      <button class="op-chip ${S.group?'':'on'}" data-g=""><b>${openN}</b>남은 일</button>${chips}</div>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
        <label class="op-sub"><input type="checkbox" id="opDone" ${S.showDone?'checked':''}> 완료도 보기</label>
        <button class="op-btn" id="opCsv">엑셀로 받기</button></div></div>
    ${sections||'<div class="op-card"><div class="op-sub">남은 일이 없습니다.</div></div>'}
  </div>`;
  root.querySelectorAll('.op-chip').forEach(b=>b.onclick=()=>{S.group=b.dataset.g;render(root,T);});
  const done=document.getElementById('opDone'); if(done) done.onchange=e=>{S.showDone=e.target.checked;render(root,T);};
  root.querySelectorAll('tr[data-id]').forEach(tr=>{
    const id=tr.dataset.id;
    tr.querySelector('.st').onchange=async e=>{await save(id,{status:e.target.value});render(root,T);};
    const ow=tr.querySelector('.ow'), mo=tr.querySelector('.mo');
    ow.onchange=()=>save(id,{owner:ow.value});
    mo.onchange=()=>save(id,{memo:mo.value});
  });
  const csv=document.getElementById('opCsv');
  if(csv) csv.onclick=()=>{
    const head=['작업','대상','근거','상태','담당','메모','최근 저장'];
    const body=T.map(t=>{const it=S.items[t.id]||{};
      return [GROUPS.find(g=>g.id===t.g).name, t.tgt, t.why.replace(/<[^>]*>/g,''), it.status||'미처리', it.owner||'', it.memo||'', it.at||''];});
    const q=v=>`"${String(v).replace(/"/g,'""')}"`;
    const blob=new Blob(['﻿'+[head,...body].map(r=>r.map(q).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`상품운영_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
}

window.loadOpsTab = async function(root){
  if(!document.getElementById('opCss')){const st=document.createElement('style');st.id='opCss';st.textContent=CSS;document.head.appendChild(st);}
  root.innerHTML='<div class="op-wrap"><div class="op-sub">불러오는 중…</div></div>';
  const [tm,snap,sres,wl]=await Promise.all([
    fetch('trend-metrics.json'+bust()).then(r=>r.json()),
    fetch('product-snapshot.json'+bust()).then(r=>r.json()).catch(()=>({products:[]})),
    fetch('search-results.json'+bust()).then(r=>r.ok?r.json():null).catch(()=>null),
    fetch(WORKER+'/worklist',{cache:'no-store',headers:authHeaders()}).then(r=>r.json()).catch(()=>({items:{}})),
  ]);
  S.items=wl.items||{};
  render(root, buildTasks(tm, snap, sres));
};
})();
