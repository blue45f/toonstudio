/**
 * 제로 의존성 네이티브 선택 런타임의 공용 타입·상수·Mat 핸들 정의.
 */

export interface StudioNativeSelectionMat {
  readonly rows: number;
  readonly cols: number;
  readonly data: Uint8Array;
  readonly data32S: Int32Array;
  delete(): void;
}

export interface StudioNativeSelectionMatVector {
  size(): number;
  get(index: number): StudioNativeSelectionMat;
  delete(): void;
}

export interface StudioNativeSelectionPoint {
  readonly x: number;
  readonly y: number;
}

export interface StudioNativeSelectionRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioNativeSelectionSize {
  readonly width: number;
  readonly height: number;
}

export interface StudioNativeSelectionRuntime {
  readonly CV_8UC1: number;
  readonly CV_8UC4: number;
  readonly COLOR_RGBA2RGB: number;
  readonly GC_FGD: number;
  readonly GC_PR_FGD: number;
  readonly GC_INIT_WITH_RECT: number;
  readonly FLOODFILL_FIXED_RANGE: number;
  readonly FLOODFILL_MASK_ONLY: number;
  readonly MORPH_OPEN: number;
  readonly MORPH_ELLIPSE: number;
  readonly THRESH_BINARY: number;
  readonly RETR_CCOMP: number;
  readonly CHAIN_APPROX_SIMPLE: number;
  readonly BORDER_CONSTANT: number;

  readonly Mat: new (rows?: number, cols?: number, type?: number) => StudioNativeSelectionMat;
  readonly MatVector: new () => StudioNativeSelectionMatVector;
  readonly Point: new (x: number, y: number) => StudioNativeSelectionPoint;
  readonly Rect: new (
    x?: number,
    y?: number,
    width?: number,
    height?: number,
  ) => StudioNativeSelectionRect;
  readonly Scalar: new (
    v0?: number,
    v1?: number,
    v2?: number,
    v3?: number,
  ) => readonly number[];
  readonly Size: new (width: number, height: number) => StudioNativeSelectionSize;

  matFromArray(
    rows: number,
    cols: number,
    type: number,
    array: ArrayLike<number>,
  ): StudioNativeSelectionMat;
  cvtColor(
    src: StudioNativeSelectionMat,
    dst: StudioNativeSelectionMat,
    code: number,
  ): void;
  grabCut(
    img: StudioNativeSelectionMat,
    mask: StudioNativeSelectionMat,
    rect: StudioNativeSelectionRect,
    bgdModel: StudioNativeSelectionMat,
    fgdModel: StudioNativeSelectionMat,
    iterCount: number,
    mode: number,
  ): void;
  floodFill(
    image: StudioNativeSelectionMat,
    mask: StudioNativeSelectionMat,
    seedPoint: StudioNativeSelectionPoint,
    newVal: readonly number[],
    rect: StudioNativeSelectionRect,
    loDiff: readonly number[],
    upDiff: readonly number[],
    flags: number,
  ): number;
  GaussianBlur(
    src: StudioNativeSelectionMat,
    dst: StudioNativeSelectionMat,
    ksize: StudioNativeSelectionSize,
    sigmaX: number,
    sigmaY?: number,
  ): void;
  morphologyEx(
    src: StudioNativeSelectionMat,
    dst: StudioNativeSelectionMat,
    op: number,
    kernel: StudioNativeSelectionMat,
    anchor: StudioNativeSelectionPoint,
    iterations: number,
    borderType: number,
  ): void;
  getStructuringElement(
    shape: number,
    ksize: StudioNativeSelectionSize,
  ): StudioNativeSelectionMat;
  threshold(
    src: StudioNativeSelectionMat,
    dst: StudioNativeSelectionMat,
    thresh: number,
    maxval: number,
    type: number,
  ): number;
  findContours(
    image: StudioNativeSelectionMat,
    contours: StudioNativeSelectionMatVector,
    hierarchy: StudioNativeSelectionMat,
    mode: number,
    method: number,
  ): void;
  approxPolyDP(
    curve: StudioNativeSelectionMat,
    approxCurve: StudioNativeSelectionMat,
    epsilon: number,
    closed: boolean,
  ): void;
  setRNGSeed(seed: number): void;
}

export const NATIVE_CV = Object.freeze({
  CV_8UC1: 0,
  CV_8UC3: 16,
  CV_8UC4: 24,
  CV_32SC2: 12,
  CV_32SC4: 28,
  COLOR_RGBA2RGB: 1,
  GC_BGD: 0,
  GC_FGD: 1,
  GC_PR_BGD: 2,
  GC_PR_FGD: 3,
  GC_INIT_WITH_RECT: 0,
  FLOODFILL_FIXED_RANGE: 1 << 16,
  FLOODFILL_MASK_ONLY: 1 << 17,
  MORPH_OPEN: 2,
  MORPH_ELLIPSE: 2,
  THRESH_BINARY: 0,
  RETR_CCOMP: 2,
  CHAIN_APPROX_SIMPLE: 2,
  BORDER_CONSTANT: 0,
} as const);

function matLayout(type: number): { readonly channels: number; readonly elemBytes: number } {
  switch (type) {
    case NATIVE_CV.CV_8UC1:
      return { channels: 1, elemBytes: 1 };
    case NATIVE_CV.CV_8UC3:
      return { channels: 3, elemBytes: 1 };
    case NATIVE_CV.CV_8UC4:
      return { channels: 4, elemBytes: 1 };
    case NATIVE_CV.CV_32SC2:
      return { channels: 2, elemBytes: 4 };
    case NATIVE_CV.CV_32SC4:
      return { channels: 4, elemBytes: 4 };
    default:
      return { channels: 1, elemBytes: 1 };
  }
}

export class NativeMat implements StudioNativeSelectionMat {
  rows = 0;
  cols = 0;
  matType: number = NATIVE_CV.CV_8UC1;
  channels = 1;
  data = new Uint8Array(0);
  data32S = new Int32Array(0);

  constructor(rows = 0, cols = 0, type: number = NATIVE_CV.CV_8UC1) {
    if (rows > 0 && cols > 0) {
      this.allocate(rows, cols, type);
    }
  }

  allocate(rows: number, cols: number, type: number): void {
    const layout = matLayout(type);
    const byteLength = rows * cols * layout.channels * layout.elemBytes;
    const buffer = new ArrayBuffer(byteLength);
    this.rows = rows;
    this.cols = cols;
    this.matType = type;
    this.channels = layout.channels;
    this.data = new Uint8Array(buffer);
    this.data32S = byteLength % 4 === 0 ? new Int32Array(buffer) : new Int32Array(0);
  }

  delete(): void {
    this.rows = 0;
    this.cols = 0;
    this.data = new Uint8Array(0);
    this.data32S = new Int32Array(0);
  }
}

export class NativeMatVector implements StudioNativeSelectionMatVector {
  private readonly items: NativeMat[] = [];

  push(mat: NativeMat): void {
    this.items.push(mat);
  }

  clear(): void {
    this.items.length = 0;
  }

  size(): number {
    return this.items.length;
  }

  get(index: number): StudioNativeSelectionMat {
    const src = this.items[index];
    if (!src) {
      throw new RangeError(`MatVector index ${index} out of bounds`);
    }
    const clone = new NativeMat(src.rows, src.cols, src.matType);
    clone.data.set(src.data);
    return clone;
  }

  delete(): void {
    for (const item of this.items) item.delete();
    this.items.length = 0;
  }
}

export class NativePoint implements StudioNativeSelectionPoint {
  constructor(
    readonly x: number,
    readonly y: number,
  ) {}
}

export class NativeRect implements StudioNativeSelectionRect {
  constructor(
    readonly x = 0,
    readonly y = 0,
    readonly width = 0,
    readonly height = 0,
  ) {}
}

export class NativeSize implements StudioNativeSelectionSize {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}
}

export class NativeScalar extends Array<number> {
  constructor(v0 = 0, v1 = 0, v2 = 0, v3 = 0) {
    super(4);
    this[0] = v0;
    this[1] = v1;
    this[2] = v2;
    this[3] = v3;
  }
}

export function asNativeMat(mat: StudioNativeSelectionMat, label: string): NativeMat {
  if (!(mat instanceof NativeMat)) {
    throw new TypeError(`${label} must be a NativeMat instance`);
  }
  return mat;
}
