/**
 * Wave 52C — 4대 실리콘(Apple·Intel·AMD·Samsung Galaxy) 이기종 WebNN NPU · WebGPU f16 · CPU SIMD 오케스트레이터 공개 배럴.
 */

export {
  FALLBACK_TIER_ORDER,
  HONESTY_DISCLOSURE_EN,
  HONESTY_DISCLOSURE_KO,
  SILICON_DEVICE_PROFILES,
  TOONSTUDIO_HETEROGENEOUS_WORKLOADS,
  buildHeterogeneousRuntimeManifest,
  buildOrtWebSessionOptions,
  exportHeterogeneousManifestJson,
  getSiliconDeviceProfile,
  normalizeRuntimeCapabilityFlags,
  probeHostAcceleratorHints,
  scheduleHeterogeneousWorkloads,
  type AcceleratorLaneId,
  type AcceleratorLaneSummary,
  type AvoidanceGrade,
  type ContentionAvoidanceScore,
  type ExecutionTierId,
  type GuardSeverity,
  type HeterogeneousRuntimeManifest,
  type HeterogeneousWarning,
  type HeterogeneousWarningCode,
  type HeterogeneousWorkloadSchedule,
  type HeterogeneousWorkloadSpec,
  type HostAcceleratorNavigatorLike,
  type HostAcceleratorProbeResult,
  type OrtExecutionProviderName,
  type OrtWebExecutionProviderEntry,
  type OrtWebSessionConfig,
  type RuntimeCapabilityFlags,
  type ScheduledWorkloadAssignment,
  type SiliconDeviceId,
  type SiliconDeviceProfile,
  type SiliconVendorGroup,
  type WebNnPowerPreference,
  type WorkloadContentionWeights,
  type WorkloadId,
  type WorkloadPrecision,
} from "./heterogeneous-npu-engine";

export {
  StudioHeterogeneousSiliconPanel,
  type StudioHeterogeneousSiliconPanelProps,
} from "./StudioHeterogeneousSiliconPanel";
