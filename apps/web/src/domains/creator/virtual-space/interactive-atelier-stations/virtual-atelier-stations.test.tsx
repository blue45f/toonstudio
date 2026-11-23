// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { StudioSpaceMapMenu } from "../StudioSpaceMapMenu";
import { VirtualAtelierInteractiveStationsPanel } from "./VirtualAtelierInteractiveStationsPanel";
import {
  ATELIER_FOOTSTEP_ORDER,
  AtelierProceduralAudioSynth,
  createInitialAtelierStationsState,
  reduceAtelierStationsState,
  resolveDefaultFootstepSurface,
} from "./virtual-atelier-stations-engine";

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
});

vi.setConfig({ testTimeout: 30000 });

interface MockAudioParam {
  value: number;
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
}

function createParam(): MockAudioParam {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

function createFakeAudioFixture(state: AudioContextState = "running") {
  const gains: Array<{ gain: MockAudioParam; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  const filters: Array<{ type: BiquadFilterType; frequency: MockAudioParam; Q: MockAudioParam; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  const oscillators: Array<{ type: OscillatorType; frequency: MockAudioParam; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null }> = [];
  const sources: Array<{ buffer: AudioBuffer | null; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null }> = [];

  const context = {
    state,
    currentTime: 1.5,
    sampleRate: 8000,
    destination: {},
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createGain: () => {
      const node = { gain: createParam(), connect: vi.fn(), disconnect: vi.fn() };
      gains.push(node);
      return node;
    },
    createBiquadFilter: () => {
      const node = { type: "lowpass" as BiquadFilterType, frequency: createParam(), Q: createParam(), connect: vi.fn(), disconnect: vi.fn() };
      filters.push(node);
      return node;
    },
    createOscillator: () => {
      const node = { type: "sine" as OscillatorType, frequency: createParam(), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
      oscillators.push(node);
      return node;
    },
    createBufferSource: () => {
      const node = { buffer: null as AudioBuffer | null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
      sources.push(node);
      return node;
    },
    createBuffer: (_channels: number, length: number, sampleRate: number) => ({
      sampleRate,
      getChannelData: () => new Float32Array(length),
    }),
  };

  return {
    context,
    factory: vi.fn(() => context as unknown as AudioContext),
    gains,
    filters,
    oscillators,
    sources,
  };
}

describe("virtual-atelier-stations-engine", () => {
  it("6종 상호작용 스테이션 상태 전이와 파티클·reducedMotion 억제를 정확히 처리한다", () => {
    let state = createInitialAtelierStationsState({ zoneId: "drawing" });
    expect(state.footstep.surface).toBe("hardwood");
    expect(resolveDefaultFootstepSurface("lounge")).toBe("tatami");
    expect(resolveDefaultFootstepSurface("lobby")).toBe("stone-courtyard");
    expect(resolveDefaultFootstepSurface("drawing", "rain")).toBe("rainy-rooftop");

    // ① 원목 이젤
    state = reduceAtelierStationsState(state, { type: "easel-pigment", pigment: "cobalt" });
    state = reduceAtelierStationsState(state, { type: "easel-stroke" });
    expect(state.easel).toEqual({ strokeCount: 1, pigment: "cobalt" });
    expect(state.particles).toHaveLength(5);
    expect(state.particles[0]?.kind).toBe("stroke-spark");
    expect(state.particles[0]?.tone).toBe("cool");

    // reducedMotion 시 파티클 0건
    state = reduceAtelierStationsState(state, { type: "easel-stroke", reducedMotion: true });
    expect(state.easel.strokeCount).toBe(2);
    expect(state.particles).toHaveLength(0);

    // ② 턴테이블
    state = reduceAtelierStationsState(state, { type: "turntable-toggle" });
    state = reduceAtelierStationsState(state, { type: "turntable-rpm" });
    state = reduceAtelierStationsState(state, { type: "turntable-track", track: "rain-jazz" });
    state = reduceAtelierStationsState(state, { type: "turntable-volume", volume: 130 });
    expect(state.turntable).toEqual({ playing: true, track: "rain-jazz", rpm: 45, volume: 100 });

    // ③ 3D 포즈 마네킹 받침대 회전 래핑
    state = reduceAtelierStationsState(state, { type: "mannequin-rotate", deltaDeg: -45 });
    expect(state.mannequin.angleDeg).toBe(315);
    state = reduceAtelierStationsState(state, { type: "mannequin-rotate", deltaDeg: 45 });
    expect(state.mannequin.angleDeg).toBe(0);
    state = reduceAtelierStationsState(state, { type: "mannequin-pose", pose: "action-leap" });
    expect(state.mannequin.pose).toBe("action-leap");

    // ④ 팀 수정 포스트잇 보드
    const initialCount = state.stickyBoard.notes.length;
    state = reduceAtelierStationsState(state, { type: "sticky-add", text: "컷4 그림자 정리" });
    expect(state.stickyBoard.notes).toHaveLength(initialCount + 1);
    const addedId = state.stickyBoard.notes[0]!.id;
    state = reduceAtelierStationsState(state, { type: "sticky-toggle", id: addedId });
    expect(state.stickyBoard.notes[0]?.resolved).toBe(true);
    state = reduceAtelierStationsState(state, { type: "sticky-clear-resolved" });
    expect(state.stickyBoard.notes.every((n) => !n.resolved)).toBe(true);

    // ⑤ 커피 · 뽀모도로 바
    state = reduceAtelierStationsState(state, { type: "coffee-brew", brew: "espresso" });
    state = reduceAtelierStationsState(state, { type: "coffee-phase", phase: "deep-50" });
    state = reduceAtelierStationsState(state, { type: "coffee-toggle-timer" });
    expect(state.coffeeBar).toEqual({
      brew: "espresso",
      cupsBrewed: 2,
      phase: "deep-50",
      running: true,
      remainingMinutes: 50,
    });

    // ⑥ 채광 · 시간대 디머
    state = reduceAtelierStationsState(state, { type: "lighting-preset", preset: "midnight-desk" });
    expect(state.lighting).toEqual({ preset: "midnight-desk", brightness: 36 });
    state = reduceAtelierStationsState(state, { type: "lighting-brightness", brightness: 5 });
    expect(state.lighting.brightness).toBe(20);
  });

  it("4종 바닥 재질 Web Audio 발걸음 합성과 onended .disconnect() · dispose() close() 정리를 완결한다", () => {
    const fixture = createFakeAudioFixture("suspended");
    const synth = new AtelierProceduralAudioSynth(fixture.factory);

    for (const surface of ATELIER_FOOTSTEP_ORDER) {
      expect(synth.playFootstep(surface, "left")).toBe(true);
    }
    expect(fixture.factory).toHaveBeenCalledOnce();
    expect(fixture.context.resume).toHaveBeenCalled();
    expect(fixture.sources).toHaveLength(4);
    expect(fixture.filters.map((f) => f.type)).toEqual(["bandpass", "lowpass", "bandpass", "bandpass"]);
    // hardwood(1) + tatami(1) + rainy-rooftop(2) + stone-courtyard(2) = 6 oscillators
    expect(fixture.oscillators).toHaveLength(6);

    // onended 콜백 실행 시 모든 노드가 disconnect된다.
    for (const src of fixture.sources) src.onended?.();
    for (const osc of fixture.oscillators) osc.onended?.();
    for (const src of fixture.sources) expect(src.disconnect).toHaveBeenCalledOnce();
    for (const filter of fixture.filters) expect(filter.disconnect).toHaveBeenCalledOnce();
    for (const osc of fixture.oscillators) expect(osc.disconnect).toHaveBeenCalledOnce();
    // master gain(gains[0])은 유지, 개별 보이스 gain(gains[1..])은 모두 해제
    expect(fixture.gains[0]!.disconnect).not.toHaveBeenCalled();
    for (const voiceGain of fixture.gains.slice(1)) {
      expect(voiceGain.disconnect).toHaveBeenCalledOnce();
    }

    // 추가 재생 후 dispose() 호출 시 활성 노드 + masterGain 해제 및 AudioContext.close() 실행
    expect(synth.playStationCue("easel")).toBe(true);
    const activeOsc = fixture.oscillators.at(-1)!;
    synth.dispose();
    expect(activeOsc.disconnect).toHaveBeenCalledOnce();
    expect(fixture.gains[0]!.disconnect).toHaveBeenCalledOnce();
    expect(fixture.context.close).toHaveBeenCalledOnce();
    expect(synth.playFootstep("hardwood", "right")).toBe(false);
  });

  it("AudioContext가 없는 환경(jsdom)에서도 오류 없이 안전하게 건너뛴다", () => {
    const synth = new AtelierProceduralAudioSynth(() => null);
    expect(synth.playFootstep("tatami", "left")).toBe(false);
    expect(synth.playStationCue("coffee-bar")).toBe(false);
    expect(() => synth.dispose()).not.toThrow();
  });
});

describe("VirtualAtelierInteractiveStationsPanel", () => {
  it("6종 스테이션 클릭, 4종 바닥 발걸음 음향·GPU 파티클, 언마운트 AudioContext.close()를 검증한다", () => {
    const fixture = createFakeAudioFixture();
    const { container, unmount } = render(
      <VirtualAtelierInteractiveStationsPanel currentZoneId="drawing" audioContextFactory={fixture.factory} />,
    );

    expect(container.querySelectorAll("[data-station]")).toHaveLength(6);
    expect(container.querySelectorAll("[data-surface]")).toHaveLength(4);

    // ① 이젤 획 스파크
    fireEvent.click(screen.getByRole("button", { name: "이젤 한 획 긋기 · 스파크" }));
    expect(screen.getByTestId("easel-stroke-count").textContent).toContain("1획");
    const sparks = container.querySelectorAll('[data-particle-kind="stroke-spark"]');
    expect(sparks).toHaveLength(5);
    expect((sparks[0] as HTMLElement).style.transform).toContain("translate3d(");

    // ② 턴테이블 재생
    fireEvent.click(screen.getByRole("button", { name: "턴테이블 재생" }));
    expect(screen.getByRole("button", { name: "턴테이블 멈춤" }).getAttribute("aria-pressed")).toBe("true");

    // ③ 3D 마네킹 +45° 회전
    fireEvent.click(screen.getByRole("button", { name: "시계 +45°" }));
    expect(screen.getByTestId("mannequin-angle").textContent).toBe("45°");

    // ④ 팀 수정 포스트잇 추가
    fireEvent.change(screen.getByLabelText("수정 포스트잇 내용"), { target: { value: "배경 톤 정리" } });
    fireEvent.click(screen.getByRole("button", { name: "붙이기" }));
    expect(screen.getByTestId("sticky-notes-list").textContent).toContain("배경 톤 정리");

    // ⑤ 커피 바 추출 + 뽀모도로 시작
    fireEvent.click(screen.getByRole("button", { name: "에스프레소" }));
    expect(screen.getByTestId("coffee-cup-count").textContent).toContain("2잔");

    // ⑥ 채광 디머 전환
    fireEvent.click(screen.getByRole("button", { name: "블루 더스크" }));
    expect(screen.getByTestId("lighting-brightness").textContent).toBe("56%");

    // 4종 바닥 발걸음 순회
    const stoneBtn = container.querySelector<HTMLButtonElement>('[data-surface="stone-courtyard"]')!;
    fireEvent.click(stoneBtn);
    expect(container.querySelectorAll('[data-particle-kind="stone-dust"]')).toHaveLength(5);
    expect(screen.getByTestId("footstep-step-button").textContent).toContain("1");

    // 효과음 뮤트 스위치 동작 확인
    const prevSourceCount = fixture.sources.length;
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByTestId("footstep-step-button"));
    expect(fixture.sources).toHaveLength(prevSourceCount);

    // 언마운트 시 AudioContext.close() 호출 보장
    unmount();
    expect(fixture.context.close).toHaveBeenCalledOnce();
  });

  it("reducedMotion에서는 파티클 DOM을 생성하지 않는다", () => {
    const { container } = render(<VirtualAtelierInteractiveStationsPanel reducedMotion />);
    expect(screen.getByTestId("virtual-atelier-stations-panel").getAttribute("data-reduced-motion")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "이젤 한 획 긋기 · 스파크" }));
    fireEvent.click(screen.getByTestId("footstep-step-button"));
    expect(screen.queryByTestId("atelier-particle-stage")).toBeNull();
    expect(container.querySelectorAll("[data-particle-kind]")).toHaveLength(0);
  });

  it("EN 로케일에서는 패널 텍스트·레이블에 한글이 0건이다", () => {
    act(() => {
      useI18n.getState().setLang("en");
    });
    const { container } = render(<VirtualAtelierInteractiveStationsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Draw Live Stroke · Spark" }));
    fireEvent.click(screen.getByRole("button", { name: "Pin" }));
    fireEvent.click(screen.getByTestId("footstep-step-button"));

    expect(/[가-힣]/u.test(container.textContent ?? "")).toBe(false);
    for (const el of container.querySelectorAll("[aria-label], [placeholder]")) {
      const label = el.getAttribute("aria-label") ?? "";
      const placeholder = el.getAttribute("placeholder") ?? "";
      expect(/[가-힣]/u.test(label)).toBe(false);
      expect(/[가-힣]/u.test(placeholder)).toBe(false);
    }
  });

  it("StudioSpaceMapMenu 하단에 자연스럽게 마운트된다", () => {
    render(<StudioSpaceMapMenu onTravel={vi.fn()} currentZoneId="lounge" weather="rain" />);
    expect(screen.getByTestId("virtual-atelier-stations-panel")).not.toBeNull();
    expect(screen.getByTestId("atelier-footstep-deck")).not.toBeNull();
  });

  it("소스 계약: 줄 수 예산, 브라우저 저장소 금지, 원시 hex/rgb 0건을 지킨다", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const engineSrc = readFileSync(resolve(dir, "virtual-atelier-stations-engine.ts"), "utf8");
    const panelSrc = readFileSync(resolve(dir, "VirtualAtelierInteractiveStationsPanel.tsx"), "utf8");

    expect(engineSrc.split("\n").length).toBeLessThanOrEqual(320);
    expect(panelSrc.split("\n").length).toBeLessThanOrEqual(360);

    for (const src of [engineSrc, panelSrc]) {
      expect(/\b(localStorage|sessionStorage|indexedDB)\b/u.test(src)).toBe(false);
      expect(/#[0-9a-fA-F]{3,8}\b/u.test(src)).toBe(false);
      expect(/\brgba?\(/u.test(src)).toBe(false);
    }
  });
});
