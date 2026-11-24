// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  DistributedTileCache,
  ERGONOMIC_COACH_CONTRACT,
  GENTLE_STRETCH_ROUTINES,
  NOCODE_SHADER_PRESETS,
  NOCODE_SHADER_UNIFORM_BYTES,
  REFERENCE_SWATCH_PRESETS,
  StudioNoCodeShaderGridPanel,
  analyzeErgonomicCadence,
  buildNoCodeWgslShader,
  computeFnv1a64Hex,
  computeSha256SyncHex,
  createDemoCadenceScenario,
  createLocalCadenceTracker,
  createTileContentKey,
  executeDistributedTileGrid,
  validateGeneratedWgsl,
} from "./index";

const FORBIDDEN_MEDICAL_TERMS =
  /진단|치료|처방|질환|질병|증후군|터널증후군|건초염|염증|의학적|병원|환자|병증|diagnos|treat|prescrib|disease|disorder|syndrome|carpal\s*tunnel|tendinitis|tendonitis|medical|clinical|patient|symptom|pathology|therapy/i;

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

describe("1. 노코드 시각 커스텀 WGSL 셰이더 빌더 (nocode-wgsl-shader-builder)", () => {
  it("4종 한글·영문 질감/조명 프롬프트 모두 유효한 @compute/@fragment WGSL과 서로 구분되는 결정론적 CPU 프리뷰를 생성한다", () => {
    const prompts = [
      { prompt: "따뜻한 수채화 종이 림라이트", style: "watercolor-paper", lighting: "warm-rim" },
      { prompt: "사이버펑크 네온 하프톤", style: "neon-halftone", lighting: "cyber-neon" },
      { prompt: "유화 두꺼운 임파스토", style: "oil-impasto", lighting: "directional-key" },
      { prompt: "셀 애니메이션 2단 그림자", style: "cel-2step", lighting: "cel-hard-shadow" },
      { prompt: "warm watercolor paper rim light", style: "watercolor-paper", lighting: "warm-rim" },
      { prompt: "cyberpunk neon halftone", style: "neon-halftone", lighting: "cyber-neon" },
      { prompt: "thick oil impasto", style: "oil-impasto", lighting: "directional-key" },
      { prompt: "cel anime 2-step shadow", style: "cel-2step", lighting: "cel-hard-shadow" },
    ] as const;

    const koreanDigests = new Set<string>();
    expect(NOCODE_SHADER_PRESETS).toHaveLength(4);

    for (const item of prompts) {
      const computeBundle = buildNoCodeWgslShader({
        prompt: item.prompt,
        targetStage: "compute",
        previewWidth: 32,
        previewHeight: 32,
      });
      const fragmentBundle = buildNoCodeWgslShader({
        prompt: item.prompt,
        targetStage: "fragment",
        previewWidth: 32,
        previewHeight: 32,
      });

      expect(computeBundle.recipe.style).toBe(item.style);
      expect(computeBundle.recipe.lighting).toBe(item.lighting);
      expect(computeBundle.computeValidation.valid).toBe(true);
      expect(computeBundle.computeValidation.errors).toEqual([]);
      expect(computeBundle.fragmentValidation.valid).toBe(true);
      expect(computeBundle.fragmentValidation.errors).toEqual([]);
      expect(computeBundle.primaryWgsl).toContain("@compute @workgroup_size(16, 16, 1)");
      expect(fragmentBundle.primaryWgsl).toContain("@fragment");
      expect(fragmentBundle.primaryWgsl).toContain("@vertex");
      expect(computeBundle.uniformBufferWords.byteLength).toBe(NOCODE_SHADER_UNIFORM_BYTES);
      expect(computeBundle.preview.rgba).toHaveLength(32 * 32 * 4);
      expect(computeBundle.preview.lumaGrid8x8).toHaveLength(64);
      expect(computeBundle.preview.digestHex).toBe(fragmentBundle.preview.digestHex);
      expect(Array.from(computeBundle.preview.rgba)).toEqual(Array.from(fragmentBundle.preview.rgba));

      if (/[가-힣]/.test(item.prompt)) {
        koreanDigests.add(computeBundle.preview.digestHex);
      }
    }

    expect(koreanDigests.size).toBe(4);
  });

  it("레퍼런스 컬러 스와치 단독 입력과 하이브리드 입력이 셰이더 색상·프리뷰 픽셀에 결정론적으로 반영된다", () => {
    const amber = REFERENCE_SWATCH_PRESETS[0];
    const cyber = REFERENCE_SWATCH_PRESETS[1];
    expect(amber).toBeDefined();
    expect(cyber).toBeDefined();
    if (!amber || !cyber) return;

    const swatchOnlyA = buildNoCodeWgslShader({ swatches: amber.swatches, previewWidth: 24, previewHeight: 24 });
    const swatchOnlyB = buildNoCodeWgslShader({ swatches: cyber.swatches, previewWidth: 24, previewHeight: 24 });
    const swatchRepeat = buildNoCodeWgslShader({ swatches: amber.swatches, previewWidth: 24, previewHeight: 24 });

    expect(swatchOnlyA.recipe.inputMode).toBe("swatches");
    expect(swatchOnlyA.computeValidation.valid).toBe(true);
    expect(swatchOnlyA.fragmentValidation.valid).toBe(true);
    expect(swatchOnlyA.preview.digestHex).toBe(swatchRepeat.preview.digestHex);
    expect(swatchOnlyA.preview.digestHex).not.toBe(swatchOnlyB.preview.digestHex);

    const hybrid = buildNoCodeWgslShader({
      prompt: "따뜻한 수채화 종이 림라이트",
      swatches: cyber.swatches,
      previewWidth: 24,
      previewHeight: 24,
    });
    expect(hybrid.recipe.inputMode).toBe("hybrid");
    expect(hybrid.recipe.uniforms.rimColor.b).toBeGreaterThan(0.9);
  });

  it("손상된 WGSL 소스의 문법·바인딩·수치 오류를 정적 검증기가 탐지한다", () => {
    const broken = validateGeneratedWgsl("fn main() { let x = NaN;", "compute");
    expect(broken.valid).toBe(false);
    expect(broken.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("2. 콘텐츠 주소화 분산 타일 캐시 · 멀티 워커 그리드 스케줄러 (distributed-tile-grid-scheduler)", () => {
  it("FIPS 180-4 SHA-256 및 FNV-1a 64 콘텐츠 해시와 LRU 타일 캐시 무결성을 보장한다", () => {
    expect(computeSha256SyncHex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(computeSha256SyncHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(computeFnv1a64Hex("toonstudio-tile")).toMatch(/^[0-9a-f]{16}$/);

    const keyA = createTileContentKey(
      { tileX: 1, tileY: 2, width: 128, height: 128, workloadKind: "3d-npr-pass", recipeDigest: "abc", qualityTier: "studio", sceneRevision: 1 },
      "sha-256",
    );
    const keySame = createTileContentKey(
      { tileX: 1, tileY: 2, width: 128, height: 128, workloadKind: "3d-npr-pass", recipeDigest: "abc", qualityTier: "studio", sceneRevision: 1 },
      "sha-256",
    );
    const keyChanged = createTileContentKey(
      { tileX: 1, tileY: 2, width: 128, height: 128, workloadKind: "3d-npr-pass", recipeDigest: "def", qualityTier: "studio", sceneRevision: 1 },
      "sha-256",
    );
    expect(keyA).toBe(keySame);
    expect(keyA).not.toBe(keyChanged);
    expect(keyA.startsWith("sha256:")).toBe(true);

    // LRU 예산 축출 및 외부 변조 방지 확인
    const cache = new DistributedTileCache({ maxBytes: 512, maxEntries: 2, algorithm: "fnv1a-64" });
    const p1 = new Uint8ClampedArray(256).fill(42);
    const p2 = new Uint8ClampedArray(256).fill(84);
    const p3 = new Uint8ClampedArray(256).fill(126);
    cache.set("k1", p1, "worker-1");
    cache.set("k2", p2, "worker-2");
    const hit1 = cache.get("k1");
    expect(hit1).not.toBeNull();
    if (hit1) hit1.pixels[0] = 255; // 반환 복사본 변경이 캐시 원본에 영향 주지 않아야 함
    expect(cache.verifyEntryIntegrity("k1")).toBe(true);

    // k1을 최근 조회했으므로 k3 삽입 시 k2가 LRU 축출됨
    cache.set("k3", p3, "worker-3");
    expect(cache.has("k1")).toBe(true);
    expect(cache.has("k2")).toBe(false);
    expect(cache.has("k3")).toBe(true);
    expect(cache.getStats().evictions).toBe(1);
  });

  it("멀티 워커 워크스틸링 병렬 가속, 100% 캐시 적중률, 장애 노드 자동 재할당과 비트 동일성을 검증한다", () => {
    const sharedCache = new DistributedTileCache({ algorithm: "sha-256" });

    // 1) 단일 워커 기준선
    const single = executeDistributedTileGrid({
      canvasWidth: 512,
      canvasHeight: 512,
      tileSize: 128,
      workerCount: 1,
      recipeDigest: "scene-hero-01",
      skewedWorkload: true,
    });
    expect(single.totalTiles).toBe(16);
    expect(single.completedTiles).toBe(16);
    expect(single.parallelSpeedup).toBeCloseTo(1, 1);

    // 2) 4워커 콜드 패스(워크스틸링 + 병렬 가속)
    const cold4 = executeDistributedTileGrid({
      canvasWidth: 512,
      canvasHeight: 512,
      tileSize: 128,
      workerCount: 4,
      recipeDigest: "scene-hero-01",
      skewedWorkload: true,
      cache: sharedCache,
    });
    expect(cold4.completedTiles).toBe(16);
    expect(cold4.cacheHitRate).toBe(0);
    expect(cold4.parallelSpeedup).toBeGreaterThan(2.2);
    expect(cold4.workStealCount).toBeGreaterThan(0);
    expect(cold4.loadBalanceEfficiency).toBeGreaterThan(0.65);
    expect(cold4.stitchedDigestHex).toBe(single.stitchedDigestHex);

    // 3) 동일 장면 웜 캐시 패스(100% 캐시 적중 + 비트 동일성)
    const warm4 = executeDistributedTileGrid({
      canvasWidth: 512,
      canvasHeight: 512,
      tileSize: 128,
      workerCount: 4,
      recipeDigest: "scene-hero-01",
      skewedWorkload: true,
      cache: sharedCache,
    });
    expect(warm4.cacheHits).toBe(16);
    expect(warm4.cacheMisses).toBe(0);
    expect(warm4.cacheHitRate).toBe(1);
    expect(warm4.stitchedDigestHex).toBe(single.stitchedDigestHex);

    // 4) 레시피 변경 시 콘텐츠 주소화 키 자동 무효화
    const invalidated = executeDistributedTileGrid({
      canvasWidth: 512,
      canvasHeight: 512,
      tileSize: 128,
      workerCount: 4,
      recipeDigest: "scene-hero-02-relight",
      skewedWorkload: true,
      cache: sharedCache,
    });
    expect(invalidated.cacheHits).toBe(0);
    expect(invalidated.cacheMisses).toBe(16);
    expect(invalidated.stitchedDigestHex).not.toBe(single.stitchedDigestHex);

    // 5) 장애 노드 주입 시 자동 재할당 + 100% 복구 + 비트 동일성
    const failover = executeDistributedTileGrid({
      canvasWidth: 512,
      canvasHeight: 512,
      tileSize: 128,
      workerCount: 4,
      recipeDigest: "scene-hero-01",
      faultyNodeIds: ["worker-1"],
      failAfterTiles: 1,
      skewedWorkload: true,
    });
    expect(failover.failedNodeIds).toEqual(["worker-1"]);
    expect(failover.failoverCount).toBeGreaterThan(0);
    expect(failover.allTilesRecovered).toBe(true);
    expect(failover.completedTiles).toBe(16);
    expect(failover.failedTiles).toBe(0);
    expect(failover.stitchedDigestHex).toBe(single.stitchedDigestHex);

    // 6) 모든 노드가 실패하는 극단 상황에서도 예외 없이 구조화된 미복구 리포트 반환
    const allFailed = executeDistributedTileGrid({
      canvasWidth: 256,
      canvasHeight: 256,
      tileSize: 128,
      workerCount: 2,
      faultyNodeIds: ["worker-1", "worker-2"],
      failAfterTiles: 0,
    });
    expect(allFailed.allTilesRecovered).toBe(false);
    expect(allFailed.failedTiles).toBeGreaterThan(0);
  });
});

describe("3. 비의료 인체공학 작업 리듬 코치 (ergonomic-cadence-coach)", () => {
  it("엄격 비의료·비진단 원칙과 외부 전송 0바이트를 준수하며 4단계 작업 리듬을 정확히 판별한다", () => {
    expect(ERGONOMIC_COACH_CONTRACT.nonMedicalOnly).toBe(true);
    expect(ERGONOMIC_COACH_CONTRACT.diagnosticClaimsAllowed).toBe(false);
    expect(ERGONOMIC_COACH_CONTRACT.externalBytesTransmitted).toBe(0);
    expect(ERGONOMIC_COACH_CONTRACT.networkRequestsMade).toBe(0);
    expect(ERGONOMIC_COACH_CONTRACT.usesBrowserStorage).toBe(false);

    const calm = analyzeErgonomicCadence(createDemoCadenceScenario("calm-flow"));
    const sprint = analyzeErgonomicCadence(createDemoCadenceScenario("focused-sprint"));
    const crunch = analyzeErgonomicCadence(createDemoCadenceScenario("undo-surge-crunch"));
    const elevated = analyzeErgonomicCadence({
      continuousWorkMinutes: 30,
      strokesPerMinute: 36,
      recentUndoCount5Min: 10,
      baselineUndoCount5Min: 4,
    });

    expect(calm.rhythmLevel).toBe("steady");
    expect(calm.recommendedBreakMinutes).toBe(0);
    expect(calm.undoSurgeDetected).toBe(false);

    expect(elevated.rhythmLevel).toBe("elevated");
    expect(elevated.undoSurgeDetected).toBe(true);

    expect(sprint.rhythmLevel).toBe("break-suggested");
    expect(sprint.recommendedBreakMinutes).toBe(3);

    expect(crunch.rhythmLevel).toBe("pause-now");
    expect(crunch.recommendedBreakMinutes).toBe(5);
    expect(crunch.undoSurgeDetected).toBe(true);
    expect(crunch.undoSurgeRatio).toBeGreaterThanOrEqual(4);
    expect(crunch.overallPaceLoad).toBeGreaterThan(sprint.overallPaceLoad);
    expect(sprint.overallPaceLoad).toBeGreaterThan(calm.overallPaceLoad);

    // 모든 시나리오·스트레칭 루틴 출력 문구에서 의료·진단 표현 0건 검증
    const allTexts = [
      ...GENTLE_STRETCH_ROUTINES.flatMap((r) => [r.titleKo, r.titleEn, r.stepsKo, r.stepsEn, r.comfortNoteKo, r.comfortNoteEn]),
      ...[calm, elevated, sprint, crunch].flatMap((rep) => [
        rep.headlineKo,
        rep.headlineEn,
        rep.guidanceKo,
        rep.guidanceEn,
        rep.disclaimerKo,
        rep.disclaimerEn,
        ...rep.signals.flatMap((s) => [s.valueLabelKo, s.valueLabelEn, s.noteKo, s.noteEn]),
      ]),
    ].join("\n");
    expect(allTexts).not.toMatch(FORBIDDEN_MEDICAL_TERMS);
  });

  it("순수 인메모리 로컬 케이던스 추적기가 스트로크·실행취소 급증과 휴식 리셋에 반응한다", () => {
    const tracker = createLocalCadenceTracker({ continuousWorkMinutes: 15, strokesPerMinute: 22, recentUndoCount5Min: 2 });
    expect(tracker.evaluate().rhythmLevel).toBe("steady");

    tracker.advanceMinutes(60);
    tracker.recordStrokes(42);
    tracker.recordUndo(16);
    const peak = tracker.evaluate();
    expect(peak.rhythmLevel).toBe("pause-now");
    expect(peak.undoSurgeDetected).toBe(true);
    expect(peak.privacy.externalBytesTransmitted).toBe(0);

    tracker.recordBreakCompleted(5);
    const rested = tracker.evaluate();
    expect(rested.rhythmLevel).toBe("steady");
    expect(rested.recommendedBreakMinutes).toBe(0);
  });
});

describe("4. StudioNoCodeShaderGridPanel UI · 단독 렌더 · 3탭 인터랙션 · 정적 위생 계약", () => {
  it("props 없이 단독 마운트되며 3개 탭 전체와 콜백이 정상 동작한다", () => {
    render(<StudioNoCodeShaderGridPanel />);
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.getByTestId("nocode-wgsl-code").textContent).toContain("@compute @workgroup_size(16, 16, 1)");
    cleanup();

    const onShaderBuilt = vi.fn();
    const onGridExecuted = vi.fn();
    const onCadenceEvaluated = vi.fn();

    render(
      <StudioNoCodeShaderGridPanel
        locale="ko"
        onShaderBuilt={onShaderBuilt}
        onGridExecuted={onGridExecuted}
        onCadenceEvaluated={onCadenceEvaluated}
      />,
    );

    // 탭 1: 자연어 WGSL 셰이더 빌더
    const initialDigest = screen.getByTestId("shader-digest-badge").textContent;
    fireEvent.click(screen.getByRole("button", { name: "사이버펑크 네온 하프톤" }));
    expect(screen.getByTestId("shader-digest-badge").textContent).not.toBe(initialDigest);
    fireEvent.click(screen.getByRole("button", { name: "@fragment" }));
    expect(screen.getByTestId("nocode-wgsl-code").textContent).toContain("@fragment");
    fireEvent.click(screen.getByRole("button", { name: "아틀리에 노을 스와치" }));
    fireEvent.click(screen.getByRole("button", { name: /셰이더 빌드 적용 확인/i }));
    expect(onShaderBuilt).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("@fragment WGSL 검증 통과");

    // 탭 2: 분산 타일 캐시 · 워커 그리드
    fireEvent.click(screen.getByRole("tab", { name: /분산 타일 캐시/i }));
    expect(screen.getByTestId("tile-grid-map").children).toHaveLength(16);
    const coldDigest = screen.getByTestId("grid-stitched-digest").textContent;
    fireEvent.click(screen.getByRole("button", { name: /동일 장면 재렌더/i }));
    expect(screen.getByTestId("grid-cache-hit-rate").textContent).toContain("100%");
    expect(screen.getByTestId("grid-stitched-digest").textContent).toBe(coldDigest);

    fireEvent.click(screen.getByRole("button", { name: /노드 1 장애 시뮬레이션/i }));
    expect(screen.getByTestId("grid-failover-status").textContent).toContain("16/16");
    expect(onGridExecuted).toHaveBeenCalledTimes(2);

    // 탭 3: 비의료 작업 리듬 코치
    fireEvent.click(screen.getByRole("tab", { name: /비의료 작업 리듬 코치/i }));
    expect(screen.getByTestId("ergo-privacy-badge").textContent).toContain("외부 전송 0 B");
    fireEvent.click(screen.getByRole("button", { name: "실행취소 급증 구간" }));
    expect(screen.getByTestId("ergo-rhythm-banner").textContent).toContain("5분");
    expect(screen.getByTestId("ergo-stretch-list").children.length).toBeGreaterThanOrEqual(4);
    fireEvent.click(screen.getByRole("button", { name: /휴식 완료 · 리듬 초기화/i }));
    expect(screen.getByTestId("ergo-rhythm-banner").textContent).toContain("여유롭고 안정적인");
    expect(onCadenceEvaluated).toHaveBeenCalledTimes(2);
  });

  it("영어(en) 로케일과 파일 길이(<=800줄)·원시색상/storage/네트워크/의료표현 금지 계약을 지킨다", () => {
    render(<StudioNoCodeShaderGridPanel locale="en" />);
    expect(screen.getByRole("tab", { name: "No-Code WGSL Builder" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Distributed Tile Grid" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Work Rhythm Coach" })).toBeTruthy();

    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/nocode-shader-grid");
    const files = [
      "nocode-wgsl-shader-builder.ts",
      "distributed-tile-grid-scheduler.ts",
      "ergonomic-cadence-coach.ts",
      "StudioNoCodeShaderGridPanel.tsx",
      "index.ts",
      "nocode-shader-grid.test.tsx",
    ] as const;

    for (const fileName of files) {
      const source = readFileSync(resolve(dir, fileName), "utf8");
      const lineCount = source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
      expect(lineCount).toBeLessThanOrEqual(800);

      if (fileName !== "nocode-shader-grid.test.tsx") {
        expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(source).not.toMatch(/\brgba?\s*\(/i);
        expect(source).not.toMatch(/\bhsla?\s*\(/i);
        expect(source).not.toContain("localStorage");
        expect(source).not.toContain("sessionStorage");
      }
      if (fileName === "StudioNoCodeShaderGridPanel.tsx") {
        expect(source).not.toContain("transition-all");
        expect(source).toContain("[word-break:keep-all]");
        expect(source).toContain("tabular-nums");
        expect(source).not.toMatch(FORBIDDEN_MEDICAL_TERMS);
      }
      if (fileName === "ergonomic-cadence-coach.ts") {
        expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/);
        const sanitized = source.replaceAll("nonMedicalOnly", "").replaceAll("diagnosticClaimsAllowed", "");
        expect(sanitized).not.toMatch(FORBIDDEN_MEDICAL_TERMS);
      }
    }
  });
});
