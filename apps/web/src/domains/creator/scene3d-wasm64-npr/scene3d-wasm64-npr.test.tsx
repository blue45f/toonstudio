// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Studio3dWasm64LookdevPanel, type Studio3dWasm64LookdevSnapshot } from "./Studio3dWasm64LookdevPanel";
import {
  DEFAULT_DEMO_3D_CAMERA,
  SCENE3D_DEFAULT_VRAM_BUDGET_MIB,
  SCENE3D_LOD_TRIANGLE_RATIOS,
  SCENE3D_VERTEX_STRIDE_FLOATS,
  SCENE3D_WASM_PAGE_BYTES,
  Scene3dWasm64MemoryPool,
  buildScene3dBvh,
  createDemoWebtoonCityScene,
  cullFrustumAndSelectLod,
  planGpuInstancedBatches,
  planProgressive3dAssetStream,
  raycastScene3dBvh,
  type Scene3dObject,
} from "./wasm64-3d-bvh-lod-instancing";
import {
  DEFAULT_NPR_OUTLINE_CONFIG,
  DEFAULT_SSAO_DOF_CONFIG,
  TIME_OF_DAY_GRADING_PRESETS,
  WGSL_COLOR_GRADING_3DLUT_SHADER,
  WGSL_GTAO_SSAO_DOF_SHADER,
  WGSL_WEBTOON_NPR_OUTLINE_SHADER,
  applyColorGrading3dLutPass,
  buildColorGrading3dLut,
  createDemo2dCutReferenceBuffer,
  createDemoScene3dGBuffer,
  match3dBackgroundTo2dCutPalette,
  renderGtaoSsaoDofPass,
  renderWebtoonNprOutlinePass,
  runFullWebgpuNprPipeline,
  validateWgslShaderSource,
} from "./webgpu-npr-ssao-colorgrading";

afterEach(cleanup);

function createHostWithoutMemory64(): typeof WebAssembly {
  return {
    ...WebAssembly,
    Module: WebAssembly.Module,
    Instance: WebAssembly.Instance,
    Memory: WebAssembly.Memory,
    validate(bytes: BufferSource): boolean {
      const view = ArrayBuffer.isView(bytes)
        ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        : new Uint8Array(bytes);
      // memory64 limits flag(0x05)는 미지원으로 거부
      if (view[11] === 0x05) return false;
      return WebAssembly.validate(bytes);
    },
  } as typeof WebAssembly;
}

describe("3D Wasm64(memory64) 선형 메모리 풀 실구동 및 Wasm32 자동 폴백", () => {
  it("Node 24 런타임에서 실제 WebAssembly.Memory({ address: 'i64' })로 대용량 정점·AABB·인스턴스 버퍼를 확장·판독·0-GC 재사용한다", () => {
    const pool = new Scene3dWasm64MemoryPool({ initialPages: 2 });
    const initial = pool.getTelemetry();

    expect(initial.addressMode).toBe("i64");
    expect(initial.isMemory64).toBe(true);
    expect(initial.fallbackReason).toBeNull();
    expect(initial.committedBytes).toBe(2 * SCENE3D_WASM_PAGE_BYTES);

    // 100,000 정점(3.2 MiB = 33,333+ 삼각형 청크) 기록으로 실제 bigint memory.grow() 유발
    const vertexCount = 100_000;
    const verts = new Float32Array(vertexCount * SCENE3D_VERTEX_STRIDE_FLOATS);
    verts[0] = 12.5;
    verts[1] = -3.25;
    verts[2] = 44.0;
    const lastBase = (vertexCount - 1) * SCENE3D_VERTEX_STRIDE_FLOATS;
    verts[lastBase] = -99.5;
    verts[lastBase + 7] = 0.875;

    const vHandle = pool.writeVertices(verts);
    const scene = createDemoWebtoonCityScene(1000);
    const aHandle = pool.writeObjectAabbs(scene);
    const afterAlloc = pool.getTelemetry();

    expect(afterAlloc.growCount).toBeGreaterThanOrEqual(1);
    expect(afterAlloc.bufferGeneration).toBe(afterAlloc.growCount);
    expect(afterAlloc.storedVertexCount).toBe(vertexCount);
    expect(afterAlloc.storedAabbCount).toBe(1000);
    expect(afterAlloc.committedBytes).toBeGreaterThanOrEqual(vHandle.byteLength + aHandle.byteLength);

    const readVerts = pool.readFloat32View(vHandle);
    expect(readVerts[0]).toBeCloseTo(12.5, 4);
    expect(readVerts[1]).toBeCloseTo(-3.25, 4);
    expect(readVerts[lastBase]).toBeCloseTo(-99.5, 4);
    expect(readVerts[lastBase + 7]).toBeCloseTo(0.875, 4);

    // resetArena() 후 동일 용량 재기록 시 추가 grow 0회 (0-GC 프레임 재사용)
    const committedBeforeReset = afterAlloc.committedBytes;
    const growBeforeReset = afterAlloc.growCount;
    pool.resetArena();
    pool.writeVertices(verts);
    const afterReuse = pool.getTelemetry();

    expect(afterReuse.zeroGcResetCount).toBe(1);
    expect(afterReuse.growCount).toBe(growBeforeReset);
    expect(afterReuse.committedBytes).toBe(committedBeforeReset);
  });

  it("memory64 미지원 호스트에서는 Wasm32(address: 'i32')로 자동 폴백해 동일한 버퍼 기록·판독 계약을 보장한다", () => {
    const pool = new Scene3dWasm64MemoryPool({
      initialPages: 2,
      webAssembly: createHostWithoutMemory64(),
    });
    const t0 = pool.getTelemetry();
    expect(t0.addressMode).toBe("i32");
    expect(t0.isMemory64).toBe(false);
    expect(t0.fallbackReason).toBe("memory64-unsupported");

    const scene = createDemoWebtoonCityScene(250);
    const handle = pool.writeObjectAabbs(scene);
    const readBack = pool.readFloat32View(handle);
    expect(readBack[0]).toBeCloseTo(scene[0]?.aabb.minX ?? 0, 4);
    expect(readBack[5]).toBeCloseTo(scene[0]?.aabb.maxZ ?? 0, 4);
    expect(pool.getTelemetry().storedAabbCount).toBe(250);
  });
});

describe("1,000개 반복 3D 오브젝트 SAH BVH · 프러스텀 컬링 · 4단계 Auto-LOD · GPU Instancing · KTX2/Meshopt 스트리밍", () => {
  it("SAH BVH가 1,000개 오브젝트의 광선 교차를 전수 탐색과 동일하게 찾고 80%+ 노드를 프루닝한다", () => {
    const scene = createDemoWebtoonCityScene(1000);
    const bvh = buildScene3dBvh(scene);

    expect(bvh.nodeCount).toBeGreaterThan(200);
    expect(bvh.leafCount).toBeGreaterThan(100);
    expect(bvh.maxDepth).toBeLessThanOrEqual(28);
    expect(bvh.sahCost).toBeGreaterThan(0);

    // 근경 오브젝트 중앙을 향하는 광선 발사 → BVH vs 브루트포스 최근접 일치 검증
    const targetObj = scene.find((obj) => obj.center.z < -6 && obj.center.z > -20);
    expect(targetObj).toBeDefined();
    if (!targetObj) return;

    const origin = { x: 0, y: 2.2, z: 0 };
    const dir = {
      x: targetObj.center.x - origin.x,
      y: targetObj.center.y - origin.y,
      z: targetObj.center.z - origin.z,
    };

    const rayRes = raycastScene3dBvh(bvh, origin, dir, 500);
    expect(rayRes.hit).not.toBeNull();
    expect(rayRes.prunedRatio01).toBeGreaterThanOrEqual(0.8);
    expect(rayRes.testedObjects).toBeLessThan(scene.length * 0.2);

    // 브루트포스 최근접 검증
    const len = Math.hypot(dir.x, dir.y, dir.z);
    const dx = dir.x / len; const dy = dir.y / len; const dz = dir.z / len;
    let bruteDist = 500;
    let bruteId: string | null = null;
    for (const obj of scene) {
      const tx1 = (obj.aabb.minX - origin.x) / (dx || 1e-12);
      const tx2 = (obj.aabb.maxX - origin.x) / (dx || 1e-12);
      const ty1 = (obj.aabb.minY - origin.y) / (dy || 1e-12);
      const ty2 = (obj.aabb.maxY - origin.y) / (dy || 1e-12);
      const tz1 = (obj.aabb.minZ - origin.z) / (dz || 1e-12);
      const tz2 = (obj.aabb.maxZ - origin.z) / (dz || 1e-12);
      const tMin = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2), Math.min(tz1, tz2));
      const tMax = Math.min(Math.max(tx1, tx2), Math.max(ty1, ty2), Math.max(tz1, tz2));
      const t = tMax >= Math.max(0, tMin) && tMin <= bruteDist ? (tMin >= 0 ? tMin : tMax) : Infinity;
      if (t < bruteDist) { bruteDist = t; bruteId = obj.id; }
    }
    expect(rayRes.hit?.objectId).toBe(bruteId);
    expect(rayRes.hit?.distance ?? 0).toBeCloseTo(bruteDist, 3);
  });

  it("프러스텀 컬링·4단계 Auto-LOD·GPU Instancing으로 1,000개 소품을 드로우콜 <= 12개(95%+ 절감)로 압축하고 Wasm64 풀에 업로드한다", () => {
    const scene = createDemoWebtoonCityScene(1000);
    const bvh = buildScene3dBvh(scene);
    const pool = new Scene3dWasm64MemoryPool({ initialPages: 2 });

    const selBalanced = cullFrustumAndSelectLod(bvh, DEFAULT_DEMO_3D_CAMERA, 0.5);
    const selQuality = cullFrustumAndSelectLod(bvh, DEFAULT_DEMO_3D_CAMERA, 0.05);
    const selAggressive = cullFrustumAndSelectLod(bvh, DEFAULT_DEMO_3D_CAMERA, 0.95);

    expect(SCENE3D_LOD_TRIANGLE_RATIOS).toEqual([1.0, 0.5, 0.22, 0.06]);
    expect(selBalanced.culledCount).toBeGreaterThan(200);
    expect(selBalanced.bvhSubtreesPruned).toBeGreaterThan(0);
    expect(selBalanced.visibleCount + selBalanced.culledCount).toBe(1000);
    // 4단계 LOD 모두 실제 사용 확인
    expect(selBalanced.lodCounts[0]).toBeGreaterThan(0);
    expect(selBalanced.lodCounts[1]).toBeGreaterThan(0);
    expect(selBalanced.lodCounts[2]).toBeGreaterThan(0);
    expect(selBalanced.lodCounts[3]).toBeGreaterThan(0);
    // Auto-LOD 공격도가 높을수록 유효 삼각형 수가 단조 감소
    expect(selAggressive.effectiveLodTriangles).toBeLessThan(selBalanced.effectiveLodTriangles);
    expect(selBalanced.effectiveLodTriangles).toBeLessThan(selQuality.effectiveLodTriangles);
    expect(selBalanced.triangleReductionRatio01).toBeGreaterThan(0.5);

    // GPU Instancing 배칭: 드로우콜 <= 12 & 절감률 >= 95%
    const instancing = planGpuInstancedBatches(selBalanced, { memoryPool: pool, maxDrawCalls: 12 });
    expect(instancing.instancedDrawCalls).toBeGreaterThan(0);
    expect(instancing.instancedDrawCalls).toBeLessThanOrEqual(12);
    expect(instancing.drawCallReductionVsTotal01).toBeGreaterThanOrEqual(0.95);
    expect(instancing.drawCallReductionVsVisible01).toBeGreaterThanOrEqual(0.95);
    expect(instancing.uploadedInstanceBytes).toBe(selBalanced.visibleCount * 64);

    const poolTel = pool.getTelemetry();
    expect(poolTel.isMemory64).toBe(true);
    expect(poolTel.storedInstanceCount).toBe(selBalanced.visibleCount);
    expect(instancing.batches[0]?.wasm64Handle).not.toBeNull();

    // KTX2/BasisU · Meshopt 스트리밍 + VRAM 256 MiB 및 타이트 예산(3 MiB) 거버너 검증
    const stream256 = planProgressive3dAssetStream(selBalanced, SCENE3D_DEFAULT_VRAM_BUDGET_MIB);
    expect(stream256.budgetRespected).toBe(true);
    expect(stream256.allocatedVramBytes).toBeLessThanOrEqual(256 * 1024 * 1024);
    expect(stream256.ktx2MeshoptSavingsRatio01).toBeGreaterThan(0.6);
    expect(stream256.entries[0]?.priorityScore ?? 0).toBeGreaterThanOrEqual(stream256.entries.at(-1)?.priorityScore ?? 0);

    const streamTight = planProgressive3dAssetStream(selBalanced, 3);
    expect(streamTight.budgetRespected).toBe(true);
    expect(streamTight.allocatedVramBytes).toBeLessThanOrEqual(3 * 1024 * 1024);
    expect(streamTight.downgradedCount).toBeGreaterThan(0);

    // 고유 에셋 20개(maxDrawCalls=12 초과) 시 원거리 LOD3 Impostor Atlas 자동 통합 검증
    const manyUnique: Scene3dObject[] = Array.from({ length: 20 }, (_, i) => ({
      id: `unique-${i}`, assetId: `asset-${i}`, materialId: "mat-base",
      aabb: { minX: -1 + (i - 10) * 2, minY: 0, minZ: -170 - i * 2, maxX: 1 + (i - 10) * 2, maxY: 2, maxZ: -168 - i * 2 },
      center: { x: (i - 10) * 2, y: 1, z: -169 - i * 2 }, boundingRadius: 1.5,
      baseTriangleCount: 1000, textureBytesLod0: 4 * 1024 * 1024, ktx2Bytes: 512 * 1024, meshoptBytes: 128 * 1024,
    }));
    const manyPlan = planGpuInstancedBatches(cullFrustumAndSelectLod(buildScene3dBvh(manyUnique), DEFAULT_DEMO_3D_CAMERA, 0.8), { maxDrawCalls: 12 });
    expect(manyPlan.batches.some((b) => b.isImpostorAtlas)).toBe(true);
    expect(manyPlan.instancedDrawCalls).toBeLessThanOrEqual(12);
  });
});

describe("3종 WGSL 셰이더 구문 검증 · NPR 가변 윤곽선 · GTAO/SSAO · CoC DoF · 3D LUT · 2D↔3D 색감 자동 매칭", () => {
  it("3종 WebGPU WGSL 셰이더 구문이 모두 유효하며 비표준 GLSL 토큰은 검증기가 차단한다", () => {
    const reports = [
      validateWgslShaderSource("npr-outline", WGSL_WEBTOON_NPR_OUTLINE_SHADER),
      validateWgslShaderSource("gtao-ssao-dof", WGSL_GTAO_SSAO_DOF_SHADER),
      validateWgslShaderSource("color-grading-3dlut", WGSL_COLOR_GRADING_3DLUT_SHADER),
    ];
    for (const r of reports) {
      expect(r.valid).toBe(true);
      expect(r.errors).toEqual([]);
      expect(r.entryPoints).toHaveLength(1);
      expect(r.bindingCount).toBeGreaterThanOrEqual(5);
      expect(r.structCount).toBeGreaterThanOrEqual(1);
    }
    const bad = validateWgslShaderSource("broken-glsl", "void main() { gl_FragColor = float4(1.0); }");
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  it("깊이·법선 가변 윤곽선, 하프톤 스크린톤, SSAO 접촉 그림자, CoC DoF·블룸이 실제 픽셀 버퍼에서 동작한다", () => {
    const gb = createDemoScene3dGBuffer(64, 64);

    // 패스 1: 근경 실루엣 굵기 > 원경 실루엣 굵기 · 주름선 검출 · 하프톤 변조
    const nprWithHt = renderWebtoonNprOutlinePass(gb, DEFAULT_NPR_OUTLINE_CONFIG);
    const nprNoHt = renderWebtoonNprOutlinePass(gb, { ...DEFAULT_NPR_OUTLINE_CONFIG, halftoneStrength: 0 });
    expect(nprWithHt.silhouettePixelCount).toBeGreaterThan(80);
    expect(nprWithHt.creasePixelCount).toBeGreaterThan(10);
    expect(nprWithHt.halftoneShadowPixels).toBeGreaterThan(15);
    expect(nprWithHt.avgForegroundInkWidthPx).toBeGreaterThan(nprWithHt.avgBackgroundInkWidthPx);

    let htDiffPixels = 0;
    for (let i = 0; i < nprWithHt.rgba.length; i += 4) {
      if (nprWithHt.rgba[i] !== nprNoHt.rgba[i]) htDiffPixels += 1;
    }
    expect(htDiffPixels).toBeGreaterThan(10);

    // 패스 2: SSAO 접촉 그림자 · 피사계 심도(CoC) · 하이라이트 블룸
    const postOn = renderGtaoSsaoDofPass(nprWithHt.rgba, gb, DEFAULT_SSAO_DOF_CONFIG);
    const postNoSsao = renderGtaoSsaoDofPass(nprWithHt.rgba, gb, { ...DEFAULT_SSAO_DOF_CONFIG, ssaoStrength: 0, dofAperture: 0, bloomStrength: 0 });
    expect(postOn.contactShadowPixels).toBeGreaterThan(40);
    expect(postOn.meanOcclusion01).toBeGreaterThan(0.01);
    expect(postOn.outOfFocusPixels).toBeGreaterThan(200);
    expect(postOn.bloomedPixels).toBeGreaterThan(20);

    // 초점면(중경 기둥 depth ≈ 0.42) CoC ≈ 0 vs 근경/원경 CoC > 0
    const focusIdx = Math.floor(64 * 0.45) * 64 + Math.floor(64 * 0.48);
    const skyIdx = Math.floor(64 * 0.08) * 64 + Math.floor(64 * 0.50);
    expect(postOn.cocBuffer[focusIdx] ?? 1).toBeLessThan(0.2);
    expect(postOn.cocBuffer[skyIdx] ?? 0).toBeGreaterThan(0.5);

    // SSAO 접촉 코너는 SSAO 꺼짐 대비 더 어두워짐
    let darkenedCount = 0;
    for (let i = 0; i < postOn.aoBuffer.length; i += 1) {
      if ((postOn.aoBuffer[i] ?? 1) < 0.9 && (postOn.rgba[i * 4] ?? 255) < (postNoSsao.rgba[i * 4] ?? 0)) {
        darkenedCount += 1;
      }
    }
    expect(darkenedCount).toBeGreaterThan(20);
  });

  it("4종 시간대 3D LUT 컬러 그레이딩과 2D↔3D 컷 팔레트 자동 매칭이 색차를 대폭 축소한다", () => {
    const gb = createDemoScene3dGBuffer(48, 48);
    const baseNpr = renderWebtoonNprOutlinePass(gb, DEFAULT_NPR_OUTLINE_CONFIG).rgba;

    const day = applyColorGrading3dLutPass(baseNpr, 48, 48, TIME_OF_DAY_GRADING_PRESETS.daylight, buildColorGrading3dLut(TIME_OF_DAY_GRADING_PRESETS.daylight, 9));
    const sunset = applyColorGrading3dLutPass(baseNpr, 48, 48, TIME_OF_DAY_GRADING_PRESETS.sunset);
    const night = applyColorGrading3dLutPass(baseNpr, 48, 48, TIME_OF_DAY_GRADING_PRESETS.night);
    const indoor = applyColorGrading3dLutPass(baseNpr, 48, 48, TIME_OF_DAY_GRADING_PRESETS["indoor-fluorescent"]);

    // 노을은 따뜻한 적색 우세, 밤은 청색 우세·저휘도, 실내 형광등은 녹색 기미
    expect(sunset.avgRgb01[0] - sunset.avgRgb01[2]).toBeGreaterThan(day.avgRgb01[0] - day.avgRgb01[2]);
    expect(night.avgLuminance01).toBeLessThan(day.avgLuminance01);
    expect(night.avgRgb01[2]).toBeGreaterThan(night.avgRgb01[0]);
    expect(indoor.avgRgb01[1]).toBeGreaterThan(indoor.avgRgb01[0]);
    expect(day.lutSize).toBe(9);

    // 주광 3D 배경을 노을 2D 컷 팔레트에 자동 매칭 → ΔE 70%+ 축소 검증
    const sunsetCut2d = createDemo2dCutReferenceBuffer(48, 48, "sunset");
    const matched = match3dBackgroundTo2dCutPalette(day.rgba, sunsetCut2d, 48, 48, 1.0);
    expect(matched.deltaEBefore).toBeGreaterThan(15);
    expect(matched.deltaEAfter).toBeLessThan(matched.deltaEBefore * 0.25);
    expect(matched.colorGapReductionRatio01).toBeGreaterThanOrEqual(0.75);

    const full = runFullWebgpuNprPipeline(gb, {
      npr: DEFAULT_NPR_OUTLINE_CONFIG,
      ssaoDof: DEFAULT_SSAO_DOF_CONFIG,
      grading: TIME_OF_DAY_GRADING_PRESETS.daylight,
      match2dCutRgba: sunsetCut2d,
      match2dStrength: 0.95,
    });
    expect(full.paletteMatch?.colorGapReductionRatio01 ?? 0).toBeGreaterThanOrEqual(0.7);
    expect(full.backend.shaderCount).toBe(3);
  });
});

describe("Studio3dWasm64LookdevPanel UI · KO/EN · Calm Atelier 위생 계약", () => {
  it("props 없이 마운트되며 실시간 Wasm64/BVH/드로우콜 텔레메트리와 7대 룩뎁 컨트롤이 상호작용한다", () => {
    const snapshots: Studio3dWasm64LookdevSnapshot[] = [];
    const onLookdevChange = vi.fn((snap: Studio3dWasm64LookdevSnapshot) => { snapshots.push(snap); });

    render(<Studio3dWasm64LookdevPanel onLookdevChange={onLookdevChange} locale="ko" />);

    expect(screen.getByTestId("wasm64-address-mode-badge").textContent).toContain("Wasm64 · i64");
    const dcInitial = Number.parseInt(screen.getByTestId("telemetry-draw-calls").textContent ?? "999", 10);
    expect(dcInitial).toBeLessThanOrEqual(12);
    expect(screen.getByTestId("telemetry-palette-match").textContent).toContain("2D 색차 -");

    // Auto-LOD 공격도를 95%로 올리면 유효 삼각형 수가 줄어든다
    const triBefore = Number.parseInt((screen.getByTestId("telemetry-effective-triangles").textContent ?? "0").replace(/[^0-9]/g, ""), 10);
    fireEvent.change(screen.getByLabelText(/Auto-LOD 공격도/i), { target: { value: "0.95" } });
    const triAfter = Number.parseInt((screen.getByTestId("telemetry-effective-triangles").textContent ?? "0").replace(/[^0-9]/g, ""), 10);
    expect(triAfter).toBeLessThan(triBefore);

    // GPU Instancing OFF 전환 시 개별 드로우콜(수백 개)로 상승
    fireEvent.click(screen.getByRole("button", { name: /GPU Instancing ON/i }));
    const dcNaive = Number.parseInt(screen.getByTestId("telemetry-draw-calls").textContent ?? "0", 10);
    expect(dcNaive).toBeGreaterThan(500);

    // 시간대 프리셋(밤) 및 2D↔3D 매칭 토글
    fireEvent.click(screen.getByRole("radio", { name: "밤" }));
    fireEvent.click(screen.getByRole("button", { name: /2D↔3D 색감 자동 매칭 ON/i }));
    expect(screen.getByTestId("telemetry-palette-match").textContent).toContain("2D 매칭 꺼짐");
    expect(onLookdevChange).toHaveBeenCalled();
    expect(snapshots.at(-1)?.timeOfDay).toBe("night");

    // 영문 로케일 + 무-props 마운트 확인
    cleanup();
    render(<Studio3dWasm64LookdevPanel locale="en" />);
    expect(screen.getByText(/3D Wasm64 Acceleration/i)).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Sunset" })).toBeTruthy();

    cleanup();
    render(<Studio3dWasm64LookdevPanel />);
    expect(screen.getByTestId("studio-3d-wasm64-lookdev-panel")).toBeTruthy();
  });

  it("소유 폴더의 줄 수 상한·배럴 금지·Calm Atelier 시맨틱 토큰 위생 계약을 전수 충족한다", () => {
    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/scene3d-wasm64-npr");
    expect(existsSync(resolve(dir, "index.ts"))).toBe(false);

    const engine1 = readFileSync(resolve(dir, "wasm64-3d-bvh-lod-instancing.ts"), "utf8");
    const engine2 = readFileSync(resolve(dir, "webgpu-npr-ssao-colorgrading.ts"), "utf8");
    const panel = readFileSync(resolve(dir, "Studio3dWasm64LookdevPanel.tsx"), "utf8");

    expect(engine1.split("\n").length).toBeLessThanOrEqual(700);
    expect(engine2.split("\n").length).toBeLessThanOrEqual(700);
    expect(panel.split("\n").length).toBeLessThanOrEqual(460);

    // Calm Atelier 원시 색상·transition-all 0건 및 필수 타이포/줄바꿈 토큰 확인
    expect(panel).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(panel).not.toMatch(/\brgba?\s*\(/i);
    expect(panel).not.toMatch(/\bhsla?\s*\(/i);
    expect(panel).not.toMatch(/\b(?:bg|text|border)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/);
    expect(panel).not.toContain("transition-all");
    expect(panel).toContain("[word-break:keep-all]");
    expect(panel).toContain("tabular-nums");
  });
});
