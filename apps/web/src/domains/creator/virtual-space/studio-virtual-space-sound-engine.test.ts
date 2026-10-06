import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioFootstepEvent } from "./studio-virtual-space-footsteps";
import {
  StudioVirtualSpaceSoundEngine,
  playStudioFootstepSound,
  playStudioSfxSound,
  registerStudioSoundEngine,
} from "./studio-virtual-space-sound-engine";

interface FakeParam {
  value: number;
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  setTargetAtTime: ReturnType<typeof vi.fn>;
}

function fakeParam(): FakeParam {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
}

function fixture(options: { state?: string; reducedMotion?: boolean } = {}) {
  const gains: Array<{ gain: FakeParam; connect: ReturnType<typeof vi.fn> }> = [];
  const oscillators: Array<{ type: string; frequency: FakeParam; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  const sources: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  const filters: Array<{ type: string; frequency: FakeParam; Q: FakeParam }> = [];
  let now = 0;
  const context = {
    state: options.state ?? "running",
    currentTime: 2,
    sampleRate: 8000,
    destination: {},
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createGain: () => {
      const gain = { gain: fakeParam(), connect: vi.fn() };
      gains.push(gain);
      return gain;
    },
    createBiquadFilter: () => {
      const filter = { type: "lowpass", frequency: fakeParam(), Q: fakeParam(), connect: vi.fn((node: unknown) => node) };
      filters.push(filter);
      return filter;
    },
    createOscillator: () => {
      const osc = { type: "sine", frequency: fakeParam(), connect: vi.fn((node: unknown) => node), start: vi.fn(), stop: vi.fn() };
      oscillators.push(osc);
      return osc;
    },
    createBufferSource: () => {
      const source = { buffer: null as unknown, loop: false, connect: vi.fn((node: unknown) => node), start: vi.fn(), stop: vi.fn() };
      sources.push(source);
      return source;
    },
    createBuffer: (_channels: number, length: number, sampleRate: number) => ({
      sampleRate,
      getChannelData: () => new Float32Array(length),
    }),
  };
  const engine = new StudioVirtualSpaceSoundEngine({
    createContext: vi.fn(() => context as unknown as AudioContext),
    now: () => now,
    prefersReducedMotion: () => options.reducedMotion ?? false,
  });
  return {
    engine,
    context,
    gains,
    oscillators,
    sources,
    filters,
    setNow: (value: number) => { now = value; },
  };
}

const step: StudioFootstepEvent = { foot: "left", volume: 0.6, surface: "wood" };

describe("StudioVirtualSpaceSoundEngine", () => {
  afterEach(() => registerStudioSoundEngine(null));

  it("발소리는 노이즈 버스트+표면 톤을 한 번씩 만들고 게인은 이벤트 볼륨에 비례한다", () => {
    const f = fixture();
    f.engine.playFootstep(step);
    expect(f.sources).toHaveLength(1);
    expect(f.sources[0]!.start).toHaveBeenCalledOnce();
    expect(f.filters[0]!.type).toBe("bandpass");
    expect(f.oscillators).toHaveLength(1); // 나무 노크 톤
    // 마스터(0.7) 아래 노이즈 게인 피크 = 이벤트 0.6 × 마스터 0.5 × 노이즈 0.7
    const noiseGain = f.gains[1]!;
    expect(noiseGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      expect.closeTo(0.6 * 0.5 * 0.7, 5), expect.any(Number),
    );
    f.engine.dispose();
  });

  it("카펫 발소리는 톤 없이 저역 필터만 쓴다", () => {
    const f = fixture();
    f.engine.playFootstep({ foot: "right", volume: 0.3, surface: "carpet" });
    expect(f.filters[0]!.type).toBe("lowpass");
    expect(f.oscillators).toHaveLength(0);
    f.engine.dispose();
  });

  it("발소리 스로틀: 최소 간격 안의 연속 걸음은 건너뛴다", () => {
    const f = fixture();
    f.engine.playFootstep(step);
    f.setNow(50);
    f.engine.playFootstep(step);
    expect(f.sources).toHaveLength(1);
    f.setNow(100);
    f.engine.playFootstep(step);
    expect(f.sources).toHaveLength(2);
    f.engine.dispose();
  });

  it("꺼짐·볼륨 0·reduced-motion·정지 컨텍스트에서는 재생하지 않는다", () => {
    const off = fixture();
    off.engine.setPreference({ effectsEnabled: false, effectsVolume: 0.7 });
    off.engine.playFootstep(step);
    off.engine.playSfx("activate");
    expect(off.sources).toHaveLength(0);
    expect(off.oscillators).toHaveLength(0);
    off.engine.dispose();

    const silent = fixture();
    silent.engine.setPreference({ effectsEnabled: true, effectsVolume: 0 });
    silent.engine.playSfx("emote");
    expect(silent.oscillators).toHaveLength(0);
    silent.engine.dispose();

    const reduced = fixture({ reducedMotion: true });
    reduced.engine.playFootstep(step);
    expect(reduced.sources).toHaveLength(0);
    reduced.engine.dispose();

    const suspended = fixture({ state: "suspended" });
    suspended.engine.playSfx("peer-join");
    expect(suspended.oscillators).toHaveLength(0);
    expect(suspended.context.resume).toHaveBeenCalled();
    suspended.engine.dispose();
  });

  it("SFX는 거리 게인이 0이면 침묵하고, 종류별 스로틀을 지킨다", () => {
    const f = fixture();
    f.engine.playSfx("peer-join", 0);
    expect(f.oscillators).toHaveLength(0);
    f.engine.playSfx("peer-join", 0.5);
    expect(f.oscillators).toHaveLength(2); // 입장 두 톤
    f.setNow(100);
    f.engine.playSfx("peer-join", 0.5);
    expect(f.oscillators).toHaveLength(2); // 400ms 스로틀
    f.setNow(500);
    f.engine.playSfx("peer-join", 0.5);
    expect(f.oscillators).toHaveLength(4);
    f.engine.dispose();
  });

  it("unlock은 제스처 안에서만 컨텍스트를 만들고, dispose 뒤에는 재생하지 않는다", () => {
    const f = fixture({ state: "suspended" });
    f.engine.unlock();
    expect(f.context.resume).toHaveBeenCalledOnce();
    f.engine.dispose();
    expect(f.context.close).toHaveBeenCalledOnce();
    f.engine.playSfx("activate");
    expect(f.oscillators).toHaveLength(0);
  });

  it("모듈 버스: 등록된 엔진으로만 전달되고 미등록이면 조용하다", () => {
    expect(() => playStudioFootstepSound(step)).not.toThrow();
    expect(() => playStudioSfxSound("emote")).not.toThrow();
    const f = fixture();
    registerStudioSoundEngine(f.engine);
    playStudioFootstepSound(step);
    playStudioSfxSound("emote", 1);
    expect(f.sources).toHaveLength(1);
    expect(f.oscillators).toHaveLength(2); // 발소리 톤 1 + 이모트 1
    registerStudioSoundEngine(null);
    playStudioSfxSound("emote", 1);
    expect(f.oscillators).toHaveLength(2);
    f.engine.dispose();
  });
});
