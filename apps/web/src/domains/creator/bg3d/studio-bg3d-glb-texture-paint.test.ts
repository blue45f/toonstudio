import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  STUDIO_BG3D_GLB_MIME,
  normalizeStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import {
  adaptStudioBg3dRuntimeToDocument,
  hydrateStudioBg3dDocumentToRuntime,
} from "./studio-bg3d-scene-runtime";
import {
  STUDIO_BG3D_GLB_PAINT_STATUS_MESSAGES,
  StudioBg3dGlbTexturePaintSurface,
  analyzeStudioBg3dGlbPaintability,
  analyzeStudioBg3dGlbPaintabilityFromBytes,
  countStudioBg3dModelTexturePaintPoints,
  createStudioBg3dModelTexturePaintTargetKey,
  dilateStudioBg3dPaintLayer,
  getStudioBg3dModelTexturePaintForTarget,
  normalizeStudioBg3dModelTexturePaint,
  parseStudioBg3dModelTexturePaintTargetKey,
  resolveStudioBg3dGlbTexturePaintSize,
  resolveStudioBg3dSeamPaddingPasses,
  resolveStudioBg3dSeamWrapOffsets,
  splitStudioBg3dTexturePaintStrokeAtUvJumps,
  upsertStudioBg3dModelTexturePaintTarget,
  type StudioBg3dGlbPaintCanvas,
  type StudioBg3dGlbPaintCanvas2d,
  type StudioBg3dModelTexturePaint,
} from "./studio-bg3d-glb-texture-paint";
import { StudioBg3dGlbTexturePaintSession } from "./studio-bg3d-glb-texture-paint-controller";
import type { StudioBg3dTexturePaintStroke } from "./studio-bg3d-texture-paint";
import type { BgCustomModelInstance } from "../studio-background-3d-model";

const stroke: StudioBg3dTexturePaintStroke = {
  color: "#ff0000",
  size: 0.04,
  opacity: 1,
  points: [[0.25, 0.5], [0.5, 0.5]],
};

function modelPaint(): StudioBg3dModelTexturePaint {
  return {
    version: 1,
    targets: [{ targetKey: "mesh-0", paint: { version: 1, strokes: [stroke] } }],
  };
}

describe("대상 키", () => {
  it("정규형만 만들고 읽는다", () => {
    expect(createStudioBg3dModelTexturePaintTargetKey(3)).toBe("mesh-3");
    expect(createStudioBg3dModelTexturePaintTargetKey(3, 2)).toBe("mesh-3:slot-2");
    expect(parseStudioBg3dModelTexturePaintTargetKey("mesh-3")).toEqual({ meshOrdinal: 3, slot: 0 });
    expect(parseStudioBg3dModelTexturePaintTargetKey("mesh-3:slot-2")).toEqual({ meshOrdinal: 3, slot: 2 });
    expect(parseStudioBg3dModelTexturePaintTargetKey("mesh-03")).toBeNull();
    expect(parseStudioBg3dModelTexturePaintTargetKey("mesh-0:slot-0")).toBeNull();
    expect(parseStudioBg3dModelTexturePaintTargetKey("texture-1")).toBeNull();
  });
});

describe("normalizeStudioBg3dModelTexturePaint", () => {
  it("유효한 대상만 남기고 중복·비정규 키를 버린다", () => {
    const paint = normalizeStudioBg3dModelTexturePaint({
      version: 1,
      targets: [
        { targetKey: "mesh-0", paint: { strokes: [stroke] } },
        { targetKey: "mesh-0", paint: { strokes: [stroke] } },
        { targetKey: "bogus", paint: { strokes: [stroke] } },
        { targetKey: "mesh-1", paint: { strokes: [] } },
      ],
    });
    expect(paint?.targets).toHaveLength(1);
    expect(paint?.targets[0]?.targetKey).toBe("mesh-0");
    expect(normalizeStudioBg3dModelTexturePaint(null)).toBeNull();
    expect(normalizeStudioBg3dModelTexturePaint({ targets: [] })).toBeNull();
  });

  it("upsert로 대상을 넣고 빼며, 비면 전체가 null이 된다", () => {
    const one = upsertStudioBg3dModelTexturePaintTarget(null, "mesh-0", { version: 1, strokes: [stroke] });
    expect(countStudioBg3dModelTexturePaintPoints(one)).toBe(2);
    expect(getStudioBg3dModelTexturePaintForTarget(one, "mesh-0")?.strokes).toHaveLength(1);
    expect(getStudioBg3dModelTexturePaintForTarget(one, "mesh-9")).toBeNull();
    expect(upsertStudioBg3dModelTexturePaintTarget(one, "mesh-0", null)).toBeNull();
  });
});

/* ── glTF 판정 픽스처 ─────────────────────────────────────────────────────── */

function gltfFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, TEXCOORD_0: 1 },
        material: 0,
      }],
    }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0, sampler: 0 }],
    images: [{ bufferView: 0, mimeType: "image/png" }],
    samplers: [{ wrapS: 10497, wrapT: 10497 }],
    buffers: [{ byteLength: 16 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 16 }],
    accessors: [],
    ...overrides,
  };
}

describe("analyzeStudioBg3dGlbPaintability", () => {
  it("내장 baseColor 텍스처 + UV가 있으면 paintable과 대상을 돌려준다", () => {
    const result = analyzeStudioBg3dGlbPaintability(gltfFixture());
    expect(result.status).toBe("paintable");
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0]).toMatchObject({
      targetKey: "mesh-0",
      meshIndex: 0,
      textureIndex: 0,
      imageIndex: 0,
      skinned: false,
      wrapRepeat: true,
    });
  });

  it("외부 텍스처 uri가 있으면 검증기 거부 부류로 안내한다", () => {
    const result = analyzeStudioBg3dGlbPaintability(gltfFixture({
      images: [{ uri: "https://example.com/skin.png" }],
    }));
    expect(result.status).toBe("external-resource");
    expect(result.targets).toHaveLength(0);
    expect(result.message).toBe(STUDIO_BG3D_GLB_PAINT_STATUS_MESSAGES["external-resource"]);
    const bufferExternal = analyzeStudioBg3dGlbPaintability(gltfFixture({
      buffers: [{ uri: "geometry.bin", byteLength: 16 }],
    }));
    expect(bufferExternal.status).toBe("external-resource");
  });

  it("텍스처가 없는 모델은 no-texture, 텍스처는 있으나 UV가 없으면 no-uv다", () => {
    const noTexture = analyzeStudioBg3dGlbPaintability(gltfFixture({ materials: [{}] }));
    expect(noTexture.status).toBe("no-texture");
    const noUv = analyzeStudioBg3dGlbPaintability(gltfFixture({
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    }));
    expect(noUv.status).toBe("no-uv");
    expect(noUv.texturedPrimitiveCount).toBe(1);
  });

  it("스킨 노드의 대상은 skinned로 표시되고, clamp 샘플러는 wrapRepeat가 꺼진다", () => {
    const result = analyzeStudioBg3dGlbPaintability(gltfFixture({
      nodes: [{ mesh: 0, skin: 0 }],
      skins: [{ joints: [1] }],
      samplers: [{ wrapS: 33071, wrapT: 33071 }],
    }));
    expect(result.status).toBe("paintable");
    expect(result.targets[0]?.skinned).toBe(true);
    expect(result.targets[0]?.wrapRepeat).toBe(false);
    expect(result.skinCount).toBe(1);
  });

  it("장면 DFS 순서대로 대상 순서(ordinal)를 매긴다", () => {
    const result = analyzeStudioBg3dGlbPaintability(gltfFixture({
      scenes: [{ nodes: [0, 1] }],
      nodes: [{ children: [2] }, { mesh: 1 }, { mesh: 0 }],
      meshes: [
        { primitives: [{ attributes: { TEXCOORD_0: 0 }, material: 0 }] },
        { primitives: [{ attributes: { TEXCOORD_0: 0 }, material: 0 }] },
      ],
    }));
    // 루트0 → 자식2(mesh0)가 먼저, 그 다음 루트1(mesh1).
    expect(result.targets.map((target) => target.targetKey)).toEqual(["mesh-0", "mesh-1"]);
    expect(result.targets.map((target) => target.meshIndex)).toEqual([0, 1]);
  });

  it("깨진 구조는 invalid다", () => {
    expect(analyzeStudioBg3dGlbPaintability(null).status).toBe("invalid");
    expect(analyzeStudioBg3dGlbPaintability({}).status).toBe("invalid");
    expect(analyzeStudioBg3dGlbPaintabilityFromBytes(new Uint8Array(4)).status).toBe("invalid");
  });

  it("GLB 바이트에서 JSON 청크를 꺼내 같은 판정을 한다", () => {
    const json = new TextEncoder().encode(JSON.stringify(gltfFixture()));
    const padded = new Uint8Array(Math.ceil(json.length / 4) * 4).fill(0x20);
    padded.set(json);
    const total = 20 + padded.length;
    const bytes = new Uint8Array(total);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, total, true);
    view.setUint32(12, padded.length, true);
    view.setUint32(16, 0x4e4f534a, true);
    bytes.set(padded, 20);
    const result = analyzeStudioBg3dGlbPaintabilityFromBytes(bytes);
    expect(result.status).toBe("paintable");
    expect(result.targets[0]?.targetKey).toBe("mesh-0");
  });
});

describe("해상도 정책", () => {
  it("원본 종횡비를 유지하며 버킷으로 올림하고 2048에서 캡한다", () => {
    expect(resolveStudioBg3dGlbTexturePaintSize(300, 150)).toEqual({ width: 512, height: 256, capped: false });
    expect(resolveStudioBg3dGlbTexturePaintSize(1024, 1024)).toEqual({ width: 1024, height: 1024, capped: false });
    const capped = resolveStudioBg3dGlbTexturePaintSize(4096, 2048);
    expect(capped).toEqual({ width: 2048, height: 1024, capped: true });
    expect(resolveStudioBg3dGlbTexturePaintSize(0, -1)).toEqual({ width: 512, height: 512, capped: false });
  });
});

describe("심 보정", () => {
  it("랩 오프셋: 경계에 닿은 획만 고스트를 만든다", () => {
    const centered: StudioBg3dTexturePaintStroke = { ...stroke, points: [[0.5, 0.5]] };
    expect(resolveStudioBg3dSeamWrapOffsets(centered)).toEqual([[0, 0]]);
    const nearLeft: StudioBg3dTexturePaintStroke = { ...stroke, size: 0.1, points: [[0.01, 0.5]] };
    expect(resolveStudioBg3dSeamWrapOffsets(nearLeft)).toEqual([[0, 0], [1, 0]]);
    const corner: StudioBg3dTexturePaintStroke = { ...stroke, size: 0.1, points: [[0.99, 0.01]] };
    expect(resolveStudioBg3dSeamWrapOffsets(corner)).toEqual([[0, 0], [0, 1], [-1, 0], [-1, 1]]);
    expect(resolveStudioBg3dSeamWrapOffsets(nearLeft, { wrapU: false })).toEqual([[0, 0]]);
  });

  it("UV 점프에서 획을 끊는다", () => {
    const jumping: StudioBg3dTexturePaintStroke = {
      ...stroke,
      points: [[0.1, 0.1], [0.12, 0.1], [0.9, 0.9], [0.92, 0.9]],
    };
    const pieces = splitStudioBg3dTexturePaintStrokeAtUvJumps(jumping);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]?.points).toHaveLength(2);
    expect(pieces[1]?.points).toHaveLength(2);
    expect(splitStudioBg3dTexturePaintStrokeAtUvJumps(stroke)).toEqual([stroke]);
  });

  it("딜레이션은 패스당 한 링만 자라고 칠해진 텍셀을 바꾸지 않는다", () => {
    const size = 5;
    const source = new Uint8ClampedArray(size * size * 4);
    const center = (2 * size + 2) * 4;
    source[center] = 200;
    source[center + 3] = 255;
    const one = dilateStudioBg3dPaintLayer(source, size, size, 1);
    expect(one).not.toBeNull();
    expect(one!.filledTexels).toBe(8);
    expect(one!.data[(1 * size + 1) * 4]).toBe(200);
    expect(one!.data[(0 * size + 0) * 4 + 3]).toBe(0);
    expect(one!.data[center]).toBe(200);
    const two = dilateStudioBg3dPaintLayer(source, size, size, 2);
    expect(two!.data[(0 * size + 0) * 4 + 3]).toBe(255);
    // 원본 무변경
    expect(source[(1 * size + 1) * 4 + 3]).toBe(0);
    expect(dilateStudioBg3dPaintLayer(new Uint8ClampedArray(3), 5, 5, 1)).toBeNull();
  });

  it("블리드 패스 정책: 스킨·고해상도일수록 넓다", () => {
    expect(resolveStudioBg3dSeamPaddingPasses({ skinned: true, width: 2048, height: 2048 })).toBe(8);
    expect(resolveStudioBg3dSeamPaddingPasses({ skinned: true, width: 512, height: 512 })).toBe(4);
    expect(resolveStudioBg3dSeamPaddingPasses({ skinned: false, width: 1024, height: 512 })).toBe(4);
    expect(resolveStudioBg3dSeamPaddingPasses({ skinned: false, width: 256, height: 256 })).toBe(2);
  });
});

/* ── 가짜 캔버스(픽셀 backing 포함) ───────────────────────────────────────── */

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

class FakeContext implements StudioBg3dGlbPaintCanvas2d {
  fillStyle = "#000000";
  strokeStyle = "#000000";
  globalAlpha = 1;
  lineWidth = 1;
  lineCap = "round";
  lineJoin = "round";
  private path: { x: number; y: number }[] = [];
  constructor(private readonly canvas: FakeCanvas) {}

  private stamp(x: number, y: number, radius: number, color: string): void {
    const [r, g, b] = hexToRgb(color.startsWith("#") ? color : "#000000");
    const { width, height, data } = this.canvas;
    const alpha = Math.round(255 * this.globalAlpha);
    for (let py = Math.max(0, Math.floor(y - radius)); py <= Math.min(height - 1, Math.ceil(y + radius)); py += 1) {
      for (let px = Math.max(0, Math.floor(x - radius)); px <= Math.min(width - 1, Math.ceil(x + radius)); px += 1) {
        if (Math.hypot(px - x, py - y) > radius) continue;
        const offset = (py * width + px) * 4;
        data[offset] = r;
        data[offset + 1] = g;
        data[offset + 2] = b;
        data[offset + 3] = Math.max(data[offset + 3]!, alpha);
      }
    }
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const [r, g, b] = hexToRgb(this.fillStyle);
    for (let py = y; py < y + h; py += 1) {
      for (let px = x; px < x + w; px += 1) {
        const offset = (py * this.canvas.width + px) * 4;
        this.canvas.data[offset] = r;
        this.canvas.data[offset + 1] = g;
        this.canvas.data[offset + 2] = b;
        this.canvas.data[offset + 3] = 255;
      }
    }
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    for (let py = y; py < y + h; py += 1) {
      for (let px = x; px < x + w; px += 1) {
        const offset = (py * this.canvas.width + px) * 4;
        this.canvas.data.fill(0, offset, offset + 4);
      }
    }
  }
  beginPath(): void { this.path = []; }
  moveTo(x: number, y: number): void { this.path.push({ x, y }); }
  lineTo(x: number, y: number): void { this.path.push({ x, y }); }
  stroke(): void {
    for (let i = 1; i < this.path.length; i += 1) {
      const a = this.path[i - 1]!;
      const b = this.path[i]!;
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let s = 0; s <= steps; s += 1) {
        this.stamp(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps, this.lineWidth / 2, this.strokeStyle);
      }
    }
  }
  arc(x: number, y: number, radius: number): void { this.path.push({ x, y }); this.pendingRadius = radius; }
  private pendingRadius = 0;
  fill(): void {
    const point = this.path[this.path.length - 1];
    if (point) this.stamp(point.x, point.y, this.pendingRadius, this.fillStyle);
  }
  drawImage(source: unknown, dx: number, dy: number, w: number, h: number): void {
    if (source instanceof FakeCanvas) {
      // 테스트에서는 같은 크기 합성만 쓴다.
      void dx; void dy; void w; void h;
      const src = source.data;
      const dst = this.canvas.data;
      for (let i = 0; i < dst.length; i += 4) {
        if (src[i + 3]! > 0) {
          dst[i] = src[i]!;
          dst[i + 1] = src[i + 1]!;
          dst[i + 2] = src[i + 2]!;
          dst[i + 3] = Math.max(dst[i + 3]!, src[i + 3]!);
        }
      }
      return;
    }
    // 원본 이미지 대용: 단색으로 채운다.
    this.fillStyle = "#336699";
    this.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.fillStyle = "#000000";
  }
  getImageData(_x: number, _y: number, _w: number, _h: number): { data: Uint8ClampedArray } {
    return { data: new Uint8ClampedArray(this.canvas.data) };
  }
  putImageData(imageData: { data: Uint8ClampedArray }): void {
    this.canvas.data.set(imageData.data);
  }
}

class FakeCanvas implements StudioBg3dGlbPaintCanvas {
  readonly data: Uint8ClampedArray;
  private readonly context: FakeContext;
  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
    this.context = new FakeContext(this);
  }
  getContext(): StudioBg3dGlbPaintCanvas2d | null { return this.context; }
  toDataURL(type?: string): string { return `data:${type ?? "image/png"};base64,fake`; }
}

function createSurface(paint: StudioBg3dModelTexturePaint["targets"][number]["paint"] | null = null) {
  return new StudioBg3dGlbTexturePaintSurface({
    createCanvas: (width, height) => new FakeCanvas(width, height),
    width: 32,
    height: 32,
    drawBase: (context) => {
      context.fillStyle = "#336699";
      context.globalAlpha = 1;
      context.fillRect(0, 0, 32, 32);
    },
    paint,
    seamPasses: 2,
  });
}

describe("StudioBg3dGlbTexturePaintSurface", () => {
  it("획을 원본 바탕 위에 합성하고 블리드가 실제로 적용된다", () => {
    const surface = createSurface();
    const dot: StudioBg3dTexturePaintStroke = {
      color: "#ff0000", size: 0.06, opacity: 1, points: [[0.5, 0.5]],
    };
    expect(surface.commitStroke(dot)).toBe(true);
    expect(surface.currentPaint?.strokes).toHaveLength(1);
    expect(surface.seamBleedApplied).toBe(true);
    const canvas = surface.canvas as unknown as FakeCanvas;
    const center = (16 * 32 + 16) * 4;
    expect(canvas.data[center]).toBe(255); // 빨간 도트
    expect(canvas.data[center + 2]).toBe(0);
    // 바탕(파랑)이 도트 바깥에 남아 있다.
    const corner = 0;
    expect(canvas.data[corner + 2]).toBe(0x99);
    expect(surface.exportPngDataUrl()).toContain("image/png");
  });

  it("점프가 있는 드래그는 획이 둘로 나뉘어 저장된다", () => {
    const surface = createSurface();
    const jumping: StudioBg3dTexturePaintStroke = {
      color: "#00ff00", size: 0.04, opacity: 1,
      points: [[0.1, 0.1], [0.12, 0.1], [0.9, 0.9]],
    };
    expect(surface.commitStroke(jumping)).toBe(true);
    expect(surface.currentPaint?.strokes).toHaveLength(2);
    const removed = surface.undoLastStroke();
    expect(removed?.points).toHaveLength(1);
    expect(surface.currentPaint?.strokes).toHaveLength(1);
  });

  it("컨텍스트 상실 복구는 같은 획으로 다시 그린다", () => {
    const surface = createSurface();
    surface.commitStroke({ color: "#ff0000", size: 0.06, opacity: 1, points: [[0.5, 0.5]] });
    const canvas = surface.canvas as unknown as FakeCanvas;
    canvas.data.fill(0);
    surface.recoverFromContextLoss();
    const center = (16 * 32 + 16) * 4;
    expect(canvas.data[center]).toBe(255);
  });
});

describe("StudioBg3dGlbTexturePaintSession", () => {
  it("아일랜드 점프와 대상 변경에서 획을 끊어 확정한다", () => {
    const committed: { targetKey: string; stroke: StudioBg3dTexturePaintStroke }[] = [];
    const session = new StudioBg3dGlbTexturePaintSession({
      brush: { color: "#111111", size: 0.04, opacity: 1 },
      onCommitStroke: (targetKey, committedStroke) => committed.push({ targetKey, stroke: committedStroke }),
      resolveTargetKey: (intersection) =>
        (intersection as { targetKey?: string }).targetKey ?? null,
    });
    const hit = (u: number, v: number, targetKey = "mesh-0") => ({ uv: { x: u, y: v }, targetKey });
    expect(session.handlePointer("down", hit(0.1, 0.1))).toBe(true);
    expect(session.handlePointer("move", hit(0.12, 0.1))).toBe(true);
    expect(session.handlePointer("move", hit(0.9, 0.9))).toBe(true); // 점프 → 첫 획 확정
    expect(committed).toHaveLength(1);
    expect(committed[0]?.stroke.points).toHaveLength(2);
    expect(session.handlePointer("move", { point: { x: 0, y: 0, z: 0 } })).toBe(false); // UV 없음
    expect(session.handlePointer("up", hit(0.9, 0.9))).toBe(true);
    expect(committed).toHaveLength(2);
    expect(committed[1]?.stroke.points).toHaveLength(1);
    session.cancel();
    expect(session.isDrawing).toBe(false);
  });
});

/* ── 문서·런타임 왕복 ────────────────────────────────────────────────────── */

function hash(index = 1): string {
  return `sha256:${index.toString(16).padStart(64, "0")}`;
}

function documentWithModelPaint(): Record<string, unknown> {
  const base = JSON.parse(JSON.stringify(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT)) as Record<string, unknown>;
  return {
    ...base,
    attachments: [{
      id: "model-1",
      name: "배경 모델 1.glb",
      mime: STUDIO_BG3D_GLB_MIME,
      byteSize: 2_000_000,
      hash: hash(1),
      rights: { status: "owned", commercialUse: true, attributionRequired: false },
      source: "upload",
    }],
    nodes: [{
      id: "node-1",
      name: "GLB 모델",
      kind: "model",
      attachmentId: "model-1",
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      visible: true,
      locked: false,
      castsShadow: true,
      receivesShadow: true,
      parentId: null,
      modelTexturePaint: modelPaint(),
    }],
  };
}

describe("문서·런타임 왕복", () => {
  it("모델 페인트가 엄격 직렬화/파싱을 그대로 통과한다", () => {
    const document = normalizeStudioBg3dSceneDocument(documentWithModelPaint());
    const node = document.nodes[0];
    expect(node?.kind).toBe("model");
    if (node?.kind !== "model") throw new Error("model node expected");
    expect(node.modelTexturePaint?.targets[0]?.targetKey).toBe("mesh-0");
    const serialized = serializeStudioBg3dSceneDocument(document);
    expect(serialized).not.toBeNull();
    const parsed = parseStudioBg3dSceneDocument(serialized!);
    expect(parsed).toEqual(document);
  });

  it("런타임 → 문서 → 런타임 왕복에서 모델 페인트가 유지된다", () => {
    const instance: BgCustomModelInstance = {
      id: "node-1",
      modelId: "storage-1",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      modelTexturePaint: modelPaint(),
    };
    const attachment = {
      id: "model-1",
      name: "배경 모델 1.glb",
      mime: STUDIO_BG3D_GLB_MIME,
      byteSize: 2_000_000,
      hash: hash(1),
      rights: { status: "owned", commercialUse: true, attributionRequired: false },
      source: "upload",
    } as const;
    const adapted = adaptStudioBg3dRuntimeToDocument({
      primitives: [],
      customModels: [instance],
      attachmentByStorageModelId: new Map([["storage-1", attachment]]),
    });
    const node = adapted.document.nodes[0];
    expect(node?.kind).toBe("model");
    if (node?.kind !== "model") throw new Error("model node expected");
    expect(node.modelTexturePaint).toEqual(modelPaint());
    const hydrated = hydrateStudioBg3dDocumentToRuntime({
      document: adapted.document,
      storageModelIdByAttachmentId: new Map([["model-1", "storage-1"]]),
    });
    expect(hydrated.ok).toBe(true);
    expect(hydrated.customModels[0]?.modelTexturePaint).toEqual(modelPaint());
  });

  it("손상된 모델 페인트(비정규 키)는 무손실 계약 위반으로 모델을 진단과 함께 제외한다", () => {
    const instance: BgCustomModelInstance = {
      id: "node-1",
      modelId: "storage-1",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      modelTexturePaint: {
        version: 1,
        targets: [{ targetKey: "bogus", paint: { version: 1, strokes: [stroke] } }],
      },
    };
    const attachment = {
      id: "model-1",
      name: "배경 모델 1.glb",
      mime: STUDIO_BG3D_GLB_MIME,
      byteSize: 2_000_000,
      hash: hash(1),
      rights: { status: "owned", commercialUse: true, attributionRequired: false },
      source: "upload",
    } as const;
    const adapted = adaptStudioBg3dRuntimeToDocument({
      primitives: [],
      customModels: [instance],
      attachmentByStorageModelId: new Map([["storage-1", attachment]]),
    });
    // 정규화 결과가 없는 페이로드는 invalid로, 기존 페이로드들과 같은 정책으로 모델을 제외한다.
    expect(adapted.counts.emittedCustomModels).toBe(0);
    expect(adapted.diagnostics.some((diagnostic) => diagnostic.code === "invalid-custom-model")).toBe(true);
  });
});
