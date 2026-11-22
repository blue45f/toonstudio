import { describe, expect, it } from "vitest";

import {
  createLookAtViewMatrix,
  createOrthographicProjectionMatrix,
  createPerspectiveProjectionMatrix,
  createVectorLineArtCubeMesh,
  createVectorLineArtCylinderMesh,
  extract3dVectorLineArt,
  type IndexedTriangleMesh,
} from "./studio-3d-vector-lineart-extractor";

function buildCamera(
  eye: readonly [number, number, number],
  target: readonly [number, number, number] = [0, 0, 0],
  width = 800,
  height = 600,
) {
  return {
    viewMatrix: createLookAtViewMatrix(eye, target),
    projectionMatrix: createPerspectiveProjectionMatrix(45, width / height, 0.1, 100),
    viewportWidth: width,
    viewportHeight: height,
  };
}

/** 24정점(하드 노멀 분리) 큐브 메쉬 — 정점 용접 동작 검증용. */
function createSplitNormalCubeMesh(size = 1): IndexedTriangleMesh {
  const h = size * 0.5;
  const faces: readonly (readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ])[] = [
    [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]],
    [[h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h]],
    [[h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h]],
    [[-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h]],
    [[-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h]],
    [[-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h]],
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  for (let f = 0; f < faces.length; f += 1) {
    const quad = faces[f];
    if (!quad) continue;
    const base = f * 4;
    for (const v of quad) positions.push(v[0], v[1], v[2]);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

describe("studio-3d-vector-lineart-extractor", () => {
  it("큐브를 대각선에서 볼 때 6개 실루엣 외곽선과 3개 내부 크리즈를 추출하고 후면 3개 은선을 제거한다", () => {
    const cube = createVectorLineArtCubeMesh(1.4);
    const camera = buildCamera([3.2, 2.4, 4.0]);

    const result = extract3dVectorLineArt(cube, camera, {
      creaseAngleThresholdDeg: 35,
      hiddenLineRemoval: true,
    });

    expect(result.stats.inputTriangleCount).toBe(12);
    expect(result.stats.frontFacingTriangleCount).toBe(6);
    expect(result.stats.silhouetteEdgeCount).toBe(6);
    expect(result.stats.creaseEdgeCount).toBe(3);
    expect(result.stats.boundaryEdgeCount).toBe(0);

    const silhouettes = result.polylines.filter((p) => p.kind === "silhouette");
    const creases = result.polylines.filter((p) => p.kind === "crease");
    expect(silhouettes.length).toBe(1);
    expect(silhouettes[0]?.closed).toBe(true);
    expect(silhouettes[0]?.points.length).toBe(6);
    expect(creases.length).toBeGreaterThanOrEqual(1);
    expect(result.stats.visibleSegmentCount).toBe(9);

    // 후면 엣지를 후보에 강제 포함해도 은선 제거(HLR)가 전면 면에 가린 뒤쪽 3개 모서리를 전부 차단한다.
    const withBackfacesHlrOn = extract3dVectorLineArt(cube, camera, {
      creaseAngleThresholdDeg: 35,
      includeBackfaceEdges: true,
      hiddenLineRemoval: true,
    });
    const withBackfacesHlrOff = extract3dVectorLineArt(cube, camera, {
      creaseAngleThresholdDeg: 35,
      includeBackfaceEdges: true,
      hiddenLineRemoval: false,
    });
    expect(withBackfacesHlrOn.stats.occludedEdgeSegmentCount).toBe(3);
    expect(withBackfacesHlrOn.stats.visibleSegmentCount).toBe(9);
    expect(withBackfacesHlrOff.stats.visibleSegmentCount).toBe(12);
  });

  it("실린더 측면 실루엣·캡 90° 크리즈·열린 경계 엣지 및 뒷면 림 은선 제거를 정확히 수행한다", () => {
    const cappedCylinder = createVectorLineArtCylinderMesh(0.6, 1.8, 24, true);
    const camera = buildCamera([0, 1.3, 4.6]);

    const frontOnly = extract3dVectorLineArt(cappedCylinder, camera, {
      creaseAngleThresholdDeg: 40,
      hiddenLineRemoval: true,
    });
    expect(frontOnly.stats.silhouetteEdgeCount).toBeGreaterThanOrEqual(2);
    expect(frontOnly.stats.creaseEdgeCount).toBeGreaterThan(0);
    expect(frontOnly.stats.boundaryEdgeCount).toBe(0);

    // 후면 림 후보까지 포함했을 때 HLR이 몸통 뒤쪽 하단 림을 정확히 가림 처리한다.
    const hlrOn = extract3dVectorLineArt(cappedCylinder, camera, {
      creaseAngleThresholdDeg: 40,
      includeBackfaceEdges: true,
      hiddenLineRemoval: true,
    });
    const hlrOff = extract3dVectorLineArt(cappedCylinder, camera, {
      creaseAngleThresholdDeg: 40,
      includeBackfaceEdges: true,
      hiddenLineRemoval: false,
    });
    expect(hlrOn.stats.occludedEdgeSegmentCount).toBeGreaterThan(0);
    expect(hlrOn.stats.visibleSegmentCount).toBeLessThan(hlrOff.stats.visibleSegmentCount);

    // 뚜껑 없는 실린더는 상·하단 림이 경계(boundary) 엣지로 분류되며 뒤쪽 하단 림은 앞벽에 가려진다.
    const openCylinder = createVectorLineArtCylinderMesh(0.6, 1.8, 16, false);
    const openHlrOn = extract3dVectorLineArt(openCylinder, camera, { hiddenLineRemoval: true });
    const openHlrOff = extract3dVectorLineArt(openCylinder, camera, { hiddenLineRemoval: false });
    expect(openHlrOn.stats.boundaryEdgeCount).toBeGreaterThan(0);
    expect(openHlrOn.polylines.some((p) => p.kind === "boundary")).toBe(true);
    expect(openHlrOn.stats.occludedEdgeSegmentCount).toBeGreaterThan(0);
    expect(openHlrOn.stats.visibleSegmentCount).toBeLessThan(openHlrOff.stats.visibleSegmentCount);
  });

  it("앞쪽 큐브가 뒤쪽 큐브를 완전히 가릴 때 뒷큐브 선을 100% 제거하고 부분 가림 시 경계에서 분할한다", () => {
    const frontCube = createVectorLineArtCubeMesh(2.0, [0, 0, 1.5]);
    const hiddenRearCube = createVectorLineArtCubeMesh(0.65, [0, 0, -2.0]);
    const camera = buildCamera([0, 0.2, 6.0]);

    const occluded = extract3dVectorLineArt([frontCube, hiddenRearCube], camera, {
      hiddenLineRemoval: true,
    });
    const unoccluded = extract3dVectorLineArt([frontCube, hiddenRearCube], camera, {
      hiddenLineRemoval: false,
    });

    // HLR ON: 뒤쪽 큐브(z < -1)에서 나온 가시 점이 0개여야 한다.
    const rearPointsHlrOn = occluded.polylines.flatMap((l) => l.points).filter((p) => p.worldPosition[2] < -1.0);
    const rearPointsHlrOff = unoccluded.polylines.flatMap((l) => l.points).filter((p) => p.worldPosition[2] < -1.0);
    expect(rearPointsHlrOn.length).toBe(0);
    expect(rearPointsHlrOff.length).toBeGreaterThan(0);
    expect(occluded.stats.occludedEdgeSegmentCount).toBeGreaterThan(0);

    // 부분 가림: 오른쪽으로 절반 삐져나온 뒤쪽 큐브는 가려지지 않은 바깥 구간만 남는다.
    const peekingRearCube = createVectorLineArtCubeMesh(1.4, [1.25, 0, -1.2]);
    const partialOn = extract3dVectorLineArt([frontCube, peekingRearCube], camera, {
      hiddenLineRemoval: true,
      visibilitySampleStepPx: 3,
    });
    const partialOff = extract3dVectorLineArt([frontCube, peekingRearCube], camera, {
      hiddenLineRemoval: false,
    });
    const totalLength = (res: typeof partialOn) =>
      res.polylines.reduce((sum, line) => {
        let len = 0;
        for (let i = 1; i < line.points.length; i += 1) {
          const a = line.points[i - 1];
          const b = line.points[i];
          if (a && b) len += Math.hypot(b.x - a.x, b.y - a.y);
        }
        return sum + len;
      }, 0);

    const peekingRearPoints = partialOn.polylines.flatMap((l) => l.points).filter((p) => p.worldPosition[2] < -0.3);
    expect(peekingRearPoints.length).toBeGreaterThan(0);
    expect(totalLength(partialOn)).toBeLessThan(totalLength(partialOff) * 0.92);
  });

  it("카메라 거리(근경 두껍게·원경 얇게)와 실루엣/크리즈 종류에 따라 가변 선 굵기(강약선)를 조절한다", () => {
    const nearCube = createVectorLineArtCubeMesh(0.9, [-1.1, 0, 1.4]);
    const farCube = createVectorLineArtCubeMesh(0.9, [1.5, 0, -3.2]);
    const camera = buildCamera([0.2, 0.8, 5.5]);

    const result = extract3dVectorLineArt([nearCube, farCube], camera, {
      baseWidthPx: 2.2,
      minWidthPx: 0.5,
      maxWidthPx: 6.0,
      distanceWeightStrength: 1.0,
      normalSlopeStrength: 0.7,
      silhouetteWidthScale: 1.4,
      creaseWidthScale: 0.75,
    });

    const nearSilPoints = result.polylines
      .filter((l) => l.kind === "silhouette")
      .flatMap((l) => l.points)
      .filter((p) => p.worldPosition[2] > 0.5);
    const farSilPoints = result.polylines
      .filter((l) => l.kind === "silhouette")
      .flatMap((l) => l.points)
      .filter((p) => p.worldPosition[2] < -2.0);

    expect(nearSilPoints.length).toBeGreaterThan(0);
    expect(farSilPoints.length).toBeGreaterThan(0);
    const avg = (pts: readonly { readonly widthPx: number }[]) =>
      pts.reduce((s, p) => s + p.widthPx, 0) / pts.length;

    expect(avg(nearSilPoints)).toBeGreaterThan(avg(farSilPoints));

    const silPolys = result.polylines.filter((l) => l.kind === "silhouette");
    const creasePolys = result.polylines.filter((l) => l.kind === "crease");
    expect(silPolys.length).toBeGreaterThan(0);
    expect(creasePolys.length).toBeGreaterThan(0);
    const silAvg = silPolys.reduce((s, l) => s + l.averageWidthPx, 0) / silPolys.length;
    const creaseAvg = creasePolys.reduce((s, l) => s + l.averageWidthPx, 0) / creasePolys.length;
    expect(silAvg).toBeGreaterThan(creaseAvg);

    for (const line of result.polylines) {
      expect(line.minWidthPx).toBeGreaterThanOrEqual(0.5);
      expect(line.maxWidthPx).toBeLessThanOrEqual(6.0);
    }
  });

  it("편집 가능한 SVG 문서(가변 리본·중심선 모드)·정점 용접·직교 카메라를 정상 출력한다", () => {
    const splitCube = createSplitNormalCubeMesh(1.2);
    const camera = buildCamera([2.8, 2.2, 3.6], [0, 0, 0], 640, 480);

    const bothMode = extract3dVectorLineArt(splitCube, camera, {
      weldTolerance: 1e-5,
      svgRenderMode: "both",
      strokeColor: "#141414",
    });

    // 하드 노멀 분리 24정점 큐브도 용접 후 6 실루엣 + 3 크리즈를 정확히 분류한다.
    expect(bothMode.stats.silhouetteEdgeCount).toBe(6);
    expect(bothMode.stats.creaseEdgeCount).toBe(3);
    expect(bothMode.stats.boundaryEdgeCount).toBe(0);

    expect(bothMode.svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"');
    expect(bothMode.svg).toContain('id="lineart-silhouette"');
    expect(bothMode.svg).toContain('id="lineart-crease"');
    expect(bothMode.svg).toContain('data-centerline-d="M ');
    expect(bothMode.svg).toContain('stroke="#141414"');
    expect(bothMode.svg).not.toContain("NaN");
    expect(bothMode.svg).not.toContain("Infinity");

    for (const line of bothMode.polylines) {
      expect(line.centerlinePathData.startsWith("M ")).toBe(true);
      expect(line.variableWidthPathData.startsWith("M ")).toBe(true);
      expect(line.variableWidthPathData.endsWith("Z")).toBe(true);
    }

    // 직교 투영 카메라 지원 검증
    const orthoCamera = {
      viewMatrix: createLookAtViewMatrix([3, 3, 3], [0, 0, 0]),
      projectionMatrix: createOrthographicProjectionMatrix(-2, 2, -1.5, 1.5, 0.1, 20),
      viewportWidth: 800,
      viewportHeight: 600,
    };
    const orthoResult = extract3dVectorLineArt(createVectorLineArtCubeMesh(1.0), orthoCamera);
    expect(orthoResult.stats.silhouetteEdgeCount).toBe(6);
    expect(orthoResult.stats.creaseEdgeCount).toBe(3);
    expect(orthoResult.polylines.length).toBeGreaterThanOrEqual(2);
  });
});
