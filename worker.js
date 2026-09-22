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
var worker_default = {
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
      const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const keyOk = !!env.DASHBOARD_KEY && safeEqual(q.get("key") || "", env.DASHBOARD_KEY);
      const tokOk = !keyOk && await verifyToken(env, bearer || q.get("t") || "");
      if (!keyOk && !tokOk) {
        return json({ error: "\uC811\uADFC \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, 403);
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
      const cacheKeyParts = ["bs", "be", "as", "ae", "tab", "excl", "autoExclLowEngagement", "cmp", "country", "paths", "vers", "client", "blen", "from", "to", "format", "anchorDate", "anchorTotal"].map((k) => `${k}=${q.get(k) || ""}`).join("&");
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
      if (q.get("tab") === "probecustomers") {
        const tok = await getCafe24AccessToken(env);
        if (!tok) return json({ error: "cafe24 \uC778\uC99D \uC2E4\uD328" }, 200);
        const mallId = env.CAFE24_MALL_ID;
        const cases = [];
        const probePaths = (q.get("paths") || "customers/count|customers?limit=1").split("|").filter(Boolean).slice(0, 12);
        const probeVers = q.get("vers") ? q.get("vers").split(",").map((v) => v === "-" ? null : v) : [null, CAFE24_ADMIN_VERSION];
        for (const path of probePaths) {
          for (const ver of probeVers) {
            cases.push([path, ver]);
          }
        }
        const out = [];
        for (const [path, ver] of cases) {
          const h = { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };
          if (ver) h["X-Cafe24-Api-Version"] = ver;
          // client=front|admin 이면 프론트(스토어프론트) API 방식으로 부른다 — 관리자 스코프 없이 되는지 보려는 것.
          const cl = q.get("client");
          if (cl) {
            delete h.Authorization;
            h["X-Cafe24-Client-Id"] = cl === "front" ? env.CAFE24_FRONT_KEY : env.CAFE24_ADMIN_CLIENT_ID;
          }
          try {
            const r = await fetch(`https://${mallId}.cafe24api.com/api/v2/admin/${path}`, { headers: h });
            out.push({ path, ver: ver || "(\uC5C6\uC74C)", status: r.status, body: (await r.text()).slice(0, Number(q.get("blen") || 180) || 180) });
          } catch (e) {
            out.push({ path, ver: ver || "(\uC5C6\uC74C)", status: "throw", body: String(e && e.message || e) });
          }
        }
        let negotiated = null;
        try {
          const j = await cafe24Get(mallId, tok, "customers/count");
          negotiated = { ok: true, version: CAFE24_ADMIN_VERSION, body: JSON.stringify(j).slice(0, 180) };
        } catch (e) {
          negotiated = { ok: false, version: CAFE24_ADMIN_VERSION, body: String(e && e.message || e).slice(0, 250) };
        }
        return json({ scopes: LAST_TOKEN_SCOPES, negotiated, cases: out }, 200);
      }
      if (q.get("tab") === "catnames") {
        return jsonCached({ axis: await resolveCategoryAxis(env) }, 200);
      }
      if (q.get("tab") === "slotfunnel") {
        // [2026-09-22] 구좌 성과를 '클릭 세션'이 아니라 '구매까지 떨어진 수'로 본다.
        // GA4 에 view_item_list / select_item 이 없어서(측정 안 함) 아이템리스트 귀속은 못 쓴다.
        // 대신 퍼널 리포트 API(v1alpha)로 "그 구좌 페이지를 본 사용자" 를 1단계로 놓고
        // 상품조회 → 담기 → 구매 까지 이어지는 수를 센다. 구좌당 한 번씩 호출한다.
        const paths = (q.get("paths") || "").split("|").filter(Boolean).slice(0, 14);
        if (!paths.length) return json({ error: "paths 가 필요합니다" }, 400);
        const out = [];
        for (const p of paths) {
          try {
            out.push({ path: p, steps: await runFunnel(propertyId, token, ranges.after.start, ranges.after.end, p) });
          } catch (e) {
            out.push({ path: p, error: String(e && e.message || e).slice(0, 200) });
          }
        }
        return jsonCached({ period: `${ranges.after.start} ~ ${ranges.after.end}`, slots: out }, 200);
      }
      if (q.get("tab") === "membercount") {
        try {
          const mc = await buildMemberCounts(
            env,
            ranges.after.start,
            ranges.after.end,
            q.get("anchorDate"),
            q.get("anchorTotal") ? Number(q.get("anchorTotal")) : null
          );
          if (mc.error) return json({ error: mc.error, detail: mc.detail || null }, 200);
          return jsonCached(mc, 200);
        } catch (e) {
          return json({
            error: "\uD68C\uC6D0 \uC218 \uC870\uD68C \uC2E4\uD328: " + String(e && e.message || e),
            stack: String(e && e.stack || "").slice(0, 500)
          }, 200);
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
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
  });
}
__name(json, "json");
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1e3);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
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
var CUSTOMER_END_DATE_PARAMS = ["created_end_date", "end_date", "join_date_end"];
var MEMBER_PARAM_KEY = "customerCountParam:v1";
var MEMBER_MAX_POINTS = 31;
var CUSTOMER_VER_CANDIDATES = [null, "2026-03-01", "2025-09-01", "2024-06-01"];
var MEMBER_VER_KEY = "customerCountVer:v1";
var CUSTOMER_API_VERSION;
function customerCountRaw(mallId, tok, qs, ver) {
  const h = { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };
  if (ver) h["X-Cafe24-Api-Version"] = ver;
  return fetch(`https://${mallId}.cafe24api.com/api/v2/admin/customers/count${qs || ""}`, { headers: h });
}
__name(customerCountRaw, "customerCountRaw");
async function resolveCustomerApiVersion(env, mallId, tok) {
  if (CUSTOMER_API_VERSION !== void 0) return CUSTOMER_API_VERSION;
  const kv = env.CAFE24_TOKEN_KV;
  if (kv) {
    try {
      const c = await kv.get(MEMBER_VER_KEY);
      if (c) {
        CUSTOMER_API_VERSION = c === "-" ? null : c;
        return CUSTOMER_API_VERSION;
      }
    } catch (e) {
    }
  }
  for (const ver of CUSTOMER_VER_CANDIDATES) {
    const r = await customerCountRaw(mallId, tok, "", ver);
    console.log(`[\uD68C\uC6D0\uC218] \uBC84\uC804\uD0D0\uC0C9 ${ver || "(\uD5E4\uB354\uC5C6\uC74C)"} \u2192 ${r.status} ${r.ok ? "" : (await r.text()).slice(0, 160)}`);
    if (r.ok) {
      CUSTOMER_API_VERSION = ver;
      if (kv) {
        try {
          await kv.put(MEMBER_VER_KEY, ver || "-", { expirationTtl: 60 * 60 * 24 * 30 });
        } catch (e) {
        }
      }
      return ver;
    }
  }
  return void 0;
}
__name(resolveCustomerApiVersion, "resolveCustomerApiVersion");
async function cafe24CustomerCount(env, mallId, tok, qs) {
  const ver = await resolveCustomerApiVersion(env, mallId, tok);
  if (ver === void 0) return null;
  const r = await customerCountRaw(mallId, tok, qs, ver);
  if (!r.ok) {
    console.log(`[\uD68C\uC6D0\uC218] count \uC2E4\uD328 status=${r.status} ver=${ver || "(\uD5E4\uB354\uC5C6\uC74C)"} qs=${qs} body=${(await r.text()).slice(0, 200)}`);
    return null;
  }
  const j = await r.json();
  return j && j.count != null ? Number(j.count) : null;
}
__name(cafe24CustomerCount, "cafe24CustomerCount");
async function resolveCustomerCountParam(env, mallId, tok) {
  const kv = env.CAFE24_TOKEN_KV;
  if (kv) {
    try {
      const cached = await kv.get(MEMBER_PARAM_KEY);
      if (cached) return { param: cached, cached: true };
    } catch (e) {
    }
  }
  const total = await cafe24CustomerCount(env, mallId, tok, "");
  if (total == null) return { error: "count \uC5D4\uB4DC\uD3EC\uC778\uD2B8 \uD638\uCD9C \uC2E4\uD328 (scope mall.read_customer \uD655\uC778)" };
  for (const p of CUSTOMER_END_DATE_PARAMS) {
    const old = await cafe24CustomerCount(env, mallId, tok, `?${p}=2020-01-01`);
    if (old == null) continue;
    if (old < total) {
      if (kv) {
        try {
          await kv.put(MEMBER_PARAM_KEY, p, { expirationTtl: 60 * 60 * 24 * 30 });
        } catch (e) {
        }
      }
      return { param: p, total };
    }
    console.log(`[\uD68C\uC6D0\uC218] ${p}: \uC804\uCCB4\uC640 \uB3D9\uC77C(${old}) \u2192 \uBB34\uC2DC\uB418\uB294 \uD30C\uB77C\uBBF8\uD130`);
  }
  return { error: "\uAC00\uC785\uC77C \uC0C1\uD55C \uD30C\uB77C\uBBF8\uD130\uB97C \uCC3E\uC9C0 \uBABB\uD588\uB2E4", detail: `\uC804\uCCB4 ${total}\uBA85 \uAE30\uC900\uC73C\uB85C \uD6C4\uBCF4\uAC00 \uBAA8\uB450 \uBB34\uC2DC\uB428` };
}
__name(resolveCustomerCountParam, "resolveCustomerCountParam");
function memberDateRange(startDate, endDate, maxPoints) {
  const out = [];
  const s = Date.parse(startDate + "T00:00:00Z"), e = Date.parse(endDate + "T00:00:00Z");
  if (!(s <= e)) return out;
  const days = Math.round((e - s) / 864e5) + 1;
  const step = Math.max(1, Math.ceil(days / maxPoints));
  for (let i = 0; i < days; i += step) out.push(new Date(s + i * 864e5).toISOString().slice(0, 10));
  if (out[out.length - 1] !== endDate) out.push(endDate);
  return out;
}
__name(memberDateRange, "memberDateRange");
async function buildMemberCounts(env, startDate, endDate, anchorDate, anchorTotal) {
  const tok = await getCafe24AccessToken(env);
  if (!tok) return { error: "cafe24 \uC778\uC99D \uC2E4\uD328 (Gist/\uD1A0\uD070 \uD655\uC778)" };
  const mallId = env.CAFE24_MALL_ID;
  const resolved = await resolveCustomerCountParam(env, mallId, tok);
  if (resolved.error) return resolved;
  const P = resolved.param;
  const points = [];
  for (const d of memberDateRange(startDate, endDate, MEMBER_MAX_POINTS)) {
    const n = await cafe24CustomerCount(env, mallId, tok, `?${P}=${d}`);
    if (n != null) points.push({ date: d, total: n });
  }
  if (!points.length) return { error: "\uD68C\uC6D0 \uC218\uB97C \uD55C \uAC74\uB3C4 \uBABB \uC77D\uC5C8\uB2E4" };
  let anchor = null;
  if (anchorDate && anchorTotal) {
    const calc = await cafe24CustomerCount(env, mallId, tok, `?${P}=${anchorDate}`);
    if (calc != null) {
      const diffPct = anchorTotal ? (calc - anchorTotal) / anchorTotal * 100 : 0;
      anchor = {
        date: anchorDate,
        actual: anchorTotal,
        calculated: calc,
        diff: calc - anchorTotal,
        diffPct,
        reliable: Math.abs(diffPct) <= 1
      };
    }
  }
  return {
    dimUsed: P,
    paramCached: !!resolved.cached,
    points,
    anchor,
    estimated: true,
    note: "\uD0C8\uD1F4 \uD68C\uC6D0\uC740 \uD604\uC7AC \uBAA9\uB85D\uC5D0\uC11C \uBE60\uC9C0\uBBC0\uB85C \uACFC\uAC70\uB85C \uAC08\uC218\uB85D \uC2E4\uC81C\uBCF4\uB2E4 \uB0AE\uAC8C \uB098\uC635\uB2C8\uB2E4. anchor.diffPct \uB85C \uC624\uCC28\uB97C \uD655\uC778\uD558\uC138\uC694 (reliable=false \uBA74 \uC774 \uAC12\uC744 \uC9C0\uD45C\uB85C \uC4F0\uC9C0 \uB9C8\uC138\uC694)."
  };
}
__name(buildMemberCounts, "buildMemberCounts");
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
  const need = [...new Set(lines.filter((l) => !l.supplier && l.product_no != null).map((l) => String(l.product_no)))].filter((n) => bundle[n] === void 0);
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
  const suppliers = Object.values(agg).map((a) => ({
    code: a.code,
    qty: a.qty,
    amount: a.amount,
    canceledQty: a.canceledQty,
    canceledAmount: a.canceledAmount,
    orderCount: a.orders.size,
    productCount: a.products.size
  })).sort((x, y) => y.qty - x.qty);
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
// [2026-09-21] cate_no → 최상위 분류명(아트/라이프/…) 지도.
// 관리자 카테고리 API 는 스코프가 없어 403 이지만, 스토어프론트 API 는 client-id 만으로 열린다.
// 하루치 KV 캐시 — 카테고리는 자주 안 바뀌고, 400여 개라 4~5 서브요청이면 전부 받는다.
var CAT_AXIS_KEY = "catAxis:v1";
async function resolveCategoryAxis(env) {
  const kv = env.CAFE24_TOKEN_KV;
  if (kv) {
    try {
      const c = await kv.get(CAT_AXIS_KEY, { type: "json" });
      if (c) return c;
    } catch (e) {
    }
  }
  const mallId = env.CAFE24_MALL_ID;
  const h = { "X-Cafe24-Client-Id": env.CAFE24_ADMIN_CLIENT_ID, "Content-Type": "application/json" };
  const out = {};
  for (let off = 0; off < 1200; off += 100) {
    const r = await fetch(`https://${mallId}.cafe24api.com/api/v2/categories?limit=100&offset=${off}`, { headers: h });
    if (!r.ok) {
      console.log(`[카테고리축] 목록 실패 offset=${off} status=${r.status} body=${(await r.text()).slice(0, 200)}`);
      break;
    }
    const arr = (await r.json()).categories || [];
    for (const c of arr) {
      const top = (c.full_category_name || {})["1"];
      if (top) out[c.category_no] = top;
    }
    if (arr.length < 100) break;
  }
  if (kv && Object.keys(out).length) {
    try {
      await kv.put(CAT_AXIS_KEY, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 });
    } catch (e) {
    }
  }
  return out;
}
__name(resolveCategoryAxis, "resolveCategoryAxis");
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
        dimensions: [{ name: dim }],
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
    const all = rows.map((r) => ({
      term: (r.dimensionValues[0].value || "").trim(),
      searches: Number(r.metricValues[0].value),
      users: Number(r.metricValues[1].value)
    })).filter((x) => x.term && x.term !== "(not set)" && x.term !== "(other)");
    if (!all.length) continue;
    console.log(`[\uAC80\uC0C9\uC5B4] ${dim} \uC0AC\uC6A9 \xB7 \uACE0\uC720 ${all.length}\uAC1C \xB7 \uCD1D ${all.reduce((a, b) => a + b.searches, 0)}\uD68C`);
    return {
      dimUsed: dim,
      rows: all.slice(0, cap),
      uniqueTerms: all.length,
      totalSearches: all.reduce((a, b) => a + b.searches, 0)
    };
  }
  return { dimUsed: null, rows: [], uniqueTerms: 0, totalSearches: 0 };
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
