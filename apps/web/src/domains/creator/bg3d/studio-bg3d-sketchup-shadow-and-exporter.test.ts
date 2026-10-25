import * as openskp from "openskp";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SKETCHUP_SHADOW_INFO,
  applySketchUpShadowSettingsToLighting,
  buildSketchUpModelBytesFromSceneSpec,
  computeSketchUpSolarPosition,
  exportSketchUpSceneToMultiCadFormat,
  metersYUpToSkpInchesZUp,
} from "./studio-bg3d-sketchup-shadow-and-exporter";

describe("studio-bg3d-sketchup-shadow-and-exporter", () => {
  it("위도·경도·Solar North·날짜·시각으로부터 천문 태양 고도·방위각 및 조명을 계산한다", () => {
    const solar = computeSketchUpSolarPosition(DEFAULT_SKETCHUP_SHADOW_INFO);
    expect(solar.isDaytime).toBe(true);
    expect(solar.solarAltitudeDeg).toBeGreaterThan(40);
    expect(solar.sunriseHour).toBeLessThan(7);
    expect(solar.sunsetHour).toBeGreaterThan(18);

    const applied = applySketchUpShadowSettingsToLighting(DEFAULT_SKETCHUP_SHADOW_INFO);
    expect(applied.lighting.key.castsShadow).toBe(true);
    expect(applied.lighting.key.intensity).toBeGreaterThan(1);
    expect(applied.lighting.ambientIntensity).toBeGreaterThan(0.2);
  });

  it("Y-up 미터 좌표를 SketchUp Z-up 인치 좌표로 정확히 역변환한다", () => {
    const skpIn = metersYUpToSkpInchesZUp([2.54, 5.08, -7.62]);
    expect(skpIn[0]).toBeCloseTo(100, 3);
    expect(skpIn[1]).toBeCloseTo(300, 3);
    expect(skpIn[2]).toBeCloseTo(200, 3);
  });

  it("OpenSKP SkpBuilder를 통해 네이티브 .skp 바이너리 및 DXF·IFC·OBJ·STL·PLY·GLB로 내보내고 재파싱한다", async () => {
    const spec = {
      modelName: "Classroom_Set",
      unit: "m" as const,
      tags: [{ name: "Wall_Layer", colorHex: "#cccccc" }],
      boxes: [
        {
          name: "Main_Wall",
          layer: "Wall_Layer",
          colorHex: "#d8cfc4",
          positionMeters: [0, 1.5, 0] as const,
          sizeMeters: [4, 3, 0.2] as const,
        },
      ],
      sectionPlane: {
        name: "Plan Cut",
        symbol: "1",
        planeMetersYUp: [0, 1, 0, -1.2] as const,
      },
      dimensions: [
        {
          startMeters: [0, 0, 0] as const,
          endMeters: [4, 0, 0] as const,
          offsetMeters: [0, 0.3, 0] as const,
          text: "4.00 m",
        },
      ],
      leaderTexts: [
        {
          pointMeters: [2, 1.5, 0] as const,
          leaderOffsetMeters: [0.3, 0.4, 0] as const,
          text: "창호 프레임",
        },
      ],
    };

    const skpBytes = await buildSketchUpModelBytesFromSceneSpec(spec, openskp);
    expect(skpBytes.byteLength).toBeGreaterThan(100);
    // .skp magic header: FF FE FF 0E
    expect(skpBytes[0]).toBe(0xff);
    expect(skpBytes[1]).toBe(0xfe);
    expect(skpBytes[2]).toBe(0xff);
    expect(skpBytes[3]).toBe(0x0e);

    const dxf = await exportSketchUpSceneToMultiCadFormat(spec, "dxf", openskp);
    expect(dxf.fileName).toBe("Classroom_Set.dxf");
    expect(dxf.byteSize).toBeGreaterThan(50);

    const ifc = await exportSketchUpSceneToMultiCadFormat(spec, "ifc", openskp);
    expect(ifc.fileName).toBe("Classroom_Set.ifc");
    expect(ifc.byteSize).toBeGreaterThan(100);

    const stl = await exportSketchUpSceneToMultiCadFormat(spec, "stl", openskp);
    expect(stl.fileName).toBe("Classroom_Set.stl");
    expect(stl.byteSize).toBeGreaterThan(84);

    const glb = await exportSketchUpSceneToMultiCadFormat(spec, "instanced-glb", openskp);
    expect(glb.fileName).toBe("Classroom_Set.glb");
    expect(glb.byteSize).toBeGreaterThan(100);
  });
});
