// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  TECH_AI_SHOWCASE_MODULES,
  TECH_GLOSSARY_CATEGORIES,
  TECH_PLAIN_GLOSSARY,
  TECH_PRESENTATION_SLIDES,
  filterGlossaryEntries,
} from "./tech-presentation-deck-data";
import { TechPresentationDeckSection } from "./TechPresentationDeckSection";
import { ToonStudioTechShowcasePage } from "./ToonStudioTechShowcasePage";

import { useI18n } from "@/shared/lib/i18n";

const REPO_ROOT = path.resolve(process.cwd());
const KOREAN_RE = /[\uAC00-\uD7A3]/u;
const RAW_COLOR_RE = /#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\(/i;

describe("Tech presentation deck data integrity & repo evidence", () => {
  it("contains 16 complete bilingual slides with 3-part practical playbooks, valid diagrams, and real repoPaths & sprites", () => {
    expect(TECH_PRESENTATION_SLIDES).toHaveLength(16);

    const seenIds = new Set<string>();
    for (let i = 0; i < TECH_PRESENTATION_SLIDES.length; i += 1) {
      const slide = TECH_PRESENTATION_SLIDES[i]!;
      expect(slide.slideNumber).toBe(i + 1);
      expect(seenIds.has(slide.id)).toBe(false);
      seenIds.add(slide.id);

      expect(slide.brandSystem.length).toBeGreaterThan(2);
      expect(slide.diagramNodes.length).toBeGreaterThanOrEqual(3);
      expect(slide.repoPaths.length).toBeGreaterThan(0);

      const bilingualFields = [
        slide.sectionTag,
        slide.title,
        slide.summary,
        slide.spriteAlt,
        slide.diagramTitle,
        slide.whyChosen,
        slide.whereUsed,
        slide.reusePlaybook,
        slide.plainBackground,
        slide.tradeoff,
        slide.speakerNotes,
      ];
      for (const field of bilingualFields) {
        expect(field.ko.trim().length, `${slide.id} ko`).toBeGreaterThan(0);
        expect(field.en.trim().length, `${slide.id} en`).toBeGreaterThan(0);
        expect(field.en, `${slide.id} en leakage`).not.toMatch(KOREAN_RE);
      }

      for (const node of slide.diagramNodes) {
        expect(node.stage.length).toBeGreaterThan(0);
        expect(node.label.ko.length).toBeGreaterThan(0);
        expect(node.label.en).not.toMatch(KOREAN_RE);
        expect(node.metric.ko.length).toBeGreaterThan(0);
        expect(node.metric.en).not.toMatch(KOREAN_RE);
      }

      // 실제 저장소에 파일이 실존하는지 전수 검증
      for (const relPath of slide.repoPaths) {
        expect(existsSync(path.join(REPO_ROOT, relPath)), `${slide.id}: ${relPath}`).toBe(true);
      }

      // 실제 public 스프라이트가 디스크에 존재하는지 검증
      const spriteDiskPath = path.join(
        REPO_ROOT,
        "apps/web/public",
        slide.spritePath.replace(/^\//u, ""),
      );
      expect(existsSync(spriteDiskPath), `${slide.id}: ${slide.spritePath}`).toBe(true);
    }
  });

  it("covers all 8 AI assistant showcase modules with verified repository paths and clean English", () => {
    expect(TECH_AI_SHOWCASE_MODULES).toHaveLength(8);

    const seenIds = new Set<string>();
    for (let i = 0; i < TECH_AI_SHOWCASE_MODULES.length; i += 1) {
      const mod = TECH_AI_SHOWCASE_MODULES[i]!;
      expect(mod.code).toBe(`AI-0${i + 1}`);
      expect(seenIds.has(mod.id)).toBe(false);
      seenIds.add(mod.id);

      const fields = [mod.title, mod.whatItSolves, mod.howItWorks, mod.whereUsed, mod.reuseCase];
      for (const field of fields) {
        expect(field.ko.length).toBeGreaterThan(0);
        expect(field.en.length).toBeGreaterThan(0);
        expect(field.en, `${mod.id} en`).not.toMatch(KOREAN_RE);
      }

      expect(mod.repoPaths.length).toBeGreaterThan(0);
      for (const relPath of mod.repoPaths) {
        expect(existsSync(path.join(REPO_ROOT, relPath)), `${mod.id}: ${relPath}`).toBe(true);
      }
    }
  });

  it("exposes 22 plain-language glossary entries with valid slide cross-references and multi-token search", () => {
    expect(TECH_PLAIN_GLOSSARY).toHaveLength(22);
    expect(TECH_GLOSSARY_CATEGORIES).toHaveLength(7);

    for (const entry of TECH_PLAIN_GLOSSARY) {
      expect(entry.term.ko.length).toBeGreaterThan(0);
      expect(entry.term.en).not.toMatch(KOREAN_RE);
      expect(entry.oneLineAnalogy.ko.length).toBeGreaterThan(0);
      expect(entry.oneLineAnalogy.en).not.toMatch(KOREAN_RE);
      expect(entry.technicalMeaning.ko.length).toBeGreaterThan(0);
      expect(entry.technicalMeaning.en).not.toMatch(KOREAN_RE);
      expect(entry.usedInSlideNumbers.length).toBeGreaterThan(0);

      for (const slideNum of entry.usedInSlideNumbers) {
        expect(slideNum).toBeGreaterThanOrEqual(1);
        expect(slideNum).toBeLessThanOrEqual(TECH_PRESENTATION_SLIDES.length);
      }
    }

    const kmMatches = filterGlossaryEntries(TECH_PLAIN_GLOSSARY, "all", "쿠벨카 분광");
    expect(kmMatches.some((item) => item.id === "kubelka-munk")).toBe(true);

    const uxMatches = filterGlossaryEntries(TECH_PLAIN_GLOSSARY, "ux-web", "APCA");
    expect(uxMatches.map((item) => item.id)).toEqual(["oklch-apca"]);

    const emptyMatches = filterGlossaryEntries(TECH_PLAIN_GLOSSARY, "ai", "xyznonexistent");
    expect(emptyMatches).toHaveLength(0);
  });

  it("enforces zero raw hex/rgb/hsl, zero transition-all, zero Sparkles, and zero '= {}' default props in new showcase files", () => {
    const filesToAudit = [
      "apps/web/src/domains/showcase/tech-presentation-deck-data.ts",
      "apps/web/src/domains/showcase/TechPresentationDeckSection.tsx",
      "apps/web/src/domains/showcase/ToonStudioTechShowcasePage.tsx",
    ];
    for (const relPath of filesToAudit) {
      const source = readFileSync(path.join(REPO_ROOT, relPath), "utf8");
      expect(source, `${relPath} raw colors`).not.toMatch(RAW_COLOR_RE);
      expect(source, `${relPath} transition-all`).not.toContain("transition-all");
      expect(source, `${relPath} Sparkles`).not.toContain("Sparkles");
      expect(source, `${relPath} default empty object prop`).not.toMatch(/=\s*\{\s*\}/u);
    }
  });
});

describe("TechPresentationDeckSection interactive deck, AI grid & glossary", () => {
  afterEach(() => {
    cleanup();
  });

  it("navigates slides via buttons, TOC jump, and keyboard arrows while ignoring arrows inside search input", () => {
    render(
      <MemoryRouter>
        <TechPresentationDeckSection locale="ko" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("tech-deck-counter").textContent).toBe("01 / 16");
    expect(screen.getByTestId("tech-deck-active-slide").getAttribute("data-slide-id")).toBe("zero-copy-overview");

    // 버튼 이동
    fireEvent.click(screen.getByTestId("tech-deck-next"));
    expect(screen.getByTestId("tech-deck-counter").textContent).toBe("02 / 16");
    expect(screen.getByTestId("tech-deck-active-slide").getAttribute("data-slide-id")).toBe("rust-wasm64-core");

    fireEvent.click(screen.getByTestId("tech-deck-prev"));
    expect(screen.getByTestId("tech-deck-counter").textContent).toBe("01 / 16");

    // 키보드 ArrowRight / ArrowLeft 이동
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("tech-deck-counter").textContent).toBe("02 / 16");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("tech-deck-counter").textContent).toBe("03 / 16");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByTestId("tech-deck-counter").textContent).toBe("02 / 16");

    // 검색 입력창 내부에서는 Arrow 키가 슬라이드를 이동시키지 않음
    const searchInput = screen.getByTestId("tech-glossary-search");
    fireEvent.keyDown(searchInput, { key: "ArrowRight" });
    expect(screen.getByTestId("tech-deck-counter").textContent).toBe("02 / 16");

    // 전체 목차 14번(CalmChrome UX)으로 직접 점프
    fireEvent.click(screen.getByTestId("tech-deck-toc-14"));
    expect(screen.getByTestId("tech-deck-counter").textContent).toBe("14 / 16");
    expect(screen.getByTestId("tech-deck-active-slide").getAttribute("data-slide-id")).toBe(
      "calm-chrome-ux-engineering",
    );
  });

  it("toggles speaker notes, renders semantic raw-color-free SVG diagram, 8 AI modules, and deep links", () => {
    render(
      <MemoryRouter>
        <TechPresentationDeckSection locale="ko" />
      </MemoryRouter>,
    );

    // 초기 발표자 대본 닫힘 -> 토글 시 표시
    expect(screen.queryByTestId("tech-deck-speaker-notes")).toBeNull();
    const notesBtn = screen.getByTestId("tech-deck-notes-toggle");
    expect(notesBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(notesBtn);
    expect(notesBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("tech-deck-speaker-notes").textContent?.length).toBeGreaterThan(20);

    // 순수 시맨틱 SVG 다이어그램에 원시 색상 0건
    const svg = screen.getByTestId("tech-deck-diagram-svg");
    expect(svg.innerHTML).not.toMatch(RAW_COLOR_RE);

    // 3단 실무 해설 카드 모두 존재
    expect(screen.getByTestId("tech-deck-why-chosen").textContent).toContain("왜 이 기술을 선택했나");
    expect(screen.getByTestId("tech-deck-where-used").textContent).toContain("ToonStudio 실제 적용처");
    expect(screen.getByTestId("tech-deck-reuse-playbook").textContent).toContain("다른 프로젝트 재사용법");

    // 원클릭 포털 링크 3종 검증
    expect(screen.getByTestId("tech-deck-link-full-deck").getAttribute("href")).toBe("/about/technology/deck");
    expect(screen.getByTestId("tech-deck-link-architecture").getAttribute("href")).toBe(
      "/about/technology/architecture",
    );
    expect(screen.getByTestId("tech-deck-link-glossary").getAttribute("href")).toBe("/about/technology/glossary");

    // AI 어시스턴트 8대 모듈 전원 렌더링 검증
    for (const mod of TECH_AI_SHOWCASE_MODULES) {
      expect(screen.getByTestId(`tech-ai-module-${mod.id}`)).toBeTruthy();
    }
  });

  it("filters glossary by category & search query, resets empty results, and jumps to referenced slide", () => {
    render(
      <MemoryRouter>
        <TechPresentationDeckSection locale="ko" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("tech-glossary-count").textContent).toContain("22 / 22");

    // AI 카테고리 필터
    fireEvent.click(screen.getByTestId("tech-glossary-cat-ai"));
    expect(screen.getByTestId("tech-glossary-count").textContent).toContain("3 / 22");
    expect(screen.getByTestId("tech-glossary-item-zero-bill-fail-closed")).toBeTruthy();

    // 검색으로 0건 상태 만든 뒤 초기화
    const searchInput = screen.getByTestId("tech-glossary-search");
    fireEvent.change(searchInput, { target: { value: "zzzz-no-match" } });
    expect(screen.getByTestId("tech-glossary-count").textContent).toContain("0 / 22");
    fireEvent.click(screen.getByTestId("tech-glossary-reset"));
    expect(screen.getByTestId("tech-glossary-count").textContent).toContain("22 / 22");

    // 검색 후 용어의 슬라이드 점프 버튼 클릭 -> 해당 슬라이드로 즉시 이동
    fireEvent.change(searchInput, { target: { value: "APCA" } });
    expect(screen.getByTestId("tech-glossary-item-oklch-apca")).toBeTruthy();
    fireEvent.click(screen.getByTestId("tech-glossary-jump-oklch-apca-15"));
    expect(screen.getByTestId("tech-deck-counter").textContent).toBe("15 / 16");
    expect(screen.getByTestId("tech-deck-active-slide").getAttribute("data-slide-id")).toBe(
      "web-design-ui-platform-apis",
    );
  });

  it("enforces min-h-11 on every button and zero Korean leakage in English mode", () => {
    render(
      <MemoryRouter>
        <TechPresentationDeckSection locale="en" />
      </MemoryRouter>,
    );

    const panel = screen.getByTestId("tech-panel-presentation");
    fireEvent.click(screen.getByTestId("tech-deck-notes-toggle"));
    expect(panel.textContent).not.toMatch(KOREAN_RE);

    const buttons = panel.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(30);
    for (const btn of buttons) {
      expect(btn.className, btn.getAttribute("data-testid") ?? btn.textContent ?? "button").toContain("min-h-11");
    }
  });
});

describe("ToonStudioTechShowcasePage presentation tab integration", () => {
  beforeEach(() => {
    act(() => {
      useI18n.getState().setLang("ko");
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("opens presentation deck from Hero CTA, supports ?tab=presentation query, and keeps English mode Korean-free", () => {
    render(
      <MemoryRouter initialEntries={["/tech"]}>
        <ToonStudioTechShowcasePage />
      </MemoryRouter>,
    );

    // 기본 /tech 진입은 기존 계약대로 architecture 패널 표시
    expect(screen.getByTestId("tech-panel-architecture")).toBeTruthy();

    // 히어로 최우선 CTA 클릭 시 실전 발표 덱 탭으로 즉시 전환
    fireEvent.click(screen.getByTestId("tech-hero-open-deck"));
    expect(screen.getByTestId("tech-panel-presentation")).toBeTruthy();
    expect(screen.getByTestId("tech-deck-counter").textContent).toBe("01 / 16");

    // 영문 전환 시 한글 잔류 0건
    act(() => {
      useI18n.getState().setLang("en");
    });
    expect(screen.getByTestId("tech-showcase-page").textContent).not.toMatch(KOREAN_RE);

    cleanup();

    // 쿼리 파라미터 /tech?tab=presentation 직접 진입 지원
    render(
      <MemoryRouter initialEntries={["/tech?tab=presentation"]}>
        <ToonStudioTechShowcasePage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("tech-panel-presentation")).toBeTruthy();
  });
});
