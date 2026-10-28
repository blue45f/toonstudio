import metadata from "./office2d-atlas-metadata.json";
import type { Office2dCharacterKey } from "./office2d-sprite-catalog";

export type Office2dAtlasSheet = "walk" | "work";
export interface Office2dAtlasRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface Office2dAtlasPoint { readonly x: number; readonly y: number }
export interface Office2dGeneratedAtlasFrame {
  readonly source: Office2dAtlasRect;
  readonly anchor: Office2dAtlasPoint;
  readonly head: Office2dAtlasPoint;
  readonly referenceHead: Office2dAtlasPoint;
  readonly pixels: number;
}
export interface Office2dGeneratedAtlas {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly rows: number;
  readonly sha256: string;
  readonly originalUrl: string;
  readonly originalSha256: string;
  readonly originalBytes: number;
  readonly runtimeBytes: number;
  readonly frames: readonly Office2dGeneratedAtlasFrame[];
}

/** PNG가 권위이며 이 JSON은 build-office2d-atlas-metadata.py로 재생성한다. */
const generatedAtlases: Readonly<Record<string, Office2dGeneratedAtlas>> = metadata.sheets;

export function office2dGeneratedAtlas(character: Office2dCharacterKey, sheet: Office2dAtlasSheet): Office2dGeneratedAtlas | null {
  return generatedAtlases[`${character}:${sheet}`] ?? null;
}
