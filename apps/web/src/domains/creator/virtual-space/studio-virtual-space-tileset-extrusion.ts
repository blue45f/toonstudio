/**
 * 타일셋 가장자리 확장(extrude).
 *
 * 타일맵은 한 장의 아틀라스에서 칸 단위로 잘라 그린다. 칸 경계가 화면 픽셀에 딱 맞지 않거나(줌 2.07, DPR 2 등) 칸을 뒤집어 그리면,
 * 이중선형 보간이 경계 바깥 텍셀(아틀라스에서 옆에 붙은 다른 재질)을 최대 절반까지 끌어와 칸 사이에 1px 밝은·어두운 실선이 생긴다
 * (돌길 위 흰 실선, 실측 +14% 밝기). 각 칸의 바깥 한 줄을 복제해 칸 사이에 두면 경계를 넘어서 읽어도 같은 칸 색만 나온다.
 *
 * 원본 이미지는 그대로 두고, 칸마다 확장한 캔버스를 만들어 타일셋 이미지로 쓴다(여백 1px, 간격 2px).
 * 확장 폭이 늘어난 만큼 텍스처가 아주 조금 커지므로 너무 큰 타일셋과 소수 타일 크기는 건드리지 않는다.
 */
import type { StudioTileset } from "./studio-virtual-space-tile-chunks";

/** 칸마다 바깥으로 복제해 붙이는 픽셀 수. 이중선형 보간이 경계를 넘어 읽는 폭(최대 1텍셀)을 덮는다. */
export const STUDIO_TILESET_EXTRUDE = 1;
const MAX_EXTRUDED_SIDE = 4096;
const MAX_EXTRUDED_PIXELS = 4 * 1024 * 1024;

type TileGeometry = Pick<StudioTileset, "tileWidth" | "tileHeight" | "columns" | "tileCount" | "margin" | "spacing">;

export interface StudioExtrudedLayout {
  /** Phaser addTilesetImage에 넘기는 값: 확장한 이미지에서 첫 칸까지의 여백. */
  readonly margin: number;
  /** 칸과 칸 사이 간격(양쪽 확장 폭의 합). */
  readonly spacing: number;
  readonly width: number;
  readonly height: number;
}

/** 확장한 이미지의 크기와 Phaser 타일셋 여백·간격. 다룰 수 없는 타일셋이면 null. */
export function studioExtrudedTilesetLayout(tileset: TileGeometry, extrude = STUDIO_TILESET_EXTRUDE): StudioExtrudedLayout | null {
  const { tileWidth, tileHeight, columns, tileCount } = tileset;
  if (![tileWidth, tileHeight, columns, tileCount, extrude].every(Number.isInteger)) return null;
  if (tileWidth <= 0 || tileHeight <= 0 || columns <= 0 || tileCount <= 0 || extrude <= 0) return null;
  const rows = Math.ceil(tileCount / columns);
  const spacing = extrude * 2;
  const width = extrude * 2 + columns * tileWidth + (columns - 1) * spacing;
  const height = extrude * 2 + rows * tileHeight + (rows - 1) * spacing;
  if (width > MAX_EXTRUDED_SIDE || height > MAX_EXTRUDED_SIDE || width * height > MAX_EXTRUDED_PIXELS) return null;
  return { margin: extrude, spacing, width, height };
}

/** CanvasRenderingContext2D 중 확장에 쓰는 부분만. */
export interface StudioExtrusionContext {
  imageSmoothingEnabled: boolean;
  drawImage(image: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
}

/** 칸을 옮겨 그리고 바깥 한 줄씩(좌우 먼저, 위아래는 좌우 확장까지 포함해 모서리까지) 복제한다. */
export function drawStudioExtrudedTileset(
  context: StudioExtrusionContext,
  canvas: unknown,
  image: unknown,
  tileset: TileGeometry,
  layout: StudioExtrudedLayout,
  extrude = STUDIO_TILESET_EXTRUDE,
): void {
  // 같은 픽셀을 그대로 복제해야 하므로 보간을 끈다.
  context.imageSmoothingEnabled = false;
  const { tileWidth, tileHeight, columns } = tileset;
  for (let index = 0; index < tileset.tileCount; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const sx = tileset.margin + column * (tileWidth + tileset.spacing);
    const sy = tileset.margin + row * (tileHeight + tileset.spacing);
    const dx = layout.margin + column * (tileWidth + layout.spacing);
    const dy = layout.margin + row * (tileHeight + layout.spacing);
    context.drawImage(image, sx, sy, tileWidth, tileHeight, dx, dy, tileWidth, tileHeight);
    context.drawImage(image, sx, sy, 1, tileHeight, dx - extrude, dy, extrude, tileHeight);
    context.drawImage(image, sx + tileWidth - 1, sy, 1, tileHeight, dx + tileWidth, dy, extrude, tileHeight);
    context.drawImage(canvas, dx - extrude, dy, tileWidth + extrude * 2, 1, dx - extrude, dy - extrude, tileWidth + extrude * 2, extrude);
    context.drawImage(canvas, dx - extrude, dy + tileHeight - 1, tileWidth + extrude * 2, 1, dx - extrude, dy + tileHeight, tileWidth + extrude * 2, extrude);
  }
}

/** TextureManager 중 교체에 쓰는 부분만. */
export interface StudioTilesetTexturePort {
  exists(key: string): boolean;
  get(key: string): { getSourceImage(): unknown };
  remove(key: string): unknown;
  addCanvas?(key: string, canvas: HTMLCanvasElement): unknown;
}

export interface StudioExtrudedTileset extends StudioExtrudedLayout {
  /** 확장한 캔버스 텍스처의 키. 원본 텍스처 키가 아니다. */
  readonly key: string;
}

/**
 * 로드된 타일셋 텍스처를 확장한 캔버스 텍스처로 바꾼다. 성공하면 원본 텍스처를 지우고(메모리) 새 키와 여백·간격을 돌려준다.
 * 어느 단계든 실패하면 null이고, 그때는 원본 텍스처가 그대로 남아 있다.
 */
export function extrudeStudioTilesetTexture(
  textures: StudioTilesetTexturePort,
  key: string,
  tileset: TileGeometry,
  createCanvas: ((width: number, height: number) => HTMLCanvasElement) | undefined,
): StudioExtrudedTileset | null {
  if (!textures.addCanvas || !createCanvas || !textures.exists(key)) return null;
  const layout = studioExtrudedTilesetLayout(tileset);
  if (!layout) return null;
  try {
    const canvas = createCanvas(layout.width, layout.height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    drawStudioExtrudedTileset(context, canvas, textures.get(key).getSourceImage(), tileset, layout);
    const extrudedKey = `${key}:extruded`;
    if (textures.exists(extrudedKey)) textures.remove(extrudedKey);
    if (!textures.addCanvas(extrudedKey, canvas)) return null;
    textures.remove(key);
    return { ...layout, key: extrudedKey };
  } catch {
    return null;
  }
}
