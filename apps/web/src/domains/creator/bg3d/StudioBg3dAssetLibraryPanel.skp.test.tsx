// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dAssetLibraryPanel } from "./StudioBg3dAssetLibraryPanel";
import { STUDIO_BG3D_SKP_WAREHOUSE_NOTICE } from "./studio-bg3d-skp-import-copy";
import { studioBg3dSkpImportSession } from "./studio-bg3d-skp-import-session";
import { createSkpReportFixture } from "./studio-bg3d-skp.test-fixture";

import type { ComponentProps } from "react";

// 자산 라이브러리 패널이 SketchUp 가져오기를 어떻게 품는지(권리 관문 공유, 안내·결과 화면 마운트)를 증명한다.
// 변환 자체와 결과 카드의 세부는 StudioBg3dSkpImportPanel.test.tsx 와 변환 테스트가 맡는다.

type PanelProps = ComponentProps<typeof StudioBg3dAssetLibraryPanel>;

function panelProps(overrides: Partial<PanelProps> = {}): PanelProps {
  return {
    entries: [],
    libraryStatus: "ready",
    deletingModelId: null,
    isUploading: false,
    importProgress: null,
    isRestoringScene: false,
    deviceProfileLabel: "데스크톱",
    onFileChange: vi.fn(),
    onCancelImport: vi.fn(),
    onAdd: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  studioBg3dSkpImportSession.clearResults();
});

describe("StudioBg3dAssetLibraryPanel with SketchUp import", () => {
  it("explains the 3D Warehouse terms inside the rights record that every import goes through", () => {
    render(<StudioBg3dAssetLibraryPanel {...panelProps()} />);
    fireEvent.click(screen.getByText("이용 권리 기록"));
    const group = screen.getByRole("radiogroup", { name: "가져올 3D 모델 이용 권리" });
    const section = group.parentElement;
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText(STUDIO_BG3D_SKP_WAREHOUSE_NOTICE)).toBeTruthy();
    expect(STUDIO_BG3D_SKP_WAREHOUSE_NOTICE).toContain("3D Warehouse");
    // 확인 전이 기본값이라, 사용자가 권리를 밝히기 전에는 상업 이용이 보류된 채로만 가져온다.
    expect(screen.getByRole("radio", { name: /확인 전/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("hands an .skp file to the same rights-bound import as every other format", () => {
    const onFileChange = vi.fn();
    render(<StudioBg3dAssetLibraryPanel {...panelProps({ onFileChange })} />);
    const input = screen.getByLabelText("3D 모델 및 연결 파일 선택");
    expect(input.getAttribute("accept")).toContain(".skp");

    fireEvent.click(screen.getByText("이용 권리 기록"));
    fireEvent.click(screen.getByRole("radio", { name: /구매·허가/ }));
    // 라이선스 이름이 없으면 .skp 도 가져올 수 없다 — 새 관문이 아니라 기존 관문이다.
    expect(screen.getByRole("button", { name: "3D 모델 및 연결 파일 가져오기" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(/라이선스·구매처 이름/), { target: { value: "3D Warehouse 게시자 허가" } });
    fireEvent.click(screen.getByLabelText("상업 작품에 사용할 수 있음"));

    fireEvent.change(input, { target: { files: [new File([new Uint8Array(8)], "room.skp")] } });
    expect(onFileChange).toHaveBeenCalledOnce();
    expect(onFileChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "licensed", commercialUse: true, licenseName: "3D Warehouse 게시자 허가" }),
    );
  });

  it("mounts the SketchUp guide and tells the import that a screen is present to answer the unit question", () => {
    expect(studioBg3dSkpImportSession.hasHost()).toBe(false);
    const view = render(<StudioBg3dAssetLibraryPanel {...panelProps()} />);
    expect(screen.getByText("SketchUp(.skp) 가져오기 안내")).toBeTruthy();
    expect(studioBg3dSkpImportSession.hasHost()).toBe(true);
    view.unmount();
    expect(studioBg3dSkpImportSession.hasHost()).toBe(false);
  });

  it("shows the conversion result that the shared store publishes, without any prop from the host", () => {
    render(<StudioBg3dAssetLibraryPanel {...panelProps()} />);
    expect(screen.queryByRole("region", { name: "SketchUp 변환 결과" })).toBeNull();
    act(() => {
      studioBg3dSkpImportSession.publishResults([{
        sourceName: "room.skp",
        report: createSkpReportFixture(),
        status: "imported",
        reason: null,
        metadata: "saved",
      }]);
    });
    const results = screen.getByRole("region", { name: "SketchUp 변환 결과" });
    expect(within(results).getByRole("article", { name: "room.skp" })).toBeTruthy();
  });

  it("keeps the other-format guidance honest about what the SketchUp conversion does and does not do", () => {
    render(<StudioBg3dAssetLibraryPanel {...panelProps()} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("SketchUp .skp 파일도 브라우저 안에서 GLB로 변환해 가져오며");
    // 예전 안내가 약속하던 문구("일부 레거시 .skp는 변환에 실패할 수 있는데")는 오류 안내가 대신하므로 남기지 않는다.
    expect(text).not.toContain("일부 레거시 .skp는 변환에 실패할 수 있는데");
  });
});
