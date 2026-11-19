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
  saveAppSettings: vi.fn<(_settings: StudioAppSettings) => Promise<void>>(),
  saveEffectFavorites: vi.fn<(_state: StudioEffectFavoriteState) => Promise<void>>(),
}));
vi.mock("../../studio-legacy-editor-runtime-helpers", () => ({
  acquireProductStudioUiPreferencesRepository: async () => repository,
}));

const options = {
  launchSearch: "",
  closeRightPanelForFocusMode: vi.fn(),
  applyMirroredSettings: vi.fn(),
};
const blur = createStudioEffectId("filter", "blur");
const glow = createStudioEffectId("filter", "glow");
const sepia = createStudioEffectId("look", "sepia");

beforeEach(() => {
  vi.resetAllMocks();
  repository.loadAppSettings.mockResolvedValue(defaultStudioAppSettings());
  repository.loadEffectFavorites.mockResolvedValue(normalizeStudioEffectFavoriteState());
  repository.saveAppSettings.mockResolvedValue();
  repository.saveEffectFavorites.mockResolvedValue();
});
afterEach(cleanup);

it("연속 효과 선택을 동기 ref에 누적하고 늦게 읽은 설정보다 현재 선택을 저장한다", async () => {
  const reading = Promise.withResolvers<StudioEffectFavoriteState>();
  repository.loadEffectFavorites.mockReturnValueOnce(reading.promise);
  const view = renderHook(() => useStudioPreferencesRuntime(options));
  await waitFor(() => expect(repository.loadEffectFavorites).toHaveBeenCalledTimes(1));

  act(() => {
    view.result.current.toggleEffectFavorite(blur);
    view.result.current.toggleEffectFavorite(glow);
    view.result.current.rememberEffectRecent(blur);
  });
  const chosen = view.result.current.effectFavoriteState;
  expect(chosen).toMatchObject({ favorites: [glow, blur], recent: [blur] });
  expect(view.result.current.effectFavoriteStateRef.current).toBe(chosen);

  view.rerender();
  await act(async () => {
    reading.resolve(normalizeStudioEffectFavoriteState({ favorites: [sepia], recent: [] }));
  });
  await waitFor(() => expect(view.result.current.appSettingsPersistenceState).toBe("saved"));
  expect(view.result.current.effectFavoriteState).toBe(chosen);
  expect(repository.saveEffectFavorites).toHaveBeenLastCalledWith(chosen);
  expect(repository.loadAppSettings).toHaveBeenCalledTimes(1);
  expect(repository.loadEffectFavorites).toHaveBeenCalledTimes(1);
});

it("오래된 저장 실패는 최신 선택을 유지하고 최신 revision의 실패만 세션 저장으로 표시한다", async () => {
  const view = renderHook(() => useStudioPreferencesRuntime(options));
  await waitFor(() => expect(view.result.current.appSettingsPersistenceState).toBe("saved"));
  const olderWrite = Promise.withResolvers<void>();
  repository.saveEffectFavorites.mockReturnValueOnce(olderWrite.promise).mockResolvedValueOnce();

  act(() => {
    view.result.current.toggleEffectFavorite(blur);
    view.result.current.rememberEffectRecent(glow);
  });
  await waitFor(() => expect(repository.saveEffectFavorites).toHaveBeenCalledTimes(2));
  const latest = view.result.current.effectFavoriteState;
  await act(async () => { olderWrite.reject(new Error("이전 저장 실패")); });
  expect(view.result.current.appSettingsPersistenceState).toBe("saved");
  expect(view.result.current.effectFavoriteState).toBe(latest);
  expect(latest).toMatchObject({ favorites: [blur], recent: [glow] });

  repository.saveEffectFavorites.mockRejectedValueOnce(new Error("현재 저장 실패"));
  act(() => view.result.current.toggleEffectFavorite(blur));
  await waitFor(() => expect(view.result.current.appSettingsPersistenceState).toBe("session-only"));
  expect(view.result.current.effectFavoriteState).toMatchObject({ favorites: [], recent: [glow] });
  expect(view.result.current.effectFavoriteStateRef.current).toBe(view.result.current.effectFavoriteState);
});
