// 전표 입력 대조 — 왼쪽 메뉴 '위탁 정산' 아래. index.html 의 enterEcount() 가 처음 열 때 불러와 loadEcountTab(el) 을 부른다.
//
// 지금 단계: 품목코드 대응표 (카페24 상품·옵션 → 이카운트 품목코드)
//   · 카페24 자체상품코드는 이카운트 품목코드가 아니다(ARG…·4205… 등, 1/3 만 채워짐) → 이미 입력된 이카운트 전표에서 배운다.
//   · 이카운트 판매현황(품목별) 엑셀을 올리면 주문번호(결제일 열)로 카페24 주문과 맞춰 짝을 찾는다.
//       ① 한 주문에 카페24 옵션 1개 · 이카운트 품목 1개 → 바로 연결
//       ② 이미 아는 짝을 빼고 남은 게 1:1 이면 연결 (반복)
//       ③ 그래도 남으면 이름이 충분히 비슷하고 서로 가장 비슷한 것끼리만 연결
//   · 한 옵션에 서로 다른 코드가 나오면 자동으로 정하지 않고 '확인 필요'로 남긴다(담당자가 고른다).
//   · 키 = 카페24 variant_code(옵션별, 예: P0000ZGS000F). 카페24 한 상품의 옵션이 이카운트에선 품목코드 여러 개다.
//   · 저장은 워커 /ecmap (KV, 팀 공유). 담당자가 넣은 값(manual)은 자동 학습이 덮어쓰지 않는다.
//   · 이카운트 파일은 고객 정보가 있어 워커로 보내지 않는다. 브라우저에서만 읽는다.
(function(){
const STYLE=`
.ec-card{background:var(--surface);border-radius:var(--r-card);padding:var(--s5);margin-bottom:var(--s5);}
.ec-card h2{font-size:18px;font-weight:700;margin:0;letter-spacing:-.02em;}
.ec-lead{font-size:13px;color:var(--muted);margin:var(--s1) 0 var(--s4);line-height:1.6;}
.ec-row{display:flex;gap:var(--s3);align-items:center;flex-wrap:wrap;}
.ec-row label{font-size:12px;color:var(--muted);font-weight:600;display:flex;gap:6px;align-items:center;}
.ec-in{font-family:var(--sans);font-size:13px;border:0;border-radius:8px;background:var(--fill);color:var(--ink);height:32px;padding:0 var(--s2);}
.ec-file{position:relative;overflow:hidden;}
.ec-file input{position:absolute;inset:0;opacity:0;cursor:pointer;}
.ec-stat{font-size:13px;color:var(--ink-2);margin-top:var(--s3);line-height:1.6;}
.ec-stat.err{color:var(--down);}
.ec-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:var(--s3);margin:var(--s4) 0;}
@media (max-width:860px){.ec-kpis{grid-template-columns:repeat(2,1fr);}}
.ec-kpi{background:var(--fill);border-radius:var(--r-ctrl);padding:var(--s3) var(--s4);}
.ec-kpi .l{font-size:12px;color:var(--muted);font-weight:600;}
.ec-kpi .n{font-size:20px;font-weight:700;margin-top:2px;}
.ec-kpi .n.warn{color:var(--down);} .ec-kpi .n.ok{color:var(--up);}
.ec-seg{display:inline-flex;background:var(--fill);border-radius:var(--r-ctrl);padding:3px;gap:2px;flex-wrap:wrap;}
.ec-seg button{border:0;background:none;border-radius:9px;height:30px;padding:0 12px;font:600 12px var(--sans);color:var(--ink-2);cursor:pointer;}
.ec-seg button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.06);}
.ec-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:var(--s3);}
table.ec-t{width:100%;border-collapse:collapse;font-size:13px;min-width:900px;}
.ec-t th{font-weight:600;color:var(--muted);font-size:12px;padding:var(--s2);border-bottom:1px solid var(--hair);text-align:center;white-space:nowrap;}
.ec-t td{padding:var(--s2);border-bottom:1px solid var(--hair);text-align:center;vertical-align:middle;}
.ec-t td.l{text-align:left;}
.ec-sub{font-size:11px;color:var(--muted);margin-top:2px;}
.ec-badge{display:inline-block;font-size:11px;font-weight:700;border-radius:6px;padding:1px 6px;white-space:nowrap;}
.ec-ok{background:var(--up-soft);color:var(--up);} .ec-bad{background:var(--down-soft);color:var(--down);}
.ec-warn{background:#FFF3E0;color:#C25E00;} .ec-info{background:var(--fill);color:var(--ink-2);}
.ec-dl{background:var(--fill);border:0;border-radius:8px;height:30px;padding:0 10px;font:600 12px var(--sans);color:var(--ink-2);cursor:pointer;}
.ec-note{font-size:12px;color:var(--muted);line-height:1.6;margin:var(--s3) 0 0;}
`;
const nf=new Intl.NumberFormat('ko-KR');
const n=v=>nf.format(Math.round(v||0));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
const ORD=/^\d{8}-\d{7}$/;
const LS_BY='pbg_ecount_by';

const S={root:null, map:{}, files:[], ecRows:[], c24:{}, months:[], loading:'', err:null, result:null, view:'new', q:''};

async function getJSON(url,opt){
  const r=await fetch(url,{cache:'no-store',...opt,headers:{...authHeaders(),...((opt&&opt.headers)||{})}});
  const d=await r.json().catch(()=>({error:'HTTP '+r.status}));
  if(d.error) throw new Error(d.error);
  return d;
}
function loadXLSX(){ return window.XLSX?Promise.resolve():new Promise((ok,ng)=>{const sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';sc.onload=ok;sc.onerror=()=>ng(new Error('엑셀 라이브러리를 불러오지 못했습니다'));document.head.appendChild(sc);}); }
const byName=()=>{ try{ return localStorage.getItem(LS_BY)||''; }catch(e){ return ''; } };

// ---------- 이카운트 판매현황(품목별) ----------
// 머리글(일자·품목코드·품명 및 규격·수량)을 찾고, 주문번호 열은 값 모양(20260801-0000047)으로 찾는다(머리글이 결제일·주문일 등으로 다르다).
function parseEcount(wb,fname){
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:null,blankrows:false});
  let h=-1;
  for(let i=0;i<Math.min(rows.length,15);i++){ const r=(rows[i]||[]).map(c=>String(c??'').trim()); if(r.includes('품목코드')&&r.includes('수량')&&(r.includes('품명 및 규격')||r.includes('품목명'))){ h=i; break; } }
  if(h<0) throw new Error(`${fname}: 머리글(품목코드·품명 및 규격·수량)을 찾지 못했습니다. 이카운트 판매현황(품목별) 엑셀이 맞는지 확인해 주세요.`);
  const head=rows[h].map(c=>String(c??'').trim()), col=k=>head.indexOf(k);
  const cCode=col('품목코드'), cName=col('품명 및 규격')>=0?col('품명 및 규격'):col('품목명'), cQty=col('수량');
  const body=rows.slice(h+1).filter(r=>r[cCode]);
  let cOrd=-1,best=0;
  for(let i=0;i<head.length;i++){ const k=body.reduce((t,r)=>t+(ORD.test(String(r[i]??'').trim())?1:0),0); if(k>best){best=k;cOrd=i;} }
  if(best<body.length*0.3) throw new Error(`${fname}: 주문번호(예: 20260801-0000047) 열을 찾지 못했습니다.`);
  return body.map(r=>({order:String(r[cOrd]??'').trim(),code:String(r[cCode]).trim(),name:String(r[cName]??'').trim(),qty:Number(r[cQty])||0}))
    .filter(r=>ORD.test(r.order)&&!/선수금/.test(r.code+r.name));   // 선수금 품목은 실제 상품이 아니다
}

// ---------- 카페24 주문 (월 단위) ----------
async function loadC24Month(ym){
  const [y,m]=ym.split('-').map(Number), from=`${ym}-01`, to=`${ym}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`;
  const d=await getJSON(`${WORKER}/?bs=${from}&be=${to}&as=${from}&ae=${to}&tab=orderitems&from=${from}&to=${to}&full=1&nocache=1`);
  if(d.truncated) S.truncated=(S.truncated||[]).concat(ym);
  for(const l of (d.lines||[])){ if(l.paywin==='Y'||l.paid!=='Y') continue; (S.c24[l.order_id] ||= []).push(l); }
}

// ---------- 학습 ----------
const norm=s=>String(s||'').toLowerCase().replace(/\[[^\]]*\]/g,' ').replace(/선택=|옵션=/g,'').replace(/[\s()\[\]/·,._\-=+]/g,'');
const bigrams=s=>{s=norm(s);const g=new Set();for(let i=0;i<s.length-1;i++)g.add(s.slice(i,i+2));return g;};
function sim(a,b){const A=bigrams(a),B=bigrams(b);if(!A.size||!B.size)return 0;let k=0;for(const x of A)if(B.has(x))k++;return 2*k/(A.size+B.size);}
const ecProd=name=>String(name).split(/\s*\/\s*/).slice(1).join(' ')||name;   // '브랜드 / 상품 [규격]' → 상품 [규격]
const optText=v=>String(v||'').replace(/^(선택|옵션)=/,'').replace(/,\s*(선택|옵션)=/g,', ');

function learn(){
  // 주문별 카페24 옵션(variant_code) · 이카운트 품목코드 (순수량 > 0 만)
  const ecBy={}, ecName={};
  for(const r of S.ecRows){ const o=(ecBy[r.order] ||= {}); o[r.code]=(o[r.code]||0)+r.qty; if(!ecName[r.code]) ecName[r.code]=r.name; }
  const label={}, orders=[];
  for(const o of Object.keys(ecBy)){
    const ls=S.c24[o]; if(!ls) continue;
    const C={}; for(const l of ls){ const k=l.variant_code||String(l.product_no); C[k]=(C[k]||0)+l.qty; if(!label[k]) label[k]={name:l.product_name,opt:optText(l.option_value),pno:l.product_no}; }
    const E=Object.keys(ecBy[o]).filter(c=>ecBy[o][c]>0);
    if(E.length) orders.push({o,C:Object.keys(C),E});
  }
  // 근거 모으기: 이미 저장된 대응표 + 이번에 찾은 것으로 소거하며 반복
  const ev={}, how={};
  const known=k=>{ const s=ev[k]; if(s){ const top=Object.entries(s).sort((a,b)=>b[1]-a[1]); if(top.length===1) return top[0][0]; } return S.map[k]?S.map[k].code:null; };
  const add=(k,c,w)=>{ (ev[k] ||= {})[c]=(ev[k][c]||0)+1; (how[k] ||= new Set()).add(w); };
  const rest=new Map();   // 주문 → 남은 C·E
  for(let pass=0;pass<6;pass++){
    let changed=false;
    for(const x of orders){
      const usedE=new Set(), C=[];
      for(const k of x.C){ const c=known(k); if(c&&x.E.includes(c)&&!usedE.has(c)) usedE.add(c); else C.push(k); }
      const E=x.E.filter(c=>!usedE.has(c));
      rest.set(x.o,{C,E});
      if(C.length===1&&E.length===1&&!(ev[C[0]]&&ev[C[0]][E[0]]&&pass>0)){ if(!ev[C[0]]||!ev[C[0]][E[0]]) changed=true; add(C[0],E[0],'1:1'); }
    }
    if(!changed) break;
  }
  // 이름: 서로 가장 비슷하고 0.45 이상인 짝만
  for(const x of orders){
    const r=rest.get(x.o); if(!r||!r.C.length||!r.E.length||(r.C.length===1&&r.E.length===1)) continue;
    const pairs=[]; for(const k of r.C) for(const c of r.E){ const L=label[k]; pairs.push([sim(L.name+' '+L.opt,ecProd(ecName[c])),k,c]); }
    pairs.sort((a,b)=>b[0]-a[0]);
    const uk=new Set(), uc=new Set();
    for(const [s,k,c] of pairs){ if(s<0.45||uk.has(k)||uc.has(c)) continue; uk.add(k); uc.add(c); add(k,c,'이름'); }
    r.C=r.C.filter(k=>!uk.has(k)); r.E=r.E.filter(c=>!uc.has(c));
  }
  // 결과 정리
  const rows=[];
  for(const [k,cs] of Object.entries(ev)){
    const top=Object.entries(cs).sort((a,b)=>b[1]-a[1]), saved=S.map[k];
    let st;
    if(top.length>1) st='확인 필요';
    else if(!saved) st='새로 연결';
    else if(saved.code===top[0][0]) st='저장됨과 같음';
    else st=saved.src==='manual'?'담당자 값과 다름':'저장됨과 다름';
    rows.push({key:k,...label[k],code:top[0][0],ecname:ecName[top[0][0]]||'',n:top[0][1],cands:top.map(([c,v])=>({code:c,n:v,name:ecName[c]||''})),how:[...how[k]].join('·'),st,saved});
  }
  // 연결 못한 옵션: 주문에 이카운트 품목이 남아 있는데 짝을 못 찾은 것만(재고2 파일이면 위탁 아닌 품목은 애초에 이카운트에 없다)
  const un={};
  for(const x of orders){
    const r=rest.get(x.o); if(!r||!r.C.length||!r.E.length) continue;
    for(const k of r.C){ if(ev[k]) continue; const u=(un[k] ||= {key:k,...label[k],orders:0,cands:{}}); u.orders++; for(const c of r.E) u.cands[c]=(u.cands[c]||0)+1; }
  }
  const unmatched=Object.values(un).map(u=>({...u,st:S.map[u.key]?'저장됨':'미연결',cands:Object.entries(u.cands).sort((a,b)=>b[1]-a[1]).map(([c,v])=>({code:c,n:v,name:ecName[c]||''})),saved:S.map[u.key]}));
  const ecOrders=Object.keys(ecBy).length, both=orders.length;
  S.result={rows,unmatched,ecOrders,both,ecName};
}

// ---------- 저장 ----------
async function saveAuto(){
  const R=S.result; if(!R) return;
  const entries=R.rows.filter(r=>r.st==='새로 연결'||r.st==='저장됨과 다름').map(r=>({key:r.key,code:r.code,name:r.ecname,label:`${r.name}${r.opt?' / '+r.opt:''}`,src:'auto',by:byName(),n:r.n}));
  if(!entries.length) return alert('저장할 새 연결이 없습니다.');
  const d=await getJSON(`${WORKER}/ecmap`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entries})});
  await reloadMap(); learn(); render();
  alert(`대응표에 ${n(d.saved)}건 저장했습니다. (전체 ${n(d.count)}건)`);
}
async function saveManual(key,code,label,name){
  if(!byName()){ alert('위쪽 "입력자"에 이름을 먼저 넣어 주세요.'); return false; }
  await getJSON(`${WORKER}/ecmap`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entries:[{key,code,name,label,src:'manual',by:byName()}]})});
  await reloadMap(); learn(); render(); return true;
}
async function reloadMap(){ S.map=(await getJSON(`${WORKER}/ecmap`)).map||{}; }

// ---------- 화면 ----------
function render(){
  if(!S.root) return;
  const saved=Object.values(S.map), man=saved.filter(v=>v.src==='manual').length;
  let h=`<div class="ec-card"><h2>품목코드 대응표</h2>
    <p class="ec-lead">카페24 상품·옵션을 이카운트 품목코드에 잇는 표입니다. 이미 입력된 이카운트 판매현황(품목별)을 올리면 같은 주문번호의 카페24 주문과 맞춰 자동으로 채우고,
      못 찾은 것만 담당자가 넣습니다. 담당자가 넣은 값은 자동 학습이 덮어쓰지 않습니다.</p>
    <div class="ec-row">
      <label>입력자 <input class="ec-in" id="ecBy" value="${esc(byName())}" placeholder="이름" style="width:120px"></label>
      <span class="go ec-file" style="height:36px">이카운트 판매현황 올리기 (여러 개 가능)<input type="file" id="ecFiles" accept=".xlsx,.xls" multiple aria-label="이카운트 판매현황 파일"></span>
      <span class="ec-sub" style="margin:0">저장된 대응 <b style="color:var(--ink)">${n(saved.length)}</b>건 (자동 ${n(saved.length-man)} · 담당자 ${n(man)})</span>
    </div>
    ${S.files.length?`<div class="ec-stat">올린 파일: ${S.files.map(f=>`<b>${esc(f.name)}</b> (${n(f.rows)}행)`).join(', ')} · 카페24 ${S.months.join(', ')} 주문</div>`:''}
    ${S.loading?`<div class="ec-stat">${esc(S.loading)}</div>`:''}
    ${S.err?`<div class="ec-stat err">${esc(S.err.message||S.err)}</div>`:''}
    ${S.truncated&&S.truncated.length?`<div class="ec-stat err">${S.truncated.join(', ')} 카페24 주문이 너무 많아 일부만 받았습니다.</div>`:''}
  </div>`;
  if(S.result) h+=resultCard();
  S.root.innerHTML=h;
}
function resultCard(){
  const R=S.result, cnt={}; for(const r of R.rows) cnt[r.st]=(cnt[r.st]||0)+1;
  const un=R.unmatched.filter(u=>u.st==='미연결');
  const views=[['new','새로 연결',(cnt['새로 연결']||0)+(cnt['저장됨과 다름']||0)],['check','확인 필요',(cnt['확인 필요']||0)+(cnt['담당자 값과 다름']||0)],['un','미연결',un.length],['same','저장됨과 같음',cnt['저장됨과 같음']||0],['saved','저장된 전체',Object.keys(S.map).length]];
  const q=S.q.trim().toLowerCase(), hit=x=>!q||[x.name,x.opt,x.key,x.code,x.ecname,x.label].join(' ').toLowerCase().includes(q);
  let list, body='';
  if(S.view==='new') list=R.rows.filter(r=>r.st==='새로 연결'||r.st==='저장됨과 다름');
  else if(S.view==='check') list=R.rows.filter(r=>r.st==='확인 필요'||r.st==='담당자 값과 다름');
  else if(S.view==='same') list=R.rows.filter(r=>r.st==='저장됨과 같음');
  else if(S.view==='un') list=un;
  else list=Object.entries(S.map).map(([key,v])=>({key,...v,saved:v}));
  list=list.filter(hit);
  const codes=Object.keys(R.ecName).sort();
  const picker=(x,cands)=>`<input class="ec-in" list="ecCodes" data-a="code" data-k="${esc(x.key)}" data-label="${esc(`${x.name||x.label||''}${x.opt?' / '+x.opt:''}`)}" placeholder="품목코드 입력·선택" style="width:170px">
     <button class="ec-dl" data-a="savecode" data-k="${esc(x.key)}">저장</button>
     ${cands&&cands.length?`<div class="ec-sub">후보: ${cands.slice(0,4).map(c=>`<a href="#" data-a="pick" data-k="${esc(x.key)}" data-c="${esc(c.code)}">${esc(c.code)}</a> ${esc(ecProd(c.name)).slice(0,24)} (${c.n})`).join(' · ')}</div>`:''}`;
  if(S.view==='saved'){
    body=`<thead><tr><th>카페24 상품 · 옵션</th><th>옵션코드</th><th>이카운트 품목코드</th><th>이카운트 품명</th><th>출처</th><th>근거</th><th>저장일</th></tr></thead><tbody>
      ${list.slice(0,500).map(x=>`<tr><td class="l">${esc(x.label)}</td><td>${esc(x.key)}</td><td><b>${esc(x.code)}</b></td><td class="l">${esc(x.name)}</td>
        <td><span class="ec-badge ${x.src==='manual'?'ec-ok':'ec-info'}">${x.src==='manual'?'담당자':'자동'}</span>${x.by?`<div class="ec-sub">${esc(x.by)}</div>`:''}</td><td>${x.n?n(x.n)+'건':''}</td><td>${esc(x.at||'')}</td></tr>`).join('')}</tbody>`;
  }else if(S.view==='un'){
    body=`<thead><tr><th>카페24 상품 · 옵션</th><th>옵션코드</th><th>나온 주문</th><th>이카운트 품목코드 넣기</th></tr></thead><tbody>
      ${list.map(x=>`<tr><td class="l">${esc(x.name)}${x.opt?`<div class="ec-sub">${esc(x.opt)}</div>`:''}</td><td>${esc(x.key)}</td><td>${n(x.orders)}</td><td class="l">${picker(x,x.cands)}</td></tr>`).join('')}</tbody>`;
  }else{
    body=`<thead><tr><th>카페24 상품 · 옵션</th><th>옵션코드</th><th>이카운트 품목코드</th><th>이카운트 품명</th><th>근거</th><th>상태</th>${S.view==='check'?'<th>담당자 확인</th>':''}</tr></thead><tbody>
      ${list.map(x=>`<tr><td class="l">${esc(x.name)}${x.opt?`<div class="ec-sub">${esc(x.opt)}</div>`:''}</td><td>${esc(x.key)}</td>
        <td><b>${esc(x.code)}</b>${x.cands.length>1?`<div class="ec-sub">${x.cands.map(c=>`${esc(c.code)} ${c.n}건`).join(' / ')}</div>`:''}${x.saved&&x.saved.code!==x.code?`<div class="ec-sub">저장된 값 ${esc(x.saved.code)}(${x.saved.src==='manual'?'담당자':'자동'})</div>`:''}</td>
        <td class="l">${esc(ecProd(x.ecname))}</td><td>${n(x.n)}건<div class="ec-sub">${esc(x.how)}</div></td>
        <td><span class="ec-badge ${x.st==='새로 연결'||x.st==='저장됨과 같음'?'ec-ok':x.st==='확인 필요'||x.st==='담당자 값과 다름'?'ec-bad':'ec-warn'}">${esc(x.st)}</span></td>
        ${S.view==='check'?`<td class="l">${picker(x,x.cands)}</td>`:''}</tr>`).join('')}</tbody>`;
  }
  return `<div class="ec-card"><h2>학습 결과</h2>
    <div class="ec-kpis">
      <div class="ec-kpi"><div class="l">이카운트 주문</div><div class="n">${n(R.ecOrders)}건</div></div>
      <div class="ec-kpi"><div class="l">카페24와 맞춘 주문</div><div class="n">${n(R.both)}건</div></div>
      <div class="ec-kpi"><div class="l">새로 연결</div><div class="n ok">${n((cnt['새로 연결']||0)+(cnt['저장됨과 다름']||0))}개</div></div>
      <div class="ec-kpi"><div class="l">확인 필요 (코드 여러 개)</div><div class="n ${(cnt['확인 필요']||0)?'warn':''}">${n((cnt['확인 필요']||0)+(cnt['담당자 값과 다름']||0))}개</div></div>
      <div class="ec-kpi"><div class="l">미연결</div><div class="n ${un.length?'warn':''}">${n(un.length)}개</div></div>
    </div>
    <div class="ec-row"><div class="ec-seg">${views.map(([v,l,c])=>`<button data-a="view" data-v="${v}" class="${S.view===v?'on':''}">${l} ${n(c)}</button>`).join('')}</div>
      <input class="ec-in" id="ecQ" value="${esc(S.q)}" placeholder="상품명·코드 검색" style="width:200px">
      <span style="flex:1"></span>
      <button class="go" data-a="saveauto" style="height:36px">새로 연결 ${n((cnt['새로 연결']||0)+(cnt['저장됨과 다름']||0))}개 대응표에 저장</button></div>
    <div class="ec-scroll"><table class="ec-t">${body}</table></div><datalist id="ecCodes">${codes.map(c=>`<option value="${esc(c)}">${esc(ecProd(R.ecName[c]))}</option>`).join('')}</datalist>
    <p class="ec-note">근거 = 그 짝이 확인된 주문 수 · 1:1 = 한 주문에 남은 카페24 옵션 1개와 이카운트 품목 1개 · 이름 = 같은 주문 안에서 상품명이 가장 비슷한 짝 ·
      확인 필요 = 한 옵션에 서로 다른 코드가 나옴(담당자가 골라야 함) · 미연결 = 같은 주문에 이카운트 품목이 남았는데 짝을 못 찾음.
      재고2(위탁)만 뽑은 파일이면 위탁이 아닌 상품은 애초에 이카운트 파일에 없어 학습되지 않습니다 — 전체 품목으로 뽑으면 더 많이 채워집니다.</p></div>`;
}

async function onFiles(files){
  S.err=null; S.loading='이카운트 파일 읽는 중…'; render();
  try{
    await loadXLSX();
    for(const f of files){
      const rows=parseEcount(XLSX.read(await f.arrayBuffer(),{type:'array'}),f.name);
      S.ecRows.push(...rows); S.files.push({name:f.name,rows:rows.length});
    }
    // 이카운트 주문번호가 걸친 달만 카페24 에서 받는다(주문 5건 미만인 달은 건너뜀 — 이월·반품 전표)
    const mc={}; for(const r of S.ecRows){ const ym=r.order.slice(0,4)+'-'+r.order.slice(4,6); mc[ym]=(mc[ym]||0)+1; }
    const need=Object.keys(mc).filter(m=>mc[m]>=5&&!S.months.includes(m)).sort().slice(-6);
    for(const ym of need){ S.loading=`카페24 ${ym} 주문 받는 중… (한 달 10~20초)`; render(); await loadC24Month(ym); S.months.push(ym); }
    S.loading='짝 찾는 중…'; render();
    learn(); S.view='new';
  }catch(e){ S.err=e; }
  S.loading=''; render();
}

function wire(root){
  root.addEventListener('change',e=>{
    const t=e.target;
    if(t.id==='ecFiles'){ const fs=[...t.files]; t.value=''; if(fs.length) onFiles(fs); return; }
    if(t.id==='ecBy'){ try{ localStorage.setItem(LS_BY,t.value.trim()); }catch(err){} return; }
  });
  root.addEventListener('input',e=>{ if(e.target.id==='ecQ'){ S.q=e.target.value; const pos=e.target.selectionStart; render(); const q=$('ecQ'); if(q){ q.focus(); q.setSelectionRange(pos,pos); } } });
  root.addEventListener('click',async e=>{
    const t=e.target.closest('[data-a]'); if(!t) return;
    const a=t.dataset.a;
    if(a==='view'){ S.view=t.dataset.v; render(); return; }
    if(a==='pick'){ e.preventDefault(); const inp=root.querySelector(`input[data-a="code"][data-k="${CSS.escape(t.dataset.k)}"]`); if(inp) inp.value=t.dataset.c; return; }
    if(a==='saveauto'){ t.disabled=true; try{ await saveAuto(); }catch(err){ alert('저장하지 못했습니다: '+err.message); } t.disabled=false; return; }
    if(a==='savecode'){
      const inp=root.querySelector(`input[data-a="code"][data-k="${CSS.escape(t.dataset.k)}"]`), code=(inp&&inp.value||'').trim();
      if(!code) return alert('품목코드를 넣어 주세요.');
      t.disabled=true;
      try{ await saveManual(t.dataset.k,code,inp.dataset.label,(S.result&&S.result.ecName[code])||''); }catch(err){ alert('저장하지 못했습니다: '+err.message); }
      t.disabled=false; return;
    }
  });
}

let WIRED=false;
window.loadEcountTab=async function(el){
  if(!$('ecCss')){ const s=document.createElement('style'); s.id='ecCss'; s.textContent=STYLE; document.head.appendChild(s); }
  S.root=el;
  if(!WIRED){ wire(el); WIRED=true; }
  el.innerHTML='<div class="state"><div class="spinner"></div>대응표 불러오는 중…</div>';
  try{ await reloadMap(); }catch(e){ S.err=e; }
  render();
};
window.__ecount={S,learn,parseEcount};
})();
