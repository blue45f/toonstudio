import { describe, expect, it, vi } from "vitest";
import { StudioVirtualAmbientAudioController, type StudioAmbientAudioDependencies } from "./studio-virtual-space-ambient-audio";

function fixture() {
  const sources: Array<{ start: ReturnType<typeof vi.fn>; loop: boolean; buffer: unknown }> = [];
  const gain = { gain: { value: 0, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
  const synthCalls: string[] = [];
  const synthAudioBuffer = { duration: 8, numberOfChannels: 2 };
  const context = {
    currentTime: 1,
    destination: {},
    resume: vi.fn(async () => undefined),
    suspend: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    decodeAudioData: vi.fn(async () => ({ duration: 45, numberOfChannels: 2 })),
    createGain: () => gain,
    createBufferSource: () => {
      const source = { start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), connect: vi.fn(), loop: false, buffer: null as unknown };
      sources.push(source);
      return source;
    },
  };
  const deps: StudioAmbientAudioDependencies = {
    createContext: vi.fn(() => context as unknown as AudioContext),
    load: vi.fn(async () => new ArrayBuffer(1)),
    synthBuffer: vi.fn((_context: AudioContext, track: { synth: string }) => {
      synthCalls.push(track.synth);
      return synthAudioBuffer as unknown as AudioBuffer;
    }),
  };
  const controller = new StudioVirtualAmbientAudioController(deps);
  return { controller, deps, context, sources, synthCalls, synthAudioBuffer };
}
const settle = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };

describe("virtual ambient audio — synthesized tracks", () => {
  it("합성 트랙은 파일을 읽지 않고 생성 버퍼를 루프 재생한다", async () => {
    const f = fixture();
    f.controller.selectTrack("synth-wind");
    f.controller.setEnabled(true);
    await settle();
    expect(f.synthCalls).toEqual(["wind"]);
    expect(f.deps.load).not.toHaveBeenCalled();
    expect(f.context.decodeAudioData).not.toHaveBeenCalled();
    expect(f.sources).toHaveLength(1);
    expect(f.sources[0]!.loop).toBe(true);
    expect(f.sources[0]!.buffer).toBe(f.synthAudioBuffer);
    expect(f.sources[0]!.start).toHaveBeenCalledOnce();
    expect(f.controller.snapshot()).toMatchObject({ phase: "playing", trackId: "synth-wind" });
    f.controller.dispose();
  });

  it("합성 트랙에서 녹음 트랙으로 바꾸면 기존 무결성 로드 경로를 탄다", async () => {
    const f = fixture();
    f.controller.selectTrack("synth-room");
    f.controller.setEnabled(true);
    await settle();
    expect(f.controller.snapshot().phase).toBe("playing");
    f.controller.selectTrack("gentle-rain");
    await settle();
    expect(f.deps.load).toHaveBeenCalledOnce();
    expect(f.context.decodeAudioData).toHaveBeenCalledOnce();
    expect(f.controller.snapshot()).toMatchObject({ phase: "playing", trackId: "gentle-rain" });
    f.controller.dispose();
  });
});
