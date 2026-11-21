// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CollaborationList } from "../../../../../packages/core/src/collaboration";

import { CollaborationBoardPage } from "./CollaborationBoardPage";
import {
  COLLABORATION_ADVANCED_SUITES,
  COLLABORATION_QUICK_MATCH_SCENARIOS,
  applyQuickMatchToSearchParams,
  clearCollaborationQuickMatchParams,
  hasActiveCollaborationFilters,
  resolveActiveQuickMatchScenario,
} from "./collaboration-quick-match";

const list = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<CollaborationList>>());

vi.mock("@/platform/collaboration-client", () => ({
  collaborationClient: { list, save: vi.fn(async () => undefined) },
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="collab-location">{location.pathname}{location.search}</output>;
}

function renderBoard(initialEntry = "/collaborate") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CollaborationBoardPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  list.mockReset();
  list.mockResolvedValue({ items: [], nextCursor: null, hasMore: false, canModerate: false });
});

afterEach(() => {
  cleanup();
});

describe("collaboration-quick-match pure model", () => {
  it("4가지 긴급 협업 시나리오가 정확한 필터·작성 템플릿·3줄 체크포인트를 제공한다", () => {
    expect(COLLABORATION_QUICK_MATCH_SCENARIOS).toHaveLength(4);

    expect(
      COLLABORATION_QUICK_MATCH_SCENARIOS.map((item) => ({
        titleKo: item.titleKo,
        type: item.filterType,
        role: item.filterRole,
        template: item.template,
        href: item.composeHref,
        checkpointCount: item.checkpoints.length,
      })),
    ).toEqual([
      {
        titleKo: "마감 임박 선화·채색 보조",
        type: "commission",
        role: "ink",
        template: "ink",
        href: "/collaborate/new?template=ink",
        checkpointCount: 3,
      },
      {
        titleKo: "3D·배경 컷 외주",
        type: "commission",
        role: "background",
        template: "background",
        href: "/collaborate/new?template=background",
        checkpointCount: 3,
      },
      {
        titleKo: "장기 연재 파트너 구함",
        type: "team",
        role: "story",
        template: "team",
        href: "/collaborate/new?template=team",
        checkpointCount: 3,
      },
      {
        titleKo: "내 포트폴리오·가능 일정 홍보",
        type: "available",
        role: "all",
        template: "ink",
        href: "/collaborate/new?template=ink",
        checkpointCount: 3,
      },
    ]);
  });

  it("시나리오 선택 시 type과 role을 동시 적용하고 cursor를 제거하며, 재선택 시 해제한다", () => {
    const [inkScenario, , , portfolioScenario] = COLLABORATION_QUICK_MATCH_SCENARIOS;
    expect(inkScenario).toBeDefined();
    expect(portfolioScenario).toBeDefined();
    if (!inkScenario || !portfolioScenario) return;

    const applied = applyQuickMatchToSearchParams(
      new URLSearchParams("cursor=next-page&q=판타지"),
      inkScenario,
    );
    expect(applied.get("cursor")).toBeNull();
    expect(applied.get("type")).toBe("commission");
    expect(applied.get("role")).toBe("ink");
    expect(applied.get("q")).toBe("판타지");
    expect(resolveActiveQuickMatchScenario(applied)?.id).toBe("deadline-ink-assist");
    expect(hasActiveCollaborationFilters(applied)).toBe(true);

    const toggledOff = applyQuickMatchToSearchParams(applied, inkScenario);
    expect(toggledOff.get("type")).toBeNull();
    expect(toggledOff.get("role")).toBeNull();
    expect(resolveActiveQuickMatchScenario(toggledOff)).toBeNull();

    const availableApplied = applyQuickMatchToSearchParams(applied, portfolioScenario);
    expect(availableApplied.get("type")).toBe("available");
    expect(availableApplied.get("role")).toBeNull();
    expect(resolveActiveQuickMatchScenario(availableApplied)?.id).toBe("portfolio-availability");

    const cleared = clearCollaborationQuickMatchParams(
      new URLSearchParams("view=saved&type=commission&role=ink&q=판타지"),
    );
    expect(cleared.toString()).toBe("view=saved");
  });
});

describe("CollaborationQuickMatchStrip + CollaborationBoardPage integration", () => {
  it("1탭으로 type+role 필터를 동시 적용하고 예시 공고 작성·초기화를 제공한다", async () => {
    renderBoard();

    const strip = screen.getByTestId("collaboration-quick-match-strip");
    expect(screen.queryByTestId("collaboration-quick-match-active-guide")).toBeNull();

    fireEvent.click(within(strip).getByRole("button", { name: /마감 임박 선화·채색 보조/u }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        { type: "commission", role: "ink" },
        expect.any(AbortSignal),
      ),
    );
    expect(screen.getByTestId("collab-location").textContent).toBe(
      "/collaborate?type=commission&role=ink",
    );

    const guide = screen.getByTestId("collaboration-quick-match-active-guide");
    expect(within(guide).getAllByRole("listitem")).toHaveLength(3);
    expect(
      screen.getByTestId("collaboration-quick-match-compose-cta").getAttribute("href"),
    ).toBe("/collaborate/new?template=ink");

    fireEvent.click(within(strip).getByRole("button", { name: /3D·배경 컷 외주/u }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        { type: "commission", role: "background" },
        expect.any(AbortSignal),
      ),
    );
    expect(
      screen.getByTestId("collaboration-quick-match-compose-cta").getAttribute("href"),
    ).toBe("/collaborate/new?template=background");

    fireEvent.click(within(strip).getByRole("button", { name: /장기 연재 파트너 구함/u }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        { type: "team", role: "story" },
        expect.any(AbortSignal),
      ),
    );
    expect(
      screen.getByTestId("collaboration-quick-match-compose-cta").getAttribute("href"),
    ).toBe("/collaborate/new?template=team");

    fireEvent.click(within(strip).getByRole("button", { name: /내 포트폴리오·가능 일정 홍보/u }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        { type: "available" },
        expect.any(AbortSignal),
      ),
    );

    fireEvent.click(screen.getByTestId("collaboration-quick-match-reset"));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({}, expect.any(AbortSignal)),
    );
    expect(screen.getByTestId("collab-location").textContent).toBe("/collaborate");
    expect(screen.queryByTestId("collaboration-quick-match-active-guide")).toBeNull();
  });

  it("하단 5개 고급 도구는 빠른 이동 네비게이션과 점진적 공개로 정리되며 필수 실시간 패널은 기본 노출을 유지한다", () => {
    renderBoard();

    expect(COLLABORATION_ADVANCED_SUITES).toHaveLength(5);
    const crewDetails = screen.getByTestId("collab-suite-disclosure-crew-planner") as HTMLDetailsElement;
    const quoteDetails = screen.getByTestId("collab-suite-disclosure-instant-quote") as HTMLDetailsElement;
    const huddleDetails = screen.getByTestId("collab-suite-disclosure-topic-huddle") as HTMLDetailsElement;
    const plazaDetails = screen.getByTestId("collab-suite-disclosure-recruitment-plaza") as HTMLDetailsElement;
    const rbacDetails = screen.getByTestId("collab-suite-disclosure-security-rbac") as HTMLDetailsElement;

    expect(crewDetails.open).toBe(false);
    expect(quoteDetails.open).toBe(false);
    expect(huddleDetails.open).toBe(false);
    expect(plazaDetails.open).toBe(true);
    expect(rbacDetails.open).toBe(true);

    expect(screen.getByRole("region", { name: "MMORPG 구인 광장 실시간 매칭" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "보안 역할별 롤 및 권한 관리 패널" })).toBeTruthy();

    fireEvent.click(screen.getByTestId("collab-suite-jump-instant-quote"));
    expect(quoteDetails.open).toBe(true);
  });

  it("신규 TSX/CSS 소스에 하드코딩 HEX·금지 모션·any가 0건이고 reduced-motion을 포함한다", () => {
    const dir = resolve(process.cwd(), "apps/web/src/domains/collaboration");
    const tsx = readFileSync(resolve(dir, "CollaborationQuickMatchStrip.tsx"), "utf8");
    const model = readFileSync(resolve(dir, "collaboration-quick-match.ts"), "utf8");
    const css = readFileSync(resolve(dir, "collaboration-quick-match.css"), "utf8");

    for (const source of [tsx, model, css]) {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(source).not.toMatch(/\b(?:transition-all|animate-bounce|animate-ping|animate-spin|animate-pulse)\b/u);
      expect(source).not.toMatch(/@ts-nocheck/u);
    }
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(tsx).toContain("min-h-11");
    expect(tsx).toContain("[word-break:keep-all]");
    expect(tsx).toContain("tabular-nums");
  });
});
