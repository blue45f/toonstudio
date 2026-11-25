// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioSaveSyncSignalStore } from "../studio-save-sync-signals";
import { DrawingClarityContext } from "./StudioDrawingClarityContext";
import { StudioDrawingClaritySaveButton, type StudioDrawingClaritySaveSession } from "./StudioDrawingClaritySaveButton";

const scoped = vi.hoisted(() => ({ available: false, pendingConfirmation: false }));
const copy = vi.hoisted(() => { const labels: Record<string, string> = {}; return { english: false, labels }; });
vi.mock("../studio-collab/studio-scoped-draft-save", () => ({ useStudioScopedDraftSaveState: () => scoped }));
vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string, en: string) => copy.labels[ko] ?? (copy.english ? en : ko) }));
afterEach(() => { cleanup(); scoped.available = false; scoped.pendingConfirmation = false; copy.english = false; copy.labels = {}; });

function session(): StudioDrawingClaritySaveSession {
  return {
    saving: false, collaborationDocumentLocked: false, sharedDocument: null,
    collaborationLockMessage: () => "편집 권한을 확인해 주세요.",
    studioMenubarContentHandlers: { handleSave: vi.fn<StudioDrawingClaritySaveSession["studioMenubarContentHandlers"]["handleSave"]>().mockResolvedValue(undefined) },
  };
}

describe("간단한 그리기의 기존 초안 저장 연결", () => {
  it("이전 원고의 영수증이 있어도 복구 대기 획을 알리고, 복구한 원고의 영수증이 도착하면 저장을 알린다", () => {
    const store = createStudioSaveSyncSignalStore();
    const receipt = { savedAtMs: 100, authority: "opfs-journal" as const, sequence: 9, revision: 23, generation: 9 };
    store.noteOnline(false);
    store.noteDurableReceipt(receipt);
    const value = { ...session(), saveSyncStore: store, rejectedStrokeCount: 1 };
    const view = render(<StudioDrawingClaritySaveButton session={value} />);
    expect(screen.getByRole("button", { name: "초안 저장", description: /원고에 반영되지 않은 획/ })).toBeTruthy();

    act(() => store.noteEditGeneration(10));
    view.rerender(<StudioDrawingClaritySaveButton session={{ ...value, rejectedStrokeCount: 0 }} />);
    expect(screen.getByRole("button", { description: /최근 변경이 아직 이 기기에 내구 저장되지 않았습니다/ })).toBeTruthy();
    act(() => store.noteDurableReceipt({ ...receipt, savedAtMs: 200, sequence: 10, generation: 10 }));
    expect(screen.getByRole("button", { description: /모든 작업이 로컬에 안전하게 저장되었습니다/ })).toBeTruthy();
  });

  it("복구 대기 안내보다 실제 쓰기 실패와 편집 잠금을 우선한다", () => {
    const store = createStudioSaveSyncSignalStore();
    store.noteDurableReceipt({ savedAtMs: 100, authority: "sqlite-fallback", sequence: 9, revision: 23, generation: 9 });
    const value = { ...session(), saveSyncStore: store, rejectedStrokeCount: 1 };
    const view = render(<StudioDrawingClaritySaveButton session={value} />);
    act(() => store.noteFailure(150));
    expect(screen.getByRole("button", { description: /임시저장에 실패했습니다/ })).toBeTruthy();
    act(() => store.noteLeadership("follower"));
    expect(screen.getByRole("button", { description: /다른 탭에서 편집 중/ })).toBeTruthy();
    view.rerender(<StudioDrawingClaritySaveButton session={{ ...value, collaborationDocumentLocked: true }} />);
    expect(screen.getByRole("button", { description: "편집 권한을 확인해 주세요." }).matches(":disabled")).toBe(true);
  });

  it("보이는 저장 문구를 포함하는 기존 초안 이름으로 원본 저장을 한 번 요청한다", () => {
    const value = session();
    render(<StudioDrawingClaritySaveButton session={value} />);
    const button = screen.getByRole("button", { name: "초안 저장" });
    expect(button.textContent).toBe("저장");
    fireEvent.click(button);
    expect(value.studioMenubarContentHandlers.handleSave).toHaveBeenCalledExactlyOnceWith("draft");
  });

  it("영어의 기본 저장 이름을 중복 접두사 없이 유지한다", () => {
    copy.english = true;
    render(<StudioDrawingClaritySaveButton session={{ ...session(), rejectedStrokeCount: 1 }} />);
    expect(screen.getByRole("button", { name: "Save draft", description: /Check stroke recovery/ }).textContent).toBe("Save");
  });

  it("저장 중에는 현재 문구를 이름에 포함하고 재요청을 막는다", () => {
    const value = { ...session(), saving: true };
    render(<StudioDrawingClaritySaveButton session={value} />);
    const button = screen.getByRole("button", { name: "저장 중… · 초안 저장" });
    expect(button.textContent).toBe("저장 중…");
    expect(button.matches(":disabled")).toBe(true);
    fireEvent.click(button);
    expect(value.studioMenubarContentHandlers.handleSave).not.toHaveBeenCalled();
  });

  it("읽기 전용 사용자는 제한 초안 권한이 없으면 저장할 수 없다", () => {
    const value: StudioDrawingClaritySaveSession = { ...session(), collaborationDocumentLocked: true, sharedDocument: { role: "viewer" } };
    render(<StudioDrawingClaritySaveButton session={value} />);
    const button = screen.getByRole("button", { name: "공동 저장" });
    expect(button.matches(":disabled")).toBe(true);
    expect(button.title).toBe("편집 권한을 확인해 주세요.");
    fireEvent.click(button);
    expect(value.studioMenubarContentHandlers.handleSave).not.toHaveBeenCalled();
  });

  it("제한된 초안 저장이 허용되면 기존 공동 저장 요청만 수행한다", () => {
    scoped.available = true;
    const value: StudioDrawingClaritySaveSession = { ...session(), collaborationDocumentLocked: true, sharedDocument: { role: "editor" } };
    render(<StudioDrawingClaritySaveButton session={value} />);
    const button = screen.getByRole("button", { name: "공동 저장" });
    expect(button.matches(":disabled")).toBe(false);
    fireEvent.click(button);
    expect(value.studioMenubarContentHandlers.handleSave).toHaveBeenCalledExactlyOnceWith("draft");
  });

  it("확인 대기에서는 새 저장 완료를 주장하지 않고 기존 상태 확인 요청으로 연결한다", () => {
    scoped.available = true; scoped.pendingConfirmation = true;
    const value = { ...session(), collaborationDocumentLocked: true };
    render(<StudioDrawingClaritySaveButton session={value} />);
    const button = screen.getByRole("button", { name: "저장 상태 확인" });
    expect(button.textContent).toBe("저장 상태 확인");
    fireEvent.click(button);
    expect(value.studioMenubarContentHandlers.handleSave).toHaveBeenCalledExactlyOnceWith("draft");
  });

  it("별도 번역의 보이는 저장 문구도 음성 조작 이름에 연속으로 포함한다", () => {
    copy.labels = { "저장": "보관하기", "초안 저장": "임시 원고 보관" };
    render(<StudioDrawingClaritySaveButton session={session()} />);
    expect(screen.getByRole("button", { name: "보관하기 · 임시 원고 보관" }).textContent).toBe("보관하기");
  });

  it("간단 화면에서 제목이 비어 있는 상태로 저장을 다시 누르면 닫혀 있던 속성 패널을 재노출한다", () => {
    const reveal = vi.fn();
    const value: StudioDrawingClaritySaveSession = {
      ...session(),
      title: "   ",
      pendingSaveIntent: "draft",
    };
    render(
      <DrawingClarityContext.Provider value={{
        active: true, available: true, panel: null,
        open: vi.fn(), reveal, close: vi.fn(), chooseSimple: vi.fn(), showSavedLayout: vi.fn(),
      }}>
        <StudioDrawingClaritySaveButton session={value} />
      </DrawingClarityContext.Provider>,
    );
    const button = screen.getByRole("button", { name: "초안 저장" });
    fireEvent.click(button);
    expect(reveal).toHaveBeenCalledExactlyOnceWith("layers", button);
    expect(value.studioMenubarContentHandlers.handleSave).toHaveBeenCalledExactlyOnceWith("draft");
  });
});
