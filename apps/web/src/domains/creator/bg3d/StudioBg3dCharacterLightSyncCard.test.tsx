// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n-core";

import {
  STUDIO_BG3D_2D_LIGHT_SYNC_EVENT,
  STUDIO_BG3D_2D_LIGHT_SYNC_PRESETS,
  clearLatestStudioBg3d2dCharacterLightSync,
  type StudioBg3d2dCharacterLightSyncPayload,
} from "./studio-bg3d-2d-character-light-sync";
import { studioBg3dLightAnglesToDirection } from "./studio-bg3d-light-direction";
import { StudioBg3dCharacterLightSyncCard } from "./StudioBg3dCharacterLightSyncCard";
import { StudioBg3dLightingStudio } from "./StudioBg3dLightingStudio";

import type { StudioBg3dLightingSettings } from "./studio-bg3d-scene-document";

const cardSource = readFileSync(
  resolve(import.meta.dirname, "./StudioBg3dCharacterLightSyncCard.tsx"),
  "utf8",
);

const CUSTOM_LIGHTING: StudioBg3dLightingSettings = {
  ambientColor: "#dbe5f0",
  ambientIntensity: 0.58,
  key: {
    color: "#fff0d2",
    direction: studioBg3dLightAnglesToDirection({ azimuthDeg: 38, elevationDeg: 48 }),
    intensity: 1.25,
    castsShadow: true,
  },
  fill: {
    color: "#b9cfee",
    direction: studioBg3dLightAnglesToDirection({ azimuthDeg: -132, elevationDeg: 28 }),
    intensity: 0.38,
    castsShadow: false,
  },
};

afterEach(() => {
  cleanup();
  clearLatestStudioBg3d2dCharacterLightSync();
  useI18n.getState().setLang("ko");
});

describe("StudioBg3dCharacterLightSyncCard 및 StudioBg3dLightingStudio 연결", () => {
  it("BG3D 조명 스튜디오 패널 내부에 2D 캐릭터 광원 동기화 카드와 5종 웹툰 현장 프리셋 칩이 마운트된다", () => {
    render(
      <StudioBg3dLightingStudio
        lighting={CUSTOM_LIGHTING}
        exposure={1}
        onUpdateLighting={vi.fn()}
        onUpdateExposure={vi.fn()}
      />,
    );

    const card = screen.getByTestId("bg3d-2d-character-light-sync-card");
    expect(card).toBeTruthy();
    expect(within(card).getByText("현재 3D 씬 직결")).toBeTruthy();
    expect(within(card).getByTestId("bg3d-2d-light-sync-gradient-bar")).toBeTruthy();

    for (const preset of STUDIO_BG3D_2D_LIGHT_SYNC_PRESETS) {
      const chip = screen.getByTestId(`bg3d-2d-light-sync-preset-${preset.id}`);
      expect(chip.textContent).toContain(preset.labelKo);
      expect(chip.textContent).toContain(preset.kelvinLabel);
      expect(chip.className).toContain("min-h-11");
      expect(chip.className).toContain("min-w-11");
    }

    const applyButton = screen.getByTestId("bg3d-2d-character-light-sync-apply-btn");
    expect(applyButton.className).toContain("min-h-11");
    expect(applyButton.className).toContain("min-w-11");
  });

  it("웹툰 현장 프리셋 칩 클릭 시 3D 조명·노출을 즉시 갱신하고 선택 상태를 표시한다", () => {
    const onUpdateLighting = vi.fn();
    const onUpdateExposure = vi.fn();
    const onCommitLightingHistory = vi.fn();
    const neonPreset = STUDIO_BG3D_2D_LIGHT_SYNC_PRESETS.find((p) => p.id === "neon-alley")!;

    const view = render(
      <StudioBg3dCharacterLightSyncCard
        lighting={CUSTOM_LIGHTING}
        exposure={1}
        onUpdateLighting={onUpdateLighting}
        onUpdateExposure={onUpdateExposure}
        onCommitLightingHistory={onCommitLightingHistory}
      />,
    );

    fireEvent.click(screen.getByTestId("bg3d-2d-light-sync-preset-neon-alley"));

    expect(onUpdateLighting).toHaveBeenCalledOnce();
    expect(onUpdateLighting).toHaveBeenCalledWith(neonPreset.bg3dLighting);
    expect(onUpdateExposure).toHaveBeenCalledOnce();
    expect(onUpdateExposure).toHaveBeenCalledWith(neonPreset.exposure);
    expect(onCommitLightingHistory).toHaveBeenCalledOnce();

    view.rerender(
      <StudioBg3dCharacterLightSyncCard
        lighting={neonPreset.bg3dLighting}
        exposure={neonPreset.exposure}
        onUpdateLighting={onUpdateLighting}
        onUpdateExposure={onUpdateExposure}
        onCommitLightingHistory={onCommitLightingHistory}
      />,
    );

    expect(
      screen.getByTestId("bg3d-2d-light-sync-preset-neon-alley").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByTestId("bg3d-2d-light-sync-kelvin-badge").textContent).toBe("7800K");
    expect(screen.getByTestId("bg3d-2d-light-sync-rim-readout").textContent).toContain("가산(add)");
  });

  it("1클릭 동기화 버튼 클릭 시 2D 캐릭터 패치 콜백과 커스텀 이벤트를 발행하고 완료 상태를 표시한다", () => {
    const onSync2dCharacterLight = vi.fn();
    const dispatched: StudioBg3d2dCharacterLightSyncPayload[] = [];
    const listener = (event: Event) => {
      dispatched.push((event as CustomEvent<StudioBg3d2dCharacterLightSyncPayload>).detail);
    };
    window.addEventListener(STUDIO_BG3D_2D_LIGHT_SYNC_EVENT, listener);

    try {
      const sunset = STUDIO_BG3D_2D_LIGHT_SYNC_PRESETS.find((p) => p.id === "sunset")!;
      render(
        <StudioBg3dLightingStudio
          lighting={sunset.bg3dLighting}
          exposure={sunset.exposure}
          onUpdateLighting={vi.fn()}
          onUpdateExposure={vi.fn()}
          onSync2dCharacterLight={onSync2dCharacterLight}
        />,
      );

      fireEvent.click(screen.getByTestId("bg3d-2d-character-light-sync-apply-btn"));

      expect(onSync2dCharacterLight).toHaveBeenCalledOnce();
      const payload = onSync2dCharacterLight.mock.calls[0]?.[0] as StudioBg3d2dCharacterLightSyncPayload;
      expect(payload.presetId).toBe("sunset");
      expect(payload.result.normalizedInput.colorTemperatureK).toBe(3_200);
      expect(payload.result.gradientMap.studioGradientMap.stops).toHaveLength(3);
      expect(payload.result.rimLight.blendMode).toBe("add");
      expect(dispatched).toHaveLength(1);
      expect(dispatched[0]?.presetId).toBe("sunset");

      const status = screen.getByTestId("bg3d-2d-character-light-sync-status");
      expect(status.textContent).toContain("적용됨");
      expect(status.textContent).toContain("석양 3200K");
    } finally {
      window.removeEventListener(STUDIO_BG3D_2D_LIGHT_SYNC_EVENT, listener);
    }
  });

  it("disabled 상태에서 모든 프리셋 칩과 동기화 버튼이 비활성화되고 ko/en 문구 전환이 동작한다", () => {
    const onUpdateLighting = vi.fn();
    const onSync2dCharacterLight = vi.fn();
    const view = render(
      <StudioBg3dCharacterLightSyncCard
        lighting={CUSTOM_LIGHTING}
        exposure={1}
        disabled
        onUpdateLighting={onUpdateLighting}
        onUpdateExposure={vi.fn()}
        onSync2dCharacterLight={onSync2dCharacterLight}
      />,
    );

    for (const preset of STUDIO_BG3D_2D_LIGHT_SYNC_PRESETS) {
      const chip = screen.getByTestId(
        `bg3d-2d-light-sync-preset-${preset.id}`,
      ) as HTMLButtonElement;
      expect(chip.disabled).toBe(true);
      fireEvent.click(chip);
    }
    const applyBtn = screen.getByTestId(
      "bg3d-2d-character-light-sync-apply-btn",
    ) as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
    fireEvent.click(applyBtn);

    expect(onUpdateLighting).not.toHaveBeenCalled();
    expect(onSync2dCharacterLight).not.toHaveBeenCalled();

    act(() => {
      useI18n.getState().setLang("en");
    });
    view.rerender(
      <StudioBg3dCharacterLightSyncCard
        lighting={CUSTOM_LIGHTING}
        exposure={1}
        onUpdateLighting={onUpdateLighting}
        onUpdateExposure={vi.fn()}
        onSync2dCharacterLight={onSync2dCharacterLight}
      />,
    );
    expect(screen.getByText("2D character light sync")).toBeTruthy();
    expect(screen.getByText("Sync 2D character lighting")).toBeTruthy();
  });

  it("안티슬롭·Calm Atelier 크롬 계약을 준수한다(원시 색상·sub-12px·장식 Sparkles·금지 모션 0건)", () => {
    expect(cardSource).not.toMatch(
      /\b(?:bg|text|border|ring|from|to|via|shadow|accent)-(?:white|black|slate|amber|rose|sky|emerald|violet|fuchsia|red|green|blue|yellow|orange|indigo|purple|pink|cyan|teal|zinc|gray|neutral)(?:-[0-9]{2,3})?/u,
    );
    expect(cardSource).not.toMatch(/\b(?:transition-all|hover:scale-|animate-pulse|font-black)\b/u);
    expect(cardSource).not.toMatch(/text-\[(?:9px|10px|0\.6rem|0\.625rem)\]/u);
    expect(cardSource).not.toContain("<Sparkles");
    expect(cardSource).not.toMatch(
      /[\u{1F300}-\u{1FAFF}\u2600-\u2601\u263D-\u263E\u2694\u2728\u274C\u2705]/u,
    );
  });
});
