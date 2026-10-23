import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const forge = readFileSync(new URL("./StudioVrmAvatarForge.tsx", import.meta.url), "utf8");
// 헤어 메시 조립(병합·외곽선)은 셰이퍼 뷰포트와 카드 썸네일이 함께 쓰도록 이 모듈로 옮겼다.
const forgeHair = readFileSync(new URL("./studio-vrm-avatar-forge-hair-object.ts", import.meta.url), "utf8");
const semantic = readFileSync(new URL("./studio-vrm-semantic-face-morph.ts", import.meta.url), "utf8");
const adaptive = readFileSync(new URL("./studio-vrm-adaptive-face-deformer.ts", import.meta.url), "utf8");
const authoredHair = readFileSync(new URL("./studio-vrm-authored-hair-geometry.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("./StudioVrmAvatarForgePanel.tsx", import.meta.url), "utf8");

describe("VRM character quality closure", () => {
  it("uses exact native morphs before adaptive mesh deformation", () => {
    expect(semantic).toContain("nativeSemanticIds");
    expect(semantic).toContain("applyStudioVrmAdaptiveFaceMorphs(vrm, state, nativeSemanticIds)");
    expect(semantic).toContain('provider: "native-morph"');
    expect(semantic).toContain('provider: "adaptive-mesh"');
    expect(adaptive).toContain("excludedSemanticIds");
    expect(adaptive).toContain("binding.mesh.geometry = deformed");
    expect(adaptive).toContain("binding.mesh.geometry = originalGeometry");
  });

  it("renders authored clumps as one merged buffer plus one expanded outline", () => {
    expect(forge).toContain("addAvatarForgeHairParts(");
    expect(forgeHair).toContain("mergeStudioVrmAuthoredHairGeometry(");
    expect(forgeHair).toContain("ToonStudioAvatarForgeHair_AuthoredMerged");
    expect(forgeHair).toContain("ToonStudioAvatarForgeHairOutline_AuthoredMerged");
    expect(forge).not.toContain("for (const part of buildAvatarForgeHairParts(state))");
    expect(forgeHair).not.toContain("for (const part of buildAvatarForgeHairParts(state))");
    expect(authoredHair).toContain("CLUMP_CROSS_SEGMENTS = 8");
    // 이마 노출은 삼각형 잘라내기(clipCapForehead) 대신 방위각별 헤어라인 캡으로 만든다.
    expect(authoredHair).toContain("function createCapGeometry()");
    expect(authoredHair).toContain("CAP_THETA_FRONT");
    expect(authoredHair).toContain("shapeBackShellToDrape");
    expect(authoredHair).toContain("mergeGeometries(geometries, false)");
    expect(authoredHair).toContain("part.shadowColor");
  });

  it("exposes a three-stop palette and honest provider labels", () => {
    expect(panel).toContain("shadowColor");
    expect(panel).toContain("적응형 얼굴 디테일");
    expect(panel).toContain("모델 morph");
    expect(panel).toContain("적응형 mesh");
  });
});
