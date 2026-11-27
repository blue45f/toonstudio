import { describe, expect, it } from "vitest";

import {
  DEFAULT_MOBILE_SCROLL_VIEWPORT,
  analyzeEpisodeScrollPacing,
  applyEpisodeStyleTransfer,
  bakeStyleTransferLut3D,
  computeOklabChannelStats,
  computeSquaredDistanceTransform,
  detectReverseReadingViolations,
  extractCelShadingRamp,
  floodFillWithGapClosing,
  inferStudioAssetSemanticTags,
  linearChannelToSrgb,
  oklabToSrgb,
  quantizeColorToCelRamp,
  recommendPanelGutterHeightPx,
  sampleStyleLut3D,
  srgbChannelToLinear,
  srgbToOklab,
  transferOklabColor,
  type SrgbColor,
} from "./index";

function createTestPaletteBuffer(colors: readonly SrgbColor[], repeatPerColor = 8): Float32Array {
  const totalPixels = colors.length * repeatPerColor;
  const rgba = new Float32Array(totalPixels * 4);
  for (let i = 0; i < totalPixels; i += 1) {
    const c = colors[i % colors.length] ?? { r: 0.5, g: 0.5, b: 0.5 };
    const base = i * 4;
    rgba[base] = c.r;
    rgba[base + 1] = c.g;
    rgba[base + 2] = c.b;
    rgba[base + 3] = 1;
  }
  return rgba;
}

function createBoxInkMask(
  width: number,
  height: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  rightWallGapStartY?: number,
  rightWallGapLength = 0,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let x = left; x <= right; x += 1) {
    mask[top * width + x] = 1;
    mask[bottom * width + x] = 1;
  }
  for (let y = top; y <= bottom; y += 1) {
    mask[y * width + left] = 1;
    const inGap =
      rightWallGapStartY !== undefined &&
      y >= rightWallGapStartY &&
      y < rightWallGapStartY + rightWallGapLength;
    if (!inGap) {
      mask[y * width + right] = 1;
    }
  }
  return mask;
}

describe("wasm64-wave34-multimodal-style-gapfill-eyeflow", () => {
  it("IEC 61966-2-1 sRGB 선형 광량 왕복 변환이 단조 증가하며 1e-7 정밀도를 만족한다", () => {
    let prev = -1;
    for (const sample of [0, 0.01, 0.04045, 0.18, 0.5, 0.82, 1]) {
      const lin = srgbChannelToLinear(sample);
      expect(lin).toBeGreaterThan(prev);
      prev = lin;
      expect(Math.abs(linearChannelToSrgb(lin) - sample)).toBeLessThan(1e-7);
    }
  });

  it("OKLab 정방향·역방향 변환이 원색·파스텔·무채색 전역에서 1e-5 이내로 일치한다", () => {
    const samples: readonly SrgbColor[] = [
      { r: 0, g: 0, b: 0 },
      { r: 1, g: 1, b: 1 },
      { r: 0.5, g: 0.5, b: 0.5 },
      { r: 0.92, g: 0.24, b: 0.18 },
      { r: 0.18, g: 0.72, b: 0.44 },
      { r: 0.22, g: 0.41, b: 0.88 },
      { r: 0.95, g: 0.81, b: 0.72 },
    ];
    for (const srgb of samples) {
      const lab = srgbToOklab(srgb);
      const restored = oklabToSrgb(lab);
      expect(Math.abs(restored.r - srgb.r)).toBeLessThan(1e-5);
      expect(Math.abs(restored.g - srgb.g)).toBeLessThan(1e-5);
      expect(Math.abs(restored.b - srgb.b)).toBeLessThan(1e-5);
    }
    const neutral = srgbToOklab({ r: 0.45, g: 0.45, b: 0.45 });
    expect(Math.abs(neutral.a)).toBeLessThan(1e-6);
    expect(Math.abs(neutral.b)).toBeLessThan(1e-6);
  });

  it("OKLab 채널 통계 산출 시 투명 픽셀과 어두운 먹선을 배제해 순수 채색 분포만 추출한다", () => {
    const rgba = new Float32Array([
      0.02, 0.02, 0.02, 1, // 먹선 (배제 대상)
      0.9, 0.5, 0.2, 0, // 투명 픽셀 (배제 대상)
      0.85, 0.65, 0.35, 1, // 따뜻한 채색 1
      0.92, 0.74, 0.42, 1, // 따뜻한 채색 2
    ]);
    const stats = computeOklabChannelStats(rgba);
    expect(stats.sampleCount).toBe(2);
    expect(stats.meanL).toBeGreaterThan(0.7);
    expect(stats.meanB).toBeGreaterThan(0.06);
  });

  it("3단 셀 셰이딩 램프가 그림자 < 중간톤 < 하이라이트 명도 순서를 보장하고 색을 양자화한다", () => {
    const refRgba = createTestPaletteBuffer([
      { r: 0.22, g: 0.26, b: 0.48 },
      { r: 0.48, g: 0.56, b: 0.78 },
      { r: 0.88, g: 0.91, b: 0.98 },
    ]);
    const ramp = extractCelShadingRamp(refRgba);
    expect(ramp.shadowOklab.l).toBeLessThan(ramp.midtoneOklab.l);
    expect(ramp.midtoneOklab.l).toBeLessThan(ramp.highlightOklab.l);

    const quantizedDark = quantizeColorToCelRamp({ r: 0.2, g: 0.24, b: 0.42 }, ramp, 1);
    expect(quantizedDark.b).toBeCloseTo(ramp.shadow.b, 4);
    const quantizedBright = quantizeColorToCelRamp({ r: 0.92, g: 0.93, b: 0.99 }, ramp, 1);
    expect(quantizedBright.r).toBeCloseTo(ramp.highlight.r, 4);
  });

  it("차가운 낮 원고 팔레트를 따뜻한 노을 레퍼런스로 전이하며 strength=0 에서는 원본을 유지한다", () => {
    const coolSource = createTestPaletteBuffer([
      { r: 0.32, g: 0.52, b: 0.82 },
      { r: 0.55, g: 0.72, b: 0.92 },
      { r: 0.78, g: 0.86, b: 0.96 },
    ], 4);
    const warmSunsetRef = createTestPaletteBuffer([
      { r: 0.76, g: 0.34, b: 0.22 },
      { r: 0.92, g: 0.58, b: 0.32 },
      { r: 0.98, g: 0.82, b: 0.55 },
    ], 4);

    const zeroResult = applyEpisodeStyleTransfer(coolSource, 4, 3, warmSunsetRef, { strength: 0 });
    expect(zeroResult.meanDeltaOklab).toBeLessThan(1e-4);

    const fullResult = applyEpisodeStyleTransfer(coolSource, 4, 3, warmSunsetRef, { strength: 1 });
    const outStats = computeOklabChannelStats(fullResult.rgba);
    const srcStats = computeOklabChannelStats(coolSource);
    expect(outStats.meanB).toBeGreaterThan(srcStats.meanB + 0.08);
    expect(outStats.meanA).toBeGreaterThan(srcStats.meanA + 0.04);
  });

  it("Monge-Kantorovich 공분산 전이와 대각 Reinhard 전이 모두에서 중간 강도(0.5)가 단조 보간된다", () => {
    const srcStats = computeOklabChannelStats(
      createTestPaletteBuffer([{ r: 0.28, g: 0.55, b: 0.8 }, { r: 0.62, g: 0.78, b: 0.92 }]),
    );
    const refStats = computeOklabChannelStats(
      createTestPaletteBuffer([{ r: 0.82, g: 0.42, b: 0.25 }, { r: 0.95, g: 0.74, b: 0.45 }]),
    );
    const probe = srgbToOklab({ r: 0.45, g: 0.66, b: 0.86 });

    const halfMk = transferOklabColor(probe, srcStats, refStats, { strength: 0.5 });
    const fullMk = transferOklabColor(probe, srcStats, refStats, { strength: 1 });
    expect(halfMk.b).toBeGreaterThan(probe.b);
    expect(fullMk.b).toBeGreaterThan(halfMk.b);

    const diagReinhard = transferOklabColor(probe, srcStats, refStats, {
      strength: 1,
      chromaCovarianceTransfer: false,
    });
    expect(diagReinhard.b).toBeGreaterThan(probe.b);
  });

  it("preserveLineartLuminance 활성화 시 밝은 파스텔 레퍼런스 전이에도 먹선 휘도와 무채색을 보존한다", () => {
    const source = new Float32Array([
      0.03, 0.03, 0.03, 1, // 진한 먹선 1
      0.05, 0.04, 0.04, 1, // 진한 먹선 2
      0.42, 0.58, 0.82, 1, // 채색 픽셀 1
      0.64, 0.76, 0.92, 1, // 채색 픽셀 2
    ]);
    const brightPastelRef = createTestPaletteBuffer([
      { r: 0.98, g: 0.84, b: 0.88 },
      { r: 0.96, g: 0.92, b: 0.78 },
    ]);

    const preserved = applyEpisodeStyleTransfer(source, 2, 2, brightPastelRef, {
      preserveLineartLuminance: true,
      strength: 1,
    });
    expect(preserved.preservedInkPixelCount).toBe(2);
    expect(preserved.rgba[0]).toBeCloseTo(0.03, 5);
    expect(preserved.rgba[1]).toBeCloseTo(0.03, 5);

    const unpreserved = applyEpisodeStyleTransfer(source, 2, 2, brightPastelRef, {
      preserveLineartLuminance: false,
      strength: 1,
    });
    expect(unpreserved.preservedInkPixelCount).toBe(0);
    expect(unpreserved.rgba[0] ?? 0).toBeGreaterThan(0.25);
  });

  it("3D 스타일 LUT 삼선형 보간(sampleStyleLut3D)이 격자 정점 일치 및 복셀 중심 연속 보간을 보장한다", () => {
    const src = createTestPaletteBuffer([{ r: 0.3, g: 0.4, b: 0.6 }, { r: 0.7, g: 0.8, b: 0.9 }]);
    const ref = createTestPaletteBuffer([{ r: 0.6, g: 0.35, b: 0.25 }, { r: 0.9, g: 0.75, b: 0.5 }]);
    const lut = bakeStyleTransferLut3D(src, ref, { lutGridSize: 9, strength: 0.8 });

    const c0 = sampleStyleLut3D(lut, { r: 0.25, g: 0.5, b: 0.5 });
    const c1 = sampleStyleLut3D(lut, { r: 0.375, g: 0.5, b: 0.5 });
    const mid = sampleStyleLut3D(lut, { r: 0.3125, g: 0.5, b: 0.5 });
    expect(mid.r).toBeCloseTo((c0.r + c1.r) * 0.5, 5);
    expect(mid.g).toBeCloseTo((c0.g + c1.g) * 0.5, 5);
    expect(mid.b).toBeCloseTo((c0.b + c1.b) * 0.5, 5);
  });

  it("2D 제곱 유클리드 거리 변환(computeSquaredDistanceTransform)이 정확한 격자 거리를 계산한다", () => {
    const mask = new Uint8Array(25);
    mask[2 * 5 + 2] = 1; // 중심 (2, 2)
    const edtSq = computeSquaredDistanceTransform(mask, 5, 5);
    expect(edtSq[2 * 5 + 2]).toBe(0);
    expect(edtSq[2 * 5 + 3]).toBe(1);
    expect(edtSq[3 * 5 + 3]).toBe(2);
    expect(edtSq[0 * 5 + 0]).toBe(8);
  });

  it("틈새 닫기 채우기(floodFillWithGapClosing)가 3px 끊어진 선화 누출을 막고 먹선 경계까지 복원한다", () => {
    const width = 24;
    const height = 24;
    // (4,4)..(16,16) 사각형, 오른쪽 벽 x=16의 y=9..11 (3px 틈새) 개방
    const inkMask = createBoxInkMask(width, height, 4, 4, 16, 16, 9, 3);
    const result = floodFillWithGapClosing({
      width,
      height,
      inkMask,
      seedX: 10,
      seedY: 10,
      maxGapPx: 3,
    });

    expect(result.leakedToBorder).toBe(false);
    expect(result.sealedGapPixelCount).toBeGreaterThan(0);
    expect(result.reclaimedBoundaryPixelCount).toBeGreaterThan(0);
    // 왼쪽·위쪽 모서리 내부 픽셀 (5, 5)까지 빈틈없이 채워졌는지 검증
    expect(result.filledMask[5 * width + 5]).toBe(1);
    // 오른쪽 벽 바깥 배경 (18, 10)으로는 단 1픽셀도 새지 않아야 함
    expect(result.filledMask[10 * width + 18]).toBe(0);
  });

  it("개방 통로 폭이 maxGapPx 보다 넓거나 maxGapPx=0 이면 정상적으로 열린 영역을 통과해 채운다", () => {
    const width = 24;
    const height = 24;
    // 오른쪽 벽에 8px 넓은 통로(y=7..14)가 뚫린 도형
    const wideOpenMask = createBoxInkMask(width, height, 4, 4, 16, 16, 7, 8);
    const wideFill = floodFillWithGapClosing({
      width,
      height,
      inkMask: wideOpenMask,
      seedX: 10,
      seedY: 10,
      maxGapPx: 3,
    });
    expect(wideFill.leakedToBorder).toBe(true);
    expect(wideFill.filledMask[10 * width + 20]).toBe(1);

    // 2px 틈새지만 maxGapPx=0 (틈새 닫기 비활성)인 경우 바깥으로 흐름
    const smallGapMask = createBoxInkMask(width, height, 4, 4, 16, 16, 10, 2);
    const noCloseFill = floodFillWithGapClosing({
      width,
      height,
      inkMask: smallGapMask,
      seedX: 10,
      seedY: 10,
      maxGapPx: 0,
    });
    expect(noCloseFill.leakedToBorder).toBe(true);
  });

  it("선화 인접 시드 승격, 먹선 위 시드 방어 및 fillColor 합성 버퍼가 먹선을 침범하지 않는다", () => {
    const width = 20;
    const height = 20;
    const inkMask = createBoxInkMask(width, height, 3, 3, 15, 15, 9, 2);

    const onInk = floodFillWithGapClosing({ width, height, inkMask, seedX: 3, seedY: 3, maxGapPx: 3 });
    expect(onInk.filledPixelCount).toBe(0);

    // 선화 바로 옆 (4, 4)를 클릭해도 코어 시드로 승격되어 내부 전체를 정상 채움
    const nearWall = floodFillWithGapClosing({
      width,
      height,
      inkMask,
      seedX: 4,
      seedY: 4,
      maxGapPx: 3,
      fillColor: { r: 0.94, g: 0.78, b: 0.68 },
    });
    expect(nearWall.leakedToBorder).toBe(false);
    expect(nearWall.filledPixelCount).toBeGreaterThan(110);
    expect(nearWall.compositedRgba).toBeDefined();
    // 먹선 위치 (3, 3)은 채움 색으로 덮어써지지 않음
    const inkBase = (3 * width + 3) * 4;
    expect(nearWall.compositedRgba?.[inkBase]).toBeCloseTo(0.05, 4);
    const fillBase = (8 * width + 8) * 4;
    expect(nearWall.compositedRgba?.[fillBase]).toBeCloseTo(0.94, 4);
  });

  it("멀티모달 태거가 한글 3D 원목 가구 에셋(.glb)을 따뜻한 색감의 3d-prop으로 정확히 분류한다", () => {
    const res = inferStudioAssetSemanticTags({
      name: "앤티크_원목_카페_테이블_소품.glb",
      boundingBoxMeters: { x: 1.2, y: 0.75, z: 0.8 },
      dominantColorsSrgb: [{ r: 0.72, g: 0.48, b: 0.26 }],
      transparencyRatio: 0,
    });
    expect(res.category).toBe("3d-prop");
    expect(res.colorTemperature).toBe("warm");
    expect(res.transparencyClass).toBe("opaque");
    expect(res.tagsKo).toContain("3D 소품");
    expect(res.tagsKo).toContain("따뜻한 색감");
    expect(res.tagsEn).toContain("furniture");
  });

  it("멀티모달 태거가 인체 리깅 본을 가진 VRM 의상 에셋을 vrm-outfit 및 humanoid-tall로 분류한다", () => {
    const res = inferStudioAssetSemanticTags({
      name: "하복_세일러_교복_자켓_레이스.vrm",
      description: "School uniform jacket outfit for avatar",
      boundingBoxMeters: { x: 0.48, y: 1.42, z: 0.32 },
      hasRiggedHumanoidBones: true,
      transparencyRatio: 0.18,
      dominantColorsSrgb: [{ r: 0.92, g: 0.93, b: 0.94 }],
    });
    expect(res.category).toBe("vrm-outfit");
    expect(res.aspectProfile).toBe("humanoid-tall");
    expect(res.transparencyClass).toBe("cutout-alpha");
    expect(res.tagsKo).toContain("VRM 의상");
    expect(res.tagsKo).toContain("교복 스타일");
  });

  it("멀티모달 태거가 정방형 반투명 먹선 펜촉 스탬프를 brush로 분류하고 썸네일 알파를 자동 추론한다", () => {
    const thumb = new Float32Array(16 * 4);
    // 16픽셀 중 12픽셀 투명, 4픽셀 불투명 먹선 스탬프 -> 투명도 0.75
    for (let i = 0; i < 4; i += 1) {
      thumb[i * 4] = 0.1;
      thumb[i * 4 + 1] = 0.1;
      thumb[i * 4 + 2] = 0.1;
      thumb[i * 4 + 3] = 1;
    }
    const res = inferStudioAssetSemanticTags({
      name: "거친_먹선_펜촉_브러시_스탬프.sut",
      description: "Rough ink pen nib watercolor stamp",
      widthPx: 512,
      heightPx: 512,
      thumbnailRgba: thumb,
    });
    expect(res.category).toBe("brush");
    expect(res.aspectProfile).toBe("square-stamp");
    expect(res.transparencyClass).toBe("soft-translucent");
    expect(res.tagsKo).toContain("브러시");
    expect(res.tagsEn).toContain("ink-lineart");
  });

  it("멀티모달 태거가 긴 세로 종횡비(800x4800) 웹툰 컷 레이아웃을 panel-template 및 차가운 색감으로 분류한다", () => {
    const res = inferStudioAssetSemanticTags({
      name: "액션_대각선_4컷_세로_스크롤_템플릿.json",
      widthPx: 800,
      heightPx: 4800,
      panelFrameCount: 4,
      dominantColorsSrgb: [{ r: 0.22, g: 0.45, b: 0.88 }],
    });
    expect(res.category).toBe("panel-template");
    expect(res.aspectProfile).toBe("vertical-scroll");
    expect(res.colorTemperature).toBe("cool");
    expect(res.tagsKo).toContain("패널 템플릿");
    expect(res.tagsKo).toContain("차가운 색감");
  });

  it("정돈된 좌상→우하 세로 스크롤 에피소드는 위반 0건과 높은 페이싱 점수를 기록한다", () => {
    const report = analyzeEpisodeScrollPacing({
      viewport: DEFAULT_MOBILE_SCROLL_VIEWPORT,
      panels: [
        {
          id: "cut-1",
          topY: 0,
          heightPx: 620,
          beatKind: "dialogue-exchange",
          currentGutterAfterPx: 220,
          balloons: [
            { id: "b1", readingOrder: 0, x: 40, y: 60, width: 140, height: 80, characterCount: 24 },
            { id: "b2", readingOrder: 1, x: 200, y: 240, width: 140, height: 80, characterCount: 28 },
          ],
          focalAnchors: [{ id: "hero-face", x: 180, y: 180 }],
        },
        {
          id: "cut-2",
          topY: 840,
          heightPx: 700,
          beatKind: "fast-action",
          currentGutterAfterPx: 90,
          actionVectors: [{ id: "slash-1", startX: 195, startY: 900, endX: 195, endY: 1420, intensity: 0.95 }],
        },
      ],
    });

    expect(report.reverseReadingViolations).toHaveLength(0);
    expect(report.cognitiveOverloadWindows).toHaveLength(0);
    expect(report.downwardFlowRatio).toBe(1);
    expect(report.overallPacingScore).toBeGreaterThanOrEqual(90);
  });

  it("말풍선 상하 역전 및 같은 줄 좌우 읽기 흐름 역행(LTR·RTL)을 정확히 검출한다", () => {
    const panels = [
      {
        id: "cut-inv",
        topY: 0,
        heightPx: 600,
        beatKind: "dialogue-exchange" as const,
        balloons: [
          { id: "b1", readingOrder: 0, x: 220, y: 260, width: 120, height: 70 },
          { id: "b2", readingOrder: 1, x: 60, y: 120, width: 120, height: 70 }, // 위쪽으로 역행
          { id: "b3", readingOrder: 2, x: 240, y: 420, width: 110, height: 70 },
          { id: "b4", readingOrder: 3, x: 50, y: 430, width: 110, height: 70 }, // 같은 줄 왼쪽 역행 (LTR 기준)
        ],
      },
    ];

    const ltrViolations = detectReverseReadingViolations(panels, "ltr");
    expect(ltrViolations.some((v) => v.kind === "vertical-bottom-to-top")).toBe(true);
    expect(ltrViolations.some((v) => v.kind === "horizontal-against-flow" && v.laterBalloonId === "b4")).toBe(true);

    // RTL 만화 모드에서는 b3(오른쪽 240) -> b4(왼쪽 50)가 자연스러운 방향이므로 수평 위반이 아님
    const rtlViolations = detectReverseReadingViolations(panels, "rtl");
    expect(rtlViolations.some((v) => v.laterBalloonId === "b4")).toBe(false);
  });

  it("모바일 한 화면(390x844) 내 말풍선 4개 이상·글자 수 초과·인물 초점 과밀 인지 과부하를 진단한다", () => {
    const report = analyzeEpisodeScrollPacing({
      viewport: { widthPx: 390, heightPx: 844 },
      panels: [
        {
          id: "crowded-cut",
          topY: 100,
          heightPx: 760,
          beatKind: "dialogue-exchange",
          balloons: [
            { id: "b1", readingOrder: 0, x: 20, y: 120, width: 150, height: 80, characterCount: 42 },
            { id: "b2", readingOrder: 1, x: 200, y: 240, width: 150, height: 80, characterCount: 38 },
            { id: "b3", readingOrder: 2, x: 30, y: 380, width: 150, height: 80, characterCount: 40 },
            { id: "b4", readingOrder: 3, x: 190, y: 520, width: 160, height: 80, characterCount: 35 },
          ],
          focalAnchors: [
            { id: "f1", x: 70, y: 180 },
            { id: "f2", x: 300, y: 300 },
            { id: "f3", x: 90, y: 450 },
            { id: "f4", x: 280, y: 600 },
            { id: "f5", x: 195, y: 720 },
          ],
        },
      ],
    });

    expect(report.cognitiveOverloadWindows.length).toBeGreaterThanOrEqual(1);
    const diag = report.cognitiveOverloadWindows[0];
    expect(diag?.balloonCount).toBe(4);
    expect(diag?.totalCharacterCount).toBe(155);
    expect(diag?.reasons).toContain("excessive-balloons");
    expect(diag?.reasons).toContain("excessive-text-characters");
    expect(diag?.reasons).toContain("excessive-character-anchors");
  });

  it("클리프행어 서스펜스 여백(한 화면 이상)과 고속 액션 타이트 여백을 구분해 코칭한다", () => {
    const cliffhangerRec = recommendPanelGutterHeightPx(
      {
        id: "cliff-cut",
        topY: 0,
        heightPx: 780,
        beatKind: "dramatic-cliffhanger",
        currentGutterAfterPx: 180,
      },
      { widthPx: 390, heightPx: 844 },
    );
    expect(cliffhangerRec.recommendedGutterPx).toBeGreaterThan(844);
    expect(cliffhangerRec.pacingIssue).toBe("too-cramped-for-suspense");

    const fastActionRec = recommendPanelGutterHeightPx(
      {
        id: "action-cut",
        topY: 1800,
        heightPx: 640,
        beatKind: "fast-action",
        currentGutterAfterPx: 420,
        actionVectors: [{ id: "drop-kick", startX: 195, startY: 1900, endX: 195, endY: 2400, intensity: 1 }],
      },
      { widthPx: 390, heightPx: 844 },
    );
    expect(fastActionRec.recommendedGutterPx).toBeLessThan(120);
    expect(fastActionRec.pacingIssue).toBe("too-wide-breaks-action");
    expect(cliffhangerRec.recommendedGutterPx).toBeGreaterThan(fastActionRec.recommendedGutterPx * 8);
  });
});
