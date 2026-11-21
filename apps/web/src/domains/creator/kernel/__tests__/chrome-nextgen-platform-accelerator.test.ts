import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  computeTilePolicyForPressure,
  createComputePressureTileGovernor,
  createLowLatencyWideGamut2dContext,
  detectChromeNextGenCapabilities,
  extractHighFreqStylusSamples,
  probeChromeNextGenCapabilitiesAsync,
  probeChromeWebGpuFeatures,
  type LowLatencyCanvasLike,
  type PressureObserverConstructorLike,
  type StylusPointerEventLike,
  type WebGpuNavigatorLike,
} from "../chrome-nextgen-platform-accelerator";

function makeFullChromeEnv(options?: {
  readonly shaderF16?: boolean;
  readonly bgraStorage?: boolean;
}) {
  const shaderF16 = options?.shaderF16 ?? true;
  const bgraStorage = options?.bgraStorage ?? true;
  const features = new Set<string>();
  if (shaderF16) features.add("shader-f16");
  if (bgraStorage) features.add("bgra8unorm-storage");

  const gpu: WebGpuNavigatorLike = {
    async requestAdapter() {
      return {
        features: { has: (name: string) => features.has(name) },
        limits: { maxBufferSize: 2 * 1024 * 1024 * 1024 },
      };
    },
  };

  const mockCanvas: LowLatencyCanvasLike = {
    getContext(_id, settings) {
      return {
        getContextAttributes: () => ({
          colorSpace: settings?.colorSpace ?? "srgb",
          desynchronized: Boolean(settings?.desynchronized),
          alpha: true,
        }),
      };
    },
  };

  return {
    webAssembly: WebAssembly,
    gpu,
    matchMedia: (query: string) => ({ matches: query.includes("p3") }),
    createCanvas: () => mockCanvas,
    hasPointerRawUpdate: true,
    hasCoalescedEvents: true,
    hasPredictedEvents: true,
    crossOriginIsolated: true,
    hasSharedArrayBuffer: true,
    hasAtomics: true,
    hardwareConcurrency: 12,
    hasOpfsGetDirectory: true,
    hasOpfsSyncAccessHandle: true,
    hasVideoEncoder: true,
    hasImageDecoder: true,
    hasPressureObserver: true,
    hasShowSaveFilePicker: true,
  };
}

describe("Chrome 차세대 웹 신기술 통합 프로브 & 어댑터", () => {
  it("UA 스니핑 없이 순수 기능 감지만 수행한다", () => {
    const source = readFileSync(
      new URL("../chrome-nextgen-platform-accelerator.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/userAgentData/u);
    // 주석 외 실행 코드에서 navigator.userAgent 접근 금지
    const strippedComments = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gmu, "");
    expect(strippedComments).not.toMatch(/userAgent/u);
    // compute-pressure 소비처 가드 준수 (직접 import 금지)
    expect(source).not.toMatch(/(?:from\s+|import\s*\(\s*)["'][^"']*compute-pressure["']/u);
  });

  it("Chrome 133+ 풀 스펙 환경에서 8종 신기술을 모두 감지하고 chrome-max-turbo 프로필을 산출한다", async () => {
    const env = makeFullChromeEnv({ shaderF16: true, bgraStorage: true });
    const syncReport = detectChromeNextGenCapabilities(env);
    expect(syncReport.capabilities).toHaveLength(8);
    expect(syncReport.profile.activeCount).toBe(8);
    expect(syncReport.profile.tier).toBe("chrome-max-turbo");
    expect(syncReport.profile.maxMemory64AddressLimitGiB).toBe(16);
    expect(syncReport.profile.recommendedTileSizePx).toBe(1024);
    expect(syncReport.profile.recommendedWorkerCount).toBe(11);
    expect(syncReport.profile.preferredColorSpace).toBe("display-p3");
    expect(syncReport.profile.desynchronizedCanvasRecommended).toBe(true);

    const asyncReport = await probeChromeNextGenCapabilitiesAsync(env);
    expect(asyncReport.profile.webGpu).toEqual({
      apiPresent: true,
      adapterReady: true,
      shaderF16: true,
      bgra8unormStorage: true,
      maxBufferSizeBytes: 2 * 1024 * 1024 * 1024,
    });
    expect(asyncReport.profile.preferredRasterBackend).toBe("webgpu-f16+wasm64");
    expect(asyncReport.capabilities.every((cap) => cap.status === "active")).toBe(true);
  });

  it("구형·제한 환경에서는 예외 없이 standard-compatible 프로필로 안전 강등된다", async () => {
    const report = await probeChromeNextGenCapabilitiesAsync({
      webAssembly: null,
      gpu: null,
      matchMedia: null,
      createCanvas: () => null,
      hasPointerRawUpdate: false,
      hasCoalescedEvents: false,
      hasPredictedEvents: false,
      crossOriginIsolated: false,
      hasSharedArrayBuffer: false,
      hasAtomics: false,
      hardwareConcurrency: 2,
      hasOpfsGetDirectory: false,
      hasOpfsSyncAccessHandle: false,
      hasVideoEncoder: false,
      hasImageDecoder: false,
      hasPressureObserver: false,
      hasShowSaveFilePicker: false,
    });

    expect(report.profile.tier).toBe("standard-compatible");
    expect(report.profile.activeCount).toBe(0);
    expect(report.profile.preferredRasterBackend).toBe("canvas2d-standard");
    expect(report.profile.preferredColorSpace).toBe("srgb");
    expect(report.profile.recommendedTileSizePx).toBe(256);
    expect(report.profile.recommendedWorkerCount).toBe(1);
    expect(report.capabilities.every((cap) => !cap.supported)).toBe(true);
  });

  it("probeChromeWebGpuFeatures는 어댑터 요청 실패 시에도 예외를 던지지 않는다", async () => {
    const result = await probeChromeWebGpuFeatures({
      gpu: {
        async requestAdapter() {
          throw new Error("GPU blocklisted");
        },
      },
    });
    expect(result).toEqual({
      apiPresent: true,
      adapterReady: false,
      shaderF16: false,
      bgra8unormStorage: false,
      maxBufferSizeBytes: null,
    });
  });

  it("createLowLatencyWideGamut2dContext는 Display-P3 + desynchronized 우선 시도 후 실제 부여 속성을 정직하게 반환한다", () => {
    // 1) Display-P3 + desynchronized 모두 지원
    const p3Canvas: LowLatencyCanvasLike = {
      getContext(_id, settings) {
        return {
          getContextAttributes: () => ({
            colorSpace: settings?.colorSpace ?? "srgb",
            desynchronized: Boolean(settings?.desynchronized),
          }),
        };
      },
    };
    const p3Res = createLowLatencyWideGamut2dContext(p3Canvas);
    expect(p3Res.context).not.toBeNull();
    expect(p3Res.colorSpace).toBe("display-p3");
    expect(p3Res.wideGamut).toBe(true);
    expect(p3Res.desynchronized).toBe(true);

    // 2) 브라우저가 display-p3 옵션을 거부(throw)하고 sRGB만 허용할 때 자동 폴백
    const legacyCanvas: LowLatencyCanvasLike = {
      getContext(_id, settings) {
        if (settings?.colorSpace === "display-p3") {
          throw new TypeError("Unsupported colorSpace");
        }
        return {
          getContextAttributes: () => ({
            colorSpace: "srgb",
            desynchronized: false,
          }),
        };
      },
    };
    const fallbackRes = createLowLatencyWideGamut2dContext(legacyCanvas);
    expect(fallbackRes.context).not.toBeNull();
    expect(fallbackRes.colorSpace).toBe("srgb");
    expect(fallbackRes.wideGamut).toBe(false);
    expect(fallbackRes.desynchronized).toBe(false);

    // 3) null 캔버스 안전 처리
    expect(createLowLatencyWideGamut2dContext(null).context).toBeNull();
  });

  it("extractHighFreqStylusSamples는 240Hz+ Coalesced 샘플과 Predicted 선행 샘플을 분리 추출한다", () => {
    const event: StylusPointerEventLike = {
      clientX: 120,
      clientY: 220,
      pressure: 0.7,
      pointerType: "pen",
      getCoalescedEvents: () => [
        { clientX: 110, clientY: 210, pressure: 0.5, tiltX: 12, tiltY: -8, timeStamp: 100.2, pointerType: "pen" },
        { clientX: 115, clientY: 215, pressure: 0.6, tiltX: 14, tiltY: -6, timeStamp: 104.3, pointerType: "pen" },
        { clientX: 120, clientY: 220, pressure: 0.7, tiltX: 15, tiltY: -5, timeStamp: 108.4, pointerType: "pen" },
      ],
      getPredictedEvents: () => [
        { clientX: 125, clientY: 225, pressure: 0.75, timeStamp: 112.5, pointerType: "pen" },
        { clientX: 130, clientY: 230, pressure: 0.8, timeStamp: 116.6, pointerType: "pen" },
        { clientX: 135, clientY: 235, pressure: 0.85, timeStamp: 120.7, pointerType: "pen" },
      ],
    };

    const batch = extractHighFreqStylusSamples(event, {
      originX: 10,
      originY: 20,
      maxPredicted: 2,
    });
    expect(batch.usedCoalescedApi).toBe(true);
    expect(batch.usedPredictedApi).toBe(true);
    expect(batch.coalescedCount).toBe(3);
    expect(batch.predictedCount).toBe(2);
    expect(batch.samples).toHaveLength(5);
    expect(batch.samples[0]).toMatchObject({
      x: 100,
      y: 190,
      pressure: 0.5,
      tiltX: 12,
      tiltY: -8,
      predicted: false,
    });
    expect(batch.samples[3]).toMatchObject({
      x: 115,
      y: 205,
      predicted: true,
    });

    // Coalesced/Predicted 미지원 시 단일 포인터 폴백
    const basic = extractHighFreqStylusSamples({
      clientX: 40,
      clientY: 50,
      buttons: 1,
      pointerType: "mouse",
    });
    expect(basic.usedCoalescedApi).toBe(false);
    expect(basic.samples).toHaveLength(1);
    expect(basic.samples[0]?.pressure).toBe(0.5);
  });

  it("createComputePressureTileGovernor는 PressureObserver 상태 변화에 따라 타일 캐시·워커·OPFS 스필을 동적 조절한다", () => {
    const observeSpy = vi.fn(async () => undefined);
    const disconnectSpy = vi.fn();
    const instances: FakePressureObserver[] = [];

    class FakePressureObserver {
      readonly callback: (records: readonly { readonly state?: unknown }[]) => void;
      constructor(cb: (records: readonly { readonly state?: unknown }[]) => void) {
        this.callback = cb;
        instances.push(this);
      }
      observe = observeSpy;
      disconnect = disconnectSpy;
    }

    const policies: string[] = [];
    const governor = createComputePressureTileGovernor({
      baseTileCacheMiB: 1024,
      minTileCacheMiB: 128,
      baseWorkerCount: 8,
      pressureObserverCtor: FakePressureObserver as unknown as PressureObserverConstructorLike,
      onPolicyChange: (policy) => {
        policies.push(`${policy.state}:${policy.tileCacheBudgetMiB}MiB:${policy.workerConcurrency}w`);
      },
    });

    expect(governor.isSupported).toBe(true);
    expect(governor.getSnapshot().tileCacheBudgetMiB).toBe(1024);
    expect(governor.start()).toBe(true);
    expect(observeSpy).toHaveBeenCalledWith("cpu", { sampleInterval: 1000 });
    expect(instances).toHaveLength(1);

    instances[0]!.callback([{ state: "serious" }]);
    expect(governor.getSnapshot()).toEqual({
      state: "serious",
      tileCacheBudgetMiB: 410,
      workerConcurrency: 4,
      enablePredictedInk: false,
      enableHighResLiveFilter: false,
      spillInactiveTilesToOpfs: true,
    });

    instances[0]!.callback([{ state: "critical" }]);
    expect(governor.getSnapshot()).toEqual({
      state: "critical",
      tileCacheBudgetMiB: 205,
      workerConcurrency: 2,
      enablePredictedInk: false,
      enableHighResLiveFilter: false,
      spillInactiveTilesToOpfs: true,
    });

    instances[0]!.callback([{ state: "nominal" }]);
    expect(governor.getSnapshot().tileCacheBudgetMiB).toBe(1024);
    expect(governor.getSnapshot().spillInactiveTilesToOpfs).toBe(false);
    expect(policies).toEqual([
      "serious:410MiB:4w",
      "critical:205MiB:2w",
      "nominal:1024MiB:8w",
    ]);

    governor.stop();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);

    // 미지원 환경 안전 동작
    const unsupportedGov = createComputePressureTileGovernor({ pressureObserverCtor: null });
    expect(unsupportedGov.isSupported).toBe(false);
    expect(unsupportedGov.start()).toBe(false);
    expect(computeTilePolicyForPressure("fair", 512, 64, 4).tileCacheBudgetMiB).toBe(384);
  });
});
