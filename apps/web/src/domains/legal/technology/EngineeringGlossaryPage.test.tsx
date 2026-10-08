// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringGlossaryPage } from "./EngineeringGlossaryPage";
import { EngineeringSeminarPrep } from "./EngineeringSeminarPrep";
import {
  ENGINEERING_GLOSSARY,
  GLOSSARY_CATEGORIES,
  GLOSSARY_TERM_COUNT,
  type GlossaryCategoryId,
} from "./engineering-glossary-content";
import { buildDeckTrack } from "./engineering-deck-model";
import { ENGINEERING_GLOSSARY_MORE } from "./engineering-glossary-more";
import { resolveGlossaryLink } from "./engineering-glossary-links";
import {
  SEMINAR_PREP_CHECKLIST,
  SEMINAR_PREP_QUESTIONS,
} from "./engineering-seminar-prep-content";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));
// 도감 데이터는 용어집 화면이 렌더 뒤에 동적으로 불러온다. 화면 테스트에서는 카드 한 장짜리 픽스처로 바꾼다
// (실제 카드와의 연결은 아래 ‘실제 도감 데이터’ describe 가 따로 확인한다).
vi.mock("./engineering-atlas-content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./engineering-atlas-content")>();
  const { ENGINEERING_GLOSSARY: terms } = await import("./engineering-glossary-content");
  const firstAtlasId = terms.find((term) => (term.atlasIds?.length ?? 0) > 0)?.atlasIds?.[0];
  // 용어집 화면이 읽는 카드 목록만 한 장짜리 픽스처로 바꾼다. 세미나 발표 모델이 슬라이드에 끼워 넣는 카드와
  // 준비실의 질문별 카드 찾기(findAtlasEntry)는 실제 도감을 그대로 쓴다.
  return { ...actual, ENGINEERING_ATLAS_ENTRIES: firstAtlasId ? [{ id: firstAtlasId, name: "Fixture atlas card" }] : [] };
});

afterEach(cleanup);

describe("engineering glossary content", () => {
  it("covers every category with definition, analogy and real usage", () => {
    expect(GLOSSARY_TERM_COUNT).toBeGreaterThanOrEqual(35);
    expect(ENGINEERING_GLOSSARY.length).toBe(GLOSSARY_TERM_COUNT);
    const categoryIds = new Set(GLOSSARY_CATEGORIES.map((c) => c.id));
    for (const term of ENGINEERING_GLOSSARY) {
      expect(categoryIds.has(term.category)).toBe(true);
      expect(term.definition.ko.length).toBeGreaterThan(10);
      expect(term.analogy.ko.length).toBeGreaterThan(10);
      expect(term.inToonstudio.ko.length).toBeGreaterThan(10);
      // 영어 번역 누락 방지
      expect(term.definition.en.length).toBeGreaterThan(10);
      expect(term.analogy.en.length).toBeGreaterThan(10);
    }
    // id 중복 방지
    const ids = ENGINEERING_GLOSSARY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("links every ‘read more’ id to an existing story, guide or reference anchor", () => {
    for (const term of ENGINEERING_GLOSSARY) {
      for (const id of term.chapters) {
        const target = resolveGlossaryLink(id);
        expect(target, `${term.id} -> ${id}`).toBeDefined();
        expect(target?.href).toMatch(new RegExp(`^/about/technology/(story|guides|references)#${id}$`, "u"));
      }
    }
    expect(resolveGlossaryLink("pwa-safe-update")?.page).toBe("guides");
    expect(resolveGlossaryLink("threejs-r3f")?.page).toBe("references");
  });

  it("keeps every category non-empty", () => {
    for (const category of GLOSSARY_CATEGORIES) {
      const count = ENGINEERING_GLOSSARY.filter((t) => t.category === category.id).length;
      expect(count).toBeGreaterThan(0);
    }
  });
});

describe("extended glossary terms", () => {
  const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/u;
  const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
  const NEW_AREAS: readonly GlossaryCategoryId[] = ["web", "collab", "brush", "input", "spatial", "ai", "data", "oss", "craft"];

  it("adds a broad set of terms on top of the base glossary", () => {
    expect(ENGINEERING_GLOSSARY_MORE.length).toBeGreaterThanOrEqual(70);
    expect(GLOSSARY_TERM_COUNT).toBeGreaterThanOrEqual(110);
    for (const area of NEW_AREAS) {
      const count = ENGINEERING_GLOSSARY_MORE.filter((term) => term.category === area).length;
      expect(count, `${area} needs at least five extended terms`).toBeGreaterThanOrEqual(5);
    }
  });

  it("keeps every extended term complete, bilingual and short enough to read aloud", () => {
    const categoryIds = new Set<string>(GLOSSARY_CATEGORIES.map((category) => category.id));
    for (const term of ENGINEERING_GLOSSARY_MORE) {
      expect(KEBAB.test(term.id), `${term.id} should be kebab-case`).toBe(true);
      expect(categoryIds.has(term.category), `${term.id} category`).toBe(true);
      for (const field of ["term", "definition", "analogy", "inToonstudio"] as const) {
        const text = term[field];
        expect(text.ko.trim(), `${term.id}.${field}.ko`).toBe(text.ko);
        expect(text.en.trim(), `${term.id}.${field}.en`).toBe(text.en);
        expect(text.ko.length, `${term.id}.${field}.ko is empty`).toBeGreaterThan(1);
        expect(text.en.length, `${term.id}.${field}.en is empty`).toBeGreaterThan(1);
        // 영어 칸에는 한글이 없어야 한다(고유명사·코드 식별자는 영문 그대로).
        expect(HANGUL.test(text.en), `${term.id}.${field}.en contains Hangul`).toBe(false);
      }
      expect(term.definition.ko.length, `${term.id} definition is a one-liner`).toBeLessThanOrEqual(200);
      expect(term.analogy.ko.length, `${term.id} analogy`).toBeLessThanOrEqual(400);
      expect(term.inToonstudio.ko.length, `${term.id} inToonstudio (ko 400 chars)`).toBeLessThanOrEqual(400);
      expect(term.chapters.length, `${term.id} chapters`).toBeGreaterThanOrEqual(1);
      expect(term.chapters.length, `${term.id} chapters`).toBeLessThanOrEqual(3);
      expect(new Set(term.chapters).size, `${term.id} duplicate chapter`).toBe(term.chapters.length);
      expect(new Set(term.atlasIds ?? []).size, `${term.id} duplicate atlas id`).toBe((term.atlasIds ?? []).length);
    }
  });

  it("avoids superlative claims the project rules forbid", () => {
    for (const term of ENGINEERING_GLOSSARY_MORE) {
      const ko = [term.definition.ko, term.analogy.ko, term.inToonstudio.ko].join("\n");
      const en = [term.definition.en, term.analogy.en, term.inToonstudio.en].join("\n");
      expect(/최고|최초|완벽|무제한/u.test(ko), `${term.id} ko`).toBe(false);
      expect(/\b(?:best-in-class|world-class|perfect(?:ly)?|flawless|unlimited|first-ever|industry-first)\b/iu.test(en), `${term.id} en`).toBe(false);
    }
  });
});

describe("EngineeringGlossaryPage", () => {
  it("renders all terms with search and category filters", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology/glossary"]}>
        <EngineeringGlossaryPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: /기술 용어집|Technology glossary/u })).toBeTruthy();
    // 전체 용어 카드 수
    expect(document.querySelectorAll('article[id^="glossary-"]')).toHaveLength(ENGINEERING_GLOSSARY.length);

    // 검색: WASM
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "WASM" } });
    const cards = document.querySelectorAll('article[id^="glossary-"]');
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThan(ENGINEERING_GLOSSARY.length);

    // 검색 초기화 후 카테고리 필터
    fireEvent.change(search, { target: { value: "" } });
    const brushButton = screen.getByRole("button", { name: /브러시 · 렌더링/u });
    fireEvent.click(brushButton);
    const brushCount = ENGINEERING_GLOSSARY.filter((t) => t.category === "brush").length;
    expect(document.querySelectorAll('article[id^="glossary-"]')).toHaveLength(brushCount);
  });

  it("자료 페이지도 읽기 순서의 앞뒤 글과 대표 이미지를 받는다", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology/glossary"]}>
        <EngineeringGlossaryPage />
      </MemoryRouter>,
    );

    const heroArt = screen.getByRole("img", { name: /단계별 예제|Step-by-step examples/u });
    expect(heroArt.getAttribute("src")).toBe("/brand/workflow-20260928/learn-640.webp");

    expect(screen.getByText(/자료 · 용어집|Resources · Glossary/u)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /핵심 요약|Key summary/u })).toBeTruthy();

    const pager = screen.getByRole("navigation", { name: /기술 문서 이어보기|Continue through/u });
    expect(within(pager).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/about/technology/references",
      "/about/technology/licenses",
    ]);
    expect(within(pager).getByRole("link", { name: /다음 글.*라이선스|Next article.*Licenses/u })).toBeTruthy();
  });

  it("links glossary terms to story chapters", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology/glossary"]}>
        <EngineeringGlossaryPage />
      </MemoryRouter>,
    );
    const wasmCard = document.getElementById("glossary-wasm");
    if (!wasmCard) throw new Error("glossary-wasm card is missing");
    const chapterLink = wasmCard.querySelector('a[data-chapter-id="brush-engine"]');
    expect(chapterLink?.getAttribute("href")).toBe("/about/technology/story#brush-engine");
    // 링크 이름은 챕터 id가 아니라 사람이 읽는 챕터 제목이다.
    expect(within(wasmCard).getAllByRole("link").every((link) => !/^[a-z0-9-]+$/u.test(link.textContent ?? ""))).toBe(true);
  });

  it("shows a ‘Tech atlas cards’ chip only for atlas ids that resolve (atlas loaded lazily)", async () => {
    const withAtlas = ENGINEERING_GLOSSARY.flatMap((term) => (term.atlasIds && term.atlasIds.length > 0 ? [{ term, atlasIds: term.atlasIds }] : []));
    const [first] = withAtlas;
    if (!first) throw new Error("at least one glossary term should link an atlas card");
    const resolvedId = first.atlasIds[0];
    if (!resolvedId) throw new Error("first atlas id is missing");

    render(
      <MemoryRouter initialEntries={["/about/technology/glossary"]}>
        <EngineeringGlossaryPage />
      </MemoryRouter>,
    );

    // 도감 데이터는 렌더 뒤에 동적으로 불러온다 → 처음에는 줄이 없고, 불러온 뒤 칩이 생긴다.
    await waitFor(() => expect(document.querySelector(`#glossary-${first.term.id} a[data-atlas-id="${resolvedId}"]`)).toBeTruthy());
    const chip = document.querySelector(`#glossary-${first.term.id} a[data-atlas-id="${resolvedId}"]`);
    expect(chip?.getAttribute("href")).toBe(`/about/technology/atlas#${resolvedId}`);
    expect(chip?.textContent).toContain("Fixture atlas card");

    // 픽스처에 없는 카드 id 만 가진 용어에는 칩이 없다(없는 카드로 가는 링크를 만들지 않는다).
    const unresolved = withAtlas.find((item) => !item.atlasIds.includes(resolvedId));
    if (unresolved) {
      expect(document.querySelector(`#glossary-${unresolved.term.id} a[data-atlas-id]`)).toBeNull();
    }
    // atlasIds 가 없는 용어에도 칩이 없다.
    const plain = ENGINEERING_GLOSSARY.find((term) => !term.atlasIds || term.atlasIds.length === 0);
    if (!plain) throw new Error("a term without atlas ids is expected");
    expect(document.querySelector(`#glossary-${plain.id} a[data-atlas-id]`)).toBeNull();
  });
});

describe("glossary → atlas links against the real atlas data", () => {
  it("resolves every atlasIds entry to an actual atlas card", async () => {
    // 위 vi.mock 은 화면 테스트용이므로, 여기서는 실제 도감 모듈을 직접 불러온다.
    const actual = await vi.importActual<{ readonly ENGINEERING_ATLAS_ENTRIES: readonly { readonly id: string }[] }>("./engineering-atlas-content");
    const cardIds = new Set(actual.ENGINEERING_ATLAS_ENTRIES.map((entry) => entry.id));
    // 도감을 다른 작성자가 채우는 동안(카드가 한 장도 없을 때)에는 연결을 검사하지 않는다.
    if (cardIds.size === 0) return;
    const missing = ENGINEERING_GLOSSARY.flatMap((term) => (term.atlasIds ?? []).filter((id) => !cardIds.has(id)).map((id) => `${term.id} -> ${id}`));
    expect(missing).toEqual([]);
  });
});

describe("seminar prep content", () => {
  it("answers the 23 anticipated questions with glossary links", () => {
    expect(SEMINAR_PREP_QUESTIONS).toHaveLength(23);
    const glossaryIds = new Set(ENGINEERING_GLOSSARY.map((t) => t.id));
    for (const item of SEMINAR_PREP_QUESTIONS) {
      expect(item.answer.ko.length).toBeGreaterThan(20);
      expect(item.answer.en.length).toBeGreaterThan(20);
      if (item.glossaryId) expect(glossaryIds.has(item.glossaryId)).toBe(true);
    }
    expect(SEMINAR_PREP_CHECKLIST.length).toBeGreaterThanOrEqual(5);
  });
});

describe("EngineeringSeminarPrep", () => {
  afterEach(() => window.localStorage.clear());

  it("derives the section schedule from the talk slides and jumps to a section", () => {
    const model = buildDeckTrack("talk", (text) => text.ko);
    const onJump = vi.fn();
    render(
      <MemoryRouter initialEntries={["/about/technology/deck"]}>
        <EngineeringSeminarPrep model={model} onJump={onJump} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 3, name: /구간 시간표 · 총 30:00/u })).toBeTruthy();
    const schedule = screen.getAllByRole("button").filter((button) => /슬라이드 \d+장/u.test(button.textContent ?? ""));
    expect(schedule).toHaveLength(model.sections.length);
    const core = model.sections.find((section) => section.id === "core");
    if (!core) throw new Error("core section is missing");
    const coreButton = schedule.find((button) => button.textContent?.includes(core.title));
    if (!coreButton) throw new Error("core schedule button is missing");
    fireEvent.click(coreButton);
    expect(onJump).toHaveBeenCalledWith(core.firstSlideIndex);

    expect(screen.getByRole("heading", { level: 3, name: new RegExp(`예상 질문 ${SEMINAR_PREP_QUESTIONS.length}개`, "u") })).toBeTruthy();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(SEMINAR_PREP_CHECKLIST.length);
    const first = checkboxes[0];
    if (!(first instanceof HTMLInputElement)) throw new Error("checkbox is missing");
    fireEvent.click(first);
    expect(first.checked).toBe(true);
    expect(window.localStorage.getItem("toonstudio-seminar-prep-checklist-v1")).toContain("true");
  });
});
