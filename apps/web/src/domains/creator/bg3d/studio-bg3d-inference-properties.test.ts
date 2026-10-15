/**
 * 추론 파이프라인 속성 테스트 — 시드를 고정한 무작위 장면으로 핵심 불변식을 브루트포스와 대조한다.
 *
 * 예제 기반 테스트는 사람이 떠올린 경우만 본다. 여기서는 사람이 만들기 어려운 배치(회전한 13종 도형,
 * 겹침, 극단적 크기, 비정상 숫자)를 코드로 만들어 세 가지를 증명한다.
 *  1. 공간 색인은 반경 안의 점·모서리·면을 하나도 놓치지 않는다 (놓치면 스냅이 조용히 안 걸린다).
 *  2. 엔진은 어떤 입력에서도 예외를 던지지 않고 유한한 결과만 낸다.
 *  3. 점 후보가 임계값 안에 있으면 점 계열이 이기고, 이긴 점은 가장 가까운 점이다.
 * 모든 값은 시드로 결정되므로 실패하면 같은 시드로 그대로 재현된다.
 */

import { describe, expect, it } from "vitest";

import { resolveStudioBg3dInference } from "./studio-bg3d-inference-engine";
import { createStudioBg3dInferenceIndex } from "./studio-bg3d-inference-index";
import {
  STUDIO_BG3D_INFERENCE_KIND_STYLE,
  STUDIO_BG3D_INFERENCE_THRESHOLD_PX,
} from "./studio-bg3d-inference-kinds";
import {
  closestPointOnSegment,
  closestPointsBetweenSegments,
  distance,
} from "./studio-bg3d-inference-math";
import { buildStudioBg3dInferenceSourceSet } from "./studio-bg3d-inference-sources";

import type { BgPrimitiveKind } from "../studio-background-3d-metadata";
import type { StudioBg3dInferenceVec3 } from "./studio-bg3d-inference-math";
import type {
  StudioBg3dInferenceLineSource,
  StudioBg3dInferenceSceneEntity,
} from "./studio-bg3d-inference-sources";
import type {
  StudioBg3dInferenceCursor,
  StudioBg3dInferenceQuery,
} from "./studio-bg3d-inference-types";

type V3 = StudioBg3dInferenceVec3;
type Rand = () => number;

/** mulberry32 — 시드가 같으면 수열이 같다. */
function createRandom(seed: number): Rand {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: Rand, list: readonly [T, ...T[]]): T {
  const index = Math.min(list.length - 1, Math.floor(rand() * list.length));
  return list[index] ?? list[0];
}

const PRIMITIVE_KINDS: readonly [BgPrimitiveKind, ...BgPrimitiveKind[]] = [
  "box",
  "plane",
  "cylinder",
  "tube",
  "sphere",
  "hemisphere",
  "cone",
  "pyramid",
  "triangularPrism",
  "hexPrism",
  "torus",
  "ring",
  "capsule",
];

const AXES = ["x", "y", "z"] as const;
const POINTERS = ["mouse", "pen", "touch"] as const;

/** 점 계열(1구간) 종류 — 선 위·정렬·면보다 항상 먼저다. */
const POINT_TIER_KINDS: ReadonlySet<string> = new Set(["endpoint", "midpoint", "center", "intersection"]);

/** 비정상 값 모음 — 일부 필드를 이 값으로 바꿔 엔진의 방어 코드를 흔든다. */
const HOSTILE_NUMBERS: readonly [number, ...number[]] = [
  0, -1, 1e-12, 1e-6, 1e5, 1e9, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1,
];

function randomEntities(rand: Rand, count: number, spread: number, hostile: boolean): StudioBg3dInferenceSceneEntity[] {
  const entities: StudioBg3dInferenceSceneEntity[] = [];
  for (let i = 0; i < count; i += 1) {
    const mixed = (normal: () => number): number =>
      hostile && rand() < 0.04 ? pick(rand, HOSTILE_NUMBERS) : normal();
    entities.push({
      id: `e${i}`,
      kind: pick(rand, PRIMITIVE_KINDS),
      position: [
        mixed(() => (rand() - 0.5) * spread),
        mixed(() => (rand() - 0.5) * spread * 0.5),
        mixed(() => (rand() - 0.5) * spread),
      ],
      rotation: [mixed(() => rand() * 6.28), mixed(() => rand() * 6.28), mixed(() => rand() * 6.28)],
      scale: [mixed(() => 0.2 + rand() * 4), mixed(() => 0.2 + rand() * 4), mixed(() => 0.2 + rand() * 4)],
      ...(hostile && rand() < 0.08 ? { parentId: `e${Math.floor(rand() * count)}` } : {}),
      ...(hostile && rand() < 0.05 ? { visible: false } : {}),
    });
  }
  return entities;
}

function randomGuides(rand: Rand, count: number, spread: number): StudioBg3dInferenceLineSource[] {
  const guides: StudioBg3dInferenceLineSource[] = [];
  for (let index = 0; index < count; index += 1) {
    guides.push({
      id: `g${index}`,
      a: [(rand() - 0.5) * spread, (rand() - 0.5) * 5, (rand() - 0.5) * spread],
      b: [(rand() - 0.5) * spread, (rand() - 0.5) * 5, (rand() - 0.5) * spread],
      label: `가이드 ${index}`,
      role: "guide",
    });
  }
  return guides;
}

function distanceToAabb(min: V3, max: V3, point: V3): number {
  return Math.hypot(
    Math.max(min[0] - point[0], 0, point[0] - max[0]),
    Math.max(min[1] - point[1], 0, point[1] - max[1]),
    Math.max(min[2] - point[2], 0, point[2] - max[2]),
  );
}

describe("공간 색인 완전성 (브루트포스 대조)", () => {
  it("잘리지 않은 쿼리는 반경 안의 점·모서리·면을 하나도 놓치지 않는다", () => {
    const misses: string[] = [];
    const expected = { points: 0, edges: 0, volumes: 0 };
    let queries = 0;
    let truncated = 0;
    for (let seed = 1; seed <= 90; seed += 1) {
      const rand = createRandom(seed);
      const spread = 5 + rand() * 60;
      const source = buildStudioBg3dInferenceSourceSet({
        entities: randomEntities(rand, 5 + Math.floor(rand() * 110), spread, false),
        lines: randomGuides(rand, Math.floor(rand() * 6), spread),
      });
      const cellSize = pick(rand, [0.25, 1, 2, 4, 16]);
      const index = createStudioBg3dInferenceIndex(source, { cellSize });

      for (let q = 0; q < 22; q += 1) {
        const isRay = rand() < 0.6;
        const a: V3 = [(rand() - 0.5) * spread, (rand() - 0.5) * spread * 0.5, (rand() - 0.5) * spread];
        const heading: V3 = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
        const magnitude = Math.hypot(...heading) || 1;
        const reach = isRay ? rand() * 80 : 0;
        const b: V3 = [
          a[0] + (heading[0] / magnitude) * reach,
          a[1] + (heading[1] / magnitude) * reach,
          a[2] + (heading[2] / magnitude) * reach,
        ];
        const radius = rand() * cellSize * 0.9;
        const radiusEnd = isRay ? rand() * cellSize * 0.9 : radius;
        const output = index.query({ a, b, radius, radiusEnd });
        queries += 1;
        if (output.stats.truncated) {
          truncated += 1;
          continue;
        }
        // 반경은 a→b로 선형 보간되므로 더 작은 쪽을 보수적 기준으로 삼는다.
        const guaranteed = Math.min(radius, radiusEnd) - 1e-6;
        if (guaranteed <= 0) continue;
        const pointIds = new Set(output.points.map((feature) => feature.id));
        const edgeIds = new Set(output.edges.map((feature) => feature.id));
        const volumeIds = new Set(output.volumes.map((feature) => feature.id));

        for (const feature of source.points) {
          const closest = closestPointOnSegment(feature.point, a, b);
          if (distance(feature.point, closest.point) > guaranteed) continue;
          expected.points += 1;
          if (!pointIds.has(feature.id)) misses.push(`seed=${seed} q=${q} cell=${cellSize} 점 ${feature.id}`);
        }
        for (const feature of source.edges) {
          if (closestPointsBetweenSegments(a, b, feature.a, feature.b).distance > guaranteed) continue;
          expected.edges += 1;
          if (!edgeIds.has(feature.id)) misses.push(`seed=${seed} q=${q} cell=${cellSize} 모서리 ${feature.id}`);
        }
        for (const feature of source.volumes) {
          let near = false;
          for (let step = 0; step <= 120 && !near; step += 1) {
            const t = step / 120;
            const sample: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
            near = distanceToAabb(feature.min, feature.max, sample) <= guaranteed;
          }
          if (!near) continue;
          expected.volumes += 1;
          if (!volumeIds.has(feature.id)) misses.push(`seed=${seed} q=${q} cell=${cellSize} 면 ${feature.id}`);
        }
      }
    }
    expect(misses.slice(0, 10)).toEqual([]);
    // 공허한 통과 방지: 실제로 많은 후보를 대조했고 잘린 쿼리는 소수여야 한다.
    expect(queries).toBe(90 * 22);
    expect(truncated).toBeLessThan(queries * 0.2);
    expect(expected.points).toBeGreaterThan(2_000);
    expect(expected.edges).toBeGreaterThan(500);
    expect(expected.volumes).toBeGreaterThan(40);
  });
});

describe("엔진 견고성 (적대적 입력)", () => {
  it("비정상 변환·좌표·배율·방향에서도 예외 없이 유한한 결과만 낸다", () => {
    const problems: string[] = [];
    let succeeded = 0;
    let rejected = 0;
    const kindsSeen = new Set<string>();
    for (let seed = 1; seed <= 110; seed += 1) {
      const rand = createRandom(seed * 7919);
      const entityCount = 1 + Math.floor(rand() * 60);
      const source = buildStudioBg3dInferenceSourceSet({ entities: randomEntities(rand, entityCount, 30, true) });
      const index = createStudioBg3dInferenceIndex(source, { cellSize: pick(rand, [0.25, 2, 16]) });
      const point = (): V3 => [(rand() - 0.5) * 40, (rand() - 0.5) * 12, (rand() - 0.5) * 40];

      for (let q = 0; q < 30; q += 1) {
        const cursor: StudioBg3dInferenceCursor = rand() < 0.4
          ? {
              kind: "point",
              point: rand() < 0.05 ? [pick(rand, HOSTILE_NUMBERS), 0, 0] : point(),
              worldPerPixel: rand() < 0.05 ? pick(rand, HOSTILE_NUMBERS) : 0.005 + rand() * 0.05,
            }
          : {
              kind: "ray",
              origin: rand() < 0.05
                ? [pick(rand, HOSTILE_NUMBERS), 5, 5]
                : [(rand() - 0.5) * 40, 3 + rand() * 12, 10 + rand() * 30],
              direction: rand() < 0.05
                ? [pick(rand, HOSTILE_NUMBERS), pick(rand, HOSTILE_NUMBERS), pick(rand, HOSTILE_NUMBERS)]
                : [rand() - 0.5, rand() - 0.8, rand() - 0.5],
              projection: rand() < 0.5
                ? { type: "perspective", radiansPerPixel: rand() < 0.05 ? pick(rand, HOSTILE_NUMBERS) : 0.0008 + rand() * 0.002 }
                : { type: "orthographic", worldPerPixel: rand() < 0.05 ? pick(rand, HOSTILE_NUMBERS) : 0.005 + rand() * 0.02 },
              groundY: rand() < 0.7 ? 0 : null,
            };
        const roll = rand();
        const query: StudioBg3dInferenceQuery = {
          index,
          cursor,
          referencePoint: rand() < 0.5 ? (rand() < 0.05 ? [pick(rand, HOSTILE_NUMBERS), 0, 0] : point()) : null,
          pointer: pick(rand, POINTERS),
          ...(roll < 0.15 ? { lock: { kind: "axis" as const, axis: pick(rand, AXES) } } : {}),
          ...(roll > 0.9 ? { hold: { kind: "plane" as const, point: point(), normal: [0, 1, 0] as const, sourceId: null } } : {}),
          ...(roll > 0.8 && roll <= 0.9
            ? { hold: { kind: "line" as const, origin: point(), direction: [rand() - 0.5, 0, rand() - 0.5] as const, axis: null, from: "axis" as const } }
            : {}),
          ...(rand() < 0.3 ? { hoverReferences: [point(), point()] } : {}),
          ...(rand() < 0.3 ? { grid: { step: pick(rand, [0, -1, 0.1, 1]) } } : {}),
        };
        try {
          const outcome = resolveStudioBg3dInference(query);
          if (!outcome.ok) {
            rejected += 1;
            if (outcome.message.trim() === "") problems.push(`seed=${seed} q=${q} 실패 안내 문구가 비어 있다`);
            continue;
          }
          succeeded += 1;
          const { result } = outcome;
          kindsSeen.add(result.kind);
          const numbers = [
            ...result.point,
            ...(result.direction ?? []),
            ...result.guides.flatMap((guide) => [...guide.from, ...guide.to]),
          ];
          if (!numbers.every(Number.isFinite)) problems.push(`seed=${seed} q=${q} 유한하지 않은 값 (${result.kind})`);
          if (result.distancePx !== null && !Number.isFinite(result.distancePx)) problems.push(`seed=${seed} q=${q} distancePx`);
          if (!(result.kind in STUDIO_BG3D_INFERENCE_KIND_STYLE)) problems.push(`seed=${seed} q=${q} 알 수 없는 종류 ${result.kind}`);
          if (result.point.some((value) => Math.abs(value) > 10_000 + 1e-6)) problems.push(`seed=${seed} q=${q} 장면 범위 밖 ${result.point.join(",")}`);
          if (result.label.trim() === "" || result.announcement.trim() === "") problems.push(`seed=${seed} q=${q} 표시 문구가 비어 있다`);
        } catch (error) {
          problems.push(`seed=${seed} q=${q} 예외: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
    // 성공과 거부가 모두 충분히 나왔고 여러 종류의 결과를 거쳤는지(공허한 통과 방지).
    expect(succeeded).toBeGreaterThan(1_500);
    expect(rejected).toBeGreaterThan(100);
    expect(kindsSeen.size).toBeGreaterThanOrEqual(5);
  });

  it("같은 입력은 항상 같은 결과를 내고 색인을 변형하지 않는다", () => {
    const rand = createRandom(424242);
    const source = buildStudioBg3dInferenceSourceSet({
      entities: randomEntities(rand, 40, 20, false),
      lines: randomGuides(rand, 3, 20),
    });
    const index = createStudioBg3dInferenceIndex(source, { cellSize: 2 });
    const before = JSON.stringify([source.points, source.edges, source.volumes]);
    for (let q = 0; q < 200; q += 1) {
      const query: StudioBg3dInferenceQuery = {
        index,
        cursor: {
          kind: "ray",
          origin: [(rand() - 0.5) * 20, 6 + rand() * 6, 15 + rand() * 10],
          direction: [(rand() - 0.5) * 0.5, -0.6 - rand() * 0.3, -1],
          projection: { type: "perspective", radiansPerPixel: 0.0015 },
          groundY: 0,
        },
        referencePoint: [(rand() - 0.5) * 10, 0, (rand() - 0.5) * 10],
      };
      const first = resolveStudioBg3dInference(query);
      const second = resolveStudioBg3dInference(query);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    }
    expect(JSON.stringify([source.points, source.edges, source.volumes])).toBe(before);
  });
});

describe("점 우선순위 (점 커서, 브루트포스 대조)", () => {
  it("임계값 안에 점 후보가 있으면 점 계열이 이기고 가장 가까운 점이 이긴다", () => {
    const problems: string[] = [];
    const worldPerPixel = 0.01;
    const pointPx = STUDIO_BG3D_INFERENCE_THRESHOLD_PX.point;
    let inside = 0;
    let outside = 0;
    for (let seed = 1; seed <= 120; seed += 1) {
      const rand = createRandom(seed * 104729);
      const source = buildStudioBg3dInferenceSourceSet({ entities: randomEntities(rand, 3 + Math.floor(rand() * 25), 8, false) });
      const index = createStudioBg3dInferenceIndex(source, { cellSize: 2 });
      for (let q = 0; q < 50; q += 1) {
        const anchor = source.points[Math.floor(rand() * source.points.length)];
        const jitter = (): number => (rand() - 0.5) * 24 * worldPerPixel;
        const cursorPoint: V3 = anchor && rand() < 0.8
          ? [anchor.point[0] + jitter(), anchor.point[1] + jitter(), anchor.point[2] + jitter()]
          : [(rand() - 0.5) * 8, (rand() - 0.5) * 4, (rand() - 0.5) * 8];
        const outcome = resolveStudioBg3dInference({ index, cursor: { kind: "point", point: cursorPoint, worldPerPixel } });
        if (!outcome.ok) {
          problems.push(`seed=${seed} q=${q} 실패 ${outcome.reason}`);
          continue;
        }
        const nearest = source.points
          .map((feature) => ({ feature, px: distance(feature.point, cursorPoint) / worldPerPixel }))
          .filter((entry) => entry.px <= pointPx)
          .sort((left, right) => left.px - right.px)[0];
        const { result } = outcome;
        if (nearest) {
          inside += 1;
          if (!POINT_TIER_KINDS.has(result.kind)) {
            problems.push(`seed=${seed} q=${q} 점 계열이어야 하는데 ${result.kind} (가장 가까운 ${nearest.feature.kind} ${nearest.px.toFixed(2)}px)`);
          } else if (result.kind !== "intersection") {
            const winnerPx = distance(result.point, cursorPoint) / worldPerPixel;
            if (winnerPx > nearest.px + 1e-6) {
              problems.push(`seed=${seed} q=${q} 가장 가까운 점이 아님: ${result.kind} ${winnerPx.toFixed(3)}px > ${nearest.px.toFixed(3)}px`);
            }
          }
        } else {
          outside += 1;
          if (result.kind === "endpoint" || result.kind === "midpoint" || result.kind === "center") {
            problems.push(`seed=${seed} q=${q} 임계값 안에 점이 없는데 ${result.kind}`);
          }
        }
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
    expect(inside).toBeGreaterThan(1_000);
    expect(outside).toBeGreaterThan(1_000);
  });
});
