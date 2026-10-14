import { describe, expect, it } from "vitest";

import type { DialogueBatchItem } from "../lettering/studio-dialogue-batch";
import type { StudioStoryBible } from "../studio-story-bible";
import { buildLoreNameDictionary, checkLoreNames } from "./studio-lore-name-check";
import {
  attachDialogueLocations,
  buildDialogueNameCheckPreset,
  dialogueLineLocationLabel,
  dialogueLineSpeakerLabel,
  locateDialogueFinding,
  retargetDialogueNameCheckPreset,
} from "./studio-lore-name-check-dialogue";

function item(overrides: Partial<DialogueBatchItem> & { id: string }): DialogueBatchItem {
  return {
    pageId: "page-1",
    pageIndex: 0,
    elType: "bubble",
    text: "",
    hidden: false,
    locked: false,
    ...overrides,
  };
}

const ITEMS: DialogueBatchItem[] = [
  item({ id: "el-1", text: "아르카디아는 무사해." }),
  item({ id: "el-2", text: "젤라토가 나타났다.", pageId: "page-1", pageIndex: 0 }),
  item({ id: "el-3", text: "아르카디야에서 만나자.", pageId: "page-2", pageIndex: 1 }),
  item({ id: "el-4", text: "숨긴 대사 아르카디야", hidden: true, pageId: "page-2", pageIndex: 1 }),
  item({ id: "el-5", text: "   ", pageId: "page-2", pageIndex: 1 }),
];

const CHARACTERS = [
  { id: "char-1", name: "모아" },
  { id: "char-2", name: "젤라토" },
];

describe("buildDialogueNameCheckPreset", () => {
  it("joins lines with offsets that slice back to the exact line text", () => {
    const preset = buildDialogueNameCheckPreset(ITEMS);
    expect(preset.itemCount).toBe(3);
    expect(preset.pageCount).toBe(2);
    expect(preset.skippedHiddenCount).toBe(1);
    expect(preset.skippedEmptyCount).toBe(1);
    for (const line of preset.lines) {
      expect(preset.text.slice(line.start, line.end)).toBe(line.text);
    }
    expect(preset.text).toBe(
      "아르카디아는 무사해.\n젤라토가 나타났다.\n아르카디야에서 만나자.",
    );
  });

  it("includes hidden lines only when asked", () => {
    const preset = buildDialogueNameCheckPreset(ITEMS, { includeHidden: true });
    expect(preset.itemCount).toBe(4);
    expect(preset.skippedHiddenCount).toBe(0);
  });

  it("tracks per-page ordinals for cut reference", () => {
    const preset = buildDialogueNameCheckPreset(ITEMS);
    expect(preset.lines.map((line) => line.lineIndexInPage)).toEqual([0, 1, 0]);
    expect(preset.lines[2]?.pageIndex).toBe(1);
  });

  it("resolves speaker attribution from the explicit map only — never invents it", () => {
    const preset = buildDialogueNameCheckPreset(ITEMS, {
      attributionByItemId: new Map([["el-1", "char-1"], ["el-3", "char-unknown"]]),
      characters: CHARACTERS,
    });
    expect(preset.attributedCount).toBe(2);
    expect(preset.attributionRate).toBeCloseTo(2 / 3);
    const [first, second, third] = preset.lines;
    expect(first?.speakerName).toBe("모아");
    expect(dialogueLineSpeakerLabel(first!)).toBe("모아");
    expect(second?.speakerId).toBeNull();
    expect(dialogueLineSpeakerLabel(second!)).toBe("화자 미지정");
    // 귀속은 됐지만 이름표가 없으면 지어내지 않고 미상으로 표시한다.
    expect(third?.speakerId).toBe("char-unknown");
    expect(third?.speakerName).toBeNull();
    expect(dialogueLineSpeakerLabel(third!)).toBe("이름 미상 화자");
  });

  it("accepts a plain record attribution map too", () => {
    const preset = buildDialogueNameCheckPreset(ITEMS, {
      attributionByItemId: { "el-2": "char-2" },
      characters: CHARACTERS,
    });
    expect(preset.lines[1]?.speakerName).toBe("젤라토");
    expect(dialogueLineLocationLabel(preset.lines[1]!)).toBe(
      "1페이지 · 2번째 대사 · 젤라토",
    );
  });

  it("is empty for no dialogue", () => {
    const preset = buildDialogueNameCheckPreset([]);
    expect(preset.itemCount).toBe(0);
    expect(preset.attributionRate).toBe(0);
    expect(preset.text).toBe("");
  });
});

describe("cut reverse-reference", () => {
  const BIBLE: StudioStoryBible = {
    projectId: "project-1",
    characters: [
      { id: "char-9", name: "아르카디아", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
    ],
    locations: [],
    facts: [],
  };

  it("maps a name-check finding back to its original dialogue item and page", () => {
    const preset = buildDialogueNameCheckPreset(ITEMS);
    const dictionary = buildLoreNameDictionary(BIBLE, null);
    const findings = checkLoreNames(preset.text, dictionary);
    const located = attachDialogueLocations(preset, findings);
    const variant = located.find((entry) => entry.finding.code === "name-variant");
    expect(variant).toBeDefined();
    expect(variant?.location?.line.itemId).toBe("el-3");
    expect(variant?.location?.line.pageId).toBe("page-2");
    expect(variant?.location?.label).toContain("2페이지 · 1번째 대사");
    // 줄 안 상대 오프셋이 원본 대사 텍스트의 해당 구간과 일치한다.
    const line = variant!.location!.line;
    expect(
      line.text.slice(variant!.location!.localStart, variant!.location!.localEnd),
    ).toBe(variant!.finding.found);
  });

  it("returns null location for offsets outside any line instead of inventing one", () => {
    const preset = buildDialogueNameCheckPreset(ITEMS);
    // 첫 줄 끝의 "\n" 구분자 위치.
    const separatorAt = preset.lines[0]!.end;
    expect(locateDialogueFinding(preset, { start: separatorAt, end: separatorAt + 1 })).toBeNull();
  });
});

describe("retargetDialogueNameCheckPreset", () => {
  it("keeps the cut map after a same-line-count edit, recomputing offsets", () => {
    const preset = buildDialogueNameCheckPreset(ITEMS);
    const nextText = preset.text.replace("아르카디야에서", "아르카디아에서");
    const retargeted = retargetDialogueNameCheckPreset(preset, nextText);
    expect(retargeted).not.toBeNull();
    for (const line of retargeted!.lines) {
      expect(retargeted!.text.slice(line.start, line.end)).toBe(line.text);
    }
    expect(retargeted!.lines[2]?.itemId).toBe("el-3");
  });

  it("drops the map when the line structure changes", () => {
    const preset = buildDialogueNameCheckPreset(ITEMS);
    expect(retargetDialogueNameCheckPreset(preset, `${preset.text}\n새 줄`)).toBeNull();
    expect(retargetDialogueNameCheckPreset(buildDialogueNameCheckPreset([]), "x")).toBeNull();
  });
});
