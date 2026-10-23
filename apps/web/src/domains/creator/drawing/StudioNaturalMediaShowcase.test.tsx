// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioNaturalMediaShowcase,
  type StudioNaturalMediaShowcaseProps,
} from "./StudioNaturalMediaShowcase";
import { STUDIO_NATURAL_MEDIA_PRESETS } from "./studio-natural-media-brushes";

afterEach(cleanup);

function props(
  overrides: Partial<StudioNaturalMediaShowcaseProps> = {},
): StudioNaturalMediaShowcaseProps {
  return {
    onSelectBrush: vi.fn(),
    onStartDrawing: vi.fn(),
    ...overrides,
  };
}

describe("StudioNaturalMediaShowcase", () => {
  it("11종의 브러시 카드를 렌더링한다", { timeout: 30000 }, () => {
    render(<StudioNaturalMediaShowcase {...props()} />);
    for (const preset of STUDIO_NATURAL_MEDIA_PRESETS) {
      expect(
        screen.getByRole("button", { name: `브러시 선택: ${preset.labelKo}` }),
      ).toBeTruthy();
    }
  });

  it("카드를 클릭하면 선택되고 onSelectBrush 가 호출된다", () => {
    const onSelectBrush = vi.fn();
    render(<StudioNaturalMediaShowcase {...props({ onSelectBrush })} />);

    const charcoal = screen.getByRole("button", { name: "브러시 선택: 목탄" });
    expect(charcoal.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(charcoal);

    expect(charcoal.getAttribute("aria-pressed")).toBe("true");
    expect(onSelectBrush).toHaveBeenCalledTimes(1);
    expect(onSelectBrush.mock.calls[0][0].id).toBe("charcoal");
    // 선택 배지가 표시된다
    expect(screen.getByText("선택됨")).toBeTruthy();
  });

  it("핵심 CTA는 선택된 브러시로 onStartDrawing 을 호출한다", () => {
    const onStartDrawing = vi.fn();
    render(<StudioNaturalMediaShowcase {...props({ onStartDrawing })} />);

    fireEvent.click(screen.getByRole("button", { name: "브러시 선택: 목탄" }));
    fireEvent.click(
      screen.getByRole("button", { name: "이 브러시로 그리기 시작" }),
    );

    expect(onStartDrawing).toHaveBeenCalledTimes(1);
    expect(onStartDrawing.mock.calls[0][0].id).toBe("charcoal");
  });

  it("고급 설정은 접혀 있다가 펼쳐진다", () => {
    render(<StudioNaturalMediaShowcase {...props()} />);
    expect(screen.queryByLabelText("스트로크 굵기 배율")).toBeNull();

    const toggle = screen.getByRole("button", { name: "고급 설정" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("스트로크 굵기 배율")).toBeTruthy();
  });

  it("각 카드에 SVG 스트로크 프리뷰가 있다", () => {
    const { container } = render(<StudioNaturalMediaShowcase {...props()} />);
    const previews = container.querySelectorAll(
      'svg[aria-label$="스트로크 미리보기"]',
    );
    expect(previews.length).toBe(STUDIO_NATURAL_MEDIA_PRESETS.length);
    for (const svg of previews) {
      expect(svg.querySelector("path")).toBeTruthy();
    }
  });

  it("웹툰 공정 필터와 이중 브러시 추천 조합 원탭 적용이 정상 동작한다", () => {
    const onSelectBrush = vi.fn();
    const onApplyDualBrushCombo = vi.fn();
    const { container } = render(
      <StudioNaturalMediaShowcase
        {...props({ onSelectBrush, onApplyDualBrushCombo })}
      />,
    );

    const section = container.querySelector("section");
    expect(section?.style.containerType).toBe("inline-size");

    // 선화 필터 클릭 시 선화 브러시만 표시
    const lineartFilter = container.querySelector('[data-studio-craft-filter="lineart"]') as HTMLButtonElement | null;
    expect(lineartFilter).not.toBeNull();
    fireEvent.click(lineartFilter!);
    expect(lineartFilter?.getAttribute("aria-pressed")).toBe("true");

    // 전체 공정 복귀
    const allFilter = container.querySelector('[data-studio-craft-filter="all"]') as HTMLButtonElement | null;
    fireEvent.click(allFilter!);

    // 이중 브러시 조합 클릭 시 기반 브러시 선택 및 콜백 호출
    const comboBtn = container.querySelector('[data-studio-dual-brush-combo="marker-canvas"]') as HTMLButtonElement | null;
    expect(comboBtn).not.toBeNull();
    fireEvent.click(comboBtn!);
    expect(onApplyDualBrushCombo).toHaveBeenCalledTimes(1);
    expect(onSelectBrush).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "marker" }),
    );
  });
});
