// 경비환급 영수증 파서 검사.  실행: node test_expense.mjs [실측세트.json]
//   expense.html 안의 ExpCore 블록을 그대로 꺼내 돌린다 — 페이지와 같은 코드다.
//   일자·금액 규칙을 고치면 여기부터 돌린다.
//
// 실측세트(선택): 영수증 PDF 를 읽힌 OCR 텍스트 + 정답을 담은 JSON.
//   { "ym":"2026-09",
//     "pages":[ {"texts":["pass0 텍스트","pass1","pass2"]} , ... ],
//     "expect":[ {"date":"2026-09-01","amount":9400,"merchant":"컴포즈커피"}, ... ] }
//   실제 영수증 글자(카드번호·승인번호)가 들어 있으니 레포에 커밋하지 않는다.
import fs from 'fs'; import vm from 'vm'; import path from 'path';
const HERE = path.dirname(new URL(import.meta.url).pathname);

const html = fs.readFileSync(path.join(HERE, 'expense.html'), 'utf8');
const blk = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('root.ExpCore'));
if (!blk) { console.log('FAIL expense.html 에서 ExpCore 블록을 못 찾았다'); process.exit(1); }
const ctx = { module: { exports: {} } }; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(blk, ctx);
const C = ctx.ExpCore;

const ym = { y: 2026, m: 9 };
const d2s = d => d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : '';
let bad = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { bad++; console.log(`FAIL ${name}\n     나온 값 ${JSON.stringify(got)}\n     기대   ${JSON.stringify(want)}`); }
};

// 감열지 키오스크 전표에서 09 가 03·08 로 자주 읽힌다. 신청월 날짜가 하나도 없을 때만 월을 보정하고 fix 를 단다.
const 보정대상 = ['키오스크', '일시 2026-08-21 13:08', '받은금액 5,400'].join('\n');
const p1 = C.parseReceipt(보정대상, { ym });
check('월 보정: 일자', d2s(p1.date), '2026-09-21');
check('월 보정: fix 표시', !!p1.date.fix, true);
check('월 보정: 금액', p1.amount, 5400);
// 보정한 일자는 확신으로 치지 않는다 (여기서 끊으면 다시 읽을 기회를 버린다)
check('월 보정: isConfident 는 거부', C.isConfident(p1, ym), false);

// 제대로 읽힌 날짜는 건드리지 않는다
const p2 = C.parseReceipt(['거래일시 2026-09-03 10:40', '받은금액 9,400'].join('\n'), { ym });
check('정상 일자: 그대로', d2s(p2.date), '2026-09-03');
check('정상 일자: fix 없음', !!p2.date.fix, false);
check('정상 일자: isConfident', C.isConfident(p2, ym), true);

// 신청월 날짜가 하나라도 있으면 보정하지 않는다
const p3 = C.parseReceipt(['일시 2026-08-21 13:08', '승인일시 2026-09-03 10:40', '받은금액 9,400'].join('\n'), { ym });
check('신청월 후보 있으면 보정 안 함', [d2s(p3.date), !!p3.date.fix], ['2026-09-03', false]);

// 투표: 같은 날짜면 보정본보다 실제로 읽은 쪽을 남긴다
const m = C.mergeParses([p1, C.parseReceipt(['거래일시 2026-09-21 13:08', '받은금액 5,400'].join('\n'), { ym })], ym);
check('투표: 실제로 읽은 일자 우선', [d2s(m.date), !!m.date.fix], ['2026-09-21', false]);

// 금액: 부가세·공급가액 줄은 빼고 '받은금액' 을 쓴다
const p4 = C.parseReceipt(['부가세 과세 공급가액 8,545', '부가세 855', '받은금액 9,400'].join('\n'), { ym });
check('금액: 공급가액·부가세 제외', p4.amount, 9400);

// 분류
check('분류: SW 인보이스는 팀예산 外', (x => [x.sec, x.cat])(C.parseReceipt('Notion Labs Invoice\n청구금액 417,679', { ym })), ['out', '소모품 및 기타']);
check('분류: 택시는 교통비', C.parseReceipt('일성운수(주)\n결제요금(서울34아3034)\n합계 11,000', { ym }).cat, '교통비');

// ── 실측세트가 있으면 정확도까지 ──
const fx = process.argv[2];
if (fx && fs.existsSync(fx)) {
  const F = JSON.parse(fs.readFileSync(fx, 'utf8'));
  const [Y, M] = F.ym.split('-').map(Number); const fym = { y: Y, m: M };
  const rows = F.pages.map(pg => {
    const parsed = [];
    for (const t of pg.texts) {
      parsed.push(C.parseReceipt(t, { ym: fym, rules: [] }));
      if (parsed[0].page && parsed[0].page.no > 1) return parsed[0];
      if (C.isConfident(C.mergeParses(parsed, fym), fym)) break;
    }
    return C.mergeParses(parsed, fym);
  });
  const taken = new Set(); let ok = 0;
  for (const e of F.expect) {
    const i = rows.findIndex((r, i) => !taken.has(i) && r.amount === e.amount && d2s(r.date) === e.date);
    if (i >= 0) { taken.add(i); ok++; }
  }
  const floor = F.floor ?? 0;
  console.log(`실측세트 ${fx}: 일자+금액 모두 정확 ${ok}/${F.expect.length} (${(ok / F.expect.length * 100).toFixed(0)}%)`);
  if (ok < floor) { bad++; console.log(`FAIL 바닥선 ${floor} 아래로 떨어졌다`); }
} else if (fx) {
  console.log(`(실측세트 ${fx} 없음 — 내장 검사만 돌렸다)`);
}

console.log(bad ? `${bad}건 실패` : '전부 통과');
process.exit(bad ? 1 : 0);
