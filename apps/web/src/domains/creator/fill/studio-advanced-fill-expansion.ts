/**
 * Studio Advanced Fill Expansion — CSP `영역 확장 방식(FillExpandType)`,
 * `좁은 영역 스며들기(FillSoakIntoNarrowArea)`, `지정색 채우지 않기(FillUseNotStartColor)`,
 * 참조 레이어 역할별 제외 필터 순수 엔진.
 *
 * 역공학 근거(REA Ghidra clean-room 재구현, 상용 코드/리소스 무포함):
 * - evidence_id: `ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`
 * - evidence_id: `ev_9e97a121e10ceaa075c9f4fb0b21c7bf2bd090aa4a639830aa6f070bec16e30f`
 */

export type FillExpandType = "standard" | "expand-to-darkest-pixel";
export type FillExpandKernelShape = "round" | "square";

export interface FillExpansionImageLike {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export type FillRgbTuple = readonly [red: number, green: number, blue: number];
export type FillRgbaTuple = readonly [red: number, green: number, blue: number, alpha: number];

export interface FillReferenceLayerExclusionOptions {
  readonly excludeText?: boolean;
  readonly excludeDraft?: boolean;
  readonly excludeLocked?: boolean;
  readonly excludePaper?: boolean;
}

export interface FillReferenceLayerDescriptor {
  readonly id: string;
  readonly role?: string;
  readonly visible?: boolean;
  readonly locked?: boolean;
  readonly isText?: boolean;
  readonly isDraft?: boolean;
  readonly isPaper?: boolean;
}

export interface ExpandFillMaskOptions {
  /** 확장 반경(px, 0..32). 기본 0. */
  readonly expandPx: number;
  /** 표준 확장 vs 안티에일리어싱 선화 능선(최암부)에서 정지하는 확장. 기본 "standard". */
  readonly expandType?: FillExpandType;
  /** 확장 커널 모양: 원형("round") vs 사각형("square"). 기본 "round". */
  readonly kernelShape?: FillExpandKernelShape;
  /** 선화 명도 능선 판정 및 제외 색상 판정에 사용할 기준 이미지. */
  readonly referenceImage?: FillExpansionImageLike;
  /** `FillUseNotStartColor` 활성화 여부. */
  readonly useNotStartColor?: boolean;
  /** 시작점·확장 진입을 금지할 RGB 색상. */
  readonly notStartColor?: FillRgbTuple;
  /** 제외 색상 허용 오차(0..255). 기본 12. */
  readonly notStartColorTolerance?: number;
}

export interface SoakNarrowAreaOptions {
  /** 좁은 틈새로 스며들 모폴로지 클로징 반경(px, 1..8). 기본 2. */
  readonly sliverRadiusPx?: number;
  /** 스며들기 시에도 넘지 않을 어두운 선화 능선 기준 이미지. */
  readonly referenceImage?: FillExpansionImageLike;
  /** 선화 코어로 간주해 침범을 막을 명도 임계값(0..255). 기본 48. */
  readonly hardInkLuminanceFloor?: number;
  readonly useNotStartColor?: boolean;
  readonly notStartColor?: FillRgbTuple;
  readonly notStartColorTolerance?: number;
}

export interface AdvancedFillPostExpansionRequest {
  readonly mask: Uint8Array;
  readonly target: FillExpansionImageLike;
  readonly fill: FillRgbaTuple;
  readonly referenceImage?: FillExpansionImageLike;
  readonly seed?: { readonly x: number; readonly y: number };
  readonly expandPx?: number;
  readonly expandType?: FillExpandType;
  readonly kernelShape?: FillExpandKernelShape;
  readonly soakIntoNarrowArea?: boolean;
  readonly sliverRadiusPx?: number;
  readonly useNotStartColor?: boolean;
  readonly notStartColor?: FillRgbTuple;
  readonly notStartColorTolerance?: number;
}

export interface AdvancedFillPostExpansionResult {
  readonly blockedByNotStartColor: boolean;
  readonly mask: Uint8Array;
  readonly imageData: {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
  };
  readonly paintedPixelCount: number;
}

/**
 * 알파를 흰 종이 합성 등가 명도(0=완전 불투명 검정, 255=투명 또는 완전 흰색)로 환산한다.
 * 안티에일리어싱된 반투명 먹선 가장자리도 중심부로 갈수록 명도가 단조 감소한다.
 */
export function effectivePaperLuminanceAt(img: FillExpansionImageLike, pixelIndex: number): number {
  const off = pixelIndex * 4;
  const r = img.data[off]!;
  const g = img.data[off + 1]!;
  const b = img.data[off + 2]!;
  const a = img.data[off + 3]! / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 255 - a * (255 - lum);
}

/**
 * 픽셀이 `FillUseNotStartColor` 제외 대상 색상과 일치하는지 판정한다.
 */
export function matchesExcludedFillColor(
  img: FillExpansionImageLike,
  pixelIndex: number,
  notStartColor: FillRgbTuple,
  tolerance = 12,
): boolean {
  const off = pixelIndex * 4;
  const a = img.data[off + 3]!;
  if (a <= 16) return false;
  const dr = Math.abs(img.data[off]! - notStartColor[0]);
  const dg = Math.abs(img.data[off + 1]! - notStartColor[1]);
  const db = Math.abs(img.data[off + 2]! - notStartColor[2]);
  return Math.max(dr, dg, db) <= Math.max(0, tolerance);
}

/**
 * 참조 레이어 목록에서 텍스트·밑그림(초안)·잠금·용지 레이어를 역할 옵션에 따라 제외한다.
 */
export function filterFillReferenceLayers<T extends FillReferenceLayerDescriptor>(
  layers: readonly T[],
  options: FillReferenceLayerExclusionOptions,
): T[] {
  return layers.filter((layer) => {
    if (layer.visible === false) return false;
    const role = (layer.role ?? "").toLowerCase();
    if (options.excludeText && (layer.isText === true || role === "text")) return false;
    if (options.excludeDraft && (layer.isDraft === true || role === "draft")) return false;
    if (options.excludeLocked && layer.locked === true) return false;
    if (options.excludePaper && (layer.isPaper === true || role === "paper")) return false;
    return true;
  });
}

/**
 * `FillExpandType` 규칙에 따라 채우기 마스크를 확장한다.
 * - `"expand-to-darkest-pixel"`: 인접 픽셀 명도가 감소하거나 같은 구간(안티에일리어싱 경사면 ~ 능선 중심)까지만
 *   전진하고, 최암부를 지나 다시 밝아지는 반대편 경계로는 절대 번지지 않는다.
 * - `"round"` 커널은 유클리드 반경 `hypot(dx, dy) <= expandPx` 를 지키고, `"square"` 커널은 체비쇼프 반경을 쓴다.
 */
export function expandFillMaskWithRidgeStop(
  mask: Uint8Array,
  width: number,
  height: number,
  options: ExpandFillMaskOptions,
): Uint8Array {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  const total = w * h;
  const out = new Uint8Array(total);
  if (w === 0 || h === 0 || mask.length < total) return out;

  for (let i = 0; i < total; i++) {
    out[i] = mask[i]! > 0 ? 255 : 0;
  }

  const expandPx = Math.max(0, Math.min(32, Number.isFinite(options.expandPx) ? options.expandPx : 0));
  if (expandPx <= 0) return out;

  const expandType = options.expandType ?? "standard";
  const kernelShape = options.kernelShape ?? "round";
  const ref =
    options.referenceImage &&
    options.referenceImage.width === w &&
    options.referenceImage.height === h
      ? options.referenceImage
      : null;
  const guardNotStart = Boolean(options.useNotStartColor && options.notStartColor && ref);
  const notStartTol = options.notStartColorTolerance ?? 12;

  const maxSteps = Math.ceil(expandPx);
  const distSqLimit = (expandPx + 1e-6) * (expandPx + 1e-6);

  // 각 픽셀이 어느 초기 경계 픽셀로부터 출발했는지 기록하여 원형(round) 유클리드 반경을 정확히 판정한다.
  const originX = new Int16Array(total).fill(-1);
  const originY = new Int16Array(total).fill(-1);
  // 능선 정지 모드에서 이미 어두운 선화 경사로 진입했는지(1 = 진입함) 추적한다.
  const enteredSlope = new Uint8Array(total);

  let frontier: number[] = [];
  const dirs8X = [1, -1, 0, 0, 1, 1, -1, -1] as const;
  const dirs8Y = [0, 0, 1, -1, 1, -1, 1, -1] as const;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (out[idx] === 0) continue;
      let isBoundary = false;
      for (let d = 0; d < 4; d++) {
        const nx = x + dirs8X[d]!;
        const ny = y + dirs8Y[d]!;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && out[ny * w + nx] === 0) {
          isBoundary = true;
          break;
        }
      }
      if (isBoundary) {
        originX[idx] = x;
        originY[idx] = y;
        frontier.push(idx);
      }
    }
  }

  const neighborCount = kernelShape === "square" ? 8 : 8;
  for (let step = 0; step < maxSteps && frontier.length > 0; step++) {
    const nextFrontier: number[] = [];
    for (const u of frontier) {
      const ux = u % w;
      const uy = (u - ux) / w;
      const ox = originX[u]!;
      const oy = originY[u]!;
      const lumU = ref ? effectivePaperLuminanceAt(ref, u) : 255;
      const onSlopeU = enteredSlope[u] === 1;

      for (let d = 0; d < neighborCount; d++) {
        const vx = ux + dirs8X[d]!;
        const vy = uy + dirs8Y[d]!;
        if (vx < 0 || vx >= w || vy < 0 || vy >= h) continue;
        const v = vy * w + vx;
        if (out[v] > 0) continue;

        const dx = vx - ox;
        const dy = vy - oy;
        if (kernelShape === "round") {
          if (dx * dx + dy * dy > distSqLimit) continue;
        } else {
          if (Math.max(Math.abs(dx), Math.abs(dy)) > expandPx + 1e-6) continue;
        }

        if (guardNotStart && matchesExcludedFillColor(ref!, v, options.notStartColor!, notStartTol)) {
          continue;
        }

        let nextSlope = onSlopeU ? 1 : 0;
        if (expandType === "expand-to-darkest-pixel" && ref) {
          const lumV = effectivePaperLuminanceAt(ref, v);
          // 어두운 경사로 내려가는 중(lumV < lumU - 0.5)이면 경사 진입 플래그 활성화
          if (lumV < lumU - 0.5) {
            nextSlope = 1;
          } else if (onSlopeU && lumV > lumU + 0.5) {
            // 최암부 능선(극솟값)을 찍고 다시 밝아지기 시작하면 즉시 정지!
            continue;
          }
        }

        out[v] = 255;
        originX[v] = ox;
        originY[v] = oy;
        enteredSlope[v] = nextSlope;
        nextFrontier.push(v);
      }
    }
    frontier = nextFrontier;
  }

  return out;
}

/**
 * `FillSoakIntoNarrowArea` — 예각 모서리·머리카락 끝의 좁은 틈새로 마스크가 스며들도록
 * 선화 코어 장벽을 침범하지 않는 제한적 모폴로지 클로징(팽창 후 침식)을 적용한다.
 */
export function soakNarrowSliversInMask(
  mask: Uint8Array,
  width: number,
  height: number,
  options?: SoakNarrowAreaOptions,
): Uint8Array {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  const total = w * h;
  const base = new Uint8Array(total);
  if (w === 0 || h === 0 || mask.length < total) return base;
  for (let i = 0; i < total; i++) base[i] = mask[i]! > 0 ? 255 : 0;

  const r = Math.max(0, Math.min(8, Math.floor(options?.sliverRadiusPx ?? 2)));
  if (r === 0) return base;

  const ref =
    options?.referenceImage &&
    options.referenceImage.width === w &&
    options.referenceImage.height === h
      ? options.referenceImage
      : null;
  const inkFloor = options?.hardInkLuminanceFloor ?? 48;
  const guardNotStart = Boolean(options?.useNotStartColor && options?.notStartColor && ref);
  const notStartTol = options?.notStartColorTolerance ?? 12;

  const blocked = new Uint8Array(total);
  if (ref) {
    for (let i = 0; i < total; i++) {
      if (effectivePaperLuminanceAt(ref, i) <= inkFloor) {
        blocked[i] = 1;
      } else if (guardNotStart && matchesExcludedFillColor(ref, i, options!.notStartColor!, notStartTol)) {
        blocked[i] = 1;
      }
    }
  }

  // 1) 장벽(blocked)을 제외한 4-연결 십자(+) 반경 r 팽창 (대각선 선화 틈 누수 방지)
  const dirs4X = [1, -1, 0, 0] as const;
  const dirs4Y = [0, 0, 1, -1] as const;
  const dilated = new Uint8Array(base);
  for (let step = 0; step < r; step++) {
    const prev = dilated.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (prev[idx] > 0 || blocked[idx]) continue;
        for (let d = 0; d < 4; d++) {
          const nx = x + dirs4X[d]!;
          const ny = y + dirs4Y[d]!;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && prev[ny * w + nx]! > 0) {
            dilated[idx] = 255;
            break;
          }
        }
      }
    }
  }

  // 2) 4-연결 반경 r 침식: 열린 공간으로 부풀어 오른 외곽은 되돌리고 선화 장벽 사이의 좁은 V자 틈새만 보존한다.
  const closed = new Uint8Array(dilated);
  for (let step = 0; step < r; step++) {
    const prev = closed.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (prev[idx] === 0) continue;
        let keep = true;
        for (let d = 0; d < 4; d++) {
          const nx = x + dirs4X[d]!;
          const ny = y + dirs4Y[d]!;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
            keep = false;
            break;
          }
          const nIdx = ny * w + nx;
          if (prev[nIdx] === 0 && !blocked[nIdx]) {
            keep = false;
            break;
          }
        }
        if (!keep) closed[idx] = 0;
      }
    }
  }

  // 원본 마스크는 항상 보존(합집합)하고 장벽 픽셀은 제외한다.
  for (let i = 0; i < total; i++) {
    if (base[i] > 0) closed[i] = 255;
    else if (blocked[i]) closed[i] = 0;
  }
  return closed;
}

/**
 * 제외 색상 시드 차단 + 능선 정지 확장 + 좁은 영역 스며들기를 통합 적용하고 새 RGBA 버퍼에 칠한다.
 */
export function applyAdvancedFillPostExpansion(
  request: AdvancedFillPostExpansionRequest,
): AdvancedFillPostExpansionResult {
  const { target } = request;
  const w = Math.max(0, Math.floor(target.width));
  const h = Math.max(0, Math.floor(target.height));
  const total = w * h;
  const ref = request.referenceImage ?? target;
  const outData = new Uint8ClampedArray(target.data);

  if (
    request.useNotStartColor &&
    request.notStartColor &&
    request.seed &&
    request.seed.x >= 0 &&
    request.seed.x < w &&
    request.seed.y >= 0 &&
    request.seed.y < h
  ) {
    const seedIdx = Math.floor(request.seed.y) * w + Math.floor(request.seed.x);
    if (matchesExcludedFillColor(ref, seedIdx, request.notStartColor, request.notStartColorTolerance ?? 12)) {
      return {
        blockedByNotStartColor: true,
        mask: new Uint8Array(total),
        imageData: { data: outData, width: w, height: h },
        paintedPixelCount: 0,
      };
    }
  }

  let workingMask: Uint8Array = new Uint8Array(request.mask);
  if (request.soakIntoNarrowArea) {
    workingMask = soakNarrowSliversInMask(workingMask, w, h, {
      sliverRadiusPx: request.sliverRadiusPx ?? 2,
      referenceImage: ref,
      useNotStartColor: request.useNotStartColor,
      notStartColor: request.notStartColor,
      notStartColorTolerance: request.notStartColorTolerance,
    });
  }

  if ((request.expandPx ?? 0) > 0) {
    workingMask = expandFillMaskWithRidgeStop(workingMask, w, h, {
      expandPx: request.expandPx ?? 0,
      expandType: request.expandType ?? "standard",
      kernelShape: request.kernelShape ?? "round",
      referenceImage: ref,
      useNotStartColor: request.useNotStartColor,
      notStartColor: request.notStartColor,
      notStartColorTolerance: request.notStartColorTolerance,
    });
  }

  let paintedPixelCount = 0;
  const [fr, fg, fb, fa] = request.fill;
  for (let i = 0; i < total; i++) {
    if (workingMask[i]! > 0) {
      const off = i * 4;
      outData[off] = fr;
      outData[off + 1] = fg;
      outData[off + 2] = fb;
      outData[off + 3] = fa;
      paintedPixelCount++;
    }
  }

  return {
    blockedByNotStartColor: false,
    mask: workingMask,
    imageData: { data: outData, width: w, height: h },
    paintedPixelCount,
  };
}
