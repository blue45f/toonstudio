import { describe, expect, it, vi } from "vitest";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { FIXTURE_ATLAS_BUDGET, FIXTURE_ATLAS_OPFS } from "./engineering-atlas.fixtures";
import {
  atlasCardStartIndex,
  atlasSlideId,
  atlasTrackSlideCount,
  atlasTrackSlideIds,
  orderedAtlasEntries,
} from "./engineering-deck-atlas";
import {
  buildDeckTrack,
  deckAdjacentCardStart,
  deckAtlasCardStart,
  deckCardIndexAt,
  deckCardOptions,
  deckCardStartById,
  deckScopeSlides,
  deckSlideProblems,
  deckTrackSlideCount,
  deckTrackSlideIds,
  deckTrackTotalSeconds,
  isTimedDeck,
  talkSlideToDeck,
} from "./engineering-deck-model";

/**
 * 도감 부록 트랙 구성 검사. 실제 도감은 다른 작업자가 채우는 중이라
 * 도감 집계 모듈을 예시 카드 2장으로 대체한다(카드 내용이 바뀌어도 엔진 검사는 흔들리지 않는다).
 */

const SECOND_SAMPLE = {
  ...FIXTURE_ATLAS_OPFS.samples[0],
  title: { ko: "두 번째 샘플", en: "Second sample" },
  code: "const second = 2;\nconst third = 3;",
  codeEn: "const second = 2; // english\nconst third = 3; // english",
  kind: "teaching",
  language: "ts",
  explain: { ko: "두 번째 예제입니다.", en: "The second example." },
} as const satisfies EngineeringAtlasEntry["samples"][number];

const THREE_SAMPLES: EngineeringAtlasEntry = {
  ...FIXTURE_ATLAS_OPFS,
  id: "fixture-three-samples",
  category: "drawing",
  name: "ThreeSamples",
  samples: [FIXTURE_ATLAS_OPFS.samples[0] as EngineeringAtlasEntry["samples"][number], SECOND_SAMPLE, { ...SECOND_SAMPLE, title: { ko: "셋째", en: "Third" } }],
};

const NO_SAMPLES: EngineeringAtlasEntry = {
  ...FIXTURE_ATLAS_BUDGET,
  id: "fixture-no-samples",
  category: "ai",
  name: "NoSamples",
  samples: [],
};

// 모듈 안에서 이 배열을 그대로 읽으므로 테스트마다 같은 배열의 내용만 바꾼다.
const mocked = vi.hoisted(() => ({ entries: [] as EngineeringAtlasEntry[] }));

vi.mock("./engineering-atlas-content", () => ({
  ENGINEERING_ATLAS_ENTRIES: mocked.entries,
  findAtlasEntry: (id: string) => mocked.entries.find((entry) => entry.id === id),
  atlasEntriesForCategory: (category: string) => mocked.entries.filter((entry) => entry.category === category),
  atlasEntriesForChapter: (chapterId: string) => mocked.entries.filter((entry) => entry.chapterIds.includes(chapterId)),
}));

const ko = (text: { readonly ko: string }): string => text.ko;
const en = (text: { readonly en: string }): string => text.en;

function setAtlasEntries(...entries: EngineeringAtlasEntry[]): void {
  mocked.entries.splice(0, mocked.entries.length, ...entries);
}

describe("도감 부록 트랙 구성", () => {
  it("카드마다 도식 → 코드 → 사용처 슬라이드를 만들고 시간 배정은 0이다", () => {
    setAtlasEntries(FIXTURE_ATLAS_OPFS, FIXTURE_ATLAS_BUDGET);
    const model = buildDeckTrack("atlas", ko);

    expect(model.track).toBe("atlas");
    expect(model.slides.map((slide) => slide.id)).toEqual([
      "atlas-fixture-opfs-diagram",
      "atlas-fixture-opfs-code-1",
      "atlas-fixture-opfs-usage",
      "atlas-fixture-free-budget-diagram",
      "atlas-fixture-free-budget-code-1",
      "atlas-fixture-free-budget-usage",
    ]);
    expect(model.slides.every((slide) => slide.layout === "atlas")).toBe(true);
    expect(model.slides.map((slide) => slide.atlas?.view)).toEqual(["diagram", "code", "usage", "diagram", "code", "usage"]);
    expect(model.totalSeconds).toBe(0);
    expect(deckTrackTotalSeconds("atlas")).toBe(0);
    expect(model.slides.every((slide) => slide.plannedSeconds === 0 && slide.plannedStartSeconds === 0)).toBe(true);
    expect(isTimedDeck(model)).toBe(false);
    expect(deckTrackSlideCount("atlas")).toBe(model.slides.length);
    expect(deckTrackSlideIds("atlas")).toEqual(model.slides.map((slide) => slide.id));
  });

  it("구간은 도감 카테고리이고 카드 목록이 구간별 첫 슬라이드를 가리킨다", () => {
    setAtlasEntries(FIXTURE_ATLAS_OPFS, FIXTURE_ATLAS_BUDGET);
    const model = buildDeckTrack("atlas", ko);

    expect(model.sections.map((section) => section.id)).toEqual(["local-first", "ai"]);
    expect(model.sections.map((section) => section.title)).toEqual(["로컬 우선·저장", "AI·추론"]);
    expect(model.sections.map((section) => [section.firstSlideIndex, section.slideCount, section.seconds])).toEqual([
      [0, 3, 0],
      [3, 3, 0],
    ]);
    expect(model.cards).toEqual([
      { id: "fixture-opfs", name: "OPFS", title: "브라우저 안의 비공개 파일 시스템", sectionId: "local-first", firstSlideIndex: 0, slideCount: 3 },
      { id: "fixture-free-budget", name: "Quota ledger", title: "무료 한도 원장", sectionId: "ai", firstSlideIndex: 3, slideCount: 3 },
    ]);
    expect(deckCardOptions(model).map((group) => [group.section.id, group.cards.map((card) => card.id)])).toEqual([
      ["local-first", ["fixture-opfs"]],
      ["ai", ["fixture-free-budget"]],
    ]);
  });

  it("카테고리가 흩어진 순서로 와도 구간이 갈라지지 않는다", () => {
    setAtlasEntries(FIXTURE_ATLAS_BUDGET, FIXTURE_ATLAS_OPFS, { ...FIXTURE_ATLAS_OPFS, id: "fixture-opfs-two", name: "OPFS 2" });
    expect(orderedAtlasEntries().map((entry) => entry.id)).toEqual(["fixture-opfs", "fixture-opfs-two", "fixture-free-budget"]);
    const model = buildDeckTrack("atlas", ko);
    expect(model.sections.map((section) => section.id)).toEqual(["local-first", "ai"]);
    expect(model.slides.map((slide) => slide.id)).toEqual(atlasTrackSlideIds());
  });

  it("코드 슬라이드는 샘플 수만큼, 최대 2개이고 샘플이 없으면 만들지 않는다", () => {
    setAtlasEntries(THREE_SAMPLES, NO_SAMPLES);
    const model = buildDeckTrack("atlas", ko);
    expect(model.slides.map((slide) => slide.id)).toEqual([
      "atlas-fixture-three-samples-diagram",
      "atlas-fixture-three-samples-code-1",
      "atlas-fixture-three-samples-code-2",
      "atlas-fixture-three-samples-usage",
      "atlas-fixture-no-samples-diagram",
      "atlas-fixture-no-samples-usage",
    ]);
    expect(atlasTrackSlideCount()).toBe(6);
    const second = model.slides[2]?.atlas?.code;
    expect(second).toMatchObject({ index: 1, count: 2, title: "두 번째 샘플" });
    expect(model.slides[2]?.eyebrow).toContain("코드 2/2");
    expect(model.cards?.map((card) => card.slideCount)).toEqual([4, 2]);
  });

  it("도식 면은 카드의 도식·핵심 요점·상태·기술 칩을 담는다", () => {
    setAtlasEntries(FIXTURE_ATLAS_OPFS);
    const slide = buildDeckTrack("atlas", ko).slides[0];
    expect(slide?.atlas?.diagram).toBe(FIXTURE_ATLAS_OPFS.diagram);
    expect(slide?.points).toEqual(["파일처럼 읽고 씁니다", "Worker에서 동기 접근이 가능합니다"]);
    expect(slide?.status).toBe("live");
    expect(slide?.stack).toEqual(["OPFS", "Dedicated Worker"]);
    expect(slide?.title).toBe("OPFS · 브라우저 안의 비공개 파일 시스템");
    expect(slide?.lead).toBe(FIXTURE_ATLAS_OPFS.tagline.ko);
    expect(slide?.eyebrow).toBe("로컬 우선·저장 · OPFS");
    expect(slide?.chapterId).toBe("storage");
    expect(slide?.evidence).toEqual(["apps/web/src/domains/creator/studio-opfs-filesystem.ts"]);
    // 노트는 30초 설명·비유·흔한 오해다.
    expect(slide?.notes).toContain("30초 설명");
    expect(slide?.notes).toContain(FIXTURE_ATLAS_OPFS.talk.pitch.ko);
    expect(slide?.notes).toContain(FIXTURE_ATLAS_OPFS.talk.analogy?.ko ?? "없음");
    expect(slide?.notes).toContain(FIXTURE_ATLAS_OPFS.talk.pitfall?.ko ?? "없음");
  });

  it("코드 면은 샘플 코드·설명·원본 경로를 담고 영어 화면에서는 codeEn 을 고른다", () => {
    setAtlasEntries({ ...FIXTURE_ATLAS_OPFS, samples: [{ ...SECOND_SAMPLE, kind: "simplified", source: "apps/web/src/domains/creator/studio-opfs-filesystem.ts" }] });
    const korean = buildDeckTrack("atlas", ko).slides[1];
    expect(korean?.atlas?.code).toMatchObject({
      title: "두 번째 샘플",
      language: "ts",
      code: SECOND_SAMPLE.code,
      explain: "두 번째 예제입니다.",
      source: "apps/web/src/domains/creator/studio-opfs-filesystem.ts",
    });
    expect(korean?.notes).toContain("apps/web/src/domains/creator/studio-opfs-filesystem.ts");
    const english = buildDeckTrack("atlas", en, { locale: "en-US" }).slides[1];
    expect(english?.atlas?.code?.code).toBe(SECOND_SAMPLE.codeEn);
    expect(english?.atlas?.code?.explain).toBe("The second example.");
    // 일본어처럼 한국어가 아닌 로케일도 영어 코드를 쓴다(코드는 번역하지 않는다).
    expect(buildDeckTrack("atlas", en, { locale: "ja" }).slides[1]?.atlas?.code?.code).toBe(SECOND_SAMPLE.codeEn);
    expect(buildDeckTrack("atlas", ko, { locale: "ko-KR" }).slides[1]?.atlas?.code?.code).toBe(SECOND_SAMPLE.code);
  });

  it("사용처 면은 기능→역할→파일, facts, 상위 링크 2개와 예상 질문을 담는다", () => {
    const entry: EngineeringAtlasEntry = {
      ...FIXTURE_ATLAS_OPFS,
      facts: [{ value: "64", label: { ko: "방당 최대 연결", en: "Max per room" }, source: "deploy/cloudflare-realtime/wrangler.jsonc" }],
      links: [
        ...FIXTURE_ATLAS_OPFS.links,
        { title: "세 번째 링크", url: "https://developer.mozilla.org/en-US/docs/Web/API/StorageManager", kind: "docs" },
      ],
    };
    setAtlasEntries(entry);
    const usage = buildDeckTrack("atlas", ko).slides[2];
    expect(usage?.atlas?.view).toBe("usage");
    expect(usage?.atlas?.usage).toEqual([
      {
        feature: "캔버스 편집기 · 자동 저장",
        role: "새로고침해도 작업이 돌아오도록 레이어를 기록합니다.",
        paths: ["apps/web/src/domains/creator/studio-opfs-filesystem.ts"],
        route: "/studio",
      },
    ]);
    expect(usage?.atlas?.facts).toEqual([{ value: "64", label: "방당 최대 연결", source: "deploy/cloudflare-realtime/wrangler.jsonc" }]);
    expect(usage?.atlas?.links?.map((link) => link.title)).toEqual(["MDN · Origin private file system", "WHATWG File System"]);
    expect(usage?.atlas?.links?.[0]?.kind).toBe("공식 문서");
    expect(usage?.lead).toBe("서비스의 1곳에서 쓰입니다");
    expect(usage?.notes).toContain("Q. 브라우저 저장소를 지우면요?");
    expect(usage?.notes).toContain("A. 그래서 내보내기와 개인 클라우드 백업을 함께 안내합니다.");
  });

  it("영어 화면은 영어 문구로 만든다", () => {
    setAtlasEntries(FIXTURE_ATLAS_OPFS);
    const slides = buildDeckTrack("atlas", en, { locale: "en" }).slides;
    expect(slides[0]?.title).toBe("OPFS · A private file system inside the browser");
    expect(slides[0]?.eyebrow).toBe("Local-first · storage · OPFS");
    expect(slides[2]?.lead).toBe("Used in 1 place of the service");
  });

  it("카드 단위 이동: 이전·다음 카드의 첫 슬라이드를 찾는다", () => {
    setAtlasEntries(FIXTURE_ATLAS_OPFS, FIXTURE_ATLAS_BUDGET);
    const model = buildDeckTrack("atlas", ko);
    expect(deckCardIndexAt(model, 0)).toBe(0);
    expect(deckCardIndexAt(model, 2)).toBe(0);
    expect(deckCardIndexAt(model, 3)).toBe(1);
    expect(deckCardIndexAt(model, 99)).toBe(-1);
    expect(deckAdjacentCardStart(model, 1, 1)).toBe(3);
    expect(deckAdjacentCardStart(model, 4, -1)).toBe(0);
    expect(deckAdjacentCardStart(model, 0, -1)).toBeNull();
    expect(deckAdjacentCardStart(model, 5, 1)).toBeNull();
    expect(deckCardStartById(model, "fixture-free-budget")).toBe(3);
    expect(deckCardStartById(model, "missing")).toBeNull();
    // 모델을 만들지 않고도 같은 위치를 계산한다.
    expect(deckAtlasCardStart("fixture-free-budget")).toBe(3);
    expect(atlasCardStartIndex("fixture-opfs")).toBe(0);
    expect(deckAtlasCardStart("missing")).toBeNull();
    // 카드가 없는 트랙에서는 이동하지 않는다.
    expect(deckAdjacentCardStart({ cards: undefined }, 0, 1)).toBeNull();
  });

  it("인쇄·내보내기 대상은 부록 트랙에서 현재 구간뿐이다", () => {
    setAtlasEntries(FIXTURE_ATLAS_OPFS, FIXTURE_ATLAS_BUDGET);
    const model = buildDeckTrack("atlas", ko);
    const first = deckScopeSlides(model, 1);
    expect(first.slides.map((slide) => slide.id)).toEqual(model.slides.slice(0, 3).map((slide) => slide.id));
    expect(first.firstIndex).toBe(0);
    expect(first.section?.id).toBe("local-first");
    const second = deckScopeSlides(model, 4);
    expect(second.firstIndex).toBe(3);
    expect(second.slides).toHaveLength(3);
    expect(second.section?.id).toBe("ai");

    const talk = buildDeckTrack("talk", ko);
    expect(deckScopeSlides(talk, 4).slides).toBe(talk.slides);
    expect(deckScopeSlides(talk, 4).firstIndex).toBe(0);
  });

  it("슬라이드 id 는 카드 id 와 면에서 결정되어 바뀌지 않는다", () => {
    expect(atlasSlideId("opfs", "diagram")).toBe("atlas-opfs-diagram");
    expect(atlasSlideId("opfs", "code")).toBe("atlas-opfs-code-1");
    expect(atlasSlideId("opfs", "code", 1)).toBe("atlas-opfs-code-2");
    expect(atlasSlideId("opfs", "usage")).toBe("atlas-opfs-usage");
  });
});

describe("도감이 비어 있을 때", () => {
  it("슬라이드 0장·구간 0개·시간 0으로 깨지지 않는다", () => {
    setAtlasEntries();
    const model = buildDeckTrack("atlas", ko);
    expect(model.slides).toEqual([]);
    expect(model.sections).toEqual([]);
    expect(model.cards).toEqual([]);
    expect(model.totalSeconds).toBe(0);
    expect(deckTrackSlideCount("atlas")).toBe(0);
    expect(deckTrackSlideIds("atlas")).toEqual([]);
    expect(deckScopeSlides(model, 0).slides).toEqual([]);
    expect(deckAtlasCardStart("anything")).toBeNull();
    expect(deckCardOptions(model)).toEqual([]);
  });
});

describe("talk 슬라이드의 도감 참조", () => {
  const base = {
    id: "talk-test",
    section: "core",
    eyebrow: { ko: "눈썹", en: "Eyebrow" },
    title: { ko: "제목입니다", en: "Title here" },
    lead: { ko: "리드 문장입니다.", en: "Lead sentence." },
    points: [],
    notes: { ko: "노트입니다 노트입니다 노트입니다", en: "Notes notes notes" },
    seconds: 60,
  } as const;

  it("atlas 참조를 카드의 해당 면으로 풀고 기술 칩·상태를 카드에서 가져온다", () => {
    setAtlasEntries(FIXTURE_ATLAS_OPFS);
    const slide = talkSlideToDeck({ ...base, layout: "atlas", atlas: { id: "fixture-opfs", view: "code" } }, ko, 0);
    expect(slide.atlas?.view).toBe("code");
    expect(slide.atlas?.code?.title).toBe("OPFS에 바이트 쓰기");
    expect(slide.stack).toEqual(["OPFS", "Dedicated Worker"]);
    expect(slide.status).toBe("live");
    expect(deckSlideProblems(slide)).toEqual([]);
  });

  it("샘플 번호를 지정하면 그 샘플을 보여준다", () => {
    setAtlasEntries(THREE_SAMPLES);
    const slide = talkSlideToDeck({ ...base, layout: "atlas", atlas: { id: "fixture-three-samples", view: "code", sample: 1 } }, ko, 0);
    expect(slide.atlas?.code?.index).toBe(1);
    expect(slide.atlas?.code?.title).toBe("두 번째 샘플");
  });

  it("도감에 없는 카드를 가리키면 조용히 넘어가지 않고 슬라이드 id 를 밝혀 던진다", () => {
    setAtlasEntries(FIXTURE_ATLAS_OPFS);
    expect(() => talkSlideToDeck({ ...base, layout: "atlas", atlas: { id: "no-such-card", view: "diagram" } }, ko, 0)).toThrowError(
      /Unknown atlas entry "no-such-card" referenced by talk slide "talk-test"/u,
    );
  });

  it("도감이 비어 있어도 도감 필드를 쓰지 않는 기존 슬라이드는 그대로 만들어진다", () => {
    setAtlasEntries();
    const slide = talkSlideToDeck({ ...base, layout: "statement" }, ko, 30);
    expect(slide.atlas).toBeUndefined();
    expect(slide.relatedAtlas).toBeUndefined();
    expect(slide.plannedStartSeconds).toBe(30);
    expect(() => buildDeckTrack("talk", ko)).not.toThrow();
  });

  it("relatedAtlasIds 는 있는 카드만 {id, name} 으로 풀고 없는 카드는 단추만 생략한다", () => {
    setAtlasEntries(FIXTURE_ATLAS_OPFS, FIXTURE_ATLAS_BUDGET);
    const slide = talkSlideToDeck({ ...base, layout: "statement", relatedAtlasIds: ["fixture-free-budget", "missing", "fixture-opfs"] }, ko, 0);
    expect(slide.relatedAtlas).toEqual([
      { id: "fixture-free-budget", name: "Quota ledger" },
      { id: "fixture-opfs", name: "OPFS" },
    ]);
  });

  it("diagram·table·qr·modules.stack 을 번역해 그대로 옮긴다", () => {
    setAtlasEntries();
    const diagramSlide = talkSlideToDeck(
      {
        ...base,
        layout: "diagram",
        diagram: FIXTURE_ATLAS_OPFS.diagram,
      },
      ko,
      0,
    );
    expect(diagramSlide.diagram).toBe(FIXTURE_ATLAS_OPFS.diagram);

    const tableSlide = talkSlideToDeck(
      {
        ...base,
        layout: "table",
        table: {
          columns: [{ ko: "이름", en: "Name" }, { ko: "한도", en: "Limit" }],
          rows: [[{ ko: "Cloudflare", en: "Cloudflare" }, { ko: "무료", en: "Free" }]],
          caption: { ko: "표 설명", en: "Caption" },
        },
      },
      en,
      0,
    );
    expect(tableSlide.table).toEqual({ columns: ["Name", "Limit"], rows: [["Cloudflare", "Free"]], caption: "Caption" });
    expect(deckSlideProblems(tableSlide)).toEqual([]);

    const qrSlide = talkSlideToDeck(
      { ...base, layout: "qa", links: [], qr: { href: "/about/technology/atlas", label: { ko: "도감", en: "Atlas" } } },
      ko,
      0,
    );
    expect(qrSlide.qr).toEqual({ href: "/about/technology/atlas", label: "도감" });

    const modulesSlide = talkSlideToDeck(
      {
        ...base,
        layout: "modules",
        modules: [{ id: "canvas", icon: "canvas", title: { ko: "캔버스", en: "Canvas" }, body: { ko: "그림", en: "Draw" }, stack: ["OPFS", "Yjs"] }],
      },
      ko,
      0,
    );
    expect(modulesSlide.modules?.[0]?.stack).toEqual(["OPFS", "Yjs"]);
  });

  it("레이아웃이 요구하는 데이터가 빠졌거나 표가 한 슬라이드에 읽히는 규모를 넘으면 문제로 알린다", () => {
    setAtlasEntries();
    const tableWith = (columns: number, rows: number, cells = columns) => ({
      ...base,
      layout: "table" as const,
      table: {
        columns: Array.from({ length: columns }, (_, index) => ({ ko: `열${index}`, en: `Col${index}` })),
        rows: Array.from({ length: rows }, () => Array.from({ length: cells }, () => ({ ko: "값", en: "v" }))),
      },
    });
    expect(deckSlideProblems(talkSlideToDeck(tableWith(4, 8), ko, 0))).toEqual([]);
    expect(deckSlideProblems(talkSlideToDeck(tableWith(5, 8), ko, 0)).join("\n")).toContain("표 열이 5개");
    expect(deckSlideProblems(talkSlideToDeck(tableWith(4, 9), ko, 0)).join("\n")).toContain("표 행이 9개");
    expect(deckSlideProblems(talkSlideToDeck(tableWith(4, 2, 3), ko, 0)).join("\n")).toContain("칸 수(3)가 열 수(4)와 다름");
    expect(deckSlideProblems(talkSlideToDeck({ ...base, layout: "table" }, ko, 0)).join("\n")).toContain("표가 비어 있음");
    expect(deckSlideProblems(talkSlideToDeck({ ...base, layout: "atlas" }, ko, 0)).join("\n")).toContain("atlas 데이터가 없음");
    expect(deckSlideProblems(talkSlideToDeck({ ...base, layout: "modules" }, ko, 0)).join("\n")).toContain("타일이 없음");
    expect(deckSlideProblems(talkSlideToDeck({ ...base, layout: "qa", links: [], qr: { href: "javascript:alert(1)", label: { ko: "x", en: "x" } } }, ko, 0)).join("\n")).toContain("QR 대상");
  });
});

describe("실제 도감 모듈 연결", () => {
  it("모델 슬라이드 id 순서와 deckTrackSlideIds 가 모든 트랙에서 같다", () => {
    setAtlasEntries(FIXTURE_ATLAS_OPFS, FIXTURE_ATLAS_BUDGET);
    for (const track of ["talk", "brief", "lecture", "atlas"] as const) {
      expect(deckTrackSlideIds(track), track).toEqual(buildDeckTrack(track, ko).slides.map((slide) => slide.id));
    }
  });
});
