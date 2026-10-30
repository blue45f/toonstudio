import { afterEach, describe, expect, it, vi } from "vitest";

import * as modelLibrary from "./bg3d-model-library";
import {
  STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1,
  type StudioBg3dCaptureAdapter,
  type StudioBg3dCapturedRaster,
} from "./studio-bg3d-capture-adapter";
import {
  STUDIO_BG3D_MODEL_THUMBNAIL_MAX_QUEUED_JOBS,
  StudioBg3dModelThumbnailCaptureController,
  type StudioBg3dModelThumbnailCaptureDependencies,
} from "./studio-bg3d-model-thumbnail-capture";
import {
  STUDIO_BG3D_MODEL_THUMBNAIL_HEIGHT,
  STUDIO_BG3D_MODEL_THUMBNAIL_WIDTH,
} from "./studio-bg3d-model-thumbnail-data";

function thumbnailPng(width = 320, height = 180): Uint8Array {
  const bytes = new Uint8Array(58);
  const view = new DataView(bytes.buffer);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  bytes.set([8, 6, 0, 0, 0], 24);
  view.setUint32(33, 1, false);
  bytes.set([0x49, 0x44, 0x41, 0x54], 37);
  bytes[41] = 0;
  bytes.set([0x49, 0x45, 0x4e, 0x44], 50);
  const crc32 = (start: number, end: number) => {
    let crc = 0xffff_ffff;
    for (let offset = start; offset < end; offset += 1) {
      crc ^= bytes[offset] ?? 0;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb8_8320 : 0);
      }
    }
    return (crc ^ 0xffff_ffff) >>> 0;
  };
  view.setUint32(29, crc32(12, 29), false);
  view.setUint32(42, crc32(37, 42), false);
  view.setUint32(54, crc32(50, 54), false);
  return bytes;
}

function thumbnailDataUrl(width = 320, height = 180): string {
  let binary = "";
  for (const byte of thumbnailPng(width, height)) binary += String.fromCharCode(byte);
  return `data:image/png;base64,${btoa(binary)}`;
}

function pngBlob(width = 320, height = 180): Blob {
  return new Blob([Uint8Array.from(thumbnailPng(width, height)).buffer], { type: "image/png" });
}

function raster(): StudioBg3dCapturedRaster {
  return Object.freeze({
    width: STUDIO_BG3D_MODEL_THUMBNAIL_WIDTH,
    height: STUDIO_BG3D_MODEL_THUMBNAIL_HEIGHT,
    rgba: new Uint8ClampedArray(
      STUDIO_BG3D_MODEL_THUMBNAIL_WIDTH * STUDIO_BG3D_MODEL_THUMBNAIL_HEIGHT * 4,
    ),
  });
}

function adapter(): StudioBg3dCaptureAdapter {
  return {
    backend: "three-webgl",
    engineId: "three",
    engineVersion: "1",
    implementationRevision: "test-v1",
    graphicsApi: "webgl2",
    profileId: STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1,
    getSourceSize: () => ({ width: 640, height: 360 }),
    capture: async () => raster(),
  };
}

function dependencies(
  overrides: StudioBg3dModelThumbnailCaptureDependencies = {},
): StudioBg3dModelThumbnailCaptureDependencies {
  return {
    capture: async () => raster(),
    encode: async () => pngBlob(),
    verify: async () => undefined,
    toDataUrl: async () => thumbnailDataUrl(),
    persist: async () => true,
    revisionFactory: () => 10,
    ...overrides,
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Studio BG3D per-model thumbnail capture lane", () => {
  it("기본 저장 경로에 작업 signal과 전체 소유권 검사를 전달한다", async () => {
    const persist = vi.spyOn(modelLibrary, "saveBg3dModelThumbnailIfCurrentV12")
      .mockImplementation(async (_id, _url, options) => {
        expect(options?.signal?.aborted).toBe(false);
        expect(options?.assertCurrent).toBeTypeOf("function");
        options?.assertCurrent?.();
        return true;
      });
    const controller = new StudioBg3dModelThumbnailCaptureController({
      dependencies: {
        capture: async () => raster(),
        encode: async () => pngBlob(),
        verify: async () => undefined,
        toDataUrl: async () => thumbnailDataUrl(),
        revisionFactory: () => 11,
      },
    });
    try {
      await expect(controller.captureAndStore({
        storageModelId: "default-guard",
        adapter: adapter(),
      })).resolves.toMatchObject({ captureRevision: 11 });
      expect(persist).toHaveBeenCalledExactlyOnceWith(
        "default-guard",
        thumbnailDataUrl(),
        expect.objectContaining({
          captureRevision: 11,
          signal: expect.any(AbortSignal),
          assertCurrent: expect.any(Function),
        }),
      );
    } finally {
      controller.dispose();
    }
  });

  it("저장 대기 중 lease가 바뀌면 stale을 보존하고 ready를 발행하지 않는다", async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    const progress: string[] = [];
    let current = true;
    const persist: NonNullable<StudioBg3dModelThumbnailCaptureDependencies["persist"]> =
      async (_id, _url, _revision, guard) => {
        guard.assertCurrent();
        entered.resolve(undefined);
        await release.promise;
        guard.assertCurrent();
        return true;
      };
    const controller = new StudioBg3dModelThumbnailCaptureController({
      dependencies: dependencies({ persist }),
    });
    try {
      const result = controller.captureAndStore({
        storageModelId: "changed-lease",
        adapter: adapter(),
        isCurrent: () => current,
        onProgress: ({ stage }) => progress.push(stage),
      });
      const rejected = expect(result).rejects.toMatchObject({ code: "stale" });
      await entered.promise;
      current = false;
      release.resolve(undefined);
      await rejected;
      expect(progress).toContain("persisting");
      expect(progress).not.toContain("ready");
    } finally {
      release.resolve(undefined);
      controller.dispose();
    }
  });

  it("이전 세대의 늦은 저장은 새 세대의 결과를 덮어쓰지 않는다", async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    const finished = deferred<void>();
    const published: number[] = [];
    const persist: NonNullable<StudioBg3dModelThumbnailCaptureDependencies["persist"]> =
      async (_id, _url, revision, guard) => {
        try {
          if (revision === 20) {
            entered.resolve(undefined);
            await release.promise;
          }
          guard.assertCurrent();
          published.push(revision);
          return true;
        } finally {
          if (revision === 20) finished.resolve(undefined);
        }
      };
    let revision = 20;
    const controller = new StudioBg3dModelThumbnailCaptureController({
      dependencies: dependencies({ persist, revisionFactory: () => revision++ }),
    });
    try {
      const obsolete = controller.captureAndStore({
        storageModelId: "same-model", adapter: adapter(),
      });
      const rejected = expect(obsolete).rejects.toMatchObject({ code: "stale" });
      await entered.promise;
      controller.invalidate();
      await rejected;
      await expect(controller.captureAndStore({
        storageModelId: "same-model", adapter: adapter(),
      })).resolves.toMatchObject({ generationId: 2 });
      release.resolve(undefined);
      await finished.promise;
      expect(published).toEqual([21]);
    } finally {
      release.resolve(undefined);
      controller.dispose();
    }
  });

  it("유효한 작업의 실제 저장 오류는 persistence-failed로 유지한다", async () => {
    const failure = new Error("저장소 기록 실패");
    const controller = new StudioBg3dModelThumbnailCaptureController({
      dependencies: dependencies({ persist: async () => { throw failure; } }),
    });
    try {
      await expect(controller.captureAndStore({
        storageModelId: "storage-failure", adapter: adapter(),
      })).rejects.toMatchObject({ code: "persistence-failed", cause: failure });
    } finally {
      controller.dispose();
    }
  });

  it("runs capture, Worker encode, verification, and fenced persistence in order", async () => {
    const calls: string[] = [];
    const identities: Array<{ generationId: number; requestId: number }> = [];
    const progress: string[] = [];
    const persist = vi.fn(async (_id: string, _dataUrl: string, revision: number) => {
      calls.push(`persist:${revision}`);
      return true;
    });
    const controller = new StudioBg3dModelThumbnailCaptureController({
      dependencies: dependencies({
        capture: async (_adapter, request) => {
          calls.push(`capture:${request.width}x${request.height}`);
          return raster();
        },
        encode: async (_raster, identity) => {
          calls.push("encode");
          identities.push(identity);
          return pngBlob();
        },
        verify: async () => { calls.push("verify"); },
        toDataUrl: async () => {
          calls.push("data-url");
          return thumbnailDataUrl();
        },
        persist,
        revisionFactory: () => 77,
      }),
    });

    const result = await controller.captureAndStore({
      storageModelId: "model-storage-1",
      adapter: adapter(),
      onProgress: ({ stage }) => progress.push(stage),
    });

    expect(calls).toEqual([
      "capture:320x180",
      "encode",
      "verify",
      "data-url",
      "persist:77",
    ]);
    expect(identities).toEqual([{ generationId: 1, requestId: 1 }]);
    expect(progress).toEqual(["queued", "capturing", "encoding", "verifying", "persisting", "ready"]);
    expect(result).toMatchObject({
      storageModelId: "model-storage-1",
      generationId: 1,
      requestId: 1,
      captureRevision: 77,
      byteLength: pngBlob().size,
      width: 320,
      height: 180,
    });
    controller.dispose();
  });

  it("keeps capture concurrency at one and drains jobs in FIFO order", async () => {
    const first = deferred<StudioBg3dCapturedRaster>();
    const order: number[] = [];
    let call = 0;
    let active = 0;
    let maximumActive = 0;
    const controller = new StudioBg3dModelThumbnailCaptureController({
      dependencies: dependencies({
        capture: async () => {
          call += 1;
          const current = call;
          order.push(current);
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          const value = current === 1 ? await first.promise : raster();
          active -= 1;
          return value;
        },
        revisionFactory: (() => {
          let revision = 100;
          return () => revision++;
        })(),
      }),
    });
    const one = controller.captureAndStore({ storageModelId: "model-one", adapter: adapter() });
    const two = controller.captureAndStore({ storageModelId: "model-two", adapter: adapter() });
    await vi.waitFor(() => expect(order).toEqual([1]));
    first.resolve(raster());
    await expect(Promise.all([one, two])).resolves.toHaveLength(2);
    expect(order).toEqual([1, 2]);
    expect(maximumActive).toBe(1);
    controller.dispose();
  });

  it("rejects work beyond the bounded queue without allocating another capture", async () => {
    const blocked = deferred<StudioBg3dCapturedRaster>();
    const capture = vi.fn(async () => blocked.promise);
    const controller = new StudioBg3dModelThumbnailCaptureController({
      dependencies: dependencies({
        capture,
        revisionFactory: (() => {
          let revision = 200;
          return () => revision++;
        })(),
      }),
    });
    const accepted = Array.from(
      { length: STUDIO_BG3D_MODEL_THUMBNAIL_MAX_QUEUED_JOBS + 1 },
      (_, index) => controller.captureAndStore({
        storageModelId: `bounded-${index}`,
        adapter: adapter(),
      }),
    );
    const rejected = controller.captureAndStore({ storageModelId: "overflow", adapter: adapter() });
    await expect(rejected).rejects.toMatchObject({ code: "capacity-exceeded" });
    expect(capture).toHaveBeenCalledTimes(1);
    controller.dispose();
    await Promise.all(accepted.map((promise) => promise.catch(() => undefined)));
  });

  it("invalidates a late generation and never lets its encoded result reach persistence", async () => {
    const firstCapture = deferred<StudioBg3dCapturedRaster>();
    let calls = 0;
    const encode = vi.fn(async () => pngBlob());
    const persist = vi.fn(async () => true);
    const controller = new StudioBg3dModelThumbnailCaptureController({
      dependencies: dependencies({
        capture: async () => {
          calls += 1;
          return calls === 1 ? firstCapture.promise : raster();
        },
        encode,
        persist,
        revisionFactory: (() => {
          let revision = 300;
          return () => revision++;
        })(),
      }),
    });
    const obsolete = controller.captureAndStore({ storageModelId: "obsolete", adapter: adapter() });
    await vi.waitFor(() => expect(calls).toBe(1));
    controller.invalidate();
    await expect(obsolete).rejects.toMatchObject({ code: "stale" });
    firstCapture.resolve(raster());
    await Promise.resolve();
    expect(encode).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();

    const current = await controller.captureAndStore({ storageModelId: "current", adapter: adapter() });
    expect(current.generationId).toBe(2);
    expect(encode).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("aborts timed-out work, discards its late result, and releases the lane", async () => {
    vi.useFakeTimers();
    const blocked = deferred<StudioBg3dCapturedRaster>();
    const capture = vi.fn(async () => blocked.promise);
    const encode = vi.fn(async () => pngBlob());
    const controller = new StudioBg3dModelThumbnailCaptureController({
      timeoutMs: 250,
      dependencies: dependencies({ capture, encode }),
    });
    const timed = controller.captureAndStore({ storageModelId: "timed", adapter: adapter() });
    const timedExpectation = expect(timed).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(250);
    await timedExpectation;
    blocked.resolve(raster());
    await vi.runAllTimersAsync();
    expect(encode).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("fails closed on stale authority, forged output dimensions, and stale persistence fences", async () => {
    let current = false;
    const controller = new StudioBg3dModelThumbnailCaptureController({
      dependencies: dependencies(),
    });
    await expect(controller.captureAndStore({
      storageModelId: "not-current",
      adapter: adapter(),
      isCurrent: () => current,
    })).rejects.toMatchObject({ code: "stale" });

    current = true;
    const forged = new StudioBg3dModelThumbnailCaptureController({
      dependencies: dependencies({
        toDataUrl: async () => thumbnailDataUrl(160, 90),
      }),
    });
    await expect(forged.captureAndStore({
      storageModelId: "forged",
      adapter: adapter(),
    })).rejects.toMatchObject({ code: "verification-failed" });

    const stalePersist = new StudioBg3dModelThumbnailCaptureController({
      dependencies: dependencies({ persist: async () => false }),
    });
    await expect(stalePersist.captureAndStore({
      storageModelId: "stale-persist",
      adapter: adapter(),
    })).rejects.toMatchObject({ code: "stale" });
    controller.dispose();
    forged.dispose();
    stalePersist.dispose();
  });

  it("rejects invalid ids, external aborts, and all future work after disposal", async () => {
    const capture = vi.fn(async () => raster());
    const controller = new StudioBg3dModelThumbnailCaptureController({
      dependencies: dependencies({ capture }),
    });
    await expect(controller.captureAndStore({
      storageModelId: "../unsafe",
      adapter: adapter(),
    })).rejects.toMatchObject({ code: "invalid-request" });
    const abort = new AbortController();
    abort.abort();
    await expect(controller.captureAndStore({
      storageModelId: "aborted",
      adapter: adapter(),
      signal: abort.signal,
    })).rejects.toMatchObject({ code: "aborted" });
    controller.dispose();
    await expect(controller.captureAndStore({
      storageModelId: "disposed",
      adapter: adapter(),
    })).rejects.toMatchObject({ code: "disposed" });
    expect(capture).not.toHaveBeenCalled();
  });
});
