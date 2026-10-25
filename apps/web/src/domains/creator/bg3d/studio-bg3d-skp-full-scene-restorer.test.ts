import { describe, expect, it } from "vitest";

import {
  decomposeGlTFColumnMajorMatrix16,
  extractStudioBg3dSkpThumbnailSummary,
  restoreStudioBg3dSkpAnnotationsAndGuides,
  restoreStudioBg3dSkpInstancedHierarchy,
  restoreStudioBg3dSkpScenesToShots,
  restoreStudioBg3dSkpTags,
  skpDirectionZUpToYUp,
  skpPlaneZUpToMetersYUp,
  skpPointInchesZUpToMetersYUp,
} from "./studio-bg3d-skp-full-scene-restorer";

describe("studio-bg3d-skp-full-scene-restorer", () => {
  it("SketchUp Z-up 인치 좌표를 ToonStudio Y-up 미터 좌표로 정확히 변환한다", () => {
    const pt = skpPointInchesZUpToMetersYUp([100, 200, 300], 1);
    expect(pt).toEqual([2.54, 7.62, -5.08]);

    const dir = skpDirectionZUpToYUp([0, 0, 10]);
    expect(dir).toEqual([0, 1, 0]);

    const plane = skpPlaneZUpToMetersYUp([0, 0, 1, -100], 1);
    expect(plane).toEqual([0, 1, 0, -2.54]);
  });

  it("SkpModel.pages(SketchUp Scenes)를 원근·직교 카메라 샷 및 숨김 태그로 복원한다", () => {
    const shots = restoreStudioBg3dSkpScenesToShots({
      pages: [
        {
          name: "Scene 1 Perspective",
          eye: [0, -100, 50],
          target: [0, 0, 50],
          up: [0, 0, 1],
          fov: 45,
          parallel: false,
          orthoHeight: 0,
          hiddenLayers: ["Roof", "Ceiling"],
        },
        {
          name: "Scene 2 Ortho Plan",
          eye: [0, 0, 200],
          target: [0, 0, 0],
          up: [0, 1, 0],
          fov: 35,
          parallel: true,
          orthoHeight: 100,
          hiddenLayers: [],
        },
      ],
    });

    expect(shots).toHaveLength(2);
    expect(shots[0]?.name).toBe("Scene 1 Perspective");
    expect(shots[0]?.shot.camera?.projection).toBe("perspective");
    expect(shots[0]?.shot.camera?.fovDegrees).toBe(45);
    expect(shots[0]?.shot.camera?.position).toEqual([0, 1.27, 2.54]);
    expect(shots[0]?.shot.hiddenTags).toEqual(["Ceiling", "Roof"]);

    expect(shots[1]?.parallel).toBe(true);
    expect(shots[1]?.shot.camera?.projection).toBe("orthographic");
    expect(shots[1]?.orthoHeightMeters).toBe(2.54);
  });

  it("SkpModel.layers에서 태그 이름·HEX 색상·초기 숨김 상태를 복원한다", () => {
    const tags = restoreStudioBg3dSkpTags({
      layers: [
        { name: "Layer0", color: { r: 255, g: 128, b: 0 }, hidden: false },
        { name: "Hidden_Tag", color: { r: 16, g: 32, b: 64 }, hidden: true },
      ],
    });

    expect(tags).toEqual([
      { name: "Layer0", colorHex: "#ff8000", hidden: false },
      { name: "Hidden_Tag", colorHex: "#102040", hidden: true },
    ]);
  });

  it("buildInstancedScene 트리에서 16원소 행렬 분해 및 다이나믹 컴포넌트를 추론한다", () => {
    const decomposed = decomposeGlTFColumnMajorMatrix16([
      2, 0, 0, 0,
      0, 3, 0, 0,
      0, 0, 4, 0,
      1.5, 2.5, -3.5, 1,
    ]);
    expect(decomposed.position).toEqual([1.5, 2.5, -3.5]);
    expect(decomposed.scale).toEqual([2, 3, 4]);

    const hierarchy = restoreStudioBg3dSkpInstancedHierarchy({
      layerHidden: { Roof: true },
      root: {
        children: [
          {
            name: "Entrance_Door",
            definitionName: "Single_Door_900",
            layer: "Doors",
            matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 2, 1],
            properties: { onclick: "ANIMATE('roty', 0, 90)", open_ratio: 0.5 },
            attributeDictionaries: {
              IFC2x3: { IfcType: "IfcDoor" },
            },
            children: [],
          },
        ],
      },
    });

    expect(hierarchy.nodes).toHaveLength(1);
    expect(hierarchy.nodes[0]?.positionMeters).toEqual([1, 0, 2]);
    expect(hierarchy.dynamicComponents).toHaveLength(1);
    expect(hierarchy.dynamicComponents[0]?.kind).toBe("door-single-swing");
    expect(hierarchy.dynamicComponents[0]?.value).toBe(0.5);
  });

  it("단면 평면·치수선·지시선·보조선·스타일 및 내장 썸네일을 복원한다", () => {
    const annotations = restoreStudioBg3dSkpAnnotationsAndGuides({
      styles: [
        {
          name: "Webtoon Style",
          frontColor: { r: 255, g: 255, b: 255 },
          backColor: { r: 100, g: 118, b: 150 },
        },
      ],
      root: {
        sectionPlanes: [
          { name: "Main Cut", label: "S1", hidden: false, plane: [0, 0, 1, -100] },
        ],
        dimensions: [
          { text: "<>", hidden: false, a: [0, 0, 0], b: [100, 0, 0], offset: [0, 10, 0] },
        ],
        texts: [
          { text: "Note A", hidden: false, point: [10, 0, 20], leader: [5, 0, 5] },
        ],
        constructionLines: [
          {
            point: [0, 0, 0],
            direction: [1, 0, 0],
            start: [-1e30, 0, 0],
            end: [1e30, 0, 0],
          },
        ],
        constructionPoints: [{ position: [100, 0, 0] }],
      },
    });

    expect(annotations.sectionPlanes).toHaveLength(1);
    expect(annotations.dimensions[0]?.measuredMeters).toBe(2.54);
    expect(annotations.leaderTexts[0]?.text).toBe("Note A");
    expect(annotations.constructionLines[0]?.infinite).toBe(true);
    expect(annotations.constructionPoints[0]?.positionMeters).toEqual([2.54, 0, 0]);
    expect(annotations.styles[0]?.backColorHex).toBe("#647696");

    const thumb = extractStudioBg3dSkpThumbnailSummary({
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      mimeType: "image/png",
      width: 256,
      height: 192,
      source: "model",
    });
    expect(thumb?.width).toBe(256);
    expect(thumb?.byteSize).toBe(4);
  });
});
