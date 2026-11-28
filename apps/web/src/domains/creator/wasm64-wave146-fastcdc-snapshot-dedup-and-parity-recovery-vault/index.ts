/**
 * Wasm64 Wave 146 공개 배럴 진입점 (`wasm64-wave146-fastcdc-snapshot-dedup-and-parity-recovery-vault`).
 *
 * - `fastcdc-rolling-chunker`: 순수 ES2017 FIPS 180-4 SHA-256, 256-엔트리 Gear 롤링 해시 정규화
 *   FastCDC 청커 및 고정 크기 청킹 대비 시프트 내성 비교기
 * - `gf256-parity-and-snapshot-vault`: 원시 다항식 `0x11d` 기반 GF(256) 유한체 산술, RAID-6
 *   이중 패리티(P+Q) 자가 치유 코덱 및 증분 원고 스냅샷 금고(`ManuscriptSnapshotDedupVault`)
 * - `vault-health-svg-and-report`: 순수 `oklch(...)` 금고 건강도 SVG 및 한국어 내구성 QA 브리프
 */

export {
  DEFAULT_FASTCDC_AVG_CHUNK_BYTES,
  DEFAULT_FASTCDC_MAX_CHUNK_BYTES,
  DEFAULT_FASTCDC_MIN_CHUNK_BYTES,
  DEFAULT_FASTCDC_NORMALIZATION_LEVEL,
  canonicalizeVaultJson,
  chunkBufferFastCdc,
  chunkBufferFixedSize,
  compareFixedVsFastCdcDedup,
  computeVaultManifestSha256Hex,
  encodeVaultUtf8Bytes,
  getFastCdcGearTable,
  reassembleChunks,
  resolveFastCdcOptions,
  sha256VaultBytesHex,
  sha256VaultUtf8Hex,
  type ChunkingStrategyDedupMetrics,
  type ContentAddressedChunk,
  type FastCdcChunkingOptions,
  type FastCdcChunkingResult,
  type FixedVsFastCdcComparisonReport,
  type ResolvedFastCdcOptions,
} from "./fastcdc-rolling-chunker";

export {
  DEFAULT_VAULT_STRIPE_DATA_SHARDS,
  GF256_PRIMITIVE_POLYNOMIAL,
  MAX_DUAL_PARITY_DATA_SHARDS,
  ManuscriptSnapshotDedupVault,
  decodeAndHealDualParityStripe,
  encodeDualParityStripe,
  gf256Add,
  gf256Div,
  gf256GeneratorPow,
  gf256Inv,
  gf256Mul,
  type DualParityHealResult,
  type DualParityHealStatus,
  type DualParityStripe,
  type SnapshotCommitRecord,
  type SnapshotRestoreResult,
  type SnapshotVaultOptions,
  type VaultCompactionReport,
  type VaultHealthSnapshot,
  type VaultScrubAndHealReport,
  type VaultStripeHealthSummary,
  type VaultStripeScrubEntry,
} from "./gf256-parity-and-snapshot-vault";

export {
  escapeVaultXml,
  renderSnapshotVaultHealthSvg,
  summarizeSnapshotVaultHealthKo,
  type SnapshotVaultHealthReportKo,
  type SnapshotVaultHealthSvgOptions,
  type VaultHealthGrade,
} from "./vault-health-svg-and-report";
