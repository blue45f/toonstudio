import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_CAPTURE_ASPECT_PRESETS,
  normalizeStudioBg3dCaptureAspectRatio,
} from "./studio-bg3d-capture-frame-geometry";
import {
  STUDIO_BG3D_CUT_ASPECT_OPTIONS,
  isStudioBg3dCutAspectOptionId,
  resolveStudioBg3dCutAspectSelection,
  studioBg3dCaptureRatioFromCutAspect,
} from "./studio-bg3d-cut-aspect-link";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  applyStudioBg3dShot,
  captureStudioBg3dShot,
  normalizeStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";

import type { StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";

function documentWithAspect(exportAspectRatio: number | null): StudioBg3dSceneDocument {
  const { exportAspectRatio: _removed, ...output } = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output;
  return normalizeStudioBg3dSceneDocument({
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    output: exportAspectRatio === null ? output : { ...output, exportAspectRatio },
  });
}

describe("cinematic director cut ratio ↔ capture frame ratio", () => {
  it("offers the five director ratios, each equal to a capture frame preset", () => {
    expect(STUDIO_BG3D_CUT_ASPECT_OPTIONS.map((option) => option.id)).toEqual([
      "9:16",
      "4:5",
      "1:1",
      "16:9",
      "21:9",
    ]);
    const presetById = new Map(STUDIO_BG3D_CAPTURE_ASPECT_PRESETS.map((preset) => [preset.id, preset]));
    for (const option of STUDIO_BG3D_CUT_ASPECT_OPTIONS) {
      const [width, height] = option.id.split(":").map(Number) as [number, number];
      expect(option.ratio).toBe(width / height);
      // 디렉터의 비율은 LT 패널의 프리셋과 같은 값이라 두 화면이 서로를 같은 항목으로 읽는다.
      expect(presetById.get(option.presetId)?.ratio).toBe(option.ratio);
      // 문서 정규화가 값을 건드리지 않는다(한도 0.25~4 안, 클램프 없음).
      expect(normalizeStudioBg3dCaptureAspectRatio(option.ratio)).toBe(option.ratio);
    }
  });

  it("reads a stored capture ratio back as the matching cut ratio", () => {
    for (const option of STUDIO_BG3D_CUT_ASPECT_OPTIONS) {
      expect(resolveStudioBg3dCutAspectSelection(option.ratio)).toBe(option.id);
    }
  });

  it("reports automatic and custom ratios separately so the select never lies", () => {
    expect(resolveStudioBg3dCutAspectSelection(null)).toBe("free");
    expect(resolveStudioBg3dCutAspectSelection(undefined)).toBe("free");
    // 4:3 과 3:4 는 캡처 프레임 프리셋이지만 디렉터 선택지에는 없다.
    expect(resolveStudioBg3dCutAspectSelection(4 / 3)).toBe("custom");
    expect(resolveStudioBg3dCutAspectSelection(3 / 4)).toBe("custom");
    expect(resolveStudioBg3dCutAspectSelection(2.35)).toBe("custom");
    expect(resolveStudioBg3dCutAspectSelection(Number.NaN)).toBe("custom");
  });

  it("converts only known option ids into a ratio", () => {
    expect(studioBg3dCaptureRatioFromCutAspect("21:9")).toBe(21 / 9);
    expect(studioBg3dCaptureRatioFromCutAspect("4:5")).toBe(0.8);
    expect(studioBg3dCaptureRatioFromCutAspect("free")).toBeUndefined();
    expect(studioBg3dCaptureRatioFromCutAspect("custom")).toBeUndefined();
    expect(studioBg3dCaptureRatioFromCutAspect("3:2")).toBeUndefined();
    expect(isStudioBg3dCutAspectOptionId("9:16")).toBe(true);
    expect(isStudioBg3dCutAspectOptionId("free")).toBe(false);
    expect(isStudioBg3dCutAspectOptionId(0.8)).toBe(false);
  });

  it("is a document-wide value: a saved cut does not record it and applying a cut leaves it alone", () => {
    // 디렉터 "컷 비율"을 문서 캡처 프레임 비율에 잇되, 컷마다 따로 저장되지는 않는다.
    // 컷의 출력 오버라이드는 투명 배경·출력 높이·선·톤만 담는다(exportAspectRatio 는 문서 공통).
    const portrait = documentWithAspect(4 / 5);
    expect(portrait.output.exportAspectRatio).toBe(4 / 5);
    const captured = captureStudioBg3dShot(portrait, { id: "cut-ratio", name: "인스타 컷" });
    expect(captured).not.toBeNull();
    expect(captured!.shots?.[0]?.output).toBeDefined();
    expect(captured!.shots?.[0]?.output?.exportAspectRatio).toBeUndefined();

    const edited = normalizeStudioBg3dSceneDocument({
      ...captured!,
      output: { ...captured!.output, exportAspectRatio: 21 / 9 },
    });
    expect(edited.output.exportAspectRatio).toBe(21 / 9);
    // 컷을 적용해도 문서 공통 비율은 그대로다(컷이 비율을 되돌리지 않는다).
    expect(applyStudioBg3dShot(edited, "cut-ratio")?.output.exportAspectRatio).toBe(21 / 9);
  });
});
