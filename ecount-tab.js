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
.ec-card h2{font-size:19px;font-weight:700;margin:0;letter-spacing:-.02em;}
.ec-lead{font-size:14px;color:var(--muted);margin:var(--s1) 0 var(--s4);line-height:1.6;}
.ec-row{display:flex;gap:var(--s3);align-items:center;flex-wrap:wrap;}
.ec-row label{font-size:13px;color:var(--muted);font-weight:600;display:flex;gap:6px;align-items:center;}
.ec-in{font-family:var(--sans);font-size:14px;border:0;border-radius:8px;background:var(--fill);color:var(--ink);height:34px;padding:0 var(--s2);}
.ec-file{position:relative;overflow:hidden;}
.ec-file input{position:absolute;inset:0;opacity:0;cursor:pointer;}
.ec-stat{font-size:14px;color:var(--ink-2);margin-top:var(--s3);line-height:1.6;}
.ec-stat.err{color:var(--down);}
.ec-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:var(--s3);margin:var(--s4) 0;}
@media (max-width:860px){.ec-kpis{grid-template-columns:repeat(2,1fr);}}
.ec-kpi{background:var(--fill);border-radius:var(--r-ctrl);padding:var(--s3) var(--s4);}
.ec-kpi .l{font-size:13px;color:var(--muted);font-weight:600;}
.ec-kpi .n{font-size:22px;font-weight:700;margin-top:2px;}
.ec-kpi .n.warn{color:var(--down);} .ec-kpi .n.ok{color:var(--up);}
.ec-seg{display:inline-flex;background:var(--fill);border-radius:var(--r-ctrl);padding:3px;gap:2px;flex-wrap:wrap;}
.ec-seg button{border:0;background:none;border-radius:9px;height:32px;padding:0 12px;font:600 13px var(--sans);color:var(--ink-2);cursor:pointer;}
.ec-seg button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.06);}
.ec-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:var(--s3);}
table.ec-t{width:100%;border-collapse:collapse;font-size:14px;min-width:900px;}
.ec-t th{font-weight:600;color:var(--muted);font-size:13px;padding:var(--s3) var(--s2);border-bottom:1px solid var(--hair);text-align:center;white-space:nowrap;}
.ec-t td{padding:var(--s3) var(--s2);border-bottom:1px solid var(--hair);text-align:center;vertical-align:middle;}
.ec-t td.l{text-align:left;}
.ec-sub{font-size:12px;color:var(--muted);margin-top:2px;}
.ec-badge{display:inline-block;font-size:12px;font-weight:700;border-radius:6px;padding:2px 7px;white-space:nowrap;}
.ec-ok{background:var(--up-soft);color:var(--up);} .ec-bad{background:var(--down-soft);color:var(--down);}
.ec-warn{background:#FFF3E0;color:#C25E00;} .ec-info{background:var(--fill);color:var(--ink-2);}
.ec-dl{background:var(--fill);border:0;border-radius:8px;height:32px;padding:0 12px;font:600 13px var(--sans);color:var(--ink-2);cursor:pointer;}
.ec-note{font-size:13px;color:var(--muted);line-height:1.6;margin:var(--s3) 0 0;}
details.ec-note>summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--muted);}
details.ec-note>summary::-webkit-details-marker{display:none;}
details.ec-note>summary::before{content:'ⓘ';font-size:14px;}
details.ec-note[open]>summary{margin-bottom:6px;}
details.ec-note>div{font-size:13px;line-height:1.7;color:var(--muted);background:var(--fill);border-radius:8px;padding:10px 12px;}
`;
const nf=new Intl.NumberFormat('ko-KR');
const n=v=>nf.format(Math.round(v||0));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
const ORD=/^\d{8}-\d{7}$/;

const S={logView:'oo', root:null, page:'map', log:null, logErr:null, logMonth:'', map:{}, files:[], ecRows:[], c24:{}, c24miss:new Set(), months:[], loading:'', err:null, result:null, view:'new', q:'', qs:'', qc:'', cand:{}, dict:{}, vars:{}, varsBusy:false};

async function getJSON(url,opt){
  const r=await fetch(url,{cache:'no-store',...opt,headers:{...authHeaders(),...((opt&&opt.headers)||{})}});
  const d=await r.json().catch(()=>({error:'HTTP '+r.status}));
  if(d.error) throw new Error(d.error);
  return d;
}
function loadXLSX(){ return window.XLSX?Promise.resolve():new Promise((ok,ng)=>{const sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';sc.onload=ok;sc.onerror=()=>ng(new Error('엑셀 라이브러리를 불러오지 못했습니다'));document.head.appendChild(sc);}); }

// ---------- 이카운트 판매현황(품목별) ----------
// 머리글(일자·품목코드·품명 및 규격·수량)을 찾고, 주문번호 열은 값 모양(20260801-0000047)으로 찾는다(머리글이 결제일·주문일 등으로 다르다).
// 전표 날짜 → 'YYYYMMDD'. 이카운트 내려받기 형식이 여러 가지다:
//   판매현황 일자 '08/01-18'(연도 없음) · 판매조회 '20261014-28' · '26/10/14-28'(연도 2자리, 판매조회 (5)) · '2026/10/14' · 엑셀 날짜 숫자
//   연도가 없으면 주문번호 연도를 쓰고, 주문일보다 앞 날짜면 다음 해(12월 주문 → 1월 전표).
//   예전엔 연도 없이 'MMDD' 로 비교해서 '26/10/14' 를 26월 10일로 읽고(H6), 12월↔1월에 기간 판단이 깨졌다(H4).
function vdayOf(v,ord){
  if(v==null||v==='') return '';
  const p2=x=>String(x).padStart(2,'0');
  if(typeof v==='number'&&v>30000&&v<80000){ const d=new Date(Math.round((v-25569)*86400e3)); return d.getUTCFullYear()+p2(d.getUTCMonth()+1)+p2(d.getUTCDate()); }
  const t=String(v).trim(); let m;
  if((m=t.match(/^(\d{4})[\/.-]?(\d{2})[\/.-]?(\d{2})/))) return m[1]+m[2]+m[3];
  if((m=t.match(/^(\d{2})\/(\d{2})\/(\d{2})(?!\d)/))) return '20'+m[1]+m[2]+m[3];
  if((m=t.match(/^(\d{1,2})\/(\d{1,2})/))){
    const md=p2(m[1])+p2(m[2]), o=String(ord||'');
    let y=/^\d{8}/.test(o)?Number(o.slice(0,4)):Number(kstDay(0).slice(0,4));
    if(/^\d{8}/.test(o)&&md<o.slice(4,8)) y++;
    return y+md;
  }
  return '';
}
const vdLabel=d=>d?`${d.slice(4,6)}/${d.slice(6,8)}`:'';
const ymdAdd=(d,n)=>{ const t=new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T00:00:00Z`); t.setUTCDate(t.getUTCDate()+n); return t.toISOString().slice(0,10).replace(/-/g,''); };
// 판매조회(전표 단위) 형식: 판매번호 · 결제일(=주문번호) · 품 목(요약 'OO 외 n건') · 금 액 · 고객명 · 결제유형 · 수량 …  품목코드가 없다.
// 선수금 줄: 품목코드 222222(이카운트 선수금 품목 — Su, 2026-10-19) 또는 품명에 '선수금'
const ADV_CODES=new Set(['222222']);
const isAdvRow=r=>ADV_CODES.has(String(r.code||'').trim())||/선수금/.test(String(r.code||'')+String(r.name||''));
function parseVoucher(rows,h,fname){
  const head=rows[h].map(c=>String(c??'').replace(/\s/g,'')), col=k=>head.indexOf(k);
  const cNo=col('판매번호'), cOrd=col('결제일'), cItem=col('품목'), cAmt=col('금액'), cPay=col('결제유형'), cQty=col('수량'), cCust=head.findIndex(x=>/고객명/.test(x)), cRes=col('배송결과'), cDday=col('배송일자');
  if(cOrd<0||cAmt<0) throw new Error(`${fname}: 판매조회 형식인데 결제일(주문번호)·금액 열을 찾지 못했습니다.`);
  return rows.slice(h+1).map(r=>({order:String(r[cOrd]??'').trim(),code:'',name:String(r[cItem]??'').trim(),qty:Number(r[cQty])||0,price:0,
      total:Math.round(Number(r[cAmt])||0),vday:vdayOf(r[cNo],r[cOrd]),pay:cPay<0?'':String(r[cPay]??'').trim(),cust:cCust<0?'':String(r[cCust]??'').trim(),voucher:true,
      dres:cRes<0?'':String(r[cRes]??'').trim(),dday:cDday<0?'':String(r[cDday]??'').trim()}))
    .map(r=>({...r,adv:isAdvRow(r)})).filter(r=>ORD.test(r.order));
}
function parseEcount(wb,fname,keepAdv){
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:null,blankrows:false});
  for(let i=0;i<Math.min(rows.length,15);i++){ const r=(rows[i]||[]).map(c=>String(c??'').replace(/\s/g,'')); if(r.includes('판매번호')&&r.includes('품목')&&r.includes('금액')){
    if(!keepAdv) throw new Error(`${fname}: 판매조회(전표 단위) 파일이라 품목코드가 없습니다. 품목코드 맵핑에는 판매현황(품목별) 엑셀을 올려 주세요.`);
    return parseVoucher(rows,i,fname); } }
  let h=-1;
  for(let i=0;i<Math.min(rows.length,15);i++){ const r=(rows[i]||[]).map(c=>String(c??'').trim()); if(r.includes('품목코드')&&r.includes('수량')&&(r.includes('품명 및 규격')||r.includes('품목명'))){ h=i; break; } }
  if(h<0) throw new Error(`${fname}: 머리글(품목코드·품명 및 규격·수량)을 찾지 못했습니다. 이카운트 판매현황(품목별) 엑셀이 맞는지 확인해 주세요.`);
  const head=rows[h].map(c=>String(c??'').trim()), col=k=>head.indexOf(k);
  const cCode=col('품목코드'), cName=col('품명 및 규격')>=0?col('품명 및 규격'):col('품목명'), cQty=col('수량'), cPrice=col('정가');
  const cTot=head.findIndex(h=>h.replace(/\s/g,'')==='합계'), cPay=col('결제유형'), cCust=head.findIndex(h=>/고객명/.test(h));
  const cDay=head.findIndex(h=>h==='일자'||/^판매일/.test(h)), cRes=col('배송결과'), cDday=col('배송일자');   // '08/01-18' 또는 '20260801-18' — 전표 날짜(MM/DD)
  const body=rows.slice(h+1).filter(r=>r[cCode]);
  let cOrd=-1,best=0;
  for(let i=0;i<head.length;i++){ const k=body.reduce((t,r)=>t+(ORD.test(String(r[i]??'').trim())?1:0),0); if(k>best){best=k;cOrd=i;} }
  if(best<body.length*0.3) throw new Error(`${fname}: 주문번호(예: 20260801-0000047) 열을 찾지 못했습니다.`);
  return body.map(r=>({order:String(r[cOrd]??'').trim(),code:String(r[cCode]).trim(),name:String(r[cName]??'').trim(),qty:Number(r[cQty])||0,price:cPrice<0?0:Math.round(Number(r[cPrice])||0),
      total:cTot<0?0:Math.round(Number(r[cTot])||0),vday:vdayOf(cDay<0?'':r[cDay],r[cOrd]),dres:cRes<0?'':String(r[cRes]??'').trim(),dday:cDday<0?'':String(r[cDday]??'').trim(),pay:cPay<0?'':String(r[cPay]??'').trim(),cust:cCust<0?'':String(r[cCust]??'').trim()}))
    .map(r=>({...r,adv:isAdvRow(r)}))
    .filter(r=>ORD.test(r.order)&&(keepAdv||!r.adv));   // 선수금 품목은 실제 상품이 아니다(데일리 금액 대조에는 합계로 넣는다)
}

// ---------- 카페24 주문 (파일에 있는 주문번호만) ----------
// 예전엔 파일이 걸친 달 전체(최대 6개월 × 4,000건)를 받아 느리고 잘렸다(리포트 M7). 지금은 주문번호 목록으로 300개씩 받는다.
async function loadC24Orders(ids,onStep){
  const todo=ids.filter(o=>!S.c24[o]&&!S.c24miss.has(o)), f=kstDay(0);
  for(let i=0;i<todo.length;i+=300){
    const part=todo.slice(i,i+300); if(onStep) onStep(i,todo.length);
    const d=await getJSON(`${WORKER}/?bs=${f}&be=${f}&as=${f}&ae=${f}&tab=orderitems&from=${f}&to=${f}&full=1&nocache=1&ids=${part.join(',')}`);
    const got=new Set();
    for(const l of (d.lines||[])){ got.add(l.order_id); if(l.paywin==='Y'||l.paid!=='Y') continue; (S.c24[l.order_id] ||= []).push(l); }
    for(const o of part) if(!got.has(o)) S.c24miss.add(o);   // 카페24에 없는 주문번호(다른 몰·오타)는 다시 묻지 않는다
  }
}

// ---------- 학습 ----------
const norm=s=>String(s||'').toLowerCase().replace(/\[[^\]]*\]/g,' ').replace(/선택=|옵션=/g,'').replace(/[\s()\[\]/·,._\-=+]/g,'');
const bigrams=s=>{s=norm(s);const g=new Set();for(let i=0;i<s.length-1;i++)g.add(s.slice(i,i+2));return g;};
function sim(a,b){const A=bigrams(a),B=bigrams(b);if(!A.size||!B.size)return 0;let k=0;for(const x of A)if(B.has(x))k++;return 2*k/(A.size+B.size);}
const ecProd=name=>String(name).split(/\s*\/\s*/).slice(1).join(' ')||name;   // '브랜드 / 상품 [규격]' → 상품 [규격]
const optText=v=>String(v||'').replace(/^(선택|옵션)=/,'').replace(/,\s*(선택|옵션)=/g,', ');
// 옵션 낱말(컬러=겨자 → '겨자', 사이즈=A2 → 'a2'): 이름 비슷함만으로는 '타원 트레이 / 겨자' 와 '타원 트레이 [베이지]' 가 거의 같은 점수라 색이 바뀌어 짝지어졌다(Su, 2026-10-20).
//   옵션 낱말이 이카운트 품명에 있으면 가산, 같은 주문의 다른 옵션 낱말이 들어 있으면 감산한다.
const OPT_SKIP=new Set(['컬러','색상','사이즈','선택','옵션','size','color','type','타입','종류']);
const optWords=opt=>String(opt||'').toLowerCase().split(/[\s,=\/()\[\]]+/).filter(w=>w.length>=2&&!OPT_SKIP.has(w)&&!/^\d+~\d+주/.test(w));
function pairScore(L,ecname,otherWords){
  const nm=String(ecname||'').toLowerCase(); let sc=sim(L.name+' '+L.opt,ecname);
  const mine=optWords(L.opt); const hit=mine.some(w=>nm.includes(w)), miss=[...otherWords].some(w=>!mine.includes(w)&&nm.includes(w));
  if(hit) sc+=0.3; else if(miss) sc-=0.3;
  return sc;
}

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
    const otherWords=new Set(r.C.flatMap(k=>optWords(label[k].opt)));
    const pairs=[]; for(const k of r.C) for(const c of r.E){ const L=label[k]; pairs.push([pairScore(L,ecProd(ecName[c]),otherWords),k,c]); }
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
// 지난 대조 결과로 배우기(Su, 2026-10-19): 지난주 내내 대조에 올린 파일은 브라우저에서만 읽어 남아 있지 않지만,
//   저장된 대조 결과 줄에 이카운트 품목코드(eccodes)가 남아 있다(판매현황 품목별로 대조한 날짜만). 그걸로 맵핑 학습을 돌린다.
async function learnFromSaved(months){
  S.err=null; S.loading='지난 대조 결과 읽는 중…'; render();
  try{
    const rows=[], names={};
    for(const ym of months){ const idx=(await getJSON(`${WORKER}/ecrecon?month=${ym}`)).idx||{};
      for(const dt of Object.keys(idx)){ const d=(await getJSON(`${WORKER}/ecrecon?date=${dt}`)).day; if(!d) continue;
        for(const r of (d.rows||[])){ if(!r.eccodes) continue;
          for(const p of String(r.eccodes).split(', ')){ const m=p.match(/^(.+?)×(\d+)$/); if(!m||!m[1]||ADV_CODES.has(m[1])) continue; rows.push({order:r.o,code:m[1],name:'',qty:Number(m[2])||1,price:0,total:0,adv:false}); } } } }
    if(!rows.length){ S.err=new Error('품목코드가 남아 있는 대조 결과가 없습니다(판매조회 파일은 품목코드가 없어 학습이 안 됩니다).'); S.loading=''; render(); return; }
    const ids=[...new Set(rows.map(r=>r.order))];
    await loadC24Orders(ids,(i,t)=>{ S.loading=`카페24 주문 받는 중… ${i}/${t}`; render(); });
    S.ecRows=rows; S.files=[{name:`지난 대조 결과 (${months.join(', ')})`,rows:rows.length}]; S.months=months.slice();
    S.loading='짝 찾는 중…'; render();
    learn(); S.view='new';
    const added=await postCands(S.result); flash(`지난 대조 결과에서 짝 ${n(added)}건을 예비 목록에 올렸습니다. 위 '확정 대기'에서 확정해 주세요.`);
  }catch(e){ S.err=e; }
  S.loading=''; render();
}
async function reloadMap(){ const d=await getJSON(`${WORKER}/ecmap`); S.map=d.map||{}; S.sign=d.sign||{}; S.cand=d.cand||{}; S.dict=d.dict||{}; }
// 예비 목록(Su, 2026-10-19): 매일 올리는 대조 파일·지난 대조 결과에서 나온 짝은 바로 대응표에 넣지 않고 워커의 예비 목록에 쌓는다.
//   맵핑 화면 맨 위 '확정 대기'에서 담당자가 보고 확정(담당자 값으로 저장)하거나 버린다. 담당자가 이미 확정한 옵션은 워커가 걸러 낸다.
function candsFromResult(R){
  const out=[];
  for(const r of R.rows){ if(!(r.st==='새로 연결'||r.st==='저장됨과 다름'||r.st==='확인 필요')) continue;
    out.push({key:r.key,pno:r.pno,label:`${r.name}${r.opt?' / '+r.opt:''}`,price:r.price||0,cands:Object.fromEntries(r.cands.map(c=>[c.code,c.n])),names:Object.fromEntries(r.cands.map(c=>[c.code,ecProd(c.name)]))}); }
  for(const u of R.unmatched){ if(u.st!=='미연결'||!u.cands.length) continue;
    out.push({key:u.key,pno:u.pno,label:`${u.name}${u.opt?' / '+u.opt:''}`,price:u.price||0,cands:Object.fromEntries(u.cands.map(c=>[c.code,c.n])),names:Object.fromEntries(u.cands.map(c=>[c.code,ecProd(c.name)]))}); }
  return out;
}
// 품목 사전: 파일에 나온 모든 코드→품명·정가(선수금 제외). 옵션 제안에 쓴다.
const dictFromResult=R=>Object.fromEntries(Object.entries(R.ecName||{}).filter(([c,nm])=>nm&&!ADV_CODES.has(c)).map(([c,nm])=>[c,{name:ecProd(nm),price:(R.ecPrice||{})[c]||0}]));
async function postCands(R){
  const cand=candsFromResult(R), dict=dictFromResult(R); if(!cand.length&&!Object.keys(dict).length) return 0;
  const d=await getJSON(`${WORKER}/ecmap`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cand,dict})});
  if(d.cand) S.cand=d.cand; Object.assign(S.dict,Object.fromEntries(Object.entries(dict).map(([c,v])=>[c,{...v}]))); return d.added||0;
}
// 카페24 상품의 옵션 전체(워커가 하루 캐시). 확정 대기를 상품 단위로 묶어 보여 주기 위해.
async function loadVariants(pnos){
  const todo=[...new Set(pnos.map(String))].filter(p=>p&&!S.vars[p]); if(!todo.length||S.varsBusy) return;
  S.varsBusy=true; render();
  try{ const f=kstDay(0); for(let i=0;i<todo.length;i+=30){ const part=todo.slice(i,i+30);
      const d=await getJSON(`${WORKER}/?bs=${f}&be=${f}&as=${f}&ae=${f}&tab=variants&products=${part.join(',')}`);
      for(const p of part) S.vars[p]=(d.variants||{})[p]||{error:'없음'}; } }
  catch(e){ for(const p of todo) S.vars[p]={error:e.message}; }
  S.varsBusy=false; render();
}
async function candAct(keys,code,meta){   // code 있으면 확정(담당자 값으로 저장), 없으면 버리기. meta: 예비 목록에 없는 옵션(상품의 다른 옵션)의 label·name
  const entries=code?keys.map(k=>{ const c=S.cand[k]||{}, m=(meta||{})[k]||{}; return {key:k,code,name:m.name||(c.names||{})[code]||(S.dict[code]||{}).name||'',label:m.label||c.label||'',src:'manual'}; }):[];
  const d=await getJSON(`${WORKER}/ecmap`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entries,candremove:keys})});
  await reloadMap(); if(S.result) learn(); return d;
}
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
// base64 xlsx → 내려받기 (판매입력 파일 다시 받기 · 새로 만들기 공용)
function saveB64(b64,filename){
  const bin=atob(b64), u8=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([u8],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); a.download=filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
async function downloadFile(id){ const d=await getJSON(`${WORKER}/ecsales?id=${encodeURIComponent(id)}`); saveB64(d.b64,d.filename); }
// ---------- 대조 현황 (이카운트 판매 입력 첫 화면) ----------
// 예전 데일리 대사 시트의 내용(월간요약 · 날짜별 탭 · 전표입력공유)을 여기서 본다. 시트를 붙이는 게 아니라
// '판매 입력 대조'를 돌릴 때 워커 /ecrecon 에 남긴 결과로 그린다(Su, 2026-10-14). 메모·처리완료는 팀 공유.
const RV={month:'',idx:null,notes:{},date:'',day:null,err:null,q:''};
const ST_ORDER=['미입력','금액불일치','환불 대기 확인','결제유형 확인','품목·수량 불일치','취소 확인','카페24에 없음','정상','취소','입금대기','개인결제창','파일 기간 밖'];
async function loadRV(){
  if(!RV.month) RV.month=kstDay(0).slice(0,7);
  RV.err=null;
  try{ const d=await getJSON(`${WORKER}/ecrecon?month=${RV.month}`); RV.idx=d.idx||{}; RV.notes=d.notes||{}; }catch(e){ RV.err=e; RV.idx={}; }
}
async function loadRVDay(date){
  RV.date=date; RV.day=null; RV.dayMissing=false; render();
  // 다른 달 날짜로 넘어가면 그 달 월간요약도 바꿔 받는다(◀ ▶ 가 그 달 안에서 움직이게)
  if(date.slice(0,7)!==RV.month){ RV.month=date.slice(0,7); RV.idx=null; await loadRV(); }
  try{ const d=await getJSON(`${WORKER}/ecrecon?date=${date}`); RV.day=d.day; RV.dayMissing=!d.day; RV.notes={...RV.notes,...(d.notes||{})}; }catch(e){ RV.err=e; }
  render();
}
// 메모·처리완료·선수금 진행·배송 상태 — 팀 공유. 바꾼 칸만 보낸다(워커가 지금 값에 합친다) — 다른 사람이 바꾼 칸을 내 화면의 옛 값으로 덮지 않게(H2).
async function saveNote(date,order,patch){
  const d=await getJSON(`${WORKER}/ecrecon`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({note:{date,order,...patch}})});
  if(d.note) RV.notes[order]=d.note; else delete RV.notes[order];
  if(OO.list){ const x=OO.list.find(y=>y.o.order_id===order); if(x){ x.nt=d.note||{}; if(x.nt.done){ OO.list=OO.list.filter(y=>y!==x); if(OO.detail===order) OO.detail=''; } } }
  const c=monthCache[date.slice(0,7)]; if(c){ if(d.note) c.notes[order]=d.note; else delete c.notes[order]; }   // 같은 달 캐시도 맞춘다
}
const noteTimers={};
function noteMemo(date,order,memo){ const cur=RV.notes[order]||{}; RV.notes[order]={...cur,date,memo}; const c=monthCache[date.slice(0,7)]; if(c) c.notes[order]=RV.notes[order]; clearTimeout(noteTimers[order]); noteTimers[order]=setTimeout(()=>saveNote(date,order,{memo}).catch(()=>{}),700); }
// 배송 상태 — 배송방식(퀵·설치·차량 등)이 있는 주문은 배송이 어디까지 진행됐는지 여기서 바꿔 가며 따라간다(Su, 2026-10-14).
//   배송방식 자체는 이카운트 고객명 값 그대로. 이카운트의 배송일자·배송결과(판매조회 열)는 참고로 같이 보여준다.
// 목록(배송 상태·선수금 진행·출고처·앞말)은 워커 /ecconf 에서 받아 덮어쓴다 — 화면 아래 '목록 설정'에서 고친다. 아래는 기본값.
const DSTS=['일정 조율중','출고 예정','출고완료','배송완료','설치완료','보류'];
// 선수금 진행 — 발주 필요 → 발주 완료 → 입고 완료 → 출고 완료. 배송이 나가면 이카운트에서 전표를 바꾸고(선수금 정산 전표) 처리완료로 승인한다.
const ASTS=['발주 필요','발주 완료','입고 완료','출고 완료','보류'];
const isShipTag=x=>x&&!isLater(x)&&!/^선수금/.test(x);
const dstStyle=v=>/^발주 필요/.test(v)?'background:var(--down-soft);color:var(--down)':/완료/.test(v)?'background:var(--up-soft);color:var(--up)':v==='보류'?'background:var(--down-soft);color:var(--down)':'background:#FFF3E0;color:#C25E00';
// 선수금 뱃지 바로 아래 선수금 진행, 배송방식 뱃지 바로 아래 배송 상태 — 뱃지·드롭다운 가로 폭은 같게(Su, 2026-10-14)
const TAGW='width:128px;box-sizing:border-box';
function tagCell(tags,order,date,r){
  const nt=RV.notes[order]||{}, parts=String(tags||'').split(' · ').filter(Boolean);
  if(!parts.length) return '<span style="color:var(--ghost)">—</span>';
  const settled=parts.some(x=>/^선수금 정산 전표/.test(x));
  const ec=[r&&r.dday,r&&r.dres].filter(Boolean).join(' · ');
  const badge=x=>`<span class="ec-badge" style="${tagStyle(x)};${TAGW};display:block;text-align:center;padding:3px 6px;white-space:normal">${esc(x)}</span>`;
  const sel=(a,list,v,label)=>`<select class="ec-in" data-a="${a}" data-o="${esc(order)}" data-d="${esc(date)}" style="${TAGW};display:block;height:26px;font-size:11px;padding:0 4px;margin-top:3px;${v?dstStyle(v):''}" aria-label="${label}">
    <option value="" ${!v?'selected':''}>${label} —</option>${list.map(x=>`<option ${v===x?'selected':''}>${x}</option>`).join('')}</select>`;
  const blocks=parts.map(x=>{
    let h=badge(x);
    if(!isLater(x)&&/^선수금/.test(x)){ h+=sel('rvast',ASTS,nt.ast,'선수금 진행'); if(settled&&!nt.done) h+=`<div class="ec-sub" style="${TAGW};color:var(--up);font-weight:600;white-space:normal">정산 전표 들어옴 — 승인 확인</div>`; }
    else if(isShipTag(x)){ h+=sel('rvdst',DSTS,nt.dst,'배송 상태'); if(ec) h+=`<div class="ec-sub" style="${TAGW};white-space:normal" title="이카운트 배송일자 · 배송결과">이카운트: ${esc(ec)}</div>`; }
    return `<div style="margin:2px auto 6px;${TAGW}">${h}</div>`;
  }).join('');
  return `<div style="display:flex;flex-direction:column;align-items:center">${blocks}</div>`;
}
const sumTxt=sm=>ST_ORDER.filter(k=>sm[k]).map(k=>`${k} ${n(sm[k])}`).join(' · ');
function rvTable(rows,withDate){
  return `<div class="ec-scroll"><table class="ec-t" style="min-width:1100px"><thead><tr>${withDate?'<th>날짜</th>':''}<th>주문번호</th><th style="min-width:150px">선수금 · 배송방식</th><th>공급사</th><th>상품</th><th>카페24 실결제</th><th>이카운트 합계</th><th>차액</th><th>결제유형</th><th>상태</th><th>메모</th><th>처리완료</th></tr></thead><tbody>
    ${rows.map(r=>{ const nt=RV.notes[r.o]||{}, dt=r.date||RV.date;
      return `<tr style="${rowBg(r.tags,nt.done)}">${withDate?`<td>${esc(dt.slice(5))}</td>`:''}<td><b>${esc(r.o)}</b><div class="ec-sub">${esc(r.t||'')}</div></td><td>${tagCell(r.tags,r.o,dt,r)}</td><td>${esc(r.sup||'')}</td>
      <td class="l" style="min-width:260px">${r.items?`<div class="ec-sub" style="margin:0">카페24</div><div>${esc(r.items)}</div>`:''}${r.ecitems?`<div class="ec-sub" style="margin:4px 0 0;padding-top:4px;border-top:1px dashed var(--hair)">이카운트</div><div style="color:var(--ink-2)">${esc(r.ecitems)}</div>`:''}${r.item&&r.item!=='일치'?`<div class="ec-sub">${esc(r.item)}</div>`:''}</td>
      <td>${r.paid==null?'—':n(r.paid)}${r.expect!=null?`<div class="ec-sub" style="color:var(--down)">환불 전 예상 ${n(r.expect)}</div>`:''}</td><td>${r.ec==null?'—':n(r.ec)}</td><td style="${r.diff?'color:var(--down);font-weight:700':''}">${r.diff==null?'—':n(r.diff)}</td>
      <td style="${(r.more||[]).includes('결제유형 확인')||r.st==='결제유형 확인'?'color:var(--down)':''}">${esc(r.want||'—')}${r.ecPay?`<div class="ec-sub">이카운트 ${esc(r.ecPay)}</div>`:''}</td>
      <td><span class="ec-badge ${stCls(r.st)}">${esc(r.st)}</span>${(r.more||[]).length?`<div class="ec-sub">${esc(r.more.join(' · '))}</div>`:''}</td>
      <td><input class="ec-in" data-a="rvmemo" data-o="${esc(r.o)}" data-d="${esc(dt)}" value="${esc(nt.memo||'')}" placeholder="메모" maxlength="200" style="width:140px"></td>
      <td><input type="checkbox" data-a="rvdone" data-o="${esc(r.o)}" data-d="${esc(dt)}" ${nt.done?'checked':''} aria-label="처리완료"></td></tr>`; }).join('')
    ||'<tr><td colspan="12" style="color:var(--muted)">없습니다.</td></tr>'}</tbody></table></div>`;
}
// 엑셀: 예전 시트 구성 그대로 — 월간요약 · 전표입력공유 · 날짜별 시트
async function exportRV(btn){
  await loadXLSX();
  const days=Object.keys(RV.idx||{}).sort().reverse();
  if(!days.length) return alert('이 달에는 대조한 날짜가 없습니다.');
  btn.disabled=true; const txt=btn.textContent;
  const wb=XLSX.utils.book_new(), dayData={};
  // 날짜별 결과를 5개씩 동시에 받는다(예전: 하나씩 차례로)
  let done=0;
  for(let i=0;i<days.length;i+=5){
    await Promise.all(days.slice(i,i+5).map(async dt=>{ try{ const d=await getJSON(`${WORKER}/ecrecon?date=${dt}`); dayData[dt]=d.day; Object.assign(RV.notes,d.notes||{}); }catch(e){} btn.textContent=`받는 중… ${++done}/${days.length}`; }));
  }
  const tot={}; let all=0,missAmt=0; for(const dt of days){ const m=(RV.idx[dt]||{}).summary||{}; all+=m.total||0; missAmt+=m.missAmt||0; for(const k of ST_ORDER) tot[k]=(tot[k]||0)+(m[k]||0); }
  const sum=[[`카페24-이카운트 대조 - 월간요약 (${RV.month})`],[`이번달 누계: 전체 ${all}건 | ${sumTxt(tot)}${missAmt?` | 미입력 금액 ${missAmt}원`:''}`],[],
    ['날짜','전체','정상','미입력','미입력 금액','금액불일치','결제유형 확인','품목·수량 불일치','취소·입금대기','선수금·배송방식','대조 시각','이카운트 파일'],
    ...days.map(dt=>{ const v=RV.idx[dt], m=v.summary||{}; return [dt,m.total||0,m['정상']||0,m['미입력']||0,m.missAmt||0,m['금액불일치']||0,m['결제유형 확인']||0,m['품목·수량 불일치']||0,(m['취소']||0)+(m['입금대기']||0)+(m['취소 확인']||0),m.tagged||0,v.at,v.file||'']; })];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(sum),'월간요약');
  const H=['주문번호','주문시각','선수금/배송방식','선수금 진행','배송 상태','이카운트 배송일자','이카운트 배송결과','공급사명','상품 (옵션 ×수량)','카페24 품목코드','이카운트 품목','카페24 실결제금액','이카운트 합계금액','차액(카페24-이카운트)','결제유형(카페24 기준)','이카운트 결제유형','상태','추가 확인','품목대조','메모','처리완료'];
  const line=(r,dt)=>{ const nt=RV.notes[r.o]||{}; return [r.o,r.t,r.tags||'',nt.ast||'',nt.dst||'',r.dday||'',r.dres||'',r.sup,r.items,r.codes||'',r.ecitems||r.eccodes||'',r.paid,r.ec,r.diff,r.want,r.ecPay,r.st,(r.more||[]).join(', '),r.item,nt.memo||'',nt.done?'Y':'']; };
  const share=[['발견일','주문번호','선수금/배송방식','선수금 진행','배송 상태','이카운트 배송결과','상태','카페24 실결제금액','이카운트 합계금액','차액','결제유형(카페24 기준)','이카운트 결제유형','메모','처리완료']];
  for(const dt of days) for(const r of ((dayData[dt]||{}).rows||[])) if(BAD_ST.includes(r.st)||tracked(r.tags)){ const nt=RV.notes[r.o]||{}; share.push([dt,r.o,r.tags||'',nt.ast||'',nt.dst||'',r.dres||'',[r.st,...(r.more||[])].join(', '),r.paid,r.ec,r.diff,r.want,r.ecPay,nt.memo||'',nt.done?'Y':'']); }
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(share),'전표입력공유');
  for(const dt of days){ const d=dayData[dt]; if(!d) continue;
    const rows=d.rows.slice().sort((a,b)=>ST_ORDER.indexOf(a.st)-ST_ORDER.indexOf(b.st)||String(a.o).localeCompare(String(b.o)));
    const sm=d.summary||{};
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([[`카페24-이카운트 대조 - ${dt}`],[`전체 ${sm.total||0}건 | ${sumTxt(sm)}${sm.missAmt?` | 미입력 금액 ${sm.missAmt}원`:''} · 대조 ${d.at}${d.file?' · '+d.file:''}`],[],H,...rows.map(r=>line(r,dt))]),dt); }
  XLSX.writeFile(wb,`카페24_이카운트_대조_${RV.month}.xlsx`);
  btn.disabled=false; btn.textContent=txt;
}
function rvHtml(){
  if(RV.err) return `<div class="ec-stat err">${esc(RV.err.message)}</div>`;
  if(!RV.idx) return `<div class="state"><div class="spinner"></div>대조 현황 불러오는 중…</div>`;
  const pick=`<div class="ec-row"><label>월 <input type="month" class="ec-in" id="ecRvMonth" value="${esc(RV.month)}"></label>
    <span style="flex:1"></span><button class="ec-dl" data-a="rvxlsx" style="height:36px">엑셀로 받기 (이 달)</button><button class="go" data-a="gorecon2" style="height:36px">판매 입력 대조 하러 가기</button></div>`;
  // 날짜 상세(예전 시트의 날짜 탭)
  if(RV.date){
    const d=RV.day, q=RV.q.trim().toLowerCase();
    if(!d) return `${pick}<div class="ec-row" style="margin-top:var(--s4)"><button class="ec-dl" data-a="rvback">← 월간요약</button><input type="date" class="ec-in" id="ecRvDate" value="${esc(RV.date)}" max="${kstDay(0)}"></div>
      ${RV.dayMissing?`<div class="ec-stat">${esc(RV.date)}에는 저장된 대조 결과가 없습니다. 판매 입력 대조에서 그 날짜를 대조하면 여기에 나옵니다.</div>`:`<div class="state"><div class="spinner"></div>${esc(RV.date)} 불러오는 중…</div>`}`;
    const g=r=>({tags:r.tags,st:r.st,id:r.o});
    const base=d.rows.filter(r=>!q||[r.o,r.sup,r.items,r.st,r.tags].join(' ').toLowerCase().includes(q));
    const rows=tfApply(base,g);
    const ds=Object.keys(RV.idx).sort(), i=ds.indexOf(RV.date), prev=ds[i-1], next=ds[i+1];
    return `${pick}<div class="ec-row" style="margin-top:var(--s4)"><button class="ec-dl" data-a="rvback">← 월간요약</button>
      <button class="ec-dl" data-a="rvday" data-d="${esc(prev||'')}" ${prev?'':'disabled'} title="이전 대조 날짜">◀</button>
      <input type="date" class="ec-in" id="ecRvDate" value="${esc(RV.date)}" max="${kstDay(0)}" style="font-weight:700">
      <button class="ec-dl" data-a="rvday" data-d="${esc(next||'')}" ${next?'':'disabled'} title="다음 대조 날짜">▶</button>
      <span class="ec-sub" style="margin:0">대조 ${esc(d.at)}${d.file?` · ${esc(d.file)}`:''}</span></div>
      <div class="ec-stat">${esc(sumTxt(d.summary))}${d.summary.missAmt?` · 미입력 금액 ${n(d.summary.missAmt)}원`:''}</div>
      <div class="ec-row" style="margin-top:var(--s3)"><input class="ec-in" id="ecRvQ" value="${esc(RV.q)}" placeholder="주문번호·공급사·상품 검색" style="width:240px"></div>
      ${tfBar(base,g)}${rvTable(rows,false)}`;
  }
  // 월간요약 + 전표입력공유
  const days=Object.entries(RV.idx).sort((a,b)=>b[0].localeCompare(a[0]));
  const tot={}; let missAmt=0; for(const [,v] of days){ for(const k of ST_ORDER) tot[k]=(tot[k]||0)+(v.summary[k]||0); missAmt+=v.summary.missAmt||0; }
  const all=days.reduce((t,[,v])=>t+(v.summary.total||0),0);
  const share0=days.flatMap(([dt,v])=>((v.summary||{}).issues||[]).map(x=>({...x,date:dt}))), inShare=new Set(share0.map(x=>x.o));
  const share=share0.filter(x=>!(RV.notes[x.o]||{}).done);
  const c=(v,bad)=>v?`<span style="${bad?'color:var(--down);font-weight:700':''}">${n(v)}</span>`:'<span style="color:var(--ghost)">0</span>';
  return `${pick}
    <div class="ec-stat" style="font-weight:600;color:var(--ink)">이번 달 누계: 전체 ${n(all)}건 · ${esc(sumTxt(tot))}${missAmt?` · 미입력 금액 ${n(missAmt)}원`:''}</div>
    <div class="ec-scroll"><table class="ec-t" style="min-width:900px"><thead><tr><th>날짜</th><th>전체</th><th>정상</th><th>미입력</th><th>미입력 금액</th><th>금액불일치</th><th>결제유형 확인</th><th>품목·수량 불일치</th><th>취소·입금대기</th><th>선수금·배송방식</th><th>대조 시각</th><th></th></tr></thead><tbody>
      ${days.map(([dt,v])=>{ const m=v.summary; return `<tr><td><b>${esc(dt.slice(5).replace('-','/'))}</b></td><td>${n(m.total)}</td><td>${c(m['정상'])}</td><td>${c(m['미입력'],1)}</td><td>${m.missAmt?n(m.missAmt):'—'}</td>
        <td>${c(m['금액불일치'],1)}</td><td>${c(m['결제유형 확인'],1)}</td><td>${c(m['품목·수량 불일치'],1)}</td><td>${c((m['취소']||0)+(m['입금대기']||0)+(m['취소 확인']||0))}</td><td>${c(m.tagged)}</td>
        <td><span class="ec-sub" style="margin:0">${esc(v.at)}</span></td><td><button class="ec-dl" data-a="rvday" data-d="${esc(dt)}">보기</button></td></tr>`; }).join('')
      ||'<tr><td colspan="12" style="color:var(--muted)">이 달에는 아직 대조한 날짜가 없습니다. 판매 입력 대조에서 이카운트 파일을 올리면 여기에 쌓입니다.</td></tr>'}</tbody></table></div>
    <h3 style="font-size:15px;margin:var(--s5) 0 0">전표입력공유 <span class="ec-sub" style="display:inline">처리 안 된 것 ${n(share.length)}건 (문제 ${n(share.filter(x=>BAD_ST.includes(String(x.st).split(' · ')[0])).length)} · 선수금·배송방식 ${n(share.filter(x=>tracked(x.tags)).length)})</span></h3>
    <details class="ec-note" style="margin-top:4px"><summary>설명 보기</summary><div>대조에서 나온 문제 주문(미입력·금액불일치·결제유형·수량 등)과 진행을 따라가야 하는 선수금·배송방식(퀵·설치·차량 등) 주문이 모입니다.
      선수금은 '선수금 진행'(발주 필요 → 발주 완료 → 입고 완료 → 출고 완료), 배송방식은 '배송 상태'를 바꿔 가며 따라가고, 이카운트 전표까지 바꾸면 처리완료로 승인하세요. <span class="ec-badge" style="${tagStyle('선수금')}">선수금</span> 주문은 행이 옅은 빨간색, <span class="ec-badge" style="${tagStyle('퀵')}">배송방식</span>은 뱃지로 표시합니다. 위 유형·정렬로 골라 보세요.</div></details>
    ${tfBar(share,r=>({tags:r.tags,st:r.st,id:r.o}))}${rvTable(tfApply(share,r=>({tags:r.tags,st:r.st,id:r.o})),true)}`;
}
// ---------- 진행 중 주문 (주문 처리 첫 화면 맨 위) ----------
// 카페24에서 아직 배송이 끝나지 않은 주문(배송전 F · 배송중 M, 최근 60일)을 받아 세 묶음으로 보여준다(Su, 2026-10-15):
//   ① 선수금 — 대조 결과에 선수금 표시가 있는 주문, 선수금 진행 단계별(발주 필요 → … → 출고 완료)
//   ② 배송방식(퀵·설치·차량 등) — 배송 상태별(일정 조율중 → … → 설치완료)
//   ③ 그 밖에 배송 가야 하는 주문(배송전) · 배송 중인 주문
// 선수금·배송방식 표시는 대조 현황 월간요약(issues)에서, 진행 단계·메모·처리완료는 공유 메모에서 가져온다. 처리완료면 뺀다.
const OO={list:null,err:null,loading:false,exp:{},card:'',q:''};
async function loadOpen(){
  OO.loading=true; OO.err=null; render();
  try{
    const f=kstDay(0);
    const d=await getJSON(`${WORKER}/?bs=${f}&be=${f}&as=${f}&ae=${f}&tab=openorders&days=60${OO.force?'&nocache=1':''}`); OO.force=false; OO.at=d.fetchedAt||'';
    const months=[...new Set((d.orders||[]).map(o=>o.order_date.slice(0,7)).concat(kstDay(0).slice(0,7)))];
    const tags={}, notes={}, recDates=new Set(), missing=new Set();
    await Promise.all(months.map(async ym=>{ try{ const m=await getJSON(`${WORKER}/ecrecon?month=${ym}`);
      for(const [dt,v] of Object.entries(m.idx||{})){ recDates.add(dt); for(const x of ((v.summary||{}).issues||[])){ if(x.tags) tags[x.o]=x.tags; if(/^미입력/.test(String(x.st||''))) missing.add(x.o); } }
      Object.assign(notes,m.notes||{}); }catch(e){} }));
    OO.recDates=recDates; OO.missing=missing;
    Object.assign(RV.notes,notes);
    const lines={}; for(const l of (d.lines||[])) (lines[l.order_id] ||= []).push(l);
    // rec: 'none' 대조 안 됨(이카운트 입력 여부 모름) · 'missing' 대조 결과 미입력 · 'ok' 대조돼 입력 확인됨
    const mk=(o,t,nt)=>({o,ls:lines[o.order_id]||[],tags:t,nt,adv:hasAdv(t),ship:kinds(t).has('ship'),shipTag:String(t).split(' · ').find(isShipTag)||'',rec:!recDates.has(o.order_date)?'none':missing.has(o.order_id)?'missing':'ok'});
    let list=(d.orders||[]).map(o=>mk(o,tags[o.order_id]||'',notes[o.order_id]||{}));
    // 선수금·배송방식인데 처리완료가 아니고 목록(배송전·배송중)에 없는 주문 = 카페24 배송완료 등 → 주문번호로 따로 받아 '배송완료' 묶음에 둔다(Su, 2026-10-15)
    const have=new Set(list.map(x=>x.o.order_id));
    const need=Object.keys(tags).filter(id=>tracked(tags[id])&&!(notes[id]||{}).done&&!have.has(id)&&id.slice(0,8)>=ymd(kstDay(-60)));
    for(let i=0;i<need.length;i+=300){ const part=need.slice(i,i+300), f2=kstDay(0);
      try{ const e=await getJSON(`${WORKER}/?bs=${f2}&be=${f2}&as=${f2}&ae=${f2}&tab=orderitems&from=${f2}&to=${f2}&full=1&nocache=1&daily=1&ids=${part.join(',')}`);
        for(const l of (e.lines||[])) (lines[l.order_id] ||= []).push(l);
        for(const o of (e.orders||[])){ if(o.paid!=='Y'||o.canceled==='Y') continue; list.push(mk({order_id:o.order_id,order_date:o.order_date||o.date,ship_status:o.ship_status||'T',payment_amount:o.payment_amount,naver_point:o.naver_point},tags[o.order_id],notes[o.order_id]||{})); } }catch(e){} }
    OO.list=list.filter(x=>!x.nt.done).sort((a,b)=>a.o.order_date.localeCompare(b.o.order_date));
    OO.truncated=!!d.truncated;
    if(OO.detail&&!OO.info) openDetail(OO.detail);   // 주소로 바로 연 상세는 목록이 온 뒤 채운다
    await applyHooks();   // 웹훅으로 들어온 최신 상태 덮기
  }catch(e){ OO.err=e; OO.list=[]; }
  OO.loading=false; render();
}
const SS_TXT={F:'배송전',M:'배송중',T:'배송완료'};
// 웹훅 상태 덮기: 카페24가 보낸 최신 배송 상태(워커 ecopen:*)를 목록 위에 덮는다. 전체 조회는 5분 캐시라 이게 더 새것.
//   화면이 열려 있는 동안 1분마다 다시 받는다(가벼움). 배치는 없다 — 카페24가 바뀔 때마다 보낸다.
async function applyHooks(){
  if(!OO.list) return;
  try{ const f=kstDay(0); const h=await getJSON(`${WORKER}/?bs=${f}&be=${f}&as=${f}&ae=${f}&tab=openhooks&nocache=1`);
    OO.hookAt=(h.recent||[])[0]?h.recent[0].at:''; let ch=0;
    for(const x of OO.list){ const st=h.states[x.o.order_id]; if(!st) continue;
      if(st.ship_status&&st.ship_status!==x.o.ship_status){ x.o.ship_status=st.ship_status; x.o.hook_at=st.at; ch++; }
      if(st.deleted||st.paid==='F'){ x.gone=true; ch++; } }
    if(ch){ OO.list=OO.list.filter(x=>!x.gone&&(['F','M'].includes(x.o.ship_status)||tracked(x.tags))); }
  }catch(e){}
}
function hookTimer(){ clearInterval(OO.timer); OO.timer=setInterval(async()=>{ if(S.page!=='log'||!document.body.contains(S.root)){ clearInterval(OO.timer); return; } await applyHooks(); render(); },60e3); }
// 화면 구성(2026-10-15, 주문 관리 UI 관례): 위에 건수 달린 상태 칩(누르면 필터) → 표 하나(세 묶음을 쌓지 않음) → 줄을 누르면 상세.
//   구분 칩: 전체 · 선수금 · 배송방식 · 배송전 · 배송중 · 7일 지남. 선수금/배송방식을 고르면 단계·상태 칩이 한 줄 더.
const ooAge=d=>Math.max(0,Math.round((new Date(kstDay(0)+'T00:00:00')-new Date(d+'T00:00:00'))/86400e3));
function ooKind(x){ return x.adv?'adv':x.ship?'ship':x.o.ship_status==='M'?'m':'f'; }
// 카드 묶음(Su, 2026-10-15): 선수금은 단계별 카드, 퀵·설치·차량은 상태별 카드, 일반은 배송전·배송중 카드.
//   처음엔 카드만 보이고, 카드를 누르면 그 묶음의 목록이 아래에 펼쳐진다. 줄을 누르면 상세.
// 화면 구역(Su, 2026-10-15): ① 이카운트 입력 현황 — 대조 안 됨 / 미입력 / 입력됨. 방식(선수금·퀵·설치)은 이카운트에 입력돼야 알 수 있으므로 여기가 첫 칸.
//                            ② 배송 진행표 — 세로: 선수금 · 퀵·설치·차량 · 일반, 가로: 주문 접수 → 준비 → 출고 → 배송중 → 배송완료, 보류는 오른쪽.
//   칸을 누르면 그 주문 목록, 줄을 누르면 상세. '배송완료'는 카페24 배송완료인데 처리완료(승인)를 아직 안 한 주문.
const COLS=[['접수','주문 접수'],['준비','준비'],['출고','출고'],['배송중','배송중'],['완료','배송완료']];
function ooCol(x){   // 방식별 단계 → 공통 칸
  const k=ooKind(x), ss=x.o.ship_status;
  if(k==='adv'){ const a=x.nt.ast||''; if(a==='보류') return '보류'; if(ss==='T') return '완료'; if(ss==='M') return '배송중'; if(a==='출고 완료') return '출고'; if(a) return '준비'; return '접수'; }
  if(k==='ship'){ const d=x.nt.dst||''; if(d==='보류') return '보류'; if(ss==='T'||d==='배송완료'||d==='설치완료') return '완료'; if(ss==='M') return '배송중'; if(d==='출고완료') return '출고'; if(d) return '준비'; return '접수'; }
  return ss==='T'?'완료':ss==='M'?'배송중':'접수';
}
function ooGroups(L){
  const mk=(key,title,color,ink,rows,sub)=>{ const g={}; for(const x of rows) (g[ooCol(x)] ||= []).push(x);
    return {key,title,color,ink,total:rows.length,sub,cells:COLS.map(([c,l])=>({key:c,label:l,rows:g[c]||[]})),hold:{key:'보류',label:'보류',rows:g['보류']||[]}}; };
  return [
    mk('adv','선수금','#F1E8FF','#6B3FB8',L.filter(x=>ooKind(x)==='adv'),'발주 필요 → 발주 완료 → 입고 완료 → 출고 완료'),
    mk('ship','퀵 · 설치 · 차량','#E0F7F4','#00796B',L.filter(x=>ooKind(x)==='ship'),'일정 조율중 → 출고 예정 → 출고완료 → 배송완료 · 설치완료'),
    mk('rest','일반 주문','#EEF1EF','#46504B',L.filter(x=>['f','m'].includes(ooKind(x))),'카페24 배송 상태 그대로'),
  ];
}
// 상세 페이지(Su, 2026-10-15): 줄을 누르면 그 주문 하나의 상세 — 카페24 주문·수령인·배송지·결제, 품목, 카페24 배송 상태, 대조 결과, 진행 단계·메모.
//   수령인 정보는 목록에 없어서(캐시 때문) 상세를 열 때 그 주문만 받는다. 저장된 대조 결과는 주문일의 대조 결과에서 찾는다.
async function openDetail(id){
  OO.detail=id; OO.info=null; OO.infoErr=null; render();
  const x=(OO.list||[]).find(y=>y.o.order_id===id); if(!x) return;
  const dt=x.o.order_date;
  try{
    const [c24,day]=await Promise.all([
      getJSON(`${WORKER}/?bs=${dt}&be=${dt}&as=${dt}&ae=${dt}&tab=orderitems&from=${dt}&to=${dt}&full=1&nocache=1&daily=1&ids=${id}`),
      getJSON(`${WORKER}/ecrecon?date=${dt}`).catch(()=>({day:null})),
    ]);
    if(OO.detail!==id) return;
    const o=(c24.orders||[])[0]||null, ls=(c24.lines||[]).filter(l=>l.order_id===id), rc=day.day&&(day.day.rows||[]).find(r=>r.o===id)||null;
    OO.info={o,ls,rc,dayAt:day.day&&day.day.at};
  }catch(e){ OO.infoErr=e; }
  render();
}
function detailCard(){
  const id=OO.detail; if(!id) return '';
  const x=(OO.list||[]).find(y=>y.o.order_id===id); if(!x) return '';
  const I=OO.info, o=(I&&I.o)||x.o, ls=(I&&I.ls&&I.ls.length)?I.ls:x.ls, rc=I&&I.rc, nt=RV.notes[id]||{}, dt=x.o.order_date, k=ooKind(x);
  const kv=(l,v)=>v?`<div style="display:flex;gap:10px"><span class="ec-sub" style="margin:0;min-width:72px">${l}</span><span>${v}</span></div>`:'';
  const want=I&&I.o?payType(I.o):'';
  const paid=(o.payment_amount||0)+(o.naver_point||0);
  const sel=(a,listv,v,label)=>`<select class="ec-in" data-a="${a}" data-o="${esc(id)}" data-d="${esc(dt)}" style="height:28px;${v?dstStyle(v):''}" aria-label="${label}"><option value="" ${!v?'selected':''}>${label} —</option>${listv.map(z=>`<option ${v===z?'selected':''}>${z}</option>`).join('')}</select>`;
  return `<div class="ec-card">
    <div class="ec-row"><button class="ec-dl" data-a="oodetail" data-o="">← 목록으로</button><span class="ec-sub" style="margin:0">진행 중 주문 › ${esc(OO.cardTitle||'')} ›</span>
      <h2 style="font-size:16px">주문 상세 <span style="font-family:ui-monospace,Menlo,monospace">${esc(id)}</span></h2>
      <span class="ec-badge ${o.ship_status==='M'?'ec-warn':'ec-info'}">카페24 ${esc(SS_TXT[o.ship_status]||o.ship_status||'—')}</span>
      ${x.tags?tagHtml(x.tags):'<span class="ec-badge ec-info">일반</span>'}
    </div>
    ${OO.infoErr?`<div class="ec-stat err">${esc(OO.infoErr.message)}</div>`:!I?'<div class="ec-stat">카페24에서 주문 정보 받는 중…</div>':''}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:var(--s4);margin-top:var(--s3);font-size:13px;line-height:1.7">
      <div><div style="font-weight:700;margin-bottom:4px">주문</div>
        ${kv('주문일',`${esc(dt)} ${esc(o.time||'')} <span class="ec-sub" style="display:inline">(${ooAge(dt)}일 경과)</span>`)}
        ${kv('실결제',`<b>${n(paid)}</b>${o.naver_point?` <span class="ec-sub" style="display:inline">네이버포인트 ${n(o.naver_point)}</span>`:''}`)}
        ${kv('결제',esc([o.pay_name||o.method,o.easypay,o.pg].filter(Boolean).join(' · ')))}${kv('→ 이카운트',esc(want))}
        ${kv('배송비',o.shipping_fee?n(o.shipping_fee):'')}</div>
      <div><div style="font-weight:700;margin-bottom:4px">고객 · 배송</div>
        ${kv('주문자',I&&I.o?`${esc(o.buyer||'—')} ${esc(o.buyer_phone||'')}`:'')}
        ${kv('수령인',I&&I.o?`${esc(o.rc_name||'—')} ${esc(o.rc_phone||'')}`:'')}
        ${kv('배송지',esc(o.rc_addr||''))}${kv('배송메시지',esc(o.rc_msg||''))}</div>
      <div><div style="font-weight:700;margin-bottom:4px">이카운트 대조</div>
        ${rc?`${kv('상태',`<span class="ec-badge ${stCls(rc.st)}">${esc(rc.st)}</span>${(rc.more||[]).length?` <span class="ec-sub" style="display:inline">${esc(rc.more.join(' · '))}</span>`:''}`)}
          ${kv('이카운트 합계',rc.ec==null?'—':n(rc.ec))}${kv('차액',rc.diff==null?'—':n(rc.diff))}${kv('결제유형',`${esc(rc.want||'—')}${rc.ecPay?` <span class="ec-sub" style="display:inline">이카운트 ${esc(rc.ecPay)}</span>`:''}`)}
          ${kv('이카운트 배송',esc([rc.dday,rc.dres].filter(Boolean).join(' · ')))}${kv('대조 시각',esc(I.dayAt||''))}`
          :I?'<div class="ec-sub">이 주문일은 아직 판매 입력 대조를 하지 않았습니다.</div>':''}
        <div style="margin-top:6px"><a href="#" data-a="godate" data-d="${esc(dt)}" style="color:var(--accent)">판매 입력 대조에서 ${esc(dt.slice(5))} 열기 →</a></div></div>
    </div>
    <div style="margin-top:var(--s4)"><div style="font-weight:700;margin-bottom:4px;font-size:13px">품목 ${n(ls.length)}줄</div>
      <div class="ec-scroll"><table class="ec-t" style="min-width:600px"><thead><tr><th class="l">상품</th><th>옵션</th><th>수량</th><th>공급사</th><th>카페24 상태</th><th>출고일</th><th>품목코드</th></tr></thead><tbody>
        ${ls.map(l=>`<tr style="${l.canceled==='Y'?'color:var(--ghost)':''}"><td class="l">${esc(l.product_name)}</td><td>${esc(optText(l.option_value))}</td><td>${n(l.qty)}</td><td>${esc(l.supplier_name||'')}</td><td>${esc(l.status||'')}${l.canceled==='Y'?' <span class="ec-badge ec-warn">취소·반품</span>':''}</td><td>${esc((l.shipped||'').slice(5))}</td><td>${esc(codeOf(l)||'—')}</td></tr>`).join('')}</tbody></table></div></div>
    ${rc&&rc.ecitems?`<div style="margin-top:var(--s3)"><div style="font-weight:700;margin-bottom:4px;font-size:13px">이카운트 품목</div><div style="font-size:13px;color:var(--ink-2)">${esc(rc.ecitems).split(' / ').join('<br>')}</div></div>`:''}
    <div class="ec-row" style="margin-top:var(--s4)">
      ${k==='adv'?`<label>선수금 진행 ${sel('rvast',LISTS.ast,nt.ast,'진행')}</label>`:''}${k==='ship'?`<label>배송 상태 ${sel('rvdst',LISTS.dst,nt.dst,'상태')}</label>`:''}
      <label style="flex:1">메모 <input class="ec-in" data-a="rvmemo" data-o="${esc(id)}" data-d="${esc(dt)}" value="${esc(nt.memo||'')}" maxlength="200" style="width:100%"></label>
      <label><input type="checkbox" data-a="rvdone" data-o="${esc(id)}" data-d="${esc(dt)}"> 처리완료</label>
      ${nt.at?`<span class="ec-sub" style="margin:0">마지막 변경 ${esc(nt.at)}</span>`:''}</div></div>`;
}
function openCard(){
  if(OO.loading&&!OO.list) return `<div class="ec-card"><h2>진행 중 주문</h2><div class="state"><div class="spinner"></div>카페24에서 배송이 안 끝난 주문 받는 중…</div></div>`;
  if(OO.err) return `<div class="ec-card"><h2>진행 중 주문</h2><div class="ec-stat err">${esc(OO.err.message)}</div></div>`;
  const L=OO.list||[], G=ooGroups(L.filter(x=>x.rec==='ok')), old=L.filter(x=>ooAge(x.o.order_date)>=7).length;   // 진행표는 이카운트 입력이 확인된 주문만
  const selKey=OO.card||'';
  const recN={none:L.filter(x=>x.rec==='none').length,missing:L.filter(x=>x.rec==='missing').length,ok:L.filter(x=>x.rec==='ok').length};
  const tile=(k,label,nn,sub,bad)=>`<button data-a="oocard" data-k="${esc(k)}" style="flex:1 1 0;min-width:150px;text-align:left;border:2px solid ${selKey===k?'var(--accent)':'var(--hair)'};background:var(--surface);border-radius:12px;padding:12px 14px;cursor:pointer;font-family:var(--sans)">
      <div style="font-size:12px;font-weight:700;color:${bad&&nn?'var(--down)':'var(--muted)'}">${esc(label)}</div>
      <div style="font-size:24px;font-weight:700;color:var(--ink);line-height:1.2;font-variant-numeric:tabular-nums">${n(nn)}<span style="font-size:12px;font-weight:400;color:var(--muted)"> 건</span></div>
      <div class="ec-sub">${esc(sub)}</div></button>`;
  const zone1=`<div style="margin-top:var(--s3)"><div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px"><span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:var(--ink);color:#fff;font-size:12px;font-weight:700;text-align:center;line-height:22px">1</span><b style="font-size:14px">이카운트 입력 현황</b><span class="ec-sub" style="margin:0">방식(선수금 · 퀵 · 설치)은 이카운트에 입력돼야 알 수 있습니다</span></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${tile('rec:none','대조 안 됨',recN.none,'판매 입력 대조를 아직 안 돌린 날짜의 주문',true)}
      ${tile('rec:missing','이카운트 미입력',recN.missing,'대조 결과 이카운트에 없음 → 판매입력 필요',true)}
      ${tile('rec:ok','입력 확인됨',recN.ok,'아래 진행표로 내려갑니다',false)}
    </div></div>`;
  // ② 진행표: 세로 방식 × 가로 단계. 칸 폭 동일.
  const cell=(g,c,hold)=>{ const k=`${g.key}:${c.key}`, on=selKey===k, nn=c.rows.length, oldN=c.rows.filter(x=>ooAge(x.o.order_date)>=7).length;
    return `<td style="padding:4px;${hold?'border-left:1px dashed var(--hair)':''}"><button data-a="oocard" data-k="${esc(k)}" style="width:100%;height:64px;border:2px solid ${on?g.ink:'transparent'};background:${nn?g.color:'var(--fill)'};border-radius:10px;cursor:pointer;font-family:var(--sans);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px">
      <span style="font-size:20px;font-weight:700;color:${nn?'var(--ink)':'var(--ghost)'};line-height:1;font-variant-numeric:tabular-nums">${n(nn)}</span>
      <span class="ec-sub" style="margin:0;${oldN?'color:var(--down);font-weight:600':''}">${oldN?`7일↑ ${n(oldN)}`:'&nbsp;'}</span></button></td>`; };
  const zone2=`<div style="margin-top:var(--s5)"><div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px"><span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:var(--ink);color:#fff;font-size:12px;font-weight:700;text-align:center;line-height:22px">2</span><b style="font-size:14px">배송 진행표</b><span class="ec-sub" style="margin:0">입력 확인된 주문 · 칸을 누르면 아래에 목록</span></div>
    <div class="ec-scroll"><table style="width:100%;border-collapse:separate;border-spacing:0;min-width:760px;table-layout:fixed">
      <thead><tr><th style="width:170px;text-align:left;padding:6px 8px;font-size:12px;color:var(--muted)">방식</th>${COLS.map(([c,l],i)=>`<th style="padding:6px 4px;font-size:12px;color:var(--muted);font-weight:700">${esc(l)}${i<COLS.length-1?' <span style="color:var(--ghost)">›</span>':''}</th>`).join('')}<th style="width:110px;padding:6px 4px;font-size:12px;color:var(--muted);border-left:1px dashed var(--hair)">보류</th></tr></thead>
      <tbody>${G.map(g=>`<tr><td style="padding:4px 8px;vertical-align:middle"><div style="font-size:13px;font-weight:700;color:${g.ink}">${esc(g.title)} <span class="ec-sub" style="display:inline;margin:0">${n(g.total)}</span></div><div class="ec-sub" style="white-space:normal">${esc(g.sub)}</div></td>${g.cells.map(c=>cell(g,c,false)).join('')}${cell(g,g.hold,true)}</tr>`).join('')}</tbody></table></div></div>`;
  const groupsHtml=zone1+zone2;
  // 고른 카드의 목록
  let list=null, title='';
  if(selKey==='old'){ list=L.filter(x=>ooAge(x.o.order_date)>=7); title='7일 지남'; }
  else if(/^rec:/.test(selKey)){ const r=selKey.slice(4); list=L.filter(x=>x.rec===r); title={none:'대조 안 됨',missing:'이카운트 미입력',ok:'입력 확인됨'}[r]||''; }
  else if(selKey){ const [gk,ck]=selKey.split(/:(.*)/); const g=G.find(x=>x.key===gk), c=g&&[...g.cells,g.hold].find(x=>x.key===ck); if(c){ list=c.rows; title=`${g.title} · ${c.label}`; } }
  const q=(OO.q||'').trim().toLowerCase();
  if(list&&q) list=list.filter(x=>[x.o.order_id,...x.ls.map(l=>l.product_name+' '+(l.supplier_name||''))].join(' ').toLowerCase().includes(q));
  if(list) list=list.slice().sort((a,b)=>a.o.order_date.localeCompare(b.o.order_date));
  const sel=(a,listv,v,order,date,label)=>`<select class="ec-in" data-a="${a}" data-o="${esc(order)}" data-d="${esc(date)}" style="height:24px;font-size:11px;padding:0 4px;max-width:110px;${v?dstStyle(v):''}" aria-label="${label}"><option value="" ${!v?'selected':''}>${label} —</option>${listv.map(x=>`<option ${v===x?'selected':''}>${x}</option>`).join('')}</select>`;
  const kindPill=x=>{ const k=ooKind(x);
    if(k==='adv') return `<span class="ec-badge" style="${tagStyle('선수금')}">${esc(String(x.tags).split(' · ').find(t=>/^선수금/.test(t)&&!isLater(t))||'선수금')}</span>`;
    if(k==='ship') return `<span class="ec-badge" style="${tagStyle(x.shipTag)}">${esc(x.shipTag)}</span>`;
    return `<span class="ec-badge ec-info">일반</span>`; };
  const row=x=>{ const o=x.o, id=esc(o.order_id), dt=o.order_date, age=ooAge(dt), k=ooKind(x);
    const first=x.ls[0], more=x.ls.length-1, later=String(x.tags).split(' · ').filter(isLater);
    return `<tr style="${k==='adv'?ADV_BAR:''}${OO.detail===o.order_id?';outline:2px solid var(--accent)':''}">
      <td style="white-space:nowrap">${esc(dt.slice(5).replace('-','/'))}<div class="ec-sub" style="${age>=7?'color:var(--down);font-weight:700':''}">${age}일</div></td>
      <td><b style="font-family:ui-monospace,Menlo,monospace;font-size:12px">${id}</b></td>
      <td style="white-space:nowrap"><div style="display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap">${kindPill(x)}${k==='adv'?sel('rvast',LISTS.ast,x.nt.ast,o.order_id,dt,'진행'):k==='ship'?sel('rvdst',LISTS.dst,x.nt.dst,o.order_id,dt,'상태'):''}</div>${later.length?`<div class="ec-sub">${esc(later.join(' · '))}</div>`:''}</td>
      <td class="l" style="min-width:240px;max-width:420px"><a href="#" data-a="oodetail" data-o="${id}" style="color:var(--ink);text-decoration:none;${OO.detail===o.order_id?'font-weight:700':''}">${esc(first?first.product_name:'')}${more>0?` <span class="ec-sub" style="display:inline">외 ${more}건</span>`:''} <span class="ec-sub" style="display:inline">상세 →</span></a></td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap">${n((o.payment_amount||0)+(o.naver_point||0))}</td>
      <td><span class="ec-badge ${o.ship_status==='M'?'ec-warn':o.ship_status==='T'?'ec-ok':'ec-info'}">${esc(SS_TXT[o.ship_status]||o.ship_status||'—')}</span>${o.hook_at?`<div class="ec-sub" title="웹훅으로 받은 시각">${esc(String(o.hook_at).slice(5,16))}</div>`:''}</td>
      <td><input class="ec-in" data-a="rvmemo" data-o="${id}" data-d="${esc(dt)}" value="${esc(x.nt.memo||'')}" placeholder="메모" maxlength="200" style="width:150px;height:26px"></td>
      <td><input type="checkbox" data-a="rvdone" data-o="${id}" data-d="${esc(dt)}" aria-label="처리완료"></td></tr>`; };
  OO.cardTitle=title;
  if(OO.detail&&list) return detailCard();   // 3단계: 상세 페이지가 목록을 대신한다
  // 고른 칸의 목록은 같은 화면 아래에 붙는다(카드·진행표는 그대로 두고 아래로 내려가며 본다)
  const listHtml=list?`<div id="ooList" style="margin-top:var(--s5);padding-top:var(--s4);border-top:1px solid var(--hair)"><div class="ec-row"><b style="font-size:15px">${esc(title)} <span class="ec-sub" style="display:inline">${n(list.length)}건</span></b>
      <input class="ec-in" id="ecOoQ" value="${esc(OO.q||'')}" placeholder="주문번호·상품·공급사 검색" style="width:200px"><span style="flex:1"></span><button class="ec-dl" data-a="oocard" data-k="">목록 닫기</button></div>
    <div class="ec-scroll"><table class="ec-t" style="min-width:960px"><thead><tr><th>주문일</th><th>주문번호</th><th>구분 · 진행</th><th class="l">상품 (누르면 상세)</th><th style="text-align:right">실결제</th><th>카페24</th><th>메모</th><th>완료</th></tr></thead>
      <tbody>${list.map(row).join('')||`<tr><td colspan="8" style="color:var(--muted)">해당하는 주문이 없습니다.</td></tr>`}</tbody></table></div>
    <div class="ec-sub">줄을 누르면 주문 상세(수령인·배송지·품목·대조 결과). 선수금은 '진행', 퀵·설치·차량은 '상태'를 바꿔 가며 따라갑니다. 완료를 체크하면 목록에서 빠집니다.</div></div>`:'';
  return `<div class="ec-card"><h2>진행 중 주문 <span class="ec-sub" style="display:inline">카페24에서 배송이 안 끝난 주문 · 최근 60일 · ${n(L.length)}건${OO.at?` · ${esc(OO.at)} 기준`:''}${OO.hookAt?` · 웹훅 마지막 ${esc(String(OO.hookAt).slice(5,16))}`:''}</span>
      <span style="float:right;display:flex;gap:6px">${old?`<button class="ec-dl" data-a="oocard" data-k="old" style="color:var(--down);font-weight:700;${selKey==='old'?'outline:2px solid var(--down)':''}">7일 지남 ${n(old)}</button>`:''}<button class="ec-dl" data-a="ooreload">새로고침</button></span></h2>
    ${OO.truncated?'<div class="ec-stat err">주문이 너무 많아 일부만 받았습니다.</div>':''}
    ${groupsHtml}${listHtml}
    <details class="ec-note"><summary>설명 보기</summary><div>① 대조 안 된 주문은 판매 입력 대조를 돌리면 ②로 내려옵니다(미입력이면 데일리 전표 생성에서 판매입력 파일을 만드세요). ② 칸을 누르면 그 주문 목록, 줄을 누르면 상세. '주문 접수'는 아직 진행 단계를 고르지 않은 주문, '배송완료'는 카페24 배송완료인데 처리완료를 안 한 주문입니다. 선수금·배송방식 구분은 판매 입력 대조를 돌린 주문에만 붙고, 아직 대조 안 한 주문은 일반 주문에 나옵니다. 완료를 체크한 주문은 빠집니다.</div></details></div>`;
}
function filesCard(days,made,rows){
  return `<div class="ec-card"><h2>판매입력 파일 이력</h2>
    <p class="ec-lead">데일리 전표 생성에서 만든 이카운트 판매입력 파일이 날짜별로 남습니다. 만든 사람은 파일을 만들 때 고른 담당자(판매자)입니다. 이력은 계속 남고, 파일은 만든 날부터 400일 보관합니다.</p>
    <div class="ec-row"><label>월 <input type="month" class="ec-in" id="ecLogMonth" value="${esc(S.logMonth)}"></label>
      <span class="ec-sub" style="margin:0">${n(days.length)}일 중 <b style="color:var(--ink)">${n(made)}일</b> 파일 있음</span>
      <span style="flex:1"></span><button class="ec-dl" data-a="logreload">새로고침</button>
      <button class="go" data-a="godaily" style="height:36px">데일리 전표 생성으로</button></div>
    ${S.logErr?`<div class="ec-stat err">${esc(S.logErr.message)}</div>`:''}
    <div class="ec-scroll"><table class="ec-t" style="min-width:720px"><thead><tr><th>날짜</th><th>판매입력 파일</th><th>만든 사람</th><th>만든 시각</th><th>주문 · 행</th><th></th></tr></thead>
      <tbody>${rows||'<tr><td colspan="6" style="color:var(--muted)">이 달에는 날짜가 없습니다.</td></tr>'}</tbody></table></div></div>`;
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
  // 첫 화면은 탭 2개(Su, 2026-10-19): [진행 중 주문] / [대조 현황]. 판매입력 파일 이력은 대조 현황 아래에.
  if(S.logView==='files') S.logView='rv';
  const seg=`<div class="ec-seg" style="margin-bottom:var(--s4)"><button data-a="logview" data-v="oo" class="${S.logView!=='rv'?'on':''}">진행 중 주문</button><button data-a="logview" data-v="rv" class="${S.logView==='rv'?'on':''}">대조 현황 · 파일 이력</button></div>`;
  if(S.logView!=='rv'&&OO.card&&OO.detail){ S.root.innerHTML=openCard(); return; }   // 상세 페이지만 메인을 대신한다(목록은 메인 아래에 붙음)
  if(S.logView!=='rv'){ S.root.innerHTML=`${seg}${openCard()}`; return; }
  if(S.logView==='rv'){ S.root.innerHTML=`${seg}<div class="ec-card"><h2>대조 현황</h2>
    <p class="ec-lead">날짜별 카페24 ↔ 이카운트 대조 결과입니다(월간요약 · 날짜별 상세 · 전표입력공유). 판매 입력 대조를 돌린 날짜가 쌓이고, 메모·처리완료는 팀이 같이 봅니다.</p>${rvHtml()}</div>
    ${RV.date?'':filesCard(days,made,rows)}`; return; }
  S.root.innerHTML=`${seg}<div class="ec-card"><h2>판매입력 파일 이력</h2>
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
const LISTS={wh:WH,pre:PRE,dst:DSTS,ast:ASTS}, LIST_LABEL={wh:'출고처',pre:'고객명 앞말',dst:'배송 상태',ast:'선수금 진행'};
const applyLists=L=>{ for(const k of Object.keys(LISTS)) if(Array.isArray(L[k])&&L[k].length) LISTS[k].splice(0,LISTS[k].length,...L[k]); if(!WH.includes(D.wh)) D.wh=WH[0]; };
async function loadConf(){ try{ const d=await getJSON(`${WORKER}/ecconf`); if(d.lists) applyLists(d.lists); }catch(e){} S.confLoaded=true; }
// 목록 설정 칸 — 네 목록을 줄 단위로 고쳐 저장
function confCard(){
  if(!S.confOpen) return `<div class="ec-card" style="padding:var(--s3) var(--s5)"><button class="ec-dl" data-a="confopen">목록 설정 (출고처 · 고객명 앞말 · 배송 상태 · 선수금 진행)</button></div>`;
  return `<div class="ec-card"><h2>목록 설정</h2>
    <p class="ec-lead">한 줄에 하나씩. 저장하면 팀 모두에게 바로 적용됩니다(이미 고른 값은 그대로 남습니다).</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:var(--s3)">
      ${Object.keys(LISTS).map(k=>`<label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);font-weight:600">${LIST_LABEL[k]}
        <textarea class="ec-in" data-a="conf" data-k="${k}" rows="6" style="height:auto;padding:8px;font-size:13px;line-height:1.5">${esc(LISTS[k].join('\n'))}</textarea></label>`).join('')}
    </div>
    <div class="ec-row" style="margin-top:var(--s3)"><button class="go" data-a="confsave" style="height:34px">저장</button><button class="ec-dl" data-a="confclose">닫기</button>${S.confMsg?`<span class="ec-sub" style="margin:0">${esc(S.confMsg)}</span>`:''}</div></div>`;
}
async function saveConf(root){
  const lists={}; for(const k of Object.keys(LISTS)){ const ta=root.querySelector(`textarea[data-a="conf"][data-k="${k}"]`); lists[k]=String(ta?ta.value:'').split('\n').map(x=>x.trim()).filter(Boolean); }
  const d=await getJSON(`${WORKER}/ecconf`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lists})});
  applyLists(d.lists); S.confMsg='저장했습니다 '+new Date().toTimeString().slice(0,5);
}
const TPL=['판매일-No.','순번','판매처','판매처명','판매자','출고처','거래유형','결제유형','결제사항','결제일','배송일자','고객연락처','[택배/차량배송/설치여부] - 고객명','배송결과','배송주소','품목코드','품목명','규격','수량','에디션 No.','정가','단가','외화공급가액','공급가액','부가세','상품옵션','생산전표생성','적요'];
const D={signOn:{},made:{},date:'',orders:[],lines:{},ec:null,ecFile:'',loading:'',err:null,view:'bad',sel:{},ed:{},names:{},codes:{},seller:'',wh:WH[0],flash:null};
const kstDay=off=>new Date(Date.now()+9*3600e3+off*86400e3).toISOString().slice(0,10);
const lsGet=(k,d)=>{ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } };
const lsSet=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
const edKey=()=>`pbg_ecdaily_${D.date}`;
const ed=o=>(D.ed[o] ||= {});
function saveEd(){ lsSet(edKey(),D.ed); }   // 메모·처리완료·앞말·출고처만(이름·연락처는 저장하지 않는다)

// 결제업체·결제수단 → 이카운트 결제유형 (자사몰 판매입력 가이드 3-5p + 이카운트 실데이터)
//   2026-10-14 9~10월 실데이터로 확인: 네이버페이 카드·선불 → 12.네이버페이 · 토스페이먼츠 계좌이체(tcash) → 16. PG(무통장입금)
//   · PG 없는 무통장입금 → 6.현금영수증(계좌이체) · 적립금·쿠폰만 쓴 0원 주문 → 14. PG(카드)로 입력돼 있었다(20260910-0000275).
function payType(o){
  const m=(o.pay_methods||[]).filter(x=>!['point','coupon','credit','mileage','deposit'].includes(x));
  const main=m[0]||'', pg=String(o.pg||'').toLowerCase(), ez=String(o.easypay||'').toLowerCase();
  if(o.market==='NCHECKOUT'||/naver/.test(pg+ez)) return '12.네이버페이';
  if(/kakao/.test(pg+ez)) return '17.카카오페이';
  if(ez==='toss'||/(^|,)toss/.test(pg)) return main==='prepaid'?'27.토스페이(토스머니)':'22.토스페이(카드)';
  if(/payco/.test(pg+ez)) return main==='prepaid'?'26.페이코-페이코 포인트':'23.페이코-카드결제(간편)';
  if(/dacom|tosspayments/.test(pg)){ if(main==='card') return '14. PG(카드)'; if(['cash','tcash','virtual','icash'].includes(main)) return '16. PG(무통장입금)'; }
  if(!pg&&main==='cash') return '6.현금영수증(계좌이체)';
  if(!main&&(o.payment_amount||0)===0) return '14. PG(카드)';   // 적립금·쿠폰으로만 결제 — 실데이터에서 PG(카드)로 입력
  return '';
}
// 선수금: 주문 첫 전표에 품목 '선수금(완납)'으로 전액 → 출고·정산 때 같은 주문번호로 선수금 차감 + 상품(합계 0원) 전표가 또 생긴다.
// 예전 데일리 대사 시트 B열(선수금/설치): 이카운트 고객명 앞에 적은 선수금(발주필요)·퀵)·택배)·설치)·차량) 표기 + 선수금 품목
const SHIP_RE=/(퀵|택배|설치|차량|배송|용달|방문|픽업|직배송|직접수령)/;
function ecTags(e){
  const t=[];
  // 선수금은 전표 품목으로 본다(Su, 2026-10-14). 품목 이름 그대로 종류를 붙인다: 선수금(완납)·(계약금)·(잔금) — 실데이터 279·13·1건.
  const adv=e.find(x=>x.adv&&x.total>0)||e.find(x=>x.adv);
  if(adv){ const m=String(adv.name).match(/^선수금\s*\((완납|계약금|잔금)/); t.push(m?`선수금(${m[1]})`:'선수금'); }
  const c=(e.find(x=>x.cust)||{}).cust||'';
  const head=c.replace(/선수금\s*\([^)]*\)/,'').trim().slice(0,8), m=head.match(SHIP_RE);
  if(m&&/^[\s\[]*(퀵|택배|설치|차량|배송|용달|방문|픽업|직배송|직접수령)/.test(head)) t.push(m[1]);
  return t.join(' · ');
}
const payNo=s=>{ const m=String(s||'').match(/^\s*(\d+)\s*\./); return m?m[1]:String(s||'').replace(/\s/g,''); };
const paidOf=o=>(o.payment_amount||0)+(o.naver_point||0);
// 부분취소 주문의 남은 금액 — 카페24 결제액은 환불이 끝나면 줄어든 값, 환불 전(취소·반품 신청 중)이면 원래 값 그대로다.
//   실데이터(2026-10-14): 20260929-0000039 환불 완료 → 결제액 278,800 = 남은 상품 net. 20261011-0000132 반품 신청 → 결제액 354,460 그대로.
//   결제액이 전체 상품 net 합 이상이면 '환불 전', 아니면 결제액이 이미 환불 반영된 값(정확).
//   환불 전은 정확한 환불액을 모른다(무료배송 기준·반품 배송비). Su(2026-10-14): 기본 선택에서 빼고 '환불 대기'로 두고,
//   직접 체크하면 공급사 배송비 정책으로 남은 상품 기준 배송비를 다시 계산한 '예상' 금액을 넣는다.
//   예상 = 결제액 − 취소 상품 net + (다시 계산한 배송비 − 원래 낸 배송비). 정책을 모르면(차등·수량·무게) 배송비 그대로로 둔다.
const isExch=l=>/^E/i.test(String(l.status||''));
const SHIPPOL={};   // 공급사코드 → {type,fee,free_over}
async function loadShipPol(codes){
  const need=[...new Set(codes)].filter(c=>/^S[0-9A-Z]{7}$/.test(c)&&!(c in SHIPPOL));
  for(let i=0;i<need.length;i+=15){ const part=need.slice(i,i+15), f=D.date||kstDay(0);
    try{ const d=await getJSON(`${WORKER}/?bs=${f}&be=${f}&as=${f}&ae=${f}&tab=settleprod&suppliers=${part.join(',')}`); Object.assign(SHIPPOL,d.shipping||{}); }catch(e){ for(const c of part) SHIPPOL[c]={error:true}; } }
}
function shipFor(code,net){
  const v=SHIPPOL[code]; if(!v||v.error||v.none) return null;
  if(v.type==='T') return 0; if(v.type==='R') return v.fee; if(v.type==='M') return net>=(v.free_over||0)?0:v.fee; return null;
}
function remainOf(r){
  const paid=paidOf(r.o), canc=(r.ls||[]).filter(l=>l.canceled==='Y'&&l.paywin!=='Y'&&!isExch(l));
  if(!canc.length) return {amt:paid,mode:'none'};
  const cancNet=canc.reduce((t,l)=>t+l.net,0), liveNet=(r.live||[]).reduce((t,l)=>t+l.net,0);
  if(paid>=liveNet+cancNet-1){
    const by={}; for(const l of (r.live||[])) by[l.supplier_id]=(by[l.supplier_id]||0)+l.net;
    const fees=Object.entries(by).map(([c,v])=>shipFor(c,v)), known=fees.length>0&&fees.every(x=>x!=null);
    const oldShip=Math.max(0,(r.o.shipping_fee||0)-(r.o.shipping_discount||0)), newShip=known?fees.reduce((t,x)=>t+x,0):oldShip;
    return {amt:paid-cancNet+(newShip-oldShip),mode:'pending',orig:paid,canc:cancNet,n:canc.length,oldShip,newShip,known};
  }
  return {amt:paid,mode:'refunded',canc:cancNet,n:canc.length};
}
const exchTxt=r=>(r.ls||[]).some(isExch)?'교환 진행 중 — 교환 상품 확인':'';
const remainTxt=m=>m.mode==='pending'?`환불 전 예상: 원래 ${n(m.orig)} − 취소 ${n(m.canc)}${m.newShip!==m.oldShip?` · 배송비 ${n(m.oldShip)}→${n(m.newShip)}`:''} = ${n(m.amt)}원${m.known?'':' (배송비 정책 확인 불가 — 배송비 그대로 가정)'}`
  :m.mode==='refunded'?`부분취소 ${m.n}줄: 카페24 결제액이 이미 환불 반영된 금액(${n(m.amt)}원)`:'';
// 고객명 — 이카운트 실데이터(2026-08, 517건): 주문자=수령인이면 이름 하나, 다르면 대부분 '수령인(주문자)'(51건 중 39건). 연락처는 수령인 것.
const diffRc=o=>!!(o.buyer&&o.rc_name&&o.buyer.replace(/\s/g,'')!==o.rc_name.replace(/\s/g,''));
const custDefault=o=>diffRc(o)?`${o.rc_name}(${o.buyer})`:(o.rc_name||o.buyer||'');
const ymd=d=>d.replace(/-/g,'');

// 날짜를 빨리 바꾸면 늦게 온 이전 날짜 응답이 화면을 덮지 않게 순번(seq)으로 막는다(H3).
// 같은 달 판매입력 이력·메모는 1분 안이면 다시 받지 않는다(일괄 대조 때 날짜마다 받던 것 — 효율).
const MONTH_TTL=60e3, monthCache={};
async function monthData(ym,force){
  const c=monthCache[ym];
  if(!force&&c&&Date.now()-c.at<MONTH_TTL) return c;
  const [log,notes]=await Promise.all([
    getJSON(`${WORKER}/ecsales?month=${ym}`).then(d=>d.log||[]).catch(()=>[]),
    getJSON(`${WORKER}/ecrecon?month=${ym}`).then(d=>d.notes||{}).catch(()=>({})),
  ]);
  return (monthCache[ym]={at:Date.now(),log,notes});
}
async function loadDailyC24(){
  const f=D.date, seq=(D.seq=(D.seq||0)+1);
  D.loading=`카페24 ${f} 주문 받는 중…`; D.err=null; render();
  let d=null, err=null;
  const [res,md,sv]=await Promise.all([
    getJSON(`${WORKER}/?bs=${f}&be=${f}&as=${f}&ae=${f}&tab=orderitems&from=${f}&to=${f}&full=1&nocache=1&daily=1`).catch(e=>{ err=e; return null; }),
    monthData(f.slice(0,7)),
    S.page==='recon'?getJSON(`${WORKER}/ecrecon?date=${f}`).then(d=>d.day||null).catch(()=>null):Promise.resolve(null),
  ]);
  if(seq!==D.seq) return;   // 그사이 다른 날짜를 골랐다
  D.savedDay=sv;   // 이 날짜에 저장된 대조 결과(없으면 null) — 파일 없이 열어도 표에 채운다
  d=res;
  D.err=err; D.orders=(d&&d.orders)||[]; D.lines={};
  for(const l of ((d&&d.lines)||[])) (D.lines[l.order_id] ||= []).push(l);
  D.truncated=!!(d&&d.truncated);
  D.made={}; for(const fl of md.log) for(const id of (fl.ids||[])) (D.made[id] ||= []).push({by:fl.by,at:fl.at,filename:fl.filename});
  RV.notes={...RV.notes,...md.notes};
  D.ed=lsGet(edKey(),{}); D.names={}; D.sel={}; D.selInit=false; D.loading=''; D.reconSaved='';
  compute();
  // 환불 전 부분취소 주문이 있으면 그 공급사 배송비 정책을 받아 예상 금액을 다시 계산
  const pend=(D.rows||[]).filter(r=>r.gst==='환불 대기');
  if(pend.length){ await loadShipPol(pend.flatMap(r=>r.live.map(l=>l.supplier_id))); if(seq!==D.seq) return; compute(); }
  render();
  if(S.page==='recon'&&!D.batch) saveRecon();
}
// 대조 결과를 워커에 남긴다(대조 현황 · 엑셀용). 이카운트 파일에 그 날짜 주문이 하나도 없으면 남기지 않는다(전부 미입력으로 잘못 쌓이므로).
// 이카운트 줄 표기: 품명 ×수량 (코드). 카페24 상품명과 짝짓지 않고 각각 그대로 보여준다(Su, 2026-10-14·19).
const ecItemTxt=x=>`${x.name||'(품명 없음)'} ×${n(x.qty)}${x.code?` (${x.code})`:''}`;
const ecItemsHtml=e=>(e||[]).map(x=>`<div style="color:var(--ink-2)">${esc(x.name||'(품명 없음)')} <b>× ${n(x.qty)}</b>${x.code?` <span class="ec-sub" style="display:inline">${esc(x.code)}</span>`:''}${x.adv?' <span class="ec-badge" style="background:#F1E8FF;color:#6B3FB8">선수금</span>':''}</div>`).join('');
function reconRows(){
  return (D.rows||[]).map(r=>{ const o=r.o, ls=r.ls.length?r.ls:[];
    return {o:o.order_id,t:o.time||'',sup:[...new Set(ls.map(l=>l.supplier_name).filter(Boolean))].join(', '),
      items:ls.length?ls.map(l=>`${l.product_name}${l.option_value?' ('+optText(l.option_value)+')':''} ×${l.qty}${isExch(l)?' [교환]':l.canceled==='Y'?' [취소]':''}`).join(' / '):(r.e||[]).map(x=>`${x.name} ×${x.qty}`).join(' / '),
      tags:r.tags||'',dres:r.dres||'',dday:r.dday||'',paid:r.paid,expect:r.expect??null,ec:r.ecTot,diff:r.paid!=null&&r.ecTot!=null?r.paid-r.ecTot:null,want:r.want||'',ecPay:r.ecPay||'',st:r.st,more:r.issues.slice(1),item:r.item||'',
      codes:ls.map(l=>codeOf(l)).join(', '),eccodes:(r.e||[]).map(x=>`${x.code}×${x.qty}`).join(', '),ecitems:(r.e||[]).map(ecItemTxt).join(' / ')}; });
}
// 파일이 덮는 기간 — 이카운트 판매조회·판매현황은 '전표 날짜'로 뽑는다. 그 기간에 들어갈 주문(주말 주문 월요일 입력 고려해 시작 2일 전부터)만
// 파일에 없으면 미입력이다. 그보다 옛 주문은 이미 그 전에 입력됐을 수 있어 '파일 기간 밖'(문제 아님)으로 둔다. (2026-10-14: 옛 날짜가 전부 미입력으로 저장된 사고)
function ecRange(){ const vd=(D.ec||[]).map(r=>r.vday).filter(Boolean).sort(); return vd.length?{lo:ymdAdd(vd[0],-2),hi:vd[vd.length-1]}:null; }
function covered(date){ const R=ecRange(); if(!R) return true; const d=ymd(date); return d>=R.lo&&d<=R.hi; }
function buildSummary(rows){
  const sm={total:rows.length,missAmt:0,issues:[]};   // issues = 전표입력공유용, 짧게
  for(const r of rows){ sm[r.st]=(sm[r.st]||0)+1; if(r.st==='미입력') sm.missAmt+=r.paid||0;
    if(tracked(r.tags)) sm.tagged=(sm.tagged||0)+1;
    if(BAD_ST.includes(r.st)||tracked(r.tags)) sm.issues.push({o:r.o,tags:r.tags,dres:r.dres,dday:r.dday,st:[r.st,...(r.more||[])].join(' · '),paid:r.paid,ec:r.ec,diff:r.diff,want:r.want,ecPay:r.ecPay,sup:r.sup,items:String(r.items||'').slice(0,120)}); }
  return sm;
}
// 저장을 시작한 순간의 날짜·결과를 고정한다 — 기다리는 사이 날짜를 바꿔도 다른 날짜 이름으로 저장되지 않게(H3).
async function saveRecon(){
  if(!D.ec||!D.orders.length) return;
  const date=D.date, pre=ymd(date); if(!D.ec.some(r=>r.order.startsWith(pre))){ D.reconSaved='nodate'; return; }
  let rows=reconRows(), file=D.ecFile;
  if(!covered(date)){
    // 기간 밖 날짜: 저장된 결과가 있을 때만, 이 파일에 있는 주문 줄만 바꿔 합친다. 없으면 저장하지 않는다.
    let old=null; try{ old=(await getJSON(`${WORKER}/ecrecon?date=${date}`)).day; }catch(e){}
    if(!old){ if(D.date===date){ D.reconSaved='skip-old'; render(); } return; }
    const upd=new Map(rows.filter(r=>r.st!=='파일 기간 밖').map(r=>[r.o,r]));
    rows=old.rows.map(r=>upd.get(r.o)||r); for(const [o,r] of upd) if(!old.rows.some(x=>x.o===o)) rows.push(r);
    file=[...new Set(String(old.file||'').split(' + ').concat(D.ecFile).filter(Boolean))].join(' + ').slice(0,120);   // 같은 파일을 다시 올리면 이름을 겹쳐 적지 않는다
  }
  const sm=buildSummary(rows);
  let res; try{ res=(await getJSON(`${WORKER}/ecrecon`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,summary:sm,rows,file})})).at; }
  catch(e){ res='fail:'+e.message; }
  if(res&&!String(res).startsWith('fail')&&D.pending){ D.pending.done.add(date); D.pending.run=D.pending.run.filter(d=>d!==date); }
  if(res&&!String(res).startsWith('fail')) (D.savedDates ||= new Set()).add(date);   // 이 파일로 남긴 날짜 — '다시 올리기'·'파일 취소'가 되돌릴 범위
  if(D.date===date){ D.reconSaved=res; render(); }   // 그사이 다른 날짜로 넘어갔으면 화면 표시는 건드리지 않는다
  return res;
}
async function onDailyFile(f){
  D.err=null; D.loading='이카운트 파일 읽는 중…'; D.savedDates=new Set(); D.attached=null; D.signLearned=0; D.mapLearned=null; render();
  try{ await loadXLSX(); D.ec=parseEcount(XLSX.read(await f.arrayBuffer(),{type:'array'}),f.name,true); D.ecFile=f.name;
    try{ const k=await learnSign(D.ec); if(k) D.signLearned=k; }catch(e){} }
  catch(e){ D.err=e; D.ec=null; D.ecFile=''; D.fdates=null; D.fres={}; D.loading=''; compute(); render(); return; }   // 못 읽은 파일이면 전 파일 결과로 저장·학습하지 않는다
  D.loading=''; fileDates(); compute(); render(); saveRecon(); attachLater(); learnFromRecon();
}
// 다시 올리기 · 파일 취소(Su, 2026-10-20): 잘못 올린 이카운트 파일을 물린다.
//   그 파일로 대조 현황에 남긴 날짜 결과(D.savedDates: 이 파일로 저장 성공한 날짜, 일괄 대조 포함)를 워커 undo 로 직전 결과로 되돌린다(직전이 없던 날짜는 지운다).
//   화면의 파일·날짜 묶음·학습 안내도 비운다. 되돌리지 않는 것: 메모·처리완료, 품목코드 예비 목록(맵핑 화면에서 버린다), 이전 날짜에 붙인 반품·정산 전표 표시.
async function undoFile(){
  const dates=[...(D.savedDates||[])].sort(), name=D.ecFile, out={restored:[],removed:[],failed:[]};
  for(const dt of dates){
    try{ const r=await getJSON(`${WORKER}/ecrecon`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({undo:{date:dt}})});
      if(r.restored) out.restored.push(`${dt.slice(5)}(${r.file||'이전 결과'})`); else out.removed.push(dt.slice(5)); }
    catch(e){ out.failed.push(dt.slice(5)); }
  }
  D.ec=null; D.ecFile=''; D.fdates=null; D.fsel={}; D.fres={}; D.attached=null; D.mapLearned=null; D.signLearned=0; D.reconSaved=''; D.savedDates=new Set(); D.savedDay=null; D.pending=null;
  RV.idx=null;   // 대조 현황 월간요약을 다시 받게
  await loadPending();
  const msg=[`${name} 취소`];
  if(out.restored.length) msg.push(`이전 결과로 되돌림 ${out.restored.join(', ')}`);
  if(out.removed.length) msg.push(`대조 현황에서 지움 ${out.removed.join(', ')}`);
  if(out.failed.length) msg.push(`되돌리기 실패 ${out.failed.join(', ')}`);
  if(!dates.length) msg.push('대조 현황에 남긴 결과 없음');
  dflash(msg.join(' · '),!!out.failed.length);
  return out;
}
function undoConfirm(next){
  const nSaved=(D.savedDates||new Set()).size;
  return confirm(`${D.ecFile} 을(를) 물립니다.${next?` 그리고 ${next} 을(를) 올립니다.`:''}${nSaved?`\n\n이 파일로 대조 현황에 남긴 ${nSaved}개 날짜 결과는 직전 결과로 되돌립니다(직전 결과가 없던 날짜는 지웁니다).`:'\n\n이 파일로 대조 현황에 남긴 결과는 없습니다.'}\n메모·처리완료는 그대로 둡니다.`);
}
// 매일 올리는 대조 파일로 품목코드 맵핑을 자동 학습한다(Su, 2026-10-19: 맵핑 파일을 따로 올릴 필요 없이).
//   판매현황(품목별)만 가능(판매조회는 품목코드가 없다). 맵핑 화면과 같은 학습(1:1 → 소거 → 이름)을 돌려 '새로 연결'은 바로 저장,
//   '확인 필요'·'미연결'은 건수만 알려 준다(맵핑 화면에서 고른다). 담당자가 넣은 값은 덮어쓰지 않는다. 카페24 주문은 파일의 주문번호만 받는다.
async function learnFromRecon(){
  const rows=(D.ec||[]).filter(r=>r.code&&!r.voucher&&!r.adv);
  if(!rows.length){ D.mapLearned=null; return; }
  D.mapLearned={busy:true}; render();
  try{
    if(!S.loadedMap){ await reloadMap(); S.loadedMap=true; }
    const ids=[...new Set(rows.map(r=>r.order))];
    await loadC24Orders(ids);
    S.ecRows=rows; learn();
    const R=S.result;
    const added=await postCands(R);   // 바로 저장하지 않고 예비 목록에 쌓는다(맵핑 화면에서 확정)
    const un=R.unmatched.filter(u=>u.st==='미연결').length;
    D.mapLearned={added,wait:Object.keys(S.cand).length,un,total:Object.keys(S.map).length};
  }catch(e){ D.mapLearned={err:e.message}; }
  render();
}
// 파일 하나에 여러 날짜 — 파일 속 주문 날짜를 모아 고르게 하고 한 번에 대조·저장한다.
// 판매조회는 전표 날짜로 뽑기 때문에, 그 기간보다 옛 주문(반품·선수금 정산 전표만 든 것)은 기본으로 고르지 않는다(대조하면 전부 미입력으로 잘못 나온다).
function fileDates(){
  const cnt={}; for(const r of (D.ec||[])) cnt[r.order.slice(0,8)]=(cnt[r.order.slice(0,8)]||0)+1;
  const orders={}; for(const r of (D.ec||[])) (orders[r.order.slice(0,8)] ||= new Set()).add(r.order);
  // 주말 주문은 월요일 전표로 들어가니 전표 기간 시작 2일 전 주문까지 포함
  const inR=d=>covered(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`);
  D.fdates=Object.keys(cnt).sort().reverse().map(d=>({d:`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`,n:orders[d].size,inR:inR(d)}));
  D.fsel={}; for(const x of D.fdates) if(x.inR&&x.d<=kstDay(0)) D.fsel[x.d]=true;
  D.fres={};
}
async function runBatch(){
  const ds=Object.keys(D.fsel||{}).filter(d=>D.fsel[d]).sort();
  if(!ds.length) return;
  D.batch=true; D.fres={};
  try{
    const old=ds.filter(d=>!(D.fdates||[]).find(x=>x.d===d&&x.inR));
    if(old.length&&!confirm(`전표 기간보다 옛 주문 날짜 ${old.length}개가 포함돼 있습니다(${old.slice(0,5).map(d=>d.slice(5)).join(', ')}${old.length>5?' …':''}).\n이 날짜들은 파일에 있는 주문(반품·정산 전표 등)만 대조합니다. 그 날짜에 저장된 결과가 있으면 그 주문 줄만 바뀌고, 없으면 저장하지 않습니다.\n\n진행할까요?`)) return;
    for(const [i,dt] of ds.entries()){
      D.date=dt; D.batchMsg=`${i+1}/${ds.length} · ${dt} 대조 중…`; await loadDailyC24(); await saveRecon();
      const R=D.rows||[], st={}; for(const r of R) st[r.st]=(st[r.st]||0)+1;
      D.fres[dt]={saved:D.reconSaved,st};
    }
  }finally{ D.batch=false; D.batchMsg=''; }
  render();
}
// 파일 속 '이전 날짜 주문'의 반품·선수금 정산 전표를 그 주문일에 저장된 대조 결과에 붙인다(저장된 날짜만, 같은 표시는 한 번만).
async function attachLater(){
  if(!D.ec) return;
  const by={}; for(const r of D.ec) (by[r.order] ||= []).push(r);
  const attach=[];
  for(const [o,rs] of Object.entries(by)){
    const od=`${o.slice(0,4)}-${o.slice(4,6)}-${o.slice(6,8)}`; if(od===D.date) continue;
    const days=[...new Set(rs.map(r=>r.vday).filter(v=>v&&v>o.slice(0,8)))];   // 주문일 뒤 날짜의 전표
    for(const d of days){ const g=rs.filter(r=>r.vday===d), t=g.reduce((a,r)=>a+r.total,0);
      const kind=t<0?'반품':g.some(r=>r.adv)&&t===0?'선수금 정산':''; if(kind) attach.push({date:od,order:o,tag:`${kind} 전표 ${vdLabel(d)}`}); }
  }
  if(!attach.length) return;
  try{ const d=await getJSON(`${WORKER}/ecrecon`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attach})}); D.attached=d.attached||[]; }
  catch(e){ D.attached=[]; }
  render();
}

// 주문별 대조 결과
function compute(){
  const pre=ymd(D.date||'');
  // 선수금 주문은 같은 주문번호로 전표가 두 번 이상 생긴다(주문일: 선수금 품목 전액, 출고·정산 때: 선수금 차감 + 상품 = 0원 또는 반품 마이너스).
  // 금액은 그 주문번호 전표를 '모두' 합쳐 맞춘다. 8월 실데이터: 전표 2장 이상인 주문 24건은 분할 출고(8/1+8/4)·0원 뒤 재입력이었고
  // 합쳐야 카페24 실결제와 맞았다. 선수금 정산 전표는 0원이라 합쳐도 같다. 첫 전표 뒤 날짜 전표는 '이후 전표'로 표시만 한다.
  // (주말 주문은 월요일 전표로 들어가 주문일 ≠ 전표일이 흔하다 — 8월 227줄. 전표일로 거르지 않는다.)
  const ecBy={}, later={};
  for(const r of (D.ec||[])) if(r.order.startsWith(pre)) (ecBy[r.order] ||= []).push(r);
  // 같은 주문번호로 나중 날짜에 들어간 전표 — 종류를 붙여 보여준다: 반품(합계 마이너스) · 선수금 정산(선수금 품목) · 추가(분할 출고 등)
  for(const [k,rs] of Object.entries(ecBy)){
    const days=[...new Set(rs.map(r=>r.vday).filter(Boolean))].sort();
    if(days.length<2) continue;
    later[k]=days.slice(1).map(d=>{ const g=rs.filter(r=>r.vday===d), t=g.reduce((a,r)=>a+r.total,0);
      return `${t<0?'반품':g.some(r=>r.adv)?'선수금 정산':'추가'} 전표 ${vdLabel(d)}`; });
  }
  const out=[];
  for(const o of D.orders){
    const ls=(D.lines[o.order_id]||[]);
    // 워커는 교환(E…)도 canceled=Y 로 준다. 교환은 결제가 그대로인 판매라 판매 줄로 남긴다(9/29-0000282 E00 확인).
    const live=ls.filter(l=>l.paywin!=='Y'&&(l.canceled!=='Y'||isExch(l)));
    const e=ecBy[o.order_id]||null, paid=paidOf(o), want=payType(o);
    const lt=later[o.order_id]||[];
    const uq=k=>e?[...new Set(e.map(x=>x[k]).filter(Boolean))].join(' / '):'';
    const r={o,ls,live,e,paid,want,later:lt,dres:uq('dres'),dday:uq('dday'),tags:[e?ecTags(e):'',...lt].filter(Boolean).join(' · '),ecTot:e?e.reduce((t,x)=>t+x.total,0):null,ecPay:e?([...new Set(e.map(x=>x.pay).filter(Boolean))].join(', ')):'',adv:e?e.some(x=>x.adv):false,issues:[],item:''};
    const unmapped=live.filter(l=>!codeOf(l));
    if(o.paid!=='Y') r.st='입금대기';
    else if(o.canceled==='Y'||!live.length&&ls.some(l=>l.canceled==='Y')) r.st=e?'취소 확인':'취소';
    else if(ls.length&&ls.every(l=>l.paywin==='Y')) r.st='개인결제창';
    r.gst=r.st||(D.made[o.order_id]?'파일 있음':remainOf({o,ls,live}).mode==='pending'?'환불 대기':'새 주문');
    if(!r.st){
      if(!D.ec){
        // 파일은 없지만 이 날짜에 저장된 대조 결과가 있으면 그 값을 보여준다(대조 현황과 같은 내용). 다시 대조하려면 파일을 올린다.
        const sv=D.savedDay&&(D.savedDay.rows||[]).find(x=>x.o===o.order_id);
        if(sv){ r.st=sv.st; r.ecTot=sv.ec; r.ecPay=sv.ecPay||''; r.tags=sv.tags||''; r.issues=[sv.st,...(sv.more||[])].filter(x=>BAD_ST.includes(x)||x!==sv.st); r.item=sv.item||''; r.expect=sv.expect??null; r.dres=sv.dres||''; r.dday=sv.dday||''; r.fromSaved=true; }
        else r.st=D.savedDay?'미입력':'대조 전';
      }
      // 파일 기간 밖 날짜는 그 주문의 원래 전표가 파일에 없을 수 있다(나중 반품·정산 전표만 있음) → 금액·품목을 판단하지 않는다.
      //   반품·정산 표시는 tags 로 남고, 저장된 결과에는 attachLater 가 붙인다.
      else if(!covered(D.date)) r.st='파일 기간 밖';
      else if(!e) r.st='미입력';
      else{
        // 환불이 끝난 부분취소는 카페24 결제액이 이미 줄어 있고 이카운트도 반품 전표가 합쳐져 그대로 비교하면 맞는다(9/29 0039 등 확인).
        // 환불 전(취소·반품 신청만)은 결제액이 원래 값이라 '예상 남은 금액'과 비교하고, 달라도 금액불일치가 아니라 '환불 대기 확인'으로 둔다.
        const rm=remainOf({o,ls,live}); r.expect=rm.mode==='pending'?rm.amt:null;
        if(r.expect!=null){ if(Math.abs(r.expect-r.ecTot)>1) r.issues.push('환불 대기 확인'); }
        else if(Math.abs(paid-r.ecTot)>1) r.issues.push('금액불일치');
        if(want&&r.ecPay&&payNo(want)!==payNo(r.ecPay)) r.issues.push('결제유형 확인');
        else if(!want) r.issues.push('결제유형 확인');
        if(r.adv) r.item='선수금';
        else if(e.some(x=>x.voucher)){   // 판매조회(전표 단위) — 품목코드가 없어 수량 합계만 본다(사인지 줄이 있으면 이카운트가 더 많다)
          const cq=live.reduce((t,l)=>t+l.qty,0), eq=e.reduce((t,x)=>t+x.qty,0);
          r.item=cq===eq?'수량 일치':eq>cq?`이카운트 수량 ${eq} (카페24 ${cq}) — 사인지 등 확인`:`수량 부족: 이카운트 ${eq} / 카페24 ${cq}`;
          if(eq<cq) r.issues.push('품목·수량 불일치');
        }
        else if(unmapped.length) r.item=`맵핑 없음 ${unmapped.length}`;
        else{
          const C={},E={}; for(const l of live){ const c=codeOf(l); C[c]=(C[c]||0)+l.qty; } for(const x of e) if(!isSignRow(x)) E[x.code]=(E[x.code]||0)+x.qty;
          const same=Object.keys(C).length===Object.keys(E).length&&Object.keys(C).every(c=>E[c]===C[c]);
          r.item=same?'일치':'불일치'; if(!same) r.issues.push('품목·수량 불일치');
        }
        // 부분취소·반품: 카페24 실결제금액은 그대로이고 이카운트는 반품 전표가 따로 들어간다 → 금액이 다른 이유를 같이 보여준다
        const pc=ls.filter(l=>l.canceled==='Y'&&!isExch(l));
        if(ls.some(isExch)) r.item=(r.item&&r.item!=='일치'&&r.item!=='수량 일치'?r.item+' · ':'')+'교환 진행 중';
        if(pc.length){ const ds=[...new Set(pc.map(l=>(l.cancel_done||l.cancel_req||'').slice(5).replace('-','/')).filter(Boolean))];
          const note=`부분취소·반품 ${pc.length}줄${ds.length?' '+ds.join(', '):''}`; if(r.issues.length) r.issues.push(note); else r.item=(r.item&&r.item!=='일치'&&r.item!=='수량 일치'?r.item+' · ':'')+note; }
        r.st=r.issues.length?r.issues[0]:'정상';
      }
    }
    out.push(r);
  }
  // 이카운트에만 있는 주문
  const seen=new Set(D.orders.map(o=>o.order_id));
  for(const [k,e] of Object.entries(ecBy)) if(!seen.has(k)) out.push({o:{order_id:k},ls:[],live:[],e,paid:null,want:'',later:[],tags:ecTags(e),ecTot:e.reduce((t,x)=>t+x.total,0),ecPay:[...new Set(e.map(x=>x.pay))].join(', '),issues:[],st:'카페24에 없음',item:''});
  D.rows=out;
  // 처음 열 때 아직 판매입력 파일에 안 넣은 정상 결제 주문을 고른다
  if(!D.selInit&&D.orders.length){ for(const r of out) if(r.gst==='새 주문') D.sel[r.o.order_id]=true; D.selInit=true; }
}
function signOn(l){ const k=l.variant_code||String(l.product_no); return k in D.signOn?D.signOn[k]:!!(S.sign||{})[codeOf(l)]; }
function codeOf(l){ const k=l.variant_code||String(l.product_no); return D.codes[k]||(S.map[k]&&S.map[k].code)||''; }
const BAD_ST=['미입력','금액불일치','환불 대기 확인','결제유형 확인','품목·수량 불일치','취소 확인','카페24에 없음'];
// 선수금(보라) · 배송방식(청록) · 이후 전표(회색) — 선수금·배송방식 주문은 진행 상황을 메모로 따라간다(Su, 2026-10-14)
const isLater=x=>/ 전표 \d\d\/\d\d$/.test(x);
const tagStyle=x=>isLater(x)?(/^반품/.test(x)?'background:#FFF3E0;color:#C25E00':'background:var(--fill);color:var(--muted)'):/^선수금/.test(x)?'background:#F1E8FF;color:#6B3FB8':'background:#E0F7F4;color:#00796B';
const tagHtml=t=>t?String(t).split(' · ').map(x=>`<span class="ec-badge" style="${tagStyle(x)};margin:1px">${esc(x)}</span>`).join('<br>'):'<span style="color:var(--ghost)">—</span>';
const tracked=t=>String(t||'').split(' · ').some(x=>x&&!isLater(x));   // 선수금·배송방식이 있는 주문
// 행 색: 선수금만 옅은 빨강(배송방식은 뱃지로만) — Su, 2026-10-14
const hasAdv=t=>String(t||'').split(' · ').some(x=>/^선수금(?! 정산)/.test(x));
const ADV_BAR='box-shadow:inset 4px 0 0 #9B6BD6';   // 선수금 행 표시 — 행 전체 색 대신 왼쪽 보라 띠(빨강은 '문제'로 읽혀서)
const rowBg=(t,done)=>done?'opacity:.55':hasAdv(t)?ADV_BAR:'';
// 유형 필터·정렬 (판매 입력 대조 · 대조 현황 표 공통)
const TF={type:'all',sort:'type'};
const kinds=t=>{ const k=new Set(); for(const x of String(t||'').split(' · ').filter(Boolean)){ if(isLater(x)) k.add(/^반품/.test(x)?'ret':'later'); else if(/^선수금/.test(x)) k.add('adv'); else k.add('ship'); } return k; };
const stOf=st=>String(st||'').split(' · ')[0];
const TYPES=[['all','전체'],['adv','선수금'],['ship','배송방식'],['ret','반품 전표'],['later','정산·추가 전표'],['bad','문제 주문'],['none','표시 없음']];
function tfApply(list,g){   // g = r=>({tags,st,id})
  const f=list.filter(r=>{ const x=g(r), k=kinds(x.tags);
    return TF.type==='all'||(TF.type==='bad'?BAD_ST.includes(stOf(x.st)):TF.type==='none'?!k.size:k.has(TF.type)); });
  const rank=x=>{ const k=kinds(x.tags); return k.has('adv')?0:k.has('ship')?1:k.has('ret')?2:k.has('later')?3:4; };
  const so=x=>{ const i=ST_ORDER.indexOf(stOf(x.st)); return i<0?99:i; };
  return f.sort((a,b)=>{ const A=g(a),B=g(b);
    if(TF.sort==='type') return rank(A)-rank(B)||so(A)-so(B)||String(A.id).localeCompare(String(B.id));
    if(TF.sort==='st') return so(A)-so(B)||rank(A)-rank(B)||String(A.id).localeCompare(String(B.id));
    return String(A.id).localeCompare(String(B.id)); });
}
function tfBar(list,g){
  const c={}; for(const r of list){ const x=g(r), k=kinds(x.tags); c.all=(c.all||0)+1; for(const v of k) c[v]=(c[v]||0)+1; if(!k.size) c.none=(c.none||0)+1; if(BAD_ST.includes(stOf(x.st))) c.bad=(c.bad||0)+1; }
  return `<div class="ec-row" style="margin-top:var(--s3)"><span class="ec-sub" style="margin:0">유형</span>
    <div class="ec-seg">${TYPES.map(([v,l])=>`<button data-a="tftype" data-v="${v}" class="${TF.type===v?'on':''}">${l} ${n(c[v]||0)}</button>`).join('')}</div>
    <label>정렬 <select class="ec-in" id="ecTfSort">${[['type','유형순'],['st','상태순'],['id','주문번호순']].map(([v,l])=>`<option value="${v}" ${TF.sort===v?'selected':''}>${l}</option>`).join('')}</select></label></div>`;
}
const stCls=st=>{ st=String(st||'').split(' · ')[0]; return st==='정상'?'ec-ok':BAD_ST.includes(st)?'ec-bad':st==='대조 전'?'ec-info':'ec-warn'; };

// ---------- 판매입력 양식 ----------
// 줄 금액 = 상품별 할인 후 금액 + (주문 실결제금액 − 그 합)을 비율로 나눈 몫. 끝 줄이 나머지 → 줄 합계 = 실결제금액.
function buildRows(){
  const rows=[], miss=[], orders=[];
  let seq=0;
  for(const r of (D.rows||[])){
    const o=r.o; if(!D.sel[o.order_id]||!r.live.length) continue;
    seq++; orders.push(o.order_id);
    const E=ed(o.order_id), wh=E.wh||D.wh, preTxt=(E.pre||'').trim();
    const nm=D.names[o.order_id]??custDefault(o);
    const cust=preTxt?`${preTxt}${/[\s]$/.test(preTxt)?'':' '}${nm}`:nm;
    const tot=remainOf(r).amt, base=r.live.reduce((t,l)=>t+l.net,0);   // 부분취소면 남은 금액만 나눈다
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
  // 만들기 직전에 이 달 이력을 새로 읽어, 그사이 다른 사람이 이미 파일에 넣은 주문이 있는지 본다(중복 입력 방지 — M2)
  const fresh=await monthData(D.date.slice(0,7),true), dup=[];
  for(const fl of fresh.log) for(const id of (fl.ids||[])) if(orders.includes(id)&&!dup.some(x=>x.id===id)) dup.push({id,by:fl.by,at:fl.at});
  if(dup.length&&!confirm(`이미 다른 판매입력 파일에 들어간 주문이 ${dup.length}건 있습니다:\n${dup.slice(0,6).map(x=>`· ${x.id} (${x.by||'?'} ${x.at})`).join('\n')}${dup.length>6?'\n…':''}\n\n그래도 같이 넣을까요? (취소하면 아무것도 만들지 않습니다)`)) return;
  const noPay=(D.rows||[]).filter(r=>D.sel[r.o.order_id]&&r.live.length&&!r.want).length;
  const partial=(D.rows||[]).filter(r=>D.sel[r.o.order_id]&&r.live.length&&remainOf(r).mode==='pending');
  const newCodes=Object.entries(D.codes).filter(([k,c])=>c&&(!S.map[k]||S.map[k].code!==c));
  if(!confirm(`${D.date} 판매입력 파일을 만듭니다.\n주문 ${orders.length}건 · ${rows.length}행 · 판매자 ${D.seller}`+(newCodes.length?`\n\n직접 넣은 품목코드 ${newCodes.length}건은 품목코드 맵핑에도 저장합니다.`:'')+(partial.length?`\n\n⚠ 환불 전 부분취소 주문 ${partial.length}건은 예상 금액으로 넣습니다(환불이 끝나면 카페24 금액과 다를 수 있음):\n${partial.slice(0,5).map(r=>`· ${r.o.order_id} ${remainTxt(remainOf(r))}`).join('\n')}`:'')+(noPay?`\n\n결제유형을 정할 수 없는 주문 ${noPay}건은 결제유형 칸이 비어 있습니다 — 이카운트에서 넣어 주세요.`:'')+`\n\n만든 파일은 판매입력 파일 이력에 남습니다.`)) return;
  await loadXLSX();
  const ws=XLSX.utils.aoa_to_sheet([TPL,...rows]);
  ws['!cols']=TPL.map((h,i)=>({wch:[12,5,12,12,8,14,14,22,8,18,10,14,20,8,30,14,40,8,6,8,10,10,8,10,10,24,8,8][i]||10}));
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'판매입력');
  const b64=XLSX.write(wb,{type:'base64',bookType:'xlsx'});
  const filename=`판매입력_${ymd(D.date)}_${D.seller.trim()}.xlsx`;
  saveB64(b64,filename);   // 내려받기 먼저(보관이 실패해도 파일은 손에 남게)
  const msgs=[];
  try{ await getJSON(`${WORKER}/ecsales`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dates:[D.date],by:D.seller.trim(),orders:orders.length,rows:rows.length,filename,b64,ids:orders})}); msgs.push('판매입력 파일 이력에 남겼습니다');
    const at=new Date(Date.now()+9*3600e3).toISOString().slice(0,16).replace('T',' ');
    for(const id of orders){ (D.made[id] ||= []).push({by:D.seller.trim(),at,filename}); delete D.sel[id]; }
    delete monthCache[D.date.slice(0,7)]; }   // 다음에 이 달을 열 때 새 이력을 받게
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

const wdOf=ds=>'일월화수목금토'[new Date(ds+'T00:00:00').getDay()];
// 대조 이력이 없는 지난 날짜(어제부터 거슬러 최대 14일)를 버튼으로 — 주말·공휴일 다음 영업일에 그 날짜들이 다 보인다(Su, 2026-10-14).
// 대조 현황(월간요약)에 그 날짜가 있으면 '대조됨'. 판매 입력 대조 화면에서만 쓴다.
async function loadPending(){
  const days=[]; for(let i=1;i<=14;i++) days.push(kstDay(-i));
  const months=[...new Set(days.map(d=>d.slice(0,7)))], done=new Set();
  await Promise.all(months.map(async ym=>{ try{ const d=await getJSON(`${WORKER}/ecrecon?month=${ym}`); for(const k of Object.keys(d.idx||{})) done.add(k); }catch(e){} }));
  const pend=days.filter(d=>!done.has(d));
  // 미대조가 연속으로 이어진 구간만 보여준다(오래된 것 하나가 빠졌다고 2주 전까지 늘어놓지 않게). 없으면 어제.
  const run=[]; for(const d of days){ if(done.has(d)) break; run.push(d); }
  D.pending={run:run.length?run:[kstDay(-1)],done};
}
function dateRow(withFile){
  const P=D.pending||{run:[kstDay(-1)],done:new Set()};
  const quick=[...new Set([...P.run,...[1,2,3].map(i=>kstDay(-i))])].sort().reverse().slice(0,10);
  return `<div class="ec-row">
      <label>날짜 <input type="date" class="ec-in" id="ecdDate" value="${esc(D.date)}" max="${kstDay(0)}"></label>
      <div class="ec-seg">${quick.map(d=>{ const dn=P.done.has(d); return `<button data-a="qdate" data-d="${d}" class="${D.date===d?'on':''}" style="${dn?'color:var(--muted)':'font-weight:700'}">${d===kstDay(-1)?'어제 ':''}${d.slice(5).replace('-','/')} (${wdOf(d)})${dn?' ✓':''}</button>`; }).join('')}</div>
      ${withFile&&P.run.length>1?`<span class="ec-sub" style="margin:0">대조 안 한 날짜 ${n(P.run.length)}일</span>`:''}
      ${withFile?`<span class="go ec-file" style="height:36px">이카운트 판매현황 올리기<input type="file" id="ecdFile" accept=".xlsx,.xls" aria-label="이카운트 판매현황 파일"></span>
      ${D.ecFile?`<span class="ec-sub" style="margin:0">올린 파일 <b style="color:var(--ink)">${esc(D.ecFile)}</b> · ${ymd(D.date)} 주문 ${n(new Set((D.ec||[]).filter(r=>r.order.startsWith(ymd(D.date))).map(r=>r.order)).size)}건</span>
      <span class="ec-dl ec-file" style="display:inline-flex;align-items:center" title="파일을 잘못 올렸을 때 — 이 파일로 남긴 대조 결과를 되돌리고 다른 파일을 올립니다">다시 올리기<input type="file" id="ecdReFile" accept=".xlsx,.xls" aria-label="이카운트 판매현황 다시 올리기"></span>
      <button class="ec-dl" data-a="ecundo" title="이 파일을 물리고 남긴 대조 결과를 되돌립니다">파일 취소</button>`:''}`:''}
      <span style="flex:1"></span><button class="ec-dl" data-a="dreload">카페24 다시 받기</button></div>
    ${D.loading?`<div class="ec-stat">${esc(D.loading)}</div>`:''}
    ${D.err?`<div class="ec-stat err">${esc(D.err.message||D.err)}</div>`:''}
    ${D.signLearned&&withFile?`<div class="ec-stat">이카운트 파일에서 사인지가 붙는 에디션 ${n(D.signLearned)}개를 새로 배웠습니다.</div>`:''}
    ${withFile&&D.mapLearned?(D.mapLearned.busy?`<div class="ec-stat">이 파일로 품목코드 맵핑 배우는 중…</div>`:D.mapLearned.err?`<div class="ec-stat err">맵핑 학습 실패: ${esc(D.mapLearned.err)}</div>`
      :`<div class="ec-stat">품목코드 맵핑: 이 파일에서 짝 <b>${n(D.mapLearned.added)}건</b>을 예비 목록에 올렸습니다 · 확정 대기 ${n(D.mapLearned.wait)}건${D.mapLearned.un?` · 미연결 ${n(D.mapLearned.un)}건`:''} (대응표 ${n(D.mapLearned.total)}건) — <a href="#" data-a="gomap" style="color:var(--accent)">품목코드 맵핑에서 확정하기</a></div>`):''}
    ${D.truncated?'<div class="ec-stat err">카페24 주문이 너무 많아 일부만 받았습니다.</div>':''}
    ${D.flash?`<div class="ec-stat" style="position:sticky;top:8px;z-index:5;background:${D.flash.bad?'var(--down-soft)':'var(--up-soft)'};color:${D.flash.bad?'var(--down)':'var(--up)'};border-radius:8px;padding:8px 12px;font-weight:600">${esc(D.flash.msg)}</div>`:''}`;
}
const kpi=(l,v,cls)=>`<div class="ec-kpi"><div class="l">${l}</div><div class="n ${cls||''}">${v}</div></div>`;
const itemsHtml=r=>r.ls.map(l=>{ const c=codeOf(l), off=(l.canceled==='Y'&&!isExch(l))||l.paywin==='Y';
  return `<div style="${off?'text-decoration:line-through;color:var(--ghost)':''}">${esc(l.product_name)}${l.option_value?` <span class="ec-sub" style="display:inline">${esc(optText(l.option_value))}</span>`:''} × ${n(l.qty)}
    <span class="ec-sub" style="display:inline">${c?esc(c):'<span style="color:var(--down)">코드 없음</span>'}</span></div>`; }).join('');
function initDate(){ if(!D.date){ D.date=kstDay(-1); D.seller=lsGet('pbg_ecdaily_seller',''); } }

// 데일리 전표 생성 — 이카운트 파일 없이 카페24 주문으로 판매입력 파일을 만든다
function renderDaily(){
  initDate();
  const R=(D.rows||[]).filter(r=>r.ls.length), cnt={}; for(const r of R) cnt[r.gst]=(cnt[r.gst]||0)+1;
  const views=[['new','새 주문',cnt['새 주문']||0],['wait','환불 대기',cnt['환불 대기']||0],['made','파일 있음',cnt['파일 있음']||0],['etc','취소·입금대기 등',(cnt['취소']||0)+(cnt['입금대기']||0)+(cnt['개인결제창']||0)],['all','전체',R.length]];
  const gv=['new','wait','made','etc','all'].includes(D.gview)?D.gview:'new';
  const list=gv==='all'?R:gv==='new'?R.filter(r=>r.gst==='새 주문'):gv==='wait'?R.filter(r=>r.gst==='환불 대기'):gv==='made'?R.filter(r=>r.gst==='파일 있음'):R.filter(r=>['취소','입금대기','개인결제창'].includes(r.gst));
  const nSel=R.filter(r=>D.sel[r.o.order_id]&&r.live.length).length;
  const rowsHtml=list.map(r=>{
    const o=r.o, id=esc(o.order_id), mf=D.made[o.order_id];
    return `<tr><td><input type="checkbox" data-a="sel" data-o="${id}" ${D.sel[o.order_id]?'checked':''} ${r.live.length?'':'disabled'} aria-label="판매입력에 넣기"></td>
      <td><b>${id}</b><div class="ec-sub">${esc(o.time||'')}</div>${diffRc(o)?'<span class="ec-badge ec-warn">주문자≠수령인</span>':''}</td>
      <td class="l" style="min-width:280px">${itemsHtml(r)}</td>
      <td>${(()=>{ const m=remainOf(r); return m.mode==='pending'?`<s style="color:var(--muted)">${n(m.orig)}</s><br><b>${n(m.amt)}</b><div><span class="ec-badge ec-warn">환불 전 예상</span></div>`:`${n(r.paid)}${m.mode==='refunded'?'<div><span class="ec-badge ec-warn">부분취소·환불됨</span></div>':''}`; })()}${exchTxt(r)?'<div><span class="ec-badge ec-warn">교환</span></div>':''}${o.naver_point?`<div class="ec-sub">네이버포인트 ${n(o.naver_point)}</div>`:''}</td>
      <td style="${r.want?'':'color:var(--down)'}">${esc(r.want||'(정할 수 없음)')}</td>
      <td><span class="ec-badge ${r.gst==='새 주문'?'ec-ok':r.gst==='파일 있음'?'ec-info':'ec-warn'}">${esc(r.gst)}</span>${r.gst==='환불 대기'?'<div class="ec-sub" style="white-space:normal;max-width:160px">카페24 환불이 끝나면 정확한 금액으로 바뀝니다. 급하면 체크(예상 금액)</div>':''}${mf?`<div class="ec-sub">${mf.map(f=>`${esc(f.by||'')} ${esc(f.at.slice(5))}`).join('<br>')}</div>`:''}</td></tr>`;
  }).join('');
  S.root.innerHTML=`<div class="ec-card"><h2>데일리 전표 생성</h2>
    <p class="ec-lead">날짜를 고르면 그날 카페24 주문을 받습니다. 체크한 주문으로 이카운트 판매입력 엑셀을 만듭니다(이카운트 파일은 필요 없음).
      이미 판매입력 파일에 넣은 주문은 '파일 있음', 부분취소인데 카페24 환불이 아직 안 끝난 주문은 '환불 대기'로 표시되고 기본으로 빠집니다. 입력이 잘 됐는지는 <a href="#" data-a="gorecon">판매 입력 대조</a>에서 확인하세요.</p>
    ${dateRow(false)}
    <div class="ec-kpis" style="grid-template-columns:repeat(4,1fr)">
      ${kpi('카페24 주문',n(R.length)+'건')}${kpi('새 주문 (파일 없음)',n(cnt['새 주문']||0)+'건',cnt['새 주문']?'warn':'ok')}${kpi('파일 있음',n(cnt['파일 있음']||0)+'건')}${kpi('고른 주문',n(nSel)+'건')}
    </div>
    <div class="ec-row"><div class="ec-seg">${views.map(([v,l,c])=>`<button data-a="gview" data-v="${v}" class="${gv===v?'on':''}">${l} ${n(c)}</button>`).join('')}</div>
      <span style="flex:1"></span><button class="ec-dl" data-a="selall">이 목록 모두 고르기</button><button class="ec-dl" data-a="selnone">모두 빼기</button></div>
    <div class="ec-scroll"><table class="ec-t" style="min-width:900px"><thead><tr><th>판매입력</th><th>주문번호</th><th>상품 · 품목코드</th><th>실결제</th><th>결제유형</th><th>상태</th></tr></thead>
      <tbody>${rowsHtml||`<tr><td colspan="6" style="color:var(--muted)">${D.loading?'':'해당하는 주문이 없습니다.'}</td></tr>`}</tbody></table></div>
    <details class="ec-note"><summary>설명 보기</summary><div>실결제 = PG 결제금액(적립금 제외) + 네이버페이 포인트 · 결제유형은 결제업체(토스페이먼츠·토스페이·카카오페이·페이코·네이버페이)와 결제수단으로 정합니다 · 품목코드는 품목코드 맵핑 기준.</div></details></div>`
    +formCard()+confCard();
}

// 판매 입력 대조 — 이카운트에서 받은 판매현황으로 카페24 주문을 맞춰 본다
function renderRecon(){
  initDate();
  // 파일을 올리기 전에도 카페24 주문을 먼저 보여준다(상태 '대조 전'). 파일을 올리면 같은 표에 이카운트 합계·차액·상태가 채워진다(Su, 2026-10-14).
  const R=D.rows||[], cnt={}; for(const r of R) cnt[r.st]=(cnt[r.st]||0)+1;
  const bad=R.filter(r=>BAD_ST.includes(r.st)&&!(RV.notes[r.o.order_id]||{}).done).length;
  const has=D.ec||D.savedDay;
  const views=has?[['bad','확인할 것',bad],['all','전체',R.length],['미입력','미입력',cnt['미입력']||0],['정상','정상',cnt['정상']||0],['etc','취소·입금대기·기간 밖',(cnt['취소']||0)+(cnt['입금대기']||0)+(cnt['개인결제창']||0)+(cnt['파일 기간 밖']||0)]]
    :[['all','전체',R.length],['etc','취소·입금대기 등',(cnt['취소']||0)+(cnt['입금대기']||0)+(cnt['개인결제창']||0)]];
  if(!has&&D.view!=='etc') D.view='all';
  let list=R;
  if(D.view==='bad') list=R.filter(r=>BAD_ST.includes(r.st));
  else if(D.view==='etc') list=R.filter(r=>['취소','입금대기','개인결제창','파일 기간 밖'].includes(r.st));
  else if(D.view!=='all') list=R.filter(r=>r.st===D.view);
  const rg=r=>({tags:r.tags,st:r.st,id:r.o.order_id}), stList=list;
  list=tfApply(list,rg);
  const rowsHtml=list.map(r=>{
    const o=r.o, id=esc(o.order_id);
    const items=r.ls.length?`<div class="ec-sub" style="margin:0 0 2px">카페24</div>${itemsHtml(r)}`:'';
    const ecItems=r.e?`<div class="ec-sub" style="margin:6px 0 2px;padding-top:4px;border-top:1px dashed var(--hair)">이카운트</div>${ecItemsHtml(r.e)}`:'';
    const diff=r.paid!=null&&r.ecTot!=null?r.paid-r.ecTot:null;
    const payBad=r.issues.includes('결제유형 확인'), mf=D.made[o.order_id];
    return `<tr style="${rowBg(r.tags,(RV.notes[o.order_id]||{}).done)}">
      <td><b>${id}</b><div class="ec-sub">${esc(o.time||'')}</div></td>
      <td>${tagCell(r.tags,o.order_id,D.date,r)}</td>
      <td class="l" style="min-width:260px">${items}${ecItems}${r.item&&r.item!=='일치'?`<div class="ec-sub">${esc(r.item)}</div>`:''}</td>
      <td>${r.paid!=null?n(r.paid):'—'}${o.naver_point?`<div class="ec-sub">네이버포인트 ${n(o.naver_point)}</div>`:''}${r.expect!=null?`<div class="ec-sub" style="color:var(--down)">환불 전 예상 ${n(r.expect)}</div>`:''}</td>
      <td>${r.ecTot!=null?n(r.ecTot):'—'}</td>
      <td style="${diff?'color:var(--down);font-weight:700':''}">${diff==null?'—':n(diff)}${r.expect!=null&&r.ecTot!=null?`<div class="ec-sub">예상 기준 ${n(r.expect-r.ecTot)}</div>`:''}</td>
      <td style="${payBad?'color:var(--down)':''}">${esc(r.want||'(정할 수 없음)')}${r.ecPay?`<div class="ec-sub">이카운트 ${esc(r.ecPay)}</div>`:''}</td>
      <td><span class="ec-badge ${stCls(r.st)}">${esc(r.st)}</span>${r.issues.length>1?`<div class="ec-sub">${esc(r.issues.slice(1).join(' · '))}</div>`:''}${r.st==='미입력'&&mf?`<div class="ec-sub">판매입력 파일은 있음(${esc(mf[0].by||'')})</div>`:''}</td>
      <td><input class="ec-in" data-a="rvmemo" data-o="${id}" data-d="${esc(D.date)}" value="${esc((RV.notes[o.order_id]||{}).memo||'')}" placeholder="메모" maxlength="200" style="width:130px"></td>
      <td><input type="checkbox" data-a="rvdone" data-o="${id}" data-d="${esc(D.date)}" ${(RV.notes[o.order_id]||{}).done?'checked':''} aria-label="처리완료"></td></tr>`;
  }).join('');
  const miss=R.filter(r=>r.st==='미입력').length;
  S.root.innerHTML=`<div class="ec-card"><h2>판매 입력 대조</h2>
    <p class="ec-lead">이카운트 판매현황(품목별) 또는 판매조회 엑셀을 올리면 그 날짜 카페24 주문과 맞춰 봅니다. 파일은 브라우저에서만 읽습니다.</p>
    ${dateRow(true)}
    ${D.fdates&&D.fdates.length>1?`<details ${D.batch||Object.keys(D.fres||{}).length||Object.values(D.fsel||{}).filter(Boolean).length>1?'open':''} style="background:var(--fill);border-radius:var(--r-ctrl);padding:var(--s3) var(--s4);margin-top:var(--s3)"><summary style="cursor:pointer;font-size:14px;font-weight:700">파일에 날짜가 ${n(D.fdates.length)}개 있습니다 — 여러 날짜 한 번에 대조</summary>
      <div class="ec-row" style="margin-top:6px"><span class="ec-sub" style="margin:0">체크한 날짜를 한 번에 대조해 대조 현황에 남깁니다. 전표 기간보다 옛 주문(반품·정산 전표만 있는 날짜)은 빼 두었습니다 — 그 전표는 이전 결과에 자동으로 붙습니다.</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:8px">${D.fdates.map(x=>{ const r=D.fres&&D.fres[x.d];
        return `<label style="font-size:12px;display:flex;gap:4px;align-items:center;${x.inR?'':'color:var(--muted)'}"><input type="checkbox" data-a="fsel" data-d="${x.d}" ${D.fsel[x.d]?'checked':''} ${D.batch?'disabled':''}>${esc(x.d.slice(5).replace('-','/'))} <span class="ec-sub" style="display:inline;margin:0">${n(x.n)}건</span>
          ${r?`<span class="ec-badge ${r.saved==='skip-old'?'ec-info':r.saved&&!String(r.saved).startsWith('fail')&&r.saved!=='nodate'?'ec-ok':'ec-bad'}">${r.saved==='skip-old'?'기간 밖 · 저장 안 함':r.saved==='nodate'?'파일에 없음':String(r.saved).startsWith('fail')?'저장 실패':ST_ORDER.filter(k=>r.st[k]&&k!=='정상'&&k!=='파일 기간 밖').map(k=>k+' '+r.st[k]).join(' · ')||'모두 정상'}</span>`:''}</label>`; }).join('')}</div>
      <div class="ec-row" style="margin-top:8px"><button class="ec-dl" data-a="fall" ${D.batch?'disabled':''}>전체 날짜 체크</button><button class="ec-dl" data-a="frange" ${D.batch?'disabled':''}>전표 기간만</button><button class="ec-dl" data-a="fnone" ${D.batch?'disabled':''}>모두 해제</button>
        <button class="go" data-a="runbatch" style="height:34px" ${D.batch?'disabled':''}>${D.batch?esc(D.batchMsg||'대조 중…'):`체크한 날짜 ${n(Object.values(D.fsel||{}).filter(Boolean).length)}개 모두 대조`}</button>
        ${Object.keys(D.fres||{}).length&&!D.batch?'<button class="ec-dl" data-a="gorv">대조 현황에서 보기</button>':''}</div></details>`:''}
    ${D.reconSaved==='nodate'?`<div class="ec-stat err">올린 이카운트 파일에 ${esc(D.date)} 주문이 없습니다 — 그 날짜가 든 판매현황을 올려 주세요(대조 현황에 남기지 않았습니다).</div>`
      :D.reconSaved&&D.reconSaved.startsWith('fail:')?`<div class="ec-stat err">대조 결과를 남기지 못했습니다: ${esc(D.reconSaved.slice(5))}</div>`
      :D.reconSaved==='skip-old'?`<div class="ec-stat">${esc(D.date)}은(는) 파일 전표 기간 밖이고 저장된 대조 결과가 없어 남기지 않았습니다. 파일에 없는 주문은 '파일 기간 밖'으로 보입니다.</div>`
      :D.reconSaved?`<div class="ec-stat">대조 결과를 대조 현황에 남겼습니다 (${esc(D.reconSaved)}).</div>`:''}
    ${D.attached&&D.attached.length?`<div class="ec-stat">이 파일에서 이전 날짜 주문의 반품·선수금 정산 전표 ${n(D.attached.length)}건을 그 날짜 대조 결과에 붙였습니다: ${D.attached.slice(0,6).map(a=>`${esc(a.date.slice(5))} ${esc(a.order)} (${esc(a.tag)})`).join(', ')}${D.attached.length>6?' …':''}</div>`:''}
    ${!D.ec&&D.savedDay?`<div class="ec-stat">이 날짜는 <b>${esc(D.savedDay.at)}</b>에 <b>${esc(D.savedDay.file||'')}</b>(으)로 대조한 결과입니다(대조 현황과 같음). 다시 대조하려면 이카운트 파일을 올리세요.</div>`:''}
    ${has?`<div class="ec-stat" style="font-size:15px;color:var(--ink)"><b>카페24 ${n(D.orders.length)}건</b> · <span style="color:var(--up)">정상 ${n(cnt['정상']||0)}</span>${miss?` · <span style="color:var(--down);font-weight:700">미입력 ${n(miss)}</span>`:''}${cnt['금액불일치']?` · <span style="color:var(--down);font-weight:700">금액불일치 ${n(cnt['금액불일치'])}</span>`:''}${cnt['환불 대기 확인']?` · <span style="color:var(--down)">환불 대기 확인 ${n(cnt['환불 대기 확인'])}</span>`:''}${cnt['결제유형 확인']?` · <span style="color:var(--down)">결제유형 확인 ${n(cnt['결제유형 확인'])}</span>`:''}${cnt['품목·수량 불일치']?` · <span style="color:var(--down)">품목·수량 불일치 ${n(cnt['품목·수량 불일치'])}</span>`:''}${(cnt['취소']||0)+(cnt['입금대기']||0)?` · <span class="ec-sub" style="display:inline;margin:0">취소·입금대기 ${n((cnt['취소']||0)+(cnt['입금대기']||0))}</span>`:''}</div>`
    :`<div class="ec-stat" style="font-size:15px;color:var(--ink)"><b>카페24 ${n(D.orders.length)}건</b> · 선수금 ${n(R.filter(r=>hasAdv(r.tags)).length)} · 퀵·설치 등 ${n(R.filter(r=>kinds(r.tags).has('ship')).length)} · 취소·입금대기 ${n((cnt['취소']||0)+(cnt['입금대기']||0))}</div>
    <div class="ec-stat">이 날짜는 아직 대조하지 않았습니다 — 위 '이카운트 판매현황 올리기'로 판매현황(품목별) 또는 판매조회 엑셀을 올리면 이 표에 이카운트 합계·차액·상태가 채워집니다.</div>`}
    ${`
    <div class="ec-row"><div class="ec-seg">${views.map(([v,l,c])=>`<button data-a="dview" data-v="${esc(v)}" class="${D.view===v?'on':''}">${l} ${n(c)}</button>`).join('')}</div>
      <span style="flex:1"></span>${miss?`<button class="go" data-a="togen" style="height:36px">미입력 ${n(miss)}건 판매입력 파일 만들기 →</button>`:''}</div>
    ${tfBar(stList,rg)}
    <div class="ec-scroll"><table class="ec-t" style="min-width:1050px"><thead><tr><th>주문번호</th><th style="min-width:150px">선수금 · 배송방식</th><th>상품 · 품목코드</th><th>카페24 실결제</th><th>이카운트 합계</th><th>차액</th><th>결제유형</th><th>상태</th><th>메모</th><th>처리완료</th></tr></thead>
      <tbody>${rowsHtml||`<tr><td colspan="10" style="color:var(--muted)">${D.loading?'':'해당하는 주문이 없습니다.'}</td></tr>`}</tbody></table></div>`}
    <details class="ec-note"><summary>설명 보기</summary><div>카페24 실결제 = PG 결제금액(적립금 제외) + 네이버페이 포인트 ↔ 이카운트 합계(선수금 포함) · 결제유형은 결제업체와 결제수단으로 정한 값과 비교 ·
      환불이 끝나지 않은 부분취소 주문은 '환불 전 예상' 금액과 비교해 '환불 대기 확인'으로 둡니다(환불이 끝나면 다시 대조) ·
      품목·수량은 품목코드 맵핑 기준(선수금 주문은 건너뜀, 사인지 줄은 빼고 비교) · 선수금·배송방식 = 선수금 품목과 이카운트 고객명의 퀵)·택배)·설치)·차량) 표기(선수금은 옅은 빨간 행 · 선수금 진행·배송 상태를 바꿔 가며 따라가세요) ·
      반품·선수금 정산·추가 전표 MM/DD = 같은 주문번호로 나중 날짜에 들어간 이카운트 전표(금액은 모두 합쳐 비교) · 대조 결과와 메모·처리완료는 이카운트 판매 입력 › 대조 현황에 쌓이고 팀이 같이 봅니다.</div></details></div>`
    +confCard();
}
// 판매입력 양식 각 주문 아래: 카페24 주문 정보 — 위 칸(고객명·앞말·출고처)을 보고 채우거나 버튼으로 바로 채운다
function c24Info(o,r){
  const id=esc(o.order_id), it=(l,v)=>v?`<span style="white-space:nowrap"><span class="ec-sub" style="display:inline;margin:0">${l}</span> ${v}</span>`:'';
  const sups=[...new Set(r.live.map(l=>l.supplier_name).filter(Boolean))].join(', ');
  const disc=(o.coupon_discount||0)+(o.etc_discount||0);
  const fill=(v,label)=>`<button class="ec-dl" style="height:24px;padding:0 8px;font-size:11px" data-a="fillname" data-o="${id}" data-v="${esc(v)}">${label}</button>`;
  const pre=(v,label)=>`<button class="ec-dl" style="height:24px;padding:0 8px;font-size:11px" data-a="fillpre" data-o="${id}" data-v="${esc(v)}">${label}</button>`;
  return `<div style="display:flex;flex-wrap:wrap;gap:6px 18px;font-size:12px;line-height:1.6">
      ${it('카페24',`<b>${id}</b> ${esc(o.time||'')}`)}
      ${it('주문자',`<b>${esc(o.buyer||'—')}</b> ${esc(o.buyer_phone||'')}`)}
      ${it('수령인',`<b>${esc(o.rc_name||'—')}</b> ${esc(o.rc_phone||'')}`)}
      ${it('공급사',esc(sups))}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px 18px;font-size:12px;line-height:1.6">
      ${it('배송지',esc(o.rc_addr||'—'))}${it('배송메시지',esc(o.rc_msg))}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px 18px;font-size:12px;line-height:1.6">
      ${it('결제',esc([o.pay_name||o.method,o.easypay,o.pg].filter(Boolean).join(' · ')))}${it('→ 이카운트',esc(r.want||'정할 수 없음'))}
      ${it('상품',n(o.order_price))}${it('배송비',o.shipping_fee?n(o.shipping_fee):'')}${it('할인',disc?'-'+n(disc):'')}${it('적립금',o.points_spent?'-'+n(o.points_spent):'')}${it('네이버포인트',o.naver_point?n(o.naver_point):'')}${it('실결제',`<b>${n(paidOf(o))}</b>`)}${remainOf(r).mode!=='none'?it('→ 판매입력',`<b style="color:var(--down)">${esc(remainTxt(remainOf(r)))}</b>`):''}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:4px">
      <span class="ec-sub" style="margin:0">고객명 채우기</span>${fill(o.rc_name||'','수령인')}${fill(o.buyer||'','주문자')}${diffRc(o)?fill(`${o.rc_name}(${o.buyer})`,'수령인(주문자)'):''}
      <span class="ec-sub" style="margin:0 0 0 10px">앞말</span>${PRE.map(p=>pre(p,p)).join('')}${pre('','없음')}
    </div>`;
}
function formCard(){
  const sel=(D.rows||[]).filter(r=>D.sel[r.o.order_id]&&r.live.length);
  const sellers=[...new Set([D.seller,...lsGet('pbg_ecdaily_sellers',[])].filter(Boolean))];
  // 주문 하나 = 카드 하나(Su, 2026-10-19). 위: 주문번호·금액·결제유형·주문자/수령인 한 줄, 가운데: 앞말·고객명·출고처, 아래: 품목 줄(품목코드·사인지). 카페24 상세는 펼치기.
  const body=sel.map(r=>{
    const o=r.o, E=ed(o.order_id), id=esc(o.order_id), nm=D.names[o.order_id]??custDefault(o), rm=remainOf(r), missN=r.live.filter(l=>!codeOf(l)).length;
    const lines=r.live.map(l=>{ const key=l.variant_code||String(l.product_no), c=codeOf(l);
      return `<div style="display:grid;grid-template-columns:1fr 170px 90px;gap:10px;align-items:center;padding:6px 0;border-top:1px solid var(--hair)">
        <div>${esc(l.product_name)}${l.option_value?` <span class="ec-sub" style="display:inline">${esc(optText(l.option_value))}</span>`:''} <b>× ${n(l.qty)}</b>${l.supplier_name?` <span class="ec-sub" style="display:inline">· ${esc(l.supplier_name)}</span>`:''}</div>
        <input class="ec-in" data-a="dcode" data-k="${esc(key)}" value="${esc(c)}" placeholder="품목코드 입력" style="width:100%;${c?'':'box-shadow:inset 0 0 0 2px var(--down)'}">
        <label style="font-size:13px;white-space:nowrap;display:flex;gap:4px;align-items:center;${signOn(l)?'color:var(--accent);font-weight:700':'color:var(--muted)'}"><input type="checkbox" data-a="sign" data-k="${esc(key)}" ${signOn(l)?'checked':''}>사인지${signOn(l)&&c?` <span class="ec-sub" style="display:inline;margin:0">${esc((S.sign||{})[c]||c+'SI')}</span>`:''}</label></div>`; }).join('');
    const warn=[rm.mode!=='none'?remainTxt(rm):'',exchTxt(r),!r.want?'결제유형을 정할 수 없음 — 이카운트에서 직접':''].filter(Boolean);
    return `<div style="border:1px solid var(--hair);border-radius:12px;padding:12px 16px;margin-top:10px;background:var(--surface)">
      <div style="display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center">
        <b style="font-family:ui-monospace,Menlo,monospace;font-size:14px">${id}</b><span class="ec-sub" style="margin:0">${esc(o.time||'')}</span>
        <b style="font-variant-numeric:tabular-nums">${n(rm.amt)}원</b><span class="ec-badge ec-info">${esc(r.want||'결제유형 확인')}</span>
        ${diffRc(o)?'<span class="ec-badge ec-warn">주문자≠수령인</span>':''}${missN?`<span class="ec-badge ec-bad">품목코드 없음 ${missN}</span>`:''}
        <span style="flex:1"></span><a href="#" data-a="c24toggle" data-o="${id}" style="font-size:13px;color:var(--accent);text-decoration:none">${D.c24open&&D.c24open[o.order_id]?'▾ 카페24 상세 닫기':'▸ 카페24 상세'}</a></div>
      <div class="ec-sub" style="margin-top:4px">주문자 <b style="color:var(--ink-2)">${esc(o.buyer||'—')}</b> ${esc(o.buyer_phone||'')} · 수령인 <b style="color:var(--ink-2)">${esc(o.rc_name||'—')}</b> ${esc(o.rc_phone||'')} · ${esc(o.rc_addr||'')}${o.rc_msg?` · <span style="color:var(--down)">${esc(o.rc_msg)}</span>`:''}</div>
      ${warn.length?`<div class="ec-sub" style="color:var(--down);font-weight:600;margin-top:4px">${warn.map(esc).join(' · ')}</div>`:''}
      ${D.c24open&&D.c24open[o.order_id]?`<div style="background:var(--fill);border-radius:8px;padding:8px 12px;margin-top:8px">${c24Info(o,r)}</div>`:''}
      <div style="display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin-top:10px">
        <label style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--muted);font-weight:600">앞말 <input class="ec-in" data-a="pre" data-o="${id}" list="ecdPre" value="${esc(E.pre||'')}" placeholder="퀵)·택배)·설치)" style="width:110px"></label>
        <label style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--muted);font-weight:600">고객명 <input class="ec-in" data-a="name" data-o="${id}" value="${esc(nm)}" style="width:170px"></label>
        <label style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--muted);font-weight:600">출고처 <select class="ec-in" data-a="wh" data-o="${id}">${WH.map(w=>`<option ${(E.wh||D.wh)===w?'selected':''}>${esc(w)}</option>`).join('')}</select></label>
      </div>
      <div style="margin-top:8px">${lines}</div></div>`;
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
    ${sel.length?body:'<div class="ec-stat">위 표의 \'판매입력\' 칸을 체크하면 여기에 나옵니다. 아직 파일에 안 넣은 주문은 처음부터 체크돼 있습니다.</div>'}
    <details class="ec-note"><summary>설명 보기</summary><div>주문마다 아래 회색 칸에 카페24 주문 정보(주문자·수령인·연락처·배송지·배송메시지·결제·금액)가 나옵니다 — 보고 위 칸을 채우거나 버튼으로 바로 채우세요.
      고객명은 수령인 이름이고, 주문자와 수령인이 다르면 '수령인(주문자)'로 채웁니다(이카운트 8월 입력 방식) — <b>주문자≠수령인</b> 표시가 붙은 주문은 한 번 더 확인하세요. 연락처·주소는 수령인 것입니다.
      고객명 앞말은 퀵·택배·설치 등 배송 방법이 다를 때만 넣습니다(예: 퀵) 홍길동). 출고처는 위에서 한 번에 고르고, 주문마다 바꿀 수 있습니다.
      직접 넣은 품목코드는 파일을 만들 때 품목코드 맵핑에도 저장됩니다.
      <b>사인지</b>: 에디션에 사인지가 같이 나가면 체크하세요 — 바로 아래 줄에 사인지 품목(에디션코드+SI · 같은 수량 · 0원)이 들어가고, 그 품목은 다음부터 자동으로 체크됩니다.
      이카운트 판매현황에 사인지가 같이 입력된 주문이 있으면 그것도 배워 둡니다(카페24 주문에는 사인지 표시가 없음). 만든 파일은 판매입력 파일 이력에서 다시 받을 수 있습니다.</div></details></div>`;
}
function onDailyInput(t){
  const a=t.dataset.a, o=t.dataset.o;
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
  if(t.id==='ecdReFile'){ const f=t.files[0]; t.value=''; if(f&&undoConfirm(f.name)) undoFile().then(()=>onDailyFile(f)).then(()=>{ D.view='bad'; render(); }); return true; }
  if(t.id==='ecdWh'){ D.wh=t.value; for(const k of Object.keys(D.ed)) delete D.ed[k].wh; saveEd(); render(); return true; }
  if(t.id==='ecdSeller'){ D.seller=t.value; return true; }
  if(a==='sel'){ D.sel[o]=t.checked; render(); return true; }
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
      <button class="ec-dl" data-a="learnsaved" style="height:36px">지난 대조 결과로 배우기 (최근 3개월)</button>
      <span class="ec-sub" style="margin:0">저장된 대응 <b style="color:var(--ink)">${n(saved.length)}</b>건 (자동 ${n(saved.length-man)} · 담당자 ${n(man)})</span>
    </div>
    ${S.files.length?`<div class="ec-stat">올린 파일: ${S.files.map(f=>`<b>${esc(f.name)}</b> (${n(f.rows)}행)`).join(', ')} · 카페24 ${S.months.join(', ')} 주문 <button class="ec-dl" data-a="mclear" title="올린 파일과 학습 결과를 지우고 처음부터">파일 지우기</button></div>`:''}
    ${S.loading?`<div class="ec-stat">${esc(S.loading)}</div>`:''}
    ${S.flash?`<div class="ec-stat" style="position:sticky;top:8px;z-index:5;background:${S.flash.bad?'var(--down-soft)':'var(--up-soft)'};color:${S.flash.bad?'var(--down)':'var(--up)'};border-radius:8px;padding:8px 12px;font-weight:600">${esc(S.flash.msg)}</div>`:''}
    ${S.err?`<div class="ec-stat err">${esc(S.err.message||S.err)}</div>`:''}
    ${S.truncated&&S.truncated.length?`<div class="ec-stat err">${S.truncated.join(', ')} 카페24 주문이 너무 많아 일부만 받았습니다.</div>`:''}
  </div>`;
  h+=candCard();
  if(S.result) h+=resultCard();
  h+=savedCard();   // 저장된 대응표는 파일을 올리든 말든 늘 보인다
  S.root.innerHTML=h;
}
function candCard(){
  const q=S.qc.trim().toLowerCase();
  const all=Object.entries(S.cand).map(([key,v])=>{ const cs=Object.entries(v.cands||{}).sort((a,b)=>b[1]-a[1]); return {key,...v,cs,top:cs[0]?cs[0][0]:'',single:cs.length===1}; });
  // 상품명 안에도 ' / ' 가 있을 수 있어('[… / 선물 포장 제공]타원 트레이') 마지막 ' / ' 에서 가른다
  const optOf=label=>{ const i=String(label||'').lastIndexOf(' / '); return i<0?'':label.slice(i+3); };
  const prodOf=label=>{ const i=String(label||'').lastIndexOf(' / '); return i<0?String(label||''):label.slice(0,i); };
  const warn=(opt,code)=>{ const ws=optWords(opt), nm=String((S.dict[code]||{}).name||'').toLowerCase(); return ws.length&&/\[[^\]]+\]/.test(nm)&&!ws.some(w=>nm.includes(w)); };
  const singles=all.filter(x=>x.single).length;
  // 상품 단위로 묶는다(Su, 2026-10-20: 카페24 상품 하나의 옵션마다 이카운트 코드가 있으니 한 옵션이 짝지어지면 나머지 옵션도 같이 보여 준다)
  const groups={};
  for(const x of all){ const p=x.pno?String(x.pno):'?'+prodOf(x.label); (groups[p] ||= {pno:x.pno?String(x.pno):'',title:prodOf(x.label),items:[],at:''}).items.push(x); }
  for(const g of Object.values(groups)) g.at=g.items.map(x=>x.at||'').sort().reverse()[0]||'';
  const pnos=Object.values(groups).map(g=>g.pno).filter(Boolean);
  if(pnos.some(p=>!S.vars[p])&&!S.varsBusy) setTimeout(()=>loadVariants(pnos),0);
  const used=new Set(), rowsOf=g=>{
    // 옵션 목록: 카페24 상품 옵션 전체(받았으면) + 예비 목록에만 있는 키
    const vs=g.pno&&Array.isArray(S.vars[g.pno])?S.vars[g.pno]:null;
    const byKey={}; for(const x of g.items) byKey[x.key]=x;
    const rows=(vs||[]).map(v=>({key:v.variant_code,opt:optText(v.opt),custom:v.custom,cand:byKey[v.variant_code]||null,display:v.display,selling:v.selling}));
    for(const x of g.items) if(!rows.some(r=>r.key===x.key)) rows.push({key:x.key,opt:optOf(x.label),cand:x});
    // 형제 옵션의 코드 앞 7글자(분류+브랜드)로 사전에서 제안
    const codes=rows.map(r=>r.cand?r.cand.top:(S.map[r.key]||{}).code).filter(Boolean);
    const pre={}; for(const c of codes){ const k=String(c).replace(/\d+$/,''); pre[k]=(pre[k]||0)+1; }
    const prefix=Object.entries(pre).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
    const taken=new Set(codes);
    for(const r of rows){
      r.saved=S.map[r.key]||null;
      if(r.cand) r.code=r.cand.top; else if(r.saved) r.code=r.saved.code;
      else if(prefix){ const ws=optWords(r.opt); let best=null, bs=0;
        for(const [c,v] of Object.entries(S.dict)){ if(!c.startsWith(prefix)||taken.has(c)) continue; const nm=String(v.name||'').toLowerCase(); const hit=ws.filter(w=>nm.includes(w)).length; if(hit>bs){ bs=hit; best=c; } }
        if(best){ r.code=best; r.proposed=true; } }
      r.label=`${g.title}${r.opt?' / '+r.opt:''}`;
    }
    return {rows,vs,prefix};
  };
  const chip=(x,c)=>`<a href="#" data-a="cpick" data-k="${esc(x.key)}" data-c="${esc(c[0])}" style="display:flex;gap:8px;align-items:center;text-decoration:none;color:var(--ink);background:${c[0]===x.top?'var(--up-soft)':'var(--fill)'};border-radius:8px;padding:4px 8px;font-size:12px"><b>${esc(c[0])}</b><span style="flex:1">${esc((x.names||{})[c[0]]||(S.dict[c[0]]||{}).name||'')}</span><span class="ec-sub" style="margin:0;white-space:nowrap">${n(c[1])}건</span>${warn(optOf(x.label),c[0])?'<span class="ec-badge ec-warn" title="카페24 옵션 낱말(색·크기)이 이카운트 품명에 없습니다">옵션 확인</span>':''}${S.map[x.key]&&S.map[x.key].code===c[0]?'<span class="ec-badge ec-info">저장된 값</span>':''}</a>`;
  const glist=Object.values(groups).filter(g=>!q||[g.title,...g.items.map(x=>x.key+' '+x.cs.map(c=>c[0]).join(' '))].join(' ').toLowerCase().includes(q)).sort((a,b)=>b.at.localeCompare(a.at)||a.title.localeCompare(b.title));
  const body=glist.slice(0,80).map(g=>{ const {rows,vs,prefix}=rowsOf(g); const confirmable=rows.filter(r=>r.code&&!(r.saved&&r.saved.code===r.code&&!r.cand)).length;
    return `<tr style="background:var(--fill)"><td colspan="6" class="l" style="padding:10px 12px"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b style="font-size:14px">${esc(g.title)}</b>
        <span class="ec-sub" style="margin:0">${g.pno?`상품번호 ${esc(g.pno)} · `:''}옵션 ${vs?n(rows.length)+'개':S.varsBusy?'받는 중…':(g.pno?'못 받음':'모름')}${prefix?` · 코드 앞머리 <b>${esc(prefix)}</b>`:''}</span><span style="flex:1"></span>
        ${confirmable?`<button class="go" data-a="cconfirmprod" data-p="${esc(g.pno||g.title)}" style="height:32px">이 상품 ${n(confirmable)}건 확정</button>`:''}
        <button class="ec-dl" data-a="cdropprod" data-p="${esc(g.pno||g.title)}">이 상품 후보 버리기</button></div></td></tr>`+
      rows.map(r=>`<tr data-prod="${esc(g.pno||g.title)}"><td class="l" style="padding-left:24px">${esc(r.opt||'(옵션 없음)')}${r.display==='F'||r.selling==='F'?' <span class="ec-sub" style="display:inline">진열·판매 안 함</span>':''}</td><td>${esc(r.key)}</td>
        <td>${r.cand&&r.cand.price?n(r.cand.price)+'원':'—'}${r.custom?`<div class="ec-sub">자체코드 ${esc(r.custom)}</div>`:''}</td>
        <td class="l" style="min-width:360px">${r.cand?`<div style="display:flex;flex-direction:column;gap:4px">${r.cand.cs.slice(0,5).map(c=>chip(r.cand,c)).join('')}</div>`
          :r.saved?`<span class="ec-badge ec-info">저장됨</span> <b>${esc(r.saved.code)}</b> <span class="ec-sub" style="display:inline">${esc(r.saved.name||'')}</span>`
          :r.proposed?`<span class="ec-badge ec-warn">제안</span> <b>${esc(r.code)}</b> <span class="ec-sub" style="display:inline">${esc((S.dict[r.code]||{}).name||'')}</span>${warn(r.opt,r.code)?' <span class="ec-badge ec-warn">옵션 확인</span>':''}`
          :`<span class="ec-sub" style="margin:0">주문에 안 나옴 · 사전에 맞는 품목 없음</span>`}</td>
        <td class="ec-sub" style="white-space:nowrap">${r.cand?esc(r.cand.first||'')+(r.cand.at&&r.cand.at!==r.cand.first?`<br>~ ${esc(r.cand.at)}`:''):''}</td>
        <td style="white-space:nowrap"><input class="ec-in" data-a="ccode" data-k="${esc(r.key)}" data-label="${esc(r.label)}" value="${esc(r.code||'')}" placeholder="품목코드" style="width:150px"> <button class="go" data-a="cconfirm" data-k="${esc(r.key)}" style="height:34px">확정</button>${r.cand?` <button class="ec-dl" data-a="cdrop" data-k="${esc(r.key)}">버리기</button>`:''}</td></tr>`).join('');
  }).join('');
  return `<div class="ec-card"><h2>확정 대기 <span class="ec-sub" style="display:inline;margin-left:6px">예비 목록 ${n(all.length)}건 · 상품 ${n(Object.keys(groups).length)}개</span></h2>
    <p class="ec-lead">매일 판매 입력 대조에 올린 이카운트 파일(품목별)에서 찾은 짝이 상품 단위로 쌓입니다. 주문에 안 나온 옵션도 같은 상품이면 같이 보이고, 형제 옵션 코드의 앞머리(분류+브랜드)와 옵션 낱말로 품목 사전에서 <b>제안</b>합니다. 보고 <b>확정</b>하거나 <b>버리기</b>로 지워 주세요. 확정한 값은 담당자 값으로 저장되고 자동 학습이 덮어쓰지 않습니다.</p>
    <div class="ec-row"><input class="ec-in" id="ecCandQ" value="${esc(S.qc)}" placeholder="상품명·옵션코드·품목코드 검색" style="width:260px"><span class="ec-sub" style="margin:0">품목 사전 ${n(Object.keys(S.dict).length)}개</span><span style="flex:1"></span>
      ${singles?`<button class="go" data-a="cconfirmall" style="height:36px">후보가 하나뿐인 ${n(singles)}건 모두 확정</button>`:''}
      ${all.length?`<button class="ec-dl" data-a="cdropall" style="height:36px;color:var(--down)" title="예비 목록만 비웁니다(대응표는 그대로). 파일을 다시 올리면 새로 쌓입니다">예비 목록 모두 비우기</button>`:''}</div>
    <div class="ec-scroll"><table class="ec-t"><thead><tr><th class="l">옵션</th><th>옵션코드</th><th>카페24 판매가</th><th class="l">이카운트 품목코드 후보 (누르면 채워짐)</th><th>본 날짜</th><th>확정 · 버리기</th></tr></thead><tbody>
      ${body||`<tr><td colspan="6" class="ec-sub">${q?'찾은 것이 없습니다':'확정 기다리는 짝이 없습니다 — 판매 입력 대조에 품목별 파일을 올리면 여기 쌓입니다'}</td></tr>`}</tbody></table></div>
    ${glist.length>80?`<div class="ec-sub">상품 80개까지만 보입니다 — 검색으로 좁혀 주세요</div>`:''}</div>`;
}
function savedCard(){
  const q=S.qs.trim().toLowerCase();
  const list=Object.entries(S.map).map(([key,v])=>({key,...v})).filter(x=>!q||[x.label,x.key,x.code,x.name].join(' ').toLowerCase().includes(q)).sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
  return `<div class="ec-card"><h2>저장된 대응표 <span class="ec-sub" style="display:inline;margin-left:6px">${n(Object.keys(S.map).length)}건 · 최근 저장 순</span></h2>
    <div class="ec-row"><input class="ec-in" id="ecMapQ" value="${esc(S.qs)}" placeholder="상품명·옵션코드·품목코드 검색" style="width:260px"><span class="ec-sub" style="margin:0">${q?`${n(list.length)}건 찾음`:''}</span></div>
    <div class="ec-scroll"><table class="ec-t"><thead><tr><th>카페24 상품 · 옵션</th><th>옵션코드</th><th>이카운트 품목코드</th><th>이카운트 품명</th><th>출처</th><th>근거</th><th>저장일</th></tr></thead><tbody>
      ${list.length?list.slice(0,500).map(x=>`<tr><td class="l">${esc(x.label||'')}</td><td>${esc(x.key)}</td><td><b>${esc(x.code)}</b></td><td class="l">${esc(x.name||'')}</td>
        <td><span class="ec-badge ${x.src==='manual'?'ec-ok':'ec-info'}">${x.src==='manual'?'담당자':'자동'}</span></td><td>${x.n?n(x.n)+'건':''}</td><td>${esc(x.at||'')}</td></tr>`).join(''):`<tr><td colspan="7" class="ec-sub">${q?'찾은 것이 없습니다':'아직 저장된 대응이 없습니다'}</td></tr>`}</tbody></table></div>
    ${list.length>500?`<div class="ec-sub">500건까지만 보입니다 — 검색으로 좁혀 주세요</div>`:''}</div>`;
}
function resultCard(){
  const R=S.result, cnt={}; for(const r of R.rows) cnt[r.st]=(cnt[r.st]||0)+1;
  const un=R.unmatched.filter(u=>u.st==='미연결');
  const views=[['new','새로 연결',(cnt['새로 연결']||0)+(cnt['저장됨과 다름']||0)],['check','확인 필요',(cnt['확인 필요']||0)+(cnt['담당자 값과 다름']||0)],['un','미연결',un.length],['same','저장됨·확정',(cnt['저장됨과 같음']||0)+(cnt['담당자 확정']||0)]];
  const q=S.q.trim().toLowerCase(), hit=x=>!q||[x.name,x.opt,x.key,x.code,x.ecname,x.label].join(' ').toLowerCase().includes(q);
  let list, body='';
  if(S.view==='new') list=R.rows.filter(r=>r.st==='새로 연결'||r.st==='저장됨과 다름');
  else if(S.view==='check') list=R.rows.filter(r=>r.st==='확인 필요'||r.st==='담당자 값과 다름');
  else if(S.view==='same') list=R.rows.filter(r=>r.st==='저장됨과 같음'||r.st==='담당자 확정');
  else list=un;
  list=list.filter(hit);
  const codes=Object.keys(R.ecName).sort();
  const picker=(x,cands)=>`<input class="ec-in" list="ecCodes" data-a="code" data-k="${esc(x.key)}" data-label="${esc(`${x.name||x.label||''}${x.opt?' / '+x.opt:''}`)}" placeholder="품목코드 입력·선택" style="width:170px">
     <button class="ec-dl" data-a="savecode" data-k="${esc(x.key)}">저장</button>
     ${cands&&cands.length?`<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">${cands.slice(0,5).map(c=>{const same=c.price>0&&c.price===x.price;
       return `<a href="#" data-a="pick" data-k="${esc(x.key)}" data-c="${esc(c.code)}" style="display:flex;gap:8px;align-items:center;text-decoration:none;color:var(--ink);background:${same?'var(--up-soft)':'var(--fill)'};border-radius:8px;padding:4px 8px;font-size:12px">
         <b>${esc(c.code)}</b><span style="flex:1">${esc(ecProd(c.name))}</span><span style="white-space:nowrap">정가 ${c.price?n(c.price)+'원':'—'}</span>
         ${same?'<span class="ec-badge ec-ok">✓ 금액 일치</span>':''}<span class="ec-sub" style="margin:0">${c.n}주문</span></a>`;}).join('')}</div>`:''}`;
  if(S.view==='un'){
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
    <details class="ec-note"><summary>설명 보기</summary><div>카페24 판매가 = 그 옵션의 판매 단가(할인 전) · 이카운트 정가 = 판매현황의 정가 · 후보는 금액이 같은 것이 먼저 나옵니다(✓ 금액 일치) · 근거 = 그 짝이 확인된 주문 수 · 1:1 = 한 주문에 남은 카페24 옵션 1개와 이카운트 품목 1개 · 이름 = 같은 주문 안에서 상품명이 가장 비슷한 짝 ·
      확인 필요 = 한 옵션에 서로 다른 코드가 나옴(담당자가 골라야 함) · 미연결 = 같은 주문에 이카운트 품목이 남았는데 짝을 못 찾음.
      재고2(위탁)만 뽑은 파일이면 위탁이 아닌 상품은 애초에 이카운트 파일에 없어 학습되지 않습니다 — 전체 품목으로 뽑으면 더 많이 채워집니다.</div></details></div>`;
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
    // 파일에 있는 주문번호만 카페24 에서 받는다
    const ids=[...new Set(S.ecRows.map(r=>r.order))];
    await loadC24Orders(ids,(i,t)=>{ S.loading=`카페24 주문 받는 중… ${i}/${t}`; render(); });
    S.months=[...new Set(ids.map(o=>o.slice(0,4)+'-'+o.slice(4,6)))].sort();
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
    if(t.dataset.a==='fsel'){ D.fsel[t.dataset.d]=t.checked; render(); return; }
    if(t.id==='ecTfSort'){ TF.sort=t.value; render(); return; }
    if(t.id==='ecRvDate'){ if(t.value){ RV.date=t.value; syncSub(); loadRVDay(t.value); } return; }
    if(t.id==='ecRvMonth'){ RV.month=t.value||RV.month; RV.date=''; RV.idx=null; render(); loadRV().then(render); return; }
    if(t.dataset.a==='rvdone'){ saveNote(t.dataset.d,t.dataset.o,{done:t.checked}).then(render).catch(err=>alert('저장하지 못했습니다: '+err.message)); return; }
    if(t.dataset.a==='rvast'){ saveNote(t.dataset.d,t.dataset.o,{ast:t.value}).then(render).catch(err=>alert('저장하지 못했습니다: '+err.message)); return; }
    if(t.dataset.a==='rvdst'){ saveNote(t.dataset.d,t.dataset.o,{dst:t.value}).then(render).catch(err=>alert('저장하지 못했습니다: '+err.message)); return; }
    if(t.id==='ecLogMonth'){ S.logMonth=t.value||S.logMonth; (async()=>{ await loadLog(); render(); })(); return; }
  });
  root.addEventListener('input',e=>{ if((S.page==='daily'||S.page==='recon')&&onDailyInput(e.target)) return; if(e.target.dataset.a==='rvmemo'){ noteMemo(e.target.dataset.d,e.target.dataset.o,e.target.value); return; }
    // 검색: 한 글자마다 표 전체를 다시 그리지 않고 입력이 멈추면(0.2초) 한 번
    if(e.target.id==='ecRvQ'||e.target.id==='ecQ'||e.target.id==='ecOoQ'||e.target.id==='ecMapQ'||e.target.id==='ecCandQ'){ const id=e.target.id; if(id==='ecRvQ') RV.q=e.target.value; else if(id==='ecOoQ') OO.q=e.target.value; else if(id==='ecMapQ') S.qs=e.target.value; else if(id==='ecCandQ') S.qc=e.target.value; else S.q=e.target.value;
      clearTimeout(searchTimer); searchTimer=setTimeout(()=>{ const el=$(id), pos=el?el.selectionStart:0; render(); const q=$(id); if(q){ q.focus(); q.setSelectionRange(pos,pos); } },200); } });
  root.addEventListener('click',async e=>{
    const t=e.target.closest('[data-a]'); if(!t) return;
    const a=t.dataset.a;
    if(a==='view'){ S.view=t.dataset.v; render(); return; }
    if(a==='logreload'){ await loadLog(); render(); return; }
    if(a==='godaily'){ setMenu('ecdaily'); return; }
    if(a==='dview'){ D.view=t.dataset.v; render(); return; }
    if(a==='logview'){ S.logView=t.dataset.v; render(); return; }
    if(a==='ooreload'){ OO.list=null; OO.force=true; await loadOpen(); return; }
    if(a==='oocard'){ OO.card=t.dataset.k||''; OO.detail=''; OO.q=''; pushSub(); render(); const el=$('ooList'); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); return; }
    if(a==='oodetail'){ e.preventDefault(); window.scrollTo(0,0); if(!t.dataset.o){ OO.detail=''; pushSub(); render(); const el=$('ooList'); if(el) el.scrollIntoView({block:'start'}); } else { OO.detail=t.dataset.o; pushSub(); await openDetail(t.dataset.o); } return; }
    if(a==='godate'){ e.preventDefault(); D.date=t.dataset.d; D.loadedDate=false; setMenu('ecrecon'); return; }
    if(a==='rvday'){ if(!t.dataset.d) return; RV.q=''; RV.date=t.dataset.d; pushSub(); await loadRVDay(t.dataset.d); return; }
    if(a==='rvback'){ RV.date=''; RV.day=null; pushSub(); render(); return; }
    if(a==='gorecon2'){ setMenu('ecrecon'); return; }
    if(a==='rvxlsx'){ try{ await exportRV(t); }catch(err){ alert('엑셀을 만들지 못했습니다: '+err.message); t.disabled=false; t.textContent='엑셀로 받기 (이 달)'; } return; }
    if(a==='c24toggle'){ e.preventDefault(); (D.c24open ||= {})[t.dataset.o]=!D.c24open[t.dataset.o]; render(); return; }
    if(a==='fillname'){ D.names[t.dataset.o]=t.dataset.v; render(); return; }
    if(a==='fillpre'){ ed(t.dataset.o).pre=t.dataset.v; saveEd(); render(); return; }
    if(a==='runbatch'){ await runBatch(); return; }
    if(a==='fall'||a==='frange'||a==='fnone'){ D.fsel={}; for(const x of (D.fdates||[])) if(a==='fall'||(a==='frange'&&x.inR)) D.fsel[x.d]=true; render(); return; }
    if(a==='gorv'){ S.logView='rv'; RV.idx=null; setMenu('eclog'); return; }
    if(a==='gooo'){ S.logView='oo'; render(); return; }
    if(a==='confopen'){ S.confOpen=true; S.confMsg=''; render(); return; }
    if(a==='confclose'){ S.confOpen=false; render(); return; }
    if(a==='confsave'){ t.disabled=true; try{ await saveConf(root); }catch(err){ S.confMsg='저장 실패: '+err.message; } t.disabled=false; render(); return; }
    if(a==='tftype'){ TF.type=t.dataset.v; render(); return; }
    if(a==='gview'){ D.gview=t.dataset.v; render(); return; }
    if(a==='gorecon'){ e.preventDefault(); setMenu('ecrecon'); return; }
    if(a==='gomap'){ e.preventDefault(); if(S.result){ S.view='check'; } setMenu('ecmap'); return; }
    if(a==='selall'||a==='selnone'){ const v=D.gview||'new'; for(const r of (D.rows||[])){ if(!r.live.length) continue; const inView=v==='all'||(v==='new'&&r.gst==='새 주문')||(v==='wait'&&r.gst==='환불 대기')||(v==='made'&&r.gst==='파일 있음'); if(a==='selnone') delete D.sel[r.o.order_id]; else if(inView) D.sel[r.o.order_id]=true; } render(); return; }
    if(a==='togen'){ D.sel={}; for(const r of (D.rows||[])) if(r.st==='미입력'&&r.live.length) D.sel[r.o.order_id]=true; D.selInit=true; D.gview='all'; setMenu('ecdaily'); return; }
    if(a==='dreload'){ await loadDailyC24(); return; }
    if(a==='ecundo'){ if(!undoConfirm('')) return; await undoFile(); await loadDailyC24(); return; }
    if(a==='qdate'){ if(D.date!==t.dataset.d){ D.date=t.dataset.d; await loadDailyC24(); } return; }
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
    if(a==='mclear'){ S.ecRows=[]; S.files=[]; S.months=[]; S.result=null; S.err=null; S.view='new'; render(); return; }
    if(a==='learnsaved'){ const now=kstDay(0), ms=[0,1,2].map(i=>{ const d=new Date(now+'T00:00:00'); d.setMonth(d.getMonth()-i); return d.toISOString().slice(0,7); }); await learnFromSaved(ms); return; }
    if(a==='cpick'){ e.preventDefault(); const inp=root.querySelector(`input[data-a="ccode"][data-k="${CSS.escape(t.dataset.k)}"]`); if(inp) inp.value=t.dataset.c; t.parentElement.querySelectorAll('a[data-a="cpick"]').forEach(x=>{ x.style.outline=x===t?'2px solid var(--accent)':''; }); return; }
    if(a==='cconfirm'){ const inp=root.querySelector(`input[data-a="ccode"][data-k="${CSS.escape(t.dataset.k)}"]`), code=(inp&&inp.value||'').trim(); if(!code) return flash('품목코드를 넣거나 후보를 눌러 주세요.',true);
      t.disabled=true; try{ const d=await candAct([t.dataset.k],code,{[t.dataset.k]:{label:inp.dataset.label||''}}); flash(d.saved?`확정: ${(S.map[t.dataset.k]||{}).label||t.dataset.k} → ${code}`:`저장되지 않았습니다: ${code} — 코드 형식을 확인해 주세요.`,!d.saved); }catch(err){ flash('저장하지 못했습니다: '+err.message,true); } return; }
    if(a==='cconfirmprod'||a==='cdropprod'){ const p=t.dataset.p, inps=[...root.querySelectorAll(`tr[data-prod="${CSS.escape(p)}"] input[data-a="ccode"]`)];
      if(a==='cdropprod'){ const ks=inps.map(x=>x.dataset.k).filter(k=>S.cand[k]); if(!ks.length) return; if(!confirm(`이 상품의 후보 ${ks.length}건을 버릴까요?`)) return; t.disabled=true; try{ await candAct(ks,''); render(); }catch(err){ flash('지우지 못했습니다: '+err.message,true); } return; }
      const picks=inps.map(x=>({k:x.dataset.k,code:x.value.trim(),label:x.dataset.label||''})).filter(x=>x.code&&!(S.map[x.k]&&S.map[x.k].code===x.code&&!S.cand[x.k]));
      if(!picks.length) return flash('확정할 코드가 없습니다.',true);
      if(!confirm(`${picks.length}개 옵션을 담당자 값으로 저장할까요?\n`+picks.map(x=>`${x.label.slice(0,40)} → ${x.code}`).join('\n'))) return; t.disabled=true;
      try{ let saved=0; for(const x of picks){ const d=await candAct([x.k],x.code,{[x.k]:{label:x.label}}); saved+=d.saved||0; } flash(`${n(saved)}건 확정했습니다. 대응표 ${n(Object.keys(S.map).length)}건`); }catch(err){ flash('저장하지 못했습니다: '+err.message,true); } return; }
    if(a==='cdrop'){ t.disabled=true; try{ await candAct([t.dataset.k],''); render(); }catch(err){ flash('지우지 못했습니다: '+err.message,true); } return; }
    if(a==='cdropall'){ const ks=Object.keys(S.cand||{}); if(!ks.length) return; if(!confirm(`예비 목록 ${ks.length}건을 모두 비울까요? 대응표(확정된 값)는 그대로 둡니다.`)) return; t.disabled=true;
      try{ await candAct(ks,''); flash(`예비 목록 ${n(ks.length)}건을 비웠습니다.`); }catch(err){ flash('비우지 못했습니다: '+err.message,true); } return; }
    if(a==='cconfirmall'){ const ks=Object.entries(S.cand).filter(([k,v])=>Object.keys(v.cands||{}).length===1); if(!ks.length) return;
      if(!confirm(`후보가 하나뿐인 ${ks.length}건을 모두 담당자 값으로 저장할까요?`)) return; t.disabled=true;
      try{ let saved=0; for(const [k,v] of ks){ const d=await candAct([k],Object.keys(v.cands)[0]); saved+=d.saved||0; } flash(`${n(saved)}건 확정했습니다. 대응표 ${n(Object.keys(S.map).length)}건`); }catch(err){ flash('저장하지 못했습니다: '+err.message,true); } return; }
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

let WIRED=false, searchTimer=0;
// [2026-10-19] 화면 안 이동(주문 처리: 카드 → 목록 → 상세, 대조 현황 날짜 상세)도 브라우저 기록에 쌓아 뒤로가기로 되돌린다.
//   주소: ?m=eclog&c=<칸>&o=<주문번호>&d=<날짜>. setMenu 가 pushState 한 뒤 여기서 같은 칸을 replaceState 로 채운다.
function subUrl(){ const q=new URLSearchParams(location.search); for(const k of ['c','o','d']) q.delete(k);
  if(S.page==='log'){ if(OO.card) q.set('c',OO.card); if(OO.detail) q.set('o',OO.detail); if(RV.date) q.set('d',RV.date); }
  return location.pathname+'?'+q.toString(); }
function pushSub(){ try{ history.pushState({m:'eclog',c:OO.card,o:OO.detail,d:RV.date},'',subUrl()); }catch(e){} }
function syncSub(){ try{ history.replaceState({m:'eclog',c:OO.card,o:OO.detail,d:RV.date},'',subUrl()); }catch(e){} }
async function applySub(q){   // 뒤로가기로 돌아온 주소를 화면에 반영
  const c=q.get('c')||'', o=q.get('o')||'', d=q.get('d')||'';
  if(S.page!=='log') return;
  let ch=false;
  if(c!==OO.card){ OO.card=c; OO.q=''; ch=true; }
  if(o!==OO.detail){ if(o){ await openDetail(o); } else { OO.detail=''; } ch=true; }
  if(d!==RV.date){ if(d){ await loadRVDay(d); } else { RV.date=''; RV.day=null; } ch=true; }
  if(ch) render();
}
window.addEventListener('pbg:popstate',e=>{ applySub(e.detail.q); });
window.loadEcountTab=async function(el,page){
  if(!$('ecCss')){ const s=document.createElement('style'); s.id='ecCss'; s.textContent=STYLE; document.head.appendChild(s); }
  S.root=el; S.page=page||'map';
  if(!WIRED){ wire(el); WIRED=true; }
  if(S.page==='log'){
    el.innerHTML='<div class="state"><div class="spinner"></div>판매입력 파일 이력 불러오는 중…</div>';
    await loadLog();   // 열 때마다 새로 받는다(다른 사람이 만든 파일도 보이게)
    await loadRV();
    if(!OO.list) loadOpen();   // 진행 중 주문은 기다리지 않고 뒤에서 받아 채운다
    hookTimer();
    const q0=new URLSearchParams(location.search);   // 주소에 칸·주문·날짜가 있으면(새로고침·뒤로가기) 그 화면으로
    if(q0.get('c')||q0.get('o')||q0.get('d')){ OO.card=q0.get('c')||''; if(q0.get('d')) await loadRVDay(q0.get('d')); if(q0.get('o')){ OO.detail=q0.get('o'); if(OO.list) openDetail(OO.detail); } }
    else syncSub();
  }else if(!S.loadedMap){
    el.innerHTML='<div class="state"><div class="spinner"></div>품목코드 맵핑 불러오는 중…</div>';
    try{ await reloadMap(); S.loadedMap=true; }catch(e){ S.err=e; }
  }
  if(!S.confLoaded) await loadConf();
  if(S.page==='recon'&&!D.pending){ initDate(); await loadPending(); if(!D.loadedDate) D.date=D.pending.run[D.pending.run.length-1]; }
  if((S.page==='daily'||S.page==='recon')&&!D.loadedDate){ render(); D.loadedDate=true; await loadDailyC24(); return; }
  render();
};
// 점검(test_ecount.mjs)과 브라우저 확인용으로 내부 함수를 연다
window.__ecount={S,D,RV,TF,OO,LISTS,kstDay,loadOpen,undoFile,learnFromRecon,learnFromSaved,learn,parseEcount,payType,buildRows,compute,render,vdayOf,remainOf,ecRange,covered,ecTags,tfApply,SHIPPOL};
})();
