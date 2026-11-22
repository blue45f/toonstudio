import { compareCodeUnitStrings } from "@/shared/lib/compare-code-unit-strings";
import { sha256HexPortable } from "@/shared/lib/sha256-portable";

export const SCOPED_HANDOFF_ENVELOPE_SCHEMA = "toonstudio.scoped-cut-handoff.v1" as const;
export const SCOPED_HANDOFF_RETURN_SCHEMA = "toonstudio.scoped-cut-handoff-return.v1" as const;
export const SCOPED_HANDOFF_LAYER_ROLES = ["line-art", "flat-color", "shading", "bg3d-place", "lettering"] as const;
export type ScopedHandoffLayerRole = (typeof SCOPED_HANDOFF_LAYER_ROLES)[number];
export const SCOPED_HANDOFF_EXPIRY_PRESET_HOURS = [24, 72, 168] as const;

export interface ScopedHandoffRoleMeta {
  readonly ko: string; readonly en: string; readonly summaryKo: string; readonly summaryEn: string;
}

export const SCOPED_HANDOFF_ROLE_METADATA: Readonly<Record<ScopedHandoffLayerRole, ScopedHandoffRoleMeta>> = Object.freeze({
  "line-art": { ko: "선화", en: "Line art", summaryKo: "펜선·외곽선 정리", summaryEn: "Inking and clean linework" },
  "flat-color": { ko: "밑색", en: "Flat color", summaryKo: "영역 채우기·기본 톤", summaryEn: "Base flat fills" },
  shading: { ko: "채색·명암", en: "Shading", summaryKo: "그림자·하이라이트", summaryEn: "Shadows and lighting passes" },
  "bg3d-place": { ko: "3D 배경 배치", en: "3D background", summaryKo: "배경 구도·카메라 정합", summaryEn: "3D set framing and placement" },
  lettering: { ko: "식자·효과음", en: "Lettering", summaryKo: "말풍선 대사·효과음", summaryEn: "Dialogue balloons and SFX" },
});

const ROLE_SET = new Set<string>(SCOPED_HANDOFF_LAYER_ROLES);
const SHA256_HEX_RE = /^[a-f0-9]{64}$/u;
const SAFE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/u;
const MAX_ASSIGNED_CUTS = 64;
const MAX_LAYERS_PER_CUT = 64;
const MAX_EXPIRES_HOURS = 720;
const MAX_ENCODED_CHARS = 524_288;

export interface ScopedHandoffLayerSnapshot {
  readonly layerId: string; readonly role: ScopedHandoffLayerRole; readonly name: string;
  readonly revisionHash: string; readonly payloadDigest: string; readonly payload: string;
  readonly visible: boolean; readonly opacity: number;
}
export interface ScopedHandoffCutSnapshot {
  readonly cutId: string; readonly label: string; readonly orderIndex: number;
  readonly revisionHash: string; readonly width: number; readonly height: number;
  readonly previewDigest?: string; readonly layers: readonly ScopedHandoffLayerSnapshot[];
}
export interface ScopedHandoffManuscriptSnapshot {
  readonly workId: string; readonly projectId: string; readonly episodeLabel: string;
  readonly baseRevisionId: string; readonly baseRevisionHash: string;
  readonly cuts: readonly ScopedHandoffCutSnapshot[];
}
export interface ScopedHandoffAssignedCut {
  readonly cutId: string; readonly label: string; readonly issuedOrderIndex: number;
  readonly baselineCutRevisionHash: string; readonly lockedLayersSha256: string;
  readonly width: number; readonly height: number;
  readonly editableLayers: readonly ScopedHandoffLayerSnapshot[];
  readonly referenceLayers: readonly ScopedHandoffLayerSnapshot[];
}
export type ScopedHandoffContextRelation = "before" | "after";
export interface ScopedHandoffContextCut {
  readonly cutId: string; readonly label: string; readonly issuedOrderIndex: number;
  readonly baselineCutRevisionHash: string; readonly width: number; readonly height: number;
  readonly previewDigest?: string; readonly readOnly: true;
  readonly relations: readonly ScopedHandoffContextRelation[]; readonly adjacentToCutIds: readonly string[];
}
export interface ScopedHandoffEnvelopeBody {
  readonly schema: typeof SCOPED_HANDOFF_ENVELOPE_SCHEMA;
  readonly handoffId: string; readonly workId: string; readonly projectId: string;
  readonly episodeLabel: string; readonly title: string; readonly instructions: string;
  readonly zeroAccount: true; readonly baseRevisionId: string; readonly baseRevisionHash: string;
  readonly cutIds: readonly string[]; readonly allowedRoles: readonly ScopedHandoffLayerRole[];
  readonly contextWindow: 0 | 1; readonly issuedAt: string; readonly expiresAt: string;
  readonly assignedCuts: readonly ScopedHandoffAssignedCut[]; readonly contextCuts: readonly ScopedHandoffContextCut[];
}
export interface ScopedHandoffEnvelope extends ScopedHandoffEnvelopeBody { readonly envelopeSha256: string; }
export interface ScopedHandoffReturnedCut {
  readonly cutId: string; readonly baselineCutRevisionHash: string;
  readonly lockedLayersSha256: string; readonly layers: readonly ScopedHandoffLayerSnapshot[];
}
export interface ScopedHandoffReturnPacketBody {
  readonly schema: typeof SCOPED_HANDOFF_RETURN_SCHEMA;
  readonly handoffId: string; readonly workId: string; readonly projectId: string;
  readonly baseRevisionHash: string; readonly envelopeSha256: string;
  readonly assistantLabel: string; readonly note: string; readonly submittedAt: string;
  readonly returnedCuts: readonly ScopedHandoffReturnedCut[];
}
export interface ScopedHandoffReturnPacket extends ScopedHandoffReturnPacketBody { readonly returnSha256: string; }
export type ScopedHandoffFailureCode =
  | "invalid-envelope-schema" | "envelope-integrity-failed" | "handoff-expired"
  | "invalid-return-schema" | "return-integrity-failed" | "envelope-binding-mismatch"
  | "work-scope-mismatch" | "duplicate-cut-entry" | "duplicate-layer-entry"
  | "unassigned-cut-mutation" | "disallowed-layer-mutation" | "missing-target-cut" | "baseline-revision-mismatch";
export interface ScopedHandoffFailure {
  readonly ok: false; readonly code: ScopedHandoffFailureCode; readonly message: string;
  readonly offendingCutIds: readonly string[]; readonly offendingLayerIds: readonly string[];
}
export type ScopedHandoffEnvelopeVerification = { readonly ok: true; readonly envelope: ScopedHandoffEnvelope } | ScopedHandoffFailure;
export type ScopedHandoffReturnVerification =
  | { readonly ok: true; readonly envelope: ScopedHandoffEnvelope; readonly returnPacket: ScopedHandoffReturnPacket }
  | ScopedHandoffFailure;
export interface ScopedHandoffCutMergePlan {
  readonly cutId: string; readonly label: string;
  readonly issuedOrderIndex: number; readonly currentOrderIndex: number; readonly orderChanged: boolean;
  readonly baselineCutRevisionHash: string; readonly nextCutRevisionHash: string;
  readonly updatedLayerIds: readonly string[]; readonly addedLayerIds: readonly string[]; readonly untouchedLockedLayerCount: number;
}
export interface ScopedHandoffMergePreviewOk {
  readonly ok: true; readonly handoffId: string; readonly envelopeSha256: string; readonly returnSha256: string;
  readonly matchedByCutId: true; readonly reorderedCutIds: readonly string[]; readonly cutPlans: readonly ScopedHandoffCutMergePlan[];
}
export type ScopedHandoffMergePreviewResult = ScopedHandoffMergePreviewOk | ScopedHandoffFailure;
export type ScopedHandoffMergeResult =
  | { readonly ok: true; readonly preview: ScopedHandoffMergePreviewOk; readonly manuscript: ScopedHandoffManuscriptSnapshot }
  | ScopedHandoffFailure;
export interface CreateScopedHandoffEnvelopeInput {
  readonly manuscript: ScopedHandoffManuscriptSnapshot;
  readonly cutIds: readonly string[]; readonly allowedRoles: readonly ScopedHandoffLayerRole[];
  readonly title: string; readonly instructions?: string; readonly expiresInHours?: number;
  readonly contextWindow?: 0 | 1; readonly handoffId?: string; readonly nowMs?: number;
}
export interface CreateScopedHandoffReturnInput {
  readonly envelope: ScopedHandoffEnvelope;
  readonly cuts: readonly { readonly cutId: string; readonly layers: readonly ScopedHandoffLayerSnapshot[] }[];
  readonly assistantLabel: string; readonly note?: string; readonly submittedAtMs?: number;
}
export interface ScopedHandoffPinnedPageSource {
  readonly ordinal: number; readonly sha256: string; readonly width: number; readonly height: number;
}

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> => typeof v === "object" && v !== null && !Array.isArray(v);
const isValidId = (v: unknown): v is string => typeof v === "string" && SAFE_ID_RE.test(v);
const isSha256 = (v: unknown): v is string => typeof v === "string" && SHA256_HEX_RE.test(v);
const isValidRole = (v: unknown): v is ScopedHandoffLayerRole => typeof v === "string" && ROLE_SET.has(v);
const isPosInt = (v: unknown, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v > 0 && v <= max;
const isNonNegInt = (v: unknown, max = 100_000): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
const parseIsoMs = (v: unknown): number | null => {
  if (typeof v !== "string" || v.trim().length < 20) return null;
  const parsed = Date.parse(v);
  return Number.isFinite(parsed) ? parsed : null;
};

function fail(
  code: ScopedHandoffFailureCode,
  message: string,
  offendingCutIds: readonly string[] = [],
  offendingLayerIds: readonly string[] = [],
): ScopedHandoffFailure {
  return Object.freeze({ ok: false, code, message, offendingCutIds: Object.freeze([...offendingCutIds]), offendingLayerIds: Object.freeze([...offendingLayerIds]) });
}

function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite number cannot be canonicalized.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (isRecord(value)) {
    const entries: [string, unknown][] = [];
    for (const key of Object.keys(value).sort(compareCodeUnitStrings)) {
      if (value[key] !== undefined) entries.push([key, canonicalValue(value[key])]);
    }
    return Object.fromEntries(entries);
  }
  throw new Error("Unsupported value in canonical JSON.");
}

export const canonicalizeScopedHandoffJson = (value: unknown): string => JSON.stringify(canonicalValue(value));
export const computeScopedHandoffSha256 = (value: unknown): string =>
  sha256HexPortable(new TextEncoder().encode(canonicalizeScopedHandoffJson(value)));

const pickLayerFields = (l: ScopedHandoffLayerSnapshot) => ({
  layerId: l.layerId, role: l.role, name: l.name, revisionHash: l.revisionHash,
  payloadDigest: l.payloadDigest, payload: l.payload, visible: l.visible, opacity: l.opacity,
});

export function createScopedHandoffLayerSnapshot(input: {
  readonly layerId: string; readonly role: ScopedHandoffLayerRole; readonly name: string;
  readonly payload: string; readonly visible?: boolean; readonly opacity?: number;
}): ScopedHandoffLayerSnapshot {
  const visible = input.visible ?? true;
  const opacity = Math.min(1, Math.max(0, Number.isFinite(input.opacity) ? (input.opacity ?? 1) : 1));
  const payloadDigest = computeScopedHandoffSha256(input.payload);
  const revisionHash = computeScopedHandoffSha256({ layerId: input.layerId, role: input.role, name: input.name, payloadDigest, visible, opacity });
  return Object.freeze({ layerId: input.layerId, role: input.role, name: input.name, revisionHash, payloadDigest, payload: input.payload, visible, opacity });
}

/** 컷 순서(orderIndex)와 독립된 불변 cutId 기준 리비전 해시(#065). */
export const computeCutBaselineRevisionHash = (
  cut: Pick<ScopedHandoffCutSnapshot, "cutId" | "revisionHash" | "width" | "height" | "layers">,
): string => computeScopedHandoffSha256({ cutId: cut.cutId, revisionHash: cut.revisionHash, width: cut.width, height: cut.height, layers: cut.layers.map(pickLayerFields) });

export const computeLockedLayersSha256 = (
  layers: readonly ScopedHandoffLayerSnapshot[],
  allowedRoles: readonly ScopedHandoffLayerRole[],
): string => {
  const allowed = new Set<ScopedHandoffLayerRole>(allowedRoles);
  return computeScopedHandoffSha256(layers.filter((layer) => !allowed.has(layer.role)).map(pickLayerFields));
};

function parseLayerSnapshot(v: unknown): ScopedHandoffLayerSnapshot | null {
  if (!isRecord(v) || !isValidId(v.layerId) || !isValidRole(v.role)) return null;
  if (typeof v.name !== "string" || !v.name.trim() || v.name.length > 120) return null;
  if (!isSha256(v.revisionHash) || !isSha256(v.payloadDigest) || typeof v.payload !== "string" || v.payload.length > 131_072) return null;
  if (v.payloadDigest !== computeScopedHandoffSha256(v.payload)) return null;
  if (typeof v.visible !== "boolean" || typeof v.opacity !== "number" || !Number.isFinite(v.opacity) || v.opacity < 0 || v.opacity > 1) return null;
  return Object.freeze({ layerId: v.layerId, role: v.role, name: v.name, revisionHash: v.revisionHash, payloadDigest: v.payloadDigest, payload: v.payload, visible: v.visible, opacity: v.opacity });
}

function buildContextCuts(
  cuts: readonly ScopedHandoffCutSnapshot[],
  assignedSet: ReadonlySet<string>,
  contextWindow: 0 | 1,
): readonly ScopedHandoffContextCut[] {
  if (contextWindow === 0) return Object.freeze([]);
  const bucket = new Map<string, { cut: ScopedHandoffCutSnapshot; index: number; relations: Set<ScopedHandoffContextRelation>; adjacent: Set<string> }>();
  const addNeighbor = (idx: number, relation: ScopedHandoffContextRelation, anchorCutId: string) => {
    const neighbor = cuts[idx];
    if (!neighbor || assignedSet.has(neighbor.cutId)) return;
    const prev = bucket.get(neighbor.cutId);
    if (prev) { prev.relations.add(relation); prev.adjacent.add(anchorCutId); return; }
    bucket.set(neighbor.cutId, { cut: neighbor, index: idx, relations: new Set([relation]), adjacent: new Set([anchorCutId]) });
  };
  cuts.forEach((cut, index) => {
    if (!assignedSet.has(cut.cutId)) return;
    if (index > 0) addNeighbor(index - 1, "before", cut.cutId);
    if (index + 1 < cuts.length) addNeighbor(index + 1, "after", cut.cutId);
  });
  return Object.freeze([...bucket.values()].sort((a, b) => a.index - b.index).map(({ cut, index, relations, adjacent }) => Object.freeze({
    cutId: cut.cutId, label: cut.label, issuedOrderIndex: index, baselineCutRevisionHash: computeCutBaselineRevisionHash(cut),
    width: cut.width, height: cut.height, ...(cut.previewDigest ? { previewDigest: cut.previewDigest } : {}),
    readOnly: true as const,
    relations: Object.freeze([...relations].sort(compareCodeUnitStrings) as ScopedHandoffContextRelation[]),
    adjacentToCutIds: Object.freeze([...adjacent].sort(compareCodeUnitStrings)),
  })));
}

export function createScopedHandoffEnvelope(input: CreateScopedHandoffEnvelopeInput): ScopedHandoffEnvelope {
  const { manuscript } = input;
  const nowMs = input.nowMs ?? Date.now();
  const expiresInHours = input.expiresInHours ?? 72;
  const contextWindow = input.contextWindow ?? 1;
  if (!Number.isFinite(nowMs)) throw new Error("발급 시각이 올바르지 않습니다.");
  if (!Number.isInteger(expiresInHours) || expiresInHours < 1 || expiresInHours > MAX_EXPIRES_HOURS) throw new Error("만료 시간은 1~720시간 사이의 정수여야 합니다.");
  const uniqueCutIds = [...new Set(input.cutIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueCutIds.length === 0 || uniqueCutIds.length > MAX_ASSIGNED_CUTS) throw new Error("배정할 컷을 1개 이상 64개 이하로 선택해 주세요.");
  const uniqueRoles = [...new Set(input.allowedRoles)].filter(isValidRole);
  if (uniqueRoles.length === 0) throw new Error("허용할 레이어 역할을 1개 이상 선택해 주세요.");

  const cutMap = new Map(manuscript.cuts.map((cut, index) => [cut.cutId, { cut, index }] as const));
  const assignedSet = new Set(uniqueCutIds);
  const allowedSet = new Set<ScopedHandoffLayerRole>(uniqueRoles);
  const assignedCuts: ScopedHandoffAssignedCut[] = uniqueCutIds.map((cutId) => {
    const found = cutMap.get(cutId);
    if (!found) throw new Error(`배정 대상 컷(${cutId})을 원고에서 찾을 수 없습니다.`);
    const { cut, index } = found;
    return Object.freeze({
      cutId: cut.cutId, label: cut.label, issuedOrderIndex: index,
      baselineCutRevisionHash: computeCutBaselineRevisionHash(cut), lockedLayersSha256: computeLockedLayersSha256(cut.layers, uniqueRoles),
      width: cut.width, height: cut.height,
      editableLayers: Object.freeze(cut.layers.filter((l) => allowedSet.has(l.role))),
      referenceLayers: Object.freeze(cut.layers.filter((l) => !allowedSet.has(l.role))),
    });
  });

  const handoffId = input.handoffId ?? (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `sh-${crypto.randomUUID()}`
    : `sh-${computeScopedHandoffSha256({ workId: manuscript.workId, uniqueCutIds, nowMs }).slice(0, 24)}`);

  const body: ScopedHandoffEnvelopeBody = Object.freeze({
    schema: SCOPED_HANDOFF_ENVELOPE_SCHEMA, handoffId, workId: manuscript.workId, projectId: manuscript.projectId,
    episodeLabel: manuscript.episodeLabel, title: input.title.trim() || `${manuscript.episodeLabel} 어시스턴트 전달`,
    instructions: (input.instructions ?? "").trim().slice(0, 2000), zeroAccount: true as const,
    baseRevisionId: manuscript.baseRevisionId, baseRevisionHash: manuscript.baseRevisionHash,
    cutIds: Object.freeze(uniqueCutIds), allowedRoles: Object.freeze(uniqueRoles), contextWindow,
    issuedAt: new Date(nowMs).toISOString(), expiresAt: new Date(nowMs + expiresInHours * 3_600_000).toISOString(),
    assignedCuts: Object.freeze(assignedCuts), contextCuts: buildContextCuts(manuscript.cuts, assignedSet, contextWindow),
  });
  return Object.freeze({ ...body, envelopeSha256: computeScopedHandoffSha256(body) });
}

function parseAssignedCut(v: unknown, allowed: ReadonlySet<ScopedHandoffLayerRole>): ScopedHandoffAssignedCut | null {
  if (!isRecord(v) || !isValidId(v.cutId) || typeof v.label !== "string" || !isNonNegInt(v.issuedOrderIndex)) return null;
  if (!isSha256(v.baselineCutRevisionHash) || !isSha256(v.lockedLayersSha256) || !isPosInt(v.width, 16_384) || !isPosInt(v.height, 16_384)) return null;
  if (!Array.isArray(v.editableLayers) || !Array.isArray(v.referenceLayers) || v.editableLayers.length + v.referenceLayers.length > MAX_LAYERS_PER_CUT) return null;
  const editableLayers: ScopedHandoffLayerSnapshot[] = [];
  for (const item of v.editableLayers) { const p = parseLayerSnapshot(item); if (!p || !allowed.has(p.role)) return null; editableLayers.push(p); }
  const referenceLayers: ScopedHandoffLayerSnapshot[] = [];
  for (const item of v.referenceLayers) { const p = parseLayerSnapshot(item); if (!p || allowed.has(p.role)) return null; referenceLayers.push(p); }
  return Object.freeze({
    cutId: v.cutId, label: v.label, issuedOrderIndex: v.issuedOrderIndex, baselineCutRevisionHash: v.baselineCutRevisionHash,
    lockedLayersSha256: v.lockedLayersSha256, width: v.width, height: v.height,
    editableLayers: Object.freeze(editableLayers), referenceLayers: Object.freeze(referenceLayers),
  });
}

function parseContextCut(v: unknown, assignedSet: ReadonlySet<string>): ScopedHandoffContextCut | null {
  if (!isRecord(v) || !isValidId(v.cutId) || assignedSet.has(v.cutId) || v.readOnly !== true || typeof v.label !== "string") return null;
  if (!isNonNegInt(v.issuedOrderIndex) || !isSha256(v.baselineCutRevisionHash) || !isPosInt(v.width, 16_384) || !isPosInt(v.height, 16_384)) return null;
  if (v.previewDigest !== undefined && !isSha256(v.previewDigest)) return null;
  if (!Array.isArray(v.relations) || v.relations.length === 0 || !v.relations.every((r): r is ScopedHandoffContextRelation => r === "before" || r === "after")) return null;
  if (!Array.isArray(v.adjacentToCutIds) || v.adjacentToCutIds.length === 0 || !v.adjacentToCutIds.every((id): id is string => isValidId(id) && assignedSet.has(id))) return null;
  return Object.freeze({
    cutId: v.cutId, label: v.label, issuedOrderIndex: v.issuedOrderIndex, baselineCutRevisionHash: v.baselineCutRevisionHash,
    width: v.width, height: v.height, ...(v.previewDigest ? { previewDigest: v.previewDigest } : {}),
    readOnly: true as const, relations: Object.freeze([...v.relations]), adjacentToCutIds: Object.freeze([...v.adjacentToCutIds]),
  });
}

export function verifyScopedHandoffEnvelope(raw: unknown, options?: { readonly nowMs?: number }): ScopedHandoffEnvelopeVerification {
  if (!isRecord(raw) || raw.schema !== SCOPED_HANDOFF_ENVELOPE_SCHEMA || raw.zeroAccount !== true) return fail("invalid-envelope-schema", "지원하지 않는 컷 제한 전달 봉투 형식입니다.");
  if (!isValidId(raw.handoffId) || !isValidId(raw.workId) || !isValidId(raw.projectId) || !isValidId(raw.baseRevisionId)) return fail("invalid-envelope-schema", "봉투 식별자 또는 작품 기준 정보가 누락되었습니다.");
  if (!isSha256(raw.baseRevisionHash) || !isSha256(raw.envelopeSha256)) return fail("invalid-envelope-schema", "기준 리비전 또는 봉투 SHA-256 해시 형식이 잘못되었습니다.");
  if (typeof raw.title !== "string" || !raw.title.trim() || typeof raw.instructions !== "string" || typeof raw.episodeLabel !== "string") return fail("invalid-envelope-schema", "전달 제목 또는 회차 정보가 올바르지 않습니다.");
  if (raw.contextWindow !== 0 && raw.contextWindow !== 1) return fail("invalid-envelope-schema", "앞뒤 문맥 컷 범위 설정이 올바르지 않습니다.");
  const issuedMs = parseIsoMs(raw.issuedAt);
  const expiresMs = parseIsoMs(raw.expiresAt);
  if (issuedMs === null || expiresMs === null || expiresMs <= issuedMs || typeof raw.issuedAt !== "string" || typeof raw.expiresAt !== "string") return fail("invalid-envelope-schema", "발급 또는 만료 시각이 올바르지 않습니다.");
  if (!Array.isArray(raw.cutIds) || raw.cutIds.length === 0 || raw.cutIds.length > MAX_ASSIGNED_CUTS || !raw.cutIds.every(isValidId)) return fail("invalid-envelope-schema", "배정 컷 ID 목록이 올바르지 않습니다.");
  const cutIds: readonly string[] = Object.freeze([...raw.cutIds]);
  const assignedSet = new Set(cutIds);
  if (assignedSet.size !== cutIds.length) return fail("duplicate-cut-entry", "봉투에 중복된 배정 컷 ID가 포함되어 있습니다.");
  if (!Array.isArray(raw.allowedRoles) || raw.allowedRoles.length === 0 || !raw.allowedRoles.every(isValidRole)) return fail("invalid-envelope-schema", "허용 레이어 역할 목록이 올바르지 않습니다.");
  const allowedRoles: readonly ScopedHandoffLayerRole[] = Object.freeze([...raw.allowedRoles]);
  const allowedRoleSet = new Set<ScopedHandoffLayerRole>(allowedRoles);
  if (allowedRoleSet.size !== allowedRoles.length) return fail("invalid-envelope-schema", "중복된 허용 레이어 역할이 포함되어 있습니다.");
  if (!Array.isArray(raw.assignedCuts) || raw.assignedCuts.length !== cutIds.length) return fail("invalid-envelope-schema", "배정 컷 스냅샷 수가 배정 컷 ID 목록과 일치하지 않습니다.");
  const assignedCuts: ScopedHandoffAssignedCut[] = [];
  for (let i = 0; i < raw.assignedCuts.length; i += 1) {
    const parsed = parseAssignedCut(raw.assignedCuts[i], allowedRoleSet);
    if (!parsed || parsed.cutId !== cutIds[i]) return fail("invalid-envelope-schema", "배정 컷 스냅샷 구조가 유효하지 않습니다.");
    assignedCuts.push(parsed);
  }
  if (!Array.isArray(raw.contextCuts)) return fail("invalid-envelope-schema", "읽기 전용 앞뒤 문맥 컷 목록 형식이 올바르지 않습니다.");
  const contextCuts: ScopedHandoffContextCut[] = [];
  for (const item of raw.contextCuts) {
    const parsed = parseContextCut(item, assignedSet);
    if (!parsed) return fail("invalid-envelope-schema", "읽기 전용 앞뒤 문맥 컷 구성이 유효하지 않습니다.");
    contextCuts.push(parsed);
  }

  const body: ScopedHandoffEnvelopeBody = Object.freeze({
    schema: SCOPED_HANDOFF_ENVELOPE_SCHEMA, handoffId: raw.handoffId, workId: raw.workId, projectId: raw.projectId,
    episodeLabel: raw.episodeLabel, title: raw.title, instructions: raw.instructions, zeroAccount: true as const,
    baseRevisionId: raw.baseRevisionId, baseRevisionHash: raw.baseRevisionHash, cutIds, allowedRoles,
    contextWindow: raw.contextWindow, issuedAt: raw.issuedAt, expiresAt: raw.expiresAt,
    assignedCuts: Object.freeze(assignedCuts), contextCuts: Object.freeze(contextCuts),
  });
  if (Object.keys(raw).length !== 18 || computeScopedHandoffSha256(body) !== raw.envelopeSha256) {
    return fail("envelope-integrity-failed", "봉투 SHA-256 무결성 해시가 일치하지 않아 위변조가 의심됩니다.");
  }
  if ((options?.nowMs ?? Date.now()) > expiresMs) return fail("handoff-expired", "이 컷 단위 제한 전달 링크는 만료되었습니다.");
  return Object.freeze({ ok: true, envelope: Object.freeze({ ...body, envelopeSha256: raw.envelopeSha256 }) });
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function base64UrlToBytes(token: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(token)) return null;
  const padded = token.replace(/-/gu, "+").replace(/_/gu, "/") + "=".repeat((4 - (token.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch { return null; }
}

export function encodeScopedHandoffLink(envelope: ScopedHandoffEnvelope, origin?: string): string {
  const baseOrigin = origin ?? (typeof window !== "undefined" ? window.location.origin : "https://www.toonstudio.cloud");
  const encoded = bytesToBase64Url(new TextEncoder().encode(canonicalizeScopedHandoffJson(envelope)));
  const url = new URL("/production/scoped-handoff", baseOrigin);
  url.hash = new URLSearchParams({ envelope: encoded }).toString();
  return url.toString();
}

function extractEncodedPayload(raw: string, fragmentParam: "envelope" | "return"): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_ENCODED_CHARS) return null;
  if (trimmed.startsWith("{")) { try { return JSON.parse(trimmed) as unknown; } catch { return null; } }
  let token = trimmed;
  if (trimmed.includes("#")) {
    const paramValue = new URLSearchParams(trimmed.slice(trimmed.indexOf("#") + 1)).get(fragmentParam);
    if (!paramValue) return null;
    token = paramValue;
  } else if (trimmed.startsWith(`${fragmentParam}=`)) {
    token = new URLSearchParams(trimmed).get(fragmentParam) ?? "";
  }
  const bytes = base64UrlToBytes(token);
  if (!bytes) return null;
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; } catch { return null; }
}

export function decodeScopedHandoffLink(raw: string, options?: { readonly nowMs?: number }): ScopedHandoffEnvelopeVerification {
  const parsed = extractEncodedPayload(raw, "envelope");
  if (!parsed) return fail("invalid-envelope-schema", "제한 링크를 해독할 수 없습니다. 링크 끝부분이 잘리지 않았는지 확인해 주세요.");
  return verifyScopedHandoffEnvelope(parsed, options);
}

function validateReturnedCutLayers(
  cutId: string,
  rawLayers: readonly unknown[],
  assigned: ScopedHandoffAssignedCut,
  allowedRoleSet: ReadonlySet<ScopedHandoffLayerRole>,
): { readonly ok: true; readonly layers: readonly ScopedHandoffLayerSnapshot[] } | ScopedHandoffFailure {
  if (rawLayers.length > MAX_LAYERS_PER_CUT) return fail("invalid-return-schema", `컷(${cutId})의 레이어 수가 허용 한도를 초과했습니다.`, [cutId]);
  const lockedIds = new Set(assigned.referenceLayers.map((layer) => layer.layerId));
  const editableRoleById = new Map(assigned.editableLayers.map((layer) => [layer.layerId, layer.role] as const));
  const seenLayers = new Set<string>();
  const layers: ScopedHandoffLayerSnapshot[] = [];
  for (const rawLayer of rawLayers) {
    if (isRecord(rawLayer) && isValidId(rawLayer.layerId)) {
      const preRole = editableRoleById.get(rawLayer.layerId);
      if (lockedIds.has(rawLayer.layerId) || (isValidRole(rawLayer.role) && (!allowedRoleSet.has(rawLayer.role) || (preRole && preRole !== rawLayer.role)))) {
        return fail("disallowed-layer-mutation", `컷(${cutId})의 허용 외 레이어(${rawLayer.layerId} · ${String(rawLayer.role)}) 변조가 감지되어 즉시 거부했습니다.`, [cutId], [rawLayer.layerId]);
      }
    }
    const layer = parseLayerSnapshot(rawLayer);
    if (!layer) return fail("invalid-return-schema", `컷(${cutId})에 손상되거나 위조된 레이어 데이터가 있습니다.`, [cutId]);
    if (seenLayers.has(layer.layerId)) return fail("duplicate-layer-entry", `컷(${cutId})에 중복 레이어(${layer.layerId})가 있습니다.`, [cutId], [layer.layerId]);
    seenLayers.add(layer.layerId);
    const baselineRole = editableRoleById.get(layer.layerId);
    if (!allowedRoleSet.has(layer.role) || lockedIds.has(layer.layerId) || (baselineRole && baselineRole !== layer.role)) {
      return fail("disallowed-layer-mutation", `컷(${cutId})의 허용 외 레이어(${layer.layerId} · ${layer.role}) 변조가 감지되어 즉시 거부했습니다.`, [cutId], [layer.layerId]);
    }
    layers.push(layer);
  }
  return { ok: true, layers: Object.freeze(layers) };
}

export function createScopedHandoffReturnPacket(input: CreateScopedHandoffReturnInput): ScopedHandoffReturnPacket {
  const { envelope } = input;
  const submittedAtMs = input.submittedAtMs ?? Date.now();
  const assignedById = new Map(envelope.assignedCuts.map((cut) => [cut.cutId, cut] as const));
  const allowedRoleSet = new Set<ScopedHandoffLayerRole>(envelope.allowedRoles);
  if (input.cuts.length === 0) throw new Error("반납할 배정 컷이 1개 이상 필요합니다.");

  const seenCuts = new Set<string>();
  const returnedCuts: ScopedHandoffReturnedCut[] = input.cuts.map((entry) => {
    if (seenCuts.has(entry.cutId)) throw new Error(`중복된 반납 컷(${entry.cutId})입니다.`);
    seenCuts.add(entry.cutId);
    const assigned = assignedById.get(entry.cutId);
    if (!assigned) throw new Error(`미배정 컷(${entry.cutId})은 반납 패킷에 포함할 수 없습니다.`);
    const validated = validateReturnedCutLayers(entry.cutId, entry.layers, assigned, allowedRoleSet);
    if (!validated.ok) throw new Error(validated.message);
    return Object.freeze({ cutId: assigned.cutId, baselineCutRevisionHash: assigned.baselineCutRevisionHash, lockedLayersSha256: assigned.lockedLayersSha256, layers: validated.layers });
  });

  const body: ScopedHandoffReturnPacketBody = Object.freeze({
    schema: SCOPED_HANDOFF_RETURN_SCHEMA, handoffId: envelope.handoffId, workId: envelope.workId, projectId: envelope.projectId,
    baseRevisionHash: envelope.baseRevisionHash, envelopeSha256: envelope.envelopeSha256,
    assistantLabel: input.assistantLabel.trim() || "외부 어시스턴트", note: (input.note ?? "").trim().slice(0, 2000),
    submittedAt: new Date(submittedAtMs).toISOString(), returnedCuts: Object.freeze(returnedCuts),
  });
  return Object.freeze({ ...body, returnSha256: computeScopedHandoffSha256(body) });
}

export const encodeScopedHandoffReturnToken = (packet: ScopedHandoffReturnPacket): string =>
  bytesToBase64Url(new TextEncoder().encode(canonicalizeScopedHandoffJson(packet)));
export const parseScopedHandoffReturnInput = (raw: string): unknown | null => extractEncodedPayload(raw, "return");

export function verifyScopedHandoffReturnPacket(rawPacket: unknown, rawEnvelope: unknown, options?: { readonly nowMs?: number }): ScopedHandoffReturnVerification {
  const envelopeCheck = verifyScopedHandoffEnvelope(rawEnvelope, options);
  if (!envelopeCheck.ok) return envelopeCheck;
  const { envelope } = envelopeCheck;
  if (!isRecord(rawPacket) || rawPacket.schema !== SCOPED_HANDOFF_RETURN_SCHEMA) return fail("invalid-return-schema", "반납 패킷 형식이 올바르지 않습니다.");
  if (!isValidId(rawPacket.handoffId) || !isValidId(rawPacket.workId) || !isValidId(rawPacket.projectId)) return fail("invalid-return-schema", "반납 패킷의 전달 ID 또는 작품 정보가 누락되었습니다.");
  if (!isSha256(rawPacket.baseRevisionHash) || !isSha256(rawPacket.envelopeSha256) || !isSha256(rawPacket.returnSha256)) return fail("invalid-return-schema", "반납 패킷의 SHA-256 해시 형식이 올바르지 않습니다.");
  if (typeof rawPacket.assistantLabel !== "string" || typeof rawPacket.note !== "string") return fail("invalid-return-schema", "어시스턴트 표기 또는 반납 메모 형식이 올바르지 않습니다.");
  const submittedMs = parseIsoMs(rawPacket.submittedAt);
  if (submittedMs === null || typeof rawPacket.submittedAt !== "string") return fail("invalid-return-schema", "반납 시각 형식이 올바르지 않습니다.");
  if (!Array.isArray(rawPacket.returnedCuts) || rawPacket.returnedCuts.length === 0 || rawPacket.returnedCuts.length > MAX_ASSIGNED_CUTS) return fail("invalid-return-schema", "반납할 컷 항목이 비어 있거나 허용 한도를 초과했습니다.");

  const { returnSha256, ...bodyRest } = rawPacket;
  if (Object.keys(rawPacket).length !== 11 || computeScopedHandoffSha256(bodyRest) !== returnSha256) {
    return fail("return-integrity-failed", "반납 패킷 SHA-256 무결성 해시가 일치하지 않아 즉시 거부했습니다.");
  }
  if (rawPacket.handoffId !== envelope.handoffId || rawPacket.envelopeSha256 !== envelope.envelopeSha256) return fail("envelope-binding-mismatch", "반납 패킷이 발급한 제한 링크 봉투와 일치하지 않습니다.");
  if (rawPacket.workId !== envelope.workId || rawPacket.projectId !== envelope.projectId) return fail("work-scope-mismatch", "반납 패킷의 작품 범위가 발급 봉투와 다릅니다.");
  if (rawPacket.baseRevisionHash !== envelope.baseRevisionHash) return fail("baseline-revision-mismatch", "반납 패킷의 기준 원고 리비전 해시가 발급 시점과 다릅니다.");
  if (submittedMs > Date.parse(envelope.expiresAt)) return fail("handoff-expired", "만료 시각 이후에 생성된 반납 패킷은 병합할 수 없습니다.");

  const assignedById = new Map(envelope.assignedCuts.map((cut) => [cut.cutId, cut] as const));
  const allowedRoleSet = new Set<ScopedHandoffLayerRole>(envelope.allowedRoles);
  const seenCuts = new Set<string>();
  const validatedCuts: ScopedHandoffReturnedCut[] = [];
  for (const candidate of rawPacket.returnedCuts) {
    if (!isRecord(candidate) || !isValidId(candidate.cutId)) return fail("invalid-return-schema", "반납 컷 항목의 cutId가 올바르지 않습니다.");
    if (seenCuts.has(candidate.cutId)) return fail("duplicate-cut-entry", `중복된 반납 컷(${candidate.cutId})이 감지되어 거부했습니다.`, [candidate.cutId]);
    seenCuts.add(candidate.cutId);
    const assigned = assignedById.get(candidate.cutId);
    if (!assigned) return fail("unassigned-cut-mutation", `배정되지 않은 컷(${candidate.cutId}) 변경 시도가 감지되어 즉시 거부했습니다.`, [candidate.cutId]);
    if (!isSha256(candidate.baselineCutRevisionHash) || candidate.baselineCutRevisionHash !== assigned.baselineCutRevisionHash) return fail("baseline-revision-mismatch", `컷(${candidate.cutId})의 기준 리비전 해시가 발급 봉투와 일치하지 않습니다.`, [candidate.cutId]);
    if (!isSha256(candidate.lockedLayersSha256) || candidate.lockedLayersSha256 !== assigned.lockedLayersSha256) return fail("disallowed-layer-mutation", `컷(${candidate.cutId})의 허용 외 잠금 레이어 해시 변조가 감지되어 즉시 거부했습니다.`, [candidate.cutId]);
    if (!Array.isArray(candidate.layers)) return fail("invalid-return-schema", `컷(${candidate.cutId})의 레이어 목록이 올바르지 않습니다.`, [candidate.cutId]);
    const validatedLayers = validateReturnedCutLayers(candidate.cutId, candidate.layers, assigned, allowedRoleSet);
    if (!validatedLayers.ok) return validatedLayers;
    validatedCuts.push(Object.freeze({ cutId: candidate.cutId, baselineCutRevisionHash: candidate.baselineCutRevisionHash, lockedLayersSha256: candidate.lockedLayersSha256, layers: validatedLayers.layers }));
  }

  const body: ScopedHandoffReturnPacketBody = Object.freeze({
    schema: SCOPED_HANDOFF_RETURN_SCHEMA, handoffId: rawPacket.handoffId, workId: rawPacket.workId, projectId: rawPacket.projectId,
    baseRevisionHash: rawPacket.baseRevisionHash, envelopeSha256: rawPacket.envelopeSha256,
    assistantLabel: rawPacket.assistantLabel, note: rawPacket.note, submittedAt: rawPacket.submittedAt, returnedCuts: Object.freeze(validatedCuts),
  });
  if (computeScopedHandoffSha256(body) !== returnSha256) return fail("return-integrity-failed", "반납 패킷 정규화 무결성 해시가 일치하지 않습니다.");
  return Object.freeze({ ok: true, envelope, returnPacket: Object.freeze({ ...body, returnSha256 }) });
}

function buildMergedCutLayers(currentCut: ScopedHandoffCutSnapshot, returnedLayers: readonly ScopedHandoffLayerSnapshot[]) {
  const returnedById = new Map(returnedLayers.map((layer) => [layer.layerId, layer] as const));
  const consumed = new Set<string>();
  const updatedLayerIds: string[] = [];
  const nextLayers = currentCut.layers.map((layer) => {
    const replacement = returnedById.get(layer.layerId);
    if (!replacement) return layer;
    consumed.add(layer.layerId);
    if (replacement.revisionHash !== layer.revisionHash || replacement.payloadDigest !== layer.payloadDigest) updatedLayerIds.push(layer.layerId);
    return replacement;
  });
  const addedLayerIds: string[] = [];
  for (const layer of returnedLayers) {
    if (!consumed.has(layer.layerId)) { nextLayers.push(layer); addedLayerIds.push(layer.layerId); }
  }
  return { nextLayers: Object.freeze(nextLayers), updatedLayerIds: Object.freeze(updatedLayerIds), addedLayerIds: Object.freeze(addedLayerIds) };
}

function evaluateMerge(input: {
  readonly currentManuscript: ScopedHandoffManuscriptSnapshot; readonly envelope: unknown; readonly returnPacket: unknown; readonly nowMs?: number;
}): { readonly ok: true; readonly preview: ScopedHandoffMergePreviewOk; readonly returnPacket: ScopedHandoffReturnPacket } | ScopedHandoffFailure {
  const verified = verifyScopedHandoffReturnPacket(input.returnPacket, input.envelope, { nowMs: input.nowMs });
  if (!verified.ok) return verified;
  const { envelope, returnPacket } = verified;
  const { currentManuscript } = input;
  if (currentManuscript.workId !== envelope.workId || currentManuscript.projectId !== envelope.projectId) return fail("work-scope-mismatch", "현재 열려 있는 원고가 제한 링크의 작품과 다릅니다.");

  const assignedById = new Map(envelope.assignedCuts.map((cut) => [cut.cutId, cut] as const));
  const currentCutById = new Map(currentManuscript.cuts.map((cut, index) => [cut.cutId, { cut, index }] as const));
  const reorderedCutIds: string[] = [];
  const cutPlans: ScopedHandoffCutMergePlan[] = [];
  for (const returnedCut of returnPacket.returnedCuts) {
    const assigned = assignedById.get(returnedCut.cutId);
    if (!assigned) return fail("unassigned-cut-mutation", `미배정 컷(${returnedCut.cutId})은 병합할 수 없습니다.`, [returnedCut.cutId]);
    const located = currentCutById.get(returnedCut.cutId);
    if (!located) return fail("missing-target-cut", `현재 원고에서 배정 컷(${returnedCut.cutId})을 찾을 수 없어 병합을 중단했습니다.`, [returnedCut.cutId]);
    if (computeCutBaselineRevisionHash(located.cut) !== assigned.baselineCutRevisionHash) return fail("baseline-revision-mismatch", `컷(${returnedCut.cutId})이 발급 이후 메인 원고에서 수정되어 기준 리비전 해시가 일치하지 않습니다.`, [returnedCut.cutId]);
    if (computeLockedLayersSha256(located.cut.layers, envelope.allowedRoles) !== returnedCut.lockedLayersSha256) return fail("disallowed-layer-mutation", `컷(${returnedCut.cutId})의 잠금 레이어 기준 해시가 현재 원고와 일치하지 않아 거부했습니다.`, [returnedCut.cutId]);

    const { nextLayers, updatedLayerIds, addedLayerIds } = buildMergedCutLayers(located.cut, returnedCut.layers);
    const nextCutRevisionHash = computeScopedHandoffSha256({ cutId: located.cut.cutId, previousRevisionHash: located.cut.revisionHash, layers: nextLayers.map(pickLayerFields) });
    const orderChanged = located.index !== assigned.issuedOrderIndex;
    if (orderChanged) reorderedCutIds.push(located.cut.cutId);
    cutPlans.push(Object.freeze({
      cutId: located.cut.cutId, label: located.cut.label, issuedOrderIndex: assigned.issuedOrderIndex, currentOrderIndex: located.index,
      orderChanged, baselineCutRevisionHash: assigned.baselineCutRevisionHash, nextCutRevisionHash,
      updatedLayerIds, addedLayerIds, untouchedLockedLayerCount: assigned.referenceLayers.length,
    }));
  }
  return {
    ok: true, returnPacket,
    preview: Object.freeze({ ok: true, handoffId: envelope.handoffId, envelopeSha256: envelope.envelopeSha256, returnSha256: returnPacket.returnSha256, matchedByCutId: true as const, reorderedCutIds: Object.freeze(reorderedCutIds), cutPlans: Object.freeze(cutPlans) }),
  };
}

/** 히든 디테일(#065): 컷 순서가 바뀌어도 배열 인덱스가 아닌 불변 cutId + 기준 리비전 해시로 매칭, 변조 시 Fail-Closed 거부. */
export function previewScopedHandoffReturnMerge(input: {
  readonly currentManuscript: ScopedHandoffManuscriptSnapshot; readonly envelope: unknown; readonly returnPacket: unknown; readonly nowMs?: number;
}): ScopedHandoffMergePreviewResult {
  const evaluated = evaluateMerge(input);
  return evaluated.ok ? evaluated.preview : evaluated;
}

export function mergeScopedHandoffReturn(input: {
  readonly currentManuscript: ScopedHandoffManuscriptSnapshot; readonly envelope: unknown; readonly returnPacket: unknown; readonly nowMs?: number;
}): ScopedHandoffMergeResult {
  const evaluated = evaluateMerge(input);
  if (!evaluated.ok) return evaluated;
  const returnedById = new Map(evaluated.returnPacket.returnedCuts.map((cut) => [cut.cutId, cut] as const));
  const planById = new Map(evaluated.preview.cutPlans.map((plan) => [plan.cutId, plan] as const));
  const nextCuts = input.currentManuscript.cuts.map((cut, index) => {
    const returned = returnedById.get(cut.cutId);
    const plan = planById.get(cut.cutId);
    if (!returned || !plan) return Object.freeze({ ...cut, orderIndex: index });
    return Object.freeze({ ...cut, orderIndex: index, revisionHash: plan.nextCutRevisionHash, layers: buildMergedCutLayers(cut, returned.layers).nextLayers });
  });
  const nextBaseRevisionHash = computeScopedHandoffSha256({
    previousBaseRevisionHash: input.currentManuscript.baseRevisionHash, handoffId: evaluated.preview.handoffId,
    returnSha256: evaluated.preview.returnSha256, cutRevisions: nextCuts.map((cut) => ({ cutId: cut.cutId, revisionHash: cut.revisionHash })),
  });
  return Object.freeze({ ok: true, preview: evaluated.preview, manuscript: Object.freeze({ ...input.currentManuscript, baseRevisionHash: nextBaseRevisionHash, cuts: Object.freeze(nextCuts) }) });
}

/** 고정 검수 페이지 메타데이터를 로컬 컷 제한 전달 스냅샷으로 변환한다(₩0 로컬). */
export function buildScopedHandoffManuscriptFromPinnedPages(input: {
  readonly workId: string; readonly projectId: string; readonly episodeLabel: string;
  readonly baseRevisionId: string; readonly baseRevisionHash: string; readonly pages: readonly ScopedHandoffPinnedPageSource[];
}): ScopedHandoffManuscriptSnapshot {
  const normalizedBaseHash = isSha256(input.baseRevisionHash) ? input.baseRevisionHash : computeScopedHandoffSha256({ workId: input.workId, baseRevisionId: input.baseRevisionId });
  const sourceList: readonly ScopedHandoffPinnedPageSource[] = input.pages.length > 0
    ? input.pages
    : [0, 1, 2].map((ordinal) => ({ ordinal, sha256: computeScopedHandoffSha256({ workId: input.workId, baseRevisionId: input.baseRevisionId, ordinal }), width: 800, height: 1280 }));
  const cuts = sourceList.map((page, index) => {
    const cutId = `cut-${page.ordinal + 1}-${page.sha256.slice(0, 8)}`;
    const layers = Object.freeze([
      createScopedHandoffLayerSnapshot({ layerId: `${cutId}-line`, role: "line-art", name: "선화 레이어", payload: `line:${page.sha256.slice(0, 16)}` }),
      createScopedHandoffLayerSnapshot({ layerId: `${cutId}-flat`, role: "flat-color", name: "밑색 레이어", payload: `flat:${page.sha256.slice(0, 16)}` }),
      createScopedHandoffLayerSnapshot({ layerId: `${cutId}-shade`, role: "shading", name: "채색·명암 레이어", payload: `shade:${page.sha256.slice(0, 16)}` }),
      createScopedHandoffLayerSnapshot({ layerId: `${cutId}-bg3d`, role: "bg3d-place", name: "3D 배경 배치", payload: `bg3d:${page.sha256.slice(0, 16)}` }),
      createScopedHandoffLayerSnapshot({ layerId: `${cutId}-text`, role: "lettering", name: "식자·말풍선", payload: `letter:${page.sha256.slice(0, 16)}` }),
    ]);
    const revisionHash = computeScopedHandoffSha256({ cutId, pageSha256: page.sha256, layers: layers.map((layer) => layer.revisionHash) });
    return Object.freeze({ cutId, label: `컷 ${page.ordinal + 1}`, orderIndex: index, revisionHash, width: page.width, height: page.height, previewDigest: page.sha256, layers });
  });
  return Object.freeze({ workId: input.workId, projectId: input.projectId, episodeLabel: input.episodeLabel, baseRevisionId: input.baseRevisionId, baseRevisionHash: normalizedBaseHash, cuts: Object.freeze(cuts) });
}
