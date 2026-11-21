// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioStoryToWebtoonStartupWorkbench } from "./StudioStoryToWebtoonStartupWorkbench";
import {
  applyToneVariationToPlan,
  autoArrangeAllPlanCuts,
  buildStudio2dFountainScript,
  buildTeamDivisionHandoffPacket,
  buildTooning3dStageHandoff,
  computeSmartBubbleLayout,
  createPlanFromSampleScenario,
  generateTooningEpisodePlan,
  rectsOverlap,
  serializeTooningPacketToJson,
  serializeTooningPacketToText,
  TOONING_BACKGROUNDS,
  TOONING_BUBBLE_STYLES,
  TOONING_CAMERAS,
  TOONING_CHARACTERS,
  TOONING_EXPRESSIONS,
  TOONING_GENRES,
  TOONING_POSES,
  TOONING_SAMPLE_SCENARIOS,
  TOONING_SFX_PRESETS,
  TOONING_TEAM_STAGES,
  TOONING_TONES,
  updatePlanCut,
  type TooningSpeakerPosition,
} from "./tooning-plus-allinone-engine";
import { TooningPlusAllInOneSection } from "./TooningPlusAllInOneSection";

afterEach(cleanup);

describe("tooning-plus-allinone-engine", () => {
  it("provides the full clean-room catalog for stories, 3D studio, smart bubbles, and 6-stage team division", () => {
    expect(TOONING_GENRES).toHaveLength(5);
    expect(TOONING_TONES).toHaveLength(4);
    expect(TOONING_CHARACTERS).toHaveLength(8);
    expect(TOONING_POSES).toHaveLength(12);
    expect(TOONING_EXPRESSIONS).toHaveLength(10);
    expect(TOONING_CAMERAS).toHaveLength(8);
    expect(TOONING_BACKGROUNDS).toHaveLength(6);
    expect(TOONING_SFX_PRESETS.length).toBeGreaterThanOrEqual(5);
    expect(TOONING_BUBBLE_STYLES).toHaveLength(4);
    expect(TOONING_TEAM_STAGES).toHaveLength(6);
    expect(TOONING_SAMPLE_SCENARIOS).toHaveLength(5);
  });

  it("generates 4, 6, and 8 cut episode plans with 2~3 speakers and supports 1-click tone variations", () => {
    const plan6 = generateTooningEpisodePlan({
      keywordKo: "봉인된 청룡의 검",
      keywordEn: "Sealed Azure Blade",
      genreId: "action",
      toneId: "serious",
      cutCount: 6,
      speakers: [
        { slotIndex: 0, characterId: "taeo" },
        { slotIndex: 1, characterId: "yuna" },
        { slotIndex: 2, characterId: "doyun" },
      ],
    });

    expect(plan6.cuts).toHaveLength(6);
    expect(plan6.cuts[0]?.beatStage).toBe("intro");
    expect(plan6.cuts[5]?.beatStage).toBe("climax");
    expect(new Set(plan6.cuts.map((c) => c.characterId)).size).toBe(3);

    const edited = updatePlanCut(plan6, 1, {
      dialogueKo: "내가 직접 균열을 닫겠다.",
      dialogueEn: "I will seal this rift myself.",
      customEdited: true,
    });
    const comicShifted = applyToneVariationToPlan(edited, "comic");
    expect(comicShifted.toneId).toBe("comic");
    expect(comicShifted.cuts[0]?.dialogueKo).toContain("내가 직접 균열을 닫겠다.");
    expect(comicShifted.cuts[1]?.expressionId).toBe("panic");

    const plan8 = generateTooningEpisodePlan({
      keywordKo: "황실 비밀 계약서",
      keywordEn: "Imperial Secret Pact",
      genreId: "rofan",
      toneId: "touching",
      cutCount: 8,
      speakers: [
        { slotIndex: 0, characterId: "seoyeon" },
        { slotIndex: 1, characterId: "doyun" },
      ],
    });
    expect(plan8.cuts).toHaveLength(8);
  });

  it("computes non-overlapping smart bubble and SFX layouts across all positions, styles, and cameras", () => {
    const positions: readonly TooningSpeakerPosition[] = ["left", "center", "right"];
    for (const speakerPosition of positions) {
      for (const bubbleStyle of TOONING_BUBBLE_STYLES) {
        for (const camera of TOONING_CAMERAS) {
          const layout = computeSmartBubbleLayout({
            speakerPosition,
            bubbleStyle: bubbleStyle.id,
            cameraId: camera.id,
            dialogueLength: 42,
          });
          expect(layout.hasBubbleCharacterOverlap).toBe(false);
          expect(layout.hasBubbleSfxOverlap).toBe(false);
          expect(rectsOverlap(layout.bubbleBox, layout.characterHeadBox)).toBe(false);
          expect(rectsOverlap(layout.bubbleBox, layout.sfxBox)).toBe(false);
        }
      }
    }
  });

  it("builds 3D stage handoff data and 6-stage team division packets with text and JSON export", () => {
    const basePlan = createPlanFromSampleScenario("sample-action");
    const arranged = autoArrangeAllPlanCuts(basePlan);
    const stage3d = buildTooning3dStageHandoff(arranged);

    expect(stage3d.schemaVersion).toBe("toonstudio.3d-stage-handoff/1");
    expect(stage3d.cuts).toHaveLength(4);
    expect(stage3d.cuts[0]?.camera.lensMm).toBeGreaterThanOrEqual(24);
    expect(Object.keys(stage3d.cuts[0]?.blendshapes ?? {}).length).toBeGreaterThan(0);

    const teamPacket = buildTeamDivisionHandoffPacket(arranged, "team", new Set(["story-1", "bg3d-1"]));
    expect(teamPacket.stages).toHaveLength(6);
    expect(teamPacket.stages.map((s) => s.labelKo)).toEqual([
      "스토리",
      "콘티",
      "3D배경",
      "선화",
      "채색",
      "식자",
    ]);
    expect(teamPacket.completedChecklistCount).toBe(2);
    expect(teamPacket.totalChecklistCount).toBe(12);

    const soloPacket = buildTeamDivisionHandoffPacket(arranged, "solo", new Set());
    expect(soloPacket.stages[0]?.ownerKo).toContain("1인 작가");

    const textExport = serializeTooningPacketToText(teamPacket, "ko");
    expect(textExport).toContain("CUT 01");
    expect(textExport).toContain("6단계 팀 분업");

    const jsonExport = serializeTooningPacketToJson(teamPacket);
    const parsed = JSON.parse(jsonExport) as { schemaVersion: string; totalCuts: number };
    expect(parsed.schemaVersion).toBe("toonstudio.allinone-division-packet/1");
    expect(parsed.totalCuts).toBe(4);

    const fountain = buildStudio2dFountainScript(arranged, "ko");
    expect(fountain).toContain("## PANEL 1");
    expect(fountain).toContain("!SFX:");
  });
});

describe("TooningPlusAllInOneSection UI & Workbench Integration", () => {
  it("guides creators through 1 active step at a time with 3-second samples, live 3D SVG preview, and team handoff", () => {
    const onSelectWorkspacePreset = vi.fn();
    const onTransferCutsToScript = vi.fn();

    render(
      <TooningPlusAllInOneSection
        locale="ko"
        onSelectWorkspacePreset={onSelectWorkspacePreset}
        onTransferCutsToScript={onTransferCutsToScript}
      />,
    );

    // Step 1 active only (mobile-friendly 1 step at a time)
    expect(screen.getByTestId("tooning-step1-panel")).toBeTruthy();
    expect(screen.queryByTestId("tooning-step2-panel")).toBeNull();
    expect(screen.queryByTestId("tooning-step3-panel")).toBeNull();

    // 1-click sample scenario
    fireEvent.click(screen.getByTestId("tooning-sample-sample-school"));
    expect(screen.getByTestId("tooning-status-bar").textContent).toContain("학원 · 옥상 비밀 노트");

    // Add 3rd speaker & switch cut count to 6 & tone to tense
    fireEvent.click(screen.getByTestId("tooning-toggle-third-speaker"));
    expect(screen.getByTestId("tooning-speaker-select-2")).toBeTruthy();
    fireEvent.click(screen.getByTestId("tooning-cut-count-6"));
    expect(screen.getByTestId("tooning-story-cut-6")).toBeTruthy();
    fireEvent.click(screen.getByTestId("tooning-tone-tense"));
    expect(screen.getByTestId("tooning-tone-tense").getAttribute("aria-pressed")).toBe("true");

    // Navigate to Step 2 (3D Pose/Expression/Camera/Background)
    fireEvent.click(screen.getByTestId("tooning-next-step"));
    expect(screen.getByTestId("tooning-step2-panel")).toBeTruthy();
    expect(screen.queryByTestId("tooning-step1-panel")).toBeNull();

    fireEvent.click(screen.getByTestId("tooning-char-taeo"));
    fireEvent.click(screen.getByTestId("tooning-pose-draw-sword"));
    fireEvent.click(screen.getByTestId("tooning-expr-anger"));
    fireEvent.click(screen.getByTestId("tooning-cam-dutch-tilt"));
    fireEvent.click(screen.getByTestId("tooning-bg-crystal-rift"));

    const svgPreview = screen.getByTestId("tooning-stage-svg-cut-1");
    expect(svgPreview.getAttribute("aria-label")).toContain("태오");
    expect(svgPreview.getAttribute("aria-label")).toContain("검 뽑기");
    expect(svgPreview.getAttribute("aria-label")).toContain("분노");
    expect(svgPreview.getAttribute("aria-label")).toContain("더치 앵글");
    expect(svgPreview.getAttribute("aria-label")).toContain("판타지 수정 균열");

    fireEvent.click(screen.getByTestId("tooning-open-3d-workspace"));
    expect(onSelectWorkspacePreset).toHaveBeenCalledWith("pose-3d");

    // Navigate to Step 3 (Smart Bubbles, SFX, Team Division & Export)
    fireEvent.click(screen.getByTestId("tooning-next-step"));
    expect(screen.getByTestId("tooning-step3-panel")).toBeTruthy();
    expect(screen.getByTestId("tooning-overlap-status").textContent).toContain("겹침 0건");

    fireEvent.click(screen.getByTestId("tooning-auto-arrange-all"));
    fireEvent.click(screen.getByTestId("tooning-mode-solo"));
    expect(screen.getByTestId("tooning-stage-card-story").textContent).toContain("1인 작가");

    fireEvent.click(screen.getByTestId("tooning-check-lineart-1"));
    expect((screen.getByTestId("tooning-check-lineart-1") as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByTestId("tooning-export-json"));
    expect(screen.getByTestId("tooning-export-preview").textContent).toContain(
      "toonstudio.allinone-division-packet/1",
    );

    fireEvent.click(screen.getByTestId("tooning-deliver-2d-studio"));
    expect(onTransferCutsToScript).toHaveBeenCalledTimes(1);
    expect(onSelectWorkspacePreset).toHaveBeenCalledWith("storyboard");
  });

  it("renders zero Korean characters across all 3 steps when locale is en and integrates inside StudioStoryToWebtoonStartupWorkbench", () => {
    const onSelectWorkspacePreset = vi.fn();
    render(
      <StudioStoryToWebtoonStartupWorkbench
        locale="en"
        onSelectWorkspacePreset={onSelectWorkspacePreset}
      />,
    );

    const section = screen.getByTestId("tooning-plus-allinone-section");
    expect(section.textContent).not.toMatch(/[가-힣]/u);

    fireEvent.click(screen.getByTestId("tooning-step-btn-2"));
    expect(section.textContent).not.toMatch(/[가-힣]/u);

    fireEvent.click(screen.getByTestId("tooning-step-btn-3"));
    expect(section.textContent).not.toMatch(/[가-힣]/u);

    fireEvent.click(screen.getByTestId("tooning-export-text"));
    expect(screen.getByTestId("tooning-export-preview").textContent).not.toMatch(/[가-힣]/u);

    // Delivering cuts updates the workbench script live
    fireEvent.click(screen.getByTestId("tooning-deliver-2d-studio"));
    expect(onSelectWorkspacePreset).toHaveBeenCalledWith("storyboard");
    expect(screen.getByTestId("story-to-webtoon-input").textContent).toContain("## PANEL 1");
  });

  it("enforces OKLCH tokens, reduced-motion, keep-all, and zero hex or forbidden animation slop in CSS", () => {
    const dir = path.resolve(process.cwd(), "apps/web/src/domains/creator/studio-shell");
    const css = readFileSync(path.join(dir, "tooning-plus-allinone.css"), "utf8");
    const svgCode = readFileSync(path.join(dir, "TooningPlusCutStagePreview.tsx"), "utf8");
    const catalogCode = readFileSync(path.join(dir, "tooning-plus-allinone-catalog.ts"), "utf8");

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("word-break: keep-all");
    expect(css).toContain("oklch(");
    expect(css).not.toContain("transition-all");
    expect(css).not.toMatch(/animate-(bounce|ping|spin)/u);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(svgCode).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(catalogCode).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
  });
});
