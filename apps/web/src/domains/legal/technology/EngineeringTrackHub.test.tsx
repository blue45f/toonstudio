// @vitest-environment jsdom
import { readFileSync } from "node:fs";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ArchitectureSectionStrip, type ArchitectureNavItem } from "./EngineeringArchitectureNav";
import { EngineeringPageFrame } from "./EngineeringStoryUi";
import { EngineeringTrackHub, EngineeringTrackSiblingBar } from "./EngineeringTrackHub";
import {
  ENGINEERING_HUB_TRACKS,
  ENGINEERING_QUICK_COURSES,
  ENGINEERING_READER_ROLES,
  HUB_TRACK_COVERED_PAGE_IDS,
  HUB_TRACK_TOTAL_PAGES,
  hubTrackForPageId,
  hubTrackForPath,
  hubTrackItemHref,
} from "./engineering-hub-tracks";
import { ENGINEERING_PAGES } from "./engineering-tech-pages";

import { useI18n } from "@/shared/lib/i18n-core";

const HANGUL = /[ㄱ-ㆎ가-힣]/u;

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
});

describe("4-트랙 기술 허브 데이터 계약", () => {
  it("13개 기술 페이지 전원을 중복·누락 없이 4개 트랙에 배정하고 트랙 1에 드로잉 비교와 경쟁 비교(/about/compare)를 연결한다", () => {
    expect(ENGINEERING_HUB_TRACKS.map((track) => [track.number, track.id])).toEqual([
      [1, "glance"],
      [2, "architecture-code"],
      [3, "seminar"],
      [4, "trust-reference"],
    ]);

    expect(HUB_TRACK_COVERED_PAGE_IDS).toHaveLength(HUB_TRACK_TOTAL_PAGES);
    expect(new Set(HUB_TRACK_COVERED_PAGE_IDS).size).toBe(ENGINEERING_PAGES.length);
    expect([...HUB_TRACK_COVERED_PAGE_IDS].sort()).toEqual(ENGINEERING_PAGES.map((page) => page.id).sort());

    const byTrack = new Map(
      ENGINEERING_HUB_TRACKS.map((track) => [track.id, track.items.map((item) => hubTrackItemHref(item))]),
    );
    expect(byTrack.get("glance")).toEqual([
      "/about/technology/story",
      "/about/technology/videos",
      "/about/technology/drawing-compare",
      "/about/compare",
    ]);
    expect(byTrack.get("architecture-code")).toEqual([
      "/about/technology/architecture",
      "/about/technology/atlas",
      "/about/technology/guides",
      "/about/technology/playbook",
    ]);
    expect(byTrack.get("seminar")).toEqual([
      "/about/technology/deck",
      "/about/technology/field-notes",
    ]);
    expect(byTrack.get("trust-reference")).toEqual([
      "/about/technology/libraries",
      "/about/technology/licenses",
      "/about/technology/glossary",
      "/about/technology/references",
    ]);

    for (const page of ENGINEERING_PAGES) {
      const track = hubTrackForPageId(page.id);
      expect(hubTrackForPath(page.href)?.id, page.id).toBe(track.id);
    }
    expect(hubTrackForPath("/about/compare")?.id).toBe("glance");
  });

  it("목적별 1클릭 읽기 코스는 3분·15분·30분 세 가지이며 영문 문구에 한글이 섞이지 않는다", () => {
    expect(ENGINEERING_QUICK_COURSES.map((course) => [course.id, course.minutes])).toEqual([
      ["quick-3m", 3],
      ["seminar-15m", 15],
      ["architecture-30m", 30],
    ]);

    for (const track of ENGINEERING_HUB_TRACKS) {
      for (const text of [track.label, track.summary, track.audience]) {
        expect(text.ko.trim()).toBeTruthy();
        expect(HANGUL.test(text.en), `${track.id}: ${text.en}`).toBe(false);
      }
      for (const item of track.items) {
        expect(HANGUL.test(item.roleSummary.en), item.roleSummary.en).toBe(false);
        if (item.kind === "companion") {
          expect(HANGUL.test(item.label.en), item.label.en).toBe(false);
          expect(HANGUL.test(item.badge.en), item.badge.en).toBe(false);
        }
      }
    }

    for (const course of ENGINEERING_QUICK_COURSES) {
      for (const text of [course.durationBadge, course.title, course.audience, course.summary, course.scopeNote, course.primaryLabel]) {
        expect(HANGUL.test(text.en), `${course.id}: ${text.en}`).toBe(false);
      }
      for (const link of course.companionLinks) {
        expect(HANGUL.test(link.label.en), link.label.en).toBe(false);
      }
    }

    for (const role of ENGINEERING_READER_ROLES) {
      expect(HANGUL.test(role.label.en), role.label.en).toBe(false);
      expect(HANGUL.test(role.question.en), role.question.en).toBe(false);
      for (const link of role.quickLinks) {
        expect(HANGUL.test(link.label.en), link.label.en).toBe(false);
      }
    }
  });

  it("4-트랙 허브 데이터는 대형 콘텐츠 모듈(도감·스토리·덱 모델·용어집)을 정적으로 끌어오지 않는다", () => {
    const source = readFileSync("apps/web/src/domains/legal/technology/engineering-hub-tracks.ts", "utf8");
    const imports = Array.from(source.matchAll(/from "(\.[^"]+)"/gu), (match) => match[1]);
    for (const specifier of imports) {
      expect(specifier, String(specifier)).toMatch(/engineering-(deck-state|story-content|tech-pages)$/u);
    }
  });
});

describe("EngineeringTrackHub UI 및 역할별 빠른 점프", () => {
  it("3분 파악 · 15분 세미나 · 30분 아키텍처 심화 코스와 4개 트랙을 44px 이상 터치 영역으로 표시한다", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/about/technology"]}>
        <EngineeringTrackHub />
      </MemoryRouter>,
    );

    expect(screen.getByText("3분 파악")).toBeTruthy();
    expect(screen.getByText("15분 세미나")).toBeTruthy();
    expect(screen.getByText("30분 아키텍처 심화")).toBeTruthy();

    const tracksList = screen.getByRole("list", { name: "4개 기술 트랙" });
    expect(within(tracksList).getAllByRole("heading", { level: 3 }).map((el) => el.textContent)).toEqual([
      "한눈에 보기",
      "아키텍처 & 실무 코드",
      "기술 세미나 발표",
      "신뢰·라이브러리·용어",
    ]);

    const compareLink = within(tracksList).getByRole("link", { name: /경쟁 비교/u });
    expect(compareLink.getAttribute("href")).toBe("/about/compare");

    const interactiveElements = container.querySelectorAll("a[href], button");
    expect(interactiveElements.length).toBeGreaterThan(15);
    for (const element of interactiveElements) {
      expect(element.className, element.textContent ?? "").toContain("min-h-11");
    }
  });

  it("역할 버튼을 누르면 추천 바로가기 바와 해당 코스·트랙이 강조된다", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/about/technology"]}>
        <EngineeringTrackHub />
      </MemoryRouter>,
    );

    const engineerButton = screen.getByRole("button", { name: "실무 개발자" });
    fireEvent.click(engineerButton);
    expect(engineerButton.getAttribute("aria-pressed")).toBe("true");

    const recommended = screen.getByRole("region", { name: "선택한 역할 추천 바로가기" });
    expect(within(recommended).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/about/technology/architecture",
      "/about/technology/guides#blueprints",
      "/about/technology/atlas",
    ]);
    expect(container.querySelector('[data-quick-course="architecture-30m"]')?.getAttribute("data-highlighted")).toBe("true");
    expect(container.querySelector('[data-hub-track="architecture-code"]')?.getAttribute("data-highlighted")).toBe("true");

    // 같은 역할을 다시 누르면 전체 역할 상태로 돌아간다.
    fireEvent.click(engineerButton);
    expect(engineerButton.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("region", { name: "선택한 역할 추천 바로가기" })).toBeNull();
  });

  it("영어 로케일에서는 4-트랙 허브와 트랙 전환 바에 한글이 섞이지 않는다", () => {
    useI18n.getState().setLang("en");
    const { container } = render(
      <MemoryRouter initialEntries={["/about/technology"]}>
        <EngineeringTrackHub />
        <EngineeringTrackSiblingBar currentId="architecture" />
      </MemoryRouter>,
    );
    expect(HANGUL.test(container.textContent ?? "")).toBe(false);
  });
});

describe("하위 페이지 4-트랙 목차·전환 바 및 구간 이동 키보드 탐색", () => {
  it("EngineeringPageFrame 은 4-트랙 빠른 전환 바와 4-트랙 목차를 제공하고 자기 자신 중복 링크를 만들지 않는다", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/about/technology/guides"]}>
        <EngineeringPageFrame pageId="guides">
          <p>본문</p>
        </EngineeringPageFrame>
      </MemoryRouter>,
    );

    const trackBar = screen.getByRole("navigation", { name: "현재 트랙 빠른 이동" });
    expect(trackBar.textContent).toContain("트랙 2 · 아키텍처 & 실무 코드");
    const barHrefs = within(trackBar).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(barHrefs).toEqual([
      "/about/technology/architecture",
      "/about/technology/atlas",
      "/about/technology/playbook",
      "/about/technology",
    ]);
    // 현재 페이지(guides)는 메뉴 목차 안에만 1개 링크로 존재한다.
    expect(container.querySelectorAll('a[href="/about/technology/guides"]')).toHaveLength(1);
  });

  it("ArchitectureSectionStrip 은 현재 구간 진행도와 방향키·Home·End 탐색을 지원한다", () => {
    const items: readonly ArchitectureNavItem[] = [
      { id: "sec-1", number: 1, title: "첫 구간", groupId: "g1" },
      { id: "sec-2", number: 2, title: "둘째 구간", groupId: "g1" },
      { id: "sec-3", number: 3, title: "셋째 구간", groupId: "g2" },
    ];
    render(
      <MemoryRouter initialEntries={["/about/technology/architecture"]}>
        <div id="test-arch-body">
          <ArchitectureSectionStrip items={items} bodyId="test-arch-body" />
        </div>
      </MemoryRouter>,
    );

    const strip = screen.getByRole("navigation", { name: "구간 이동" });
    expect(within(strip).getByText("1/3")).toBeTruthy();

    const links = within(strip).getAllByRole("link");
    links[0]?.focus();
    fireEvent.keyDown(links[0] as HTMLElement, { key: "ArrowRight" });
    expect(document.activeElement).toBe(links[1]);
    fireEvent.keyDown(links[1] as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(links[2]);
    fireEvent.keyDown(links[2] as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(links[0]);
    fireEvent.keyDown(links[0] as HTMLElement, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(links[2]);
  });
});
