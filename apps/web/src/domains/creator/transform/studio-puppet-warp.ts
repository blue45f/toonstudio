/**
 * Studio Puppet Warp & Pin-based Mesh Deformation Engine
 *
 * CLIP STUDIO PAINT Ver.4.0.0 Parity:
 * - Puppet Warp (퍼핏 변형):
 *   - Allows artists to pose and deform 2D character drawings, limbs, and clothing by placing control pins.
 *   - Types of pins:
 *     1. "deform" (변형 핀): Moveable pin that pulls adjacent geometry smoothly.
 *     2. "anchor" (고정 핀): Locks points in place (e.g., foot grounded on floor).
 *   - Deformation Field: Radial Basis / Inverse Distance Weighting (IDW) with smoothness falloff.
 *   - Mesh Generation: Uniform triangular lattice covering the object bounding box.
 *   - Vertex deformation and reverse coordinate sampling for bilinear pixel rasterization.
 *
 * Pure, deterministic, zero-dependency.
 */

export interface PuppetPin {
  readonly id: string;
  readonly kind: "deform" | "anchor";
  readonly x: number;
  readonly y: number;
  /** Rest position (initial coordinate before transformation) */
  readonly restX: number;
  readonly restY: number;
  /** Pin z-ordering for overlapping limbs (higher depth renders on top) */
  readonly depth?: number;
  /** Local joint rotation in degrees around the pin (default 0) */
  readonly rotationDeg?: number;
  /** Local joint scale factor around the pin (default 1, clamped 0.1..5) */
  readonly scale?: number;
  /** Falloff stiffness/rigidity exponent (default 2.5, clamped 1..6) */
  readonly rigidity?: number;
}

export interface PuppetMeshVertex {
  readonly restX: number;
  readonly restY: number;
  readonly currX: number;
  readonly currY: number;
}

export interface PuppetMeshTriangle {
  readonly i0: number;
  readonly i1: number;
  readonly i2: number;
}

export interface PuppetMesh {
  readonly vertices: readonly PuppetMeshVertex[];
  readonly triangles: readonly PuppetMeshTriangle[];
  readonly width: number;
  readonly height: number;
}

export interface PuppetWarpState {
  readonly pins: readonly PuppetPin[];
  readonly mesh: PuppetMesh | null;
  readonly influenceRadiusPx: number; // falloff radius per pin
}

export const DEFAULT_PUPPET_WARP_STATE: PuppetWarpState = Object.freeze({
  pins: Object.freeze([]),
  mesh: null,
  influenceRadiusPx: 120,
});

function clampRange(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

/**
 * Creates a new puppet deformation pin.
 */
export function createPuppetPin(
  x: number,
  y: number,
  kind: PuppetPin["kind"] = "deform",
  id?: string,
  options?: {
    readonly depth?: number;
    readonly rotationDeg?: number;
    readonly scale?: number;
    readonly rigidity?: number;
  },
): PuppetPin {
  const pinId = id || `pin-${Math.random().toString(36).slice(2, 8)}`;
  return Object.freeze({
    id: pinId,
    kind,
    x,
    y,
    restX: x,
    restY: y,
    depth: options?.depth ?? 0,
    rotationDeg: options?.rotationDeg ?? 0,
    scale: clampRange(options?.scale ?? 1, 0.1, 5),
    rigidity: clampRange(options?.rigidity ?? 2.5, 1, 6),
  });
}

/**
 * Builds a uniform triangular grid mesh over the given bounding box.
 */
export function buildPuppetLatticeMesh(
  width: number,
  height: number,
  gridCols = 10,
  gridRows = 10,
): PuppetMesh {
  const w = Math.max(16, width);
  const h = Math.max(16, height);
  const cols = Math.max(2, Math.min(32, gridCols));
  const rows = Math.max(2, Math.min(32, gridRows));

  const vertices: PuppetMeshVertex[] = [];
  for (let r = 0; r <= rows; r++) {
    const y = (r / rows) * h;
    for (let c = 0; c <= cols; c++) {
      const x = (c / cols) * w;
      vertices.push({ restX: x, restY: y, currX: x, currY: y });
    }
  }

  const triangles: PuppetMeshTriangle[] = [];
  const stride = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const topLeft = r * stride + c;
      const topRight = topLeft + 1;
      const bottomLeft = (r + 1) * stride + c;
      const bottomRight = bottomLeft + 1;

      // Two triangles per cell
      triangles.push({ i0: topLeft, i1: topRight, i2: bottomLeft });
      triangles.push({ i0: topRight, i1: bottomRight, i2: bottomLeft });
    }
  }

  return Object.freeze({
    vertices: Object.freeze(vertices),
    triangles: Object.freeze(triangles),
    width: w,
    height: h,
  });
}

/**
 * Calculates the deformed position for a point (restX, restY) given the current active pins.
 * Supports translational pull, local joint rotation (`rotationDeg`), local scaling (`scale`),
 * and per-pin stiffness exponent (`rigidity`).
 */
export function computeDeformedPosition(
  restX: number,
  restY: number,
  pins: readonly PuppetPin[],
  influenceRadius = 120,
): readonly [number, number] {
  if (pins.length === 0) return [restX, restY];

  const safeRadius = Math.max(1, influenceRadius);
  let totalWeight = 0;
  let dxSum = 0;
  let dySum = 0;

  for (const pin of pins) {
    const distToRest = Math.hypot(restX - pin.restX, restY - pin.restY);
    const epsilon = 1.0;
    const normDist = distToRest / safeRadius;
    const rigidity = clampRange(pin.rigidity ?? 2.5, 1, 6);
    const w = 1.0 / Math.pow(normDist + epsilon, rigidity);

    let pinDisplacementX = 0;
    let pinDisplacementY = 0;

    if (pin.kind !== "anchor") {
      const rotDeg = pin.rotationDeg ?? 0;
      const scale = clampRange(pin.scale ?? 1, 0.1, 5);
      if (rotDeg === 0 && scale === 1) {
        pinDisplacementX = pin.x - pin.restX;
        pinDisplacementY = pin.y - pin.restY;
      } else {
        const relX = restX - pin.restX;
        const relY = restY - pin.restY;
        const rad = (rotDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const targetX = pin.x + scale * (relX * cos - relY * sin);
        const targetY = pin.y + scale * (relX * sin + relY * cos);
        pinDisplacementX = targetX - restX;
        pinDisplacementY = targetY - restY;
      }
    }

    dxSum += pinDisplacementX * w;
    dySum += pinDisplacementY * w;
    totalWeight += w;
  }

  if (totalWeight <= 0) return [restX, restY];

  const finalX = restX + dxSum / totalWeight;
  const finalY = restY + dySum / totalWeight;
  return [Math.round(finalX * 10) / 10, Math.round(finalY * 10) / 10];
}

/**
 * Evaluates and returns an updated PuppetMesh where all vertex coordinates are deformed.
 */
export function deformPuppetMesh(
  mesh: PuppetMesh,
  pins: readonly PuppetPin[],
  influenceRadius = 120,
): PuppetMesh {
  const deformedVertices = mesh.vertices.map((v) => {
    const [currX, currY] = computeDeformedPosition(v.restX, v.restY, pins, influenceRadius);
    return {
      restX: v.restX,
      restY: v.restY,
      currX,
      currY,
    };
  });

  return Object.freeze({
    ...mesh,
    vertices: Object.freeze(deformedVertices),
  });
}

/**
 * Moves a pin to a new position, returning an updated pin array.
 */
export function movePuppetPin(
  pins: readonly PuppetPin[],
  pinId: string,
  newX: number,
  newY: number,
): readonly PuppetPin[] {
  return Object.freeze(
    pins.map((pin) => {
      if (pin.id !== pinId) return pin;
      return Object.freeze({
        ...pin,
        x: Math.round(newX * 10) / 10,
        y: Math.round(newY * 10) / 10,
      });
    }),
  );
}

/**
 * Rotates a pin locally (in degrees), returning an updated pin array.
 */
export function rotatePuppetPin(
  pins: readonly PuppetPin[],
  pinId: string,
  rotationDeg: number,
): readonly PuppetPin[] {
  const safeDeg = Number.isFinite(rotationDeg) ? Math.round(rotationDeg * 10) / 10 : 0;
  return Object.freeze(
    pins.map((pin) => {
      if (pin.id !== pinId) return pin;
      return Object.freeze({
        ...pin,
        rotationDeg: safeDeg,
      });
    }),
  );
}

/**
 * Scales a pin locally (`0.1` to `5.0`), returning an updated pin array.
 */
export function scalePuppetPin(
  pins: readonly PuppetPin[],
  pinId: string,
  scale: number,
): readonly PuppetPin[] {
  const safeScale = Math.round(clampRange(scale, 0.1, 5) * 100) / 100;
  return Object.freeze(
    pins.map((pin) => {
      if (pin.id !== pinId) return pin;
      return Object.freeze({
        ...pin,
        scale: safeScale,
      });
    }),
  );
}

/**
 * Updates a pin's z-ordering depth for overlapping limb composition.
 */
export function setPuppetPinDepth(
  pins: readonly PuppetPin[],
  pinId: string,
  depth: number,
): readonly PuppetPin[] {
  const safeDepth = Number.isFinite(depth) ? depth : 0;
  return Object.freeze(
    pins.map((pin) => {
      if (pin.id !== pinId) return pin;
      return Object.freeze({
        ...pin,
        depth: safeDepth,
      });
    }),
  );
}

/**
 * Removes a pin by ID.
 */
export function removePuppetPin(
  pins: readonly PuppetPin[],
  pinId: string,
): readonly PuppetPin[] {
  return Object.freeze(pins.filter((pin) => pin.id !== pinId));
}

/**
 * Resets all pins to their original rest positions, zero rotation, and unit scale.
 */
export function resetPuppetPins(pins: readonly PuppetPin[]): readonly PuppetPin[] {
  return Object.freeze(
    pins.map((p) =>
      Object.freeze({
        ...p,
        x: p.restX,
        y: p.restY,
        rotationDeg: 0,
        scale: 1,
      }),
    ),
  );
}

function sampleBilinearRgba(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  sx: number,
  sy: number,
): readonly [number, number, number, number] {
  if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) {
    return [0, 0, 0, 0];
  }
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(sx)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(sy)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = sx - x0;
  const fy = sy - y0;

  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  const r = (source[i00] ?? 0) * w00 + (source[i10] ?? 0) * w10 + (source[i01] ?? 0) * w01 + (source[i11] ?? 0) * w11;
  const g = (source[i00 + 1] ?? 0) * w00 + (source[i10 + 1] ?? 0) * w10 + (source[i01 + 1] ?? 0) * w01 + (source[i11 + 1] ?? 0) * w11;
  const b = (source[i00 + 2] ?? 0) * w00 + (source[i10 + 2] ?? 0) * w10 + (source[i01 + 2] ?? 0) * w01 + (source[i11 + 2] ?? 0) * w11;
  const a = (source[i00 + 3] ?? 0) * w00 + (source[i10 + 3] ?? 0) * w10 + (source[i01 + 3] ?? 0) * w01 + (source[i11 + 3] ?? 0) * w11;

  return [Math.round(r), Math.round(g), Math.round(b), Math.round(a)];
}

function estimateVertexDepth(
  v: PuppetMeshVertex,
  pins: readonly PuppetPin[],
): number {
  if (pins.length === 0) return 0;
  let wSum = 0;
  let depthSum = 0;
  for (const pin of pins) {
    const d = Math.hypot(v.restX - pin.restX, v.restY - pin.restY);
    const w = 1 / (d + 1);
    wSum += w;
    depthSum += (pin.depth ?? 0) * w;
  }
  return wSum > 0 ? depthSum / wSum : 0;
}

/**
 * Rasterizes a deformed PuppetMesh back into an RGBA pixel buffer using
 * inverse barycentric coordinate mapping, bilinear texture sampling, and
 * pin depth z-ordering for overlapping limbs.
 */
export function rasterizePuppetWarpedBuffer(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  deformedMesh: PuppetMesh,
  pins: readonly PuppetPin[] = [],
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  if (width <= 0 || height <= 0 || source.length < width * height * 4) {
    return out;
  }

  const vertices = deformedMesh.vertices;
  const vertexDepths = vertices.map((v) => estimateVertexDepth(v, pins));

  // Sort triangles from back (lowest depth) to front (highest depth)
  const orderedTriangles = [...deformedMesh.triangles].sort((a, b) => {
    const depthA =
      ((vertexDepths[a.i0] ?? 0) + (vertexDepths[a.i1] ?? 0) + (vertexDepths[a.i2] ?? 0)) / 3;
    const depthB =
      ((vertexDepths[b.i0] ?? 0) + (vertexDepths[b.i1] ?? 0) + (vertexDepths[b.i2] ?? 0)) / 3;
    return depthA - depthB;
  });

  for (const tri of orderedTriangles) {
    const v0 = vertices[tri.i0];
    const v1 = vertices[tri.i1];
    const v2 = vertices[tri.i2];
    if (!v0 || !v1 || !v2) continue;

    const det =
      (v1.currY - v2.currY) * (v0.currX - v2.currX) +
      (v2.currX - v1.currX) * (v0.currY - v2.currY);
    if (Math.abs(det) < 1e-6) continue;
    const invDet = 1 / det;

    const minX = Math.max(0, Math.floor(Math.min(v0.currX, v1.currX, v2.currX)));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(v0.currX, v1.currX, v2.currX)));
    const minY = Math.max(0, Math.floor(Math.min(v0.currY, v1.currY, v2.currY)));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(v0.currY, v1.currY, v2.currY)));

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const w0 =
          ((v1.currY - v2.currY) * (px - v2.currX) +
            (v2.currX - v1.currX) * (py - v2.currY)) *
          invDet;
        const w1 =
          ((v2.currY - v0.currY) * (px - v2.currX) +
            (v0.currX - v2.currX) * (py - v2.currY)) *
          invDet;
        const w2 = 1 - w0 - w1;

        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;

        const sx = w0 * v0.restX + w1 * v1.restX + w2 * v2.restX;
        const sy = w0 * v0.restY + w1 * v1.restY + w2 * v2.restY;
        const [sr, sg, sb, sa] = sampleBilinearRgba(source, width, height, sx, sy);
        if (sa <= 0) continue;

        const dstIdx = (py * width + px) * 4;
        const dstA = (out[dstIdx + 3] ?? 0) / 255;
        const srcA = sa / 255;
        const outA = srcA + dstA * (1 - srcA);
        if (outA <= 0) continue;

        out[dstIdx] = Math.round(((sr * srcA + (out[dstIdx] ?? 0) * dstA * (1 - srcA)) / outA));
        out[dstIdx + 1] = Math.round(
          ((sg * srcA + (out[dstIdx + 1] ?? 0) * dstA * (1 - srcA)) / outA),
        );
        out[dstIdx + 2] = Math.round(
          ((sb * srcA + (out[dstIdx + 2] ?? 0) * dstA * (1 - srcA)) / outA),
        );
        out[dstIdx + 3] = Math.round(outA * 255);
      }
    }
  }

  return out;
}

