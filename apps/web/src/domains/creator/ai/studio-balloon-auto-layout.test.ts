import { describe, expect, it } from "vitest";

import {
  computeBalloonTextBounds,
  generateBalloonTailSvgPath,
  solveBalloonCollisions,
  validateBalloonLayout,
  type BalloonRecord,
  type ObstacleRect,
} from "../studio-balloon-auto-layout";

describe("Studio Responsive Balloon Auto-Layout & Tail Generator", () => {
  it("computes hug-content text bounds dynamically", () => {
    const shortText = "안녕!";
    const longText = "안녕하세요, 오늘 날씨가 정말 화창하고 좋네요. 같이 산책이라도 나갈까요?";

    const rule = {
      sizeMode: "hug-content" as const,
      minWidthPx: 120,
      maxWidthPx: 400,
      paddingPx: 16,
      avoidCollisions: true,
    };

    const boundsShort = computeBalloonTextBounds(shortText, 16, rule);
    const boundsLong = computeBalloonTextBounds(longText, 16, rule);

    expect(boundsShort.width).toBe(rule.minWidthPx);
    expect(boundsLong.width).toBeGreaterThan(boundsShort.width);
    expect(boundsLong.width).toBeLessThanOrEqual(rule.maxWidthPx);
    expect(boundsLong.height).toBeGreaterThan(boundsShort.height);
  });

  it("generates smooth quadratic bezier SVG tail paths", () => {
    const bounds = { x: 100, y: 100, width: 200, height: 120 };
    const tail = {
      id: "tail_1",
      targetSpeakerPoint: [200, 300] as const,
      curvature: 0.2,
      tailWidth: 20,
    };

    const path = generateBalloonTailSvgPath(bounds, tail);
    expect(path).toContain("M ");
    expect(path).toContain("Q ");
    expect(path).toContain("200.0 300.0"); // tip point
    expect(path).toContain("Z");
  });

  it("solves collisions by displacing overlapping balloons away from character face", () => {
    const faceObstacle: ObstacleRect = {
      id: "hero_face",
      kind: "character-face",
      bounds: { x: 100, y: 100, width: 80, height: 100 },
    };

    const collidingBalloon: BalloonRecord = {
      id: "b_1",
      dialogueId: "d_1",
      text: "저기 봐!",
      fontSize: 16,
      shape: "round-rect",
      readingOrder: 1,
      bounds: { x: 110, y: 110, width: 140, height: 80 }, // Collides with face
      tails: [],
      layoutRule: { sizeMode: "hug-content", minWidthPx: 100, maxWidthPx: 300, paddingPx: 10, avoidCollisions: true },
    };

    const panelBounds = { x: 0, y: 0, width: 800, height: 1200 };
    const solved = solveBalloonCollisions([collidingBalloon], [faceObstacle], panelBounds);

    expect(solved).toHaveLength(1);
    // Solved position should not collide with face
    const solvedBounds = solved[0].bounds;
    const stillCollides =
      solvedBounds.x < faceObstacle.bounds.x + faceObstacle.bounds.width &&
      solvedBounds.x + solvedBounds.width > faceObstacle.bounds.x &&
      solvedBounds.y < faceObstacle.bounds.y + faceObstacle.bounds.height &&
      solvedBounds.y + solvedBounds.height > faceObstacle.bounds.y;

    expect(stillCollides).toBe(false);
  });

  it("validates balloon layout diagnostics", () => {
    const face: ObstacleRect = { id: "face", kind: "character-face", bounds: { x: 10, y: 10, width: 50, height: 50 } };
    const bColliding: BalloonRecord = {
      id: "b_bad",
      dialogueId: "d_bad",
      text: "충돌",
      fontSize: 14,
      shape: "oval",
      readingOrder: 1,
      bounds: { x: 20, y: 20, width: 60, height: 40 },
      tails: [{ id: "t_dangling", targetSpeakerPoint: [0, 0], curvature: 0, tailWidth: 10 }],
      layoutRule: { sizeMode: "fixed", minWidthPx: 60, maxWidthPx: 60, paddingPx: 10, avoidCollisions: false },
    };

    const diags = validateBalloonLayout([bColliding], [face]);
    expect(diags.some((d) => d.code === "OBSTACLE_COLLISION")).toBe(true);
    expect(diags.some((d) => d.code === "DANGLING_TAIL")).toBe(true);
  });

  it("preserves panel-boundary (gutter) obstacles and guarantees non-decreasing readingOrder by bounds.y across all pairs", () => {
    const panelBounds = { x: 0, y: 0, width: 720, height: 1000 };
    const obstacles: ObstacleRect[] = [
      { id: "top_gutter", kind: "panel-boundary", bounds: { x: 0, y: 0, width: 720, height: 40 } },
      { id: "mid_gutter", kind: "panel-boundary", bounds: { x: 0, y: 460, width: 720, height: 60 } },
      { id: "hero_face", kind: "character-face", bounds: { x: 200, y: 180, width: 140, height: 140 } },
    ];

    const rule = {
      sizeMode: "hug-content" as const,
      minWidthPx: 120,
      maxWidthPx: 300,
      paddingPx: 12,
      avoidCollisions: true,
    };

    const balloons: BalloonRecord[] = [
      {
        id: "b_1",
        dialogueId: "d_1",
        text: "첫 대사",
        fontSize: 18,
        shape: "oval",
        readingOrder: 1,
        bounds: { x: 180, y: 20, width: 160, height: 80 }, // top_gutter 침범
        tails: [],
        layoutRule: rule,
      },
      {
        id: "b_2",
        dialogueId: "d_2",
        text: "둘째 대사",
        fontSize: 18,
        shape: "oval",
        readingOrder: 2,
        bounds: { x: 210, y: 200, width: 160, height: 80 }, // hero_face 충돌
        tails: [],
        layoutRule: rule,
      },
      {
        id: "b_3",
        dialogueId: "d_3",
        text: "셋째 대사",
        fontSize: 18,
        shape: "oval",
        readingOrder: 3,
        bounds: { x: 220, y: 450, width: 160, height: 80 }, // mid_gutter 침범
        tails: [],
        layoutRule: rule,
      },
    ];

    const solved = solveBalloonCollisions(balloons, obstacles, panelBounds);
    expect(solved).toHaveLength(3);

    // 1. 패널 경계 및 거터(panel-boundary) 침범 0건
    for (const b of solved) {
      expect(b.bounds.x).toBeGreaterThanOrEqual(panelBounds.x);
      expect(b.bounds.y).toBeGreaterThanOrEqual(panelBounds.y);
      expect(b.bounds.x + b.bounds.width).toBeLessThanOrEqual(panelBounds.x + panelBounds.width);
      expect(b.bounds.y + b.bounds.height).toBeLessThanOrEqual(panelBounds.y + panelBounds.height);
    }

    // 2. 모든 쌍(비인접 쌍 포함)에서 bounds.y 기준 readingOrder 단조 비감소 보장
    for (let i = 0; i < solved.length; i += 1) {
      for (let j = i + 1; j < solved.length; j += 1) {
        expect(solved[i]!.bounds.y).toBeLessThanOrEqual(solved[j]!.bounds.y);
        expect(solved[i]!.readingOrder).toBeLessThanOrEqual(solved[j]!.readingOrder);
      }
    }

    // 3. 해소 후 검증기 통과 (거터 충돌 0건, 읽기 순서 역전 0건)
    const diags = validateBalloonLayout(solved, obstacles);
    expect(diags.filter((d) => d.code === "READING_ORDER_INVERSION")).toHaveLength(0);
    expect(diags.filter((d) => d.code === "OBSTACLE_COLLISION")).toHaveLength(0);
  });

  it("detects non-adjacent READING_ORDER_INVERSION pairs and marks panel-boundary collisions as errors", () => {
    const rule = {
      sizeMode: "fixed" as const,
      minWidthPx: 100,
      maxWidthPx: 100,
      paddingPx: 8,
      avoidCollisions: false,
    };
    const gutter: ObstacleRect = {
      id: "gutter_1",
      kind: "panel-boundary",
      bounds: { x: 0, y: 180, width: 720, height: 40 },
    };

    const balloons: BalloonRecord[] = [
      { id: "b1", dialogueId: "d1", text: "1", fontSize: 16, shape: "oval", readingOrder: 1, bounds: { x: 20, y: 190, width: 100, height: 60 }, tails: [], layoutRule: rule },
      { id: "b2", dialogueId: "d2", text: "2", fontSize: 16, shape: "oval", readingOrder: 2, bounds: { x: 160, y: 260, width: 100, height: 60 }, tails: [], layoutRule: rule },
      // 비인접 쌍 (b1, b3) 및 (b2, b3): order=3 이 y=160 으로 b1(y=190)보다 위쪽에 역전 배치
      { id: "b3", dialogueId: "d3", text: "3", fontSize: 16, shape: "oval", readingOrder: 3, bounds: { x: 300, y: 160, width: 100, height: 60 }, tails: [], layoutRule: rule },
    ];

    const diags = validateBalloonLayout(balloons, [gutter]);
    expect(diags.some((d) => d.code === "READING_ORDER_INVERSION" && d.balloonId === "b3")).toBe(true);
    expect(diags.some((d) => d.code === "OBSTACLE_COLLISION" && d.severity === "error" && d.balloonId === "b1")).toBe(true);
  });
});
