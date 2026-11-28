/**
 * Wasm64 Wave 79 공개 배럴 진입점 (`wasm64-wave79-assistant-checkout-settlement-ledger`).
 *
 * - `scoped-slice-crypto-checkout`: 외부 암호 라이브러리 무의존 순수 동기 FIPS 180-4 SHA-256 +
 *   RFC 2104 HMAC-SHA256 + SHA-256-CTR(Encrypt-then-MAC) 기반 어시스턴트 제로-트러스트
 *   영역·레이어별 암호화 체크아웃 및 원자적 체크인 병합 엔진
 * - `contribution-rights-bom-settlement-ledger`: SHA-256 해시 체인 + 이진 머클 트리 기반
 *   어시스턴트 기여도·Rights BOM 상업 라이선스 게이트 및 국내 웹툰 3대 정산 모델 계산기
 * - `settlement-statement-exporter`: 한국어 정산 명세서 Markdown 표·정규 JSON 영수증 및
 *   참고용 예상 원천징수(3.3%) 계산 내보내기
 */

export {
  ASSISTANT_LAYER_ROLES,
  bytesToHex,
  canonicalSerialize,
  computeLayerSliceDigest,
  constantTimeEqualHex,
  createScopedAssistantCheckoutPackage,
  hexToBytes,
  hmacSha256Hex,
  mergeVerifiedAssistantWorkSlice,
  openScopedAssistantCheckoutPackage,
  sha256Bytes,
  sha256CtrXor,
  sha256Hex,
  submitAssistantWorkSlice,
  utf8Decode,
  utf8Encode,
  type AssignedCutWorkspace,
  type AssistantEditedLayerSlice,
  type AssistantLayerRole,
  type AssistantSubmissionHeader,
  type AssistantWorkSliceSubmission,
  type CreateScopedCheckoutParams,
  type DecryptedCheckoutWorkspace,
  type EpisodeCutRecord,
  type EpisodeLayerRole,
  type EpisodeLayerSlice,
  type ForensicWatermarkTag,
  type MasterEpisodeManuscript,
  type MergeVerifiedWorkSliceParams,
  type MergeVerifiedWorkSliceResult,
  type OpenScopedCheckoutParams,
  type OpenScopedCheckoutResult,
  type ProtectedLayerRole,
  type RedactedStubRecord,
  type ScopedAssistantCheckoutPackage,
  type ScopedCheckoutDenialCode,
  type ScopedCheckoutHeader,
  type SubmitAssistantWorkSliceParams,
} from "./scoped-slice-crypto-checkout";

export {
  AssistantSettlementAuditLedger,
  SettlementPolicyError,
  calculateEpisodeSettlementStatement,
  computeSettlementMerkleRoot,
  evaluateRightsBomComplianceGate,
  verifySettlementLedgerIntegrity,
  type AssistantContributionInput,
  type AssistantSettlementAuditLedgerOptions,
  type AssistantSettlementLineItem,
  type AssistantSettlementRole,
  type CalculateSettlementOptions,
  type EpisodeSettlementPolicy,
  type EpisodeSettlementStatement,
  type HybridRevenueShareSettlementPolicy,
  type MilestoneFixedSettlementPolicy,
  type NormalizedAssistantContribution,
  type PerCutRateSettlementPolicy,
  type RightsBomAssetAttachment,
  type RightsBomAssetCategory,
  type RightsBomBlockerRecord,
  type RightsBomComplianceGateReport,
  type RightsBomLicenseTier,
  type SettlementLedgerEntry,
  type SettlementLedgerSnapshot,
  type SettlementLedgerVerificationResult,
  type SettlementPolicyErrorCode,
} from "./contribution-rights-bom-settlement-ledger";

export {
  FREELANCER_WITHHOLDING_LABEL,
  FREELANCER_WITHHOLDING_TOTAL_RATE,
  TAX_NON_ADVISORY_NOTICE,
  calculateFreelancerWithholdingPreview,
  exportSettlementStatementSummary,
  verifyExportedSettlementReceipt,
  type AssistantWithholdingPreview,
  type CanonicalSettlementReceiptDocument,
  type ExportSettlementStatementOptions,
  type ExportedSettlementStatementBundle,
  type SettlementReceiptTotals,
  type SettlementRightsClearanceSummary,
  type VerifyExportedReceiptResult,
} from "./settlement-statement-exporter";
