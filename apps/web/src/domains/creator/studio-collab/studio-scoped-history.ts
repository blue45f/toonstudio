import type { El } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import { studioScopedWriteAuthority } from "./studio-scoped-write-authority";
import { admitStudioScopedPagesCommit } from "./studio-scoped-write-mutation";

type Direction = "undo" | "redo";
export interface StudioScopedHistoryBindings {
  readonly owner: { readonly current: { readonly locked: boolean } };
  readonly getHistory: () => readonly (readonly PageState[])[];
  readonly getIndex: () => number;
  readonly getPending: () => readonly El[];
  readonly flushPending: () => boolean;
  readonly blocked: () => boolean;
  readonly entryKind: (direction: Direction) => string | null;
  readonly publish: (previous: readonly PageState[], next: readonly PageState[]) => boolean;
  readonly onApplied: (direction: Direction, next: readonly PageState[], index: number) => void;
  readonly reportError: (message: string) => void;
}

/** 실제 버튼·단축키가 같은 현재 snapshot과 권위를 읽는다. 이전 grant나 다른 작업자의 edge는 넘지 않는다. */
export function createStudioScopedHistory(bindings: StudioScopedHistoryBindings) {
  const candidate = (direction: Direction) => {
    const history = bindings.getHistory(), index = Math.max(0, Math.min(bindings.getIndex(), history.length - 1)), nextIndex = index + (direction === "undo" ? -1 : 1);
    const previous = history[index], next = history[nextIndex];
    return previous && next && nextIndex >= 0 && nextIndex < history.length ? { previous, next, nextIndex } : null;
  };
  const can = (direction: Direction): boolean => {
    if (!bindings.owner.current.locked || bindings.blocked() || bindings.entryKind(direction) === "sidecar") return false;
    const authority = studioScopedWriteAuthority(bindings.owner);
    if (!authority?.drawingAllowed) return false;
    const pending = bindings.getPending();
    if (pending.length) return direction === "undo" && pending.every((element) => element.type === "draw" && authority.canContinueCreation("stroke", element.id));
    const value = candidate(direction);
    return Boolean(value && admitStudioScopedPagesCommit({ owner: bindings.owner, reportError: () => {}, lockMessage: () => "담당 원고 이력을 확인하세요.",
      previous: value.previous, next: value.next, previewOnly: true, history: direction }));
  };
  const execute = (direction: Direction): boolean => {
    if (!can(direction)) { bindings.reportError("현재 배정에서 직접 만든 원고 동작만 되돌릴 수 있습니다. 입력 내용은 유지됩니다."); return false; }
    if (bindings.getPending().length && !bindings.flushPending()) { bindings.reportError("대기 획을 보존했습니다. 저장·동기화 경계가 끝난 뒤 되돌리기를 다시 시도하세요."); return false; }
    if (bindings.blocked() || bindings.entryKind(direction) === "sidecar") return false;
    const value = candidate(direction);
    if (!value || !admitStudioScopedPagesCommit({ owner: bindings.owner, reportError: bindings.reportError, lockMessage: () => "현재 담당 원고만 되돌릴 수 있습니다.",
      previous: value.previous, next: value.next, history: direction }) || !bindings.publish(value.previous, value.next)) return false;
    bindings.onApplied(direction, value.next, value.nextIndex); return true;
  };
  return { canUndo: () => can("undo"), canRedo: () => can("redo"), undo: () => execute("undo"), redo: () => execute("redo") };
}

export function routeStudioCompanionHistory(input: { readonly action: Direction; readonly blocked: boolean; readonly canUndo: boolean; readonly canRedo: boolean; readonly undo: () => void; readonly redo: () => void }): void {
  if (input.blocked) return;
  if (input.action === "undo") { if (input.canUndo) input.undo(); } else if (input.canRedo) input.redo();
}
