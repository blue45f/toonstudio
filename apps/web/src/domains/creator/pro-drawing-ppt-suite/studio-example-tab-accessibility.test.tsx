// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";

import { StudioRenderFarmVcsPanel } from "../distributed-render-semantic-vcs/StudioRenderFarmVcsPanel";
import { StudioHandcraftedAtelierPanel } from "../handcrafted-atelier-feel/StudioHandcraftedAtelierPanel";
import { StudioMovingtoonReelsPanel } from "../movingtoon-reels-studio/StudioMovingtoonReelsPanel";
import { StudioNeuralUpscaleTexturesPanel } from "../neural-upscale-textures/StudioNeuralUpscaleTexturesPanel";
import { StudioFederatedLoraStreamPanel } from "../federated-style-lora/StudioFederatedLoraStreamPanel";
import { StudioKoreanLetteringSfxPanel } from "../korean-lettering-sfx-engine/StudioKoreanLetteringSfxPanel";
import { StudioCinematographyDirectorPanel } from "../webtoon-cinematography-director/StudioCinematographyDirectorPanel";
import { StudioColorScriptLabPanel } from "../color-script-accessibility-lab/StudioColorScriptLabPanel";
import { StudioPerfDoctorPanel } from "../studio-perf-doctor/StudioPerfDoctorPanel";
import { StudioErgonomicsMasterPanel } from "../ergonomics-shortcut-master/StudioErgonomicsMasterPanel";

const panels: readonly {
  readonly label: string;
  readonly Component: ComponentType<{ readonly locale?: "ko" | "en" }>;
  readonly shortLabels?: Readonly<Record<"ko" | "en", readonly string[]>>;
}[] = [
  { label: "렌더 일정", Component: StudioRenderFarmVcsPanel },
  { label: "수공예", Component: StudioHandcraftedAtelierPanel },
  { label: "무빙툰", Component: StudioMovingtoonReelsPanel },
  { label: "확대", Component: StudioNeuralUpscaleTexturesPanel },
  { label: "학습·캐시", Component: StudioFederatedLoraStreamPanel, shortLabels: { ko: ["가정 학습", "메모리 캐시"], en: ["Training model", "Cache model"] } },
  { label: "식자", Component: StudioKoreanLetteringSfxPanel, shortLabels: { ko: ["말풍선", "효과 글자"], en: ["Balloons", "SFX text"] } },
  { label: "카메라·시선", Component: StudioCinematographyDirectorPanel, shortLabels: { ko: ["카메라", "시선 경로"], en: ["Camera", "Eye flow"] } },
  { label: "색각", Component: StudioColorScriptLabPanel, shortLabels: { ko: ["색 흐름", "색각 변환", "경계 대비"], en: ["Color arc", "CVD model", "Border"] } },
  { label: "성능", Component: StudioPerfDoctorPanel, shortLabels: { ko: ["프레임 예산", "자원 제안"], en: ["Frames", "Resources"] } },
  { label: "작업 환경", Component: StudioErgonomicsMasterPanel, shortLabels: { ko: ["단축키", "도구 배치", "가독성"], en: ["Shortcuts", "Layout", "Readability"] } },
];

afterEach(cleanup);

describe("짧은 예제 탭의 보이는 이름과 접근성 이름", () => {
  for (const { label, Component, shortLabels } of panels) {
    for (const locale of ["ko", "en"] as const) {
      it(`${label} ${locale}: 화면의 이름으로 음성 제어 대상을 찾을 수 있다`, () => {
        render(<Component locale={locale} />);
        const tabs = screen.getAllByRole("tab");
        expect(tabs.length).toBeGreaterThan(0);
        if (shortLabels) expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(shortLabels[locale]);
        for (const tab of tabs) {
          const visible = tab.textContent?.trim().replace(/\s+/gu, " ") ?? "";
          expect(visible).not.toBe("");
          const accessible = (tab.getAttribute("aria-label") ?? visible).replace(/\s+/gu, " ");
          expect(accessible).toContain(visible);
          if (shortLabels) {
            expect(tab.getAttribute("title")).toBeTruthy();
            expect(accessible).toBe(`${visible}: ${tab.getAttribute("title")}`);
          }
        }
      });
    }
  }
});
