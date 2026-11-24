import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioFootstepEvent } from "./studio-virtual-space-footsteps";
import { acquireStudioHuddleAudioFocus } from "../live/huddle/studio-p2p-huddle-audio-focus";
import {
  StudioVirtualSpaceSoundEngine,
  computeAirAbsorptionCutoffHz,
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

function fixture(options: {
  state?: string;
  reducedMotion?: boolean;
  withSpatialNodes?: boolean;
} = {}) {
  const gains: Array<{ gain: FakeParam; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  const oscillators: Array<{ type: string; frequency: FakeParam; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  const sources: Array<{ buffer: unknown; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  const filters: Array<{ type: string; frequency: FakeParam; Q: FakeParam }> = [];
  const panners: Array<{ pan: FakeParam }> = [];
  const convolvers: Array<{ buffer: unknown; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  const buffers: Array<{ channels: number; data: Float32Array[] }> = [];
  let now = 0;

  const context = {
    state: options.state ?? "running",
    currentTime: 2,
    sampleRate: 8000,
    destination: {},
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createGain: () => {
      const gain = { gain: fakeParam(), connect: vi.fn((node: unknown) => node), disconnect: vi.fn() };
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
    createBuffer: (channels: number, length: number, sampleRate: number) => {
      const channelData = Array.from({ length: channels }, () => new Float32Array(length));
      buffers.push({ channels, data: channelData });
      return {
        sampleRate,
        numberOfChannels: channels,
        getChannelData: (ch: number) => channelData[ch] ?? channelData[0]!,
      };
    },
    ...(options.withSpatialNodes
      ? {
          createStereoPanner: () => {
            const panner = { pan: fakeParam(), connect: vi.fn((node: unknown) => node) };
            panners.push(panner);
            return panner;
          },
          createConvolver: () => {
            const convolver = {
              buffer: null as unknown,
              connect: vi.fn((node: unknown) => node),
              disconnect: vi.fn(),
            };
            convolvers.push(convolver);
            return convolver;
          },
        }
      : {}),
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
    panners,
    convolvers,
    buffers,
    setNow: (value: number) => { now = value; },
  };
}

const step: StudioFootstepEvent = { foot: "left", volume: 0.6, surface: "wood" };

describe("StudioVirtualSpaceSoundEngine", () => {
  afterEach(() => registerStudioSoundEngine(null));

  it("발소리는 2단계(뒤꿈치→발바닥 구름) 주 노이즈 + 3단계 미세 스침 + 댐핑 바닥 톤을 합성하고 볼륨에 비례한다", () => {
    const f = fixture();
    f.engine.playFootstep(step);
    // 주 임팩트·발바닥 구름(1) + 미세 스침(1) = 2 버퍼소스
    expect(f.sources).toHaveLength(2);
    expect(f.sources[0]!.start).toHaveBeenCalledOnce();
    expect(f.sources[1]!.start).toHaveBeenCalledOnce();
    expect(f.filters[0]!.type).toBe("bandpass");
    expect(f.oscillators).toHaveLength(1); // 나무 마루 댐핑 공명 톤
    // 마스터(0.7) 아래 주 노이즈 게인의 1단계 뒤꿈치 피크 = 0.6 × 0.5 × 0.68
    const noiseGain = f.gains[1]!;
    expect(noiseGain.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
      1,
      expect.closeTo(0.6 * 0.5 * 0.68, 5),
      expect.any(Number),
    );
    // 2단계 발바닥 구름 피크가 2번째 linearRamp로 이어진다.
    expect(noiseGain.gain.linearRampToValueAtTime).toHaveBeenCalledTimes(2);
    // 3종 물리 성형 노이즈 버퍼(pink·brown·grit)가 서로 다른 파형으로 캐시된다.
    expect(f.buffers).toHaveLength(3);
    expect(f.sources[0]!.buffer).not.toBe(f.sources[1]!.buffer);
    f.engine.dispose();
  });

  it("카펫 발소리는 톤 없이 저역 섬유질 필터와 미세 패브릭 스침만 쓴다", () => {
    const f = fixture();
    f.engine.playFootstep({ foot: "right", volume: 0.3, surface: "carpet" });
    expect(f.filters[0]!.type).toBe("lowpass");
    expect(f.oscillators).toHaveLength(0);
    expect(f.sources).toHaveLength(2);
    f.engine.dispose();
  });

  it("발소리 스로틀과 라운드-로빈 피치 미세 지터: 연속 걸음 간격을 지키고 매 걸음 미세하게 변주한다", () => {
    const f = fixture();
    f.engine.playFootstep(step);
    f.setNow(50);
    f.engine.playFootstep(step);
    expect(f.sources).toHaveLength(2); // 80ms 스로틀 내 무시
    f.setNow(100);
    f.engine.playFootstep(step);
    expect(f.sources).toHaveLength(4);
    // 같은 왼발 나무 걸음이라도 라운드-로빈 지터로 주파수가 미세하게 다르다.
    const firstHz = f.oscillators[0]!.frequency.setValueAtTime.mock.calls[0]![0] as number;
    const secondHz = f.oscillators[1]!.frequency.setValueAtTime.mock.calls[0]![0] as number;
    expect(firstHz).not.toBe(secondHz);
    f.engine.dispose();
  });

  it("공간 음향: 왼발/오른발 스테레오 패닝, 거리 기반 공기 흡음 로우패스, 경량 실내 초기반사 Convolver를 연결한다", () => {
    expect(computeAirAbsorptionCutoffHz(1)).toBe(8000);
    expect(computeAirAbsorptionCutoffHz(0.5)).toBeLessThan(5500);
    expect(computeAirAbsorptionCutoffHz(0.1)).toBeLessThan(2500);

    const f = fixture({ withSpatialNodes: true });
    f.engine.playFootstep({ foot: "left", volume: 0.7, surface: "wood" });
    f.setNow(120);
    f.engine.playFootstep({ foot: "right", volume: 0.7, surface: "wood" });

    // 경량 실내 초기반사 ConvolverNode가 1회 초기화되고 임펄스 버퍼가 할당된다.
    expect(f.convolvers).toHaveLength(1);
    expect(f.convolvers[0]!.buffer).not.toBeNull();

    // 왼발은 음수(좌), 오른발은 양수(우) 스테레오 패닝이 적용된다.
    const leftPan = f.panners[0]!.pan.setValueAtTime.mock.calls[0]![0] as number;
    const rightPan = f.panners[1]!.pan.setValueAtTime.mock.calls[0]![0] as number;
    expect(leftPan).toBeLessThan(0);
    expect(rightPan).toBeGreaterThan(0);

    // 먼 거리의 피어 SFX는 공기 흡음 로우패스 필터가 낮은 컷오프로 삽입된다.
    const filtersBefore = f.filters.length;
    f.engine.playSfx("peer-join", 0.25, 0.4);
    const airFilter = f.filters[filtersBefore]!;
    expect(airFilter.type).toBe("lowpass");
    const cutoffHz = airFilter.frequency.setValueAtTime.mock.calls[0]![0] as number;
    expect(cutoffHz).toBeCloseTo(computeAirAbsorptionCutoffHz(0.25), 0);

    f.engine.dispose();
    expect(f.convolvers[0]!.disconnect).toHaveBeenCalledOnce();
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
    expect(f.sources).toHaveLength(3); // 발소리 2(임팩트·구름 + 미세 스침) + 이모트 펠트 노이즈 1
    expect(f.oscillators).toHaveLength(2); // 발소리 톤 1 + 이모트 1
    registerStudioSoundEngine(null);
    playStudioSfxSound("emote", 1);
    expect(f.oscillators).toHaveLength(2);
    f.engine.dispose();
  });

  it("회의 입퇴장 시 재생 중인 효과음도 낮추고 사용자 음량과 음소거를 보존한다", () => {
    const f = fixture();
    f.engine.unlock();
    const master = f.gains[0]?.gain;
    expect(master?.value).toBe(0.7);
    const release = acquireStudioHuddleAudioFocus();
    try {
      expect(master?.setTargetAtTime).toHaveBeenLastCalledWith(expect.closeTo(0.105), 2, expect.any(Number));
      f.engine.setPreference({ effectsEnabled: true, effectsVolume: 0.4 });
      expect(master?.setTargetAtTime).toHaveBeenLastCalledWith(expect.closeTo(0.06), 2, expect.any(Number));
      f.engine.setPreference({ effectsEnabled: false, effectsVolume: 0.4 });
      expect(master?.setTargetAtTime).toHaveBeenLastCalledWith(0, 2, expect.any(Number));
      release();
      expect(master?.setTargetAtTime).toHaveBeenLastCalledWith(0, 2, expect.any(Number));
      f.engine.setPreference({ effectsEnabled: true, effectsVolume: 0.4 });
      expect(master?.setTargetAtTime).toHaveBeenLastCalledWith(0.4, 2, expect.any(Number));
    } finally { release(); f.engine.dispose(); }
  });

  it("회의 중 생성한 엔진도 처음부터 감쇠하며 마지막 회의 종료 때만 복귀한다", () => {
    const releaseFirst = acquireStudioHuddleAudioFocus();
    const releaseSecond = acquireStudioHuddleAudioFocus();
    const f = fixture();
    try {
      expect(f.gains).toHaveLength(0);
      f.engine.unlock();
      expect(f.gains[0]?.gain.value).toBeCloseTo(0.105);
      releaseFirst();
      expect(f.gains[0]?.gain.setTargetAtTime).not.toHaveBeenCalled();
      releaseSecond();
      expect(f.gains[0]?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.7, 2, expect.any(Number));
      f.engine.dispose();
      const calls = f.gains[0]?.gain.setTargetAtTime.mock.calls.length;
      const releaseAfterDispose = acquireStudioHuddleAudioFocus();
      releaseAfterDispose();
      expect(f.gains[0]?.gain.setTargetAtTime.mock.calls.length).toBe(calls);
    } finally { releaseFirst(); releaseSecond(); f.engine.dispose(); }
  });
});
