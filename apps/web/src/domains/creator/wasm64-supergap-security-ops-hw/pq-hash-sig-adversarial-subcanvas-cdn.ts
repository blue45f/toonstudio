/**
 * Super-Gap Pillar D 통합 진입점(#14~#17, 전 기능 ₩0 로컬 완결).
 *
 * - #14 양자내성 하이브리드 해시 서명: SHA-256 WOTS+(w=16, len=67) + WebCrypto ECDSA P-256
 * - #15 선택적 고주파 적대적 방어막: 비텍스트 영역 PSNR >= 40 dB 보장 + 스펙트럼 교란 극대화
 * - #16 제로-트러스트 서브캔버스 부분 위임: AES-GCM-256 범위 암호화 + 범위 밖 수정 차단 + 정산 BOM
 * - #17 R2 + P2P 하이브리드 에셋 캐시 라우터: 로컬 LRU → P2P 메시 → R2 폴백(웜 메시 오프로드 >= 85%)
 */

export {
  base64UrlToBytes,
  bytesToBase64Url,
  bytesToHex,
  canonicalJsonBytes,
  canonicalJsonString,
  concatBytes,
  constantTimeEqual,
  decryptAesGcm256,
  encryptAesGcm256,
  hexToBytes,
  sha256Bytes,
  sha256Hex,
  type AesGcmCipherEnvelope,
} from "./crypto-binary-utils";

export {
  generateWotsPlusKeyPair,
  sealHybridPostQuantumProvenance,
  signWotsPlus,
  verifyHybridPostQuantumProvenance,
  verifyWotsPlus,
  WOTS_PLUS_LEN,
  WOTS_PLUS_LEN1,
  WOTS_PLUS_LEN2,
  WOTS_PLUS_LOG2_W,
  WOTS_PLUS_N,
  WOTS_PLUS_W,
  type GenerateWotsPlusOptions,
  type HybridPostQuantumProvenanceSeal,
  type HybridProvenanceMetadata,
  type HybridProvenancePayload,
  type HybridProvenanceVerificationReport,
  type SealHybridProvenanceOptions,
  type WotsPlusKeyPair,
  type WotsPlusPrivateKey,
  type WotsPlusPublicKey,
  type WotsPlusSignature,
  type WotsPlusSignOptions,
  type WotsPlusVerificationResult,
} from "./pq-hash-signature";

export {
  applyAdversarialProtectionShield,
  computeShieldRgbaPsnr,
  type AdversarialShieldInput,
  type AdversarialShieldMetrics,
  type AdversarialShieldOptions,
  type AdversarialShieldResult,
  type ProtectedTextRect,
} from "./adversarial-shield";

export {
  SubCanvasDelegationManager,
  type AssistantLayerEditInput,
  type AssistantSettlementBom,
  type CreateDelegationRequest,
  type DelegationScopeViolation,
  type DelegationSettlementRates,
  type DelegationViolationCode,
  type EncryptedAssistantSubmission,
  type EncryptedDelegationPackage,
  type IssuedDelegationBundle,
  type MasterCanvasCut,
  type MasterCanvasDocument,
  type MasterCanvasLayer,
  type ScopedDelegatedCut,
  type ScopedDelegatedLayer,
  type ScopedSubCanvasWorkspace,
  type SettlementBomLayerEntry,
  type SubCanvasLayerRole,
  type SubCanvasMergeResult,
} from "./subcanvas-delegation";

export {
  HybridR2P2pAssetCacheRouter,
  type AssetFetchSource,
  type CacheableAssetCategory,
  type ContentAddressedAssetRequest,
  type HybridCacheRouterMetrics,
  type HybridCacheRouterOptions,
  type P2pAssetPeerAdapter,
  type R2EdgeOriginAdapter,
  type RoutedAssetFetchResult,
} from "./r2-p2p-cache-router";
