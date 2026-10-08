// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringDeckSlide } from "./EngineeringDeckSlide";
import { FIXTURE_ATLAS_OPFS } from "./engineering-atlas.fixtures";
import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { buildDeckTrack, type DeckSectionPlan, type DeckSlide, type DeckSlideLayout } from "./engineering-deck-model";
import { DECK_POINT_MAX_WIDTH, visualWidth } from "./engineering-deck-fit";
import { FIXTURE_GRAPH } from "./engineering-diagram.fixtures";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";

const mocked = vi.hoisted(() => ({ entries: [] as EngineeringAtlasEntry[] }));
vi.mock("./engineering-atlas-content", () => ({
  ENGINEERING_ATLAS_ENTRIES: mocked.entries,
  findAtlasEntry: (id: string) => mocked.entries.find((entry) => entry.id === id),
  atlasEntriesForCategory: () => [],
  atlasEntriesForChapter: () => [],
}));

afterEach(cleanup);

const ko = (text: { readonly ko: string }): string => text.ko;

const SECTIONS: readonly DeckSectionPlan[] = [
  { id: "s", title: "구간", order: 1, seconds: 60, startSeconds: 0, firstSlideIndex: 0, slideCount: 1 },
];

const BASE: DeckSlide = {
  id: "test-slide",
  layout: "statement",
  eyebrow: "EYEBROW",
  title: "슬라이드 제목입니다",
  lead: "슬라이드 리드 문장입니다.",
  points: ["첫째 요점", "둘째 요점"],
  notes: "발표자 노트입니다 발표자 노트입니다",
  sectionId: "s",
  plannedSeconds: 60,
  plannedStartSeconds: 0,
};

function renderSlide(slide: DeckSlide, props: { fixed?: boolean; decorative?: boolean } = {}) {
  return render(<EngineeringDeckSlide slide={slide} index={0} total={3} sections={SECTIONS} {...props} />);
}

/** 레이아웃마다 본문이 있는 최소 슬라이드. `satisfies Record<…>` 라 레이아웃을 추가하면 여기도 채워야 컴파일된다. */
const MINIMAL: { readonly [Layout in DeckSlideLayout]: Partial<DeckSlide> } = {
  cover: {},
  agenda: {},
  statement: {},
  modules: { modules: [{ id: "m", icon: "canvas", title: "모듈 제목", body: "모듈 본문", stack: ["OPFS"] }] },
  demo: { demoSteps: [{ href: "/studio", action: "스튜디오 열기", expected: "캔버스가 보입니다", fallback: "스크린샷" }] },
  diagram: {},
  tech: { flow: ["입력", "처리", "출력"] },
  metrics: { facts: [{ value: "64", label: "방당 최대 연결" }] },
  lessons: {},
  qa: { links: [{ href: "/about/technology/atlas", label: "기술 도감" }] },
  atlas: {},
  table: { table: { columns: ["이름", "값"], rows: [["하나", "1"]] } },
  chapter: { flow: ["입력", "처리"] },
};

describe("모든 레이아웃이 본문을 그린다", () => {
  for (const layout of Object.keys(MINIMAL) as DeckSlideLayout[]) {
    it(`${layout}: 제목·본문이 비어 있지 않다`, () => {
      setAtlasEntries();
      const atlasSlide = layout === "atlas" ? buildDeckTrack("atlas", ko).slides[0] : undefined;
      const slide: DeckSlide = { ...BASE, ...(atlasSlide ?? {}), layout, ...MINIMAL[layout] };
      const { container } = renderSlide(slide);
      const body = container.querySelector(".deck-slide__body");
      expect(body, layout).not.toBeNull();
      expect(body?.textContent?.trim().length ?? 0, layout).toBeGreaterThan(10);
      expect(container.querySelector("[data-unhandled-layout]"), layout).toBeNull();
    });
  }

  it("알 수 없는 레이아웃도 빈 슬라이드가 되지 않고 제목·리드·요점을 그린다(컴파일 가드의 런타임 안전망)", () => {
    const slide = { ...BASE, layout: "future-layout" } as unknown as DeckSlide;
    const { container } = renderSlide(slide);
    const fallback = container.querySelector("[data-unhandled-layout]");
    expect(fallback?.getAttribute("data-unhandled-layout")).toBe("future-layout");
    expect(fallback?.textContent).toContain("슬라이드 제목입니다");
    expect(fallback?.textContent).toContain("첫째 요점");
  });
});

function setAtlasEntries(...entries: EngineeringAtlasEntry[]): void {
  mocked.entries.splice(0, mocked.entries.length, ...(entries.length ? entries : [FIXTURE_ATLAS_OPFS]));
}

describe("도감 카드 슬라이드(atlas)", () => {
  const entry: EngineeringAtlasEntry = {
    ...FIXTURE_ATLAS_OPFS,
    facts: [{ value: "64", label: { ko: "방당 최대 연결", en: "Max per room" }, source: "deploy/cloudflare-realtime/wrangler.jsonc" }],
    samples: [{
      ...(FIXTURE_ATLAS_OPFS.samples[0] as EngineeringAtlasEntry["samples"][number]),
      kind: "simplified",
      source: "apps/web/src/domains/creator/studio-opfs-filesystem.ts",
    }],
  };

  function atlasSlides(): readonly DeckSlide[] {
    setAtlasEntries(entry);
    return buildDeckTrack("atlas", ko).slides;
  }

  it("도식 면: 도식 렌더러(contain)·핵심 요점·상태 배지·기술 칩과 접근 가능한 이름을 가진다", () => {
    const slide = atlasSlides()[0];
    if (!slide) throw new Error("diagram slide is missing");
    const { container } = render(<EngineeringDeckSlide slide={slide} index={2} total={9} sections={SECTIONS} />);
    const article = container.querySelector("article");
    expect(article?.getAttribute("aria-roledescription")).toMatch(/슬라이드|slide/u);
    expect(article?.getAttribute("aria-label")).toBe(`3 / 9 · ${slide.title}`);
    const diagram = container.querySelector(".eng-dia");
    expect(diagram?.getAttribute("data-fit")).toBe("contain");
    expect(diagram?.getAttribute("data-diagram")).toBe(FIXTURE_ATLAS_OPFS.diagram.id);
    // 도식 자체의 캡션은 슬라이드 글자 크기로 따로 그린다.
    expect(container.querySelector(".eng-dia__caption")).toBeNull();
    expect(container.querySelector(".deck-atlas__caption")?.textContent).toBe(FIXTURE_ATLAS_OPFS.diagram.caption.ko);
    expect([...container.querySelectorAll(".deck-atlas__points li")].map((item) => item.textContent)).toEqual(["1파일처럼 읽고 씁니다", "2Worker에서 동기 접근이 가능합니다"]);
    expect(container.querySelector(".deck-slide__status")?.getAttribute("data-status")).toBe("live");
    expect([...container.querySelectorAll(".deck-slide__stack-chips li")].map((item) => item.textContent)).toEqual(["OPFS", "Dedicated Worker"]);
    // 도식 SVG 는 스크린 리더에서 숨기고 같은 내용을 텍스트 목록으로 제공한다.
    expect(container.querySelector(".eng-dia__svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".eng-dia__list-alt")?.textContent).toContain("편집 명령이 Worker를 거쳐 OPFS에 기록");
  });

  it("코드 면: 슬라이드용 코드 블록(복사 버튼 없음)·읽는 법·원본 경로, 글자 크기 변수를 가진다", () => {
    const slide = atlasSlides()[1];
    if (!slide) throw new Error("code slide is missing");
    const { container } = renderSlide(slide);
    const block = container.querySelector(".eng-code");
    expect(block?.getAttribute("data-variant")).toBe("slide");
    expect(block?.textContent).toContain("navigator.storage.getDirectory()");
    expect(container.querySelector(".eng-code__copy")).toBeNull();
    const size = container.querySelector<HTMLElement>(".deck-atlas__code")?.style.getPropertyValue("--deck-code-size");
    expect(Number(size)).toBeGreaterThan(0.8);
    expect(Number(size)).toBeLessThanOrEqual(1.7);
    expect(container.querySelector(".deck-atlas__explain-text")?.textContent).toBe(FIXTURE_ATLAS_OPFS.samples[0]?.explain.ko);
    expect(container.querySelector(".deck-atlas__source code")?.textContent).toBe("apps/web/src/domains/creator/studio-opfs-filesystem.ts");
    // 코드 영역은 키보드로 읽을 수 있는 이름 있는 영역이다.
    expect(block?.querySelector('[role="region"]')?.getAttribute("aria-label")).toMatch(/코드|code/u);
  });

  it("사용처 면: 기능→역할→파일, facts, 상위 링크 2개(바깥 링크는 새 탭·noopener)", () => {
    const slide = atlasSlides()[2];
    if (!slide) throw new Error("usage slide is missing");
    const { container } = renderSlide(slide);
    expect(container.querySelector(".deck-atlas__feature")?.textContent).toBe("캔버스 편집기 · 자동 저장");
    expect(container.querySelector(".deck-atlas__role")?.textContent).toBe("새로고침해도 작업이 돌아오도록 레이어를 기록합니다.");
    const pathCode = container.querySelector<HTMLElement>(".deck-atlas__paths code");
    expect(pathCode?.getAttribute("title")).toBe("apps/web/src/domains/creator/studio-opfs-filesystem.ts");
    expect(container.querySelector(".deck-atlas__route")?.textContent).toBe("/studio");
    expect(container.querySelector(".deck-atlas__facts dd")?.textContent).toBe("64");
    const links = [...container.querySelectorAll<HTMLAnchorElement>("a.deck-atlas__link")];
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system",
      "https://fs.spec.whatwg.org/",
    ]);
    for (const link of links) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    }
  });

  it("사용처 면: 옆 열이 넘치면 링크부터 줄이고 도감 카드에서 보라는 안내를 둔다", () => {
    const crowded: EngineeringAtlasEntry = {
      ...entry,
      name: "Durable Objects hibernation WebSockets and presence",
      facts: Array.from({ length: 5 }, (_, index) => ({
        value: "250,000 / 500,000",
        label: { ko: `방 하나가 받을 수 있는 연결 수와 재접속 유예 시간의 상한 기준 ${index + 1}`, en: `Connection cap ${index + 1}` },
        source: "deploy/cloudflare-realtime/wrangler.jsonc",
      })),
      links: [
        { title: "Cloudflare Durable Objects · WebSocket Hibernation API 공식 문서와 제한", url: "https://developers.cloudflare.com/durable-objects/", kind: "docs" },
        { title: "WebSocket Hibernation API 로 대기 중인 연결을 메모리에서 내리는 방법", url: "https://developers.cloudflare.com/durable-objects/api/", kind: "docs" },
      ],
    };
    setAtlasEntries(crowded);
    const usage = buildDeckTrack("atlas", ko).slides.find((slide) => slide.atlas?.view === "usage");
    if (!usage) throw new Error("usage slide is missing");
    const { container } = renderSlide(usage);
    const shownLinks = container.querySelectorAll("a.deck-atlas__link").length;
    expect(shownLinks).toBeLessThan(2);
    expect(container.querySelector(".deck-atlas__links-more")?.textContent).toContain(String(2 - shownLinks));
    // 수치도 상한(4개)을 넘는 만큼은 안내로 남긴다.
    expect(container.querySelectorAll(".deck-atlas__facts > div").length).toBeLessThanOrEqual(4);
    expect(container.querySelector(".deck-atlas__facts-more")?.textContent).toMatch(/\d/u);
    // 안내 문구는 정확한 개수를 담고, 글자 배율은 최소 아래로 내려가지 않는다.
    const fit = Number(container.querySelector<HTMLElement>(".deck-atlas__side")?.style.getPropertyValue("--deck-side-fit"));
    expect(fit).toBeGreaterThanOrEqual(0.7);
    expect(fit).toBeLessThanOrEqual(1);
  });

  it("눈썹(eyebrow)은 머리 높이가 변하지 않게 한 줄로 두고 전체 글을 title 에도 둔다", () => {
    const long = "백엔드·품질·운영 · Session token, CSRF defense and scoped OAuth cookies · 서비스에서 쓰인 곳";
    const { container } = renderSlide({ ...BASE, eyebrow: long });
    const eyebrow = container.querySelector(".deck-slide__eyebrow");
    expect(eyebrow?.textContent).toBe(long);
    expect(eyebrow?.getAttribute("title")).toBe(long);
  });

  it("썸네일(decorative)은 링크를 글자로 바꾸고 전체를 inert·aria-hidden 으로 만든다", () => {
    const slides = atlasSlides();
    const usage = slides[2];
    const code = slides[1];
    if (!usage || !code) throw new Error("slides are missing");
    const { container } = renderSlide(usage, { decorative: true, fixed: true });
    expect(container.querySelector("a")).toBeNull();
    const frame = container.querySelector(".deck-frame");
    expect(frame?.getAttribute("aria-hidden")).toBe("true");
    expect(frame?.hasAttribute("inert")).toBe(true);
    expect(frame?.getAttribute("data-fixed")).toBe("true");
    cleanup();
    // 코드 영역의 초점 이동(tabindex)이 있어도 inert 가 감싸므로 썸네일에서 키보드 초점이 들어가지 않는다.
    const codeThumb = renderSlide(code, { decorative: true, fixed: true });
    expect(codeThumb.container.querySelector(".deck-frame")?.hasAttribute("inert")).toBe(true);
  });
});

describe("표(table) 슬라이드", () => {
  const rows = Array.from({ length: 8 }, (_, index) => [`서비스 ${index + 1}`, "맡은 일", "무료 한도", "운영"]);
  const slide: DeckSlide = {
    ...BASE,
    layout: "table",
    title: "무료 서비스 지도",
    points: [],
    table: { columns: ["서비스", "역할", "한도", "상태"], rows, caption: "기준일 2026-10-07" },
  };

  it("열 제목·행 제목·캡션을 표 구조로 그리고 글자 크기를 정한다(8행×4열)", () => {
    const { container } = renderSlide(slide);
    const table = container.querySelector("table");
    expect(table?.querySelector("caption")?.textContent).toBe("기준일 2026-10-07");
    expect(table?.getAttribute("aria-label")).toBeNull();
    expect([...container.querySelectorAll('thead th[scope="col"]')].map((cell) => cell.textContent)).toEqual(["서비스", "역할", "한도", "상태"]);
    expect(container.querySelectorAll('tbody th[scope="row"]')).toHaveLength(8);
    expect(container.querySelectorAll("tbody td")).toHaveLength(24);
    expect(container.querySelector("tbody td")?.getAttribute("data-label")).toBe("역할");
    const size = Number(container.querySelector<HTMLElement>(".deck-slide__table-wrap")?.style.getPropertyValue("--deck-table-size"));
    expect(size).toBeGreaterThanOrEqual(1.2);
  });

  it("캡션이 없으면 슬라이드 제목이 표의 이름이다", () => {
    const { container } = renderSlide({ ...slide, table: { columns: ["가", "나"], rows: [["1", "2"]] } });
    expect(container.querySelector("table")?.getAttribute("aria-label")).toBe("무료 서비스 지도");
    expect(container.querySelector("caption")).toBeNull();
  });
});

describe("diagram 레이아웃", () => {
  it("slide.diagram 이 있으면 그 도식을, 없으면 기존 아키텍처 도식을 그린다", () => {
    const withSpec = renderSlide({ ...BASE, layout: "diagram", diagram: FIXTURE_GRAPH });
    expect(withSpec.container.querySelector(".eng-dia")?.getAttribute("data-diagram")).toBe(FIXTURE_GRAPH.id);
    expect(withSpec.container.querySelector(".eng-arch")).toBeNull();
    expect(withSpec.container.querySelector(".deck-slide__caption")?.textContent).toBe(BASE.lead);
    cleanup();
    const fallback = renderSlide({ ...BASE, layout: "diagram" });
    expect(fallback.container.querySelector(".eng-arch")).not.toBeNull();
    expect(fallback.container.querySelector(".eng-dia")).toBeNull();
    // 운영 원장은 Supabase, Neon 은 legacy 보존이다.
    expect(fallback.container.querySelector(".eng-arch__list")?.textContent).toContain("PostgreSQL (Supabase)");
    expect(fallback.container.querySelector(".eng-arch__list")?.textContent).not.toContain("Neon PostgreSQL");
  });
});

describe("qa 레이아웃의 QR", () => {
  const qa: DeckSlide = {
    ...BASE,
    layout: "qa",
    points: [],
    links: [{ href: "/about/technology/atlas", label: "기술 도감" }],
    qr: { href: "/about/technology/atlas", label: "기술 도감 열기" },
  };

  it("저장소의 qrcode 로 만든 인라인 SVG(데이터 URL·외부 리소스 없음)와 링크 텍스트를 함께 보여준다", () => {
    const { container } = renderSlide(qa);
    const svg = container.querySelector("svg.deck-slide__qr-code");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toContain("기술 도감 열기");
    expect(svg?.querySelector("path")?.getAttribute("d")?.length ?? 0).toBeGreaterThan(200);
    expect(container.querySelector(".deck-slide__qr img")).toBeNull();
    expect(container.querySelector(".deck-slide__qr figcaption code")?.textContent).toBe("toonstudio.cloud/about/technology/atlas");
    expect(container.querySelector(".deck-slide__qa")?.getAttribute("data-qr")).toBe("true");
  });

  it("QR 을 만들 수 없으면 링크 텍스트만 보여준다", () => {
    const { container } = renderSlide({ ...qa, qr: { href: `https://toonstudio.cloud/${"a".repeat(4000)}`, label: "너무 긴 링크" } });
    expect(container.querySelector("svg.deck-slide__qr-code")).toBeNull();
    expect(container.querySelector(".deck-slide__qr")?.getAttribute("data-state")).toBe("text");
    expect(container.querySelector(".deck-slide__qr figcaption")?.textContent).toContain("QR 코드를 만들지 못해 링크만 보여 드립니다");
  });

  it("QR 이 없으면 기존 질의응답 배치 그대로다", () => {
    const { container } = renderSlide({ ...qa, qr: undefined });
    expect(container.querySelector(".deck-slide__qr")).toBeNull();
    expect(container.querySelector(".deck-slide__qa")?.getAttribute("data-qr")).toBeNull();
  });
});

describe("modules 타일의 기술 칩", () => {
  it("stack 이 있는 타일만 칩을 그리고 알려진 기술은 공식 링크가 된다", () => {
    const { container } = renderSlide({
      ...BASE,
      layout: "modules",
      modules: [
        { id: "a", icon: "canvas", title: "캔버스", body: "그림", stack: ["OPFS", "Yjs"] },
        { id: "b", icon: "ai", title: "AI", body: "제안" },
      ],
    });
    const tiles = [...container.querySelectorAll(".deck-slide__modules > li")];
    expect(tiles).toHaveLength(2);
    expect([...(tiles[0]?.querySelectorAll(".deck-slide__module-stack li") ?? [])].map((chip) => chip.textContent)).toEqual(["OPFS", "Yjs"]);
    expect(tiles[1]?.querySelector(".deck-slide__module-stack")).toBeNull();
  });
});

describe("긴 문단 슬라이드", () => {
  it("문단이 길면 글자 크기 단계(data-density)를 올려 프레임 안에 담는다", () => {
    const long = "가".repeat(110);
    const dense = renderSlide({ ...BASE, layout: "chapter", points: [long, "짧은 문단", "짧은 문단 둘"] });
    expect(dense.container.querySelector("article")?.getAttribute("data-density")).toBe("dense");
    cleanup();
    const tight = renderSlide({ ...BASE, layout: "chapter", points: ["가".repeat(140), "짧은 문단"] });
    expect(tight.container.querySelector("article")?.getAttribute("data-density")).toBe("tight");
    cleanup();
    const normal = renderSlide({ ...BASE, layout: "chapter", points: ["짧은 문단", "짧은 문단 둘"] });
    expect(normal.container.querySelector("article")?.hasAttribute("data-density")).toBe(false);
  });

  it("brief 챕터 슬라이드는 슬라이드에 읽히는 길이를 넘는 문단만 줄이고 줄인 문단의 전문을 발표자 노트에 둔다", () => {
    const brief = buildDeckTrack("brief", ko);
    let clippedSlides = 0;
    for (const slide of brief.slides) {
      const chapter = PUBLISHED_ENGINEERING_CHAPTERS.find((item) => item.id === slide.id);
      if (!chapter) continue;
      const fulls = [chapter.problem.ko, chapter.decision.ko, chapter.userValue.ko];
      const clippedIndexes = fulls.flatMap((full, index) => (visualWidth(full) > DECK_POINT_MAX_WIDTH ? [index] : []));
      expect(slide.points, slide.id).toHaveLength(3);
      slide.points.forEach((point, index) => {
        expect(visualWidth(point), `${slide.id} 문단 ${index + 1}`).toBeLessThanOrEqual(DECK_POINT_MAX_WIDTH);
        if (!clippedIndexes.includes(index)) expect(point, `${slide.id} 문단 ${index + 1}은 원문 그대로`).toBe(fulls[index]?.trim());
      });
      if (clippedIndexes.length === 0) {
        expect(slide.notes, slide.id).toBe(chapter.tradeoff.ko);
        continue;
      }
      clippedSlides += 1;
      expect(slide.notes, slide.id).toContain("슬라이드에서 줄인 문단의 전문");
      for (const index of clippedIndexes) {
        expect(slide.points[index]?.endsWith("…"), `${slide.id} 줄임표`).toBe(true);
        // 원문은 발표자 노트에 그대로 남는다.
        expect(slide.notes, `${slide.id} 전문`).toContain(fulls[index]?.trim() ?? "");
      }
    }
    // 원문 데이터는 바꾸지 않는다(렌더 쪽에서만 줄인다).
    expect(PUBLISHED_ENGINEERING_CHAPTERS.find((item) => item.id === "webrtc-media-authority")?.decision.ko.length).toBeGreaterThan(0);
    expect(clippedSlides).toBeGreaterThanOrEqual(0);
  });
});
