// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioShadingAssistPanel } from "./StudioShadingAssistPanel";
import { DEFAULT_SHADING_ASSIST_OPTIONS } from "./studio-shading-assist";

describe("StudioShadingAssistPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("광원 방향 패드와 생성 버튼을 렌더한다", () => {
    render(
      <StudioShadingAssistPanel
        value={DEFAULT_SHADING_ASSIST_OPTIONS}
        onPatch={vi.fn()}
        onGenerate={vi.fn()}
      />,
    );
    expect(screen.getByText("명암 보조")).toBeDefined();
    expect(screen.getByLabelText("광원 왼쪽 위")).toBeDefined();
    expect(screen.getByText("음영 초안 만들기")).toBeDefined();
    // 기본값 315° = 왼쪽 위가 현재 방향 이름으로 표시된다.
    expect(screen.getByText("왼쪽 위")).toBeDefined();
  });

  it("방향 버튼을 누르면 해당 방위각으로 onPatch 한다", () => {
    const onPatch = vi.fn();
    render(
      <StudioShadingAssistPanel
        value={DEFAULT_SHADING_ASSIST_OPTIONS}
        onPatch={onPatch}
        onGenerate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("광원 오른쪽"));
    expect(onPatch).toHaveBeenCalledWith({ azimuthDeg: 90 });
  });

  it("생성 버튼은 onGenerate를 1회 호출하고, 대상이 없으면 비활성이다", () => {
    const onGenerate = vi.fn();
    const { rerender } = render(
      <StudioShadingAssistPanel
        value={DEFAULT_SHADING_ASSIST_OPTIONS}
        onPatch={vi.fn()}
        onGenerate={onGenerate}
      />,
    );
    fireEvent.click(screen.getByText("음영 초안 만들기"));
    expect(onGenerate).toHaveBeenCalledTimes(1);

    rerender(
      <StudioShadingAssistPanel
        value={DEFAULT_SHADING_ASSIST_OPTIONS}
        onPatch={vi.fn()}
        onGenerate={onGenerate}
        hasTarget={false}
      />,
    );
    expect((screen.getByText("음영 초안 만들기") as HTMLButtonElement).disabled).toBe(true);
  });

  it("호스트가 돌려준 결과 요약을 표시한다", () => {
    render(
      <StudioShadingAssistPanel
        value={DEFAULT_SHADING_ASSIST_OPTIONS}
        onPatch={vi.fn()}
        onGenerate={vi.fn()}
        lastResult="음영 초안 레이어를 만들었습니다 (전체의 48%)"
      />,
    );
    expect(screen.getByText("음영 초안 레이어를 만들었습니다 (전체의 48%)")).toBeDefined();
  });
});
