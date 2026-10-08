// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { createProductionDemoProject } from "./production-demo";
import { ProductionProjectCoverSettings } from "./ProductionProjectCoverSettings";

afterEach(() => cleanup());

function aggregateWith(coverImageUrl: string | null): ProductionProjectAggregate {
  return { ...createProductionDemoProject(), coverImageUrl };
}

describe("ProductionProjectCoverSettings", () => {
  it("표지가 있으면 미리보기를 보여주고 지우면 set-project-cover(null)를 보낸다", async () => {
    const execute = vi.fn(async () => {});
    render(
      <ProductionProjectCoverSettings
        aggregate={aggregateWith("https://example.test/cover.png")}
        execute={execute}
        canEdit
      />,
    );
    const preview = document.querySelector("img");
    expect(preview?.getAttribute("src")).toBe("https://example.test/cover.png");
    fireEvent.click(screen.getByRole("button", { name: "표지 지우기" }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toEqual({ type: "set-project-cover", coverImageUrl: null });
  });

  it("표지가 없을 때 입력한 주소를 저장하면 set-project-cover 명령을 보낸다", async () => {
    const execute = vi.fn(async () => {});
    render(
      <ProductionProjectCoverSettings aggregate={aggregateWith(null)} execute={execute} canEdit />,
    );
    const input = screen.getByLabelText("표지 이미지 주소");
    fireEvent.change(input, { target: { value: "https://example.test/new-cover.png" } });
    fireEvent.click(screen.getByRole("button", { name: "표지 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toEqual({
      type: "set-project-cover",
      coverImageUrl: "https://example.test/new-cover.png",
    });
  });

  it("https도 data:image도 아닌 주소는 명령 없이 검증 오류를 보인다", () => {
    const execute = vi.fn(async () => {});
    render(
      <ProductionProjectCoverSettings aggregate={aggregateWith(null)} execute={execute} canEdit />,
    );
    fireEvent.change(screen.getByLabelText("표지 이미지 주소"), {
      target: { value: "http://example.test/cover.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "표지 저장" }));
    expect(screen.getByRole("alert").textContent).toContain("https://");
    expect(execute).not.toHaveBeenCalled();
  });

  it("편집 권한이 없으면 입력과 저장 버튼을 보이지 않는다", () => {
    render(
      <ProductionProjectCoverSettings
        aggregate={aggregateWith("https://example.test/cover.png")}
        execute={vi.fn(async () => {})}
        canEdit={false}
      />,
    );
    expect(screen.queryByLabelText("표지 이미지 주소")).toBeNull();
    expect(screen.queryByRole("button", { name: "표지 저장" })).toBeNull();
    expect(screen.queryByRole("button", { name: "표지 지우기" })).toBeNull();
  });
});
