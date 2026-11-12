// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useI18n } from "@/shared/lib/i18n";
import { registerEditorStatusSlot } from "@/shared/lib/modal-status-slot";

import { STUDIO_OFFLINE_AUTOMATION_EVENT } from "./studio-offline-automation";
import { StudioOfflinePanel } from "./StudioOfflinePanel";

const runtime = vi.hoisted(() => ({
  inspect: vi.fn(),
  prepare: vi.fn(),
  persist: vi.fn(),
}));
const connection = vi.hoisted(() => ({
  current: {
    browserOnline: true,
    serverReachable: true,
    checking: false,
    mode: "online" as "online" | "reconnecting" | "server-unavailable" | "offline",
    serverAvailable: true,
    localOnly: false,
    lastCheckedAt: 1,
    consecutiveFailures: 0,
  },
}));
vi.mock("./studio-offline-client", () => ({
  inspectStudioOfflineDevice: runtime.inspect,
  prepareLoadedStudioOfflineResources: runtime.prepare,
  requestStudioPersistentStorage: runtime.persist,
}));
vi.mock("./use-studio-connectivity", () => ({
  useStudioConnectivity: () => connection.current,
}));
const device = {
  online: true,
  navigationFallback: false,
  supported: true,
  controlled: true,
  offlineReady: true,
  buildId: "build-1",
  persisted: false,
  usage: 10,
  quota: 100,
};
let releaseEditor: (() => void) | null = null;
let editorFixture: HTMLDivElement | null = null;

function mountEditorStatus(hidden = false) {
  const root = document.createElement("div"), button = document.createElement("button");
  const summary = document.createElement("span"), element = document.createElement("div");
  button.textContent = "저장 상태"; summary.id = "offline-editor-summary";
  button.setAttribute("aria-describedby", summary.id); button.append(summary); element.hidden = hidden;
  root.append(button, element); document.body.append(root); editorFixture = root;
  releaseEditor = registerEditorStatusSlot(element, summary);
  return { button, element, summary };
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
  vi.clearAllMocks();
  vi.useRealTimers();
  connection.current = {
    browserOnline: true,
    serverReachable: true,
    checking: false,
    mode: "online",
    serverAvailable: true,
    localOnly: false,
    lastCheckedAt: 1,
    consecutiveFailures: 0,
  };
  runtime.inspect.mockResolvedValue(device);
  runtime.prepare.mockResolvedValue({
    schema: 1, buildId: "build-1", checked: 5, cached: 5,
    downloadedBytes: 20, missing: [], complete: true,
  });
  runtime.persist.mockResolvedValue(false);
});

afterEach(() => {
  cleanup();
  releaseEditor?.(); releaseEditor = null;
  editorFixture?.remove(); editorFixture = null;
  useI18n.setState({ lang: "ko" });
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "connection");
});
function openPanel() {
  const view = render(<StudioOfflinePanel />);
  const details = view.container.querySelector("details");
  if (details) details.open = true;
  return view;
}

function useServerUnavailable() {
  connection.current = {
    ...connection.current,
    serverReachable: false,
    mode: "server-unavailable",
    serverAvailable: false,
    localOnly: true,
  };
}

describe("automatic Studio offline mode", () => {
  it("does not render offline readiness UI during normal online operation", async () => {
    const view = openPanel();
    await act(async () => { await Promise.resolve(); });
    expect(view.container.querySelector('[data-studio-offline-panel="true"]')).toBeNull();
    expect(screen.queryByText(/오프라인 자동 준비/u)).toBeNull();
  });
  it("keeps the same Studio in local-only mode during a server outage", async () => {
    useServerUnavailable();
    openPanel();
    await screen.findByText("서버 장애 · 로컬 작업 중");
    expect(screen.getByText(/드로잉·레이어 편집·기기 자동 저장/u)).toBeTruthy();
    expect(screen.getByText(/온라인 AI는 연결 복구 전 일시 중지/u)).toBeTruthy();
  });

  it("reflects automatic runtime readiness without starting a second preparation", async () => {
    useServerUnavailable();
    runtime.inspect.mockResolvedValue({ ...device, offlineReady: false });
    openPanel();
    await screen.findByText("서버 장애 · 로컬 작업 중");

    act(() => {
      window.dispatchEvent(new CustomEvent(STUDIO_OFFLINE_AUTOMATION_EVENT, {
        detail: {
          phase: "ready",
          message: "오프라인 앱 준비가 완료됐습니다.",
        },
      }));
    });

    expect(await screen.findByText("오프라인 앱 준비가 완료됐습니다.")).toBeTruthy();
    expect(runtime.prepare).not.toHaveBeenCalled();
  });

  it("distinguishes a cached Studio navigation from browser connectivity", async () => {
    runtime.inspect.mockResolvedValue({ ...device, navigationFallback: true });
    openPanel();
    await screen.findByText("저장된 스튜디오 · 로컬 작업 중");
    expect(screen.getByText(/서버 응답 대신 이 기기에 저장된 스튜디오 화면/u)).toBeTruthy();
  });
  it("keeps manual retry separate from manuscript durability", async () => {
    useServerUnavailable();
    runtime.inspect.mockResolvedValue({ ...device, offlineReady: false });
    openPanel();
    const button = await screen.findByRole("button", { name: "오프라인 준비 다시 시도" });
    fireEvent.click(button);
    expect(await screen.findByText(/편집 도구 5개/u)).toBeTruthy();
    expect(screen.getByText(/도구 준비는 원고 저장과 별개/u)).toBeTruthy();
  });

  it("does not report a partial cache as ready", async () => {
    useServerUnavailable();
    runtime.inspect.mockResolvedValue({ ...device, offlineReady: false });
    runtime.prepare.mockResolvedValue({
      schema: 1, buildId: "build-1", checked: 5, cached: 3,
      downloadedBytes: 20, missing: ["/assets/tool.js"], complete: false,
    });
    openPanel();
    const button = await screen.findByRole("button", { name: "오프라인 준비 다시 시도" });
    fireEvent.click(button);
    expect(await screen.findByText(/일부 도구는 연결이 필요/u)).toBeTruthy();
  });

  it("keeps an unsupported browser actionable with a backup explanation", async () => {
    useServerUnavailable();
    runtime.inspect.mockResolvedValue({
      ...device, supported: false, controlled: false, offlineReady: null,
    });
    openPanel();
    await screen.findByText(/오프라인 도구 준비가 시작될 때까지 연결/u);
    expect((screen.getByRole("button", { name: "오프라인 준비 다시 시도" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("reports persistence denial without implying cloud save", async () => {
    useServerUnavailable();
    openPanel();
    const button = await screen.findByRole("button", { name: "기기 보관 유지 요청" });
    fireEvent.click(button);
    expect(await screen.findByText(/로컬 자동 저장은 계속되지만/u)).toBeTruthy();
  });

  it("warns when local storage is nearly full without showing offline readiness copy", async () => {
    runtime.inspect.mockResolvedValue({ ...device, usage: 95 });
    openPanel();
    expect(await screen.findByText("저장 공간 부족 · 백업 권장")).toBeTruthy();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/오프라인 자동 준비/u)).toBeNull();
  });
});

it("연결 안내를 모바일 작업 메뉴 실측 높이 위에 두고 복구 조작을 보존한다", async () => {
  useServerUnavailable();
  openPanel();
  await screen.findByText("서버 장애 · 로컬 작업 중");
  const notice = screen.getByRole("complementary", { name: "스튜디오 연결 및 오프라인 작업 안내" });
  expect(notice.className).toContain("calc(var(--studio-mobile-dock-measured-height,0px)+0.75rem)");
  expect(screen.getByRole("button", { name: "기기 보관 유지 요청" })).toBeTruthy();
});

describe("기존 저장 상태 안의 오프라인 준비", () => {
  it("상단 상태가 있으면 캔버스 중복 안내 대신 상세에서 준비·백업·재시도를 제공한다", async () => {
    useServerUnavailable();
    const editor = mountEditorStatus();
    render(<StudioOfflinePanel />);
    const region = await screen.findByRole("region", { name: "연결 없이 작업할 준비" });
    expect(editor.element.contains(region)).toBe(true);
    expect(region.querySelector('[role="status"], [role="alert"], [aria-live]')).toBeNull();
    expect(screen.queryByRole("complementary", { name: "스튜디오 연결 및 오프라인 작업 안내" })).toBeNull();
    expect(editor.summary.textContent).toBe("");
    fireEvent.click(await within(region).findByRole("button", { name: "오프라인 준비 다시 확인" }));
    expect(await within(region).findByText(/편집 도구 5개/u)).toBeTruthy();
    expect(runtime.prepare).toHaveBeenCalledTimes(1);
    expect(within(region).getByRole("button", { name: "기기 보관 유지 요청" })).toBeTruthy();
    expect(region.textContent).not.toMatch(/OPFS|SQLite|서비스 워커/u);
  });

  it("상세가 닫혀도 90% 저장 공간 경고는 같은 상단 버튼에 남긴다", async () => {
    runtime.inspect.mockResolvedValue({ ...device, usage: 95 });
    const editor = mountEditorStatus(true);
    render(<StudioOfflinePanel />);
    const warning = await screen.findByRole("alert");
    expect(editor.summary.contains(warning)).toBe(true);
    expect(warning.textContent).toContain("95%");
    expect(warning.textContent).toContain("백업 필요");
    expect(editor.button.getAttribute("aria-describedby")).toBe(editor.summary.id);
    expect(editor.button.querySelector("button")).toBeNull();
    expect(screen.queryByRole("button", { name: "기기 보관 유지 요청" })).toBeNull();
    editor.element.hidden = false;
    expect(screen.getByRole("button", { name: "기기 보관 유지 요청" })).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(editor.element.querySelector('[role="alert"], [role="status"], [aria-live]')).toBeNull();
  });

  it("상세를 열고 닫는 동안 진행 상태와 같은 준비 요청을 유지한다", async () => {
    useServerUnavailable();
    runtime.inspect.mockResolvedValueOnce({ ...device, offlineReady: false }).mockResolvedValue(device);
    const report = { schema: 1, buildId: "build-1", checked: 5, cached: 5, downloadedBytes: 20, missing: [], complete: true };
    let complete: ((value: typeof report) => void) | undefined;
    const preparation = new Promise<typeof report>((resolve) => { complete = resolve; });
    runtime.prepare.mockReturnValue(preparation);
    const editor = mountEditorStatus();
    render(<StudioOfflinePanel />);
    const retry = await screen.findByRole<HTMLButtonElement>("button", { name: "오프라인 준비 다시 시도" });
    await waitFor(() => expect(retry.disabled).toBe(false)); fireEvent.click(retry);
    expect(screen.getByRole("button", { name: "확인 중…" }).getAttribute("aria-busy")).toBe("true");
    editor.element.hidden = true; editor.element.hidden = false;
    expect(runtime.prepare).toHaveBeenCalledTimes(1);
    const finish = complete;
    if (!finish) throw new Error("준비 완료 콜백이 없습니다.");
    await act(async () => { finish(report); await preparation; });
    expect(await screen.findByText(/편집 도구 5개/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "오프라인 준비 다시 확인" })).toBeTruthy();
  });

  it("실제 준비 실패를 상단에 남기고 원문만 접으며 재시도·백업은 유지한다", async () => {
    useServerUnavailable(); runtime.inspect.mockResolvedValue({ ...device, offlineReady: false });
    runtime.prepare.mockRejectedValue(new Error("OPFS quota denied"));
    const editor = mountEditorStatus();
    const view = render(<StudioOfflinePanel />);
    const retry = await screen.findByRole<HTMLButtonElement>("button", { name: "오프라인 준비 다시 시도" });
    await waitFor(() => expect(retry.disabled).toBe(false)); fireEvent.click(retry);
    expect(await screen.findByText("오프라인 도구 준비 실패 · 다시 확인")).toBeTruthy();
    expect(editor.summary.querySelector('[role="alert"]')).toBeTruthy();
    expect(editor.element.querySelector('[role="status"], [role="alert"], [aria-live]')).toBeNull();
    const detail = editor.element.querySelector("details");
    expect(detail?.open).toBe(false); expect(detail?.textContent).toContain("OPFS quota denied");
    expect(screen.getByRole("button", { name: "오프라인 준비 다시 시도" })).toBeTruthy();
    expect(screen.getByText(/도구 준비는 원고 저장과 별개/u)).toBeTruthy();
    const release = releaseEditor;
    if (!release) throw new Error("등록된 상태 자리가 없습니다.");
    act(() => { release(); releaseEditor = null; });
    expect(await screen.findByRole("complementary", { name: "스튜디오 연결 및 오프라인 작업 안내" })).toBeTruthy();
    expect(screen.getByText("오프라인 도구 준비 실패 · 다시 확인")).toBeTruthy();
    expect(view.container.querySelector('p[role="status"][aria-live="polite"][aria-atomic="true"]')).toBeTruthy();
    expect(runtime.prepare).toHaveBeenCalledTimes(1);
  });

  it("영어에서도 저장 위치·오프라인 도구·백업을 쉬운 말로 구분한다", async () => {
    useI18n.setState({ lang: "en" }); useServerUnavailable(); mountEditorStatus();
    render(<StudioOfflinePanel />);
    const region = await screen.findByRole("region", { name: "Prepare to work without a connection" });
    expect(region.textContent).toContain("separate from manuscript saving");
    expect(within(region).getByRole("button", { name: "Request device-storage retention" })).toBeTruthy();
    expect(region.textContent).not.toMatch(/OPFS|SQLite|service worker/iu);
  });
});
