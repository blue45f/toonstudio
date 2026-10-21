import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * E2 구도 브리프 호스트 마운트 계약 (2026-10-22 후속) —
 * 패널(StudioCompositionGenerationBriefPanel)은 완성돼 있었지만 제품 호스트
 * 소비처가 0건이라 화면에 닿지 않았다. 포저가 스냅샷을 공급하고 캡처 삽입
 * 폴백을 실제 컷 삽입(handleCapture → 호스트 onInsert)에 연결한 것을 고정한다.
 */
const POSER = "apps/web/src/domains/creator/scene-3d/StudioMannequinPoserPanel.tsx";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("mannequin poser composition-brief host mount", () => {
  it("poser renders the brief panel with a live snapshot and the real capture-insert fallback", () => {
    const poser = read(POSER);
    expect(poser).toContain("StudioCompositionGenerationBriefPanel");
    expect(poser).toContain("snapshot={compositionSnapshot}");
    // 폴백은 장식이 아니라 실제 캡처 삽입 동선(handleCapture → onInsert)이다.
    expect(poser).toContain("onInsertCaptureFallback={handleCapture}");
  });

  it("snapshot is derived from poser state (camera preset · pose preset · body · material)", () => {
    const poser = read(POSER);
    expect(poser).toContain("buildStudioMannequinCompositionSnapshot({");
    expect(poser).toContain("cameraPreset,");
    expect(poser).toContain("posePresetId: lastPosePresetId");
    expect(poser).toContain("heightCm: params.heightCm");
  });

  it("camera preset buttons and reset keep the snapshot state in sync with the scene", () => {
    const poser = read(POSER);
    expect(poser).toContain("setCameraPreset(preset);");
    expect(poser).toContain('setCameraPreset("home");');
    expect(poser).toContain("setLastPosePresetId(presetId);");
  });
});
