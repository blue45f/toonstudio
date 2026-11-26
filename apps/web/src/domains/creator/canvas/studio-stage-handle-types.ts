/**
 * 렌더러 중립 Studio Stage / Layer / Node / Transformer / Event 구조적 계약.
 *
 * Phase 0 디커플링의 핵심 경계 모듈로, 외부 패키지(`konva`, `react-konva`, `react`, `three`,
 * `pixi.js`) 의존성이 전혀 없다. 기존 Konva 런타임 객체와 향후 네이티브 `<canvas>` / Vello
 * Stage 어댑터가 동일한 구조적 인터페이스를 만족하도록 설계한다.
 */

export interface StudioPoint2D {
  x: number;
  y: number;
}

export interface StudioRect2D {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StudioSize2D {
  width: number;
  height: number;
}

export interface StudioToCanvasConfig {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly pixelRatio?: number;
  readonly imageSmoothingEnabled?: boolean;
  readonly mimeType?: string;
  readonly quality?: number;
}

export interface StudioClipContextLike {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  rect(x: number, y: number, width: number, height: number): void;
  closePath(): void;
}

export interface StudioClipConfigLike {
  clipX?: number;
  clipY?: number;
  clipWidth?: number;
  clipHeight?: number;
  clipFunc?: (context: StudioClipContextLike) => void;
}

export type StudioCompositeOperation =
  | "" | "source-over" | "source-in" | "source-out" | "source-atop"
  | "destination-over" | "destination-in" | "destination-out" | "destination-atop"
  | "lighter" | "copy" | "xor" | "multiply" | "screen" | "overlay" | "darken" | "lighten"
  | "color-dodge" | "color-burn" | "hard-light" | "soft-light" | "difference" | "exclusion"
  | "hue" | "saturation" | "color" | "luminosity";

export interface StudioAffineTransformLike {
  copy(): StudioAffineTransformLike;
  invert(): StudioAffineTransformLike;
  point(point: StudioPoint2D): StudioPoint2D;
}

export interface StudioClientRectConfig {
  readonly relativeTo?: StudioNodeLike;
  readonly skipTransform?: boolean;
  readonly skipShadow?: boolean;
  readonly skipStroke?: boolean;
}

/**
 * 읽기 전용 ref 래퍼 계약.
 * React 19 `RefObject<T>` / `MutableRefObject<T>`는 `current`가 가변(invariant)이므로,
 * `current`를 읽기만 하는 소비자가 `Konva.Layer`·`Konva.Rect`·네이티브 어댑터 ref를
 * 공변(covariant)하게 안전 수용할 수 있게 한다.
 */
export interface StudioReadonlyRef<T> {
  readonly current: T;
}

/**
 * Konva DOM 이벤트와 네이티브 Pointer Events v3(`getCoalescedEvents`/`getPredictedEvents`)를
 * 모두 수용하는 렌더러 중립 포인터·입력 이벤트 계약.
 */
export interface StudioPointerEventLike {
  readonly type: string;
  readonly target: EventTarget | null;
  readonly currentTarget?: EventTarget | null;
  readonly timeStamp?: number;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly pointerId?: number;
  readonly pointerType?: string;
  readonly isPrimary?: boolean;
  readonly button?: number;
  readonly buttons?: number;
  readonly pressure?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly twist?: number;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly detail?: number;
  preventDefault?(): void;
  stopPropagation?(): void;
  getCoalescedEvents?(): PointerEvent[];
  getPredictedEvents?(): PointerEvent[];
}

export interface StudioLayerCanvasLike {
  readonly _canvas: HTMLCanvasElement;
  getPixelRatio(): number;
  setPixelRatio(pixelRatio: number): void;
}

export interface StudioNodeLike {
  getAttr(attr: string): unknown;
  setAttr(attr: string, value: unknown): unknown;
  setAttrs(config?: Record<string, unknown>): unknown;
  getParent(): StudioNodeLike | null;
  getStage(): StudioStageLike | null;
  getLayer(): StudioLayerLike | null;
  getClientRect(config?: StudioClientRectConfig): StudioRect2D;
  isCached(): boolean;
  isVisible(): boolean;
  id(): string;
  id(value: string | null | undefined): unknown;
  name(): string;
  name(value: string | null | undefined): unknown;
  visible(): boolean;
  visible(value: boolean | null | undefined): unknown;
  x(): number;
  x(value: number | null | undefined): unknown;
  y(): number;
  y(value: number | null | undefined): unknown;
  width(): number;
  width(value: number | null | undefined): unknown;
  height(): number;
  height(value: number | null | undefined): unknown;
  scaleX(): number;
  scaleX(value: number | null | undefined): unknown;
  scaleY(): number;
  scaleY(value: number | null | undefined): unknown;
  rotation(): number;
  rotation(value: number | null | undefined): unknown;
  position(): StudioPoint2D;
  position(value: StudioPoint2D): unknown;
  scale(): StudioPoint2D;
  scale(value: StudioPoint2D | null | undefined): unknown;
  offset(): StudioPoint2D;
  offset(value: StudioPoint2D | null | undefined): unknown;
  stopDrag(evt?: unknown): void;
  on(evtStr: string, handler: () => void): unknown;
  off(evtStr?: string, callback?: () => void): unknown;
}

export type StudioRectNodeLike = StudioNodeLike;

export interface StudioLineNodeLike extends StudioNodeLike {
  points(): number[];
  points(value: number[] | ArrayLike<number> | null | undefined): unknown;
  strokeWidth(): number;
  strokeWidth(value: number | null | undefined): unknown;
}

export interface StudioImageNodeLike extends StudioNodeLike {
  image(): CanvasImageSource | undefined;
  image(value: CanvasImageSource | null | undefined): unknown;
}

export interface StudioLayerLike extends StudioNodeLike {
  batchDraw(): unknown;
  draw?(): unknown;
  drawScene(): unknown;
  getCanvas(): StudioLayerCanvasLike;
  getNativeCanvasElement?(): HTMLCanvasElement;
  clear?(bounds?: StudioRect2D): unknown;
  find(selector: string | ((node: StudioNodeLike) => boolean)): StudioNodeLike[];
  findOne(selector: string | ((node: StudioNodeLike) => boolean)): StudioNodeLike | undefined;
}

export interface StudioStageLike extends StudioNodeLike {
  readonly content?: HTMLElement | null;
  getContent(): HTMLElement;
  container(): HTMLElement;
  getAbsoluteTransform(top?: StudioNodeLike | null): StudioAffineTransformLike;
  getPointerPosition(): StudioPoint2D | null;
  getRelativePointerPosition(): StudioPoint2D | null;
  setPointersPositions(evt: unknown): void;
  batchDraw(): unknown;
  getLayers(): readonly StudioLayerLike[];
  find(selector: string | ((node: StudioNodeLike) => boolean)): StudioNodeLike[];
  findOne(selector: string | ((node: StudioNodeLike) => boolean)): StudioNodeLike | undefined;
}

export interface StudioTransformerLike extends StudioNodeLike {
  nodes(): readonly StudioNodeLike[];
  nodes(nodes: readonly StudioNodeLike[]): unknown;
  forceUpdate(): void;
  isTransforming(): boolean;
  stopTransform(): void;
  detach(): void;
  getActiveAnchor(): string | null;
}

export interface StudioKonvaEventLike<
  TEvent = StudioPointerEventLike,
  TTarget extends StudioNodeLike = StudioNodeLike,
  TCurrentTarget extends StudioNodeLike = StudioNodeLike,
> {
  readonly type: string;
  readonly target: TTarget;
  readonly evt: TEvent;
  readonly pointerId?: number;
  readonly currentTarget: TCurrentTarget;
  cancelBubble: boolean;
  readonly child?: StudioNodeLike;
}

export interface StudioShapeLike extends StudioNodeLike {
  getAbsoluteScale(): StudioPoint2D;
}

export interface StudioCircleNodeLike extends StudioNodeLike {
  radius(): number;
  radius(value: number | null | undefined): unknown;
}

export interface StudioCanvasContextLike {
  _context?: CanvasRenderingContext2D;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  lineWidth: number;
  imageSmoothingEnabled?: boolean;
  imageSmoothingQuality?: ImageSmoothingQuality;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  rect(x: number, y: number, width: number, height: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterClockwise?: boolean): void;
  ellipse?(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, counterClockwise?: boolean): void;
  fill(fillRule?: CanvasFillRule): void;
  fill(path: Path2D, fillRule?: CanvasFillRule): void;
  stroke(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
  drawImage(image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient;
  setAttr?(attr: string, val: unknown): void;
  getTransform?: () => DOMMatrix;
}

export interface StudioShapeDrawContextLike extends StudioCanvasContextLike {
  getCanvas(): { getPixelRatio(): number };
  fillStrokeShape(shape: StudioShapeLike): void;
}

export interface StudioSceneNodeLike extends StudioNodeLike {
  getParent(): StudioContainerLike | null;
  getLayer(): StudioSceneLayerLike | null;
  getStage(): StudioExportStageLike | null;
  opacity(): number;
  opacity(value: number | null | undefined): unknown;
  zIndex(): number;
  zIndex(value: number): unknown;
  draggable(): boolean;
  draggable(value: boolean): unknown;
  isDragging(): boolean;
  getClassName(): string;
  getAbsolutePosition(): StudioPoint2D;
  absolutePosition(): StudioPoint2D;
  absolutePosition(value: StudioPoint2D): unknown;
  moveTo(newContainer: StudioContainerLike): unknown;
  getTransform(): StudioAffineTransformLike;
  globalCompositeOperation(): StudioCompositeOperation;
  globalCompositeOperation(value: StudioCompositeOperation): unknown;
  toCanvas(config?: StudioToCanvasConfig): HTMLCanvasElement;
  toDataURL(config?: StudioToCanvasConfig): string;
}

export interface StudioContainerLike extends StudioSceneNodeLike {
  getChildren(filterFunc?: (node: StudioSceneNodeLike) => boolean): readonly StudioSceneNodeLike[];
  add?(...children: StudioSceneNodeLike[]): unknown;
}

export type StudioGroupNodeLike = StudioContainerLike;

export interface StudioSceneLayerLike extends StudioContainerLike {
  batchDraw(): unknown;
  draw(): unknown;
  drawScene(): unknown;
  getCanvas(): StudioLayerCanvasLike;
  getNativeCanvasElement?(): HTMLCanvasElement;
  clear?(bounds?: StudioRect2D): unknown;
  find(selector: string | ((node: StudioSceneNodeLike) => boolean)): StudioSceneNodeLike[];
  findOne(selector: string | ((node: StudioSceneNodeLike) => boolean)): StudioSceneNodeLike | undefined;
}

export interface StudioExportStageLike extends StudioSceneNodeLike {
  readonly content?: HTMLElement | null;
  getContent(): HTMLElement;
  container(): HTMLElement;
  getAbsoluteTransform(top?: StudioNodeLike | null): StudioAffineTransformLike;
  getPointerPosition(): StudioPoint2D | null;
  getRelativePointerPosition(): StudioPoint2D | null;
  setPointersPositions(evt: unknown): void;
  batchDraw(): unknown;
  size(): StudioSize2D;
  size(box: StudioSize2D): unknown;
  draw(): unknown;
  getLayers(): readonly StudioSceneLayerLike[];
  find(selector: string | ((node: StudioSceneNodeLike) => boolean)): StudioSceneNodeLike[];
  findOne(selector: string | ((node: StudioSceneNodeLike) => boolean)): StudioSceneNodeLike | undefined;
}

export interface StudioSceneTransformerLike extends StudioSceneNodeLike {
  nodes(): readonly StudioSceneNodeLike[];
  nodes(nodes: readonly StudioSceneNodeLike[]): unknown;
  forceUpdate(): void;
  isTransforming(): boolean;
  stopTransform(): void;
  detach(): void;
  getActiveAnchor(): string | null;
}
