// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SHADER_VERSION_TAG,
  EXPORT_PRESETS,
  EXPORT_PRESET_IDS,
  FRAME_BUDGET_60FPS_MS,
  MAX_PARALLEL_WAVE_SLOTS,
  MIN_PARALLEL_WAVE_SLOTS,
  SHADER_PREWARM_MODEL_KIND,
  SHADER_PREWARM_WEBCODECS_SCHEMA_VERSION,
  StudioShaderPrewarmWebCodecsPanel,
  TARGET_AUDIO_LOUDNESS_LUFS,
  WEBCODECS_CODEC_IDS,
  WEBCODECS_CODEC_PROFILES,
  WGSL_CORE_PIPELINES,
  WGSL_PIPELINE_IDS,
  buildShaderWebCodecsPlan,
  buildWgslPipelineCacheKey,
  computeDeterministicContentHash,
  exportShaderWebCodecsManifestJson,
  getExportPreset,
  normalizeShaderPrewarmConfig,
  planLocalWebCodecsExport,
  planShaderPrewarmWaves,
  resolveCodecFallbackChain,
  type ShaderWebCodecsCombinedPlan,
} from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("1. 12종 핵심 WGSL 파이프라인 카탈로그 및 결정론적 내용 해시 캐시 키", () => {
  it("ToonStudio 핵심 12종 WGSL 파이프라인이 중복 없이 모두 등록되어 있다", () => {
    expect(WGSL_CORE_PIPELINES).toHaveLength(12);
    expect(WGSL_PIPELINE_IDS).toHaveLength(12);
    const uniqueIds = new Set(WGSL_CORE_PIPELINES.map((item) => item.id));
    expect(uniqueIds.size).toBe(12);
  });

  it("12종 파이프라인이 Wave 1(4종)·Wave 2(4종)·Wave 3(4종)으로 정확히 분할된다", () => {
    const wave1 = WGSL_CORE_PIPELINES.filter((p) => p.wave === 1);
    const wave2 = WGSL_CORE_PIPELINES.filter((p) => p.wave === 2);
    const wave3 = WGSL_CORE_PIPELINES.filter((p) => p.wave === 3);
    expect(wave1).toHaveLength(4);
    expect(wave2).toHaveLength(4);
    expect(wave3).toHaveLength(4);
  });

  it("Wave 1 4종(Brush KM7 f16·Dry-Media Tooth·Sparse Tile·Vello 6-Stage)은 첫 획 필수로 표시된다", () => {
    const wave1Ids = WGSL_CORE_PIPELINES.filter((p) => p.wave === 1).map((p) => p.id);
    expect(wave1Ids).toEqual([
      "brush-km7-f16",
      "dry-media-tooth",
      "sparse-tile-composite",
      "vello-6-stage",
    ]);
    for (const item of WGSL_CORE_PIPELINES.filter((p) => p.wave === 1)) {
      expect(item.firstStrokeCritical).toBe(true);
      expect(item.idleWarmEligible).toBe(false);
    }
  });

  it("Wave 2/3 8종(Radiance Cascades 3종·Mega-Atlas·3D LT·LUT·4K YUV·Subtitle)은 유휴 워밍 대상이다", () => {
    const idleIds = WGSL_CORE_PIPELINES.filter((p) => p.wave !== 1).map((p) => p.id);
    expect(idleIds).toEqual([
      "radiance-cascades-jfa",
      "radiance-cascades-probe",
      "radiance-cascades-merge",
      "infinite-zoom-mega-atlas",
      "bg3d-lt-lineart",
      "color-script-lut",
      "videoframe-yuv-4k-convert",
      "subtitle-overlay-composite",
    ]);
    for (const item of WGSL_CORE_PIPELINES.filter((p) => p.wave !== 1)) {
      expect(item.idleWarmEligible).toBe(true);
      expect(item.firstStrokeCritical).toBe(false);
    }
  });

  it("computeDeterministicContentHash가 ES2017 안전 8자리 16진수 결정론적 해시를 반환한다", () => {
    const h1 = computeDeterministicContentHash("toonstudio:km7:v1");
    const h2 = computeDeterministicContentHash("toonstudio:km7:v1");
    const h3 = computeDeterministicContentHash("toonstudio:km7:v2");
    expect(h1).toMatch(/^[0-9a-f]{8}$/u);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it("buildWgslPipelineCacheKey가 shaderVersionTag 변경 시 캐시 키를 즉시 무효화한다", () => {
    const brush = WGSL_CORE_PIPELINES[0];
    const k1 = buildWgslPipelineCacheKey(brush, "wgsl-2026.11-r1");
    const k2 = buildWgslPipelineCacheKey(brush, "wgsl-2026.11-r2");
    expect(k1.cacheKey).toBe(`toonstudio:pso:brush-km7-f16:${k1.contentHash}`);
    expect(k1.contentHash).not.toBe(k2.contentHash);
    expect(k1.cacheKey).not.toBe(k2.cacheKey);
  });

  it("normalizeShaderPrewarmConfig가 경계 밖 병렬 슬롯과 유휴 예산을 안전하게 클램프한다", () => {
    const low = normalizeShaderPrewarmConfig({ parallelWaveSlots: -3, idleCallbackBudgetMs: 1, shaderVersionTag: "   " });
    const high = normalizeShaderPrewarmConfig({ parallelWaveSlots: 99, idleCallbackBudgetMs: 999 });
    const nanCase = normalizeShaderPrewarmConfig({ parallelWaveSlots: Number.NaN, idleCallbackBudgetMs: Number.NaN });
    expect(low.parallelWaveSlots).toBe(MIN_PARALLEL_WAVE_SLOTS);
    expect(low.idleCallbackBudgetMs).toBe(4);
    expect(low.shaderVersionTag).toBe(DEFAULT_SHADER_VERSION_TAG);
    expect(high.parallelWaveSlots).toBe(MAX_PARALLEL_WAVE_SLOTS);
    expect(high.idleCallbackBudgetMs).toBe(50);
    expect(nanCase.parallelWaveSlots).toBe(MIN_PARALLEL_WAVE_SLOTS);
  });

  it("정직한 모델 식별자(deterministic-pipeline-prewarm-and-codec-budget-model)와 Current/Target 구분을 유지한다", () => {
    const plan = planShaderPrewarmWaves();
    expect(plan.modelKind).toBe(SHADER_PREWARM_MODEL_KIND);
    expect(plan.modelKind).toBe("deterministic-pipeline-prewarm-and-codec-budget-model");
    expect(plan.honestScopeDisclosure.currentImplementationKo).toContain("현재 구현(Current)");
    expect(plan.honestScopeDisclosure.targetRuntimeKo).toContain("목표 런타임(Target)");
  });
});

describe("2. 3-Wave 비동기 프리컴파일 오케스트레이터 및 콜드 스터터 비교 모델", () => {
  it("planShaderPrewarmWaves가 3-Wave 및 12개 태스크에 알맞은 WebGPU/Idle 디스패치 API를 배정한다", () => {
    const plan = planShaderPrewarmWaves();
    expect(plan.waves).toHaveLength(3);
    expect(plan.tasks).toHaveLength(12);
    expect(plan.waves[0]?.dispatchStrategy).toBe("createComputePipelineAsync");
    expect(plan.waves[1]?.dispatchStrategy).toBe("requestIdleCallback+createComputePipelineAsync");
    expect(plan.waves[2]?.dispatchStrategy).toBe("requestIdleCallback+createComputePipelineAsync");
  });

  it("Wave 1→2→3 시간축이 연속되며 모든 파이프라인 태스크가 양수 구간(startMs < endMs)을 가진다", () => {
    const plan = planShaderPrewarmWaves({ parallelWaveSlots: 2, cacheHitEnabled: false });
    const [w1, w2, w3] = plan.waves;
    expect(w1?.startMs).toBe(0);
    expect(w1?.endMs).toBe(w2?.startMs);
    expect(w2?.endMs).toBe(w3?.startMs);
    for (const task of plan.tasks) {
      expect(task.endMs).toBeGreaterThan(task.startMs);
      expect(task.laneIndex).toBeGreaterThanOrEqual(0);
      expect(task.laneIndex).toBeLessThan(2);
    }
  });

  it("병렬 웨이브 슬롯을 1→2→4로 늘릴수록 콜드 총 워밍 시간과 Wave 1 준비 시간이 단조 감소한다", () => {
    const p1 = planShaderPrewarmWaves({ parallelWaveSlots: 1, cacheHitEnabled: false });
    const p2 = planShaderPrewarmWaves({ parallelWaveSlots: 2, cacheHitEnabled: false });
    const p4 = planShaderPrewarmWaves({ parallelWaveSlots: 4, cacheHitEnabled: false });
    expect(p1.stutterComparison.totalPrewarmWallTimeMs).toBeGreaterThan(p2.stutterComparison.totalPrewarmWallTimeMs);
    expect(p2.stutterComparison.totalPrewarmWallTimeMs).toBeGreaterThan(p4.stutterComparison.totalPrewarmWallTimeMs);
    expect(p1.stutterComparison.wave1ReadyWallTimeMs).toBeGreaterThan(p4.stutterComparison.wave1ReadyWallTimeMs);
  });

  it("프리컴파일 캐시 히트(true)가 콜드 컴파일(false) 대비 총 워밍 시간을 대폭 단축한다", () => {
    const warm = planShaderPrewarmWaves({ parallelWaveSlots: 3, cacheHitEnabled: true });
    const cold = planShaderPrewarmWaves({ parallelWaveSlots: 3, cacheHitEnabled: false });
    expect(warm.stutterComparison.cacheHitRatio).toBe(1);
    expect(cold.stutterComparison.cacheHitRatio).toBe(0);
    expect(warm.stutterComparison.totalPrewarmWallTimeMs).toBeLessThan(cold.stutterComparison.totalPrewarmWallTimeMs * 0.15);
  });

  it("부분 캐시 적중 목록(cachedPipelineIds) 지정 시 해당 파이프라인만 캐시 비용을 적용한다", () => {
    const partial = planShaderPrewarmWaves({
      parallelWaveSlots: 2,
      cachedPipelineIds: ["brush-km7-f16", "dry-media-tooth", "vello-6-stage"],
    });
    expect(partial.stutterComparison.cacheHitCount).toBe(3);
    expect(partial.stutterComparison.cacheHitRatio).toBe(0.25);
    const km7 = partial.tasks.find((t) => t.pipeline.id === "brush-km7-f16");
    const sparse = partial.tasks.find((t) => t.pipeline.id === "sparse-tile-composite");
    expect(km7?.cacheHit).toBe(true);
    expect(km7?.compileCostMs).toBe(km7?.warmCacheCostMs);
    expect(sparse?.cacheHit).toBe(false);
    expect(sparse?.compileCostMs).toBe(sparse?.coldCompileCostMs);
  });

  it("콜드 스타트 첫 획 스터터 vs 3-Wave 프리컴파일 캐시 비교 모델이 0 프레임 드랍을 검증한다", () => {
    const plan = planShaderPrewarmWaves({ cacheHitEnabled: true });
    const cmp = plan.stutterComparison;
    expect(cmp.frameBudget60fpsMs).toBe(FRAME_BUDGET_60FPS_MS);
    expect(cmp.coldStartFirstStrokeBlockingMs).toBeGreaterThan(100);
    expect(cmp.coldStartDroppedFrames60fps).toBeGreaterThanOrEqual(7);
    expect(cmp.coldStartDroppedFrames120hz).toBeGreaterThanOrEqual(14);
    expect(cmp.prewarmFirstStrokeBlockingMs).toBe(0);
    expect(cmp.prewarmDroppedFrames60fps).toBe(0);
    expect(cmp.firstStrokeStutterReductionPct).toBe(100);
    expect(cmp.nonBlockingMainThread).toBe(true);
  });

  it("Wave 1은 유휴 슬라이스 0회이고 Wave 2/3는 idleCallbackBudgetMs에 맞춰 유휴 슬라이스를 계산한다", () => {
    const tight = planShaderPrewarmWaves({ cacheHitEnabled: false, parallelWaveSlots: 1, idleCallbackBudgetMs: 8 });
    const loose = planShaderPrewarmWaves({ cacheHitEnabled: false, parallelWaveSlots: 1, idleCallbackBudgetMs: 40 });
    expect(tight.waves[0]?.idleSlicesRequired).toBe(0);
    expect(tight.waves[1]?.idleSlicesRequired).toBeGreaterThan(loose.waves[1]?.idleSlicesRequired ?? 0);
    expect(tight.waves[2]?.idleSlicesRequired).toBeGreaterThan(loose.waves[2]?.idleSlicesRequired ?? 0);
  });

  it("cacheNamespaceKey가 버전 태그 변경을 반영해 전체 캐시 무효화를 보장한다", () => {
    const a = planShaderPrewarmWaves({ shaderVersionTag: "v1" });
    const b = planShaderPrewarmWaves({ shaderVersionTag: "v2" });
    expect(a.cacheNamespaceKey).not.toBe(b.cacheNamespaceKey);
    expect(a.cacheNamespaceKey).toContain("toonstudio:wgsl-wave-cache:v1:");
  });

  it("콜드 전체 누적 스터터가 Wave 1 첫 획 스터터보다 크다", () => {
    const plan = planShaderPrewarmWaves();
    expect(plan.stutterComparison.coldStartTotalOnDemandStallMs).toBeGreaterThan(
      plan.stutterComparison.coldStartFirstStrokeBlockingMs,
    );
  });
});

describe("3. 로컬 WebCodecs 4K 60fps 출고 프리셋 · 코덱 자동 폴백 · OPFS Fail-Closed 안전 게이트", () => {
  it("4종 플랫폼 출고 프리셋과 3종 하드웨어 코덱이 명세대로 정의되어 있다", () => {
    expect(EXPORT_PRESETS).toHaveLength(4);
    expect(EXPORT_PRESET_IDS).toEqual([
      "shorts-reels-1080x1920-60fps",
      "youtube-4k-3840x2160-60fps",
      "webtoon-trailer-1440p-30fps",
      "mobile-lite-720x1280-30fps",
    ]);
    expect(WEBCODECS_CODEC_PROFILES).toHaveLength(3);
    expect(WEBCODECS_CODEC_IDS).toEqual(["av1", "hevc", "h264"]);
  });

  it("YouTube 4K 60fps + AV1 기본 구성이 av01.0.12M.08, GOP 120f, Opus -14 LUFS를 산출한다", () => {
    const plan = planLocalWebCodecsExport({
      presetId: "youtube-4k-3840x2160-60fps",
      codecId: "av1",
      durationSec: 60,
      opfsFreeMb: 2048,
    });
    expect(plan.preset.width).toBe(3840);
    expect(plan.preset.height).toBe(2160);
    expect(plan.preset.fps).toBe(60);
    expect(plan.codecResolution.activeCodecString).toBe("av01.0.12M.08");
    expect(plan.codecResolution.fallbackApplied).toBe(false);
    expect(plan.gopFrames).toBe(120);
    expect(plan.keyframeCount).toBe(30);
    expect(plan.targetVideoBitrateMbps).toBe(30.6);
    expect(plan.audioCodec).toBe("opus");
    expect(plan.audioLoudnessLufs).toBe(TARGET_AUDIO_LOUDNESS_LUFS);
  });

  it("AV1 하드웨어 미지원 시 HEVC(hvc1) 하드웨어 인코더로 자동 폴백한다", () => {
    const preset = getExportPreset("youtube-4k-3840x2160-60fps");
    const chain = resolveCodecFallbackChain("av1", preset, { av1: false, hevc: true, h264: true });
    expect(chain.requestedCodecId).toBe("av1");
    expect(chain.activeCodec.id).toBe("hevc");
    expect(chain.activeCodecString).toBe("hvc1.1.6.L153.B0");
    expect(chain.fallbackApplied).toBe(true);
    expect(chain.hardwareAccelerated).toBe(true);
    expect(chain.fallbackSteps).toHaveLength(3);
  });

  it("AV1·HEVC 모두 하드웨어 미지원 시 H.264(avc1) 하드웨어 경로로 2단 자동 폴백한다", () => {
    const preset = getExportPreset("shorts-reels-1080x1920-60fps");
    const chain = resolveCodecFallbackChain("av1", preset, { av1: false, hevc: false, h264: true });
    expect(chain.activeCodec.id).toBe("h264");
    expect(chain.activeCodecString).toBe("avc1.64002a");
    expect(chain.fallbackApplied).toBe(true);
    expect(chain.hardwareAccelerated).toBe(true);
    expect(chain.hardwareAccelerationPref).toBe("prefer-hardware");
  });

  it("3종 하드웨어 인코더가 모두 비활성일 때 H.264 prefer-software 비상 경로로 안전 전환한다", () => {
    const preset = getExportPreset("youtube-4k-3840x2160-60fps");
    const chain = resolveCodecFallbackChain("av1", preset, { av1: false, hevc: false, h264: false });
    expect(chain.activeCodec.id).toBe("h264");
    expect(chain.fallbackApplied).toBe(true);
    expect(chain.hardwareAccelerated).toBe(false);
    expect(chain.hardwareAccelerationPref).toBe("prefer-software");
  });

  it("HEVC 요청은 2단계 체인, H.264 요청은 1단계 체인만 평가한다", () => {
    const preset = getExportPreset("webtoon-trailer-1440p-30fps");
    const hevcChain = resolveCodecFallbackChain("hevc", preset);
    const h264Chain = resolveCodecFallbackChain("h264", preset);
    expect(hevcChain.fallbackSteps.map((s) => s.codecId)).toEqual(["hevc", "h264"]);
    expect(h264Chain.fallbackSteps.map((s) => s.codecId)).toEqual(["h264"]);
  });

  it("동일 프리셋과 길이에서 예상 출력 파일 크기가 AV1 < HEVC < H.264 순서를 만족한다", () => {
    const av1 = planLocalWebCodecsExport({ presetId: "youtube-4k-3840x2160-60fps", codecId: "av1", durationSec: 60 });
    const hevc = planLocalWebCodecsExport({ presetId: "youtube-4k-3840x2160-60fps", codecId: "hevc", durationSec: 60 });
    const h264 = planLocalWebCodecsExport({ presetId: "youtube-4k-3840x2160-60fps", codecId: "h264", durationSec: 60 });
    expect(av1.estimatedOutputMb).toBeLessThan(hevc.estimatedOutputMb);
    expect(hevc.estimatedOutputMb).toBeLessThan(h264.estimatedOutputMb);
  });

  it("Zero-Copy 4단계(GPUTexture→VideoFrame→VideoEncoder→OPFS MP4) 모두 CPU Readback이 0회다", () => {
    const plan = planLocalWebCodecsExport({ presetId: "youtube-4k-3840x2160-60fps", codecId: "av1" });
    expect(plan.zeroCopyStages.map((s) => s.id)).toEqual([
      "gpu-texture-source",
      "video-frame-wrap",
      "video-encoder-hw",
      "opfs-mp4-muxer",
    ]);
    for (const stage of plan.zeroCopyStages) {
      expect(stage.cpuReadbackCopies).toBe(0);
    }
  });

  it("OPFS 잔여 용량이 충분하면 PASS, 경계 여유 구간이면 WARN 상태를 반환한다", () => {
    const passPlan = planLocalWebCodecsExport({ presetId: "youtube-4k-3840x2160-60fps", codecId: "av1", durationSec: 60, opfsFreeMb: 2048 });
    expect(passPlan.opfsSafetyGate.status).toBe("pass");
    expect(passPlan.opfsSafetyGate.canStartExport).toBe(true);

    const warnFreeMb = Math.ceil(passPlan.opfsSafetyGate.requiredWorkspaceMb + 80);
    const warnPlan = planLocalWebCodecsExport({ presetId: "youtube-4k-3840x2160-60fps", codecId: "av1", durationSec: 60, opfsFreeMb: warnFreeMb });
    expect(warnPlan.opfsSafetyGate.status).toBe("warn");
    expect(warnPlan.opfsSafetyGate.canStartExport).toBe(true);
  });

  it("OPFS 여유 용량이 필요 작업공간보다 적으면 Fail-Closed로 출고를 즉시 차단(blocked)한다", () => {
    const blocked = planLocalWebCodecsExport({
      presetId: "youtube-4k-3840x2160-60fps",
      codecId: "h264",
      durationSec: 120,
      opfsFreeMb: 256,
    });
    expect(blocked.opfsSafetyGate.status).toBe("blocked");
    expect(blocked.opfsSafetyGate.canStartExport).toBe(false);
    expect(blocked.opfsSafetyGate.failClosedEnforced).toBe(true);
    expect(blocked.opfsSafetyGate.remainingAfterExportMb).toBeLessThan(0);
  });

  it("로컬 WebCodecs 직결 출고 서버비가 모든 프리셋에서 $0이며 클라우드 참고 절감액을 산출한다", () => {
    for (const presetId of EXPORT_PRESET_IDS) {
      const plan = planLocalWebCodecsExport({ presetId, durationSec: 90 });
      expect(plan.serverCostSavings.localServerCostUsd).toBe(0);
      expect(plan.serverCostSavings.cloudReferencePerExportUsd).toBeGreaterThan(0);
      expect(plan.serverCostSavings.monthly100ExportsSavedUsd).toBeGreaterThan(0);
    }
  });
});

describe("4. JSON 매니페스트 내보내기 및 StudioShaderPrewarmWebCodecsPanel UI 검증", () => {
  it("exportShaderWebCodecsManifestJson이 스키마·12개 캐시 키·WebCodecs·OPFS 게이트를 포함한 유효 JSON을 반환한다", () => {
    const combined = buildShaderWebCodecsPlan({
      prewarm: { parallelWaveSlots: 3, cacheHitEnabled: true },
      exportConfig: { presetId: "shorts-reels-1080x1920-60fps", codecId: "av1", durationSec: 45, opfsFreeMb: 1024 },
    });
    const raw = exportShaderWebCodecsManifestJson(combined);
    const parsed = JSON.parse(raw) as {
      schemaVersion: string;
      modelKind: string;
      prewarm: { waves: Array<{ pipelines: Array<{ cacheKey: string }> }> };
      webCodecsExport: { presetId: string; serverCostSavings: { localServerCostUsd: number } };
    };
    expect(parsed.schemaVersion).toBe(SHADER_PREWARM_WEBCODECS_SCHEMA_VERSION);
    expect(parsed.modelKind).toBe(SHADER_PREWARM_MODEL_KIND);
    const totalPipelines = parsed.prewarm.waves.reduce((sum, w) => sum + w.pipelines.length, 0);
    expect(totalPipelines).toBe(12);
    expect(parsed.webCodecsExport.presetId).toBe("shorts-reels-1080x1920-60fps");
    expect(parsed.webCodecsExport.serverCostSavings.localServerCostUsd).toBe(0);
  });

  it("props 미전달 기본 렌더링 시 2단 SVG, 12개 파이프라인 행, 4종 KPI 카드가 정상 표시된다", () => {
    render(<StudioShaderPrewarmWebCodecsPanel />);
    const ganttSvg = screen.getByTestId("shader-prewarm-gantt-svg");
    const pipelineSvg = screen.getByTestId("webcodecs-zerocopy-pipeline-svg");
    expect(ganttSvg.getAttribute("data-pipeline-count")).toBe("12");
    expect(ganttSvg.getAttribute("data-model-kind")).toBe(SHADER_PREWARM_MODEL_KIND);
    expect(pipelineSvg.getAttribute("data-preset-id")).toBe("youtube-4k-3840x2160-60fps");
    expect(pipelineSvg.getAttribute("data-server-cost-usd")).toBe("0");
    expect(screen.getByTestId("wgsl-prewarm-table").querySelectorAll("tbody tr")).toHaveLength(12);
  });

  it("4종 출고 프리셋 버튼 전환 시 우측 SVG와 onPlanChange 콜백이 즉시 갱신된다", () => {
    const onPlanChange = vi.fn();
    render(<StudioShaderPrewarmWebCodecsPanel onPlanChange={onPlanChange} />);
    fireEvent.click(screen.getByTestId("preset-btn-shorts-reels-1080x1920-60fps"));
    expect(screen.getByTestId("webcodecs-zerocopy-pipeline-svg").getAttribute("data-preset-id")).toBe(
      "shorts-reels-1080x1920-60fps",
    );
    expect(onPlanChange).toHaveBeenCalledTimes(1);
    const [nextPlan] = onPlanChange.mock.calls[0] as [ShaderWebCodecsCombinedPlan];
    expect(nextPlan.webCodecsExport.preset.width).toBe(1080);
    expect(nextPlan.webCodecsExport.preset.height).toBe(1920);
  });

  it("코덱 선택 및 AV1/HEVC 하드웨어 미지원 토글 시 자동 폴백 체인이 실시간 반영된다", () => {
    render(<StudioShaderPrewarmWebCodecsPanel initialCodecId="av1" />);
    const svg = screen.getByTestId("webcodecs-zerocopy-pipeline-svg");
    expect(svg.getAttribute("data-active-codec")).toBe("av1");
    expect(svg.getAttribute("data-fallback-applied")).toBe("false");

    fireEvent.click(screen.getByTestId("hw-fallback-av1-toggle"));
    expect(svg.getAttribute("data-active-codec")).toBe("hevc");
    expect(svg.getAttribute("data-fallback-applied")).toBe("true");

    fireEvent.click(screen.getByTestId("hw-fallback-hevc-toggle"));
    expect(svg.getAttribute("data-active-codec")).toBe("h264");
    expect(screen.getByTestId("codec-fallback-reason").textContent).toContain("H.264");
  });

  it("병렬 웨이브 슬롯과 프리컴파일 캐시 HIT/COLD 토글이 좌측 간트 차트 속성을 갱신한다", () => {
    render(<StudioShaderPrewarmWebCodecsPanel />);
    const gantt = screen.getByTestId("shader-prewarm-gantt-svg");
    const warmWall = Number(gantt.getAttribute("data-total-wall-ms"));

    fireEvent.click(screen.getByTestId("cache-hit-toggle-btn"));
    expect(gantt.getAttribute("data-cache-hit-enabled")).toBe("false");
    const coldWall3 = Number(gantt.getAttribute("data-total-wall-ms"));
    expect(coldWall3).toBeGreaterThan(warmWall);

    fireEvent.click(screen.getByTestId("parallel-slot-1"));
    expect(gantt.getAttribute("data-parallel-slots")).toBe("1");
    const coldWall1 = Number(gantt.getAttribute("data-total-wall-ms"));
    expect(coldWall1).toBeGreaterThan(coldWall3);
  });

  it("OPFS 여유 용량 256MB 선택 시 4K 60fps 출고가 Fail-Closed BLOCKED로 차단되고 8GB 선택 시 PASS 복귀한다", () => {
    render(<StudioShaderPrewarmWebCodecsPanel initialExportPresetId="youtube-4k-3840x2160-60fps" initialCodecId="av1" />);
    fireEvent.click(screen.getByTestId("opfs-preset-256"));
    const svg = screen.getByTestId("webcodecs-zerocopy-pipeline-svg");
    expect(svg.getAttribute("data-opfs-gate-status")).toBe("blocked");
    expect(svg.getAttribute("data-can-start-export")).toBe("false");
    expect(screen.getByTestId("kpi-opfs-gate").textContent).toContain("BLOCKED");

    fireEvent.click(screen.getByTestId("opfs-preset-8192"));
    expect(svg.getAttribute("data-opfs-gate-status")).toBe("pass");
    expect(svg.getAttribute("data-can-start-export")).toBe("true");
  });

  it("무빙툰 영상 길이 슬라이더 변경 시 총 프레임과 예상 용량이 즉시 재계산된다", () => {
    const onPlanChange = vi.fn();
    render(<StudioShaderPrewarmWebCodecsPanel onPlanChange={onPlanChange} />);
    fireEvent.change(screen.getByTestId("duration-slider"), { target: { value: "180" } });
    expect(screen.getByTestId("duration-readout").textContent).toBe("180s");
    const [latest] = onPlanChange.mock.calls.at(-1) as [ShaderWebCodecsCombinedPlan];
    expect(latest.webCodecsExport.durationSec).toBe(180);
    expect(latest.webCodecsExport.totalFrames).toBe(180 * 60);
  });

  it("JSON 내보내기·복사·미리보기 토글·초기값 복원 버튼이 정상 동작한다", () => {
    const onExportJson = vi.fn();
    render(
      <StudioShaderPrewarmWebCodecsPanel
        initialExportPresetId="webtoon-trailer-1440p-30fps"
        initialCodecId="hevc"
        onExportJson={onExportJson}
      />,
    );

    expect(screen.queryByTestId("manifest-json-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("export-manifest-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    const [jsonArg, planArg] = onExportJson.mock.calls[0] as [string, ShaderWebCodecsCombinedPlan];
    expect(jsonArg).toContain(SHADER_PREWARM_WEBCODECS_SCHEMA_VERSION);
    expect(planArg.webCodecsExport.preset.id).toBe("webtoon-trailer-1440p-30fps");
    expect(screen.getByTestId("manifest-json-preview").textContent).toContain(SHADER_PREWARM_MODEL_KIND);

    fireEvent.click(screen.getByTestId("copy-manifest-json-btn"));
    expect(screen.getByTestId("shader-webcodecs-status").textContent).toContain("JSON");

    fireEvent.click(screen.getByTestId("toggle-json-preview-btn"));
    expect(screen.queryByTestId("manifest-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("preset-btn-mobile-lite-720x1280-30fps"));
    expect(screen.getByTestId("webcodecs-zerocopy-pipeline-svg").getAttribute("data-preset-id")).toBe(
      "mobile-lite-720x1280-30fps",
    );
    fireEvent.click(screen.getByTestId("reset-shader-webcodecs-btn"));
    expect(screen.getByTestId("webcodecs-zerocopy-pipeline-svg").getAttribute("data-preset-id")).toBe(
      "webtoon-trailer-1440p-30fps",
    );
  });

  it("영문 로케일(locale='en')과 모든 버튼 min-h-11 접근성 터치 타깃을 만족한다", () => {
    const { container } = render(<StudioShaderPrewarmWebCodecsPanel locale="en" />);
    expect(screen.getByTestId("shader-prewarm-gantt-svg").textContent).toContain("12 WGSL PIPELINES");
    expect(screen.getByTestId("webcodecs-zerocopy-pipeline-svg").textContent).toContain("ZERO-COPY WEBCODECS 4K PIPELINE");
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThanOrEqual(20);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
  });
});

describe("5. 코드 위생 · 줄 수 상한 · 탈-바이올렛 OKLCH · 하네스 계약 자가 검증", () => {
  it("소유 파일이 정확히 존재하며 줄 수 상한(engine<=750, panel<=680, 전체<=800)을 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "shader-prewarm-webcodecs-engine.ts",
      "StudioShaderPrewarmWebCodecsPanel.tsx",
      "index.ts",
      "shader-prewarm-webcodecs.test.tsx", "shader-webcodecs-boundaries.test.tsx", "shader-codecs-input-contract.ts", "shader-codecs-manifest.ts",
      "use-shader-codecs-controller.ts", "use-shader-codecs-copy.ts", "use-shader-codecs-notification.ts",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }
    const allTsFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allTsFiles.sort()).toEqual([...required].sort());

    for (const file of allTsFiles) {
      const lineCount = readFileSync(path.join(dir, file), "utf8").split(/\r?\n/u).length;
      expect(lineCount).toBeLessThanOrEqual(800);
      if (file === "shader-prewarm-webcodecs-engine.ts") expect(lineCount).toBeLessThanOrEqual(750);
      if (file === "StudioShaderPrewarmWebCodecsPanel.tsx") expect(lineCount).toBeLessThanOrEqual(680);
    }
  });

  it("소스 3개 파일에 금지 패턴(원시 색·storage·BigInt·private Map·Sparkles·번역투·transition-all·기본 props)이 0건이다", () => {
    const dir = path.resolve(import.meta.dirname);
    for (const file of ["shader-prewarm-webcodecs-engine.ts", "StudioShaderPrewarmWebCodecsPanel.tsx", "index.ts"]) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src).not.toMatch(/\blocalStorage\b/u);
      expect(src).not.toMatch(/\bsessionStorage\b/u);
      expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
      expect(src).not.toMatch(/\b\d+n\b/u);
      expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(src).not.toMatch(/\brgba?\s*\(/iu);
      expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      expect(src).not.toContain("Sparkles");
      expect(src).not.toContain("하는 것을 가능하게 합니다");
      expect(src).not.toContain("직관적인 경험을 제공합니다");
      expect(src).not.toContain("원활한 워크플로우를 보장합니다");
      if (file === "StudioShaderPrewarmWebCodecsPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
      }
    }
  });

  it("패널 내 모든 oklch() 리터럴 색상이 바이올렛 휴(270~320°)를 0% 배제한다", () => {
    const panelSrc = readFileSync(
      path.resolve(import.meta.dirname, "StudioShaderPrewarmWebCodecsPanel.tsx"),
      "utf8",
    );
    const matches = [...panelSrc.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s*\)/gu)];
    expect(matches.length).toBeGreaterThanOrEqual(6);
    for (const match of matches) {
      const hue = Number(match[1]);
      expect(hue < 270 || hue > 320).toBe(true);
    }
  });

  it("패널이 [word-break:keep-all] · tabular-nums · min-h-11 · motion-reduce 계약을 모두 포함한다", () => {
    const panelSrc = readFileSync(
      path.resolve(import.meta.dirname, "StudioShaderPrewarmWebCodecsPanel.tsx"),
      "utf8",
    );
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("tabular-nums");
    expect(panelSrc).toContain("min-h-11");
    expect(panelSrc).toContain("motion-reduce:transition-none");
  });
});
