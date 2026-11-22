// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioEpisodeStoryPage } from "../planning/StudioEpisodeStoryPage";
import type { EpisodePlanWithSynopsis } from "../planning/studio-episode-synopsis";
import { createInitialStudioProjectPlanning } from "../planning/studio-planning-store";
import {
  buildGenreSkeletonSvgPreview,
  deriveEpisodePlanTurningPoints,
  formatGenreSkeletonTextConti,
  GENRE_SKELETON_IDS,
  generateGenreScrollSkeleton,
  loadGenreSkeletonSettings,
  normalizeGenreSkeletonId,
  saveGenreSkeletonSettings,
  updateGenreSkeletonCut,
} from "./genre-skeleton-engine";
import { StudioGenreSkeletonPanel } from "./StudioGenreSkeletonPanel";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("genre-skeleton-engine — 장르별 60컷 세로 스크롤 자동 골격 엔진", () => {
  it("액션·로맨스·스릴러·일상 4대 장르 모두 60컷 골격을 1초 내 생성하고 기승전결 합이 일치한다", () => {
    for (const genre of GENRE_SKELETON_IDS) {
      const plan = generateGenreScrollSkeleton({
        genre,
        targetCutCount: 60,
        canvasWidthPx: 800,
        episodeNumber: 5,
      });

      expect(plan.cutCount).toBe(60);
      expect(plan.cuts).toHaveLength(60);
      expect(plan.generatedInMs).toBeLessThan(1000);
      expect(plan.acts).toHaveLength(4);
      expect(plan.acts.reduce((sum, act) => sum + act.cutCount, 0)).toBe(60);
      expect(plan.climaxCutIndices.length).toBeGreaterThanOrEqual(1);
      expect(plan.cuts[0]?.role).toBe("opening-hook");
      expect(plan.cuts[59]?.role).toBe("cliffhanger");
      expect(plan.cuts[59]?.gutterAfterPx).toBe(0);

      // 모든 말풍선 안전영역 박스가 컷 가로 안전여백 내에 위치해야 한다.
      for (const cut of plan.cuts) {
        expect(cut.speechBubbleZones.length).toBeGreaterThanOrEqual(1);
        for (const zone of cut.speechBubbleZones) {
          expect(zone.xPx).toBeGreaterThanOrEqual(cut.safeMarginsPx.left);
          expect(zone.xPx + zone.widthPx).toBeLessThanOrEqual(
            plan.canvasWidthPx - cut.safeMarginsPx.right + 1,
          );
          expect(zone.yPx).toBeGreaterThanOrEqual(cut.safeMarginsPx.top);
        }
      }
    }
  });

  it("장르별 호흡 특성(스릴러 롱 여백 > 액션 타이트 여백, 로맨스 평균 컷 높이 > 액션)을 반영한다", () => {
    const action = generateGenreScrollSkeleton({ genre: "action", targetCutCount: 60 });
    const romance = generateGenreScrollSkeleton({ genre: "romance", targetCutCount: 60 });
    const thriller = generateGenreScrollSkeleton({ genre: "thriller", targetCutCount: 60 });

    expect(thriller.metrics.avgGutterPx).toBeGreaterThan(action.metrics.avgGutterPx);
    expect(romance.metrics.avgCutHeightPx).toBeGreaterThan(action.metrics.avgCutHeightPx);
  });

  it("컷 수 경계 클램핑(12~100컷), 개별 컷 높이 수정 시 누적 Y 재계산, 콘티/SVG/로컬 저장이 동작한다", () => {
    const minPlan = generateGenreScrollSkeleton({ genre: "slice-of-life", targetCutCount: 3 });
    const maxPlan = generateGenreScrollSkeleton({ genre: "action", targetCutCount: 250 });
    expect(minPlan.cutCount).toBe(12);
    expect(maxPlan.cutCount).toBe(100);

    const updated = updateGenreSkeletonCut(minPlan, 1, { heightPx: 1800, gutterAfterPx: 200 });
    expect(updated.cuts[0]?.heightPx).toBe(1800);
    expect(updated.cuts[1]?.yPx).toBe(2000);

    const contiText = formatGenreSkeletonTextConti(updated);
    expect(contiText).toContain("일상 12컷 세로 스크롤 골격");
    expect(contiText).toContain("말풍선:");

    const svg = buildGenreSkeletonSvgPreview(updated, 12);
    expect(svg).toContain("<svg");
    expect(svg).toContain("oklch(");

    const turningPoints = deriveEpisodePlanTurningPoints(updated);
    expect(turningPoints).toHaveLength(4);

    expect(normalizeGenreSkeletonId("로판/로맨스")).toBe("romance");
    expect(normalizeGenreSkeletonId("미스터리 스릴러")).toBe("thriller");
    expect(normalizeGenreSkeletonId("힐링 일상")).toBe("slice-of-life");

    expect(
      saveGenreSkeletonSettings(window.localStorage, "proj-gs-1", {
        genre: "thriller",
        targetCutCount: 80,
        canvasWidthPx: 1080,
        includeCliffhanger: false,
      }),
    ).toBe(true);
    expect(loadGenreSkeletonSettings(window.localStorage, "proj-gs-1")).toEqual({
      genre: "thriller",
      targetCutCount: 80,
      canvasWidthPx: 1080,
      includeCliffhanger: false,
    });
  });
});

describe("StudioGenreSkeletonPanel 및 StudioEpisodeStoryPage 지연 연결", () => {
  it("StudioEpisodeStoryPage에서 지연 마운트되어 장르·컷 수 변경 및 회차 전환점 반영이 동작한다", async () => {
    const planning = createInitialStudioProjectPlanning("proj-gs-story");
    const onSavePlan = vi.fn<(plan: EpisodePlanWithSynopsis) => boolean>(() => true);

    render(
      <MemoryRouter>
        <StudioEpisodeStoryPage
          season={planning.season}
          plans={planning.plans}
          genre="액션"
          onSavePlan={onSavePlan}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("genre-skeleton-pro-panel")).toBeNull();
    fireEvent.click(screen.getByTestId("episode-story-genre-skeleton-toggle"));

    const panel = await screen.findByTestId("genre-skeleton-pro-panel");
    expect(within(panel).getByTestId("genre-skeleton-cut-count-value").textContent).toBe("60컷");

    // 스릴러 80컷으로 전환
    fireEvent.click(within(panel).getByTestId("genre-skeleton-preset-thriller"));
    fireEvent.click(within(panel).getByTestId("genre-skeleton-cuts-80"));
    expect(within(panel).getByTestId("genre-skeleton-cut-count-value").textContent).toBe("80컷");
    expect(within(panel).getByTestId("genre-skeleton-cut-list").children.length).toBe(80);

    // 회차 줄거리·전환점에 반영
    fireEvent.click(within(panel).getByTestId("genre-skeleton-apply-episode-btn"));
    expect(onSavePlan).toHaveBeenCalledTimes(1);
    const saved = onSavePlan.mock.calls[0]?.[0];
    expect(saved?.turningPoints).toHaveLength(4);
    expect(saved?.synopsis).toContain("스릴러 80컷");
  });

  it("단독 렌더에서도 44px 이상 터치 타겟 규격과 텍스트 콘티 복사 상태 피드백을 제공한다", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<StudioGenreSkeletonPanel projectId="proj-gs-standalone" initialGenre="romance" />);

    const copyBtn = screen.getByTestId("genre-skeleton-copy-conti-btn");
    expect(copyBtn.className).toContain("min-h-11");
    fireEvent.click(copyBtn);

    const status = await screen.findByTestId("genre-skeleton-status");
    expect(status.textContent).toContain("60컷 텍스트 콘티");
    expect(writeText).toHaveBeenCalledTimes(1);
  });
});
