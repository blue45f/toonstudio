// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS,
  applyStudioBg3dWebtoonAtmospherePresetToDocument,
  resolveStudioBg3dWebtoonAtmospherePreset,
  type StudioBg3dWebtoonAtmospherePreset,
} from "./studio-bg3d-lighting-studio";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import { DEFAULT_STUDIO_BG3D_SECTION_PLANE_STATE } from "./studio-bg3d-section-plane";
import { DEFAULT_BG3D_WALL_CUTAWAY_CONFIG } from "./studio-bg3d-wall-cutaway-runtime";
import { StudioBg3dLightingStudio } from "./StudioBg3dLightingStudio";
import { StudioBg3dProfessionalWorkspace } from "./StudioBg3dProfessionalWorkspace";
import { evaluateStudioBg3dSectionCapCoordination } from "./studio-bg3d-section-cap-coordination";

afterEach(() => {
  cleanup();
});

describe("AC-005 Snaptoon 7 webtoon atmosphere presets & 1-click wall cutaway + section cap coordination", () => {
  it("defines all 7 webtoon atmosphere presets (아침·낮·노을·밤·비·눈·역광) with atomic lighting, fog, ink weight, and weather", () => {
    const ids = STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS.map((preset) => preset.id);
    const labels = STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS.map((preset) => preset.labelKo);
    expect(ids).toEqual(["morning", "day", "sunset", "night", "rain", "snow", "backlight"]);
    expect(labels).toEqual(["아침", "낮", "노을", "밤", "비", "눈", "역광"]);

    for (const preset of STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS) {
      const applied = applyStudioBg3dWebtoonAtmospherePresetToDocument(
        DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
        preset.id,
      );
      expect(applied).not.toBeNull();
      expect(applied!.lighting.key.color.toLowerCase()).toBe(preset.lighting.key.color.toLowerCase());
      expect(applied!.render.exposure).toBeCloseTo(preset.exposure, 3);
      expect(applied!.background.fogEnabled).toBe(preset.fog.active);
      expect(applied!.background.fogNear).toBeCloseTo(preset.fog.near, 3);
      expect(applied!.background.fogFar).toBeCloseTo(preset.fog.far, 3);
      expect(applied!.output.line.widthPx).toBeCloseTo(preset.inkLineWeightPx, 2);

      const resolved = resolveStudioBg3dWebtoonAtmospherePreset(applied!);
      expect(resolved?.id).toBe(preset.id);
    }

    const rain = STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS.find((p) => p.id === "rain")!;
    const snow = STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS.find((p) => p.id === "snow")!;
    const backlight = STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS.find((p) => p.id === "backlight")!;
    expect(rain.weather.precipitationKind).toBe("rain");
    expect(rain.fog.density).toBeGreaterThan(0.5);
    expect(snow.weather.precipitationKind).toBe("snow");
    expect(backlight.inkLineWeightPx).toBeGreaterThanOrEqual(2.5);
  });

  it("renders and applies all 7 webtoon moods in StudioBg3dLightingStudio", () => {
    const onApplyWebtoonAtmosphere = vi.fn();
    render(
      <StudioBg3dLightingStudio
        lighting={DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.lighting}
        exposure={DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.render.exposure}
        activeWebtoonAtmosphereId="morning"
        onUpdateLighting={vi.fn()}
        onUpdateExposure={vi.fn()}
        onApplyWebtoonAtmosphere={onApplyWebtoonAtmosphere}
      />,
    );

    const section = screen.getByTestId("studio-bg3d-lighting-webtoon-atmosphere");
    expect(section).toBeDefined();
    expect(screen.getByTestId("studio-bg3d-lighting-mood-morning").getAttribute("aria-pressed")).toBe("true");

    for (const preset of STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS) {
      fireEvent.click(screen.getByTestId(`studio-bg3d-lighting-mood-${preset.id}`));
    }
    expect(onApplyWebtoonAtmosphere).toHaveBeenCalledTimes(7);
    const appliedIds = onApplyWebtoonAtmosphere.mock.calls.map(
      (call) => (call[0] as StudioBg3dWebtoonAtmospherePreset).id,
    );
    expect(appliedIds).toEqual(["morning", "day", "sunset", "night", "rain", "snow", "backlight"]);
  });

  it("provides 1-click 7-mood switching and 1-click auto-hide occluding walls in StudioBg3dProfessionalWorkspace", async () => {
    const onApplyWebtoonAtmosphere = vi.fn();
    const onWallCutawayConfigChange = vi.fn();

    render(
      <MemoryRouter initialEntries={["/studio/bg3d"]}>
        <StudioBg3dProfessionalWorkspace
          outliner={<div>outliner</div>}
          viewport={<div>viewport</div>}
          inspector={<div>inspector</div>}
          onApplyWebtoonAtmosphere={onApplyWebtoonAtmosphere}
          onWallCutawayConfigChange={onWallCutawayConfigChange}
        />
      </MemoryRouter>,
    );

    // 7종 웹툰 분위기 프리셋 바 즉시 1클릭 전환
    for (const preset of STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS) {
      const btn = screen.getByTestId(`studio-bg3d-mood-preset-${preset.id}`);
      fireEvent.click(btn);
      expect(btn.getAttribute("aria-pressed")).toBe("true");
    }
    expect(onApplyWebtoonAtmosphere).toHaveBeenCalledTimes(7);
    expect(screen.getByTestId("studio-bg3d-active-atmosphere-summary").textContent).toContain("2.6px");

    // 1클릭 가림 벽 자동 숨김 토글 (초기에는 세부 토글 컴포넌트 마운트 안 됨)
    expect(screen.queryByTestId("studio-bg3d-wall-cutaway-toggle")).toBeNull();
    const cutawayBtn = screen.getByTestId("studio-bg3d-toolbar-wall-cutaway-btn");
    expect(cutawayBtn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(cutawayBtn);
    expect(cutawayBtn.getAttribute("aria-pressed")).toBe("false");
    expect(onWallCutawayConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );

    // 세부 설정 팝오버 클릭 시 StudioBg3dWallCutawayToggle 지연 마운트 + 모바일에서도 '벽 설정' 라벨 상시 노출
    const wallSettingsBtn = screen.getByTestId("studio-bg3d-toolbar-wall-cutaway-settings-btn");
    expect(wallSettingsBtn.textContent).toContain("벽 설정");
    expect(wallSettingsBtn.innerHTML).not.toContain("hidden sm:inline");
    fireEvent.click(wallSettingsBtn);
    await waitFor(() => {
      expect(screen.getByTestId("studio-bg3d-wall-cutaway-toggle")).toBeDefined();
    });

    // 모바일 기본 툴바 수납 검증: 데스크톱 프리셋·기본 배치·선화 모드 그룹은 기본 숨김(hidden md:inline-flex) 후 '도구 더 보기' 클릭 시 펼침
    const scenePresetBtn = screen.getByRole("button", { name: "장면" });
    const resetLayoutBtn = screen.getByRole("button", { name: "기본 배치" });
    const modeGroup = screen.getByRole("group", { name: "라이브 선화 미리보기 모드" });
    expect(scenePresetBtn.className).toContain("hidden md:inline-flex");
    expect(resetLayoutBtn.className).toContain("hidden md:inline-flex");
    expect(modeGroup.className).toContain("hidden md:inline-flex");

    const moreToolsBtn = screen.getByTestId("studio-bg3d-mobile-more-tools-btn");
    fireEvent.click(moreToolsBtn);
    expect(moreToolsBtn.getAttribute("aria-expanded")).toBe("true");
    expect(scenePresetBtn.className).not.toContain("hidden md:inline-flex");
    expect(resetLayoutBtn.className).not.toContain("hidden md:inline-flex");
    expect(modeGroup.className).not.toContain("hidden md:inline-flex");
  });

  it("coordinates section planes with wall cutaway and generates closed solid section cap geometry", () => {
    const activeSection = {
      ...DEFAULT_STUDIO_BG3D_SECTION_PLANE_STATE,
      enabled: true,
      axis: "y" as const,
      offset: 1.2,
    };
    const result = evaluateStudioBg3dSectionCapCoordination(
      activeSection,
      DEFAULT_BG3D_WALL_CUTAWAY_CONFIG,
      {
        camera: { position: [0, 1.6, 5.2], target: [0, 1.2, 0] },
      },
    );

    expect(result.summary.enabled).toBe(true);
    expect(result.summary.cutawayEnabled).toBe(true);
    expect(result.summary.activeSectionPlaneCount).toBe(1);
    expect(result.summary.cutawayHiddenWallCount).toBeGreaterThanOrEqual(1);
    expect(result.summary.effectiveRenderStrategy).toBe("cutaway-plus-section-caps");
    expect(result.summary.capLoopCount).toBeGreaterThanOrEqual(1);
    expect(result.summary.capTriangleCount).toBeGreaterThanOrEqual(2);
    expect(result.summary.capAreaM2).toBeGreaterThan(0);
    expect(result.capPositions).not.toBeNull();
    expect(result.capIndices).not.toBeNull();
  });
});
