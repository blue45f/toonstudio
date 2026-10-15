import { describe, it, expect } from "vitest";

import { evaluateFormatCompatibility } from "./studio-3d-geometry-authority-manifest";

describe("evaluateFormatCompatibility", () => {
  it("evaluates glTF/GLB grade A compatibility", () => {
    const report = evaluateFormatCompatibility("glb");
    expect(report.grade).toBe("A");
    expect(report.preservedFeatures).toContain("PBR Materials");
    expect(report.preservedFeatures).toContain("Skinning");
  });

  it("evaluates VRM grade A compatibility with rights warning", () => {
    const report = evaluateFormatCompatibility("vrm");
    expect(report.grade).toBe("A");
    expect(report.preservedFeatures).toContain("Humanoid Bone Mapping");
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it("evaluates STEP B-Rep CAD compatibility", () => {
    const report = evaluateFormatCompatibility("step");
    expect(report.grade).toBe("A");
    expect(report.preservedFeatures).toContain("Exact B-Rep Surfaces");
    expect(report.bakedFeatures).toContain("Tessellated Render Mesh");
  });

  it("evaluates SketchUp as a partial browser conversion rather than a bridge format", () => {
    for (const name of ["skp", "SketchUp"]) {
      const skp = evaluateFormatCompatibility(name);
      expect(skp.grade).toBe("B");
      expect(skp.warnings[0]).toContain("OpenSKP");
      expect(skp.warnings[0]).toContain("GLB/DAE");
      expect(skp.warnings.join(" ")).not.toContain("bridge plugin");
    }
    const skp = evaluateFormatCompatibility("skp");
    // 실제 구현이 보존하지 않는 것은 보존 목록에 두지 않는다(컴포넌트 계층·장면은 이름 보고서뿐).
    expect(skp.preservedFeatures).not.toContain("Component Hierarchy");
    expect(skp.preservedFeatures).not.toContain("Scenes/Cameras");
    expect(skp.droppedFeatures).toEqual(expect.arrayContaining(["Scenes/Cameras", "Tags/Layers Visibility"]));
  });

  it("keeps BLEND as a bridge-only format", () => {
    const blend = evaluateFormatCompatibility("blend");
    expect(blend.grade).toBe("C");
    expect(blend.warnings[0]).toContain("Blender Add-on Bridge");
  });
});
