import { presetById } from "../../engine/presets/catalog";
import { splitFrames } from "../../engine/raster/reference-renderer";
import { createCpuReferenceLane } from "../../lanes/cpu-reference-lane";
import { createBristlePbdLane } from "../../lanes/physics/bristle-pbd-lane";
import { createRapierBristleLane } from "../../lanes/physics/rapier-bristle-lane";

import { drawText, FONT_HEIGHT } from "./mini-font";
import { buildStrokeSet } from "./stroke-set";

import type { NamedStroke } from "./stroke-set";
import type { Clock, LabImage } from "../../engine/core/types";
import type { BrushProgram } from "../../engine/presets/program-schema";
import type { BrushEngineLane } from "../../lanes/lane";

/**
 * 같은 획 세트를 cpu-reference·자체 PBD·Rapier로 그린 비교 시트. 타일은 흰 바탕에 합성한 sRGB 이미지다.
 * 시간은 주입한 `Clock`으로 잰다(Node 22 단일 스레드 값). 이 모듈은 PNG를 쓰지 않는다(파일 쓰기는 호출하는 테스트·스크립트의 일이다).
 */

export interface SheetColumn {
  id: string;
  /** 시트 라벨(영문 대문자). */
  label: string;
  /** 한글 설명(JSON 옆 설명용). */
  descriptionKo: string;
  make: () => BrushEngineLane;
}

/** 시트가 쓰는 프로그램: 붓펜 프리셋의 팁 지름만 키운 것(털 벌어짐이 잘 보이는 폭). 세 레인에 같은 프로그램을 쓴다. */
export function sheetProgram(sizePx = 36): BrushProgram {
  const base = presetById("ink-brush-pen");
  return { ...base, tip: { ...base.tip, sizePx } };
}

/** 기본 열: 기준선 1 + PBD 3 + Rapier 3 + 좌굴 곡선 PBD 1. */
export function defaultSheetColumns(): SheetColumn[] {
  return [
    { id: "cpu-reference", label: "CPU-REF", descriptionKo: "cpu-reference(Sumi 붓모 접촉 스칼라 모델, 같은 프로그램)", make: () => createCpuReferenceLane() },
    { id: "pbd-8", label: "PBD N8", descriptionKo: "자체 PBD 털 8올", make: () => createBristlePbdLane({ bristles: 8 }) },
    { id: "pbd-32", label: "PBD N32", descriptionKo: "자체 PBD 털 32올(기본)", make: () => createBristlePbdLane({ bristles: 32 }) },
    { id: "pbd-128", label: "PBD N128", descriptionKo: "자체 PBD 털 128올", make: () => createBristlePbdLane({ bristles: 128 }) },
    { id: "rapier-8", label: "RAPIER N8", descriptionKo: "Rapier 2D 털 8올", make: () => createRapierBristleLane({ bristles: 8 }) },
    { id: "rapier-32", label: "RAPIER N32", descriptionKo: "Rapier 2D 털 32올", make: () => createRapierBristleLane({ bristles: 32 }) },
    { id: "rapier-128", label: "RAPIER N128", descriptionKo: "Rapier 2D 털 128올", make: () => createRapierBristleLane({ bristles: 128 }) },
    { id: "pbd-32-buckling", label: "PBD N32 BUCKLE", descriptionKo: "자체 PBD 털 32올 + 3D 좌굴을 흉내 낸 비단조 압력 곡선", make: () => createBristlePbdLane({ bristles: 32, spreadCurve: "buckling-3d" }) },
  ];
}

export interface SheetTile {
  strokeId: string;
  columnId: string;
  /** 흰 바탕에 합성한 sRGB RGBA8. */
  image: LabImage;
  /** 그리기(addSamples 전부 + endStroke) 경과(ms, Node 22 단일 스레드). */
  drawMs: number;
  dabs: number;
  /** 알파 > 12인 픽셀 비율. */
  inkCoverage: number;
  /** 잉크 픽셀의 평균 알파(0..1). */
  meanInkAlpha: number;
  /** 영수증의 한글 사유(없으면 빈 배열). */
  notesKo: string[];
}

export interface SheetResult {
  size: number;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  tiles: SheetTile[];
  columns: SheetColumn[];
  strokes: NamedStroke[];
}

/** 알파가 있는 straight RGBA를 흰 바탕에 합성한다. */
export function compositeOverWhite(image: LabImage): LabImage {
  const out = new Uint8ClampedArray(image.data.length);
  for (let i = 0; i < image.data.length; i += 4) {
    const a = (image.data[i + 3] ?? 0) / 255;
    out[i] = Math.round((image.data[i] ?? 0) * a + 255 * (1 - a));
    out[i + 1] = Math.round((image.data[i + 1] ?? 0) * a + 255 * (1 - a));
    out[i + 2] = Math.round((image.data[i + 2] ?? 0) * a + 255 * (1 - a));
    out[i + 3] = 255;
  }
  return { width: image.width, height: image.height, data: out };
}

function inkStats(image: LabImage): { coverage: number; meanAlpha: number } {
  let n = 0;
  let sum = 0;
  for (let i = 3; i < image.data.length; i += 4) {
    const a = image.data[i] ?? 0;
    if (a > 12) {
      n += 1;
      sum += a;
    }
  }
  return { coverage: n / (image.width * image.height), meanAlpha: n > 0 ? sum / n / 255 : 0 };
}

export interface RenderTileOptions {
  size: number;
  program: BrushProgram;
  color: readonly [number, number, number, number];
  seed: number;
  clock: Clock;
}

/** 레인 하나로 획 하나를 그려 타일을 만든다. */
export async function renderTile(column: SheetColumn, stroke: NamedStroke, opts: RenderTileOptions): Promise<SheetTile> {
  const lane = column.make();
  await lane.init({ clock: opts.clock }, { width: opts.size, height: opts.size, dpr: 1, tileSize: 16, seed: opts.seed });
  try {
    lane.beginStroke(opts.program, opts.seed, { color: opts.color });
    const t0 = opts.clock.now();
    for (const frame of splitFrames(stroke.samples)) lane.addSamples(frame);
    const receipt = await lane.endStroke();
    const drawMs = opts.clock.now() - t0;
    const raw = await lane.readback();
    const stats = inkStats(raw);
    const notes = (receipt as { notesKo?: unknown }).notesKo;
    return {
      strokeId: stroke.id,
      columnId: column.id,
      image: compositeOverWhite(raw),
      drawMs,
      dabs: receipt.dabCount,
      inkCoverage: stats.coverage,
      meanInkAlpha: stats.meanAlpha,
      notesKo: Array.isArray(notes) ? notes.filter((n): n is string => typeof n === "string") : [],
    };
  } finally {
    lane.dispose();
  }
}

const GAP = 4;
const LABEL_H = FONT_HEIGHT + 7;

/** 행 = 획, 열 = 레인으로 시트를 그린다. 각 타일 아래에 `획 열 ms dab` 라벨이 붙는다. */
export async function renderComparisonSheet(opts: {
  size: number;
  strokes?: NamedStroke[];
  columns?: SheetColumn[];
  program?: BrushProgram;
  color?: readonly [number, number, number, number];
  seed?: number;
  clock: Clock;
}): Promise<SheetResult> {
  const size = opts.size;
  const strokes = opts.strokes ?? buildStrokeSet(size);
  const columns = opts.columns ?? defaultSheetColumns();
  const program = opts.program ?? sheetProgram(Math.round((36 * size) / 256));
  const color = opts.color ?? [0.06, 0.07, 0.16, 1];
  const seed = opts.seed ?? 7;
  const tiles: SheetTile[] = [];
  for (const stroke of strokes) {
    for (const column of columns) {
      tiles.push(await renderTile(column, stroke, { size, program, color, seed, clock: opts.clock }));
    }
  }
  const cellW = size + GAP;
  const cellH = size + LABEL_H + GAP;
  const width = columns.length * cellW + GAP;
  const height = strokes.length * cellH + LABEL_H + GAP;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 118;
    rgba[i + 1] = 118;
    rgba[i + 2] = 118;
    rgba[i + 3] = 255;
  }
  // 머리글: 열 라벨.
  for (let c = 0; c < columns.length; c += 1) {
    drawText(rgba, width, height, GAP + c * cellW + 2, 4, columns[c]?.label ?? "", [255, 255, 255]);
  }
  for (let r = 0; r < strokes.length; r += 1) {
    for (let c = 0; c < columns.length; c += 1) {
      const tile = tiles[r * columns.length + c];
      if (!tile) continue;
      const ox = GAP + c * cellW;
      const oy = LABEL_H + GAP + r * cellH;
      for (let y = 0; y < size; y += 1) {
        rgba.set(tile.image.data.subarray(y * size * 4, (y + 1) * size * 4), ((oy + y) * width + ox) * 4);
      }
      // 타일 아래 라벨 바(밝은 회색).
      for (let y = size; y < size + LABEL_H; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const o = ((oy + y) * width + ox + x) * 4;
          rgba[o] = 226;
          rgba[o + 1] = 226;
          rgba[o + 2] = 226;
          rgba[o + 3] = 255;
        }
      }
      drawText(rgba, width, height, ox + 2, oy + size + 3, `${strokes[r]?.label ?? ""} ${Math.round(tile.drawMs)}MS ${tile.dabs}D`, [30, 30, 30]);
    }
  }
  return { size, width, height, rgba, tiles, columns, strokes };
}
