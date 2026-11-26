/**
 * Wasm64 Wave 9 Zenith 공개 진입점.
 *
 * - `cinematography-pigment-plugin`: 역방향 시네마토그래피 1도 카메라 롤·크롭 코치, 이방성 종이 결·광물 안료
 *   입상화 커널, 권한 격리형 결정론 Wasm 필터 플러그인 호스트
 * - `anthropometric-oled-remaster`: 다회차 캐릭터 비례 이탈(Off-Model) 감지기, OLED 소비전력 인지형 OKLCH
 *   블랙벨벳 톤매퍼(야간 컷 30% 이상 절감), 저해상도->인쇄급(350/600 DPI) 접선 보간 리마스터 파이프라인
 * - `neural-tex-defrag-p2p-e2ee`: 4×4 잠재 코드북 VQ + 2비트 잔차 텍스처 코덱(>36dB PSNR), 연속 실행 병합형
 *   무묘비 분산 CRDT 엔진, 무서버(₩0) ECDH/HKDF/AES-GCM & 머클 트리 P2P 컷 검증기
 *
 * 주의: 초기 엔트리 그래프 영향 `0B` 유지를 위해 필요한 워크벤치·도구 실행 시점에만 동적 로드한다.
 */

export {
  analyzeCinematographyComposition,
  buildDeterministicGrainFilterWasmBinary,
  DeterministicWasmPluginHost,
  inspectAndValidateWasmPluginBinary,
  PAPER_FIBER_PRESETS,
  simulateAnisotropicPaperGranulation,
  type BalloonBoundsInput,
  type BalloonOcclusionFinding,
  type CinematographyMood,
  type CompositionCoachInput,
  type CompositionCoachReport,
  type CompositionSymmetryPreset,
  type CropAdjustmentPlan,
  type FiberDiffusionTensor2d,
  type MineralPigmentSpec,
  type PaperFiberPreset,
  type PaperFiberPresetKind,
  type PigmentGranulationResult,
  type PigmentSimulationInput,
  type Point2d,
  type Rect2d,
  type SandboxHostCapability,
  type SilhouetteSubjectInput,
  type SymmetryAxisAlignment,
  type WasmBinaryInspectionReport,
  type WasmImportDescriptor,
  type WasmPixelFilterRunInput,
  type WasmPixelFilterRunResult,
  type WasmSandboxPolicy,
  type WasmValidationIssue,
} from "./cinematography-pigment-plugin";

export {
  computeOledPanelPowerMetrics,
  detectMultiEpisodeAnthropometricDrift,
  extractAnthropometricRatiosFromLandmarks,
  remasterLowDpiWebtoonCut,
  toneMapOledBlackVelvet,
  type AnthropometricDriftReport,
  type AnthropometricMetricKey,
  type AnthropometricRatioVector,
  type CharacterLandmark2dInput,
  type CharacterModelBaseline,
  type CutAnthropometricFinding,
  type EpisodeCharacterObservation,
  type OledDarkToneMapOptions,
  type OledDarkToneMapResult,
  type OledPanelPowerMetrics,
  type WebtoonPrintRemasterInput,
  type WebtoonPrintRemasterResult,
} from "./anthropometric-oled-remaster";

export {
  buildCutMerkleTree,
  bytesToHex,
  compressTextureLatentCodebook,
  decodeTextureLatentCodebook,
  deriveP2pAesGcmSessionKey,
  evaluateLatentCodebookRoundtrip,
  generateP2pPeerIdentity,
  RunCoalescedSequenceCrdt,
  ServerlessP2pCutVerifierChannel,
  sha256Bytes,
  verifyCutTileMerkleProof,
  WGSL_LATENT_VQ_BLOCK_DECODE,
  type CoalescedRunSegment,
  type CompressedLatentTexturePacket,
  type CrdtRemoteOperation,
  type CutMerkleTreeBundle,
  type CutTileMerkleProof,
  type DefragmentationStats,
  type EncryptedCutTileEnvelope,
  type LatentCodebookCompressOptions,
  type LatentTextureRoundtripMetrics,
  type LogicalItemId,
  type MerkleSiblingStep,
  type P2pPeerCryptoIdentity,
  type SignedCutAttestation,
} from "./neural-tex-defrag-p2p-e2ee";
