import { describe, expect, it } from "vitest";

import {
  analyzeReaderPagesEyeFlow,
  analyzeStudioPageEyeFlow,
  type EyeFlowPageLike,
} from "./studio-eyeflow-page-adapter";

describe("studio-eyeflow-page-adapter", () => {
  it("ToonStudio 말풍선(tailAnchorPoint·tailDirection·tailHeight)과 캐릭터 요소를 실제 페이지에서 분석한다", () => {
    const page: EyeFlowPageLike = {
      id: "page-1",
      name: "1페이지",
      canvasW: 720,
      canvasH: 1_280,
      elements: [
        { id: "cut-1", type: "frame", x: 20, y: 20, width: 680, height: 620 },
        {
          id: "char-1",
          type: "character",
          name: "유진",
          x: 240,
          y: 220,
          width: 240,
          height: 400,
        },
        {
          id: "b-1",
          type: "bubble",
          x: 60,
          y: 80,
          width: 180,
          height: 84,
          text: "잠깐만, 거기 서!",
          tail: "right",
          tailAnchorPoint: { x: 360, y: 280 }, // 캐릭터 얼굴·눈 영역 관통
        },
        {
          id: "b-2",
          type: "bubble",
          x: 470,
          y: 120,
          width: 180,
          height: 84,
          text: "무슨 일이야?",
          tail: "left",
          tailDirection: "bottom",
          tailXRatio: 0.3,
          tailHeight: 40,
        },
      ],
    };

    const result = analyzeStudioPageEyeFlow(page);
    expect(result.nodes).toHaveLength(2);
    expect(result.faces).toHaveLength(1);
    expect(result.faces[0]?.label).toBe("유진");
    expect(result.reversals).toHaveLength(0);
    expect(result.occlusions.length).toBeGreaterThanOrEqual(1);
    expect(result.occlusions[0]?.balloonId).toBe("b-1");
    expect(result.occlusions[0]?.recommendedTailTip).not.toBeNull();
  });

  it("숨김·투명 요소와 일반 배경 이미지는 오탐 없이 제외한다", () => {
    const page: EyeFlowPageLike = {
      id: "page-bg",
      canvasH: 1_280,
      elements: [
        { id: "bg-img", type: "image", x: 0, y: 0, width: 720, height: 1_280 },
        { id: "hidden-b", type: "bubble", hidden: true, x: 500, y: 100, width: 160, height: 70 },
        { id: "zero-op", type: "bubble", opacity: 0, x: 100, y: 100, width: 160, height: 70 },
        { id: "b-1", type: "bubble", x: 80, y: 120, width: 160, height: 70, text: "안녕" },
      ],
    };

    const result = analyzeStudioPageEyeFlow(page);
    expect(result.nodes).toHaveLength(1);
    expect(result.faces).toHaveLength(0);
    expect(result.occlusions).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  it("다중 페이지 통합 요약에서 심각(critical) 경고를 주의(warning)보다 먼저 정렬한다", () => {
    const pages: EyeFlowPageLike[] = [
      {
        id: "p1",
        canvasH: 1_280,
        elements: [
          // 같은 행 우→좌 역행 (warning)
          { id: "b1", type: "bubble", x: 460, y: 120, width: 180, height: 80 },
          { id: "b2", type: "bubble", x: 60, y: 130, width: 180, height: 80 },
        ],
      },
      {
        id: "p2",
        canvasH: 1_280,
        elements: [
          // 눈 가림 (critical)
          {
            id: "f1",
            type: "face",
            label: "소연",
            x: 280,
            y: 260,
            width: 160,
            height: 180,
          },
          {
            id: "b3",
            type: "bubble",
            x: 60,
            y: 80,
            width: 180,
            height: 80,
            tailAnchorPoint: { x: 360, y: 330 },
          },
        ],
      },
    ];

    const summary = analyzeReaderPagesEyeFlow(pages, "ltr-ttb");
    expect(summary.totalBalloons).toBe(3);
    expect(summary.totalFaces).toBe(1);
    expect(summary.reversalCount).toBe(1);
    expect(summary.occlusionCount).toBe(1);
    expect(summary.criticalCount).toBe(1);
    expect(summary.warningCount).toBe(1);
    expect(summary.issues[0]?.severity).toBe("critical");
    expect(summary.issues[0]?.pageId).toBe("p2");
    expect(summary.issues[1]?.severity).toBe("warning");
    expect(summary.issues[1]?.pageId).toBe("p1");
  });
});
