// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import { StudioBg3dAssetLibraryPanelWithPresets } from "./StudioBg3dAssetLibraryPanelWithPresets";
import type { StudioBg3dBlenderImportPanel } from "./StudioBg3dBlenderImportPanel";
import type { StudioBg3dModelImportActions } from "./studio-bg3d-editor-model-import-actions";

vi.mock("./useStudioBg3dAssetRights", () => ({ useStudioBg3dAssetRights: () => ({ views: new Map(), state: "ready" }) }));
vi.mock("./StudioBg3dAuthoredEnvironmentCyclesPanel", () => ({ StudioBg3dAuthoredEnvironmentCyclesPanel: () => null }));
vi.mock("./StudioBg3dBundleThemePackPanel", () => ({ StudioBg3dBundleThemePackPanel: () => null }));
vi.mock("./StudioBg3dEssentialPosePropPanel", () => ({ StudioBg3dEssentialPosePropPanel: () => null }));
vi.mock("./StudioReferenceRebuildPresets", () => ({ StudioReferenceRebuildPresets: () => null }));
vi.mock("./StudioBg3dBlenderImportPanel", () => ({
  StudioBg3dBlenderImportPanel: ({ onFile, onImported, disabled, importing }: ComponentProps<typeof StudioBg3dBlenderImportPanel>) => (
    <button type="button" disabled={disabled || importing} onClick={async () => {
      if (await onFile(new File(["glTF"], "local.glb", { type: "model/gltf-binary" }), new AbortController().signal)) onImported?.();
    }}>로컬 변환 전달</button>
  ),
}));

afterEach(cleanup);
function fixture(onImportFiles: StudioBg3dModelImportActions["importModelFiles"]): ComponentProps<typeof StudioBg3dAssetLibraryPanelWithPresets> {
  return { entries: [], libraryStatus: "ready", deletingModelId: null, isUploading: false, importProgress: null,
    isRestoringScene: false, deviceProfileLabel: "데스크톱", onFileChange: vi.fn(), onCancelImport: vi.fn(),
    onAdd: vi.fn(), onDelete: vi.fn(), onImportFiles, localBlendScopeKey: "page-a/background-a" };
}

describe("로컬 Blender와 기존 권리·AI 모델 가져오기 접점", () => {
  it("파일 입력을 합성하지 않고 같은 폼의 권리·AI 답과 취소 신호를 정규 가져오기에 보낸다", async () => {
    const onImport = vi.fn<StudioBg3dModelImportActions["importModelFiles"]>(async () => true);
    const props = fixture(onImport);
    render(<StudioBg3dAssetLibraryPanelWithPresets {...props} />);
    fireEvent.click(screen.getByText("이용 권리 기록"));
    fireEvent.click(screen.getByRole("radio", { name: /직접 제작/u }));
    fireEvent.click(screen.getByRole("radio", { name: "AI로 만듦" }));
    fireEvent.click(screen.getByRole("radio", { name: "금지" }));
    fireEvent.click(screen.getByRole("button", { name: "로컬 변환 전달" }));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(onImport).toHaveBeenCalledWith([expect.objectContaining({ name: "local.glb", type: "model/gltf-binary" })],
      expect.objectContaining({ status: "owned", aiGenerated: "yes", aiTraining: "prohibited" }), expect.any(AbortSignal));
    expect(props.onFileChange).not.toHaveBeenCalled();
    await waitFor(() => expect((screen.getByRole("radio", { name: "AI로 만듦" }) as HTMLInputElement).checked).toBe(false));
  });

  it("구매 권리 입력이 불완전하면 변환 실행을 막고 라이선스 입력 뒤 허용한다", () => {
    render(<StudioBg3dAssetLibraryPanelWithPresets {...fixture(async () => true)} />);
    fireEvent.click(screen.getByText("이용 권리 기록"));
    fireEvent.click(screen.getByRole("radio", { name: /구매·허가/u }));
    const button = screen.getByRole("button", { name: "로컬 변환 전달" });
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(/라이선스·구매처 이름/u), { target: { value: "직접 구매한 라이선스" } });
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("검증 거부는 AI 답을 소비하지 않고 다음 성공한 가져오기 뒤에만 초기화한다", async () => {
    const onImport = vi.fn<StudioBg3dModelImportActions["importModelFiles"]>().mockResolvedValueOnce(false).mockResolvedValue(true);
    render(<StudioBg3dAssetLibraryPanelWithPresets {...fixture(onImport)} />);
    fireEvent.click(screen.getByText("이용 권리 기록"));
    fireEvent.click(screen.getByRole("radio", { name: "AI 아님" }));
    fireEvent.click(screen.getByRole("button", { name: "로컬 변환 전달" }));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect((screen.getByRole("radio", { name: "AI 아님" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "로컬 변환 전달" }));
    await waitFor(() => expect((screen.getByRole("radio", { name: "AI 아님" }) as HTMLInputElement).checked).toBe(false));
    expect(onImport).toHaveBeenCalledTimes(2);
  });
});
