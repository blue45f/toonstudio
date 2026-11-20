// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { defaultStudioAppSettings, type StudioAppSettings } from "../../studio-app-settings";
import {
  createStudioEffectId,
  normalizeStudioEffectFavoriteState,
  type StudioEffectFavoriteState,
} from "../../studio-effect-favorites";
import { useStudioPreferencesRuntime } from "./useStudioPreferencesRuntime";

const repository = vi.hoisted(() => ({
  loadAppSettings: vi.fn<() => Promise<StudioAppSettings>>(),
  loadEffectFavorites: vi.fn<() => Promise<StudioEffectFavoriteState>>(),
  saveAppSettings: vi.fn<(settings: StudioAppSettings) => Promise<void>>(),
  saveEffectFavorites: vi.fn<(state: StudioEffectFavoriteState) => Promise<void>>(),
}));
vi.mock("../../studio-legacy-editor-runtime-helpers", () => ({
  acquireProductStudioUiPreferencesRepository: async () => repository,
}));
const options = {
  launchSearch: "",
  applyMirroredSettings: vi.fn(),
  closeRightPanelForFocusMode: vi.fn(),
};

beforeEach(() => {
  repository.loadAppSettings.mockResolvedValue(defaultStudioAppSettings());
  repository.loadEffectFavorites.mockResolvedValue(normalizeStudioEffectFavoriteState());
  repository.saveAppSettings.mockResolvedValue();
  repository.saveEffectFavorites.mockResolvedValue();
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("늦게 읽은 즐겨찾기가 사용자가 이미 바꾼 즐겨찾기와 최근 효과를 덮어쓰지 않는다", async () => {
  const pending = Promise.withResolvers<StudioEffectFavoriteState>();
  repository.loadEffectFavorites.mockReturnValue(pending.promise);
  const selected = createStudioEffectId("filter", "selected");
  const stored = createStudioEffectId("look", "stored");
  const view = renderHook(() => useStudioPreferencesRuntime(options));
  await waitFor(() => expect(repository.loadEffectFavorites).toHaveBeenCalledTimes(1));
  act(() => {
    view.result.current.toggleEffectFavorite(selected);
    view.result.current.rememberEffectRecent(selected);
  });
  const expected = normalizeStudioEffectFavoriteState({ favorites: [selected], recent: [selected] });
  expect(view.result.current.effectFavoriteState).toEqual(expected);

  await act(async () => {
    pending.resolve(normalizeStudioEffectFavoriteState({ favorites: [stored] }));
  });
  await waitFor(() => expect(view.result.current.appSettingsPersistenceState).toBe("saved"));
  expect(view.result.current.effectFavoriteState).toEqual(expected);
  expect(repository.saveEffectFavorites).toHaveBeenLastCalledWith(expected);
  view.rerender();
  expect(repository.loadEffectFavorites).toHaveBeenCalledTimes(1);
});

it.each(["성공", "실패"])("닫힌 원고의 설정 저장이 늦게 %s해도 다시 연 원고의 즐겨찾기를 보존한다", async (outcome) => {
  const initialRead = Promise.withResolvers<StudioEffectFavoriteState>();
  const pendingSave = Promise.withResolvers<void>();
  let stored = normalizeStudioEffectFavoriteState();
  repository.loadEffectFavorites.mockImplementationOnce(() => initialRead.promise).mockImplementation(async () => stored);
  repository.saveEffectFavorites.mockImplementation(async next => { stored = next; });
  repository.saveAppSettings.mockResolvedValueOnce().mockReturnValueOnce(pendingSave.promise);

  const oldView = renderHook(() => useStudioPreferencesRuntime(options));
  await waitFor(() => expect(repository.loadEffectFavorites).toHaveBeenCalledTimes(1));
  const first = createStudioEffectId("filter", "first");
  act(() => {
    oldView.result.current.setStudioUiDensity("focus");
    oldView.result.current.toggleEffectFavorite(first);
  });
  await waitFor(() => expect(stored.favorites).toEqual([first]));
  await act(async () => { initialRead.resolve(normalizeStudioEffectFavoriteState()); });
  await waitFor(() => expect(repository.saveAppSettings).toHaveBeenCalledTimes(2));
  oldView.unmount();

  const reopened = renderHook(() => useStudioPreferencesRuntime(options));
  await waitFor(() => expect(reopened.result.current.appSettingsPersistenceState).toBe("saved"));
  const second = createStudioEffectId("look", "second");
  act(() => { reopened.result.current.toggleEffectFavorite(second); });
  const latest = reopened.result.current.effectFavoriteState;
  await waitFor(() => expect(stored.favorites).toContain(second));
  await act(async () => {
    if (outcome === "성공") pendingSave.resolve();
    else pendingSave.reject(new Error("설정 저장 실패"));
  });
  expect(stored).toEqual(latest);
  expect(repository.saveEffectFavorites).toHaveBeenCalledTimes(2);
});

it("오래된 저장 실패는 최신 상태를 낮추지 않고 최신 저장 실패는 세션 내 선택을 보존한다", async () => {
  const view = renderHook(() => useStudioPreferencesRuntime(options));
  await waitFor(() => expect(view.result.current.appSettingsPersistenceState).toBe("saved"));
  const first = createStudioEffectId("filter", "first");
  const second = createStudioEffectId("look", "second");
  const oldWrite = Promise.withResolvers<void>();
  const newWrite = Promise.withResolvers<void>();
  repository.saveEffectFavorites.mockReturnValueOnce(oldWrite.promise).mockReturnValueOnce(newWrite.promise);
  act(() => {
    view.result.current.toggleEffectFavorite(first);
    view.result.current.toggleEffectFavorite(second);
  });
  await waitFor(() => expect(repository.saveEffectFavorites).toHaveBeenCalledTimes(2));
  await act(async () => { newWrite.resolve(); });
  await act(async () => { oldWrite.reject(new Error("old write failed")); });
  expect(view.result.current.appSettingsPersistenceState).toBe("saved");
  expect(view.result.current.effectFavoriteState.favorites).toEqual([second, first]);

  repository.saveEffectFavorites.mockRejectedValueOnce(new Error("device full"));
  act(() => view.result.current.rememberEffectRecent(second));
  await waitFor(() => expect(view.result.current.appSettingsPersistenceState).toBe("session-only"));
  expect(view.result.current.effectFavoriteState).toEqual(
    normalizeStudioEffectFavoriteState({ favorites: [second, first], recent: [second] }),
  );
});
