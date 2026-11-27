import { describe, expect, it } from "vitest";

import {
  colorizeLineartFromReferencePoints,
  compileInlineNeuralShaderToWgsl,
  compositeSeeThroughLayers,
  computeImageSimilarityMetrics,
  createDefaultWebtoonTactileBrushSpec,
  decodeFloat16,
  decomposeIllustrationSeeThroughLayers,
  emulateCompiledWgslInlineMlp,
  encodeFloat16,
  evaluateInlineNeuralTactileShader,
  inpaintOccludedLayerRegion,
  segmentClosedLineartRegions,
  SLANG_INLINE_TACTILE_BRUSH_SHADER,
  validateTranspiledWgslContract,
  verifyInlineNeuralShaderParity,
  type InlineNeuralHiddenActivation,
  type InlineNeuralMlpSpec,
  type InlineNeuralOutputActivation,
  type RgbaImageBuffer,
  type TactileBrushFeatureSample,
} from "./index";

type RgbaTuple = readonly [number, number, number, number];

function createRgbaBuffer(width: number, height: number, fill: RgbaTuple = [255, 255, 255, 255]): RgbaImageBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4;
    data[p] = fill[0];
    data[p + 1] = fill[1];
    data[p + 2] = fill[2];
    data[p + 3] = fill[3];
  }
  return { width, height, data };
}

function setPixel(img: RgbaImageBuffer, x: number, y: number, rgba: RgbaTuple): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const p = (y * img.width + x) * 4;
  img.data[p] = rgba[0];
  img.data[p + 1] = rgba[1];
  img.data[p + 2] = rgba[2];
  img.data[p + 3] = rgba[3];
}

function getPixel(img: RgbaImageBuffer, x: number, y: number): [number, number, number, number] {
  const p = (y * img.width + x) * 4;
  return [img.data[p], img.data[p + 1], img.data[p + 2], img.data[p + 3]];
}

function fillRectRgba(img: RgbaImageBuffer, x0: number, y0: number, w: number, h: number, rgba: RgbaTuple): void {
  const xEnd = Math.min(img.width, x0 + w);
  const yEnd = Math.min(img.height, y0 + h);
  for (let y = Math.max(0, y0); y < yEnd; y += 1) {
    for (let x = Math.max(0, x0); x < xEnd; x += 1) setPixel(img, x, y, rgba);
  }
}

function strokeRectOutline(
  img: RgbaImageBuffer,
  x0: number,
  y0: number,
  w: number,
  h: number,
  rgba: RgbaTuple = [10, 10, 10, 255],
): void {
  for (let x = x0; x < x0 + w; x += 1) {
    setPixel(img, x, y0, rgba);
    setPixel(img, x, y0 + h - 1, rgba);
  }
  for (let y = y0; y < y0 + h; y += 1) {
    setPixel(img, x0, y, rgba);
    setPixel(img, x0 + w - 1, y, rgba);
  }
}

function buildDiverseBrushSamples(count: number): TactileBrushFeatureSample[] {
  const samples: TactileBrushFeatureSample[] = [];
  for (let i = 0; i < count; i += 1) {
    samples.push({
      u: (i * 0.13) % 1,
      v: (i * 0.29) % 1,
      pressure: i / Math.max(1, count - 1),
      tiltSin: Math.abs(Math.sin(i * 0.7)),
      velocity: ((i * 7) % 11) / 10,
      paperGrain: ((i * 5) % 13) / 12,
      wetness: ((i * 3) % 9) / 8,
      radialDist: ((i * 11) % 10) / 10,
    });
  }
  return samples;
}

describe("wasm64-wave66-slang-neural-seethrough-manganinja", () => {
  it("1. 기준 SLANG_INLINE_TACTILE_BRUSH_SHADER는 neural.slang 문법·엔트리포인트·바인딩 계약을 포함한다", () => {
    expect(SLANG_INLINE_TACTILE_BRUSH_SHADER).toContain("import neural;");
    expect(SLANG_INLINE_TACTILE_BRUSH_SHADER).toContain("InlineVector<float, kInputDim>");
    expect(SLANG_INLINE_TACTILE_BRUSH_SHADER).toContain("InlineVector<float, kOutputDim>");
    expect(SLANG_INLINE_TACTILE_BRUSH_SHADER).toContain('[shader("compute")]');
    expect(SLANG_INLINE_TACTILE_BRUSH_SHADER).toContain("[numthreads(64, 1, 1)]");
    expect(SLANG_INLINE_TACTILE_BRUSH_SHADER).toContain("void cs_inline_neural_brush");
  });

  it("2. IEEE 754 FP16 인코딩·디코딩은 영·음수·이진분수·서브노멀·포화 경계를 결정론적으로 보존한다", () => {
    for (const v of [0, 0.125, -0.25, 0.5, 1.0, -1.75, 3.5, 16.0, -64.0]) {
      expect(decodeFloat16(encodeFloat16(v))).toBe(v);
    }
    const subnormal = Math.pow(2, -16);
    expect(Math.abs(decodeFloat16(encodeFloat16(subnormal)) - subnormal)).toBeLessThan(1e-7);
    expect(decodeFloat16(encodeFloat16(100_000))).toBe(65504);
    expect(decodeFloat16(encodeFloat16(-100_000))).toBe(-65504);
  });

  it("3. FP16 인라인 MLP 컴파일은 유효한 WGSL 바인딩 계약·unpack2x16float·결정론적 지문을 산출한다", () => {
    const spec = createDefaultWebtoonTactileBrushSpec("fp16");
    const compiledA = compileInlineNeuralShaderToWgsl(spec);
    const compiledB = compileInlineNeuralShaderToWgsl(spec);

    const contract = validateTranspiledWgslContract(compiledA);
    expect(contract.passed).toBe(true);
    expect(contract.hasComputeStage).toBe(true);
    expect(contract.hasWorkgroupSize).toBe(true);
    expect(contract.hasAllRequiredBindings).toBe(true);
    expect(contract.hasQuantizationUnpacker).toBe(true);
    expect(contract.hasBalancedDelimiters).toBe(true);
    expect(compiledA.wgslSource).toContain("unpack2x16float(word)");
    expect(compiledA.slangSource).toContain("import neural;");
    expect(compiledA.bindings).toHaveLength(4);
    expect(compiledA.fingerprint).toBe(compiledB.fingerprint);
    expect(Array.from(compiledA.packedWeightsU32)).toEqual(Array.from(compiledB.packedWeightsU32));
  });

  it("4. INT8 인라인 MLP 컴파일은 4개 가중치를 u32 1워드로 패킹하고 extractBits 언패커를 생성한다", () => {
    const fp16Compiled = compileInlineNeuralShaderToWgsl(createDefaultWebtoonTactileBrushSpec("fp16"));
    const int8Compiled = compileInlineNeuralShaderToWgsl(createDefaultWebtoonTactileBrushSpec("int8"));

    expect(validateTranspiledWgslContract(int8Compiled).passed).toBe(true);
    expect(int8Compiled.wgslSource).toContain("extractBits(bitcast<i32>(word)");
    expect(int8Compiled.weightLayout.byteLength).toBeLessThan(fp16Compiled.weightLayout.byteLength);
    expect(int8Compiled.weightLayout.w1Scale).toBeGreaterThan(0);
    expect(int8Compiled.weightLayout.w2Scale).toBeGreaterThan(0);
  });

  it("5. FP16 WGSL 패킹 버퍼 실행과 CPU 참조 MLP 순전파 오차는 32개 샘플 전체에서 < 1e-4이다", () => {
    const spec = createDefaultWebtoonTactileBrushSpec("fp16");
    const compiled = compileInlineNeuralShaderToWgsl(spec);
    const parity = verifyInlineNeuralShaderParity(compiled, buildDiverseBrushSamples(32), {
      originalFp32Spec: spec,
      tolerance: 1e-4,
    });
    expect(parity.passed).toBe(true);
    expect(parity.maxAbsError).toBeLessThan(1e-4);
    expect(parity.maxQuantizationDriftVsFp32).toBeLessThan(1e-4);
    expect(parity.rmse).toBeLessThan(1e-4);
  });

  it("6. INT8 WGSL 패킹 버퍼 실행과 CPU 참조 실행 간 최대 오차 역시 < 1e-4를 엄수한다", () => {
    const spec = createDefaultWebtoonTactileBrushSpec("int8");
    const compiled = compileInlineNeuralShaderToWgsl(spec);
    const parity = verifyInlineNeuralShaderParity(compiled, buildDiverseBrushSamples(32), {
      originalFp32Spec: spec,
      tolerance: 1e-4,
    });
    expect(parity.passed).toBe(true);
    expect(parity.maxAbsError).toBeLessThan(1e-4);
    expect(parity.maxQuantizationDriftVsFp32).toBeLessThan(0.03);
  });

  it("7. 모든 은닉·출력 활성화 함수 조합(relu/leaky_relu/tanh/silu × sigmoid/clamp01/linear)이 정합성 < 1e-4를 유지한다", () => {
    const hiddenActs: InlineNeuralHiddenActivation[] = ["relu", "leaky_relu", "tanh", "silu"];
    const outputActs: InlineNeuralOutputActivation[] = ["sigmoid", "clamp01", "linear"];
    const baseSpec = createDefaultWebtoonTactileBrushSpec("fp16");
    const samples = buildDiverseBrushSamples(8);

    for (const hiddenActivation of hiddenActs) {
      for (const outputActivation of outputActs) {
        const compiled = compileInlineNeuralShaderToWgsl({
          ...baseSpec,
          shaderId: `act_${hiddenActivation}_${outputActivation}`,
          hiddenActivation,
          outputActivation,
        });
        const report = verifyInlineNeuralShaderParity(compiled, samples, { tolerance: 1e-4 });
        expect(report.passed).toBe(true);
        expect(report.maxAbsError).toBeLessThan(1e-4);
      }
    }
  });

  it("8. 기본 웹툰 촉각 브러시 MLP는 필압·종이결·속도·습윤도에 대해 물리적으로 단조적인 응답을 낸다", () => {
    const compiled = compileInlineNeuralShaderToWgsl(createDefaultWebtoonTactileBrushSpec("fp16"));
    const heavyPress = evaluateInlineNeuralTactileShader(compiled, {
      u: 0.5, v: 0.5, pressure: 0.95, tiltSin: 0.2, velocity: 0.15, paperGrain: 0.2, wetness: 0.4, radialDist: 0.1,
    });
    const dryFastStroke = evaluateInlineNeuralTactileShader(compiled, {
      u: 0.5, v: 0.5, pressure: 0.15, tiltSin: 0.7, velocity: 0.95, paperGrain: 0.9, wetness: 0.05, radialDist: 0.7,
    });
    const wetGranulated = evaluateInlineNeuralTactileShader(compiled, {
      u: 0.5, v: 0.5, pressure: 0.45, tiltSin: 0.1, velocity: 0.2, paperGrain: 0.95, wetness: 0.95, radialDist: 0.3,
    });

    expect(heavyPress.inkDensity).toBeGreaterThan(dryFastStroke.inkDensity);
    expect(heavyPress.impastoHeight).toBeGreaterThan(dryFastStroke.impastoHeight);
    expect(dryFastStroke.dryBrushMask).toBeGreaterThan(heavyPress.dryBrushMask);
    expect(wetGranulated.granulation).toBeGreaterThan(dryFastStroke.granulation);
  });

  it("9. 비이진 임의 소수 FP32 가중치에 대해서도 FP16 컴파일러는 CPU-WGSL 오차 < 1e-4 및 저손실 근사를 보장한다", () => {
    const spec: InlineNeuralMlpSpec = {
      shaderId: "arbitrary_non_dyadic_mlp",
      inputDim: 4,
      hiddenDim: 6,
      outputDim: 2,
      weightsLayer1: [
        0.314159, -0.271828, 0.141421, 0.577215, -0.41231, 0.618033, -0.333333, 0.123456,
        0.707106, -0.198765, 0.456789, -0.222222, -0.555555, 0.381966, 0.271828, 0.161803,
        0.234567, 0.345678, -0.456789, 0.56789, -0.111111, -0.222222, 0.666666, 0.142857,
      ],
      biasLayer1: [0.05, -0.13, 0.21, -0.07, 0.11, -0.09],
      weightsLayer2: [
        0.4213, -0.3182, 0.5129, -0.2411, 0.3891, -0.1777,
        -0.2999, 0.6123, -0.1888, 0.4444, -0.3555, 0.5222,
      ],
      biasLayer2: [0.12, -0.18],
      hiddenActivation: "silu",
      outputActivation: "sigmoid",
      quantization: "fp16",
    };
    const compiled = compileInlineNeuralShaderToWgsl(spec);
    const vectors = [
      new Float32Array([0.1, 0.5, 0.9, 0.3]),
      new Float32Array([0.8, 0.2, 0.4, 0.7]),
      new Float32Array([0.0, 1.0, 0.5, 0.5]),
    ];
    const parity = verifyInlineNeuralShaderParity(compiled, vectors, { originalFp32Spec: spec, tolerance: 1e-4 });
    expect(parity.passed).toBe(true);
    expect(parity.maxAbsError).toBeLessThan(1e-4);
    expect(parity.maxQuantizationDriftVsFp32).toBeLessThan(2e-3);

    const directGpu = emulateCompiledWgslInlineMlp(compiled, vectors[0]);
    const directCpu = evaluateInlineNeuralTactileShader(compiled, vectors[0]).rawOutputs;
    expect(Math.abs(directGpu[0] - directCpu[0])).toBeLessThan(1e-6);
    expect(Math.abs(directGpu[1] - directCpu[1])).toBeLessThan(1e-6);
  });

  it("10. 잘못된 텐서 길이·비유한(NaN) 가중치·유효하지 않은 entryPoint 입력을 즉시 거부한다", () => {
    const valid = createDefaultWebtoonTactileBrushSpec("fp16");
    expect(() => compileInlineNeuralShaderToWgsl({ ...valid, biasLayer1: [0, 0] })).toThrow(/biasLayer1/);
    expect(() => compileInlineNeuralShaderToWgsl({ ...valid, biasLayer2: [0, Number.NaN, 0, 0] })).toThrow(/비유한/);
    expect(() => compileInlineNeuralShaderToWgsl({ ...valid, entryPoint: "123_invalid!" })).toThrow(/entryPoint/);
  });

  it("11. 단색 배경 + 중앙 전경 캐릭터 평면 일러스트를 자동 분리하고 가려진 배경 구멍을 100% 원색 복원한다", () => {
    const img = createRgbaBuffer(48, 48, [175, 210, 240, 255]);
    fillRectRgba(img, 18, 14, 12, 20, [215, 58, 72, 255]);

    const result = decomposeIllustrationSeeThroughLayers(img);
    expect(result.foregroundLayer.originalPixelCount).toBe(12 * 20);
    expect(result.backgroundLayer.occludedHolePixelCount).toBe(12 * 20);
    expect(result.backgroundLayer.inpaintedPixelCount).toBe(12 * 20);
    expect(result.backgroundLayer.remainingHolePixels).toBe(0);

    const centerBg = getPixel(result.backgroundLayer.image, 24, 24);
    expect(centerBg[3]).toBe(255);
    expect(Math.abs(centerBg[0] - 175)).toBeLessThanOrEqual(1);
    expect(Math.abs(centerBg[1] - 210)).toBeLessThanOrEqual(1);
    expect(Math.abs(centerBg[2] - 240)).toBeLessThanOrEqual(1);
  });

  it("12. 배경·측면 중경 소품·중앙 전경 캐릭터가 공존하는 장면을 3개 Z-Order 계층으로 자동 분해한다", () => {
    const img = createRgbaBuffer(56, 48, [225, 232, 242, 255]);
    fillRectRgba(img, 5, 22, 10, 16, [66, 148, 92, 255]);
    fillRectRgba(img, 23, 13, 12, 22, [210, 42, 68, 255]);

    const result = decomposeIllustrationSeeThroughLayers(img);
    expect(result.backgroundLayer.zOrder).toBe(0);
    expect(result.midgroundLayer.zOrder).toBe(1);
    expect(result.foregroundLayer.zOrder).toBe(2);
    expect(result.backgroundLayer.parallaxFactor).toBeLessThan(result.midgroundLayer.parallaxFactor);
    expect(result.midgroundLayer.parallaxFactor).toBeLessThan(result.foregroundLayer.parallaxFactor);
    expect(result.foregroundLayer.originalPixelCount).toBeGreaterThan(0);
    expect(result.midgroundLayer.originalPixelCount).toBeGreaterThan(0);
    expect(result.backgroundLayer.remainingHolePixels).toBe(0);
    expect(getPixel(result.foregroundLayer.image, 28, 24)[3]).toBe(255);
    expect(getPixel(result.midgroundLayer.image, 9, 28)[3]).toBe(255);
  });

  it("13. 수직 하늘 그라데이션 배경에 뚫린 구멍을 다중스케일 디퓨전으로 매끄럽게 100% 복원한다", () => {
    const width = 48;
    const height = 48;
    const groundTruth = createRgbaBuffer(width, height);
    for (let y = 0; y < height; y += 1) {
      const t = y / (height - 1);
      const rgb: RgbaTuple = [Math.round(90 + t * 110), Math.round(145 + t * 80), Math.round(235 - t * 35), 255];
      for (let x = 0; x < width; x += 1) setPixel(groundTruth, x, y, rgb);
    }

    const withHole: RgbaImageBuffer = { width, height, data: new Uint8ClampedArray(groundTruth.data) };
    const holeMask = new Uint8Array(width * height);
    for (let y = 14; y < 34; y += 1) {
      for (let x = 18; x < 30; x += 1) {
        holeMask[y * width + x] = 1;
        setPixel(withHole, x, y, [0, 0, 0, 0]);
      }
    }

    const restored = inpaintOccludedLayerRegion(withHole, holeMask, {
      pyramidScales: 3,
      diffusionIterations: 28,
      patchRadius: 2,
    });
    expect(restored.restorationRate).toBe(1);
    expect(restored.remainingHolePixels).toBe(0);
    const similarity = computeImageSimilarityMetrics(groundTruth, restored.image);
    expect(similarity.mae).toBeLessThan(2.5);
    expect(similarity.psnrDb).toBeGreaterThan(36);
  });

  it("14. 수평 지평선(상단 하늘·하단 지면)을 가로지르는 전경 구멍을 구조-인식 패치 복원으로 지평선 단차 없이 복원한다", () => {
    const width = 48;
    const height = 48;
    const groundTruth = createRgbaBuffer(width, height, [120, 185, 240, 255]);
    fillRectRgba(groundTruth, 0, 24, width, 24, [196, 158, 108, 255]);

    const occluded: RgbaImageBuffer = { width, height, data: new Uint8ClampedArray(groundTruth.data) };
    const holeMask = new Uint8Array(width * height);
    for (let y = 10; y < 38; y += 1) {
      for (let x = 19; x < 29; x += 1) {
        holeMask[y * width + x] = 1;
        setPixel(occluded, x, y, [0, 0, 0, 0]);
      }
    }

    const restored = inpaintOccludedLayerRegion(occluded, holeMask, {
      pyramidScales: 3,
      diffusionIterations: 24,
      patchRadius: 2,
      structureStrength: 2.5,
    });
    expect(restored.remainingHolePixels).toBe(0);
    const skyPx = getPixel(restored.image, 24, 18);
    const groundPx = getPixel(restored.image, 24, 30);
    expect(Math.abs(skyPx[0] - 120) + Math.abs(skyPx[2] - 240)).toBeLessThan(12);
    expect(Math.abs(groundPx[0] - 196) + Math.abs(groundPx[2] - 108)).toBeLessThan(12);
  });

  it("15. Z-Order 재합성(parallax=0) 결과는 원본 평면 일러스트와 PSNR >= 45dB 및 MAE == 0 수준으로 일치한다", () => {
    const img = createRgbaBuffer(48, 48, [230, 236, 244, 255]);
    fillRectRgba(img, 6, 24, 8, 14, [72, 136, 98, 255]);
    fillRectRgba(img, 18, 12, 12, 24, [218, 64, 88, 255]);
    fillRectRgba(img, 21, 15, 6, 6, [246, 214, 192, 255]);

    const result = decomposeIllustrationSeeThroughLayers(img);
    expect(result.recompositionMae).toBe(0);
    expect(result.recompositionPsnrDb).toBeGreaterThanOrEqual(45);
  });

  it("16. 2.5D 패럴랙스 이동 합성 시 전경이 이동한 빈자리에 인페인팅 복원된 배경이 결손 없이 드러난다", () => {
    const img = createRgbaBuffer(48, 48, [160, 200, 235, 255]);
    fillRectRgba(img, 18, 14, 12, 20, [220, 60, 75, 255]);

    const result = decomposeIllustrationSeeThroughLayers(img);
    const shifted = compositeSeeThroughLayers(result.layers, { x: 6, y: 0 });
    const revealedBg = getPixel(shifted, 19, 24);
    expect(revealedBg[3]).toBe(255);
    expect(Math.abs(revealedBg[0] - 160)).toBeLessThanOrEqual(2);
    expect(Math.abs(revealedBg[2] - 235)).toBeLessThanOrEqual(2);

    const movedFg = getPixel(shifted, 28, 24);
    expect(movedFg[0]).toBe(220);
    expect(movedFg[1]).toBe(60);
  });

  it("17. 전경 캐릭터 내부에 완전히 포위된 눈·의상 장식 세부 영역은 전경 레이어에 함께 귀속된다", () => {
    const img = createRgbaBuffer(48, 48, [180, 210, 235, 255]);
    fillRectRgba(img, 16, 12, 16, 24, [45, 72, 140, 255]);
    fillRectRgba(img, 22, 20, 4, 4, [242, 204, 58, 255]);

    const result = decomposeIllustrationSeeThroughLayers(img);
    const broochOnFg = getPixel(result.foregroundLayer.image, 23, 21);
    expect(broochOnFg[3]).toBe(255);
    expect(broochOnFg[0]).toBe(242);
    expect(broochOnFg[1]).toBe(204);
  });

  it("18. 전경 캐릭터가 가로지른 중경 벤치/소품의 가려진 중앙 구멍을 복원하면서 바깥 중경 여백은 투명하게 유지한다", () => {
    const img = createRgbaBuffer(56, 48, [195, 220, 242, 255]);
    fillRectRgba(img, 6, 26, 44, 8, [146, 98, 56, 255]);
    fillRectRgba(img, 23, 10, 10, 28, [215, 55, 82, 255]);

    const result = decomposeIllustrationSeeThroughLayers(img, {
      semanticSeeds: [
        { x: 2, y: 2, role: "background" },
        { x: 10, y: 30, role: "midground" },
        { x: 44, y: 30, role: "midground" },
        { x: 27, y: 20, role: "foreground" },
      ],
    });
    expect(result.midgroundLayer.occludedHolePixelCount).toBeGreaterThan(0);
    expect(result.midgroundLayer.remainingHolePixels).toBe(0);
    const restoredBench = getPixel(result.midgroundLayer.image, 27, 30);
    expect(restoredBench[3]).toBe(255);
    expect(Math.abs(restoredBench[0] - 146)).toBeLessThanOrEqual(3);
    expect(Math.abs(restoredBench[1] - 98)).toBeLessThanOrEqual(3);
    expect(getPixel(result.midgroundLayer.image, 27, 6)[3]).toBe(0);
  });

  it("19. See-Through 인페인터는 잘못된 버퍼 크기나 마스크 길이를 즉시 검출해 예외를 던진다", () => {
    const img = createRgbaBuffer(16, 16);
    expect(() => inpaintOccludedLayerRegion(img, new Uint8Array(10))).toThrow(/holeMask/);
    expect(() =>
      decomposeIllustrationSeeThroughLayers({ width: 16, height: 16, data: new Uint8ClampedArray(10) }),
    ).toThrow(/RGBA 버퍼 길이/);
  });

  it("20. MangaNinja 포인트 힌트 2개로 닫힌 2개 영역에 정확한 레퍼런스 색상을 이식하고 선화 경계 넘침 0픽셀을 달성한다", () => {
    const reference = createRgbaBuffer(48, 48, [255, 255, 255, 255]);
    fillRectRgba(reference, 4, 10, 16, 26, [232, 82, 96, 255]);
    fillRectRgba(reference, 26, 10, 16, 26, [54, 146, 224, 255]);

    const lineart = createRgbaBuffer(48, 48, [255, 255, 255, 255]);
    strokeRectOutline(lineart, 6, 12, 14, 22, [8, 8, 8, 255]);
    strokeRectOutline(lineart, 26, 12, 14, 22, [8, 8, 8, 255]);

    const result = colorizeLineartFromReferencePoints(
      lineart,
      reference,
      [
        { id: "hair-hint", refX: 12, refY: 22, targetX: 12, targetY: 22 },
        { id: "coat-hint", refX: 34, refY: 22, targetX: 32, targetY: 22 },
      ],
      { enableCelShading: false },
    );

    expect(result.appliedHints).toHaveLength(2);
    expect(result.leakAudit.passed).toBe(true);
    expect(result.leakAudit.mutatedLineartPixels).toBe(0);
    expect(result.leakAudit.crossBoundaryLeakPixels).toBe(0);
    expect(result.leakAudit.leakRatio).toBe(0);

    for (let y = 13; y < 33; y += 1) {
      for (let x = 7; x < 19; x += 1) expect(getPixel(result.colorizedImage, x, y)).toEqual([232, 82, 96, 255]);
      for (let x = 27; x < 39; x += 1) expect(getPixel(result.colorizedImage, x, y)).toEqual([54, 146, 224, 255]);
    }
    expect(getPixel(result.colorizedImage, 2, 2)).toEqual([255, 255, 255, 255]);
    expect(getPixel(result.colorizedImage, 22, 22)).toEqual([255, 255, 255, 255]);
    expect(getPixel(result.colorizedImage, 6, 12)).toEqual([8, 8, 8, 255]);
    expect(getPixel(result.colorizedImage, 26, 12)).toEqual([8, 8, 8, 255]);
  });

  it("21. 공유 선화 벽(1px)을 사이에 두고 맞붙은 인접 2개 영역에서도 색상 교차 침범은 0픽셀이다", () => {
    const reference = createRgbaBuffer(40, 32, [255, 255, 255, 255]);
    fillRectRgba(reference, 4, 4, 12, 20, [245, 198, 74, 255]);
    fillRectRgba(reference, 22, 4, 12, 20, [118, 76, 196, 255]);

    const lineart = createRgbaBuffer(40, 32, [255, 255, 255, 255]);
    strokeRectOutline(lineart, 6, 6, 29, 20, [0, 0, 0, 255]);
    for (let y = 6; y < 26; y += 1) setPixel(lineart, 20, y, [0, 0, 0, 255]);

    const result = colorizeLineartFromReferencePoints(
      lineart,
      reference,
      [
        { refX: 10, refY: 14, targetX: 12, targetY: 14 },
        { refX: 28, refY: 14, targetX: 28, targetY: 14 },
      ],
      { enableCelShading: false },
    );

    expect(result.leakAudit.passed).toBe(true);
    expect(result.leakAudit.mutatedLineartPixels).toBe(0);
    expect(result.leakAudit.crossBoundaryLeakPixels).toBe(0);
    expect(getPixel(result.colorizedImage, 19, 14)).toEqual([245, 198, 74, 255]);
    expect(getPixel(result.colorizedImage, 20, 14)).toEqual([0, 0, 0, 255]);
    expect(getPixel(result.colorizedImage, 21, 14)).toEqual([118, 76, 196, 255]);

    const leftId = result.regionGraph.regionLabels[14 * 40 + 12];
    const rightId = result.regionGraph.regionLabels[14 * 40 + 28];
    expect(leftId).not.toBe(rightId);
    expect(result.regionGraph.regions[leftId].neighborRegionIds).toContain(rightId);
  });

  it("22. 1px 대각선 계단형 선화 코너에서도 4-연결 분할로 대각선 누수 0픽셀을 보장한다", () => {
    const lineart = createRgbaBuffer(24, 24, [255, 255, 255, 255]);
    for (let i = 4; i <= 19; i += 1) {
      setPixel(lineart, i, 4, [0, 0, 0, 255]);
      setPixel(lineart, i, 19, [0, 0, 0, 255]);
      setPixel(lineart, 4, i, [0, 0, 0, 255]);
      setPixel(lineart, 19, i, [0, 0, 0, 255]);
      setPixel(lineart, i, i, [0, 0, 0, 255]);
      if (i < 19) setPixel(lineart, i, i + 1, [0, 0, 0, 255]);
    }
    const graph = segmentClosedLineartRegions(lineart);
    const upperRightId = graph.regionLabels[7 * 24 + 15];
    const lowerLeftId = graph.regionLabels[15 * 24 + 7];
    expect(upperRightId).toBeGreaterThanOrEqual(0);
    expect(lowerLeftId).toBeGreaterThanOrEqual(0);
    expect(upperRightId).not.toBe(lowerLeftId);
  });

  it("23. 레퍼런스 시트의 검은 윤곽선 위·인접 좌표를 찍어도 패치 필터로 순수 채색 색상을 추출한다", () => {
    const reference = createRgbaBuffer(32, 32, [255, 255, 255, 255]);
    fillRectRgba(reference, 6, 6, 16, 16, [88, 196, 142, 255]);
    strokeRectOutline(reference, 6, 6, 16, 16, [5, 5, 5, 255]);

    const lineart = createRgbaBuffer(32, 32, [255, 255, 255, 255]);
    strokeRectOutline(lineart, 8, 8, 14, 14, [0, 0, 0, 255]);

    const result = colorizeLineartFromReferencePoints(
      lineart,
      reference,
      [{ refX: 6, refY: 7, targetX: 14, targetY: 14 }],
      { patchRadius: 2, enableCelShading: false },
    );
    expect(result.appliedHints[0].sampledRgb).toEqual([88, 196, 142]);
    expect(getPixel(result.colorizedImage, 14, 14)).toEqual([88, 196, 142, 255]);
  });

  it("24. 사용자가 타깃 1px 선화 픽셀 위를 직접 클릭해도 가장 가까운 내부 영역으로 자동 스냅하며 선화는 훼손하지 않는다", () => {
    const reference = createRgbaBuffer(32, 32, [240, 128, 168, 255]);
    const lineart = createRgbaBuffer(32, 32, [255, 255, 255, 255]);
    strokeRectOutline(lineart, 8, 8, 16, 16, [0, 0, 0, 255]);

    const result = colorizeLineartFromReferencePoints(
      lineart,
      reference,
      [{ refX: 16, refY: 16, targetX: 8, targetY: 14 }],
      { enableCelShading: false },
    );
    expect(result.appliedHints[0].snappedOffLineart).toBe(true);
    expect(result.appliedHints[0].targetRegionId).toBeGreaterThanOrEqual(0);
    expect(result.leakAudit.mutatedLineartPixels).toBe(0);
    expect(getPixel(result.colorizedImage, 8, 14)).toEqual([0, 0, 0, 255]);
  });

  it("25. 2개 포인트 힌트로 평행이동 정렬을 학습한 뒤, 힌트가 없는 3번째 닫힌 영역도 레퍼런스 대응 색상으로 자동 채색한다", () => {
    const width = 64;
    const height = 40;
    const reference = createRgbaBuffer(width, height, [255, 255, 255, 255]);
    fillRectRgba(reference, 4, 8, 12, 20, [224, 72, 72, 255]);
    fillRectRgba(reference, 22, 8, 12, 20, [72, 188, 104, 255]);
    fillRectRgba(reference, 40, 8, 12, 20, [76, 124, 232, 255]);

    const lineart = createRgbaBuffer(width, height, [255, 255, 255, 255]);
    strokeRectOutline(lineart, 10, 8, 12, 20, [0, 0, 0, 255]);
    strokeRectOutline(lineart, 28, 8, 12, 20, [0, 0, 0, 255]);
    strokeRectOutline(lineart, 46, 8, 12, 20, [0, 0, 0, 255]);

    const result = colorizeLineartFromReferencePoints(
      lineart,
      reference,
      [
        { refX: 10, refY: 18, targetX: 16, targetY: 18 },
        { refX: 28, refY: 18, targetX: 34, targetY: 18 },
      ],
      { enableCelShading: false, propagateUnhintedRegions: true },
    );

    expect(result.leakAudit.passed).toBe(true);
    expect(getPixel(result.colorizedImage, 16, 18)).toEqual([224, 72, 72, 255]);
    expect(getPixel(result.colorizedImage, 34, 18)).toEqual([72, 188, 104, 255]);
    expect(getPixel(result.colorizedImage, 52, 18)).toEqual([76, 124, 232, 255]);
    const thirdRegionId = result.regionGraph.regionLabels[18 * width + 52];
    expect(result.assignments.find((a) => a.regionId === thirdRegionId)?.source).toBe("reference-correspondence");
  });

  it("26. 셀 명암 모드(enableCelShading)는 광원 반대편에만 1단 그림자를 생성하며 선화 경계 침범 0%를 유지한다", () => {
    const reference = createRgbaBuffer(40, 40, [240, 180, 140, 255]);
    const lineart = createRgbaBuffer(40, 40, [255, 255, 255, 255]);
    strokeRectOutline(lineart, 8, 8, 24, 24, [0, 0, 0, 255]);

    const result = colorizeLineartFromReferencePoints(
      lineart,
      reference,
      [{ refX: 20, refY: 20, targetX: 20, targetY: 20 }],
      { enableCelShading: true, celShadowStrength: 0.22, lightDirection: { x: -1, y: -1 } },
    );

    expect(result.leakAudit.passed).toBe(true);
    expect(result.leakAudit.mutatedLineartPixels).toBe(0);
    const litPixel = getPixel(result.colorizedImage, 11, 11);
    const shadowPixel = getPixel(result.colorizedImage, 29, 29);
    expect(litPixel).toEqual([240, 180, 140, 255]);
    expect(shadowPixel[0]).toBeLessThan(litPixel[0]);
    expect(shadowPixel[1]).toBeLessThan(litPixel[1]);
    expect(shadowPixel[2]).toBeLessThan(litPixel[2]);
  });

  it("27. 단일 닫힌 영역 내 2개의 포인트 힌트가 주어지면 가중 역거리 그라데이션을 선화 내부에만 국한해 채색한다", () => {
    const reference = createRgbaBuffer(40, 24, [255, 255, 255, 255]);
    fillRectRgba(reference, 2, 2, 14, 18, [250, 80, 80, 255]);
    fillRectRgba(reference, 24, 2, 14, 18, [80, 80, 250, 255]);

    const lineart = createRgbaBuffer(40, 24, [255, 255, 255, 255]);
    strokeRectOutline(lineart, 4, 4, 32, 16, [0, 0, 0, 255]);

    const result = colorizeLineartFromReferencePoints(
      lineart,
      reference,
      [
        { refX: 8, refY: 10, targetX: 8, targetY: 12, weight: 1.0 },
        { refX: 30, refY: 10, targetX: 32, targetY: 12, weight: 1.0 },
      ],
      { enableCelShading: false },
    );

    expect(getPixel(result.colorizedImage, 8, 12)[0]).toBeGreaterThan(220);
    expect(getPixel(result.colorizedImage, 32, 12)[2]).toBeGreaterThan(220);
    const mid = getPixel(result.colorizedImage, 20, 12);
    expect(Math.abs(mid[0] - mid[2])).toBeLessThan(15);
    expect(result.leakAudit.mutatedLineartPixels).toBe(0);
    expect(getPixel(result.colorizedImage, 1, 1)).toEqual([255, 255, 255, 255]);
  });

  it("28. 투명 배경 위 잉크 선화(alpha=0 여백)에서도 동일하게 결정론적 채색 및 무침범 감사를 통과한다", () => {
    const reference = createRgbaBuffer(32, 32, [132, 210, 96, 255]);
    const alphaLineart = createRgbaBuffer(32, 32, [0, 0, 0, 0]);
    strokeRectOutline(alphaLineart, 6, 6, 20, 20, [15, 15, 15, 255]);

    const runA = colorizeLineartFromReferencePoints(
      alphaLineart,
      reference,
      [{ refX: 16, refY: 16, targetX: 16, targetY: 16 }],
      { enableCelShading: false },
    );
    const runB = colorizeLineartFromReferencePoints(
      alphaLineart,
      reference,
      [{ refX: 16, refY: 16, targetX: 16, targetY: 16 }],
      { enableCelShading: false },
    );

    expect(runA.leakAudit.passed).toBe(true);
    expect(getPixel(runA.colorizedImage, 16, 16)).toEqual([132, 210, 96, 255]);
    expect(getPixel(runA.colorizedImage, 6, 6)).toEqual([15, 15, 15, 255]);
    expect(Array.from(runA.colorizedImage.data)).toEqual(Array.from(runB.colorizedImage.data));
  });
});
