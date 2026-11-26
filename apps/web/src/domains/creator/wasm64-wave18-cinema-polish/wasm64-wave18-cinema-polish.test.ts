import { describe, expect, it } from "vitest";

import {
  ACTION_IMPACT_LABELS_KO,
  MICROSCOPE_ANOMALY_LABELS_KO,
  PROSODY_LABELS_KO,
  SURFACE_PRESET_LABELS_KO,
  TVANI_MAGIC_BYTES,
  buildCasAssetManifest,
  cleanStrayPixelsAndAlphaHalos,
  computeSchlickFresnel,
  computeSha256Hex,
  decodeTvaniBinary,
  encodeTvaniBinary,
  generateActionImpactFrame,
  generateDirectionalCameraShake,
  generateSwingArcMotionSmear,
  measureTvaniCompressionRatio,
  reassembleCasAssetLossless,
  reconcileCasSyncPlan,
  reflectPointAcrossPlane2D,
  scatterPerspectiveCrowdSilhouettes,
  segmentKoreanSyllableClusters,
  shapeExpressiveKoreanLettering,
  warpPlanarFresnelReflection,
  type ProsodyEmotionTag,
  type TvaniAnimationClip,
} from "./index";

function setPixel(
  rgba: Uint8Array,
  width: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const off = (y * width + x) * 4;
  rgba[off] = r;
  rgba[off + 1] = g;
  rgba[off + 2] = b;
  rgba[off + 3] = a;
}

describe("Wave 18 Cinema Polish — 평면·웅덩이 프레넬 반사, 액션 임팩트, 원근 군중 배치", () => {
  it("슐릭 프레넬 반사율과 임의 직선 대칭 변환의 기하학적 불변성을 검증한다", () => {
    expect(SURFACE_PRESET_LABELS_KO["rain-puddle"]).toBe("빗물 웅덩이 반사");
    expect(computeSchlickFresnel(0, 0.04)).toBeCloseTo(1, 6);
    expect(computeSchlickFresnel(1, 0.04)).toBeCloseTo(0.04, 6);
    expect(computeSchlickFresnel(0.2, 0.04)).toBeGreaterThan(computeSchlickFresnel(0.8, 0.04));

    const tiltedPlane = { a: 1, b: 1, c: -20 };
    const reflected = reflectPointAcrossPlane2D(4, 6, tiltedPlane);
    expect(reflected.x).toBeCloseTo(14, 6);
    expect(reflected.y).toBeCloseTo(16, 6);

    const roundTrip = reflectPointAcrossPlane2D(reflected.x, reflected.y, tiltedPlane);
    expect(roundTrip.x).toBeCloseTo(4, 6);
    expect(roundTrip.y).toBeCloseTo(6, 6);
  });

  it("지평선 아래 빗물 웅덩이에 프레넬 스침각 부스트와 동심원 빗방울 파문 왜곡 반사를 생성한다", () => {
    const width = 48;
    const height = 48;
    const horizonY = 24;
    const source = new Uint8Array(width * height * 4);

    // 지평선 위(y = 10..22)에 서 있는 붉은 망토 캐릭터 블록
    for (let y = 10; y <= 22; y += 1) {
      for (let x = 18; x <= 28; x += 1) {
        setPixel(source, width, x, y, 220, 48, 64, 255);
      }
    }

    const calm = warpPlanarFresnelReflection({
      width,
      height,
      sourceRgba: source,
      plane: { a: 0, b: 1, c: -horizonY },
      surfacePreset: "rain-puddle",
      grazingAngleFalloffPx: 18,
    });

    expect(calm.sampledPixelCount).toBeGreaterThan(80);
    expect(calm.peakFresnelWeight).toBeGreaterThan(0.75);

    // 지평선 바로 아래(y=26, 스침각)의 반사 알파가 먼 아래쪽(y=37)보다 높아야 한다.
    const nearAlpha = calm.reflectionRgba[(26 * width + 23) * 4 + 3]!;
    const farAlpha = calm.reflectionRgba[(37 * width + 23) * 4 + 3]!;
    expect(nearAlpha).toBeGreaterThan(farAlpha);
    expect(farAlpha).toBeGreaterThan(0);

    // 원본 상단 캐릭터 픽셀은 합성 버퍼에서도 손실 없이 유지되어야 한다.
    const origOff = (15 * width + 23) * 4;
    expect(calm.compositedRgba[origOff]).toBe(220);
    expect(calm.compositedRgba[origOff + 3]).toBe(255);

    // 빗방울 파문 섭동을 주면 반사 픽셀 분포가 정적 수면과 달라져야 한다.
    const rippled = warpPlanarFresnelReflection({
      width,
      height,
      sourceRgba: source,
      plane: { a: 0, b: 1, c: -horizonY },
      surfacePreset: "rain-puddle",
      ripples: [
        {
          centerX: 23,
          centerY: 30,
          wavelengthPx: 6,
          amplitudePx: 3.8,
          phaseRad: 0.7,
          dampingRadiusPx: 24,
        },
      ],
    });

    let diffBytes = 0;
    for (let i = 0; i < calm.reflectionRgba.length; i += 1) {
      if (calm.reflectionRgba[i] !== rippled.reflectionRgba[i]) diffBytes += 1;
    }
    expect(diffBytes).toBeGreaterThan(20);
  });

  it("고대비 흑백 타격 임팩트 프레임, 비선형 스윙 모션 스미어, 감쇠 카메라 쉐이크를 합성한다", () => {
    expect(ACTION_IMPACT_LABELS_KO.impactFrame).toBe("타격 임팩트 프레임");

    const normalFlash = generateActionImpactFrame({
      width: 64,
      height: 64,
      impactCenter: { x: 32, y: 32 },
      innerClearRadiusPx: 9,
      outerBurstRadiusPx: 28,
      spikeCount: 20,
      debrisShardCount: 10,
      seed: 77,
    });
    const invertedFlash = generateActionImpactFrame({
      width: 64,
      height: 64,
      impactCenter: { x: 32, y: 32 },
      innerClearRadiusPx: 9,
      outerBurstRadiusPx: 28,
      spikeCount: 20,
      debrisShardCount: 10,
      invertPolarity: true,
      seed: 77,
    });

    expect(normalFlash.spikes.length).toBe(20);
    expect(normalFlash.debrisShards.length).toBe(10);
    expect(normalFlash.whitePixelRatio + normalFlash.blackPixelRatio).toBeCloseTo(1, 6);
    expect(normalFlash.whitePixelRatio).toBeCloseTo(invertedFlash.blackPixelRatio, 6);

    // 모든 픽셀이 순수 흑(0) 또는 순수 백(255) 고대비 상태여야 한다.
    for (let i = 0; i < normalFlash.rgba.length; i += 4) {
      const r = normalFlash.rgba[i]!;
      expect(r === 0 || r === 255).toBe(true);
      expect(normalFlash.rgba[i + 1]).toBe(r);
      expect(normalFlash.rgba[i + 2]).toBe(r);
      expect(normalFlash.rgba[i + 3]).toBe(255);
    }

    const smear = generateSwingArcMotionSmear({
      pivot: { x: 100, y: 100 },
      startAngleRad: -Math.PI * 0.5,
      endAngleRad: Math.PI * 0.25,
      innerRadiusPx: 50,
      outerRadiusPx: 90,
      subdivisions: 20,
      nonLinearExponent: 2.4,
      trailingStreakCount: 4,
    });
    expect(smear.areaPx2).toBeGreaterThan(1200);
    expect(smear.trailingStreakPolygons.length).toBe(4);
    expect(smear.mainRibbonPolygon.length).toBe(41);

    const shake = generateDirectionalCameraShake({
      directionX: 3,
      directionY: -4,
      amplitudePx: 25,
      frequencyHz: 18,
      dampingRatio: 0.28,
      durationMs: 350,
      fps: 60,
      rollAmplitudeDeg: 2.5,
    });
    expect(shake.keyframes.length).toBeGreaterThan(15);
    expect(shake.peakDisplacementPx).toBeCloseTo(25, 4);
    // 첫 프레임 충격 방향이 입력 벡터 (0.6, -0.8)과 정렬되어야 한다.
    expect(shake.keyframes[0]!.offsetX).toBeCloseTo(15, 4);
    expect(shake.keyframes[0]!.offsetY).toBeCloseTo(-20, 4);
    // 마지막 프레임은 정확히 원점으로 수렴해야 한다.
    const lastKf = shake.keyframes[shake.keyframes.length - 1]!;
    expect(lastKf.offsetX).toBe(0);
    expect(lastKf.offsetY).toBe(0);
    expect(lastKf.rotationDeg).toBe(0);
  });

  it("브리드슨 포아송 디스크로 배경 군중을 겹침 없이 배치하고 깊이별 크기·탈채도를 자동 조정한다", () => {
    const crowd = scatterPerspectiveCrowdSilhouettes({
      canvasWidth: 800,
      canvasHeight: 600,
      horizonY: 220,
      worldHalfWidthM: 12,
      nearDepthM: 4,
      farDepthM: 36,
      minSpacingM: 2.2,
      maxExtras: 90,
      heightVariationM: 0,
      seed: 4242,
    });

    expect(crowd.extras.length).toBeGreaterThan(35);
    expect(crowd.minObservedWorldSpacingM).toBeGreaterThanOrEqual(2.2 - 1e-6);

    for (let i = 1; i < crowd.extras.length; i += 1) {
      const farther = crowd.extras[i - 1]!;
      const nearer = crowd.extras[i]!;
      expect(farther.worldZ).toBeGreaterThanOrEqual(nearer.worldZ);
      expect(farther.heightPx).toBeLessThanOrEqual(nearer.heightPx + 1e-6);
      expect(farther.aerialMix).toBeGreaterThanOrEqual(nearer.aerialMix - 1e-6);
      expect(farther.saturationScale).toBeLessThanOrEqual(nearer.saturationScale + 1e-6);
      expect(farther.silhouettePolygon.length).toBe(11);
    }
  });
});

describe("Wave 18 Cinema Polish — 한국어 운율 식자, 현미경 클리너, .tvani & SHA-256 CAS 동기화", () => {
  it("조합형(NFD) 한글 자모와 완성형 음절을 깨뜨리지 않고 5종 감정 운율로 조판한다", () => {
    // NFD 분해 자모: ᄒ+ᅡ+ᆫ(한) + ᄀ+ᅳ+ᆯ(글) + !
    const nfdText = "\u1112\u1161\u11ab\u1100\u1173\u11af!";
    const clusters = segmentKoreanSyllableClusters(nfdText);
    expect(clusters.length).toBe(3);
    expect(clusters[0]!.composedText).toBe("한");
    expect(clusters[0]!.codePointCount).toBe(3);
    expect(clusters[0]!.isHangulSyllable).toBe(true);
    expect(clusters[1]!.composedText).toBe("글");
    expect(clusters[2]!.composedText).toBe("!");

    const allTags: readonly ProsodyEmotionTag[] = [
      "shout",
      "whisper",
      "tremble",
      "icy-monologue",
      "joy-bounce",
    ];
    for (const tag of allTags) {
      expect(PROSODY_LABELS_KO[tag].length).toBeGreaterThan(2);
    }

    const shoutRun = shapeExpressiveKoreanLettering({
      text: "멈춰라 지금 당장",
      prosody: "shout",
      baseFontSizePx: 36,
      baseStrokeWeightPx: 2,
    });
    const whisperRun = shapeExpressiveKoreanLettering({
      text: "아무도 모르게",
      prosody: "whisper",
      baseFontSizePx: 36,
      baseStrokeWeightPx: 2,
    });
    const trembleRun = shapeExpressiveKoreanLettering({
      text: nfdText,
      prosody: "tremble",
      baseFontSizePx: 36,
      seed: 101,
    });
    const icyRun = shapeExpressiveKoreanLettering({
      text: "차갑게 식은 밤",
      prosody: "icy-monologue",
      baseFontSizePx: 36,
    });
    const joyRun = shapeExpressiveKoreanLettering({
      text: "드디어 해냈다",
      prosody: "joy-bounce",
      baseFontSizePx: 36,
    });

    const shoutVisible = shoutRun.clusters.filter((c) => !c.isWhitespace);
    expect(shoutVisible[shoutVisible.length - 1]!.scale).toBeGreaterThan(shoutVisible[0]!.scale);
    expect(shoutVisible[0]!.strokeWeightPx).toBeGreaterThan(2.5);

    const whisperVisible = whisperRun.clusters.filter((c) => !c.isWhitespace);
    expect(whisperVisible[0]!.scale).toBeLessThan(0.85);
    expect(whisperVisible[0]!.opacity).toBeLessThan(0.8);

    // NFD 입력에 공포 떨림(tremble)을 적용해도 음절 클러스터 개수는 그대로 3개다.
    expect(trembleRun.clusters.length).toBe(3);
    expect(trembleRun.clusters.some((c) => Math.abs(c.yOffsetPx) > 0.2)).toBe(true);

    const icyVisible = icyRun.clusters.filter((c) => !c.isWhitespace);
    expect(icyVisible.every((c) => c.yOffsetPx === 0 && c.rotationDeg === 0)).toBe(true);
    expect(icyVisible[0]!.trackingAfterPx).toBeGreaterThan(shoutVisible[0]!.trackingAfterPx);

    const joyVisible = joyRun.clusters.filter((c) => !c.isWhitespace);
    expect(joyVisible.some((c) => c.yOffsetPx < -2 && c.scale > 1.05)).toBe(true);
  });

  it("출고 전 1~3px 지우개 티끌, 선화 바깥 밑색 삐짐, 반투명 흰 후광을 단일 패스로 무손실 제거한다", () => {
    expect(MICROSCOPE_ANOMALY_LABELS_KO["eraser-dust"]).toBe("지우개 잔여 티끌");
    const width = 32;
    const height = 32;
    const linework = new Uint8Array(width * height * 4);
    const colorLayer = new Uint8Array(width * height * 4);

    // (10..20, 10..20) 닫힌 검정 선화 사각형과 내부 정상 살구색 밑색 채움
    for (let y = 10; y <= 20; y += 1) {
      for (let x = 10; x <= 20; x += 1) {
        const isBorder = x === 10 || x === 20 || y === 10 || y === 20;
        if (isBorder) {
          setPixel(linework, width, x, y, 18, 18, 22, 255);
        }
        setPixel(colorLayer, width, x, y, 235, 180, 155, 255);
      }
    }

    // 1) 1px 지우개 티끌 (2, 2) + 3px 대각선 8-연결 티끌 (28,3)-(29,4)-(30,5)
    setPixel(colorLayer, width, 2, 2, 45, 50, 60, 200);
    setPixel(colorLayer, width, 28, 3, 80, 80, 90, 255);
    setPixel(colorLayer, width, 29, 4, 80, 80, 90, 255);
    setPixel(colorLayer, width, 30, 5, 80, 80, 90, 255);

    // 2) 닫힌 선화 바깥 영역(4..6, 14..15)에 삐져나온 6px 밑색 섬
    for (let y = 14; y <= 15; y += 1) {
      for (let x = 4; x <= 6; x += 1) {
        setPixel(colorLayer, width, x, y, 235, 180, 155, 255);
      }
    }

    // 3) 채색 외곽(x=9, y=12..16)에 달라붙은 반투명 흰 테두리 후광(Alpha Halo)
    for (let y = 12; y <= 16; y += 1) {
      setPixel(colorLayer, width, 9, y, 248, 250, 252, 110);
    }

    const report = cleanStrayPixelsAndAlphaHalos({
      width,
      height,
      targetRgba: colorLayer,
      lineworkRgba: linework,
      maxDustAreaPx: 3,
      maxLeakAreaPx: 8,
    });

    expect(report.removedDustComponentCount).toBe(2);
    expect(report.removedLeakComponentCount).toBe(1);
    expect(report.cleanedHaloPixelCount).toBe(5);

    // 지우개 티끌과 선화 바깥 밑색 삐짐은 완전히 투명(alpha=0)해져야 한다.
    expect(report.cleanedRgba[(2 * width + 2) * 4 + 3]).toBe(0);
    expect(report.cleanedRgba[(4 * width + 29) * 4 + 3]).toBe(0);
    expect(report.cleanedRgba[(14 * width + 5) * 4 + 3]).toBe(0);

    // 인접 불투명 색과 맞닿은 흰 후광 픽셀은 내부 살구색(235, 180, 155)으로 오염 제거되어야 한다.
    const haloOff = (14 * width + 9) * 4;
    expect(report.cleanedRgba[haloOff]).toBe(235);
    expect(report.cleanedRgba[haloOff + 1]).toBe(180);
    expect(report.cleanedRgba[haloOff + 2]).toBe(155);
    expect(report.cleanedRgba[haloOff + 3]).toBe(110);

    // 닫힌 선화 안쪽의 정상 채색 픽셀은 비트 단위로 무손실 보존되어야 한다.
    const interiorOff = (15 * width + 15) * 4;
    expect(report.cleanedRgba[interiorOff]).toBe(235);
    expect(report.cleanedRgba[interiorOff + 1]).toBe(180);
    expect(report.cleanedRgba[interiorOff + 2]).toBe(155);
    expect(report.cleanedRgba[interiorOff + 3]).toBe(255);
  });

  it(".tvani 이진 벡터 애니메이션 코덱이 JSON 대비 85% 이상 용량을 줄이며 정확히 왕복 복원한다", () => {
    const keyframes = Array.from({ length: 32 }, (_, idx) => ({
      frame: idx * 3,
      values: [
        120 + idx * 1.25,
        240 - idx * 0.75,
        180 + Math.sin(idx * 0.3) * 12,
        310 + Math.cos(idx * 0.3) * 8,
        260,
        400,
      ],
      easing:
        idx % 4 === 0
          ? ({ kind: "cubic-bezier", x1: 0.24, y1: 0.1, x2: 0.25, y2: 1 } as const)
          : ({ kind: "ease-out" } as const),
    }));

    const clip: TvaniAnimationClip = {
      fps: 60,
      durationFrames: 96,
      canvasWidth: 1080,
      canvasHeight: 1920,
      quantScale: 100,
      tracks: [
        { layerKey: "hero_cape_spline", property: "pathMorph", keyframes },
        {
          layerKey: "hero_cape_spline",
          property: "opacity",
          keyframes: Array.from({ length: 24 }, (_, idx) => ({
            frame: idx * 4,
            values: [1 - idx * 0.02],
            easing: { kind: "linear" },
          })),
        },
      ],
    };

    const encoded = encodeTvaniBinary(clip);
    expect(Array.from(encoded.subarray(0, 5))).toEqual(Array.from(TVANI_MAGIC_BYTES));

    const stats = measureTvaniCompressionRatio(clip);
    expect(stats.savingsRatio).toBeGreaterThan(0.85);

    const decoded = decodeTvaniBinary(encoded);
    expect(decoded.fps).toBe(60);
    expect(decoded.durationFrames).toBe(96);
    expect(decoded.tracks.length).toBe(2);
    expect(decoded.tracks[0]!.keyframes.length).toBe(32);

    for (let k = 0; k < keyframes.length; k += 1) {
      const origKf = keyframes[k]!;
      const decKf = decoded.tracks[0]!.keyframes[k]!;
      expect(decKf.frame).toBe(origKf.frame);
      expect(decKf.easing.kind).toBe(origKf.easing.kind);
      for (let v = 0; v < origKf.values.length; v += 1) {
        expect(decKf.values[v]!).toBeCloseTo(origKf.values[v]!, 2);
      }
    }
  });

  it("표준 SHA-256 벡터를 만족하며 교차 플랫폼 CAS 청크 매니페스트를 비용 ₩0으로 무손실 동기화한다", () => {
    const enc = new TextEncoder();
    expect(computeSha256Hex(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(computeSha256Hex(enc.encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );

    const sharedBlock = new Uint8Array(2048);
    for (let i = 0; i < sharedBlock.length; i += 1) {
      sharedBlock[i] = ((i * 37) ^ ((i >>> 8) * 97 + 11)) & 0xff;
    }
    const updatedTail = new Uint8Array(512);
    for (let i = 0; i < updatedTail.length; i += 1) {
      updatedTail[i] = (i * 19 + 5) & 0xff;
    }

    const remoteEpisodeBytes = new Uint8Array(sharedBlock.length + updatedTail.length);
    remoteEpisodeBytes.set(sharedBlock, 0);
    remoteEpisodeBytes.set(updatedTail, sharedBlock.length);

    const localWeb = buildCasAssetManifest({
      platform: "web-opfs",
      chunkingMode: "fixed",
      targetChunkBytes: 512,
      assets: [{ assetPath: "episodes/ep01.tvani", bytes: sharedBlock }],
    });
    const remotePad = buildCasAssetManifest({
      platform: "tablet-ipad",
      chunkingMode: "fixed",
      targetChunkBytes: 512,
      assets: [
        { assetPath: "episodes/ep01.tvani", bytes: remoteEpisodeBytes },
        { assetPath: "episodes/ep01-backup.tvani", bytes: sharedBlock },
      ],
    });

    // 동일 청크는 저장소 안에서 자동 중복 제거되어야 한다.
    expect(remotePad.uniqueStoredBytes).toBeLessThan(remotePad.logicalTotalBytes);

    const plan = reconcileCasSyncPlan(localWeb, remotePad);
    expect(plan.estimatedServerCostKrw).toBe(0);
    expect(plan.reusedChunkHashes.length).toBe(4);
    expect(plan.missingChunkHashesToPull.length).toBe(1);
    expect(plan.deduplicatedSavedBytes).toBe(2048);
    expect(plan.pullTransferBytes).toBe(512);

    // 누락된 1개 청크만 병합해 전체 원격 파일을 바이트 단위로 무손실 재조립한다.
    const mergedChunks = new Map<string, Uint8Array>(localWeb.chunkStore);
    for (const hash of plan.missingChunkHashesToPull) {
      mergedChunks.set(hash, remotePad.chunkStore.get(hash)!);
    }
    const restored = reassembleCasAssetLossless(remotePad.entries[0]!, mergedChunks);
    expect(restored).toEqual(remoteEpisodeBytes);

    // 청크 1바이트 변조 시 즉시 무결성 예외를 발생시켜야 한다.
    const tamperedHash = plan.missingChunkHashesToPull[0]!;
    const tamperedCopy = new Uint8Array(mergedChunks.get(tamperedHash)!);
    tamperedCopy[0] ^= 0xff;
    mergedChunks.set(tamperedHash, tamperedCopy);
    expect(() => reassembleCasAssetLossless(remotePad.entries[0]!, mergedChunks)).toThrow(
      /CAS 무결성 오류/,
    );
  });

  it("롤링 CDC 청킹이 앞부분 바이트 삽입 이후에도 뒤쪽 공통 구간을 중복 제거하며 손상 헤더를 거부한다", () => {
    const body = new Uint8Array(4096);
    for (let i = 0; i < body.length; i += 1) {
      body[i] = ((i * 131) ^ (i >>> 5) * 43) & 0xff;
    }
    const prefixInserted = new Uint8Array(96 + body.length);
    prefixInserted.fill(0x5a, 0, 96);
    prefixInserted.set(body, 96);

    const desktopManifest = buildCasAssetManifest({
      platform: "desktop-macos",
      chunkingMode: "rolling-cdc",
      targetChunkBytes: 256,
      assets: [{ assetPath: "cuts/scene04.tvani", bytes: body }],
    });
    const windowsManifest = buildCasAssetManifest({
      platform: "desktop-windows",
      chunkingMode: "rolling-cdc",
      targetChunkBytes: 256,
      assets: [{ assetPath: "cuts/scene04.tvani", bytes: prefixInserted }],
    });

    const syncPlan = reconcileCasSyncPlan(desktopManifest, windowsManifest);
    expect(syncPlan.reusedChunkHashes.length).toBeGreaterThan(3);
    expect(syncPlan.deduplicatedSavedBytes).toBeGreaterThan(2000);
    expect(syncPlan.estimatedServerCostKrw).toBe(0);

    expect(() => decodeTvaniBinary(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]))).toThrow(
      /유효하지 않은 \.tvani 매직 헤더/,
    );
    expect(() => reflectPointAcrossPlane2D(10, 20, { a: 0, b: 0, c: 5 })).toThrow(
      /법선 벡터 길이/,
    );
  });
});
