/**
 * 마네킹 가독성 계약 테스트 — 윤곽선 모드 판정과 가동범위 아크 스펙은 순수 함수라
 * WebGL 없이 검증한다. 리밋 수치는 studio-mannequin-model의 리밋 표가 단일 진실
 * 원천이므로, 테스트는 표에서 읽은 값과 아크가 일치하는지(고정 복사본 아님)를 본다.
 */
import { describe, expect, it } from "vitest";

import { getStudioMannequinJointLimit } from "./studio-mannequin-model";
import {
  buildStudioMannequinJointRangeArc,
  resolveStudioMannequinOutlineMode,
  resolveStudioMannequinOutlineVisible,
  resolveStudioMannequinRangeArcAxis,
  STUDIO_MANNEQUIN_OUTLINE_MODES,
  STUDIO_MANNEQUIN_RANGE_ARC_SEGMENTS,
  studioMannequinRangeArcPoint,
} from "./studio-mannequin-readability";

describe("resolveStudioMannequinOutlineMode", () => {
  it("유효한 모드는 그대로, 알 수 없는 입력은 auto로 fail-closed 한다", () => {
    expect(resolveStudioMannequinOutlineMode("on")).toBe("on");
    expect(resolveStudioMannequinOutlineMode("off")).toBe("off");
    expect(resolveStudioMannequinOutlineMode("auto")).toBe("auto");
    expect(resolveStudioMannequinOutlineMode("always")).toBe("auto");
    expect(resolveStudioMannequinOutlineMode(undefined)).toBe("auto");
    expect(resolveStudioMannequinOutlineMode(null)).toBe("auto");
  });

  it("모드 3종에 UI 라벨이 있다", () => {
    expect(STUDIO_MANNEQUIN_OUTLINE_MODES.map((mode) => mode.id)).toEqual([
      "auto",
      "on",
      "off",
    ]);
  });
});

describe("resolveStudioMannequinOutlineVisible", () => {
  it("auto는 기존 규칙(shaded만 표시)을 그대로 유지한다", () => {
    expect(
      resolveStudioMannequinOutlineVisible({ mode: "auto", style: "shaded", role: "body" }),
    ).toBe(true);
    expect(
      resolveStudioMannequinOutlineVisible({ mode: "auto", style: "wood", role: "body" }),
    ).toBe(false);
    expect(
      resolveStudioMannequinOutlineVisible({ mode: "auto", style: "clay", role: "joint" }),
    ).toBe(false);
  });

  it("on은 전 스타일에서 켜고 off는 전 스타일에서 끈다", () => {
    for (const style of ["wood", "clay", "wireframe", "magma", "bronze", "skin"] as const) {
      expect(
        resolveStudioMannequinOutlineVisible({ mode: "on", style, role: "body" }),
      ).toBe(true);
      expect(
        resolveStudioMannequinOutlineVisible({ mode: "off", style, role: "body" }),
      ).toBe(false);
    }
    expect(
      resolveStudioMannequinOutlineVisible({ mode: "off", style: "shaded", role: "body" }),
    ).toBe(false);
  });

  it("landmark·eye는 모드와 무관하게 윤곽선을 그리지 않는다", () => {
    for (const role of ["landmark", "eye"] as const) {
      expect(
        resolveStudioMannequinOutlineVisible({ mode: "on", style: "shaded", role }),
      ).toBe(false);
      expect(
        resolveStudioMannequinOutlineVisible({ mode: "auto", style: "shaded", role }),
      ).toBe(false);
    }
  });
});

describe("buildStudioMannequinJointRangeArc", () => {
  it("유효하지 않은 관절이면 null이다", () => {
    expect(buildStudioMannequinJointRangeArc({ jointId: "nope" })).toBeNull();
    expect(buildStudioMannequinJointRangeArc({ jointId: null })).toBeNull();
  });

  it("주축은 리밋 표에서 가장 넓은 축이며 구간이 표와 일치한다", () => {
    const arc = buildStudioMannequinJointRangeArc({ jointId: "leftLowerArm" });
    expect(arc).not.toBeNull();
    // 팔꿈치는 힌지 — x축 구간(-158°~6°)이 압도적으로 넓다.
    expect(arc!.axis).toBe("x");
    const limit = getStudioMannequinJointLimit("leftLowerArm");
    expect(arc!.minRad).toBeCloseTo(limit.x[0], 10);
    expect(arc!.maxRad).toBeCloseTo(limit.x[1], 10);
    expect(resolveStudioMannequinRangeArcAxis("leftLowerLeg")).toBe("x");
  });

  it("점열은 양 끝을 포함해 일정 개수이며 모두 단위 원 위에 있다", () => {
    const arc = buildStudioMannequinJointRangeArc({ jointId: "head" })!;
    expect(arc.points).toHaveLength(STUDIO_MANNEQUIN_RANGE_ARC_SEGMENTS + 1);
    for (const point of arc.points) {
      expect(Math.hypot(point[0], point[1], point[2])).toBeCloseTo(1, 10);
    }
    expect(arc.points[0]).toEqual(
      studioMannequinRangeArcPoint(arc.axis, arc.minRad),
    );
    expect(arc.points[arc.points.length - 1]).toEqual(
      studioMannequinRangeArcPoint(arc.axis, arc.maxRad),
    );
  });

  it("현재 회전을 넘기면 비율·마커·한계 상태가 채워진다", () => {
    const limit = getStudioMannequinJointLimit("leftLowerArm");
    const mid = (limit.x[0] + limit.x[1]) / 2;
    const arc = buildStudioMannequinJointRangeArc({
      jointId: "leftLowerArm",
      currentRotation: [mid, 0, 0],
    })!;
    expect(arc.currentRad).toBeCloseTo(mid, 10);
    expect(arc.currentRatio).toBeCloseTo(0.5, 10);
    expect(arc.limitState).toBe("within");
    expect(arc.currentPoint).toEqual(studioMannequinRangeArcPoint("x", mid));
  });

  it("한계에 닿으면 at-limit, 근접하면 near-limit로 경고한다", () => {
    const limit = getStudioMannequinJointLimit("leftLowerLeg");
    const atMin = buildStudioMannequinJointRangeArc({
      jointId: "leftLowerLeg",
      currentRotation: [limit.x[0], 0, 0],
    })!;
    expect(atMin.limitState).toBe("at-limit");
    expect(atMin.currentRatio).toBe(0);

    const span = limit.x[1] - limit.x[0];
    const nearMax = buildStudioMannequinJointRangeArc({
      jointId: "leftLowerLeg",
      currentRotation: [limit.x[1] - span * 0.05, 0, 0],
    })!;
    expect(nearMax.limitState).toBe("near-limit");
  });

  it("구간 밖·비유한 현재 각도는 구간 안으로 클램프해 fail-closed 한다", () => {
    const limit = getStudioMannequinJointLimit("leftLowerLeg");
    const over = buildStudioMannequinJointRangeArc({
      jointId: "leftLowerLeg",
      currentRotation: [999, 0, 0],
    })!;
    expect(over.currentRad).toBe(limit.x[1]);
    const broken = buildStudioMannequinJointRangeArc({
      jointId: "leftLowerLeg",
      currentRotation: [Number.NaN, 0, 0],
    })!;
    expect(broken.currentRad).toBe(0);
    expect(Number.isFinite(broken.currentRad!)).toBe(true);
  });

  it("현재 회전이 없으면 마커 필드는 null이다", () => {
    const arc = buildStudioMannequinJointRangeArc({ jointId: "neck" })!;
    expect(arc.currentRad).toBeNull();
    expect(arc.currentRatio).toBeNull();
    expect(arc.limitState).toBeNull();
    expect(arc.currentPoint).toBeNull();
  });
});
