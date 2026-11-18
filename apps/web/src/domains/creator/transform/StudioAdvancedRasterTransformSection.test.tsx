// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as runnerMod from "../filter/studio-raster-dataurl-runner";

import { StudioAdvancedRasterTransformSection } from "./StudioAdvancedRasterTransformSection";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function openAllDisclosures(container: HTMLElement): void {
  for (const d of container.querySelectorAll("details")) {
    d.open = true;
  }
}

describe("StudioAdvancedRasterTransformSection", () => {
  it("기본 상태에서 두 변형 섹션이 모두 접혀 있으며 등변사다리꼴과 실제 픽셀 러너가 동작한다", async () => {
    const onApplyCornerPin = vi.fn();
    const onCommitImageSrc = vi.fn();
    vi.spyOn(runnerMod, "runStudioRasterDataUrlProcessor").mockImplementation(
      async (_src, processor) => {
        const out = processor(new Uint8ClampedArray(4 * 4 * 4).fill(200), 4, 4);
        return `data:image/png;base64,CORNER_${out.width}x${out.height}`;
      },
    );

    const { container } = render(
      <StudioAdvancedRasterTransformSection
        imageWidth={101}
        imageHeight={81}
        imageSrc="data:image/png;base64,SRC"
        onCommitImageSrc={onCommitImageSrc}
        onApplyCornerPin={onApplyCornerPin}
      />,
    );

    const detailsList = [...container.querySelectorAll("details")];
    expect(detailsList).toHaveLength(2);
    expect(detailsList.every((d) => !d.open)).toBe(true);

    openAllDisclosures(container);
    fireEvent.click(screen.getByRole("button", { name: "등변사다리꼴" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "좌상단 X" }), {
      target: { value: "20" },
    });
    expect(
      (screen.getByRole("spinbutton", { name: "우상단 X" }) as HTMLInputElement).value,
    ).toBe("80");

    fireEvent.click(screen.getByRole("button", { name: "원근 변형 적용" }));
    expect(onApplyCornerPin).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(onCommitImageSrc).toHaveBeenCalledWith("data:image/png;base64,CORNER_4x4"),
    );
  });

  it("자가교차(나비넥타이) 좌표가 입력되면 경고를 표시하고 원근 변형 적용 버튼을 비활성화한다", () => {
    const { container } = render(
      <StudioAdvancedRasterTransformSection imageWidth={100} imageHeight={100} />,
    );
    openAllDisclosures(container);

    fireEvent.change(screen.getByRole("spinbutton", { name: "좌상단 Y" }), {
      target: { value: "95" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "우상단 Y" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "우하단 Y" }), {
      target: { value: "95" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "좌하단 Y" }), {
      target: { value: "0" },
    });

    expect(screen.getByText("교차·오목 사각형 경고")).toBeDefined();
    expect(
      (screen.getByRole("button", { name: "원근 변형 적용" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("임의의 (행, 열) 격자 제어점을 선택·이동하고 메쉬 변형 픽셀 커밋을 실행한다", async () => {
    const onApplyMeshTransform = vi.fn();
    const onCommitImageSrc = vi.fn();
    vi.spyOn(runnerMod, "runStudioRasterDataUrlProcessor").mockImplementation(
      async (_src, processor) => {
        const out = processor(new Uint8ClampedArray(6 * 6 * 4).fill(180), 6, 6);
        return `data:image/png;base64,MESH_${out.width}x${out.height}`;
      },
    );

    const { container } = render(
      <StudioAdvancedRasterTransformSection
        imageWidth={120}
        imageHeight={90}
        imageSrc="data:image/png;base64,SRC"
        onCommitImageSrc={onCommitImageSrc}
        onApplyMeshTransform={onApplyMeshTransform}
      />,
    );
    openAllDisclosures(container);

    fireEvent.change(screen.getByRole("spinbutton", { name: "메쉬 행 수" }), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "메쉬 열 수" }), {
      target: { value: "4" },
    });

    // (4행=index 3, 3열=index 2) 제어점 선택 후 X/Y 이동
    fireEvent.change(screen.getByRole("combobox", { name: "선택 제어점 행" }), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "선택 제어점 열" }), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "선택 제어점 X" }), {
      target: { value: "88" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "선택 제어점 Y" }), {
      target: { value: "66" },
    });

    fireEvent.click(screen.getByRole("button", { name: "메쉬 변형 적용" }));
    expect(onApplyMeshTransform).toHaveBeenCalledTimes(1);
    const lattice = onApplyMeshTransform.mock.calls[0]?.[0];
    const editedNode = lattice.nodes[3 * 4 + 2];
    expect(editedNode).toMatchObject({ row: 3, col: 2, x: 88, y: 66 });

    await waitFor(() =>
      expect(onCommitImageSrc).toHaveBeenCalledWith("data:image/png;base64,MESH_6x6"),
    );
  });
});
