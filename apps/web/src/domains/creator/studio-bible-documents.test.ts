import { describe, expect, it } from "vitest";

import type { StudioStoryBible } from "./studio-story-bible";
import {
  STUDIO_BIBLE_DOCUMENT_PURPOSES,
  bibleDocumentPurposeCounts,
  bibleDocumentsByPurpose,
  buildSeasonArcBoard,
  bumpBibleDocumentVersion,
  createBibleDocumentStamp,
  createContinuityDbBibleTemplate,
  createPitchBibleTemplate,
  createSeasonArcBibleTemplate,
  formatBibleDocumentStampLine,
  isValidBibleDocumentStamp,
  projectContinuityDbFacts,
  restampBibleDocumentForSeason,
  splitLegacyBibleBlob,
  summarizeSeasonArcDocument,
  validateBibleDocument,
  validateBibleDocumentSet,
  validateContinuityDbAgainstStoryBible,
  type StudioSeasonArcBibleDocument,
} from "./studio-bible-documents";

const STAMP = createBibleDocumentStamp({ seasonLabel: "시즌 1" });

function seasonArc(): StudioSeasonArcBibleDocument {
  const base = createSeasonArcBibleTemplate({
    id: "arc-1",
    title: "시즌 아크",
    stamp: STAMP,
    characters: [{ id: "char-1", name: "모아" }],
  });
  return {
    ...base,
    seasonSummary: "물을 되찾는 시즌",
    characterArcs: [
      { characterId: "char-1", characterName: "모아", want: "마을의 영웅이 되는 것", need: "혼자 짊어지지 않고 도움을 청하는 것", arcSummary: "" },
    ],
    threads: [
      { id: "th-1", title: "마른 우물", status: "open", introducedEpisodeLabel: "1화", summary: "" },
    ],
    episodeBeats: [
      { id: "ep-1", episodeLabel: "1화", episodeNumber: 1, title: "우물이 마르다", beats: ["우물 발견", "마을 회의"], threadIds: ["th-1"] },
      { id: "ep-2", episodeLabel: "2화", episodeNumber: 2, title: "산으로", beats: ["출발"], threadIds: [] },
    ],
  };
}

describe("스탬프 강제", () => {
  it("버전·시즌 표기가 없으면 스탬프를 만들 수 없다", () => {
    expect(() => createBibleDocumentStamp({ seasonLabel: "" })).toThrow();
    expect(() => createBibleDocumentStamp({ seasonLabel: "  " })).toThrow();
    expect(() => createBibleDocumentStamp({ documentVersion: 0, seasonLabel: "시즌 1" })).toThrow();
    expect(isValidBibleDocumentStamp({ documentVersion: 1.5, seasonLabel: "시즌 1" })).toBe(false);
    expect(isValidBibleDocumentStamp(null)).toBe(false);
  });

  it("템플릿도 유효하지 않은 스탬프면 만들 수 없다", () => {
    expect(() =>
      createPitchBibleTemplate({ id: "p", title: "t", stamp: { documentVersion: 0, seasonLabel: "" } }),
    ).toThrow();
  });

  it("표기 한 줄은 단일 출처로 만든다", () => {
    expect(formatBibleDocumentStampLine(STAMP)).toBe("v1 · 시즌 1 작성");
    expect(formatBibleDocumentStampLine(bumpBibleDocumentVersion(seasonArc()).stamp)).toBe("v2 · 시즌 1 작성");
  });

  it("버전 올리기는 원본을 바꾸지 않고, 시즌 재표기는 버전을 1로 되돌린다", () => {
    const doc = seasonArc();
    const bumped = bumpBibleDocumentVersion(doc);
    expect(doc.stamp.documentVersion).toBe(1);
    expect(bumped.stamp.documentVersion).toBe(2);
    const restamped = restampBibleDocumentForSeason(bumped, "시즌 2");
    expect(restamped.stamp).toEqual({ documentVersion: 1, seasonLabel: "시즌 2" });
  });

  it("스탬프가 깨진 문서는 검증에서 error다", () => {
    const broken = { ...seasonArc(), stamp: { documentVersion: 0, seasonLabel: "" } } as StudioSeasonArcBibleDocument;
    const issues = validateBibleDocument(broken);
    expect(issues.some((i) => i.code === "document-stamp-required" && i.severity === "error")).toBe(true);
  });
});

describe("유형 분리·템플릿", () => {
  it("3용도가 분리돼 있고 템플릿은 자기 용도만 만든다", () => {
    expect(STUDIO_BIBLE_DOCUMENT_PURPOSES).toEqual(["pitch", "season-arc", "continuity-db"]);
    const pitch = createPitchBibleTemplate({ id: "p1", title: "소개", stamp: STAMP });
    expect(pitch.purpose).toBe("pitch");
    expect("characterArcs" in pitch).toBe(false);
    const db = createContinuityDbBibleTemplate({ id: "d1", title: "DB", stamp: STAMP });
    expect(db.purpose).toBe("continuity-db");
    expect(db.facts).toEqual([]);
  });

  it("시즌 아크 템플릿은 캐릭터마다 want/need 쌍 자리를 만든다", () => {
    const doc = createSeasonArcBibleTemplate({
      id: "a1",
      title: "아크",
      stamp: STAMP,
      characters: [{ id: "c1", name: "모아" }],
    });
    expect(doc.characterArcs).toEqual([
      { characterId: "c1", characterName: "모아", want: "", need: "", arcSummary: "" },
    ]);
    // 비어 있는 want/need는 검증 error — 표준 산출물을 채워야 한다
    expect(validateBibleDocument(doc).some((i) => i.code === "season-arc-want-need-required")).toBe(true);
  });

  it("용도별 조회·개수", () => {
    const set = splitLegacyBibleBlob({ title: "모아의 마을" }, { projectId: "prj-1", stamp: STAMP });
    expect(bibleDocumentPurposeCounts(set)).toEqual({ pitch: 1, "season-arc": 1, "continuity-db": 1 });
    expect(bibleDocumentsByPurpose(set, "pitch")).toHaveLength(1);
    expect(validateBibleDocumentSet(set).filter((i) => i.severity === "error")).toHaveLength(0); // 캐릭터가 없으면 want/need error도 없다
  });
});

describe("시즌 아크 표준 산출물", () => {
  it("요약: want/need·스레드·비트 개수를 한 번에 낸다", () => {
    const summary = summarizeSeasonArcDocument(seasonArc());
    expect(summary.beatCount).toBe(3);
    expect(summary.openThreadCount).toBe(1);
    expect(summary.charactersMissingWantOrNeed).toBe(0);
    expect(summary.stampLine).toBe("v1 · 시즌 1 작성");
    expect(summary.lines.some((line) => line.includes("원하는 것"))).toBe(true);
  });

  it("보드: 회차 순서대로 열을 만들고 스레드 제목을 붙인다", () => {
    const board = buildSeasonArcBoard(seasonArc());
    expect(board.map((c) => c.episodeNumber)).toEqual([1, 2]);
    expect(board[0]?.threadTitles).toEqual(["마른 우물"]);
  });

  it("없는 스레드 참조·빈 비트를 검증이 잡는다", () => {
    const doc: StudioSeasonArcBibleDocument = {
      ...seasonArc(),
      episodeBeats: [
        { id: "ep-9", episodeLabel: "9화", episodeNumber: 9, title: "", beats: [], threadIds: ["nope"] },
      ],
    };
    const codes = validateBibleDocument(doc).map((i) => i.code);
    expect(codes).toContain("season-arc-episode-thread-unknown");
    expect(codes).toContain("season-arc-episode-beats-missing");
  });
});

describe("검수용 DB", () => {
  const bible: StudioStoryBible = {
    projectId: "prj-1",
    characters: [{ id: "char-1", name: "모아", aliases: [], defaultCostumeId: null, defaultAppearanceId: null }],
    locations: [{ id: "loc-1", name: "우물" }],
    facts: [],
  };

  it("스토리 바이블 사실로 투영한다", () => {
    const db = createContinuityDbBibleTemplate({
      id: "d1",
      title: "DB",
      stamp: STAMP,
      facts: [{ id: "f1", label: "우물은 시즌 초에 마른다", characterIds: ["char-1"], locationId: "loc-1" }],
    });
    expect(projectContinuityDbFacts(db)).toEqual([
      { id: "f1", label: "우물은 시즌 초에 마른다", characterIds: ["char-1"], locationId: "loc-1" },
    ]);
    expect(validateContinuityDbAgainstStoryBible(db, bible)).toEqual([]);
  });

  it("모르는 캐릭터 참조는 error다", () => {
    const db = createContinuityDbBibleTemplate({
      id: "d1",
      title: "DB",
      stamp: STAMP,
      facts: [{ id: "f1", label: "x", characterIds: ["ghost"], locationId: null }],
    });
    expect(validateContinuityDbAgainstStoryBible(db, bible).map((i) => i.code)).toContain(
      "continuity-fact-character-unknown",
    );
  });
});

describe("레거시 분리", () => {
  it("한 덩어리를 3용도로 나누고 goal은 want 초안으로만 간다", () => {
    const set = splitLegacyBibleBlob(
      {
        title: "모아의 마을",
        logline: "마른 마을에 물을 되찾는 이야기",
        synopsis: "모아가 산을 넘는다",
        characters: [{ id: "char-1", name: "모아", goal: "영웅이 되고 싶다" }],
        facts: [{ id: "f1", label: "우물은 말랐다", characterIds: ["char-1"], locationId: null }],
      },
      { projectId: "prj-1", stamp: STAMP },
    );
    const pitch = set.documents.find((d) => d.purpose === "pitch");
    const arc = set.documents.find((d) => d.purpose === "season-arc");
    const db = set.documents.find((d) => d.purpose === "continuity-db");
    expect(pitch?.purpose === "pitch" && pitch.logline).toBe("마른 마을에 물을 되찾는 이야기");
    expect(arc?.purpose === "season-arc" && arc.characterArcs[0]?.want).toBe("영웅이 되고 싶다");
    expect(arc?.purpose === "season-arc" && arc.characterArcs[0]?.need).toBe("");
    expect(db?.purpose === "continuity-db" && db.facts).toHaveLength(1);
    for (const document of set.documents) {
      expect(document.stamp).toEqual({ documentVersion: 1, seasonLabel: "시즌 1" });
    }
    // need가 비어 있어 검증 error 1건이 표준 흐름으로 남는다
    const errors = validateBibleDocumentSet(set).filter((i) => i.severity === "error");
    expect(errors.map((i) => i.code)).toEqual(["season-arc-want-need-required"]);
  });

  it("스탬프가 없으면 분리하지 않는다", () => {
    expect(() =>
      splitLegacyBibleBlob({ title: "x" }, { projectId: "p", stamp: { documentVersion: 0, seasonLabel: "" } }),
    ).toThrow();
  });
});
