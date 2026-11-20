import { describe, expect, it } from "vitest";

import {
  createVectorLayer,
  createVectorStroke,
  VECTOR_STROKE_MIN_WIDTH_PX,
} from "../vector-layer/vector-layer-model";

import {
  applyBrushStyleToLtVectorLayer,
  applyBrushStyleToVectorStroke,
  LT_VECTOR_BRUSH_STYLE_LIST,
  renderStyledLtVectorLayerToSvg,
  styleExtractedLineArtPaths,
} from "./studio-lt-vector-brush-style";

function makeSampleOpenStroke(id = "stroke-1") {
  const pts = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 40, y: 20 },
    { x: 60, y: 20 },
    { x: 80, y: 0 },
  ];
  const segments = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    segments.push({
      p0: a,
      p1: { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
      p2: { x: a.x + ((b.x - a.x) * 2) / 3, y: a.y + ((b.y - a.y) * 2) / 3 },
      p3: b,
    });
  }
  return createVectorStroke({
    id,
    segments,
    widths: [2, 2, 2, 2, 2],
    color: "#111111",
    brushShapeId: "round",
    opacity: 1,
  });
}

describe("studio-lt-vector-brush-style (CSP 4.0 LT vector pen styles)", () => {
  it("provides all 4 Korean webtoon brush presets (G펜, 거친펜, 마루펜, 수채펜)", () => {
    expect(LT_VECTOR_BRUSH_STYLE_LIST.map((preset) => preset.id)).toEqual([
      "g-pen",
      "rough-pen",
      "maru-pen",
      "watercolor-pen",
    ]);
  });

  it("applies G-pen sharp entry/exit taper with bold mid-stroke pressure swell", () => {
    const stroke = makeSampleOpenStroke("gpen-01");
    const styled = applyBrushStyleToVectorStroke(stroke, { styleId: "g-pen", baseWidthPx: 3 });

    expect(styled.widths).toHaveLength(stroke.segments.length + 1);
    expect(styled.brushShapeId).toBe("round");
    // 중앙 앵커가 양 끝점보다 확실히 두껍다(G펜 진입/말단 테이퍼)
    const startW = styled.widths[0]!;
    const midW = styled.widths[2]!;
    const endW = styled.widths[styled.widths.length - 1]!;
    expect(midW).toBeGreaterThan(startW * 2);
    expect(midW).toBeGreaterThan(endW * 2);
    expect(startW).toBeGreaterThanOrEqual(VECTOR_STROKE_MIN_WIDTH_PX);
  });

  it("produces deterministic organic width variation for rough-pen without Math.random", () => {
    const stroke = makeSampleOpenStroke("rough-01");
    const first = applyBrushStyleToVectorStroke(stroke, { styleId: "rough-pen", baseWidthPx: 2.5 });
    const second = applyBrushStyleToVectorStroke(stroke, { styleId: "rough-pen", baseWidthPx: 2.5 });

    expect(first.widths).toEqual(second.widths);
    expect(first.brushShapeId).toBe("flat");
  });

  it("applies finer average weight for maru-pen and translucent endpoint pooling for watercolor-pen", () => {
    const layer = createVectorLayer({
      id: "lt-layer",
      name: "LT 주선",
      strokes: [makeSampleOpenStroke("s1"), makeSampleOpenStroke("s2")],
    });

    const gPen = applyBrushStyleToLtVectorLayer(layer, { styleId: "g-pen", baseWidthPx: 2.5 });
    const maru = applyBrushStyleToLtVectorLayer(layer, { styleId: "maru-pen", baseWidthPx: 2.5 });
    const water = applyBrushStyleToLtVectorLayer(layer, { styleId: "watercolor-pen", baseWidthPx: 2.5 });

    expect(maru.avgWidthPx).toBeLessThan(gPen.avgWidthPx);
    expect(water.layer.strokes[0]?.opacity).toBeCloseTo(0.72, 2);
    expect(water.layer.strokes[0]?.brushShapeId).toBe("calligraphy");
    expect(water.layer.name).toContain("수채펜");
  });

  it("converts extracted 3D VectorStrokePath polylines into styled cubic VectorLayer and variable-width SVG", () => {
    const result = styleExtractedLineArtPaths(
      [
        {
          id: "edge-1",
          points: [
            { x: 10, y: 10 },
            { x: 30, y: 12 },
            { x: 50, y: 18 },
            { x: 70, y: 10 },
          ],
          svgPathData: "M 10 10 L 30 12 L 50 18 L 70 10",
          isClosed: false,
          length: 62,
        },
      ],
      { styleId: "g-pen", baseWidthPx: 2.4 },
    );

    expect(result.strokeCount).toBe(1);
    expect(result.layer.strokes[0]?.segments).toHaveLength(3);
    expect(result.layer.strokes[0]?.widths).toHaveLength(4);

    const svg = renderStyledLtVectorLayerToSvg(result.layer, 100, 100);
    expect(svg).toContain('data-stroke-id="edge-1"');
    expect(svg).toContain("<path ");
    expect(svg).toContain(" Z\"");
  });
});
