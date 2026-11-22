/**
 * 창작자 커머스·컴패니언·출고 검수 도메인 진입 배럴.
 *
 * - 분업·글로벌 마켓 로열티 자동 정산 원장 (`royalty-settlement-calculator`)
 * - QR 멀티 디바이스 컴패니언 브리지 (`companion-device-bridge`)
 * - 출고 전 원고 사전 검수 게이트 (`episode-preflight-gate`)
 */

import {
  runEpisodePreflightGate,
  type EpisodePreflightGateInput,
  type EpisodePreflightGateReport,
} from "./episode-preflight-gate";
import {
  calculateRoyaltySettlement,
  type RoyaltySettlementLedger,
  type RoyaltySettlementRequest,
} from "./royalty-settlement-calculator";

export {
  CURRENCY_SPECS,
  DEFAULT_FX_KRW_PER_MAJOR,
  DEFAULT_ROLE_CUT_WEIGHTS,
  DEFAULT_WITHHOLDING_BPS,
  ROYALTY_SETTLEMENT_SCHEMA_VERSION,
  SUPPORTED_SETTLEMENT_CURRENCIES,
  allocateIntegerPool,
  calculateRoyaltySettlement,
  convertCurrencyMinor,
  exportSettlementStatementCsv,
  exportSettlementStatementJson,
  formatCurrencyMinor,
  fromMinorUnits,
  resolveFxTable,
  toMinorUnits,
  type CurrencySpec,
  type IntegerPoolAllocation,
  type RevenueStreamInput,
  type RevenueStreamKind,
  type RightsBomRoyaltyInput,
  type RoyaltyRecipientEntry,
  type RoyaltySettlementLedger,
  type RoyaltySettlementRequest,
  type SettledRevenueStreamLine,
  type SettlementCurrency,
  type SettlementReconciliationProof,
  type TaxWithholdingProfile,
  type TeamContributorInput,
  type TeamContributorRole,
} from "./royalty-settlement-calculator";

export {
  COMPANION_BRIDGE_URI_SCHEME,
  COMPANION_CAPABILITIES,
  COMPANION_PAIRING_SCHEMA_VERSION,
  CompanionHostBridgeController,
  DEFAULT_COMPANION_BRIDGE_POLICY,
  acceptCompanionPairing,
  advanceBridgeReconnect,
  createBroadcastChannelTransport,
  createCompanionBridgeSession,
  createCompanionPairingPayload,
  createLocalLoopbackTransportPair,
  createWebRtcDataChannelTransport,
  disconnectCompanionBridge,
  dispatchCompanionCommand,
  encodeCompanionPairingUri,
  evaluateBridgeLiveness,
  isPairingPayloadExpired,
  parseCompanionPairingUri,
  recordBridgeHeartbeat,
  refreshBridgeQrPairing,
  requiredCapabilityForCommand,
  type CompanionBridgeCommand,
  type CompanionBridgeConnectionState,
  type CompanionBridgePolicy,
  type CompanionBridgeSessionState,
  type CompanionCamera3dPresetId,
  type CompanionCapability,
  type CompanionCommandDispatchResult,
  type CompanionCommandEnvelope,
  type CompanionPairRequest,
  type CompanionPairingParseResult,
  type CompanionPeerDescriptor,
  type CompanionQrPairingPayload,
  type CompanionRejectionCode,
  type CompanionShortcutAction,
  type CompanionTransitionResult,
  type CompanionTransportAdapter,
  type CompanionTransportKind,
  type CompanionWireFrame,
  type RtcDataChannelLike,
} from "./companion-device-bridge";

/** 출고 사전 검수 게이트와 분업·로열티 정산 원장을 묶은 통합 준비 스냅샷을 계산한다. */
export function createCreatorCommerceDeliverySnapshot(params: {
  readonly preflight: EpisodePreflightGateInput;
  readonly settlement: RoyaltySettlementRequest;
}): {
  readonly preflightReport: EpisodePreflightGateReport;
  readonly settlementLedger: RoyaltySettlementLedger;
} {
  return {
    preflightReport: runEpisodePreflightGate(params.preflight),
    settlementLedger: calculateRoyaltySettlement(params.settlement),
  };
}

export {
  EPISODE_PREFLIGHT_SCHEMA_VERSION,
  FOUR_MAJOR_PLATFORM_SPECS,
  MOBILE_READER_VIEWPORT_WIDTH_PX,
  computeHexDeltaE,
  runEpisodePreflightGate,
  type CharacterCanonicalSwatch,
  type CharacterColorSheetInput,
  type CommercialLicenseAuditStatus,
  type CutCharacterColorSample,
  type EpisodePreflightGateInput,
  type EpisodePreflightGateReport,
  type FlightCheckAiShieldState,
  type FlightCheckBalloon,
  type FlightCheckCategory,
  type FlightCheckCutInput,
  type FlightCheckPlatformId,
  type FlightCheckPlatformSpec,
  type FlightCheckRightsBomItem,
  type PreflightCategorySummary,
  type PreflightGateFinding,
  type PreflightVerdict,
} from "./episode-preflight-gate";
