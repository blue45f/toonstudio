/**
 * Wasm64 Wave 25 Acoustic Typography & QA — 한글 혼용 광학 식자·WebCodecs 스크롤 릴 VBV 플래너·실행 취소 거버너 진입점.
 *
 * - `hangul-optical-mixed-kerning`: 한글·영문·숫자·전각 문장부호 광학 커닝, 중심축 `dyEm` 기준선 조화,
 *   Knuth-Plass 동적 계획법 기반 무외톨이(`widowCount === 0`) 말풍선 어절 줄바꿈 엔진
 * - `webcodecs-scroll-muxer-planner`: 60/120fps 세로 웹툰 스크롤 릴 CFR 타임스탬프, 장면 전환 IDR 키프레임,
 *   언더플로·오버플로 0건 Leaky-Bucket VBV 비트레이트 할당기
 * - `undo-command-coalescer-governor`: 180ms 이내 연속 미세 스크럽 병합, 64단계 무손실 핫 윈도 + 로그 키프레임,
 *   128 MiB 상주 RAM 상한 기반 순수 메모리 OPFS 콜드 스필 디스크립터 거버너
 *
 * 주의: 초기 스튜디오 번들에서 정적 import하지 않고 필요 시점에만 지연 로드한다(`0B` 초기 번들 영향).
 */

export {
  CJK_QUOTE_OUTER_HALF_TRIM_EM,
  classifyMixedScriptCodePoint,
  computeBalloonLineWidthProfileEm,
  computeCentralAxisBaselineShiftEm,
  computeOpticalPairKerningEm,
  CONSECUTIVE_CJK_QUOTE_KERN_EM,
  DEFAULT_LATIN_UPPER_OPTICAL_LIFT_EM,
  DEFAULT_TABULAR_DIGIT_OPTICAL_LIFT_EM,
  getNominalGlyphAdvanceEm,
  HANGUL_ALPHANUM_BREATHING_KERN_EM,
  layoutBalloonMixedTypography,
  MAX_CENTRAL_AXIS_OPTICAL_LIFT_EM,
  MIN_CENTRAL_AXIS_OPTICAL_LIFT_EM,
  MIXED_SCRIPT_GLYPH_CLASSES,
  shapeMixedScriptOpticalRun,
  TABULAR_DIGIT_ADVANCE_EM,
  WIDOW_EOJEOL_PENALTY,
  type BalloonContourShape,
  type BalloonTypographyLayoutInput,
  type BalloonTypographyLayoutResult,
  type BalloonTypographyLine,
  type GreedyLineBreakBaseline,
  type MixedScriptGlyphClass,
  type OpticalKerningOptions,
  type OpticalMixedRunResult,
  type OpticalShapedGlyph,
} from "./hangul-optical-mixed-kerning";

export {
  computeCfrTimestampUs,
  computeSceneCutShockScore,
  DEFAULT_INITIAL_VBV_FULLNESS_RATIO,
  DEFAULT_SCENE_CUT_THRESHOLD,
  DEFAULT_SCROLL_REEL_FPS,
  DEFAULT_TARGET_BITRATE_BPS,
  planWebCodecsScrollReelMux,
  SUPPORTED_SCROLL_REEL_FPS,
  type KeyframeDecisionReason,
  type PlannedWebCodecsFrame,
  type ScrollFrameComplexityClass,
  type ScrollReelFps,
  type ScrollReelFrameTelemetry,
  type ScrollVbvBitrateMode,
  type VideoFrameCodingType,
  type WebCodecsScrollMuxPlan,
  type WebCodecsScrollMuxPlannerOptions,
} from "./webcodecs-scroll-muxer-planner";

export {
  computeFnv1a32Hex,
  computeSha256Hex,
  CONTINUOUS_SCRUB_COMMAND_KINDS,
  DEFAULT_COALESCE_WINDOW_MS,
  DEFAULT_HOT_WINDOW_STEPS,
  DEFAULT_MAX_UNDO_RAM_BYTES,
  DISCRETE_BARRIER_COMMAND_KINDS,
  isContinuousScrubKind,
  MAX_COALESCE_WINDOW_MS,
  STUDIO_UNDO_COMMAND_KINDS,
  UndoCommandCoalescerGovernor,
  type ColdRestoreVerificationResult,
  type ColdSpillRestorePlan,
  type ContinuousScrubCommandKind,
  type DiscreteBarrierCommandKind,
  type EmittedOpfsSpillPacket,
  type OpfsColdSpillChunkDescriptor,
  type PropertyStateSnapshot,
  type PushUndoCommandResult,
  type StudioUndoCommandKind,
  type UndoableStudioCommand,
  type UndoGovernorOptions,
  type UndoGovernorSnapshot,
  type UndoReplayOutcome,
  type UndoRetentionTier,
  type UndoStepSummary,
} from "./undo-command-coalescer-governor";
