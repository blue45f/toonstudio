/**
 * Wasm64 Wave 30 Grand Milestone — 초격차 역량 레지스트리 · 36항목 마스터 출고 게이트 ·
 * 팬리스 발열·배터리 품질 거버너 통합 배럴 진입점 (`wasm64-wave30-grand-milestone-verify`).
 *
 * - `supergap-wave-capability-registry`: Waves 1–30 순수 디스크립터 카탈로그(`0B` 초기 번들 추가, `₩0` 서버 비용)
 *   및 하드웨어 3계층(`tier-1` · `tier-2` · `tier-3`) 결정론적 폴백 리졸버
 * - `episode-master-preflight-gate`: 6대 채널 × 6개 검사 = 총 36개 마스터 회차 프리플라이트 출고 심사기
 *   및 FNV-1a / FIPS 180-4 SHA-256 준비 상태 지문 산출기
 * - `tablet-thermal-battery-governor`: 데드밴드·유지 틱 히스테리시스를 갖춘 태블릿 발열·배터리 품질 거버너
 *   (모든 발열·배터리 조건에서 `stylusSamplingUnthrottled === true` 절대 불변식 보장)
 *
 * 주의: 초기 스튜디오 셸에서 정적 import하지 않고 필요 시점에만 지연 로드한다(`0B` 초기 번들 영향).
 */

export {
  auditWaveCapabilityCatalog,
  getWaveCapabilityDescriptor,
  HARDWARE_EXECUTION_TIERS,
  listWaveDescriptorsByDomain,
  listWaveDescriptorsByMaturity,
  MAX_ALLOWED_WAVE_IDLE_BUDGET_MS,
  resolveHardwareExecutionTier,
  SUPERGAP_TOTAL_WAVES,
  SUPERGAP_WAVE_DOMAINS,
  SUPERGAP_WAVE_MATURITIES,
  SUPERGAP_WAVES_1_TO_30_CATALOG,
  TIER1_MIN_DEVICE_MEMORY_GB,
  TIER2_MIN_DEVICE_MEMORY_GB,
  WAVE_EXECUTION_MODES,
  type DeviceCapabilityProbe,
  type HardwareExecutionTier,
  type HardwareTierResolution,
  type SubsystemRoutingPlan,
  type SuperGapWaveDescriptor,
  type SuperGapWaveDomain,
  type SuperGapWaveMaturity,
  type WaveCatalogAuditReport,
  type WaveExecutionMode,
  type WaveTierExecutionEntry,
} from "./supergap-wave-capability-registry";

export {
  AUDIO_TRUE_PEAK_BLOCK_CEILING_DBTP,
  computePreflightFnv1a32Hex,
  computePreflightSha256Hex,
  createCleanEpisodePreflightInput,
  evaluateEpisodeMasterPreflightGate,
  PREFLIGHT_CATEGORIES,
  PREFLIGHT_CHECKS_PER_CATEGORY,
  PREFLIGHT_SEVERITIES,
  PREFLIGHT_TOTAL_CHECKS,
  PRINT_TAC_BLOCK_CEILING_PERCENT,
  type A11yCvdPhotosensitiveInput,
  type AudioLufsTruePeakInput,
  type EpisodeMasterPreflightInput,
  type EpisodeMasterPreflightReport,
  type FontCommercialLicenseState,
  type FontLicenseRecord,
  type PiiZeroLeakInput,
  type PortalSliceGeometryInput,
  type PreflightCategoryId,
  type PreflightCategorySummary,
  type PreflightCheckResult,
  type PreflightSeverity,
  type PrintCmykBleedInput,
  type RightsBomProvenanceInput,
} from "./episode-master-preflight-gate";

export {
  createInitialGovernorState,
  GOVERNOR_PRESSURE_LEVELS,
  GOVERNOR_PROFILE_IDS,
  stepThermalBatteryGovernor,
  TabletThermalBatteryGovernor,
  THERMAL_STATES,
  type GovernorInternalState,
  type GovernorPolicyConfig,
  type GovernorPressureLevel,
  type GovernorProfileId,
  type GovernorStepResult,
  type ShadowCascadeCount,
  type StudioQualityBudget,
  type TargetCanvasHz,
  type ThermalBatteryTelemetryInput,
  type ThermalState,
} from "./tablet-thermal-battery-governor";
