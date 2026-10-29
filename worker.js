var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker.js
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};
var TOKEN_TTL_MS = 12 * 3600 * 1e3;
var _enc = new TextEncoder();
async function hmacHex(secret, msg) {
  const k = await crypto.subtle.importKey(
    "raw",
    _enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", k, _enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hmacHex, "hmacHex");
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
__name(safeEqual, "safeEqual");
async function issueToken(env) {
  const exp = Date.now() + TOKEN_TTL_MS;
  return `${exp}.${await hmacHex(env.DASH_SECRET, String(exp))}`;
}
__name(issueToken, "issueToken");
async function verifyToken(env, tok) {
  if (!env.DASH_SECRET || !tok) return false;
  const i = tok.indexOf(".");
  if (i <= 0) return false;
  const exp = tok.slice(0, i), sig = tok.slice(i + 1);
  if (!/^\d{1,15}$/.test(exp) || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmacHex(env.DASH_SECRET, exp));
}
__name(verifyToken, "verifyToken");
// [2026-10-27] KPI 시트 — 손입력이던 탭을 자동으로 채운다(Su). 원본 시트가 사람이 넣던 칸만 채우고, 나머지는 원본 수식이 계산한다.
//   · 4-1 공급사(월) · 4-2 공급사(주) · 3 브랜드(월): 카페24 주문을 한 달씩 스캔(kpiScanMonth) → KV kpifeed:{월}.
//     거래액 = 판매가×수량(정가, 취소·반품 품목 제외) · 거래 건수 = 수량. 원본(카페24 상품/공급사 판매통계 엑셀)과 같은 정의 — 2026-09 대조로 확인.
//     새 달/주가 오면 오른쪽에 블록(열)을 원본 서식 그대로 늘리고, 처음 보는 공급사·브랜드는 아래에 줄을 늘린다.
//   · cf. 엠디별: 4-1·4-2 를 SUMIF 하는 원본 수식. 새 달/주 줄만 늘리고 참조 열을 옮긴다.
//   · 6-4 유저(일별): 회원가입·DAU·새 사용자 = GA4 '봇·어뷰징 제외'(대시보드 기본값) — 2026-10-20 부터(그 전은 원본 손입력 그대로).
//     첫 구매 사용자 거래액·건수 = 카페24 주문 first_order='T' — 2026-10-19 부터.
//   · 1-4·6-4 일별, 1-3·6-3 주별 줄이 모자라면 원본 마지막 줄을 복사해 늘린다(수식 포함, 범위 참조는 새 기간으로 옮긴다).
// [2026-10-29] 6-3 WAU·새 사용자 정의. false = 대시보드 정의(totalUsers·봇/어뷰징 제외, 6-4 일별과 같다). true = GA4 원값(activeUsers·newUsers).
//   실측(10월 1·2주): 원값 45,702/37,354 는 손입력 21,427/18,113 의 2배라 아니다. 봇 제외값 22,884/18,781 이 +6.8%/+3.7% 로 가장 가깝다.
//   원본 팀이 GA4 화면에서 어떤 필터로 읽었는지는 모른다 → 대시보드 정의로 간다. 원값은 raw 에 같이 남긴다.
var KPI_WAU_RAW = false;
var KPI_EXT_FROM = { month: "2026-10", week: "2026-10-19", user: "2026-10-20", fb: "2026-10-19" };
// [2026-10-28] 원본 KPI_Dashboard — 새 시트는 이걸 그대로 따라간다(part=sync). 원본이 채운 칸은 원본이 이긴다.
var KPI_ORIG_ID = "1F-vT9k5bindzk_QXzlz1dKTF43-eyw4L9ialfvDtWbU";
// [2026-10-28] 주차 = 원본 1-3 규칙: 월~일 한 주, 그 주 수요일이 속한 달의 몇 번째 수요일인지(9/28~10/4 = 9월 5주, 10/26~11/1 = 10월 4주).
//   전에는 1~7일=1주 로 잘라서 10월 4주가 3주와 같은 날짜를 더했다.
var kpiWed = (d) => { const t = Date.parse(String(d).slice(0, 10) + "T00:00:00Z"), dow = new Date(t).getUTCDay(); return new Date(t + (2 - ((dow + 6) % 7)) * 864e5).toISOString().slice(0, 10); };
var kpiWeekKey = (d) => { const w = kpiWed(d); return `${w.slice(0, 7)}-W${Math.floor((+w.slice(8, 10) - 1) / 7) + 1}`; };
var kpiWeekDays = (k) => { const y = +k.slice(0, 4), m = +k.slice(5, 7), n = +k.slice(-1); const first = new Date(Date.UTC(y, m - 1, 1)), off = (3 - first.getUTCDay() + 7) % 7;
  const wed = Date.UTC(y, m - 1, 1 + off + (n - 1) * 7); return [new Date(wed - 2 * 864e5).toISOString().slice(0, 10), new Date(wed + 4 * 864e5).toISOString().slice(0, 10)]; };
var kpiWeekLabel = (k, suffix = "주차") => `${k.slice(0, 4)}년 ${+k.slice(5, 7)}월 ${k.slice(-1)}${suffix}`;
async function kpiScanMonth(env, ym) {
  const tok = await getCafe24AccessToken(env);
  if (!tok) throw new Error("cafe24 인증 실패");
  const mallId = env.CAFE24_MALL_ID, kv = env.CAFE24_TOKEN_KV;
  const last = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
  const n0 = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
  const out = { ym, sup: {}, supW: {}, brand: {}, fb: {}, pno: {}, pW: {}, xp: [], orders: 0, truncated: false, at: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16) };
  const add = (m, k, sale, net, qty) => { const x = m[k] || (m[k] = { sale: 0, net: 0, qty: 0 }); x.sale += sale; x.net += net; x.qty += qty; };
  for (let p = 0; p < ORDER_MAX_PAGES; p++) {
    const j = await cafe24Get(mallId, tok, `orders?start_date=${ym}-01&end_date=${ym}-${String(last).padStart(2, "0")}&date_type=order_date&limit=${ORDER_PAGE}&offset=${p * ORDER_PAGE}&embed=items`, false, env);
    const arr = j.orders || [];
    for (const o of arr) {
      if (o.paid !== "T") continue;
      out.orders++;
      const dt = String(o.order_date || "").slice(0, 10), wk = kpiWeekKey(dt);
      let osale = 0, onet = 0, oqty = 0;
      for (const it of o.items || []) {
        if (isCanceledStatus(it.order_status)) continue;
        const qty = n0(it.quantity), sale = (n0(it.product_price) + n0(it.option_price)) * qty;
        const net = sale - (n0(it.additional_discount_price) + n0(it.coupon_discount_price) + n0(it.app_item_discount_amount) + n0(it.market_discount_amount));
        const sn = it.supplier_name || "(공급사 없음)";
        add(out.sup, sn, sale, net, qty);
        add(out.supW[wk] || (out.supW[wk] = {}), sn, sale, net, qty);
        add(out.pno, String(it.product_no), sale, net, qty);
        { const pw = out.pW[wk] || (out.pW[wk] = {}), k2 = String(it.product_no), x2 = pw[k2] || (pw[k2] = [0, 0]); x2[0] += sale; x2[1] += qty; }
        { const nm2 = it.product_name || ""; if (/멤버십/.test(nm2) || (nm2.indexOf("개인결제") >= 0 && !PAYWIN_KEEP.test(nm2))) if (!out.xp.includes(String(it.product_no))) out.xp.push(String(it.product_no)); }
        osale += sale; onet += net; oqty += qty;
      }
      if (o.first_order === "T" && oqty > 0) { const x = out.fb[dt] || (out.fb[dt] = { sale: 0, net: 0, pay: 0, cnt: 0 });
        x.sale += osale; x.net += onet; x.pay += n0(o.payment_amount); x.cnt++; }
    }
    if (arr.length < ORDER_PAGE) break;
    if (p === ORDER_MAX_PAGES - 1) out.truncated = true;
  }
  // 브랜드 — 주문 품목엔 브랜드가 없다 → 상품(100개씩)의 brand_code + 브랜드 목록(KV 하루)
  let brands = null; try { const v = await kv.get("cafe24:brands:v1"); brands = v ? JSON.parse(v) : null; } catch (e) { }
  if (!brands) { brands = {};
    for (let p = 0; p < 20; p++) { const b = await cafe24Get(mallId, tok, `brands?limit=100&offset=${p * 100}`, false, env);
      const arr = b.brands || []; for (const x of arr) brands[x.brand_code] = x.brand_name; if (arr.length < 100) break; }
    try { await kv.put("cafe24:brands:v1", JSON.stringify(brands), { expirationTtl: 86400 }); } catch (e) { } }
  const pmap = JSON.parse((await kv.get("kpifeed:pbrand")) || "{}");
  const need = Object.keys(out.pno).filter((x) => !(x in pmap));
  for (let i = 0; i < need.length && i < 1500; i += 100) {
    const j = await cafe24Get(mallId, tok, `products?product_no=${need.slice(i, i + 100).join(",")}&limit=100&fields=product_no,brand_code`, false, env);
    for (const p of j.products || []) pmap[String(p.product_no)] = p.brand_code || "";
    for (const x of need.slice(i, i + 100)) if (!(x in pmap)) pmap[x] = "";
  }
  await kv.put("kpifeed:pbrand", JSON.stringify(pmap));
  for (const [pno, v] of Object.entries(out.pno)) add(out.brand, brands[pmap[pno]] || "(브랜드 없음)", v.sale, v.net, v.qty);
  out.pM = {}; for (const [pno, v] of Object.entries(out.pno)) out.pM[pno] = [v.sale, v.qty];
  delete out.pno;
  await kv.put("kpifeed:" + ym, JSON.stringify(out));
  return out;
}
__name(kpiScanMonth, "kpiScanMonth");
// [2026-10-28] RAW. 자사몰 GMV(카페24 매출통계 엑셀) 한 줄을 주문 API 로 만든다 — 원본 팀이 엑셀을 붙여넣기 전 날짜만.
//   2026-10-01~19 원본 RAW 와 대조: 결제일 기준 · 주문 당시 금액(initial_order_amount) 으로 주문수·상품구매금액·배송비·쿠폰·
//   실결제·적립금·예치금·네이버포인트·결제합계가 원 단위까지 같다. 품목수 = 주문 품목 줄 수(±1), 할인 = 품목 추가할인 합(근사),
//   환불 = 환불일 기준 실환불+적립금+예치금(대부분 일치). 원본 팀이 그 날짜 RAW 를 붙여넣으면 part=sync 가 원본 값으로 바꾼다.
async function kpiRawDays(env, from, to) {
  const tok = await getCafe24AccessToken(env);
  if (!tok) throw new Error("cafe24 인증 실패");
  const mallId = env.CAFE24_MALL_ID, n0 = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
  const m = {}, row = (d) => m[d] || (m[d] = { ord: 0, item: 0, price: 0, ship: 0, disc: 0, cpn: 0, pay: 0, pt: 0, cr: 0, npt: 0, ref: 0 });
  for (let p = 0; p < 20; p++) {
    const j = await cafe24Get(mallId, tok, `orders?start_date=${from}&end_date=${to}&date_type=pay_date&limit=500&offset=${p * 500}&embed=items`, false, env);
    const arr = j.orders || [];
    for (const o of arr) { const d = String(o.payment_date || "").slice(0, 10); if (!d || d < from || d > to) continue;
      const a = o.initial_order_amount || {}, x = row(d);
      x.ord++; x.item += (o.items || []).length; x.price += n0(a.order_price_amount); x.ship += n0(a.shipping_fee);
      x.disc += (o.items || []).reduce((s2, it) => s2 + n0(it.additional_discount_price), 0); x.cpn += n0(a.coupon_discount_price);
      x.pay += n0(a.payment_amount); x.pt += n0(a.points_spent_amount); x.cr += n0(a.credits_spent_amount); x.npt += n0(o.naver_point); }
    if (arr.length < 500) break;
  }
  for (let p = 0; p < 20; p++) {
    const j = await cafe24Get(mallId, tok, `refunds?start_date=${from}&end_date=${to}&date_type=refund_date&limit=500&offset=${p * 500}`, false, env);
    const arr = j.refunds || [];
    for (const r of arr) { const d = String(r.refund_date || "").slice(0, 10); if (!d || d < from || d > to) continue;
      row(d).ref += n0(r.actual_refund_amount) + n0(r.used_points) + n0(r.used_credits); }
    if (arr.length < 500) break;
  }
  return m;
}
__name(kpiRawDays, "kpiRawDays");

var worker_default = {
  // [2026-10-27] KPI 시트 자동 갱신 — Cloudflare 크론(06~10시 KST, 20분마다).
  //   slackbot 이 revenue-daily.json 을 새로 올리면(ETag 가 바뀌면) 바로 시트를 다시 쓴다.
  //   07시가 지나도 그날 한 번도 안 돌았으면 그냥 한 번 돈다(선수금 처리완료 반영 등 안전망).
  async scheduled(event, env, ctx) {
    const kv = env.CAFE24_TOKEN_KV;
    if (!kv || !env.DASHBOARD_KEY) return;
    const SHEET = "1YAm7ec7C0nw7g3n0MVcM5T625OEW60V-ORLxghmz8QQ";
    const kst = new Date(Date.now() + 9 * 3600 * 1e3), today = kst.toISOString().slice(0, 10), hour = kst.getUTCHours();
    const last = JSON.parse((await kv.get("kpisheet:last")) || "{}");
    // [2026-10-27] 바뀌었는지만 본다 — 파일(1MB)을 다 받지 않고 앞 100바이트만(Range) 받아 updatedAt 을 비교한다.
    //   ETag 는 GitHub Pages 가 레포의 다른 파일이 바뀔 때도(봇 커밋) 바뀌어서 쓰지 않는다. updatedAt 은 파일 맨 앞에 있다.
    let src = "";
    try {
      const h = await fetch("https://su-pbg.github.io/dashboard/revenue-daily.json?ts=" + Date.now(), { headers: { Range: "bytes=0-99" } });
      src = ((await h.text()).match(/"updatedAt"\s*:\s*"([^"]+)"/) || [])[1] || "";
    } catch (e) { }
    const fresh = src && src !== last.src, due = last.day !== today && hour >= 7;
    // [2026-10-27] 한 번에 다 하면 서브요청 한도(50)를 넘는다 → 틱(10분)마다 한 단계씩: users → scan → ext → sheet
    let job = JSON.parse((await kv.get("kpijob")) || "null");
    if (!job || job.done) { if (!fresh && !due) return; job = { src, day: today, todo: ["users", "weeks", "scan", "raw", "ext", "wk", "pcat", "sheet", "cat", "sync", "users2"], log: [], at: kst.toISOString().slice(0, 16) }; }
    const KEY = encodeURIComponent(env.DASHBOARD_KEY), call = async (path) => { const r = await worker_default.fetch(new Request("https://kpi.local" + path + (path.includes("?") ? "&" : "?") + "key=" + KEY), env); return (await r.text()).slice(0, 300); };
    const step = job.todo[0];
    try {
      if (step === "users") {
        const U = JSON.parse((await kv.get("kpiusers:v1")) || "{}"); const yest = new Date(kst.getTime() - 864e5).toISOString().slice(0, 10);
        const missing = []; for (let d = KPI_EXT_FROM.user; d <= yest; d = new Date(Date.parse(d + "T00:00:00Z") + 864e5).toISOString().slice(0, 10)) if (!U[d] || d >= new Date(kst.getTime() - 3 * 864e5).toISOString().slice(0, 10)) missing.push(d);
        for (const d of missing.slice(0, 3)) job.log.push("users " + d + " " + (await call("/kpisheet?feed=users&date=" + d)).slice(0, 80));
        if (missing.length <= 3) job.todo.shift();
      } else if (step === "weeks") {
        // [2026-10-29] 6-3 주별 WAU·새 사용자. 캐시에 없는 주와, 최근 2주(진행 중이거나 GA4 가 늦을 수 있음)를 틱당 2개씩 다시 받는다.
        const W = JSON.parse((await kv.get("kpiweeks:v1")) || "{}"); const yest = new Date(kst.getTime() - 864e5).toISOString().slice(0, 10);
        const ks = []; for (let d = KPI_EXT_FROM.week; d <= yest; d = new Date(Date.parse(d + "T00:00:00Z") + 864e5).toISOString().slice(0, 10)) { const k = kpiWeekKey(d); if (!ks.includes(k)) ks.push(k); }
        const need = ks.filter((k) => !W[k] || ks.indexOf(k) >= ks.length - 2);
        for (const k of need.slice(0, 2)) job.log.push("week " + k + " " + (await call("/kpisheet?feed=users&week=" + k)).slice(0, 80));
        if (need.length <= 2) job.todo.shift();
      } else if (step === "scan") {
        const yest = new Date(kst.getTime() - 864e5).toISOString().slice(0, 10), ms = [yest.slice(0, 7)];
        if (+yest.slice(8, 10) <= 5) { const pm = new Date(Date.UTC(+yest.slice(0, 4), +yest.slice(5, 7) - 2, 1)).toISOString().slice(0, 7); ms.unshift(pm); }
        const ym = ms.find((m) => !(job.scanned || []).includes(m));
        job.log.push("scan " + ym + " " + (await call("/kpisheet?feed=scan&ym=" + ym)).slice(0, 80));
        (job.scanned = job.scanned || []).push(ym);
        if (ms.every((m) => job.scanned.includes(m))) job.todo.shift();
      } else if (step === "ext") { job.log.push("ext " + (await call(`/kpisheet?id=${SHEET}&part=ext`))); job.todo.shift(); }
      else if (step === "sheet") { const body = await call(`/kpisheet?id=${SHEET}`); job.log.push("sheet " + body.slice(0, 120)); job.todo.shift();
        await kv.put("kpisheet:last", JSON.stringify({ src: job.src, day: today, at: kst.toISOString().slice(0, 16), ok: /"ok":true/.test(body), res: body.slice(0, 600) })); }
      else if (step === "pcat") { const r = await call(`/kpisheet?part=cat&step=pcat`); job.log.push("pcat " + r.slice(0, 120)); if (!/"left":[1-9]|"more":true/.test(r)) job.todo.shift(); }
      else if (step === "cat") { job.log.push("cat " + (await call(`/kpisheet?id=${SHEET}&part=cat&step=write`))); job.todo.shift(); }
      else if (step === "raw") { job.log.push("raw " + (await call(`/kpisheet?id=${SHEET}&part=ext&step=raw`))); job.todo.shift(); }
      else if (step === "wk") { job.log.push("wk " + (await call(`/kpisheet?id=${SHEET}&part=ext&step=wk`))); job.todo.shift(); }
      else if (step === "sync") { job.log.push("sync " + (await call(`/kpisheet?id=${SHEET}&part=sync`))); job.todo.shift(); }
      else if (step === "users2") {
        // [2026-10-29] GA4 가 어제 값을 새벽엔 안 줄 때가 있다 — 10-28 이 아침 갱신 땐 비었다가(회원가입·DAU·새 사용자 세 칸) 10시에 같은 호출로 바로 나왔다.
        //   그래서 맨 끝에 한 번 더 본다: 아직 없으면 다시 받고, 받았으면 ext 를 한 번 더 돌려 6-4 를 채운다. 09시까지만 기다린다(그 뒤는 포기, 다음 날 users 가 최근 3일을 다시 받는다).
        const yest = new Date(kst.getTime() - 864e5).toISOString().slice(0, 10);
        const has = async () => !!JSON.parse((await kv.get("kpiusers:v1")) || "{}")[yest];
        if (await has()) job.todo.shift();
        else { job.log.push("users2 " + yest + " " + (await call("/kpisheet?feed=users&date=" + yest)).slice(0, 80));
          if (await has()) { job.todo.shift(); job.todo.push("ext"); } else if (hour >= 9) job.todo.shift(); }
      }
    } catch (e) { job.log.push(step + " 실패 " + String(e && e.message || e).slice(0, 120)); job.fail = (job.fail || 0) + 1; if (job.fail > 3) job.todo.shift(); }
    if (!job.todo.length) job.done = true;
    job.log = job.log.slice(-30);
    await kv.put("kpijob", JSON.stringify(job));
  },
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    try {
      const url = new URL(request.url);
      const q = url.searchParams;
      if (request.method === "POST" && url.pathname === "/login") {
        if (!env.DASH_PW || !env.DASH_SECRET) {
          return json({ error: "\uB85C\uADF8\uC778\uC774 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4 (DASH_PW / DASH_SECRET)" }, 503);
        }
        let pw = "";
        try {
          pw = String((await request.json()).pw || "");
        } catch (e) {
        }
        if (!safeEqual(pw, env.DASH_PW)) {
          await new Promise((r) => setTimeout(r, 400));
          return json({ error: "\uBE44\uBC00\uBC88\uD638\uAC00 \uD2C0\uB838\uC2B5\uB2C8\uB2E4." }, 401);
        }
        return json({ token: await issueToken(env), ttlMs: TOKEN_TTL_MS });
      }
      // ===== 영수증 AI 읽기 (경비환급 페이지 전용, 로그인 없음) =====
      // [2026-10-06] 경비환급은 전 팀이 로그인 없이 쓰므로 인증 검사보다 앞에 둔다.
      // 대신 우리 페이지(Origin)에서 온 요청만 받고, 워커 인스턴스별로 IP당 호출 수를 제한한다.
      if (request.method === "POST" && url.pathname === "/receipt") {
        return await handleReceipt(request, env);
      }
      // ===== 카페24 웹훅 수신 (주문 처리 '진행 중 주문' 실시간) =====
      // [2026-10-15] 카페24 개발자센터 WebHook 에 등록한 이벤트가 오면(90024 배송상태 변경 등) 그 주문의 상태만 KV 에 적는다.
      //   확인: X-API-Key 헤더가 CAFE24_WEBHOOK_KEY 시크릿과 같아야 하고, 보낸 IP 가 카페24 대역이어야 한다(문서의 IP 목록).
      //   배치는 없다 — 카페24가 바뀔 때마다 보낸다. 화면은 KV(ecopen:*)를 먼저 읽고, 전체 조회는 처음·1시간마다 보정용.
      //   payload 에 품목은 없다(실측 샘플) → 주문 단위 상태만 갱신, 품목은 전체 조회가 채운다. 고객 이름·연락처는 저장하지 않는다.
      if (request.method === "POST" && url.pathname === "/hook/cafe24") {
        return await handleCafe24Hook(request, env);
      }
      const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const keyOk = !!env.DASHBOARD_KEY && safeEqual(q.get("key") || "", env.DASHBOARD_KEY);
      const tokOk = !keyOk && await verifyToken(env, bearer || q.get("t") || "");
      if (!keyOk && !tokOk) {
        return json({ error: "\uC811\uADFC \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, 403);
      }
      // ===== 상품 운영 작업 목록 =====
      // [2026-10-20] MD 가 수시로 보는 화면이라 '뭘 했는지' 가 남아야 한다. 안 남으면 같은 걸 계속 다시 본다.
      //   담당자·상태·메모를 사람 사이에 공유해야 하므로 브라우저 저장소로는 안 되고 KV 에 둔다.
      //   ponytail: /supplier-map 과 같이 맵 전체를 키 하나에. 동시에 둘이 저장하면 나중 것이 이긴다.
      if (url.pathname === "/worklist") {
        const kv0 = env.CAFE24_TOKEN_KV;
        if (!kv0) return json({ error: "KV 가 연결돼 있지 않습니다" }, 503);
        const WL_KEY = "worklist:v1";
        const raw0 = await kv0.get(WL_KEY);
        const items = raw0 ? JSON.parse(raw0) : {};
        if (request.method === "GET") return json({ items });
        if (request.method === "POST") {
          let b = {};
          try { b = await request.json(); } catch (e) { /* 본문 없음 */ }
          const id = String(b.id || "").trim().slice(0, 120);
          if (!id) return json({ error: "id 가 없습니다" }, 400);
          if (b.remove === true) delete items[id];
          else {
            const ST = ["미처리", "진행", "완료", "보류"];
            const prev = items[id] || {};
            items[id] = {
              status: ST.includes(b.status) ? b.status : (prev.status || "미처리"),
              owner: String(b.owner ?? prev.owner ?? "").trim().slice(0, 20),
              memo: String(b.memo ?? prev.memo ?? "").trim().slice(0, 200),
              at: new Date(Date.now() + 9 * 3600 * 1e3).toISOString().slice(0, 16).replace("T", " ")
            };
          }
          await kv0.put(WL_KEY, JSON.stringify(items));
          return json({ ok: true, items });
        }
        return json({ error: "지원하지 않는 메서드" }, 405);
      }

      // ===== 이름 분류 (브랜드 / 재질 / 일반명사) =====
      // [2026-10-22] 연관검색어는 '같이 검색되는 말' 이라 재질(사이잘)·양식(페르시안)·제품명이
      //   브랜드와 같은 자격으로 섞여 나온다. 정규식으로는 사이잘과 파펠리나를 못 가른다 —
      //   둘 다 4글자 한글 고유명사꼴이다. 언어 판단이라 LLM 이 맞는 도구다.
      //   수동 목록(brand-review.json 152개)을 사람이 관리하던 걸 대체한다.
      //   이름을 한 번에 묶어 보내므로 하루 1회면 된다(무료 등급 모델당 20건 중 1건).
      if (request.method === "POST" && url.pathname === "/classify") {
        if (!env.GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY 없음", code: "nokey" }, 503);
        let b = {};
        try { b = await request.json(); } catch (e) { /* 본문 없음 */ }
        // texts 모드 — 유튜브 설명란·블로그 본문처럼 잡글이 섞인 덩어리에서 브랜드 이름만 뽑는다.
        // [2026-10-22] 설명란 실측: 3개 중 2개가 쿠팡 제휴문구·저작권 고지였다. 정규식 추출기로는
        //   또 쓰레기가 나온다(블로그 제목 때 그랬다). 보일러플레이트를 버리는 건 언어 판단이라 여기 맡긴다.
        if (Array.isArray(b.texts) && b.texts.length) {
          const docs = b.texts.map((x) => String(x || "").slice(0, 1500)).filter(Boolean).slice(0, 30);
          if (!docs.length) return json({ error: "texts 가 비었습니다" }, 400);
          const tp = `아래는 한국 리빙·인테리어·아트 관련 유튜브 영상 설명란이다. 각 글에서 **상품 브랜드·제조사·편집샵·작가 이름만** 뽑아라.
뽑지 않는 것: 제휴 광고 문구(쿠팡 파트너스 등)·저작권 고지·채널 이름·유튜버 이름·해시태그 중 일반명사·플랫폼 이름(인스타그램, 유튜브, 쿠팡)·재질·제품 종류.
해당 글에 브랜드가 없으면 빈 배열로 둔다. 지어내지 마라.
${docs.map((d, i) => `[${i}]\n${d}`).join("\n---\n")}`;
          const tcall = (m) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
            body: JSON.stringify({
              contents: [{ parts: [{ text: tp }] }],
              generationConfig: {
                temperature: 0, responseMimeType: "application/json",
                responseSchema: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: { i: { type: "INTEGER" }, brands: { type: "ARRAY", items: { type: "STRING" } } },
                    required: ["i", "brands"]
                  }
                }
              }
            })
          });
          let tm = b.model || env.GEMINI_MODEL || "gemini-3.8-flash";
          let tr = await tcall(tm);
          if (tr.status === 404) {
            const t404 = await tr.text();
            const alt = [...t404.matchAll(/models\/([A-Za-z0-9.\-]+)/g)].map((x) => x[1]).find((n) => n !== tm);
            if (!alt) return json({ error: "Gemini 404", detail: t404.slice(0, 300) }, 502);
            tm = alt; tr = await tcall(tm);
          }
          if (tr.status === 429) return json({ error: "Gemini 한도 초과", code: "quota" }, 429);
          if (!tr.ok) return json({ error: `Gemini ${tr.status}`, detail: (await tr.text()).slice(0, 300) }, 502);
          const tj = await tr.json();
          const ttxt = tj?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
          try {
            return json({ ok: true, model: tm, n: docs.length, docs: JSON.parse(ttxt) });
          } catch (e) {
            return json({ error: "응답 해석 실패", detail: ttxt.slice(0, 300) }, 502);
          }
        }
        const all = (Array.isArray(b.names) ? b.names : []).map((x) => String(x || "").trim())
          .filter((x) => x && x.length <= 30).slice(0, 400);
        if (!all.length) return json({ error: "names 가 비었습니다" }, 400);
        // 한 번 분류한 이름은 KV 에 남긴다 — 화면이 매번 불러도 Gemini 호출은 신규분만 간다.
        const kvC = env.CAFE24_TOKEN_KV, CK = "classify:v1";
        const cache = kvC ? JSON.parse((await kvC.get(CK)) || "{}") : {};
        const names = all.filter((n) => !cache[n]).slice(0, 120);
        if (!names.length) return json({ ok: true, cached: true, items: all.map((n) => ({ name: n, kind: cache[n] })) });
        const prompt = `아래는 한국 리빙·인테리어·아트 쇼핑몰의 검색어에서 뽑은 이름 후보다.
각각을 셋 중 하나로 분류하라.
  brand    실제로 존재하는 상품 브랜드·제조사·편집샵 이름 (예: 파펠리나, 웨지우드, FERMOB, 마지스)
  material 재질·소재·양식·기법·원산지 (예: 사이잘, 페르시안, 히노끼, 본차이나, 라탄, 헤링본)
  generic  일반명사·제품종류·수식어·지명·인명 (예: 조명, 대용량, 작은방, 이천, 최화정)
판단이 어려우면 generic 으로 한다. 실존하지 않을 것 같은 이름도 generic 이다.
이름: ${names.join(", ")}`;
        const call = (m) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0, responseMimeType: "application/json",
              responseSchema: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    name: { type: "STRING" },
                    kind: { type: "STRING", enum: ["brand", "material", "generic"] },
                    note: { type: "STRING" }
                  },
                  required: ["name", "kind"]
                }
              }
            }
          })
        });
        let model = env.GEMINI_MODEL || "gemini-3.8-flash";
        let r = await call(model);
        if (r.status === 404) {                      // 모델명이 내려가면 후속 모델로 한 번 재시도 (receipt 와 같은 함정)
          const t404 = await r.text();
          const alt = [...t404.matchAll(/models\/([A-Za-z0-9.\-]+)/g)].map((x) => x[1]).find((n) => n !== model);
          if (!alt) return json({ error: "Gemini 404", detail: t404.slice(0, 300) }, 502);
          model = alt; r = await call(model);
        }
        if (r.status === 429) return json({ error: "Gemini 한도 초과", code: "quota" }, 429);
        if (!r.ok) return json({ error: `Gemini ${r.status}`, detail: (await r.text()).slice(0, 300) }, 502);
        const j = await r.json();
        const txt = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
        try {
          const got = JSON.parse(txt);
          for (const it of got) if (it && it.name && it.kind) cache[it.name] = it.kind;
          if (kvC) await kvC.put(CK, JSON.stringify(cache));
          return json({ ok: true, model, n: names.length, items: all.map((n) => ({ name: n, kind: cache[n] || null })) });
        } catch (e) {
          return json({ error: "응답 해석 실패", detail: txt.slice(0, 300) }, 502);
        }
      }

      // ===== KPI 시트 쓰기 (2026-10-22) =====
      // 기존 KPI_Dashboard 의 '0. 요약' · '1-2 월별' · '1-3 주별' · '1-4 일별' 레이아웃을 그대로 복제한다.
      // 원본은 카페24 관리자 '매출분석 일별매출' 엑셀을 사람이 붙여넣는 구조라 할인 수식이 끊기고
      // 환불이 매출식에서 빠져 있었다. 여기는 revenue-daily.json(데일리 슬랙 리포트와 같은 주문 API
      // 산출물) 하나만 보므로 그 둘과 영영 안 갈린다.
      // 주 정의: 1~7=1주 · 8~14=2주 · 15~21=3주 · 22~28=4주 · 29~말일=5주 (주가 달을 걸치지 않는다)
      // 배송비·네이버포인트·광고·이익은 주문 API 에 없어 비워 둔다.
      // 원본 KPI_Dashboard 엑셀을 통째로 옮기는 경로 — 로컬 스크립트(scripts/import-kpi-xlsx.mjs)가 탭별로 쪼개 보낸다.
      //   POST /kpisheet {id, tab, startRow, rows[][], widthFmt?:[{c0,c1,pattern}], freeze?:n}
      if (request.method === "POST" && url.pathname === "/kpisheet") {
        const sa = JSON.parse(env.GA_SA_KEY);
        let b = {};
        try { b = await request.json(); } catch (e) { }
        // 손입력 데이터(광고·신규상품수)를 KV 에 둔다 — 주문 API 에 없는 값이라 사람이 넣는다.
        //   POST {ad:{ "2026-01-05": {c:커머스광고, t:Total광고, sku:신규상품수}, ... }, adMonth:{ "2025-01": {t:...} }}
        // 탭 순서 맞추기 / 빈 탭 지우기:  POST {id, order:["0. 요약", ...], drop:["시트1"]}
        if (Array.isArray(b.order) || Array.isArray(b.drop)) {
          const tok2 = await getAccessToken(sa, "https://www.googleapis.com/auth/spreadsheets");
          const m3 = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${b.id}?fields=sheets.properties`, {
            headers: { Authorization: "Bearer " + tok2 } })).json().catch(() => ({}));
          const sid3 = {}; for (const x of m3.sheets || []) sid3[x.properties.title] = x.properties.sheetId;
          const rq = [];
          (b.order || []).forEach((t, i) => { if (sid3[t] != null) rq.push({ updateSheetProperties: {
            properties: { sheetId: sid3[t], index: i }, fields: "index" } }); });
          for (const t of b.drop || []) if (sid3[t] != null) rq.push({ deleteSheet: { sheetId: sid3[t] } });
          if (!rq.length) return json({ ok: true, noop: true });
          const r3 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${b.id}:batchUpdate`, {
            method: "POST", headers: { Authorization: "Bearer " + tok2, "Content-Type": "application/json" },
            body: JSON.stringify({ requests: rq }) });
          const j3 = await r3.json().catch(() => ({}));
          return json(r3.ok ? { ok: true, moved: rq.length } : { error: j3?.error?.message || `HTTP ${r3.status}` }, r3.ok ? 200 : r3.status);
        }
        // [2026-10-27] 원본 수식 되살리기: POST {id, formulasFrom:원본ID, tab, r0, r1}
        //   rebuildFrom 은 값으로 굳혀서 수식이 없다. 탭 이름이 원본과 같아진 뒤 원본 수식을 그대로 다시 써 넣는다(행 구간씩).
        if (b.formulasFrom && b.tab) {
          const tokF = await getAccessToken(sa, "https://www.googleapis.com/auth/spreadsheets");
          const HF = { Authorization: "Bearer " + tokF, "Content-Type": "application/json" };
          const ms2 = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${b.formulasFrom}?fields=sheets.properties`, { headers: HF })).json().catch(() => ({}));
          const sp = (ms2.sheets || []).map((x) => x.properties).find((x) => x.title === b.tab);
          if (!sp) return json({ error: "원본에 탭이 없습니다: " + b.tab }, 404);
          const nC = sp.gridProperties.columnCount, nR = sp.gridProperties.rowCount;
          const r0 = Math.max(1, b.r0 || 1), r1 = Math.min(nR, b.r1 || nR);
          const cL = (n) => { let t2 = "", k = n - 1; do { t2 = String.fromCharCode(65 + (k % 26)) + t2; k = Math.floor(k / 26) - 1; } while (k >= 0); return t2; };
          const rg = `'${b.tab}'!A${r0}:${cL(nC)}${r1}`;
          const src = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${b.formulasFrom}/values/${encodeURIComponent(rg)}?valueRenderOption=FORMULA&dateTimeRenderOption=SERIAL_NUMBER`, { headers: HF })).json().catch(() => ({}));
          const vals = (src.values || []).map((r) => r.map((v) => (v == null ? "" : v)));
          if (!vals.length) return json({ ok: true, tab: b.tab, r0, r1, rows: 0, nR });
          const wF = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${b.id}/values/${encodeURIComponent(`'${b.tab}'!A${r0}`)}?valueInputOption=USER_ENTERED`, {
            method: "PUT", headers: HF, body: JSON.stringify({ values: vals }) });
          const jF = await wF.json().catch(() => ({}));
          return json(wF.ok ? { ok: true, tab: b.tab, r0, r1, rows: vals.length, nR, cells: jF.updatedCells } : { error: jF?.error?.message || `HTTP ${wF.status}` }, wF.ok ? 200 : wF.status);
        }
        // [2026-10-27] 원본 시트 탭을 서식째 통째로 복제: POST {id, rebuildFrom:원본ID}
        //   원본 탭마다 copyTo → 값으로 굳히기(수식이 지워질 옛 탭을 가리키지 않게) → 같은 이름의 옛 탭 삭제 → 이름·순서 원본대로.
        //   SA 가 원본을 읽을 수 있어야 한다. 그 뒤 GET /kpisheet 가 계산 칸만 덮는다.
        if (b.rebuildFrom) {
          const tokR = await getAccessToken(sa, "https://www.googleapis.com/auth/spreadsheets");
          const H = { Authorization: "Bearer " + tokR, "Content-Type": "application/json" };
          const ms = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${b.rebuildFrom}?fields=sheets.properties`, { headers: H })).json().catch(() => ({}));
          if (!ms.sheets) return json({ error: "원본을 못 읽습니다 — SA 공유 확인", detail: ms?.error?.message, saEmail: sa.client_email }, 403);
          const md = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${b.id}?fields=sheets.properties`, { headers: H })).json().catch(() => ({}));
          const old = (md.sheets || []).map((x) => x.properties);
          const copies = [];
          for (const sh of ms.sheets) {
            const r8 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${b.rebuildFrom}/sheets/${sh.properties.sheetId}:copyTo`, {
              method: "POST", headers: H, body: JSON.stringify({ destinationSpreadsheetId: b.id }) });
            const j8 = await r8.json().catch(() => ({}));
            if (!r8.ok) return json({ error: `복제 실패: ${sh.properties.title}`, detail: j8?.error?.message, done: copies.length }, r8.status);
            copies.push({ title: sh.properties.title, sid: j8.sheetId });
          }
          const rq = [
            ...copies.map((c) => ({ copyPaste: { source: { sheetId: c.sid }, destination: { sheetId: c.sid }, pasteType: "PASTE_VALUES" } })),
            ...old.map((o) => ({ deleteSheet: { sheetId: o.sheetId } })),
            ...copies.map((c, i) => ({ updateSheetProperties: { properties: { sheetId: c.sid, title: c.title, index: i }, fields: "title,index" } }))];
          const r9 = await fetch(`https://sheets.googleapis.com/v4:batchUpdate`.replace("v4:", `v4/spreadsheets/${b.id}:`), { method: "POST", headers: H, body: JSON.stringify({ requests: rq }) });
          const j9 = await r9.json().catch(() => ({}));
          return json(r9.ok ? { ok: true, copied: copies.length, removed: old.length } : { error: j9?.error?.message || `HTTP ${r9.status}` }, r9.ok ? 200 : r9.status);
        }
        if (b.ad || b.adMonth) {
          const kvA = env.CAFE24_TOKEN_KV;
          if (!kvA) return json({ error: "KV 가 연결돼 있지 않습니다" }, 503);
          const cur2 = JSON.parse((await kvA.get("kpiad:v1")) || '{"ad":{},"adMonth":{}}');
          Object.assign(cur2.ad, b.ad || {}); Object.assign(cur2.adMonth, b.adMonth || {});
          await kvA.put("kpiad:v1", JSON.stringify(cur2));
          return json({ ok: true, ad: Object.keys(cur2.ad).length, adMonth: Object.keys(cur2.adMonth).length });
        }
        const id = b.id, tab = String(b.tab || ""), rows = Array.isArray(b.rows) ? b.rows : [];
        if (!id || !tab || !rows.length) return json({ error: "id·tab·rows 가 필요합니다" }, 400);
        const tok = await getAccessToken(sa, "https://www.googleapis.com/auth/spreadsheets");
        const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties`, {
          headers: { Authorization: "Bearer " + tok } })).json().catch(() => ({}));
        const sid = {}; for (const x of meta.sheets || []) sid[x.properties.title] = x.properties.sheetId;
        const width = Math.max(...rows.map((r) => r.length), 1);
        if (sid[tab] == null) {
          const r0 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
            method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
            body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab,
              gridProperties: { rowCount: Math.max(1000, (b.totalRows || rows.length) + 20), columnCount: Math.max(26, width + 2) } } } }] }) });
          const j0 = await r0.json().catch(() => ({}));
          if (!r0.ok) return json({ error: j0?.error?.message || `HTTP ${r0.status}` }, r0.status);
          sid[tab] = j0.replies?.[0]?.addSheet?.properties?.sheetId;
        }
        const start = Math.max(1, b.startRow || 1);
        const colA1 = (n) => { let s2 = ""; n = n - 1; do { s2 = String.fromCharCode(65 + (n % 26)) + s2; n = Math.floor(n / 26) - 1; } while (n >= 0); return s2; };
        const wr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, {
          method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
          body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: [{
            range: `'${tab}'!A${start}:${colA1(width)}${start + rows.length - 1}`,
            values: rows.map((r) => { const a2 = r.slice(); while (a2.length < width) a2.push(""); return a2; }) }] }) });
        const wj = await wr.json().catch(() => ({}));
        if (!wr.ok) return json({ error: wj?.error?.message || `HTTP ${wr.status}` }, wr.status);
        if (Array.isArray(b.widthFmt) && b.widthFmt.length) {
          const S = sid[tab];
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
            method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
            body: JSON.stringify({ requests: [
              ...b.widthFmt.map((f) => ({ repeatCell: {
                range: { sheetId: S, startRowIndex: f.r0 || 0, startColumnIndex: f.c0, endColumnIndex: f.c1 },
                cell: { userEnteredFormat: { numberFormat: { type: /%/.test(f.pattern) ? "PERCENT" : "NUMBER", pattern: f.pattern } } },
                fields: "userEnteredFormat.numberFormat" } })),
              ...(b.freeze ? [{ updateSheetProperties: { properties: { sheetId: S, gridProperties: { frozenRowCount: b.freeze } }, fields: "gridProperties.frozenRowCount" } }] : []),
              { autoResizeDimensions: { dimensions: { sheetId: S, dimension: "COLUMNS", startIndex: 0, endIndex: Math.min(width, 40) } } }
            ] }) });
        }
        return json({ ok: true, tab, wrote: wj.totalUpdatedCells });
      }

      // ===== KPI 시트 확장 탭 (2026-10-27) — 위 kpiScanMonth 주석 참조 =====
      //   GET /kpisheet?feed=scan&ym=YYYY-MM   카페24 한 달 스캔 → KV kpifeed:{월}
      //   GET /kpisheet?feed=users&date=YYYY-MM-DD   GA4(봇·어뷰징 제외) 하루 → KV kpiusers:v1
      //   GET /kpisheet?id=…&part=ext   시트의 확장 탭(6-4·4-1·4-2·3·엠디별·일/주 줄 늘리기)을 채운다
      // [2026-10-28] 카페24 관리자 API 읽기 전용 조회(분석·대조용): GET /kpisheet?feed=c24&path=financials/dailysales?start_date=…
      if (url.pathname === "/kpisheet" && q.get("feed") === "c24") {
        const p = q.get("path") || "";
        if (!/^[a-z_\/]+$/i.test(p.split("?")[0]) || p.includes("..")) return json({ error: "path" }, 400);
        const tk = await getCafe24AccessToken(env);
        try { return json(await cafe24Get(env.CAFE24_MALL_ID, tk, p, false, env)); }
        catch (e) { return json({ error: String(e.message || e), scopes: LAST_TOKEN_SCOPES }, 502); }
      }
      // [2026-10-28] 원본 따라가기: GET /kpisheet?id=새시트&part=sync[&dry=1][&tab=…]
      //   원본 KPI_Dashboard 의 모든 탭(0. 요약 제외)을 칸 단위로 비교해, 원본에 값·수식이 있는 칸은 원본 그대로 맞춘다.
      //   원본이 비어 있는 칸(우리가 늘린 줄·블록)은 우리 값을 둔다. 우리 기준으로 바꾼 칸만 예외:
      //     1-4 M(매출) 이 값이면 — 슬랙봇 매출 · 1-3 P(매출) — 1-4 M 합 · 6-4 C/E/G 2026-10-20~ — GA4 봇·어뷰징 제외
      //   1-4 는 원본 RAW 마지막 날까지는 빈 칸까지 원본과 똑같이 맞춘다(전에 우리가 넣은 값이 남지 않게).
      //   행 이름(B열)이 원본과 다르면(공급사·브랜드 줄 순서가 다르면) 그 줄은 건드리지 않고 알린다.
      if (url.pathname === "/kpisheet" && q.get("part") === "sync") {
        const sa = JSON.parse(env.GA_SA_KEY), id = q.get("id"), dry = !!q.get("dry"), only = q.get("tab");
        if (!id) return json({ error: "id 가 필요합니다" }, 400);
        const tok = await getAccessToken(sa, "https://www.googleapis.com/auth/spreadsheets");
        const HJ = { Authorization: "Bearer " + tok, "Content-Type": "application/json" };
        const metaOf = async (sid) => { const j = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}?fields=sheets.properties`, { headers: HJ })).json().catch(() => ({}));
          if (!j.sheets) throw new Error(`시트 ${sid.slice(0, 6)} 못 읽음: ${j?.error?.message || ""}`); return j.sheets.map((x) => x.properties); };
        const nk = (t) => String(t).replace(/[:\s]/g, "");
        const cA1 = (n) => { let t2 = "", k = n - 1; do { t2 = String.fromCharCode(65 + (k % 26)) + t2; k = Math.floor(k / 26) - 1; } while (k >= 0); return t2; };
        const dayRow = (d) => 5 + Math.round((Date.parse(d + "T00:00:00Z") - Date.parse("2024-01-01T00:00:00Z")) / 864e5);
        const nm = (x) => String(x ?? "").replace(/\s+/g, " ").trim();
        const isKey = (x) => typeof x === "number" || /^\d{4}[-년.]|^\d+$/.test(nm(x));
        try {
          const [oS, nS] = await Promise.all([metaOf(KPI_ORIG_ID), metaOf(id)]);
          const nMap = {}; for (const p of nS) nMap[nk(p.title)] = p;
          const pairs = oS.filter((p) => nk(p.title) !== nk("0. 요약") && nMap[nk(p.title)] && (!only || nk(only) === nk(p.title)));
          const bget = async (sid, ranges) => {
            const u = `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values:batchGet?valueRenderOption=FORMULA&dateTimeRenderOption=SERIAL_NUMBER&` + ranges.map((r) => "ranges=" + encodeURIComponent(r)).join("&");
            const r = await fetch(u, { headers: HJ }); const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error("읽기: " + (j?.error?.message || r.status)); return (j.valueRanges || []).map((v) => v.values || []); };
          // 원본 RAW 마지막 날 → 1-4 전체 맞춤 구간
          const rawT = oS.find((p) => nk(p.title) === nk("RAW. 자사몰 GMV"));
          let rawLast = ""; if (rawT) (await bget(KPI_ORIG_ID, [`'${rawT.title}'!A1:A3000`]))[0].forEach((r) => { const m = String(r[0] || "").match(/^(\d{4}-\d{2}-\d{2})/); if (m && m[1] > rawLast) rawLast = m[1]; });
          const strictTo = rawLast ? dayRow(rawLast) : 0, userRow = dayRow(KPI_EXT_FROM.user);
          const report = {}, skipped = {}, fdata = [], vdata = [];
          for (let i = 0; i < pairs.length; i += 4) {
            const grp = pairs.slice(i, i + 4);
            const rg = (p, title) => `'${title}'!A1:${cA1(Math.min(p.gridProperties.columnCount, 260))}${Math.min(p.gridProperties.rowCount, 3000)}`;
            const [ov, nv] = await Promise.all([bget(KPI_ORIG_ID, grp.map((p) => rg(p, p.title))), bget(id, grp.map((p) => rg(p, nMap[nk(p.title)].title)))]);
            grp.forEach((p, gi) => {
              const T = nMap[nk(p.title)].title, K = nk(p.title), O = ov[gi], N = nv[gi];
              const is14 = K === nk("1-4. 자사몰 GMV(일별)"), is13 = K === nk("1-3. 자사몰 GMV(주별)"), is64 = K === nk("6-4. 유저(일별)");
              let n = 0; const sk = [];
              // 5-1/5-2: 원본이 손으로 채운 마지막 기간 줄까지는 빈 칸까지 원본과 같게(예전 슬랙봇 기준 값 지우기)
              const is5x = /^5-[12]\./.test(K); let last5 = 0; if (is5x) O.forEach((r, i) => { if (i >= 4 && isKey(r[1])) last5 = i + 1; });
              const R = Math.max(O.length, is14 ? Math.min(N.length, strictTo) : 0);
              for (let r = 0; r < R; r++) {
                const orow = O[r] || [], nrow = N[r] || [], rr = r + 1;
                const ob = orow[1], nb = nrow[1];
                if (ob !== undefined && ob !== "" && nb !== undefined && nb !== "" && !isKey(ob) && !isKey(nb) && nm(ob) !== nm(nb)) { sk.push(`${rr}:${nm(ob)}≠${nm(nb)}`); continue; }
                const strict = (is14 && rr >= 5 && rr <= strictTo) || (is5x && rr >= 5 && rr <= last5);
                const W = Math.max(orow.length, strict ? nrow.length : 0);
                let run = null; const close = () => { if (run) { (run.f ? fdata : vdata).push({ range: `'${T}'!${cA1(run.c0 + 1)}${rr}:${cA1(run.c0 + run.v.length)}${rr}`, values: [run.v] }); run = null; } };
                for (let c = 0; c < W; c++) {
                  const o = orow[c] ?? "", v = nrow[c] ?? "", cc = c + 1;
                  const own = (is14 && cc === 13 && rr >= 5 && v !== "" && !(typeof v === "string" && v.startsWith("=")))
                    || (is13 && cc === 16 && rr >= 5) || (is64 && (cc === 3 || cc === 5 || cc === 7) && rr >= userRow);
                  const want = (o === "" && !strict) || own ? null : o;
                  const same = want === null || want === v || (typeof want === "number" && typeof v === "number" && Math.abs(want - v) < 1e-9);
                  if (same) { close(); continue; }
                  const f = typeof want === "string" && want.startsWith("=");
                  if (run && (run.f !== f || run.c0 + run.v.length !== c)) close();
                  if (!run) run = { c0: c, f, v: [] };
                  run.v.push(want); n++;
                }
                close();
              }
              report[p.title] = n; if (sk.length) skipped[p.title] = sk.slice(0, 10).concat(sk.length > 10 ? [`…${sk.length}줄`] : []);
            });
          }
          const sample = fdata.concat(vdata).slice(0, 25).map((d) => d.range + " ← " + JSON.stringify(d.values[0]).slice(0, 80));
          let wrote = 0;
          if (!dry) for (const [data, opt] of [[vdata, "RAW"], [fdata, "USER_ENTERED"]]) for (let k = 0; k < data.length; k += 400) {
            const w = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, { method: "POST", headers: HJ,
              body: JSON.stringify({ valueInputOption: opt, data: data.slice(k, k + 400) }) });
            const jw = await w.json().catch(() => ({})); if (!w.ok) throw new Error("쓰기: " + (jw?.error?.message || w.status)); wrote += jw.totalUpdatedCells || 0; }
          return json({ ok: true, dry, rawLast, cells: report, skippedRows: skipped, ranges: fdata.length + vdata.length, wrote, sample });
        } catch (e) { return json({ error: String(e.message || e) }, 500); }
      }
      if (url.pathname === "/kpisheet" && q.get("feed") === "scan" && /^\d{4}-\d{2}$/.test(q.get("ym") || "")) {
        try { const o = await kpiScanMonth(env, q.get("ym"));
          const top = (m, n = 8) => Object.entries(m).sort((a2, b2) => b2[1].sale - a2[1].sale).slice(0, n).map(([k, v]) => [k, v.sale, v.net, v.qty]);
          return json({ ok: true, ym: o.ym, orders: o.orders, truncated: o.truncated, sup: top(o.sup), brand: top(o.brand), weeks: Object.keys(o.supW), fbDays: Object.keys(o.fb).length,
            fbSample: Object.entries(o.fb).slice(0, 40) });
        } catch (e) { return json({ error: String(e.message || e) }, 500); }
      }
      // [2026-10-29] 주 단위: GET /kpisheet?feed=users&week=YYYY-MM-Wn → KV kpiweeks:v1[주] = {wau, nu, join}
      //   6-3 유저(주별)의 WAU(F)·새 사용자(I)는 원본이 손입력이라 10월 2주에서 멈춰 있었다(비중·리텐션·CVR 전부 #DIV/0!).
      //   WAU 는 DAU 합이 아니라 그 주 범위의 순 사용자라 GA4 를 주 범위로 따로 부른다(일별 feed 와 같은 정의: usersInRange·신규 방문자).
      if (url.pathname === "/kpisheet" && q.get("feed") === "users" && /^\d{4}-\d{2}-W\d$/.test(q.get("week") || "")) {
        const wkk = q.get("week"), kvU = env.CAFE24_TOKEN_KV, [s0, e0] = kpiWeekDays(wkk);
        const r = await worker_default.fetch(new Request(`https://kpi.local/?bs=${s0}&be=${e0}&as=${s0}&ae=${e0}&autoExclLowEngagement=1&key=${encodeURIComponent(env.DASHBOARD_KEY)}`), env);
        const o = await r.json().catch(() => ({}));
        const k = {}; for (const x of o.kpis || []) k[x.label] = x.after;
        const tot = o.usersInRange && o.usersInRange.after;
        if (tot == null) return json({ error: "GA4 응답에 활성 사용자가 없습니다", keys: Object.keys(o) }, 502);
        // GA4 원값(activeUsers·newUsers, 봇 제외 없음)도 같이 받아 둔다(참고용. KPI_WAU_RAW 참조).
        const rows = await runReport(env.GA4_PROPERTY_ID && String(env.GA4_PROPERTY_ID).trim() || "333394141", await getAccessToken(JSON.parse(env.GA_SA_KEY)),
          { dateRanges: [{ startDate: s0, endDate: e0 }], dimensions: [{ name: "year" }], metrics: [{ name: "activeUsers" }, { name: "newUsers" }] });
        const mv = (rows[0] && rows[0].metricValues) || [], active = mv[0] ? +mv[0].value : null, newU = mv[1] ? +mv[1].value : null;
        const all = JSON.parse((await kvU.get("kpiweeks:v1")) || "{}");
        all[wkk] = { wau: KPI_WAU_RAW ? active : tot, nu: KPI_WAU_RAW ? newU : (k["신규 방문자"] ?? null), join: k["신규 가입"] ?? null, from: s0, to: e0,
          raw: { active, newU }, excl: { tot, nu: k["신규 방문자"] ?? null } };
        await kvU.put("kpiweeks:v1", JSON.stringify(all));
        return json({ ok: true, week: wkk, ...all[wkk] });
      }
      if (url.pathname === "/kpisheet" && q.get("feed") === "users" && /^\d{4}-\d{2}-\d{2}$/.test(q.get("date") || "")) {
        const d = q.get("date"), kvU = env.CAFE24_TOKEN_KV;
        const r = await worker_default.fetch(new Request(`https://kpi.local/?bs=${d}&be=${d}&as=${d}&ae=${d}&autoExclLowEngagement=1&key=${encodeURIComponent(env.DASHBOARD_KEY)}`), env);
        const o = await r.json().catch(() => ({}));
        const k = {}; for (const x of o.kpis || []) k[x.label] = x.after;
        const dau = o.usersInRange && o.usersInRange.after;
        if (dau == null) return json({ error: "GA4 응답에 활성 사용자가 없습니다", keys: Object.keys(o) }, 502);
        const all = JSON.parse((await kvU.get("kpiusers:v1")) || "{}");
        all[d] = { dau, nu: k["신규 방문자"] ?? null, join: k["신규 가입"] ?? null };
        await kvU.put("kpiusers:v1", JSON.stringify(all));
        return json({ ok: true, date: d, ...all[d] });
      }
      // [2026-10-28] 5-1/5-2 카테고리별 GMV — 원본이 손으로 채운 다음 기간만 채운다.
      //   원본 정의(9월 대조): 결제된 주문의 취소·반품 아닌 품목 판매가×수량, 주문일 기준.
      //   라이프·세부(테이블웨어 615 … 푸드 624) = 지금 그 카테고리(라이프 609 하위)에 있는 상품. 테이블웨어·프레그런스·가전·푸드 등은 ±2% 안.
      //   아트 = 라이프가 아닌 상품(판매된 원화는 카테고리에서 빠지기 때문 — 9월 아트 2.05억 vs 원본 2.09억). 타 조직 개인결제창·멤버십 제외.
      //   SKU 합계 = 그 카테고리 진열 상품 수(그 기간 처음 계산할 때 찍은 값) · SKU 추가 = 그 기간에 등록된 상품 수.
      //   step=pcat: 판매 상품의 카테고리 판정(KV kpifeed:pcat, 300개씩) · step=write: 시트 쓰기(서브요청 한도 때문에 나눈다)
      if (url.pathname === "/kpisheet" && q.get("part") === "cat") {
        const kvC = env.CAFE24_TOKEN_KV, id = q.get("id");
        const CATS = [["테이블웨어", 615], ["홈데코", 616], ["가구", 617], ["패브릭", 618], ["프레그런스", 619], ["가전 / 디지털", 620], ["스테이셔너리", 621], ["패션 / 뷰티", 622], ["펫", 623], ["푸드", 624]];
        const LIFE = [609, ...CATS.map((c) => c[1])];
        const kst = new Date(Date.now() + 9 * 3600e3), yest = new Date(kst.getTime() - 864e5).toISOString().slice(0, 10);
        const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
        const monthsTo = (from, to) => { const o = []; let [y, m] = from.split("-").map(Number); const [ty, tm] = to.split("-").map(Number);
          while (y < ty || (y === ty && m <= tm)) { o.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } } return o; };
        const feeds = {}; for (const m of monthsTo(KPI_EXT_FROM.month, yest.slice(0, 7))) { const v = await kvC.get("kpifeed:" + m); if (v) feeds[m] = JSON.parse(v); }
        const pcat = JSON.parse((await kvC.get("kpifeed:pcat")) || "{}");
        if (q.get("step") === "pcat") {
          const tok = await getCafe24AccessToken(env); if (!tok) return json({ error: "cafe24 인증 실패" }, 500);
          const sold = new Set(); for (const f of Object.values(feeds)) { for (const p of Object.keys(f.pM || {})) sold.add(p); for (const w of Object.values(f.pW || {})) for (const p of Object.keys(w)) sold.add(p); }
          const need = [...sold].filter((p) => !(p in pcat)).slice(0, 200);   // 200개 = 서브요청 22번(한도 50)
          for (let i = 0; i < need.length; i += 100) { const ch = need.slice(i, i + 100), hit = {};
            for (const c of LIFE) { const j = await cafe24Get(env.CAFE24_MALL_ID, tok, `products?product_no=${ch.join(",")}&category=${c}&fields=product_no&limit=100`, false, env);
              for (const p of j.products || []) (hit[String(p.product_no)] = hit[String(p.product_no)] || []).push(c); }
            for (const p of ch) pcat[p] = (hit[p] || []).join(","); }
          await kvC.put("kpifeed:pcat", JSON.stringify(pcat));
          if (need.length) return json({ ok: true, classified: need.length, left: [...sold].filter((p) => !(p in pcat)).length });   // SKU 는 판정이 끝난 다음 호출에서
          // SKU 스냅샷 — 기간마다 한 번(이미 있으면 안 부른다)
          const sku = JSON.parse((await kvC.get("kpifeed:sku")) || "{}"); let skuCalls = 0;
          const periods = [...Object.keys(feeds).map((m) => ["m", m]), ...[...new Set(Object.values(feeds).flatMap((f) => Object.keys(f.pW || {})))].filter((k) => k >= kpiWeekKey(KPI_EXT_FROM.week)).map((k) => ["w", k])];
          for (const [kind, k] of periods) { const key = kind + ":" + k; if (sku[key] && sku[key].done) continue; if (skuCalls > 22) break;
            const [s0, e0] = kind === "m" ? [k + "-01", new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7), 0)).toISOString().slice(0, 10)] : kpiWeekDays(k);
            const x = sku[key] || (sku[key] = {}); const ended = e0 <= yest;
            for (const c of [608, ...CATS.map((z) => z[1])]) { if (x[c]) continue;
              const tot = await cafe24Get(env.CAFE24_MALL_ID, tok, `products/count?category=${c}&display=T`, false, env);
              const nw = await cafe24Get(env.CAFE24_MALL_ID, tok, `products/count?category=${c}&created_start_date=${s0}&created_end_date=${e0 > yest ? yest : e0}`, false, env);
              x[c] = [tot.count || 0, nw.count || 0]; skuCalls += 2; if (skuCalls > 22) break; }
            if (ended && [608, ...CATS.map((z) => z[1])].every((c) => x[c])) x.done = true; }
          await kvC.put("kpifeed:sku", JSON.stringify(sku));
          return json({ ok: true, classified: 0, left: 0, skuCalls, more: skuCalls > 22 });
        }
        // ---- write ----
        if (!id) return json({ error: "id 가 필요합니다" }, 400);
        const sa = JSON.parse(env.GA_SA_KEY), tok = await getAccessToken(sa, "https://www.googleapis.com/auth/spreadsheets");
        const HJ = { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, SH = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
        const meta = await (await fetch(`${SH}?fields=sheets.properties`, { headers: HJ })).json(); const P = {}; for (const x of meta.sheets || []) P[x.properties.title] = x.properties;
        const tabOf = (t) => Object.keys(P).find((x) => x.replace(/[:\s]/g, "") === t.replace(/[:\s]/g, "")) || t;
        const oMeta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${KPI_ORIG_ID}?fields=sheets.properties.title`, { headers: HJ })).json();
        const oTab = (t) => (oMeta.sheets || []).map((x) => x.properties.title).find((x) => x.replace(/[:\s]/g, "") === t.replace(/[:\s]/g, ""));
        const vget = async (sid, rng, render) => { const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodeURIComponent(rng)}?valueRenderOption=${render}&dateTimeRenderOption=SERIAL_NUMBER`, { headers: HJ }); return (await r.json()).values || []; };
        const cA1 = (n) => { let t2 = "", k = n - 1; do { t2 = String.fromCharCode(65 + (k % 26)) + t2; k = Math.floor(k / 26) - 1; } while (k >= 0); return t2; };
        const date2ser = (d) => Math.round((Date.parse(d + "T00:00:00Z") - Date.UTC(1899, 11, 30)) / 864e5);
        const ser2date = (n) => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5).toISOString().slice(0, 10);
        const sku = JSON.parse((await kvC.get("kpifeed:sku")) || "{}");
        const xp = new Set(Object.values(feeds).flatMap((f) => f.xp || []));
        const sumOf = (pmap) => { const r = { A: [0, 0] }; for (const [p, [sale, qty]] of Object.entries(pmap || {})) {
            const cs = pcat[p]; if (cs === undefined) continue; const list = cs ? cs.split(",").map(Number) : [];
            if (!list.length) { if (xp.has(p)) continue; r.A[0] += sale; r.A[1] += qty; continue; }
            for (const c of list) { const x = r[c] || (r[c] = [0, 0]); x[0] += sale; x[1] += qty; } } return r; };
        const note = {}, reqs = [], vals = [];
        for (const [t0, kind, width, offs] of [["5-1. 카테고리별 GMV(월별)", "m", 8, [0, 3, 6, 7]], ["5-2. 카테고리별 GMV(주별)", "w", 7, [0, 2, 5, 6]]]) {
          const t = tabOf(t0), keyOf = (x) => kind === "m" ? (typeof x === "number" && x > 40000 ? ser2date(x).slice(0, 7) : null)
            : ((m) => m ? `${m[1]}-${String(+m[2]).padStart(2, "0")}-W${m[3]}` : null)(String(x || "").match(/^(\d{4})년\s*(\d+)월\s*(\d)주/));
          let oLastR = 0, oLastK = null; (await vget(KPI_ORIG_ID, `'${oTab(t0)}'!B1:B400`, "UNFORMATTED_VALUE")).forEach((r, i) => { const k = keyOf(r[0]); if (k && i >= 4) { oLastR = i + 1; oLastK = k; } });
          if (!oLastR) { note[t0] = "원본 기준 줄 없음"; continue; }
          const keys = kind === "m" ? Object.keys(feeds).filter((m) => m > oLastK).sort()
            : [...new Set(Object.values(feeds).flatMap((f) => Object.keys(f.pW || {})))].filter((k) => k > oLastK).sort();
          const pOf = (k) => kind === "m" ? (feeds[k] || {}).pM : Object.values(feeds).reduce((acc, f) => { for (const [p, v] of Object.entries((f.pW || {})[k] || {})) { const a = acc[p] || (acc[p] = [0, 0]); a[0] += v[0]; a[1] += v[1]; } return acc; }, {});
          const hdr = (await vget(id, `'${t}'!A3:ZZ3`, "UNFORMATTED_VALUE"))[0] || []; const colOf = {}; hdr.forEach((h, i) => { if (h) colOf[String(h).replace(/\s/g, "")] = i + 1; });
          const tmpl = (await vget(id, `'${t}'!A${oLastR}:ZZ${oLastR}`, "FORMULA"))[0] || [];
          const cur = await vget(id, `'${t}'!B${oLastR + 1}:B400`, "UNFORMATTED_VALUE"); const endR = oLastR + cur.length;
          const W = Math.max(tmpl.length, 3);
          // 우리 줄 전부 비우고(옛 슬랙봇 기준 값 포함) 새로 쓴다
          if (endR > oLastR) vals.push({ range: `'${t}'!B${oLastR + 1}:${cA1(W)}${endR}`, values: Array.from({ length: endR - oLastR }, () => Array(W - 1).fill("")) });
          if (keys.length) {
            reqs.push({ copyPaste: { source: { sheetId: P[t].sheetId, startRowIndex: oLastR - 1, endRowIndex: oLastR }, destination: { sheetId: P[t].sheetId, startRowIndex: oLastR, endRowIndex: oLastR + keys.length }, pasteType: "PASTE_FORMAT" } });
            let st = -1; for (let j = 2; j <= tmpl.length; j++) { const f = typeof tmpl[j] === "string" && tmpl[j].startsWith("="); if (f && st < 0) st = j; if (!f && st >= 0) {
              reqs.push({ copyPaste: { source: { sheetId: P[t].sheetId, startRowIndex: oLastR - 1, endRowIndex: oLastR, startColumnIndex: st, endColumnIndex: j }, destination: { sheetId: P[t].sheetId, startRowIndex: oLastR, endRowIndex: oLastR + keys.length, startColumnIndex: st, endColumnIndex: j }, pasteType: "PASTE_FORMULA" } }); st = -1; } } }
          keys.forEach((k, i) => { const R = oLastR + 1 + i, sm = sumOf(pOf(k)), sk = (sku[kind + ":" + k]) || {};
            vals.push({ range: `'${t}'!B${R}`, values: [[kind === "m" ? date2ser(k + "-01") : kpiWeekLabel(k)]] });
            for (const [nm, c] of [["아트", "A"], ...CATS]) { const col = colOf[nm.replace(/\s/g, "")]; if (!col) continue;
              const v = sm[c] || [0, 0], s2 = sk[c === "A" ? 608 : c] || ["", ""];
              const cells = [v[0], v[1], s2[0], s2[1]]; offs.forEach((o, j) => vals.push({ range: `'${t}'!${cA1(col + o)}${R}`, values: [[cells[j]]] })); } });
          note[t0] = `${oLastK} 다음 ${keys.join(",") || "없음"}`;
        }
        // 순서: 우리 줄 비우기 → 서식·수식 복사 → 라벨·값 쓰기 (비우기를 나중에 하면 복사한 수식이 지워진다)
        const clears = vals.filter((v) => /:/.test(v.range.split("!")[1])), rest = vals.filter((v) => !/:/.test(v.range.split("!")[1]));
        if (clears.length) { const w = await fetch(`${SH}/values:batchUpdate`, { method: "POST", headers: HJ, body: JSON.stringify({ valueInputOption: "RAW", data: clears }) }); if (!w.ok) return json({ error: "clear " + (await w.text()).slice(0, 200) }, 500); }
        if (reqs.length) { const r = await fetch(`${SH}:batchUpdate`, { method: "POST", headers: HJ, body: JSON.stringify({ requests: reqs }) }); if (!r.ok) return json({ error: "batchUpdate " + (await r.text()).slice(0, 200) }, 500); }
        for (const batch of [rest]) for (let i = 0; i < batch.length; i += 400) {
          const w = await fetch(`${SH}/values:batchUpdate`, { method: "POST", headers: HJ, body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: batch.slice(i, i + 400) }) });
          if (!w.ok) return json({ error: "values " + (await w.text()).slice(0, 200), note }, 500); }
        return json({ ok: true, note });
      }
      if (url.pathname === "/kpisheet" && q.get("part") === "ext") {
        const sa = JSON.parse(env.GA_SA_KEY), id = q.get("id"), kvE = env.CAFE24_TOKEN_KV;
        if (!id) return json({ error: "id 가 필요합니다" }, 400);
        const tok = await getAccessToken(sa, "https://www.googleapis.com/auth/spreadsheets");
        const SH = `https://sheets.googleapis.com/v4/spreadsheets/${id}`, HJ = { Authorization: "Bearer " + tok, "Content-Type": "application/json" };
        const meta = await (await fetch(`${SH}?fields=sheets.properties`, { headers: HJ })).json().catch(() => ({}));
        if (!meta.sheets) return json({ error: "시트를 못 읽습니다", detail: meta?.error?.message, saEmail: sa.client_email }, 403);
        const P = {}; for (const s of meta.sheets) P[s.properties.title] = s.properties;
        const tabOf = (t) => Object.keys(P).find((x) => x.replace(/[:\s]/g, "") === t.replace(/[:\s]/g, "")) || t;
        const cA1 = (n) => { let t2 = "", k = n - 1; do { t2 = String.fromCharCode(65 + (k % 26)) + t2; k = Math.floor(k / 26) - 1; } while (k >= 0); return t2; };
        const cNum = (a) => a.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
        const ser2date = (n) => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5).toISOString().slice(0, 10);
        const date2ser = (d) => Math.round((Date.parse(d + "T00:00:00Z") - Date.UTC(1899, 11, 30)) / 864e5);
        const DOW = ["일", "월", "화", "수", "목", "금", "토"];
        const dayLabel = (d) => `${d}(${DOW[new Date(d + "T00:00:00Z").getUTCDay()]})`;
        const dayRow = (d) => 5 + Math.round((Date.parse(d + "T00:00:00Z") - Date.parse("2024-01-01T00:00:00Z")) / 864e5);   // 1-4·6-4 일별은 2024-01-01 = 5행
        const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
        const get = async (tab, rng, render = "UNFORMATTED_VALUE") => {
          const r = await fetch(`${SH}/values/${encodeURIComponent(`'${tab}'!${rng}`)}?valueRenderOption=${render}&dateTimeRenderOption=SERIAL_NUMBER`, { headers: HJ });
          const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${tab} 읽기: ${j?.error?.message || r.status}`); return j.values || []; };
        const reqs = [], vals = [];
        const flush = async () => {
          if (reqs.length) { const r = await fetch(`${SH}:batchUpdate`, { method: "POST", headers: HJ, body: JSON.stringify({ requests: reqs.splice(0) }) });
            if (!r.ok) throw new Error("batchUpdate: " + (await r.text()).slice(0, 300)); }
          for (let i = 0; i < vals.length; i += 500) { const r = await fetch(`${SH}/values:batchUpdate`, { method: "POST", headers: HJ,
            body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: vals.slice(i, i + 500) }) });
            if (!r.ok) throw new Error("values: " + (await r.text()).slice(0, 300)); }
          vals.length = 0; };
        const growCols = (tab, need) => { const p = P[tab]; if (p.gridProperties.columnCount < need) {
          reqs.push({ appendDimension: { sheetId: p.sheetId, dimension: "COLUMNS", length: need - p.gridProperties.columnCount + 6 } });
          p.gridProperties.columnCount = need + 6; } };
        const growRows = (tab, need) => { const p = P[tab]; if (p.gridProperties.rowCount < need) {
          reqs.push({ appendDimension: { sheetId: p.sheetId, dimension: "ROWS", length: need - p.gridProperties.rowCount + 20 } });
          p.gridProperties.rowCount = need + 20; } };
        const copyCols = (tab, c0, w, dst) => reqs.push({ copyPaste: { source: { sheetId: P[tab].sheetId, startColumnIndex: c0 - 1, endColumnIndex: c0 - 1 + w },
          destination: { sheetId: P[tab].sheetId, startColumnIndex: dst - 1, endColumnIndex: dst - 1 + w }, pasteType: "PASTE_NORMAL" } });
        const copyRow = (tab, r0, dst, n = 1, type = "PASTE_NORMAL") => reqs.push({ copyPaste: { source: { sheetId: P[tab].sheetId, startRowIndex: r0 - 1, endRowIndex: r0 },
          destination: { sheetId: P[tab].sheetId, startRowIndex: dst - 1, endRowIndex: dst - 1 + n }, pasteType: type } });
        const kst = new Date(Date.now() + 9 * 3600e3), yest = new Date(kst.getTime() - 864e5).toISOString().slice(0, 10);
        const note = {};
        const monthsTo = (from, to) => { const o = []; let [y, m] = from.split("-").map(Number); const [ty, tm] = to.split("-").map(Number);
          while (y < ty || (y === ty && m <= tm)) { o.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } } return o; };
        const months = monthsTo(KPI_EXT_FROM.month, yest.slice(0, 7));
        const feedMonths = monthsTo(KPI_EXT_FROM.fb.slice(0, 7), yest.slice(0, 7));
        const feed = {}; for (const m of feedMonths) { const v = await kvE.get("kpifeed:" + m); feed[m] = v ? JSON.parse(v) : null; }
        const weeks = []; for (let d = KPI_EXT_FROM.week; d <= yest; d = addDays(d, 1)) { const k = kpiWeekKey(d); if (!weeks.includes(k)) weeks.push(k); }
        const val = (x) => (x ? x.sale : "");
        try {
          // ---------- 원본 시트 읽기 — 원본이 어디까지 채웠는지 본다(그 뒤만 우리가 만든다) ----------
          const OH = { Authorization: "Bearer " + tok };
          const oMeta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${KPI_ORIG_ID}?fields=sheets.properties.title`, { headers: OH })).json().catch(() => ({}));
          const oTabs = (oMeta.sheets || []).map((x) => x.properties.title);
          if (!oTabs.length) throw new Error("원본 시트를 못 읽습니다(SA 공유 확인)");
          const oGet = async (t0, rng, render = "FORMULA") => { const ot = oTabs.find((x) => x.replace(/[:\s]/g, "") === t0.replace(/[:\s]/g, "")); if (!ot) return [];
            const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${KPI_ORIG_ID}/values/${encodeURIComponent(`'${ot}'!${rng}`)}?valueRenderOption=${render}&dateTimeRenderOption=SERIAL_NUMBER`, { headers: OH });
            const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`원본 ${t0} 읽기: ${j?.error?.message || r.status}`); return j.values || []; };
          // [2026-10-29] step=wk — 6-3 유저(주별) WAU(F)·새 사용자(I) 만 KV kpiweeks:v1 로 채우고 끝낸다. ext 본문 끝에 붙였더니 서브요청 50개를 넘겨 죽었다(실측).
          //   원본이 손입력을 멈춘 주부터만. 원본 F 에 값이 있는 주는 건드리지 않는다(원본 팀 값이 이긴다). 크론 단계 'wk' 가 ext 다음에 부른다.
          if (q.get("step") === "wk") {
            const t0 = "6-3. 유저(주별)", t = tabOf(t0), wk = (x) => { const m = String(x || "").match(/^(\d{4})년\s*(\d+)월\s*(\d)주/); return m ? `${m[1]}-${String(+m[2]).padStart(2, "0")}-W${m[3]}` : null; };
            const Wk = JSON.parse((await kvE.get("kpiweeks:v1")) || "{}"), oF = await oGet(t0, "B1:I400", "UNFORMATTED_VALUE"), g2 = await get(t, "B1:B400");
            let nW = 0; const done = []; g2.forEach((r, i) => { const k = wk(r[0]); if (!k || i < 4 || !Wk[k] || k < kpiWeekKey(KPI_EXT_FROM.week)) return;
              const orow = oF.find((x) => wk(x[0]) === k); if (orow && (orow[4] !== "" && orow[4] != null)) return;   // 원본 F 에 값 있음 → 패스
              vals.push({ range: `'${t}'!F${i + 1}`, values: [[Wk[k].wau]] }, { range: `'${t}'!I${i + 1}`, values: [[Wk[k].nu ?? ""]] }); nW++; done.push(k); });
            await flush(); note["6-3 WAU"] = `${nW}주 (${done.join(",")})`;
            return json({ ok: true, yest, note });
          }
          // 템플릿 줄의 '수식 칸'만 아래로 복사(값 칸은 안 건드린다 — 전에 통째로 복사해 날짜 라벨·손입력이 같이 복사됐다)
          const fmlCopy = async (t, tr, r0, n, cMin = 3) => {
            if (n <= 0) return 0; const row = ((await get(t, `A${tr}:ZZ${tr}`, "FORMULA"))[0]) || [];
            const runs = []; let st = -1;
            for (let j = cMin - 1; j <= row.length; j++) { const f = typeof row[j] === "string" && row[j].startsWith("=");
              if (f && st < 0) st = j; if (!f && st >= 0) { runs.push([st, j]); st = -1; } }
            growRows(t, r0 + n + 1);
            for (const [a, b] of runs) reqs.push({ copyPaste: { source: { sheetId: P[t].sheetId, startRowIndex: tr - 1, endRowIndex: tr, startColumnIndex: a, endColumnIndex: b },
              destination: { sheetId: P[t].sheetId, startRowIndex: r0 - 1, endRowIndex: r0 - 1 + n, startColumnIndex: a, endColumnIndex: b }, pasteType: "PASTE_FORMULA" } });
            return runs.length; };
          const blankRows = (t, r0, r1, lastCol) => { if (r1 < r0) return; const w = cNum(lastCol) - 2;
            vals.push({ range: `'${t}'!C${r0}:${lastCol}${r1}`, values: Array.from({ length: r1 - r0 + 1 }, () => Array(w).fill("")) }); };
          // ---------- 1-4 일별: 원본 RAW 마지막 날 다음 ~ 어제 — 원본 마지막 줄의 수식(RAW VLOOKUP)을 복사, 숫자는 RAW 탭이 채운다 ----------
          {
            const t = tabOf("1-4. 자사몰 GMV(일별)");
            const ra = await oGet("RAW. 자사몰 GMV", "A1:A3000", "UNFORMATTED_VALUE");
            let rawLast = ""; ra.forEach((r) => { const m = String(r[0] || "").match(/^(\d{4}-\d{2}-\d{2})/); if (m && m[1] > rawLast) rawLast = m[1]; });
            note.rawLast = rawLast;
            if (rawLast && rawLast < yest) {
              const tr = dayRow(rawLast), r0 = tr + 1, r1 = dayRow(yest);
              growRows(t, r1 + 9); await flush();
              blankRows(t, r0, r1 + 7, "AH"); await flush();
              await fmlCopy(t, tr, r0, r1 - r0 + 1);
              for (let d = addDays(rawLast, 1); d <= addDays(yest, 7); d = addDays(d, 1)) vals.push({ range: `'${t}'!B${dayRow(d)}`, values: [[dayLabel(d)]] });
              await flush(); note["1-4"] = `수식 ${addDays(rawLast, 1)}~${yest}`;
              // RAW 탭: 원본 RAW 다음 날 ~ 어제를 주문 API 로 채운다(행 = 2026-01-01 이 2행). 그 뒤 일주일은 비운다.
              //   서브요청 한도(50) 때문에 따로 부른다: part=ext&step=raw (크론 단계 'raw')
              if (q.get("step") === "raw") {
              const RT = tabOf("RAW. 자사몰 GMV"), rawRow = (d) => 2 + Math.round((Date.parse(d + "T00:00:00Z") - Date.parse("2026-01-01T00:00:00Z")) / 864e5);
              const rd = await kpiRawDays(env, addDays(rawLast, 1), yest); const rows2 = [];
              for (let d = addDays(rawLast, 1); d <= addDays(yest, 7); d = addDays(d, 1)) { const x = rd[d];
                if (d > yest || !x) { rows2.push([d > yest ? "" : dayLabel(d), ...Array(15).fill(d > yest ? "" : 0)]); continue; }
                const tot = x.pay + x.pt + x.cr + x.npt;
                rows2.push([dayLabel(d), x.ord, x.item, x.price, x.ship, x.disc, x.cpn, x.pay, x.pt, x.cr, 0, x.npt, 0, tot, x.ref, tot - x.ref]); }
              growRows(RT, rawRow(addDays(yest, 7)) + 2); await flush();
              await fetch(`${SH}/values:batchUpdate`, { method: "POST", headers: HJ, body: JSON.stringify({ valueInputOption: "RAW",
                data: [{ range: `'${RT}'!A${rawRow(addDays(rawLast, 1))}:P${rawRow(addDays(yest, 7))}`, values: rows2 }] }) });
              note.raw = `RAW ${addDays(rawLast, 1)}~${yest} (주문 API)`;
              // [2026-10-29] 1-4 AD '신규 상품 수(SKU)' — 원본은 손입력(값)이라 RAW 마지막 날 이후가 비어 있었고,
              //   요약의 10월 289 가 10-19 까지 합으로 보였다. 하루씩 products/count(등록일)로 센다.
              //   KV kpisku:v1 에 두고 없는 날만 부른다(한 번에 10일 — 서브요청 한도). 원본 팀이 그 날짜를 손으로 넣으면 part=sync 가 원본 값으로 바꾼다.
              //   실패해도 RAW 채우기는 이미 끝났으므로 note 에만 남긴다.
              try {
                const SK = JSON.parse((await kvE.get("kpisku:v1")) || "{}"); let nNew = 0;
                const ct = await getCafe24AccessToken(env);
                for (let d = addDays(rawLast, 1); d <= yest && nNew < 10; d = addDays(d, 1)) { if (SK[d] != null) continue;
                  const c = await cafe24Get(env.CAFE24_MALL_ID, ct, `products/count?created_start_date=${d}&created_end_date=${d}`, false, env);
                  if (c && c.count != null) { SK[d] = +c.count; nNew++; } }
                await kvE.put("kpisku:v1", JSON.stringify(SK));
                const sv = []; for (let d = addDays(rawLast, 1); d <= yest; d = addDays(d, 1)) if (SK[d] != null) sv.push({ range: `'${t}'!AD${dayRow(d)}`, values: [[SK[d]]] });
                if (sv.length) await fetch(`${SH}/values:batchUpdate`, { method: "POST", headers: HJ, body: JSON.stringify({ valueInputOption: "RAW", data: sv }) });
                note.sku = `SKU ${sv.length}일 (새로 센 날 ${nNew})`;
              } catch (e) { note.skuErr = String(e && e.message || e).slice(0, 120); }
              }
            }
            if (q.get("step") === "raw") return json({ ok: true, yest, note });
          }
          // ---------- 6-4 유저(일별): C 회원가입 · E DAU · G 새 사용자 · Q·R 첫 구매 ----------
          {
            const t = tabOf("6-4. 유저(일별)"), U = JSON.parse((await kvE.get("kpiusers:v1")) || "{}");
            const tr = dayRow(addDays(KPI_EXT_FROM.user, -1));   // 원본 마지막 손입력 줄(수식 원본)
            const r0 = dayRow(KPI_EXT_FROM.user), r1 = dayRow(yest);
            growRows(t, r1 + 9); await flush();
            blankRows(t, r0, r1 + 7, "AB"); await flush();
            await fmlCopy(t, tr, r0, r1 - r0 + 1);
            for (let d = KPI_EXT_FROM.user; d <= addDays(yest, 7); d = addDays(d, 1)) vals.push({ range: `'${t}'!B${dayRow(d)}`, values: [[dayLabel(d)]] });
            await flush();
            let nU = 0, nF = 0;
            for (let d = KPI_EXT_FROM.fb; d <= yest; d = addDays(d, 1)) { const r = dayRow(d);
              const u = U[d], fbv = (feed[d.slice(0, 7)] || { fb: {} }).fb[d];
              if (d >= KPI_EXT_FROM.user) { vals.push({ range: `'${t}'!C${r}`, values: [[u && u.join != null ? u.join : ""]] },
                { range: `'${t}'!E${r}`, values: [[u ? u.dau : ""]] }, { range: `'${t}'!G${r}`, values: [[u && u.nu != null ? u.nu : ""]] }); if (u) nU++; }
              if (feed[d.slice(0, 7)]) { vals.push({ range: `'${t}'!Q${r}:R${r}`, values: [[fbv ? fbv.sale : 0, fbv ? fbv.cnt : 0]] }); nF++; } }
            note["6-4"] = `유저 ${nU}일 · 첫구매 ${nF}일`;
            await flush();
          }
          // ---------- 블록(열) 늘리기 공통: 3행 라벨로 블록을 찾고, 없으면 마지막 블록을 복사해 오른쪽에 붙인다 ----------
          const blocks = async (t, w, keyOf, labelOf, wanted) => {
            const h = (await get(t, "A3:ZZ3"))[0] || []; const at = {}; let lastC = 0;
            h.forEach((x, i) => { const k = keyOf(x); if (k) { at[k] = i + 1; lastC = Math.max(lastC, i + 1); } });
            const added = [];
            for (const k of wanted) if (!at[k]) { const dst = lastC + w; growCols(t, dst + w); copyCols(t, lastC, w, dst);
              vals.push({ range: `'${t}'!${cA1(dst)}3`, values: [[labelOf(k)]] }); at[k] = dst; lastC = dst; added.push(k); }
            return { at, added };
          };
          // 줄(행) 늘리기 공통: B열 이름으로 찾고, 없으면 마지막 줄의 서식·수식을 복사해 아래에 붙인다
          // 이름 비교는 앞뒤 공백·겹친 공백을 무시한다(카페24 이름에 '유영국 '·'프린트베이커리  printbakery' 처럼 공백이 섞여 있다).
          //   '(공급사 없음)'·'(브랜드 없음)' 같은 자리표시는 줄을 만들지 않는다.
          const nm = (x) => String(x ?? "").replace(/\s+/g, " ").trim();
          const rowsOf = async (t, names) => {
            const b = await get(t, "B1:B3000"); const at = {}; let lastR = 4;
            b.forEach((r, i) => { const v = nm(r[0]); if (i >= 4 && v) { at[v] = at[v] || i + 1; lastR = i + 1; } });
            const miss = [...new Set(names.map(nm))].filter((x) => x && !/^\(.+ 없음\)$/.test(x) && !at[x]);
            if (miss.length) { growRows(t, lastR + miss.length + 1);
              copyRow(t, lastR, lastR + 1, miss.length, "PASTE_FORMAT"); copyRow(t, lastR, lastR + 1, miss.length, "PASTE_FORMULA");
              miss.forEach((x, i) => { at[x] = lastR + 1 + i; vals.push({ range: `'${t}'!B${lastR + 1 + i}`, values: [[x]] }); }); }
            return { at, lastR: lastR + miss.length, miss };
          };
          // [2026-10-28] 우리가 늘린 줄(원본 마지막 줄 아래)의 값 칸을 비운다 — 줄을 늘릴 때 템플릿 줄의 지난달 숫자까지 복사돼
          //   새 공급사·브랜드마다 엉뚱한 7~9월 값이 붙어 엠디별 합계가 부풀었다. 수식 칸·B열 이름은 둔다. 우리 블록은 뒤에서 다시 채운다.
          const cleanTail = async (t, lastR) => {
            let oLast = 0; (await oGet(t, "B1:B3000", "UNFORMATTED_VALUE")).forEach((r, i) => { if (String(r[0] ?? "").trim()) oLast = i + 1; });
            if (!oLast || lastR <= oLast) return 0;
            const g = await get(t, `A${oLast + 1}:ZZ${lastR}`, "FORMULA");
            g.forEach((r, i) => { const w = Math.max(r.length, 3); const v = Array.from({ length: w - 2 }, (_, j) => { const c = r[j + 2]; return typeof c === "string" && c.startsWith("=") ? c : ""; });
              vals.push({ range: `'${t}'!C${oLast + 1 + i}:${cA1(w)}${oLast + 1 + i}`, values: [v] }); });
            await flush(); return lastR - oLast; };
          const monthKey = (x) => (typeof x === "number" && x > 40000 ? ser2date(x).slice(0, 7) : null);
          const fillBlocks = (t, rows, at, keys, srcOf) => {
            for (const k of keys) { const c = at[k]; if (!c) continue;
              const amt = [], qty = []; for (let r = 5; r <= rows.lastR; r++) { amt.push([""]); qty.push([""]); }
              const m = srcOf(k) || {};
              for (const [k2, v] of Object.entries(m)) { const r = rows.at[nm(k2)]; if (!r) continue;
                amt[r - 5] = [(Number(amt[r - 5][0]) || 0) + v.sale]; qty[r - 5] = [(Number(qty[r - 5][0]) || 0) + v.qty]; }
              vals.push({ range: `'${t}'!${cA1(c)}5:${cA1(c)}${rows.lastR}`, values: amt }, { range: `'${t}'!${cA1(c + 1)}5:${cA1(c + 1)}${rows.lastR}`, values: qty }); } };
          // ---------- 4-1 공급사(월) — 블록 4칸: 거래액·건수·YoY·MoM ----------
          {
            const t = tabOf("4-1. 공급사별 GMV(월별)"), ms = months.filter((m) => feed[m]);
            const names = [...new Set(ms.flatMap((m) => Object.keys(feed[m].sup)))];
            const rows = await rowsOf(t, names); await flush(); await cleanTail(t, rows.lastR);
            const { at, added } = await blocks(t, 4, monthKey, (k) => date2ser(k + "-01"), ms); await flush();
            fillBlocks(t, rows, at, ms, (k) => feed[k].sup);
            for (const k of ms) { const py = at[`${+k.slice(0, 4) - 1}${k.slice(4)}`], c = at[k]; if (!py || !c) continue;   // YoY = 작년 같은 달(2025 블록은 3칸이라 복사로는 안 맞는다)
              const f = []; for (let r = 5; r <= rows.lastR; r++) f.push([`=(${cA1(c)}${r}-${cA1(py)}${r})/${cA1(py)}${r}`]);
              vals.push({ range: `'${t}'!${cA1(c + 2)}5:${cA1(c + 2)}${rows.lastR}`, values: f }); }
            note["4-1"] = `${ms.join(",")} · 새 블록 ${added.length} · 새 공급사 ${rows.miss.length}`;
            await flush();
          }
          // ---------- 4-2 공급사(주) — 블록 3칸: 거래액·건수·WoW ----------
          {
            const t = tabOf("4-2. 공급사별 GMV(주별)");
            const wkOf = (k) => (feed[k.slice(0, 7)] || { supW: {} }).supW[k];
            const ws2 = weeks.filter((k) => feed[k.slice(0, 7)]);
            const names = [...new Set(ws2.flatMap((k) => Object.keys(wkOf(k) || {})))];
            const rows = await rowsOf(t, names); await flush(); await cleanTail(t, rows.lastR);
            const wKey = (x) => { const m = String(x || "").match(/^(\d{4})년\s*(\d+)월\s*(\d)주/); return m ? `${m[1]}-${String(+m[2]).padStart(2, "0")}-W${m[3]}` : null; };
            const { at, added } = await blocks(t, 3, wKey, (k) => kpiWeekLabel(k), ws2); await flush();
            fillBlocks(t, rows, at, ws2, wkOf);
            note["4-2"] = `${ws2.join(",")} · 새 블록 ${added.length} · 새 공급사 ${rows.miss.length}`;
            await flush();
          }
          // ---------- 3 브랜드(월) — 블록 3칸: 거래액·건수·MoM ----------
          {
            const t = tabOf("3. 브랜드(작가)별 GMV"), ms = months.filter((m) => feed[m]);
            const names = [...new Set(ms.flatMap((m) => Object.keys(feed[m].brand)))];
            const rows = await rowsOf(t, names); await flush(); await cleanTail(t, rows.lastR);
            const { at, added } = await blocks(t, 3, monthKey, (k) => date2ser(k + "-01"), ms); await flush();
            fillBlocks(t, rows, at, ms, (k) => feed[k].brand);
            note["3"] = `${ms.join(",")} · 새 블록 ${added.length} · 새 브랜드 ${rows.miss.length}`;
            await flush();
          }
          // ---------- cf. 엠디별 — 달/주 줄 늘리기: 마지막 줄 복사 후 4-1/4-2 참조 열을 새 블록으로 옮긴다 ----------
          for (const [t0, src0, kind] of [["cf. 엠디별(월별)", "4-1. 공급사별 GMV(월별)", "m"], ["cf. 엠디별(주별)", "4-2. 공급사별 GMV(주별)", "w"]]) {
            const t = tabOf(t0), src = tabOf(src0);
            const h = (await get(src, "A3:ZZ3"))[0] || [], at = {};
            h.forEach((x, i) => { const k = kind === "m" ? monthKey(x) : ((String(x || "").match(/^(\d{4})년\s*(\d+)월\s*(\d)주/) || []).length ? (() => { const m = String(x).match(/^(\d{4})년\s*(\d+)월\s*(\d)주/); return `${m[1]}-${String(+m[2]).padStart(2, "0")}-W${m[3]}`; })() : null); if (k) at[k] = i + 1; });
            const g = await get(t, "A1:CZ200", "FORMULA");
            const keyOf2 = (x) => kind === "m" ? monthKey(x) : (() => { const m = String(x || "").match(/^(\d{4})년\s*(\d+)월\s*(\d)주/); return m ? `${m[1]}-${String(+m[2]).padStart(2, "0")}-W${m[3]}` : null; })();
            // [2026-10-28] 템플릿 = 원본이 마지막으로 채운 줄. 그 아래(우리가 만든 줄)는 매번 새 규칙으로 다시 쓴다.
            let oLastK = null; (await oGet(t0, "B1:B200", "UNFORMATTED_VALUE")).forEach((r, i) => { const k = keyOf2(r[0]); if (k && i >= 4) oLastK = k; });
            let lastR = 0, lastK = null, endR = 0; g.forEach((r, i) => { const k = keyOf2(r[1]); if (k && i >= 4) { endR = i + 1; if (!oLastK || k <= oLastK) { lastR = i + 1; lastK = k; } } });
            if (!lastK || !at[lastK]) { note[t0] = "기준 줄 없음"; continue; }
            const want = (kind === "m" ? months : weeks).filter((k) => k > lastK && at[k]);
            const tmpl = g[lastR - 1]; const n = want.length;
            if (endR > lastR + n) { vals.push({ range: `'${t}'!A${lastR + n + 1}:${cA1(tmpl.length)}${endR}`, values: Array.from({ length: endR - lastR - n }, () => Array(tmpl.length).fill("")) }); await flush(); }
            if (n) { growRows(t, lastR + n + 1); copyRow(t, lastR, lastR + 1, n, "PASTE_FORMAT"); await flush(); }
            want.forEach((k, i) => { const delta = at[k] - at[lastK];
              const row = tmpl.map((v, j) => { if (j === 1) return kind === "m" ? date2ser(k + "-01") : kpiWeekLabel(k);
                if (typeof v !== "string" || !v.startsWith("=")) return v ?? "";
                return v.replace(new RegExp(`(${src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'!)([A-Z]+):([A-Z]+)`, "g"), (all, pre, a, b) => (a === b && a !== "C" ? `${pre}${cA1(cNum(a) + delta)}:${cA1(cNum(a) + delta)}` : all))
                  .replace(/([A-Z]+)(\d+)(?![\d:(])/g, (all, col, r) => (+r === lastR ? `${col}${lastR + 1 + i}` : all)); });
              vals.push({ range: `'${t}'!A${lastR + 1 + i}:${cA1(row.length)}${lastR + 1 + i}`, values: [row] }); });
            note[t0] = n ? `+${n}줄 (${want.join(",")})` : "변경 없음";
            await flush();
          }
          // ---------- 주별 줄 늘리기 (1-3 자사몰 · 6-3 유저) — 마지막 줄 복사, 일별 범위 참조는 새 주의 날짜 줄로 ----------
          for (const t0 of ["1-3. 자사몰 GMV(주별)", "6-3. 유저(주별)"]) {
            const t = tabOf(t0), g = await get(t, "A1:AZ400", "FORMULA");
            const wk = (x) => { const m = String(x || "").match(/^(\d{4})년\s*(\d+)월\s*(\d)주/); return m ? `${m[1]}-${String(+m[2]).padStart(2, "0")}-W${m[3]}` : null; };
            // [2026-10-28] 템플릿 = 원본이 마지막으로 채운 주. 그 아래(우리가 만든 주)는 매번 수요일 규칙으로 다시 쓴다.
            let oLastK = null; (await oGet(t0, "B1:B400", "UNFORMATTED_VALUE")).forEach((r, i) => { const k = wk(r[0]); if (k && i >= 4) oLastK = k; });
            let lastR = 0, lastK = null, endR = 0; g.forEach((r, i) => { const k = wk(r[1]); if (k && i >= 4) { endR = i + 1; if (!oLastK || k <= oLastK) { lastR = i + 1; lastK = k; } } });
            if (!lastK) { note[t0] = "기준 줄 없음"; continue; }
            const want = weeks.concat([kpiWeekKey(yest)]).filter((k, i, a) => a.indexOf(k) === i && k > lastK);
            const wkDays = (k) => kpiWeekDays(k).map(dayRow);
            const [ta, tb] = wkDays(lastK), tmpl = g[lastR - 1];
            if (endR > lastR + want.length) { vals.push({ range: `'${t}'!A${lastR + want.length + 1}:${cA1(tmpl.length)}${endR}`, values: Array.from({ length: endR - lastR - want.length }, () => Array(tmpl.length).fill("")) }); await flush(); }
            if (want.length) { growRows(t, lastR + want.length + 1); copyRow(t, lastR, lastR + 1, want.length, "PASTE_FORMAT"); await flush(); }
            want.forEach((k, i) => { const [na, nb] = wkDays(k), R = lastR + 1 + i;
              const row = tmpl.map((v, j) => { if (j === 1) return kpiWeekLabel(k, "주");
                if (typeof v !== "string" || !v.startsWith("=")) return v ?? "";
                const keep = [];   // 다른 탭 참조(!A1:B2)는 잠시 빼 두고, 같은 탭 참조만 한 줄씩 내린다
                let f = v.replace(/'[^']+'!\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?/g, (all) => { const m = all.match(/^(.*!)([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
                  // [2026-10-29] 범위가 아닌 단일 셀 참조('1-3…'!AN151 처럼 다른 주별 탭의 같은 줄)는 같은 줄 번호면 새 줄로 내린다 — 안 그러면 10월 4주가 3주 주문 건을 본다
                  const m1 = !m && all.match(/^(.*!)([A-Z]+)(\d+)$/);
                  keep.push(m && +m[3] === ta && +m[5] === tb ? `${m[1]}${m[2]}${na}:${m[4]}${nb}` : m1 && +m1[3] === lastR ? `${m1[1]}${m1[2]}${R}` : all); return `\u0000${keep.length - 1}\u0000`; });
                f = f.replace(/(^|[^A-Z$\u0000])([A-Z]{1,2})(\d+)(?![\d(])/g, (all, pre, col, r) => (+r >= 5 && +r <= lastR ? `${pre}${col}${+r + 1 + i}` : all));
                return f.replace(/\u0000(\d+)\u0000/g, (all, n) => keep[+n]); });
              vals.push({ range: `'${t}'!A${R}:${cA1(row.length)}${R}`, values: [row] }); });
            note[t0] = want.length ? `+${want.length}줄 (${want.join(",")})` : "변경 없음";
            await flush();
          }
        } catch (e) { return json({ error: String(e.message || e), note }, 500); }
        return json({ ok: true, yest, note });
      }
      // [2026-10-27] KPI 매출 기준 = 슬랙봇 매출총액(net) − 타 조직 개인결제창 − 선수금 미완납 (Su).
      //   slackbot 은 개인결제창 제외를 2026-09-01 주문부터만 한다(소급 안 함). 그 전 달은 여기서 한 달씩 세어 KV 에 둔다.
      //   GET /kpisheet?paywin=YYYY-MM → KV kpitt:{YYYY-MM} = { "YYYY-MM-DD": {net, gmv, cnt, ids[]} }
      //   주문 단위로 뺀다: 품목이 전부 타 조직 개인결제창인 주문만(정상 상품이 섞이면 남긴다 — CLAUDE.md 규칙과 같다).
      if (url.pathname === "/kpisheet" && /^\d{4}-\d{2}$/.test(q.get("paywin") || "")) {
        const ym = q.get("paywin"), kvP = env.CAFE24_TOKEN_KV;
        if (!kvP) return json({ error: "KV 가 연결돼 있지 않습니다" }, 503);
        if (ym >= "2026-09") return json({ ok: true, ym, skipped: "slackbot 이 이미 뺀다" });
        const tok = await getCafe24AccessToken(env);
        if (!tok) return json({ error: "cafe24 인증 실패" }, 200);
        const last = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
        const out = {}; let pages = 0, truncated = false, scanned = 0;
        const n0 = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
        for (let p2 = 0; p2 < ORDER_MAX_PAGES; p2++) {
          const j = await cafe24Get(env.CAFE24_MALL_ID, tok,
            `orders?start_date=${ym}-01&end_date=${ym}-${String(last).padStart(2, "0")}&date_type=order_date&limit=${ORDER_PAGE}&offset=${p2 * ORDER_PAGE}&embed=items`, false, env);
          const arr = j.orders || []; pages++; scanned += arr.length;
          for (const o of arr) {
            const its = o.items || [];
            // isExcludedPaywin 은 '/' 가 있어야만 뺀다 → 'HQ 개인결제창'·'PB'S 개인결제창' 처럼 '/' 없는 타 조직 건이 남는다.
            //   slackbot(revenue-daily 9월~)은 이것도 뺀다(8월 실측 3,233만 = CLAUDE.md 수치). 여기선 팀 접두로도 뺀다.
            const other = (nm) => isExcludedPaywin(nm) || (nm.indexOf("개인결제") >= 0 && !PAYWIN_KEEP.test(nm)
              && /^\s*(COM|HQ|IP|PB'?S|PBG결제|커뮤니티|판교|운영기획팀|저작권사업팀)/i.test(nm));
            if (!its.length || !its.every((it) => other(it.product_name || it.product_name_default || ""))) continue;
            if (o.paid !== "T") continue;
            const dt = String(o.order_date || "").slice(0, 10), a = o.actual_order_amount || {};
            const x = out[dt] || (out[dt] = { net: 0, gmv: 0, cnt: 0, ids: [] });
            x.net += n0(o.payment_amount); x.gmv += n0(a.order_price_amount) + n0(a.shipping_fee); x.cnt++; x.ids.push(o.order_id);
          }
          if (arr.length < ORDER_PAGE) break;
          if (p2 === ORDER_MAX_PAGES - 1) truncated = true;
        }
        await kvP.put("kpitt:" + ym, JSON.stringify(out));
        const tot = Object.values(out).reduce((a2, x) => ({ net: a2.net + x.net, cnt: a2.cnt + x.cnt }), { net: 0, cnt: 0 });
        return json({ ok: true, ym, scanned, pages, truncated, excludedOrders: tot.cnt, excludedNet: tot.net });
      }

      if (url.pathname === "/kpisheet") {
        const sa = JSON.parse(env.GA_SA_KEY);
        const id = q.get("id");
        if (!id) return json({ error: "id(스프레드시트 ID) 가 필요합니다", saEmail: sa.client_email }, 400);
        const tok = await getAccessToken(sa, "https://www.googleapis.com/auth/spreadsheets");
        const meta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties.title,sheets.properties`, {
          headers: { Authorization: "Bearer " + tok } });
        const mj = await meta.json().catch(() => ({}));
        if (!meta.ok) return json({ error: mj?.error?.message || `HTTP ${meta.status}`,
          hint: `시트를 ${sa.client_email} 에 '편집자' 로 공유해 주세요.`, saEmail: sa.client_email }, meta.status);
        if (q.get("ping")) return json({ ok: true, title: mj?.properties?.title,
          tabs: (mj.sheets || []).map((x) => x.properties.title), saEmail: sa.client_email });

        const GHP = "https://su-pbg.github.io/dashboard/";
        const grab = async (f) => { const r = await fetch(GHP + f); return r.ok ? (await r.json()).daily || [] : []; };
        const [arc, cur] = await Promise.all([grab("revenue-daily-archive.json"), grab("revenue-daily.json")]);
        const byDate = /* @__PURE__ */ new Map();
        for (const d of [...arc, ...cur]) if (d && d.date) byDate.set(d.date, d);
        const days = [...byDate.values()].sort((a2, b2) => a2.date.localeCompare(b2.date));
        if (!days.length) return json({ error: "revenue-daily 데이터가 없습니다" }, 400);
        // [2026-10-27] 매출 기준 보정 — 위 paywin 주석 참조. net 만 고친다(GMV 는 거래액이라 그대로).
        //   ① 타 조직 개인결제창(2026-08 이전): KV kpitt:{월}. 주문 건수·GMV 도 같이 뺀다(주문 자체가 이커머스 것이 아니다).
        //   ② 선수금 미완납: 이카운트 대조 결과에 '선수금' 표시가 있고 공유 메모에서 처리완료(done)가 아닌 주문.
        //      금액은 대조 결과의 카페24 실결제(paid). 주문일(주문번호 앞 8자리)의 매출에서 뺀다.
        //      대조를 돌린 날짜만 알 수 있다 — 대조 전 기간의 선수금은 못 뺀다(adj.advNote 로 알린다).
        const kvK = env.CAFE24_TOKEN_KV;
        const adj = { tt: {}, adv: {}, advList: [], ttMonths: [], ttMissing: [], advOrders: 0, advNet: 0, advMonths: [] };
        if (kvK) {
          const mons = [...new Set(days.map((d) => d.date.slice(0, 7)))];
          await Promise.all(mons.filter((m) => m < "2026-09").map(async (m) => {
            const r = await kvK.get("kpitt:" + m);
            if (!r) { adj.ttMissing.push(m); return; }
            adj.ttMonths.push(m); Object.assign(adj.tt, JSON.parse(r)); }));
          const getJ2 = async (k, d) => { const r = await kvK.get(k); return r ? JSON.parse(r) : d; };
          const listMeta = async (prefix, withVal) => { const out = []; let cursor;
            do { const l = await kvK.list({ prefix, cursor }); out.push(...l.keys); cursor = l.list_complete ? null : l.cursor; } while (cursor);
            return out; };
          const hasAdv2 = (t) => String(t || "").split(" · ").some((x) => /^선수금(?! 정산)/.test(x));
          await Promise.all(mons.filter((m) => m >= "2026-09").map(async (m) => {
            const idx = await getJ2("ecrecon:idx:" + m, {});
            const ik = await listMeta(`ecrecon:i:${m}:`);
            const iv = await Promise.all(ik.map((k) => kvK.get(k.name)));
            ik.forEach((k, i) => { if (iv[i]) idx[k.name.slice(`ecrecon:i:${m}:`.length)] = JSON.parse(iv[i]); });
            if (!Object.keys(idx).length) return;
            adj.advMonths.push(m);
            const notes = await getJ2("ecrecon:note:" + m, {});
            for (const k of await listMeta(`ecrecon:n:${m}:`)) notes[k.name.slice(`ecrecon:n:${m}:`.length)] = k.metadata || {};
            const seen = new Set();
            for (const v of Object.values(idx)) for (const x of ((v.summary || {}).issues || [])) {
              if (!x || seen.has(x.o) || !hasAdv2(x.tags)) continue;
              seen.add(x.o);
              const o8 = String(x.o).slice(0, 8), dt = `${o8.slice(0, 4)}-${o8.slice(4, 6)}-${o8.slice(6, 8)}`;
              const amt = Number(x.paid) || 0, nt = notes[x.o] || {};
              const kind = String(x.tags || "").split(" · ").find((t) => /^선수금(?! 정산)/.test(t)) || "선수금";
              adj.advList.push({ dt, o: x.o, amt, kind, ast: nt.ast || "", done: !!nt.done });
              if (nt.done) continue;
              adj.adv[dt] = (adj.adv[dt] || 0) + amt; adj.advOrders++; adj.advNet += amt;
            } }));
        }
        for (const d of days) {
          const t = adj.tt[d.date], a = adj.adv[d.date] || 0;
          if (!t && !a) continue;
          d.raw = { net: d.net, gmv: d.gmv, count: d.count };
          if (t) { d.net = (d.net || 0) - t.net; d.gmv = (d.gmv || 0) - t.gmv; d.count = Math.max(0, (d.count || 0) - t.cnt); }
          // 선수금은 매출에서 빼지 않는다(2026-10-27 Su) — '선수금' 탭 + 0. 요약 수식으로 넣고 빼고 본다.
        }

        // 한 줄치 지표 — 일·주·월 공통
        const blank = () => ({ gmv: 0, cnt: 0, ship: null, disc: 0, cpn: 0, net: 0, point: 0, dep: 0, npay: null, refund: 0 });
        const addDay = (x, d) => {
          const ds = d.discounts || {};
          x.gmv += d.gmv || 0; x.cnt += d.count || 0; x.net += d.net || 0; x.refund += d.refund || 0;
          x.disc += ds["상품 추가할인"] || 0;
          x.cpn += (ds["쿠폰"] || 0) + (ds["쿠폰(배송비)"] || 0);
          x.point += ds["적립금 사용"] || 0;
          return x;
        };
        const roll = (keyOf) => {
          const m = {};
          for (const d of days) { const k = keyOf(d.date); addDay(m[k] || (m[k] = blank()), d); }
          return m;
        };
        // 주차는 kpiWeekKey(원본 규칙)
        const dayM = /* @__PURE__ */ new Map(days.map((d) => [d.date, addDay(blank(), d)]));
        const weekM = roll((dt) => kpiWeekKey(dt));
        const monM = roll((dt) => dt.slice(0, 7));
        // 광고·신규상품수는 손입력(KV). 일별이 있으면 주·월은 합산하고, 월별 손입력이 따로 있으면 그걸 쓴다.
        const kvA = env.CAFE24_TOKEN_KV;
        const AD = kvA ? JSON.parse((await kvA.get("kpiad:v1")) || '{"ad":{},"adMonth":{}}') : { ad: {}, adMonth: {} };
        const adRoll = (keyOf) => { const m = {};
          for (const [dt, v] of Object.entries(AD.ad || {})) { const k = keyOf(dt);
            const x = m[k] || (m[k] = { c: 0, t: 0, sku: 0 }); x.c += v.c || 0; x.t += v.t || 0; x.sku += v.sku || 0; }
          return m; };
        const adW = adRoll((dt) => kpiWeekKey(dt));
        const adMo = adRoll((dt) => dt.slice(0, 7));
        for (const [k, v] of Object.entries(AD.adMonth || {})) { const x = adMo[k] || (adMo[k] = { c: 0, t: 0, sku: 0 });
          if (v.c != null) x.c = v.c; if (v.t != null) x.t = v.t; if (v.sku != null) x.sku = v.sku; }

        const r1 = (v) => (v == null ? "" : v);
        const chg = (a2, b2) => (a2 == null || b2 == null || !b2 ? "-" : (a2 - b2) / b2);
        const aov = (x) => (x.cnt ? x.gmv / x.cnt : "");
        // 월별/일별 공통 가로 배치 (원본 1-2 · 1-4 와 같은 열 순서)
        const z = { c: 0, t: 0, sku: 0 };
        // 이익 = 매출 − 환불 (원본 1-4 AA 수식과 같다). 원가는 안 들어간다.
        const profit = (x) => x.net - x.refund;
        const wideRow = (label, x, prev, a = z, pa = z) => [label,
          x.gmv, prev ? chg(x.gmv, prev.gmv) : "-", x.cnt, prev ? chg(x.cnt, prev.cnt) : "-",
          aov(x), prev ? chg(aov(x), aov(prev)) : "-",
          r1(x.ship), x.disc, x.cpn, x.gmv ? x.cpn / x.gmv : "", x.net, prev ? chg(x.net, prev.net) : "-",
          x.point, x.dep, r1(x.npay), x.refund, prev ? chg(x.refund, prev.refund) : "-",
          a.c || "", a.c ? x.gmv / a.c : "", a.c && a.t ? a.c / a.t : "", pa.c ? chg(a.c, pa.c) : "-",
          a.t || "", a.t ? x.gmv / a.t : "", pa.t ? chg(a.t, pa.t) : "-",
          profit(x), x.gmv ? profit(x) / x.gmv : "", prev ? chg(profit(x), profit(prev)) : "-",
          a.sku || "", pa.sku ? chg(a.sku, pa.sku) : "-", "", x.cnt, prev ? chg(x.cnt, prev.cnt) : "-"];
        const WIDE3 = ["구분", "거래액(GMV)", "", "거래 건", "", "객단가(AOV)", "", "배송비", "할인", "사용 쿠폰", "", "매출", "", "적립금", "예치금", "네이버 포인트", "환불", "",
          "커머스 광고(only 커머스)", "", "", "", "Total 광고(타부서/브랜딩/커머스)", "", "", "이익", "", "", "신규 상품 수(SKU)", "", "", "주문 건", ""];
        const WIDE4 = (mom) => ["", "액", mom, "수", mom, "액", mom, "", "", "액", "율", "액", mom, "", "", "", "액", mom,
          "액", "ROAS(GMV)", "비중(%)", mom, "액", "ROAS(GMV)", mom, "액", "율", mom, "수", mom, "", "수", mom];

        // 1-4 일별
        const dKeys = [...dayM.keys()].sort();
        const daily = [[], ["📌자사몰: GMV(일별)"], WIDE3, WIDE4("WoW"),
          ...dKeys.map((k, i) => { const pk = i >= 7 ? dKeys[i - 7] : null;
            return wideRow(k, dayM.get(k), pk ? dayM.get(pk) : null, (AD.ad || {})[k] || z, pk ? ((AD.ad || {})[pk] || z) : z); })];
        // 1-3 주별
        const wKeys = [...Object.keys(weekM)].sort();
        const wLabel = (k) => `${k.slice(0, 4)}년 ${+k.slice(5, 7)}월 ${k.slice(-1)}주`;
        const weekly = [[], ["📌자사몰: GMV(주별)"],
          ["구분", "거래(GMV)", "", "", "거래 건", "", "", "객단가(AOV)", "", "", "배송비", "할인", "사용 쿠폰", "", "매출", "", "", "적립금", "예치금", "네이버 포인트", "환불", "", ""],
          ["", "액", "WoW", "YoY", "수", "WoW", "YoY", "액", "WoW", "YoY", "", "", "액", "율", "액", "WoW", "YoY", "", "", "", "액", "WoW", "YoY"],
          ...wKeys.map((k, i) => { const x = weekM[k], p = i > 0 ? weekM[wKeys[i - 1]] : null;
            const y = weekM[`${+k.slice(0, 4) - 1}${k.slice(4)}`] || null;
            return [wLabel(k), x.gmv, p ? chg(x.gmv, p.gmv) : "-", y ? chg(x.gmv, y.gmv) : "-",
              x.cnt, p ? chg(x.cnt, p.cnt) : "-", y ? chg(x.cnt, y.cnt) : "-",
              aov(x), p ? chg(aov(x), aov(p)) : "-", y ? chg(aov(x), aov(y)) : "-",
              r1(x.ship), x.disc, x.cpn, x.gmv ? x.cpn / x.gmv : "", x.net, p ? chg(x.net, p.net) : "-", y ? chg(x.net, y.net) : "-",
              x.point, x.dep, r1(x.npay), x.refund, p ? chg(x.refund, p.refund) : "-", y ? chg(x.refund, y.refund) : "-"]; })];
        // 1-2 월별
        const mKeys = [...Object.keys(monM)].sort();
        const monthly = [[], ["📌자사몰: GMV(월별)"], WIDE3, WIDE4("MoM"),
          ...mKeys.map((k, i) => { const pk = i > 0 ? mKeys[i - 1] : null;
            return wideRow(`${k.slice(0, 4)}년 ${+k.slice(5, 7)}월`, monM[k], pk ? monM[pk] : null, adMo[k] || z, pk ? (adMo[pk] || z) : z); })];

        // 0. 요약
        const years = [...new Set(mKeys.map((k) => k.slice(0, 4)))].sort();
        const tgt = KPI_TARGET[q.get("year") || "2026"] || [];
        const Q = { Q1: [1, 2, 3], Q2: [4, 5, 6], Q3: [7, 8, 9], Q4: [10, 11, 12] };
        const mv = (y, i) => monM[`${y}-${String(i).padStart(2, "0")}`] || null;
        const sumOf = (y, list) => { const o = blank(); let any = false;
          for (const i of list) { const x = mv(y, i); if (x) { any = true; o.gmv += x.gmv; o.cnt += x.cnt; o.net += x.net; o.refund += x.refund; o.disc += x.disc; o.cpn += x.cpn; o.point += x.point; } }
          return any ? o : null; };
        const kpiYear = q.get("year") || "2026";
        const kpiCols = [["합계", null], ...[1, 2, 3].map((i) => [`${i}월`, i]), ["Q1", "Q1"],
          ...[4, 5, 6].map((i) => [`${i}월`, i]), ["Q2", "Q2"], ...[7, 8, 9].map((i) => [`${i}월`, i]), ["Q3", "Q3"],
          ...[10, 11, 12].map((i) => [`${i}월`, i]), ["Q4", "Q4"]];
        const tgtOf = (c) => c == null ? tgt.reduce((a2, b2) => a2 + (b2 || 0), 0)
          : (typeof c === "number" ? (tgt[c - 1] || 0) : Q[c].reduce((a2, i) => a2 + (tgt[i - 1] || 0), 0));
        const actOf = (c) => c == null ? sumOf(kpiYear, [1,2,3,4,5,6,7,8,9,10,11,12])
          : (typeof c === "number" ? mv(kpiYear, c) : sumOf(kpiYear, Q[c]));
        const kpi = [[], ["📌KPI", "", "달성율 = 매출 ÷ 목표 · 매출 = 슬랙봇 매출총액 − 타팀 개인결제창 − 선수금 미완납(처리완료 전)"], ["구분", "", `${kpiYear}년`], ["", "", ...kpiCols.map((c) => c[0])],
          ["매출액", "전체", ...kpiCols.map((c) => tgtOf(c[1]) || "")],
          ["", "달성율", ...kpiCols.map((c) => { const t = tgtOf(c[1]), a2 = actOf(c[1]); return t && a2 ? a2.net / t : ""; })],
          ["", "아트", ...kpiCols.map(() => "")], ["", "달성율", ...kpiCols.map(() => "")],
          ["", "라이프", ...kpiCols.map(() => "")], ["", "달성율", ...kpiCols.map(() => "")],
          [], ["📌요약"],
          ["구분", "", "거래액(GMV)", "", "", "", "", "", "매출", "", "신규 상품 수(SKU)", "", "회원가입", "", "활성 사용자", "", "전환(CVR)", "", "구매 전환(CVR)", "", "첫 구매 사용자"],
          ["", "", "자사몰", "비중(%)", "외부몰", "비중(%)", "합계", "YoY", "액", "YoY", "수", "YoY", "수", "YoY", "수", "YoY", "율", "YoY", "율", "YoY", "거래액", "객단가", "비중(%)", "YoY"]];
        const sumRowOf = (y, c) => c == null ? sumOf(y, [1,2,3,4,5,6,7,8,9,10,11,12]) : (typeof c === "number" ? mv(y, c) : sumOf(y, Q[c]));
        const sumLabels = [...[1, 2, 3].map((i) => [`${i}월`, i]), ["Q1", "Q1"], ...[4, 5, 6].map((i) => [`${i}월`, i]), ["Q2", "Q2"],
          ...[7, 8, 9].map((i) => [`${i}월`, i]), ["Q3", "Q3"], ...[10, 11, 12].map((i) => [`${i}월`, i]), ["Q4", "Q4"], ["합계", null]];
        for (const y of years) {
          sumLabels.forEach(([lab, c], j) => {
            const x = sumRowOf(y, c), py = sumRowOf(String(+y - 1), c);
            kpi.push([j === 0 ? `${y}년` : "", lab,
              x ? x.gmv : "", x ? 1 : "", "", "", x ? x.gmv : "", py && x ? chg(x.gmv, py.gmv) : "-",
              x ? x.net : "", py && x ? chg(x.net, py.net) : "-"]);
          });
        }

        // 1-1 자사몰 GMV(연도별) — 1-2 와 같은 열 구조, MoM 대신 YoY
        const yKeys = [...new Set(mKeys.map((k) => k.slice(0, 4)))].sort();
        const yRoll = (src) => { const m = {};
          for (const [k, v] of Object.entries(src)) { const y = k.slice(0, 4), x = m[y] || (m[y] = blank());
            x.gmv += v.gmv; x.cnt += v.cnt; x.net += v.net; x.refund += v.refund; x.disc += v.disc; x.cpn += v.cpn; x.point += v.point; }
          return m; };
        const yearM = yRoll(monM);
        const adY = {};
        for (const [k, v] of Object.entries(adMo)) { const y = k.slice(0, 4), x = adY[y] || (adY[y] = { c: 0, t: 0, sku: 0 });
          x.c += v.c || 0; x.t += v.t || 0; x.sku += v.sku || 0; }
        const yearly = [[], ["📌자사몰: GMV(연도별)"], WIDE3, WIDE4("YoY"),
          ...yKeys.map((k, i) => { const pk = i > 0 ? yKeys[i - 1] : null;
            return wideRow(`${k}년`, yearM[k], pk ? yearM[pk] : null, adY[k] || z, pk ? (adY[pk] || z) : z); })];

        // 5-1/5-2 카테고리별 — 이관된 과거 행은 안 건드리고 우리 구간만 채운다(카테고리는 2026-06-24 부터 수집).
        const CATS = ["아트", "라이프(TOTAL)", "테이블웨어", "홈데코", "가구", "패브릭", "프레그런스", "가전·디지털", "스테이셔너리", "패션·뷰티", "펫", "푸드"];
        const norm = (x) => String(x || "").replace(/[\s\/]/g, "").replace(/·/g, "");
        const catRoll = (keyOf) => { const m = {};
          for (const d of days) { const k = keyOf(d.date), b = m[k] || (m[k] = {});
            for (const c of d.categories || []) {
              const nm = c.name || "", mid = nm.startsWith("라이프 · ") ? nm.slice(5) : null;
              const put2 = (g) => { const x = b[g] || (b[g] = { amt: 0, net: 0, qty: 0, ord: 0, sku: /* @__PURE__ */ new Set() });
                x.amt += c.amt || 0; x.net += c.net || 0; x.qty += c.qty || 0; x.ord += c.orders || 0;
                for (const pp of c.products || []) x.sku.add(pp.pno); };
              if (nm === "아트") put2("아트");
              if (mid) { put2("라이프(TOTAL)"); const hit = CATS.find((t) => norm(t) === norm(mid)); if (hit) put2(hit); }
            } }
          return m; };
        const catMon = catRoll((dt) => dt.slice(0, 7));
        const catWk = catRoll((dt) => kpiWeekKey(dt));
        const catCells = (tab, bucket, labelOf, cols, step) => {
          const out = [];
          for (const [k, b] of Object.entries(bucket)) {
            if (!Object.keys(b).length) continue;      // 카테고리가 없는 기간은 건드리지 않는다(이관된 과거를 지우면 안 된다)
            const row = labelOf(k); if (!row) continue;
            const vals = [];
            CATS.forEach((c) => { const x = b[c];
              if (step === 8) vals.push(x ? x.amt : "", "", "", x ? x.ord : "", x ? x.net : "", x && x.ord ? x.amt / x.ord : "", x ? x.sku.size : "", "");
              else vals.push(x ? x.amt : "", "", x ? x.ord : "", x ? x.net : "", x && x.ord ? x.amt / x.ord : "", x ? x.sku.size : "", ""); });
            out.push({ range: `'${tab}'!C${row}:${cols}${row}`, values: [vals] });
          }
          return out;
        };

        // [2026-10-27] 원본 KPI_Dashboard 의 탭을 서식째 그대로 쓴다(한 번 POST /kpisheet {id, rebuildFrom} 로 복제).
        //   여기서는 B열 라벨로 행을 찾아 우리가 계산하는 칸만 덮는다. 열 위치·서식·2024 행은 원본 그대로,
        //   우리 값이 빈 칸("")이면 원래 값을 둔다(배송비·네이버포인트·광고·상품수 같은 손입력 칸).
        // 원본 탭 이름엔 ':' 가 들어 있다('1-1. 자사몰: GMV(연도별)'). 엑셀 경유 이관본엔 없다 → 공백·':' 빼고 맞춘다.
        const tabNames = (mj.sheets || []).map((x) => x.properties.title);
        const tabOf = (t) => tabNames.find((x) => x.replace(/[:\s]/g, "") === t.replace(/[:\s]/g, "")) || t;
        const T = { s: tabOf("0. 요약"), y: tabOf("1-1. 자사몰 GMV(연도별)"), m: tabOf("1-2. 자사몰 GMV(월별)"), w: tabOf("1-3. 자사몰 GMV(주별)"), d: tabOf("1-4. 자사몰 GMV(일별)") };
        const cA1 = (n) => { let t2 = "", k = n - 1; do { t2 = String.fromCharCode(65 + (k % 26)) + t2; k = Math.floor(k / 26) - 1; } while (k >= 0); return t2; };
        const ser2date = (n) => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5).toISOString().slice(0, 10);
        const readTab = async (tab, lastCol, rows = 3000) => {
          const r6 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${tab}'!A1:${lastCol}${rows}`)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
            { headers: { Authorization: "Bearer " + tok } });
          const j6 = await r6.json().catch(() => ({}));
          if (!r6.ok) throw new Error(`${tab} 읽기 실패: ${j6?.error?.message || r6.status}`);
          return j6.values || [];
        };
        const mergeRow = (cur, mine) => mine.map((v, i) => (v === "" || v === "-" || v == null ? (cur[i] ?? (v === "-" ? "-" : "")) : v));
        const writes = [];
        // 수식 칸 보호: 지금 시트에 수식이 걸린 칸은 우리 값 대신 그 수식을 다시 쓴다(원본 수식이 계산하게).
        //   force[탭] = 강제로 값을 넣을 열(원천 숫자 열). null 이면 그 탭은 전부 우리가 쓴 그대로.
        const colNum = (a) => a.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
        const fGrid = {};
        const formulaGrid = async (tab) => {
          if (fGrid[tab]) return fGrid[tab];
          const r6 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${tab}'!A1:DZ3000`)}?valueRenderOption=FORMULA`,
            { headers: { Authorization: "Bearer " + tok } });
          const j6 = await r6.json().catch(() => ({}));
          return (fGrid[tab] = j6.values || []);
        };
        const protectedWrite = async (data, force = {}) => {
          const out = [];
          for (const d of data) {
            const m = d.range.match(/^'(.+)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
            if (!m || force[m[1]] === null) { out.push(d); continue; }
            const tab = m[1], c0 = colNum(m[2]), r0 = +m[3], fc = new Set((force[tab] || []).map(colNum));
            const grid = await formulaGrid(tab);
            out.push({ range: d.range, values: d.values.map((row, i) => row.map((v, j) => {
              const cur = (grid[r0 - 1 + i] || [])[c0 - 1 + j];
              return (typeof cur === "string" && cur.startsWith("=") && !fc.has(c0 + j)) ? cur : v; })) });
          }
          let n = 0;
          for (let i = 0; i < out.length; i += 500) {
            const wr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, {
              method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
              body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: out.slice(i, i + 500) }) });
            const j7 = await wr.json().catch(() => ({}));
            if (!wr.ok) throw new Error(j7?.error?.message || `HTTP ${wr.status}`);
            n += j7.totalUpdatedCells || 0;
          }
          return n;
        };
        const labelKey = (v, kind) => {
          if (v == null || v === "") return null;
          if (kind === "d") return typeof v === "number" ? ser2date(v) : (String(v).match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
          if (kind === "m") { if (typeof v === "number") return ser2date(v).slice(0, 7);
            const m7 = String(v).match(/^(\d{4})[-.년\s]*(\d{1,2})/); return m7 ? `${m7[1]}-${String(+m7[2]).padStart(2, "0")}` : null; }
          return String(v).trim();
        };
        // tab: 탭 이름 · kind: 라벨 종류 · mine: 라벨키 → [C열부터의 값들] · lastCol: 마지막 열
        const fillTab = async (tab, kind, mine, width) => {
          const lastCol = cA1(2 + width);
          const grid = await readTab(tab, lastCol);
          let n = 0;
          grid.forEach((row, i) => { if (i < 4) return;
            const k = labelKey(row[1], kind), vals = k && mine[k]; if (!vals) return;
            const cur = row.slice(2, 2 + width);
            writes.push({ range: `'${tab}'!C${i + 1}:${lastCol}${i + 1}`, values: [mergeRow(cur, vals)] }); n++; });
          return n;
        };
        const mapOf = (keys, rowOf) => { const o = {}; keys.forEach((k, i) => { o[k] = rowOf(k, i).slice(1); }); return o; };
        // 1-4 일별 · 1-2 월별 · 1-1 연도별 은 wideRow(32칸) — 원본 C~AH 와 같은 순서다.
        const dMine = mapOf(dKeys, (k, i) => { const pk = i >= 7 ? dKeys[i - 7] : null;
          return wideRow(k, dayM.get(k), pk ? dayM.get(pk) : null, (AD.ad || {})[k] || z, pk ? ((AD.ad || {})[pk] || z) : z); });
        const mMine = mapOf(mKeys, (k, i) => { const pk = i > 0 ? mKeys[i - 1] : null;
          return wideRow(k, monM[k], pk ? monM[pk] : null, adMo[k] || z, pk ? (adMo[pk] || z) : z); });
        const wMine = {}; weekly.slice(4).forEach((r) => { wMine[r[0]] = r.slice(1); });
        const yMine = {}; yearly.slice(4).forEach((r) => { yMine[r[0]] = r.slice(1); });
        // 1-4 일별에만 원천 숫자를 넣는다. 1-3 주별·1-2 월별·1-1 연도별·0. 요약은 원본 수식이 1-4 를 합쳐 계산한다.
        // [2026-10-28] 1-4 는 매출(M)만 쓴다. GMV·건수·할인·쿠폰·적립금·환불은 원본처럼 RAW 탭 VLOOKUP 수식이 계산한다
        //   (전에 슬랙봇 값으로 덮었더니 슬랙봇에 내역이 없는 날 할인·쿠폰·적립금이 0이 되고 거래 건이 주문 건으로 바뀌었다).
        for (const k of Object.keys(dMine)) dMine[k] = dMine[k].map((v, i) => (i === 10 ? v : ""));
        const filled = { 일별: await fillTab(T.d, "d", dMine, 32) };
        // 1-3 주별 '매출'(P) 원본 수식은 GMV+배송비−할인−쿠폰 이라 1-4 매출과 기준이 다르다 → 1-4 매출(M) 합으로 바꾼다.
        {
          const gw = await formulaGrid(T.w); let nW = 0;
          gw.forEach((row, i) => { const f = String(row[2] || "");
            const mm = f.match(/^=sum\('([^']+)'!C(\d+):C(\d+)\)$/i);
            if (i >= 4 && mm) { writes.push({ range: `'${T.w}'!P${i + 1}:P${i + 1}`, values: [[`=sum('${mm[1]}'!M${mm[2]}:M${mm[3]})`]] }); nW++; } });
          filled.주별매출 = nW;
        }
        // 0. 요약 — 달성율 행(목표는 시트 5행 값 그대로) + 아래 요약표의 자사몰 GMV·매출(D·J)과 그에 딸린 비중·합계·YoY
        {
          let g = await readTab(T.s, "Z", 200);
          const head = (g[3] || []).slice(3, 20).map((x) => String(x || "").trim());   // D4:T4 = 합계·1월…Q4
          const colOf = (lab) => lab === "합계" ? null : (/^Q\d$/.test(lab) ? lab : +lab.replace("월", ""));
          let tr = g.findIndex((r) => String(r[1] || "").trim() === "매출액");
          const S5 = (mj.sheets || []).find((x) => x.properties.title === T.s);
          if (tr >= 0 && S5) {
            // [2026-10-27] 달성율 아래에 3줄: 실적(매출) · 선수금 미완납 · 달성율(선수금 제외). 없으면 끼워 넣는다(서식은 위 줄 따라감).
            //   선수금 미완납은 '선수금' 탭을 SUMIFS 로 읽는 수식 — 대시보드에서 처리완료를 체크하면 다음 갱신 때 빠진다.
            const SID = S5.properties.sheetId, rateRow = tr + 2;
            const sheetsPost = (rq) => fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
              method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify({ requests: rq }) });
            if (String((g[rateRow] || [])[2] || "").trim() !== "실적(매출)") {
              // B열 '매출액' 은 세로 병합이라 서식 붙여넣기(copyPaste)는 거부된다 → 끼워 넣고(윗줄 서식 상속) 숫자 서식만 바꾼다.
              const ri = await sheetsPost([{ insertDimension: { range: { sheetId: SID, dimension: "ROWS", startIndex: rateRow, endIndex: rateRow + 3 }, inheritFromBefore: true } },
                { repeatCell: { range: { sheetId: SID, startRowIndex: rateRow, endRowIndex: rateRow + 2, startColumnIndex: 3, endColumnIndex: 20 },
                  cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0" } } }, fields: "userEnteredFormat.numberFormat" } }]);
              if (!ri.ok) { const je = await ri.json().catch(() => ({})); return json({ error: "요약 줄 끼워 넣기 실패: " + (je?.error?.message || ri.status) }, 500); }
              g = await readTab(T.s, "Z", 200);
            }
            const r7 = rateRow + 1, r8 = rateRow + 2, r9 = rateRow + 3, Y = +kpiYear;
            const L = (j) => cA1(4 + j);
            const monthCol = {}; head.forEach((lab, j) => { if (/^\d+월$/.test(lab)) monthCol[+lab.replace("월", "")] = L(j); });
            const QM = { Q1: [1, 2, 3], Q2: [4, 5, 6], Q3: [7, 8, 9], Q4: [10, 11, 12] };
            const advF = (lab) => {
              if (/^\d+월$/.test(lab)) { const m = +lab.replace("월", "");
                return `=SUMIFS('선수금'!$C:$C,'선수금'!$A:$A,">="&DATE(${Y},${m},1),'선수금'!$A:$A,"<"&DATE(${Y},${m + 1},1),'선수금'!$F:$F,"미완납")`; }
              if (QM[lab]) return `=${QM[lab].map((m) => `${monthCol[m]}${r8}`).join("+")}`;
              if (lab === "합계") return `=SUM(${Object.values(monthCol).map((c) => `${c}${r8}`).join(",")})`;
              return ""; };
            let yr0 = ""; const rowsBy0 = {};
            g.forEach((r, i) => { if (i < r9) return; if (r[1]) yr0 = String(r[1]).replace("년", "").trim(); const lab = String(r[2] || "").trim();
              if (/^\d{4}$/.test(yr0) && lab) rowsBy0[`${yr0}|${lab}`] = i + 1; });
            // 월 = 아래 요약표 J(=1-2 매출) · 분기·합계 = 그 달들의 합(아래 표에 분기·합계 줄이 없을 수 있다)
            const act = head.map((lab) => {
              if (/^\d+월$/.test(lab)) { const rr = rowsBy0[`${Y}|${lab}`]; return rr ? `=J${rr}` : ""; }
              if (QM[lab]) return `=SUM(${QM[lab].map((m) => `${monthCol[m]}${r7}`).join(",")})`;
              if (lab === "합계") return `=SUM(${Object.values(monthCol).map((c) => `${c}${r7}`).join(",")})`;
              return ""; });
            writes.push({ range: `'${T.s}'!C${rateRow}:T${r9}`, values: [
              ["달성율", ...head.map((lab, j) => lab ? `=IF(${L(j)}${r7}="","",IFERROR(${L(j)}${r7}/${L(j)}${tr + 1},""))` : "")],
              ["실적(매출)", ...act],
              ["선수금 미완납", ...head.map(advF)],
              ["달성율(선수금 제외)", ...head.map((lab, j) => lab ? `=IF(${L(j)}${r7}="","",IFERROR((${L(j)}${r7}-${L(j)}${r8})/${L(j)}${tr + 1},""))` : "")]] });
            // 달성율 두 줄은 % (원본 Q4 칸은 서식이 비어 있어 소수로 보였다)
            const pct = (r) => ({ repeatCell: { range: { sheetId: SID, startRowIndex: r - 1, endRowIndex: r, startColumnIndex: 3, endColumnIndex: 20 },
              cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0%" } } }, fields: "userEnteredFormat.numberFormat" } });
            await sheetsPost([pct(rateRow), pct(r9), { updateCells: { range: { sheetId: SID, startRowIndex: rateRow - 1, endRowIndex: rateRow, startColumnIndex: 2, endColumnIndex: 3 },
              rows: [{ values: [{ note: "달성율 = 실적(매출) ÷ 목표 — 선수금 포함\n실적(매출) = 슬랙봇 매출총액 − 타팀 개인결제창\n선수금 미완납 = '선수금' 탭에서 처리완료 전 금액(이카운트 대조 2026-09~)\n달성율(선수금 제외) = (실적 − 선수금 미완납) ÷ 목표\n매일 아침 자동 갱신" }] }], fields: "note" } }]);
          }
          // '선수금' 탭 — 이카운트 대조에서 선수금 표시가 붙은 주문 전부(처리완료 포함). 0. 요약 수식이 이걸 읽는다.
          {
            const AT = "선수금";
            if (!tabNames.includes(AT)) await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
              method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
              body: JSON.stringify({ requests: [{ addSheet: { properties: { title: AT, gridProperties: { rowCount: 3000, columnCount: 8, frozenRowCount: 1 } } } }] }) });
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${AT}'!A2:G3000`)}:clear`, {
              method: "POST", headers: { Authorization: "Bearer " + tok } });
            const list = adj.advList.slice().sort((a2, b2) => a2.dt.localeCompare(b2.dt) || String(a2.o).localeCompare(String(b2.o)));
            writes.push({ range: `'${AT}'!A1:G${list.length + 1}`, values: [
              ["주문일", "주문번호", "금액(카페24 실결제)", "구분", "진행 상태", "상태", "대시보드 이카운트 대조의 선수금 주문 · 처리완료 체크 전이면 '미완납' · 매일 아침 자동 갱신"],
              ...list.map((x) => [x.dt, x.o, x.amt, x.kind, x.ast, x.done ? "처리완료" : "미완납", ""])] });
            filled.선수금 = list.length;
          }
        }
        let wj = { totalUpdatedCells: 0 };
        try {
          wj.totalUpdatedCells = await protectedWrite(writes, {
            [T.d]: ["M"],   // 매출만 우리 값(슬랙봇 기준). 나머지는 원본 수식
            [T.w]: ["P"], [T.s]: null, "선수금": null });
        } catch (e) { return json({ error: String(e.message || e), saEmail: sa.client_email, filled }, 500); }
        // 5-1/5-2 카테고리별 — B열 라벨로 행을 찾아 우리 구간만 덮는다
        let catNote = "skip";
        try {
          const readB = async (tab) => {
            const r5 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${tab}'!B1:B400`)}`,
              { headers: { Authorization: "Bearer " + tok } });
            const j5 = await r5.json().catch(() => ({}));
            const map = {};
            (j5.values || []).forEach((x, i) => { const v = String(x[0] || "").trim(); if (v) map[v] = i + 1; });
            return map;
          };
          const bm = await readB("5-1. 카테고리별 GMV(월별)");
          const bw = await readB("5-2. 카테고리별 GMV(주별)");
          const mLabel = (k) => bm[`${k}-01`] || bm[k] || null;
          const wLab2 = (k) => { const l = `${k.slice(0, 4)}년 ${+k.slice(5, 7)}월 ${k.slice(-1)}주차`; return bw[l] || bw[l.replace("주차", "주")] || null; };
          const cells = [...catCells("5-1. 카테고리별 GMV(월별)", catMon, mLabel, "CT", 8),
                         ...catCells("5-2. 카테고리별 GMV(주별)", catWk, wLab2, "CH", 7)];
          // [2026-10-28] 슬랙봇 카테고리는 원본 5-x 정의와 달라(중복 축·취소 반영) 쓰지 않는다 → part=cat 이 채운다.
          catNote = `part=cat (슬랙봇 ${cells.length}행 미사용)`;
        } catch (e) { catNote = "실패: " + String(e && e.message || e).slice(0, 120); }

        // 6-x 유저 탭은 part=ext 가 채운다(2026-10-27). 여기서는 안 건드린다.
        const userNote = "part=ext";

        return json({ ok: true, through: days[days.length - 1].date,
          기준: { 타팀제외월: adj.ttMonths.sort(), 타팀백필필요: adj.ttMissing.sort(), 선수금대조월: adj.advMonths.sort(), 선수금미완납: adj.advOrders, 선수금미완납금액: adj.advNet }, rows: filled, 유저: userNote, 카테고리: catNote, updated: wj.totalUpdatedCells });
      }

      // ===== 공급사 담당자·구분 오버레이 =====
      // [2026-09-28] supplier-managers.json 은 GitHub Pages 의 정적 파일이라 화면에서 고칠 수 없다.
      // 거래처 LIST 를 사람이 채울 때까지 기다리는 대신, 대시보드에서 입력한 값을 KV 에 얹는다.
      // 읽을 때 정적 파일 위에 이 오버레이를 덮어쓴다 — 원본 파일은 건드리지 않는다.
      // 날짜 파라미터 검사와 응답 캐시보다 앞에 둔다. 기간과 무관하고, 저장 직후 바로 보여야 한다.
      // ponytail: 맵 전체를 키 하나에 둔다. 동시에 두 사람이 저장하면 나중 것이 이긴다.
      //           편집이 잦아지면 공급사코드별 키로 쪼갤 것.
      if (url.pathname === "/supplier-map") {
        const kv0 = env.CAFE24_TOKEN_KV;
        if (!kv0) return json({ error: "KV 가 연결돼 있지 않습니다" }, 503);
        const SUPMAP_KEY = "suppliermap:v1";
        if (request.method === "GET") {
          const raw = await kv0.get(SUPMAP_KEY);
          return json({ overrides: raw ? JSON.parse(raw) : {} });
        }
        if (request.method === "POST") {
          let b = {};
          try { b = await request.json(); } catch (e) { /* 본문 없음 = 빈 요청 */ }
          const code = String(b.code || "").trim();
          if (!/^[A-Za-z0-9_-]{1,32}$/.test(code)) {
            return json({ error: "공급사코드가 올바르지 않습니다" }, 400);
          }
          const mgr = String(b.mgr || "").trim().slice(0, 40);
          const cat = String(b.cat || "").trim().slice(0, 20);
          const raw = await kv0.get(SUPMAP_KEY);
          const map = raw ? JSON.parse(raw) : {};
          // 빈 값 저장은 '지정 없음'을 뜻한다 — 오버레이를 지우는 것과 다르다.
          // 정적 파일에 잘못 붙은 담당자(예: S0000000 자체공급 → 이름 매칭으로 특정
          // 담당자에게 붙어 그 팀 실적의 63% 를 차지했다)를 화면에서 떼려면
          // '비어 있음'을 명시적으로 덮어쓸 수 있어야 한다.
          // 정적 파일 값으로 되돌리려면 remove:true 로 보낸다.
          if (b.remove === true) delete map[code];
          else map[code] = { mgr: mgr || null, cat: cat || null, at: new Date(Date.now() + 9 * 3600 * 1e3).toISOString().slice(0, 10) };
          await kv0.put(SUPMAP_KEY, JSON.stringify(map));
          return json({ ok: true, code, saved: map[code] || null, count: Object.keys(map).length });
        }
        return json({ error: "지원하지 않는 메서드" }, 405);
      }

      // ===== 이카운트 판매 입력: 판매입력 파일 이력 · 보관 =====
      // [2026-10-14] 데일리 전표 생성에서 만든 판매입력 엑셀을 날짜별로 남기고 다시 받을 수 있게 한다.
      //   이력은 대상 날짜의 달마다 따로 둔다(ecsales:log:YYYY-MM) — 화면은 그 달 것만 부른다. 이력은 지우지 않는다.
      //   파일은 만든 날부터 400일 보관(Su, 2026-10-14). 지나면 파일만 사라지고 이력은 남는다.
      //   GET ?month=YYYY-MM → {log:[{id,dates,by,orders,rows,filename,size,at}]} (최근 것이 앞)
      //   GET ?id=           → {filename, b64}
      //   POST {dates,by,orders,rows,filename,b64} → 저장
      // 파일엔 고객 이름·연락처·주소가 들어간다 → 로그인한 사람만 받는다(이 경로는 인증 뒤에 있다).
      // [2026-10-14] 판매 입력 대조 결과 — 예전 데일리 대사 시트(월간요약·날짜별 탭·전표입력공유)를 대시보드에서 보려고 남긴다.
      //   POST {date, summary, rows, file}  날짜별 결과 저장(ecrecon:day:{date}, 400일) + 달 목록(ecrecon:idx:{YYYY-MM})
      //   POST {note:{date, order, memo, done}}  메모·처리완료(팀 공유, ecrecon:note:{YYYY-MM})
      //   GET ?month=YYYY-MM → {idx, notes}   GET ?date=YYYY-MM-DD → {day, notes}
      //   rows 에는 고객 이름·연락처를 넣지 않는다(주문번호·공급사·상품·금액·결제유형·상태만).
      // [2026-10-14] 이카운트 판매 입력 화면 설정 — 출고처·고객명 앞말·배송 상태·선수금 진행 목록을 배포 없이 화면에서 고친다(리포트 L4).
      //   GET → {lists}  POST {lists:{wh:[],pre:[],dst:[],ast:[]}} → 통째로 저장(한 사람이 설정 화면에서 고친다). 없으면 화면의 기본값.
      if (url.pathname === "/ecconf") {
        const kv0 = env.CAFE24_TOKEN_KV;
        if (!kv0) return json({ error: "KV 가 연결돼 있지 않습니다" }, 503);
        const KEY = "ecconf:v1";
        if (request.method === "GET") { const r = await kv0.get(KEY); return json({ lists: r ? JSON.parse(r) : null }); }
        if (request.method !== "POST") return json({ error: "지원하지 않는 메서드" }, 405);
        let b = {};
        try { b = await request.json(); } catch (e) { }
        const L = b.lists || {}, out = {};
        for (const k of ["wh", "pre", "dst", "ast"]) {
          const arr = (Array.isArray(L[k]) ? L[k] : []).map((x) => String(x).trim()).filter((x) => x && x.length <= 30).slice(0, 30);
          if (!arr.length) return json({ error: `${k} 목록이 비어 있습니다` }, 400);
          out[k] = [...new Set(arr)];
        }
        await kv0.put(KEY, JSON.stringify(out));
        return json({ ok: true, lists: out });
      }
      if (url.pathname === "/ecrecon") {
        const kv0 = env.CAFE24_TOKEN_KV;
        if (!kv0) return json({ error: "KV 가 연결돼 있지 않습니다" }, 503);
        const okDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
        const getJ = async (k, d) => { const r = await kv0.get(k); return r ? JSON.parse(r) : d; };
        const now = new Date(Date.now() + 9 * 3600 * 1e3).toISOString().slice(0, 16).replace("T", " ");
        // [2026-10-14] 메모·상태는 주문마다 따로 둔다: ecrecon:n:{월}:{주문번호}, 값은 KV metadata(목록 한 번에 다 읽힘).
        //   예전엔 한 달 전체가 ecrecon:note:{월} 값 하나라 동시에 저장하면 한쪽이 사라졌다(리포트 H2). 예전 값은 그대로 두고 같이 읽는다.
        //   빈 메모(지움)도 키로 남겨야 예전 값이 다시 살아나지 않는다 → 읽을 때 빈 것은 뺀다.
        const readNotes = async (ym) => {
          const out = await getJ("ecrecon:note:" + ym, {});
          let cursor;
          do {
            const l = await kv0.list({ prefix: `ecrecon:n:${ym}:`, cursor });
            for (const k of l.keys) out[k.name.slice(`ecrecon:n:${ym}:`.length)] = k.metadata || {};
            cursor = l.list_complete ? null : l.cursor;
          } while (cursor);
          for (const [o, v] of Object.entries(out)) if (!v || (!v.memo && !v.done && !v.dst && !v.ast)) delete out[o];
          return out;
        };
        // [2026-10-14] 월간요약(idx)도 날짜마다 ecrecon:i:{월}:{날짜} 에 따로 둔다 — 일괄 대조와 전표 붙이기가 동시에 돌아도 서로 안 지움.
        //   예전 ecrecon:idx:{월} 한 값은 그대로 두고 같이 읽는다(날짜별 키가 있으면 그게 이긴다).
        const readIdx = async (ym) => {
          const out = await getJ("ecrecon:idx:" + ym, {});
          const keys = []; let cursor;
          do { const l = await kv0.list({ prefix: `ecrecon:i:${ym}:`, cursor }); keys.push(...l.keys.map((k) => k.name)); cursor = l.list_complete ? null : l.cursor; } while (cursor);
          const vals = await Promise.all(keys.map((k) => kv0.get(k)));
          keys.forEach((k, i) => { if (vals[i]) out[k.slice(`ecrecon:i:${ym}:`.length)] = JSON.parse(vals[i]); });
          return out;
        };
        const putIdx = (date, v) => kv0.put(`ecrecon:i:${date.slice(0, 7)}:${date}`, JSON.stringify(v));
        if (request.method === "GET") {
          const date = q.get("date"), month = q.get("month");
          if (okDate(date)) return json({ day: await getJ("ecrecon:day:" + date, null), notes: await readNotes(date.slice(0, 7)) });
          if (!/^\d{4}-\d{2}$/.test(month || "")) return json({ error: "month=YYYY-MM 또는 date=YYYY-MM-DD 가 필요합니다" }, 400);
          return json({ idx: await readIdx(month), notes: await readNotes(month) });
        }
        if (request.method !== "POST") return json({ error: "지원하지 않는 메서드" }, 405);
        let b = {};
        try { b = await request.json(); } catch (e) { }
        if (b.note) {
          const nt = b.note, ord = String(nt.order || "");
          if (!okDate(nt.date) || !/^\d{8}-\d{7}$/.test(ord)) return json({ error: "잘못된 메모" }, 400);
          // dst = 배송 상태(퀵·설치·차량 등 배송방식이 있는 주문의 진행: 일정 조율중·출고 예정·출고완료·배송완료·설치완료·보류)
          // ast = 선수금 진행 상태(발주 필요·발주 완료·입고 완료·출고 완료·보류). 마지막 승인(이카운트 전표 변경)은 done.
          // 보낸 칸만 바꾼다(다른 사람이 바꾼 칸을 내 화면의 옛 값으로 덮지 않게). metadata 는 1KB 한도라 메모는 200자.
          const ym = nt.date.slice(0, 7), nk = `ecrecon:n:${ym}:${ord}`;
          const cur = (await kv0.getWithMetadata(nk)).metadata || (await getJ("ecrecon:note:" + ym, {}))[ord] || {};
          const next = { date: nt.date, memo: String(cur.memo || "").slice(0, 200), done: !!cur.done, dst: cur.dst || "", ast: cur.ast || "" };
          if ("memo" in nt) next.memo = String(nt.memo || "").slice(0, 200);
          if ("done" in nt) next.done = !!nt.done;
          if ("dst" in nt) next.dst = String(nt.dst || "").slice(0, 20);
          if ("ast" in nt) next.ast = String(nt.ast || "").slice(0, 20);
          next.at = now;
          await kv0.put(nk, "", { metadata: next });
          const empty = !next.memo && !next.done && !next.dst && !next.ast;
          return json({ ok: true, note: empty ? null : next });
        }
        // [2026-10-20] undo — '다시 올리기'·'파일 취소': 잘못 올린 파일로 덮어쓴 날짜 결과를 직전 결과로 되돌린다.
        //   직전 결과는 저장할 때 ecrecon:prev:{date} 에 30일 둔다(아래 저장 참조). 직전 결과가 없던 날짜면 지운다.
        //   메모·처리완료(note)·품목코드 예비 목록·이전 날짜에 붙인 전표 표시(attach)는 건드리지 않는다.
        if (b.undo && okDate(b.undo.date)) {
          const date = b.undo.date, pk = "ecrecon:prev:" + date, prev = await getJ(pk, null);
          if (prev && prev.day) {
            await kv0.put("ecrecon:day:" + date, JSON.stringify(prev.day), { expirationTtl: 400 * 86400 });
            await putIdx(date, prev.idx || { at: prev.day.at, file: prev.day.file, summary: prev.day.summary });
            await kv0.delete(pk);
            return json({ ok: true, restored: date, file: String(prev.day.file || ""), at: String(prev.day.at || "") });
          }
          const ik = "ecrecon:idx:" + date.slice(0, 7), idx = await getJ(ik, {});
          await kv0.delete("ecrecon:day:" + date); await kv0.delete(`ecrecon:i:${date.slice(0, 7)}:${date}`);
          if (idx[date]) { delete idx[date]; await kv0.put(ik, JSON.stringify(idx)); }
          return json({ ok: true, removed: date });
        }
        // remove — 잘못 저장된 날짜 결과 지우기(메모·처리완료 등 note 는 그대로 둔다)
        if (b.remove && okDate(b.remove.date)) {
          const date = b.remove.date, ik = "ecrecon:idx:" + date.slice(0, 7), idx = await getJ(ik, {});
          await kv0.delete("ecrecon:day:" + date); await kv0.delete(`ecrecon:i:${date.slice(0, 7)}:${date}`);
          if (idx[date]) { delete idx[date]; await kv0.put(ik, JSON.stringify(idx)); }
          return json({ ok: true, removed: date });
        }
        // [2026-10-14] attach — 나중 파일에서 찾은 이전 주문의 반품·선수금 정산 전표를 그 주문일 결과에 표시로 붙인다.
        if (Array.isArray(b.attach)) {
          const byDate = {};
          for (const a of b.attach.slice(0, 1000)) {
            if (!okDate(a.date) || !/^\d{8}-\d{7}$/.test(String(a.order || "")) || !a.tag) continue;
            (byDate[a.date] ||= []).push({ order: String(a.order), tag: String(a.tag).slice(0, 40) });
          }
          const done = [];
          for (const [date, list] of Object.entries(byDate)) {
            const dk = "ecrecon:day:" + date, day = await getJ(dk, null);
            if (!day) continue;
            const idx = await readIdx(date.slice(0, 7));
            let ch = false;
            for (const a of list) {
              const r = (day.rows || []).find((x) => x.o === a.order);
              if (!r) continue;
              const tags = String(r.tags || "").split(" · ").filter(Boolean);
              if (tags.includes(a.tag)) continue;
              r.tags = [...tags, a.tag].join(" · "); ch = true; done.push({ date, order: a.order, tag: a.tag });
              const sm = (idx[date] || {}).summary;
              if (sm) {
                sm.issues ||= [];
                const it = sm.issues.find((x) => x.o === a.order);
                if (it) it.tags = r.tags;
                else sm.issues.push({ o: r.o, tags: r.tags, st: r.st, paid: r.paid, ec: r.ec, diff: r.diff, want: r.want, ecPay: r.ecPay, sup: r.sup, items: String(r.items || "").slice(0, 120) });
              }
            }
            if (ch) { await kv0.put(dk, JSON.stringify(day), { expirationTtl: 400 * 86400 }); if (idx[date]) await putIdx(date, idx[date]); }
          }
          return json({ ok: true, attached: done });
        }
        if (!okDate(b.date) || !Array.isArray(b.rows)) return json({ error: "date 와 rows 가 필요합니다" }, 400);
        const body = JSON.stringify({ date: b.date, at: now, file: String(b.file || "").slice(0, 120), summary: b.summary || {}, rows: b.rows.slice(0, 3000) });
        if (body.length > 5e6) return json({ error: "너무 큽니다" }, 400);
        // [2026-10-20] 덮어쓰기 전 직전 결과를 ecrecon:prev:{date} 에 30일 둔다 — 잘못 올린 파일을 undo 로 되돌릴 때 쓴다.
        //   같은 파일 이름으로 다시 저장할 때(같은 파일 재대조·일괄 대조)는 직전 결과를 덮지 않는다 — 안 그러면 잘못된 결과가 직전 결과를 밀어낸다.
        const curDay = await getJ("ecrecon:day:" + b.date, null), newFile = String(b.file || "").slice(0, 120);
        if (curDay && String(curDay.file || "") !== newFile)
          await kv0.put("ecrecon:prev:" + b.date, JSON.stringify({ day: curDay, idx: { at: curDay.at, file: curDay.file, summary: curDay.summary } }), { expirationTtl: 30 * 86400 });
        await kv0.put("ecrecon:day:" + b.date, body, { expirationTtl: 400 * 86400 });
        await putIdx(b.date, { at: now, file: String(b.file || "").slice(0, 120), summary: b.summary || {} });
        return json({ ok: true, at: now });
      }
      if (url.pathname === "/ecsales") {
        const kv0 = env.CAFE24_TOKEN_KV;
        if (!kv0) return json({ error: "KV 가 연결돼 있지 않습니다" }, 503);
        const logKey = (ym) => "ecsales:log:" + ym;
        // [2026-10-14] 이력은 파일마다 ecsales:m:{월}:{id} 에 둔다(예전 ecsales:log:{월} 한 값은 동시에 만들면 하나가 사라졌다 — 리포트 M2).
        //   예전 값도 같이 읽고 id 로 겹침을 없앤다. 최신이 위로.
        const readLog = async (ym) => {
          const r = await kv0.get(logKey(ym)), old = r ? JSON.parse(r) : [];
          const ids = []; let cursor;
          do { const l = await kv0.list({ prefix: `ecsales:m:${ym}:`, cursor }); ids.push(...l.keys.map((k) => k.name)); cursor = l.list_complete ? null : l.cursor; } while (cursor);
          const fresh = (await Promise.all(ids.map((k) => kv0.get(k)))).filter(Boolean).map((x) => JSON.parse(x));
          const seen = new Set(fresh.map((e) => e.id));
          return [...fresh, ...old.filter((e) => !seen.has(e.id))].sort((a, b) => String(b.at).localeCompare(String(a.at)));
        };
        if (request.method === "GET") {
          const id = q.get("id");
          if (id) {
            if (!/^[a-z0-9]{6,24}$/.test(id)) return json({ error: "잘못된 id" }, 400);
            const f = await kv0.get("ecsales:file:" + id);
            if (!f) return json({ error: "파일이 없습니다(만든 지 400일이 지나 보관 기간이 끝났을 수 있습니다)" }, 404);
            const meta = await kv0.get("ecsales:meta:" + id);
            return json({ filename: meta ? JSON.parse(meta).filename : "판매입력.xlsx", b64: f });
          }
          const ym = q.get("month") || "";
          if (!/^\d{4}-\d{2}$/.test(ym)) return json({ error: "month=YYYY-MM 이 필요합니다" }, 400);
          return json({ log: await readLog(ym) });
        }
        if (request.method !== "POST") return json({ error: "지원하지 않는 메서드" }, 405);
        let b = {};
        try { b = await request.json(); } catch (e) { }
        const b64 = String(b.b64 || "");
        if (!b64 || b64.length > 20e6) return json({ error: "파일이 없거나 너무 큽니다" }, 400);
        const dates = (Array.isArray(b.dates) ? b.dates : []).map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 62);
        if (!dates.length) return json({ error: "대상 날짜가 없습니다" }, 400);
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const entry = {
          id, at: new Date(Date.now() + 9 * 3600 * 1e3).toISOString().slice(0, 16).replace("T", " "),
          dates, by: String(b.by || "").slice(0, 20), orders: Number(b.orders) || 0, rows: Number(b.rows) || 0,
          // [2026-10-14] 이 파일에 넣은 주문번호 — 데일리 전표 생성에서 '이미 파일 있음' 표시(중복 입력 방지)
          ids: (Array.isArray(b.ids) ? b.ids : []).map(String).filter((x) => /^\d{8}-\d{7}$/.test(x)).slice(0, 3000),
          filename: String(b.filename || "판매입력.xlsx").replace(/[\\/:*?"<>|]/g, "_").slice(0, 120),
          size: Math.round(b64.length * 0.75)
        };
        const TTL = { expirationTtl: 400 * 86400 };
        await kv0.put("ecsales:file:" + id, b64, TTL);
        await kv0.put("ecsales:meta:" + id, JSON.stringify(entry), TTL);
        for (const ym of [...new Set(dates.map((d) => d.slice(0, 7)))]) await kv0.put(`ecsales:m:${ym}:${id}`, JSON.stringify(entry));
        return json({ ok: true, entry });
      }
      // ===== 전표 입력 대조: 카페24 상품(옵션) → 이카운트 품목코드 대응표 =====
      // [2026-10-14] 카페24 자체상품코드는 이카운트 품목코드가 아니라(ARG…·4205… 등, 1/3 만 채워짐) 따로 대응표를 둔다.
      // 키 = 카페24 variant_code(옵션별), 없으면 상품번호. 값 = {code, name, src:'auto'|'manual', by, at, n(근거 건수), label}.
      // 담당자가 넣은 값(src=manual)은 자동 학습(auto)이 덮어쓰지 않는다.
      // ponytail: 맵 전체를 키 하나에 둔다. 수천 건이라 KV 한 값(25MB)에 충분하다. 동시 저장은 나중 것이 이긴다.
      if (url.pathname === "/ecmap") {
        const kv0 = env.CAFE24_TOKEN_KV;
        if (!kv0) return json({ error: "KV 가 연결돼 있지 않습니다" }, 503);
        const KEY = "ecmap:v1";
        const raw = await kv0.get(KEY);
        const map = raw ? JSON.parse(raw) : {};
        // [2026-10-14] 사인지 — 에디션 품목 중 일부는 이카운트에 사인지 품목(코드+SI, 0원)을 같이 넣는다.
        //   카페24 주문엔 표시가 없어서 '이 이카운트 품목코드엔 사인지가 붙는다'를 따로 둔다. {에디션코드: 사인지코드}
        const SIGN_KEY = "ecsign:v1";
        const signRaw = await kv0.get(SIGN_KEY);
        const sign = signRaw ? JSON.parse(signRaw) : {};
        // [2026-10-19] 예비 목록(Su): 매일 올리는 대조 파일에서 나온 짝은 바로 대응표에 넣지 않고 여기 쌓는다.
        //   담당자가 맵핑 화면에서 보고 확정(entries 로 저장 + candremove)하거나 버린다. {옵션코드: {label, name, price, cands:{코드:근거수}, at, first}}
        const CAND_KEY = "ecmapcand:v1";
        const candRaw = await kv0.get(CAND_KEY);
        const cand = candRaw ? JSON.parse(candRaw) : {};
        // [2026-10-20] 이카운트 품목 사전: 올린 판매현황에 나온 코드→품명·정가를 계속 모은다(옵션 제안용). {코드:{name,price,at}}
        const DICT_KEY = "ecdict:v1";
        const dictRaw = await kv0.get(DICT_KEY);
        const dict = dictRaw ? JSON.parse(dictRaw) : {};
        if (request.method === "GET") return json({ map, sign, cand, dict, count: Object.keys(map).length });
        if (request.method !== "POST") return json({ error: "지원하지 않는 메서드" }, 405);
        let b = {};
        try { b = await request.json(); } catch (e) { }
        const okCode = (c) => /^[^\s\u0000-\u001f]{1,40}$/.test(String(c));
        if (b.dict && typeof b.dict === "object") {
          const today = new Date(Date.now() + 9 * 3600 * 1e3).toISOString().slice(0, 10);
          let ch = 0;
          for (const [c, v] of Object.entries(b.dict).slice(0, 5000)) {
            if (!okCode(c)) continue;
            const name = String((v && v.name) || "").slice(0, 120), price = Number(v && v.price) || 0;
            if (!name) continue;
            const cur = dict[c];
            if (!cur || cur.name !== name || (price && cur.price !== price)) { dict[c] = { name, price: price || (cur ? cur.price : 0) || 0, at: today }; ch++; }
          }
          if (ch) await kv0.put(DICT_KEY, JSON.stringify(dict));
          if (!Array.isArray(b.cand) && !Array.isArray(b.candremove) && !Array.isArray(b.entries) && !Array.isArray(b.remove) && !b.sign) return json({ ok: true, dictChanged: ch, dictCount: Object.keys(dict).length });
        }
        if (Array.isArray(b.cand) || Array.isArray(b.candremove)) {
          const today = new Date(Date.now() + 9 * 3600 * 1e3).toISOString().slice(0, 10);
          let added = 0, removed = 0;
          for (const k of (Array.isArray(b.candremove) ? b.candremove : [])) { if (cand[k]) { delete cand[k]; removed++; } }
          for (const c of (Array.isArray(b.cand) ? b.cand : []).slice(0, 5000)) {
            const key = String(c.key || "").trim(); if (!okCode(key)) continue;
            // 담당자가 확정한 값이 있거나, 저장된 값과 같은 코드뿐이면 예비 목록에 둘 필요가 없다
            const cs = {}; for (const [cc, nn] of Object.entries(c.cands || {})) if (okCode(cc) && Number(nn) > 0) cs[cc] = Number(nn);
            const mu = {}; for (const [cc, nn] of Object.entries(c.multi || {})) if (okCode(cc) && Number(nn) > 0) mu[cc] = Number(nn);   // 맵핑 불가(1:N) 근거
            if (!Object.keys(cs).length && !Object.keys(mu).length) continue;
            if (map[key] && (map[key].src === "manual" || (Object.keys(cs).length === 1 && cs[map[key].code]))) continue;
            const cur = cand[key] || { first: today, cands: {} };
            for (const [cc, nn] of Object.entries(cs)) cur.cands[cc] = (cur.cands[cc] || 0) + nn;
            if (Object.keys(mu).length) { cur.multi = cur.multi || {}; for (const [cc, nn] of Object.entries(mu)) cur.multi[cc] = (cur.multi[cc] || 0) + nn; }
            cur.label = String(c.label || cur.label || "").slice(0, 160); cur.price = Number(c.price) || cur.price || 0;
            if (c.pno != null && /^\d{1,9}$/.test(String(c.pno))) cur.pno = String(c.pno);
            // 같은 전표에 같이 나온 다른 품목(선택지). 근거(cands)와 따로 둔다.
            for (const [cc, nn] of Object.entries(c.alts || {})) if (okCode(cc) && Number(nn) > 0 && !cs[cc]) { cur.alts = cur.alts || {}; cur.alts[cc] = (cur.alts[cc] || 0) + Number(nn); }
            cur.names = Object.assign(cur.names || {}, Object.fromEntries(Object.entries(c.names || {}).filter(([cc]) => okCode(cc)).map(([cc, nm]) => [cc, String(nm || "").slice(0, 120)])));
            cur.at = today; cand[key] = cur; added++;
          }
          await kv0.put(CAND_KEY, JSON.stringify(cand));
          if (!Array.isArray(b.entries) && !Array.isArray(b.remove) && !b.sign) return json({ ok: true, added, removed, cand });
        }
        if (b.sign && typeof b.sign === "object") {
          let ch = 0;
          for (const [c, v] of Object.entries(b.sign).slice(0, 2000)) {
            if (!/^[^\s\u0000-\u001f]{1,40}$/.test(c)) continue;
            if (v === null || v === false) { if (sign[c]) { delete sign[c]; ch++; } }
            else if (/^[^\s\u0000-\u001f]{1,40}$/.test(String(v)) && sign[c] !== String(v)) { sign[c] = String(v); ch++; }
          }
          if (ch) await kv0.put(SIGN_KEY, JSON.stringify(sign));
          if (!Array.isArray(b.entries) && !Array.isArray(b.remove)) return json({ ok: true, sign, changed: ch });
        }
        const today = new Date(Date.now() + 9 * 3600 * 1e3).toISOString().slice(0, 10);
        let saved = 0, skipped = 0, removed = 0;
        for (const k of (Array.isArray(b.remove) ? b.remove : [])) { if (map[k]) { delete map[k]; removed++; } }
        for (const e of (Array.isArray(b.entries) ? b.entries : []).slice(0, 5000)) {
          const key = String(e.key || "").trim(), code = String(e.code || "").trim();
          // 이카운트 품목코드엔 & 같은 기호가 들어간다(예: OATCL&S0015) — 공백·제어문자만 막는다
          if (!/^[^\s\u0000-\u001f]{1,40}$/.test(key) || !/^[^\s\u0000-\u001f]{1,40}$/.test(code)) { skipped++; continue; }
          const src = e.src === "manual" ? "manual" : "auto";
          if (src === "auto" && map[key] && map[key].src === "manual") { skipped++; continue; }
          map[key] = { code, name: String(e.name || "").slice(0, 120), label: String(e.label || "").slice(0, 160), src,
                       by: String(e.by || "").slice(0, 20), n: Number(e.n) || 0, at: today };
          if (code === "*" && Array.isArray(e.multi)) map[key].multi = e.multi.filter(okCode).slice(0, 10);   // 맵핑 불가: 그 옵션 전표에 든 이카운트 품목들
          saved++;
        }
        await kv0.put(KEY, JSON.stringify(map));
        return json({ ok: true, saved, skipped, removed, count: Object.keys(map).length, cand });
      }
      // ===== 위탁 정산 ('위탁 정산' 탭) =====
      // [2026-10-12] 요율·정산서류·배송비는 [이커머스] 거래처 LIST 구글시트에만 있다.
      // 레포가 공개라 정적 파일로 둘 수 없어서, 워커가 서비스계정(GA_SA_KEY)으로 시트를 직접 읽어
      // 로그인한 사람에게만 준다. 시트를 서비스계정 이메일에 '뷰어'로 공유해야 한다.
      // 이카운트 판매내역서(고객 이름·연락처 포함)는 여기로 보내지 않는다 — 화면에서만 처리한다.
      // POST 는 '상품명 브랜드 → 공급사코드' 수동 연결. 거래처 LIST 의 공급사명·브랜드명으로 못 찾는 것만 쓴다.
      // ponytail: /supplier-map 과 같이 맵 전체를 키 하나에 둔다.
      if (url.pathname === "/settle") {
        const kv0 = env.CAFE24_TOKEN_KV;
        const MAP_KEY = "settlemap:v1", SHEET_KEY = "settle:sheet:v3";
        if (request.method === "POST") {
          if (!kv0) return json({ error: "KV 가 연결돼 있지 않습니다" }, 503);
          let b = {};
          try { b = await request.json(); } catch (e) { /* 본문 없음 */ }
          const brand = String(b.brand || "").trim();
          if (!brand || brand.length > 80) return json({ error: "브랜드명이 올바르지 않습니다" }, 400);
          const code = String(b.code || "").trim();
          if (b.remove !== true && !/^[A-Za-z0-9_-]{1,32}$/.test(code)) return json({ error: "공급사코드가 올바르지 않습니다" }, 400);
          const raw = await kv0.get(MAP_KEY);
          const map = raw ? JSON.parse(raw) : {};
          if (b.remove === true) delete map[brand];
          else map[brand] = { code, at: new Date(Date.now() + 9 * 3600 * 1e3).toISOString().slice(0, 10) };
          await kv0.put(MAP_KEY, JSON.stringify(map));
          return json({ ok: true, brand, saved: map[brand] || null, count: Object.keys(map).length });
        }
        if (request.method !== "GET") return json({ error: "지원하지 않는 메서드" }, 405);
        let sheet = null;
        if (kv0 && q.get("refresh") !== "1") {
          try { const hit = await kv0.get(SHEET_KEY); if (hit) sheet = JSON.parse(hit); } catch (e) { }
        }
        if (!sheet) {
          try {
            sheet = await readSettleSheet(env);
          } catch (e) {
            return json({ error: e.message, code: e.code || "sheet", saEmail: e.saEmail || null }, 502);
          }
          if (kv0) { try { await kv0.put(SHEET_KEY, JSON.stringify(sheet), { expirationTtl: 600 }); } catch (e) { } }
        }
        const rawMap = kv0 ? await kv0.get(MAP_KEY) : null;
        return json({ ...sheet, brandMap: rawMap ? JSON.parse(rawMap) : {} });
      }

      const ranges = {
        before: { start: q.get("bs"), end: q.get("be") },
        after: { start: q.get("as"), end: q.get("ae") }
      };
      for (const k of ["bs", "be", "as", "ae"]) {
        if (!q.get(k)) return json({ error: `\uB204\uB77D\uB41C \uD30C\uB77C\uBBF8\uD130: ${k}` }, 400);
      }
      const cacheKV = env.CAFE24_TOKEN_KV;
      // [2026-09-22] paths·vers·client 등 탭별 파라미터도 캐시 키에 넣는다.
      // 안 넣었더니 tab=slotfunnel 을 구좌 1개로 부른 응답이, 구좌 9개로 부른 요청에
      // 그대로 돌아왔다(같은 키). 응답 내용을 바꾸는 파라미터는 전부 키에 있어야 한다.
      const cacheKeyParts = ["bs", "be", "as", "ae", "tab", "excl", "autoExclLowEngagement", "cmp", "country", "paths", "vers", "client", "blen", "from", "to", "format", "anchorDate", "anchorTotal", "products", "days"].map((k) => `${k}=${q.get(k) || ""}`).join("&");
      const cacheKey = "resp:v2:" + cacheKeyParts;
      const bypassCache = q.get("nocache") === "1";
      const todayKst = new Date(Date.now() + 9 * 3600 * 1e3).toISOString().slice(0, 10);
      const touchesToday = (q.get("ae") || "") >= todayKst || (q.get("be") || "") >= todayKst;
      const ttl = touchesToday ? 300 : 1800;
      if (cacheKV && !bypassCache) {
        try {
          const hit = await cacheKV.get(cacheKey);
          if (hit) {
            return new Response(hit, { headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "X-Cache": "HIT" } });
          }
        } catch (e) {
        }
      }
      const jsonCached = /* @__PURE__ */ __name(async (obj, status = 200) => {
        const body = JSON.stringify(obj);
        if (cacheKV && status === 200) {
          try {
            await cacheKV.put(cacheKey, body, { expirationTtl: ttl });
          } catch (e) {
          }
        }
        return new Response(body, { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "X-Cache": "MISS" } });
      }, "jsonCached");
      const sa = JSON.parse(env.GA_SA_KEY);
      const propertyId = env.GA4_PROPERTY_ID && String(env.GA4_PROPERTY_ID).trim() || "333394141";
      const token = await getAccessToken(sa);
      if (q.get("tab") === "monthlyusers") {
        const monthly = await buildMonthlyUsers(propertyId, token, q.get("excl"), q.get("autoExclLowEngagement") === "1");
        return jsonCached({ monthly }, 200);
      }
      if (q.get("tab") === "usersegments") {
        const wantCmp = q.get("cmp") === "1";
        const segments = await buildUserSegments(propertyId, token, ranges.after.start, ranges.after.end, q.get("excl"), q.get("autoExclLowEngagement") === "1");
        const segmentsBefore = wantCmp ? await buildUserSegments(propertyId, token, ranges.before.start, ranges.before.end, q.get("excl"), q.get("autoExclLowEngagement") === "1") : null;
        return jsonCached({
          periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`,
          periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`,
          segments,
          segmentsBefore
        }, 200);
      }
      if (q.get("tab") === "firstsource") {
        const runFirstSource = /* @__PURE__ */ __name(async (startDate, endDate) => {
          const rows = await runReport(propertyId, token, {
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: "firstUserSourceMedium" }, { name: "newVsReturning" }],
            metrics: [
              { name: "sessions" },
              { name: "totalUsers" },
              { name: "ecommercePurchases" },
              { name: "purchaseRevenue" },
              { name: "averageSessionDuration" }
            ],
            limit: 5e3
          });
          const by = {};
          for (const r of rows) {
            const first = r.dimensionValues[0].value;
            const kind = r.dimensionValues[1].value === "returning" ? "returning" : "new";
            if (!by[first]) by[first] = { first, new: {}, returning: {} };
            by[first][kind] = {
              sessions: Number(r.metricValues[0].value),
              users: Number(r.metricValues[1].value),
              purchases: Number(r.metricValues[2].value),
              revenue: Number(r.metricValues[3].value),
              avgDuration: Math.round(Number(r.metricValues[4].value))
            };
          }
          return Object.values(by).map((o) => {
            const n = o.new || {}, rt = o.returning || {};
            const sT = (n.sessions || 0) + (rt.sessions || 0);
            const pT = (n.purchases || 0) + (rt.purchases || 0);
            const rev = (n.revenue || 0) + (rt.revenue || 0);
            return {
              ...o,
              totalSessions: sT,
              totalPurchases: pT,
              totalRevenue: rev,
              // 이 채널로 획득한 고객의 세션 중 재방문 비중
              returningShare: sT ? (rt.sessions || 0) / sT * 100 : 0,
              // 이 채널이 만든 구매 중 재방문에서 나온 비중
              repeatPurchaseShare: pT ? (rt.purchases || 0) / pT * 100 : 0,
              // 세션당 구매 (마지막 클릭이 아니라 획득 기준 전환율)
              cvr: sT ? pT / sT * 100 : 0
            };
          }).sort((a, b) => b.totalSessions - a.totalSessions);
        }, "runFirstSource");
        try {
          const cur = await runFirstSource(ranges.after.start, ranges.after.end);
          const prev = q.get("cmp") === "1" ? await runFirstSource(ranges.before.start, ranges.before.end) : null;
          return jsonCached({
            periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`,
            periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`,
            firstsource: cur,
            firstsourceBefore: prev
          }, 200);
        } catch (e) {
          return json({ error: "\uD68D\uB4DD \uCC44\uB110 \uB9AC\uD3EC\uD2B8 \uC2E4\uD328: " + String(e && e.message || e) }, 500);
        }
      }
      if (q.get("tab") === "retention") {
        try {
          const points = await buildRetentionCohort(propertyId, token);
          return jsonCached({ points }, 200);
        } catch (e) {
          return json({ error: "\uCF54\uD638\uD2B8 \uB9AC\uD3EC\uD2B8 \uC2E4\uD328: " + String(e && e.message || e) }, 500);
        }
      }
      if (q.get("tab") === "suppliersales") {
        try {
          const r = await buildSupplierSales(
            env,
            q.get("from") || ranges.after.start,
            q.get("to") || ranges.after.end,
            q.get("debug") === "1"
          );
          if (r.error) return json(r, 200);
          if (q.get("format") === "csv") {
            const rows = [["supplier_code", "qty", "amount", "canceled_qty", "canceled_amount", "orders", "products"]];
            let tq = 0, ta = 0, tc = 0, tca = 0;
            for (const x of r.suppliers || []) {
              rows.push([x.code, x.qty, Math.round(x.amount), x.canceledQty, Math.round(x.canceledAmount), x.orderCount, x.productCount]);
              tq += x.qty;
              ta += x.amount;
              tc += x.canceledQty;
              tca += x.canceledAmount;
            }
            rows.push(["TOTAL", tq, Math.round(ta), tc, Math.round(tca), r.orderCount, (r.suppliers || []).length]);
            rows.push([
              "#meta",
              `${r.from}~${r.to}`,
              `lines=${r.lineCount}`,
              `unresolved=${r.supplierUnresolved}`,
              `truncated=${r.truncated}`,
              "",
              ""
            ]);
            return csv(rows);
          }
          return jsonCached(r, 200);
        } catch (e) {
          return json({
            error: "\uACF5\uAE09\uC0AC\uBCC4 \uD310\uB9E4 \uC9D1\uACC4 \uC2E4\uD328: " + String(e && e.message || e),
            stack: String(e && e.stack || "").slice(0, 600)
          }, 200);
        }
      }
      // [2026-09-28] GA4 임의 조회 진단용. 화면 탭이 주는 집계로는 확인이 안 되는
      // 교차(예: 랜딩페이지 × 캠페인)를 확인할 때 쓴다. 다 쓰면 지울 것.
      //   ?tab=ga4probe&dims=landingPagePlusQueryString,sessionCampaignName&mets=sessions&contains=search
      if (q.get("tab") === "ga4probe") {
        const dims = (q.get("dims") || "landingPagePlusQueryString").split(",").map((n) => ({ name: n.trim() }));
        const mets = (q.get("mets") || "sessions").split(",").map((n) => ({ name: n.trim() }));
        const body = {
          dateRanges: [{ startDate: ranges.after.start, endDate: ranges.after.end }],
          dimensions: dims,
          metrics: mets,
          limit: Number(q.get("limit") || 50),
          orderBys: [{ metric: { metricName: mets[0].name }, desc: true }]
        };
        const c = q.get("contains");
        if (c) {
          body.dimensionFilter = { filter: { fieldName: dims[0].name,
            stringFilter: { matchType: "CONTAINS", value: c, caseSensitive: false } } };
        }
        try {
          const rows = await runReport(propertyId, token, body);
          return json({ dims: dims.map((d) => d.name), mets: mets.map((m) => m.name), count: rows.length,
            rows: rows.map((r) => ({ d: (r.dimensionValues || []).map((v) => v.value),
                                     m: (r.metricValues || []).map((v) => v.value) })) }, 200);
        } catch (e) {
          return json({ error: String(e && e.message || e) }, 200);
        }
      }

      // [2026-09-28] 이벤트 기반 퍼널. "검색한 사람이 샀는가" 처럼 세션 안의 순서를
      // 봐야 하는 질문은 runReport 로 못 푼다(이벤트 스코프라 교집합이 안 나온다).
      // runFunnelReport 는 단계별로 남은 사용자 수를 주므로 귀속 없이도 전환을 셀 수 있다.
      //   ?tab=funnelprobe&steps=view_search_results,view_item,add_to_cart,purchase
      // [2026-10-12] 온사이트 검색어. 광고로 들어온 세션은 빼고 센다.
      //   광고 랜딩은 '우리 몰에서 뭘 찾는지'가 아니라 '광고가 뭘 보여줬는지'라 수요로 읽으면 안 된다.
      //   상품이 0개인 검색어를 찾는 게 목적이지만 카탈로그 대조는 화면에서 한다(여기선 검색어만 준다).
      if (q.get("tab") === "searchterms") {
        const PAID = /^(Paid|Display|Affiliates|Cross-network)/i;
        const body = {
          dateRanges: [{ startDate: ranges.after.start, endDate: ranges.after.end }],
          dimensions: [{ name: "searchTerm" }, { name: "sessionDefaultChannelGroup" }],
          metrics: [{ name: "sessions" }],
          limit: Number(q.get("limit") || 5000),
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }]
        };
        try {
          const rows = await runReport(propertyId, token, body);
          const by = {};
          for (const r of rows) {
            const term = String((r.dimensionValues || [])[0]?.value || "").trim();
            if (!term) continue;
            const ch = String((r.dimensionValues || [])[1]?.value || "");
            const v = Number((r.metricValues || [])[0]?.value || 0);
            const o = by[term] || (by[term] = { term, organic: 0, paid: 0 });
            if (PAID.test(ch)) o.paid += v; else o.organic += v;
          }
          const list = Object.values(by).map((o) => ({ ...o, total: o.organic + o.paid }))
            .sort((a, b) => b.organic - a.organic);
          // [2026-10-12] 결과 수는 GA4 가 모른다. 상품 스냅샷(상품명·태그·분류)으로 대신 세봤더니 틀렸다 —
          //   'lee bae' 가 스냅샷엔 0종인데 몰 검색은 6종을 돌려준다(cafe24 가 더 넓게 인덱싱한다).
          //   그래서 진짜 검색 결과 페이지를 직접 받아 센다. 워커 서브요청 한도(50) 때문에 상위 N개만,
          //   KV 에 하루 캐시한다. check=0 이면 건너뛴다.
          const nCheck = Math.min(Number(q.get("check") ?? 24), 24);
          if (nCheck > 0) {
            const day = new Date().toISOString().slice(0, 10);
            const head = list.slice(0, nCheck);
            await Promise.all(head.map(async (o) => {
              const ck = `srch:${day}:${o.term}`;
              try {
                const hit = await env.CAFE24_TOKEN_KV.get(ck);
                if (hit != null) { const [a, b] = String(hit).split("|"); o.results = Number(a); o.pages = Number(b || 1); return; }
                const r = await fetch(`https://www.printbakery.com/product/search.html?keyword=${encodeURIComponent(o.term)}`,
                  { headers: { "User-Agent": "Mozilla/5.0 (compatible; pbg-dashboard/1.0)" } });
                if (!r.ok) { o.results = null; return; }
                const html = await r.text();
                const set = new Set((html.match(/product_no=(\d+)/g) || []).map((m) => m.slice(11)));
                // 한 페이지에 20종까지만 나온다(실측). 페이지가 더 있으면 그 수로 하한을 잡는다.
                const pages = Math.max(1, ...(html.match(/page=(\d+)/g) || []).map((m) => Number(m.slice(5)) || 1));
                o.results = set.size; o.pages = pages;
                await env.CAFE24_TOKEN_KV.put(ck, set.size + "|" + pages, { expirationTtl: 86400 });
              } catch (e) { o.results = null; }
            }));
          }
          return json({ from: ranges.after.start, to: ranges.after.end, count: list.length, checked: nCheck,
            note: "organic = 광고 외 유입 세션. results = 실제 몰 검색 결과 상품 수(상위 " + nCheck + "개만, 하루 캐시).",
            terms: list }, 200);
        } catch (e) {
          return json({ error: String(e && e.message || e) }, 200);
        }
      }

      if (q.get("tab") === "funnelprobe") {
        const names = (q.get("steps") || "view_search_results,view_item,add_to_cart,purchase")
          .split(",").map((x) => x.trim()).filter(Boolean);
        // 첫 단계에 유입 조건을 AND 로 걸면 퍼널 전체가 그 조건으로 좁혀진다.
        // funnelBreakdown 은 차원 하나만 쓸 수 있어서, 광고 제외 × 신규/재방문 같은
        // 교차를 보려면 한 축을 이렇게 필터로 고정해야 한다.
        //   &notsrc=paid,cpc,brandmessage   해당 소스/매체를 제외
        const notsrc = (q.get("notsrc") || "").split(",").map((x) => x.trim()).filter(Boolean);
        const stepFilter = (n, first) => {
          const ev = { funnelEventFilter: { eventName: n } };
          if (!first || !notsrc.length) return ev;
          return { andGroup: { expressions: [ev, ...notsrc.map((v) => ({
            notExpression: { funnelFieldFilter: { fieldName: "sessionSourceMedium",
              stringFilter: { matchType: "CONTAINS", value: v, caseSensitive: false } } } })) ] } };
        };
        const body = {
          dateRanges: [{ startDate: ranges.after.start, endDate: ranges.after.end }],
          funnel: { steps: names.map((n, i) => ({ name: n, filterExpression: stepFilter(n, i === 0) })) },
          funnelVisualizationType: "STANDARD_FUNNEL"
        };
        // 같은 퍼널을 차원별로 쪼갠다. 유입 경로별 전환 차이를 보려면 이게 필요하다.
        //   &by=sessionSourceMedium  ·  &by=deviceCategory  ·  &by=newVsReturning
        const by = q.get("by");
        if (by) body.funnelBreakdown = { breakdownDimension: { name: by }, limit: Number(q.get("bylimit") || 12) };
        const r = await fetch(
          `https://analyticsdata.googleapis.com/v1alpha/properties/${propertyId}:runFunnelReport`,
          { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(body) }
        );
        const j = await r.json();
        if (j.error) return json({ error: "GA4 퍼널: " + j.error.message }, 200);
        const rows = (j.funnelTable && j.funnelTable.rows) || [];
        const out = rows.map((x) => ({
          step: (x.dimensionValues || []).map((v) => v.value),
          users: Number(((x.metricValues || [])[0] || {}).value || 0),
          rate: Number(((x.metricValues || [])[1] || {}).value || 0)
        }));
        return json({ steps: names, by: by || null, rows: out }, 200);
      }

      // [2026-09-28] cate_no → 카테고리명 지도. GA4 itemCategory 가 카테고리 번호로
      // 들어오는데 이름이 없어 작가관별 성과를 읽을 수 없었다. 스토어프론트 API 는
      // client-id 만으로 카테고리를 내주므로 관리자 스코프가 필요 없다.
      // 쿠폰 원장 — 카페24 관리자 쿠폰 API. 진단용으로 먼저 열어 본다(되면 KPI 시트 '7. 쿠폰' 에 붙인다).
      if (q.get("tab") === "couponlist") {
        const tok = await getCafe24AccessToken(env);
        if (!tok) return json({ error: "cafe24 인증 실패" }, 200);
        const mallId = env.CAFE24_MALL_ID;
        const path = q.get("path") || "coupons?limit=10&shop_no=1";
        if (q.get("front") === "1") {   // 관리자 403 이면 스토어프론트부터 본다 (CLAUDE.md 4번)
          const r2 = await fetch(`https://${mallId}.cafe24api.com/api/v2/${path}`, { headers: { "X-Cafe24-Client-Id": env.CAFE24_ADMIN_CLIENT_ID } });
          return json({ front: true, status: r2.status, body: (await r2.text()).slice(0, 500) });
        }
        try {
          const j2 = await cafe24Get(mallId, tok, path, false, env, false);
          const key = Object.keys(j2)[0];
          const arr = Array.isArray(j2[key]) ? j2[key] : [];
          return json({ ok: true, path, key, n: arr.length, fields: arr[0] ? Object.keys(arr[0]) : [], sample: arr.slice(0, 2) });
        } catch (e) {
          return json({ error: String(e.message || e), path }, 200);
        }
      }
      if (q.get("tab") === "catnames") {
        const kv0 = env.CAFE24_TOKEN_KV;
        const CKEY = "catnames:v1";
        if (kv0 && q.get("nocache") !== "1") {
          try {
            const c = await kv0.get(CKEY);
            if (c) return json({ cached: true, names: JSON.parse(c) }, 200);
          } catch (e) {}
        }
        const cid = env.CAFE24_ADMIN_CLIENT_ID;
        if (!cid) return json({ error: "CAFE24_ADMIN_CLIENT_ID 없음" }, 200);
        const names = {};
        let offset = 0;
        for (let i = 0; i < 12; i++) {
          const r = await fetch(
            `https://${env.CAFE24_MALL_ID}.cafe24api.com/api/v2/categories?limit=100&offset=${offset}`,
            { headers: { "X-Cafe24-Client-Id": cid, "Content-Type": "application/json" } }
          );
          if (!r.ok) {
            return json({ error: `카테고리 조회 ${r.status}`, body: (await r.text()).slice(0, 200), names }, 200);
          }
          const j = await r.json();
          const arr = j.categories || [];
          for (const c of arr) {
            const full = c.full_category_name && (c.full_category_name["1"] || "");
            names[String(c.category_no)] = { name: c.category_name || "", top: full || "" };
          }
          if (arr.length < 100) break;
          offset += 100;
        }
        if (kv0) { try { await kv0.put(CKEY, JSON.stringify(names), { expirationTtl: 86400 }); } catch (e) {} }
        return json({ cached: false, count: Object.keys(names).length, names }, 200);
      }

      // [2026-09-28] 구매까지 간 사람을 '어떻게 왔는가' 로 나눠 보는 퍼널.
      // runReport 로는 못 한다 — 이벤트 스코프라 "검색도 하고 구매도 한 사람" 의 교집합이
      // 안 나온다. runFunnelReport 는 단계별로 남은 사용자를 세므로 귀속 없이 전환을 잰다.
      //   search  : 검색 → 상품조회 → 담기 → 구매
      //   browse  : 상품조회 → 담기 → 구매 (검색 단계 없음)
      //   bySource: 검색 퍼널을 유입 경로별로 분해 (광고 랜딩 허수를 가려내기 위함)
      if (q.get("tab") === "buyerpath") {
        const runF = async (steps, by) => {
          const body = {
            dateRanges: [{ startDate: ranges.after.start, endDate: ranges.after.end }],
            funnel: { steps: steps.map((n) => ({ name: n,
              filterExpression: { funnelEventFilter: { eventName: n } } })) },
            funnelVisualizationType: "STANDARD_FUNNEL"
          };
          if (by) body.funnelBreakdown = { breakdownDimension: { name: by }, limit: 15 };
          const r = await fetch(
            `https://analyticsdata.googleapis.com/v1alpha/properties/${propertyId}:runFunnelReport`,
            { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify(body) });
          const j = await r.json();
          if (j.error) throw new Error(j.error.message);
          return ((j.funnelTable && j.funnelTable.rows) || []).map((x) => ({
            d: (x.dimensionValues || []).map((v) => v.value),
            users: Number(((x.metricValues || [])[0] || {}).value || 0)
          }));
        };
        try {
          const S = ["view_search_results", "view_item", "add_to_cart", "purchase"];
          const B = ["view_item", "add_to_cart", "purchase"];
          const [search, browse, bySrc] = await Promise.all([runF(S), runF(B), runF(S, "sessionSourceMedium")]);
          const flat = (rows) => rows.map((r) => ({ step: r.d[0], users: r.users }));
          const grp = {};
          for (const r of bySrc) {
            const step = r.d[0], src = r.d[1];
            if (src === "RESERVED_TOTAL") continue;
            (grp[src] || (grp[src] = {}))[step] = r.users;
          }
          return jsonCached({ period: `${ranges.after.start} ~ ${ranges.after.end}`,
            search: flat(search), browse: flat(browse), bySource: grp }, 200);
        } catch (e) {
          return json({ error: "구매 경로 퍼널 실패: " + String(e && e.message || e) }, 200);
        }
      }

      // [2026-09-28] 코호트 — 월별 신규 방문자가 이후 달에 돌아오는 비율.
      // 아트는 재구매 주기가 길어 월간 매출만으로는 안 보이는 잔존이 있다.
      //   ?tab=cohort&from=2026-05-01&months=5&metric=cohortActiveUsers
      if (q.get("tab") === "cohort") {
        const from = q.get("from") || "2026-05-01";
        const months = Math.min(Number(q.get("months") || 5), 12);
        const metric = q.get("metric") || "cohortActiveUsers";
        const cohorts = [];
        for (let i = 0; i < months; i++) {
          const d = new Date(from + "T00:00:00Z");
          d.setUTCMonth(d.getUTCMonth() + i);
          const s0 = d.toISOString().slice(0, 10);
          const e0 = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
          cohorts.push({ name: s0.slice(0, 7), dimension: "firstSessionDate", dateRange: { startDate: s0, endDate: e0 } });
        }
        try {
          const rows = await runReport(propertyId, token, {
            cohortSpec: { cohorts, cohortsRange: { granularity: "MONTHLY", startOffset: 0, endOffset: months - 1 } },
            dimensions: [{ name: "cohort" }, { name: "cohortNthMonth" }],
            metrics: [{ name: metric }],
            limit: 500
          });
          const out = {};
          for (const r of rows) {
            const c = r.dimensionValues[0].value, nth = r.dimensionValues[1].value;
            (out[c] || (out[c] = {}))[nth] = Number(r.metricValues[0].value);
          }
          return json({ metric, months, cohorts: out }, 200);
        } catch (e) {
          return json({ error: "코호트 실패: " + String(e && e.message || e) }, 200);
        }
      }

      // [2026-09-28] 주문 상태별 집계. cafe24 관리자 '주별 매출내역' 과 대시보드 숫자가
      // 달라 원인을 가리기 위한 진단. 관리자 표는 '결제완료 주문' 만 세고, 취소와 환불도
      // 다른 개념이다(결제 전 취소는 환불이 발생하지 않는다).
      if (q.get("tab") === "orderstatus") {
        const tok = await getCafe24AccessToken(env);
        if (!tok) return json({ error: "cafe24 인증 실패" }, 200);
        const mallId = env.CAFE24_MALL_ID;
        const from = q.get("from") || ranges.after.start, to = q.get("to") || ranges.after.end;
        let orders = [];
        for (let p = 0; p < ORDER_MAX_PAGES; p++) {
          const j = await cafe24Get(mallId, tok,
            `orders?start_date=${from}&end_date=${to}&date_type=order_date&limit=${ORDER_PAGE}&offset=${p * ORDER_PAGE}&embed=items`,
            false, env);
          const arr = j.orders || [];
          orders = orders.concat(arr);
          if (arr.length < ORDER_PAGE) break;
        }
        const byStatus = {}, byPayStatus = {};
        let total = 0;
        for (const o of orders) {
          total++;
          const pay = o.paid === "T" ? "결제완료" : (o.paid === "F" ? "미결제" : String(o.paid));
          const pb = byPayStatus[pay] || (byPayStatus[pay] = { orders: 0, amount: 0 });
          pb.orders++;
          for (const it of o.items || []) {
            const st = it.order_status || "(없음)";
            const amt = Number(it.product_price || 0) * Number(it.quantity || 0);
            const b = byStatus[st] || (byStatus[st] = { qty: 0, amount: 0, lines: 0 });
            b.qty += Number(it.quantity || 0); b.amount += amt; b.lines++;
            pb.amount += amt;
          }
        }
        return json({ from, to, orderCount: total, byStatus, byPayStatus }, 200);
      }

      // [2026-10-02] 주문 건별·상품별 원장. 집계가 아니라 raw 행을 그대로 내보낸다.
      // revenue-daily.json 은 일별 합계라 주문번호가 없어서 이 경로가 따로 필요하다.
      //
      // 금액 계산 (cafe24 함정 주의):
      //   supply_price 는 '매입원가' 다. 부가세 제외 매출액(공급가액)이 아니다.
      //   실측: 판매 129,000 / supply_price 121,040 / 129,000÷1.1 = 117,272 → 서로 다른 값.
      //   그래서 공급가액은 tax_rate 로 직접 역산한다. 면세(rate 0)면 전액이 공급가액.
      //   판매가·할인은 '라인 합계' 다 (단가 아님) — 수량을 또 곱하면 안 된다.
      //   배송비는 주문 단위라 품목 행에 못 붙인다 → 합계가 GMV 와 다르다.
      // [2026-10-12] 위탁 정산 보조: 상품번호 → 브랜드, 공급사코드 → 카페24 공급사별 배송비 정책.
      //   · 주문 품목(orderitems)엔 공급사만 있고 브랜드가 없다 → 상품 목록 한 번(최대 100개) + 브랜드 목록(KV 하루).
      //   · 배송비: 몰 설정이 '공급사별 배송비 사용'(supplier_shipping_fee=T)이라 정책은 공급사마다 있다.
      //     shipping/suppliers/{공급사 계정ID} — 공급사코드가 아니라 계정ID 를 받는다(코드로 부르면 404 "supplier account cannot be found").
      //     계정ID 는 suppliers/users?supplier_code= 로 얻는다. 공급사당 2번 호출이라 KV 에 하루 둔다(서브요청 한도 50).
      //   · 상품 목록의 shipping_fee_by_product 는 우리 몰에선 전부 F(개별 배송비 안 씀)였다 → 상품 단위는 보지 않는다.
      // [2026-10-20] 카페24 상품의 옵션 전체(variants) — 품목코드 맵핑에서 '한 상품의 옵션을 모두' 보여 주기 위해. 상품당 하루 KV.
      if (q.get("tab") === "variants") {
        const tok = await getCafe24AccessToken(env);
        if (!tok) return json({ error: "cafe24 인증 실패" }, 200);
        const mallId = env.CAFE24_MALL_ID, kv = env.CAFE24_TOKEN_KV;
        const nos = String(q.get("products") || "").split(",").map((x) => x.trim()).filter((x) => /^\d{1,9}$/.test(x)).slice(0, 30);
        const variants = {};
        for (const no of nos) {
          const ck = "cafe24:variants:v1:" + no;
          let v = null;
          try { const raw = kv ? await kv.get(ck) : null; v = raw ? JSON.parse(raw) : null; } catch (e) { }
          if (!v) {
            try {
              const j = await cafe24Get(mallId, tok, `products/${no}/variants`, false, env);
              v = (j.variants || []).map((x) => ({ variant_code: x.variant_code || "", opt: (x.options || []).map((o) => `${o.name}=${o.value}`).join(", "),
                custom: x.custom_variant_code || "", display: x.display || "", selling: x.selling || "" }));
              try { if (kv) await kv.put(ck, JSON.stringify(v), { expirationTtl: 86400 }); } catch (e) { }
            } catch (e) { v = { error: String(e.message || e).slice(0, 120) }; }
          }
          variants[no] = v;
        }
        return json({ variants });
      }
      if (q.get("tab") === "settleprod") {
        const tok = await getCafe24AccessToken(env);
        if (!tok) return json({ error: "cafe24 인증 실패" }, 200);
        const mallId = env.CAFE24_MALL_ID, kv = env.CAFE24_TOKEN_KV;
        const nos = String(q.get("products") || "").split(",").map((x) => x.trim()).filter((x) => /^\d{1,9}$/.test(x)).slice(0, 100);
        const sups = String(q.get("suppliers") || "").split(",").map((x) => x.trim()).filter((x) => /^S[0-9A-Z]{7}$/.test(x)).slice(0, 15);
        const kvGet = async (k) => { try { const v = kv ? await kv.get(k) : null; return v ? JSON.parse(v) : null; } catch (e) { return null; } };
        const kvPut = async (k, v) => { try { if (kv) await kv.put(k, JSON.stringify(v), { expirationTtl: 86400 }); } catch (e) { } };
        const products = {};
        if (nos.length) {
          let brands = await kvGet("cafe24:brands:v1");
          if (!brands) {
            brands = {};
            for (let p = 0; p < 20; p++) {
              const b = await cafe24Get(mallId, tok, `brands?limit=100&offset=${p * 100}`, false, env);
              const arr = b.brands || [];
              for (const x of arr) brands[x.brand_code] = x.brand_name;
              if (arr.length < 100) break;
            }
            await kvPut("cafe24:brands:v1", brands);
          }
          const j = await cafe24Get(mallId, tok, `products?product_no=${nos.join(",")}&limit=100`, false, env);
          // custom_product_code(자체상품코드) = 이카운트 품목코드인지 확인용(전표 입력 대조·판매입력 양식)
          for (const p of j.products || []) products[p.product_no] = { brand: brands[p.brand_code] || "", brand_code: p.brand_code || "",
            custom_code: p.custom_product_code || "", product_code: p.product_code || "", price: p.price != null ? Number(p.price) : null,
            retail_price: p.retail_price != null ? Number(p.retail_price) : null, tax_type: p.tax_type || "" };
        }
        const shipping = {};
        for (const code of sups) {
          const ck = "cafe24:supship:v1:" + code;
          let v = await kvGet(ck);
          if (!v) {
            try {
              const u = await cafe24Get(mallId, tok, `suppliers/users?supplier_code=${code}`, false, env);
              const uid = (u.users || [])[0]?.user_id;
              if (!uid) v = { none: "공급사 계정 없음" };
              else {
                const sp = (await cafe24Get(mallId, tok, `shipping/suppliers/${encodeURIComponent(uid)}`, false, env)).supplier || {};
                v = { type: sp.shipping_fee_type || "", fee: sp.shipping_fee != null ? Number(sp.shipping_fee) : null,
                      free_over: sp.free_shipping_price != null ? Number(sp.free_shipping_price) : null,
                      rates: sp.shipping_rates || null, by_quantity: sp.shipping_fee_by_quantity || null };
              }
            } catch (e) { v = { error: String(e.message || e).slice(0, 120) }; }
            if (!v.error) await kvPut(ck, v);
          }
          shipping[code] = v;
        }
        return json({ products, shipping });
      }
      // [2026-10-15] 주문 처리 첫 화면 — 아직 배송이 끝나지 않은 주문(카페24 배송 상태 F 배송전 · M 배송중), 최근 N일.
      //   주문 단위 + 품목 줄. 수령인 정보는 넣지 않는다(이 화면엔 필요 없음) → 5분 캐시(jsonCached) 가능.
      //   실측(2026-10-15): cafe24 가 shipping_status= 필터를 무시하고 전부 준다(60일 2,964건·25초) → 여기서 거른다.
      // 웹훅으로 들어온 최근 상태만(가볍고 캐시 없음) — 화면이 1분마다 받아 목록 위에 덮는다
      if (q.get("tab") === "openhooks") {
        const kv0 = env.CAFE24_TOKEN_KV;
        if (!kv0) return json({ recent: [], states: {} });
        const recent = JSON.parse((await kv0.get("ecopen:recent")) || "[]");
        const ids = [...new Set(recent.map((x) => x.id))].slice(0, 200), states = {};
        (await Promise.all(ids.map((id) => kv0.get("ecopen:o:" + id)))).forEach((v, i) => { if (v) states[ids[i]] = JSON.parse(v); });
        return json({ recent, states, now: new Date(Date.now() + 9 * 3600 * 1e3).toISOString().slice(0, 19).replace("T", " ") });
      }
      if (q.get("tab") === "openorders") {
        const tok = await getCafe24AccessToken(env);
        if (!tok) return json({ error: "cafe24 인증 실패" }, 200);
        const mallId = env.CAFE24_MALL_ID;
        const days = Math.min(90, Math.max(7, Number(q.get("days")) || 60));
        const to = new Date(Date.now() + 9 * 3600 * 1e3).toISOString().slice(0, 10);
        const from = new Date(Date.now() + 9 * 3600 * 1e3 - days * 86400 * 1e3).toISOString().slice(0, 10);
        const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
        const arrOf = (v) => Array.isArray(v) ? v : (v ? [v] : []);
        let orders = [], truncated = false;
        for (let p = 0; p < ORDER_MAX_PAGES * 2; p++) {
          const j = await cafe24Get(mallId, tok,
            `orders?start_date=${from}&end_date=${to}&date_type=order_date&limit=${ORDER_PAGE}&offset=${p * ORDER_PAGE}&embed=items`, false, env);
          const arr = j.orders || [];
          orders = orders.concat(arr);
          if (arr.length < ORDER_PAGE) break;
          if (p === ORDER_MAX_PAGES * 2 - 1) truncated = true;
        }
        // 웹훅으로 들어온 최신 상태(ecopen:o:*)를 덮어쓴다 — 전체 조회(최대 5분 캐시)보다 새것
        const kv0 = env.CAFE24_TOKEN_KV;
        const hookRecent = kv0 ? JSON.parse((await kv0.get("ecopen:recent")) || "[]") : [];
        const hookIds = [...new Set(hookRecent.map((x) => x.id))];
        const hooked = {};
        if (kv0 && hookIds.length) (await Promise.all(hookIds.map((id) => kv0.get("ecopen:o:" + id)))).forEach((v, i) => { if (v) hooked[hookIds[i]] = JSON.parse(v); });
        const out = [], lines = [];
        for (const o of orders) {
          const h = hooked[o.order_id];
          if (h && h.ship_status) o.shipping_status = h.ship_status;
          if (h && h.deleted) continue;
          if (o.paid !== "T" || o.canceled === "T" || !["F", "M"].includes(o.shipping_status)) continue;
          const its = (o.items || []).filter((it) => !isExcludedPaywin(it.product_name));
          if (!its.length) continue;
          out.push({ order_id: o.order_id, order_date: String(o.order_date || "").slice(0, 10), ship_status: o.shipping_status || "",
            payment_amount: n(o.payment_amount), naver_point: n(o.naver_point), hook_at: (hooked[o.order_id] || {}).at || "" });
          for (const it of its) lines.push({ order_id: o.order_id, product_no: it.product_no, product_name: it.product_name || "", option_value: it.option_value || "",
            qty: n(it.quantity), status: it.order_status || "", canceled: isCanceledStatus(it.order_status) ? "Y" : "N",
            supplier_name: it.supplier_name || "", shipped: String(it.shipped_date || "").slice(0, 10), variant_code: it.variant_code || "" });
        }
        return jsonCached({ from, to, orders: out, lines, truncated, hookRecentAt: hookRecent[0] ? hookRecent[0].at : "", fetchedAt: new Date(Date.now() + 9 * 3600 * 1e3).toISOString().slice(0, 16).replace("T", " ") }, 200);
      }
      if (q.get("tab") === "orderitems") {
        const tok = await getCafe24AccessToken(env);
        if (!tok) return json({ error: "cafe24 인증 실패" }, 200);
        const mallId = env.CAFE24_MALL_ID;
        const from = q.get("from") || ranges.after.start, to = q.get("to") || ranges.after.end;
        // [2026-10-14] daily=1 — 데일리 전표 생성용. 결제수단·수령인까지 준다(이카운트 판매입력 양식에 들어간다).
        //   수령인 정보가 있으니 이 응답은 캐시하지 않는다(orderitems 는 json() 이라 원래 캐시 없음).
        const daily = q.get("daily") === "1";
        let orders = [], truncated = false;
        // [2026-10-14] ids= 주문번호 목록(쉼표)으로 받기 — 품목코드 맵핑 학습이 달 전체를 받던 것을 파일에 있는 주문만 받게(리포트 M7). 100개씩.
        const ids = String(q.get("ids") || "").split(",").map((x) => x.trim()).filter((x) => /^\d{8}-\d{7}$/.test(x)).slice(0, 2000);
        if (ids.length) {
          for (let i = 0; i < ids.length; i += 100) {
            const j = await cafe24Get(mallId, tok, `orders?order_id=${ids.slice(i, i + 100).join(",")}&limit=100&embed=${daily ? "items,receivers,buyer" : "items"}`, false, env);
            orders = orders.concat(j.orders || []);
          }
        } else
        for (let p = 0; p < ORDER_MAX_PAGES; p++) {
          const j = await cafe24Get(mallId, tok,
            `orders?start_date=${from}&end_date=${to}&date_type=order_date&limit=${ORDER_PAGE}&offset=${p * ORDER_PAGE}&embed=${daily ? "items,receivers,buyer" : "items"}`,
            false, env);
          const arr = j.orders || [];
          orders = orders.concat(arr);
          if (arr.length < ORDER_PAGE) break;
          if (p === ORDER_MAX_PAGES - 1) truncated = true;
        }
        const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
        const arrOf = (v) => Array.isArray(v) ? v : (v ? [v] : []);
        const dailyOrderFields = (o) => {
          const rc = (o.receivers || [])[0] || {}, by = o.buyer || {};
          return {
            buyer_phone: by.cellphone || by.phone || "",
            ship_fee: n((o.actual_order_amount || {}).shipping_fee),
            pay_name: o.payment_method_name || "",
            // [2026-10-15] 주문 처리 첫 화면 — 배송 상태(F 배송전 · M 배송중 · T 배송완료)·주문일
            ship_status: o.shipping_status || "",
            order_date: String(o.order_date || "").slice(0, 10),
            time: String(o.order_date || "").slice(11, 16),
            naver_point: n(o.naver_point),
            easypay: o.easypay_name || "",
            pg: arrOf(o.payment_gateway_names).join(","),
            pay_methods: arrOf(o.payment_method),
            market: o.market_id || "",
            buyer: o.billing_name || by.name || "",
            rc_name: rc.name || "",
            rc_phone: rc.cellphone || rc.phone || "",
            rc_addr: rc.address_full || [rc.address1, rc.address2].filter(Boolean).join(" "),
            rc_msg: rc.shipping_message || ""
          };
        };
        const lines = [];
        const tot = { sale: 0, disc: 0, net: 0, supply: 0, vat: 0, qty: 0, cost: 0 };
        for (const o of orders) {
          for (const it of o.items || []) {
            const qty = n(it.quantity);
            const sale = (n(it.product_price) + n(it.option_price)) * qty;
            const disc = n(it.additional_discount_price) + n(it.coupon_discount_price)
                       + n(it.app_item_discount_amount) + n(it.market_discount_amount);
            const net = sale - disc;
            const rate = n(it.tax_rate);
            const supply = rate > 0 ? Math.round(net / (1 + rate / 100)) : net;
            const vat = net - supply;
            const row = {
              date: String(o.order_date || "").slice(0, 10),
              order_id: o.order_id,
              product_no: it.product_no,
              product_name: it.product_name || it.product_name_default || "",
              supplier_id: it.supplier_id || it.supplier_code || "",
              supplier_name: it.supplier_name || "",
              qty, sale, disc, supply, vat, net,
              // [2026-10-12] cost = cafe24 supply_price × 수량.
              //   ⚠ 원가로 쓰면 안 된다. 실측(2026-08·2025-08 전수): 등록된 행만 봐도
              //      cost/net 이 99.8% · 105.6% 로 나온다 — 판매가와 거의 같은 값이다.
              //      절반 가까운 행은 0 이고, 마진 계산에 쓰면 전부 틀린 답이 나온다.
              //   남겨둔 이유: 값 자체를 눈으로 확인할 일이 또 생길 수 있어서. 그 외 용도 없음.
              cost: n(it.supply_price) * qty,
              tax_rate: rate,
              tax_type: it.product_tax_type || "",
              status: it.order_status || "",
              paid: o.paid === "T" ? "Y" : "N",
              canceled: isCanceledStatus(it.order_status) ? "Y" : "N",
              paywin: isExcludedPaywin(it.product_name) ? "Y" : "N",
              // [2026-10-13] 위탁 정산 대조용 날짜. canceled 는 '지금' 상태라 지난달을 볼 때 틀린다
              // (실측: 8월 주문을 10월에 취소신청한 건이 8월 대조에서 취소로 빠졌다).
              //   shipped     출고일 — 이카운트 판매 전표는 출고 때 만든다
              //   cancel_req  취소·반품 신청일 (신청만 된 건 아직 판매다)
              //   cancel_done 취소·반품이 끝난 날 = 환불일 > 반품완료일 > 취소완료일 (반품 전표는 환불 때 들어온 것으로 보였다)
              shipped: String(it.shipped_date || "").slice(0, 10),
              cancel_req: String(it.cancel_request_date || it.return_request_date || "").slice(0, 10),
              cancel_done: String(it.refund_date || it.return_confirmed_date || it.cancel_date || "").slice(0, 10),
              // [2026-10-14] 전표 입력 대조 — 이카운트 품목코드는 옵션마다 다르다(카페24 상품 1개 ↔ 이카운트 품목 여러 개).
              //   variant_code = 카페24 옵션별 품목코드(P000…A 형태), option_value = 옵션 표기
              variant_code: it.variant_code || "",
              option_value: it.option_value || it.option_value_default || ""
            };
            lines.push(row);
            tot.qty += qty; tot.sale += sale; tot.disc += disc;
            tot.net += net; tot.supply += supply; tot.vat += vat; tot.cost += row.cost;
          }
        }
        lines.sort((a, b) => a.date.localeCompare(b.date) || String(a.order_id).localeCompare(String(b.order_id)));
        // 주문 단위 '실거래' 집계. 품목 합계로는 배송비·포인트·쿠폰이 빠져 실결제액과 안 맞는다.
        // actual_order_amount 가 cafe24 가 실제로 받은 돈의 내역이다.
        const itemNet = {}, itemSale = {}, itemCnt = {};
        for (const l of lines) {
          itemNet[l.order_id] = (itemNet[l.order_id] || 0) + l.net;
          itemSale[l.order_id] = (itemSale[l.order_id] || 0) + l.sale;
          itemCnt[l.order_id] = (itemCnt[l.order_id] || 0) + 1;
        }
        const ords = orders.map((o) => {
          const a = o.actual_order_amount || {};
          return {
            date: String(o.order_date || "").slice(0, 10),
            order_id: o.order_id,
            lines: itemCnt[o.order_id] || 0,
            item_sale: Math.round(itemSale[o.order_id] || 0),
            item_net: Math.round(itemNet[o.order_id] || 0),
            order_price: n(a.order_price_amount),
            shipping_fee: n(a.shipping_fee),
            shipping_discount: n(a.shipping_fee_discount_amount) + n(a.coupon_shipping_fee_amount),
            points_spent: n(a.points_spent_amount) + n(a.credits_spent_amount),
            coupon_discount: n(a.coupon_discount_price),
            etc_discount: n(a.membership_discount_amount) + n(a.set_product_discount_amount)
                        + n(a.app_discount_amount) + n(a.market_other_discount_amount),
            payment_amount: n(o.payment_amount),
            due: n(a.total_amount_due),
            paid: o.paid === "T" ? "Y" : "N",
            canceled: o.canceled === "T" ? "Y" : "N",
            method: o.payment_method_name || "",
            ...(daily ? dailyOrderFields(o) : {})
          };
        }).sort((x, y) => x.date.localeCompare(y.date) || String(x.order_id).localeCompare(String(y.order_id)));
        // level=order 는 아래 주문단위 분기로 보낸다 — 여기서 먼저 잡으면 그 분기에 영영 못 간다.
        if (q.get("format") === "csv" && q.get("level") !== "order") {
          const rows = [["주문일", "주문번호", "상품번호", "상품명", "공급사코드", "공급사명", "수량", "판매가", "할인금액", "공급가액", "부가세", "매출합계", "세율", "주문상태", "결제", "취소", "개인결제창"]];
          for (const r of lines) rows.push([r.date, r.order_id, r.product_no, r.product_name,
            r.supplier_id, r.supplier_name, r.qty,
            Math.round(r.sale), Math.round(r.disc), r.supply, r.vat, Math.round(r.net),
            r.tax_rate, r.status, r.paid, r.canceled, r.paywin]);
          return csv(rows, 200, `주문상품_${from}_${to}.csv`);
        }
        if (q.get("level") === "order" && q.get("format") === "csv") {
          const rows = [["주문일", "주문번호", "품목수", "상품정가", "상품매출", "배송비", "배송비할인",
                         "포인트·예치금", "쿠폰할인", "기타할인", "실결제금액", "미결제액", "결제수단", "결제", "취소"]];
          for (const r of ords) rows.push([r.date, r.order_id, r.lines, Math.round(r.order_price),
            r.item_net, Math.round(r.shipping_fee), Math.round(r.shipping_discount),
            Math.round(r.points_spent), Math.round(r.coupon_discount), Math.round(r.etc_discount),
            Math.round(r.payment_amount), Math.round(r.due), r.method, r.paid, r.canceled]);
          return csv(rows, 200, `주문별_${from}_${to}.csv`);
        }
        const otot = {};
        for (const k of ["item_sale", "item_net", "order_price", "shipping_fee", "shipping_discount",
                         "points_spent", "coupon_discount", "etc_discount", "payment_amount", "due"]) {
          otot[k] = ords.reduce((x, o) => x + o[k], 0);
        }
        return json({ from, to, orderCount: orders.length, lineCount: lines.length, truncated,
                      totals: tot, orderTotals: otot,
                      lines: q.get("full") === "1" ? lines : lines.slice(0, 20),
                      orders: q.get("full") === "1" ? ords : ords.slice(0, 20) }, 200);
      }

      // [2026-09-28] 환불 최종값 동기화.
      // slackbot 이 만드는 revenue-daily.json 은 '그날 발생한 환불' 만 적는다. 주문 이후에
      // 환불되면 그 주문 날짜에 반영되지 않아 과거 순매출이 계속 과대 계상된다.
      // 여기서는 cafe24 의 '현재 상태' 를 주문일 기준으로 다시 집계해 최종값을 돌려준다.
      if (q.get("tab") === "refundsync") {
        const tok = await getCafe24AccessToken(env);
        if (!tok) return json({ error: "cafe24 인증 실패" }, 200);
        const mallId = env.CAFE24_MALL_ID;
        const from = q.get("from") || ranges.after.start, to = q.get("to") || ranges.after.end;
        // cafe24 refunds API 는 주문일(order_date)과 환불일(refund_date)을 둘 다 준다.
        // 환불일 기준으로 조회해서 주문일에 되돌려 붙이면, 나중에 난 환불도 원래 매출일에서
        // 차감된다. slackbot 이 만드는 revenue-daily.json 은 그날 발생분만 적어 이게 안 된다.
        // 환불은 주문 뒤 언제든 난다. 조회 기간 주문의 '최종' 환불을 보려면 환불일 범위를
        // 주문 시작일부터 오늘까지로 넓게 잡고, 주문일로 걸러내야 한다.
        const today = new Date(Date.now() + 9 * 3600 * 1e3).toISOString().slice(0, 10);
        const rFrom = q.get("refundfrom") || from, rTo = q.get("refundto") || today;
        let refunds = [];
        for (let p = 0; p < 20; p++) {
          const j = await cafe24Get(mallId, tok,
            `refunds?start_date=${rFrom}&end_date=${rTo}&limit=100&offset=${p * 100}`, false, env);
          const arr = j.refunds || [];
          refunds = refunds.concat(arr);
          if (arr.length < 100) break;
        }
        // 주문일이 조회 구간 안인 것만 남긴다
        refunds = refunds.filter((r) => {
          const od = String(r.order_date || "").slice(0, 10);
          return od >= from && od <= to;
        });
        const num = (v) => Number(String(v == null ? 0 : v).replace(/,/g, "")) || 0;
        const amountOf = (r) => num(r.refund_amount) || num(r.actual_refund_amount) ||
                                num(r.total_refund_amount) || num(r.refund_price);
        const byOrderDate = {}, byRefundDate = {};
        for (const r of refunds) {
          const od = String(r.order_date || "").slice(0, 10);
          const rd = String(r.refund_date || r.accepted_refund_date || "").slice(0, 10);
          const amt = amountOf(r);
          if (od) { const b = byOrderDate[od] || (byOrderDate[od] = { count: 0, amount: 0 }); b.count++; b.amount += amt; }
          if (rd) { const b = byRefundDate[rd] || (byRefundDate[rd] = { count: 0, amount: 0 }); b.count++; b.amount += amt; }
        }
        const total = refunds.reduce((a, r) => a + amountOf(r), 0);
        return jsonCached({ from, to, refundWindow: `${rFrom} ~ ${rTo}`,
          basis: "주문일이 from~to 인 주문의 환불 최종값 (환불일은 오늘까지 추적)",
          count: refunds.length, total, byOrderDate, byRefundDate }, 200);
      }

      if (q.get("tab") === "activeusers") {
        const au = await buildActiveUsers(propertyId, token, q.get("autoExclLowEngagement") === "1", q.get("excl"));
        return jsonCached(au, 200);
      }
      if (q.get("tab") === "events") {
        const events = await buildEventList(propertyId, token, ranges.after.start, ranges.after.end);
        return jsonCached({ periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`, events }, 200);
      }
      if (q.get("tab") === "cart") {
        const wantCmp = q.get("cmp") === "1";
        try {
          const cur = await buildCartAnalysis(propertyId, token, ranges.after.start, ranges.after.end, q.get("excl"), q.get("autoExclLowEngagement") === "1");
          const prev = wantCmp ? await buildCartAnalysis(propertyId, token, ranges.before.start, ranges.before.end, q.get("excl"), q.get("autoExclLowEngagement") === "1") : null;
          return jsonCached({
            periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`,
            periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`,
            cartAnalysis: cur,
            cartAnalysisBefore: prev
          }, 200);
        } catch (e) {
          return json({ error: "\uC7A5\uBC14\uAD6C\uB2C8 \uBD84\uC11D \uC2E4\uD328: " + String(e && e.message || e) }, 500);
        }
      }
      if (q.get("tab") === "segfunnel") {
        const wantCmp = q.get("cmp") === "1";
        try {
          const cur = await buildSegmentFunnel(propertyId, token, ranges.after.start, ranges.after.end, q.get("excl"), q.get("autoExclLowEngagement") === "1");
          const prev = wantCmp ? await buildSegmentFunnel(propertyId, token, ranges.before.start, ranges.before.end, q.get("excl"), q.get("autoExclLowEngagement") === "1") : null;
          return jsonCached({
            periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`,
            periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`,
            segfunnel: cur,
            segfunnelBefore: prev
          }, 200);
        } catch (e) {
          return json({ error: "\uC138\uADF8\uBA3C\uD2B8 \uD37C\uB110 \uC2E4\uD328: " + String(e && e.message || e) }, 500);
        }
      }
      if (q.get("tab") === "metricscsv") {
        try {
          const d = await buildData(
            propertyId,
            token,
            ranges,
            q.get("excl"),
            q.get("autoExclLowEngagement") === "1"
          );
          const at = /* @__PURE__ */ __name((nm) => (d.funnel || []).find((x) => x.name === nm) || { after: 0 }, "at");
          const kpi = /* @__PURE__ */ __name((lb) => (d.kpis || []).find((k) => k.label === lb), "kpi");
          const order = at("\uACB0\uC81C(\uC8FC\uBB38\uC11C)").after, buy = at("\uAD6C\uB9E4").after, visit = at("\uBC29\uBB38").after;
          const num = /* @__PURE__ */ __name((v) => v == null || !isFinite(v) ? "" : Math.round(v * 100) / 100, "num");
          const rows = [["metric", "value", "label"]];
          rows.push(["orderToBuy", num(order ? buy / order * 100 : null), "\uC8FC\uBB38\uC11C\u2192\uAD6C\uB9E4 \uC804\uD658\uC728(%)"]);
          rows.push(["sessionToBuy", num(visit ? buy / visit * 100 : null), "\uC804\uCCB4 \uAD6C\uB9E4 \uC804\uD658\uC728(%)"]);
          rows.push(["returning", num(kpi("\uC7AC\uBC29\uBB38\uC790 \uBE44\uC728")?.after), "\uC7AC\uBC29\uBB38\uC790 \uBE44\uC728(%)"]);
          rows.push(["cartRate", num(kpi("\uC7A5\uBC14\uAD6C\uB2C8 \uC804\uD658\uC728")?.after), "\uC7A5\uBC14\uAD6C\uB2C8 \uC804\uD658\uC728(%)"]);
          rows.push(["detailRate", num(kpi("\uC0C1\uD488\uC870\uD68C \uC804\uD658\uC728")?.after), "\uC0C1\uD488\uC870\uD68C \uC804\uD658\uC728(%)"]);
          rows.push(["aov", num(kpi("\uAC1D\uB2E8\uAC00")?.after), "\uAC1D\uB2E8\uAC00(\uC6D0)"]);
          rows.push(["sessions", num(visit), "\uC138\uC158(\uBC29\uBB38)"]);
          rows.push(["purchases", num(buy), "\uAD6C\uB9E4 \uAC74\uC218"]);
          rows.push(["period", `${ranges.after.start}~${ranges.after.end}`, "\uC870\uD68C \uAE30\uAC04"]);
          rows.push(["updatedAt", (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace("T", " "), "\uAC31\uC2E0 \uC2DC\uAC01(UTC)"]);
          return csv(rows);
        } catch (e) {
          return csv([["error", String(e && e.message || e)]], 500);
        }
      }
      if (q.get("tab") === "debugpages") {
        try {
          const needle = (q.get("q") || "").toLowerCase();
          const rows = await runReport(propertyId, token, {
            dateRanges: [{ startDate: ranges.after.start, endDate: ranges.after.end }],
            dimensions: [{ name: "pagePath" }],
            metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
            limit: 1e5
          });
          const list = rows.map((r) => ({
            path: r.dimensionValues[0].value,
            views: Number(r.metricValues[0].value),
            sessions: Number(r.metricValues[1].value)
          })).filter((x) => !needle || x.path.toLowerCase().includes(needle)).sort((a, b) => b.views - a.views);
          return json({
            period: `${ranges.after.start} ~ ${ranges.after.end}`,
            filter: needle || "(\uC804\uCCB4)",
            matched: list.length,
            pages: list.slice(0, 100),
            hint: "\uAC00\uC785 \uC644\uB8CC \uD398\uC774\uC9C0\uB294 \uD558\uB8E8 \uC218\uC2ED \uAC74 \uC218\uC900\uC758 \uC870\uD68C\uC218\uB97C \uAC00\uC9C4 /member/ \uD558\uC704 \uACBD\uB85C\uC77C \uAC00\uB2A5\uC131\uC774 \uB192\uC2B5\uB2C8\uB2E4."
          }, 200);
        } catch (e) {
          return json({ error: "\uD398\uC774\uC9C0 \uC9C4\uB2E8 \uC2E4\uD328: " + String(e && e.message || e) }, 500);
        }
      }
      if (q.get("tab") === "debugfilter") {
        try {
          const st = ranges.after.start, en = ranges.after.end;
          const days = daysBetween(st, en);
          const [pairRows, campRows] = await Promise.all([
            runReport(propertyId, token, {
              dateRanges: [{ startDate: st, endDate: en }],
              dimensions: [{ name: "sessionSourceMedium" }, { name: "country" }],
              metrics: [{ name: "sessions" }, { name: "userEngagementDuration" }]
            }),
            runReport(propertyId, token, {
              dateRanges: [{ startDate: st, endDate: en }],
              dimensions: [{ name: "sessionCampaignName" }],
              metrics: [{ name: "sessions" }, { name: "userEngagementDuration" }]
            })
          ]);
          const shape = /* @__PURE__ */ __name((rows, nameOf) => rows.map((r) => {
            const sessions = Number(r.metricValues[0].value);
            const avgSec = sessions ? Number(r.metricValues[1].value) / sessions : 0;
            return { name: nameOf(r), sessions, avgSec: Math.round(avgSec * 10) / 10 };
          }).sort((a, b) => b.sessions - a.sessions), "shape");
          const pairs = shape(pairRows, (r) => `${r.dimensionValues[0].value} || ${r.dimensionValues[1].value}`);
          const camps = shape(campRows, (r) => r.dimensionValues[0].value);
          const thresholds = [2, 5, 10, days * 2, Math.max(5, days * 2)];
          const verdict = /* @__PURE__ */ __name((list) => list.filter((x) => x.avgSec < 5).map((x) => ({
            ...x,
            excludedAt: thresholds.filter((t) => x.sessions >= t)
          })), "verdict");
          return json({
            period: `${st} ~ ${en}`,
            days,
            currentRule: `sessions >= max(5, days*2)=${Math.max(5, days * 2)} AND avgSec < 5`,
            lowEngagementPairs: verdict(pairs).slice(0, 50),
            lowEngagementCampaigns: verdict(camps).slice(0, 50),
            note: "excludedAt = \uADF8 \uD558\uD55C(threshold)\uC744 \uC37C\uC744 \uB54C \uC81C\uC678\uB418\uB294\uC9C0. avgSec >= 5 \uC778 \uD56D\uBAA9\uC740 \uC5B4\uB5A4 \uD558\uD55C\uC5D0\uC11C\uB3C4 \uC81C\uC678\uB418\uC9C0 \uC54A\uC73C\uBBC0\uB85C \uC0DD\uB7B5."
          }, 200);
        } catch (e) {
          return json({ error: "\uD544\uD130 \uC9C4\uB2E8 \uC2E4\uD328: " + String(e && e.message || e) }, 500);
        }
      }
      if (q.get("tab") === "searchterms") {
        const wantCmp = q.get("cmp") === "1";
        try {
          const cur = await buildSearchTerms(propertyId, token, ranges.after.start, ranges.after.end, q.get("excl"), q.get("autoExclLowEngagement") === "1");
          const prev = wantCmp ? await buildSearchTerms(propertyId, token, ranges.before.start, ranges.before.end, q.get("excl"), q.get("autoExclLowEngagement") === "1") : null;
          return jsonCached({
            periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`,
            periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`,
            searchTerms: cur,
            searchTermsBefore: prev
          }, 200);
        } catch (e) {
          return json({ error: "\uAC80\uC0C9\uC5B4 \uB9AC\uD3EC\uD2B8 \uC2E4\uD328: " + String(e && e.message || e) }, 500);
        }
      }
      if (q.get("tab") === "searchtermscsv") {
        try {
          const st = await buildSearchTerms(
            propertyId,
            token,
            ranges.after.start,
            ranges.after.end,
            q.get("excl"),
            q.get("autoExclLowEngagement") === "1",
            Infinity
          );
          const rows = [["\uC21C\uC704", "\uAC80\uC0C9\uC5B4", "\uAC80\uC0C9\uC218", "\uC0AC\uC6A9\uC790\uC218", "\uC810\uC720\uC728(%)"]];
          st.rows.forEach((r, i) => rows.push([
            i + 1,
            r.term,
            r.searches,
            r.users,
            st.totalSearches ? Math.round(r.searches / st.totalSearches * 1e4) / 100 : 0
          ]));
          if (!st.rows.length) rows.push(["", "(\uC774 \uAE30\uAC04\uC5D0 \uC9D1\uACC4\uB41C \uAC80\uC0C9\uC5B4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4)", "", "", ""]);
          return csv(rows, 200, `\uAC80\uC0C9\uC5B4_${ranges.after.start}_${ranges.after.end}.csv`);
        } catch (e) {
          return csv([["error", String(e && e.message || e)]], 500);
        }
      }
      if (q.get("tab") === "utm") {
        const wantCmp = q.get("cmp") === "1";
        try {
          const cur = await buildUtmPerformance(propertyId, token, ranges.after.start, ranges.after.end, q.get("excl"), q.get("autoExclLowEngagement") === "1");
          const prev = wantCmp ? await buildUtmPerformance(propertyId, token, ranges.before.start, ranges.before.end, q.get("excl"), q.get("autoExclLowEngagement") === "1") : null;
          return jsonCached({
            periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`,
            periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`,
            utm: cur,
            utmBefore: prev
          }, 200);
        } catch (e) {
          return json({ error: "UTM \uB9AC\uD3EC\uD2B8 \uC2E4\uD328: " + String(e && e.message || e) }, 500);
        }
      }
      if (q.get("tab") === "scroll") {
        const wantCmp = q.get("cmp") === "1";
        const cur = await buildScrollDepth(propertyId, token, ranges.after.start, ranges.after.end, q.get("excl"), q.get("autoExclLowEngagement") === "1");
        const prev = wantCmp ? await buildScrollDepth(propertyId, token, ranges.before.start, ranges.before.end, q.get("excl"), q.get("autoExclLowEngagement") === "1") : null;
        return jsonCached({
          periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`,
          periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`,
          scroll: cur,
          scrollBefore: prev
        }, 200);
      }
      if (q.get("tab") === "acquisition") {
        const wantCmp = q.get("cmp") === "1";
        const acq = await buildAcquisition(propertyId, token, ranges.after.start, ranges.after.end, q.get("excl"), q.get("autoExclLowEngagement") === "1");
        const acqBefore = wantCmp ? await buildAcquisition(propertyId, token, ranges.before.start, ranges.before.end, q.get("excl"), q.get("autoExclLowEngagement") === "1") : null;
        return jsonCached({
          periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`,
          periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`,
          acquisition: acq,
          acquisitionBefore: acqBefore
        }, 200);
      }
      if (q.get("tab") === "countrydetail") {
        const details = await buildTopCountriesDetail(propertyId, token, ranges.after.start, ranges.after.end, 5);
        return jsonCached({ periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`, countries: details }, 200);
      }
      if (q.get("tab") === "daily") {
        const daily = await buildDaily(propertyId, token, ranges.after.start, ranges.after.end, q.get("excl"), q.get("autoExclLowEngagement") === "1");
        return jsonCached({ periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`, daily }, 200);
      }
      if (q.get("tab") === "slotperf") {
        let perf = await buildSlotPerf(propertyId, token, ranges, q.get("excl"), q.get("autoExclLowEngagement") === "1");
        perf = await attachSlotPerfNames(perf, env);
        return jsonCached({ periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`, periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`, slotperf: perf }, 200);
      }
      if (q.get("tab") === "slots") {
        let slots = await buildSlots(propertyId, token, ranges, q.get("excl"), q.get("autoExclLowEngagement") === "1");
        slots = await attachNames(slots, env);
        return jsonCached({ periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`, periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`, slots }, 200);
      }
      const result = await buildData(propertyId, token, ranges, q.get("excl"), q.get("autoExclLowEngagement") === "1");
      return jsonCached(result, 200);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
  }
};
function csv(rows, status = 200, filename) {
  const esc = /* @__PURE__ */ __name((v) => {
    const t = String(v ?? "");
    return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }, "esc");
  const body = rows.map((r) => r.map(esc).join(",")).join("\n");
  const headers = {
    "Content-Type": "text/csv; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    // 시트가 자주 부르니 5분 캐시
    ...CORS
  };
  if (filename) {
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }
  return new Response(filename ? "\uFEFF" + body : body, { status, headers });
}
__name(csv, "csv");
// ===== 영수증 AI 읽기 =====
// Google Gemini API(무료 등급)로 영수증 이미지를 읽어 일자·사용처·금액·승인번호·전체 글자를 JSON 으로 돌려준다.
// 시크릿: GEMINI_API_KEY (필수), GEMINI_MODEL (선택, 기본 gemini-3.8-flash)
// 무료 등급은 결제 수단이 없어 과금되지 않는다. 한도(분당·일일)를 넘으면 429 → 페이지가 기본 엔진으로 되돌아간다.
var RECEIPT_ORIGINS = ["https://su-pbg.github.io"];
var RECEIPT_MAX_B64 = 6e6;
var RECEIPT_PER_MIN = 20;
var _rcptHits = /* @__PURE__ */ new Map();
var RECEIPT_PROMPT = [
  "이 이미지는 한국 회사 경비 처리용 영수증(카드 매출전표, 간이영수증, 해외 SW 인보이스 등)이다.",
  "다음을 JSON 으로만 답하라.",
  "- date: 결제(거래) 일자 YYYY-MM-DD. 출력일·인쇄일이 아니라 거래일. 모르면 빈 문자열.",
  "- merchant: 가맹점(상호)명. 지점명이 있으면 포함(예: 스타벅스 농대입구역점). 카드사·결제대행사 이름은 넣지 않는다.",
  "- amount: 실제 결제된 원화 합계(부가세 포함, 할인 후). 원화가 없으면 null.",
  "- currency: KRW 또는 USD 또는 OTHER (영수증의 결제 통화).",
  "- foreignAmount: 외화 결제면 외화 합계, 아니면 null.",
  "- approvalNo: 카드 승인번호(숫자). 없으면 빈 문자열.",
  "- page: 여러 장짜리 인보이스의 쪽 표시(예: 2/2). 없으면 빈 문자열.",
  "- fullText: 영수증의 글자를 위에서 아래로 줄바꿈 포함해 그대로 옮긴 것. 카드번호는 마지막 4자리만 남기고 *로 가린다.",
  "숫자는 콤마 없이. 추측이 필요하면 가장 그럴듯한 값을 넣고, 전혀 보이지 않으면 비운다."
].join("\n");
var RECEIPT_SCHEMA = {
  type: "OBJECT",
  properties: {
    date: { type: "STRING" },
    merchant: { type: "STRING" },
    amount: { type: "NUMBER", nullable: true },
    currency: { type: "STRING", enum: ["KRW", "USD", "OTHER"] },
    foreignAmount: { type: "NUMBER", nullable: true },
    approvalNo: { type: "STRING" },
    page: { type: "STRING" },
    fullText: { type: "STRING" }
  },
  required: ["date", "merchant", "amount", "currency", "fullText"]
};
var CAFE24_HOOK_IPS = ["119.205.223.208", "119.205.223.209", "119.205.223.213", "119.205.223.214", "119.205.223.215", "203.245.45.182", "203.245.45.183"];
async function handleCafe24Hook(request, env) {
  const kv0 = env.CAFE24_TOKEN_KV;
  if (!kv0) return json({ error: "no kv" }, 503);
  const key = request.headers.get("X-API-Key") || "";
  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!env.CAFE24_WEBHOOK_KEY || !safeEqual(key, env.CAFE24_WEBHOOK_KEY)) return json({ error: "bad key" }, 401);
  if (!CAFE24_HOOK_IPS.includes(ip)) return json({ error: "bad ip" }, 403);
  let b = {};
  try { b = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
  const r = b.resource || {}, ev = Number(b.event_no) || 0, id = String(r.order_id || "");
  if (!/^\d{8}-\d{7}$/.test(id)) return json({ ok: true, ignored: "no order_id" });
  const now = new Date(Date.now() + 9 * 3600 * 1e3).toISOString().slice(0, 19).replace("T", " ");
  // 주문 단위 상태 — 같은 주문의 이전 값 위에 바뀐 것만 덮는다
  const k = "ecopen:o:" + id, prev = JSON.parse((await kv0.get(k)) || "null") || {};
  const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
  const next = { ...prev, order_id: id, order_date: String(r.order_date || prev.order_date || "").slice(0, 10), at: now, ev };
  if (r.shipping_status) next.ship_status = String(r.shipping_status);
  if (r.paid) next.paid = String(r.paid);
  if (r.actual_payment_amount != null) next.payment_amount = n(r.actual_payment_amount);
  if (ev === 90026 || ev === 90072) next.cancel_event = now;           // 취소상태 변경
  if (ev === 90027 || ev === 90074) next.return_event = now;           // 반품상태 변경
  if (ev === 90029 || ev === 90073) next.refund_event = now;           // 환불상태 변경
  if (ev === 90070) next.deleted = true;
  await kv0.put(k, JSON.stringify(next), { expirationTtl: 120 * 86400 });
  // 최근 변경 목록(화면이 "무엇이 바뀌었나"를 빨리 읽게) — 200개까지
  const lk = "ecopen:recent", recent = JSON.parse((await kv0.get(lk)) || "[]");
  recent.unshift({ id, ev, at: now, ship_status: next.ship_status || "" });
  await kv0.put(lk, JSON.stringify(recent.slice(0, 200)));
  return json({ ok: true, order_id: id, ev });
}
__name(handleCafe24Hook, "handleCafe24Hook");
async function handleReceipt(request, env) {
  const origin = request.headers.get("Origin") || "";
  const cors = { ...CORS, "Access-Control-Allow-Origin": RECEIPT_ORIGINS.includes(origin) ? origin : RECEIPT_ORIGINS[0] };
  const out = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
  if (!RECEIPT_ORIGINS.includes(origin)) return out({ error: "허용되지 않은 출처" }, 403);
  if (!env.GEMINI_API_KEY) return out({ error: "AI 읽기가 아직 설정되지 않았어요 (GEMINI_API_KEY)", code: "nokey" }, 503);
  const ip = request.headers.get("CF-Connecting-IP") || "?";
  const now = Date.now();
  const hits = (_rcptHits.get(ip) || []).filter((t) => now - t < 6e4);
  if (hits.length >= RECEIPT_PER_MIN) return out({ error: "잠시 후 다시 시도하세요 (분당 한도)" }, 429);
  hits.push(now);
  _rcptHits.set(ip, hits);
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return out({ error: "잘못된 요청" }, 400);
  }
  const data = String(body.image || "").replace(/^data:[^,]+,/, "");
  const mime = /^image\/(jpeg|png|webp)$/.test(body.mime || "") ? body.mime : "image/jpeg";
  if (!data || data.length > RECEIPT_MAX_B64) return out({ error: "이미지가 없거나 너무 큼" }, 400);
  let model = env.GEMINI_MODEL || "gemini-3.8-flash";
  // 진단용: DASHBOARD_KEY 를 같이 보낼 때만 모델을 바꿔볼 수 있다 (한도·가용 모델 확인).
  if (body.model && body.key && body.key === env.DASHBOARD_KEY) model = String(body.model).slice(0, 60);
  const ym = /^\d{4}-\d{2}$/.test(body.ym || "") ? `\n참고: 신청 월은 ${body.ym} 이다(연도가 안 보이면 이 연도로).` : "";
  const call = (m) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mime, data } }, { text: RECEIPT_PROMPT + ym }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: RECEIPT_SCHEMA }
    })
  });
  let r = await call(model);
  // [2026-10-07] 모델명을 박아두면 언젠가 404 가 된다 (gemini-2.5-flash 가 그랬고, 그동안 AI 읽기가 통째로 죽어 있었다).
  // 구글이 404 본문에 후속 모델을 적어주므로 그 이름으로 한 번만 다시 부른다. 그래도 안 되면 그대로 502.
  if (r.status === 404) {
    const t404 = await r.text();
    const alt = [...t404.matchAll(/models\/([A-Za-z0-9.\-]+)/g)].map((x) => x[1]).find((n) => n !== model);
    if (!alt) return out({ error: "Gemini 오류 404", detail: t404.slice(0, 300) }, 502);
    model = alt;
    r = await call(model);
  }
  // code 로 성격을 구분해 돌려준다. 페이지가 "다시 걸어볼 것(quota·busy)" 과 "포기할 것(nokey)" 을 가려야 한다.
  if (r.status === 429) return out({ error: "Gemini 한도 초과", code: "quota", detail: (await r.text()).slice(0, 600) }, 429);
  if (r.status === 503 || r.status === 500) return out({ error: "Gemini 혼잡", code: "busy", detail: (await r.text()).slice(0, 300) }, 503);
  if (!r.ok) return out({ error: `Gemini 오류 ${r.status}`, code: "err", detail: (await r.text()).slice(0, 300) }, 502);
  const j = await r.json();
  const txt = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  try {
    return out({ ok: true, model, usage: j?.usageMetadata || null, data: JSON.parse(txt) });
  } catch (e) {
    return out({ error: "응답 해석 실패", detail: txt.slice(0, 300) }, 502);
  }
}
__name(handleReceipt, "handleReceipt");
// [2026-10-12] 위탁 정산용 거래처 LIST 읽기. 시트 ID 는 비밀이 아니다(접근은 공유 설정이 막는다).
// 거래처 LIST 탭에는 연락처가 있어 정산에 쓰는 열(입점여부·브랜드명·공급사코드)만 남긴다.
// 월별 매출 목표(원). KPI 시트 '0. 요약' 5행과 같은 값이다. 바뀌면 여기만 고친다.
var KPI_TARGET = { "2026": [297, 264, 352, 385, 418, 352, 341, 352, 350, 350, 700, 350].map((x) => x * 1e6) };
var SETTLE_SHEET_ID = "1_murW4zNdM5lYIUG5vM1F-LARA3Q7lfLLBtArvtYA0c";
// 담당자는 대시보드 담당자 탭(supplier-managers.json)이 아니라 거래처 LIST 의 '담당자' 열을 따른다(아트·라이프 탭).
var SETTLE_TABS = {
  "카페 24 등록 공급사": null,
  "거래처 LIST (아트)": ["입점여부", "브랜드명", "담당자", "계약 형태", "카페24 공급사명", "카페24 공급사코드"],
  "거래처 LIST (라이프)": ["입점여부", "브랜드명", "담당자", "계약 형태", "카페24 공급사명", "카페24 공급사코드"],
  "거래처 LIST (구)": ["입점여부", "작가/브랜드명", "카페24 공급사명", "공급사 코드"]
};
async function readSettleSheet(env) {
  const sa = JSON.parse(env.GA_SA_KEY);
  const id = env.SETTLE_SHEET_ID || SETTLE_SHEET_ID;
  const tabs = Object.keys(SETTLE_TABS);
  const tok = await getAccessToken(sa, "https://www.googleapis.com/auth/spreadsheets.readonly");
  const qs = tabs.map((t) => "ranges=" + encodeURIComponent(`'${t}'`)).join("&");
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${qs}&valueRenderOption=FORMATTED_VALUE`, {
    headers: { Authorization: "Bearer " + tok }
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message || `HTTP ${r.status}`;
    const e = new Error(r.status === 403 && /permission/i.test(msg)
      ? `거래처 LIST 시트를 읽을 권한이 없습니다. 시트를 ${sa.client_email} 에 '뷰어'로 공유해 주세요.`
      : `거래처 LIST 시트를 읽지 못했습니다: ${msg}`);
    e.code = r.status === 403 && /permission/i.test(msg) ? "noaccess" : "sheet";
    e.saEmail = sa.client_email;
    throw e;
  }
  const sheets = {};
  (j.valueRanges || []).forEach((vr, i) => {
    const rows = vr.values || [], keep = SETTLE_TABS[tabs[i]];
    if (!keep) { sheets[tabs[i]] = rows; return; }
    const h = rows.findIndex((row) => row.some((c) => String(c).trim() === "입점여부"));
    if (h < 0) { sheets[tabs[i]] = []; return; }
    const idx = keep.map((k) => rows[h].findIndex((c) => String(c).trim() === k)).filter((x) => x >= 0);
    sheets[tabs[i]] = rows.slice(h).map((row) => idx.map((x) => row[x] ?? ""));
  });
  return { sheets, sheetAt: new Date().toISOString(), saEmail: sa.client_email };
}
__name(readSettleSheet, "readSettleSheet");
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
  });
}
__name(json, "json");
async function getAccessToken(sa, scope = "https://www.googleapis.com/auth/analytics.readonly") {
  const now = Math.floor(Date.now() / 1e3);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };
  const enc = /* @__PURE__ */ __name((o) => b64url(new TextEncoder().encode(JSON.stringify(o))), "enc");
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const key = await importKey(sa.private_key);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("\uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328: " + JSON.stringify(data));
  return data.access_token;
}
__name(getAccessToken, "getAccessToken");
async function importKey(pem) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}
__name(importKey, "importKey");
function b64url(bytes) {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(b64url, "b64url");
async function runReport(propertyId, token, body) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  const data = await res.json();
  if (data.error) throw new Error("GA4: " + data.error.message);
  return data.rows || [];
}
__name(runReport, "runReport");
// [2026-09-22] GA4 퍼널 리포트(v1alpha). 구좌 페이지를 본 사용자가 상품조회·담기·구매까지
// 얼마나 떨어지는지 본다. runReport 로는 못 한다 — 이벤트 지표는 '그 이벤트가 난 페이지'에
// 귀속되므로 구매(주문완료 페이지)를 구좌에 연결할 수 없기 때문이다.
async function runFunnel(propertyId, token, startDate, endDate, path) {
  const body = {
    dateRanges: [{ startDate, endDate }],
    funnel: {
      steps: [
        { name: "구좌 조회", filterExpression: { funnelFieldFilter: { fieldName: "pagePathPlusQueryString", stringFilter: { matchType: "CONTAINS", value: path } } } },
        { name: "상품 조회", filterExpression: { funnelEventFilter: { eventName: "view_item" } } },
        { name: "담기", filterExpression: { funnelEventFilter: { eventName: "add_to_cart" } } },
        { name: "구매", filterExpression: { funnelEventFilter: { eventName: "purchase" } } }
      ]
    },
    funnelVisualizationType: "STANDARD_FUNNEL"
  };
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1alpha/properties/${propertyId}:runFunnelReport`,
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  const data = await res.json();
  if (data.error) throw new Error("GA4 funnel: " + data.error.message);
  const rows = (data.funnelTable && data.funnelTable.rows) || [];
  return rows.map((r) => ({
    step: (r.dimensionValues[0] && r.dimensionValues[0].value) || "",
    users: Number((r.metricValues[0] && r.metricValues[0].value) || 0)
  }));
}
__name(runFunnel, "runFunnel");
async function buildSlots(propertyId, token, ranges, exclRaw, autoExclLowEngagement) {
  let badPairs = [], badCampaigns = [];
  if (autoExclLowEngagement) {
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, ranges.after.start, ranges.after.end));
  }
  async function movesFrom(startDate, endDate, homeKeyword) {
    const filter = andFilters(
      buildExclusionFilter(exclRaw, badPairs, badCampaigns),
      { filter: { fieldName: "pageReferrer", stringFilter: { matchType: "CONTAINS", value: homeKeyword, caseSensitive: false } } }
    );
    const rows = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: "pagePathPlusQueryString" },
        { name: "pageReferrer" }
      ],
      metrics: [{ name: "sessions" }],
      ...filter ? { dimensionFilter: filter } : {},
      limit: 1e5
    });
    const agg = {};
    for (const r of rows) {
      const dest = r.dimensionValues[0].value;
      const ref = r.dimensionValues[1].value || "";
      if (!ref.includes(homeKeyword)) continue;
      if (dest.includes(homeKeyword)) continue;
      const n = Number(r.metricValues[0].value);
      agg[dest] = (agg[dest] || 0) + n;
    }
    return Object.entries(agg).map(([path, sessions]) => ({ path, sessions })).sort((a, b) => b.sessions - a.sessions).slice(0, 30);
  }
  __name(movesFrom, "movesFrom");
  const out = {};
  for (const key of ["art.html", "life.html"]) {
    out[key] = {
      before: await movesFrom(ranges.before.start, ranges.before.end, key),
      after: await movesFrom(ranges.after.start, ranges.after.end, key)
    };
  }
  return out;
}
__name(buildSlots, "buildSlots");
function productNo(path) {
  const m = (path || "").match(/product_no=(\d+)/);
  return m ? m[1] : null;
}
__name(productNo, "productNo");
// [2026-09-17] 2024-06-01 은 이 앱에서 더 이상 제공되지 않는다. 그 값을 헤더로 보내면
// 엔드포인트와 무관하게 400 "version you requested is not available" 로 전부 막힌다.
// (probecustomers 로 products·categories 양쪽에서 확인) 앱 기본값은 2026-03-01.
var CAFE24_API_VERSION = "2026-03-01";
var LAST_TOKEN_SCOPES = null;
// force=true 면 KV 캐시를 무시하고 새로 발급받는다 (죽은 토큰이 캐시에 남은 경우).
async function getCafe24AccessToken(env, force) {
  const kv = env.CAFE24_TOKEN_KV;
  if (kv && !force) {
    const cached = await kv.get("access_token", { type: "json" });
    if (cached && cached.expiresAt > Date.now() + 6e4) {
      LAST_TOKEN_SCOPES = cached.scopes || null;
      return cached.token;
    }
  }
  const gistUrl = `https://api.github.com/gists/${env.CAFE24_GIST_ID}`;
  const ghHeaders = { "Authorization": `token ${env.CAFE24_GH_PAT}`, "Accept": "application/vnd.github+json", "User-Agent": "pbg-dashboard-worker" };
  const gistRes = await fetch(gistUrl, { headers: ghHeaders });
  if (!gistRes.ok) {
    const body = await gistRes.text();
    console.log(`[cafe24 \uC778\uC99D \uC2E4\uD328] Gist \uC870\uD68C \uC2E4\uD328 status=${gistRes.status} body=${body.slice(0, 300)}`);
    return null;
  }
  const gistJson = await gistRes.json();
  const refreshToken = gistJson?.files?.["token.txt"]?.content?.trim();
  if (!refreshToken) {
    console.log("[cafe24 \uC778\uC99D \uC2E4\uD328] Gist\uC5D0 token.txt\uAC00 \uC5C6\uC74C");
    return null;
  }
  const basic = btoa(`${env.CAFE24_ADMIN_CLIENT_ID}:${env.CAFE24_ADMIN_CLIENT_SECRET}`);
  const tokenRes = await fetch(`https://${env.CAFE24_MALL_ID}.cafe24api.com/api/v2/oauth/token`, {
    method: "POST",
    headers: { "Authorization": `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.log(`[cafe24 \uC778\uC99D \uC2E4\uD328] \uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328 status=${tokenRes.status} body=${body.slice(0, 300)}`);
    return null;
  }
  const tokenJson = await tokenRes.json();
  if (tokenJson.refresh_token) {
    const patchRes = await fetch(gistUrl, {
      method: "PATCH",
      headers: ghHeaders,
      body: JSON.stringify({ files: { "token.txt": { content: tokenJson.refresh_token } } })
    });
    if (!patchRes.ok) console.log(`[\uACBD\uACE0] Gist \uAC31\uC2E0 \uC2E4\uD328 status=${patchRes.status}`);
  }
  LAST_TOKEN_SCOPES = tokenJson.scopes || null;
  if (kv && tokenJson.access_token) {
    const expiresAt = Date.now() + (tokenJson.expires_in ? tokenJson.expires_in * 1e3 : 72e5) - 3e5;
    await kv.put("access_token", JSON.stringify({ token: tokenJson.access_token, expiresAt, scopes: tokenJson.scopes || null }), { expirationTtl: 7200 });
  }
  return tokenJson.access_token || null;
}
__name(getCafe24AccessToken, "getCafe24AccessToken");
var ORDER_PAGE = 500;
var ORDER_MAX_PAGES = 8;
var SUPPLIER_BUNDLE_KEY = "productSupplier:v1";
var SUPPLIER_TTL = 60 * 60 * 24 * 30;
var CAFE24_ADMIN_VERSION = "2026-03-01";
// [2026-09-21] 401 \uC7AC\uC2DC\uB3C4\uAC00 \uC65C \uD544\uC694\uD55C\uAC00
//   cafe24 \uB294 \uC0C8 access_token \uC744 \uBC1C\uAE09\uD558\uBA74 \uC774\uC804 \uD1A0\uD070\uC744 \uC989\uC2DC \uBB34\uD6A8\uD654\uD55C\uB2E4. \uADF8\uB7F0\uB370 KV \uB294 \uC989\uC2DC
//   \uC77C\uAD00\uC801\uC774\uC9C0 \uC54A\uC544\uC11C, \uB3D9\uC2DC\uC5D0 \uB4E4\uC5B4\uC628 \uC694\uCCAD\uC774 \uAC01\uC790 \uAC31\uC2E0\uD558\uBA74 \uBA3C\uC800 \uCE90\uC2DC\uB41C \uD1A0\uD070\uC774 \uC8FD\uC740 \uCC44\uB85C
//   TTL(2\uC2DC\uAC04) \uB0B4\uB0B4 \uB0A8\uB294\uB2E4. \uADF8\uB3D9\uC548 \uB300\uC2DC\uBCF4\uB4DC \uC804\uCCB4\uAC00 401 \uB85C \uC8FD\uB294\uB2E4 \u2014 \uC2E4\uC81C\uB85C \uADF8\uB807\uAC8C \uB410\uB2E4.
//   \uADF8\uB798\uC11C 401 \uC744 \uBCF4\uBA74 \uCE90\uC2DC\uB97C \uBC84\uB9AC\uACE0 \uD55C \uBC88\uB9CC \uC0C8\uB85C \uBC1B\uC544 \uC7AC\uC2DC\uB3C4\uD55C\uB2E4.
async function cafe24Get(mallId, tok, path, _retried, env, _retried401) {
  const r = await fetch(`https://${mallId}.cafe24api.com/api/v2/admin/${path}`, {
    headers: {
      Authorization: `Bearer ${tok}`,
      "Content-Type": "application/json",
      "X-Cafe24-Api-Version": CAFE24_ADMIN_VERSION
    }
  });
  if (!r.ok) {
    const body = await r.text();
    const m = body.match(/default value for the app version is ([\d-]+)/);
    if (r.status === 400 && m && !_retried) {
      console.log(`[cafe24] API \uBC84\uC804 ${CAFE24_ADMIN_VERSION} \u2192 ${m[1]} \uB85C \uC804\uD658`);
      CAFE24_ADMIN_VERSION = m[1];
      return cafe24Get(mallId, tok, path, true, env, _retried401);
    }
    if (r.status === 401 && env && !_retried401) {
      console.log(`[cafe24] \uC8FD\uC740 \uD1A0\uD070 \uAC10\uC9C0 \u2014 \uAC15\uC81C \uAC31\uC2E0 \uD6C4 1\uD68C \uC7AC\uC2DC\uB3C4 (${path.split("?")[0]})`);
      const fresh = await getCafe24AccessToken(env, true);
      if (fresh && fresh !== tok) return cafe24Get(mallId, fresh, path, _retried, env, true);
    }
    throw new Error(`${path.split("?")[0]} ${r.status}: ${body.slice(0, 250)}`);
  }
  return r.json();
}
__name(cafe24Get, "cafe24Get");
var isCanceledStatus = /* @__PURE__ */ __name((st) => /^[CRE]/i.test(String(st || "")), "isCanceledStatus");
// [2026-09-28] 개인결제창은 상품 판매가 아니라 결제 링크다. 타 조직 건이 자체공급에
// 섞여 담당자 실적을 부풀리고 있었다. 규칙은 CLAUDE.md '개인결제창 제외' 와 같다 —
// 이커머스 조직 건만 남긴다.
//   남긴다: '이커머스팀 /' · '커머스 /' · 'E /' 접두, 접두 없는 '개인결제창 - OOO님'
//   뺀다  : COM · HQ · IP · PB'S · PBG결제 · 커뮤니티(팀) · 판교 · 운영기획팀 · 저작권사업팀
// 목록을 나열하는 대신 '접두가 붙어 있으면 타 조직' 으로 본다. 새 조직이 생겨도 자동으로
// 빠진다(나열 방식은 새 이름이 그대로 들어온다).
var PAYWIN_KEEP = /^\s*(이커머스팀|커머스|E)\s*\//;
function isExcludedPaywin(name) {
  if (!name || name.indexOf("개인결제") < 0) return false;
  if (PAYWIN_KEEP.test(name)) return false;
  return name.indexOf("/") >= 0;
}
__name(isExcludedPaywin, "isExcludedPaywin");

async function buildSupplierSales(env, from, to, debug) {
  const tok = await getCafe24AccessToken(env);
  if (!tok) return { error: "cafe24 \uC778\uC99D \uC2E4\uD328 (Gist/\uD1A0\uD070 \uD655\uC778)" };
  const mallId = env.CAFE24_MALL_ID;
  const kv = env.CAFE24_TOKEN_KV;
  let orders = [], pages = 0, truncated = false;
  for (let p = 0; p < ORDER_MAX_PAGES; p++) {
    const j = await cafe24Get(
      mallId,
      tok,
      `orders?start_date=${from}&end_date=${to}&date_type=order_date&limit=${ORDER_PAGE}&offset=${p * ORDER_PAGE}&embed=items`,
      false,
      env
    );
    const arr = j.orders || [];
    orders = orders.concat(arr);
    pages++;
    if (arr.length < ORDER_PAGE) break;
    if (p === ORDER_MAX_PAGES - 1) truncated = true;
  }
  if (debug) return { from, to, orderCount: orders.length, pages, sample: orders[0] || null };
  if (!orders.length) return { from, to, orderCount: 0, suppliers: [], note: "\uD574\uB2F9 \uAE30\uAC04 \uC8FC\uBB38 \uC5C6\uC74C" };
  const lines = [];
  for (const o of orders) {
    for (const it of o.items || []) {
      lines.push({
        product_no: it.product_no,
        qty: Number(it.quantity || 0),
        amount: Number(it.product_price || 0) * Number(it.quantity || 0),
        supplier: it.supplier_code || it.supplier_id || null,
        canceled: isCanceledStatus(it.order_status),
        order_id: o.order_id
      });
    }
  }
  let bundle = {};
  if (kv) {
    try {
      bundle = await kv.get(SUPPLIER_BUNDLE_KEY, { type: "json" }) || {};
    } catch (e) {
    }
  }
  // [2026-09-28] 예전에는 '공급사 코드가 없는 상품' 만 조회했다. 그래서 대부분의 상품은
  // bundle 에 이름이 null 로 남아, 공급사 상세에 상품번호만 나왔다.
  // 공급사 해석용(코드 없음) + 이름 채우기용(이름 없음, 금액 큰 순)을 같이 받는다.
  const needCode = lines.filter((l) => !l.supplier && l.product_no != null).map((l) => String(l.product_no));
  const amtByPno = {};
  for (const l of lines) {
    if (l.product_no == null) continue;
    const k = String(l.product_no);
    amtByPno[k] = (amtByPno[k] || 0) + l.amount;
  }
  const needName = Object.keys(amtByPno).sort((a, b) => amtByPno[b] - amtByPno[a]);
  const need = [...new Set([...needCode, ...needName])].filter(
    (n) => bundle[n] === void 0 || bundle[n].name == null
  );
  let fetched = 0;
  const SUP_BATCHES = 6;
  for (let i = 0; i < need.length && i / BATCH_SIZE < SUP_BATCHES; i += BATCH_SIZE) {
    const chunk = need.slice(i, i + BATCH_SIZE);
    try {
      const j = await cafe24Get(
        mallId,
        tok,
        `products?product_no=${chunk.join(",")}&limit=${BATCH_SIZE}&fields=product_no,supplier_code,product_name`,
        false,
        env
      );
      for (const pr of j.products || []) {
        bundle[String(pr.product_no)] = { code: pr.supplier_code || null, name: pr.product_name || null };
      }
      for (const n of chunk) if (bundle[n] === void 0) bundle[n] = { code: null, name: null };
      fetched += chunk.length;
    } catch (e) {
      console.log("[\uACF5\uAE09\uC0AC] \uC0C1\uD488 \uC870\uD68C \uC2E4\uD328: " + (e && e.message || e));
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (fetched && kv) {
    try {
      await kv.put(SUPPLIER_BUNDLE_KEY, JSON.stringify(bundle), { expirationTtl: SUPPLIER_TTL });
    } catch (e) {
    }
  }
  // 상품명이 채워진 뒤에 개인결제창을 뺀다 (이름이 있어야 판정할 수 있다)
  let paywinExcluded = 0, paywinAmount = 0;
  const kept = [];
  for (const l of lines) {
    const nm = bundle[String(l.product_no)] && bundle[String(l.product_no)].name || null;
    if (isExcludedPaywin(nm)) { paywinExcluded++; paywinAmount += l.amount; continue; }
    kept.push(l);
  }
  lines.length = 0;
  for (const l of kept) lines.push(l);

  const agg = {};
  let unresolved = 0;
  for (const l of lines) {
    const code = l.supplier || bundle[String(l.product_no)] && bundle[String(l.product_no)].code || null;
    if (!code) unresolved++;
    const k = code || "(\uACF5\uAE09\uC0AC\uBBF8\uC0C1)";
    const a = agg[k] || (agg[k] = { code: k, qty: 0, amount: 0, canceledQty: 0, canceledAmount: 0, orders: /* @__PURE__ */ new Set(), products: /* @__PURE__ */ new Set() });
    if (l.canceled) {
      a.canceledQty += l.qty;
      a.canceledAmount += l.amount;
    } else {
      a.qty += l.qty;
      a.amount += l.amount;
    }
    a.orders.add(l.order_id);
    if (l.product_no != null) a.products.add(l.product_no);
  }
  const aggList = Object.values(agg);
  // [2026-09-22] 구좌(카테고리) 매출을 내려면 상품 단위 금액이 필요하다.
  // revenue-daily.json 의 products 는 하루 상위 10종뿐이라 전수 집계가 안 된다.
  const byProduct = {};
  for (const l of lines) {
    if (l.product_no == null) continue;
    const k = String(l.product_no);
    const b = byProduct[k] || (byProduct[k] = { pno: l.product_no, qty: 0, amount: 0, canceledQty: 0, canceledAmount: 0, orders: /* @__PURE__ */ new Set() });
    if (l.canceled) {
      b.canceledQty += l.qty;
      b.canceledAmount += l.amount;
    } else {
      b.qty += l.qty;
      b.amount += l.amount;
    }
    b.orders.add(l.order_id);
  }
  const products = Object.values(byProduct).map((b) => ({
    pno: b.pno,
    name: bundle[String(b.pno)] && bundle[String(b.pno)].name || null,
    qty: b.qty,
    amount: b.amount,
    canceledQty: b.canceledQty,
    canceledAmount: b.canceledAmount,
    orderCount: b.orders.size
  })).sort((x, y) => y.amount - x.amount);
  // 공급사별 상품 목록. 화면에서 공급사 한 줄을 펼치면 무엇이 팔렸는지 바로 보여야 한다.
  // 금액 큰 순 상위 20종만 싣는다 (전 종목을 실으면 응답이 커진다).
  const suppliers = aggList.map((a) => ({
    code: a.code,
    qty: a.qty,
    amount: a.amount,
    canceledQty: a.canceledQty,
    canceledAmount: a.canceledAmount,
    orderCount: a.orders.size,
    productCount: a.products.size,
    products: [...a.products].map((pno) => {
      const b = byProduct[String(pno)];
      return {
        pno,
        name: bundle[String(pno)] && bundle[String(pno)].name || null,
        qty: b ? b.qty : 0,
        amount: b ? b.amount : 0,
        canceledQty: b ? b.canceledQty : 0
      };
    }).sort((x, y) => y.amount - x.amount).slice(0, 20)
  })).sort((x, y) => y.qty - x.qty);
  return {
    from,
    to,
    orderCount: orders.length,
    lineCount: lines.length,
    pages,
    truncated,
    supplierResolved: lines.length - unresolved,
    supplierUnresolved: unresolved,
    productLookupFetched: fetched,
    productLookupRemaining: Math.max(0, need.length - fetched),
    paywinExcluded,
    paywinExcludedAmount: paywinAmount,
    suppliers,
    products,
    note: "qty/amount \uB294 \uCDE8\uC18C\xB7\uBC18\uD488 \uC81C\uC678\uBD84. canceledQty/canceledAmount \uB294 \uCDE8\uC18C\xB7\uBC18\uD488\uBD84. truncated=true \uBA74 \uAE30\uAC04\uC744 \uCABC\uAC1C\uC11C \uB2E4\uC2DC \uBD80\uB974\uC138\uC694. productLookupRemaining \uC774 0 \uC774 \uC544\uB2C8\uBA74 \uAC19\uC740 \uAE30\uAC04\uC744 \uD55C \uBC88 \uB354 \uBD80\uB974\uBA74 \uCE90\uC2DC\uAC00 \uCC44\uC6CC\uC9D1\uB2C8\uB2E4."
  };
}
__name(buildSupplierSales, "buildSupplierSales");
var PRODUCT_NAME_BUNDLE_KEY = "productNames:v2";
var PRODUCT_NAME_TTL = 60 * 60 * 24 * 30;
var BATCH_SIZE = 100;
var MAX_BATCHES_PER_REQUEST = 2;
async function fetchProductNameSingle(no, accessToken, mallId) {
  try {
    const r = await fetch(`https://${mallId}.cafe24api.com/api/v2/admin/products/${no}`, {
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Cafe24-Api-Version": CAFE24_API_VERSION }
    });
    if (!r.ok) {
      console.log(`[\uC0C1\uD488\uBA85 \uB2E8\uAC74 \uC2E4\uD328] product_no=${no} status=${r.status} body=${(await r.text()).slice(0, 150)}`);
      return null;
    }
    const j = await r.json();
    return j?.product?.product_name || null;
  } catch (e) {
    console.log(`[\uC0C1\uD488\uBA85 \uB2E8\uAC74 \uC608\uC678] product_no=${no} error=${e && e.message || e}`);
    return null;
  }
}
__name(fetchProductNameSingle, "fetchProductNameSingle");
async function fetchProductNamesBatch(pnos, accessToken, mallId) {
  const out = {};
  try {
    const r = await fetch(
      `https://${mallId}.cafe24api.com/api/v2/admin/products?product_no=${pnos.join(",")}&limit=${BATCH_SIZE}`,
      { headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Cafe24-Api-Version": CAFE24_API_VERSION } }
    );
    if (!r.ok) {
      console.log(`[\uC0C1\uD488\uBA85 \uBC30\uCE58 \uC2E4\uD328] ${pnos.length}\uAC74 status=${r.status} body=${(await r.text()).slice(0, 200)}`);
      return out;
    }
    const j = await r.json();
    for (const p of j?.products || []) {
      if (p?.product_no != null) out[String(p.product_no)] = p.product_name || null;
    }
  } catch (e) {
    console.log(`[\uC0C1\uD488\uBA85 \uBC30\uCE58 \uC608\uC678] error=${e && e.message || e}`);
  }
  return out;
}
__name(fetchProductNamesBatch, "fetchProductNamesBatch");
async function resolveProductNames(kv, accessToken, mallId, pnos) {
  const need = [...new Set(pnos.map(String))].filter(Boolean);
  let bundle = {};
  if (kv) {
    try {
      bundle = await kv.get(PRODUCT_NAME_BUNDLE_KEY, { type: "json" }) || {};
    } catch (e) {
    }
  }
  const missing = need.filter((n) => bundle[n] === void 0);
  let fetched = 0, gap = [];
  for (let i = 0; i < missing.length && i / BATCH_SIZE < MAX_BATCHES_PER_REQUEST; i += BATCH_SIZE) {
    const chunk = missing.slice(i, i + BATCH_SIZE);
    const got = await fetchProductNamesBatch(chunk, accessToken, mallId);
    for (const n of chunk) {
      if (got[n] !== void 0) bundle[n] = got[n];
      else gap.push(n);
    }
    fetched += chunk.length;
    if (i + BATCH_SIZE < missing.length) await new Promise((r) => setTimeout(r, 120));
  }
  const SINGLE_BUDGET = 10;
  let single = 0;
  for (const n of gap) {
    if (single >= SINGLE_BUDGET) break;
    bundle[n] = await fetchProductNameSingle(n, accessToken, mallId);
    single++;
    await new Promise((r) => setTimeout(r, 60));
  }
  if (gap.length) {
    console.log(`[\uC0C1\uD488\uBA85] \uBAA9\uB85D\uC5D0\uC11C \uBE60\uC9C4 ${gap.length}\uAC1C \uC911 ${single}\uAC1C\uB97C \uB2E8\uAC74\uC73C\uB85C \uBCF4\uC644` + (gap.length > single ? ` (\uB0A8\uC740 ${gap.length - single}\uAC1C\uB294 \uB2E4\uC74C \uC694\uCCAD\uC5D0\uC11C)` : ""));
  }
  if ((fetched > 0 || single > 0) && kv) {
    try {
      await kv.put(PRODUCT_NAME_BUNDLE_KEY, JSON.stringify(bundle), { expirationTtl: PRODUCT_NAME_TTL });
    } catch (e) {
    }
  }
  console.log(`[\uC0C1\uD488\uBA85] \uD544\uC694 ${need.length}\uAC1C \xB7 \uCE90\uC2DC\uC801\uC911 ${need.length - missing.length}\uAC1C \xB7 \uBC30\uCE58\uC870\uD68C ${fetched}\uAC1C \xB7 \uB0A8\uC740 ${Math.max(0, missing.length - fetched)}\uAC1C \xB7 \uB204\uC801 ${Object.keys(bundle).length}\uAC1C`);
  return bundle;
}
__name(resolveProductNames, "resolveProductNames");
async function fetchCategoryName(no, accessToken, mallId, clientId) {
  try {
    // [2026-09-21] 관리자 API(/admin/categories/{no})는 이 앱 토큰으로 403 insufficient_scope 다.
    // 같은 정보를 스토어프론트 API 가 client-id 만으로 내준다 — 스코프 추가가 필요 없다.
    const r = await fetch(`https://${mallId}.cafe24api.com/api/v2/categories/${no}`, {
      headers: { "X-Cafe24-Client-Id": clientId, "Content-Type": "application/json" }
    });
    if (!r.ok) {
      const body = await r.text();
      console.log(`[\uCE74\uD14C\uACE0\uB9AC\uBA85 \uC870\uD68C \uC2E4\uD328] cate_no=${no} status=${r.status} body=${body.slice(0, 200)}`);
      return null;
    }
    const j = await r.json();
    return j?.category?.category_name || null;
  } catch (e) {
    console.log(`[\uCE74\uD14C\uACE0\uB9AC\uBA85 \uC870\uD68C \uC608\uC678] cate_no=${no} error=${e && e.message || e}`);
    return null;
  }
}
__name(fetchCategoryName, "fetchCategoryName");
async function resolveSlotIdentityNames(env, accessToken, mallId, neededPnos, neededCnos) {
  const kv = env.CAFE24_TOKEN_KV;
  const bundleKey = "slotIdentityNames:v3";
  let bundle = { p: {}, c: {} };
  if (kv) {
    try {
      const cached = await kv.get(bundleKey, { type: "json" });
      if (cached) bundle = cached;
    } catch (e) {
    }
  }
  const missingP = neededPnos.filter((n) => bundle.p[n] === void 0);
  const missingC = neededCnos.filter((n) => bundle.c[n] === void 0);
  let filledP = 0, filledC = 0;
  if (missingP.length) {
    const chunk = missingP.slice(0, BATCH_SIZE);
    const got = await fetchProductNamesBatch(chunk.map(String), accessToken, mallId);
    const gap = [];
    for (const n of chunk) {
      if (got[String(n)] !== void 0) bundle.p[n] = got[String(n)];
      else gap.push(n);
    }
    let single = 0;
    for (const n of gap) {
      if (single >= 6) break;
      bundle.p[n] = await fetchProductNameSingle(n, accessToken, mallId);
      single++;
      await new Promise((r) => setTimeout(r, 60));
    }
    filledP = chunk.length;
    if (gap.length) console.log(`[\uC2AC\uB86F \uC774\uB984] \uBAA9\uB85D\uC5D0\uC11C \uBE60\uC9C4 ${gap.length}\uAC1C \uC911 ${single}\uAC1C \uB2E8\uAC74 \uBCF4\uC644`);
  }
  const CAT_FILL_CAP = 8;
  for (const n of missingC) {
    if (filledC >= CAT_FILL_CAP) break;
    bundle.c[n] = await fetchCategoryName(n, accessToken, mallId, env.CAFE24_ADMIN_CLIENT_ID);
    filledC++;
    await new Promise((r) => setTimeout(r, 50));
  }
  const filled = filledP + filledC;
  if (filled > 0 && kv) {
    try {
      await kv.put(bundleKey, JSON.stringify(bundle), { expirationTtl: PRODUCT_NAME_TTL });
    } catch (e) {
    }
  }
  console.log(`[\uC2AC\uB86F \uC774\uB984 \uBC88\uB4E4] \uC2E0\uADDC \uC0C1\uD488 ${filledP}\uAC1C(\uBC30\uCE58) \xB7 \uCE74\uD14C\uACE0\uB9AC ${filledC}\uAC1C / \uB204\uC801 \uC0C1\uD488 ${Object.keys(bundle.p).length}\uAC1C, \uCE74\uD14C\uACE0\uB9AC ${Object.keys(bundle.c).length}\uAC1C, \uB0A8\uC740 \uCE74\uD14C\uACE0\uB9AC ${Math.max(0, missingC.length - filledC)}\uAC1C`);
  return bundle;
}
__name(resolveSlotIdentityNames, "resolveSlotIdentityNames");
async function attachSlotPerfNames(perf, env) {
  const accessToken = await getCafe24AccessToken(env);
  if (!accessToken) {
    console.log("[\uC774\uB984 \uC870\uD68C \uC2A4\uD0B5] cafe24 \uC778\uC99D \uC2E4\uD328");
    return perf;
  }
  const mallId = env.CAFE24_MALL_ID;
  const kv = env.CAFE24_TOKEN_KV;
  const slotPnos = /* @__PURE__ */ new Set(), slotCnos = /* @__PURE__ */ new Set();
  for (const tab of Object.keys(perf))
    for (const row of perf[tab]) {
      if (row.pno) slotPnos.add(row.pno);
      if (row.cate) slotCnos.add(row.cate);
    }
  const bundle = await resolveSlotIdentityNames(env, accessToken, mallId, [...slotPnos], [...slotCnos]);
  const tpPnos = /* @__PURE__ */ new Set();
  for (const tab of Object.keys(perf))
    for (const row of perf[tab])
      for (const tp of row.topProducts || []) tpPnos.add(tp.pno);
  const tpCache = await resolveProductNames(kv, accessToken, mallId, [...tpPnos]);
  for (const tab of Object.keys(perf))
    for (const row of perf[tab]) {
      const prefix = (row.staticName || "").split(" ")[0];
      if (row.pno && bundle.p[row.pno]) row.name = `${prefix} (${bundle.p[row.pno]})`;
      else if (row.cate && bundle.c[row.cate] && !row.sort) row.name = `${prefix} (${bundle.c[row.cate]})`;
      row.topProductsLabel = row.section === "\uD504\uB85C\uBAA8\uC158" ? "\uCEA0\uD398\uC778" : "\uC0C1\uD488";
      for (const tp of row.topProducts || []) tp.name = tpCache[tp.pno] || null;
    }
  return perf;
}
__name(attachSlotPerfNames, "attachSlotPerfNames");
async function attachNames(slots, env) {
  const accessToken = await getCafe24AccessToken(env);
  if (!accessToken) {
    console.log("[\uC0C1\uD488\uBA85 \uC870\uD68C \uC2A4\uD0B5] cafe24 \uC778\uC99D \uC2E4\uD328");
    return slots;
  }
  const mallId = env.CAFE24_MALL_ID;
  const kv = env.CAFE24_TOKEN_KV;
  const nos = /* @__PURE__ */ new Set();
  for (const k of Object.keys(slots))
    for (const side of ["before", "after"])
      for (const row of slots[k][side]) {
        const n = productNo(row.path);
        if (n) nos.add(n);
      }
  const cache = await resolveProductNames(kv, accessToken, mallId, [...nos]);
  for (const k of Object.keys(slots))
    for (const side of ["before", "after"])
      for (const row of slots[k][side]) {
        const n = productNo(row.path);
        row.name = n && cache[n] ? cache[n] : null;
        row.product_no = n || null;
      }
  return slots;
}
__name(attachNames, "attachNames");
var SLOT_MAP = {
  art: [
    // 글로벌 네비 (7)
    { o: 1, name: "NEW ARRIVAL", cate: "547", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" },
    { o: 2, name: "\uD504\uB85C\uBAA8\uC158", cate: "514", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" },
    { o: 3, name: "\uC544\uD2B8", cate: "608", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" },
    { o: 4, name: "\uB77C\uC774\uD504", cate: "609", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" },
    { o: 5, name: "\uB958\uC5F0\uD76C\uC758 \uC2DC\uAC04", cate: "474", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" },
    { o: 6, name: "\uD5C8\uBA85\uC6B1\uC758 SAMUL", cate: "298", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" },
    { o: 7, name: "\uC774\uD61C\uBBF8\uC758 \uC2E4\uBC84", cate: "416", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" },
    // 상단 배너 5개 (2026-07-29 재확인)
    { o: 8, name: "\uBC30\uB1081 \uD3A0\uD2B8\uB85C \uC2A4\uD29C\uB514\uC624", pno: "13625", section: "\uC0C1\uB2E8\uBC30\uB108" },
    { o: 9, name: "\uBC30\uB1082 \uC5D0\uB514\uAC15 \uD654\uBCD1", pno: "14761", section: "\uC0C1\uB2E8\uBC30\uB108" },
    { o: 10, name: "\uBC30\uB1083 \uC6B0\uB9AC \uC2DC\uB300\uB97C \uC218\uC9D1", pno: "13455", section: "\uC0C1\uB2E8\uBC30\uB108" },
    { o: 11, name: "\uBC30\uB1084 K-ART \uAC70\uC7A5", cate: "741", section: "\uC0C1\uB2E8\uBC30\uB108" },
    { o: 12, name: "\uBC30\uB1085 \uBE44\uC6C0\uC73C\uB85C \uCC44\uC6B4 \uD55C\uAD6D\uC758 \uBBF8", pno: "14310", section: "\uC0C1\uB2E8\uBC30\uB108" },
    // 숏컷(메인 배너 바로 아래 원형 아이콘 10개, 2026-07-29 확인 - 실제 href 있는 진짜 링크)
    { o: 13, name: "\uC624\uB9AC\uC9C0\uB110", cate: "234", section: "\uC20F\uCEF7" },
    { o: 14, name: "\uB9AC\uBBF8\uD2F0\uB4DC", cate: "272", section: "\uC20F\uCEF7" },
    { o: 15, name: "\uC218\uACF5\uB2F9", cate: "789", section: "\uC20F\uCEF7" },
    { o: 16, name: "\uACF5\uC608\uBBF8\uC220\uAD00", cate: "540", section: "\uC20F\uCEF7" },
    { o: 17, name: "\uC791\uAC00\uB3C4\uAC10", cate: "541", section: "\uC20F\uCEF7" },
    { o: 18, name: "\uC774\uD61C\uBBF8", cate: "416", section: "\uC20F\uCEF7" },
    { o: 19, name: "\uD5C8\uBA85\uC6B1", cate: "298", section: "\uC20F\uCEF7" },
    { o: 20, name: "\uB958\uC5F0\uD76C", cate: "474", section: "\uC20F\uCEF7" },
    { o: 21, name: "\uC544\uD2B8\uD3EC\uC2A4\uD130", cate: "235", section: "\uC20F\uCEF7" },
    { o: 22, name: "\uC544\uD2B8\uD504\uB85C\uC81D\uD2B8", path: "/company/archive.html", section: "\uC20F\uCEF7" },
    // 주제별 추천작 - 탭 (버튼 자체는 URL 이동 없지만, 그 안 상품 클릭시 각기 다른
    // cate_no로 이동함이 확인됨 - 2026-07-29 재확인. 탭=카테고리 매핑:
    { o: 23, name: "\uC624\uB9AC\uC9C0\uB110", cate: "866", section: "\uC8FC\uC81C\uBCC4 \uCD94\uCC9C\uC791" },
    { o: 24, name: "\uD310\uD654", cate: "867", section: "\uC8FC\uC81C\uBCC4 \uCD94\uCC9C\uC791" },
    { o: 25, name: "PB Only", cate: "872", section: "\uC8FC\uC81C\uBCC4 \uCD94\uCC9C\uC791" },
    { o: 26, name: "\uC544\uD2B8\uD3EC\uC2A4\uD130", cate: "868", section: "\uC8FC\uC81C\uBCC4 \uCD94\uCC9C\uC791" },
    // For Collector - 수공당(기본 칩) (2026-07-29 재확인)
    { o: 27, name: "\uD5C8\uBA85\uC6B1", cate: "807", section: "For Collector \xB7 \uC218\uACF5\uB2F9" },
    { o: 28, name: "\uC591\uC720\uC644", cate: "808", section: "For Collector \xB7 \uC218\uACF5\uB2F9" },
    { o: 29, name: "\uC870\uC5F0\uC608", cate: "809", section: "For Collector \xB7 \uC218\uACF5\uB2F9" },
    { o: 30, name: "\uC815\uC18C\uD61C", cate: "810", section: "For Collector \xB7 \uC218\uACF5\uB2F9" },
    { o: 31, name: "\uC724\uC5EC\uB3D9", cate: "811", section: "For Collector \xB7 \uC218\uACF5\uB2F9" },
    { o: 32, name: "\uBC29\uC5F0\uB2F9", cate: "812", section: "For Collector \xB7 \uC218\uACF5\uB2F9" },
    { o: 33, name: "\uC804\uCCB4 \uBCF4\uAE30", cate: "229", section: "For Collector \xB7 \uC218\uACF5\uB2F9" },
    // For Collector - 작가별 칩 6명 (2026-07-29 확인)
    // 김환기/김창열은 전용 카테고리, 나머지 4명은 검색 결과 페이지로 이동하는데
    // cate_no는 전부 228 공용이라 URL의 keyword= 값으로 개별 추적함.
    { o: 34, name: "\uAE40\uD658\uAE30", cate: "714", section: "For Collector \xB7 \uC791\uAC00\uBCC4" },
    { o: 35, name: "\uAE40\uCC3D\uC5F4", cate: "715", section: "For Collector \xB7 \uC791\uAC00\uBCC4" },
    { o: 36, name: "\uC724\uD615\uD0DD", keyword: "\uC724\uD615\uD0DD", section: "For Collector \xB7 \uC791\uAC00\uBCC4" },
    { o: 37, name: "\uADF8\uB808\uD0C0\uD504\uB9AC\uB4E0", keyword: "\uADF8\uB808\uD0C0\uD504\uB9AC\uB4E0", section: "For Collector \xB7 \uC791\uAC00\uBCC4" },
    { o: 38, name: "\uC608\uC608", keyword: "\uC608\uC608", section: "For Collector \xB7 \uC791\uAC00\uBCC4" },
    { o: 39, name: "\uB2C8\uD0A4", keyword: "\uB2C8\uD0A4", section: "For Collector \xB7 \uC791\uAC00\uBCC4" },
    // For Collector - 사이즈별 칩 (2026-07-29 확인, 734~739 순차)
    { o: 40, name: "~40x50cm", cate: "734", section: "For Collector \xB7 \uC0AC\uC774\uC988\uBCC4" },
    { o: 41, name: "\uBBF8\uB2C8\uC0AC\uC774\uC988", cate: "735", section: "For Collector \xB7 \uC0AC\uC774\uC988\uBCC4" },
    { o: 42, name: "~70x90cm", cate: "736", section: "For Collector \xB7 \uC0AC\uC774\uC988\uBCC4" },
    { o: 43, name: "~90x110cm", cate: "737", section: "For Collector \xB7 \uC0AC\uC774\uC988\uBCC4" },
    { o: 44, name: "~130x160cm", cate: "738", section: "For Collector \xB7 \uC0AC\uC774\uC988\uBCC4" },
    { o: 45, name: "160cm \uC774\uC0C1", cate: "739", section: "For Collector \xB7 \uC0AC\uC774\uC988\uBCC4" },
    // For Collector - 테마별 칩 (2026-07-29 확인)
    { o: 46, name: "\uCCAB \uCF5C\uB809\uD305 \uCD94\uCC9C\uC791\uD488", cate: "740", section: "For Collector \xB7 \uD14C\uB9C8\uBCC4" },
    { o: 47, name: "\uAC70\uC7A5\uC758 \uC791\uD488", cate: "741", section: "For Collector \xB7 \uD14C\uB9C8\uBCC4" },
    { o: 48, name: "\uAE30\uBD84 \uC88B\uC740 \uD604\uAD00", cate: "742", section: "For Collector \xB7 \uD14C\uB9C8\uBCC4" },
    { o: 49, name: "\uC9D1\uB4E4\uC774", cate: "743", section: "For Collector \xB7 \uD14C\uB9C8\uBCC4" },
    { o: 50, name: "50\uB9CC\uC6D0\uC73C\uB85C \uC120\uBB3C\uD558\uB294 \uC791\uD488", cate: "744", section: "For Collector \xB7 \uD14C\uB9C8\uBCC4" },
    // 추천 작가 (2026-07-29 재확인)
    { o: 51, name: "\uB958\uC5F0\uD76C", pno: "14841", section: "\uCD94\uCC9C \uC791\uAC00" },
    { o: 52, name: "\uC774\uD61C\uBBF8", pno: "13201", section: "\uCD94\uCC9C \uC791\uAC00" },
    { o: 53, name: "\uC720\uC57C \uD558\uC2DC\uC988\uBA54", pno: "8778", section: "\uCD94\uCC9C \uC791\uAC00" },
    { o: 54, name: "\uD5C8\uBA85\uC6B1", pno: "6683", section: "\uCD94\uCC9C \uC791\uAC00" },
    { o: 55, name: "\uC724\uD615\uD0DD", pno: "4236", section: "\uCD94\uCC9C \uC791\uAC00" },
    { o: 56, name: "\uCCAD\uC2E0", pno: "4015", section: "\uCD94\uCC9C \uC791\uAC00" },
    // 프로모션 / 전시소식 진입점 (개별 상품은 링크 형태가 아니라 번호 미확보)
    { o: 57, name: "\uD504\uB85C\uBAA8\uC158 (\uC804\uCCB4 \uCEA0\uD398\uC778)", promoPath: true, section: "\uD504\uB85C\uBAA8\uC158" },
    { o: 58, name: "\uC804\uC2DC\uC18C\uC2DD \uC804\uCCB4", cate: "874", section: "\uC804\uC2DC \uC18C\uC2DD" },
    // [2026-09-10] 메인에 새로 붙은 정렬 구좌. cate_no 는 608(아트)로 같고 sort_method 로만 갈린다.
    // 이걸 안 나누면 두 구좌 유입이 글로벌네비 '아트' 실적으로 잘못 더해진다.
    { o: 59, name: "\uC870\uD68C\uC218 TOP", cate: "608", sort: "8", section: "\uC815\uB82C \uAD6C\uC88C" },
    { o: 60, name: "\uC778\uAE30 \uC0C1\uD488", cate: "608", sort: "6", section: "\uC815\uB82C \uAD6C\uC88C" },
    // [2026-09-14] 메인 '신규 상품' 구좌 — sort_method=5(신상품순). 빠져 있어 미등록으로 잡혔다
    { o: 61, name: "\uC2E0\uADDC \uC0C1\uD488", cate: "608", sort: "5", section: "\uC815\uB82C \uAD6C\uC88C" },
    // [2026-09-14] GNB 상단 카테고리에 추가된 기획전 3개
    { o: 62, name: "\uCD94\uC11D \uC120\uBB3C \uC900\uBE44", cate: "994", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" },
    { o: 63, name: "ART WEEK", cate: "948", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" },
    { o: 64, name: "\uC870\uBA85&\uAC00\uAD6C", cate: "1034", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" }
  ],
  life: [
    // 글로벌 네비 (7)
    { o: 1, name: "NEW ARRIVAL", cate: "547", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" },
    { o: 2, name: "\uD504\uB85C\uBAA8\uC158", cate: "514", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" },
    { o: 3, name: "\uC544\uD2B8", cate: "608", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" },
    { o: 4, name: "\uB77C\uC774\uD504", cate: "609", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" },
    { o: 5, name: "\uB958\uC5F0\uD76C\uC758 \uC2DC\uAC04", cate: "474", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" },
    { o: 6, name: "\uD5C8\uBA85\uC6B1\uC758 SAMUL", cate: "298", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" },
    { o: 7, name: "\uC774\uD61C\uBBF8\uC758 \uC2E4\uBC84", cate: "416", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" },
    // 상단 배너 5개 (2026-07-29 재확인)
    { o: 8, name: "\uBC30\uB1081", cate: "939", section: "\uC0C1\uB2E8\uBC30\uB108" },
    { o: 9, name: "\uBC30\uB1082", cate: "623", section: "\uC0C1\uB2E8\uBC30\uB108" },
    { o: 10, name: "\uBC30\uB1083", cate: "910", section: "\uC0C1\uB2E8\uBC30\uB108" },
    { o: 11, name: "\uBC30\uB1084", cate: "919", section: "\uC0C1\uB2E8\uBC30\uB108" },
    { o: 12, name: "\uBC30\uB1085", pno: "13941", section: "\uC0C1\uB2E8\uBC30\uB108" },
    // 숏컷 (전체상품/NEW/취향백서/선물추천/프로모션/with artist/PB Only/위베이크/뉴스레터,
    // life에만 있음(art엔 없음). 2026-07-29 재확인 - 실제 href 있는 진짜 링크)
    { o: 13, name: "\uC804\uCCB4\uC0C1\uD488", cate: "609", section: "\uC20F\uCEF7" },
    { o: 14, name: "NEW", cate: "547", section: "\uC20F\uCEF7" },
    { o: 15, name: "\uCDE8\uD5A5\uBC31\uC11C", cate: "750", section: "\uC20F\uCEF7" },
    { o: 16, name: "\uC120\uBB3C\uCD94\uCC9C", cate: "285", section: "\uC20F\uCEF7" },
    { o: 17, name: "\uD504\uB85C\uBAA8\uC158", cate: "514", section: "\uC20F\uCEF7" },
    { o: 18, name: "with artist", cate: "804", section: "\uC20F\uCEF7" },
    { o: 19, name: "PB Only", cate: "320", section: "\uC20F\uCEF7" },
    { o: 20, name: "\uC704\uBCA0\uC774\uD06C", cate: "254", section: "\uC20F\uCEF7" },
    { o: 21, name: "\uB274\uC2A4\uB808\uD130", path: "/newsletter/list.html", section: "\uC20F\uCEF7" },
    // 카테고리 칩 10개 (버튼 자체는 URL 이동 없지만, 안의 상품 클릭시 각기 다른
    // cate_no로 이동 확인됨 - 2026-07-29 재확인. 615~624 순차 확인.
    { o: 22, name: "\uD14C\uC774\uBE14\uC6E8\uC5B4", cate: "615", section: "\uCE74\uD14C\uACE0\uB9AC" },
    { o: 23, name: "\uD648\uB370\uCF54", cate: "616", section: "\uCE74\uD14C\uACE0\uB9AC" },
    { o: 24, name: "\uAC00\uAD6C", cate: "617", section: "\uCE74\uD14C\uACE0\uB9AC" },
    { o: 25, name: "\uD328\uBE0C\uB9AD", cate: "618", section: "\uCE74\uD14C\uACE0\uB9AC" },
    { o: 26, name: "\uD504\uB808\uADF8\uB7F0\uC2A4", cate: "619", section: "\uCE74\uD14C\uACE0\uB9AC" },
    { o: 27, name: "\uAC00\uC804\xB7\uB514\uC9C0\uD138", cate: "620", section: "\uCE74\uD14C\uACE0\uB9AC" },
    { o: 28, name: "\uC2A4\uD14C\uC774\uC154\uB108\uB9AC", cate: "621", section: "\uCE74\uD14C\uACE0\uB9AC" },
    { o: 29, name: "\uD328\uC158\xB7\uBDF0\uD2F0", cate: "622", section: "\uCE74\uD14C\uACE0\uB9AC" },
    { o: 30, name: "\uD3AB", cate: "623", section: "\uCE74\uD14C\uACE0\uB9AC" },
    { o: 31, name: "\uD478\uB4DC", cate: "624", section: "\uCE74\uD14C\uACE0\uB9AC" },
    // 선물추천 - 금액별 칩(기본) (기존 재확인)
    { o: 32, name: "10\uB9CC\uC6D0 \uBBF8\uB9CC", cate: "722", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uAE08\uC561\uBCC4" },
    { o: 33, name: "10\uB9CC\uC6D0\uB300", cate: "723", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uAE08\uC561\uBCC4" },
    { o: 34, name: "20\uB9CC\uC6D0\uB300", cate: "724", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uAE08\uC561\uBCC4" },
    { o: 35, name: "30\uB9CC\uC6D0\uB300", cate: "725", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uAE08\uC561\uBCC4" },
    { o: 36, name: "40\uB9CC\uC6D0\uB300", cate: "726", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uAE08\uC561\uBCC4" },
    { o: 37, name: "50\uB9CC\uC6D0\uB300", cate: "727", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uAE08\uC561\uBCC4" },
    { o: 38, name: "\uC804\uCCB4 \uBCF4\uAE30", cate: "374", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uAE08\uC561\uBCC4" },
    // 선물추천 - 테마별 칩 (2026-07-29 확인)
    { o: 39, name: "\uC120\uBB3C \uD3EC\uC7A5 \uC81C\uACF5", cate: "710", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uD14C\uB9C8\uBCC4" },
    { o: 40, name: "\uBCA0\uC2A4\uD2B8\uC140\uB7EC", cate: "230", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uD14C\uB9C8\uBCC4" },
    { o: 41, name: "\uACB0\uD63C, \uC9D1\uB4E4\uC774", cate: "718", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uD14C\uB9C8\uBCC4" },
    { o: 42, name: "\uACA9\uC2DD \uC788\uB294 \uC120\uBB3C", cate: "719", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uD14C\uB9C8\uBCC4" },
    { o: 43, name: "\uBA54\uC138\uC9C0 \uD0A4\uD2B8", cate: "721", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uD14C\uB9C8\uBCC4" },
    { o: 44, name: "\uBBF8\uC2DD\uAC00\uB97C \uC704\uD55C", cate: "720", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uD14C\uB9C8\uBCC4" },
    // 선물추천 - 브랜드별 칩 (2026-07-29 확인)
    // 전부 검색 결과 페이지로 이동(cate_no 228 공용)이라 URL의 keyword= 값으로 개별 추적.
    // '수토'는 전용 상품 페이지(product_no=15815)로 이동함이 확인됨.
    { o: 45, name: "\uCC44\uD0B4", keyword: "\uCC44\uD0B4", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uBE0C\uB79C\uB4DC\uBCC4" },
    { o: 46, name: "\uD504\uB9B0\uD2B8\uBCA0\uC774\uCEE4\uB9AC", keyword: "\uD504\uB9B0\uD2B8\uBCA0\uC774\uCEE4\uB9AC", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uBE0C\uB79C\uB4DC\uBCC4" },
    { o: 47, name: "\uBA54\uC885\uB2E4\uB974", keyword: "\uBA54\uC885\uB2E4\uB974", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uBE0C\uB79C\uB4DC\uBCC4" },
    { o: 48, name: "\uC218\uD1A0", pno: "15815", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uBE0C\uB79C\uB4DC\uBCC4" },
    { o: 49, name: "\uC54C\uBCF4\uC6B0", keyword: "\uC54C\uBCF4\uC6B0", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uBE0C\uB79C\uB4DC\uBCC4" },
    { o: 50, name: "\uB098\uC784\uD3EC\uD130\uB9AC", keyword: "\uB098\uC784\uD3EC\uD130\uB9AC", section: "\uC120\uBB3C\uCD94\uCC9C \xB7 \uBE0C\uB79C\uB4DC\uBCC4" },
    // 추천 브랜드 (2026-07-29 재확인, 8명)
    { o: 51, name: "\uC804\uCCB4 \uBCF4\uAE30", cate: "230", section: "\uCD94\uCC9C \uBE0C\uB79C\uB4DC" },
    { o: 52, name: "\uBC1C\uB871 \uB4DC \uD30C\uB9AC", pno: "16915", section: "\uCD94\uCC9C \uBE0C\uB79C\uB4DC" },
    { o: 53, name: "\uC720\uC564\uC5B4\uC2A4", pno: "16899", section: "\uCD94\uCC9C \uBE0C\uB79C\uB4DC" },
    { o: 54, name: "\uB2E4\uBE44\uB370\uADF8\uB85C\uD53C", pno: "16229", section: "\uCD94\uCC9C \uBE0C\uB79C\uB4DC" },
    { o: 55, name: "\uBA54\uC885\uB2E4\uB974", pno: "15612", section: "\uCD94\uCC9C \uBE0C\uB79C\uB4DC" },
    { o: 56, name: "\uC624\uB4E0\uD06C\uB798\uD504\uD2B8", pno: "14239", section: "\uCD94\uCC9C \uBE0C\uB79C\uB4DC" },
    { o: 57, name: "\uD034\uBD80", pno: "14062", section: "\uCD94\uCC9C \uBE0C\uB79C\uB4DC" },
    { o: 58, name: "\uD50C\uB808\uC787\uD2B8", pno: "9840", section: "\uCD94\uCC9C \uBE0C\uB79C\uB4DC" },
    { o: 59, name: "\uAE40\uD558\uC724", pno: "7718", section: "\uCD94\uCC9C \uBE0C\uB79C\uB4DC" },
    // 프로모션 진입점 (개별 상품은 링크 형태가 아니라 번호 미확보)
    { o: 60, name: "\uD504\uB85C\uBAA8\uC158 (\uC804\uCCB4 \uCEA0\uD398\uC778)", promoPath: true, section: "\uD504\uB85C\uBAA8\uC158" },
    // LIFE 메인의 정렬 구좌 (GA4 에서 609&sort_method=6 / =5 확인)
    { o: 61, name: "\uC778\uAE30 \uC0C1\uD488", cate: "609", sort: "6", section: "\uC815\uB82C \uAD6C\uC88C" },
    { o: 62, name: "\uC2E0\uC0C1\uD488", cate: "609", sort: "5", section: "\uC815\uB82C \uAD6C\uC88C" },
    // [2026-09-14] GNB 상단 카테고리에 추가된 기획전 3개
    { o: 63, name: "\uCD94\uC11D \uC120\uBB3C \uC900\uBE44", cate: "994", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" },
    { o: 64, name: "ART WEEK", cate: "948", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" },
    { o: 65, name: "\uC870\uBA85&\uAC00\uAD6C", cate: "1034", section: "\uAE00\uB85C\uBC8C\uB124\uBE44" }
  ]
};
var SORT_LABEL = { "5": "\uC2E0\uC0C1\uD488\uC21C", "6": "\uC778\uAE30\uC21C", "8": "\uC870\uD68C\uC218\uC21C" };
async function buildSlotPerf(propertyId, token, ranges, exclRaw, autoExclLowEngagement) {
  let badPairs = [], badCampaigns = [];
  if (autoExclLowEngagement) {
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, ranges.after.start, ranges.after.end));
  }
  async function fetchTab(home, startDate, endDate) {
    const rows = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "pagePathPlusQueryString" }, { name: "pageReferrer" }],
      metrics: [{ name: "sessions" }, { name: "userEngagementDuration" }],
      dimensionFilter: andFilters(
        buildExclusionFilter(exclRaw, badPairs, badCampaigns),
        { filter: { fieldName: "pageReferrer", stringFilter: { matchType: "CONTAINS", value: home } } }
      ),
      limit: 1e4
    });
    const byP = {}, byC = {}, byCP = {}, byPromo = {}, byPath = {}, byKeyword = {}, byCS = {}, byCsortless = {};
    for (const r of rows) {
      const path = r.dimensionValues[0].value;
      const se = Number(r.metricValues[0].value), en = Number(r.metricValues[1].value);
      const pm = path.match(/product_no=(\d+)/);
      const cm = path.match(/(?:cate_no|category_no)=(\d+)/);
      if (pm) {
        byP[pm[1]] = byP[pm[1]] || { s: 0, e: 0 };
        byP[pm[1]].s += se;
        byP[pm[1]].e += en;
      }
      if (cm) {
        byC[cm[1]] = byC[cm[1]] || { s: 0, e: 0 };
        byC[cm[1]].s += se;
        byC[cm[1]].e += en;
        const smm = path.match(/sort_method=(\d+)/);
        if (smm) {
          const k = `${cm[1]}|${smm[1]}`;
          byCS[k] = byCS[k] || { s: 0, e: 0 };
          byCS[k].s += se;
          byCS[k].e += en;
        } else {
          byCsortless[cm[1]] = byCsortless[cm[1]] || { s: 0, e: 0 };
          byCsortless[cm[1]].s += se;
          byCsortless[cm[1]].e += en;
        }
      }
      if (pm && cm) {
        const c = cm[1], p = pm[1];
        byCP[c] = byCP[c] || {};
        byCP[c][p] = byCP[c][p] || { s: 0, e: 0 };
        byCP[c][p].s += se;
        byCP[c][p].e += en;
      }
      if (pm && path.includes("/promotion/detail.html")) {
        byPromo[pm[1]] = byPromo[pm[1]] || { s: 0, e: 0 };
        byPromo[pm[1]].s += se;
        byPromo[pm[1]].e += en;
      }
      const pathOnly = path.split("?")[0];
      byPath[pathOnly] = byPath[pathOnly] || { s: 0, e: 0 };
      byPath[pathOnly].s += se;
      byPath[pathOnly].e += en;
      const kwm = path.match(/keyword=([^&]+)/);
      if (kwm) {
        let kw;
        try {
          kw = decodeURIComponent(kwm[1]);
        } catch (e) {
          kw = kwm[1];
        }
        byKeyword[kw] = byKeyword[kw] || { s: 0, e: 0 };
        byKeyword[kw].s += se;
        byKeyword[kw].e += en;
      }
    }
    return { byP, byC, byCP, byPromo, byPath, byKeyword, byCS, byCsortless };
  }
  __name(fetchTab, "fetchTab");
  const sortedCatesOf = /* @__PURE__ */ __name((tab) => new Set((SLOT_MAP[tab] || []).filter((s) => s.sort).map((s) => s.cate)), "sortedCatesOf");
  const get = /* @__PURE__ */ __name((agg, slot, sortedCates) => {
    let v;
    if (slot.promoPath) v = Object.values(agg.byPromo).reduce((acc, x) => ({ s: acc.s + x.s, e: acc.e + x.e }), { s: 0, e: 0 });
    else if (slot.keyword) v = agg.byKeyword[slot.keyword];
    else if (slot.path) v = agg.byPath[slot.path];
    else if (slot.sort) v = agg.byCS[`${slot.cate}|${slot.sort}`];
    else if (slot.pno) v = agg.byP[slot.pno];
    else if (slot.cate) v = sortedCates && sortedCates.has(slot.cate) ? agg.byCsortless[slot.cate] : agg.byC[slot.cate];
    const s = v ? v.s : 0, e = v ? v.e : 0;
    return { sessions: s, dwell: s ? Math.round(e / s) : 0 };
  }, "get");
  const topProducts = /* @__PURE__ */ __name((agg, slot) => {
    if (slot.promoPath) {
      return Object.entries(agg.byPromo).map(([pno, v]) => ({ pno, sessions: v.s, dwell: v.s ? Math.round(v.e / v.s) : 0 })).sort((a, b) => b.sessions - a.sessions);
    }
    if (!slot.cate || !agg.byCP[slot.cate]) return [];
    return Object.entries(agg.byCP[slot.cate]).map(([pno, v]) => ({ pno, sessions: v.s, dwell: v.s ? Math.round(v.e / v.s) : 0 })).sort((a, b) => b.sessions - a.sessions);
  }, "topProducts");
  const out = {};
  for (const [tab, home] of [["art", "art.html"], ["life", "life.html"]]) {
    const B = await fetchTab(home, ranges.before.start, ranges.before.end);
    const A = await fetchTab(home, ranges.after.start, ranges.after.end);
    const SC = sortedCatesOf(tab);
    const totB = SLOT_MAP[tab].reduce((s, sl) => s + get(B, sl, SC).sessions, 0) || 1;
    const totA = SLOT_MAP[tab].reduce((s, sl) => s + get(A, sl, SC).sessions, 0) || 1;
    out[tab] = SLOT_MAP[tab].map((sl) => {
      const b = get(B, sl, SC), a = get(A, sl, SC);
      const nm = sl.sort ? `${sl.name} (${SORT_LABEL[sl.sort] || "sort_method=" + sl.sort})` : sl.name;
      return {
        order: sl.o,
        name: nm,
        section: sl.section,
        pno: sl.pno || null,
        cate: sl.cate || null,
        sort: sl.sort || null,
        staticName: nm,
        before: { sessions: b.sessions, share: b.sessions / totB * 100, dwell: b.dwell },
        after: { sessions: a.sessions, share: a.sessions / totA * 100, dwell: a.dwell },
        topProducts: topProducts(A, sl)
      };
    });
  }
  return out;
}
__name(buildSlotPerf, "buildSlotPerf");
async function buildDaily(propertyId, token, startDate, endDate, exclRaw, autoExclLowEngagement) {
  const excl = (exclRaw || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  let badPairs = [], badCampaigns = [];
  if (autoExclLowEngagement) {
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, startDate, endDate));
  }
  const campFilter = campaignOnlyFilter(badCampaigns);
  const badSet = new Set(badPairs);
  const isExcl = /* @__PURE__ */ __name((sm, country) => {
    if (excl.some((x) => (sm || "").toLowerCase().includes(x))) return true;
    if (country && badSet.size) {
      const key = `${(sm || "").toLowerCase()}||${country.toLowerCase()}`;
      if (badSet.has(key)) return true;
    }
    return false;
  }, "isExcl");
  const evRows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }, { name: "eventName" }, { name: "sessionSourceMedium" }, { name: "country" }],
    metrics: [{ name: "eventCount" }, { name: "sessions" }],
    ...campFilter ? { dimensionFilter: campFilter } : {},
    limit: 1e5
  });
  const byDate = {};
  const ensure = /* @__PURE__ */ __name((d) => byDate[d] || (byDate[d] = { date: d, sessions: 0, first_visit: 0, add_to_cart: 0, purchase: 0, view_detail: 0 }), "ensure");
  for (const r of evRows) {
    const d = r.dimensionValues[0].value, name = r.dimensionValues[1].value, sm = r.dimensionValues[2].value, country = r.dimensionValues[3].value;
    if (isExcl(sm, country)) continue;
    const o = ensure(d);
    if (name === "session_start") o.sessions += Number(r.metricValues[1].value);
    if (name === "first_visit") o.first_visit += Number(r.metricValues[0].value);
    if (name === "add_to_cart") o.add_to_cart += Number(r.metricValues[1].value);
    if (name === "purchase") o.purchase += Number(r.metricValues[1].value);
  }
  const pgRows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }, { name: "pagePath" }, { name: "sessionSourceMedium" }, { name: "country" }],
    metrics: [{ name: "screenPageViews" }],
    dimensionFilter: andFilters(campFilter, { filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: "/product/detail" } } }),
    limit: 1e5
  });
  for (const r of pgRows) {
    const d = r.dimensionValues[0].value, sm = r.dimensionValues[2].value, country = r.dimensionValues[3].value;
    if (isExcl(sm, country)) continue;
    ensure(d).view_detail += Number(r.metricValues[0].value);
  }
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}
__name(buildDaily, "buildDaily");
async function buildTopCountriesDetail(propertyId, token, startDate, endDate, topN) {
  const countryRows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "country" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: topN
  });
  const total = countryRows.reduce((s, r) => s + Number(r.metricValues[0].value), 0) || 1;
  const topCountries = countryRows.map((r) => ({
    country: r.dimensionValues[0].value,
    sessions: Number(r.metricValues[0].value),
    share: Number(r.metricValues[0].value) / total * 100
  }));
  const details = await Promise.all(topCountries.map(async (c) => {
    const rows = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "pagePath" }, { name: "sessionSourceMedium" }],
      metrics: [{ name: "sessions" }, { name: "screenPageViews" }, { name: "userEngagementDuration" }],
      dimensionFilter: { filter: { fieldName: "country", stringFilter: { matchType: "EXACT", value: c.country } } },
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10
    });
    const pages = rows.map((r) => ({
      path: r.dimensionValues[0].value,
      source: r.dimensionValues[1].value,
      sessions: Number(r.metricValues[0].value),
      pageviews: Number(r.metricValues[1].value),
      avgEngagementSec: Number(r.metricValues[0].value) ? Math.round(Number(r.metricValues[2].value) / Number(r.metricValues[0].value)) : 0
    }));
    return { ...c, pages };
  }));
  return details;
}
__name(buildTopCountriesDetail, "buildTopCountriesDetail");
async function buildCartAnalysis(propertyId, token, startDate, endDate, exclRaw, autoExclLowEngagement) {
  let badPairs = [], badCampaigns = [];
  if (autoExclLowEngagement) {
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, startDate, endDate));
  }
  const exclFilter = buildExclusionFilter(exclRaw, badPairs, badCampaigns);
  const evRows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "sessions" }, { name: "eventCount" }],
    ...exclFilter ? { dimensionFilter: exclFilter } : {},
    limit: 200
  });
  const ev = {};
  for (const r of evRows) {
    ev[r.dimensionValues[0].value] = {
      sessions: Number(r.metricValues[0].value),
      count: Number(r.metricValues[1].value)
    };
  }
  const E = /* @__PURE__ */ __name((n, f) => ev[n] ? ev[n][f] : 0, "E");
  const pgRows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "sessions" }, { name: "screenPageViews" }],
    ...exclFilter ? { dimensionFilter: exclFilter } : {},
    limit: 5e3
  });
  let basketSessions = 0, orderSessions = 0, basketViews = 0, orderViews = 0;
  let modalSessions = 0, modalViews = 0;
  for (const r of pgRows) {
    const p = (r.dimensionValues[0].value || "").toLowerCase();
    const se = Number(r.metricValues[0].value), vw = Number(r.metricValues[1].value);
    if (p.includes("basket-modal")) {
      modalSessions += se;
      modalViews += vw;
    } else if (/basket|cart/.test(p)) {
      basketSessions += se;
      basketViews += vw;
    } else if (/orderform|\/order\/order|checkout/.test(p)) {
      orderSessions += se;
      orderViews += vw;
    }
  }
  const orderPathFilter = { orGroup: { expressions: [
    { filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: "orderform", caseSensitive: false } } },
    { filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: "/order/order", caseSensitive: false } } },
    { filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: "checkout", caseSensitive: false } } }
  ] } };
  let entryViaCart = 0, entryViaModal = 0, entryDirect = 0, entryOther = 0;
  const otherAgg = {};
  try {
    const refRows = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "pagePath" }, { name: "pageReferrer" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: andFilters(exclFilter, orderPathFilter),
      limit: 1e4
    });
    for (const r of refRows) {
      const ref = (r.dimensionValues[1].value || "").toLowerCase();
      const se = Number(r.metricValues[0].value);
      if (ref.includes("basket-modal")) entryViaModal += se;
      else if (/\/order\/basket|\/cart/.test(ref)) entryViaCart += se;
      else if (/\/product\/detail|\/product\/list/.test(ref)) entryDirect += se;
      else {
        entryOther += se;
        const k = ref || "(\uC9C1\uC804 \uD398\uC774\uC9C0 \uC5C6\uC74C)";
        otherAgg[k] = (otherAgg[k] || 0) + se;
      }
    }
  } catch (e) {
    console.log("[\uC8FC\uBB38\uC11C \uC9C4\uC785\uACBD\uB85C] \uC870\uD68C \uC2E4\uD328: " + (e && e.message || e));
  }
  const entryTotal = entryViaCart + entryViaModal + entryDirect + entryOther;
  const entryOtherTop = Object.entries(otherAgg).map(([referrer, sessions]) => ({ referrer, sessions })).sort((a, b) => b.sessions - a.sessions).slice(0, 5);
  const addCart = E("add_to_cart", "sessions");
  const removeCart = E("remove_from_cart", "sessions");
  const purchase = E("purchase", "sessions");
  const addCartCnt = E("add_to_cart", "count");
  const removeCnt = E("remove_from_cart", "count");
  const cart = {
    addSessions: addCart,
    addEvents: addCartCnt,
    removeSessions: removeCart,
    removeEvents: removeCnt,
    purchaseSessions: purchase,
    // 담은 세션 중 구매까지 간 비율 / 이탈률
    convRate: addCart ? purchase / addCart * 100 : 0,
    abandonRate: addCart ? Math.max(0, addCart - purchase) / addCart * 100 : 0,
    abandonSessions: Math.max(0, addCart - purchase),
    // 담았다가 스스로 뺀 비율 (명시적 포기 신호)
    removeRate: addCartCnt ? removeCnt / addCartCnt * 100 : 0
  };
  const directEstimate = Math.max(0, orderSessions - basketSessions);
  const path = {
    basketSessions,
    orderSessions,
    basketViews,
    orderViews,
    // [2026-08-13 추가] 모달은 페이지 도달이 아니므로 퍼널 계산에는 쓰지 않고 참고값으로만 내려준다.
    modalSessions,
    modalViews,
    viaCartEstimate: Math.min(basketSessions, orderSessions),
    directEstimate,
    // [2026-09-14] referrer 기준 실측 분해. 위 directEstimate 보다 이 값을 쓸 것.
    entryViaCart,
    entryViaModal,
    entryDirect,
    entryOther,
    entryTotal,
    entryOtherTop,
    entryDirectShare: entryTotal ? entryDirect / entryTotal * 100 : 0,
    entryViaCartShare: entryTotal ? entryViaCart / entryTotal * 100 : 0,
    directShare: orderSessions ? directEstimate / orderSessions * 100 : 0,
    // 주문서 → 구매 (여기가 보통 가장 아까운 이탈)
    orderToBuyRate: orderSessions ? purchase / orderSessions * 100 : 0,
    orderDropSessions: Math.max(0, orderSessions - purchase)
  };
  return { cart, path };
}
__name(buildCartAnalysis, "buildCartAnalysis");
async function buildSegmentFunnel(propertyId, token, startDate, endDate, exclRaw, autoExclLowEngagement) {
  let badPairs = [], badCampaigns = [];
  if (autoExclLowEngagement) {
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, startDate, endDate));
  }
  const exclFilter = buildExclusionFilter(exclRaw, badPairs, badCampaigns);
  async function funnelBy(dimName) {
    const sessRows = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: dimName }],
      metrics: [{ name: "sessions" }],
      ...exclFilter ? { dimensionFilter: exclFilter } : {}
    });
    const evRows = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: dimName }, { name: "eventName" }],
      metrics: [{ name: "sessions" }, { name: "eventCount" }],
      ...exclFilter ? { dimensionFilter: exclFilter } : {},
      limit: 2e3
    });
    const bySeg = {};
    const ensure = /* @__PURE__ */ __name((k) => bySeg[k] || (bySeg[k] = { key: k, sessions: 0, view: 0, cart: 0, purchase: 0 }), "ensure");
    for (const r of sessRows) {
      ensure(r.dimensionValues[0].value).sessions += Number(r.metricValues[0].value);
    }
    for (const r of evRows) {
      const k = r.dimensionValues[0].value, ev = r.dimensionValues[1].value;
      const sess = Number(r.metricValues[0].value);
      const o = ensure(k);
      if (ev === "view_item") o.view += sess;
      else if (ev === "add_to_cart") o.cart += sess;
      else if (ev === "purchase") o.purchase += sess;
    }
    const isNoise = /* @__PURE__ */ __name((v) => !v || v === "(not set)", "isNoise");
    return Object.values(bySeg).filter((o) => !isNoise(o.key) && o.sessions > 0).map((o) => ({
      key: o.key,
      sessions: o.sessions,
      view: o.view,
      cart: o.cart,
      purchase: o.purchase,
      // 단계별 통과율
      viewRate: o.sessions ? o.view / o.sessions * 100 : 0,
      cartRate: o.view ? o.cart / o.view * 100 : 0,
      buyRate: o.cart ? o.purchase / o.cart * 100 : 0,
      // 전체 전환율(세션→구매)
      cvr: o.sessions ? o.purchase / o.sessions * 100 : 0
    })).sort((a, b) => b.sessions - a.sessions).slice(0, 12);
  }
  __name(funnelBy, "funnelBy");
  const [byNewReturning, byDevice, bySource] = await Promise.all([
    funnelBy("newVsReturning"),
    funnelBy("deviceCategory"),
    funnelBy("sessionSourceMedium")
  ]);
  const label = /* @__PURE__ */ __name((k) => k === "new" ? "\uC2E0\uADDC" : k === "returning" ? "\uC7AC\uBC29\uBB38" : k, "label");
  return {
    byNewReturning: byNewReturning.map((o) => ({ ...o, label: label(o.key) })),
    byDevice: byDevice.map((o) => ({ ...o, label: o.key })),
    bySource: bySource.map((o) => ({ ...o, label: o.key }))
  };
}
__name(buildSegmentFunnel, "buildSegmentFunnel");
async function buildUtmPerformance(propertyId, token, startDate, endDate, exclRaw, autoExclLowEngagement) {
  const excl = (exclRaw || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  let badPairs = [], badCampaigns = [];
  if (autoExclLowEngagement) {
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, startDate, endDate));
  }
  const campFilter = campaignOnlyFilter(badCampaigns);
  const badSet = new Set(badPairs);
  const isExcl = /* @__PURE__ */ __name((sm, country) => {
    if (excl.some((x) => (sm || "").toLowerCase().includes(x))) return true;
    if (country && badSet.size) {
      const key = `${(sm || "").toLowerCase()}||${country.toLowerCase()}`;
      if (badSet.has(key)) return true;
    }
    return false;
  }, "isExcl");
  const isNoise = /* @__PURE__ */ __name((v) => !v || v === "(not set)" || v === "(direct)", "isNoise");
  async function fetchRows(withRevenue) {
    const metrics = withRevenue ? [{ name: "sessions" }, { name: "ecommercePurchases" }, { name: "purchaseRevenue" }] : [{ name: "sessions" }];
    return await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "sessionCampaignName" }, { name: "sessionSourceMedium" }, { name: "country" }],
      metrics,
      ...campFilter ? { dimensionFilter: campFilter } : {},
      limit: 5e3
    });
  }
  __name(fetchRows, "fetchRows");
  let rows = [], hasRevenue = true;
  try {
    rows = await fetchRows(true);
  } catch (e) {
    console.log("[UTM] \uB9E4\uCD9C \uC9C0\uD45C \uC870\uD68C \uC2E4\uD328, \uC138\uC158\uB9CC\uC73C\uB85C \uC9C4\uD589: " + (e && e.message || e));
    hasRevenue = false;
    rows = await fetchRows(false);
  }
  const byCampaign = {}, bySourceMedium = {};
  const add = /* @__PURE__ */ __name((bucket, key, se, pu, rv) => {
    if (!bucket[key]) bucket[key] = { sessions: 0, purchases: 0, revenue: 0 };
    bucket[key].sessions += se;
    bucket[key].purchases += pu;
    bucket[key].revenue += rv;
  }, "add");
  for (const r of rows) {
    const camp = r.dimensionValues[0].value;
    const sm = r.dimensionValues[1].value;
    const country = r.dimensionValues[2].value;
    if (isExcl(sm, country)) continue;
    const se = Number(r.metricValues[0].value);
    const pu = hasRevenue ? Number(r.metricValues[1].value) : 0;
    const rv = hasRevenue ? Number(r.metricValues[2].value) : 0;
    if (!isNoise(camp)) add(byCampaign, camp, se, pu, rv);
    if (!isNoise(sm)) add(bySourceMedium, sm, se, pu, rv);
  }
  const toList = /* @__PURE__ */ __name((bucket) => Object.entries(bucket).map(([name, v]) => ({
    name,
    sessions: v.sessions,
    purchases: v.purchases,
    revenue: v.revenue,
    convRate: v.sessions ? v.purchases / v.sessions * 100 : 0,
    revPerSession: v.sessions ? v.revenue / v.sessions : 0
  })).sort((a, b) => b.sessions - a.sessions), "toList");
  const campaigns = toList(byCampaign).slice(0, 30);
  const sourceMediums = toList(bySourceMedium).slice(0, 30);
  const totals = campaigns.reduce((acc, c) => ({ sessions: acc.sessions + c.sessions, purchases: acc.purchases + c.purchases, revenue: acc.revenue + c.revenue }), { sessions: 0, purchases: 0, revenue: 0 });
  return { campaigns, sourceMediums, hasRevenue, totals, excludedCampaigns: badCampaigns };
}
__name(buildUtmPerformance, "buildUtmPerformance");
async function buildScrollDepth(propertyId, token, startDate, endDate, exclRaw, autoExclLowEngagement) {
  const excl = (exclRaw || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  let badPairs = [], badCampaigns = [];
  if (autoExclLowEngagement) {
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, startDate, endDate));
  }
  const campFilter = campaignOnlyFilter(badCampaigns);
  const badSet = new Set(badPairs);
  const isExcl = /* @__PURE__ */ __name((sm, country) => {
    if (excl.some((x) => (sm || "").toLowerCase().includes(x))) return true;
    if (country && badSet.size) {
      const key = `${(sm || "").toLowerCase()}||${country.toLowerCase()}`;
      if (badSet.has(key)) return true;
    }
    return false;
  }, "isExcl");
  const scrollRows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "pagePath" }, { name: "sessionSourceMedium" }, { name: "country" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: andFilters(campFilter, { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "scroll" } } }),
    limit: 5e3
  });
  const viewRows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "pagePath" }, { name: "sessionSourceMedium" }, { name: "country" }],
    metrics: [{ name: "screenPageViews" }],
    ...campFilter ? { dimensionFilter: campFilter } : {},
    limit: 5e3
  });
  const scrollBy = {}, viewBy = {};
  for (const r of scrollRows) {
    const path = r.dimensionValues[0].value, sm = r.dimensionValues[1].value, country = r.dimensionValues[2].value;
    if (isExcl(sm, country)) continue;
    scrollBy[path] = (scrollBy[path] || 0) + Number(r.metricValues[0].value);
  }
  for (const r of viewRows) {
    const path = r.dimensionValues[0].value, sm = r.dimensionValues[1].value, country = r.dimensionValues[2].value;
    if (isExcl(sm, country)) continue;
    viewBy[path] = (viewBy[path] || 0) + Number(r.metricValues[0].value);
  }
  const groupOf = /* @__PURE__ */ __name((p) => {
    if (/^\/(art|life)\.html/.test(p)) return "\uBA54\uC778 (art\xB7life)";
    if (/\/product\/detail/.test(p)) return "\uC0C1\uD488 \uC0C1\uC138";
    if (/\/promotion\/detail/.test(p)) return "\uD504\uB85C\uBAA8\uC158 \uC0C1\uC138";
    if (/\/product\/list/.test(p)) return "\uC0C1\uD488 \uBAA9\uB85D";
    if (/\/product\/search/.test(p)) return "\uAC80\uC0C9 \uACB0\uACFC";
    if (/\/artist\/detail/.test(p)) return "\uC544\uD2F0\uC2A4\uD2B8 \uC0C1\uC138";
    if (/\/board|\/exhibition|\/company/.test(p)) return "\uAE30\uD0C0 \uCF58\uD150\uCE20";
    return null;
  }, "groupOf");
  const agg = {};
  for (const p of Object.keys(viewBy)) {
    const g = groupOf(p);
    if (!g) continue;
    if (!agg[g]) agg[g] = { views: 0, scrolls: 0 };
    agg[g].views += viewBy[p];
    agg[g].scrolls += scrollBy[p] || 0;
  }
  const byPageGroup = Object.entries(agg).map(([name, v]) => ({
    name,
    views: v.views,
    scrolls: v.scrolls,
    rate: v.views ? v.scrolls / v.views * 100 : 0
  })).sort((a, b) => b.views - a.views);
  const totalViews = byPageGroup.reduce((x, g) => x + g.views, 0);
  const totalScrolls = byPageGroup.reduce((x, g) => x + g.scrolls, 0);
  return { byPageGroup, overall: { views: totalViews, scrolls: totalScrolls, rate: totalViews ? totalScrolls / totalViews * 100 : 0 } };
}
__name(buildScrollDepth, "buildScrollDepth");
var SEARCH_TERM_DIMS = ["searchTerm", "customEvent:search_term"];
var SEARCH_TERM_LIMIT = 50;
async function buildSearchTerms(propertyId, token, startDate, endDate, exclRaw, autoExclLowEngagement, limitRows) {
  const cap = limitRows == null ? SEARCH_TERM_LIMIT : limitRows;
  let badPairs = [], badCampaigns = [];
  if (autoExclLowEngagement) {
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, startDate, endDate));
  }
  const exclFilter = buildExclusionFilter(exclRaw, badPairs, badCampaigns);
  const eventFilter = { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "view_search_results" } } };
  for (const dim of SEARCH_TERM_DIMS) {
    let rows;
    try {
      rows = await runReport(propertyId, token, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: dim }, { name: "sessionSourceMedium" }],
        metrics: [{ name: "eventCount" }, { name: "activeUsers" }],
        dimensionFilter: andFilters(exclFilter, eventFilter),
        orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
        limit: 1e5
        // 전수 CSV 를 위해 넉넉히. 화면용은 아래에서 cap 으로 자른다.
      });
    } catch (e) {
      console.log(`[\uAC80\uC0C9\uC5B4] ${dim} \uC870\uD68C \uC2E4\uD328: ` + (e && e.message || e));
      continue;
    }
    // [2026-09-28] 광고가 검색 결과 페이지를 랜딩으로 쓰기 때문에, 내부 검색의 절반 이상이
    // 사용자가 친 검색이 아니라 광고가 만든 것이다(실측 51.8%). 둘을 섞으면 '많이 찾는 것' 이
    // 캠페인 편성에 따라 흔들려 상품 기획 신호로 못 쓴다. 그래서 소스별로 나눠 함께 내려준다.
    const bucketOf = (sm) => {
      const x = (sm || "").toLowerCase();
      return (x.includes("paid") || x.includes("cpc") || x.includes("ads")
           || x.includes("display") || x.includes("brandmessage")) ? "ad" : "real";
    };
    const acc = {};
    for (const r of rows) {
      const term = (r.dimensionValues[0].value || "").trim();
      if (!term || term === "(not set)" || term === "(other)") continue;
      const b = bucketOf(r.dimensionValues[1].value);
      const a = acc[term] || (acc[term] = { term, searches: 0, users: 0, ad: 0, real: 0 });
      const ev = Number(r.metricValues[0].value), us = Number(r.metricValues[1].value);
      a.searches += ev; a.users += us; a[b] += ev;
    }
    const all = Object.values(acc).sort((x, y) => y.searches - x.searches);
    if (!all.length) continue;
    const adRows = all.filter((x) => x.ad > 0)
      .map((x) => ({ term: x.term, searches: x.ad, users: x.users })).sort((x, y) => y.searches - x.searches);
    const realRows = all.filter((x) => x.real > 0)
      .map((x) => ({ term: x.term, searches: x.real, users: x.users })).sort((x, y) => y.searches - x.searches);
    const sum = (a) => a.reduce((t, b) => t + b.searches, 0);
    console.log(`[\uAC80\uC0C9\uC5B4] ${dim} \uC0AC\uC6A9 \xB7 \uACE0\uC720 ${all.length}\uAC1C \xB7 \uCD1D ${all.reduce((a, b) => a + b.searches, 0)}\uD68C`);
    return {
      dimUsed: dim,
      rows: all.slice(0, cap),
      uniqueTerms: all.length,
      totalSearches: all.reduce((a, b) => a + b.searches, 0),
      ad: { rows: adRows.slice(0, cap), uniqueTerms: adRows.length, totalSearches: sum(adRows) },
      real: { rows: realRows.slice(0, cap), uniqueTerms: realRows.length, totalSearches: sum(realRows) }
    };
  }
  return { dimUsed: null, rows: [], uniqueTerms: 0, totalSearches: 0,
           ad: { rows: [], uniqueTerms: 0, totalSearches: 0 },
           real: { rows: [], uniqueTerms: 0, totalSearches: 0 } };
}
__name(buildSearchTerms, "buildSearchTerms");
async function buildAcquisition(propertyId, token, startDate, endDate, exclRaw, autoExclLowEngagement) {
  const excl = (exclRaw || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  let badPairs = [], badCampaigns = [];
  if (autoExclLowEngagement) {
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, startDate, endDate));
  }
  const campFilter = campaignOnlyFilter(badCampaigns);
  const badSet = new Set(badPairs);
  const isExcl = /* @__PURE__ */ __name((sm, country) => {
    if (excl.some((x) => (sm || "").toLowerCase().includes(x))) return true;
    if (country && badSet.size) {
      const key = `${(sm || "").toLowerCase()}||${country.toLowerCase()}`;
      if (badSet.has(key)) return true;
    }
    return false;
  }, "isExcl");
  const srcRows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "sessionSourceMedium" }, { name: "country" }],
    metrics: [{ name: "sessions" }],
    ...campFilter ? { dimensionFilter: campFilter } : {},
    limit: 2e3
  });
  const srcAgg = {};
  let srcTotal = 0;
  for (const r of srcRows) {
    const sm = r.dimensionValues[0].value, country = r.dimensionValues[1].value, n = Number(r.metricValues[0].value);
    if (isExcl(sm, country)) continue;
    srcAgg[sm] = (srcAgg[sm] || 0) + n;
    srcTotal += n;
  }
  const bySource = Object.entries(srcAgg).map(([name, sessions]) => ({ name, sessions, share: srcTotal ? sessions / srcTotal * 100 : 0 })).sort((a, b) => b.sessions - a.sessions);
  const devRows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "deviceCategory" }, { name: "sessionSourceMedium" }, { name: "country" }],
    metrics: [{ name: "sessions" }],
    ...campFilter ? { dimensionFilter: campFilter } : {},
    limit: 3e3
  });
  const devAgg = {};
  let devTotal = 0;
  for (const r of devRows) {
    const dev = r.dimensionValues[0].value, sm = r.dimensionValues[1].value, country = r.dimensionValues[2].value, n = Number(r.metricValues[0].value);
    if (isExcl(sm, country)) continue;
    devAgg[dev] = (devAgg[dev] || 0) + n;
    devTotal += n;
  }
  const byDevice = Object.entries(devAgg).map(([name, sessions]) => ({ name, sessions, share: devTotal ? sessions / devTotal * 100 : 0 })).sort((a, b) => b.sessions - a.sessions);
  const countryRows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "country" }, { name: "sessionSourceMedium" }],
    metrics: [{ name: "sessions" }, { name: "userEngagementDuration" }],
    limit: 2e3
  });
  const countryAgg = {};
  let countryTotal = 0;
  for (const r of countryRows) {
    const country = r.dimensionValues[0].value, sm = r.dimensionValues[1].value;
    const n = Number(r.metricValues[0].value), eng = Number(r.metricValues[1].value);
    if (excl.some((x) => (sm || "").toLowerCase().includes(x))) continue;
    if (!countryAgg[country]) countryAgg[country] = { sessions: 0, engagement: 0 };
    countryAgg[country].sessions += n;
    countryAgg[country].engagement += eng;
    countryTotal += n;
  }
  const byCountry = Object.entries(countryAgg).map(([name, v]) => ({
    name,
    sessions: v.sessions,
    share: countryTotal ? v.sessions / countryTotal * 100 : 0,
    avgEngagementSec: v.sessions ? Math.round(v.engagement / v.sessions) : 0
  })).sort((a, b) => b.sessions - a.sessions).slice(0, 20);
  return { bySource: bySource.slice(0, 15), byDevice, byCountry };
}
__name(buildAcquisition, "buildAcquisition");
async function buildMonthlyUsers(propertyId, token, exclRaw, autoExclLowEngagement) {
  const kst = new Date(Date.now() + 9 * 3600 * 1e3);
  const end = new Date(kst);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - 12);
  start.setUTCDate(1);
  const fmtD = /* @__PURE__ */ __name((d) => d.toISOString().slice(0, 10), "fmtD");
  let badPairs = [], badCampaigns = [];
  if (autoExclLowEngagement) {
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, fmtD(start), fmtD(end)));
  }
  const exclFilter = buildExclusionFilter(exclRaw, badPairs, badCampaigns);
  const rows = await runReport(propertyId, token, {
    dateRanges: [{ startDate: fmtD(start), endDate: fmtD(end) }],
    dimensions: [{ name: "yearMonth" }],
    metrics: [{ name: "activeUsers" }],
    ...exclFilter ? { dimensionFilter: exclFilter } : {},
    orderBys: [{ dimension: { dimensionName: "yearMonth" } }]
  });
  return rows.map((r) => ({ month: r.dimensionValues[0].value, activeUsers: Number(r.metricValues[0].value) }));
}
__name(buildMonthlyUsers, "buildMonthlyUsers");
function buildExclusionFilter(exclRaw, badPairs, badCampaigns) {
  const excl = (exclRaw || "").split(",").map((x) => x.trim()).filter(Boolean);
  const ors = [];
  for (const x of excl) {
    ors.push({ filter: { fieldName: "sessionSourceMedium", stringFilter: { matchType: "CONTAINS", value: x, caseSensitive: false } } });
  }
  for (const pair of (badPairs || []).slice(0, 25)) {
    const [sm, country] = pair.split("||");
    ors.push({ andGroup: { expressions: [
      { filter: { fieldName: "sessionSourceMedium", stringFilter: { matchType: "EXACT", value: sm, caseSensitive: false } } },
      { filter: { fieldName: "country", stringFilter: { matchType: "EXACT", value: country, caseSensitive: false } } }
    ] } });
  }
  for (const camp of (badCampaigns || []).slice(0, 15)) {
    ors.push({ filter: { fieldName: "sessionCampaignName", stringFilter: { matchType: "EXACT", value: camp, caseSensitive: false } } });
  }
  if (!ors.length) return null;
  return { notExpression: { orGroup: { expressions: ors } } };
}
__name(buildExclusionFilter, "buildExclusionFilter");
function andFilters(a, b) {
  if (!a) return b || void 0;
  if (!b) return a;
  return { andGroup: { expressions: [a, b] } };
}
__name(andFilters, "andFilters");
function campaignOnlyFilter(badCampaigns) {
  if (!badCampaigns || !badCampaigns.length) return void 0;
  return buildExclusionFilter(null, [], badCampaigns);
}
__name(campaignOnlyFilter, "campaignOnlyFilter");
async function buildUserSegments(propertyId, token, startDate, endDate, exclRaw, autoExclLowEngagement) {
  let badPairs = [], badCampaigns = [];
  if (autoExclLowEngagement) {
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, startDate, endDate));
  }
  const exclFilter = buildExclusionFilter(exclRaw, badPairs, badCampaigns);
  async function behaviorByDim(dimName) {
    const rows = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: dimName }],
      metrics: [{ name: "sessions" }, { name: "engagementRate" }, { name: "averageSessionDuration" }],
      ...exclFilter ? { dimensionFilter: exclFilter } : {}
    });
    const purchRows = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: dimName }, { name: "eventName" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: andFilters(exclFilter, { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "purchase" } } })
    });
    return rows.map((r) => {
      const key = r.dimensionValues[0].value;
      const sessions = Number(r.metricValues[0].value);
      const engagementRate = Number(r.metricValues[1].value) * 100;
      const avgDuration = Math.round(Number(r.metricValues[2].value));
      const pr = purchRows.find((p) => p.dimensionValues[0].value === key);
      const purchSessions = pr ? Number(pr.metricValues[0].value) : 0;
      return { key, sessions, engagementRate, avgDuration, convRate: sessions ? purchSessions / sessions * 100 : 0 };
    }).sort((a, b) => b.sessions - a.sessions);
  }
  __name(behaviorByDim, "behaviorByDim");
  const nvrRaw = await behaviorByDim("newVsReturning");
  const isNoise = /* @__PURE__ */ __name((k) => !k || /^\(.*\)$/.test(k) || k === "(not set)", "isNoise");
  const byNewReturning = nvrRaw.filter((r) => !isNoise(r.key)).map((r) => ({ ...r, label: r.key === "new" ? "\uC2E0\uADDC" : r.key === "returning" ? "\uC7AC\uBC29\uBB38" : r.key }));
  const devRaw = await behaviorByDim("deviceCategory");
  const byDevice = devRaw.filter((r) => !isNoise(r.key)).map((r) => ({ ...r, label: r.key }));
  const txnRows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "transactionId" }],
    metrics: [{ name: "purchaseRevenue" }],
    ...exclFilter ? { dimensionFilter: exclFilter } : {},
    limit: 1e4
  });
  const tiers = [
    { label: "5\uB9CC\uC6D0 \uBBF8\uB9CC", min: 0, max: 5e4 },
    { label: "5~10\uB9CC\uC6D0", min: 5e4, max: 1e5 },
    { label: "10~30\uB9CC\uC6D0", min: 1e5, max: 3e5 },
    { label: "30~50\uB9CC\uC6D0", min: 3e5, max: 5e5 },
    { label: "50\uB9CC\uC6D0 \uC774\uC0C1", min: 5e5, max: Infinity }
  ];
  const byAmount = tiers.map((t) => ({ label: t.label, count: 0, revenue: 0 }));
  for (const r of txnRows) {
    const txnId = r.dimensionValues[0].value;
    if (!txnId || txnId === "(not set)") continue;
    const rev = Number(r.metricValues[0].value);
    if (!rev) continue;
    const idx = tiers.findIndex((t) => rev >= t.min && rev < t.max);
    if (idx >= 0) {
      byAmount[idx].count++;
      byAmount[idx].revenue += rev;
    }
  }
  return { byNewReturning, byDevice, byAmount };
}
__name(buildUserSegments, "buildUserSegments");
async function buildRetentionCohort(propertyId, token) {
  const kst = new Date(Date.now() + 9 * 3600 * 1e3);
  const end = new Date(kst);
  end.setUTCDate(end.getUTCDate() - 31);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  const fmtD = /* @__PURE__ */ __name((d) => d.toISOString().slice(0, 10), "fmtD");
  const body = {
    dimensions: [{ name: "cohort" }, { name: "cohortNthDay" }],
    metrics: [{ name: "cohortActiveUsers" }, { name: "cohortTotalUsers" }],
    cohortSpec: {
      cohorts: [{ dimension: "firstSessionDate", name: "cohort", dateRange: { startDate: fmtD(start), endDate: fmtD(end) } }],
      cohortsRange: { granularity: "DAILY", startOffset: 0, endOffset: 30 }
    }
  };
  const rows = await runReport(propertyId, token, body);
  const points = rows.map((r) => {
    const nthDay = Number(r.dimensionValues[1].value);
    const active = Number(r.metricValues[0].value);
    const total = Number(r.metricValues[1].value);
    return { day: nthDay, retention: total ? active / total * 100 : 0 };
  }).sort((a, b) => a.day - b.day);
  return points;
}
__name(buildRetentionCohort, "buildRetentionCohort");
async function buildActiveUsers(propertyId, token, autoExclLowEngagement, exclRaw) {
  const kst = new Date(Date.now() + 9 * 3600 * 1e3);
  const yesterday = new Date(kst);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const fmtD = /* @__PURE__ */ __name((d) => d.toISOString().slice(0, 10), "fmtD");
  const end = fmtD(yesterday);
  const shiftDays = /* @__PURE__ */ __name((base, n) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  }, "shiftDays");
  const daysAgo = /* @__PURE__ */ __name((n) => fmtD(shiftDays(yesterday, -(n - 1))), "daysAgo");
  let badPairs = [], badCampaigns = [];
  if (autoExclLowEngagement) {
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, daysAgo(28), end));
  }
  const campFilter = campaignOnlyFilter(badCampaigns);
  const badSet = new Set(badPairs);
  const excl = (exclRaw || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const isExcl = /* @__PURE__ */ __name((sm, country) => {
    if (excl.some((x) => (sm || "").toLowerCase().includes(x))) return true;
    if (country && badSet.size) {
      const key = `${(sm || "").toLowerCase()}||${country.toLowerCase()}`;
      if (badSet.has(key)) return true;
    }
    return false;
  }, "isExcl");
  async function activeUsersFor(startDate, endDate) {
    const rows = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      metrics: [{ name: "activeUsers" }],
      ...campFilter ? { dimensionFilter: campFilter } : {}
    });
    const raw = rows.length ? Number(rows[0].metricValues[0].value) : 0;
    if (!badPairs.length && !excl.length) return raw;
    const dimRows = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "sessionSourceMedium" }, { name: "country" }],
      metrics: [{ name: "activeUsers" }],
      ...campFilter ? { dimensionFilter: campFilter } : {},
      limit: 2e3
    });
    let bad = 0;
    for (const r of dimRows) {
      const sm = r.dimensionValues[0].value, country = r.dimensionValues[1].value;
      if (isExcl(sm, country)) bad += Number(r.metricValues[0].value);
    }
    return Math.max(0, raw - bad);
  }
  __name(activeUsersFor, "activeUsersFor");
  const dayBeforeYesterday = fmtD(shiftDays(yesterday, -1));
  const wauPrevEnd = fmtD(shiftDays(yesterday, -7));
  const wauPrevStart = fmtD(shiftDays(yesterday, -13));
  const mauPrevEnd = fmtD(shiftDays(yesterday, -28));
  const mauPrevStart = fmtD(shiftDays(yesterday, -55));
  const [dau, dauBefore, wau, wauBefore, mau, mauBefore] = await Promise.all([
    activeUsersFor(end, end),
    activeUsersFor(dayBeforeYesterday, dayBeforeYesterday),
    activeUsersFor(daysAgo(7), end),
    activeUsersFor(wauPrevStart, wauPrevEnd),
    activeUsersFor(daysAgo(28), end),
    activeUsersFor(mauPrevStart, mauPrevEnd)
  ]);
  const stickiness = mau ? dau / mau * 100 : 0;
  const stickinessBefore = mauBefore ? dauBefore / mauBefore * 100 : 0;
  return { referenceDate: end, dau, dauBefore, wau, wauBefore, mau, mauBefore, stickiness, stickinessBefore };
}
__name(buildActiveUsers, "buildActiveUsers");
async function buildEventList(propertyId, token, startDate, endDate) {
  const rows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    limit: 100
  });
  return rows.map((r) => ({ name: r.dimensionValues[0].value, count: Number(r.metricValues[0].value) }));
}
__name(buildEventList, "buildEventList");
function daysBetween(startDate, endDate) {
  const s = /* @__PURE__ */ new Date(startDate + "T00:00:00Z"), e = /* @__PURE__ */ new Date(endDate + "T00:00:00Z");
  return Math.max(1, Math.round((e - s) / 864e5) + 1);
}
__name(daysBetween, "daysBetween");
async function findLowEngagementSources(propertyId, token, startDate, endDate, maxAvgSec, minSessions) {
  const days = daysBetween(startDate, endDate);
  const minS = minSessions != null ? minSessions : Math.max(5, days * 2);
  const maxA = maxAvgSec != null ? maxAvgSec : 5;
  const rows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "sessionSourceMedium" }, { name: "country" }],
    metrics: [{ name: "sessions" }, { name: "userEngagementDuration" }]
  });
  const bad = [];
  for (const r of rows) {
    const sm = r.dimensionValues[0].value;
    const country = r.dimensionValues[1].value;
    const sessions = Number(r.metricValues[0].value);
    const eng = Number(r.metricValues[1].value);
    const avg = sessions ? eng / sessions : 0;
    if (sessions >= minS && avg < maxA) {
      bad.push({ key: `${sm.toLowerCase()}||${country.toLowerCase()}`, sessions });
    }
  }
  bad.sort((a, b) => b.sessions - a.sessions);
  return bad.slice(0, 200).map((x) => x.key);
}
__name(findLowEngagementSources, "findLowEngagementSources");
async function findLowEngagementCampaigns(propertyId, token, startDate, endDate) {
  const days = daysBetween(startDate, endDate);
  const minS = Math.max(5, days * 2);
  const rows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "sessionCampaignName" }],
    metrics: [{ name: "sessions" }, { name: "userEngagementDuration" }]
  });
  const bad = [];
  for (const r of rows) {
    const camp = r.dimensionValues[0].value;
    if (!camp || camp === "(not set)" || camp === "(direct)" || camp === "(organic)" || camp === "(referral)") continue;
    const sessions = Number(r.metricValues[0].value);
    const eng = Number(r.metricValues[1].value);
    const avg = sessions ? eng / sessions : 0;
    if (sessions >= minS && avg < 5) bad.push(camp);
  }
  return bad;
}
__name(findLowEngagementCampaigns, "findLowEngagementCampaigns");
async function findLowQualityTraffic(propertyId, token, startDate, endDate) {
  const [badPairs, badCampaigns] = await Promise.all([
    findLowEngagementSources(propertyId, token, startDate, endDate),
    findLowEngagementCampaigns(propertyId, token, startDate, endDate)
  ]);
  return { badPairs, badCampaigns };
}
__name(findLowQualityTraffic, "findLowQualityTraffic");
async function buildData(propertyId, token, ranges, exclRaw, autoExclLowEngagement) {
  const excl = (exclRaw || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  let badPairs = [], badCampaigns = [];
  if (autoExclLowEngagement) {
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, ranges.after.start, ranges.after.end));
  }
  const campFilter = campaignOnlyFilter(badCampaigns);
  const badSet = new Set(badPairs);
  const isExcl = /* @__PURE__ */ __name((sm, country) => {
    if (excl.some((x) => (sm || "").toLowerCase().includes(x))) return true;
    if (country && badSet.size) {
      const key = `${(sm || "").toLowerCase()}||${country.toLowerCase()}`;
      if (badSet.has(key)) return true;
    }
    return false;
  }, "isExcl");
  // [2026-09-22] 예전에는 '어느 쪽 기간인가(side)'로 메인 경로를 판정했다.
  //   before → "/" · "/main" · "/index"   (개편 전 메인)
  //   after  → "/art.html" · "/life.html" (개편 후 메인)
  // 개편 전후를 비교할 때는 맞지만, 최근 두 주를 비교하면 비교기간만 옛 경로로 세어
  // 방문이 통째로 어긋난다. 실제로 09-07~13 3,894 vs 09-14~20 7,491 (+92%) 이 나왔고,
  // 이걸 분모로 쓰는 상품조회·장바구니·가입·결제 전환율이 전부 틀어졌다(상품조회 288%).
  // 기간과 무관하게 옛 메인·새 메인을 모두 '메인'으로 센다. 합집합이라 이중 계상은 없다.
  const homeMatch = /* @__PURE__ */ __name((path) => {
    return path === "/" || path.startsWith("/main") || path.startsWith("/index") || path.startsWith("/art.html") || path.startsWith("/life.html");
  }, "homeMatch");
  const KW = [
    // [2026-08-03] 회원가입 완료 페이지 추가.
    // 신규가입자는 예전에 /admin/dashboard 의 '오늘 기준' 누적값을 자정 직전에
    // 스냅샷으로 훔쳐왔다. 실행이 밀리면 그날 값이 영구 손실되는 구조였다(8/1~8/2 누락).
    // 가입 완료 페이지의 조회수는 GA4 가 이미 자동으로 수집하고 있어, 날짜를 지정해
    // 언제든 다시 조회할 수 있다. 과거 구간도 채워진다.
    // ※ 'detail' 규칙의 '/product/' 보다 앞에 두어야 한다(먼저 매칭되는 것이 이긴다).
    ["joinDone", ["join_result", "join_end"]],
    // 회원가입 완료
    ["order", ["orderform", "/order/order", "checkout"]],
    // 결제(주문서)
    // [2026-08-13] 장바구니 모달을 장바구니 페이지와 분리.
    // 'basket' 규칙이 CONTAINS 매칭이라 /order/basket-modal.html 까지 잡아, 팝업 노출이
    // 장바구니 도달로 집계됐다. classify 는 먼저 매칭되는 것이 이기므로 반드시 위에 둔다.
    ["basketModal", ["basket-modal"]],
    // 장바구니 모달(팝업)
    ["basket", ["basket", "cart"]],
    // 장바구니 페이지
    ["search", ["search"]],
    // 검색
    // [2026-08-03 버그 수정] 예전 detail 규칙에 '/product/' 가 들어 있었다.
    // 이 조건이 /product/list.html 까지 잡아버려 상품목록이 상품상세로 분류됐고,
    // list 규칙은 뒤에 있어 절대 도달하지 못했다. 그 결과 상품조회 수가 부풀려져
    // 상품조회 전환율이 88.5% 같은 비현실적인 값으로 나왔다(거의 모든 세션이 '상품을 봤다').
    // 목록을 먼저 걸러낸 뒤 상세를 판정하도록 순서를 바꾸고, 넓은 '/product/' 조건을 제거한다.
    ["list", ["/product/list", "category", "goods/catalog"]],
    // 상품목록
    ["detail", ["/product/detail", "goods/view", "productview"]]
    // 상품상세
  ];
  const classify = /* @__PURE__ */ __name((path) => {
    const p = path.toLowerCase();
    for (const [key, kws] of KW) if (kws.some((k) => p.includes(k))) return key;
    return null;
  }, "classify");
  async function oneRange(startDate, endDate, side) {
    const [evRows, pgRows] = await Promise.all([
      runReport(propertyId, token, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "eventName" }, { name: "sessionSourceMedium" }, { name: "country" }],
        metrics: [{ name: "eventCount" }, { name: "sessions" }],
        ...campFilter ? { dimensionFilter: campFilter } : {},
        limit: 1e5
      }),
      runReport(propertyId, token, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "pagePath" }, { name: "sessionSourceMedium" }, { name: "country" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "sessions" }],
        ...campFilter ? { dimensionFilter: campFilter } : {},
        limit: 1e5
      })
    ]);
    const evc = {}, evs = {};
    let ss = 0;
    for (const r of evRows) {
      const name = r.dimensionValues[0].value, sm = r.dimensionValues[1].value, country = r.dimensionValues[2].value;
      if (isExcl(sm, country)) continue;
      evc[name] = (evc[name] || 0) + Number(r.metricValues[0].value);
      evs[name] = (evs[name] || 0) + Number(r.metricValues[1].value);
      if (name === "session_start") ss += Number(r.metricValues[1].value);
    }
    const pgc = {};
    const add = /* @__PURE__ */ __name((key, v, u, se) => {
      if (!key) return;
      pgc[key] ??= { views: 0, users: 0, sessions: 0 };
      pgc[key].views += v;
      pgc[key].users += u;
      pgc[key].sessions += se;
    }, "add");
    for (const r of pgRows) {
      const path = r.dimensionValues[0].value, sm = r.dimensionValues[1].value, country = r.dimensionValues[2].value;
      if (isExcl(sm, country)) continue;
      const v = Number(r.metricValues[0].value), u = Number(r.metricValues[1].value), se = Number(r.metricValues[2].value);
      if (homeMatch(path)) {
        add("home", v, u, se);
        continue;
      }
      add(classify(path), v, u, se);
    }
    return { evc, evs, ss, pgc };
  }
  __name(oneRange, "oneRange");
  async function standardMetrics(startDate, endDate) {
    const exclFilter = buildExclusionFilter(exclRaw, badPairs, badCampaigns);
    const [overall, nvr, purchaserRows] = await Promise.all([
      runReport(propertyId, token, {
        dateRanges: [{ startDate, endDate }],
        metrics: [{ name: "engagementRate" }, { name: "averageSessionDuration" }, { name: "screenPageViewsPerSession" }, { name: "totalUsers" }],
        ...exclFilter ? { dimensionFilter: exclFilter } : {}
      }),
      // 재방문자 비율(%)은 신규/재방문 나눈 비율이라 중복 집계 걱정 없이 그대로 사용 가능
      runReport(propertyId, token, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "newVsReturning" }],
        metrics: [{ name: "totalUsers" }],
        ...exclFilter ? { dimensionFilter: exclFilter } : {}
      }),
      // 실제 구매한 고유 사용자 수 (ARPPU 분모용). purchase 이벤트를 일으킨 사용자만.
      // [2026-08-13] 예전엔 제외 필터가 아예 없어 봇까지 포함됐다.
      runReport(propertyId, token, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "totalUsers" }],
        dimensionFilter: andFilters(exclFilter, { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "purchase" } } })
      })
    ]);
    const row = overall[0]?.metricValues || [];
    const engagementRate = row[0] ? Number(row[0].value) : 0;
    const avgSessionDuration = row[1] ? Number(row[1].value) : 0;
    const pageViewsPerSession = row[2] ? Number(row[2].value) : 0;
    const totalUsers = row[3] ? Number(row[3].value) : 0;
    let newUsers = 0, returningUsers = 0;
    for (const r of nvr) {
      const key = r.dimensionValues[0].value, n = Number(r.metricValues[0].value);
      if (key === "new") newUsers = n;
      else if (key === "returning") returningUsers = n;
    }
    const totalNvr = newUsers + returningUsers;
    const returningShare = totalNvr ? returningUsers / totalNvr * 100 : 0;
    const purchasers = purchaserRows.length ? Number(purchaserRows[0].metricValues[0].value) : 0;
    return { engagementRate, avgSessionDuration, pageViewsPerSession, totalUsers, newUsers, returningUsers, returningShare, purchasers };
  }
  __name(standardMetrics, "standardMetrics");
  async function sessionsInRange(startDate, endDate) {
    const hasExcl = exclRaw && exclRaw.trim() || badPairs.length;
    const [overall, rows] = await Promise.all([
      runReport(propertyId, token, {
        dateRanges: [{ startDate, endDate }],
        metrics: [{ name: "sessions" }],
        ...campFilter ? { dimensionFilter: campFilter } : {}
      }),
      hasExcl ? runReport(propertyId, token, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionSourceMedium" }, { name: "country" }],
        metrics: [{ name: "sessions" }],
        ...campFilter ? { dimensionFilter: campFilter } : {},
        limit: 5e3
      }) : Promise.resolve([])
    ]);
    const total = overall.length ? Number(overall[0].metricValues[0].value) : 0;
    if (!hasExcl) return total;
    let bad = 0;
    for (const r of rows) {
      const sm = r.dimensionValues[0].value, country = r.dimensionValues[1].value;
      if (isExcl(sm, country)) bad += Number(r.metricValues[0].value);
    }
    return Math.max(0, total - bad);
  }
  __name(sessionsInRange, "sessionsInRange");
  const [B, A, SB, SA, ssB, ssA] = await Promise.all([
    oneRange(ranges.before.start, ranges.before.end, "before"),
    oneRange(ranges.after.start, ranges.after.end, "after"),
    standardMetrics(ranges.before.start, ranges.before.end),
    standardMetrics(ranges.after.start, ranges.after.end),
    sessionsInRange(ranges.before.start, ranges.before.end),
    sessionsInRange(ranges.after.start, ranges.after.end)
  ]);
  const E = /* @__PURE__ */ __name((o, n) => o.evc[n] || 0, "E");
  const ES = /* @__PURE__ */ __name((o, n) => o.evs?.[n] || 0, "ES");
  const P = /* @__PURE__ */ __name((o, key, f) => o.pgc[key]?.[f] ?? 0, "P");
  const rate = /* @__PURE__ */ __name((num, den) => den ? num / den * 100 : 0, "rate");
  return {
    periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`,
    periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    excluded: excl,
    usersInRange: {
      before: SB.totalUsers,
      after: SA.totalUsers
    },
    purchasersInRange: {
      before: SB.purchasers,
      after: SA.purchasers
    },
    // AARRR 프레임워크 기준 그룹 태그(group)를 붙여 프론트에서 섹션별로 묶어 표시
    kpis: [
      { label: "\uC138\uC158(\uBC29\uBB38)", group: "acquisition", before: ssB, after: ssA, unit: "count" },
      { label: "\uC2E0\uADDC \uBC29\uBB38\uC790", group: "acquisition", before: E(B, "first_visit"), after: E(A, "first_visit"), unit: "count" },
      { label: "\uC0C1\uD488\uC870\uD68C \uC804\uD658\uC728", group: "activation", before: rate(P(B, "detail", "sessions"), ssB), after: rate(P(A, "detail", "sessions"), ssA), unit: "percent" },
      { label: "\uC7A5\uBC14\uAD6C\uB2C8 \uC804\uD658\uC728", group: "activation", before: rate(ES(B, "add_to_cart"), ssB), after: rate(ES(A, "add_to_cart"), ssA), unit: "percent" },
      // 신규 가입 = 가입 완료 페이지에 도달한 세션 수.
      // 그룹은 '획득' — 가입은 사이트에 발을 들이는 행동이다.
      // (활성화는 들어와서 상품을 보고 담는 단계라 성격이 다르다)
      // 조회수(views)가 아니라 세션 수를 쓰는 이유: 완료 페이지를 새로고침하면 조회수가
      // 늘지만 가입은 한 번이다. 세션 기준이면 중복이 걸러진다.
      { label: "\uC2E0\uADDC \uAC00\uC785", group: "acquisition", before: P(B, "joinDone", "sessions"), after: P(A, "joinDone", "sessions"), unit: "count" },
      { label: "\uAC00\uC785 \uC804\uD658\uC728", group: "acquisition", before: rate(P(B, "joinDone", "sessions"), ssB), after: rate(P(A, "joinDone", "sessions"), ssA), unit: "percent" },
      { label: "\uCC38\uC5EC\uC728", group: "retention", before: SB.engagementRate * 100, after: SA.engagementRate * 100, unit: "percent" },
      { label: "\uD3C9\uADE0 \uC138\uC158 \uC2DC\uAC04", group: "retention", before: SB.avgSessionDuration, after: SA.avgSessionDuration, unit: "duration" },
      { label: "\uC138\uC158\uB2F9 \uD398\uC774\uC9C0\uBDF0", group: "retention", before: SB.pageViewsPerSession, after: SA.pageViewsPerSession, unit: "decimal" },
      { label: "\uC7AC\uBC29\uBB38\uC790 \uBE44\uC728", group: "retention", before: SB.returningShare, after: SA.returningShare, unit: "percent" },
      { label: "\uACB0\uC81C\uC804\uD658\uC728", group: "revenue", before: rate(ES(B, "purchase"), ssB), after: rate(ES(A, "purchase"), ssA), unit: "percent" },
      { label: "\uAD6C\uB9E4 \uAC74\uC218", group: "revenue", before: E(B, "purchase"), after: E(A, "purchase"), unit: "count" }
    ],
    // [2026-07-30 단위 통일] 퍼널 5단계를 전부 "세션 수"로 통일.
    // 예전엔 세션→페이지뷰→이벤트횟수→페이지뷰→이벤트횟수 가 섞여 있어서 통과율이
    // 단위가 다른 숫자끼리의 나눗셈이었음 (새로고침이 +1, 상품 5개 담으면 +5).
    // 이제 각 단계 = "그 단계에 도달한 세션 수" → 통과율·이탈률이 처음으로 정확해짐.
    // 숫자가 이전보다 작아지는 건 부정확했던 게 정확해진 것.
    funnel: [
      { name: "\uBC29\uBB38", before: ssB, after: ssA },
      { name: "\uC0C1\uD488\uC870\uD68C", before: P(B, "detail", "sessions"), after: P(A, "detail", "sessions") },
      { name: "\uC7A5\uBC14\uAD6C\uB2C8 \uB2F4\uAE30", before: ES(B, "add_to_cart"), after: ES(A, "add_to_cart") },
      { name: "\uACB0\uC81C(\uC8FC\uBB38\uC11C)", before: P(B, "order", "sessions"), after: P(A, "order", "sessions") },
      { name: "\uAD6C\uB9E4", before: ES(B, "purchase"), after: ES(A, "purchase") }
    ],
    pages: [
      { name: "\uBA54\uC778 (art \xB7 life)", icon: "home", metrics: [
        { label: "\uC870\uD68C\uC218", before: P(B, "home", "views"), after: P(A, "home", "views") },
        { label: "\uD65C\uC131 \uC0AC\uC6A9\uC790", before: P(B, "home", "users"), after: P(A, "home", "users") }
      ], note: "\uBA54\uC778 \uD398\uC774\uC9C0 \uBE44\uAD50: \uB9AC\uB274\uC5BC \uC804 \uAE30\uC874 \uBA54\uC778(/) \u2192 \uD6C4 \uC2E0\uADDC \uBA54\uC778(art\xB7life). \uAC19\uC740 \uBA54\uC778 \uC5ED\uD560\uB07C\uB9AC \uBE44\uAD50." },
      { name: "\uC0C1\uD488 \uBAA9\uB85D", icon: "grid", metrics: [
        { label: "\uC870\uD68C\uC218", before: P(B, "list", "views"), after: P(A, "list", "views") },
        { label: "\uD65C\uC131 \uC0AC\uC6A9\uC790", before: P(B, "list", "users"), after: P(A, "list", "users") }
      ], note: "\uC0C1\uD488 \uBAA9\uB85D \uD398\uC774\uC9C0 \uD2B8\uB798\uD53D." },
      { name: "\uC0C1\uD488 \uC0C1\uC138", icon: "tag", metrics: [
        { label: "\uC870\uD68C\uC218", before: P(B, "detail", "views"), after: P(A, "detail", "views") },
        { label: "\uD65C\uC131 \uC0AC\uC6A9\uC790", before: P(B, "detail", "users"), after: P(A, "detail", "users") }
      ], note: "\uC0C1\uD488 \uC0C1\uC138 \uC870\uD68C." },
      { name: "\uC0C1\uD488 \uAC80\uC0C9", icon: "search", metrics: [
        { label: "\uC870\uD68C\uC218", before: P(B, "search", "views"), after: P(A, "search", "views") },
        { label: "\uD65C\uC131 \uC0AC\uC6A9\uC790", before: P(B, "search", "users"), after: P(A, "search", "users") }
      ], note: "\uAC80\uC0C9 \uC0AC\uC6A9\uC790 \uC720\uC785." },
      { name: "\uC7A5\uBC14\uAD6C\uB2C8", icon: "cart", metrics: [
        { label: "\uC870\uD68C\uC218", before: P(B, "basket", "views"), after: P(A, "basket", "views") },
        { label: "\uD65C\uC131 \uC0AC\uC6A9\uC790", before: P(B, "basket", "users"), after: P(A, "basket", "users") }
      ], note: "\uC7A5\uBC14\uAD6C\uB2C8 \uD398\uC774\uC9C0(/order/basket.html) \uB3C4\uB2EC. \uBAA8\uB2EC\uC740 \uC544\uB798\uC5D0\uC11C \uB530\uB85C \uC9D1\uACC4." },
      { name: "\uC7A5\uBC14\uAD6C\uB2C8 \uBAA8\uB2EC", icon: "cart", metrics: [
        { label: "\uC870\uD68C\uC218", before: P(B, "basketModal", "views"), after: P(A, "basketModal", "views") },
        { label: "\uD65C\uC131 \uC0AC\uC6A9\uC790", before: P(B, "basketModal", "users"), after: P(A, "basketModal", "users") }
      ], note: "/order/basket-modal.html \u2014 \uD398\uC774\uC9C0 \uC774\uB3D9\uC774 \uC544\uB2C8\uB77C \uD31D\uC5C5\uC774\uB77C \uC7A5\uBC14\uAD6C\uB2C8 \uB3C4\uB2EC\uB85C \uBCF4\uBA74 \uC548 \uB429\uB2C8\uB2E4. 2026-06 \uC5D0\uB294 \uC774 \uAC12\uC774 \uC7A5\uBC14\uAD6C\uB2C8\uC5D0 \uD569\uC0B0\uB3FC \uC138\uC158\uC758 4.7\uBC30\uB85C \uC7A1\uD614\uC2B5\uB2C8\uB2E4." },
      { name: "\uC8FC\uBB38\uC11C(\uACB0\uC81C)", icon: "card", metrics: [
        { label: "\uC870\uD68C\uC218", before: P(B, "order", "views"), after: P(A, "order", "views") },
        { label: "\uD65C\uC131 \uC0AC\uC6A9\uC790", before: P(B, "order", "users"), after: P(A, "order", "users") }
      ], note: "\uACB0\uC81C \uB2E8\uACC4 \uB3C4\uB2EC." }
    ]
  };
}
__name(buildData, "buildData");
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
