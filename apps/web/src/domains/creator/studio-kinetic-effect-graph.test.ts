import { describe, expect, it } from "vitest";

import {
  addKineticEffect,
  createStudioKineticEffectGraph,
  generateStaticEffectFallback,
  MAX_KINETIC_PARTICLES_PER_EFFECT,
  removeKineticEffect,
  sampleKineticParticlesAtTime,
  validateKineticEffectInstance,
  type KineticEffectInstance,
} from "./studio-kinetic-effect-graph";

describe("Studio Kinetic Effect Graph", () => {
  const rainEffect: KineticEffectInstance = {
    id: "eff_rain_1",
    panelId: "panel_1",
    seed: 42,
    loopPeriodMs: 2000,
    bounds: { x: 0, y: 0, width: 800, height: 1200 },
    effect: {
      type: "rain",
      params: {
        speedPxPerSec: 500,
        angleDeg: 15,
        density: 0.8,
        streakLengthPx: 40,
      },
    },
  };

  const petalsEffect: KineticEffectInstance = {
    id: "eff_petals_1",
    panelId: "panel_2",
    seed: 123,
    loopPeriodMs: 3000,
    bounds: { x: 0, y: 0, width: 800, height: 1200 },
    effect: {
      type: "petals",
      params: {
        count: 20,
        windVelocityX: 100,
        windVelocityY: 150,
        flutterFrequencyHz: 2,
      },
    },
  };

  it("creates and manages effects in kinetic graph", () => {
    let graph = createStudioKineticEffectGraph({ id: "kg_1", episodeId: "ep_1" });
    expect(graph.effects).toHaveLength(0);

    graph = addKineticEffect(graph, rainEffect);
    expect(graph.effects).toHaveLength(1);

    graph = addKineticEffect(graph, petalsEffect);
    expect(graph.effects).toHaveLength(2);

    graph = removeKineticEffect(graph, "eff_rain_1");
    expect(graph.effects).toHaveLength(1);
    expect(graph.effects[0].id).toBe("eff_petals_1");
  });

  it("samples rain particles deterministically across time", () => {
    const pT0 = sampleKineticParticlesAtTime(rainEffect, 0);
    const pT500 = sampleKineticParticlesAtTime(rainEffect, 500);
    const pT2000 = sampleKineticParticlesAtTime(rainEffect, 2000); // 1 full loop

    expect(pT0.length).toBeGreaterThan(0);
    expect(pT0.length).toBe(pT500.length);

    // Positions change across time
    expect(pT0[0].y).not.toBe(pT500[0].y);

    // Loop period is 2000ms -> t=2000 should wrap around exactly to t=0
    expect(pT2000[0].y).toBeCloseTo(pT0[0].y, 3);
  });

  it("samples petals particles with fluttering", () => {
    const petals = sampleKineticParticlesAtTime(petalsEffect, 500);
    expect(petals).toHaveLength(20);
    expect(petals[0].scale).toBeGreaterThan(0.5);
    expect(petals[0].angleDeg).toBeDefined();
  });

  it("generates static effect fallback snapshot for print/PDF export", () => {
    const fallback = generateStaticEffectFallback(rainEffect);
    expect(fallback.particleSnapshot.length).toBeGreaterThan(0);
    expect(fallback.description).toContain("정적 렌더링용");
  });
});

// ---------------------------------------------------------------------------
// 파라미터 검증 확장 (2026-10-15): 경계값·NaN/Infinity·음수·잘못된 타입·연결 오류.
// 기존에는 검증이 전혀 없어 잘못된 값이 NaN 좌표·범위 밖 파티클로 조용히
// 새어 나갔다. 이제 생성·추가·샘플링 전 구간에서 validateKineticEffectInstance가
// 문서화된 범위(0..1 비율, 양의 주기·bounds, 정수 count 상한)를 강제한다.
// ---------------------------------------------------------------------------

const rainWith = (params: Record<string, unknown> = {}, inst: Record<string, unknown> = {}): KineticEffectInstance =>
  ({
    id: "rain-x",
    panelId: "panel_x",
    seed: 42,
    loopPeriodMs: 2000,
    bounds: { x: 0, y: 0, width: 800, height: 1200 },
    effect: {
      type: "rain",
      params: { speedPxPerSec: 500, angleDeg: 15, density: 0.8, streakLengthPx: 40, ...params },
    },
    ...inst,
  }) as KineticEffectInstance;

const petalsWith = (params: Record<string, unknown> = {}, inst: Record<string, unknown> = {}): KineticEffectInstance =>
  ({
    id: "petals-x",
    panelId: "panel_x",
    seed: 123,
    loopPeriodMs: 3000,
    bounds: { x: 0, y: 0, width: 800, height: 1200 },
    effect: {
      type: "petals",
      params: { count: 20, windVelocityX: 100, windVelocityY: 150, flutterFrequencyHz: 2, ...params },
    },
    ...inst,
  }) as KineticEffectInstance;

describe("파라미터 검증 확장 — 그래프 생성·추가", () => {
  it.each([
    [{ id: "", episodeId: "ep" }],
    [{ id: "   ", episodeId: "ep" }],
    [{ id: "kg", episodeId: "" }],
    [{ id: "kg", episodeId: "  " }],
    [{ id: 42, episodeId: "ep" }],
  ])("create %j 는 거부된다", (params) => {
    expect(() => createStudioKineticEffectGraph(params as never)).toThrow(/required/u);
  });

  it("create는 id를 trim해 저장한다", () => {
    const created = createStudioKineticEffectGraph({ id: "  kg_9 ", episodeId: " ep_9 " });
    expect(created.id).toBe("kg_9");
    expect(created.episodeId).toBe("ep_9");
  });

  it("create 초기 effects 안의 중복 id와 잘못된 인스턴스는 거부된다", () => {
    expect(() =>
      createStudioKineticEffectGraph({ id: "kg", episodeId: "ep", effects: [rainWith(), rainWith()] }),
    ).toThrow(/already exists/u);
    expect(() =>
      createStudioKineticEffectGraph({ id: "kg", episodeId: "ep", effects: [rainWith({ density: 2 })] }),
    ).toThrow(/density/u);
  });

  it("add는 잘못된 파라미터의 효과를 거부하고, 중복 id 오류 메시지는 유지된다", () => {
    const empty = createStudioKineticEffectGraph({ id: "kg", episodeId: "ep" });
    expect(() => addKineticEffect(empty, rainWith({ density: Number.NaN }))).toThrow();
    const withOne = addKineticEffect(empty, rainWith());
    expect(() => addKineticEffect(withOne, rainWith())).toThrow(/already exists/u);
  });

  it("없는 id 제거는 조용한 no-op으로 길이가 유지된다", () => {
    const withOne = addKineticEffect(createStudioKineticEffectGraph({ id: "kg", episodeId: "ep" }), rainWith());
    const after = removeKineticEffect(withOne, "ghost");
    expect(after.effects).toHaveLength(1);
  });
});

describe("파라미터 검증 확장 — 공통 인스턴스 경계값", () => {
  it.each([0, -1, -2000, Number.NaN, Number.POSITIVE_INFINITY])("loopPeriodMs %s 는 거부된다", (loopPeriodMs) => {
    expect(() => validateKineticEffectInstance(rainWith({}, { loopPeriodMs }))).toThrow(/loopPeriodMs/u);
    expect(() => sampleKineticParticlesAtTime(rainWith({}, { loopPeriodMs }), 0)).toThrow(/loopPeriodMs/u);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, "42"])("seed %s 는 거부된다", (seed) => {
    expect(() => validateKineticEffectInstance(rainWith({}, { seed }))).toThrow(/seed/u);
  });

  it.each([
    [{ width: 0, height: 1200 }],
    [{ width: 800, height: 0 }],
    [{ width: -800, height: 1200 }],
    [{ width: 800, height: -1 }],
    [{ width: Number.NaN, height: 1200 }],
    [{ width: 800, height: Number.POSITIVE_INFINITY }],
  ])("bounds %j 는 거부된다", (size) => {
    expect(() =>
      validateKineticEffectInstance(rainWith({}, { bounds: { x: 0, y: 0, ...size } })),
    ).toThrow(/bounds/u);
  });

  it.each([
    [{ id: "" }],
    [{ id: " " }],
    [{ panelId: "" }],
    [{ isMasked: "yes" }],
    [{ bounds: null }],
    [{ effect: null }],
  ])("인스턴스 필드 %j 는 거부된다", (patch) => {
    expect(() => validateKineticEffectInstance(rainWith({}, patch))).toThrow();
  });

  it("음수 seed와 음수 bounds 원점도 유한하면 허용되고 샘플은 bounds 안에 머문다", () => {
    const effect = rainWith({}, { seed: -7, bounds: { x: -100, y: -50, width: 800, height: 1200 } });
    expect(() => validateKineticEffectInstance(effect)).not.toThrow();
    for (const particle of sampleKineticParticlesAtTime(effect, 700)) {
      expect(particle.x).toBeGreaterThanOrEqual(-100);
      expect(particle.x).toBeLessThan(-100 + 800);
      expect(particle.y).toBeGreaterThanOrEqual(-50);
      expect(particle.y).toBeLessThan(-50 + 1200);
    }
  });
});

describe("파라미터 검증 확장 — rain 파라미터", () => {
  it.each([0, 1])("density %s 경계는 통과하고 파티클 수가 비례한다", (density) => {
    expect(sampleKineticParticlesAtTime(rainWith({ density }), 0)).toHaveLength(Math.round(50 * density));
  });

  it.each([-0.01, 1.01, 2, Number.NaN, Number.POSITIVE_INFINITY, "0.8"])(
    "density %s 는 거부된다",
    (density) => {
      expect(() => sampleKineticParticlesAtTime(rainWith({ density }), 0)).toThrow(/density/u);
    },
  );

  it.each([
    ["speedPxPerSec", -1],
    ["speedPxPerSec", Number.NaN],
    ["angleDeg", Number.NaN],
    ["angleDeg", Number.POSITIVE_INFINITY],
    ["streakLengthPx", -0.5],
    ["dropColor", 123],
    ["dropColor", ""],
  ])("rain %s = %s 는 거부된다", (field, value) => {
    expect(() => validateKineticEffectInstance(rainWith({ [field]: value }))).toThrow();
  });

  it("dropColor 문자열과 streakLengthPx 0은 통과한다", () => {
    expect(() => validateKineticEffectInstance(rainWith({ dropColor: "#aaccff", streakLengthPx: 0 }))).not.toThrow();
  });

  it("음수 각도와 직각(90°)에서도 모든 파티클이 유한하고 bounds 안에 있다", () => {
    for (const angleDeg of [-80, -15, 0, 45, 90, 179]) {
      const particles = sampleKineticParticlesAtTime(rainWith({ angleDeg }), 500);
      expect(particles.length).toBeGreaterThan(0);
      for (const particle of particles) {
        expect(Number.isFinite(particle.x)).toBe(true);
        expect(Number.isFinite(particle.y)).toBe(true);
        expect(particle.x).toBeGreaterThanOrEqual(0);
        expect(particle.x).toBeLessThan(800);
        expect(particle.y).toBeGreaterThanOrEqual(0);
        expect(particle.y).toBeLessThan(1200);
      }
    }
  });
});

describe("파라미터 검증 확장 — petals 파라미터", () => {
  it.each([0, 1, 3])("count %s 는 그 개수만큼 샘플링된다", (count) => {
    expect(sampleKineticParticlesAtTime(petalsWith({ count }), 0)).toHaveLength(count);
  });

  it.each([2.5, -1, Number.NaN, Number.POSITIVE_INFINITY, MAX_KINETIC_PARTICLES_PER_EFFECT + 1, "20"])(
    "count %s 는 거부된다",
    (count) => {
      expect(() => validateKineticEffectInstance(petalsWith({ count }))).toThrow(/count/u);
    },
  );

  it("count 상한값 자체는 검증만 통과한다(샘플링 폭주 방지 경계)", () => {
    expect(() =>
      validateKineticEffectInstance(petalsWith({ count: MAX_KINETIC_PARTICLES_PER_EFFECT })),
    ).not.toThrow();
  });

  it.each([
    ["windVelocityX", Number.NaN],
    ["windVelocityY", Number.POSITIVE_INFINITY],
    ["flutterFrequencyHz", -0.1],
    ["flutterFrequencyHz", Number.NaN],
    ["petalColor", ""],
    ["petalColor", 7],
  ])("petals %s = %s 는 거부된다", (field, value) => {
    expect(() => validateKineticEffectInstance(petalsWith({ [field]: value }))).toThrow();
  });

  it("강한 역풍(-5000)에서도 모든 꽃잎이 bounds 안에 머문다", () => {
    const particles = sampleKineticParticlesAtTime(
      petalsWith({ windVelocityX: -5000, windVelocityY: -9000 }),
      1500,
    );
    expect(particles).toHaveLength(20);
    for (const particle of particles) {
      expect(particle.x).toBeGreaterThanOrEqual(0);
      expect(particle.x).toBeLessThan(800);
      expect(particle.y).toBeGreaterThanOrEqual(0);
      expect(particle.y).toBeLessThan(1200);
    }
  });
});

describe("파라미터 검증 확장 — speedlines·glow·generic 파라미터", () => {
  const speedlines = (params: Record<string, unknown>): KineticEffectInstance =>
    ({
      id: "sl-x", panelId: "panel_x", seed: 1, loopPeriodMs: 1000,
      bounds: { x: 0, y: 0, width: 400, height: 400 },
      effect: {
        type: "speedlines",
        params: { originNormalizedX: 0.5, originNormalizedY: 0.5, lineCount: 12, strokeWidth: 2, innerRadiusRatio: 0.2, ...params },
      },
    }) as KineticEffectInstance;

  const glow = (params: Record<string, unknown>): KineticEffectInstance =>
    ({
      id: "glow-x", panelId: "panel_x", seed: 1, loopPeriodMs: 1000,
      bounds: { x: 0, y: 0, width: 400, height: 400 },
      effect: {
        type: "energy-glow-pulse",
        params: { pulseFrequencyHz: 1.5, glowRadiusPx: 24, coreBrightness: 0.9, glowColor: "#ffd27a", ...params },
      },
    }) as KineticEffectInstance;

  it.each([
    [{ originNormalizedX: -0.1 }],
    [{ originNormalizedX: 1.1 }],
    [{ originNormalizedY: Number.NaN }],
    [{ lineCount: 2.5 }],
    [{ lineCount: -1 }],
    [{ strokeWidth: -1 }],
    [{ innerRadiusRatio: 2 }],
    [{ innerRadiusRatio: -0.1 }],
  ])("speedlines %j 는 거부된다", (params) => {
    expect(() => validateKineticEffectInstance(speedlines(params))).toThrow();
  });

  it("speedlines 경계값(원점 0/1, innerRadius 0/1)은 통과한다", () => {
    expect(() =>
      validateKineticEffectInstance(speedlines({ originNormalizedX: 0, originNormalizedY: 1, innerRadiusRatio: 1, lineCount: 0 })),
    ).not.toThrow();
  });

  it.each([
    [{ pulseFrequencyHz: -1 }],
    [{ pulseFrequencyHz: Number.NaN }],
    [{ glowRadiusPx: -1 }],
    [{ coreBrightness: -0.1 }],
    [{ glowColor: "" }],
    [{ glowColor: 123 }],
  ])("glow %j 는 거부된다", (params) => {
    expect(() => validateKineticEffectInstance(glow(params))).toThrow();
  });

  it("유효한 glow 인스턴스는 통과한다", () => {
    expect(() => validateKineticEffectInstance(glow({}))).not.toThrow();
  });

  it.each(["mist", "dust-motes", "ink-bloom"])("%s generic 파라미터는 숫자·문자열만 허용한다", (type) => {
    const ok = {
      id: "g-x", panelId: "panel_x", seed: 1, loopPeriodMs: 1000,
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      effect: { type, params: { density: 0.5, label: "soft" } },
    } as unknown as KineticEffectInstance;
    expect(() => validateKineticEffectInstance(ok)).not.toThrow();
    const bad = {
      ...ok,
      effect: { type, params: { density: Number.NaN } },
    } as unknown as KineticEffectInstance;
    expect(() => validateKineticEffectInstance(bad)).toThrow();
    const badObject = {
      ...ok,
      effect: { type, params: { shape: { round: true } } },
    } as unknown as KineticEffectInstance;
    expect(() => validateKineticEffectInstance(badObject)).toThrow();
  });

  it("알 수 없는 효과 종류는 조용히 빈 결과가 아니라 오류다", () => {
    const hail = { ...rainWith(), effect: { type: "hail", params: {} } } as unknown as KineticEffectInstance;
    expect(() => validateKineticEffectInstance(hail)).toThrow(/Unknown kinetic effect type/u);
    expect(() => sampleKineticParticlesAtTime(hail, 0)).toThrow(/Unknown kinetic effect type/u);
  });
});

describe("파라미터 검증 확장 — 시간 샘플링 경계", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "500"])(
    "timeMs %s 는 거부된다",
    (timeMs) => {
      expect(() => sampleKineticParticlesAtTime(rainWith(), timeMs as number)).toThrow(/timeMs/u);
    },
  );

  it("음수 시간은 루프 주기 안으로 감싸 양의 등가 시각과 동일하다", () => {
    const rain = rainWith();
    expect(sampleKineticParticlesAtTime(rain, -500)).toEqual(sampleKineticParticlesAtTime(rain, 1500));
    expect(sampleKineticParticlesAtTime(rain, -2000)).toEqual(sampleKineticParticlesAtTime(rain, 0));
    const petals = petalsWith();
    expect(sampleKineticParticlesAtTime(petals, -1)).toEqual(
      sampleKineticParticlesAtTime(petals, 2999),
    );
  });

  it("아주 큰 시간도 주기로 나눈 나머지와 동일하게 결정론적이다", () => {
    const rain = rainWith();
    expect(sampleKineticParticlesAtTime(rain, 2_000_500)).toEqual(sampleKineticParticlesAtTime(rain, 500));
  });

  it("같은 입력의 반복 샘플링은 완전히 동일하다", () => {
    const rain = rainWith();
    expect(sampleKineticParticlesAtTime(rain, 777)).toEqual(sampleKineticParticlesAtTime(rain, 777));
  });

  it("seed가 다르면 rain 파티클 배치가 달라진다", () => {
    const a = sampleKineticParticlesAtTime(rainWith({}, { seed: 42 }), 0);
    const b = sampleKineticParticlesAtTime(rainWith({}, { seed: 43 }), 0);
    expect(a).not.toEqual(b);
  });

  it.each([-1000, -1, 0, 500, 1999, 2000, 123_456])("rain t=%s 모든 파티클이 유한·bounds 안", (timeMs) => {
    for (const particle of sampleKineticParticlesAtTime(rainWith(), timeMs)) {
      expect(Number.isFinite(particle.x)).toBe(true);
      expect(Number.isFinite(particle.y)).toBe(true);
      expect(particle.x).toBeGreaterThanOrEqual(0);
      expect(particle.x).toBeLessThan(800);
      expect(particle.y).toBeGreaterThanOrEqual(0);
      expect(particle.y).toBeLessThan(1200);
      expect(particle.opacity).toBeLessThanOrEqual(1);
    }
  });

  it("fallback은 중간 시점 샘플과 일치하고, 잘못된 주기는 fallback에서도 거부된다", () => {
    const rain = rainWith();
    const fallback = generateStaticEffectFallback(rain);
    expect(fallback.particleSnapshot).toEqual(sampleKineticParticlesAtTime(rain, 1000));
    expect(() => generateStaticEffectFallback(rainWith({}, { loopPeriodMs: 0 }))).toThrow(/loopPeriodMs/u);
  });
});
