// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { MemoryRouter, useRoutes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpacePage as PageRoot } from "@/domains/creator/virtual-space/StudioVirtualSpacePageRoot";
import { VirtualSpaceExperience } from "@/domains/creator/virtual-space/StudioVirtualSpacePage";
import { creatorRoutes } from "./creator.routes";

vi.mock("@/domains/creator/virtual-space/StudioVirtualSpacePageRoot", () => {
  const shell = vi.fn(() => <div>가상 작업실 입장</div>);
  return { StudioVirtualSpacePage: shell, default: shell };
});

function CreatorRoute() {
  return useRoutes([...creatorRoutes]);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("가상 작업실 진입 경로", () => {
  it.each([
    { label: "개인 작업실", path: "/studio/space", personal: true, project: "virtual-demo:personal-home" },
    { label: "프로젝트 작업실", path: "/studio/p/project-01/space", personal: undefined, project: undefined },
  ])("$label 주소에서 입장 화면에 실제 무대를 연결한다", async ({ path, personal, project }) => {
    render(<MemoryRouter initialEntries={[path]}><Suspense><CreatorRoute /></Suspense></MemoryRouter>);
    await screen.findByText("가상 작업실 입장");
    const props = vi.mocked(PageRoot).mock.lastCall?.[0];
    expect(props?.Experience).toBe(VirtualSpaceExperience);
    expect(props?.personal).toBe(personal);
    expect(props?.projectIdOverride).toBe(project);
  });
});
