// @vitest-environment jsdom

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCspFullBrushAtelierPanel } from "../csp-brush-atelier/StudioCspFullBrushAtelierPanel";

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

function createMockAudioContext() {
  const createdOscillators: { startCalls: number; stopCalls: number; freqSet: number[] }[] = [];
  const createdBufferSources: { startCalls: number; stopCalls: number; loop: boolean }[] = [];
  const createdFilters: { type: string; freqSet: number[]; qSet: number[] }[] = [];
  const createdGains: { valueSet: number[] }[] = [];
  let closed = false;
  let state: AudioContextState = "running";

  const makeParam = (sink: number[]) => ({
    value: 0,
    setValueAtTime: vi.fn((val: number) => {
      sink.push(val);
    }),
    linearRampToValueAtTime: vi.fn((val: number) => {
      sink.push(val);
    }),
    exponentialRampToValueAtTime: vi.fn((val: number) => {
      sink.push(val);
    }),
  });

  const ctx = {
    get state() {
      return state;
    },
    currentTime: 1.25,
    sampleRate: 44100,
    destination: {},
    resume: vi.fn(async () => {
      state = "running";
    }),
    close: vi.fn(async () => {
      closed = true;
      state = "closed";
    }),
    createGain: vi.fn(() => {
      const record = { valueSet: [] as number[] };
      createdGains.push(record);
      return {
        gain: makeParam(record.valueSet),
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
    }),
    createBiquadFilter: vi.fn(() => {
      const record = { type: "lowpass", freqSet: [] as number[], qSet: [] as number[] };
      createdFilters.push(record);
      return {
        get type() {
          return record.type;
        },
        set type(next: string) {
          record.type = next;
        },
        frequency: makeParam(record.freqSet),
        Q: makeParam(record.qSet),
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
    }),
    createOscillator: vi.fn(() => {
      const record = { startCalls: 0, stopCalls: 0, freqSet: [] as number[] };
      createdOscillators.push(record);
      return {
        type: "sine",
        frequency: makeParam(record.freqSet),
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(() => {
          record.startCalls += 1;
        }),
        stop: vi.fn(() => {
          record.stopCalls += 1;
        }),
      };
    }),
    createBuffer: vi.fn((channels: number, length: number, sampleRate: number) => {
      const data = new Float32Array(length);
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData: () => data,
      };
    }),
    createBufferSource: vi.fn(() => {
      const record = { startCalls: 0, stopCalls: 0, loop: false };
      createdBufferSources.push(record);
      return {
        buffer: null,
        get loop() {
          return record.loop;
        },
        set loop(next: boolean) {
          record.loop = next;
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(() => {
          record.startCalls += 1;
        }),
        stop: vi.fn(() => {
          record.stopCalls += 1;
        }),
      };
    }),
  } as unknown as AudioContext;

  return {
    ctx,
    createdOscillators,
    createdBufferSources,
    createdFilters,
    createdGains,
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
    expect(diskIndividualFiles).toHaveLength(44);

    for (const entry of STUDIO_VIBRANT_SPRITE_REGISTRY) {
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
  it("10종 Foley 사운드가 속도·필압·기울기·5종 종이 질감에 따라 물리 주파수와 게인을 조절하며 재생된다", () => {
    const mock = createMockAudioContext();
    let clock = 1000;
    const engine = new StudioFoleyAudioEngine({
      initialPreset: "lively-asmr",
      audioContextFactory: () => mock.ctx,
      minTriggerIntervalMs: 10,
      nowMs: () => clock,
    });

    expect(STUDIO_FOLEY_SOUND_IDS).toHaveLength(10);
    for (const soundId of STUDIO_FOLEY_SOUND_IDS) {
      clock += 25;
      const result = engine.triggerSound(soundId, {
        speed01: 0.72,
        pressure01: 0.65,
        tilt01: 0.3,
        paperTexture: "rough-cotton",
      });
      expect(result.played).toBe(true);
      expect(result.channel).toBe(STUDIO_FOLEY_SOUND_CHANNELS[soundId]);
      expect(result.effectiveGain).toBeGreaterThan(0);
    }

    expect(mock.createdBufferSources.length).toBeGreaterThanOrEqual(8);
    expect(mock.createdOscillators.length).toBeGreaterThanOrEqual(5);

    // 속도·필압·종이 질감에 따른 물리 파라미터 차등 검증
    const slowGpen = computeFoleySynthesisProfile("gpen-ink", {
      speed01: 0.1,
      pressure01: 0.2,
      paperTexture: "rough-cotton",
    });
    const fastGpen = computeFoleySynthesisProfile("gpen-ink", {
      speed01: 0.95,
      pressure01: 0.9,
      paperTexture: "manga-kent",
    });
    expect(fastGpen.baseFrequencyHz).toBeGreaterThan(slowGpen.baseFrequencyHz);
    expect(fastGpen.peakGain).toBeGreaterThan(slowGpen.peakGain);

    // 연필 틸트 증가 시 더 낮고 넓은(낮은 Q) 흑연 눕힘 마찰음 생성
    const uprightPencil = computeFoleySynthesisProfile("graphite-pencil", { tilt01: 0.05 });
    const tiltedPencil = computeFoleySynthesisProfile("graphite-pencil", { tilt01: 0.9 });
    expect(tiltedPencil.baseFrequencyHz).toBeLessThan(uprightPencil.baseFrequencyHz);
    expect(tiltedPencil.filterQ).toBeLessThan(uprightPencil.filterQ);

    engine.dispose();
    expect(mock.isClosed()).toBe(true);
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

    // silent-focus에서는 재생과 앰비언스가 즉시 억제된다
    expect(engine.triggerSound("bubble-pop").reason).toBe("muted");
    expect(engine.startAmbience()).toBe(false);

    // quiet-atelier로 전환 후 앰비언스 시작 및 채널 볼륨 조절
    engine.applyPreset("quiet-atelier");
    expect(await engine.unlock()).toBe(true);
    expect(engine.startAmbience()).toBe(true);
    expect(engine.getMixerState().ambienceRunning).toBe(true);
    engine.setChannelVolume("ui", 0);
    expect(engine.triggerSound("magnetic-detent").reason).toBe("zero-gain");
    engine.stopAmbience();
    expect(engine.getMixerState().ambienceRunning).toBe(false);
    engine.dispose();

    // AudioContext 미지원 환경에서도 예외 없이 안전하게 폴백
    const headless = new StudioFoleyAudioEngine({ audioContextFactory: () => null });
    expect(headless.triggerSound("gpen-ink").reason).toBe("no-audio-context");
    headless.dispose();
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
