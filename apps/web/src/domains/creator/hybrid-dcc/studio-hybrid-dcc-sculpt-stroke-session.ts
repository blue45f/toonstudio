/** 한 gesture의 임시 메시만 소유한다. 문서·저널·bridge에는 접근하지 않는다. */
import {
  hashStudioEditableMesh,
  validateStudioEditableMeshSerializableAuthority,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";
import { STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET } from "../mesh-surface/studio-mesh-surface-interactive-budget";
import { planStudioMeshSurface } from "../mesh-surface/studio-mesh-surface-plan";

import { applyStudioSculptStroke, type StudioSculptBrushKind, type StudioSculptStroke } from "./studio-hybrid-sculpt-kernel";

export type StudioSculptStrokeBrush = Omit<StudioSculptStroke, "center">;

export interface StudioSculptStrokeSource {
  readonly documentId: string;
  /** 동일 내용으로 다시 열린 작업대나 다른 편집 상태에 receipt를 재사용하지 않는다. */
  readonly workspaceIdentity: object;
  readonly documentStateIdentity: object;
  readonly assetId: string;
  readonly mesh: StudioEditableMesh;
  readonly meshHash: string;
  readonly meshRevision: number;
}

export interface StudioSculptGeometryPreview {
  readonly assetId: string;
  readonly sourceMesh: StudioEditableMesh;
  readonly sourceMeshHash: string;
  readonly sourceMeshRevision: number;
  readonly mesh: StudioEditableMesh;
  readonly meshHash: string;
  readonly strokeRevision: number;
}

const sessionBrand = Symbol("studio-sculpt-session");
const receiptBrand = Symbol("studio-sculpt-receipt");
export interface StudioSculptStrokeSession { readonly [sessionBrand]: true }
export interface StudioSculptStrokeReceipt { readonly [receiptBrand]: true }
export type StudioSculptStrokeStepResult =
  | { readonly ok: true; readonly preview: StudioSculptGeometryPreview | null }
  | { readonly ok: false; readonly detail: string };

interface StrokeState {
  readonly source: StudioSculptStrokeSource;
  readonly brush: StudioSculptStrokeBrush;
  readonly mask: Float32Array | undefined;
  phase: "drawing" | "sealed" | "committing" | "committed" | "cancelled" | "failed";
  mesh: StudioEditableMesh;
  meshHash: string;
  sampleCount: number;
  preview: StudioSculptGeometryPreview | null;
  receipt: StudioSculptStrokeReceipt | null;
}

export interface StudioSculptStrokeCommitData {
  readonly source: StudioSculptStrokeSource;
  readonly mesh: StudioEditableMesh;
  readonly meshHash: string;
  readonly sampleCount: number;
}

const sessions = new WeakMap<StudioSculptStrokeSession, StrokeState>();
const receipts = new WeakMap<StudioSculptStrokeReceipt, StrokeState>();
const kinds: readonly StudioSculptBrushKind[] = ["grab", "smooth", "inflate", "clay", "crease", "flatten", "scrape", "snakeHook"];

function finitePoint(point: StudioMeshVec3): boolean {
  return Boolean(point) && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

/** 시작·최종 반영에서 화면과 같은 surface 예산·Float32 표현 한계를 확인한다. */
export function validateStudioSculptStrokeMesh(mesh: StudioEditableMesh): void {
  const authority = validateStudioEditableMeshSerializableAuthority(mesh);
  if (!authority.ok) throw new Error(`조형 메시의 정본을 확인할 수 없습니다: ${authority.detail}`);
  const surface = planStudioMeshSurface(mesh, STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET, {
    allowCreaseMetadata: true, topologyPolicy: "editable",
  });
  if (!surface.ok) throw new Error(`조형 메시를 표시할 수 없습니다: ${surface.issue.detail}`);
}

function validateSource(state: StrokeState): void {
  if (hashStudioEditableMesh(state.source.mesh) !== state.source.meshHash) {
    throw new Error("조형을 시작한 원본 메시가 바뀌었습니다. 다시 시작하세요.");
  }
  if (hashStudioEditableMesh(state.mesh) !== state.meshHash) {
    throw new Error("조형 미리보기의 메시가 발급된 내용과 다릅니다.");
  }
}

function discard(state: StrokeState, phase: "cancelled" | "failed" | "committed"): void {
  state.phase = phase;
  state.mesh = state.source.mesh;
  state.meshHash = state.source.meshHash;
  state.preview = null;
  state.receipt = null;
}

function frozenBrush(brush: StudioSculptStrokeBrush): StudioSculptStrokeBrush {
  if (!brush || !kinds.includes(brush.kind) || !Number.isFinite(brush.radius) || brush.radius <= 0
    || !Number.isFinite(brush.strength) || (brush.direction !== undefined && !finitePoint(brush.direction))) {
    throw new Error("조형 브러시 종류·양의 반경·유한한 강도와 방향을 확인하세요.");
  }
  return Object.freeze({ kind: brush.kind, radius: brush.radius, strength: brush.strength,
    ...(brush.direction === undefined ? {} : { direction: Object.freeze({
      x: brush.direction.x, y: brush.direction.y, z: brush.direction.z,
    }) }),
  });
}

export function createStudioSculptStrokeSession(
  source: StudioSculptStrokeSource,
  brush: StudioSculptStrokeBrush,
  mask?: Float32Array | null,
): StudioSculptStrokeSession {
  if (!source || typeof source.documentId !== "string" || source.documentId.length === 0
    || typeof source.assetId !== "string" || source.assetId.length === 0
    || typeof source.workspaceIdentity !== "object" || source.workspaceIdentity === null
    || typeof source.documentStateIdentity !== "object" || source.documentStateIdentity === null
    || !Number.isSafeInteger(source.meshRevision) || source.meshRevision < 1) {
    throw new Error("조형 원본의 작업대·문서·오브젝트·편집 버전을 확인하세요.");
  }
  const snapshotBrush = frozenBrush(brush);
  validateStudioSculptStrokeMesh(source.mesh);
  if (hashStudioEditableMesh(source.mesh) !== source.meshHash) throw new Error("조형 원본 메시의 해시가 현재 내용과 다릅니다.");
  if (mask !== undefined && mask !== null && (!(mask instanceof Float32Array)
    || mask.length !== source.mesh.vertices.length || mask.some((value) => !Number.isFinite(value)))) {
    throw new Error("조형 mask는 원본 정점 순서와 같은 길이의 유한 Float32 배열이어야 합니다.");
  }
  const session: StudioSculptStrokeSession = { [sessionBrand]: true };
  Object.freeze(session);
  sessions.set(session, {
    source: Object.freeze({ ...source }), brush: snapshotBrush, mask: mask?.slice(), phase: "drawing",
    mesh: source.mesh, meshHash: source.meshHash, sampleCount: 0, preview: null, receipt: null,
  });
  return session;
}

/** 받은 점을 생략하거나 보간하지 않고 기존 8종 kernel에 순서대로 전달한다. */
export function appendStudioSculptStrokeSample(
  session: StudioSculptStrokeSession,
  localPoint: StudioMeshVec3,
): StudioSculptStrokeStepResult {
  const state = sessions.get(session);
  if (!state || state.phase !== "drawing") return { ok: false, detail: "이미 끝났거나 발급되지 않은 조형 gesture입니다." };
  try {
    if (!finitePoint(localPoint)) throw new Error("조형 위치는 유한한 로컬 좌표여야 합니다.");
    if (!Number.isSafeInteger(state.sampleCount + 1)) throw new Error("조형 sample 순서의 표현 범위를 넘었습니다.");
    validateSource(state);
    const result = applyStudioSculptStroke(state.mesh, { ...state.brush,
      center: { x: localPoint.x, y: localPoint.y, z: localPoint.z },
    }, state.mask);
    if (!result.ok) throw new Error(result.detail);
    // kernel은 원본 dense 정점 순서를 유지한다. mask는 이 순서에서만 재사용한다.
    if (state.mask && result.mesh.vertices.length !== state.mask.length) throw new Error("조형 mask의 원본 정점 대응이 바뀌었습니다.");
    validateStudioSculptStrokeMesh(result.mesh);
    const meshHash = hashStudioEditableMesh(result.mesh);
    state.mesh = result.mesh;
    state.meshHash = meshHash;
    state.sampleCount += 1;
    state.preview = meshHash === state.source.meshHash ? null : Object.freeze({
      assetId: state.source.assetId, sourceMesh: state.source.mesh, sourceMeshHash: state.source.meshHash,
      sourceMeshRevision: state.source.meshRevision, mesh: result.mesh, meshHash, strokeRevision: state.sampleCount,
    });
    return { ok: true, preview: state.preview };
  } catch (error) {
    discard(state, "failed");
    return { ok: false, detail: error instanceof Error ? error.message : "조형 gesture를 완료하지 못해 전체 미리보기를 취소했습니다." };
  }
}

export function readStudioSculptStrokePreview(session: StudioSculptStrokeSession): StudioSculptGeometryPreview | null {
  return sessions.get(session)?.preview ?? null;
}

export function sealStudioSculptStrokeSession(session: StudioSculptStrokeSession): StudioSculptStrokeReceipt | null {
  const state = sessions.get(session);
  if (!state) throw new Error("발급되지 않은 조형 gesture입니다.");
  if (state.phase === "sealed") return state.receipt;
  if (state.phase !== "drawing") return null;
  try {
    validateSource(state);
    validateStudioSculptStrokeMesh(state.mesh);
    if (state.meshHash === state.source.meshHash) { discard(state, "committed"); return null; }
    const receipt: StudioSculptStrokeReceipt = { [receiptBrand]: true };
    Object.freeze(receipt);
    state.phase = "sealed";
    state.receipt = receipt;
    receipts.set(receipt, state);
    return receipt;
  } catch (error) { discard(state, "failed"); throw error; }
}

/** seal 뒤 취소도 receipt를 무효화한다. 이미 확정한 문서를 undo하지 않는다. */
export function cancelStudioSculptStrokeSession(session: StudioSculptStrokeSession): void {
  const state = sessions.get(session);
  if (state && state.phase !== "committed") discard(state, "cancelled");
}

/** 최종 workspace adapter 전용 단일 소비 경계. callback 실패 시 원본은 그대로이고 receipt는 폐기된다. */
export function consumeStudioSculptStrokeReceipt<T>(
  receipt: StudioSculptStrokeReceipt,
  commit: (data: StudioSculptStrokeCommitData) => T,
): T {
  const state = receipts.get(receipt);
  if (!state || state.phase !== "sealed" || state.receipt !== receipt) throw new Error("조형 결과가 발급되지 않았거나 취소·사용된 결과입니다.");
  try {
    validateSource(state);
    validateStudioSculptStrokeMesh(state.mesh);
    state.phase = "committing";
    const result = commit(Object.freeze({ source: state.source, mesh: state.mesh, meshHash: state.meshHash, sampleCount: state.sampleCount }));
    if (state.phase !== "committing") throw new Error("조형 결과를 확정하는 동안 gesture가 취소됐습니다.");
    discard(state, "committed");
    return result;
  } catch (error) { discard(state, "failed"); throw error; }
}
