import { canonicalJson } from "@toonstudio/studio-project-model";
import type { El, DrawEl  } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import { studioScopedWriteAuthority } from "./studio-scoped-write-authority";
import { containingPanel } from "../studio-element-geometry";
import { sha256HexPortable } from "@toonstudio/contracts/sha256-portable";
import { admitStudioMappedPagesCommit, mappedStudioDrawAuthority, studioMappedStrokeRequiresAuthority } from "./studio-role-pipeline-mutation";

type AccessOwner = { readonly current: { readonly locked: boolean } };
type Input = { readonly owner: AccessOwner; readonly reportError: (message: string) => void; readonly lockMessage: () => string; readonly master?: boolean; readonly previewOnly?: boolean; readonly history?: "undo" | "redo" };
const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const kind = (value: { type: string }) => value.type === "draw" ? "stroke" as const : "element" as const;

/** 전역 잠금을 유지한 채 실제 before/after의 모든 변경 ID가 명시 대상에 속하는지 확인한다. */
export function admitStudioScopedElementCommit(input: Input & { readonly pageId: string; readonly previous: readonly El[]; readonly next: readonly El[]; readonly patch?: Partial<Omit<PageState, "id" | "elements">> }): boolean {
  if (!input.owner.current.locked) {
    const page = { id: input.pageId, elements: input.previous };
    return admitStudioMappedPagesCommit({ ...input, previous: [page], next: [{ ...page, ...input.patch, elements: input.next }], pageOnly: input.pageId });
  }
  if (input.history && equal(input.previous, input.next)) return false;
  const authority = studioScopedWriteAuthority(input.owner);
  if (!authority || input.master || Object.keys(input.patch ?? {}).length) { input.reportError(input.lockMessage()); return false; }
  try {
    const target = authority.currentTarget;
    if (!target || target.definition.pageId !== input.pageId) throw new Error("선택한 담당 페이지의 원고만 변경할 수 있습니다.");
    const ticket = authority.captureDrawingTicket(input.pageId, target.definition.layerId), previous = new Map(input.previous.map((value) => [value.id, value]));
    const next = new Map(input.next.map((value) => [value.id, value]));
    if (previous.size !== input.previous.length || next.size !== input.next.length) throw new Error("원고 ID가 중복되어 변경을 적용하지 않았습니다.");
    for (const id of new Set([...previous.keys(), ...next.keys()])) {
      const before = previous.get(id), after = next.get(id);
      if (equal(before ?? null, after ?? null)) continue;
      const value = after ?? before;
      if (!value || (before && after && before.type !== after.type) || (target.definition.frameId !== null && value.type === "frame")) throw new Error("원고의 원래 객체 종류와 프레임 경계를 유지하세요.");
      if (target.definition.layerId !== null && (value.groupId ?? "page-root") !== target.definition.layerId) throw new Error("선택한 담당 레이어의 원고만 변경할 수 있습니다.");
      if (target.definition.frameId !== null && after && (after.noClip || after.frameClipId !== target.definition.frameId || containingPanel(after, input.next)?.id !== target.definition.frameId)) throw new Error("선택한 담당 컷의 실제 클립 안에 원고를 유지하세요.");
      if (authority.ownerOf(kind(value), id) !== target.definition.id) throw new Error("선택한 담당 범위의 원고만 변경할 수 있습니다.");
      if (!input.previewOnly) {
        authority.admitExisting(ticket, kind(value), id);
        if (!before && after && authority.requiresRestoration(kind(after), id)) authority.registerRestoration(ticket, kind(after), id);
      }
    }
    return true;
  } catch (cause) { input.reportError(cause instanceof Error ? cause.message : input.lockMessage()); return false; }
}

/** 페이지 추가·삭제·순서·메타데이터를 제한 권한으로 변경하지 않는다. */
export function admitStudioScopedPagesCommit(input: Input & { readonly previous: readonly PageState[]; readonly next: readonly PageState[] }): boolean {
  if (!input.owner.current.locked) return admitStudioMappedPagesCommit(input);
  if (input.history && equal(input.previous, input.next)) return false;
  if (input.previous.length !== input.next.length || input.previous.some((page, index) => page.id !== input.next[index]?.id)) { input.reportError(input.lockMessage()); return false; }
  const authority = studioScopedWriteAuthority(input.owner), edge = studioScopedHistoryEdge(input.previous, input.next, input.history === "undo");
  if (!authority?.drawingAllowed) { input.reportError(input.lockMessage()); return false; }
  if (!input.history && !input.previewOnly && !input.next.some((page, index) => {
    const before = new Map(input.previous[index]?.elements.map((element) => [element.id, element]));
    return page.elements.some((element) => !equal(before.get(element.id) ?? null, element) && authority.canContinueCreation(kind(element), element.id));
  })) {
    input.reportError("현재 원고 세대에서 승인한 그리기 동작이 없습니다. 늦은 결과는 적용하지 않았습니다."); return false;
  }
  if (input.history && !authority.allowsHistoryEdge(edge)) {
    const pendingOnly = input.previous.every((page, index) => {
      const next = input.next[index]; if (!next) return false;
      const beforeById = new Map(page.elements.map((element) => [element.id, element])), afterById = new Map(next.elements.map((element) => [element.id, element]));
      return [...new Set([...beforeById.keys(), ...afterById.keys()])].every((id) => {
        const before = beforeById.get(id), after = afterById.get(id);
        const value = after ?? before;
        return equal(before ?? null, after ?? null) || Boolean(value && authority.canContinueCreation(kind(value), id));
      });
    });
    if (!pendingOnly) { input.reportError("현재 배정에서 직접 만든 원고 동작만 되돌릴 수 있습니다."); return false; }
  }
  for (const [index, page] of input.previous.entries()) {
    const next = input.next[index]; if (!next) return false;
    const { elements: previousElements, ...previousProps } = page, { elements: nextElements, ...nextProps } = next;
    if (!equal(previousProps, nextProps)) { input.reportError(input.lockMessage()); return false; }
    if (equal(previousElements, nextElements)) continue;
    if (!admitStudioScopedElementCommit({ ...input, pageId: page.id, previous: previousElements, next: nextElements })) return false;
  }
  if (!input.previewOnly) authority.recordHistoryEdge(edge);
  return true;
}

/** 바뀌지 않은 다른 작업자의 원고는 서명에 넣지 않아 독립적인 컷 변경을 지우지 않는다. */
export function studioScopedHistoryEdge(previous: readonly PageState[], next: readonly PageState[], reverse = false): string {
  const changes: unknown[] = [];
  previous.forEach((page, index) => {
    const afterPage = next[index]; if (!afterPage) return;
    const before = new Map(page.elements.map((element) => [element.id, element])), after = new Map(afterPage.elements.map((element) => [element.id, element]));
    for (const id of [...new Set([...before.keys(), ...after.keys()])].sort()) {
      const a = before.get(id) ?? null, b = after.get(id) ?? null;
      if (!equal(a, b)) changes.push([page.id, id, reverse ? b : a, reverse ? a : b]);
    }
  });
  return sha256HexPortable(new TextEncoder().encode(canonicalJson(changes)));
}

/** 파생 잉크·표면의 ID는 실제 원본 stroke를 만든 ticket에만 연결한다. */
export function registerStudioScopedDerivedEntity(owner: object, sourceStrokeId: string, kind: "element" | "surface", id: string): void {
  studioScopedWriteAuthority(owner)?.registerDerivedCreation("stroke", sourceStrokeId, kind, id);
}

/** 실제 pointer가 만든 ID를 첫 픽셀·Y 변경 전에 명시 target에 연결한다. */
export function admitStudioScopedDrawStart(owner: AccessOwner, pageId: string, elements: readonly El[], stroke: DrawEl): DrawEl {
  const mapped = mappedStudioDrawAuthority(owner, pageId, stroke, elements);
  if (!owner.current.locked && !mapped) return stroke;
  const authority = mapped ?? studioScopedWriteAuthority(owner), target = authority?.currentTarget;
  if (!authority || !target) throw new Error("그리기 전에 현재 담당 원고 범위를 선택하세요.");
  const next = { ...stroke };
  if (target.definition.frameId !== null) { next.frameClipId = target.definition.frameId; next.noClip = false; }
  if (target.definition.layerId !== null) {
    if (target.definition.layerId === "page-root") delete next.groupId;
    else next.groupId = target.definition.layerId;
  }
  if (target.definition.frameId !== null && containingPanel(next, elements)?.id !== target.definition.frameId) throw new Error("선택한 담당 컷 안에서 획을 시작하세요.");
  const ticket = authority.captureDrawingTicket(pageId, target.definition.layerId);
  authority.registerCreation(ticket, "stroke", next.id);
  return next;
}
export function assertStudioScopedDrawContinuation(owner: AccessOwner, strokeId: string): void {
  if (!owner.current.locked && !studioMappedStrokeRequiresAuthority(owner, strokeId)) return;
  const authority = studioScopedWriteAuthority(owner);
  if (!authority) throw new Error("현재 원고 편집 권한을 확인할 수 없습니다.");
  authority.assertCreationContinuation("stroke", strokeId);
}
