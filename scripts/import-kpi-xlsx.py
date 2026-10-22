# 원본 KPI_Dashboard 엑셀을 새 시트로 통째로 옮긴다 (워커 POST /kpisheet).
#   python3 scripts/import-kpi-xlsx.py <xlsx> [탭이름...]
# 계산으로 대체되는 탭(0.요약·1-2·1-3·1-4)은 기본 제외한다 — /kpisheet GET 이 매일 다시 쓴다.
import sys, json, subprocess, datetime, openpyxl, os

XLSX = sys.argv[1]
ONLY = set(sys.argv[2:])
ID  = '1YAm7ec7C0nw7g3n0MVcM5T625OEW60V-ORLxghmz8QQ'
KEY = open(os.path.join(os.path.dirname(__file__), '..', '.dashboard_key.local')).read().strip()
URL = f'https://proud-sea-35f9.sugim-386.workers.dev/kpisheet?key={KEY}'
COMPUTED = {'0. 요약', '1-2. 자사몰 GMV(월별)', '1-3. 자사몰 GMV(주별)', '1-4. 자사몰 GMV(일별)'}
CELLS_PER_CALL = 4000

def cell(v):
    if v is None: return ''
    if isinstance(v, (datetime.datetime, datetime.date)): return v.strftime('%Y-%m-%d')
    if isinstance(v, float) and v.is_integer(): return int(v)
    return v

def post(body):
    r = subprocess.run(['curl', '-s', '-X', 'POST', URL, '-H', 'Content-Type: application/json',
                        '--data-binary', '@-'], input=json.dumps(body), capture_output=True, text=True)
    return r.stdout[:200]

wb = openpyxl.load_workbook(XLSX, data_only=True)
for ws in wb.worksheets:
    if ws.title in COMPUTED or (ONLY and ws.title not in ONLY): continue
    rows = [[cell(c) for c in r] for r in ws.iter_rows(values_only=True)]
    while rows and not any(str(x) != '' for x in rows[-1]): rows.pop()
    if not rows: continue
    w = max(len(r) for r in rows)
    step = max(1, CELLS_PER_CALL // max(1, w))
    for i in range(0, len(rows), step):
        out = post({'id': ID, 'tab': ws.title, 'startRow': i + 1, 'rows': rows[i:i + step], 'totalRows': len(rows)})
        if '"ok":true' not in out: print(f'  [실패] {ws.title} {i+1}행: {out}'); break
    print(f'{ws.title:30} {len(rows):>5}행 x {w:>3}열')
