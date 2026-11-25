import type { WebNnNpuThermalPlan } from "./webnn-npu-thermal-engine";

/** 고정 계수의 계산 예제이며 브라우저 API나 장치 실행 증거가 아니다. */
export const WEBNN_RUNTIME_EVIDENCE = {
  executionState: "planning-only",
  profileBasis: "illustrative-user-assumptions",
  webnnInvoked: false, graphBuilt: false, npuExecuted: false,
  quantizationExecuted: false, accuracyMeasured: false, zeroCopyVerified: false,
  penHoverListenerAttached: false, temperatureMeasured: false, pressureObserverUsed: false,
  policyApplied: false, frameRateMeasured: false, implementationSupportVerified: false,
  webnnSpecReference: "https://www.w3.org/TR/2026/CRD-webnn-20261120/",
} as const;

export function serializeWebNnPlan(plan: WebNnNpuThermalPlan): string {
  const { compiledGraph: g, thermalSimulation: t, siliconTarget: s, workload: w } = plan;
  const payload = {
    schemaVersion: plan.schemaVersion, modelKind: plan.modelKind, measurementBasis: plan.measurementBasis,
    runtimeEvidence: plan.runtimeEvidence,
    silicon: { id: s.id, name: s.nameEn, executionProvider: s.executionProvider, spatialTileGrid: s.spatialTileGrid, staticShapePaddingRequired: s.staticShapePaddingRequired },
    workload: { id: w.id, name: w.nameEn, inputShape: w.inputShape, compiledShape: g.fusionPass.compiledShape },
    mlContextOptions: { powerPreference: g.mlContextOptions.powerPreference, accelerated: true },
    plannerHints: g.mlContextOptions,
    graphCompilerIr: {
      fusionPass: {
        rawOpCount: g.fusionPass.rawOpCount, fusedOpCount: g.fusionPass.fusedOpCount,
        fusionRatioPct: g.fusionPass.fusionRatioPct, memoryRoundTripReductionPct: g.fusionPass.memoryRoundTripReductionPct,
        fusedBlocks: g.fusionPass.fusedBlocks,
      },
      quantizationPass: g.quantizationPass,
      zeroCopyMlTensor: {
        zeroCopyActive: g.zeroCopyPass.zeroCopyActive, transportMode: g.zeroCopyPass.transportMode,
        cpuReadbackCount: g.zeroCopyPass.cpuReadbackCount, copyOverheadMs: g.zeroCopyPass.copyOverheadMs,
      },
      penHoverWarmup: g.hoverWarmupPass,
      nodes: g.irNodes,
    },
    pidThermalPolicy: {
      gains: t.gains, setpointThermalIndex: t.setpointThermalIndex, cliffThresholdIndex: t.cliffThresholdIndex,
      sustainedMinutes: t.sustainedMinutes, pressureState: t.pressureState, batteryMode: t.batteryMode,
      ambientLoadLevel: t.ambientLoadLevel, finalThermalIndex: t.finalThermalIndex,
      finalThermalHeadroom01: t.finalThermalHeadroom01, pidCliffAvoided: t.pidCliffAvoided,
      maxDegradationTier: t.maxDegradationTier, antiWindupClampCount: t.antiWindupClampCount,
      degradationLadder: plan.degradationLadder,
    },
  };
  return JSON.stringify(payload, null, 2);
}
