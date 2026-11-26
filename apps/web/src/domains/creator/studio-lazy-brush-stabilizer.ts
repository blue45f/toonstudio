export const STUDIO_LAZY_BRUSH_DEFAULT_RADIUS_CSS_PX = 30;
export const STUDIO_LAZY_BRUSH_MAX_RADIUS_CSS_PX = 512;
export const STUDIO_LAZY_BRUSH_MIN_COORDINATE_SCALE = 0.01;
export const STUDIO_LAZY_BRUSH_MAX_COORDINATE_SCALE = 64;

export type StudioLazyBrushPointerType = "mouse" | "pen" | "touch" | "unknown";

export interface StudioLazyBrushPointerPolicy {
  readonly mouse: boolean;
  readonly pen: boolean;
  readonly touch: boolean;
  readonly unknown: boolean;
}

export type StudioLazyBrushPointerPolicyInput =
  | "all"
  | "mouse-only"
  | "non-pen"
  | "none"
  | "pen-only"
  | Partial<StudioLazyBrushPointerPolicy>;

/** Mouse/touch default to active leash; stylus pen stays opt-in. */
export const STUDIO_LAZY_BRUSH_DEFAULT_POINTER_POLICY =
  Object.freeze<StudioLazyBrushPointerPolicy>({
    mouse: true,
    pen: false,
    touch: true,
    unknown: true,
  });

export interface StudioLazyBrushStabilizerOptions {
  readonly enabled?: boolean;
  readonly radiusCssPx?: number;
  readonly coordinateScale?: number;
  readonly friction?: number;
  readonly pointerPolicy?: StudioLazyBrushPointerPolicyInput;
}

export interface StudioLazyBrushStabilizerSample {
  readonly x: number;
  readonly y: number;
  readonly pointerType?: StudioLazyBrushPointerType;
  readonly pointerId?: number;
}

export interface StudioLazyBrushNormalizedOptions {
  readonly enabled: boolean;
  readonly radiusCssPx: number;
  readonly coordinateScale: number;
  readonly radiusDocumentPx: number;
  readonly friction: number;
  readonly pointerPolicy: StudioLazyBrushPointerPolicy;
}

export interface StudioLazyBrushStabilizerResult {
  readonly point: readonly [number, number];
  readonly pointer: readonly [number, number];
  readonly accepted: boolean;
  readonly initialized: boolean;
  readonly firstPoint: boolean;
  readonly active: boolean;
  readonly moved: boolean;
  readonly pointerType: StudioLazyBrushPointerType;
  readonly pointerId: number | null;
  readonly radiusCssPx: number;
  readonly radiusDocumentPx: number;
  readonly friction: number;
}

const finiteOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const normalizePointerType = (value: unknown): StudioLazyBrushPointerType =>
  value === "mouse" || value === "pen" || value === "touch" ? value : "unknown";

const normalizePointerId = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

const frozenPoint = (x: number, y: number): readonly [number, number] =>
  Object.freeze([Math.abs(x) < 1e-12 ? 0 : x, Math.abs(y) < 1e-12 ? 0 : y] as [number, number]);

const POLICY_PRESETS: Readonly<Record<string, StudioLazyBrushPointerPolicy>> = {
  all: Object.freeze({ mouse: true, pen: true, touch: true, unknown: true }),
  "mouse-only": Object.freeze({ mouse: true, pen: false, touch: false, unknown: false }),
  "non-pen": Object.freeze({ mouse: true, pen: false, touch: true, unknown: true }),
  none: Object.freeze({ mouse: false, pen: false, touch: false, unknown: false }),
  "pen-only": Object.freeze({ mouse: false, pen: true, touch: false, unknown: false }),
};

function normalizePointerPolicy(
  input: StudioLazyBrushPointerPolicyInput | undefined,
): StudioLazyBrushPointerPolicy {
  if (typeof input === "string" && input in POLICY_PRESETS) return POLICY_PRESETS[input]!;
  if (!input || typeof input !== "object") return STUDIO_LAZY_BRUSH_DEFAULT_POINTER_POLICY;
  const def = STUDIO_LAZY_BRUSH_DEFAULT_POINTER_POLICY;
  return Object.freeze({
    mouse: input.mouse ?? def.mouse,
    pen: input.pen ?? def.pen,
    touch: input.touch ?? def.touch,
    unknown: input.unknown ?? def.unknown,
  });
}

export function normalizeStudioLazyBrushOptions(
  input: StudioLazyBrushStabilizerOptions = {},
): StudioLazyBrushNormalizedOptions {
  const radiusCssPx = clamp(
    finiteOr(input.radiusCssPx, STUDIO_LAZY_BRUSH_DEFAULT_RADIUS_CSS_PX),
    0,
    STUDIO_LAZY_BRUSH_MAX_RADIUS_CSS_PX,
  );
  const coordinateScale = clamp(
    finiteOr(input.coordinateScale, 1),
    STUDIO_LAZY_BRUSH_MIN_COORDINATE_SCALE,
    STUDIO_LAZY_BRUSH_MAX_COORDINATE_SCALE,
  );
  return Object.freeze({
    enabled: input.enabled !== false,
    radiusCssPx,
    coordinateScale,
    radiusDocumentPx: radiusCssPx / coordinateScale,
    friction: clamp(finiteOr(input.friction, 0), 0, 1),
    pointerPolicy: normalizePointerPolicy(input.pointerPolicy),
  });
}

export function shouldApplyStudioLazyBrush(
  pointerType: StudioLazyBrushPointerType,
  options: StudioLazyBrushNormalizedOptions,
): boolean {
  return options.enabled && options.pointerPolicy[pointerType];
}

/** Zero-dep radius/friction pointer leash stabilizer with immutable, prefix-stable outputs. */
export class StudioLazyBrushStabilizer {
  private hasState = false;
  private brushX = 0;
  private brushY = 0;
  private pointerX = 0;
  private pointerY = 0;
  private pointerType: StudioLazyBrushPointerType = "unknown";
  private pointerId: number | null = null;
  private lastOptions = normalizeStudioLazyBrushOptions();

  get initialized(): boolean {
    return this.hasState;
  }

  reset(): void {
    this.hasState = false;
    this.brushX = 0;
    this.brushY = 0;
    this.pointerX = 0;
    this.pointerY = 0;
    this.pointerType = "unknown";
    this.pointerId = null;
    this.lastOptions = normalizeStudioLazyBrushOptions();
  }

  begin(
    sample: StudioLazyBrushStabilizerSample,
    options: StudioLazyBrushStabilizerOptions = {},
  ): StudioLazyBrushStabilizerResult {
    const normalized = normalizeStudioLazyBrushOptions(options);
    if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) {
      this.reset();
      return this.rejectedResult(normalized);
    }
    const pointerType = normalizePointerType(sample.pointerType);
    const pointerId = normalizePointerId(sample.pointerId);
    const active = shouldApplyStudioLazyBrush(pointerType, normalized);
    this.hasState = true;
    this.brushX = sample.x;
    this.brushY = sample.y;
    this.pointerX = sample.x;
    this.pointerY = sample.y;
    this.pointerType = pointerType;
    this.pointerId = pointerId;
    this.lastOptions = normalized;
    return this.result(true, true, active, false, normalized);
  }

  update(
    sample: StudioLazyBrushStabilizerSample,
    options: StudioLazyBrushStabilizerOptions = {},
  ): StudioLazyBrushStabilizerResult {
    const normalized = normalizeStudioLazyBrushOptions(options);
    if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) {
      return this.rejectedResult(normalized);
    }
    const pointerType = normalizePointerType(sample.pointerType);
    const pointerId = normalizePointerId(sample.pointerId);
    if (
      !this.hasState
      || pointerType !== this.pointerType
      || (pointerId !== null && this.pointerId !== null && pointerId !== this.pointerId)
    ) {
      return this.begin(sample, options);
    }

    const active = shouldApplyStudioLazyBrush(pointerType, normalized);
    const beforeX = this.brushX;
    const beforeY = this.brushY;
    const samePointer = this.pointerX === sample.x && this.pointerY === sample.y;

    if (!active || normalized.radiusDocumentPx <= 0) {
      this.pointerX = sample.x;
      this.pointerY = sample.y;
      this.brushX = sample.x;
      this.brushY = sample.y;
    } else if (!samePointer || normalized.friction > 0) {
      this.pointerX = sample.x;
      this.pointerY = sample.y;
      const dx = sample.x - this.brushX;
      const dy = sample.y - this.brushY;
      const distance = Math.hypot(dx, dy);
      const excess = distance - normalized.radiusDocumentPx;
      if (Math.round(excess * 10) / 10 > 0 && distance > 0 && normalized.friction < 1) {
        const inv = 1 - normalized.friction;
        const step = normalized.friction > 0
          ? excess * (1 - Math.sqrt(1 - inv * inv))
          : excess;
        this.brushX += (dx / distance) * step;
        this.brushY += (dy / distance) * step;
      }
    }

    this.pointerType = pointerType;
    this.pointerId = pointerId;
    this.lastOptions = normalized;
    const moved = beforeX !== this.brushX || beforeY !== this.brushY;
    return this.result(true, false, active, moved, normalized);
  }

  /** Resolves the intentional lazy-radius trail to the latest raw endpoint on pointer-up. */
  flush(): StudioLazyBrushStabilizerResult | null {
    if (!this.hasState) return null;
    const moved = this.brushX !== this.pointerX || this.brushY !== this.pointerY;
    this.brushX = this.pointerX;
    this.brushY = this.pointerY;
    return this.result(
      true,
      false,
      shouldApplyStudioLazyBrush(this.pointerType, this.lastOptions),
      moved,
      this.lastOptions,
    );
  }

  private rejectedResult(options: StudioLazyBrushNormalizedOptions): StudioLazyBrushStabilizerResult {
    if (this.hasState) {
      return this.result(false, false, shouldApplyStudioLazyBrush(this.pointerType, options), false, options);
    }
    return Object.freeze({
      point: frozenPoint(0, 0),
      pointer: frozenPoint(0, 0),
      accepted: false,
      initialized: false,
      firstPoint: false,
      active: false,
      moved: false,
      pointerType: "unknown",
      pointerId: null,
      radiusCssPx: options.radiusCssPx,
      radiusDocumentPx: options.radiusDocumentPx,
      friction: options.friction,
    });
  }

  private result(
    accepted: boolean,
    firstPoint: boolean,
    active: boolean,
    moved: boolean,
    options: StudioLazyBrushNormalizedOptions,
  ): StudioLazyBrushStabilizerResult {
    return Object.freeze({
      point: frozenPoint(this.brushX, this.brushY),
      pointer: frozenPoint(this.pointerX, this.pointerY),
      accepted,
      initialized: this.hasState,
      firstPoint,
      active,
      moved,
      pointerType: this.pointerType,
      pointerId: this.pointerId,
      radiusCssPx: options.radiusCssPx,
      radiusDocumentPx: options.radiusDocumentPx,
      friction: options.friction,
    });
  }
}

export function createStudioLazyBrushStabilizer(): StudioLazyBrushStabilizer {
  return new StudioLazyBrushStabilizer();
}
