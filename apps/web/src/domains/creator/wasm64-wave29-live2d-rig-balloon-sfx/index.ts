/**
 * Wasm64 Wave 29 Autonomous Cadence 공개 진입점 (`wasm64-wave29-live2d-rig-balloon-sfx`).
 *
 * - `delaunay-puppet-micro-idler`: 무라이선스 2D 들로네 캐릭터 무게중심 케이지 변형기 및
 *   비대칭 눈 깜빡임(`55ms` 감기 / `110ms` ease-out 뜨기)·횡격막-어깨 위상차 호흡·반암시적 오일러 3종 진자 아이들러
 * - `acoustic-korean-sfx-path-synth`: 오디오 포락선 기술자 기반 4종 한국어 웹툰 의성어(`쾅/퍼엉`, `스릉/챙`, `찌릿/파직`, `두근/쿵`)
 *   원근 전단·테이퍼·고대비 이중 외곽선 SVG/Canvas2D 벡터 컨투어 합성기
 * - `scroll-cognitive-load-auditor`: `390×844` 모바일 뷰포트 슬라이딩 인지 부하·대사 과밀 연속 구간(`wall-of-text-streak`) 진단 및
 *   클리프행어 긴장도를 보존하는 백색·암색 스크롤 호흡 여백 최적화 감사기
 *
 * 주의: 스튜디오 초기 번들 영향 `0B` 및 서버 비용 `₩0` 유지를 위해 최상위 부작용 없이 순수 심볼만 내보낸다.
 */

export {
  buildDelaunayPuppetMesh,
  computeMeanValueCageWeights,
  computeTriangleSignedArea2D,
  createInitialPuppetIdlerState,
  evaluateAsymmetricBlinkCurve,
  evaluatePhaseLaggedBreathing,
  inspectPuppetMeshTopology,
  stepPendulumChainSemiImplicitEuler,
  stepPuppetMicroIdler,
  type AsymmetricBlinkOptions,
  type AsymmetricBlinkSample,
  type BreathingCurveOptions,
  type BreathingLiftSample,
  type DelaunayPuppetMesh,
  type PendulumChainKind,
  type PendulumChainSpec,
  type PendulumChainState,
  type PuppetIdlerState,
  type PuppetLayerRegion,
  type PuppetMeshBuildOptions,
  type PuppetMeshTopologyReport,
  type PuppetMicroIdlerFrameResult,
  type PuppetMicroIdlerStepInput,
  type PuppetPoint2D,
  type PuppetVertexSkinWeights,
} from "./delaunay-puppet-micro-idler";

export {
  classifyAcousticKoreanSfx,
  extractAcousticEnvelopeFromPcm,
  serializeSfxCommandsToSvgPath,
  synthesizeKoreanSfxContour,
  type AcousticEnvelopeDescriptor,
  type DoubleOutlineOffsetMetadata,
  type KoreanSfxLexeme,
  type KoreanSfxStyle,
  type PerspectiveShearMetadata,
  type SfxBoundingBox,
  type SfxClassificationResult,
  type SfxOklchTone,
  type SfxPathCommand,
  type SfxSynthesisOptions,
  type StrokeTaperProfile,
  type StrokeTaperSample,
  type SynthesizedKoreanSfxContour,
} from "./acoustic-korean-sfx-path-synth";

export {
  applyGutterRecommendations,
  auditEpisodeScrollCognitiveLoad,
  countReadableDialogueChars,
  type CutPacingBeat,
  type EpisodeCutSpec,
  type EpisodeScrollAuditMetrics,
  type EpisodeScrollStripInput,
  type GutterInsertionRecommendation,
  type ScrollCognitiveAuditOptions,
  type ScrollCognitiveLoadAuditReport,
  type ScrollGutterTone,
  type SpeechBalloonSpec,
  type ViewportScreenLoadSample,
  type WallOfTextStreakFinding,
} from "./scroll-cognitive-load-auditor";
