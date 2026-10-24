// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_BG3D_GENRE_SCENE_PACK_BUNDLE_LINKS } from "./studio-bg3d-genre-scene-pack-links";
import {
  STUDIO_BG3D_HDRI_ENVIRONMENT_ASSETS,
  resolveStudioBg3dHdriEnvironmentLocalUrl,
} from "./studio-bg3d-hdri-environment-assets";
import {
  STUDIO_BG3D_HDRI_LIGHTING_PRESETS,
  getStudioBg3dHdriLightingPreset,
} from "./studio-bg3d-hdri-lighting-presets";
import { STUDIO_BG3D_SCENE_COMPOSITION_PRESETS } from "./studio-bg3d-scene-composition-presets";
import { StudioBg3dLightingStudio } from "./StudioBg3dLightingStudio";
import { StudioBg3dSceneCompositionPresetPanel } from "./StudioBg3dSceneCompositionPresetPanel";

import type { StudioBg3dLightingStudioProps } from "./StudioBg3dLightingStudio";

import type {
  StudioBg3dCameraSettings,
  StudioBg3dLightingSettings,
} from "./studio-bg3d-scene-document";

// 무거운 패널 렌더가 병렬 실행 부하에서 5초를 넘길 수 있어 타임아웃을 늘립니다.
vi.setConfig({ testTimeout: 30000 });

const daylight = getStudioBg3dHdriLightingPreset("daylight")!;
const PUBLIC_ROOT = resolve(import.meta.dirname, "../../../../public");

function renderStudio(overrideLighting?: StudioBg3dLightingSettings) {
  const onUpdateLighting = vi.fn();
  const onUpdateExposure = vi.fn();
  const onCommitLightingHistory = vi.fn();
  const onApplyHdriSunTime = vi.fn();
  const onLinkHdriWeatherPreset = vi.fn();
  const props: StudioBg3dLightingStudioProps = {
    lighting: overrideLighting ?? daylight.lighting,
    exposure: daylight.exposure,
    onUpdateLighting,
    onUpdateExposure,
    onCommitLightingHistory,
    onApplyHdriSunTime,
    onLinkHdriWeatherPreset,
  };
  const view = render(<StudioBg3dLightingStudio {...props} />);
  return { view, onUpdateLighting, onUpdateExposure, onCommitLightingHistory, onApplyHdriSunTime, onLinkHdriWeatherPreset };
}

describe("StudioBg3dLightingStudio HDRI gallery", () => {
  afterEach(cleanup);

  it("verifies all 6 bundled Poly Haven .hdr files exist in public/assets/3d/hdri with matching byteSize, md5, and RADIANCE header", () => {
    expect(STUDIO_BG3D_HDRI_ENVIRONMENT_ASSETS).toHaveLength(3);
    for (const asset of STUDIO_BG3D_HDRI_ENVIRONMENT_ASSETS) {
      for (const tier of ["1k", "2k"] as const) {
        const meta = asset.files[tier];
        const publicUrl = resolveStudioBg3dHdriEnvironmentLocalUrl(asset, tier);
        const filePath = resolve(PUBLIC_ROOT, publicUrl.replace(/^\//u, ""));
        expect(existsSync(filePath), `missing HDR file: ${publicUrl}`).toBe(true);
        const stat = statSync(filePath);
        expect(stat.size).toBe(meta.byteSize);
        const buffer = readFileSync(filePath);
        expect(buffer.subarray(0, 10).toString("ascii")).toBe("#?RADIANCE");
        const md5 = createHash("md5").update(buffer).digest("hex");
        expect(md5).toBe(meta.md5);
      }
    }
  });

  it("renders 4 HDRI presets with bilingual labels and tooltips", () => {
    renderStudio();
    expect(screen.getByText("HDRI 조명 프리셋")).toBeDefined();
    for (const preset of STUDIO_BG3D_HDRI_LIGHTING_PRESETS) {
      const button = screen.getByTestId(`bg3d-hdri-lighting-preset-${preset.id}`);
      expect(button.getAttribute("aria-pressed")).toBe(
        preset.id === "daylight" ? "true" : "false",
      );
      expect(button.getAttribute("title")).toBe(preset.tooltipKo);
    }
  });

  it("applies lighting, exposure, sun time and weather link on preset click", () => {
    const { onUpdateLighting, onUpdateExposure, onCommitLightingHistory, onApplyHdriSunTime, onLinkHdriWeatherPreset } = renderStudio();
    const twilight = getStudioBg3dHdriLightingPreset("twilight")!;

    fireEvent.click(screen.getByTestId("bg3d-hdri-lighting-preset-twilight"));

    expect(onUpdateLighting).toHaveBeenCalledOnce();
    expect(onUpdateLighting).toHaveBeenCalledWith(twilight.lighting);
    expect(onUpdateExposure).toHaveBeenCalledOnce();
    expect(onUpdateExposure).toHaveBeenCalledWith(twilight.exposure);
    expect(onApplyHdriSunTime).toHaveBeenCalledOnce();
    expect(onApplyHdriSunTime).toHaveBeenCalledWith(twilight.sunTimeHours);
    expect(onLinkHdriWeatherPreset).toHaveBeenCalledOnce();
    expect(onLinkHdriWeatherPreset).toHaveBeenCalledWith(
      twilight.weatherPresetId,
      twilight.sunTimeHours,
    );
    expect(onCommitLightingHistory).toHaveBeenCalledOnce();
  });

  it("marks the resolved HDRI preset in the summary line and shows the weather badge", () => {
    const lighting = daylight.lighting satisfies StudioBg3dLightingSettings;
    render(
      <StudioBg3dLightingStudio
        lighting={lighting}
        exposure={daylight.exposure}
        linkedWeatherPresetId={daylight.weatherPresetId}
        onUpdateLighting={vi.fn()}
        onUpdateExposure={vi.fn()}
      />,
    );
    expect(screen.getByText("날씨 연동 중")).toBeDefined();
    expect(screen.getByTestId("bg3d-hdri-lighting-preset-daylight").getAttribute("aria-pressed")).toBe("true");
  });

  it("works without the optional sun-time and weather callbacks", () => {
    const onUpdateLighting = vi.fn();
    const onUpdateExposure = vi.fn();
    render(
      <StudioBg3dLightingStudio
        lighting={daylight.lighting}
        exposure={daylight.exposure}
        onUpdateLighting={onUpdateLighting}
        onUpdateExposure={onUpdateExposure}
      />,
    );
    fireEvent.click(screen.getByTestId("bg3d-hdri-lighting-preset-night"));
    expect(onUpdateLighting).toHaveBeenCalledOnce();
    expect(onUpdateExposure).toHaveBeenCalledOnce();
  });

  it("switches HDRI environment map between procedural and Poly Haven .hdr assets and updates intensity, rotation, and background sky toggle", () => {
    const { onUpdateLighting, onCommitLightingHistory } = renderStudio();
    const hdriSection = screen.getByTestId("bg3d-hdri-environment-controls");
    expect(within(hdriSection).getByText("HDRI 환경광(IBL) 맵 · 회전 · 세기")).toBeDefined();

    // Select cobblestone-street-night HDRI map
    const nightHdriButton = screen.getByTestId("bg3d-hdri-map-cobblestone-street-night");
    fireEvent.click(nightHdriButton);
    expect(onUpdateLighting).toHaveBeenCalledWith({
      environment: {
        source: "hdri",
        assetId: "cobblestone-street-night",
        intensity: 1,
        rotationDegrees: 0,
        useAsBackground: false,
      },
    });
    expect(onCommitLightingHistory).toHaveBeenCalledOnce();

    // Re-render with konigsallee selected and test procedural switch + sliders + toggle
    cleanup();
    const activeHdriLighting: StudioBg3dLightingSettings = {
      ...daylight.lighting,
      environment: {
        source: "hdri",
        assetId: "konigsallee",
        intensity: 1.25,
        rotationDegrees: 90,
        useAsBackground: false,
      },
    };
    const next = renderStudio(activeHdriLighting);
    expect(
      screen.getByTestId("bg3d-hdri-map-konigsallee").getAttribute("aria-pressed"),
    ).toBe("true");

    const rotationSlider = screen.getByLabelText("HDRI 수평 회전", { selector: "input" });
    fireEvent.change(rotationSlider, { target: { value: "180" } });
    expect(next.onUpdateLighting).toHaveBeenCalledWith({
      environment: {
        source: "hdri",
        assetId: "konigsallee",
        intensity: 1.25,
        rotationDegrees: 180,
        useAsBackground: false,
      },
    });

    const bgToggle = within(screen.getByTestId("bg3d-hdri-environment-controls")).getByRole(
      "switch",
    );
    fireEvent.click(bgToggle);
    expect(next.onUpdateLighting).toHaveBeenCalledWith({
      environment: {
        source: "hdri",
        assetId: "konigsallee",
        intensity: 1.25,
        rotationDegrees: 90,
        useAsBackground: true,
      },
    });

    fireEvent.click(screen.getByTestId("bg3d-hdri-map-procedural"));
    expect(next.onUpdateLighting).toHaveBeenCalledWith({
      environment: {
        source: "procedural",
        assetId: null,
        intensity: 1.25,
        rotationDegrees: 90,
        useAsBackground: false,
      },
    });
  });

  it("renders StudioBg3dSceneCompositionPresetPanel with 16 genre packs, Creator Bundle badges, and mounts in StudioBg3dViewPanelContent", () => {
    const baseCamera: StudioBg3dCameraSettings = {
      position: [4, 3, 6],
      target: [0, 0.6, 0],
      fovDegrees: 50,
      projection: "perspective",
      zoom: 1,
    };
    const onApplyScenePack = vi.fn();
    render(
      <StudioBg3dSceneCompositionPresetPanel
        camera={baseCamera}
        lighting={daylight.lighting}
        exposure={daylight.exposure}
        onApplyScenePack={onApplyScenePack}
      />,
    );

    const panel = screen.getByTestId("bg3d-scene-composition-presets");
    expect(panel).toBeDefined();
    for (const preset of STUDIO_BG3D_SCENE_COMPOSITION_PRESETS) {
      expect(screen.getByTestId(`bg3d-scene-composition-preset-${preset.id}`)).toBeDefined();
    }
    for (const bundleLink of STUDIO_BG3D_GENRE_SCENE_PACK_BUNDLE_LINKS) {
      const badge = screen.getByTestId(`bg3d-scene-pack-bundle-link-${bundleLink.presetId}`);
      expect(badge.textContent).toContain(`번들 팩 ${bundleLink.packs.length}종`);
      expect(badge.textContent).toContain(`에셋 ${bundleLink.totalPlaceable}개`);
    }

    fireEvent.click(screen.getByTestId("bg3d-scene-composition-preset-fantasy-forest-shrine"));
    expect(onApplyScenePack).toHaveBeenCalledOnce();
    expect(onApplyScenePack.mock.calls[0]?.[0]?.presetId).toBe("fantasy-forest-shrine");

    const viewPanelSource = readFileSync(
      resolve(import.meta.dirname, "StudioBg3dViewPanelContent.tsx"),
      "utf8",
    );
    expect(viewPanelSource).toContain("<StudioBg3dSceneCompositionPresetPanel");
    expect(viewPanelSource).toContain("onApplyScenePack={(result) => {");
  });
});

