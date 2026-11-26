import { describe, expect, it } from "vitest";

import {
  analyzeScrollEmotionRhythm,
  COLOR_MOOD_VARIANT_PRESETS,
  composeBinocularEyeCatchlights,
  computeScreenSpaceRadiosityBounce,
  computeTileContentHash64,
  countReadingSyllables,
  COW_TILE_BYTE_LENGTH,
  COW_TILE_DIMENSION_PX,
  evaluateHermiteRazorTaper,
  gradeTileWithMoodPreset,
  MICRO_EXPRESSION_SPECS,
  PersistentLayerTileSnapshotTree,
  RADIOSITY_MOOD_PRESETS,
  reflectIncidentRay3D,
  sculptCalligraphicStroke,
  synthesizeSilhouetteNormals2D,
  WGSL_SCREEN_SPACE_RADIOSITY_KERNEL,
  type CalligraphicStrokeSample,
} from "./index";

function createFilledTileRgba8(r: number, g: number, b: number, a = 255, stripeSeed = 0): Uint8Array {
  const buf = new Uint8Array(COW_TILE_BYTE_LENGTH);
  for (let i = 0; i < COW_TILE_BYTE_LENGTH; i += 4) {
    const px = i >>> 2;
    const mod = (px + stripeSeed) & 15;
    buf[i] = Math.min(255, Math.max(0, r + mod));
    buf[i + 1] = Math.min(255, Math.max(0, g + (mod >>> 1)));
    buf[i + 2] = Math.min(255, Math.max(0, b));
    buf[i + 3] = a;
  }
  return buf;
}

describe("wasm64-wave16-mastery: 2D/2.5D 화면 공간 라디오시티 간접광 번짐 커널", () => {
  it("노을 발광 배경색이 전경 캐릭터 그림자 외곽에만 따뜻하게 스며들고 직사광 영역은 보존한다", () => {
    const width = 24;
    const height = 24;
    const pixelCount = width * height;
    const bg = new Float32Array(pixelCount * 4);
    const fg = new Float32Array(pixelCount * 4);
    const shadowMask = new Float32Array(pixelCount);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        bg[idx * 4] = 0.95;
        bg[idx * 4 + 1] = 0.36;
        bg[idx * 4 + 2] = 0.12;
        bg[idx * 4 + 3] = 1;

        const insideChar = x >= 7 && x <= 16 && y >= 6 && y <= 18;
        if (insideChar) {
          fg[idx * 4] = 0.25;
          fg[idx * 4 + 1] = 0.25;
          fg[idx * 4 + 2] = 0.28;
          fg[idx * 4 + 3] = 1;
          shadowMask[idx] = x <= 11 ? 1 : 0;
        }
      }
    }

    const res = computeScreenSpaceRadiosityBounce({
      width,
      height,
      backgroundEmissiveRgbaLinear: bg,
      foregroundAlbedoRgbaLinear: fg,
      foregroundShadowMask: shadowMask,
      presetId: "sunset-warm-bleed",
    });

    expect(res.serverCostKrw).toBe(0);
    expect(res.activeForegroundPixels).toBe(10 * 13);
    expect(res.shadowEdgePixelsAffected).toBeGreaterThan(20);
    expect(res.meanShadowBounceLuminance).toBeGreaterThan(0.02);

    const shadowRimIdx = 12 * width + 7;
    const litRimIdx = 12 * width + 16;
    const shadowR = res.compositedRgbaLinear[shadowRimIdx * 4]!;
    const shadowB = res.compositedRgbaLinear[shadowRimIdx * 4 + 2]!;
    const litR = res.compositedRgbaLinear[litRimIdx * 4]!;

    // 노을 간접광이 그림자 외곽(x=7)에 붉은/주황 기운을 더하고, 그림자 마스크 0인 영역(x=16)은 원본 유지
    expect(shadowR).toBeGreaterThan(0.25 + 0.08);
    expect(shadowR - 0.25).toBeGreaterThan((shadowB - 0.28) * 2.2);
    expect(litR).toBeCloseTo(0.25, 5);
    expect(WGSL_SCREEN_SPACE_RADIOSITY_KERNEL).toContain("RadiosityUniforms");
    expect(RADIOSITY_MOOD_PRESETS["sunset-warm-bleed"].labelKo).toBe("노을 역광 간접 번짐");
  });

  it("청록 마법진 발광원 방향성(코사인 형태 계수)과 2.5D 깊이 단차 차폐를 정확히 반영한다", () => {
    const width = 28;
    const height = 20;
    const pixelCount = width * height;
    const bg = new Float32Array(pixelCount * 4);
    const fg = new Float32Array(pixelCount * 4);
    const nearDepth = new Float32Array(pixelCount).fill(0.5);
    const farDisjointDepth = new Float32Array(pixelCount).fill(0.95);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        // 왼쪽(x < 9)에만 강한 청록 마법진이 빛난다.
        if (x < 9) {
          bg[idx * 4] = 0.08;
          bg[idx * 4 + 1] = 0.88;
          bg[idx * 4 + 2] = 0.96;
          bg[idx * 4 + 3] = 1.2;
        }
        if (x >= 10 && x <= 19 && y >= 5 && y <= 14) {
          fg[idx * 4] = 0.22;
          fg[idx * 4 + 1] = 0.22;
          fg[idx * 4 + 2] = 0.22;
          fg[idx * 4 + 3] = 1;
          nearDepth[idx] = 0.48;
          farDisjointDepth[idx] = 0.05;
        }
      }
    }

    const normals = synthesizeSilhouetteNormals2D(width, height, fg);
    const leftEdgeIdx = 10 * width + 10;
    expect(normals.normalXY[leftEdgeIdx * 2]!).toBeLessThan(-0.7);

    const coherentPass = computeScreenSpaceRadiosityBounce({
      width, height, backgroundEmissiveRgbaLinear: bg, foregroundAlbedoRgbaLinear: fg,
      depthMap: nearDepth, presetId: "magic-circle-cyan", depthSigma: 0.12,
    });
    const occludedDepthPass = computeScreenSpaceRadiosityBounce({
      width, height, backgroundEmissiveRgbaLinear: bg, foregroundAlbedoRgbaLinear: fg,
      depthMap: farDisjointDepth, presetId: "magic-circle-cyan", depthSigma: 0.12,
    });

    const rightEdgeIdx = 10 * width + 19;
    const leftCyanIrrad = coherentPass.bounceIrradianceRgb[leftEdgeIdx * 3 + 2]!;
    const rightCyanIrrad = coherentPass.bounceIrradianceRgb[rightEdgeIdx * 3 + 2]!;
    const depthGapCyanIrrad = occludedDepthPass.bounceIrradianceRgb[leftEdgeIdx * 3 + 2]!;

    expect(leftCyanIrrad).toBeGreaterThan(rightCyanIrrad * 3);
    expect(leftCyanIrrad).toBeGreaterThan(depthGapCyanIrrad * 1.4);
  });

  it("잘못된 해상도나 짧은 버퍼 입력 시 명확한 RangeError를 던진다", () => {
    expect(() =>
      computeScreenSpaceRadiosityBounce({
        width: 0, height: 8,
        backgroundEmissiveRgbaLinear: new Float32Array(0),
        foregroundAlbedoRgbaLinear: new Float32Array(0),
      }),
    ).toThrow(RangeError);
  });
});

describe("wasm64-wave16-mastery: 서예풍 예각 먹물 맺힘 & G펜 끝빠짐 조형기", () => {
  it("내각 θ < 110° 예각 교차점에서만 모세관 먹물 맺힘 필렛과 잉크 트랩을 생성한다", () => {
    const sharpStroke: readonly CalligraphicStrokeSample[] = [
      { x: 0, y: 0, widthPx: 6, pressure: 0.85, timestampMs: 0 },
      { x: 40, y: 0, widthPx: 6.4, pressure: 0.9, timestampMs: 24 },
      // (40, 0)에서 예각(~36.87°)으로 꺾여 되돌아가는 깃/머리카락 끝단
      { x: 8, y: 24, widthPx: 6, pressure: 0.88, timestampMs: 52 },
      // (8, 24)에서 둔각(> 125°)으로 완만히 이어지는 구간
      { x: -30, y: 32, widthPx: 5.2, pressure: 0.65, timestampMs: 80 },
      { x: -66, y: 38, widthPx: 4.5, pressure: 0.3, timestampMs: 92 },
    ];

    const sculpted = sculptCalligraphicStroke(sharpStroke, { acuteAngleThresholdDeg: 110 });
    expect(sculpted.serverCostKrw).toBe(0);
    expect(sculpted.acuteInkFillets.length).toBe(1);

    const fillet = sculpted.acuteInkFillets[0]!;
    expect(fillet.vertexIndex).toBe(1);
    expect(fillet.interiorAngleDeg).toBeCloseTo(36.87, 1);
    expect(fillet.interiorAngleDeg).toBeLessThan(110);
    expect(fillet.meniscusRadiusPx).toBeGreaterThan(0.8);
    expect(fillet.pooledInkAreaPx2).toBeGreaterThan(0);
    expect(fillet.inkTrapReliefPx).toBeGreaterThan(0);
    expect(fillet.meniscusArcPoints.length).toBe(6);
  });

  it("3차 에르미트(Cubic-Hermite) 릴리즈 곡선과 펜 튕김 속도로 면도날 끝빠짐을 조형한다", () => {
    expect(evaluateHermiteRazorTaper(0, 0.12)).toBe(0);
    expect(evaluateHermiteRazorTaper(1, 0.12)).toBe(1);
    expect(evaluateHermiteRazorTaper(0.25, 0.12)).toBeLessThan(evaluateHermiteRazorTaper(0.65, 0.12));

    const makeFlick = (endTimestampMs: number): readonly CalligraphicStrokeSample[] => [
      { x: 0, y: 0, widthPx: 7, pressure: 0.8, timestampMs: 0 },
      { x: 30, y: 0, widthPx: 7, pressure: 0.9, timestampMs: 30 },
      { x: 60, y: 0, widthPx: 7, pressure: 0.85, timestampMs: 60 },
      { x: 95, y: 0, widthPx: 7, pressure: 0.6, timestampMs: 60 + (endTimestampMs - 60) * 0.5 },
      { x: 135, y: 0, widthPx: 7, pressure: 0.25, timestampMs: endTimestampMs },
    ];

    const slowRelease = sculptCalligraphicStroke(makeFlick(320));
    const fastFlickRelease = sculptCalligraphicStroke(makeFlick(95));

    expect(fastFlickRelease.releaseFlickSpeedPxPerSec).toBeGreaterThan(slowRelease.releaseFlickSpeedPxPerSec * 3);
    expect(fastFlickRelease.effectiveReleaseTaperPx).toBeGreaterThan(slowRelease.effectiveReleaseTaperPx);
    expect(fastFlickRelease.tipWidthPx).toBeLessThanOrEqual(0.02);
    expect(fastFlickRelease.samples[2]!.sculptedWidthPx).toBeGreaterThan(fastFlickRelease.samples[4]!.sculptedWidthPx * 50);
  });
});

describe("wasm64-wave16-mastery: 미세 비대칭 표정 & 3D 구면 각막 하이라이트 합성기", () => {
  it("3D 구면 반사 공식 R = I - 2(N·I)N 정합성, 반대편 홍채 반사광 초승달, 1~2° 양안 수렴각을 만족한다", () => {
    // 입사 광선 (1, -1, 0)/√2 가 법선 (0, 1, 0) 평면에 반사되면 (1, 1, 0)/√2
    const directReflected = reflectIncidentRay3D([1, -1, 0], [0, 1, 0]);
    expect(directReflected[0]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(directReflected[1]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(directReflected[2]).toBeCloseTo(0, 6);

    const composed = composeBinocularEyeCatchlights({
      leftEyeCenterMm: [-31, 0, 0],
      rightEyeCenterMm: [31, 0, 0],
      focalTargetMm: [0, 0, 2100],
      keyLightDirection: [-0.45, 0.62, 0.64],
      viewerDirection: [0, 0, 1],
      clampNaturalPortraitVergence: true,
      microExpression: "wistful-smile",
    });

    expect(composed.serverCostKrw).toBe(0);
    expect(composed.expressionLabelKo).toBe(MICRO_EXPRESSION_SPECS["wistful-smile"].labelKo);
    expect(composed.isWithinNaturalVergenceBand).toBe(true);
    expect(composed.binocularVergenceDeg).toBeGreaterThanOrEqual(1.0);
    expect(composed.binocularVergenceDeg).toBeLessThanOrEqual(2.0);

    // 좌안은 우측(+X), 우안은 좌측(-X)으로 미세 수렴
    expect(composed.leftEye.gazeDirection[0]).toBeGreaterThan(0);
    expect(composed.rightEye.gazeDirection[0]).toBeLessThan(0);

    // 구면 각막 정반사 지점에서 R = I - 2(N·I)N 은 카메라 시선 V와 정확히 일치(내적 1.0)
    expect(composed.leftEye.viewerAlignmentCosine).toBeCloseTo(1, 6);
    expect(composed.rightEye.viewerAlignmentCosine).toBeCloseTo(1, 6);

    // 좌상단 주광원일 때 주 하이라이트와 하단 홍채 반사광은 서로 반대 반구에 위치한다.
    const primary = composed.leftEye.primaryCatchlightUv;
    const caustic = composed.leftEye.oppositeIrisCausticCenterUv;
    expect(primary[0] * caustic[0] + primary[1] * caustic[1]).toBeLessThan(-0.05);
    expect(composed.leftEye.irisCausticCrescentArcUv.length).toBe(7);

    // 미세 비대칭 눈매 열림 편차 확인
    expect(Math.abs(composed.apertureAsymmetryDelta)).toBeCloseTo(0.045, 4);
  });

  it("너무 가까운 초점도 인물화 수렴 보정 켜짐 시 자연스러운 1~2° 양안 수렴각으로 안정화한다", () => {
    const clamped = composeBinocularEyeCatchlights({
      focalTargetMm: [0, 0, 250],
      keyLightDirection: [0.3, 0.5, 0.8],
      clampNaturalPortraitVergence: true,
    });
    expect(clamped.isWithinNaturalVergenceBand).toBe(true);
    expect(clamped.binocularVergenceDeg).toBeGreaterThanOrEqual(1.0);
    expect(clamped.binocularVergenceDeg).toBeLessThanOrEqual(2.0);
  });
});

describe("wasm64-wave16-mastery: 세로 스크롤 감정 박자 & 컷 여백 리듬 분석기", () => {
  it("정규식 없이 한글·영문·숫자 대사 음절 수를 정확히 계수하고 박자 곡선과 호흡 불일치를 진단한다", () => {
    expect(countReadingSyllables("잠깐만, 거기 서!")).toBe(6);
    expect(countReadingSyllables("Combo 3타 Hit!")).toBe(5);
    expect(countReadingSyllables("SFX")).toBe(1);
    expect(countReadingSyllables("")).toBe(0);

    const report = analyzeScrollEmotionRhythm({
      viewportHeightPx: 840,
      baselineScrollPxPerSec: 560,
      panels: [
        {
          panelId: "cut-1-tragic-rushed",
          panelHeightPx: 620,
          gutterAfterPx: 40,
          dialogueText: "...",
          visualContrastEnergy: 0.78,
          intendedEmotion: "tragic-silence",
        },
        {
          panelId: "cut-2-action-sluggish",
          panelHeightPx: 500,
          gutterAfterPx: 340,
          dialogueText: "지금 이 순간 모든 힘을 끌어모아 정면으로 돌파해야만 승산이 열릴 것이다!",
          visualContrastEnergy: 0.85,
          intendedEmotion: "action-combo",
        },
        {
          panelId: "cut-3-reveal-tight",
          panelHeightPx: 740,
          gutterAfterPx: 60,
          dialogueText: "설마 네가?",
          visualContrastEnergy: 0.92,
          intendedEmotion: "climactic-reveal",
        },
      ],
    });

    expect(report.serverCostKrw).toBe(0);
    expect(report.beatTimeline).toHaveLength(3);
    expect(report.beatTimeline[0]!.timelineStartSec).toBe(0);
    expect(report.beatTimeline[1]!.timelineStartSec).toBeCloseTo(report.beatTimeline[0]!.timelineEndSec, 6);
    expect(report.beatTimeline[2]!.cumulativeBeatIndex).toBeGreaterThan(report.beatTimeline[1]!.cumulativeBeatIndex);

    const kinds = report.warnings.map((w) => w.kind);
    expect(kinds).toContain("rushed-tragic-silence");
    expect(kinds).toContain("sluggish-action-combo");
    expect(kinds).toContain("abrupt-climactic-reveal");
  });

  it("감정 태그가 변하는데도 3컷 연속 여백이 기계적으로 같으면 단조로운 리듬 경고를 낸다", () => {
    const report = analyzeScrollEmotionRhythm({
      panels: [
        { panelId: "p1", panelHeightPx: 520, gutterAfterPx: 180, dialogueText: "오늘 날씨가 좋네", visualContrastEnergy: 0.4, intendedEmotion: "warm-everyday" },
        { panelId: "p2", panelHeightPx: 540, gutterAfterPx: 180, dialogueText: "뒤에서 발소리가 들려", visualContrastEnergy: 0.65, intendedEmotion: "tension-suspense" },
        { panelId: "p3", panelHeightPx: 500, gutterAfterPx: 182, dialogueText: "피해!", visualContrastEnergy: 0.8, intendedEmotion: "comedic-punch" },
      ],
    });
    expect(report.warnings.some((w) => w.kind === "monotone-gutter-cadence")).toBe(true);
  });
});

describe("wasm64-wave16-mastery: 무복사 Copy-on-Write(CoW) 256x256 영속 타일 스냅샷 트리", () => {
  it("Variant A(심야 네온리스 느와르)와 Variant B(노을 역광)를 0B 추가 메모리로 O(1) 분기하고 수정 타일만 CoW 할당한다", () => {
    expect(COW_TILE_DIMENSION_PX).toBe(256);
    expect(COW_TILE_BYTE_LENGTH).toBe(262_144);

    const bgTile0 = createFilledTileRgba8(90, 110, 140, 255, 1);
    const bgTile1 = createFilledTileRgba8(120, 95, 80, 255, 2);
    const charTile0 = createFilledTileRgba8(210, 180, 165, 255, 3);
    const charTile1 = createFilledTileRgba8(55, 60, 75, 255, 4);

    const tree = new PersistentLayerTileSnapshotTree();
    const root = tree.createRootSnapshot("main", "기본 채색 원고", [
      {
        layerId: "layer-bg",
        nameKo: "배경 하늘",
        initialTiles: [
          { tileX: 0, tileY: 0, pixelsRgba8: bgTile0 },
          { tileX: 1, tileY: 0, pixelsRgba8: bgTile1 },
        ],
      },
      {
        layerId: "layer-char",
        nameKo: "주인공 인물",
        initialTiles: [
          { tileX: 0, tileY: 0, pixelsRgba8: charTile0 },
          { tileX: 0, tileY: 1, pixelsRgba8: charTile1 },
        ],
      },
    ]);

    expect(tree.getMemoryTelemetry().uniquePhysicalTileCount).toBe(4);

    // 1) 두 무드 변주 브랜치 즉시 분기 -> 추가 타일 할당 0B, 모든 타일 버퍼 포인터 100% 동일
    const forkNoir = tree.forkVariantBranch(
      root.snapshotId,
      "variant-noir",
      COLOR_MOOD_VARIANT_PRESETS["midnight-neonless-noir"].variantTitleKo,
    );
    const forkSunset = tree.forkVariantBranch(
      root.snapshotId,
      "variant-sunset",
      COLOR_MOOD_VARIANT_PRESETS["sunset-backlight"].variantTitleKo,
    );

    expect(forkNoir.newlyAllocatedTileBytes).toBe(0);
    expect(forkSunset.newlyAllocatedTileBytes).toBe(0);
    expect(tree.getMemoryTelemetry().uniquePhysicalTileCount).toBe(4);

    const rootChar0 = tree.getTileHandle(root.snapshotId, "layer-char", 0, 0)!;
    const noirChar0Before = tree.getTileHandle(forkNoir.snapshot.snapshotId, "layer-char", 0, 0)!;
    expect(noirChar0Before.pixelsRgba8).toBe(rootChar0.pixelsRgba8);
    expect(noirChar0Before.snapshotRefCount).toBe(3);

    // 2) Variant A에서는 배경 (0, 0) 타일 1개만 느와르 그레이딩 적용 -> 나머지 3개 타일은 무복사 공유!
    const noirApplied = tree.applyMoodVariantCow(
      forkNoir.snapshot.snapshotId,
      "layer-bg",
      "midnight-neonless-noir",
      { minTileX: 0, minTileY: 0, maxTileX: 0, maxTileY: 0 },
    );
    expect(noirApplied.touchedTileCount).toBe(1);
    expect(noirApplied.sharedUntouchedTileCount).toBe(3);
    expect(noirApplied.duplicateBytesForUntouchedTiles).toBe(0);

    // 3) Variant B에서는 인물 (0, 1) 타일 1개만 노을 역광 그레이딩 적용
    const sunsetApplied = tree.applyMoodVariantCow(
      forkSunset.snapshot.snapshotId,
      "layer-char",
      "sunset-backlight",
      { minTileX: 0, minTileY: 1, maxTileX: 0, maxTileY: 1 },
    );
    expect(sunsetApplied.touchedTileCount).toBe(1);
    expect(sunsetApplied.sharedUntouchedTileCount).toBe(3);
    expect(sunsetApplied.duplicateBytesForUntouchedTiles).toBe(0);

    // 건드리지 않은 타일(layer-bg 1,0)은 root, Variant A, Variant B 모두 정확히 동일한 물리 Uint8Array 참조를 공유
    const rootBg1 = tree.getTileHandle(root.snapshotId, "layer-bg", 1, 0)!;
    const noirBg1 = tree.getTileHandle(noirApplied.snapshot.snapshotId, "layer-bg", 1, 0)!;
    const sunsetBg1 = tree.getTileHandle(sunsetApplied.snapshot.snapshotId, "layer-bg", 1, 0)!;
    expect(noirBg1.pixelsRgba8).toBe(rootBg1.pixelsRgba8);
    expect(sunsetBg1.pixelsRgba8).toBe(rootBg1.pixelsRgba8);

    // 4) 서로 다른 타일을 수정한 두 브랜치를 3-way 병합 -> 충돌 0건, 추가 픽셀 할당 0B!
    const merged = tree.mergeVariantBranches(
      root.snapshotId,
      noirApplied.snapshot.snapshotId,
      sunsetApplied.snapshot.snapshotId,
      "merged-cut",
      "느와르 배경 + 노을 인물 병합",
    );
    expect(merged.conflicts).toHaveLength(0);
    expect(merged.newlyAllocatedTileBytes).toBe(0);

    const diffsFromRoot = tree.diffSnapshots(root.snapshotId, merged.mergedSnapshot.snapshotId);
    expect(diffsFromRoot).toHaveLength(2);

    const telemetry = tree.getMemoryTelemetry();
    expect(telemetry.uniquePhysicalTileCount).toBe(6);
    expect(telemetry.savedBytesByCowSharing).toBeGreaterThan(COW_TILE_BYTE_LENGTH * 10);
    expect(telemetry.serverCostKrw).toBe(0);
  });

  it("동일 픽셀 내용 해시 자동 중복 제거와 스냅샷 폐기(prune) 시 참조 카운트 0인 타일 회수를 보장한다", () => {
    const baseTile = createFilledTileRgba8(100, 120, 140, 255, 7);
    const paintedTile = gradeTileWithMoodPreset(baseTile, "sunset-backlight");
    expect(computeTileContentHash64(paintedTile)).toHaveLength(16);

    const tree = new PersistentLayerTileSnapshotTree();
    const root = tree.createRootSnapshot("main", "초기", [
      { layerId: "ink", nameKo: "선화", initialTiles: [{ tileX: 0, tileY: 0, pixelsRgba8: baseTile }] },
    ]);
    const branchA = tree.forkVariantBranch(root.snapshotId, "a", "A").snapshot;
    const branchB = tree.forkVariantBranch(root.snapshotId, "b", "B").snapshot;

    // 서로 다른 두 브랜치에 동일한 픽셀 데이터를 기록하면 내용 해시로 단일 버퍼만 유지된다.
    const snapA2 = tree.writeTileCow(branchA.snapshotId, "ink", 0, 0, new Uint8Array(paintedTile));
    const snapB2 = tree.writeTileCow(branchB.snapshotId, "ink", 0, 0, new Uint8Array(paintedTile));
    expect(tree.getMemoryTelemetry().uniquePhysicalTileCount).toBe(2);

    const handleA = tree.getTileHandle(snapA2.snapshotId, "ink", 0, 0)!;
    const handleB = tree.getTileHandle(snapB2.snapshotId, "ink", 0, 0)!;
    expect(handleA.pixelsRgba8).toBe(handleB.pixelsRgba8);
    expect(handleA.snapshotRefCount).toBe(2);

    // 같은 좌표를 서로 다른 타일로 편집한 뒤 3-way 병합하면 충돌을 정확히 보고한다.
    const noirTile = gradeTileWithMoodPreset(baseTile, "midnight-neonless-noir");
    const snapBConflict = tree.writeTileCow(snapB2.snapshotId, "ink", 0, 0, noirTile);
    const conflictMerge = tree.mergeVariantBranches(
      root.snapshotId,
      snapA2.snapshotId,
      snapBConflict.snapshotId,
      "conflict-check",
      "충돌 검증",
    );
    expect(conflictMerge.conflicts).toHaveLength(1);
    expect(conflictMerge.conflicts[0]!.tileX).toBe(0);

    // 유일하게 noirTile을 참조하던 snapBConflict 스냅샷을 폐기하면 즉시 262,144B가 회수된다.
    const pruned = tree.pruneSnapshot(snapBConflict.snapshotId);
    expect(pruned.reclaimedTileCount).toBe(1);
    expect(pruned.reclaimedBytes).toBe(COW_TILE_BYTE_LENGTH);
    expect(tree.getBranchHeadSnapshot("main")?.snapshotId).toBe(root.snapshotId);
  });

  it("둔각(>= 110°) 스트로크 미발동 및 잘못된 타일·정점 입력 방어를 검증한다", () => {
    const obtuseStroke: readonly CalligraphicStrokeSample[] = [
      { x: 0, y: 0, widthPx: 5, pressure: 0.7, timestampMs: 0 },
      { x: 30, y: 0, widthPx: 5, pressure: 0.7, timestampMs: 20 },
      { x: 55, y: 12, widthPx: 5, pressure: 0.7, timestampMs: 40 },
    ];
    expect(sculptCalligraphicStroke(obtuseStroke).acuteInkFillets).toHaveLength(0);
    expect(() => sculptCalligraphicStroke([{ x: 0, y: 0, widthPx: 4, pressure: 1, timestampMs: 0 }])).toThrow(RangeError);
    expect(() => gradeTileWithMoodPreset(new Uint8Array(64), "sunset-backlight")).toThrow(RangeError);
  });
});
