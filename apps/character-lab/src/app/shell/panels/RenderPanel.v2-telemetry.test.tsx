// @vitest-environment jsdom
/**
 * Wave V2-W3B UI 통합 검증:
 * - RenderPanel: 키트 머리 toonstudioFaceShadowUv 동적 분기, 4모드 안구 하이라이트 + F10 단축키, 실측 텔레메트리 Verify AI 100점 표시
 * - ParamPanel: 5대 아키타입 프리셋 클릭 시 toonstudio-kit-v2 소스 + archetypeId + 체형 파라미터 단일 Undo 전환
 * - shaper-studio-theme.css: --atelier-specular-top 및 2px inset 활성 라인 토큰 동기화 + forced-colors 폴백
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ALL_AVAILABLE_CAPABILITIES,
  KIT_V2_ARCHETYPE_PRESETS,
  KIT_V2_WEBTOON_ID,
  archetypePresetToBodyParams,
  createKitDefaultRecipe,
  createPresetCatalog,
} from "../../../contracts";
import { DEFAULT_EYEBALL_HIGHLIGHT_CONFIG } from "../../../render/render-telemetry";
import { computeEyeballHighlightTransform } from "../../../render/toon-reference";
import { createLabStore } from "../../../state/lab-store";
import { createMockEngine } from "../../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession } from "../../../testing/mock-store";

import { ParamPanel } from "./ParamPanel";
import { RenderPanel } from "./RenderPanel";

import type { EyeballHighlightConfig, EyeballHighlightPort, EyeballHighlightState, RenderTelemetryPort } from "../../../render/render-telemetry";
import type { CharacterLabRenderTelemetry } from "../../../render/style/character-verify-ai-fresh-ideas";

afterEach(cleanup);

function createTelemetryEngine(telemetry: CharacterLabRenderTelemetry) {
  const base = createMockEngine();
  let hlConfig: EyeballHighlightConfig = { ...DEFAULT_EYEBALL_HIGHLIGHT_CONFIG };
  const computeHl = (): EyeballHighlightState => {
    const out = computeEyeballHighlightTransform({
      mode: hlConfig.mode,
      eyeballEulerDeg: [0, 0, 0],
      cameraLookEulerDeg: [5, -10, 0],
      lightEulerDeg: [25, 30, 0],
      offsetPos: hlConfig.offsetPos,
      fixEyeballCam: hlConfig.fixEyeballCam,
    });
    return { ...hlConfig, ...out };
  };
  const extended: typeof base & EyeballHighlightPort & RenderTelemetryPort = Object.assign(base, {
    eyeballHighlight: () => computeHl(),
    setEyeballHighlight: (patch: Partial<EyeballHighlightConfig>) => {
      hlConfig = {
        mode: patch.mode ?? hlConfig.mode,
        offsetPos: patch.offsetPos ?? hlConfig.offsetPos,
        fixEyeballCam: patch.fixEyeballCam ?? hlConfig.fixEyeballCam,
      };
      return computeHl();
    },
    renderTelemetry: () => telemetry,
  });
  return extended;
}

describe("Wave V2-W3B: RenderPanel·ParamPanel·테마 통합", () => {
  it("RenderPanel: 키트 머리 faceShadowUv 실측 시 활성 안내, 4모드 안구 하이라이트 + F10, Verify AI 100점을 반영한다", () => {
    const kitRecipe = createKitDefaultRecipe();
    const optimalKitRecipe = {
      ...kitRecipe,
      shading: {
        ...kitRecipe.shading,
        mode: "toon" as const,
        toon: {
          ...kitRecipe.shading.toon,
          rampSteps: 3 as const,
          faceSdfShadow: true,
          outline: "hull" as const,
          rim: true,
          outlinePressure: true,
        },
      },
    };
    const engine = createTelemetryEngine({
      headContourPassActive: true,
      faceSdfAntiAliased: true,
      kitFaceShadowUvPresent: true,
      cubicMatCapActive: true,
      directionalBacklightRimActive: true,
      hairAngelRingActive: true,
      screenSpaceOutlineCompensation: true,
      coloredLineartActive: true,
      vertexTaperMaskActive: true,
      hairInlineStencilActive: true,
    });
    const status = { phase: "ready" as const, backend: "webgl2" as const, diagnostics: engine.diagnostics };
    const session = createMockEngineSession(status);
    session.setEngine(engine);
    const store = createLabStore({
      catalog: createPresetCatalog([]),
      initial: {
        recipe: optimalKitRecipe,
        engine: status,
      },
    });

    render(
      <MockLabProvider store={store} engineSession={session}>
        <RenderPanel pollIntervalMs={0} />
      </MockLabProvider>,
    );

    // 1) 키트 머리 SDF 정면 좌표 실측 동적 분기
    expect(screen.getByText(/toonstudioFaceShadowUv/u).textContent).toContain("활성 상태로 적용됩니다");
    expect(screen.queryByText(/키트는 얼굴 SDF 그림자를 쓰지 않음/u)).toBeNull();

    // 2) Verify AI 실측 100점 표시
    expect(screen.getByTestId("character-lab-verify-ai-badge").textContent).toContain("100점");
    expect(screen.getByTestId("character-lab-verify-ai-badge").textContent).toContain("C_ID 100");
    expect(screen.getByTestId("character-lab-verify-ai-badge").textContent).toContain("SDF 100");

    // 3) 4모드 안구 하이라이트 + F10 단축키 토글
    const modeSelect = screen.getByTestId("eyeball-highlight-mode-select") as HTMLSelectElement;
    expect(modeSelect.value).toBe("cam");
    fireEvent.change(modeSelect, { target: { value: "light" } });
    expect(modeSelect.value).toBe("light");
    expect(screen.getByTestId("eyeball-highlight-readout").textContent).toContain("F10 해제");

    fireEvent.keyDown(window, { key: "F10" });
    expect(screen.getByTestId("eyeball-highlight-readout").textContent).toContain("F10 고정");
    expect((screen.getByTestId("eyeball-highlight-f10-toggle") as HTMLInputElement).checked).toBe(true);
  });

  it("ParamPanel: 5대 아키타입 프리셋 클릭이 toonstudio-kit-v2 소스와 체형 파라미터를 단일 Undo로 전환한다", () => {
    const store = createLabStore({
      catalog: createPresetCatalog([]),
      initial: { capabilities: ALL_AVAILABLE_CAPABILITIES },
    });
    render(
      <MockLabProvider store={store}>
        <ParamPanel />
      </MockLabProvider>,
    );

    fireEvent.click(screen.getByTestId("kit-v2-archetype-sd-chibi"));
    const state = store.getState();
    const preset = KIT_V2_ARCHETYPE_PRESETS["sd-chibi"];
    expect(state.recipe.body).toEqual(archetypePresetToBodyParams(preset));
    expect(state.recipe.source).toEqual({
      kind: "kit",
      kitId: KIT_V2_WEBTOON_ID,
      baseId: "female",
      kitVersion: 2,
      archetypeId: "sd-chibi",
    });
    expect(state.history.depth).toBe(1);
  });

  it("shaper-studio-theme.css가 --atelier-specular-top 및 2px inset 활성 라인 토큰을 동기화하고 forced-colors에서 해제한다", () => {
    const cssPath = path.resolve(import.meta.dirname, "../../styles/shaper-studio-theme.css");
    const css = readFileSync(cssPath, "utf8");
    expect(css).toContain("--atelier-specular-top:");
    expect(css).toContain("--atelier-specular-active:");
    expect(css).toContain("--atelier-active-line-bottom: inset 0 -2px 0 var(--lab-accent);");
    expect(css).toContain("--atelier-active-line-left: inset 2px 0 0 var(--lab-accent);");
    expect(css).toMatch(/@media \(forced-colors: active\)\s*\{[^}]*--atelier-specular-top:\s*none;/u);
  });
});
