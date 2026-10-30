# HANDOFF — 세션 인수인계

## 마지막 세션
2026-10-29 (Mac mini, Claude). Mac mini 를 유일한 로컬로 세팅(node 24·wrangler·openpyxl, 레포 4개 클론), 워커 배포 2회(95b634fb → 4015ff2b), KPI 시트 수집 효율화 기획(8단계), 에이전트 협업 세팅(AGENTS/HANDOFF/훅).

## 현재 상태
- 배포된 워커 = 커밋 ab0d86b(버전 a1d222fa, 2026-10-29 14:2x). 기획 1단계(6-3 WAU → `part=ext&step=wk`) 적용됨.
- `part=ext` 정상(ok). `step=wk` 로 6-3 WAU 2주(2026-10-W3·W4) 채워짐. 서브요청 초과 해소.
- KV `kpiweeks:v1` 에 2026-10-W3(WAU 15,917) · W4(7,170, 진행 중) 들어감. `kpiusers:v1` 10-28 채워짐.
- GitHub Actions `deploy-worker.yml` 은 있으나 시크릿 `CLOUDFLARE_API_TOKEN` 미설정. Actions 의 `DASHBOARD_KEY` 도 옛 값(403).
- 테스트 전부 통과(expense · ecount 60 · paywin 13).
- **slackbot 스케줄 잡 3개(revenue 01:17 · product-snapshot 06:10 · trend-metrics 06:50 KST)는 2026-10-30 부터 Mac mini self-hosted 러너에서 돈다**(GitHub Actions 무료 2,000분 소진 때문). 러너 `~/actions-runner`, launchd `actions.runner.Su-pbg-slackbot.mac-mini`(재부팅 자동 시작), 로그 `~/Library/Logs/actions.runner.Su-pbg-slackbot.mac-mini/`. 상태: `~/actions-runner/svc.sh status`. Mac mini 가 꺼져 있으면 잡이 큐에 걸린다. 11월 1일 한도 리셋 후에도 그대로 둔다.
- Mac mini 에 `gh`(2.103) 설치·Su-pbg 로그인됨(`~/.local/bin/gh`, 키체인). `gh secret set` 으로 시크릿 입력 가능.

## 진행 중 (건드리지 말 것)
- `worker.js` KPI 수집 효율화 — 클라우드 세션(KPI 대시보드 엑셀 시트)이 1단계 완료 후 **대기 중**. 2단계(ext 를 daily/blocks/weekly 분할)부터는 Su 가 "하나씩" 하자고 함. 다음 단계 시작 전 그 세션과 조율.

## 다음 할 일
0. (Su 수동) 거래처 LIST (라이프) 시트의 담당자 이지혜 50·'이아롬 ' 84 → 홍영주. 대시보드 `supplier-managers.json` 은 2026-10-29 에 바꿨음(122곳). 워커는 그 시트에 쓰기 권한 없음(SA pbg-51@…, 편집자 공유하면 POST /kpisheet {id,data[]} 로 가능).
1. 기획 2단계: `part=ext` 를 `step=daily|blocks|weekly` 로 분할(worker.js 863~1006행). 각 응답에 서브요청 카운트 `sub:` 추가.
2. GitHub Secrets 에 `CLOUDFLARE_API_TOKEN`·새 `DASHBOARD_KEY` 입력 — 이제 Mac mini 에서 `gh secret set NAME < 파일` 로 가능(Su 가 시키면).
3. 10/22 판매 입력 대조 오저장 16건 되돌리기(워커 undo 또는 파일 재업로드).
4. `revenue-daily-archive.json`(~06-23) 과 `revenue-daily.json`(07-31~) 사이 **2026-06-24~07-30 공백** 확인(7월이 47건으로 집계됨).

## 결정 사항 (누적)
| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-07 | Gemini 유료 전환 안 함. 기본 OCR 이 본선 | 무료 한도 20건/일 |
| 2026-10-13 | 몰 검색어는 브랜드 발견에 안 씀(소싱 신호로만) | 이미 온 사람의 수요 |
| 2026-10-27 | KPI 시트 매출 = 슬랙봇 net − 타팀 개인결제창. 선수금은 안 뺌 | Su |
| 2026-10-27 | 원본 KPI_Dashboard 가 값 넣은 칸은 원본이 이긴다(part=sync) | 원본 팀 손입력 존중 |
| 2026-10-29 | 맥북프로 퇴역, Mac mini 가 유일한 로컬 | Su |
| 2026-10-29 | 6-3 WAU·새 사용자 = 대시보드 정의(totalUsers·봇 제외). GA4 원값 아님 | 원값은 손입력의 2배 |
| 2026-10-29 | 전체 재수집은 월말이 아니라 **월초 1~5일**. 매일은 당월+전월 | 전월 환불 흡수 후 확정 |
| 2026-10-29 | 수집 효율화는 한 단계씩 배포·실측 후 다음으로 | 토큰·위험 |
| 2026-10-30 | slackbot 은 비공개 유지, 잡은 Mac mini self-hosted 러너로 | 히스토리에 cafe24 refresh token 85건 → 공개 불가. 시크릿은 GitHub 에 그대로 |

## 메모
- 워커 배포는 auto 모드 분류기가 막는다. Su 가 그 턴에 직접 "배포해" 라고 해야 통과. 허용 규칙 추가도 하드 블록.
- 서브요청 50 한도: 시트 읽기(줄·블록 위치, 원본 B열)가 주범. 자세한 추정표는 2026-10-29 기획안(클라우드 세션 전달).
- 클라우드 세션은 이쪽으로 답을 못 보낸다(단방향). 결과는 그 세션 화면에서.
