import { describe, expect, it, vi } from "vitest";
import { isStudioEditorMutationContinuationAllowed, type StudioEditorMutationTicket } from "../studio-editor-scope";
import type { FrameEl } from "../studio-element-model";
import { resolveStudioFileImageAppend } from "./studio-file-image-append";
import type { PageState } from "../studio-page-state";

const first: FrameEl = { id: "frame", type: "frame", x: 10, y: 15, width: 100, height: 90 };
const remote: FrameEl = { ...first, id: "second" };
const page: PageState = { id: "page-a", elements: [first], canvasH: 420, bg: "#fff", bgGrad: null };
const start: StudioEditorMutationTicket = { workId: "work", authScopeKey: "editor", accessGeneration: 2, documentGeneration: 4 };

function fixture(changes: Partial<StudioEditorMutationTicket> = {}) {
  const currentTicket = { ...start, documentGeneration: 5, ...changes };
  const currentPage = { ...page, elements: [{ ...first, bg: "#fed" }, remote] };
  const canApply = vi.fn((ticket: StudioEditorMutationTicket) =>
    isStudioEditorMutationContinuationAllowed(ticket, { ...currentTicket, mounted: true, aborted: false, locked: false }));
  return {
    ticket: start, currentTicket, canApply, originalPage: page, currentPage, currentMasterElements: [],
    originalFrame: first, originalMasterMode: false, currentMasterMode: false, reviewLocked: false,
  };
}

describe("파일 이미지 디코드 후 협업 페이지에 레이어 추가", () => {
  it("동기화 중 먼저 들어온 레이어·수정 내용을 유지하고 새로운 이미지 하나를 추가할 수 있다", () => {
    const state = fixture();
    const base = resolveStudioFileImageAppend(state);
    expect(base).toBe(state.currentPage.elements);
    expect(base).toEqual([{ ...first, bg: "#fed" }, remote]);
    expect(state.canApply).toHaveBeenCalledWith(state.currentTicket);
  });

  it("다른 작가가 삭제한 레이어를 원상복구하지 않고 현재 페이지에만 추가한다", () => {
    const state = fixture();
    const remaining = [remote];
    expect(resolveStudioFileImageAppend({
      ...state, originalFrame: null, currentPage: { ...page, elements: remaining },
    })).toBe(remaining);
  });

  it.each([{ authScopeKey: "other" }, { workId: "other" }, { accessGeneration: 4 }])(
    "파일 선택 뒤 변경된 원고 또는 권한 %j 에는 적용하지 않는다", (change) => {
      expect(resolveStudioFileImageAppend(fixture(change))).toBeNull();
    },
  );

  it("페이지 삭제·이동, 마스터 전환, 검토 잠금, 새 저장과 충돌하면 적용하지 않는다", () => {
    const state = fixture();
    for (const patch of [
      { currentPage: undefined }, { currentPage: { ...page, id: "other" } },
      { currentMasterMode: true }, { reviewLocked: true }, { canApply: () => false },
    ]) expect(resolveStudioFileImageAppend({ ...state, ...patch })).toBeNull();
  });

  it("기준 프레임 이동이나 삭제, 재배치할 캔버스 높이 변경은 이전 배치 좌표를 무효화한다", () => {
    const state = fixture();
    for (const currentPage of [
      { ...page, elements: [{ ...first, x: first.x + 20 }] },
      { ...page, elements: [remote] }, { ...page, canvasH: 840 },
    ]) expect(resolveStudioFileImageAppend({ ...state, currentPage })).toBeNull();
  });

  it("기기 초안과 마스터 레이어에는 기존의 문서 세대 검사를 유지한다", () => {
    const state = fixture({ workId: null });
    expect(resolveStudioFileImageAppend({ ...state, ticket: { ...start, workId: null } })).toBeNull();
    expect(resolveStudioFileImageAppend({ ...fixture(), originalMasterMode: true, currentMasterMode: true })).toBeNull();
    const master = fixture({ documentGeneration: start.documentGeneration });
    expect(resolveStudioFileImageAppend({ ...master, originalMasterMode: true, currentMasterMode: true, currentMasterElements: [remote] })).toEqual([remote]);
  });
});
