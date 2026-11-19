// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defaultStudioAppSettings, type StudioAppSettings } from "../../studio-app-settings";
import { pinStudioToolbarTools, studioDrawingPinnedToolbar } from "../../studio-toolbar-configuration";
import { useStudioPreferencesRuntime } from "./useStudioPreferencesRuntime";

const repository = vi.hoisted(() => ({
  loadAppSettings: vi.fn<() => Promise<StudioAppSettings>>(),
  loadEffectFavorites: vi.fn(async () => undefined),
  saveAppSettings: vi.fn<(_settings: StudioAppSettings) => Promise<void>>(),
}));
vi.mock("../../studio-legacy-editor-runtime-helpers", () => ({ acquireProductStudioUiPreferencesRepository: async () => repository }));
const options = { launchSearch: "", closeRightPanelForFocusMode: vi.fn(), applyMirroredSettings: vi.fn() };
beforeEach(() => { repository.saveAppSettings.mockResolvedValue(); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("수화 전 누른 손 도구는 기존 고정 순서와 다른 설정을 보존하며 SQLite 확인 뒤에 표시한다", async () => {
  const stored = defaultStudioAppSettings();
  stored.general.brushPanelWidth = 317;
  stored.general.densityMode = "full";
  stored.toolbar = pinStudioToolbarTools(studioDrawingPinnedToolbar(stored.toolbar), ["vrm3d"]);
  const reading = Promise.withResolvers<StudioAppSettings>(), writing = Promise.withResolvers<void>();
  const favorites = Promise.withResolvers<undefined>();
  repository.loadEffectFavorites.mockReturnValueOnce(favorites.promise);
  repository.loadAppSettings.mockReturnValue(reading.promise);
  repository.saveAppSettings.mockReturnValue(writing.promise);
  const view = renderHook(() => useStudioPreferencesRuntime(options));
  const before = studioDrawingPinnedToolbar(view.result.current.appSettings.toolbar);
  let completed: Promise<void> | void;
  act(() => { completed = view.result.current.commitAppSettings({
    ...view.result.current.appSettings, toolbar: pinStudioToolbarTools(before, ["hand"]),
  }, { before }); });
  expect(studioDrawingPinnedToolbar(view.result.current.appSettings.toolbar).visibleIds).not.toContain("hand");
  await act(async () => { reading.resolve(stored); });
  await waitFor(() => expect(repository.saveAppSettings).toHaveBeenCalledTimes(1));
  const written = repository.saveAppSettings.mock.calls[0][0];
  expect(written.general.brushPanelWidth).toBe(317);
  expect(written.toolbar.visibleIds).toEqual([...stored.toolbar.visibleIds, "hand"]);
  expect(studioDrawingPinnedToolbar(view.result.current.appSettings.toolbar).visibleIds).not.toContain("hand");
  await act(async () => { writing.resolve(); await completed; });
  expect(view.result.current.appSettings).toEqual(written);
  expect(view.result.current.uiDensityMode).toBe("full");
  await act(async () => { favorites.resolve(undefined); });
  await act(async () => {
    const now = view.result.current.appSettings;
    await view.result.current.commitAppSettings({ ...now, toolbar: before }, { before: now.toolbar, restore: true });
  });
  expect(view.result.current.appSettings.toolbar).toEqual(stored.toolbar);
  view.unmount();
  const restored = repository.saveAppSettings.mock.calls.at(-1)?.[0];
  expect(restored).toEqual(stored);
  repository.loadAppSettings.mockResolvedValue(restored ?? stored);
  const fresh = renderHook(() => useStudioPreferencesRuntime(options));
  await waitFor(() => expect(fresh.result.current.appSettings).toEqual(stored));
});

it("등록이 실패하면 기존 핀 선택을 보존하고 같은 버튼에서 저장을 다시 시도한다", async () => {
  const stored = defaultStudioAppSettings();
  repository.loadAppSettings.mockResolvedValue(stored);
  const view = renderHook(() => useStudioPreferencesRuntime(options));
  await waitFor(() => expect(view.result.current.appSettingsPersistenceState).toBe("saved"));
  const before = studioDrawingPinnedToolbar(stored.toolbar);
  const next = { ...stored, toolbar: pinStudioToolbarTools(before, ["hand"]) };
  repository.saveAppSettings.mockRejectedValueOnce(new Error("device full"));
  await act(async () => { await expect(view.result.current.commitAppSettings(next, { before })).rejects.toThrow("device full"); });
  expect(view.result.current.appSettings.toolbar.configured).toBe(stored.toolbar.configured);
  expect(view.result.current.appSettingsPersistenceState).toBe("session-only");
  await act(async () => { await view.result.current.commitAppSettings(next, { before }); });
  expect(view.result.current.appSettings.toolbar.visibleIds).toContain("hand");
  expect(view.result.current.appSettingsPersistenceState).toBe("saved");
});


it("고정하는 도중 변경한 브러시 폭과 연속해서 고정한 두 도구를 함께 보존한다", async () => {
  const stored = defaultStudioAppSettings();
  repository.loadAppSettings.mockResolvedValue(stored);
  const view = renderHook(() => useStudioPreferencesRuntime(options));
  await waitFor(() => expect(view.result.current.appSettingsPersistenceState).toBe("saved"));
  const before = studioDrawingPinnedToolbar(stored.toolbar);
  const writing = Promise.withResolvers<void>();
  repository.saveAppSettings.mockReturnValueOnce(writing.promise);
  let finished: Promise<void> | void;
  act(() => {
    void view.result.current.commitAppSettings({ ...stored, toolbar: pinStudioToolbarTools(before, ["hand"]) }, { before });
    finished = view.result.current.commitAppSettings({ ...stored, toolbar: pinStudioToolbarTools(before, ["vrm3d"]) }, { before });
  });
  await waitFor(() => expect(repository.saveAppSettings).toHaveBeenCalledTimes(1));
  act(() => {
    view.result.current.commitAppSettings({ ...stored, general: { ...stored.general, brushPanelWidth: 337 } });
  });
  await act(async () => { writing.resolve(); await finished; });
  const final = view.result.current.appSettings;
  expect(final.general.brushPanelWidth).toBe(337);
  expect(final.toolbar.visibleIds).toEqual([...before.visibleIds, "hand", "vrm3d"]);
  expect(repository.saveAppSettings.mock.calls.at(-1)?.[0]).toEqual(final);
});
