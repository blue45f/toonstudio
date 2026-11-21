import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import manifest from "../apps/web/public/brand/toonstudio-ir-deck.manifest.json";
import { IR_DECK_SLIDE_COUNT, IR_DECK_STATUS, IR_DECK_UPDATED_AT } from "../apps/web/src/domains/marketing/ir-pitch-data";
import { SCENE_META } from "../apps/web/src/domains/marketing/ir-present-scene-data";
import { PRODUCT_TOUR } from "../apps/web/src/domains/marketing/product-tour-content";

const root = new URL("../", import.meta.url);
const brand = new URL("apps/web/public/brand/", root);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("배포하는 정적 IR 덱의 최신성", () => {
  it("기준일·상태·장면 수·투어 구성이 현재 웹 정본과 같다", () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.basis).toBe(IR_DECK_UPDATED_AT);
    expect(manifest.status).toBe(IR_DECK_STATUS);
    expect(manifest.slides).toBe(IR_DECK_SLIDE_COUNT);
    expect(manifest.slides).toBe(SCENE_META.length);
    expect(manifest.tour).toEqual({
      durationSeconds: PRODUCT_TOUR.duration,
      chapterCount: PRODUCT_TOUR.chapters.length,
      conceptChapters: PRODUCT_TOUR.chapters.flatMap((chapter, index) => chapter.visual === "concept" ? [index + 1] : []),
    });
  });

  it("문안·대본·캡처·생성기 입력이 바뀌면 재생성을 요구한다", () => {
    expect(manifest.sources.map((source) => source.path)).toEqual(expect.arrayContaining([
      "apps/web/src/domains/marketing/ir-pitch-data.ts",
      "apps/web/src/domains/marketing/product-tour-content.ts",
      "tools/media/ir-present/narration.ko.json",
      "scripts/export-ir-deck-data.mts", "scripts/generate-ir-deck.py",
    ]));
    expect(new Set(manifest.sources.map((source) => source.path)).size).toBe(manifest.sources.length);
    for (const source of manifest.sources) {
      expect(sha256(readFileSync(new URL(source.path, root))), `${source.path}: 정적 IR 재생성 필요`).toBe(source.sha256);
    }
  });

  it("실제 PDF·PPTX 바이트와 manifest의 산출물 증빙이 같다", () => {
    expect(manifest.outputs.map((output) => output.file).sort()).toEqual(["toonstudio-ir-deck.pdf", "toonstudio-ir-deck.pptx"]);
    for (const output of manifest.outputs) {
      const bytes = readFileSync(new URL(output.file, brand));
      expect(bytes.length, output.file).toBe(output.bytes);
      expect(sha256(bytes), `${output.file}: 산출물 정합성 확인 필요`).toBe(output.sha256);
    }
  });

  it("두 실제 파일이 모두 웹 발표와 같은 24장이다", async () => {
    const pptx = unzipSync(readFileSync(new URL("toonstudio-ir-deck.pptx", brand)));
    const pdf = await PDFDocument.load(readFileSync(new URL("toonstudio-ir-deck.pdf", brand)));
    expect(Object.keys(pptx).filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name))).toHaveLength(24);
    expect(pdf.getPageCount()).toBe(24);
    expect(manifest.slides).toBe(24);
  });
});
