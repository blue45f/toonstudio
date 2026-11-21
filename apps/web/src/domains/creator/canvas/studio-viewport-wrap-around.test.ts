import { describe, expect, it } from "vitest";

import {
  buildWrapBoundaryGuideSegments,
  computeVisibleWrapTileInstances,
  createViewportWrapAroundState,
  cycleViewportWrapAxisMode,
  expandWrappedBrushDab,
  expandWrappedBrushStrokeDabs,
  formatViewportWrapStatusChip,
  isViewportWrapToggleShortcut,
  toggleViewportWrapAround,
  wrapAxisCoord,
  wrapDocumentPoint,
} from "./studio-viewport-wrap-around";

describe("studio-viewport-wrap-around", () => {
  it("Shift+W 단축키 감지, 토글, 축 순환, 상태 칩 라벨이 정확히 동작한다", () => {
    expect(isViewportWrapToggleShortcut({ key: "W", shiftKey: true })).toBe(true);
    expect(isViewportWrapToggleShortcut({ key: "w", shiftKey: true })).toBe(true);
    expect(isViewportWrapToggleShortcut({ key: "W", shiftKey: false })).toBe(false);
    expect(isViewportWrapToggleShortcut({ key: "W", shiftKey: true, ctrlKey: true })).toBe(false);

    const initial = createViewportWrapAroundState();
    expect(initial.enabled).toBe(false);
    expect(formatViewportWrapStatusChip(initial)).toBe("랩어라운드 꺼짐");

    const active = toggleViewportWrapAround(initial);
    expect(active.enabled).toBe(true);
    expect(formatViewportWrapStatusChip(active)).toBe("랩어라운드 · 양축(XY)");

    const vertical = cycleViewportWrapAxisMode(active);
    expect(vertical.axisMode).toBe("vertical");
    expect(formatViewportWrapStatusChip(vertical)).toBe("랩어라운드 · 세로(Y)");

    const horizontal = cycleViewportWrapAxisMode(vertical);
    expect(horizontal.axisMode).toBe("horizontal");
    expect(formatViewportWrapStatusChip(horizontal)).toBe("랩어라운드 · 가로(X)");
  });

  it("음수·초과 좌표를 [0, size)로 정확히 모듈로 매핑하고 비활성 축은 보존한다", () => {
    expect(wrapAxisCoord(-10, 512)).toBe(502);
    expect(wrapAxisCoord(512, 512)).toBe(0);
    expect(wrapAxisCoord(1030, 512)).toBe(6);

    const doc = { width: 800, height: 1200 };
    // 세로 전용 랩어라운드(웹툰 스크롤 배경): Y만 래핑되고 X는 유지
    expect(wrapDocumentPoint({ x: -25, y: 1250 }, doc, "vertical")).toEqual({
      x: -25,
      y: 50,
    });
    expect(wrapDocumentPoint({ x: -25, y: 1250 }, doc, "horizontal")).toEqual({
      x: 775,
      y: 1250,
    });
    expect(wrapDocumentPoint({ x: -25, y: 1250 }, doc, "both")).toEqual({
      x: 775,
      y: 50,
    });
  });

  it("뷰포트 카메라(팬·줌·회전)에 맞춰 가시 타일 인스턴스 행렬(2D/4×4)을 계산한다", () => {
    const doc = { width: 500, height: 500 };
    const plan = computeVisibleWrapTileInstances({
      doc,
      camera: {
        viewportWidth: 1000,
        viewportHeight: 1000,
        panX: 250,
        panY: 250,
        zoom: 1,
        rotationDeg: 0,
      },
      axisMode: "both",
      enabled: true,
    });

    // 문서 좌표 범위 [-250..750] × [-250..750] -> 타일 인덱스 [-1..1] × [-1..1] = 9타일
    expect(plan.tileRangeX).toEqual([-1, 1]);
    expect(plan.tileRangeY).toEqual([-1, 1]);
    expect(plan.instances).toHaveLength(9);
    expect(plan.truncated).toBe(false);

    const origin = plan.instances.find((inst) => inst.isOrigin)!;
    expect(origin.matrix2d).toEqual([1, 0, 0, 1, 250, 250]);
    expect(origin.mat4ColMajor).toHaveLength(16);
    expect(origin.mat4ColMajor[12]).toBe(250);
    expect(origin.mat4ColMajor[13]).toBe(250);

    // 세로 전용 모드(vertical)에서는 X 타일 인덱스가 0으로 고정된다
    const verticalPlan = computeVisibleWrapTileInstances({
      doc,
      camera: { viewportWidth: 1000, viewportHeight: 1000, panX: 250, panY: 250, zoom: 1 },
      axisMode: "vertical",
      enabled: true,
    });
    expect(verticalPlan.tileRangeX).toEqual([0, 0]);
    expect(verticalPlan.tileRangeY).toEqual([-1, 1]);
    expect(verticalPlan.instances).toHaveLength(3);

    const guides = buildWrapBoundaryGuideSegments(verticalPlan, doc);
    expect(guides.length).toBeGreaterThan(0);
  });

  it("경계 침범 브러시 댑을 중앙(1개) · 변(2개) · 모서리(최대 4개) 토러스 복제 댑으로 전개한다", () => {
    const doc = { width: 512, height: 512 };

    // 1. 중앙 댑: 경계 미침범 -> 1개
    const center = expandWrappedBrushDab({ x: 256, y: 256, radiusPx: 24 }, doc, "both");
    expect(center).toHaveLength(1);
    expect(center[0]!.isPrimary).toBe(true);

    // 2. 오른쪽 변 침범(x=505, r=20): 원 댑 + 왼쪽 반대편(-512) -> 2개
    const edge = expandWrappedBrushDab({ x: 505, y: 200, radiusPx: 20 }, doc, "both");
    expect(edge).toHaveLength(2);
    expect(edge.map((d) => [d.x, d.y])).toEqual([
      [505, 200],
      [-7, 200],
    ]);

    // 3. 좌상단 모서리 침범(x=5, y=8, r=20): 최대 4-타일 토러스 복제
    const corner = expandWrappedBrushDab({ x: 5, y: 8, radiusPx: 20 }, doc, "both");
    expect(corner).toHaveLength(4);
    expect(corner.map((d) => [d.x, d.y])).toEqual([
      [5, 8],
      [517, 8],
      [5, 520],
      [517, 520],
    ]);

    // 4. 초대형 반경(r=400 > 512/2)도 4-타일 상한 불변식을 지킨다
    const huge = expandWrappedBrushDab({ x: 100, y: 400, radiusPx: 400 }, doc, "both");
    expect(huge.length).toBeLessThanOrEqual(4);

    // 5. 단축 모드(vertical)에서는 모서리여도 Y축만 복제(2개)
    const verticalCorner = expandWrappedBrushDab({ x: 5, y: 8, radiusPx: 20 }, doc, "vertical");
    expect(verticalCorner).toHaveLength(2);

    // 6. 스트로크 일괄 전개
    const batch = expandWrappedBrushStrokeDabs(
      [
        { x: 256, y: 256, radiusPx: 10 },
        { x: 5, y: 8, radiusPx: 20 },
      ],
      doc,
      "both",
    );
    expect(batch).toHaveLength(5);
  });
});
