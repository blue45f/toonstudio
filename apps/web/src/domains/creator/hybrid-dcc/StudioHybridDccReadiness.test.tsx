// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioHybridDccRouteColdEntryCover } from "../studio-cuttoon-editor/StudioHybridDccRouteColdEntryCover";
import { StudioHybridDccPanel } from "./StudioHybridDccPanel";
import { StudioHybridDccViewport } from "./StudioHybridDccViewportCore";
import { createStudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { readonly children?: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useThree: () => ({ gl: {}, scene: {} }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudioHybridDcc cold-entry cover & WebGL2 readiness alignment", () => {
  it("콜드 진입 시 StudioHybridDccRouteColdEntryCover가 2D 에디터를 즉시 덮고 캔버스 복귀를 지원한다", () => {
    const onClose = vi.fn();
    render(
      <StudioHybridDccRouteColdEntryCover
        label="전문 3D 제작 도구를 여는 중입니다."
        detail="편집 권한과 로컬 복구 범위는 확인됐습니다."
        onClose={onClose}
      />,
    );

    const cover = document.querySelector('[data-studio-hybrid-dcc-cold-cover="true"]');
    expect(cover).not.toBeNull();
    expect(cover?.textContent).toContain("전문 3D 제작 도구를 여는 중입니다.");

    fireEvent.click(screen.getByRole("button", { name: "캔버스로 돌아가기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("StudioHybridDccViewport가 WebGL2 미지원 시 error 배지를 표시하고 비동작 3D 보기·기즈모 툴바를 숨긴다", () => {
    const workspace = createStudioHybridDccWorkspace("dcc-readiness-test");
    const view = render(
      <StudioHybridDccViewport
        workspace={workspace}
        onSelectAsset={vi.fn()}
        webglAvailable={false}
      />,
    );

    const badge = screen.getByTestId("studio-hybrid-dcc-engine-status");
    expect(badge.getAttribute("data-engine-state")).toBe("error");
    expect(screen.queryByRole("group", { name: "표준 보기와 화면 맞춤" })).toBeNull();

    view.rerender(
      <StudioHybridDccViewport
        workspace={workspace}
        onSelectAsset={vi.fn()}
        webglAvailable
      />,
    );
    expect(screen.getByTestId("studio-hybrid-dcc-engine-status").getAttribute("data-engine-state")).toBe(
      "ready",
    );
    expect(screen.getByRole("group", { name: "표준 보기와 화면 맞춤" })).toBeDefined();
  });

  it("StudioHybridDccPanel이 WebGL2 미지원 환경에서 하단 로그에 모순된 '준비됨' 대신 '3D 미리보기 대기'를 표시한다", async () => {
    render(
      <StudioHybridDccPanel
        workspaceDocumentId="dcc-panel-no-webgl-doc"
        onWorkspaceChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      const log = document.querySelector('[data-studio-hybrid-dcc-log="true"]');
      expect(log?.textContent).toContain("3D 미리보기 대기");
    });
    const log = document.querySelector('[data-studio-hybrid-dcc-log="true"]');
    expect(log?.textContent).not.toContain("준비됨 · 큐브를 추가하거나");
  });
});
