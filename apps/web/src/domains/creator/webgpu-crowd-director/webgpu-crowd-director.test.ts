// @vitest-environment jsdom

import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CROWD_BASE_SILHOUETTE_INDEX_COUNT,
  CROWD_CAMERA_UNIFORM_BYTES,
  CROWD_INDIRECT_ARGS_BYTES,
  CROWD_INSTANCING_WGSL,
  CROWD_INSTANCE_STRIDE_BYTES,
  CROWD_MAX_COUNT,
  CROWD_MIN_COUNT,
  CROWD_PRESETS,
  StudioWebgpuCrowdDirectorPanel,
  encodeCrowdDrawIndexedIndirect,
  generateProceduralCrowd,
  getCrowdPresetById,
  renderCrowdPreviewCanvas,
  renderCrowdRgbaPreview,
  renderCrowdSvgLayer,
  validateCrowdWgslShader,
  type CrowdPresetId,
} from "./index";
import {
  CROWD_GPU_BIND_GROUP_LAYOUTS,
  packCrowdInstanceBuffers,
  resetCrowdIndirectFrame,
} from "./procedural-crowd-engine";

const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/u;
const FORBIDDEN_STORAGE_REGEX = /\blocalStorage\b|\bsessionStorage\b/u;
const FORBIDDEN_TRANSITION_ALL_REGEX = /\btransition-all\b/u;
const FORBIDDEN_SPARKLES_REGEX = /\bSparkles\b/u;
const FORBIDDEN_PRIVATE_STORE_MAP_REGEX =
  /\bprivate\s+(?:readonly\s+)?store\b|\bstore\s*=\s*new\s+Map\b/u;
const FORBIDDEN_BIGINT_LITERAL_REGEX = /\b\d+n\b/u;

const EXPECTED_PRESET_IDS: readonly CrowdPresetId[] = [
  "crosswalk-rush",
  "school-hallway",
  "stadium-concert",
  "fantasy-knights",
  "medieval-market",
  "crowded-subway",
  "cafe-terrace",
  "airport-lobby",
];

function createMockCanvas2dContext(): CanvasRenderingContext2D {
  const gradientStub = {
    addColorStop: vi.fn(),
  };
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: vi.fn(() => gradientStub),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    globalAlpha: 1,
    font: "",
  } as unknown as CanvasRenderingContext2D;
}

function mockCanvas2dPreview(context = createMockCanvas2dContext()): void {
  const canvas2d: { getContext(contextId: "2d"): CanvasRenderingContext2D | null } =
    HTMLCanvasElement.prototype;
  vi.spyOn(canvas2d, "getContext").mockImplementation((id) =>
    id === "2d" ? context : null,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Wave 38D — WebGPU 인스턴싱 기반 8종 원근 절차적 군중 생성 엔진", () => {
  it("1. 8종 웹툰 빈출 군중 프리셋 ID·한글 라벨·기본 파라미터가 빠짐없이 등록되고 정상 생성된다", () => {
    expect(CROWD_PRESETS).toHaveLength(8);
    expect(CROWD_PRESETS.map((p) => p.id)).toEqual(EXPECTED_PRESET_IDS);

    for (const presetId of EXPECTED_PRESET_IDS) {
      const preset = getCrowdPresetById(presetId);
      expect(preset.id).toBe(presetId);
      expect(preset.labelKo.length).toBeGreaterThan(2);
      expect(preset.shortLabelKo.length).toBeGreaterThan(1);

      const scene = generateProceduralCrowd({ presetId, count: 60, seed: 42 });
      expect(scene.metrics.placedCount).toBe(60);
      expect(scene.metrics.overlapViolations).toBe(0);
      expect(scene.gpuBuffers.instanceCount).toBe(60);
    }
  });

  it("2. 동일 시드·옵션에서 500명 배치가 100% 결정론적이고 5ms 미만으로 완료된다", () => {
    // JIT 워밍업 1회 후 실측
    generateProceduralCrowd({ presetId: "crosswalk-rush", count: 500, seed: 9001 });

    const runA = generateProceduralCrowd({ presetId: "crosswalk-rush", count: 500, seed: 1337 });
    const runB = generateProceduralCrowd({ presetId: "crosswalk-rush", count: 500, seed: 1337 });
    const runDiffSeed = generateProceduralCrowd({
      presetId: "crosswalk-rush",
      count: 500,
      seed: 1338,
    });

    expect(runA.metrics.placedCount).toBe(500);
    expect(runA.metrics.overlapViolations).toBe(0);
    expect(runA.metrics.generationTimeMs).toBeLessThan(5);
    expect(runB.metrics.generationTimeMs).toBeLessThan(5);

    expect(runA.agents).toEqual(runB.agents);
    expect(Array.from(runA.gpuBuffers.instanceData)).toEqual(
      Array.from(runB.gpuBuffers.instanceData),
    );
    expect(runA.agents[0]?.screenX).not.toBe(runDiffSeed.agents[0]?.screenX);
  });

  it("3. 인원 수 하한(20명)·상한(2,000명) 클램핑과 2,000명 대규모 생성 성능을 보장한다", () => {
    const low = generateProceduralCrowd({ presetId: "cafe-terrace", count: 3, seed: 7 });
    expect(low.options.count).toBe(CROWD_MIN_COUNT);
    expect(low.metrics.placedCount).toBe(CROWD_MIN_COUNT);

    // 워밍업 후 2,000명 대규모 배치 검증
    generateProceduralCrowd({ presetId: "stadium-concert", count: 2000, seed: 101 });
    const high = generateProceduralCrowd({
      presetId: "stadium-concert",
      count: 5000,
      seed: 202,
    });
    expect(high.options.count).toBe(CROWD_MAX_COUNT);
    expect(high.metrics.placedCount).toBe(CROWD_MAX_COUNT);
    expect(high.metrics.overlapViolations).toBe(0);
    expect(high.metrics.generationTimeMs).toBeLessThan(20);
  });

  it("4. Poisson-disk 공간 해시 비겹침 배치가 전 쌍 최소 간격을 엄격히 보장한다", () => {
    const scene = generateProceduralCrowd({
      presetId: "airport-lobby",
      count: 220,
      seed: 555,
    });
    expect(scene.metrics.overlapViolations).toBe(0);
    expect(scene.metrics.minObservedWorldSpacingM).toBeGreaterThan(0.2);

    // 브루트포스 O(N^2) 교차 검증으로 공간 해시 감사의 무결성 확인
    let bruteMinDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < scene.agents.length; i += 1) {
      const a = scene.agents[i];
      if (!a) continue;
      for (let j = i + 1; j < scene.agents.length; j += 1) {
        const b = scene.agents[j];
        if (!b) continue;
        const d = Math.hypot(a.worldX - b.worldX, a.worldZ - b.worldZ);
        if (d < bruteMinDist) bruteMinDist = d;
      }
    }
    expect(bruteMinDist).toBeGreaterThan(0.2);
    expect(Math.abs(bruteMinDist - scene.metrics.minObservedWorldSpacingM)).toBeLessThan(0.02);
  });

  it("5. 깊이 정렬(원경→근경 painter's order)과 깊이 기반 원근 스케일 단조성을 지킨다", () => {
    const scene = generateProceduralCrowd({
      presetId: "fantasy-knights",
      count: 300,
      seed: 777,
    });

    for (let i = 0; i < scene.agents.length - 1; i += 1) {
      const far = scene.agents[i];
      const near = scene.agents[i + 1];
      if (!far || !near) continue;
      expect(far.worldZ).toBeGreaterThanOrEqual(near.worldZ);
      expect(far.depth).toBeGreaterThanOrEqual(near.depth);
      expect(far.perspectiveScale).toBeLessThanOrEqual(near.perspectiveScale + 1e-6);
    }

    const farthest = scene.agents[0];
    const nearest = scene.agents[scene.agents.length - 1];
    expect(nearest?.perspectiveScale ?? 0).toBeGreaterThan((farthest?.perspectiveScale ?? 0) * 3);
    expect(nearest?.silhouetteHeightPx ?? 0).toBeGreaterThan((farthest?.silhouetteHeightPx ?? 0) * 3);
  });

  it("6. 근경 굵은 G펜 잉크 > 원경 얇은 실루엣 선두께 감쇄와 대기 원근 페이드 단조성을 지킨다", () => {
    const scene = generateProceduralCrowd({
      presetId: "crowded-subway",
      count: 160,
      strokeAttenuation: 0.92,
      nearStrokeWidthPx: 3.4,
      farStrokeWidthPx: 0.45,
      seed: 808,
    });

    for (let i = 0; i < scene.agents.length - 1; i += 1) {
      const far = scene.agents[i];
      const near = scene.agents[i + 1];
      if (!far || !near) continue;
      expect(far.strokeWidthPx).toBeLessThanOrEqual(near.strokeWidthPx + 1e-6);
      expect(far.atmosphericFade).toBeGreaterThanOrEqual(near.atmosphericFade - 1e-6);
      expect(far.opacity).toBeLessThanOrEqual(near.opacity + 1e-6);
    }

    const farthest = scene.agents[0];
    const nearest = scene.agents[scene.agents.length - 1];
    expect(nearest?.strokeWidthPx ?? 0).toBeGreaterThan((farthest?.strokeWidthPx ?? 0) * 2.5);
    expect(farthest?.atmosphericFade ?? 0).toBeGreaterThan((nearest?.atmosphericFade ?? 0) + 0.35);
    expect(scene.metrics.nearStrokeWidthPx).toBeGreaterThan(scene.metrics.farStrokeWidthPx);
  });

  it("7. 주인공 포컬 포인트(x, y) 이동 시 군중 시선과 몸 방향이 해당 좌표를 향해 자동 정렬된다", () => {
    const lookLeft = generateProceduralCrowd({
      presetId: "stadium-concert",
      count: 140,
      focalPointX: 0.1,
      focalPointY: 0.72,
      focalAttention: 1.0,
      seed: 303,
    });
    const lookRight = generateProceduralCrowd({
      presetId: "stadium-concert",
      count: 140,
      focalPointX: 0.9,
      focalPointY: 0.72,
      focalAttention: 1.0,
      seed: 303,
    });

    const meanHeadLeft =
      lookLeft.agents.reduce((acc, a) => acc + a.headYawRad, 0) / lookLeft.agents.length;
    const meanHeadRight =
      lookRight.agents.reduce((acc, a) => acc + a.headYawRad, 0) / lookRight.agents.length;
    const meanBodyLeft =
      lookLeft.agents.reduce((acc, a) => acc + a.bodyYawRad, 0) / lookLeft.agents.length;
    const meanBodyRight =
      lookRight.agents.reduce((acc, a) => acc + a.bodyYawRad, 0) / lookRight.agents.length;

    expect(meanHeadLeft).toBeLessThan(-0.35);
    expect(meanHeadRight).toBeGreaterThan(0.35);
    expect(meanBodyLeft).toBeLessThan(-0.2);
    expect(meanBodyRight).toBeGreaterThan(0.2);
    expect(lookLeft.metrics.meanGazeAlignment).toBeGreaterThan(0.95);
    expect(lookRight.metrics.meanGazeAlignment).toBeGreaterThan(0.95);
  });

  it("8. 프리셋별 고유 공간 특성(경기장 계단 고도 · 카페 좌석 비율 · 중세 골목 폭)이 반영된다", () => {
    const stadium = generateProceduralCrowd({ presetId: "stadium-concert", count: 100, seed: 11 });
    const cafe = generateProceduralCrowd({ presetId: "cafe-terrace", count: 100, seed: 11 });
    const crosswalk = generateProceduralCrowd({ presetId: "crosswalk-rush", count: 100, seed: 11 });

    const maxStadiumWorldY = Math.max(...stadium.agents.map((a) => a.worldY));
    const maxCrosswalkWorldY = Math.max(...crosswalk.agents.map((a) => a.worldY));
    expect(maxStadiumWorldY).toBeGreaterThan(2.5);
    expect(maxCrosswalkWorldY).toBe(0);

    const seatedCafeCount = cafe.agents.filter((a) => a.seated).length;
    const seatedCrosswalkCount = crosswalk.agents.filter((a) => a.seated).length;
    expect(seatedCafeCount).toBeGreaterThan(15);
    expect(seatedCrosswalkCount).toBe(0);
  });

  it("9. CROWD_INSTANCING_WGSL 문법·진입점·DrawIndexedIndirectArgs 검증을 통과하고 오류 WGSL을 검출한다", () => {
    const report = validateCrowdWgslShader(CROWD_INSTANCING_WGSL);
    expect(report.valid).toBe(true);
    expect(report.balancedDelimiters).toBe(true);
    expect(report.hasDrawIndexedIndirectStruct).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.computeEntryPoints).toEqual(["reset_crowd_indirect", "cull_and_build_indirect"]);
    expect(report.vertexEntryPoints).toEqual(["vs_crowd_instanced"]);
    expect(report.fragmentEntryPoints).toEqual(["fs_crowd_toon_ink"]);
    expect(report.workgroupSizes).toEqual(["64,1,1", "64,1,1"]);
    expect(report.bindings).toHaveLength(5);
    expect(report.structs).toEqual(
      expect.arrayContaining([
        "CrowdCameraUniform",
        "CrowdInstance",
        "DrawIndexedIndirectArgs",
      ]),
    );

    const invalid = validateCrowdWgslShader(`
      @group(0) @binding(0) var<uniform> dupA: u32;
      @group(0) @binding(0) var<uniform> dupB: u32;
      fn broken( {
    `);
    expect(invalid.valid).toBe(false);
    expect(invalid.balancedDelimiters).toBe(false);
    expect(invalid.hasDrawIndexedIndirectStruct).toBe(false);
    expect(invalid.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("compute 쓰기·vertex 읽기 바인딩과 호스트 레이아웃을 분리한다 (GPU 컴파일 검증 아님)", () => {
    const compute = CROWD_GPU_BIND_GROUP_LAYOUTS.compute.entries;
    const render = CROWD_GPU_BIND_GROUP_LAYOUTS.render.entries;
    expect(compute.map((entry) => entry.binding)).toEqual([0, 1, 2, 3]);
    expect(render.map((entry) => entry.binding)).toEqual([0, 1, 4]);
    expect(compute.every((entry) => entry.visibility === 4)).toBe(true);
    expect(render.every((entry) => entry.visibility === 1)).toBe(true);
    expect(compute.find((entry) => entry.binding === 2)?.buffer).toEqual({
      type: "storage", minBindingSize: 4,
    });
    expect(render.find((entry) => entry.binding === 4)?.buffer).toEqual({
      type: "read-only-storage", minBindingSize: 4,
    });
    expect(render.map((entry) => entry.buffer.type)).not.toContain("storage");
    expect(CROWD_INSTANCING_WGSL).toContain(
      "@binding(4) var<storage, read> visibleIndicesForVertex: array<u32>",
    );
    const vertexSource = CROWD_INSTANCING_WGSL.split("@vertex")[1]?.split("@fragment")[0] ?? "";
    expect(vertexSource).toContain("visibleIndicesForVertex[instSlot]");
    expect(vertexSource).not.toMatch(/\bvisibleIndices\b|\bindirectArgs\b/u);
  });

  it("10. 버퍼 패킹과 이론상 드로우콜 가정·명령 인코딩을 검증하고 GPU 실행을 주장하지 않는다", () => {
    const scene = generateProceduralCrowd({ presetId: "crosswalk-rush", count: 500, seed: 404 });
    const { gpuBuffers, metrics } = scene;

    expect(gpuBuffers.instanceStrideBytes).toBe(CROWD_INSTANCE_STRIDE_BYTES);
    expect(gpuBuffers.instanceData.byteLength).toBe(500 * 64);
    expect(gpuBuffers.instanceData.byteLength % 64).toBe(0);
    expect(gpuBuffers.indirectArgs.byteLength).toBe(CROWD_INDIRECT_ARGS_BYTES);
    expect(gpuBuffers.cameraUniform.byteLength).toBe(CROWD_CAMERA_UNIFORM_BYTES);
    expect(Array.from(gpuBuffers.indirectArgs)).toEqual([
      CROWD_BASE_SILHOUETTE_INDEX_COUNT,
      500,
      0,
      0,
      0,
    ]);

    expect(metrics.drawCallMetrics.basis).toBe("theoretical-instancing");
    expect(metrics.drawCallMetrics.naiveDrawCalls).toBe(1500);
    expect(metrics.drawCallMetrics.instancedDrawCalls).toBe(1);
    expect(metrics.drawCallMetrics.drawCallReductionPct).toBeGreaterThan(99.9);

    const drawIndexedIndirect = vi.fn();
    const fakePass = { drawIndexedIndirect };
    const fakeBuffer = {} as GPUBuffer;
    const gpuSubmission = encodeCrowdDrawIndexedIndirect(fakePass, fakeBuffer, gpuBuffers, 0);
    expect(gpuSubmission.commandEncoded).toBe(true);
    expect(gpuSubmission.executedOnGpu).toBe(false);
    expect(gpuSubmission.drawCallCount).toBe(1);
    expect(gpuSubmission.instanceCount).toBe(500);
    expect(drawIndexedIndirect).toHaveBeenCalledWith(fakeBuffer, 0);

    const fallbackSubmission = encodeCrowdDrawIndexedIndirect(null, null, gpuBuffers);
    expect(fallbackSubmission.commandEncoded).toBe(false);
    expect(fallbackSubmission.executedOnGpu).toBe(false);
    expect(fallbackSubmission.drawCallCount).toBe(0);
    expect(fallbackSubmission.instanceCount).toBe(500);
  });

  it("uncull은 identity 인덱스·N명이며 재프레임 초기화 후에도 compute를 생략한다", () => {
    const scene = generateProceduralCrowd({ count: 20, seed: 404 });
    const pack = packCrowdInstanceBuffers(scene.agents, scene.preset, scene.options);
    const identity = Array.from({ length: 20 }, (_, i) => i);
    expect(pack.drawMode).toBe("unculled");
    expect(pack.indirectArgs[1]).toBe(20);
    expect(Array.from(pack.visibleIndices)).toEqual(identity);
    expect(pack.cameraUniform[15]).toBe(0);
    expect(pack.frameDispatch.cullEntryPoint).toBeNull();
    expect(pack.frameDispatch.cullWorkgroupCount).toBe(0);
    pack.indirectArgs[1] = 40;
    pack.visibleIndices.fill(19);
    resetCrowdIndirectFrame(pack);
    expect(pack.indirectArgs[1]).toBe(20);
    expect(Array.from(pack.visibleIndices)).toEqual(identity);
  });

  it("compute-cull은 매 프레임 count 0·미사용 인덱스로 시작하고 reset→cull을 별도 dispatch한다", () => {
    const scene = generateProceduralCrowd({ count: 65, seed: 404 });
    const pack = packCrowdInstanceBuffers(scene.agents, scene.preset, scene.options, "compute-culled");
    expect(pack.indirectArgs[1]).toBe(0);
    expect(Array.from(pack.visibleIndices)).toEqual(Array<number>(65).fill(0xffffffff));
    expect(pack.cameraUniform[15]).toBe(1);
    expect(pack.frameDispatch).toEqual({
      resetEntryPoint: "reset_crowd_indirect", resetWorkgroupCount: 2,
      cullEntryPoint: "cull_and_build_indirect", cullWorkgroupCount: 2,
    });
    // GPU readback 없이 CPU 버퍼의 재초기화 계약만 검증한다.
    pack.indirectArgs[1] = 65;
    pack.visibleIndices.fill(7);
    resetCrowdIndirectFrame(pack);
    expect(pack.indirectArgs[1]).toBe(0);
    expect(pack.visibleIndices.every((index) => index === 0xffffffff)).toBe(true);
    const result = encodeCrowdDrawIndexedIndirect(null, null, pack);
    expect(result.instanceCount).toBeNull();
    expect(result.executedOnGpu).toBe(false);
    expect(CROWD_INSTANCING_WGSL).toContain("atomicStore(&indirectArgs.instanceCount");
    expect(CROWD_INSTANCING_WGSL).toContain("if (camera.sceneMeta.w < 0.5) { return; }");
  });

  it("빈 버퍼도 counter를 초기화하고 GPU 명령 미인코딩이면 drawCall은 0이다", () => {
    const scene = generateProceduralCrowd({ count: 20 });
    for (const mode of ["unculled", "compute-culled"] as const) {
      const pack = packCrowdInstanceBuffers([], scene.preset, scene.options, mode);
      expect(pack.indirectArgs[1]).toBe(0);
      expect(pack.visibleIndices).toHaveLength(0);
      expect(pack.frameDispatch.resetWorkgroupCount).toBe(1);
      expect(pack.frameDispatch.cullWorkgroupCount).toBe(0);
      expect(encodeCrowdDrawIndexedIndirect(null, null, pack).drawCallCount).toBe(0);
    }
  });

  it("인코딩 오류를 GPU 실행 성공으로 바꾸거나 숨기지 않는다", () => {
    const scene = generateProceduralCrowd({ count: 20 });
    const failure = new Error("encode failed");
    const pass = { drawIndexedIndirect: vi.fn(() => { throw failure; }) };
    expect(() => encodeCrowdDrawIndexedIndirect(pass, {} as GPUBuffer, scene.gpuBuffers)).toThrow(failure);
  });

  it("11. 2D 벡터 SVG 군중 레이어 출력이 유효한 XML 구조·선두께 범위·OKLCH 전용 색상을 유지한다", () => {
    const scene = generateProceduralCrowd({ presetId: "medieval-market", count: 85, seed: 612 });
    const svg = renderCrowdSvgLayer(scene, {
      includePerspectiveGuides: true,
      includeFocalMarker: true,
      includeGazeVectors: true,
    });

    expect(svg.svgMarkup.startsWith("<svg ")).toBe(true);
    expect(svg.svgMarkup.endsWith("</svg>")).toBe(true);
    expect(svg.viewBox).toBe("0 0 960 540");
    expect(svg.agentElementCount).toBe(85);
    expect(svg.pathCount).toBeGreaterThanOrEqual(85);
    expect(svg.byteLength).toBeGreaterThan(5000);
    expect(svg.maxStrokeWidthPx).toBeGreaterThan(svg.minStrokeWidthPx * 2);
    expect(svg.svgMarkup).toContain('data-preset="medieval-market"');
    expect(svg.svgMarkup).toContain('data-layer="crowd-silhouettes"');
    expect(svg.svgMarkup).toContain("oklch(");
    expect(svg.svgMarkup).not.toMatch(RAW_COLOR_REGEX);
  });

  it("12. 오프스크린 RGBA 프리뷰 렌더러가 4채널 버퍼를 채우고 실루엣 픽셀을 정상 래스터화한다", () => {
    const scene = generateProceduralCrowd({ presetId: "fantasy-knights", count: 90, seed: 505 });
    const rgba = renderCrowdRgbaPreview(scene, 160, 90);

    expect(rgba.width).toBe(160);
    expect(rgba.height).toBe(90);
    expect(rgba.data).toBeInstanceOf(Uint8ClampedArray);
    expect(rgba.data.length).toBe(160 * 90 * 4);
    expect(rgba.renderedAgentCount).toBe(90);
    expect(rgba.nonBackgroundPixelCount).toBeGreaterThan(300);
    // 모든 픽셀 불투명 알파(255) 확인
    expect(rgba.data[3]).toBe(255);
    expect(rgba.data[rgba.data.length - 1]).toBe(255);
  });

  it("13. renderCrowdPreviewCanvas가 타입 안전 Canvas 목(GPUCanvasContext 캐스팅)으로 프리뷰를 그린다", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const mockCtx = createMockCanvas2dContext();
    vi.spyOn(canvas, "getContext").mockReturnValue(mockCtx as unknown as GPUCanvasContext);

    const scene = generateProceduralCrowd({ presetId: "school-hallway", count: 60, seed: 71 });
    const rendered = renderCrowdPreviewCanvas(canvas, scene, {
      showPerspectiveGuides: true,
      showGazeVectors: true,
      showFocalReticle: true,
    });

    expect(rendered).toBe(true);
    expect(mockCtx.fillRect).toHaveBeenCalled();
    expect(mockCtx.arc).toHaveBeenCalled();
    expect(mockCtx.ellipse).toHaveBeenCalled();
    expect(mockCtx.stroke).toHaveBeenCalled();
    expect(mockCtx.fillText).toHaveBeenCalled();
  });
});

describe("Wave 38D — StudioWebgpuCrowdDirectorPanel 상호작용 및 위생 계약", () => {
  it("14. props 없이 단독 렌더링되고 8종 프리셋·드로우콜/SVG 지표·WGSL 인스펙터를 표시한다", () => {
    mockCanvas2dPreview();

    render(createElement(StudioWebgpuCrowdDirectorPanel));

    expect(screen.getByTestId("studio-webgpu-crowd-director-panel")).toBeTruthy();
    expect(screen.getByTestId("crowd-overlap-badge").textContent).toContain("겹침 0건");
    expect(screen.getByTestId("crowd-drawcall-badge").textContent).toContain("드로우콜 1회");
    expect(screen.getByTestId("crowd-drawcall-badge").textContent).toContain("실측 아님");
    expect(screen.getByText(/CPU로 배치하고 Canvas 2D로 그립니다/)).toBeTruthy();
    expect(screen.getByTestId("crowd-generation-timing").textContent).toContain("CPU 배치");
    expect(screen.getByTestId("crowd-metric-svg").textContent).toContain("KB");
    expect(screen.getByTestId("crowd-metric-gpu-buffer").textContent).toContain("KB");

    for (const presetId of EXPECTED_PRESET_IDS) {
      expect(screen.getByTestId(`crowd-preset-${presetId}`)).toBeTruthy();
    }

    fireEvent.click(screen.getByTestId("toggle-crowd-inspector"));
    const inspectorText = screen.getByTestId("crowd-wgsl-inspector").textContent ?? "";
    expect(inspectorText).toContain("GPU 컴파일·실행 미검증");
    expect(inspectorText).toContain("reset_crowd_indirect");
    expect(inspectorText).toContain("cull_and_build_indirect");
    expect(inspectorText).toContain("vs_crowd_instanced");
    expect(inspectorText).toContain("DrawIndexedIndirectArgs");
  });

  it("15. 프리셋 전환·슬라이더 조절·캔버스 포컬 클릭·시드 재배치·초기화가 실시간 반영된다", () => {
    mockCanvas2dPreview();
    const onSceneChange = vi.fn();

    render(createElement(StudioWebgpuCrowdDirectorPanel, { onSceneChange }));

    fireEvent.click(screen.getByTestId("crowd-preset-fantasy-knights"));
    expect(screen.getByTestId("crowd-active-preset-desc").textContent).toContain(
      "판타지 기사단 행군",
    );

    fireEvent.change(screen.getByTestId("slider-crowd-count"), { target: { value: "420" } });
    fireEvent.change(screen.getByTestId("slider-horizon-ratio"), { target: { value: "28" } });
    fireEvent.change(screen.getByTestId("slider-focal-x"), { target: { value: "25" } });
    fireEvent.change(screen.getByTestId("slider-focal-y"), { target: { value: "74" } });
    fireEvent.change(screen.getByTestId("slider-stroke-attenuation"), { target: { value: "96" } });
    fireEvent.change(screen.getByTestId("slider-focal-attention"), { target: { value: "90" } });

    expect(screen.getByTestId("crowd-generation-timing").textContent).toContain("420명");

    const canvas = screen.getByTestId("crowd-preview-canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 640,
      bottom: 360,
      width: 640,
      height: 360,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(canvas, { clientX: 512, clientY: 216 });
    expect((screen.getByTestId("slider-focal-x") as HTMLInputElement).value).toBe("80");
    expect((screen.getByTestId("slider-focal-y") as HTMLInputElement).value).toBe("60");

    fireEvent.click(screen.getByTestId("crowd-toggle-guides"));
    fireEvent.click(screen.getByTestId("crowd-toggle-gaze"));
    fireEvent.click(screen.getByTestId("crowd-reseed-btn"));
    fireEvent.click(screen.getByTestId("crowd-copy-svg-btn"));
    expect(onSceneChange).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("crowd-reset-btn"));
    expect(screen.getByTestId("crowd-active-preset-desc").textContent).toContain(
      "도심 횡단보도 출근길",
    );
    expect((screen.getByTestId("slider-crowd-count") as HTMLInputElement).value).toBe("180");
  });

  it("16. 모듈 전역 위생 계약: 전 파일 <= 800줄, 원시 hex/rgb/hsl·Web Storage·transition-all·Sparkles·private store Map·BigInt 리터럴 0건", () => {
    const dir = path.dirname(new URL(import.meta.url).pathname);
    const sourceFiles = fs
      .readdirSync(dir)
      .filter((name) => /\.(ts|tsx)$/u.test(name) && !name.includes(".test."));
    expect(sourceFiles.length).toBeGreaterThanOrEqual(4);

    for (const file of sourceFiles) {
      const content = fs.readFileSync(path.join(dir, file), "utf8");
      const lineCount = content.split("\n").length;
      expect(lineCount, `${file} 줄 수 초과`).toBeLessThanOrEqual(800);
      expect(content, `${file} 원시 색상 검출`).not.toMatch(RAW_COLOR_REGEX);
      expect(content, `${file} Web Storage 검출`).not.toMatch(FORBIDDEN_STORAGE_REGEX);
      expect(content, `${file} transition-all 검출`).not.toMatch(FORBIDDEN_TRANSITION_ALL_REGEX);
      expect(content, `${file} Sparkles 검출`).not.toMatch(FORBIDDEN_SPARKLES_REGEX);
      expect(content, `${file} private store Map 검출`).not.toMatch(
        FORBIDDEN_PRIVATE_STORE_MAP_REGEX,
      );
      expect(content, `${file} BigInt 리터럴 검출`).not.toMatch(FORBIDDEN_BIGINT_LITERAL_REGEX);
    }
  });
});
