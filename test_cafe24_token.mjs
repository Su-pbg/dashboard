// 카페24 토큰 갱신이 한 번에 하나만 도는지 점검.  실행: node test_cafe24_token.mjs
// 가짜 KV · 가짜 fetch 로 worker.js 를 그대로 돌린다(운영 토큰·Gist 를 건드리지 않는다).
// 배경: 2026-11-15 동시에 두 번 갱신돼 Gist 에 죽은 리프레시 토큰이 남았고, 대시보드 전체가 "cafe24 인증 실패"가 됐다.
// 확인: ① 캐시가 빈 채 동시에 8개가 와도 발급은 1번 ② 같은 죽은 토큰으로 401 을 본 8개가 강제 갱신해도 1번
//       ③ 발급 실패면 null 이고 이유가 남는다(재인증 필요 표시) ④ 실패 뒤에도 다음 갱신이 막히지 않는다
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let bad = 0, ok = 0;
const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) ok++; else { bad++; console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`); } };

const kv = new Map();
const KV = {
  get: async (k, o) => { const v = kv.has(k) ? kv.get(k) : null; return v != null && o && o.type === 'json' ? JSON.parse(v) : v; },
  put: async (k, v) => { kv.set(k, v); },
  delete: async (k) => { kv.delete(k); },
};
const env = { CAFE24_TOKEN_KV: KV, CAFE24_GIST_ID: 'g', CAFE24_GH_PAT: 'p', CAFE24_ADMIN_CLIENT_ID: 'i', CAFE24_ADMIN_CLIENT_SECRET: 's', CAFE24_MALL_ID: 'm' };

// 가짜 카페24: 리프레시 토큰은 한 번 쓰면 죽는다(실제와 같다). 죽은 걸 쓰면 invalid_grant.
let gist = 'R0', valid = 'R0', n = 0, issued = 0, failAll = false;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fakeFetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes('api.github.com/gists')) {
    await wait(5);
    if (init.method === 'PATCH') { gist = JSON.parse(init.body).files['token.txt'].content; return new Response('{}'); }
    return new Response(JSON.stringify({ files: { 'token.txt': { content: gist } } }));
  }
  if (url.includes('/oauth/token')) {
    const rt = new URLSearchParams(init.body).get('refresh_token');
    await wait(20);
    if (failAll || rt !== valid) return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid refresh_token' }), { status: 400 });
    issued++; valid = 'R' + (++n);
    return new Response(JSON.stringify({ access_token: 'A' + n, refresh_token: valid, expires_in: 7200, scopes: ['x'] }));
  }
  throw new Error('예상 못 한 요청 ' + url);
};

let src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
src = src.replace(/export\s*\{\s*worker_default\s+as\s+default\s*\};?/, 'globalThis.__tok = getCafe24AccessToken; globalThis.__err = () => LAST_AUTH_ERROR;');
const ctx = { console: { log() {} }, URL, URLSearchParams, Response, Request, Headers, fetch: fakeFetch, crypto, TextEncoder, TextDecoder, atob, btoa, setTimeout, Date, Math, JSON };
vm.createContext(ctx); vm.runInContext(src, ctx, { filename: 'worker.js' });
const tok = ctx.__tok;

// ① 캐시가 빈 채 동시에 8개
let r = await Promise.all(Array.from({ length: 8 }, () => tok(env)));
eq('① 발급 횟수', issued, 1);
eq('① 모두 같은 토큰', [...new Set(r)], ['A1']);
eq('① Gist 에 살아 있는 토큰', gist, valid);

// ② 같은 죽은 토큰(A1)으로 401 을 본 8개가 강제 갱신
r = await Promise.all(Array.from({ length: 8 }, () => tok(env, true, 'A1')));
eq('② 발급 횟수', issued, 2);
eq('② 모두 새 토큰', [...new Set(r)], ['A2']);
eq('② Gist 에 살아 있는 토큰', gist, valid);
eq('② 잠금이 남지 않음', kv.has('refresh_lock'), false);

// ③ 발급 실패 → null, 이유 기록
failAll = true;
eq('③ 실패면 null', await tok(env, true, 'A2'), null);
eq('③ 재인증 필요 표시', ctx.__err() && ctx.__err().reauth, true);
eq('③ KV 에 이유', JSON.parse(kv.get('cafe24_auth_error') || '{}').where, 'token');

// ④ 실패 뒤에도 다음 갱신은 된다
failAll = false;
eq('④ 다시 발급', await tok(env, true, 'A2'), 'A3');
eq('④ 이유 지움', [ctx.__err(), kv.has('cafe24_auth_error')], [null, false]);

console.log(bad ? `실패 ${bad} / 통과 ${ok}` : `모두 통과 (${ok})`);
process.exit(bad ? 1 : 0);
