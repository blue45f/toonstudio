import { describe, expect, it } from "vitest";

import { importChunkedSqliteDocument } from "../packages/studio-format-gateway/src/chunked-sqlite-document";
import { buildClipDocument, type FixtureDocumentSpec } from "../tests/corpus/formats/chunked-sqlite-document-fixtures";
import { createNodeSqliteOpener, openNodeSqlite } from "../tests/corpus/formats/node-sqlite-clip-reader";

import {
  describeChunkedDocument,
  formatDocumentReportText,
  runDocumentInspectCli,
  summarizeChunkedDocument,
  type DocumentCliDeps,
} from "./inspect-chunked-document.mts";

const SENTINEL_NAME = "비밀-레이어-이름-7f3a";
const SENTINEL_UUID = "deadbeef-0000-4000-8000-00000000cafe";

/** 서명 + IHDR(폭 50, 높이 40)만 있는 PNG 머리. */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

const pixel = (): readonly [number, number, number, number] => [10, 20, 30, 255];

const SPEC: FixtureDocumentSpec = {
  canvas: { width: 100, height: 80 },
  preview: pngHeader(50, 40),
  layers: [
    { id: 1, children: [2, 3, 4, 5, 6] },
    { id: 2, name: SENTINEL_NAME, layerType: 1584, drawColor: { r: 255, g: 255, b: 255 }, uuid: SENTINEL_UUID },
    { id: 3, name: "full", raster: { width: 100, height: 80, kind: "rgba", pixelAt: pixel }, composite: 2, opacity: 128, clip: 1, drawToRenderType: 31 },
    { id: 4, name: "inside", raster: { width: 10, height: 10, kind: "rgba", pixelAt: pixel }, offset: [20, 20], renderOffset: [-20, -20], mask: { width: 10, height: 10, kind: "mask8", pixelAt: () => [255] } },
    { id: 5, name: "outside", raster: { width: 10, height: 10, kind: "gray8", pixelAt: () => [5, 255] }, offset: [95, 75], renderOffset: [0, 0], lock: 3 },
    { id: 6, name: "adjust", layerType: 4098, folder: false },
  ],
};

async function bytesOf(spec: FixtureDocumentSpec): Promise<Uint8Array> {
  return buildClipDocument(spec).bytes;
}

function makeCli(files: Record<string, Uint8Array>, openSqlite = openNodeSqlite) {
  const out: string[] = [];
  const err: string[] = [];
  const deps: DocumentCliDeps = {
    readFile: (path) => {
      const bytes = files[path];
      if (bytes === undefined) throw new Error(`ENOENT: ${path}`);
      return bytes;
    },
    stdout: (text) => void out.push(text),
    stderr: (text) => void err.push(text),
    openSqlite,
  };
  return { deps, out, err };
}

describe("summarizeChunkedDocument", () => {
  it("레이어 종류·합성·표시 비트·오프셋 관계·디코드 범위를 집계한다", async () => {
    const result = await importChunkedSqliteDocument(await bytesOf(SPEC), { openSqlite: openNodeSqlite });
    const summary = summarizeChunkedDocument(result);

    expect(summary.canvas).toMatchObject({ unit: "px", unitCode: 0, width: 100, height: 80, sizeSource: "pixel-unit" });
    expect(summary.layerCount).toBe(5);
    expect(summary.kinds).toEqual({ adjustment: 1, paper: 1, raster: 3 });
    expect(summary.composite).toEqual({ "0=normal": 4, "2=multiply": 1 });
    expect(summary.opacityRaw).toEqual({ min: 128, max: 256 });
    expect(summary.clipToBelow).toBe(1);
    expect(summary.lock).toEqual({ "0": 4, "3": 1 });
    expect(summary.visibility).toEqual({ "1": 4, "3": 1 });
    expect(summary.drawToRenderType).toEqual({ "31": 1, null: 4 });
    expect(summary.placement).toEqual({ renderNegatesLayerOffset: 1, bothZero: 3, other: 1 });
    expect(summary.pixels).toEqual({
      withPixels: 3,
      colorModes: { color: 2, gray: 1 },
      extentEqualsCanvas: 1,
      extentInsideCanvas: 1,
      extentOutsideCanvas: 1,
      layersWithStoredBlocks: 3,
      layersAllInitial: 0,
      storedBlocksTotal: 3,
    });
    expect(summary.masks).toEqual({ total: 1, enabled: 1, withValues: 1, withStoredBlocks: 1, defaultValues: { "0": 1 } });
    expect(summary.preview).toEqual({ bytes: 33, width: 50, height: 40, aspectMatchesCanvas: true });
    expect(summary.warnings).toEqual({});
    expect(summary.unsupported).toEqual({ "clip-layer-adjustment-not-applied": 1 });
    expect(Object.keys(summary.exampleMessages)).toEqual(["clip-layer-adjustment-not-applied"]);
  });

  it("진단 코드별 건수는 목록이 접히기 전의 총계이고 저장된 블록이 없는 레이어를 따로 센다", async () => {
    const texts = Array.from({ length: 70 }, (_, index) => ({ id: index + 3, name: `t${index}`, layerType: 1, overrides: { TextLayerString: Uint8Array.of(1) } }));
    const spec: FixtureDocumentSpec = {
      layers: [
        { id: 1, children: [2, ...texts.map((layer) => layer.id)] },
        { id: 2, name: "empty", raster: { width: 4, height: 4, kind: "rgba", emptyBlocks: new Set([0]), pixelAt: pixel } },
        ...texts,
      ],
    };
    const result = await importChunkedSqliteDocument(await bytesOf(spec), { openSqlite: openNodeSqlite });
    const summary = summarizeChunkedDocument(result);

    expect(result.unsupported.filter((issue) => issue.code === "clip-layer-kind-not-rendered")).toHaveLength(50);
    expect(summary.unsupported).toEqual({ "clip-layer-kind-not-rendered": 70 });
    expect(summary.warnings).toEqual({});
    expect(Object.keys(summary.exampleMessages)).toEqual(["clip-layer-kind-not-rendered"]);
    expect(summary.exampleMessages["clip-layer-kind-not-rendered"]).toContain("텍스트 레이어");
    expect(summary.pixels).toMatchObject({ withPixels: 1, layersWithStoredBlocks: 0, layersAllInitial: 1, storedBlocksTotal: 0 });
  });

  it("미리보기 가로세로비가 캔버스와 1%를 넘게 다르면 맞지 않는다고 적는다(경계 포함)", async () => {
    const aspect = async (width: number, height: number) =>
      summarizeChunkedDocument(await importChunkedSqliteDocument(await bytesOf({ layers: [{ id: 1 }], canvas: { width: 1000, height: 1000 }, preview: pngHeader(width, height) }), { openSqlite: openNodeSqlite })).preview!
        .aspectMatchesCanvas;

    // 정확히 1%는 부동소수점 오차에 걸리므로 경계에서 조금 벗어난 값으로 확인한다.
    expect(await aspect(1000, 1000)).toBe(true);
    expect(await aspect(1009, 1000)).toBe(true);
    expect(await aspect(1011, 1000)).toBe(false);
    expect(await aspect(991, 1000)).toBe(true);
    expect(await aspect(989, 1000)).toBe(false);
    expect(await aspect(1000, 1011)).toBe(false);
  });

  it("PNG 머리가 너무 짧거나 크기가 0이면 크기를 모른다고 적는다", async () => {
    const short = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3);
    const zero = pngHeader(0, 0);
    for (const preview of [short, zero]) {
      const summary = summarizeChunkedDocument(await importChunkedSqliteDocument(await bytesOf({ ...SPEC, preview }), { openSqlite: openNodeSqlite }));
      expect(summary.preview).toMatchObject({ width: null, height: null, aspectMatchesCanvas: null });
    }
  });

  it("미리보기가 없으면 preview는 null이다", async () => {
    const summary = summarizeChunkedDocument(await importChunkedSqliteDocument(await bytesOf({ ...SPEC, preview: undefined }), { openSqlite: openNodeSqlite }));

    expect(summary.preview).toBeNull();
  });

  it("레이어가 없으면 opacityRaw는 null이다", async () => {
    const summary = summarizeChunkedDocument(await importChunkedSqliteDocument(await bytesOf({ layers: [{ id: 1 }] }), { openSqlite: openNodeSqlite }));

    expect(summary.opacityRaw).toBeNull();
    expect(summary.layerCount).toBe(0);
  });
});

describe("describeChunkedDocument", () => {
  it("성공하면 ok와 길이, SHA-256, 집계를 돌려준다", async () => {
    const report = await describeChunkedDocument(await bytesOf(SPEC));

    expect(report.ok).toBe(true);
    if (report.ok) {
      expect(report.byteLength).toBeGreaterThan(0);
      expect(report.sha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(report.summary.layerCount).toBe(5);
    }
  });

  it("가져오기 오류는 던지지 않고 코드와 함께 돌려준다", async () => {
    const report = await describeChunkedDocument(new Uint8Array(40));

    expect(report).toMatchObject({ ok: false, code: "container-invalid" });
  });

  it("ClipDocumentError가 아닌 예외는 삼키지 않고 그대로 던진다", async () => {
    const opener = createNodeSqliteOpener({
      transformRows: (request, rows) =>
        request.table === "Canvas"
          ? [
              new Proxy(rows[0]!, {
                get() {
                  throw new TypeError("버그");
                },
              }),
            ]
          : rows,
    });

    await expect(describeChunkedDocument(await bytesOf(SPEC), opener)).rejects.toBeInstanceOf(TypeError);
  });
});

describe("문서 요약 CLI", () => {
  it("텍스트 출력은 집계만 담고 이름·UUID·미리보기 바이트는 담지 않는다", async () => {
    const { deps, out } = makeCli({ "sample.clip": await bytesOf(SPEC) });

    const code = await runDocumentInspectCli(["sample.clip"], deps);

    expect(code).toBe(0);
    const text = out.join("");
    expect(text).toContain("== sample.clip");
    expect(text).toContain("canvas: unit=px(0) value=100x80 dpi=72 -> 100x80px (pixel-unit)");
    expect(text).toContain("layers: 5 kinds: adjustment×1 paper×1 raster×3");
    expect(text).toContain("composite: 0=normal×4 2=multiply×1");
    expect(text).toContain("placement: renderNegatesLayerOffset=1 bothZero=3 other=1");
    expect(text).toContain("extent: equalsCanvas=1 insideCanvas=1 outsideCanvas=1");
    expect(text).toContain("storedBlocks: layersWithStoredBlocks=3 layersAllInitial=0 totalBlocks=3");
    expect(text).toContain("withStoredBlocks=1");
    expect(text).toContain("preview: 33 bytes 50x40 aspectMatchesCanvas=true");
    expect(text).toContain("unsupported: clip-layer-adjustment-not-applied×1");
    expect(text).not.toContain(SENTINEL_NAME);
    expect(text).not.toContain(SENTINEL_UUID);
  });

  it("--json은 보고서 배열을 출력하고 이름·UUID를 담지 않으며 경로 대신 파일명만 쓴다", async () => {
    const { deps, out } = makeCli({ "/private/home/user/sample.clip": await bytesOf(SPEC) });

    const code = await runDocumentInspectCli(["--json", "/private/home/user/sample.clip"], deps);

    expect(code).toBe(0);
    const text = out.join("");
    const parsed = JSON.parse(text) as Array<{ file: string; report: { ok: boolean } }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ file: "sample.clip", report: { ok: true } });
    expect(text).not.toContain("/private/home/user");
    expect(text).not.toContain(SENTINEL_NAME);
    expect(text).not.toContain(SENTINEL_UUID);
  });

  it("가져오기에 실패한 파일은 종료 코드 3이고 이유를 출력한다", async () => {
    const { deps, out } = makeCli({ "bad.clip": new Uint8Array(40), "good.clip": await bytesOf(SPEC) });

    const code = await runDocumentInspectCli(["bad.clip", "good.clip"], deps);

    expect(code).toBe(3);
    const text = out.join("");
    expect(text).toContain("== bad.clip\n가져오기 실패 [container-invalid]");
    expect(text).toContain("== good.clip (");
  });

  it("읽기 실패는 종료 코드 1이고 나머지 파일은 계속 처리한다", async () => {
    const { deps, out, err } = makeCli({ "good.clip": await bytesOf(SPEC) });

    const code = await runDocumentInspectCli(["missing.clip", "good.clip"], deps);

    expect(code).toBe(1);
    expect(err.join("")).toContain("missing.clip: 읽기 실패");
    expect(out.join("")).toContain("== good.clip");
  });

  it("읽기 실패가 먼저 있으면 가져오기 실패가 있어도 종료 코드는 1이다", async () => {
    const { deps } = makeCli({ "bad.clip": new Uint8Array(40) });

    expect(await runDocumentInspectCli(["missing.clip", "bad.clip"], deps)).toBe(1);
  });

  it("가져오기 실패가 먼저 있고 읽기 실패가 뒤에 있으면 종료 코드는 3이 아니라 1이다", async () => {
    const { deps } = makeCli({ "bad.clip": new Uint8Array(40) });

    expect(await runDocumentInspectCli(["bad.clip", "missing.clip"], deps)).toBe(1);
  });

  it("사용법 오류는 종료 코드 2다", async () => {
    const empty = makeCli({});
    expect(await runDocumentInspectCli([], empty.deps)).toBe(2);
    expect(empty.err.join("")).toContain("검사할 파일이 없습니다");
    const unknown = makeCli({});
    expect(await runDocumentInspectCli(["--nope", "a.clip"], unknown.deps)).toBe(2);
    expect(unknown.err.join("")).toContain("알 수 없는 옵션: --nope");
  });

  it("--help는 사용법을 출력하고 0으로 끝난다", async () => {
    const { deps, out } = makeCli({});

    expect(await runDocumentInspectCli(["--help"], deps)).toBe(0);
    expect(out.join("")).toContain("사용법: pnpm exec tsx scripts/inspect-chunked-document.mts");
    const short = makeCli({});
    expect(await runDocumentInspectCli(["-h"], short.deps)).toBe(0);
  });

  it("주입한 SQLite 판독기를 쓴다", async () => {
    const log = { selects: [] as never[], tableColumnCalls: 0, closed: false };
    const { deps } = makeCli({ "a.clip": await bytesOf(SPEC) }, createNodeSqliteOpener({ log }));

    await runDocumentInspectCli(["a.clip"], deps);

    expect(log.tableColumnCalls).toBeGreaterThan(0);
    expect(log.closed).toBe(true);
  });
});

describe("formatDocumentReportText", () => {
  it("메시지 예시는 코드마다 첫 메시지 하나만 출력한다", async () => {
    const spec: FixtureDocumentSpec = {
      layers: [{ id: 1, children: [2, 3] }, { id: 2, name: "a", layerType: 4098 }, { id: 3, name: "b", layerType: 4098 }],
    };
    const report = await describeChunkedDocument(await bytesOf(spec));
    const text = formatDocumentReportText("x.clip", report);

    expect(text.match(/- clip-layer-adjustment-not-applied:/gu)).toHaveLength(1);
    expect(text).toContain("unsupported: clip-layer-adjustment-not-applied×2");
  });

  it("실패 보고는 두 줄이다", () => {
    expect(formatDocumentReportText("x.clip", { ok: false, code: "limit-exceeded", message: "너무 크다" })).toBe("== x.clip\n가져오기 실패 [limit-exceeded]: 너무 크다");
  });
});
