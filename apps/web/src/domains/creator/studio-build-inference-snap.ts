/**
 * SketchUp-class inference snaps (BLD-001, BLD-002) — 호환 어댑터.
 *
 * 후보 계산(끝점·중간점·교차점·축 정렬·평행·수직)은 단일 추론 파이프라인
 * (`bg3d/studio-bg3d-inference-engine.ts`)이 하고, 이 모듈은 기존 공개 API 모양
 * (세그먼트 목록 + 픽셀 임계값/배율/포인터 속도 → 후보 목록)만 지킨다.
 * Pure geometry — no Three.js. Pointer velocity / zoom scale modulate pixel thresholds.
 *
 * 변경 이력: `tangent`는 직선 모서리만 다루는 파이프라인에 대응 개념이 없어 더는 생성하지 않는다
 * (타입은 호환을 위해 유지). `parallel`/`perpendicular`는 축 잠금 원점(첫 세그먼트의 시작점)을 기준점으로 삼아
 * 그 점에 닿은 모서리 방향과 비교한다.
 */

import { resolveStudioBg3dAdhocInference } from "./bg3d/studio-bg3d-inference-adhoc";

import type { StudioBg3dInferenceKind } from "./bg3d/studio-bg3d-inference-kinds";
import type { StudioBg3dInferenceVec3 } from "./bg3d/studio-bg3d-inference-math";

export const STUDIO_BUILD_INFERENCE_REVISION = 1 as const;

export type StudioInferenceSnapKind =
  | "endpoint"
  | "midpoint"
  | "intersection"
  | "axis"
  | "parallel"
  | "perpendicular"
  | "tangent";

export type StudioInferenceAxisLock = "x" | "y" | "z" | "none";

export interface StudioInferencePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface StudioInferenceSegment {
  readonly id: string;
  readonly a: StudioInferencePoint;
  readonly b: StudioInferencePoint;
}

export interface StudioInferenceSnapCandidate {
  readonly kind: StudioInferenceSnapKind;
  readonly point: StudioInferencePoint;
  readonly distance: number;
  readonly sourceIds: readonly string[];
  readonly axis?: StudioInferenceAxisLock;
  readonly locked: boolean;
}

export interface StudioInferenceSnapQuery {
  readonly cursor: StudioInferencePoint;
  readonly segments: readonly StudioInferenceSegment[];
  /** Screen-space pixel threshold projected to world via pixelsPerUnit. */
  readonly pixelThreshold: number;
  readonly pixelsPerUnit: number;
  readonly pointerVelocity: number;
  readonly axisLock: StudioInferenceAxisLock;
  readonly preferKinds?: readonly StudioInferenceSnapKind[];
}

export interface StudioInferenceSnapResult {
  readonly revision: typeof STUDIO_BUILD_INFERENCE_REVISION;
  readonly snapped: boolean;
  readonly candidate: StudioInferenceSnapCandidate | null;
  readonly candidates: readonly StudioInferenceSnapCandidate[];
  readonly worldThreshold: number;
}

/** 레거시 종류 → 파이프라인 종류. 대응이 없는 종류(tangent)는 null. */
const TO_PIPELINE_KIND: Readonly<Record<StudioInferenceSnapKind, StudioBg3dInferenceKind | null>> = Object.freeze({
  endpoint: "endpoint",
  midpoint: "midpoint",
  intersection: "intersection",
  axis: "axis",
  parallel: "parallel",
  perpendicular: "perpendicular",
  tangent: null,
});

const FROM_PIPELINE_KIND: Readonly<Partial<Record<StudioBg3dInferenceKind, StudioInferenceSnapKind>>> = Object.freeze({
  endpoint: "endpoint",
  midpoint: "midpoint",
  intersection: "intersection",
  axis: "axis",
  parallel: "parallel",
  perpendicular: "perpendicular",
});

const ENABLED_PIPELINE_KINDS: ReadonlySet<StudioBg3dInferenceKind> = new Set(
  Object.keys(FROM_PIPELINE_KIND) as StudioBg3dInferenceKind[],
);

function toVec(point: StudioInferencePoint): StudioBg3dInferenceVec3 {
  return [point.x, point.y, point.z];
}

function toPoint(vector: StudioBg3dInferenceVec3): StudioInferencePoint {
  return { x: vector[0], y: vector[1], z: vector[2] };
}

export function resolveStudioBuildInferenceSnap(
  query: StudioInferenceSnapQuery,
): StudioInferenceSnapResult {
  const velocityBoost = 1 + Math.min(2, Math.abs(query.pointerVelocity) * 0.01);
  const ppu = Math.max(1e-6, query.pixelsPerUnit);
  const thresholdPx = Math.max(1, query.pixelThreshold);
  const worldPerPixel = velocityBoost / ppu;
  const worldThreshold = thresholdPx * worldPerPixel;

  const locked = query.axisLock !== "none";
  const first = query.segments[0];
  const preferKinds = new Set<StudioBg3dInferenceKind>();
  for (const kind of query.preferKinds ?? []) {
    const mapped = TO_PIPELINE_KIND[kind];
    if (mapped) preferKinds.add(mapped);
  }

  const outcome = resolveStudioBg3dAdhocInference({
    lines: query.segments.map((segment) => ({
      id: segment.id,
      a: toVec(segment.a),
      b: toVec(segment.b),
      label: segment.id,
      role: "guide" as const,
    })),
    cursorPoint: toVec(query.cursor),
    worldPerPixel,
    // 축 잠금의 원점은 첫 세그먼트의 시작점이다 (기존 규칙).
    referencePoint: locked && first ? toVec(first.a) : null,
    lock: query.axisLock === "none" ? { kind: "none" } : { kind: "axis", axis: query.axisLock },
    thresholds: { pointPx: thresholdPx, edgePx: thresholdPx, alignPx: thresholdPx * 2 },
    enabledKinds: ENABLED_PIPELINE_KINDS,
    ...(preferKinds.size > 0 ? { preferKinds } : {}),
  });

  const candidates: StudioInferenceSnapCandidate[] = [];
  if (outcome.ok) {
    for (const entry of outcome.ranked) {
      const kind = FROM_PIPELINE_KIND[entry.kind];
      if (!kind) continue;
      const hasAxis = kind === "endpoint" || kind === "midpoint" || kind === "axis";
      candidates.push({
        kind,
        point: toPoint(entry.point),
        distance: entry.distancePx * worldPerPixel,
        sourceIds: entry.sourceIds,
        ...(hasAxis ? { axis: query.axisLock } : {}),
        locked,
      });
    }
  }

  const best = candidates[0] ?? null;
  return {
    revision: STUDIO_BUILD_INFERENCE_REVISION,
    snapped: best !== null,
    candidate: best,
    candidates,
    worldThreshold,
  };
}

/** Keyboard lock helper — toggles axis lock deterministically. */
export function cycleStudioInferenceAxisLock(
  current: StudioInferenceAxisLock,
): StudioInferenceAxisLock {
  if (current === "none") return "x";
  if (current === "x") return "y";
  if (current === "y") return "z";
  return "none";
}
