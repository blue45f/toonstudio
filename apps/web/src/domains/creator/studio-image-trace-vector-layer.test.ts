import { describe, expect, it } from "vitest";

import type { DrawEl } from "./studio-element-model";
import {
  traceDrawElementToVectorStroke,
  traceElementAnchors,
  traceElementsToVectorLayer,
  traceResultToVectorLayer,
} from "./studio-image-trace-vector-layer";
import {
  isVectorLayer,
  vectorStrokeAnchors,
  vectorStrokeBounds,
} from "./vector-layer/vector-layer-model";
import { scaleVectorStrokeWidths } from "./vector-layer/vector-stroke-edit";
import { exportVectorLayerToSvg } from "./vector-layer/vector-layer-svg-export";

function tracedSquare(overrides: Partial<DrawEl> = {}): DrawEl {
  return {
    id: "traced-logo-1",
    type: "draw",
    kind: "freehand",
    mode: "pen",
    // 닫힌 링: 첫 정점(0,0)이 끝에 반복된다.
    points: [0, 0, 10, 0, 10, 10, 0, 10, 0, 0],
    stroke: "#111111",
    strokeWidth: 2,
    fill: "#ff0000",
    opacity: 0.9,
    name: "로고 원본 · 트레이싱 로고 1-1",
    ...overrides,
  } as DrawEl;
}

describe("traceElementAnchors", () => {
  it("닫힘 반복과 연속 중복을 제거한다", () => {
    const anchors = traceElementAnchors(tracedSquare());
    expect(anchors).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
    const withDup = traceElementAnchors({
      points: [0, 0, 0, 0, 5, 0, 5, 5],
    });
    expect(withDup).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
    ]);
  });
});

describe("traceDrawElementToVectorStroke", () => {
  it("닫힌 직선 큐빅 스트로크가 되고 폴리곤 기하를 보존한다", () => {
    const stroke = traceDrawElementToVectorStroke(tracedSquare());
    expect(stroke).not.toBeNull();
    expect(stroke!.id).toBe("traced-logo-1-vector");
    expect(stroke!.closed).toBe(true);
    expect(stroke!.color).toBe("#ff0000");
    expect(stroke!.opacity).toBe(0.9);
    expect(stroke!.segments).toHaveLength(4);
    expect(stroke!.widths).toEqual([2, 2, 2, 2, 2]);
    // 앵커가 원래 폴리곤 정점과 정확히 같다(곡선 근사 없음). 닫힌 링이라
    // vectorStrokeAnchors 는 마지막에 시작점을 한 번 더 돌려준다.
    expect(vectorStrokeAnchors(stroke!)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ]);
    // 첫 세그먼트는 직선: 제어점이 변의 1/3·2/3 지점.
    const first = stroke!.segments[0]!;
    expect(first.p1.x).toBeCloseTo(10 / 3);
    expect(first.p1.y).toBe(0);
    expect(first.p2.x).toBeCloseTo(20 / 3);
    // 마지막 세그먼트가 첫 앵커로 닫힌다.
    const last = stroke!.segments[3]!;
    expect(last.p3).toEqual({ x: 0, y: 0 });
  });

  it("채움이 투명이면 선 색을 쓰고, 앵커 3개 미만이면 null 이다", () => {
    const stroke = traceDrawElementToVectorStroke(
      tracedSquare({ fill: "transparent", stroke: "#00ff00" }),
    );
    expect(stroke!.color).toBe("#00ff00");
    expect(
      traceDrawElementToVectorStroke(tracedSquare({ points: [0, 0, 5, 5] })),
    ).toBeNull();
  });
});

describe("traceElementsToVectorLayer / traceResultToVectorLayer", () => {
  it("isVectorLayer 가드를 통과하는 레이어가 되고 이름은 원본명에서 파생된다", () => {
    const conversion = traceElementsToVectorLayer([tracedSquare()], { id: "layer-1" });
    expect(conversion.convertedCount).toBe(1);
    expect(conversion.skippedCount).toBe(0);
    expect(isVectorLayer(conversion.layer)).toBe(true);
    expect(conversion.layer.name).toBe("로고 원본 · 벡터 레이어");
    expect(conversion.layer.type).toBe("vector");
  });

  it("변환 불가 조각은 건너뛰고 수로 보고한다", () => {
    const conversion = traceElementsToVectorLayer(
      [tracedSquare(), tracedSquare({ id: "bad", points: [1, 1, 2, 2] })],
      { id: "layer-2", name: "지정 이름" },
    );
    expect(conversion.convertedCount).toBe(1);
    expect(conversion.skippedCount).toBe(1);
    expect(conversion.layer.name).toBe("지정 이름");
    expect(conversion.layer.strokes).toHaveLength(1);
  });

  it("주입된 스트로크는 벡터 레이어 편집·내보내기 도구가 그대로 다룬다", () => {
    const conversion = traceResultToVectorLayer(
      { elements: [tracedSquare()] },
      { id: "layer-3" },
    );
    const layer = conversion.layer;
    // 선폭 일괄 조정(편집 연산)이 동작한다.
    const scaled = scaleVectorStrokeWidths(layer.strokes, 2);
    expect(scaled[0]!.widths.every((width) => width === 4)).toBe(true);
    // 경계 상자는 굵기 절반만큼 바깥으로 잡힌다.
    expect(vectorStrokeBounds(layer.strokes[0]!)).toEqual({
      minX: -1,
      minY: -1,
      maxX: 11,
      maxY: 11,
    });
    // SVG 내보내기가 채움색을 담은 문서를 만든다.
    const exported = exportVectorLayerToSvg(layer, { width: 100, height: 100 });
    expect(exported.svg).toContain("<svg");
    expect(exported.svg).toContain("#ff0000");
    expect(exported.strokeCount).toBe(1);
  });
});
