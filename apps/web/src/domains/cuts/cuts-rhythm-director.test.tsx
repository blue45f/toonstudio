// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n-core";

import { buildCutsClip } from "./cuts-clip-builder";
import {
  applyPresetToRhythmConfig,
  applyRhythmToClip,
  DEFAULT_CUTS_RHYTHM_CONFIG,
  incrementClipReaction,
  loadClipReactions,
  loadCutsRhythmConfig,
  nudgeShotDurationOffset,
  saveCutsRhythmConfig,
} from "./cuts-rhythm-director";
import { DEMO_EPISODES } from "./cuts-seed";
import { CutsPlayer } from "./CutsPlayer";
import { CutsReactionBurstRail } from "./CutsReactionBurstRail";
import { CutsRhythmDirectorPanel } from "./CutsRhythmDirectorPanel";

beforeEach(() => {
  localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("cuts-rhythm-director 모델 & 영속 저장", () => {
  it("감정 템포 프리셋과 샷별 길이 조정을 클립 타이밍에 정확히 반영하고 저장·복원한다", () => {
    const baseClip = buildCutsClip(DEMO_EPISODES[0]!, "creator-1");
    expect(baseClip).not.toBeNull();
    if (!baseClip) return;

    const chaseConfig = applyPresetToRhythmConfig(DEFAULT_CUTS_RHYTHM_CONFIG, "chase");
    expect(chaseConfig.playbackRate).toBe(1.25);
    expect(chaseConfig.letterbox).toBe(true);

    const nudged = nudgeShotDurationOffset(chaseConfig, baseClip.shots[0]!.id, 500);
    saveCutsRhythmConfig(nudged);
    expect(loadCutsRhythmConfig()).toEqual(nudged);

    const adjusted = applyRhythmToClip(baseClip, nudged);
    expect(adjusted.shots[0]!.startMs).toBe(0);
    expect(adjusted.shots[1]!.startMs).toBe(adjusted.shots[0]!.durationMs);
    expect(adjusted.durationMs).toBe(
      adjusted.shots.reduce((sum, shot) => sum + shot.durationMs, 0),
    );
  });

  it("클립별 1탭 감정 리액션을 누적하고 localStorage에 영속화한다", () => {
    expect(loadClipReactions("clip-alpha")).toEqual({ chills: 0, heart: 0, quote: 0, art: 0 });
    incrementClipReaction("clip-alpha", "chills");
    const after = incrementClipReaction("clip-alpha", "chills");
    expect(after.chills).toBe(2);
    expect(loadClipReactions("clip-alpha").chills).toBe(2);
  });
});

describe("CutsRhythmDirectorPanel & CutsPlayer & CutsReactionBurstRail UI", () => {
  it("프리셋·배속·영화 프레임·샷 조절 콜백과 44px 터치 타깃을 제공한다", () => {
    const baseClip = buildCutsClip(DEMO_EPISODES[0]!, "creator-1")!;
    const onSelectPreset = vi.fn();
    const onChangeRate = vi.fn();
    const onToggleLetterbox = vi.fn();
    const onNudgeShot = vi.fn();
    const onJumpShot = vi.fn();
    const onReset = vi.fn();

    render(
      <CutsRhythmDirectorPanel
        clip={baseClip}
        config={DEFAULT_CUTS_RHYTHM_CONFIG}
        activeShotIndex={0}
        onSelectPreset={onSelectPreset}
        onChangeRate={onChangeRate}
        onToggleLetterbox={onToggleLetterbox}
        onNudgeShot={onNudgeShot}
        onJumpShot={onJumpShot}
        onReset={onReset}
      />,
    );

    const fineTune = screen.getByTestId("cuts-rhythm-fine-tune-disclosure") as HTMLDetailsElement;
    expect(fineTune.open).toBe(false);

    fireEvent.click(screen.getByTestId("cuts-rhythm-preset-linger"));
    expect(onSelectPreset).toHaveBeenCalledWith("linger");

    fireEvent.click(screen.getByTestId("cuts-rhythm-rate-1.5"));
    expect(onChangeRate).toHaveBeenCalledWith(1.5);

    fireEvent.click(screen.getByTestId("cuts-rhythm-letterbox-toggle"));
    expect(onToggleLetterbox).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId(`cuts-rhythm-shot-inc-${baseClip.shots[0]!.id}`));
    expect(onNudgeShot).toHaveBeenCalledWith(baseClip.shots[0]!.id, 500);

    fireEvent.click(screen.getByTestId("cuts-rhythm-reset-btn"));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("cuts-rhythm-rate-1.5").className).toContain("min-h-11");
  });

  it("CutsPlayer가 일시정지/재개 토글, 시네마 속성, 샷 세그먼트 점프를 동작시킨다", () => {
    const baseClip = buildCutsClip(DEMO_EPISODES[0]!, "creator-1")!;
    const onShotChange = vi.fn();
    render(
      <CutsPlayer
        clip={baseClip}
        active
        muted
        onToggleMute={() => undefined}
        rhythmPreset="impact"
        playbackRate={1.25}
        letterbox
        onShotChange={onShotChange}
      />,
    );

    const player = screen.getByRole("region", { name: /컷츠/ });
    expect(player.getAttribute("data-rhythm-preset")).toBe("impact");
    expect(player.getAttribute("data-letterbox")).toBe("true");

    const pauseBtn = screen.getByRole("button", { name: "일시정지" });
    fireEvent.click(pauseBtn);
    expect(screen.getByRole("button", { name: "다시 재생" }).getAttribute("aria-pressed")).toBe("true");

    const secondShotBtn = screen.getByRole("button", { name: /컷 2로 이동/ });
    fireEvent.click(secondShotBtn);
    expect(onShotChange).toHaveBeenLastCalledWith(1);
  });

  it("CutsReactionBurstRail이 1탭 리액션 카운트와 파티클 버스트를 띄우고 영어 로케일에서 한글을 누출하지 않는다", () => {
    const { rerender } = render(<CutsReactionBurstRail clipId="clip-burst-1" />);
    const heartBtn = screen.getByTestId("cuts-reaction-clip-burst-1-heart");
    fireEvent.click(heartBtn);
    expect(heartBtn.textContent).toContain("1");
    expect(heartBtn.querySelectorAll(".cuts-reaction-spark")).toHaveLength(6);

    useI18n.setState({ lang: "en" });
    rerender(<CutsReactionBurstRail clipId="clip-burst-1" />);
    expect(screen.getByTestId("cuts-reaction-rail-clip-burst-1").textContent).not.toMatch(/[가-힣]/u);
  });
});
