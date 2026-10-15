import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resolveStudioMannequinOutlineVisible } from "./studio-mannequin-readability";

const source = readFileSync(new URL("./studio-mannequin-scene.ts", import.meta.url), "utf8");

describe("3D mannequin direct-manipulation runtime boundary", () => {
  it("keeps mouse, pen and touch on one constrained pointer-rotation path", () => {
    expect(source).toContain("resolveStudioMannequinPointerRotation({");
    expect(source).toContain("renderer.domElement.setPointerCapture(event.pointerId)");
    expect(source).toContain('addEventListener("pointermove", handlePointerMove, { passive: false })');
    expect(source).toContain('addEventListener("lostpointercapture", handleLostPointerCapture');
  });

  it("rolls direct and IK edits back when pointer ownership is cancelled", () => {
    expect(source).toContain("group.rotation.set(...session.startRotation)");
    expect(source).toContain("const startPose = dragStartPose");
    expect(source).toContain("applyPoseToGraph(currentPose)");
    expect(source).toContain("finishPointerInteraction(event, true)");
  });

  it("uses rounded high-detail geometry, soft shadows and joint double-click focus", () => {
    expect(source).toContain("new RoundedBoxGeometry(");
    expect(source).toContain("const radialSegments = relativeRadius < 0.055 ? 12 : relativeRadius < 0.11 ? 20 : 28");
    expect(source).toMatch(/new THREE\.CapsuleGeometry\(\s*primitive\.radius,\s*middleLength,\s*relativeRadius < 0\.055 \? 6 : 10,\s*radialSegments,\s*\)/u);
    expect(source).toContain("new THREE.CylinderGeometry(");
    expect(source).toContain("const hasAnatomicalTaper");
    expect(source).toContain("side: THREE.BackSide");
    // 윤곽선 표시 여부는 읽기성 헬퍼 한 곳이 정한다 — 메시를 만들 때와 스타일·모드를 바꿀 때 모두 그 헬퍼를 거쳐야 한다.
    expect(source.match(/outline\.visible = resolveStudioMannequinOutlineVisible\(\{/gu)).toHaveLength(2);
    expect(source).toContain("style: currentMaterialStyle,");
    // 기존 규칙("shaded 스타일에서만 윤곽선")은 auto 모드가 그대로 유지한다.
    expect(resolveStudioMannequinOutlineVisible({ mode: "auto", style: "shaded", role: "body" })).toBe(true);
    expect(resolveStudioMannequinOutlineVisible({ mode: "auto", style: "wood", role: "body" })).toBe(false);
    expect(source).toContain("renderer.shadowMap.type = THREE.PCFSoftShadowMap");
    expect(source).toContain('addEventListener("dblclick", handleDoubleClick)');
  });
});
