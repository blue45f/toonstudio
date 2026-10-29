/**
 * claude-webtoon-production-assist.ts
 *
 * 국내외 8대 웹툰 AI 제작 소프트웨어 벤치마크 기반 신규 AI 보조 엔진 4종:
 * 1. 모바일 스크롤 시선 유도(Eye-Path S-Curve) · 엄지 데드존 닥터 (클립스튜디오 EX & 네이버웹툰 Cut Doctor 벤치마크)
 * 2. 에피소드 컬러 스크립트(Color Script) & 4레이어 조명 디렉터 (다쉬툰 스튜디오 & 리얼드로우 벤치마크)
 * 3. 설정 연속성(Continuity) · 180도 카메라 축 · 복선(Foreshadow) 회수 감수기 (오노마AI 페뷸레이터 & 라마젠 벤치마크)
 * 4. 다각도 표정·포즈 일관성 매트릭스 & 효과음(SFX)·말풍선 오케스트레이터 (라이언로켓 젠버스 & 투닝 플러스 벤치마크)
 *
 * 모든 기능은 보조 기능 경로(등록한 키, 없으면 ToonStudio AI 관리형 경로)를 통한 실시간 구조화 출력(`assistParse`)과
 * 네트워크 오프라인/미연결 시 즉시 동작하는 로컬 결정적(Deterministic) 폴백 엔진을 함께 제공한다.
 */
import {
  ASSIST_DEFAULT_MODEL_ID,
  assistModelInfo,
  assistModelSupportsEffort,
  estimateAssistCostUsd,
} from "@/shared/ai/assist/assist-models";
import { resolveAssistRequestModel } from "@/shared/ai/assist/assist-protocol";
import { resolveAssistRoute, type AssistRoute } from "@/shared/ai/assist/assist-route";
import { cleanSingleLineText } from "@/shared/ai/assist/assist-text";
import { assistParse } from "@/shared/ai/assist/assist-transport";
import { toAssistTokenUsage } from "@/shared/ai/assist/assist-usage-meter";

import { resolveCreatorTaskModelRoute } from "./assist-creator-model-router";
import { estimateStructuredCostCapUsd } from "./assist-feature-cost-cap";
import {
  buildDeterministicActingSfxReport,
  buildDeterministicColorScriptReport,
  buildDeterministicContinuityForeshadowReport,
  buildDeterministicMultiCharacterWardrobeReport,
  buildDeterministicScrollEyePathReport,
  buildDeterministicWeatherTimeProgressionReport,
  clampInt,
  AssistActingSfxChoreographySchema,
  AssistColorScriptSchema,
  AssistContinuityForeshadowSchema,
  AssistMultiCharacterWardrobeSchema,
  AssistScrollEyePathSchema,
  AssistWeatherTimeProgressionSchema,
  type AssistActingSfxChoreographyView,
  type AssistColorScriptView,
  type AssistContinuityForeshadowView,
  type AssistMultiCharacterWardrobeView,
  type AssistScrollEyePathView,
  type AssistWeatherTimeProgressionView,
  type RunWebtoonProductionAssistOptions,
  type WebtoonProductionAssistInput,
} from "./assist-webtoon-production-schemas";

import type Anthropic from "@anthropic-ai/sdk";

export * from "./assist-webtoon-production-schemas";

const MAX_OUTPUT_TOKENS = 4_000;

function safeHex(raw: string, fallback: string): string {
  const cleaned = raw.trim();
  return /^#[0-9A-Fa-f]{6}$/u.test(cleaned) ? cleaned.toUpperCase() : fallback;
}

function resolveActiveAssistRoute(
  explicit?: Pick<AssistRoute, "apiKey" | "revision" | "model"> | null,
): Pick<AssistRoute, "apiKey" | "revision" | "model"> | null {
  // 등록한 키가 없으면 관리형 경로(ToonStudio AI)가 돌아오므로 항상 실행할 경로가 있다.
  return explicit ?? resolveAssistRoute();
}

function buildUserContextPrompt(input: WebtoonProductionAssistInput, directiveKo: string): string {
  const genre = cleanSingleLineText(input.genre ?? "판타지", 40) || "판타지";
  const conflict =
    cleanSingleLineText(input.coreConflict ?? "봉인된 기억의 각성과 세계의 균열", 160) ||
    "봉인된 기억의 각성과 세계의 균열";
  const protagonist = cleanSingleLineText(input.protagonistName ?? "주인공", 30) || "주인공";
  const partner = cleanSingleLineText(input.partnerName ?? "조력자", 30) || "조력자";
  const artistLabel = cleanSingleLineText(input.artistLabel ?? "K-웹툰 마스터 화풍", 60);
  const triggerWord = cleanSingleLineText(input.triggerWord ?? "custom_artist_style", 60);
  const scriptSnippet = cleanSingleLineText(input.scriptText ?? "", 600);

  return [
    `장르: ${genre}`,
    `핵심 갈등: ${conflict}`,
    `주요 인물: ${protagonist}, ${partner} (관계성: ${input.relationshipDynamic ?? "fated-rivals"})`,
    `작가 화풍 모델: ${artistLabel} (${triggerWord})`,
    `타깃 로케일: ${input.targetLocale ?? "ko"}`,
    ...(scriptSnippet ? [`현재 대본 초안: ${scriptSnippet}`] : []),
    "",
    directiveKo,
  ].join("\n");
}

export async function runAssistScrollEyePathDoctor(
  input: WebtoonProductionAssistInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<AssistScrollEyePathView> {
  const activeRoute = resolveActiveAssistRoute(options.route);
  if (!activeRoute) {
    if (options.fallbackOnError !== false) return buildDeterministicScrollEyePathReport(input);
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const taskRoute = resolveCreatorTaskModelRoute("production:scroll-rhythm-doctor", {
    model: options.model as never,
  });
  const requestedModel = resolveAssistRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || ASSIST_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: "당신은 네이버웹툰·클립스튜디오 EX 기준 모바일 세로 스크롤(390×844px) 시선 유도(S-curve)·엄지 데드존·컷 여백(Gutter px) 진단 닥터입니다. 컷별 시선 유도 패턴, 인지 부하(0~100), 권장 여백(px), 말풍선 재배치 팁과 즉시 대본에 넣을 지문을 JSON으로 답하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildUserContextPrompt(
          input,
          "위 웹툰 원고의 모바일 세로 스크롤 시선 유도(S-curve)와 데드존, 권장 컷 간 여백(px)을 최대 4컷까지 JSON으로 진단해 주세요.",
        ),
      },
    ],
    ...(assistModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await assistParse(
      activeRoute,
      request,
      AssistScrollEyePathSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: AssistScrollEyePathSchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return Object.freeze({
      mode: "scroll-eyepath",
      source: "claude-live",
      model: assistModelInfo(actualModel)?.id ?? actualModel,
      overallReadabilityScore: clampInt(parsed.overallReadabilityScore, 0, 100, 90),
      sCurveContinuitySummaryKo: cleanSingleLineText(parsed.sCurveContinuitySummaryKo, 200),
      cliffhangerScrollHookKo: cleanSingleLineText(parsed.cliffhangerScrollHookKo, 200),
      cutDiagnostics: Object.freeze(
        (parsed.cutDiagnostics ?? []).slice(0, 4).map((c, idx) =>
          Object.freeze({
            cutNumber: clampInt(c.cutNumber, 1, 50, idx + 1),
            eyePathPattern: c.eyePathPattern,
            cognitiveLoadScore: clampInt(c.cognitiveLoadScore, 0, 100, 50),
            deadZoneViolation: c.deadZoneViolation,
            recommendedGutterAfterPx: clampInt(c.recommendedGutterAfterPx, 60, 1600, 220),
            bubbleRelocationHint: cleanSingleLineText(c.bubbleRelocationHint, 180),
            directorCoachingKo: cleanSingleLineText(c.directorCoachingKo, 180),
            readyStageDirectionLine: cleanSingleLineText(c.readyStageDirectionLine, 180),
          }),
        ),
      ),
      usage,
      estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicScrollEyePathReport(input);
    }
    throw error;
  }
}

export async function runAssistColorScriptDirector(
  input: WebtoonProductionAssistInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<AssistColorScriptView> {
  const activeRoute = resolveActiveAssistRoute(options.route);
  if (!activeRoute) {
    if (options.fallbackOnError !== false) return buildDeterministicColorScriptReport(input);
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const taskRoute = resolveCreatorTaskModelRoute("production:color-mood-script", {
    model: options.model as never,
  });
  const requestedModel = resolveAssistRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || ASSIST_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: "당신은 다쉬툰 스튜디오·리얼드로우 기준 웹툰 컬러 스크립트(Color Script) & 4레이어 조명 디렉터입니다. 각 컷의 시간대, 색온도(K), 5색 HEX 팔레트(#RRGGBB), 광원 방위각/고도, L3 Multiply/Screen 음영 농도(%), L4 선화 색트랩(Color Hold) HEX를 JSON으로 설계하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildUserContextPrompt(
          input,
          "위 웹툰 장면의 컷별 컬러 스크립트(5색 HEX 팔레트)와 4레이어 조명/음영 디렉팅을 최대 4컷까지 JSON으로 작성해 주세요.",
        ),
      },
    ],
    ...(assistModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await assistParse(
      activeRoute,
      request,
      AssistColorScriptSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: AssistColorScriptSchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return Object.freeze({
      mode: "color-script",
      source: "claude-live",
      model: assistModelInfo(actualModel)?.id ?? actualModel,
      episodeArcColorSummaryKo: cleanSingleLineText(parsed.episodeArcColorSummaryKo, 200),
      emotionalTurningPointCutNumber: clampInt(parsed.emotionalTurningPointCutNumber, 1, 50, 3),
      cutDirectives: Object.freeze(
        (parsed.cutDirectives ?? []).slice(0, 4).map((c, idx) =>
          Object.freeze({
            cutNumber: clampInt(c.cutNumber, 1, 50, idx + 1),
            timeOfDay: c.timeOfDay,
            kelvinTemperature: clampInt(c.kelvinTemperature, 2000, 10000, 4500),
            bgSkyHex: safeHex(c.bgSkyHex, "#1E293B"),
            bgGroundHex: safeHex(c.bgGroundHex, "#0F172A"),
            keyLightHex: safeHex(c.keyLightHex, "#F59E0B"),
            fillShadowHex: safeHex(c.fillShadowHex, "#1E1B4B"),
            rimAccentHex: safeHex(c.rimAccentHex, "#38BDF8"),
            l4VectorInkColorHoldHex: safeHex(c.l4VectorInkColorHoldHex, "#31102F"),
            azimuthDeg: clampInt(c.azimuthDeg, 0, 360, 135),
            elevationDeg: clampInt(c.elevationDeg, -30, 90, 35),
            l3CelMultiplyOpacityPct: clampInt(c.l3CelMultiplyOpacityPct, 10, 85, 60),
            l3RimScreenOpacityPct: clampInt(c.l3RimScreenOpacityPct, 0, 90, 55),
            moodTransitionNoteKo: cleanSingleLineText(c.moodTransitionNoteKo, 180),
            readyColorStageLine: cleanSingleLineText(c.readyColorStageLine, 180),
          }),
        ),
      ),
      usage,
      estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicColorScriptReport(input);
    }
    throw error;
  }
}

export async function runAssistContinuityForeshadowAuditor(
  input: WebtoonProductionAssistInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<AssistContinuityForeshadowView> {
  const activeRoute = resolveActiveAssistRoute(options.route);
  if (!activeRoute) {
    if (options.fallbackOnError !== false) {
      return buildDeterministicContinuityForeshadowReport(input);
    }
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const taskRoute = resolveCreatorTaskModelRoute("production:continuity-foreshadow", {
    model: options.model as never,
  });
  const requestedModel = resolveAssistRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || ASSIST_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: "당신은 오노마AI 페뷸레이터·라마젠 기준 웹툰 설정 연속성(Continuity) 감수자이자 복선(Foreshadow) 스토리 닥터입니다. 전후 컷의 180도 카메라 시선 축, 캐릭터 복장/외형 드리프트, 시간대 점프를 감수하고 미회수 복선을 회수하는 시각 연출과 대사를 JSON으로 제안하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildUserContextPrompt(
          input,
          "위 웹툰 원고의 설정 연속성 충돌 요소와 미회수 복선 페이오프 연출 제안을 JSON으로 작성해 주세요.",
        ),
      },
    ],
    ...(assistModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await assistParse(
      activeRoute,
      request,
      AssistContinuityForeshadowSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: AssistContinuityForeshadowSchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return Object.freeze({
      mode: "continuity-foreshadow",
      source: "claude-live",
      model: assistModelInfo(actualModel)?.id ?? actualModel,
      continuityHealthScore: clampInt(parsed.continuityHealthScore, 0, 100, 92),
      executiveSummaryKo: cleanSingleLineText(parsed.executiveSummaryKo, 200),
      conflicts: Object.freeze(
        (parsed.conflicts ?? []).slice(0, 4).map((c, idx) =>
          Object.freeze({
            cutNumber: clampInt(c.cutNumber, 1, 50, idx + 1),
            category: c.category,
            severity: c.severity,
            conflictDescriptionKo: cleanSingleLineText(c.conflictDescriptionKo, 180),
            concreteFixSuggestionKo: cleanSingleLineText(c.concreteFixSuggestionKo, 180),
          }),
        ),
      ),
      foreshadowPayoffs: Object.freeze(
        (parsed.foreshadowPayoffs ?? []).slice(0, 3).map((f) =>
          Object.freeze({
            seedTitle: cleanSingleLineText(f.seedTitle, 80),
            recommendedCutNumber: clampInt(f.recommendedCutNumber, 1, 50, 1),
            payoffStrategy: f.payoffStrategy,
            suggestedVisualDetailKo: cleanSingleLineText(f.suggestedVisualDetailKo, 180),
            suggestedSubtextLineKo: cleanSingleLineText(f.suggestedSubtextLineKo, 180),
          }),
        ),
      ),
      usage,
      estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicContinuityForeshadowReport(input);
    }
    throw error;
  }
}

export async function runAssistActingSfxChoreographer(
  input: WebtoonProductionAssistInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<AssistActingSfxChoreographyView> {
  const activeRoute = resolveActiveAssistRoute(options.route);
  if (!activeRoute) {
    if (options.fallbackOnError !== false) return buildDeterministicActingSfxReport(input);
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const taskRoute = resolveCreatorTaskModelRoute("production:sfx-typo-director", {
    model: options.model as never,
  });
  const requestedModel = resolveAssistRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || ASSIST_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: "당신은 라이언로켓 젠버스(Genvas) 스타일의 다각도 캐릭터 표정·포즈 디렉터이자 투닝 플러스 스타일의 효과음(SFX)·말풍선 오케스트레이터입니다. 각 컷의 표정 프리셋(xf_*), 포즈 프리셋(xp_*), 미세 표정 디테일, 말풍선 호흡 분할, 효과음(SFX) 텍스트·회전각·스케일과 대본 반영 줄을 JSON으로 설계하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildUserContextPrompt(
          input,
          "위 웹툰 장면의 컷별 캐릭터 표정·포즈 일관성 시트와 효과음(SFX)·말풍선 오케스트레이션을 최대 4컷까지 JSON으로 작성해 주세요.",
        ),
      },
    ],
    ...(assistModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await assistParse(
      activeRoute,
      request,
      AssistActingSfxChoreographySchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: AssistActingSfxChoreographySchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return Object.freeze({
      mode: "acting-sfx",
      source: "claude-live",
      model: assistModelInfo(actualModel)?.id ?? actualModel,
      genvasConsistencySummaryKo: cleanSingleLineText(parsed.genvasConsistencySummaryKo, 200),
      cutChoreographies: Object.freeze(
        (parsed.cutChoreographies ?? []).slice(0, 4).map((c, idx) =>
          Object.freeze({
            cutNumber: clampInt(c.cutNumber, 1, 50, idx + 1),
            characterName: cleanSingleLineText(c.characterName, 40) || "주인공",
            cameraAngle: c.cameraAngle,
            emotionCategory: c.emotionCategory,
            expressionPresetId: cleanSingleLineText(c.expressionPresetId, 40) || "xf_focus_sharp_01",
            posePresetId: cleanSingleLineText(c.posePresetId, 40) || "pose-dynamic-slash",
            microExpressionNoteKo: cleanSingleLineText(c.microExpressionNoteKo, 180),
            consistencyAnchorToken:
              cleanSingleLineText(c.consistencyAnchorToken, 60) || "custom_artist_char_lock",
            bubbleFrameKind: c.bubbleFrameKind,
            splitLinesRecommended: Object.freeze(
              (c.splitLinesRecommended ?? [])
                .map((line) => cleanSingleLineText(line, 120))
                .filter(Boolean)
                .slice(0, 4),
            ),
            sfxTextKo: cleanSingleLineText(c.sfxTextKo, 24) || "콰아앙",
            sfxRomanized: cleanSingleLineText(c.sfxRomanized, 32) || "KWA-ANG",
            sfxRotationDeg: clampInt(c.sfxRotationDeg, -45, 45, -10),
            sfxScaleMultiplier: Number.isFinite(c.sfxScaleMultiplier)
              ? Math.max(0.5, Math.min(2.5, Number(c.sfxScaleMultiplier.toFixed(2))))
              : 1.3,
            typographyStyleNoteKo: cleanSingleLineText(c.typographyStyleNoteKo, 180),
            readyActingScriptLine: cleanSingleLineText(c.readyActingScriptLine, 200),
          }),
        ),
      ),
      usage,
      estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicActingSfxReport(input);
    }
    throw error;
  }
}

export async function runAssistMultiCharacterWardrobeUniformDirector(
  input: WebtoonProductionAssistInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<AssistMultiCharacterWardrobeView> {
  const activeRoute = resolveActiveAssistRoute(options.route);
  if (!activeRoute) {
    if (options.fallbackOnError !== false) {
      return buildDeterministicMultiCharacterWardrobeReport(input);
    }
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const taskRoute = resolveCreatorTaskModelRoute("production:multi-character-crowd-wardrobe-lock", {
    model: options.model as never,
  });
  const requestedModel = resolveAssistRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || ASSIST_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: "당신은 웹툰 다중 등장인물·조연·배경 엑스트라의 제복/문장(Crest)/계급장 복식 규율 일관성 디렉터입니다. 학원·황궁·기사단·길드 등 세력별 메인 원단 HEX, 테두리/휘장 HEX, 견장/브로치 부착 위치, 주연 장신구가 엑스트라에게 섞이는(Attribute Bleeding) 현상 차단 지침을 JSON으로 작성하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildUserContextPrompt(
          input,
          "위 웹툰 장면의 주연·조연·배경 엑스트라 세력별 제복/문장/계급장 복식 규율 일관성 지시서를 JSON으로 작성해 주세요.",
        ),
      },
    ],
    ...(assistModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await assistParse(
      activeRoute,
      request,
      AssistMultiCharacterWardrobeSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: AssistMultiCharacterWardrobeSchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return Object.freeze({
      mode: "multi-character-wardrobe-lock",
      source: "claude-live",
      model: assistModelInfo(actualModel)?.id ?? actualModel,
      wardrobeComplianceScore: clampInt(parsed.wardrobeComplianceScore, 0, 100, 97),
      factionUniformSummaryKo: cleanSingleLineText(parsed.factionUniformSummaryKo, 240),
      castUniformSpecs: Object.freeze(
        (parsed.castUniformSpecs ?? []).slice(0, 4).map((spec) =>
          Object.freeze({
            characterOrGroupRole: cleanSingleLineText(spec.characterOrGroupRole, 60) || "주인공",
            factionAndRankKo: cleanSingleLineText(spec.factionAndRankKo, 100),
            primaryFabricHex: safeHex(spec.primaryFabricHex, "#18181B"),
            trimAndCrestHex: safeHex(spec.trimAndCrestHex, "#F59E0B"),
            insigniaPlacementRuleKo: cleanSingleLineText(spec.insigniaPlacementRuleKo, 180),
            forbiddenMixupWarningKo: cleanSingleLineText(spec.forbiddenMixupWarningKo, 180),
            readyWardrobeStageLine: cleanSingleLineText(spec.readyWardrobeStageLine, 200),
          }),
        ),
      ),
      usage,
      estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicMultiCharacterWardrobeReport(input);
    }
    throw error;
  }
}

export async function runAssistWeatherTimeProgressionContinuityDirector(
  input: WebtoonProductionAssistInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<AssistWeatherTimeProgressionView> {
  const activeRoute = resolveActiveAssistRoute(options.route);
  if (!activeRoute) {
    if (options.fallbackOnError !== false) {
      return buildDeterministicWeatherTimeProgressionReport(input);
    }
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const taskRoute = resolveCreatorTaskModelRoute("production:weather-particle-time-progression-lock", {
    model: options.model as never,
  });
  const requestedModel = resolveAssistRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || ASSIST_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: "당신은 웹툰 컷간 날씨(비·눈·안개)·젖은 머리카락/의상 투과도·시간 경과(태양 고도각·바닥 그림자 길이 비율·파티클 풍향 각도) 물리 연속성 고정 감독입니다. 비 맞은 캐릭터가 다음 컷에서 갑자기 마르거나 그림자 길이가 역행하지 않도록 컷별 물리 상태를 JSON으로 설계하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildUserContextPrompt(
          input,
          "위 웹툰 장면의 주요 4컷에 대해 경과 시간(분), 날씨 상태, 머리카락/의상 젖음도(%), 태양/달 고도각, 그림자 길이 배율, 빗줄기/바람 각도와 연출 지문을 JSON으로 작성해 주세요.",
        ),
      },
    ],
    ...(assistModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };

  try {
    const { message, parsed } = await assistParse(
      activeRoute,
      request,
      AssistWeatherTimeProgressionSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: AssistWeatherTimeProgressionSchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return Object.freeze({
      mode: "weather-time-progression-lock",
      source: "claude-live",
      model: assistModelInfo(actualModel)?.id ?? actualModel,
      weatherContinuityScore: clampInt(parsed.weatherContinuityScore, 0, 100, 96),
      atmosphericArcSummaryKo: cleanSingleLineText(parsed.atmosphericArcSummaryKo, 240),
      cutWeatherLocks: Object.freeze(
        (parsed.cutWeatherLocks ?? []).slice(0, 4).map((w, idx) =>
          Object.freeze({
            cutNumber: clampInt(w.cutNumber, 1, 50, idx + 1),
            elapsedMinutesFromStart: clampInt(w.elapsedMinutesFromStart, 0, 1440, idx * 4),
            weatherState: w.weatherState,
            hairAndClothWetnessPct: clampInt(w.hairAndClothWetnessPct, 0, 100, 45),
            sunOrMoonElevationDeg: clampInt(w.sunOrMoonElevationDeg, -30, 90, 22),
            groundShadowLengthRatio: Number.isFinite(w.groundShadowLengthRatio)
              ? Math.max(0.2, Math.min(8.0, Number(w.groundShadowLengthRatio.toFixed(2))))
              : 1.8,
            particleWindAngleDeg: clampInt(w.particleWindAngleDeg, -65, 65, -18),
            readyWeatherStageLine: cleanSingleLineText(w.readyWeatherStageLine, 200),
          }),
        ),
      ),
      usage,
      estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicWeatherTimeProgressionReport(input);
    }
    throw error;
  }
}

export {
  runAssistEyetrackScrollVelocityAoiDirector,
  runAssistFastenerOverlapBeltBuckleLockDirector,
  runAssistHeraldryCrestEmblemGeometryLockDirector,
  runAssistMusicalInstrumentFingeringLockDirector,
  runAssistSpeedlineImpactFrameFocusLockDirector,
  runAssistTankobonPrintBleedCmykProofDirector,
  runAssistVariableFontBalloonDiamondCopyfitDirector,
  runAssistWoundBandageHealingTimelineLockDirector,
  type AssistEyetrackScrollAoi,
  type AssistFastenerOverlapLock,
  type AssistHeraldryCrestLock,
  type AssistMusicalInstrumentLock,
  type AssistSpeedlineImpactFocus,
  type AssistTankobonPrintBleedProof,
  type AssistVariableFontDiamondCopyfit,
  type AssistWoundBandageTimeline,
  type RunWave24ProductionAssistOptions,
  type Wave24ProductionAssistInput,
  type Wave24ProductionAssistResult,
} from "./assist-command-plan";
