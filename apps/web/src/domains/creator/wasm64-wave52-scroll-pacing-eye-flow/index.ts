/**
 * Wasm64 Wave 52 공개 진입점 (`wasm64-wave52-scroll-pacing-eye-flow`).
 *
 * - `eye-flow-saccade-simulator`: 컷 내부 말풍선 읽기 순서(좌→우, 상→하), 캐릭터 시선 벡터,
 *   행동선·고대비 포컬 포인트 기반 시선 도약 경로, 역주행 탐지 및 정규화 정체 히트맵(`Float32Array`)
 * - `scroll-tension-rhythm-analyzer`: `375×812` 스마트폰 뷰포트·장르별(액션·로맨스·스릴러·일상)
 *   엄지 스크롤 속도 기반 컷별 체류 시간(초), 긴장감 곡선(`0..1`), 과밀·김빠짐 구간 진단
 * - `gutter-pacing-auto-reflow-planner`: 컷 내부 아트워크 비훼손을 보장하는 컷 간 여백(px) 및
 *   호흡 전환 그라데이션 여백 자동 재배치 플래너
 */

export {
  DEFAULT_CONGESTION_THRESHOLD,
  DEFAULT_HEATMAP_COLS,
  DEFAULT_HEATMAP_ROWS,
  simulatePanelEyeFlow,
  type ActionLineFocalPoint,
  type BacktrackError,
  type BacktrackErrorKind,
  type BalloonEmphasis,
  type CharacterGazeAnchor,
  type CongestionZone,
  type EyeFlowHeatmap,
  type PanelEyeFlowInput,
  type PanelEyeFlowReport,
  type Point2D,
  type ReadingDirection,
  type SaccadeNode,
  type SaccadeNodeKind,
  type SaccadeSegment,
  type SpeakerFlowEvaluation,
  type SpeechBalloonSpec,
} from "./eye-flow-saccade-simulator";

export {
  DEFAULT_MOBILE_VIEWPORT_375X812,
  GENRE_SCROLL_TEMPO_PROFILES,
  analyzeScrollTensionRhythm,
  type CutRhythmMetric,
  type CutRole,
  type GenreScrollTempoProfile,
  type MobileViewportSpec,
  type ScrollCutSpec,
  type ScrollPacingIssue,
  type ScrollPacingIssueKind,
  type ScrollTensionInput,
  type ScrollTensionReport,
  type WebtoonGenre,
} from "./scroll-tension-rhythm-analyzer";

export {
  applyGutterReflowToCuts,
  planGutterPacingReflow,
  verifyNonDestructiveArtworkIntegrity,
  type ArtworkIntegrityVerification,
  type BreathingGradientEasing,
  type BreathingGradientSpec,
  type GutterReflowActionKind,
  type GutterReflowOptions,
  type GutterReflowPatchOp,
  type GutterReflowPlan,
  type ReflowedCutLayout,
} from "./gutter-pacing-auto-reflow-planner";
