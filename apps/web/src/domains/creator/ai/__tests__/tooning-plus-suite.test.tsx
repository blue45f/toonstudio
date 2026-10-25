// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioTooningPlusSuitePanel } from "../StudioTooningPlusSuitePanel";
import {
  buildDvInChatImageRegenPrompt,
  DV_CHARACTER_WIZARD_STEPS,
  DV_CHAT_MODES,
  DV_IN_CHAT_IMAGE_REGEN_PRESETS,
  DV_LOREBOOK_LIMITS,
  DV_PROMPT_TEMPLATE_CATEGORIES,
  matchDvLorebookEntriesForMessage,
  TB_CREATOR_CREDIT_ROLES,
  TB_NOVEL_MAX_CHARS,
  TB_NOVEL_VIEWER_FONT_SIZES,
  TB_WEBTOON_MANUSCRIPT_LIMITS,
  validateDvMediaTriggerCode,
  validateTbNovelEpisodeContent,
  validateTbWebtoonEpisodeManuscripts,
} from "../tooning-deev-toonbe-suite";
import {
  addTgConceptInstance,
  buildTgToTdExportPackage,
  cloneTgExploreWorkConcepts,
  compileTgConceptsToPrompt,
  exportTgStoryDocument,
  generateTgPlotSuggestionAndQuestions,
  processTgStoryCanvas,
  publishTgStoryToExplore,
  recommendTgConceptValue,
  resetTgSplitCutDescription,
  splitTgStoryIntoCuts,
  TG_AUTOSAVE_DEBOUNCE_MS,
  TG_CANVAS_MAX_CHARS,
  TG_CONCEPT_FIELD_SPECS,
  TG_COVER_IMAGE_PRESETS,
  TG_FLOATING_SPLITTER_DIMENSIONS,
  TG_STARTER_PROMPT_SAMPLES,
  TG_SUPPORTED_FONTS,
  TOONING_CREDIT_COSTS,
  TOONING_PLUS_SERVICES,
  updateTgSplitCutDescription,
} from "../tooning-stories-suite";

describe("Tooning Stories (TG) & Cut Splitter & TG->TD Interlock Engine", () => {
  it("exposes all 7 Tooning Plus services and exact credit cost constants", () => {
    expect(TOONING_PLUS_SERVICES.map((s) => s.code)).toEqual([
      "CM",
      "TG",
      "TD",
      "ED",
      "MG",
      "DV",
      "TB",
    ]);
    expect(TOONING_CREDIT_COSTS.TG_PROMPT).toBe(3);
    expect(TOONING_CREDIT_COSTS.TG_SPLIT_CUT).toBe(3);
    expect(TOONING_CREDIT_COSTS.TG_EXPORT_TO_TD_PER_CUT).toBe(5);
    expect(TG_CANVAS_MAX_CHARS).toBe(8000);
    expect(TG_AUTOSAVE_DEBOUNCE_MS).toBe(3000);
    expect(TG_FLOATING_SPLITTER_DIMENSIONS).toEqual({ widthPx: 360, heightPx: 640 });
    expect(TG_SUPPORTED_FONTS).toHaveLength(9);
    expect(TG_COVER_IMAGE_PRESETS[0]?.widthPx).toBe(844);
    expect(TG_COVER_IMAGE_PRESETS[0]?.heightPx).toBe(264);
    expect(TG_STARTER_PROMPT_SAMPLES.length).toBeGreaterThanOrEqual(4);
    expect(TG_CONCEPT_FIELD_SPECS.length).toBeGreaterThanOrEqual(4);
  });

  it("recommends gender-aware concepts and enforces maxConceptAddCnt", () => {
    const maleRec = recommendTgConceptValue("character-profile", "male", 0);
    const femaleRec = recommendTgConceptValue("character-profile", "female", 0);
    expect(maleRec).toContain("강하준");
    expect(femaleRec).toContain("엘레나");

    const genreResult1 = addTgConceptInstance([], {
      fieldId: "genre-tone",
      selectedOption: "로맨스 판타지",
      inputText: "궁중 암투",
    });
    expect(genreResult1.added).toBe(true);

    const genreResult2 = addTgConceptInstance(genreResult1.entries, {
      fieldId: "genre-tone",
      selectedOption: "현대 액션",
      inputText: "헌터 각성",
    });
    expect(genreResult2.added).toBe(false);
    expect(genreResult2.reasonKo).toContain("최대 1개");

    const prompt = compileTgConceptsToPrompt("webtoon", genreResult1.entries);
    expect(prompt).toContain("[투닝 스토리 웹툰 에이전트 설정]");
    expect(prompt).toContain("[로맨스 판타지] 궁중 암투");
  });

  it("processes Story Canvas cut markers, highlights, and 8000-char ceiling", () => {
    const raw =
      "[C#1] 첫 번째 컷 장면입니다. ==핵심 복선== 등장!\n<cut-marker data-cut-index=\"2\">C#2</cut-marker> 두 번째 장면.";
    const processed = processTgStoryCanvas(raw);
    expect(processed.isOverLimit).toBe(false);
    expect(processed.cutMarkers).toEqual(["C#1", "C#2"]);
    expect(processed.highlights).toEqual(["핵심 복선"]);
    expect(processed.htmlPreview).toContain("<mark>핵심 복선</mark>");

    const overLimit = processTgStoryCanvas("가".repeat(8100));
    expect(overLimit.isOverLimit).toBe(true);
    expect(overLimit.normalizedText).toHaveLength(8000);
  });

  it("splits story into C#N cuts, edits/resets descriptions, and builds TG->TD 3D Studio package", () => {
    const story =
      "회귀한 황녀가 눈빛을 빛내며 속삭인다.\n-----\n강하준: \"여기서 물러설 수 없다!\" 검을 휘두르며 달려간다.";
    const split = splitTgStoryIntoCuts(story);
    expect(split.cuts).toHaveLength(2);
    expect(split.creditCost).toBe(3);
    expect(split.markedCanvasText).toContain("[C#1]");
    expect(split.markedCanvasText).toContain("-----");

    const modified = updateTgSplitCutDescription(split.cuts, 1, "수정된 1컷 지문");
    expect(modified[0]?.isModified).toBe(true);
    expect(modified[0]?.description).toBe("수정된 1컷 지문");

    const restored = resetTgSplitCutDescription(modified, 1);
    expect(restored[0]?.isModified).toBe(false);
    expect(restored[0]?.description).toContain("회귀한 황녀가");

    const tdPkg = buildTgToTdExportPackage("story-99", "회귀 황녀", split.cuts);
    expect(tdPkg.deepLinkUrl).toBe("/3d-studio?storyId=story-99");
    expect(tdPkg.totalCuts).toBe(2);
    expect(tdPkg.totalCreditCost).toBe(10); // 2 cuts * 5 credits
    expect(tdPkg.cuts[0]?.cameraShotSize).toBe("CloseUpShot");
    expect(tdPkg.cuts[1]?.cameraShotSize).toBe("FullShot");
    expect(tdPkg.cuts[1]?.cameraAngle).toBe("LowAngle");
    expect(tdPkg.cuts[1]?.characterNames).toContain("강하준");
  });

  it("exports story in all 4 formats (PDF, Docx, Html with BOM, Txt with BOM) and clones Explore KnowHow", () => {
    const htmlExport = exportTgStoryDocument("테스트 작품", "[C#1] 본문 ==강조==", "Html", "Pretendard");
    expect(htmlExport.hasUtf8Bom).toBe(true);
    expect(htmlExport.content.startsWith("\uFEFF")).toBe(true);
    expect(htmlExport.fileName).toBe("테스트 작품.html");

    const txtExport = exportTgStoryDocument("테스트 작품", "본문", "Txt");
    expect(txtExport.hasUtf8Bom).toBe(true);
    expect(txtExport.content.startsWith("\uFEFF")).toBe(true);

    const docxExport = exportTgStoryDocument("테스트 작품", "본문", "Docx");
    expect(docxExport.hasUtf8Bom).toBe(false);
    expect(docxExport.fileName).toBe("테스트 작품.docx");

    const pdfExport = exportTgStoryDocument("테스트 작품", "본문", "PDF");
    expect(pdfExport.fileName).toBe("테스트 작품.pdf");

    const suggestion = generateTgPlotSuggestionAndQuestions("webtoon", "배신과 비밀", []);
    expect(suggestion.followUpQuestions).toHaveLength(3);

    const published = publishTgStoryToExplore({
      exploreId: "exp-11",
      title: "탐색 작품",
      shareType: "Multiple",
      agentCategory: "webtoon",
      concepts: [{ instanceId: "c-1", fieldId: "worldbuilding", inputText: "제국 수도" }],
      canvasText: "본문",
      promptHistory: ["프롬프트 1"],
    });
    expect(published.knowHowPrompts).toEqual(["프롬프트 1"]);

    const cloned = cloneTgExploreWorkConcepts(published);
    expect(cloned.clonedConcepts[0]?.instanceId).toBe("remake-worldbuilding-1");
  });
});

describe("Deev (DV) AI Character/Lorebook & ToonBe (TB) Webtoon/Novel Platform Engine", () => {
  it("validates Deev 6-step wizard, 17 chat modes, media trigger codes, and keyword Lorebook matching", () => {
    expect(DV_CHARACTER_WIZARD_STEPS).toHaveLength(6);
    expect(DV_PROMPT_TEMPLATE_CATEGORIES).toHaveLength(7);
    expect(DV_CHAT_MODES).toHaveLength(17);
    expect(DV_IN_CHAT_IMAGE_REGEN_PRESETS).toHaveLength(5);
    expect(DV_LOREBOOK_LIMITS.maxEntries).toBe(50);

    expect(validateDvMediaTriggerCode("smile_01", ["a", "b", "c"]).valid).toBe(true);
    expect(validateDvMediaTriggerCode("한글코드", []).valid).toBe(false);
    expect(validateDvMediaTriggerCode("smile_01", ["1", "2", "3", "4"]).valid).toBe(false);

    const matched = matchDvLorebookEntriesForMessage("북부 요새의 비밀", [
      {
        entryId: "l1",
        title: "북부 요새",
        keywords: ["북부", "요새"],
        content: "설원 성채",
        enabled: true,
      },
      {
        entryId: "l2",
        title: "황궁",
        keywords: ["황궁"],
        content: "제국 수도",
        enabled: true,
      },
    ]);
    expect(matched).toHaveLength(1);
    expect(matched[0]?.entryId).toBe("l1");

    const regenPrompt = buildDvInChatImageRegenPrompt({
      characterName: "엘레나",
      dialogueLine: "절대 물러서지 않아.",
      preset: "closer",
    });
    expect(regenPrompt).toContain("클로즈업 샷");
  });

  it("enforces ToonBe (TB) webtoon manuscript limits (JPEG, 700px max width, 5MB single, 50MB total) and novel 15,000 char limit", () => {
    expect(TB_CREATOR_CREDIT_ROLES).toHaveLength(10);
    expect(TB_WEBTOON_MANUSCRIPT_LIMITS.MAX_WIDTH_PX).toBe(700);
    expect(TB_NOVEL_MAX_CHARS).toBe(15000);
    expect(TB_NOVEL_VIEWER_FONT_SIZES.BB).toBe(21);

    const validReport = validateTbWebtoonEpisodeManuscripts([
      {
        fileName: "cut01.jpg",
        mimeType: "image/jpeg",
        widthPx: 700,
        heightPx: 2000,
        sizeBytes: 2 * 1024 * 1024,
      },
    ]);
    expect(validReport.valid).toBe(true);

    const invalidReport = validateTbWebtoonEpisodeManuscripts([
      {
        fileName: "cut01.png",
        mimeType: "image/png",
        widthPx: 720,
        heightPx: 2000,
        sizeBytes: 6 * 1024 * 1024,
      },
    ]);
    expect(invalidReport.valid).toBe(false);
    expect(invalidReport.errors.map((e) => e.errorType)).toEqual([
      "InvalidExtension",
      "WidthExceeded",
      "SingleSizeExceeded",
    ]);

    expect(validateTbNovelEpisodeContent("웹소설 본문 ![삽화](img.jpg)").inlineImageCount).toBe(1);
    expect(validateTbNovelEpisodeContent("가".repeat(15001)).valid).toBe(false);
  });

  it("renders StudioTooningPlusSuitePanel and switches across TG, ED_MG, DV, and TB tabs interactively", () => {
    const onApplyScript = vi.fn();
    render(<StudioTooningPlusSuitePanel scriptInput="[C#1] 첫 컷" onApplyScript={onApplyScript} />);

    expect(screen.getByTestId("studio-tooning-plus-suite-panel")).toBeTruthy();
    expect(screen.getByTestId("tooning-pillar-tg")).toBeTruthy();

    fireEvent.click(screen.getByTestId("tg-apply-split-cuts-to-storyboard-btn"));
    expect(onApplyScript).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: /ED\/MG 다각도·매직·리터치/u }));
    expect(screen.getByTestId("tooning-pillar-ed-mg")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /DV 디브 캐릭터·로어북/u }));
    expect(screen.getByTestId("tooning-pillar-dv")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /TB 툰비 원고검증·뷰어/u }));
    expect(screen.getByTestId("tooning-pillar-tb")).toBeTruthy();
  });
});
