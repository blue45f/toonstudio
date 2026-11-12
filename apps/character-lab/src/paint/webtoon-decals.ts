/**
 * 웹툰 캐릭터 3D 표면 디테일 스탬프(데칼): 눈물점·사선 볼터치·반창고·별 반짝이 문양을
 * 절차적 SDF 마스크로 생성해 UV 레이어에 1 undo 토큰 단위로 합성한다.
 */
import { PAINT_TILE_SIZE } from "../contracts";

import { brushLinearColor, compositePixelLinear, createTileSnapshotSet, snapshotTile, toUndoToken, wrapUnit } from "./paint-layer";

import type { MutablePaintLayer } from "./paint-layer";
import type { PaintUndoToken } from "../contracts";

export const WEBTOON_DECAL_IDS = ["beauty-mark", "blush-slash", "cross-plaster", "star-sparkle"] as const;
export type WebtoonDecalId = (typeof WEBTOON_DECAL_IDS)[number];

export interface WebtoonDecalSpec {
  readonly id: WebtoonDecalId;
  readonly labelKo: string;
  readonly defaultUv: readonly [number, number];
  readonly defaultScalePx: number;
  readonly defaultColor: string;
}

export const WEBTOON_DECAL_SPECS: readonly WebtoonDecalSpec[] = Object.freeze([
  { id: "beauty-mark", labelKo: "눈물점", defaultUv: [0.38, 0.36], defaultScalePx: 6, defaultColor: "#2b1d22" },
  { id: "blush-slash", labelKo: "사선 볼터치", defaultUv: [0.34, 0.38], defaultScalePx: 26, defaultColor: "#ee6b7a" },
  { id: "cross-plaster", labelKo: "반창고", defaultUv: [0.35, 0.40], defaultScalePx: 22, defaultColor: "#f3c7a4" },
  { id: "star-sparkle", labelKo: "별 문양", defaultUv: [0.36, 0.35], defaultScalePx: 18, defaultColor: "#ffd45c" },
]);

export function isWebtoonDecalId(value: string): value is WebtoonDecalId {
  return (WEBTOON_DECAL_IDS as readonly string[]).includes(value);
}

export interface StampWebtoonDecalOptions {
  readonly uv?: readonly [number, number];
  readonly scalePx?: number;
  readonly color?: string;
  readonly opacity?: number;
  readonly symmetry?: boolean;
  readonly wrap?: boolean;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 정규화된 로컬 좌표 (nx, ny) ∈ [-1, 1]² 에서 각 데칼의 알파 커버리지(0..1) */
export function evaluateWebtoonDecalAlpha(decalId: WebtoonDecalId, nx: number, ny: number): number {
  switch (decalId) {
    case "beauty-mark": {
      const dist = Math.hypot(nx, ny);
      return clamp01((0.85 - dist) * 4.5);
    }
    case "blush-slash": {
      // 3개의 평행한 웹툰 사선 빗금 + 부드러운 타원 감쇠
      const rotX = nx * 0.82 + ny * 0.57;
      const rotY = -nx * 0.57 + ny * 0.82;
      const envelope = clamp01(1 - Math.hypot(nx * 0.9, ny * 1.35));
      if (envelope <= 0) return 0;
      let slash = 0;
      for (const offset of [-0.46, 0, 0.46]) {
        const lineDist = Math.hypot((rotX - offset) * 5.2, rotY * 1.4);
        slash = Math.max(slash, clamp01(1.15 - lineDist));
      }
      return clamp01(slash * (0.45 + 0.55 * envelope));
    }
    case "cross-plaster": {
      // 둥근 직사각형 반창고 패치
      const rx = nx * 0.92 + ny * 0.39;
      const ry = -nx * 0.39 + ny * 0.92;
      const box = Math.max(Math.abs(rx) / 0.88, Math.abs(ry) / 0.34);
      if (box > 1) return 0;
      const padEdge = Math.abs(rx) < 0.3 ? 0.96 : 0.84;
      return clamp01((1.05 - box) * 6) * padEdge;
    }
    case "star-sparkle": {
      // 4각 아스트로이드 별 반짝이(|x|^0.55 + |y|^0.55 <= 1)
      const ax = Math.abs(nx);
      const ay = Math.abs(ny);
      if (ax > 1 || ay > 1) return 0;
      const astroid = Math.pow(ax, 0.55) + Math.pow(ay, 0.55);
      return clamp01((0.96 - astroid) * 3.8);
    }
  }
}

function stampSingleCenter(
  layer: MutablePaintLayer,
  decalId: WebtoonDecalId,
  u: number,
  v: number,
  scalePx: number,
  srcLinear: readonly [number, number, number],
  opacity: number,
  wrap: boolean,
  snapshots: ReturnType<typeof createTileSnapshotSet>,
): void {
  const { width, height, rgba } = layer;
  const cx = (wrap ? wrapUnit(u) : clamp01(u)) * width;
  const cy = (wrap ? wrapUnit(v) : clamp01(v)) * height;
  const radius = Math.max(2, Math.min(128, scalePx));
  const x0 = Math.floor(cx - radius - 1);
  const x1 = Math.ceil(cx + radius + 1);
  const y0 = Math.floor(cy - radius - 1);
  const y1 = Math.ceil(cy + radius + 1);

  for (let py = y0; py <= y1; py += 1) {
    const y = wrap ? ((py % height) + height) % height : py;
    if (y < 0 || y >= height) continue;
    const ny = (py + 0.5 - cy) / radius;
    for (let px = x0; px <= x1; px += 1) {
      const x = wrap ? ((px % width) + width) % width : px;
      if (x < 0 || x >= width) continue;
      const nx = (px + 0.5 - cx) / radius;
      const mask = evaluateWebtoonDecalAlpha(decalId, nx, ny);
      if (mask <= 0) continue;
      const sa = opacity * mask;
      if (sa <= 0) continue;
      snapshotTile(snapshots, Math.floor(x / PAINT_TILE_SIZE), Math.floor(y / PAINT_TILE_SIZE));
      compositePixelLinear(rgba, (y * width + x) * 4, srcLinear, sa);
    }
  }
}

/**
 * 선택한 웹툰 디테일 데칼을 레이어에 스탬프하고 undo 토큰을 반환한다.
 * `symmetry: true`이면 `1 - u` 대칭 위치에도 함께 찍어 양볼 볼터치·대칭 문양을 한 번에 완성한다.
 */
export function stampWebtoonDecal(
  layer: MutablePaintLayer,
  decalId: WebtoonDecalId,
  options: StampWebtoonDecalOptions = {},
): PaintUndoToken {
  const spec = WEBTOON_DECAL_SPECS.find((item) => item.id === decalId) ?? WEBTOON_DECAL_SPECS[0]!;
  const [u, v] = options.uv ?? spec.defaultUv;
  const scalePx = options.scalePx ?? spec.defaultScalePx;
  const color = brushLinearColor((options.color ?? spec.defaultColor).toLowerCase());
  const opacity = clamp01(options.opacity ?? 0.9);
  const wrap = options.wrap ?? true;
  const snapshots = createTileSnapshotSet(layer);

  stampSingleCenter(layer, decalId, u, v, scalePx, color, opacity, wrap, snapshots);
  if (options.symmetry && Math.abs(u - 0.5) * layer.width >= 1) {
    stampSingleCenter(layer, decalId, 1 - u, v, scalePx, color, opacity, wrap, snapshots);
  }
  if (snapshots.tiles.size > 0) {
    layer.revision += 1;
  }
  return toUndoToken(snapshots);
}
