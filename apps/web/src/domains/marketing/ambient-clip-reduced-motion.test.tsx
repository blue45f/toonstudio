// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeCoreStudios } from "./HomeCoreStudios";
import { StudioIntroClosing, StudioIntroFlow } from "./StudioIntroNarrative";

/**
 * 장식 배경 클립은 움직임 최소화를 선호하면 CSS 로 숨기는 데서 그치지 않고 <video> 요소 자체를 만들지 않는다.
 * 숨긴 <video> 도 autoplay·preload="metadata" 라 .mp4 를 계속 내려받기 때문이다.
 * 홈 검증 스크립트(scripts/verify-purpose-first-home.mjs 등)가 reducedMotion 환경에서 같은 계약을 브라우저로 확인한다.
 */
function stubMotionPreference(reduce: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

const CLIP_SURFACES: ReadonlyArray<readonly [string, () => ReactElement]> = [
  ["홈 핵심 작업실 3D 카드", () => <HomeCoreStudios />],
  ["소개 제작 흐름 카드", () => <StudioIntroFlow />],
  ["소개 마무리 밴드", () => <StudioIntroClosing />],
];

describe("장식 배경 클립과 움직임 최소화", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each(CLIP_SURFACES)("%s: 움직임 최소화면 <video> 요소를 만들지 않는다", (_name, surface) => {
    stubMotionPreference(true);
    const { container } = render(<MemoryRouter>{surface()}</MemoryRouter>);
    expect(container.querySelectorAll("video")).toHaveLength(0);
  });

  it.each(CLIP_SURFACES)("%s: 설정이 없으면 장식 클립 하나가 보조기기에서 숨겨진 채 붙는다", (_name, surface) => {
    stubMotionPreference(false);
    const { container } = render(<MemoryRouter>{surface()}</MemoryRouter>);
    const videos = container.querySelectorAll("video");
    expect(videos).toHaveLength(1);
    expect(videos[0]?.getAttribute("preload")).toBe("metadata");
    expect(videos[0]?.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
