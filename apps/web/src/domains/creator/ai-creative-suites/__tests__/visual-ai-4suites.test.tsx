// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioWebtoonModelerImageGenPanel } from "../../ai-assist/StudioWebtoonModelerImageGenPanel";
import {
  applyAntiAiScrapingProtection,
  computeShadingAssist,
  createSamplePoseAndHandLandmarks,
  normalizePoseAndHandLandmarks,
  runSmartSuperResolution,
  type CspRgbaBuffer,
} from "../csp-ai-smart-assist-engine";
import {
  applyGenerativeExpand,
  applyGenerativeFillOrEditObject,
  applyOklabStyleTransfer,
  applySphericalRelight,
  computeOklabStats,
  createC2paContentCredentials,
  createDefaultFireflyGraph,
  executeFireflyGraph,
  oklabToRgb,
  rgbToOklab,
  validateAndSortFireflyGraph,
  verifyC2paContentCredentials,
  type FireflyGraphDocument,
  type FireflyRgbaBuffer,
} from "../firefly-graph-relight-engine";
import {
  addComfyNode,
  buildMultiControlNetStack,
  composeRegionalPromptAttentionMap,
  connectComfyEdge,
  CONTROLNET_PREPROCESSOR_MAP,
  createDefaultKritaComfyWorkflow,
  createLivePaintingState,
  disconnectComfyEdge,
  exportComfyUiPromptGraph,
  flushLivePaintingPatch,
  importComfyUiPromptGraph,
  markCanvasDirtyRect,
  removeComfyNode,
  simulateComfyGraphOffline,
  updateComfyNodeWidget,
  updateLivePaintingStrength,
  validateComfyGraph,
  type ControlNetStackItem,
} from "../krita-comfy-live-canvas-engine";
import {
  createBeforeAfterComparisonState,
  createDemoWebtoonLineart,
  runNaverStyleLineartColorize,
  setComparisonSplitPercent,
  stepComparisonSplit,
  toggleComparisonOrientation,
  WEBTOON_COLOR_STYLE_PRESETS,
  type PainterRgbaBuffer,
} from "../naver-ai-painter-engine";
import { StudioVisualAi4SuitesPanel } from "../StudioVisualAi4SuitesPanel";

afterEach(cleanup);

function makeSolidBuffer(width: number, height: number, rgb: readonly [number, number, number]): FireflyRgbaBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function makeClosedBoxLineart(width: number, height: number, margin: number): CspRgbaBuffer {
  const buf = makeSolidBuffer(width, height, [250, 250, 250]);
  for (let y = margin; y < height - margin; y += 1) {
    for (let x = margin; x < width - margin; x += 1) {
      const onEdge = x === margin || x === width - margin - 1 || y === margin || y === height - margin - 1;
      if (onEdge) {
        const o = (y * width + x) * 4;
        buf.data[o] = 16;
        buf.data[o + 1] = 16;
        buf.data[o + 2] = 18;
      }
    }
  }
  return buf;
}

function makeSplitWallLineart(width: number, height: number): PainterRgbaBuffer {
  const buf = makeClosedBoxLineart(width, height, 2);
  const midX = Math.floor(width / 2);
  for (let y = 2; y < height - 2; y += 1) {
    const o = (y * width + midX) * 4;
    buf.data[o] = 12;
    buf.data[o + 1] = 12;
    buf.data[o + 2] = 14;
  }
  return buf;
}

function avgRegionLuma(buf: FireflyRgbaBuffer, x0: number, x1: number): number {
  let sum = 0;
  let count = 0;
  for (let y = 0; y < buf.height; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const o = (y * buf.width + x) * 4;
      sum += 0.299 * buf.data[o] + 0.587 * buf.data[o + 1] + 0.114 * buf.data[o + 2];
      count += 1;
    }
  }
  return sum / Math.max(1, count);
}

describe("Firefly Graph · Relight · Style Transfer · C2PA 엔진", () => {
  it("기본 7노드 Firefly DAG를 위상 순서대로 정렬한다", () => {
    const graph = createDefaultFireflyGraph();
    const sorted = validateAndSortFireflyGraph(graph);
    expect(sorted.valid).toBe(true);
    expect(sorted.order).toHaveLength(7);
    expect(sorted.order[0]).toBe("node-prompt");
    expect(sorted.order[sorted.order.length - 1]).toBe("node-output");
  });

  it("순환 참조와 Output 누락 그래프를 정확히 탐지한다", () => {
    const base = createDefaultFireflyGraph();
    const cyclic: FireflyGraphDocument = {
      ...base,
      nodes: base.nodes.filter((n) => n.kind !== "Output"),
      edges: [
        ...base.edges.filter((e) => e.toNodeId !== "node-output"),
        { id: "cycle", fromNodeId: "node-relight", toNodeId: "node-prompt", port: "image" },
      ],
    };
    const res = validateAndSortFireflyGraph(cyclic);
    expect(res.valid).toBe(false);
    expect(res.cycleNodeIds.length).toBeGreaterThanOrEqual(2);
    expect(res.errors.some((msg) => msg.includes("순환"))).toBe(true);
    expect(res.errors.some((msg) => msg.includes("Output"))).toBe(true);
  });

  it("Generative Expand가 캔버스를 확장하고 원본 내부 픽셀을 무손실 보존한다", () => {
    const src = makeSolidBuffer(12, 10, [180, 140, 110]);
    src.data[(5 * 12 + 6) * 4] = 240;
    const expanded = applyGenerativeExpand(src, { top: 3, right: 4, bottom: 5, left: 2 }, 3);
    expect(expanded.width).toBe(18);
    expect(expanded.height).toBe(18);
    // 원본 좌표 (6,5) -> 확장 좌표 (8,8)
    expect(expanded.data[(8 * 18 + 8) * 4]).toBe(240);
    // 확장 외곽 영역이 비어있지 않고 불투명하게 채워짐
    expect(expanded.data[3]).toBe(255);
  });

  it("Generative Remove가 마스크 내부 이물질을 주변 색으로 자연 복원하고 Recolor가 색조를 이동한다", () => {
    const src = makeSolidBuffer(16, 16, [200, 200, 200]);
    const mask = new Uint8Array(16 * 16);
    for (let y = 6; y < 10; y += 1) {
      for (let x = 6; x < 10; x += 1) {
        const o = (y * 16 + x) * 4;
        src.data[o] = 20;
        src.data[o + 1] = 20;
        src.data[o + 2] = 20;
        mask[y * 16 + x] = 255;
      }
    }
    const removed = applyGenerativeFillOrEditObject(src, mask, "remove", { iterations: 40 });
    const centerIdx = (8 * 16 + 8) * 4;
    expect(removed.data[centerIdx]).toBeGreaterThan(150);

    const baseWarm = makeSolidBuffer(16, 16, [190, 160, 150]);
    const recolored = applyGenerativeFillOrEditObject(baseWarm, mask, "recolor", {
      targetRgb: [60, 120, 235],
    });
    expect(recolored.data[centerIdx + 2]).toBeGreaterThan(recolored.data[centerIdx]);
  });

  it("Spherical Relight 방위각 반전 시 좌우 명암 분포가 물리적으로 뒤집힌다", () => {
    const src = makeSolidBuffer(24, 24, [150, 150, 150]);
    const rightLit = applySphericalRelight(src, {
      azimuthDeg: 0,
      elevationDeg: 25,
      intensity: 1.3,
      ambient: 0.25,
      lightRgb: [255, 255, 255],
      rimStrength: 0.2,
      depthRelief: 1.0,
    });
    const leftLit = applySphericalRelight(src, {
      azimuthDeg: 180,
      elevationDeg: 25,
      intensity: 1.3,
      ambient: 0.25,
      lightRgb: [255, 255, 255],
      rimStrength: 0.2,
      depthRelief: 1.0,
    });
    expect(avgRegionLuma(rightLit, 12, 24)).toBeGreaterThan(avgRegionLuma(rightLit, 0, 12));
    expect(avgRegionLuma(leftLit, 0, 12)).toBeGreaterThan(avgRegionLuma(leftLit, 12, 24));
  });

  it("OKLab 변환 왕복 오차가 2 이하이며 Style Transfer가 참조 색감 평균으로 이동시킨다", () => {
    const lab = rgbToOklab(212, 134, 96);
    const back = oklabToRgb(lab.L, lab.a, lab.b);
    expect(Math.abs(back[0] - 212)).toBeLessThanOrEqual(2);
    expect(Math.abs(back[1] - 134)).toBeLessThanOrEqual(2);
    expect(Math.abs(back[2] - 96)).toBeLessThanOrEqual(2);

    const coolSrc = makeSolidBuffer(16, 16, [95, 130, 195]);
    const warmRef = makeSolidBuffer(16, 16, [235, 165, 110]);
    const transferred = applyOklabStyleTransfer(coolSrc, warmRef, 0.85);
    const beforeStats = computeOklabStats(coolSrc);
    const afterStats = computeOklabStats(transferred);
    const refStats = computeOklabStats(warmRef);
    expect(Math.abs(afterStats.mean.b - refStats.mean.b)).toBeLessThan(
      Math.abs(beforeStats.mean.b - refStats.mean.b),
    );
  });

  it("C2PA 콘텐츠 자격증명이 정상 검증 및 픽셀·서명 변조 탐지를 수행한다", () => {
    const img = makeSolidBuffer(12, 12, [140, 150, 160]);
    const manifest = createC2paContentCredentials({
      image: img,
      rightsBomAssetId: "bom-test-77",
      creatorName: "테스트 작가",
      actions: [],
    });
    expect(verifyC2paContentCredentials(img, manifest).valid).toBe(true);

    const tamperedImg: FireflyRgbaBuffer = {
      width: img.width,
      height: img.height,
      data: new Uint8ClampedArray(img.data),
    };
    tamperedImg.data[0] = 250;
    const pixelCheck = verifyC2paContentCredentials(tamperedImg, manifest);
    expect(pixelCheck.valid).toBe(false);
    expect(pixelCheck.pixelIntegrityOk).toBe(false);

    const forgedManifest = { ...manifest, creatorName: "위조자" };
    const sigCheck = verifyC2paContentCredentials(img, forgedManifest);
    expect(sigCheck.valid).toBe(false);
    expect(sigCheck.signatureIntegrityOk).toBe(false);
  });

  it("executeFireflyGraph가 전체 파이프라인을 실행하고 비활성 노드를 건너뛰며 자격증명을 부착한다", () => {
    const graph = createDefaultFireflyGraph();
    const img = makeSolidBuffer(16, 16, [130, 140, 155]);
    const exec = executeFireflyGraph(graph, img);
    expect(exec.ok).toBe(true);
    expect(exec.trace).toHaveLength(7);
    expect(exec.trace.find((t) => t.kind === "Upscale")?.skipped).toBe(true);
    expect(exec.credentials).not.toBeNull();
    expect(exec.credentials?.zeroPaidApiUsed).toBe(true);
    if (exec.credentials) {
      expect(verifyC2paContentCredentials(exec.image, exec.credentials).valid).toBe(true);
    }
  });
});

describe("클립스튜디오(CSP) AI 스마트 어시스트 엔진", () => {
  it("Smart Super-Resolution이 2x/3x/4x 해상도와 Catmull-Rom/Lanczos3 프리셋을 정확히 산출한다", () => {
    const src = makeSolidBuffer(8, 6, [180, 160, 140]);
    const r2 = runSmartSuperResolution(src, { scale: 2, denoise: true, kernel: "catmull-rom" });
    const r3 = runSmartSuperResolution(src, { scale: 3, denoise: false, kernel: "lanczos3" });
    const r4 = runSmartSuperResolution(src, { scale: 4, denoise: true, kernel: "lanczos3" });
    expect([r2.image.width, r2.image.height, r2.presetCode]).toEqual([16, 12, "x2_denoise"]);
    expect([r3.image.width, r3.image.height, r3.presetCode]).toEqual([24, 18, "x3"]);
    expect([r4.image.width, r4.image.height, r4.presetCode]).toEqual([32, 24, "x4_denoise"]);
  });

  it("Denoise 바이래터럴 필터가 평탄 영역 노이즈 분산을 낮추면서 계단 엣지 대비를 보존한다", () => {
    const noisy = makeSolidBuffer(16, 16, [200, 200, 200]);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const o = (y * 16 + x) * 4;
        const base = x < 8 ? 220 : 40;
        const jitter = (x + y) % 2 === 0 ? 14 : -14;
        const v = Math.min(255, Math.max(0, base + jitter));
        noisy.data[o] = v;
        noisy.data[o + 1] = v;
        noisy.data[o + 2] = v;
      }
    }
    const clean = runSmartSuperResolution(noisy, { scale: 2, denoise: true, denoiseStrength: 0.9, edgeSharpen: 0 });
    const raw = runSmartSuperResolution(noisy, { scale: 2, denoise: false, edgeSharpen: 0 });
    // 좌측 평탄 영역 내부(x=4..10)의 픽셀 편차 감소 검증
    const variance = (buf: CspRgbaBuffer): number => {
      const vals: number[] = [];
      for (let y = 6; y < 24; y += 1) {
        for (let x = 4; x < 11; x += 1) vals.push(buf.data[(y * buf.width + x) * 4]);
      }
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      return vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / vals.length;
    };
    expect(variance(clean.image)).toBeLessThan(variance(raw.image));
    // 좌우 계단 대비는 뚜렷이 유지
    expect(clean.image.data[(16 * 32 + 6) * 4] - clean.image.data[(16 * 32 + 24) * 4]).toBeGreaterThan(120);
  });

  it("Shading Assist가 닫힌 선화 내부 영역만 분리해 2단 셀 음영과 앰비언트를 계산한다", () => {
    const lineart = makeClosedBoxLineart(32, 32, 6);
    const res = computeShadingAssist(lineart, { azimuthDeg: 45, elevationDeg: 40 });
    expect(res.enclosedPixelCount).toBe(18 * 18);
    expect(res.shadowCoverageRatio).toBeGreaterThan(0.1);
    // 외부 배경 픽셀 (0,0)은 음영 알파 0 유지
    expect(res.shadowLayer.data[3]).toBe(0);
  });

  it("Shading Assist 광원 방위각을 180도 회전하면 그림자 분포가 반대쪽으로 이동한다", () => {
    const lineart = makeClosedBoxLineart(32, 32, 5);
    const rightLight = computeShadingAssist(lineart, { azimuthDeg: 0, elevationDeg: 25, ambientStrength: 0 });
    const leftLight = computeShadingAssist(lineart, { azimuthDeg: 180, elevationDeg: 25, ambientStrength: 0 });
    const sumAlpha = (buf: CspRgbaBuffer, x0: number, x1: number): number => {
      let s = 0;
      for (let y = 6; y < 26; y += 1) {
        for (let x = x0; x < x1; x += 1) s += buf.data[(y * buf.width + x) * 4 + 3];
      }
      return s;
    };
    expect(sumAlpha(rightLight.shadowLayer, 6, 16)).toBeGreaterThan(sumAlpha(rightLight.shadowLayer, 16, 26));
    expect(sumAlpha(leftLight.shadowLayer, 16, 26)).toBeGreaterThan(sumAlpha(leftLight.shadowLayer, 6, 16));
  });

  it("Pose / Hand Scanner 브리지가 2D 관절과 손가락 좌표를 3D 휴머노이드 본 회전각으로 정규화한다", () => {
    const sample = createSamplePoseAndHandLandmarks();
    const rig = normalizePoseAndHandLandmarks(sample.pose, sample.hands);
    expect(rig.bones.length).toBe(10);
    expect(rig.fingerCurls.length).toBe(5);
    expect(rig.validJointCount).toBe(16);
    for (const b of rig.bones) {
      expect(Math.abs(b.pitchDeg)).toBeLessThanOrEqual(135);
      expect(Math.abs(b.rollDeg)).toBeLessThanOrEqual(150);
    }
    for (const f of rig.fingerCurls) {
      expect(f.curlDeg).toBeGreaterThanOrEqual(0);
      expect(f.curlDeg).toBeLessThanOrEqual(110);
    }
  });

  it("Anti-AI Scraping Protection이 |ΔRGB| <= 3 및 PSNR > 38 dB 보호 기준을 준수한다", () => {
    const src = makeSolidBuffer(32, 32, [160, 145, 130]);
    const res = applyAntiAiScrapingProtection(src, { maxDelta: 3, seed: 12345 });
    expect(res.maxChannelDelta).toBeLessThanOrEqual(3);
    expect(res.psnrDb).toBeGreaterThan(38);
    expect(res.alteredChannelRatio).toBeGreaterThan(0.3);
    expect(res.protectionCompliant).toBe(true);
  });

  it("Anti-AI Scraping Protection이 동일 시드에서 재현 가능하고 시드 변경 시 패턴이 달라진다", () => {
    const src = makeSolidBuffer(16, 16, [120, 130, 140]);
    const a = applyAntiAiScrapingProtection(src, { seed: 777 });
    const b = applyAntiAiScrapingProtection(src, { seed: 777 });
    const c = applyAntiAiScrapingProtection(src, { seed: 999 });
    expect(Array.from(a.protectedImage.data)).toEqual(Array.from(b.protectedImage.data));
    expect(Array.from(a.protectedImage.data)).not.toEqual(Array.from(c.protectedImage.data));
  });
});

describe("Krita AI Diffusion 라이브 캔버스 · ComfyUI 노드 그래프 엔진", () => {
  it("Live Painting 강도 슬라이더가 0.15~0.85 구간으로 엄격히 클램프된다", () => {
    const init = createLivePaintingState(768, 1024, { strength: 0.5 });
    expect(updateLivePaintingStrength(init, 0.02).strength).toBe(0.15);
    expect(updateLivePaintingStrength(init, 0.99).strength).toBe(0.85);
    expect(updateLivePaintingStrength(init, 0.48).strength).toBe(0.48);
  });

  it("더티 영역 병합 · 8px 그리드 정렬 · 디바운스 패치 발급이 정확히 동작한다", () => {
    let state = createLivePaintingState(768, 1024, { debounceMs: 200 });
    state = markCanvasDirtyRect(state, { x: 13, y: 21, width: 45, height: 33 }, 1000);
    state = markCanvasDirtyRect(state, { x: 50, y: 40, width: 60, height: 50 }, 1050);

    // 디바운스 미만 경과(100ms) -> 아직 발급 안 됨
    const early = flushLivePaintingPatch(state, 1150);
    expect(early.patch).toBeNull();

    // 디바운스 경과(250ms) -> 8px 정렬 병합 패치 발급
    const ready = flushLivePaintingPatch(state, 1300);
    expect(ready.patch).not.toBeNull();
    expect(ready.patch?.revision).toBe(1);
    expect((ready.patch?.tileRect.x ?? 1) % 8).toBe(0);
    expect((ready.patch?.tileRect.width ?? 1) % 8).toBe(0);
    expect(ready.state.pendingRect).toBeNull();
  });

  it("Regional Prompt Layers가 영역 점유율과 중첩률을 계산하고 비활성 레이어를 제외한다", () => {
    const { regionalLayers } = createDefaultKritaComfyWorkflow();
    const full = composeRegionalPromptAttentionMap(regionalLayers);
    expect(full.activeLayerCount).toBe(2);
    expect(full.overlapRatio).toBeGreaterThan(0);
    expect(full.combinedPromptSummary).toContain("중앙 캐릭터");

    const oneDisabled = composeRegionalPromptAttentionMap(
      regionalLayers.map((l, i) => (i === 0 ? { ...l, enabled: false } : l)),
    );
    expect(oneDisabled.activeLayerCount).toBe(1);
    expect(oneDisabled.overlapRatio).toBe(0);
  });

  it("6종 Multi-ControlNet 스택 검증이 잘못된 범위와 과도한 누적 강도를 경고한다", () => {
    const items: ControlNetStackItem[] = [
      { id: "1", type: "Lineart", enabled: true, strength: 1.5, startPercent: 0, endPercent: 1, preprocessor: CONTROLNET_PREPROCESSOR_MAP.Lineart },
      { id: "2", type: "DepthAnything3", enabled: true, strength: 1.2, startPercent: 0, endPercent: 1, preprocessor: CONTROLNET_PREPROCESSOR_MAP.DepthAnything3 },
      { id: "3", type: "OpenPose", enabled: true, strength: 1.0, startPercent: 0, endPercent: 1, preprocessor: CONTROLNET_PREPROCESSOR_MAP.OpenPose },
      { id: "4", type: "Canny", enabled: true, strength: 0.8, startPercent: 0.8, endPercent: 0.3, preprocessor: CONTROLNET_PREPROCESSOR_MAP.Canny },
      { id: "5", type: "Tile", enabled: false, strength: 0.5, startPercent: 0, endPercent: 1, preprocessor: CONTROLNET_PREPROCESSOR_MAP.Tile },
      { id: "6", type: "IPAdapter", enabled: false, strength: 0.5, startPercent: 0, endPercent: 1, preprocessor: CONTROLNET_PREPROCESSOR_MAP.IPAdapter },
    ];
    const res = buildMultiControlNetStack(items);
    expect(res.activeItems).toHaveLength(3);
    expect(res.overConstrained).toBe(true);
    expect(res.warnings.some((w) => w.includes("Canny"))).toBe(true);
    expect(res.warnings.some((w) => w.includes("누적 강도"))).toBe(true);
  });

  it("ComfyUI 시각 그래프 CRUD와 타입 불일치·순환 검증이 동작한다", () => {
    let { graph } = createDefaultKritaComfyWorkflow();
    graph = addComfyNode(graph, {
      id: "99",
      classType: "BackgroundRemoval",
      title: "배경 분리",
      position: { x: 100, y: 100 },
      widgets: { threshold: 0.5 },
    });
    graph = updateComfyNodeWidget(graph, "99", "threshold", 0.65);
    expect(graph.nodes.find((n) => n.id === "99")?.widgets.threshold).toBe(0.65);

    // 잘못된 타입 연결: Checkpoint(0:MODEL) -> BackgroundRemoval(image:IMAGE)
    const badType = connectComfyEdge(graph, {
      id: "bad-type",
      fromNodeId: "1",
      fromOutputIndex: 0,
      toNodeId: "99",
      toInputName: "image",
    });
    expect(validateComfyGraph(badType).valid).toBe(false);
    expect(validateComfyGraph(badType).errors.some((e) => e.includes("타입 불일치"))).toBe(true);

    // 정리 후 제거 확인
    const cleaned = removeComfyNode(disconnectComfyEdge(badType, "bad-type"), "99");
    expect(validateComfyGraph(cleaned).valid).toBe(true);
  });

  it("표준 ComfyUI API JSON 직렬화/역직렬화 왕복이 노드·위젯·엣지를 무손실 보존한다", () => {
    const { graph } = createDefaultKritaComfyWorkflow();
    const apiJson = exportComfyUiPromptGraph(graph);
    expect(apiJson["6"]?.class_type).toBe("KSampler");
    expect(apiJson["6"]?.inputs.model).toEqual(["2", 0]);

    const restored = importComfyUiPromptGraph(apiJson, graph.nameKo);
    expect(restored.nodes).toHaveLength(graph.nodes.length);
    expect(restored.edges).toHaveLength(graph.edges.length);
    expect(validateComfyGraph(restored).valid).toBe(true);
  });

  it("ComfyUI 오프라인 로컬 시뮬레이터가 유료 API 없이 위상 순서로 실행한다", () => {
    const { graph } = createDefaultKritaComfyWorkflow();
    const sim = simulateComfyGraphOffline(graph);
    expect(sim.ok).toBe(true);
    expect(sim.zeroPaidApiUsed).toBe(true);
    expect(sim.steps).toHaveLength(graph.nodes.length);
    expect(sim.outputResolution).toEqual({ width: 768, height: 1024 });
  });
});

describe("네이버 웹툰 AI 페인터 클린룸 자동 채색 엔진", () => {
  it("닫힌 어두운 잉크 벽으로 분리된 두 영역에서 선 바깥 번짐 0건으로 각각 채색한다", () => {
    const lineart = makeSplitWallLineart(32, 24);
    const res = runNaverStyleLineartColorize(
      lineart,
      [
        { id: "left", x: 8, y: 12, rgb: [240, 60, 60], radius: 3 },
        { id: "right", x: 24, y: 12, rgb: [50, 100, 240], radius: 3 },
      ],
      { presetId: "daily-watercolor", iterations: 28 },
    );
    expect(res.bleedViolationCount).toBe(0);
    const leftO = (12 * 32 + 10) * 4;
    const rightO = (12 * 32 + 22) * 4;
    expect(res.colorOnlyLayer.data[leftO]).toBeGreaterThan(res.colorOnlyLayer.data[leftO + 2] + 60);
    expect(res.colorOnlyLayer.data[rightO + 2]).toBeGreaterThan(res.colorOnlyLayer.data[rightO] + 60);
    // 외부 배경 (0, 0)은 채색되지 않음
    expect(res.colorOnlyLayer.data[3]).toBe(0);
  });

  it("같은 닫힌 영역 내 두 컬러 핀 사이를 경계 가중 Laplace 확산으로 부드럽게 보간한다", () => {
    const lineart = makeClosedBoxLineart(28, 20, 2);
    const res = runNaverStyleLineartColorize(
      lineart,
      [
        { id: "p1", x: 6, y: 10, rgb: [240, 80, 80], radius: 2 },
        { id: "p2", x: 21, y: 10, rgb: [80, 80, 240], radius: 2 },
      ],
      { presetId: "daily-watercolor", iterations: 48 },
    );
    const leftR = res.colorOnlyLayer.data[(10 * 28 + 8) * 4];
    const midR = res.colorOnlyLayer.data[(10 * 28 + 14) * 4];
    const rightR = res.colorOnlyLayer.data[(10 * 28 + 19) * 4];
    expect(leftR).toBeGreaterThan(midR);
    expect(midR).toBeGreaterThan(rightR);
  });

  it("4종 웹툰 채색 스타일 프리셋이 서로 구별되는 색감 프로필을 생성한다", () => {
    const demo = createDemoWebtoonLineart(32, 32);
    const pins = [{ id: "face", x: 16, y: 14, rgb: [232, 182, 152] as const, radius: 2 }];
    const signatures = WEBTOON_COLOR_STYLE_PRESETS.map((preset) => {
      const r = runNaverStyleLineartColorize(demo, pins, { presetId: preset.id, iterations: 12 });
      const o = (14 * 32 + 16) * 4;
      return `${r.colorOnlyLayer.data[o]},${r.colorOnlyLayer.data[o + 1]},${r.colorOnlyLayer.data[o + 2]}`;
    });
    expect(new Set(signatures).size).toBe(4);
  });

  it("전/후 비교 분할 슬라이더 상태가 0~100% 클램프·스텝·방향 전환을 관리한다", () => {
    let state = createBeforeAfterComparisonState(50);
    state = stepComparisonSplit(state, 15);
    expect(state.splitPercent).toBe(65);
    state = setComparisonSplitPercent(state, 180);
    expect(state.splitPercent).toBe(100);
    state = setComparisonSplitPercent(state, -20);
    expect(state.splitPercent).toBe(0);
    state = toggleComparisonOrientation(state);
    expect(state.orientation).toBe("horizontal");
  });
});

describe("StudioVisualAi4SuitesPanel UI · 접근성 · 지연 마운트 통합", () => {
  it("4분할 초보자 한국어 탭과 접근성 역할(tablist/tab/tabpanel)·min-h-11을 렌더링한다", () => {
    const { container } = render(<StudioVisualAi4SuitesPanel />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(tabs.map((t) => t.textContent)).toEqual([
      "파이어플라이 그래프·조명",
      "클립스튜디오 AI 보정",
      "크리타·ComfyUI 라이브",
      "웹툰 선화 자동 채색",
    ]);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[0]?.className).toContain("min-h-11");
    expect(container.firstElementChild?.className).toContain("[word-break:keep-all]");
  });

  it("4개 탭 전환과 각 스위트 인터랙티브 제어(조명·업스케일·ComfyUI JSON·자동 채색)가 동작한다", () => {
    render(<StudioVisualAi4SuitesPanel />);
    // Tab 1: Firefly
    fireEvent.click(screen.getByRole("button", { name: /파이프라인 다시 실행/u }));
    expect(screen.getByRole("status").textContent).toContain("실행 2회");

    // Tab 2: CSP
    fireEvent.click(screen.getByRole("tab", { name: "클립스튜디오 AI 보정" }));
    fireEvent.click(screen.getByRole("button", { name: "4배 확대" }));
    expect(screen.getByText(/결과 해상도 128×128/u)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("보호 기준 통과");

    // Tab 3: Krita / ComfyUI
    fireEvent.click(screen.getByRole("tab", { name: "크리타·ComfyUI 라이브" }));
    fireEvent.click(screen.getByRole("button", { name: /라이브 패치 반영/u }));
    expect(screen.getByRole("status").textContent).toContain("패치 #1 반영됨");
    fireEvent.click(screen.getByRole("button", { name: "표준 JSON 왕복 검증" }));
    expect(screen.getByText(/JSON 왕복 검증 완료/u)).toBeTruthy();

    // Tab 4: Naver AI Painter
    fireEvent.click(screen.getByRole("tab", { name: "웹툰 선화 자동 채색" }));
    fireEvent.click(screen.getByRole("button", { name: "로판 글로우" }));
    fireEvent.click(screen.getByRole("button", { name: "포인트 색 핀 추가" }));
    expect(screen.getByRole("status").textContent).toContain("선 바깥 번짐 0건");
  });

  it("점진적 공개(<details>)를 제공하고 transition-all 및 원시 HEX 클래스를 쓰지 않는다", () => {
    const { container } = render(<StudioVisualAi4SuitesPanel />);
    expect(container.querySelectorAll("details").length).toBeGreaterThanOrEqual(1);
    expect(container.innerHTML).not.toContain("transition-all");
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/u);
  });

  it("StudioWebtoonModelerImageGenPanel에서 접이식 진입점 클릭 시 4대 스위트 패널이 지연 마운트된다", async () => {
    render(<StudioWebtoonModelerImageGenPanel />);
    expect(screen.queryByRole("tablist", { name: "비주얼 AI 도구 선택" })).toBeNull();

    const toggleBtn = screen.getByRole("button", {
      name: /비주얼 AI 4대 스튜디오 랩/u,
    });
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("true");

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "비주얼 AI 도구 선택" })).toBeTruthy();
    });
  });
});
