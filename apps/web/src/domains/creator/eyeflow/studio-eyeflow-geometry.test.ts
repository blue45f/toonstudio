import { describe, expect, it } from "vitest";

import {
  analyzeEyeFlowAndTailGuard,
  computeBalloonTailBase,
  deriveDefaultEyeBounds,
  intersectAabb,
  intersectSegmentAabb,
  suggestZPatternReadingOrder,
} from "./studio-eyeflow-geometry";

describe("intersectSegmentAabb (Liang-Barsky 선분-AABB 교차 판정)", () => {
  const box = { x: 100, y: 100, width: 100, height: 80 };

  it("대각선 선분이 AABB를 관통하면 진입·이탈·중심 좌표와 길이를 정확히 계산한다", () => {
    const hit = intersectSegmentAabb({ x: 50, y: 140 }, { x: 250, y: 140 }, box);
    expect(hit).not.toBeNull();
    expect(hit?.entryPoint).toEqual({ x: 100, y: 140 });
    expect(hit?.exitPoint).toEqual({ x: 200, y: 140 });
    expect(hit?.midpoint).toEqual({ x: 150, y: 140 });
    expect(hit?.clippedLength).toBe(100);
    expect(hit?.tEnter).toBeCloseTo(0.25, 2);
    expect(hit?.tExit).toBeCloseTo(0.75, 2);
  });

  it("수직·수평 선분과 박스 외부 비교차 선분을 정확히 판별한다", () => {
    const verticalHit = intersectSegmentAabb({ x: 150, y: 20 }, { x: 150, y: 150 }, box);
    expect(verticalHit?.entryPoint).toEqual({ x: 150, y: 100 });
    expect(verticalHit?.exitPoint).toEqual({ x: 150, y: 150 });

    const outsideParallel = intersectSegmentAabb({ x: 90, y: 20 }, { x: 90, y: 200 }, box);
    expect(outsideParallel).toBeNull();

    const outsideDiagonal = intersectSegmentAabb({ x: 0, y: 0 }, { x: 90, y: 90 }, box);
    expect(outsideDiagonal).toBeNull();
  });

  it("비유한 좌표나 0 이하 크기 박스는 안전하게 null을 반환한다", () => {
    expect(intersectSegmentAabb({ x: Number.NaN, y: 0 }, { x: 10, y: 10 }, box)).toBeNull();
    expect(
      intersectSegmentAabb({ x: 0, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 0, width: 0, height: 50 }),
    ).toBeNull();
  });
});

describe("intersectAabb & computeBalloonTailBase", () => {
  it("겹침 면적과 대상 면적 대비 비율을 계산한다", () => {
    const overlap = intersectAabb(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 50, y: 0, width: 100, height: 100 },
    );
    expect(overlap).toEqual({
      rect: { x: 50, y: 0, width: 50, height: 100 },
      area: 5_000,
      targetCoverageRatio: 0.5,
    });
  });

  it("꼬리 밑동 좌표를 말풍선 내접 타원 경계 위에 산출한다", () => {
    const base = computeBalloonTailBase(
      { x: 100, y: 100, width: 200, height: 100 },
      { x: 200, y: 300 },
    );
    expect(base).toEqual({ x: 200, y: 200 });
  });
});

describe("analyzeEyeFlowAndTailGuard — Z-패턴 시선 동선 분석", () => {
  it("표준 한국어/글로벌 좌→우·상→하 Z-패턴은 역주행 0건, 100점으로 통과한다", () => {
    const result = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_280,
      balloons: [
        { id: "b1", readingOrder: 1, bounds: { x: 40, y: 80, width: 180, height: 80 } },
        { id: "b2", readingOrder: 2, bounds: { x: 440, y: 90, width: 180, height: 80 } },
        { id: "b3", readingOrder: 3, bounds: { x: 60, y: 320, width: 180, height: 80 } },
        { id: "b4", readingOrder: 4, bounds: { x: 460, y: 340, width: 180, height: 80 } },
      ],
      faces: [],
    });

    expect(result.reversals).toHaveLength(0);
    expect(result.score).toBe(100);
    expect(result.status).toBe("clear");
    expect(result.segments.map((segment) => segment.reason)).toEqual([
      "natural-z-right",
      "natural-z-sweep",
      "natural-z-right",
    ]);
  });

  it("다음 말풍선이 이전보다 위쪽이면 상향 역주행(upward-reversal)을 검출한다", () => {
    const result = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_280,
      balloons: [
        { id: "b1", readingOrder: 1, bounds: { x: 120, y: 420, width: 180, height: 80 } },
        { id: "b2", readingOrder: 2, bounds: { x: 180, y: 140, width: 180, height: 80 } },
      ],
      faces: [],
    });

    expect(result.reversals).toHaveLength(1);
    expect(result.reversals[0]?.reason).toBe("upward-reversal");
    expect(result.reversals[0]?.severity).toBe("critical");
    expect(result.status).toBe("blocked");
    expect(result.score).toBeLessThan(100);
  });

  it("우하→좌상으로 급격히 점프하면 좌상향 역주행(upward-left-jump)을 심각 경고로 검출한다", () => {
    const result = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_280,
      balloons: [
        { id: "b1", readingOrder: 1, bounds: { x: 460, y: 420, width: 180, height: 80 } },
        { id: "b2", readingOrder: 2, bounds: { x: 60, y: 160, width: 180, height: 80 } },
      ],
      faces: [],
    });

    expect(result.reversals).toHaveLength(1);
    expect(result.reversals[0]?.reason).toBe("upward-left-jump");
    expect(result.reversals[0]?.severity).toBe("critical");
    expect(result.reversals[0]?.messageKo).toContain("왼쪽 위");
  });

  it("같은 행에서 오른쪽→왼쪽으로 읽히면 행 내 역주행(same-row-backtrack)을 검출한다", () => {
    const result = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_280,
      balloons: [
        { id: "b1", readingOrder: 1, bounds: { x: 460, y: 120, width: 180, height: 80 } },
        { id: "b2", readingOrder: 2, bounds: { x: 60, y: 130, width: 180, height: 80 } },
      ],
      faces: [],
    });

    expect(result.reversals).toHaveLength(1);
    expect(result.reversals[0]?.reason).toBe("same-row-backtrack");
    expect(result.reversals[0]?.severity).toBe("warning");
    expect(result.status).toBe("caution");
  });

  it("일본 만화 우→좌(rtl-ttb) 모드에서는 우→좌가 정상이고 좌→우가 역행이다", () => {
    const rtlNatural = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_280,
      direction: "rtl-ttb",
      balloons: [
        { id: "b1", readingOrder: 1, bounds: { x: 460, y: 120, width: 180, height: 80 } },
        { id: "b2", readingOrder: 2, bounds: { x: 60, y: 130, width: 180, height: 80 } },
      ],
      faces: [],
    });
    expect(rtlNatural.reversals).toHaveLength(0);

    const rtlReverse = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_280,
      direction: "rtl-ttb",
      balloons: [
        { id: "b1", readingOrder: 1, bounds: { x: 60, y: 120, width: 180, height: 80 } },
        { id: "b2", readingOrder: 2, bounds: { x: 460, y: 130, width: 180, height: 80 } },
      ],
      faces: [],
    });
    expect(rtlReverse.reversals).toHaveLength(1);
    expect(rtlReverse.reversals[0]?.reason).toBe("same-row-backtrack");
  });

  it("suggestZPatternReadingOrder는 행 밴딩을 반영한 표준 Z-순서 ID를 제안한다", () => {
    const orderLtr = suggestZPatternReadingOrder(
      [
        { id: "row1-right", bounds: { x: 450, y: 112, width: 150, height: 70 } },
        { id: "row2-left", bounds: { x: 60, y: 310, width: 150, height: 70 } },
        { id: "row1-left", bounds: { x: 50, y: 100, width: 150, height: 70 } },
      ],
      "ltr-ttb",
    );
    expect(orderLtr).toEqual(["row1-left", "row1-right", "row2-left"]);
  });
});

describe("analyzeEyeFlowAndTailGuard — 말풍선 본체·꼬리 얼굴/눈 가림 및 보정 좌표", () => {
  const heroFace = {
    id: "hero-face",
    label: "주인공",
    faceBounds: { x: 260, y: 260, width: 160, height: 180 },
  };
  const heroEyes = deriveDefaultEyeBounds(heroFace.faceBounds);

  it("꼬리 선분이 눈 영역을 관통하면 critical 눈 가림 경고와 비교차 권장 꼬리 좌표를 산출한다", () => {
    const result = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_280,
      balloons: [
        {
          id: "b1",
          readingOrder: 1,
          bounds: { x: 60, y: 80, width: 180, height: 90 },
          tailTip: { x: 350, y: 330 }, // 눈 영역 정중앙 관통
        },
      ],
      faces: [heroFace],
    });

    expect(result.occlusions).toHaveLength(1);
    const occ = result.occlusions[0]!;
    expect(occ.kind).toBe("tail-crosses-eyes");
    expect(occ.severity).toBe("critical");
    expect(occ.recommendedTailTip).not.toBeNull();
    expect(occ.tailBase).not.toBeNull();

    // 권장 꼬리 선분은 눈과 얼굴 영역을 전혀 교차하지 않아야 한다.
    expect(
      intersectSegmentAabb(occ.tailBase!, occ.recommendedTailTip!, heroEyes),
    ).toBeNull();
    expect(
      intersectSegmentAabb(occ.tailBase!, occ.recommendedTailTip!, heroFace.faceBounds),
    ).toBeNull();
  });

  it("꼬리 선분이 눈을 피해 아래 턱/볼만 스치면 warning 얼굴 가림 경고와 안전 후퇴 좌표를 산출한다", () => {
    const result = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_280,
      balloons: [
        {
          id: "b1",
          readingOrder: 1,
          bounds: { x: 60, y: 460, width: 180, height: 80 },
          tailTip: { x: 340, y: 410 }, // 얼굴 하단(턱/입) 진입, 눈 영역은 미관통
        },
      ],
      faces: [heroFace],
    });

    expect(result.occlusions).toHaveLength(1);
    const occ = result.occlusions[0]!;
    expect(occ.kind).toBe("tail-crosses-face");
    expect(occ.severity).toBe("warning");
    expect(occ.recommendedTailTip).not.toBeNull();
    expect(
      intersectSegmentAabb(occ.tailBase!, occ.recommendedTailTip!, heroFace.faceBounds),
    ).toBeNull();
  });

  it("얼굴 바깥 안전 거리에 멈춘 꼬리는 가림 경고 0건으로 통과한다", () => {
    const result = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_280,
      balloons: [
        {
          id: "b1",
          readingOrder: 1,
          bounds: { x: 40, y: 100, width: 160, height: 80 },
          tailTip: { x: 235, y: 245 }, // 얼굴 좌상단 바깥 안전 여백에서 정지
        },
      ],
      faces: [heroFace],
    });

    expect(result.occlusions).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  it("말풍선 본체가 캐릭터 눈 또는 얼굴을 덮으면 body-covers-eyes/face 경고를 발생시킨다", () => {
    const eyeCover = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_280,
      balloons: [
        {
          id: "b-eye",
          readingOrder: 1,
          bounds: { x: 270, y: 280, width: 140, height: 70 },
        },
      ],
      faces: [heroFace],
    });
    expect(eyeCover.occlusions[0]?.kind).toBe("body-covers-eyes");
    expect(eyeCover.occlusions[0]?.severity).toBe("critical");

    const chinCover = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_280,
      balloons: [
        {
          id: "b-chin",
          readingOrder: 1,
          bounds: { x: 280, y: 390, width: 140, height: 70 },
        },
      ],
      faces: [heroFace],
    });
    expect(chinCover.occlusions[0]?.kind).toBe("body-covers-face");
    expect(chinCover.occlusions[0]?.severity).toBe("warning");
  });

  it("추가 꼬리(extraTailTips)가 다른 인물의 눈을 찌르는 경우에도 정확히 경고한다", () => {
    const secondFace = {
      id: "rival-face",
      label: "상대역",
      faceBounds: { x: 480, y: 260, width: 140, height: 160 },
    };
    const result = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_280,
      balloons: [
        {
          id: "b-dual",
          readingOrder: 1,
          bounds: { x: 260, y: 60, width: 200, height: 80 },
          tailTip: { x: 245, y: 245 }, // 주인공 얼굴은 안전
          extraTailTips: [{ x: 550, y: 320 }], // 상대역 눈 관통
        },
      ],
      faces: [heroFace, secondFace],
    });

    expect(result.occlusions).toHaveLength(1);
    expect(result.occlusions[0]?.faceId).toBe("rival-face");
    expect(result.occlusions[0]?.kind).toBe("tail-crosses-eyes");
  });

  it("말풍선이 얼굴 바로 옆에 붙어 직선 후퇴가 어려운 경우에도 눈을 피해 턱선 외곽 보정 좌표를 찾는다", () => {
    const result = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_280,
      balloons: [
        {
          id: "b-tight",
          readingOrder: 1,
          bounds: { x: 110, y: 270, width: 148, height: 74 },
          tailBase: { x: 256, y: 315 }, // padded face 안쪽에 가까운 밑동
          tailTip: { x: 350, y: 330 }, // 눈 정중앙 관통
        },
      ],
      faces: [heroFace],
    });

    const tailOcc = result.occlusions.find((item) => item.kind === "tail-crosses-eyes");
    expect(tailOcc).toBeDefined();
    expect(tailOcc?.recommendedTailTip).not.toBeNull();
    expect(
      intersectSegmentAabb(tailOcc!.tailBase!, tailOcc!.recommendedTailTip!, heroEyes),
    ).toBeNull();
  });

  it("다중 컷에서 아래 컷에서 위 컷으로 읽기 순번이 되돌아가면 심각 역주행으로 판정한다", () => {
    const result = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_400,
      cuts: [
        { id: "cut-1", bounds: { x: 20, y: 20, width: 680, height: 600 } },
        { id: "cut-2", bounds: { x: 20, y: 660, width: 680, height: 600 } },
      ],
      balloons: [
        { id: "b-lower", readingOrder: 1, bounds: { x: 120, y: 740, width: 180, height: 80 } },
        { id: "b-upper", readingOrder: 2, bounds: { x: 160, y: 120, width: 180, height: 80 } },
      ],
      faces: [],
    });

    expect(result.reversals).toHaveLength(1);
    expect(result.reversals[0]?.severity).toBe("critical");
  });

  it("빈 말풍선 목록이나 단일 말풍선은 오류 없이 안전하게 100점으로 처리한다", () => {
    const empty = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_280,
      balloons: [],
      faces: [],
    });
    expect(empty.score).toBe(100);
    expect(empty.status).toBe("clear");
    expect(empty.summaryKo).toContain("말풍선이 없습니다");
  });
});
