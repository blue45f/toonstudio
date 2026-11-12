// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultStudioAppSettings } from "../studio-app-settings";
import { createStudioWorkspaceDefaultState } from "../studio-workspaces";
import { subscribeStudioAllTools } from "../studio-toolbar-channel";
import { createStudioSaveSyncSignalStore } from "../studio-save-sync-signals";
import { StudioDrawingClarityProvider, type StudioDrawingClaritySession } from "./StudioDrawingClarity";
import { useStudioDrawingClarity } from "./StudioDrawingClarityContext";
import { StudioDrawingClarityMobileBar, type StudioDrawingClarityMobileSession } from "./StudioDrawingClarityMobileBar";

vi.mock("../studio-collab/studio-scoped-draft-save", () => ({ useStudioScopedDraftSaveState: () => ({ available: false, pendingConfirmation: false }) }));
vi.mock("../studio-tool-belt-lazy-ui", () => ({ preloadStudioAssetToolPopoverBody: vi.fn() }));
afterEach(cleanup);

type MobileFixture = StudioDrawingClaritySession & StudioDrawingClarityMobileSession;
function session(): MobileFixture {
  const state = createStudioWorkspaceDefaultState(null);
  return {
    currentWorkspaceOwnerScope: "guest", isMobile: true, mobileImmersive: true, canvasOnlyMode: false,
    workspaceState: state, workMode: "all", uiDensityMode: "simple", appSettings: defaultStudioAppSettings(),
    location: { pathname: "/studio/canvas", search: "?uiMode=basic", hash: "", state: null, key: "mobile" },
    studioDrawingClarityBaseline: { ownerScope: "guest", source: "default", state },
    title: "나의 첫 웹툰", studioMenubarActivePageLabel: "1페이지", studioMainMenuGroups: [],
    saveSyncStore: createStudioSaveSyncSignalStore(),
    saving: false, collaborationDocumentLocked: false, sharedDocument: null, collaborationLockMessage: () => "편집 잠김",
    studioMenubarContentHandlers: { setStudioUiDensity: vi.fn(), handleSave: vi.fn<StudioDrawingClarityMobileSession["studioMenubarContentHandlers"]["handleSave"]>().mockResolvedValue(undefined) },
    studioMobileEditingDockHandlers: { openInspectorRoute: vi.fn() },
    setMobileSheet: vi.fn(), setMenu: vi.fn(), setExportMenuOpen: vi.fn(), setTeamPanelOpen: vi.fn(), setTutorialHubOpen: vi.fn(),
  };
}
function Surface({ value }: { value: MobileFixture }) {
  const clarity = useStudioDrawingClarity();
  if (!clarity) throw new Error("표시 context 누락");
  return <div data-studio-editor="true" data-studio-drawing-clarity-mobile={clarity.active ? "true" : undefined}>
    {clarity.active ? <StudioDrawingClarityMobileBar session={value} /> : <section aria-label="기존 작업 배치"><p>프로젝트·창·협업 도구</p><button onClick={clarity.chooseSimple}>간단한 그리기</button></section>}
  </div>;
}
function show(value = session()) { return render(<StudioDrawingClarityProvider session={value}><Surface value={value} /></StudioDrawingClarityProvider>); }
function more() { const trigger = screen.getByLabelText("더보기 · 도구와 도움말"); fireEvent.click(trigger); return trigger; }

/** 네이티브 모달이 열린 동안 외부 초점을 차단하는 브라우저 계약을 재현한다. */
function nativeModal() {
  const prototype = HTMLDialogElement.prototype;
  const previousShow = Object.getOwnPropertyDescriptor(prototype, "showModal");
  const previousClose = Object.getOwnPropertyDescriptor(prototype, "close");
  const originalFocus = HTMLElement.prototype.focus;
  const close = vi.fn(function (this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event("close")); });
  Object.defineProperty(prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(prototype, "close", { configurable: true, value: close });
  const focus = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
    const modal = document.querySelector("dialog[open]");
    if (!modal || modal.contains(this)) originalFocus.call(this, options);
  });
  return { close, focus, restore() {
    cleanup(); focus.mockRestore();
    if (previousShow) Object.defineProperty(prototype, "showModal", previousShow); else Reflect.deleteProperty(prototype, "showModal");
    if (previousClose) Object.defineProperty(prototype, "close", previousClose); else Reflect.deleteProperty(prototype, "close");
  } };
}

describe("웹 모바일 기본 상단", () => {
  it("원고·뒤로·저장과 실제 상태 슬롯 하나만 두고 하단 도구를 중복 생성하지 않는다", () => {
    const { container } = show();
    expect(screen.getByRole("heading", { name: "나의 첫 웹툰" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "이전 화면으로 돌아가기" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "초안 저장" })).toHaveLength(1);
    expect(container.querySelectorAll("#studio-document-chrome-slot")).toHaveLength(1);
    expect(screen.queryByRole("toolbar", { name: "그리기 도구" })).toBeNull();
    expect(screen.queryByRole("button", { name: "원고 내보내기" })).toBeNull();
    expect(screen.queryByText("이 기기에 저장됨")).toBeNull();
  });
  it("상단 저장이 기존 초안 명령을 한 번 실행한다", () => {
    const value = session(); show(value);
    fireEvent.click(screen.getByRole("button", { name: "초안 저장" }));
    expect(value.studioMenubarContentHandlers.handleSave).toHaveBeenCalledExactlyOnceWith("draft");
  });
  it("메뉴의 페이지·레이어·소재·출력은 기존 모바일 명령을 사용한다", () => {
    const value = session(); show(value);
    more(); fireEvent.click(screen.getByRole("button", { name: "페이지 보기" })); expect(value.setMobileSheet).toHaveBeenLastCalledWith("pages");
    more(); fireEvent.click(screen.getByRole("button", { name: "레이어·속성 보기" })); expect(value.studioMobileEditingDockHandlers.openInspectorRoute).toHaveBeenCalledWith({ primary: "layers" }, "props");
    more(); fireEvent.click(screen.getByRole("button", { name: "소재 찾기" })); expect(value.setMenu).toHaveBeenLastCalledWith("asset");
    more(); fireEvent.click(screen.getByRole("button", { name: "원고 내보내기" })); expect(value.setExportMenuOpen).toHaveBeenCalledWith(true);
  });
  it("전체 도구는 기존 채널에 보이는 메뉴 트리거를 전달한다", () => {
    const { container } = show(), root = container.querySelector<HTMLElement>("[data-studio-editor]");
    if (!root) throw new Error("편집 영역 누락");
    const opened = vi.fn(), stop = subscribeStudioAllTools(root, opened);
    try { const trigger = more(); fireEvent.click(screen.getByRole("button", { name: "전체 도구" })); expect(opened).toHaveBeenCalledExactlyOnceWith(trigger); }
    finally { stop(); }
  });
  it("손가락 안내가 실제로 열리고 설정에 맞는 조작을 보여 준 뒤 초점을 복구한다", () => {
    show(); const trigger = more(); fireEvent.click(screen.getByRole("button", { name: "그리기·손가락 안내" }));
    const dialog = screen.getByRole("dialog", { name: "그리기·손가락 안내" });
    expect(dialog.textContent).toContain("두 손가락으로 캔버스를 이동·확대해요.");
    expect(dialog.textContent).not.toContain("두 손가락을 짧게 탭하면 실행 취소해요.");
    fireEvent.keyDown(dialog, { key: "Escape" }); expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(trigger);
  });
  it("프로젝트·창 도구는 간결화 표시를 종료해 기존 영역을 보여 주며 다시 돌아올 수 있다", () => {
    show(); more(); fireEvent.click(screen.getByRole("button", { name: "프로젝트·창 도구 보기" }));
    expect(screen.getByRole("region", { name: "기존 작업 배치" })).toBeTruthy();
    expect(document.querySelector('[data-studio-drawing-clarity-mobile="true"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "간단한 그리기" })); expect(screen.getByRole("region", { name: "원고와 저장" })).toBeTruthy();
  });
  it("협업을 요청하면 기존 영역을 다시 표시하고 원본 팀 열기를 실행한다", () => {
    const value = session(); show(value); more(); fireEvent.click(screen.getByRole("button", { name: "함께 작업" }));
    expect(screen.getByRole("region", { name: "기존 작업 배치" })).toBeTruthy();
    expect(document.querySelector('[data-studio-drawing-clarity-mobile="true"]')).toBeNull();
    expect(value.setTeamPanelOpen).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("열린 도구 메뉴의 Escape는 메뉴만 닫고 트리거로 돌아간다", () => {
    show(); const trigger = more(); fireEvent.keyDown(screen.getByRole("button", { name: "페이지 보기" }), { key: "Escape" });
    expect(screen.queryByRole("button", { name: "페이지 보기" })).toBeNull(); expect(document.activeElement).toBe(trigger);
  });

  it.each(["Escape", "네이티브 취소", "닫기 버튼"])("안내 닫기(%s)는 네이티브 모달을 먼저 닫아 외부 초점을 한 번 복구한다", (method) => {
    const native = nativeModal();
    try {
      show(); const trigger = more(); fireEvent.click(screen.getByRole("button", { name: "그리기·손가락 안내" }));
      const dialog = screen.getByRole("dialog", { name: "그리기·손가락 안내" }), closed = vi.fn();
      dialog.addEventListener("close", closed); native.focus.mockClear();
      if (method === "Escape") fireEvent.keyDown(dialog, { key: "Escape" });
      else if (method === "네이티브 취소") fireEvent(dialog, new Event("cancel", { cancelable: true }));
      else fireEvent.click(screen.getByRole("button", { name: "그리기 안내 닫기" }));
      expect(native.close).toHaveBeenCalledTimes(1); expect(closed).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(trigger);
      expect(native.focus.mock.contexts.filter((node) => node === trigger)).toHaveLength(1);
    } finally { native.restore(); }
  });

  it("사용법 전환은 모달을 먼저 닫고 다음 안내로 초점을 넘기며 중복 호출하지 않는다", () => {
    const native = nativeModal(), destination = document.createElement("button");
    destination.textContent = "다음 사용법 안내"; document.body.append(destination);
    try {
      const value = session(); vi.mocked(value.setTutorialHubOpen).mockImplementation((open) => { if (open === true) destination.focus(); });
      show(value); const trigger = more(); fireEvent.click(screen.getByRole("button", { name: "그리기·손가락 안내" }));
      native.focus.mockClear(); fireEvent.click(screen.getByRole("button", { name: "사용법 따라 하기" }));
      expect(native.close).toHaveBeenCalledTimes(1); expect(value.setTutorialHubOpen).toHaveBeenCalledExactlyOnceWith(true);
      expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(destination);
      expect(native.focus.mock.contexts.filter((node) => node === trigger)).toHaveLength(0);
    } finally { native.restore(); destination.remove(); }
  });

  it("안내가 열린 채 상위 화면을 떠나면 네이티브 모달을 한 번 정리한다", () => {
    const native = nativeModal();
    try {
      const value = session(), view = show(value); more(); fireEvent.click(screen.getByRole("button", { name: "그리기·손가락 안내" }));
      const dialog = screen.getByRole("dialog", { name: "그리기·손가락 안내" }), closed = vi.fn(); dialog.addEventListener("close", closed);
      view.unmount(); expect(native.close).toHaveBeenCalledTimes(1); expect(closed).toHaveBeenCalledTimes(1);
      expect(value.setTutorialHubOpen).not.toHaveBeenCalled();
    } finally { native.restore(); }
  });

  it("더보기 하나를 하단 도구 슬롯에 두고 상단에 중복 생성하지 않는다", async () => {
    const host = document.createElement("span"); host.id = "studio-drawing-clarity-mobile-more-slot"; document.body.append(host);
    try {
      const view = show(); await waitFor(() => expect(host.querySelector("summary")).not.toBeNull());
      expect(document.querySelectorAll('[data-studio-clarity-more-trigger="true"]')).toHaveLength(1);
      expect(view.container.querySelector('[data-studio-drawing-clarity-mobile-header] summary')).toBeNull();
    } finally { cleanup(); host.remove(); }
  });

  it("원고의 실제 receipt만 마지막 기기 저장 시각으로 표시하고 baseline을 완료로 꾸미지 않는다", () => {
    const store = createStudioSaveSyncSignalStore(), value = { ...session(), saveSyncStore: store }; store.reset("actual-draft");
    store.noteBaseline(3); show(value); expect(screen.getByText("아직 기기 저장 전")).toBeTruthy();
    expect(document.querySelector("time")).toBeNull();
    const savedAtMs = Date.parse("2026-11-12T04:32:00.000Z");
    act(() => store.noteDurableReceipt({ savedAtMs, authority: "sqlite-fallback", sequence: null, revision: 1, generation: 3 }));
    expect(screen.getByText("마지막 기기 저장")).toBeTruthy(); expect(document.querySelector("time")?.dateTime).toBe("2026-11-12T04:32:00.000Z");
    act(() => { store.noteEditGeneration(4); store.noteFailure(savedAtMs + 1000); });
    expect(document.querySelector("time")?.dateTime).toBe("2026-11-12T04:32:00.000Z"); expect(screen.queryByText("이 기기에 저장됨")).toBeNull();
    act(() => store.reset("different-draft")); expect(document.querySelector("time")).toBeNull(); expect(screen.getByText("아직 기기 저장 전")).toBeTruthy();
  });
});
