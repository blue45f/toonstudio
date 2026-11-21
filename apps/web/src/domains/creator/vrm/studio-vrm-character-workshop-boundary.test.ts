import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const panel = readFileSync(new URL("./StudioVrmAvatarForgePanel.tsx", import.meta.url), "utf8");
const preview = readFileSync(new URL("./StudioVrmAvatarForgePreview.tsx", import.meta.url), "utf8");
const range = readFileSync(new URL("./StudioVrmForgeRangeControl.tsx", import.meta.url), "utf8");
const pose = readFileSync(new URL("./StudioVrmPhotoPoseScanner.tsx", import.meta.url), "utf8");
const reference = readFileSync(
  new URL("./StudioVrmAvatarReferenceRecommendationsPanel.tsx", import.meta.url),
  "utf8",
);
const renderer = readFileSync(new URL("./StudioVrmAvatarForge.tsx", import.meta.url), "utf8");
// 헤어 메시 조립은 뷰포트와 카드 썸네일이 함께 쓰도록 이 모듈로 옮겼고,
// 2026-11-21(6c6c6f838) 통합 MToon 셰이딩·용접 법선 역면 외곽선은 전용 커스텀 파츠 모듈로 분리했다.
const hairRenderer = readFileSync(new URL("./studio-vrm-avatar-forge-hair-object.ts", import.meta.url), "utf8");
const customPartMaterial = readFileSync(new URL("./studio-vrm-custom-part-material.ts", import.meta.url), "utf8");
const customPartGeometry = readFileSync(new URL("./studio-vrm-custom-part-geometry.ts", import.meta.url), "utf8");
const dialog = readFileSync(new URL("./StudioVrmPoserDialog.tsx", import.meta.url), "utf8");

describe("Shaper-inspired character workshop product boundary", () => {
  it("uses visual recipe previews and precise controls instead of emoji-only selection", () => {
    expect(panel).toContain("StudioVrmAvatarForgePreview");
    expect(panel).toContain("StudioVrmForgeRangeControl");
    expect(panel).toContain("아바타 스타일 검색");
    expect(panel).toContain("FACE_SHAPE_PRESETS");
    expect(panel).toContain("HAIR_COLOR_PRESETS");
    expect(range).toContain("정확한 값");
    expect(preview).toContain('data-forge-preview="true"');
    expect(preview).toContain("HairBack");
    expect(preview).toContain("Bangs");
  });

  it("keeps AI and pose review creator-facing and reversible", () => {
    expect(reference).toContain("StudioVrmAvatarForgePreview");
    expect(reference).toContain("% 유사");
    expect(reference).toContain("분석 기술 정보");
    expect(reference).not.toContain("cosine {");
    expect(pose).toContain("filterPhotoPoseBones");
    expect(pose).toContain("사진 포즈 적용 범위");
    expect(pose).toContain("<image href={imageUrl}");
    expect(pose).toContain("replacePreviewUrl(null)");
  });

  it("adds a merged authored toon silhouette without mutating source hair geometry", () => {
    expect(renderer).toContain("addAvatarForgeHairParts(");
    expect(hairRenderer).toContain("createStudioVrmHairMToonMaterials(");
    expect(hairRenderer).toContain("createStudioVrmSmoothOutlineGeometry(merged)");
    expect(hairRenderer).toContain("ToonStudioAvatarForgeHair_AuthoredMerged");
    expect(hairRenderer).toContain("ToonStudioAvatarForgeHairOutline_AuthoredMerged");
    expect(hairRenderer).toContain("mergeStudioVrmAuthoredHairGeometry(");
    expect(customPartMaterial).toContain("export function createStudioVrmHairMToonMaterials(");
    expect(customPartMaterial).toContain("new MToonMaterial({");
    expect(customPartMaterial).toContain("isOutline: true");
    expect(customPartMaterial).toContain("side: THREE.BackSide");
    expect(customPartMaterial).toContain("depthWrite: true");
    expect(customPartGeometry).toContain("export function createStudioVrmSmoothOutlineGeometry(");
    expect(customPartGeometry).toContain("const outline = source.clone();");
    expect(customPartGeometry).toContain("smoothStudioVrmCoincidentNormals(outline, { creaseAngleDeg: 180 })");
    expect(dialog).toContain("max-w-[1480px]");
    expect(dialog).toContain("_460px");
  });
});
