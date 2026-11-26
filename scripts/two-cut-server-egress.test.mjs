// 순수 정책·파일시스템 검사. 서버, HTTP 응답 대역, 공급자 요청을 사용하지 않는다.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, closeSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { endpoint, inspectBody, keyBinding, readApproval, readBoundedBody, readUsage, reserve, verifyApproval, verifyRequest } from "./two-cut-server-egress.mjs";

const model = "gpt-4o-mini";
const body = JSON.stringify({ model, store: false, temperature: 0.65, max_completion_tokens: 1400,
  messages: [], response_format: { type: "json_schema", json_schema: { strict: true, name: "toonstudio_script_to_cuts" } } });
const plan = inspectBody(body, model);
const headers = { Authorization: "Bearer synthetic", "Content-Type": "application/json",
  "OpenAI-Organization": "org-synthetic", "OpenAI-Project": "proj_synthetic" };
const now = Date.now();
const gate = { phase: "S1", decision: "root-verified-promo-only", endpoint, ...plan, verifiedAt: now,
  expiresAt: now + 300_000, creditExpiresAt: now + 360_000, creditMicroUsd: plan.reserveMicroUsd,
  keyBinding: keyBinding("synthetic", headers["OpenAI-Organization"], headers["OpenAI-Project"]) };

test("단계, 계정 근거, 승인 시각과 예약액을 실제 요청 계획과 대조한다", () => {
  verifyApproval(gate, now);
  for (const changes of [{ phase: "dialogue" }, { decision: true }, { endpoint: endpoint + "?q" },
    { model: "gpt-4.1-mini" }, { bodySha256: "x" }, { reserveMicroUsd: 0 }, { creditMicroUsd: plan.reserveMicroUsd - 1 },
    { expiresAt: now }, { verifiedAt: now + 1 }, { expiresAt: now + 900_001, creditExpiresAt: now + 999_999 },
    { creditExpiresAt: gate.expiresAt - 1 }, { keyBinding: null }]) {
    assert.throws(() => verifyApproval({ ...gate, ...changes }, now));
  }
});

test("본문 바이트, 앱 모델, 키·조직·프로젝트와 헤더 집합이 모두 일치해야 한다", () => {
  verifyRequest(gate, body, headers, model);
  for (const key of Object.keys(headers)) {
    const missing = { ...headers };
    delete missing[key];
    assert.throws(() => verifyRequest(gate, body, missing, model));
  }
  for (const changes of [{ Authorization: "Bearer unapproved" }, { "OpenAI-Organization": "org-different" },
    { "OpenAI-Project": "proj_different" }, { Host: "127.0.0.1" }]) {
    assert.throws(() => verifyRequest(gate, body, { ...headers, ...changes }, model));
  }
  for (const changed of [body + " ", body.replace("1400", "1401"), body.replace('"store":false', '"n":2,"store":false')]) {
    assert.throws(() => verifyRequest(gate, changed, headers, model));
  }
  assert.throws(() => verifyRequest(gate, body, headers, "gpt-4.1-mini"));
});

test("사용량의 합계와 입력·출력 한도를 검사하고 숫자만 남긴다", () => {
  const usage = { prompt_tokens: 1, completion_tokens: 1400, total_tokens: 1401 };
  assert.deepEqual(readUsage({ usage: { ...usage, extra: "discard" } }, gate), usage);
  for (const changes of [{ prompt_tokens: -1 }, { total_tokens: 1.5 }, { completion_tokens: 1401, total_tokens: 1402 },
    { prompt_tokens: plan.inputTokenLimit + 1, total_tokens: plan.inputTokenLimit + 1401 }]) {
    assert.throws(() => readUsage({ usage: { ...usage, ...changes } }, gate));
  }
});

test("소유자 전용 일반 파일만 읽고 같은 단계의 예약은 재시작 후에도 한 번만 허용한다", t => {
  const parent = mkdtempSync(join(tmpdir(), "two-cut-policy-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const dir = join(parent, "private");
  mkdirSync(dir, { mode: 0o700 });
  const file = join(dir, "S1.json");
  assert.throws(() => readApproval(dir));
  writeFileSync(file, JSON.stringify(gate), { mode: 0o600 });
  assert.deepEqual(readApproval(dir), gate);
  chmodSync(file, 0o640);
  assert.throws(() => readApproval(dir));
  chmodSync(file, 0o600);
  linkSync(file, join(dir, "link"));
  assert.throws(() => readApproval(dir));
  rmSync(file);
  symlinkSync(join(dir, "link"), file);
  assert.throws(() => readApproval(dir));
  chmodSync(dir, 0o755);
  assert.throws(() => reserve(dir, plan));
  chmodSync(dir, 0o700);
  const fd = reserve(dir, plan);
  try { assert.throws(() => reserve(dir, plan)); } finally { closeSync(fd); }
  assert.throws(() => reserve(dir, plan));
  const log = join(dir, "S1.spent.jsonl");
  assert.equal(statSync(log).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(log, "utf8")), { status: "reserved", model, reserveMicroUsd: plan.reserveMicroUsd });
});

test("현재 QA 프로세스에서 송신 경계를 교체하거나 해제할 수 없다", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  assert.equal(descriptor?.writable, false);
  assert.equal(descriptor?.configurable, false);
});

test("승인 없는 원격 송신과 loopback 프록시 경유를 전송 전에 차단한다", async () => {
  for (const url of [endpoint + "?x", "https://provider.invalid/v1", "http://127.0.0.1:11434/api/chat",
    "http://127.0.0.1:4101/api/health/live", "http://localhost:4101/proxy"]) {
    await assert.rejects(fetch(url, { method: "POST" }), /로컬 QA 송신 차단/u);
  }
  // 실제 공급자 주소로는 정책에서 항상 거부하는 GET만 검사한다.
  await assert.rejects(fetch(endpoint), /로컬 QA 송신 차단/u);
});


test("길이 헤더 없이도 실제 수신 바이트를 누적해 경계에서 멈춘다", async () => {
  const limit = Buffer.alloc(65_536);
  assert.equal((await readBoundedBody([limit])).length, limit.length);
  await assert.rejects(readBoundedBody([limit, Buffer.alloc(1)]), /로컬 QA 송신 차단/u);
});

test("동시에 시작한 독립 프로세스 중 하나만 예약하고 재기동도 차단한다", async t => {
  const dir = mkdtempSync(join(tmpdir(), "two-cut-race-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = `
    import { closeSync } from "node:fs";
    import { reserve } from ${JSON.stringify(new URL("./two-cut-server-egress.mjs", import.meta.url).href)};
    try { closeSync(reserve(process.argv[1], { model: "gpt-4o-mini", reserveMicroUsd: 5901 })); }
    catch (error) { process.exitCode = error.code === "EEXIST" ? 2 : 1; }
  `;
  const attempt = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", source, dir], { env: {}, stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", resolve);
  });
  assert.deepEqual((await Promise.all([attempt(), attempt(), attempt()])).sort(), [0, 2, 2]);
  assert.equal(await attempt(), 2);
});
