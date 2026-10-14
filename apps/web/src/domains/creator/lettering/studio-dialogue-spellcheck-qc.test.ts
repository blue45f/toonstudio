import { describe, expect, it } from "vitest";

import type { DialogueBatchItem } from "./studio-dialogue-batch";
import { checkDialogueSpelling } from "./studio-dialogue-spellcheck";
import {
  buildDialogueSpellcheckQcRecord,
  dialogueSpellcheckQcStorageKey,
  episodeQcExtrasFromSpellcheckRecord,
  loadDialogueSpellcheckQcRecord,
  parseDialogueSpellcheckQcRecord,
  publishDialogueSpellcheckQcResult,
  saveDialogueSpellcheckQcRecord,
  serializeDialogueSpellcheckQcRecord,
  type SpellcheckQcStorageLike,
} from "./studio-dialogue-spellcheck-qc";

function memoryStorage(): SpellcheckQcStorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

const SUMMARY = {
  totalItemCount: 4,
  checkedItemCount: 4,
  errorCount: 1,
  warningCount: 2,
  infoCount: 0,
  findingCount: 3,
  byRule: {},
};

describe("dialogue spellcheck QC record", () => {
  it("요약으로 기록을 만들고 직렬화↔파싱이 왕복된다", () => {
    const record = buildDialogueSpellcheckQcRecord({
      projectId: "proj-1",
      episodeId: "ep-1",
      summary: SUMMARY,
      checkedAt: new Date("2026-10-14T00:00:00.000Z"),
    });
    expect(record.checkedAt).toBe("2026-10-14T00:00:00.000Z");
    expect(parseDialogueSpellcheckQcRecord(serializeDialogueSpellcheckQcRecord(record))).toEqual(record);
  });

  it("계약 위반(빈 id·음수 건수·해석 불가 시각)은 throw한다", () => {
    expect(() => buildDialogueSpellcheckQcRecord({
      projectId: " ",
      episodeId: "ep-1",
      summary: SUMMARY,
      checkedAt: new Date(),
    })).toThrow();
    expect(() => buildDialogueSpellcheckQcRecord({
      projectId: "proj-1",
      episodeId: "ep-1",
      summary: { ...SUMMARY, errorCount: -1 },
      checkedAt: new Date(),
    })).toThrow();
    expect(() => buildDialogueSpellcheckQcRecord({
      projectId: "proj-1",
      episodeId: "ep-1",
      summary: SUMMARY,
      checkedAt: "not-a-date",
    })).toThrow();
  });

  it("손상된 저장 문자열은 전부 기록 없음(null)으로 수렴한다", () => {
    expect(parseDialogueSpellcheckQcRecord(null)).toBeNull();
    expect(parseDialogueSpellcheckQcRecord("{broken")).toBeNull();
    expect(parseDialogueSpellcheckQcRecord(JSON.stringify({ version: 2 }))).toBeNull();
    expect(parseDialogueSpellcheckQcRecord(JSON.stringify({
      version: 1, projectId: "p", episodeId: "e", checkedAt: "2026-10-14T00:00:00.000Z",
      errorCount: -1, warningCount: 0, checkedItemCount: 0, findingCount: 0,
    }))).toBeNull();
    expect(parseDialogueSpellcheckQcRecord(JSON.stringify({
      version: 1, projectId: "p", episodeId: "e", checkedAt: "언젠가",
      errorCount: 0, warningCount: 0, checkedItemCount: 0, findingCount: 0,
    }))).toBeNull();
  });
});

describe("dialogue spellcheck QC storage handoff", () => {
  it("저장한 기록은 같은 회차 키로만 읽히고, 다른 회차·위조 기록은 읽히지 않는다", () => {
    const storage = memoryStorage();
    const record = buildDialogueSpellcheckQcRecord({
      projectId: "proj-1",
      episodeId: "ep-1",
      summary: SUMMARY,
      checkedAt: "2026-10-14T00:00:00.000Z",
    });
    expect(saveDialogueSpellcheckQcRecord(storage, record)).toBe(true);
    expect(loadDialogueSpellcheckQcRecord(storage, "proj-1", "ep-1")).toEqual(record);
    expect(loadDialogueSpellcheckQcRecord(storage, "proj-1", "ep-2")).toBeNull();
    expect(loadDialogueSpellcheckQcRecord(storage, "proj-2", "ep-1")).toBeNull();

    // 키는 맞지만 내용이 다른 회차를 가리키는 위조 기록은 거부한다.
    storage.map.set(
      dialogueSpellcheckQcStorageKey("proj-1", "ep-1"),
      serializeDialogueSpellcheckQcRecord({ ...record, episodeId: "ep-9" }),
    );
    expect(loadDialogueSpellcheckQcRecord(storage, "proj-1", "ep-1")).toBeNull();
  });

  it("저장소가 throw해도 저장=false·읽기=null로 수렴해 흐름을 막지 않는다", () => {
    const broken: SpellcheckQcStorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    const record = buildDialogueSpellcheckQcRecord({
      projectId: "proj-1",
      episodeId: "ep-1",
      summary: SUMMARY,
      checkedAt: new Date(),
    });
    expect(saveDialogueSpellcheckQcRecord(broken, record)).toBe(false);
    expect(loadDialogueSpellcheckQcRecord(broken, "proj-1", "ep-1")).toBeNull();
  });

  it("검사 실행 → publish 한 번으로 QC extras가 만들어진다(수동 인계 없음)", () => {
    const items: DialogueBatchItem[] = [
      { id: "el-1", pageId: "page-1", pageIndex: 0, elType: "bubble", text: "", hidden: false, locked: false },
      { id: "el-2", pageId: "page-1", pageIndex: 0, elType: "bubble", text: "벌써 다 됬어요", hidden: false, locked: false },
      { id: "el-3", pageId: "page-1", pageIndex: 0, elType: "bubble", text: "숨김 대사 됬어요", hidden: true, locked: false },
    ];
    const findings = checkDialogueSpelling(items);
    const storage = memoryStorage();
    const record = publishDialogueSpellcheckQcResult(storage, {
      projectId: "proj-1",
      episodeId: "ep-1",
      items,
      findings,
      checkedAt: new Date("2026-10-14T01:00:00.000Z"),
    });
    // 빈 말풍선=error 1, '됬'=warning 1. 숨김 대사는 검사·집계 모두에서 빠진다.
    expect(record.errorCount).toBe(1);
    expect(record.warningCount).toBe(1);
    expect(record.checkedItemCount).toBe(2);

    const loaded = loadDialogueSpellcheckQcRecord(storage, "proj-1", "ep-1");
    expect(episodeQcExtrasFromSpellcheckRecord(loaded)).toEqual({
      dialogueSpellcheck: { errorCount: 1, warningCount: 1, checkedAt: "2026-10-14T01:00:00.000Z" },
    });
    expect(episodeQcExtrasFromSpellcheckRecord(null)).toBeUndefined();
  });
});
