import { createHash, scryptSync, timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

import { z } from "zod";

import { StudioOpenAiCreativeAssistService } from "../apps/api/src/modules/studio-ai/studio-openai-creative-assist.service";

import { CREDIT_EVALUATION_FIXTURES, evaluateCreditOutput, HUMAN_EVALUATION_RUBRIC, type CreditEvaluationFixture } from "./studio-openai-credit-evaluation-fixtures";

import type { EnvLike } from "../apps/api/src/modules/studio-ai/openai-assist/studio-openai-guardrails";
import type { OpenAiAssistStructuredResult } from "../apps/api/src/modules/studio-ai/studio-openai-creative-assist.dto";

export const CREDIT_EVALUATION_MODELS = ["gpt-4o-mini", "gpt-4.1-mini"] as const;
type Model = (typeof CREDIT_EVALUATION_MODELS)[number];
const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const ACTOR = "openai-credit-evaluation-20261118";
export const MAX_CREDIT_USD = 1;
export const MAX_ATTEMPTS = 20;
export const CALL_INTERVAL_MS = 13_000;
const OUTPUT_TOKENS = 1_400;
const MAX_RESPONSE_BYTES = 65_536;
const PRICES = {
  "gpt-4o-mini": { input: 0.15, output: 0.60, snapshot: "gpt-4o-mini-2024-07-18" },
  "gpt-4.1-mini": { input: 0.40, output: 1.60, snapshot: "gpt-4.1-mini-2025-04-14" },
} as const;

const API_KEY_FINGERPRINT_DOMAIN = "toonstudio-openai-credit-evaluation-v1";
const API_KEY_FINGERPRINT_BYTES = 32;

export function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
/** 비밀 API 키 일치 확인에는 고속 SHA-256 대신 메모리 경화 KDF(scrypt) 지문을 사용한다. */
export function fingerprintApiKey(apiKey: string, organizationId: string, projectId: string): string {
  const salt = `${API_KEY_FINGERPRINT_DOMAIN}:${organizationId.trim()}:${projectId.trim()}`;
  return scryptSync(apiKey.trim(), salt, API_KEY_FINGERPRINT_BYTES, { N: 16_384, r: 8, p: 1 }).toString("hex");
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function costUsd(model: Model, promptTokens: number, completionTokens: number): number {
  // 캐시 할인을 적용하지 않은 보수적 추정이다. 실제 청구·크레딧 차감은 계정에서 따로 확인한다.
  return (promptTokens * PRICES[model].input + completionTokens * PRICES[model].output) / 1_000_000;
}
function modelFamily(value: unknown): Model | null {
  return CREDIT_EVALUATION_MODELS.find((model) => value === model || value === PRICES[model].snapshot) ?? null;
}

export interface CreditEvaluationPlanEntry {
  readonly fixture: CreditEvaluationFixture;
  readonly model: Model;
  readonly body: string;
  readonly requestHash: string;
  readonly comparisonHash: string;
  readonly reservedInputTokens: number;
  readonly reservedUsd: number;
}

/** 실제 서비스의 요청을 외부 통신 없는 대역에서 포착한다. 프롬프트와 JSON Schema를 복제하지 않는다. */
export async function buildCreditEvaluationPlan(): Promise<readonly CreditEvaluationPlanEntry[]> {
  const service = new StudioOpenAiCreativeAssistService();
  const plan: CreditEvaluationPlanEntry[] = [];
  for (const fixture of CREDIT_EVALUATION_FIXTURES) {
    for (const model of CREDIT_EVALUATION_MODELS) {
      let body: string | undefined;
      await service.assist(ACTOR, fixture.input, {
        env: { OPENAI_API_KEY: "offline-placeholder", OPENAI_MODEL: model },
        fetchImpl: async (url, init) => {
          if (url !== ENDPOINT || init?.method !== "POST" || typeof init.body !== "string") throw new Error("unexpected-request");
          body = init.body;
          // 실패 응답은 서비스의 속도 제한 예약을 해제한다. 실제 전송·재시도는 없다.
          return new Response("{}", { status: 503 });
        },
      }).catch(() => undefined);
      if (!body) throw new Error("실제 서비스 요청을 오프라인으로 수집하지 못했습니다. 관련 단위 테스트를 확인하세요.");
      const request: unknown = JSON.parse(body);
      if (!record(request) || request.model !== model || request.store !== false || request.max_completion_tokens !== OUTPUT_TOKENS
        || !record(request.response_format) || request.response_format.type !== "json_schema"
        || !record(request.response_format.json_schema) || request.response_format.json_schema.strict !== true) {
        throw new Error("서비스의 모델·저장·출력 제한 계약이 변경되었습니다. 검증 계획을 다시 검토하세요.");
      }
      // UTF-8 전체 직렬화 본문(시스템·사용자·스키마·옵션)과 프레이밍 여유를 모두 예약한다.
      const reservedInputTokens = Buffer.byteLength(body, "utf8") + 1_024;
      const { model: _model, ...comparison } = request;
      plan.push({ fixture, model, body, requestHash: sha256(body), comparisonHash: sha256(JSON.stringify(comparison)), reservedInputTokens,
        reservedUsd: Math.ceil(costUsd(model, reservedInputTokens, OUTPUT_TOKENS) * 1_000_000) / 1_000_000 });
    }
  }
  if (plan.length !== MAX_ATTEMPTS) throw new Error("승인된 10개 사례 × 2개 모델 계획이 변경되었습니다. 실행하지 마세요.");
  return plan;
}

const evidenceReference = z.string().trim().min(2).max(500);
export const CreditExecutionEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  planHash: z.string().regex(/^[a-f0-9]{64}$/u),
  verifiedAt: z.iso.datetime(),
  creditExpiresAt: z.iso.datetime().optional(),
  creditExpiresOn: z.iso.date().optional(),
  organizationId: z.string().regex(/^org-[A-Za-z0-9_-]{4,80}$/u),
  projectId: z.string().regex(/^proj_[A-Za-z0-9_-]{4,80}$/u),
  apiKeyFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  availablePromotionalCreditUsd: z.number().finite().min(MAX_CREDIT_USD),
  eligibleModels: z.array(z.enum(CREDIT_EVALUATION_MODELS)).length(2).refine((models) => new Set(models).size === 2),
  keyOrganizationConfirmed: z.literal(true),
  automaticRechargeDisabled: z.literal(true),
  additionalPaidSpendBlocked: z.literal(true),
  billingBlockMechanism: z.string().trim().min(20).max(500),
  sourceReferences: z.object({ balance: evidenceReference, expiration: evidenceReference, eligibility: evidenceReference, billingBlock: evidenceReference, keyOrganization: evidenceReference }).strict(),
  approvedMaxAttempts: z.literal(MAX_ATTEMPTS),
  approvedPromoSpendUsd: z.literal(MAX_CREDIT_USD),
  approvedPaidSpendUsd: z.literal(0),
}).strict().refine((evidence) => Boolean(evidence.creditExpiresAt) !== Boolean(evidence.creditExpiresOn), {
  message: "확인된 UTC 만료시각 또는 관측된 만료날짜 중 하나만 제공하세요.",
});

export interface CreditExpirationEvidence {
  precision: "utc-instant" | "date-only";
  observedValue: string;
  actualExpiresAt: string | null;
  executionCutoffAt: string;
  note: string;
}

interface CachedKeyFingerprint {
  readonly key: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly digest: Buffer;
}

function checkEvidence(
  raw: unknown,
  env: EnvLike,
  planHash: string,
  now: number,
  keyFingerprintCache?: { current: CachedKeyFingerprint | null },
): CreditExpirationEvidence {
  const parsed = CreditExecutionEvidenceSchema.safeParse(raw);
  if (!parsed.success) throw new Error("실행 증거가 없거나 불완전합니다. 조직·키 귀속·잔액·만료시각 또는 관측된 만료날짜·모델 적격·추가 유료 지출 차단의 실제 근거를 먼저 확인하세요.");
  const evidence = parsed.data;
  const key = env.OPENAI_API_KEY?.trim();
  const orgId = env.OPENAI_ORG_ID?.trim();
  const projId = env.OPENAI_PROJECT_ID?.trim();
  if (!key || orgId !== evidence.organizationId || projId !== evidence.projectId) {
    throw new Error("현재 프로세스의 키·조직·프로젝트가 확인한 증거와 일치하지 않습니다. 비밀값을 출력하지 말고 주입 경로를 확인하세요.");
  }
  const cached = keyFingerprintCache?.current;
  const actualDigest =
    cached && cached.key === key && cached.organizationId === evidence.organizationId && cached.projectId === evidence.projectId
      ? cached.digest
      : Buffer.from(fingerprintApiKey(key, evidence.organizationId, evidence.projectId), "hex");
  if (keyFingerprintCache && (!cached || cached.digest !== actualDigest)) {
    keyFingerprintCache.current = { key, organizationId: evidence.organizationId, projectId: evidence.projectId, digest: actualDigest };
  }
  const expectedDigest = Buffer.from(evidence.apiKeyFingerprint, "hex");
  if (expectedDigest.length !== actualDigest.length || !timingSafeEqual(expectedDigest, actualDigest)) {
    throw new Error("현재 프로세스의 키·조직·프로젝트가 확인한 증거와 일치하지 않습니다. 비밀값을 출력하지 말고 주입 경로를 확인하세요.");
  }
  const age = now - Date.parse(evidence.verifiedAt);
  // 날짜만 관측했다면 시간대·실제 만료시각을 추측하지 않고 전날 00:00Z부터 실행을 막는다.
  const cutoff = evidence.creditExpiresAt
    ? Date.parse(evidence.creditExpiresAt)
    : Date.parse(`${evidence.creditExpiresOn}T00:00:00.000Z`) - 86_400_000;
  if (evidence.planHash !== planHash || age < 0 || age > 3_600_000 || cutoff <= now + 60_000) {
    throw new Error("계획 해시가 다르거나 계정 확인이 1시간 이상 지났거나 실행 차단 시각이 임박했습니다. 잔액과 비용 차단 근거를 다시 확인하세요.");
  }
  return {
    precision: evidence.creditExpiresAt ? "utc-instant" : "date-only",
    observedValue: evidence.creditExpiresAt ?? evidence.creditExpiresOn ?? "",
    actualExpiresAt: evidence.creditExpiresAt ?? null,
    executionCutoffAt: new Date(cutoff).toISOString(),
    note: evidence.creditExpiresAt
      ? "증거에 확인된 UTC 만료시각을 실행 차단 시각으로 사용한다."
      : "시간대와 실제 만료 시각은 미확인이다. 실행 차단 시각은 관측한 날짜 전날 00:00Z로 정한 보수적 제한이며 실제 만료 시각이 아니다.",
  };
}

export interface CreditUsage { promptTokens: number; completionTokens: number; totalTokens: number; cachedInputTokens: number }
export function readCreditUsage(value: unknown): CreditUsage | null {
  if (!record(value)) return null;
  const { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens } = value;
  const count = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (!count(promptTokens) || promptTokens === 0 || !count(completionTokens) || !count(totalTokens) || totalTokens !== promptTokens + completionTokens) return null;
  const details = value.prompt_tokens_details;
  if (details !== undefined && details !== null && !record(details)) return null;
  const cachedInputTokens = record(details) ? details.cached_tokens ?? 0 : 0;
  if (!count(cachedInputTokens) || cachedInputTokens > promptTokens) return null;
  return { promptTokens, completionTokens, totalTokens, cachedInputTokens };
}

export interface CreditEvaluationResult {
  fixtureId: string;
  requestedModel: Model;
  requestHash: string;
  comparisonHash: string;
  reservedInputTokens: number;
  reservedUsd: number;
  attempted: boolean;
  durationMs: number;
  outcome: "dry-run" | "pending" | "passed-contracts" | "stopped";
  actualModel: string | null;
  finishReason: string | null;
  requestId: string | null;
  usage: CreditUsage | null;
  estimatedUsd: number | null;
  unconfirmedReservedUsd: number;
  errorCode: string | null;
  checks: readonly { name: string; passed: boolean }[];
  output?: OpenAiAssistStructuredResult;
}

export interface CreditEvaluationReport {
  schemaVersion: 1;
  mode: "dry-run" | "live";
  planHash: string;
  startedAt: string;
  finishedAt: string | null;
  priceAsOf: "2026-11-18";
  priceSources: readonly string[];
  maxAttempts: 20;
  maxCreditUsd: 1;
  maxAdditionalPaidUsd: 0;
  attempts: number;
  plannedMaximumUsd: number;
  estimatedUsd: number;
  unconfirmedReservedUsd: number;
  accountQueriedByRunner: false;
  evidenceStatus: "not-provided" | "provided-and-matched";
  creditExpiration: CreditExpirationEvidence | null;
  accountingNote: string;
  completedAllContracts: boolean;
  humanEvaluation: typeof HUMAN_EVALUATION_RUBRIC;
  humanCriteria: readonly { fixtureId: string; criteria: readonly string[] }[];
  results: CreditEvaluationResult[];
}

export interface CreditEvaluationOptions {
  readonly execute?: boolean;
  readonly env?: EnvLike;
  readonly evidence?: unknown;
  readonly signal?: AbortSignal;
  readonly transport?: typeof fetch;
  readonly checkpoint?: (report: CreditEvaluationReport) => Promise<void>;
  /** 테스트에서만 시간 경과를 대체한다. CLI는 항상 실제 13초 간격을 사용한다. */
  readonly pause?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

async function readBoundedBody(response: Response, signal?: AbortSignal | null): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  let onAbort: () => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error("response-aborted"));
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (signal?.aborted) throw new Error("response-aborted");
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("response-too-large");
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    void reader.cancel().catch(() => undefined);
    throw new Error("response-unreadable");
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

export async function runCreditEvaluation(options: CreditEvaluationOptions = {}): Promise<CreditEvaluationReport> {
  const plan = await buildCreditEvaluationPlan();
  const planHash = sha256(JSON.stringify(plan.map(({ fixture, model, requestHash, reservedUsd }) => ({ fixtureId: fixture.id, model, requestHash, reservedUsd }))));
  const report: CreditEvaluationReport = {
    schemaVersion: 1, mode: options.execute ? "live" : "dry-run", planHash, startedAt: new Date().toISOString(), finishedAt: null,
    priceAsOf: "2026-11-18", priceSources: ["https://developers.openai.com/api/docs/models/gpt-4o-mini", "https://developers.openai.com/api/docs/models/gpt-4.1-mini"],
    maxAttempts: MAX_ATTEMPTS, maxCreditUsd: MAX_CREDIT_USD, maxAdditionalPaidUsd: 0, attempts: 0,
    plannedMaximumUsd: plan.reduce((sum, entry) => sum + entry.reservedUsd, 0), estimatedUsd: 0, unconfirmedReservedUsd: 0,
    accountQueriedByRunner: false, evidenceStatus: "not-provided", creditExpiration: null,
    accountingNote: "전체 직렬화 입력 바이트와 프레이밍 여유·출력 1400토큰을 사전 예약한다. 실사용 토큰의 비용은 캐시 할인 없는 공개 단가 추정이며 실제 청구액·크레딧 차감·잔액이 아니다. 제공된 계정 근거의 진위나 추가 과금 차단을 이 실행기가 계정에 조회하지는 않는다. 불명확한 시도는 예약을 유지하고 중단한다.",
    completedAllContracts: false, humanEvaluation: HUMAN_EVALUATION_RUBRIC,
    humanCriteria: CREDIT_EVALUATION_FIXTURES.map(({ id, humanCriteria }) => ({ fixtureId: id, criteria: humanCriteria })), results: [],
  };
  const env = options.execute ? options.env ?? process.env : {};
  const keyFingerprintCache: { current: CachedKeyFingerprint | null } = { current: null };
  if (options.execute) {
    report.creditExpiration = checkEvidence(options.evidence, env, planHash, Date.now(), keyFingerprintCache);
    if (!options.checkpoint) throw new Error("실행에는 전송 전 비용 예약을 영속 기록하는 checkpoint가 필요합니다. CLI의 --execute 경로를 사용하세요.");
    if (report.plannedMaximumUsd > MAX_CREDIT_USD) throw new Error("전체 계획의 보수적 예약이 승인된 $1을 넘습니다. 호출 없이 계획을 다시 검토하세요.");
    report.evidenceStatus = "provided-and-matched";
  }
  // 모든 실제 호출은 같은 서비스와 actor를 사용한다. 속도 제한을 초기화하거나 우회하지 않는다.
  const service = new StudioOpenAiCreativeAssistService();
  const pause = options.pause ?? ((milliseconds, signal) => delay(milliseconds, undefined, { signal }));
  for (const entry of plan) {
    const result: CreditEvaluationResult = {
      fixtureId: entry.fixture.id, requestedModel: entry.model, requestHash: entry.requestHash, comparisonHash: entry.comparisonHash,
      reservedInputTokens: entry.reservedInputTokens, reservedUsd: entry.reservedUsd, attempted: false, durationMs: 0, outcome: "dry-run",
      actualModel: null, finishReason: null, requestId: null, usage: null, estimatedUsd: null, unconfirmedReservedUsd: 0, errorCode: null, checks: [],
    };
    report.results.push(result);
    if (!options.execute) continue;
    let boundaryError: string | null = null;
    let requestStartedAt: number | null = null;
    try {
      if (report.attempts > 0) await pause(CALL_INTERVAL_MS, options.signal);
      if (options.signal?.aborted) throw new Error("cancelled");
      checkEvidence(options.evidence, env, planHash, Date.now(), keyFingerprintCache);
      if (report.attempts >= MAX_ATTEMPTS || report.estimatedUsd + report.unconfirmedReservedUsd + entry.reservedUsd > MAX_CREDIT_USD) {
        boundaryError = "attempt-or-budget-cap";
        throw new Error(boundaryError);
      }
      const response = await service.assist(ACTOR, entry.fixture.input, {
        env: { OPENAI_API_KEY: env.OPENAI_API_KEY, OPENAI_ORG_ID: env.OPENAI_ORG_ID, OPENAI_PROJECT_ID: env.OPENAI_PROJECT_ID, OPENAI_MODEL: entry.model },
        signal: options.signal,
        fetchImpl: async (url, init) => {
          if (result.attempted || report.attempts >= MAX_ATTEMPTS) {
            boundaryError = "retry-or-attempt-cap";
            throw new Error(boundaryError);
          }
          const headers = new Headers(init?.headers);
          if (url !== ENDPOINT || init?.method !== "POST" || init.body !== entry.body
            || headers.get("OpenAI-Organization") !== env.OPENAI_ORG_ID?.trim() || headers.get("OpenAI-Project") !== env.OPENAI_PROJECT_ID?.trim()) {
            boundaryError = "request-contract-changed";
            throw new Error(boundaryError);
          }
          // 전송 직전부터 실패도 1회로 센다. checkpoint 실패·프로세스 중단에도 재실행 잠금을 풀지 않는다.
          report.attempts += 1;
          result.attempted = true;
          result.outcome = "pending";
          result.unconfirmedReservedUsd = entry.reservedUsd;
          report.unconfirmedReservedUsd += entry.reservedUsd;
          await options.checkpoint?.(report);
          requestStartedAt = performance.now();
          const raw = await (options.transport ?? fetch)(ENDPOINT, { ...init, redirect: "error" });
          const requestId = raw.headers.get("x-request-id");
          result.requestId = requestId && /^[A-Za-z0-9_-]{1,128}$/u.test(requestId) ? requestId : null;
          const text = await readBoundedBody(raw, init.signal);
          if (!raw.ok) { boundaryError = `upstream-http-${raw.status}`; throw new Error(boundaryError); }
          let payload: unknown;
          try { payload = JSON.parse(text); } catch { boundaryError = "invalid-json"; throw new Error(boundaryError); }
          const usage = record(payload) ? readCreditUsage(payload.usage) : null;
          const family = record(payload) ? modelFamily(payload.model) : null;
          result.usage = usage;
          result.actualModel = family && record(payload) && typeof payload.model === "string" ? payload.model : null;
          if (!usage || !family) { boundaryError = !usage ? "unconfirmed-usage" : "unconfirmed-model-price"; throw new Error(boundaryError); }
          const cost = costUsd(family, usage.promptTokens, usage.completionTokens);
          result.estimatedUsd = cost;
          result.unconfirmedReservedUsd = 0;
          report.unconfirmedReservedUsd = Math.max(0, report.unconfirmedReservedUsd - entry.reservedUsd);
          report.estimatedUsd += cost;
          if (family !== entry.model) boundaryError = "model-mismatch";
          else if (usage.promptTokens > entry.reservedInputTokens || usage.completionTokens > OUTPUT_TOKENS || cost > entry.reservedUsd || report.estimatedUsd > MAX_CREDIT_USD) boundaryError = "reservation-exceeded";
          const first = record(payload) && Array.isArray(payload.choices) ? payload.choices[0] : null;
          result.finishReason = record(first) && typeof first.finish_reason === "string" && ["stop", "length", "tool_calls", "function_call", "content_filter"].includes(first.finish_reason) ? first.finish_reason : null;
          if (!boundaryError && (!record(first) || first.finish_reason !== "stop")) boundaryError = "incomplete-response";
          if (boundaryError) throw new Error(boundaryError);
          return new Response(text, { status: raw.status });
        },
      });
      result.output = response.result;
      result.checks = evaluateCreditOutput(response.result);
      result.outcome = result.checks.every((check) => check.passed) ? "passed-contracts" : "stopped";
      if (result.outcome === "stopped") result.errorCode = "output-contract-failed";
    } catch {
      result.outcome = "stopped";
      result.errorCode = boundaryError ?? (options.signal?.aborted ? "cancelled" : result.attempted ? "provider-or-service-error" : "blocked-before-request");
    }
    if (requestStartedAt !== null) result.durationMs = Math.round(performance.now() - requestStartedAt);
    await options.checkpoint?.(report);
    if (result.outcome !== "passed-contracts") break;
  }
  report.finishedAt = new Date().toISOString();
  report.completedAllContracts = options.execute === true && report.attempts === MAX_ATTEMPTS && report.results.every((result) => result.outcome === "passed-contracts");
  if (options.execute) await options.checkpoint?.(report);
  return report;
}
