// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioTooningEditorBubbleCharacterPanel } from "../StudioTooningEditorBubbleCharacterPanel";
import {
  buildEdEditableCutSvgPath,
  buildEdMultiAngleCameraPrompt,
  computeMgPostProcessingBitmask,
  createDefaultEdProceduralBubbleParams,
  createDefaultEdSmartCharacterState,
  createDefaultMgAdvancedRenderSettings,
  ED_ARTBOARD_PRESETS,
  ED_CUSTOM_ARTBOARD_LIMITS,
  ED_EXPO_STYLE_TRANSFER_PRESETS,
  ED_MANNEQUIN_10_FINGERS,
  ED_MANNEQUIN_19_MIXAMO_JOINTS,
  ED_MAX_PAGES,
  ED_SMART_CHARACTER_PART_SLOTS,
  ED_TTS_SUPPORTED_LANGUAGES,
  generateEdProceduralSpeechBubbleSvgPath,
  mergeEdSpeechBubbles,
  MG_ASPECT_RATIO_SPECS,
  prepareMgMultiImageRetouchJob,
  snapEdImageFilterValue,
} from "../studio-tooning-editor-magic-suite";

describe("Tooning Editor (ED) & Tooning Magic (MG) Engine", () => {
  it("defines 9 artboard size presets, 20-page limit, 16 smart character slots, 19 mannequin joints, and 10 fingers", () => {
    expect(ED_MAX_PAGES).toBe(20);
    expect(ED_ARTBOARD_PRESETS).toHaveLength(9);
    expect(ED_CUSTOM_ARTBOARD_LIMITS.maxHeightPx).toBe(30000);
    expect(ED_SMART_CHARACTER_PART_SLOTS).toHaveLength(16);
    expect(ED_MANNEQUIN_19_MIXAMO_JOINTS).toHaveLength(19);
    expect(ED_MANNEQUIN_10_FINGERS).toHaveLength(10);
    expect(ED_EXPO_STYLE_TRANSFER_PRESETS).toHaveLength(7);
    expect(ED_TTS_SUPPORTED_LANGUAGES).toHaveLength(11);
    expect(MG_ASPECT_RATIO_SPECS).toHaveLength(5);
  });

  it("generates procedural SVG paths for all 6 speech bubble shapes and merges 2..5 bubbles", () => {
    for (const shape of [
      "Rectangle",
      "Ellipse",
      "Thought",
      "Shout",
      "SelfTalk",
      "Squircle",
    ] as const) {
      const params = createDefaultEdProceduralBubbleParams(shape, "Action");
      const svg = generateEdProceduralSpeechBubbleSvgPath(params);
      expect(svg.bodyPathD.startsWith("M")).toBe(true);
      expect(svg.bodyPathD.endsWith("Z")).toBe(true);
      if (shape === "SelfTalk") {
        expect(svg.strokeDasharray).toBeDefined();
      }
    }

    const singleFail = mergeEdSpeechBubbles([
      {
        id: "b1",
        params: createDefaultEdProceduralBubbleParams(),
        offsetX: 0,
        offsetY: 0,
      },
    ]);
    expect(singleFail.merged).toBe(false);

    const validMerge = mergeEdSpeechBubbles([
      {
        id: "b1",
        params: createDefaultEdProceduralBubbleParams("Ellipse"),
        offsetX: 0,
        offsetY: 0,
      },
      {
        id: "b2",
        params: createDefaultEdProceduralBubbleParams("Shout"),
        offsetX: 120,
        offsetY: 20,
      },
    ]);
    expect(validMerge.merged).toBe(true);
    expect(validMerge.sourceBubbleIds).toEqual(["b1", "b2"]);
    expect(validMerge.compoundSvgPathD).toContain("bubble:b1");
    expect(validMerge.compoundSvgPathD).toContain("bubble:b2");
  });

  it("builds <sks> multi-angle camera prompts, snaps image filter values within ±5 to 0, and computes Magic bitmask", () => {
    const sksPrompt = buildEdMultiAngleCameraPrompt({
      azimuthDeg: 45,
      elevationDeg: -30,
      distanceMultiplier: 0.6,
      subjectDescription: "heroic knight",
    });
    expect(sksPrompt).toBe(
      "<sks> front-right quarter view, low-angle shot, close-up, heroic knight",
    );

    expect(snapEdImageFilterValue(4)).toBe(0);
    expect(snapEdImageFilterValue(-5)).toBe(0);
    expect(snapEdImageFilterValue(12)).toBe(12);

    const defaults = createDefaultMgAdvancedRenderSettings();
    expect(computeMgPostProcessingBitmask(defaults)).toBe(5); // FaceDetailer(4) + 1 = 5
    expect(
      computeMgPostProcessingBitmask({
        isFaceDetailer: true,
        isRemoveBackground: true,
        isColorBlend: true,
      }),
    ).toBe(8); // 4 + 2 + 1 + 1 = 8
    expect(
      computeMgPostProcessingBitmask({
        isFaceDetailer: false,
        isRemoveBackground: false,
        isColorBlend: false,
      }),
    ).toBe(1);

    const retouchOk = prepareMgMultiImageRetouchJob({
      model: "SmartRetouchPro",
      referenceImageUrls: ["a.png", "b.png"],
      editInstruction: "add rim lighting",
    });
    expect(retouchOk.valid).toBe(true);
    expect(retouchOk.compiledPrompt).toContain("[SmartRetouchPro · refs:2]");

    const retouchTooMany = prepareMgMultiImageRetouchJob({
      model: "Seedream",
      referenceImageUrls: ["1", "2", "3", "4", "5", "6"],
      editInstruction: "edit",
    });
    expect(retouchTooMany.valid).toBe(false);
  });

  it("creates 16-slot 2D smart character state and editable polygon cut SVG path", () => {
    const smart = createDefaultEdSmartCharacterState("hero-set");
    expect(Object.keys(smart.partPresets)).toHaveLength(16);
    expect(smart.partPresets.front_hair).toBe("hero-set-front_hair-01");

    const cutPath = buildEdEditableCutSvgPath([
      { x: 0, y: 0, cornerRadius: 8 },
      { x: 100, y: 0, cornerRadius: 8 },
      { x: 100, y: 100, cornerRadius: 8 },
    ]);
    expect(cutPath).toContain("r=8");
  });

  it("renders StudioTooningEditorBubbleCharacterPanel and switches across bubble, smart character, and editable cut tabs", () => {
    const onInsertBubble = vi.fn();
    render(<StudioTooningEditorBubbleCharacterPanel onInsertBubble={onInsertBubble} />);

    expect(screen.getByTestId("tooning-editor-bubble-character-panel")).toBeTruthy();
    expect(screen.getByTestId("ed-procedural-bubble-tab")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /그룹 말풍선 병합/u }));
    expect(screen.getByText(/말풍선 불리언 병합 완료/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "캔버스에 추가" }));
    expect(onInsertBubble).toHaveBeenCalledWith("shout");

    fireEvent.click(screen.getByRole("tab", { name: /16파츠 캐릭터/u }));
    expect(screen.getByTestId("ed-smart-character-tab")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /가변 컷·9종 대지/u }));
    expect(screen.getByTestId("ed-editable-cut-tab")).toBeTruthy();
  });
});
