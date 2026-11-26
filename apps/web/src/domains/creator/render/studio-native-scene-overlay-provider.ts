/**
 * 제로 의존성 네이티브 Canvas 2D 선택 오버레이 프로바이더.
 *
 * `pixi.js`(76.68 MiB) 없이 `StudioPixiSceneOverlayHost`가 필요로 하는 전용 투명 선택
 * 오버레이(`pointer-events: none`, `documentTransform` 동기화, 비스케일링 스트로크,
 * 결정적 `zIndex`/`documentId` 정렬, `hitTest`, DPR 리사이즈, 멱등 `destroy`)를 제공한다.
 */

import {
  STUDIO_SCENE_PROVIDER_CONTRACT_REVISION,
  getStudioSceneShapeBounds,
  resolveStudioSceneDocumentTransform,
  studioSceneShapeContainsPoint,
  validateStudioSceneSelectableOverlay,
  validateStudioSceneViewport,
  type StudioSceneDocumentTransform,
  type StudioSceneHitResult,
  type StudioSceneOverlayIdentity,
  type StudioScenePoint,
  type StudioSceneSelectableOverlay,
  type StudioSceneViewportMetrics,
} from "../studio-scene-provider";

export const STUDIO_NATIVE_SCENE_OVERLAY_CANVAS_MARKER =
  "dedicated-native-canvas2d-overlay" as const;
export const STUDIO_NATIVE_SCENE_OVERLAY_LABEL_PREFIX =
  "studio-document:" as const;

const DEFAULT_FILL = Object.freeze({ color: 0x2563eb, alpha: 0.08 });
const DEFAULT_STROKE = Object.freeze({
  color: 0x2563eb,
  alpha: 0.92,
  width: 1,
});

export interface StudioNativeSceneOverlayReceipt {
  readonly providerId: "studio-native-canvas2d";
  readonly selectedRenderer: "canvas2d";
  readonly attemptedRenderer: "canvas2d";
  readonly activeRenderer: "canvas2d";
  readonly attemptCount: 1;
  readonly failureIsolation: "fail-closed";
  readonly surface: {
    readonly ownership: "exclusive-dedicated-overlay";
    readonly contextSharing: "forbidden";
    readonly background: "transparent";
  };
}

export interface StudioNativeSceneOverlayProvider {
  readonly contractRevision: typeof STUDIO_SCENE_PROVIDER_CONTRACT_REVISION;
  readonly canvas: HTMLCanvasElement;
  readonly receipt: StudioNativeSceneOverlayReceipt;
  readonly viewport: StudioSceneViewportMetrics;
  readonly destroyed: boolean;

  resize(viewport: StudioSceneViewportMetrics): void;
  upsertSelectableOverlay(
    overlay: StudioSceneSelectableOverlay,
  ): StudioSceneOverlayIdentity;
  removeSelectableOverlay(documentId: string): boolean;
  documentIdForLabel(label: string): string | null;
  hitTest(point: StudioScenePoint): StudioSceneHitResult | null;
  render(): void;
  destroy(): void;
}

export interface CreateStudioNativeSceneOverlayProviderOptions
  extends StudioSceneViewportMetrics {
  readonly ownerDocument?: Document;
}

interface NativeOverlayEntry {
  readonly label: string;
  overlay: StudioSceneSelectableOverlay;
}

function requireOwnerDocument(ownerDocument?: Document): Document {
  if (ownerDocument) return ownerDocument;
  if (typeof document === "undefined") {
    throw new Error(
      "A DOM Document is required to create the dedicated Studio scene overlay.",
    );
  }
  return document;
}

function createDedicatedOverlayCanvas(ownerDocument: Document): HTMLCanvasElement {
  const canvas = ownerDocument.createElement("canvas");
  canvas.dataset.studioSceneOverlay = STUDIO_NATIVE_SCENE_OVERLAY_CANVAS_MARKER;
  canvas.dataset.studioSceneInputAuthority = "inactive";
  canvas.setAttribute("aria-hidden", "true");
  canvas.setAttribute("role", "presentation");
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.display = "block";
  canvas.style.background = "transparent";
  canvas.style.pointerEvents = "none";
  canvas.style.touchAction = "none";
  return canvas;
}

function applyCanvasViewport(
  canvas: HTMLCanvasElement,
  viewport: StudioSceneViewportMetrics,
): void {
  const pixelWidth = Math.max(1, Math.round(viewport.width * viewport.dpr));
  const pixelHeight = Math.max(1, Math.round(viewport.height * viewport.dpr));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
}

function labelForDocumentId(documentId: string): string {
  return `${STUDIO_NATIVE_SCENE_OVERLAY_LABEL_PREFIX}${encodeURIComponent(documentId)}`;
}

function cloneOverlay(
  overlay: StudioSceneSelectableOverlay,
): StudioSceneSelectableOverlay {
  const shape =
    overlay.shape.kind === "polygon"
      ? {
          kind: "polygon" as const,
          points: overlay.shape.points.map((point) => ({
            x: point.x,
            y: point.y,
          })),
        }
      : {
          kind: overlay.shape.kind,
          bounds: { ...overlay.shape.bounds },
        };

  return {
    documentId: overlay.documentId,
    shape,
    zIndex: overlay.zIndex,
    visible: overlay.visible,
    selectable: overlay.selectable,
    opacity: overlay.opacity,
    fill: overlay.fill ? { ...overlay.fill } : undefined,
    stroke: overlay.stroke ? { ...overlay.stroke } : undefined,
  };
}

function compareOverlayEntries(
  left: NativeOverlayEntry,
  right: NativeOverlayEntry,
): number {
  const zDifference = left.overlay.zIndex - right.overlay.zIndex;
  return zDifference !== 0
    ? zDifference
    : left.overlay.documentId.localeCompare(right.overlay.documentId);
}

function chromeStrokeScale(transform: StudioSceneDocumentTransform): number {
  const magnitude = Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY));
  return magnitude > 0 ? 1 / magnitude : 1;
}

function rgb24ToRgbaCss(color: number, alpha: number): string {
  const r = (color >>> 16) & 0xff;
  const g = (color >>> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawOverlayShape(
  context: CanvasRenderingContext2D,
  overlay: StudioSceneSelectableOverlay,
  strokeScale: number,
): void {
  if (overlay.visible === false) return;
  const fill = overlay.fill ?? DEFAULT_FILL;
  const stroke = overlay.stroke ?? DEFAULT_STROKE;

  context.save();
  context.globalAlpha = overlay.opacity ?? 1;
  context.beginPath();

  if (overlay.shape.kind === "rect") {
    const { x, y, width, height } = overlay.shape.bounds;
    context.rect(x, y, width, height);
  } else if (overlay.shape.kind === "ellipse") {
    const { x, y, width, height } = overlay.shape.bounds;
    const radiusX = width / 2;
    const radiusY = height / 2;
    context.ellipse(x + radiusX, y + radiusY, radiusX, radiusY, 0, 0, Math.PI * 2);
  } else {
    const [first, ...rest] = overlay.shape.points;
    if (first) {
      context.moveTo(first.x, first.y);
      for (const point of rest) {
        context.lineTo(point.x, point.y);
      }
      context.closePath();
    }
  }

  if (fill.alpha > 0) {
    context.fillStyle = rgb24ToRgbaCss(fill.color, fill.alpha);
    context.fill();
  }
  if (stroke.alpha > 0 && stroke.width > 0) {
    context.strokeStyle = rgb24ToRgbaCss(stroke.color, stroke.alpha);
    context.lineWidth = stroke.width * strokeScale;
    context.stroke();
  }
  context.restore();
}

const NATIVE_RECEIPT: StudioNativeSceneOverlayReceipt = Object.freeze({
  providerId: "studio-native-canvas2d",
  selectedRenderer: "canvas2d",
  attemptedRenderer: "canvas2d",
  activeRenderer: "canvas2d",
  attemptCount: 1,
  failureIsolation: "fail-closed",
  surface: Object.freeze({
    ownership: "exclusive-dedicated-overlay",
    contextSharing: "forbidden",
    background: "transparent",
  }),
});

class NativeCanvas2dSceneOverlayProvider implements StudioNativeSceneOverlayProvider {
  readonly contractRevision = STUDIO_SCENE_PROVIDER_CONTRACT_REVISION;
  readonly canvas: HTMLCanvasElement;
  readonly receipt = NATIVE_RECEIPT;

  private readonly context: CanvasRenderingContext2D;
  private readonly entries = new Map<string, NativeOverlayEntry>();
  private readonly documentIdsByLabel = new Map<string, string>();
  private currentViewport: StudioSceneViewportMetrics;
  private isDestroyed = false;

  constructor(
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    viewport: StudioSceneViewportMetrics,
  ) {
    this.canvas = canvas;
    this.context = context;
    this.currentViewport = Object.freeze({ ...viewport });
  }

  get viewport(): StudioSceneViewportMetrics {
    return this.currentViewport;
  }

  get destroyed(): boolean {
    return this.isDestroyed;
  }

  private assertAlive(): void {
    if (this.isDestroyed) {
      throw new Error("The Studio native scene overlay provider has been destroyed.");
    }
  }

  resize(viewport: StudioSceneViewportMetrics): void {
    this.assertAlive();
    validateStudioSceneViewport(viewport);
    applyCanvasViewport(this.canvas, viewport);
    this.currentViewport = Object.freeze({ ...viewport });
  }

  upsertSelectableOverlay(
    overlay: StudioSceneSelectableOverlay,
  ): StudioSceneOverlayIdentity {
    this.assertAlive();
    validateStudioSceneSelectableOverlay(overlay);
    const storedOverlay = cloneOverlay(overlay);
    const existing = this.entries.get(storedOverlay.documentId);
    const label = existing?.label ?? labelForDocumentId(storedOverlay.documentId);
    if (!existing) {
      this.documentIdsByLabel.set(label, storedOverlay.documentId);
    }
    this.entries.set(storedOverlay.documentId, {
      label,
      overlay: storedOverlay,
    });
    return Object.freeze({
      documentId: storedOverlay.documentId,
      label,
    });
  }

  removeSelectableOverlay(documentId: string): boolean {
    this.assertAlive();
    const entry = this.entries.get(documentId);
    if (!entry) return false;
    this.entries.delete(documentId);
    this.documentIdsByLabel.delete(entry.label);
    return true;
  }

  documentIdForLabel(label: string): string | null {
    this.assertAlive();
    return this.documentIdsByLabel.get(label) ?? null;
  }

  hitTest(point: StudioScenePoint): StudioSceneHitResult | null {
    this.assertAlive();
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;

    const topFirst = [...this.entries.values()].sort((left, right) =>
      compareOverlayEntries(right, left),
    );
    for (const entry of topFirst) {
      if (
        entry.overlay.visible === false ||
        entry.overlay.selectable === false ||
        !studioSceneShapeContainsPoint(entry.overlay.shape, point)
      ) {
        continue;
      }
      return Object.freeze({
        documentId: entry.overlay.documentId,
        label: entry.label,
        zIndex: entry.overlay.zIndex,
        shapeKind: entry.overlay.shape.kind,
        point: Object.freeze({ x: point.x, y: point.y }),
        bounds: Object.freeze(getStudioSceneShapeBounds(entry.overlay.shape)),
      });
    }
    return null;
  }

  render(): void {
    this.assertAlive();
    const ctx = this.context;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.entries.size === 0) return;

    const transform = resolveStudioSceneDocumentTransform(this.currentViewport);
    const strokeScale = chromeStrokeScale(transform);
    const orderedEntries = [...this.entries.values()].sort(compareOverlayEntries);

    ctx.save();
    ctx.scale(this.currentViewport.dpr, this.currentViewport.dpr);
    ctx.translate(transform.offsetX, transform.offsetY);
    if (transform.rotation !== 0) {
      ctx.rotate((transform.rotation * Math.PI) / 180);
    }
    ctx.scale(transform.scaleX, transform.scaleY);
    for (const entry of orderedEntries) {
      drawOverlayShape(ctx, entry.overlay, strokeScale);
    }
    ctx.restore();
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.entries.clear();
    this.documentIdsByLabel.clear();
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.canvas.remove();
  }
}

export async function createStudioNativeSceneOverlayProvider(
  options: CreateStudioNativeSceneOverlayProviderOptions,
): Promise<StudioNativeSceneOverlayProvider> {
  const viewport: StudioSceneViewportMetrics = {
    width: options.width,
    height: options.height,
    dpr: options.dpr,
    ...(options.documentTransform
      ? { documentTransform: options.documentTransform }
      : {}),
  };
  validateStudioSceneViewport(viewport);

  const ownerDocument = requireOwnerDocument(options.ownerDocument);
  const canvas = createDedicatedOverlayCanvas(ownerDocument);
  applyCanvasViewport(canvas, viewport);

  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    throw new Error(
      "2D canvas context is unavailable for the dedicated Studio scene overlay.",
    );
  }

  return new NativeCanvas2dSceneOverlayProvider(canvas, context, viewport);
}
