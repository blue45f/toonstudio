// @vitest-environment jsdom
/**
 * 기술 세미나 Remotion 모션 도식 플레이어 + 타 사이트 실무 재사용 레시피 6선 통합 검증.
 *
 * 검증 항목:
 * 1. Remotion 타임라인 수학·5챕터 경계·프레임별 단계/진행도/타임코드 계산
 * 2. Remotion 1280×720 프레임 뷰 렌더링(5개 챕터·활성 단계 강조·reducedMotion·발표자 자막 바)
 * 3. 5개 챕터 + 6개 레시피에 인용된 모든 저장소 경로의 실재성(`repoPathExists`) 및 공식 링크·언슬롭 검증
 * 4. `@remotion/player` 지연 마운트·`acknowledgeRemotionLicense`·챕터/단계 점프·오류 폴백·접근성 상호작용
 * 5. 실무 레시피 6선 필터·전체 펼치기·발표자 대본 토글·클립보드 복사·모션↔레시피 양방향 점프
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { repoPathExists } from "../engineering-repo-paths-test-kit";
import { TechSeminarRemotionShowcase } from "./TechSeminarRemotionShowcase";
import { TechSeminarReusableCodePanel } from "./TechSeminarReusableCodePanel";
import { TechSeminarShowcaseStudio } from "./TechSeminarShowcaseStudio";
import { TechSeminarDiagramComposition } from "./tech-seminar-remotion-compositions";
import {
  SEMINAR_CHAPTER_DURATION_FRAMES,
  SEMINAR_FRAMES_PER_STAGE,
  SEMINAR_REMOTION_FPS,
  SEMINAR_TOTAL_DURATION_FRAMES,
  TECH_SEMINAR_MOTION_CHAPTERS,
  clampSeminarFrame,
  formatSeminarTimestamp,
  seminarChapterAtFrame,
  seminarFrameForChapterStage,
  seminarStageIndexInChapter,
  seminarStageProgress,
} from "./tech-seminar-remotion-data";
import {
  TECH_SEMINAR_REUSABLE_RECIPES,
  findSeminarRecipeById,
} from "./tech-seminar-reusable-recipes";

const remotionMockState = vi.hoisted(() => ({
  frame: 0,
  fps: 30,
}));

vi.mock("remotion", async (importOriginal) => {
  const original = await importOriginal<typeof import("remotion")>();
  return {
    ...original,
    useCurrentFrame: () => remotionMockState.frame,
    useVideoConfig: () => ({
      fps: remotionMockState.fps,
      width: 1280,
      height: 720,
      durationInFrames: 1800,
      id: "TechSeminarDiagramComposition",
      defaultProps: {},
      props: {},
      defaultCodec: null,
    }),
  };
});

const playerHarness = vi.hoisted(() => {
  type Listener = (event: { readonly detail: unknown }) => void;
  const listeners = new Map<string, Set<Listener>>();
  const harness = {
    lastProps: null as Record<string, unknown> | null,
    currentFrame: 0,
    playing: false,
    fullscreen: false,
    play: vi.fn(() => {
      harness.playing = true;
      harness.emit("play", undefined);
    }),
    pause: vi.fn(() => {
      harness.playing = false;
      harness.emit("pause", undefined);
    }),
    seekTo: vi.fn((frame: number) => {
      harness.currentFrame = frame;
    }),
    getCurrentFrame: vi.fn(() => harness.currentFrame),
    isPlaying: vi.fn(() => harness.playing),
    requestFullscreen: vi.fn(() => {
      harness.fullscreen = true;
    }),
    exitFullscreen: vi.fn(() => {
      harness.fullscreen = false;
    }),
    isFullscreen: vi.fn(() => harness.fullscreen),
    addEventListener: vi.fn((name: string, listener: Listener) => {
      const bucket = listeners.get(name) ?? new Set<Listener>();
      bucket.add(listener);
      listeners.set(name, bucket);
    }),
    removeEventListener: vi.fn((name: string, listener: Listener) => {
      listeners.get(name)?.delete(listener);
    }),
    emit(name: string, detail: unknown) {
      for (const listener of listeners.get(name) ?? []) listener({ detail });
    },
    reset() {
      listeners.clear();
      harness.lastProps = null;
      harness.currentFrame = 0;
      harness.playing = false;
      harness.fullscreen = false;
      harness.play.mockClear();
      harness.pause.mockClear();
      harness.seekTo.mockClear();
      harness.getCurrentFrame.mockClear();
      harness.isPlaying.mockClear();
      harness.requestFullscreen.mockClear();
      harness.exitFullscreen.mockClear();
      harness.isFullscreen.mockClear();
      harness.addEventListener.mockClear();
      harness.removeEventListener.mockClear();
    },
  };
  return harness;
});

vi.mock("@remotion/player", async () => {
  const React = await import("react");
  const Player = React.forwardRef<unknown, Record<string, unknown>>((props, ref) => {
    React.useEffect(() => {
      playerHarness.lastProps = props;
    }, [props]);
    React.useImperativeHandle(ref, () => playerHarness);
    return React.createElement("div", {
      "data-testid": "seminar-remotion-player",
      "data-ack-license": String(props.acknowledgeRemotionLicense),
      "data-duration-frames": String(props.durationInFrames),
      "data-fps": String(props.fps),
    });
  });
  Player.displayName = "MockSeminarRemotionPlayer";
  return { Player };
});

beforeEach(() => {
  playerHarness.reset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Remotion 세미나 타임라인 모델과 컴포지션 프레임 렌더", () => {
  it("5개 챕터가 0..1799 프레임을 빈틈없이 360프레임씩 분할한다", () => {
    expect(TECH_SEMINAR_MOTION_CHAPTERS).toHaveLength(5);
    expect(SEMINAR_TOTAL_DURATION_FRAMES).toBe(1800);

    TECH_SEMINAR_MOTION_CHAPTERS.forEach((chapter, index) => {
      expect(chapter.order).toBe(index + 1);
      expect(chapter.startFrame).toBe(index * SEMINAR_CHAPTER_DURATION_FRAMES);
      expect(chapter.durationFrames).toBe(SEMINAR_CHAPTER_DURATION_FRAMES);
      expect(chapter.stages).toHaveLength(4);
      expect(seminarChapterAtFrame(chapter.startFrame).id).toBe(chapter.id);
      expect(seminarChapterAtFrame(chapter.startFrame + SEMINAR_CHAPTER_DURATION_FRAMES - 1).id).toBe(
        chapter.id,
      );
      expect(findSeminarRecipeById(chapter.relatedRecipeId)).toBeDefined();
    });

    expect(clampSeminarFrame(-40)).toBe(0);
    expect(clampSeminarFrame(99_999)).toBe(SEMINAR_TOTAL_DURATION_FRAMES - 1);
    expect(seminarStageIndexInChapter(0)).toBe(0);
    expect(seminarStageIndexInChapter(SEMINAR_FRAMES_PER_STAGE)).toBe(1);
    expect(seminarStageIndexInChapter(SEMINAR_FRAMES_PER_STAGE * 3 + 45)).toBe(3);
    expect(seminarStageProgress(45)).toBeCloseTo(0.5, 4);
    expect(formatSeminarTimestamp(0, SEMINAR_REMOTION_FPS)).toBe("00:00");
    expect(formatSeminarTimestamp(12 * 30, SEMINAR_REMOTION_FPS)).toBe("00:12");
    expect(seminarFrameForChapterStage("oauth-pkce-unlink", 2)).toBe(360 * 2 + 180);
  });

  it("5개 챕터 각각의 프레임에서 활성 단계와 발표자 한 줄 요약을 결정론적으로 렌더링한다", () => {
    for (const chapter of TECH_SEMINAR_MOTION_CHAPTERS) {
      remotionMockState.frame = chapter.startFrame + SEMINAR_FRAMES_PER_STAGE * 2 + 15;
      remotionMockState.fps = SEMINAR_REMOTION_FPS;
      const { container, unmount } = render(
        <TechSeminarDiagramComposition reducedMotion={false} showPresenterBar />,
      );

      const root = container.querySelector<HTMLElement>("[data-seminar-remotion-frame]");
      expect(root?.getAttribute("data-seminar-chapter-id")).toBe(chapter.id);
      expect(root?.getAttribute("data-seminar-stage-index")).toBe("2");
      expect(container.querySelectorAll('[data-stage-active="true"]')).toHaveLength(1);
      expect(container.textContent).toContain(chapter.title);
      expect(container.textContent).toContain(chapter.presenterOneLiner);
      expect(container.querySelector("[data-seminar-presenter-bar]")).not.toBeNull();
      unmount();
    }
  });

  it("reducedMotion=true 및 발표자 자막 바 숨김 옵션을 정확히 반영한다", () => {
    remotionMockState.frame = 360 + 95;
    remotionMockState.fps = SEMINAR_REMOTION_FPS;
    const { container } = render(
      <TechSeminarDiagramComposition reducedMotion showPresenterBar={false} />,
    );
    const root = container.querySelector<HTMLElement>("[data-seminar-remotion-frame]");
    expect(root?.getAttribute("data-reduced-motion")).toBe("true");
    expect(root?.getAttribute("data-seminar-chapter-id")).toBe("wasm64-opfs-crdt");
    expect(container.querySelector("[data-seminar-presenter-bar]")).toBeNull();
  });
});

describe("실재 파일 경로 · 공식 문서 링크 · 언슬롭 문체 무결성", () => {
  it("모션 도식 5개 챕터와 실무 레시피 6선에 인용된 모든 저장소 경로가 실제로 존재한다", () => {
    expect(TECH_SEMINAR_REUSABLE_RECIPES).toHaveLength(6);

    for (const chapter of TECH_SEMINAR_MOTION_CHAPTERS) {
      expect(chapter.sourcePaths.length, chapter.id).toBeGreaterThan(0);
      for (const path of chapter.sourcePaths) {
        expect(repoPathExists(path), `chapter ${chapter.id}: ${path}`).toBe(true);
      }
    }

    for (const recipe of TECH_SEMINAR_REUSABLE_RECIPES) {
      expect(repoPathExists(recipe.codeExcerpt.sourcePath), `recipe ${recipe.id}: code sourcePath`).toBe(
        true,
      );
      expect(recipe.repoEvidencePaths.length, recipe.id).toBeGreaterThan(0);
      for (const path of recipe.repoEvidencePaths) {
        expect(repoPathExists(path), `recipe ${recipe.id}: ${path}`).toBe(true);
      }
      expect(recipe.apiSpecs.length, recipe.id).toBeGreaterThanOrEqual(3);
      expect(recipe.adoptionSteps).toHaveLength(3);
      expect(recipe.gotchas.length, recipe.id).toBeGreaterThanOrEqual(3);
      expect(recipe.speakerNotes.length, recipe.id).toBeGreaterThanOrEqual(3);
      expect(recipe.officialLinks.length, recipe.id).toBeGreaterThanOrEqual(4);
      for (const link of recipe.officialLinks) {
        expect(link.url, `${recipe.id} ${link.label}`).toMatch(/^https:\/\//u);
      }
    }
  });

  it("AI 번역투 상투어 없이 자연스러운 한국어 문체를 유지한다", () => {
    const bannedPatterns = [
      /하는 것을 가능하게 합니다/u,
      /직관적인 경험을 제공합니다/u,
      /원활한 워크플로우/u,
    ];
    const allTexts = [
      ...TECH_SEMINAR_MOTION_CHAPTERS.flatMap((chapter) => [
        chapter.title,
        chapter.subtitle,
        chapter.presenterOneLiner,
        ...chapter.stages.map((stage) => stage.speakerCue),
      ]),
      ...TECH_SEMINAR_REUSABLE_RECIPES.flatMap((recipe) => [
        recipe.title,
        recipe.analogy,
        recipe.oneLineSummary,
        ...recipe.adoptionSteps.flatMap((step) => [step.title, step.action, step.check]),
        ...recipe.gotchas,
        ...recipe.speakerNotes,
      ]),
    ];

    for (const text of allTexts) {
      for (const pattern of bannedPatterns) {
        expect(pattern.test(text), `AI 번역투 감지: ${text}`).toBe(false);
      }
    }
  });
});

describe("TechSeminarRemotionShowcase 플레이어 상호작용", () => {
  it("초기에는 정적 4단계 프리뷰를 보여주고, 재생 클릭 시 acknowledgeRemotionLicense와 함께 @remotion/player를 마운트한다", () => {
    const onSelectRecipe = vi.fn();
    render(<TechSeminarRemotionShowcase onSelectRecipe={onSelectRecipe} />);

    expect(screen.queryByTestId("seminar-remotion-player")).toBeNull();
    expect(document.querySelector("[data-seminar-static-stage]")).not.toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: /모션 도식 재생/u })[0]!);

    const player = screen.getByTestId("seminar-remotion-player");
    expect(player.getAttribute("data-ack-license")).toBe("true");
    expect(player.getAttribute("data-duration-frames")).toBe(String(SEMINAR_TOTAL_DURATION_FRAMES));
    expect(player.getAttribute("data-fps")).toBe("30");
    expect(playerHarness.seekTo).toHaveBeenCalledWith(0);
    expect(playerHarness.play).toHaveBeenCalledTimes(1);

    // 챕터 점프(3번 OAuth)
    const chapterGroup = screen.getByRole("group", { name: "모션 도식 챕터 선택" });
    fireEvent.click(within(chapterGroup).getByRole("button", { name: /OAuth · Unlink/u }));
    expect(playerHarness.seekTo).toHaveBeenLastCalledWith(SEMINAR_CHAPTER_DURATION_FRAMES * 2);

    // 다음 도식 챕터 버튼
    fireEvent.click(screen.getByRole("button", { name: "다음 도식 챕터" }));
    expect(playerHarness.seekTo).toHaveBeenLastCalledWith(SEMINAR_CHAPTER_DURATION_FRAMES * 3);

    // 연관 실무 레시피 이동 콜백
    fireEvent.click(screen.getByRole("button", { name: /연관 실무 레시피 보기/u }));
    expect(onSelectRecipe).toHaveBeenCalledWith("pointer-dnd-a11y");
  });

  it("Remotion 컴포지션 오류 발생 시 깨진 화면 대신 정적 단계 보드로 안전 폴백한다", async () => {
    render(<TechSeminarRemotionShowcase />);
    fireEvent.click(screen.getAllByRole("button", { name: /모션 도식 재생/u })[0]!);
    expect(screen.getByTestId("seminar-remotion-player")).not.toBeNull();

    const errorFallback = playerHarness.lastProps?.errorFallback as
      | ((info: { readonly error: Error }) => ReactNode)
      | undefined;
    expect(typeof errorFallback).toBe("function");

    render(errorFallback!({ error: new Error("simulated render error") }));

    await waitFor(() => {
      expect(screen.queryByTestId("seminar-remotion-player")).toBeNull();
      expect(document.querySelector("[data-seminar-static-stage]")).not.toBeNull();
    });
    expect(screen.getByRole("status").textContent).toContain("simulated render error");
  });
});

describe("TechSeminarReusableCodePanel & TechSeminarShowcaseStudio 통합 상호작용", () => {
  it("실무 레시피 6선 전체 펼치기, 영역 필터, 발표자 대본 토글, 코드 복사를 정상 처리한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    const onSelect = vi.fn();
    render(
      <TechSeminarReusableCodePanel
        activeRecipeId="kakao-oauth-unlink"
        onSelectRecipeId={onSelect}
      />,
    );

    // 기본 집중 보기: 1개 카드 노출
    expect(document.querySelectorAll("[data-seminar-recipe-card]")).toHaveLength(1);
    expect(screen.getByRole("img", { name: /카카오 OAuth 로그인과 연결 해제 웹훅/u })).toBeTruthy();

    // 발표자 대본 토글 열기/닫기
    const notesToggle = screen.getByRole("button", { name: "발표자 대본 보기" });
    expect(notesToggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(notesToggle);
    expect(notesToggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('[data-seminar-speaker-notes="kakao-oauth-unlink"]')).not.toBeNull();

    // 코드 복사 버튼 동작
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /복사/u }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0]?.[0])).toContain("parseKakaoUnlinkWebhook");

    // 6선 전체 펼치기
    fireEvent.click(screen.getByRole("button", { name: "6선 전체 펼치기" }));
    expect(document.querySelectorAll("[data-seminar-recipe-card]")).toHaveLength(6);

    // 영역 필터("엔진 · 라이브러리") 적용 시 2개(실전 라이브러리 5종, WebGPU 동등성)만 남음
    fireEvent.click(screen.getByRole("button", { name: "엔진 · 라이브러리" }));
    expect(document.querySelectorAll("[data-seminar-recipe-card]")).toHaveLength(2);
  });

  it("스튜디오 통합 컨테이너에서 레시피 카드 ↔ 모션 도식 챕터 양방향 점프가 동기화된다", () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    render(<TechSeminarShowcaseStudio />);

    // 초기 모션 도식은 1번 WebGPU, 레시피는 1번 카카오
    const remotionSection = document.querySelector<HTMLElement>("[data-seminar-remotion-showcase]");
    expect(remotionSection?.getAttribute("data-active-chapter")).toBe("webgpu-km7-binning");

    // 모션 도식에서 "연관 실무 레시피 보기" → 5번 WebGPU 레시피 활성화
    fireEvent.click(screen.getByRole("button", { name: /연관 실무 레시피 보기/u }));
    expect(document.querySelector('[data-seminar-recipe-card="webgpu-wgsl-cpu-parity"]')).not.toBeNull();

    // 레시피 3번(포인터 DnD) 선택 후 "모션 도식에서 보기" → 4번 포인터 DnD 챕터 활성화
    const recipeSelector = screen.getByRole("group", { name: "실무 레시피 직접 선택" });
    fireEvent.click(within(recipeSelector).getByRole("button", { name: /60fps 접근성 드래그 앤 드롭/u }));
    fireEvent.click(screen.getByRole("button", { name: "모션 도식에서 보기" }));
    expect(remotionSection?.getAttribute("data-active-chapter")).toBe("pointer-dnd-60fps");
  });
});
