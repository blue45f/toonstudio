// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioImmersiveHubPage } from "./StudioImmersiveHubPage";
import { STUDIO_IMMERSIVE_STAGES } from "./studio-immersive-workflows";

vi.mock("@/domains/creator/xr-webtoon/XrWebtoonStudioHost", () => ({
  XrWebtoonStudioHost: () => <p>xr host</p>,
}));

vi.mock("./SpatialWebtoonReaderLauncher", () => ({
  SpatialWebtoonReaderLauncher: () => <p>reader launcher</p>,
}));

vi.mock("./studio-immersive-capabilities", async (importOriginal) => {
  const original = await importOriginal<typeof import("./studio-immersive-capabilities")>();
  return {
    ...original,
    inspectStudioImmersiveCapabilities: vi.fn().mockRejectedValue(new Error("no probe")),
  };
});

afterEach(cleanup);

describe("StudioImmersiveHubPage", () => {
  it("lays out the production flow as ordered stages with their next actions", async () => {
    render(
      <MemoryRouter initialEntries={["/studio/immersive"]}>
        <StudioImmersiveHubPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "공간에서 읽고 만들기" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "도구 목록이 아니라 하나의 제작 동선" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: /공간 작품 만들기/ }));
    const flow = screen.getByRole("region", { name: "도구 목록이 아니라 하나의 제작 동선" });
    const stages = within(flow).getAllByRole("heading", { level: 3 });
    expect(stages).toHaveLength(STUDIO_IMMERSIVE_STAGES.length);
    expect(within(flow).getAllByRole("link").length).toBeGreaterThanOrEqual(STUDIO_IMMERSIVE_STAGES.length);
    fireEvent.click(screen.getByRole("link", { name: "기기 지원 확인", exact: true }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("link", { name: /새 프로젝트 시작/u }).getAttribute("href")).toBe("/studio/new");
  });
});
