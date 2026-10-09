import { writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { pixelHash } from "../metrics/render-metrics";

import { compositeOverWhite, defaultSheetColumns, renderComparisonSheet, renderTile, sheetProgram } from "./comparison-sheet";
import { supportsGlyph } from "./mini-font";
import { encodePng } from "./png-encode";
import { buildStrokeSet, STROKE_SET_IDS } from "./stroke-set";

import type { SheetColumn } from "./comparison-sheet";

const NOW = (): number => performance.now();

describe("stroke-set: 같은 획 세트", () => {
  it("압력 램프·급선회·빠른 휘갈김 3종이 결정적으로 만들어진다", () => {
    const a = buildStrokeSet(256);
    const b = buildStrokeSet(256);
    expect(a.map((s) => s.id)).toEqual([...STROKE_SET_IDS]);
    expect(a.map((s) => s.samples)).toEqual(b.map((s) => s.samples));
    for (const s of a) {
      expect(s.samples[0]?.phase).toBe("down");
      expect(s.samples[s.samples.length - 1]?.phase).toBe("up");
      expect(s.samples.every((p) => p.x >= 0 && p.x <= 256 && p.y >= 0 && p.y <= 256)).toBe(true);
      expect(s.samples.every((p) => p.pressure > 0 && p.pressure <= 1)).toBe(true);
      expect(s.descriptionKo.length).toBeGreaterThan(10);
    }
  });

  it("압력 램프는 압력이 단조 증가하고, 급선회는 약 520 px/s, 휘갈김은 램프보다 훨씬 빠르다", () => {
    const [ramp, turn, scribble] = buildStrokeSet(256);
    expect(ramp).toBeDefined();
    const p = ramp?.samples.map((s) => s.pressure) ?? [];
    for (let i = 1; i < p.length; i += 1) expect(p[i] ?? 0).toBeGreaterThanOrEqual(p[i - 1] ?? 0);
    expect(p[0]).toBeCloseTo(0.05, 3);
    expect(p[p.length - 1]).toBeCloseTo(1, 3);
    expect(turn?.meanSpeedPxPerSec).toBeGreaterThan(480);
    expect(turn?.meanSpeedPxPerSec).toBeLessThan(560);
    expect(scribble?.meanSpeedPxPerSec ?? 0).toBeGreaterThan(5 * (ramp?.meanSpeedPxPerSec ?? 1));
  });

  it("캔버스 크기에 비례해 좌표가 커진다", () => {
    const small = buildStrokeSet(128)[0];
    const big = buildStrokeSet(512)[0];
    expect(big?.samples[10]?.x).toBeCloseTo((small?.samples[10]?.x ?? 0) * 4, 6);
  });
});

describe("comparison-sheet: 축소 시트(96 px)", () => {
  it("행×열 타일을 그리고 라벨 포함 크기가 맞으며 같은 입력은 같은 픽셀이다", async () => {
    const columns: SheetColumn[] = defaultSheetColumns().filter((c) => ["cpu-reference", "pbd-8", "rapier-8"].includes(c.id));
    expect(columns.map((c) => c.id)).toEqual(["cpu-reference", "pbd-8", "rapier-8"]);
    const run = () => renderComparisonSheet({ size: 96, columns, clock: { now: NOW } });
    const a = await run();
    const b = await run();
    expect(a.tiles).toHaveLength(9);
    expect(a.width).toBe(3 * (96 + 4) + 4);
    expect(a.rgba.length).toBe(a.width * a.height * 4);
    for (let i = 0; i < a.tiles.length; i += 1) {
      const t = a.tiles[i];
      expect(t?.image.data.length).toBe(96 * 96 * 4);
      expect(t?.inkCoverage ?? 0, `${t?.strokeId}/${t?.columnId}`).toBeGreaterThan(0.01);
      expect(t?.dabs ?? 0).toBeGreaterThan(0);
      expect(t?.drawMs ?? -1).toBeGreaterThanOrEqual(0);
      // 타일 픽셀은 같은 입력에서 비트 단위로 같다.
      expect(pixelHash(t?.image ?? { width: 0, height: 0, data: new Uint8ClampedArray(0) })).toBe(pixelHash(b.tiles[i]?.image ?? { width: 0, height: 0, data: new Uint8ClampedArray(0) }));
    }
    expect(Array.from(a.rgba.subarray(0, 4000))).toEqual(Array.from(b.rgba.subarray(0, 4000)));
    // PNG로 인코딩된다.
    const png = encodePng(a.width, a.height, a.rgba);
    expect(png.length).toBeGreaterThan(a.width * a.height * 4);
  });

  it("흰 바탕 합성: 알파 0은 흰색, 알파 255는 원색", () => {
    const img = { width: 2, height: 1, data: new Uint8ClampedArray([10, 20, 30, 0, 10, 20, 30, 255]) };
    expect(Array.from(compositeOverWhite(img).data)).toEqual([255, 255, 255, 255, 10, 20, 30, 255]);
  });

  it("타일 영수증 사유를 한글로 가져온다(레인이 알린 notesKo)", async () => {
    const stroke = buildStrokeSet(64)[0];
    const column = defaultSheetColumns().find((c) => c.id === "pbd-8");
    if (!stroke || !column) throw new Error("시험 준비 실패");
    const tile = await renderTile(column, stroke, { size: 64, program: sheetProgram(14), color: [0, 0, 0, 1], seed: 1, clock: { now: NOW } });
    expect(Array.isArray(tile.notesKo)).toBe(true);
    expect(tile.image.width).toBe(64);
  });
});

describe("comparison-sheet: 증거 시트(환경변수로 켠다)", () => {
  it("BRUSH_LAB_PHYSICS_SHEET_DIR가 있으면 256 px 시트와 지표 JSON을 쓴다", async () => {
    const dir = process.env.BRUSH_LAB_PHYSICS_SHEET_DIR;
    if (!dir) {
      // 환경변수가 없으면 이 시험은 형식만 확인한다(건너뛰지 않는다).
      expect(defaultSheetColumns().every((c) => [...c.label].every((ch) => supportsGlyph(ch)))).toBe(true);
      return;
    }
    const sheet = await renderComparisonSheet({ size: 256, clock: { now: NOW } });
    writeFileSync(path.join(dir, "br1-physics-sheet.png"), encodePng(sheet.width, sheet.height, sheet.rgba));
    writeFileSync(
      path.join(dir, "br1-physics-sheet.json"),
      JSON.stringify(
        {
          node: process.version,
          size: sheet.size,
          columns: sheet.columns.map((c) => ({ id: c.id, label: c.label, descriptionKo: c.descriptionKo })),
          strokes: sheet.strokes.map((s) => ({ id: s.id, label: s.label, descriptionKo: s.descriptionKo, pathLengthPx: Math.round(s.pathLengthPx), meanSpeedPxPerSec: Math.round(s.meanSpeedPxPerSec) })),
          tiles: sheet.tiles.map((t) => ({ stroke: t.strokeId, column: t.columnId, drawMs: Math.round(t.drawMs), dabs: t.dabs, inkCoverage: Number(t.inkCoverage.toFixed(4)), meanInkAlpha: Number(t.meanInkAlpha.toFixed(3)), notesKo: t.notesKo })),
        },
        null,
        1,
      ),
    );
    expect(sheet.tiles.length).toBe(sheet.strokes.length * sheet.columns.length);
  });
});
