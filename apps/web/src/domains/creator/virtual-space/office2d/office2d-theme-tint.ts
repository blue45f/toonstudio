import type { StudioSpaceThemeKey } from "../studio-virtual-space-theme";
import { isStudioSpaceThemeKey, studioSpaceTheme } from "../studio-virtual-space-theme";
import type { Office2dFloorKind } from "./office2d-scene";

/**
 * 기본 2D 스튜디오의 공간 테마 색 입히기.
 * 예전에는 테마를 바꿔도 방 안쪽 24% 투명 벽화만 바뀌어 13개 테마가 거의 같은 화면으로 보였다.
 * 테마가 이미 정의한 구역 톤별 바닥색(floors)을 바닥 텍스처 위에 적당한 세기로 입혀 질감은 살리고 분위기만 바꾼다.
 * 기본 테마(모던 오피스)는 지금의 기본 모습이라 입히지 않는다.
 */
export const OFFICE2D_THEME_FLOOR_ALPHA = 0.46;

/** 2D 바닥 재질 → 테마의 구역 톤. 재질의 성격(나무·카펫·석재 등)이 맞는 톤을 고른다. */
const FLOOR_TONE = {
  oak: "oak",
  walnut: "wood",
  herringbone: "wood",
  "carpet-sage": "lavender",
  "carpet-navy": "carpet",
  terrazzo: "marble",
  concrete: "stone",
  "tile-cream": "mosaic",
  cork: "cafe",
  generic: "stone",
} as const satisfies Readonly<Record<Office2dFloorKind, keyof ReturnType<typeof studioSpaceTheme>["floors"]>>;

const hex = (value: number): string => `#${value.toString(16).padStart(6, "0")}`;

/** 벽 기본색에 테마 벽색을 섞는 비율. */
export const OFFICE2D_THEME_WALL_MIX = 0.5;

function parseHex(color: string): readonly [number, number, number] | null {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/iu.exec(color);
  if (short) return [short[1], short[2], short[3]].map((digit) => Number.parseInt(`${digit}${digit}`, 16)) as unknown as readonly [number, number, number];
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(color);
  return long ? [Number.parseInt(long[1] ?? "0", 16), Number.parseInt(long[2] ?? "0", 16), Number.parseInt(long[3] ?? "0", 16)] : null;
}

/** 방의 기본 벽색을 공간 테마 벽색 쪽으로 섞은 색. 기본·알 수 없는 테마이거나 색을 읽지 못하면 원래 색을 그대로 돌려준다. */
export function office2dThemeWallTone(theme: StudioSpaceThemeKey | null | undefined, baseTone: string): string {
  if (!theme || theme === "modern-office" || !isStudioSpaceThemeKey(theme)) return baseTone;
  const base = parseHex(baseTone);
  const target = parseHex(hex(studioSpaceTheme(theme).wallTints.marble));
  if (!base || !target) return baseTone;
  const mixed = base.map((channel, index) => Math.round(channel + ((target[index] ?? channel) - channel) * OFFICE2D_THEME_WALL_MIX));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** 공간 테마가 이 재질 바닥에 입힐 색. 기본·알 수 없는 테마면 null(입히지 않는다). */
export function office2dThemeFloorColor(theme: StudioSpaceThemeKey | null | undefined, floor: Office2dFloorKind): string | null {
  if (!theme || theme === "modern-office" || !isStudioSpaceThemeKey(theme)) return null;
  return hex(studioSpaceTheme(theme).floors[FLOOR_TONE[floor]].base);
}
