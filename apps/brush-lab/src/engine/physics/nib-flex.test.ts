import { describe, expect, it } from "vitest";

import { Pcg32 } from "../core/rng";

import {
  MANGA_NIB_PERSONALITY_PROFILES,
  createNibFlexState,
  evaluateDipPenRailroadingProfile,
  evaluateDipPenReservoirFlow,
  nibTarget,
  stepNibFlex,
} from "./nib-flex";
import { DEFAULT_NIB_SPEC } from "./physics-model";

import type { NibSpec } from "./physics-model";

const DT = 1000 / 240;

function stepResponse(spec: NibSpec, pressure: number, ms: number): number[] {
  const state = createNibFlexState(spec, 0);
  const out: number[] = [];
  for (let t = 0; t < ms; t += DT) out.push(stepNibFlex(state, { pressure }, DT, spec).nibGap);
  return out;
}

describe("닙 2차계", () => {
  it("임계 감쇠(ζ=1) 계단 응답: 오버슈트 ≤ 1%, 정착 ≤ 60 ms", () => {
    const spec: NibSpec = { ...DEFAULT_NIB_SPEC, stiffness: 180, damping: 1 };
    const target = nibTarget(1, spec);
    const gaps = stepResponse(spec, 1, 200);
    const peak = Math.max(...gaps);
    expect(peak).toBeLessThanOrEqual(target * 1.01);
    const settleIndex = gaps.findIndex((g, i) => gaps.slice(i).every((v) => Math.abs(v - target) <= 0.02 * target));
    expect(settleIndex).toBeGreaterThanOrEqual(0);
    expect(settleIndex * DT).toBeLessThanOrEqual(60);
  });

  it("G펜(ζ=0.65) 계단 응답 오버슈트는 4–10% 범위", () => {
    const spec: NibSpec = { ...DEFAULT_NIB_SPEC, stiffness: 180, damping: 0.65 };
    const target = nibTarget(1, spec);
    const peak = Math.max(...stepResponse(spec, 1, 200));
    const overshoot = peak / target - 1;
    expect(overshoot).toBeGreaterThan(0.04);
    expect(overshoot).toBeLessThan(0.1);
  });

  it("임계 압력 아래에서는 gap 0, 폭 = baseWidth", () => {
    const spec: NibSpec = { ...DEFAULT_NIB_SPEC, threshold: 0.05, baseWidth: 0.6 };
    const state = createNibFlexState(spec, 0.03);
    for (let i = 0; i < 100; i += 1) {
      const out = stepNibFlex(state, { pressure: 0.03 }, DT, spec);
      expect(out.nibGap).toBe(0);
      expect(out.rx).toBeCloseTo(0.3, 6);
    }
    expect(nibTarget(0.05, spec)).toBe(0);
    expect(nibTarget(1.05, spec)).toBe(spec.gapMax);
  });

  it("획 시작 압력으로 초기화하면 첫 틱부터 정상 상태다", () => {
    const spec = DEFAULT_NIB_SPEC;
    const state = createNibFlexState(spec, 0.5);
    const out = stepNibFlex(state, { pressure: 0.5 }, DT, spec);
    expect(out.nibGap).toBeCloseTo(nibTarget(0.5, spec), 5);
  });

  it("dt 가변(1..30 ms)에서도 발산하지 않고 gapMax를 넘지 않는다", () => {
    const spec: NibSpec = { ...DEFAULT_NIB_SPEC, stiffness: 320, damping: 0.9, gapMax: 2 };
    const state = createNibFlexState(spec, 0);
    const rng = new Pcg32(3, 3);
    for (let i = 0; i < 2000; i += 1) {
      const dt = 1 + rng.nextF32() * 29;
      const p = rng.nextF32();
      const out = stepNibFlex(state, { pressure: p }, dt, spec);
      expect(Number.isFinite(out.nibGap)).toBe(true);
      expect(out.nibGap).toBeGreaterThanOrEqual(0);
      expect(out.nibGap).toBeLessThanOrEqual(spec.gapMax * 1.15);
    }
  });

  it("폭 = baseWidth + gap·widthGain, ry = 폭·aspect/2", () => {
    const spec: NibSpec = { ...DEFAULT_NIB_SPEC, baseWidth: 1, widthGain: 2, aspect: 0.5 };
    const state = createNibFlexState(spec, 1);
    const out = stepNibFlex(state, { pressure: 1 }, DT, spec);
    const width = 1 + out.nibGap * 2;
    expect(out.rx).toBeCloseTo(width / 2, 5);
    expect(out.ry).toBeCloseTo((width * 0.5) / 2, 5);
  });

  it("5종 만화 딥펜 프로파일이 고유한 탄성·선폭 개성을 가지며 철길 갈라짐과 잉크 소모를 재현한다", () => {
    const gPen = MANGA_NIB_PERSONALITY_PROFILES["g-pen"];
    const maruPen = MANGA_NIB_PERSONALITY_PROFILES["maru-pen"];
    const kaburaPen = MANGA_NIB_PERSONALITY_PROFILES["kabura-pen"];
    expect(gPen.spec.gapMax).toBeGreaterThan(maruPen.spec.gapMax * 2.5);
    expect(maruPen.spec.stiffness).toBeGreaterThan(gPen.spec.stiffness);
    expect(kaburaPen.spec.damping).toBeGreaterThan(gPen.spec.damping);

    // 과압 시 철길 현상(Railroading): 외곽 트랙 알파가 중심 알파보다 진해진다
    const intact = evaluateDipPenRailroadingProfile(1.5, 6.5, 0.72, 0);
    const splitCenter = evaluateDipPenRailroadingProfile(6.2, 6.5, 0.72, 0);
    const splitRidge = evaluateDipPenRailroadingProfile(6.2, 6.5, 0.72, 0.72);
    expect(intact.splitRatio).toBe(0);
    expect(splitCenter.splitRatio).toBeGreaterThan(0.75);
    expect(splitRidge.crossSectionAlpha).toBeGreaterThan(splitCenter.crossSectionAlpha);

    // 연속 장거리 드로잉 시 잉크 저장소 완만 감쇠
    const fresh = evaluateDipPenReservoirFlow(20, gPen.reservoirCapacityPx, 0.7);
    const depleted = evaluateDipPenReservoirFlow(1800, gPen.reservoirCapacityPx, 0.7);
    expect(fresh.inkRemainingRatio).toBeGreaterThan(depleted.inkRemainingRatio);
    expect(fresh.flowScale).toBeGreaterThan(depleted.flowScale);
    expect(fresh.widthScale).toBeGreaterThan(depleted.widthScale);
  });
});

