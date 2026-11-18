// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { MemoryRouter, useLocation, useRoutes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { creatorRoutes } from "./creator.routes";

import type { StudioEditorRouteResolution } from "@/domains/creator/studio-router/studio-route-manifest";

const probe = vi.hoisted(() => ({ mounts: 0 }));

vi.mock("@/domains/creator/studio-router/useStudioI18nPriorityLoading", () => ({ useStudioI18nPriorityLoading: () => undefined }));
vi.mock("@/domains/creator/scene-3d/StudioPoserPage", () => ({
  StudioPoserPage: () => <div data-testid="standalone-poser">독립 데생 인형</div>,
}));
vi.mock("@/domains/creator/studio-router/routes/StudioEditorRoute", async () => {
  const { useEffect, useState } = await import("react");
  const { useLocation: useEditorLocation, useNavigate } = await import("react-router-dom");
  const { studio2dSurfaceNavigationHref } = await import("@/domains/creator/studio-workspace-route");
  function EditorProbe({ resolution }: { readonly resolution: StudioEditorRouteResolution }) {
    const [strokes, setStrokes] = useState(0);
    const location = useEditorLocation();
    const navigate = useNavigate();
    useEffect(() => { probe.mounts += 1; }, []);
    return (
      <div data-testid="editor" data-surface={resolution.workspaceRoute.surface}>
        <output aria-label="문서 획 수">{strokes}</output>
        <button type="button" onClick={() => setStrokes((count) => count + 1)}>획 추가</button>
        <button type="button" onClick={() => navigate(studio2dSurfaceNavigationHref(resolution.workspaceRoute, "poser", location.search))}>VRM 열기</button>
        <button type="button" onClick={() => navigate(-1)}>뒤로</button>
        <button type="button" onClick={() => navigate(1)}>앞으로</button>
      </div>
    );
  }
  return { StudioEditorRoute: EditorProbe };
});

function ActualCreatorRoutes() {
  const content = useRoutes([...creatorRoutes]);
  const location = useLocation();
  return (
    <>
      <output aria-label="현재 주소">{location.pathname}{location.search}</output>
      <Suspense fallback={<p>라우트 로딩</p>}>{content}</Suspense>
    </>
  );
}

beforeEach(() => { probe.mounts = 0; });
afterEach(cleanup);

describe("실제 앱 라우트의 문서 VRM과 독립 포저 경계", () => {
  it.each([
    ["/studio/canvas", "/studio/canvas/poser"],
    ["/studio/work/work-a/canvas", "/studio/work/work-a/poser"],
    ["/studio/remix/source-a/canvas", "/studio/remix/source-a/poser"],
  ])("%s에서 VRM과 뒤로·앞으로 이동해도 같은 문서를 유지한다", async (canvasPath, poserPath) => {
    const search = "?preset=illustration&room=team-a";
    render(<MemoryRouter initialEntries={[`${canvasPath}${search}`]}><ActualCreatorRoutes /></MemoryRouter>);
    await screen.findByTestId("editor");
    fireEvent.click(screen.getByRole("button", { name: /^획 추가$/u }));
    fireEvent.click(screen.getByRole("button", { name: /^VRM 열기$/u }));
    await waitFor(() => expect(screen.getByLabelText("현재 주소").textContent).toBe(`${poserPath}${search}`));
    expect(screen.getByTestId("editor").dataset.surface).toBe("poser");
    expect(screen.queryByTestId("standalone-poser")).toBeNull();
    expect(screen.getByLabelText("문서 획 수").textContent).toBe("1");
    expect(probe.mounts).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: /^뒤로$/u }));
    await waitFor(() => expect(screen.getByLabelText("현재 주소").textContent).toBe(`${canvasPath}${search}`));
    expect(screen.getByTestId("editor").dataset.surface).toBe("canvas");
    expect(screen.getByLabelText("문서 획 수").textContent).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: /^앞으로$/u }));
    await waitFor(() => expect(screen.getByLabelText("현재 주소").textContent).toBe(`${poserPath}${search}`));
    expect(screen.getByTestId("editor").dataset.surface).toBe("poser");
    expect(screen.getByLabelText("문서 획 수").textContent).toBe("1");
    expect(probe.mounts).toBe(1);
  });

  it("/studio/poser의 독립 데생 인형과 starter 진입은 보존한다", async () => {
    const href = "/studio/poser?starter=action-pose-rig";
    render(<MemoryRouter initialEntries={[href]}><ActualCreatorRoutes /></MemoryRouter>);
    await screen.findByTestId("standalone-poser");
    expect(screen.getByLabelText("현재 주소").textContent).toBe(href);
    expect(screen.queryByTestId("editor")).toBeNull();
    expect(probe.mounts).toBe(0);
  });
});
