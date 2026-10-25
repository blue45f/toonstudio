import { afterEach, describe, expect, it, vi } from "vitest";

import {
  acquireStudioGpuDevice,
  activeStudioGpuDeviceLeaseCount,
  disposeStudioGpuFabric,
  type StudioGpuDeviceLossEvent,
} from "../render/studio-gpu-fabric";
import { canonicalStudioLivingInkDisplayRgba8 } from "../studio-living-ink-execution-protocol";
import {
  StudioLivingInkWebGpuPureRuntime,
  studioLivingInkPresentedPixelsAreBlank,
} from "../studio-living-ink-webgpu-pure-runtime";
import { listStudioLivingInkWgslPassSources } from "../studio-living-ink-wgsl-shaders";
import { sha256HexPortable } from "../studio-sha256";

import type {
  StudioLivingInkExecutionConfig,
  StudioLivingInkExecutionFrame,
} from "../studio-living-ink-execution-protocol";

const MATERIAL = {
  brushSizeCells: 8,
  flow: 0.5,
  bleed: 0.5,
  dryRate: 0.2,
  chromaticSeparation: 0.1,
  brushPigmentLoad: 0.5,
  capillaryCreep: 0.3,
  vorticity: 0.1,
  dryingEdgeDeposition: 0.4,
  wetOnWetMixing: 0.5,
  glazeOverFixed: 0.1,
  paperFiber: 0.4,
  paperTooth: 0.4,
  granulation: 0.3,
  edgeDarkening: 0.4,
  wetSheen: 0.2,
  vignette: 0.1,
  beerLambertDensity: 0.8,
};

const CONFIG = {
  displayWidth: 4,
  displayHeight: 3,
  fieldWidth: 4,
  fieldHeight: 3,
  coarseBase: 128,
  seed: 1,
  material: MATERIAL,
  displayMode: "composite",
} as unknown as StudioLivingInkExecutionConfig;

/**
 * Enough of WebGPU/OffscreenCanvas to drive the real runtime in Node, with one knob: what the
 * mapped display readback contains. That is the only input that decides whether the runtime is
 * looking at a resolved frame or at a buffer nothing ever wrote — which is exactly the condition
 * that shipped a blank canvas to WebGPU users while every receipt-hash check agreed with itself.
 */
interface PresentedBitmap {
  readonly width: number;
  readonly height: number;
  readonly bytes: Uint8ClampedArray;
  close: () => void;
}

const originals = new Map<string, PropertyDescriptor | undefined>();

function stubGlobal(name: string, value: unknown): void {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function restoreGlobals(): void {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  originals.clear();
}

type DisplayCell = readonly [number, number, number, number];

interface FakeWebGpuHarness {
  readonly createStandaloneDevice: () => {
    readonly device: GPUDevice;
    readonly triggerLost: (reason?: string) => void;
    readonly destroyCount: () => number;
  };
  readonly triggerActiveDeviceLost: (reason?: string) => void;
}

/** Installs the fake environment. A callback can make row order observable in receipt tests. */
function installFakeWebGpu(
  displaySource: DisplayCell | ((cell: number) => DisplayCell),
): FakeWebGpuHarness {
  const cells = CONFIG.fieldWidth * CONFIG.fieldHeight;

  class FakeImageData {
    constructor(
      readonly data: Uint8ClampedArray,
      readonly width: number,
      readonly height: number,
    ) {}
  }

  class FakeOffscreenCanvas {
    private painted: FakeImageData | null = null;

    constructor(readonly width: number, readonly height: number) {}

    getContext(id: string): { putImageData: (image: FakeImageData) => void } | null {
      if (id !== "2d") return null;
      return { putImageData: (image) => { this.painted = image; } };
    }

    transferToImageBitmap(): PresentedBitmap {
      const painted = this.painted;
      if (!painted) throw new Error("fake canvas transferred before anything was painted");
      this.painted = null;
      return {
        width: this.width,
        height: this.height,
        bytes: painted.data,
        close: () => {},
      };
    }
  }

  const mappedDisplay = new Float32Array(cells * 4);
  for (let cell = 0; cell < cells; cell += 1) {
    const displayCell = typeof displaySource === "function"
      ? displaySource(cell)
      : displaySource;
    mappedDisplay.set(displayCell, cell * 4);
  }

  const buffer = () => ({
    destroy: () => {},
    mapAsync: async () => {},
    getMappedRange: () => mappedDisplay.buffer.slice(0),
    unmap: () => {},
  });

  let latestTriggerLost: ((reason?: string) => void) | null = null;

  const createStandaloneDevice = () => {
    let resolveLost: ((info: GPUDeviceLostInfo) => void) | null = null;
    const lost = new Promise<GPUDeviceLostInfo>((resolve) => {
      resolveLost = resolve;
    });
    let destroyed = 0;
    const triggerLost = (reason = "destroyed") => {
      resolveLost?.({ reason, message: reason } as GPUDeviceLostInfo);
    };
    const device = {
      lost,
      createBuffer: buffer,
      createShaderModule: () => ({}),
      createComputePipeline: () => ({ getBindGroupLayout: () => ({}) }),
      createBindGroup: () => ({}),
      createCommandEncoder: () => ({
        beginComputePass: () => ({
          setPipeline: () => {},
          setBindGroup: () => {},
          dispatchWorkgroups: () => {},
          end: () => {},
        }),
        copyBufferToBuffer: () => {},
        finish: () => ({}),
      }),
      queue: { writeBuffer: () => {}, submit: () => {} },
      destroy: () => {
        destroyed += 1;
      },
    } as unknown as GPUDevice;
    return {
      device,
      triggerLost,
      destroyCount: () => destroyed,
    };
  };

  stubGlobal("GPUBufferUsage", {
    STORAGE: 0x80, COPY_SRC: 0x04, COPY_DST: 0x08, MAP_READ: 0x01, UNIFORM: 0x40,
  });
  stubGlobal("GPUMapMode", { READ: 0x01 });
  stubGlobal("ImageData", FakeImageData);
  stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  stubGlobal("navigator", {
    gpu: {
      requestAdapter: async () => ({
        requestDevice: async () => {
          const minted = createStandaloneDevice();
          latestTriggerLost = minted.triggerLost;
          return minted.device;
        },
      }),
    },
  });

  return {
    createStandaloneDevice,
    triggerActiveDeviceLost: (reason = "device-lost") => {
      latestTriggerLost?.(reason);
    },
  };
}

function inkStroke() {
  return {
    kind: "ink",
    version: 1,
    sequence: 1,
    tool: "ink-brush",
    marks: [{ x: 1, y: 1, radius: 1.5, pressure: 1, color: [0.1, 0.1, 0.1] }],
    selection: null,
  } as never;
}

async function applyStroke(
  runtime: StudioLivingInkWebGpuPureRuntime,
): Promise<StudioLivingInkExecutionFrame> {
  return await runtime.apply(
    1,
    inkStroke(),
    {},
    () => false,
    async () => {},
  ) as StudioLivingInkExecutionFrame;
}

describe("studio-living-ink-webgpu-pure-runtime", () => {
  afterEach(() => {
    disposeStudioGpuFabric();
    restoreGlobals();
  });

  it("exposes tryCreate and depends on the pure WGSL pass library", () => {
    expect(typeof StudioLivingInkWebGpuPureRuntime.tryCreate).toBe("function");
    expect(listStudioLivingInkWgslPassSources().map((p) => p.id)).toContain("display");
  });

  it("returns null without WebGPU in node test environment", async () => {
    const result = await StudioLivingInkWebGpuPureRuntime.tryCreate({
      ...CONFIG,
      displayWidth: 32,
      displayHeight: 32,
      fieldWidth: 32,
      fieldHeight: 32,
    });
    // Node vitest has no navigator.gpu → pure runtime unavailable
    expect(result).toBeNull();
  });

  it("acquires a shared StudioGpuFabric lease on tryCreate and releases it on dispose", async () => {
    installFakeWebGpu([0.2, 0.4, 0.6, 1]);
    expect(activeStudioGpuDeviceLeaseCount()).toBe(0);
    const first = await StudioLivingInkWebGpuPureRuntime.tryCreate(CONFIG);
    const second = await StudioLivingInkWebGpuPureRuntime.tryCreate(CONFIG);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.webGpuDevice).toBe(second!.webGpuDevice);
    expect(first!.lost).toBe(false);
    expect(activeStudioGpuDeviceLeaseCount()).toBe(2);

    first!.dispose();
    expect(activeStudioGpuDeviceLeaseCount()).toBe(1);
    second!.dispose();
    expect(activeStudioGpuDeviceLeaseCount()).toBe(0);
  });

  it("accepts an externally injected StudioGpuDeviceLease and rejects released or lost leases", async () => {
    installFakeWebGpu([0.2, 0.4, 0.6, 1]);
    const sharedLease = await acquireStudioGpuDevice();
    expect(sharedLease).not.toBeNull();
    expect(activeStudioGpuDeviceLeaseCount()).toBe(1);

    const borrowed = await StudioLivingInkWebGpuPureRuntime.tryCreate(CONFIG, {
      lease: sharedLease,
      releaseInjectedLeaseOnDispose: false,
    });
    expect(borrowed).not.toBeNull();
    expect(borrowed!.webGpuDevice).toBe(sharedLease!.device);
    expect(borrowed!.lease).toBe(sharedLease);
    expect(borrowed!.epoch).toBe(sharedLease!.epoch);

    borrowed!.dispose();
    expect(sharedLease!.released).toBe(false);
    expect(activeStudioGpuDeviceLeaseCount()).toBe(1);

    const owned = await StudioLivingInkWebGpuPureRuntime.tryCreate(CONFIG, {
      lease: sharedLease,
    });
    expect(owned).not.toBeNull();
    owned!.dispose();
    expect(sharedLease!.released).toBe(true);
    expect(activeStudioGpuDeviceLeaseCount()).toBe(0);

    // A released lease must be rejected fail-closed.
    const rejectedReleased = await StudioLivingInkWebGpuPureRuntime.tryCreate(CONFIG, {
      lease: sharedLease,
    });
    expect(rejectedReleased).toBeNull();
  });

  it("accepts an externally injected shared GPUDevice without destroying it on dispose, and tracks device.lost", async () => {
    const harness = installFakeWebGpu([0.2, 0.4, 0.6, 1]);
    const standalone = harness.createStandaloneDevice();
    const lossEvents: StudioGpuDeviceLossEvent[] = [];

    const runtime = await StudioLivingInkWebGpuPureRuntime.tryCreate(CONFIG, {
      device: standalone.device,
      onDeviceLost: (event) => {
        lossEvents.push(event);
      },
    });
    expect(runtime).not.toBeNull();
    expect(runtime!.webGpuDevice).toBe(standalone.device);
    expect(runtime!.lease).toBeNull();
    expect(runtime!.lost).toBe(false);

    standalone.triggerLost("driver-reset");
    await Promise.resolve();
    await Promise.resolve();

    expect(runtime!.lost).toBe(true);
    expect(runtime!.lossReason).toBe("driver-reset");
    expect(lossEvents).toEqual([{ epoch: 0, reason: "driver-reset" }]);
    await expect(applyStroke(runtime!)).rejects.toThrow(/context is lost/i);
    await expect(runtime!.renderFrame(2, "composite")).rejects.toThrow(/context is lost/i);

    runtime!.dispose();
    expect(standalone.destroyCount()).toBe(0);
  });

  it("transitions to lost on StudioGpuFabric device.lost and recovers on a new epoch when recreated", async () => {
    const harness = installFakeWebGpu([0.2, 0.4, 0.6, 1]);
    const onLost = vi.fn<(event: StudioGpuDeviceLossEvent) => void>();
    const first = await StudioLivingInkWebGpuPureRuntime.tryCreate(CONFIG, {
      onDeviceLost: onLost,
    });
    expect(first).not.toBeNull();
    const firstEpoch = first!.epoch;
    expect(firstEpoch).toBeGreaterThan(0);

    harness.triggerActiveDeviceLost("gpu-hang");
    await Promise.resolve();
    await Promise.resolve();

    expect(first!.lost).toBe(true);
    expect(first!.lossReason).toBe("gpu-hang");
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(onLost).toHaveBeenCalledWith({ epoch: firstEpoch, reason: "gpu-hang" });
    await expect(applyStroke(first!)).rejects.toThrow(/context is lost/i);
    first!.dispose();

    const recovered = await StudioLivingInkWebGpuPureRuntime.tryCreate(CONFIG);
    expect(recovered).not.toBeNull();
    expect(recovered!.lost).toBe(false);
    expect(recovered!.epoch).toBeGreaterThan(firstEpoch);
    const frame = await applyStroke(recovered!);
    expect(frame.receipt.backend).toBe("webgpu-offscreen-half-float");
    recovered!.dispose();
  });

  describe("blank-frame detection", () => {
    it("rejects only the exact unwritten RGBA storage marker", () => {
      const cells = 64;
      // A storage buffer that the display pass never wrote remains zero-initialized.
      expect(studioLivingInkPresentedPixelsAreBlank(new Uint8Array(cells * 4))).toBe(true);

      // Quantized black pigment is a valid completed frame: alpha is the write evidence that the
      // old RGB-only sentinel discarded.
      const opaqueBlack = new Uint8Array(cells * 4);
      for (let index = 3; index < opaqueBlack.length; index += 4) opaqueBlack[index] = 255;
      expect(studioLivingInkPresentedPixelsAreBlank(opaqueBlack)).toBe(false);
    });

    it("calls any real surface non-blank, including a single lit pixel", () => {
      const cells = 64;
      const paper = new Uint8Array(cells * 4).fill(255);
      expect(studioLivingInkPresentedPixelsAreBlank(paper)).toBe(false);

      // The canonical wash layer deliberately resolves an untouched page as transparent white.
      // It is empty content, but it is a real display result and must survive clear/undo/export.
      const transparentPage = new Uint8Array(cells * 4);
      for (let index = 0; index < transparentPage.length; index += 4) {
        transparentPage[index] = 255;
        transparentPage[index + 1] = 255;
        transparentPage[index + 2] = 255;
      }
      expect(studioLivingInkPresentedPixelsAreBlank(transparentPage)).toBe(false);

      const oneLitPixel = new Uint8Array(cells * 4);
      for (let index = 3; index < oneLitPixel.length; index += 4) oneLitPixel[index] = 255;
      oneLitPixel[4 * 17] = 1;
      expect(studioLivingInkPresentedPixelsAreBlank(oneLitPixel)).toBe(false);
    });
  });

  describe("presentation contract", () => {
    it("presents the resolved pixels themselves, in display orientation", async () => {
      // Distinct per-channel values so a swizzle or a flip cannot pass by symmetry.
      installFakeWebGpu([0.2, 0.4, 0.6, 1]);
      const runtime = await StudioLivingInkWebGpuPureRuntime.tryCreate(CONFIG);
      expect(runtime).not.toBeNull();
      const frame = await applyStroke(runtime!);
      const presented = frame.image as unknown as PresentedBitmap;

      expect(presented.width).toBe(CONFIG.displayWidth);
      expect(presented.height).toBe(CONFIG.displayHeight);
      expect(studioLivingInkPresentedPixelsAreBlank(presented.bytes)).toBe(false);
      expect(Array.from(presented.bytes.slice(0, 4))).toEqual([51, 102, 153, 255]);
      runtime!.dispose();
    });

    it("hashes the frame it presented, so the receipt cannot certify a different surface", async () => {
      installFakeWebGpu((cell) => [(cell + 1) / 16, 0.4, 0.6, 1]);
      const runtime = await StudioLivingInkWebGpuPureRuntime.tryCreate(CONFIG);
      const frame = await applyStroke(runtime!);
      const presented = frame.image as unknown as PresentedBitmap;

      const topDown = canonicalStudioLivingInkDisplayRgba8(presented.bytes);
      expect(frame.receipt.displaySha256).toBe(`sha256:${sha256HexPortable(topDown)}`);
      expect(frame.receipt.displayReadbackOrientation).toBe("top-left-row-major");
      expect(frame.receipt.readbackFormat).toBe("rgba32float-storage-buffer-to-rgba8");
      expect(frame.receipt.backend).toBe("webgpu-offscreen-half-float");
      runtime!.dispose();
    });

    it("presents a fully opaque quantized-black resolve", async () => {
      installFakeWebGpu([0, 0, 0, 1]);
      const runtime = await StudioLivingInkWebGpuPureRuntime.tryCreate(CONFIG);
      expect(runtime).not.toBeNull();
      const frame = await applyStroke(runtime!);
      const presented = frame.image as unknown as PresentedBitmap;
      expect(studioLivingInkPresentedPixelsAreBlank(presented.bytes)).toBe(false);
      for (let index = 0; index < presented.bytes.length; index += 4) {
        expect(Array.from(presented.bytes.slice(index, index + 4))).toEqual([0, 0, 0, 255]);
      }
      frame.image.close();
      runtime!.dispose();
    });

    it("refuses to present a frame the GPU never resolved", async () => {
      // The display buffer stays at zero — what an invalid buffer, a dropped compute pass or a
      // driver fault leaves behind. Failing closed is what keeps it off the user's canvas.
      installFakeWebGpu([0, 0, 0, 0]);
      const runtime = await StudioLivingInkWebGpuPureRuntime.tryCreate(CONFIG);
      expect(runtime).not.toBeNull();
      await expect(applyStroke(runtime!)).rejects.toThrow(/empty display frame/i);
      await expect(runtime!.renderFrame(2, "composite")).rejects.toThrow(/empty display frame/i);
      runtime!.dispose();
    });
  });
});
