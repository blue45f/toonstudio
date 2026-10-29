/**
 * claude-competitor-full-suite-schemas.ts
 *
 * Phase 5 REA(reverse-engineer-anything) 경쟁사 벤치마크 5대 AI 엔진의
 * Zod 구조화 출력 스키마, 타입 정의 및 로컬 결정적(Deterministic) 폴백 빌더.
 */

import { z } from "zod";

import type { AssistTokenUsage } from "@/shared/ai/assist/assist-models";

import { runWebtoonStoryboardMasterPipeline } from "../studio-webtoon-storyboard-pipeline";
import type { WebtoonProductionAssistInput } from "./assist-webtoon-production-schemas";

export interface CompetitorEngineExecutionMeta<T> {
  readonly report: T;
  readonly source: "claude-live" | "local-fallback";
  readonly modelUsed: string;
  readonly usage: AssistTokenUsage;
  readonly estimatedCostUsd: number;
  readonly fallbackReason?: string;
}

// ---------------------------------------------------------------------------
// 1. 크림 AiD & 클립스튜디오 5.0: 스케치→벡터 선화 & 4레이어 자동 분리 스키마
// ---------------------------------------------------------------------------

export const AssistSketchToLineartCutSpecSchema = z.object({
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

export const AssistSketchToLineartReportSchema = z.object({
  inkingTimeReductionEstPct: z.number(),
  artistBrushDnaSummaryKo: z.string(),
  cutSpecs: z.array(AssistSketchToLineartCutSpecSchema),
});

export type AssistSketchToLineartReport = z.infer<typeof AssistSketchToLineartReportSchema>;

export function buildLocalSketchToLineartLayerSplit(
  input: WebtoonProductionAssistInput = {},
): AssistSketchToLineartReport {
  const base = runWebtoonStoryboardMasterPipeline(input);
  const styleLabel = input.artistLabel ?? base.resolvedArtistStyle.artistLabel;
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

export const AssistStyleTransferCutDirectiveSchema = z.object({
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

export const AssistStyleTransferReportSchema = z.object({
  selectedStyleFamilyKo: z.string(),
  ocUniverseConsistencyRuleKo: z.string(),
  cutDirectives: z.array(AssistStyleTransferCutDirectiveSchema),
});

export type AssistStyleTransferReport = z.infer<typeof AssistStyleTransferReportSchema>;

export function buildLocalStyleTransferAndRelighting(
  input: WebtoonProductionAssistInput = {},
  preferredPreset: WebtoonStyleTransferPresetId = "rofan-watercolor-glow",
): AssistStyleTransferReport {
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

export const AssistSakugaMotionCutKeyframeSchema = z.object({
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

export const AssistSakugaMotionReportSchema = z.object({
  totalTrailerDurationSec: z.number(),
  facialMatrixSummaryKo: z.string(),
  keyframes: z.array(AssistSakugaMotionCutKeyframeSchema),
});

export type AssistSakugaMotionReport = z.infer<typeof AssistSakugaMotionReportSchema>;

export function buildLocalSakugaMotionAndFacialMatrix(
  input: WebtoonProductionAssistInput = {},
): AssistSakugaMotionReport {
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

export const Assist3dHandHeadCutRigSchema = z.object({
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

export const Assist3dHandHeadRigReportSchema = z.object({
  anatomyRigSummaryKo: z.string(),
  cutRigs: z.array(Assist3dHandHeadCutRigSchema),
});

export type Assist3dHandHeadRigReport = z.infer<typeof Assist3dHandHeadRigReportSchema>;

export function buildLocal3dHandHeadPoseAndLtRig(
  input: WebtoonProductionAssistInput = {},
): Assist3dHandHeadRigReport {
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

export const AssistScreenplayActionBeatSchema = z.object({
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

export const AssistScreenplayLoraBridgeReportSchema = z.object({
  pipelineCompatibilityScore: z.number(),
  mcpBridgeSummaryKo: z.string(),
  actionBeats: z.array(AssistScreenplayActionBeatSchema),
});

export type AssistScreenplayLoraBridgeReport = z.infer<
  typeof AssistScreenplayLoraBridgeReportSchema
>;

export function buildLocalScreenplayBeatAndLoraLock(
  input: WebtoonProductionAssistInput = {},
): AssistScreenplayLoraBridgeReport {
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
    actionBeatSummaryKo: `비트 #${cut.cutNumber}: ${cut.summary || "핵심 서사 액션 비트"}`,
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

// ---------------------------------------------------------------------------
// 6. 360° 5뷰(정면·좌/우 측면·후면·반측면) 턴어라운드 정투영 비율 & 장신구/문양 기하 일관성 고정기
// ---------------------------------------------------------------------------

export const AssistTurnaroundOrthographicViewSpecSchema = z.object({
  viewAngle: z.enum([
    "front-0deg",
    "three-quarter-45deg",
    "profile-left-90deg",
    "profile-right-270deg",
    "back-180deg",
  ]),
  headToBodyRatio: z.number(),
  eyeLineYRatioPct: z.number(),
  shoulderWidthHeadUnits: z.number(),
  pelvisLineYRatioPct: z.number(),
  visibleAsymmetricAnchorKo: z.string(),
  occludedFeaturesKo: z.string(),
  orthographicLockDirectiveKo: z.string(),
});

export const AssistTurnaroundOrthographicReportSchema = z.object({
  orthographicConsistencyScore: z.number(),
  characterName: z.string(),
  turnaroundSummaryKo: z.string(),
  views: z.array(AssistTurnaroundOrthographicViewSpecSchema),
});

export type AssistTurnaroundOrthographicReport = z.infer<
  typeof AssistTurnaroundOrthographicReportSchema
>;

export function buildLocalTurnaroundOrthographicSheetLock(
  input: WebtoonProductionAssistInput = {},
): AssistTurnaroundOrthographicReport {
  const protagonist = (input.protagonistName ?? "서진").trim() || "서진";
  const views: z.infer<typeof AssistTurnaroundOrthographicViewSpecSchema>[] = [
    {
      viewAngle: "front-0deg",
      headToBodyRatio: 7.5,
      eyeLineYRatioPct: 6.8,
      shoulderWidthHeadUnits: 2.1,
      pelvisLineYRatioPct: 48.0,
      visibleAsymmetricAnchorKo: "Anatomical L(화면 우측) 눈 밑 사선 흉터 · 우측 어깨 황금 견장 · 좌측 허리 흑철 검집",
      occludedFeaturesKo: "등 중앙 봉인 문양 · 후면 망토 자수 가림",
      orthographicLockDirectiveKo: `${protagonist} 정면(0°) 7.5등신 수평 기준선(정수리·안구·쇄골·골반·발끝) 고정`,
    },
    {
      viewAngle: "three-quarter-45deg",
      headToBodyRatio: 7.5,
      eyeLineYRatioPct: 6.8,
      shoulderWidthHeadUnits: 1.85,
      pelvisLineYRatioPct: 48.0,
      visibleAsymmetricAnchorKo: "우측 어깨 견장 입체 돌출 · 좌측 눈 밑 흉터 원근 단축(0.72x) 유지",
      occludedFeaturesKo: "좌측 후면 허리춤 단검 파우치 절반 가림",
      orthographicLockDirectiveKo: "반측면(45°) 콧대 돌출 각도 28° 및 양안 너비 비율 1 : 0.68 정투영 잠금",
    },
    {
      viewAngle: "profile-left-90deg",
      headToBodyRatio: 7.5,
      eyeLineYRatioPct: 6.8,
      shoulderWidthHeadUnits: 1.15,
      pelvisLineYRatioPct: 48.0,
      visibleAsymmetricAnchorKo: "좌측 눈 밑 사선 흉터 100% 노출 · 좌측 허리 흑철 검집 손잡이 각도 32°",
      occludedFeaturesKo: "우측 어깨 황금 견장 완전 가림(차폐 규칙 적용)",
      orthographicLockDirectiveKo: "좌측면(90°) 귀-어깨-복사뼈 수직 중력선 정렬 및 좌측 검집 위치 고정",
    },
    {
      viewAngle: "profile-right-270deg",
      headToBodyRatio: 7.5,
      eyeLineYRatioPct: 6.8,
      shoulderWidthHeadUnits: 1.15,
      pelvisLineYRatioPct: 48.0,
      visibleAsymmetricAnchorKo: "우측 어깨 황금 견장 문양 100% 노출 · 우측 옆머리 브릿지 레이어",
      occludedFeaturesKo: "좌측 눈 밑 흉터 및 좌측 허리 검집 본체 차폐",
      orthographicLockDirectiveKo: "우측면(270°) 좌우 반전 금지 — 좌측 흉터가 우측 뺨에 나타나지 않도록 마스킹",
    },
    {
      viewAngle: "back-180deg",
      headToBodyRatio: 7.5,
      eyeLineYRatioPct: 6.8,
      shoulderWidthHeadUnits: 2.1,
      pelvisLineYRatioPct: 48.0,
      visibleAsymmetricAnchorKo: "등 중앙 창염(蒼炎) 육각 인장 · 후면 기준 좌측 허리 검집 끝단 노출",
      occludedFeaturesKo: "안면 이목구비 및 전면 가슴 브로치 차폐",
      orthographicLockDirectiveKo: "후면(180°) 시점 전환 시 Anatomical L/R 역전 반영(좌측 허리 검집이 화면 좌측에 위치)",
    },
  ];

  return {
    orthographicConsistencyScore: 98,
    characterName: protagonist,
    turnaroundSummaryKo: `[360° 5-View Orthographic Turnaround Lock] ${protagonist}의 정면(0°)·반측면(45°)·좌측면(90°)·우측면(270°)·후면(180°) 5뷰 정투영 수평 등신대 기준선과 비대칭 장신구/흉터/검집 차폐 규칙을 100% 동기화합니다.`,
    views,
  };
}

// ---------------------------------------------------------------------------
// 7. 3D 배경 투시 그리드(1/2/3점 소실점) ↔ 2D 인물 발 접지(Foot Contact) · 가구/문틀 스케일 감독
// ---------------------------------------------------------------------------

export const AssistBackgroundPerspectiveCutLockSchema = z.object({
  cutNumber: z.number(),
  vanishingPointMode: z.enum([
    "1-point-corridor",
    "2-point-architectural",
    "3-point-vertical-vertigo",
  ]),
  horizonLineYRatioPct: z.number(),
  cameraFovMm: z.number(),
  footContactShadowSpecKo: z.string(),
  propScaleRatioAnchorKo: z.string(),
  floatingCharacterFixKo: z.string(),
});

export const AssistBackgroundPerspectiveReportSchema = z.object({
  perspectiveAlignmentScore: z.number(),
  spatialIntegrationSummaryKo: z.string(),
  cutLocks: z.array(AssistBackgroundPerspectiveCutLockSchema),
});

export type AssistBackgroundPerspectiveReport = z.infer<
  typeof AssistBackgroundPerspectiveReportSchema
>;

export function buildLocalBackgroundPerspectivePropScaleLock(
  input: WebtoonProductionAssistInput = {},
): AssistBackgroundPerspectiveReport {
  const base = runWebtoonStoryboardMasterPipeline(input);
  const cuts = base.directingResult.cuts.slice(0, 4);
  const cutLocks = cuts.map((cut, idx) => {
    const isExtreme = cut.cameraAngle === "low-angle" || cut.cameraAngle === "high-angle";
    return {
      cutNumber: cut.cutNumber,
      vanishingPointMode: isExtreme
        ? ("3-point-vertical-vertigo" as const)
        : idx % 2 === 0
          ? ("2-point-architectural" as const)
          : ("1-point-corridor" as const),
      horizonLineYRatioPct:
        cut.cameraAngle === "low-angle" ? 74 : cut.cameraAngle === "high-angle" ? 24 : 46,
      cameraFovMm: isExtreme ? 24 : 35,
      footContactShadowSpecKo: `컷 #${cut.cutNumber} 3D 바닥 그리드 법선 벡터에 양 발바닥 접지 각도 동기화 + 코어 접지 그림자(AO 6px, 불투명도 78%) 강제 생성`,
      propScaleRatioAnchorKo:
        "문틀 높이(210cm) : 주인공 신장(184cm, 0.88배) · 책상 높이(74cm, 골반선 아래 12cm) · 찻잔/검 자루 손바닥 너비(9cm) 비례 고정",
      floatingCharacterFixKo:
        "3D 배경 화각(FOV)과 2D 인물 정강이 단축 비율 불일치로 인한 공중부양 착시를 제거하기 위해 발뒤꿈치 Y좌표를 3D 타일 교차점에 스냅",
    };
  });

  return {
    perspectiveAlignmentScore: 96,
    spatialIntegrationSummaryKo:
      "[3D Background Perspective & Prop Scale Lock] SketchUp/Snaptoon/Blender 3D 배경의 지평선(Eye-Level)·1/2/3점 소실점 그리드와 2D 작화 인물의 발 접지(Foot Contact AO)·문틀/가구/소품 인체 비례를 컷마다 오차 없이 정렬합니다.",
    cutLocks,
  };
}

// ---------------------------------------------------------------------------
// 8. 말풍선·효과음(SFX) 안면/눈빛/핵심 액션 비가림(Anti-Occlusion) 안전 영역 & 꼬리 벡터 고정기
// ---------------------------------------------------------------------------

export const AssistSpeechBubbleTailCutLockSchema = z.object({
  cutNumber: z.number(),
  speakerName: z.string(),
  safeAnchorZone: z.enum([
    "top-left-sky-margin",
    "top-right-negative-space",
    "bottom-left-gutter-edge",
    "bottom-right-diagonal-flow",
  ]),
  faceAndEyeOcclusionPct: z.number(),
  tailTargetMouthAngleDeg: z.number(),
  sfxZIndexLayer: z.enum([
    "behind-character-in-front-of-bg",
    "foreground-corner-bleed",
  ]),
  antiOcclusionDirectiveKo: z.string(),
});

export const AssistSpeechBubbleTailOcclusionReportSchema = z.object({
  antiOcclusionHealthScore: z.number(),
  letteringSpatialSummaryKo: z.string(),
  cutBubbleLocks: z.array(AssistSpeechBubbleTailCutLockSchema),
});

export type AssistSpeechBubbleTailOcclusionReport = z.infer<
  typeof AssistSpeechBubbleTailOcclusionReportSchema
>;

export function buildLocalSpeechBubbleTailOcclusionLock(
  input: WebtoonProductionAssistInput = {},
): AssistSpeechBubbleTailOcclusionReport {
  const base = runWebtoonStoryboardMasterPipeline(input);
  const protagonist = (input.protagonistName ?? "서진").trim() || "서진";
  const cuts = base.directingResult.cuts.slice(0, 4);
  const cutBubbleLocks = cuts.map((cut, idx) => ({
    cutNumber: cut.cutNumber,
    speakerName: cut.speaker || protagonist,
    safeAnchorZone:
      idx % 2 === 0
        ? ("top-left-sky-margin" as const)
        : ("bottom-right-diagonal-flow" as const),
    faceAndEyeOcclusionPct: 0,
    tailTargetMouthAngleDeg: idx % 2 === 0 ? 132 : -48,
    sfxZIndexLayer: "behind-character-in-front-of-bg" as const,
    antiOcclusionDirectiveKo: `컷 #${cut.cutNumber} 안면·동공·손동작 가림률 0% 강제 잠금 · 말풍선 꼬리 벡터를 ${cut.speaker || protagonist} 입술 중심(${idx % 2 === 0 ? 132 : -48}°)으로 고정하고 SFX는 인물 뒤(L1.5) 레이어로 분리`,
  }));

  return {
    antiOcclusionHealthScore: 99,
    letteringSpatialSummaryKo:
      "[Anti-Occlusion Bubble & SFX Tail Vector Lock] 말풍선과 대형 효과음(SFX)이 캐릭터의 눈빛·표정·비대칭 흉터·무기 타격 지점을 절대 가리지 않도록 네거티브 여백 좌표를 계산하고, 다중 인물 대화 시 말풍선 꼬리가 정확한 화자의 입 방향을 가리키도록 고정합니다.",
    cutBubbleLocks,
  };
}

// ---------------------------------------------------------------------------
// 9. 검격·마법·타격 궤적(Motion Arc) 연속성 · 잔상(Smear Frame) · 타격 역경직(Hit-Stop) 감독
// ---------------------------------------------------------------------------

export const AssistActionWeaponMotionArcCutSchema = z.object({
  cutNumber: z.number(),
  actionPhase: z.enum([
    "anticipation-windup",
    "slash-release-smear",
    "impact-hit-stop",
    "follow-through-recoil",
  ]),
  entryVectorAngleDeg: z.number(),
  exitVectorAngleDeg: z.number(),
  smearStretchRatio: z.number(),
  speedlineConvergencePointKo: z.string(),
  arcContinuityDirectiveKo: z.string(),
});

export const AssistActionWeaponMotionArcReportSchema = z.object({
  kineticContinuityScore: z.number(),
  combatChoreographySummaryKo: z.string(),
  cutArcs: z.array(AssistActionWeaponMotionArcCutSchema),
});

export type AssistActionWeaponMotionArcReport = z.infer<
  typeof AssistActionWeaponMotionArcReportSchema
>;

export function buildLocalActionWeaponMotionArcSmearLock(
  input: WebtoonProductionAssistInput = {},
): AssistActionWeaponMotionArcReport {
  const base = runWebtoonStoryboardMasterPipeline(input);
  const cuts = base.directingResult.cuts.slice(0, 4);
  const phases: z.infer<typeof AssistActionWeaponMotionArcCutSchema>["actionPhase"][] = [
    "anticipation-windup",
    "slash-release-smear",
    "impact-hit-stop",
    "follow-through-recoil",
  ];
  const cutArcs = cuts.map((cut, idx) => {
    const phase = phases[idx % phases.length]!;
    const entryDeg = idx === 0 ? -45 : idx === 1 ? -45 : idx === 2 ? 135 : 135;
    const exitDeg = idx === 0 ? -45 : idx === 1 ? 135 : idx === 2 ? 135 : -25;
    return {
      cutNumber: cut.cutNumber,
      actionPhase: phase,
      entryVectorAngleDeg: entryDeg,
      exitVectorAngleDeg: exitDeg,
      smearStretchRatio: phase === "slash-release-smear" ? 1.85 : phase === "impact-hit-stop" ? 1.35 : 1.05,
      speedlineConvergencePointKo: `컷 #${cut.cutNumber} 검끝 타격 코어(X: 52%, Y: 44%) 방사형 수렴`,
      arcContinuityDirectiveKo: `컷 #${cut.cutNumber} [${phase}] 진입 궤적(${entryDeg}°) → 이탈 궤적(${exitDeg}°) 벡터 연속성 유지 · 무기 길이 왜곡 방지 및 검기 잔상(Smear) 알파 테이퍼링 적용`,
    };
  });

  return {
    kineticContinuityScore: 97,
    combatChoreographySummaryKo:
      "[Kinetic Action Arc & Smear Continuity Director] 예비 동작(Wind-up) → 참격 궤적(Slash Smear) → 타격 역경직(Hit-Stop) → 잔심(Follow-through) 4단계 액션 컷 사이에서 검기/마법 궤적 각도가 갑자기 끊기거나 뒤집히지 않도록 진입·이탈 벡터를 수학적으로 연결합니다.",
    cutArcs,
  };
}

// ---------------------------------------------------------------------------
// 10~13. Wave 11 창의적 웹툰 일관성 AI 엔진 4종 (말/마차/차량 탑승 · 마법진 기하 · 식기/음료 수위 · 거울/수면 반사)
// ---------------------------------------------------------------------------

export const AssistVehicleSteedHarnessReportSchema = z.object({
  mountOrVehicleNameKo: z.string(),
  riderProportionRatioScore: z.number(),
  steeringOrReinSide: z.enum(["left-hand-driver-lhd", "right-hand-driver-rhd", "dual-rein-stirrup"]),
  stirrupAndSeatHeightAnchorKo: z.string(),
  harnessContinuityRuleKo: z.string(),
});

export type AssistVehicleSteedHarnessReport = z.infer<
  typeof AssistVehicleSteedHarnessReportSchema
>;

export function buildLocalVehicleSteedCarriageHarnessLock(
  input: WebtoonProductionAssistInput = {},
): AssistVehicleSteedHarnessReport {
  const protagonist = (input.protagonistName ?? "서진").trim() || "서진";
  return {
    mountOrVehicleNameKo: "황실 흑마(와이즈 스탤리온) & 4두 마차",
    riderProportionRatioScore: 96,
    steeringOrReinSide: "dual-rein-stirrup",
    stirrupAndSeatHeightAnchorKo: `${protagonist} 기승 시 말 어깨높이(Withers 165cm) 대비 기수 앉은키 비율을 0.54로 고정하고, 발볼이 등자(Stirrup) 고리에 정확히 결착되도록 잠금`,
    harnessContinuityRuleKo:
      "컷 전환 시 재갈(Bit)·고삐(Reins)·안장 흉걸이 가죽끈이 증발하거나 말의 크기가 조랑말처럼 축소되는 스케일 붕괴를 원천 차단합니다.",
  };
}

export const AssistMagicAuraElementalSigilReportSchema = z.object({
  casterName: z.string(),
  sigilPolygonVertices: z.number(),
  innerRuneRingCount: z.number(),
  coreGlowHex: z.string(),
  outerRimAuraHex: z.string(),
  blendLayerMode: z.enum(["Linear Dodge (Add)", "Color Dodge", "Screen"]),
  sigilGeometryLockRuleKo: z.string(),
  consistencyScore: z.number(),
});

export type AssistMagicAuraElementalSigilReport = z.infer<
  typeof AssistMagicAuraElementalSigilReportSchema
>;

export function buildLocalMagicAuraElementalSigilLock(
  input: WebtoonProductionAssistInput = {},
): AssistMagicAuraElementalSigilReport {
  const protagonist = (input.protagonistName ?? "서진").trim() || "서진";
  return {
    casterName: protagonist,
    sigilPolygonVertices: 8,
    innerRuneRingCount: 3,
    coreGlowHex: "#E0F2FE",
    outerRimAuraHex: "#2563EB",
    blendLayerMode: "Linear Dodge (Add)",
    sigilGeometryLockRuleKo: `${protagonist} 고유 8각 성좌 마법진(외곽 3중 고대 룬 링) 기하 도면을 3D 평면 투영으로 고정해, 비스듬한 카메라 앵글에서도 꼭짓점 수(8개)와 회전 방향(시계방향)이 변형되지 않도록 유지합니다.`,
    consistencyScore: 98,
  };
}

export const AssistFoodTablewareBanquetReportSchema = z.object({
  sceneLocationKo: z.string(),
  tablewareLayoutRuleKo: z.string(),
  liquidLevelProgressionKo: z.string(),
  cutleryHandRuleKo: z.string(),
  continuityScore: z.number(),
});

export type AssistFoodTablewareBanquetReport = z.infer<
  typeof AssistFoodTablewareBanquetReportSchema
>;

export function buildLocalFoodTablewareBanquetLock(): AssistFoodTablewareBanquetReport {
  return {
    sceneLocationKo: "황궁 온실 다과회 테이블",
    tablewareLayoutRuleKo:
      "3단 실버 트레이는 테이블 중앙 축(X: 50%)에 고정하고, 찻잔 받침(Saucer)과 티스푼(우측 4시 방향) 위치를 전 컷 유지",
    liquidLevelProgressionKo:
      "1컷(만수위 85%) → 3컷(한 모금 음용 후 55%) → 5컷(잔 내려놓음 30%)으로 홍차 수위가 단조 감소(Monotonic Decrease)하도록 고정해 다음 컷에서 잔이 다시 가득 차는 역전 오류를 차단",
    cutleryHandRuleKo:
      "서양식 커틀러리 기준 오른손 나이프·왼손 포크 파지 규칙을 유지하며 찻잔 손잡이 방향(우측 3시)이 컷마다 뒤집히지 않도록 고정",
    continuityScore: 96,
  };
}

export const AssistMirrorWaterWindowReflectionReportSchema = z.object({
  reflectiveSurfaceType: z.enum(["vanity-mirror", "rain-puddle-water", "night-window-glass"]),
  reflectionSymmetryVerified: z.boolean(),
  normalVectorLawRuleKo: z.string(),
  asymmetricFeatureReflectionKo: z.string(),
  fresnelOpacityPct: z.number(),
  opticalConsistencyScore: z.number(),
});

export type AssistMirrorWaterWindowReflectionReport = z.infer<
  typeof AssistMirrorWaterWindowReflectionReportSchema
>;

export function buildLocalMirrorWaterWindowReflectionLock(
  input: WebtoonProductionAssistInput = {},
): AssistMirrorWaterWindowReflectionReport {
  const protagonist = (input.protagonistName ?? "서진").trim() || "서진";
  return {
    reflectiveSurfaceType: "vanity-mirror",
    reflectionSymmetryVerified: true,
    normalVectorLawRuleKo:
      "입사각과 반사각 일치 법칙에 따라 카메라가 피사체 등 뒤 대각선(35°)에 위치할 때 거울 속 시선이 정면 카메라가 아닌 실제 광학 반사 축을 향하도록 고정",
    asymmetricFeatureReflectionKo: `${protagonist}의 실제 해부학적 왼눈 흉터와 왼쪽 7:3 가르마가 거울 평면 대칭 변환(Plane Symmetry)에 의해 거울상 내부에서도 거울면 기준 동일 깊이·동일 측면에 맺히도록 검증`,
    fresnelOpacityPct: 78,
    opticalConsistencyScore: 98,
  };
}
