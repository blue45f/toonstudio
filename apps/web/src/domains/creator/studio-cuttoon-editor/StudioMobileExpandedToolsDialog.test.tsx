// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { StudioMobileExpandedToolsDialog } from "./StudioMobileExpandedToolsDialog";

const loadDrawer = vi.hoisted(() => vi.fn());
vi.mock("../studio-intent-lazy-loader", () => ({
  createStudioIntentLazyLoader: () => ({ load: loadDrawer }),
}));
afterEach(() => { cleanup(); loadDrawer.mockReset(); });

it("다운로드 오류 후 같은 모바일 작업 공간에서 다시 시도해 도구를 연다", async () => {
  const onClose = vi.fn();
  loadDrawer.mockRejectedValueOnce(new Error("temporary module failure")).mockResolvedValueOnce({
    StudioExpandedToolsDrawer: ({ projectId }: { projectId: string }) => <p>{projectId}</p>,
  });
  const before = window.location.href;
  render(<StudioMobileExpandedToolsDialog projectId="room-tool-workspace" onClose={onClose} />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByText("room-tool-workspace")).toBeTruthy();
  expect(loadDrawer).toHaveBeenCalledTimes(2);
  expect(window.location.href).toBe(before);
  expect(onClose).not.toHaveBeenCalled();
});
