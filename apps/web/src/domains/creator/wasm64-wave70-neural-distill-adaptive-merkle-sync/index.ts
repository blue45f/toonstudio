/**
 * Wasm64 Wave 70 공개 배럴 진입점 (`wasm64-wave70-neural-distill-adaptive-merkle-sync`).
 *
 * - `realtime-weight-distiller`: 저랭크 SVD 전력 반복 분해 + 채널별 대칭 INT8/INT4 비트 패킹 +
 *   온도 스케일 KL 발산 캘리브레이션 기반 온디바이스 신경망 가중치 증류기
 * - `adaptive-focus-ui-brush-controller`: 비의료 창작 인터랙션 텔레메트리 기반 작업 집중 국면 판정,
 *   `>= 82%` 캔버스 점유율·5~9 컨트롤 예산·44px 터치 타깃 불변식 UI/브러시 응답 최적화기
 * - `merkle-crdt-sync-and-model-vault`: 외부 무의존 순수 동기 FIPS 180-4 SHA-256 머클-DAG CRDT
 *   무손실 협업 원장 및 기간·회차·디바이스 한정 서명 리스 기반 제로유출 크리에이터 모델 금고
 */

export {
  computeCosineSimilarity,
  computeTemperatureScaledKlDivergence,
  dequantizeStudentWeightMatrix,
  distillTeacherToStudentWeights,
  evaluateDistilledStudentLayer,
  packInt4Values,
  unpackInt4Values,
  type DecompositionMode,
  type DistillationDomain,
  type DistillationOptions,
  type DistillationVerificationMetrics,
  type DistilledStudentLayer,
  type QuantizationBitWidth,
  type QuantizedMatrixBlock,
  type StudentInferenceResult,
  type TeacherLinearLayer,
} from "./realtime-weight-distiller";

export {
  MAX_CORE_VISIBLE_CONTROLS,
  MIN_CANVAS_VIEWPORT_RATIO,
  MIN_CORE_VISIBLE_CONTROLS,
  MIN_TOUCH_TARGET_PX,
  TOP_CONTEXT_BAR_HEIGHT_PX,
  evaluateAdaptiveStudioFocusState,
  type AdaptiveBrushResponseProfile,
  type AdaptiveFocusOptions,
  type AdaptiveStudioFocusDecision,
  type AdaptiveUiControlSpec,
  type AuxiliaryPanelId,
  type AuxiliaryPanelState,
  type CreatorFocusRegime,
  type CreatorInteractionTelemetry,
  type PanelDisplayMode,
  type StudioToolFamily,
  type StudioViewportContext,
} from "./adaptive-focus-ui-brush-controller";

export {
  MerkleCrdtAssetLedger,
  canonicalSerialize,
  constantTimeEqualHex,
  createScopedVaultInferenceRunner,
  hmacSha256Hex,
  issueVaultLeaseGrant,
  sealCreatorStyleVaultBundle,
  sha256Bytes,
  sha256Hex,
  verifyVaultLeaseGrant,
  type ChainIntegrityAudit,
  type CrdtAssetOperation,
  type CrdtAssetOperationKind,
  type CreatorStyleVaultPolicy,
  type MaterializedAssetState,
  type MerkleCrdtNode,
  type MerkleMergeResult,
  type ScopedVaultInferenceRunner,
  type SealVaultParams,
  type SealVaultResult,
  type SealedCreatorStyleVaultBundle,
  type VaultDenialCode,
  type VaultLeaseGrant,
  type VaultLeaseVerificationResult,
  type VaultRequestedAction,
  type VerifyVaultLeaseParams,
} from "./merkle-crdt-sync-and-model-vault";
