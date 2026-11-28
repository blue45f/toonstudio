/**
 * Wasm64 Wave 86 공개 배럴 진입점 (`wasm64-wave86-saliency-reader-pacing-twin`).
 *
 * - `visual-saliency-gaze-model`: 독자 개인정보 수집·전송 없는 로컬 Itti-Koch 다중 스케일
 *   휘도·색채 대립(R-G, B-Y) + 4방향 엣지 오리엔테이션 + 2D FFT 스펙트럼 잔차 시각 현저성 모델,
 *   억제 반환(IOR) 기반 예측 시선 경로(Scanpath), 말풍선 대 배경 시선 탈취 감사기
 * - `reader-scroll-pacing-rehearsal-twin`: 3종 합성 독자 아키타입 기반 모바일(390×844px)
 *   세로 스크롤 속도 곡선, 컷별 체류 시간, 반전 전 호흡 여백(Breath-Hold) 진단 및 장문 과밀·단조 피로 트윈
 * - `saliency-heatmap-and-rehearsal-exporter`: OKLCH 지각 균일 열지도 등고선 + 번호 시선 노드 +
 *   사카드 화살표 비파괴 오버레이 SVG 및 회차 출고 전 리허설 스코어카드 빌더
 */

export {
  DEFAULT_SALIENCY_FEATURE_WEIGHTS,
  LOCAL_VISUAL_SALIENCY_PRIVACY_GUARANTEE,
  auditBalloonFirstGazePriority,
  computePanelVisualSaliencyMap,
  resolveKoreanQuadrantLabel,
  type BalloonGazeAuditInput,
  type BalloonGazeAuditResult,
  type BalloonGazeAuditSeverity,
  type FaceAnchorRegionInput,
  type FixationTargetKind,
  type FocalSubjectRegionInput,
  type PanelRectPx,
  type PanelVisualSaliencyResult,
  type PredictedFixationPoint,
  type RgbaPanelBuffer,
  type SaliencyChannelSummary,
  type SaliencyFeatureWeights,
  type SpeechBalloonRegionInput,
  type VisualSaliencyOptions,
  type VisualSaliencyPrivacyBase,
  type VisualSaliencyPrivacyGuarantee,
} from "./visual-saliency-gaze-model";

export {
  DEFAULT_MOBILE_VIEWPORT_PX,
  PACING_TWIN_DISCLAIMER_KO,
  READER_PACING_ARCHETYPES,
  simulateEpisodeReaderPacingTwin,
  type ArchetypePacingSimulation,
  type CutPacingSimulationPoint,
  type EpisodePacingCutSpec,
  type EpisodeReaderPacingTwinResult,
  type MobileViewportSpec,
  type PacingRiskHotspot,
  type PacingRiskHotspotKind,
  type ReaderPacingArchetypeId,
  type ReaderPacingArchetypeProfile,
  type ScrollVelocitySample,
  type SimulateEpisodeReaderPacingInput,
  type TwistBreathHoldAudit,
} from "./reader-scroll-pacing-rehearsal-twin";

export {
  buildPacingRehearsalReport,
  renderSaliencyScanpathOverlaySvg,
  type BuildPacingRehearsalReportInput,
  type CutGazeAuditEntry,
  type PacingRehearsalScorecard,
  type RehearsalArchetypeSummary,
  type RehearsalPriorityAction,
  type RehearsalReadinessGrade,
  type SaliencyOverlayPalette,
  type SaliencyOverlaySvgInput,
  type SaliencyOverlaySvgResult,
} from "./saliency-heatmap-and-rehearsal-exporter";
