import { describe, expect, it } from "vitest";

import { resolveStudioBg3dInference } from "./studio-bg3d-inference-engine";
import { createStudioBg3dInferenceIndex } from "./studio-bg3d-inference-index";
import { STUDIO_BG3D_INFERENCE_BUDGET } from "./studio-bg3d-inference-kinds";
import { normalize, vec3 } from "./studio-bg3d-inference-math";
import { buildStudioBg3dInferenceSourceSet } from "./studio-bg3d-inference-sources";
import {
  createStudioBg3dInferenceAnnouncer,
  createStudioBg3dInferenceFrameGate,
} from "./studio-bg3d-inference-timing";

import type { StudioBg3dInferenceSceneEntity } from "./studio-bg3d-inference-sources";
import type { StudioBg3dInferenceCursor, StudioBg3dInferenceStats } from "./studio-bg3d-inference-types";

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomBoxes(count: number, extent: number, seed: number, scale = 1): StudioBg3dInferenceSceneEntity[] {
  const random = lcg(seed);
  const entities: StudioBg3dInferenceSceneEntity[] = [];
  for (let i = 0; i < count; i += 1) {
    entities.push({
      id: `box-${i}`,
      kind: "box",
      position: [(random() - 0.5) * extent, random() * 3, (random() - 0.5) * extent],
      rotation: [0, random() * Math.PI, 0],
      scale: [scale, scale, scale],
    });
  }
  return entities;
}

function assertWithinBudget(stats: StudioBg3dInferenceStats) {
  const budget = STUDIO_BG3D_INFERENCE_BUDGET;
  expect(stats.featuresScanned).toBeLessThanOrEqual(budget.maxFeaturesScannedPerQuery);
  expect(stats.cellsVisited).toBeLessThanOrEqual(budget.maxCellsPerQuery);
  expect(stats.intersectionPairs).toBeLessThanOrEqual(budget.maxIntersectionPairs);
  expect(stats.pointsConsidered + stats.edgesConsidered + stats.volumesConsidered)
    .toBeLessThanOrEqual(budget.maxFeaturesScannedPerQuery);
  // 정밀 평가한 후보 총량도 상한으로 묶인다: 점+모서리+교차 쌍 결과+정렬/평행(고정)+면/격자.
  const evaluatedCeiling = budget.maxPointCandidatesPerQuery
    + budget.maxEdgeCandidatesPerQuery
    + budget.maxIntersectionPairs
    + 3 * (1 + budget.maxReferencePoints)
    + 2 * budget.maxReferenceDirections
    + 8;
  expect(stats.evaluated).toBeLessThanOrEqual(evaluatedCeiling);
}

describe("추론 쿼리 예산 증명", () => {
  it("장면 객체가 512개(문서 한도)의 4배인 2,000개여도 쿼리가 훑는 특징은 상한 이하다", () => {
    const set = buildStudioBg3dInferenceSourceSet({ entities: randomBoxes(2_000, 120, 7) });
    const index = createStudioBg3dInferenceIndex(set);
    // 색인에 든 특징은 수만 개지만, 쿼리 하나는 상한(2,048) 이하만 훑는다.
    const totalFeatures = set.points.length + set.edges.length + set.volumes.length;
    expect(totalFeatures).toBeGreaterThan(50_000);
    const random = lcg(99);
    let maxScanned = 0;
    let maxCells = 0;
    for (let i = 0; i < 400; i += 1) {
      const cursor: StudioBg3dInferenceCursor = {
        kind: "point",
        point: vec3((random() - 0.5) * 120, random() * 3, (random() - 0.5) * 120),
        worldPerPixel: 0.01,
      };
      const outcome = resolveStudioBg3dInference({
        index,
        cursor,
        referencePoint: vec3(0, 0, 0),
        hoverReferences: [vec3(5, 0, 5), vec3(-4, 1, 2)],
      });
      if (!outcome.ok) throw new Error(outcome.message);
      assertWithinBudget(outcome.stats);
      maxScanned = Math.max(maxScanned, outcome.stats.featuresScanned);
      maxCells = Math.max(maxCells, outcome.stats.cellsVisited);
    }
    expect(maxScanned).toBeLessThan(totalFeatures / 20);
    expect(maxCells).toBeLessThanOrEqual(27);
  });

  it("한 곳에 몰린 밀집 장면에서도 스캔 상한에서 멈추고 truncated로 알린다", () => {
    const set = buildStudioBg3dInferenceSourceSet({ entities: randomBoxes(2_000, 8, 11, 0.4) });
    const index = createStudioBg3dInferenceIndex(set);
    const outcome = resolveStudioBg3dInference({
      index,
      cursor: { kind: "point", point: vec3(0, 1.5, 0), worldPerPixel: 0.01 },
      referencePoint: vec3(1, 0, 1),
    });
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.stats.truncated).toBe(true);
    expect(outcome.stats.featuresScanned).toBe(STUDIO_BG3D_INFERENCE_BUDGET.maxFeaturesScannedPerQuery);
    assertWithinBudget(outcome.stats);
    expect(outcome.result.point.every(Number.isFinite)).toBe(true);
  });

  it("레이 쿼리도 셀·스캔·후보 상한을 지킨다", () => {
    const set = buildStudioBg3dInferenceSourceSet({ entities: randomBoxes(1_500, 80, 5) });
    const index = createStudioBg3dInferenceIndex(set);
    const random = lcg(2024);
    for (let i = 0; i < 200; i += 1) {
      const direction = normalize(vec3(random() - 0.5, -0.15 - random() * 0.3, random() - 0.5));
      if (!direction) continue;
      const outcome = resolveStudioBg3dInference({
        index,
        cursor: {
          kind: "ray",
          origin: vec3(0, 6, 30),
          direction,
          projection: { type: "perspective", radiansPerPixel: 0.001 },
          groundY: 0,
        },
      });
      if (!outcome.ok) continue;
      assertWithinBudget(outcome.stats);
    }
  });

  it("같은 입력의 쿼리는 호출할 때마다 같은 통계와 결과를 낸다 (캐시/상태 누수 없음)", () => {
    const index = createStudioBg3dInferenceIndex(buildStudioBg3dInferenceSourceSet({ entities: randomBoxes(300, 30, 3) }));
    const query = {
      index,
      cursor: { kind: "point", point: vec3(1, 1, 1), worldPerPixel: 0.01 } satisfies StudioBg3dInferenceCursor,
      referencePoint: vec3(0, 0, 0),
    };
    const first = resolveStudioBg3dInference(query);
    for (let i = 0; i < 100; i += 1) {
      const next = resolveStudioBg3dInference(query);
      expect(next).toEqual(first);
    }
  });

  it("색인 구축은 정점을 순회하지 않고 도형 표만 사용한다 (특징 수가 객체 수에 선형)", () => {
    const small = buildStudioBg3dInferenceSourceSet({ entities: randomBoxes(100, 40, 1) });
    const large = buildStudioBg3dInferenceSourceSet({ entities: randomBoxes(1_000, 40, 1) });
    expect(large.points.length).toBe(small.points.length * 10);
    expect(small.points.length).toBe(100 * (8 + 1 + 6 + 12));
  });
});

describe("프레임 스로틀", () => {
  it("1ms 간격의 포인터 이벤트 1,000개 중 프레임(16ms)당 한 번만 처리하고 마지막은 반드시 처리한다", () => {
    const gate = createStudioBg3dInferenceFrameGate<number>(16);
    let processed = 0;
    let lastProcessed = -1;
    for (let t = 0; t < 1_000; t += 1) {
      const decision = gate.offer(t, t);
      if (decision === "run") {
        processed += 1;
        lastProcessed = t;
      }
    }
    // 보류된 마지막 샘플(999)은 다음 프레임 타이머가 꺼내 처리한다.
    const delay = gate.nextDelayMs(999);
    expect(delay).not.toBeNull();
    const trailing = gate.takePending(999 + (delay ?? 0));
    expect(trailing).toBe(999);
    processed += 1;
    lastProcessed = trailing ?? lastProcessed;
    expect(processed).toBeLessThanOrEqual(Math.ceil(1_000 / 16) + 1);
    expect(processed).toBeGreaterThanOrEqual(Math.floor(1_000 / 16));
    expect(lastProcessed).toBe(999);
    expect(gate.stats().offered).toBe(1_000);
    expect(gate.stats().ran).toBe(processed);
    expect(gate.stats().dropped).toBeGreaterThan(900);
  });

  it("간격이 지난 샘플은 바로 처리하고, 보류 샘플은 간격 전에는 꺼내지지 않는다", () => {
    const gate = createStudioBg3dInferenceFrameGate<string>(16);
    expect(gate.offer("a", 0)).toBe("run");
    expect(gate.offer("b", 5)).toBe("defer");
    expect(gate.takePending(10)).toBeNull();
    expect(gate.nextDelayMs(10)).toBe(6);
    expect(gate.takePending(16)).toBe("b");
    expect(gate.nextDelayMs(16)).toBeNull();
    expect(gate.offer("c", 40)).toBe("run");
  });

  it("reset 후에는 보류 샘플이 사라지고 즉시 처리할 수 있다", () => {
    const gate = createStudioBg3dInferenceFrameGate<number>(16);
    gate.offer(1, 0);
    gate.offer(2, 1);
    gate.reset();
    expect(gate.takePending(100)).toBeNull();
    expect(gate.offer(3, 2)).toBe("run");
  });

  it("비정상 간격 값은 기본 16ms로 대체한다", () => {
    const gate = createStudioBg3dInferenceFrameGate<number>(Number.NaN);
    expect(gate.offer(1, 0)).toBe("run");
    expect(gate.offer(2, 10)).toBe("defer");
    expect(gate.offer(3, 16)).toBe("run");
  });
});

describe("프레임 스로틀 — 실제 처리 비용에 맞춘 적응형 간격", () => {
  const BASE = STUDIO_BG3D_INFERENCE_BUDGET.minFrameIntervalMs;
  const FACTOR = STUDIO_BG3D_INFERENCE_BUDGET.costIntervalFactor;
  const CAP = STUDIO_BG3D_INFERENCE_BUDGET.maxAdaptiveFrameIntervalMs;

  it("첫 처리는 워밍업이라 무시하고, 이후 비용이 크면 간격이 비용의 3배로 늘어난다", () => {
    const gate = createStudioBg3dInferenceFrameGate<number>(BASE);
    expect(gate.intervalMs()).toBe(BASE);
    gate.recordCost(90);
    expect(gate.intervalMs()).toBe(BASE);
    gate.recordCost(20);
    expect(gate.intervalMs()).toBe(20 * FACTOR);
    // 늘어난 간격은 실제 게이트에도 적용된다: 20ms 뒤에는 아직 보류, 60ms 뒤에는 처리.
    expect(gate.offer(1, 1_000)).toBe("run");
    expect(gate.offer(2, 1_020)).toBe("defer");
    expect(gate.nextDelayMs(1_020)).toBe(40);
    expect(gate.takePending(1_059)).toBeNull();
    expect(gate.takePending(1_060)).toBe(2);
  });

  it("비용이 다시 줄면 기본 간격으로 돌아온다", () => {
    const gate = createStudioBg3dInferenceFrameGate<number>(BASE);
    gate.recordCost(1);
    for (let i = 0; i < 5; i += 1) gate.recordCost(20);
    expect(gate.intervalMs()).toBe(20 * FACTOR);
    // 최근 5개의 중앙값이 내려갈 때까지(가벼운 처리 3번) 간격이 남아 있다가 돌아온다.
    gate.recordCost(1);
    gate.recordCost(1);
    expect(gate.intervalMs()).toBe(20 * FACTOR);
    gate.recordCost(1);
    expect(gate.intervalMs()).toBe(BASE);
  });

  it("한두 번 튀는 비용(JIT·GC)에는 반응하지 않지만 꾸준히 느리면 반응한다", () => {
    const gate = createStudioBg3dInferenceFrameGate<number>(BASE);
    for (const cost of [1, 1, 1, 80, 1, 1, 80, 1, 1]) gate.recordCost(cost);
    expect(gate.intervalMs()).toBe(BASE);
    for (const cost of [80, 80, 80]) gate.recordCost(cost);
    expect(gate.intervalMs()).toBe(CAP);
  });

  it("적응형 간격에는 상한이 있고, 기본 간격이 더 크면 그 값을 존중하며, 비정상 비용은 무시한다", () => {
    const gate = createStudioBg3dInferenceFrameGate<number>(BASE);
    gate.recordCost(Number.NaN);
    gate.recordCost(-5);
    gate.recordCost(Number.POSITIVE_INFINITY);
    // 위 값들은 워밍업도 소모하지 않는다 — 다음 값이 워밍업이다.
    gate.recordCost(500);
    expect(gate.intervalMs()).toBe(BASE);
    for (let i = 0; i < 5; i += 1) gate.recordCost(500);
    expect(gate.intervalMs()).toBe(CAP);

    const wide = createStudioBg3dInferenceFrameGate<number>(CAP + 80);
    wide.recordCost(1);
    for (let i = 0; i < 5; i += 1) wide.recordCost(200);
    expect(wide.intervalMs()).toBe(CAP + 80);
  });

  it("reset은 보류 샘플만 지우고 장면의 처리 비용 학습은 유지한다", () => {
    const gate = createStudioBg3dInferenceFrameGate<number>(BASE);
    gate.recordCost(1);
    for (let i = 0; i < 5; i += 1) gate.recordCost(30);
    gate.offer(1, 0);
    gate.offer(2, 1);
    gate.reset();
    expect(gate.takePending(500)).toBeNull();
    expect(gate.intervalMs()).toBe(30 * FACTOR);
  });

  it("처리마다 20ms가 걸리는 장면에서 추론이 쓰는 시간은 전체의 약 1/3 안쪽으로 묶인다", () => {
    const COST_MS = 20;
    const simulate = (adaptive: boolean) => {
      const gate = createStudioBg3dInferenceFrameGate<number>(BASE);
      let clock = 0;
      let busy = 0;
      let runs = 0;
      for (let event = 0; event < 3_000; event += 1) {
        clock += 1; // 1000Hz 마우스: 이벤트는 1ms마다 온다
        if (gate.offer(event, clock) !== "run") continue;
        runs += 1;
        busy += COST_MS;
        clock += COST_MS; // 처리하는 동안 시간이 흐른다
        if (adaptive) gate.recordCost(COST_MS);
      }
      return { share: busy / clock, runs };
    };
    const fixed = simulate(false);
    const adaptive = simulate(true);
    // 고정 간격이면 처리가 끝나자마자 다음 샘플을 또 처리해 거의 모든 시간을 추론이 쓴다.
    expect(fixed.share).toBeGreaterThan(0.9);
    expect(adaptive.share).toBeLessThan(0.36);
    expect(adaptive.runs).toBeLessThan(fixed.runs / 2);
  });
});

describe("스크린리더 안내 속도 제한", () => {
  it("같은 key는 반복해서 읽지 않는다", () => {
    const announcer = createStudioBg3dInferenceAnnouncer(450);
    expect(announcer.offer({ key: "endpoint|A", text: "끝점 — 상자" }, 0)).toBe("끝점 — 상자");
    expect(announcer.offer({ key: "endpoint|A", text: "끝점 — 상자" }, 2_000)).toBeNull();
  });

  it("450ms 안에 바뀐 안내는 보류했다가 최신 것만 읽는다", () => {
    const announcer = createStudioBg3dInferenceAnnouncer(450);
    announcer.offer({ key: "a", text: "A" }, 0);
    expect(announcer.offer({ key: "b", text: "B" }, 100)).toBeNull();
    expect(announcer.offer({ key: "c", text: "C" }, 200)).toBeNull();
    expect(announcer.takePending(300)).toBeNull();
    expect(announcer.takePending(500)).toBe("C");
    expect(announcer.takePending(900)).toBeNull();
  });

  it("긴급 안내(잠금·취소·오류)는 간격과 무관하게 즉시 읽는다", () => {
    const announcer = createStudioBg3dInferenceAnnouncer(450);
    announcer.offer({ key: "a", text: "A" }, 0);
    expect(announcer.offer({ key: "lock", text: "X축 잠금", urgent: true }, 10)).toBe("X축 잠금");
  });

  it("보류 중이던 안내가 현재 안내와 같아지면 읽지 않는다", () => {
    const announcer = createStudioBg3dInferenceAnnouncer(450);
    announcer.offer({ key: "a", text: "A" }, 0);
    announcer.offer({ key: "b", text: "B" }, 100);
    announcer.offer({ key: "a", text: "A" }, 200);
    expect(announcer.takePending(1_000)).toBeNull();
  });

  it("reset 후에는 같은 key도 다시 읽는다", () => {
    const announcer = createStudioBg3dInferenceAnnouncer(450);
    announcer.offer({ key: "a", text: "A" }, 0);
    announcer.reset();
    expect(announcer.offer({ key: "a", text: "A" }, 1)).toBe("A");
  });
});
