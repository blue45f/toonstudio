// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { architectureOutline } from "./engineering-architecture-data";
import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { FIXTURE_ATLAS_BUDGET, FIXTURE_ATLAS_OPFS } from "./engineering-atlas.fixtures";
import { absoluteDeckUrl, buildQrSvgModel } from "./engineering-deck-qr";
import { FIXTURE_GRAPH, FIXTURE_LAYERS, FIXTURE_SEQUENCE } from "./engineering-diagram.fixtures";
import {
  buildOfflineEngineeringDeck,
  describeDiagramAsText,
  type ExportableDeckSlide,
  type OfflineDeckOptions,
} from "./engineering-deck-export";
import { buildDeckTrack, deckScopeSlides, talkSlideToDeck } from "./engineering-deck-model";
import type { TalkSlide } from "./engineering-talk-deck";

const mocked = vi.hoisted(() => ({ entries: [] as EngineeringAtlasEntry[] }));
vi.mock("./engineering-atlas-content", () => ({
  ENGINEERING_ATLAS_ENTRIES: mocked.entries,
  findAtlasEntry: (id: string) => mocked.entries.find((entry) => entry.id === id),
  atlasEntriesForCategory: () => [],
  atlasEntriesForChapter: () => [],
}));

// 실제 발표 원본이 가리키는 도감 카드는 이 테스트의 예시 도감에 없으므로, 카드를 가리키는 필드(atlas·relatedAtlasIds)는 떼고
// 카드 면 슬라이드(atlas 레이아웃)는 일반 슬라이드로 바꾼다. 엔진 검사가 발표 콘텐츠의 도감 참조에 흔들리지 않게 한다.
vi.mock("./engineering-talk-deck", async (importOriginal) => {
  const original = await importOriginal<typeof import("./engineering-talk-deck")>();
  const slides = original.TALK_SLIDES.map((slide) => {
    const { atlas: _atlas, relatedAtlasIds: _related, ...rest } = slide as typeof slide & { atlas?: unknown; relatedAtlasIds?: unknown };
    return slide.layout === "atlas" ? { ...rest, layout: "statement" as const } : rest;
  });
  return { ...original, TALK_SLIDES: slides };
});

const ko = (text: { readonly ko: string }): string => text.ko;
const en = (text: { readonly en: string }): string => text.en;

function setAtlasEntries(...entries: EngineeringAtlasEntry[]): void {
  mocked.entries.splice(0, mocked.entries.length, ...entries);
}

/** 외부 리소스·실행 코드가 새로 생기지 않았는지 확인하는 공통 검사. */
function expectSelfContained(html: string): void {
  expect(html.match(/<script\b[^>]*>/giu)).toHaveLength(1);
  expect(html).not.toMatch(/<(?:script|img|link|iframe|video|audio|source)[^>]+(?:src|href)=/iu);
  expect(html).not.toMatch(/<a\s/iu);
  expect(html).not.toMatch(/url\(\s*["']?https?:/iu);
  // 이스케이프된 코드 글자 안의 "onerror=" 는 글자일 뿐이다. 실제 태그에 이벤트 속성이 붙으면 안 된다.
  expect(html).not.toMatch(/<[a-z][^>]*\son[a-z]+\s*=/iu);
}

const koOptions = (model: ReturnType<typeof buildDeckTrack>): OfflineDeckOptions => ({
  localize: ko,
  sections: model.sections,
  architecture: architectureOutline(ko),
});

describe("오프라인 발표본 충실도: 세미나 발표", () => {
  const model = buildDeckTrack("talk", ko);
  const html = buildOfflineEngineeringDeck(model.slides, "ko", koOptions(model));
  const articles = html.split("<article data-slide").slice(1);

  it("모든 슬라이드가 한 장씩 들어가고 자체 스크립트 하나뿐인 단일 파일이다", () => {
    expect(articles).toHaveLength(model.slides.length);
    expectSelfContained(html);
  });

  it("모듈 타일·데모 단계(관찰·대체 경로)·수치·링크·상태 칩·구간 시간표를 모두 담는다", () => {
    const e = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
    for (const [index, slide] of model.slides.entries()) {
      const article = articles[index] ?? "";
      for (const module of slide.modules ?? []) {
        expect(article, `${slide.id} 모듈`).toContain(e(module.title));
        expect(article, `${slide.id} 모듈 본문`).toContain(e(module.body));
      }
      for (const step of slide.demoSteps ?? []) {
        expect(article, `${slide.id} 데모`).toContain(e(step.action));
        expect(article, `${slide.id} 기대`).toContain(e(step.expected));
        expect(article, `${slide.id} 대체 경로`).toContain(e(step.fallback));
      }
      for (const fact of slide.facts ?? []) {
        expect(article, `${slide.id} 수치`).toContain(e(fact.value));
        expect(article, `${slide.id} 수치 라벨`).toContain(e(fact.label));
      }
      for (const link of slide.links ?? []) expect(article, `${slide.id} 링크`).toContain(e(link.label));
      for (const chip of slide.statusChips ?? []) expect(article, `${slide.id} 상태`).toContain(e(chip.title));
      if (slide.layout === "agenda") {
        for (const section of model.sections) expect(article, "agenda 구간").toContain(e(section.title));
      }
    }
  });

  it("본문이 비는 슬라이드가 없다: 구조형 레이아웃은 제목·리드 말고도 본문 블록이 있다", () => {
    const structured = new Set(["agenda", "modules", "demo", "diagram", "qa", "metrics"]);
    for (const [index, slide] of model.slides.entries()) {
      if (!structured.has(slide.layout)) continue;
      const article = articles[index] ?? "";
      expect(article, slide.id).toMatch(/<h2>|<ol class="points|<ul class="grid|<dl>|<div class="cols">/u);
    }
    const architecture = articles[model.slides.findIndex((slide) => slide.layout === "diagram")] ?? "";
    expect(architecture).toContain("PostgreSQL (Supabase)");
    expect(architecture).not.toContain("Neon PostgreSQL");
  });

  it("영어 발표본은 영어 라벨과 영어 도식 개요를 쓴다", () => {
    const english = buildDeckTrack("talk", en);
    const text = buildOfflineEngineeringDeck(english.slides, "en", {
      localize: en,
      sections: english.sections,
      architecture: architectureOutline(en),
    });
    expect(text).toContain("Section schedule");
    expect(text).toContain("Workspaces");
    expect(text).toContain("Demo steps");
    expect(text).toContain("Speaker notes");
    expect(text).toContain("PostgreSQL (Supabase)");
  });
});

describe("오프라인 발표본 충실도: 도감 부록·새 레이아웃", () => {
  it("코드(구문 강조·이스케이프)·원본 경로·도식 글·쓰인 곳·링크를 담고 코드 안의 태그는 살아남지 않는다", () => {
    const evil: EngineeringAtlasEntry = {
      ...FIXTURE_ATLAS_OPFS,
      samples: [{
        ...(FIXTURE_ATLAS_OPFS.samples[0] as EngineeringAtlasEntry["samples"][number]),
        kind: "simplified",
        code: "const html = '<script>alert(1)</script>'; // </pre><img src=x onerror=alert(1)>\nconst ok = 1 < 2 && 3 > 2;",
        source: "apps/web/src/domains/creator/studio-opfs-filesystem.ts",
      }],
    };
    setAtlasEntries(evil, FIXTURE_ATLAS_BUDGET);
    const model = buildDeckTrack("atlas", ko);
    const scope = deckScopeSlides(model, 0);
    expect(scope.slides).toHaveLength(3);
    const html = buildOfflineEngineeringDeck(scope.slides, "ko", { localize: ko, sections: model.sections, scopeNote: "현재 구간(로컬 우선·저장)만 포함합니다." });

    expectSelfContained(html);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;/pre&gt;&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img src=x");
    // 코드 줄과 구문 강조
    expect(html).toMatch(/<pre tabindex="0"><code>/u);
    expect(html).toMatch(/<span class="t-keyword">const<\/span>/u);
    expect(html).toContain("TypeScript");
    expect(html).toContain("단순화 전 원본");
    expect(html).toContain("apps/web/src/domains/creator/studio-opfs-filesystem.ts");
    // 도식은 글로 풀린다(구성 요소 + 연결)
    expect(html).toContain("구성 요소");
    expect(html).toContain("편집 명령 → Worker (명령)");
    // 쓰인 곳: 기능 → 역할 → 파일 + 제품 경로 + 링크는 글자로만
    expect(html).toContain("캔버스 편집기 · 자동 저장");
    expect(html).toContain("새로고침해도 작업이 돌아오도록 레이어를 기록합니다.");
    expect(html).toContain("/studio");
    expect(html).toContain("https://fs.spec.whatwg.org/");
    expect(html).toContain("현재 구간(로컬 우선·저장)만 포함합니다.");
    // 첫 슬라이드에만 범위 안내가 있다.
    expect(html.split("현재 구간(로컬 우선·저장)만 포함합니다.")).toHaveLength(2);
    // 도식 면은 카드의 핵심 요점도 담는다.
    expect(html).toContain("파일처럼 읽고 씁니다");
  });

  it("표와 QR 과 modules.stack 을 담는다", () => {
    setAtlasEntries();
    const base = { section: "core", eyebrow: { ko: "눈썹", en: "Eyebrow" }, points: [], notes: { ko: "노트입니다 노트입니다", en: "notes notes" }, seconds: 30 } as const;
    const slides = [
      talkSlideToDeck({
        ...base,
        id: "t-table",
        layout: "table",
        title: { ko: "무료 서비스 지도", en: "Free map" },
        lead: { ko: "한 표로 봅니다.", en: "One table." },
        table: {
          columns: [{ ko: "서비스", en: "Service" }, { ko: "한도", en: "Limit" }],
          rows: [[{ ko: "Cloudflare <b>", en: "Cloudflare" }, { ko: "무료 & 충분", en: "Free" }]],
          caption: { ko: "기준일 2026-10-07", en: "As of 2026-10-07" },
        },
      } as TalkSlide, ko, 0),
      talkSlideToDeck({
        ...base,
        id: "t-qa",
        layout: "qa",
        title: { ko: "질의응답", en: "Q&A" },
        lead: { ko: "더 알아보기", en: "More" },
        links: [{ href: "/about/technology/atlas", label: { ko: "기술 도감", en: "Atlas" } }],
        qr: { href: "/about/technology/atlas", label: { ko: "도감 열기", en: "Open atlas" } },
      } as TalkSlide, ko, 0),
      talkSlideToDeck({
        ...base,
        id: "t-mod",
        layout: "modules",
        title: { ko: "작업 공간", en: "Spaces" },
        lead: { ko: "여섯 공간", en: "Six spaces" },
        modules: [{ id: "c", icon: "canvas", title: { ko: "캔버스", en: "Canvas" }, body: { ko: "그림", en: "Draw" }, href: "/studio", stack: ["OPFS", "Yjs"] }],
      } as TalkSlide, ko, 0),
      talkSlideToDeck({
        ...base,
        id: "t-dia",
        layout: "diagram",
        title: { ko: "저장 흐름", en: "Flow" },
        lead: { ko: "편집은 기기 안에서", en: "On device" },
        diagram: FIXTURE_SEQUENCE,
      } as TalkSlide, ko, 0),
    ];
    const html = buildOfflineEngineeringDeck(slides, "ko", { localize: ko });
    expectSelfContained(html);
    // 표: 캡션·열 제목·행(첫 열은 행 제목), 이스케이프
    expect(html).toContain("<caption>기준일 2026-10-07</caption>");
    expect(html).toContain('<th scope="col">서비스</th>');
    expect(html).toContain('<th scope="row">Cloudflare &lt;b&gt;</th>');
    expect(html).toContain("<td>무료 &amp; 충분</td>");
    // QR: 인라인 SVG + 링크 텍스트
    expect(html).toMatch(/<figure class="qr"><svg viewBox="0 0 \d+ \d+" role="img"/u);
    expect(html).toContain("https://toonstudio.cloud/about/technology/atlas");
    expect(html).toContain("toonstudio.cloud/about/technology/atlas");
    // 모듈 스택, 시퀀스 도식 글
    expect(html).toContain("OPFS · Yjs");
    expect(html).toContain("1. 브라우저 A → 시그널링 방: 티켓으로 입장");
    expect(html).toContain("5. 브라우저 B → 브라우저 A: 직접 미디어 연결 · WebRTC P2P");
  });

  it("QR 을 만들 수 없는 주소는 링크 텍스트만 남긴다", () => {
    const html = buildOfflineEngineeringDeck([
      { id: "x", eyebrow: "E", title: "질의응답", lead: "더", points: [], notes: "노트 노트 노트", qr: { href: "javascript:alert(1)", label: "나쁜 링크" } },
    ], "ko");
    expect(html).not.toContain("<svg");
    expect(html).toContain("javascript:alert(1)");
    expect(html).not.toMatch(/<a\s/iu);
  });
});

describe("도식을 글로 풀기", () => {
  it("그래프: 구성 요소는 위→아래·왼→오른 순서, 연결은 방향과 라벨을 담는다", () => {
    const text = describeDiagramAsText(FIXTURE_GRAPH, ko);
    expect(text.components.slice(0, 3)).toEqual(["편집 명령", "Worker — Dedicated Worker", "OPFS — 원본 레이어·타일"]);
    expect(text.components.at(-1)).toBe("Service Worker — 앱 셸 복구");
    expect(text.connections).toContain("Worker ↔ Service Worker");
    expect(text.connections).toContain("OPFS → SQLite WASM (색인)");
  });

  it("계층: 칩과 괄호 묶음을 담는다", () => {
    const text = describeDiagramAsText(FIXTURE_LAYERS, en);
    expect(text.components[0]).toBe("Browser — Sources live here · OPFS · Worker · WASM");
    expect(text.connections).toEqual(["Free plans · manual release: Cloudflare, Render Core API, Neon PostgreSQL"]);
  });
});

describe("QR 코드", () => {
  it("사이트 경로는 공개 호스트의 https 주소로, 그 밖의 값은 거절한다", () => {
    expect(absoluteDeckUrl("/about/technology/atlas")).toBe("https://toonstudio.cloud/about/technology/atlas");
    expect(absoluteDeckUrl("https://example.org/a")).toBe("https://example.org/a");
    expect(absoluteDeckUrl("//evil.example/a")).toBeNull();
    expect(absoluteDeckUrl("http://insecure.example/a")).toBeNull();
    expect(absoluteDeckUrl("javascript:alert(1)")).toBeNull();
  });

  it("행렬을 한 경로로 옮기며 어두운 모듈 수가 같다", () => {
    const url = "https://toonstudio.cloud/about/technology/atlas";
    const model = buildQrSvgModel(url);
    expect(model).not.toBeNull();
    if (!model) return;
    // 경로 명령(M x y h w v1 h-w z)을 풀어 어두운 칸 수를 센다.
    let dark = 0;
    for (const match of model.path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/gu)) dark += Number(match[3]);
    expect(dark).toBeGreaterThan(100);
    expect(model.size).toBeGreaterThanOrEqual(29 + 8);
    expect(buildQrSvgModel(url)).toBe(model);
  });

  it("너무 긴 주소는 null 이다(링크 텍스트로 대체)", () => {
    expect(buildQrSvgModel(`https://toonstudio.cloud/${"a".repeat(4000)}`)).toBeNull();
  });
});

describe("기존 계약 유지", () => {
  it("본문 필드가 없는 최소 슬라이드도 그대로 내보낸다", () => {
    const slide: ExportableDeckSlide = { id: "demo", eyebrow: "TEST", title: "제목", lead: "리드", points: ["하나"], notes: "노트 노트 노트" };
    const html = buildOfflineEngineeringDeck([slide], "ko");
    expect(html).toContain('<ol class="points"><li>하나</li></ol>');
    expect(html).toContain("외부 영상과 서비스는 포함하지 않습니다");
    expect(html).toContain("ArrowRight");
  });
});
