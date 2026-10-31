/** 패스 권한과 attachment 수명만 검증한다. 실제 MSAA stencil과 픽셀 품질은 두 GPU 검증이 필요하다. */
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  POOLED_CAPTURE_MAX_EDGE,
  acquireCaptureTarget,
  createBareNullScene,
  isPressureOcclusionRenderPass,
  pooledCaptureTargetCount,
  registerPressureOcclusionRenderPass,
} from "./testing/null-engine-harness";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function fixture() {
  const owned = createBareNullScene();
  const camera = new ArcRotateCamera("main-camera", 0, Math.PI / 2, 3, Vector3.Zero(), owned.scene);
  owned.scene.activeCamera = camera;
  const originalPass = owned.engine.currentRenderPassId;
  cleanups.push(() => {
    if (!owned.engine.isDisposed) {
      owned.engine.currentRenderPassId = originalPass;
      owned.dispose();
    }
  });
  return { ...owned, camera };
}

describe("의상 가림의 주 카메라·lit 패스 권한", () => {
  it("실제 주 카메라 패스와 등록한 lit만 허용하고 같은 이름의 다른 RTT를 거부한다", () => {
    const { scene, engine, camera } = fixture();
    engine.currentRenderPassId = camera.renderPassId;
    expect(isPressureOcclusionRenderPass(scene)).toBe(true);
    const lit = acquireCaptureTarget(scene, "lit", 64, 64, 1);
    const depth = acquireCaptureTarget(scene, "depth", 64, 64, 1);
    depth.rtt.name = "capture-lit";
    engine.currentRenderPassId = lit.rtt.renderPassId;
    expect(isPressureOcclusionRenderPass(scene)).toBe(true);
    engine.currentRenderPassId = depth.rtt.renderPassId;
    expect(isPressureOcclusionRenderPass(scene)).toBe(false);
    engine.currentRenderPassId = lit.rtt.renderPassId;
    scene.activeCamera = null;
    expect(isPressureOcclusionRenderPass(scene)).toBe(false);
    scene.activeCamera = camera;
    lit.release();
    depth.release();
  });

  it("주 카메라를 바꾸면 이전 카메라 ID를 주 패스로 계속 허용하지 않는다", () => {
    const { scene, engine, camera } = fixture();
    const next = new ArcRotateCamera("main-camera", 0, Math.PI / 2, 3, Vector3.Zero(), scene);
    scene.activeCamera = next;
    engine.currentRenderPassId = camera.renderPassId;
    expect(isPressureOcclusionRenderPass(scene)).toBe(false);
    engine.currentRenderPassId = next.renderPassId;
    expect(isPressureOcclusionRenderPass(scene)).toBe(true);
  });

  it("같은 패스의 등록 하나를 두 번 돌려줘도 남은 소유자의 권한을 제거하지 않는다", () => {
    const { scene, engine } = fixture();
    const target = acquireCaptureTarget(scene, "normal", 64, 64, 1);
    const releaseFirst = registerPressureOcclusionRenderPass(scene, target.rtt.renderPassId);
    const releaseSecond = registerPressureOcclusionRenderPass(scene, target.rtt.renderPassId);
    engine.currentRenderPassId = target.rtt.renderPassId;
    releaseFirst();
    releaseFirst();
    expect(isPressureOcclusionRenderPass(scene)).toBe(true);
    releaseSecond();
    expect(isPressureOcclusionRenderPass(scene)).toBe(false);
    target.release();
  });

  it("등록은 장면별로 격리되고 반복 등록·반환이 장면 observer를 누적하지 않는다", () => {
    const first = fixture();
    const second = fixture();
    const target = acquireCaptureTarget(first.scene, "normal", 64, 64, 1);
    const before = first.scene.onDisposeObservable.observers.length;
    for (let index = 0; index < 20; index += 1) {
      const release = registerPressureOcclusionRenderPass(first.scene, target.rtt.renderPassId);
      first.engine.currentRenderPassId = target.rtt.renderPassId;
      second.engine.currentRenderPassId = target.rtt.renderPassId;
      expect(isPressureOcclusionRenderPass(first.scene)).toBe(true);
      expect(isPressureOcclusionRenderPass(second.scene)).toBe(false);
      release();
      expect(isPressureOcclusionRenderPass(first.scene)).toBe(false);
    }
    expect(first.scene.onDisposeObservable.observers.length).toBe(before + 1);
    target.release();
  });

  it.each([-1, 0.5, Number.NaN])("잘못된 패스 ID %s를 등록하지 않는다", (pass) => {
    const { scene } = fixture();
    expect(() => registerPressureOcclusionRenderPass(scene, pass)).toThrow(RangeError);
  });

  it("해제된 장면의 등록과 주 패스 권한을 거부한다", () => {
    const owned = fixture();
    const target = acquireCaptureTarget(owned.scene, "lit", 32, 32, 1);
    owned.engine.currentRenderPassId = target.rtt.renderPassId;
    target.release();
    owned.dispose();
    expect(isPressureOcclusionRenderPass(owned.scene)).toBe(false);
    expect(() => registerPressureOcclusionRenderPass(owned.scene, 0)).toThrow("해제된 장면");
    expect(pooledCaptureTargetCount(owned.scene)).toBe(0);
    expect(target.rtt.getInternalTexture()).toBeNull();
  });
});

describe("lit stencil attachment의 캡처 풀", () => {
  it.each([["flat", "lit"], ["lit", "flat"]] as const)("%s→%s 순서와 무관하게 attachment를 구분한다", (firstPass, secondPass) => {
    const { scene, engine } = fixture();
    const first = acquireCaptureTarget(scene, firstPass, 128, 128, 4);
    first.release();
    const second = acquireCaptureTarget(scene, secondPass, 128, 128, 4);
    second.release();
    expect(second.rtt).not.toBe(first.rtt);
    expect(first.rtt.renderTargetOptions.generateStencilBuffer).toBe(firstPass === "lit");
    expect(second.rtt.renderTargetOptions.generateStencilBuffer).toBe(secondPass === "lit");
    const lit = firstPass === "lit" ? first : second;
    const flat = firstPass === "flat" ? first : second;
    engine.currentRenderPassId = lit.rtt.renderPassId;
    expect(isPressureOcclusionRenderPass(scene)).toBe(true);
    engine.currentRenderPassId = flat.rtt.renderPassId;
    expect(isPressureOcclusionRenderPass(scene)).toBe(false);
    const repeated = acquireCaptureTarget(scene, "lit", 128, 128, 4);
    expect(repeated.rtt).toBe(lit.rtt);
    repeated.release();
    expect(pooledCaptureTargetCount(scene)).toBe(2);
  });

  it("같은 attachment의 비 lit 패스끼리는 기존처럼 재사용하고 stencil 권한을 주지 않는다", () => {
    const { scene, engine } = fixture();
    const flat = acquireCaptureTarget(scene, "flat", 32, 32, 1);
    flat.release();
    const normal = acquireCaptureTarget(scene, "normal", 32, 32, 1);
    expect(normal.rtt).toBe(flat.rtt);
    expect(normal.rtt.name).toBe("capture-normal");
    engine.currentRenderPassId = normal.rtt.renderPassId;
    expect(isPressureOcclusionRenderPass(scene)).toBe(false);
    normal.release();
    expect(pooledCaptureTargetCount(scene)).toBe(1);
  });

  it("busy 임시 lit 타깃과 큰 lit 타깃은 해제 즉시 권한도 돌려준다", () => {
    const { scene, engine } = fixture();
    const pooled = acquireCaptureTarget(scene, "lit", 64, 64, 1);
    const overlap = acquireCaptureTarget(scene, "lit", 64, 64, 1);
    const large = acquireCaptureTarget(scene, "lit", POOLED_CAPTURE_MAX_EDGE + 1, 64, 1);
    expect(overlap.pooled).toBe(false);
    expect(large.pooled).toBe(false);
    for (const target of [overlap, large]) {
      expect(target.rtt.renderTargetOptions.generateStencilBuffer).toBe(true);
      engine.currentRenderPassId = target.rtt.renderPassId;
      expect(isPressureOcclusionRenderPass(scene)).toBe(true);
      target.release();
      target.release();
      expect(isPressureOcclusionRenderPass(scene)).toBe(false);
      expect(target.rtt.getInternalTexture()).toBeNull();
    }
    engine.currentRenderPassId = pooled.rtt.renderPassId;
    expect(isPressureOcclusionRenderPass(scene)).toBe(true);
    pooled.release();
  });

  it("내부 텍스처가 사라진 풀 타깃의 ID를 폐기하고 새 타깃에만 권한을 준다", () => {
    const { scene, engine } = fixture();
    const original = acquireCaptureTarget(scene, "lit", 32, 32, 1);
    original.release();
    original.rtt.releaseInternalTexture();
    const replacement = acquireCaptureTarget(scene, "lit", 32, 32, 1);
    expect(replacement.rtt).not.toBe(original.rtt);
    engine.currentRenderPassId = original.rtt.renderPassId;
    expect(isPressureOcclusionRenderPass(scene)).toBe(false);
    engine.currentRenderPassId = replacement.rtt.renderPassId;
    expect(isPressureOcclusionRenderPass(scene)).toBe(true);
    replacement.release();
    expect(pooledCaptureTargetCount(scene)).toBe(1);
  });
});
