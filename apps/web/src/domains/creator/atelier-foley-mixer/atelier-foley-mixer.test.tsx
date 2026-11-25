// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  applyAmbiencePresetToConfig,
  ATELIER_AMBIENCE_IDS,
  ATELIER_AMBIENCE_PROFILES,
  ATELIER_AMBIENCE_TARGET_LUFS,
  computeFoleyDspGraph,
  createDefaultFoleyMixerConfig,
  dbToLinearGain,
  DRAWING_TOOL_FOLEY_IDS,
  DRAWING_TOOL_FOLEY_PROFILES,
  FOLEY_MIXER_PRESET_SCHEMA,
  isHourInQuietWindow,
  linearGainToDb,
  MASTER_PEAK_CEILING_LINEAR,
  PAPER_RESONANCE_IDS,
  PAPER_RESONANCE_PROFILES,
  parseFoleyMixerPreset,
  previewFoleySound,
  resolveEffectiveFoleyGain,
  serializeFoleyMixerPreset,
  SILENCE_FLOOR_DB,
  StudioAtelierFoleyMixerPanel,
  TACTILE_UI_PRESET_IDS,
  TACTILE_UI_PRESETS,
  type PreviewAudioContextLike,
  type PreviewBufferSourceLike,
  type PreviewOscillatorLike,
  type PreviewBiquadFilterLike,
} from "./index";

const MODULE_DIR = resolve(
  process.cwd(),
  "apps/web/src/domains/creator/atelier-foley-mixer",
);

function createMockAudioContext() {
  const filters: PreviewBiquadFilterLike[] = [];
  const startedCount = { buffer: 0, osc: 0 };
  const connectCalls: number[] = [];

  const ctx: PreviewAudioContextLike = {
    currentTime: 1.25,
    sampleRate: 44100,
    destination: { kind: "destination" },
    state: "running",
    createBuffer: (_ch, len) => {
      const channel = new Float32Array(len);
      return { getChannelData: () => channel };
    },
    createBufferSource: () => {
      const source: PreviewBufferSourceLike = {
      buffer: null, onended: null,
      connect: (dest) => {
        connectCalls.push(1);
        return dest;
      },
      start: () => { startedCount.buffer += 1; },
      stop: () => { queueMicrotask(() => source.onended?.()); },
      };
      return source;
    },
    createOscillator: () => {
      const oscillator: PreviewOscillatorLike = {
      type: "sine", onended: null,
      frequency: {
        value: 440,
        setValueAtTime(v) { this.value = v; },
      },
      connect: (dest) => {
        connectCalls.push(1);
        return dest;
      },
      start: () => { startedCount.osc += 1; },
      stop: () => { queueMicrotask(() => oscillator.onended?.()); },
      };
      return oscillator;
    },
    createBiquadFilter: () => {
      const node: PreviewBiquadFilterLike = {
        type: "lowpass",
        frequency: {
          value: 1000,
          setValueAtTime(v) { this.value = v; },
        },
        Q: {
          value: 1,
          setValueAtTime(v) { this.value = v; },
        },
        connect: (dest) => {
          connectCalls.push(1);
          return dest;
        },
      };
      filters.push(node);
      return node;
    },
    createGain: () => ({
      gain: {
        value: 1,
        setValueAtTime(v) { this.value = v; },
      },
      connect: (dest) => {
        connectCalls.push(1);
        return dest;
      },
    }),
  };

  return { ctx, filters, startedCount, connectCalls };
}

describe("Wave 43F: 화실 물리 사운드(Foley) & 공간 음향 마스터 믹서 콘솔", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("1. 5종 화구 마찰음 프로필은 규격 ID·주파수·Q·필압 감마·속도 피치 계수를 모두 충족한다", () => {
    expect(DRAWING_TOOL_FOLEY_IDS).toEqual([
      "gpen-steel-scratch",
      "graphite-2b-grain",
      "alcohol-marker-squeak",
      "watercolor-wet-wash",
      "impasto-palette-knife",
    ]);
    for (const id of DRAWING_TOOL_FOLEY_IDS) {
      const p = DRAWING_TOOL_FOLEY_PROFILES[id];
      expect(p.centerFrequencyHz).toBeGreaterThanOrEqual(500);
      expect(p.qFactor).toBeGreaterThan(0.5);
      expect(p.pressureGainGamma).toBeGreaterThan(0.5);
      expect(p.velocityPitchShiftCoeff).toBeGreaterThan(0);
    }
    expect(DRAWING_TOOL_FOLEY_PROFILES["gpen-steel-scratch"].centerFrequencyHz).toBeGreaterThan(
      DRAWING_TOOL_FOLEY_PROFILES["watercolor-wet-wash"].centerFrequencyHz,
    );
  });

  it("2. 4종 종이 지질 공명 프로필은 LPF 고역 감쇠 순서와 그레인/진동 물리 특성을 유지한다", () => {
    expect(PAPER_RESONANCE_IDS).toEqual([
      "kent-smooth",
      "hanji-mulberry",
      "coldpress-300g",
      "sketch-tooth",
    ]);
    expect(PAPER_RESONANCE_PROFILES["kent-smooth"].lpfCutoffHz).toBeGreaterThan(
      PAPER_RESONANCE_PROFILES["sketch-tooth"].lpfCutoffHz,
    );
    expect(PAPER_RESONANCE_PROFILES["sketch-tooth"].lpfCutoffHz).toBeGreaterThan(
      PAPER_RESONANCE_PROFILES["coldpress-300g"].lpfCutoffHz,
    );
    expect(PAPER_RESONANCE_PROFILES["coldpress-300g"].lpfCutoffHz).toBeGreaterThan(
      PAPER_RESONANCE_PROFILES["hanji-mulberry"].lpfCutoffHz,
    );
    expect(PAPER_RESONANCE_PROFILES["coldpress-300g"].tactileVibrationStrength01).toBeGreaterThan(
      PAPER_RESONANCE_PROFILES["kent-smooth"].tactileVibrationStrength01,
    );
  });

  it("3. 5화구 × 4종이 전 20개 조합이 결정론적 유한 DSP 파라미터와 6노드·5엣지 그래프를 생성한다", () => {
    const base = createDefaultFoleyMixerConfig();
    let combinations = 0;
    for (const toolId of DRAWING_TOOL_FOLEY_IDS) {
      for (const paperId of PAPER_RESONANCE_IDS) {
        const g1 = computeFoleyDspGraph({ ...base, toolId, paperId }, { pressure01: 0.72, velocity01: 0.64 });
        const g2 = computeFoleyDspGraph({ ...base, toolId, paperId }, { pressure01: 0.72, velocity01: 0.64 });
        expect(g1).toEqual(g2);
        expect(Number.isFinite(g1.friction.centerFrequencyHz)).toBe(true);
        expect(Number.isFinite(g1.friction.lpfCutoffHz)).toBe(true);
        expect(g1.master.peakLinear).toBeLessThanOrEqual(MASTER_PEAK_CEILING_LINEAR);
        expect(g1.nodes).toHaveLength(6);
        expect(g1.connections).toHaveLength(5);
        combinations += 1;
      }
    }
    expect(combinations).toBe(20);
  });

  it("4. 필압→게인 감마 곡선은 pressure=0 무음, 단조 증가 및 화구별 γ 곡률 차이를 정확히 반영한다", () => {
    const base = createDefaultFoleyMixerConfig();
    const zero = computeFoleyDspGraph(base, { pressure01: 0, velocity01: 0.6 });
    const mid = computeFoleyDspGraph(base, { pressure01: 0.5, velocity01: 0.6 });
    const high = computeFoleyDspGraph(base, { pressure01: 0.95, velocity01: 0.6 });

    expect(zero.stroke.pressureCurveGain01).toBe(0);
    expect(zero.friction.effectiveGainLinear).toBe(0);
    expect(high.friction.effectiveGainLinear).toBeGreaterThan(mid.friction.effectiveGainLinear);

    // G펜(gamma=0.85 < 1)은 중간 필압에서 임파스토(gamma=1.48 > 1)보다 더 높은 정규화 필압 커브 응답을 보인다.
    const gpenMid = computeFoleyDspGraph({ ...base, toolId: "gpen-steel-scratch" }, { pressure01: 0.5, velocity01: 0.5 });
    const impastoMid = computeFoleyDspGraph({ ...base, toolId: "impasto-palette-knife" }, { pressure01: 0.5, velocity01: 0.5 });
    expect(gpenMid.stroke.pressureCurveGain01).toBeGreaterThan(0.5);
    expect(impastoMid.stroke.pressureCurveGain01).toBeLessThan(0.5);
  });

  it("5. 속도→피치 시프트 계수는 고속 스트로크 시 중심 주파수를 상승시키며 마커의 변화율이 수채보다 크다", () => {
    const base = createDefaultFoleyMixerConfig();
    const markerSlow = computeFoleyDspGraph({ ...base, toolId: "alcohol-marker-squeak" }, { pressure01: 0.6, velocity01: 0.1 });
    const markerFast = computeFoleyDspGraph({ ...base, toolId: "alcohol-marker-squeak" }, { pressure01: 0.6, velocity01: 0.95 });
    const waterSlow = computeFoleyDspGraph({ ...base, toolId: "watercolor-wet-wash" }, { pressure01: 0.6, velocity01: 0.1 });
    const waterFast = computeFoleyDspGraph({ ...base, toolId: "watercolor-wet-wash" }, { pressure01: 0.6, velocity01: 0.95 });

    const markerShiftRatio = markerFast.friction.centerFrequencyHz / markerSlow.friction.centerFrequencyHz;
    const waterShiftRatio = waterFast.friction.centerFrequencyHz / waterSlow.friction.centerFrequencyHz;

    expect(markerFast.friction.centerFrequencyHz).toBeGreaterThan(markerSlow.friction.centerFrequencyHz);
    expect(waterFast.friction.centerFrequencyHz).toBeGreaterThan(waterSlow.friction.centerFrequencyHz);
    expect(markerShiftRatio).toBeGreaterThan(waterShiftRatio);
  });

  it("6. 종이 지질 전환 시 한지(hanji-mulberry)는 켄트지보다 LPF 컷오프를 강하게 감쇠하고 300g 수채화지는 촉각 진동이 가장 크다", () => {
    const base = createDefaultFoleyMixerConfig();
    const kent = computeFoleyDspGraph({ ...base, paperId: "kent-smooth" }, { pressure01: 0.7, velocity01: 0.6 });
    const hanji = computeFoleyDspGraph({ ...base, paperId: "hanji-mulberry" }, { pressure01: 0.7, velocity01: 0.6 });
    const coldpress = computeFoleyDspGraph({ ...base, paperId: "coldpress-300g" }, { pressure01: 0.7, velocity01: 0.6 });

    expect(hanji.friction.lpfCutoffHz).toBeLessThan(kent.friction.lpfCutoffHz);
    expect(coldpress.friction.tactileVibration01).toBeGreaterThan(kent.friction.tactileVibration01);
    expect(coldpress.friction.fiberGrainDensity01).toBeGreaterThan(kent.friction.fiberGrainDensity01);
  });

  it("7. 4종 화실 앰비언스 프로필은 채널 가중치와 -24 LUFS 비방해 기준을 준수한다", () => {
    expect(ATELIER_AMBIENCE_IDS).toEqual([
      "rainy-night-atelier",
      "hanok-timber-study",
      "dawn-deadline-cafe",
      "silent-focus",
    ]);
    const base = createDefaultFoleyMixerConfig();
    for (const id of ATELIER_AMBIENCE_IDS) {
      const profile = ATELIER_AMBIENCE_PROFILES[id];
      expect(profile.targetLufs).toBe(ATELIER_AMBIENCE_TARGET_LUFS);
      const next = applyAmbiencePresetToConfig(base, id);
      const graph = computeFoleyDspGraph(next);
      expect(graph.ambience.meetsNonIntrusiveTarget).toBe(true);
      expect(graph.ambience.estimatedLufs).toBeLessThanOrEqual(ATELIER_AMBIENCE_TARGET_LUFS);
    }

    const silentGraph = computeFoleyDspGraph(applyAmbiencePresetToConfig(base, "silent-focus"));
    expect(silentGraph.ambience.effectiveGainLinear).toBe(0);
    expect(silentGraph.ambience.estimatedLufs).toBe(SILENCE_FLOOR_DB);
  });

  it("8. 모든 앰비언스 슬라이더와 버스를 100%로 올려도 자동 정규화·소프트 리미터가 클리핑(< 1.0)과 -24 LUFS 초과를 방지한다", () => {
    const maxed = {
      ...createDefaultFoleyMixerConfig(),
      toolId: "impasto-palette-knife" as const,
      paperId: "coldpress-300g" as const,
      ambienceId: "hanok-timber-study" as const,
      ambienceLevels: {
        "rainy-night-atelier": 1,
        "hanok-timber-study": 1,
        "dawn-deadline-cafe": 1,
        "silent-focus": 0,
      },
      tactilePresetId: "wood-brass-atelier" as const,
      masterVolume01: 1,
      foleyBusGain01: 1,
      ambienceBusGain01: 1,
      tactileBusGain01: 1,
    };
    const graph = computeFoleyDspGraph(maxed, { pressure01: 1, velocity01: 1 });

    expect(graph.ambience.clippingPrevented).toBe(true);
    expect(graph.ambience.antiClipScale).toBeLessThan(1);
    expect(graph.ambience.estimatedLufs).toBeLessThanOrEqual(ATELIER_AMBIENCE_TARGET_LUFS);
    expect(graph.master.unclampedPeakLinear).toBeGreaterThan(MASTER_PEAK_CEILING_LINEAR);
    expect(graph.master.clippingPrevented).toBe(true);
    expect(graph.master.peakLinear).toBe(MASTER_PEAK_CEILING_LINEAR);
    expect(graph.master.peakLinear).toBeLessThan(1);
    expect(graph.master.peakDb).toBeLessThan(0);
    expect(graph.master.headroomDb).toBeGreaterThan(0.5);
  });

  it("9. silent-focus 감쇠 슬라이더를 100%로 올리면 가청 앰비언스 레이어가 켜져 있어도 앰비언스 출력이 0이 된다", () => {
    const cfg = {
      ...createDefaultFoleyMixerConfig(),
      ambienceLevels: {
        "rainy-night-atelier": 0.9,
        "hanok-timber-study": 0.8,
        "dawn-deadline-cafe": 0.7,
        "silent-focus": 1,
      },
    };
    const graph = computeFoleyDspGraph(cfg);
    expect(graph.ambience.focusAttenuation01).toBe(0);
    expect(graph.ambience.effectiveGainLinear).toBe(0);
    expect(graph.ambience.estimatedLufs).toBe(SILENCE_FLOOR_DB);
  });

  it("10. 3종 촉각 UI 피드백 프리셋은 음량 계층(wood-brass > soft-paper > silent-off=0)을 유지한다", () => {
    expect(TACTILE_UI_PRESET_IDS).toEqual(["wood-brass-atelier", "soft-paper-whisper", "silent-off"]);
    const base = createDefaultFoleyMixerConfig();
    const wood = computeFoleyDspGraph({ ...base, tactilePresetId: "wood-brass-atelier" });
    const paper = computeFoleyDspGraph({ ...base, tactilePresetId: "soft-paper-whisper" });
    const off = computeFoleyDspGraph({ ...base, tactilePresetId: "silent-off" });

    expect(TACTILE_UI_PRESETS["wood-brass-atelier"].gainLinear).toBeGreaterThan(
      TACTILE_UI_PRESETS["soft-paper-whisper"].gainLinear,
    );
    expect(wood.tactileUi.effectiveGainLinear).toBeGreaterThan(paper.tactileUi.effectiveGainLinear);
    expect(off.tactileUi.effectiveGainLinear).toBe(0);
    expect(off.tactileUi.hapticPulseMs).toBe(0);
  });

  it("11. resolveEffectiveFoleyGain은 마스터 음소거와 볼륨 0을 안전하게 차단하고 dB 변환과 일관된다", () => {
    const audible = resolveEffectiveFoleyGain({
      masterVolume01: 0.5, muted: false, prefersReducedMotion: false,
      quietHours: { enabled: false, startHour: 23, endHour: 7 }, currentHour: 14,
    });
    expect(audible.isAudible).toBe(true);
    expect(audible.effectiveGainLinear).toBeCloseTo(0.5, 4);
    expect(audible.effectiveDb).toBeCloseTo(linearGainToDb(0.5), 1);
    expect(dbToLinearGain(audible.effectiveDb)).toBeCloseTo(0.5, 2);

    const muted = resolveEffectiveFoleyGain({
      masterVolume01: 0.9, muted: true, prefersReducedMotion: false,
      quietHours: { enabled: false, startHour: 23, endHour: 7 }, currentHour: 14,
    });
    expect(muted.isAudible).toBe(false);
    expect(muted.effectiveGainLinear).toBe(0);
    expect(muted.effectiveDb).toBe(SILENCE_FLOOR_DB);
    expect(muted.activeGuards).toContain("master-muted");
  });

  it("12. resolveEffectiveFoleyGain은 prefersReducedMotion 자동 음소거 및 soft 감쇠 정책을 정확히 적용한다", () => {
    const hardMute = resolveEffectiveFoleyGain({
      masterVolume01: 0.8, muted: false, prefersReducedMotion: true,
      quietHours: { enabled: false, startHour: 23, endHour: 7 }, currentHour: 14,
    });
    expect(hardMute.isAudible).toBe(false);
    expect(hardMute.isMutedBySafety).toBe(true);
    expect(hardMute.effectiveGainLinear).toBe(0);
    expect(hardMute.activeGuards).toContain("reduced-motion-mute");

    const soft = resolveEffectiveFoleyGain({
      masterVolume01: 0.8, muted: false, prefersReducedMotion: true, reducedMotionPolicy: "attenuate-soft",
      quietHours: { enabled: false, startHour: 23, endHour: 7 }, currentHour: 14,
    });
    expect(soft.isAudible).toBe(true);
    expect(soft.effectiveGainLinear).toBeCloseTo(0.2, 4);
    expect(soft.activeGuards).toContain("reduced-motion-attenuate");
  });

  it("13. isHourInQuietWindow 및 resolveEffectiveFoleyGain은 일반 구간과 자정 경계 래핑(23~07시)을 정확히 판정한다", () => {
    const overnight = { enabled: true, startHour: 23, endHour: 7 };
    expect(isHourInQuietWindow(23, overnight)).toBe(true);
    expect(isHourInQuietWindow(2, overnight)).toBe(true);
    expect(isHourInQuietWindow(6, overnight)).toBe(true);
    expect(isHourInQuietWindow(7, overnight)).toBe(false);
    expect(isHourInQuietWindow(22, overnight)).toBe(false);

    const daytime = { enabled: true, startHour: 13, endHour: 15 };
    expect(isHourInQuietWindow(14, daytime)).toBe(true);
    expect(isHourInQuietWindow(16, daytime)).toBe(false);

    const locked = resolveEffectiveFoleyGain({
      masterVolume01: 0.9, muted: false, prefersReducedMotion: false,
      quietHours: overnight, currentHour: 2,
    });
    expect(locked.isAudible).toBe(false);
    expect(locked.isQuietHoursActive).toBe(true);
    expect(locked.isMutedBySafety).toBe(true);
    expect(locked.activeGuards).toContain("quiet-hours-mute");
  });

  it("14. computeFoleyDspGraph는 안전 음소거(prefersReducedMotion/quietHours) 시 화구·앰비언스·촉각·진동을 모두 0으로 잠근다", () => {
    const cfg = {
      ...createDefaultFoleyMixerConfig(),
      prefersReducedMotion: true,
      quietHours: { enabled: true, startHour: 22, endHour: 7 },
      currentHour: 23,
    };
    const graph = computeFoleyDspGraph(cfg, { pressure01: 0.9, velocity01: 0.9 });
    expect(graph.safety.isAudible).toBe(false);
    expect(graph.friction.effectiveGainLinear).toBe(0);
    expect(graph.friction.tactileVibration01).toBe(0);
    expect(graph.ambience.effectiveGainLinear).toBe(0);
    expect(graph.tactileUi.effectiveGainLinear).toBe(0);
    expect(graph.master.peakLinear).toBe(0);
    expect(graph.nodes.every((n) => n.bypassed)).toBe(true);
  });

  it("15. serializeFoleyMixerPreset와 parseFoleyMixerPreset는 전체 설정을 무손실 JSON 왕복한다", () => {
    const custom = {
      ...createDefaultFoleyMixerConfig(),
      toolId: "graphite-2b-grain" as const,
      paperId: "hanji-mulberry" as const,
      ambienceId: "hanok-timber-study" as const,
      ambienceLevels: {
        "rainy-night-atelier": 0.15,
        "hanok-timber-study": 0.72,
        "dawn-deadline-cafe": 0.05,
        "silent-focus": 0.1,
      },
      tactilePresetId: "soft-paper-whisper" as const,
      masterVolume01: 0.64,
      quietHours: { enabled: true, startHour: 22, endHour: 6 },
      currentHour: 21,
    };

    const json = serializeFoleyMixerPreset(custom, "한옥 연필 야간 프리셋");
    const parsed = parseFoleyMixerPreset(json);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.preset.schema).toBe(FOLEY_MIXER_PRESET_SCHEMA);
    expect(parsed.preset.name).toBe("한옥 연필 야간 프리셋");
    expect(parsed.preset.config).toEqual(custom);
    expect(parsed.warnings).toHaveLength(0);
  });

  it("16. parseFoleyMixerPreset는 빈 입력·깨진 JSON·오스키마·잘못된 화구 ID를 fail-closed 거부하고 범위 초과 수치를 클램핑한다", () => {
    expect(parseFoleyMixerPreset("   ")).toMatchObject({ ok: false, errorCode: "empty-input" });
    expect(parseFoleyMixerPreset("{broken")).toMatchObject({ ok: false, errorCode: "invalid-json" });
    expect(parseFoleyMixerPreset(JSON.stringify({ schema: "unknown", schemaVersion: 1 }))).toMatchObject({
      ok: false, errorCode: "invalid-schema",
    });
    expect(
      parseFoleyMixerPreset(
        JSON.stringify({
          schema: FOLEY_MIXER_PRESET_SCHEMA,
          schemaVersion: 1,
          config: { toolId: "laser-pen", paperId: "kent-smooth", ambienceId: "silent-focus", tactilePresetId: "silent-off" },
        }),
      ),
    ).toMatchObject({ ok: false, errorCode: "invalid-fields" });

    const outOfRange = serializeFoleyMixerPreset(createDefaultFoleyMixerConfig()).replace(
      '"masterVolume01": 0.75',
      '"masterVolume01": 4.2',
    );
    const clamped = parseFoleyMixerPreset(outOfRange);
    expect(clamped.ok).toBe(true);
    if (!clamped.ok) return;
    expect(clamped.preset.config.masterVolume01).toBe(1);
    expect(clamped.warnings.length).toBeGreaterThan(0);
  });

  it("17. previewFoleySound는 jsdom(AudioContext 부재) 환경에서 예외 없이 unavailable-noop를 반환한다", async () => {
    const graph = computeFoleyDspGraph(createDefaultFoleyMixerConfig());
    const result = await previewFoleySound(graph, { kind: "stroke" });
    expect(result.played).toBe(false);
    expect(result.status).toBe("unavailable-noop");
    expect(result.reason).toBe("no-audio-context");
  });

  it("18. previewFoleySound는 안전장치 음소거 시 AudioContext 팩토리를 호출하지 않고 muted-noop를 반환한다", async () => {
    const factory = vi.fn(() => null);
    const graph = computeFoleyDspGraph({ ...createDefaultFoleyMixerConfig(), muted: true });
    const result = await previewFoleySound(graph, { kind: "stroke", audioContextFactory: factory });
    expect(result.played).toBe(false);
    expect(result.status).toBe("muted-noop");
    expect(result.reason).toBe("safety-muted");
    expect(factory).not.toHaveBeenCalled();
  });

  it("19. previewFoleySound는 모의 AudioContext 주입 시 bandpass/lowpass 필터 주파수를 적용하고 played=true를 반환한다", async () => {
    const mock = createMockAudioContext();
    const graph = computeFoleyDspGraph(
      { ...createDefaultFoleyMixerConfig(), toolId: "alcohol-marker-squeak", paperId: "hanji-mulberry" },
      { pressure01: 0.75, velocity01: 0.8 },
    );

    const strokeRes = await previewFoleySound(graph, { kind: "stroke", audioContextFactory: () => mock.ctx });
    expect(strokeRes.played).toBe(true);
    expect(strokeRes.status).toBe("played");
    expect(mock.startedCount.buffer).toBe(1);
    expect(mock.filters).toHaveLength(2);
    expect(mock.filters[0]?.frequency.value).toBe(graph.friction.centerFrequencyHz);
    expect(mock.filters[1]?.frequency.value).toBe(graph.friction.lpfCutoffHz);

    const tactileRes = await previewFoleySound(graph, { kind: "tactile-ui", audioContextFactory: () => mock.ctx });
    expect(tactileRes.played).toBe(true);
    expect(mock.startedCount.osc).toBe(1);
  });

  it("20. StudioAtelierFoleyMixerPanel은 Props 없이 단독 렌더링되며 실시간 DSP 리드아웃을 표시한다", () => {
    render(<StudioAtelierFoleyMixerPanel />);
    expect(screen.getByTestId("atelier-foley-mixer-panel")).toBeTruthy();
    expect(screen.getByTestId("readout-center-freq").textContent).toContain("Hz");
    expect(screen.getByTestId("readout-lpf-cutoff").textContent).toContain("Hz");
    expect(screen.getByTestId("readout-effective-db").textContent).toContain("dBFS");
    expect(screen.getByTestId("readout-ambience-lufs").textContent).toContain("LUFS");
  });

  it("21. 화구·종이 조합 선택 시 중심 주파수 및 LPF 고역 감쇠 리드아웃이 즉각 갱신된다", () => {
    const onConfigChange = vi.fn();
    render(<StudioAtelierFoleyMixerPanel onConfigChange={onConfigChange} />);

    const initialFreq = screen.getByTestId("readout-center-freq").textContent ?? "";
    const initialLpf = screen.getByTestId("readout-lpf-cutoff").textContent ?? "";

    fireEvent.click(screen.getByTestId("tool-btn-watercolor-wet-wash"));
    fireEvent.click(screen.getByTestId("paper-btn-hanji-mulberry"));

    const nextFreq = screen.getByTestId("readout-center-freq").textContent ?? "";
    const nextLpf = screen.getByTestId("readout-lpf-cutoff").textContent ?? "";
    expect(nextFreq).not.toBe(initialFreq);
    expect(nextLpf).not.toBe(initialLpf);
    expect(onConfigChange).toHaveBeenCalledTimes(2);
  });

  it("22. 마스터 음소거·모션 축소 안전장치·4종 앰비언스 믹서 슬라이더 상호작용이 즉시 반영된다", () => {
    render(<StudioAtelierFoleyMixerPanel />);

    fireEvent.click(screen.getByTestId("btn-master-mute"));
    expect(screen.getByTestId("mixer-safety-badge").textContent).toContain("마스터 음소거");
    expect(screen.getByTestId("readout-effective-db").textContent).toContain("무음");

    fireEvent.click(screen.getByTestId("btn-master-mute"));
    fireEvent.click(screen.getByTestId("btn-toggle-reduced-motion"));
    expect(screen.getByTestId("mixer-safety-badge").textContent).toContain("모션 축소");

    fireEvent.click(screen.getByTestId("btn-toggle-reduced-motion"));
    fireEvent.change(screen.getByTestId("slider-ambience-silent-focus"), { target: { value: "1" } });
    expect(screen.getByTestId("readout-ambience-lufs").textContent).toContain("무음");
  });

  it("23. 1클릭 사운드 시연·프리셋 JSON 내보내기/불러오기·초기화 및 영문 로케일 렌더링이 동작한다", async () => {
    const onPreview = vi.fn();
    const onExport = vi.fn();
    render(<StudioAtelierFoleyMixerPanel onPreviewResult={onPreview} onExportJson={onExport} />);

    await act(async () => { fireEvent.click(screen.getByTestId("btn-preview-stroke")); });
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ status: "unavailable-noop", played: false }));
    expect(screen.getByTestId("foley-playback-status").textContent).toContain("unavailable-noop");

    fireEvent.click(screen.getByTestId("tool-btn-impasto-palette-knife"));
    fireEvent.click(screen.getByTestId("btn-export-preset"));
    expect(onExport).toHaveBeenCalledTimes(1);
    const exported = (screen.getByTestId("textarea-preset-json") as HTMLTextAreaElement).value;
    expect(exported).toContain("impasto-palette-knife");

    fireEvent.click(screen.getByTestId("btn-reset-mixer"));
    expect(screen.getByTestId("tool-btn-gpen-steel-scratch").getAttribute("aria-pressed")).toBe("true");

    fireEvent.change(screen.getByTestId("textarea-preset-json"), { target: { value: exported } });
    fireEvent.click(screen.getByTestId("btn-import-preset"));
    expect(screen.getByTestId("tool-btn-impasto-palette-knife").getAttribute("aria-pressed")).toBe("true");

    cleanup();
    render(<StudioAtelierFoleyMixerPanel locale="en" />);
    expect(screen.getByTestId("btn-export-preset").textContent).toContain("Export Preset JSON");
  });

  it("24. 모듈 전 파일이 엄격 코드 위생 규칙(<=800줄·원시색상0·전역전환0·빈객체기본props0·무스토리지·무프라이빗맵·무BigInt)을 통과한다", () => {
    const files = [
      "atelier-foley-mixer-engine.ts",
      "StudioAtelierFoleyMixerPanel.tsx",
      "index.ts",
      "atelier-foley-mixer.test.tsx",
    ];
    const storageRe = new RegExp(["local", "Storage", "|", "session", "Storage"].join(""));
    const bigintRe = new RegExp(["\\b(?:0x[0-9a-fA-F]+|[0-9]+)", "n\\b"].join(""));
    const privateStoreRe = new RegExp(["private\\s+", "(?:readonly\\s+)?", "store\\b"].join(""));
    const rawColorRe = new RegExp(["#[0-9a-fA-F]{3,8}\\b", "|\\brgba?\\s*\\(", "|\\bhsla?\\s*\\("].join(""));
    const transitionAllRe = new RegExp(["transition", "-all\\b"].join(""));
    const defaultEmptyObjRe = new RegExp(["=\\s*", "\\{\\s*\\}"].join(""));

    for (const file of files) {
      const content = readFileSync(resolve(MODULE_DIR, file), "utf8");
      expect(content.split("\n").length, `${file} 800줄 초과`).toBeLessThanOrEqual(800);
      expect(storageRe.test(content), `${file} Web Storage 금지 위반`).toBe(false);
      expect(bigintRe.test(content), `${file} BigInt 리터럴 금지 위반`).toBe(false);
      expect(privateStoreRe.test(content), `${file} 프라이빗 맵 스토어 금지 위반`).toBe(false);
      expect(rawColorRe.test(content), `${file} 원시 색상 금지 위반`).toBe(false);
      expect(transitionAllRe.test(content), `${file} 전역 전환 클래스 금지 위반`).toBe(false);
    }

    const panelSrc = readFileSync(resolve(MODULE_DIR, "StudioAtelierFoleyMixerPanel.tsx"), "utf8");
    expect(defaultEmptyObjRe.test(panelSrc), "패널에 빈 객체 기본 props 금지 위반").toBe(false);
    expect(panelSrc.includes("tabular-nums")).toBe(true);
    expect(panelSrc.includes("[word-break:keep-all]")).toBe(true);
    expect(panelSrc.includes("min-h-11")).toBe(true);
  });
});
