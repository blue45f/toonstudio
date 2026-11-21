// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Studio3dHeadMixerPanel } from "./Studio3dHeadMixerPanel";
import {
  HEAD_PART_SLIDER_SPECS,
  WEBTOON_HEAD_STYLE_IDS,
  buildLoomisHeadGuide3D,
  createDefaultHeadMixerState,
  normalizeHeadStyleWeights,
  projectLoomisGuideTo2D,
  resolveHeadMixerMorphTargets,
  setSingleHeadStylePreset,
  toAvatarForgeSemanticFaceMorphs,
  toggleHeadSymmetryMode,
  updateHeadPartSlider,
  updateHeadStyleWeight,
} from "./studio-3d-head-mixer";

afterEach(() => {
  cleanup();
});

describe("studio-3d-head-mixer", () => {
  it("provides 9 webtoon head styles and 30+ independent part sliders with normalized blending", () => {
    expect(WEBTOON_HEAD_STYLE_IDS).toHaveLength(9);
    expect(HEAD_PART_SLIDER_SPECS.length).toBeGreaterThanOrEqual(30);

    const normalized = normalizeHeadStyleWeights({
      "rofan-noble": 0.6,
      "chibi-sd": 0.6,
    });
    expect(normalized["rofan-noble"]).toBeCloseTo(0.5, 6);
    expect(normalized["chibi-sd"]).toBeCloseTo(0.5, 6);
    const total = WEBTOON_HEAD_STYLE_IDS.reduce((sum, id) => sum + normalized[id], 0);
    expect(total).toBeCloseTo(1, 6);

    const mixedState = updateHeadStyleWeight(
      setSingleHeadStylePreset(createDefaultHeadMixerState(), "rofan-noble"),
      "chibi-sd",
      1,
    );
    const resolved = resolveHeadMixerMorphTargets(mixedState);
    // rofan-noble eyeSize(0.35)와 chibi-sd eyeSize(0.85)의 50:50 평균은 0.60
    expect(resolved.blendedBaseParts.eyeSize).toBeCloseTo(0.6, 5);
    const bridge = toAvatarForgeSemanticFaceMorphs(resolved);
    expect(bridge.eyeSize).toBeCloseTo(0.6, 5);
  });

  it("supports symmetric and independent asymmetric left/right morph targets", () => {
    let state = createDefaultHeadMixerState("modern-drama");
    state = toggleHeadSymmetryMode(state, "asymmetric");
    state = updateHeadPartSlider(state, "eyeTilt", 0.4, "left");
    state = updateHeadPartSlider(state, "eyeTilt", -0.25, "right");

    const resolved = resolveHeadMixerMorphTargets(state);
    expect(resolved.leftParts.eyeTilt).toBeCloseTo(0.4, 5);
    expect(resolved.rightParts.eyeTilt).toBeCloseTo(-0.25, 5);
    expect(resolved.morphTargetWeights.head_eyeTilt_L).toBeCloseTo(0.4, 5);
    expect(resolved.morphTargetWeights.head_eyeTilt_R).toBeCloseTo(-0.25, 5);

    const backToSymmetric = resolveHeadMixerMorphTargets(toggleHeadSymmetryMode(state, "symmetric"));
    expect(backToSymmetric.leftParts.eyeTilt).toBeCloseTo(backToSymmetric.rightParts.eyeTilt, 6);
    expect(backToSymmetric.morphTargetWeights.head_eyeTilt).toBeDefined();
  });

  it("builds 3D Loomis skull/temple/third-plane guides and projects them cleanly to 2D", () => {
    const resolved = resolveHeadMixerMorphTargets(createDefaultHeadMixerState("rofan-noble"));
    const guide = buildLoomisHeadGuide3D(resolved, 16);

    expect(guide.thirdPlanesY.hairlineY).toBeGreaterThan(guide.thirdPlanesY.browY);
    expect(guide.thirdPlanesY.browY).toBeGreaterThan(guide.thirdPlanesY.noseBaseY);
    expect(guide.thirdPlanesY.noseBaseY).toBeGreaterThan(guide.thirdPlanesY.chinY);
    expect(guide.facialCenterline.length).toBeGreaterThanOrEqual(6);
    expect(guide.leftTempleOval.length).toBe(17);
    expect(guide.rightTempleOval.length).toBe(17);

    // 단위 행렬(orthographic NDC)로 투영 시 뷰포트 중앙에 배치되어야 한다.
    const identity4x4 = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const projected = projectLoomisGuideTo2D(guide, identity4x4, { width: 1000, height: 1000 });
    expect(projected.facialCenterline[0][0]).toBeCloseTo(500, 3);
    expect(projected.facialCenterline[0][1]).toBeLessThan(projected.facialCenterline.at(-1)![1]);
  });

  it("renders Studio3dHeadMixerPanel with 9 presets, symmetry switch, and region tabs", () => {
    const onChange = vi.fn();
    render(
      <Studio3dHeadMixerPanel
        state={createDefaultHeadMixerState("modern-drama")}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("button", { name: /로판 귀족/u })).toBeTruthy();
    expect(screen.getByRole("button", { name: /SD 미니/u })).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: /좌우 비대칭 편집/u }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ symmetryMode: "asymmetric" }));

    fireEvent.click(screen.getByRole("tab", { name: "턱" }));
    expect(screen.getByLabelText("턱끝 길이")).toBeTruthy();
  });
});
