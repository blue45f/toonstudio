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

  it("Wave 21 범용 브러시 엔진 바(Harmony 11종 · 웹툰 리본)가 WAI-ARIA Roving Tabindex 키보드 탐색과 함께 동작한다", () => {
    const { container } = render(<StudioNaturalMediaShowcase {...props()} />);
    const universalBar = container.querySelector('[data-studio-universal-brush-bar="true"]');
    expect(universalBar).not.toBeNull();

    const sketchyRadio = container.querySelector('[data-studio-harmony-kind="sketchy"]') as HTMLButtonElement | null;
    expect(sketchyRadio).not.toBeNull();
    expect(sketchyRadio?.getAttribute("aria-checked")).toBe("true");
    expect(sketchyRadio?.getAttribute("tabindex")).toBe("0");

    // ArrowRight 키로 다음 Harmony 브러시(shaded)로 포커스 및 선택 이동
    fireEvent.keyDown(sketchyRadio!, { key: "ArrowRight" });
    const shadedRadio = container.querySelector('[data-studio-harmony-kind="shaded"]') as HTMLButtonElement | null;
    expect(shadedRadio?.getAttribute("aria-checked")).toBe("true");
    expect(shadedRadio?.getAttribute("tabindex")).toBe("0");

    // 웹툰 리본 멀티스탬프 라디오 전환
    const cloudRibbon = container.querySelector('[data-studio-comic-ribbon="ribbon-cloud-cluster"]') as HTMLButtonElement | null;
    expect(cloudRibbon).not.toBeNull();
    fireEvent.click(cloudRibbon!);
    expect(cloudRibbon?.getAttribute("aria-checked")).toBe("true");

    // Wave 22 골격 아트 브러시 및 Corel 입자 브러시 Roving Tabindex 검증
    const katanaRadio = container.querySelector('[data-studio-skeletal-brush="katana-blade"]') as HTMLButtonElement | null;
    expect(katanaRadio).not.toBeNull();
    expect(katanaRadio?.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(katanaRadio!, { key: "ArrowRight" });
    const arrowRadio = container.querySelector('[data-studio-skeletal-brush="ornate-arrow"]') as HTMLButtonElement | null;
    expect(arrowRadio?.getAttribute("aria-checked")).toBe("true");

    const silkRadio = container.querySelector('[data-studio-particle-brush="silk-harmonic-spring"]') as HTMLButtonElement | null;
    expect(silkRadio).not.toBeNull();
    expect(silkRadio?.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(silkRadio!, { key: "End" });
    const hairRadio = container.querySelector('[data-studio-particle-brush="hair-lock-spring"]') as HTMLButtonElement | null;
    expect(hairRadio?.getAttribute("aria-checked")).toBe("true");

    // Wave 23 Klecks 6종 및 베지어 곡선 브러시 Roving Tabindex 검증
    const klecksBlendRadio = container.querySelector('[data-studio-klecks-preset="klecks-blend-watercolor"]') as HTMLButtonElement | null;
    expect(klecksBlendRadio).not.toBeNull();
    expect(klecksBlendRadio?.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(klecksBlendRadio!, { key: "End" });
    const klecksPixelRadio = container.querySelector('[data-studio-klecks-preset="klecks-pixel-disc-union"]') as HTMLButtonElement | null;
    expect(klecksPixelRadio?.getAttribute("aria-checked")).toBe("true");

    // Wave 24 MyPaint 46설정·38밴드 분광 브러시 Roving Tabindex 및 실시간 다중 레이어 SVG 프리뷰 검증
    const myPaintImpastoRadio = container.querySelector('[data-studio-mypaint-preset="mypaint-spectral-impasto"]') as HTMLButtonElement | null;
    expect(myPaintImpastoRadio).not.toBeNull();
    expect(myPaintImpastoRadio?.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(myPaintImpastoRadio!, { key: "Home" });
    const myPaintKnifeRadio = container.querySelector('[data-studio-mypaint-preset="mypaint-classic-knife"]') as HTMLButtonElement | null;
    expect(myPaintKnifeRadio?.getAttribute("aria-checked")).toBe("true");

    // Wave 25 프리핸드 윤곽(perfect-freehand) 및 Rough 해칭(rough.js) Roving Tabindex 검증
    const pfGpenRadio = container.querySelector('[data-studio-freehand-rough-preset="pf-comic-gpen-taper"]') as HTMLButtonElement | null;
    expect(pfGpenRadio).not.toBeNull();
    expect(pfGpenRadio?.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(pfGpenRadio!, { key: "End" });
    const roughCrossHatchRadio = container.querySelector('[data-studio-freehand-rough-preset="rough-cross-hatch-ink"]') as HTMLButtonElement | null;
    expect(roughCrossHatchRadio?.getAttribute("aria-checked")).toBe("true");

    // Wave 26 경쟁사 필터·집중선·하프톤 Roving Tabindex 검증
    const filterFirstRadio = container.querySelector('[data-studio-competitor-filter-preset="glfx-denoise-bilateral"]') as HTMLButtonElement | null;
    expect(filterFirstRadio).not.toBeNull();
    fireEvent.click(filterFirstRadio!);
    expect(filterFirstRadio?.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(filterFirstRadio!, { key: "End" });
    const filterSwirlRadio = container.querySelector('[data-studio-competitor-filter-preset="glfx-swirl-bulge-warp"]') as HTMLButtonElement | null;
    expect(filterSwirlRadio?.getAttribute("aria-checked")).toBe("true");

    const liveSvgPreview = container.querySelector('[data-studio-universal-brush-svg-preview="true"]');
    expect(liveSvgPreview).not.toBeNull();
    expect(liveSvgPreview?.querySelector("path")).not.toBeNull();
    expect(liveSvgPreview?.querySelector("polygon")).not.toBeNull();

    // Wave 27 Klecks·miniPaint REA UI/UX 워크스페이스 도크 탭 및 비선형 정밀 슬라이더·수직 감쇠 HUD 검증
    const precisionHud = container.querySelector('[data-studio-klecks-precision-hud="true"]');
    expect(precisionHud).not.toBeNull();
    const precisionSlider = container.querySelector('[data-studio-precision-slider="size"]') as HTMLInputElement | null;
    expect(precisionSlider).not.toBeNull();
    fireEvent.change(precisionSlider!, { target: { value: "0.15" } });
    const precisionReadout = container.querySelector('[data-studio-precision-readout="true"]');
    expect(precisionReadout?.textContent).toContain(".");

    const fineToggle = container.querySelector('[data-studio-precision-fine-toggle="true"]') as HTMLButtonElement | null;
    expect(fineToggle).not.toBeNull();
    expect(fineToggle?.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(fineToggle!);
    expect(fineToggle?.getAttribute("aria-pressed")).toBe("true");
    expect(fineToggle?.textContent).toContain("0.10×");

    const wave26DockTab = container.querySelector('[data-studio-engine-wave-filter="wave26"]') as HTMLButtonElement | null;
    expect(wave26DockTab).not.toBeNull();
    fireEvent.click(wave26DockTab!);
    expect(wave26DockTab?.getAttribute("aria-pressed")).toBe("true");

    const allDockTab = container.querySelector('[data-studio-engine-wave-filter="all"]') as HTMLButtonElement | null;
    fireEvent.click(allDockTab!);
    expect(allDockTab?.getAttribute("aria-pressed")).toBe("true");

    // Wave 28 통합 드로잉 파이프라인(플루드필·호모그래피·톤커브·W3C 레이어 합성) 검증
    const wave28DockTab = container.querySelector('[data-studio-engine-wave-filter="wave28"]') as HTMLButtonElement | null;
    expect(wave28DockTab).not.toBeNull();
    fireEvent.click(wave28DockTab!);
    expect(wave28DockTab?.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(allDockTab!);

    const holisticToolRadio = container.querySelector('[data-studio-holistic-tool-preset="holistic-flood-fill-contiguous"]') as HTMLButtonElement | null;
    expect(holisticToolRadio).not.toBeNull();
    expect(holisticToolRadio?.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(holisticToolRadio!, { key: "End" });
    const holisticPerspectiveRadio = container.querySelector('[data-studio-holistic-tool-preset="holistic-perspective-4pt-homography"]') as HTMLButtonElement | null;
    expect(holisticPerspectiveRadio?.getAttribute("aria-checked")).toBe("true");

    const blendModeRadio = container.querySelector('[data-studio-holistic-blend-mode="multiply"]') as HTMLButtonElement | null;
    expect(blendModeRadio).not.toBeNull();
    fireEvent.keyDown(blendModeRadio!, { key: "End" });
    const lumaBlendRadio = container.querySelector('[data-studio-holistic-blend-mode="luminosity"]') as HTMLButtonElement | null;
    expect(lumaBlendRadio?.getAttribute("aria-checked")).toBe("true");

    const contrastSwatch = container.querySelector("[data-studio-klecks-contrast-swatch]");
    expect(contrastSwatch).not.toBeNull();
  });
});
