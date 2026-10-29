import { userAiWireProtocol } from "./assist/assist-protocol";
import { assertFreeAiConnection } from "./free-ai-policy";
import { readBoundedResponseBytes } from "./user-ai-bounded-read";
import {
  FreeAiRuntimeBudgetError,
  guardFreeAiRuntimeRequest,
  MANAGED_FREE_MAX_RESPONSE_BYTES,
  recordFreeAiRuntimeResponse,
} from "./free-ai-runtime-budget";
import {
  getUserAiSnapshot,
  registerUserAiRequest,
  requireUserAiConnection,
  userAiAutomaticExternalConnectionsForCapability,
} from "./user-ai-store";
import {
  UserAiEmptyTruncatedError,
  UserAiTransportError,
  type UserAiTransportErrorCode,
} from "./user-ai-transport-error";
import {
  validateUserAiBaseUrl,
  validateUserAiPath,
  type UserAiCapability,
  type UserAiResolvedConnection,
} from "./user-ai-types";

export interface UserAiRequestOptions {
  signal?: AbortSignal;
  connectionId?: string;
  revision?: number;
  method?: string;
  maxBytes?: number;
  headers?: HeadersInit;
  /** Internal explicit candidate used by the automatic free connection chain. */
  connection?: UserAiResolvedConnection;
}

export { UserAiEmptyTruncatedError, UserAiTransportError, type UserAiTransportErrorCode };

/** 잘못됐거나 폐기된 키에 400으로 답하는 공급자(Gemini의 API_KEY_INVALID, xAI의 Incorrect API key)를 알아본다. */
const INVALID_API_KEY_PATTERN = /API_KEY_INVALID|API key not valid|API key expired|incorrect api key|invalid api key/iu;

function invalidApiKeyResponse(bytes: Uint8Array | null): boolean {
  if (!bytes || bytes.byteLength === 0) return false;
  return INVALID_API_KEY_PATTERN.test(new TextDecoder().decode(bytes.subarray(0, 16_384)));
}

export function isUserAiQuotaExhaustion(error: unknown): boolean {
  return error instanceof FreeAiRuntimeBudgetError
    || (error instanceof UserAiTransportError
      && (error.code === "quota-exhausted" || error.code === "all-free-exhausted"));
}

const MAX_JSON_BYTES = 80 * 1024 * 1024;

/** Direct zero-cost user-to-provider transport: no cookies, redirects, retries or operator fallback. */
export async function userAiFetch(
  capability: UserAiCapability,
  path: string,
  body?: unknown,
  options: UserAiRequestOptions = {},
): Promise<Response> {
  const connection = options.connection ?? requireUserAiConnection(capability);
  assertFreeAiConnection(connection, capability);
  const currentRevision = getUserAiSnapshot().revision;
  if (
    (options.connectionId && connection.id !== options.connectionId)
    || (options.revision !== undefined && options.revision !== currentRevision)
  ) {
    throw new Error("AI 연결이 변경되어 이전 작업을 전송하지 않았습니다.");
  }
  if (options.signal?.aborted) {
    throw new Error("AI 요청이 전송되기 전에 취소되었습니다.");
  }

  const revision = currentRevision;
  const validatedPath = validateUserAiPath(path);
  const method = options.method ?? (body === undefined ? "GET" : "POST");
  // Claude 연결은 Messages API로 번역해 보내고 OpenAI 형식 응답으로 돌려준다(호출자 변경 없음).
  // 번역·SDK 계층은 Claude 연결을 실제로 쓰는 순간에만 내려받는다(앱 첫 로드·스튜디오 진입 번들에 싣지 않는다).
  if (userAiWireProtocol(connection) === "anthropic-messages") {
    const { assistBridgedResponse } = await import("./assist/assist-transport");
    return assistBridgedResponse(
      capability,
      validatedPath,
      method,
      body,
      connection,
      revision,
      { signal: options.signal },
    );
  }
  const guardedRequest = await guardFreeAiRuntimeRequest(
    connection,
    capability,
    validatedPath,
    method,
    body,
  );
  if (revision !== getUserAiSnapshot().revision) {
    throw new Error("AI 연결이 변경되어 이전 작업을 전송하지 않았습니다.");
  }

  const url = `${validateUserAiBaseUrl(connection.baseUrl)}${validatedPath}`;
  const controller = new AbortController();
  const unregister = registerUserAiRequest(controller);
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(180_000),
    ...(options.signal ? [options.signal] : []),
  ]);
  const headers = new Headers(options.headers);
  headers.delete("Cookie");
  headers.delete("X-User-Id");
  if (connection.apiKey) {
    headers.set("Authorization", `Bearer ${connection.apiKey}`);
  } else {
    headers.delete("Authorization");
  }
  const requestBody = guardedRequest.body;
  const form = typeof FormData !== "undefined" && requestBody instanceof FormData;
  if (requestBody !== undefined && !form) headers.set("Content-Type", "application/json");
  if (form) headers.delete("Content-Type");
  try {
    signal.throwIfAborted();
    const response = await fetch(url, {
      method,
      headers,
      body: requestBody === undefined
        ? undefined
        : form
          ? requestBody
          : JSON.stringify(requestBody),
      signal,
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
    await recordFreeAiRuntimeResponse(
      connection,
      response.status,
      response.headers,
    );
    const requestedMaximum = Math.min(
      options.maxBytes ?? MAX_JSON_BYTES,
      MAX_JSON_BYTES,
    );
    const responseMaximum = guardedRequest.guarded
      ? Math.min(requestedMaximum, MANAGED_FREE_MAX_RESPONSE_BYTES)
      : requestedMaximum;
    const bytes = response.status === 204
      ? null
      : await readBoundedResponseBytes(response, responseMaximum);
    signal.throwIfAborted();
    if (!response.ok) {
      if (response.status === 402 || response.status === 429) {
        throw new UserAiTransportError(
          "quota-exhausted",
          `이 무료 AI 연결의 사용량이 소진되었습니다 (HTTP ${response.status}).`,
          response.status,
        );
      }
      // Gemini·xAI는 잘못됐거나 폐기된 키에 401이 아니라 400으로 답한다. 키 오류로 보고 다음 키·경로로 넘긴다.
      const invalidKey = response.status === 400 && invalidApiKeyResponse(bytes);
      // 401과 같은 인증 대기를 건다. 걸지 않으면 폐기된 키를 요청마다 다시 불러 하루 안전 한도만 깎는다.
      if (invalidKey) await recordFreeAiRuntimeResponse(connection, 401, response.headers);
      if (response.status === 401 || response.status === 403 || invalidKey) {
        throw new UserAiTransportError(
          "authentication",
          `개인 무료 API 키 인증에 실패했습니다 (HTTP ${response.status}).`,
          response.status,
        );
      }
      throw new UserAiTransportError(
        "http-error",
        `무료 AI 요청 실패 (HTTP ${response.status}). 자동 재시도하거나 유료 모델로 전환하지 않았습니다.`,
        response.status,
      );
    }
    if (revision !== getUserAiSnapshot().revision) {
      throw new Error("AI 연결이 변경되어 결과를 적용하지 않았습니다.");
    }
    return new Response(bytes, { status: response.status, headers: response.headers });
  } catch (error) {
    if (signal.aborted) {
      throw new Error("AI 요청이 취소되거나 제한 시간을 초과했습니다. 앱은 같은 요청을 자동 재전송하지 않습니다.", { cause: error });
    }
    if (error instanceof UserAiTransportError || error instanceof FreeAiRuntimeBudgetError) {
      throw error;
    }
    if (error instanceof TypeError) {
      throw new Error("클라우드 제공자 연결·CORS·네트워크 상태를 확인하세요. 다른 경로로 중복 전송하지 않았습니다.", { cause: error });
    }
    throw error;
  } finally {
    unregister();
  }
}

export async function userAiJson<T = unknown>(
  capability: UserAiCapability,
  path: string,
  body?: unknown,
  options: UserAiRequestOptions = {},
): Promise<T> {
  const response = await userAiFetch(capability, path, body, options);
  try {
    return await response.json() as T;
  } catch {
    throw new Error("AI 제공자의 응답이 올바른 JSON 형식이 아닙니다.");
  }
}

export interface CompletedUserAiText {
  content: string;
  connection: UserAiResolvedConnection;
  attemptedConnectionIds: string[];
  attemptedRouteIds: string[];
  /** 출력 상한에 걸려 답이 잘렸다(`finish_reason: "length"`). 무료 키 안전 상한(출력 1,024토큰)에서 흔하다. */
  truncated: boolean;
}

export interface UserAiTextOptions {
  /** 이번에 시도할 연결. 없으면 자동 경로의 모든 연결(유료 키는 허용했을 때만)을 쓴다. */
  readonly connections?: readonly UserAiResolvedConnection[];
}

export async function completeUserAiTextDetailed(
  system: string,
  user: string,
  signal?: AbortSignal,
  options: UserAiTextOptions = {},
): Promise<CompletedUserAiText> {
  if (!user.trim() || user.length + system.length > 64_000) {
    throw new Error("프롬프트는 비어 있지 않은 64,000자 이하여야 합니다.");
  }
  const candidates = options.connections ?? userAiAutomaticExternalConnectionsForCapability("text");
  if (candidates.length === 0) {
    throw new UserAiTransportError(
      "not-configured",
      "통합 AI 설정에 사용할 수 있는 클라우드 AI 경로가 없습니다. 무료 공급자 키를 추가하거나 명시적으로 BYOK를 구성하세요.",
    );
  }

  const attemptedConnectionIds: string[] = [];
  const attemptedRouteIds: string[] = [];
  let lastSafeFailoverError: unknown;
  let sawQuotaExhaustion = false;
  // 출력 상한에 걸린 빈 답. 다음 키를 마저 써 보고, 모두 안 되면 이 이유로 알린다(호출 쪽은 ToonStudio AI로 넘긴다).
  let emptyTruncated: UserAiEmptyTruncatedError | null = null;
  // 유료 키가 빈 답을 냈다면 이미 비용이 청구됐다. 같은 요청을 다른 유료 키로 다시 보내지 않는다(무료 키는 계속 쓴다).
  let paidAnswerBilled = false;
  for (const connection of candidates) {
    if (paidAnswerBilled && connection.costPolicy === "user-funded-byok") continue;
    attemptedConnectionIds.push(connection.id);
    attemptedRouteIds.push(connection.routeId);
    try {
      const result = await userAiJson<{
        choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>;
      }>(
        "text",
        connection.chatCompletionsPath,
        {
          model: connection.textModel,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_tokens: 4096,
        },
        {
          signal,
          maxBytes: 2 * 1024 * 1024,
          connection,
          connectionId: connection.id,
        },
      );
      const content = result.choices?.[0]?.message?.content;
      if (result.choices?.[0]?.finish_reason === "length" && (typeof content !== "string" || !content.trim())) {
        throw new UserAiEmptyTruncatedError();
      }
      if (typeof content !== "string" || !content.trim() || content.length > 100_000) {
        throw new Error("AI 텍스트 결과를 확인하지 못했습니다.");
      }
      return {
        content: connection.apiKey
          ? content.replaceAll(connection.apiKey, "[비밀정보 제거]")
          : content,
        connection,
        attemptedConnectionIds,
        attemptedRouteIds,
        truncated: result.choices?.[0]?.finish_reason === "length",
      };
    } catch (error) {
      if (error instanceof UserAiEmptyTruncatedError) {
        emptyTruncated = error;
        paidAnswerBilled ||= connection.costPolicy === "user-funded-byok";
        continue;
      }
      // 빈 잘린 답 뒤에 다음 키가 처리 전에 확정적으로 거절했다(예: Groq 413, 분당 토큰 초과): 그 키만 건너뛰고, 모두 안
      // 되면 아래에서 빈 답을 이유로 알려 호출 쪽이 ToonStudio AI로 넘기게 한다. 5xx·408 등 시간 초과·네트워크 오류는
      // 제공자가 이미 받았을 수 있으므로 재전송 금지 규칙대로 바로 멈춘다(인증·한도 4xx는 아래 기존 분기가 다룬다).
      if (emptyTruncated && rejectedBeforeInference(error)) continue;
      const quotaExhaustion = isUserAiQuotaExhaustion(error);
      const safeAuthenticationFailover = error instanceof UserAiTransportError
        && error.code === "authentication";
      if (!quotaExhaustion && !safeAuthenticationFailover) throw error;
      sawQuotaExhaustion ||= quotaExhaustion;
      lastSafeFailoverError = error;
    }
  }

  if (emptyTruncated) throw emptyTruncated;
  if (!sawQuotaExhaustion && lastSafeFailoverError instanceof UserAiTransportError) {
    throw lastSafeFailoverError;
  }
  throw new UserAiTransportError(
    "all-free-exhausted",
    "등록된 클라우드 AI 경로가 모두 무료 한도·요청 제한·인증 오류 상태입니다. 로컬 실행으로 전환하지 않습니다.",
    lastSafeFailoverError instanceof UserAiTransportError ? lastSafeFailoverError.status : undefined,
  );
}

export async function completeUserAiText(
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<string> {
  return (await completeUserAiTextDetailed(system, user, signal)).content;
}

function isSafeUserAiRouteFailover(error: unknown): boolean {
  return isUserAiQuotaExhaustion(error)
    || (error instanceof UserAiTransportError && error.code === "authentication");
}

/**
 * 제공자가 요청을 처리하기 전에 확정적으로 거절한 상태(요청 형식·모델 없음·크기 초과 등). 인증·한도 4xx는 따로 분류된다.
 * 408(시간 초과)·409·499는 넣지 않는다: 예를 들어 OpenRouter의 408은 상류 모델이 생성 중에 시간을 넘긴 경우라 이미
 * 처리·청구됐을 수 있으므로, 시간 초과와 같은 재전송 금지 규칙을 따른다.
 */
const PRE_INFERENCE_REJECTION_STATUSES: ReadonlySet<number> = new Set([400, 404, 405, 410, 413, 415, 422]);

function rejectedBeforeInference(error: unknown): boolean {
  return error instanceof UserAiTransportError
    && error.code === "http-error"
    && error.status !== undefined
    && PRE_INFERENCE_REJECTION_STATUSES.has(error.status);
}

function cloneFormData(source: FormData): FormData {
  const clone = new FormData();
  source.forEach((value, key) => clone.append(key, value));
  return clone;
}

export async function userAiLegacyJson(
  capability: "text" | "image",
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const candidates = userAiAutomaticExternalConnectionsForCapability(capability);
  if (!candidates.length) {
    throw new UserAiTransportError(
      "not-configured",
      `통합 AI 설정에 사용할 ${capability === "text" ? "텍스트" : "이미지"} 클라우드 경로가 없습니다.`,
    );
  }
  let lastSafeFailure: unknown;
  let sawQuotaExhaustion = false;
  for (const connection of candidates) {
    const model = capability === "text" ? connection.textModel : connection.imageModel;
    if (!model) continue;
    const values: Record<string, unknown> = body && typeof body === "object"
      ? { ...body, model } as Record<string, unknown>
      : { model };
    if (capability === "image" && model.startsWith("gpt-image")) {
      delete values.response_format;
    }
    try {
      return await userAiJson(
        capability,
        capability === "text"
          ? connection.chatCompletionsPath
          : connection.imageGenerationPath,
        values,
        { signal, connection, connectionId: connection.id },
      );
    } catch (error) {
      if (!isSafeUserAiRouteFailover(error)) throw error;
      sawQuotaExhaustion ||= isUserAiQuotaExhaustion(error);
      lastSafeFailure = error;
    }
  }
  if (!sawQuotaExhaustion && lastSafeFailure instanceof UserAiTransportError) {
    throw lastSafeFailure;
  }
  throw new UserAiTransportError(
    "all-free-exhausted",
    "등록된 클라우드 AI 경로가 모두 한도 소진 또는 인증 오류 상태입니다.",
    lastSafeFailure instanceof UserAiTransportError ? lastSafeFailure.status : undefined,
  );
}

export async function userAiLegacyForm(
  form: FormData,
  signal?: AbortSignal,
): Promise<unknown> {
  const candidates = userAiAutomaticExternalConnectionsForCapability("image");
  if (!candidates.length) {
    throw new UserAiTransportError(
      "not-configured",
      "통합 AI 설정에 사용할 이미지 클라우드 경로가 없습니다.",
    );
  }
  let lastSafeFailure: unknown;
  let sawQuotaExhaustion = false;
  for (const connection of candidates) {
    if (!connection.imageModel) continue;
    const requestForm = cloneFormData(form);
    requestForm.set("model", connection.imageModel);
    if (connection.imageModel.startsWith("gpt-image")) {
      requestForm.delete("response_format");
    }
    try {
      return await userAiJson(
        "image",
        connection.imageEditPath,
        requestForm,
        { signal, connection, connectionId: connection.id },
      );
    } catch (error) {
      if (!isSafeUserAiRouteFailover(error)) throw error;
      sawQuotaExhaustion ||= isUserAiQuotaExhaustion(error);
      lastSafeFailure = error;
    }
  }
  if (!sawQuotaExhaustion && lastSafeFailure instanceof UserAiTransportError) {
    throw lastSafeFailure;
  }
  throw new UserAiTransportError(
    "all-free-exhausted",
    "등록된 이미지 클라우드 경로가 모두 한도 소진 또는 인증 오류 상태입니다.",
    lastSafeFailure instanceof UserAiTransportError ? lastSafeFailure.status : undefined,
  );
}
