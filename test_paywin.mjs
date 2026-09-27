// 개인결제창 제외 규칙 검사.  실행: node test_paywin.mjs
// worker.js 의 isExcludedPaywin 과 같은 규칙이다. 규칙을 고치면 여기부터 돌린다.

// CLAUDE.md '개인결제창 제외' 규칙을 그대로 옮긴 것.
// 남긴다: '이커머스팀 /' · '커머스 /' · 'E /' 접두, 접두 없는 '개인결제창 - OOO님'
// 뺀다  : COM · HQ · IP · PB'S · PBG결제 · 커뮤니티(팀) · 판교 · 운영기획팀 · 저작권사업팀
const PAYWIN_KEEP = /^\s*(이커머스팀|커머스|E)\s*\//;
function isExcludedPaywin(name) {
  if (!name || name.indexOf('개인결제') < 0) return false;
  if (PAYWIN_KEEP.test(name)) return false;
  return name.indexOf('/') >= 0;
}
const cases = [
  ['COM / 개인결제창_이*진님', true],
  ['이커머스팀 / 개인결제창 - 김현구님', false],
  ['커머스 / 개인결제창 - 홍길동님', false],
  ['E / 개인결제창 - 아무개님', false],
  ['개인결제창 - 김철수님', false],
  ['HQ / 개인결제창_박영희님', true],
  ["PB'S / 개인결제창", true],
  ['저작권사업팀 / 개인결제창 - 최씨', true],
  ['운영기획팀 / 개인결제창', true],
  ['판교 / 개인결제창', true],
  ['붓질 143', false],
  ['Flowerball Brown', false],
  [null, false],
];
let bad = 0;
for (const [name, want] of cases) {
  const got = isExcludedPaywin(name);
  if (got !== want) { bad++; console.log(`FAIL ${JSON.stringify(name)} → ${got} (기대 ${want})`); }
}
console.log(bad ? `${bad}건 실패` : `전부 통과 (${cases.length}건)`);
process.exit(bad ? 1 : 0);
