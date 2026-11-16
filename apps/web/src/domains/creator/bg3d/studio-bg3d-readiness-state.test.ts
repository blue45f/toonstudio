import { describe, expect, it } from "vitest";

import { deriveStudioBg3dReadinessState } from "./studio-bg3d-readiness-state";

describe("deriveStudioBg3dReadinessState", () => {
  it("distinguishes probing, renderer startup, and scene restoration inside initializing", () => {
    expect(deriveStudioBg3dReadinessState({
      enginePhase: "probing",
      planStatus: "unavailable",
      selectedBackend: "webgpu",
      hasModelRenderer: false,
      isRestoringScene: true,
    })).toMatchObject({
      phase: "initializing",
      stage: "probing",
      selectedEngine: "webgpu",
      activeEngine: null,
      badgeLabelKo: "WebGPU 확인 중",
    });

    expect(deriveStudioBg3dReadinessState({
      enginePhase: "ready",
      planStatus: "available",
      selectedBackend: "webgl2",
      hasModelRenderer: false,
      isRestoringScene: true,
    })).toMatchObject({
      phase: "initializing",
      stage: "renderer-starting",
      selectedEngine: "webgl2",
      activeEngine: null,
      badgeLabelKo: "WebGL2 초기화 중",
    });

    expect(deriveStudioBg3dReadinessState({
      enginePhase: "ready",
      planStatus: "available",
      selectedBackend: "webgl2",
      hasModelRenderer: true,
      isRestoringScene: true,
    })).toMatchObject({
      phase: "initializing",
      stage: "scene-restoring",
      selectedEngine: "webgl2",
      activeEngine: null,
      badgeLabelKo: "WebGL2 장면 준비 중",
    });
  });

  it("reports ready with an activeEngine only after both renderer and scene hydration complete", () => {
    expect(deriveStudioBg3dReadinessState({
      enginePhase: "ready",
      planStatus: "available",
      selectedBackend: "webgl2",
      hasModelRenderer: true,
      isRestoringScene: false,
    })).toMatchObject({
      phase: "ready",
      stage: "ready",
      selectedEngine: "webgl2",
      activeEngine: "webgl2",
      badgeLabelKo: "WebGL2 활성",
    });
  });

  it("reports error without an activeEngine when WebGPU or explicit WebGL2 is unavailable or failed", () => {
    expect(deriveStudioBg3dReadinessState({
      enginePhase: "ready",
      planStatus: "unavailable",
      selectedBackend: "webgpu",
      hasModelRenderer: false,
      isRestoringScene: true,
      planNotice: "사용 가능한 WebGPU 어댑터를 찾지 못했습니다.",
    })).toMatchObject({
      phase: "error",
      stage: "engine-unavailable",
      selectedEngine: "webgpu",
      activeEngine: null,
      badgeLabelKo: "WebGPU 사용 불가",
    });

    expect(deriveStudioBg3dReadinessState({
      enginePhase: "ready",
      planStatus: "failed",
      selectedBackend: "webgl2",
      hasModelRenderer: false,
      isRestoringScene: true,
      deviceLostMessage: "WebGL2 그래픽 컨텍스트를 생성하지 못했습니다.",
    })).toMatchObject({
      phase: "error",
      stage: "engine-failed",
      selectedEngine: "webgl2",
      activeEngine: null,
      badgeLabelKo: "WebGL2 실행 실패",
    });
  });
});
