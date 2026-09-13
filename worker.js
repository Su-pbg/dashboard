const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    try {
      const url = new URL(request.url);
      const q = url.searchParams;

      // 접근 열쇠 확인: 이 값을 모르면 데이터를 안 줌 (Cloudflare 시크릿 DASHBOARD_KEY로 관리, 없으면 기본값 사용)
      const expectedKey = env.DASHBOARD_KEY || 'pbg-secret-key-2026';
      if (q.get('key') !== expectedKey) {
        return json({ error: '접근 권한이 없습니다.' }, 403);
      }

      const ranges = {
        before: { start: q.get('bs'), end: q.get('be') },
        after:  { start: q.get('as'), end: q.get('ae') },
      };
      for (const k of ['bs', 'be', 'as', 'ae']) {
        if (!q.get(k)) return json({ error: `누락된 파라미터: ${k}` }, 400);
      }

      // ===== 응답 캐싱 =====
      // GA4 데이터는 하루 단위로만 바뀌므로, 같은 조건(기간·탭·필터)이면 KV에 저장해둔 응답을 그대로 준다.
      // → 두 번째 조회부터는 GA4를 안 부르니 훨씬 빠르고, API 호출 한도도 절약됨.
      // '새로고침' 버튼을 누르면 nocache=1 이 붙어서 캐시를 무시하고 새로 받아온다.
      const cacheKV = env.CAFE24_TOKEN_KV;
      const cacheKeyParts = ['bs','be','as','ae','tab','excl','autoExclLowEngagement','cmp','country']
        .map(k => `${k}=${q.get(k) || ''}`).join('&');
      // [2026-08-13] 위 두 수정으로 같은 조건이라도 결과가 달라진다. 예전 캐시가 그대로
      // 나가지 않도록 버전 태그를 붙인다(값을 올리면 전체 캐시가 자연 무효화됨).
      const cacheKey = 'resp:v2:' + cacheKeyParts;
      const bypassCache = q.get('nocache') === '1';
      // 오늘 날짜가 포함된 조회는 데이터가 계속 갱신되므로 짧게, 과거 구간만이면 길게 캐시
      const todayKst = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
      const touchesToday = (q.get('ae') || '') >= todayKst || (q.get('be') || '') >= todayKst;
      const ttl = touchesToday ? 300 : 1800; // 오늘 포함 5분 / 과거만 30분

      if (cacheKV && !bypassCache) {
        try {
          const hit = await cacheKV.get(cacheKey);
          if (hit) {
            return new Response(hit, { headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'X-Cache': 'HIT' } });
          }
        } catch (e) { /* 캐시 조회 실패하면 그냥 새로 계산 */ }
      }
      // 계산 결과를 캐시에 저장하고 응답 (json() 대신 이걸 쓰면 캐싱됨)
      const jsonCached = async (obj, status = 200) => {
        const body = JSON.stringify(obj);
        if (cacheKV && status === 200) {
          try { await cacheKV.put(cacheKey, body, { expirationTtl: ttl }); } catch (e) { /* 저장 실패는 무시 */ }
        }
        return new Response(body, { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'X-Cache': 'MISS' } });
      };

      const sa = JSON.parse(env.GA_SA_KEY);

      // property ID는 비밀이 아니므로 코드에 직접 지정 (시크릿 미인식 문제 우회).
      // env 값이 있으면 그걸 쓰고, 없으면 아래 기본값 사용.
      const propertyId = (env.GA4_PROPERTY_ID && String(env.GA4_PROPERTY_ID).trim()) || '333394141';
      const token = await getAccessToken(sa);

      if (q.get('tab') === 'monthlyusers') {
        const monthly = await buildMonthlyUsers(propertyId, token, q.get('excl'), q.get('autoExclLowEngagement') === '1');
        return jsonCached({ monthly }, 200);
      }
      if (q.get('tab') === 'usersegments') {
        const wantCmp = q.get('cmp') === '1';
        const segments = await buildUserSegments(propertyId, token, ranges.after.start, ranges.after.end, q.get('excl'), q.get('autoExclLowEngagement') === '1');
        const segmentsBefore = wantCmp
          ? await buildUserSegments(propertyId, token, ranges.before.start, ranges.before.end, q.get('excl'), q.get('autoExclLowEngagement') === '1')
          : null;
        return jsonCached({ periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`,
                      periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`, segments, segmentsBefore }, 200);
      }
      if (q.get('tab') === 'firstsource') {
        // [2026-08-13] 획득 채널 기준 기여도.
        // sessionSourceMedium(마지막 클릭)만 보면, 광고로 처음 데려온 고객이 나중에
        // 직접 들어와 구매한 것이 전부 (direct) 로 잡혀 광고 기여가 과소평가된다.
        // firstUserSourceMedium(그 사용자를 처음 획득한 채널) × newVsReturning 으로
        // "이 채널로 데려온 고객이 만든 재방문·재구매"를 본다.
        // 주의: GA4 쿠키가 유지되는 동안만 first 값이 남는다. 오래된 고객은 direct 로 잡힌다.
        const runFirstSource = async (startDate, endDate) => {
          const rows = await runReport(propertyId, token, {
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'firstUserSourceMedium' }, { name: 'newVsReturning' }],
            metrics: [
              { name: 'sessions' },
              { name: 'totalUsers' },
              { name: 'ecommercePurchases' },
              { name: 'purchaseRevenue' },
              { name: 'averageSessionDuration' },
            ],
            limit: 5000,
          });
          const by = {};
          for (const r of rows) {
            const first = r.dimensionValues[0].value;
            const kind = r.dimensionValues[1].value === 'returning' ? 'returning' : 'new';
            if (!by[first]) by[first] = { first, new: {}, returning: {} };
            by[first][kind] = {
              sessions: Number(r.metricValues[0].value),
              users: Number(r.metricValues[1].value),
              purchases: Number(r.metricValues[2].value),
              revenue: Number(r.metricValues[3].value),
              avgDuration: Math.round(Number(r.metricValues[4].value)),
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
              cvr: sT ? pT / sT * 100 : 0,
            };
          }).sort((a, b) => b.totalSessions - a.totalSessions);
        };
        try {
          const cur = await runFirstSource(ranges.after.start, ranges.after.end);
          const prev = q.get('cmp') === '1' ? await runFirstSource(ranges.before.start, ranges.before.end) : null;
          return jsonCached({ periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`,
                        periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`,
                        firstsource: cur, firstsourceBefore: prev }, 200);
        } catch (e) {
          return json({ error: '획득 채널 리포트 실패: ' + String(e && e.message || e) }, 500);
        }
      }
      if (q.get('tab') === 'retention') {
        try {
          const points = await buildRetentionCohort(propertyId, token);
          return jsonCached({ points }, 200);
        } catch (e) {
          return json({ error: '코호트 리포트 실패: ' + String(e && e.message || e) }, 500);
        }
      }
      // ===== 과거 시점 총 회원 수 =====
      // [2026-09-13 추가] totalMembers 가 2026-08-01부터 revenue-daily.json 에서 비어 있다.
      // 대시보드(index.html)의 fillMissingTotalMembers() 가 이 엔드포인트를 부른다.
      if (q.get('tab') === 'membercount') {
        try {
          const mc = await buildMemberCounts(
            env, ranges.after.start, ranges.after.end,
            q.get('anchorDate'), q.get('anchorTotal') ? Number(q.get('anchorTotal')) : null,
          );
          if (mc.error) return json({ error: mc.error, detail: mc.detail || null }, 500);
          return jsonCached(mc, 200);
        } catch (e) {
          return json({ error: '회원 수 조회 실패: ' + String(e && e.message || e) }, 500);
        }
      }
      if (q.get('tab') === 'activeusers') {
        const au = await buildActiveUsers(propertyId, token, q.get('autoExclLowEngagement') === '1', q.get('excl'));
        return jsonCached(au, 200);
      }
      if (q.get('tab') === 'events') {
        const events = await buildEventList(propertyId, token, ranges.after.start, ranges.after.end);
        return jsonCached({ periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`, events }, 200);
      }
      if (q.get('tab') === 'cart') {
        const wantCmp = q.get('cmp') === '1';
        try {
          const cur = await buildCartAnalysis(propertyId, token, ranges.after.start, ranges.after.end, q.get('excl'), q.get('autoExclLowEngagement') === '1');
          const prev = wantCmp
            ? await buildCartAnalysis(propertyId, token, ranges.before.start, ranges.before.end, q.get('excl'), q.get('autoExclLowEngagement') === '1')
            : null;
          return jsonCached({ periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`,
                        periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`, cartAnalysis: cur, cartAnalysisBefore: prev }, 200);
        } catch (e) {
          return json({ error: '장바구니 분석 실패: ' + String(e && e.message || e) }, 500);
        }
      }
      if (q.get('tab') === 'segfunnel') {
        const wantCmp = q.get('cmp') === '1';
        try {
          const cur = await buildSegmentFunnel(propertyId, token, ranges.after.start, ranges.after.end, q.get('excl'), q.get('autoExclLowEngagement') === '1');
          const prev = wantCmp
            ? await buildSegmentFunnel(propertyId, token, ranges.before.start, ranges.before.end, q.get('excl'), q.get('autoExclLowEngagement') === '1')
            : null;
          return jsonCached({ periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`,
                        periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`, segfunnel: cur, segfunnelBefore: prev }, 200);
        } catch (e) {
          return json({ error: '세그먼트 퍼널 실패: ' + String(e && e.message || e) }, 500);
        }
      }
      if (q.get('tab') === 'metricscsv') {
        // 구글 시트용. goals.json 의 지표 코드와 같은 이름으로 현재값만 내보낸다.
        // 시트에서 =IMPORTDATA("...&tab=metricscsv") 로 읽고 INDEX/MATCH 로 끌어다 쓴다.
        try {
          const d = await buildData(propertyId, token, ranges, q.get('excl'),
                                    q.get('autoExclLowEngagement') === '1');
          const at = (nm) => (d.funnel || []).find(x => x.name === nm) || { after: 0 };
          const kpi = (lb) => (d.kpis || []).find(k => k.label === lb);
          const order = at('결제(주문서)').after, buy = at('구매').after, visit = at('방문').after;
          const num = (v) => (v == null || !isFinite(v)) ? '' : Math.round(v * 100) / 100;

          const rows = [['metric', 'value', 'label']];
          rows.push(['orderToBuy',   num(order ? buy / order * 100 : null), '주문서→구매 전환율(%)']);
          rows.push(['sessionToBuy', num(visit ? buy / visit * 100 : null), '전체 구매 전환율(%)']);
          rows.push(['returning',    num(kpi('재방문자 비율')?.after),      '재방문자 비율(%)']);
          rows.push(['cartRate',     num(kpi('장바구니 전환율')?.after),    '장바구니 전환율(%)']);
          rows.push(['detailRate',   num(kpi('상품조회 전환율')?.after),    '상품조회 전환율(%)']);
          rows.push(['aov',          num(kpi('객단가')?.after),             '객단가(원)']);
          rows.push(['sessions',     num(visit),                            '세션(방문)']);
          rows.push(['purchases',    num(buy),                              '구매 건수']);
          rows.push(['period',       `${ranges.after.start}~${ranges.after.end}`, '조회 기간']);
          rows.push(['updatedAt',    new Date().toISOString().slice(0, 19).replace('T', ' '), '갱신 시각(UTC)']);
          return csv(rows);
        } catch (e) {
          return csv([['error', String(e && e.message || e)]], 500);
        }
      }
      if (q.get('tab') === 'debugpages') {
        // 페이지 경로 진단: GA4 에 실제로 어떤 pagePath 가 기록되는지 조회수와 함께 나열.
        // 회원가입 완료 페이지의 실제 경로를 확인하기 위한 도구.
        // 직접 접근으로는 알 수 없다(완료 페이지는 가입 폼을 거쳐야 열리고, 경로가
        // 몰 설정·버전에 따라 join_result / join_end 등으로 다르다).
        // 사용: /?bs=...&be=...&as=YYYY-MM-DD&ae=YYYY-MM-DD&tab=debugpages&q=member&key=...
        try {
          const needle = (q.get('q') || '').toLowerCase();
          const rows = await runReport(propertyId, token, {
            dateRanges: [{ startDate: ranges.after.start, endDate: ranges.after.end }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }],
            limit: 100000,
          });
          const list = rows.map(r => ({
            path: r.dimensionValues[0].value,
            views: Number(r.metricValues[0].value),
            sessions: Number(r.metricValues[1].value),
          }))
            .filter(x => !needle || x.path.toLowerCase().includes(needle))
            .sort((a, b) => b.views - a.views);
          return json({
            period: `${ranges.after.start} ~ ${ranges.after.end}`,
            filter: needle || '(전체)',
            matched: list.length,
            pages: list.slice(0, 100),
            hint: '가입 완료 페이지는 하루 수십 건 수준의 조회수를 가진 /member/ 하위 경로일 가능성이 높습니다.',
          }, 200);
        } catch (e) {
          return json({ error: '페이지 진단 실패: ' + String(e && e.message || e) }, 500);
        }
      }
      if (q.get('tab') === 'debugfilter') {
        // 봇·어뷰징 필터 진단: 여러 세션 하한(minSessions) 후보로 무엇이 걸리고 빠지는지 나열.
        // 상수(바닥 5, 일수×2)를 실데이터로 확정하기 위한 도구. 대시보드에는 노출 안 됨.
        // 사용: /?bs=...&be=...&as=YYYY-MM-DD&ae=YYYY-MM-DD&tab=debugfilter&key=...
        try {
          const st = ranges.after.start, en = ranges.after.end;
          const days = daysBetween(st, en);
          const [pairRows, campRows] = await Promise.all([
            runReport(propertyId, token, {
              dateRanges: [{ startDate: st, endDate: en }],
              dimensions: [{ name: 'sessionSourceMedium' }, { name: 'country' }],
              metrics: [{ name: 'sessions' }, { name: 'userEngagementDuration' }],
            }),
            runReport(propertyId, token, {
              dateRanges: [{ startDate: st, endDate: en }],
              dimensions: [{ name: 'sessionCampaignName' }],
              metrics: [{ name: 'sessions' }, { name: 'userEngagementDuration' }],
            }),
          ]);
          const shape = (rows, nameOf) => rows.map(r => {
            const sessions = Number(r.metricValues[0].value);
            const avgSec = sessions ? Number(r.metricValues[1].value) / sessions : 0;
            return { name: nameOf(r), sessions, avgSec: Math.round(avgSec * 10) / 10 };
          }).sort((a, b) => b.sessions - a.sessions);
          const pairs = shape(pairRows, r => `${r.dimensionValues[0].value} || ${r.dimensionValues[1].value}`);
          const camps = shape(campRows, r => r.dimensionValues[0].value);
          const thresholds = [2, 5, 10, days * 2, Math.max(5, days * 2)];
          const verdict = (list) => list.filter(x => x.avgSec < 5).map(x => ({
            ...x, excludedAt: thresholds.filter(t => x.sessions >= t),
          }));
          return json({
            period: `${st} ~ ${en}`, days,
            currentRule: `sessions >= max(5, days*2)=${Math.max(5, days * 2)} AND avgSec < 5`,
            lowEngagementPairs: verdict(pairs).slice(0, 50),
            lowEngagementCampaigns: verdict(camps).slice(0, 50),
            note: 'excludedAt = 그 하한(threshold)을 썼을 때 제외되는지. avgSec >= 5 인 항목은 어떤 하한에서도 제외되지 않으므로 생략.',
          }, 200);
        } catch (e) {
          return json({ error: '필터 진단 실패: ' + String(e && e.message || e) }, 500);
        }
      }
      // ── 사이트 검색어 (view_search_results 의 search_term) ──
      // [2026-09-01 추가] 고객이 무엇을 찾는지 = 수요 신호. 검색은 했는데 결과가 없거나
      // 구매로 안 이어지는 검색어가 곧 '없는 상품' 목록이라, 소싱·기획의 입력값이 된다.
      if (q.get('tab') === 'searchterms') {
        const wantCmp = q.get('cmp') === '1';
        try {
          const cur = await buildSearchTerms(propertyId, token, ranges.after.start, ranges.after.end, q.get('excl'), q.get('autoExclLowEngagement') === '1');
          const prev = wantCmp
            ? await buildSearchTerms(propertyId, token, ranges.before.start, ranges.before.end, q.get('excl'), q.get('autoExclLowEngagement') === '1')
            : null;
          return jsonCached({ periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`,
                        periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`, searchTerms: cur, searchTermsBefore: prev }, 200);
        } catch (e) {
          return json({ error: '검색어 리포트 실패: ' + String(e && e.message || e) }, 500);
        }
      }
      // 검색어 전체를 CSV 로 내려받기. 화면은 상위 50개만 보여주므로 전수는 여기서 받는다.
      // 엑셀에서 바로 열리도록 BOM + attachment 헤더를 붙여 보낸다(csv 의 3번째 인자).
      if (q.get('tab') === 'searchtermscsv') {
        try {
          const st = await buildSearchTerms(propertyId, token, ranges.after.start, ranges.after.end,
                                            q.get('excl'), q.get('autoExclLowEngagement') === '1', Infinity);
          const rows = [['순위', '검색어', '검색수', '사용자수', '점유율(%)']];
          st.rows.forEach((r, i) => rows.push([
            i + 1, r.term, r.searches, r.users,
            st.totalSearches ? Math.round(r.searches / st.totalSearches * 10000) / 100 : 0,
          ]));
          if (!st.rows.length) rows.push(['', '(이 기간에 집계된 검색어가 없습니다)', '', '', '']);
          return csv(rows, 200, `검색어_${ranges.after.start}_${ranges.after.end}.csv`);
        } catch (e) {
          return csv([['error', String(e && e.message || e)]], 500);
        }
      }
      if (q.get('tab') === 'utm') {
        const wantCmp = q.get('cmp') === '1';
        try {
          const cur = await buildUtmPerformance(propertyId, token, ranges.after.start, ranges.after.end, q.get('excl'), q.get('autoExclLowEngagement') === '1');
          const prev = wantCmp
            ? await buildUtmPerformance(propertyId, token, ranges.before.start, ranges.before.end, q.get('excl'), q.get('autoExclLowEngagement') === '1')
            : null;
          return jsonCached({ periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`,
                        periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`, utm: cur, utmBefore: prev }, 200);
        } catch (e) {
          return json({ error: 'UTM 리포트 실패: ' + String(e && e.message || e) }, 500);
        }
      }
      if (q.get('tab') === 'scroll') {
        const wantCmp = q.get('cmp') === '1';
        const cur = await buildScrollDepth(propertyId, token, ranges.after.start, ranges.after.end, q.get('excl'), q.get('autoExclLowEngagement') === '1');
        const prev = wantCmp
          ? await buildScrollDepth(propertyId, token, ranges.before.start, ranges.before.end, q.get('excl'), q.get('autoExclLowEngagement') === '1')
          : null;
        return jsonCached({ periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`,
                      periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`, scroll: cur, scrollBefore: prev }, 200);
      }
      if (q.get('tab') === 'acquisition') {
        const wantCmp = q.get('cmp') === '1';
        const acq = await buildAcquisition(propertyId, token, ranges.after.start, ranges.after.end, q.get('excl'), q.get('autoExclLowEngagement') === '1');
        const acqBefore = wantCmp
          ? await buildAcquisition(propertyId, token, ranges.before.start, ranges.before.end, q.get('excl'), q.get('autoExclLowEngagement') === '1')
          : null;
        return jsonCached({ periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`,
                      periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`, acquisition: acq, acquisitionBefore: acqBefore }, 200);
      }
      if (q.get('tab') === 'countrydetail') {
        const details = await buildTopCountriesDetail(propertyId, token, ranges.after.start, ranges.after.end, 5);
        return jsonCached({ periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`, countries: details }, 200);
      }
      if (q.get('tab') === 'daily') {
        const daily = await buildDaily(propertyId, token, ranges.after.start, ranges.after.end, q.get('excl'), q.get('autoExclLowEngagement') === '1');
        return jsonCached({ periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`, daily }, 200);
      }
      if (q.get('tab') === 'slotperf') {
        let perf = await buildSlotPerf(propertyId, token, ranges, q.get('excl'), q.get('autoExclLowEngagement') === '1');
        perf = await attachSlotPerfNames(perf, env);
        return jsonCached({ periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`, periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`, slotperf: perf }, 200);
      }
      if (q.get('tab') === 'slots') {
        let slots = await buildSlots(propertyId, token, ranges, q.get('excl'), q.get('autoExclLowEngagement') === '1');
        slots = await attachNames(slots, env);
        return jsonCached({ periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`, periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`, slots }, 200);
      }
      const result = await buildData(propertyId, token, ranges, q.get('excl'), q.get('autoExclLowEngagement') === '1');
      return jsonCached(result, 200);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
  },
};

// 구글 시트가 IMPORTDATA 로 읽을 수 있는 CSV 응답.
// 시트에서 값을 매주 손으로 옮겨 적지 않게 하려는 목적이라 JSON 이 아니라 CSV 로 낸다
// (구글 시트는 JSON 을 기본 함수로 읽지 못하고 Apps Script 가 필요하다).
// filename 을 주면 '브라우저에서 내려받는 파일'로 바뀐다:
//   - Content-Disposition: attachment → 링크를 눌렀을 때 화면에 뿌리지 않고 저장
//   - 맨 앞에 BOM(﻿) → 이게 없으면 엑셀이 UTF-8 을 못 알아채고 한글이 전부 깨진다
// filename 이 없으면 예전 그대로 동작한다 (metricscsv 의 구글시트 IMPORTDATA 용).
function csv(rows, status = 200, filename) {
  const esc = (v) => {
    const t = String(v ?? '');
    return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const body = rows.map(r => r.map(esc).join(',')).join('\n');
  const headers = {
    'Content-Type': 'text/csv; charset=utf-8',
    'Cache-Control': 'public, max-age=300',   // 시트가 자주 부르니 5분 캐시
    ...CORS,
  };
  if (filename) {
    // filename* (RFC 5987) 로 넣어야 한글 파일명이 안 깨진다
    headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }
  return new Response(filename ? '﻿' + body : body, { status, headers });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

// ── GA4 OAuth: 서비스계정 JWT 서명 → access_token ──
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  };
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const key = await importKey(sa.private_key);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('토큰 발급 실패: ' + JSON.stringify(data));
  return data.access_token;
}

async function importKey(pem) {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

function b64url(bytes) {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── GA4 Data API 호출 ──
async function runReport(propertyId, token, body) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  const data = await res.json();
  if (data.error) throw new Error('GA4: ' + data.error.message);
  return data.rows || [];
}


// ── 슬롯 이동: art.html / life.html 에서 넘어간 다음 목적지 집계 ──
async function buildSlots(propertyId, token, ranges, exclRaw, autoExclLowEngagement) {
  // 제외는 GA4 쿼리 단계에서 처리한다(아래 movesFrom). 워커에서 행마다 거르지 않음.
  let badPairs = [], badCampaigns = [];
  if (autoExclLowEngagement) {
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, ranges.after.start, ranges.after.end));
  }

  async function movesFrom(startDate, endDate, homeKeyword) {
    // pageReferrer 에 homeKeyword(art.html/life.html)가 포함된 페이지뷰의 목적지별 세션수
    //
    // [2026-07-30 성능 수정] 예전에는 sessionSourceMedium·country 를 차원으로 받아와
    // 워커에서 행마다 isExcl 로 걸렀다. 이 함수는 4개 차원 조합(pagePath × pageReferrer ×
    // sourceMedium × country)이라 행이 폭발적으로 늘어나는데, 211일 같은 긴 기간에서는
    // 수만~10만 행이 되어 워커 CPU 한도(요청당 약 10ms)를 넘겨 응답이 죽었다.
    // (CORS 에러로 보이지만 실제로는 워커가 죽어 CORS 헤더를 못 붙인 것)
    //
    // 두 차원은 '거르는 용도로만' 썼으므로, GA4 dimensionFilter 로 구글 쪽에서 걸러
    // 받으면 응답에서 아예 뺄 수 있다. 차원 4개 → 2개로 줄어 행 수가 크게 감소하고
    // 워커는 루프만 돌면 된다. pageReferrer 조건도 같이 서버로 넘긴다.
    const filter = andFilters(
      buildExclusionFilter(exclRaw, badPairs, badCampaigns),
      { filter: { fieldName: 'pageReferrer', stringFilter: { matchType: 'CONTAINS', value: homeKeyword, caseSensitive: false } } },
    );
    const rows = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'pagePathPlusQueryString' },
        { name: 'pageReferrer' },
      ],
      metrics: [{ name: 'sessions' }],
      ...(filter ? { dimensionFilter: filter } : {}),
      limit: 100000,
    });
    const agg = {};
    for (const r of rows) {
      const dest = r.dimensionValues[0].value;
      const ref  = r.dimensionValues[1].value || '';
      if (!ref.includes(homeKeyword)) continue;           // 직전 페이지가 해당 메인
      if (dest.includes(homeKeyword)) continue;            // 메인 자기자신 제외
      const n = Number(r.metricValues[0].value);
      agg[dest] = (agg[dest] || 0) + n;
    }
    return Object.entries(agg)
      .map(([path, sessions]) => ({ path, sessions }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 30);
  }

  const out = {};
  for (const key of ['art.html', 'life.html']) {
    out[key] = {
      before: await movesFrom(ranges.before.start, ranges.before.end, key),
      after:  await movesFrom(ranges.after.start,  ranges.after.end,  key),
    };
  }
  return out;
}

// URL에서 product_no 추출
function productNo(path) {
  const m = (path || '').match(/product_no=(\d+)/);
  return m ? m[1] : null;
}

// Front API로 상품명 조회 (client_id 헤더). 실패 시 null.
// cafe24 Admin API 접근 토큰을 KV에 캐싱해서 재사용.
// 매번 Gist에서 refresh_token을 읽고 새로 발급받으면(특히 여러 요청이 겹칠 때) 토큰이
// 충돌해서 깨질 수 있어서, KV에 저장해두고 만료 전까지는 그대로 재사용함.
async function getCafe24AccessToken(env) {
  const kv = env.CAFE24_TOKEN_KV;
  if (kv) {
    const cached = await kv.get('access_token', { type: 'json' });
    if (cached && cached.expiresAt > Date.now() + 60000) {
      return cached.token; // 만료 1분 전까지는 캐시 재사용
    }
  }

  // 캐시 없거나 만료됨 → Gist에서 refresh_token 읽어서 새로 발급
  const gistUrl = `https://api.github.com/gists/${env.CAFE24_GIST_ID}`;
  const ghHeaders = { 'Authorization': `token ${env.CAFE24_GH_PAT}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'pbg-dashboard-worker' };
  const gistRes = await fetch(gistUrl, { headers: ghHeaders });
  if (!gistRes.ok) {
    const body = await gistRes.text();
    console.log(`[cafe24 인증 실패] Gist 조회 실패 status=${gistRes.status} body=${body.slice(0,300)}`);
    return null;
  }
  const gistJson = await gistRes.json();
  const refreshToken = gistJson?.files?.['token.txt']?.content?.trim();
  if (!refreshToken) {
    console.log('[cafe24 인증 실패] Gist에 token.txt가 없음');
    return null;
  }

  const basic = btoa(`${env.CAFE24_ADMIN_CLIENT_ID}:${env.CAFE24_ADMIN_CLIENT_SECRET}`);
  const tokenRes = await fetch(`https://${env.CAFE24_MALL_ID}.cafe24api.com/api/v2/oauth/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.log(`[cafe24 인증 실패] 토큰 발급 실패 status=${tokenRes.status} body=${body.slice(0,300)}`);
    return null;
  }
  const tokenJson = await tokenRes.json();

  // 새 refresh_token을 Gist에 다시 저장 (cafe24는 한 번 쓰면 이전 값이 무효화되는 방식)
  if (tokenJson.refresh_token) {
    const patchRes = await fetch(gistUrl, {
      method: 'PATCH', headers: ghHeaders,
      body: JSON.stringify({ files: { 'token.txt': { content: tokenJson.refresh_token } } }),
    });
    if (!patchRes.ok) console.log(`[경고] Gist 갱신 실패 status=${patchRes.status}`);
  }

  // KV에 캐싱 (expires_at 기준, 안전하게 5분 여유를 두고 저장)
  if (kv && tokenJson.access_token) {
    const expiresAt = Date.now() + (tokenJson.expires_in ? tokenJson.expires_in * 1000 : 7200000) - 300000;
    await kv.put('access_token', JSON.stringify({ token: tokenJson.access_token, expiresAt }), { expirationTtl: 7200 });
  }
  return tokenJson.access_token || null;
}

// ===== 과거 시점 총 회원 수 (tab=membercount) =====
// [2026-09-13 추가]
// totalMembers 가 2026-08-01부터 revenue-daily.json 에서 비어 있다.
// /admin/customers/count 에 가입일 상한을 걸면 "그 날짜까지 가입한 회원 수",
// 즉 그 시점의 누적 회원 수를 과거까지 되짚어 구할 수 있다.
//
// [정확도] 그 뒤 탈퇴한 회원은 지금 목록에 없으므로 과거로 갈수록 실제보다 낮게 나온다.
// 그래서 마지막 실측일을 같은 방식으로 계산해 오차율(anchor.diffPct)을 함께 돌려준다.
// 오차가 크면 화면에서 이 값을 쓰면 안 된다 — 추정치를 조용히 정답처럼 쓰지 않기 위한 장치다.
const CUSTOMER_END_DATE_PARAMS = ['created_end_date', 'end_date', 'join_date_end'];
const MEMBER_PARAM_KEY = 'customerCountParam:v1';
const MEMBER_MAX_POINTS = 31;   // 서브요청 한도(무료 50) 여유

async function cafe24CustomerCount(mallId, tok, qs) {
  const r = await fetch(`https://${mallId}.cafe24api.com/api/v2/admin/customers/count${qs || ''}`, {
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
  });
  if (!r.ok) {
    console.log(`[회원수] count 실패 status=${r.status} qs=${qs} body=${(await r.text()).slice(0, 200)}`);
    return null;
  }
  const j = await r.json();
  return (j && j.count != null) ? Number(j.count) : null;
}

// cafe24 는 인식하지 못하는 쿼리 파라미터를 에러 없이 무시한다. 파라미터명이 틀리면
// 날짜 조건이 사라져 "전체 회원 수"가 그대로 돌아오는데 값이 그럴듯해 알아채기 어렵다.
// 그래서 아주 과거 날짜를 넣어 값이 실제로 줄어드는지 확인해 파라미터를 판별한다.
async function resolveCustomerCountParam(env, mallId, tok) {
  const kv = env.CAFE24_TOKEN_KV;
  if (kv) {
    try {
      const cached = await kv.get(MEMBER_PARAM_KEY);
      if (cached) return { param: cached, cached: true };
    } catch (e) { /* 캐시 실패는 무시 */ }
  }
  const total = await cafe24CustomerCount(mallId, tok, '');
  if (total == null) return { error: 'count 엔드포인트 호출 실패 (scope mall.read_customer 확인)' };
  for (const p of CUSTOMER_END_DATE_PARAMS) {
    const old = await cafe24CustomerCount(mallId, tok, `?${p}=2020-01-01`);
    if (old == null) continue;
    if (old < total) {
      if (kv) { try { await kv.put(MEMBER_PARAM_KEY, p, { expirationTtl: 60 * 60 * 24 * 30 }); } catch (e) {} }
      return { param: p, total };
    }
    console.log(`[회원수] ${p}: 전체와 동일(${old}) → 무시되는 파라미터`);
  }
  return { error: '가입일 상한 파라미터를 찾지 못했다', detail: `전체 ${total}명 기준으로 후보가 모두 무시됨` };
}

function memberDateRange(startDate, endDate, maxPoints) {
  const out = [];
  const s = Date.parse(startDate + 'T00:00:00Z'), e = Date.parse(endDate + 'T00:00:00Z');
  if (!(s <= e)) return out;
  const days = Math.round((e - s) / 86400000) + 1;
  const step = Math.max(1, Math.ceil(days / maxPoints));
  for (let i = 0; i < days; i += step) out.push(new Date(s + i * 86400000).toISOString().slice(0, 10));
  if (out[out.length - 1] !== endDate) out.push(endDate);
  return out;
}

async function buildMemberCounts(env, startDate, endDate, anchorDate, anchorTotal) {
  const tok = await getCafe24AccessToken(env);
  if (!tok) return { error: 'cafe24 인증 실패 (Gist/토큰 확인)' };
  const mallId = env.CAFE24_MALL_ID;
  const resolved = await resolveCustomerCountParam(env, mallId, tok);
  if (resolved.error) return resolved;
  const P = resolved.param;

  const points = [];
  for (const d of memberDateRange(startDate, endDate, MEMBER_MAX_POINTS)) {
    const n = await cafe24CustomerCount(mallId, tok, `?${P}=${d}`);
    if (n != null) points.push({ date: d, total: n });
  }
  if (!points.length) return { error: '회원 수를 한 건도 못 읽었다' };

  let anchor = null;
  if (anchorDate && anchorTotal) {
    const calc = await cafe24CustomerCount(mallId, tok, `?${P}=${anchorDate}`);
    if (calc != null) {
      const diffPct = anchorTotal ? (calc - anchorTotal) / anchorTotal * 100 : 0;
      anchor = { date: anchorDate, actual: anchorTotal, calculated: calc,
                 diff: calc - anchorTotal, diffPct, reliable: Math.abs(diffPct) <= 1.0 };
    }
  }
  return {
    dimUsed: P, paramCached: !!resolved.cached, points, anchor, estimated: true,
    note: '탈퇴 회원은 현재 목록에서 빠지므로 과거로 갈수록 실제보다 낮게 나옵니다. '
        + 'anchor.diffPct 로 오차를 확인하세요 (reliable=false 면 이 값을 지표로 쓰지 마세요).',
  };
}

// ── 상품명 해석: 배치 조회 + 번들 캐시 ──
// [2026-07-31] 예전 방식의 낭비 세 가지를 한꺼번에 없앤다.
//   (1) 1건씩 조회했다 → /admin/products/{no} 단건 호출을 상품 수만큼 반복.
//       cafe24 는 product_no 를 쉼표로 이어 한 번에 100개까지 받는다.
//       12개 조회 = 서브요청 12개 → 1개.
//   (2) KV 키를 상품마다 따로 뒀다 → 60개면 kv.get 을 60번 순차 대기. 서브요청 한도에는
//       안 걸리지만 지연이 쌓여 느렸다. 하나의 번들 키로 묶어 1번만 읽는다.
//   (3) TTL 이 1일이었다 → 상품명은 거의 바뀌지 않는데 매일 만료돼 전부 다시 조회했다.
//       30일로 늘려 재조회를 사실상 없앤다.
// 결과: 한 번 부른 이름은 다시 부르지 않는다.
// v1 에는 위 버그로 null 이 굳어버린 항목이 있어 버전을 올려 새로 채운다.
// TTL 이 30일이라 재조회 비용은 한 번뿐이다.
const PRODUCT_NAME_BUNDLE_KEY = 'productNames:v2';
const PRODUCT_NAME_TTL = 60 * 60 * 24 * 30;   // 30일
const BATCH_SIZE = 100;                        // cafe24 한 번 호출당 최대
const MAX_BATCHES_PER_REQUEST = 2;             // 한 요청에서 최대 200개까지 새로 채움

// 단건 조회. 목록(배치) 응답에서 빠진 상품을 보완할 때만 쓴다.
// 목록 조회는 진열/판매 상태에 따라 일부 상품을 반환하지 않는 것으로 관찰됐다
// (낮은 번호는 이름이 오는데 최근 번호대가 빠짐). 단건 조회는 상태와 무관하게 반환한다.
async function fetchProductNameSingle(no, accessToken, mallId) {
  try {
    const r = await fetch(`https://${mallId}.cafe24api.com/api/v2/admin/products/${no}`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    if (!r.ok) {
      console.log(`[상품명 단건 실패] product_no=${no} status=${r.status} body=${(await r.text()).slice(0,150)}`);
      return null;
    }
    const j = await r.json();
    return j?.product?.product_name || null;
  } catch (e) {
    console.log(`[상품명 단건 예외] product_no=${no} error=${e && e.message || e}`);
    return null;
  }
}

async function fetchProductNamesBatch(pnos, accessToken, mallId) {
  // 반환: { 상품번호: 이름 }  — 응답에 없는 번호는 호출부에서 null 로 표시해 재조회를 막는다
  const out = {};
  try {
    const r = await fetch(
      `https://${mallId}.cafe24api.com/api/v2/admin/products?product_no=${pnos.join(',')}&limit=${BATCH_SIZE}`,
      { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
    if (!r.ok) {
      console.log(`[상품명 배치 실패] ${pnos.length}건 status=${r.status} body=${(await r.text()).slice(0,200)}`);
      return out;
    }
    const j = await r.json();
    for (const p of (j?.products || [])) {
      if (p?.product_no != null) out[String(p.product_no)] = p.product_name || null;
    }
  } catch (e) {
    console.log(`[상품명 배치 예외] error=${e && e.message || e}`);
  }
  return out;
}

// 필요한 상품번호들의 이름을 돌려준다. 캐시에 있으면 호출하지 않는다.
// 값이 null 이면 "조회했지만 이름이 없음"이며, 이 역시 캐시해 재조회를 막는다.
async function resolveProductNames(kv, accessToken, mallId, pnos) {
  const need = [...new Set(pnos.map(String))].filter(Boolean);
  let bundle = {};
  if (kv) {
    try { bundle = (await kv.get(PRODUCT_NAME_BUNDLE_KEY, { type: 'json' })) || {}; }
    catch (e) { /* 무시하고 빈 번들로 시작 */ }
  }
  const missing = need.filter(n => bundle[n] === undefined);
  let fetched = 0, gap = [];
  for (let i = 0; i < missing.length && i / BATCH_SIZE < MAX_BATCHES_PER_REQUEST; i += BATCH_SIZE) {
    const chunk = missing.slice(i, i + BATCH_SIZE);
    const got = await fetchProductNamesBatch(chunk, accessToken, mallId);
    for (const n of chunk) {
      if (got[n] !== undefined) bundle[n] = got[n];
      else gap.push(n);                 // 목록에서 빠진 번호 → 아래에서 단건으로 보완
    }
    fetched += chunk.length;
    if (i + BATCH_SIZE < missing.length) await new Promise(r => setTimeout(r, 120));
  }

  // [2026-08-03] 배치에서 빠진 상품을 단건으로 보완한다.
  // 예전에는 배치 응답에 없는 번호를 그냥 null 로 확정해 재조회를 막았는데,
  // 목록 조회가 일부 상품(미진열·판매중지 등)을 반환하지 않는 탓에 그 상품들은
  // 영구히 이름이 비었다. 재조회 낭비를 막으려던 처리가 원인이 되어 있었다.
  // 단건 확인까지 실패한 것만 null 로 확정한다.
  // 서브요청 한도(무료 플랜 50)에 여유를 두기 위해 보수적으로 잡는다.
  // 한도를 넘으면 워커가 죽고 브라우저에는 CORS 에러로 보여 원인 파악이 어렵다.
  // 못 채운 건 다음 요청에서 이어서 채워지므로 작게 잡아도 결국 다 채워진다.
  const SINGLE_BUDGET = 10;
  let single = 0;
  for (const n of gap) {
    if (single >= SINGLE_BUDGET) break;
    bundle[n] = await fetchProductNameSingle(n, accessToken, mallId);
    single++;
    await new Promise(r => setTimeout(r, 60));
  }
  if (gap.length) {
    console.log(`[상품명] 목록에서 빠진 ${gap.length}개 중 ${single}개를 단건으로 보완`
      + (gap.length > single ? ` (남은 ${gap.length - single}개는 다음 요청에서)` : ''));
  }

  if ((fetched > 0 || single > 0) && kv) {
    try { await kv.put(PRODUCT_NAME_BUNDLE_KEY, JSON.stringify(bundle), { expirationTtl: PRODUCT_NAME_TTL }); }
    catch (e) { /* 저장 실패는 무시 */ }
  }
  console.log(`[상품명] 필요 ${need.length}개 · 캐시적중 ${need.length - missing.length}개 · 배치조회 ${fetched}개 · 남은 ${Math.max(0, missing.length - fetched)}개 · 누적 ${Object.keys(bundle).length}개`);
  return bundle;
}

async function fetchCategoryName(no, accessToken, mallId) {
  try {
    const r = await fetch(`https://${mallId}.cafe24api.com/api/v2/admin/categories/${no}`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    if (!r.ok) {
      const body = await r.text();
      console.log(`[카테고리명 조회 실패] cate_no=${no} status=${r.status} body=${body.slice(0,200)}`);
      return null;
    }
    const j = await r.json();
    return j?.category?.category_name || null;
  } catch (e) {
    console.log(`[카테고리명 조회 예외] cate_no=${no} error=${e && e.message || e}`);
    return null;
  }
}

// buildSlotPerf 결과(카테고리별 개별상품 랭킹)에 상품명 채우기
// 이름(상품/카테고리) 조회 결과를 KV에 캐싱 (24시간) - 서브요청 한도 회피 + 속도 개선
// 배너/구좌 자체의 이름(pno/cate)은 SLOT_MAP 기준으로 고정돼있고 개수도 정해져 있어서,
// 하나의 번들로 KV에 저장해두고 "이번 요청에서 새로 빠진 것만 조금씩" 채워나감.
// → 매번 같은 앞쪽만 반복해서 자르는 문제 없이, 몇 번 새로고침하면 전부 채워짐.
async function resolveSlotIdentityNames(env, accessToken, mallId, neededPnos, neededCnos) {
  const kv = env.CAFE24_TOKEN_KV;
  const bundleKey = 'slotIdentityNames:v3';   // v2 에 null 로 굳은 항목이 있어 버전 올림
  let bundle = { p: {}, c: {} };
  if (kv) {
    try {
      const cached = await kv.get(bundleKey, { type: 'json' });
      if (cached) bundle = cached;
    } catch (e) { /* 무시하고 빈 번들로 시작 */ }
  }
  const missingP = neededPnos.filter(n => bundle.p[n] === undefined);
  const missingC = neededCnos.filter(n => bundle.c[n] === undefined);
  let filledP = 0, filledC = 0;
  // 상품은 배치로 한 번에 (100개까지 1회 호출)
  if (missingP.length) {
    const chunk = missingP.slice(0, BATCH_SIZE);
    const got = await fetchProductNamesBatch(chunk.map(String), accessToken, mallId);
    const gap = [];
    for (const n of chunk) {
      if (got[String(n)] !== undefined) bundle.p[n] = got[String(n)];
      else gap.push(n);
    }
    // 목록에서 빠진 상품은 단건으로 보완 (resolveProductNames 와 같은 이유)
    let single = 0;
    for (const n of gap) {
      if (single >= 6) break;   // 서브요청 한도 여유 (못 채운 건 다음 요청에서)
      bundle.p[n] = await fetchProductNameSingle(n, accessToken, mallId);
      single++;
      await new Promise(r => setTimeout(r, 60));
    }
    filledP = chunk.length;
    if (gap.length) console.log(`[슬롯 이름] 목록에서 빠진 ${gap.length}개 중 ${single}개 단건 보완`);
  }
  // 카테고리는 배치 엔드포인트가 없어 개별 호출. 개수가 적으므로 별도 예산으로 관리한다.
  const CAT_FILL_CAP = 8;    // 서브요청 한도 여유
  for (const n of missingC) {
    if (filledC >= CAT_FILL_CAP) break;
    bundle.c[n] = await fetchCategoryName(n, accessToken, mallId);
    filledC++;
    await new Promise(r => setTimeout(r, 50));
  }
  const filled = filledP + filledC;
  if (filled > 0 && kv) {
    try { await kv.put(bundleKey, JSON.stringify(bundle), { expirationTtl: PRODUCT_NAME_TTL }); } catch (e) { /* 무시 */ }
  }
  console.log(`[슬롯 이름 번들] 신규 상품 ${filledP}개(배치) · 카테고리 ${filledC}개 / 누적 상품 ${Object.keys(bundle.p).length}개, 카테고리 ${Object.keys(bundle.c).length}개, 남은 카테고리 ${Math.max(0, missingC.length - filledC)}개`);
  return bundle;
}

async function attachSlotPerfNames(perf, env) {
  const accessToken = await getCafe24AccessToken(env);
  if (!accessToken) { console.log('[이름 조회 스킵] cafe24 인증 실패'); return perf; }
  const mallId = env.CAFE24_MALL_ID;
  const kv = env.CAFE24_TOKEN_KV;

  // 1) 슬롯 자체(배너 등)의 pno/cate — 번들 캐싱으로 점진적 채움
  const slotPnos = new Set(), slotCnos = new Set();
  for (const tab of Object.keys(perf))
    for (const row of perf[tab]) {
      if (row.pno) slotPnos.add(row.pno);
      if (row.cate) slotCnos.add(row.cate);
    }
  const bundle = await resolveSlotIdentityNames(env, accessToken, mallId, [...slotPnos], [...slotCnos]);

  // 2) 각 구좌 안 개별 상품/캠페인(topProducts)
  //
  // [2026-07-31 버그 수정] 예전에는 `[...tpPnos].slice(0, 15)` 로 후보를 앞 15개만 잘랐다.
  // Set 의 앞부분을 매번 똑같이 자르는 방식이라 16번째 이후 상품은 조회를 시도조차 하지
  // 않았고, 따라서 캐시에도 영원히 들어가지 않아 화면에 이름이 계속 비었다.
  // (여기에 신규 호출 5개 제한까지 걸려 매 요청이 같은 앞쪽만 반복 처리했다)
  //
  // 이제: ① 모든 후보의 캐시를 먼저 읽는다 (KV 읽기는 서브요청 한도에 포함되지 않아 저렴)
  //       ② 캐시에 없는 것만 모아 예산만큼 새로 조회한다
  // 캐시된 것은 건너뛰므로 요청마다 미해결분이 줄어들고, 몇 번 새로고침하면 전부 채워진다.
  const tpPnos = new Set();
  for (const tab of Object.keys(perf))
    for (const row of perf[tab])
      for (const tp of (row.topProducts || [])) tpPnos.add(tp.pno);

  const tpCache = await resolveProductNames(kv, accessToken, mallId, [...tpPnos]);

  for (const tab of Object.keys(perf))
    for (const row of perf[tab]) {
      const prefix = (row.staticName||'').split(' ')[0];
      if (row.pno && bundle.p[row.pno]) row.name = `${prefix} (${bundle.p[row.pno]})`;
      // [2026-09-13] 정렬 구좌는 이름에 이미 정렬 방식이 들어 있어 카테고리명을 덧붙이지 않는다
      else if (row.cate && bundle.c[row.cate] && !row.sort) row.name = `${prefix} (${bundle.c[row.cate]})`;
      // 프로모션(캠페인)과 일반 카테고리 상품은 다른 개념이라 라벨을 구분
      row.topProductsLabel = row.section === '프로모션' ? '캠페인' : '상품';
      for (const tp of (row.topProducts || [])) tp.name = tpCache[tp.pno] || null;
    }
  return perf;
}

// 슬롯 결과에 상품명 채우기 (중복 product_no는 한 번만 조회)
async function attachNames(slots, env) {
  const accessToken = await getCafe24AccessToken(env);
  if (!accessToken) { console.log('[상품명 조회 스킵] cafe24 인증 실패'); return slots; }
  const mallId = env.CAFE24_MALL_ID;
  const kv = env.CAFE24_TOKEN_KV;
  const nos = new Set();
  for (const k of Object.keys(slots))
    for (const side of ['before', 'after'])
      for (const row of slots[k][side]) { const n = productNo(row.path); if (n) nos.add(n); }
  const cache = await resolveProductNames(kv, accessToken, mallId, [...nos]);
  for (const k of Object.keys(slots))
    for (const side of ['before', 'after'])
      for (const row of slots[k][side]) {
        const n = productNo(row.path);
        row.name = (n && cache[n]) ? cache[n] : null;
        row.product_no = n || null;
      }
  return slots;
}


const SLOT_MAP = {
  art: [
    // 글로벌 네비 (7)
    {o:1,name:'NEW ARRIVAL',cate:'547',section:'글로벌네비'},{o:2,name:'프로모션',cate:'514',section:'글로벌네비'},
    {o:3,name:'아트',cate:'608',section:'글로벌네비'},{o:4,name:'라이프',cate:'609',section:'글로벌네비'},
    {o:5,name:'류연희의 시간',cate:'474',section:'글로벌네비'},{o:6,name:'허명욱의 SAMUL',cate:'298',section:'글로벌네비'},
    {o:7,name:'이혜미의 실버',cate:'416',section:'글로벌네비'},
    // 상단 배너 5개 (2026-07-29 재확인)
    {o:8,name:'배너1 펠트로 스튜디오',pno:'13625',section:'상단배너'},{o:9,name:'배너2 에디강 화병',pno:'14761',section:'상단배너'},
    {o:10,name:'배너3 우리 시대를 수집',pno:'13455',section:'상단배너'},{o:11,name:'배너4 K-ART 거장',cate:'741',section:'상단배너'},
    {o:12,name:'배너5 비움으로 채운 한국의 미',pno:'14310',section:'상단배너'},
    // 숏컷(메인 배너 바로 아래 원형 아이콘 10개, 2026-07-29 확인 - 실제 href 있는 진짜 링크)
    {o:13,name:'오리지널',cate:'234',section:'숏컷'},{o:14,name:'리미티드',cate:'272',section:'숏컷'},
    {o:15,name:'수공당',cate:'789',section:'숏컷'},{o:16,name:'공예미술관',cate:'540',section:'숏컷'},
    {o:17,name:'작가도감',cate:'541',section:'숏컷'},{o:18,name:'이혜미',cate:'416',section:'숏컷'},
    {o:19,name:'허명욱',cate:'298',section:'숏컷'},{o:20,name:'류연희',cate:'474',section:'숏컷'},
    {o:21,name:'아트포스터',cate:'235',section:'숏컷'},
    {o:22,name:'아트프로젝트',path:'/company/archive.html',section:'숏컷'},
    // 주제별 추천작 - 탭 (버튼 자체는 URL 이동 없지만, 그 안 상품 클릭시 각기 다른
    // cate_no로 이동함이 확인됨 - 2026-07-29 재확인. 탭=카테고리 매핑:
    {o:23,name:'오리지널',cate:'866',section:'주제별 추천작'},{o:24,name:'판화',cate:'867',section:'주제별 추천작'},
    {o:25,name:'PB Only',cate:'872',section:'주제별 추천작'},{o:26,name:'아트포스터',cate:'868',section:'주제별 추천작'},
    // For Collector - 수공당(기본 칩) (2026-07-29 재확인)
    {o:27,name:'허명욱',cate:'807',section:'For Collector · 수공당'},{o:28,name:'양유완',cate:'808',section:'For Collector · 수공당'},
    {o:29,name:'조연예',cate:'809',section:'For Collector · 수공당'},{o:30,name:'정소혜',cate:'810',section:'For Collector · 수공당'},
    {o:31,name:'윤여동',cate:'811',section:'For Collector · 수공당'},{o:32,name:'방연당',cate:'812',section:'For Collector · 수공당'},
    {o:33,name:'전체 보기',cate:'229',section:'For Collector · 수공당'},
    // For Collector - 작가별 칩 6명 (2026-07-29 확인)
    // 김환기/김창열은 전용 카테고리, 나머지 4명은 검색 결과 페이지로 이동하는데
    // cate_no는 전부 228 공용이라 URL의 keyword= 값으로 개별 추적함.
    {o:34,name:'김환기',cate:'714',section:'For Collector · 작가별'},{o:35,name:'김창열',cate:'715',section:'For Collector · 작가별'},
    {o:36,name:'윤형택',keyword:'윤형택',section:'For Collector · 작가별'},{o:37,name:'그레타프리든',keyword:'그레타프리든',section:'For Collector · 작가별'},
    {o:38,name:'예예',keyword:'예예',section:'For Collector · 작가별'},{o:39,name:'니키',keyword:'니키',section:'For Collector · 작가별'},
    // For Collector - 사이즈별 칩 (2026-07-29 확인, 734~739 순차)
    {o:40,name:'~40x50cm',cate:'734',section:'For Collector · 사이즈별'},{o:41,name:'미니사이즈',cate:'735',section:'For Collector · 사이즈별'},
    {o:42,name:'~70x90cm',cate:'736',section:'For Collector · 사이즈별'},{o:43,name:'~90x110cm',cate:'737',section:'For Collector · 사이즈별'},
    {o:44,name:'~130x160cm',cate:'738',section:'For Collector · 사이즈별'},{o:45,name:'160cm 이상',cate:'739',section:'For Collector · 사이즈별'},
    // For Collector - 테마별 칩 (2026-07-29 확인)
    {o:46,name:'첫 콜렉팅 추천작품',cate:'740',section:'For Collector · 테마별'},{o:47,name:'거장의 작품',cate:'741',section:'For Collector · 테마별'},
    {o:48,name:'기분 좋은 현관',cate:'742',section:'For Collector · 테마별'},{o:49,name:'집들이',cate:'743',section:'For Collector · 테마별'},
    {o:50,name:'50만원으로 선물하는 작품',cate:'744',section:'For Collector · 테마별'},
    // 추천 작가 (2026-07-29 재확인)
    {o:51,name:'류연희',pno:'14841',section:'추천 작가'},{o:52,name:'이혜미',pno:'13201',section:'추천 작가'},
    {o:53,name:'유야 하시즈메',pno:'8778',section:'추천 작가'},{o:54,name:'허명욱',pno:'6683',section:'추천 작가'},
    {o:55,name:'윤형택',pno:'4236',section:'추천 작가'},{o:56,name:'청신',pno:'4015',section:'추천 작가'},
    // 프로모션 / 전시소식 진입점 (개별 상품은 링크 형태가 아니라 번호 미확보)
    {o:57,name:'프로모션 (전체 캠페인)',promoPath:true,section:'프로모션'},
    {o:58,name:'전시소식 전체',cate:'874',section:'전시 소식'},
    // [2026-09-10] 메인에 새로 붙은 정렬 구좌. cate_no 는 608(아트)로 같고 sort_method 로만 갈린다.
    // 이걸 안 나누면 두 구좌 유입이 글로벌네비 '아트' 실적으로 잘못 더해진다.
    {o:59,name:'조회수 TOP',cate:'608',sort:'8',section:'정렬 구좌'},
    {o:60,name:'인기 상품',cate:'608',sort:'6',section:'정렬 구좌'},
  ],
  life: [
    // 글로벌 네비 (7)
    {o:1,name:'NEW ARRIVAL',cate:'547',section:'글로벌네비'},{o:2,name:'프로모션',cate:'514',section:'글로벌네비'},
    {o:3,name:'아트',cate:'608',section:'글로벌네비'},{o:4,name:'라이프',cate:'609',section:'글로벌네비'},
    {o:5,name:'류연희의 시간',cate:'474',section:'글로벌네비'},{o:6,name:'허명욱의 SAMUL',cate:'298',section:'글로벌네비'},
    {o:7,name:'이혜미의 실버',cate:'416',section:'글로벌네비'},
    // 상단 배너 5개 (2026-07-29 재확인)
    {o:8,name:'배너1',cate:'939',section:'상단배너'},{o:9,name:'배너2',cate:'623',section:'상단배너'},
    {o:10,name:'배너3',cate:'910',section:'상단배너'},{o:11,name:'배너4',cate:'919',section:'상단배너'},
    {o:12,name:'배너5',pno:'13941',section:'상단배너'},
    // 숏컷 (전체상품/NEW/취향백서/선물추천/프로모션/with artist/PB Only/위베이크/뉴스레터,
    // life에만 있음(art엔 없음). 2026-07-29 재확인 - 실제 href 있는 진짜 링크)
    {o:13,name:'전체상품',cate:'609',section:'숏컷'},{o:14,name:'NEW',cate:'547',section:'숏컷'},
    {o:15,name:'취향백서',cate:'750',section:'숏컷'},{o:16,name:'선물추천',cate:'285',section:'숏컷'},
    {o:17,name:'프로모션',cate:'514',section:'숏컷'},{o:18,name:'with artist',cate:'804',section:'숏컷'},
    {o:19,name:'PB Only',cate:'320',section:'숏컷'},{o:20,name:'위베이크',cate:'254',section:'숏컷'},
    {o:21,name:'뉴스레터',path:'/newsletter/list.html',section:'숏컷'},
    // 카테고리 칩 10개 (버튼 자체는 URL 이동 없지만, 안의 상품 클릭시 각기 다른
    // cate_no로 이동 확인됨 - 2026-07-29 재확인. 615~624 순차 확인.
    {o:22,name:'테이블웨어',cate:'615',section:'카테고리'},{o:23,name:'홈데코',cate:'616',section:'카테고리'},
    {o:24,name:'가구',cate:'617',section:'카테고리'},{o:25,name:'패브릭',cate:'618',section:'카테고리'},
    {o:26,name:'프레그런스',cate:'619',section:'카테고리'},{o:27,name:'가전·디지털',cate:'620',section:'카테고리'},
    {o:28,name:'스테이셔너리',cate:'621',section:'카테고리'},{o:29,name:'패션·뷰티',cate:'622',section:'카테고리'},
    {o:30,name:'펫',cate:'623',section:'카테고리'},{o:31,name:'푸드',cate:'624',section:'카테고리'},
    // 선물추천 - 금액별 칩(기본) (기존 재확인)
    {o:32,name:'10만원 미만',cate:'722',section:'선물추천 · 금액별'},{o:33,name:'10만원대',cate:'723',section:'선물추천 · 금액별'},
    {o:34,name:'20만원대',cate:'724',section:'선물추천 · 금액별'},{o:35,name:'30만원대',cate:'725',section:'선물추천 · 금액별'},
    {o:36,name:'40만원대',cate:'726',section:'선물추천 · 금액별'},{o:37,name:'50만원대',cate:'727',section:'선물추천 · 금액별'},
    {o:38,name:'전체 보기',cate:'374',section:'선물추천 · 금액별'},
    // 선물추천 - 테마별 칩 (2026-07-29 확인)
    {o:39,name:'선물 포장 제공',cate:'710',section:'선물추천 · 테마별'},{o:40,name:'베스트셀러',cate:'230',section:'선물추천 · 테마별'},
    {o:41,name:'결혼, 집들이',cate:'718',section:'선물추천 · 테마별'},{o:42,name:'격식 있는 선물',cate:'719',section:'선물추천 · 테마별'},
    {o:43,name:'메세지 키트',cate:'721',section:'선물추천 · 테마별'},{o:44,name:'미식가를 위한',cate:'720',section:'선물추천 · 테마별'},
    // 선물추천 - 브랜드별 칩 (2026-07-29 확인)
    // 전부 검색 결과 페이지로 이동(cate_no 228 공용)이라 URL의 keyword= 값으로 개별 추적.
    // '수토'는 전용 상품 페이지(product_no=15815)로 이동함이 확인됨.
    {o:45,name:'채킴',keyword:'채킴',section:'선물추천 · 브랜드별'},{o:46,name:'프린트베이커리',keyword:'프린트베이커리',section:'선물추천 · 브랜드별'},
    {o:47,name:'메종다르',keyword:'메종다르',section:'선물추천 · 브랜드별'},{o:48,name:'수토',pno:'15815',section:'선물추천 · 브랜드별'},
    {o:49,name:'알보우',keyword:'알보우',section:'선물추천 · 브랜드별'},{o:50,name:'나임포터리',keyword:'나임포터리',section:'선물추천 · 브랜드별'},
    // 추천 브랜드 (2026-07-29 재확인, 8명)
    {o:51,name:'전체 보기',cate:'230',section:'추천 브랜드'},
    {o:52,name:'발롱 드 파리',pno:'16915',section:'추천 브랜드'},{o:53,name:'유앤어스',pno:'16899',section:'추천 브랜드'},
    {o:54,name:'다비데그로피',pno:'16229',section:'추천 브랜드'},{o:55,name:'메종다르',pno:'15612',section:'추천 브랜드'},
    {o:56,name:'오든크래프트',pno:'14239',section:'추천 브랜드'},{o:57,name:'퀴부',pno:'14062',section:'추천 브랜드'},
    {o:58,name:'플레잇트',pno:'9840',section:'추천 브랜드'},{o:59,name:'김하윤',pno:'7718',section:'추천 브랜드'},
    // 프로모션 진입점 (개별 상품은 링크 형태가 아니라 번호 미확보)
    {o:60,name:'프로모션 (전체 캠페인)',promoPath:true,section:'프로모션'},
    // LIFE 메인의 정렬 구좌 (GA4 에서 609&sort_method=6 / =5 확인)
    {o:61,name:'인기 상품',cate:'609',sort:'6',section:'정렬 구좌'},
    {o:62,name:'신상품',cate:'609',sort:'5',section:'정렬 구좌'},
  ],
};

// sort_method 코드 → 사람이 읽는 이름 (cafe24: 5=신상품순, 6=인기순, 8=조회수순)
const SORT_LABEL = { '5': '신상품순', '6': '인기순', '8': '조회수순' };

async function buildSlotPerf(propertyId, token, ranges, exclRaw, autoExclLowEngagement) {
  // 제외는 GA4 쿼리 단계에서 처리한다(아래 fetchTab). 워커에서 행마다 거르지 않음.
  let badPairs=[], badCampaigns=[];
  if(autoExclLowEngagement){
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, ranges.after.start, ranges.after.end));
  }

  // 한 탭(home)의 한 기간: referrer가 home 인 목적지만 GA4에서 필터해서 받음 → 데이터 최소화
  async function fetchTab(home, startDate, endDate){
    // [2026-07-30 성능 수정] movesFrom 과 같은 이유로 sourceMedium·country 차원을 제거하고
    // 제외 조건을 GA4 dimensionFilter 로 넘긴다. 두 차원은 거르는 용도로만 썼다.
    const rows=await runReport(propertyId, token, {
      dateRanges:[{startDate,endDate}],
      dimensions:[{name:'pagePathPlusQueryString'},{name:'pageReferrer'}],
      metrics:[{name:'sessions'},{name:'userEngagementDuration'}],
      dimensionFilter: andFilters(
        buildExclusionFilter(exclRaw, badPairs, badCampaigns),
        { filter:{ fieldName:'pageReferrer', stringFilter:{ matchType:'CONTAINS', value:home } } }),
      limit:10000,
    });
    // product_no / cate_no 별로 합산 (Map). 상품 상세 URL은 product_no와 cate_no를 동시에
    // 갖는 경우가 많아(예: product_no=16130&cate_no=866), 이 경우 두 집계에 다 반영해야
    // "카테고리 합계"가 그 안 상품들의 합과 맞아떨어짐.
    // 프로모션 캠페인은 cate_no가 캠페인마다 제각각(514, 1 등)이라 cate_no로 못 묶고,
    // "/promotion/detail.html" 경로 자체로 묶어야 함 (2026-07-29 확인).
    //
    // [2026-09-10] byCsortless / byCS 추가.
    // 정렬 구좌(cate_no 는 같고 sort_method 로만 갈리는 자리)를 별도로 세기 위함.
    //   byC         : cate_no 전체 (정렬 변형 포함) — 기존 동작 유지용
    //   byCsortless : sort_method 가 없는 유입만 — 부모 구좌(글로벌네비 등)용
    //   byCS        : `cate|sort` 조합 — 정렬 구좌용
    const byP={}, byC={}, byCP={}, byPromo={}, byPath={}, byKeyword={}, byCS={}, byCsortless={};
    for(const r of rows){
      const path=r.dimensionValues[0].value;
      const se=Number(r.metricValues[0].value), en=Number(r.metricValues[1].value);
      const pm=path.match(/product_no=(\d+)/);
      const cm=path.match(/(?:cate_no|category_no)=(\d+)/);
      if(pm){ (byP[pm[1]]=byP[pm[1]]||{s:0,e:0}); byP[pm[1]].s+=se; byP[pm[1]].e+=en; }
      if(cm){
        (byC[cm[1]]=byC[cm[1]]||{s:0,e:0}); byC[cm[1]].s+=se; byC[cm[1]].e+=en;
        const smm=path.match(/sort_method=(\d+)/);
        if(smm){ const k=`${cm[1]}|${smm[1]}`; (byCS[k]=byCS[k]||{s:0,e:0}); byCS[k].s+=se; byCS[k].e+=en; }
        else   { (byCsortless[cm[1]]=byCsortless[cm[1]]||{s:0,e:0}); byCsortless[cm[1]].s+=se; byCsortless[cm[1]].e+=en; }
      }
      if(pm && cm){
        const c=cm[1], p=pm[1];
        (byCP[c]=byCP[c]||{});
        (byCP[c][p]=byCP[c][p]||{s:0,e:0});
        byCP[c][p].s+=se; byCP[c][p].e+=en;
      }
      if(pm && path.includes('/promotion/detail.html')){
        (byPromo[pm[1]]=byPromo[pm[1]]||{s:0,e:0});
        byPromo[pm[1]].s+=se; byPromo[pm[1]].e+=en;
      }
      // product_no/cate_no 둘 다 없는 정적 페이지(예: /company/archive.html) 매칭용
      const pathOnly = path.split('?')[0];
      (byPath[pathOnly]=byPath[pathOnly]||{s:0,e:0});
      byPath[pathOnly].s+=se; byPath[pathOnly].e+=en;
      // 검색 결과 페이지로 가는 칩(작가별 일부, 브랜드별)은 cate_no가 전부 228 공용이라
      // 구분이 안 됨 → URL의 keyword= 값으로 개별 추적 (2026-07-29 확인)
      const kwm = path.match(/keyword=([^&]+)/);
      if (kwm) {
        let kw;
        try { kw = decodeURIComponent(kwm[1]); } catch (e) { kw = kwm[1]; }
        (byKeyword[kw]=byKeyword[kw]||{s:0,e:0});
        byKeyword[kw].s+=se; byKeyword[kw].e+=en;
      }
    }
    return {byP,byC,byCP,byPromo,byPath,byKeyword,byCS,byCsortless};
  }
  // [2026-09-10] sortedCates: 이 탭에서 sort 변형 구좌가 존재하는 cate 목록.
  // 그런 cate 의 부모 구좌는 sort_method 없는 유입만 세야 이중 계상이 안 생긴다.
  const sortedCatesOf = (tab)=>new Set((SLOT_MAP[tab]||[]).filter(s=>s.sort).map(s=>s.cate));
  const get=(agg,slot,sortedCates)=>{
    let v;
    if(slot.promoPath) v = Object.values(agg.byPromo).reduce((acc,x)=>({s:acc.s+x.s,e:acc.e+x.e}),{s:0,e:0});
    else if(slot.keyword) v = agg.byKeyword[slot.keyword];
    else if(slot.path) v = agg.byPath[slot.path];
    else if(slot.sort) v = agg.byCS[`${slot.cate}|${slot.sort}`];
    else if(slot.pno) v = agg.byP[slot.pno];
    else if(slot.cate) v = (sortedCates && sortedCates.has(slot.cate)) ? agg.byCsortless[slot.cate] : agg.byC[slot.cate];
    const s=v?v.s:0, e=v?v.e:0;
    return { sessions:s, dwell: s?Math.round(e/s):0 };
  };
  // 카테고리(cate) 또는 프로모션(promoPath) 슬롯이면, 그 안에 실제로 유입이 있었던
  // 개별 상품/캠페인 "전부"를 실시간으로 뽑아줌 (인기순 정렬만 하고 자르지 않음)
  const topProducts=(agg,slot)=>{
    if(slot.promoPath){
      return Object.entries(agg.byPromo)
        .map(([pno,v])=>({pno, sessions:v.s, dwell: v.s?Math.round(v.e/v.s):0}))
        .sort((a,b)=>b.sessions-a.sessions);
    }
    if(!slot.cate || !agg.byCP[slot.cate]) return [];
    return Object.entries(agg.byCP[slot.cate])
      .map(([pno,v])=>({pno, sessions:v.s, dwell: v.s?Math.round(v.e/v.s):0}))
      .sort((a,b)=>b.sessions-a.sessions);
  };

  const out={};
  for(const [tab,home] of [['art','art.html'],['life','life.html']]){
    const B=await fetchTab(home, ranges.before.start, ranges.before.end);
    const A=await fetchTab(home, ranges.after.start, ranges.after.end);
    const SC=sortedCatesOf(tab);
    const totB=SLOT_MAP[tab].reduce((s,sl)=>s+get(B,sl,SC).sessions,0)||1;
    const totA=SLOT_MAP[tab].reduce((s,sl)=>s+get(A,sl,SC).sessions,0)||1;
    out[tab]=SLOT_MAP[tab].map(sl=>{
      const b=get(B,sl,SC), a=get(A,sl,SC);
      const nm = sl.sort ? `${sl.name} (${SORT_LABEL[sl.sort]||'sort_method='+sl.sort})` : sl.name;
      return {order:sl.o,name:nm,section:sl.section,pno:sl.pno||null,cate:sl.cate||null,sort:sl.sort||null,staticName:nm,
        before:{sessions:b.sessions,share:b.sessions/totB*100,dwell:b.dwell},
        after:{sessions:a.sessions,share:a.sessions/totA*100,dwell:a.dwell},
        topProducts: topProducts(A, sl)}; // 카테고리 슬롯이면 그 안 개별 상품 실시간 랭킹(선택 기간 기준)
    });
  }
  return out;
}


// 일별 추이: 선택 기간의 날짜별 주요 지표
async function buildDaily(propertyId, token, startDate, endDate, exclRaw, autoExclLowEngagement){
  const excl=(exclRaw||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  let badPairs=[], badCampaigns=[];
  if(autoExclLowEngagement){
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, startDate, endDate));
  }
  const campFilter = campaignOnlyFilter(badCampaigns);
  const badSet = new Set(badPairs);   // 행마다 조회하므로 배열 대신 Set (O(1))
  const isExcl=(sm,country)=>{
    if(excl.some(x=>(sm||'').toLowerCase().includes(x))) return true;
    if(country && badSet.size){
      const key=`${(sm||'').toLowerCase()}||${country.toLowerCase()}`;
      if(badSet.has(key)) return true;
    }
    return false;
  };
  const evRows=await runReport(propertyId,token,{
    dateRanges:[{startDate,endDate}],
    dimensions:[{name:'date'},{name:'eventName'},{name:'sessionSourceMedium'},{name:'country'}],
    metrics:[{name:'eventCount'},{name:'sessions'}],
    ...(campFilter ? { dimensionFilter: campFilter } : {}),
    limit:100000,
  });
  const byDate={};
  const ensure=(d)=>byDate[d]||(byDate[d]={date:d,sessions:0,first_visit:0,add_to_cart:0,purchase:0,view_detail:0});
  // [2026-07-30 단위 통일] add_to_cart·purchase를 eventCount(행동 횟수)에서 sessions(그 이벤트가
  // 발생한 세션 수)로 교체. 퍼널은 "몇 번 담았나"가 아니라 "몇 세션이 이 단계에 도달했나"를 재는
  // 것이므로 위 단계(방문=세션)와 단위가 같아야 통과율이 성립함. 상품 5개를 담아도 1로 셈.
  // → 이 변경으로 장바구니·구매 수치가 이전보다 작아짐 (부정확했던 게 정확해진 것).
  for(const r of evRows){
    const d=r.dimensionValues[0].value, name=r.dimensionValues[1].value, sm=r.dimensionValues[2].value, country=r.dimensionValues[3].value;
    if(isExcl(sm,country))continue;
    const o=ensure(d);
    if(name==='session_start') o.sessions+=Number(r.metricValues[1].value);
    if(name==='first_visit') o.first_visit+=Number(r.metricValues[0].value);
    if(name==='add_to_cart') o.add_to_cart+=Number(r.metricValues[1].value);
    if(name==='purchase') o.purchase+=Number(r.metricValues[1].value);
  }
  const pgRows=await runReport(propertyId,token,{
    dateRanges:[{startDate,endDate}],
    dimensions:[{name:'date'},{name:'pagePath'},{name:'sessionSourceMedium'},{name:'country'}],
    metrics:[{name:'screenPageViews'}],
    dimensionFilter: andFilters(campFilter, {filter:{fieldName:'pagePath',stringFilter:{matchType:'CONTAINS',value:'/product/detail'}}}),
    limit:100000,
  });
  for(const r of pgRows){
    const d=r.dimensionValues[0].value, sm=r.dimensionValues[2].value, country=r.dimensionValues[3].value;
    if(isExcl(sm,country))continue;
    ensure(d).view_detail+=Number(r.metricValues[0].value);
  }
  return Object.values(byDate).sort((a,b)=>a.date.localeCompare(b.date));
}


// 획득: 유입 소스별 / 디바이스별 세션 순위 (선택 기간 기준)
// 상위 N개 국가별로, 실제 어떤 페이지를 봤는지 상세 진단 (봇/스크래퍼 패턴 확인용)
async function buildTopCountriesDetail(propertyId, token, startDate, endDate, topN) {
  // 1) 세션 많은 상위 국가부터 추리기
  const countryRows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'country' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: topN,
  });
  const total = countryRows.reduce((s, r) => s + Number(r.metricValues[0].value), 0) || 1;
  const topCountries = countryRows.map(r => ({
    country: r.dimensionValues[0].value,
    sessions: Number(r.metricValues[0].value),
    share: Number(r.metricValues[0].value) / total * 100,
  }));

  // 2) 국가마다 실제로 본 페이지 상세 (병렬 조회)
  const details = await Promise.all(topCountries.map(async (c) => {
    const rows = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }, { name: 'sessionSourceMedium' }],
      metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }, { name: 'userEngagementDuration' }],
      dimensionFilter: { filter: { fieldName: 'country', stringFilter: { matchType: 'EXACT', value: c.country } } },
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    });
    const pages = rows.map(r => ({
      path: r.dimensionValues[0].value,
      source: r.dimensionValues[1].value,
      sessions: Number(r.metricValues[0].value),
      pageviews: Number(r.metricValues[1].value),
      avgEngagementSec: Number(r.metricValues[0].value) ? Math.round(Number(r.metricValues[2].value) / Number(r.metricValues[0].value)) : 0,
    }));
    return { ...c, pages };
  }));
  return details;
}

// ===== 장바구니 분석 + 구매 경로 =====
// GA4에 begin_checkout이 없고 remove_from_cart가 있어서, 이벤트 + 페이지를 섞어서 본다.
async function buildCartAnalysis(propertyId, token, startDate, endDate, exclRaw, autoExclLowEngagement){
  let badPairs=[], badCampaigns=[];
  if(autoExclLowEngagement){
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, startDate, endDate));
  }
  const exclFilter = buildExclusionFilter(exclRaw, badPairs, badCampaigns);

  // 1) 이벤트별 세션 수 (담기 / 제거 / 구매)
  const evRows = await runReport(propertyId, token, {
    dateRanges:[{startDate,endDate}],
    dimensions:[{name:'eventName'}],
    metrics:[{name:'sessions'},{name:'eventCount'}],
    ...(exclFilter ? { dimensionFilter: exclFilter } : {}),
    limit:200,
  });
  const ev={};
  for(const r of evRows){
    ev[r.dimensionValues[0].value] = {
      sessions: Number(r.metricValues[0].value),
      count: Number(r.metricValues[1].value),
    };
  }
  const E=(n,f)=>ev[n]? ev[n][f] : 0;

  // 2) 페이지별 세션 수 (장바구니 페이지 / 장바구니 모달 / 주문서 페이지)
  const pgRows = await runReport(propertyId, token, {
    dateRanges:[{startDate,endDate}],
    dimensions:[{name:'pagePath'}],
    metrics:[{name:'sessions'},{name:'screenPageViews'}],
    ...(exclFilter ? { dimensionFilter: exclFilter } : {}),
    limit:5000,
  });
  let basketSessions=0, orderSessions=0, basketViews=0, orderViews=0;
  // [2026-08-13] 장바구니 모달(/order/basket-modal.html)을 별도 집계.
  // 예전에는 /basket|cart/ 정규식이 모달까지 잡아 장바구니 페이지 수치에 합산됐다.
  // 모달은 페이지 이동이 아니라 팝업이라, 거의 모든 세션에서 발생해 장바구니 도달을
  // 크게 부풀렸다 (2026-06: 장바구니 세션 100,584 = 전체 세션의 95%, 조회수 495,019).
  let modalSessions=0, modalViews=0;
  for(const r of pgRows){
    const p=(r.dimensionValues[0].value||'').toLowerCase();
    const se=Number(r.metricValues[0].value), vw=Number(r.metricValues[1].value);
    if(p.includes('basket-modal')) { modalSessions+=se; modalViews+=vw; }      // 모달 먼저 분기
    else if(/basket|cart/.test(p)) { basketSessions+=se; basketViews+=vw; }
    else if(/orderform|\/order\/order|checkout/.test(p)) { orderSessions+=se; orderViews+=vw; }
  }

  const addCart   = E('add_to_cart','sessions');
  const removeCart= E('remove_from_cart','sessions');
  const purchase  = E('purchase','sessions');
  const addCartCnt= E('add_to_cart','count');
  const removeCnt = E('remove_from_cart','count');

  // 장바구니 지표
  const cart = {
    addSessions: addCart,
    addEvents: addCartCnt,
    removeSessions: removeCart,
    removeEvents: removeCnt,
    purchaseSessions: purchase,
    // 담은 세션 중 구매까지 간 비율 / 이탈률
    convRate: addCart? purchase/addCart*100 : 0,
    abandonRate: addCart? Math.max(0,(addCart-purchase))/addCart*100 : 0,
    abandonSessions: Math.max(0, addCart-purchase),
    // 담았다가 스스로 뺀 비율 (명시적 포기 신호)
    removeRate: addCartCnt? removeCnt/addCartCnt*100 : 0,
  };

  // 구매 경로
  // 장바구니 페이지를 거친 세션 = basketSessions, 주문서까지 간 세션 = orderSessions
  //
  // [정정 2026-07-30] 이 몰은 장바구니를 반드시 거쳐야 구매가 됩니다. 따라서 아래 값을
  // '바로구매(장바구니 미경유)'로 해석하면 틀립니다 — 그런 경로는 존재하지 않습니다.
  // 이 차이값의 실제 의미는 다음 셋 중 하나이며, 즉 추적 점검용 지표입니다:
  //   ① 세션 이월 — 어제 담아두고 오늘 결제 (가장 흔함)
  //   ② 상품 상세에서 담고 주문서로 바로 넘어가 장바구니 페이지뷰가 안 찍힌 경우
  //   ③ GA4 페이지뷰 누락
  // 필드명(directEstimate/directShare)은 index.html과의 배포 순서가 어긋날 때 화면이
  // 깨지지 않도록 그대로 두고, 화면 라벨만 '장바구니 페이지 미기록'으로 바꿨습니다.
  //
  // [재정정 2026-09-07] 구매하기 버튼이 분리되어 주문서로 직행하는 경로가 생겼습니다.
  // 분리 이후 기간에서는 이 값이 실제 '바로구매'입니다. 화면(index.html)이 기간을 보고
  // 라벨을 바꿉니다. 계산식은 그대로 둡니다.
  const directEstimate = Math.max(0, orderSessions - basketSessions);
  const path = {
    basketSessions, orderSessions, basketViews, orderViews,
    // [2026-08-13 추가] 모달은 페이지 도달이 아니므로 퍼널 계산에는 쓰지 않고 참고값으로만 내려준다.
    modalSessions, modalViews,
    viaCartEstimate: Math.min(basketSessions, orderSessions),
    directEstimate,
    directShare: orderSessions? directEstimate/orderSessions*100 : 0,
    // 주문서 → 구매 (여기가 보통 가장 아까운 이탈)
    orderToBuyRate: orderSessions? purchase/orderSessions*100 : 0,
    orderDropSessions: Math.max(0, orderSessions-purchase),
  };

  return { cart, path };
}

// ===== 세그먼트별 퍼널 =====
// 전체 퍼널 하나만 보면 병목을 못 찾음. 신규/재방문·디바이스·채널별로 쪼개서
// "어느 조합에서 유독 많이 빠지나"를 본다.
async function buildSegmentFunnel(propertyId, token, startDate, endDate, exclRaw, autoExclLowEngagement){
  let badPairs=[], badCampaigns=[];
  if(autoExclLowEngagement){
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, startDate, endDate));
  }
  const exclFilter = buildExclusionFilter(exclRaw, badPairs, badCampaigns);

  // 세그먼트 차원별로 (세션, 상품조회, 장바구니, 구매)를 구함
  async function funnelBy(dimName){
    // 1) 세션 수
    const sessRows = await runReport(propertyId, token, {
      dateRanges:[{startDate,endDate}],
      dimensions:[{name:dimName}],
      metrics:[{name:'sessions'}],
      ...(exclFilter ? { dimensionFilter: exclFilter } : {}),
    });
    // 2) 이벤트별 세션 수 (view_item / add_to_cart / purchase)
    const evRows = await runReport(propertyId, token, {
      dateRanges:[{startDate,endDate}],
      dimensions:[{name:dimName},{name:'eventName'}],
      metrics:[{name:'sessions'},{name:'eventCount'}],
      ...(exclFilter ? { dimensionFilter: exclFilter } : {}),
      limit:2000,
    });
    const bySeg={};
    const ensure=(k)=>bySeg[k]||(bySeg[k]={key:k, sessions:0, view:0, cart:0, purchase:0});
    for(const r of sessRows){
      ensure(r.dimensionValues[0].value).sessions += Number(r.metricValues[0].value);
    }
    for(const r of evRows){
      const k=r.dimensionValues[0].value, ev=r.dimensionValues[1].value;
      const sess=Number(r.metricValues[0].value);
      const o=ensure(k);
      if(ev==='view_item') o.view += sess;
      else if(ev==='add_to_cart') o.cart += sess;
      else if(ev==='purchase') o.purchase += sess;
    }
    const isNoise=(v)=>!v || v==='(not set)';
    return Object.values(bySeg)
      .filter(o=>!isNoise(o.key) && o.sessions>0)
      .map(o=>({
        key:o.key, sessions:o.sessions, view:o.view, cart:o.cart, purchase:o.purchase,
        // 단계별 통과율
        viewRate: o.sessions? o.view/o.sessions*100 : 0,
        cartRate: o.view? o.cart/o.view*100 : 0,
        buyRate: o.cart? o.purchase/o.cart*100 : 0,
        // 전체 전환율(세션→구매)
        cvr: o.sessions? o.purchase/o.sessions*100 : 0,
      }))
      .sort((a,b)=>b.sessions-a.sessions)
      .slice(0,12);
  }

  const [byNewReturning, byDevice, bySource] = await Promise.all([
    funnelBy('newVsReturning'),
    funnelBy('deviceCategory'),
    funnelBy('sessionSourceMedium'),
  ]);
  const label=(k)=> k==='new'?'신규':(k==='returning'?'재방문':k);
  return {
    byNewReturning: byNewReturning.map(o=>({...o, label:label(o.key)})),
    byDevice: byDevice.map(o=>({...o, label:o.key})),
    bySource: bySource.map(o=>({...o, label:o.key})),
  };
}

// ===== UTM 캠페인 성과 (마케팅 지표) =====
// utm_campaign / utm_source / utm_medium 별로 유입·구매·매출·전환율을 봄
async function buildUtmPerformance(propertyId, token, startDate, endDate, exclRaw, autoExclLowEngagement){
  const excl=(exclRaw||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  let badPairs=[], badCampaigns=[];
  if(autoExclLowEngagement){
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, startDate, endDate));
  }
  const campFilter = campaignOnlyFilter(badCampaigns);
  const badSet = new Set(badPairs);   // 행마다 조회하므로 배열 대신 Set (O(1))
  const isExcl=(sm,country)=>{
    if(excl.some(x=>(sm||'').toLowerCase().includes(x))) return true;
    if(country && badSet.size){
      const key=`${(sm||'').toLowerCase()}||${country.toLowerCase()}`;
      if(badSet.has(key)) return true;
    }
    return false;
  };
  const isNoise=(v)=>!v || v==='(not set)' || v==='(direct)';

  // 캠페인 + 소스/매체별로 세션·구매·매출을 한 번에 (매출 지표가 거부되면 세션만으로 폴백)
  async function fetchRows(withRevenue){
    const metrics = withRevenue
      ? [{name:'sessions'},{name:'ecommercePurchases'},{name:'purchaseRevenue'}]
      : [{name:'sessions'}];
    return await runReport(propertyId, token, {
      dateRanges:[{startDate,endDate}],
      dimensions:[{name:'sessionCampaignName'},{name:'sessionSourceMedium'},{name:'country'}],
      metrics,
      ...(campFilter ? { dimensionFilter: campFilter } : {}),
      limit:5000,
    });
  }
  let rows=[], hasRevenue=true;
  try {
    rows = await fetchRows(true);
  } catch(e) {
    console.log('[UTM] 매출 지표 조회 실패, 세션만으로 진행: ' + (e && e.message || e));
    hasRevenue=false;
    rows = await fetchRows(false);
  }

  const byCampaign={}, bySourceMedium={};
  const add=(bucket,key,se,pu,rv)=>{
    if(!bucket[key]) bucket[key]={sessions:0,purchases:0,revenue:0};
    bucket[key].sessions+=se; bucket[key].purchases+=pu; bucket[key].revenue+=rv;
  };
  for(const r of rows){
    const camp=r.dimensionValues[0].value;
    const sm=r.dimensionValues[1].value;
    const country=r.dimensionValues[2].value;
    if(isExcl(sm,country)) continue;
    const se=Number(r.metricValues[0].value);
    const pu=hasRevenue? Number(r.metricValues[1].value) : 0;
    const rv=hasRevenue? Number(r.metricValues[2].value) : 0;
    // 캠페인명이 없는 건(자연유입/직접유입) UTM 지표에서는 제외
    if(!isNoise(camp)) add(byCampaign, camp, se, pu, rv);
    if(!isNoise(sm)) add(bySourceMedium, sm, se, pu, rv);
  }
  const toList=(bucket)=>Object.entries(bucket).map(([name,v])=>({
    name, sessions:v.sessions, purchases:v.purchases, revenue:v.revenue,
    convRate: v.sessions? v.purchases/v.sessions*100 : 0,
    revPerSession: v.sessions? v.revenue/v.sessions : 0,
  })).sort((a,b)=>b.sessions-a.sessions);

  const campaigns=toList(byCampaign).slice(0,30);
  const sourceMediums=toList(bySourceMedium).slice(0,30);
  const totals=campaigns.reduce((acc,c)=>({sessions:acc.sessions+c.sessions,purchases:acc.purchases+c.purchases,revenue:acc.revenue+c.revenue}),{sessions:0,purchases:0,revenue:0});
  // excludedCampaigns: 봇·어뷰징으로 자동 제외된 캠페인 목록. 표에서 조용히 사라지면 "내 캠페인 어디 갔지"가
  // 되므로, 무엇이 걸러졌는지 응답에 담아 프론트가 안내를 띄울 수 있게 한다.
  return { campaigns, sourceMediums, hasRevenue, totals, excludedCampaigns: badCampaigns };
}

// ===== 스크롤 도달률: GA4 scroll 이벤트(페이지 90% 지점 도달 시 발생) 기준 =====
// "이 페이지를 끝까지 읽었나"를 보는 지표. scroll수 ÷ 조회수 = 도달률
async function buildScrollDepth(propertyId, token, startDate, endDate, exclRaw, autoExclLowEngagement){
  const excl=(exclRaw||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  let badPairs=[], badCampaigns=[];
  if(autoExclLowEngagement){
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, startDate, endDate));
  }
  const campFilter = campaignOnlyFilter(badCampaigns);
  const badSet = new Set(badPairs);   // 행마다 조회하므로 배열 대신 Set (O(1))
  const isExcl=(sm,country)=>{
    if(excl.some(x=>(sm||'').toLowerCase().includes(x))) return true;
    if(country && badSet.size){
      const key=`${(sm||'').toLowerCase()}||${country.toLowerCase()}`;
      if(badSet.has(key)) return true;
    }
    return false;
  };

  // 페이지별 scroll 이벤트 수
  const scrollRows = await runReport(propertyId, token, {
    dateRanges:[{startDate,endDate}],
    dimensions:[{name:'pagePath'},{name:'sessionSourceMedium'},{name:'country'}],
    metrics:[{name:'eventCount'}],
    dimensionFilter: andFilters(campFilter, { filter:{ fieldName:'eventName', stringFilter:{ matchType:'EXACT', value:'scroll' } } }),
    limit:5000,
  });
  // 페이지별 조회수(분모)
  const viewRows = await runReport(propertyId, token, {
    dateRanges:[{startDate,endDate}],
    dimensions:[{name:'pagePath'},{name:'sessionSourceMedium'},{name:'country'}],
    metrics:[{name:'screenPageViews'}],
    ...(campFilter ? { dimensionFilter: campFilter } : {}),
    limit:5000,
  });

  const scrollBy={}, viewBy={};
  for(const r of scrollRows){
    const path=r.dimensionValues[0].value, sm=r.dimensionValues[1].value, country=r.dimensionValues[2].value;
    if(isExcl(sm,country)) continue;
    scrollBy[path]=(scrollBy[path]||0)+Number(r.metricValues[0].value);
  }
  for(const r of viewRows){
    const path=r.dimensionValues[0].value, sm=r.dimensionValues[1].value, country=r.dimensionValues[2].value;
    if(isExcl(sm,country)) continue;
    viewBy[path]=(viewBy[path]||0)+Number(r.metricValues[0].value);
  }

  // 페이지 성격별로 묶어서 보여줌 (개별 상품 URL이 수천 개라 그대로 나열하면 의미 없음)
  const groupOf=(p)=>{
    if(/^\/(art|life)\.html/.test(p)) return '메인 (art·life)';
    if(/\/product\/detail/.test(p)) return '상품 상세';
    if(/\/promotion\/detail/.test(p)) return '프로모션 상세';
    if(/\/product\/list/.test(p)) return '상품 목록';
    if(/\/product\/search/.test(p)) return '검색 결과';
    if(/\/artist\/detail/.test(p)) return '아티스트 상세';
    if(/\/board|\/exhibition|\/company/.test(p)) return '기타 콘텐츠';
    return null; // 나머지는 제외
  };
  const agg={};
  for(const p of Object.keys(viewBy)){
    const g=groupOf(p);
    if(!g) continue;
    if(!agg[g]) agg[g]={views:0, scrolls:0};
    agg[g].views += viewBy[p];
    agg[g].scrolls += (scrollBy[p]||0);
  }
  const byPageGroup = Object.entries(agg).map(([name,v])=>({
    name, views:v.views, scrolls:v.scrolls, rate: v.views? v.scrolls/v.views*100 : 0,
  })).sort((a,b)=>b.views-a.views);

  const totalViews = byPageGroup.reduce((x,g)=>x+g.views,0);
  const totalScrolls = byPageGroup.reduce((x,g)=>x+g.scrolls,0);
  return { byPageGroup, overall: { views: totalViews, scrolls: totalScrolls, rate: totalViews? totalScrolls/totalViews*100 : 0 } };
}

// ===== 사이트 검색어: view_search_results 의 search_term =====
// [2026-09-01 추가]
// GA4 는 검색어가 두 군데 중 하나에 들어온다.
//   ① searchTerm            — 향상된 측정(사이트 검색)이 켜져 있고 GA4 가 쿼리 파라미터를
//                             인식했을 때 채워지는 내장 측정기준
//   ② customEvent:search_term — GTM 으로 view_search_results 를 직접 쏘는 경우.
//                             GA4 관리 → 맞춤 정의에 매개변수 search_term 이 '이벤트 범위'로
//                             등록돼 있어야 조회된다 (등록 시점 이후 데이터만 나옴).
// 어느 쪽인지 미리 알 수 없고 몰 설정에 따라 바뀔 수 있어, ① 먼저 시도하고
// 비어 있거나 GA4 가 거부하면 ② 로 넘어간다. 실제로 쓴 쪽은 dimUsed 로 내려준다.
const SEARCH_TERM_DIMS = ['searchTerm', 'customEvent:search_term'];
const SEARCH_TERM_LIMIT = 50;   // 화면에 뿌릴 상위 검색어 개수

// limitRows: 돌려줄 행 수. 생략하면 화면용 상위 50개, Infinity 면 전수(CSV 내려받기용).
async function buildSearchTerms(propertyId, token, startDate, endDate, exclRaw, autoExclLowEngagement, limitRows){
  const cap = (limitRows == null) ? SEARCH_TERM_LIMIT : limitRows;
  let badPairs=[], badCampaigns=[];
  if(autoExclLowEngagement){
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, startDate, endDate));
  }
  // 다른 탭과 같은 기준으로 봇·L포인트를 GA4 쿼리 단계에서 제외.
  // (검색어는 차원이 1개뿐이라 워커에서 소스×국가로 거를 수 없다 → 쿼리로 걸어야 함)
  const exclFilter = buildExclusionFilter(exclRaw, badPairs, badCampaigns);
  const eventFilter = { filter:{ fieldName:'eventName', stringFilter:{ matchType:'EXACT', value:'view_search_results' } } };

  for(const dim of SEARCH_TERM_DIMS){
    let rows;
    try{
      rows = await runReport(propertyId, token, {
        dateRanges:[{startDate,endDate}],
        dimensions:[{name:dim}],
        metrics:[{name:'eventCount'},{name:'activeUsers'}],
        dimensionFilter: andFilters(exclFilter, eventFilter),
        orderBys:[{metric:{metricName:'eventCount'},desc:true}],
        limit:100000,   // 전수 CSV 를 위해 넉넉히. 화면용은 아래에서 cap 으로 자른다.
      });
    }catch(e){
      // 맞춤 측정기준이 등록 안 돼 있으면 GA4 가 400 을 준다 → 다음 후보로
      console.log(`[검색어] ${dim} 조회 실패: ` + (e && e.message || e));
      continue;
    }
    const all = rows.map(r=>({
      term: (r.dimensionValues[0].value || '').trim(),
      searches: Number(r.metricValues[0].value),
      users: Number(r.metricValues[1].value),
    })).filter(x => x.term && x.term !== '(not set)' && x.term !== '(other)');

    if(!all.length) continue;   // 이 측정기준은 비어있음 → 다음 후보

    console.log(`[검색어] ${dim} 사용 · 고유 ${all.length}개 · 총 ${all.reduce((a,b)=>a+b.searches,0)}회`);
    return {
      dimUsed: dim,
      rows: all.slice(0, cap),
      uniqueTerms: all.length,
      totalSearches: all.reduce((a,b)=>a+b.searches,0),
    };
  }
  return { dimUsed: null, rows: [], uniqueTerms: 0, totalSearches: 0 };
}

async function buildAcquisition(propertyId, token, startDate, endDate, exclRaw, autoExclLowEngagement){
  const excl=(exclRaw||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  let badPairs=[], badCampaigns=[];
  if(autoExclLowEngagement){
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, startDate, endDate));
  }
  const campFilter = campaignOnlyFilter(badCampaigns);
  const badSet = new Set(badPairs);   // 행마다 조회하므로 배열 대신 Set (O(1))
  const isExcl=(sm,country)=>{
    if(excl.some(x=>(sm||'').toLowerCase().includes(x))) return true;
    if(country && badSet.size){
      const key=`${(sm||'').toLowerCase()}||${country.toLowerCase()}`;
      if(badSet.has(key)) return true;
    }
    return false;
  };

  const srcRows=await runReport(propertyId,token,{
    dateRanges:[{startDate,endDate}],
    dimensions:[{name:'sessionSourceMedium'},{name:'country'}],
    metrics:[{name:'sessions'}],
    ...(campFilter ? { dimensionFilter: campFilter } : {}),
    limit:2000,
  });
  const srcAgg={}; let srcTotal=0;
  for(const r of srcRows){
    const sm=r.dimensionValues[0].value, country=r.dimensionValues[1].value, n=Number(r.metricValues[0].value);
    if(isExcl(sm,country)) continue;
    srcAgg[sm]=(srcAgg[sm]||0)+n; srcTotal+=n;
  }
  const bySource=Object.entries(srcAgg).map(([name,sessions])=>({name,sessions,share:srcTotal?sessions/srcTotal*100:0}))
    .sort((a,b)=>b.sessions-a.sessions);

  const devRows=await runReport(propertyId,token,{
    dateRanges:[{startDate,endDate}],
    dimensions:[{name:'deviceCategory'},{name:'sessionSourceMedium'},{name:'country'}],
    metrics:[{name:'sessions'}],
    ...(campFilter ? { dimensionFilter: campFilter } : {}),
    limit:3000,
  });
  const devAgg={}; let devTotal=0;
  for(const r of devRows){
    const dev=r.dimensionValues[0].value, sm=r.dimensionValues[1].value, country=r.dimensionValues[2].value, n=Number(r.metricValues[0].value);
    if(isExcl(sm,country)) continue;
    devAgg[dev]=(devAgg[dev]||0)+n; devTotal+=n;
  }
  const byDevice=Object.entries(devAgg).map(([name,sessions])=>({name,sessions,share:devTotal?sessions/devTotal*100:0}))
    .sort((a,b)=>b.sessions-a.sessions);

  // 국가별 유입 + 평균 체류시간 (봇/광고성 이상 트래픽 판별용)
  // 이 표는 '무엇을 걸러야 하는지 찾는' 용도라 자동제외 필터를 걸지 않는다.
  // 걸러버리면 정작 봐야 할 대상이 사라져 판별이 불가능하다.
  // 수동 제외(L포인트 등)만 적용한다.
  const countryRows=await runReport(propertyId,token,{
    dateRanges:[{startDate,endDate}],
    dimensions:[{name:'country'},{name:'sessionSourceMedium'}],
    metrics:[{name:'sessions'},{name:'userEngagementDuration'}],
    limit:2000,
  });
  const countryAgg={}; let countryTotal=0;
  for(const r of countryRows){
    const country=r.dimensionValues[0].value, sm=r.dimensionValues[1].value;
    const n=Number(r.metricValues[0].value), eng=Number(r.metricValues[1].value);
    if(excl.some(x=>(sm||'').toLowerCase().includes(x))) continue; // 수동 제외만
    if(!countryAgg[country]) countryAgg[country]={sessions:0,engagement:0};
    countryAgg[country].sessions+=n; countryAgg[country].engagement+=eng; countryTotal+=n;
  }
  const byCountry=Object.entries(countryAgg).map(([name,v])=>({
    name, sessions:v.sessions, share:countryTotal?v.sessions/countryTotal*100:0,
    avgEngagementSec: v.sessions? Math.round(v.engagement/v.sessions):0,
  })).sort((a,b)=>b.sessions-a.sessions).slice(0,20);

  return { bySource: bySource.slice(0,15), byDevice, byCountry };
}



// ── DAU / WAU / MAU (어제 기준 고정 윈도우, 기간 선택과 무관) ──

// ── 월별 MAU 추이 (최근 13개월, IR용 성장 곡선) ──
async function buildMonthlyUsers(propertyId, token, exclRaw, autoExclLowEngagement){
  const kst = new Date(Date.now() + 9*3600*1000);
  const end = new Date(kst); end.setUTCDate(end.getUTCDate()-1);
  const start = new Date(end); start.setUTCMonth(start.getUTCMonth()-12); start.setUTCDate(1);
  const fmtD=(d)=>d.toISOString().slice(0,10);

  // [2026-07-30] 예전엔 이 함수만 제외 필터를 아예 안 받아서, 정크 캠페인이 유입된 달의
  // MAU가 3배 가까이 부풀었음 (실측: 평소 5~12만이던 월간 값이 34만으로 표시).
  // 다른 지표와 같은 기준(봇 의심 조합+캠페인, 수동 제외)을 GA4 쿼리 레벨로 적용한다.
  let badPairs=[], badCampaigns=[];
  if(autoExclLowEngagement){
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, fmtD(start), fmtD(end)));
  }
  const exclFilter = buildExclusionFilter(exclRaw, badPairs, badCampaigns);

  const rows = await runReport(propertyId, token, {
    dateRanges: [{ startDate: fmtD(start), endDate: fmtD(end) }],
    dimensions: [{ name: 'yearMonth' }],
    metrics: [{ name: 'activeUsers' }],
    ...(exclFilter ? { dimensionFilter: exclFilter } : {}),
    orderBys: [{ dimension: { dimensionName: 'yearMonth' } }],
  });
  return rows.map(r => ({ month: r.dimensionValues[0].value, activeUsers: Number(r.metricValues[0].value) }));
}

// ── 유저 세그먼트: 신규/재방문, 디바이스, 구매금액대별 행동 비교 ──
// 제외 조건을 GA4 쿼리 단계에서 걸기 위한 필터를 만듦.
// (참여율·평균체류시간 같은 "평균" 지표는 나중에 빼는 방식이 불가능해서, 애초에 제외하고 계산시켜야 정확함)
function buildExclusionFilter(exclRaw, badPairs, badCampaigns){
  const excl=(exclRaw||'').split(',').map(x=>x.trim()).filter(Boolean);
  const ors=[];
  for(const x of excl){
    ors.push({ filter:{ fieldName:'sessionSourceMedium', stringFilter:{ matchType:'CONTAINS', value:x, caseSensitive:false } } });
  }
  // 조합이 너무 많으면 필터가 비대해지므로 상위 25개까지만 (대부분 소수의 조합이 대다수를 차지)
  for(const pair of (badPairs||[]).slice(0,25)){
    const [sm,country]=pair.split('||');
    ors.push({ andGroup:{ expressions:[
      { filter:{ fieldName:'sessionSourceMedium', stringFilter:{ matchType:'EXACT', value:sm, caseSensitive:false } } },
      { filter:{ fieldName:'country', stringFilter:{ matchType:'EXACT', value:country, caseSensitive:false } } },
    ]}});
  }
  // 봇 의심 캠페인 제외 (소스와 별개 축 — 정크가 여러 소스로 흩어져도 캠페인명으로 묶어서 잡음)
  for(const camp of (badCampaigns||[]).slice(0,15)){
    ors.push({ filter:{ fieldName:'sessionCampaignName', stringFilter:{ matchType:'EXACT', value:camp, caseSensitive:false } } });
  }
  if(!ors.length) return null;
  return { notExpression: { orGroup: { expressions: ors } } };
}
function andFilters(a, b){
  if(!a) return b || undefined;
  if(!b) return a;
  return { andGroup: { expressions: [a, b] } };
}

// 봇 의심 캠페인만 제외하는 GA4 dimensionFilter.
// JS단에서 소스×국가로 거르는 함수들은 응답 행에 캠페인 차원이 없어서 JS로는 캠페인을
// 못 거른다 → 쿼리 단계에서 걸어야 정확함. badCampaigns가 비면 undefined (필터 없음).
function campaignOnlyFilter(badCampaigns){
  if(!badCampaigns || !badCampaigns.length) return undefined;
  return buildExclusionFilter(null, [], badCampaigns);
}

async function buildUserSegments(propertyId, token, startDate, endDate, exclRaw, autoExclLowEngagement){
  let badPairs=[], badCampaigns=[];
  if(autoExclLowEngagement){
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, startDate, endDate));
  }
  const exclFilter = buildExclusionFilter(exclRaw, badPairs, badCampaigns);

  async function behaviorByDim(dimName){
    const rows = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: dimName }],
      metrics: [{ name: 'sessions' }, { name: 'engagementRate' }, { name: 'averageSessionDuration' }],
      ...(exclFilter ? { dimensionFilter: exclFilter } : {}),
    });
    const purchRows = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: dimName }, { name: 'eventName' }],
      metrics: [{ name: 'sessions' }],
      dimensionFilter: andFilters(exclFilter, { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'purchase' } } }),
    });
    return rows.map(r => {
      const key = r.dimensionValues[0].value;
      const sessions = Number(r.metricValues[0].value);
      const engagementRate = Number(r.metricValues[1].value) * 100;
      const avgDuration = Math.round(Number(r.metricValues[2].value));
      const pr = purchRows.find(p => p.dimensionValues[0].value === key);
      const purchSessions = pr ? Number(pr.metricValues[0].value) : 0;
      return { key, sessions, engagementRate, avgDuration, convRate: sessions ? purchSessions / sessions * 100 : 0 };
    }).sort((a, b) => b.sessions - a.sessions);
  }

  const nvrRaw = await behaviorByDim('newVsReturning');
  // GA4가 판별 못한 값((not set) 등)은 의미 없으니 제외
  const isNoise = (k) => !k || /^\(.*\)$/.test(k) || k === '(not set)';
  const byNewReturning = nvrRaw
    .filter(r => !isNoise(r.key))
    .map(r => ({ ...r, label: r.key === 'new' ? '신규' : (r.key === 'returning' ? '재방문' : r.key) }));

  const devRaw = await behaviorByDim('deviceCategory');
  const byDevice = devRaw.filter(r => !isNoise(r.key)).map(r => ({ ...r, label: r.key }));

  // 구매금액대별: transactionId별 구매금액을 집계해서 구간화
  const txnRows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'transactionId' }],
    metrics: [{ name: 'purchaseRevenue' }],
    ...(exclFilter ? { dimensionFilter: exclFilter } : {}),
    limit: 10000,
  });
  const tiers = [
    { label: '5만원 미만', min: 0, max: 50000 },
    { label: '5~10만원', min: 50000, max: 100000 },
    { label: '10~30만원', min: 100000, max: 300000 },
    { label: '30~50만원', min: 300000, max: 500000 },
    { label: '50만원 이상', min: 500000, max: Infinity },
  ];
  const byAmount = tiers.map(t => ({ label: t.label, count: 0, revenue: 0 }));
  for (const r of txnRows) {
    const txnId = r.dimensionValues[0].value;
    if (!txnId || txnId === '(not set)') continue;
    const rev = Number(r.metricValues[0].value);
    if (!rev) continue;
    const idx = tiers.findIndex(t => rev >= t.min && rev < t.max);
    if (idx >= 0) { byAmount[idx].count++; byAmount[idx].revenue += rev; }
  }

  return { byNewReturning, byDevice, byAmount };
}

// ── 코호트 리텐션 곡선 (Day 0~30, IR용) ──
// 최근 첫 방문한 사용자들이 이후 며칠간 얼마나 다시 오는지 비율(%)로.
async function buildRetentionCohort(propertyId, token){
  const kst = new Date(Date.now() + 9*3600*1000);
  const end = new Date(kst); end.setUTCDate(end.getUTCDate()-31); // 30일 추적 가능하려면 최소 31일 전 시작한 사람들
  const start = new Date(end); start.setUTCDate(start.getUTCDate()-30); // 그 앞 30일간 신규 유입한 코호트
  const fmtD=(d)=>d.toISOString().slice(0,10);

  const body = {
    dimensions: [{ name: 'cohort' }, { name: 'cohortNthDay' }],
    metrics: [{ name: 'cohortActiveUsers' }, { name: 'cohortTotalUsers' }],
    cohortSpec: {
      cohorts: [{ dimension: 'firstSessionDate', name: 'cohort', dateRange: { startDate: fmtD(start), endDate: fmtD(end) } }],
      cohortsRange: { granularity: 'DAILY', startOffset: 0, endOffset: 30 },
    },
  };
  const rows = await runReport(propertyId, token, body);
  const points = rows.map(r => {
    // dimensionValues: [0]=cohort 이름, [1]=cohortNthDay
    const nthDay = Number(r.dimensionValues[1].value);
    const active = Number(r.metricValues[0].value);
    const total = Number(r.metricValues[1].value);
    return { day: nthDay, retention: total ? (active/total*100) : 0 };
  }).sort((a,b)=>a.day-b.day);
  return points;
}

async function buildActiveUsers(propertyId, token, autoExclLowEngagement, exclRaw){
  const kst = new Date(Date.now() + 9*3600*1000);
  const yesterday = new Date(kst); yesterday.setUTCDate(yesterday.getUTCDate()-1);
  const fmtD=(d)=>d.toISOString().slice(0,10);
  const end = fmtD(yesterday);
  const shiftDays=(base,n)=>{const d=new Date(base); d.setUTCDate(d.getUTCDate()+n); return d;};
  const daysAgo=(n)=>fmtD(shiftDays(yesterday,-(n-1)));

  // 체리피커(국적 무관, 평균체류 5초 미만) 판정: MAU 창(가장 넓은 구간) 기준으로 한 번만 계산해 재사용
  let badPairs = [], badCampaigns = [];
  if (autoExclLowEngagement) {
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, daysAgo(28), end));
  }
  const campFilter = campaignOnlyFilter(badCampaigns);
  const badSet = new Set(badPairs);   // 행마다 조회하므로 배열 대신 Set (O(1))
  // L포인트 등 수동 제외도 DAU/WAU/MAU에 같이 적용 (예전엔 여기만 빠져서 다른 지표와 기준이 달랐음)
  const excl = (exclRaw || '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  const isExcl = (sm, country) => {
    if (excl.some(x => (sm||'').toLowerCase().includes(x))) return true;
    if (country && badSet.size) {
      const key = `${(sm||'').toLowerCase()}||${country.toLowerCase()}`;
      if (badSet.has(key)) return true;
    }
    return false;
  };

  async function activeUsersFor(startDate,endDate){
    const rows=await runReport(propertyId,token,{
      dateRanges:[{startDate,endDate}],
      metrics:[{name:'activeUsers'}],
      ...(campFilter ? { dimensionFilter: campFilter } : {}),
    });
    const raw = rows.length? Number(rows[0].metricValues[0].value) : 0;
    if (!badPairs.length && !excl.length) return raw;

    // 제외 대상(체리피커 조합 / 수동 제외)의 사용자만 따로 집계해서 뺌
    // (차원별로 전체를 재집계하면 같은 사람이 여러 번 잡혀 부풀려지므로, 빼는 방식으로 근사)
    const dimRows = await runReport(propertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionSourceMedium' }, { name: 'country' }],
      metrics: [{ name: 'activeUsers' }],
      ...(campFilter ? { dimensionFilter: campFilter } : {}),
      limit: 2000,
    });
    let bad = 0;
    for (const r of dimRows) {
      const sm = r.dimensionValues[0].value, country = r.dimensionValues[1].value;
      if (isExcl(sm, country)) bad += Number(r.metricValues[0].value);
    }
    return Math.max(0, raw - bad);
  }

  // 각 지표를 "같은 길이의 직전 기간"과 함께 조회
  // DAU: 어제 vs 그저께 / WAU: 최근7일 vs 그 이전 7일 / MAU: 최근28일 vs 그 이전 28일
  const dayBeforeYesterday = fmtD(shiftDays(yesterday,-1));
  const wauPrevEnd = fmtD(shiftDays(yesterday,-7));
  const wauPrevStart = fmtD(shiftDays(yesterday,-13));
  const mauPrevEnd = fmtD(shiftDays(yesterday,-28));
  const mauPrevStart = fmtD(shiftDays(yesterday,-55));

  const [dau, dauBefore, wau, wauBefore, mau, mauBefore] = await Promise.all([
    activeUsersFor(end, end),
    activeUsersFor(dayBeforeYesterday, dayBeforeYesterday),
    activeUsersFor(daysAgo(7), end),
    activeUsersFor(wauPrevStart, wauPrevEnd),
    activeUsersFor(daysAgo(28), end),
    activeUsersFor(mauPrevStart, mauPrevEnd),
  ]);
  const stickiness = mau ? (dau/mau*100) : 0;
  const stickinessBefore = mauBefore ? (dauBefore/mauBefore*100) : 0;
  return { referenceDate: end, dau, dauBefore, wau, wauBefore, mau, mauBefore, stickiness, stickinessBefore };
}


// 진단용: 선택 기간에 실제로 GA4에 잡힌 이벤트 이름들을 건수 많은 순으로 반환
async function buildEventList(propertyId, token, startDate, endDate){
  const rows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 100,
  });
  return rows.map(r => ({ name: r.dimensionValues[0].value, count: Number(r.metricValues[0].value) }));
}

// 평균 체류시간이 매우 짧은(봇/어뷰징 의심) "국가+유입소스 조합"을 찾아냄.
// 소스 하나만 보면 direct/none처럼 정상 고객도 많이 섞인 경로까지 통째로 빠질 위험이 있어서,
// 반드시 국가와 소스를 같이 봐서 "이 조합"만 콕 집어 제외.
// ── 봇·어뷰징 트래픽 자동 탐지 ──
// [2026-07-30 재설계]
// (1) 한국 면제 제거. 예전엔 해외만 검사했는데, 한국발 정크 캠페인(예: 하루 5만 세션·체류 0초)이
//     그대로 통과해 MAU가 3배 부풀고 UTM 표를 오염시켰음. 판별 기준은 국적이 아니라 행동.
//     오분류 방어는 "집단 평균" 구조가 담당: 진짜 고객이 유의미하게 섞인 조합은 평균 체류가
//     5초 밑으로 내려갈 수 없음 (정상 채널 평균은 분 단위).
// (2) 세션 하한을 기간에 비례시킴: max(5, 일수×2).
//     - 비례부(일수×2): 긴 기간에서 고정 5는 사실상 전수검사가 되어 기준이 흔들림 → "일평균 2세션
//       미만인 조합은 판단 보류"로 기간과 무관하게 일관된 기준 유지.
//     - 바닥값 5: 하루 조회에서 표본 1~2개의 우연(누군가 잘못 눌러 3초 만에 나감)으로
//       채널이 통째로 제외되는 것을 막는 최소 표본 하한.
//     상수 2와 5는 임의값이며, ?debugFilter=1 로 실데이터에서 무엇이 걸리는지 확인해 조정한다.
function daysBetween(startDate, endDate){
  const s = new Date(startDate + 'T00:00:00Z'), e = new Date(endDate + 'T00:00:00Z');
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

async function findLowEngagementSources(propertyId, token, startDate, endDate, maxAvgSec, minSessions) {
  const days = daysBetween(startDate, endDate);
  const minS = (minSessions != null) ? minSessions : Math.max(5, days * 2);
  const maxA = (maxAvgSec != null) ? maxAvgSec : 5;
  const rows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'sessionSourceMedium' }, { name: 'country' }],
    metrics: [{ name: 'sessions' }, { name: 'userEngagementDuration' }],
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
  // [중요] 한국 면제를 없앤 뒤 이 목록이 수백 개로 늘 수 있다. 아래 isExcl 이 GA4 응답
  // 행마다(최대 10만 행) 조회하므로, 세션 많은 순으로 상위 200개만 남겨 작업량을 묶는다.
  // 세션이 적은 조합은 어차피 총합에 거의 영향이 없다.
  bad.sort((a, b) => b.sessions - a.sessions);
  return bad.slice(0, 200).map(x => x.key);
}

// 캠페인 단위 탐지 (소스×국가 조합과 별개의 축).
// 정크가 여러 소스로 흩어져 들어와도 캠페인명은 하나로 묶이는 경우를 잡는다.
// 캠페인명이 없는 자연/직접 유입은 대상이 아니므로 일반 고객 오분류 위험이 없음.
async function findLowEngagementCampaigns(propertyId, token, startDate, endDate) {
  const days = daysBetween(startDate, endDate);
  const minS = Math.max(5, days * 2);
  const rows = await runReport(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'sessionCampaignName' }],
    metrics: [{ name: 'sessions' }, { name: 'userEngagementDuration' }],
  });
  const bad = [];
  for (const r of rows) {
    const camp = r.dimensionValues[0].value;
    if (!camp || camp === '(not set)' || camp === '(direct)' || camp === '(organic)' || camp === '(referral)') continue;
    const sessions = Number(r.metricValues[0].value);
    const eng = Number(r.metricValues[1].value);
    const avg = sessions ? eng / sessions : 0;
    if (sessions >= minS && avg < 5) bad.push(camp);
  }
  return bad;
}

// 조합(badPairs)과 캠페인(badCampaigns)을 한 번에. 여러 build 함수가 공유.
async function findLowQualityTraffic(propertyId, token, startDate, endDate) {
  const [badPairs, badCampaigns] = await Promise.all([
    findLowEngagementSources(propertyId, token, startDate, endDate),
    findLowEngagementCampaigns(propertyId, token, startDate, endDate),
  ]);
  return { badPairs, badCampaigns };
}

async function buildData(propertyId, token, ranges, exclRaw, autoExclLowEngagement) {
  const excl = (exclRaw || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  let badPairs = [], badCampaigns = []; // 봇 의심 조합/캠페인 (자동제외용)
  if (autoExclLowEngagement) {
    // 선택한(after) 기간 기준으로 대상을 찾음 (전/후 동일 기준 적용)
    ({ badPairs, badCampaigns } = await findLowQualityTraffic(propertyId, token, ranges.after.start, ranges.after.end));
  }
  const campFilter = campaignOnlyFilter(badCampaigns);
  const badSet = new Set(badPairs);   // 행마다 조회하므로 배열 대신 Set (O(1))
  // sm(소스)만 오면 기존처럼 문자열 포함(L포인트 등 수동제외), country까지 오면 국가+소스 조합도 같이 체크
  const isExcl = (sm, country) => {
    if (excl.some((x) => (sm || '').toLowerCase().includes(x))) return true;
    if (country && badSet.size) {
      const key = `${(sm||'').toLowerCase()}||${country.toLowerCase()}`;
      if (badSet.has(key)) return true;
    }
    return false;
  };

  // 메인: 전(6월)=기존 메인(/, main, index), 후(7월)=신규 메인(art, life)
  // 그 외 페이지는 주소에 특정 키워드가 "포함"되면 매칭 → 리뉴얼로 경로가 바뀌어도 잡힘.
  const homeMatch = (path, side) => {
    if (side === 'after') return path.startsWith('/art.html') || path.startsWith('/life.html');
    // before: 루트(/) 또는 main/index 페이지
    return path === '/' || path.startsWith('/main') || path.startsWith('/index');
  };
  // 키워드 포함 매칭 (소문자). 먼저 매칭되는 순서 중요 → 구체적인 것부터.
  const KW = [
    // [2026-08-03] 회원가입 완료 페이지 추가.
    // 신규가입자는 예전에 /admin/dashboard 의 '오늘 기준' 누적값을 자정 직전에
    // 스냅샷으로 훔쳐왔다. 실행이 밀리면 그날 값이 영구 손실되는 구조였다(8/1~8/2 누락).
    // 가입 완료 페이지의 조회수는 GA4 가 이미 자동으로 수집하고 있어, 날짜를 지정해
    // 언제든 다시 조회할 수 있다. 과거 구간도 채워진다.
    // ※ 'detail' 규칙의 '/product/' 보다 앞에 두어야 한다(먼저 매칭되는 것이 이긴다).
    ['joinDone', ['join_result', 'join_end']],               // 회원가입 완료
    ['order',  ['orderform', '/order/order', 'checkout']],   // 결제(주문서)
    // [2026-08-13] 장바구니 모달을 장바구니 페이지와 분리.
    // 'basket' 규칙이 CONTAINS 매칭이라 /order/basket-modal.html 까지 잡아, 팝업 노출이
    // 장바구니 도달로 집계됐다. classify 는 먼저 매칭되는 것이 이기므로 반드시 위에 둔다.
    ['basketModal', ['basket-modal']],                       // 장바구니 모달(팝업)
    ['basket', ['basket', 'cart']],                          // 장바구니 페이지
    ['search', ['search']],                                  // 검색
    // [2026-08-03 버그 수정] 예전 detail 규칙에 '/product/' 가 들어 있었다.
    // 이 조건이 /product/list.html 까지 잡아버려 상품목록이 상품상세로 분류됐고,
    // list 규칙은 뒤에 있어 절대 도달하지 못했다. 그 결과 상품조회 수가 부풀려져
    // 상품조회 전환율이 88.5% 같은 비현실적인 값으로 나왔다(거의 모든 세션이 '상품을 봤다').
    // 목록을 먼저 걸러낸 뒤 상세를 판정하도록 순서를 바꾸고, 넓은 '/product/' 조건을 제거한다.
    ['list',   ['/product/list', 'category', 'goods/catalog']],        // 상품목록
    ['detail', ['/product/detail', 'goods/view', 'productview']],      // 상품상세
  ];
  const classify = (path) => {
    const p = path.toLowerCase();
    for (const [key, kws] of KW) if (kws.some((k) => p.includes(k))) return key;
    return null;
  };

  async function oneRange(startDate, endDate, side) {
    // [2026-08-03 병렬화] 이벤트 조회와 페이지 조회는 서로 의존하지 않는데 순차로
    // 기다리고 있었다. 두 응답 시간이 그대로 더해져 개요 로딩이 느려졌다. 동시에 보낸다.
    const [evRows, pgRows] = await Promise.all([
      runReport(propertyId, token, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'eventName' }, { name: 'sessionSourceMedium' }, { name: 'country' }],
        metrics: [{ name: 'eventCount' }, { name: 'sessions' }],
        ...(campFilter ? { dimensionFilter: campFilter } : {}),
        limit: 100000,
      }),
      runReport(propertyId, token, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'pagePath' }, { name: 'sessionSourceMedium' }, { name: 'country' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }, { name: 'sessions' }],
        ...(campFilter ? { dimensionFilter: campFilter } : {}),
        limit: 100000,
      }),
    ]);

    // evc = 이벤트 발생 횟수(행동량), evs = 그 이벤트가 발생한 세션 수(퍼널용 — 방문과 같은 단위)
    const evc = {}, evs = {}; let ss = 0;
    for (const r of evRows) {
      const name = r.dimensionValues[0].value, sm = r.dimensionValues[1].value, country = r.dimensionValues[2].value;
      if (isExcl(sm, country)) continue;
      evc[name] = (evc[name] || 0) + Number(r.metricValues[0].value);
      evs[name] = (evs[name] || 0) + Number(r.metricValues[1].value);
      if (name === 'session_start') ss += Number(r.metricValues[1].value);
    }

    const pgc = {};
    const add = (key, v, u, se) => {
      if (!key) return;
      pgc[key] ??= { views: 0, users: 0, sessions: 0 };
      pgc[key].views += v; pgc[key].users += u; pgc[key].sessions += se;
    };
    for (const r of pgRows) {
      const path = r.dimensionValues[0].value, sm = r.dimensionValues[1].value, country = r.dimensionValues[2].value;
      if (isExcl(sm, country)) continue;
      const v = Number(r.metricValues[0].value), u = Number(r.metricValues[1].value), se = Number(r.metricValues[2].value);
      if (homeMatch(path, side)) { add('home', v, u, se); continue; }
      add(classify(path), v, u, se);
    }
    return { evc, evs, ss, pgc };
  }


  // ── 표준 제품 지표: 참여율/평균세션시간/세션당페이지뷰 + 신규·재방문 비율 ──
  async function standardMetrics(startDate, endDate){
    // [2026-08-13 버그 수정] 여기만 campFilter(봇 캠페인만) 를 쓰고 있었다.
    // 수동 제외(L포인트)와 badPairs(소스×국가 봇 조합)가 빠져, sessionsInRange() 와
    // 기준이 달라졌다. 그 결과 2026-07 에 totalUsers 287,881 > 세션 116,510 이라는
    // 불가능한 값이 나왔고(사용자가 세션보다 많음), 이 함수가 만드는 나머지 값
    // (재방문자 비율·평균 세션 시간·세션당 페이지뷰)도 봇 세션을 포함한 채 평균이 계산돼
    // 각각 7.1% / 83초 / 2.89 로 왜곡됐다.
    // totalUsers 는 중복 제거 때문에 "나중에 빼기"로 보정할 수 없다 → 쿼리 단계에서 걸러야 한다.
    const exclFilter = buildExclusionFilter(exclRaw, badPairs, badCampaigns);

    // totalUsers는 여기서 "차원(dimension) 없이" 조회해야 진짜 중복 없는 고유 사용자 수가 나옴.
    // (newVsReturning 차원별로 나눠서 더하면, 기간 중 신규->재방문 전환한 사람이 두 번 잡혀 부풀려짐 → ARPU가 비정상적으로 낮아지는 원인이었음)
    // [2026-08-03 병렬화] 아래 세 조회(전체지표 / 신규·재방문 / 구매자수)는 서로 의존하지
    // 않는데 순차로 기다리고 있었다. 동시에 보내 응답 시간이 더해지지 않게 한다.
    const [overall, nvr, purchaserRows] = await Promise.all([
      runReport(propertyId, token, {
        dateRanges: [{ startDate, endDate }],
        metrics: [{ name: 'engagementRate' }, { name: 'averageSessionDuration' }, { name: 'screenPageViewsPerSession' }, { name: 'totalUsers' }],
        ...(exclFilter ? { dimensionFilter: exclFilter } : {}),
      }),
      // 재방문자 비율(%)은 신규/재방문 나눈 비율이라 중복 집계 걱정 없이 그대로 사용 가능
      runReport(propertyId, token, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'newVsReturning' }],
        metrics: [{ name: 'totalUsers' }],
        ...(exclFilter ? { dimensionFilter: exclFilter } : {}),
      }),
      // 실제 구매한 고유 사용자 수 (ARPPU 분모용). purchase 이벤트를 일으킨 사용자만.
      // [2026-08-13] 예전엔 제외 필터가 아예 없어 봇까지 포함됐다.
      runReport(propertyId, token, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'totalUsers' }],
        dimensionFilter: andFilters(exclFilter, { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'purchase' } } }),
      }),
    ]);
    const row = overall[0]?.metricValues || [];
    const engagementRate = row[0] ? Number(row[0].value) : 0;      // 0~1
    const avgSessionDuration = row[1] ? Number(row[1].value) : 0;  // 초
    const pageViewsPerSession = row[2] ? Number(row[2].value) : 0;
    const totalUsers = row[3] ? Number(row[3].value) : 0;          // 중복 없는 고유 사용자 수 (ARPU 분모용)

    let newUsers = 0, returningUsers = 0;
    for (const r of nvr) {
      const key = r.dimensionValues[0].value, n = Number(r.metricValues[0].value);
      if (key === 'new') newUsers = n;
      else if (key === 'returning') returningUsers = n;
    }
    const totalNvr = newUsers + returningUsers;
    const returningShare = totalNvr ? (returningUsers / totalNvr * 100) : 0;

    const purchasers = purchaserRows.length ? Number(purchaserRows[0].metricValues[0].value) : 0;

    return { engagementRate, avgSessionDuration, pageViewsPerSession, totalUsers, newUsers, returningUsers, returningShare, purchasers };
  }

  // 세션(방문)은 차원 없이 조회해야 GA4가 세는 진짜 세션 수가 나옴.
  // (eventName × sourceMedium × country 로 쪼개서 더하면 값이 부풀려질 수 있음 — totalUsers에서 겪은 것과 같은 문제)
  async function sessionsInRange(startDate, endDate){
    // [2026-08-03 병렬화] 총 세션과 제외분 조회를 순차로 기다리고 있었다.
    // 제외 대상이 있는지는 조회 전에 이미 알 수 있으므로(badPairs 가 먼저 계산됨)
    // 두 조회를 동시에 보낸다. 제외 대상이 없으면 두 번째는 아예 보내지 않는다.
    const hasExcl = (exclRaw && exclRaw.trim()) || badPairs.length;
    const [overall, rows] = await Promise.all([
      runReport(propertyId, token, {
        dateRanges: [{ startDate, endDate }],
        metrics: [{ name: 'sessions' }],
        ...(campFilter ? { dimensionFilter: campFilter } : {}),
      }),
      hasExcl ? runReport(propertyId, token, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'sessionSourceMedium' }, { name: 'country' }],
        metrics: [{ name: 'sessions' }],
        ...(campFilter ? { dimensionFilter: campFilter } : {}),
        limit: 5000,
      }) : Promise.resolve([]),
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

  // [2026-08-03 병렬화] 전/후 기간과 표준지표를 각각 순차로 기다리고 있었다.
  // 서로 의존하지 않으므로 네 개를 동시에 보낸다. 응답 시간이 더해지지 않고 가장 느린 것에 맞춰진다.
  const [B, A, SB, SA, ssB, ssA] = await Promise.all([
    oneRange(ranges.before.start, ranges.before.end, 'before'),
    oneRange(ranges.after.start, ranges.after.end, 'after'),
    standardMetrics(ranges.before.start, ranges.before.end),
    standardMetrics(ranges.after.start, ranges.after.end),
    sessionsInRange(ranges.before.start, ranges.before.end),
    sessionsInRange(ranges.after.start, ranges.after.end),
  ]);
  const E = (o, n) => o.evc[n] || 0;        // 이벤트 발생 횟수 (행동량)
  const ES = (o, n) => o.evs?.[n] || 0;     // 그 이벤트가 발생한 세션 수 (퍼널·전환율용)
  const P = (o, key, f) => o.pgc[key]?.[f] ?? 0;

  const rate = (num, den) => den ? (num / den * 100) : 0;

  return {
    periodBefore: `${ranges.before.start} ~ ${ranges.before.end}`,
    periodAfter: `${ranges.after.start} ~ ${ranges.after.end}`,
    updatedAt: new Date().toISOString(),
    excluded: excl,
    usersInRange: {
      before: SB.totalUsers,
      after: SA.totalUsers,
    },
    purchasersInRange: {
      before: SB.purchasers,
      after: SA.purchasers,
    },
    // AARRR 프레임워크 기준 그룹 태그(group)를 붙여 프론트에서 섹션별로 묶어 표시
    kpis: [
      { label: '세션(방문)', group:'acquisition', before: ssB, after: ssA, unit: 'count' },
      { label: '신규 방문자', group:'acquisition', before: E(B,'first_visit'), after: E(A,'first_visit'), unit: 'count' },

      { label: '상품조회 전환율', group:'activation', before: rate(P(B,'detail','sessions'), ssB), after: rate(P(A,'detail','sessions'), ssA), unit: 'percent' },
      { label: '장바구니 전환율', group:'activation', before: rate(ES(B,'add_to_cart'), ssB), after: rate(ES(A,'add_to_cart'), ssA), unit: 'percent' },
      // 신규 가입 = 가입 완료 페이지에 도달한 세션 수.
      // 그룹은 '획득' — 가입은 사이트에 발을 들이는 행동이다.
      // (활성화는 들어와서 상품을 보고 담는 단계라 성격이 다르다)
      // 조회수(views)가 아니라 세션 수를 쓰는 이유: 완료 페이지를 새로고침하면 조회수가
      // 늘지만 가입은 한 번이다. 세션 기준이면 중복이 걸러진다.
      { label: '신규 가입', group:'acquisition', before: P(B,'joinDone','sessions'), after: P(A,'joinDone','sessions'), unit: 'count' },
      { label: '가입 전환율', group:'acquisition', before: rate(P(B,'joinDone','sessions'), ssB), after: rate(P(A,'joinDone','sessions'), ssA), unit: 'percent' },

      { label: '참여율', group:'retention', before: SB.engagementRate*100, after: SA.engagementRate*100, unit: 'percent' },
      { label: '평균 세션 시간', group:'retention', before: SB.avgSessionDuration, after: SA.avgSessionDuration, unit: 'duration' },
      { label: '세션당 페이지뷰', group:'retention', before: SB.pageViewsPerSession, after: SA.pageViewsPerSession, unit: 'decimal' },
      { label: '재방문자 비율', group:'retention', before: SB.returningShare, after: SA.returningShare, unit: 'percent' },

      { label: '결제전환율', group:'revenue', before: rate(ES(B,'purchase'), ssB), after: rate(ES(A,'purchase'), ssA), unit: 'percent' },
      { label: '구매 건수', group:'revenue', before: E(B,'purchase'), after: E(A,'purchase'), unit: 'count' },
    ],
    // [2026-07-30 단위 통일] 퍼널 5단계를 전부 "세션 수"로 통일.
    // 예전엔 세션→페이지뷰→이벤트횟수→페이지뷰→이벤트횟수 가 섞여 있어서 통과율이
    // 단위가 다른 숫자끼리의 나눗셈이었음 (새로고침이 +1, 상품 5개 담으면 +5).
    // 이제 각 단계 = "그 단계에 도달한 세션 수" → 통과율·이탈률이 처음으로 정확해짐.
    // 숫자가 이전보다 작아지는 건 부정확했던 게 정확해진 것.
    funnel: [
      { name: '방문', before: ssB, after: ssA },
      { name: '상품조회', before: P(B,'detail','sessions'), after: P(A,'detail','sessions') },
      { name: '장바구니 담기', before: ES(B,'add_to_cart'), after: ES(A,'add_to_cart') },
      { name: '결제(주문서)', before: P(B,'order','sessions'), after: P(A,'order','sessions') },
      { name: '구매', before: ES(B,'purchase'), after: ES(A,'purchase') },
    ],
    pages: [
      { name: '메인 (art · life)', icon: 'home', metrics: [
          { label: '조회수', before: P(B,'home','views'), after: P(A,'home','views') },
          { label: '활성 사용자', before: P(B,'home','users'), after: P(A,'home','users') },
        ], note: '메인 페이지 비교: 리뉴얼 전 기존 메인(/) → 후 신규 메인(art·life). 같은 메인 역할끼리 비교.' },
      { name: '상품 목록', icon: 'grid', metrics: [
          { label: '조회수', before: P(B,'list','views'), after: P(A,'list','views') },
          { label: '활성 사용자', before: P(B,'list','users'), after: P(A,'list','users') },
        ], note: '상품 목록 페이지 트래픽.' },
      { name: '상품 상세', icon: 'tag', metrics: [
          { label: '조회수', before: P(B,'detail','views'), after: P(A,'detail','views') },
          { label: '활성 사용자', before: P(B,'detail','users'), after: P(A,'detail','users') },
        ], note: '상품 상세 조회.' },
      { name: '상품 검색', icon: 'search', metrics: [
          { label: '조회수', before: P(B,'search','views'), after: P(A,'search','views') },
          { label: '활성 사용자', before: P(B,'search','users'), after: P(A,'search','users') },
        ], note: '검색 사용자 유입.' },
      { name: '장바구니', icon: 'cart', metrics: [
          { label: '조회수', before: P(B,'basket','views'), after: P(A,'basket','views') },
          { label: '활성 사용자', before: P(B,'basket','users'), after: P(A,'basket','users') },
        ], note: '장바구니 페이지(/order/basket.html) 도달. 모달은 아래에서 따로 집계.' },
      { name: '장바구니 모달', icon: 'cart', metrics: [
          { label: '조회수', before: P(B,'basketModal','views'), after: P(A,'basketModal','views') },
          { label: '활성 사용자', before: P(B,'basketModal','users'), after: P(A,'basketModal','users') },
        ], note: '/order/basket-modal.html — 페이지 이동이 아니라 팝업이라 장바구니 도달로 보면 안 됩니다. 2026-06 에는 이 값이 장바구니에 합산돼 세션의 4.7배로 잡혔습니다.' },
      { name: '주문서(결제)', icon: 'card', metrics: [
          { label: '조회수', before: P(B,'order','views'), after: P(A,'order','views') },
          { label: '활성 사용자', before: P(B,'order','users'), after: P(A,'order','users') },
        ], note: '결제 단계 도달.' },
    ],
  };
}