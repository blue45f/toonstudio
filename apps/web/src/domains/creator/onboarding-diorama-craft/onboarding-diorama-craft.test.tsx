// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CREATOR_DEVICE_OPTIONS,
  CREATOR_GENRE_OPTIONS,
  CREATOR_GOAL_OPTIONS,
  CREATOR_MEDIUM_OPTIONS,
  DEFAULT_CREATOR_MATCHER_ANSWERS,
  FIRST_CUT_SPRINT_STEPS,
  ONBOARDING_DIORAMA_CHAPTERS,
  StudioOnboardingDioramaPanel,
  collectAllOnboardingAtelierAssetPaths,
  computeDioramaParallax,
  countFirstCutDialogueGraphemes,
  createInitialDioramaState,
  createInitialFirstCutSprint,
  getDioramaChapterById,
  matchCreatorStarterPrescription,
  normalizePointerInRect,
  recordFirstCutAction,
  summarizeFirstCutSprint,
  transitionDioramaChapter,
  type CreatorDeviceChoice,
  type CreatorGenreChoice,
  type CreatorGoalChoice,
  type CreatorMediumChoice,
} from "./index";

afterEach(cleanup);

const REPO_PUBLIC_DIR = path.resolve(import.meta.dirname, "../../../../public");

describe("1. 4장 온보딩 디오라마 카탈로그 · 실존 WebP 자산 디스크 검증", () => {
  it("4장 챕터가 요구된 사전 베이크 아틀리에 WebP와 주얼 자산을 정확히 매핑한다", () => {
    expect(ONBOARDING_DIORAMA_CHAPTERS).toHaveLength(4);
    expect(
      ONBOARDING_DIORAMA_CHAPTERS.map((ch) => ({
        id: ch.id,
        chapterNumber: ch.chapterNumber,
        diorama: ch.dioramaImageSrc,
        jewel: ch.jewelImageSrc,
      })),
    ).toEqual([
      {
        id: "first-cut-desk",
        chapterNumber: 1,
        diorama: "/assets/atelier/onboarding/first-cut-desk.webp",
        jewel: "/assets/atelier/jewels/jewel-drawing-nib.webp",
      },
      {
        id: "character-sculpt",
        chapterNumber: 2,
        diorama: "/assets/atelier/onboarding/character-sculpt.webp",
        jewel: "/assets/atelier/jewels/jewel-character-bust.webp",
      },
      {
        id: "virtual-collab",
        chapterNumber: 3,
        diorama: "/assets/atelier/onboarding/virtual-collab.webp",
        jewel: "/assets/atelier/jewels/jewel-studio-cube.webp",
      },
      {
        id: "episode-publish",
        chapterNumber: 4,
        diorama: "/assets/atelier/onboarding/episode-publish.webp",
        jewel: "/assets/atelier/jewels/jewel-reels-slate.webp",
      },
    ]);
  });

  it("엔진이 참조하는 모든 /assets/atelier/**/*.webp 파일이 실제 디스크(apps/web/public)에 비어 있지 않은 파일로 존재한다", () => {
    const assetPaths = collectAllOnboardingAtelierAssetPaths();
    expect(assetPaths.length).toBeGreaterThanOrEqual(22);

    const hasFullAtelierCheckout = existsSync(path.join(REPO_PUBLIC_DIR, "assets/atelier"));
    for (const webPath of assetPaths) {
      expect(webPath.startsWith("/assets/atelier/")).toBe(true);
      expect(webPath.endsWith(".webp")).toBe(true);
      if (hasFullAtelierCheckout) {
        const diskPath = path.join(REPO_PUBLIC_DIR, webPath.slice(1));
        expect(existsSync(diskPath), `Missing WebP on disk: ${diskPath}`).toBe(true);
        expect(statSync(diskPath).size).toBeGreaterThan(1024);
      }
    }

    // 엔진 소스 내 하드코딩된 모든 /assets/atelier/*.webp 문자열까지 전수 대조
    const engineSrc = readFileSync(
      path.join(import.meta.dirname, "onboarding-diorama-engine.ts"),
      "utf8",
    );
    const literalMatches = engineSrc.match(/\/assets\/atelier\/[a-z0-9/-]+\.webp/gu) ?? [];
    expect(literalMatches.length).toBeGreaterThanOrEqual(22);
    if (hasFullAtelierCheckout) {
      for (const match of new Set(literalMatches)) {
        const diskPath = path.join(REPO_PUBLIC_DIR, match.slice(1));
        expect(existsSync(diskPath), `Broken literal asset path: ${match}`).toBe(true);
      }
    }
  });

  it("4장 디오라마 상태기계가 select·next·prev·wrap·visited·완료율을 정확히 전이한다", () => {
    let state = createInitialDioramaState();
    expect(state.activeChapterId).toBe("first-cut-desk");
    expect(state.activeIndex).toBe(0);
    expect(state.visitedChapterIds).toEqual(["first-cut-desk"]);
    expect(state.completedAllChapters).toBe(false);
    expect(state.completionRatio).toBe(0.25);

    state = transitionDioramaChapter(state, { type: "next" });
    expect(state.activeChapterId).toBe("character-sculpt");
    expect(state.transitionCount).toBe(1);

    state = transitionDioramaChapter(state, { type: "next" });
    state = transitionDioramaChapter(state, { type: "next" });
    expect(state.activeChapterId).toBe("episode-publish");
    expect(state.visitedChapterIds).toHaveLength(4);
    expect(state.completedAllChapters).toBe(true);
    expect(state.completionRatio).toBe(1);

    // wrap=true 순환 확인
    state = transitionDioramaChapter(state, { type: "next", wrap: true });
    expect(state.activeChapterId).toBe("first-cut-desk");
    state = transitionDioramaChapter(state, { type: "prev", wrap: true });
    expect(state.activeChapterId).toBe("episode-publish");

    // wrap=false 경계 정지 확인
    const clamped = transitionDioramaChapter(state, { type: "next", wrap: false });
    expect(clamped.activeChapterId).toBe("episode-publish");
  });

  it("핫스팟 선택·자동재생 토글·초기화가 현재 챕터 범위 내에서 안전하게 동작한다", () => {
    let state = createInitialDioramaState("character-sculpt");
    expect(state.selectedHotspotId).toBe("sculpt-bust");

    state = transitionDioramaChapter(state, {
      type: "select-hotspot",
      hotspotId: "sculpt-swatch",
    });
    expect(state.selectedHotspotId).toBe("sculpt-swatch");

    state = transitionDioramaChapter(state, {
      type: "select-hotspot",
      hotspotId: "non-existent-hotspot",
    });
    expect(state.selectedHotspotId).toBeNull();

    state = transitionDioramaChapter(state, { type: "toggle-autoplay" });
    expect(state.autoPlayEnabled).toBe(true);

    const reset = transitionDioramaChapter(state, { type: "reset" });
    expect(reset.activeChapterId).toBe("first-cut-desk");
    expect(reset.visitedChapterIds).toEqual(["first-cut-desk"]);
    expect(reset.autoPlayEnabled).toBe(false);
  });
});

describe("2. 2.5D 포인터 틸트 패럴랙스 솔버 (computeDioramaParallax)", () => {
  it("활성 포인터 좌표에 따라 틸트 각도와 배경(반대방향)·중경·전경·주얼 깊이 오프셋을 분리 산출한다", () => {
    const chapter = getDioramaChapterById("first-cut-desk");
    const solved = computeDioramaParallax({
      normalizedX: 0.8,
      normalizedY: -0.5,
      prefersReducedMotion: false,
      depthProfile: chapter.depthProfile,
    });

    expect(solved.reducedMotionApplied).toBe(false);
    expect(solved.rotateYDeg).toBeGreaterThan(0);
    expect(solved.rotateXDeg).toBeGreaterThan(0);
    expect(solved.background.translateXPx).toBeLessThan(0);
    expect(solved.midground.translateXPx).toBeGreaterThan(0);
    expect(solved.foreground.translateXPx).toBeGreaterThan(solved.midground.translateXPx);
    expect(solved.jewel.translateXPx).toBeGreaterThan(solved.foreground.translateXPx);
    expect(solved.stageTransformCss).toContain("perspective(960px)");
    expect(solved.jewelTransformCss).toContain("translate3d(");
  });

  it("prefersReducedMotion=true일 때 극단적 좌표에서도 모든 각도와 깊이 오프셋을 0deg / 0px로 완전 고정한다", () => {
    const locked = computeDioramaParallax({
      normalizedX: 1,
      normalizedY: -1,
      prefersReducedMotion: true,
    });

    expect(locked.reducedMotionApplied).toBe(true);
    expect(Object.is(locked.rotateXDeg, 0)).toBe(true);
    expect(Object.is(locked.rotateYDeg, 0)).toBe(true);
    expect(locked.background.translateXPx).toBe(0);
    expect(locked.background.translateYPx).toBe(0);
    expect(locked.midground.translateXPx).toBe(0);
    expect(locked.midground.translateYPx).toBe(0);
    expect(locked.foreground.translateXPx).toBe(0);
    expect(locked.foreground.translateYPx).toBe(0);
    expect(locked.jewel.translateXPx).toBe(0);
    expect(locked.jewel.translateYPx).toBe(0);
    expect(locked.stageTransformCss).toBe("perspective(960px) rotateX(0deg) rotateY(0deg)");
    expect(locked.backgroundTransformCss).toBe("translate3d(0px, 0px, 0px) scale(1)");
    expect(locked.midgroundTransformCss).toBe("translate3d(0px, 0px, 0px) scale(1)");
    expect(locked.foregroundTransformCss).toBe("translate3d(0px, 0px, 0px) scale(1)");
    expect(locked.jewelTransformCss).toBe("translate3d(0px, 0px, 0px) scale(1)");
    expect(locked.specularShiftPct).toEqual({ x: 50, y: 50 });
  });

  it("범위 초과·NaN·Infinity 입력과 0크기 뷰포트 사각형을 안전하게 클램프한다", () => {
    const clamped = computeDioramaParallax({
      normalizedX: 99,
      normalizedY: -42,
      prefersReducedMotion: false,
    });
    expect(clamped.clampedX).toBe(1);
    expect(clamped.clampedY).toBe(-1);

    const nanSafe = computeDioramaParallax({
      normalizedX: Number.NaN,
      normalizedY: Number.POSITIVE_INFINITY,
      prefersReducedMotion: false,
    });
    expect(nanSafe.clampedX).toBe(0);
    expect(nanSafe.clampedY).toBe(0);
    expect(Object.is(nanSafe.rotateXDeg, 0)).toBe(true);

    expect(
      normalizePointerInRect(160, 90, { left: 0, top: 0, width: 320, height: 180 }),
    ).toEqual({ normalizedX: 0, normalizedY: 0 });
    expect(
      normalizePointerInRect(500, -40, { left: 0, top: 0, width: 320, height: 180 }),
    ).toEqual({ normalizedX: 1, normalizedY: -1 });
    expect(
      normalizePointerInRect(50, 50, { left: 0, top: 0, width: 0, height: 0 }),
    ).toEqual({ normalizedX: 0, normalizedY: 0 });
  });
});

describe("3. 60초 첫 컷 체험 시뮬레이터", () => {
  it("4단계 × 15초 합성 예산으로 체크하며 실제 OPFS 저장 완료로 기록하지 않는다", () => {
    expect(FIRST_CUT_SPRINT_STEPS).toHaveLength(4);
    expect(FIRST_CUT_SPRINT_STEPS.reduce((acc, s) => acc + s.durationSec, 0)).toBe(60);

    let sprint = createInitialFirstCutSprint();
    expect(sprint.status).toBe("idle");
    expect(sprint.remainingSec).toBe(60);

    sprint = recordFirstCutAction(sprint, { type: "start" });
    expect(sprint.status).toBe("running");

    sprint = recordFirstCutAction(sprint, { type: "add-stroke", count: 4 });
    sprint = recordFirstCutAction(sprint, { type: "set-canvas-preset", preset: "page-3-4" });
    sprint = recordFirstCutAction(sprint, { type: "set-balloon", text: "첫 화 오프닝 대사!" });
    expect(sprint.strokeCount).toBe(4);
    expect(sprint.canvasPreset).toBe("page-3-4");
    expect(sprint.balloonDraftKo).toBe("첫 화 오프닝 대사!");

    for (const step of FIRST_CUT_SPRINT_STEPS) {
      sprint = recordFirstCutAction(sprint, { type: "complete-step", stepId: step.id, spentSec: 12 });
    }

    expect(sprint.status).toBe("completed");
    expect(sprint.progressPercent).toBe(100);
    expect(sprint.elapsedSec).toBe(48);
    expect(sprint.remainingSec).toBe(12);
    expect(sprint.savedToLocalDraft).toBe(false);

    const summary = summarizeFirstCutSprint(sprint);
    expect(summary.completed).toBe(true);
    expect(summary.scope).toBe("example-only");
    expect(summary.timeBasis).toBe("synthetic-budget");
    expect(summary.savedToLocalDraft).toBe(false);
    expect(summary.summaryKo).toContain("실제 원고 미저장");
    expect(summary.completedCount).toBe(4);
    expect(summary.summaryKo).toContain("48초");
    expect(summary.summaryEn).toContain("48s");
  });

  it("tick 경과 클램프, 원스톱 완료(complete-all-instant), 초기화(reset)가 일관되게 동작한다", () => {
    let sprint = createInitialFirstCutSprint();
    sprint = recordFirstCutAction(sprint, { type: "tick", deltaSec: 25 });
    expect(sprint.elapsedSec).toBe(25);
    expect(sprint.remainingSec).toBe(35);
    expect(sprint.status).toBe("running");

    sprint = recordFirstCutAction(sprint, { type: "complete-all-instant" });
    expect(sprint.status).toBe("completed");
    expect(sprint.progressPercent).toBe(100);
    expect(sprint.savedToLocalDraft).toBe(false);

    sprint = recordFirstCutAction(sprint, { type: "reset" });
    expect(sprint.status).toBe("idle");
    expect(sprint.elapsedSec).toBe(0);
    expect(sprint.completedStepIds).toEqual([]);
    expect(sprint.savedToLocalDraft).toBe(false);
  });

  it("60자를 넘는 대사와 이모지·결합문자는 원문 그대로 유지하며 단계 초기화도 대사와 비율을 보존한다", () => {
    const dialogue = `${"가".repeat(59)}😀👨‍👩‍👧‍👦e\u0301${"뒤".repeat(30)}`;
    let sprint = recordFirstCutAction(createInitialFirstCutSprint(), { type: "set-balloon", text: dialogue });
    sprint = recordFirstCutAction(sprint, { type: "set-canvas-preset", preset: "square-1-1" });
    sprint = recordFirstCutAction(sprint, { type: "complete-all-instant" });
    expect(sprint.balloonDraftKo).toBe(dialogue);
    expect(countFirstCutDialogueGraphemes(dialogue)).toBe(92);
    const reset = recordFirstCutAction(sprint, { type: "reset" });
    expect(reset.balloonDraftKo).toBe(dialogue);
    expect(reset.canvasPreset).toBe("square-1-1");
    expect(reset.completedStepIds).toEqual([]);
    expect(reset.savedToLocalDraft).toBe(false);
  });
});

describe("4. 창작자 성향 4문항 맞춤 스타터 매처 (matchCreatorStarterPrescription)", () => {
  it("4개 질문의 모든 선택지 조합이 깨지지 않는 실존 WebP 브러시·종이·배경·공방과 유효 경로를 반환한다", () => {
    expect(CREATOR_GENRE_OPTIONS).toHaveLength(4);
    expect(CREATOR_GOAL_OPTIONS).toHaveLength(4);
    expect(CREATOR_DEVICE_OPTIONS).toHaveLength(4);
    expect(CREATOR_MEDIUM_OPTIONS).toHaveLength(6);

    const validDiskAssets = new Set(collectAllOnboardingAtelierAssetPaths());
    const genres: readonly CreatorGenreChoice[] = [
      "romance-campus",
      "fantasy-action",
      "urban-thriller",
      "slice-of-life",
    ];
    const goals: readonly CreatorGoalChoice[] = [
      "first-webtoon-episode",
      "character-turnaround",
      "team-collab-workflow",
      "motion-reels-publish",
    ];
    const devices: readonly CreatorDeviceChoice[] = [
      "desktop-pen-tablet",
      "ipad-stylus",
      "laptop-mouse-trackpad",
      "mobile-thumb",
    ];
    const mediums: readonly CreatorMediumChoice[] = [
      "gpen-ink",
      "watercolor-sable",
      "oil-impasto",
      "graphite-pencil",
      "alcohol-marker",
      "charcoal-pastel",
    ];

    for (const genre of genres) {
      for (const goal of goals) {
        const device = devices[genres.indexOf(genre) % devices.length]!;
        const medium = mediums[(genres.indexOf(genre) + goals.indexOf(goal)) % mediums.length]!;
        const rx = matchCreatorStarterPrescription({ genre, goal, device, medium });
        expect(validDiskAssets.has(rx.brush.imageSrc)).toBe(true);
        expect(validDiskAssets.has(rx.paper.imageSrc)).toBe(true);
        expect(validDiskAssets.has(rx.background.imageSrc)).toBe(true);
        expect(validDiskAssets.has(rx.space.imageSrc)).toBe(true);
        expect(rx.paper.imageSrc.startsWith("/assets/atelier/papers/")).toBe(true);
        expect(rx.background.imageSrc.startsWith("/assets/atelier/backgrounds/")).toBe(true);
        expect(rx.workspaceRoute.path.startsWith("/studio")).toBe(true);
        expect(rx.fitScorePct).toBeGreaterThanOrEqual(86);
        expect(rx.fitScorePct).toBeLessThanOrEqual(98);
      }
    }
  });

  it("목표별 추천 작업실 경로·추천 챕터와 기기별 선 안정화 튜닝이 정확히 분기된다", () => {
    const charRx = matchCreatorStarterPrescription({
      genre: "fantasy-action",
      goal: "character-turnaround",
      device: "ipad-stylus",
      medium: "oil-impasto",
    });
    expect(charRx.workspaceRoute.path).toBe("/studio/assets/characters/new");
    expect(charRx.recommendedChapterId).toBe("character-sculpt");
    expect(charRx.paper.imageSrc).toBe("/assets/atelier/papers/linen-canvas.webp");
    expect(charRx.background.imageSrc).toBe("/assets/atelier/backgrounds/bg-fantasy-courtyard.webp");

    const collabRx = matchCreatorStarterPrescription({
      genre: "urban-thriller",
      goal: "team-collab-workflow",
      device: "desktop-pen-tablet",
      medium: "charcoal-pastel",
    });
    expect(collabRx.workspaceRoute.path).toBe("/studio/space");
    expect(collabRx.recommendedChapterId).toBe("virtual-collab");
    expect(collabRx.background.imageSrc).toBe("/assets/atelier/backgrounds/bg-seoul-crosswalk.webp");

    const reelsRx = matchCreatorStarterPrescription({
      genre: "slice-of-life",
      goal: "motion-reels-publish",
      device: "mobile-thumb",
      medium: "watercolor-sable",
    });
    expect(reelsRx.workspaceRoute.path).toBe("/studio/motion-webtoon");
    expect(reelsRx.recommendedChapterId).toBe("episode-publish");
    expect(reelsRx.paper.imageSrc).toBe("/assets/atelier/papers/cold-press-watercolor.webp");
    expect(reelsRx.background.imageSrc).toBe("/assets/atelier/backgrounds/bg-rainy-bookstore.webp");

    const mouseRx = matchCreatorStarterPrescription({
      ...DEFAULT_CREATOR_MATCHER_ANSWERS,
      device: "laptop-mouse-trackpad",
    });
    expect(mouseRx.brush.stabilizationPct).toBe(78);
    expect(mouseRx.workspaceRoute.queryParams.lane).toBe("storyboard");

    const penRx = matchCreatorStarterPrescription({
      ...DEFAULT_CREATOR_MATCHER_ANSWERS,
      device: "desktop-pen-tablet",
    });
    expect(penRx.brush.stabilizationPct).toBe(38);
    expect(penRx.workspaceRoute.queryParams.lane).toBe("blank");
  });
});

describe("5. StudioOnboardingDioramaPanel 통합 UI · 인터랙션 · 접근성 검증", () => {
  it("Props 없이 <StudioOnboardingDioramaPanel /> 단독 렌더링되며 모든 실존 WebP <img>를 화면에 표시한다", () => {
    render(<StudioOnboardingDioramaPanel />);
    expect(screen.getByTestId("onboarding-diorama-panel")).toBeTruthy();

    const heroImg = screen.getByTestId("diorama-hero-img") as HTMLImageElement;
    const jewelImg = screen.getByTestId("diorama-jewel-img") as HTMLImageElement;
    const bgPaperImg = screen.getByTestId("diorama-bg-paper-img") as HTMLImageElement;
    const brushImg = screen.getByTestId("prescription-brush-img") as HTMLImageElement;
    const paperImg = screen.getByTestId("prescription-paper-img") as HTMLImageElement;
    const backdropImg = screen.getByTestId("prescription-background-img") as HTMLImageElement;
    const spaceImg = screen.getByTestId("prescription-space-img") as HTMLImageElement;

    expect(heroImg.getAttribute("src")).toBe("/assets/atelier/onboarding/first-cut-desk.webp");
    expect(jewelImg.getAttribute("src")).toBe("/assets/atelier/jewels/jewel-drawing-nib.webp");
    expect(bgPaperImg.getAttribute("src")).toBe("/assets/atelier/papers/manga-kent.webp");
    expect(brushImg.getAttribute("src")).toBe("/assets/atelier/media/gpen-ink.webp");
    expect(paperImg.getAttribute("src")).toBe("/assets/atelier/papers/manga-kent.webp");
    expect(backdropImg.getAttribute("src")).toBe("/assets/atelier/backgrounds/bg-school-hallway.webp");
    expect(spaceImg.getAttribute("src")).toBe("/assets/atelier/spaces/rooftop-terrace.webp");
  });

  it("4장 챕터 탭과 이전/다음 버튼으로 전환하면 디오라마·주얼 WebP, 핫스팟, 탐색 카운트와 콜백이 갱신된다", () => {
    const onChapterChange = vi.fn();
    render(<StudioOnboardingDioramaPanel onChapterChange={onChapterChange} />);

    expect(screen.getByTestId("diorama-visit-progress").textContent).toContain("1/4");

    fireEvent.click(screen.getByTestId("chapter-tab-character-sculpt"));
    expect(screen.getByTestId("diorama-hero-img").getAttribute("src")).toBe(
      "/assets/atelier/onboarding/character-sculpt.webp",
    );
    expect(screen.getByTestId("diorama-jewel-img").getAttribute("src")).toBe(
      "/assets/atelier/jewels/jewel-character-bust.webp",
    );
    expect(screen.getByTestId("diorama-visit-progress").textContent).toContain("2/4");

    fireEvent.click(screen.getByTestId("hotspot-btn-sculpt-height"));
    expect(screen.getByTestId("active-hotspot-detail").textContent).toContain("실측 키 스케일");

    fireEvent.click(screen.getByTestId("chapter-next-btn"));
    expect(screen.getByTestId("diorama-hero-img").getAttribute("src")).toBe(
      "/assets/atelier/onboarding/virtual-collab.webp",
    );
    expect(screen.getByTestId("diorama-jewel-img").getAttribute("src")).toBe(
      "/assets/atelier/jewels/jewel-studio-cube.webp",
    );

    fireEvent.click(screen.getByTestId("chapter-next-btn"));
    expect(screen.getByTestId("diorama-hero-img").getAttribute("src")).toBe(
      "/assets/atelier/onboarding/episode-publish.webp",
    );
    expect(screen.getByTestId("diorama-jewel-img").getAttribute("src")).toBe(
      "/assets/atelier/jewels/jewel-reels-slate.webp",
    );
    expect(screen.getByTestId("diorama-visit-progress").textContent).toContain("4/4");
    expect(onChapterChange).toHaveBeenCalledTimes(3);
  });

  it("포인터 이동 시 2.5D 패럴랙스 계측이 반응하고, 모션 줄이기 토글 ON 시 0deg/0px로 즉시 고정된다", () => {
    render(<StudioOnboardingDioramaPanel prefersReducedMotionOverride={false} />);
    const stage = screen.getByTestId("onboarding-diorama-stage");

    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 400,
      bottom: 200,
      width: 400,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerMove(stage, { clientX: 380, clientY: 20 });
    expect(screen.getByTestId("parallax-tilt-readout").textContent).not.toContain(
      "X 0deg · Y 0deg",
    );

    fireEvent.click(screen.getByTestId("toggle-reduced-motion-btn"));
    expect(screen.getByTestId("parallax-tilt-readout").textContent).toContain("X 0deg · Y 0deg");
    expect(screen.getByTestId("parallax-depth-readout").textContent).toContain(
      "FG 0px · MG 0px · BG 0px",
    );

    fireEvent.pointerMove(stage, { clientX: 390, clientY: 10 });
    expect(screen.getByTestId("parallax-tilt-readout").textContent).toContain("X 0deg · Y 0deg");
  });

  it("60초 첫 컷 체험 UI에서 펜선 추가·대사 입력·단계 완료·원스톱 완료가 콜백과 함께 동작한다", () => {
    const onSprintComplete = vi.fn();
    render(<StudioOnboardingDioramaPanel onSprintComplete={onSprintComplete} />);

    fireEvent.click(screen.getByTestId("sprint-add-stroke-btn"));
    expect(screen.getByTestId("sprint-stroke-readout").textContent).toContain("3");

    fireEvent.change(screen.getByTestId("sprint-balloon-input"), {
      target: { value: "오늘부터 첫 회차 연재 시작!" },
    });
    expect(screen.getByTestId("sprint-balloon-preview").textContent).toContain(
      "오늘부터 첫 회차 연재 시작!",
    );

    fireEvent.click(screen.getByTestId("sprint-complete-frame-rough"));
    expect(screen.getByTestId("sprint-progress-bar").getAttribute("style")).toContain("25%");

    fireEvent.click(screen.getByTestId("sprint-instant-complete-btn"));
    expect(screen.getByTestId("sprint-progress-bar").getAttribute("style")).toContain("100%");
    expect(onSprintComplete).toHaveBeenCalledTimes(1);
    expect(onSprintComplete.mock.calls[0]?.[0]?.completed).toBe(true);

    fireEvent.click(screen.getByTestId("sprint-reset-btn"));
    expect(screen.getByTestId("sprint-progress-bar").getAttribute("style")).toContain("0%");
  });

  it("창작자 성향 4문항 선택 시 처방 카드 이미지·경로가 즉시 갱신되고 원클릭 적용이 챕터와 콜백을 동기화한다", () => {
    const onPrescriptionApply = vi.fn();
    render(<StudioOnboardingDioramaPanel onPrescriptionApply={onPrescriptionApply} />);

    fireEvent.click(screen.getByTestId("matcher-genre-urban-thriller"));
    fireEvent.click(screen.getByTestId("matcher-goal-team-collab-workflow"));
    fireEvent.click(screen.getByTestId("matcher-device-laptop-mouse-trackpad"));
    fireEvent.click(screen.getByTestId("matcher-medium-charcoal-pastel"));

    expect(screen.getByTestId("prescription-brush-img").getAttribute("src")).toBe(
      "/assets/atelier/media/charcoal-pastel.webp",
    );
    expect(screen.getByTestId("prescription-paper-img").getAttribute("src")).toBe(
      "/assets/atelier/papers/linen-canvas.webp",
    );
    expect(screen.getByTestId("prescription-background-img").getAttribute("src")).toBe(
      "/assets/atelier/backgrounds/bg-seoul-crosswalk.webp",
    );
    expect(screen.getByTestId("prescription-route-path").textContent).toBe("/studio/space");

    fireEvent.click(screen.getByTestId("apply-prescription-btn"));
    expect(onPrescriptionApply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("prescription-applied-banner").textContent).toContain(
      "/studio/space",
    );
    // 처방 적용 시 추천 챕터(3장 가상 협업 스튜디오)로 자동 동기화 확인
    expect(screen.getByTestId("diorama-hero-img").getAttribute("src")).toBe(
      "/assets/atelier/onboarding/virtual-collab.webp",
    );
  });

  it("영문 로케일(locale='en')에서도 모든 헤더·챕터·처방 카드가 정상 렌더링된다", () => {
    render(<StudioOnboardingDioramaPanel locale="en" initialChapterId="episode-publish" />);
    expect(screen.getByTestId("active-chapter-title").textContent).toBe(
      "Episode Publish & Reels",
    );
    expect(screen.getByTestId("prescription-fit-score").textContent).toContain("Rule Fit");
  });

  it("초안은 자동 절단하지 않고 예제·미저장 범위를 표시하며 관련 링크는 새 탭으로 연다", () => {
    render(<StudioOnboardingDioramaPanel />);
    const dialogue = `${"가".repeat(59)}😀👨‍👩‍👧‍👦e\u0301${"뒤".repeat(30)}`;
    fireEvent.change(screen.getByTestId("sprint-balloon-input"), { target: { value: dialogue } });
    expect(screen.getByDisplayValue(dialogue)).toBeTruthy();
    expect(screen.getByTestId("sprint-dialogue-count").textContent).toContain("92글자");
    fireEvent.click(screen.getByTestId("sprint-instant-complete-btn"));
    expect(screen.getByTestId("sprint-status-text").textContent).toContain("합성 예산 48초");
    expect(screen.getByTestId("sprint-status-text").textContent).toContain("실제 원고 미저장");
    fireEvent.click(screen.getByTestId("sprint-reset-btn"));
    expect(screen.getByDisplayValue(dialogue)).toBeTruthy();
    expect(screen.getByTestId("onboarding-scope-notice").textContent).toContain("다시 마운트하면 사라져요");
    for (const id of ["chapter-launch-link", "launch-prescribed-workspace-link"]) {
      expect(screen.getByTestId(id).getAttribute("target")).toBe("_blank");
      expect(screen.getByTestId(id).getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("완료 알림 대기 중 중복·초기화를 막고 실패 후 단계 초기화는 과거 재시도를 지운다", async () => {
    const onSprintComplete = vi.fn().mockRejectedValueOnce(new Error("알림 실패")).mockResolvedValueOnce(undefined);
    render(<StudioOnboardingDioramaPanel onSprintComplete={onSprintComplete} />);
    fireEvent.change(screen.getByTestId("sprint-balloon-input"), { target: { value: "남겨둘 대사😀" } });
    fireEvent.click(screen.getByTestId("sprint-instant-complete-btn"));
    expect(screen.getByTestId("onboarding-diorama-panel").getAttribute("aria-busy")).toBe("true");
    fireEvent.click(screen.getByTestId("sprint-instant-complete-btn"));
    fireEvent.click(screen.getByTestId("sprint-reset-btn"));
    expect(onSprintComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("sprint-progress-bar").getAttribute("style")).toContain("100%");
    await waitFor(() => expect(screen.getByTestId("onboarding-notification-status").textContent).toContain("처리에 실패"));
    fireEvent.click(screen.getByTestId("sprint-reset-btn"));
    expect(screen.queryByTestId("onboarding-notification-retry")).toBeNull();
    expect(screen.getByDisplayValue("남겨둘 대사😀")).toBeTruthy();
    fireEvent.click(screen.getByTestId("sprint-instant-complete-btn"));
    await waitFor(() => expect(screen.getByTestId("onboarding-notification-status").textContent).toContain("실제 적용·저장 완료를 뜻하지 않아요"));
    expect(onSprintComplete).toHaveBeenCalledTimes(2);
  });

  it("처방 알림 재시도는 이미 전달한 챕터 알림을 중복 실행하지 않으며 응답은 실제 설정 적용과 구분한다", async () => {
    const onChapterChange = vi.fn().mockResolvedValue(undefined);
    const onPrescriptionApply = vi.fn().mockRejectedValueOnce(new Error("알림 실패")).mockResolvedValueOnce(undefined);
    render(<StudioOnboardingDioramaPanel onChapterChange={onChapterChange} onPrescriptionApply={onPrescriptionApply} />);
    fireEvent.click(screen.getByTestId("matcher-goal-team-collab-workflow"));
    fireEvent.click(screen.getByTestId("apply-prescription-btn"));
    fireEvent.click(screen.getByTestId("apply-prescription-btn"));
    await waitFor(() => expect(screen.getByTestId("onboarding-notification-status").textContent).toContain("처리에 실패"));
    expect(onChapterChange).toHaveBeenCalledTimes(1);
    expect(onPrescriptionApply).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("onboarding-notification-retry"));
    await waitFor(() => expect(screen.getByTestId("onboarding-notification-status").textContent).toContain("실제 적용·저장 완료를 뜻하지 않아요"));
    expect(onChapterChange).toHaveBeenCalledTimes(1);
    expect(onPrescriptionApply).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("prescription-applied-banner").textContent).toContain("실제 설정 미반영");
    fireEvent.click(screen.getByTestId("matcher-medium-charcoal-pastel"));
    expect(screen.queryByTestId("prescription-applied-banner")).toBeNull();
  });

  it("동기 챕터 알림 오류도 표시하고 선택한 예제의 알림을 다시 시도한다", () => {
    const onChapterChange = vi.fn().mockImplementationOnce(() => { throw new Error("알림 오류"); });
    render(<StudioOnboardingDioramaPanel onChapterChange={onChapterChange} />);
    fireEvent.click(screen.getByTestId("chapter-next-btn"));
    expect(screen.getByTestId("onboarding-notification-status").textContent).toContain("처리에 실패");
    fireEvent.click(screen.getByTestId("onboarding-notification-retry"));
    expect(onChapterChange).toHaveBeenCalledTimes(2);
    expect(onChapterChange.mock.calls[0]?.[0]).toEqual(onChapterChange.mock.calls[1]?.[0]);
  });
});

describe("6. 엄격 코드 위생 및 아키텍처 규칙 계약", () => {
  it("모든 파일 800줄 이하, 금지 패턴(Web Storage·BigInt 리터럴·private Map store·원시 색·props={}) 0건을 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "onboarding-diorama-engine.ts",
      "StudioOnboardingDioramaPanel.tsx",
      "index.ts",
      "onboarding-diorama-craft.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines, `${file} exceeds 800 lines (${lines})`).toBeLessThanOrEqual(800);

      if (file !== "onboarding-diorama-craft.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
      }
      if (file.endsWith(".tsx") && file !== "onboarding-diorama-craft.test.tsx") {
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
      }
    }
  });
});
