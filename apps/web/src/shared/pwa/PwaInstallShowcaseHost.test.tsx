// @vitest-environment jsdom
import { Component, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PwaInstallShowcaseProps } from "./PwaInstallShowcase";

const mocks = vi.hoisted(() => ({
  load: vi.fn<() => Promise<void>>(),
  escaped: vi.fn(),
  snapshot: vi.fn(),
  recordVisit: vi.fn(),
  recordOfflineDetected: vi.fn(),
  recordDismissed: vi.fn(),
  recordInstalled: vi.fn(),
}));
vi.mock("@/shared/lib/pwa-install-store", () => ({ getPwaInstallSnapshot: mocks.snapshot }));
vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
vi.mock("./pwa-install-showcase-schedule", () => ({
  PWA_INSTALL_SHOWCASE_OPEN_EVENT: "toonstudio:open-install-showcase",
  createBrowserPwaShowcaseScheduler: () => mocks,
}));

function installShowcaseModule() {
  vi.doMock("./PwaInstallShowcase", async () => {
    await mocks.load();
    return { PwaInstallShowcase: ({ onClose, onInstalled, trigger }: PwaInstallShowcaseProps) => (
      <section role="dialog" aria-label="설치 쇼케이스">
        <p>{trigger}</p>
        <button type="button" onClick={onClose}>본문 닫기</button>
        <button type="button" onClick={onInstalled}>설치 완료</button>
      </section>
    ) };
  });
}

class DocumentBoundary extends Component<{ readonly children: ReactNode }, { readonly failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { mocks.escaped(error); }
  render() { return this.state.failed ? <p>전역 화면 실패</p> : this.props.children; }
}

let online = true;
const openManually = () => fireEvent(window, new Event("toonstudio:open-install-showcase"));
function connection(value: boolean) {
  online = value;
  fireEvent(window, new Event(value ? "online" : "offline"));
}
async function renderEditor(path = "/production/projects/project/production") {
  const { PwaInstallShowcaseHost } = await import("./PwaInstallShowcaseHost");
  const save = vi.fn();
  render(<MemoryRouter initialEntries={[path]}><DocumentBoundary>
    <main><label>원고 초안<input defaultValue="편집 중 원고" /></label>
      <button type="button" onClick={save}>작업 저장</button></main>
    <PwaInstallShowcaseHost />
  </DocumentBoundary></MemoryRouter>);
  const input = screen.getByRole("textbox", { name: "원고 초안" });
  if (!(input instanceof HTMLInputElement)) throw new Error("원고 입력란이 없습니다.");
  return { save, input };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  online = true;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  mocks.load.mockResolvedValue(undefined);
  mocks.snapshot.mockReturnValue({ standalone: false, status: "available" });
  mocks.recordVisit.mockReturnValue({ visits: 1, shouldPrompt: false, trigger: null });
  mocks.recordOfflineDetected.mockReturnValue(true);
  installShowcaseModule();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("비필수 PWA 설치 안내의 로드 경계", () => {
  it("최초 오프라인 안내는 청크를 요청하거나 편집 초안·저장·포커스를 가리지 않는다", async () => {
    mocks.load.mockRejectedValue(new TypeError("Failed to fetch dynamically imported module"));
    const { input, save } = await renderEditor();
    fireEvent.change(input, { target: { value: "아직 전송하지 않은 원고" } });
    input.focus();
    connection(false);
    expect(screen.getByRole("status").textContent).toContain("연결이 돌아오면");
    expect(screen.getByRole("button", { name: "다시 시도" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("textbox", { name: "원고 초안" })).toBe(input);
    expect(input.value).toBe("아직 전송하지 않은 원고");
    expect(document.activeElement).toBe(input);
    fireEvent.click(screen.getByRole("button", { name: "작업 저장" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.escaped).not.toHaveBeenCalled();
  });

  it("온라인 청크 실패는 로컬 오류로 알리고 현재 화면을 유지한 채 다시 시도한다", async () => {
    mocks.load.mockRejectedValue(new TypeError("Failed to fetch dynamically imported module"));
    const { input } = await renderEditor();
    openManually();
    expect((await screen.findByRole("alert")).textContent).toContain("설치 안내를 불러오지 못했어요");
    expect(screen.getByRole("textbox", { name: "원고 초안" })).toBe(input);
    expect(mocks.escaped).not.toHaveBeenCalled();
    mocks.load.mockResolvedValue(undefined);
    installShowcaseModule();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("dialog", { name: "설치 쇼케이스" })).toBeTruthy();
    expect(mocks.load).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "설치 완료" }));
    expect(mocks.recordInstalled).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("온라인 복귀는 안내만 준비하며 사용자가 열기 전에는 편집 화면 위에 모달을 띄우지 않는다", async () => {
    const { input } = await renderEditor();
    input.focus();
    connection(false);
    connection(true);
    const open = await screen.findByRole("button", { name: "설치 안내 보기" });
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(input);
    fireEvent.click(open);
    expect(screen.getByRole("dialog", { name: "설치 쇼케이스" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "본문 닫기" }));
    expect(mocks.recordDismissed).toHaveBeenCalledTimes(1);
  });

  it("오프라인 안내를 닫은 뒤 연결이 돌아와도 안내를 다시 요청하거나 열지 않는다", async () => {
    await renderEditor();
    connection(false);
    fireEvent.click(screen.getByRole("button", { name: "설치 안내 닫기" }));
    connection(true);
    await act(async () => { await Promise.resolve(); });
    expect(mocks.load).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("요청 중 닫힌 안내는 늦게 로드돼도 화면을 다시 열지 않는다", async () => {
    let finish: (() => void) | undefined;
    mocks.load.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    await renderEditor();
    openManually();
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "설치 안내 닫기" }));
    await act(async () => {
      if (!finish) throw new Error("설치 안내 요청이 시작되지 않았습니다.");
      finish();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("이미 로드한 설치 안내는 오프라인에서도 새 요청 없이 사용자가 열 수 있다", async () => {
    await renderEditor();
    openManually();
    await screen.findByRole("dialog", { name: "설치 쇼케이스" });
    fireEvent.click(screen.getByRole("button", { name: "본문 닫기" }));
    connection(false);
    fireEvent.click(screen.getByRole("button", { name: "설치 안내 보기" }));
    expect(screen.getByRole("dialog", { name: "설치 쇼케이스" })).toBeTruthy();
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it("이미 설치된 환경은 수동·오프라인 이벤트에도 열지 않는다", async () => {
    mocks.snapshot.mockReturnValue({ standalone: true, status: "installed" });
    await renderEditor();
    openManually();
    connection(false);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("발표 화면의 설치 안내 차단을 유지한다", async () => {
    await renderEditor("/ir/present");
    openManually();
    connection(false);
    expect(mocks.recordVisit).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
