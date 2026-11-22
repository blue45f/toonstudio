// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualOfficeSpatialCanvasHud } from "./StudioVirtualOfficeSpatialCanvasHud";
import { StudioVirtualSpacePomodoroRoomBar } from "./StudioVirtualSpacePomodoroRoomBar";
import { StudioVirtualAmbientAudioController } from "./studio-virtual-space-ambient-audio";
import {
  POMODORO_BREAK_DURATION_MS,
  POMODORO_CYCLE_MS,
  POMODORO_FOCUS_DURATION_MS,
  STUDIO_AMBIENT_AUDIO_MAX_GAIN,
  VIRTUAL_SPACE_DEFAULT_ROOM_MODE,
  clampAmbientAudioGain,
  computePomodoroProgressRing,
  computeVirtualSpaceHudSafeOffset,
  createVirtualSpaceSeatStatusMap,
  detectPomodoroRoomBellTransition,
  evaluatePomodoroRoomClock,
  formatPomodoroSolidaritySummary,
  getVirtualSpaceSeatStatus,
  playPomodoroRoomBellChime,
  resolveDaylightLinkedAmbience,
  resolveSilentTabletDrawingMotion,
  setVirtualSpaceSeatStatus,
  toggleVirtualSpaceSeatStatus,
} from "./virtual-space-pomodoro-room";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const HOUR_BASE_MS = Date.UTC(2026, 10, 22, 10, 0, 0);

describe("virtual-space-pomodoro-room pure contracts (#036–#039)", () => {
  it("₩0 로컬 시계 동기화: 동일 시각 기준 50분 무음 작화와 10분 자동 휴식 벨을 결정론적으로 계산한다", () => {
    const startSnap = evaluatePomodoroRoomClock(HOUR_BASE_MS);
    expect(startSnap.roomMode).toBe(VIRTUAL_SPACE_DEFAULT_ROOM_MODE);
    expect(startSnap.phase).toBe("silent-drawing");
    expect(startSnap.clockLabel).toBe("50:00");
    expect(startSnap.progress).toBe(0);
    expect(startSnap.micRequired).toBe(false);
    expect(startSnap.nextBellAtMs).toBe(HOUR_BASE_MS + POMODORO_FOCUS_DURATION_MS);

    const midFocus = evaluatePomodoroRoomClock(HOUR_BASE_MS + 25 * 60_000);
    expect(midFocus.phase).toBe("silent-drawing");
    expect(midFocus.clockLabel).toBe("25:00");
    expect(midFocus.progress).toBeCloseTo(0.5, 4);

    const breakStart = evaluatePomodoroRoomClock(HOUR_BASE_MS + POMODORO_FOCUS_DURATION_MS);
    expect(breakStart.phase).toBe("break-bell");
    expect(breakStart.clockLabel).toBe("10:00");
    expect(breakStart.progress).toBe(0);
    expect(breakStart.micRequired).toBe(false);
    expect(breakStart.nextBellAtMs).toBe(HOUR_BASE_MS + POMODORO_CYCLE_MS);

    const breakMid = evaluatePomodoroRoomClock(
      HOUR_BASE_MS + POMODORO_FOCUS_DURATION_MS + POMODORO_BREAK_DURATION_MS / 2,
    );
    expect(breakMid.phase).toBe("break-bell");
    expect(breakMid.clockLabel).toBe("05:00");
    expect(breakMid.progress).toBeCloseTo(0.5, 4);

    // 서로 다른 기기라도 동일 epoch 시각이면 사이클·남은 시간이 완전히 일치한다.
    expect(evaluatePomodoroRoomClock(HOUR_BASE_MS + 123_456)).toEqual(
      evaluatePomodoroRoomClock(HOUR_BASE_MS + 123_456),
    );
  });

  it("50분 무음 작화 → 10분 휴식 벨 / 휴식 종료 → 재개 경계 전이를 정확히 감지한다", () => {
    const beforeBreak = HOUR_BASE_MS + POMODORO_FOCUS_DURATION_MS - 1_000;
    const atBreak = HOUR_BASE_MS + POMODORO_FOCUS_DURATION_MS;
    const breakEvent = detectPomodoroRoomBellTransition(beforeBreak, atBreak);
    expect(breakEvent?.kind).toBe("break-start");
    expect(breakEvent?.messageKo).toContain("10분 휴식 벨");

    const beforeResume = HOUR_BASE_MS + POMODORO_CYCLE_MS - 1_000;
    const atResume = HOUR_BASE_MS + POMODORO_CYCLE_MS;
    const resumeEvent = detectPomodoroRoomBellTransition(beforeResume, atResume);
    expect(resumeEvent?.kind).toBe("focus-resume");
    expect(resumeEvent?.messageKo).toContain("50분 무음 작화");

    expect(detectPomodoroRoomBellTransition(HOUR_BASE_MS, HOUR_BASE_MS + 10_000)).toBeNull();
    expect(detectPomodoroRoomBellTransition(atBreak, beforeBreak)).toBeNull();
  });

  it("진행률 링 기하 계산기와 옵트인 휴식 벨 차임(게인 <= 0.25 클램프·reducedMotion)을 검증한다", () => {
    const zeroRing = computePomodoroProgressRing(-0.2);
    expect(zeroRing.percent).toBe(0);
    expect(zeroRing.strokeDashoffset).toBe(zeroRing.circumference);

    const halfRing = computePomodoroProgressRing(0.5);
    expect(halfRing.percent).toBe(50);
    expect(halfRing.strokeDashoffset).toBeCloseTo(halfRing.circumference / 2, 1);

    const fullRing = computePomodoroProgressRing(1.8);
    expect(fullRing.percent).toBe(100);
    expect(fullRing.strokeDashoffset).toBe(0);

    // 기본 OFF에서는 재생하지 않는다.
    expect(playPomodoroRoomBellChime()).toBe(false);

    const linearRampCalls: number[] = [];
    const oscStarts: number[] = [];
    const fakeContext = {
      currentTime: 0,
      destination: {},
      close: vi.fn(async () => undefined),
      createOscillator: () => ({
        type: "sine",
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn((t: number) => oscStarts.push(t)),
        stop: vi.fn(),
      }),
      createGain: () => ({
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn((value: number) => linearRampCalls.push(value)),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      }),
    };

    expect(
      playPomodoroRoomBellChime({
        enabled: true,
        gain: 0.9,
        reducedMotion: false,
        createContext: () => fakeContext as unknown as AudioContext,
      }),
    ).toBe(true);
    expect(oscStarts).toHaveLength(2);
    expect(linearRampCalls.every((v) => v <= STUDIO_AMBIENT_AUDIO_MAX_GAIN)).toBe(true);

    oscStarts.length = 0;
    expect(
      playPomodoroRoomBellChime({
        enabled: true,
        gain: 0.5,
        reducedMotion: true,
        createContext: () => fakeContext as unknown as AudioContext,
      }),
    ).toBe(true);
    expect(oscStarts).toHaveLength(1);
  });

  it("무음 타블렛 작화 모션 상태는 마이크 강요 없이 본체 스케일 1.0과 reducedMotion 정지를 보장한다", () => {
    const activeMotion = resolveSilentTabletDrawingMotion({
      phase: "silent-drawing",
      seatStatus: "do-not-disturb",
      elapsedMs: 600,
      reducedMotion: false,
    });
    expect(activeMotion.micRequired).toBe(false);
    expect(activeMotion.micAutoMuted).toBe(true);
    expect(activeMotion.motionKind).toBe("silent-tablet-stroke");
    expect(activeMotion.bodyScale).toEqual({ scaleX: 1, scaleY: 1 });
    expect(Math.abs(activeMotion.stylusOffsetX)).toBeGreaterThan(0);

    const reduced = resolveSilentTabletDrawingMotion({
      phase: "silent-drawing",
      seatStatus: "do-not-disturb",
      elapsedMs: 600,
      reducedMotion: true,
    });
    expect(reduced.stylusOffsetX).toBe(0);
    expect(reduced.stylusOffsetY).toBe(0);
    expect(reduced.stylusCyclePhase).toBe(0);

    const breakMotion = resolveSilentTabletDrawingMotion({
      phase: "break-bell",
      seatStatus: "feedback-welcome",
      elapsedMs: 1200,
      userUnmutedMic: true,
    });
    expect(breakMotion.motionKind).toBe("rest-stretch-idle");
    expect(breakMotion.micAutoMuted).toBe(false);
    expect(formatPomodoroSolidaritySummary(4, "silent-drawing").ko).toContain("4명");
  });

  it("clampAmbientAudioGain은 0.25 상한을 절대 넘기지 않으며 24시간 자연광 연동 앰비언스는 기본 OFF다", () => {
    expect(clampAmbientAudioGain(-0.5)).toBe(0);
    expect(clampAmbientAudioGain(Number.NaN)).toBe(0);
    expect(clampAmbientAudioGain(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampAmbientAudioGain(0.16)).toBe(0.16);
    expect(clampAmbientAudioGain(0.25)).toBe(0.25);
    expect(clampAmbientAudioGain(0.2501)).toBe(0.25);
    expect(clampAmbientAudioGain(1.5)).toBe(0.25);

    const defaultOff = resolveDaylightLinkedAmbience({ hour: 10 });
    expect(defaultOff.enabled).toBe(false);
    expect(defaultOff.effectiveGain).toBe(0);
    expect(defaultOff.resolvedTrackId).toBe("synth-pencil-scratch");

    const nightOn = resolveDaylightLinkedAmbience({
      hour: 22.5,
      enabled: true,
      requestedGain: 0.95,
    });
    expect(nightOn.enabled).toBe(true);
    expect(nightOn.resolvedTrackId).toBe("synth-soft-rain");
    expect(nightOn.clampedUserGain).toBe(0.25);
    expect(nightOn.effectiveGain).toBeLessThanOrEqual(0.25);
    expect(nightOn.effectiveGain).toBeGreaterThan(0);

    const morningRainWeather = resolveDaylightLinkedAmbience({
      hour: 9,
      enabled: true,
      mode: "auto",
      weather: "rain",
      requestedGain: 0.8,
    });
    expect(morningRainWeather.resolvedTrackId).toBe("synth-soft-rain");
    expect(morningRainWeather.effectiveGain).toBeLessThanOrEqual(0.25);

    // 컨트롤러 maxGain 옵션과 함께 동작할 때도 GainNode 목표값이 0.25를 절대 초과하지 않는다.
    const setTargetAtTime = vi.fn();
    const fakeGain = { gain: { value: 0, cancelScheduledValues: vi.fn(), setTargetAtTime }, connect: vi.fn(), disconnect: vi.fn() };
    const fakeCtx = {
      currentTime: 2,
      destination: {},
      resume: vi.fn(async () => undefined),
      suspend: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      decodeAudioData: vi.fn(async () => ({ duration: 8, numberOfChannels: 2 })),
      createGain: () => fakeGain,
      createBufferSource: () => ({ start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), connect: vi.fn(), loop: false, buffer: null }),
    };
    const controller = new StudioVirtualAmbientAudioController(
      {
        createContext: () => fakeCtx as unknown as AudioContext,
        load: vi.fn(async () => new ArrayBuffer(1)),
        synthBuffer: () => ({ duration: 8, numberOfChannels: 2 } as unknown as AudioBuffer),
      },
      { maxGain: STUDIO_AMBIENT_AUDIO_MAX_GAIN, initialVolume: 0.8, initialTrackId: "synth-soft-rain" },
    );
    expect(controller.snapshot().volume).toBe(0.25);
    controller.setVolume(1);
    expect(controller.snapshot().volume).toBe(0.25);
    controller.dispose();
  });

  it("좌석별 2상태 토글 순수 맵이 '방해 금지'와 '피드백 환영' 상태를 독립 전환한다", () => {
    let statuses = createVirtualSpaceSeatStatusMap(["seat-a", "seat-b"]);
    expect(getVirtualSpaceSeatStatus(statuses, "seat-a")).toBe("do-not-disturb");
    expect(toggleVirtualSpaceSeatStatus("do-not-disturb")).toBe("feedback-welcome");
    statuses = setVirtualSpaceSeatStatus(statuses, "seat-a", "feedback-welcome");
    expect(getVirtualSpaceSeatStatus(statuses, "seat-a")).toBe("feedback-welcome");
    expect(getVirtualSpaceSeatStatus(statuses, "seat-b")).toBe("do-not-disturb");
  });
});

describe("computeVirtualSpaceHudSafeOffset (#040)", () => {
  it("모바일·태블릿 세로 화면에서 미니맵과 이동 조이스틱이 충돌하지 않도록 하단 세이프존을 확보한다", () => {
    const mobile = computeVirtualSpaceHudSafeOffset({
      viewportWidth: 390,
      viewportHeight: 844,
      safeAreaBottomPx: 34,
      joystickHandedness: "right",
    });
    expect(mobile.viewportClass).toBe("mobile");
    expect(mobile.isNarrowViewport).toBe(true);
    expect(mobile.joystickAvoidanceActive).toBe(true);
    expect(mobile.minimapHorizontalAnchor).toBe("left");
    expect(mobile.collisionFree).toBe(true);
    expect(mobile.clearancePx).toBeGreaterThanOrEqual(16);
    expect(mobile.minimapRect.bottom).toBeGreaterThanOrEqual(
      (mobile.joystickRect?.top ?? 0) + 16,
    );

    const tablet = computeVirtualSpaceHudSafeOffset({
      viewportWidth: 768,
      viewportHeight: 1024,
      joystickHandedness: "left",
    });
    expect(tablet.viewportClass).toBe("tablet-portrait");
    expect(tablet.minimapHorizontalAnchor).toBe("right");
    expect(tablet.collisionFree).toBe(true);
    expect(tablet.minimapBottomOffsetPx).toBeGreaterThan(tablet.joystickFootprintBottomPx);

    const desktop = computeVirtualSpaceHudSafeOffset({
      viewportWidth: 1440,
      viewportHeight: 900,
    });
    expect(desktop.viewportClass).toBe("desktop");
    expect(desktop.isNarrowViewport).toBe(false);
    expect(desktop.joystickAvoidanceActive).toBe(false);
    expect(desktop.collisionFree).toBe(true);
    expect(desktop.minimapBottomOffsetPx).toBe(16);
  });

  it("초소형 320px 화면이나 비정상 입력값에서도 안전하게 비충돌 좌표를 계산한다", () => {
    const tiny = computeVirtualSpaceHudSafeOffset({
      viewportWidth: 320,
      viewportHeight: 568,
      joystickSizePx: 96,
      safeAreaBottomPx: -10,
      minGapPx: Number.NaN,
    });
    expect(tiny.collisionFree).toBe(true);
    expect(tiny.minimapBottomOffsetPx).toBeGreaterThanOrEqual(tiny.joystickFootprintBottomPx + 16);
  });
});

describe("StudioVirtualSpacePomodoroRoomBar & StudioVirtualOfficeSpatialCanvasHud UI/접근성", () => {
  it("포모도로 공동 마감실 타이머·자동 휴식 벨 알림·좌석별 2상태 토글(44px 히트·reduced-motion)을 렌더링한다", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem");
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    const seats = [
      { seatId: "seat-self", labelKo: "내 작화석", labelEn: "My desk", isSelf: true },
      { seatId: "seat-peer", labelKo: "선화 동료석", labelEn: "Line artist desk" },
    ] as const;

    const { rerender } = render(
      <StudioVirtualSpacePomodoroRoomBar
        seats={seats}
        nowMs={HOUR_BASE_MS + POMODORO_FOCUS_DURATION_MS - 1_000}
        reducedMotion
      />,
    );

    expect(screen.getByTestId("pomodoro-room-phase-label").textContent).toBe("50분 무음 작화");
    expect(screen.getByTestId("pomodoro-room-clock").textContent).toBe("00:01");
    expect(screen.getByTestId("studio-vspace-pomodoro-room-bar").getAttribute("data-mic-required")).toBe(
      "false",
    );
    expect(screen.getByTestId("pomodoro-room-progress-ring").getAttribute("role")).toBe("progressbar");

    const selfDndBtn = screen.getByTestId("seat-status-seat-self-do-not-disturb");
    const selfFeedbackBtn = screen.getByTestId("seat-status-seat-self-feedback-welcome");
    const peerDndBtn = screen.getByTestId("seat-status-seat-peer-do-not-disturb");

    expect(selfDndBtn.textContent).toBe("방해 금지");
    expect(selfFeedbackBtn.textContent).toBe("피드백 환영");
    expect(selfDndBtn.getAttribute("aria-pressed")).toBe("true");
    expect(selfFeedbackBtn.getAttribute("aria-pressed")).toBe("false");
    for (const btn of [selfDndBtn, selfFeedbackBtn, peerDndBtn]) {
      expect(btn.className).toContain("min-h-11");
      expect(btn.className).toContain("min-w-11");
      expect(btn.className).toContain("motion-reduce:transition-none");
    }

    fireEvent.click(selfFeedbackBtn);
    expect(selfFeedbackBtn.getAttribute("aria-pressed")).toBe("true");
    expect(selfDndBtn.getAttribute("aria-pressed")).toBe("false");
    // 동료 좌석 상태는 영향받지 않는다.
    expect(peerDndBtn.getAttribute("aria-pressed")).toBe("true");

    // 50분 경계를 넘겨 10분 휴식 벨 알림으로 자동 전환
    rerender(
      <StudioVirtualSpacePomodoroRoomBar
        seats={seats}
        nowMs={HOUR_BASE_MS + POMODORO_FOCUS_DURATION_MS}
        reducedMotion
      />,
    );
    expect(screen.getByTestId("pomodoro-room-phase-label").textContent).toBe("10분 휴식 벨");
    expect(screen.getByTestId("pomodoro-room-clock").textContent).toBe("10:00");
    expect(screen.getByTestId("pomodoro-room-bell-notice").textContent).toContain("10분 휴식 벨");

    // 포모도로 공동 마감실은 브라우저 스토리지를 직접 호출하지 않는다.
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it("StudioVirtualOfficeSpatialCanvasHud가 좁은 화면 세이프존·prefers-reduced-motion·포모도로 좌석 토글을 통합 반영한다", () => {
    render(
      <StudioVirtualOfficeSpatialCanvasHud
        viewportWidth={390}
        viewportHeight={844}
        safeAreaBottomPx={34}
        joystickHandedness="right"
        reducedMotion
        pomodoroNowMs={HOUR_BASE_MS + 10 * 60_000}
      />,
    );

    const hud = screen.getByTestId("studio-virtual-office-spatial-canvas-hud");
    expect(hud.getAttribute("data-viewport-class")).toBe("mobile");
    expect(hud.getAttribute("data-joystick-collision-free")).toBe("true");
    expect(hud.getAttribute("data-minimap-anchor")).toBe("left");
    expect(hud.getAttribute("data-reduced-motion")).toBe("true");
    const safeOffsetPx = Number(hud.getAttribute("data-minimap-bottom-offset"));
    expect(safeOffsetPx).toBeGreaterThanOrEqual(210);
    expect(hud.style.paddingBottom).toBe(`${safeOffsetPx}px`);
    expect(screen.getByTestId("spatial-hud-mobile-safezone-banner")).toBeTruthy();

    // reducedMotion 시 3D 원근 회전과 트랜지션을 비활성화한다.
    const radarSvg = screen.getByTestId("spatial-floor-radar-svg");
    expect(radarSvg.style.transform).toBe("none");
    expect(radarSvg.style.transition).toBe("none");

    // 포모도로 공동 마감실 좌석 토글이 HUD 토스트와 연결된다.
    fireEvent.click(screen.getByTestId("seat-status-creator-self-feedback-welcome"));
    expect(screen.getByTestId("spatial-hud-toast").textContent).toContain("피드백 환영");
  });
});
