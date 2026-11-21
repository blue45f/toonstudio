import { describe, expect, it } from "vitest";

import {
  applyHomography3x3,
  computePerspectiveCloneSample,
  createVanishingPointCage,
  evaluatePerspectiveLocalScale,
  projectCanvasPointToCage,
  tearOffOrthogonalPlane,
  tracePointAcrossCageCorner,
  type VpQuad,
} from "./studio-vanishing-point-planes";

describe("studio-vanishing-point-planes", () => {
  // 왼쪽이 크고 오른쪽(깊이 방향)으로 원근 수축하는 사다리꼴 벽면
  const leftWallQuad: VpQuad = [
    { x: 100, y: 100 },
    { x: 400, y: 180 },
    { x: 400, y: 420 },
    { x: 100, y: 500 },
  ];

  it("기준 원근 평면 호모그래피와 깊이 비례 야코비안 스케일(원거리 축소)을 정확히 계산한다", () => {
    const cage = createVanishingPointCage({
      cageId: "room-01",
      rootPlaneId: "wall-left",
      quad: leftWallQuad,
      widthWorld: 300,
      heightWorld: 400,
    });
    const wall = cage.planes.get("wall-left")!;
    expect(wall.vanishingPointU).not.toBeNull();
    expect(wall.vanishingPointU!.x).toBeGreaterThan(400);

    // 꼭짓점 왕복 투영 정밀도
    const mappedBr = applyHomography3x3(wall.homography, { x: 300, y: 400 });
    expect(mappedBr.x).toBeCloseTo(400, 3);
    expect(mappedBr.y).toBeCloseTo(420, 3);

    // 가까운 쪽(u=20)이 먼 쪽(u=280)보다 캔버스 스케일이 확실히 커야 한다.
    const nearScale = evaluatePerspectiveLocalScale(wall, 20, 200);
    const farScale = evaluatePerspectiveLocalScale(wall, 280, 200);
    expect(nearScale).toBeGreaterThan(farScale * 1.4);

    const hit = projectCanvasPointToCage(cage, { x: 250, y: 300 });
    expect(hit?.planeId).toBe("wall-left");
    expect(hit!.u).toBeGreaterThan(0);
    expect(hit!.u).toBeLessThan(300);
  });

  it("오른쪽 변에서 90° 인접 벽을 찢어내어 코너 절곡 UV 연속성과 원근 복제 도장 스케일을 유지한다", () => {
    const baseCage = createVanishingPointCage({
      cageId: "room-02",
      rootPlaneId: "wall-left",
      quad: leftWallQuad,
      widthWorld: 300,
      heightWorld: 400,
    });
    const cage = tearOffOrthogonalPlane(baseCage, {
      parentPlaneId: "wall-left",
      edge: "right",
      newPlaneId: "wall-front",
      depthWorld: 260,
      bendAngleDeg: 90,
      orthogonalVanishingPoint: { x: 1100, y: 300 },
    });

    const front = cage.planes.get("wall-front")!;
    // 힌지 변 공유 확인: leftWall.topRight === front.topLeft, leftWall.bottomRight === front.bottomLeft
    expect(front.quad[0]).toEqual(leftWallQuad[1]);
    expect(front.quad[3]).toEqual(leftWallQuad[2]);

    // 코너(u = 300)를 40 단위 넘어가면 인접 평면 `wall-front`의 u = 40으로 연속 절곡
    const traced = tracePointAcrossCageCorner(
      cage,
      "wall-left",
      { x: 280, y: 200 },
      { x: 60, y: 0 },
    );
    expect(traced.crossedCorner).toBe(true);
    expect(traced.planeId).toBe("wall-front");
    expect(traced.uv.x).toBeCloseTo(40, 3);
    expect(traced.uv.y).toBeCloseTo(200, 3);

    // 원근 복제 도장: 가까운 곳에서 샘플링해 먼 곳으로 찍으면 브러시 반경이 자동 축소
    const clone = computePerspectiveCloneSample(cage, {
      sourcePlaneId: "wall-left",
      sourceOriginUv: { x: 30, y: 200 },
      targetPlaneId: "wall-left",
      targetOriginUv: { x: 260, y: 200 },
      brushDeltaWorld: { x: 10, y: 0 },
      baseBrushRadiusPx: 40,
    });
    expect(clone.scaleRatio).toBeLessThan(0.75);
    expect(clone.perspectiveBrushRadiusPx).toBeLessThan(30);
  });
});
