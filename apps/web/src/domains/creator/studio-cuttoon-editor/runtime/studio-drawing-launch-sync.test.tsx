// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultStudioAppSettings, type StudioAppSettings } from "../../studio-app-settings";
import { normalizeStudioEffectFavoriteState } from "../../studio-effect-favorites";
import { readStudioLaunchPrimaryTool } from "../../studio-launch-mode";
import { useStudioDocumentScopedInitialToolSync } from "../studio-document-tool-isolation";
import { useStudioPreferencesRuntime } from "./useStudioPreferencesRuntime";

const repository = vi.hoisted(() => ({
  loadAppSettings: vi.fn<() => Promise<StudioAppSettings>>(),
  loadEffectFavorites: vi.fn(),
  saveAppSettings: vi.fn(async (_settings: StudioAppSettings) => undefined),
}));
vi.mock("../../studio-legacy-editor-runtime-helpers", () => ({
  acquireProductStudioUiPreferencesRepository: async () => repository,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("같은 원고의 그리기 모드 전환", () => {
  it("늦은 설정 읽기는 현재 주소를 적용하고 주소 해제 시 실제 저장 배치를 복원한다", async () => {
    const stored = defaultStudioAppSettings();
    stored.general.densityMode = "full";
    stored.general.brushPanelWidth = 310;
    const pending = Promise.withResolvers<StudioAppSettings>();
    repository.loadAppSettings.mockReturnValue(pending.promise);
    repository.loadEffectFavorites.mockResolvedValue(normalizeStudioEffectFavoriteState());
    const options = { applyMirroredSettings: vi.fn(), closeRightPanelForFocusMode: vi.fn() };
    const view = renderHook(({ search }) => useStudioPreferencesRuntime({ ...options, launchSearch: search }), {
      initialProps: { search: "?uiMode=full" },
    });
    view.rerender({ search: "?uiMode=focus&startTool=draw" });
    expect(view.result.current.uiDensityMode).toBe("focus");
    view.rerender({ search: "?uiMode=basic&startTool=select" });
    await act(async () => { pending.resolve(stored); });
    expect(view.result.current.appSettings.general).toMatchObject({ densityMode: "simple", brushPanelWidth: 310 });
    expect(view.result.current.appSettingsRef.current.general.densityMode).toBe("full");
    expect(repository.loadAppSettings).toHaveBeenCalledTimes(1);
    expect(repository.saveAppSettings).not.toHaveBeenCalled();

    const current = view.result.current.appSettings;
    act(() => view.result.current.commitAppSettings({
      ...current, general: { ...current.general, brushPanelWidth: 330 },
    }));
    await waitFor(() => expect(repository.saveAppSettings).toHaveBeenCalledTimes(1));
    expect(repository.saveAppSettings.mock.calls[0][0].general).toMatchObject({ densityMode: "full", brushPanelWidth: 330 });
    expect(view.result.current.uiDensityMode).toBe("simple");
    view.rerender({ search: "?room=room-a" });
    expect(view.result.current.uiDensityMode).toBe("full");
    expect(view.result.current.appSettings.general.brushPanelWidth).toBe(330);
    expect(repository.loadAppSettings).toHaveBeenCalledTimes(1);
  });

  it("변경된 시작 도구만 한 번 활성화하고 room·hash 변경은 수동 선택을 보존한다", () => {
    const activateRequestedTool = vi.fn();
    const options = {
      projectId: "project", documentId: "document", focus: null, autosaveChecked: true,
      hasAutosave: true, hasElements: true, workHydrated: true, rememberedPrimaryTool: null,
      primaryToolActivatedRef: { current: true }, setTool: vi.fn(), setDrawMode: vi.fn(), activateRequestedTool,
    };
    const view = renderHook(({ search }) => useStudioDocumentScopedInitialToolSync({
      ...options, requestedPrimaryTool: readStudioLaunchPrimaryTool(search),
    }), { initialProps: { search: "?uiMode=basic&startTool=select" } });
    expect(activateRequestedTool).not.toHaveBeenCalled();
    for (const search of ["?uiMode=focus&startTool=draw", "?uiMode=focus&room=b&startTool=draw", "?uiMode=basic&startTool=select", "?room=c", "?startTool=draw"]) {
      view.rerender({ search });
    }
    expect(activateRequestedTool.mock.calls).toEqual([["draw"], ["select"], ["draw"]]);
    expect(options.setTool).not.toHaveBeenCalled();
  });
});
