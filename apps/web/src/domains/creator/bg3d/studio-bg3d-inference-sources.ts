/**
 * 장면 객체(BgPrimitive·커스텀 모델)에서 추론 후보(점·모서리·면)를 만드는 순수 모듈.
 *
 * 후보는 정점을 순회하지 않고 "도형 종류별 고정 특징 표"와 모델의 경계 상자에서만 만든다.
 * 표의 좌표는 `makeGeometry`의 실제 지오메트리와 테스트로 맞춰 둔다(유령 스냅점 방지).
 * 계층(parentId)은 부모 월드 행렬을 곱해 해석하고, 숨김·비정상 변환·한도 초과 객체는 건너뛰며
 * 건너뛴 사실을 `stats`로 알린다. three.js에 의존하지 않는다.
 */

import { PRIMITIVE_DEFS } from "../studio-background-3d-metadata";

import {
  STUDIO_BG3D_INFERENCE_BUDGET,
} from "./studio-bg3d-inference-kinds";
import {
  STUDIO_BG3D_INFERENCE_IDENTITY_MATRIX,
  composeTrsMatrix,
  distance,
  invertColumns3,
  isFiniteMatrix,
  isFiniteVec3,
  isWithinWorldBounds,
  midpoint,
  multiplyMatrices,
  transformPoint,
  transformVector,
  vec3,
} from "./studio-bg3d-inference-math";

import type { BgPrimitiveKind } from "../studio-background-3d-metadata";
import type {
  StudioBg3dInferenceMat3,
  StudioBg3dInferenceMat4,
  StudioBg3dInferenceVec3,
} from "./studio-bg3d-inference-math";

type V3 = StudioBg3dInferenceVec3;

export type StudioBg3dInferencePointKind = "endpoint" | "midpoint" | "center";

export interface StudioBg3dInferencePointFeature {
  readonly id: string;
  readonly sourceId: string;
  readonly kind: StudioBg3dInferencePointKind;
  readonly point: V3;
  /** 출처 안에서의 위치 설명 — "꼭짓점", "윗면 중심" 등. */
  readonly tag: string;
  /** 경계 상자에서 파생한 근사 후보(실제 정점이 아닐 수 있음). */
  readonly approximate: boolean;
}

export type StudioBg3dInferenceEdgeRole = "shape" | "guide" | "wall";

export interface StudioBg3dInferenceEdgeFeature {
  readonly id: string;
  readonly sourceId: string;
  readonly a: V3;
  readonly b: V3;
  readonly tag: string;
  readonly role: StudioBg3dInferenceEdgeRole;
  readonly approximate: boolean;
}

/** 레이로 "면 위"를 정확히 판정할 수 있는 상자·평면 조각(월드 공간 평행육면체). */
export interface StudioBg3dInferenceVolumeFeature {
  readonly id: string;
  readonly sourceId: string;
  readonly shape: "box" | "quad";
  readonly center: V3;
  /** 로컬 ±1 축이 월드로 변환된 반 변 벡터 세 개(quad는 세 번째가 0). */
  readonly axes: readonly [V3, V3, V3];
  /** `axes`로 이루어진 행렬의 역(박스에만 존재). */
  readonly inverse: StudioBg3dInferenceMat3 | null;
  readonly min: V3;
  readonly max: V3;
}

export interface StudioBg3dInferenceSourceStats {
  readonly entities: number;
  readonly skippedHidden: number;
  readonly skippedInvalid: number;
  readonly skippedOverBudget: number;
  readonly points: number;
  readonly edges: number;
  readonly volumes: number;
  readonly truncated: boolean;
}

export interface StudioBg3dInferenceSourceSet {
  /** 입력이 같으면 같은 값 — 색인 재사용 키. */
  readonly revision: string;
  readonly points: readonly StudioBg3dInferencePointFeature[];
  readonly edges: readonly StudioBg3dInferenceEdgeFeature[];
  readonly volumes: readonly StudioBg3dInferenceVolumeFeature[];
  /** sourceId → 사람이 읽는 출처 이름. */
  readonly labels: ReadonlyMap<string, string>;
  readonly stats: StudioBg3dInferenceSourceStats;
}

export interface StudioBg3dInferenceSceneEntity {
  readonly id: string;
  readonly kind: BgPrimitiveKind | "model";
  readonly label?: string;
  readonly position: V3;
  /** 오일러 XYZ, 라디안 — BgPrimitive와 같은 계약. */
  readonly rotation: V3;
  readonly scale: V3;
  readonly parentId?: string | null;
  readonly visible?: boolean;
  /** 모델 로컬 경계 상자(인스턴스 그룹 기준). 모델에서만 사용한다. */
  readonly modelBounds?: { readonly min: V3; readonly max: V3 } | null;
}

export interface StudioBg3dInferenceLineSource {
  readonly id: string;
  readonly a: V3;
  readonly b: V3;
  readonly label: string;
  readonly role: "guide" | "wall";
}

export interface StudioBg3dInferencePointSource {
  readonly id: string;
  readonly point: V3;
  readonly label: string;
  readonly kind: StudioBg3dInferencePointKind;
}

export interface BuildStudioBg3dInferenceSourcesInput {
  readonly entities: readonly StudioBg3dInferenceSceneEntity[];
  /** 사용자 가이드선·방 빌더 벽선처럼 월드 좌표로 이미 주어진 선분. */
  readonly lines?: readonly StudioBg3dInferenceLineSource[];
  readonly points?: readonly StudioBg3dInferencePointSource[];
  /** 이동 중인 선택 객체처럼 후보에서 빼야 하는 출처. 하위 객체는 호출자가 포함해 넘긴다. */
  readonly excludeIds?: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------------------------
// 도형 종류별 특징 표 — `makeGeometry`(studio-background-3d-primitives.ts)의 실제 좌표 기준.
// ---------------------------------------------------------------------------------------------

interface TemplatePoint {
  readonly kind: StudioBg3dInferencePointKind;
  readonly local: V3;
  readonly tag: string;
}

interface TemplateEdge {
  readonly a: V3;
  readonly b: V3;
  readonly tag: string;
}

export interface StudioBg3dInferenceShapeTemplate {
  readonly min: V3;
  readonly max: V3;
  readonly points: readonly TemplatePoint[];
  readonly edges: readonly TemplateEdge[];
  /** 상자·평면만 면을 해석적으로 판정한다. */
  readonly volume: "box" | "quad" | null;
}

function pt(kind: StudioBg3dInferencePointKind, x: number, y: number, z: number, tag: string): TemplatePoint {
  return { kind, local: vec3(x, y, z), tag };
}

function edge(a: V3, b: V3, tag: string): TemplateEdge {
  return { a, b, tag };
}

function boxCorners(min: V3, max: V3): V3[] {
  const corners: V3[] = [];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) corners.push(vec3(x, y, z));
    }
  }
  return corners;
}

/** boxCorners 순서(x→y→z 비트)에서 서로 한 비트만 다른 쌍이 모서리다. */
function boxEdges(corners: readonly V3[], tag: string): TemplateEdge[] {
  const edges: TemplateEdge[] = [];
  for (let i = 0; i < 8; i += 1) {
    for (const bit of [1, 2, 4]) {
      const j = i ^ bit;
      const from = corners[i];
      const to = corners[j];
      if (j > i && from && to) edges.push(edge(from, to, tag));
    }
  }
  return edges;
}

function boxTemplate(min: V3, max: V3, options: { readonly faces: boolean }): StudioBg3dInferenceShapeTemplate {
  const corners = boxCorners(min, max);
  const points: TemplatePoint[] = corners.map((corner) => ({ kind: "endpoint" as const, local: corner, tag: "꼭짓점" }));
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;
  points.push(pt("center", cx, cy, cz, "중심"));
  if (options.faces) {
    points.push(
      pt("center", min[0], cy, cz, "면 중심"),
      pt("center", max[0], cy, cz, "면 중심"),
      pt("center", cx, min[1], cz, "면 중심"),
      pt("center", cx, max[1], cz, "면 중심"),
      pt("center", cx, cy, min[2], "면 중심"),
      pt("center", cx, cy, max[2], "면 중심"),
    );
  }
  return {
    min,
    max,
    points,
    edges: boxEdges(corners, "모서리"),
    volume: null,
  };
}

function snapTiny(value: number): number {
  return Math.abs(value) < 1e-12 ? 0 : value;
}

function ngonRing(radius: number, y: number, count: number): V3[] {
  const ring: V3[] = [];
  for (let i = 0; i < count; i += 1) {
    const theta = (i / count) * Math.PI * 2;
    ring.push(vec3(snapTiny(radius * Math.sin(theta)), y, snapTiny(radius * Math.cos(theta))));
  }
  return ring;
}

function prismTemplate(radius: number, segments: number): StudioBg3dInferenceShapeTemplate {
  const top = ngonRing(radius, 0.5, segments);
  const bottom = ngonRing(radius, -0.5, segments);
  const points: TemplatePoint[] = [
    ...top.map((local) => ({ kind: "endpoint" as const, local, tag: "윗면 꼭짓점" })),
    ...bottom.map((local) => ({ kind: "endpoint" as const, local, tag: "아랫면 꼭짓점" })),
    pt("center", 0, 0.5, 0, "윗면 중심"),
    pt("center", 0, -0.5, 0, "아랫면 중심"),
    pt("center", 0, 0, 0, "중심"),
  ];
  const edges: TemplateEdge[] = [];
  for (let i = 0; i < segments; i += 1) {
    const next = (i + 1) % segments;
    const t0 = top[i];
    const t1 = top[next];
    const b0 = bottom[i];
    const b1 = bottom[next];
    if (t0 && t1) edges.push(edge(t0, t1, "윗면 모서리"));
    if (b0 && b1) edges.push(edge(b0, b1, "아랫면 모서리"));
    if (t0 && b0) edges.push(edge(t0, b0, "옆 모서리"));
  }
  const xs = [...top, ...bottom].map((v) => v[0]);
  const zs = [...top, ...bottom].map((v) => v[2]);
  return {
    min: vec3(Math.min(...xs), -0.5, Math.min(...zs)),
    max: vec3(Math.max(...xs), 0.5, Math.max(...zs)),
    points,
    edges,
    volume: null,
  };
}

function rimQuadrants(radius: number, y: number, tag: string): TemplatePoint[] {
  return [
    pt("endpoint", radius, y, 0, tag),
    pt("endpoint", -radius, y, 0, tag),
    pt("endpoint", 0, y, radius, tag),
    pt("endpoint", 0, y, -radius, tag),
  ];
}

function cylinderLike(radius: number): StudioBg3dInferenceShapeTemplate {
  return {
    min: vec3(-radius, -0.5, -radius),
    max: vec3(radius, 0.5, radius),
    points: [
      pt("center", 0, 0.5, 0, "윗면 중심"),
      pt("center", 0, -0.5, 0, "아랫면 중심"),
      pt("center", 0, 0, 0, "중심"),
      ...rimQuadrants(radius, 0.5, "윗면 가장자리"),
      ...rimQuadrants(radius, -0.5, "아랫면 가장자리"),
    ],
    edges: [],
    volume: null,
  };
}

function buildPyramidTemplate(): StudioBg3dInferenceShapeTemplate {
  const base = ngonRing(0.5, -0.5, 4);
  const apex = vec3(0, 0.5, 0);
  const points: TemplatePoint[] = [
    pt("endpoint", 0, 0.5, 0, "꼭대기"),
    ...base.map((local) => ({ kind: "endpoint" as const, local, tag: "밑면 꼭짓점" })),
    pt("center", 0, -0.5, 0, "밑면 중심"),
    pt("center", 0, 0, 0, "중심"),
  ];
  const edges: TemplateEdge[] = [];
  for (let i = 0; i < 4; i += 1) {
    const from = base[i];
    const to = base[(i + 1) % 4];
    if (from && to) edges.push(edge(from, to, "밑면 모서리"));
    if (from) edges.push(edge(from, apex, "옆 모서리"));
  }
  return { min: vec3(-0.5, -0.5, -0.5), max: vec3(0.5, 0.5, 0.5), points, edges, volume: null };
}

const SHAPE_TEMPLATES: Readonly<Record<BgPrimitiveKind, StudioBg3dInferenceShapeTemplate>> = (() => {
  const box = boxTemplate(vec3(-0.5, -0.5, -0.5), vec3(0.5, 0.5, 0.5), { faces: true });
  // 평면은 XY 평면의 정사각형이다. 네 모서리를 순서대로 잇는다.
  const orderedPlane = [
    vec3(-0.5, -0.5, 0),
    vec3(0.5, -0.5, 0),
    vec3(0.5, 0.5, 0),
    vec3(-0.5, 0.5, 0),
  ];
  const plane: StudioBg3dInferenceShapeTemplate = {
    min: vec3(-0.5, -0.5, 0),
    max: vec3(0.5, 0.5, 0),
    points: [
      ...orderedPlane.map((local) => ({ kind: "endpoint" as const, local, tag: "꼭짓점" })),
      pt("center", 0, 0, 0, "중심"),
    ],
    edges: orderedPlane.flatMap((from, index) => {
      const to = orderedPlane[(index + 1) % 4];
      return to ? [edge(from, to, "모서리")] : [];
    }),
    volume: null,
  };
  const templates: Record<BgPrimitiveKind, StudioBg3dInferenceShapeTemplate> = {
    box: { ...box, volume: "box" },
    plane: { ...plane, volume: "quad" },
    cylinder: cylinderLike(0.3),
    tube: cylinderLike(0.4),
    sphere: {
      min: vec3(-0.5, -0.5, -0.5),
      max: vec3(0.5, 0.5, 0.5),
      points: [
        pt("center", 0, 0, 0, "중심"),
        pt("endpoint", 0.5, 0, 0, "극점"),
        pt("endpoint", -0.5, 0, 0, "극점"),
        pt("endpoint", 0, 0.5, 0, "극점"),
        pt("endpoint", 0, -0.5, 0, "극점"),
        pt("endpoint", 0, 0, 0.5, "극점"),
        pt("endpoint", 0, 0, -0.5, "극점"),
      ],
      edges: [],
      volume: null,
    },
    hemisphere: {
      min: vec3(-0.5, 0, -0.5),
      max: vec3(0.5, 0.5, 0.5),
      points: [
        pt("center", 0, 0, 0, "밑면 중심"),
        pt("endpoint", 0, 0.5, 0, "꼭대기"),
        ...rimQuadrants(0.5, 0, "밑면 가장자리"),
      ],
      edges: [],
      volume: null,
    },
    cone: {
      min: vec3(-0.4, -0.5, -0.4),
      max: vec3(0.4, 0.5, 0.4),
      points: [
        pt("endpoint", 0, 0.5, 0, "꼭대기"),
        pt("center", 0, -0.5, 0, "밑면 중심"),
        pt("center", 0, 0, 0, "중심"),
        ...rimQuadrants(0.4, -0.5, "밑면 가장자리"),
      ],
      edges: [],
      volume: null,
    },
    pyramid: buildPyramidTemplate(),
    triangularPrism: prismTemplate(0.5, 3),
    hexPrism: prismTemplate(0.5, 6),
    torus: {
      min: vec3(-0.55, -0.55, -0.15),
      max: vec3(0.55, 0.55, 0.15),
      points: [
        pt("center", 0, 0, 0, "중심"),
        pt("endpoint", 0.55, 0, 0, "바깥 가장자리"),
        pt("endpoint", -0.55, 0, 0, "바깥 가장자리"),
        pt("endpoint", 0, 0.55, 0, "바깥 가장자리"),
        pt("endpoint", 0, -0.55, 0, "바깥 가장자리"),
      ],
      edges: [],
      volume: null,
    },
    ring: {
      min: vec3(-0.5, -0.5, 0),
      max: vec3(0.5, 0.5, 0),
      points: [
        pt("center", 0, 0, 0, "중심"),
        pt("endpoint", 0.5, 0, 0, "바깥 가장자리"),
        pt("endpoint", -0.5, 0, 0, "바깥 가장자리"),
        pt("endpoint", 0, 0.5, 0, "바깥 가장자리"),
        pt("endpoint", 0, -0.5, 0, "바깥 가장자리"),
        pt("endpoint", 0.2, 0, 0, "안쪽 가장자리"),
        pt("endpoint", -0.2, 0, 0, "안쪽 가장자리"),
        pt("endpoint", 0, 0.2, 0, "안쪽 가장자리"),
        pt("endpoint", 0, -0.2, 0, "안쪽 가장자리"),
      ],
      edges: [],
      volume: null,
    },
    capsule: {
      min: vec3(-0.3, -0.65, -0.3),
      max: vec3(0.3, 0.65, 0.3),
      points: [
        pt("center", 0, 0, 0, "중심"),
        pt("endpoint", 0, 0.65, 0, "윗극점"),
        pt("endpoint", 0, -0.65, 0, "아랫극점"),
        ...rimQuadrants(0.3, 0.35, "윗 원통부 경계"),
        ...rimQuadrants(0.3, -0.35, "아랫 원통부 경계"),
      ],
      edges: [],
      volume: null,
    },
  };
  return Object.freeze(templates);
})();

export function getStudioBg3dInferenceShapeTemplate(
  kind: BgPrimitiveKind,
): StudioBg3dInferenceShapeTemplate {
  return SHAPE_TEMPLATES[kind];
}

// ---------------------------------------------------------------------------------------------
// 변환
// ---------------------------------------------------------------------------------------------

function localMatrixOf(entity: StudioBg3dInferenceSceneEntity): StudioBg3dInferenceMat4 | null {
  if (
    !isFiniteVec3(entity.position)
    || !isFiniteVec3(entity.rotation)
    || !isFiniteVec3(entity.scale)
  ) return null;
  return composeTrsMatrix(entity.position, entity.rotation, entity.scale);
}

const MAX_HIERARCHY_DEPTH = 32;

interface ResolvedEntity {
  readonly entity: StudioBg3dInferenceSceneEntity;
  readonly matrix: StudioBg3dInferenceMat4;
}

function resolveWorldMatrices(
  entities: readonly StudioBg3dInferenceSceneEntity[],
): { readonly resolved: Map<string, ResolvedEntity>; readonly invalid: Set<string>; readonly hidden: Set<string> } {
  const byId = new Map<string, StudioBg3dInferenceSceneEntity>();
  for (const entity of entities) {
    if (!byId.has(entity.id)) byId.set(entity.id, entity);
  }
  const resolved = new Map<string, ResolvedEntity>();
  const invalid = new Set<string>();
  const hidden = new Set<string>();
  const memo = new Map<string, StudioBg3dInferenceMat4 | null>();

  const worldOf = (id: string, depth: number, trail: Set<string>): StudioBg3dInferenceMat4 | null => {
    if (memo.has(id)) return memo.get(id) ?? null;
    const entity = byId.get(id);
    if (!entity) return STUDIO_BG3D_INFERENCE_IDENTITY_MATRIX;
    const local = localMatrixOf(entity);
    if (!local) {
      memo.set(id, null);
      return null;
    }
    let world = local;
    const parentId = entity.parentId;
    if (parentId && depth < MAX_HIERARCHY_DEPTH && !trail.has(parentId) && byId.has(parentId)) {
      trail.add(id);
      const parentWorld = worldOf(parentId, depth + 1, trail);
      trail.delete(id);
      if (!parentWorld) {
        memo.set(id, null);
        return null;
      }
      world = multiplyMatrices(parentWorld, local);
    }
    memo.set(id, world);
    return world;
  };

  const isHiddenByAncestry = (entity: StudioBg3dInferenceSceneEntity): boolean => {
    const seen = new Set<string>();
    let current: StudioBg3dInferenceSceneEntity | undefined = entity;
    for (let depth = 0; current && depth <= MAX_HIERARCHY_DEPTH; depth += 1) {
      if (current.visible === false) return true;
      if (seen.has(current.id)) return false;
      seen.add(current.id);
      const parentId: string | null | undefined = current.parentId;
      current = parentId ? byId.get(parentId) : undefined;
    }
    return false;
  };

  for (const entity of byId.values()) {
    if (isHiddenByAncestry(entity)) {
      hidden.add(entity.id);
      continue;
    }
    const matrix = worldOf(entity.id, 0, new Set<string>());
    if (!matrix || !isFiniteMatrix(matrix)) {
      invalid.add(entity.id);
      continue;
    }
    resolved.set(entity.id, { entity, matrix });
  }
  return { resolved, invalid, hidden };
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function defaultLabel(entity: StudioBg3dInferenceSceneEntity): string {
  if (entity.label && entity.label.trim()) return entity.label.trim();
  if (entity.kind === "model") return "모델";
  return PRIMITIVE_DEFS[entity.kind].label;
}

function boundsOfCorners(corners: readonly V3[]): { min: V3; max: V3 } {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const corner of corners) {
    minX = Math.min(minX, corner[0]);
    minY = Math.min(minY, corner[1]);
    minZ = Math.min(minZ, corner[2]);
    maxX = Math.max(maxX, corner[0]);
    maxY = Math.max(maxY, corner[1]);
    maxZ = Math.max(maxZ, corner[2]);
  }
  return { min: vec3(minX, minY, minZ), max: vec3(maxX, maxY, maxZ) };
}

function buildVolume(
  entity: StudioBg3dInferenceSceneEntity,
  shape: "box" | "quad",
  template: StudioBg3dInferenceShapeTemplate,
  matrix: StudioBg3dInferenceMat4,
): StudioBg3dInferenceVolumeFeature | null {
  const half = vec3(
    (template.max[0] - template.min[0]) / 2,
    (template.max[1] - template.min[1]) / 2,
    (template.max[2] - template.min[2]) / 2,
  );
  const localCenter = vec3(
    (template.min[0] + template.max[0]) / 2,
    (template.min[1] + template.max[1]) / 2,
    (template.min[2] + template.max[2]) / 2,
  );
  const center = transformPoint(matrix, localCenter);
  const axes: readonly [V3, V3, V3] = [
    transformVector(matrix, vec3(half[0], 0, 0)),
    transformVector(matrix, vec3(0, half[1], 0)),
    transformVector(matrix, vec3(0, 0, half[2])),
  ];
  const inverse = shape === "box" ? invertColumns3(axes[0], axes[1], axes[2]) : null;
  if (shape === "box" && !inverse) return null;
  const corners: V3[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corners.push(vec3(
          center[0] + sx * axes[0][0] + sy * axes[1][0] + sz * axes[2][0],
          center[1] + sx * axes[0][1] + sy * axes[1][1] + sz * axes[2][1],
          center[2] + sx * axes[0][2] + sy * axes[1][2] + sz * axes[2][2],
        ));
      }
    }
  }
  const { min, max } = boundsOfCorners(corners);
  return { id: `${entity.id}:v`, sourceId: entity.id, shape, center, axes, inverse, min, max };
}

const MIN_EDGE_LENGTH = 1e-6;

/**
 * 장면 객체·가이드선·벽선에서 추론 후보를 만든다. 입력은 변형하지 않으며 결과는 결정적이다.
 */
export function buildStudioBg3dInferenceSourceSet(
  input: BuildStudioBg3dInferenceSourcesInput,
): StudioBg3dInferenceSourceSet {
  const budget = STUDIO_BG3D_INFERENCE_BUDGET;
  const exclude = input.excludeIds ?? new Set<string>();
  const { resolved, invalid, hidden } = resolveWorldMatrices(input.entities);
  const points: StudioBg3dInferencePointFeature[] = [];
  const edges: StudioBg3dInferenceEdgeFeature[] = [];
  const volumes: StudioBg3dInferenceVolumeFeature[] = [];
  const labels = new Map<string, string>();
  let skippedOverBudget = 0;
  let skippedInvalid = invalid.size;
  let entityCount = 0;
  let truncated = false;
  const signature: string[] = [];

  const pushPoint = (feature: StudioBg3dInferencePointFeature): void => {
    if (!isWithinWorldBounds(feature.point)) {
      skippedInvalid += 1;
      return;
    }
    points.push(feature);
  };
  const pushEdge = (feature: StudioBg3dInferenceEdgeFeature): void => {
    if (!isWithinWorldBounds(feature.a) || !isWithinWorldBounds(feature.b)) {
      skippedInvalid += 1;
      return;
    }
    if (distance(feature.a, feature.b) < MIN_EDGE_LENGTH) return;
    edges.push(feature);
    pushPoint({
      id: `${feature.id}:mid`,
      sourceId: feature.sourceId,
      kind: "midpoint",
      point: midpoint(feature.a, feature.b),
      tag: feature.tag,
      approximate: feature.approximate,
    });
  };

  for (const { entity, matrix } of resolved.values()) {
    if (exclude.has(entity.id)) continue;
    if (entityCount >= budget.maxSources || points.length + edges.length >= budget.maxIndexedFeatures) {
      skippedOverBudget += 1;
      truncated = true;
      continue;
    }
    entityCount += 1;
    const label = defaultLabel(entity);
    labels.set(entity.id, label);
    signature.push(`${entity.id}|${entity.kind}|${matrix.map((value) => round6(value)).join(",")}`);

    if (entity.kind === "model") {
      const bounds = entity.modelBounds;
      if (
        bounds
        && isFiniteVec3(bounds.min)
        && isFiniteVec3(bounds.max)
        && bounds.max[0] >= bounds.min[0]
        && bounds.max[1] >= bounds.min[1]
        && bounds.max[2] >= bounds.min[2]
      ) {
        const template = boxTemplate(bounds.min, bounds.max, { faces: false });
        signature.push(`${entity.id}|bounds|${[...bounds.min, ...bounds.max].map(round6).join(",")}`);
        template.points.forEach((templatePoint, index) => {
          pushPoint({
            id: `${entity.id}:p${index}`,
            sourceId: entity.id,
            kind: templatePoint.kind,
            point: transformPoint(matrix, templatePoint.local),
            tag: templatePoint.kind === "endpoint" ? "경계 상자 꼭짓점" : "경계 상자 중심",
            approximate: true,
          });
        });
        template.edges.forEach((templateEdge, index) => {
          pushEdge({
            id: `${entity.id}:e${index}`,
            sourceId: entity.id,
            a: transformPoint(matrix, templateEdge.a),
            b: transformPoint(matrix, templateEdge.b),
            tag: "경계 상자 모서리",
            role: "shape",
            approximate: true,
          });
        });
      } else {
        pushPoint({
          id: `${entity.id}:p0`,
          sourceId: entity.id,
          kind: "center",
          point: transformPoint(matrix, vec3(0, 0, 0)),
          tag: "모델 원점",
          approximate: true,
        });
      }
      continue;
    }

    const template = SHAPE_TEMPLATES[entity.kind];
    template.points.forEach((templatePoint, index) => {
      pushPoint({
        id: `${entity.id}:p${index}`,
        sourceId: entity.id,
        kind: templatePoint.kind,
        point: transformPoint(matrix, templatePoint.local),
        tag: templatePoint.tag,
        approximate: false,
      });
    });
    template.edges.forEach((templateEdge, index) => {
      pushEdge({
        id: `${entity.id}:e${index}`,
        sourceId: entity.id,
        a: transformPoint(matrix, templateEdge.a),
        b: transformPoint(matrix, templateEdge.b),
        tag: templateEdge.tag,
        role: "shape",
        approximate: false,
      });
    });
    if (template.volume) {
      const volume = buildVolume(entity, template.volume, template, matrix);
      if (volume) volumes.push(volume);
      else skippedInvalid += 1;
    }
  }

  for (const line of input.lines ?? []) {
    if (exclude.has(line.id)) continue;
    if (!isFiniteVec3(line.a) || !isFiniteVec3(line.b)) {
      skippedInvalid += 1;
      continue;
    }
    labels.set(line.id, line.label);
    signature.push(`${line.id}|line|${[...line.a, ...line.b].map(round6).join(",")}`);
    pushEdge({
      id: `${line.id}:e`,
      sourceId: line.id,
      a: line.a,
      b: line.b,
      tag: line.role === "wall" ? "벽선" : "가이드선",
      role: line.role,
      approximate: false,
    });
    pushPoint({
      id: `${line.id}:a`,
      sourceId: line.id,
      kind: "endpoint",
      point: line.a,
      tag: line.role === "wall" ? "벽선 끝점" : "가이드선 끝점",
      approximate: false,
    });
    pushPoint({
      id: `${line.id}:b`,
      sourceId: line.id,
      kind: "endpoint",
      point: line.b,
      tag: line.role === "wall" ? "벽선 끝점" : "가이드선 끝점",
      approximate: false,
    });
  }

  for (const source of input.points ?? []) {
    if (exclude.has(source.id) || !isFiniteVec3(source.point)) continue;
    labels.set(source.id, source.label);
    signature.push(`${source.id}|point|${source.point.map(round6).join(",")}`);
    pushPoint({
      id: `${source.id}:p`,
      sourceId: source.id,
      kind: source.kind,
      point: source.point,
      // 이름이 곧 출처 설명이라 위치 설명(tag)은 비워 "핀 · 핀"처럼 겹쳐 읽히지 않게 한다.
      tag: "",
      approximate: false,
    });
  }

  return Object.freeze({
    revision: fnv1a(signature.join("\n")),
    points,
    edges,
    volumes,
    labels,
    stats: Object.freeze({
      entities: entityCount,
      skippedHidden: hidden.size,
      skippedInvalid,
      skippedOverBudget,
      points: points.length,
      edges: edges.length,
      volumes: volumes.length,
      truncated,
    }),
  });
}

/** 이동 대상(및 하위)의 ID 집합을 만든다. 계층 순환에 안전하다. */
export function collectStudioBg3dInferenceDescendantIds(
  rootIds: Iterable<string>,
  entities: readonly Pick<StudioBg3dInferenceSceneEntity, "id" | "parentId">[],
): Set<string> {
  const children = new Map<string, string[]>();
  for (const entity of entities) {
    if (!entity.parentId) continue;
    const list = children.get(entity.parentId);
    if (list) list.push(entity.id);
    else children.set(entity.parentId, [entity.id]);
  }
  const result = new Set<string>();
  const stack = [...rootIds];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || result.has(id)) continue;
    result.add(id);
    for (const child of children.get(id) ?? []) stack.push(child);
  }
  return result;
}

/** 키보드 점 고르기 목록처럼 가장 가까운 순으로 상한까지만 돌려준다. */
export function listStudioBg3dInferencePointsNear(
  source: StudioBg3dInferenceSourceSet,
  focus: V3,
  limit: number,
  predicate?: (feature: StudioBg3dInferencePointFeature) => boolean,
): StudioBg3dInferencePointFeature[] {
  const cap = Math.max(0, Math.min(limit, 512));
  const ranked: Array<{ feature: StudioBg3dInferencePointFeature; distance: number }> = [];
  for (const feature of source.points) {
    if (predicate && !predicate(feature)) continue;
    ranked.push({ feature, distance: distance(feature.point, focus) });
  }
  ranked.sort((left, right) =>
    left.distance - right.distance || (left.feature.id < right.feature.id ? -1 : 1));
  return ranked.slice(0, cap).map((entry) => entry.feature);
}
