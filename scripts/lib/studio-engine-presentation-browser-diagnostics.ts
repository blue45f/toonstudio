import type {
  StudioEngineWebGpuPresentationConfigureResult,
  StudioEngineWebGpuPresentationFrameLease,
  StudioEngineWebGpuPresentationProducerReceipt,
  StudioEngineWebGpuPresentationResult,
  StudioEngineWebGpuPresentationSurface,
  StudioEngineWebGpuPresentationSurfaceStats,
} from "../../apps/web/src/domains/creator/render/studio-engine-webgpu-presentation-surface";

export interface BrowserCapabilities {
  readonly webgpu: boolean;
  readonly offscreenCanvas: boolean;
  readonly webgpuCanvasContext: boolean;
  readonly userAgent: string;
}

/** 실제 어댑터 정보를 실패 증거와 성공 보고에 같은 형태로 기록한다. */
export function adapterInfo(adapter: GPUAdapter) {
  const info = adapter.info;
  return {
    vendor: String(info?.vendor ?? ""),
    architecture: String(info?.architecture ?? ""),
    device: String(info?.device ?? ""),
    description: String(info?.description ?? ""),
    isFallbackAdapter:
      typeof adapter.isFallbackAdapter === "boolean"
        ? adapter.isFallbackAdapter
        : null,
  };
}

type PresentationPhase = "initializing" | "before-readback" | "after-readback"
  | "before-present" | "after-present" | "followup-contracts" | "intentional-destroy";
type LossObserver = "device.lost" | "presentation-owner" | "textured-runtime";
interface DeviceLossObservation {
  readonly observer: LossObserver;
  readonly phase: PresentationPhase;
  readonly intentionalDestroyRequested: boolean;
  readonly reason: GPUDeviceLostReason;
  readonly message: string;
}
interface PhaseObservation {
  readonly phase: PresentationPhase;
  readonly owner: StudioEngineWebGpuPresentationSurfaceStats;
}

/** 관찰 callback은 동기 기록만 하며 원래 lost promise와 GPU 소유권을 바꾸지 않는다. */
export function createPresentationDeviceDiagnostics(lostPromise: Promise<GPUDeviceLostInfo>) {
  let phase: PresentationPhase = "initializing";
  let intentionalDestroyRequested = false;
  const losses: DeviceLossObservation[] = [];
  const observations: PhaseObservation[] = [];
  const promiseErrors: { phase: PresentationPhase; message: string }[] = [];
  const recordLoss = (observer: LossObserver, info: GPUDeviceLostInfo): void => {
    losses.push({ observer, phase, intentionalDestroyRequested, reason: info.reason, message: info.message });
  };
  const recordError = (error: unknown): void => {
    promiseErrors.push({ phase, message: error instanceof Error ? error.message : String(error) });
  };
  const whenLossObserved = lostPromise.then(info => recordLoss("device.lost", info)).catch(recordError);
  const observe = (next: PresentationPhase, owner: StudioEngineWebGpuPresentationSurfaceStats): void => {
    phase = next;
    observations.push({ phase, owner: { ...owner } });
  };
  return {
    observe,
    whenLossObserved,
    onOwnerDeviceLost: (info: GPUDeviceLostInfo): void => recordLoss("presentation-owner", info),
    onProducerDeviceLost: (info: GPUDeviceLostInfo): void => recordLoss("textured-runtime", info),
    markIntentionalDestroy(owner: StudioEngineWebGpuPresentationSurfaceStats): void {
      intentionalDestroyRequested = true;
      observe("intentional-destroy", owner);
    },
    snapshot() {
      return {
        phase, intentionalDestroyRequested,
        observations: observations.map(entry => ({ ...entry, owner: { ...entry.owner } })),
        losses: losses.map(entry => ({ ...entry })),
        promiseErrors: promiseErrors.map(entry => ({ ...entry })),
      };
    },
  };
}

export type PresentationDeviceReport = ReturnType<ReturnType<typeof createPresentationDeviceDiagnostics>["snapshot"]>;

/** GPU 객체 자체 대신 프레임 계약과 loss 직전·직후 상태를 JSON으로 남긴다. */
export function initialPresentationFailureEvidence(input: {
  readonly result: StudioEngineWebGpuPresentationResult;
  readonly adapter: GPUAdapter;
  readonly device: GPUDevice;
  readonly canvasFormat: GPUTextureFormat;
  readonly configuration: StudioEngineWebGpuPresentationConfigureResult;
  readonly frame: StudioEngineWebGpuPresentationFrameLease;
  readonly producerReceipt: StudioEngineWebGpuPresentationProducerReceipt;
  readonly presentation: Pick<StudioEngineWebGpuPresentationSurface, "stats" | "visibility">;
  readonly uncapturedErrors: readonly string[];
  readonly lifecycle: ReturnType<typeof createPresentationDeviceDiagnostics>;
}) {
  const { frame } = input;
  return JSON.stringify({
    result: input.result,
    adapter: adapterInfo(input.adapter),
    deviceFeatures: [...input.device.features].sort(),
    canvasFormat: input.canvasFormat,
    configuration: input.configuration,
    frame: {
      requestSequence: frame.requestSequence, deviceEpoch: frame.deviceEpoch,
      presentationEpoch: frame.presentationEpoch, resizeEpoch: frame.resizeEpoch,
      viewportEpoch: frame.viewportEpoch, flipEpoch: frame.flipEpoch,
      sourceFrameFingerprint: frame.sourceFrameFingerprint,
      workSurfaceEpoch: frame.workSurface.workSurfaceEpoch,
      contentAtAcquire: frame.contentAtAcquire,
    },
    producerReceipt: input.producerReceipt,
    owner: input.presentation.stats(),
    visibility: input.presentation.visibility(),
    uncapturedErrors: input.uncapturedErrors,
    deviceLifecycle: input.lifecycle.snapshot(),
  });
}

