/**
 * 텍셀 밀도 고정 자동 Box-UV 패커 & 심리스 스크린스페이스 3D 페인트 프로젝터 (Blockbench 클린룸 구현).
 *
 * - 텍셀 밀도 고정(16/32/64/128 px/m) Box-UV 생성 + MaxRects(Best Short Side Fit) 자동 패킹
 * - 2px 거터 여백 보장, 90도 회전 허용, 2의 거듭제곱 아틀라스 자동 확장(64..4096)
 * - 박스 치수 수정 시 비례 UV 즉시 동기화(updateBoxDimensionsAndRepack)
 * - 스크린스페이스 브러시 스트로크를 UV 심 경계 없이 아틀라스 텍셀로 역투영 페인팅 + 거터 확장
 */

export const TEXEL_BOX_UV_SCHEMA_VERSION = 1 as const;
export const MAX_ATLAS_RESOLUTION = 4096 as const;

export type BoxFaceDirection = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";

export interface BoxPartSpec {
  readonly id: string; readonly name: string;
  readonly center: readonly [number, number, number];
  readonly sizeMeters: readonly [number, number, number];
}

export interface TexelBoxUvPackOptions {
  readonly texelDensityPxPerMeter: number;
  readonly gutterPx?: number;
  readonly allowRotate?: boolean;
  readonly minAtlasSize?: number;
}

export interface PackedBoxFaceIsland {
  readonly partId: string; readonly face: BoxFaceDirection;
  readonly pixelX: number; readonly pixelY: number; readonly pixelWidth: number; readonly pixelHeight: number;
  readonly rotated90: boolean;
  readonly uvRect: readonly [number, number, number, number];
  readonly achievedTexelDensity: number;
}

export interface PackedBoxMeshData {
  readonly positions: Float32Array; readonly normals: Float32Array;
  readonly uvs: Float32Array; readonly indices: Uint32Array;
}

export interface TexelBoxUvPackResult {
  readonly atlasWidth: number; readonly atlasHeight: number;
  readonly gutterPx: number; readonly targetTexelDensity: number; readonly utilizationRatio: number;
  readonly islands: readonly PackedBoxFaceIsland[];
  readonly mesh: PackedBoxMeshData;
}

export interface ScreenSpaceBrushStroke {
  readonly points: readonly (readonly [number, number])[];
  readonly radiusPx: number;
  readonly colorRgba: readonly [number, number, number, number];
  readonly opacity: number; readonly hardness: number;
}

export interface ScreenSpacePaintCamera {
  readonly viewProjectionMatrix: Float32Array;
  readonly viewportWidth: number; readonly viewportHeight: number;
}

export interface ScreenSpacePaintStats {
  readonly paintedTexels: number; readonly crossedIslands: number; readonly dilatedGutterTexels: number;
}

interface FreeRect { x: number; y: number; w: number; h: number; }
interface PendingIsland {
  readonly partId: string; readonly face: BoxFaceDirection;
  readonly metricW: number; readonly metricH: number; readonly pixelW: number; readonly pixelH: number;
}

function nextPowerOfTwo(n: number): number { let p = 1; while (p < n) p <<= 1; return p; }
const rectsIntersect = (a: FreeRect, b: FreeRect): boolean =>
  !(b.x >= a.x + a.w || b.x + b.w <= a.x || b.y >= a.y + a.h || b.y + b.h <= a.y);
const isContainedIn = (a: FreeRect, b: FreeRect): boolean =>
  a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

/** MaxRects(Best Short Side Fit) 결정적 사각형 빈 패킹. */
function tryMaxRectsPack(items: readonly PendingIsland[], atlasSize: number, gutterPx: number, allowRotate: boolean) {
  const freeRects: FreeRect[] = [{ x: gutterPx, y: gutterPx, w: atlasSize - gutterPx * 2, h: atlasSize - gutterPx * 2 }];
  if (freeRects[0]!.w <= 0 || freeRects[0]!.h <= 0) return null;

  const sorted = [...items].sort((a, b) => {
    const areaDiff = b.pixelW * b.pixelH - a.pixelW * a.pixelH;
    if (areaDiff !== 0) return areaDiff;
    const maxDiff = Math.max(b.pixelW, b.pixelH) - Math.max(a.pixelW, a.pixelH);
    return maxDiff !== 0 ? maxDiff : `${a.partId}:${a.face}`.localeCompare(`${b.partId}:${b.face}`);
  });

  const placed: { readonly item: PendingIsland; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly rotated: boolean }[] = [];

  for (const item of sorted) {
    const reqW = item.pixelW + gutterPx;
    const reqH = item.pixelH + gutterPx;
    let bestShort = Infinity; let bestLong = Infinity;
    let bestRect: FreeRect | null = null; let bestRotated = false;

    for (const fr of freeRects) {
      if (fr.w >= reqW && fr.h >= reqH) {
        const s = Math.min(fr.w - reqW, fr.h - reqH);
        const l = Math.max(fr.w - reqW, fr.h - reqH);
        if (s < bestShort || (s === bestShort && l < bestLong)) {
          bestShort = s; bestLong = l; bestRect = { x: fr.x, y: fr.y, w: reqW, h: reqH }; bestRotated = false;
        }
      }
      if (allowRotate && item.pixelW !== item.pixelH && fr.w >= reqH && fr.h >= reqW) {
        const s = Math.min(fr.w - reqH, fr.h - reqW);
        const l = Math.max(fr.w - reqH, fr.h - reqW);
        if (s < bestShort || (s === bestShort && l < bestLong)) {
          bestShort = s; bestLong = l; bestRect = { x: fr.x, y: fr.y, w: reqH, h: reqW }; bestRotated = true;
        }
      }
    }
    if (!bestRect) return null;

    placed.push({ item, x: bestRect.x, y: bestRect.y, w: bestRotated ? item.pixelH : item.pixelW, h: bestRotated ? item.pixelW : item.pixelH, rotated: bestRotated });

    const nextFree: FreeRect[] = [];
    for (const fr of freeRects) {
      if (!rectsIntersect(fr, bestRect)) { nextFree.push(fr); continue; }
      if (bestRect.x > fr.x) nextFree.push({ x: fr.x, y: fr.y, w: bestRect.x - fr.x, h: fr.h });
      if (bestRect.x + bestRect.w < fr.x + fr.w) nextFree.push({ x: bestRect.x + bestRect.w, y: fr.y, w: fr.x + fr.w - (bestRect.x + bestRect.w), h: fr.h });
      if (bestRect.y > fr.y) nextFree.push({ x: fr.x, y: fr.y, w: fr.w, h: bestRect.y - fr.y });
      if (bestRect.y + bestRect.h < fr.y + fr.h) nextFree.push({ x: fr.x, y: bestRect.y + bestRect.h, w: fr.w, h: fr.y + fr.h - (bestRect.y + bestRect.h) });
    }
    freeRects.length = 0;
    for (let i = 0; i < nextFree.length; i += 1) {
      const cand = nextFree[i]!;
      if (cand.w <= 0 || cand.h <= 0) continue;
      let redundant = false;
      for (let j = 0; j < nextFree.length; j += 1) {
        if (i !== j && isContainedIn(cand, nextFree[j]!)) { redundant = true; break; }
      }
      if (!redundant) freeRects.push(cand);
    }
  }
  return { placed };
}

function buildBoxFaceDescriptors(part: BoxPartSpec) {
  const [cx, cy, cz] = part.center;
  const [sx, sy, sz] = part.sizeMeters;
  const hx = sx * 0.5; const hy = sy * 0.5; const hz = sz * 0.5;
  return [
    { face: "+z" as const, metricW: sx, metricH: sy, normal: [0, 0, 1] as const, corners: [[cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz], [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz]] as const },
    { face: "-z" as const, metricW: sx, metricH: sy, normal: [0, 0, -1] as const, corners: [[cx + hx, cy - hy, cz - hz], [cx - hx, cy - hy, cz - hz], [cx - hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz - hz]] as const },
    { face: "+x" as const, metricW: sz, metricH: sy, normal: [1, 0, 0] as const, corners: [[cx + hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz + hz]] as const },
    { face: "-x" as const, metricW: sz, metricH: sy, normal: [-1, 0, 0] as const, corners: [[cx - hx, cy - hy, cz - hz], [cx - hx, cy - hy, cz + hz], [cx - hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz - hz]] as const },
    { face: "+y" as const, metricW: sx, metricH: sz, normal: [0, 1, 0] as const, corners: [[cx - hx, cy + hy, cz + hz], [cx + hx, cy + hy, cz + hz], [cx + hx, cy + hy, cz - hz], [cx - hx, cy + hy, cz - hz]] as const },
    { face: "-y" as const, metricW: sx, metricH: sz, normal: [0, -1, 0] as const, corners: [[cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz + hz], [cx - hx, cy - hy, cz + hz]] as const },
  ];
}

/** 텍셀 밀도 고정 Box-UV 아일랜드를 생성하고 MaxRects로 자동 패킹한다. */
export function packTexelLockedBoxUvs(parts: readonly BoxPartSpec[], options: TexelBoxUvPackOptions): TexelBoxUvPackResult {
  if (parts.length === 0) throw new Error("최소 1개 이상의 박스 파츠가 필요합니다.");
  const density = Math.max(1, options.texelDensityPxPerMeter);
  const gutterPx = Math.max(0, Math.floor(options.gutterPx ?? 2));
  const allowRotate = options.allowRotate ?? true;
  const minAtlas = nextPowerOfTwo(Math.max(16, Math.floor(options.minAtlasSize ?? 64)));

  const pending: PendingIsland[] = [];
  const faceGeoByKey = new Map<string, { readonly normal: readonly [number, number, number]; readonly corners: readonly (readonly [number, number, number])[] }>();
  let totalArea = 0; let maxDim = 0;

  for (const part of parts) {
    if (part.sizeMeters[0] <= 0 || part.sizeMeters[1] <= 0 || part.sizeMeters[2] <= 0) {
      throw new Error(`박스 파츠(${part.id})의 미터 치수는 모두 양수여야 합니다.`);
    }
    for (const f of buildBoxFaceDescriptors(part)) {
      const pixelW = Math.max(1, Math.round(f.metricW * density));
      const pixelH = Math.max(1, Math.round(f.metricH * density));
      pending.push({ partId: part.id, face: f.face, metricW: f.metricW, metricH: f.metricH, pixelW, pixelH });
      faceGeoByKey.set(`${part.id}:${f.face}`, { normal: f.normal, corners: f.corners });
      totalArea += (pixelW + gutterPx) * (pixelH + gutterPx);
      maxDim = Math.max(maxDim, pixelW + gutterPx * 2, pixelH + gutterPx * 2);
    }
  }

  let atlasSize = Math.max(minAtlas, nextPowerOfTwo(Math.max(maxDim, Math.ceil(Math.sqrt(totalArea)))));
  let packResult = null as ReturnType<typeof tryMaxRectsPack>;
  while (atlasSize <= MAX_ATLAS_RESOLUTION) {
    packResult = tryMaxRectsPack(pending, atlasSize, gutterPx, allowRotate);
    if (packResult) break;
    atlasSize *= 2;
  }
  if (!packResult) throw new Error(`요청한 텍셀 밀도(${density} px/m)가 최대 아틀라스(${MAX_ATLAS_RESOLUTION})를 초과했습니다.`);

  const faceCount = packResult.placed.length;
  const positions = new Float32Array(faceCount * 12);
  const normals = new Float32Array(faceCount * 12);
  const uvs = new Float32Array(faceCount * 8);
  const indices = new Uint32Array(faceCount * 6);
  const islands: PackedBoxFaceIsland[] = [];
  let usedPixels = 0;

  for (let i = 0; i < faceCount; i += 1) {
    const p = packResult.placed[i]!;
    const uMin = p.x / atlasSize; const vMin = p.y / atlasSize;
    const uMax = (p.x + p.w) / atlasSize; const vMax = (p.y + p.h) / atlasSize;
    usedPixels += p.w * p.h;
    islands.push({
      partId: p.item.partId, face: p.item.face,
      pixelX: p.x, pixelY: p.y, pixelWidth: p.w, pixelHeight: p.h, rotated90: p.rotated,
      uvRect: [uMin, vMin, uMax, vMax],
      achievedTexelDensity: 0.5 * (p.item.pixelW / p.item.metricW + p.item.pixelH / p.item.metricH),
    });

    const geo = faceGeoByKey.get(`${p.item.partId}:${p.item.face}`)!;
    const vBase = i * 4;
    const cornerUvs = p.rotated
      ? [[uMin, vMax], [uMin, vMin], [uMax, vMin], [uMax, vMax]] as const
      : [[uMin, vMin], [uMax, vMin], [uMax, vMax], [uMin, vMax]] as const;
    for (let c = 0; c < 4; c += 1) {
      const vIdx = vBase + c;
      const pos = geo.corners[c]!;
      positions[vIdx * 3] = pos[0]; positions[vIdx * 3 + 1] = pos[1]; positions[vIdx * 3 + 2] = pos[2];
      normals[vIdx * 3] = geo.normal[0]; normals[vIdx * 3 + 1] = geo.normal[1]; normals[vIdx * 3 + 2] = geo.normal[2];
      uvs[vIdx * 2] = cornerUvs[c]![0]; uvs[vIdx * 2 + 1] = cornerUvs[c]![1];
    }
    const tb = i * 6;
    indices[tb] = vBase; indices[tb + 1] = vBase + 1; indices[tb + 2] = vBase + 2;
    indices[tb + 3] = vBase; indices[tb + 4] = vBase + 2; indices[tb + 5] = vBase + 3;
  }

  return {
    atlasWidth: atlasSize, atlasHeight: atlasSize, gutterPx, targetTexelDensity: density,
    utilizationRatio: usedPixels / (atlasSize * atlasSize), islands, mesh: { positions, normals, uvs, indices },
  };
}

/** 특정 박스 파츠의 치수를 갱신하고 텍셀 밀도 고정 UV를 즉시 재패킹한다. */
export function updateBoxDimensionsAndRepack(
  parts: readonly BoxPartSpec[], targetPartId: string, nextSizeMeters: readonly [number, number, number], options: TexelBoxUvPackOptions,
): TexelBoxUvPackResult {
  return packTexelLockedBoxUvs(parts.map((p) => (p.id === targetPartId ? { ...p, sizeMeters: nextSizeMeters } : p)), options);
}

function projectWorldToScreen(vp: Float32Array, wx: number, wy: number, wz: number, vw: number, vh: number) {
  const cx = vp[0]! * wx + vp[4]! * wy + vp[8]! * wz + vp[12]!;
  const cy = vp[1]! * wx + vp[5]! * wy + vp[9]! * wz + vp[13]!;
  const cz = vp[2]! * wx + vp[6]! * wy + vp[10]! * wz + vp[14]!;
  const cw = vp[3]! * wx + vp[7]! * wy + vp[11]! * wz + vp[15]!;
  if (cw <= 1e-6) return { sx: 0, sy: 0, visible: false };
  const invW = 1 / cw;
  const ndcX = cx * invW; const ndcY = cy * invW; const ndcZ = cz * invW;
  return {
    sx: (ndcX * 0.5 + 0.5) * vw, sy: (0.5 - ndcY * 0.5) * vh,
    visible: ndcX >= -1.1 && ndcX <= 1.1 && ndcY >= -1.1 && ndcY <= 1.1 && ndcZ >= -1 && ndcZ <= 1,
  };
}

function pointToSegmentDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax; const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-8) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  return (px - (ax + abx * t)) ** 2 + (py - (ay + aby * t)) ** 2;
}

/** 아틀라스 가장자리 픽셀을 거터로 번지게 해 GPU 밉맵 심 번짐을 방지한다. */
export function dilateAtlasGutters(
  atlasRgba: Uint8ClampedArray, occupiedMask: Uint8Array, atlasWidth: number, atlasHeight: number, gutterPx: number,
): number {
  const passes = Math.max(0, Math.floor(gutterPx));
  if (passes === 0) return 0;
  let totalDilated = 0;
  let currMask = new Uint8Array(occupiedMask);
  const nextMask = new Uint8Array(occupiedMask.length);

  for (let p = 0; p < passes; p += 1) {
    nextMask.set(currMask);
    const snap = new Uint8ClampedArray(atlasRgba);
    for (let y = 0; y < atlasHeight; y += 1) {
      for (let x = 0; x < atlasWidth; x += 1) {
        const idx = y * atlasWidth + x;
        if (currMask[idx] === 1) continue;
        let rS = 0; let gS = 0; let bS = 0; let aS = 0; let cnt = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          const ny = y + oy;
          if (ny < 0 || ny >= atlasHeight) continue;
          for (let ox = -1; ox <= 1; ox += 1) {
            const nx = x + ox;
            if (nx < 0 || nx >= atlasWidth || (ox === 0 && oy === 0)) continue;
            const nIdx = ny * atlasWidth + nx;
            if (currMask[nIdx] === 1) {
              const o = nIdx * 4;
              rS += snap[o]!; gS += snap[o + 1]!; bS += snap[o + 2]!; aS += snap[o + 3]!; cnt += 1;
            }
          }
        }
        if (cnt > 0) {
          const o = idx * 4;
          atlasRgba[o] = Math.round(rS / cnt); atlasRgba[o + 1] = Math.round(gS / cnt);
          atlasRgba[o + 2] = Math.round(bS / cnt); atlasRgba[o + 3] = Math.round(aS / cnt);
          nextMask[idx] = 1; totalDilated += 1;
        }
      }
    }
    currMask = new Uint8Array(nextMask);
  }
  return totalDilated;
}

/** 스크린스페이스 브러시 스트로크를 3D 정면 삼각형의 UV 아틀라스 텍셀로 심 없이 역투영 페인팅한다. */
export function projectScreenStrokeToAtlas(
  atlasRgba: Uint8ClampedArray, packed: TexelBoxUvPackResult, camera: ScreenSpacePaintCamera, stroke: ScreenSpaceBrushStroke,
): ScreenSpacePaintStats {
  const { atlasWidth, atlasHeight, mesh } = packed;
  if (atlasRgba.length < atlasWidth * atlasHeight * 4) throw new Error("아틀라스 RGBA 버퍼 크기가 패킹된 해상도보다 작습니다.");
  if (stroke.points.length === 0) return { paintedTexels: 0, crossedIslands: 0, dilatedGutterTexels: 0 };

  const radius = Math.max(0.5, stroke.radiusPx);
  const radiusSq = radius * radius;
  const hardness = Math.max(0, Math.min(1, stroke.hardness));
  const opacity = Math.max(0, Math.min(1, stroke.opacity));
  const occupiedMask = new Uint8Array(atlasWidth * atlasHeight);
  const touchedFaces = new Set<number>();
  let paintedTexels = 0;

  for (let t = 0; t < Math.floor(mesh.indices.length / 3); t += 1) {
    const i0 = mesh.indices[t * 3]!; const i1 = mesh.indices[t * 3 + 1]!; const i2 = mesh.indices[t * 3 + 2]!;
    const p0x = mesh.positions[i0 * 3]!; const p0y = mesh.positions[i0 * 3 + 1]!; const p0z = mesh.positions[i0 * 3 + 2]!;
    const p1x = mesh.positions[i1 * 3]!; const p1y = mesh.positions[i1 * 3 + 1]!; const p1z = mesh.positions[i1 * 3 + 2]!;
    const p2x = mesh.positions[i2 * 3]!; const p2y = mesh.positions[i2 * 3 + 1]!; const p2z = mesh.positions[i2 * 3 + 2]!;

    const s0 = projectWorldToScreen(camera.viewProjectionMatrix, p0x, p0y, p0z, camera.viewportWidth, camera.viewportHeight);
    const s1 = projectWorldToScreen(camera.viewProjectionMatrix, p1x, p1y, p1z, camera.viewportWidth, camera.viewportHeight);
    const s2 = projectWorldToScreen(camera.viewProjectionMatrix, p2x, p2y, p2z, camera.viewportWidth, camera.viewportHeight);
    if (!s0.visible && !s1.visible && !s2.visible) continue;
    if ((s1.sx - s0.sx) * (s2.sy - s0.sy) - (s1.sy - s0.sy) * (s2.sx - s0.sx) >= 0) continue;

    const u0 = mesh.uvs[i0 * 2]! * atlasWidth; const v0 = mesh.uvs[i0 * 2 + 1]! * atlasHeight;
    const u1 = mesh.uvs[i1 * 2]! * atlasWidth; const v1 = mesh.uvs[i1 * 2 + 1]! * atlasHeight;
    const u2 = mesh.uvs[i2 * 2]! * atlasWidth; const v2 = mesh.uvs[i2 * 2 + 1]! * atlasHeight;
    const minX = Math.max(0, Math.floor(Math.min(u0, u1, u2)));
    const maxX = Math.min(atlasWidth - 1, Math.ceil(Math.max(u0, u1, u2)));
    const minY = Math.max(0, Math.floor(Math.min(v0, v1, v2)));
    const maxY = Math.min(atlasHeight - 1, Math.ceil(Math.max(v0, v1, v2)));
    const denom = (v1 - v2) * (u0 - u2) + (u2 - u1) * (v0 - v2);
    if (Math.abs(denom) < 1e-8) continue;
    const invD = 1 / denom;

    for (let ty = minY; ty <= maxY; ty += 1) {
      const py = ty + 0.5;
      for (let tx = minX; tx <= maxX; tx += 1) {
        const px = tx + 0.5;
        const w0 = ((v1 - v2) * (px - u2) + (u2 - u1) * (py - v2)) * invD;
        const w1 = ((v2 - v0) * (px - u2) + (u0 - u2) * (py - v2)) * invD;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;

        const maskIdx = ty * atlasWidth + tx;
        occupiedMask[maskIdx] = 1;
        const proj = projectWorldToScreen(
          camera.viewProjectionMatrix,
          p0x * w0 + p1x * w1 + p2x * w2,
          p0y * w0 + p1y * w1 + p2y * w2,
          p0z * w0 + p1z * w1 + p2z * w2,
          camera.viewportWidth, camera.viewportHeight,
        );
        if (!proj.visible) continue;

        let bestDistSq = Infinity;
        if (stroke.points.length === 1) {
          bestDistSq = (proj.sx - stroke.points[0]![0]) ** 2 + (proj.sy - stroke.points[0]![1]) ** 2;
        } else {
          for (let k = 0; k < stroke.points.length - 1; k += 1) {
            const dSq = pointToSegmentDistSq(proj.sx, proj.sy, stroke.points[k]![0], stroke.points[k]![1], stroke.points[k + 1]![0], stroke.points[k + 1]![1]);
            if (dSq < bestDistSq) bestDistSq = dSq;
          }
        }
        if (bestDistSq > radiusSq) continue;

        const distNorm = Math.sqrt(bestDistSq) / radius;
        const edgeSoft = hardness >= 0.999 ? 1 : distNorm <= hardness ? 1 : 1 - (distNorm - hardness) / Math.max(1e-5, 1 - hardness);
        const alpha = Math.max(0, Math.min(1, edgeSoft * edgeSoft * (3 - 2 * edgeSoft) * opacity * (stroke.colorRgba[3] / 255)));
        const off = maskIdx * 4;
        const invA = 1 - alpha;
        atlasRgba[off] = Math.round(atlasRgba[off]! * invA + stroke.colorRgba[0] * alpha);
        atlasRgba[off + 1] = Math.round(atlasRgba[off + 1]! * invA + stroke.colorRgba[1] * alpha);
        atlasRgba[off + 2] = Math.round(atlasRgba[off + 2]! * invA + stroke.colorRgba[2] * alpha);
        atlasRgba[off + 3] = Math.round(Math.min(255, atlasRgba[off + 3]! + (255 - atlasRgba[off + 3]!) * alpha));
        paintedTexels += 1;
        touchedFaces.add(Math.floor(t / 2));
      }
    }
  }

  return {
    paintedTexels,
    crossedIslands: touchedFaces.size,
    dilatedGutterTexels: dilateAtlasGutters(atlasRgba, occupiedMask, atlasWidth, atlasHeight, packed.gutterPx),
  };
}
