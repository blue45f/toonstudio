// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  buildIndexedTriangleMesh,
  chainInkEdgesToPolylines,
  createArchitecturalArchMesh,
  createHeroBustMesh,
  createKatanaPropMesh,
  createKeyLightDirection,
  evaluateGpenStrokeWidth,
  exportVectorInkSvg,
  extract3dInkEdges,
  fitCubicBezierInkStrokes,
  getGpenStyleProfile,
  projectMeshToVectorInk,
  simplifyPolylineRdp,
  StudioVectorInkProjectionPanel,
  type InkPolyline,
  type ProjectedInkEdge,
  type VectorInkLayerPayload,
} from "./index";

let mockCanvasFillCalls = 0;
let mockCanvasBezierCalls = 0;

function createMockCanvasContext(): Partial<CanvasRenderingContext2D> {
  return {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    bezierCurveTo: vi.fn(() => {
      mockCanvasBezierCalls += 1;
    }),
    stroke: vi.fn(),
    fill: vi.fn(() => {
      mockCanvasFillCalls += 1;
    }),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
  };
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
  mockCanvasFillCalls = 0;
  mockCanvasBezierCalls = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    (() => createMockCanvasContext()) as unknown as typeof HTMLCanvasElement.prototype.getContext,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("① 절차적 3D 다양체(Manifold) 테스트 메시 프리셋", () => {
  it("인물 흉상·아치 배경·검 소품 3종 모두 수밀 2-다양체와 단위 외향 법선·엣지 인접 테이블을 만족한다", () => {
    const meshes = [createHeroBustMesh(), createArchitecturalArchMesh(), createKatanaPropMesh()];

    for (const mesh of meshes) {
      expect(mesh.manifoldStats.vertexCount).toBeGreaterThan(30);
      expect(mesh.manifoldStats.triangleCount).toBeGreaterThan(40);
      expect(mesh.manifoldStats.edgeCount).toBeGreaterThan(60);
      expect(mesh.manifoldStats.nonManifoldEdgeCount).toBe(0);
      expect(mesh.manifoldStats.boundaryEdgeCount).toBe(0);
      expect(mesh.manifoldStats.isWatertightManifold).toBe(true);
      expect(mesh.bounds.radius).toBeGreaterThan(0.5);

      for (const n of mesh.faceNormals) {
        expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 4);
      }
      for (const e of mesh.edges) {
        expect(e.faceB).not.toBeNull();
        expect(e.dihedralAngleDeg).toBeGreaterThanOrEqual(0);
        expect(e.dihedralAngleDeg).toBeLessThanOrEqual(180);
      }
    }
  });

  it("열린 사각형 메시는 open boundary 엣지 4개를 정확히 분류한다", () => {
    const openQuad = buildIndexedTriangleMesh({
      id: "katana-prop",
      labelKo: "열린 면",
      labelEn: "Open Quad",
      descriptionKo: "경계 엣지 테스트",
      descriptionEn: "Open boundary test",
      defaultCamera: { yawDeg: 0, pitchDeg: 0, distance: 3, fovDeg: 40, target: { x: 0, y: 0, z: 0 } },
      vertices: [
        { x: -1, y: -1, z: 0 },
        { x: 1, y: -1, z: 0 },
        { x: 1, y: 1, z: 0 },
        { x: -1, y: 1, z: 0 },
      ],
      triangles: [
        [0, 1, 2],
        [0, 2, 3],
      ],
    });

    expect(openQuad.manifoldStats.boundaryEdgeCount).toBe(4);
    expect(openQuad.manifoldStats.isWatertightManifold).toBe(false);

    const extracted = extract3dInkEdges(openQuad, {
      yawDeg: 0,
      pitchDeg: 0,
      distance: 3,
      fovDeg: 40,
      viewportWidth: 400,
      viewportHeight: 300,
      target: { x: 0, y: 0, z: 0 },
    });
    expect(extracted.boundaryCount).toBe(4);
    expect(extracted.edges.every((edge) => edge.kind === "boundary")).toBe(true);
  });
});

describe("② 원근 투영·실루엣/크리즈 분류·은면 판별·Z 정렬", () => {
  it("크리즈 각도 임계값에 따라 감지되는 크리즈 엣지 수가 단조 변화하고 Z-정렬(원경→근경)을 유지한다", () => {
    const arch = createArchitecturalArchMesh();
    const camera = {
      yawDeg: -26,
      pitchDeg: 10,
      distance: 4.1,
      fovDeg: 40,
      viewportWidth: 560,
      viewportHeight: 360,
      target: arch.defaultCamera.target,
    };

    const sensitive = extract3dInkEdges(arch, camera, { creaseAngleDeg: 18 });
    const strict = extract3dInkEdges(arch, camera, { creaseAngleDeg: 88 });

    expect(sensitive.silhouetteCount).toBeGreaterThan(8);
    expect(sensitive.creaseCount).toBeGreaterThan(strict.creaseCount);
    expect(strict.silhouetteCount).toBe(sensitive.silhouetteCount);

    for (let i = 1; i < sensitive.edges.length; i += 1) {
      const prev = sensitive.edges[i - 1];
      const curr = sensitive.edges[i];
      if (prev && curr) {
        expect(prev.depth).toBeGreaterThanOrEqual(curr.depth);
      }
    }
  });

  it("은면 깊이 가시성 검사가 앞면 뒤에 숨은 후면 엣지를 제거한다", () => {
    const bust = createHeroBustMesh();
    const camera = {
      yawDeg: 24,
      pitchDeg: 6,
      distance: 3.15,
      fovDeg: 38,
      viewportWidth: 560,
      viewportHeight: 360,
      target: bust.defaultCamera.target,
    };

    const withCulling = extract3dInkEdges(bust, camera, { enableOcclusionCulling: true });
    const withoutCulling = extract3dInkEdges(bust, camera, { enableOcclusionCulling: false });

    expect(withCulling.culledEdgeCount).toBeGreaterThan(0);
    expect(withCulling.edges.length).toBeLessThan(withoutCulling.edges.length);
  });
});

describe("③ 폴리라인 체이닝(코너 보존) 및 Ramer-Douglas-Peucker 단순화", () => {
  it("RDP 단순화는 직선 위 중복 정점을 제거하고 허용 오차를 넘는 꼭짓점은 보존한다", () => {
    const flatLine = [
      { x: 0, y: 0 },
      { x: 25, y: 0.2 },
      { x: 50, y: -0.1 },
      { x: 75, y: 0.15 },
      { x: 100, y: 0 },
    ];
    expect(simplifyPolylineRdp(flatLine, 1.0)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);

    const corneredLine = [
      { x: 0, y: 0 },
      { x: 25, y: 0.2 },
      { x: 50, y: -0.1 },
      { x: 75, y: 14 },
      { x: 100, y: 0 },
    ];
    const simplified = simplifyPolylineRdp(corneredLine, 1.5);
    expect(simplified).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: -0.1 },
      { x: 75, y: 14 },
      { x: 100, y: 0 },
    ]);
  });

  it("완만한 곡선 엣지는 단일 획으로 연결하고 90° 예각 코너에서는 획을 분리해 각을 보존한다", () => {
    const makeEdge = (key: string, v0: number, v1: number, a2d: { x: number; y: number }, b2d: { x: number; y: number }): ProjectedInkEdge => ({
      edgeKey: key,
      kind: "crease",
      a2d,
      b2d,
      depth: 3,
      dihedralAngleDeg: 90,
      shadowFactor: 0.4,
      normal3d: { x: 0, y: 0, z: 1 },
      v0,
      v1,
    });

    const edges: ProjectedInkEdge[] = [
      makeEdge("0:1", 0, 1, { x: 0, y: 0 }, { x: 40, y: 4 }),
      makeEdge("1:2", 1, 2, { x: 40, y: 4 }, { x: 80, y: 12 }),
      // 90도 급회전 코너
      makeEdge("2:3", 2, 3, { x: 80, y: 12 }, { x: 78, y: 62 }),
    ];

    const splitAtCorner = chainInkEdgesToPolylines(edges, {
      cornerBreakAngleDeg: 45,
      rdpTolerancePx: 0.5,
      minStrokeLengthPx: 1,
    });
    expect(splitAtCorner.length).toBe(2);

    const mergedAll = chainInkEdgesToPolylines(edges, {
      cornerBreakAngleDeg: 110,
      rdpTolerancePx: 0.5,
      minStrokeLengthPx: 1,
    });
    expect(mergedAll.length).toBe(1);
  });
});

describe("④ C1 큐빅 베지어 피팅 + 크리에이터 G펜 필압·그림자 강약 + SVG/JSON 내보내기", () => {
  it("G펜 필압 곡선은 진입 테이퍼·끝 빼기·중앙 배부름·곡률 보정·그림자 측 선폭 강조를 정확히 반영한다", () => {
    const gpen = getGpenStyleProfile("webtoon-gpen");

    const startW = evaluateGpenStrokeWidth({ t: 0, curvature: 0, shadowFactor: 0.5, kind: "silhouette", closed: false, profile: gpen });
    const midW = evaluateGpenStrokeWidth({ t: 0.5, curvature: 0, shadowFactor: 0.5, kind: "silhouette", closed: false, profile: gpen });
    const endW = evaluateGpenStrokeWidth({ t: 1, curvature: 0, shadowFactor: 0.5, kind: "silhouette", closed: false, profile: gpen });

    expect(midW).toBeGreaterThan(startW * 1.8);
    expect(midW).toBeGreaterThan(endW * 2.0);
    expect(endW).toBeLessThan(startW);

    const straightW = evaluateGpenStrokeWidth({ t: 0.5, curvature: 0, shadowFactor: 0.5, kind: "silhouette", closed: false, profile: gpen });
    const tightTurnW = evaluateGpenStrokeWidth({ t: 0.5, curvature: 0.9, shadowFactor: 0.5, kind: "silhouette", closed: false, profile: gpen });
    expect(tightTurnW).toBeLessThan(straightW);

    const litW = evaluateGpenStrokeWidth({ t: 0.5, curvature: 0, shadowFactor: 0, kind: "silhouette", closed: false, profile: gpen });
    const shadowW = evaluateGpenStrokeWidth({ t: 0.5, curvature: 0, shadowFactor: 1, kind: "silhouette", closed: false, profile: gpen });
    expect(shadowW).toBeGreaterThan(litW * 1.5);
  });

  it("인접 큐빅 베지어 세그먼트가 C1 접선 연속성을 만족하고 붓펜이 테크니컬 펜보다 큰 강약 폭을 가진다", () => {
    const samplePolyline: InkPolyline = {
      id: "silhouette-001",
      kind: "silhouette",
      closed: false,
      averageDepth: 2.8,
      averageShadowFactor: 0.72,
      arcLengthPx: 160,
      points: [
        { x: 20, y: 120, depth: 2.9, shadowFactor: 0.2, vertexIndex: 0 },
        { x: 70, y: 80, depth: 2.8, shadowFactor: 0.55, vertexIndex: 1 },
        { x: 130, y: 78, depth: 2.75, shadowFactor: 0.85, vertexIndex: 2 },
        { x: 185, y: 118, depth: 2.7, shadowFactor: 0.95, vertexIndex: 3 },
      ],
    };

    const brushStrokes = fitCubicBezierInkStrokes([samplePolyline], getGpenStyleProfile("expressive-brush"));
    const techStrokes = fitCubicBezierInkStrokes([samplePolyline], getGpenStyleProfile("architectural-technical"));

    const stroke = brushStrokes[0];
    const tech = techStrokes[0];
    expect(stroke).toBeDefined();
    expect(tech).toBeDefined();
    if (!stroke || !tech) return;

    expect(stroke.segments.length).toBe(3);
    expect(stroke.maxWidthPx - stroke.minWidthPx).toBeGreaterThan(tech.maxWidthPx - tech.minWidthPx);

    // 내부 정점에서 C1 접선 연속성 확인: (p3 - cp2) 방향과 다음 세그먼트 (cp1 - p0) 방향 일치
    for (let i = 0; i < stroke.segments.length - 1; i += 1) {
      const a = stroke.segments[i];
      const b = stroke.segments[i + 1];
      if (!a || !b) continue;
      const dxA = a.p3.x - a.cp2.x;
      const dyA = a.p3.y - a.cp2.y;
      const dxB = b.cp1.x - b.p0.x;
      const dyB = b.cp1.y - b.p0.y;
      const dot = (dxA * dxB + dyA * dyB) / (Math.hypot(dxA, dyA) * Math.hypot(dxB, dyB));
      expect(dot).toBeCloseTo(1, 5);
    }
  });

  it("전체 투영 및 SVG/JSON 내보내기가 유효한 가변 폭 SVG path와 편집 가능한 베지어 페이로드를 생성한다", () => {
    const result = projectMeshToVectorInk({
      meshId: "katana-prop",
      gpenStyleId: "webtoon-gpen",
      keyLightDirection: createKeyLightDirection(-45, 45),
    });

    expect(result.strokes.length).toBeGreaterThan(5);
    expect(result.stats.bezierSegmentCount).toBeGreaterThanOrEqual(result.strokes.length);

    const exported = exportVectorInkSvg(result);
    expect(exported.pathCount).toBe(result.strokes.length);
    expect(exported.svgMarkup).toContain("<svg xmlns=\"http://www.w3.org/2000/svg\"");
    expect(exported.svgMarkup).toContain("id=\"vector-ink-outlines\"");
    expect(exported.svgMarkup).toContain("id=\"vector-ink-bezier-guides\"");
    expect(exported.svgMarkup).toContain("fill=\"currentColor\"");
    expect(exported.svgMarkup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);

    const parsed = JSON.parse(exported.layerJson) as VectorInkLayerPayload;
    expect(parsed.schemaVersion).toBe("toonstudio.vector-ink-layer.v1");
    expect(parsed.meshId).toBe("katana-prop");
    expect(parsed.strokes.length).toBe(exported.pathCount);
    expect(parsed.strokes[0]?.svgCenterlinePathD).toMatch(/^M .+ C /u);
  });
});

describe("⑤ StudioVectorInkProjectionPanel 상호작용 및 Calm Atelier 위생 계약", () => {
  it("props 없이 단독 렌더링되며 프리셋·스타일·카메라·크리즈·그림자 필압·SVG/JSON 미리보기가 실시간 반영된다", () => {
    const onExportVectorLayer = vi.fn();
    render(<StudioVectorInkProjectionPanel onExportVectorLayer={onExportVectorLayer} />);

    expect(screen.getByTestId("studio-vector-ink-projection-panel")).toBeTruthy();
    expect(screen.getByTestId("vector-ink-canvas")).toBeTruthy();
    expect(mockCanvasFillCalls).toBeGreaterThan(0);

    const initialEdgesText = screen.getByTestId("vector-ink-edge-counts").textContent;
    fireEvent.click(screen.getByTestId("vector-ink-mesh-architectural-arch"));
    expect(screen.getByTestId("vector-ink-edge-counts").textContent).not.toBe(initialEdgesText);

    const initialWidths = screen.getByTestId("vector-ink-width-stats").textContent;
    fireEvent.click(screen.getByTestId("vector-ink-style-expressive-brush"));
    expect(screen.getByTestId("vector-ink-width-stats").textContent).not.toBe(initialWidths);

    // 캔버스 드래그로 카메라 회전 및 베지어 핸들 오버레이 토글
    const canvas = screen.getByTestId("vector-ink-canvas");
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 160, clientY: 120 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 160, clientY: 120 });

    fireEvent.click(screen.getByTestId("vector-ink-toggle-bezier-guides"));
    expect(mockCanvasBezierCalls).toBeGreaterThan(0);

    // 크리즈 각도·그림자 강약 슬라이더 조작
    fireEvent.change(screen.getByTestId("vector-ink-slider-crease"), { target: { value: "20" } });
    fireEvent.change(screen.getByTestId("vector-ink-slider-shadow"), { target: { value: "130" } });

    // SVG 내보내기 및 JSON 미리보기 확인
    fireEvent.click(screen.getByTestId("vector-ink-export-svg-btn"));
    expect(onExportVectorLayer).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("vector-ink-export-code").textContent).toContain("<svg xmlns=");

    fireEvent.click(screen.getByTestId("vector-ink-preview-json-btn"));
    expect(screen.getByTestId("vector-ink-export-code").textContent).toContain("toonstudio.vector-ink-layer.v1");

    // 초기화 및 영어 로캘 단독 렌더 확인
    fireEvent.click(screen.getByTestId("vector-ink-reset-btn"));
    expect(screen.queryByTestId("vector-ink-export-code")).toBeNull();

    cleanup();
    render(<StudioVectorInkProjectionPanel locale="en" />);
    expect(screen.getByText("3D Silhouette & Crease → G-Pen Vector Ink")).toBeTruthy();
  });

  it("Calm Atelier 위생 계약: 모듈 내 모든 소스 파일이 원시 색상·Sparkles·transition-all·Web Storage·store Map·800줄 제한을 준수한다", () => {
    const dir = __dirname;
    const files = readdirSync(dir).filter(
      (name) => (name.endsWith(".ts") || name.endsWith(".tsx")) && !name.endsWith(".test.tsx"),
    );
    expect(files.length).toBeGreaterThanOrEqual(5);

    for (const file of files) {
      const content = readFileSync(path.join(dir, file), "utf8");
      const lineCount = content.split("\n").length;
      expect(lineCount, `${file} must stay <= 800 lines`).toBeLessThanOrEqual(800);
      expect(content, `${file} must have zero raw hex`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(content, `${file} must have zero raw rgb/hsl`).not.toMatch(/\b(?:rgba?|hsla?)\s*\(/u);
      expect(content, `${file} must have zero transition-all`).not.toMatch(/\btransition-all\b/u);
      expect(content, `${file} must have zero Sparkles`).not.toMatch(/\bSparkles\b/u);
      expect(content, `${file} must have zero Web Storage`).not.toMatch(/\b(?:localStorage|sessionStorage)\b/u);
      expect(content, `${file} must not name any Map field store`).not.toMatch(/\bstore\s*=\s*new\s+Map\b/u);
    }
  });
});
