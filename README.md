# PrintBakery 리뉴얼 성과 대시보드 (GA4 자동 연동)

GitHub Actions가 매일 GA4에서 데이터를 끌어와 `data.json`을 갱신하고,
`index.html`(GitHub Pages)이 그걸 읽어 리뉴얼 전/후 비교를 보여줍니다.
매출/cafe24는 제외, GA4만 사용합니다.

## 파일
- `index.html` — 대시보드 화면 (data.json 없으면 내장 샘플로 표시)
- `scripts/fetch-data.mjs` — GA4 호출·집계
- `.github/workflows/update-data.yml` — 매일 06:00(KST) 자동 + 수동 실행
- `package.json`

---

## 설치 (한 번만)

### 1) 파일 업로드
이 폴더의 모든 파일을 레포에 올립니다.

### 2) GA4 접근 권한
- 서비스 계정 이메일 `pbg-51@windy-watch-486206-n5.iam.gserviceaccount.com` 을
  GA4 → 관리 → 속성 → **속성 액세스 관리** 에서 **뷰어**로 추가.

### 3) Secrets / Variables 등록
Settings → Secrets and variables → Actions

**Secrets**
| 이름 | 값 |
|---|---|
| `GA4_PROPERTY_ID` | `511333372` |
| `GA_SA_KEY` | 서비스계정 JSON 키 **전체 내용** |

**Variables**
| 이름 | 값 |
|---|---|
| `SHOP_NAME` | `PrintBakery` |
| `BEFORE_START` / `BEFORE_END` | 리뉴얼 전 기간 (예: `2026-06-24` / `2026-06-30`) |
| `AFTER_START` / `AFTER_END` | 리뉴얼 후 기간 (예: `2026-07-01` / `2026-07-07`) |

> ⚠️ 테스트용으로 발급한 키는 확인 후 **삭제하고 새 키로 교체**하세요.

### 4) 실행
Actions → `update-data` → **Run workflow**.
성공하면 `data.json`이 커밋되고 대시보드에 실데이터가 반영됩니다. 이후 매일 자동.

### 5) Pages 켜기
Settings → Pages → Source: `main` / root → 발급된 URL로 접속.

---

## L포인트(및 특정 유입) 제외 — 나중에
1. 소스/매체 목록부터 확인:
   ```bash
   LIST_SOURCES=1 GA_SA_KEY="$(cat key.json)" \
   BEFORE_START=2026-06-24 AFTER_END=2026-07-07 npm run fetch
   ```
   출력된 목록에서 L포인트에 해당하는 문자열을 찾습니다.
2. `scripts/fetch-data.mjs` 상단 `EXCLUDE_SOURCES` 에 추가:
   ```js
   const EXCLUDE_SOURCES = ['lpoint'];  // 확인된 문자열 (부분일치)
   ```
3. 커밋하면 이후 모든 집계에서 자동 제외됩니다.

## 비교 기간 바꾸기
Variables 의 날짜 4개만 수정 → 다음 실행부터 반영. (전/후 길이는 같게 권장)

## 로컬 테스트
```bash
npm install
GA4_PROPERTY_ID=511333372 GA_SA_KEY="$(cat key.json)" \
BEFORE_START=2026-06-24 BEFORE_END=2026-06-30 \
AFTER_START=2026-07-01 AFTER_END=2026-07-07 \
npm run fetch
npx serve .
```
