// @vitest-environment jsdom
/**
 * 안료 혼색 비교 패널의 "잠재 안료(자체)" 항목 시험: 접근성 이름, 선택 상태, 키보드 조작 가능한 네이티브 버튼,
 * 명시적 선택 때만 콜백, 팔레트 미리보기.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { createBrushStudioV6PigmentPalette } from "../brush-studio-v6-pigment-provider";
import { StudioPigmentComparison } from "./StudioPigmentComparison";

afterEach(cleanup);

describe("잠재 안료(자체) 비교 항목", () => {
  it("접근성 이름이 '잠재 안료(자체) 선택'인 네이티브 버튼이고 키보드로 포커스할 수 있다", () => {
    render(<StudioPigmentComparison primary="#ffe000" secondary="#0050dc" node="pigment-spectral" secondaryActive onSelect={vi.fn()} />);
    const button = screen.getByRole("button", { name: "잠재 안료(자체) 선택" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.tabIndex).toBeGreaterThanOrEqual(0);
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it("보기만 해서는 콜백이 호출되지 않고, 선택하면 노드 식별자 하나로만 호출된다", () => {
    const onSelect = vi.fn();
    render(<StudioPigmentComparison primary="#ffe000" secondary="#0050dc" node="pigment-spectral" secondaryActive onSelect={onSelect} />);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "잠재 안료(자체) 선택" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("pigment-latent");
  });

  it("현재 노드가 pigment-latent 이면 눌림 상태이고 다른 항목은 눌리지 않는다", () => {
    render(<StudioPigmentComparison primary="#ffe000" secondary="#0050dc" node="pigment-latent" secondaryActive onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "잠재 안료(자체) 선택" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "기존 WGM 선택" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Mixbox 선택" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("중간 혼색 코드가 제공자 팔레트의 중앙 값과 같고 설명에 모델 성격이 적혀 있다", () => {
    render(<StudioPigmentComparison primary="#ffe000" secondary="#0050dc" node="pigment-spectral" secondaryActive onSelect={vi.fn()} />);
    const palette = createBrushStudioV6PigmentPalette("#ffe000", "#0050dc", "toonstudio-latent-pigment-v1");
    expect(screen.getAllByText(palette[16]).length).toBeGreaterThan(0);
    expect(screen.getByText(/자체 K–M 모델/u)).toBeTruthy();
  });

  it("기존 항목(Mixbox 포함)의 선택 동작은 그대로다", () => {
    const onSelect = vi.fn();
    render(<StudioPigmentComparison primary="#ffe000" secondary="#0050dc" node="pigment-latent" secondaryActive onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Mixbox 선택" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("pigment-mixbox");
  });
});
