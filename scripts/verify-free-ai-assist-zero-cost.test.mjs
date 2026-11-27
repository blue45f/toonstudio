import assert from "node:assert/strict";

import { verifyFreeAiAssist } from "./verify-free-ai-assist-zero-cost.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const env = {
  OPENAI_API_KEY: "simulated-account-key",
  GEMINI_API_KEY: "simulated-second-key",
  OPENROUTER_API_KEY: "simulated-router-key",
};

function verify(args, reply, customEnv = env) {
  const calls = [];
  const report = verifyFreeAiAssist({
    args,
    env: customEnv,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return reply();
    },
  });
  return { calls, report };
}

test("키가 설정된 기본 실행과 기존 오프라인 인수는 외부 요청을 보내지 않는다", async () => {
  for (const args of [[], ["--offline-only"]]) {
    const run = verify(args);
    const report = await run.report;
    assert.equal(run.calls.length, 0);
    assert.equal(report.ok, true);
    assert.equal(report.summary.configuredCloudProviders, 3);
    assert.equal(report.summary.requestsDispatched, 0);
    assert.equal(report.accountBalanceVerified, false);
    assert.equal(report.reportedCostUsd, null);
  }
});

test("실행 모드는 단가가 0인 OpenRouter 요청 1건만 보내고 공급자 응답을 확인한다", async () => {
  const run = verify(["--live-openrouter"], () => Response.json({
    choices: [{ message: { content: "OK" } }], usage: { total_tokens: 12, cost: 0 },
  }));
  const report = await run.report;
  assert.equal(run.calls.length, 1);
  assert.equal(run.calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
  const { options } = run.calls[0];
  const body = JSON.parse(options.body);
  assert.equal(body.model, "openrouter/free");
  assert.equal(body.max_tokens, 32);
  assert.deepEqual(body.provider.max_price, { prompt: 0, completion: 0, request: 0 });
  assert.deepEqual(body.plugins, []);
  assert.equal(options.redirect, "error");
  assert.equal(report.ok, true);
  assert.equal(report.reportedCostUsd, 0);
  for (const id of ["openai-free-share", "gemini-free"]) {
    assert.equal(report.liveProbes.find((probe) => probe.id === id).outcome, "skipped-account-billing-unverified");
  }
  assert.equal(JSON.stringify(report).includes(env.OPENROUTER_API_KEY), false);
});

test("잘못된 인수와 유료·혼합 모델, 미설정 계정은 전송 전에 거부한다", async () => {
  for (const args of [["--live"], ["--offline-only", "--live-openrouter"]]) {
    const run = verify(args);
    await assert.rejects(run.report, /사용법/u);
    assert.equal(run.calls.length, 0);
  }
  for (const customEnv of [
    { OPENAI_API_KEY: env.OPENAI_API_KEY },
    { ...env, STUDIO_AI_FREE_OPENROUTER_MODEL: "openai/gpt-4o" },
    { ...env, STUDIO_AI_FREE_OPENROUTER_MODEL: "openai/gpt-4o:online:free" },
  ]) {
    const run = verify(["--live-openrouter"], undefined, customEnv);
    assert.equal((await run.report).ok, false);
    assert.equal(run.calls.length, 0);
  }
});

test("불확실한 응답, 과금, 할당량 초과 및 연결 오류를 성공으로 기록하거나 재시도하지 않는다", async () => {
  const choices = [{ message: { content: "OK" } }];
  for (const [reply, diagnostic, cost] of [
    [() => Response.json({ choices }), "missing_cost", null],
    [() => Response.json({ choices, usage: { cost: 0.2 } }), "nonzero_cost", 0.2],
    [() => Response.json({ choices: [{ message: { content: "NO" } }], usage: { cost: 0 } }), "unexpected_reply", 0],
    [() => new Response("invalid JSON"), "invalid_response", null],
    [() => new Response("insufficient_quota", { status: 429 }), "insufficient_quota", null],
    [() => { throw new Error("network"); }, "network_error", null],
  ]) {
    const run = verify(["--live-openrouter"], reply);
    const report = await run.report;
    assert.equal(report.ok, false);
    assert.equal(run.calls.length, 1);
    assert.equal(report.reportedCostUsd, cost);
    assert.equal(report.liveProbes.find((probe) => probe.probeExecuted).diagnosticCode, diagnostic);
  }
});
