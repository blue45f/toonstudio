/**
 * 장면 구성 정보(태그·컴포넌트 묶음·장면 메타)를 바꾸는 계획. 렌더러를 모르는 순수 함수다.
 *
 * 아웃라이너 명령(studio-bg3d-outliner-mutation)이 이 계획을 그대로 받아 기존 실행 취소·다시 실행 경로
 * (commitImmediateHistoryTransition → replaceCanonicalDocumentState)로 커밋한다. 이 모듈은 상태를 직접 바꾸지 않고,
 * 규칙에 어긋나면 일부만 적용하지 않고 통째로 거절한다(`invalid-input`·`limit-exceeded`·`unchanged`·`entity-not-found`).
 */

import {
  STUDIO_BG3D_COMPONENT_NAME_MAX_CODE_POINTS,
  STUDIO_BG3D_NODE_MAX_TAGS,
  STUDIO_BG3D_SCENE_MAX_HIDDEN_TAGS,
  STUDIO_BG3D_SCENE_NAME_MAX_CODE_POINTS,
  normalizeStudioBg3dComponentRef,
  normalizeStudioBg3dDocumentText,
  normalizeStudioBg3dSceneMemo,
  normalizeStudioBg3dSceneMeta,
  normalizeStudioBg3dTags,
  withStudioBg3dHiddenTags,
} from "./studio-bg3d-hierarchy";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";
import type {
  StudioBg3dOutlinerMutationFailure,
  StudioBg3dOutlinerMutationPlan,
  StudioBg3dOutlinerSceneSnapshot,
} from "./studio-bg3d-outliner-mutation";
import type {
  StudioBg3dComponentRef,
  StudioBg3dSceneDocument,
  StudioBg3dSceneMeta,
} from "./studio-bg3d-scene-document-types";

/** 장면 전체에서 쓸 수 있는 서로 다른 태그 수. 숨긴 태그 목록 한도와 같아야 모든 태그를 숨길 수 있다. */
export const STUDIO_BG3D_SCENE_MAX_TAGS = STUDIO_BG3D_SCENE_MAX_HIDDEN_TAGS;
/** 태그·컴포넌트 참조가 문서에서 차지할 수 있는 바이트 어림값의 상한. 문서 예산(320KiB)을 이것만으로 채우지 못하게 한다. */
export const STUDIO_BG3D_ORGANIZATION_MAX_BYTES = 96 * 1024;

export type StudioBg3dOrganizationAction =
  | { readonly type: "add-tag"; readonly ids: readonly string[]; readonly tag: string }
  | { readonly type: "remove-tag"; readonly ids: readonly string[]; readonly tag: string }
  | { readonly type: "toggle-tag-visibility"; readonly tag: string }
  | { readonly type: "group-component"; readonly ids: readonly string[]; readonly name: string }
  | { readonly type: "ungroup-component"; readonly ids: readonly string[] }
  | { readonly type: "rename-component"; readonly componentId: string; readonly name: string }
  | {
      readonly type: "set-scene-meta";
      /** 빈 문자열은 지우기다. 없는 키는 건드리지 않는다. */
      readonly name?: string;
      readonly memo?: string;
    };

export interface StudioBg3dOrganizationDependencies {
  /** 새 컴포넌트 id. 이미 쓰는 id 는 `taken` 으로 알려 주며, 돌려준 값이 겹치거나 규칙에 어긋나면 계획이 거절된다. */
  readonly createComponentId: (taken: ReadonlySet<string>) => string;
}

type Entity = BgPrimitive | BgCustomModelInstance;

interface EntityPatch {
  readonly tags?: readonly string[] | undefined;
  readonly componentRef?: StudioBg3dComponentRef | undefined;
}

interface MappedEntities {
  readonly primitives: BgPrimitive[];
  readonly customModels: BgCustomModelInstance[];
  readonly changed: boolean;
}

/**
 * 새 컴포넌트 묶음 id. 시각과 순번에 임의 값을 더해 서로 다른 탭·협업 편집기가 같은 순간에 만들어도 겹칠 일이 없게 하고,
 * 이미 쓰는 id(`taken`)는 건너뛴다. 임의 값은 주입해 시험이 같은 id 를 얻을 수 있다.
 */
export function createStudioBg3dComponentId(
  taken: ReadonlySet<string>,
  now: number = Date.now(),
  random: () => number = Math.random,
): string {
  const stamp = Math.max(0, Math.floor(now)).toString(36);
  const salt = Math.floor(random() * 36 ** 4).toString(36).padStart(4, "0");
  let ordinal = taken.size + 1;
  let candidate = `comp-${stamp}-${salt}-${ordinal.toString(36)}`;
  while (taken.has(candidate)) {
    ordinal += 1;
    candidate = `comp-${stamp}-${salt}-${ordinal.toString(36)}`;
  }
  return candidate;
}

function failure(reason: StudioBg3dOutlinerMutationFailure["reason"]): StudioBg3dOutlinerMutationFailure {
  return Object.freeze({ ok: false, reason });
}

function success(
  snapshot: StudioBg3dOutlinerSceneSnapshot,
  mutation: {
    readonly primitives: readonly BgPrimitive[];
    readonly customModels: readonly BgCustomModelInstance[];
    readonly document?: StudioBg3dSceneDocument;
  },
  commandName: string,
  label: string,
): StudioBg3dOutlinerMutationPlan {
  return Object.freeze({
    ok: true,
    snapshot: {
      primitives: [...mutation.primitives],
      customModels: [...mutation.customModels],
      document: mutation.document ?? snapshot.document,
    },
    command: Object.freeze({ id: `bg3d.outliner.${commandName}`, label, source: "menu" as const }),
    selection: Object.freeze({ type: "preserve" as const }),
  });
}

function everyEntity(snapshot: StudioBg3dOutlinerSceneSnapshot): readonly Entity[] {
  return [...snapshot.primitives, ...snapshot.customModels];
}

/**
 * 구성 필드를 바꾼 사본. 값이 비면 undefined 로 둔다 — 문서 변환이 빈 값을 키 없이 내보내므로 저장 바이트는 같다
 * (이름 바꾸기도 같은 방식으로 undefined 를 쓴다).
 */
function patchEntity<T extends Entity>(entity: T, patch: EntityPatch): T {
  return {
    ...entity,
    ...("tags" in patch ? { tags: patch.tags && patch.tags.length > 0 ? patch.tags : undefined } : {}),
    ...("componentRef" in patch ? { componentRef: patch.componentRef } : {}),
  };
}

function textBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** 태그·컴포넌트 참조가 문서에서 차지할 바이트 어림값. */
export function estimateStudioBg3dOrganizationBytes(entities: readonly Entity[]): number {
  let total = 0;
  for (const entity of entities) {
    if (entity.tags && entity.tags.length > 0) total += textBytes(entity.tags) + 9;
    if (entity.componentRef) total += textBytes(entity.componentRef) + 15;
  }
  return total;
}

function distinctTags(entities: readonly Entity[]): ReadonlySet<string> {
  return new Set(entities.flatMap((entity) => entity.tags ?? []));
}

/** 요청한 id 가 모두 장면에 있을 때만 집합을 돌려준다. 하나라도 없거나 비어 있으면 null. */
function requireEntityIds(ids: readonly string[], entities: readonly Entity[]): ReadonlySet<string> | null {
  const wanted = new Set(ids);
  if (wanted.size === 0) return null;
  const present = new Set(entities.map((entity) => entity.id));
  return [...wanted].every((id) => present.has(id)) ? wanted : null;
}

/** `update` 가 같은 엔티티를 돌려주면 건드리지 않은 것이다. 다른 값을 돌려주면 그 구성 필드만 반영한 사본을 만든다. */
function mapEntities(
  snapshot: StudioBg3dOutlinerSceneSnapshot,
  ids: ReadonlySet<string>,
  update: (entity: Entity) => EntityPatch | null,
): MappedEntities {
  let changed = false;
  const apply = <T extends Entity>(entity: T): T => {
    if (!ids.has(entity.id)) return entity;
    const patch = update(entity);
    if (!patch) return entity;
    changed = true;
    return patchEntity(entity, patch);
  };
  return {
    primitives: snapshot.primitives.map(apply),
    customModels: snapshot.customModels.map(apply),
    changed,
  };
}

function replaceMeta(
  document: StudioBg3dSceneDocument,
  meta: StudioBg3dSceneMeta | undefined,
): StudioBg3dSceneDocument {
  const { meta: _previous, ...rest } = document;
  return meta ? { ...rest, meta } : rest;
}

/** 어떤 오브젝트에도 붙어 있지 않은 숨긴 태그를 치운 문서. 치울 것이 없으면 undefined. */
function pruneStaleHiddenTags(
  document: StudioBg3dSceneDocument,
  used: ReadonlySet<string>,
): StudioBg3dSceneDocument | undefined {
  const hidden = document.meta?.hiddenTags ?? [];
  const kept = hidden.filter((tag) => used.has(tag));
  if (kept.length === hidden.length) return undefined;
  return replaceMeta(document, withStudioBg3dHiddenTags(document.meta, kept));
}

function readTag(value: string): string | undefined {
  return normalizeStudioBg3dTags([value], "node", "truncate")[0];
}

function planAddTag(
  snapshot: StudioBg3dOutlinerSceneSnapshot,
  action: Extract<StudioBg3dOrganizationAction, { readonly type: "add-tag" }>,
): StudioBg3dOutlinerMutationPlan {
  const ids = requireEntityIds(action.ids, everyEntity(snapshot));
  if (!ids) return failure("entity-not-found");
  const tag = readTag(action.tag);
  if (!tag) return failure("invalid-input");
  let overflow = false;
  const result = mapEntities(snapshot, ids, (entity) => {
    const current = entity.tags ?? [];
    if (current.includes(tag)) return null;
    if (current.length >= STUDIO_BG3D_NODE_MAX_TAGS) {
      overflow = true;
      return null;
    }
    return { tags: normalizeStudioBg3dTags([...current, tag], "node", "truncate") };
  });
  if (overflow) return failure("limit-exceeded");
  if (!result.changed) return failure("unchanged");
  const next = [...result.primitives, ...result.customModels];
  const used = distinctTags(next);
  if (used.size > STUDIO_BG3D_SCENE_MAX_TAGS || estimateStudioBg3dOrganizationBytes(next) > STUDIO_BG3D_ORGANIZATION_MAX_BYTES) {
    return failure("limit-exceeded");
  }
  // 새로 쓰기 시작하는 태그는 언제나 보이는 채로 시작한다(예전에 숨겨 둔 같은 이름의 흔적이 되살아나지 않게).
  const wasUsed = distinctTags(everyEntity(snapshot)).has(tag);
  const document = wasUsed
    ? undefined
    : pruneStaleHiddenTags(snapshot.document, new Set([...used].filter((entry) => entry !== tag)));
  return success(snapshot, { ...result, ...(document ? { document } : {}) }, "add-tag", `Add tag ${tag}`);
}

function planRemoveTag(
  snapshot: StudioBg3dOutlinerSceneSnapshot,
  action: Extract<StudioBg3dOrganizationAction, { readonly type: "remove-tag" }>,
): StudioBg3dOutlinerMutationPlan {
  const ids = requireEntityIds(action.ids, everyEntity(snapshot));
  if (!ids) return failure("entity-not-found");
  const tag = readTag(action.tag);
  if (!tag) return failure("invalid-input");
  const result = mapEntities(snapshot, ids, (entity) =>
    entity.tags?.includes(tag) ? { tags: entity.tags.filter((existing) => existing !== tag) } : null,
  );
  if (!result.changed) return failure("unchanged");
  // 마지막 구성원이 태그를 잃으면 숨긴 태그 목록에서도 치운다(같은 이름을 나중에 다시 붙였을 때 처음부터 숨겨지지 않게).
  const document = pruneStaleHiddenTags(snapshot.document, distinctTags([...result.primitives, ...result.customModels]));
  return success(snapshot, { ...result, ...(document ? { document } : {}) }, "remove-tag", `Remove tag ${tag}`);
}

function planToggleTagVisibility(
  snapshot: StudioBg3dOutlinerSceneSnapshot,
  action: Extract<StudioBg3dOrganizationAction, { readonly type: "toggle-tag-visibility" }>,
): StudioBg3dOutlinerMutationPlan {
  const tag = readTag(action.tag);
  if (!tag) return failure("invalid-input");
  if (!distinctTags(everyEntity(snapshot)).has(tag)) return failure("entity-not-found");
  const hidden = snapshot.document.meta?.hiddenTags ?? [];
  const showing = hidden.includes(tag);
  const next = showing ? hidden.filter((entry) => entry !== tag) : [...hidden, tag];
  if (next.length > STUDIO_BG3D_SCENE_MAX_HIDDEN_TAGS) return failure("limit-exceeded");
  const document = replaceMeta(snapshot.document, withStudioBg3dHiddenTags(snapshot.document.meta, next));
  return success(
    snapshot,
    { primitives: snapshot.primitives, customModels: snapshot.customModels, document },
    "toggle-tag-visibility",
    `${showing ? "Show" : "Hide"} tag ${tag}`,
  );
}

function planGroupComponent(
  snapshot: StudioBg3dOutlinerSceneSnapshot,
  action: Extract<StudioBg3dOrganizationAction, { readonly type: "group-component" }>,
  dependencies: StudioBg3dOrganizationDependencies,
): StudioBg3dOutlinerMutationPlan {
  const ids = requireEntityIds(action.ids, everyEntity(snapshot));
  if (!ids) return failure("entity-not-found");
  const name = normalizeStudioBg3dDocumentText(action.name, STUDIO_BG3D_COMPONENT_NAME_MAX_CODE_POINTS, true);
  if (!name) return failure("invalid-input");
  const taken = new Set(everyEntity(snapshot).flatMap((entity) => (entity.componentRef ? [entity.componentRef.id] : [])));
  const componentRef = normalizeStudioBg3dComponentRef({ id: dependencies.createComponentId(taken), name });
  if (!componentRef || taken.has(componentRef.id)) return failure("invalid-input");
  const result = mapEntities(snapshot, ids, () => ({ componentRef }));
  if (estimateStudioBg3dOrganizationBytes([...result.primitives, ...result.customModels]) > STUDIO_BG3D_ORGANIZATION_MAX_BYTES) {
    return failure("limit-exceeded");
  }
  return success(snapshot, result, "group-component", `Group component ${name}`);
}

function planUngroupComponent(
  snapshot: StudioBg3dOutlinerSceneSnapshot,
  action: Extract<StudioBg3dOrganizationAction, { readonly type: "ungroup-component" }>,
): StudioBg3dOutlinerMutationPlan {
  const ids = requireEntityIds(action.ids, everyEntity(snapshot));
  if (!ids) return failure("entity-not-found");
  const result = mapEntities(snapshot, ids, (entity) => (entity.componentRef ? { componentRef: undefined } : null));
  return result.changed ? success(snapshot, result, "ungroup-component", "Ungroup component") : failure("unchanged");
}

function planRenameComponent(
  snapshot: StudioBg3dOutlinerSceneSnapshot,
  action: Extract<StudioBg3dOrganizationAction, { readonly type: "rename-component" }>,
): StudioBg3dOutlinerMutationPlan {
  const members = everyEntity(snapshot).filter((entity) => entity.componentRef?.id === action.componentId);
  if (members.length === 0) return failure("entity-not-found");
  const name = normalizeStudioBg3dDocumentText(action.name, STUDIO_BG3D_COMPONENT_NAME_MAX_CODE_POINTS, true);
  if (!name) return failure("invalid-input");
  const result = mapEntities(snapshot, new Set(members.map((member) => member.id)), (entity) =>
    entity.componentRef && entity.componentRef.name !== name
      ? { componentRef: { id: entity.componentRef.id, name } }
      : null,
  );
  return result.changed ? success(snapshot, result, "rename-component", `Rename component ${name}`) : failure("unchanged");
}

function planSetSceneMeta(
  snapshot: StudioBg3dOutlinerSceneSnapshot,
  action: Extract<StudioBg3dOrganizationAction, { readonly type: "set-scene-meta" }>,
): StudioBg3dOutlinerMutationPlan {
  const draft: { name?: string; memo?: string; hiddenTags?: readonly string[] } = { ...snapshot.document.meta };
  if (action.name !== undefined) {
    if (action.name.trim() === "") delete draft.name;
    else {
      const name = normalizeStudioBg3dDocumentText(action.name, STUDIO_BG3D_SCENE_NAME_MAX_CODE_POINTS, true);
      if (!name) return failure("invalid-input");
      draft.name = name;
    }
  }
  if (action.memo !== undefined) {
    if (action.memo.trim() === "") delete draft.memo;
    else {
      const memo = normalizeStudioBg3dSceneMemo(action.memo);
      if (!memo) return failure("invalid-input");
      draft.memo = memo;
    }
  }
  const meta = normalizeStudioBg3dSceneMeta(draft, "truncate");
  if (JSON.stringify(meta ?? null) === JSON.stringify(snapshot.document.meta ?? null)) return failure("unchanged");
  return success(
    snapshot,
    { primitives: snapshot.primitives, customModels: snapshot.customModels, document: replaceMeta(snapshot.document, meta) },
    "set-scene-meta",
    "Edit scene info",
  );
}

export function planStudioBg3dOrganizationMutation(input: {
  readonly snapshot: StudioBg3dOutlinerSceneSnapshot;
  readonly action: StudioBg3dOrganizationAction;
  readonly dependencies: StudioBg3dOrganizationDependencies;
}): StudioBg3dOutlinerMutationPlan {
  const { snapshot, action } = input;
  switch (action.type) {
    case "add-tag":
      return planAddTag(snapshot, action);
    case "remove-tag":
      return planRemoveTag(snapshot, action);
    case "toggle-tag-visibility":
      return planToggleTagVisibility(snapshot, action);
    case "group-component":
      return planGroupComponent(snapshot, action, input.dependencies);
    case "ungroup-component":
      return planUngroupComponent(snapshot, action);
    case "rename-component":
      return planRenameComponent(snapshot, action);
    case "set-scene-meta":
      return planSetSceneMeta(snapshot, action);
  }
}
