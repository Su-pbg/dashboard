// scripts/update-members.mjs
//
// 어제자 총 회원 수를 revenue-daily.json 에 기록한다.
//
// [왜 이렇게 하나]
// 원래는 slackbot 레포의 snapshot_new_members.py 가 이 값을 채웠는데 2026-07-31 이후
// 멈췄고, 그 레포는 이 작업 흐름 밖에 있다. 워커에 tab=membercount 가 생기면서
// cafe24 자격증명 없이도 회원 수를 구할 수 있게 됐다 — 워커가 이미 토큰을 쥐고 있고,
// 이 스크립트는 그 결과만 받아 적는다. 그래서 dashboard 레포 안에서 완결된다.
//
// [값의 성격]
// count(가입일 <= 어제) = "어제까지 가입했고 지금 남아 있는 회원 수".
// 매일 붙잡으면 실제 총 회원 수와 사실상 같다(하루 사이 탈퇴분만큼만 낮음).
// 과거를 한꺼번에 되짚을 때와 달리 오차가 쌓이지 않는다.
//
// [안 되는 것]
// 탈퇴자 수(withdrawnMembers)는 이 방식으로 못 구한다 → 순증·이탈률은 여전히 공백.

import fs from 'node:fs';

const WORKER = process.env.WORKER_URL || 'https://proud-sea-35f9.sugim-386.workers.dev';
const KEY    = process.env.DASHBOARD_KEY || 'pbg-secret-key-2026';
const PATH   = process.env.REVENUE_PATH || 'revenue-daily.json';

const pad = (n) => String(n).padStart(2, '0');
function yesterdayKST() {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  k.setUTCDate(k.getUTCDate() - 1);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  process.exit(1);
}

const pad2 = pad;
const addDays0 = (d, n) => {
  const t = new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
};

// 대상 기간 결정.
//  · FROM/TO 또는 TARGET_DATE 를 주면 그대로
//  · 아무것도 없으면 **빠진 날을 스스로 찾아 메운다** — 마지막으로 기록된 날 다음날부터 어제까지.
//    사람이 백필 버튼을 따로 누를 필요가 없도록. 수집이 며칠 멈춰도 다음 실행이 알아서 복구한다.
const MAX_BACKFILL_DAYS = 62;   // 한 번에 너무 많이 부르지 않도록 (워커 호출 2회분)
const yday = yesterdayKST();
let from, to;

if (process.env.FROM || process.env.TO || process.env.TARGET_DATE) {
  from = process.env.FROM || process.env.TARGET_DATE || yday;
  to   = process.env.TO   || process.env.TARGET_DATE || yday;
} else {
  if (!fs.existsSync(PATH)) fail(`${PATH} 가 없다`);
  const peek = JSON.parse(fs.readFileSync(PATH, 'utf8')).daily || [];
  // 추정값(totalMembersEstimated)은 '기록됨'으로 치지 않는다 → 실제 값으로 덮어쓴다
  const measured = peek.filter(r => r.totalMembers != null && !r.totalMembersEstimated);
  const lastOk = measured.length ? measured[measured.length - 1].date : null;
  from = lastOk ? addDays0(lastOk, 1) : yday;
  to = yday;
  if (from > to) { console.log(`[--] 빠진 날 없음 (마지막 기록 ${lastOk})`); process.exit(0); }
  const span = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (span > MAX_BACKFILL_DAYS) {
    from = addDays0(to, -(MAX_BACKFILL_DAYS - 1));
    console.log(`[--] 빠진 구간이 ${span}일이라 최근 ${MAX_BACKFILL_DAYS}일만 처리 (나머지는 다음 실행에서)`);
  }
  if (lastOk && from !== yday) console.log(`[..] 마지막 기록 ${lastOk} → 빠진 날 자동 보충`);
}
if (from > to) fail(`기간이 뒤집혔다: ${from} ~ ${to}`);
console.log(`[..] 대상 ${from === to ? from : `${from} ~ ${to}`}`);

// 워커는 한 번에 최대 31개 포인트만 돌려주므로(서브요청 한도), 31일씩 끊어 부른다.
const CHUNK = 31;
const addDays = addDays0;
const totals = new Map();   // date → total
let dimUsed = null;

for (let s = from; s <= to; s = addDays(s, CHUNK)) {
  const e = addDays(s, CHUNK - 1) > to ? to : addDays(s, CHUNK - 1);
  const qs = `bs=${s}&be=${e}&as=${s}&ae=${e}`
           + `&key=${encodeURIComponent(KEY)}&tab=membercount&nocache=1`;
  const res = await fetch(`${WORKER}/?${qs}`);
  if (!res.ok) fail(`워커 응답 ${res.status} (${s}~${e})`);
  const data = await res.json();
  if (data.error) fail(`워커 오류: ${data.error}${data.detail ? ' / ' + data.detail : ''}`);
  dimUsed = data.dimUsed || dimUsed;
  for (const pt of (data.points || [])) {
    const n = Number(pt.total);
    if (Number.isFinite(n) && n > 0) totals.set(pt.date, n);
  }
}
if (!totals.size) fail('회원 수를 한 건도 받지 못했다');
console.log(`[ok] ${totals.size}일치 수신 (파라미터 ${dimUsed})`);

if (!fs.existsSync(PATH)) fail(`${PATH} 가 없다`);
const doc = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const byDate = new Map((doc.daily || []).map(r => [r.date, r]));

let wrote = 0, skipped = [];
for (const [date, total] of [...totals].sort()) {
  const row = byDate.get(date);
  if (!row) {
    // 매출 수집이 아직 그날 행을 안 만든 상태. 억지로 만들지 않는다
    // (매출 없는 빈 행이 생기면 다른 집계가 어긋난다). 다음 실행에서 채워진다.
    skipped.push(date);
    continue;
  }
  if (row.totalMembers === total && !row.totalMembersEstimated) continue;  // 이미 같은 값
  row.totalMembers = total;
  // 워커가 되짚어 채운 추정값 표시가 붙어 있었다면 떼어낸다 (이제 실제로 수집한 값)
  delete row.totalMembersEstimated;
  wrote++;
}

if (skipped.length) console.log(`[--] 행이 아직 없어 건너뜀 ${skipped.length}일: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? ' …' : ''}`);
if (!wrote) { console.log('[--] 변경 없음'); process.exit(0); }

fs.writeFileSync(PATH, JSON.stringify(doc), 'utf8');
const last = [...totals].sort().at(-1);
console.log(`[ok] ${wrote}일치 기록 완료 · 최신 ${last[0]} = ${last[1].toLocaleString()}명`);
