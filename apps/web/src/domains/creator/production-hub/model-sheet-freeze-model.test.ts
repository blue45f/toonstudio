import { describe, expect, it } from "vitest";

import {
  acknowledgeModelSheetChange,
  addModelSheetRevision,
  deriveModelSheetArtGate,
  deriveModelSheetImpact,
  emptyModelSheet,
  freezeModelSheet,
  modelSheetArtGateBlocks,
  reviseFrozenModelSheet,
  type ModelSheetRevisionInput,
} from "./model-sheet-freeze-model";

function revisionInput(partial: Partial<ModelSheetRevisionInput> = {}): ModelSheetRevisionInput {
  return {
    expressionRef: "asset-expression-1",
    poseRef: "asset-pose-1",
    assetRefs: [],
    note: "",
    authorId: "artist-1",
    authorName: "작가",
    createdAt: "2026-10-14T08:00:00.000Z",
    ...partial,
  };
}

const ACTOR = { byId: "lead-1", byName: "리드", at: "2026-10-14T09:00:00.000Z" };

function frozenSheet() {
  const drafted = addModelSheetRevision(emptyModelSheet("char-1"), revisionInput()).sheet;
  return freezeModelSheet(drafted, ACTOR).sheet;
}

describe("model sheet freeze lifecycle", () => {
  it("refuses to freeze without any revision, and refuses empty references", () => {
    const empty = emptyModelSheet("char-1");
    expect(freezeModelSheet(empty, ACTOR).issues.map((issue) => issue.code)).toEqual(["no-revision"]);
    expect(addModelSheetRevision(empty, revisionInput({ expressionRef: null, poseRef: null })).issues.map((issue) => issue.code))
      .toEqual(["empty-reference"]);
  });

  it("freezes the latest draft revision and records who froze it", () => {
    const sheet = frozenSheet();
    expect(sheet.status).toBe("frozen");
    expect(sheet.frozenRevision).toBe(1);
    expect(sheet.frozenByName).toBe("리드");
    expect(freezeModelSheet(sheet, ACTOR).issues.map((issue) => issue.code)).toEqual(["already-frozen"]);
  });

  it("locks plain revision adds once frozen — changes must go through the reasoned path", () => {
    const result = addModelSheetRevision(frozenSheet(), revisionInput());
    expect(result.changed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(["frozen-revision-locked"]);
  });

  it("requires a reason to change a frozen sheet, then records the change and moves the frozen revision", () => {
    const sheet = frozenSheet();
    const noReason = reviseFrozenModelSheet(sheet, { ...revisionInput(), reason: "  " });
    expect(noReason.issues.map((issue) => issue.code)).toEqual(["reason-required"]);

    const changed = reviseFrozenModelSheet(sheet, {
      ...revisionInput({ expressionRef: "asset-expression-2", createdAt: "2026-10-15T08:00:00.000Z" }),
      reason: "주인공 표정이 너무 순해 보여서 날카롭게",
    });
    expect(changed.changed).toBe(true);
    expect(changed.sheet.frozenRevision).toBe(2);
    expect(changed.sheet.changes).toHaveLength(1);
    expect(changed.sheet.changes[0]).toMatchObject({ fromRevision: 1, toRevision: 2, acknowledgedEpisodeIds: [] });
  });
});

describe("model sheet impact", () => {
  it("warns only about episodes drawn against an older frozen revision", () => {
    const changed = reviseFrozenModelSheet(frozenSheet(), {
      ...revisionInput({ createdAt: "2026-10-15T08:00:00.000Z" }),
      reason: "표정 수정",
    }).sheet;
    const impact = deriveModelSheetImpact(changed, [
      { episodeId: "ep-1", episodeLabel: "1화", cutCount: 40, drawnRevision: 1 },
      { episodeId: "ep-2", episodeLabel: "2화", cutCount: 35, drawnRevision: 2 },
      { episodeId: "ep-3", episodeLabel: "3화", cutCount: 0, drawnRevision: null },
    ]);
    expect(impact.affectedEpisodes.map((episode) => episode.episodeId)).toEqual(["ep-1"]);
    expect(impact.affectedCutCount).toBe(40);
    expect(impact.unacknowledgedEpisodeIds).toEqual(["ep-1"]);

    const acknowledged = acknowledgeModelSheetChange(changed, "ep-1");
    const after = deriveModelSheetImpact(acknowledged, [
      { episodeId: "ep-1", episodeLabel: "1화", cutCount: 40, drawnRevision: 1 },
    ]);
    expect(after.unacknowledgedEpisodeIds).toEqual([]);
    expect(after.affectedEpisodes).toHaveLength(1);
  });
});

describe("line-art entry gate", () => {
  it("warns (never blocks by default) when a character is unfrozen; strict mode may block", () => {
    const gate = deriveModelSheetArtGate([frozenSheet()], ["char-1", "char-2"]);
    expect(gate.ready).toBe(false);
    expect(gate.unfrozenCharacterIds).toEqual(["char-2"]);
    expect(gate.warnings.length).toBeGreaterThan(0);
    expect(modelSheetArtGateBlocks(gate)).toBe(false);
    expect(modelSheetArtGateBlocks(gate, { strict: true })).toBe(true);
  });

  it("is ready when every character is frozen, and flags unacknowledged changes as warnings only", () => {
    const changed = reviseFrozenModelSheet(frozenSheet(), {
      ...revisionInput({ createdAt: "2026-10-15T08:00:00.000Z" }),
      reason: "포즈 추가",
    }).sheet;
    const impact = deriveModelSheetImpact(changed, [
      { episodeId: "ep-1", episodeLabel: "1화", cutCount: 10, drawnRevision: 1 },
    ]);
    const gate = deriveModelSheetArtGate([changed], ["char-1"], new Map([["char-1", impact]]));
    expect(gate.ready).toBe(true);
    expect(gate.changedCharacterIds).toEqual(["char-1"]);
    expect(modelSheetArtGateBlocks(gate, { strict: true })).toBe(false);
  });
});
