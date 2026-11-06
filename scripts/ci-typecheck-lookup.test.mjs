import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

import { extractReceipt, findReceipt } from "./ci-typecheck-lookup.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const head = "a".repeat(40), merge = "b".repeat(40);
const env = { GITHUB_REPOSITORY: "blue45f/toonstudio", GITHUB_SHA: merge,
  GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: "/event.json", GITHUB_REF: "refs/pull/1/merge",
  GITHUB_TOKEN: "test-token-value", GITHUB_API_URL: "https://api.github.com" };
const payload = { repository: { full_name: env.GITHUB_REPOSITORY },
  pull_request: { head: { sha: head, repo: { full_name: env.GITHUB_REPOSITORY } } } };
const run = () => ({ id: 21, run_attempt: 2, path: ".github/workflows/ci.yml", head_sha: head,
  event: "pull_request", status: "in_progress", repository: { full_name: env.GITHUB_REPOSITORY } });
const job = () => ({ id: 31, run_id: 21, run_attempt: 2, head_sha: head, status: "completed",
  conclusion: "success", name: "Core preflight and application typecheck" });
const artifact = () => ({ id: 41, name: "core-typecheck-21-2", expired: false, size_in_bytes: 128 });
const json = (value) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });

function fixture({ runs = [run()], jobs = [job()], artifacts = [artifact()],
  body = "zip", redirect = true, extractImpl = () => ({ schema: 1 }), fetchOverride } = {}) {
  const calls = [], misses = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const custom = await fetchOverride?.(url, options);
    if (custom) return custom;
    if (url.includes("/workflows/ci.yml/runs?")) return json({ workflow_runs: runs });
    if (url.includes("/jobs?")) return json({ jobs });
    if (url.includes("/artifacts?")) return json({ artifacts });
    if (url.endsWith("/41/zip") && redirect) {
      return new Response(null, { status: 302, headers: { location: "https://results.example.test/signed?sig=secret" } });
    }
    return new Response(body);
  };
  return { calls, misses, options: { env, fetchImpl, extractImpl,
    readEventImpl: () => JSON.stringify(payload), onMiss: (reason) => misses.push(reason) } };
}

test("PR head와 synthetic merge를 구분하고 완료 성공 job의 최신 attempt 영수증을 반환한다", async () => {
  const f = fixture();
  const result = await findReceipt(f.options);
  assert.deepEqual(result, { receipt: { schema: 1 }, producer: { runId: 21, runAttempt: 2, jobId: 31,
    conclusion: "success", jobName: job().name, path: run().path, event: "pull_request", headSha: head } });
  assert.match(f.calls[0].url, new RegExp(`head_sha=${head}&event=pull_request&per_page=2$`));
  assert(!f.calls[0].url.includes(merge));
  assert.match(f.calls[1].url, /filter=latest&per_page=100$/);
  assert.equal(f.misses.length, 0);
  for (const call of f.calls) {
    assert.equal(call.options.method, "GET");
    assert.equal(call.options.redirect, "manual");
    assert(call.options.signal instanceof AbortSignal);
    assert.equal(call.options.headers.Authorization,
      call.url.startsWith("https://api.github.com/") ? "Bearer test-token-value" : undefined);
  }
});

test("push는 checkout SHA를 사용하며 API가 직접 반환한 ZIP도 처리한다", async () => {
  const f = fixture({ runs: [{ ...run(), head_sha: merge, event: "push" }],
    jobs: [{ ...job(), head_sha: merge }], redirect: false });
  f.options.env = { ...env, GITHUB_EVENT_NAME: "push" };
  f.options.readEventImpl = () => { throw new Error("이벤트 파일을 읽으면 안 됩니다."); };
  assert.equal((await findReceipt(f.options)).producer.headSha, merge);
  assert.match(f.calls[0].url, /event=push/);
});

test("repo·event·workflow·SHA가 다른 run과 비정상 ID는 조회 후보가 아니다", async () => {
  for (const mismatch of [{ id: -1 }, { run_attempt: 0 }, { path: ".github/workflows/other.yml" },
    { repository: { full_name: "attacker/repo" } }, { head_sha: merge }, { event: "push" }]) {
    const f = fixture({ runs: [{ ...run(), ...mismatch }] });
    assert.equal(await findReceipt(f.options), null);
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.misses, ["not-found"]);
  }
});

test("실패·취소·skip·미완료·다른 attempt와 다른 job을 모두 거절한다", async () => {
  for (const mismatch of [{ conclusion: "failure" }, { conclusion: "cancelled" }, { conclusion: "skipped" },
    { status: "in_progress" }, { run_attempt: 1 }, { run_id: 22 }, { head_sha: merge },
    { name: "Core aggregate" }, { id: 0 }]) {
    const f = fixture({ jobs: [{ ...job(), ...mismatch }] });
    assert.equal(await findReceipt(f.options), null);
    assert.equal(f.calls.length, 2);
  }
});

test("만료·크기 초과·다른 attempt·잘못된 이름의 artifact는 다운로드하지 않는다", async () => {
  for (const mismatch of [{ expired: true }, { size_in_bytes: 32769 }, { size_in_bytes: 0 },
    { size_in_bytes: -1 }, { name: "core-typecheck-21-1" }, { name: "../../receipt.json" }, { id: -1 }]) {
    const f = fixture({ artifacts: [{ ...artifact(), ...mismatch }] });
    assert.equal(await findReceipt(f.options), null);
    assert.equal(f.calls.length, 3);
  }
});

test("후보는 최대 두 개만 확인하며 첫 후보 미완료일 때 두 번째를 허용한다", async () => {
  const f = fixture({ runs: [{ ...run(), id: 20 }, run(), { ...run(), id: 22 }],
    fetchOverride: (url) => url.includes("/runs/20/jobs?") ? json({ jobs: [] }) : undefined });
  assert.equal((await findReceipt(f.options)).producer.runId, 21);
  assert(!f.calls.some((call) => call.url.includes("/runs/22/")));
  const absent = fixture({ runs: [run(), run(), run()], jobs: [] });
  assert.equal(await findReceipt(absent.options), null);
  assert.equal(absent.calls.length, 3);
});

test("오류·잘못된 JSON·예외는 token이나 signed URL 없는 정형 miss만 반환한다", async () => {
  for (const response of [new Response("private test-token-value", { status: 403 }),
    new Response("invalid JSON test-token-value"), json({ wrong: [] })]) {
    const f = fixture({ fetchOverride: () => response });
    assert.equal(await findReceipt(f.options), null);
    assert.match(f.misses[0], /^(http-error|invalid-response)$/);
  }
  const f = fixture({ fetchOverride: () => { throw new Error("test-token-value signed?sig=secret"); } });
  assert.equal(await findReceipt(f.options), null);
  assert.deepEqual(f.misses, ["invalid-response"]);
  const custom = fixture({ fetchOverride: () => { throw { reason: "test-token-value" }; } });
  assert.equal(await findReceipt(custom.options), null);
  assert.deepEqual(custom.misses, ["invalid-response"]);
});

test("환경·fork·API origin이 잘못되면 네트워크 없이 전체 검사로 되돌아간다", async () => {
  for (const mismatch of [{ GITHUB_API_URL: "http://api.github.com" },
    { GITHUB_API_URL: "https://evil.test" }, { GITHUB_TOKEN: "" }, { GITHUB_REPOSITORY: "../repo" },
    { GITHUB_EVENT_NAME: "pull_request_target" }, { GITHUB_SHA: "invalid" }]) {
    const f = fixture(); f.options.env = { ...env, ...mismatch };
    assert.equal(await findReceipt(f.options), null);
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  f.options.readEventImpl = () => JSON.stringify({ ...payload,
    pull_request: { head: { sha: head, repo: { full_name: "fork/repo" } } } });
  assert.equal(await findReceipt(f.options), null);
  assert.equal(f.calls.length, 0);
});

test("ZIP의 선언·실제 크기 초과와 부적절한 redirect를 거절한다", async () => {
  const authenticatedLocation = new URL("https://evil.test");
  authenticatedLocation.username = "fixture-user";
  authenticatedLocation.password = "fixture-password";
  for (const response of [new Response("zip", { headers: { "content-length": "32769" } }),
    new Response("x".repeat(32769)), new Response(null, { status: 302, headers: { location: "http://evil.test" } }),
    new Response(null, { status: 302, headers: { location: authenticatedLocation.href } })]) {
    let extracted = false;
    const f = fixture({ extractImpl: () => { extracted = true; return {}; },
      fetchOverride: (url) => url.endsWith("/41/zip") ? response : undefined });
    assert.equal(await findReceipt(f.options), null);
    assert.equal(extracted, false);
  }
});

test("총 조회 deadline을 모든 fetch에 공유하며 polling이나 자동 재시도를 하지 않는다", async () => {
  const f = fixture({ fetchOverride: async (_url, options) => {
    await new Promise((resolve) => options.signal.addEventListener("abort", resolve, { once: true }));
    options.signal.throwIfAborted();
  } });
  f.options.timeoutMs = 10;
  assert.equal(await findReceipt(f.options), null);
  assert.deepEqual(f.misses, ["timeout"]);
  assert.equal(f.calls.length, 1);
});

test("압축 해제는 고정 unzip 인자만 사용하고 성공·실패 때 임시 ZIP을 제거한다", () => {
  let temporary;
  const execImpl = (command, args, options) => {
    assert.equal(command, "unzip");
    assert.deepEqual([args[0], args[2]], ["-p", "receipt.json"]);
    assert.equal(args.length, 3);
    temporary = dirname(args[1]);
    assert(existsSync(args[1]));
    assert.equal(options.maxBuffer, 16384);
    assert.equal(options.timeout, 3000);
    assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe"]);
    return '{"schema":1}';
  };
  assert.deepEqual(extractReceipt(Buffer.from("zip"), { execImpl, timeoutMs: 9000 }), { schema: 1 });
  assert(!existsSync(temporary));
  assert.throws(() => extractReceipt(Buffer.from("zip"), { execImpl: (_command, args) => {
    temporary = dirname(args[1]); throw new Error("파손 ZIP");
  } }));
  assert(!existsSync(temporary));
  assert.throws(() => extractReceipt(Buffer.alloc(32769), { execImpl }));
  assert.throws(() => extractReceipt(Buffer.from("zip"), { execImpl: () => "x".repeat(16385) }));
});

test("JSON만 파싱하며 scalar·배열·파싱 오류는 결과 재사용으로 처리하지 않는다", async () => {
  for (const value of [null, 42, "code", []]) {
    const f = fixture({ extractImpl: () => value });
    assert.equal(await findReceipt(f.options), null);
    assert.deepEqual(f.misses, ["invalid-receipt"]);
  }
  const f = fixture({ extractImpl: () => { throw new SyntaxError("invalid receipt"); } });
  assert.equal(await findReceipt(f.options), null);
  assert.deepEqual(f.misses, ["invalid-response"]);
});
