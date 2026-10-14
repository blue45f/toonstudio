import { describe, expect, it } from "vitest";

import {
  applyPitchDocumentToSlides,
  createEmptyPitchDocument,
  parsePitchDocument,
  pitchDocumentCompletion,
  pitchDocumentFromSlides,
  pitchDocumentHasContent,
  pitchDocumentSlides,
  PITCH_SLIDE_IDS,
  type ProductionPitchDocument,
} from "./studio-pitch-document";

const fullDocument: ProductionPitchDocument = {
  logline: "기억을 지우는 대가로 타인의 꿈에 들어가는 상담사의 이야기",
  synopsis: "꿈 상담사 서연은 남의 악몽을 대신 꾸며 주는 일을 한다.",
  characters: [
    { id: "pitch-character-1", name: "서연", role: "주인공", description: "타인의 악몽을 대신 꾸는 꿈 상담사" },
    { id: "pitch-character-2", name: "도현", role: "", description: "" },
  ],
  serializationPlan: { cadence: "주 1회, 매주 수요일", episodeCount: "시즌 1 총 24화", outline: "중반에 상담소의 비밀이 드러난다." },
};

describe("parsePitchDocument", () => {
  it("round-trips a complete document through JSON", () => {
    const parsed = parsePitchDocument(JSON.parse(JSON.stringify(fullDocument)));
    expect(parsed).toEqual(fullDocument);
  });

  it("defaults missing sections to empty instead of rejecting the document", () => {
    expect(parsePitchDocument({ logline: " 한 줄 " })).toEqual({
      logline: "한 줄",
      synopsis: "",
      characters: [],
      serializationPlan: { cadence: "", episodeCount: "", outline: "" },
    });
    expect(parsePitchDocument({})).toEqual(createEmptyPitchDocument());
  });

  it.each([
    ["non-record", null],
    ["array root", []],
    ["oversized logline", { logline: "x".repeat(301) }],
    ["oversized synopsis", { synopsis: "x".repeat(4_001) }],
    ["too many characters", { characters: Array.from({ length: 9 }, (_, i) => ({ id: `c-${i}`, name: "가" })) }],
    ["character without name", { characters: [{ id: "c-1", name: " " }] }],
    ["character with unsafe id", { characters: [{ id: "c\\1", name: "가" }] }],
    ["oversized plan outline", { serializationPlan: { outline: "x".repeat(2_001) } }],
  ])("rejects %s", (_label, value) => {
    expect(parsePitchDocument(value)).toBeNull();
  });
});

describe("pitchDocumentSlides", () => {
  it("builds one slide per filled section with stable ids", () => {
    const slides = pitchDocumentSlides(fullDocument);
    expect(slides.map((slide) => slide.id)).toEqual([
      PITCH_SLIDE_IDS.logline,
      PITCH_SLIDE_IDS.synopsis,
      PITCH_SLIDE_IDS.characters,
      PITCH_SLIDE_IDS.serializationPlan,
    ]);
    expect(slides[2]).toEqual({
      id: PITCH_SLIDE_IDS.characters,
      title: "주요 캐릭터",
      body: "서연 (주인공) — 타인의 악몽을 대신 꾸는 꿈 상담사\n도현",
    });
    expect(slides[3]!.body).toBe("연재 주기: 주 1회, 매주 수요일\n목표 회차: 시즌 1 총 24화\n중반에 상담소의 비밀이 드러난다.");
  });

  it("skips empty sections and returns no slides for an empty document", () => {
    expect(pitchDocumentSlides(createEmptyPitchDocument())).toEqual([]);
    expect(pitchDocumentSlides({ ...createEmptyPitchDocument(), logline: "한 줄" })).toEqual([
      { id: PITCH_SLIDE_IDS.logline, title: "로그라인", body: "한 줄" },
    ]);
  });

  it("keeps every generated slide body inside the workspace slide limit", () => {
    const maximal: ProductionPitchDocument = {
      logline: "가".repeat(300),
      synopsis: "나".repeat(4_000),
      characters: Array.from({ length: 8 }, (_, i) => ({
        id: `pitch-character-${i}`,
        name: "이".repeat(80),
        role: "름".repeat(80),
        description: "명".repeat(300),
      })),
      serializationPlan: { cadence: "주".repeat(120), episodeCount: "회".repeat(120), outline: "개".repeat(2_000) },
    };
    for (const slide of pitchDocumentSlides(maximal)) {
      expect(slide.title.length).toBeLessThanOrEqual(240);
      expect(slide.body.length).toBeLessThanOrEqual(4_000);
    }
  });
});

describe("applyPitchDocumentToSlides", () => {
  it("replaces pitch slides in front and preserves manual slides", () => {
    const manual = { id: "slide-manual", title: "직접 만든 슬라이드", body: "그대로 둔다" };
    const once = applyPitchDocumentToSlides([manual], fullDocument);
    expect(once.map((slide) => slide.id)).toEqual([
      PITCH_SLIDE_IDS.logline,
      PITCH_SLIDE_IDS.synopsis,
      PITCH_SLIDE_IDS.characters,
      PITCH_SLIDE_IDS.serializationPlan,
      "slide-manual",
    ]);

    const edited: ProductionPitchDocument = { ...fullDocument, logline: "바뀐 로그라인" };
    const twice = applyPitchDocumentToSlides(once, edited);
    expect(twice).toHaveLength(5);
    expect(twice[0]).toEqual({ id: PITCH_SLIDE_IDS.logline, title: "로그라인", body: "바뀐 로그라인" });
    expect(twice[4]).toEqual(manual);
    // 같은 문서로 다시 반영해도 결과가 변하지 않는다(멱등).
    expect(applyPitchDocumentToSlides(twice, edited)).toEqual(twice);
  });

  it("removes pitch slides when the document is emptied", () => {
    const withPitch = applyPitchDocumentToSlides([], fullDocument);
    expect(applyPitchDocumentToSlides(withPitch, createEmptyPitchDocument())).toEqual([]);
  });
});

describe("pitchDocumentFromSlides", () => {
  it("restores the document from pitch slides for legacy workspaces", () => {
    const restored = pitchDocumentFromSlides(pitchDocumentSlides(fullDocument));
    expect(restored.logline).toBe(fullDocument.logline);
    expect(restored.synopsis).toBe(fullDocument.synopsis);
    expect(restored.characters.map(({ name, role, description }) => ({ name, role, description }))).toEqual([
      { name: "서연", role: "주인공", description: "타인의 악몽을 대신 꾸는 꿈 상담사" },
      { name: "도현", role: "", description: "" },
    ]);
    expect(restored.serializationPlan).toEqual(fullDocument.serializationPlan);
    for (const character of restored.characters) {
      expect(character.id).not.toContain("\\");
    }
  });

  it("ignores free-form slides that the pitch document does not own", () => {
    const restored = pitchDocumentFromSlides([
      { id: "slide-concept", title: "작품 한 문장", body: "자유 슬라이드" },
    ]);
    expect(restored).toEqual(createEmptyPitchDocument());
  });
});

describe("pitchDocumentCompletion / pitchDocumentHasContent", () => {
  it("counts filled sections and lists the missing ones", () => {
    expect(pitchDocumentCompletion(createEmptyPitchDocument())).toEqual({
      filledCount: 0,
      totalCount: 4,
      missingSections: ["로그라인", "시놉시스", "주요 캐릭터", "연재 계획"],
    });
    expect(pitchDocumentCompletion(fullDocument)).toEqual({
      filledCount: 4,
      totalCount: 4,
      missingSections: [],
    });
    expect(pitchDocumentHasContent(createEmptyPitchDocument())).toBe(false);
    expect(pitchDocumentHasContent(fullDocument)).toBe(true);
  });
});
