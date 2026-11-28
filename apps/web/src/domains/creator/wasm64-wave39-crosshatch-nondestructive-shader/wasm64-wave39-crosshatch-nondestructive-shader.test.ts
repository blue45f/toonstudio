import { describe, expect, it } from "vitest";

import {
  LOOK_CARD_CATALOG,
  LookRecipeGraphError,
  applyVisualLookOverride,
  compileVisualLookRecipeGraph,
  computeOrganicPenTaperProfile,
  createNonDestructiveLookSession,
  evaluateNonDestructiveLookStack,
  generateCurvatureCrossHatching,
  modulateLineWeightByLightAndDepth,
  resetVisualLookOverride,
  type SurfaceCurvatureToneField,
  type VectorInkEdgeStroke,
  type VisualLookRecipeGraph,
} from "./index";

function createUniformToneField(
  width: number,
  height: number,
  darkness: number,
  angleDeg = 0,
): SurfaceCurvatureToneField {
  const n = width * height;
  const rad = (angleDeg * Math.PI) / 180;
  const tx = Math.cos(rad);
  const ty = Math.sin(rad);
  const darknessField = new Float32Array(n).fill(darkness);
  const tangentX = new Float32Array(n).fill(tx);
  const tangentY = new Float32Array(n).fill(ty);
  return { width, height, pixelStepPx: 2, darknessField, tangentX, tangentY };
}

function createSolidLinearBuffer(w: number, h: number, r: number, g: number, b: number, a = 1): Float32Array {
  const out = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a;
  }
  return out;
}

describe("wasm64-wave39-crosshatch-nondestructive-shader", () => {
  it("1. 밝은 하이라이트 영역(darkness < tier1MinDarkness)은 0단 여백을 유지해 해칭선을 생성하지 않는다", () => {
    const field = createUniformToneField(28, 28, 0.08);
    const res = generateCurvatureCrossHatching(field, { jitterAmountPx: 0 });
    expect(res.maxObservedTier).toBe(0);
    expect(res.strokes.length).toBe(0);
    expect(res.tierStrokeCounts).toEqual({ tier1: 0, tier2: 0, tier3: 0 });
    expect(res.inkCoverageEstimate01).toBe(0);
  });

  it("2. 옅은 반암부(darkness = 0.34)는 1단 평행 해칭만 배치하고 2·3단 교차 해칭은 생략한다", () => {
    const field = createUniformToneField(32, 32, 0.34, 20);
    const res = generateCurvatureCrossHatching(field, { jitterAmountPx: 0, baseSpacingPx: 8 });
    expect(res.maxObservedTier).toBe(1);
    expect(res.tierStrokeCounts.tier1).toBeGreaterThan(6);
    expect(res.tierStrokeCounts.tier2).toBe(0);
    expect(res.tierStrokeCounts.tier3).toBe(0);
  });

  it("3. 중간 암부(darkness = 0.60)는 1단 평행 해칭과 직교하는 2단 크로스해칭을 함께 배치한다", () => {
    const field = createUniformToneField(32, 32, 0.6, 30);
    const res = generateCurvatureCrossHatching(field, { jitterAmountPx: 0, baseSpacingPx: 8 });
    expect(res.maxObservedTier).toBe(2);
    expect(res.tierStrokeCounts.tier1).toBeGreaterThan(6);
    expect(res.tierStrokeCounts.tier2).toBeGreaterThan(6);
    expect(res.tierStrokeCounts.tier3).toBe(0);
    expect(res.meanTier1ToTier2OrthogonalitySin).toBeGreaterThan(0.97);
  });

  it("4. 심부 핵심 암부(darkness = 0.90)는 1·2·3단 밀집 먹선을 모두 활성화하며 단계별 먹선 피복률이 단조 증가한다", () => {
    const r0 = generateCurvatureCrossHatching(createUniformToneField(32, 32, 0.05), { jitterAmountPx: 0 });
    const r1 = generateCurvatureCrossHatching(createUniformToneField(32, 32, 0.34), { jitterAmountPx: 0 });
    const r2 = generateCurvatureCrossHatching(createUniformToneField(32, 32, 0.6), { jitterAmountPx: 0 });
    const r3 = generateCurvatureCrossHatching(createUniformToneField(32, 32, 0.9), { jitterAmountPx: 0 });
    expect(r3.maxObservedTier).toBe(3);
    expect(r3.tierStrokeCounts.tier3).toBeGreaterThan(r3.tierStrokeCounts.tier1);
    expect(r0.inkCoverageEstimate01).toBeLessThan(r1.inkCoverageEstimate01);
    expect(r1.inkCoverageEstimate01).toBeLessThan(r2.inkCoverageEstimate01);
    expect(r2.inkCoverageEstimate01).toBeLessThan(r3.inkCoverageEstimate01);
  });

  it("5. 연속 명암 그라디언트(0 -> 1)에서 좌측 밝은 영역보다 우측 암부 영역에 고차 해칭이 집중된다", () => {
    const w = 48;
    const h = 24;
    const darknessField = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) darknessField[y * w + x] = x / (w - 1);
    }
    const res = generateCurvatureCrossHatching(
      { width: w, height: h, pixelStepPx: 2, darknessField, tangentX: new Float32Array(w * h).fill(0), tangentY: new Float32Array(w * h).fill(1) },
      { jitterAmountPx: 0, baseSpacingPx: 7 },
    );
    const leftStrokes = res.strokes.filter((s) => (s.samples[0]?.x ?? 0) < 20);
    const rightTier3 = res.strokes.filter((s) => s.tier === 3 && (s.samples[0]?.x ?? 0) > 65);
    expect(leftStrokes.length).toBe(0);
    expect(rightTier3.length).toBeGreaterThan(3);
  });

  it("6. 대각선 및 동심 원통 곡률 접선장을 따라 1단 해칭 스트로크가 높은 접선 정렬도로 휘어지며 감긴다", () => {
    const w = 36;
    const h = 36;
    const cx = (w - 1) * 0.5;
    const cy = (h - 1) * 0.5;
    const tangentX = new Float32Array(w * h);
    const tangentY = new Float32Array(w * h);
    const darknessField = new Float32Array(w * h).fill(0.4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.hypot(dx, dy);
        tangentX[y * w + x] = r > 2 ? -dy / r : 1;
        tangentY[y * w + x] = r > 2 ? dx / r : 0;
        if (r < 5) darknessField[y * w + x] = 0;
      }
    }
    const res = generateCurvatureCrossHatching(
      { width: w, height: h, pixelStepPx: 2, darknessField, tangentX, tangentY },
      { jitterAmountPx: 0, stepSizePx: 1.5, maxStrokeLengthPx: 22 },
    );
    expect(res.tierStrokeCounts.tier1).toBeGreaterThan(8);
    expect(res.meanTangentAlignmentCosine).toBeGreaterThan(0.95);
  });

  it("7. 비방향성 주곡률 접선장의 인접 부호 반전(+T vs -T)에도 180도 급반전 없이 매끄러운 유선을 유지한다", () => {
    const w = 24;
    const h = 24;
    const tangentX = new Float32Array(w * h);
    const tangentY = new Float32Array(w * h).fill(0);
    for (let i = 0; i < w * h; i += 1) tangentX[i] = i % 2 === 0 ? 1 : -1;
    const res = generateCurvatureCrossHatching(
      { width: w, height: h, pixelStepPx: 2, darknessField: new Float32Array(w * h).fill(0.38), tangentX, tangentY },
      { jitterAmountPx: 0, maxStrokeLengthPx: 20 },
    );
    expect(res.strokes.length).toBeGreaterThan(4);
    for (const stroke of res.strokes) {
      for (let i = 1; i < stroke.samples.length; i += 1) {
        const prev = stroke.samples[i - 1];
        const curr = stroke.samples[i];
        if (prev && curr) {
          expect(prev.tangentX * curr.tangentX + prev.tangentY * curr.tangentY).toBeGreaterThan(0.95);
        }
      }
    }
  });

  it("8. 생성된 펜 해칭 스트로크는 시작·끝 양단에서 유기적인 G펜 필압 테이퍼를 형성한다", () => {
    expect(computeOrganicPenTaperProfile(0)).toBeLessThan(0.2);
    expect(computeOrganicPenTaperProfile(0.5)).toBeCloseTo(1, 5);
    expect(computeOrganicPenTaperProfile(1)).toBeLessThan(0.2);

    const res = generateCurvatureCrossHatching(createUniformToneField(30, 30, 0.42, 15), {
      jitterAmountPx: 0,
      maxStrokeLengthPx: 26,
      stepSizePx: 1.5,
    });
    expect(res.strokes.length).toBeGreaterThan(4);
    expect(res.meanEndToMidTaperRatio).toBeLessThan(0.42);
    const first = res.strokes[0];
    expect(first).toBeDefined();
    if (first) {
      const startW = first.samples[0]?.widthPx ?? 0;
      const midW = first.samples[Math.floor(first.samples.length * 0.5)]?.widthPx ?? 0;
      const endW = first.samples[first.samples.length - 1]?.widthPx ?? 0;
      expect(startW).toBeLessThan(midW * 0.45);
      expect(endW).toBeLessThan(midW * 0.45);
    }
  });

  it("9. 보호 마스크(말풍선·안광 mask = 0) 내부로는 해칭 스트로크가 침범하지 않는다", () => {
    const w = 30;
    const h = 30;
    const mask = new Float32Array(w * h).fill(1);
    for (let y = 8; y <= 21; y += 1) {
      for (let x = 8; x <= 21; x += 1) mask[y * w + x] = 0;
    }
    const base = createUniformToneField(w, h, 0.85, 0);
    const res = generateCurvatureCrossHatching({ ...base, mask }, { jitterAmountPx: 0, stepSizePx: 1.5 });
    expect(res.strokes.length).toBeGreaterThan(4);
    for (const st of res.strokes) {
      for (const sp of st.samples) {
        const gx = sp.x / 2;
        const gy = sp.y / 2;
        const insideHole = gx > 9 && gx < 20 && gy > 9 && gy < 20;
        expect(insideHole).toBe(false);
      }
    }
  });

  it("10. 동일 시드는 비트 단위로 동일한 해칭을 재현하고 다른 시드는 수작업 지터를 결정론적으로 변경한다", () => {
    const field = createUniformToneField(24, 24, 0.55, 42);
    const runA = generateCurvatureCrossHatching(field, { seed: 777, jitterAmountPx: 0.6 });
    const runB = generateCurvatureCrossHatching(field, { seed: 777, jitterAmountPx: 0.6 });
    const runC = generateCurvatureCrossHatching(field, { seed: 999, jitterAmountPx: 0.6 });
    expect(runA.strokes).toEqual(runB.strokes);
    expect(runA.strokes[0]?.samples[0]?.x).not.toBe(runC.strokes[0]?.samples[0]?.x);
  });

  it("11. 주광원을 마주 보는 선화 모서리는 얇아지고 그림자 방향 모서리는 두꺼워진다", () => {
    const strokes: readonly VectorInkEdgeStroke[] = [
      {
        id: "lit-cheek",
        samples: [
          { x: 10, y: 10, baseWidthPx: 2, edgeNormalX: 1, edgeNormalY: 0, zDepthMeters: 3 },
          { x: 10, y: 20, baseWidthPx: 2, edgeNormalX: 0.95, edgeNormalY: 0.31, zDepthMeters: 3 },
          { x: 10, y: 30, baseWidthPx: 2, edgeNormalX: 1, edgeNormalY: 0, zDepthMeters: 3 },
        ],
      },
      {
        id: "shadow-jaw",
        samples: [
          { x: 40, y: 10, baseWidthPx: 2, edgeNormalX: -1, edgeNormalY: 0, zDepthMeters: 3 },
          { x: 40, y: 20, baseWidthPx: 2, edgeNormalX: -0.95, edgeNormalY: -0.31, zDepthMeters: 3 },
          { x: 40, y: 30, baseWidthPx: 2, edgeNormalX: -1, edgeNormalY: 0, zDepthMeters: 3 },
        ],
      },
    ];
    const res = modulateLineWeightByLightAndDepth(strokes, { keyLightDirX: 1, keyLightDirY: 0, keyLightDirZ: 0 });
    expect(res.meanLitEdgeScale).toBeLessThan(0.8);
    expect(res.meanShadowEdgeScale).toBeGreaterThan(1.25);
    expect(res.shadowToLitWidthRatio).toBeGreaterThan(1.6);
  });

  it("12. 외곽 실루엣과 주름 차폐(Occlusion Crease) 선은 동일 조명 조건의 내부 묘사선보다 굵게 강조된다", () => {
    const baseSamples = [
      { x: 0, y: 0, baseWidthPx: 2, edgeNormalX: 0, edgeNormalY: 1, zDepthMeters: 2, ambientOcclusion01: 0 },
      { x: 10, y: 0, baseWidthPx: 2, edgeNormalX: 0, edgeNormalY: 1, zDepthMeters: 2, ambientOcclusion01: 0 },
    ];
    const res = modulateLineWeightByLightAndDepth(
      [
        { id: "inner-detail", isSilhouette: false, samples: baseSamples },
        { id: "outer-silhouette", isSilhouette: true, isOcclusionCrease: true, samples: baseSamples },
      ],
      { keyLightDirX: 1, keyLightDirY: 0, keyLightDirZ: 0 },
    );
    const innerScale = res.strokes[0]?.meanWidthScale ?? 0;
    const outerScale = res.strokes[1]?.meanWidthScale ?? 0;
    expect(outerScale).toBeGreaterThan(innerScale * 1.35);
  });

  it("13. Z-깊이 계층에 따라 전경 피사체 선은 두꺼워지고 원경 배경 선은 가늘게 감쇠된다", () => {
    const res = modulateLineWeightByLightAndDepth(
      [
        { id: "fg-hero", samples: [{ x: 0, y: 0, baseWidthPx: 2, edgeNormalX: 0, edgeNormalY: 1, zDepthMeters: 0.5 }, { x: 8, y: 0, baseWidthPx: 2, edgeNormalX: 0, edgeNormalY: 1, zDepthMeters: 0.6 }] },
        { id: "bg-building", samples: [{ x: 50, y: 0, baseWidthPx: 2, edgeNormalX: 0, edgeNormalY: 1, zDepthMeters: 12 }, { x: 58, y: 0, baseWidthPx: 2, edgeNormalX: 0, edgeNormalY: 1, zDepthMeters: 12 }] },
      ],
      { keyLightDirX: 1, keyLightDirY: 0, keyLightDirZ: 0, nearDepthMeters: 0.5, farDepthMeters: 12 },
    );
    expect(res.meanForegroundScale).toBeGreaterThan(1.15);
    expect(res.meanBackgroundScale).toBeLessThan(0.8);
    expect(res.meanForegroundScale).toBeGreaterThan(res.meanBackgroundScale * 1.5);
  });

  it("14. 선굵기 변조는 원본 입력 스트로크를 변이시키지 않고 양 끝단 테이퍼 비례와 최소·최대 배율 한계를 지킨다", () => {
    const original: VectorInkEdgeStroke = {
      id: "tapered-ink", isSilhouette: true,
      samples: [
        { x: 0, y: 0, baseWidthPx: 0.4, edgeNormalX: -1, edgeNormalY: 0, zDepthMeters: 0.5 },
        { x: 10, y: 0, baseWidthPx: 2.6, edgeNormalX: -1, edgeNormalY: 0, zDepthMeters: 0.5 },
        { x: 20, y: 0, baseWidthPx: 0.35, edgeNormalX: -1, edgeNormalY: 0, zDepthMeters: 0.5 },
      ],
    };
    const snapshot = JSON.stringify(original);
    const res = modulateLineWeightByLightAndDepth([original], { keyLightDirX: 1, keyLightDirY: 0, keyLightDirZ: 0 }, { minWidthScale: 0.5, maxWidthScale: 1.5 });
    expect(JSON.stringify(original)).toBe(snapshot);
    const mod = res.strokes[0];
    expect(mod).toBeDefined();
    if (mod) {
      for (const s of mod.samples) { expect(s.widthScale).toBeGreaterThanOrEqual(0.5); expect(s.widthScale).toBeLessThanOrEqual(1.5); }
      expect(mod.samples[0]?.modulatedWidthPx ?? 0).toBeLessThan((mod.samples[1]?.modulatedWidthPx ?? 0) * 0.3);
      expect(mod.samples[2]?.modulatedWidthPx ?? 0).toBeLessThan((mod.samples[1]?.modulatedWidthPx ?? 0) * 0.3);
    }
  });

  it("15. 5종 평문 한글 룩 카드를 방향성 간선 의존성에 맞춰 결정론적 위상 정렬 순서로 컴파일한다", () => {
    expect(LOOK_CARD_CATALOG["paper-grain"].titleKo).toBe("종이 결");
    expect(LOOK_CARD_CATALOG["cel-shade-step"].titleKo).toBe("셀 음영 단차");
    expect(LOOK_CARD_CATALOG["backlight-bloom"].titleKo).toBe("역광 번짐");
    expect(LOOK_CARD_CATALOG["atmospheric-depth"].titleKo).toBe("대기 거리감");
    expect(LOOK_CARD_CATALOG["lineart-color-trap"].titleKo).toBe("선화 색트임(색수차 방지 선트랩)");

    const graph: VisualLookRecipeGraph = {
      id: "full-5-cards",
      nodes: [
        { id: "grain", kind: "paper-grain", enabled: true, intensity: 0.35 },
        { id: "bloom", kind: "backlight-bloom", enabled: true, intensity: 0.55 },
        { id: "depth", kind: "atmospheric-depth", enabled: true, intensity: 0.45 },
        { id: "trap", kind: "lineart-color-trap", enabled: true, intensity: 0.85 },
        { id: "cel", kind: "cel-shade-step", enabled: true, intensity: 0.7 },
      ],
      edges: [
        { fromNodeId: "cel", toNodeId: "trap" }, { fromNodeId: "trap", toNodeId: "depth" },
        { fromNodeId: "depth", toNodeId: "bloom" }, { fromNodeId: "bloom", toNodeId: "grain" },
      ],
    };
    const compiled = compileVisualLookRecipeGraph(graph);
    expect(compiled.topologicalNodeOrder).toEqual(["cel", "trap", "depth", "bloom", "grain"]);
    expect(compiled.activePasses.map((p) => p.labelKo)).toEqual(["셀 음영 단차", "선화 색트임(색수차 방지 선트랩)", "대기 거리감", "역광 번짐", "종이 결"]);
  });

  it("16. 자기 순환(A->A) 및 다중 노드 순환(A->B->C->A)을 감지해 CYCLE_DETECTED 오류로 거부한다", () => {
    const selfLoop: VisualLookRecipeGraph = {
      id: "self-loop",
      nodes: [{ id: "a", kind: "paper-grain", enabled: true, intensity: 0.5 }],
      edges: [{ fromNodeId: "a", toNodeId: "a" }],
    };
    expect(() => compileVisualLookRecipeGraph(selfLoop)).toThrow(LookRecipeGraphError);

    const threeNodeCycle: VisualLookRecipeGraph = {
      id: "cycle-3",
      nodes: [
        { id: "cel", kind: "cel-shade-step", enabled: true, intensity: 0.6 },
        { id: "bloom", kind: "backlight-bloom", enabled: false, intensity: 0.5 },
        { id: "grain", kind: "paper-grain", enabled: true, intensity: 0.4 },
      ],
      edges: [
        { fromNodeId: "cel", toNodeId: "bloom" },
        { fromNodeId: "bloom", toNodeId: "grain" },
        { fromNodeId: "grain", toNodeId: "cel" },
      ],
    };
    try {
      compileVisualLookRecipeGraph(threeNodeCycle);
      expect.unreachable("순환 그래프는 반드시 예외를 던져야 합니다.");
    } catch (err) {
      expect(err).toBeInstanceOf(LookRecipeGraphError);
      if (err instanceof LookRecipeGraphError) {
        expect(err.code).toBe("CYCLE_DETECTED");
        expect(err.cycleNodeIds.length).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("17. 중복 노드 ID와 존재하지 않는 간선 끝점 및 잘못된 정렬 단위를 명확한 오류 코드로 차단한다", () => {
    const dupGraph: VisualLookRecipeGraph = {
      id: "dup",
      nodes: [
        { id: "same", kind: "paper-grain", enabled: true, intensity: 0.4 },
        { id: "same", kind: "backlight-bloom", enabled: true, intensity: 0.4 },
      ],
      edges: [],
    };
    expect(() => compileVisualLookRecipeGraph(dupGraph)).toThrowError(/중복된 룩 카드 ID/);

    const missingEdgeGraph: VisualLookRecipeGraph = {
      id: "missing",
      nodes: [{ id: "only", kind: "paper-grain", enabled: true, intensity: 0.4 }],
      edges: [{ fromNodeId: "only", toNodeId: "ghost" }],
    };
    expect(() => compileVisualLookRecipeGraph(missingEdgeGraph)).toThrowError(/존재하지 않는 룩 카드/);
    expect(() => compileVisualLookRecipeGraph({ id: "ok", nodes: [], edges: [] }, { uniformAlignmentBytes: 24 })).toThrowError(/16 배수/);
  });

  it("18. 꺼진 카드(enabled: false)와 강도 0% 카드를 자동 폴딩하고 상위-하위 텍스처 입력을 무손실 재연결한다", () => {
    const graph: VisualLookRecipeGraph = {
      id: "fold-test",
      nodes: [
        { id: "cel", kind: "cel-shade-step", enabled: true, intensity: 0.8 },
        { id: "depth-off", kind: "atmospheric-depth", enabled: false, intensity: 0.7 },
        { id: "bloom-zero", kind: "backlight-bloom", enabled: true, intensity: 0 },
        { id: "grain", kind: "paper-grain", enabled: true, intensity: 0.4 },
      ],
      edges: [
        { fromNodeId: "cel", toNodeId: "depth-off" },
        { fromNodeId: "depth-off", toNodeId: "bloom-zero" },
        { fromNodeId: "bloom-zero", toNodeId: "grain" },
      ],
    };
    const compiled = compileVisualLookRecipeGraph(graph);
    expect(compiled.activePasses.map((p) => p.nodeId)).toEqual(["cel", "grain"]);
    expect(compiled.savedGpuPassCount).toBe(2);
    expect(compiled.foldedNodes).toEqual([
      { nodeId: "depth-off", kind: "atmospheric-depth", labelKo: "대기 거리감", reason: "bypassed" },
      { nodeId: "bloom-zero", kind: "backlight-bloom", labelKo: "역광 번짐", reason: "zero-intensity" },
    ]);
    expect(compiled.activePasses[0]?.upstreamSourceIds).toEqual(["source-canvas"]);
    expect(compiled.activePasses[1]?.upstreamSourceIds).toEqual(["cel"]);
  });

  it("19. 기본 32바이트 및 256바이트 동적 오프셋 정렬에서 모든 WebGPU 유니폼 슬라이스가 16바이트 배수로 결정론적 패킹된다", () => {
    const graph: VisualLookRecipeGraph = {
      id: "uniform-align",
      nodes: [
        { id: "cel", kind: "cel-shade-step", enabled: true, intensity: 0.65, params: { stepCount: 4, edgeSoftness: 0.2 } },
        { id: "depth", kind: "atmospheric-depth", enabled: true, intensity: 0.5, params: { nearMeters: 2, farMeters: 16, tintLinearRgb: [0.8, 0.86, 0.95] } },
        { id: "trap", kind: "lineart-color-trap", enabled: true, intensity: 0.9, params: { trapWidthPx: 2, chromaticGuard: 0.9 } },
      ],
      edges: [
        { fromNodeId: "cel", toNodeId: "trap" },
        { fromNodeId: "trap", toNodeId: "depth" },
      ],
    };
    const c16 = compileVisualLookRecipeGraph(graph, { uniformAlignmentBytes: 16 });
    const c16Repeat = compileVisualLookRecipeGraph(graph, { uniformAlignmentBytes: 16 });
    expect(c16.packedUniformBuffer).toEqual(c16Repeat.packedUniformBuffer);
    expect(c16.packedUniformBuffer.byteLength % 16).toBe(0);
    expect(c16.perPassStrideBytes).toBe(32);
    for (const pass of c16.activePasses) {
      expect(pass.uniformFloats.byteLength % 16).toBe(0);
      expect(pass.uniformSlice.byteOffset % 16).toBe(0);
      expect(pass.uniformSlice.byteLength % 16).toBe(0);
    }

    const c256 = compileVisualLookRecipeGraph(graph, { uniformAlignmentBytes: 256 });
    expect(c256.perPassStrideBytes).toBe(256);
    expect(c256.packedUniformBuffer.byteLength).toBe(3 * 256);
    expect(c256.activePasses[2]?.uniformSlice.byteOffset).toBe(512);
  });

  it("20. 비파괴 세션 오버라이드와 개별·전체 리셋은 원본 레시피 그래프를 전혀 변이시키지 않고 초기 상태를 복원한다", () => {
    const baseGraph: VisualLookRecipeGraph = {
      id: "session-demo",
      nodes: [
        { id: "cel", kind: "cel-shade-step", enabled: true, intensity: 0.6, params: { stepCount: 3 } },
        { id: "grain", kind: "paper-grain", enabled: true, intensity: 0.3, params: { warmth: 0.25 } },
      ],
      edges: [{ fromNodeId: "cel", toNodeId: "grain" }],
    };
    const frozenSnapshot = JSON.stringify(baseGraph);
    const baseline = compileVisualLookRecipeGraph(baseGraph);

    let session = createNonDestructiveLookSession(baseGraph);
    session = applyVisualLookOverride(session, "cel", { intensity: 0.95, params: { stepCount: 5 } });
    session = applyVisualLookOverride(session, "grain", { enabled: false });

    const overridden = compileVisualLookRecipeGraph(session.baseGraph, { overrides: session.overrides });
    expect(overridden.activePasses.length).toBe(1);
    expect(overridden.activePasses[0]?.intensity).toBeCloseTo(0.95, 5);
    expect(overridden.activePasses[0]?.resolvedParams.stepCount).toBe(5);
    expect(JSON.stringify(baseGraph)).toBe(frozenSnapshot);

    const partialReset = resetVisualLookOverride(session, "grain");
    expect(compileVisualLookRecipeGraph(baseGraph, { overrides: partialReset.overrides }).activePasses.length).toBe(2);

    const fullReset = resetVisualLookOverride(partialReset);
    const restored = compileVisualLookRecipeGraph(baseGraph, { overrides: fullReset.overrides });
    expect(restored.packedUniformBuffer).toEqual(baseline.packedUniformBuffer);
    expect(restored.summaryKo).toBe(baseline.summaryKo);
  });

  it("21. 모든 카드가 꺼졌을 때 한글 요약과 픽셀 평가기는 GPU 0패스 무변경 상태로 동작한다", () => {
    const src = createSolidLinearBuffer(6, 6, 0.45, 0.52, 0.61, 1);
    const srcCopy = new Float32Array(src);
    const mutedGraph: VisualLookRecipeGraph = {
      id: "all-muted",
      nodes: [
        { id: "a", kind: "paper-grain", enabled: false, intensity: 0.5 },
        { id: "b", kind: "backlight-bloom", enabled: true, intensity: 0 },
      ],
      edges: [{ fromNodeId: "a", toNodeId: "b" }],
    };
    const report = evaluateNonDestructiveLookStack({ width: 6, height: 6, linearRgba: src }, mutedGraph);
    expect(report.executedPassCount).toBe(0);
    expect(report.skippedPassCount).toBe(2);
    expect(report.maxChannelDelta).toBe(0);
    expect(report.outputLinearRgba).toEqual(srcCopy);
    expect(report.summaryKo).toContain("활성 룩 카드 없음");
    expect(report.summaryKo).toContain("생략 2개로 GPU 패스 절약");
  });

  it("22. 비파괴 룩 스택 평가는 원본 RGBA 버퍼를 보존하면서 대기 거리감·역광 번짐·종이 결·셀 단차를 반영한다", () => {
    const w = 8;
    const h = 8;
    const linearRgba = createSolidLinearBuffer(w, h, 0.35, 0.32, 0.28, 1);
    linearRgba[0] = 1.15;
    linearRgba[1] = 1.1;
    linearRgba[2] = 0.95;
    const beforeCopy = new Float32Array(linearRgba);
    const zDepthMeters = new Float32Array(w * h).fill(12);

    const graph: VisualLookRecipeGraph = {
      id: "full-eval",
      nodes: [
        { id: "cel", kind: "cel-shade-step", enabled: true, intensity: 0.7 },
        { id: "depth", kind: "atmospheric-depth", enabled: true, intensity: 0.8, params: { nearMeters: 1, farMeters: 12, tintLinearRgb: [0.85, 0.9, 0.98] } },
        { id: "bloom", kind: "backlight-bloom", enabled: true, intensity: 0.6, params: { threshold: 0.7, spreadRadius: 2 } },
        { id: "grain", kind: "paper-grain", enabled: true, intensity: 0.4, params: { warmth: 0.4 } },
      ],
      edges: [
        { fromNodeId: "cel", toNodeId: "depth" },
        { fromNodeId: "depth", toNodeId: "bloom" },
        { fromNodeId: "bloom", toNodeId: "grain" },
      ],
    };

    const res = evaluateNonDestructiveLookStack({ width: w, height: h, linearRgba, zDepthMeters }, graph);
    expect(linearRgba).toEqual(beforeCopy);
    expect(res.executedPassCount).toBe(4);
    expect(res.maxChannelDelta).toBeGreaterThan(0.15);
    expect(res.meanLuminanceAfter).toBeGreaterThan(res.meanLuminanceBefore);
    expect(res.summaryKo).toContain("셀 음영 단차(70%) → 대기 거리감(80%) → 역광 번짐(60%) → 종이 결(40%)");
  });

  it("23. 선화 색트임(색수차 방지 선트랩) 카드는 먹선 인접 픽셀의 흰 들뜸과 적·청 색수차 편차를 억제한다", () => {
    const w = 5;
    const h = 5;
    const buf = createSolidLinearBuffer(w, h, 0.62, 0.58, 0.54, 1);
    const lineartMask01 = new Float32Array(w * h).fill(0);
    // 중앙 픽셀(2,2)은 진한 먹선, 바로 옆(3,2)은 색수차 들뜸(R 과다·B 결핍) 픽셀로 구성
    const inkIdx = 2 * w + 2;
    lineartMask01[inkIdx] = 1;
    buf[inkIdx * 4] = 0.02;
    buf[inkIdx * 4 + 1] = 0.02;
    buf[inkIdx * 4 + 2] = 0.02;

    const fringeIdx = 2 * w + 3;
    buf[fringeIdx * 4] = 0.95;
    buf[fringeIdx * 4 + 1] = 0.58;
    buf[fringeIdx * 4 + 2] = 0.2;
    const beforeSpread = Math.abs((buf[fringeIdx * 4] ?? 0) - (buf[fringeIdx * 4 + 2] ?? 0));

    const trapGraph: VisualLookRecipeGraph = {
      id: "trap-only",
      nodes: [{ id: "trap", kind: "lineart-color-trap", enabled: true, intensity: 0.9, params: { trapWidthPx: 1, chromaticGuard: 0.9 } }],
      edges: [],
    };
    const res = evaluateNonDestructiveLookStack({ width: w, height: h, linearRgba: buf, lineartMask01 }, trapGraph);
    const afterSpread = Math.abs((res.outputLinearRgba[fringeIdx * 4] ?? 0) - (res.outputLinearRgba[fringeIdx * 4 + 2] ?? 0));
    expect(afterSpread).toBeLessThan(beforeSpread * 0.55);
    expect(res.outputLinearRgba[inkIdx * 4]).toBeCloseTo(0.02, 4);
  });
});
