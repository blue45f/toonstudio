import type { CpuIsaDispatchPlan, ExecutionBoundary, ResolvedKernelIsaDispatch } from "./atelier-isa-brush-engine";

/** JS 참조 계산·SVG·명세 문자열 범위다. capability 입력은 probe 결과가 아니다. */
export const ISA_EXECUTION_EVIDENCE = Object.freeze({
  capabilityProbePerformed: false, wasmInstantiated: false, gpuSubmitted: false,
  nativeFfiInvoked: false, documentModified: false, persistencePerformed: false,
} as const);

export interface IsaPlanEvidenceFields {
  readonly executionEvidence: typeof ISA_EXECUTION_EVIDENCE;
  readonly capabilitySource: "caller-assumptions" | "default-design-assumptions";
  readonly plannedBoundary: ExecutionBoundary; readonly plannedWasmStack: readonly string[];
  readonly plannedMemoryAddressingMode: "wasm64-memory64" | "wasm32-tiled-fallback";
  readonly plannedThreadSyncMode: "sab-atomics-wait-async" | "transferable-worker-fallback";
  readonly plannedWorkerPoolSlots: number;
}

type UnannotatedIsaPlan = Omit<CpuIsaDispatchPlan, keyof IsaPlanEvidenceFields | "honestyNoteKo" | "honestyNoteEn">;

/** active*와 기존 메모리·스레드 필드는 계산 계약 호환용 계획 별칭으로만 유지한다. */
export function withIsaExecutionEvidence(plan: UnannotatedIsaPlan, callerAssumptions: boolean): CpuIsaDispatchPlan {
  return {
    ...plan, browserImmediateReady: false, executionEvidence: ISA_EXECUTION_EVIDENCE,
    capabilitySource: callerAssumptions ? "caller-assumptions" : "default-design-assumptions",
    plannedBoundary: plan.activeBoundary, plannedWasmStack: plan.activeWasmStack,
    plannedMemoryAddressingMode: plan.memoryAddressingMode, plannedThreadSyncMode: plan.threadSyncMode,
    plannedWorkerPoolSlots: plan.workerPoolSlots,
    honestyNoteKo: "JS 참조 계산과 SVG·명세 미리보기입니다. SIMD·Relaxed-SIMD·memory64·SAB·FFI는 선택한 프로파일의 계획이며 capability probe, WASM 인스턴스 생성, GPU 제출, 네이티브 호출을 수행하지 않습니다. 기본값이나 전달된 capability 값은 설계 가정입니다. 실제 원고·브러시 적용과 원고 저장도 연동하지 않습니다.",
    honestyNoteEn: "JS reference calculations with SVG and specification previews. SIMD, Relaxed-SIMD, memory64, SAB and FFI are profile plans. No capability probe, WASM instantiation, GPU submission or native call is performed. Default or supplied capability values are design assumptions. Manuscript/brush application and manuscript persistence are not connected.",
  };
}

export type IsaDispatchExportPlan = Omit<CpuIsaDispatchPlan,
  "activeBoundary" | "activeWasmStack" | "memoryAddressingMode" | "threadSyncMode" | "workerPoolSlots" | "kernelDispatches"
> & { readonly kernelDispatches: readonly Omit<ResolvedKernelIsaDispatch, "activeBoundary" | "activeInstructions">[] };

/** JSON·외부 콜백에는 실행처럼 읽히는 기존 호환 별칭을 전달하지 않는다. */
export function serializeIsaDispatchPlan(plan: CpuIsaDispatchPlan): IsaDispatchExportPlan {
  return {
    modelKind: plan.modelKind, siliconBrand: plan.siliconBrand, runtimeBrand: plan.runtimeBrand,
    profile: plan.profile, requestedBoundary: plan.requestedBoundary, plannedBoundary: plan.plannedBoundary,
    browserImmediateReady: false, nativeBridgeRequired: plan.nativeBridgeRequired,
    executionEvidence: plan.executionEvidence, capabilitySource: plan.capabilitySource,
    plannedWasmStack: plan.plannedWasmStack, plannedMemoryAddressingMode: plan.plannedMemoryAddressingMode,
    plannedThreadSyncMode: plan.plannedThreadSyncMode, plannedWorkerPoolSlots: plan.plannedWorkerPoolSlots,
    soaLayout: plan.soaLayout, honestyNoteKo: plan.honestyNoteKo, honestyNoteEn: plan.honestyNoteEn,
    kernelDispatches: plan.kernelDispatches.map((kernel) => ({
      kernelId: kernel.kernelId, nameKo: kernel.nameKo, nameEn: kernel.nameEn,
      domainStageKo: kernel.domainStageKo, domainStageEn: kernel.domainStageEn,
      plannedBoundary: kernel.plannedBoundary, plannedInstructions: kernel.plannedInstructions,
      browserLoweringSummary: kernel.browserLoweringSummary,
      vectorLaneWidthF32: kernel.vectorLaneWidthF32, vectorLaneWidthI8: kernel.vectorLaneWidthI8,
      soaAlignedBytes: kernel.soaAlignedBytes, soaCacheLines: kernel.soaCacheLines,
    })),
  };
}
