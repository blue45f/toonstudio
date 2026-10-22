/**
 * Claude 전송 파사드 — 정적으로 import해도 가벼운 얇은 층(SDK는 호출 시점에 지연 로드).
 *
 * 두 진입점이 있다.
 * 1. 기존 OpenAI 호환 호출자용 브리지: `userAiFetch`가 Claude 연결을 만나면 `claudeBridgedResponse`로
 *    위임해, 호출자가 OpenAI 형식으로 보내고 받는 그대로 Claude를 쓴다.
 * 2. Claude 네이티브 기능용: `claudeCreate`(자유 형식 Messages)와 `claudeParse`(Zod 구조화 출력).
 *
 * 모든 호출은 사용량 미터에 기록되고(오류로 끝나도 이미 과금된 호출이면 기록), 거절·잘림·빈 응답은
 * 조용히 넘기지 않고 사유가 드러나는 오류가 된다. 자동 재시도·모델 대체는 없다.
 *
 * 예산 한도는 화면(대화상자)이 아니라 **이 계층이 마지막으로 강제한다.** 한도가 있으면 보내기 전에 "받은 사용량 + 진행 중 예약 +
 * 응답을 받지 못한 요청의 최대 비용 + 이번 요청의 비용 상한"이 한도를 넘는지 보고, 넘을 수 있으면 보내지 않고 사유를 알린다.
 * 사용자가 대화상자에서 "이번 한 번만"을 직접 고른 요청(`budgetOverride`)만 이 판정을 건너뛴다. 기존 OpenAI 호환 호출자(채팅·멘토 등)는
 * 이 선택지를 받을 화면이 없어 한도 설정에서 올리거나 지워야 한다.
 */
import { getUserAiSnapshot } from "../user-ai-store";
import { UserAiTransportError } from "../user-ai-transport-error";

import {
  claudeMessageText,
  claudeMessageToOpenAiChat,
  ClaudeBridgeError,
  openAiChatToClaudeRequest,
  type ClaudeEffort,
} from "./claude-bridge";
import { evaluateClaudeBudget, getClaudeBudget } from "./claude-budget";
import { estimateClaudeRequestCostCapUsd } from "./claude-cost-cap";
import { assertClaudeMessageComplete } from "./claude-stop-reason";
import {
  beginClaudeRequest,
  claudeBudgetSpentUsd,
  formatClaudeUsd,
  getClaudeUsageSnapshot,
  recordClaudeUsage,
} from "./claude-usage-meter";

import type { ClaudeModelListing, ClaudeParseParams, ClaudeRuntimeOptions } from "./claude-runtime";
import type { ClaudeRoute } from "./claude-route";
import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

const loadClaudeRuntime = () => import("./claude-runtime");

export interface ClaudeCallOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly fetchImpl?: ClaudeRuntimeOptions["fetchImpl"];
  /**
   * 이 요청이 낼 수 있는 비용의 상한(USD, 단가를 모르면 null). 예산 판정과 진행 중 예약에 쓴다.
   * 주지 않으면 알 수 없는 것으로 보므로, 예산 한도가 있을 때는 `budgetOverride` 없이는 보내지 않는다.
   */
  readonly capUsd?: number | null;
  /** 사용자가 "이번 한 번만 한도를 넘어도 보내겠다"고 직접 고른 요청이면 true. 예산 판정을 건너뛴다. */
  readonly budgetOverride?: boolean;
}

/** 예산 한도를 넘을 수 있어 보내지 않았을 때의 오류. 자동 전환·재시도 대상이 아니므로 일반 `Error`다. */
export class ClaudeBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeBudgetError";
  }
}

/** 보내기 직전의 예산 판정. 한도가 없거나 이번 요청까지 쓰고도 한도 안이면 통과한다. */
export function assertClaudeBudgetAllows(capUsd: number | null): void {
  const { limitUsd } = getClaudeBudget();
  const verdict = evaluateClaudeBudget(limitUsd, claudeBudgetSpentUsd(getClaudeUsageSnapshot()), capUsd);
  if (verdict.kind === "exceeds") {
    throw new ClaudeBudgetError(
      `예산 한도(${formatClaudeUsd(limitUsd ?? 0)})를 넘을 수 있어 보내지 않았어요. 이번 요청은 최대 ${formatClaudeUsd(verdict.capUsd)}까지 나올 수 있고 남은 예산은 ${formatClaudeUsd(verdict.remainingUsd)}예요. Claude 설정에서 한도를 올리거나 지운 뒤 다시 시도해 주세요.`,
    );
  }
  if (verdict.kind === "unknown-cost") {
    throw new ClaudeBudgetError(
      "예산 한도가 있는데 이 모델의 단가를 몰라 비용을 가늠할 수 없어 보내지 않았어요. Claude 설정에서 한도를 지우거나 단가를 아는 모델을 고른 뒤 다시 시도해 주세요.",
    );
  }
}

/**
 * 한 번의 호출을 예산·미터에 맞춰 감싼다: 보내기 전에 예산을 판정하고, 비용 상한을 예약하고, 받은 사용량을 기록하고, 처리됐을 수 있는데
 * 응답을 받지 못한 호출(본문을 넘긴 뒤 중단·시간 초과·응답 처리 실패)은 "확인되지 않은 요청"으로 남긴다.
 * 서버가 오류 응답(4xx·5xx)을 돌려줬거나 연결 자체가 실패한 호출은 청구되지 않았다고 보고 예약만 거둔다.
 */
async function runAccounted<T>(
  options: ClaudeCallOptions,
  call: (runtimeOptions: ClaudeRuntimeOptions) => Promise<T>,
): Promise<T> {
  const capUsd = options.capUsd ?? null;
  if (!options.budgetOverride) assertClaudeBudgetAllows(capUsd);
  const ticket = beginClaudeRequest(capUsd);
  let possiblyBilled = false;
  let received = false;
  try {
    return await call({
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
      onPossiblyBilled: () => {
        possiblyBilled = true;
      },
      onMessage: (message) => {
        received = true;
        recordClaudeUsage(message.model, message.usage);
      },
    });
  } catch (error) {
    if (possiblyBilled && !received) ticket.markUnconfirmed();
    throw error;
  } finally {
    ticket.release();
  }
}

/** `userAiFetch`가 이미 검증한 연결 정보 중 Claude 호출에 필요한 최소 필드. */
export interface ClaudeBridgeConnection {
  readonly id: string;
  readonly apiKey: string;
  readonly textModel: string;
  readonly chatCompletionsPath: string;
}

/** OpenAI 형식으로 들어온 요청을 Claude로 보내고 OpenAI 형식 응답을 돌려준다. */
async function claudeChatCompletion(
  connection: ClaudeBridgeConnection,
  body: unknown,
  revision: number,
  options: ClaudeCallOptions & { readonly effort?: ClaudeEffort },
) {
  let request: ReturnType<typeof openAiChatToClaudeRequest>;
  try {
    request = openAiChatToClaudeRequest(body, { model: connection.textModel, effort: options.effort });
  } catch (error) {
    if (error instanceof ClaudeBridgeError) throw new Error(error.message, { cause: error });
    throw error;
  }
  const runtime = await loadClaudeRuntime();
  // 브리지 호출자는 비용 상한을 모른다. 보내는 요청 자체(글 바이트 수·이미지·사고 여유분이 더해진 `max_tokens`)에서 가늠한다.
  const capUsd = estimateClaudeRequestCostCapUsd(connection.textModel, request.params);
  const message = await runAccounted({ ...options, capUsd }, (runtimeOptions) => runtime.runClaudeMessage(
    { apiKey: connection.apiKey, revision },
    request.params,
    runtimeOptions,
  ));
  assertClaudeMessageComplete(message);
  if (claudeMessageText(message).trim().length === 0) {
    throw new UserAiTransportError("http-error", "Claude 응답이 비어 있어요. 다시 시도해 주세요.", 200);
  }
  return claudeMessageToOpenAiChat(message);
}

/**
 * `userAiFetch`가 Claude 연결에 대해 돌려주는 응답. 호출자는 OpenAI 채팅 응답 JSON을 그대로 읽는다.
 * Claude 연결은 텍스트 채팅 한 경로만 있으므로 그 밖의 경로·메서드는 보내지 않고 거절한다.
 */
export async function claudeBridgedResponse(
  capability: string,
  path: string,
  method: string,
  body: unknown,
  connection: ClaudeBridgeConnection,
  revision: number,
  options: ClaudeCallOptions,
): Promise<Response> {
  if (capability !== "text" || method.toUpperCase() !== "POST" || path !== connection.chatCompletionsPath) {
    throw new Error("Claude 연결은 텍스트 채팅 요청만 지원합니다. 이미지·음성 작업에는 다른 공급자를 사용하세요.");
  }
  const completion = await claudeChatCompletion(connection, body, revision, options);
  return new Response(JSON.stringify(completion), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Claude 네이티브 호출(비전·시스템 블록·캐시 등 자유 형식). */
export async function claudeCreate(
  route: Pick<ClaudeRoute, "apiKey" | "revision">,
  params: Anthropic.MessageCreateParamsNonStreaming,
  options: ClaudeCallOptions = {},
): Promise<Anthropic.Message> {
  const runtime = await loadClaudeRuntime();
  const message = await runAccounted(options, (runtimeOptions) => runtime.runClaudeMessage(route, params, runtimeOptions));
  assertClaudeMessageComplete(message);
  return message;
}

/** Claude 구조화 출력 호출. Zod 스키마를 만족하는 값만 돌려준다. */
export async function claudeParse<Schema extends z.ZodType>(
  route: Pick<ClaudeRoute, "apiKey" | "revision">,
  params: ClaudeParseParams,
  schema: Schema,
  options: ClaudeCallOptions = {},
): Promise<{ message: Anthropic.Message; parsed: z.infer<Schema> }> {
  const runtime = await loadClaudeRuntime();
  return runAccounted(options, (runtimeOptions) => runtime.runClaudeParse(route, params, schema, runtimeOptions));
}

export type ClaudeKeyProbeResult =
  | { readonly status: "ok"; readonly modelCount: number | null }
  | { readonly status: "unauthorized" }
  | { readonly status: "http_error"; readonly httpStatus: number }
  | { readonly status: "unreachable" };

/** 키가 실제로 유효한지 모델 목록(무료 호출)으로 확인한다. 키 값은 결과에 담지 않는다. */
export async function probeClaudeKey(
  apiKey: string,
  options: ClaudeCallOptions = {},
): Promise<ClaudeKeyProbeResult> {
  try {
    const runtime = await loadClaudeRuntime();
    const models = await runtime.listClaudeModels(
      { apiKey, revision: getUserAiSnapshot().revision },
      { signal: options.signal, timeoutMs: options.timeoutMs, fetchImpl: options.fetchImpl },
    );
    return { status: "ok", modelCount: models.length };
  } catch (error) {
    if (error instanceof UserAiTransportError) {
      if (error.code === "authentication") return { status: "unauthorized" };
      if (typeof error.status === "number") return { status: "http_error", httpStatus: error.status };
    }
    return { status: "unreachable" };
  }
}

/** 설정 카드의 모델 선택용 목록. 실패하면 오류를 그대로 올려 카드가 사유를 보여 준다. */
export async function listClaudeModelsForKey(
  apiKey: string,
  options: ClaudeCallOptions = {},
): Promise<ClaudeModelListing[]> {
  const runtime = await loadClaudeRuntime();
  return runtime.listClaudeModels(
    { apiKey, revision: getUserAiSnapshot().revision },
    { signal: options.signal, timeoutMs: options.timeoutMs, fetchImpl: options.fetchImpl },
  );
}
