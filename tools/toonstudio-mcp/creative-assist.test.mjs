import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runToonStudioCli } from "./cli.mjs";
import { createToonStudioMcpEngine } from "./server.mjs";
import { FREE_AI_14_MODES_CATALOG, inspectSafeFreeQuotaStatus } from "./tools-division-ai.mjs";

const tool = "studio.ai.run_creative_assist";
const manuscript = { mode: "continuity-plot-audit", inputText: "첫 컷에는 열쇠가 없다.\n마지막 컷에는 문이 열려 있다." };
const result = { mode: manuscript.mode, data: { overallConsistencyScore: 76, summary: "열쇠를 얻는 컷을 확인하세요.", issues: [] } };

function call(engine, args) {
  return engine.handleJsonRpcRequest({ id: 9, jsonrpc: "2.0", method: "tools/call", params: { name: tool, arguments: args } });
}

test("14가지 모드가 원고에 맞춘 로컬 점검 결과를 즉시 반환한다", () => {
  const engine = createToonStudioMcpEngine({ env: {} });
  const reviews = new Set();
  for (const { id: mode } of FREE_AI_14_MODES_CATALOG) {
    const read = (inputText) => call(engine, { mode, inputText }).result.structuredContent.run;
    const first = read(manuscript.inputText);
    const second = read("보라가 오래된 사진을 집어 든다.");
    assert.equal(first.provider, "local-zero-cost-fallback");
    assert.equal(first.remoteStatus, "not-requested");
    assert.notDeepEqual(first.recommendations, second.recommendations);
    reviews.add(first.recommendations[1]);
  }
  assert.equal(reviews.size, 14);
  assert.equal(call(engine, { ...manuscript, inputText: " " }).result.structuredContent.ok, false);
  assert.equal(engine.getState().ai.runs.length, 28);
});

test("원격 선택 시 결과 계약을 검증하고 대기 후 한 번만 기록하며 실패는 로컬 점검으로 표시한다", async () => {
  let requests = 0;
  const engine = createToonStudioMcpEngine({
    apiUrl: "https://toonstudio.invalid",
    fetchImpl: async (url, options) => {
      requests += 1;
      assert.equal(url, "https://toonstudio.invalid/api/studio/ai/creative-assist");
      assert.equal(options.redirect, "error");
      assert.equal(options.credentials, "omit");
      assert.equal(JSON.parse(options.body).allowZeroBillCascade, true);
      if (requests === 3) return new Response(null, { status: 503 });
      return Response.json({
        provider: "local-zero-cost-fallback", paidBillingBlocked: true, costGuaranteedZeroUsd: 0,
        result: requests === 1 ? result : { ...result, data: {} },
      });
    },
  });
  const pending = call(engine, manuscript);
  assert.equal(engine.getState().ai.runs.length, 0);
  const completed = await pending;
  assert.equal(completed.id, 9);
  assert.equal(completed.result.structuredContent.run.remoteStatus, "completed");
  assert.deepEqual(completed.result.structuredContent.run.result, result);
  const invalid = (await call(engine, manuscript)).result.structuredContent.run;
  assert.equal(invalid.remoteStatus, "invalid-response");
  assert.ok(invalid.recommendations.length);
  const failed = (await call(engine, manuscript)).result.structuredContent.run;
  assert.equal(failed.remoteStatus, "http-error");
  assert.equal(failed.remoteHttpStatus, 503);
  const preview = call(engine, { ...manuscript, dryRun: true }).result.structuredContent.run;
  assert.equal(preview.remoteStatus, "dry-run");
  assert.equal(preview.id, null);
  assert.equal(requests, 3);
  assert.equal(engine.getState().ai.runs.length, 3);
});

test("CLI의 call과 batch는 원격 결과와 단계 순서를 보존하고 dry-run은 전송하지 않는다", async (t) => {
  let requests = 0;
  const api = createServer((_req, res) => {
    requests += 1;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ result, provider: "local-zero-cost-fallback", paidBillingBlocked: true, costGuaranteedZeroUsd: 0 }));
  });
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  t.after(() => api.close());
  const origin = `http://127.0.0.1:${api.address().port}`;
  const input = ["call", tool, "--json", JSON.stringify(manuscript)];
  const options = { env: { TOONSTUDIO_API_URL: origin } };
  const read = async (args) => JSON.parse((await runToonStudioCli(args, options)).output);
  assert.equal((await read(input)).run.remoteStatus, "not-requested");
  assert.equal((await read([...input, "--api-url", origin, "--dry-run"])).run.remoteStatus, "dry-run");
  assert.equal(requests, 0);
  assert.equal((await read([...input, "--api-url", origin])).run.remoteStatus, "completed");
  const batch = await read(["batch", "--api-url", origin, "--json", JSON.stringify([
    { tool, arguments: manuscript }, { tool: "studio.session.snapshot" },
  ])]);
  assert.equal(batch.results[0].result.run.remoteStatus, "completed");
  assert.deepEqual(batch.results[1].result.state.ai.runs[0].result, result);
  assert.equal(requests, 2);
});

test("STDIO 미리보기는 JSON-RPC 요청 ID를 보존한다", () => {
  const server = fileURLToPath(new URL("./server.mjs", import.meta.url));
  const packet = {
    jsonrpc: "2.0", id: "preview-14", method: "tools/call", params: { name: tool, arguments: manuscript },
  };
  const proc = spawnSync(process.execPath, [server, "--api-url", "http://127.0.0.1:1", "--dry-run"], {
    input: JSON.stringify(packet) + "\n", encoding: "utf8",
  });
  assert.equal(proc.status, 0);
  const response = JSON.parse(proc.stdout);
  assert.equal(response.id, "preview-14");
  assert.equal(response.result.structuredContent.run.remoteStatus, "dry-run");
});

test("원고와 제목의 연락처·주소·토큰을 전송 본문과 결과 기록에서 보호한다", async () => {
  const phone = ["010", "0000", "1234"].join("-");
  const address = ["서울 강남구", "테헤란로 152"].join(" ");
  const token = ["Bearer", "fictionalexamplevalue0123456"].join(" ");
  const inputs = [phone, address, token];
  let outgoing;
  const engine = createToonStudioMcpEngine({
    apiUrl: "https://toonstudio.invalid",
    fetchImpl: async (_url, options) => {
      outgoing = options.body;
      return Response.json({
        provider: "local-zero-cost-fallback", paidBillingBlocked: true, costGuaranteedZeroUsd: 0,
        result: { ...result, data: { ...result.data, summary: `연락할 곳: ${phone}` } },
      });
    },
  });
  const doc = { ...manuscript, inputText: `신청서 ${phone}, ${address}에 전달. ${token}`, projectTitle: token };
  const response = await call(engine, doc);
  assert.equal(response.result.structuredContent.run.remoteStatus, "completed");
  for (const sensitive of inputs) {
    assert.equal(outgoing.includes(sensitive), false);
    assert.equal(JSON.stringify(engine.getState().ai.runs).includes(sensitive), false);
    assert.equal(JSON.stringify(response).includes(sensitive), false);
  }
});

test("공용 계약이 없는 단독 복사본은 민감한 원문을 전송하거나 기록하지 않고 로컬 점검을 수행한다", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "toonstudio-mcp-standalone-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = fileURLToPath(new URL(".", import.meta.url));
  cpSync(source, directory, { recursive: true });
  const input = "단독 복사에서만 사용하는 합성 원고";
  const proc = spawnSync(process.execPath, [join(directory, "cli.mjs"), "call", tool, "--api-url", "http://127.0.0.1:1",
    "--json", JSON.stringify({ ...manuscript, inputText: input, projectTitle: input })], { encoding: "utf8" });
  assert.equal(proc.status, 0);
  const run = JSON.parse(proc.stdout).run;
  assert.equal(run.remoteStatus, "contract-unavailable");
  assert.equal(run.inputPreview, "");
  assert.equal(proc.stdout.includes(input), false);
  assert.ok(run.recommendations.length);
});

test("CLI 할당량은 OpenAI 키만 있는 계정을 활성 무료 경로로 표시하지 않는다", () => {
  const key = { OPENAI_API_KEY: "standin" };
  for (const [flag, active] of [[undefined, 0], ["false", 0], ["true", 1]]) {
    const quota = inspectSafeFreeQuotaStatus({ ...key, STUDIO_AI_FREE_OPENAI_CONFIRMED: flag });
    assert.equal(quota.summary.configuredCloudCount, 1);
    assert.equal(quota.summary.activeCloudCount, active);
    assert.equal(quota.accountBalanceVerified, false);
  }
});
