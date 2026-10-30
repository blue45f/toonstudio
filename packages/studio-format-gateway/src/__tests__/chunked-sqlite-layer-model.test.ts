import { describe, expect, it } from "vitest";

import {
  CLIP_LAYER_COLUMNS,
  CLIP_PASS_THROUGH_COMPOSITE,
  CLIP_TEXT_CELL_LIMIT,
  classifyClipLayer,
  clipCompositeModeId,
  flattenClipLayerTree,
  projectClipLayerRow,
  readClipInteger,
  readClipNumber,
  readClipText,
  type ClipLayerMarkers,
  type ClipLayerRow,
  type ClipRowCells,
} from "../chunked-sqlite-layer-model";

import type { ClipSqliteValue } from "../chunked-sqlite-document-types";

const NO_MARKERS: ClipLayerMarkers = { text: false, fill: false, filter: false, model3d: false, imageMaterial: false, frameLine: false, vectorStroke: false };

function row(id: number, overrides: Partial<ClipLayerRow> = {}): ClipLayerRow {
  return {
    id,
    name: `l${id}`,
    layerType: 1,
    uuid: null,
    visibility: 1,
    opacity: 256,
    composite: 0,
    clip: 0,
    lock: 0,
    folder: 0,
    firstChild: 0,
    next: 0,
    offsetX: 0,
    offsetY: 0,
    renderOffsetX: 0,
    renderOffsetY: 0,
    maskOffsetX: 0,
    maskOffsetY: 0,
    maskRenderOffsetX: 0,
    maskRenderOffsetY: 0,
    renderMipmap: 0,
    maskMipmap: 0,
    drawColorEnabled: false,
    drawColor: null,
    drawToRenderType: null,
    markers: NO_MARKERS,
    ...overrides,
  };
}

function cellsOf(values: Record<string, ClipSqliteValue>): ClipRowCells {
  return (column) => (Object.hasOwn(values, column) ? values[column] : undefined);
}

describe("readClipInteger", () => {
  it("안전 정수만 받는다", () => {
    expect(readClipInteger(0)).toBe(0);
    expect(readClipInteger(-7)).toBe(-7);
    expect(readClipInteger(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(readClipInteger(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
    expect(readClipInteger(1.5)).toBeNull();
    expect(readClipInteger(Number.NaN)).toBeNull();
    expect(readClipInteger(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("bigint는 안전 범위일 때만 수로 바꾼다", () => {
    expect(readClipInteger(5n)).toBe(5);
    expect(readClipInteger(-5n)).toBe(-5);
    expect(readClipInteger(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
    expect(readClipInteger(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toBeNull();
    expect(readClipInteger(-BigInt(Number.MAX_SAFE_INTEGER) - 1n)).toBeNull();
  });

  it("문자열·BLOB·NULL·undefined는 null이다", () => {
    expect(readClipInteger("12")).toBeNull();
    expect(readClipInteger(Uint8Array.of(1))).toBeNull();
    expect(readClipInteger(null)).toBeNull();
    expect(readClipInteger(undefined)).toBeNull();
  });
});

describe("readClipNumber", () => {
  it("유한한 수만 받는다", () => {
    expect(readClipNumber(1.25)).toBe(1.25);
    expect(readClipNumber(-0.5)).toBe(-0.5);
    expect(readClipNumber(3n)).toBe(3);
    expect(readClipNumber(Number.NaN)).toBeNull();
    expect(readClipNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(readClipNumber("1")).toBeNull();
    expect(readClipNumber(null)).toBeNull();
    expect(readClipNumber(undefined)).toBeNull();
    expect(readClipNumber(Uint8Array.of(1))).toBeNull();
  });
});

describe("readClipText", () => {
  it("문자열과 UTF-8 BLOB를 읽고 그 밖은 null이다", () => {
    expect(readClipText("레이어 1", 100)).toBe("레이어 1");
    expect(readClipText(new TextEncoder().encode("한글 이름"), 100)).toBe("한글 이름");
    expect(readClipText(5, 100)).toBeNull();
    expect(readClipText(null, 100)).toBeNull();
    expect(readClipText(undefined, 100)).toBeNull();
  });

  it("최대 글자 수에서 자르고(경계 포함) 제어 문자는 손대지 않는다", () => {
    expect(readClipText("abcde", 5)).toBe("abcde");
    expect(readClipText("abcde", 4)).toBe("abcd");
    expect(readClipText("", 4)).toBe("");
    expect(readClipText("a\tb\nc\u0000d", 100)).toBe("a\tb\nc\u0000d");
  });

  it("자른 끝에 서로게이트 쌍의 앞 절반만 남으면 그 절반을 버린다", () => {
    const emoji = "😀"; // 코드 단위 2개
    expect(readClipText(`ab${emoji}`, 3)).toBe("ab");
    expect(readClipText(`ab${emoji}`, 4)).toBe(`ab${emoji}`);
    expect(readClipText(`${emoji}${emoji}`, 3)).toBe(emoji);
    // 이미 짝이 맞지 않는 끝은 자르지 않았으면 그대로 둔다.
    expect(readClipText("ab\ud83d", 3)).toBe("ab\ud83d");
  });

  it("BLOB는 앞쪽만 해석한다(글자 수 * 4바이트까지)", () => {
    const long = new TextEncoder().encode("가".repeat(1000));

    expect(readClipText(long, 10)).toBe("가".repeat(10));
  });

  it("BLOB의 앞부분만 해석해도 결과는 전체를 해석해 자른 것과 같다(UTF-8 한 글자 최대 4바이트가 경계에 걸리는 경우 포함)", () => {
    const encoder = new TextEncoder();
    const reference = (text: string, max: number): string => {
      if (text.length <= max) return text;
      const clipped = text.slice(0, max);
      return /[\ud800-\udbff]$/u.test(clipped) ? clipped.slice(0, -1) : clipped;
    };
    const emoji = "😀";
    const samples = ["", "a", "abc", "가나다라", `${emoji}abc`, `a${emoji}b${emoji}`, emoji.repeat(3), "가".repeat(20), `${emoji}가a`.repeat(5)];
    for (const text of samples) {
      for (let max = 1; max <= 12; max += 1) {
        expect(readClipText(encoder.encode(text), max), `${JSON.stringify(text)} / 최대 ${max}`).toBe(reference(text, max));
      }
    }
  });
});

describe("clipCompositeModeId", () => {
  it("표의 29개 값을 ID로, 나머지는 null로 돌려준다", () => {
    const known = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 30, 36];
    const ids = known.map((raw) => clipCompositeModeId(raw));
    expect(ids.every((id) => typeof id === "string")).toBe(true);
    expect(new Set(ids).size).toBe(29);
    for (const raw of [-1, 27, 28, 29, 31, 32, 33, 34, 35, 37, 100, 0.5, Number.NaN]) expect(clipCompositeModeId(raw)).toBeNull();
    expect(CLIP_PASS_THROUGH_COMPOSITE).toBe(30);
    expect(clipCompositeModeId(CLIP_PASS_THROUGH_COMPOSITE)).toBe("pass-through");
  });
});

describe("CLIP_LAYER_COLUMNS", () => {
  it("큰 BLOB 열은 길이·존재만 묻고 나머지는 값을 읽는다", () => {
    const modes = new Map(CLIP_LAYER_COLUMNS.map((column) => [column.name, column.mode ?? "value"]));

    expect(modes.get("TextLayerString")).toBe("length");
    expect(modes.get("GradationFillInfo")).toBe("length");
    expect(modes.get("FilterLayerInfo")).toBe("length");
    expect(modes.get("VectorNormalStrokeIndex")).toBe("present");
    expect(modes.get("MainId")).toBe("value");
    expect(modes.get("LayerName")).toBe("value");
    expect(modes.get("FirstLayerObject")).toBe("value");
    expect(CLIP_LAYER_COLUMNS).toHaveLength(34);
    expect(new Set(CLIP_LAYER_COLUMNS.map((column) => column.name)).size).toBe(34);
    expect(modes.get("DrawToRenderOffscreenType")).toBe("value");
    expect(Object.isFrozen(CLIP_LAYER_COLUMNS)).toBe(true);
  });

  it("ResizableImageInfo는 BLOB 열이라 내용을 옮기지 않고 길이만 묻는다", () => {
    expect(CLIP_LAYER_COLUMNS.find((column) => column.name === "ResizableImageInfo")).toEqual({ name: "ResizableImageInfo", mode: "length" });
    expect(CLIP_LAYER_COLUMNS.find((column) => column.name === "ComicFrameLineMipmap")).toEqual({ name: "ComicFrameLineMipmap" });
  });

  it("이름·UUID 열은 판독기가 자를 길이(기본 maxTextCharacters의 4배)를 함께 요청한다", () => {
    expect(CLIP_TEXT_CELL_LIMIT).toBe(4096);
    expect(CLIP_LAYER_COLUMNS.filter((column) => column.limit !== undefined)).toEqual([
      { name: "LayerName", limit: 4096 },
      { name: "LayerUuid", limit: 4096 },
    ]);
  });
});

describe("projectClipLayerRow", () => {
  it("값이 없으면 기본값을 쓴다: 표시 1, 불투명도 256, 나머지 0", () => {
    const projected = projectClipLayerRow(cellsOf({ MainId: 7 }), 100)!;

    expect(projected).toMatchObject({
      id: 7, name: "", layerType: 0, uuid: null, visibility: 1, opacity: 256, composite: 0, clip: 0, lock: 0, folder: 0, firstChild: 0, next: 0,
      offsetX: 0, offsetY: 0, renderOffsetX: 0, renderOffsetY: 0, maskOffsetX: 0, maskOffsetY: 0, maskRenderOffsetX: 0, maskRenderOffsetY: 0,
      renderMipmap: 0, maskMipmap: 0, drawColorEnabled: false, drawColor: null, drawToRenderType: null,
    });
    expect(projected.markers).toEqual(NO_MARKERS);
  });

  it("MainId가 양의 정수가 아니면 null이다", () => {
    for (const bad of [0, -1, 1.5, null, "3", Uint8Array.of(1)]) expect(projectClipLayerRow(cellsOf({ MainId: bad }), 100)).toBeNull();
    expect(projectClipLayerRow(cellsOf({}), 100)).toBeNull();
    expect(projectClipLayerRow(cellsOf({ MainId: 9n }), 100)!.id).toBe(9);
  });

  it("각 열을 대응하는 필드로 옮긴다(열마다 다른 값을 써서 바뀐 짝을 잡는다)", () => {
    const values: Record<string, ClipSqliteValue> = {
      MainId: 11, LayerName: "이름", LayerType: 3, LayerUuid: "uuid-x", LayerVisibility: 5, LayerOpacity: 77, LayerComposite: 14, LayerClip: 1, LayerLock: 6,
      LayerFolder: 17, LayerFirstChildIndex: 21, LayerNextIndex: 22, LayerOffsetX: 31, LayerOffsetY: 32, LayerRenderOffscrOffsetX: 33, LayerRenderOffscrOffsetY: 34,
      LayerMaskOffsetX: 35, LayerMaskOffsetY: 36, LayerMaskOffscrOffsetX: 37, LayerMaskOffscrOffsetY: 38, LayerRenderMipmap: 41, LayerLayerMaskMipmap: 42,
      DrawColorEnable: 2, DrawToRenderOffscreenType: 51,
    };
    const projected = projectClipLayerRow(cellsOf(values), 100)!;

    expect(projected).toMatchObject({
      id: 11, name: "이름", layerType: 3, uuid: "uuid-x", visibility: 5, opacity: 77, composite: 14, clip: 1, lock: 6, folder: 17, firstChild: 21, next: 22,
      offsetX: 31, offsetY: 32, renderOffsetX: 33, renderOffsetY: 34, maskOffsetX: 35, maskOffsetY: 36, maskRenderOffsetX: 37, maskRenderOffsetY: 38,
      renderMipmap: 41, maskMipmap: 42, drawColorEnabled: true, drawToRenderType: 51,
    });
  });

  it("형식이 다른 값은 기본값을 쓴다", () => {
    const projected = projectClipLayerRow(cellsOf({ MainId: 2, LayerOpacity: "x", LayerVisibility: 2.5, LayerType: null, LayerName: 5, DrawToRenderOffscreenType: "61" }), 100)!;

    expect(projected).toMatchObject({ opacity: 256, visibility: 1, layerType: 0, name: "", drawToRenderType: null });
  });

  it("레이어 색은 32비트 값의 상위 8비트이고 세 채널이 모두 있어야 한다", () => {
    const color = (r: ClipSqliteValue, g: ClipSqliteValue, b: ClipSqliteValue) =>
      projectClipLayerRow(cellsOf({ MainId: 1, DrawColorMainRed: r, DrawColorMainGreen: g, DrawColorMainBlue: b }), 100)!.drawColor;

    expect(color(4294967295, 4294967295, 4294967295)).toEqual({ r: 255, g: 255, b: 255 });
    expect(color(0, 0, 0)).toEqual({ r: 0, g: 0, b: 0 });
    expect(color(0x80000000, 0x01000000, 0x00ffffff)).toEqual({ r: 128, g: 1, b: 0 });
    expect(color(0x7f000000, 0xfe000000, 0x0a000000)).toEqual({ r: 127, g: 254, b: 10 });
    expect(color(5n * 0x1000000n, 6, 7)).toEqual({ r: 5, g: 0, b: 0 });
    expect(color(null, 0, 0)).toBeNull();
    expect(color(0, null, 0)).toBeNull();
    expect(color(0, 0, null)).toBeNull();
    expect(color(-1, 0, 0)).toBeNull();
    expect(color(0, -1, 0)).toBeNull();
    expect(color(0, 0, -1)).toBeNull();
    expect(color("1", 0, 0)).toBeNull();
  });

  it("종류 표지: 길이·정수가 0보다 클 때만 있다고 본다", () => {
    const markers = (values: Record<string, ClipSqliteValue>) => projectClipLayerRow(cellsOf({ MainId: 1, ...values }), 100)!.markers;

    expect(markers({ TextLayerString: 12, GradationFillInfo: 1, FilterLayerInfo: 9, FirstLayerObject: 4, ResizableImageInfo: 8, ComicFrameLineMipmap: 3, VectorNormalStrokeIndex: 1 })).toEqual({
      text: true, fill: true, filter: true, model3d: true, imageMaterial: true, frameLine: true, vectorStroke: true,
    });
    expect(markers({ TextLayerString: 0, GradationFillInfo: null, FilterLayerInfo: -3, FirstLayerObject: 0, ResizableImageInfo: null, ComicFrameLineMipmap: 0, VectorNormalStrokeIndex: 0 })).toEqual(NO_MARKERS);
    expect(markers({ VectorNormalStrokeIndex: 2 }).vectorStroke).toBe(false);
  });

  it("이름과 UUID는 maxTextCharacters에서 자른다", () => {
    const projected = projectClipLayerRow(cellsOf({ MainId: 1, LayerName: "가".repeat(30), LayerUuid: "u".repeat(30) }), 8)!;

    expect(projected.name).toBe("가".repeat(8));
    expect(projected.uuid).toBe("u".repeat(8));
  });
});

describe("classifyClipLayer: 판정 순서", () => {
  const withMarkers = (markers: Partial<ClipLayerMarkers>, rest: Partial<ClipLayerRow> = {}): ClipLayerRow => row(1, { markers: { ...NO_MARKERS, ...markers }, ...rest });

  it("S1의 순서대로 앞선 조건이 이긴다", () => {
    expect(classifyClipLayer(withMarkers({ text: true, fill: true }, { layerType: 1584 }), true)).toBe("paper");
    expect(classifyClipLayer(withMarkers({ text: true }, { layerType: 800 }), true)).toBe("story-info");
    expect(classifyClipLayer(withMarkers({ text: true, fill: true }, { folder: 1, layerType: 1 }), true)).toBe("folder");
    expect(classifyClipLayer(withMarkers({ text: true, fill: true, filter: true }), true)).toBe("text");
    expect(classifyClipLayer(withMarkers({ fill: true, filter: true }), true)).toBe("fill");
    expect(classifyClipLayer(withMarkers({ filter: true, model3d: true }), true)).toBe("adjustment");
    expect(classifyClipLayer(withMarkers({ model3d: true, imageMaterial: true }), true)).toBe("model3d");
    expect(classifyClipLayer(withMarkers({ imageMaterial: true }), true)).toBe("image-material");
    expect(classifyClipLayer(withMarkers({}, { layerType: 1 }), true)).toBe("vector");
    expect(classifyClipLayer(withMarkers({}, { layerType: 1 }), false)).toBe("raster");
  });

  it("LayerType: 비트 12는 색조 보정, 비트 0은 래스터, 그 밖은 other", () => {
    expect(classifyClipLayer(row(1, { layerType: 4096 }), false)).toBe("adjustment");
    expect(classifyClipLayer(row(1, { layerType: 4098 }), false)).toBe("adjustment");
    expect(classifyClipLayer(row(1, { layerType: 4097 }), false)).toBe("adjustment");
    expect(classifyClipLayer(row(1, { layerType: 1 }), false)).toBe("raster");
    expect(classifyClipLayer(row(1, { layerType: 3 }), false)).toBe("raster");
    expect(classifyClipLayer(row(1, { layerType: 2 }), false)).toBe("other");
    expect(classifyClipLayer(row(1, { layerType: 0 }), false)).toBe("other");
    expect(classifyClipLayer(row(1, { layerType: 256 }), false)).toBe("other");
    expect(classifyClipLayer(row(1, { layerType: 512 }), false)).toBe("other");
    expect(classifyClipLayer(row(1, { layerType: 8720 }), false)).toBe("other");
  });

  it("그린 것이 없는 벡터는 LayerType 0 + 획 열일 때만이다", () => {
    expect(classifyClipLayer(withMarkers({ vectorStroke: true }, { layerType: 0 }), false)).toBe("vector");
    expect(classifyClipLayer(withMarkers({ vectorStroke: true }, { layerType: 2 }), false)).toBe("other");
    expect(classifyClipLayer(withMarkers({ vectorStroke: true }, { layerType: 1 }), false)).toBe("raster");
  });

  it("용지와 작품 정보는 폴더 비트가 있어도 폴더보다 먼저 판정된다", () => {
    expect(classifyClipLayer(row(1, { layerType: 1584, folder: 1 }), false)).toBe("paper");
    expect(classifyClipLayer(row(1, { layerType: 800, folder: 1 }), false)).toBe("story-info");
    expect(classifyClipLayer(row(1, { layerType: 800, folder: 0 }), false)).toBe("story-info");
    expect(classifyClipLayer(row(1, { layerType: 1585 }), false)).toBe("raster");
    expect(classifyClipLayer(row(1, { layerType: 801 }), false)).toBe("raster");
  });

  it("텍스트 표지는 LayerType의 필터 비트(4096)와 래스터 비트(1)보다 앞선다", () => {
    expect(classifyClipLayer(withMarkers({ text: true }, { layerType: 4097 }), false)).toBe("text");
    expect(classifyClipLayer(withMarkers({ text: true }, { layerType: 1 }), false)).toBe("text");
    expect(classifyClipLayer(withMarkers({ fill: true }, { layerType: 4097 }), false)).toBe("fill");
  });

  it("컷 틀 폴더: 폴더이면서 ComicFrameLineMipmap이 있을 때만 frame-folder다", () => {
    expect(classifyClipLayer(withMarkers({ frameLine: true }, { folder: 1, layerType: 0 }), false)).toBe("frame-folder");
    expect(classifyClipLayer(withMarkers({ frameLine: true }, { folder: 17, layerType: 0 }), false)).toBe("frame-folder");
    expect(classifyClipLayer(withMarkers({ frameLine: true, text: true, fill: true }, { folder: 1 }), false)).toBe("frame-folder");
    expect(classifyClipLayer(withMarkers({}, { folder: 1 }), false)).toBe("folder");
    // 폴더가 아니면 표지가 있어도 종류를 바꾸지 못한다.
    expect(classifyClipLayer(withMarkers({ frameLine: true }, { folder: 0, layerType: 1 }), false)).toBe("raster");
    expect(classifyClipLayer(withMarkers({ frameLine: true }, { folder: 0, layerType: 0 }), false)).toBe("other");
    // 용지·작품 정보가 먼저다.
    expect(classifyClipLayer(withMarkers({ frameLine: true }, { folder: 1, layerType: 1584 }), false)).toBe("paper");
    expect(classifyClipLayer(withMarkers({ frameLine: true }, { folder: 1, layerType: 800 }), false)).toBe("story-info");
  });

  it("폴더 비트는 비트 0만 본다", () => {
    expect(classifyClipLayer(row(1, { folder: 1 }), false)).toBe("folder");
    expect(classifyClipLayer(row(1, { folder: 17 }), false)).toBe("folder");
    expect(classifyClipLayer(row(1, { folder: 16, layerType: 1 }), false)).toBe("raster");
    expect(classifyClipLayer(row(1, { folder: 2, layerType: 1 }), false)).toBe("raster");
  });
});

describe("flattenClipLayerTree", () => {
  const report = () => {
    const reports: Array<[string, string]> = [];
    return { reports, fn: (code: string, message: string) => void reports.push([code, message]) };
  };
  const OPTIONS = { maxLayers: 100, maxDepth: 64 };
  const mapOf = (...rows: ClipLayerRow[]): Map<number, ClipLayerRow> => new Map(rows.map((entry) => [entry.id, entry]));

  it("루트가 없으면 빈 배열이다", () => {
    const { fn } = report();

    expect(flattenClipLayerTree(mapOf(row(2)), 1, OPTIONS, fn)).toEqual([]);
  });

  it("아래에서 위로 이어진 연결을 위쪽 먼저의 깊이 우선 순서로 펼친다", () => {
    const { fn, reports } = report();
    const rows = mapOf(
      row(1, { folder: 1, firstChild: 2 }),
      row(2, { next: 3 }),
      row(3, { folder: 1, firstChild: 5, next: 4 }),
      row(5, { next: 6 }),
      row(6),
      row(4),
    );
    const flat = flattenClipLayerTree(rows, 1, OPTIONS, fn);

    expect(flat.map((entry) => [entry.row.id, entry.depth, entry.parentIndex])).toEqual([
      [4, 0, null],
      [3, 0, null],
      [6, 1, 1],
      [5, 1, 1],
      [2, 0, null],
    ]);
    expect(reports).toEqual([]);
  });

  it("effectiveVisible은 자신과 모든 조상의 비트 0이다", () => {
    const { fn } = report();
    const rows = mapOf(
      row(1, { folder: 1, firstChild: 2 }),
      row(2, { folder: 1, visibility: 0, firstChild: 3, next: 5 }),
      row(3, { folder: 1, firstChild: 4 }),
      row(4),
      row(5, { visibility: 2 }),
    );
    const flat = flattenClipLayerTree(rows, 1, OPTIONS, fn);

    expect(Object.fromEntries(flat.map((entry) => [entry.row.id, entry.effectiveVisible]))).toEqual({ 5: false, 2: false, 3: false, 4: false });
    const shown = flattenClipLayerTree(mapOf(row(1, { folder: 1, firstChild: 2 }), row(2, { visibility: 3 })), 1, OPTIONS, fn);
    expect(shown[0]!.effectiveVisible).toBe(true);
  });

  it("순환 연결은 보고하고 끊는다(자기 자신, 루트로 돌아옴, 형제 되감기)", () => {
    for (const rows of [
      mapOf(row(1, { folder: 1, firstChild: 2 }), row(2, { next: 2 })),
      mapOf(row(1, { folder: 1, firstChild: 2 }), row(2, { next: 1 })),
      mapOf(row(1, { folder: 1, firstChild: 2 }), row(2, { next: 3 }), row(3, { next: 2 })),
    ]) {
      const { fn, reports } = report();
      const flat = flattenClipLayerTree(rows, 1, OPTIONS, fn);

      expect(flat.length).toBeGreaterThanOrEqual(1);
      expect(flat.length).toBeLessThanOrEqual(2);
      expect(reports.map(([code]) => code)).toEqual(["clip-layer-link-cycle"]);
    }
  });

  it("폴더가 자기 자신을 자식으로 가리켜도 한 번만 나온다", () => {
    const { fn, reports } = report();
    const flat = flattenClipLayerTree(mapOf(row(1, { folder: 1, firstChild: 2 }), row(2, { folder: 1, firstChild: 2 })), 1, OPTIONS, fn);

    expect(flat.map((entry) => entry.row.id)).toEqual([2]);
    expect(reports.map(([code]) => code)).toEqual(["clip-layer-link-cycle"]);
  });

  it("없는 행을 가리키는 연결은 거기서 끊는다", () => {
    const { fn, reports } = report();
    const flat = flattenClipLayerTree(mapOf(row(1, { folder: 1, firstChild: 2 }), row(2, { next: 9 })), 1, OPTIONS, fn);

    expect(flat.map((entry) => entry.row.id)).toEqual([2]);
    expect(reports.map(([code]) => code)).toEqual(["clip-layer-link-missing"]);
  });

  it("폴더가 아닌 레이어의 자식 연결은 따라가지 않고 보고한다", () => {
    const { fn, reports } = report();
    const flat = flattenClipLayerTree(mapOf(row(1, { folder: 1, firstChild: 2 }), row(2, { firstChild: 3 }), row(3)), 1, OPTIONS, fn);

    expect(flat.map((entry) => entry.row.id)).toEqual([2]);
    expect(reports.map(([code]) => code)).toEqual(["clip-layer-children-ignored"]);
  });

  it("폴더가 아닌 레이어의 자식은 건너뛰어도 뒤따르는 형제는 계속 읽는다", () => {
    const { fn, reports } = report();
    const rows = mapOf(row(1, { folder: 1, firstChild: 2 }), row(2, { firstChild: 9, next: 3 }), row(3, { next: 4 }), row(4), row(9));
    const flat = flattenClipLayerTree(rows, 1, OPTIONS, fn);

    expect(flat.map((entry) => entry.row.id)).toEqual([4, 3, 2]);
    expect(reports.map(([code]) => code)).toEqual(["clip-layer-children-ignored"]);
    expect(reports[0]![1]).toContain("2");
  });

  it("컷 틀 폴더도 일반 폴더처럼 자식을 따라간다", () => {
    const { fn, reports } = report();
    const frame = row(2, { folder: 1, firstChild: 3, markers: { ...NO_MARKERS, frameLine: true } });
    const flat = flattenClipLayerTree(mapOf(row(1, { folder: 1, firstChild: 2 }), frame, row(3)), 1, OPTIONS, fn);

    expect(flat.map((entry) => [entry.row.id, entry.parentIndex, entry.depth])).toEqual([[2, null, 0], [3, 0, 1]]);
    expect(reports).toEqual([]);
  });

  it("자식 연결이 0인 일반 레이어는 보고하지 않는다", () => {
    const { fn, reports } = report();
    flattenClipLayerTree(mapOf(row(1, { folder: 1, firstChild: 2 }), row(2)), 1, OPTIONS, fn);

    expect(reports).toEqual([]);
  });

  it("중첩 깊이 상한: 깊이 maxDepth의 레이어까지 읽고 그 폴더의 자식부터 버린다", () => {
    const chain = (depthOfLeaf: number): Map<number, ClipLayerRow> => {
      const rows: ClipLayerRow[] = [row(1, { folder: 1, firstChild: 2 })];
      for (let id = 2; id <= depthOfLeaf + 1; id += 1) rows.push(row(id, { folder: 1, firstChild: id + 1 }));
      rows.push(row(depthOfLeaf + 2));
      return mapOf(...rows);
    };
    const { fn, reports } = report();
    // 깊이 0..3의 폴더 4개 + 깊이 4의 잎: maxDepth 4면 잎까지 읽는다.
    expect(flattenClipLayerTree(chain(4), 1, { maxLayers: 100, maxDepth: 4 }, fn).map((entry) => entry.depth)).toEqual([0, 1, 2, 3, 4]);
    expect(reports).toEqual([]);
    const cut = flattenClipLayerTree(chain(4), 1, { maxLayers: 100, maxDepth: 3 }, fn);
    expect(cut.map((entry) => entry.depth)).toEqual([0, 1, 2, 3]);
    expect(reports.map(([code]) => code)).toEqual(["clip-group-depth-exceeded"]);
  });

  it("깊이 상한에 걸린 빈 폴더는 보고하지 않는다", () => {
    const { fn, reports } = report();
    const flat = flattenClipLayerTree(mapOf(row(1, { folder: 1, firstChild: 2 }), row(2, { folder: 1 })), 1, { maxLayers: 100, maxDepth: 0 }, fn);

    expect(flat.map((entry) => entry.row.id)).toEqual([2]);
    expect(reports).toEqual([]);
  });

  it("깊이 상한에 걸린 폴더 뒤의 형제와 다른 폴더의 레이어는 계속 읽는다", () => {
    const { fn, reports } = report();
    // 위에서 아래로: 루트 → [A 폴더 → [F 폴더(자식 X를 가짐), Y], Z]. 연결은 아래에서 위로 이어진다.
    const rows = mapOf(
      row(1, { folder: 1, firstChild: 8 }),
      row(8, { next: 2 }),
      row(2, { folder: 1, firstChild: 5 }),
      row(5, { next: 3 }),
      row(3, { folder: 1, firstChild: 9 }),
      row(9),
    );
    const flat = flattenClipLayerTree(rows, 1, { maxLayers: 100, maxDepth: 1 }, fn);

    expect(flat.map((entry) => [entry.row.id, entry.depth])).toEqual([[2, 0], [3, 1], [5, 1], [8, 0]]);
    expect(reports.map(([code]) => code)).toEqual(["clip-group-depth-exceeded"]);
  });

  it("maxLayers에서 멈추고 보고한다(경계 포함)", () => {
    const rows = mapOf(row(1, { folder: 1, firstChild: 2 }), row(2, { next: 3 }), row(3, { next: 4 }), row(4));
    const exact = report();
    expect(flattenClipLayerTree(rows, 1, { maxLayers: 3, maxDepth: 64 }, exact.fn)).toHaveLength(3);
    expect(exact.reports).toEqual([]);
    const over = report();
    expect(flattenClipLayerTree(rows, 1, { maxLayers: 2, maxDepth: 64 }, over.fn)).toHaveLength(2);
    expect(over.reports.map(([code]) => code)).toEqual(["clip-layer-limit"]);
  });

  it("긴 형제 목록(1만 개)도 재귀 없이 처리한다", () => {
    const { fn } = report();
    const count = 10_000;
    const rows = [row(1, { folder: 1, firstChild: 2 })];
    for (let id = 2; id < count + 2; id += 1) rows.push(row(id, { next: id + 1 < count + 2 ? id + 1 : 0 }));
    const flat = flattenClipLayerTree(mapOf(...rows), 1, { maxLayers: 20_000, maxDepth: 64 }, fn);

    expect(flat).toHaveLength(count);
    expect(flat[0]!.row.id).toBe(count + 1);
    expect(flat[count - 1]!.row.id).toBe(2);
  });

  it("깊은 중첩(64단계)도 재귀 없이 처리한다", () => {
    const { fn } = report();
    const rows = [row(1, { folder: 1, firstChild: 2 })];
    for (let id = 2; id <= 65; id += 1) rows.push(row(id, { folder: 1, firstChild: id < 65 ? id + 1 : 0 }));
    const flat = flattenClipLayerTree(mapOf(...rows), 1, OPTIONS, fn);

    expect(flat.map((entry) => entry.depth)).toEqual(Array.from({ length: 64 }, (_, index) => index));
    expect(flat[63]!.parentIndex).toBe(62);
  });
});
