/**
 * 장면 노드의 계층(부모·자식)과 장면 구성 정보(태그·컴포넌트 참조·장면 메타)의 규칙을 한곳에 둔다.
 *
 * 이 모듈은 Studio 진입 그래프에 정적으로 닿는 장면 문서(studio-bg3d-scene-document)가 직접 가져오는
 * 모듈이다. 문서 정규화가 쓰는 규칙(텍스트 안전 검사·태그/컴포넌트/메타 정규화)을 새 파일로 나누면
 * 금지 도메인(bg3d)으로 닿는 모듈이 늘어 진입 그래프 래칫을 건드리므로, 이미 닿아 있는 이 모듈에 둔다.
 * 편집 동작(태그 붙이기·숨기기·묶기 계획)은 이 모듈이 아니라 지연 로드되는 studio-bg3d-scene-organization 쪽에 있다.
 */

import { failBudget } from "./studio-bg3d-scene-document-types";

import type {
  StudioBg3dComponentRef,
  StudioBg3dNodeOrganization,
  StudioBg3dSceneMeta,
} from "./studio-bg3d-scene-document-types";

export interface StudioBg3dHierarchyEntity {
  readonly id: string;
  readonly parentId?: string | null;
}

export interface StudioBg3dVisibleHierarchyEntity extends StudioBg3dHierarchyEntity {
  readonly visible?: boolean;
  /** 장면 구성 정보의 태그. 숨긴 태그(hiddenTags)를 넘기면 이 값으로 태그 숨김을 판정한다. */
  readonly tags?: readonly string[];
}

export interface StudioBg3dResolvedHierarchy {
  readonly roots: readonly string[];
  readonly childrenByParent: ReadonlyMap<string, readonly string[]>;
  readonly parentById: ReadonlyMap<string, string | null>;
  readonly repairedOrphans: number;
  readonly repairedSelfParents: number;
  readonly repairedCycles: number;
}

/**
 * Resolves a bounded forest from user/project data. Invalid parents are promoted to roots and one
 * deterministic edge per cycle is removed, so recursive renderers and layer trees can never loop.
 */
export function resolveStudioBg3dHierarchy(
  entities: readonly StudioBg3dHierarchyEntity[],
): StudioBg3dResolvedHierarchy {
  const orderedIds: string[] = [];
  const entityById = new Map<string, StudioBg3dHierarchyEntity>();
  for (const entity of entities) {
    if (!entity.id || entityById.has(entity.id)) continue;
    entityById.set(entity.id, entity);
    orderedIds.push(entity.id);
  }
  const order = new Map(orderedIds.map((id, index) => [id, index] as const));
  const parentById = new Map<string, string | null>();
  let repairedOrphans = 0;
  let repairedSelfParents = 0;
  for (const id of orderedIds) {
    const requested = entityById.get(id)?.parentId ?? null;
    if (!requested) {
      parentById.set(id, null);
    } else if (requested === id) {
      repairedSelfParents += 1;
      parentById.set(id, null);
    } else if (!entityById.has(requested)) {
      repairedOrphans += 1;
      parentById.set(id, null);
    } else {
      parentById.set(id, requested);
    }
  }

  let repairedCycles = 0;
  for (const startId of orderedIds) {
    const path: string[] = [];
    const pathIndex = new Map<string, number>();
    let cursor: string | null = startId;
    while (cursor !== null) {
      const cycleStart = pathIndex.get(cursor);
      if (cycleStart !== undefined) {
        const cycle = path.slice(cycleStart);
        const breakId = cycle.reduce((first, id) =>
          (order.get(id) ?? Number.MAX_SAFE_INTEGER) < (order.get(first) ?? Number.MAX_SAFE_INTEGER)
            ? id
            : first);
        parentById.set(breakId, null);
        repairedCycles += 1;
        break;
      }
      pathIndex.set(cursor, path.length);
      path.push(cursor);
      cursor = parentById.get(cursor) ?? null;
    }
  }

  const roots: string[] = [];
  const mutableChildren = new Map<string, string[]>();
  for (const id of orderedIds) {
    const parentId = parentById.get(id) ?? null;
    if (parentId === null) {
      roots.push(id);
      continue;
    }
    const children = mutableChildren.get(parentId) ?? [];
    children.push(id);
    mutableChildren.set(parentId, children);
  }
  const childrenByParent = new Map<string, readonly string[]>();
  for (const [id, children] of mutableChildren) {
    childrenByParent.set(id, Object.freeze([...children]));
  }
  return Object.freeze({
    roots: Object.freeze(roots),
    childrenByParent,
    parentById,
    repairedOrphans,
    repairedSelfParents,
    repairedCycles,
  });
}

export function normalizeStudioBg3dHierarchyParents<T extends StudioBg3dHierarchyEntity>(
  entities: readonly T[],
): readonly T[] {
  const resolved = resolveStudioBg3dHierarchy(entities);
  return entities.map((entity) => {
    const parentId = resolved.parentById.get(entity.id) ?? null;
    return (entity.parentId ?? null) === parentId ? entity : { ...entity, parentId };
  });
}

/** 숨긴 태그가 하나라도 붙은 엔티티인가. 오브젝트 자체의 `visible` 과 부모 숨김은 보지 않는다. */
export function isStudioBg3dTagHidden(
  entity: { readonly tags?: readonly string[] },
  hiddenTags: ReadonlySet<string> | undefined,
): boolean {
  if (hiddenTags === undefined || hiddenTags.size === 0 || entity.tags === undefined) return false;
  return entity.tags.some((tag) => hiddenTags.has(tag));
}

/**
 * Returns exactly the entities visible through the same repaired hierarchy used for rendering.
 * `hiddenTags` 를 넘기면 그 태그가 붙은 엔티티도 숨긴 것으로 본다(오브젝트 `visible` 과 별개로 계산하며,
 * 자식은 부모가 숨겨지면 함께 숨겨진다). 넘기지 않으면 예전과 똑같이 동작한다.
 */
export function collectStudioBg3dEffectivelyVisibleEntityIds(
  entities: readonly StudioBg3dVisibleHierarchyEntity[],
  hiddenTags?: ReadonlySet<string>,
): ReadonlySet<string> {
  const hierarchy = resolveStudioBg3dHierarchy(entities);
  const entityById = new Map(entities.map((entity) => [entity.id, entity] as const));
  const visibleIds = new Set<string>();
  const pending = hierarchy.roots.map((id) => ({ id, ancestorsVisible: true }));
  while (pending.length > 0) {
    const entry = pending.pop();
    if (!entry) break;
    const entity = entityById.get(entry.id);
    if (!entity) continue;
    const visible = entry.ancestorsVisible && entity.visible !== false
      && !isStudioBg3dTagHidden(entity, hiddenTags);
    if (visible) visibleIds.add(entry.id);
    const children = hierarchy.childrenByParent.get(entry.id) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const childId = children[index];
      if (childId) pending.push({ id: childId, ancestorsVisible: visible });
    }
  }
  return visibleIds;
}

export function canSetStudioBg3dParent(
  entities: readonly StudioBg3dHierarchyEntity[],
  childId: string,
  proposedParentId: string | null,
): boolean {
  if (proposedParentId === null) return entities.some((entity) => entity.id === childId);
  const entityById = new Map(entities.map((entity) => [entity.id, entity] as const));
  if (!entityById.has(childId) || !entityById.has(proposedParentId) || childId === proposedParentId) {
    return false;
  }
  const visited = new Set<string>();
  let cursor: string | null = proposedParentId;
  while (cursor !== null) {
    if (cursor === childId || visited.has(cursor)) return false;
    visited.add(cursor);
    const parentId: string | null | undefined = entityById.get(cursor)?.parentId;
    cursor = parentId && entityById.has(parentId) ? parentId : null;
  }
  return true;
}

// ── 장면 문서 텍스트 안전 검사 ─────────────────────────────────────────────────────────────
// 장면 문서의 모든 사용자 텍스트(노드 이름·샷 이름·태그·컴포넌트 이름·장면 이름과 메모)가 같은 규칙을 쓴다.
// 문서는 외부 주소·자격 증명 문자열을 담지 않는 계약이라, 그런 모양의 텍스트는 값을 고쳐 쓰지 않고 거절한다.

const EXTERNAL_REFERENCE_PATTERN = /(?:\b(?:blob|data|file|https?):|:\/\/|\bwww\.)/iu;
const SENSITIVE_REFERENCE_PATTERN =
  /(?:\b(?:api[-_ ]?key|access[-_ ]?token|secret|password)\b|(?:^|\s)sk-[A-Za-z0-9_-]{8,})/iu;

export function containsStudioBg3dControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

/**
 * NFKC 정규화·앞뒤 공백 제거·연속 공백 접기를 한 텍스트를 돌려준다. 제어 문자가 있거나 비어 있거나
 * `maximumLength` 코드 포인트를 넘으면 null 이다. `rejectExternalReference` 이면 주소·자격 증명 모양도 거절한다.
 */
export function normalizeStudioBg3dDocumentText(
  value: unknown,
  maximumLength: number,
  rejectExternalReference = false,
): string | null {
  if (typeof value !== "string" || containsStudioBg3dControlCharacter(value)) return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (
    !normalized ||
    Array.from(normalized).length > maximumLength ||
    (rejectExternalReference &&
      (EXTERNAL_REFERENCE_PATTERN.test(normalized) ||
        SENSITIVE_REFERENCE_PATTERN.test(normalized)))
  ) {
    return null;
  }
  return normalized;
}

// ── 장면 구성 정보: 태그 · 컴포넌트 참조 · 장면 메타 ─────────────────────────────────────────

/** 태그 하나의 최대 길이(코드 포인트). 한글 3바이트 기준 문서 바이트 예산 안에서 노드당 8개까지 안전한 값이다. */
export const STUDIO_BG3D_TAG_MAX_CODE_POINTS = 32;
export const STUDIO_BG3D_NODE_MAX_TAGS = 8;
export const STUDIO_BG3D_SCENE_MAX_HIDDEN_TAGS = 64;
export const STUDIO_BG3D_COMPONENT_NAME_MAX_CODE_POINTS = 48;
export const STUDIO_BG3D_SCENE_NAME_MAX_CODE_POINTS = 80;
export const STUDIO_BG3D_SCENE_MEMO_MAX_CODE_POINTS = 600;
const STUDIO_BG3D_TAG_SCAN_LIMIT = 1_024;
const COMPONENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/u;
const FORBIDDEN_ORGANIZATION_KEYS = new Set(["constructor", "prototype", "__proto__"]);

/** 태그를 넘치게 받았을 때: "fail" 은 문서 규칙대로 예산 오류를 던지고, "truncate" 는 편집 경계에서 앞쪽만 남긴다. */
export type StudioBg3dTagOverflow = "fail" | "truncate";
/** "node" 는 노드의 태그 목록(최대 8개), "scene" 은 장면·컷의 숨긴 태그 목록(최대 64개)이다. */
export type StudioBg3dTagScope = "node" | "scene";

function isOrganizationRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 코드 유닛 순서의 비교. 로케일에 따라 순서가 달라지면 직렬화가 흔들리므로 localeCompare 를 쓰지 않는다. */
export function compareStudioBg3dTags(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * 태그 목록을 정규화한다: 각 태그는 문서 텍스트 규칙을 통과해야 하고(실패한 항목은 버린다), 중복을 없애고
 * 코드 유닛 순서로 정렬한다. 같은 입력이면 언제나 같은 바이트가 나온다.
 */
export function normalizeStudioBg3dTags(
  value: unknown,
  scope: StudioBg3dTagScope = "node",
  overflow: StudioBg3dTagOverflow = "fail",
): readonly string[] {
  if (!Array.isArray(value)) return [];
  const limit = scope === "node" ? STUDIO_BG3D_NODE_MAX_TAGS : STUDIO_BG3D_SCENE_MAX_HIDDEN_TAGS;
  const code = scope === "node" ? "tag-count-budget-exceeded" : "hidden-tag-count-budget-exceeded";
  if (value.length > STUDIO_BG3D_TAG_SCAN_LIMIT && overflow === "fail") failBudget(code);
  const tags = new Set<string>();
  const candidates: readonly unknown[] = value.slice(0, STUDIO_BG3D_TAG_SCAN_LIMIT);
  for (const raw of candidates) {
    const tag = normalizeStudioBg3dDocumentText(raw, STUDIO_BG3D_TAG_MAX_CODE_POINTS, true);
    if (tag && !FORBIDDEN_ORGANIZATION_KEYS.has(tag.toLowerCase())) tags.add(tag);
  }
  const sorted = [...tags].sort(compareStudioBg3dTags);
  if (sorted.length <= limit) return sorted;
  if (overflow === "fail") failBudget(code);
  return sorted.slice(0, limit);
}

/** 컴포넌트 참조를 정규화한다. id 나 이름이 규칙에 맞지 않으면 참조 전체를 버린다. */
export function normalizeStudioBg3dComponentRef(value: unknown): StudioBg3dComponentRef | undefined {
  if (!isOrganizationRecord(value)) return undefined;
  const id = value.id;
  const name = normalizeStudioBg3dDocumentText(value.name, STUDIO_BG3D_COMPONENT_NAME_MAX_CODE_POINTS, true);
  if (
    typeof id !== "string" ||
    !COMPONENT_ID_PATTERN.test(id) ||
    FORBIDDEN_ORGANIZATION_KEYS.has(id.toLowerCase()) ||
    !name
  ) {
    return undefined;
  }
  return { id, name };
}

/**
 * 노드 객체에서 `tags`·`componentRef` 를 읽어 정규화한다. 비어 있거나 올바르지 않은 값은 키 자체를 만들지 않는다
 * (빈 배열을 쓰지 않으므로 태그·컴포넌트가 없는 노드는 기존 문서와 바이트가 같다).
 */
export function normalizeStudioBg3dNodeOrganization(
  node: unknown,
  overflow: StudioBg3dTagOverflow = "fail",
): StudioBg3dNodeOrganization {
  if (!isOrganizationRecord(node)) return {};
  const tags = normalizeStudioBg3dTags(node.tags, "node", overflow);
  const componentRef = normalizeStudioBg3dComponentRef(node.componentRef);
  return {
    ...(tags.length > 0 ? { tags } : {}),
    ...(componentRef ? { componentRef } : {}),
  };
}

/**
 * 장면 메모를 정규화한다. 줄바꿈은 살리되 줄마다 문서 텍스트 규칙을 적용하고, 앞뒤 빈 줄을 없애며,
 * 연속 빈 줄은 하나로 접는다. 줄 하나라도 규칙에 걸리면(주소·자격 증명 모양) 메모 전체를 버린다.
 */
export function normalizeStudioBg3dSceneMemo(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const lines: string[] = [];
  for (const rawLine of value.split(/\r\n|\r|\n/u)) {
    if (rawLine.trim() === "") {
      if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
      continue;
    }
    const line = normalizeStudioBg3dDocumentText(rawLine, STUDIO_BG3D_SCENE_MEMO_MAX_CODE_POINTS, true);
    if (line === null) return undefined;
    lines.push(line);
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const memo = lines.join("\n");
  if (memo === "" || Array.from(memo).length > STUDIO_BG3D_SCENE_MEMO_MAX_CODE_POINTS) return undefined;
  return memo;
}

/** 장면 메타를 정규화한다. 모든 필드가 비면 undefined 라서 문서가 `meta` 키를 만들지 않는다. */
export function normalizeStudioBg3dSceneMeta(
  value: unknown,
  overflow: StudioBg3dTagOverflow = "fail",
): StudioBg3dSceneMeta | undefined {
  if (!isOrganizationRecord(value)) return undefined;
  const name = normalizeStudioBg3dDocumentText(value.name, STUDIO_BG3D_SCENE_NAME_MAX_CODE_POINTS, true);
  const memo = normalizeStudioBg3dSceneMemo(value.memo);
  const hiddenTags = normalizeStudioBg3dTags(value.hiddenTags, "scene", overflow);
  const meta: StudioBg3dSceneMeta = {
    ...(name ? { name } : {}),
    ...(memo ? { memo } : {}),
    ...(hiddenTags.length > 0 ? { hiddenTags } : {}),
  };
  return Object.keys(meta).length > 0 ? meta : undefined;
}

/** 장면 메타의 숨긴 태그만 바꾼 사본. 결과가 비면 undefined(문서에서 `meta` 를 뺀다). */
export function withStudioBg3dHiddenTags(
  meta: StudioBg3dSceneMeta | undefined,
  hiddenTags: readonly string[],
): StudioBg3dSceneMeta | undefined {
  const { hiddenTags: _previous, ...rest } = meta ?? {};
  return normalizeStudioBg3dSceneMeta({ ...rest, hiddenTags }, "truncate");
}
