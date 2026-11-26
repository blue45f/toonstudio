import { describe, expect, it } from "vitest";

import {
  analyzeActionAxisContinuity,
  compressTileRgbaLossless,
  computeFnv1a32,
  decompressTileRgbaLossless,
  detectLayerCollisionsSweepAndPrune,
  extractDirtyConnectedComponents,
  fitSpeechBalloonForLocaleExpansion,
  generateBetaFlashFrame,
  generateNormalGuidedCrossHatching,
  generateRadialSpeedlines,
  inspectThreeWayManuscriptDiff,
  linearDisplayP3ToXyzD65,
  LOCALE_SCRIPT_EXPANSION_FROM_KO,
  LosslessOctreeTileHibernator,
  mapDisplayP3BufferGamut,
  mapDisplayP3ColorGamut,
  type CollidableStudioLayer,
  type ManuscriptLayerSnapshot,
  type ManuscriptRevisionSnapshot,
  type ShadeNormalGrid,
} from "./index";

describe("wasm64-wave12-crown: 180도 연출 축 · 절차적 벡터 효과 · 다국어 이방성 말풍선", () => {
  it("중립 컷 없이 180도 액션 축을 넘어가면 좌우 반전을 검출하고 거울 반사 교정 좌표를 제안한다", () => {
    const actorA = { x: -2, y: 1.6, z: 0 };
    const actorB = { x: 2, y: 1.6, z: 0 };

    const report = analyzeActionAxisContinuity({
      cuts: [
        {
          cutId: "cut-01",
          cutIndex: 1,
          actorA,
          actorB,
          cameraPosition: { x: -0.5, y: 1.7, z: 3.5 },
        },
        {
          cutId: "cut-02",
          cutIndex: 2,
          actorA,
          actorB,
          // 축 반대편(z < 0)으로 무단 점프 -> 좌우 시선 역전 발생
          cameraPosition: { x: 0.6, y: 1.7, z: -3.4 },
        },
      ],
    });

    expect(report.continuityPass).toBe(false);
    expect(report.violations).toHaveLength(1);
    expect(report.serverCostKrw).toBe(0);

    const violation = report.violations[0]!;
    expect(violation.fromCutId).toBe("cut-01");
    expect(violation.toCutId).toBe("cut-02");
    expect(violation.screenOrderFlipped).toBe(true);
    expect(violation.suggestion.preservesThirtyDegreeRule).toBe(true);

    // 제안된 거울 반사 카메라 위치를 적용하면 180도 축 연속성이 즉시 통과해야 한다
    const repaired = analyzeActionAxisContinuity({
      cuts: [
        {
          cutId: "cut-01",
          cutIndex: 1,
          actorA,
          actorB,
          cameraPosition: { x: -0.5, y: 1.7, z: 3.5 },
        },
        {
          cutId: "cut-02-repaired",
          cutIndex: 2,
          actorA,
          actorB,
          cameraPosition: violation.suggestion.mirroredCameraPosition,
        },
      ],
    });
    expect(repaired.continuityPass).toBe(true);
    expect(repaired.violations).toHaveLength(0);
    expect(
      repaired.evaluations[0]!.actorAAppearsLeftOfB,
    ).toBe(repaired.evaluations[1]!.actorAAppearsLeftOfB);
  });

  it("축 위 정면 중립 브리지 컷을 거치면 180도 반구 전환을 정당한 연출로 허용한다", () => {
    const actorA = { x: 0, y: 1.5, z: 0 };
    const actorB = { x: 4, y: 1.5, z: 0 };

    const bridged = analyzeActionAxisContinuity({
      cuts: [
        {
          cutId: "cut-a",
          cutIndex: 1,
          actorA,
          actorB,
          cameraPosition: { x: 2, y: 1.6, z: 3 },
        },
        {
          cutId: "cut-neutral-on-axis",
          cutIndex: 2,
          actorA,
          actorB,
          // A -> B 축 연장선 위(z = 0) 정면 배치
          cameraPosition: { x: 6.5, y: 1.6, z: 0.1 },
        },
        {
          cutId: "cut-c-crossed",
          cutIndex: 3,
          actorA,
          actorB,
          cameraPosition: { x: 2, y: 1.6, z: -3 },
        },
      ],
    });

    expect(bridged.continuityPass).toBe(true);
    expect(bridged.violations).toHaveLength(0);
    expect(bridged.bridgedCrossingCount).toBe(1);
    expect(bridged.evaluations[1]!.side).toBe("neutral-on-axis");
  });

  it("결정론적 집중선·베타플래시·RK2 법선 교차 해칭 벡터 스트로크를 블러 없이 고속 생성한다", () => {
    const frame = { x: 0, y: 0, width: 800, height: 1200 };
    // 워밍업 후 속도·결정론 측정
    generateRadialSpeedlines({
      frame,
      vanishingPoint: { x: 400, y: 520 },
      lineCount: 32,
      innerClearRadiusX: 140,
      seed: 1,
    });

    const speedA = generateRadialSpeedlines({
      frame,
      vanishingPoint: { x: 400, y: 520 },
      lineCount: 96,
      innerClearRadiusX: 160,
      innerClearRadiusY: 210,
      seed: 777,
    });
    const speedB = generateRadialSpeedlines({
      frame,
      vanishingPoint: { x: 400, y: 520 },
      lineCount: 96,
      innerClearRadiusX: 160,
      innerClearRadiusY: 210,
      seed: 777,
    });

    expect(speedA.rasterBlurPx).toBe(0);
    expect(speedA.polylines.length).toBeGreaterThan(80);
    expect(speedA.polylines).toEqual(speedB.polylines);
    expect(speedA.elapsedMs).toBeLessThan(15);
    // 모든 집중선은 외곽이 두껍고 소실점 쪽 끝점이 가늘어지는 테이퍼드 구조를 갖는다
    for (const stroke of speedA.polylines) {
      expect(stroke.points[0]!.widthPx).toBeGreaterThan(stroke.points[stroke.points.length - 1]!.widthPx);
    }

    const uniFlash = generateBetaFlashFrame({
      frame,
      spikeCount: 64,
      innerRadiusX: 180,
      innerRadiusY: 220,
      outerRadiusX: 340,
      outerRadiusY: 420,
      doubleRingUniFlash: true,
      solidOuterRim: true,
      seed: 42,
    });
    expect(uniFlash.polylines).toHaveLength(128);
    expect(uniFlash.rasterBlurPx).toBe(0);

    // 원기둥 음영 법선 격자 생성 (좌측 하이라이트 -> 우측 깊은 그림자)
    const cols = 16;
    const rows = 16;
    const luminance01 = new Float32Array(cols * rows);
    const normalX = new Float32Array(cols * rows);
    const normalY = new Float32Array(cols * rows);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const i = y * cols + x;
        luminance01[i] = 1 - x / (cols - 1);
        const angle = (x / cols) * (Math.PI * 0.5);
        normalX[i] = Math.cos(angle);
        normalY[i] = Math.sin(angle);
      }
    }
    const grid: ShadeNormalGrid = {
      originX: 100,
      originY: 100,
      cols,
      rows,
      cellSizePx: 12,
      luminance01,
      normalX,
      normalY,
    };
    const hatch = generateNormalGuidedCrossHatching({ grid, seedSpacingPx: 14 });
    expect(hatch.polylines.length).toBeGreaterThan(15);
    const layersUsed = new Set(hatch.polylines.map((p) => p.layerIndex));
    expect(layersUsed.has(0)).toBe(true);
    expect(layersUsed.has(1)).toBe(true);
    expect(layersUsed.has(2)).toBe(true);
  });

  it("한국어에서 독일어·스페인어로 대사가 팽창할 때 얼굴 보호 영역을 피하는 이방성 말풍선 크기를 푼다", () => {
    expect(LOCALE_SCRIPT_EXPANSION_FROM_KO.de).toBeGreaterThanOrEqual(1.55);
    expect(LOCALE_SCRIPT_EXPANSION_FROM_KO.en).toBeGreaterThanOrEqual(1.35);

    // 우측 바로 옆에 캐릭터 얼굴 Keep-Out 박스가 놓인 좁은 가로 환경 -> 세로 확장 + 좌측 이동 유도
    const result = fitSpeechBalloonForLocaleExpansion({
      balloon: {
        balloonId: "bal-hero-01",
        shape: "ellipse",
        centerX: 210,
        centerY: 260,
        rx: 75,
        ry: 52,
        tailTip: { x: 310, y: 310 },
      },
      sourceLocale: "ko",
      targetLocale: "de",
      sourceText: "지금 바로 출발하자!",
      translatedText: "Brechen wir jetzt sofort gemeinsam auf!",
      panelBounds: { x: 0, y: 0, width: 520, height: 680 },
      keepOutBoxes: [
        {
          id: "face-protagonist",
          label: "주인공 얼굴",
          rect: { x: 296, y: 180, width: 170, height: 210 },
          marginPx: 8,
        },
      ],
    });

    expect(result.fitsWithoutKeepOutCollision).toBe(true);
    expect(result.faceOverlapCount).toBe(0);
    expect(result.minKeepOutClearancePx).toBeGreaterThanOrEqual(0);
    expect(result.achievedAreaRatio).toBeGreaterThan(1.35);
    // 오른쪽 얼굴에 막혀 있으므로 세로 반경(ry) 확장 비율이 가로 반경(rx) 확장 비율보다 커야 한다
    expect(result.ry / 52).toBeGreaterThan(result.rx / 75);

    // 둥근사각형 말풍선도 충돌 0건으로 스페인어 번역을 수용하는지 검증
    const rectResult = fitSpeechBalloonForLocaleExpansion({
      balloon: {
        balloonId: "bal-rect-02",
        shape: "rounded-rect",
        centerX: 220,
        centerY: 260,
        rx: 80,
        ry: 48,
        cornerRadiusPx: 14,
      },
      sourceLocale: "ko",
      targetLocale: "es",
      sourceText: "절대 물러설 수 없어!",
      translatedText: "¡De ninguna manera podemos retroceder ahora!",
      panelBounds: { x: 0, y: 0, width: 520, height: 680 },
      keepOutBoxes: [
        {
          id: "face-protagonist",
          label: "주인공 얼굴",
          rect: { x: 312, y: 180, width: 170, height: 210 },
          marginPx: 6,
        },
      ],
    });
    expect(rectResult.fitsWithoutKeepOutCollision).toBe(true);
    expect(rectResult.faceOverlapCount).toBe(0);
  });
});

describe("wasm64-wave12-crown: 3-Way 시맨틱 원고 병합 · Display-P3 소프트-니 색역 매퍼", () => {
  function createBlankRaster(w: number, h: number): Uint8Array {
    return new Uint8Array(w * h * 4);
  }

  function paintRect(
    rgba: Uint8Array,
    canvasW: number,
    x0: number,
    y0: number,
    w: number,
    h: number,
    color: readonly [number, number, number, number],
  ): void {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        const o = (y * canvasW + x) * 4;
        rgba[o] = color[0];
        rgba[o + 1] = color[1];
        rgba[o + 2] = color[2];
        rgba[o + 3] = color[3];
      }
    }
  }

  const identityTransform = { tx: 0, ty: 0, scaleX: 1, scaleY: 1, rotationDeg: 0 };

  it("동일 레이어의 비겹침 픽셀 터치와 서로 다른 레이어 속성 수정을 무충돌로 자동 병합한다", () => {
    const w = 32;
    const h = 32;
    const baseRaster = createBlankRaster(w, h);
    const asstRaster = new Uint8Array(baseRaster);
    const authRaster = new Uint8Array(baseRaster);

    // 어시스턴트는 좌상단(2,2)~(8,8), 작가는 우하단(20,20)~(27,27) 채색 -> 비겹침
    paintRect(asstRaster, w, 2, 2, 6, 6, [40, 120, 220, 255]);
    paintRect(authRaster, w, 20, 20, 7, 7, [230, 70, 50, 255]);

    const baseLayer: ManuscriptLayerSnapshot = {
      layerId: "ink-main",
      name: "주선화",
      zIndex: 10,
      visible: true,
      opacity: 1,
      blendMode: "normal",
      transform: identityTransform,
      raster: { width: w, height: h, rgba: baseRaster },
    };

    const baseRev: ManuscriptRevisionSnapshot = {
      revisionId: "rev-base",
      canvasWidth: w,
      canvasHeight: h,
      layers: [baseLayer],
    };
    const asstRev: ManuscriptRevisionSnapshot = {
      revisionId: "rev-asst",
      canvasWidth: w,
      canvasHeight: h,
      layers: [
        {
          ...baseLayer,
          opacity: 0.92,
          raster: { width: w, height: h, rgba: asstRaster },
        },
        {
          layerId: "bg-tone",
          name: "배경 스크린톤",
          zIndex: 5,
          visible: true,
          opacity: 0.75,
          blendMode: "multiply",
          transform: identityTransform,
        },
      ],
    };
    const authRev: ManuscriptRevisionSnapshot = {
      revisionId: "rev-auth",
      canvasWidth: w,
      canvasHeight: h,
      layers: [
        {
          ...baseLayer,
          blendMode: "multiply",
          raster: { width: w, height: h, rgba: authRaster },
        },
      ],
    };

    const diff = inspectThreeWayManuscriptDiff(baseRev, asstRev, authRev);
    expect(diff.canAutoMergeCleanly).toBe(true);
    expect(diff.structuralConflicts).toHaveLength(0);
    expect(diff.visualConflicts).toHaveLength(0);
    expect(diff.mergedLayers).toHaveLength(2);

    const mergedMain = diff.mergedLayers.find((l) => l.layerId === "ink-main")!;
    expect(mergedMain.opacity).toBeCloseTo(0.92, 4);
    expect(mergedMain.blendMode).toBe("multiply");

    // 좌상단 어시스턴트 픽셀과 우하단 작가 픽셀이 모두 병합 버퍼에 살아 있어야 한다
    const mergedRgba = mergedMain.raster!.rgba;
    const topLeftIdx = (3 * w + 3) * 4;
    const botRightIdx = (22 * w + 22) * 4;
    expect(mergedRgba[topLeftIdx]).toBe(40);
    expect(mergedRgba[botRightIdx]).toBe(230);
  });

  it("동일 좌표 픽셀에 서로 다른 색을 칠하거나 속성이 어긋나면 정확한 충돌 박스를 추출한다", () => {
    const w = 24;
    const h = 24;
    const baseRgba = createBlankRaster(w, h);
    const asstRgba = new Uint8Array(baseRgba);
    const authRgba = new Uint8Array(baseRgba);

    // (8,8)~(13,13) 영역에서 겹쳐 충돌하는 브러시 터치
    paintRect(asstRgba, w, 6, 6, 8, 8, [20, 200, 90, 255]);
    paintRect(authRgba, w, 10, 10, 8, 8, [240, 30, 80, 255]);

    const mkLayer = (opacity: number, rgba: Uint8Array): ManuscriptLayerSnapshot => ({
      layerId: "fx-glow",
      name: "이펙트 광원",
      zIndex: 20,
      visible: true,
      opacity,
      blendMode: "screen",
      transform: identityTransform,
      raster: { width: w, height: h, rgba },
    });

    const diff = inspectThreeWayManuscriptDiff(
      { revisionId: "b", canvasWidth: w, canvasHeight: h, layers: [mkLayer(1, baseRgba)] },
      { revisionId: "s", canvasWidth: w, canvasHeight: h, layers: [mkLayer(0.6, asstRgba)] },
      { revisionId: "u", canvasWidth: w, canvasHeight: h, layers: [mkLayer(0.85, authRgba)] },
    );

    expect(diff.canAutoMergeCleanly).toBe(false);
    expect(diff.structuralConflicts).toHaveLength(1);
    expect(diff.structuralConflicts[0]!.field).toBe("opacity");
    expect(diff.visualConflicts).toHaveLength(1);
    // 겹침 영역 (10,10)~(13,13) -> 4x4 = 16 픽셀 정확히 검출
    expect(diff.visualConflicts[0]!.bounds).toEqual({
      x: 10,
      y: 10,
      width: 4,
      height: 4,
      pixelCount: 16,
    });
    expect(extractDirtyConnectedComponents(new Uint8Array(0), 0, 0)).toEqual([]);
  });

  it("Display-P3 고채도 색상을 색상각 보존 소프트-니 압축으로 sRGB 및 TAC<=300% CMYK로 매핑한다", () => {
    const d65White = linearDisplayP3ToXyzD65(1, 1, 1);
    expect(d65White.y).toBeCloseTo(1.0, 5);

    // 무채색 회색은 채도 0과 색역 내부 판정을 유지한다
    const neutral = mapDisplayP3ColorGamut(0.5, 0.5, 0.5, { targetGamut: "srgb" });
    expect(neutral.wasOutOfGamut).toBe(false);
    expect(neutral.mappedOklch.c).toBeLessThan(1e-4);

    // Display-P3 고채도 그라데이션이 하드 클리핑으로 뭉개지지 않고 단조 증가 채도를 유지하는지 확인
    const step1 = mapDisplayP3ColorGamut(0.88, 0.12, 0.08, { targetGamut: "srgb" });
    const step2 = mapDisplayP3ColorGamut(0.94, 0.06, 0.04, { targetGamut: "srgb" });
    const step3 = mapDisplayP3ColorGamut(1.0, 0.0, 0.0, { targetGamut: "srgb" });

    expect(step3.wasOutOfGamut).toBe(true);
    expect(step1.mappedOklch.c).toBeLessThan(step2.mappedOklch.c);
    expect(step2.mappedOklch.c).toBeLessThan(step3.mappedOklch.c);
    expect(step3.hueDriftDeg).toBeLessThan(3.0);

    // 인쇄용 ISO-Coated CMYK 버퍼 매핑 시 심암부 칠흑(0,0,0) 포함 전 픽셀 TAC <= 300% 준수 검증
    const p3Buffer = new Uint8Array([
      0, 0, 0, 255, // 순수 검정 (하드 변환 시 400% 잉크 위험 구간)
      255, 0, 0, 255, // Display-P3 순적색
      0, 255, 60, 255, // Display-P3 네온 그린
      15, 18, 22, 255, // 어두운 남색 그림자
      255, 255, 255, 255, // 종이 백색
    ]);

    const printReport = mapDisplayP3BufferGamut(p3Buffer, {
      targetGamut: "iso-coated-cmyk",
      maxTacPercent: 300,
    });

    expect(printReport.pixelCount).toBe(5);
    expect(printReport.outOfGamutPixelCount).toBeGreaterThanOrEqual(3);
    expect(printReport.maxObservedTacPercent).toBeLessThanOrEqual(300.0001);
    expect(printReport.cmykFloat32).not.toBeNull();
    expect(printReport.serverCostKrw).toBe(0);
  });
});

describe("wasm64-wave12-crown: 무손실 8진트리 타일 동면기 · Sweep-and-Prune 알파 충돌 가속기", () => {
  it("단색·셀채색·고주파 노이즈 타일 모두 비트 단위 100% 무손실로 압축·복원한다", () => {
    const w = 64;
    const h = 64;

    // 1) 단색 타일 -> 13바이트 압축
    const solid = new Uint8Array(w * h * 4);
    for (let i = 0; i < solid.length; i += 4) {
      solid[i] = 248;
      solid[i + 1] = 245;
      solid[i + 2] = 238;
      solid[i + 3] = 255;
    }
    const solidPkt = compressTileRgbaLossless(solid, w, h);
    expect(solidPkt.mode).toBe("solid-rgba");
    expect(solidPkt.payload.byteLength).toBe(13);
    expect(decompressTileRgbaLossless(solidPkt, true)).toEqual(solid);

    // 2) 웹툰 셀 채색 + 선화 타일 -> planar-delta-rle 고압축
    const cel = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const o = (y * w + x) * 4;
        const isLine = x === y || x === y + 1;
        cel[o] = isLine ? 25 : y < 32 ? 120 : 210;
        cel[o + 1] = isLine ? 25 : y < 32 ? 165 : 190;
        cel[o + 2] = isLine ? 30 : 235;
        cel[o + 3] = 255;
      }
    }
    const celPkt = compressTileRgbaLossless(cel, w, h);
    expect(celPkt.mode).toBe("planar-delta-rle");
    expect(celPkt.payload.byteLength).toBeLessThan(cel.byteLength * 0.25);
    const celRestored = decompressTileRgbaLossless(celPkt, true);
    expect(computeFnv1a32(celRestored)).toBe(computeFnv1a32(cel));
    expect(celRestored).toEqual(cel);

    // 3) 의사 난수 노이즈 타일 -> raw-passthrough 폴백 및 비트 일치 복원
    const noisy = new Uint8Array(w * h * 4);
    let s = 13579;
    for (let i = 0; i < noisy.length; i += 1) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      noisy[i] = (s >>> 24) & 0xff;
    }
    const noisyPkt = compressTileRgbaLossless(noisy, w, h);
    expect(noisyPkt.mode).toBe("raw-passthrough");
    expect(decompressTileRgbaLossless(noisyPkt, true)).toEqual(noisy);
  });

  it("프러스텀 외곽 타일을 8진트리에서 무손실 동면시키고 패닝 진입 시 0.5ms급으로 즉시 복원한다", () => {
    const hibernator = new LosslessOctreeTileHibernator({
      worldBounds: { minX: 0, minY: 0, minZ: -100, maxX: 2048, maxY: 2048, maxZ: 100 },
      maxDepth: 5,
      maxTilesPerNode: 4,
      verifyChecksumOnWake: true,
    });

    const tileW = 64;
    const tileH = 64;
    const originals = new Map<string, Uint8Array>();

    // 8x8 = 64개 배경 타일 배치 (각 16KB, 총 1MB)
    for (let gy = 0; gy < 8; gy += 1) {
      for (let gx = 0; gx < 8; gx += 1) {
        const tileId = `tile-${gx}-${gy}`;
        const rgba = new Uint8Array(tileW * tileH * 4);
        for (let p = 0; p < tileW * tileH; p += 1) {
          const o = p * 4;
          const band = (p >> 5) & 3;
          rgba[o] = (gx * 28 + band * 12) & 0xff;
          rgba[o + 1] = (gy * 28 + band * 8) & 0xff;
          rgba[o + 2] = 180;
          rgba[o + 3] = 255;
        }
        originals.set(tileId, rgba);
        hibernator.upsertTile({
          tileId,
          bounds: {
            minX: gx * 256,
            minY: gy * 256,
            minZ: 0,
            maxX: gx * 256 + 240,
            maxY: gy * 256 + 240,
            maxZ: 10,
          },
          width: tileW,
          height: tileH,
          rgba,
        });
      }
    }

    // 좌상단 2x2 타일만 프러스텀 안에 남기고 나머지 60개 타일 동면
    const firstPass = hibernator.updateFrustum({
      minX: 0,
      minY: 0,
      minZ: -5,
      maxX: 500,
      maxY: 500,
      maxZ: 20,
    });
    expect(firstPass.hotTileCount).toBe(4);
    expect(firstPass.hibernatedTileCount).toBe(60);
    expect(firstPass.ramSavedBytes).toBeGreaterThan(800_000);

    // 우하단 단일 타일(tile-6-6)로 프러스텀 점프 -> 동면 해제 시간 및 비트 일치 검증
    const panPass = hibernator.updateFrustum({
      minX: 6 * 256 + 10,
      minY: 6 * 256 + 10,
      minZ: -5,
      maxX: 6 * 256 + 200,
      maxY: 6 * 256 + 200,
      maxZ: 20,
    });
    expect(panPass.wokenTileIds).toEqual(["tile-6-6"]);
    expect(panPass.hotTileCount).toBe(1);
    expect(panPass.wakeupElapsedMs).toBeLessThan(5);

    const wokenPixels = hibernator.acquireHotTileRgba("tile-6-6");
    expect(wokenPixels).toEqual(originals.get("tile-6-6"));
    expect(hibernator.inspectTileResidency("tile-6-6")?.state).toBe("hot");
    expect(hibernator.inspectTileResidency("tile-0-0")?.state).toBe("hibernated");
    expect(hibernator.deleteTile("tile-0-0")).toBe(true);
    expect(hibernator.inspectTileResidency("tile-0-0")).toBeNull();
  });

  it("Sweep-and-Prune 광역 필터링과 알파 마스크 협역 검사로 가짜 AABB 충돌을 정확히 배제한다", () => {
    const size = 20;
    // 좌상->우하 대각선 슬래시 마스크 (폭 1px)
    const slashMaskA = new Uint8Array(size * size);
    for (let i = 0; i < size; i += 1) {
      slashMaskA[i * size + i] = 255;
    }
    // 같은 방향 평행 슬래시이지만 오른쪽 위로 6px 떨어져 있어 AABB가 완전히 겹쳐도 픽셀은 안 닿음
    const slashMaskDisjoint = new Uint8Array(size * size);
    for (let i = 0; i < size - 6; i += 1) {
      slashMaskDisjoint[i * size + (i + 6)] = 255;
    }

    const distantProps: CollidableStudioLayer[] = Array.from({ length: 30 }, (_, idx) => ({
      layerId: `distant-prop-${idx}`,
      kind: "prop",
      x: 500 + idx * 80,
      y: 100,
      width: 30,
      height: 30,
    }));

    const reportDisjoint = detectLayerCollisionsSweepAndPrune([
      {
        layerId: "fx-slash-1",
        kind: "fx",
        x: 40,
        y: 40,
        width: size,
        height: size,
        alphaMask: slashMaskA,
      },
      {
        layerId: "fx-slash-2",
        kind: "fx",
        x: 40,
        y: 40,
        width: size,
        height: size,
        alphaMask: slashMaskDisjoint,
      },
      ...distantProps,
    ]);

    // AABB 후보는 1쌍 잡히지만 알파 픽셀 교차가 0이므로 최종 충돌은 0건이어야 한다
    expect(reportDisjoint.broadPhaseCandidateCount).toBe(1);
    expect(reportDisjoint.collisions).toHaveLength(0);
    expect(reportDisjoint.prunedPairRatio).toBeGreaterThan(0.95);

    const reportCross = detectLayerCollisionsSweepAndPrune([
      {
        layerId: "balloon-a",
        kind: "speech-balloon",
        x: 40,
        y: 40,
        width: size,
        height: size,
        alphaMask: slashMaskA,
      },
      {
        layerId: "fx-cross",
        kind: "fx",
        x: 40,
        y: 40,
        width: size + 1,
        height: size,
        // 홀수 격자 정렬로 정확히 대각선 중심에서 픽셀 교차 보장
        alphaMask: (() => {
          const m = new Uint8Array((size + 1) * size);
          for (let i = 0; i < size; i += 1) {
            m[i * (size + 1) + (size - 1 - i)] = 255;
            if (i + 1 <= size) m[i * (size + 1) + (size - i)] = 255;
          }
          return m;
        })(),
      },
      ...distantProps,
    ]);

    expect(reportCross.collisions).toHaveLength(1);
    expect(reportCross.collisions[0]!.alphaOverlapPixelCount).toBeGreaterThanOrEqual(1);
    expect(reportCross.collisions[0]!.aabbOverlapAreaPx).toBe(size * size);
  });
});
