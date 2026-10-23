import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resolveStudioMannequinOutlineVisible } from "./studio-mannequin-readability";

// 인형 그래프(메시·윤곽선·IK 핸들)는 2인 구도를 위해 인형 한 체 모듈로 분리됐다 — 계약은 두 파일을 함께 본다.
const sceneSource = readFileSync(new URL("./studio-mannequin-scene.ts", import.meta.url), "utf8");
const figureSource = readFileSync(new URL("./studio-mannequin-scene-figure.ts", import.meta.url), "utf8");
const source = `${sceneSource}\n${figureSource}`;

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
    // 윤곽선 표시 여부는 읽기성 헬퍼 한 곳이 정한다 — 씬의 재질 공급자가 헬퍼를 한 번만 부르고,
    // 인형 그래프는 메시를 만들 때와 스타일·모드를 바꿀 때 모두 그 공급자를 거쳐야 한다.
    expect(sceneSource.match(/resolveStudioMannequinOutlineVisible\(\{/gu)).toHaveLength(1);
    expect(figureSource.match(/outline\.visible = materials\.outlineVisible\(/gu)).toHaveLength(2);
    expect(figureSource).not.toContain("resolveStudioMannequinOutlineVisible");
    expect(source).toContain("style: currentMaterialStyle,");
    // 기존 규칙("shaded 스타일에서만 윤곽선")은 auto 모드가 그대로 유지한다.
    expect(resolveStudioMannequinOutlineVisible({ mode: "auto", style: "shaded", role: "body" })).toBe(true);
    expect(resolveStudioMannequinOutlineVisible({ mode: "auto", style: "wood", role: "body" })).toBe(false);
    // three r186 에서 PCFSoftShadowMap 은 제거됐다(매 진입 경고) — PCFShadowMap 을 명시한다.
    expect(source).toContain("renderer.shadowMap.type = THREE.PCFShadowMap");
    expect(source).not.toContain("PCFSoftShadowMap;");
    expect(source).toContain('addEventListener("dblclick", handleDoubleClick)');
  });
});
