import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";

import {
  DEFAULT_OPENAI_MODEL,
  redactCreatorSensitiveText,
  resolveStudioOpenAiCreativeConfig,
  StudioOpenAiRateLimiter,
  type EnvLike,
} from "./openai-assist/studio-openai-guardrails";
import {
  buildModeSystemInstruction,
  MODE_JSON_SCHEMAS,
  STUDIO_OPENAI_MODE_DESCRIPTORS,
} from "./openai-assist/studio-openai-prompt-catalog";
import {
  OpenAiDialoguePolishOutputSchema,
  OpenAiExportCoachOutputSchema,
  OpenAiIdeaRemixOutputSchema,
  OpenAiScriptToCutsOutputSchema,
  type OpenAiAssistStructuredResult,
  type StudioOpenAiAssistMode,
  type StudioOpenAiCreativeAssistRequest,
} from "./studio-openai-creative-assist.dto";

export {
  redactCreatorSensitiveText,
  resolveStudioOpenAiCreativeConfig,
  StudioOpenAiRateLimiter,
  type RedactedCreatorText,
  type StudioOpenAiCreativeConfig,
} from "./openai-assist/studio-openai-guardrails";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const MAX_OUTPUT_TOKENS = 1_400;
const MAX_ERROR_BODY_BYTES = 8_192;

@Injectable()
export class StudioOpenAiCreativeAssistService {
  private readonly rateLimiter = new StudioOpenAiRateLimiter();

  status(env: EnvLike = process.env) {
    const config = resolveStudioOpenAiCreativeConfig(env);
    return {
      configured: config.configured,
      provider: "openai" as const,
      model: config.configured ? config.model : DEFAULT_OPENAI_MODEL,
      keyLocation: "server-env-only" as const,
      storeData: false as const,
      piiMasking: true as const,
      autoBillingDisabled: true as const,
      modes: STUDIO_OPENAI_MODE_DESCRIPTORS,
      limits: {
        burstPerMinute: config.limits.burstPerMinute,
        hourlyRequests: config.limits.hourlyRequests,
        dailyRequests: config.limits.dailyRequests,
        maxInputChars: 6_000,
      },
      setupNoticeKo: config.configured
        ? "서버 로컬 환경변수(OPENAI_API_KEY)가 연결되어 있습니다. 원고는 OpenAI 학습·보관 로그에 남기지 않도록(store: false) 요청합니다."
        : "현재 서버 로컬 환경변수에 OPENAI_API_KEY가 설정되어 있지 않습니다. 서버의 .env.local에 OPENAI_API_KEY를 설정하면 바로 사용할 수 있으며, 설정 전에도 기획·편집·내보내기 기능은 모두 그대로 작동합니다.",
    };
  }

  async assist(
    actorIdentifier: string,
    input: StudioOpenAiCreativeAssistRequest,
    options: {
      readonly env?: EnvLike;
      readonly signal?: AbortSignal;
      readonly fetchImpl?: typeof fetch;
    } = {},
  ) {
    const config = resolveStudioOpenAiCreativeConfig(options.env ?? process.env);
    if (!config.configured) {
      throw new ServiceUnavailableException({
        code: "OPENAI_API_KEY_NOT_CONFIGURED",
        message:
          "서버에 OpenAI API 키(OPENAI_API_KEY)가 아직 설정되지 않았어요. 서버 측 .env.local에 키를 추가한 뒤 다시 실행해 주세요.",
      });
    }

    const quota = this.rateLimiter.consume(actorIdentifier, config.limits);
    const redactedInput = redactCreatorSensitiveText(input.inputText);
    const redactedTitle = input.projectTitle
      ? redactCreatorSensitiveText(input.projectTitle)
      : { sanitizedText: "", redactedCount: 0 };
    const redactedTone = input.genreOrTone
      ? redactCreatorSensitiveText(input.genreOrTone)
      : { sanitizedText: "", redactedCount: 0 };
    const piiRedactedCount =
      redactedInput.redactedCount + redactedTitle.redactedCount + redactedTone.redactedCount;

    const schemaSpec = MODE_JSON_SCHEMAS[input.mode];
    const contextLines = [
      redactedTitle.sanitizedText ? `작품 제목: ${redactedTitle.sanitizedText}` : null,
      redactedTone.sanitizedText ? `장르·분위기: ${redactedTone.sanitizedText}` : null,
      input.targetPlatform ? `목표 형식: ${input.targetPlatform}` : null,
    ].filter((line): line is string => Boolean(line));

    const userPrompt =
      contextLines.length > 0
        ? `${contextLines.join("\n")}\n\n[창작자 입력]\n${redactedInput.sanitizedText}`
        : `[창작자 입력]\n${redactedInput.sanitizedText}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    };
    if (config.organizationId) headers["OpenAI-Organization"] = config.organizationId;
    if (config.projectId) headers["OpenAI-Project"] = config.projectId;

    const controller = new AbortController();
    let timedOut = false;
    const onClientAbort = () => {
      if (!controller.signal.aborted) controller.abort();
    };
    options.signal?.addEventListener("abort", onClientAbort, { once: true });
    if (options.signal?.aborted) onClientAbort();
    const timer = setTimeout(() => {
      timedOut = true;
      if (!controller.signal.aborted) controller.abort();
    }, config.timeoutMs);

    const fetchFn = options.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchFn(OPENAI_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: config.model,
          store: false,
          temperature: 0.65,
          max_completion_tokens: MAX_OUTPUT_TOKENS,
          messages: [
            { role: "system", content: buildModeSystemInstruction(input.mode) },
            { role: "user", content: userPrompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: schemaSpec.name,
              strict: true,
              schema: schemaSpec.schema,
            },
          },
        }),
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onClientAbort);
      if (timedOut) {
        throw new GatewayTimeoutException({
          code: "OPENAI_TIMEOUT",
          message: "OpenAI 응답이 지연되어 요청을 중단했어요. 입력 길이를 조금 줄여 다시 시도해 주세요.",
        });
      }
      if (options.signal?.aborted) {
        throw new HttpException(
          { code: "CLIENT_ABORTED", message: "요청이 취소되었어요." },
          499,
        );
      }
      throw new BadGatewayException({
        code: "OPENAI_NETWORK_ERROR",
        message: "OpenAI 서버와 연결하지 못했어요. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
      });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onClientAbort);
    }

    if (!response.ok) {
      const errorCode = await this.readSafeOpenAiErrorCode(response);
      throw this.mapUpstreamHttpError(response.status, errorCode);
    }

    let payload: Record<string, unknown>;
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new BadGatewayException({
        code: "OPENAI_INVALID_JSON",
        message: "OpenAI 응답 형식을 읽지 못했어요. 잠시 후 다시 시도해 주세요.",
      });
    }

    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const firstChoice = (choices[0] ?? {}) as {
      finish_reason?: unknown;
      message?: { content?: unknown; refusal?: unknown };
    };

    if (typeof firstChoice.message?.refusal === "string" && firstChoice.message.refusal.trim()) {
      throw new UnprocessableEntityException({
        code: "OPENAI_SAFETY_REFUSAL",
        message: "안전 정책에 따라 이 내용은 변환할 수 없어요. 표현을 조금 바꾸어 다시 시도해 주세요.",
      });
    }
    if (firstChoice.finish_reason === "length") {
      throw new BadGatewayException({
        code: "OPENAI_OUTPUT_TRUNCATED",
        message: "답변이 길어 중간에 잘렸어요. 한 장면이나 짧은 문단 단위로 나누어 요청해 주세요.",
      });
    }

    const rawContent = firstChoice.message?.content;
    if (typeof rawContent !== "string" || !rawContent.trim()) {
      throw new BadGatewayException({
        code: "OPENAI_EMPTY_RESPONSE",
        message: "OpenAI에서 빈 답변이 돌아왔어요. 잠시 후 다시 시도해 주세요.",
      });
    }

    const structured = this.parseModeOutput(input.mode, rawContent);
    const usageRecord =
      payload.usage && typeof payload.usage === "object"
        ? (payload.usage as Record<string, unknown>)
        : {};

    return {
      provider: "openai" as const,
      model:
        typeof payload.model === "string" && payload.model.trim()
          ? payload.model.trim().slice(0, 120)
          : config.model,
      result: structured,
      privacy: {
        storeData: false as const,
        piiRedactedCount,
      },
      quota: {
        remainingDaily: quota.remainingDaily,
        dailyLimit: config.limits.dailyRequests,
      },
      usage: {
        promptTokens:
          typeof usageRecord.prompt_tokens === "number" ? usageRecord.prompt_tokens : 0,
        completionTokens:
          typeof usageRecord.completion_tokens === "number" ? usageRecord.completion_tokens : 0,
        totalTokens:
          typeof usageRecord.total_tokens === "number" ? usageRecord.total_tokens : 0,
      },
    };
  }

  private parseModeOutput(
    mode: StudioOpenAiAssistMode,
    rawContent: string,
  ): OpenAiAssistStructuredResult {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawContent);
    } catch {
      throw new BadGatewayException({
        code: "OPENAI_MALFORMED_STRUCTURED_JSON",
        message: "AI 제안 데이터를 읽는 중 형식 오류가 발생했어요. 다시 한 번 실행해 주세요.",
      });
    }

    if (mode === "idea-remix") {
      const checked = OpenAiIdeaRemixOutputSchema.safeParse(parsedJson);
      if (!checked.success) {
        throw new BadGatewayException({
          code: "OPENAI_SCHEMA_MISMATCH",
          message: "발상 리믹스 결과 형식이 맞지 않아 적용하지 않았어요. 다시 시도해 주세요.",
        });
      }
      return { mode, data: checked.data };
    }
    if (mode === "script-to-cuts") {
      const checked = OpenAiScriptToCutsOutputSchema.safeParse(parsedJson);
      if (!checked.success) {
        throw new BadGatewayException({
          code: "OPENAI_SCHEMA_MISMATCH",
          message: "컷 분할 결과 형식이 맞지 않아 적용하지 않았어요. 다시 시도해 주세요.",
        });
      }
      return { mode, data: checked.data };
    }
    if (mode === "dialogue-polish") {
      const checked = OpenAiDialoguePolishOutputSchema.safeParse(parsedJson);
      if (!checked.success) {
        throw new BadGatewayException({
          code: "OPENAI_SCHEMA_MISMATCH",
          message: "대사 다듬기 결과 형식이 맞지 않아 적용하지 않았어요. 다시 시도해 주세요.",
        });
      }
      return { mode, data: checked.data };
    }

    const checked = OpenAiExportCoachOutputSchema.safeParse(parsedJson);
    if (!checked.success) {
      throw new BadGatewayException({
        code: "OPENAI_SCHEMA_MISMATCH",
        message: "마감 점검 결과 형식이 맞지 않아 적용하지 않았어요. 다시 시도해 주세요.",
      });
    }
    return { mode, data: checked.data };
  }

  private async readSafeOpenAiErrorCode(response: Response): Promise<string | null> {
    try {
      const text = await response.text();
      if (!text || text.length > MAX_ERROR_BODY_BYTES) return null;
      const parsed = JSON.parse(text) as { error?: { code?: unknown; type?: unknown } };
      const raw = parsed?.error?.code ?? parsed?.error?.type;
      return typeof raw === "string" && /^[A-Za-z0-9_.-]{1,64}$/u.test(raw) ? raw : null;
    } catch {
      return null;
    }
  }

  private mapUpstreamHttpError(status: number, errorCode: string | null): HttpException {
    if (status === 401 || status === 403) {
      return new ServiceUnavailableException({
        code: "OPENAI_AUTH_FAILED",
        message:
          "서버에 설정된 OpenAI API 키가 유효하지 않거나 모델 접근 권한이 없어요. 서버 환경변수(OPENAI_API_KEY)를 확인해 주세요.",
      });
    }
    if (status === 429) {
      if (errorCode === "insufficient_quota" || errorCode === "billing_hard_limit_reached") {
        return new HttpException(
          {
            code: "OPENAI_QUOTA_EXHAUSTED",
            message:
              "연결된 OpenAI 조직의 사용 가능 크레딧 또는 월 한도가 소진되었어요. 사용자 동의 없이 유료 충전을 진행하지 않았습니다.",
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return new HttpException(
        {
          code: "OPENAI_UPSTREAM_RATE_LIMITED",
          message: "OpenAI 호출 속도 제한에 걸렸어요. 잠시 기다린 뒤 다시 시도해 주세요.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (status === 400 || status === 413) {
      return new BadGatewayException({
        code: "OPENAI_REQUEST_REJECTED",
        message: "입력 내용이 너무 길거나 지원하지 않는 형식이라 처리하지 못했어요. 내용을 줄여 다시 시도해 주세요.",
      });
    }
    return new ServiceUnavailableException({
      code: "OPENAI_UPSTREAM_UNAVAILABLE",
      message: "OpenAI 서버가 일시적으로 응답하지 않아요. 잠시 후 다시 시도해 주세요.",
    });
  }
}
