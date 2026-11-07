# sheet-peek — 브라우저·구글 로그인 없이 KPI 시트 읽기 (리모트 작업용)

워커 서비스 계정(GA_SA_KEY)으로 시트를 **읽기만** 한다(scope `spreadsheets.readonly`). 배포하지 않는다.
필요한 것: 이 맥에서 `npx wrangler login` 이 돼 있을 것. 대시보드 키·구글 로그인 불필요.

```bash
cd scripts/sheet-peek && npx wrangler dev --remote --port 8799   # 백그라운드로
curl "localhost:8799/?r=<URL인코딩한 '탭'!A1:B10>"           # 값
curl "localhost:8799/?f=1&r=..."                               # 수식
curl "localhost:8799/?id=<다른 시트 ID>&r=..."                 # 원본 KPI 시트 등
```
- 기본 시트: 자동 KPI 시트 1YAm7e…(worker.js scheduled 의 SHEET). 원본은 worker.js `KPI_ORIG_ID`.
- 1-4 탭 광고비: T = 커머스 광고 액, X = Total 광고 액. 날짜 행 = 5 + (날짜 − 2024-01-01)일.
- 끝나면 `pkill -f "wrangler dev --remote --port 8799"`.
