// @vitest-environment jsdom

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCspFullBrushAtelierPanel } from "../csp-brush-atelier/StudioCspFullBrushAtelierPanel";

import {
  STUDIO_FOLEY_NOISE_BUFFER_SEC,
  buildRaisedCosineStickSlipEnvelope,
  synthesizeAtelierRoomImpulseResponse,
} from "./studio-procedural-foley-audio";
import {
  PAPER_TOOTH_PROFILES,
  STUDIO_FOLEY_PRESETS,
  STUDIO_FOLEY_SOUND_CHANNELS,
  STUDIO_FOLEY_SOUND_IDS,
  STUDIO_HAPTIC_PATTERNS,
  STUDIO_PAPER_TEXTURE_IDS,
  STUDIO_PORCELAIN_BASE_PIGMENTS,
  STUDIO_TACTILE_PARTICLE_SPECS,
  STUDIO_VIBRANT_SPRITE_COUNT,
  STUDIO_VIBRANT_SPRITE_IDS,
  STUDIO_VIBRANT_SPRITE_REGISTRY,
  STUDIO_VIBRANT_SPRITE_SHEETS,
  STUDIO_VIBRANT_THEMES,
  STUDIO_VIBRANT_THEME_IDS,
  StudioFoleyAudioEngine,
  StudioTactileParticleSystem,
  StudioVibrantSpriteIcon,
  applyStudioVibrantTheme,
  computeFoleySynthesisProfile,
  createPorcelainWetMixingWell,
  createTactileParticleBurst,
  getPaperToothProfile,
  getStudioVibrantSprite,
  isStudioVibrantSpriteId,
  isStudioVibrantThemeId,
  listStudioVibrantSpritesByCategory,
  mixPigmentsKubelkaMunk,
  resolveStudioToolSpriteId,
  resolveStudioVibrantTheme,
  samplePaperToothResistance,
  stepTactileParticles,
  triggerTactileHapticDetent,
  type StudioFoleyPresetId,
  type StudioHapticNavigatorLike,
  type StudioTactileParticleKind,
} from "./index";

const REPO_ROOT = resolve(__dirname, "../../../../../..");
const SPRITE_PUBLIC_DIR = resolve(REPO_ROOT, "apps/web/public/assets/studio/vibrant-sprites");
const CSS_FILE_PATH = resolve(__dirname, "studio-vibrant-atelier.css");
const ICON_TSX_PATH = resolve(__dirname, "StudioVibrantSpriteIcon.tsx");

function createMockAudioContext(
  initialState: AudioContextState = "running",
  opts: { readonly fullWebAudio?: boolean } = {},
) {
  const createdOscillators: { type: string; startCalls: number; stopCalls: number; disconnectCalls: number; freqSet: number[]; fireEnded: () => void }[] = [];
  const createdBufferSources: { startCalls: number; stopCalls: number; disconnectCalls: number; loop: boolean; startOffsets: number[]; playbackRates: number[]; fireEnded: () => void }[] = [];
  const createdFilters: { type: string; disconnectCalls: number; freqSet: number[]; qSet: number[] }[] = [];
  const createdGains: { valueSet: number[]; curves: Float32Array[]; disconnectCalls: number }[] = [];
  const createdBuffers: { length: number; sampleRate: number }[] = [];
  const createdConvolvers: { hasBuffer: boolean; disconnectCalls: number }[] = [];
  const createdCompressors: { threshold: number[]; ratio: number[]; disconnectCalls: number }[] = [];
  let closed = false;
  let state: AudioContextState = initialState;

  const makeParam = (sink: number[], curveSink?: Float32Array[]) => {
    const base: Record<string, unknown> = {
      value: 0,
      setValueAtTime: vi.fn((val: number) => { sink.push(val); }),
      linearRampToValueAtTime: vi.fn((val: number) => { sink.push(val); }),
      exponentialRampToValueAtTime: vi.fn((val: number) => { sink.push(val); }),
    };
    if (opts.fullWebAudio && curveSink) {
      base.setValueCurveAtTime = vi.fn((curve: Float32Array) => { curveSink.push(curve); });
    }
    return base;
  };

  const ctxObj: Record<string, unknown> = {
    get state() { return state; },
    currentTime: 1.25,
    sampleRate: 44100,
    destination: {},
    resume: vi.fn(async () => { state = "running"; }),
    close: vi.fn(async () => { closed = true; state = "closed"; }),
    createGain: vi.fn(() => {
      const record = { valueSet: [] as number[], curves: [] as Float32Array[], disconnectCalls: 0 };
      createdGains.push(record);
      return {
        gain: makeParam(record.valueSet, record.curves),
        connect: vi.fn(),
        disconnect: vi.fn(() => { record.disconnectCalls += 1; }),
      };
    }),
    createBiquadFilter: vi.fn(() => {
      const record = { type: "lowpass", disconnectCalls: 0, freqSet: [] as number[], qSet: [] as number[] };
      createdFilters.push(record);
      return {
        get type() { return record.type; },
        set type(next: string) { record.type = next; },
        frequency: makeParam(record.freqSet),
        Q: makeParam(record.qSet),
        connect: vi.fn(),
        disconnect: vi.fn(() => { record.disconnectCalls += 1; }),
      };
    }),
    createOscillator: vi.fn(() => {
      const record = { type: "sine", startCalls: 0, stopCalls: 0, disconnectCalls: 0, freqSet: [] as number[], fireEnded: () => {} };
      const node = {
        get type() { return record.type; },
        set type(next: string) { record.type = next; },
        onended: null as (() => void) | null,
        frequency: makeParam(record.freqSet),
        connect: vi.fn(),
        disconnect: vi.fn(() => { record.disconnectCalls += 1; }),
        start: vi.fn(() => { record.startCalls += 1; }),
        stop: vi.fn(() => { record.stopCalls += 1; }),
      };
      record.fireEnded = () => { node.onended?.(); };
      createdOscillators.push(record);
      return node;
    }),
    createBuffer: vi.fn((channels: number, length: number, sampleRate: number) => {
      createdBuffers.push({ length, sampleRate });
      const data = new Float32Array(length);
      return { numberOfChannels: channels, length, sampleRate, getChannelData: () => data };
    }),
    createBufferSource: vi.fn(() => {
      const record = { startCalls: 0, stopCalls: 0, disconnectCalls: 0, loop: false, startOffsets: [] as number[], playbackRates: [] as number[], fireEnded: () => {} };
      const node: Record<string, unknown> = {
        buffer: null,
        onended: null as (() => void) | null,
        get loop() { return record.loop; },
        set loop(next: boolean) { record.loop = next; },
        connect: vi.fn(),
        disconnect: vi.fn(() => { record.disconnectCalls += 1; }),
        start: vi.fn((_when?: number, offset?: number) => {
          record.startCalls += 1;
          record.startOffsets.push(offset ?? 0);
        }),
        stop: vi.fn(() => { record.stopCalls += 1; }),
      };
      if (opts.fullWebAudio) node.playbackRate = makeParam(record.playbackRates);
      record.fireEnded = () => { (node.onended as (() => void) | null)?.(); };
      createdBufferSources.push(record);
      return node;
    }),
  };

  if (opts.fullWebAudio) {
    ctxObj.createConvolver = vi.fn(() => {
      const record = { hasBuffer: false, disconnectCalls: 0 };
      createdConvolvers.push(record);
      return {
        set buffer(buf: unknown) { record.hasBuffer = buf !== null; },
        get buffer() { return record.hasBuffer ? {} : null; },
        connect: vi.fn(),
        disconnect: vi.fn(() => { record.disconnectCalls += 1; }),
      };
    });
    ctxObj.createDynamicsCompressor = vi.fn(() => {
      const record = { threshold: [] as number[], ratio: [] as number[], disconnectCalls: 0 };
      createdCompressors.push(record);
      return {
        threshold: makeParam(record.threshold),
        knee: makeParam([]),
        ratio: makeParam(record.ratio),
        attack: makeParam([]),
        release: makeParam([]),
        connect: vi.fn(),
        disconnect: vi.fn(() => { record.disconnectCalls += 1; }),
      };
    });
  }

  return {
    ctx: ctxObj as unknown as AudioContext,
    createdOscillators, createdBufferSources, createdFilters, createdGains,
    createdBuffers, createdConvolvers, createdCompressors,
    setState: (next: AudioContextState) => { state = next; },
    isClosed: () => closed,
  };
}

afterEach(() => {
  cleanup();
});

describe("1. 44종 주얼 아틀리에 투명 WebP 스프라이트 정본 레지스트리 및 디스크 파일 검증", () => {
  it("정확히 44종 스프라이트가 등록되어 있고 실제 투명 WebP 파일이 디스크에 존재한다", () => {
    expect(STUDIO_VIBRANT_SPRITE_COUNT).toBe(44);
    expect(STUDIO_VIBRANT_SPRITE_REGISTRY).toHaveLength(44);
    expect(new Set(STUDIO_VIBRANT_SPRITE_IDS).size).toBe(44);

    // 카테고리 정원 검증: 16 tools + 8 brushes + 12 emblems + 6 devices + 2 tech = 44
    expect(listStudioVibrantSpritesByCategory("tool")).toHaveLength(16);
    expect(listStudioVibrantSpritesByCategory("brush")).toHaveLength(8);
    expect(listStudioVibrantSpritesByCategory("emblem")).toHaveLength(12);
    expect(listStudioVibrantSpritesByCategory("device")).toHaveLength(6);
    expect(listStudioVibrantSpritesByCategory("tech")).toHaveLength(2);

    const diskIndividualFiles = readdirSync(SPRITE_PUBLIC_DIR)
      .filter((name) => name.endsWith(".webp") && !name.endsWith("-sheet.webp"))
      .sort();
    const diskIndividualFileSet = new Set(diskIndividualFiles);
    expect(diskIndividualFiles.length).toBeGreaterThanOrEqual(44);

    for (const entry of STUDIO_VIBRANT_SPRITE_REGISTRY) {
      expect(diskIndividualFileSet.has(entry.fileName), `${entry.fileName} 디스크 목록 포함`).toBe(true);
      const diskPath = resolve(SPRITE_PUBLIC_DIR, entry.fileName);
      expect(existsSync(diskPath), `${entry.fileName} 파일 존재`).toBe(true);
      const header = readFileSync(diskPath).subarray(0, 12);
      expect(header.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(header.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(entry.src).toBe(`/assets/studio/vibrant-sprites/${entry.fileName}`);
      expect(entry.accentToken).toMatch(/^--ts-vibrant-accent-/u);
      expect(entry.labelKo.trim().length).toBeGreaterThan(2);
      expect(isStudioVibrantSpriteId(entry.id)).toBe(true);
    }

    // 6종 스프라이트 시트도 함께 검증
    expect(STUDIO_VIBRANT_SPRITE_SHEETS).toHaveLength(6);
    for (const sheetUrl of STUDIO_VIBRANT_SPRITE_SHEETS) {
      const fileName = sheetUrl.split("/").pop() ?? "";
      expect(existsSync(resolve(SPRITE_PUBLIC_DIR, fileName))).toBe(true);
    }
  });

  it("resolveStudioToolSpriteId가 스튜디오 도구·브러시·엠블럼·디바이스 ID와 미등록 폴백을 정확히 매핑한다", () => {
    expect(resolveStudioToolSpriteId("pen")).toBe("tool-gpen");
    expect(resolveStudioToolSpriteId("eraser")).toBe("tool-eraser");
    expect(resolveStudioToolSpriteId("wet-mix")).toBe("tool-watercolor");
    expect(resolveStudioToolSpriteId("fill")).toBe("tool-fill");
    expect(resolveStudioToolSpriteId("eyedropper")).toBe("tool-eyedropper");
    expect(resolveStudioToolSpriteId("lasso")).toBe("tool-lasso");
    expect(resolveStudioToolSpriteId("perspective")).toBe("tool-ruler");
    expect(resolveStudioToolSpriteId("bubble")).toBe("tool-bubble-sfx");
    expect(resolveStudioToolSpriteId("bg3d")).toBe("tool-bg3d");
    expect(resolveStudioToolSpriteId("vrm3d")).toBe("tool-vrm");
    expect(resolveStudioToolSpriteId("csp-oil-paint")).toBe("brush-oil");
    expect(resolveStudioToolSpriteId("csp-wax-crayon")).toBe("brush-pastel");
    expect(resolveStudioToolSpriteId("csp-soft-airbrush")).toBe("brush-airbrush");
    expect(resolveStudioToolSpriteId("csp-dry-sumi")).toBe("brush-calligraphy");
    expect(resolveStudioToolSpriteId("tourbox")).toBe("device-dial-pad");
    expect(resolveStudioToolSpriteId("webgpu")).toBe("tech-webgpu");
    expect(resolveStudioToolSpriteId("remotion")).toBe("tech-remotion");
    expect(resolveStudioToolSpriteId("unknown-custom-tool-999")).toBe("tool-gpen");
    expect(resolveStudioToolSpriteId(null, "tool-layers")).toBe("tool-layers");
  });
});

describe("2. 4종 OKLCH 아틀리에 컬러 테마 · CSS 계약 · TSX 원시색 0건 검증", () => {
  it("4종 OKLCH 테마 정의·DOM 적용·폴백이 정확히 동작한다", () => {
    expect(STUDIO_VIBRANT_THEME_IDS).toEqual([
      "sunlight-atelier",
      "coral-pop",
      "botanical-mint",
      "midnight-ink",
    ]);
    expect(STUDIO_VIBRANT_THEMES).toHaveLength(4);
    expect(isStudioVibrantThemeId("coral-pop")).toBe(true);
    expect(isStudioVibrantThemeId("invalid-theme")).toBe(false);
    expect(resolveStudioVibrantTheme("unknown", "botanical-mint")).toBe("botanical-mint");

    const el = document.createElement("div");
    for (const themeId of STUDIO_VIBRANT_THEME_IDS) {
      expect(applyStudioVibrantTheme(el, themeId)).toBe(themeId);
      expect(el.dataset.studioVibrantTheme).toBe(themeId);
    }
  });

  it("studio-vibrant-atelier.css가 4종 테마·잉크 오라·탄성 눌림·광택 스윕·Scroll-Driven·고대비·모션 감소를 포함하고 TSX는 원시색 0건이다", () => {
    const css = readFileSync(CSS_FILE_PATH, "utf8");
    for (const themeId of STUDIO_VIBRANT_THEME_IDS) {
      expect(css).toContain(`[data-studio-vibrant-theme="${themeId}"]`);
    }
    expect(css).toContain("oklch(");
    expect(css).toContain(".ts-ink-bloom-active");
    expect(css).toContain("150ms");
    expect(css).toContain("scale(0.95)");
    expect(css).toContain(".ts-specular-sheen");
    expect(css).toContain("@supports (animation-timeline: view())");
    expect(css).toContain(".ts-hc-hatch-overlay");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");

    const tsx = readFileSync(ICON_TSX_PATH, "utf8");
    expect(tsx).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(tsx).not.toMatch(/\brgba?\s*\(/u);
    expect(tsx).not.toMatch(/\bhsla?\s*\(/u);
    expect(tsx).not.toMatch(/\b(?:localStorage|sessionStorage|indexedDB)\b/u);
  });
});

describe("3. StudioVibrantSpriteIcon 컴포넌트 렌더링 및 오류 폴백", () => {
  it("size·spriteId·active·animated·ariaLabel·고대비 오버레이를 정확히 렌더링한다", () => {
    render(
      <StudioVibrantSpriteIcon
        spriteId="tool-gpen"
        size="lg"
        active
        animated
        highContrastOverlay
        ariaLabel="커스텀 G펜 도구"
      />,
    );

    const host = screen.getByRole("img", { name: "커스텀 G펜 도구" });
    expect(host.getAttribute("data-vibrant-sprite-id")).toBe("tool-gpen");
    expect(host.getAttribute("data-active")).toBe("true");
    expect(host.getAttribute("data-animated")).toBe("true");
    expect(host.className).toContain("ts-ink-bloom-active");
    expect(host.className).toContain("ts-specular-sheen");
    expect(host.className).toContain("ts-hc-hatch-overlay");
    expect(host.className).toContain("ts-accent-ink");

    const img = host.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("/assets/studio/vibrant-sprites/tool-gpen.webp");
    expect(img?.getAttribute("width")).toBe("44");
  });

  it("이미지 로드 실패 시 깨짐 없이 한글 배지 폴백으로 전환되고 spriteId 변경 시 자동 복구된다", () => {
    const onLoadError = vi.fn();
    const { rerender } = render(
      <StudioVibrantSpriteIcon spriteId="tool-watercolor" size={40} onLoadError={onLoadError} />,
    );

    const host = screen.getByRole("img", { name: getStudioVibrantSprite("tool-watercolor").labelKo });
    const img = host.querySelector("img");
    expect(img).toBeTruthy();

    fireEvent.error(img!);
    expect(onLoadError).toHaveBeenCalledWith("tool-watercolor");
    expect(host.getAttribute("data-sprite-fallback")).toBe("true");
    expect(host.textContent).toContain("수채");

    rerender(<StudioVibrantSpriteIcon spriteId="tool-bg3d" size={40} onLoadError={onLoadError} />);
    const updated = screen.getByRole("img", { name: getStudioVibrantSprite("tool-bg3d").labelKo });
    expect(updated.getAttribute("data-sprite-fallback")).toBe("false");
    expect(updated.querySelector("img")?.getAttribute("src")).toBe(
      "/assets/studio/vibrant-sprites/tool-bg3d.webp",
    );
  });
});

describe("4. StudioFoleyAudioEngine 물리 모델링 오디오 합성 · 3채널 믹서 · 3프리셋", () => {
  it("13종 Foley(기존 10종 + 마커·목탄·수묵)가 raw triangle 버즈 없이 매체별 물리 스펙트럼을 분리 재생한다", () => {
    const mock = createMockAudioContext();
    let clock = 1000;
    const engine = new StudioFoleyAudioEngine({
      initialPreset: "lively-asmr",
      audioContextFactory: () => mock.ctx,
      minTriggerIntervalMs: 10,
      nowMs: () => clock,
    });

    expect(STUDIO_FOLEY_SOUND_IDS).toHaveLength(13);
    for (const legacyId of [
      "gpen-ink", "graphite-pencil", "watercolor-sable", "oil-impasto", "airbrush",
      "eraser-scrub", "magnetic-detent", "bubble-pop", "panel-snap", "page-turn",
    ] as const) {
      expect(STUDIO_FOLEY_SOUND_IDS).toContain(legacyId);
    }
    for (const soundId of STUDIO_FOLEY_SOUND_IDS) {
      clock += 25;
      const result = engine.triggerSound(soundId, {
        speed01: 0.72, pressure01: 0.65, tilt01: 0.3, paperTexture: "rough-cotton",
      });
      expect(result.played).toBe(true);
      expect(result.channel).toBe(STUDIO_FOLEY_SOUND_CHANNELS[soundId]);
      expect(result.effectiveGain).toBeGreaterThan(0);
    }

    // 2.6초 이상 다중 텍스처 노이즈 버퍼(velvet/pink/gritty) 생성 및 raw triangle 버즈 0건 검증
    expect(STUDIO_FOLEY_NOISE_BUFFER_SEC).toBeGreaterThanOrEqual(2.4);
    expect(mock.createdBuffers.filter((b) => b.length >= b.sampleRate * 2.4).length).toBeGreaterThanOrEqual(3);
    expect(mock.createdBufferSources.length).toBeGreaterThanOrEqual(11);
    expect(mock.createdOscillators).toHaveLength(3);
    expect(mock.createdOscillators.every((osc) => osc.type === "sine")).toBe(true);
    expect(mock.createdFilters.length).toBeGreaterThanOrEqual(18);

    // 매체별 스펙트럼 분리 & 물리 파라미터 차등 검증
    const slowGpen = computeFoleySynthesisProfile("gpen-ink", { speed01: 0.1, pressure01: 0.2, paperTexture: "rough-cotton" });
    const fastGpen = computeFoleySynthesisProfile("gpen-ink", { speed01: 0.95, pressure01: 0.9, paperTexture: "manga-kent" });
    expect(fastGpen.mode).toBe("dual-formant-friction");
    expect(fastGpen.baseFrequencyHz).toBeGreaterThan(slowGpen.baseFrequencyHz);
    expect(fastGpen.baseFrequencyHz).toBeGreaterThanOrEqual(2600);
    expect(fastGpen.baseFrequencyHz).toBeLessThanOrEqual(5200);
    expect(fastGpen.peakGain).toBeGreaterThan(slowGpen.peakGain);

    const uprightPencil = computeFoleySynthesisProfile("graphite-pencil", { tilt01: 0.05 });
    const tiltedPencil = computeFoleySynthesisProfile("graphite-pencil", { tilt01: 0.9 });
    expect(tiltedPencil.baseFrequencyHz).toBeLessThan(uprightPencil.baseFrequencyHz);
    expect(tiltedPencil.filterQ).toBeLessThan(uprightPencil.filterQ);
    expect(uprightPencil.bodyFrequencyHz).toBeGreaterThanOrEqual(380);
    expect(uprightPencil.bodyFrequencyHz).toBeLessThanOrEqual(520);

    const watercolor = computeFoleySynthesisProfile("watercolor-sable", { speed01: 0.55, paperTexture: "cold-press-watercolor" });
    const marker = computeFoleySynthesisProfile("alcohol-marker", { speed01: 0.55, paperTexture: "smooth-bristol" });
    const charcoal = computeFoleySynthesisProfile("charcoal-pastel", { speed01: 0.55, paperTexture: "rough-cotton" });
    const sumi = computeFoleySynthesisProfile("sumi-ink-brush", { speed01: 0.55, paperTexture: "cold-press-watercolor" });
    const oil = computeFoleySynthesisProfile("oil-impasto", { speed01: 0.55, pressure01: 0.7, paperTexture: "linen-canvas" });
    const eraser = computeFoleySynthesisProfile("eraser-scrub", { speed01: 0.55, paperTexture: "manga-kent" });

    expect(watercolor.noiseTexture).toBe("velvet");
    expect(watercolor.filterType).toBe("lowpass");
    expect(watercolor.stickSlipDepth01).toBeLessThan(0.15);
    expect(marker.noiseTexture).toBe("velvet");
    expect(marker.baseFrequencyHz).toBeGreaterThanOrEqual(1100);
    expect(marker.baseFrequencyHz).toBeLessThanOrEqual(2100);
    expect(marker.baseFrequencyHz).toBeGreaterThan(watercolor.baseFrequencyHz + 450);
    expect(charcoal.noiseTexture).toBe("gritty");
    expect(charcoal.stickSlipDepth01).toBeGreaterThan(0.5);
    expect(charcoal.filterQ).toBeLessThan(uprightPencil.filterQ);
    expect(sumi.noiseTexture).toBe("velvet");
    expect(sumi.bodyFrequencyHz).toBeGreaterThan(sumi.baseFrequencyHz);
    expect(oil.mode).toBe("dual-formant-friction");
    expect(oil.bodyFrequencyHz).toBeLessThan(320);
    expect(eraser.bodyFrequencyHz).toBeGreaterThanOrEqual(260);
    expect(eraser.bodyFrequencyHz).toBeLessThanOrEqual(620);

    // 클릭 팝 0 raised-cosine + stick-slip 엔벨로프 검증
    const envCurve = buildRaisedCosineStickSlipEnvelope(0.6, 0.08, 0.25, 0.42, 42, 0.55, 0.3, 48);
    expect(envCurve[0]).toBe(0);
    expect(envCurve[envCurve.length - 1]).toBe(0);
    expect(Math.max(...envCurve)).toBeGreaterThan(0.25);
    expect(Math.max(...envCurve)).toBeLessThanOrEqual(0.6001);

    engine.dispose();
    expect(mock.isClosed()).toBe(true);
  });

  it("연속 36ms 그레인에서 랜덤 시작 오프셋 분산·±3.5% 피치/포먼트 변조·공방 IR/리미터 및 mock 폴백을 보장한다", () => {
    const full = createMockAudioContext("running", { fullWebAudio: true });
    let clock = 2000;
    const engine = new StudioFoleyAudioEngine({
      initialPreset: "lively-asmr",
      audioContextFactory: () => full.ctx,
      minTriggerIntervalMs: 10,
      nowMs: () => clock,
    });

    for (let i = 0; i < 16; i += 1) {
      clock += 36;
      expect(engine.triggerSound("gpen-ink", { speed01: 0.65, pressure01: 0.6, paperTexture: "manga-kent" }).played).toBe(true);
    }

    // 드로잉 매체는 raw oscillator 0개, ConvolverNode 초기 반사음 + DynamicsCompressorNode 리미터 연결
    expect(full.createdOscillators).toHaveLength(0);
    expect(full.createdConvolvers).toHaveLength(1);
    expect(full.createdConvolvers[0]!.hasBuffer).toBe(true);
    expect(full.createdCompressors).toHaveLength(1);
    expect(full.createdCompressors[0]!.threshold[0]).toBeLessThan(0);
    expect(full.createdCompressors[0]!.ratio[0]).toBeGreaterThanOrEqual(4);

    // 16회 연속 그레인이 offset=0 반복 없이 버퍼 전역에 분산되고 ±3.5% 미세 피치·포먼트 변조를 적용한다
    const offsets = full.createdBufferSources.map((s) => s.startOffsets[0] ?? -1);
    expect(new Set(offsets).size).toBeGreaterThanOrEqual(14);
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(1.5);
    for (let i = 1; i < offsets.length; i += 1) {
      expect(Math.abs(offsets[i]! - offsets[i - 1]!)).toBeGreaterThan(0.1);
    }
    const rates = full.createdBufferSources.map((s) => s.playbackRates[0] ?? 1);
    expect(new Set(rates).size).toBeGreaterThanOrEqual(10);
    expect(rates.every((r) => r >= 0.965 && r <= 1.035)).toBe(true);
    const primaryFreqs = full.createdFilters.filter((_, idx) => idx >= 1 && (idx - 1) % 2 === 0).map((f) => f.freqSet[0] ?? 0);
    expect(new Set(primaryFreqs).size).toBeGreaterThanOrEqual(10);

    // raised-cosine 커브가 setValueCurveAtTime으로 전달되어 시작/끝이 정확히 0(클릭 팝 0)
    const curves = full.createdGains.flatMap((g) => g.curves);
    expect(curves.length).toBeGreaterThanOrEqual(16);
    expect(curves.every((c) => c[0] === 0 && c[c.length - 1] === 0)).toBe(true);

    // 공방 나무 책상 IR 임펄스 응답 길이·감쇠 검증
    const ir = synthesizeAtelierRoomImpulseResponse(44100);
    expect(ir.length).toBeGreaterThan(3000);
    expect(Math.abs(ir[ir.length - 1] ?? 1)).toBeLessThan(0.01);

    engine.dispose();
    expect(full.createdConvolvers[0]!.disconnectCalls).toBeGreaterThanOrEqual(1);
    expect(full.createdCompressors[0]!.disconnectCalls).toBeGreaterThanOrEqual(1);
    expect(full.isClosed()).toBe(true);
  });

  it("3종 프리셋(quiet-atelier/lively-asmr/silent-focus)·3채널 믹서·앰비언스·무컨텍스트 폴백을 정확히 처리한다", async () => {
    const mock = createMockAudioContext();
    const engine = new StudioFoleyAudioEngine({
      initialPreset: "quiet-atelier",
      audioContextFactory: () => mock.ctx,
    });

    const presetIds: readonly StudioFoleyPresetId[] = ["quiet-atelier", "lively-asmr", "silent-focus"];
    for (const presetId of presetIds) {
      const state = engine.applyPreset(presetId);
      expect(state.preset).toBe(presetId);
      expect(state.channels.foley).toBe(STUDIO_FOLEY_PRESETS[presetId].foley);
      expect(state.channels.ui).toBe(STUDIO_FOLEY_PRESETS[presetId].ui);
      expect(state.channels.ambience).toBe(STUDIO_FOLEY_PRESETS[presetId].ambience);
    }

    expect(engine.triggerSound("bubble-pop").reason).toBe("muted");
    expect(engine.startAmbience()).toBe(false);

    engine.applyPreset("quiet-atelier");
    expect(await engine.unlock()).toBe(true);
    expect(engine.startAmbience()).toBe(true);
    expect(engine.getMixerState().ambienceRunning).toBe(true);
    engine.setChannelVolume("ui", 0);
    expect(engine.triggerSound("magnetic-detent").reason).toBe("zero-gain");
    engine.stopAmbience();
    expect(engine.getMixerState().ambienceRunning).toBe(false);
    engine.dispose();

    const headless = new StudioFoleyAudioEngine({ audioContextFactory: () => null });
    expect(headless.triggerSound("gpen-ink").reason).toBe("no-audio-context");
    headless.dispose();
  });

  it("onended 시 생성된 모든 오디오 노드를 disconnect하고 suspended 상태에서는 동시 보이스 폭주를 차단한다", async () => {
    // 1) 이중 대역 포먼트 드로잉 보이스(gpen-ink) 및 2-소스 UI 보이스(panel-snap)의 모든 노드가 onended에서 해제됨
    const mock = createMockAudioContext("running");
    const engine = new StudioFoleyAudioEngine({
      initialPreset: "lively-asmr",
      audioContextFactory: () => mock.ctx,
      minTriggerIntervalMs: 0,
    });

    const gpenPlayed = engine.triggerSound("gpen-ink", { speed01: 0.7, pressure01: 0.7 });
    expect(gpenPlayed.played).toBe(true);
    expect(mock.createdBufferSources).toHaveLength(1);
    expect(mock.createdOscillators).toHaveLength(0);
    expect(mock.createdFilters).toHaveLength(2);
    mock.createdBufferSources[0]!.fireEnded();
    expect(mock.createdBufferSources[0]!.disconnectCalls).toBe(1);
    expect(mock.createdFilters[0]!.disconnectCalls).toBe(1);
    expect(mock.createdFilters[1]!.disconnectCalls).toBe(1);

    const snapPlayed = engine.triggerSound("panel-snap", { pressure01: 0.8 });
    expect(snapPlayed.played).toBe(true);
    expect(mock.createdBufferSources).toHaveLength(2);
    expect(mock.createdOscillators).toHaveLength(1);
    const snapEnvGain = mock.createdGains[mock.createdGains.length - 2]!;
    const snapToneGain = mock.createdGains[mock.createdGains.length - 1]!;

    mock.createdBufferSources[1]!.fireEnded();
    expect(mock.createdBufferSources[1]!.disconnectCalls).toBe(1);
    // oscillator가 끝나기 전에는 공용 env gain을 미리 끊지 않는다
    expect(snapEnvGain.disconnectCalls).toBe(0);

    mock.createdOscillators[0]!.fireEnded();
    expect(mock.createdOscillators[0]!.disconnectCalls).toBe(1);
    expect(snapToneGain.disconnectCalls).toBeGreaterThanOrEqual(1);
    expect(snapEnvGain.disconnectCalls).toBeGreaterThanOrEqual(1);
    engine.dispose();

    // 2) suspended 상태에서는 resume()만 중복 없이 요청하고 보이스 노드를 쌓지 않는다
    const pendingResume = Promise.withResolvers<void>();
    const suspendedMock = createMockAudioContext("suspended");
    vi.mocked(suspendedMock.ctx.resume).mockReturnValue(pendingResume.promise);

    const suspendedEngine = new StudioFoleyAudioEngine({
      initialPreset: "lively-asmr",
      audioContextFactory: () => suspendedMock.ctx,
      minTriggerIntervalMs: 0,
    });
    const r1 = suspendedEngine.triggerSound("gpen-ink");
    const r2 = suspendedEngine.triggerSound("graphite-pencil");
    expect(r1.played).toBe(false);
    expect(r1.reason).toBe("suspended");
    expect(r2.played).toBe(false);
    expect(r2.reason).toBe("suspended");
    expect(suspendedMock.createdBufferSources).toHaveLength(0);
    expect(suspendedMock.createdOscillators).toHaveLength(0);
    expect(suspendedMock.ctx.resume).toHaveBeenCalledTimes(1);

    suspendedMock.setState("running");
    pendingResume.resolve();
    await pendingResume.promise;
    expect(suspendedEngine.triggerSound("gpen-ink").played).toBe(true);
    suspendedEngine.dispose();
  });
});

describe("5. 터치 파티클 · 5종 종이 질감 · Kubelka-Munk 안료 혼색 · 햅틱 디텐트 엔진", () => {
  it("5종 장르 분위기 터치 파티클 생성·물리 스텝·모션 감소 축소가 정확히 동작한다", () => {
    const kinds: readonly StudioTactileParticleKind[] = [
      "romance-blossom",
      "action-ink-splatter",
      "healing-watercolor-ripple",
      "eraser-crumb-curl",
      "magic-prism-scan",
    ];
    const system = new StudioTactileParticleSystem(64);

    for (const kind of kinds) {
      expect(STUDIO_TACTILE_PARTICLE_SPECS[kind].labelKo.length).toBeGreaterThan(2);
      const burst = system.emit({ kind, x: 120, y: 180, intensity01: 0.8, seed: 42 });
      expect(burst.length).toBeGreaterThanOrEqual(2);
      expect(burst.every((p) => p.kind === kind && p.accentToken.startsWith("--ts-vibrant-"))).toBe(true);
    }

    const beforeStep = system.getParticles();
    const afterStep = system.step(120);
    expect(afterStep.length).toBeGreaterThan(0);
    expect(afterStep[0]!.ageMs).toBe(120);
    expect(afterStep[0]!.opacity).toBeLessThan(beforeStep[0]!.opacity);

    // 수채 물결 링은 시간이 지날수록 반경이 확장된다
    const ripple = createTactileParticleBurst({
      kind: "healing-watercolor-ripple",
      x: 50,
      y: 50,
      seed: 7,
    });
    const steppedRipple = stepTactileParticles(ripple, 150);
    expect(steppedRipple[0]!.sizePx).toBeGreaterThan(ripple[0]!.sizePx);

    // 모션 감소 모드에서는 단일 정적 파티클(속도 0)로 축소된다
    const reduced = createTactileParticleBurst({
      kind: "action-ink-splatter",
      x: 10,
      y: 20,
      reducedMotion: true,
      seed: 9,
    });
    expect(reduced).toHaveLength(1);
    expect(reduced[0]!.vx).toBe(0);
    expect(reduced[0]!.vy).toBe(0);
  });

  it("5종 종이 질감 물리 프로필(PAPER_TOOTH_PROFILES)과 저항·골 스킵률 계산이 물리적으로 정합하다", () => {
    expect(STUDIO_PAPER_TEXTURE_IDS).toHaveLength(5);
    for (const id of STUDIO_PAPER_TEXTURE_IDS) {
      const profile = PAPER_TOOTH_PROFILES[id];
      expect(getPaperToothProfile(id)).toBe(profile);
      expect(profile.labelKo.length).toBeGreaterThan(2);
    }

    const bristol = samplePaperToothResistance("smooth-bristol", 0.35, 0.6);
    const roughCotton = samplePaperToothResistance("rough-cotton", 0.35, 0.6);
    expect(roughCotton.dragForce01).toBeGreaterThan(bristol.dragForce01);
    expect(roughCotton.valleySkipProbability01).toBeGreaterThan(bristol.valleySkipProbability01);
    expect(roughCotton.capillaryBloomRadiusPx).toBeGreaterThan(bristol.capillaryBloomRadiusPx);
  });

  it("Kubelka-Munk 근사 안료 혼색에서 울트라마린 블루 + 카드뮴 옐로우가 선명한 녹색을 도출하고 웨트 웰이 동작한다", () => {
    const blue = STUDIO_PORCELAIN_BASE_PIGMENTS.ultramarine!;
    const yellow = STUDIO_PORCELAIN_BASE_PIGMENTS.cadmiumYellow!;
    const greenMix = mixPigmentsKubelkaMunk(blue, yellow, 0.5, 0);

    // 물리 감산 혼색 핵심 검증: 녹색 채널이 적·청 채널보다 우세하고 OKLCH 녹색 색상각 대역(110~175°)에 위치
    expect(greenMix.g).toBeGreaterThan(greenMix.r);
    expect(greenMix.g).toBeGreaterThan(greenMix.b);
    expect(greenMix.oklchH).toBeGreaterThanOrEqual(105);
    expect(greenMix.oklchH).toBeLessThanOrEqual(175);
    expect(greenMix.cssOklch).toMatch(/^oklch\(/u);

    // 물 희석 시 명도(oklchL)가 상승한다
    const diluted = mixPigmentsKubelkaMunk(blue, yellow, 0.5, 0.65);
    expect(diluted.oklchL).toBeGreaterThan(greenMix.oklchL);

    // 도자기 웨트 믹싱 웰 상태 전이 검증
    const well = createPorcelainWetMixingWell(6);
    expect(well.slotCount).toBe(6);
    well.depositPigment(0, blue, 0.7, 0.1);
    well.depositPigment(1, yellow, 0.7, 0.1);
    const swirled = well.swirlSlots(1, 0, 0.5);
    expect(swirled.pigment).not.toBeNull();
    expect(swirled.pigment!.g).toBeGreaterThan(swirled.pigment!.r);

    const watered = well.addWater(0, 0.45);
    expect(watered.water01).toBeGreaterThan(swirled.water01);
    expect(watered.pigment!.oklchL).toBeGreaterThan(swirled.pigment!.oklchL);

    expect(well.rinseSlot(0).pigment).toBeNull();
    expect(well.rinseAll().every((slot) => slot.pigment === null)).toBe(true);
  });

  it("Web Vibration 및 Gamepad dual-rumble 햅틱 디텐트 트리거와 모션 감소 차단이 정확히 동작한다", () => {
    const vibrate = vi.fn(() => true);
    const playEffect = vi.fn(async () => "complete");
    const mockNav: StudioHapticNavigatorLike = {
      vibrate,
      getGamepads: () => [{ connected: true, vibrationActuator: { playEffect } }],
    };

    expect(Object.keys(STUDIO_HAPTIC_PATTERNS)).toHaveLength(6);
    const res = triggerTactileHapticDetent("panel-snap", {
      navigatorLike: mockNav,
      intensity01: 0.8,
    });
    expect(res.vibrated).toBe(true);
    expect(res.gamepadActuatorsTriggered).toBe(1);
    expect(res.skippedReason).toBeNull();
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(playEffect).toHaveBeenCalledWith(
      "dual-rumble",
      expect.objectContaining({ duration: STUDIO_HAPTIC_PATTERNS["panel-snap"].gamepadDualRumble.durationMs }),
    );

    const suppressed = triggerTactileHapticDetent("detent-tick", {
      navigatorLike: mockNav,
      reducedMotion: true,
    });
    expect(suppressed.vibrated).toBe(false);
    expect(suppressed.skippedReason).toBe("reduced-motion");

    const unsupported = triggerTactileHapticDetent("ink-bloom", { navigatorLike: null });
    expect(unsupported.skippedReason).toBe("unsupported");
  });

  it("브러시 아틀리에 패널에서 4종 OKLCH 테마·3종 Foley 프리셋·주얼 스프라이트가 실시간 연동된다", () => {
    render(<StudioCspFullBrushAtelierPanel initialBrushId="csp-g-pen" />);
    const panel = screen.getByTestId("studio-csp-full-brush-atelier-panel");
    expect(panel.getAttribute("data-studio-vibrant-theme")).toBe("sunlight-atelier");
    expect(panel.querySelector("[data-vibrant-sprite-id='brush-ink']")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "코랄 팝" }));
    expect(panel.getAttribute("data-studio-vibrant-theme")).toBe("coral-pop");

    fireEvent.click(screen.getByRole("button", { name: "미드나잇 잉크" }));
    expect(panel.getAttribute("data-studio-vibrant-theme")).toBe("midnight-ink");

    const asmrBtn = screen.getByRole("button", { name: "생생한 ASMR" });
    fireEvent.click(asmrBtn);
    expect(asmrBtn.getAttribute("aria-pressed")).toBe("true");
  });
});
