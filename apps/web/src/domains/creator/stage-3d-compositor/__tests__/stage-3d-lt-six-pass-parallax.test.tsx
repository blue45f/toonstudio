// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LT_SIX_PASS_ORDER } from "../../lt-convert/studio-lt-six-pass-parallax";
import { Studio3dBgCharacterCompositorPanel } from "../Studio3dBgCharacterCompositorPanel";
import {
  buildCompositeCutLayerPlan,
  createInitialStageCompositeState,
  generateStageCrowdExtras,
  getStageBackgroundSlot,
  harmonizeStageLightingAndInk,
} from "../stage-3d-bg-character-compositor";

afterEach(cleanup);

describe("축 07 · Stage 3D Compositor Z-Depth 감쇠 LT · 6패스 자동 그룹 · 유리/철망 알파 컷아웃 통합 (#031–#035)", () => {
  it("buildCompositeCutLayerPlan이 기존 5레이어 베이크를 유지하면서 6패스 LT 자동 그룹·깊이별 선 굵기·유리/철망 노멀 보호를 연결한다", () => {
    const state = {
      ...createInitialStageCompositeState("seoul-rooftop-cafe-terrace"),
      crowdDensity: "medium" as const,
      ltDepthPreset: "character-focus" as const,
    };
    const bg = getStageBackgroundSlot(state.backgroundId);
    const harmony = harmonizeStageLightingAndInk({
      background: bg,
      characters: state.characters,
      timeOfDay: state.timeOfDay,
      celPresetId: state.celPresetId,
      inkPx: state.inkPx,
      aspectRatio: state.aspectRatio,
    });
    const crowdExtras = generateStageCrowdExtras({
      background: bg,
      characters: state.characters,
      framingId: state.framingId,
      density: state.crowdDensity,
    });

    const plan = buildCompositeCutLayerPlan({ state, harmony, crowdExtras });

    // 기존 5레이어 계약 유지
    expect(plan.layers).toHaveLength(5);

    // 신규 6패스 LT 자동 그룹 & 시차 바인딩 계약 검증
    const bundle = plan.ltSixPassBundle;
    expect(bundle.presetId).toBe("character-focus");
    expect(bundle.presetLabelKo).toBe("인물 집중");
    expect(bundle.depthWidthSummary).toEqual({ nearPx: 1.8, midPx: 1.1, farPx: 0.5 });
    expect(bundle.group.passes).toHaveLength(6);
    expect(bundle.group.passes.map((p) => p.passId)).toEqual(LT_SIX_PASS_ORDER);

    // 옥상 카페 배경의 철망 난간·유리 파티션 알파 컷아웃 노멀 패스 분리 보호 검증
    expect(bundle.normalPassAlphaCutoutGuardActive).toBe(true);
    expect(bundle.alphaCutoutMaterials.some((m) => m.kind === "wire-mesh")).toBe(true);
    expect(bundle.alphaCutoutMaterials.some((m) => m.kind === "glass-mullion")).toBe(true);
    expect(bundle.alphaCutoutMaterials.every((m) => m.excludeFromNormalPass && m.routeToMaskPassCode === "06_LT_ALPHA_MASK")).toBe(true);

    // 카메라에 가까운 캐릭터가 원경 배경 군중보다 굵은 깊이 감쇠 선화를 할당받는다
    const charWidths = bundle.subjects.filter((s) => s.subjectKind === "character").map((s) => s.attenuatedLineWidthPx);
    const crowdWidths = bundle.subjects.filter((s) => s.subjectKind === "crowd-extra").map((s) => s.attenuatedLineWidthPx);
    expect(Math.max(...charWidths)).toBeGreaterThan(Math.min(...crowdWidths));

    // 시차 프리뷰: 근경 > 중경 > 원경
    const parallax = bundle.referenceParallaxPreview;
    expect(parallax.byBand.foreground.offsetXPx).toBeGreaterThan(parallax.byBand.midground.offsetXPx);
    expect(parallax.byBand.midground.offsetXPx).toBeGreaterThan(parallax.byBand.background.offsetXPx);
  });

  it("건축 강조 프리셋 전환 시 시차 계수와 Z-Depth 프리셋이 즉시 반영된다", () => {
    const baseState = createInitialStageCompositeState("rofan-imperial-arch-chandelier");
    const bg = getStageBackgroundSlot(baseState.backgroundId);
    const harmony = harmonizeStageLightingAndInk({
      background: bg,
      characters: baseState.characters,
      timeOfDay: baseState.timeOfDay,
      celPresetId: baseState.celPresetId,
      inkPx: baseState.inkPx,
      aspectRatio: baseState.aspectRatio,
    });

    const charPlan = buildCompositeCutLayerPlan({
      state: { ...baseState, ltDepthPreset: "character-focus" },
      harmony,
      crowdExtras: [],
    });
    const archPlan = buildCompositeCutLayerPlan({
      state: { ...baseState, ltDepthPreset: "architecture-emphasis" },
      harmony,
      crowdExtras: [],
    });

    expect(archPlan.ltSixPassBundle.presetLabelKo).toBe("건축 강조");
    expect(archPlan.ltSixPassBundle.group.parallaxContract.bands[2].parallaxFactor).toBeGreaterThan(
      charPlan.ltSixPassBundle.group.parallaxContract.bands[2].parallaxFactor,
    );
  });

  it("Studio3dBgCharacterCompositorPanel 상세 설정에서 인물 집중 / 건축 강조 Z-Depth LT 프리셋을 전환할 수 있다", () => {
    render(<Studio3dBgCharacterCompositorPanel initialBackgroundId="seoul-rooftop-cafe-terrace" />);
    fireEvent.click(screen.getByText(/상세 설정/));

    const charBtn = screen.getByRole("button", { name: "인물 집중" });
    const archBtn = screen.getByRole("button", { name: "건축 강조" });
    expect(charBtn.getAttribute("aria-pressed")).toBe("true");
    expect(archBtn.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/유리\/철망 알파 컷아웃 노멀 분리/)).toBeDefined();

    fireEvent.click(archBtn);
    expect(archBtn.getAttribute("aria-pressed")).toBe("true");
    expect(charBtn.getAttribute("aria-pressed")).toBe("false");
  });
});
