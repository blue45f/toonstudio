import assert from "node:assert/strict";
import { bundleR2BodyFingerprint } from "./creator-bundle-r2-delta.mjs";
import { BUNDLE_V2_INDEX_KEY, bundleV2ObjectKey } from "../plan-creator-bundle-deploy.mjs";
import { BundleR2TransferError, createBundleR2Rest } from "./creator-bundle-r2-rest.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const TOKEN = "fixture-only-token";
function setup(fetcher, extra = {}) {
  let time = 0;
  return createBundleR2Rest({ accountId: "a".repeat(32), token: TOKEN, fetcher,
    now: () => time, sleep: async (ms) => { time += ms; }, ...extra });
}
function object(body = Buffer.from("fixture GLB bytes")) {
  const fp = bundleR2BodyFingerprint(body);
  return { body, descriptor: { bytes: fp.bytes, sha256: fp.sha256, key: bundleV2ObjectKey(fp.sha256) } };
}
function completion(body = Buffer.from(JSON.stringify({ schema: "toonstudio.bundle-v2-deploy-index.v1", version: 1,
  files: 1, bytes: 128, packs: 1, objects: 1, objectBytes: 128, keyScheme: "sha256",
  sourceManifestGeneratedAt: null, catalogSha256: "a".repeat(64) }) + "\n")) {
  const fp = bundleR2BodyFingerprint(body);
  return { body, descriptor: { bytes: fp.bytes, sha256: fp.sha256,
    key: `assets/studio/bundle-v2/release-index/${fp.sha256}.json` } };
}

test("목록 cursor는 query로 인코딩하고 원격 목록 형식을 엄격히 읽는다", async () => {
  const calls = [];
  const rest = setup(async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ success: true, result: [], result_info: { is_truncated: false } }));
  });
  assert.deepEqual(await rest.listPage("next/cursor&name"), { objects: [], truncated: false, cursor: undefined });
  const url = new URL(calls[0].url);
  assert.equal(url.origin, "https://api.cloudflare.com");
  assert.equal(url.searchParams.get("cursor"), "next/cursor&name");
  assert.equal(url.searchParams.get("prefix"), "assets/studio/bundle-v2/");
  assert.equal(calls[0].init.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].init.cache, "no-store");
});

test("고정 인덱스와 다른 namespace PUT은 fetch 전에 거부한다", async () => {
  let calls = 0; const rest = setup(async () => { calls += 1; return new Response(); });
  const f = object();
  for (const key of [BUNDLE_V2_INDEX_KEY, "assets/studio/other/file.glb", "assets/studio/bundle-v2/../other.glb"]) {
    await assert.rejects(rest.putObject({ ...f.descriptor, key }, f.body), { code: "KEY_REFUSED" });
  }
  const corrupt = Buffer.from(f.body); corrupt[0] ^= 1;
  await assert.rejects(rest.putObject(f.descriptor, corrupt), { code: "PUT_BODY" });
  assert.equal(calls, 0);
});

test("GET은 실제 404만 누락으로 읽으며 403을 누락으로 바꾸지 않는다", async () => {
  const f = object(), missing = setup(async () => new Response("private error body", { status: 404 }));
  assert.equal(await missing.getObject(f.descriptor), null);
  const forbidden = setup(async () => new Response(`provider echoed ${TOKEN}`, { status: 403 }));
  await assert.rejects(forbidden.getObject(f.descriptor), (error) => error.code === "HTTP_REJECTED" && !error.message.includes(TOKEN));
});

test("응답 본문 초과·429·통신 실패에서 본문과 인증을 노출하거나 재시도하지 않는다", async () => {
  const f = object();
  for (const response of [new Response(Buffer.alloc(f.descriptor.bytes + 1)), new Response(`provider echoed ${TOKEN}`, { status: 429 })]) {
    let calls = 0; const rest = setup(async () => { calls += 1; return response; });
    await assert.rejects(rest.getObject(f.descriptor), (error) => !error.message.includes(TOKEN));
    assert.equal(calls, 1);
  }
  let calls = 0; const broken = setup(async () => { calls += 1; throw new Error(`transport echoed ${TOKEN}`); });
  await assert.rejects(broken.putObject(f.descriptor, f.body), (error) => error.code === "PUT_OUTCOME_UNCERTAIN" && !error.message.includes(TOKEN));
  assert.equal(calls, 1);
});

test("GET의 전체 본문과 PUT의 성공 확인을 읽으며 API 오류 envelope는 성공이 아니다", async () => {
  const f = object(), methods = [];
  const rest = setup(async (_url, init) => {
    methods.push(init.method);
    return init.method === "GET" ? new Response(f.body) : new Response(JSON.stringify({ success: true }));
  });
  assert.deepEqual(await rest.getObject(f.descriptor), f.body);
  await rest.putObject(f.descriptor, f.body);
  assert.deepEqual(methods, ["GET", "PUT"]);
  const refused = setup(async () => new Response(JSON.stringify({ success: false, errors: [{ message: TOKEN }] })));
  await assert.rejects(refused.putObject(f.descriptor, f.body), (error) => error.code === "PUT_ACK_REJECTED" && !error.message.includes(TOKEN));
});

test("요청 시간 초과는 한 번의 요청으로 중단하고 PUT은 처리 불명확으로 남긴다", async () => {
  const f = object(); let calls = 0;
  const rest = setup(async (_url, init) => {
    calls += 1;
    return await new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error(`aborted ${TOKEN}`)), { once: true }));
  }, { requestTimeoutMs: 5 });
  const keepAlive = setTimeout(() => {}, 100);
  try { await assert.rejects(rest.putObject(f.descriptor, f.body), (error) => error.code === "PUT_OUTCOME_UNCERTAIN" && !error.message.includes(TOKEN)); }
  finally { clearTimeout(keepAlive); }
  assert.equal(calls, 1);
});

test("다른 요청이 실행 중이면 같은 adapter에서 겹쳐 보내지 않는다", async () => {
  const f = object(); let release;
  const response = new Promise((resolve) => { release = resolve; });
  const rest = setup(async () => await response);
  const pending = rest.getObject(f.descriptor);
  await assert.rejects(rest.getObject(f.descriptor), { code: "CONCURRENT_REQUEST" });
  release(new Response(f.body)); await pending;
});

test("응답 헤더 뒤 본문이 멈춰도 요청 상한으로 중단한다", async () => {
  const f = object(); let calls = 0;
  const rest = setup(async () => { calls += 1; return new Response(new ReadableStream({ start() {}, cancel() {} })); }, { requestTimeoutMs: 5 });
  const keepAlive = setTimeout(() => {}, 100);
  try { await assert.rejects(rest.getObject(f.descriptor), { code: "REQUEST_TIMEOUT" }); }
  finally { clearTimeout(keepAlive); }
  assert.equal(calls, 1);
});

test("순차 요청의 시작을 기본 500ms 이상 벌린다", async () => {
  const f = object(), starts = []; let clock = 0;
  const rest = createBundleR2Rest({ accountId: "a".repeat(32), token: TOKEN, now: () => clock,
    sleep: async (ms) => { clock += ms; }, fetcher: async () => { starts.push(clock); return new Response(f.body); } });
  await rest.getObject(f.descriptor); await rest.getObject(f.descriptor); await rest.getObject(f.descriptor);
  assert.deepEqual(starts, [0, 500, 1000]);
});

test("공식 optional result_info·marker·cursor를 보존하고 정상 terminal 응답을 읽는다", async () => {
  for (const info of [undefined, {}, { is_truncated: false }, { is_truncated: false, cursor: "last" }, { cursor: "next" }]) {
    const envelope = { success: true, errors: [], result: [{ key: "fixture-key" }], ...(info === undefined ? {} : { result_info: info }) };
    const rest = setup(async () => new Response(JSON.stringify(envelope)));
    assert.deepEqual(await rest.listPage(), { objects: envelope.result, truncated: info?.is_truncated, cursor: info?.cursor });
  }
});

test("pagination 타입 오류와 partial failure를 정상 terminal로 바꾸지 않는다", async () => {
  const cases = [
    { success: false, result: [], result_info: {} },
    { success: true, result: [], errors: [{ message: TOKEN }] },
    ...[null, [], { is_truncated: "false" }, { cursor: null }, { cursor: 23 }].map((result_info) => ({ success: true, result: [], result_info })),
  ];
  for (const body of cases) {
    let requests = 0;
    const rest = setup(async () => { requests += 1; return new Response(JSON.stringify(body)); });
    await assert.rejects(rest.listPage(), (error) => error.code === "LIST_FORMAT" && !error.message.includes(TOKEN));
    assert.equal(requests, 1);
  }
});

test("완료 JSON만 정확 SHA key·원문으로 GET/PUT하며 GLB 경계와 legacy 금지를 유지한다", async () => {
  const f = completion(), calls = [];
  const rest = setup(async (url, init) => { calls.push({ url, init });
    return init.method === "GET" ? new Response(f.body) : new Response(JSON.stringify({ success: true })); });
  assert.deepEqual(await rest.readCompletion(f.descriptor), f.body);
  await rest.putCompletion(f.descriptor, f.body);
  assert.deepEqual(calls.map((row) => row.init.method), ["GET", "PUT"]);
  assert.equal(calls[1].url.endsWith("/" + f.descriptor.key), true);
  assert.equal(calls[1].init.headers["content-type"], "application/json; charset=utf-8");
  assert.deepEqual(calls[1].init.body, f.body);
  for (const key of [BUNDLE_V2_INDEX_KEY, f.descriptor.key + "?v=1", f.descriptor.key.replace("release-index", "RELEASE-INDEX"),
    f.descriptor.key.replace(".json", ".glb"), f.descriptor.key.replace("release-index/", "release-index/%2e%2e/")]) {
    await assert.rejects(rest.putCompletion({ ...f.descriptor, key }, f.body), { code: "COMPLETION_KEY" });
  }
  await assert.rejects(rest.putObject(f.descriptor, f.body), { code: "KEY_REFUSED" });
  assert.equal(calls.length, 2);
});

test("완료 표식은 SHA·길이뿐 아니라 UTF-8 JSON index 스키마까지 전송 전에 검사한다", async () => {
  let calls = 0; const rest = setup(async () => { calls += 1; return new Response(); });
  for (const body of [Buffer.from("{}\n"), Buffer.from("<html>합성</html>"), Buffer.from([0xff, 0xfe]),
    Buffer.from(JSON.stringify({ schema: "other" })), Buffer.from("null")]) {
    const f = completion(body);
    await assert.rejects(rest.putCompletion(f.descriptor, f.body), { code: "COMPLETION_JSON" });
  }
  const f = completion(), changed = Buffer.from(f.body); changed[0] ^= 1;
  await assert.rejects(rest.putCompletion(f.descriptor, changed), { code: "COMPLETION_BODY" });
  await assert.rejects(rest.readCompletion({ ...f.descriptor, bytes: 1024 * 1024 + 1 }), { code: "COMPLETION_KEY" });
  assert.equal(calls, 0);
});

test("완료 GET도 404만 누락으로 읽고 403·초과 응답은 거부한다", async () => {
  const f = completion();
  assert.equal(await setup(async () => new Response(null, { status: 404 })).readCompletion(f.descriptor), null);
  await assert.rejects(setup(async () => new Response(TOKEN, { status: 403 })).readCompletion(f.descriptor),
    (error) => error.code === "HTTP_REJECTED" && !error.message.includes(TOKEN));
  await assert.rejects(setup(async () => new Response(Buffer.alloc(f.descriptor.bytes + 1))).readCompletion(f.descriptor),
    { code: "RESPONSE_TOO_LARGE" });
});

test("명시한 요청 수를 넘겨 다음 HTTP를 시작하지 않는다", async () => {
  const f = object(); let calls = 0;
  const rest = setup(async () => { calls += 1; return new Response(f.body); }, { maximumRequests: 1 });
  await rest.getObject(f.descriptor);
  await assert.rejects(rest.getObject(f.descriptor), { code: "REQUEST_BUDGET" });
  assert.equal(calls, 1); assert.equal(rest.getRequestStats().requestsStarted, 1);
});

test("요청마다 새 credentialProvider를 조회하고 없는 expiry를 수명 검증으로 세지 않는다", async () => {
  const f = object(), authorizations = []; let providers = 0;
  const rest = setup(async (_url, init) => { authorizations.push(init.headers.authorization); return new Response(f.body); },
    { token: undefined, credentialProvider: async (context) => {
      providers += 1; assert.equal(context.accountId, "a".repeat(32)); assert.equal(context.minimumValidityMs, 35000);
      assert.equal(context.signal instanceof AbortSignal, true);
      return { kind: "oauth", token: TOKEN + providers };
    } });
  await rest.getObject(f.descriptor); await rest.getObject(f.descriptor);
  assert.deepEqual(authorizations, [`Bearer ${TOKEN}1`, `Bearer ${TOKEN}2`]);
  const stats = rest.getRequestStats();
  assert.equal(stats.credentialProviderCalls, 2); assert.deepEqual(stats.credentialKinds, ["oauth"]);
  assert.equal(stats.minimumValidityVerified, false); assert.equal(JSON.stringify(stats).includes(TOKEN), false);
});

test("provider의 확인된 expiry만 검사하고 동시 token·잘못된 반환·짧은 수명을 거부한다", async () => {
  assert.throws(() => setup(async () => new Response(), { credentialProvider: async () => ({ kind: "oauth", token: TOKEN }) }),
    { code: "AUTH_CONFIGURATION" });
  const f = object();
  for (const value of [{ kind: "api_key", token: TOKEN }, { kind: "oauth", token: TOKEN, validUntil: null },
    { kind: "oauth", token: TOKEN, validUntil: 34999 }, { kind: "oauth", token: TOKEN, privateExtra: "합성" }]) {
    let calls = 0;
    const rest = setup(async () => { calls += 1; return new Response(f.body); }, { token: undefined, credentialProvider: async () => value });
    await assert.rejects(rest.getObject(f.descriptor), (error) => error.code === "CREDENTIAL_CONTRACT" && !error.message.includes(TOKEN));
    assert.equal(calls, 0);
  }
  const valid = setup(async () => new Response(f.body), { token: undefined,
    credentialProvider: async () => ({ kind: "api_token", token: TOKEN, validUntil: 36000 }) });
  await valid.getObject(f.descriptor); assert.equal(valid.getRequestStats().minimumValidityVerified, true);
});

test("첫 인증 실패 뒤 HTTP·다음 marker PUT·raw 오류 출력 없이 중단한다", async () => {
  const f = completion(); let calls = 0, providers = 0;
  const rest = setup(async () => { calls += 1; return new Response(); }, { token: undefined, credentialProvider: async () => {
    providers += 1; throw new BundleR2TransferError("PROVIDER_PRIVATE", "합성 인증 stderr " + TOKEN);
  } });
  await assert.rejects(rest.putCompletion(f.descriptor, f.body), (error) => error.code === "CREDENTIAL_PREPARATION_FAILED" && !error.message.includes(TOKEN));
  await assert.rejects(rest.putCompletion(f.descriptor, f.body), { code: "ADAPTER_STOPPED" });
  assert.equal(calls, 0); assert.equal(providers, 1); assert.equal(JSON.stringify(rest.getRequestStats()).includes(TOKEN), false);
});

test("완료 PUT 결과 불명확 뒤 같은 adapter는 자동 재전송하지 않는다", async () => {
  const f = completion(); let calls = 0;
  const rest = setup(async () => { calls += 1; throw new Error(TOKEN); });
  await assert.rejects(rest.putCompletion(f.descriptor, f.body),
    (error) => error.code === "PUT_OUTCOME_UNCERTAIN" && !error.message.includes(TOKEN));
  await assert.rejects(rest.putCompletion(f.descriptor, f.body), { code: "ADAPTER_STOPPED" });
  assert.equal(calls, 1);
});

test("credentialProvider가 멈춰도 개별 요청 상한에서 HTTP 없이 단 한 번 중단한다", async () => {
  const f = completion(); let providers = 0, calls = 0;
  const rest = setup(async () => { calls += 1; return new Response(); }, { token: undefined, requestTimeoutMs: 5,
    credentialProvider: async () => { providers += 1; return new Promise(() => {}); } });
  const keepAlive = setTimeout(() => {}, 100);
  try { await assert.rejects(rest.putCompletion(f.descriptor, f.body), { code: "CREDENTIAL_TIMEOUT" }); }
  finally { clearTimeout(keepAlive); }
  await assert.rejects(rest.readCompletion(f.descriptor), { code: "ADAPTER_STOPPED" });
  assert.equal(providers, 1); assert.equal(calls, 0); assert.equal(rest.getRequestStats().minimumValidityVerified, false);
});
