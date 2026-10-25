import { describe, expect, it } from "vitest";

import {
  decodeMagmaBrushWireHeader,
  encodeMagmaBrushWireHeader,
  evaluateAnisotropicScatterOffset,
  evaluateKlekiChemyContour,
  evaluateMagmaDabDynamics,
  MagmaReservedStartBuffer,
  planKlekiSketchyStroke,
  STUDIO_MAGMA_BRUSH_PRESETS,
} from "../studio-magma-brush-engine";

describe("studio-magma-brush-engine (Magma Studio & Kleki 역공학 브러시 엔진)", () => {
  it("이방성 법선·접선 분리 분산(Anisotropic Normal/Tangent Spread)을 진행 방향 기준으로 정확히 투영한다", () => {
    // 가로 우측 방향 (0 라디안): 접선은 +X, 법선은 +Y
    const separateSample = evaluateAnisotropicScatterOffset(
      { normalSpread: 1.0, tangentSpread: 0.2, separateSpread: true },
      40,
      0,
      1.0, // uN - 0.5 = +0.5 -> +20px 법선(+Y)
      0.0, // uT - 0.5 = -0.5 -> -4px 접선(+X)
    );
    expect(separateSample.normalOffsetPx).toBeCloseTo(20, 5);
    expect(separateSample.tangentOffsetPx).toBeCloseTo(-4, 5);
    expect(separateSample.dx).toBeCloseTo(-4, 5);
    expect(separateSample.dy).toBeCloseTo(20, 5);

    // separateSpread === false 이면 tangentSpread 설정값 대신 normalSpread가 양축에 동일 적용
    const coupledSample = evaluateAnisotropicScatterOffset(
      { normalSpread: 0.5, tangentSpread: 2.0, separateSpread: false },
      40,
      Math.PI / 2, // +Y 진행: 접선 (0, 1), 법선 (-1, 0)
      1.0,
      1.0,
    );
    expect(coupledSample.normalOffsetPx).toBeCloseTo(10, 5);
    expect(coupledSample.tangentOffsetPx).toBeCloseTo(10, 5);
    expect(coupledSample.dx).toBeCloseTo(-10, 5);
    expect(coupledSample.dy).toBeCloseTo(10, 5);
  });

  it("첫 댑 방향 예약 버퍼(MagmaReservedStartBuffer)가 임계 이동 거리 전까지 첫 스탬프를 보류한 뒤 확정 각도로 방출한다", () => {
    const buffer = new MagmaReservedStartBuffer({
      sizePx: 20,
      spacingRatio: 0.5, // spacing = 10px, confirm threshold = 5px
      angleToDirection: true,
      angleInitialDirection: false,
      normalSpread: 0,
      tangentSpread: 0,
    });

    const startRes = buffer.start({ x: 100, y: 100, pressure01: 0.6, tilt01: 0.2 });
    expect(startRes.ready).toBe(false);
    expect(startRes.emittedSamples).toHaveLength(0);
    expect(buffer.isWaitingForDirection()).toBe(true);

    // 2px 미세 이동은 아직 방향 확정 임계값(5px) 미만이므로 대기 유지
    const tinyMove = buffer.move({ x: 102, y: 100, pressure01: 0.65, tilt01: 0.2 });
    expect(tinyMove.ready).toBe(false);
    expect(tinyMove.emittedSamples).toHaveLength(0);

    // +Y 방향으로 8px 이동 -> Math.PI / 2 방향으로 확정되며 첫 댑과 현재 댑이 함께 방출됨
    const confirmedMove = buffer.move({ x: 100, y: 108, pressure01: 0.7, tilt01: 0.2 });
    expect(confirmedMove.ready).toBe(true);
    expect(confirmedMove.initialDirectionRad).toBeCloseTo(Math.PI / 2, 4);
    expect(confirmedMove.emittedSamples).toHaveLength(2);
    expect(confirmedMove.emittedSamples[0]?.x).toBe(100);
    expect(confirmedMove.emittedSamples[0]?.y).toBe(100);
    expect(confirmedMove.emittedSamples[0]?.directionRad).toBeCloseTo(Math.PI / 2, 4);

    // 제자리 탭(점 찍기) 시 flushOnPointerUp으로 유실 없이 방출
    const tapBuffer = new MagmaReservedStartBuffer({
      sizePx: 20,
      spacingRatio: 0.5,
      angleToDirection: false,
      angleInitialDirection: true,
      normalSpread: 0,
      tangentSpread: 0,
    });
    tapBuffer.start({ x: 50, y: 60, pressure01: 0.8, tilt01: 0 });
    const flushed = tapBuffer.flushOnPointerUp(0.25);
    expect(flushed.ready).toBe(true);
    expect(flushed.emittedSamples).toHaveLength(1);
    expect(flushed.emittedSamples[0]?.directionRad).toBeCloseTo(0.25, 4);
  });

  it("기울기 폭 확장(maxSizeTilt > 1)·진원도 압축·패턴 블렌드 깊이 자동 반전·픽셀 아트 스냅을 정확히 계산한다", () => {
    const vinePreset = STUDIO_MAGMA_BRUSH_PRESETS.find(
      (p) => p.id === "magma-vine-charcoal-tilt",
    )!;
    const uprightDab = evaluateMagmaDabDynamics(vinePreset.config, {
      x: 120.3,
      y: 80.7,
      pressure01: 0.8,
      tilt01: 0, // 수직 세움
      directionRad: 0.4,
      initialDirectionRad: 0.4,
      foregroundColor: { r: 0.1, g: 0.1, b: 0.1 },
      backgroundColor: { r: 0.9, g: 0.9, b: 0.9 },
      seed: 42,
    });
    const tiltedDab = evaluateMagmaDabDynamics(vinePreset.config, {
      x: 120.3,
      y: 80.7,
      pressure01: 0.8,
      tilt01: 1, // 완전히 눕힘 -> maxSizeTilt(2.4)로 확장, roundnessTilt로 단축 압축
      directionRad: 0.4,
      initialDirectionRad: 0.4,
      foregroundColor: { r: 0.1, g: 0.1, b: 0.1 },
      backgroundColor: { r: 0.9, g: 0.9, b: 0.9 },
      seed: 42,
    });

    expect(tiltedDab.diameterPx).toBeGreaterThan(uprightDab.diameterPx * 2.0);
    expect(tiltedDab.roundness01).toBeLessThan(uprightDab.roundness01);
    expect(tiltedDab.patternInvertDepthOnTilt).toBe(true); // linear-height 모드
    expect(tiltedDab.asymmetricHardEdgeSide).toBe("left");

    // 픽셀 아트 브러시 검증 (정수 직경, 픽셀 중심 .5 스냅, 안티에일리어싱 해제)
    const pixelPreset = STUDIO_MAGMA_BRUSH_PRESETS.find(
      (p) => p.id === "magma-pixel-crisp-1px",
    )!;
    const pixelDab = evaluateMagmaDabDynamics(pixelPreset.config, {
      x: 14.83,
      y: 29.12,
      pressure01: 0.43,
      tilt01: 0.5,
      directionRad: 0,
      initialDirectionRad: 0,
      foregroundColor: { r: 1, g: 0, b: 0 },
      backgroundColor: { r: 0, g: 0, b: 1 },
      seed: 7,
    });
    expect(pixelDab.diameterPx).toBe(1);
    expect(pixelDab.x).toBe(14.5);
    expect(pixelDab.y).toBe(29.5);
    expect(pixelDab.antiAliased).toBe(false);
    expect(pixelDab.hardness01).toBe(1);
  });

  it("Magma 기본 14종 + 시그니처 프로 5종(총 19종) 브러시 프리셋과 2×32비트 와이어 코덱 왕복 무결성을 보장한다", () => {
    expect(STUDIO_MAGMA_BRUSH_PRESETS).toHaveLength(19);
    const builtInCount = STUDIO_MAGMA_BRUSH_PRESETS.filter(
      (p) => p.category === "built-in",
    ).length;
    const signatureCount = STUDIO_MAGMA_BRUSH_PRESETS.filter(
      (p) => p.category === "signature-pro",
    ).length;
    expect(builtInCount).toBe(14);
    expect(signatureCount).toBe(5);

    for (const preset of STUDIO_MAGMA_BRUSH_PRESETS) {
      const encoded = encodeMagmaBrushWireHeader(preset.config);
      expect(encoded.compressionRatioVsJson).toBeGreaterThan(15);
      const decoded = decodeMagmaBrushWireHeader(encoded);
      expect(decoded.sizePx).toBeCloseTo(preset.config.sizePx, 2);
      expect(decoded.hardness).toBeCloseTo(preset.config.hardness, 2);
      expect(decoded.pixelation).toBe(preset.config.pixelation);
      expect(decoded.patternBlendMode).toBe(preset.config.patternBlendMode);
      expect(decoded.spread?.normalSpread).toBeCloseTo(
        preset.config.spread.normalSpread,
        2,
      );
    }
  });

  it("Kleki 시그니처 Sketchy(과거 궤적 거미줄 연결) 및 Chemy(방향 적응 그라데이션 & 4분면 대칭)를 결정론적으로 생성한다", () => {
    const circlePoints = Array.from({ length: 24 }, (_, idx) => {
      const t = (idx / 12) * Math.PI;
      return {
        x: 100 + Math.cos(t) * 8,
        y: 100 + Math.sin(t) * 8,
        pressure01: 0.75,
      };
    });

    const sketchyA = planKlekiSketchyStroke({
      points: circlePoints,
      sizePx: 6,
      opacity01: 0.8,
      connectRadiusMultiplier: 4,
      connectionProbability01: 0.5,
      seed: 99,
    });
    const sketchyB = planKlekiSketchyStroke({
      points: circlePoints,
      sizePx: 6,
      opacity01: 0.8,
      connectRadiusMultiplier: 4,
      connectionProbability01: 0.5,
      seed: 99,
    });
    expect(sketchyA).toEqual(sketchyB);
    expect(sketchyA.some((s) => s.kind === "spine")).toBe(true);
    expect(sketchyA.some((s) => s.kind === "web-link")).toBe(true);

    // Chemy: 오른쪽에서 왼쪽으로 그리면(first.x > last.x) 그라데이션 상하 반전
    const chemyRtl = evaluateKlekiChemyContour({
      points: [
        { x: 180, y: 40 },
        { x: 140, y: 90 },
        { x: 110, y: 60 },
      ],
      mode: "fill-and-stroke",
      distortPx: 0,
      symmetry: "quadrant",
      symmetryCenterX: 100,
      symmetryCenterY: 100,
      gradientEnabled: true,
    });
    expect(chemyRtl.isGradientInverted).toBe(true);
    expect(chemyRtl.gradientStartY).toBe(90);
    expect(chemyRtl.gradientEndY).toBe(40);
    expect(chemyRtl.polygons).toHaveLength(4);
  });
});
