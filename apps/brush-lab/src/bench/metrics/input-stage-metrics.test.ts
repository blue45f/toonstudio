import { beforeAll, describe, expect, it } from "vitest";

import { applyStrokeStream } from "../../engine/input/stages/chain";
import { createCornerGateStage } from "../../engine/input/stages/corner-gate";
import { createLazyBrushStage } from "../../engine/input/stages/lazy-brush";
import { createPenSpringStage } from "../../engine/input/stages/pen-spring";
import { buildFixture } from "../fixtures/stroke-fixtures";

import { measureStageCase } from "./input-stage-metrics";

import type { InputStageCase, InputStageMeasurement } from "./input-stage-metrics";
import type { FixtureId } from "../fixtures/stroke-fixtures";

/**
 * 입력 단계 비교 측정(SP-C 표 재현)을 임계 테스트로 굳힌다. 값은 Node 22 단일 스레드 직접 계산이며 결정적이다
 * (같은 코드·같은 입력이면 같은 값). 임계는 측정값에 여유를 둔 값이고 측정값은 각 단언 옆 주석에 적었다(2026-10-08, pencil-hb CPU 참조).
 *
 * 코너 편차 지표(`handfeel.cornerDeviationPx`)의 정의·임계(1.5 px)는 바꾸지 않았다. 128²는 fixture 속도가 1/4이라
 * 입력 지연을 과소평가하고(설계 기준은 512²), pencil-hb 선폭이 2 px 안팎이라 서브픽셀 잡음이 ±0.3 px다.
 */

const pen = (lagMs: number, zeta: number): (() => ReturnType<typeof createPenSpringStage>) => () => createPenSpringStage({ lagMs, zeta });
const lazy = (radiusPx: number, catchUp = true): (() => ReturnType<typeof createLazyBrushStage>) => () =>
  createLazyBrushStage({ radiusPx, catchUp });

const CASES: Record<string, InputStageCase> = {
  passthrough: { id: "passthrough", label: "통과(보정 끔)", makeStage: () => null, engine: "raw" },
  sumiDefault: { id: "sumi-default", label: "Sumi 1€ 기본+정점 재방출", makeStage: () => null, engine: "preset" },
  sumi0: { id: "sumi-s0", label: "Sumi 1€ 슬라이더 0", makeStage: () => null, engine: { pct: 0 } },
  sumi50: { id: "sumi-s50", label: "Sumi 1€ 슬라이더 50", makeStage: () => null, engine: { pct: 50 } },
  sumi100: { id: "sumi-s100", label: "Sumi 1€ 슬라이더 100", makeStage: () => null, engine: { pct: 100 } },
  lazyBare: { id: "lazy12", label: "끈 당김 12 px(게이트 없음)", makeStage: lazy(12), engine: "raw" },
  lazyNoCatchUp: { id: "lazy12-gate-nocatch", label: "끈 당김 12 px+게이트, catch-up 없음", makeStage: () => createCornerGateStage(lazy(12, false)()), engine: "raw" },
  lazyGate: { id: "lazy12-gate", label: "끈 당김 12 px+게이트+catch-up", makeStage: () => createCornerGateStage(lazy(12)()), engine: "raw" },
  penLow: { id: "pen15-z055-gate", label: "물리 펜 지연 15 ms ζ=0.55+게이트", makeStage: () => createCornerGateStage(pen(15, 0.55)()), engine: "raw" },
  penBare: { id: "pen15-z1", label: "물리 펜 지연 15 ms ζ=1(게이트 없음)", makeStage: pen(15, 1), engine: "raw" },
  pen1: { id: "pen15-z1-gate", label: "물리 펜 지연 15 ms ζ=1+게이트", makeStage: () => createCornerGateStage(pen(15, 1)()), engine: "raw" },
  pen15: { id: "pen15-z1.5-gate", label: "물리 펜 지연 15 ms ζ=1.5+게이트", makeStage: () => createCornerGateStage(pen(15, 1.5)()), engine: "raw" },
  pen2: { id: "pen15-z2-gate", label: "물리 펜 지연 15 ms ζ=2+게이트", makeStage: () => createCornerGateStage(pen(15, 2)()), engine: "raw" },
  pen3: { id: "pen15-z3-gate", label: "물리 펜 지연 15 ms ζ=3+게이트", makeStage: () => createCornerGateStage(pen(15, 3)()), engine: "raw" },
};

const M: Record<string, InputStageMeasurement> = {};

beforeAll(() => {
  for (const [key, c] of Object.entries(CASES)) M[key] = measureStageCase(c);
}, 120_000);

function m(key: string): InputStageMeasurement {
  const v = M[key];
  if (!v) throw new Error(`측정 없음: ${key}`);
  return v;
}

describe("입력 단계 비교(코너 편차·지터·지연·오버슈트·길이·형상)", () => {
  it("기준선: 통과(보정 끔)는 지그재그 편차 128² ≈ 1.24 / 512² ≈ 1.04 px로 임계 1.5 px 안이고 손떨림이 그대로 남는다", () => {
    const p = m("passthrough");
    expect(p.zigzag128Px).toBeLessThanOrEqual(1.5); // 실측 1.24
    expect(p.zigzag512Px).toBeLessThanOrEqual(1.5); // 실측 1.04
    expect(p.flickOvershootPx).toBeLessThanOrEqual(0.5); // 실측 0
    expect(p.jitterPx).toBeGreaterThan(0.6); // 실측 0.874 (raw 손떨림)
    expect(p.lagMs).toBeLessThan(3); // 실측 1.4
  });

  it("Sumi 1€ + 정점 재방출(수정안 A): 지그재그 128² 1.26 / 512² 0.97 px로 임계 이내이고 오버슈트가 없으며 지터를 줄인다", () => {
    const s = m("sumiDefault");
    expect(s.zigzag128Px).toBeLessThanOrEqual(1.5); // 실측 1.26 (수정 전 2.55)
    expect(s.zigzag512Px).toBeLessThanOrEqual(1.5); // 실측 0.97 (수정 전 6.16)
    expect(s.zigzag512OvershootPx ?? 0).toBeLessThanOrEqual(0.5); // 실측 0
    expect(s.flickOvershootPx).toBeLessThanOrEqual(0.5); // 실측 0
    expect(s.jitterPx).toBeLessThan((m("passthrough").jitterPx ?? 0) * 0.5); // 실측 0.213 vs 0.874
  });

  it("안정화 슬라이더(로그 매핑)를 올리면 지터는 단조 감소하고 지연은 단조 증가하며, 지그재그 편차는 모든 값에서 1.5 px 이내다", () => {
    const [s0, s50, s100] = [m("sumi0"), m("sumi50"), m("sumi100")];
    expect(s0.jitterPx ?? 0).toBeGreaterThan(s50.jitterPx ?? 0);
    expect(s50.jitterPx ?? 0).toBeGreaterThan(s100.jitterPx ?? 0); // 실측 0.874 → 0.486 → 0.077
    expect(s0.lagMs).toBeLessThan(s50.lagMs);
    expect(s50.lagMs).toBeLessThan(s100.lagMs); // 실측 1.4 → 4.6 → 11.8 ms
    for (const s of [s0, s50, s100]) {
      expect(s.zigzag128Px).toBeLessThanOrEqual(1.5);
      expect(s.zigzag512Px).toBeLessThanOrEqual(1.5);
    }
    // s=0은 raw 수준: 지터가 통과 단계와 같다(같은 설정).
    expect(s0.jitterPx).toBeCloseTo(m("passthrough").jitterPx ?? 0, 9);
  });

  it("끈 당김: 게이트 없이는 반경만큼 모서리를 깎고(편차 10 px 안팎), 코너 게이트가 1.5 px 안으로 되돌린다", () => {
    expect(m("lazyBare").zigzag128Px).toBeGreaterThan(5); // 실측 10.75
    expect(m("lazyBare").zigzag512Px).toBeGreaterThan(5); // 실측 10.31
    const g = m("lazyGate");
    expect(g.zigzag128Px).toBeLessThanOrEqual(1.5); // 실측 1.18
    expect(g.zigzag512Px).toBeLessThanOrEqual(1.5); // 실측 0.85
    expect(g.zigzag512OvershootPx ?? 0).toBeLessThanOrEqual(0.5); // 실측 0
    expect(g.gateCorners).toBe(5); // 지그재그 512²의 안쪽 꼭짓점 5개를 모두 센다
    expect(g.jitterPx).toBeLessThan((m("passthrough").jitterPx ?? 0) * 0.3); // 실측 0.098: 끈이 손떨림을 흡수한다
  });

  it("끈 당김 획 끝 catch-up: 없으면 끝점이 반경(12 px)만큼 모자라고 길이가 줄지만, 있으면 끝점이 포인터 업 위치에 닿는다", () => {
    const withCatchUp = m("lazyGate");
    const without = m("lazyNoCatchUp");
    expect(withCatchUp.endGapPx).toBeLessThanOrEqual(0.05); // 실측 0
    expect(without.endGapPx).toBeGreaterThan(10); // 실측 12.00 = 반경
    expect(without.lengthRatio).toBeLessThan(withCatchUp.lengthRatio); // 실측 0.972 < 0.996
    expect(withCatchUp.lengthRatio).toBeGreaterThan(0.99);
  });

  it("물리 펜 ζ=0.55(저감쇠, SP-C 설정): 획 끝에서 목표를 넘고 정착이 길다 — ζ≥1이 이를 없앤다", () => {
    expect(m("penLow").flickOvershootPx).toBeGreaterThan(3); // 실측 10.7 px(512² flick)
    for (const k of ["pen1", "pen15", "pen2", "pen3"]) expect(m(k).flickOvershootPx).toBeLessThanOrEqual(0.5); // 실측 0
    expect(m("pen1").settleMs).toBeLessThan(m("penLow").settleMs); // 실측 83 < 175 ms
  });

  it("물리 펜 ζ≥1 + 코너 게이트: 지연이 요청값(15 ms)에 가깝고 끝점이 업 위치에 닿으며 지그재그 편차가 지표 임계 안이다", () => {
    const p = m("pen1");
    expect(p.lagMs).toBeGreaterThan(13); // 실측 16.4(엔진 raw 1€ 1.4 ms 포함)
    expect(p.lagMs).toBeLessThan(19);
    expect(p.endGapPx).toBeLessThanOrEqual(0.05); // 실측 0
    expect(p.zigzag512Px).toBeLessThanOrEqual(1.5); // 실측 1.19
    // 128²는 통과 바닥(1.24)보다 0.4 px 높은 1.67이다. pencil-hb 선폭이 2 px 안팎인 128²에서 서브픽셀 잡음(±0.3 px)이 있어 1.9 px로 여유를 둔다.
    expect(p.zigzag128Px).toBeLessThanOrEqual(1.9);
    expect(p.zigzag512OvershootPx ?? 0).toBeLessThanOrEqual(0.5); // 실측 0
    expect(p.gateCorners).toBe(5);
    expect(p.lengthRatio).toBeGreaterThan(0.99); // 실측 1.000
    expect(p.spiralRmsPx).toBeLessThan(1); // 실측 0.39
    for (const k of ["pen15", "pen2", "pen3"]) {
      expect(m(k).zigzag512Px).toBeLessThanOrEqual(1.5);
      expect(m(k).zigzag128Px).toBeLessThanOrEqual(1.9);
    }
  });

  it("물리 펜 게이트 없이는 지연 × 속도만큼 모서리를 깎는다(512² 편차 5 px 초과)", () => {
    expect(m("penBare").zigzag512Px).toBeGreaterThan(5); // 실측 10.36
  });

  it("기본 감쇠비 선택 근거: ζ≥1에서 오버슈트가 모두 0이고 정착 시간은 ζ=1이 가장 짧다(ζ가 클수록 늦게 멈춘다)", () => {
    const settle = ["pen1", "pen15", "pen2", "pen3"].map((k) => m(k).settleMs); // 실측 83 / 108 / 112 / 162 ms
    for (let i = 1; i < settle.length; i += 1) expect(settle[i] ?? 0).toBeGreaterThanOrEqual(settle[i - 1] ?? 0);
    expect(settle[0]).toBeLessThan(150);
  });

  it("코너 게이트는 모서리 없는 fixture(직선·곡선·나선·고속 획·손떨림·압력 램프·기울기 스윕)에서 모서리를 한 번도 세지 않는다", () => {
    const ids: FixtureId[] = ["line", "curve", "spiral", "fast-flick", "tremor", "slow-pressure-ramp", "tilt-sweep"];
    for (const id of ids) {
      for (const size of [128, 512]) {
        const fx = buildFixture(id, { width: size, height: size });
        const gate = createCornerGateStage(createLazyBrushStage({ radiusPx: 12 }));
        applyStrokeStream(gate, fx.samples.slice(0, -1));
        expect(gate.corners, `${id} ${size}²`).toBe(0);
      }
    }
  });

  it("측정은 결정적이다: 같은 경로를 두 번 재면 모든 값이 같다", () => {
    const again = measureStageCase(CASES.pen1 as InputStageCase);
    expect(again).toEqual(m("pen1"));
  });
});
