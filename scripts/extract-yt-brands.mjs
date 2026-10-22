// 유튜브 설명란 → 브랜드 이름 (워커 /classify texts 모드 = Gemini)
//
// [왜 Gemini 인가] 설명란은 쿠팡 제휴문구·저작권 고지·해시태그가 본문보다 많다.
//   실측 3건 중 2건이 그랬다. 정규식 추출기로는 쓰레기가 나온다 — 블로그 제목 때 그랬다.
//   실측: 제휴 러그 영상 → [] · 저작권 고지 → [] · 국중박 굿즈 → [국립중앙박물관, 뮷즈]
//
// [한도] Gemini 무료 등급은 모델당 하루 20건이고 경비환급(/receipt)과 같은 키를 쓴다.
//   그래서 기본 5호출(=150글)로 묶는다. 넘기려면 --calls=N.
//
//   node scripts/extract-yt-brands.mjs            # 미리보기
//   node scripts/extract-yt-brands.mjs --write    # brand-dictionary.json 에 병합
import fs from 'node:fs';

const WORKER = 'https://proud-sea-35f9.sugim-386.workers.dev';
const KEY = fs.readFileSync(new URL('../.dashboard_key.local', import.meta.url), 'utf8').trim();
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const CALLS = Number(args.find(a => a.startsWith('--calls='))?.split('=')[1] || 5);
const PER = 30;                                   // 한 호출에 글 30개

const yd = JSON.parse(fs.readFileSync('yt-descs.json', 'utf8'));
const docs = [];
for (const [kw, list] of Object.entries(yd.descs || {})) for (const t of list) docs.push({ kw, t });
if (!docs.length) { console.log('yt-descs.json 에 글이 없다'); process.exit(0); }

const found = {};                                 // name -> {hits, queries(=키워드), cats}
let used = 0;
for (let i = 0; i < docs.length && used < CALLS; i += PER, used++) {
  const chunk = docs.slice(i, i + PER);
  // Gemini 가 혼잡하면 503 을 돌려준다 — 한도(429)와 달리 일시적이라 몇 초 쉬고 다시 묻는다.
  let r, j;
  for (let a = 0; a < 3; a++) {
    r = await fetch(`${WORKER}/classify?key=${KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: chunk.map(d => d.t) })
    });
    j = await r.json();
    if (r.ok || j.code === 'quota' || !/50[23]/.test(String(j.detail || j.error || r.status))) break;
    await new Promise(s => setTimeout(s, 5000 * (a + 1)));
  }
  if (!r.ok) { console.error(`[중단] ${r.status} ${j.error || ''}`); break; }
  for (const d of j.docs || []) {
    const kw = chunk[d.i]?.kw;
    for (const nm of d.brands || []) {
      const e = found[nm] || (found[nm] = { hits: 0, queries: [], cats: [] });
      e.hits++; if (kw && !e.queries.includes(kw)) { e.queries.push(kw); e.cats.push(kw); }
    }
  }
}

const bd = JSON.parse(fs.readFileSync('brand-dictionary.json', 'utf8'));
const names = Object.keys(found).sort((a, b) => found[b].hits - found[a].hits);
const fresh = names.filter(n => !bd.brands[n]);
console.log(`글 ${docs.length}개 중 ${Math.min(docs.length, used * PER)}개 읽음 (호출 ${used})`);
console.log(`이름 ${names.length}개 · 사전에 없던 것 ${fresh.length}개`);
for (const n of names.slice(0, 40)) console.log(`  ${bd.brands[n] ? ' ' : '+'} ${n.padEnd(20)} ${found[n].queries.join(', ')}`);

if (!WRITE) { console.log('\n--write 를 붙이면 brand-dictionary.json 에 병합한다'); process.exit(0); }
const date = (yd.updatedAt || new Date().toISOString().slice(0, 10));
for (const [n, e] of Object.entries(found)) {
  const cur = bd.brands[n] || (bd.brands[n] = { firstSeen: date, hits: 0, queries: [], cats: [], days: 0, src: 'yt' });
  cur.lastSeen = date; cur.hits += e.hits; cur.days += 1;
  cur.queries = [...new Set([...cur.queries, ...e.queries])].sort().slice(0, 12);
  cur.cats = [...new Set([...(cur.cats || []), ...e.cats])].sort().slice(0, 12);
}
bd.count = Object.keys(bd.brands).length;
fs.writeFileSync('brand-dictionary.json', JSON.stringify(bd));
console.log(`\n사전 ${bd.count}개로 기록`);
