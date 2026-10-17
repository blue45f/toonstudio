import { describe, expect, it } from "vitest";

import { STUDIO_BG3D_CAPTURE_ASPECT_PRESETS } from "./studio-bg3d-capture-frame-geometry";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  applyStudioBg3dShot,
  captureStudioBg3dShot,
  duplicateStudioBg3dShot,
  moveStudioBg3dShot,
  normalizeStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";

import type { StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";

const FIXED_RATIOS = STUDIO_BG3D_CAPTURE_ASPECT_PRESETS.flatMap((preset) =>
  preset.ratio === null ? [] : [[preset.id, preset.ratio] as const],
);

function documentWithAspect(exportAspectRatio: number | null, exportHeight = 1_080): StudioBg3dSceneDocument {
  const { exportAspectRatio: _removed, ...output } = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output;
  return normalizeStudioBg3dSceneDocument({
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    output: {
      ...output,
      exportHeight,
      ...(exportAspectRatio === null ? {} : { exportAspectRatio }),
    },
  });
}

describe("the output a cut records", () => {
  it("keeps what a cut owns and leaves the document-wide capture ratio out", () => {
    const document = documentWithAspect(21 / 9, 1_440);
    const output = captureStudioBg3dShot(document, { id: "cut-a", name: "A" })!.shots![0]!.output;
    expect(output).toEqual({
      transparentBackground: document.output.transparentBackground,
      exportHeight: 1_440,
      line: document.output.line,
      tone: document.output.tone,
    });
    expect(output).not.toHaveProperty("exportAspectRatio");
  });

  it("is the same output a document without a fixed ratio always recorded", () => {
    const document = documentWithAspect(null);
    const output = captureStudioBg3dShot(document, { id: "cut-a", name: "A" })!.shots![0]!.output;
    expect(output).toEqual(document.output);
    expect(output?.line).not.toBe(document.output.line);
    expect(output?.tone).not.toBe(document.output.tone);
  });
});

describe("saving a cut while the capture ratio is fixed", () => {
  it.each(FIXED_RATIOS)("records a cut under the %s frame instead of failing", (_id, ratio) => {
    const document = documentWithAspect(ratio);
    const captured = captureStudioBg3dShot(document, { id: "cut-a", name: "고정 비율 컷" });
    // 예전에는 비율이 컷 출력 스냅샷에 섞여 엄격 정규화가 거부하며 항상 null 이었다.
    expect(captured).not.toBeNull();
    expect(captured!.shots).toHaveLength(1);
    expect(captured!.activeShotId).toBe("cut-a");
    expect(captured!.output.exportAspectRatio).toBe(ratio);
    expect(captured!.shots![0]!.output?.exportHeight).toBe(1_080);
    expect(captured!.shots![0]!.output).not.toHaveProperty("exportAspectRatio");
  });

  it("keeps the ratio document-wide: applying a cut neither records nor restores one", () => {
    const captured = captureStudioBg3dShot(documentWithAspect(4 / 5), { id: "cut-a", name: "A" })!;
    const edited = normalizeStudioBg3dSceneDocument({
      ...captured,
      output: { ...captured.output, exportAspectRatio: 21 / 9 },
    });
    expect(applyStudioBg3dShot(edited, "cut-a")?.output.exportAspectRatio).toBe(21 / 9);

    const { exportAspectRatio: _cleared, ...automatic } = captured.output;
    const automaticDocument = normalizeStudioBg3dSceneDocument({ ...captured, output: automatic });
    expect(applyStudioBg3dShot(automaticDocument, "cut-a")?.output.exportAspectRatio).toBeUndefined();
  });

  it("round-trips the saved cut through the strict persisted form", () => {
    const captured = captureStudioBg3dShot(documentWithAspect(16 / 9), { id: "cut-a", name: "A" })!;
    const serialized = serializeStudioBg3dSceneDocument(captured);
    expect(serialized).not.toBeNull();
    const parsed = parseStudioBg3dSceneDocument(serialized!);
    expect(parsed?.output.exportAspectRatio).toBe(16 / 9);
    expect(parsed?.shots?.map((shot) => shot.id)).toEqual(["cut-a"]);
  });

  it("lets the author keep working with the cut list under a fixed ratio", () => {
    let document = captureStudioBg3dShot(documentWithAspect(9 / 16), { id: "cut-a", name: "A" })!;
    document = captureStudioBg3dShot(document, { id: "cut-b", name: "B" })!;
    expect(document.shots?.map((shot) => shot.id)).toEqual(["cut-a", "cut-b"]);
    const duplicated = duplicateStudioBg3dShot(document, "cut-a", { id: "cut-c", name: "C" });
    expect(duplicated?.shots?.map((shot) => shot.id)).toEqual(["cut-a", "cut-b", "cut-c"]);
    const moved = moveStudioBg3dShot(duplicated, "cut-c", 0);
    expect(moved?.shots?.map((shot) => shot.id)).toEqual(["cut-c", "cut-a", "cut-b"]);
    expect(moved?.output.exportAspectRatio).toBe(9 / 16);
  });
});
