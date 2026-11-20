import { describe, expect, it } from "vitest";

import {
  encodeClipVectorStrokeBlob,
  extractSutCustomTipsAndPaperTextures,
  parseClipVectorStrokeBlob,
  restoreClipScreentoneLayersFromSqlite,
  restoreClipVectorLayersFromSqlite,
  type ClipVectorStroke,
} from "./clip-vector-layer";

import type { ClipSqliteDatabase, ClipSqliteSelect, ClipSqliteValue } from "./chunked-sqlite-document-types";
import type { CspSqliteSnapshot } from "./csp-sut";

function makeSyntheticPng(width: number, height: number, payloadByte = 0x42): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = new Uint8Array(25);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, 13, false);
  ihdr.set([0x49, 0x48, 0x44, 0x52], 4); // IHDR
  ihdrView.setUint32(8, width, false);
  ihdrView.setUint32(12, height, false);
  ihdr[16] = 8; // bitDepth
  ihdr[17] = 6; // RGBA

  const idat = new Uint8Array(13);
  const idatView = new DataView(idat.buffer);
  idatView.setUint32(0, 1, false);
  idat.set([0x49, 0x44, 0x41, 0x54], 4); // IDAT
  idat[8] = payloadByte;

  const iend = new Uint8Array(12);
  iend.set([0x49, 0x45, 0x4e, 0x44], 4); // IEND

  const out = new Uint8Array(sig.length + ihdr.length + idat.length + iend.length);
  out.set(sig, 0);
  out.set(ihdr, sig.length);
  out.set(idat, sig.length + ihdr.length);
  out.set(iend, sig.length + ihdr.length + idat.length);
  return out;
}

describe("clip-vector-layer", () => {
  it("TSV4 벡터 스트로크 1/16 서브픽셀·필압·선폭·농도를 무손실 왕복 복원한다", () => {
    const strokes: ClipVectorStroke[] = [
      {
        strokeId: "s1",
        brushWidth: 6.5,
        colorRgba: [20, 30, 40, 255],
        closed: false,
        isSpline: true,
        points: [
          { x: 10.25, y: 20.5, pressure: 0.4, width: 3.25, density: 0.8 },
          { x: 52.75, y: 84.125, pressure: 0.9, width: 6.5, density: 1.0 },
        ],
      },
    ];
    const encoded = encodeClipVectorStrokeBlob(strokes);
    const parsed = parseClipVectorStrokeBlob(encoded);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.strokes).toHaveLength(1);
    expect(parsed.strokes[0]!.isSpline).toBe(true);
    expect(parsed.strokes[0]!.colorRgba).toEqual([20, 30, 40, 255]);
    expect(parsed.strokes[0]!.points[0]!.x).toBeCloseTo(10.25, 3);
    expect(parsed.strokes[0]!.points[1]!.y).toBeCloseTo(84.125, 3);
    expect(parsed.strokes[0]!.points[1]!.pressure).toBeCloseTo(0.9, 2);
  });

  it("SQLite DB에서 벡터 레이어와 스크린톤(하프톤) 메타데이터를 복원한다", async () => {
    const vecBlob = encodeClipVectorStrokeBlob([
      {
        strokeId: "v0",
        brushWidth: 4,
        colorRgba: [0, 0, 0, 255],
        closed: true,
        isSpline: false,
        points: [
          { x: 0, y: 0, pressure: 1, width: 4, density: 1 },
          { x: 100, y: 0, pressure: 1, width: 4, density: 1 },
          { x: 100, y: 100, pressure: 1, width: 4, density: 1 },
        ],
      },
    ]);

    const tables: Record<string, { cols: string[]; rows: Record<string, ClipSqliteValue>[] }> = {
      Layer: {
        cols: [
          "MainId",
          "LayerName",
          "LayerUseEffect",
          "LayerEffectType",
          "LayerToneLines",
          "LayerToneAngle",
          "LayerToneDensity",
          "LayerToneShape",
          "LayerToneInvert",
        ],
        rows: [
          {
            MainId: 10,
            LayerName: "인물 선화 벡터",
            LayerUseEffect: 0,
            LayerEffectType: 0,
            LayerToneLines: 0,
            LayerToneAngle: 45,
            LayerToneDensity: 0,
            LayerToneShape: 0,
            LayerToneInvert: 0,
          },
          {
            MainId: 11,
            LayerName: "그림자 60L 톤",
            LayerUseEffect: 1,
            LayerEffectType: 2,
            LayerToneLines: 60,
            LayerToneAngle: 45,
            LayerToneDensity: 35,
            LayerToneShape: 2,
            LayerToneInvert: 1,
          },
        ],
      },
      VectorNormal: {
        cols: ["LayerId", "VectorData"],
        rows: [{ LayerId: 10, VectorData: vecBlob }],
      },
    };

    const db: ClipSqliteDatabase = {
      async tableColumns(table: string) {
        return tables[table]?.cols ?? null;
      },
      async select(request: ClipSqliteSelect) {
        const table = tables[request.table];
        if (!table) return [];
        return table.rows
          .filter((r) => !request.where || request.where.in.includes(Number(r[request.where.column])))
          .slice(0, request.limit)
          .map((r) => request.columns.map((c) => r[c.name] ?? null));
      },
      close() {},
    };

    const restoredVecs = await restoreClipVectorLayersFromSqlite(db, [10]);
    expect(restoredVecs).toHaveLength(1);
    expect(restoredVecs[0]!.layerName).toBe("인물 선화 벡터");
    expect(restoredVecs[0]!.totalPoints).toBe(3);
    expect(restoredVecs[0]!.strokes[0]!.closed).toBe(true);

    const restoredTones = await restoreClipScreentoneLayersFromSqlite(db, [10, 11]);
    expect(restoredTones.warnings).toEqual([]);
    expect(restoredTones.tones).toHaveLength(1);
    expect(restoredTones.tones[0]).toMatchObject({
      layerId: 11,
      layerName: "그림자 60L 톤",
      frequencyLpi: 60,
      angleDeg: 45,
      densityPercent: 35,
      pattern: "diamond",
      invert: true,
    });
  });

  it(".sut 스냅샷에서 커스텀 PNG 브러시 팁·듀얼 팁·종이 텍스처를 분류 추출하고 중복 해시를 제거한다", () => {
    const tipPng = makeSyntheticPng(64, 64, 0x11);
    const paperPng = makeSyntheticPng(256, 256, 0x22);
    const dualPng = makeSyntheticPng(32, 32, 0x33);
    const containerBlob = new Uint8Array(16 + tipPng.length + 12 + tipPng.length);
    containerBlob.set(tipPng, 16);
    // 동일 내용 중복 PNG 삽입 → 1건으로 중복 제거되어야 함
    containerBlob.set(tipPng, 16 + tipPng.length + 12);

    const snapshot: CspSqliteSnapshot = {
      tables: [
        {
          name: "MaterialFile",
          columns: ["OriginalPath", "FileData"],
          rows: [
            { OriginalPath: "BrushPatternImageArray/gpen_tip.png", FileData: containerBlob },
            { OriginalPath: "TextureImage/watercolor_paper_grain.png", FileData: paperPng },
            { OriginalPath: "DualBrushPattern/spatter_subtip.png", FileData: dualPng },
          ],
        },
      ],
    };

    const extracted = extractSutCustomTipsAndPaperTextures(snapshot);
    expect(extracted.warnings).toEqual([]);
    expect(extracted.allMaterials).toHaveLength(3);
    expect(extracted.tips).toHaveLength(1);
    expect(extracted.tips[0]!.width).toBe(64);
    expect(extracted.paperTextures).toHaveLength(1);
    expect(extracted.paperTextures[0]!.width).toBe(256);
    expect(extracted.dualTips).toHaveLength(1);
    expect(extracted.dualTips[0]!.width).toBe(32);
  });
});
