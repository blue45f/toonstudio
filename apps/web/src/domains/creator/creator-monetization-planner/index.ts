/**
 * Wave 42C — 독립·프로 웹툰 작가 수익화 퍼널 · 굿즈 MOQ/BEP · 한국 3.3%/10% 정산 · 주간 마감 번아웃 예측 플래너 배럴.
 */

export {
  BURNOUT_SCENARIO_PRESETS,
  DEFAULT_GOODS_UNIT_ECONOMICS_INPUT,
  DEFAULT_KOREAN_SETTLEMENT_INPUT,
  DEFAULT_PAYWALL_FUNNEL_INPUT,
  DEFAULT_STAGE_MINUTES_PER_CUT,
  DEFAULT_WEEKLY_BURNOUT_INPUT,
  GOODS_PRESETS,
  PAYWALL_SCENARIO_PRESETS,
  PRODUCTION_STAGE_CATALOG,
  calculateGoodsUnitEconomics,
  calculateKoreanCreatorSettlement,
  forecastWeeklyBurnoutRisk,
  formatKrw,
  simulatePaywallFunnel,
} from "./monetization-burnout-engine";

export type {
  BurnoutPresetId,
  BurnoutRiskLevel,
  BurnoutScenarioPreset,
  BusinessVatBreakdown,
  DelegationPriority,
  DelegationRecommendation,
  EstimateProvenance,
  FavoredCashflowStructure,
  FreelancerWithholdingBreakdown,
  GoodsItemType,
  GoodsPresetSpec,
  GoodsUnitEconomicsInput,
  GoodsUnitEconomicsResult,
  KoreanCreatorSettlementInput,
  KoreanCreatorSettlementResult,
  MgRecoupmentStatus,
  PaywallFunnelInput,
  PaywallFunnelResult,
  PaywallPreviewStep,
  PaywallScenarioPreset,
  PaywallScenarioPresetId,
  PaywallSensitivityBand,
  PaywallSensitivityBandId,
  ProductionStageId,
  ProductionStageSpec,
  SimulationDataSourceKind,
  StageMinutesMap,
  StageWorkloadBreakdown,
  VatContractMode,
  WeeklyBurnoutForecastResult,
  WeeklyBurnoutInput,
} from "./monetization-burnout-engine";

export {
  StudioCreatorMonetizationPanel,
  type MonetizationPlannerTabId,
  type StudioCreatorMonetizationPanelProps,
} from "./StudioCreatorMonetizationPanel";
