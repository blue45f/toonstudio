// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as runnerMod from "./studio-raster-dataurl-runner";
import { StudioLineCleanupAndDustSection } from "./StudioLineCleanupAndDustSection";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function openAllDisclosures(container: HTMLElement): void {
  for (const d of container.querySelectorAll("details")) {
    d.open = true;
  }
}

describe("StudioLineCleanupAndDustSection", () => {
  it("기본 상태에서 모든 세부 섹션이 접혀 Calm 예산(4개 요약 헤더)을 지킨다", () => {
    const { container } = render(<StudioLineCleanupAndDustSection />);
    const detailsList = [...container.querySelectorAll("details")];
    expect(detailsList).toHaveLength(4);
    expect(detailsList.every((d) => !d.open)).toBe(true);
    expect(screen.getByText("분위기 색감 맞추기")).toBeDefined();
  });

  it("imageSrc와 onCommitImageSrc가 주어지면 먼지 제거·선화 정리·입체 팽창·분위기 색감이 실제 픽셀 러너를 실행한다", async () => {
    const onCommitImageSrc = vi.fn();
    vi.spyOn(runnerMod, "runStudioRasterDataUrlProcessor").mockImplementation(
      async (_src, processor) => {
        const sample = new Uint8ClampedArray([
          255, 255, 255, 255,
          20, 20, 20, 255,
          120, 140, 180, 255,
          0, 0, 0, 0,
        ]);
        const out = processor(sample, 2, 2);
        return `data:image/png;base64,LEN_${out.data.length}_A1_${out.data[3]}`;
      },
    );

    const { container } = render(
      <StudioLineCleanupAndDustSection
        imageSrc="data:image/png;base64,ORIGIN"
        onCommitImageSrc={onCommitImageSrc}
      />,
    );
    openAllDisclosures(container);

    fireEvent.click(screen.getByRole("button", { name: "먼지 마스크 표시" }));
    await waitFor(() => expect(onCommitImageSrc).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "먼지 제거 적용" }));
    await waitFor(() => expect(onCommitImageSrc).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "휘도→투명도 변환" }));
    await waitFor(() => expect(onCommitImageSrc).toHaveBeenCalledTimes(3));
    expect(onCommitImageSrc.mock.calls[2]?.[0]).toContain("_A1_0");

    fireEvent.click(screen.getByRole("button", { name: "선 색 변경 적용" }));
    await waitFor(() => expect(onCommitImageSrc).toHaveBeenCalledTimes(4));

    fireEvent.click(screen.getByRole("button", { name: "선 폭 수정 적용" }));
    await waitFor(() => expect(onCommitImageSrc).toHaveBeenCalledTimes(5));

    fireEvent.click(screen.getByRole("button", { name: "입체 팽창 적용" }));
    await waitFor(() => expect(onCommitImageSrc).toHaveBeenCalledTimes(6));

    fireEvent.click(screen.getByRole("button", { name: "수묵 담채" }));
    fireEvent.click(screen.getByRole("button", { name: "분위기 색감 적용" }));
    await waitFor(() => expect(onCommitImageSrc).toHaveBeenCalledTimes(7));
  });

  it("5-스톱 그라데이션 추출 콜백을 전달한다", () => {
    const onExtractGradientStops = vi.fn();
    const { container } = render(
      <StudioLineCleanupAndDustSection onExtractGradientStops={onExtractGradientStops} />,
    );
    openAllDisclosures(container);

    fireEvent.click(screen.getByRole("button", { name: "세피아" }));
    fireEvent.click(screen.getByRole("button", { name: "그라데이션 추출" }));
    expect(onExtractGradientStops).toHaveBeenCalledTimes(1);
    expect(onExtractGradientStops.mock.calls[0]?.[0]).toHaveLength(5);
    expect(onExtractGradientStops.mock.calls[0]?.[1]).toBe("sepia");
  });
});
