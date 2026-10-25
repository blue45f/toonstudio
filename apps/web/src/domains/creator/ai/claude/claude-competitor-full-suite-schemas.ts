/**
 * claude-competitor-full-suite-schemas.ts
 *
 * Phase 5 REA(reverse-engineer-anything) 경쟁사 벤치마크 5대 AI 엔진의
 * Zod 구조화 출력 스키마, 타입 정의 및 로컬 결정적(Deterministic) 폴백 빌더.
 */

import { z } from "zod";

import type { ClaudeTokenUsage } from "@/shared/ai/claude/claude-models";

import { runWebtoonStoryboardMasterPipeline } from "../studio-webtoon-storyboard-pipeline";
import type { WebtoonProductionAssistInput } from "./claude-webtoon-production-schemas";

export interface CompetitorEngineExecutionMeta<T> {
  readonly report: T;
  readonly source: "claude-live" | "local-fallback";
  readonly modelUsed: string;
  readonly usage: ClaudeTokenUsage;
  readonly estimatedCostUsd: number;
  readonly fallbackReason?: string;
}

// ---------------------------------------------------------------------------
// 1. 크림 AiD & 클립스튜디오 5.0: 스케치→벡터 선화 & 4레이어 자동 분리 스키마
// ---------------------------------------------------------------------------

export const ClaudeSketchToLineartCutSpecSchema = z.object({
  cutNumber: z.number(),
  outerSilhouetteStrokeMm: z.number(),
  innerCreaseStrokeMm: z.number(),
  vectorIntersectionEraseRuleKo: z.string(),
  colorHintAutoFlatZonesKo: z.array(z.string()),
  separatedLayers: z.array(
    z.object({
      layerCode: z.enum([
        "L4-vector-lineart",
        "L3-cel-shadow-multiply",
        "L2-flat-color-id",
        "L1-bg-3d-lt",
      ]),
      blendMode: z.enum(["Normal", "Multiply", "Screen", "Linear Burn"]),
      alphaLock: z.boolean(),
      extractionDirectiveKo: z.string(),
    }),
  ),
});

export const ClaudeSketchToLineartReportSchema = z.object({
  inkingTimeReductionEstPct: z.number(),
  artistBrushDnaSummaryKo: z.string(),
  cutSpecs: z.array(ClaudeSketchToLineartCutSpecSchema),
});

export type ClaudeSketchToLineartReport = z.infer<typeof ClaudeSketchToLineartReportSchema>;

export function buildLocalSketchToLineartLayerSplit(
  input: WebtoonProductionAssistInput = {},
): ClaudeSketchToLineartReport {
  const base = runWebtoonStoryboardMasterPipeline(input);
  const styleLabel = input.artistLabel ?? base.resolvedArtistStyle.label;
  const cuts = base.directingResult.cuts.slice(0, 4);
  const cutSpecs = cuts.map((cut) => {
    const isClose = cut.shotScale === "close-up" || cut.shotScale === "extreme-close-up";
    return {
      cutNumber: cut.cutNumber,
      outerSilhouetteStrokeMm: isClose ? 0.65 : 0.48,
      innerCreaseStrokeMm: isClose ? 0.22 : 0.16,
      vectorIntersectionEraseRuleKo: `컷 #${cut.cutNumber} 머리카락·옷주름 3방향 교차점(T-junction) 벡터 오버슈트 1.5px 자동 트리밍`,
      colorHintAutoFlatZonesKo: [
        `${cut.speaker || "주인공"} 피부 웜톤 베이스 ID 마스킹`,
        "헤어 실루엣 분리 및 브릿지 하이라이트 영역",
        "의상 메인 파츠 및 금속 장신구 분리 마스킹",
      ],
      separatedLayers: [
        {
          layerCode: "L4-vector-lineart" as const,
          blendMode: "Normal" as const,
          alphaLock: true,
          extractionDirectiveKo: `${styleLabel} 필압 곡선 복원 · 외곽선/내부선 굵기 대비 2.8:1 유지`,
        },
        {
          layerCode: "L3-cel-shadow-multiply" as const,
          blendMode: "Multiply" as const,
          alphaLock: false,
          extractionDirectiveKo: `${cut.emotion} 감정선 기준 1단 셀 그림자 자동 분리 (불투명도 68%)`,
        },
        {
          layerCode: "L2-flat-color-id" as const,
          blendMode: "Normal" as const,
          alphaLock: true,
          extractionDirectiveKo: "틈새 닫기(Close Gap 4px) 적용 파츠별 단색 밑색 ID 레이어",
        },
        {
          layerCode: "L1-bg-3d-lt" as const,
          blendMode: "Normal" as const,
          alphaLock: false,
          extractionDirectiveKo: "3D 배경 메쉬 LT(Line & Tone) 선화·음영 분리 추출 레이어",
        },
      ],
    };
  });

  return {
    inkingTimeReductionEstPct: 82,
    artistBrushDnaSummaryKo: `[AiD & CSP 5.0 하이브리드] '${styleLabel}' 필압 프로파일을 기반으로 러프 스케치를 L4(벡터 선화)·L3(셀 명암)·L2(밑색 ID)·L1(3D 배경 LT) 4개 레이어로 자동 분리해 펜선 공정 시간을 약 82% 단축합니다.`,
    cutSpecs,
  };
}

// ---------------------------------------------------------------------------
// 2. Komiko AI & LlamaGen: 30+ 화풍 스타일 트랜스퍼 & 3D 리라이팅 스키마
// ---------------------------------------------------------------------------

export type WebtoonStyleTransferPresetId =
  | "webtoon-pop-cel"
  | "rofan-watercolor-glow"
  | "noir-high-contrast-ink"
  | "classic-bw-screentone"
  | "cyberpunk-neon-rim"
  | "martial-arts-brush-wash";

export const ClaudeStyleTransferCutDirectiveSchema = z.object({
  cutNumber: z.number(),
  stylePresetId: z.enum([
    "webtoon-pop-cel",
    "rofan-watercolor-glow",
    "noir-high-contrast-ink",
    "classic-bw-screentone",
    "cyberpunk-neon-rim",
    "martial-arts-brush-wash",
  ]),
  lineartPreservationPct: z.number(),
  keyLightAzimuthDeg: z.number(),
  keyLightElevationDeg: z.number(),
  colorTemperatureKelvin: z.number(),
  primaryPaletteHexes: z.array(z.string()),
  relightingDirectiveKo: z.string(),
});

export const ClaudeStyleTransferReportSchema = z.object({
  selectedStyleFamilyKo: z.string(),
  ocUniverseConsistencyRuleKo: z.string(),
  cutDirectives: z.array(ClaudeStyleTransferCutDirectiveSchema),
});

export type ClaudeStyleTransferReport = z.infer<typeof ClaudeStyleTransferReportSchema>;

export function buildLocalStyleTransferAndRelighting(
  input: WebtoonProductionAssistInput = {},
  preferredPreset: WebtoonStyleTransferPresetId = "rofan-watercolor-glow",
): ClaudeStyleTransferReport {
  const base = runWebtoonStoryboardMasterPipeline(input);
  const cuts = base.directingResult.cuts.slice(0, 4);
  const cutDirectives = cuts.map((cut, idx) => {
    const isDark = cut.emotion === "rage" || cut.emotion === "shock";
    return {
      cutNumber: cut.cutNumber,
      stylePresetId: preferredPreset,
      lineartPreservationPct: 94,
      keyLightAzimuthDeg: (45 + idx * 30) % 360,
      keyLightElevationDeg: isDark ? 65 : 35,
      colorTemperatureKelvin: isDark ? 3200 : 5600,
      primaryPaletteHexes: isDark
        ? ["#1B192E", "#4A2545", "#D9385E", "#F2A65A"]
        : ["#FFF8F0", "#F4D35E", "#EE964B", "#3D5A80"],
      relightingDirectiveKo: `컷 #${cut.cutNumber} 선화 보존율 94% 잠금 · 주광원 방위각 ${(45 + idx * 30) % 360}° / 고도 ${isDark ? 65 : 35}° 3D 노멀맵 리라이팅 및 역광 림라이트 오버레이`,
    };
  });

  return {
    selectedStyleFamilyKo: `Komiko & LlamaGen 30+ 화풍 패밀리 (${preferredPreset})`,
    ocUniverseConsistencyRuleKo: `${input.protagonistName ?? "서진"}·${input.partnerName ?? "하윤"} OC 유니버스 고유 안구 그라데이션·헤어 하이라이트 링·피부 서브서피스 스캐터링(SSS) 비율을 화풍 변환 후에도 100% 고정합니다.`,
    cutDirectives,
  };
}

// ---------------------------------------------------------------------------
// 3. SkyReels & Mootion: 33종 표정 매트릭스 & 사쿠가 모션웹툰 스키마
// ---------------------------------------------------------------------------

export const ClaudeSakugaMotionCutKeyframeSchema = z.object({
  cutNumber: z.number(),
  expressionMatrixCode: z.string(),
  facsActionUnitsKo: z.string(),
  pupilConstrictionPct: z.number(),
  sakugaMotionCurve: z.enum([
    "ease-in-out-camera-push",
    "whip-pan-speedline",
    "parallax-2.5d-depth-drift",
    "impact-shake-stutter",
    "slow-dolly-vertical-reveal",
  ]),
  durationSec: z.number(),
  shortForm9x16CropGuideKo: z.string(),
});

export const ClaudeSakugaMotionReportSchema = z.object({
  totalTrailerDurationSec: z.number(),
  facialMatrixSummaryKo: z.string(),
  keyframes: z.array(ClaudeSakugaMotionCutKeyframeSchema),
});

export type ClaudeSakugaMotionReport = z.infer<typeof ClaudeSakugaMotionReportSchema>;

export function buildLocalSakugaMotionAndFacialMatrix(
  input: WebtoonProductionAssistInput = {},
): ClaudeSakugaMotionReport {
  const base = runWebtoonStoryboardMasterPipeline(input);
  const cuts = base.directingResult.cuts.slice(0, 4);
  const keyframes = cuts.map((cut, idx) => ({
    cutNumber: cut.cutNumber,
    expressionMatrixCode: `EXP-${String((idx % 33) + 1).padStart(2, "0")}-${cut.emotion.toUpperCase()}`,
    facsActionUnitsKo: "AU1+AU2(눈썹 거상) · AU5(상안검 확장) · 하안검 미세 떨림 12Hz",
    pupilConstrictionPct: cut.emotion === "shock" || cut.emotion === "rage" ? 78 : 42,
    sakugaMotionCurve:
      idx % 2 === 0
        ? ("parallax-2.5d-depth-drift" as const)
        : ("ease-in-out-camera-push" as const),
    durationSec: 2.5,
    shortForm9x16CropGuideKo: `컷 #${cut.cutNumber} 1080×1920 릴스/쇼츠 안전 영역 중앙 65%에 안구 클로즈업 고정 후 L1 배경과 L4 인물 레이어 간 Z축 패럴랙스 18% 분리`,
  }));

  return {
    totalTrailerDurationSec: Number((keyframes.length * 2.5).toFixed(1)),
    facialMatrixSummaryKo:
      "[SkyReels 33-Expression & Mootion Sakuga] 33종 미세 안면 근육(FACS) 매트릭스와 2.5D 레이어 패럴랙스·사쿠가 카메라 무빙 곡선을 결합해 정지 원고를 9:16 숏폼 트레일러 및 모션웹툰으로 즉시 변환합니다.",
    keyframes,
  };
}

// ---------------------------------------------------------------------------
// 4. 클립스튜디오 3.0~5.0 & Posemaniacs: 3D 핸드·헤드 & 카툰 LT 리그 스키마
// ---------------------------------------------------------------------------

export const Claude3dHandHeadCutRigSchema = z.object({
  cutNumber: z.number(),
  handPosePresetKo: z.string(),
  headPitchDeg: z.number(),
  headYawDeg: z.number(),
  headRollDeg: z.number(),
  posemaniacsForeshorteningRatio: z.number(),
  ltOutlineThreshold: z.number(),
  ltCelShadowThreshold: z.number(),
  riggingGuideKo: z.string(),
});

export const Claude3dHandHeadRigReportSchema = z.object({
  anatomyRigSummaryKo: z.string(),
  cutRigs: z.array(Claude3dHandHeadCutRigSchema),
});

export type Claude3dHandHeadRigReport = z.infer<typeof Claude3dHandHeadRigReportSchema>;

export function buildLocal3dHandHeadPoseAndLtRig(
  input: WebtoonProductionAssistInput = {},
): Claude3dHandHeadRigReport {
  const base = runWebtoonStoryboardMasterPipeline(input);
  const cuts = base.directingResult.cuts.slice(0, 4);
  const cutRigs = cuts.map((cut, idx) => ({
    cutNumber: cut.cutNumber,
    handPosePresetKo:
      idx % 2 === 0
        ? "CSP 5.0 3D 핸드 #04: 전경 단검 역수 파지 + 검지·중지 텐션 분리"
        : "CSP 5.0 3D 핸드 #11: 마력 각성 손바닥 전면 개방 + 손가락 과장 투시",
    headPitchDeg: cut.cameraAngle === "low-angle" ? 18 : cut.cameraAngle === "high-angle" ? -22 : -6,
    headYawDeg: idx % 2 === 0 ? 28 : -32,
    headRollDeg: cut.cameraAngle === "dutch-tilt" ? 14 : 4,
    posemaniacsForeshorteningRatio: cut.cameraAngle === "low-angle" ? 1.45 : 1.2,
    ltOutlineThreshold: 72,
    ltCelShadowThreshold: 58,
    riggingGuideKo: `컷 #${cut.cutNumber} 3D 두상(Pitch/Yaw/Roll) 및 Posemaniacs 근육 데생 투시 고정 후 CSP 5.0 카툰 윤곽선(72) · 셀 그림자(58) LT 자동 추출`,
  }));

  return {
    anatomyRigSummaryKo:
      "[Clip Studio Paint 5.0 & Posemaniacs 3D Rig] 고난도 손 관절(3D Hand)·두개안면 각도(3D Head)·과장 투시 인체 데생(Posemaniacs)과 3D-to-2D 카툰 LT 윤곽선/그림자 임계값을 컷별로 설계합니다.",
    cutRigs,
  };
}

// ---------------------------------------------------------------------------
// 5. Katalist.ai & Anifusion: 시나리오 액션 비트 분해 & 캐릭터 LoRA 시드 락 스키마
// ---------------------------------------------------------------------------

export const ClaudeScreenplayActionBeatSchema = z.object({
  beatIndex: z.number(),
  panelGridTemplate: z.enum([
    "vertical-single-bleed",
    "diagonal-split-action",
    "staggered-two-tier",
    "inset-reaction-overlay",
  ]),
  actionBeatSummaryKo: z.string(),
  castAngleLockSpecKo: z.string(),
  modelRouterTarget: z.enum([
    "flux-1-dev-webtoon-lora",
    "animagine-xl-4.0-cel",
    "illustrious-xl-lineart",
  ]),
  loraWeight: z.number(),
  reaObligationId: z.string(),
});

export const ClaudeScreenplayLoraBridgeReportSchema = z.object({
  pipelineCompatibilityScore: z.number(),
  mcpBridgeSummaryKo: z.string(),
  actionBeats: z.array(ClaudeScreenplayActionBeatSchema),
});

export type ClaudeScreenplayLoraBridgeReport = z.infer<
  typeof ClaudeScreenplayLoraBridgeReportSchema
>;

export function buildLocalScreenplayBeatAndLoraLock(
  input: WebtoonProductionAssistInput = {},
): ClaudeScreenplayLoraBridgeReport {
  const base = runWebtoonStoryboardMasterPipeline(input);
  const trigger = input.triggerWord ?? base.resolvedArtistStyle.triggerWord;
  const cuts = base.directingResult.cuts.slice(0, 4);
  const actionBeats = cuts.map((cut, idx) => ({
    beatIndex: cut.cutNumber,
    panelGridTemplate:
      idx === 0
        ? ("vertical-single-bleed" as const)
        : idx % 2 === 1
          ? ("diagonal-split-action" as const)
          : ("inset-reaction-overlay" as const),
    actionBeatSummaryKo: `비트 #${cut.cutNumber}: ${cut.visualBeat || "핵심 서사 액션 비트"}`,
    castAngleLockSpecKo: `${input.protagonistName ?? "서진"} 시드(${trigger}) · 연속 컷 카메라 축 편차 ±15° 이내 잠금`,
    modelRouterTarget:
      idx % 2 === 0
        ? ("flux-1-dev-webtoon-lora" as const)
        : ("animagine-xl-4.0-cel" as const),
    loraWeight: 0.88,
    reaObligationId: `ob_webtoon_cut_${String(cut.cutNumber).padStart(2, "0")}_lora_lock`,
  }));

  return {
    pipelineCompatibilityScore: 98,
    mcpBridgeSummaryKo:
      "[Katalist.ai & Anifusion MCP Bridge] 시나리오 원고를 원자 단위 액션 비트와 패널 그리드 템플릿으로 분해하고, FLUX.1/Animagine 캐릭터 LoRA 가중치(0.88) 및 REA 재구성 의무 원장(Obligation ID)과 1:1 매핑합니다.",
    actionBeats,
  };
}
