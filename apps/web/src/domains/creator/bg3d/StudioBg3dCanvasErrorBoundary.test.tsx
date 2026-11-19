// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { expect, it, vi } from "vitest";

import { StudioBg3dCanvasErrorBoundary } from "./StudioBg3dCanvasErrorBoundary";

class EditorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() { return this.state.failed ? <p>원고 편집기 중단</p> : this.props.children; }
}

function Scene({ broken }: { broken: boolean }) {
  if (broken) throw new Error("장면 재질을 준비하지 못했습니다");
  return <p>교실 장면</p>;
}

it("장면에서 던진 예외는 3D 편집기로 전달하고 새 캔버스만 다시 그린다", () => {
  const failed = vi.fn();
  const editor = (key: string, broken: boolean) => <EditorBoundary>
    <p>원고</p>
    <StudioBg3dCanvasErrorBoundary resetKey={key} backend="webgpu" onRendererError={failed}>
      <Scene broken={broken} />
    </StudioBg3dCanvasErrorBoundary>
  </EditorBoundary>;
  const view = render(editor("scene#1", true), { onCaughtError: () => undefined });
  expect(screen.queryByText("원고 편집기 중단")).toBeNull();
  expect(screen.getByText("원고").isConnected).toBe(true);
  expect(failed).toHaveBeenCalledExactlyOnceWith("webgpu", "장면 재질을 준비하지 못했습니다");
  view.rerender(editor("scene#1", false));
  expect(screen.queryByText("교실 장면")).toBeNull();
  view.rerender(editor("scene#2", false));
  expect(screen.getByText("교실 장면").isConnected).toBe(true);
});
