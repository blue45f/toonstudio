import { describe, expect, it } from "vitest";

import {
  BRUSH_QUALITY_12_FAMILIES,
  BRUSH_QUALITY_FAMILY_SPECS,
  BRUSH_SOAK_DEFAULT_MAX_DABS_PER_STEP,
  BRUSH_SOAK_DEFAULT_MAX_HISTORY,
  createBrushStrokeSoakGuard,
  evaluateCrayonWaxPaperTexel,
  renderBrushFamilyStampBuffer,
  synthesizeCrayonWaxPaperStamp,
} from "./brush-quality-soak-guard";

function computeBufferStats(buffer: Float32Array, size: number): {
  mean: number;
  stdDev: number;
  activeCount: number;
} {
  let sum = 0;
  let sumSq = 0;
  let activeCount = 0;
  for (let i = 0; i < size * size; i += 1) {
    const a = buffer[i] ?? 0;
    if (a > 0.02) {
      sum += a;
      sumSq += a * a;
      activeCount += 1;
    }
  }
  const mean = activeCount > 0 ? sum / activeCount : 0;
  const variance = activeCount > 0 ? Math.max(0, sumSq / activeCount - mean * mean) : 0;
  return { mean, stdDev: Math.sqrt(variance), activeCount };
}

describe("brush-quality-soak-guard (12종 전 브러시 질감·성능·필기감 가드)", () => {
  it("Krita + CSP 기준 12종 전 브러시 패밀리 스펙이 단조 필압·최소 간격·가시 알파 불변식을 지킨다", () => {
    expect(BRUSH_QUALITY_12_FAMILIES).toHaveLength(12);
    for (const familyId of BRUSH_QUALITY_12_FAMILIES) {
      const spec = BRUSH_QUALITY_FAMILY_SPECS[familyId];
      expect(spec.pressureSizeRange[0]).toBeLessThan(spec.pressureSizeRange[1]);
      expect(spec.pressureOpacityRange[0]).toBeLessThan(spec.pressureOpacityRange[1]);
      expect(spec.minSpacingRatio).toBeGreaterThanOrEqual(0.08);
      expect(spec.minVisibleAlpha).toBeGreaterThan(0.05);
      expect(spec.tiltWidthExpandMax).toBeGreaterThan(1.1);
    }
  });

  it("크레용 다층 왁스-종이 요철 합성기가 저필압 갈필 스킵·고필압 불투명 누적·가장자리 부스러기를 실측 생성한다", () => {
    const low = synthesizeCrayonWaxPaperStamp({
      size: 64,
      pressure01: 0.16,
      velocity01: 0.55,
      tilt01: 0.35,
      directionRadians: 0.2,
      seed: 2026,
    });
    const high = synthesizeCrayonWaxPaperStamp({
      size: 64,
      pressure01: 0.95,
      velocity01: 0.15,
      tilt01: 0.35,
      directionRadians: 0.2,
      seed: 2026,
    });
    const lowStats = computeBufferStats(low.buffer, 64);
    const highStats = computeBufferStats(high.buffer, 64);

    // 저필압에서 종이 산/골 대비와 갈필 스킵이 뚜렷하고, 고필압에서 불투명 왁스 누적이 크게 오른다
    expect(low.drySkipFraction).toBeGreaterThan(0.2);
    expect(low.peakContrast).toBeGreaterThan(0.25);
    expect(low.crumbCount).toBeGreaterThanOrEqual(8);
    expect(highStats.mean).toBeGreaterThan(lowStats.mean * 1.45);
    expect(high.drySkipFraction).toBeLessThan(low.drySkipFraction * 0.4);
    expect(lowStats.stdDev).toBeGreaterThan(0.14);

    // 재사용 타깃 버퍼를 전달하면 힙 재할당 없이 동일 버퍼를 재사용한다
    const scratch = new Float32Array(64 * 64);
    const reused = synthesizeCrayonWaxPaperStamp({ size: 64, pressure01: 0.6, seed: 7 }, scratch);
    expect(reused.reusedBuffer).toBe(true);
    expect(reused.buffer).toBe(scratch);
  });

  it("evaluateCrayonWaxPaperTexel은 NaN 입력에도 유한값만 반환한다", () => {
    const sample = evaluateCrayonWaxPaperTexel({
      worldX: Number.NaN,
      worldY: Number.POSITIVE_INFINITY,
      normalizedX: Number.NaN,
      normalizedY: 0,
      pressure01: Number.NaN,
    });
    expect(Number.isFinite(sample.alpha)).toBe(true);
    expect(Number.isFinite(sample.paperPeak)).toBe(true);
    expect(Number.isFinite(sample.drySkip01)).toBe(true);
  });

  it("12종 전 브러시 스탬프 렌더러가 재사용 버퍼로 서로 구분되는 비-평면 픽셀 구조를 생성한다", () => {
    const scratch = new Float32Array(64 * 64);
    for (const familyId of BRUSH_QUALITY_12_FAMILIES) {
      const rendered = renderBrushFamilyStampBuffer(
        { familyId, size: 64, pressure01: 0.72, velocity01: 0.3, tilt01: 0.4, seed: 42 },
        scratch,
      );
      expect(rendered.reusedBuffer).toBe(true);
      const stats = computeBufferStats(rendered.buffer, 64);
      expect(stats.activeCount, familyId).toBeGreaterThan(80);
      expect(stats.mean, familyId).toBeGreaterThan(0.15);
    }
  });

  it("10,000 포인트 연속 획에서 히스토리·버퍼·스탬프 버짓이 고정 상한을 지키고 입력 누락과 NaN이 0건이다", () => {
    for (const familyId of BRUSH_QUALITY_12_FAMILIES) {
      const guard = createBrushStrokeSoakGuard({ familyId, baseSizePx: 18 });
      for (let i = 0; i < 10_000; i += 1) {
        guard.push({
          x: 16 + i * 2.4,
          y: 120 + Math.sin(i * 0.05) * 32,
          pressure01: 0.12 + 0.84 * (0.5 + 0.5 * Math.sin(i * 0.02)),
          tilt01: 0.35,
          timestampMs: i * 4,
        });
      }
      guard.finish();
      const diag = guard.getDiagnostics();
      expect(diag.processedPoints, familyId).toBe(10_000);
      expect(diag.emittedDabs, familyId).toBeGreaterThan(5_000);
      expect(diag.nanOutputCount, familyId).toBe(0);
      expect(diag.droppedStrokeCount, familyId).toBe(0);
      expect(diag.retainedHistoryPoints, familyId).toBeLessThanOrEqual(BRUSH_SOAK_DEFAULT_MAX_HISTORY);
      expect(diag.maxDabsInSingleStep, familyId).toBeLessThanOrEqual(BRUSH_SOAK_DEFAULT_MAX_DABS_PER_STEP);
      expect(diag.peakRetainedBytes, familyId).toBeLessThanOrEqual(65_536);
      expect(diag.scratchPoolReuseCount, familyId).toBeGreaterThan(1_000);
    }
  });

  it("초저필압(0.0)·마이크로 탭·고속 스냅·NaN 좌표 주입에서도 데드 스트로크 0건과 NaN 0건을 유지한다", () => {
    for (const familyId of BRUSH_QUALITY_12_FAMILIES) {
      // 1) 단일 포인트 마이크로 탭 (pressure 0)
      const tap = createBrushStrokeSoakGuard({ familyId, baseSizePx: 16 });
      tap.push({ x: 40, y: 50, pressure01: 0, timestampMs: 0 });
      tap.finish();
      expect(tap.getDiagnostics().emittedDabs, `${familyId}:tap`).toBeGreaterThanOrEqual(1);
      expect(tap.getDiagnostics().nanOutputCount, `${familyId}:tap`).toBe(0);

      // 2) 고속 스냅 + NaN 혼입
      const snap = createBrushStrokeSoakGuard({ familyId, baseSizePx: 16 });
      snap.push({ x: 10, y: 10, pressure01: 0.7, timestampMs: 0 });
      snap.push({ x: Number.NaN, y: Number.POSITIVE_INFINITY, pressure01: Number.NaN, timestampMs: 4 });
      snap.push({ x: 320, y: 40, pressure01: 0.01, timestampMs: 8 });
      snap.finish();
      const diag = snap.getDiagnostics();
      expect(diag.emittedDabs, `${familyId}:snap`).toBeGreaterThanOrEqual(3);
      expect(diag.sanitizedInputs, `${familyId}:snap`).toBeGreaterThanOrEqual(1);
      expect(diag.nanOutputCount, `${familyId}:snap`).toBe(0);
    }
  });
});
