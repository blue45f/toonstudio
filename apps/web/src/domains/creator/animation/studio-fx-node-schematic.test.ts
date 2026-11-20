import { describe, expect, it } from "vitest";

import {
  createFxImageBuffer,
  detectVectorFeaturePoints,
  evaluateFxSchematic,
  generateVectorAutoInbetweens,
  validateFxSchematicGraph,
  type FxSchematicGraph,
  type IndexedPaletteTable,
  type VectorKeyframeDrawing,
} from "./studio-fx-node-schematic";

function createSilhouetteBuffer(width: number, height: number): ReturnType<typeof createFxImageBuffer> {
  const buf = createFxImageBuffer(width, height, undefined, 200);
  // 중앙 사각형 캐릭터 실루엣(x: 4..11, y: 4..11)
  for (let y = 4; y <= 11; y += 1) {
    for (let x = 4; x <= 11; x += 1) {
      const o = (y * width + x) * 4;
      buf.data[o] = 0.35;
      buf.data[o + 1] = 0.35;
      buf.data[o + 2] = 0.35;
      buf.data[o + 3] = 1;
    }
  }
  return buf;
}

describe("studio-fx-node-schematic", () => {
  it("단일 캐릭터 알파 소스를 림라이트·캐스트 섀도우·블룸으로 동시 분기(Fan-Out) 평가하고 각 노드를 1회만 실행한다", () => {
    const graph: FxSchematicGraph = {
      id: "fx-hero-rim-shadow",
      nodes: [
        { id: "src-char", kind: "LayerSource", layerId: "hero", zDepth: 200 },
        {
          id: "fx-shadow",
          kind: "CastShadowSkew",
          inputNodeId: "src-char",
          skewX: 0.4,
          scaleY: 0.5,
          offsetX: 2,
          offsetY: 0,
          opacity: 0.6,
          color: { r: 0.08, g: 0.1, b: 0.18, a: 1 },
        },
        {
          id: "fx-rim",
          kind: "RimLightFromAlpha",
          inputNodeId: "src-char",
          lightDirX: 1,
          lightDirY: 0,
          widthPx: 2,
          intensity: 1,
          color: { r: 1, g: 0.9, b: 0.6, a: 1 },
          paletteStyleId: "rim-accent",
        },
        {
          id: "fx-bloom",
          kind: "BloomGlow",
          inputNodeId: "fx-rim",
          threshold: 0.2,
          radiusPx: 1,
          intensity: 0.8,
        },
        {
          id: "comp-shadow-char",
          kind: "Composite",
          baseNodeId: "fx-shadow",
          overlayNodeId: "src-char",
          blendMode: "over",
          opacity: 1,
        },
        {
          id: "comp-final",
          kind: "Composite",
          baseNodeId: "comp-shadow-char",
          overlayNodeId: "fx-bloom",
          blendMode: "add",
          opacity: 1,
        },
        { id: "out", kind: "Output", inputNodeId: "comp-final" },
      ],
    };

    const paletteDay: IndexedPaletteTable = {
      activeMoodId: "day",
      moods: {
        day: { "rim-accent": { r: 1, g: 0.95, b: 0.7, a: 1 } },
        night: { "rim-accent": { r: 0.25, g: 0.55, b: 1, a: 1 } },
      },
    };

    const charBuf = createSilhouetteBuffer(16, 16);
    const evalDay = evaluateFxSchematic({
      graph,
      sources: { hero: charBuf },
      width: 16,
      height: 16,
      palette: paletteDay,
    });

    // 단일 소스 노드가 3개 경로(그림자·림라이트·합성)로 분기되어도 정확히 1회만 평가되어야 한다.
    expect(evalDay.evaluatedCountByNode["src-char"]).toBe(1);

    // 좌측 광원 경계(x=4, y=7)는 림라이트가 더해져 내부(x=8, y=7)보다 밝고 노란빛(R>B)을 띤다.
    const rimPixelOffset = (7 * 16 + 4) * 4;
    const innerPixelOffset = (7 * 16 + 8) * 4;
    expect(evalDay.outputBuffer.data[rimPixelOffset]).toBeGreaterThan(
      evalDay.outputBuffer.data[innerPixelOffset] ?? 0,
    );

    // OpenToonz식 인덱스 팔레트를 야간 무드로 바꾸면 림라이트 색조가 비파괴로 푸른빛(B>R)으로 전환된다.
    const evalNight = evaluateFxSchematic({
      graph,
      sources: { hero: charBuf },
      width: 16,
      height: 16,
      palette: { ...paletteDay, activeMoodId: "night" },
    });
    const nightR = evalNight.outputBuffer.data[rimPixelOffset] ?? 0;
    const nightB = evalNight.outputBuffer.data[rimPixelOffset + 2] ?? 0;
    expect(nightB).toBeGreaterThan(nightR);
  });

  it("FX 스케매틱 검증기가 순환 그래프와 출력 노드 누락을 정확히 차단한다", () => {
    const cyclic = validateFxSchematicGraph({
      id: "bad-cycle",
      nodes: [
        { id: "a", kind: "ToneCurve", inputNodeId: "b", gamma: 1, contrast: 1, lift: 0 },
        { id: "b", kind: "ToneCurve", inputNodeId: "a", gamma: 1, contrast: 1, lift: 0 },
      ],
    });
    expect(cyclic.valid).toBe(false);
    expect(cyclic.errors.some((e) => e.includes("순환"))).toBe(true);
    expect(cyclic.errors.some((e) => e.includes("Output"))).toBe(true);
  });

  it("Cacani 벡터 특징점 가이드 자동 동화가 코너를 보존하고 가변 선폭·가이드 핀·끝점 폐합을 처리한다", () => {
    const keyA: VectorKeyframeDrawing = {
      frameIndex: 0,
      strokes: [
        {
          id: "arm-line",
          strokeOrder: 0,
          points: [
            { x: 0, y: 0, width: 2 },
            { x: 100, y: 0, width: 4 }, // 90도 코너 특징점(t = 0.5)
            { x: 100, y: 100, width: 6 },
          ],
        },
      ],
    };
    const keyB: VectorKeyframeDrawing = {
      frameIndex: 4,
      strokes: [
        {
          id: "arm-line",
          strokeOrder: 0,
          points: [
            { x: 0, y: 20, width: 4 },
            { x: 140, y: 20, width: 8 }, // 90도 코너 특징점(t ≈ 0.583)
            { x: 140, y: 120, width: 10 },
          ],
        },
      ],
    };

    const firstStroke = keyA.strokes[0];
    expect(firstStroke).toBeDefined();
    const featsA = firstStroke ? detectVectorFeaturePoints(firstStroke.points, 30) : [];
    expect(featsA).toHaveLength(1);
    expect(featsA[0]).toBeCloseTo(0.5, 3);

    const inbetweens = generateVectorAutoInbetweens(keyA, keyB, {
      ratios: [0.5],
      sampleCount: 12,
    });
    expect(inbetweens).toHaveLength(1);
    const midStroke = inbetweens[0]?.strokes[0];
    expect(midStroke).toBeDefined();

    // 코너 대응 정점은 (100,0)과 (140,20)의 정확한 중점 (120, 10)과 선폭 6을 지나야 한다.
    const cornerSample = midStroke?.points.find(
      (p) => Math.abs(p.x - 120) < 1e-3 && Math.abs(p.y - 10) < 1e-3,
    );
    expect(cornerSample).toBeDefined();
    expect(cornerSample?.width).toBeCloseTo(6, 3);

    // 열린 사각형 근접 끝점 자동 폐합 검증
    const openLoop: VectorKeyframeDrawing = {
      frameIndex: 0,
      strokes: [
        {
          id: "loop",
          strokeOrder: 0,
          points: [
            { x: 0, y: 0, width: 2 },
            { x: 40, y: 0, width: 2 },
            { x: 40, y: 40, width: 2 },
            { x: 1.5, y: 1.5, width: 2 },
          ],
        },
      ],
    };
    const closedResult = generateVectorAutoInbetweens(openLoop, openLoop, {
      ratios: [0.5],
      autoCloseGapPx: 4,
    });
    expect(closedResult[0]?.strokes[0]?.closed).toBe(true);
  });
});
