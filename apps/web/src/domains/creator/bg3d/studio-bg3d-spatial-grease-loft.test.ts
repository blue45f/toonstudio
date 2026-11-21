import { describe, expect, it } from "vitest";

import {
  applySpatialLiquifyWarp,
  bendGuideSurfaceWithArc,
  buildSpatialStrokeRibbonGeometry,
  createCameraPlaneGuide,
  deserializeSpatialGreaseDocument,
  evaluateSpatialStrokeModifiers,
  loftGuideSurfaceFromCurves,
  projectRaysOntoGuideSurface,
  serializeSpatialGreaseDocument,
  unpackSpatialStrokePoints,
} from "./studio-bg3d-spatial-grease-loft";

describe("studio-bg3d-spatial-grease-loft", () => {
  it("가이드 평면을 원통형으로 굽히고 레이캐스트로 3D 스트로크를 자석 흡착한다", () => {
    const plane = createCameraPlaneGuide({
      id: "guide-1",
      origin: [0, 1, 0],
      cameraForward: [0, 0, -1],
      widthM: 2,
      heightM: 2,
      uSteps: 4,
      vSteps: 4,
    });
    const bent = bendGuideSurfaceWithArc(plane, 0.4, "u");
    expect(bent.kind).toBe("bend-cylinder");

    const stroke = projectRaysOntoGuideSurface({
      strokeId: "stroke-1",
      guide: bent,
      rays: [
        { origin: [-0.5, 1, 3], direction: [0, 0, -1], pressure: 0.6 },
        { origin: [0, 1, 3], direction: [0, 0, -1], pressure: 1.0 },
        { origin: [0.5, 1, 3], direction: [0, 0, -1], pressure: 0.5 },
      ],
    });
    const pts = unpackSpatialStrokePoints(stroke.packedPoints);
    expect(pts).toHaveLength(3);
    // 가운데 점이 벤드 곡률(0.4m)만큼 카메라 쪽(+z)으로 돌출돼 있어야 한다.
    expect(pts[1]!.z).toBeGreaterThan(pts[0]!.z + 0.1);
  });

  it("4개 경계 곡선 Coons 로프트, 비파괴 모디파이어(미러·테이퍼·노이즈), 3D 리퀴파이, 리본 지오메트리 및 직렬화를 검증한다", () => {
    const loft = loftGuideSurfaceFromCurves({
      id: "loft-1",
      curves: [
        [[-1, 0, 0], [1, 0, 0]],
        [[-1, 2, 0.3], [1, 2, 0.3]],
        [[-1, 0, 0], [-1, 2, 0.3]],
        [[1, 0, 0], [1, 2, 0.3]],
      ],
      uSteps: 4,
      vSteps: 4,
    });
    expect(loft.kind).toBe("coons-loft");
    expect(loft.gridPoints).toHaveLength(25);

    const stroke = projectRaysOntoGuideSurface({
      strokeId: "stroke-loft",
      guide: loft,
      rays: [
        { origin: [-0.4, 0.5, 4], direction: [0, 0, -1], pressure: 0.8 },
        { origin: [0, 1.0, 4], direction: [0, 0, -1], pressure: 0.9 },
        { origin: [0.4, 1.5, 4], direction: [0, 0, -1], pressure: 0.8 },
      ],
    });

    const withMods = {
      ...stroke,
      modifiers: [
        { kind: "taper" as const, startRatio: 0.2, endRatio: 0.2 },
        { kind: "noise" as const, amplitude: 0.01, frequency: 3, seed: 7 },
        { kind: "mirror" as const, axis: "x" as const, pivot: 0 },
      ],
    };
    const branches = evaluateSpatialStrokeModifiers(withMods);
    expect(branches).toHaveLength(2);
    expect(branches[0]![0]!.pressure).toBe(0);

    const warped = applySpatialLiquifyWarp(stroke, [0, 1.0, 0.15], [0, 0.3, 0], 0.5, 1);
    const warpedPts = unpackSpatialStrokePoints(warped.packedPoints);
    expect(warpedPts[1]!.y).toBeGreaterThan(1.2);

    const ribbon = buildSpatialStrokeRibbonGeometry(warpedPts, 0.02, [0, 1, 5]);
    expect(ribbon.vertexCount).toBe(6);
    expect(ribbon.triangleCount).toBe(4);

    const serialized = serializeSpatialGreaseDocument({
      version: 1,
      guides: [loft],
      strokes: [withMods],
    });
    expect(serialized.ok).toBe(true);
    if (serialized.ok) {
      const roundTrip = deserializeSpatialGreaseDocument(serialized.json);
      expect(roundTrip.strokes[0]!.id).toBe("stroke-loft");
      expect(roundTrip.strokes[0]!.packedPoints.length).toBe(stroke.packedPoints.length);
    }
  });
});
