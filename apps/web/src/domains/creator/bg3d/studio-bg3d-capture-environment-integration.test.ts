import { describe, expect, it, vi } from "vitest";

import { captureStudioBg3dRaster, STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1 } from "./studio-bg3d-capture-adapter";
import { registerStudioBg3dCaptureEnvironmentAdapter } from "./studio-bg3d-capture-environment-adapter";
import { acquireStudioBg3dCaptureEnvironmentReceipt, assertStudioBg3dCaptureEnvironmentCurrent,
  publishStudioBg3dCaptureEnvironment } from "./studio-bg3d-capture-environment-receipt";

import type { StudioBg3dCaptureAdapter, StudioBg3dCapturedRaster } from "./studio-bg3d-capture-adapter";

function deferred<Value>() {
  let resolve: (value: Value) => void = () => { throw new Error("회귀 Promise가 아직 준비되지 않았습니다."); };
  const promise = new Promise<Value>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture() {
  const scene = {}, renderer = {};
  const raw: StudioBg3dCapturedRaster = { width: 2, height: 2, rgba: new Uint8Array(16).fill(123) };
  const capture = vi.fn<StudioBg3dCaptureAdapter["capture"]>().mockResolvedValue(raw);
  const adapter: StudioBg3dCaptureAdapter = Object.freeze({ backend: "three-webgl", engineId: "three",
    engineVersion: "environment-test", implementationRevision: "environment-test-v1", graphicsApi: "webgl2",
    profileId: STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1, getSourceSize: () => ({ width: 2, height: 2 }), capture });
  registerStudioBg3dCaptureEnvironmentAdapter(adapter,
    (options) => acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer, options));
  const request = { width: 2, height: 2, background: { color: "#123abc", alpha: 0 }, includeDepth: false };
  const publish = (fingerprint = "hdri-2k-rotation137", ready: PromiseLike<boolean> = Promise.resolve(true)) =>
    publishStudioBg3dCaptureEnvironment(scene, renderer, { fingerprint, ready, isApplied: () => true });
  return { scene, renderer, raw, capture, adapter, request, publish };
}

describe("실제 raster 방어 복사와 환경 세대 결박", () => {
  it("HDRI 준비 전에는 GPU 캡처를 호출하지 않고 준비 뒤 독립 배열과 같은 출처 영수증을 반환한다", async () => {
    const f = fixture(), ready = deferred<boolean>();
    const owner = f.publish(undefined, ready.promise);
    try {
      const pending = captureStudioBg3dRaster(f.adapter, f.request);
      await Promise.resolve();
      expect(f.capture).not.toHaveBeenCalled();
      ready.resolve(true);
      const owned = await pending;
      expect(owned).not.toBe(f.raw); expect(owned.rgba).not.toBe(f.raw.rgba);
      expect(Array.from(owned.rgba)).toEqual(Array.from(f.raw.rgba)); expect(Object.isFrozen(owned)).toBe(true);
      expect(() => assertStudioBg3dCaptureEnvironmentCurrent(owned, "hdri-2k-rotation137")).not.toThrow();
      const replacement = f.publish();
      try { expect(() => assertStudioBg3dCaptureEnvironmentCurrent(owned)).toThrow(); }
      finally { replacement.dispose(); }
    } finally { owner.dispose(); }
  });

  it("제품 adapter의 환경 게시가 누락되면 raw capture를 호출하지 않는다", async () => {
    const f = fixture();
    await expect(captureStudioBg3dRaster(f.adapter, f.request)).rejects.toThrow();
    expect(f.capture).not.toHaveBeenCalled();
  });

  it("실제 준비가 실패한 HDRI와 정본 fingerprint 불일치는 GPU 제출 전에 거부한다", async () => {
    const f = fixture(), failed = f.publish(undefined, Promise.resolve(false));
    try { await expect(captureStudioBg3dRaster(f.adapter, f.request)).rejects.toThrow(); }
    finally { failed.dispose(); }
    const ready = f.publish();
    try {
      await expect(captureStudioBg3dRaster(f.adapter, f.request,
        { expectedEnvironmentFingerprint: "other-document-request" })).rejects.toThrow();
      expect(f.capture).not.toHaveBeenCalled();
    } finally { ready.dispose(); }
  });

  it("GPU readback 중 같은 설정의 새 세대가 생겨도 이전 raster를 인계하지 않는다", async () => {
    const f = fixture(), first = f.publish(), readback = deferred<StudioBg3dCapturedRaster>();
    f.capture.mockReturnValue(readback.promise);
    const pending = captureStudioBg3dRaster(f.adapter, f.request);
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(f.capture).toHaveBeenCalledOnce());
    const next = f.publish();
    try { readback.resolve(f.raw); await rejected; }
    finally { first.dispose(); next.dispose(); }
  });

  it("캡처 대기 취소는 인터랙티브 HDRI 생산자를 폐기하지 않는다", async () => {
    const f = fixture(), ready = deferred<boolean>(), owner = f.publish(undefined, ready.promise);
    const controller = new AbortController();
    const pending = captureStudioBg3dRaster(f.adapter, f.request, { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(); await rejected; expect(f.capture).not.toHaveBeenCalled();
    try {
      ready.resolve(true);
      const owned = await captureStudioBg3dRaster(f.adapter, f.request);
      expect(f.capture).toHaveBeenCalledOnce();
      expect(() => assertStudioBg3dCaptureEnvironmentCurrent(owned)).not.toThrow();
    } finally { owner.dispose(); }
  });
});
