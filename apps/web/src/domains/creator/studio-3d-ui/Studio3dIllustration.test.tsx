// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { Studio3dIllustration } from "./Studio3dIllustration";

beforeEach(() => useI18n.getState().setLang("ko"));
afterEach(() => { cleanup(); useI18n.getState().setLang("ko"); });

describe("3D 스튜디오 예시 일러스트", () => {
  it("안내용 일러스트임을 명시하고 실제 모델이나 편집 도구로 가장하지 않는다", () => {
    const { container } = render(<Studio3dIllustration />);
    expect(screen.getByText("창작 영감을 위한 예시 일러스트")).toBeTruthy();
    const images = [...container.querySelectorAll("img")];
    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      "/brand/illustrated-20260928/character-pink.webp",
      "/brand/illustrated-20260928/character-blue.webp",
    ]);
    for (const image of images) {
      expect(image.alt).toBe("");
      expect(image.getAttribute("loading")).toBe("lazy");
      expect(image.closest('[aria-hidden="true"]')).toBeTruthy();
    }
    expect(container.querySelector("canvas, button, input")).toBeNull();
  });

  it("휴대폰 폭에서만 낮춰 보이는 responsiveCompact와 가벼운 반응형 이미지를 지원한다", () => {
    const { container } = render(<Studio3dIllustration responsiveCompact />);
    expect(container.querySelector('figure[data-responsive-compact="true"]')).toBeTruthy();
    // 항상 낮은 비율인 compact와는 별개 표식이다.
    expect(container.querySelector("figure[data-compact]")).toBeNull();
    for (const image of container.querySelectorAll("img")) {
      // 너비 서술자는 4:5 파생본의 실제 폭(320·640·960)에 맞추며 높이 1200을 폭으로 쓰지 않는다.
      expect(image.getAttribute("srcset")).toMatch(/-320\.webp 320w,.*-640\.webp 640w,.*-960\.webp 960w$/u);
      expect(image.getAttribute("sizes")).toBe("(max-width: 479px) 380px, 640px");
      expect(image.getAttribute("width")).toBe("960");
      expect(image.getAttribute("height")).toBe("1200");
    }
  });

  it("모바일·태블릿·데스크톱 Retina 전 구간에서 HTML srcSet 밀도 보정 naturalWidth가 업스케일 임계치를 넘는다", () => {
    const { container } = render(<Studio3dIllustration responsiveCompact />);
    const sizes = container.querySelector("img")?.getAttribute("sizes") ?? "";
    // HTML 명세상 intrinsicWidth === w 서술자일 때 density-corrected naturalWidth는 sizes 평가값과 같다.
    const slotForViewport = (viewportWidth: number) => (viewportWidth <= 479 ? 380 : 640);
    expect(sizes).toBe("(max-width: 479px) 380px, 640px");
    for (const sample of [
      { viewportWidth: 390, displayedWidth: 165.5, displayedHeight: 142.3, dpr: 3 },
      { viewportWidth: 820, displayedWidth: 316.5, displayedHeight: 396.3, dpr: 2 },
      { viewportWidth: 1440, displayedWidth: 290.1, displayedHeight: 363.3, dpr: 1 },
      { viewportWidth: 1440, displayedWidth: 290.1, displayedHeight: 363.3, dpr: 2 },
    ]) {
      const naturalWidth = slotForViewport(sample.viewportWidth);
      const naturalHeight = naturalWidth * 5 / 4;
      const effectiveDpr = Math.min(Math.max(sample.dpr, 1), 2);
      expect(naturalWidth).toBeGreaterThanOrEqual(sample.displayedWidth * effectiveDpr * 0.75);
      expect(naturalHeight).toBeGreaterThanOrEqual(sample.displayedHeight * effectiveDpr * 0.75);
    }
  });

  it("영문 UI에서도 예시임을 밝히며 compact 표시는 기존 편집 상태를 요구하지 않는다", () => {
    useI18n.getState().setLang("en");
    const { container } = render(<Studio3dIllustration compact />);
    expect(screen.getByText("Illustrations for creative inspiration")).toBeTruthy();
    expect(screen.getByText("Prepare your character’s first scene")).toBeTruthy();
    expect(container.querySelector('figure[data-compact="true"]')).toBeTruthy();
  });
});
