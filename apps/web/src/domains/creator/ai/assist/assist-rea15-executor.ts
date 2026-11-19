import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

import {
  assistModelInfo,
  assistModelSupportsEffort,
  EMPTY_ASSIST_TOKEN_USAGE,
  estimateAssistCostUsd,
} from "@/shared/ai/assist/assist-models";
import { resolveAssistRequestModel } from "@/shared/ai/assist/assist-protocol";
import { resolveAssistRoute, type AssistRoute } from "@/shared/ai/assist/assist-route";
import { cleanSingleLineText } from "@/shared/ai/assist/assist-text";
import { assistParse } from "@/shared/ai/assist/assist-transport";
import { toAssistTokenUsage } from "@/shared/ai/assist/assist-usage-meter";

import {
  resolveCreatorTaskModelRoute,
  type AssistCreatorTaskId,
} from "./assist-creator-model-router";
import { estimateStructuredCostCapUsd } from "./assist-feature-cost-cap";
import type {
  Rea15Envelope,
  Rea15ExecutionMeta,
} from "./assist-rea15-webtoon-ecosystem-schemas";
import type {
  RunWebtoonProductionAssistOptions,
  WebtoonProductionAssistInput,
} from "./assist-webtoon-production-schemas";

function resolveActiveAssistRoute(
  explicit?: Pick<AssistRoute, "apiKey" | "revision" | "model"> | null,
): Pick<AssistRoute, "apiKey" | "revision" | "model"> | null {
  if (explicit) return explicit;
  if (import.meta.env.MODE === "test") return null;
  return resolveAssistRoute();
}

function buildRea15PromptContext(
  input: WebtoonProductionAssistInput,
  directiveKo: string,
): string {
  const genre = cleanSingleLineText(input.genre ?? "판타지 액션", 40) || "판타지 액션";
  const conflict =
    cleanSingleLineText(input.coreConflict ?? "봉인된 고대 유물의 각성과 두 주인공의 숙명적 대립", 160) ||
    "봉인된 고대 유물의 각성과 두 주인공의 숙명적 대립";
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  const artistLabel = cleanSingleLineText(input.artistLabel ?? "K-웹툰 마스터 화풍", 60);
  const scriptSnippet = cleanSingleLineText(input.scriptText ?? "", 600);

  return [
    `장르: ${genre}`,
    `핵심 갈등: ${conflict}`,
    `주요 인물: ${protagonist}, ${partner} (관계성: ${input.relationshipDynamic ?? "fated-rivals"})`,
    `작가 화풍: ${artistLabel} (트리거: ${input.triggerWord ?? "ts_signature_webtoon"})`,
    ...(scriptSnippet ? [`현재 원고 대본: ${scriptSnippet}`] : []),
    "",
    directiveKo,
  ].join("\n");
}

function makeRea15Envelope<T>(
  report: T,
  source: "claude-live" | "local-fallback",
  meta: Rea15ExecutionMeta,
): Rea15Envelope<T> {
  return Object.freeze({
    source,
    report,
    modelUsed: meta.modelUsed,
    usage: meta.usage,
    estimatedCostUsd: meta.estimatedCostUsd,
    taskProfile: meta.taskProfile,
    routedModel: meta.routedModel,
    ...(meta.fallbackReason ? { fallbackReason: meta.fallbackReason } : {}),
    meta,
  });
}

export async function executeRea15Engine<TSchema extends z.ZodTypeAny>(params: {
  taskId: AssistCreatorTaskId;
  input: WebtoonProductionAssistInput;
  options: RunWebtoonProductionAssistOptions;
  systemPromptKo: string;
  userDirectiveKo: string;
  schema: TSchema;
  fallbackReport: z.infer<TSchema>;
}): Promise<Rea15Envelope<z.infer<TSchema>>> {
  const { taskId, input, options, systemPromptKo, userDirectiveKo, schema, fallbackReport } =
    params;
  const taskRoute = resolveCreatorTaskModelRoute(taskId, {
    model: options.model as never,
  });
  const activeRoute = resolveActiveAssistRoute(options.route);

  if (!activeRoute) {
    const meta: Rea15ExecutionMeta = {
      taskId,
      taskProfile: taskRoute.profile,
      routedModel: taskRoute.model,
      modelUsed: "local-deterministic",
      usage: EMPTY_ASSIST_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: "사용할 수 있는 AI 경로가 없어 결정적 로컬 폴백 엔진을 사용했습니다.",
    };
    return makeRea15Envelope(fallbackReport, "local-fallback", meta);
  }

  const requestedModel = resolveAssistRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || taskRoute.model,
  );

  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: taskRoute.maxTokens,
    system: [
      {
        type: "text",
        text: systemPromptKo,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildRea15PromptContext(input, userDirectiveKo),
      },
    ],
    ...(assistModelSupportsEffort(requestedModel)
      ? { output_config: { effort: taskRoute.effort } }
      : {}),
  };

  try {
    const { message, parsed } = await assistParse(activeRoute, request, schema, {
      signal: options.signal,
      capUsd: estimateStructuredCostCapUsd({
        model: requestedModel,
        request,
        schema,
      }),
      budgetOverride: options.budgetOverride,
    });
    const actualModel =
      assistModelInfo(message.model || requestedModel)?.id ?? (message.model || requestedModel);
    const usage = toAssistTokenUsage(message.usage);
    const estimatedCostUsd = estimateAssistCostUsd(actualModel, usage)?.usd ?? 0;
    const meta: Rea15ExecutionMeta = {
      taskId,
      taskProfile: taskRoute.profile,
      routedModel: taskRoute.model,
      modelUsed: actualModel,
      usage,
      estimatedCostUsd,
    };
    return makeRea15Envelope(parsed, "claude-live", meta);
  } catch (error) {
    if (options.fallbackOnError === false) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    const meta: Rea15ExecutionMeta = {
      taskId,
      taskProfile: taskRoute.profile,
      routedModel: taskRoute.model,
      modelUsed: "local-deterministic",
      usage: EMPTY_ASSIST_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: cleanSingleLineText(reason, 220),
    };
    return makeRea15Envelope(fallbackReport, "local-fallback", meta);
  }
}
