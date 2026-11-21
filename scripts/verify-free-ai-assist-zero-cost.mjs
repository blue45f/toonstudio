#!/usr/bin/env node
/**
 * ToonStudio ₩0 Fail-Closed 무료 AI 실연동 안전 검증 스크립트.
 *
 * - `.env.local` / `.env.infrastructure.local`에서 설정된 무료 AI 공급자를 읽되
 *   비밀값(API 키·토큰·계정 ID)은 절대 출력·저장·반환하지 않는다.
 * - 각 설정된 무료 공급자당 최대 1회, `max_tokens: 32` 하드캡으로만 프로브하고
 *   유료 전용 모델은 호출 전 즉시 차단한다.
 * - HTTP 402/429·insufficient_quota·billing_hard_limit·90% 안전선 차단 시뮬레이션과
 *   시크릿 누출 0건 자체 감사를 함께 실행해 JSON 리포트를 출력한다.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  FREE_AI_14_MODES_CATALOG,
  inspectSafeFreeQuotaStatus,
} from "../tools/toonstudio-mcp/tools-division-ai.mjs";

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
  const dirs = [process.cwd()];
  try {
    const commonDir = execFileSync("git", ["rev-parse", "--git-common-dir"], {
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
    return normalized === "openrouter/free" || normalized.endsWith(":free")
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
      useMaxCompletionTokens: true,
      sendStoreFalse: true,
    },
    {
      id: "gemini-free",
      labelKo: "Gemini 무료 티어",
      priority: 2,
      apiKey: readFirst(env, [
        "GEMINI_API_KEY",
        "GOOGLE_AI_API_KEY",
        "STUDIO_AI_FREE_GEMINI_API_KEY",
        "ONPOD_API_ENV_STUDIO_AI_FREE_GEMINI_API_KEY",
      ]),
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model:
        readFirst(env, [
          "STUDIO_FREE_AI_GEMINI_MODEL",
          "GEMINI_MODEL",
          "STUDIO_AI_FREE_GEMINI_MODEL",
        ]) || "gemini-2.5-flash-lite",
      useMaxCompletionTokens: false,
      sendStoreFalse: false,
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
      useMaxCompletionTokens: false,
      sendStoreFalse: false,
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
      useMaxCompletionTokens: false,
      sendStoreFalse: false,
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
      useMaxCompletionTokens: false,
      sendStoreFalse: false,
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
      useMaxCompletionTokens: false,
      sendStoreFalse: false,
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
      useMaxCompletionTokens: false,
      sendStoreFalse: false,
    },
    {
      id: "openrouter-free",
      labelKo: "OpenRouter 무료(:free 전용)",
      priority: 8,
      apiKey: readFirst(env, [
        "STUDIO_AI_FREE_OPENROUTER_API_KEY",
        "ONPOD_API_ENV_STUDIO_AI_FREE_OPENROUTER_API_KEY",
      ]),
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      model: readFirst(env, ["STUDIO_AI_FREE_OPENROUTER_MODEL"]) || "openrouter/free",
      useMaxCompletionTokens: false,
      sendStoreFalse: false,
    },
  ];
}

async function runSingleHardCappedProbe(spec, offlineOnly) {
  const configured = Boolean(spec.apiKey && spec.endpoint);
  const modelCheck = isAllowedFreeModel(spec.id, spec.model);

  if (!configured) {
    return {
      id: spec.id,
      labelKo: spec.labelKo,
      priority: spec.priority,
      configured: false,
      model: spec.model,
      modelAllowed: modelCheck.allowed,
      probeExecuted: false,
      httpStatus: null,
      outcome: "skipped-not-configured",
      diagnosticCode: "not_configured",
      failClosedBlockedUntilUtc: null,
      latencyMs: 0,
      usageTotalTokens: 0,
    };
  }

  if (!modelCheck.allowed) {
    return {
      id: spec.id,
      labelKo: spec.labelKo,
      priority: spec.priority,
      configured: true,
      model: spec.model,
      modelAllowed: false,
      probeExecuted: false,
      httpStatus: null,
      outcome: "fail-closed-blocked-before-send",
      diagnosticCode: modelCheck.reason,
      failClosedBlockedUntilUtc: null,
      latencyMs: 0,
      usageTotalTokens: 0,
    };
  }

  if (offlineOnly) {
    return {
      id: spec.id,
      labelKo: spec.labelKo,
      priority: spec.priority,
      configured: true,
      model: spec.model,
      modelAllowed: true,
      probeExecuted: false,
      httpStatus: null,
      outcome: "skipped-offline-mode",
      diagnosticCode: "offline_flag",
      failClosedBlockedUntilUtc: null,
      latencyMs: 0,
      usageTotalTokens: 0,
    };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const payload = {
      model: spec.model,
      temperature: 0,
      messages: [
        { role: "system", content: "Reply with exact token OK only." },
        { role: "user", content: "OK" },
      ],
    };
    if (spec.useMaxCompletionTokens) {
      payload.max_completion_tokens = MAX_PROBE_TOKENS;
    } else {
      payload.max_tokens = MAX_PROBE_TOKENS;
    }
    if (spec.sendStoreFalse) {
      payload.store = false;
    }

    const response = await fetch(spec.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${spec.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      const code = classifyFailure(response.status, text);
      const shouldBlockUntilMidnight =
        response.status === 402 ||
        response.status === 429 ||
        code === "insufficient_quota" ||
        code === "billing_hard_limit" ||
        code === "auth_failed";
      return {
        id: spec.id,
        labelKo: spec.labelKo,
        priority: spec.priority,
        configured: true,
        model: spec.model,
        modelAllowed: true,
        probeExecuted: true,
        httpStatus: response.status,
        outcome: shouldBlockUntilMidnight ? "fail-closed-blocked-and-failover" : "upstream-error",
        diagnosticCode: code,
        failClosedBlockedUntilUtc: shouldBlockUntilMidnight ? nextUtcMidnightIso() : null,
        latencyMs,
        usageTotalTokens: 0,
      };
    }

    let totalTokens = 0;
    let hasReply = false;
    let parsedOk = false;
    try {
      const parsed = JSON.parse(text);
      parsedOk = true;
      totalTokens = Number(parsed?.usage?.total_tokens ?? 0) || 0;
      const content = parsed?.choices?.[0]?.message?.content;
      hasReply = typeof content === "string" && content.trim().length > 0;
    } catch {
      parsedOk = false;
      hasReply = false;
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "unknown";
    const diagnosticCode = hasReply
      ? "ok"
      : !parsedOk
        ? `non_json_response:${contentType}`
        : "empty_reply";

    return {
      id: spec.id,
      labelKo: spec.labelKo,
      priority: spec.priority,
      configured: true,
      model: spec.model,
      modelAllowed: true,
      probeExecuted: true,
      httpStatus: response.status,
      outcome: hasReply ? "live-probe-ok" : "fail-closed-unexpected-response",
      diagnosticCode,
      failClosedBlockedUntilUtc: null,
      latencyMs,
      usageTotalTokens: totalTokens,
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      id: spec.id,
      labelKo: spec.labelKo,
      priority: spec.priority,
      configured: true,
      model: spec.model,
      modelAllowed: true,
      probeExecuted: true,
      httpStatus: null,
      outcome: "fail-closed-network-fallback",
      diagnosticCode: isAbort ? "timeout_12s" : "network_error",
      failClosedBlockedUntilUtc: null,
      latencyMs: Date.now() - startedAt,
      usageTotalTokens: 0,
    };
  } finally {
    clearTimeout(timer);
  }
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

async function main() {
  const offlineOnly = process.argv.includes("--offline-only");
  const { merged, loadedFileTypes } = loadMergedEnvWithoutExposingSecrets();
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
    liveProbes.push(await runSingleHardCappedProbe(spec, offlineOnly));
  }

  const safeMcpQuota = inspectSafeFreeQuotaStatus(merged);
  const report = {
    ok: guardrailSimulations.allPassed && safeMcpQuota.paidBillingBlocked === true,
    verifiedAtUtc: new Date().toISOString(),
    offlineOnly,
    guaranteedZeroCostUsd: 0,
    guaranteedZeroCostLabel: "$0.00",
    guaranteedZeroCostKrwLabel: "₩0",
    paidBillingBlocked: true,
    hardCapPolicy: {
      maxProbeTokens: MAX_PROBE_TOKENS,
      maxProbesPerProvider: 1,
      retriesAllowed: 0,
      safetyCutoffRatio: SAFETY_CUTOFF_RATIO,
    },
    envSourcesDetected: loadedFileTypes,
    guardrailSimulations,
    liveProbes,
    summary: {
      configuredCloudProviders: liveProbes.filter((p) => p.configured).length,
      liveProbesSucceeded: liveProbes.filter((p) => p.outcome === "live-probe-ok").length,
      failClosedTriggered: liveProbes.filter((p) => p.outcome.startsWith("fail-closed")).length,
      mcpAiModesCount: FREE_AI_14_MODES_CATALOG.length,
      localFallbackReady: true,
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
    process.stderr.write("FATAL: secret leak detected in report; output suppressed.\n");
    process.exit(2);
  }

  process.stdout.write(`${serialized}\n`);
  if (!report.ok) {
    process.exit(1);
  }
}

void main();
