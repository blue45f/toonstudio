/**
 * assist-webtoon-production-schemas.ts
 *
 * 국내외 8대 웹툰 AI 제작 소프트웨어 벤치마크 기반 신규 AI 보조 엔진 4종의
 * Zod 구조화 출력 스키마, 뷰 타입 및 로컬 결정적(Deterministic) 폴백 빌더.
 */
import { z } from "zod";

import {
  EMPTY_ASSIST_TOKEN_USAGE,
  type AssistTokenUsage,
} from "@/shared/ai/assist/assist-models";

import {
  runWebtoonStoryboardMasterPipeline,
  type CharacterRelationshipDynamicId,
  type GenvasPosePresetId,
} from "../studio-webtoon-storyboard-pipeline";

import type { AssistRoute } from "@/shared/ai/assist/assist-route";

export type WebtoonProductionAssistMode =
  | "scroll-eyepath"
  | "color-script"
  | "continuity-foreshadow"
  | "acting-sfx"
  | "multi-character-wardrobe-lock"
  | "weather-time-progression-lock";

export interface WebtoonProductionAssistInput {
  readonly episodeTitle?: string;
  readonly scriptText?: string;
  readonly genre?: string;
  readonly coreConflict?: string;
  readonly protagonistName?: string;
  readonly partnerName?: string;
  readonly artistLabel?: string;
  readonly triggerWord?: string;
  readonly relationshipDynamic?: CharacterRelationshipDynamicId;
  readonly posePresetId?: GenvasPosePresetId;
  readonly targetLocale?: "ko" | "en" | "ja" | "es";
  readonly foreshadowKeywords?: readonly string[];
}

export interface RunWebtoonProductionAssistOptions {
  readonly route?: Pick<AssistRoute, "apiKey" | "revision" | "model"> | null;
  readonly model?: string;
  readonly signal?: AbortSignal;
  readonly budgetOverride?: boolean;
  readonly fallbackOnError?: boolean;
}

// ── 1. 모바일 스크롤 시선 유도(Eye-Path S-Curve) · 데드존 닥터 ──────────────────────

export const AssistScrollEyePathSchema = z.object({
  overallReadabilityScore: z.number(),
  sCurveContinuitySummaryKo: z.string(),
  cliffhangerScrollHookKo: z.string(),
  cutDiagnostics: z.array(
    z.object({
      cutNumber: z.number(),
      eyePathPattern: z.enum([
        "s-curve-optimal",
        "z-zig-zag",
        "vertical-drop",
        "stagnant-cluster",
      ]),
      cognitiveLoadScore: z.number(),
      deadZoneViolation: z.enum([
        "none",
        "bottom-thumb-zone",
        "edge-clipping",
        "focal-occluded-by-bubble",
      ]),
      recommendedGutterAfterPx: z.number(),
      bubbleRelocationHint: z.string(),
      directorCoachingKo: z.string(),
      readyStageDirectionLine: z.string(),
    }),
  ),
});

export type AssistScrollEyePathRaw = z.infer<typeof AssistScrollEyePathSchema>;

export interface ScrollEyePathCutDiagnosticView {
  readonly cutNumber: number;
  readonly eyePathPattern: "s-curve-optimal" | "z-zig-zag" | "vertical-drop" | "stagnant-cluster";
  readonly cognitiveLoadScore: number;
  readonly deadZoneViolation:
    | "none"
    | "bottom-thumb-zone"
    | "edge-clipping"
    | "focal-occluded-by-bubble";
  readonly recommendedGutterAfterPx: number;
  readonly bubbleRelocationHint: string;
  readonly directorCoachingKo: string;
  readonly readyStageDirectionLine: string;
}

export interface AssistScrollEyePathView {
  readonly mode: "scroll-eyepath";
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly overallReadabilityScore: number;
  readonly sCurveContinuitySummaryKo: string;
  readonly cliffhangerScrollHookKo: string;
  readonly cutDiagnostics: readonly ScrollEyePathCutDiagnosticView[];
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

// ── 2. 에피소드 컬러 스크립트(Color Script) & 4레이어 조명 디렉터 ────────────────────

export const AssistColorScriptSchema = z.object({
  episodeArcColorSummaryKo: z.string(),
  emotionalTurningPointCutNumber: z.number(),
  cutDirectives: z.array(
    z.object({
      cutNumber: z.number(),
      timeOfDay: z.enum([
        "dawn",
        "morning",
        "high-noon",
        "golden-hour",
        "dusk",
        "night-indoor",
        "midnight-neon",
        "eclipse-abyss",
      ]),
      kelvinTemperature: z.number(),
      bgSkyHex: z.string(),
      bgGroundHex: z.string(),
      keyLightHex: z.string(),
      fillShadowHex: z.string(),
      rimAccentHex: z.string(),
      l4VectorInkColorHoldHex: z.string(),
      azimuthDeg: z.number(),
      elevationDeg: z.number(),
      l3CelMultiplyOpacityPct: z.number(),
      l3RimScreenOpacityPct: z.number(),
      moodTransitionNoteKo: z.string(),
      readyColorStageLine: z.string(),
    }),
  ),
});

export type AssistColorScriptRaw = z.infer<typeof AssistColorScriptSchema>;

export interface ColorScriptCutDirectiveView {
  readonly cutNumber: number;
  readonly timeOfDay:
    | "dawn"
    | "morning"
    | "high-noon"
    | "golden-hour"
    | "dusk"
    | "night-indoor"
    | "midnight-neon"
    | "eclipse-abyss";
  readonly kelvinTemperature: number;
  readonly bgSkyHex: string;
  readonly bgGroundHex: string;
  readonly keyLightHex: string;
  readonly fillShadowHex: string;
  readonly rimAccentHex: string;
  readonly l4VectorInkColorHoldHex: string;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly l3CelMultiplyOpacityPct: number;
  readonly l3RimScreenOpacityPct: number;
  readonly moodTransitionNoteKo: string;
  readonly readyColorStageLine: string;
}

export interface AssistColorScriptView {
  readonly mode: "color-script";
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly episodeArcColorSummaryKo: string;
  readonly emotionalTurningPointCutNumber: number;
  readonly cutDirectives: readonly ColorScriptCutDirectiveView[];
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

// ── 3. 설정 연속성(Continuity) · 180도 카메라 축 · 복선(Foreshadow) 회수 감수기 ────────

export const AssistContinuityForeshadowSchema = z.object({
  continuityHealthScore: z.number(),
  executiveSummaryKo: z.string(),
  conflicts: z.array(
    z.object({
      cutNumber: z.number(),
      category: z.enum([
        "character-appearance-drift",
        "spatial-180-axis-violation",
        "time-weather-jump",
        "prop-state-mismatch",
        "character-voice-ooc",
      ]),
      severity: z.enum(["info", "warn", "critical"]),
      conflictDescriptionKo: z.string(),
      concreteFixSuggestionKo: z.string(),
    }),
  ),
  foreshadowPayoffs: z.array(
    z.object({
      seedTitle: z.string(),
      recommendedCutNumber: z.number(),
      payoffStrategy: z.enum([
        "subtle-visual-prop",
        "subtext-dialogue-echo",
        "direct-revelation",
        "cliffhanger-twist",
      ]),
      suggestedVisualDetailKo: z.string(),
      suggestedSubtextLineKo: z.string(),
    }),
  ),
});

export type AssistContinuityForeshadowRaw = z.infer<typeof AssistContinuityForeshadowSchema>;

export interface AssistContinuityForeshadowView {
  readonly mode: "continuity-foreshadow";
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly continuityHealthScore: number;
  readonly executiveSummaryKo: string;
  readonly conflicts: ReadonlyArray<{
    readonly cutNumber: number;
    readonly category:
      | "character-appearance-drift"
      | "spatial-180-axis-violation"
      | "time-weather-jump"
      | "prop-state-mismatch"
      | "character-voice-ooc";
    readonly severity: "info" | "warn" | "critical";
    readonly conflictDescriptionKo: string;
    readonly concreteFixSuggestionKo: string;
  }>;
  readonly foreshadowPayoffs: ReadonlyArray<{
    readonly seedTitle: string;
    readonly recommendedCutNumber: number;
    readonly payoffStrategy:
      | "subtle-visual-prop"
      | "subtext-dialogue-echo"
      | "direct-revelation"
      | "cliffhanger-twist";
    readonly suggestedVisualDetailKo: string;
    readonly suggestedSubtextLineKo: string;
  }>;
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

// ── 4. 다각도 표정·포즈 매트릭스 & 효과음(SFX)·말풍선 오케스트레이터 ──────────────────

export const AssistActingSfxChoreographySchema = z.object({
  genvasConsistencySummaryKo: z.string(),
  cutChoreographies: z.array(
    z.object({
      cutNumber: z.number(),
      characterName: z.string(),
      cameraAngle: z.enum([
        "eye-level-front",
        "three-quarter",
        "profile-side",
        "high-angle-vulnerable",
        "low-angle-dominant",
        "over-the-shoulder",
      ]),
      emotionCategory: z.enum([
        "calm",
        "joy",
        "sadness",
        "anger",
        "fear",
        "surprise",
        "tension",
        "romance",
        "determination",
      ]),
      expressionPresetId: z.string(),
      posePresetId: z.string(),
      microExpressionNoteKo: z.string(),
      consistencyAnchorToken: z.string(),
      bubbleFrameKind: z.enum(["speech", "shout", "thought", "whisper", "narration"]),
      splitLinesRecommended: z.array(z.string()),
      sfxTextKo: z.string(),
      sfxRomanized: z.string(),
      sfxRotationDeg: z.number(),
      sfxScaleMultiplier: z.number(),
      typographyStyleNoteKo: z.string(),
      readyActingScriptLine: z.string(),
    }),
  ),
});

export type AssistActingSfxChoreographyRaw = z.infer<typeof AssistActingSfxChoreographySchema>;

export interface AssistActingSfxChoreographyView {
  readonly mode: "acting-sfx";
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly genvasConsistencySummaryKo: string;
  readonly cutChoreographies: ReadonlyArray<{
    readonly cutNumber: number;
    readonly characterName: string;
    readonly cameraAngle: string;
    readonly emotionCategory: string;
    readonly expressionPresetId: string;
    readonly posePresetId: string;
    readonly microExpressionNoteKo: string;
    readonly consistencyAnchorToken: string;
    readonly bubbleFrameKind: "speech" | "shout" | "thought" | "whisper" | "narration";
    readonly splitLinesRecommended: readonly string[];
    readonly sfxTextKo: string;
    readonly sfxRomanized: string;
    readonly sfxRotationDeg: number;
    readonly sfxScaleMultiplier: number;
    readonly typographyStyleNoteKo: string;
    readonly readyActingScriptLine: string;
  }>;
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

export function clampInt(raw: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.round(raw)));
}

export function buildDeterministicScrollEyePathReport(
  input: WebtoonProductionAssistInput = {},
): AssistScrollEyePathView {
  const master = runWebtoonStoryboardMasterPipeline({
    scriptText: input.scriptText,
    storylineInput: { genre: input.genre, coreConflict: input.coreConflict },
    relationshipDynamic: input.relationshipDynamic,
    posePresetId: input.posePresetId,
    protagonistName: input.protagonistName,
    partnerName: input.partnerName,
    targetLocale: input.targetLocale,
  });

  const cuts = master.enrichedCuts.slice(0, 4);
  const cutDiagnostics: ScrollEyePathCutDiagnosticView[] = cuts.map((item, idx) => {
    const cut = item.cutPlan;
    const isAction = cut.emotion === "rage" || cut.emotion === "shock";
    const gutterPx = isAction ? 280 : cut.shotScale === "extreme-close-up" ? 420 : 160;
    const pattern: ScrollEyePathCutDiagnosticView["eyePathPattern"] =
      isAction ? "vertical-drop" : idx % 2 === 0 ? "s-curve-optimal" : "z-zig-zag";
    const bubbleCount = item.mobileBubbles.length;
    const loadScore = clampInt(38 + bubbleCount * 14 + (cut.suggestedSfx ? 10 : 0), 20, 95, 52);
    const deadZone: ScrollEyePathCutDiagnosticView["deadZoneViolation"] =
      bubbleCount >= 3 ? "bottom-thumb-zone" : "none";

    return Object.freeze({
      cutNumber: cut.cutNumber,
      eyePathPattern: pattern,
      cognitiveLoadScore: loadScore,
      deadZoneViolation: deadZone,
      recommendedGutterAfterPx: gutterPx,
      bubbleRelocationHint:
        deadZone === "bottom-thumb-zone"
          ? "하단 18% 엄지 가림 데드존을 피해 두 번째 말풍선을 우상단 대각선(Y: 22~68%)으로 이동하세요."
          : "좌상단 도입 말풍선 → 인물 시선 중심 → 우하단 후속 말풍선으로 S자 시선 궤적이 안정적입니다.",
      directorCoachingKo: `390×844 모바일 뷰포트 기준 ${cut.shotScale}(${cut.cameraAngle}) 후 ${gutterPx}px 세로 여백으로 서스펜스 호흡을 만드세요.`,
      readyStageDirectionLine: `[스크롤 호흡 ${gutterPx}px · ${pattern}] ${cut.summary}`,
    });
  });

  return Object.freeze({
    mode: "scroll-eyepath",
    source: "deterministic-fallback",
    model: "claude-haiku-5-5",
    overallReadabilityScore: master.directingResult.globalKWebtoonReadiness?.verticalScrollRhythmScore ?? 91,
    sCurveContinuitySummaryKo:
      "390×844px 모바일 뷰포트에서 좌상→중앙 피사체→우하단 말풍선으로 이어지는 S-curve 시선 유도와 액션 낙차 여백이 균형을 이룹니다.",
    cliffhangerScrollHookKo: `마지막 컷 직전 420px 암전 여백을 배치해 '${master.storylineArc.nextEpisodeHook}' 엔딩 훅의 체류 시간을 극대화하세요.`,
    cutDiagnostics: Object.freeze(cutDiagnostics),
    usage: EMPTY_ASSIST_TOKEN_USAGE,
    estimatedUsd: null,
  });
}

export function buildDeterministicColorScriptReport(
  input: WebtoonProductionAssistInput = {},
): AssistColorScriptView {
  const master = runWebtoonStoryboardMasterPipeline({
    scriptText: input.scriptText,
    storylineInput: { genre: input.genre, coreConflict: input.coreConflict },
    relationshipDynamic: input.relationshipDynamic,
    posePresetId: input.posePresetId,
    protagonistName: input.protagonistName,
    partnerName: input.partnerName,
  });

  const cuts = master.enrichedCuts.slice(0, 4);
  const cutDirectives: ColorScriptCutDirectiveView[] = cuts.map((item, idx) => {
    const cut = item.cutPlan;
    const isIntense = cut.emotion === "rage" || cut.emotion === "shock";
    const isMelancholy = cut.emotion === "calm";
    const timeOfDay: ColorScriptCutDirectiveView["timeOfDay"] = isIntense
      ? "eclipse-abyss"
      : isMelancholy
        ? "dusk"
        : idx === 0
          ? "golden-hour"
          : "midnight-neon";
    const kelvin = isIntense ? 3200 : isMelancholy ? 4100 : idx === 0 ? 3800 : 6800;

    return Object.freeze({
      cutNumber: cut.cutNumber,
      timeOfDay,
      kelvinTemperature: kelvin,
      bgSkyHex: isIntense ? "#1A1025" : isMelancholy ? "#1E293B" : "#2E1F47",
      bgGroundHex: isIntense ? "#0F172A" : "#111827",
      keyLightHex: isIntense ? "#F43F5E" : isMelancholy ? "#60A5FA" : "#F59E0B",
      fillShadowHex: isIntense ? "#31102F" : "#1E1B4B",
      rimAccentHex: isIntense ? "#38BDF8" : "#A855F7",
      l4VectorInkColorHoldHex: isIntense ? "#4C0519" : "#1E1B4B",
      azimuthDeg: isIntense ? 145 : 45,
      elevationDeg: cut.cameraAngle === "low-angle" ? 65 : 32,
      l3CelMultiplyOpacityPct: isIntense ? 72 : 54,
      l3RimScreenOpacityPct: isIntense ? 78 : 48,
      moodTransitionNoteKo: `${kelvin}K 색온도 · L3 Multiply(${isIntense ? 72 : 54}%) 셀 음영과 역광 림라이트로 ${cut.emotion} 감정선을 강조합니다.`,
      readyColorStageLine: `[컬러 스크립트 #${cut.cutNumber}: ${timeOfDay} ${kelvin}K · Key ${isIntense ? "#F43F5E" : "#F59E0B"} / Rim #38BDF8] ${cut.summary}`,
    });
  });

  return Object.freeze({
    mode: "color-script",
    source: "deterministic-fallback",
    model: "claude-haiku-5-5",
    episodeArcColorSummaryKo:
      "도입부 골든아워(3800K)에서 갈등 고조 시 네온 나이트(6800K)와 클라이맥스 심연 역광(3200K 고대비)으로 전환되는 4막 컬러 스크립트입니다.",
    emotionalTurningPointCutNumber: cuts[cuts.length - 1]?.cutPlan.cutNumber ?? 1,
    cutDirectives: Object.freeze(cutDirectives),
    usage: EMPTY_ASSIST_TOKEN_USAGE,
    estimatedUsd: null,
  });
}

export function buildDeterministicContinuityForeshadowReport(
  input: WebtoonProductionAssistInput = {},
): AssistContinuityForeshadowView {
  const master = runWebtoonStoryboardMasterPipeline({
    scriptText: input.scriptText,
    storylineInput: { genre: input.genre, coreConflict: input.coreConflict },
    relationshipDynamic: input.relationshipDynamic,
    posePresetId: input.posePresetId,
    protagonistName: input.protagonistName,
    partnerName: input.partnerName,
  });

  const protagonist = (input.protagonistName ?? "주인공").trim() || "주인공";
  const partner = (input.partnerName ?? "조력자").trim() || "조력자";
  const conflict = (input.coreConflict ?? "봉인된 기억의 각성과 세계의 균열").trim();

  return Object.freeze({
    mode: "continuity-foreshadow",
    source: "deterministic-fallback",
    model: "claude-haiku-5-5",
    continuityHealthScore: 93,
    executiveSummaryKo: `${protagonist}와(과) ${partner}의 시드 토큰(${master.genvasCharacterPoseLock.characterIdentityToken})과 180도 대화 시선 축이 전 컷에서 일관되게 유지됩니다.`,
    conflicts: Object.freeze([
      {
        cutNumber: 2,
        category: "spatial-180-axis-violation" as const,
        severity: "warn" as const,
        conflictDescriptionKo: `컷 #1에서 좌측에 서 있던 ${protagonist}의 시선 방향이 컷 #2 오버더숄더 전환 시 급반전될 위험이 있습니다.`,
        concreteFixSuggestionKo: `컷 #2 전경 좌하단에 ${partner}의 어깨 실루엣을 고정해 180도 카메라 축을 유지하세요.`,
      },
      {
        cutNumber: 3,
        category: "character-appearance-drift" as const,
        severity: "info" as const,
        conflictDescriptionKo: `액션 클로즈업 전환 시 ${protagonist}의 시그니처 의상·장신구 디테일이 생략될 수 있습니다.`,
        concreteFixSuggestionKo: `프롬프트에 '${master.genvasCharacterPoseLock.characterIdentityToken}' 시드 토큰을 유지하세요.`,
      },
    ]),
    foreshadowPayoffs: Object.freeze([
      {
        seedTitle: `${conflict}의 핵심 단서`,
        recommendedCutNumber: Math.max(1, master.enrichedCuts.length),
        payoffStrategy: "cliffhanger-twist" as const,
        suggestedVisualDetailKo: `엔딩 클로즈업 컷 배경 유리에 반사된 붉은 균열 문양을 소품 복선으로 배치하세요.`,
        suggestedSubtextLineKo: `${protagonist}: "이 문양… 처음부터 우연이 아니었어."`,
      },
    ]),
    usage: EMPTY_ASSIST_TOKEN_USAGE,
    estimatedUsd: null,
  });
}

export function buildDeterministicActingSfxReport(
  input: WebtoonProductionAssistInput = {},
): AssistActingSfxChoreographyView {
  const master = runWebtoonStoryboardMasterPipeline({
    scriptText: input.scriptText,
    storylineInput: { genre: input.genre, coreConflict: input.coreConflict },
    relationshipDynamic: input.relationshipDynamic,
    posePresetId: input.posePresetId,
    protagonistName: input.protagonistName,
    partnerName: input.partnerName,
  });

  const protagonist = (input.protagonistName ?? "주인공").trim() || "주인공";
  const cuts = master.enrichedCuts.slice(0, 4);

  const cutChoreographies = cuts.map((item) => {
    const cut = item.cutPlan;
    const isRage = cut.emotion === "rage" || cut.emotion === "shock";
    const sfxKo = cut.suggestedSfx ?? (isRage ? "콰아앙" : "스르륵");
    const sfxRom = isRage ? "KWA-ANG" : "SEU-REU-REUK";
    return Object.freeze({
      cutNumber: cut.cutNumber,
      characterName: cut.speaker ?? protagonist,
      cameraAngle: cut.cameraAngle === "low-angle" ? "low-angle-dominant" : "three-quarter",
      emotionCategory: isRage ? "anger" : "determination",
      expressionPresetId: isRage ? "xf_anger_fierce_01" : "xf_focus_sharp_01",
      posePresetId: master.genvasCharacterPoseLock.posePreset.id,
      microExpressionNoteKo: isRage
        ? "수축된 동공, 하이라이트 소실, 비대칭으로 일그러진 눈썹과 역광 실루엣"
        : "흔들림 없는 정면 응시, 살짝 굳은 입매와 바람에 날리는 앞머리 결",
      consistencyAnchorToken: master.genvasCharacterPoseLock.characterIdentityToken,
      bubbleFrameKind: (isRage ? "shout" : "speech") as "shout" | "speech",
      splitLinesRecommended: Object.freeze(
        item.mobileBubbles.length > 0 ? item.mobileBubbles : [cut.dialogue ?? cut.summary],
      ),
      sfxTextKo: sfxKo,
      sfxRomanized: sfxRom,
      sfxRotationDeg: isRage ? -14 : -6,
      sfxScaleMultiplier: isRage ? 1.65 : 1.15,
      typographyStyleNoteKo: isRage
        ? "거친 붓터치 외곽선 + 대각선 -14도 기울기 + 외곽 글로우로 타격감 극대화"
        : "깔끔한 산세리프 반투명 스트로크로 인물 표정 가림 최소화",
      readyActingScriptLine: `[연기: ${isRage ? "xf_anger_fierce_01" : "xf_focus_sharp_01"} / 포즈: ${master.genvasCharacterPoseLock.posePreset.id} / SFX: ${sfxKo}(${sfxRom})] ${cut.speaker ?? protagonist}: "${cut.dialogue ?? cut.summary}"`,
    });
  });

  return Object.freeze({
    mode: "acting-sfx",
    source: "deterministic-fallback",
    model: "claude-haiku-5-5",
    genvasConsistencySummaryKo: `${master.genvasCharacterPoseLock.copyrightProvenanceBadge.labelKo} · 전 컷 캐릭터 시드(${master.genvasCharacterPoseLock.characterIdentityToken}) 및 SFX·말풍선 동시 연출 완료`,
    cutChoreographies: Object.freeze(cutChoreographies),
    usage: EMPTY_ASSIST_TOKEN_USAGE,
    estimatedUsd: null,
  });
}

// ── 5. 다중 등장인물·조연·엑스트라 제복/문장(Crest)/계급장 복식 규율 일관성 디렉터 ─────

export const AssistMultiCharacterWardrobeSchema = z.object({
  wardrobeComplianceScore: z.number(),
  factionUniformSummaryKo: z.string(),
  castUniformSpecs: z.array(
    z.object({
      characterOrGroupRole: z.string(),
      factionAndRankKo: z.string(),
      primaryFabricHex: z.string(),
      trimAndCrestHex: z.string(),
      insigniaPlacementRuleKo: z.string(),
      forbiddenMixupWarningKo: z.string(),
      readyWardrobeStageLine: z.string(),
    }),
  ),
});

export interface AssistMultiCharacterWardrobeView {
  readonly mode: "multi-character-wardrobe-lock";
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly wardrobeComplianceScore: number;
  readonly factionUniformSummaryKo: string;
  readonly castUniformSpecs: ReadonlyArray<{
    readonly characterOrGroupRole: string;
    readonly factionAndRankKo: string;
    readonly primaryFabricHex: string;
    readonly trimAndCrestHex: string;
    readonly insigniaPlacementRuleKo: string;
    readonly forbiddenMixupWarningKo: string;
    readonly readyWardrobeStageLine: string;
  }>;
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

export function buildDeterministicMultiCharacterWardrobeReport(
  input: WebtoonProductionAssistInput = {},
): AssistMultiCharacterWardrobeView {
  const protagonist = (input.protagonistName ?? "서진").trim() || "서진";
  const partner = (input.partnerName ?? "하윤").trim() || "하윤";
  return Object.freeze({
    mode: "multi-character-wardrobe-lock",
    source: "deterministic-fallback",
    model: "claude-sonnet-5-5",
    wardrobeComplianceScore: 97,
    factionUniformSummaryKo:
      "[다중 인물·군중 제복 & 문장(Crest) 규율 락] 주연·조연·배경 엑스트라 간의 소속(황실 근위대·아카데미 학년·마법 길드)·계급장(견장 줄 수)·가문 휘장 위치가 컷마다 섞이지 않도록 복식 계층을 고정합니다.",
    castUniformSpecs: Object.freeze([
      {
        characterOrGroupRole: protagonist,
        factionAndRankKo: "황실 직속 제1검성 기사단 · 단장(Commander)",
        primaryFabricHex: "#18181B",
        trimAndCrestHex: "#F59E0B",
        insigniaPlacementRuleKo: "우측 어깨 황금 쌍검 견장(3선 태슬) · 좌측 가슴 6각 창염 브로치 · 흑철 망토 비대칭 걸쇠",
        forbiddenMixupWarningKo: "일반 근위병용 은색 단선 견장이나 좌우 반전된 브로치 배치 절대 금지",
        readyWardrobeStageLine: `[복식 규율 Lock: ${protagonist}] 흑색 제복(#18181B) + 황금 3선 견장(#F59E0B, 우측 어깨 고정) + 좌측 가슴 창염 브로치`,
      },
      {
        characterOrGroupRole: partner,
        factionAndRankKo: "아스트라 황립 마탑 · 수석 성좌 마법사",
        primaryFabricHex: "#1E1B4B",
        trimAndCrestHex: "#38BDF8",
        insigniaPlacementRuleKo: "스탠드 칼라 양측 청은색 별자리 자수 · 좌측 손목 마도서 체인 홀더",
        forbiddenMixupWarningKo: "기사단용 금속 견장 혼입 금지 · 소매 끝단 룬 문양 생략 주의",
        readyWardrobeStageLine: `[복식 규율 Lock: ${partner}] 심해 남색 로브(#1E1B4B) + 청은색 성좌 칼라 자수(#38BDF8) + 좌측 손목 마도서 체인`,
      },
      {
        characterOrGroupRole: "배경 엑스트라 (황궁 근위병·아카데미 생도)",
        factionAndRankKo: "제3근위대 일반 병사 & 하급 생도 군중",
        primaryFabricHex: "#334155",
        trimAndCrestHex: "#94A3B8",
        insigniaPlacementRuleKo: "무광 슬레이트 회색 제복 · 견장 태슬 없음(1선 은색 테두리만 허용) · 채도 35% 이하 억제",
        forbiddenMixupWarningKo: "주인공 전용 황금 견장(#F59E0B)이나 고채도 망토가 엑스트라에게 전이(Attribute Bleeding)되지 않도록 마스킹",
        readyWardrobeStageLine: "[복식 규율 Lock: 배경 군중] 저채도 슬레이트 제복(#334155) + 무장식 1선 은색 테두리(주연 장신구 전이 차단)",
      },
    ]),
    usage: EMPTY_ASSIST_TOKEN_USAGE,
    estimatedUsd: null,
  });
}

// ── 6. 컷간 날씨(비·눈·안개)·젖은 머리카락/의상 투과도·시간 경과(그림자 길이) 물리 연속성 고정기 ──

export const AssistWeatherTimeProgressionSchema = z.object({
  weatherContinuityScore: z.number(),
  atmosphericArcSummaryKo: z.string(),
  cutWeatherLocks: z.array(
    z.object({
      cutNumber: z.number(),
      elapsedMinutesFromStart: z.number(),
      weatherState: z.enum([
        "clear-breeze",
        "overcast-mist",
        "steady-rain",
        "heavy-storm-lightning",
        "snowfall-frost",
        "post-rain-wet-ground",
      ]),
      hairAndClothWetnessPct: z.number(),
      sunOrMoonElevationDeg: z.number(),
      groundShadowLengthRatio: z.number(),
      particleWindAngleDeg: z.number(),
      readyWeatherStageLine: z.string(),
    }),
  ),
});

export interface AssistWeatherTimeProgressionView {
  readonly mode: "weather-time-progression-lock";
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly weatherContinuityScore: number;
  readonly atmosphericArcSummaryKo: string;
  readonly cutWeatherLocks: ReadonlyArray<{
    readonly cutNumber: number;
    readonly elapsedMinutesFromStart: number;
    readonly weatherState:
      | "clear-breeze"
      | "overcast-mist"
      | "steady-rain"
      | "heavy-storm-lightning"
      | "snowfall-frost"
      | "post-rain-wet-ground";
    readonly hairAndClothWetnessPct: number;
    readonly sunOrMoonElevationDeg: number;
    readonly groundShadowLengthRatio: number;
    readonly particleWindAngleDeg: number;
    readonly readyWeatherStageLine: string;
  }>;
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

export function buildDeterministicWeatherTimeProgressionReport(
  input: WebtoonProductionAssistInput = {},
): AssistWeatherTimeProgressionView {
  const master = runWebtoonStoryboardMasterPipeline({
    scriptText: input.scriptText,
    storylineInput: { genre: input.genre, coreConflict: input.coreConflict },
    protagonistName: input.protagonistName,
    partnerName: input.partnerName,
  });
  const cuts = master.enrichedCuts.slice(0, 4);
  const cutWeatherLocks = cuts.map((item, idx) => {
    const cut = item.cutPlan;
    const wetness = Math.min(95, 25 + idx * 22);
    const elevation = Math.max(8, 28 - idx * 6);
    const shadowRatio = Number((1.4 + idx * 0.45).toFixed(2));
    const state =
      idx === 0
        ? ("overcast-mist" as const)
        : idx === 1
          ? ("steady-rain" as const)
          : idx === 2
            ? ("heavy-storm-lightning" as const)
            : ("post-rain-wet-ground" as const);
    return Object.freeze({
      cutNumber: cut.cutNumber,
      elapsedMinutesFromStart: idx * 4,
      weatherState: state,
      hairAndClothWetnessPct: wetness,
      sunOrMoonElevationDeg: elevation,
      groundShadowLengthRatio: shadowRatio,
      particleWindAngleDeg: -18,
      readyWeatherStageLine: `[날씨·시간 연속성 #${cut.cutNumber}: +${idx * 4}분 · ${state} · 젖음 ${wetness}% · 그림자 ${shadowRatio}x] 앞머리 수분 뭉침 및 바닥 수막 반사 유지`,
    });
  });

  return Object.freeze({
    mode: "weather-time-progression-lock",
    source: "deterministic-fallback",
    model: "claude-haiku-5-5",
    weatherContinuityScore: 96,
    atmosphericArcSummaryKo:
      "[컷간 날씨·젖은 의상/모발·그림자 길이 물리 연속성 락] 비를 맞은 직후 다음 컷에서 머리카락과 셔츠가 갑자기 마르거나, 빗줄기 각도(-18°)·시간 경과에 따른 그림자 길이가 역행하는 현상을 원천 차단합니다.",
    cutWeatherLocks: Object.freeze(cutWeatherLocks),
    usage: EMPTY_ASSIST_TOKEN_USAGE,
    estimatedUsd: null,
  });
}
