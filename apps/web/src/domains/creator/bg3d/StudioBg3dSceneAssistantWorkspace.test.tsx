// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n-core";

import { allocateStudioBg3dTemplateInstanceNodeIds } from "./studio-bg3d-template-instance";
import { studioBg3dAssistantLocationId } from "./studio-bg3d-assistant-location";
import { copyStudioBg3dBundledEnvironmentLibraryEntries } from "./studio-bg3d-bundled-environment-library";
import { BG_SCENE_TEMPLATES } from "../studio-background-3d-scene-templates";
import {
  StudioBg3dSceneAssistantWorkspace,
  type StudioBg3dSceneAssistantHost,
} from "./StudioBg3dSceneAssistantWorkspace";

vi.mock("./StudioBg3dEditorViewport", () => ({
  StudioBg3dEditorViewport: () => <div data-testid="mock-scene-viewport" />,
}));

afterEach(() => cleanup());

function createHost(
  overrides: Partial<StudioBg3dSceneAssistantHost> = {},
): StudioBg3dSceneAssistantHost {
  return {
    open: true,
    operation: "insert",
    primitives: [],
    customModels: [],
    sharedCharacterCaptureElementIds: [],
    selectedIds: new Set<string>(),
    setSelectedIds: vi.fn(),
    modelLibrary: [],
    genericModelClassifications: new Map(),
    transformMode: "translate",
    lineArtPreview: false,
    placementActive: false,
    placementSession: { phase: "idle" },
    isCapturing: false,
    isRestoringScene: false,
    isUploadingModel: false,
    isBatchRenderingShots: false,
    applyingTemplateId: null,
    deletingModelId: null,
    insertBlocked: false,
    immersiveSceneActive: false,
    sharedStageUpdateBlockedReason: null,
    groundSelectionDisabledReason: null,
    focusSelectionDisabledReason: null,
    error: null,
    addSceneTemplate: vi.fn(() => true),
    addCustomModelToScene: vi.fn().mockResolvedValue(true),
    addPrimitive: vi.fn(),
    applyCameraPreset: vi.fn(),
    zoomCameraBy: vi.fn(),
    setTransformMode: vi.fn(),
    setLineArtPreview: vi.fn(),
    updateLtToneSettings: vi.fn(),
    updateLtExportAspectRatio: vi.fn(),
    groundSelectedEntity: vi.fn(),
    focusSelectedEntity: vi.fn(),
    duplicateSelected: vi.fn(),
    deleteSelected: vi.fn(),
    handleSaveToLibrary: vi.fn(),
    handleInsert: vi.fn(),
    setActivePanelTab: vi.fn(),
    setModelsPanelActivated: vi.fn(),
    setViewEditorSection: vi.fn(),
    setLtEditorSection: vi.fn(),
    ...overrides,
  };
}
describe("StudioBg3dSceneAssistantWorkspace", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("장면 도우미 안에서 터치 안내를 열고 닫아도 선택 단계가 보존된다", () => {
    const host = createHost();
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);
    const summary = screen.getByText("터치 작업 안내");
    const guide = summary.closest("details");
    expect(guide?.open).toBe(false);
    fireEvent.click(summary);
    expect(guide?.open).toBe(true);
    expect(guide?.textContent).toContain("WebGL2로 계속");
    expect(guide?.textContent).toContain("장면을 눌러 배치하기");
    fireEvent.click(summary);
    expect(guide?.open).toBe(false);
    expect(screen.getByTestId("studio-bg3d-scene-assistant").dataset.step).toBe("choose");
    expect(host.addSceneTemplate).not.toHaveBeenCalled();
  });

  it("배치 중에는 기존 배치 도구가 안내를 맡고 배치가 끝나면 도우미 상태가 돌아온다", () => {
    const idleHost = createHost();
    const placementHost = createHost({ placementSession: { phase: "preview" } });
    const onOpenProfessional = vi.fn();
    const { rerender } = render(<StudioBg3dSceneAssistantWorkspace h={idleHost} onOpenProfessional={onOpenProfessional} />);
    const statusText = "시작점 선택에서 장면을 골라 주세요";
    const status = screen.getByText(statusText);
    expect(status.getAttribute("aria-live")).toBe("polite");

    rerender(<StudioBg3dSceneAssistantWorkspace h={placementHost} onOpenProfessional={onOpenProfessional} />);
    expect(status.classList.contains("sr-only")).toBe(true);
    expect(status.textContent).toBe("");

    rerender(<StudioBg3dSceneAssistantWorkspace h={idleHost} onOpenProfessional={onOpenProfessional} />);
    expect(screen.getByText(statusText)).toBe(status);
    expect(status.classList.contains("scene-assistant__viewport-status")).toBe(true);
  });

  it("미확정 배치에서는 작화 단계 진입과 출력을 막고 배치 화면으로 돌아갈 수 있다", () => {
    const committed = [{ id: "existing-scene" }];
    const ready = createHost({ primitives: committed });
    const placing = createHost({ primitives: committed, placementSession: { phase: "preview" } });
    const onOpenProfessional = vi.fn();
    const { rerender } = render(<StudioBg3dSceneAssistantWorkspace h={placing} onOpenProfessional={onOpenProfessional} />);
    const assistant = screen.getByTestId("studio-bg3d-scene-assistant");
    const finish = () => within(screen.getByRole("navigation", { name: "장면 제작 단계" })).getByRole("button", { name: "4. 작화 적용" });
    fireEvent.click(screen.getByRole("button", { name: "다음: 구도 잡기" }));
    expect(assistant.dataset.step).toBe("frame");
    expect(finish()).toHaveProperty("disabled", true);
    fireEvent.click(finish());
    expect(assistant.dataset.step).toBe("frame");
    expect(screen.getByRole("button", { name: "배치를 먼저 확정하거나 취소하세요" })).toHaveProperty("disabled", true);

    rerender(<StudioBg3dSceneAssistantWorkspace h={ready} onOpenProfessional={onOpenProfessional} />);
    fireEvent.click(finish());
    expect(assistant.dataset.step).toBe("finish");
    rerender(<StudioBg3dSceneAssistantWorkspace h={placing} onOpenProfessional={onOpenProfessional} />);
    const save = screen.getByRole("button", { name: /장면을 소재로도 저장/ });
    const applyDisabled = screen.getByRole("button", { name: "배치를 먼저 확정하거나 취소하세요" });
    expect(save).toHaveProperty("disabled", true);
    expect(applyDisabled).toHaveProperty("disabled", true);
    fireEvent.click(save);
    fireEvent.click(applyDisabled);
    expect(placing.handleSaveToLibrary).not.toHaveBeenCalled();
    expect(placing.handleInsert).not.toHaveBeenCalled();
    const handle = screen.getByRole("button", { name: "배치 화면 보기" });
    handle.focus();
    fireEvent.click(handle);
    expect(assistant.dataset.sheetState).toBe("peek");
    expect(screen.queryByRole("button", { name: "삽입 설정 열기" })).toBeNull();
    expect(screen.getByRole("button", { name: "배치 확정 또는 취소 필요" })).toBe(handle);
    expect(handle.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(handle);
    fireEvent.click(handle);
    expect(assistant.dataset.sheetState).toBe("peek");

    rerender(<StudioBg3dSceneAssistantWorkspace h={ready} onOpenProfessional={onOpenProfessional} />);
    expect(screen.getByRole("button", { name: "삽입 설정 열기" })).toBe(handle);
    expect(document.activeElement).toBe(handle);
    expect(handle.hasAttribute("aria-disabled")).toBe(false);
    fireEvent.click(handle);
    expect(save).toHaveProperty("disabled", false);
    fireEvent.click(save);
    fireEvent.click(screen.getByRole("button", { name: "현재 컷에 적용" }));
    expect(ready.handleSaveToLibrary).toHaveBeenCalledOnce();
    expect(ready.handleInsert).toHaveBeenCalledOnce();
  });

  it("opens with purpose-led choices and no professional DCC terminology", () => {
    render(<StudioBg3dSceneAssistantWorkspace h={createHost()} onOpenProfessional={vi.fn()} />);

    expect(screen.getByText("3D 장면 구성")).toBeDefined();
    expect(screen.queryByText("무엇을 만들까요?")).toBeNull();
    expect(screen.queryByText("창작 영감을 위한 예시 일러스트")).toBeNull();
    expect(screen.getByRole("button", { name: /배경·구도/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /인물·포즈/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /소품/ })).toBeDefined();
    expect(screen.queryByText(/글로벌 축|로컬 축|법선 정렬|LT/u)).toBeNull();
    expect(screen.queryByText(/CURATED SCENE COLLECTION|SCENE ASSISTANT/u)).toBeNull();
    expect((screen.getByRole("button", { name: "다음: 배치하기" }) as HTMLButtonElement).disabled).toBe(true);
  });


  it("offers the full location catalog and applies the chosen space only after confirmation", () => {
    const host = createHost({ primitives: [{ id: "artist-prop" }] });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "1. 시작점 선택" }));
    const select = screen.getByRole("combobox", { name: "모든 공간" });
    expect(new Set(within(select).getAllByRole("option").map((option) => option.getAttribute("value"))))
      .toEqual(new Set(["", ...BG_SCENE_TEMPLATES.map(({ id }) => id)]));
    const apply = screen.getByRole("button", { name: "공간 적용" });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(select, { target: { value: "forest_path" } });
    expect(host.addSceneTemplate).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(apply);
    expect(host.addSceneTemplate).not.toHaveBeenCalled();
    fireEvent.click(apply);
    expect(host.addSceneTemplate).toHaveBeenCalledExactlyOnceWith("forest_path");
    expect(host.applyCameraPreset).not.toHaveBeenCalled();
    expect(screen.getByTestId("studio-bg3d-scene-assistant").getAttribute("data-step")).toBe("arrange");
    cleanup();
    const nodesFor = (sourceId: string) => {
      const allocation = allocateStudioBg3dTemplateInstanceNodeIds({
        sourceId, sourceKind: "catalog", insertionOffset: 0, nodeCount: 2, occupiedNodeIds: new Set(), createSeed: () => "saved-cut",
      });
      if (!allocation) throw new Error("공간의 저장 식별자를 만들지 못했습니다.");
      return allocation.nodeIds.map((id) => ({ id }));
    };
    const forestNodes = nodesFor("forest_path");
    render(<StudioBg3dSceneAssistantWorkspace h={createHost({ primitives: forestNodes })} onOpenProfessional={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "1. 시작점 선택" }));
    expect((screen.getByRole("combobox", { name: "모든 공간" }) as HTMLSelectElement).value).toBe("forest_path");
    expect(studioBg3dAssistantLocationId([...forestNodes, ...nodesFor("beach")])).toBeNull();
  });

  it("refreshes asynchronous mutable host state so restored scenes never leave navigation disabled", async () => {
    const host = createHost();
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);
    const next = screen.getByRole("button", { name: "다음: 배치하기" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);

    (host as { primitives: readonly { id: string }[] }).primitives = [{ id: "restored-scene" }];

    await waitFor(() => expect(next.disabled).toBe(false), { timeout: 1_000 });
  });

  it("blocks scene mutations until the verified source scene has finished restoring", () => {
    const host = createHost({ isRestoringScene: true });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

    const sceneCard = screen.getByRole("button", { name: /교실/ }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "다음: 배치하기" }) as HTMLButtonElement;
    expect(sceneCard.disabled).toBe(true);
    expect(next.disabled).toBe(true);
    fireEvent.click(sceneCard);
    expect(host.addSceneTemplate).not.toHaveBeenCalled();
  });

  it("turns a curated scene choice into a usable scene and camera in one action", () => {
    const host = createHost();
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /교실/ }));

    expect(host.addSceneTemplate).toHaveBeenCalledWith("classroom");
    expect(host.applyCameraPreset).toHaveBeenCalledWith("threeQuarter");
    expect(screen.getByText(/개 항목으로 장면 구성됨/)).toBeDefined();
  });

  it("frames a newly inserted scene after its selectable objects are mounted", async () => {
    const host = createHost();
    const mutableHost = host as unknown as {
      addSceneTemplate: (templateId: string) => boolean;
    };
    mutableHost.addSceneTemplate = vi.fn(() => {
      (host as { primitives: readonly { id: string }[] }).primitives = [
        { id: "classroom-floor" },
        { id: "classroom-wall" },
      ];
      (host as { selectedIds: ReadonlySet<string> }).selectedIds = new Set([
        "classroom-floor",
        "classroom-wall",
      ]);
      return true;
    });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /교실/ }));

    await waitFor(() => expect(host.focusSelectedEntity).toHaveBeenCalledOnce());
  });

  it("waits for selectable geometry before framing a camera preset", async () => {
    const host = createHost({
      primitives: [{ id: "scene-a" }, { id: "scene-b" }],
      selectedIds: new Set(["scene-a", "scene-b"]),
      focusSelectionDisabledReason: "선택한 객체의 지오메트리를 준비하는 중입니다.",
    });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

    fireEvent.click(within(screen.getByRole("navigation", { name: "장면 제작 단계" }))
      .getByRole("button", { name: "3. 구도 잡기" }));
    fireEvent.click(screen.getByRole("button", { name: /하이앵글/ }));
    expect(host.focusSelectedEntity).not.toHaveBeenCalled();

    (host as { focusSelectionDisabledReason: string | null }).focusSelectionDisabledReason = null;
    await waitFor(() => expect(host.focusSelectedEntity).toHaveBeenCalledOnce(), { timeout: 1_000 });
  });

  it("stays on scene selection when the runtime rejects a template", () => {
    const host = createHost({ addSceneTemplate: vi.fn(() => false) });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /교실/ }));

    expect(host.applyCameraPreset).not.toHaveBeenCalled();
    expect(screen.getByTestId("studio-bg3d-scene-assistant").getAttribute("data-step")).toBe("choose");
  });

  it("confirms a background switch while delegating one atomic retained-content transaction", () => {
    const host = createHost({
      primitives: [{ id: "old-bg" }],
      customModels: [
        { id: "chair-instance", modelId: "chair-model" },
        { id: "hero-instance", modelId: "hero-model" },
      ],
      genericModelClassifications: new Map([
        ["chair-model", "prop"],
        ["hero-model", "character"],
      ]),
    });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

    fireEvent.click(within(screen.getByRole("navigation", { name: "장면 제작 단계" })).getByRole("button", { name: "1. 시작점 선택" }));
    fireEvent.click(screen.getByRole("button", { name: /카페/ }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("인물과 소품은 유지"));
    expect(host.addSceneTemplate).toHaveBeenCalledWith("cafe");
  });
  it("adds classified character assets without forcing the user into a separate tool", async () => {
    const host = createHost({
      modelLibrary: [{ id: "hero", name: "주인공 캐릭터", thumbnail: null, canUse: true }],
      genericModelClassifications: new Map([["hero", "character"]]),
    });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /인물·포즈/ }));
    expect(screen.getByRole("link", { name: /포즈 편집기/ }).getAttribute("href")).toBe("/studio/poser");
    expect(screen.getByRole("link", { name: /새 캐릭터 만들기/ }).getAttribute("href")).toBe("/studio/character");
    fireEvent.click(screen.getByRole("button", { name: /주인공 캐릭터/ }));

    expect(host.addCustomModelToScene).toHaveBeenCalledWith("hero");
    await waitFor(() => expect(screen.getByTestId("studio-bg3d-scene-assistant").getAttribute("data-step")).toBe("arrange"));
  });

  it("configures the renderer style and aspect before applying exactly once", async () => {
    const writeAspectRatio = vi.fn((ltExportAspectRatio: number | null) => {
      Object.assign(host, { ltExportAspectRatio });
    });
    const host = createHost({
      primitives: [{ id: "scene" }],
      ltExportAspectRatio: null,
      updateLtExportAspectRatio: writeAspectRatio,
    });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

    expect(screen.queryByRole("combobox", { name: "삽입 비율" })).toBeNull();
    fireEvent.click(within(screen.getByRole("navigation", { name: "장면 제작 단계" })).getByRole("button", { name: "4. 작화 적용" }));
    const aspect = screen.getByRole("combobox", { name: "삽입 비율" });
    expect(aspect).toHaveProperty("value", "viewport");
    expect(within(aspect).getAllByRole("option").map((option) => option.textContent))
      .toEqual(["화면 맞춤", "16:9", "4:3", "1:1", "9:16"]);
    expect(screen.getByText(/화면 크기에 따라 삽입 비율이 달라집니다/)).toBeTruthy();
    expect(screen.queryByText("현재 컷 비율에 맞춰 출력")).toBeNull();

    fireEvent.change(aspect, { target: { value: "9-16" } });
    expect(await screen.findByText(/점선 테두리 안쪽을 삽입합니다/)).toBeTruthy();
    expect(aspect).toHaveProperty("value", "9-16");
    expect(writeAspectRatio).toHaveBeenLastCalledWith(9 / 16);
    expect(screen.getByTestId("studio-bg3d-scene-assistant").dataset.sheetState).toBe("half");
    fireEvent.change(aspect, { target: { value: "viewport" } });
    expect(writeAspectRatio).toHaveBeenLastCalledWith(null);
    expect(await screen.findByText(/화면 크기에 따라 삽입 비율이 달라집니다/)).toBeTruthy();
    expect(aspect).toHaveProperty("value", "viewport");
    fireEvent.change(aspect, { target: { value: "16-9" } });
    await waitFor(() => expect(aspect).toHaveProperty("value", "16-9"));
    expect(host.ltExportAspectRatio).toBe(16 / 9);
    expect(host.handleInsert).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /톤 배경/ }));
    fireEvent.click(screen.getByRole("button", { name: "현재 컷에 적용" }));

    expect(host.setLineArtPreview).toHaveBeenCalledWith(true);
    expect(host.updateLtToneSettings).toHaveBeenCalledWith(expect.objectContaining({
      type: "grayscale",
    }));
    expect(host.handleInsert).toHaveBeenCalledOnce();
  });

  it.each(["half", "full"] as const)("views the crop and restores %s insert settings, focus, and scroll", (sheet) => {
    const host = createHost({ primitives: [{ id: "scene" }], ltExportAspectRatio: 16 / 9 });
    const { container } = render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);
    const assistant = screen.getByTestId("studio-bg3d-scene-assistant");
    fireEvent.click(within(screen.getByRole("navigation", { name: "장면 제작 단계" })).getByRole("button", { name: "4. 작화 적용" }));
    if (sheet === "full") fireEvent.click(screen.getByRole("button", { name: "도구 패널 펼치기" }));
    expect(assistant.dataset.sheetState).toBe(sheet);

    const scrollArea = container.querySelector(".scene-assistant__panel-scroll");
    if (!(scrollArea instanceof HTMLElement)) throw new Error("Expected the assistant settings scroll area");
    const tone = screen.getByRole("button", { name: /톤 배경/ });
    fireEvent.click(tone);
    scrollArea.scrollTop = 160;
    const preview = screen.getByRole("button", { name: "컷 범위 보기" });
    preview.focus();
    fireEvent.click(preview);

    const restore = screen.getByRole("button", { name: "삽입 설정 열기" });
    expect(assistant.dataset.sheetState).toBe("peek");
    expect(restore.textContent).toBe("삽입 설정 열기");
    expect(document.activeElement).toBe(restore);
    scrollArea.scrollTop = 0;
    fireEvent.click(restore);

    const aspect = screen.getByRole("combobox", { name: "삽입 비율" });
    expect(assistant.dataset.sheetState).toBe(sheet);
    expect(document.activeElement).toBe(aspect);
    expect(scrollArea.scrollTop).toBe(160);
    expect(aspect).toHaveProperty("value", "16-9");
    expect(tone.getAttribute("aria-pressed")).toBe("true");
    expect(host.updateLtExportAspectRatio).not.toHaveBeenCalled();
    expect(host.handleInsert).not.toHaveBeenCalled();
  });

  it.each([
    [1.2, "custom", "1.20:1"],
    [4 / 5, "4-5", "4:5"],
  ] as const)("shows stored aspect %s without rewriting the reopened scene", (ltExportAspectRatio, id, label) => {
    const host = createHost({ primitives: [{ id: "scene" }], operation: "update", ltExportAspectRatio });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);
    fireEvent.click(within(screen.getByRole("navigation", { name: "장면 제작 단계" })).getByRole("button", { name: "4. 작화 적용" }));

    const aspect = screen.getByRole("combobox", { name: "삽입 비율" });
    expect(aspect).toHaveProperty("value", id);
    expect(within(aspect).getByRole("option", { name: label })).toHaveProperty("selected", true);
    expect(host.updateLtExportAspectRatio).not.toHaveBeenCalled();
    expect(host.handleInsert).not.toHaveBeenCalled();
  });

  it("localizes the aspect field and its hint when the app language changes", () => {
    const host = createHost({ primitives: [{ id: "scene" }] });
    const { lang, setLang } = useI18n.getState();
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);
    fireEvent.click(within(screen.getByRole("navigation", { name: "장면 제작 단계" })).getByRole("button", { name: "4. 작화 적용" }));

    try {
      act(() => setLang("en"));
      const aspect = screen.getByRole("combobox", { name: "Insert aspect ratio" });
      expect(within(aspect).getByRole("option", { name: "Fit to view" })).toHaveProperty("selected", true);
      expect(screen.getByText("Uses the full 3D view, so the insert ratio follows the view size.")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "View crop" }));
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open insert settings" }));
    } finally {
      act(() => setLang(lang));
    }
  });

  it("가져온 6패스의 수신 문서 제한을 적용 버튼 앞에 표시하고 캡처를 시작하지 않는다", () => {
    const host = createHost({ primitives: [{ id: "scene" }], sixPassLtInsertUnavailableReason: "이 원고는 6패스 분리 출력을 지원하지 않습니다." });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);
    fireEvent.click(within(screen.getByRole("navigation", { name: "장면 제작 단계" })).getByRole("button", { name: "4. 작화 적용" }));
    expect(screen.getByRole("alert").textContent).toContain("6패스 분리 출력을 지원하지 않습니다");
    const aspect = screen.getByRole("combobox", { name: "삽입 비율" });
    expect(aspect).toHaveProperty("disabled", true);
    fireEvent.change(aspect, { target: { value: "16-9" } });
    expect(host.updateLtExportAspectRatio).not.toHaveBeenCalled();
    const apply = screen.getByRole("button", { name: "현재 컷에 적용" });
    expect(apply).toHaveProperty("disabled", true);
    fireEvent.click(apply);
    expect(host.handleInsert).not.toHaveBeenCalled();
  });

  it("opens the professional workspace only as an explicit progressive disclosure", () => {
    const openProfessional = vi.fn();
    const host = createHost();
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={openProfessional} />);
    fireEvent.click(screen.getByRole("button", { name: /^장면 템플릿$/u }));
    expect(host.setActivePanelTab).toHaveBeenCalledWith("templates");
    expect(openProfessional).toHaveBeenCalledOnce();
  });

  it("한국어 번들 배경 전체를 간편 모드에서 찾아 원본을 배치한다", async () => {
    const modelLibrary = copyStudioBg3dBundledEnvironmentLibraryEntries();
    const host = createHost({ modelLibrary });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);
    const grid = within(screen.getByTestId("scene-assistant-env-asset-grid"));
    expect(grid.getAllByRole("button")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: /배경 더 보기/ }));
    expect(grid.getAllByRole("button")).toHaveLength(16);
    const search = screen.getByRole("searchbox", { name: "배경 모델 검색" });
    fireEvent.change(search, { target: { value: "존재하지 않는 배경" } });
    expect(screen.getByText("검색한 배경이 없습니다.")).toBeTruthy();
    fireEvent.change(search, { target: { value: "HARBOR 선체" } });
    const shipyard = modelLibrary.find(item => item.name === "항구 목선 수리소");
    expect(shipyard).toBeDefined();
    fireEvent.click(grid.getByRole("button", { name: /항구 목선 수리소/ }));
    expect(host.addCustomModelToScene).toHaveBeenCalledWith(shipyard?.id);
    await waitFor(() => expect(screen.getByTestId("studio-bg3d-scene-assistant").getAttribute("data-step")).toBe("arrange"));
  });

  it("소품이 비었을 때 전체 라이브러리에서 에셋 탭을 연다", () => {
    const host = createHost();
    const open = vi.fn();
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={open} />);
    fireEvent.click(screen.getByRole("button", { name: /소품.*가구와 물건/ }));
    fireEvent.click(screen.getByRole("button", { name: "전체 라이브러리 열기" }));
    expect(host.setActivePanelTab).toHaveBeenCalledWith("models");
    expect(host.setModelsPanelActivated).toHaveBeenCalledWith(true);
    expect(open).toHaveBeenCalledOnce();
  });

  it("모델 준비가 거절되면 선택 화면에서 같은 배경을 다시 시도할 수 있다", async () => {
    let finish!: (prepared: boolean) => void;
    const add = vi.fn().mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve; })).mockResolvedValue(true);
    const host = createHost({ modelLibrary: [{ id: "room", name: "테스트 공간", thumbnail: null, canUse: true }], addCustomModelToScene: add });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);
    const card = screen.getByRole("button", { name: /테스트 공간/ });
    fireEvent.click(card);
    expect(card).toHaveProperty("disabled", true);
    expect(screen.getByText("테스트 공간 배치 준비 중…")).toBeTruthy();
    finish(false);
    await waitFor(() => expect(card).toHaveProperty("disabled", false));
    expect(screen.getByTestId("studio-bg3d-scene-assistant").getAttribute("data-step")).toBe("choose");
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByTestId("studio-bg3d-scene-assistant").getAttribute("data-step")).toBe("arrange"));
  });

  it("surfaces environment-classified 3D models in the background goal step and adds them on click", async () => {
    const host = createHost({
      modelLibrary: [
        {
          id: "tripo3d-bg-webtoon-palace-courtyard-v1",
          name: "로판 황실 중정 가든 세트",
          thumbnail: null,
          canUse: true,
        },
      ],
      genericModelClassifications: new Map([
        ["tripo3d-bg-webtoon-palace-courtyard-v1", "environment"],
      ]),
    });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

    expect(screen.getByText("준비된 3D 환경 모델")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /로판 황실 중정 가든 세트/ }));
    expect(host.addCustomModelToScene).toHaveBeenCalledWith(
      "tripo3d-bg-webtoon-palace-courtyard-v1",
    );
    await waitFor(() => expect(screen.getByTestId("studio-bg3d-scene-assistant").getAttribute("data-step")).toBe("arrange"));
  });

  it("distinguishes engine error from active restoration so blocked hosts do not spin infinitely", () => {
    const onPreferenceChange = vi.fn();
    const onReturnTo2d = vi.fn();
    const host = createHost({
      isRestoringScene: true,
      readinessState: {
        phase: "error",
        stage: "engine-unavailable",
        selectedEngine: "webgl2",
        activeEngine: null,
        badgeLabelKo: "WebGL2 사용 불가",
        badgeLabelEn: "WebGL2 unavailable",
        detailKo: "이 기기나 브라우저에서 WebGL2를 사용할 수 없습니다.",
        detailEn: "WebGL2 is unavailable on this device.",
      },
      engineRuntime: {
        preference: "webgl2",
        setPreference: onPreferenceChange,
      },
      resourceRecovery: {
        lowQualityActive: false,
        reopenLowQuality: vi.fn(),
        returnTo2d: onReturnTo2d,
      },
    });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

    const assistant = screen.getByTestId("studio-bg3d-scene-assistant");
    expect(assistant.getAttribute("data-assistant-readiness")).toBe("error");
    expect(assistant.getAttribute("data-assistant-restoring")).toBeNull();
    expect(screen.getByTestId("studio-bg3d-assistant-error").textContent)
      .toContain("WebGL2 사용 불가");

    fireEvent.click(screen.getByTestId("studio-bg3d-assistant-recovery-webgl2"));
    expect(onPreferenceChange).toHaveBeenCalledWith("webgl2");

    fireEvent.click(screen.getByTestId("studio-bg3d-assistant-recovery-return-2d"));
    expect(onReturnTo2d).toHaveBeenCalledOnce();
  });

  it("auto-selects mobile -mobile.glb and displays savings badge for hero-v1 scenes on mobile viewport", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    try {
      const modelLibrary = copyStudioBg3dBundledEnvironmentLibraryEntries();
      const host = createHost({ modelLibrary });
      render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

      const grid = within(screen.getByTestId("scene-assistant-env-asset-grid"));
      const apartmentButton = grid.getByRole("button", { name: /한국 현대 원룸·아파트 거실/u });
      expect(apartmentButton.getAttribute("data-bg3d-delivery-tier")).toBe("mobile");
      expect(apartmentButton.getAttribute("data-bg3d-delivery-url")).toBe(
        "/assets/3d/environments/hero-v1/kr_modern_apartment_living-mobile.glb",
      );
      expect(
        screen.getByTestId("bg3d-asset-mobile-savings-ts-bg3d-hero-v1-kr_modern_apartment_living-desktop").textContent,
      ).toContain("모바일 경량 -43.4% (2.0 MB 절감)");

      fireEvent.click(apartmentButton);
      expect(host.addCustomModelToScene).toHaveBeenCalledWith(
        "ts-bg3d-hero-v1-kr_modern_apartment_living-mobile",
      );
      await waitFor(() =>
        expect(screen.getByTestId("studio-bg3d-scene-assistant").getAttribute("data-step")).toBe("arrange"),
      );
    } finally {
      Object.defineProperty(window, "innerWidth", { value: originalWidth, configurable: true });
    }
  });
});
