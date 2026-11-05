import type { El } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import type { StudioCrdtSceneElementRecord } from "./studio-crdt-document";
import type { StudioCrdtSceneGraphFrontier } from "./studio-crdt-history";
import { studioShared3dStageVisibilityOverlayElementIds } from "../studio-shared-3d-stage-collection";

const SOURCE_IDENTITY_KEYS = ["elementType", "src", "groupId", "bg3dLtBundleReference", "bg3dLtBundleId", "bg3dLtRole", "bg3dLtRenderMode"] as const;

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => equal(value, right[index]));
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && equal(Reflect.get(left, key), Reflect.get(right, key)));
}

function stable(before: StudioCrdtSceneElementRecord | undefined, after: StudioCrdtSceneElementRecord): before is StudioCrdtSceneElementRecord {
  return Boolean(before && !before.deleted && !after.deleted
    && before.pageId === after.pageId && before.layerId === after.layerId && before.orderIndex === after.orderIndex
    && before.payload.type === after.payload.type && before.payload.version === after.payload.version
    && SOURCE_IDENTITY_KEYS.every((key) => equal(before.payload.props[key], after.payload.props[key])));
}

/**
 * 원격 속성 변경을 기존 undo/redo snapshot에 즉시 반영한다. 비동기 본문 복원 전에 undo해도
 * 이전 snapshot의 낡은 값이 원격 변경을 다시 발행하지 않도록 하며, 다른 속성의 로컬 이력은 유지한다.
 * 생성·삭제·이동·본문 참조 교체는 이 경로에서 추정하지 않고 기존 전체 frontier 복원에 맡긴다.
 */
export function rebaseStudioCrdtPendingScenePropertyHistory(input: {
  history: PageState[][];
  before: StudioCrdtSceneGraphFrontier;
  after: StudioCrdtSceneGraphFrontier;
  changedSceneElementIds: ReadonlySet<string>;
}): { history: PageState[][]; changed: boolean; handledSceneElementIds: ReadonlySet<string> } {
  if (input.changedSceneElementIds.size === 0) return { history: input.history, changed: false, handledSceneElementIds: new Set() };
  const beforeById = new Map(input.before.sceneElements.map((record) => [record.id, record]));
  const patches = new Map<string, { type: string; values: Record<string, unknown>; unset: string[] }>();
  const handledSceneElementIds = new Set<string>();
  for (const after of input.after.sceneElements) {
    if (!input.changedSceneElementIds.has(after.id)) continue;
    const before = beforeById.get(after.id);
    if (!stable(before, after)) continue;
    const type = after.payload.type === "reference" ? after.payload.props.elementType : after.payload.type;
    if (typeof type !== "string") continue;
    const values: Record<string, unknown> = {}, unset: string[] = [];
    const keys = new Set([...Object.keys(before.payload.props), ...Object.keys(after.payload.props)]);
    for (const key of keys) {
      // 출처는 불변 원본이 소유한다. 실시간 봉투로 제거하거나 덮어쓰지 않는다.
      if (key === "bundleSourceCredit" || equal(before.payload.props[key], after.payload.props[key])) continue;
      if (Object.hasOwn(after.payload.props, key)) values[key] = after.payload.props[key];
      else unset.push(key);
    }
    handledSceneElementIds.add(after.id);
    if (Object.keys(values).length || unset.length) patches.set(after.id, { type, values, unset });
  }
  if (patches.size === 0) return { history: input.history, changed: false, handledSceneElementIds };
  let changed = false;
  const history = input.history.map((pages) => {
    let pagesChanged = false;
    const nextPages = pages.map((page) => {
      let elementsChanged = false;
      const touchesVisibility = page.shared3dStage !== undefined && page.elements.some((element) => {
        const patch = patches.get(element.id);
        return patch && (Object.hasOwn(patch.values, "hidden") || patch.unset.includes("hidden"));
      });
      const overlayIds = touchesVisibility ? studioShared3dStageVisibilityOverlayElementIds(page.shared3dStage, page.elements) : new Set<string>();
      const elements = page.elements.map((element) => {
        const patch = patches.get(element.id);
        if (!patch || patch.type !== element.type) return element;
        // 사용자 hidden 속성과 별개인 Stage의 정확한 모델 영수증 권위는 즉시 투영에서도 유지한다.
        const values = overlayIds.has(element.id) ? { ...patch.values, hidden: true } : patch.values;
        const unset = overlayIds.has(element.id) ? patch.unset.filter((key) => key !== "hidden") : patch.unset;
        if (Object.entries(values).every(([key, value]) => equal(Reflect.get(element, key), value))
          && unset.every((key) => !Object.hasOwn(element, key))) return element;
        const next = { ...element, ...values };
        for (const key of unset) Reflect.deleteProperty(next, key);
        elementsChanged = true;
        return next as El;
      });
      if (!elementsChanged) return page;
      pagesChanged = true;
      return { ...page, elements };
    });
    if (!pagesChanged) return pages;
    changed = true;
    return nextPages;
  });
  return { history: changed ? history : input.history, changed, handledSceneElementIds };
}
