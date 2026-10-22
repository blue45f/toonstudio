// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PwaInstallNudgeHost } from "./pwa-install-nudge-host";

function hostElement(path: string) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <PwaInstallNudgeHost />
    </MemoryRouter>
  );
}

const fixture = vi.hoisted(() => ({
  snapshot: { status: "unavailable" },
  loadUi: vi.fn(),
}));
vi.mock("../lib/pwa-install-store", () => ({
  subscribePwaInstall: () => () => {},
  getPwaInstallSnapshot: () => fixture.snapshot,
  getPwaInstallServerSnapshot: () => fixture.snapshot,
}));
vi.mock("./pwa-install-nudge", () => {
  fixture.loadUi();
  return { PwaInstallNudge: () => <aside>Installation is available</aside> };
});
afterEach(cleanup);

describe("install UI download boundary", () => {
  it("does not import install UI while a prompt is unavailable", () => {
    fixture.snapshot = { status: "unavailable" };
    const { container } = render(hostElement("/"));
    expect(container.innerHTML).toBe("");
    expect(fixture.loadUi).not.toHaveBeenCalled();
  });

  it("loads when a prompt becomes available and removes the UI when it is consumed", async () => {
    fixture.snapshot = { status: "unavailable" };
    const view = render(hostElement("/"));
    fixture.snapshot = { status: "available" };
    view.rerender(hostElement("/"));
    expect(await screen.findByText("Installation is available")).toBeTruthy();
    expect(fixture.loadUi).toHaveBeenCalledTimes(1);
    fixture.snapshot = { status: "installed" };
    view.rerender(hostElement("/"));
    expect(view.container.innerHTML).toBe("");
  });

  it("발표 화면에서는 설치가 가능해도 UI를 내려받지 않고 렌더하지 않는다", () => {
    fixture.loadUi.mockClear();
    fixture.snapshot = { status: "available" };
    const { container } = render(hostElement("/ir/present"));
    expect(container.innerHTML).toBe("");
    expect(fixture.loadUi).not.toHaveBeenCalled();
  });

  it("일반 공개 경로에서는 기존대로 설치 UI를 렌더한다", async () => {
    fixture.snapshot = { status: "available" };
    render(hostElement("/ir"));
    expect(await screen.findByText("Installation is available")).toBeTruthy();
  });
});
