// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_SAFE_FRICTION_GAIN,
  STUDIO_IMPASTO_DEFAULT_RAKING_ELEVATION_RAD,
  type FrictionAudioContextLike,
  type FrictionAudioParamLike,
} from "../imaging-pro/brush-texture-max";
import { StudioCreationModeLauncher } from "../StudioCreationModeLauncher";

import {
  STUDIO_QUICK_MIGRATE_APPLIED_EVENT,
  STUDIO_QUICK_MIGRATE_SHORTCUT_EVENT,
  StudioQuickMigrateWizard,
  TEXTURE_MAX_FRAME_BUDGET_MS,
  buildImpastoParamsFromInspectorConfig,
  buildMigratedShortcutPlan,
  buildSampleBrushInputsForTool,
  buildTextureMaxPipelineBadges,
  createBrushTextureMaxInspectorBridge,
  createTextureMax60fpsBudgetGuard,
  dispatchMigratedShortcutProfile,
  inspectImportedBrushFileMetadata,
  listTextureMaxInspectorPresets,
  listToolMigratorProfiles,
  normalizeTextureMaxInspectorConfig,
  recommendSpectralBrushForFile,
  recommendSpectralBrushesForBatch,
  type MigratorSourceToolId,
  type QuickMigrateAppliedBundle,
} from "./index";

afterEach(() => {
  cleanup();
});

function makeSqliteSutBytes(extraAscii = ""): Uint8Array<ArrayBuffer> {
  const header = `SQLite format 3\0${extraAscii}`;
  const out = new Uint8Array(new ArrayBuffer(Math.max(64, header.length)));
  for (let i = 0; i < header.length; i += 1) out[i] = header.charCodeAt(i);
  return out;
}

function makeAbrV6Bytes(sections: readonly string[] = ["samp", "patt"]): Uint8Array {
  const out = new Uint8Array(4 + sections.length * 12);
  out[0] = 0x00;
  out[1] = 0x06;
  out[2] = 0x00;
  out[3] = 0x02;
  sections.forEach((key, idx) => {
    const off = 4 + idx * 12;
    const tag = `8BIM${key.slice(0, 4)}`;
    for (let i = 0; i < 8; i += 1) out[off + i] = tag.charCodeAt(i);
  });
  return out;
}

function makeKppPngBytes(xml: string): Uint8Array {
  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const out = new Uint8Array(pngSig.length + xml.length);
  out.set(pngSig, 0);
  for (let i = 0; i < xml.length; i += 1) out[pngSig.length + i] = xml.charCodeAt(i);
  return out;
}

function makeMockAudioContext(): {
  readonly ctx: FrictionAudioContextLike;
  readonly gainTargets: number[];
} {
  const gainTargets: number[] = [];
  const makeParam = (trackGain = false): FrictionAudioParamLike => ({
    value: 0,
    setTargetAtTime(target: number) {
      this.value = target;
      if (trackGain) gainTargets.push(target);
    },
  });
  const ctx: FrictionAudioContextLike = {
    currentTime: 0.2,
    sampleRate: 44100,
    state: "running",
    destination: {},
    createBuffer: (_ch, length) => {
      const data = new Float32Array(length);
      return { length, getChannelData: () => data };
    },
    createBufferSource: () => ({
      buffer: null,
      loop: false,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
    }),
    createBiquadFilter: () => ({
      type: "bandpass",
      frequency: makeParam(false),
      Q: makeParam(false),
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    createGain: () => ({
      gain: makeParam(true),
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  return { ctx, gainTargets };
}

describe("tool-migrator-preset: 4대 툴 단축키 매핑 & 브러시 자동 추천", () => {
  it("maps CSP, Procreate, Photoshop, and Krita shortcut profiles with zero chord conflicts", () => {
    const profiles = listToolMigratorProfiles();
    expect(profiles.map((p) => p.id)).toEqual(["clip-studio", "procreate", "photoshop", "krita"]);

    const expectedChecks: Record<MigratorSourceToolId, readonly [string, string][]> = {
      "clip-studio": [["tool-pen", "P"], ["tool-pixel", "B"], ["toggle-transparent-color", "C"], ["flip-canvas", "H"], ["redo", "Mod+Y"]],
      procreate: [["tool-pen", "B"], ["tool-blend", "S"], ["quick-hud", "Space"], ["flip-canvas", "H"], ["fit-view", "Mod+0"]],
      photoshop: [["tool-pen", "B"], ["tool-fill", "G"], ["tool-crop", "C"], ["flip-canvas", "Shift+H"], ["redo", "Mod+Shift+Z"]],
      krita: [["tool-fill", "F"], ["tool-eyedropper", "P"], ["flip-canvas", "M"], ["quick-hud", "Tab"], ["toggle-chrome", "Shift+Tab"]],
    };

    for (const profile of profiles) {
      const plan = buildMigratedShortcutPlan(profile.id);
      expect(plan.conflictChords).toEqual([]);
      expect(plan.changedEntries.length).toBeGreaterThan(0);
      for (const [actionId, expectedKey] of expectedChecks[profile.id]) {
        expect(plan.shortcuts[actionId as keyof typeof plan.shortcuts]).toBe(expectedKey);
      }
    }
  });

  it("dispatches shortcut profile via CustomEvent and keeps module free of browser-KV calls", () => {
    const received: unknown[] = [];
    const onEvent = (event: Event) => {
      received.push((event as CustomEvent).detail);
    };
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem");
    const removeItemSpy = vi.spyOn(Storage.prototype, "removeItem");
    window.addEventListener(STUDIO_QUICK_MIGRATE_SHORTCUT_EVENT, onEvent);
    const plan = buildMigratedShortcutPlan("clip-studio");
    expect(dispatchMigratedShortcutProfile(plan)).toBe(true);
    window.removeEventListener(STUDIO_QUICK_MIGRATE_SHORTCUT_EVENT, onEvent);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ presetId: "clip-studio", sourceToolId: "clip-studio" });
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
    getItemSpy.mockRestore();
    removeItemSpy.mockRestore();
  });

  it("verifies .sut, .abr, .kpp, and .brush binary headers and recommends 7-band canonical brushes", () => {
    const sutRec = recommendSpectralBrushForFile({
      fileName: "웹툰_메인_G펜.sut",
      headerBytes: makeSqliteSutBytes("Node Variant G-Pen"),
      sourceToolHint: "clip-studio",
    });
    expect(sutRec.detectedFormat).toBe("sut");
    expect(sutRec.headerInspection.headerVerified).toBe(true);
    expect(sutRec.primary.id).toBe("km7-gpen-ink");
    expect(sutRec.confidence01).toBeGreaterThanOrEqual(0.8);

    const abrRec = recommendSpectralBrushForFile({
      fileName: "Impasto_Oil_Flat.abr",
      headerBytes: makeAbrV6Bytes(["samp", "patt", "desc"]),
      sourceToolHint: "photoshop",
    });
    expect(abrRec.detectedFormat).toBe("abr");
    expect(abrRec.headerInspection.headerVerified).toBe(true);
    expect(abrRec.headerInspection.sectionKeys).toContain("patt");
    expect(abrRec.primary.id).toBe("km7-oil-impasto-30deg");

    // 파일명이 일반적이어도 Krita .kpp XML 헤더(paintopid="colorsmudge")를 판독해 유화/혼색 추천
    const kppHeaderOnly = recommendSpectralBrushForFile({
      fileName: "custom_preset_01.kpp",
      headerBytes: makeKppPngBytes(`<Preset name="Heavy Impasto" paintopid="colorsmudge"/>`),
      sourceToolHint: "krita",
    });
    expect(kppHeaderOnly.detectedFormat).toBe("kpp");
    expect(kppHeaderOnly.headerInspection.headerVerified).toBe(true);
    expect(kppHeaderOnly.primary.id).toBe("km7-oil-impasto-30deg");
    expect(kppHeaderOnly.matchedSignals.some((s) => s.startsWith("헤더:"))).toBe(true);

    const procreateRec = recommendSpectralBrushForFile({
      fileName: "Mineral_Watercolor_Wash.brushset",
      headerBytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]),
      sourceToolHint: "procreate",
    });
    expect(procreateRec.detectedFormat).toBe("procreate-brush");
    expect(procreateRec.headerInspection.headerVerified).toBe(true);
    expect(procreateRec.primary.id).toBe("km7-watercolor-granulation");
  });

  it("gracefully warns on corrupt headers and handles filename-only & sample packs", () => {
    const corruptSut = inspectImportedBrushFileMetadata({
      fileName: "broken_charcoal.sut",
      headerBytes: new Uint8Array([0x00, 0x01, 0x02, 0x03]),
    });
    expect(corruptSut.headerVerified).toBe(false);
    expect(corruptSut.warningKo).toBeTruthy();

    const batch = recommendSpectralBrushesForBatch([
      { fileName: "목탄_데생.abr" },
      { fileName: "갈필_한지_먹붓.sut" },
      { fileName: "Alcohol_Copic_Marker.kpp" },
      { fileName: "Wax_Crayon_Texture.abr" },
      { fileName: "Splatter_Spray_Tone.abr" },
    ]);
    expect(batch.map((r) => r.primary.id)).toEqual([
      "km7-charcoal-laid",
      "km7-sumi-dry-rake",
      "km7-alcohol-marker",
      "km7-wax-crayon",
      "km7-splatter-spray",
    ]);

    for (const tool of ["clip-studio", "procreate", "photoshop", "krita"] as const) {
      const samples = buildSampleBrushInputsForTool(tool);
      expect(samples.length).toBeGreaterThanOrEqual(2);
      const recs = recommendSpectralBrushesForBatch(samples);
      expect(recs.every((r) => r.headerInspection.headerVerified)).toBe(true);
    }
  });
});

describe("brush-texture-max-inspector-bridge: 7대 질감 파이프라인 & 60fps(16.6ms) 가드", () => {
  it("normalizes inspector presets with 30-degree default raking elevation and opt-in audio OFF", () => {
    const presets = listTextureMaxInspectorPresets();
    expect(presets).toHaveLength(5);
    for (const preset of presets) {
      expect(preset.config.frictionAudioOptIn).toBe(false);
      expect(preset.config.impastoElevationDeg).toBe(30);
    }

    const sanitized = normalizeTextureMaxInspectorConfig({
      presetId: "oil-impasto-30deg",
      impastoElevationDeg: Number.NaN,
      impastoHeightScale: 99,
      bristleStrandCount: 99,
      frictionMasterVolume01: 4.5,
    });
    expect(sanitized.impastoElevationDeg).toBe(10);
    expect(sanitized.impastoHeightScale).toBe(12);
    expect(sanitized.bristleStrandCount).toBe(16);
    expect(sanitized.frictionMasterVolume01).toBe(1);
    expect(sanitized.frictionAudioOptIn).toBe(false);

    const oilParams = buildImpastoParamsFromInspectorConfig(
      normalizeTextureMaxInspectorConfig({ presetId: "oil-impasto-30deg" }),
    );
    expect(oilParams.lightElevationRad).toBeCloseTo(STUDIO_IMPASTO_DEFAULT_RAKING_ELEVATION_RAD, 6);
  });

  it("auto-balances quality tiers around 16.6ms 60fps budget with hysteresis recovery", () => {
    const guard = createTextureMax60fpsBudgetGuard({
      initialTier: "ultra",
      upgradeCooldownFrames: 4,
    });
    const oilCfg = normalizeTextureMaxInspectorConfig({
      presetId: "oil-impasto-30deg",
      paperTileSize: 128,
      bristleStrandCount: 16,
    });

    expect(guard.getSnapshot().targetFrameMs).toBe(TEXTURE_MAX_FRAME_BUDGET_MS);
    expect(guard.resolveEffectivePlan(oilCfg).effectivePaperTileSize).toBe(128);
    expect(guard.resolveEffectivePlan(oilCfg).effectiveBristleStrands).toBe(16);

    // 16.6ms 초과 프레임 → 즉시 ultra → high 강등
    const afterOver = guard.recordFrameSample(18.4);
    expect(afterOver.tier).toBe("high");
    expect(afterOver.within60fpsBudget).toBe(false);
    expect(guard.resolveEffectivePlan(oilCfg).effectivePaperTileSize).toBe(64);
    expect(guard.resolveEffectivePlan(oilCfg).effectiveBristleStrands).toBe(12);

    // 26ms 이상 급격한 스파이크 → 2단계 즉시 강등 (high → economy)
    const afterSpike = guard.recordFrameSample(28.0);
    expect(afterSpike.tier).toBe("economy");
    const economyPlan = guard.resolveEffectivePlan(oilCfg);
    expect(economyPlan.effectivePaperTileSize).toBe(32);
    expect(economyPlan.effectiveBristleStrands).toBe(8);
    expect(economyPlan.impastoShaderActive).toBe(false);
    expect(economyPlan.dualGranulationActive).toBe(false);
    expect(economyPlan.sgraffitoActive).toBe(false);

    // 히스테리시스: 짧은 2프레임 회복으로는 성급하게 올리지 않음
    guard.recordFrameSample(6.0);
    guard.recordFrameSample(6.0);
    expect(guard.getSnapshot().tier).toBe("economy");

    // 연속 여유 프레임 확보 시 단계적 복구 (economy → balanced)
    for (let i = 0; i < 6; i += 1) guard.recordFrameSample(6.0);
    expect(guard.getSnapshot().tier).toBe("balanced");
    expect(guard.getSnapshot().within60fpsBudget).toBe(true);
    expect(guard.getSnapshot().recoveryCount).toBeGreaterThanOrEqual(1);

    // NaN/음수 프레임 시간 안전 정제 및 reset 검증
    const sanitized = guard.recordFrameSample(Number.NaN);
    expect(sanitized.lastFrameMs).toBe(0);
    expect(guard.reset("ultra").tier).toBe("ultra");
  });

  it("bridges all 7 brush-texture-max pipelines end-to-end with safe opt-in audio cap", () => {
    const { ctx, gainTargets } = makeMockAudioContext();
    const bridge = createBrushTextureMaxInspectorBridge({
      initialPresetId: "oil-impasto-30deg",
      budgetOptions: { initialTier: "ultra" },
      createAudioContext: () => ctx,
    });

    // 기본 OFF 상태: 오디오 게인 0, 임파스토 64B uniform + 8x8 스와치 산출
    const offRes = bridge.evaluatePreviewStep({
      u: 0.35, v: 0.45, zoomScale: 1.0, tiltRad: Math.PI / 4, pressure: 0.78,
      strokeSpeed: 1.8, strokeAngleRad: 0.3, paintReserve: 0.7, wetness: 0.8,
      dryUnderHeight: 0.55, paintViscosity: 0.75, radialEdge01: 0.2,
      stampCoordU: 0.1, stampCoordV: 0.25,
      canvasSrgbPerStrand: [{ r: 0.9, g: 0.78, b: 0.15 }],
      canvasWetnessPerStrand: [0.85],
      measuredFrameMs: 7.2,
      computeImpastoSwatch: true,
    });

    expect(bridge.getAudioStatus()).toBe("disabled");
    expect(offRes.audioGainCapped).toBe(0);
    expect(offRes.impastoUniformBuffer.byteLength).toBe(64);
    expect(offRes.impastoSwatch).not.toBeNull();
    expect(offRes.impastoSwatch?.litRgbaOut.length).toBe(8 * 8 * 4);
    expect(offRes.step.bristleStep.deposits.length).toBe(16);
    expect(offRes.step.overpaintRelief.effectiveTotalHeight).toBeGreaterThan(0);
    expect(bridge.getPaperTileCacheSize()).toBe(1);

    // Sgraffito 건식 긁힘 실행 확인
    const heightProps = new Float32Array(12 * 12 * 4);
    for (let i = 0; i < 12 * 12; i += 1) {
      heightProps[i * 4] = 0.85;
      heightProps[i * 4 + 2] = 0.4;
      heightProps[i * 4 + 3] = 0.9;
    }
    const sgraffito = bridge.runSgraffitoCarvePreview(heightProps, 12, 12, 0.8);
    expect(sgraffito).not.toBeNull();
    expect(sgraffito!.carvedVolume).toBeGreaterThan(0);
    expect(sgraffito!.pushedRidgeVolume).toBeGreaterThan(0);

    // 옵트인 마찰음 ON → 청력 보호 상한(0.25) 준수
    bridge.updateConfig({ frictionAudioOptIn: true, frictionMasterVolume01: 1.0 });
    const onRes = bridge.evaluatePreviewStep({
      u: 0.5, v: 0.5, zoomScale: 1.0, tiltRad: Math.PI / 6, pressure: 1.0,
      strokeSpeed: 6.0, strokeAngleRad: 0.1, paintReserve: 0.8, wetness: 0.1,
      dryUnderHeight: 0.4, paintViscosity: 0.8, radialEdge01: 0.6,
      stampCoordU: 0, stampCoordV: 0,
      canvasSrgbPerStrand: [{ r: 0.2, g: 0.3, b: 0.8 }],
      canvasWetnessPerStrand: [0.5],
      measuredFrameMs: 6.5,
    });
    expect(bridge.getAudioStatus()).toBe("running");
    expect(onRes.audioGainCapped).toBeGreaterThan(0);
    expect(onRes.audioGainCapped).toBeLessThanOrEqual(MAX_SAFE_FRICTION_GAIN);
    expect(Math.max(...gainTargets)).toBeLessThanOrEqual(MAX_SAFE_FRICTION_GAIN);

    const badges = buildTextureMaxPipelineBadges(onRes.plan);
    expect(badges).toHaveLength(7);
    expect(badges.every((b) => b.active)).toBe(true);

    bridge.reloadPaint({ r: 0.8, g: 0.2, b: 0.2 });
    bridge.dispose();
    expect(bridge.getAudioStatus()).toBe("disposed");
    expect(bridge.getPaperTileCacheSize()).toBe(0);
  });
});

describe("StudioQuickMigrateWizard: 3단계 UI · 키보드 · 접근성 & 런처 연결", () => {
  it("completes the 3-step guest flow with keyboard navigation, brush drop, and Calm Atelier control budget", async () => {
    const onApply = vi.fn<(bundle: QuickMigrateAppliedBundle) => void>();
    const onClose = vi.fn();
    const appliedEvents: QuickMigrateAppliedBundle[] = [];
    const onAppliedEvent = (event: Event) => {
      appliedEvents.push((event as CustomEvent<QuickMigrateAppliedBundle>).detail);
    };
    window.addEventListener(STUDIO_QUICK_MIGRATE_APPLIED_EVENT, onAppliedEvent);

    render(<StudioQuickMigrateWizard open onClose={onClose} onApply={onApply} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("false");
    expect(dialog.getAttribute("data-step")).toBe("1");

    // 1단계 컨트롤 예산 (5~9개) & 모든 버튼 min-h-11 터치 타깃 검증
    const step1Buttons = Array.from(dialog.querySelectorAll("button"));
    expect(step1Buttons.length).toBeGreaterThanOrEqual(5);
    expect(step1Buttons.length).toBeLessThanOrEqual(9);
    expect(step1Buttons.every((btn) => btn.className.includes("min-h-11"))).toBe(true);

    // 1단계: 키보드 ArrowRight로 CSP → Procreate → Photoshop → Krita 이동 검증
    const cspRadio = dialog.querySelector<HTMLButtonElement>('[data-migrate-tool="clip-studio"]')!;
    expect(cspRadio.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(cspRadio, { key: "ArrowRight" });
    expect(dialog.querySelector('[data-migrate-tool="procreate"]')?.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(dialog.querySelector<HTMLButtonElement>('[data-migrate-tool="procreate"]')!, { key: "End" });
    expect(dialog.querySelector('[data-migrate-tool="krita"]')?.getAttribute("aria-checked")).toBe("true");

    // 2단계 진입
    fireEvent.click(screen.getByRole("button", { name: /다음 · 브러시 매핑/ }));
    expect(dialog.getAttribute("data-step")).toBe("2");
    const step2Buttons = Array.from(dialog.querySelectorAll("button"));
    expect(step2Buttons.length).toBeGreaterThanOrEqual(5);
    expect(step2Buttons.length).toBeLessThanOrEqual(9);
    expect(step2Buttons.every((btn) => btn.className.includes("min-h-11"))).toBe(true);

    // 1클릭 예시 브러시 미리보기
    fireEvent.click(dialog.querySelector<HTMLButtonElement>('[data-load-sample-brushes="true"]')!);
    expect(dialog.textContent).toContain("Wet_Bristle_Oil.kpp");
    expect(dialog.textContent).toContain("Krita .kpp");

    // 드래그&드롭으로 .sut 파일 직접 주입 검증
    const dropzone = dialog.querySelector<HTMLDivElement>('[data-brush-dropzone="true"]')!;
    const sutFile = new File([makeSqliteSutBytes("G-Pen")], "웹툰_메인_G펜.sut", { type: "application/octet-stream" });
    fireEvent.dragOver(dropzone);
    expect(dropzone.getAttribute("data-drag-active")).toBe("true");
    fireEvent.drop(dropzone, { dataTransfer: { files: [sutFile] } });
    await waitFor(() => {
      expect(dialog.textContent).toContain("웹툰_메인_G펜.sut");
    });

    // 3단계 진입
    fireEvent.click(screen.getByRole("button", { name: /다음 · 7밴드 질감 확인/ }));
    expect(dialog.getAttribute("data-step")).toBe("3");
    const step3Buttons = Array.from(dialog.querySelectorAll("button"));
    expect(step3Buttons.length).toBeGreaterThanOrEqual(5);
    expect(step3Buttons.length).toBeLessThanOrEqual(9);
    expect(step3Buttons.every((btn) => btn.className.includes("min-h-11"))).toBe(true);

    // 종이 결 키보드 화살표 탐색 & 옵트인 마찰음 Switch 기본 OFF 검증
    const hotPressBtn = dialog.querySelector<HTMLButtonElement>('[data-paper-preset="hot-press"]')!;
    fireEvent.keyDown(hotPressBtn, { key: "ArrowRight" });
    expect(dialog.querySelector('[data-paper-preset="cold-press"]')?.getAttribute("aria-checked")).toBe("true");

    const audioSwitch = screen.getByRole("switch", { name: /종이 마찰음 옵트인/ });
    expect(audioSwitch.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(audioSwitch);
    expect(audioSwitch.getAttribute("aria-checked")).toBe("true");

    // 적용 버튼 클릭 → 콜백 & CustomEvent 발행 & 닫기
    fireEvent.click(dialog.querySelector<HTMLButtonElement>('[data-quick-migrate-apply="true"]')!);
    window.removeEventListener(STUDIO_QUICK_MIGRATE_APPLIED_EVENT, onAppliedEvent);

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0]?.[0];
    expect(applied?.toolId).toBe("krita");
    expect(applied?.shortcutPlan.shortcuts["flip-canvas"]).toBe("M");
    expect(applied?.textureConfig.paperPresetId).toBe("cold-press");
    expect(applied?.textureConfig.frictionAudioOptIn).toBe(true);
    expect(applied?.effectiveTexturePlan.within60fpsBudget).toBe(true);
    expect(appliedEvents).toHaveLength(1);
  });

  it("closes on Escape and launches cleanly from StudioCreationModeLauncher", () => {
    const onQuickMigrateApplied = vi.fn();
    render(
      <StudioCreationModeLauncher
        onSelectMode={vi.fn()}
        onQuickMigrateApplied={onQuickMigrateApplied}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /만들기/ }));
    const migrateTrigger = document.querySelector<HTMLButtonElement>('[data-studio-quick-migrate-trigger="true"]');
    expect(migrateTrigger).not.toBeNull();
    fireEvent.click(migrateTrigger!);

    expect(document.querySelector('[data-studio-quick-migrate-wizard="true"]')).not.toBeNull();

    // Escape 키로 비차단 닫기
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.querySelector('[data-studio-quick-migrate-wizard="true"]')).toBeNull();
  });
});
