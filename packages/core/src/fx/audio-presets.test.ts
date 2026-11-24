// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as audioModule from "./audio";
import {
  BGM_PRESETS,
  SFX_NAMES,
  getAudioState,
  isBgmSuspended,
  isSfxName,
  nextUiSfxVariation,
  renderUiSfxRecipe,
  resetUiSfxVariationState,
  resumeBgmForContext,
  setBgmVolume,
  suspendBgmForContext,
  type SfxName,
} from "./audio";
import { resolveContextualClickSfx, useClickSfx } from "./hooks";

interface MockParam {
  value: number;
  setValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
}

function createMockParam(initial = 0): MockParam {
  return {
    value: initial,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
}

function createMockAudioContext(options: { withPanner?: boolean } = {}) {
  const oscillators: Array<{
    type: OscillatorType;
    frequency: MockParam;
    detune: MockParam;
    connectedTo: unknown[];
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }> = [];
  const sources: Array<{
    buffer: AudioBuffer | null;
    loop: boolean;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }> = [];
  const filters: Array<{
    type: BiquadFilterType;
    frequency: MockParam;
    Q: MockParam;
  }> = [];
  const buffers: Array<{ data: Float32Array; sampleRate: number }> = [];

  const ctx = {
    state: "running",
    currentTime: 1,
    sampleRate: 44100,
    destination: {},
    createGain: () => ({ gain: createMockParam(1), connect: vi.fn((dest: unknown) => dest) }),
    createBiquadFilter: () => {
      const f = {
        type: "lowpass" as BiquadFilterType,
        frequency: createMockParam(1000),
        Q: createMockParam(1),
        connect: vi.fn((dest: unknown) => dest),
      };
      filters.push(f);
      return f;
    },
    createOscillator: () => {
      const connectedTo: unknown[] = [];
      const osc = {
        type: "sine" as OscillatorType,
        frequency: createMockParam(440),
        detune: createMockParam(0),
        connectedTo,
        connect: vi.fn((dest: unknown) => {
          connectedTo.push(dest);
          return dest;
        }),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    },
    createBufferSource: () => {
      const src = {
        buffer: null as AudioBuffer | null,
        loop: false,
        connect: vi.fn((dest: unknown) => dest),
        start: vi.fn(),
        stop: vi.fn(),
      };
      sources.push(src);
      return src;
    },
    createBuffer: (_channels: number, frames: number, sampleRate: number) => {
      const data = new Float32Array(frames);
      buffers.push({ data, sampleRate });
      return { sampleRate, numberOfChannels: 1, getChannelData: () => data } as unknown as AudioBuffer;
    },
    ...(options.withPanner !== false
      ? {
          createStereoPanner: () => ({ pan: createMockParam(0), connect: vi.fn((dest: unknown) => dest) }),
        }
      : {}),
  } as unknown as AudioContext;

  return { ctx, output: ctx.createGain(), oscillators, sources, filters, buffers };
}

function makeEl(tag: string, attrs: Record<string, string> = {}, text = ""): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  if (text) el.textContent = text;
  return el;
}

describe("site-wide BGM presets", () => {
  it("offers a broad, unique theme catalog for page-aware soundscapes", () => {
    expect(BGM_PRESETS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(BGM_PRESETS.map((preset) => preset.id)).size).toBe(BGM_PRESETS.length);
    expect(new Set(BGM_PRESETS.map((preset) => preset.name)).size).toBe(BGM_PRESETS.length);
    for (const preset of BGM_PRESETS) {
      expect(preset.beatDuration).toBeGreaterThan(0);
      expect(preset.beatsPerBar).toBeGreaterThan(0);
      expect(typeof preset.schedule).toBe("function");
    }
  });

  it("keeps BGM volume independent and composes multiple suspension reasons", () => {
    setBgmVolume(0.32);
    expect(getAudioState().bgmVolume).toBe(0.32);

    suspendBgmForContext("audio-editor");
    suspendBgmForContext("live-call");
    expect(isBgmSuspended()).toBe(true);
    resumeBgmForContext("audio-editor");
    expect(isBgmSuspended()).toBe(true);
    resumeBgmForContext("live-call");
    expect(isBgmSuspended()).toBe(false);

    setBgmVolume(0.48);
  });

  it("includes subtle reading themes as well as energetic webtoon genres", () => {
    const ids = BGM_PRESETS.map((preset) => preset.id);
    expect(ids).toEqual(expect.arrayContaining([
      "atelier_focus",
      "library_night",
      "royal_waltz",
      "mystery_noir",
      "healing_walk",
      "worldbuilding",
      "battle",
      "citypop",
    ]));
  });
});

describe("물리 아틀리에 UI SFX 레시피", () => {
  beforeEach(() => resetUiSfxVariationState());
  afterEach(() => resetUiSfxVariationState());

  it("기존 10종 + 상황맞춤 확장 4종(총 14종)을 따뜻한 로우패스 댐핑으로 합성한다", () => {
    expect(SFX_NAMES).toEqual(
      expect.arrayContaining([
        "tick", "pop", "success", "error", "sparkle", "woosh", "open", "close", "tab", "heart",
        "toggle-on", "toggle-off", "confirm", "soft-warn",
      ]),
    );
    expect(isSfxName("toggle-on")).toBe(true);
    expect(isSfxName("soft-warn")).toBe(true);
    expect(isSfxName("unknown-sfx")).toBe(false);

    for (const name of SFX_NAMES) {
      const mock = createMockAudioContext();
      renderUiSfxRecipe(name, mock.ctx, mock.output, 1);
      expect(mock.sources.length + mock.oscillators.length, name).toBeGreaterThan(0);
      for (const osc of mock.oscillators) {
        const firstDest = osc.connectedTo[0] as { type?: string };
        expect(firstDest.type, name).toBe("lowpass");
      }
    }
  });

  it("woosh는 raw triangle 오실레이터를 제거하고 벨벳·종이 노이즈 밴드패스로만 합성한다", () => {
    const mock = createMockAudioContext();
    renderUiSfxRecipe("woosh", mock.ctx, mock.output, 1);
    expect(mock.oscillators).toHaveLength(0);
    expect(mock.sources).toHaveLength(2);
    expect(mock.filters.every((filter) => filter.type === "bandpass")).toBe(true);
    expect(mock.filters[0]!.frequency.exponentialRampToValueAtTime).toHaveBeenCalledTimes(2);
  });

  it("반복 클릭 시 라운드-로빈 ±2.5% 피치·±0.06 팬 미세 변주를 순환 적용한다", () => {
    const seenPitch = new Set<number>();
    const seenPan = new Set<number>();
    for (let i = 0; i < 8; i += 1) {
      const v = nextUiSfxVariation("tick");
      expect(v.pitchScale).toBeGreaterThanOrEqual(0.975);
      expect(v.pitchScale).toBeLessThanOrEqual(1.025);
      expect(v.panOffset).toBeGreaterThanOrEqual(-0.06);
      expect(v.panOffset).toBeLessThanOrEqual(0.06);
      seenPitch.add(v.pitchScale);
      seenPan.add(v.panOffset);
    }
    expect(seenPitch.size).toBeGreaterThanOrEqual(6);
    expect(seenPan.size).toBeGreaterThanOrEqual(6);

    resetUiSfxVariationState();
    const mock = createMockAudioContext();
    renderUiSfxRecipe("tick", mock.ctx, mock.output, 1);
    renderUiSfxRecipe("tick", mock.ctx, mock.output, 1.1);
    const firstHz = mock.oscillators[0]!.frequency.setValueAtTime.mock.calls[0]![0] as number;
    const secondHz = mock.oscillators[2]!.frequency.setValueAtTime.mock.calls[0]![0] as number;
    expect(firstHz).not.toBe(secondHz);
    expect(Math.abs(secondHz / firstHz - 1)).toBeLessThanOrEqual(0.06);
  });

  it("StereoPanner 미지원 AudioContext에서도 정상 합성하고 3종 성형 노이즈 버퍼를 재사용한다", () => {
    const mock = createMockAudioContext({ withPanner: false });
    const sampleNames: readonly SfxName[] = ["tick", "tab", "open", "close", "confirm", "soft-warn"];
    for (const name of sampleNames) {
      expect(() => renderUiSfxRecipe(name, mock.ctx, mock.output, 1)).not.toThrow();
    }
    expect(mock.buffers).toHaveLength(3);
  });
});

describe("resolveContextualClickSfx & useClickSfx", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T00:00:00Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("명시적 [data-sfx]를 최우선 존중하고 시맨틱 DOM 맥락을 자동 매핑한다", () => {
    expect(resolveContextualClickSfx(makeEl("button", { "data-sfx": "sparkle", "data-action": "delete" }, "삭제"))).toBe("sparkle");
    expect(resolveContextualClickSfx(makeEl("button", { role: "tab" }, "연재"))).toBe("tab");
    expect(resolveContextualClickSfx(makeEl("button", { role: "switch", "aria-checked": "false" }))).toBe("toggle-on");
    expect(resolveContextualClickSfx(makeEl("button", { role: "switch", "aria-checked": "true" }))).toBe("toggle-off");

    const checkboxOn = document.createElement("input");
    checkboxOn.type = "checkbox";
    checkboxOn.checked = true;
    expect(resolveContextualClickSfx(checkboxOn)).toBe("toggle-on");

    const checkboxOff = document.createElement("input");
    checkboxOff.type = "checkbox";
    checkboxOff.checked = false;
    expect(resolveContextualClickSfx(checkboxOff)).toBe("toggle-off");

    expect(resolveContextualClickSfx(makeEl("button", { "aria-label": "패널 닫기" }))).toBe("close");
    expect(resolveContextualClickSfx(makeEl("button", { "data-action": "cancel" }, "취소"))).toBe("close");
    expect(resolveContextualClickSfx(makeEl("button", { "aria-haspopup": "dialog" }, "설정"))).toBe("open");
    expect(resolveContextualClickSfx(makeEl("button", { "aria-label": "메뉴 열기" }))).toBe("open");
    expect(resolveContextualClickSfx(makeEl("button", { "data-action": "delete" }, "삭제"))).toBe("soft-warn");
    expect(resolveContextualClickSfx(makeEl("button", { "aria-label": "Remove layer" }))).toBe("soft-warn");
    expect(resolveContextualClickSfx(makeEl("button", { type: "submit" }, "전송"))).toBe("confirm");
    expect(resolveContextualClickSfx(makeEl("button", { "data-action": "save" }, "완료"))).toBe("confirm");
    expect(resolveContextualClickSfx(makeEl("button", { "aria-label": "좋아요" }))).toBe("heart");
    expect(resolveContextualClickSfx(makeEl("button", { type: "button" }, "다음 화"))).toBe("tick");
    expect(resolveContextualClickSfx(makeEl("button", { type: "button" }, "다음 화"), "pop")).toBe("pop");

    const longCardLink = makeEl(
      "a",
      { href: "/work/1" },
      "아주 긴 웹툰 제목이라 우연히 저장과 삭제와 메뉴 단어가 들어가도 일반 링크로 취급해야 한다",
    );
    expect(resolveContextualClickSfx(longCardLink)).toBe("tick");
  });

  it("useClickSfx가 클릭 맥락별 SFX를 재생하고 data-no-sfx·disabled·스로틀을 지킨다", () => {
    const playSpy = vi.spyOn(audioModule, "playSfx").mockImplementation(() => {});
    const resumeSpy = vi.spyOn(audioModule, "resumeAudio").mockResolvedValue(undefined);

    function Harness() {
      useClickSfx({ enabled: true });
      return createElement(
        "div",
        null,
        createElement("button", { type: "button", role: "tab" }, "추천"),
        createElement("button", { type: "button", role: "switch", "aria-checked": "false" }, "알림"),
        createElement("button", { type: "button", "aria-label": "창 닫기" }, "×"),
        createElement("button", { type: "button", "data-sfx": "sparkle" }, "축하"),
        createElement("button", { type: "button", "data-no-sfx": "" }, "무음"),
        createElement("button", { type: "button", disabled: true }, "비활성"),
      );
    }

    const { getByText } = render(createElement(Harness));
    act(() => {
      getByText("추천").click();
      vi.advanceTimersByTime(40);
      getByText("알림").click();
      vi.advanceTimersByTime(40);
      getByText("×").click();
      vi.advanceTimersByTime(40);
      getByText("축하").click();
      vi.advanceTimersByTime(40);
      getByText("무음").click();
      vi.advanceTimersByTime(40);
      getByText("비활성").click();
    });

    expect(resumeSpy).toHaveBeenCalledTimes(4);
    expect(playSpy.mock.calls.map((call) => call[0])).toEqual(["tab", "toggle-on", "close", "sparkle"]);
  });
});
