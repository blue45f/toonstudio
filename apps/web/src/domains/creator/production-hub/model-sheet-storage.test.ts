import { describe, expect, it } from "vitest";

import {
  validateStudioStoryBible,
  type StudioStoryBible,
} from "../studio-story-bible";

import {
  addModelSheetRevision,
  emptyModelSheet,
  freezeModelSheet,
  type CharacterModelSheet,
} from "./model-sheet-freeze-model";
import {
  modelSheetForCharacter,
  modelSheetsFromBible,
  parseModelSheetsJson,
  parseStoredModelSheets,
  removeModelSheet,
  stringifyModelSheets,
  toStoredModelSheets,
  withModelSheet,
  withModelSheets,
} from "./model-sheet-storage";

const BASE_BIBLE: StudioStoryBible = {
  projectId: "project-1",
  characters: [
    { id: "char-1", name: "주인공", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
    { id: "char-2", name: "조연", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
  ],
  locations: [],
  facts: [],
};

function frozenSheet(characterId = "char-1"): CharacterModelSheet {
  const drafted = addModelSheetRevision(emptyModelSheet(characterId), {
    expressionRef: "asset-expression-1",
    poseRef: "asset-pose-1",
    assetRefs: [],
    note: "",
    authorId: "artist-1",
    authorName: "작가",
    createdAt: "2026-10-14T08:00:00.000Z",
  }).sheet;
  return freezeModelSheet(drafted, {
    byId: "lead-1",
    byName: "리드",
    at: "2026-10-14T09:00:00.000Z",
  }).sheet;
}

describe("backward compatibility — a bible without the extension stays valid", () => {
  it("reads as an empty collection and validates exactly like before", () => {
    expect(modelSheetsFromBible(BASE_BIBLE)).toEqual([]);
    expect(modelSheetForCharacter(BASE_BIBLE, "char-1")).toBeNull();
    expect(validateStudioStoryBible(BASE_BIBLE)).toEqual([]);
  });

  it("an explicitly empty collection produces the same validation result as no collection", () => {
    const withEmpty = withModelSheets(BASE_BIBLE, []);
    expect("modelSheets" in withEmpty).toBe(false);
    expect(validateStudioStoryBible(withEmpty)).toEqual(validateStudioStoryBible(BASE_BIBLE));
  });
});

describe("bible validation of the optional collection", () => {
  it("accepts a well-formed frozen sheet", () => {
    const bible = withModelSheet(BASE_BIBLE, frozenSheet());
    expect(validateStudioStoryBible(bible)).toEqual([]);
  });

  it("rejects a sheet for an unknown character and a duplicate sheet per character", () => {
    const unknown = withModelSheet(BASE_BIBLE, frozenSheet("char-404"));
    expect(validateStudioStoryBible(unknown).map((issue) => issue.code))
      .toContain("model-sheet-character-reference");

    const duplicated: StudioStoryBible = {
      ...BASE_BIBLE,
      modelSheets: [frozenSheet(), frozenSheet()],
    };
    expect(validateStudioStoryBible(duplicated).map((issue) => issue.code))
      .toContain("model-sheet-character-duplicate");
  });

  it("rejects a frozen sheet whose frozen revision does not exist", () => {
    const broken: CharacterModelSheet = { ...frozenSheet(), frozenRevision: 99 };
    const bible = withModelSheet(BASE_BIBLE, broken);
    const issues = validateStudioStoryBible(bible);
    expect(issues.map((issue) => issue.code)).toContain("model-sheet-frozen-revision");
    expect(issues.find((issue) => issue.code === "model-sheet-frozen-revision")?.severity)
      .toBe("error");
  });
});

describe("upsert / remove", () => {
  it("upserts by characterId without mutating the original bible", () => {
    const first = withModelSheet(BASE_BIBLE, emptyModelSheet("char-1"));
    expect(modelSheetsFromBible(first)).toHaveLength(1);

    const updated = withModelSheet(first, frozenSheet("char-1"));
    expect(modelSheetsFromBible(updated)).toHaveLength(1);
    expect(modelSheetForCharacter(updated, "char-1")?.status).toBe("frozen");
    expect(modelSheetForCharacter(first, "char-1")?.status).toBe("draft");
    expect(modelSheetsFromBible(BASE_BIBLE)).toEqual([]);
  });

  it("removing the last sheet drops the field itself (extension-free shape)", () => {
    const withSheet = withModelSheet(BASE_BIBLE, frozenSheet());
    const removed = removeModelSheet(withSheet, "char-1");
    expect("modelSheets" in removed).toBe(false);
    expect(validateStudioStoryBible(removed)).toEqual([]);
    expect(removeModelSheet(BASE_BIBLE, "char-1")).toBe(BASE_BIBLE);
  });
});

describe("storage round-trip", () => {
  it("survives JSON stringify/parse unchanged", () => {
    const sheets = [frozenSheet(), emptyModelSheet("char-2")];
    const restored = parseModelSheetsJson(stringifyModelSheets(sheets));
    expect(restored.issues).toEqual([]);
    expect(restored.sheets).toEqual(toStoredModelSheets(sheets));
  });

  it("treats a missing collection as empty with no issues (no migration)", () => {
    expect(parseStoredModelSheets(undefined)).toEqual({ sheets: [], issues: [] });
    expect(parseStoredModelSheets(null)).toEqual({ sheets: [], issues: [] });
  });

  it("skips malformed entries and duplicate characters, reporting both", () => {
    const stored = toStoredModelSheets([frozenSheet()]);
    const result = parseStoredModelSheets([
      stored[0],
      { characterId: "char-2", status: "frozen" },
      stored[0],
    ]);
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0]?.characterId).toBe("char-1");
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "invalid-entry",
      "duplicate-character",
    ]);
    expect(result.issues[0]?.characterId).toBe("char-2");
  });

  it("reports non-collection and invalid JSON instead of throwing", () => {
    expect(parseStoredModelSheets("nope").issues.map((issue) => issue.code))
      .toEqual(["not-a-collection"]);
    expect(parseModelSheetsJson("{not json").issues.map((issue) => issue.code))
      .toEqual(["invalid-json"]);
  });

  it("does not carry unknown fields into the stored shape", () => {
    const withExtra = {
      ...frozenSheet(),
      transientUiFlag: true,
    } as CharacterModelSheet;
    const storedSheet = toStoredModelSheets([withExtra])[0];
    expect(storedSheet).toBeDefined();
    expect("transientUiFlag" in (storedSheet as unknown as Record<string, unknown>))
      .toBe(false);
  });
});
