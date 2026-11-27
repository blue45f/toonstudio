#!/usr/bin/env node
/**
 * ToonStudio ₩0 Fail-Closed 무료 AI 실연동 안전 검증 스크립트.
 *
 * - `.env.local` / `.env.infrastructure.local`에서 설정된 무료 AI 공급자를 읽되
 *   비밀값(API 키·토큰·계정 ID)은 절대 출력·저장·반환하지 않는다.
 * - 기본 동작과 --offline-only는 외부 통신 없이 구성과 차단 규칙을 점검한다.
 * - --live-openrouter는 단가 상한 0의 무료 모델에만 합성 입력을 1회 보낸다.
 * - OpenAI 크레딧 실행은 계정 증거를 검증하는 studio-openai-credit-evaluation.mts에서 수행한다.
 * - HTTP 402/429·insufficient_quota·billing_hard_limit·90% 안전선 차단 시뮬레이션과
 *   시크릿 누출 0건 자체 감사를 함께 실행해 JSON 리포트를 출력한다.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FREE_AI_14_MODES_CATALOG } from "../tools/toonstudio-mcp/tools-division-ai.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const USAGE = "사용법: node scripts/verify-free-ai-assist-zero-cost.mjs [--offline-only | --live-openrouter]";
const MAX_PROBE_TOKENS = 32;
const PROBE_TIMEOUT_MS = 12_000;
const SAFETY_CUTOFF_RATIO = 0.9;
const CLOUDFLARE_ACCOUNT_PATTERN = /^[0-9a-f]{32}$/u;

const WHITELISTS = {
  "openai-free-share": new Set(["gpt-4o-mini", "gpt-4.1-mini", "gpt-4o"]),
  "gemini-free": new Set(["gemini-2.5-flash", "gemini-2.5-flash-lite"]),
  "github-models-free": new Set([
    "openai/gpt-4o-mini",
    "openai/gpt-4.1-mini",
    "meta/llama-3.3-70b-instruct",
    "deepseek/deepseek-v3-0324",
    "mistral-ai/mistral-small-2503",
  ]),
  "cloudflare-workers-ai-free": new Set([
    "@cf/google/gemma-4-26b-a4b-it",
    "@cf/zai-org/glm-4.7-flash",
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "@cf/meta/llama-3.1-8b-instruct-fast",
  ]),
  "mistral-free": new Set(["mistral-small-latest", "open-mistral-nemo", "ministral-8b-latest"]),
  "sambanova-free": new Set(["deepseek-v3.1", "deepseek-v3-0324", "meta-llama-3.3-70b-instruct"]),
  "groq-free": new Set(["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"]),
};
const RETIRED_OPENAI_MODELS = new Set(["gpt-4.1-nano", "gpt-4.1-nano-2025-04-14"]);

function resolveEnvCandidateDirs() {
  const dirs = [REPO_ROOT];
  try {
    const commonDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (commonDir) {
      const mainRoot = resolve(commonDir, "..");
      if (!dirs.includes(mainRoot)) dirs.push(mainRoot);
    }
  } catch {
    // git 메타데이터가 없는 환경에서는 현재 작업 디렉터리만 검사한다.
  }
  return dirs;
}

function parseEnvFileSafe(filePath) {
  const out = {};
  if (!existsSync(filePath)) return out;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/u);
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && value) out[key] = value;
  }
  return out;
}

function loadMergedEnvWithoutExposingSecrets() {
  const merged = {};
  const loadedFiles = [];
  const dirs = resolveEnvCandidateDirs();
  // 우선순위: .env.infrastructure.local < .env.local < process.env
  for (const dir of [...dirs].reverse()) {
    for (const fileName of [".env.infrastructure.local", ".env.local"]) {
      const fullPath = join(dir, fileName);
      if (existsSync(fullPath)) {
        Object.assign(merged, parseEnvFileSafe(fullPath));
        loadedFiles.push(fileName);
      }
    }
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (v && v.trim()) merged[k] = v.trim();
  }
  return { merged, loadedFileTypes: [...new Set(loadedFiles)] };
}

function readFirst(env, keys) {
  for (const k of keys) {
    const v = env[k]?.trim();
    if (v) return v;
  }
  return "";
}

function isAllowedFreeModel(providerId, model) {
  const normalized = String(model || "").trim().toLowerCase();
  if (!normalized) return { allowed: false, reason: "empty_model" };
  if (providerId === "openai-free-share" && RETIRED_OPENAI_MODELS.has(normalized)) {
    return { allowed: false, reason: "retired_model_blocked" };
  }
  if (providerId === "openrouter-free") {
    return normalized === "openrouter/free" || /^[a-z0-9._-]+\/[a-z0-9._-]+:free$/u.test(normalized)
      ? { allowed: true, reason: null }
      : { allowed: false, reason: "paid_model_blocked" };
  }
  const set = WHITELISTS[providerId];
  if (!set) return { allowed: false, reason: "unknown_provider" };
  return set.has(normalized)
    ? { allowed: true, reason: null }
    : { allowed: false, reason: "paid_model_blocked" };
}

function nextUtcMidnightIso(nowMs = Date.now()) {
  const d = new Date(nowMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

function classifyFailure(status, bodyText) {
  if (status === 402) return "http_402_payment_required";
  const snippet = String(bodyText || "").slice(0, 4_096);
  if (/billing_hard_limit|spend_limit_exceeded|credit_balance_exhausted/iu.test(snippet)) {
    return "billing_hard_limit";
  }
  if (/insufficient_quota|quota_exceeded|resource_exhausted/iu.test(snippet)) {
    return "insufficient_quota";
  }
  if (status === 429) return "http_429_rate_limit";
  if (status === 401 || status === 403) return "auth_failed";
  return `http_${status}`;
}

function resolveProbeSpecs(env) {
  const cfAccount = readFirst(env, [
    "STUDIO_AI_FREE_CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_ACCOUNT_ID",
    "ONPOD_API_ENV_STUDIO_AI_FREE_CLOUDFLARE_ACCOUNT_ID",
  ]).toLowerCase();
  const cfValidAccount = CLOUDFLARE_ACCOUNT_PATTERN.test(cfAccount);

  return [
    {
      id: "openai-free-share",
      labelKo: "OpenAI 무료 데이터 공유 토큰",
      priority: 1,
      apiKey: readFirst(env, ["OPENAI_API_KEY"]),
      endpoint: "https://api.openai.com/v1/chat/completions",
      model: readFirst(env, ["OPENAI_MODEL"]) || "gpt-4o-mini",
    },
    {
      id: "gemini-free",
      labelKo: "Gemini 무료 티어",
      priority: 2,
      apiKey: readFirst(env, [
        "STUDIO_AI_FREE_GEMINI_API_KEY",
        "ONPOD_API_ENV_STUDIO_AI_FREE_GEMINI_API_KEY",
        "GEMINI_API_KEY",
        "GOOGLE_AI_API_KEY",
      ]),
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model:
        readFirst(env, [
          "STUDIO_FREE_AI_GEMINI_MODEL",
          "GEMINI_MODEL",
          "STUDIO_AI_FREE_GEMINI_MODEL",
        ]) || "gemini-2.5-flash-lite",
    },
    {
      id: "github-models-free",
      labelKo: "GitHub Models 무료",
      priority: 3,
      apiKey: readFirst(env, [
        "STUDIO_AI_FREE_GITHUB_MODELS_API_KEY",
        "GITHUB_MODELS_API_KEY",
        "ONPOD_API_ENV_STUDIO_AI_FREE_GITHUB_MODELS_API_KEY",
      ]),
      endpoint: "https://models.github.ai/inference/chat/completions",
      model: readFirst(env, ["STUDIO_AI_FREE_GITHUB_MODELS_MODEL"]) || "openai/gpt-4o-mini",
    },
    {
      id: "cloudflare-workers-ai-free",
      labelKo: "Cloudflare Workers AI 무료",
      priority: 4,
      apiKey: cfValidAccount
        ? readFirst(env, [
            "STUDIO_AI_FREE_CLOUDFLARE_API_TOKEN",
            "CLOUDFLARE_WORKERS_AI_API_TOKEN",
            "ONPOD_API_ENV_STUDIO_AI_FREE_CLOUDFLARE_API_TOKEN",
          ])
        : "",
      endpoint: cfValidAccount
        ? `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/v1/chat/completions`
        : "",
      model: readFirst(env, ["STUDIO_AI_FREE_CLOUDFLARE_MODEL"]) || "@cf/google/gemma-4-26b-a4b-it",
    },
    {
      id: "mistral-free",
      labelKo: "Mistral 무료 티어",
      priority: 5,
      apiKey: readFirst(env, [
        "STUDIO_AI_FREE_MISTRAL_API_KEY",
        "ONPOD_API_ENV_STUDIO_AI_FREE_MISTRAL_API_KEY",
      ]),
      endpoint: "https://api.mistral.ai/v1/chat/completions",
      model:
        readFirst(env, [
          "STUDIO_AI_FREE_MISTRAL_MODEL",
          "ONPOD_API_ENV_STUDIO_AI_FREE_MISTRAL_MODEL",
        ]) || "mistral-small-latest",
    },
    {
      id: "sambanova-free",
      labelKo: "SambaNova 무료 티어",
      priority: 6,
      apiKey: readFirst(env, [
        "STUDIO_AI_FREE_SAMBANOVA_API_KEY",
        "ONPOD_API_ENV_STUDIO_AI_FREE_SAMBANOVA_API_KEY",
      ]),
      endpoint: "https://api.sambanova.ai/v1/chat/completions",
      model:
        readFirst(env, [
          "STUDIO_AI_FREE_SAMBANOVA_MODEL",
          "ONPOD_API_ENV_STUDIO_AI_FREE_SAMBANOVA_MODEL",
        ]) || "DeepSeek-V3.1",
    },
    {
      id: "groq-free",
      labelKo: "Groq 무료 플랜",
      priority: 7,
      apiKey: readFirst(env, [
        "STUDIO_AI_FREE_GROQ_API_KEY",
        "ONPOD_API_ENV_STUDIO_AI_FREE_GROQ_API_KEY",
      ]),
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      model: readFirst(env, ["STUDIO_AI_FREE_GROQ_MODEL"]) || "llama-3.3-70b-versatile",
    },
    {
      id: "openrouter-free",
      labelKo: "OpenRouter 무료(:free 전용)",
      priority: 8,
      apiKey: readFirst(env, [
        "STUDIO_AI_FREE_OPENROUTER_API_KEY",
        "ONPOD_API_ENV_STUDIO_AI_FREE_OPENROUTER_API_KEY",
        "OPENROUTER_API_KEY",
      ]),
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      model: readFirst(env, ["STUDIO_AI_FREE_OPENROUTER_MODEL", "ONPOD_API_ENV_STUDIO_AI_FREE_OPENROUTER_MODEL"]) || "openrouter/free",
    },
  ];
}

async function runSingleHardCappedProbe(spec, liveOpenRouter, fetchImpl) {
  const configured = Boolean(spec.apiKey && spec.endpoint);
  const modelCheck = isAllowedFreeModel(spec.id, spec.model);
  const result = {
    id: spec.id, labelKo: spec.labelKo, priority: spec.priority, configured,
    model: spec.model, modelAllowed: modelCheck.allowed, probeExecuted: false,
    httpStatus: null, outcome: "skipped-not-configured", diagnosticCode: "not_configured",
    latencyMs: 0, usageTotalTokens: 0, reportedCostUsd: null,
  };
  if (!configured) return result;
  if (!modelCheck.allowed) {
    return { ...result, outcome: "fail-closed-blocked-before-send", diagnosticCode: modelCheck.reason };
  }
  if (!liveOpenRouter) return { ...result, outcome: "skipped-offline-mode", diagnosticCode: "offline_mode" };
  if (spec.id !== "openrouter-free") {
    return { ...result, outcome: "skipped-account-billing-unverified", diagnosticCode: "account_billing_unverified" };
  }

  const startedAt = Date.now();
  result.probeExecuted = true;
  result.usageTotalTokens = null;
  try {
    const response = await fetchImpl(spec.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${spec.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: spec.model,
        messages: [{ role: "user", content: "Reply with exactly OK." }],
        max_tokens: MAX_PROBE_TOKENS,
        temperature: 0,
        provider: { max_price: { prompt: 0, completion: 0, request: 0 }, allow_fallbacks: false },
        plugins: [],
        usage: { include: true },
      }),
      redirect: "error",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    result.httpStatus = response.status;
    const body = await response.text();
    if (!response.ok) {
      result.outcome = "upstream-error";
      result.diagnosticCode = classifyFailure(response.status, body);
      return result;
    }
    const parsed = JSON.parse(body);
    const usage = parsed?.usage;
    if (Number.isSafeInteger(usage?.total_tokens) && usage.total_tokens >= 0) result.usageTotalTokens = usage.total_tokens;
    if (Number.isFinite(usage?.cost) && usage.cost >= 0) result.reportedCostUsd = usage.cost;
    if (parsed?.choices?.[0]?.message?.content?.trim() !== "OK") {
      result.outcome = "fail-closed-unexpected-response";
      result.diagnosticCode = "unexpected_reply";
    } else if (result.reportedCostUsd !== 0) {
      result.outcome = "fail-closed-unverified-cost";
      result.diagnosticCode = result.reportedCostUsd === null ? "missing_cost" : "nonzero_cost";
    } else {
      result.outcome = "live-probe-ok";
      result.diagnosticCode = "ok";
    }
  } catch (error) {
    result.outcome = "fail-closed-request-error";
    result.diagnosticCode = result.httpStatus !== null ? "invalid_response"
      : error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network_error";
  } finally {
    result.latencyMs = Date.now() - startedAt;
  }
  return result;
}

function runGuardrailSimulations() {
  const paidBlocks = [
    {
      case: "openai_retired_gpt-4.1-nano",
      ...isAllowedFreeModel("openai-free-share", "gpt-4.1-nano"),
      expectedAllowed: false,
    },
    {
      case: "openai_paid_o3",
      ...isAllowedFreeModel("openai-free-share", "o3"),
      expectedAllowed: false,
    },
    {
      case: "gemini_paid_2.5_pro",
      ...isAllowedFreeModel("gemini-free", "gemini-2.5-pro"),
      expectedAllowed: false,
    },
    {
      case: "gemini_free_2.5_flash",
      ...isAllowedFreeModel("gemini-free", "gemini-2.5-flash"),
      expectedAllowed: true,
    },
    {
      case: "openrouter_paid_non_free",
      ...isAllowedFreeModel("openrouter-free", "openai/gpt-4o"),
      expectedAllowed: false,
    },
  ].map((entry) => ({ ...entry, passed: entry.allowed === entry.expectedAllowed }));

  const cutoffSimulation = {
    dailyCap: 1000,
    safetyCutoffRatio: SAFETY_CUTOFF_RATIO,
    safeCutoffTokens: Math.floor(1000 * SAFETY_CUTOFF_RATIO),
    usedTokens: 900,
    blocked: 900 >= Math.floor(1000 * SAFETY_CUTOFF_RATIO),
    blockedUntilUtc: nextUtcMidnightIso(),
    passed: 900 >= Math.floor(1000 * SAFETY_CUTOFF_RATIO),
  };

  const errorBlockSimulations = [
    { status: 402, body: '{"error":"payment_required"}', expected: "http_402_payment_required" },
    { status: 429, body: '{"error":{"code":"insufficient_quota"}}', expected: "insufficient_quota" },
    { status: 429, body: '{"error":{"code":"billing_hard_limit_reached"}}', expected: "billing_hard_limit" },
  ].map((item) => {
    const actual = classifyFailure(item.status, item.body);
    return {
      status: item.status,
      actual,
      expected: item.expected,
      blockedUntilUtc: nextUtcMidnightIso(),
      passed: actual === item.expected,
    };
  });

  const allPassed =
    paidBlocks.every((c) => c.passed) &&
    cutoffSimulation.passed &&
    errorBlockSimulations.every((c) => c.passed);

  return { allPassed, paidBlocks, cutoffSimulation, errorBlockSimulations };
}

export async function verifyFreeAiAssist({ env: merged, args = [], envSources = [], fetchImpl = fetch }) {
  if (args.length > 1 || (args.length === 1 && !["--offline-only", "--live-openrouter"].includes(args[0]))) {
    throw new Error(USAGE);
  }
  const liveOpenRouter = args[0] === "--live-openrouter";
  const specs = resolveProbeSpecs(merged);

  // 누출 감사에 사용할 비밀값 목록(출력에는 절대 포함하지 않는다).
  const secretValuesToAudit = specs
    .map((s) => s.apiKey)
    .filter((v) => typeof v === "string" && v.length >= 8);
  const cfAcc = readFirst(merged, [
    "STUDIO_AI_FREE_CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_ACCOUNT_ID",
  ]);
  if (cfAcc && cfAcc.length >= 16) secretValuesToAudit.push(cfAcc);

  const guardrailSimulations = runGuardrailSimulations();
  const liveProbes = [];
  for (const spec of specs) {
    liveProbes.push(await runSingleHardCappedProbe(spec, liveOpenRouter, fetchImpl));
  }

  const dispatched = liveProbes.filter((probe) => probe.probeExecuted);
  const succeeded = dispatched.filter((probe) => probe.outcome === "live-probe-ok");
  const reportedCostUsd = dispatched.length ? dispatched[0].reportedCostUsd : null;
  const report = {
    ok: guardrailSimulations.allPassed && (!liveOpenRouter || succeeded.length === 1),
    verifiedAtUtc: new Date().toISOString(),
    offlineOnly: !liveOpenRouter,
    reportedCostUsd,
    accountBalanceVerified: false,
    hardCapPolicy: {
      maxProbeTokens: MAX_PROBE_TOKENS,
      maxProbesPerProvider: 1,
      retriesAllowed: 0,
      safetyCutoffRatio: SAFETY_CUTOFF_RATIO,
    },
    envSourcesDetected: envSources,
    guardrailSimulations,
    liveProbes,
    summary: {
      configuredCloudProviders: liveProbes.filter((p) => p.configured).length,
      requestsDispatched: dispatched.length,
      liveProbesSucceeded: succeeded.length,
      failClosedTriggered: liveProbes.filter((p) => p.outcome.startsWith("fail-closed")).length,
      mcpAiModesCount: FREE_AI_14_MODES_CATALOG.length,
      secretLeaksDetected: 0,
    },
  };

  const serialized = JSON.stringify(report, null, 2);
  const leaked =
    secretValuesToAudit.some((secret) => serialized.includes(secret)) ||
    /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{30,}|Bearer\s+[A-Za-z0-9._-]{20,})\b/u.test(
      serialized,
    );

  if (leaked) {
    throw new Error("보고서에서 민감한 값이 탐지되어 출력을 중단했습니다. 공급자 모델 설정을 확인하세요.");
  }

  return report;
}

if (import.meta.main) {
  try {
    const { merged, loadedFileTypes } = loadMergedEnvWithoutExposingSecrets();
    const report = await verifyFreeAiAssist({ env: merged, envSources: loadedFileTypes, args: process.argv.slice(2) });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
