/**
 * Wave 52D — ToonStudio 760K+ LOC 전면 Rust/WASM64 · WebGPU · NPU 전환 아키텍처 플래너 공개 배럴.
 */

export {
  CURRENT_RUST_CRATE_BASELINES,
  EXPANSION_PLAN_SCHEMA_VERSION,
  EXPANSION_PLATFORM_PROFILES,
  EXPANSION_RISK_CATALOG,
  EXPANSION_WAVE_PHASES,
  MEASUREMENT_DATE,
  SUBSYSTEM_EXPANSION_SPECS,
  buildRustExpansionExportPayload,
  exportRustExpansionAdrMarkdown,
  exportRustExpansionJson,
  getExpansionPhaseSpec,
  getExpansionPlatformProfile,
  getSubsystemExpansionSpec,
  normalizeExpansionPhase,
  simulateExpansionRoadmap,
  type ActiveExpansionRisk,
  type AddressSpaceMode,
  type AddressSpaceRequirement,
  type CurrentRustCrateBaseline,
  type EngineAllocationLoc,
  type EngineAllocationPct,
  type ExpansionPhaseSpec,
  type ExpansionPlatformProfile,
  type ExpansionRiskCatalogEntry,
  type ExpansionRiskCode,
  type ExpansionRiskSeverity,
  type ExpansionRoadmapSimulation,
  type ExpansionSubsystemId,
  type ExpansionTargetPlatformId,
  type ExpansionWavePhase,
  type RustExpansionPlanExportPayload,
  type SimulateExpansionRoadmapInput,
  type StackAllocationPct,
  type SubsystemExpansionSpec,
  type SubsystemSimulationResult,
  type WasmBundleChunkPlan,
  type WasmLoadStrategy,
} from "./rust-expansion-planner-engine";

export {
  StudioRustExpansionArchitectPanel,
  type StudioRustExpansionArchitectPanelProps,
} from "./StudioRustExpansionArchitectPanel";
