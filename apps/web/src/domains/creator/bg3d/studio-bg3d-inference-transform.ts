/**
 * 추론 파이프라인 ↔ 변형 스냅 계획기(`studio-bg3d-transform-snap-planner`) 합류 어댑터 — 순수 모듈.
 *
 * 계획기는 "끌고 있는 객체의 기준점이 어느 후보 점·면에 붙어야 하는가"를 축·평면 제약과 함께 풀어 주지만,
 * 후보를 만들어 주는 쪽이 없었다. 여기서는 끌고 있는 객체의 기준점(경계 상자 모서리·바닥 중심 등)마다
 * 공간 색인에서 근처 끝점·중간점·중심(→ vertex 후보)과 상자 면의 최근접점(→ surface 후보)을 상한 안에서
 * 모아 계획기에 넘기고, 기준점별 계획 중 화면 거리가 가장 가까운 것을 고른다.
 *
 * 포인터 이동 경로이므로 기준점 수(`MAX_SNAP_BASES`)와 기준점당 후보 수를 묶고, 사용한 비용을
 * `stats`로 돌려준다. 증분(격자) 스냅은 계획기의 폴백 동작을 그대로 쓴다.
 */

import {
  STUDIO_BG3D_INFERENCE_BUDGET,
  studioBg3dInferenceKindLabel,
} from "./studio-bg3d-inference-kinds";
import {
  add,
  applyMatrix3,
  distance,
  isFiniteVec3,
  normalize,
  scale,
  sub,
  vec3,
} from "./studio-bg3d-inference-math";
import { planStudioBg3dTransformSnap } from "./studio-bg3d-transform-snap-planner";

import type { StudioBg3dInferenceIndex } from "./studio-bg3d-inference-index";
import type { StudioBg3dInferenceKind } from "./studio-bg3d-inference-kinds";
import type { StudioBg3dInferenceVec3 } from "./studio-bg3d-inference-math";
import type { StudioBg3dInferenceVolumeFeature } from "./studio-bg3d-inference-sources";
import type { StudioBg3dInferenceResult } from "./studio-bg3d-inference-types";
import type {
  StudioBg3dTransformConstraint,
  StudioBg3dTransformOrientation,
  StudioBg3dTransformSnapCandidate,
  StudioBg3dTransformSnapModifiers,
  StudioBg3dTransformSnapSettings,
  StudioBg3dTransformSnapSuccess,
} from "./studio-bg3d-transform-snap-planner";

type V3 = StudioBg3dInferenceVec3;

/** 한 번의 드래그 샘플에서 평가하는 기준점 수 상한 — 비용이 기준점 수에 선형으로 늘기 때문이다. */
export const STUDIO_BG3D_INFERENCE_TRANSFORM_MAX_SNAP_BASES = 9;
/** 기준점 하나당 계획기에 넘기는 후보 상한. */
export const STUDIO_BG3D_INFERENCE_TRANSFORM_MAX_CANDIDATES_PER_BASE = 24;

export interface StudioBg3dInferenceTransformSnapInput {
  readonly index: StudioBg3dInferenceIndex;
  /** 드래그를 시작할 때의 객체(피벗) 월드 위치. */
  readonly startWorldPosition: V3;
  /** 이번 포인터 샘플이 제안하는 스냅 전 월드 위치. */
  readonly proposedWorldPosition: V3;
  /** 드래그 시작 시점의 기준점들(월드). 예: 경계 상자 바닥 중심과 바닥 모서리 네 개. */
  readonly snapBases: readonly V3[];
  readonly orientation: StudioBg3dTransformOrientation;
  readonly constraint: StudioBg3dTransformConstraint;
  readonly snap: StudioBg3dTransformSnapSettings;
  readonly modifiers?: StudioBg3dTransformSnapModifiers;
  /** 화면 1px에 해당하는 월드 길이(객체 깊이 기준). */
  readonly worldPerPixel: number;
  /** 끌고 있는 객체(및 하위)의 ID — 자기 자신에게는 붙지 않는다. */
  readonly excludeSourceIds?: ReadonlySet<string>;
}

export interface StudioBg3dInferenceTransformSnapStats {
  readonly bases: number;
  readonly candidatesPlanned: number;
  readonly featuresScanned: number;
  readonly truncated: boolean;
}

export interface StudioBg3dInferenceTransformSnapSuccess {
  readonly ok: true;
  readonly plan: StudioBg3dTransformSnapSuccess;
  /** 이긴 기준점의 순번(`snapBases` 기준). 증분·무스냅이면 0. */
  readonly baseIndex: number;
  /** 기하(끝점·면 등) 스냅이 이겼는지. */
  readonly geometrySnapped: boolean;
  /** 뷰포트 마커·안내용 요약. 기하 스냅이 아니면 null. */
  readonly inference: StudioBg3dInferenceResult | null;
  readonly stats: StudioBg3dInferenceTransformSnapStats;
}

export interface StudioBg3dInferenceTransformSnapFailure {
  readonly ok: false;
  readonly reason: "invalid-input" | "planner-rejected";
  readonly message: string;
}

export type StudioBg3dInferenceTransformSnapOutcome =
  | StudioBg3dInferenceTransformSnapSuccess
  | StudioBg3dInferenceTransformSnapFailure;

interface CandidateMeta {
  readonly kind: StudioBg3dInferenceKind;
  readonly sourceId: string;
  readonly tag: string;
  readonly approximate: boolean;
}

function failure(
  reason: StudioBg3dInferenceTransformSnapFailure["reason"],
  message: string,
): StudioBg3dInferenceTransformSnapFailure {
  return Object.freeze({ ok: false, reason, message });
}

/** 상자 표면에서 점 p에 가장 가까운 점과 그 면의 바깥 법선. 상자 안쪽 점은 가장 가까운 면으로 밀어낸다. */
export function closestPointOnStudioBg3dInferenceVolume(
  volume: StudioBg3dInferenceVolumeFeature,
  point: V3,
): { readonly point: V3; readonly normal: V3 } | null {
  if (volume.shape !== "box" || !volume.inverse) return null;
  const local = applyMatrix3(volume.inverse, sub(point, volume.center));
  const clamped: [number, number, number] = [
    Math.max(-1, Math.min(1, local[0])),
    Math.max(-1, Math.min(1, local[1])),
    Math.max(-1, Math.min(1, local[2])),
  ];
  const inside = Math.abs(local[0]) <= 1 && Math.abs(local[1]) <= 1 && Math.abs(local[2]) <= 1;
  // 접촉한 면의 축: 바깥이면 가장 많이 벗어난 축, 안쪽이면 경계에 가장 가까운(절댓값이 큰) 축.
  let faceAxis = 0;
  let strongest = -Infinity;
  for (let axis = 0; axis < 3; axis += 1) {
    const magnitude = Math.abs(local[axis] ?? 0);
    const score = inside ? magnitude : magnitude - 1;
    if (score > strongest) {
      strongest = score;
      faceAxis = axis;
    }
  }
  const side = (local[faceAxis] ?? 0) >= 0 ? 1 : -1;
  if (inside) clamped[faceAxis] = side;
  const [e1, e2, e3] = volume.axes;
  const surfacePoint = vec3(
    volume.center[0] + clamped[0] * e1[0] + clamped[1] * e2[0] + clamped[2] * e3[0],
    volume.center[1] + clamped[0] * e1[1] + clamped[1] * e2[1] + clamped[2] * e3[1],
    volume.center[2] + clamped[0] * e1[2] + clamped[1] * e2[2] + clamped[2] * e3[2],
  );
  const axes = [e1, e2, e3];
  const first = axes[(faceAxis + 1) % 3];
  const second = axes[(faceAxis + 2) % 3];
  const reference = axes[faceAxis];
  if (!first || !second || !reference) return null;
  const unit = normalize(vec3(
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ));
  if (!unit) return null;
  const alignment = unit[0] * reference[0] + unit[1] * reference[1] + unit[2] * reference[2];
  return { point: surfacePoint, normal: alignment * side >= 0 ? unit : scale(unit, -1) };
}

function buildInferenceSummary(
  meta: CandidateMeta,
  index: StudioBg3dInferenceIndex,
  plan: StudioBg3dTransformSnapSuccess,
): StudioBg3dInferenceResult {
  const target = plan.snap.targetWorld ?? plan.snapBaseWorld;
  const label = studioBg3dInferenceKindLabel(meta.kind);
  const name = index.source.labels.get(meta.sourceId) ?? null;
  const base = name ? (meta.tag ? `${name} · ${meta.tag}` : name) : meta.tag;
  const detail = meta.approximate ? `${base} (경계 상자 기준)` : base;
  return Object.freeze({
    kind: meta.kind,
    point: target,
    label,
    detail,
    announcement: `${label} — ${detail}`,
    axis: null,
    direction: null,
    normal: plan.snap.normalWorld,
    sourceIds: Object.freeze([meta.sourceId]),
    edgeId: null,
    alignmentOrigin: null,
    relation: null,
    guides: Object.freeze([]),
    constraint: Object.freeze({ kind: "none" as const }),
    projected: plan.snap.constraintResidualWorld > 1e-6,
    approximate: meta.approximate,
    distancePx: plan.snap.distanceSpace === "screen-px" ? plan.snap.distance : null,
  });
}

/**
 * 끌고 있는 객체의 위치를 주변 끝점·중간점·중심·상자 면에 맞춰 계획한다.
 * 계획기의 축·평면 제약, Alt(반전)·증분 스냅 규칙을 그대로 따른다.
 */
export function planStudioBg3dInferenceTransformSnap(
  input: StudioBg3dInferenceTransformSnapInput,
): StudioBg3dInferenceTransformSnapOutcome {
  if (
    !isFiniteVec3(input.startWorldPosition)
    || !isFiniteVec3(input.proposedWorldPosition)
    || !Number.isFinite(input.worldPerPixel)
    || input.worldPerPixel <= 0
  ) return failure("invalid-input", "드래그 위치 또는 화면 배율이 올바르지 않아 스냅을 건너뜁니다.");

  const bases = input.snapBases
    .filter(isFiniteVec3)
    .slice(0, STUDIO_BG3D_INFERENCE_TRANSFORM_MAX_SNAP_BASES);
  const baseList = bases.length > 0 ? bases : [input.startWorldPosition];

  // 제약만 적용한 이동량을 얻는다 — 증분·기하 스냅을 끈 계획의 worldDelta가 곧 제약된 이동량이다.
  const unsnapped = planStudioBg3dTransformSnap({
    startWorldPosition: input.startWorldPosition,
    proposedWorldPosition: input.proposedWorldPosition,
    orientation: input.orientation,
    constraint: input.constraint,
    snap: { enabled: false, modes: [] },
    candidates: [],
  });
  if (!unsnapped.ok) return failure("planner-rejected", "이동 제약을 해석하지 못해 스냅을 건너뜁니다.");
  const constrainedDelta = unsnapped.worldDelta;

  const geometryModes = input.snap.modes.filter((mode) => mode === "vertex" || mode === "surface");
  const modifiers = input.modifiers;
  const effectiveEnabled = input.snap.enabled !== (modifiers?.invertSnapping === true);
  const geometryEnabled = effectiveEnabled && geometryModes.length > 0 && modifiers?.suppressGeometrySnaps !== true;
  const activationPx = input.snap.geometryActivationRadiusPx ?? 12;
  const radius = activationPx * input.worldPerPixel;

  let best: {
    readonly plan: StudioBg3dTransformSnapSuccess;
    readonly baseIndex: number;
    readonly meta: CandidateMeta | null;
  } | null = null;
  let candidatesPlanned = 0;
  let featuresScanned = 0;
  let truncated = false;

  for (let baseIndex = 0; baseIndex < baseList.length; baseIndex += 1) {
    const base = baseList[baseIndex];
    if (!base) continue;
    const probePoint = add(base, constrainedDelta);
    const candidates: StudioBg3dTransformSnapCandidate[] = [];
    const metaById = new Map<string, CandidateMeta>();
    if (geometryEnabled) {
      const raw = input.index.query({ a: probePoint, b: probePoint, radius });
      featuresScanned += raw.stats.featuresScanned;
      truncated = truncated || raw.stats.truncated;
      const pointCandidates: Array<{ id: string; point: V3; px: number; meta: CandidateMeta }> = [];
      if (geometryModes.includes("vertex")) {
        for (const feature of raw.points) {
          if (input.excludeSourceIds?.has(feature.sourceId)) continue;
          const px = distance(feature.point, probePoint) / input.worldPerPixel;
          if (px > activationPx) continue;
          pointCandidates.push({
            id: feature.id,
            point: feature.point,
            px,
            meta: { kind: feature.kind, sourceId: feature.sourceId, tag: feature.tag, approximate: feature.approximate },
          });
        }
      }
      pointCandidates.sort((left, right) => left.px - right.px || (left.id < right.id ? -1 : 1));
      const surfaceCandidates: Array<{ id: string; point: V3; normal: V3; px: number; meta: CandidateMeta }> = [];
      // 추론 우선순위와 같게: 활성 반경 안에 점(끝점·중간점·중심)이 있으면 면보다 점이 먼저다.
      // 계획기는 화면 거리가 가까운 쪽을 고르므로, 점이 있는 기준점에서는 면 후보를 아예 넘기지 않는다.
      if (geometryModes.includes("surface") && pointCandidates.length === 0) {
        for (const volume of raw.volumes) {
          if (input.excludeSourceIds?.has(volume.sourceId)) continue;
          const closest = closestPointOnStudioBg3dInferenceVolume(volume, probePoint);
          if (!closest) continue;
          const px = distance(closest.point, probePoint) / input.worldPerPixel;
          if (px > activationPx) continue;
          surfaceCandidates.push({
            id: volume.id,
            point: closest.point,
            normal: closest.normal,
            px,
            meta: { kind: "on-face", sourceId: volume.sourceId, tag: "면", approximate: false },
          });
        }
      }
      surfaceCandidates.sort((left, right) => left.px - right.px || (left.id < right.id ? -1 : 1));
      const room = STUDIO_BG3D_INFERENCE_TRANSFORM_MAX_CANDIDATES_PER_BASE;
      pointCandidates.slice(0, room).forEach((entry, order) => {
        const id = `v${order}`;
        candidates.push({ kind: "vertex", id, pointWorld: entry.point, screenDistancePx: entry.px });
        metaById.set(id, entry.meta);
      });
      surfaceCandidates.slice(0, Math.max(0, room - candidates.length)).forEach((entry, order) => {
        const id = `s${order}`;
        candidates.push({ kind: "surface", id, pointWorld: entry.point, normalWorld: entry.normal, screenDistancePx: entry.px });
        metaById.set(id, entry.meta);
      });
    }
    candidatesPlanned += candidates.length;
    const planned = planStudioBg3dTransformSnap({
      startWorldPosition: input.startWorldPosition,
      proposedWorldPosition: input.proposedWorldPosition,
      snapBaseWorldPosition: base,
      orientation: input.orientation,
      constraint: input.constraint,
      snap: input.snap,
      ...(modifiers ? { modifiers } : {}),
      candidates,
      budgets: {
        maxCandidates: STUDIO_BG3D_INFERENCE_TRANSFORM_MAX_CANDIDATES_PER_BASE,
        maxEvaluations: STUDIO_BG3D_INFERENCE_TRANSFORM_MAX_CANDIDATES_PER_BASE + 1,
      },
    });
    if (!planned.ok) continue;
    const meta = planned.snap.candidateId ? metaById.get(planned.snap.candidateId) ?? null : null;
    const isGeometry = planned.snap.kind === "vertex" || planned.snap.kind === "surface";
    if (!best) {
      best = { plan: planned, baseIndex, meta };
    } else if (isGeometry && best.meta === null) {
      best = { plan: planned, baseIndex, meta };
    } else if (
      isGeometry
      && best.meta !== null
      && (planned.snap.distance ?? Infinity) < (best.plan.snap.distance ?? Infinity)
    ) {
      best = { plan: planned, baseIndex, meta };
    }
  }

  const chosen = best;
  if (!chosen) return failure("planner-rejected", "스냅 계획을 만들지 못했습니다.");
  return Object.freeze({
    ok: true,
    plan: chosen.plan,
    baseIndex: chosen.baseIndex,
    geometrySnapped: chosen.meta !== null,
    inference: chosen.meta ? buildInferenceSummary(chosen.meta, input.index, chosen.plan) : null,
    stats: Object.freeze({
      bases: baseList.length,
      candidatesPlanned,
      featuresScanned,
      truncated,
    }),
  });
}

/** 비용 상한을 문서·테스트에서 한곳으로 보기 위한 요약. */
export const STUDIO_BG3D_INFERENCE_TRANSFORM_BUDGET = Object.freeze({
  maxBases: STUDIO_BG3D_INFERENCE_TRANSFORM_MAX_SNAP_BASES,
  maxCandidatesPerBase: STUDIO_BG3D_INFERENCE_TRANSFORM_MAX_CANDIDATES_PER_BASE,
  maxFeaturesScannedPerBase: STUDIO_BG3D_INFERENCE_BUDGET.maxFeaturesScannedPerQuery,
});
