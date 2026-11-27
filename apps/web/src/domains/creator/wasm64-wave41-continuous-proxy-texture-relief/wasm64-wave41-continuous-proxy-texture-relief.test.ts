import { describe, expect, it } from "vitest";

import {
  allocateVirtualAtlasSlots, blendSimplexVariancePreserving, computeContinuousZoomOctaveSchedule,
  computeMicroReliefNormalAndCavityField, computeTileCrossDissolveWeights, computeWangTileCornerHash,
  evaluateAperiodicProxySample, evaluateMicroReliefProxyShader, extractProceduralMipProxyDescriptor,
  formatVirtualTileId, generateInstantProceduralMipProxy, MAX_CONTINUOUS_PROXY_ZOOM,
  measureSpatialLagAutocorrelation, MICRO_RELIEF_UNIFORM_BYTE_LENGTH, MIN_CONTINUOUS_PROXY_ZOOM,
  packMicroReliefUniformBuffer, planVirtualMipmapStreamFrame, PROXY_SURFACE_PRESETS,
  REDUCED_MOTION_DISSOLVE_DURATION_MS, resolveSimplexTriangleLattice, sanitizeStudioMaterialParams,
  STUDIO_MICRO_RELIEF_PRESETS, synthesizeAperiodicProxyTexturePatch, unpackMicroReliefUniformBuffer,
  type ProxySurfacePresetId,
} from "./index";

describe("wasm64-wave41-continuous-proxy-texture-relief", () => {
  it("1. 비주기 확률 격자 합성이 주기적 타일링의 정수 주기 자기상관 반복선을 대폭 제거한다", () => {
    const baseTilePx = 24;
    const periodicLagPx = baseTilePx * 2;
    const baseReq = { presetId: "stone-granite" as const, width: 144, height: 144, zoom: 1, baseTilePx, seed: 4101 };
    const periodicPatch = synthesizeAperiodicProxyTexturePatch({ ...baseReq, tilingMode: "periodic-grid" });
    const aperiodicPatch = synthesizeAperiodicProxyTexturePatch({ ...baseReq, tilingMode: "aperiodic-stochastic" });

    const periodicCorr = measureSpatialLagAutocorrelation(periodicPatch.albedoLuma, 144, 144, periodicLagPx);
    const aperiodicCorr = measureSpatialLagAutocorrelation(aperiodicPatch.albedoLuma, 144, 144, periodicLagPx);
    expect(periodicCorr.horizontalAutocorrelation).toBeGreaterThan(0.98);
    expect(periodicCorr.verticalAutocorrelation).toBeGreaterThan(0.98);
    expect(aperiodicCorr.peakPeriodicCorrelation).toBeLessThan(0.22);
  });

  it("2. 4종 웹툰 프록시 질감 프리셋이 모두 유한 범위·한글 라벨·결정론적 재현성을 보장한다", () => {
    const presetIds: readonly ProxySurfacePresetId[] = ["stone-granite", "hanji-fiber", "watercolor-coldpress", "screentone-rosette"];
    for (const presetId of presetIds) {
      const first = synthesizeAperiodicProxyTexturePatch({ presetId, width: 32, height: 32, zoom: 1.25, seed: 77 });
      const second = synthesizeAperiodicProxyTexturePatch({ presetId, width: 32, height: 32, zoom: 1.25, seed: 77 });
      const diffSeed = synthesizeAperiodicProxyTexturePatch({ presetId, width: 32, height: 32, zoom: 1.25, seed: 999 });

      expect(first.labelKo).toBe(PROXY_SURFACE_PRESETS[presetId].labelKo);
      expect(first.stdDev).toBeGreaterThan(0.015);
      expect(first.albedoLuma).toEqual(second.albedoLuma);
      expect(first.albedoLuma).not.toEqual(diffSeed.albedoLuma);
      for (let i = 0; i < first.albedoLuma.length; i += 1) {
        expect(first.albedoLuma[i]).toBeGreaterThanOrEqual(0);
        expect(first.albedoLuma[i]).toBeLessThanOrEqual(1);
        expect(first.heightField[i]).toBeGreaterThanOrEqual(0);
        expect(first.heightField[i]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("3. 정삼각형 심플렉스 격자의 무게중심 합이 1.0이고 삼각형 공유 간선에서 연속성을 유지한다", () => {
    for (let k = -40; k <= 40; k += 1) {
      const [v0, v1, v2] = resolveSimplexTriangleLattice(k * 0.371 - 2.1, k * 0.293 + 1.4, 2026).vertices;
      expect(v0.weight).toBeGreaterThanOrEqual(0);
      expect(v1.weight).toBeGreaterThanOrEqual(0);
      expect(v2.weight).toBeGreaterThanOrEqual(0);
      expect(v0.weight + v1.weight + v2.weight).toBeCloseTo(1, 6);
    }

    const diagV = Math.sqrt(3) * 0.25;
    const leftSide = evaluateAperiodicProxySample(0.75 - 1e-5, diagV, 1.0, "stone-granite");
    const rightSide = evaluateAperiodicProxySample(0.75 + 1e-5, diagV, 1.0, "stone-granite");
    expect(Math.abs(leftSide.albedoLuma - rightSide.albedoLuma)).toBeLessThan(1e-3);

    const cellLeft = evaluateAperiodicProxySample(1 - 1e-5, 0, 1.0, "hanji-fiber");
    const cellRight = evaluateAperiodicProxySample(1 + 1e-5, 0, 1.0, "hanji-fiber");
    expect(Math.abs(cellLeft.albedoLuma - cellRight.albedoLuma)).toBeLessThan(1e-3);
  });

  it("4. Wang 타일 코너 해시가 정점 좌표만으로 결정되며 격자 전반에 비반복 엔트로피를 형성한다", () => {
    const codes = new Set<number>();
    const hashes = new Set<number>();
    for (let vy = -8; vy < 8; vy += 1) {
      for (let vx = -8; vx < 8; vx += 1) {
        const a = computeWangTileCornerHash(vx, vy, 5150);
        expect(a).toEqual(computeWangTileCornerHash(vx, vy, 5150));
        expect(a.cornerCode).toBeGreaterThanOrEqual(0);
        expect(a.cornerCode).toBeLessThanOrEqual(255);
        codes.add(a.cornerCode);
        hashes.add(a.hash32);
      }
    }
    expect(codes.size).toBeGreaterThan(80);
    expect(hashes.size).toBe(256);
  });

  it("5. 히스토그램 분산 보존 보간이 삼각형 중심부(w=1/3)의 대비 워시아웃 손실을 복원한다", () => {
    let linearSqSum = 0;
    let vpSqSum = 0;
    const n = 600;
    for (let i = 0; i < n; i += 1) {
      const s0 = Math.sin(i * 1.73 + 0.2) * Math.SQRT2;
      const s1 = Math.sin(i * 2.91 + 1.1) * Math.SQRT2;
      const s2 = Math.sin(i * 4.37 + 2.4) * Math.SQRT2;
      const lin = (s0 + s1 + s2) / 3;
      const vp = blendSimplexVariancePreserving(s0, s1, s2, 1 / 3, 1 / 3, 1 / 3, 0);
      linearSqSum += lin * lin;
      vpSqSum += vp * vp;
    }
    expect(linearSqSum / n).toBeCloseTo(1 / 3, 1);
    expect(vpSqSum / n).toBeCloseTo(1.0, 1);

    const linearPatch = synthesizeAperiodicProxyTexturePatch({
      presetId: "watercolor-coldpress",
      width: 64,
      height: 64,
      zoom: 1,
      blendMode: "linear",
    });
    const vpPatch = synthesizeAperiodicProxyTexturePatch({
      presetId: "watercolor-coldpress",
      width: 64,
      height: 64,
      zoom: 1,
      blendMode: "variance-preserving",
    });
    expect(vpPatch.stdDev).toBeGreaterThan(linearPatch.stdDev * 1.18);
  });

  it("6. 12.5%~800% 연속 로그 줌 전 구간에서 옥타브 정규화 에너지 합이 1.0으로 보존된다", () => {
    expect(MIN_CONTINUOUS_PROXY_ZOOM).toBe(0.125);
    expect(MAX_CONTINUOUS_PROXY_ZOOM).toBe(8.0);
    for (let step = 0; step <= 60; step += 1) {
      const zoom = 2 ** (-3 + (step / 60) * 6);
      const schedule = computeContinuousZoomOctaveSchedule(zoom, 1.15);
      expect(schedule.clampedZoom).toBeCloseTo(zoom, 6);
      expect(schedule.totalNormalizedEnergy).toBeCloseTo(1.0, 5);
      expect(schedule.bands.length).toBeGreaterThanOrEqual(3);
      expect(schedule.bands.length).toBeLessThanOrEqual(4);
    }
    expect(computeContinuousZoomOctaveSchedule(0.01).clampedZoom).toBe(0.125);
    expect(computeContinuousZoomOctaveSchedule(99).clampedZoom).toBe(8.0);
  });

  it("7. 연속 줌 스윕 시 정수 2의 거듭제곱 경계(0.25x, 0.5x, 1x, 2x, 4x)에서 불연속 점프가 0건이다", () => {
    const coords: readonly (readonly [number, number])[] = [[0.37, 0.61], [2.14, -1.28], [-3.45, 4.02]];
    let discontinuousJumpCount = 0;
    for (const [u, v] of coords) {
      let prev = evaluateAperiodicProxySample(u, v, 0.125, "stone-granite").albedoLuma;
      for (let s = 1; s <= 240; s += 1) {
        const curr = evaluateAperiodicProxySample(u, v, 2 ** (-3 + (s / 240) * 6), "stone-granite").albedoLuma;
        if (Math.abs(curr - prev) > 0.02) discontinuousJumpCount += 1;
        prev = curr;
      }
    }
    expect(discontinuousJumpCount).toBe(0);
  });

  it("8. 12.5% 축소 시 나이퀴스트 초과 고주파를 감쇠하고 800% 확대 시 화면 공간 입자 밀도를 일정하게 유지한다", () => {
    const zoomedOut = computeContinuousZoomOctaveSchedule(0.125, 1.0);
    const neutral = computeContinuousZoomOctaveSchedule(1.0, 1.0);
    const zoomedIn = computeContinuousZoomOctaveSchedule(8.0, 1.0);
    const meanWorld = (s: typeof neutral) => s.bands.reduce((acc, b) => acc + b.worldFrequency * b.normalizedEnergyWeight ** 2, 0);
    const meanScreen = (s: typeof neutral) => s.bands.reduce((acc, b) => acc + b.screenFrequency * b.normalizedEnergyWeight ** 2, 0);

    expect(meanWorld(zoomedOut)).toBeLessThan(meanWorld(neutral) * 0.2);
    expect(meanWorld(zoomedIn)).toBeGreaterThan(meanWorld(neutral) * 5);
    expect(meanScreen(zoomedOut)).toBeCloseTo(meanScreen(neutral), 4);
    expect(meanScreen(zoomedIn)).toBeCloseTo(meanScreen(neutral), 4);
  });

  it("9. 스튜디오 물리 재질 규율에 따라 유전체는 Metallic 0.0, 금속은 1.0으로 이진 고정된다", () => {
    expect(sanitizeStudioMaterialParams(STUDIO_MICRO_RELIEF_PRESETS["wood-satin-varnish"]).metallic).toBe(0);
    expect(sanitizeStudioMaterialParams(STUDIO_MICRO_RELIEF_PRESETS["cloth-matte-weave"]).metallic).toBe(0);
    expect(sanitizeStudioMaterialParams(STUDIO_MICRO_RELIEF_PRESETS["paper-hanji"]).metallic).toBe(0);
    expect(sanitizeStudioMaterialParams(STUDIO_MICRO_RELIEF_PRESETS["skin-warm-subsurface"]).metallic).toBe(0);
    expect(sanitizeStudioMaterialParams(STUDIO_MICRO_RELIEF_PRESETS["metal-brushed-brass"]).metallic).toBe(1);
    expect(sanitizeStudioMaterialParams(STUDIO_MICRO_RELIEF_PRESETS["metal-forged-steel"]).metallic).toBe(1);

    const snappedDielectric = sanitizeStudioMaterialParams({
      baseLinearColor: { r: 0.4, g: 0.3, b: 0.2 },
      metallic: 0.35,
      roughness: 0.5,
    });
    expect(snappedDielectric.metallic).toBe(0);
    expect(snappedDielectric.metallicBinarySnapped).toBe(true);

    const snappedConductor = sanitizeStudioMaterialParams({
      baseLinearColor: { r: 0.8, g: 0.7, b: 0.3 },
      metallic: 0.72,
      roughness: 0.25,
      sheenWeight: 0.9,
      subsurfaceWeight: 0.6,
    });
    expect(snappedConductor.metallic).toBe(1);
    expect(snappedConductor.metallicBinarySnapped).toBe(true);
    expect(snappedConductor.sheenWeight).toBe(0);
    expect(snappedConductor.subsurfaceWeight).toBe(0);
  });

  it("10. 마이크로 요철 Scharr 및 Sobel 법선 벡터가 전 픽셀 단위 정규화(||n||=1, nz>0)와 경사 부호를 만족한다", () => {
    const w = 16;
    const h = 16;
    const flatField = computeMicroReliefNormalAndCavityField(new Float32Array(w * h).fill(0.5), w, h);
    for (let i = 0; i < w * h; i += 1) {
      expect(flatField.normalsXyz[i * 3]).toBeCloseTo(0, 6);
      expect(flatField.normalsXyz[i * 3 + 1]).toBeCloseTo(0, 6);
      expect(flatField.normalsXyz[i * 3 + 2]).toBeCloseTo(1, 6);
      expect(flatField.cavityAo[i]).toBeCloseTo(1, 6);
    }

    const ramp = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) ramp[y * w + x] = x / (w - 1);
    }
    const rampScharr = computeMicroReliefNormalAndCavityField(ramp, w, h, { gradientKernel: "scharr" });
    const rampSobel = computeMicroReliefNormalAndCavityField(ramp, w, h, { gradientKernel: "sobel" });
    const centerIdx = 8 * w + 8;
    expect(rampScharr.normalsXyz[centerIdx * 3]).toBeLessThan(-0.15);
    expect(rampScharr.normalsXyz[centerIdx * 3 + 1]).toBeCloseTo(0, 5);
    expect(rampSobel.normalsXyz[centerIdx * 3]).toBeLessThan(-0.15);

    const roughPatch = synthesizeAperiodicProxyTexturePatch({ presetId: "stone-granite", width: 24, height: 24, zoom: 1 });
    const roughRelief = computeMicroReliefNormalAndCavityField(roughPatch.heightField, 24, 24);
    for (let i = 0; i < 24 * 24; i += 1) {
      const nx = roughRelief.normalsXyz[i * 3];
      const ny = roughRelief.normalsXyz[i * 3 + 1];
      const nz = roughRelief.normalsXyz[i * 3 + 2];
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
      expect(nz).toBeGreaterThan(0);
    }
  });

  it("11. 수평선 공동 차폐(Horizon Cavity AO)가 평탄 능선보다 오목한 미세 홈에서 차폐도를 강하게 적용한다", () => {
    const grooveHeight = new Float32Array(81).fill(0.85);
    grooveHeight[4 * 9 + 4] = 0.1;
    const field = computeMicroReliefNormalAndCavityField(grooveHeight, 9, 9, {
      reliefStrength: 1.8,
      cavityStrength: 0.9,
      horizonRadiusPx: 3,
    });
    expect(field.cavityAo[0]).toBeCloseTo(1.0, 4);
    expect(field.cavityAo[40]).toBeLessThan(0.45);
  });

  it("12. 사틴 바니시 원목의 Coat 로브가 유전체 규율(Metallic 0)을 지키며 선명한 코팅 정반사를 더한다", () => {
    const patch = synthesizeAperiodicProxyTexturePatch({ presetId: "hanji-fiber", width: 16, height: 16, zoom: 1 });
    const light = { lightDirection: { x: 0.15, y: -0.15, z: 0.98 }, keyLightIntensity: 1.6 };
    const uncoated = evaluateMicroReliefProxyShader(
      patch.heightField,
      16,
      16,
      { ...STUDIO_MICRO_RELIEF_PRESETS["wood-satin-varnish"], coatWeight: 0 },
      light,
    );
    const coated = evaluateMicroReliefProxyShader(patch.heightField, 16, 16, STUDIO_MICRO_RELIEF_PRESETS["wood-satin-varnish"], light);
    expect(coated.material.metallic).toBe(0);
    expect(coated.maxSpecularLuma).toBeGreaterThan(uncoated.maxSpecularLuma * 2.2);
  });

  it("13. 무광 직물의 Sheen 로브가 비스듬한 스침각 시선에서 가장자리 섬유 산란 광택을 높인다", () => {
    const flatHeight = new Float32Array(16).fill(0.5);
    const grazingEnv = { lightDirection: { x: 0.2, y: 0, z: 0.98 }, viewDirection: { x: 0.94, y: 0, z: 0.34 }, keyLightIntensity: 1.5 };
    const withoutSheen = evaluateMicroReliefProxyShader(
      flatHeight,
      4,
      4,
      { ...STUDIO_MICRO_RELIEF_PRESETS["cloth-matte-weave"], sheenWeight: 0 },
      grazingEnv,
    );
    const withSheen = evaluateMicroReliefProxyShader(flatHeight, 4, 4, STUDIO_MICRO_RELIEF_PRESETS["cloth-matte-weave"], grazingEnv);
    expect(withSheen.material.metallic).toBe(0);
    expect(withSheen.meanLuminance).toBeGreaterThan(withoutSheen.meanLuminance * 1.25);
  });

  it("14. 브러시드 황동의 이방성(Anisotropy) 결 각도 회전에 따라 정반사 하이라이트 강도가 달라진다", () => {
    const flatHeight = new Float32Array(9).fill(0.5);
    const offAxisEnv = { lightDirection: { x: 0.48, y: 0, z: 0.877 }, viewDirection: { x: 0.12, y: 0, z: 0.992 }, keyLightIntensity: 1.8 };
    const alignedX = evaluateMicroReliefProxyShader(
      flatHeight,
      3,
      3,
      { ...STUDIO_MICRO_RELIEF_PRESETS["metal-brushed-brass"], anisotropyStrength: 0.85, anisotropyAngleRad: 0 },
      offAxisEnv,
    );
    const alignedY = evaluateMicroReliefProxyShader(
      flatHeight,
      3,
      3,
      { ...STUDIO_MICRO_RELIEF_PRESETS["metal-brushed-brass"], anisotropyStrength: 0.85, anisotropyAngleRad: Math.PI / 2 },
      offAxisEnv,
    );
    expect(alignedX.material.metallic).toBe(1);
    expect(Math.abs(alignedX.maxSpecularLuma - alignedY.maxSpecularLuma)).toBeGreaterThan(0.05);
  });

  it("15. 따뜻한 피부 재질의 Subsurface 랩 디퓨즈가 역광 경계면 음영을 부드럽고 따뜻하게 완화한다", () => {
    const slope = new Float32Array([0, 0.25, 0.5, 0, 0.25, 0.5, 0, 0.25, 0.5]);
    const terminatorLight = { lightDirection: { x: 0.35, y: 0, z: 0.12 }, ambientIntensity: 0.05, keyLightIntensity: 1.4 };
    const hardSkin = evaluateMicroReliefProxyShader(
      slope,
      3,
      3,
      { ...STUDIO_MICRO_RELIEF_PRESETS["skin-warm-subsurface"], subsurfaceWeight: 0 },
      terminatorLight,
    );
    const softSkin = evaluateMicroReliefProxyShader(
      slope,
      3,
      3,
      { ...STUDIO_MICRO_RELIEF_PRESETS["skin-warm-subsurface"], subsurfaceWeight: 0.55 },
      terminatorLight,
    );
    expect(softSkin.shadedLinearRgb[4 * 3]).toBeGreaterThan(hardSkin.shadedLinearRgb[4 * 3]);
    expect(softSkin.meanLuminance).toBeGreaterThan(hardSkin.meanLuminance);
  });

  it("16. WebGPU 유니폼 버퍼가 16바이트 정렬(80B) 규격을 준수하고 직렬화·역직렬화 왕복 일치한다", () => {
    const preset = STUDIO_MICRO_RELIEF_PRESETS["metal-forged-steel"];
    const env = { lightDirection: { x: -0.3, y: 0.4, z: 0.866 }, viewDirection: { x: 0, y: 0, z: 1 }, keyLightIntensity: 1.55, ambientIntensity: 0.22 };
    const packed = packMicroReliefUniformBuffer(preset, env);
    expect(packed.byteLength).toBe(MICRO_RELIEF_UNIFORM_BYTE_LENGTH);
    expect(packed.byteLength % 16).toBe(0);

    const unpacked = unpackMicroReliefUniformBuffer(packed);
    expect(unpacked.material.metallic).toBe(1);
    expect(unpacked.material.roughness).toBeCloseTo(preset.roughness, 5);
    expect(unpacked.material.anisotropyStrength).toBeCloseTo(preset.anisotropyStrength ?? 0, 5);
    expect(unpacked.lightEnvironment.keyLightIntensity).toBeCloseTo(1.55, 5);
    expect(() => unpackMicroReliefUniformBuffer(new Float32Array(7))).toThrow(RangeError);
  });

  it("17. 비주기 프록시 합성 패치와 마이크로 요철 셰이더 파이프라인이 종단간 유효한 sRGB RGBA8 출력을 만든다", () => {
    const proxy = synthesizeAperiodicProxyTexturePatch({ presetId: "stone-granite", width: 20, height: 20, zoom: 2.0 });
    const shaded = evaluateMicroReliefProxyShader(
      proxy.heightField,
      20,
      20,
      STUDIO_MICRO_RELIEF_PRESETS["metal-forged-steel"],
      { lightDirection: { x: 0.35, y: -0.25, z: 0.9 } },
    );
    expect(shaded.shadedSrgbRgba8.length).toBe(1600);
    let minR = 255;
    let maxR = 0;
    for (let i = 0; i < 400; i += 1) {
      minR = Math.min(minR, shaded.shadedSrgbRgba8[i * 4]);
      maxR = Math.max(maxR, shaded.shadedSrgbRgba8[i * 4]);
      expect(shaded.shadedSrgbRgba8[i * 4 + 3]).toBe(255);
    }
    expect(maxR - minR).toBeGreaterThan(25);
  });

  it("18. 0ms 절차적 프록시 기술자 추출·합성이 평균 휘도와 공간 기울기를 복원하고 저해상도 밉 입자를 감쇠한다", () => {
    const src = new Float32Array(32 * 32);
    let srcSum = 0;
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const val = 0.25 + 0.5 * (x / 31) + Math.sin(x * 1.9) * Math.cos(y * 1.7) * 0.08;
        src[y * 32 + x] = val;
        srcSum += val;
      }
    }
    const desc = extractProceduralMipProxyDescriptor("bg-castle-wall", src, 32, 32, 0.2);
    expect(desc.dcLuma).toBeCloseTo(srcSum / 1024, 2);
    expect(desc.gradU).toBeGreaterThan(0.15);

    const mip0 = generateInstantProceduralMipProxy(desc, 0, 64);
    const mip3 = generateInstantProceduralMipProxy(desc, 3, 64);
    expect(mip0.width).toBe(64);
    expect(mip3.width).toBe(8);
    expect(mip3.lumaField[4 * 8 + 7]).toBeGreaterThan(mip3.lumaField[4 * 8]);
  });

  it("19. 가상 밉맵 스트리머가 시선 중심(Foveation) 타일을 최우선 배정하고 이미 상주 중인 타일은 건너뛴다", () => {
    const centerId = formatVirtualTileId(0, 1, 1);
    const baseInput = {
      virtualWidthPx: 1024,
      virtualHeightPx: 1024,
      tileSizePx: 256,
      viewportMinU: 0.1,
      viewportMinV: 0.1,
      viewportMaxU: 0.9,
      viewportMaxV: 0.9,
      gazeFocusU: 0.37,
      gazeFocusV: 0.37,
      zoom: 1.0,
      maxTilesPerFrame: 6,
    };
    const planFresh = planVirtualMipmapStreamFrame(baseInput);
    expect(planFresh.scheduledUploads[0]?.tileId).toBe(centerId);
    for (let i = 1; i < planFresh.scheduledUploads.length; i += 1) {
      expect(planFresh.scheduledUploads[i - 1].priorityScore).toBeGreaterThanOrEqual(planFresh.scheduledUploads[i].priorityScore);
    }

    const planWithResident = planVirtualMipmapStreamFrame({ ...baseInput, residentTileIds: new Set([centerId]) });
    expect(planWithResident.scheduledUploads.some((t) => t.tileId === centerId)).toBe(false);
  });

  it("20. 가상 밉맵 스트리머가 축소 줌에서 상위 밉 레벨을 선택하고 프레임당 바이트·타일 상한을 엄수한다", () => {
    const plan = planVirtualMipmapStreamFrame({
      virtualWidthPx: 4096,
      virtualHeightPx: 4096,
      tileSizePx: 256,
      viewportMinU: 0,
      viewportMinV: 0,
      viewportMaxU: 1,
      viewportMaxV: 1,
      gazeFocusU: 0.5,
      gazeFocusV: 0.5,
      zoom: 0.25,
      maxTilesPerFrame: 2,
      uploadByteBudgetPerFrame: 256 * 256 * 4 * 2,
    });
    expect(plan.targetFovealMipLevel).toBe(2);
    expect(plan.scheduledUploads.length).toBeLessThanOrEqual(2);
    expect(plan.scheduledBytes).toBeLessThanOrEqual(256 * 256 * 4 * 2);
    expect(plan.deferredCount).toBeGreaterThan(0);
  });

  it("21. 적응형 가상 아틀라스 패커가 거터 여백을 포함해 슬롯 사각형을 단 한 건의 겹침도 없이 배치한다", () => {
    const packed = allocateVirtualAtlasSlots({
      atlasWidthPx: 204,
      atlasHeightPx: 204,
      slotSizePx: 64,
      gutterPx: 2,
      incomingTiles: Array.from({ length: 9 }, (_, i) => ({ tileId: `m0:${i % 3}:${Math.floor(i / 3)}`, mipLevel: 0 })),
      currentTick: 1,
    });
    expect(packed.capacitySlots).toBe(9);
    expect(packed.slots).toHaveLength(9);
    for (let i = 0; i < packed.slots.length; i += 1) {
      const a = packed.slots[i];
      expect(a.xPx).toBeGreaterThanOrEqual(2);
      expect(a.yPx).toBeGreaterThanOrEqual(2);
      expect(a.xPx + a.widthPx).toBeLessThanOrEqual(202);
      expect(a.yPx + a.heightPx).toBeLessThanOrEqual(202);
      for (let j = i + 1; j < packed.slots.length; j += 1) {
        const b = packed.slots[j];
        const separated =
          a.xPx + a.widthPx + 2 <= b.xPx ||
          b.xPx + b.widthPx + 2 <= a.xPx ||
          a.yPx + a.heightPx + 2 <= b.yPx ||
          b.yPx + b.heightPx + 2 <= a.yPx;
        expect(separated).toBe(true);
      }
    }
  });

  it("22. 가상 아틀라스 용량 초과 시 고정 폴백 프록시(pinnedFallback)를 보존하고 최장 미사용(LRU) 타일만 교체한다", () => {
    const step1 = allocateVirtualAtlasSlots({
      atlasWidthPx: 136,
      atlasHeightPx: 136,
      slotSizePx: 64,
      gutterPx: 2,
      incomingTiles: [
        { tileId: "m4:0:0", mipLevel: 4, pinnedFallback: true },
        { tileId: "m3:0:0", mipLevel: 3, pinnedFallback: true },
        { tileId: "m0:1:1", mipLevel: 0 },
      ],
      currentTick: 10,
    });
    const step2 = allocateVirtualAtlasSlots({
      atlasWidthPx: 136,
      atlasHeightPx: 136,
      slotSizePx: 64,
      gutterPx: 2,
      existingSlots: step1.slots,
      incomingTiles: [{ tileId: "m0:2:2", mipLevel: 0 }],
      currentTick: 20,
    });
    const step3 = allocateVirtualAtlasSlots({
      atlasWidthPx: 136,
      atlasHeightPx: 136,
      slotSizePx: 64,
      gutterPx: 2,
      existingSlots: step2.slots,
      incomingTiles: [{ tileId: "m0:3:3", mipLevel: 0 }],
      currentTick: 30,
    });

    expect(step2.evictedTileIds).toEqual([]);
    expect(step3.evictedTileIds).toEqual(["m0:1:1"]);
    expect(step3.slots.some((s) => s.tileId === "m4:0:0" && s.pinnedFallback)).toBe(true);
    expect(step3.slots.some((s) => s.tileId === "m3:0:0" && s.pinnedFallback)).toBe(true);
    expect(step3.fallbackCoverageRatio).toBe(1);
  });

  it("23. 시간축 크로스디졸브가 0->1로 매끄럽게 단조 수렴하고 동작 줄이기 모드에서는 40ms 내 즉시 완료된다", () => {
    let prevWeight = 0;
    for (let dt = 0; dt <= 200; dt += 20) {
      const w = computeTileCrossDissolveWeights({ loadedAtFrameMs: 1_000, currentFrameMs: 1_000 + dt, localTileU: 0.5, localTileV: 0.5 });
      expect(w.temporalWeight).toBeGreaterThanOrEqual(prevWeight);
      expect(w.detailWeight + w.proxyFallbackWeight).toBeCloseTo(1, 6);
      prevWeight = w.temporalWeight;
    }
    expect(prevWeight).toBe(1);

    const reducedDone = computeTileCrossDissolveWeights({
      loadedAtFrameMs: 2_000,
      currentFrameMs: 2_000 + REDUCED_MOTION_DISSOLVE_DURATION_MS,
      prefersReducedMotion: true,
      localTileU: 0.5,
      localTileV: 0.5,
    });
    expect(reducedDone.temporalWeight).toBe(1);
  });

  it("24. 인접 타일이 저해상도 폴백 상태일 때 해당 경계만 공간 페더링해 T-접합 절단선을 없앤다", () => {
    const common = { loadedAtFrameMs: 0, currentFrameMs: 500, localTileV: 0.5, seamFeatherWidthUv: 0.1, coarseNeighbors: { left: true, right: false } };
    const leftEdge = computeTileCrossDissolveWeights({ ...common, localTileU: 0 });
    const center = computeTileCrossDissolveWeights({ ...common, localTileU: 0.5 });
    const rightEdge = computeTileCrossDissolveWeights({ ...common, localTileU: 1.0 });

    expect(leftEdge.detailWeight).toBe(0);
    expect(leftEdge.proxyFallbackWeight).toBe(1);
    expect(center.detailWeight).toBe(1);
    expect(rightEdge.detailWeight).toBe(1);
  });
});
