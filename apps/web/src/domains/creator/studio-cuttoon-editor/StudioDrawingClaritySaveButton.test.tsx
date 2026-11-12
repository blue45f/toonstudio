// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    render(<StudioDrawingClaritySaveButton session={session()} />);
    expect(screen.getByRole("button", { name: "Save draft" }).textContent).toBe("Save");
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
});
