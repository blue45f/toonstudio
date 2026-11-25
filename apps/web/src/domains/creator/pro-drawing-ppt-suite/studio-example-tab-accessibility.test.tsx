// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";

import { StudioRenderFarmVcsPanel } from "../distributed-render-semantic-vcs/StudioRenderFarmVcsPanel";
import { StudioHandcraftedAtelierPanel } from "../handcrafted-atelier-feel/StudioHandcraftedAtelierPanel";
import { StudioMovingtoonReelsPanel } from "../movingtoon-reels-studio/StudioMovingtoonReelsPanel";
import { StudioNeuralUpscaleTexturesPanel } from "../neural-upscale-textures/StudioNeuralUpscaleTexturesPanel";

const panels: readonly {
  readonly label: string;
  readonly Component: ComponentType<{ readonly locale?: "ko" | "en" }>;
}[] = [
  { label: "렌더 일정", Component: StudioRenderFarmVcsPanel },
  { label: "수공예", Component: StudioHandcraftedAtelierPanel },
  { label: "무빙툰", Component: StudioMovingtoonReelsPanel },
  { label: "확대", Component: StudioNeuralUpscaleTexturesPanel },
];

afterEach(cleanup);

describe("짧은 예제 탭의 보이는 이름과 접근성 이름", () => {
  for (const { label, Component } of panels) {
    for (const locale of ["ko", "en"] as const) {
      it(`${label} ${locale}: 화면의 이름으로 음성 제어 대상을 찾을 수 있다`, () => {
        render(<Component locale={locale} />);
        const tabs = screen.getAllByRole("tab");
        expect(tabs.length).toBeGreaterThan(0);
        for (const tab of tabs) {
          const visible = tab.textContent?.trim().replace(/\s+/gu, " ") ?? "";
          expect(visible).not.toBe("");
          const accessible = (tab.getAttribute("aria-label") ?? visible).replace(/\s+/gu, " ");
          expect(accessible).toContain(visible);
        }
      });
    }
  }
});
