// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  KONVA_MIGRATION_LAYERS,
  NATIVE_MIGRATION_SCENARIOS,
  StudioNativeWasmMigrationPanel,
  TILE_DIMENSION_PX,
  TILE_RGBA16F_BYTES,
  TILE_RGBA8_BYTES,
  WASM64_OFFSET_THRESHOLD_MB,
  ZERO_COPY_RING_SLOTS,
  evaluateRuntimeNativeCapability,
  exportNativeMigrationManifestJson,
  getMigrationScenarioPreset,
  normalizeRuntimeCapabilityInput,
  planZeroCopyTileArena,
  summarizeKonvaMigrationRoadmap,
  type RuntimeNativeCapabilityInput,
} from "./index";

afterEach(cleanup);

function makeDesktopInput(overrides?: Partial<RuntimeNativeCapabilityInput>): RuntimeNativeCapabilityInput {
  return {
    webgpuAvailable: true,
    wasmMemory64Available: true,
    wasmSimd128Available: true,
    sharedArrayBufferAvailable: true,
    deviceMemoryGb: 16,
    canvasWidthPx: 2048,
    canvasHeightPx: 2048,
    layerCount: 16,
    pixelFormat: "rgba8",
    sparseOccupancyRatio: 0.45,
    isIosSafariWebKit: false,
    undoHistorySnapshots: 12,
    ...overrides,
  };
}

describe("1. Konva 4계층 분리 로드맵 모델 (KONVA_MIGRATION_LAYERS)", () => {
  it("4계층이 순서(1~4)와 고유 ID로 정확히 정의되어 있다", () => {
    expect(KONVA_MIGRATION_LAYERS).toHaveLength(4);
    expect(KONVA_MIGRATION_LAYERS.map((l) => l.order)).toEqual([1, 2, 3, 4]);
    expect(KONVA_MIGRATION_LAYERS.map((l) => l.id)).toEqual([
      "pixel-brush-hotpath",
      "sparse-tile-compositor",
      "vector-warp-binary-codecs",
      "ui-ime-gizmo-bridge",
    ]);
  });

  it("1~3계층은 100% 네이티브(Rust WASM/WebGPU) 승격이며 목표 Konva 의존도가 0%다", () => {
    const coreLayers = KONVA_MIGRATION_LAYERS.slice(0, 3);
    expect(coreLayers.map((l) => l.targetRuntime)).toEqual([
      "rust-wasm-webgpu-wgsl",
      "rust-wasm-webgpu-compute",
      "rust-wasm-dual-target",
    ]);
    for (const layer of coreLayers) {
      expect(layer.nativePromotionPct).toBe(100);
      expect(layer.targetKonvaDependencyPct).toBe(0);
    }
  });

  it("4계층은 React 접근성·한글 IME·기즈모용 TypeScript 경량 어댑터를 15~20% 범위로 유지한다", () => {
    const uiLayer = KONVA_MIGRATION_LAYERS[3];
    expect(uiLayer?.targetRuntime).toBe("typescript-thin-adapter");
    expect(uiLayer?.tsAdapterSharePct).toBeGreaterThanOrEqual(15);
    expect(uiLayer?.tsAdapterSharePct).toBeLessThanOrEqual(20);
    expect(uiLayer?.responsibilitiesKo.some((item) => item.includes("한글 IME"))).toBe(true);
  });

  it("summarizeKonvaMigrationRoadmap이 네이티브 82% / TS 어댑터 18% / 목표 Konva 0%를 요약한다", () => {
    const summary = summarizeKonvaMigrationRoadmap();
    expect(summary.totalLayers).toBe(4);
    expect(summary.fullyNativeLayers).toBe(3);
    expect(summary.retainedAdapterLayers).toBe(1);
    expect(summary.nativeCoreSharePct).toBe(82);
    expect(summary.tsAdapterSharePct).toBe(18);
    expect(summary.tsAdapterTargetBandPct).toEqual([15, 20]);
    expect(summary.targetKonvaRuntimePct).toBe(0);
  });

  it("모든 계층이 현재 구현과 전환 목표를 분리 기술하고 실제 저장소 모듈을 참조한다", () => {
    for (const layer of KONVA_MIGRATION_LAYERS) {
      expect(layer.currentStateKo).toContain("현재:");
      expect(layer.targetStateKo).toContain("목표:");
      expect(layer.currentStateEn).toContain("Current:");
      expect(layer.targetStateEn).toContain("Target:");
      expect(layer.repoModules.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("2. 4종 작업 환경 시나리오 프리셋 및 입력 정규화", () => {
  it("4종 시나리오 프리셋(웹툰·8K·iPad Safari·모바일 4GB)이 모두 존재한다", () => {
    expect(NATIVE_MIGRATION_SCENARIOS).toHaveLength(4);
    expect(NATIVE_MIGRATION_SCENARIOS.map((s) => s.id)).toEqual([
      "webtoon-long-strip",
      "illust-8k-120layer",
      "ipad-safari-4k",
      "entry-mobile-4gb",
    ]);
  });

  it("각 시나리오의 해상도·레이어·디바이스 RAM·WebKit 플래그가 요구 사양과 일치한다", () => {
    const webtoon = getMigrationScenarioPreset("webtoon-long-strip");
    expect(webtoon.input.canvasWidthPx).toBe(800);
    expect(webtoon.input.canvasHeightPx).toBe(24000);
    expect(webtoon.input.layerCount).toBe(60);

    const illust = getMigrationScenarioPreset("illust-8k-120layer");
    expect(illust.input.canvasWidthPx).toBe(7680);
    expect(illust.input.canvasHeightPx).toBe(4320);
    expect(illust.input.layerCount).toBe(120);

    const ipad = getMigrationScenarioPreset("ipad-safari-4k");
    expect(ipad.input.isIosSafariWebKit).toBe(true);

    const mobile = getMigrationScenarioPreset("entry-mobile-4gb");
    expect(mobile.input.deviceMemoryGb).toBe(4);
    expect(mobile.input.webgpuAvailable).toBe(false);
  });

  it("normalizeRuntimeCapabilityInput이 NaN·음수·초과 치수를 안전 범위로 클램핑한다", () => {
    const normalized = normalizeRuntimeCapabilityInput({
      webgpuAvailable: true,
      wasmMemory64Available: false,
      wasmSimd128Available: true,
      sharedArrayBufferAvailable: false,
      deviceMemoryGb: Number.NaN,
      canvasWidthPx: -500,
      canvasHeightPx: 999999,
      layerCount: 0,
      sparseOccupancyRatio: 5,
      undoHistorySnapshots: -3,
    });
    expect(normalized.deviceMemoryGb).toBe(8);
    expect(normalized.canvasWidthPx).toBe(256);
    expect(normalized.canvasHeightPx).toBe(65536);
    expect(normalized.layerCount).toBe(1);
    expect(normalized.sparseOccupancyRatio).toBe(1);
    expect(normalized.undoHistorySnapshots).toBe(1);
  });

  it("getMigrationScenarioPreset이 지정 ID를 정확히 조회한다", () => {
    expect(getMigrationScenarioPreset("ipad-safari-4k").id).toBe("ipad-safari-4k");
    expect(getMigrationScenarioPreset("entry-mobile-4gb").id).toBe("entry-mobile-4gb");
  });
});

describe("3. 런타임 기능 탐지 & 자동 티어 선택 (evaluateRuntimeNativeCapability)", () => {
  it("웹툰 800×24,000px 60L(RGBA8) 타일 산술(4×94=376/층, 밀집 5,640MB) 및 WASM64+WebGPU 승격을 산출한다", () => {
    const res = evaluateRuntimeNativeCapability(getMigrationScenarioPreset("webtoon-long-strip").input);
    expect(res.tileDimensionPx).toBe(TILE_DIMENSION_PX);
    expect(res.tileSizeKb).toBe(256);
    expect(res.tilesX).toBe(4);
    expect(res.tilesY).toBe(94);
    expect(res.tilesPerLayer).toBe(376);
    expect(res.denseTotalTiles).toBe(22560);
    expect(res.denseTileRamMb).toBe(5640);
    expect(res.exceeds4096MbDense).toBe(true);
    expect(res.wasm64AutoPromoted).toBe(true);
    expect(res.selectedTier).toBe("webgpu-wasm64-hybrid");
    expect(res.selectedWasmTarget).toBe("wasm64-memory64");
  });

  it("일러스트 8K 120L(RGBA16F)은 활성 RAM 4,096MB 초과 경보 · WASM64 자동 승격 · OPFS 대용량 스필을 산출한다", () => {
    const res = evaluateRuntimeNativeCapability(getMigrationScenarioPreset("illust-8k-120layer").input);
    expect(res.tileSizeKb).toBe(512);
    expect(res.tilesX).toBe(30);
    expect(res.tilesY).toBe(17);
    expect(res.denseTotalTiles).toBe(61200);
    expect(res.exceeds4096MbActive).toBe(true);
    expect(res.estimatedTileRamMb).toBeGreaterThan(10000);
    expect(res.opfsSpillRequiredMb).toBeGreaterThan(4000);
    expect(res.selectedTier).toBe("webgpu-wasm64-hybrid");
    expect(res.warnings.some((w) => w.code === "WASM64_THRESHOLD_ACTIVE")).toBe(true);
  });

  it("4GB 미만 중소형 캔버스에서는 memory64가 가능해도 포인터 오버헤드가 적은 WASM32-SIMD128 + WebGPU를 선택한다", () => {
    const res = evaluateRuntimeNativeCapability(makeDesktopInput());
    expect(res.exceeds4096MbActive).toBe(false);
    expect(res.exceeds4096MbDense).toBe(false);
    expect(res.wasm64AutoPromoted).toBe(false);
    expect(res.selectedTier).toBe("webgpu-wasm32-simd");
    expect(res.selectedWasmTarget).toBe("wasm32-simd128");
  });

  it("WebGPU OFF + WASM64 ON + 8K 120L 조합은 wasm64-memory64-cpu 티어와 CPU 폴백 경보를 반환한다", () => {
    const res = evaluateRuntimeNativeCapability({
      ...getMigrationScenarioPreset("illust-8k-120layer").input,
      webgpuAvailable: false,
    });
    expect(res.selectedTier).toBe("wasm64-memory64-cpu");
    expect(res.gpuPath).toBe("cpu-wasm-fallback");
    expect(res.selectedWasmTarget).toBe("wasm64-memory64");
    expect(res.warnings.some((w) => w.code === "WEBGPU_UNAVAILABLE_CPU_PATH")).toBe(true);
  });

  it("보급형 모바일 4GB(WebGPU OFF, WASM64 OFF, SIMD128 ON)는 wasm32-simd128 기본 고속 경로와 저용량 가드를 선택한다", () => {
    const res = evaluateRuntimeNativeCapability(getMigrationScenarioPreset("entry-mobile-4gb").input);
    expect(res.selectedTier).toBe("wasm32-simd128");
    expect(res.selectedWasmTarget).toBe("wasm32-simd128");
    expect(res.safeRamBudgetMb).toBeLessThanOrEqual(655);
    expect(res.warnings.some((w) => w.code === "LOW_DEVICE_MEMORY_BUDGET")).toBe(true);
  });

  it("WebGPU · WASM64 · SIMD128이 모두 비활성이면 wasm32-scalar-safe 호환 폴백 경로를 선택한다", () => {
    const res = evaluateRuntimeNativeCapability(
      makeDesktopInput({
        webgpuAvailable: false,
        wasmMemory64Available: false,
        wasmSimd128Available: false,
      }),
    );
    expect(res.selectedTier).toBe("wasm32-scalar-safe");
    expect(res.selectedWasmTarget).toBe("wasm32-scalar");
  });

  it("iPad Safari 4K(isIosSafariWebKit)는 Jetsam 1,024MB 이하 상한과 WASM32 고정 가드를 적용한다", () => {
    const res = evaluateRuntimeNativeCapability(getMigrationScenarioPreset("ipad-safari-4k").input);
    expect(res.iosSafariWebKitGuard.status).not.toBe("inactive");
    expect(res.iosSafariWebKitGuard.enforcedMaxResidentMb).toBeLessThanOrEqual(1024);
    expect(res.selectedWasmTarget).toBe("wasm32-simd128");
    expect(res.warnings.some((w) => w.code === "IOS_WEBKIT_JETSAM_GUARD")).toBe(true);
  });

  it("4GB+ 작업량에서 wasmMemory64Available=false이면 wasm64BlockedByRuntime=true와 OPFS 스필 경보를 반환한다", () => {
    const res = evaluateRuntimeNativeCapability({
      ...getMigrationScenarioPreset("illust-8k-120layer").input,
      wasmMemory64Available: false,
    });
    expect(res.wasm64AutoPromoted).toBe(false);
    expect(res.wasm64BlockedByRuntime).toBe(true);
    expect(res.selectedWasmTarget).toBe("wasm32-simd128");
    expect(res.opfsSpillRequiredMb).toBeGreaterThan(0);
    expect(res.warnings.some((w) => w.code === "WASM64_UNAVAILABLE_SPILL_REQUIRED")).toBe(true);
  });

  it("SAB 비활성 시 Transferable 링버퍼로 폴백하며 산출 근거에 허위 FPS 배수가 없음을 공시한다", () => {
    const res = evaluateRuntimeNativeCapability(makeDesktopInput({ sharedArrayBufferAvailable: false }));
    expect(res.ringTransferMode).toBe("transferable-arraybuffer-ring");
    expect(res.warnings.some((w) => w.code === "SAB_UNAVAILABLE_TRANSFER_FALLBACK")).toBe(true);
    expect(res.formulaDisclosureKo).toContain("임의 FPS 배수는 배제");
    expect(res.formulaDisclosureEn).toContain("No fabricated FPS multipliers");
  });
});

describe("4. Zero-Copy 링버퍼 · 타일 아레나 · 4,096MB 경보 & JSON 매니페스트", () => {
  it("RGBA8(256KB) 대비 RGBA16F(512KB)는 타일 바이트와 링버퍼 크기가 정확히 2배이며 256B 정렬을 지킨다", () => {
    const rgba8 = planZeroCopyTileArena(makeDesktopInput({ pixelFormat: "rgba8" }));
    const rgba16f = planZeroCopyTileArena(makeDesktopInput({ pixelFormat: "rgba16f" }));
    expect(rgba8.bytesPerTile).toBe(TILE_RGBA8_BYTES);
    expect(rgba16f.bytesPerTile).toBe(TILE_RGBA16F_BYTES);
    expect(rgba16f.bytesPerTile).toBe(rgba8.bytesPerTile * 2);
    expect(rgba16f.ringBuffer.totalRingBytes).toBe(rgba8.ringBuffer.totalRingBytes * 2);
    expect(rgba8.ringBuffer.bytesPerSlot % 256).toBe(0);
    expect(rgba16f.ringBuffer.bytesPerSlot % 256).toBe(0);
  });

  it("4,096MB 임계치에 따라 safe / approaching / exceeded 경보와 u32/u64 오프셋 모드가 정확히 전환된다", () => {
    const safePlan = planZeroCopyTileArena(makeDesktopInput());
    expect(safePlan.wasm64ThresholdMb).toBe(WASM64_OFFSET_THRESHOLD_MB);
    expect(safePlan.thresholdAlertLevel).toBe("safe");
    expect(safePlan.exceeds4096MbThreshold).toBe(false);
    expect(safePlan.offsetAddressMode).toBe("u32-linear-guarded");

    const approachingPlan = planZeroCopyTileArena(getMigrationScenarioPreset("webtoon-long-strip").input);
    expect(approachingPlan.thresholdAlertLevel).toBe("approaching");
    expect(approachingPlan.offsetAddressMode).toBe("u64-memory64");

    const exceededPlan = planZeroCopyTileArena(getMigrationScenarioPreset("illust-8k-120layer").input);
    expect(exceededPlan.thresholdAlertLevel).toBe("exceeded");
    expect(exceededPlan.exceeds4096MbThreshold).toBe(true);
    expect(exceededPlan.offsetAddressMode).toBe("u64-memory64");
  });

  it("3슬롯 링버퍼가 SAB+WebGPU 조건에서만 zeroCopyEligible=true를 보고한다", () => {
    const sabGpu = planZeroCopyTileArena(makeDesktopInput({ sharedArrayBufferAvailable: true, webgpuAvailable: true }));
    expect(sabGpu.ringBuffer.slotCount).toBe(ZERO_COPY_RING_SLOTS);
    expect(sabGpu.ringBuffer.backingMemoryKind).toBe("SharedArrayBuffer");
    expect(sabGpu.ringBuffer.zeroCopyEligible).toBe(true);

    const noSab = planZeroCopyTileArena(makeDesktopInput({ sharedArrayBufferAvailable: false, webgpuAvailable: true }));
    expect(noSab.ringBuffer.backingMemoryKind).toBe("TransferableArrayBuffer");
    expect(noSab.ringBuffer.zeroCopyEligible).toBe(false);
  });

  it("OPFS LRU 정책이 iOS WebKit/4GB 단말에는 조기 워터마크(70%/52%, 16타일), 데스크톱에는 표준(80%/62%, 32타일)을 적용한다", () => {
    const ipadPlan = planZeroCopyTileArena(getMigrationScenarioPreset("ipad-safari-4k").input);
    expect(ipadPlan.opfsLruPolicy.enabled).toBe(true);
    expect(ipadPlan.opfsLruPolicy.evictionHighWatermarkPct).toBe(70);
    expect(ipadPlan.opfsLruPolicy.evictionLowWatermarkPct).toBe(52);
    expect(ipadPlan.opfsLruPolicy.spillWriteBatchTiles).toBe(16);

    const illustPlan = planZeroCopyTileArena(getMigrationScenarioPreset("illust-8k-120layer").input);
    expect(illustPlan.opfsLruPolicy.enabled).toBe(true);
    expect(illustPlan.opfsLruPolicy.evictionHighWatermarkPct).toBe(80);
    expect(illustPlan.opfsLruPolicy.evictionLowWatermarkPct).toBe(62);
    expect(illustPlan.opfsLruPolicy.spillWriteBatchTiles).toBe(32);
    expect(illustPlan.opfsLruPolicy.spilledColdTiles).toBeGreaterThan(0);
    expect(illustPlan.opfsLruPolicy.estimatedOpfsDiskMb).toBeGreaterThan(0);
  });

  it("타일 아레나 4대 세그먼트가 모두 0 이상이며 합계가 예상 워킹셋과 일치한다", () => {
    const plan = planZeroCopyTileArena(getMigrationScenarioPreset("illust-8k-120layer").input);
    expect(plan.segments).toHaveLength(4);
    for (const seg of plan.segments) {
      expect(seg.mb).toBeGreaterThanOrEqual(0);
    }
    const totalMb = plan.segments.reduce((acc, seg) => acc + seg.mb, 0);
    expect(Math.abs(totalMb - plan.estimatedWorkingSetMb)).toBeLessThanOrEqual(0.3);
  });

  it("planZeroCopyTileArena에 raw 입력을 넣든 평가 결과를 넣든 동일한 설계를 반환한다", () => {
    const raw = getMigrationScenarioPreset("webtoon-long-strip").input;
    const evaluation = evaluateRuntimeNativeCapability(raw);
    expect(planZeroCopyTileArena(raw)).toEqual(planZeroCopyTileArena(evaluation));
  });

  it("exportNativeMigrationManifestJson이 유효한 v1 스키마 JSON과 정직 공시를 직렬화한다", () => {
    const { json, manifest } = exportNativeMigrationManifestJson({
      scenarioId: "illust-8k-120layer",
      input: getMigrationScenarioPreset("illust-8k-120layer").input,
    });
    const parsed = JSON.parse(json) as typeof manifest;
    expect(parsed).toEqual(manifest);
    expect(parsed.schemaVersion).toBe("toonstudio.native-wasm-migration-manifest.v1");
    expect(parsed.scenarioId).toBe("illust-8k-120layer");
    expect(parsed.konvaMigrationLayers).toHaveLength(4);
    expect(parsed.roadmapSummary.nativeCoreSharePct).toBe(82);
    expect(parsed.tileArenaPlan.exceeds4096MbThreshold).toBe(true);
    expect(parsed.honestyNoteKo).toContain("임의 FPS 배수는 포함하지 않는다");
  });
});

describe("5. 스튜디오 제어판 UI 인터랙션 & 접근성 (StudioNativeWasmMigrationPanel)", () => {
  it("props 없이 단독 마운트되며 기본 웹툰 60L 시나리오와 4계층 Konva 상태표를 렌더한다", () => {
    render(<StudioNativeWasmMigrationPanel />);
    expect(screen.getByTestId("studio-native-wasm-migration-panel")).toBeTruthy();
    expect(screen.getByTestId("selected-tier-id").textContent).toBe("webgpu-wasm64-hybrid");
    expect(screen.getByTestId("konva-layer-row-pixel-brush-hotpath")).toBeTruthy();
    expect(screen.getByTestId("konva-layer-row-sparse-tile-compositor")).toBeTruthy();
    expect(screen.getByTestId("konva-layer-row-vector-warp-binary-codecs")).toBeTruthy();
    expect(screen.getByTestId("konva-layer-row-ui-ime-gizmo-bridge")).toBeTruthy();
  });

  it("4종 시나리오 프리셋 버튼 클릭 시 티어·OPFS·WebKit 가드가 즉시 바뀌고 onSelectTier가 호출된다", () => {
    const onSelectTier = vi.fn();
    render(<StudioNativeWasmMigrationPanel onSelectTier={onSelectTier} />);

    fireEvent.click(screen.getByTestId("scenario-preset-illust-8k-120layer"));
    expect(screen.getByTestId("native-pipeline-arena-svg").getAttribute("data-threshold-alert")).toBe("exceeded");
    expect(onSelectTier).toHaveBeenCalledWith(expect.objectContaining({ selectedTier: "webgpu-wasm64-hybrid", exceeds4096MbActive: true }));

    fireEvent.click(screen.getByTestId("scenario-preset-ipad-safari-4k"));
    expect(screen.getByTestId("webkit-guard-status").textContent).toContain("active-");
    expect(screen.getByTestId("selected-tier-id").textContent).toBe("webgpu-wasm32-simd");

    fireEvent.click(screen.getByTestId("scenario-preset-entry-mobile-4gb"));
    expect(screen.getByTestId("selected-tier-id").textContent).toBe("wasm32-simd128");
  });

  it("WebGPU · WASM64 · SIMD128 · SAB 스위치를 토글하면 aria-checked와 티어·링 백킹이 즉시 갱신된다", () => {
    render(<StudioNativeWasmMigrationPanel />);

    const webgpuToggle = screen.getByTestId("toggle-webgpuAvailable");
    expect(webgpuToggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(webgpuToggle);
    expect(webgpuToggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("selected-tier-id").textContent).toBe("wasm64-memory64-cpu");

    const sabToggle = screen.getByTestId("toggle-sharedArrayBufferAvailable");
    fireEvent.click(sabToggle);
    expect(screen.getByTestId("ring-backing-kind").textContent).toBe("TransferableArrayBuffer");

    const wasm64Toggle = screen.getByTestId("toggle-wasmMemory64Available");
    fireEvent.click(wasm64Toggle);
    expect(screen.getByTestId("selected-tier-id").textContent).toBe("wasm32-simd128");
  });

  it("RGBA8 ↔ RGBA16F 포맷 버튼 전환 시 타일 RAM이 증가하고 4,096MB 경보가 활성화된다", () => {
    render(<StudioNativeWasmMigrationPanel initialPresetId="webtoon-long-strip" />);
    const beforeRam = screen.getByTestId("estimated-tile-ram-mb").textContent ?? "";
    fireEvent.click(screen.getByTestId("pixel-format-rgba16f"));
    const afterRam = screen.getByTestId("estimated-tile-ram-mb").textContent ?? "";
    expect(afterRam).not.toBe(beforeRam);
    expect(screen.getByTestId("native-pipeline-arena-svg").getAttribute("data-threshold-alert")).toBe("exceeded");
  });

  it("레이어 수·단말 RAM 슬라이더 조정과 초기값 복원 버튼이 상태를 정확히 갱신한다", () => {
    render(<StudioNativeWasmMigrationPanel initialPresetId="entry-mobile-4gb" />);
    fireEvent.change(screen.getByTestId("layer-count-slider"), { target: { value: "120" } });
    expect(screen.getByTestId("layer-count-value").textContent).toBe("120L");

    fireEvent.change(screen.getByTestId("device-memory-slider"), { target: { value: "32" } });
    expect(screen.getByTestId("device-memory-value").textContent).toBe("32 GB");

    fireEvent.click(screen.getByTestId("reset-migration-preset-btn"));
    expect(screen.getByTestId("layer-count-value").textContent).toBe("24L");
    expect(screen.getByTestId("device-memory-value").textContent).toBe("4 GB");
  });

  it("순수 시맨틱 SVG가 3단 파이프라인·활성 타깃·메모리 아레나 게이지를 정확히 표시한다", () => {
    render(<StudioNativeWasmMigrationPanel initialPresetId="illust-8k-120layer" />);
    const svg = screen.getByTestId("native-pipeline-arena-svg");
    expect(svg.getAttribute("data-wasm-target")).toBe("wasm64-memory64");
    expect(svg.getAttribute("data-gpu-path")).toBe("webgpu-wgsl");
    expect(Number(svg.getAttribute("data-opfs-spill-mb"))).toBeGreaterThan(0);
    expect(svg.textContent).toContain("4,096MB 64비트 경계");
  });

  it("JSON 매니페스트 내보내기 버튼이 onExportJson을 호출하고 미리보기를 열며 닫기 토글이 동작한다", () => {
    const onExportJson = vi.fn();
    render(<StudioNativeWasmMigrationPanel onExportJson={onExportJson} />);

    expect(screen.queryByTestId("manifest-json-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("export-manifest-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    const [jsonArg, manifestArg] = onExportJson.mock.calls[0] as [string, { schemaVersion: string }];
    expect(jsonArg).toContain("toonstudio.native-wasm-migration-manifest.v1");
    expect(manifestArg.schemaVersion).toBe("toonstudio.native-wasm-migration-manifest.v1");
    expect(screen.getByTestId("manifest-json-preview").textContent).toContain("webtoon-long-strip");

    fireEvent.click(screen.getByTestId("toggle-manifest-preview-btn"));
    expect(screen.queryByTestId("manifest-json-preview")).toBeNull();
  });

  it("영문 로케일(locale='en')이 헤더·SVG·테이블·경보에 일관되게 반영된다", () => {
    render(<StudioNativeWasmMigrationPanel locale="en" initialPresetId="illust-8k-120layer" />);
    expect(screen.getByTestId("native-pipeline-arena-svg").textContent).toContain("3-STAGE KONVA-DECOUPLED NATIVE PIPELINE");
    expect(screen.getByTestId("arena-alert-banner").textContent).toContain("64-bit Offset Alert");
    expect(screen.getByTestId("konva-migration-layers-table").textContent).toContain("Thin TypeScript Adapter Retained");
  });
});

describe("6. 코드 위생 · 탈-바이올렛 OKLCH · Calm Atelier 계약 자가 검증", () => {
  it("4개 소유 파일 줄 수 제한(engine<=750, panel<=700, 전체<=800) 및 금지 패턴 0건을 충족한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "native-wasm-migration-engine.ts",
      "StudioNativeWasmMigrationPanel.tsx",
      "index.ts",
      "native-wasm-migration.test.tsx",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles.sort()).toEqual([...required].sort());

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "native-wasm-migration-engine.ts") expect(lines).toBeLessThanOrEqual(750);
      if (file === "StudioNativeWasmMigrationPanel.tsx") expect(lines).toBeLessThanOrEqual(700);

      if (file !== "native-wasm-migration.test.tsx") {
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
      }

      if (file === "StudioNativeWasmMigrationPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("패널 내 모든 oklch() 색상이 바이올렛 휴 대역(270~320도)을 0% 배제한다", () => {
    const panelSrc = readFileSync(
      path.resolve(import.meta.dirname, "StudioNativeWasmMigrationPanel.tsx"),
      "utf8",
    );
    const matches = [...panelSrc.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s*\)/gu)];
    expect(matches.length).toBeGreaterThanOrEqual(5);
    for (const match of matches) {
      const hue = Number(match[1]);
      expect(hue < 270 || hue > 320).toBe(true);
    }
  });

  it("렌더된 패널의 모든 버튼이 min-h-11 접근성 터치 타깃을 충족한다", () => {
    const { container } = render(<StudioNativeWasmMigrationPanel />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThanOrEqual(14);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
  });
});
