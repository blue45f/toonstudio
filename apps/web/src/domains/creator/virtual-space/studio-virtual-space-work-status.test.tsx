// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SpaceCursorChatOverlay } from "./hud/SpaceCursorChatOverlay";
import { SpacePopover } from "./hud/SpacePopover";
import { SpaceSelfCard } from "./hud/SpaceSelfCard";
import { SpaceCelebrationRibbon, SpaceWorkStatusBar } from "./hud/SpaceWorkStatusBar";
import { createOffice2dAvatarProfileSource } from "./office2d/office2d-avatar-appearance";
import { office2dStatusDotColor } from "./office2d/office2d-overlay";
import { readOffice2dSoundMuted } from "./office2d/office2d-stage-extensions";
import { studioUserStatusLabel } from "./office2d/office2d-status";
import { writeStudioVirtualAvatarProfile } from "./studio-virtual-space-avatar-store";
import {
  STUDIO_VIRTUAL_CHARACTER_PRESETS,
  writeStudioVirtualCharacterCustomization,
} from "./studio-virtual-space-customization";
import {
  completeStudioFocusSessionNow,
  createStudioFocusSession,
  startStudioFocusSession,
} from "./studio-virtual-space-focus-session";
import { studioVirtualAvatarProfile, studioVirtualSpaceState } from "./studio-virtual-space-model";
import {
  STUDIO_WEBTOON_WORK_STATUSES,
  STUDIO_WEBTOON_WORK_STATUS_STORAGE_KEY,
  createStudioCelebrationEvent,
  formatStudioWebtoonWorkStatusBadge,
  playStudioCelebrationChime,
  readStudioWebtoonWorkStatus,
  setStudioSpaceSoundMuted,
  useStudioSpaceSoundMuted,
  useStudioWebtoonWorkStatus,
  writeStudioWebtoonWorkStatus,
} from "./studio-virtual-space-work-status";
import { StudioVirtualSpaceThreeHud } from "./three/StudioVirtualSpaceThreeHud";
import { formatParticipantOverlayBadge } from "./three/studio-virtual-space-three-dioramas";
import { StudioVirtualSpaceWhiteboard } from "./StudioVirtualSpaceWhiteboard";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

const workStatusCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "hud/space-work-status.css"),
  "utf8",
);

function WorkStatusHarness() {
  const { statusId, setStatusId } = useStudioWebtoonWorkStatus();
  return (
    <SpaceWorkStatusBar
      activeStatusId={statusId}
      onSelectStatus={setStatusId}
      focusActive={false}
      onStartFocusSprint={vi.fn()}
      onCompleteCheckpoint={vi.fn()}
    />
  );
}

function SoundMuteHarness() {
  const [muted, setMuted] = useStudioSpaceSoundMuted();
  return (
    <StudioVirtualSpaceThreeHud
      overlays={[]}
      assetFailureCount={0}
      lightingPreset="studio"
      onLightingPresetChange={vi.fn()}
      onResetCamera={vi.fn()}
      onTriggerTarget={vi.fn()}
      soundMuted={muted}
      onToggleSound={() => setMuted(!muted)}
    />
  );
}

describe("웹툰 업무 상태 5종 · localStorage 영속화 · 2D/3D/로스터 실연동", () => {
  it("5종 업무 상태 배지를 모두 제공하고 localStorage에 영속 저장·복원한다", () => {
    expect(STUDIO_WEBTOON_WORK_STATUSES.map((item) => item.labelKo)).toEqual([
      "콘티 작업 중",
      "선화 집중",
      "채색·배경",
      "검수 요청",
      "잠시 휴식",
    ]);

    render(<WorkStatusHarness />);
    const inkingBtn = screen.getByTestId("work-status-btn-inking");
    fireEvent.click(inkingBtn);
    expect(inkingBtn.getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem(STUDIO_WEBTOON_WORK_STATUS_STORAGE_KEY)).toBe("inking");
    expect(readStudioWebtoonWorkStatus()).toBe("inking");

    // 언마운트 후 새로고침(재마운트)에도 상태가 유지된다.
    cleanup();
    render(<WorkStatusHarness />);
    expect(screen.getByTestId("work-status-btn-inking").getAttribute("aria-pressed")).toBe("true");
  });

  it("2D 이름표(dot 색 포함)·3D 아바타 배지·로스터 SpaceSelfCard에 업무 상태를 일관되게 반영한다", () => {
    for (const status of STUDIO_WEBTOON_WORK_STATUSES) {
      const labelKo = studioUserStatusLabel("available", "available", "ko", status.id);
      expect(labelKo).toBe(`${status.glyph} ${status.labelKo}`);
      expect(office2dStatusDotColor(labelKo)).not.toBeNull();
    }

    // 회의 중·발표 중 긴급 상태가 업무 상태보다 우선한다.
    expect(studioUserStatusLabel("in-meeting", "available", "ko", "inking")).toContain("회의 중");

    const baseState = studioVirtualSpaceState({ x: 320, y: 240 }, "down", "available", false, 0);
    const workLabel = formatStudioWebtoonWorkStatusBadge("coloring-bg", "ko");
    expect(
      formatParticipantOverlayBadge(baseState, false, "3D 아바타", "3D Avatar", {
        workStatusLabel: workLabel,
      }).sublabel,
    ).toBe("🎨 채색·배경");

    writeStudioWebtoonWorkStatus("review-request");
    render(
      <SpaceSelfCard
        identity="self:1"
        name="아틀리에작가"
        self={baseState}
        zoneLabelKo="작화실"
        zoneLabelEn="Drawing bay"
        onEditCharacter={vi.fn()}
      />,
    );
    expect(screen.getByTestId("space-self-card-work-status").textContent).toContain("검수 요청");
  });
});

describe("집중 스프린트 완료 체크 · OKLCH 축하 리본 · Web Audio 차임", () => {
  it("진행 중 집중 세션을 즉시 완료하면 누적 횟수가 증가하고 휴식 구간으로 전이한다", () => {
    const running = startStudioFocusSession(createStudioFocusSession(), 10_000);
    const completed = completeStudioFocusSessionNow(running, 12_000);
    expect(completed.phase).toBe("break");
    expect(completed.completedCount).toBe(1);
    expect(completed.endsAt).toBeGreaterThan(12_000);
  });

  it("축하 리본을 접근성 status 영역으로 표시하고 닫기 버튼으로 해제한다", () => {
    const onDismiss = vi.fn();
    const event = createStudioCelebrationEvent({
      kind: "focus-sprint",
      completedCount: 2,
      workStatusId: "inking",
    });
    render(<SpaceCelebrationRibbon event={event} onDismiss={onDismiss} />);
    const ribbon = screen.getByTestId("space-celebration-ribbon");
    expect(ribbon.getAttribute("role")).toBe("status");
    expect(ribbon.textContent).toContain("집중 스프린트 완료");
    expect(ribbon.textContent).toContain("선화 집중");

    fireEvent.click(screen.getByRole("button", { name: "축하 안내 닫기" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("Web Audio 완료 차임은 음소거를 존중하고 reduced-motion 시 단음으로 완화한다", () => {
    const createdOscillators: number[] = [];
    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      createOscillator() {
        createdOscillators.push(1);
        return {
          type: "sine",
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
      }
      createGain() {
        return {
          gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
        };
      }
      close = vi.fn(() => Promise.resolve());
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);

    expect(playStudioCelebrationChime({ muted: true, reducedMotion: false })).toBe(false);
    expect(createdOscillators).toHaveLength(0);

    expect(playStudioCelebrationChime({ muted: false, reducedMotion: true })).toBe(true);
    expect(createdOscillators).toHaveLength(1);

    createdOscillators.length = 0;
    expect(playStudioCelebrationChime({ muted: false, reducedMotion: false })).toBe(true);
    expect(createdOscillators).toHaveLength(4);
    vi.unstubAllGlobals();
  });

  it("업무 상태·축하 리본 CSS가 OKLCH 토큰·44px 터치 타깃·reduced-motion·금지 모션 0건을 지킨다", () => {
    expect(workStatusCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(workStatusCss).not.toMatch(/transition-all/u);
    expect(workStatusCss).not.toMatch(/animate-(?:bounce|ping|spin)/u);
    expect(workStatusCss).toContain("oklch(");
    expect(workStatusCss).toContain("min-height: 44px");
    expect(workStatusCss).toContain("font-variant-numeric: tabular-nums");
    expect(workStatusCss).toContain("word-break: keep-all");
    expect(workStatusCss).toContain("prefers-reduced-motion: reduce");
    expect(workStatusCss).toContain("width: max-content;");
    expect(workStatusCss).toContain("flex-wrap: wrap;");
    expect(workStatusCss).not.toContain("overflow-x: auto;");
  });

  it("업무 상태 칩과 25분 집중·공정 체크 버튼이 줄바꿈·축소 없이 완전한 글자를 유지한다", () => {
    render(<WorkStatusHarness />);
    for (const status of STUDIO_WEBTOON_WORK_STATUSES) {
      const chip = screen.getByTestId(`work-status-btn-${status.id}`);
      expect(chip.className).toContain("shrink-0");
      expect(chip.className).toContain("whitespace-nowrap");
    }
    const focusBtn = screen.getByTestId("space-focus-sprint-btn");
    const milestoneBtn = screen.getByTestId("space-milestone-check-btn");
    expect(focusBtn.textContent).toContain("25분 집중");
    expect(focusBtn.className).toContain("shrink-0");
    expect(focusBtn.className).toContain("whitespace-nowrap");
    expect(milestoneBtn.textContent).toContain("공정 체크");
    expect(milestoneBtn.className).toContain("shrink-0");
    expect(milestoneBtn.className).toContain("whitespace-nowrap");
  });
});

describe("감사 발견 결함 수정 회귀 검증", () => {
  it("12종 오피스 직군 프리셋 적용 시 기존 아바타 액세서리가 있어도 2D 프로파일에 즉시 반영된다", () => {
    expect(STUDIO_VIRTUAL_CHARACTER_PRESETS).toHaveLength(12);
    writeStudioVirtualAvatarProfile({
      ...studioVirtualAvatarProfile("artist"),
      accessory: "headphones",
      outfitStyle: "hoodie",
    });
    const source = createOffice2dAvatarProfileSource();
    try {
      expect(source.get()?.accessory).toBe("headphones");
      const mvp = STUDIO_VIRTUAL_CHARACTER_PRESETS.find((preset) => preset.id === "deadline-mvp");
      expect(mvp).toBeDefined();
      writeStudioVirtualCharacterCustomization(mvp!.customization);
      expect(source.get()?.accessory).toBe("crown");
    } finally {
      source.dispose();
    }
  });

  it("비모달 데스크톱 SpacePopover도 Escape 키로 닫힌다", () => {
    const onClose = vi.fn();
    render(
      <SpacePopover open sheet={false} title="같이 작업하기" onClose={onClose}>
        <button type="button">요청 보내기</button>
      </SpacePopover>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("SpaceCursorChatOverlay가 열린 상태에서 비활성화되면 입력 상태(typing)를 안전하게 해제한다", () => {
    const onTypingChange = vi.fn();
    const { rerender } = render(
      <SpaceCursorChatOverlay enabled onSend={vi.fn()} onTypingChange={onTypingChange} />,
    );
    fireEvent.keyDown(window, { key: "/" });
    expect(screen.getByTestId("space-cursor-chat-input")).toBeTruthy();
    expect(onTypingChange).toHaveBeenLastCalledWith(true);

    rerender(<SpaceCursorChatOverlay enabled={false} onSend={vi.fn()} onTypingChange={onTypingChange} />);
    expect(screen.queryByTestId("space-cursor-chat-input")).toBeNull();
    expect(onTypingChange).toHaveBeenLastCalledWith(false);
  });

  it("2D↔3D 공간 음향 음소거 상태가 단일 저장소와 3D HUD 토글 버튼으로 동기화된다", () => {
    render(<SoundMuteHarness />);
    const soundBtn = screen.getByTestId("three-toggle-sound-btn");
    expect(soundBtn.getAttribute("aria-pressed")).toBe("true");
    expect(readOffice2dSoundMuted()).toBe(false);

    fireEvent.click(soundBtn);
    expect(readOffice2dSoundMuted()).toBe(true);
    expect(soundBtn.getAttribute("aria-pressed")).toBe("false");

    act(() => {
      setStudioSpaceSoundMuted(false);
    });
    expect(soundBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("화이트보드는 React StrictMode에서도 한 번의 드래그로 획을 정확히 1회만 커밋한다", () => {
    const onStroke = vi.fn();
    render(
      <StrictMode>
        <StudioVirtualSpaceWhiteboard
          snapshot={{ available: true, canEdit: true, entities: [], readyPeerIds: [] }}
          selfSessionId="self:1"
          authorNameOf={() => "나"}
          onStroke={onStroke}
          onNote={vi.fn(() => "note-1")}
          onRemove={vi.fn()}
          onClearOwn={vi.fn()}
        />
      </StrictMode>,
    );
    const svg = screen.getByRole("img", { name: "직접 그리는 공유 보드" });
    Object.defineProperty(svg, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 500, height: 300, right: 500, bottom: 300 }),
    });
    Object.defineProperty(svg, "setPointerCapture", { value: vi.fn() });
    Object.defineProperty(svg, "hasPointerCapture", { value: vi.fn(() => true) });
    Object.defineProperty(svg, "releasePointerCapture", { value: vi.fn() });

    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 160, clientY: 120 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 160, clientY: 120 });
    expect(onStroke).toHaveBeenCalledTimes(1);
  });
});
