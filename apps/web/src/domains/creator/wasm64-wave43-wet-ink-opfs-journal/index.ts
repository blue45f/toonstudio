/**
 * Wasm64 Wave 43 공개 진입점 (`wasm64-wave43-wet-ink-opfs-journal`).
 *
 * - `wet-ink-catmull-kalman-predictor`: 120Hz/240Hz 스타일러스 칼만 속도 추정, 구심 Catmull-Rom(`alpha = 0.5`)
 *   1프레임(`4~8ms`) Wet-Ink 꼬리 예측, 무이음새 확정 교체 및 급회전(`> 65°`)·펜 리프트(`pressure < 0.03`) 감쇠기
 * - `webgpu-dirty-scissor-quad-planner`: 브러시 반경 + 안티앨리어싱 여백(`2px`) 더티 영역 계산,
 *   타일 정렬 Scissor Rect 병합(`팽창률 <= 1.25`), 뷰포트 클리핑 및 WebGPU 인스턴스 쿼드 패커(`Float32Array`)
 * - `opfs-atomic-stroke-journal`: `TSWJ` 매직 헤더·버전·`CRC32`·획 시퀀스·ZigZag 가변 길이 델타 압축 및
 *   크래시 꼬리 레코드 자동 절단(Tail Truncation Recovery)을 지원하는 OPFS 무손실 획 저널 코덱
 */

export {
  CENTRIPETAL_CATMULL_ROM_ALPHA,
  createWetInkPredictor,
  DEFAULT_MAX_PREDICTION_DISTANCE_PX,
  DEFAULT_PREDICTION_HORIZON_MS,
  DEFAULT_SPLINE_SUBDIVISIONS,
  evaluateCentripetalCatmullRom,
  MAX_PREDICTION_HORIZON_MS,
  MIN_PREDICTION_HORIZON_MS,
  PEN_LIFT_PRESSURE_THRESHOLD,
  SHARP_TURN_ANGLE_THRESHOLD_DEG,
  WetInkCatmullKalmanPredictor,
  type HorizonClampReason,
  type StylusInputSample,
  type WetInkPoint,
  type WetInkPredictionFrame,
  type WetInkPredictorConfig,
  type WetInkSegment,
  type WetInkStepDiagnostics,
} from "./wet-ink-catmull-kalman-predictor";

export {
  computeRectMergeExpansionRatio,
  computeSegmentAaBounds,
  DEFAULT_AA_MARGIN_PX,
  DEFAULT_SCISSOR_TILE_SIZE_PX,
  FLOATS_PER_PACKED_INSTANCE_QUAD,
  MAX_SCISSOR_MERGE_EXPANSION_RATIO,
  mergeDirtyScissorRects,
  planDirtyScissorInstanceQuads,
  snapAndClipScissorRect,
  type DirtyScissorMergeOptions,
  type DirtyScissorQuadPlan,
  type DirtyScissorQuadPlanOptions,
  type FloatBounds2D,
  type InstancedScissorDrawBatch,
  type ScissorRect,
  type WebGpuViewportSize,
  type WetInkQuadSegmentInput,
} from "./webgpu-dirty-scissor-quad-planner";

export {
  appendStrokeToJournal,
  computeCrc32,
  DEFAULT_COORD_QUANT_SCALE,
  encodeJournalHeader,
  encodeStrokeFrame,
  encodeStrokeJournal,
  JOURNAL_FILE_HEADER_BYTES,
  JOURNAL_FRAME_HEADER_BYTES,
  recoverAndDecodeStrokeJournal,
  STROKE_FRAME_MAGIC,
  STROKE_JOURNAL_MAGIC,
  STROKE_JOURNAL_VERSION,
  zigzagDecode32,
  zigzagEncode32,
  type JournalRgba8,
  type JournalStrokeEntry,
  type JournalStrokePoint,
  type StrokeJournalDecodeResult,
  type StrokeJournalHeaderOptions,
  type StrokeJournalRecoveryStatus,
} from "./opfs-atomic-stroke-journal";
