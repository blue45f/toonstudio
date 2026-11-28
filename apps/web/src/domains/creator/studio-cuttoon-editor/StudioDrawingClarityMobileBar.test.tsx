// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultStudioAppSettings } from "../studio-app-settings";
import { createStudioWorkspaceDefaultState } from "../studio-workspaces";
import { registerStudioCommandSearchHost, subscribeStudioCommandSearchRequests } from "../studio-help-center-channel";
import { subscribeStudioAllTools } from "../studio-toolbar-channel";
import { createStudioSaveSyncSignalStore } from "../studio-save-sync-signals";
import { MobileFullEditNotice } from "../studio-shell/MobileFullEditNotice";
import { resolveStudioMobileTouchPlan } from "../studio-mobile-touch-flow";
import { useStudioMenubarStatusSlot } from "../studio-shell/studio-menubar-status-slot";
import { StudioSupergapRuntimeHubLazyHost } from "../runtime-leaves/studio-supergap-runtime-hub-lazy";
import { closeStudioSupergapRuntimeHub } from "../runtime-leaves/studio-supergap-runtime-hub-lazy-bridge";
import { StudioDrawingClarityProvider, type StudioDrawingClaritySession } from "./StudioDrawingClarity";
import { useStudioDrawingClarity } from "./StudioDrawingClarityContext";
import { StudioDrawingClarityReceipt } from "./StudioDrawingClarityReceipt";
import { StudioDrawingClarityMobileBar, type StudioDrawingClarityMobileSession } from "./StudioDrawingClarityMobileBar";

vi.mock("../studio-collab/studio-scoped-draft-save", () => ({ useStudioScopedDraftSaveState: () => ({ available: false, pendingConfirmation: false }) }));
vi.mock("../studio-tool-belt-lazy-ui", () => ({ preloadStudioAssetToolPopoverBody: vi.fn() }));
vi.mock("../studio-supergap-runtime-hub", () => new Promise(() => {}));
afterEach(() => { cleanup(); closeStudioSupergapRuntimeHub(); vi.unstubAllGlobals(); });

type MobileFixture = StudioDrawingClaritySession & StudioDrawingClarityMobileSession;
function session(): MobileFixture {
  const state = createStudioWorkspaceDefaultState(null);
  return {
    currentWorkspaceOwnerScope: "guest", isMobile: true, mobileImmersive: true, canvasOnlyMode: false,
    workspaceState: state, workMode: "all", uiDensityMode: "simple", appSettings: defaultStudioAppSettings(),
    location: { pathname: "/studio/canvas", search: "?uiMode=basic", hash: "", state: null, key: "mobile" },
    studioDrawingClarityBaseline: { ownerScope: "guest", source: "default", state },
    title: "나의 첫 웹툰", activePageIndex: 0, studioMenubarActivePageLabel: "1페이지", studioMainMenuGroups: [],
    saveSyncStore: createStudioSaveSyncSignalStore(),
    saving: false, collaborationDocumentLocked: false, sharedDocument: null, collaborationLockMessage: () => "편집 잠김",
    studioMenubarContentHandlers: { setStudioUiDensity: vi.fn(), changeMobileImmersiveMode: vi.fn(), handleSave: vi.fn<StudioDrawingClarityMobileSession["studioMenubarContentHandlers"]["handleSave"]>().mockResolvedValue(undefined) },
    workspaceControlSide: "right", mobileQuickActionsButton: <button type="button" aria-haspopup="menu" aria-expanded={false}>퀵 메뉴 · 오른쪽 엄지 위치</button>,
    studioMobileEditingDockHandlers: { openInspectorRoute: vi.fn() },
    setMobileSheet: vi.fn(), setMenu: vi.fn(), setExportMenuOpen: vi.fn(), setTeamPanelOpen: vi.fn(), mobileSheet: null, setHistoryPanelOpen: vi.fn(), setTutorialHubOpen: vi.fn(),
  };
}
function Surface({ value }: { value: MobileFixture }) {
  const clarity = useStudioDrawingClarity();
  if (!clarity) throw new Error("표시 context 누락");
  return <div data-studio-editor="true" data-studio-drawing-clarity-mobile={clarity.active ? "true" : undefined}>
    {clarity.active && <StudioDrawingClarityMobileBar session={value} />}
    <div id="studio-canvas-workspace" tabIndex={-1} />
    {clarity.panel === "commands" && <section id="studio-drawing-clarity-panel-commands" aria-label="프로젝트·창 도구">
      <h2 tabIndex={-1} data-clarity-pane-heading>프로젝트·창 도구</h2><button onClick={clarity.chooseSimple}>원고로 돌아가기</button>
    </section>}
  </div>;
}
function show(value = session()) { return render(<StudioDrawingClarityProvider session={value}><Surface value={value} /></StudioDrawingClarityProvider>); }
function more(task: "document" | "drawing" | "output" | "workspace" = "document") {
  const trigger = screen.getByLabelText("더보기 · 도구와 도움말"); fireEvent.click(trigger);
  const labels = { document: "원고와 레이어", drawing: "그리기 도구", output: "내보내기와 협업", workspace: "화면과 도움말" };
  const purposes = screen.getByRole("navigation", { name: "원고 도구 목적 고르기" });
  fireEvent.click(within(purposes).getByRole("button", { name: new RegExp(labels[task]) }));
  return trigger;
}

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
  it("더보기의 엔진 상태는 도구 모달을 닫아 열린 뒤 같은 더보기 버튼으로 복귀한다", () => {
    const modal = nativeModal();
    try {
      const value = session();
      render(<StudioSupergapRuntimeHubLazyHost />);
      show(value);
      expect(screen.queryByRole("group", { name: "편집기 엔진 상태" })).toBeNull();
      const launcher = more("workspace");
      fireEvent.click(screen.getByRole("button", { name: "엔진 상태" }));
      expect(document.querySelector("dialog[open]")).toBeNull();
      expect(value.setMobileSheet).toHaveBeenCalledWith(null);
      const panel = screen.getByRole("group", { name: "편집기 엔진 상태" });
      expect(document.activeElement).toBe(panel);
      expect(screen.getByText("엔진 상태를 불러오는 중…")).toBeTruthy();
      fireEvent.keyDown(panel, { key: "Escape" });
      expect(screen.queryByRole("group", { name: "편집기 엔진 상태" })).toBeNull();
      expect(document.activeElement).toBe(launcher);
    } finally {
      modal.restore();
    }
  });

  it("동일한 원고·페이지 이름은 반복하지 않고 다른 페이지 문맥은 유지한다", () => {
    const value = { ...session(), title: "EP01 원고", studioMenubarActivePageLabel: " EP01 원고 " };
    const view = show(value);
    expect(screen.getAllByText("EP01 원고")).toHaveLength(1);
    expect(screen.getByRole("toolbar", { name: "편집 기록" })).toBeTruthy();
    view.unmount(); show({ ...value, studioMenubarActivePageLabel: "2페이지 · 첫 만남" });
    expect(screen.getByText("2페이지 · 첫 만남")).toBeTruthy();
    expect(screen.getByRole("toolbar", { name: "편집 기록" })).toBeTruthy();
  });
  it("상단 제목 안에 실제 저장 요약 자리를 하나 두고 이전 save host를 중복 등록하지 않는다", () => {
    function SlotProbe() { const host = useStudioMenubarStatusSlot("save"); return <output data-testid="저장 상세 자리">{host ? "중복" : "없음"}</output>; }
    const probe = render(<SlotProbe />), view = show();
    expect(screen.getByTestId("저장 상세 자리").textContent).toBe("없음");
    expect(view.container.querySelector('.studio-drawing-clarity-title #studio-document-chrome-slot')).toBeTruthy();
    expect(view.container.querySelector('[data-studio-clarity-mobile-save-slot]')).toBeNull();
    view.unmount(); expect(screen.getByTestId("저장 상세 자리").textContent).toBe("없음"); probe.unmount();
  });
  it.each(["Escape", "닫기", "접기"])("더보기의 기기 작업 안내는 같은 표면의 원래 내용을 열고 %s 뒤 같은 트리거로 돌아간다", (method) => {
    vi.stubGlobal("matchMedia", vi.fn((media: string) => ({ matches: true, media, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const plan = resolveStudioMobileTouchPlan("canvas");
    render(<MobileFullEditNotice startCollapsed surfaceId="studio-editor-canvas" surfaceLabel={plan.label} mobileCapabilities={plan.canDo} mobileLimitations={plan.cannotDo} touchTier={plan.tier} />);
    show(); const trigger = more("workspace"); fireEvent.click(screen.getByRole("button", { name: "이 기기에서 할 수 있는 작업" }));
    expect(screen.queryByRole("button", { name: "페이지 보기" })).toBeNull();
    const guide = screen.getByRole("complementary", { name: "모바일 편집 안내" });
    for (const item of [...plan.canDo, ...plan.cannotDo]) expect(screen.getByText(item.ko).closest("[hidden]")).toBeNull();
    const toggle = screen.getByRole("button", { name: "기기 안내 접기" }); expect(document.activeElement).toBe(toggle);
    if (method === "Escape") fireEvent.keyDown(toggle, { key: "Escape" });
    else if (method === "접기") fireEvent.click(toggle);
    else fireEvent.click(screen.getByRole("button", { name: "안내 접고 계속하기" }));
    expect(guide.getAttribute("data-studio-mobile-notice-expanded")).toBe("false"); expect(document.activeElement).toBe(trigger);
  });
  it.each([
    { pathname: "/studio/comic", search: "?uiMode=basic" },
    { pathname: "/studio/p/p1/d/d1", search: "?workspace=storyboard&uiMode=basic" },
    { pathname: "/studio/p/p1/d/d1", search: "?workspace=localization&uiMode=basic" },
  ])("comic으로 해석되는 $pathname$search도 실제 표면의 안내를 열고 더보기로 복귀한다", (location) => {
    vi.stubGlobal("matchMedia", vi.fn((media: string) => ({ matches: true, media, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const plan = resolveStudioMobileTouchPlan("comic");
    render(<MobileFullEditNotice startCollapsed surfaceId="studio-editor-comic" surfaceLabel={plan.label} mobileCapabilities={plan.canDo} mobileLimitations={plan.cannotDo} touchTier={plan.tier} />);
    const value = session(); show({ ...value, location: { ...value.location, ...location } });
    const simple = screen.queryByRole("button", { name: "간단한 그리기" }); if (simple) fireEvent.click(simple);
    expect(document.querySelector('[data-studio-device-guide-entry="comic"]')).toBeTruthy();
    const trigger = more("workspace"); fireEvent.click(screen.getByRole("button", { name: "이 기기에서 할 수 있는 작업" }));
    for (const item of [...plan.canDo, ...plan.cannotDo]) expect(screen.getByText(item.ko).closest("[hidden]")).toBeNull();
    fireEvent.keyDown(screen.getByRole("button", { name: "기기 안내 접기" }), { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
  });
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
  it("상단 저장이 기존 초안 명령을 한 번 실행하고 출고 버튼과 기본 접힘 편집 행을 제공한다", () => {
    const value = session(); show(value);
    fireEvent.click(screen.getByRole("button", { name: "초안 저장" }));
    expect(value.studioMenubarContentHandlers.handleSave).toHaveBeenCalledExactlyOnceWith("draft");
    expect(document.getElementById("studio-mobile-edit-options")?.getAttribute("data-compact-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "출고" }));
    expect(value.setExportMenuOpen).toHaveBeenCalledWith(true);
  });
  it("편집 옵션에서 기존 전체 화면 모드를 양방향 전환하고 현재 상태를 알린다", () => {
    const value = session(), changed = vi.fn();
    function StatefulMode() {
      const [mobileImmersive, setMobileImmersive] = useState(true);
      const live = { ...value, mobileImmersive, studioMenubarContentHandlers: {
        ...value.studioMenubarContentHandlers,
        changeMobileImmersiveMode: (enabled: boolean) => { changed(enabled); setMobileImmersive(enabled); },
      } };
      return <StudioDrawingClarityProvider session={live}><Surface value={live} /></StudioDrawingClarityProvider>;
    }
    render(<StatefulMode />);
    fireEvent.click(screen.getByRole("button", { name: /^편집$/u }));
    const exit = screen.getByRole("button", { name: "전체 화면 드로잉 종료" });
    expect(exit.closest("#studio-mobile-edit-options")?.getAttribute("data-compact-expanded")).toBe("true");
    expect(exit.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(exit);
    expect(changed).toHaveBeenNthCalledWith(1, false);
    const enter = screen.getByRole("button", { name: /^전체 화면 드로잉$/u });
    expect(enter.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(enter);
    expect(changed).toHaveBeenNthCalledWith(2, true);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "전체 화면 드로잉 종료" }).getAttribute("aria-pressed")).toBe("true");
  });
  it.each(["left", "right"] as const)("편집 옵션의 %s 엄지 위치에 기존 퀵 메뉴 하나를 배치해 터치 진입과 순서를 보존한다", (side) => {
    const open = vi.fn();
    const label = side === "left" ? "퀵 메뉴 · 왼쪽 엄지 위치" : "퀵 메뉴 · 오른쪽 엄지 위치";
    show({ ...session(), workspaceControlSide: side, mobileQuickActionsButton: <button type="button" aria-haspopup="menu" aria-expanded={false} onClick={open}>{label}</button> });
    fireEvent.click(screen.getByRole("button", { name: /^편집$/u }));
    const quick = screen.getByRole("button", { name: label });
    expect(quick.closest('[data-studio-clarity-mobile-quick-actions="true"]')).toBeTruthy();
    expect(screen.getAllByRole("button", { name: label })).toHaveLength(1);
    expect(quick.closest("#studio-mobile-edit-options")?.getAttribute("data-compact-expanded")).toBe("true");
    const buttons = [...document.querySelectorAll("#studio-mobile-edit-options button")];
    expect(side === "left" ? buttons[0] : buttons.at(-1)).toBe(quick);
    expect(quick.getAttribute("aria-haspopup")).toBe("menu");
    expect(quick.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(quick);
    expect(open).toHaveBeenCalledOnce();
  });
  it("메뉴의 페이지·레이어·소재·출력은 기존 모바일 명령을 사용한다", () => {
    const value = session(); show(value);
    more(); fireEvent.click(screen.getByRole("button", { name: "페이지 보기" })); expect(value.setMobileSheet).toHaveBeenLastCalledWith("pages");
    more(); fireEvent.click(screen.getByRole("button", { name: "레이어·속성 보기" })); expect(value.studioMobileEditingDockHandlers.openInspectorRoute).toHaveBeenCalledWith({ primary: "layers" }, "props");
    more(); fireEvent.click(screen.getByRole("button", { name: "소재 찾기" })); expect(value.setMenu).toHaveBeenLastCalledWith("asset");
    more(); fireEvent.click(screen.getByRole("button", { name: "수정이력" })); expect(value.setHistoryPanelOpen).toHaveBeenCalledWith(true);
    more("drawing"); fireEvent.click(screen.getByRole("button", { name: "말풍선·대사" })); expect(value.setMenu).toHaveBeenCalledWith("bubble");
    more("output"); fireEvent.click(screen.getByRole("button", { name: "원고 내보내기" })); expect(value.setExportMenuOpen).toHaveBeenCalledWith(true);
  });
  it("첫 검색 탭을 실제 검색창이 준비될 때 한 번 전달하고 열린 인스펙터를 닫지 않는다", () => {
    const value = session(), received = vi.fn();
    const unsubscribe = subscribeStudioCommandSearchRequests(received);
    function StatefulSheet() {
      const [mobileSheet, setMobileSheet] = useState<MobileFixture["mobileSheet"]>(null);
      const live = { ...value, mobileSheet, setMobileSheet };
      return <StudioDrawingClarityProvider session={live}><Surface value={live} /></StudioDrawingClarityProvider>;
    }
    render(<StatefulSheet />);
    const search = () => fireEvent.click(screen.getByRole("button", { name: /^검색$/u }));
    let unregister = () => {};
    try {
      search();
      expect(received).not.toHaveBeenCalled();
      act(() => { unregister = registerStudioCommandSearchHost(); });
      expect(received).toHaveBeenCalledExactlyOnceWith({ scope: "all" });
      search();
      expect(received).toHaveBeenCalledTimes(2);
    } finally { act(unregister); unsubscribe(); }
  });

  it("인물·포즈의 정본 명령이 있을 때에만 그리기 도구에서 3D 캐릭터를 연다", () => {
    const value = session(), onSelect = vi.fn();
    show({ ...value, studioMainMenuGroups: [{ id: "3d", label: "3D", items: [
      { id: "char", commandId: "insert.character-3d", label: "인물·포즈 편집", onSelect },
    ] }] });
    more("drawing");
    fireEvent.click(screen.getByRole("button", { name: "3D 캐릭터·포즈" }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(value.setMobileSheet).toHaveBeenCalledWith(null);
  });
  it("전체 도구는 기존 채널에 보이는 메뉴 트리거를 전달한다", () => {
    const { container } = show(), root = container.querySelector<HTMLElement>("[data-studio-editor]");
    if (!root) throw new Error("편집 영역 누락");
    const opened = vi.fn(), stop = subscribeStudioAllTools(root, opened);
    try { const trigger = more("drawing"); fireEvent.click(screen.getByRole("button", { name: "전체 도구" })); expect(opened).toHaveBeenCalledExactlyOnceWith(trigger); }
    finally { stop(); }
  });
  it("손가락 안내가 실제로 열리고 설정에 맞는 조작을 보여 준 뒤 초점을 복구한다", () => {
    show(); const trigger = more("workspace"); fireEvent.click(screen.getByRole("button", { name: "그리기·손가락 안내" }));
    const dialog = screen.getByRole("dialog", { name: "그리기·손가락 안내" });
    expect(dialog.textContent).toContain("두 손가락으로 캔버스를 이동·확대해요.");
    expect(dialog.textContent).not.toContain("두 손가락을 짧게 탭하면 실행 취소해요.");
    fireEvent.keyDown(dialog, { key: "Escape" }); expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(trigger);
  });
  it("모바일 원고를 유지한 채 프로젝트·창 도구를 열고 원고에 초점을 돌린다", () => {
    show(); more("workspace"); fireEvent.click(screen.getByRole("button", { name: "프로젝트·창 도구" }));
    const panel = screen.getByRole("region", { name: "프로젝트·창 도구" });
    expect(screen.getByRole("region", { name: "원고와 저장" })).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "원고로 돌아가기" }));
    expect(screen.queryByRole("region", { name: "프로젝트·창 도구" })).toBeNull();
    expect(document.activeElement).toBe(document.getElementById("studio-canvas-workspace"));
  });
  it("함께 작업을 열어도 사용자가 고른 드로잉 배치를 유지한다", () => {
    const value = session(); show(value); more("output"); fireEvent.click(screen.getByRole("button", { name: "함께 작업" }));
    expect(screen.getByRole("region", { name: "원고와 저장" })).toBeTruthy();
    expect(document.querySelector('[data-studio-drawing-clarity-mobile="true"]')).toBeTruthy();
    expect(value.setTeamPanelOpen).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("열린 도구 메뉴의 Escape는 메뉴만 닫고 트리거로 돌아간다", () => {
    show(); const trigger = more(); fireEvent.keyDown(screen.getByRole("button", { name: "페이지 보기" }), { key: "Escape" });
    expect(screen.queryByRole("button", { name: "페이지 보기" })).toBeNull(); expect(document.activeElement).toBe(trigger);
  });

  it.each(["Escape", "네이티브 취소", "닫기 버튼"])("안내 닫기(%s)는 네이티브 모달을 먼저 닫아 외부 초점을 한 번 복구한다", (method) => {
    const native = nativeModal();
    try {
      show(); const trigger = more("workspace"); fireEvent.click(screen.getByRole("button", { name: "그리기·손가락 안내" }));
      const dialog = screen.getByRole("dialog", { name: "그리기·손가락 안내" }), closed = vi.fn();
      dialog.addEventListener("close", closed); native.focus.mockClear();
      if (method === "Escape") fireEvent.keyDown(dialog, { key: "Escape" });
      else if (method === "네이티브 취소") fireEvent(dialog, new Event("cancel", { cancelable: true }));
      else fireEvent.click(screen.getByRole("button", { name: "그리기 안내 닫기" }));
      expect(native.close.mock.contexts.filter(node => node === dialog)).toHaveLength(1); expect(closed).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(trigger);
      expect(native.focus.mock.contexts.filter((node) => node === trigger)).toHaveLength(1);
    } finally { native.restore(); }
  });

  it("사용법 전환은 모달을 먼저 닫고 다음 안내로 초점을 넘기며 중복 호출하지 않는다", () => {
    const native = nativeModal(), destination = document.createElement("button");
    destination.textContent = "다음 사용법 안내"; document.body.append(destination);
    try {
      const value = session(); vi.mocked(value.setTutorialHubOpen).mockImplementation((open) => { if (open === true) destination.focus(); });
      show(value); const trigger = more("workspace"); fireEvent.click(screen.getByRole("button", { name: "그리기·손가락 안내" }));
      const dialog = screen.getByRole("dialog", { name: "그리기·손가락 안내" }); native.focus.mockClear(); fireEvent.click(screen.getByRole("button", { name: "사용법 따라 하기" }));
      expect(native.close.mock.contexts.filter(node => node === dialog)).toHaveLength(1); expect(value.setTutorialHubOpen).toHaveBeenCalledExactlyOnceWith(true);
      expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(destination);
      expect(native.focus.mock.contexts.filter((node) => node === trigger)).toHaveLength(0);
    } finally { native.restore(); destination.remove(); }
  });

  it("안내가 열린 채 상위 화면을 떠나면 네이티브 모달을 한 번 정리한다", () => {
    const native = nativeModal();
    try {
      const value = session(), view = show(value); more("workspace"); fireEvent.click(screen.getByRole("button", { name: "그리기·손가락 안내" }));
      const dialog = screen.getByRole("dialog", { name: "그리기·손가락 안내" }), closed = vi.fn(); dialog.addEventListener("close", closed);
      view.unmount(); expect(native.close.mock.contexts.filter(node => node === dialog)).toHaveLength(1); expect(closed).toHaveBeenCalledTimes(1);
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
    store.noteBaseline(3); render(<StudioDrawingClarityReceipt store={value.saveSyncStore} />); expect(screen.getByText("아직 기기 저장 전")).toBeTruthy();
    expect(document.querySelector("time")).toBeNull();
    const savedAtMs = Date.parse("2026-11-12T04:32:00.000Z");
    act(() => store.noteDurableReceipt({ savedAtMs, authority: "sqlite-fallback", sequence: null, revision: 1, generation: 3 }));
    expect(screen.getByText("마지막 기기 저장")).toBeTruthy(); expect(document.querySelector("time")?.dateTime).toBe("2026-11-12T04:32:00.000Z");
    act(() => { store.noteEditGeneration(4); store.noteFailure(savedAtMs + 1000); });
    expect(document.querySelector("time")?.dateTime).toBe("2026-11-12T04:32:00.000Z"); expect(screen.queryByText("이 기기에 저장됨")).toBeNull();
    act(() => store.reset("different-draft")); expect(document.querySelector("time")).toBeNull(); expect(screen.getByText("아직 기기 저장 전")).toBeTruthy();
  });

  it("태블릿(>=560px) 상단바는 제목·저장 상태를 한 줄로 정렬하고 빈 알림으로 인한 조기 말줄임과 세로 클리핑을 막는다", () => {
    const { container } = show();
    const titleBox = container.querySelector(".studio-drawing-clarity-title");
    expect(titleBox?.className).toContain("flex-1");
    expect(titleBox?.className).toContain("min-w-0");
    expect(titleBox?.className).toContain("leading-tight");

    const baseDir = path.resolve(process.cwd(), "apps/web/src/domains/creator/studio-cuttoon-editor");
    const mobileCss = readFileSync(path.join(baseDir, "StudioDrawingMobileWorkspace.css"), "utf8");
    const clarityCss = readFileSync(path.join(baseDir, "StudioDrawingClarity.css"), "utf8");

    expect(mobileCss).toContain("@media (min-width: 560px)");
    expect(mobileCss).toContain("flex-direction: row;");
    expect(mobileCss).toContain("align-items: center;");
    expect(mobileCss).toContain("gap: 0.5rem;");
    expect(mobileCss).toMatch(/\.studio-drawing-clarity-mobile-header\s*\{\s*height: 44px;\s*min-height: 44px;\s*max-height: 44px;/u);
    expect(mobileCss).toContain("[data-studio-connection-notice-summary]:empty");
    expect(mobileCss).not.toContain("-webkit-line-clamp: 1");

    expect(clarityCss).toContain("[data-studio-connection-notice-summary]:empty{display:none}");
    expect(clarityCss).not.toContain("-webkit-line-clamp:1");
  });
});
