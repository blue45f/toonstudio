import { describe, expect, it } from "vitest";

import {
  buildStudioSketchSearchGuidance,
  describeStudioSketchFeatures,
  extractStudioSketchFeatures,
  recommendStudioAssetsForSketch,
  studioSketchShapeKindsOfItem,
  studioSketchStrokePath,
  type StudioSketchPoint,
  type StudioSketchStroke,
} from "./studio-sketch-asset-recommend";
import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

const P = (x: number, y: number): StudioSketchPoint => ({ x, y });

function densePolygon(vertices: readonly StudioSketchPoint[], perEdge = 12): StudioSketchStroke {
  const points: StudioSketchPoint[] = [];
  for (let s = 0; s < vertices.length; s += 1) {
    const a = vertices[s]!;
    const b = vertices[(s + 1) % vertices.length]!;
    for (let i = 0; i < perEdge; i += 1) {
      points.push(P(a.x + ((b.x - a.x) * i) / perEdge, a.y + ((b.y - a.y) * i) / perEdge));
    }
  }
  points.push(vertices[0]!);
  return { points };
}

function ring(cx: number, cy: number, rx: number, ry: number, n = 48): StudioSketchStroke {
  const points: StudioSketchPoint[] = [];
  for (let i = 0; i <= n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    points.push(P(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
  }
  return { points };
}

function star(cx: number, cy: number, outer: number, inner: number): StudioSketchStroke {
  const vertices: StudioSketchPoint[] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    vertices.push(P(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return densePolygon(vertices, 4);
}

function heart(): StudioSketchStroke {
  const points: StudioSketchPoint[] = [];
  for (let i = 0; i <= 60; i += 1) {
    const t = (i / 60) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    points.push(P(150 + x * 5, 105 - y * 5));
  }
  return { points };
}

function makeItem(
  partial: Partial<StudioUnifiedAssetItem> & Pick<StudioUnifiedAssetItem, "id" | "title">,
): StudioUnifiedAssetItem {
  return {
    category: "element",
    scope: "studio",
    description: "",
    categoryLabel: "요소",
    keywords: [],
    badges: [],
    preview: { kind: "none" },
    useMode: "insert",
    useLabel: "삽입",
    discoverability: "standard",
    sortPriority: 100,
    source: {
      kind: "element",
      value: {
        id: partial.id,
        label: partial.title,
        category: "shape",
        keywords: [],
        width: 200,
        height: 200,
        svg: "<svg/>",
      },
    },
    ...partial,
  } as StudioUnifiedAssetItem;
}

const CATALOG: readonly StudioUnifiedAssetItem[] = [
  makeItem({ id: "element:shape-circle", title: "원", keywords: ["동그라미", "circle"] }),
  makeItem({ id: "element:shape-star", title: "별", keywords: ["star"] }),
  makeItem({ id: "element:shape-heart", title: "하트", keywords: ["heart", "사랑"] }),
  makeItem({
    id: "element:frame-simple",
    title: "심플 프레임",
    keywords: ["테두리", "frame"],
    source: {
      kind: "element",
      value: {
        id: "frame-simple", label: "심플 프레임", category: "frame",
        keywords: ["테두리"], width: 260, height: 200, svg: "<svg/>",
      },
    },
  }),
  makeItem({ id: "element:arrow-right", title: "화살표 →", keywords: ["arrow", "오른쪽"] }),
  makeItem({ id: "element:cloud", title: "구름", keywords: ["cloud", "물결"] }),
];

describe("extractStudioSketchFeatures", () => {
  it("원을 닫힌 획·모서리 0개·원 가설로 읽는다", () => {
    const features = extractStudioSketchFeatures([ring(150, 100, 70, 70)]);
    expect(features.isClosed).toBe(true);
    expect(features.cornerCount).toBe(0);
    expect(features.hypotheses[0]?.kind).toBe("circle");
    expect(features.hypotheses[0]?.confidence).toBeGreaterThan(0.7);
  });

  it("납작한 링은 타원 가설이 1순위다 (하트로 오인하지 않는다)", () => {
    const features = extractStudioSketchFeatures([ring(150, 100, 110, 45)]);
    expect(features.hypotheses[0]?.kind).toBe("ellipse");
  });

  it("사각형은 모서리 4개·사각형 가설, 마름모는 마름모 가설이 1순위다", () => {
    const rect = extractStudioSketchFeatures([
      densePolygon([P(60, 40), P(240, 40), P(240, 160), P(60, 160)]),
    ]);
    expect(rect.cornerCount).toBe(4);
    expect(rect.midpointVertexRatio).toBe(0);
    expect(rect.hypotheses[0]?.kind).toBe("rectangle");

    const diamond = extractStudioSketchFeatures([
      densePolygon([P(150, 20), P(240, 100), P(150, 180), P(60, 100)]),
    ]);
    expect(diamond.cornerCount).toBe(4);
    expect(diamond.midpointVertexRatio).toBe(1);
    expect(diamond.hypotheses[0]?.kind).toBe("diamond");
  });

  it("삼각형·별·하트를 각각의 가설로 읽는다", () => {
    const triangle = extractStudioSketchFeatures([
      densePolygon([P(150, 30), P(240, 170), P(60, 170)]),
    ]);
    expect(triangle.cornerCount).toBe(3);
    expect(triangle.hypotheses[0]?.kind).toBe("triangle");

    const starFeatures = extractStudioSketchFeatures([star(150, 100, 80, 34)]);
    expect(starFeatures.radialPeaks).toBeGreaterThanOrEqual(4);
    expect(starFeatures.hypotheses[0]?.kind).toBe("star");

    const heartFeatures = extractStudioSketchFeatures([heart()]);
    expect(heartFeatures.notchRatio).not.toBeNull();
    expect(heartFeatures.notchRatio!).toBeLessThanOrEqual(0.42);
    expect(heartFeatures.hypotheses[0]?.kind).toBe("heart");
  });

  it("수평선은 line, 물결은 open-curve 가설을 낸다", () => {
    const line = extractStudioSketchFeatures([
      { points: [P(30, 100), P(120, 102), P(270, 100)] },
    ]);
    expect(line.isClosed).toBe(false);
    expect(line.dominantDirection).toBe("horizontal");
    expect(line.hypotheses[0]?.kind).toBe("line");

    const wavePoints: StudioSketchPoint[] = [];
    for (let i = 0; i <= 40; i += 1) {
      wavePoints.push(P(30 + i * 6, 100 + Math.sin((i / 40) * Math.PI * 3) * 30));
    }
    const wave = extractStudioSketchFeatures([{ points: wavePoints }]);
    expect(wave.hypotheses[0]?.kind).toBe("open-curve");
  });

  it("빈 입력·유한하지 않은 좌표는 빈 특징으로 수렴한다", () => {
    const empty = extractStudioSketchFeatures([]);
    expect(empty.strokeCount).toBe(0);
    expect(empty.bounds).toBeNull();
    expect(empty.hypotheses).toEqual([]);

    const dirty = extractStudioSketchFeatures([
      { points: [P(Number.NaN, 0), P(10, Number.POSITIVE_INFINITY)] },
    ]);
    expect(dirty.pointCount).toBe(0);
  });

  it("스케일이 달라져도 같은 모양으로 판정한다 (정규화)", () => {
    const small = extractStudioSketchFeatures([ring(20, 20, 9, 9, 32)]);
    const large = extractStudioSketchFeatures([ring(600, 400, 260, 260, 32)]);
    expect(small.hypotheses[0]?.kind).toBe("circle");
    expect(large.hypotheses[0]?.kind).toBe("circle");
  });

  it("요약 문구와 SVG 경로를 만든다", () => {
    const features = extractStudioSketchFeatures([ring(150, 100, 70, 70)]);
    expect(describeStudioSketchFeatures(features)).toContain("원에 가까워요");
    expect(studioSketchStrokePath([P(1, 2), P(3.456, 4)])).toBe("M1,2 L3.46,4");
    expect(studioSketchStrokePath([])).toBe("");
  });
});

describe("recommendStudioAssetsForSketch", () => {
  it("원을 그리면 원 소재가 1순위로, 이유와 함께 온다", () => {
    const result = recommendStudioAssetsForSketch({
      strokes: [ring(150, 100, 70, 70)],
      catalog: CATALOG,
    });
    expect(result.status).toBe("ok");
    expect(result.recommendations[0]?.item.id).toBe("element:shape-circle");
    expect(result.recommendations[0]?.matchedShape.kind).toBe("circle");
    expect(result.recommendations[0]?.reasons[0]).toContain("원 모양과 닮았어요");
    expect(result.recommendations[0]?.score).toBeGreaterThanOrEqual(0.28);
  });

  it("별·사각형 스케치도 대응 소재를 1순위로 올린다", () => {
    const starResult = recommendStudioAssetsForSketch({
      strokes: [star(150, 100, 80, 34)],
      catalog: CATALOG,
    });
    expect(starResult.recommendations[0]?.item.id).toBe("element:shape-star");

    const rectResult = recommendStudioAssetsForSketch({
      strokes: [densePolygon([P(60, 40), P(240, 40), P(240, 160), P(60, 160)])],
      catalog: CATALOG,
    });
    expect(rectResult.recommendations[0]?.item.id).toBe("element:frame-simple");
  });

  it("limit을 지키고 점수 내림차순으로 정렬한다", () => {
    const result = recommendStudioAssetsForSketch({
      strokes: [ring(150, 100, 70, 70)],
      catalog: CATALOG,
      limit: 2,
    });
    expect(result.recommendations.length).toBeLessThanOrEqual(2);
    const scores = result.recommendations.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("빈 스케치는 empty, 점만 찍으면 too-small 상태다", () => {
    const empty = recommendStudioAssetsForSketch({ strokes: [], catalog: CATALOG });
    expect(empty.status).toBe("empty");
    expect(empty.recommendations).toEqual([]);

    const tiny = recommendStudioAssetsForSketch({
      strokes: [{ points: [P(10, 10), P(12, 11)] }],
      catalog: CATALOG,
    });
    expect(tiny.status).toBe("too-small");
  });

  it("닮은 소재가 없으면 no-match와 텍스트 검색 폴백을 돌려준다", () => {
    const result = recommendStudioAssetsForSketch({
      strokes: [densePolygon([P(150, 30), P(240, 170), P(60, 170)])],
      catalog: CATALOG,
    });
    expect(result.status).toBe("no-match");
    const guidance = buildStudioSketchSearchGuidance(result);
    expect(guidance.headline).toContain("찾지 못했어요");
    expect(guidance.fallbackQuery).toBe("삼각형");
    expect(guidance.tips.length).toBeGreaterThan(0);
  });

  it("상태별 안내 문구가 모두 준비돼 있다", () => {
    const emptyGuidance = buildStudioSketchSearchGuidance(
      recommendStudioAssetsForSketch({ strokes: [], catalog: CATALOG }),
    );
    expect(emptyGuidance.headline).toContain("그어 보세요");
    expect(emptyGuidance.fallbackQuery).toBeNull();

    const okGuidance = buildStudioSketchSearchGuidance(
      recommendStudioAssetsForSketch({
        strokes: [ring(150, 100, 70, 70)],
        catalog: CATALOG,
      }),
    );
    expect(okGuidance.headline).toContain("원과 닮은 소재");
    expect(okGuidance.fallbackQuery).toBe("원");
  });

  it("아이템 모양 추정은 요소 카테고리와 키워드를 함께 본다", () => {
    const frame = CATALOG.find((item) => item.id === "element:frame-simple")!;
    expect(studioSketchShapeKindsOfItem(frame).has("rectangle")).toBe(true);
    const arrow = CATALOG.find((item) => item.id === "element:arrow-right")!;
    expect(studioSketchShapeKindsOfItem(arrow).has("line")).toBe(true);
  });
});
