// 위탁 정산 — 왼쪽 메뉴 '위탁 정산'. index.html 의 enterSettle() 이 처음 열 때 이 파일을 불러와 loadSettleTab(el) 을 부른다.
//
// 순서 (팀이 실제로 하는 순서 그대로)
//   ① 월·담당자를 고르면 카페24 에서 그 담당자 공급사들의 판매 현황을 받는다 (워커 tab=orderitems).
//      담당자는 **거래처 LIST 의 '담당자' 열**(아트·라이프 탭)을 따른다. 대시보드 담당자 탭(supplier-managers.json)과 다르다.
//      공급사코드가 있으면 코드로, 없으면 그 행의 카페24 공급사명·브랜드명이 공급사명과 같을 때 잇는다. 구 탭은 담당자로 안 쓴다.
//   ② 이카운트 판매내역서(재고2·위탁)를 올려 ①과 주문번호 × 공급사 단위로 대조한다.
//   ③ 대조가 끝나면 업체별 정산서(xlsx)를 기존 양식 그대로 만들어 ZIP 으로 받는다.
//
// 접근: 대시보드와 같은 로그인(index.html 의 authGate · authHeaders). 비밀번호는 하나로 관리한다.
//
// 데이터
//   · 요율·정산서류·배송비: [이커머스] 거래처 LIST '카페 24 등록 공급사' 탭 — 워커 /settle 이 서비스계정으로 읽는다.
//   · 이카운트 파일은 고객 이름·연락처가 있어 워커로 보내지 않는다. 브라우저 안에서만 읽는다.
//   · 이카운트에는 공급사코드가 없다. 상품명 앞 브랜드로 공급사를 찾는다:
//     직접 연결(KV, 팀 공유) → 카페24 공급사명 → 같은 주문의 카페24 품목 → 거래처 LIST·담당자 맵의 브랜드명.
//
// 정산 계산 (2026-08 정산서 78개를 역산, 71개 원 단위 일치 — 나머지는 시트 값 변경·수기 판단)
//   · 정산금액 = 수량 × 정가 × (1 − 계약요율), 원 단위 반올림. 판매가·할인가가 아니라 정가 기준.
//   · 배송비: 시트에 배송비가 적힌 업체만 주문번호당 1건(무료배송 기준과 무관). 예외는 화면에서 주문별로 끈다.
//   · 세금계산서 업체만 하단에 공급가액(÷1.1 반올림)·세액·합계.
//   · 요율이 숫자가 아니거나("50%, 40%") 정산서류가 비면 '확인 필요'로 막고 ZIP 에서 뺀다.
(function(){
const CSS=`
.st-card{background:var(--surface);border-radius:var(--r-card);padding:var(--s5);margin-bottom:var(--s5);}
.st-card h2{font-size:18px;font-weight:700;margin:0;letter-spacing:-.02em;display:flex;align-items:center;gap:var(--s2);}
.st-step{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;font-size:13px;font-weight:700;}
.st-step.off{background:var(--hair);color:var(--muted);}
.st-lead{font-size:13px;color:var(--muted);margin:var(--s1) 0 var(--s4);}
.st-form{display:flex;gap:var(--s3);align-items:flex-end;flex-wrap:wrap;}
.st-form label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--muted);font-weight:600;}
.st-form input[type=month],.st-form select{font-family:var(--sans);font-size:14px;font-weight:500;border:0;border-radius:var(--r-ctrl);height:40px;padding:0 var(--s3);background:var(--fill);color:var(--ink);min-width:160px;}
.st-stat{font-size:13px;color:var(--ink-2);line-height:1.6;margin-top:var(--s3);}
.st-stat b{color:var(--ink);}
.st-stat.err{color:var(--down);}
.st-file{position:relative;overflow:hidden;}
.st-file input{position:absolute;inset:0;opacity:0;cursor:pointer;}
.st-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--s3);margin:var(--s4) 0;}
@media (max-width:760px){.st-kpis{grid-template-columns:repeat(2,1fr);}}
.st-kpi{background:var(--fill);border-radius:var(--r-ctrl);padding:var(--s3) var(--s4);}
.st-kpi .l{font-size:12px;color:var(--muted);font-weight:600;}
.st-kpi .n{font-size:20px;font-weight:700;margin-top:2px;letter-spacing:-.02em;}
.st-kpi .n.warn{color:var(--down);} .st-kpi .n.ok{color:var(--up);}
.st-bar{display:flex;gap:var(--s2);align-items:center;flex-wrap:wrap;margin:var(--s3) 0;}
.st-bar .sp{flex:1;}
.st-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
table.st-t{width:100%;border-collapse:collapse;font-size:13px;min-width:820px;}
.st-t th{text-align:right;font-weight:600;color:var(--muted);font-size:12px;padding:var(--s2);border-bottom:1px solid var(--hair);white-space:nowrap;}
.st-t td{padding:var(--s2);border-bottom:1px solid var(--hair);text-align:right;white-space:nowrap;vertical-align:middle;}
.st-t .l{text-align:left;}
.st-t tr.off>td,.st-t tr.off .st-name{color:var(--ghost);}
.st-name{background:none;border:0;padding:0;font:inherit;font-weight:600;color:var(--ink);cursor:pointer;text-align:left;}
.st-sub{font-size:11px;color:var(--muted);margin-top:2px;white-space:normal;}
.st-badge{display:inline-block;font-size:11px;font-weight:700;border-radius:6px;padding:1px 6px;margin-left:6px;vertical-align:1px;white-space:nowrap;}
.st-bad{background:var(--down-soft);color:var(--down);}
.st-warn{background:#FFF3E0;color:#C25E00;}
.st-ok{background:var(--up-soft);color:var(--up);}
.st-info{background:var(--fill);color:var(--ink-2);}
.st-in{font-family:var(--sans);font-size:13px;border:0;border-radius:8px;background:var(--fill);color:var(--ink);height:30px;padding:0 var(--s2);text-align:right;}
.st-in.rate{width:56px;} .st-in.fee{width:80px;}
tr.bad .st-in.rate{box-shadow:inset 0 0 0 2px var(--down);}
.st-in.map{width:100%;min-width:220px;text-align:left;}
.st-dl{background:var(--fill);border:0;border-radius:8px;height:30px;padding:0 10px;font:600 12px var(--sans);color:var(--ink-2);cursor:pointer;}
.st-dl:disabled{color:var(--ghost);cursor:not-allowed;}
.st-detail>td{background:var(--paper);text-align:left;white-space:normal;padding:var(--s4);}
.st-meta{font-size:12px;color:var(--ink-2);margin-bottom:var(--s3);display:flex;gap:var(--s2) var(--s4);flex-wrap:wrap;align-items:center;}
table.st-mini{width:100%;border-collapse:collapse;font-size:12px;background:var(--surface);border-radius:var(--r-ctrl);margin-bottom:var(--s3);}
.st-mini th{text-align:left;color:var(--muted);font-weight:600;padding:6px var(--s2);}
.st-mini td{padding:5px var(--s2);border-top:1px solid var(--hair);}
.st-mini .r{text-align:right;}
.st-mini tr.off td{color:var(--ghost);}
.st-seg{display:inline-flex;background:var(--fill);border-radius:var(--r-ctrl);padding:3px;gap:2px;}
.st-seg button{border:0;background:none;border-radius:9px;height:30px;padding:0 12px;font:600 12px var(--sans);color:var(--ink-2);cursor:pointer;}
.st-seg button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.06);}
.st-note{font-size:12px;color:var(--muted);line-height:1.6;margin:var(--s2) 0 0;}
.st-lock{font-size:13px;color:var(--muted);background:var(--fill);border-radius:var(--r-ctrl);padding:var(--s4);}
`;
const LIBS=[
  ['XLSX','https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'],
  ['ExcelJS','https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'],
  ['JSZip','https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'],
];
const ALL='__all__';
const nf=new Intl.NumberFormat('ko-KR');
const n=v=>nf.format(Math.round(v||0));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').replace(/[\s()\[\]&’'.\-_/]/g,'').toLowerCase();
const pad=v=>String(v).padStart(2,'0');
const $=id=>document.getElementById(id);

const S={
  root:null, month:'', mgr:'',
  sheet:null, sheetErr:null, sup:null, map:null,     // 거래처 LIST · 담당자 맵
  c24:null, c24Err:null, c24Loading:false,           // ① 카페24 판매
  sales:null, salesName:'', salesErr:null,           // ② 이카운트
  recon:null, reconView:'diff', reconOpen:null,      // ② 대조
  groups:[], unmatched:[], buyIn:[], open:null,      // ③ 정산
};

// ---------- 공통 ----------
function loadLibs(){
  return LIBS.reduce((p,[g,src])=>p.then(()=>window[g]?null:new Promise((ok,ng)=>{
    const sc=document.createElement('script'); sc.src=src; sc.onload=ok; sc.onerror=()=>ng(new Error(src+' 을 불러오지 못했습니다')); document.head.appendChild(sc);
  })),Promise.resolve());
}
async function getJSON(url,opt){
  const r=await fetch(url,{cache:'no-store',...opt,headers:{...authHeaders(),...((opt&&opt.headers)||{})}});
  const d=await r.json().catch(()=>({error:'HTTP '+r.status}));
  if(r.status===403&&!d.code) throw new Error('로그인이 만료됐습니다. 새로고침 후 다시 로그인해 주세요.');
  if(d.error){ const e=new Error(d.error); e.saEmail=d.saEmail; throw e; }
  return d;
}
function num(v){
  if(v===null||v===undefined||v==='') return null;
  if(typeof v==='number') return v;
  const s=String(v).replace(/[,₩원\s]/g,'');
  return /^-?\d+(\.\d+)?$/.test(s)?parseFloat(s):null;
}
function parseRate(v){
  if(typeof v==='number') return v>1?v/100:v;
  const s=String(v||'').trim();
  const m=s.match(/^(\d+(?:\.\d+)?)\s*%$/); if(m) return parseFloat(m[1])/100;
  if(/^0?\.\d+$|^[01]$/.test(s)) return parseFloat(s);
  return null;
}
function findHeader(rows,keys){
  for(let i=0;i<Math.min(rows.length,15);i++){
    const r=(rows[i]||[]).map(c=>String(c??'').replace(/^\*/,'').trim());
    if(keys.every(k=>r.includes(k))) return {idx:i,col:k=>r.indexOf(k)};
  }
  return null;
}
function monthRange(ym){
  const [y,m]=ym.split('-').map(Number);
  return {from:`${y}-${pad(m)}-01`, to:`${y}-${pad(m)}-${pad(new Date(y,m,0).getDate())}`, y, m};
}
const mgrOf=code=>(S.map&&S.map[code]&&S.map[code].mgr)||'(미지정)';
const inMgr=code=>S.mgr===ALL||mgrOf(code)===S.mgr;
const mgrLabel=()=>S.mgr===ALL?'전체 담당자':S.mgr;
function save(blob,name){
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
async function saveWorkbook(wb,name){
  const buf=await wb.xlsx.writeBuffer();
  save(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name);
}
const fileTag=()=>`${S.month.replace('-','.')}_${S.mgr===ALL?'전체':S.mgr}`;

// ---------- 거래처 LIST ----------
// "노은님 (벨류오브아트)" → 전체 · 괄호 앞 · 괄호 안 · ' - ' 앞 이름 모두로 찾게 한다
function nameVariants(s){
  s=String(s||'').trim();
  const v=new Set([s, s.replace(/\s*\(.*?\)\s*/g,' ').trim(), s.split(' - ')[0].trim()]);
  for(const m of s.matchAll(/\((.*?)\)/g)) v.add(m[1].trim());
  return [...v].filter(Boolean);
}
function parseSuppliers(sheets){
  const tab=Object.keys(sheets).find(k=>k.replace(/\s/g,'')==='카페24등록공급사');
  if(!tab) throw new Error("거래처 LIST 에 '카페 24 등록 공급사' 탭이 없습니다.");
  const rows=sheets[tab];
  const h=findHeader(rows,['공급사코드','계약 요율','정산 서류']);
  if(!h) throw new Error("'카페 24 등록 공급사' 탭의 머리글(공급사코드·계약 요율·정산 서류)을 찾지 못했습니다.");
  const cCode=h.col('공급사코드'), cName=cCode+1;   // 공급사명 머리글은 한 줄 위에 있다
  const c={type:h.col('계약 형태'),rate:h.col('계약 요율'),doc:h.col('정산 서류'),fee:h.col('배송비'),policy:h.col('배송비 정책'),method:h.col('배송 방식')};
  const at=(r,i)=>i<0?null:r[i];
  const str=v=>{const s=String(v??'').trim();return s&&s!=='-'?s:'';};
  const list=[];
  for(const r of rows.slice(h.idx+1)){
    const code=String(r[cCode]||'').trim();
    if(!/^S0/.test(code)) continue;
    list.push({code,name:str(r[cName]),type:str(at(r,c.type)),
      rateRaw:str(at(r,c.rate)),rate:parseRate(at(r,c.rate)),
      doc:str(at(r,c.doc)),feeRaw:str(at(r,c.fee)),fee:num(at(r,c.fee)),
      policy:str(at(r,c.policy)),method:str(at(r,c.method))});
  }
  if(!list.length) throw new Error("'카페 24 등록 공급사' 탭에서 공급사를 하나도 읽지 못했습니다.");
  const byCode=Object.fromEntries(list.map(s=>[s.code,s])), alias={};
  const addAlias=(name,code)=>{ for(const v of nameVariants(name)){ const k=norm(v); (alias[k] ||= []).includes(code) || alias[k].push(code); } };
  const byName={};
  for(const s of list) (byName[norm(s.name)] ||= []).push(s);
  // 거래처 LIST 행 → 공급사코드: 코드 열, 없으면 카페24 공급사명·브랜드명이 공급사명과 같을 때
  const codeOfRow=(code,c24name,brand)=>{
    if(byCode[code]) return code;
    for(const v of [c24name,...nameVariants(brand)]){ const hit=v&&byName[norm(v)]; if(hit&&hit.length===1) return hit[0].code; }
    return null;
  };
  const mgr={};
  for(const t of Object.keys(sheets).filter(k=>/^거래처\s*LIST/.test(k))){
    const rs=sheets[t]||[], hh=findHeader(rs,['입점여부']); if(!hh) continue;
    const cb=[hh.col('브랜드명'),hh.col('작가/브랜드명')].find(i=>i>=0);
    const cc=[hh.col('카페24 공급사코드'),hh.col('공급사 코드')].find(i=>i>=0);
    const cn=hh.col('카페24 공급사명'), cm=/구\)/.test(t)?-1:hh.col('담당자');   // 구 탭 담당자는 옛 값이라 안 쓴다
    if(cb==null) continue;
    for(const r of rs.slice(hh.idx+1)){
      const code=codeOfRow(cc==null?'':String(r[cc]||'').trim(), cn<0?'':String(r[cn]||'').trim(), r[cb]);
      if(!code) continue;
      addAlias(r[cb],code);
      const m=cm<0?'':String(r[cm]||'').trim();
      if(m&&!mgr[code]) mgr[code]=m;   // 같은 공급사가 여러 줄이면 먼저 나온 담당자
    }
  }
  S.map=Object.fromEntries(Object.entries(mgr).map(([k,v])=>[k,{mgr:v}]));
  // 같은 이름이 여러 개면 위탁 > 배송방식·요율이 채워진 쪽
  for(const k in byName) byName[k].sort((a,b)=>(/위탁/.test(b.type)-/위탁/.test(a.type))||((!!b.method)-(!!a.method))||((b.rate!=null)-(a.rate!=null)));
  return {list,alias,byName,byCode};
}

// ---------- ① 카페24 ----------
async function loadC24(){
  const {from,to}=monthRange(S.month);
  S.c24Loading=true; S.c24Err=null; render();
  try{
    const d=await getJSON(`${WORKER}/?bs=${from}&be=${to}&as=${from}&ae=${to}&tab=orderitems&from=${from}&to=${to}&full=1`);
    // 개인결제창은 상품 판매가 아니라 결제 링크라 뺀다
    const lines=(d.lines||[]).filter(l=>l.paywin!=='Y').map(l=>({...l,ok:l.canceled!=='Y'&&l.paid==='Y'}));
    S.c24={month:S.month,lines,truncated:!!d.truncated,orderCount:d.orderCount};
  }catch(e){ S.c24=null; S.c24Err=e; }
  S.c24Loading=false;
  rebuild(); render();
}
// 담당자 공급사만, 공급사별로 묶는다
// 매입 계약 공급사는 이카운트 재고2(위탁)에 애초에 안 들어온다 → 대사·정산 대상이 아니다.
// (2026-10-12 실측: 정윤희 8월 불일치 125건 대부분이 허명욱·윤여동 등 매입 업체였다.) '매입 + 위탁' 혼합은 대상으로 둔다.
const isBuyIn=code=>{ const s=S.sup&&S.sup.byCode[code]; return !!s&&s.type==='매입'; };
function c24BySupplier(){
  const g={};
  for(const l of (S.c24?S.c24.lines:[])){
    if(!inMgr(l.supplier_id)) continue;
    const x=(g[l.supplier_id] ||= {code:l.supplier_id,name:l.supplier_name,orders:new Set(),qty:0,sale:0,net:0,cancel:0,lines:[]});
    x.lines.push(l);
    if(l.ok){ x.orders.add(l.order_id); x.qty+=l.qty; x.sale+=l.sale; x.net+=l.net; } else x.cancel+=l.qty;
  }
  return Object.values(g).sort((a,b)=>b.net-a.net);
}
function c24Workbook(){
  const wb=new ExcelJS.Workbook(), ws=wb.addWorksheet('카페24 판매');
  ws.columns=[{header:'주문일',width:12},{header:'주문번호',width:20},{header:'담당자',width:10},{header:'공급사코드',width:12},{header:'공급사명',width:24},
    {header:'계약 형태',width:10},{header:'상품번호',width:10},{header:'상품명',width:60},{header:'수량',width:7},{header:'판매가',width:12},{header:'할인',width:11},{header:'매출',width:12},{header:'상태',width:10},{header:'제외',width:12}];
  ws.getRow(1).eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF7CAAC'}};c.font={bold:true};});
  for(const l of S.c24.lines.filter(l=>inMgr(l.supplier_id))){
    const s=S.sup&&S.sup.byCode[l.supplier_id];
    const r=ws.addRow([l.date,l.order_id,mgrOf(l.supplier_id),l.supplier_id,l.supplier_name,s?s.type:'',l.product_no,l.product_name,l.qty,Math.round(l.sale),Math.round(l.disc),Math.round(l.net),l.status,l.ok?'':(l.canceled==='Y'?'취소':'미결제')]);
    [9,10,11,12].forEach(i=>{r.getCell(i).numFmt='#,##0';});
  }
  ws.views=[{state:'frozen',ySplit:1}];
  return wb;
}

// ---------- ② 이카운트 ----------
function parseSales(wb){
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:null,blankrows:false});
  const h=findHeader(rows,['일자','품목코드','품명 및 규격','수량','정가']);
  if(!h) throw new Error('판매내역서 머리글(일자·품목코드·품명 및 규격·수량·정가)을 찾지 못했습니다. 이카운트 판매현황 엑셀이 맞는지 확인해 주세요.');
  const c={v:h.col('일자'),o:h.col('결제일'),code:h.col('품목코드'),name:h.col('품명 및 규격'),q:h.col('수량'),p:h.col('정가'),cust:h.col('고객명'),memo:h.col('적요')};
  const pm=rows.slice(0,h.idx).flat().join(' ').match(/(\d{4})\/(\d{2})\/\d{2}\s*~/);
  const at=(r,i)=>i<0?'':String(r[i]??'').trim();
  const out=[];
  for(const r of rows.slice(h.idx+1)){
    if(!r[c.code]) continue;   // 일계·총합계 행
    out.push({voucher:at(r,c.v),order:at(r,c.o),code:at(r,c.code),name:at(r,c.name),
      qty:num(r[c.q])||0,price:Math.round(num(r[c.p])||0),cust:at(r,c.cust),memo:at(r,c.memo)});
  }
  if(!out.length) throw new Error('판매 행을 하나도 읽지 못했습니다.');
  return {rows:out,month:pm?`${pm[1]}-${pm[2]}`:null};
}
// 상품명 "[온라인전용] 크놀라 / 데일리팩 [..]" → "크놀라"
const brandOf=name=>name.replace(/^(\s*\[[^\]]*\]\s*)+/,'').split(/\s*\/\s*/)[0].trim();
const bigrams=s=>{s=norm(s.replace(/\[[^\]]*\]/g,''));const g=new Set();for(let i=0;i<s.length-1;i++)g.add(s.slice(i,i+2));return g;};
function sim(a,b){const A=bigrams(a),B=bigrams(b);if(!A.size||!B.size)return 0;let k=0;for(const x of A)if(B.has(x))k++;return 2*k/(A.size+B.size);}
// 공급사 찾기: 직접 연결 → 카페24 공급사명 → 같은 주문의 카페24 품목 → 거래처 LIST·담당자 맵 브랜드명
function matchRow(r,byOrder){
  const sp=S.sup, brand=brandOf(r.name), m=(S.sheet.brandMap||{})[brand];
  if(m&&sp.byCode[m.code]) return {sup:sp.byCode[m.code],via:'직접 연결',brand};
  const vs=nameVariants(brand);
  for(const v of vs){ const hit=sp.byName[norm(v)]; if(hit) return {sup:hit[0],via:'공급사명',brand}; }
  const ls=(byOrder&&r.order&&byOrder.get(r.order))||[];
  if(ls.length){
    const codes=[...new Set(ls.map(l=>l.supplier_id))];
    let pick=codes.length===1?codes[0]:null;
    if(!pick){
      const prod=r.name.split(/\s*\/\s*/).slice(1).join(' ')||r.name;
      const sc=ls.map(l=>[l.supplier_id,sim(prod,l.product_name)]).sort((a,b)=>b[1]-a[1]);
      if(sc[0][1]>=.35&&(sc.length===1||sc[0][1]-sc[1][1]>=.1||sc[0][0]===sc[1][0])) pick=sc[0][0];
    }
    if(pick&&sp.byCode[pick]) return {sup:sp.byCode[pick],via:'카페24 주문',brand};
  }
  for(const v of vs){
    const codes=sp.alias[norm(v)]; if(!codes) continue;
    if(codes.length===1) return {sup:sp.byCode[codes[0]],via:'브랜드명',brand};
    return {sup:null,candidates:codes.map(c=>sp.byCode[c]),brand};
  }
  return {sup:null,candidates:[],brand};
}

// 주문번호 × 공급사 단위 대사. '[이커머스] 담당자 별 위탁 정산 시트' 의 '이카운트_대사' 탭과 같은 판정이다.
//   이카운트는 반품(-)까지 합친 순수량·합계(정가), 카페24 는 취소·미결제를 뺀 수량·상품구매금액.
//   정산 월 밖에서 주문된 건(이월·반품·선수금)은 카페24 월 조회에 없으니 '전월 주문'으로 따로 둔다.
//   금액 다름은 막지 않는다 — 카페24 할인 판매가와 이카운트 정가가 다른 경우가 있어 참고용이다.
function reconcile(){
  if(!S.c24||!S.sales||!S.sup) return null;
  const {from,to}=monthRange(S.month);
  const ymd=o=>{const m=String(o||'').match(/^(\d{4})(\d{2})(\d{2})-/);return m?`${m[1]}-${m[2]}-${m[3]}`:'';};
  const keys=new Map();
  const K=(order,code)=>{const k=order+'|'+code; if(!keys.has(k)) keys.set(k,{order,code,c24:0,c24c:0,c24amt:0,ec:0,ecamt:0,c24lines:[],eclines:[]}); return keys.get(k);};
  for(const l of S.c24.lines){ if(!inMgr(l.supplier_id)||isBuyIn(l.supplier_id)) continue; const x=K(l.order_id,l.supplier_id); x.c24lines.push(l); if(l.ok){ x.c24+=l.qty; x.c24amt+=Math.round(l.sale); } else x.c24c+=l.qty; }
  for(const r of S.sales.rows){ if(!r.sup||!inMgr(r.sup.code)) continue; const x=K(r.order||'(주문번호 없음)',r.sup.code); x.ec+=r.qty; x.ecamt+=r.qty*r.price; x.eclines.push(r); }
  const rows=[...keys.values()].map(x=>{
    const od=x.c24lines[0]?x.c24lines[0].date:ymd(x.order), inMonth=od>=from&&od<=to;
    let st;
    if(x.c24lines.length&&x.eclines.length) st=x.c24!==x.ec?'수량 다름':(x.c24amt!==x.ecamt?'금액 다름':'일치');
    else if(x.c24lines.length) st=x.c24===0?'취소':'이카운트 누락';
    else st=inMonth?'카페24에 없음':'전월 주문';
    return {...x,date:od,status:st};
  });
  const bySup={};
  for(const r of rows){
    const b=(bySup[r.code] ||= {code:r.code,c24:0,ec:0,c24amt:0,ecamt:0,c24o:0,eco:0,cnt:{},rows:[]});
    b.c24+=r.c24; b.ec+=r.ec; b.c24amt+=r.c24amt; b.ecamt+=r.ecamt; if(r.c24>0) b.c24o++; if(r.eclines.length) b.eco++;
    b.cnt[r.status]=(b.cnt[r.status]||0)+1; b.rows.push(r);
  }
  const unmatchedRows=S.sales.rows.filter(r=>!r.sup).length;
  return {rows,bySup:Object.values(bySup).sort((a,b)=>mismatch(b)-mismatch(a)||nameOf(a.code).localeCompare(nameOf(b.code),'ko')),unmatchedRows};
}
const BAD=['수량 다름','이카운트 누락','카페24에 없음'];
const mismatch=b=>BAD.reduce((t,k)=>t+(b.cnt[k]||0),0);
const nameOf=code=>(S.sup&&S.sup.byCode[code]&&S.sup.byCode[code].name)||(S.c24&&(S.c24.lines.find(l=>l.supplier_id===code)||{}).supplier_name)||code;
function reconWorkbook(){
  const wb=new ExcelJS.Workbook(), ws=wb.addWorksheet('대조');
  ws.columns=[{header:'결과',width:12},{header:'담당자',width:10},{header:'공급사코드',width:12},{header:'공급사',width:24},{header:'주문번호',width:20},{header:'주문일',width:12},
    {header:'카페24 수량',width:11},{header:'카페24 취소',width:11},{header:'이카운트 수량',width:12},{header:'카페24 금액',width:13},{header:'이카운트 금액',width:13},{header:'차이금액',width:12},{header:'카페24 상품',width:50},{header:'이카운트 전표',width:24},{header:'이카운트 품명',width:50}];
  ws.getRow(1).eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF7CAAC'}};c.font={bold:true};});
  const order=['수량 다름','이카운트 누락','카페24에 없음','금액 다름','전월 주문','취소','일치'];
  for(const r of S.recon.rows.slice().sort((a,b)=>order.indexOf(a.status)-order.indexOf(b.status)||nameOf(a.code).localeCompare(nameOf(b.code),'ko'))){
    const row=ws.addRow([r.status,mgrOf(r.code),r.code,nameOf(r.code),r.order,r.date,r.c24,r.c24c,r.ec,r.c24amt,r.ecamt,r.c24amt-r.ecamt,
      r.c24lines.map(l=>`${l.product_name} ×${l.qty}`).join('\n'),[...new Set(r.eclines.map(e=>e.voucher))].join(', '),r.eclines.map(e=>`${e.name} ×${e.qty}`).join('\n')]);
    [10,11,12].forEach(i=>{row.getCell(i).numFmt='#,##0';});
    if(BAD.includes(r.status)) row.getCell(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFEECEE'}};
  }
  ws.views=[{state:'frozen',ySplit:1}];
  return wb;
}

// ---------- ③ 정산 ----------
function rebuild(){
  if(!S.sales||!S.sup){ S.recon=null; S.groups=[]; return; }
  const byOrder=new Map();
  for(const l of (S.c24?S.c24.lines:[])) (byOrder.get(l.order_id)||byOrder.set(l.order_id,[]).get(l.order_id)).push(l);
  const unmatched={};
  for(const r of S.sales.rows){
    const m=matchRow(r,byOrder); r.sup=m.sup; r.via=m.via; r.brand=m.brand;
    if(!m.sup){ const u=(unmatched[m.brand] ||= {brand:m.brand,rows:0,amount:0,candidates:m.candidates}); u.rows++; u.amount+=r.qty*r.price; }
  }
  S.unmatched=Object.values(unmatched).sort((a,b)=>b.amount-a.amount);
  S.recon=reconcile();
  const prev=Object.fromEntries(S.groups.map(g=>[g.sup.code,g]));
  const groups={}, buyIn={};
  for(const r of S.sales.rows){
    if(!r.sup||!inMgr(r.sup.code)) continue;
    if(r.sup.type==='매입'){ (buyIn[r.sup.code] ||= {sup:r.sup,rows:0}).rows++; continue; }
    const g=(groups[r.sup.code] ||= {sup:r.sup,rows:[],brands:{}});
    g.rows.push(r); g.brands[r.brand]=r.via;
  }
  S.groups=Object.values(groups).map(g=>{
    const p=prev[g.sup.code];
    g.rateOverride=p?p.rateOverride:null; g.feeOverride=p?p.feeOverride:null; g.shipOff=p?p.shipOff:{};
    g.calc=compute(g);
    g.include=p?p.include:!g.calc.blocking.length;
    return g;
  }).sort((a,b)=>a.sup.name.localeCompare(b.sup.name,'ko'));
  S.buyIn=Object.values(buyIn);
}
function compute(g){
  const s=g.sup, issues=[], blocking=[];
  const rate=g.rateOverride!=null?g.rateOverride:s.rate;
  if(rate==null){ blocking.push('rate'); issues.push(s.rateRaw?`요율 "${s.rateRaw}" 확인`:'요율 없음'); }
  if(!s.doc){ blocking.push('doc'); issues.push('정산 서류 없음'); }
  const items=g.rows.map(r=>{const tot=r.qty*r.price; return {...r,tot,settle:Math.round(tot*(1-(rate||0)))};});
  const fee=g.feeOverride!=null?g.feeOverride:s.fee;
  // 업체 배송인데 시트에 배송비가 비어 있으면 배송비 행이 통째로 빠진다 → 알리고 표에서 바로 넣게 한다(막지는 않는다)
  if(fee==null&&s.feeRaw) issues.push(`배송비 "${s.feeRaw}" — 금액 입력 필요`);
  else if(fee==null&&/업체/.test(s.method)) issues.push('업체 배송인데 배송비 없음');
  const ships=[];
  if(fee!=null){
    const byOrder=new Map();
    for(const it of items){
      if(!it.order) continue;
      const o=byOrder.get(it.order);
      if(o) o.amount+=it.tot; else byOrder.set(it.order,{order:it.order,voucher:it.voucher,cust:it.cust,memo:it.memo,amount:it.tot});
    }
    for(const o of byOrder.values()){ const on=!g.shipOff[o.order], f=on?fee:0; ships.push({...o,on,qty:f>0?1:0,fee:f}); }
  }
  const sum=(a,k)=>a.reduce((t,x)=>t+x[k],0);
  const saleQ=sum(items,'qty'), saleF=sum(items,'tot'), saleG=sum(items,'settle'), shipQ=sum(ships,'qty'), shipF=sum(ships,'fee');
  const total=saleG+shipF, supply=Math.round(total/1.1);
  return {rate,fee,items,ships,saleQ,saleF,saleG,shipQ,shipF,totalF:saleF+shipF,total,supply,tax:total-supply,issues,blocking};
}
const FILL=c=>({type:'pattern',pattern:'solid',fgColor:{argb:'FF'+c}});
const NUMF='#,##0';
// 기존 정산서 서식 그대로 (열 너비·색·굵기·합계 위치까지 2026-08 원본과 셀 단위 동일)
function settleWorkbook(g){
  const c=g.calc, s=g.sup, M=+S.month.split('-')[1];
  const wb=new ExcelJS.Workbook(), ws=wb.addWorksheet('정산');
  ws.columns=[{width:35},{width:14},{width:60},{width:6},{width:14},{width:13},{width:13},{width:20}];
  const head=v=>{const r=ws.addRow(v); r.eachCell(x=>{x.fill=FILL('F7CAAC');x.alignment={horizontal:'center'};});};
  const line=v=>{const r=ws.addRow(v); [4,5,6,7].forEach(i=>{r.getCell(i).numFmt=NUMF;}); return r;};
  const total=(label,q,f,gv)=>{const r=line([label,'','',q,'',f,gv,'']); [1,4,6,7].forEach(i=>{r.getCell(i).font={bold:true};}); return r;};
  head(['일자','품목코드','품명 및 규격','수량','개당 소비자가','합 계','정산금액','비고']);
  for(const it of c.items) line([it.voucher,it.code,it.name,it.qty,it.price,it.tot,it.settle,'']);
  total('판매 계',c.saleQ,c.saleF,c.saleG);
  ws.addRow([]);
  head(['주문번호','일자','품명 및 규격','수량','주문 금액 합계','배송비','정산 금액','비고']);
  for(const o of c.ships) line([o.order,o.voucher,`배송비(${o.cust})`,o.qty,o.amount,o.fee,o.fee,'']);
  total('배송비 계',c.shipQ,c.shipF,c.shipF);
  ws.addRow([]);
  const t=total('위탁 정산 계','',c.totalF,c.total);
  for(let i=1;i<=8;i++) t.getCell(i).fill=FILL('F4B083');
  ws.addRow(['* '+(s.policy||'')]);
  const pay=ws.addRow(['','','','','',`${M}월 지급계`,c.total]);
  pay.getCell(6).fill=FILL('FFFF00'); pay.getCell(6).font={bold:true}; pay.getCell(7).font={bold:true}; pay.getCell(7).numFmt=NUMF;
  if(s.doc==='세금계산서'){
    ws.addRow([]);
    for(const [k,v] of [['공급가액',c.supply],['세액',c.tax],['합계',c.total]]){
      const r=ws.addRow(['','','','','',k,v]); r.getCell(7).numFmt=NUMF;
      if(k==='합계') [6,7].forEach(i=>{r.getCell(i).fill=FILL('A8D08D'); r.getCell(i).font={bold:true};});
    }
  }
  return wb;
}
const fileName=g=>`(${g.sup.doc})프린트베이커리_${+S.month.split('-')[1]}월 위탁 정산내역_${g.sup.name.replace(/[\\/:*?"<>|]/g,'_')}.xlsx`;
const ready=()=>S.groups.filter(g=>g.include&&!g.calc.blocking.length);
async function downloadZip(){
  const zip=new JSZip();
  for(const g of ready()) zip.file(fileName(g),await settleWorkbook(g).xlsx.writeBuffer());
  save(await zip.generateAsync({type:'blob'}),`위탁정산_${fileTag()}.zip`);
}

// ---------- 화면 ----------
function render(){
  if(!S.root) return;
  S.root.innerHTML=step1()+step2()+step3();
}
function step1(){
  const mgrs=[...new Set(Object.values(S.map||{}).map(v=>v.mgr).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  let body='';
  if(S.c24Loading) body='<div class="st-stat">카페24 주문 불러오는 중… (한 달치는 10~20초 걸립니다)</div>';
  else if(S.c24Err) body=`<div class="st-stat err">${esc(S.c24Err.message)}</div>`;
  else if(S.c24){
    const all=c24BySupplier(), sups=all.filter(x=>!isBuyIn(x.code)), buys=all.filter(x=>isBuyIn(x.code));
    const row=x=>{const s=S.sup&&S.sup.byCode[x.code];return `<tr><td class="l"><b>${esc(s?s.name:x.name)}</b> <span class="st-sub" style="display:inline">${esc(x.code)}${S.mgr===ALL?' · '+esc(mgrOf(x.code)):''}</span></td>
        <td class="l">${esc(s?s.type||'—':'시트에 없음')}</td><td class="l">${esc(s&&s.doc||'—')}</td>
        <td>${s?(s.rate!=null?Math.round(s.rate*1000)/10+'%':`<span class="st-badge st-warn" style="margin:0">${esc(s.rateRaw||'없음')}</span>`):'—'}</td>
        <td>${n(x.lines.filter(l=>l.ok).length)}</td><td>${n(x.orders.size)}</td><td>${n(x.qty)}</td><td>${n(x.sale)}</td><td>${n(x.net)}</td><td>${x.cancel?n(x.cancel):'<span style="color:var(--ghost)">0</span>'}</td></tr>`;};
    const orders=new Set(), tq=sups.reduce((t,x)=>{x.orders.forEach(o=>orders.add(o));return t+x.qty;},0);
    body=`<div class="st-kpis">
      <div class="st-kpi"><div class="l">공급사</div><div class="n">${sups.length}곳</div></div>
      <div class="st-kpi"><div class="l">주문</div><div class="n">${n(orders.size)}건</div></div>
      <div class="st-kpi"><div class="l">판매 수량</div><div class="n">${n(tq)}개</div></div>
      <div class="st-kpi"><div class="l">상품구매금액</div><div class="n">${n(sups.reduce((t,x)=>t+x.sale,0))}원</div></div></div>
      ${S.c24.truncated?'<div class="st-stat err">주문이 너무 많아 일부만 받았습니다(워커 페이지 한도). 대조 결과를 그대로 믿지 마세요.</div>':''}
      <div class="st-bar"><span class="st-note" style="margin:0">주문일 ${monthRange(S.month).from} ~ ${monthRange(S.month).to} · 취소·미결제·개인결제창 제외</span><span class="sp"></span>
        <button class="st-dl" data-a="c24dl">판매 리스트 xlsx</button></div>
      <div class="st-scroll"><table class="st-t"><thead><tr><th class="l">공급사</th><th class="l">계약</th><th class="l">정산 서류</th><th>수수료율</th><th>주문 줄</th><th>주문</th><th>수량</th><th>상품구매금액</th><th>매출(할인 후)</th><th>취소 수량</th></tr></thead><tbody>
      ${sups.map(row).join('')}
      </tbody></table></div>
      ${buys.length?`<p class="st-note" style="margin-top:var(--s4)"><b style="color:var(--ink-2)">매입 계약 ${buys.length}곳 — 대사·정산 제외</b> · 이카운트 재고2(위탁)에 들어오지 않는 업체입니다 (상품구매금액 ${n(buys.reduce((t,x)=>t+x.sale,0))}원)</p>
      <div class="st-scroll"><table class="st-t" style="opacity:.6"><tbody>${buys.map(row).join('')}</tbody></table></div>`:''}`;
  }
  return `<div class="st-card"><h2><span class="st-step">1</span>카페24 판매 현황</h2>
    <p class="st-lead">정산 월과 담당자를 고르면 그 담당자가 맡은 공급사의 카페24 판매를 불러옵니다. 담당자는 거래처 LIST 의 담당자 열 기준입니다(대시보드 담당자 탭과 다를 수 있음).</p>
    <div class="st-form">
      <label>정산 월<input type="month" id="stMonth" value="${esc(S.month)}"></label>
      <label>담당자<select id="stMgr"><option value="">선택</option>${mgrs.map(m=>`<option ${S.mgr===m?'selected':''}>${esc(m)}</option>`).join('')}<option value="(미지정)" ${S.mgr==='(미지정)'?'selected':''}>(미지정)</option><option value="${ALL}" ${S.mgr===ALL?'selected':''}>전체</option></select></label>
      <button class="go" data-a="c24" ${S.month&&S.mgr&&!S.c24Loading?'':'disabled'}>판매 불러오기</button>
    </div>${body}</div>`;
}
function step2(){
  const on=!!S.c24;
  let body='';
  if(!on) body='<div class="st-lock">① 카페24 판매를 먼저 불러오세요.</div>';
  else{
    body=`<div class="st-bar"><span class="go st-file" style="height:36px">이카운트 파일 올리기<input type="file" id="stSalesFile" accept=".xlsx,.xls" aria-label="이카운트 판매내역서"></span>
      <span class="st-note" style="margin:0">${S.sales?`<b style="color:var(--ink)">${esc(S.salesName)}</b> · ${n(S.sales.rows.length)}행`:'이카운트 판매현황 · 온라인 전체 · 재고2(위탁) 엑셀 — 고객 정보가 있어 서버로 보내지 않습니다'}</span></div>
      ${S.salesErr?`<div class="st-stat err">${esc(S.salesErr.message)}</div>`:''}
      ${S.sheetErr?`<div class="st-stat err">${esc(S.sheetErr.message)}${S.sheetErr.saEmail?` — 공유할 이메일: <b>${esc(S.sheetErr.saEmail)}</b>`:''} <button class="st-dl" data-a="sheet">다시 읽기</button></div>`:''}
      ${S.recon?reconBody():''}`;
  }
  return `<div class="st-card"><h2><span class="st-step ${on?'':'off'}">2</span>이카운트 대조</h2>
    <p class="st-lead">이카운트 판매내역서를 올리면 ①과 주문번호 × 공급사 단위로 수량·금액을 맞춰 봅니다.</p>${body}</div>`;
}
function reconBody(){
  const R=S.recon, cnt={};
  for(const r of R.rows) cnt[r.status]=(cnt[r.status]||0)+1;
  const bad=BAD.reduce((t,k)=>t+(cnt[k]||0),0);
  const view=S.reconView;
  const list=R.bySup.filter(b=>view==='all'||mismatch(b)>0);
  const tag=st=>`<span class="st-badge ${st==='일치'?'st-ok':BAD.includes(st)?'st-bad':st==='금액 다름'?'st-warn':'st-info'}">${st}</span>`;
  return `<div class="st-kpis">
      <div class="st-kpi"><div class="l">일치</div><div class="n ok">${n(cnt['일치']||0)}건</div></div>
      <div class="st-kpi"><div class="l">불일치 (수량·누락)</div><div class="n ${bad?'warn':''}">${n(bad)}건</div></div>
      <div class="st-kpi"><div class="l">전월 주문 (이월·반품)</div><div class="n">${n(cnt['전월 주문']||0)}건</div></div>
      <div class="st-kpi"><div class="l">공급사 못 찾은 이카운트 행</div><div class="n ${R.unmatchedRows?'warn':''}">${n(R.unmatchedRows)}행</div></div></div>
    ${S.unmatched.length?unmatchedTable():''}
    <div class="st-bar"><div class="st-seg"><button data-a="view" data-v="diff" class="${view==='diff'?'on':''}">불일치 있는 공급사</button><button data-a="view" data-v="all" class="${view==='all'?'on':''}">전체</button></div>
      <span class="sp"></span><button class="st-dl" data-a="recondl">대조표 xlsx</button></div>
    <div class="st-scroll"><table class="st-t"><thead><tr><th class="l">공급사</th><th>카페24 주문</th><th>이카운트 주문</th><th>카페24 수량</th><th>이카운트 수량</th><th>카페24 금액</th><th>이카운트 금액</th><th class="l">결과</th></tr></thead><tbody>
    ${list.length?list.map(b=>{const open=S.reconOpen===b.code, mm=mismatch(b);
      return `<tr><td class="l"><button class="st-name" data-a="ropen" data-c="${esc(b.code)}">${open?'▾':'▸'} ${esc(nameOf(b.code))}</button>${S.mgr===ALL?`<span class="st-sub" style="display:inline"> · ${esc(mgrOf(b.code))}</span>`:''}</td>
        <td>${n(b.c24o)}</td><td>${n(b.eco)}</td><td>${n(b.c24)}</td><td>${n(b.ec)}</td><td>${n(b.c24amt)}</td><td>${n(b.ecamt)}</td>
        <td class="l">${mm?`<span class="st-badge st-bad">불일치 ${mm}</span>`:'<span class="st-badge st-ok">일치</span>'}${b.cnt['금액 다름']?`<span class="st-badge st-warn">금액 다름 ${b.cnt['금액 다름']}</span>`:''}${b.cnt['전월 주문']?`<span class="st-badge st-info">전월 ${b.cnt['전월 주문']}</span>`:''}</td></tr>
        ${open?`<tr class="st-detail"><td colspan="8"><table class="st-mini"><thead><tr><th>주문번호</th><th>주문일</th><th class="r">카페24 수량</th><th class="r">이카운트 수량</th><th class="r">카페24 금액</th><th class="r">이카운트 금액</th><th>결과</th><th>상품</th></tr></thead><tbody>
          ${b.rows.slice().sort((x,y)=>BAD.includes(y.status)-BAD.includes(x.status)||x.order.localeCompare(y.order)).map(r=>`<tr><td>${esc(r.order)}</td><td>${esc(r.date)}</td><td class="r">${r.c24}${r.c24c?` <span style="color:var(--muted)">(취소 ${r.c24c})</span>`:''}</td><td class="r">${r.eclines.length?r.ec:'—'}</td><td class="r">${r.c24lines.length?n(r.c24amt):'—'}</td><td class="r">${r.eclines.length?n(r.ecamt):'—'}</td><td>${tag(r.status)}</td>
            <td>${esc((r.c24lines[0]||{}).product_name||(r.eclines[0]||{}).name||'')}${r.c24lines.length+r.eclines.length>1?` <span style="color:var(--muted)">외</span>`:''}</td></tr>`).join('')}
          </tbody></table></td></tr>`:''}`;}).join(''):'<tr><td class="l" colspan="8" style="color:var(--muted)">불일치가 없습니다.</td></tr>'}
    </tbody></table></div>
    <p class="st-note">이카운트 누락 = 카페24 주문인데 이카운트에 없음(다음 달 출고·전표 누락) · 카페24에 없음 = 이번 달 주문번호인데 카페24 담당자 공급사에 없음(공급사 매칭 확인) · 금액 다름 = 수량은 같고 카페24 상품구매금액과 이카운트 정가 합계가 다름(할인 판매 등, 참고) · 전월 주문 = 이전 달 주문의 반품·이월·선수금 전표라 정상</p>`;
}
function unmatchedTable(){
  const opts=S.sup.list.filter(s=>s.type!=='매입').map(s=>`<option value="${esc(s.name)} · ${s.code}"></option>`).join('');
  return `<div style="margin:var(--s3) 0 var(--s4)"><div class="st-stat" style="margin:0 0 var(--s2)"><b>공급사를 못 찾은 브랜드</b> — 연결하면 팀 전체에 저장돼 다음 달부터 자동으로 붙습니다. 다른 담당자 공급사일 수도 있습니다.</div>
    <div class="st-scroll"><table class="st-t"><thead><tr><th class="l">상품명 브랜드</th><th>행</th><th>판매 합계</th><th class="l">공급사 연결</th></tr></thead><tbody>
    ${S.unmatched.map(u=>`<tr><td class="l">${esc(u.brand)}${u.candidates&&u.candidates.length?`<div class="st-sub">후보: ${u.candidates.map(s=>`${esc(s.name)} · ${s.code}`).join(' / ')}</div>`:''}</td>
      <td>${u.rows}</td><td>${n(u.amount)}</td><td class="l"><input class="st-in map" data-a="map" data-b="${esc(u.brand)}" list="stSupList" placeholder="공급사 검색 후 선택"></td></tr>`).join('')}
    </tbody></table></div><datalist id="stSupList">${opts}</datalist></div>`;
}
function step3(){
  const on=!!S.recon;
  let body='';
  if(!on) body='<div class="st-lock">② 이카운트 대조를 먼저 하세요.</div>';
  else{
    const ok=ready(), bad=S.recon.rows.filter(r=>BAD.includes(r.status)).length;
    body=`<div class="st-bar"><span class="st-note" style="margin:0">업체명을 누르면 품목·배송비가 펼쳐집니다. 수수료율·배송비는 이번 정산에만 적용되고 시트는 그대로입니다.</span><span class="sp"></span>
      <button class="go" data-a="zip" ${ok.length?'':'disabled'}>정산서 ${ok.length}개 ZIP · ${n(ok.reduce((t,g)=>t+g.calc.total,0))}원</button></div>
      ${bad?`<div class="st-stat err" style="margin:0 0 var(--s3)">② 대조에 불일치 ${bad}건이 남아 있습니다. 확인 후 받으세요.</div>`:''}
      <div class="st-scroll"><table class="st-t"><thead><tr><th class="l"></th><th class="l">공급사</th><th class="l">정산 서류</th><th>수수료</th><th>품목</th><th>판매 합계</th><th>주문당 배송비</th><th>지급계</th><th></th></tr></thead>
      <tbody>${S.groups.length?S.groups.map(groupRow).join(''):'<tr><td class="l" colspan="9" style="color:var(--muted)">이 담당자의 위탁 공급사 판매가 이카운트 파일에 없습니다.</td></tr>'}</tbody></table></div>
      ${S.buyIn.length?`<p class="st-note">매입 계약이라 뺀 공급사: ${S.buyIn.map(b=>`${esc(b.sup.name)}(${b.rows}행)`).join(', ')}</p>`:''}
      <p class="st-note">정산금액 = 수량 × 정가 × (1 − 수수료율) · 배송비는 주문번호당 1건(시트 값, 비어 있으면 표에서 입력 — 이번 정산에만 적용) · 특정 주문을 빼려면 업체명을 눌러 주문별로 끄세요 · 세금계산서 업체는 공급가액·세액 포함</p>`;
  }
  return `<div class="st-card"><h2><span class="st-step ${on?'':'off'}">3</span>정산서 만들기</h2>
    <p class="st-lead">업체별 정산서를 기존 양식 그대로 만듭니다. 요율·정산 서류·배송비는 거래처 LIST 시트를 그대로 읽고, 비어 있으면 여기서 넣으면 됩니다.</p>${body}</div>`;
}
function groupRow(g,i){
  const c=g.calc, bad=c.blocking.length>0, open=S.open===g.sup.code, on=g.include&&!bad;
  const badge=bad?`<span class="st-badge st-bad">${esc(c.issues[0])}</span>`:(c.issues.length?`<span class="st-badge st-warn">${esc(c.issues[0])}</span>`:'');
  // 공급사명과 다른 이름으로 팔린 브랜드를 같이 보여 준다 (공급사명으로 바로 잡힌 건 뺀다)
  const diff=Object.entries(g.brands).filter(([,via])=>via!=='공급사명');
  const brands=diff.length?`<div class="st-sub">상품명 브랜드: ${diff.map(([b,via])=>`${esc(b)} (${via})`).join(', ')}</div>`:'';
  return `<tr class="${bad?'bad':''} ${on?'':'off'}">
    <td class="l"><input type="checkbox" data-a="inc" data-i="${i}" ${on?'checked':''} ${bad?'disabled':''} aria-label="${esc(g.sup.name)} 포함"></td>
    <td class="l"><button class="st-name" data-a="open" data-i="${i}" aria-expanded="${open}">${open?'▾':'▸'} ${esc(g.sup.name)}</button>${badge}${brands}</td>
    <td class="l">${esc(g.sup.doc||'—')}</td>
    <td><input class="st-in rate" data-a="rate" data-i="${i}" type="number" step="1" min="0" max="100" value="${c.rate!=null?Math.round(c.rate*1000)/10:''}" placeholder="?" aria-label="${esc(g.sup.name)} 수수료율">%</td>
    <td>${c.items.length}</td><td>${n(c.saleF)}</td>
    <td><input class="st-in fee" data-a="fee" data-i="${i}" type="number" step="100" min="0" value="${c.fee??''}" placeholder="없음" aria-label="${esc(g.sup.name)} 주문당 배송비">원
      <div class="st-sub">${c.fee==null?'배송비 행 없음':`${c.ships.filter(o=>o.on&&o.fee>0).length}건 · ${n(c.shipF)}원`}</div></td>
    <td>${bad?'<span style="color:var(--ghost)">—</span>':`<b>${n(c.total)}</b>`}</td>
    <td><button class="st-dl" data-a="one" data-i="${i}" ${bad?'disabled':''}>xlsx</button></td>
  </tr>${open?detailRow(g,i):''}`;
}
function detailRow(g,i){
  const c=g.calc, s=g.sup;
  const items=c.items.map(it=>`<tr><td>${esc(it.voucher)}</td><td>${esc(it.name)}</td><td class="r">${it.qty}</td><td class="r">${n(it.price)}</td><td class="r">${n(it.tot)}</td><td class="r">${n(it.settle)}</td></tr>`).join('');
  const ships=c.ships.length?c.ships.map(o=>`<tr class="${o.on?'':'off'}"><td><label><input type="checkbox" data-a="ship" data-i="${i}" data-o="${esc(o.order)}" ${o.on?'checked':''}> ${esc(o.order)}</label></td><td>${esc(o.voucher)} · ${esc(o.cust)}${o.memo?` <span style="color:var(--muted)">(${esc(o.memo)})</span>`:''}</td><td class="r">${n(o.amount)}</td><td class="r">${n(o.fee)}</td></tr>`).join('')
    :`<tr><td colspan="4" style="color:var(--muted)">${c.fee==null?'배송비 없음 (시트에 배송비가 비어 있음)':'주문번호가 있는 행이 없습니다'}</td></tr>`;
  return `<tr class="st-detail"><td></td><td colspan="8">
    <div class="st-meta"><span>${esc(s.code)}</span><span>${esc(s.type||'계약형태 미기재')} · ${esc(s.method||'배송방식 미기재')}</span>
      <span>시트 배송비 ${s.fee!=null?n(s.fee)+'원':esc(s.feeRaw||'없음')}</span><span>${esc(s.policy||'배송비 정책 없음')}</span></div>
    <table class="st-mini"><thead><tr><th>일자</th><th>품명</th><th class="r">수량</th><th class="r">정가</th><th class="r">합계</th><th class="r">정산금액</th></tr></thead><tbody>${items}</tbody></table>
    <table class="st-mini"><thead><tr><th>주문번호 (체크 해제하면 배송비 제외)</th><th>일자 · 고객</th><th class="r">주문 금액</th><th class="r">배송비</th></tr></thead><tbody>${ships}</tbody></table>
  </td></tr>`;
}

// ---------- 이벤트 ----------
async function loadSheet(refresh){
  S.sheetErr=null;
  try{
    const d=await getJSON(WORKER+'/settle'+(refresh?'?refresh=1':''));
    S.sheet=d; S.sup=parseSuppliers(d.sheets);
  }catch(e){ S.sheetErr=e; }
  rebuild(); render();
}
async function onSalesFile(f){
  S.salesErr=null;
  try{
    const p=parseSales(XLSX.read(await f.arrayBuffer(),{type:'array'}));
    if(p.month&&p.month!==S.month) throw new Error(`이 파일은 ${p.month.replace('-','년 ')}월 판매내역서입니다. ① 의 정산 월(${S.month})과 맞춰 주세요.`);
    S.sales=p; S.salesName=f.name; S.groups=[]; S.open=null; S.reconOpen=null;
  }catch(e){ S.salesErr=e; }
  rebuild(); render();
}
async function saveMap(brand,code){
  try{
    const d=await getJSON(WORKER+'/settle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({brand,code})});
    (S.sheet.brandMap ||= {})[brand]=d.saved;
    rebuild(); render();
  }catch(e){ alert('저장하지 못했습니다: '+e.message); }
}
function wire(root){
  root.addEventListener('change',e=>{
    const t=e.target, a=t.dataset.a;
    if(t.id==='stMonth'||t.id==='stMgr'){
      S.month=$('stMonth').value; S.mgr=$('stMgr').value;
      // 월·담당자가 바뀌면 ①부터 다시. 이카운트 파일은 월이 같으면 그대로 둔다
      if(S.c24&&S.c24.month!==S.month){ S.c24=null; S.sales=null; S.salesName=''; }
      S.groups=[]; rebuild(); render(); return;
    }
    if(t.id==='stSalesFile'){ const f=t.files[0]; if(f) onSalesFile(f); t.value=''; return; }
    if(a==='map'){ const code=(t.value.match(/S0\w+$/)||[])[0]; if(code&&S.sup.byCode[code]) saveMap(t.dataset.b,code); return; }
    const g=S.groups[+t.dataset.i]; if(!g) return;
    if(a==='inc') g.include=t.checked;
    else if(a==='rate'){ const v=t.value===''?null:parseFloat(t.value)/100; g.rateOverride=v===g.sup.rate?null:v; g.calc=compute(g); if(!g.calc.blocking.length) g.include=true; }
    else if(a==='fee'){ g.feeOverride=t.value===''?null:parseFloat(t.value); g.calc=compute(g); }
    else if(a==='ship'){ g.shipOff[t.dataset.o]=!t.checked; g.calc=compute(g); }
    else return;
    render();
  });
  root.addEventListener('click',async e=>{
    const t=e.target.closest('button'); if(!t) return;
    const a=t.dataset.a;
    const busy=async(fn)=>{const txt=t.textContent;t.disabled=true;t.textContent='만드는 중…';try{await fn();}catch(err){alert('파일을 만들지 못했습니다: '+err.message);}finally{t.disabled=false;t.textContent=txt;}};
    if(a==='c24') return loadC24();
    if(a==='sheet') return loadSheet(true);
    if(a==='c24dl') return busy(()=>saveWorkbook(c24Workbook(),`카페24판매_${fileTag()}.xlsx`));
    if(a==='recondl') return busy(()=>saveWorkbook(reconWorkbook(),`이카운트대조_${fileTag()}.xlsx`));
    if(a==='view'){ S.reconView=t.dataset.v; return render(); }
    if(a==='ropen'){ S.reconOpen=S.reconOpen===t.dataset.c?null:t.dataset.c; return render(); }
    if(a==='zip'){
      const bad=S.recon.rows.filter(r=>BAD.includes(r.status)).length;
      if(bad&&!confirm(`이카운트 대조 불일치가 ${bad}건 남아 있습니다. 그래도 정산서를 받을까요?`)) return;
      return busy(downloadZip);
    }
    const g=S.groups[+t.dataset.i]; if(!g) return;
    if(a==='open'){ S.open=S.open===g.sup.code?null:g.sup.code; render(); }
    if(a==='one') busy(()=>saveWorkbook(settleWorkbook(g),fileName(g)));
  });
}

window.loadSettleTab=async function(el){
  if(!document.getElementById('stCss')){ const s=document.createElement('style'); s.id='stCss'; s.textContent=CSS; document.head.appendChild(s); }
  S.root=el;
  if(!S.month){ const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); S.month=`${d.getFullYear()}-${pad(d.getMonth()+1)}`; }   // 기본은 지난달
  el.innerHTML='<div class="state"><div class="spinner"></div>거래처 LIST 불러오는 중…</div>';
  wire(el);
  try{ await loadLibs(); }catch(e){ S.salesErr=e; }
  await loadSheet(false);
};
// 테스트용
window.__settle={S,parseSuppliers,parseSales,rebuild,settleWorkbook,fileName,reconcile};
})();
