import { describe, expect, it } from "vitest";

import { InvalidStateError, StrokeBudgetExceededError } from "../core/errors";
import { fnv1a64 } from "../core/hash";
import { StrokePipeline } from "../dynamics/stroke-pipeline";
import { presetById } from "../presets/catalog";
import { lineStroke, zigzagStroke } from "../testing/synthetic-strokes";
import { wetTotals } from "../wet/state";

import { splitFrames, Surface } from "./reference-renderer";
import { TilePool } from "./tile-pool";

import type { RawSample } from "../core/types";
import type { BrushProgram } from "../presets/program-schema";

/**
 * 획 되돌리기(abortStroke) 계약 검증. 기준은 "픽셀 해시": 같은 순서로 그린 기준 표면과 한 비트도 다르지 않아야 한다.
 */

const SIZE = 96;

function hashOf(surface: Surface): string {
  const img = surface.toLabImage();
  return fnv1a64(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength));
}

function linearHash(surface: Surface): string {
  const lin = surface.toLinear();
  return fnv1a64(new Uint8Array(lin.buffer, lin.byteOffset, lin.byteLength));
}

/** 획을 그리되 `frames`번째 프레임까지만 addDabs하고 멈춘다(`finish`면 끝까지 그리고 endStroke). */
function drawStroke(
  surface: Surface,
  program: BrushProgram,
  samples: readonly RawSample[],
  seed: number,
  mode: { stopAfterFrames: number } | "finish",
): { frames: number } {
  surface.beginStroke(program, seed);
  const pipeline = new StrokePipeline(program, seed, undefined, surface.paperField());
  const frames = splitFrames(samples);
  let drawn = 0;
  for (const frame of frames) {
    if (mode !== "finish" && drawn >= mode.stopAfterFrames) return { frames: drawn };
    surface.addDabs(pipeline.push(frame));
    drawn += 1;
  }
  if (mode === "finish") {
    surface.addDabs(pipeline.finish());
    surface.endStroke();
  }
  return { frames: drawn };
}

describe("TilePool 저널(타일 단위 copy-on-write)", () => {
  function pool(): TilePool {
    const p = new TilePool(8, 4);
    p.view(p.alloc(10)).fill(1);
    p.view(p.alloc(20)).fill(2);
    p.view(p.alloc(30)).fill(3);
    return p;
  }

  it("처음 view한 슬롯만 복사하고 되돌리면 내용·할당·커서가 시작 시점과 같다", () => {
    const p = pool();
    p.beginJournal();
    p.view(p.alloc(20)).fill(9); // 기존 타일 변경
    p.view(p.alloc(40)).fill(7); // 새 타일 할당
    expect(p.journalTiles()).toBe(1); // 새 슬롯은 복사할 것이 없다
    expect(p.rollbackJournal()).toBe(1);
    expect(p.used()).toBe(3);
    expect(p.slotOf(40)).toBeUndefined();
    expect(Array.from(p.view(p.alloc(20)))).toEqual([2, 2, 2, 2]);
    expect(Array.from(p.view(p.alloc(10)))).toEqual([1, 1, 1, 1]);
    // 되돌린 뒤 같은 타일을 다시 할당하면 0으로 시작한다.
    expect(Array.from(p.view(p.alloc(40)))).toEqual([0, 0, 0, 0]);
  });

  it("접근하지 않은 타일은 복사하지 않고 peek은 복사하지 않는다", () => {
    const p = pool();
    p.beginJournal();
    p.peek(p.alloc(10));
    expect(p.journalTiles()).toBe(0);
    p.view(p.alloc(30));
    expect(p.journalTiles()).toBe(1);
  });

  it("commit하면 복사본을 버리고 이후 rollback은 아무것도 하지 않는다", () => {
    const p = pool();
    p.beginJournal();
    p.view(p.alloc(10)).fill(5);
    p.commitJournal();
    expect(p.hasJournal()).toBe(false);
    expect(p.rollbackJournal()).toBe(0);
    expect(Array.from(p.view(p.alloc(10)))).toEqual([5, 5, 5, 5]);
  });

  it("저널이 열린 채 clear돼 슬롯 배치가 바뀌어도 시작 시점으로 되돌린다", () => {
    const p = pool();
    p.beginJournal();
    p.clear();
    p.view(p.alloc(99)).fill(8);
    p.view(p.alloc(10)).fill(6); // 슬롯 0에 다른 타일이 들어간다
    p.rollbackJournal();
    expect(p.used()).toBe(3);
    expect(p.slotOf(99)).toBeUndefined();
    expect(p.slotOf(10)).toBe(0);
    expect(Array.from(p.view(p.alloc(10)))).toEqual([1, 1, 1, 1]);
    expect(Array.from(p.view(p.alloc(30)))).toEqual([3, 3, 3, 3]);
  });

  it("용량 초과 예외 뒤에도 되돌릴 수 있다", () => {
    const p = new TilePool(2, 4);
    p.view(p.alloc(1)).fill(1);
    p.beginJournal();
    p.view(p.alloc(2)).fill(2);
    expect(() => p.alloc(3)).toThrow(StrokeBudgetExceededError);
    p.rollbackJournal();
    expect(p.used()).toBe(1);
    expect(p.slotOf(2)).toBeUndefined();
  });
});

describe("Surface.abortStroke — 건식", () => {
  const ink = presetById("ink-g-pen");
  const stroke1 = lineStroke(8, 20, SIZE - 8, 24, 0.7, { durationMs: 300 });
  const stroke2 = lineStroke(10, 60, SIZE - 10, 40, 0.8, { durationMs: 300 });
  const stroke3 = lineStroke(12, 80, SIZE - 12, 80, 0.6, { durationMs: 300 });

  it("[획1 → H1] [획2 begin+addDabs → abort → H1] [획3 == 획2 없이 획3만]", () => {
    const surface = new Surface(SIZE, SIZE);
    drawStroke(surface, ink, stroke1, 1, "finish");
    const h1 = hashOf(surface);
    const l1 = linearHash(surface);

    const part = drawStroke(surface, ink, stroke2, 2, { stopAfterFrames: 10 });
    expect(part.frames).toBe(10);
    expect(hashOf(surface)).toBe(h1); // 획 도중에도 문서는 그대로(합성은 endStroke에서)
    const receipt = surface.abortStroke();
    expect(receipt.aborted).toBe(true);
    expect(receipt.restored).toBe(true);
    expect(receipt.discardedDabs).toBeGreaterThan(0);
    expect(hashOf(surface)).toBe(h1);
    expect(linearHash(surface)).toBe(l1);
    expect(surface.stroke.usedTiles()).toBe(0);

    drawStroke(surface, ink, stroke3, 3, "finish");

    const reference = new Surface(SIZE, SIZE);
    drawStroke(reference, ink, stroke1, 1, "finish");
    drawStroke(reference, ink, stroke3, 3, "finish");
    expect(hashOf(surface)).toBe(hashOf(reference));
    expect(linearHash(surface)).toBe(linearHash(reference));
  });

  it("획 밖에서 부르면 no-op이고 멱등이다", () => {
    const surface = new Surface(SIZE, SIZE);
    const empty = surface.abortStroke();
    expect(empty).toMatchObject({ aborted: false, restored: true, discardedDabs: 0 });
    drawStroke(surface, ink, stroke1, 1, "finish");
    const h1 = hashOf(surface);
    expect(surface.abortStroke().aborted).toBe(false);
    drawStroke(surface, ink, stroke2, 2, { stopAfterFrames: 3 });
    expect(surface.abortStroke().aborted).toBe(true);
    expect(surface.abortStroke().aborted).toBe(false);
    expect(hashOf(surface)).toBe(h1);
  });

  it("abort 뒤 endStroke는 이전과 같이 InvalidStateError다", () => {
    const surface = new Surface(SIZE, SIZE);
    drawStroke(surface, ink, stroke1, 1, { stopAfterFrames: 2 });
    surface.abortStroke();
    expect(() => surface.endStroke()).toThrow(InvalidStateError);
  });

  it("건식은 저널 복사본이 없다(습식 풀 자체가 없다)", () => {
    const surface = new Surface(SIZE, SIZE);
    drawStroke(surface, ink, stroke1, 1, { stopAfterFrames: 4 });
    expect(surface.wet).toBeNull();
    expect(surface.abortStroke().restoredWetTiles).toBe(0);
  });

  it("smudge: 문서 픽업 획을 버려도 문서와 다음 smudge 획이 같다", () => {
    const smudge = presetById("smudge-blend");
    const build = (): Surface => {
      const s = new Surface(SIZE, SIZE);
      drawStroke(s, ink, stroke1, 1, "finish");
      drawStroke(s, ink, stroke2, 2, "finish");
      return s;
    };
    const surface = build();
    const h = hashOf(surface);
    drawStroke(surface, smudge, lineStroke(10, 24, SIZE - 10, 52, 0.7, { durationMs: 300 }), 4, { stopAfterFrames: 8 });
    expect(surface.abortStroke().restored).toBe(true);
    expect(hashOf(surface)).toBe(h);
    const smear = lineStroke(14, 30, SIZE - 14, 46, 0.7, { durationMs: 300 });
    drawStroke(surface, smudge, smear, 5, "finish");
    const reference = build();
    drawStroke(reference, smudge, smear, 5, "finish");
    expect(hashOf(surface)).toBe(hashOf(reference));
  });
});

describe("Surface.abortStroke — 습식(수채·수묵·구아슈·유화)", () => {
  const WET_IDS = ["watercolor-wet", "sumi-ink-wet", "gouache", "oil-impasto"] as const;
  const first = zigzagStroke(SIZE, { durationMs: 240 });
  const second = lineStroke(10, 30, SIZE - 10, 66, 0.8, { durationMs: 300 });
  const third = lineStroke(14, 70, SIZE - 14, 20, 0.7, { durationMs: 300 });

  it.each(WET_IDS)("%s: abort 뒤 해시·습식 층 질량이 beginStroke 직전과 같고 다음 획이 기준과 같다", (id) => {
    const program = presetById(id);
    const surface = new Surface(SIZE, SIZE);
    drawStroke(surface, program, first, 1, "finish");
    const wet = surface.wet;
    expect(wet).not.toBeNull();
    const before = { hash: hashOf(surface), linear: linearHash(surface), totals: wetTotals(wet!), active: [...wet!.active].sort((a, b) => a - b), timeMs: wet!.timeMs };

    drawStroke(surface, program, second, 2, { stopAfterFrames: 7 });
    // 획 도중 습식 층은 실제로 바뀌어 있다(그래야 되돌림이 의미 있다).
    expect(wetTotals(surface.wet!)).not.toEqual(before.totals);
    const receipt = surface.abortStroke();
    expect(receipt.restored).toBe(true);
    expect(receipt.discardedDabs).toBeGreaterThan(0);
    expect(receipt.restoredWetTiles).toBeGreaterThan(0);

    expect(hashOf(surface)).toBe(before.hash);
    expect(linearHash(surface)).toBe(before.linear);
    expect(wetTotals(surface.wet!)).toEqual(before.totals);
    expect([...surface.wet!.active].sort((a, b) => a - b)).toEqual(before.active);
    expect(surface.wet!.timeMs).toBe(before.timeMs);

    drawStroke(surface, program, third, 3, "finish");
    const reference = new Surface(SIZE, SIZE);
    drawStroke(reference, program, first, 1, "finish");
    drawStroke(reference, program, third, 3, "finish");
    expect(hashOf(surface)).toBe(hashOf(reference));
    expect(linearHash(surface)).toBe(linearHash(reference));
    expect(wetTotals(surface.wet!)).toEqual(wetTotals(reference.wet!));
  }, 60_000);

  it.each(WET_IDS)("%s: 첫 획을 버리면 습식 상태가 만들어지기 전으로 돌아간다", (id) => {
    const program = presetById(id);
    const surface = new Surface(SIZE, SIZE);
    const blank = hashOf(surface);
    drawStroke(surface, program, second, 2, { stopAfterFrames: 6 });
    expect(surface.wet).not.toBeNull();
    expect(surface.abortStroke().restored).toBe(true);
    expect(surface.wet).toBeNull();
    expect(hashOf(surface)).toBe(blank);
    drawStroke(surface, program, third, 3, "finish");
    const reference = new Surface(SIZE, SIZE);
    drawStroke(reference, program, third, 3, "finish");
    expect(hashOf(surface)).toBe(hashOf(reference));
  }, 60_000);

  it("매체를 바꾸는 획(수채 → 유화)은 층을 문서에 굽기 전 상태까지 복원한다", () => {
    const water = presetById("watercolor-wet");
    const oil = presetById("oil-impasto");
    const surface = new Surface(SIZE, SIZE);
    drawStroke(surface, water, first, 1, "finish");
    const before = { hash: hashOf(surface), linear: linearHash(surface), totals: wetTotals(surface.wet!) };
    drawStroke(surface, oil, second, 2, { stopAfterFrames: 5 });
    const receipt = surface.abortStroke();
    expect(receipt.documentCopied).toBe(true);
    expect(receipt.restored).toBe(true);
    expect(hashOf(surface)).toBe(before.hash);
    expect(linearHash(surface)).toBe(before.linear);
    expect(wetTotals(surface.wet!)).toEqual(before.totals);
    // 수채 층이 다시 살아 있어 다음 수채 획이 기준과 같다.
    drawStroke(surface, water, third, 3, "finish");
    const reference = new Surface(SIZE, SIZE);
    drawStroke(reference, water, first, 1, "finish");
    drawStroke(reference, water, third, 3, "finish");
    expect(hashOf(surface)).toBe(hashOf(reference));
  }, 60_000);

  it("endStroke의 문서 합성 도중 실패하면 restored:false와 사유를 정직하게 돌려준다", () => {
    const ink = presetById("ink-g-pen");
    const surface = new Surface(SIZE, SIZE);
    drawStroke(surface, ink, lineStroke(8, 20, SIZE - 8, 24, 0.7, { durationMs: 300 }), 1, { stopAfterFrames: 10 });
    expect(surface.stroke.usedTiles()).toBeGreaterThan(0);
    // 합성 도중 실패를 흉내 낸다: 획 풀 순회가 던지게 한다.
    const original = surface.stroke.tiles.bind(surface.stroke);
    surface.stroke.tiles = function* failing(): Iterable<[number, Float32Array]> {
      for (const entry of original()) {
        yield entry;
        throw new Error("합성 실패 시뮬레이션");
      }
    };
    expect(() => surface.endStroke()).toThrow("합성 실패 시뮬레이션");
    surface.stroke.tiles = original;
    const receipt = surface.abortStroke();
    expect(receipt.aborted).toBe(true);
    expect(receipt.restored).toBe(false);
    expect(receipt.reasonKo).toContain("문서");
    expect(surface.stroke.usedTiles()).toBe(0);
  });
});
