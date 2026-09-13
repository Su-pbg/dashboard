#!/usr/bin/env node
// cafe24 관리자에서 내보낸 회원 CSV 로 revenue-daily.json 의 회원 지표를 채운다.
//
// 왜 있나: 워커 tab=membercount 가 /admin/customers/count 404 로 죽어 있어
// (CLAUDE.md P0) 2026-08-01 이후 totalMembers 가 통째로 비었다. API 가 고쳐질
// 때까지의 수동 경로이자, 탈퇴자(withdrawnMembers) 의 유일한 실측 소스다.
//
// 사용:
//   node scripts/import-members-csv.mjs <csv...>            # 미리보기만
//   node scripts/import-members-csv.mjs <csv...> --write    # 실제 기록
//
// CSV 는 cafe24 회원 목록 내보내기 그대로. '회원 가입일' 이 채워진 파일(가입자)과
// '탈퇴일' 이 채워진 파일(탈퇴자)을 함께 주면 된다. 순서·개수 무관.
//
// 안전장치 (조용히 틀린 값을 쓰지 않기 위한 것들):
//   - 앵커(마지막 실측 totalMembers) 다음 날부터만 쓴다. 그 이전 누적은 안 건드린다.
//   - 가입 CSV 가 앵커 다음 날보다 늦게 시작하면 중단한다 (그 사이가 비면 누적이 어긋난다).
//     반대로 더 이른 날부터 담겨 있는 건 괜찮다 — 앵커 이전 구간은 그냥 무시한다.
//     덕분에 매번 같은 범위로 내보내도 계속 이어붙일 수 있다.
//   - 가입/탈퇴 CSV 의 마지막 날짜 중 빠른 쪽까지만 쓴다.
//     한쪽만 최신이면 다른 쪽의 0 이 '진짜 0' 인지 '아직 안 뽑힌 것' 인지 알 수 없다.
//   - revenue-daily.json 에 그날 행이 없으면 건너뛴다 (매출 수집이 만들면 다음에 채워짐).

import fs from 'node:fs';
import path from 'node:path';

const PATH = path.resolve(process.cwd(), 'revenue-daily.json');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const files = args.filter(a => !a.startsWith('--'));

const fail = (m) => { console.error(`[FAIL] ${m}`); process.exit(1); };
if (!files.length) fail('CSV 경로를 하나 이상 넘겨라');
if (!fs.existsSync(PATH)) fail(`${PATH} 가 없다`);

// ── CSV 파싱 (따옴표 안의 쉼표·줄바꿈까지 처리) ──
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0].map(h => h.replace(/^﻿/, '').trim());
  return rows.slice(1)
    .filter(r => r.some(v => v.trim()))
    .map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const day = (v) => (v || '').slice(0, 10);
const joins = new Map(), withdraws = new Map();
const bump = (m, d) => m.set(d, (m.get(d) || 0) + 1);

for (const f of files) {
  const rows = parseCsv(fs.readFileSync(f, 'utf8'));
  let j = 0, w = 0;
  for (const r of rows) {
    const jd = day(r['회원 가입일']), wd = day(r['탈퇴일']);
    if (jd) { bump(joins, jd); j++; }
    if (wd) { bump(withdraws, wd); w++; }
  }
  console.log(`[csv] ${path.basename(f)} — ${rows.length}행 (가입 ${j} · 탈퇴 ${w})`);
}
if (!joins.size) fail("'회원 가입일' 이 채워진 행이 없다 — 가입자 CSV 를 같이 넘겨라");
if (!withdraws.size) fail("'탈퇴일' 이 채워진 행이 없다 — 탈퇴자 CSV 를 같이 넘겨라");

const doc = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const byDate = new Map((doc.daily || []).map(r => [r.date, r]));

// 앵커: 마지막으로 실측된 totalMembers. 여기부터 순증을 쌓는다.
const anchor = (doc.daily || [])
  .filter(r => r.totalMembers != null && !r.totalMembersEstimated)
  .sort((a, b) => a.date.localeCompare(b.date)).at(-1);
if (!anchor) fail('실측 totalMembers 가 하나도 없다 — 누적을 시작할 기준이 없다');

const nextDay = (d) => new Date(Date.parse(d + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
const from = nextDay(anchor.date);
const firstJoin = [...joins.keys()].sort()[0];
if (firstJoin > from) {
  fail(`구간이 비었다. 앵커 ${anchor.date}(${anchor.totalMembers}명) 다음날은 ${from} 인데 `
     + `가입 CSV 는 ${firstJoin} 부터다. 사이 ${from}~ 구간이 없으면 누적이 어긋난다 — `
     + `${from} 부터 포함해서 다시 뽑아라`);
}
const to = [[...joins.keys()].sort().at(-1), [...withdraws.keys()].sort().at(-1)].sort()[0];
if (to < from) { console.log(`[--] 앵커(${anchor.date}) 이후 새 데이터가 없다 — 변경 없음`); process.exit(0); }

console.log(`\n[앵커] ${anchor.date} = ${anchor.totalMembers.toLocaleString()}명`);
console.log(`[구간] ${from} ~ ${to}${WRITE ? '' : '  (미리보기 — 기록하려면 --write)'}\n`);

let running = anchor.totalMembers, wrote = 0;
let lastWritten = null;              // 실제로 기록한 마지막 날 (건너뛴 날을 '최신'이라 보고하지 않기 위해)
const skipped = [];
for (let d = from; d <= to; d = nextDay(d)) {
  const n = joins.get(d) || 0, w = withdraws.get(d) || 0;
  running += n - w;
  const row = byDate.get(d);
  if (!row) { skipped.push(d); continue; }   // 매출 행이 아직 없다 → 억지로 만들지 않는다
  console.log(`  ${d}  가입 ${String(n).padStart(3)} · 탈퇴 ${String(w).padStart(2)} → ${running.toLocaleString()}`);
  lastWritten = { date: d, total: running };
  if (WRITE) {
    row.newMembers = n;
    row.withdrawnMembers = w;
    row.totalMembers = running;
    delete row.totalMembersEstimated;
  }
  wrote++;
}

if (skipped.length) console.log(`\n[--] 행이 없어 건너뜀 ${skipped.length}일: ${skipped.join(', ')}`);
if (!WRITE) { console.log(`\n[미리보기] ${wrote}일치가 기록될 예정. --write 를 붙여야 실제로 쓴다.`); process.exit(0); }

doc.updatedAt = new Date().toISOString();
fs.writeFileSync(PATH, JSON.stringify(doc), 'utf8');
console.log(`\n[ok] ${wrote}일치 기록 완료 · 최신 ${lastWritten.date} = ${lastWritten.total.toLocaleString()}명`);
