import { describe, expect, it } from "vitest";

import { applyMatrix2DToPoint } from "./studio-light-table";
import {
  computeCamera2DFramingRect,
  computeCamera2DViewMatrix,
  createStudioAnimCamera2DFolder,
  evaluateCamera2DAtFrame,
  generateCamera2DLocus,
  setCamera2DKeyframe,
} from "./studio-anim-camera-2d";

describe("studio-anim-camera-2d — 2D 카메라 폴더 및 궤적(Locus)", () => {
  it("카메라 이동·줌·회전 채널을 평가하고 정확한 뷰 행렬과 프레이밍 사각형을 계산한다", () => {
    let cam = createStudioAnimCamera2DFolder({
      id: "cam-1",
      name: "메인 카메라",
      baseWidth: 1920,
      baseHeight: 1080,
      memberTrackIds: ["layer-bg", "layer-char"],
    });

    cam = setCamera2DKeyframe(
      cam,
      0,
      { centerX: 960, centerY: 540, zoom: 1, rotationDeg: 0 },
      "linear",
    );
    cam = setCamera2DKeyframe(
      cam,
      10,
      { centerX: 1200, centerY: 400, zoom: 2, rotationDeg: 90 },
      "linear",
    );

    const mid = evaluateCamera2DAtFrame(cam, 5);
    expect(mid.centerX).toBeCloseTo(1080, 6);
    expect(mid.centerY).toBeCloseTo(470, 6);
    expect(mid.zoom).toBeCloseTo(1.5, 6);
    expect(mid.rotationDeg).toBeCloseTo(45, 6);

    // 10f에서 카메라 중심(1200, 400)은 뷰포트 정중앙(960, 540)으로 사상되어야 한다.
    const view10 = computeCamera2DViewMatrix(cam, 10);
    const projectedCenter = applyMatrix2DToPoint(view10, 1200, 400);
    expect(projectedCenter.x).toBeCloseTo(960, 6);
    expect(projectedCenter.y).toBeCloseTo(540, 6);

    // zoom=2이므로 월드 공간 프레이밍 폭·높이는 절반(960 x 540)이고 90도 회전으로 AABB 폭·높이가 교차한다.
    const rect10 = computeCamera2DFramingRect(cam, 10);
    expect(rect10.width).toBeCloseTo(960, 6);
    expect(rect10.height).toBeCloseTo(540, 6);
    expect(rect10.aabb.maxX - rect10.aabb.minX).toBeCloseTo(540, 5);
    expect(rect10.aabb.maxY - rect10.aabb.minY).toBeCloseTo(960, 5);
  });

  it("카메라 이동 궤적(locus) 폴리라인과 프레임별 수직 눈금(tick mark)을 생성한다", () => {
    let cam = createStudioAnimCamera2DFolder({
      id: "cam-locus",
      baseWidth: 1280,
      baseHeight: 720,
    });
    cam = setCamera2DKeyframe(cam, 0, { centerX: 100, centerY: 200 }, "linear");
    cam = setCamera2DKeyframe(cam, 4, { centerX: 500, centerY: 200 }, "linear");

    const locus = generateCamera2DLocus(cam, {
      startFrame: 0,
      endFrame: 4,
      subStepsPerFrame: 2,
      tickHalfLengthPx: 6,
    });

    expect(locus.polyline).toHaveLength(9); // 4프레임 * 2서브스텝 + 1
    expect(locus.frameTicks).toHaveLength(5);
    expect(locus.frameTicks[0]!.isKeyframe).toBe(true);
    expect(locus.frameTicks[2]!.isKeyframe).toBe(false);
    expect(locus.frameTicks[4]!.isKeyframe).toBe(true);

    // 수평 이동(dx > 0, dy = 0) 중이므로 눈금은 수직(x 동일, y 차이 12px)이어야 한다.
    const tick2 = locus.frameTicks[2]!;
    expect(tick2.x).toBeCloseTo(300, 6);
    expect(tick2.p1.x).toBeCloseTo(300, 6);
    expect(tick2.p2.x).toBeCloseTo(300, 6);
    expect(Math.abs(tick2.p2.y - tick2.p1.y)).toBeCloseTo(12, 6);
  });
});
