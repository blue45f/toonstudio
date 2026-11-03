// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCompetitorCapabilityPanel } from "./StudioCompetitorCapabilityPanel";

afterEach(cleanup);

describe("StudioCompetitorCapabilityPanel", () => {
  it("shows repository completion without fabricating external validation", () => {
    const { container } = render(<StudioCompetitorCapabilityPanel locale="ko" />);

    expect(screen.getByText("전문 제작 기능 구현·검증 원장")).toBeTruthy();
    expect(screen.getByText("45")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("외부 검증 대기 12건 보기")).toBeTruthy();
    expect(container.querySelector("section")?.getAttribute("data-replacement-claim-allowed"))
      .toBe("false");
  });

  it("keeps the external validation list available to assistive technology", () => {
    render(<StudioCompetitorCapabilityPanel locale="en" />);

    expect(screen.getByText("Show 12 pending external validations")).toBeTruthy();
    expect(screen.getByText(/Golden PSD corpus round-trip/u)).toBeTruthy();
    expect(screen.getByText(/professional creator must complete/u)).toBeTruthy();
  });

  it("filters familiar competitor workflows and triggers 1-click workspace selection", () => {
    const onSelectWorkspacePreset = vi.fn();
    render(
      <StudioCompetitorCapabilityPanel
        locale="ko"
        onSelectWorkspacePreset={onSelectWorkspacePreset}
      />,
    );

    const searchInput = screen.getByRole("searchbox", {
      name: "익숙한 도구 또는 작업 검색",
    });
    fireEvent.change(searchInput, { target: { value: "SketchUp" } });

    expect(screen.getByText("SketchUp · ACON3D · Snaptoon")).toBeTruthy();
    const selectButton = screen.getByRole("button", {
      name: "3D 포즈·배경 배치 선택",
    });
    fireEvent.click(selectButton);

    expect(onSelectWorkspacePreset).toHaveBeenCalledWith("pose-3d");
    expect(screen.queryByRole("button", { name: "3D 포즈·배경 사용 중" })).toBeNull();
    expect(selectButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows completion only from the confirmed workspace and disables disconnected actions", () => {
    const { rerender } = render(<StudioCompetitorCapabilityPanel locale="en" />);
    const button = screen.getByRole("button", { name: "Choose pose-3d" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const onSelectWorkspacePreset = vi.fn();
    rerender(<StudioCompetitorCapabilityPanel locale="en" activeWorkspaceId="pose-3d" onSelectWorkspacePreset={onSelectWorkspacePreset} />);
    expect(screen.getByRole("button", { name: "pose-3d active" }).getAttribute("aria-pressed")).toBe("true");
    rerender(<StudioCompetitorCapabilityPanel locale="en" activeWorkspaceId="review" onSelectWorkspacePreset={onSelectWorkspacePreset} />);
    expect(screen.queryByRole("button", { name: "pose-3d active" })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no-such-tool-8472" } });
    expect(screen.getByRole("status").textContent).toBe("No matching workspace.");
  });

  it("uses the compact presentation without expanding the pending list", () => {
    render(<StudioCompetitorCapabilityPanel locale="ko" compact />);

    expect(screen.queryByText("외부 검증 대기 12건 보기")).toBeNull();
    expect(screen.queryByTestId("competitor-workflow-quick-match")).toBeNull();
    expect(screen.getByText("구현 누락")).toBeTruthy();
  });

  it("filters competitor presets by specialist role chip and renders the 8-stage role pipeline bridge", () => {
    render(<StudioCompetitorCapabilityPanel locale="ko" />);

    expect(screen.getByTestId("competitor-role-filter-bar")).toBeTruthy();
    expect(screen.getByTestId("competitor-role-pipeline-bridge").textContent).toContain(
      "8단계 웹툰 직군 분업 파이프라인",
    );

    fireEvent.click(screen.getByTestId("competitor-role-filter-background"));
    expect(screen.getByText("SketchUp · ACON3D · Snaptoon")).toBeTruthy();
    expect(screen.queryByText("CGWire Kitsu · Linear")).toBeNull();

    fireEvent.click(screen.getByTestId("competitor-role-filter-all"));
    expect(screen.getByText("CGWire Kitsu · Linear")).toBeTruthy();
  });
});
