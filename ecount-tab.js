// 이카운트 판매 입력 — 왼쪽 메뉴 큰 카테고리(page=log: 판매입력 파일 이력). 하위: '데일리 전표 생성'(page=daily, 메인) · '품목코드 맵핑'(page=map).
// index.html 의 enterEcount() 가 불러와 loadEcountTab(el, view) 를 부른다.
//
// 품목코드 맵핑: 카페24 상품·옵션 → 이카운트 품목코드 대응표
//   · 카페24 자체상품코드는 이카운트 품목코드가 아니다(ARG…·4205… 등, 1/3 만 채워짐) → 이미 입력된 이카운트 전표에서 배운다.
//   · 이카운트 판매현황(품목별) 엑셀을 올리면 주문번호(결제일 열)로 카페24 주문과 맞춰 짝을 찾는다.
//       ① 한 주문에 카페24 옵션 1개 · 이카운트 품목 1개 → 바로 연결
//       ② 이미 아는 짝을 빼고 남은 게 1:1 이면 연결 (반복)
//       ③ 그래도 남으면 이름이 충분히 비슷하고 서로 가장 비슷한 것끼리만 연결
//   · 한 옵션에 서로 다른 코드가 나오면 자동으로 정하지 않고 '확인 필요'로 남긴다(담당자가 고른다). 입력자 이름은 받지 않는다(Su, 2026-10-14).
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

const S={root:null, page:'map', log:null, logErr:null, logMonth:'', map:{}, files:[], ecRows:[], c24:{}, months:[], loading:'', err:null, result:null, view:'new', q:''};

async function getJSON(url,opt){
  const r=await fetch(url,{cache:'no-store',...opt,headers:{...authHeaders(),...((opt&&opt.headers)||{})}});
  const d=await r.json().catch(()=>({error:'HTTP '+r.status}));
  if(d.error) throw new Error(d.error);
  return d;
}
function loadXLSX(){ return window.XLSX?Promise.resolve():new Promise((ok,ng)=>{const sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';sc.onload=ok;sc.onerror=()=>ng(new Error('엑셀 라이브러리를 불러오지 못했습니다'));document.head.appendChild(sc);}); }

// ---------- 이카운트 판매현황(품목별) ----------
// 머리글(일자·품목코드·품명 및 규격·수량)을 찾고, 주문번호 열은 값 모양(20260801-0000047)으로 찾는다(머리글이 결제일·주문일 등으로 다르다).
function parseEcount(wb,fname,keepAdv){
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:null,blankrows:false});
  let h=-1;
  for(let i=0;i<Math.min(rows.length,15);i++){ const r=(rows[i]||[]).map(c=>String(c??'').trim()); if(r.includes('품목코드')&&r.includes('수량')&&(r.includes('품명 및 규격')||r.includes('품목명'))){ h=i; break; } }
  if(h<0) throw new Error(`${fname}: 머리글(품목코드·품명 및 규격·수량)을 찾지 못했습니다. 이카운트 판매현황(품목별) 엑셀이 맞는지 확인해 주세요.`);
  const head=rows[h].map(c=>String(c??'').trim()), col=k=>head.indexOf(k);
  const cCode=col('품목코드'), cName=col('품명 및 규격')>=0?col('품명 및 규격'):col('품목명'), cQty=col('수량'), cPrice=col('정가');
  const cTot=head.findIndex(h=>h.replace(/\s/g,'')==='합계'), cPay=col('결제유형'), cCust=head.findIndex(h=>/고객명/.test(h));
  const body=rows.slice(h+1).filter(r=>r[cCode]);
  let cOrd=-1,best=0;
  for(let i=0;i<head.length;i++){ const k=body.reduce((t,r)=>t+(ORD.test(String(r[i]??'').trim())?1:0),0); if(k>best){best=k;cOrd=i;} }
  if(best<body.length*0.3) throw new Error(`${fname}: 주문번호(예: 20260801-0000047) 열을 찾지 못했습니다.`);
  return body.map(r=>({order:String(r[cOrd]??'').trim(),code:String(r[cCode]).trim(),name:String(r[cName]??'').trim(),qty:Number(r[cQty])||0,price:cPrice<0?0:Math.round(Number(r[cPrice])||0),
      total:cTot<0?0:Math.round(Number(r[cTot])||0),pay:cPay<0?'':String(r[cPay]??'').trim(),cust:cCust<0?'':String(r[cCust]??'').trim()}))
    .map(r=>({...r,adv:/선수금/.test(r.code+r.name)}))
    .filter(r=>ORD.test(r.order)&&(keepAdv||!r.adv));   // 선수금 품목은 실제 상품이 아니다(데일리 금액 대조에는 합계로 넣는다)
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
  // 이카운트 품목 정가, 카페24 옵션 판매 단가(판매가÷수량) — 후보를 금액으로도 고를 수 있게
  const ecBy={}, ecName={}, ecPrice={};
  for(const r of S.ecRows){ if(isSignRow(r)) continue;   // 사인지 줄은 카페24 옵션과 짝이 아니다
    const o=(ecBy[r.order] ||= {}); o[r.code]=(o[r.code]||0)+r.qty; if(!ecName[r.code]) ecName[r.code]=r.name; if(r.price&&!ecPrice[r.code]) ecPrice[r.code]=r.price; }
  const label={}, orders=[];
  for(const o of Object.keys(ecBy)){
    const ls=S.c24[o]; if(!ls) continue;
    const C={}; for(const l of ls){ const k=l.variant_code||String(l.product_no); C[k]=(C[k]||0)+l.qty; if(!label[k]) label[k]={name:l.product_name,opt:optText(l.option_value),pno:l.product_no,price:0};
      if(l.qty>0&&!label[k].price) label[k].price=Math.round(l.sale/l.qty); }
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
    if(saved&&saved.src==='manual') st=saved.code===top[0][0]&&top.length===1?'저장됨과 같음':'담당자 확정';
    else if(top.length>1) st='확인 필요';
    else if(!saved) st='새로 연결';
    else if(saved.code===top[0][0]) st='저장됨과 같음';
    else st='저장됨과 다름';
    rows.push({key:k,...label[k],code:top[0][0],ecname:ecName[top[0][0]]||'',ecprice:ecPrice[top[0][0]]||0,n:top[0][1],cands:top.map(([c,v])=>({code:c,n:v,name:ecName[c]||'',price:ecPrice[c]||0})),how:[...how[k]].join('·'),st,saved});
  }
  // 연결 못한 옵션: 주문에 이카운트 품목이 남아 있는데 짝을 못 찾은 것만(재고2 파일이면 위탁 아닌 품목은 애초에 이카운트에 없다)
  const un={};
  for(const x of orders){
    const r=rest.get(x.o); if(!r||!r.C.length||!r.E.length) continue;
    for(const k of r.C){ if(ev[k]) continue; const u=(un[k] ||= {key:k,...label[k],orders:0,cands:{}}); u.orders++; for(const c of r.E) u.cands[c]=(u.cands[c]||0)+1; }
  }
  // 후보는 금액이 같은 것 → 같이 나온 주문 수 순
  const sortC=(price,arr)=>arr.sort((a,b)=>((b.price===price&&price>0)-(a.price===price&&price>0))||b.n-a.n);
  const unmatched=Object.values(un).map(u=>({...u,st:S.map[u.key]?'저장됨':'미연결',cands:sortC(u.price,Object.entries(u.cands).map(([c,v])=>({code:c,n:v,name:ecName[c]||'',price:ecPrice[c]||0}))),saved:S.map[u.key]}));
  for(const r of rows) sortC(r.price,r.cands);
  const ecOrders=Object.keys(ecBy).length, both=orders.length;
  S.result={rows,unmatched,ecOrders,both,ecName,ecPrice};
}

// ---------- 저장 ----------
function flash(msg,bad){ S.flash={msg,bad,at:Date.now()}; render(); setTimeout(()=>{ if(S.flash&&Date.now()-S.flash.at>=5900){ S.flash=null; render(); } },6000); }
async function saveAuto(){
  const R=S.result; if(!R) return;
  const entries=R.rows.filter(r=>r.st==='새로 연결'||r.st==='저장됨과 다름').map(r=>({key:r.key,code:r.code,name:r.ecname,label:`${r.name}${r.opt?' / '+r.opt:''}`,src:'auto',n:r.n}));
  if(!entries.length) return flash('저장할 새 연결이 없습니다.');
  const d=await getJSON(`${WORKER}/ecmap`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entries})});
  await reloadMap(); learn();
  flash(d.skipped?`${n(d.saved)}건 저장 · ${n(d.skipped)}건은 저장되지 않았습니다(담당자 값이 이미 있음 등). 전체 ${n(d.count)}건`:`대응표에 ${n(d.saved)}건 저장했습니다. 전체 ${n(d.count)}건`,!!d.skipped);
}
async function saveManual(key,code,label,name){
  const d=await getJSON(`${WORKER}/ecmap`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entries:[{key,code,name,label,src:'manual'}]})});
  if(!d.saved){ flash(`저장되지 않았습니다: ${code} — 코드 형식을 확인해 주세요.`,true); return false; }
  await reloadMap(); learn();
  flash(`저장됨: ${label} → ${code}`); return true;
}
async function reloadMap(){ const d=await getJSON(`${WORKER}/ecmap`); S.map=d.map||{}; S.sign=d.sign||{}; }
// 사인지 — 일부 에디션은 이카운트에 사인지 품목(에디션코드+SI, 수량 같게, 0원)을 같이 넣는다. 카페24 주문엔 표시가 없다.
//   이카운트 파일에서 한 주문에 X 와 X사인지(이름에 [사인지], 보통 XSI)가 같이 있으면 'X 엔 사인지가 붙는다'로 배워 워커에 둔다.
const isSignRow=r=>/\[사인지\]/.test(r.name);
async function learnSign(rows){
  const by={}; for(const r of rows) (by[r.order] ||= []).push(r);
  const add={};
  for(const rs of Object.values(by)) for(const si of rs.filter(isSignRow)){
    const base=rs.find(r=>!isSignRow(r)&&(si.code===r.code+'SI'||si.code.startsWith(r.code)))||rs.filter(r=>!isSignRow(r)).length===1&&rs.find(r=>!isSignRow(r));
    if(base&&S.sign[base.code]!==si.code) add[base.code]=si.code;
  }
  if(!Object.keys(add).length) return 0;
  const d=await getJSON(`${WORKER}/ecmap`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sign:add})});
  S.sign=d.sign||S.sign; return Object.keys(add).length;
}
const signName=nm=>{ nm=String(nm||''); const m=nm.match(/^(.*?)(\s*\[[^\]]*\])$/); return m?`${m[1]} [사인지]${m[2]}`:`${nm} [사인지]`; };

// ---------- 화면 ----------
// ---------- 이카운트 판매 입력: 판매입력 파일 이력 ----------
// 날짜마다 판매입력 파일을 만든 적이 있는지 · 누가(판매자로 고른 담당자) · 언제 만들었는지, 파일은 목록에서 바로 받는다.
// 이력은 달마다 따로 저장돼 있어 고른 달 것만 부른다(지워지지 않는다). 파일은 만든 날부터 400일 보관.
async function loadLog(){
  if(!S.logMonth) S.logMonth=new Date(Date.now()+9*3600e3).toISOString().slice(0,7);
  S.logErr=null; try{ S.log=(await getJSON(`${WORKER}/ecsales?month=${S.logMonth}`)).log||[]; }catch(e){ S.logErr=e; S.log=[]; }
}
const expired=f=>{ const t=new Date(f.at.replace(' ','T')+':00+09:00'); return Date.now()-t.getTime()>400*86400e3; };
async function downloadFile(id){
  const d=await getJSON(`${WORKER}/ecsales?id=${encodeURIComponent(id)}`);
  const bin=atob(d.b64), u8=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([u8],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); a.download=d.filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
function renderLog(){
  if(!S.logMonth){ const t=new Date(Date.now()+9*3600e3); S.logMonth=t.toISOString().slice(0,7); }
  const [y,m]=S.logMonth.split('-').map(Number), last=new Date(y,m,0).getDate();
  const today=new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
  const byDate={}; for(const f of (S.log||[])) for(const d of (f.dates||[])) (byDate[d] ||= []).push(f);
  const days=[]; for(let d=last;d>=1;d--){ const ds=`${S.logMonth}-${String(d).padStart(2,'0')}`; if(ds<=today) days.push(ds); }
  const made=days.filter(d=>byDate[d]).length;
  const wd=ds=>'일월화수목금토'[new Date(ds+'T00:00:00').getDay()];
  const rows=days.map(ds=>{
    const fs=byDate[ds]||[];
    if(!fs.length) return `<tr><td><b>${ds.slice(5).replace('-','/')}</b> <span class="ec-sub" style="display:inline">${wd(ds)}</span></td><td colspan="5" style="color:var(--ghost)">아직 만든 판매입력 파일 없음</td></tr>`;
    return fs.map((f,i)=>`<tr>${i===0?`<td rowspan="${fs.length}"><b>${ds.slice(5).replace('-','/')}</b> <span class="ec-sub" style="display:inline">${wd(ds)}</span>${fs.length>1?`<div class="ec-sub">${fs.length}개</div>`:''}</td>`:''}
      <td class="l">${esc(f.filename)}${(f.dates||[]).length>1?`<div class="ec-sub">${esc(f.dates.map(d=>d.slice(5).replace('-','/')).join(', '))} 포함</div>`:''}</td>
      <td>${esc(f.by||'—')}</td><td>${esc(f.at)}</td><td>${n(f.orders)}건 · ${n(f.rows)}행</td>
      <td>${expired(f)?'<span class="ec-sub" style="margin:0">보관 기간 지남</span>':`<button class="ec-dl" data-a="logdl" data-id="${esc(f.id)}">받기</button>`}</td></tr>`).join('');
  }).join('');
  S.root.innerHTML=`<div class="ec-card"><h2>판매입력 파일 이력</h2>
    <p class="ec-lead">데일리 전표 생성에서 만든 이카운트 판매입력 파일이 날짜별로 남습니다. 만든 사람은 파일을 만들 때 고른 담당자(판매자)입니다. 이력은 계속 남고, 파일은 만든 날부터 400일 보관합니다.</p>
    <div class="ec-row"><label>월 <input type="month" class="ec-in" id="ecLogMonth" value="${esc(S.logMonth)}"></label>
      <span class="ec-sub" style="margin:0">${n(days.length)}일 중 <b style="color:var(--ink)">${n(made)}일</b> 파일 있음</span>
      <span style="flex:1"></span><button class="ec-dl" data-a="logreload">새로고침</button>
      <button class="go" data-a="godaily" style="height:36px">데일리 전표 생성으로</button></div>
    ${S.logErr?`<div class="ec-stat err">${esc(S.logErr.message)}</div>`:''}
    <div class="ec-scroll"><table class="ec-t" style="min-width:720px"><thead><tr><th>날짜</th><th>판매입력 파일</th><th>만든 사람</th><th>만든 시각</th><th>주문 · 행</th><th></th></tr></thead>
      <tbody>${rows||'<tr><td colspan="6" style="color:var(--muted)">이 달에는 날짜가 없습니다.</td></tr>'}</tbody></table></div></div>`;
}

// ---------- 데일리 전표 생성(page=daily) · 판매 입력 대조(page=recon) ----------
// 두 화면은 날짜·카페24 주문을 같이 쓴다. Su(2026-10-14): 판매입력 만들기에는 이카운트 대조가 필요 없다 → 화면을 나눴다.
// ② 데일리 전표 생성: 카페24 주문만으로 판매입력 파일을 만든다. 이미 만든 파일(/ecsales 이력 ids)에 든 주문은 '파일 있음'으로 표시·기본 제외.
// ① 판매 입력 대조: 이카운트에서 받은 판매현황(품목별)을 올려 카페24 주문과 주문번호로 맞춘다. 미입력은 데일리 전표 생성으로 넘긴다.
//    · 금액 = 실결제금액(payment_amount = PG 결제, 적립금 제외) + 네이버페이 포인트 ↔ 이카운트 합계(그 주문 행 전부, 선수금 포함)
//    · 결제유형 = 결제업체·결제수단으로 정한 이카운트 결제유형 ↔ 이카운트 결제유형
//    · 품목·수량 = 품목코드 맵핑으로 바꾼 카페24 옵션 ↔ 이카운트 품목코드 (선수금 주문은 건너뜀)
// 판매입력 양식: 고른 주문을 이카운트 판매입력 템플릿(28열)으로 만든다.
//    · 이카운트 실데이터(2026-08) 규칙: 배송비 품목은 따로 없다. 줄 금액 = 카페24 상품별 할인 후 금액(net),
//      주문 실결제금액과의 차이(배송비·적립금·주문 쿠폰)는 net 비율로 나눠 더한다(끝 줄이 나머지). 8/5 정상 주문 36줄 중 35줄 원 단위 일치.
//      단가 = 정가÷1.1, 공급가액 = 배분액÷1.1, 부가세 = 나머지. 면세(세율 0) 품목은 ÷1.1 하지 않는다.
//    · 판매처·출고처는 이름으로 넣는다(Su, 2026-10-14). 출고처·고객명 앞말(퀵)·택배)·설치))·판매자는 사람이 넣는다.
//    · 고객 정보는 브라우저에서만 쓴다. 만든 파일만 워커 /ecsales 에 보관(로그인 뒤, 400일).
const WH=['온라인창고','온라인 브랜드창고'];
const PRE=['퀵)','택배)','설치)','차량)'];
const TPL=['판매일-No.','순번','판매처','판매처명','판매자','출고처','거래유형','결제유형','결제사항','결제일','배송일자','고객연락처','[택배/차량배송/설치여부] - 고객명','배송결과','배송주소','품목코드','품목명','규격','수량','에디션 No.','정가','단가','외화공급가액','공급가액','부가세','상품옵션','생산전표생성','적요'];
const D={signOn:{},made:{},date:'',orders:[],lines:{},ec:null,ecFile:'',loading:'',err:null,view:'bad',sel:{},ed:{},names:{},codes:{},seller:'',wh:WH[0],flash:null};
const kstDay=off=>new Date(Date.now()+9*3600e3+off*86400e3).toISOString().slice(0,10);
const lsGet=(k,d)=>{ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } };
const lsSet=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
const edKey=()=>`pbg_ecdaily_${D.date}`;
const ed=o=>(D.ed[o] ||= {});
function saveEd(){ lsSet(edKey(),D.ed); }   // 메모·처리완료·앞말·출고처만(이름·연락처는 저장하지 않는다)

// 결제업체·결제수단 → 이카운트 결제유형 (자사몰 판매입력 가이드 3-5p + 이카운트 실데이터)
function payType(o){
  const m=(o.pay_methods||[]).filter(x=>!['point','coupon','credit','mileage','deposit'].includes(x));
  const main=m[0]||'', pg=String(o.pg||'').toLowerCase(), ez=String(o.easypay||'').toLowerCase();
  if(o.market==='NCHECKOUT'||/naver/.test(pg+ez)) return '12.네이버페이';
  if(/kakao/.test(pg+ez)) return '17.카카오페이';
  if(ez==='toss'||/(^|,)toss/.test(pg)) return main==='prepaid'?'27.토스페이(토스머니)':'22.토스페이(카드)';
  if(/payco/.test(pg+ez)) return main==='prepaid'?'26.페이코-페이코 포인트':'23.페이코-카드결제(간편)';
  if(/dacom|tosspayments/.test(pg)){ if(main==='card') return '14. PG(카드)'; if(['cash','tcash','virtual','icash'].includes(main)) return '16. PG(무통장입금)'; }
  if(!pg&&main==='cash') return '6.현금영수증(계좌이체)';
  if(!main&&o.payment_amount===0) return '';   // 적립금·쿠폰으로만 결제
  return '';
}
const payNo=s=>{ const m=String(s||'').match(/^\s*(\d+)\s*\./); return m?m[1]:String(s||'').replace(/\s/g,''); };
const paidOf=o=>(o.payment_amount||0)+(o.naver_point||0);
const ymd=d=>d.replace(/-/g,'');

async function loadDailyC24(){
  const f=D.date;
  D.loading=`카페24 ${f} 주문 받는 중…`; D.err=null; render();
  try{
    const d=await getJSON(`${WORKER}/?bs=${f}&be=${f}&as=${f}&ae=${f}&tab=orderitems&from=${f}&to=${f}&full=1&nocache=1&daily=1`);
    D.orders=d.orders||[]; D.lines={};
    for(const l of (d.lines||[])) (D.lines[l.order_id] ||= []).push(l);
    D.truncated=!!d.truncated;
  }catch(e){ D.err=e; D.orders=[]; D.lines={}; }
  await loadMade();
  D.ed=lsGet(edKey(),{}); D.names={}; D.sel={}; D.selInit=false; D.loading='';
  compute(); render();
}
// 그 달 판매입력 파일 이력 → 주문번호별로 어떤 파일에 들어갔는지
async function loadMade(){
  D.made={};
  try{
    const log=(await getJSON(`${WORKER}/ecsales?month=${D.date.slice(0,7)}`)).log||[];
    for(const f of log) for(const id of (f.ids||[])) (D.made[id] ||= []).push({by:f.by,at:f.at,filename:f.filename});
  }catch(e){}
}
async function onDailyFile(f){
  D.err=null; D.loading='이카운트 파일 읽는 중…'; render();
  try{ await loadXLSX(); D.ec=parseEcount(XLSX.read(await f.arrayBuffer(),{type:'array'}),f.name,true); D.ecFile=f.name;
    try{ const k=await learnSign(D.ec); if(k) D.signLearned=k; }catch(e){} }
  catch(e){ D.err=e; }
  D.loading=''; compute(); render();
}

// 주문별 대조 결과
function compute(){
  const pre=ymd(D.date||'');
  const ecBy={};
  for(const r of (D.ec||[])) if(r.order.startsWith(pre)) (ecBy[r.order] ||= []).push(r);
  const out=[];
  for(const o of D.orders){
    const ls=(D.lines[o.order_id]||[]);
    const live=ls.filter(l=>l.canceled!=='Y'&&l.paywin!=='Y');
    const e=ecBy[o.order_id]||null, paid=paidOf(o), want=payType(o);
    const r={o,ls,live,e,paid,want,ecTot:e?e.reduce((t,x)=>t+x.total,0):null,ecPay:e?([...new Set(e.map(x=>x.pay).filter(Boolean))].join(', ')):'',adv:e?e.some(x=>x.adv):false,issues:[],item:''};
    const unmapped=live.filter(l=>!codeOf(l));
    if(o.paid!=='Y') r.st='입금대기';
    else if(o.canceled==='Y'||!live.length&&ls.some(l=>l.canceled==='Y')) r.st=e?'취소 확인':'취소';
    else if(ls.length&&ls.every(l=>l.paywin==='Y')) r.st='개인결제창';
    r.gst=r.st||(D.made[o.order_id]?'파일 있음':'새 주문');
    if(!r.st){
      if(!D.ec) r.st='대조 전';
      else if(!e) r.st='미입력';
      else{
        if(Math.abs(paid-r.ecTot)>1) r.issues.push('금액불일치');
        if(want&&r.ecPay&&payNo(want)!==payNo(r.ecPay)) r.issues.push('결제유형 확인');
        else if(!want) r.issues.push('결제유형 확인');
        if(r.adv) r.item='선수금';
        else if(unmapped.length) r.item=`맵핑 없음 ${unmapped.length}`;
        else{
          const C={},E={}; for(const l of live){ const c=codeOf(l); C[c]=(C[c]||0)+l.qty; } for(const x of e) if(!isSignRow(x)) E[x.code]=(E[x.code]||0)+x.qty;
          const same=Object.keys(C).length===Object.keys(E).length&&Object.keys(C).every(c=>E[c]===C[c]);
          r.item=same?'일치':'불일치'; if(!same) r.issues.push('품목·수량 불일치');
        }
        r.st=r.issues.length?r.issues[0]:'정상';
      }
    }
    out.push(r);
  }
  // 이카운트에만 있는 주문
  const seen=new Set(D.orders.map(o=>o.order_id));
  for(const [k,e] of Object.entries(ecBy)) if(!seen.has(k)) out.push({o:{order_id:k},ls:[],live:[],e,paid:null,want:'',ecTot:e.reduce((t,x)=>t+x.total,0),ecPay:[...new Set(e.map(x=>x.pay))].join(', '),issues:[],st:'카페24에 없음',item:''});
  D.rows=out;
  // 처음 열 때 아직 판매입력 파일에 안 넣은 정상 결제 주문을 고른다
  if(!D.selInit&&D.orders.length){ for(const r of out) if(r.gst==='새 주문') D.sel[r.o.order_id]=true; D.selInit=true; }
}
function signOn(l){ const k=l.variant_code||String(l.product_no); return k in D.signOn?D.signOn[k]:!!(S.sign||{})[codeOf(l)]; }
function codeOf(l){ const k=l.variant_code||String(l.product_no); return D.codes[k]||(S.map[k]&&S.map[k].code)||''; }
const BAD_ST=['미입력','금액불일치','결제유형 확인','품목·수량 불일치','취소 확인','카페24에 없음'];
const stCls=st=>st==='정상'?'ec-ok':BAD_ST.includes(st)?'ec-bad':st==='대조 전'?'ec-info':'ec-warn';

// ---------- 판매입력 양식 ----------
// 줄 금액 = 상품별 할인 후 금액 + (주문 실결제금액 − 그 합)을 비율로 나눈 몫. 끝 줄이 나머지 → 줄 합계 = 실결제금액.
function buildRows(){
  const rows=[], miss=[], orders=[];
  let seq=0;
  for(const r of (D.rows||[])){
    const o=r.o; if(!D.sel[o.order_id]||!r.live.length) continue;
    seq++; orders.push(o.order_id);
    const E=ed(o.order_id), wh=E.wh||D.wh, preTxt=(E.pre||'').trim();
    const nm=D.names[o.order_id]??(o.rc_name||o.buyer||'');
    const cust=preTxt?`${preTxt}${/[\s]$/.test(preTxt)?'':' '}${nm}`:nm;
    const tot=paidOf(o), base=r.live.reduce((t,l)=>t+l.net,0);
    let left=tot;
    r.live.forEach((l,i)=>{
      const amt=i===r.live.length-1?left:Math.round(l.net+(tot-base)*(base?l.net/base:1/r.live.length)); left-=amt;
      const unit=l.qty?Math.round(l.sale/l.qty):0, tax=Number(l.tax_rate)>0;
      const supply=tax?Math.round(amt/1.1):amt;
      const code=codeOf(l); if(!code) miss.push(l);
      const k=l.variant_code||String(l.product_no), m=S.map[k];
      const head=[ymd(D.date),seq,'온라인 직영몰','온라인 직영몰',D.seller,wh,'온라인 (직영몰)',r.want||'','',o.order_id,'',o.rc_phone||'',cust,'',o.rc_addr||''];
      const pname=(m&&m.code===code&&m.name)||l.product_name;
      rows.push([...head,code,pname,'',l.qty,'',unit,tax?Math.round(unit/1.1):unit,'',supply,amt-supply,optText(l.option_value),'','']);
      if(code&&signOn(l)) rows.push([...head,S.sign[code]||code+'SI',signName(pname),'',l.qty,'',0,'','',0,0,'','','']);
    });
  }
  return {rows,miss,orders};
}
async function generate(){
  if(!D.seller.trim()) return dflash('판매자(담당자)를 넣어 주세요.',true);
  const {rows,miss,orders}=buildRows();
  if(!rows.length) return dflash('판매입력에 넣을 주문을 골라 주세요.',true);
  if(miss.length) return dflash(`품목코드가 없는 상품이 ${miss.length}줄 있습니다. 아래 빨간 칸에 품목코드를 넣어 주세요.`,true);
  const noPay=(D.rows||[]).filter(r=>D.sel[r.o.order_id]&&r.live.length&&!r.want).length;
  const newCodes=Object.entries(D.codes).filter(([k,c])=>c&&(!S.map[k]||S.map[k].code!==c));
  if(!confirm(`${D.date} 판매입력 파일을 만듭니다.\n주문 ${orders.length}건 · ${rows.length}행 · 판매자 ${D.seller}`+(newCodes.length?`\n\n직접 넣은 품목코드 ${newCodes.length}건은 품목코드 맵핑에도 저장합니다.`:'')+(noPay?`\n\n결제유형을 정할 수 없는 주문 ${noPay}건은 결제유형 칸이 비어 있습니다 — 이카운트에서 넣어 주세요.`:'')+`\n\n만든 파일은 판매입력 파일 이력에 남습니다.`)) return;
  await loadXLSX();
  const ws=XLSX.utils.aoa_to_sheet([TPL,...rows]);
  ws['!cols']=TPL.map((h,i)=>({wch:[12,5,12,12,8,14,14,22,8,18,10,14,20,8,30,14,40,8,6,8,10,10,8,10,10,24,8,8][i]||10}));
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'판매입력');
  const b64=XLSX.write(wb,{type:'base64',bookType:'xlsx'});
  const filename=`판매입력_${ymd(D.date)}_${D.seller.trim()}.xlsx`;
  // 내려받기 먼저(보관이 실패해도 파일은 손에 남게)
  const bin=atob(b64), u8=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([u8],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); a.download=filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  const msgs=[];
  try{ await getJSON(`${WORKER}/ecsales`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dates:[D.date],by:D.seller.trim(),orders:orders.length,rows:rows.length,filename,b64,ids:orders})}); msgs.push('판매입력 파일 이력에 남겼습니다');
    const at=new Date(Date.now()+9*3600e3).toISOString().slice(0,16).replace('T',' ');
    for(const id of orders){ (D.made[id] ||= []).push({by:D.seller.trim(),at,filename}); delete D.sel[id]; } }
  catch(e){ msgs.push('이력 저장 실패: '+e.message); }
  if(newCodes.length){
    try{
      const entries=newCodes.map(([key,code])=>{ const l=Object.values(D.lines).flat().find(x=>(x.variant_code||String(x.product_no))===key)||{}; return {key,code,name:'',label:`${l.product_name||''}${l.option_value?' / '+optText(l.option_value):''}`,src:'manual'}; });
      const d=await getJSON(`${WORKER}/ecmap`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entries})});
      await reloadMap(); D.codes={}; msgs.push(`품목코드 ${d.saved}건 맵핑 저장`);
    }catch(e){ msgs.push('맵핑 저장 실패: '+e.message); }
  }
  const sg={}; for(const l of Object.values(D.lines).flat()){ const k=l.variant_code||String(l.product_no), c=codeOf(l); if(!c||!(k in D.signOn)) continue; const was=!!(S.sign||{})[c]; if(D.signOn[k]!==was) sg[c]=D.signOn[k]?c+'SI':null; }
  if(Object.keys(sg).length){ try{ const d=await getJSON(`${WORKER}/ecmap`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sign:sg})}); S.sign=d.sign||S.sign; D.signOn={}; msgs.push(`사인지 설정 ${Object.keys(sg).length}건 기억`); }catch(e){ msgs.push('사인지 설정 저장 실패: '+e.message); } }
  lsSet('pbg_ecdaily_seller',D.seller.trim());
  lsSet('pbg_ecdaily_sellers',[...new Set([D.seller.trim(),...lsGet('pbg_ecdaily_sellers',[])])].slice(0,20));
  compute(); dflash(`${filename} 을(를) 받았습니다 · ${msgs.join(' · ')}`,msgs.some(m=>/실패/.test(m)));
}
function dflash(msg,bad){ D.flash={msg,bad,at:Date.now()}; render(); setTimeout(()=>{ if(D.flash&&Date.now()-D.flash.at>=7900){ D.flash=null; render(); } },8000); }

function dateRow(withFile){
  return `<div class="ec-row">
      <label>날짜 <input type="date" class="ec-in" id="ecdDate" value="${esc(D.date)}" max="${kstDay(0)}"></label>
      ${withFile?`<span class="go ec-file" style="height:36px">이카운트 판매현황 올리기<input type="file" id="ecdFile" accept=".xlsx,.xls" aria-label="이카운트 판매현황 파일"></span>
      ${D.ecFile?`<span class="ec-sub" style="margin:0">올린 파일 <b style="color:var(--ink)">${esc(D.ecFile)}</b> · ${ymd(D.date)} 주문 ${n(new Set((D.ec||[]).filter(r=>r.order.startsWith(ymd(D.date))).map(r=>r.order)).size)}건</span>`:''}`:''}
      <span style="flex:1"></span><button class="ec-dl" data-a="dreload">카페24 다시 받기</button></div>
    ${D.loading?`<div class="ec-stat">${esc(D.loading)}</div>`:''}
    ${D.err?`<div class="ec-stat err">${esc(D.err.message||D.err)}</div>`:''}
    ${D.signLearned&&withFile?`<div class="ec-stat">이카운트 파일에서 사인지가 붙는 에디션 ${n(D.signLearned)}개를 새로 배웠습니다.</div>`:''}
    ${D.truncated?'<div class="ec-stat err">카페24 주문이 너무 많아 일부만 받았습니다.</div>':''}
    ${D.flash?`<div class="ec-stat" style="position:sticky;top:8px;z-index:5;background:${D.flash.bad?'var(--down-soft)':'var(--up-soft)'};color:${D.flash.bad?'var(--down)':'var(--up)'};border-radius:8px;padding:8px 12px;font-weight:600">${esc(D.flash.msg)}</div>`:''}`;
}
const kpi=(l,v,cls)=>`<div class="ec-kpi"><div class="l">${l}</div><div class="n ${cls||''}">${v}</div></div>`;
const itemsHtml=r=>r.ls.map(l=>{ const c=codeOf(l), off=l.canceled==='Y'||l.paywin==='Y';
  return `<div style="${off?'text-decoration:line-through;color:var(--ghost)':''}">${esc(l.product_name)}${l.option_value?` <span class="ec-sub" style="display:inline">${esc(optText(l.option_value))}</span>`:''} × ${n(l.qty)}
    <span class="ec-sub" style="display:inline">${c?esc(c):'<span style="color:var(--down)">코드 없음</span>'}</span></div>`; }).join('');
function initDate(){ if(!D.date){ D.date=kstDay(-1); D.seller=lsGet('pbg_ecdaily_seller',''); } }

// 데일리 전표 생성 — 이카운트 파일 없이 카페24 주문으로 판매입력 파일을 만든다
function renderDaily(){
  initDate();
  const R=(D.rows||[]).filter(r=>r.ls.length), cnt={}; for(const r of R) cnt[r.gst]=(cnt[r.gst]||0)+1;
  const views=[['new','새 주문',cnt['새 주문']||0],['made','파일 있음',cnt['파일 있음']||0],['etc','취소·입금대기 등',(cnt['취소']||0)+(cnt['입금대기']||0)+(cnt['개인결제창']||0)],['all','전체',R.length]];
  const gv=['new','made','etc','all'].includes(D.gview)?D.gview:'new';
  const list=gv==='all'?R:gv==='new'?R.filter(r=>r.gst==='새 주문'):gv==='made'?R.filter(r=>r.gst==='파일 있음'):R.filter(r=>['취소','입금대기','개인결제창'].includes(r.gst));
  const nSel=R.filter(r=>D.sel[r.o.order_id]&&r.live.length).length;
  const rowsHtml=list.map(r=>{
    const o=r.o, id=esc(o.order_id), mf=D.made[o.order_id];
    return `<tr><td><input type="checkbox" data-a="sel" data-o="${id}" ${D.sel[o.order_id]?'checked':''} ${r.live.length?'':'disabled'} aria-label="판매입력에 넣기"></td>
      <td><b>${id}</b><div class="ec-sub">${esc(o.time||'')}</div></td>
      <td class="l" style="min-width:280px">${itemsHtml(r)}</td>
      <td>${n(r.paid)}${o.naver_point?`<div class="ec-sub">네이버포인트 ${n(o.naver_point)}</div>`:''}</td>
      <td style="${r.want?'':'color:var(--down)'}">${esc(r.want||'(정할 수 없음)')}</td>
      <td><span class="ec-badge ${r.gst==='새 주문'?'ec-ok':r.gst==='파일 있음'?'ec-info':'ec-warn'}">${esc(r.gst)}</span>${mf?`<div class="ec-sub">${mf.map(f=>`${esc(f.by||'')} ${esc(f.at.slice(5))}`).join('<br>')}</div>`:''}</td></tr>`;
  }).join('');
  S.root.innerHTML=`<div class="ec-card"><h2>데일리 전표 생성</h2>
    <p class="ec-lead">날짜를 고르면 그날 카페24 주문을 받습니다. 체크한 주문으로 이카운트 판매입력 엑셀을 만듭니다(이카운트 파일은 필요 없음).
      이미 판매입력 파일에 넣은 주문은 '파일 있음'으로 표시되고 기본으로 빠집니다. 입력이 잘 됐는지는 <a href="#" data-a="gorecon">판매 입력 대조</a>에서 확인하세요.</p>
    ${dateRow(false)}
    <div class="ec-kpis" style="grid-template-columns:repeat(4,1fr)">
      ${kpi('카페24 주문',n(R.length)+'건')}${kpi('새 주문 (파일 없음)',n(cnt['새 주문']||0)+'건',cnt['새 주문']?'warn':'ok')}${kpi('파일 있음',n(cnt['파일 있음']||0)+'건')}${kpi('고른 주문',n(nSel)+'건')}
    </div>
    <div class="ec-row"><div class="ec-seg">${views.map(([v,l,c])=>`<button data-a="gview" data-v="${v}" class="${gv===v?'on':''}">${l} ${n(c)}</button>`).join('')}</div>
      <span style="flex:1"></span><button class="ec-dl" data-a="selall">이 목록 모두 고르기</button><button class="ec-dl" data-a="selnone">모두 빼기</button></div>
    <div class="ec-scroll"><table class="ec-t" style="min-width:900px"><thead><tr><th>판매입력</th><th>주문번호</th><th>상품 · 품목코드</th><th>실결제</th><th>결제유형</th><th>상태</th></tr></thead>
      <tbody>${rowsHtml||`<tr><td colspan="6" style="color:var(--muted)">${D.loading?'':'해당하는 주문이 없습니다.'}</td></tr>`}</tbody></table></div>
    <p class="ec-note">실결제 = PG 결제금액(적립금 제외) + 네이버페이 포인트 · 결제유형은 결제업체(토스페이먼츠·토스페이·카카오페이·페이코·네이버페이)와 결제수단으로 정합니다 · 품목코드는 품목코드 맵핑 기준.</p></div>`
    +formCard();
}

// 판매 입력 대조 — 이카운트에서 받은 판매현황으로 카페24 주문을 맞춰 본다
function renderRecon(){
  initDate();
  const R=D.ec?(D.rows||[]):[], cnt={}; for(const r of R) cnt[r.st]=(cnt[r.st]||0)+1;
  const bad=R.filter(r=>BAD_ST.includes(r.st)&&!ed(r.o.order_id).done).length;
  const views=[['bad','확인할 것',bad],['all','전체',R.length],['미입력','미입력',cnt['미입력']||0],['정상','정상',cnt['정상']||0],['etc','취소·입금대기 등',(cnt['취소']||0)+(cnt['입금대기']||0)+(cnt['개인결제창']||0)]];
  let list=R;
  if(D.view==='bad') list=R.filter(r=>BAD_ST.includes(r.st));
  else if(D.view==='etc') list=R.filter(r=>['취소','입금대기','개인결제창'].includes(r.st));
  else if(D.view!=='all') list=R.filter(r=>r.st===D.view);
  const rowsHtml=list.map(r=>{
    const o=r.o, E=ed(o.order_id), id=esc(o.order_id);
    const items=itemsHtml(r)||(r.e||[]).map(x=>`<div>${esc(x.name)} × ${n(x.qty)} <span class="ec-sub" style="display:inline">${esc(x.code)}</span></div>`).join('');
    const ecItems=r.e&&r.ls.length?`<div class="ec-sub">이카운트: ${r.e.map(x=>`${esc(x.code)}×${n(x.qty)}`).join(', ')}</div>`:'';
    const diff=r.paid!=null&&r.ecTot!=null?r.paid-r.ecTot:null;
    const payBad=r.issues.includes('결제유형 확인'), mf=D.made[o.order_id];
    return `<tr style="${E.done?'opacity:.55':''}">
      <td><b>${id}</b><div class="ec-sub">${esc(o.time||'')}</div></td>
      <td class="l" style="min-width:260px">${items}${ecItems}${r.item&&r.item!=='일치'?`<div class="ec-sub">${esc(r.item)}</div>`:''}</td>
      <td>${r.paid!=null?n(r.paid):'—'}${o.naver_point?`<div class="ec-sub">네이버포인트 ${n(o.naver_point)}</div>`:''}</td>
      <td>${r.ecTot!=null?n(r.ecTot):'—'}</td>
      <td style="${diff?'color:var(--down);font-weight:700':''}">${diff==null?'—':n(diff)}</td>
      <td style="${payBad?'color:var(--down)':''}">${esc(r.want||'(정할 수 없음)')}${r.ecPay?`<div class="ec-sub">이카운트 ${esc(r.ecPay)}</div>`:''}</td>
      <td><span class="ec-badge ${stCls(r.st)}">${esc(r.st)}</span>${r.issues.length>1?`<div class="ec-sub">${esc(r.issues.slice(1).join(' · '))}</div>`:''}${r.st==='미입력'&&mf?`<div class="ec-sub">판매입력 파일은 있음(${esc(mf[0].by||'')})</div>`:''}</td>
      <td><input class="ec-in" data-a="memo" data-o="${id}" value="${esc(E.memo||'')}" placeholder="메모" style="width:130px"></td>
      <td><input type="checkbox" data-a="done" data-o="${id}" ${E.done?'checked':''} aria-label="처리완료"></td></tr>`;
  }).join('');
  const miss=R.filter(r=>r.st==='미입력').length;
  S.root.innerHTML=`<div class="ec-card"><h2>판매 입력 대조</h2>
    <p class="ec-lead">이카운트에서 받은 판매현황(품목별) 엑셀을 올리면, 고른 날짜의 카페24 주문과 주문번호로 맞춰 금액 · 결제유형 · 품목·수량이 맞는지 봅니다.
      여러 날짜가 든 파일이면 날짜만 바꿔 가며 보면 됩니다. 이카운트 파일은 브라우저에서만 읽습니다.</p>
    ${dateRow(true)}
    ${D.ec?`<div class="ec-kpis" style="grid-template-columns:repeat(6,1fr)">
      ${kpi('카페24 주문',n(D.orders.length)+'건')}${kpi('정상',n(cnt['정상']||0)+'건','ok')}${kpi('미입력',n(miss)+'건',miss?'warn':'')}
      ${kpi('금액불일치',n(cnt['금액불일치']||0)+'건',cnt['금액불일치']?'warn':'')}${kpi('결제유형 확인',n(cnt['결제유형 확인']||0)+'건',cnt['결제유형 확인']?'warn':'')}${kpi('품목·수량 불일치',n(cnt['품목·수량 불일치']||0)+'건',cnt['품목·수량 불일치']?'warn':'')}
    </div>
    <div class="ec-row"><div class="ec-seg">${views.map(([v,l,c])=>`<button data-a="dview" data-v="${esc(v)}" class="${D.view===v?'on':''}">${l} ${n(c)}</button>`).join('')}</div>
      <span style="flex:1"></span>${miss?`<button class="go" data-a="togen" style="height:36px">미입력 ${n(miss)}건 판매입력 파일 만들기 →</button>`:''}</div>
    <div class="ec-scroll"><table class="ec-t" style="min-width:1050px"><thead><tr><th>주문번호</th><th>상품 · 품목코드</th><th>카페24 실결제</th><th>이카운트 합계</th><th>차액</th><th>결제유형</th><th>상태</th><th>메모</th><th>처리완료</th></tr></thead>
      <tbody>${rowsHtml||`<tr><td colspan="9" style="color:var(--muted)">해당하는 주문이 없습니다.</td></tr>`}</tbody></table></div>`
    :`<div class="ec-stat">이카운트 → 판매현황(품목별)에서 해당 날짜가 든 엑셀을 받아 올려 주세요.</div>`}
    <p class="ec-note">카페24 실결제 = PG 결제금액(적립금 제외) + 네이버페이 포인트 ↔ 이카운트 합계(선수금 포함) · 결제유형은 결제업체와 결제수단으로 정한 값과 비교 ·
      품목·수량은 품목코드 맵핑 기준(선수금 주문은 건너뜀, 사인지 줄은 빼고 비교) · 메모·처리완료는 이 컴퓨터에 날짜별로 남습니다.</p></div>`;
}
function formCard(){
  const sel=(D.rows||[]).filter(r=>D.sel[r.o.order_id]&&r.live.length);
  const sellers=[...new Set([D.seller,...lsGet('pbg_ecdaily_sellers',[])].filter(Boolean))];
  const body=sel.map(r=>{
    const o=r.o, E=ed(o.order_id), id=esc(o.order_id), nm=D.names[o.order_id]??(o.rc_name||o.buyer||'');
    const lines=r.live.map(l=>{ const key=l.variant_code||String(l.product_no), c=codeOf(l);
      return `<div style="display:flex;gap:8px;align-items:center;margin:2px 0"><span style="flex:1">${esc(l.product_name)}${l.option_value?` <span class="ec-sub" style="display:inline">${esc(optText(l.option_value))}</span>`:''} × ${n(l.qty)}</span>
        <input class="ec-in" data-a="dcode" data-k="${esc(key)}" value="${esc(c)}" placeholder="품목코드" style="width:140px;${c?'':'box-shadow:inset 0 0 0 2px var(--down)'}">
        <label style="font-size:12px;white-space:nowrap;display:flex;gap:4px;align-items:center;${signOn(l)?'color:var(--accent);font-weight:700':'color:var(--muted)'}"><input type="checkbox" data-a="sign" data-k="${esc(key)}" ${signOn(l)?'checked':''}>사인지${signOn(l)&&c?` <span class="ec-sub" style="display:inline;margin:0">${esc((S.sign||{})[c]||c+'SI')}</span>`:''}</label></div>`; }).join('');
    return `<tr><td><b>${id}</b><div class="ec-sub">${n(paidOf(o))}원 · ${esc(r.want||'결제유형 확인')}</div></td>
      <td><input class="ec-in" data-a="pre" data-o="${id}" list="ecdPre" value="${esc(E.pre||'')}" placeholder="퀵)·택배)·설치)" style="width:96px"></td>
      <td><input class="ec-in" data-a="name" data-o="${id}" value="${esc(nm)}" style="width:110px"></td>
      <td><select class="ec-in" data-a="wh" data-o="${id}">${WH.map(w=>`<option ${(E.wh||D.wh)===w?'selected':''}>${esc(w)}</option>`).join('')}</select></td>
      <td class="l" style="min-width:380px">${lines}</td></tr>`;
  }).join('');
  const miss=sel.reduce((t,r)=>t+r.live.filter(l=>!codeOf(l)).length,0);
  return `<div class="ec-card"><h2>판매입력 양식 만들기</h2>
    <p class="ec-lead">위 표에서 체크한 주문을 이카운트 판매입력 템플릿(28열)으로 만듭니다. 판매처는 온라인 직영몰, 거래유형은 온라인 (직영몰), 결제일 칸에는 주문번호가 들어갑니다.
      줄 금액은 상품별 할인 후 금액이고 배송비 등 남는 차액은 비율로 나눠 더해 주문 합계가 실결제금액과 같게 맞춥니다. 단가·공급가액은 ÷1.1 합니다(면세 상품 제외).</p>
    <div class="ec-row">
      <label>판매자 <input class="ec-in" id="ecdSeller" list="ecdSellers" value="${esc(D.seller)}" placeholder="담당자 이름" style="width:130px"></label>
      <label>출고처 전체 <select class="ec-in" id="ecdWh">${WH.map(w=>`<option ${D.wh===w?'selected':''}>${esc(w)}</option>`).join('')}</select></label>
      <span class="ec-sub" style="margin:0">주문 <b style="color:var(--ink)">${n(sel.length)}</b>건${miss?` · <b style="color:var(--down)">품목코드 없음 ${n(miss)}줄</b>`:''}</span>
      <span style="flex:1"></span><button class="go" data-a="dgen" style="height:36px" ${sel.length?'':'disabled'}>판매입력 엑셀 만들기</button></div>
    <datalist id="ecdPre">${PRE.map(p=>`<option value="${esc(p)}">`).join('')}</datalist>
    <datalist id="ecdSellers">${sellers.map(p=>`<option value="${esc(p)}">`).join('')}</datalist>
    ${sel.length?`<div class="ec-scroll"><table class="ec-t" style="min-width:900px"><thead><tr><th>주문</th><th>고객명 앞말</th><th>고객명</th><th>출고처</th><th>상품 · 품목코드</th></tr></thead><tbody>${body}</tbody></table></div>`
      :'<div class="ec-stat">위 표의 \'판매입력\' 칸을 체크하면 여기에 나옵니다. 아직 파일에 안 넣은 주문은 처음부터 체크돼 있습니다.</div>'}
    <p class="ec-note">고객명 앞말은 퀵·택배·설치 등 배송 방법이 다를 때만 넣습니다(예: 퀵) 홍길동). 출고처는 위에서 한 번에 고르고, 주문마다 바꿀 수 있습니다.
      직접 넣은 품목코드는 파일을 만들 때 품목코드 맵핑에도 저장됩니다.
      <b>사인지</b>: 에디션에 사인지가 같이 나가면 체크하세요 — 바로 아래 줄에 사인지 품목(에디션코드+SI · 같은 수량 · 0원)이 들어가고, 그 품목은 다음부터 자동으로 체크됩니다.
      이카운트 판매현황에 사인지가 같이 입력된 주문이 있으면 그것도 배워 둡니다(카페24 주문에는 사인지 표시가 없음). 만든 파일은 판매입력 파일 이력에서 다시 받을 수 있습니다.</p></div>`;
}
function onDailyInput(t){
  const a=t.dataset.a, o=t.dataset.o;
  if(a==='memo'){ ed(o).memo=t.value; saveEd(); return true; }
  if(a==='pre'){ ed(o).pre=t.value; saveEd(); return true; }
  if(a==='name'){ D.names[o]=t.value; return true; }
  if(a==='dcode'){ D.codes[t.dataset.k]=t.value.trim(); t.style.boxShadow=t.value.trim()?'':'inset 0 0 0 2px var(--down)'; return true; }
  if(t.id==='ecdSeller'){ D.seller=t.value; return true; }
  return false;
}
function onDailyChange(t){
  const a=t.dataset.a, o=t.dataset.o;
  if(t.id==='ecdDate'){ if(t.value){ D.date=t.value; loadDailyC24(); } return true; }
  if(t.id==='ecdFile'){ const f=t.files[0]; t.value=''; if(f) onDailyFile(f).then(()=>{ D.view='bad'; render(); }); return true; }
  if(t.id==='ecdWh'){ D.wh=t.value; for(const k of Object.keys(D.ed)) delete D.ed[k].wh; saveEd(); render(); return true; }
  if(t.id==='ecdSeller'){ D.seller=t.value; return true; }
  if(a==='sel'){ D.sel[o]=t.checked; render(); return true; }
  if(a==='done'){ ed(o).done=t.checked; saveEd(); render(); return true; }
  if(a==='wh'){ ed(o).wh=t.value; saveEd(); return true; }
  if(a==='sign'){ D.signOn[t.dataset.k]=t.checked; render(); return true; }
  if(a==='dcode'){ compute(); render(); return true; }
  return false;
}

function render(){
  if(!S.root) return;
  if(S.page==='daily') return renderDaily();
  if(S.page==='recon') return renderRecon();
  if(S.page==='log') return renderLog();
  const saved=Object.values(S.map), man=saved.filter(v=>v.src==='manual').length;
  let h=`<div class="ec-card"><h2>품목코드 맵핑</h2>
    <p class="ec-lead">카페24 상품·옵션을 이카운트 품목코드에 잇는 표입니다. 이미 입력된 이카운트 판매현황(품목별)을 올리면 같은 주문번호의 카페24 주문과 맞춰 자동으로 채우고,
      못 찾은 것만 담당자가 넣습니다. 담당자가 넣은 값은 자동 학습이 덮어쓰지 않습니다.</p>
    <div class="ec-row">
      <span class="go ec-file" style="height:36px">이카운트 판매현황 올리기 (여러 개 가능)<input type="file" id="ecFiles" accept=".xlsx,.xls" multiple aria-label="이카운트 판매현황 파일"></span>
      <span class="ec-sub" style="margin:0">저장된 대응 <b style="color:var(--ink)">${n(saved.length)}</b>건 (자동 ${n(saved.length-man)} · 담당자 ${n(man)})</span>
    </div>
    ${S.files.length?`<div class="ec-stat">올린 파일: ${S.files.map(f=>`<b>${esc(f.name)}</b> (${n(f.rows)}행)`).join(', ')} · 카페24 ${S.months.join(', ')} 주문</div>`:''}
    ${S.loading?`<div class="ec-stat">${esc(S.loading)}</div>`:''}
    ${S.flash?`<div class="ec-stat" style="position:sticky;top:8px;z-index:5;background:${S.flash.bad?'var(--down-soft)':'var(--up-soft)'};color:${S.flash.bad?'var(--down)':'var(--up)'};border-radius:8px;padding:8px 12px;font-weight:600">${esc(S.flash.msg)}</div>`:''}
    ${S.err?`<div class="ec-stat err">${esc(S.err.message||S.err)}</div>`:''}
    ${S.truncated&&S.truncated.length?`<div class="ec-stat err">${S.truncated.join(', ')} 카페24 주문이 너무 많아 일부만 받았습니다.</div>`:''}
  </div>`;
  if(S.result) h+=resultCard();
  S.root.innerHTML=h;
}
function resultCard(){
  const R=S.result, cnt={}; for(const r of R.rows) cnt[r.st]=(cnt[r.st]||0)+1;
  const un=R.unmatched.filter(u=>u.st==='미연결');
  const views=[['new','새로 연결',(cnt['새로 연결']||0)+(cnt['저장됨과 다름']||0)],['check','확인 필요',(cnt['확인 필요']||0)+(cnt['담당자 값과 다름']||0)],['un','미연결',un.length],['same','저장됨·확정',(cnt['저장됨과 같음']||0)+(cnt['담당자 확정']||0)],['saved','저장된 전체',Object.keys(S.map).length]];
  const q=S.q.trim().toLowerCase(), hit=x=>!q||[x.name,x.opt,x.key,x.code,x.ecname,x.label].join(' ').toLowerCase().includes(q);
  let list, body='';
  if(S.view==='new') list=R.rows.filter(r=>r.st==='새로 연결'||r.st==='저장됨과 다름');
  else if(S.view==='check') list=R.rows.filter(r=>r.st==='확인 필요'||r.st==='담당자 값과 다름');
  else if(S.view==='same') list=R.rows.filter(r=>r.st==='저장됨과 같음'||r.st==='담당자 확정');
  else if(S.view==='un') list=un;
  else list=Object.entries(S.map).map(([key,v])=>({key,...v,saved:v}));
  list=list.filter(hit);
  const codes=Object.keys(R.ecName).sort();
  const picker=(x,cands)=>`<input class="ec-in" list="ecCodes" data-a="code" data-k="${esc(x.key)}" data-label="${esc(`${x.name||x.label||''}${x.opt?' / '+x.opt:''}`)}" placeholder="품목코드 입력·선택" style="width:170px">
     <button class="ec-dl" data-a="savecode" data-k="${esc(x.key)}">저장</button>
     ${cands&&cands.length?`<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">${cands.slice(0,5).map(c=>{const same=c.price>0&&c.price===x.price;
       return `<a href="#" data-a="pick" data-k="${esc(x.key)}" data-c="${esc(c.code)}" style="display:flex;gap:8px;align-items:center;text-decoration:none;color:var(--ink);background:${same?'var(--up-soft)':'var(--fill)'};border-radius:8px;padding:4px 8px;font-size:12px">
         <b>${esc(c.code)}</b><span style="flex:1">${esc(ecProd(c.name))}</span><span style="white-space:nowrap">정가 ${c.price?n(c.price)+'원':'—'}</span>
         ${same?'<span class="ec-badge ec-ok">✓ 금액 일치</span>':''}<span class="ec-sub" style="margin:0">${c.n}주문</span></a>`;}).join('')}</div>`:''}`;
  if(S.view==='saved'){
    body=`<thead><tr><th>카페24 상품 · 옵션</th><th>옵션코드</th><th>이카운트 품목코드</th><th>이카운트 품명</th><th>출처</th><th>근거</th><th>저장일</th></tr></thead><tbody>
      ${list.slice(0,500).map(x=>`<tr><td class="l">${esc(x.label)}</td><td>${esc(x.key)}</td><td><b>${esc(x.code)}</b></td><td class="l">${esc(x.name)}</td>
        <td><span class="ec-badge ${x.src==='manual'?'ec-ok':'ec-info'}">${x.src==='manual'?'담당자':'자동'}</span></td><td>${x.n?n(x.n)+'건':''}</td><td>${esc(x.at||'')}</td></tr>`).join('')}</tbody>`;
  }else if(S.view==='un'){
    body=`<thead><tr><th>카페24 상품 · 옵션</th><th>옵션코드</th><th>카페24 판매가</th><th>나온 주문</th><th>이카운트 품목코드 넣기 (후보를 누르면 채워짐)</th></tr></thead><tbody>
      ${list.map(x=>`<tr><td class="l">${esc(x.name)}${x.opt?`<div class="ec-sub">${esc(x.opt)}</div>`:''}</td><td>${esc(x.key)}</td><td><b>${x.price?n(x.price)+'원':'—'}</b></td><td>${n(x.orders)}</td><td class="l" style="min-width:420px">${picker(x,x.cands)}</td></tr>`).join('')}</tbody>`;
  }else{
    body=`<thead><tr><th>카페24 상품 · 옵션</th><th>옵션코드</th><th>이카운트 품목코드</th><th>이카운트 품명</th><th>카페24 판매가</th><th>이카운트 정가</th><th>근거</th><th>상태</th>${S.view==='check'?'<th>담당자 확인</th>':''}</tr></thead><tbody>
      ${list.map(x=>`<tr><td class="l">${esc(x.name)}${x.opt?`<div class="ec-sub">${esc(x.opt)}</div>`:''}</td><td>${esc(x.key)}</td>
        <td><b>${esc(x.code)}</b>${x.cands.length>1?`<div class="ec-sub">${x.cands.map(c=>`${esc(c.code)} ${c.n}건`).join(' / ')}</div>`:''}${x.saved&&x.saved.code!==x.code?`<div class="ec-sub">저장된 값 ${esc(x.saved.code)}(${x.saved.src==='manual'?'담당자':'자동'})</div>`:''}</td>
        <td class="l">${esc(ecProd(x.ecname))}</td>
        <td>${x.price?n(x.price)+'원':'—'}</td><td>${x.ecprice?n(x.ecprice)+'원':'—'}${x.price&&x.ecprice?(x.price===x.ecprice?' <span class="ec-badge ec-ok">✓</span>':' <span class="ec-badge ec-warn">다름</span>'):''}</td>
        <td>${n(x.n)}건<div class="ec-sub">${esc(x.how)}</div></td>
        <td><span class="ec-badge ${x.st==='새로 연결'||x.st==='저장됨과 같음'?'ec-ok':x.st==='확인 필요'||x.st==='담당자 값과 다름'?'ec-bad':'ec-warn'}">${esc(x.st)}</span></td>
        ${S.view==='check'?`<td class="l" style="min-width:420px">${picker(x,x.cands)}</td>`:''}</tr>`).join('')}</tbody>`;
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
    <p class="ec-note">카페24 판매가 = 그 옵션의 판매 단가(할인 전) · 이카운트 정가 = 판매현황의 정가 · 후보는 금액이 같은 것이 먼저 나옵니다(✓ 금액 일치) · 근거 = 그 짝이 확인된 주문 수 · 1:1 = 한 주문에 남은 카페24 옵션 1개와 이카운트 품목 1개 · 이름 = 같은 주문 안에서 상품명이 가장 비슷한 짝 ·
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
    try{ await learnSign(S.ecRows); }catch(e){}
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
    if((S.page==='daily'||S.page==='recon')&&onDailyChange(t)) return;
    if(t.id==='ecLogMonth'){ S.logMonth=t.value||S.logMonth; (async()=>{ await loadLog(); render(); })(); return; }
  });
  root.addEventListener('input',e=>{ if((S.page==='daily'||S.page==='recon')&&onDailyInput(e.target)) return; if(e.target.id==='ecQ'){ S.q=e.target.value; const pos=e.target.selectionStart; render(); const q=$('ecQ'); if(q){ q.focus(); q.setSelectionRange(pos,pos); } } });
  root.addEventListener('click',async e=>{
    const t=e.target.closest('[data-a]'); if(!t) return;
    const a=t.dataset.a;
    if(a==='view'){ S.view=t.dataset.v; render(); return; }
    if(a==='logreload'){ await loadLog(); render(); return; }
    if(a==='godaily'){ setMenu('ecdaily'); return; }
    if(a==='dview'){ D.view=t.dataset.v; render(); return; }
    if(a==='gview'){ D.gview=t.dataset.v; render(); return; }
    if(a==='gorecon'){ e.preventDefault(); setMenu('ecrecon'); return; }
    if(a==='selall'||a==='selnone'){ const v=D.gview||'new'; for(const r of (D.rows||[])){ if(!r.live.length) continue; const inView=v==='all'||(v==='new'&&r.gst==='새 주문')||(v==='made'&&r.gst==='파일 있음'); if(a==='selnone') delete D.sel[r.o.order_id]; else if(inView) D.sel[r.o.order_id]=true; } render(); return; }
    if(a==='togen'){ D.sel={}; for(const r of (D.rows||[])) if(r.st==='미입력'&&r.live.length) D.sel[r.o.order_id]=true; D.selInit=true; D.gview='all'; setMenu('ecdaily'); return; }
    if(a==='dreload'){ await loadDailyC24(); return; }
    if(a==='dgen'){ t.disabled=true; try{ await generate(); }catch(err){ dflash('만들지 못했습니다: '+err.message,true); } t.disabled=false; return; }
    if(a==='logdl'){ t.disabled=true; const txt=t.textContent; t.textContent='받는 중…'; try{ await downloadFile(t.dataset.id); }catch(err){ alert('받지 못했습니다: '+err.message); } t.disabled=false; t.textContent=txt; return; }
    if(a==='pick'){
      e.preventDefault();
      const inp=root.querySelector(`input[data-a="code"][data-k="${CSS.escape(t.dataset.k)}"]`);
      if(!inp) return;
      // 후보는 고르기만 한다(입력칸 채우고 선택 표시). 저장은 '저장' 버튼에서 확인 후.
      inp.value=t.dataset.c;
      t.parentElement.querySelectorAll('a[data-a="pick"]').forEach(x=>{ x.style.outline=x===t?'2px solid var(--accent)':''; });
      return;
    }
    if(a==='saveauto'){ t.disabled=true; try{ await saveAuto(); }catch(err){ flash('저장하지 못했습니다: '+err.message,true); } t.disabled=false; return; }
    if(a==='savecode'){
      const inp=root.querySelector(`input[data-a="code"][data-k="${CSS.escape(t.dataset.k)}"]`), code=(inp&&inp.value||'').trim();
      if(!code) return flash('품목코드를 넣거나 후보를 눌러 주세요.',true);
      const nm=(S.result&&S.result.ecName[code])||'';
      if(!confirm(`${inp.dataset.label}\n→ ${code}${nm?' ('+nm+')':''}\n\n이 코드로 저장할까요?`)) return;
      t.disabled=true;
      try{ await saveManual(t.dataset.k,code,inp.dataset.label,nm); }catch(err){ flash('저장하지 못했습니다: '+err.message,true); }
      t.disabled=false; return;
    }
  });
}

let WIRED=false;
window.loadEcountTab=async function(el,page){
  if(!$('ecCss')){ const s=document.createElement('style'); s.id='ecCss'; s.textContent=STYLE; document.head.appendChild(s); }
  S.root=el; S.page=page||'map';
  if(!WIRED){ wire(el); WIRED=true; }
  if(S.page==='log'){
    el.innerHTML='<div class="state"><div class="spinner"></div>판매입력 파일 이력 불러오는 중…</div>';
    await loadLog();   // 열 때마다 새로 받는다(다른 사람이 만든 파일도 보이게)
  }else if(!S.loadedMap){
    el.innerHTML='<div class="state"><div class="spinner"></div>품목코드 맵핑 불러오는 중…</div>';
    try{ await reloadMap(); S.loadedMap=true; }catch(e){ S.err=e; }
  }
  if((S.page==='daily'||S.page==='recon')&&!D.loadedDate){ render(); D.loadedDate=true; await loadDailyC24(); return; }
  render();
};
window.__ecount={S,D,learn,parseEcount,payType,buildRows,compute};
})();
