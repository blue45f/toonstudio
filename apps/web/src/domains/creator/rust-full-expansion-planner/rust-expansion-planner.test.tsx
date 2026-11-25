// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CURRENT_RUST_CRATE_BASELINES,
  EXPANSION_PLAN_SCHEMA_VERSION,
  EXPANSION_PLATFORM_PROFILES,
  EXPANSION_WAVE_PHASES,
  MEASUREMENT_DATE,
  SUBSYSTEM_EXPANSION_SPECS,
  StudioRustExpansionArchitectPanel,
  buildRustExpansionExportPayload,
  exportRustExpansionAdrMarkdown,
  exportRustExpansionJson,
  getExpansionPhaseSpec,
  getExpansionPlatformProfile,
  getSubsystemExpansionSpec,
  normalizeExpansionPhase,
  simulateExpansionRoadmap,
  type ExpansionSubsystemId,
  type ExpansionTargetPlatformId,
  type ExpansionWavePhase,
} from "./index";

afterEach(cleanup);

describe("1. 2026-11-25 계획 기준 입력값 및 9대 서브시스템 스펙 무결성", () => {
  it("9대 서브시스템의 2026-11-25 입력 파일 수(2,411)와 LOC(818,866)가 정확히 일치한다", () => {
    expect(MEASUREMENT_DATE).toBe("2026-11-25");
    expect(SUBSYSTEM_EXPANSION_SPECS).toHaveLength(9);

    const expected: Record<ExpansionSubsystemId, readonly [number, number]> = {
      bg3d: [817, 229870],
      brush: [388, 144816],
      vrm: [305, 124815],
      render: [237, 116469],
      "hybrid-dcc": [221, 54213],
      export: [154, 43640],
      lettering: [108, 41366],
      filter: [93, 40034],
      canvas: [88, 23643],
    };

    let totalFiles = 0;
    let totalLoc = 0;
    for (const spec of SUBSYSTEM_EXPANSION_SPECS) {
      expect([spec.measuredFileCount, spec.measuredLoc]).toEqual(expected[spec.id]);
      totalFiles += spec.measuredFileCount;
      totalLoc += spec.measuredLoc;
    }
    expect(totalFiles).toBe(2411);
    expect(totalLoc).toBe(818866);
  });

  it("현행 Rust 3대 크레이트 입력 LOC 합계가 9,345 LOC로 정확히 모델링되어 있다", () => {
    expect(CURRENT_RUST_CRATE_BASELINES).toHaveLength(3);
    expect(
      CURRENT_RUST_CRATE_BASELINES.map((c) => [c.crateName, c.measuredLoc]),
    ).toEqual([
      ["studio-wasm64-drawing-core", 4757],
      ["studio-engine-vello", 3913],
      ["studio-hokusai-wasm", 675],
    ]);
    const totalRustLoc = CURRENT_RUST_CRATE_BASELINES.reduce((acc, c) => acc + c.measuredLoc, 0);
    expect(totalRustLoc).toBe(9345);
  });

  it("모든 서브시스템의 idealAllocation 합계가 100%이며 recommendedNativeTargetPct와 정확히 일치한다", () => {
    for (const spec of SUBSYSTEM_EXPANSION_SPECS) {
      const a = spec.idealAllocation;
      const sum =
        a.rustWasm32SimdPct +
        a.rustWasm64Pct +
        a.webgpuSubgroupsF16Pct +
        a.webnnNpuPct +
        a.tsUiImeRetainedPct;
      expect(sum).toBe(100);
      expect(100 - a.tsUiImeRetainedPct).toBe(spec.recommendedNativeTargetPct);
      expect(a.tsUiImeRetainedPct).toBeGreaterThanOrEqual(12);
    }
  });

  it("4단계 전환 웨이브가 9대 서브시스템을 중복·누락 없이 포괄하며 spec.targetWavePhase와 일치한다", () => {
    expect(EXPANSION_WAVE_PHASES).toHaveLength(4);
    const seen = new Set<ExpansionSubsystemId>();
    for (const wave of EXPANSION_WAVE_PHASES) {
      for (const id of wave.addedSubsystems) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
        expect(getSubsystemExpansionSpec(id).targetWavePhase).toBe(wave.phase);
      }
    }
    expect(seen.size).toBe(9);
  });

  it("lettering(46%)과 canvas(32%)가 한글 IME DOM · 접근성 경계를 TS 껍데기로 정직하게 유지한다", () => {
    const lettering = getSubsystemExpansionSpec("lettering");
    const canvas = getSubsystemExpansionSpec("canvas");
    expect(lettering.idealAllocation.tsUiImeRetainedPct).toBe(46);
    expect(lettering.tsBoundaryReasonKo).toContain("한글 IME");
    expect(lettering.riskCodes).toContain("korean-ime-dom-boundary");
    expect(canvas.idealAllocation.tsUiImeRetainedPct).toBe(32);
    expect(canvas.tsBoundaryReasonKo).toContain("PointerEvents");
  });

  it("normalizeExpansionPhase 및 조회 헬퍼가 잘못된 경계값과 미등록 ID를 안전하게 처리한다", () => {
    expect(normalizeExpansionPhase(undefined)).toBe(4);
    expect(normalizeExpansionPhase(Number.NaN)).toBe(4);
    expect(normalizeExpansionPhase(0)).toBe(1);
    expect(normalizeExpansionPhase(-5)).toBe(1);
    expect(normalizeExpansionPhase(2.9)).toBe(2);
    expect(normalizeExpansionPhase(99)).toBe(4);
    expect(getExpansionPhaseSpec(3).phase).toBe(3);
    expect(getExpansionPlatformProfile("apple-silicon-safari").supportsWasmMemory64).toBe(false);
    expect(() => getSubsystemExpansionSpec("unknown" as ExpansionSubsystemId)).toThrow();
  });
});

describe("2. Phase 1~4 단계별 전환 시뮬레이션 및 LOC 보존 법칙", () => {
  it("Phase 1~4 전 단계에서 migrated + retainedTS + deferredTS === 818,866 LOC를 정확히 보존하며 단조 증가한다", () => {
    const phases: readonly ExpansionWavePhase[] = [1, 2, 3, 4];
    let prevNative = 0;
    for (const phase of phases) {
      const sim = simulateExpansionRoadmap({ targetPhase: phase, platformId: "chrome-desktop" });
      expect(sim.totals.migratedNativeLoc + sim.totals.retainedTsShellLoc + sim.totals.deferredTsLoc).toBe(818866);
      expect(sim.totals.totalRemainingTsLoc).toBe(sim.totals.retainedTsShellLoc + sim.totals.deferredTsLoc);
      expect(sim.totals.migratedNativeLoc).toBeGreaterThan(prevNative);
      prevNative = sim.totals.migratedNativeLoc;
    }
  });

  it("Phase 1은 brush·filter·canvas 3개만 편입하고 나머지 6개는 100% 대기 상태로 남긴다", () => {
    const p1 = simulateExpansionRoadmap({ targetPhase: 1, platformId: "chrome-desktop" });
    expect(p1.totals.includedSubsystemCount).toBe(3);
    expect(p1.totals.deferredSubsystemCount).toBe(6);

    const includedIds = p1.subsystems.filter((s) => s.includedInPhase).map((s) => s.spec.id);
    expect(includedIds.sort()).toEqual(["brush", "canvas", "filter"]);

    for (const item of p1.subsystems) {
      if (!item.includedInPhase) {
        expect(item.deferredTsLoc).toBe(item.spec.measuredLoc);
        expect(item.migratedNativeLoc).toBe(0);
        expect(item.activeWasmChunk).toBeNull();
      }
    }
  });

  it("Phase 2(5개) · Phase 3(8개) · Phase 4(9개 전원, deferred=0) 편입 범위가 정확하다", () => {
    const p2 = simulateExpansionRoadmap({ targetPhase: 2 });
    const p3 = simulateExpansionRoadmap({ targetPhase: 3 });
    const p4 = simulateExpansionRoadmap({ targetPhase: 4 });
    expect(p2.totals.includedSubsystemCount).toBe(5);
    expect(p3.totals.includedSubsystemCount).toBe(8);
    expect(p4.totals.includedSubsystemCount).toBe(9);
    expect(p4.totals.deferredSubsystemCount).toBe(0);
    expect(p4.totals.deferredTsLoc).toBe(0);
  });

  it("Phase 4 · Chrome Desktop에서 전체 네이티브 비중이 ~77.6%, TS 껍데기 유지가 ~22.4%이며 4대 엔진이 모두 활성이다", () => {
    const p4 = simulateExpansionRoadmap({ targetPhase: 4, platformId: "chrome-desktop" });
    expect(p4.totals.migratedNativePct).toBeGreaterThanOrEqual(76);
    expect(p4.totals.migratedNativePct).toBeLessThanOrEqual(79);
    expect(p4.totals.retainedTsShellPct).toBeGreaterThanOrEqual(21);
    expect(p4.totals.retainedTsShellPct).toBeLessThanOrEqual(24);
    expect(p4.totals.engineLoc.rustWasm32SimdLoc).toBeGreaterThan(200000);
    expect(p4.totals.engineLoc.rustWasm64Loc).toBeGreaterThan(100000);
    expect(p4.totals.engineLoc.webgpuSubgroupsF16Loc).toBeGreaterThan(200000);
    expect(p4.totals.engineLoc.webnnNpuLoc).toBeGreaterThan(30000);
    expect(p4.baseline.currentRustShareOfCombinedPct).toBeCloseTo(1.13, 2);
  });

  it("WASM 청크 분할이 초기 부트(brush·canvas <= 380KB)와 지연 로드(bg3d·vrm·export·hybrid-dcc)를 분리하고 eagerGraphSafe를 보장한다", () => {
    const p4 = simulateExpansionRoadmap({ targetPhase: 4, platformId: "chrome-desktop" });
    expect(p4.bundlePlan.eagerGraphSafe).toBe(true);
    expect(p4.bundlePlan.eagerWithinBudget).toBe(true);
    expect(p4.bundlePlan.eagerBootChunks.map((c) => c.subsystemId).sort()).toEqual(["brush", "canvas"]);
    expect(p4.bundlePlan.eagerBootGzipCapKb).toBeLessThanOrEqual(380);
    expect(p4.bundlePlan.lazyOnIntentChunks).toHaveLength(7);
    expect(p4.bundlePlan.totalActiveGzipCapKb).toBe(
      p4.bundlePlan.eagerBootGzipCapKb + p4.bundlePlan.lazyOnIntentGzipCapKb,
    );
    expect(p4.bundlePlan.maxSingleChunkCapKb).toBeLessThanOrEqual(450);
  });

  it("lettering은 64비트 아레나가 불필요하므로 Chrome Desktop에서도 wasm32-simd128 청크를 유지한다", () => {
    const p4 = simulateExpansionRoadmap({ targetPhase: 4, platformId: "chrome-desktop" });
    const lettering = p4.subsystems.find((s) => s.spec.id === "lettering");
    expect(lettering?.activeWasmChunk?.activeAbi).toBe("wasm32-simd128");
    expect(lettering?.activeWasmChunk?.activeGzipCapKb).toBe(190);
    expect(lettering?.effectiveLoc.rustWasm64Loc).toBe(0);
  });

  it("4단계 × 4대 플랫폼 전 16조합에서 모든 서브시스템의 stackPct 6개 합이 정확히 100%다", () => {
    const phases: readonly ExpansionWavePhase[] = [1, 2, 3, 4];
    for (const phase of phases) {
      for (const profile of EXPANSION_PLATFORM_PROFILES) {
        const sim = simulateExpansionRoadmap({ targetPhase: phase, platformId: profile.id });
        for (const item of sim.subsystems) {
          const sum =
            item.stackPct.rustWasm32SimdPct +
            item.stackPct.rustWasm64Pct +
            item.stackPct.webgpuSubgroupsF16Pct +
            item.stackPct.webnnNpuPct +
            item.stackPct.tsUiImeRetainedPct +
            item.stackPct.deferredTsPct;
          expect(sum).toBe(100);
        }
      }
    }
  });
});

describe("3. 4대 플랫폼 호환성 · 32/64비트 주소공간 · 리스크 모델링", () => {
  it("Chrome Desktop은 64비트 듀얼 타깃(wasm64-dual-target)과 폴백 재배치 0 LOC를 보고한다", () => {
    const sim = simulateExpansionRoadmap({ targetPhase: 4, platformId: "chrome-desktop" });
    expect(sim.addressSpace.requiredBits).toBe(64);
    expect(sim.addressSpace.effectiveBits).toBe(64);
    expect(sim.addressSpace.mode).toBe("wasm64-dual-target");
    expect(sim.addressSpace.memory64FallbackActive).toBe(false);
    expect(sim.totals.fallbackReassignedLoc).toBe(0);
  });

  it("Apple Silicon Safari는 Memory64·WebNN 미지원으로 32비트 OPFS 스필 고정과 critical 리스크를 산출한다", () => {
    const sim = simulateExpansionRoadmap({ targetPhase: 4, platformId: "apple-silicon-safari" });
    expect(sim.addressSpace.requiredBits).toBe(64);
    expect(sim.addressSpace.effectiveBits).toBe(32);
    expect(sim.addressSpace.mode).toBe("wasm32-opfs-spill-guarded");
    expect(sim.addressSpace.memory64FallbackActive).toBe(true);
    expect(sim.addressSpace.opfsSpillRequired).toBe(true);
    expect(sim.totals.engineLoc.rustWasm64Loc).toBe(0);
    expect(sim.totals.engineLoc.webnnNpuLoc).toBe(0);
    expect(sim.totals.fallbackReassignedLoc).toBeGreaterThan(100000);

    const iosRisk = sim.risks.find((r) => r.code === "ios-safari-memory64");
    expect(iosRisk?.severity).toBe("critical");
    expect(iosRisk?.triggeredByPlatform).toBe(true);
  });

  it("Galaxy Android는 ARM64 64비트 활성화와 2,048MB LMKD 모바일 스필 가드를 동시에 적용한다", () => {
    const sim = simulateExpansionRoadmap({ targetPhase: 4, platformId: "galaxy-android" });
    expect(sim.addressSpace.effectiveBits).toBe(64);
    expect(sim.addressSpace.mode).toBe("wasm64-mobile-guarded");
    expect(sim.addressSpace.safeResidentRamMb).toBe(2048);
    expect(sim.addressSpace.opfsSpillRequired).toBe(true);
  });

  it("All-Platform Safe는 무플래그 32비트 SIMD 전용 경로로 전환하며 GPU-only 어댑터 일부를 TS로 유지한다", () => {
    const desktop = simulateExpansionRoadmap({ targetPhase: 4, platformId: "chrome-desktop" });
    const safe = simulateExpansionRoadmap({ targetPhase: 4, platformId: "all-platform-safe" });

    expect(safe.addressSpace.effectiveBits).toBe(32);
    expect(safe.totals.engineLoc.rustWasm64Loc).toBe(0);
    expect(safe.totals.engineLoc.webgpuSubgroupsF16Loc).toBe(0);
    expect(safe.totals.engineLoc.webnnNpuLoc).toBe(0);
    expect(safe.totals.engineLoc.rustWasm32SimdLoc).toBeGreaterThan(desktop.totals.engineLoc.rustWasm32SimdLoc);
    expect(safe.totals.retainedTsShellLoc).toBeGreaterThan(desktop.totals.retainedTsShellLoc);
    expect(safe.totals.migratedNativePct).toBeLessThan(desktop.totals.migratedNativePct);
  });

  it("Apple Silicon Safari에서는 WebNN NPU 미지원 분량이 Metal WebGPU f16으로 우회 배치된다", () => {
    const desktop = simulateExpansionRoadmap({ targetPhase: 4, platformId: "chrome-desktop" });
    const safari = simulateExpansionRoadmap({ targetPhase: 4, platformId: "apple-silicon-safari" });
    expect(safari.totals.engineLoc.webnnNpuLoc).toBe(0);
    expect(safari.totals.engineLoc.webgpuSubgroupsF16Loc).toBeGreaterThan(
      desktop.totals.engineLoc.webgpuSubgroupsF16Loc,
    );
  });

  it("핵심 3대 리스크(iOS Safari Memory64, 한글 IME DOM 경계, WebNN 플래그 가용성)가 모두 모델링된다", () => {
    const sim = simulateExpansionRoadmap({ targetPhase: 4, platformId: "apple-silicon-safari" });
    const codes = sim.risks.map((r) => r.code);
    expect(codes).toContain("ios-safari-memory64");
    expect(codes).toContain("korean-ime-dom-boundary");
    expect(codes).toContain("webnn-flag-availability");
    for (const risk of sim.risks) {
      expect(risk.mitigationKo.length).toBeGreaterThan(10);
      expect(risk.mitigationEn.length).toBeGreaterThan(10);
    }
  });

  it("리스크 목록은 심각도 순(critical→high→medium)으로 정렬되며 정직 공시에 허위 FPS 배수 배제를 명시한다", () => {
    const sim = simulateExpansionRoadmap({ targetPhase: 4, platformId: "apple-silicon-safari" });
    const rank = { critical: 0, high: 1, medium: 2 } as const;
    for (let i = 1; i < sim.risks.length; i += 1) {
      expect(rank[sim.risks[i].severity]).toBeGreaterThanOrEqual(rank[sim.risks[i - 1].severity]);
    }
    expect(sim.honestyDisclosureKo).toContain("계획 입력값");
    expect(sim.honestyDisclosureEn).toContain("design assumptions");
    expect(sim.honestyDisclosureKo + sim.honestyDisclosureEn).not.toMatch(/\b\d+\s*FPS\b/u);
  });
});

describe("4. ADR Markdown 및 JSON 직렬화 내보내기", () => {
  it("exportRustExpansionAdrMarkdown 한글 출력이 2026-11-25 계획 입력 · 3크레이트 · 9대 표 · 리스크를 포함한다", () => {
    const md = exportRustExpansionAdrMarkdown({ targetPhase: 4, platformId: "apple-silicon-safari" });
    expect(md).toContain("# ADR: ToonStudio 9대 서브시스템");
    expect(md).toContain("2026-11-25");
    expect(md).toContain("818,866 LOC");
    expect(md).toContain("studio-wasm64-drawing-core");
    expect(md).toContain("4,757 LOC");
    expect(md).toContain("studio-engine-vello");
    expect(md).toContain("3,913 LOC");
    expect(md).toContain("studio-hokusai-wasm");
    expect(md).toContain("675 LOC");
    expect(md).toContain("| bg3d |");
    expect(md).toContain("| lettering |");
    expect(md).toContain("iOS Safari / WebKit Memory64 미지원");
    expect(md).toContain("한글 IME");
    expect(md).toContain("WebNN NPU");
  });

  it("exportRustExpansionAdrMarkdown 영문(locale='en') 출력이 영어 ADR 구조를 정확히 생성한다", () => {
    const md = exportRustExpansionAdrMarkdown(
      { targetPhase: 3, platformId: "chrome-desktop" },
      { locale: "en" },
    );
    expect(md).toContain("# ADR: ToonStudio 9-Subsystem Rust/WASM64, WebGPU & NPU Expansion Plan");
    expect(md).toContain("## 1. Planning Baseline Inputs");
    expect(md).toContain("## 3. 9-Subsystem Migration Matrix");
    expect(md).toContain("Deferred");
    expect(md).toContain("design assumptions");
    expect(md).not.toMatch(/\b\d+\s*FPS\b/u);
  });

  it("exportRustExpansionAdrMarkdown은 raw 입력과 사전 시뮬레이션 객체에 대해 바이트 동등 문자열을 반환한다", () => {
    const input = { targetPhase: 2 as const, platformId: "galaxy-android" as const };
    const sim = simulateExpansionRoadmap(input);
    expect(exportRustExpansionAdrMarkdown(input)).toBe(exportRustExpansionAdrMarkdown(sim));
  });

  it("exportRustExpansionJson이 v1 스키마 JSON을 직렬화하며 buildRustExpansionExportPayload와 동등하다", () => {
    const sim = simulateExpansionRoadmap({ targetPhase: 4, platformId: "chrome-desktop" });
    const json = exportRustExpansionJson(sim);
    const payload = buildRustExpansionExportPayload(sim);
    const parsed = JSON.parse(json) as typeof payload;
    expect(parsed).toEqual(payload);
    expect(parsed.schemaVersion).toBe(EXPANSION_PLAN_SCHEMA_VERSION);
    expect(parsed.measurementDate).toBe("2026-11-25");
  });

  it("JSON 내보내기 페이로드가 9개 서브시스템과 계획 합계(818,866 / 9,345 LOC)를 보존한다", () => {
    const parsed = JSON.parse(
      exportRustExpansionJson({ targetPhase: 4, platformId: "all-platform-safe" }),
    ) as ReturnType<typeof buildRustExpansionExportPayload>;
    expect(parsed.subsystems).toHaveLength(9);
    expect(parsed.baseline.totalMeasuredLoc).toBe(818866);
    expect(parsed.baseline.currentRustLoc).toBe(9345);
    expect(parsed.addressSpace.effectiveBits).toBe(32);
  });

  it("4단계 × 4대 플랫폼 모든 조합의 JSON 및 ADR Markdown 직렬화가 플랫폼 주소공간 비트를 정확히 반영한다", () => {
    const platforms: readonly ExpansionTargetPlatformId[] = [
      "chrome-desktop",
      "apple-silicon-safari",
      "galaxy-android",
      "all-platform-safe",
    ];
    for (const platformId of platforms) {
      const parsed = JSON.parse(
        exportRustExpansionJson({ targetPhase: 4, platformId }),
      ) as ReturnType<typeof buildRustExpansionExportPayload>;
      const md = exportRustExpansionAdrMarkdown({ targetPhase: 4, platformId });
      const expectedBits = platformId === "chrome-desktop" || platformId === "galaxy-android" ? 64 : 32;
      expect(parsed.addressSpace.effectiveBits).toBe(expectedBits);
      expect(md).toContain(`활성 ${expectedBits}비트`);
    }
  });
});

describe("5. 아키텍처 대시보드 UI 인터랙션 · 순수 시맨틱 SVG · 접근성", () => {
  it("props 없이 단독 마운트되며 9대 서브시스템 행, 현행 Rust 3크레이트, 스택 바 SVG를 렌더한다", () => {
    render(<StudioRustExpansionArchitectPanel />);
    expect(screen.getByTestId("studio-rust-expansion-architect-panel")).toBeTruthy();
    expect(screen.getByTestId("expansion-coverage-svg")).toBeTruthy();
    expect(screen.getByTestId("subsystem-expansion-matrix")).toBeTruthy();
    for (const spec of SUBSYSTEM_EXPANSION_SPECS) {
      expect(screen.getByTestId(`subsystem-row-${spec.id}`)).toBeTruthy();
    }
    const cratesText = screen.getByTestId("current-rust-crates-list").textContent ?? "";
    expect(cratesText).toContain("studio-wasm64-drawing-core");
    expect(cratesText).toContain("studio-engine-vello");
    expect(cratesText).toContain("studio-hokusai-wasm");
  });

  it("initialPhase=1 및 initialPlatform='apple-silicon-safari' 초기 props가 KPI·SVG·대기 행에 즉시 반영된다", () => {
    render(
      <StudioRustExpansionArchitectPanel
        initialPhase={1}
        initialPlatform="apple-silicon-safari"
      />,
    );
    const svg = screen.getByTestId("expansion-coverage-svg");
    expect(svg.getAttribute("data-target-phase")).toBe("1");
    expect(svg.getAttribute("data-platform-id")).toBe("apple-silicon-safari");
    expect(svg.getAttribute("data-address-bits")).toBe("32");
    expect(screen.getByTestId("subsystem-row-brush").getAttribute("data-included")).toBe("true");
    expect(screen.getByTestId("subsystem-row-bg3d").getAttribute("data-included")).toBe("false");
  });

  it("Phase 1~4 버튼 클릭 시 aria-pressed, KPI, SVG, onPlanChange 콜백이 즉시 갱신된다", () => {
    const onPlanChange = vi.fn();
    render(<StudioRustExpansionArchitectPanel onPlanChange={onPlanChange} />);

    fireEvent.click(screen.getByTestId("phase-btn-1"));
    expect(screen.getByTestId("phase-btn-1").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("phase-btn-4").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("expansion-coverage-svg").getAttribute("data-target-phase")).toBe("1");
    expect(onPlanChange).toHaveBeenCalledWith(expect.objectContaining({ targetPhase: 1 }));

    fireEvent.click(screen.getByTestId("phase-btn-2"));
    expect(screen.getByTestId("subsystem-row-render").getAttribute("data-included")).toBe("true");
    expect(screen.getByTestId("subsystem-row-bg3d").getAttribute("data-included")).toBe("false");
    expect(onPlanChange).toHaveBeenLastCalledWith(expect.objectContaining({ targetPhase: 2 }));
  });

  it("4대 플랫폼 호환성 필터 전환 시 64비트↔32비트 주소공간 및 Safari critical 리스크가 즉시 반영된다", () => {
    render(<StudioRustExpansionArchitectPanel />);
    expect(screen.getByTestId("kpi-address-space-bits").textContent).toContain("64-bit");

    fireEvent.click(screen.getByTestId("platform-btn-apple-silicon-safari"));
    expect(screen.getByTestId("kpi-address-space-bits").textContent).toContain("32-bit");
    expect(screen.getByTestId("expansion-coverage-svg").getAttribute("data-address-bits")).toBe("32");
    expect(screen.getByTestId("risk-card-ios-safari-memory64").textContent).toContain("critical");

    fireEvent.click(screen.getByTestId("platform-btn-all-platform-safe"));
    expect(screen.getByTestId("expansion-coverage-svg").getAttribute("data-platform-id")).toBe("all-platform-safe");
  });

  it("순수 시맨틱 SVG가 9개 서브시스템 스택 바 행과 818,866 LOC 계획 기준선을 표시한다", () => {
    render(<StudioRustExpansionArchitectPanel />);
    const svg = screen.getByTestId("expansion-coverage-svg");
    for (const spec of SUBSYSTEM_EXPANSION_SPECS) {
      expect(screen.getByTestId(`svg-bar-row-${spec.id}`)).toBeTruthy();
    }
    expect(svg.textContent).toContain("818,866 LOC");
    expect(svg.textContent).toContain("WASM32-SIMD");
    expect(svg.textContent).toContain("WASM64");
    expect(svg.textContent).toContain("WebGPU f16");
    expect(svg.textContent).toContain("WebNN");
  });

  it("출처를 확정하지 못한 수치를 계획 입력으로 표시하고 내보낸다", () => {
    render(<StudioRustExpansionArchitectPanel />);
    expect(screen.getByTestId("expansion-planner-assumptions").textContent).toContain("계획 입력");
    const payload = buildRustExpansionExportPayload();
    expect(payload).toMatchObject({ baselineProvenance: "planning-assumptions" });
    expect(exportRustExpansionAdrMarkdown()).toContain("## 1. 계획 기준 입력값");
  });

  it("복사 거절 뒤에도 JSON 미리보기를 유지하고 수동 복사를 안내한다", async () => {
    const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      render(<StudioRustExpansionArchitectPanel locale="en" />);
      fireEvent.click(screen.getByTestId("export-plan-json-btn"));
      await waitFor(() => expect(screen.getByTestId("expansion-panel-status").textContent).toContain("Copy the JSON manually"));
      expect(screen.getByTestId("expansion-export-preview").getAttribute("data-preview-mode")).toBe("json");
      expect(writeText).toHaveBeenCalledTimes(1);
    } finally {
      if (previous) Object.defineProperty(navigator, "clipboard", previous);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("ADR Markdown 및 JSON 내보내기·복사 버튼이 미리보기·onExportMarkdown·토글을 정확히 제어한다", () => {
    const onExportMarkdown = vi.fn();
    render(<StudioRustExpansionArchitectPanel onExportMarkdown={onExportMarkdown} />);

    expect(screen.queryByTestId("expansion-export-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("export-adr-markdown-btn"));
    expect(onExportMarkdown).toHaveBeenCalledTimes(1);
    const [mdArg, planArg] = onExportMarkdown.mock.calls[0] as [string, { targetPhase: number }];
    expect(mdArg).toContain("# ADR: ToonStudio 9대 서브시스템");
    expect(planArg.targetPhase).toBe(4);
    expect(screen.getByTestId("expansion-export-preview").getAttribute("data-preview-mode")).toBe("markdown");

    fireEvent.click(screen.getByTestId("export-plan-json-btn"));
    const jsonPreview = screen.getByTestId("expansion-export-preview");
    expect(jsonPreview.getAttribute("data-preview-mode")).toBe("json");
    expect(jsonPreview.textContent).toContain(EXPANSION_PLAN_SCHEMA_VERSION);

    fireEvent.click(screen.getByTestId("toggle-preview-btn"));
    expect(screen.queryByTestId("expansion-export-preview")).toBeNull();
  });

  it("초기값 복원 버튼이 Phase·플랫폼·미리보기 상태를 원복하고 상태 안내를 출력한다", () => {
    render(
      <StudioRustExpansionArchitectPanel
        initialPhase={2}
        initialPlatform="galaxy-android"
      />,
    );
    fireEvent.click(screen.getByTestId("phase-btn-4"));
    fireEvent.click(screen.getByTestId("platform-btn-all-platform-safe"));
    fireEvent.click(screen.getByTestId("export-plan-json-btn"));
    expect(screen.getByTestId("expansion-export-preview")).toBeTruthy();

    fireEvent.click(screen.getByTestId("reset-expansion-plan-btn"));
    expect(screen.getByTestId("expansion-coverage-svg").getAttribute("data-target-phase")).toBe("2");
    expect(screen.getByTestId("expansion-coverage-svg").getAttribute("data-platform-id")).toBe("galaxy-android");
    expect(screen.queryByTestId("expansion-export-preview")).toBeNull();
    expect(screen.getByTestId("expansion-panel-status").textContent).toContain("복원");
  });

  it("영문 로케일(locale='en')이 헤더·SVG·매트릭스·리스크·ADR Markdown 미리보기에 일관 반영된다", () => {
    render(<StudioRustExpansionArchitectPanel locale="en" initialPhase={3} />);
    expect(screen.getByTestId("expansion-coverage-svg").textContent).toContain("9-SUBSYSTEM RUST / WEBGPU / NPU COVERAGE");
    expect(screen.getByTestId("subsystem-expansion-matrix").textContent).toContain("Deferred to later phase");
    fireEvent.click(screen.getByTestId("export-adr-markdown-btn"));
    expect(screen.getByTestId("expansion-export-preview").textContent).toContain(
      "## 1. Planning Baseline Inputs",
    );
  });
});

describe("6. 코드 위생 · 탈-바이올렛 OKLCH · Calm Atelier 하네스 계약 자가 검증", () => {
  it("4개 소유 파일 줄 수 제한(engine<=720, panel<=680, 전체<=800) 및 금지 패턴 0건을 충족한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "rust-expansion-planner-engine.ts",
      "StudioRustExpansionArchitectPanel.tsx",
      "index.ts",
      "rust-expansion-planner.test.tsx",
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
      if (file === "rust-expansion-planner-engine.ts") expect(lines).toBeLessThanOrEqual(720);
      if (file === "StudioRustExpansionArchitectPanel.tsx") expect(lines).toBeLessThanOrEqual(680);

      if (file !== "rust-expansion-planner.test.tsx") {
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

      if (file === "StudioRustExpansionArchitectPanel.tsx") {
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
      path.resolve(import.meta.dirname, "StudioRustExpansionArchitectPanel.tsx"),
      "utf8",
    );
    const matches = [...panelSrc.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s*\)/gu)];
    expect(matches.length).toBeGreaterThanOrEqual(6);
    for (const match of matches) {
      const hue = Number(match[1]);
      expect(hue < 270 || hue > 320).toBe(true);
    }
  });

  it("렌더된 패널의 모든 버튼이 min-h-11 접근성 터치 타깃을 충족한다", () => {
    const { container } = render(<StudioRustExpansionArchitectPanel />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThanOrEqual(12);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
  });
});
