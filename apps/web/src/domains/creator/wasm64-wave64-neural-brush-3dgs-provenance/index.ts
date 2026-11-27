/**
 * Wasm64 Wave 64 공개 배럴 진입점 (`wasm64-wave64-neural-brush-3dgs-provenance`).
 *
 * - `neural-brush-surrogate-int4`: INT4 대칭 블록 양자화 Neural Operator 브러시 대리 모델
 *   (임파스토·수채 과립화·습식 픽업 패치 결정론적 1ms 미만 추론)
 * - `sketch-to-normal-relighting-3dgs`: 2D 실루엣·선화 → 2.5D 법선·깊이 복원 및
 *   인터랙티브 가상 광원 리라이팅, 3D Gaussian Splatting(3DGS) 만화 배경 NPR 투영·선화 추출기
 * - `zerotrust-merkle-provenance-ledger`: 순수 동기 SHA-256 머클 트리 기반 암호화 자산·저작권
 *   이력 원장(Rights BOM) 및 제로트러스트 멀티테넌트 격리 정책 감사기
 */

export {
  NEURAL_BRUSH_PRESET_PROFILES,
  createNeuralBrushSurrogateModel,
  evaluateNeuralBrushSurrogatePatch,
  int4MatVecMulAdd,
  packInt4WeightMatrix,
  silu,
  unpackInt4WeightMatrix,
  type NeuralBrushLatentState,
  type NeuralBrushPresetId,
  type NeuralBrushPresetProfile,
  type NeuralBrushStrokeInput,
  type NeuralBrushSurrogateModel,
  type NeuralBrushSurrogatePatchMetrics,
  type NeuralBrushSurrogatePatchResult,
  type PackedInt4WeightMatrix,
  type RgbaNormalized,
} from "./neural-brush-surrogate-int4";

export {
  estimateSketchNormalDepthField,
  evaluateSh0Color,
  projectGaussianSplatsToComicNpr,
  relightCanvasFromNormalField,
  type ComicNprExtractionOptions,
  type GaussianSplat3D,
  type GaussianSplatCamera,
  type GaussianSplatComicNprInput,
  type GaussianSplatComicNprResult,
  type GaussianSplatComicNprStats,
  type NeuralRelightInput,
  type NeuralRelightResult,
  type NeuralRelightStats,
  type QuatTuple,
  type RgbByteTuple,
  type RgbNormalized,
  type SketchNormalDepthField,
  type SketchNormalFieldInput,
  type SurfaceInflationProfile,
  type Vec3Tuple,
  type VirtualLightOrb,
} from "./sketch-to-normal-relighting-3dgs";

export {
  auditMultiTenantIsolationPolicy,
  buildAssetProvenanceMerkleLedger,
  bytesToHex,
  canonicalizeJsonValue,
  computeDelegationAttestationSha256,
  constantTimeHexEquals,
  generateMerkleInclusionProof,
  hexToBytes,
  sha256Bytes,
  sha256Hex,
  utf8ToBytes,
  verifyMerkleInclusionProof,
  type AssetLicenseTier,
  type AssetProvenanceMerkleLedger,
  type BuildProvenanceLedgerInput,
  type CrossTenantDelegationToken,
  type IsolationViolationCode,
  type MerkleInclusionProof,
  type MerkleProofStep,
  type MerkleSiblingPosition,
  type MerkleVerificationResult,
  type MultiTenantIsolationAuditInput,
  type MultiTenantIsolationAuditResult,
  type MultiTenantPolicyConfig,
  type ProvenanceAssetEntry,
  type ProvenanceAssetKind,
  type ProvenanceRightsClearanceReport,
  type TenantAccessDecision,
  type TenantAccessRequest,
  type TenantCapability,
  type TenantIsolationViolation,
} from "./zerotrust-merkle-provenance-ledger";
