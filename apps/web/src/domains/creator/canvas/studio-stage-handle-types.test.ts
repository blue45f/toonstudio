// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { studioKonvaRuntime } from "../render/studio-konva-runtime";
import {
  refreshStudioRasterPresentationCaches,
  registerStudioRasterPresentationCache,
  prepareStudioRasterCapture,
} from "../render/studio-raster-presentation-cache";
import { registerStudioDrawingPracticeCaptureExclusion } from "../studio-drawing-practice-runtime";
import { studioElementIdOf } from "./studio-canvas-shared-runtime";
import { liveNodeDisplayBounds } from "./studio-canvas-viewport-primitives";
import { snapshotStudioStagePointerBatchMapper } from "./studio-stage-pointer-coordinate";

import type {
  StudioAffineTransformLike,
  StudioImageNodeLike,
  StudioKonvaEventLike,
  StudioLayerCanvasLike,
  StudioLayerLike,
  StudioLineNodeLike,
  StudioNodeLike,
  StudioPoint2D,
  StudioPointerEventLike,
  StudioReadonlyRef,
  StudioRect2D,
  StudioRectNodeLike,
  StudioStageLike,
  StudioTransformerLike,
} from "./studio-stage-handle-types";

/**
 * 순수 네이티브 `<canvas>` / Vello 스테이지 어댑터 모형.
 * Konva 패키지 없이도 모든 Phase 0 중립 인터페이스 계약을 만족함을 증명한다.
 */
class NativeVelloNodeAdapter implements StudioNodeLike {
  protected attrs: Record<string, unknown> = {};
  protected parentNode: StudioNodeLike | null = null;
  protected stageNode: StudioStageLike | null = null;
  protected layerNode: StudioLayerLike | null = null;
  private cached = false;
  private listeners = new Map<string, Set<() => void>>();

  constructor(initialAttrs: Record<string, unknown> = {}) {
    this.attrs = { x: 0, y: 0, width: 0, height: 0, scaleX: 1, scaleY: 1, rotation: 0, visible: true, name: "", id: "", ...initialAttrs };
  }

  attachHierarchy(parent: StudioNodeLike | null, layer: StudioLayerLike | null, stage: StudioStageLike | null): void {
    this.parentNode = parent;
    this.layerNode = layer;
    this.stageNode = stage;
  }

  setCachedForTest(cached: boolean): void {
    this.cached = cached;
  }

  getAttr(attr: string): unknown {
    return this.attrs[attr];
  }

  setAttr(attr: string, value: unknown): this {
    this.attrs[attr] = value;
    return this;
  }

  setAttrs(config?: Record<string, unknown>): this {
    if (config) Object.assign(this.attrs, config);
    return this;
  }

  getParent(): StudioNodeLike | null {
    return this.parentNode;
  }

  getStage(): StudioStageLike | null {
    return this.stageNode;
  }

  getLayer(): StudioLayerLike | null {
    return this.layerNode;
  }

  getClientRect(): StudioRect2D {
    return {
      x: this.x(),
      y: this.y(),
      width: this.width() * this.scaleX(),
      height: this.height() * this.scaleY(),
    };
  }

  isCached(): boolean {
    return this.cached;
  }

  isVisible(): boolean {
    return Boolean(this.attrs.visible);
  }

  id(): string;
  id(value: string | null | undefined): this;
  id(value?: string | null): string | this {
    if (arguments.length === 0) return String(this.attrs.id ?? "");
    this.attrs.id = value ?? "";
    return this;
  }

  name(): string;
  name(value: string | null | undefined): this;
  name(value?: string | null): string | this {
    if (arguments.length === 0) return String(this.attrs.name ?? "");
    this.attrs.name = value ?? "";
    return this;
  }

  visible(): boolean;
  visible(value: boolean | null | undefined): this;
  visible(value?: boolean | null): boolean | this {
    if (arguments.length === 0) return Boolean(this.attrs.visible);
    this.attrs.visible = Boolean(value);
    return this;
  }

  x(): number;
  x(value: number | null | undefined): this;
  x(value?: number | null): number | this {
    if (arguments.length === 0) return Number(this.attrs.x ?? 0);
    this.attrs.x = value ?? 0;
    return this;
  }

  y(): number;
  y(value: number | null | undefined): this;
  y(value?: number | null): number | this {
    if (arguments.length === 0) return Number(this.attrs.y ?? 0);
    this.attrs.y = value ?? 0;
    return this;
  }

  width(): number;
  width(value: number | null | undefined): this;
  width(value?: number | null): number | this {
    if (arguments.length === 0) return Number(this.attrs.width ?? 0);
    this.attrs.width = value ?? 0;
    return this;
  }

  height(): number;
  height(value: number | null | undefined): this;
  height(value?: number | null): number | this {
    if (arguments.length === 0) return Number(this.attrs.height ?? 0);
    this.attrs.height = value ?? 0;
    return this;
  }

  scaleX(): number;
  scaleX(value: number | null | undefined): this;
  scaleX(value?: number | null): number | this {
    if (arguments.length === 0) return Number(this.attrs.scaleX ?? 1);
    this.attrs.scaleX = value ?? 1;
    return this;
  }

  scaleY(): number;
  scaleY(value: number | null | undefined): this;
  scaleY(value?: number | null): number | this {
    if (arguments.length === 0) return Number(this.attrs.scaleY ?? 1);
    this.attrs.scaleY = value ?? 1;
    return this;
  }

  rotation(): number;
  rotation(value: number | null | undefined): this;
  rotation(value?: number | null): number | this {
    if (arguments.length === 0) return Number(this.attrs.rotation ?? 0);
    this.attrs.rotation = value ?? 0;
    return this;
  }

  position(): StudioPoint2D;
  position(value: StudioPoint2D): this;
  position(value?: StudioPoint2D): StudioPoint2D | this {
    if (value === undefined) return { x: this.x(), y: this.y() };
    this.attrs.x = value.x;
    this.attrs.y = value.y;
    return this;
  }

  scale(): StudioPoint2D;
  scale(value: StudioPoint2D | null | undefined): this;
  scale(value?: StudioPoint2D | null): StudioPoint2D | this {
    if (arguments.length === 0) return { x: this.scaleX(), y: this.scaleY() };
    this.attrs.scaleX = value?.x ?? 1;
    this.attrs.scaleY = value?.y ?? 1;
    return this;
  }

  offset(): StudioPoint2D;
  offset(value: StudioPoint2D | null | undefined): this;
  offset(value?: StudioPoint2D | null): StudioPoint2D | this {
    if (arguments.length === 0) {
      return { x: Number(this.attrs.offsetX ?? 0), y: Number(this.attrs.offsetY ?? 0) };
    }
    this.attrs.offsetX = value?.x ?? 0;
    this.attrs.offsetY = value?.y ?? 0;
    return this;
  }

  stopDrag(): void {
    // No-op in headless adapter
  }

  on(evtStr: string, handler: () => void): this {
    const bucket = this.listeners.get(evtStr) ?? new Set<() => void>();
    bucket.add(handler);
    this.listeners.set(evtStr, bucket);
    return this;
  }

  off(evtStr?: string, callback?: () => void): this {
    if (!evtStr) {
      this.listeners.clear();
      return this;
    }
    if (!callback) {
      this.listeners.delete(evtStr);
      return this;
    }
    this.listeners.get(evtStr)?.delete(callback);
    return this;
  }
}

class NativeVelloLayerAdapter extends NativeVelloNodeAdapter implements StudioLayerLike {
  readonly drawCalls = { batch: 0, scene: 0 };
  private readonly surface: StudioLayerCanvasLike;
  private readonly children: StudioNodeLike[] = [];

  constructor(canvasElement: HTMLCanvasElement) {
    super();
    let ratio = 1;
    this.surface = {
      _canvas: canvasElement,
      getPixelRatio: () => ratio,
      setPixelRatio: (next: number) => {
        ratio = next;
      },
    };
  }

  addChild(node: StudioNodeLike): void {
    this.children.push(node);
  }

  batchDraw(): this {
    this.drawCalls.batch += 1;
    return this;
  }

  drawScene(): this {
    this.drawCalls.scene += 1;
    return this;
  }

  getCanvas(): StudioLayerCanvasLike {
    return this.surface;
  }

  find(selector: string | ((node: StudioNodeLike) => boolean)): StudioNodeLike[] {
    if (typeof selector === "function") return this.children.filter(selector);
    return this.children.filter((node) => node.name() === selector || node.id() === selector);
  }

  findOne(selector: string | ((node: StudioNodeLike) => boolean)): StudioNodeLike | undefined {
    return this.find(selector)[0];
  }
}

class NativeVelloStageAdapter extends NativeVelloNodeAdapter implements StudioStageLike {
  readonly content: HTMLDivElement;
  private readonly hostElement: HTMLDivElement;
  private readonly layers: StudioLayerLike[] = [];
  private readonly descendants: StudioNodeLike[] = [];
  private pointer: StudioPoint2D | null = null;
  private readonly stageOriginOffset: StudioPoint2D;

  constructor(hostElement: HTMLDivElement, originOffset: StudioPoint2D = { x: 0, y: 0 }) {
    super({ width: 800, height: 600 });
    this.hostElement = hostElement;
    this.content = hostElement;
    this.stageOriginOffset = originOffset;
    this.stageNode = this;
  }

  addLayer(layer: StudioLayerLike): void {
    this.layers.push(layer);
  }

  registerDescendant(node: StudioNodeLike): void {
    this.descendants.push(node);
  }

  getContent(): HTMLElement {
    return this.hostElement;
  }

  container(): HTMLElement {
    return this.hostElement;
  }

  getAbsoluteTransform(): StudioAffineTransformLike {
    const { x: tx, y: ty } = this.stageOriginOffset;
    const make = (invertSign: number): StudioAffineTransformLike => ({
      copy: () => make(invertSign),
      invert: () => make(-invertSign),
      point: (pt: StudioPoint2D) => ({ x: pt.x + invertSign * tx, y: pt.y + invertSign * ty }),
    });
    return make(1);
  }

  getPointerPosition(): StudioPoint2D | null {
    return this.pointer;
  }

  getRelativePointerPosition(): StudioPoint2D | null {
    return this.pointer;
  }

  setPointersPositions(evt: unknown): void {
    const candidate = evt as Partial<StudioPointerEventLike> | null | undefined;
    if (typeof candidate?.clientX === "number" && typeof candidate?.clientY === "number") {
      this.pointer = { x: candidate.clientX - this.stageOriginOffset.x, y: candidate.clientY - this.stageOriginOffset.y };
    }
  }

  batchDraw(): this {
    return this;
  }

  getLayers(): readonly StudioLayerLike[] {
    return this.layers;
  }

  find(selector: string | ((node: StudioNodeLike) => boolean)): StudioNodeLike[] {
    if (typeof selector === "function") {
      return this.descendants.filter(selector);
    }
    return this.descendants.filter((node) => node.name() === selector || node.id() === selector);
  }

  findOne(selector: string | ((node: StudioNodeLike) => boolean)): StudioNodeLike | undefined {
    return this.find(selector)[0];
  }
}

class NativeVelloTransformerAdapter extends NativeVelloNodeAdapter implements StudioTransformerLike {
  private attached: StudioNodeLike[] = [];
  private transforming = false;

  nodes(): readonly StudioNodeLike[];
  nodes(nodes: readonly StudioNodeLike[]): this;
  nodes(nodes?: readonly StudioNodeLike[]): readonly StudioNodeLike[] | this {
    if (nodes === undefined) return this.attached;
    this.attached = [...nodes];
    return this;
  }

  forceUpdate(): void {
    // No-op in headless adapter
  }

  isTransforming(): boolean {
    return this.transforming;
  }

  stopTransform(): void {
    this.transforming = false;
  }

  detach(): void {
    this.attached = [];
  }

  getActiveAnchor(): string | null {
    return null;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("studio-stage-handle-types Phase 0 neutral contract", () => {
  it("keeps zero external package imports inside studio-stage-handle-types.ts", () => {
    const source = readFileSync(
      path.resolve(__dirname, "studio-stage-handle-types.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/^\s*import\b/mu);
    expect(source).not.toMatch(/\bany\b/u);
    expect(source).not.toContain("@ts-ignore");
    expect(source).not.toContain("@ts-expect-error");
  });

  it("is structurally satisfied by real Konva Stage, Layer, Shape, and Transformer instances", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => new Proxy({
      canvas: null,
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      measureText: () => ({ width: 0 }),
    }, { get: (target, key) => Reflect.get(target, key) ?? (() => undefined) }) as never);

    const container = document.createElement("div");
    const konvaStage = new studioKonvaRuntime.Stage({ container, width: 640, height: 480 });
    const konvaLayer = new studioKonvaRuntime.Layer();
    const konvaRect = new studioKonvaRuntime.Rect({ x: 10, y: 20, width: 120, height: 80 });
    const konvaLine = new studioKonvaRuntime.Line({ points: [0, 0, 50, 50], strokeWidth: 3 });
    const konvaImage = new studioKonvaRuntime.Image({ image: undefined });
    const konvaTransformer = new studioKonvaRuntime.Transformer();

    konvaRect.setAttr("studioElementId", "el-konva-rect");
    konvaLayer.add(konvaRect, konvaLine, konvaImage, konvaTransformer);
    konvaStage.add(konvaLayer);

    // 컴파일 타임 구조적 호환성 증명: 실제 Konva 인스턴스 -> 중립 인터페이스 무캐스트 할당
    const stageHandle: StudioStageLike = konvaStage;
    const layerHandle: StudioLayerLike = konvaLayer;
    const rectHandle: StudioRectNodeLike = konvaRect;
    const lineHandle: StudioLineNodeLike = konvaLine;
    const imageHandle: StudioImageNodeLike = konvaImage;
    const transformerHandle: StudioTransformerLike = konvaTransformer;
    const stageRef: StudioReadonlyRef<StudioStageLike | null> = { current: konvaStage };

    const mouseEvent = new MouseEvent("mousedown", { clientX: 25, clientY: 35 });
    const pointerLike: StudioPointerEventLike = mouseEvent;
    const eventHandle: StudioKonvaEventLike<MouseEvent | TouchEvent> = {
      type: "mousedown",
      target: konvaRect,
      currentTarget: konvaStage,
      evt: mouseEvent,
      pointerId: 1,
      cancelBubble: false,
    };

    expect(stageRef.current).toBe(stageHandle);
    expect(stageHandle.getLayers()).toHaveLength(1);
    expect(layerHandle.getStage()).toBe(konvaStage);
    expect(studioElementIdOf(rectHandle)).toBe("el-konva-rect");
    expect(lineHandle.points()).toEqual([0, 0, 50, 50]);
    expect(imageHandle.image()).toBeUndefined();
    expect(transformerHandle.isTransforming()).toBe(false);
    expect(pointerLike.clientX).toBe(25);
    expect(eventHandle.target).toBe(konvaRect);

    konvaStage.destroy();
  });

  it("works end-to-end with pure native canvas/Vello adapters across decoupled consumers", () => {
    const hostDiv = document.createElement("div");
    hostDiv.getBoundingClientRect = () => ({
      left: 50,
      top: 20,
      width: 400,
      height: 300,
      right: 450,
      bottom: 320,
      x: 50,
      y: 20,
      toJSON: () => ({}),
    });
    Object.defineProperty(hostDiv, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(hostDiv, "clientHeight", { value: 300, configurable: true });

    const stage = new NativeVelloStageAdapter(hostDiv, { x: 10, y: 5 });
    const layer = new NativeVelloLayerAdapter(document.createElement("canvas"));
    layer.attachHierarchy(stage, null, stage);
    stage.addLayer(layer);

    const group = new NativeVelloNodeAdapter({ studioElementId: "el-vello-1", x: 12, y: 16, width: 100, height: 60 });
    group.attachHierarchy(layer, layer, stage);
    const child = new NativeVelloNodeAdapter({ x: 4, y: 8, width: 40, height: 24 });
    child.attachHierarchy(group, layer, stage);
    stage.registerDescendant(group);
    stage.registerDescendant(child);

    const transformer = new NativeVelloTransformerAdapter();
    transformer.nodes([group]);
    expect(transformer.nodes()).toEqual([group]);
    transformer.detach();
    expect(transformer.nodes()).toEqual([]);

    // 1. 좌표 매퍼 검증
    const mapper = snapshotStudioStagePointerBatchMapper(stage);
    expect(mapper.pointFor({ clientX: 150, clientY: 120 })).toEqual({ x: 90, y: 95 });

    // 2. 요소 ID 탐색 및 바운즈 조회 검증
    expect(studioElementIdOf(child)).toBe("el-vello-1");
    expect(liveNodeDisplayBounds(group, layer, { x: 0, y: 0, w: 0, h: 0 })).toEqual({
      x: 12,
      y: 16,
      w: 100,
      h: 60,
    });

    // 3. 래스터 캐시 갱신 및 캡처 제외 훅 검증
    group.setCachedForTest(true);
    const refresh = vi.fn(() => true);
    const releaseCache = registerStudioRasterPresentationCache(group, refresh);
    expect(refreshStudioRasterPresentationCaches(child)).toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
    releaseCache();

    const releaseExclude = registerStudioDrawingPracticeCaptureExclusion(child);
    const restoreCapture = prepareStudioRasterCapture(stage, 2);
    expect(child.visible()).toBe(false);
    restoreCapture();
    expect(child.visible()).toBe(true);
    releaseExclude();
  });
});
