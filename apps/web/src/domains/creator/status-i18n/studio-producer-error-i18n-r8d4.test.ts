import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createStudioAnimaticFromPages,
  exportStudioAnimaticDocument,
  importStudioAnimaticDocument,
  loadStudioAnimaticDocument,
  planStudioAnimaticPreview,
  saveStudioAnimaticDocument,
  STUDIO_ANIMATIC_KIND,
  STUDIO_ANIMATIC_MAX_IMPORT_BYTES,
  STUDIO_ANIMATIC_MAX_SEGMENTS,
  STUDIO_ANIMATIC_VERSION,
  studioAnimaticStorageKey,
  validateStudioAnimaticDocument,
  type StudioAnimaticDocument,
  type StudioAnimaticStorage,
} from "../studio-animatic-timeline";
import {
  createStudioTranslationMemoryEntry,
  exportStudioTranslationMemory,
  importStudioTranslationMemory,
  loadStudioTranslationMemory,
  saveStudioTranslationMemory,
  STUDIO_TRANSLATION_MEMORY_KIND,
  STUDIO_TRANSLATION_MEMORY_MAX_IMPORT_BYTES,
  STUDIO_TRANSLATION_MEMORY_MAX_IMPORT_CANDIDATES,
  STUDIO_TRANSLATION_MEMORY_VERSION,
  type StudioTranslationMemoryEntry,
} from "../studio-translation-memory";
import { parseStudioAnimaticSubtitles } from "../animatic/studio-animatic-subtitles";
import {
  planStudioBg3dLtLayers,
  STUDIO_BG3D_LT_LAYER_NAMES,
  type StudioBg3dLtLayerPlanFailure,
} from "../bg3d/studio-bg3d-lt-layer-plan";
import {
  resolveStudioAnimaticError,
  resolveStudioTranslationMemoryExportError,
  resolveStudioTranslationMemoryImportError,
} from "./studio-producer-error-i18n";
import {
  resolveStudioBg3dLtLayerName,
  resolveStudioBg3dLtLayerPlanError,
} from "./studio-producer-error-i18n-bg3d-lt";

/**
 * D4 파일럿 계약 (A4 생산자 진단 T0, 2026-10-23): 생산자
 * importStudioTranslationMemory는 표시 문구 대신 구조화 코드+파라미터를
 * 방출하고, 표시는 표시 지점(패널 setNotice)과 문자열 집계 경계
 * (LoadResult.error 패스스루 2곳)에서만 리졸버로 해석한다.
 * ko 해석 결과는 이관 전 원문과 글자 단위로 동일해야 한다(표시 문구 무변경).
 */

describe("D4 pilot — producer emits structured codes", () => {
  it("emits importTooLarge with size param instead of a message", () => {
    const result = importStudioTranslationMemory("x".repeat(STUDIO_TRANSLATION_MEMORY_MAX_IMPORT_BYTES + 1));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ code: "importTooLarge", params: { size: "2.0" } });
  });

  it("emits importInvalidJson / importNotDocument / importUnsupportedDocument", () => {
    const invalidJson = importStudioTranslationMemory("{broken");
    const notDocument = importStudioTranslationMemory("42");
    const unsupported = importStudioTranslationMemory(JSON.stringify({ kind: "other", version: 99, entries: [] }));
    for (const [result, code] of [
      [invalidJson, "importInvalidJson"],
      [notDocument, "importNotDocument"],
      [unsupported, "importUnsupportedDocument"],
    ] as const) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe(code);
    }
  });

  it("emits importTooManyCandidates with locale-formatted count param", () => {
    const result = importStudioTranslationMemory(JSON.stringify({
      kind: STUDIO_TRANSLATION_MEMORY_KIND,
      version: STUDIO_TRANSLATION_MEMORY_VERSION,
      entries: Array.from({ length: STUDIO_TRANSLATION_MEMORY_MAX_IMPORT_CANDIDATES + 1 }, () => null),
    }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("importTooManyCandidates");
    expect(result.error.params?.count).toBe(STUDIO_TRANSLATION_MEMORY_MAX_IMPORT_CANDIDATES.toLocaleString("ko-KR"));
  });
});

describe("D4 pilot — display-side resolution keeps ko copy identical", () => {
  it("resolves every code to the exact pre-migration Korean string", () => {
    expect(resolveStudioTranslationMemoryImportError({ code: "importTooLarge", params: { size: "2.0" } }))
      .toBe("가져오기 파일은 2.0MB 이하여야 합니다.");
    expect(resolveStudioTranslationMemoryImportError({ code: "importInvalidJson" }))
      .toBe("번역 메모리 JSON을 해석하지 못했습니다.");
    expect(resolveStudioTranslationMemoryImportError({ code: "importNotDocument" }))
      .toBe("번역 메모리 문서 형식이 아닙니다.");
    expect(resolveStudioTranslationMemoryImportError({ code: "importUnsupportedDocument" }))
      .toBe("지원하는 ToonStudio 번역 메모리 v1 문서가 아닙니다.");
    expect(resolveStudioTranslationMemoryImportError({
      code: "importTooManyCandidates",
      params: { count: STUDIO_TRANSLATION_MEMORY_MAX_IMPORT_CANDIDATES.toLocaleString("ko-KR") },
    })).toBe(`한 번에 최대 ${STUDIO_TRANSLATION_MEMORY_MAX_IMPORT_CANDIDATES.toLocaleString("ko-KR")}개 후보만 가져올 수 있습니다.`);
  });

  it("string-aggregator boundary (load passthrough) still yields the original string", () => {
    const storage = { getItem: () => "{broken", setItem: () => undefined, removeItem: () => undefined } as unknown as Storage;
    const loaded = loadStudioTranslationMemory(storage);
    expect(loaded.status).toBe("invalid");
    expect(loaded.error).toBe("번역 메모리 JSON을 해석하지 못했습니다.");
  });

  it("producer source no longer carries the five import message literals", () => {
    const producer = readFileSync(new URL("../studio-translation-memory.ts", import.meta.url), "utf-8");
    for (const literal of [
      "번역 메모리 JSON을 해석하지 못했습니다.",
      "번역 메모리 문서 형식이 아닙니다.",
      "지원하는 ToonStudio 번역 메모리 v1 문서가 아닙니다.",
      "개 후보만 가져올 수 있습니다.",
      "MB 이하여야 합니다.`",
    ]) {
      expect(producer).not.toContain(literal);
    }
  });

  it("keeps ko/en key parity in the resolver module", () => {
    // R11: 사전이 코어(tm·animatic) + 형제 모듈 5개로 나뉘어, 패리티는 제품군 전체를 누적해 본다.
    const source = [
      "./studio-producer-error-i18n.ts",
      "./studio-producer-error-i18n-glb.ts",
      "./studio-producer-error-i18n-palette.ts",
      "./studio-producer-error-i18n-dialogue.ts",
      "./studio-producer-error-i18n-bg3d-lt.ts",
      "./studio-producer-error-i18n-bg3d-measure.ts",
    ].map((rel) => readFileSync(new URL(rel, import.meta.url), "utf-8")).join("\n");
    const blocks: Record<string, string[]> = {};
    for (const match of source.matchAll(/registerI18nLocaleEntries\("(ko|en)", \{([\s\S]*?)\}\);/g)) {
      blocks[match[1] ?? ""] = [...(match[2] ?? "").matchAll(/"(studio\.producerError\.[^"]+)":/g)].map((m) => m[1] ?? "");
    }
    // R9: 등록 블록이 구간별로 늘었다(tm 11 + animatic 25 — 본체 23 + 자막 파서 2). 블록 단위 누적으로 패리티를 본다.
    // R11: 형제 모듈 구간(glb 55 + palette 23 + dialogue 105 + bg3dLt 50 + bg3dMeasure·shotBatchPlan 56)이 더해져 누적 325키가 된다.
    const accumulated: Record<string, string[]> = { ko: [], en: [] };
    for (const match of source.matchAll(/registerI18nLocaleEntries\("(ko|en)", \{([\s\S]*?)\}\);/g)) {
      accumulated[match[1] ?? ""]!.push(...[...(match[2] ?? "").matchAll(/"(studio\.producerError\.[^"]+)":/g)].map((m) => m[1] ?? ""));
    }
    expect(accumulated.ko).toHaveLength(325);
    expect(accumulated.en).toEqual(accumulated.ko);
  });
});

/**
 * R9 후속 (A4 D4): animatic 생산자 23코드 전수 이관 + TM 잔여(export·load·save) 이관.
 * 파일럿과 같은 계약 — 생산자는 코드+파라미터만 방출하고, ko 해석 결과는 이관 전
 * 원문과 글자 단위로 동일해야 하며, LoadResult·SaveResult 문자열 집계 경계에서는
 * 경계 안쪽에서 해석한 문자열이 그대로 나와야 한다.
 */

function animaticDocument(): StudioAnimaticDocument {
  const created = createStudioAnimaticFromPages(
    [{ id: "page-1", name: "오프닝", canvasH: 1_200 }],
    { workScope: "episode-01" },
  );
  if (!created.ok) throw new Error(created.error.code);
  return created.document;
}

describe("R9 animatic — producer emits structured codes", () => {
  it("validate emits document/settings/items/duplicate codes", () => {
    expect(validateStudioAnimaticDocument(null)).toMatchObject({ ok: false, error: { code: "notDocument" } });
    expect(validateStudioAnimaticDocument({ kind: "other", version: 99 })).toMatchObject({ ok: false, error: { code: "unsupportedDocument" } });
    expect(validateStudioAnimaticDocument({
      kind: STUDIO_ANIMATIC_KIND, version: STUDIO_ANIMATIC_VERSION,
      workScope: "", fps: 12, previewMode: "cuts", loop: false, segments: [],
    })).toMatchObject({ ok: false, error: { code: "invalidSettings" } });
    expect(validateStudioAnimaticDocument({
      kind: STUDIO_ANIMATIC_KIND, version: STUDIO_ANIMATIC_VERSION,
      workScope: "episode-01", fps: 12, previewMode: "cuts", loop: false, segments: [{}],
    })).toMatchObject({ ok: false, error: { code: "invalidItems" } });
    const doc = animaticDocument();
    expect(validateStudioAnimaticDocument({ ...doc, segments: [doc.segments[0]!, doc.segments[0]!] }))
      .toMatchObject({ ok: false, error: { code: "duplicateSegmentId" } });
  });

  it("validate emits textLimitExceeded when cue text metadata overflows", () => {
    const doc = animaticDocument();
    const segment = doc.segments[0]!;
    const fat = Array.from({ length: 13 }, (_, i) => ({
      ...segment,
      id: `seg-${i}`,
      cues: Array.from({ length: 32 }, (_, j) => ({
        id: `cue-${j}`, kind: "sfx" as const, offsetMs: 0, text: "x".repeat(500),
      })),
    }));
    expect(validateStudioAnimaticDocument({ ...doc, segments: fat }))
      .toMatchObject({ ok: false, error: { code: "textLimitExceeded" } });
  });

  it("create emits scope/page/segment codes with params", () => {
    expect(createStudioAnimaticFromPages([], { workScope: "  " }))
      .toMatchObject({ ok: false, error: { code: "invalidWorkScope" } });
    expect(createStudioAnimaticFromPages([{ id: "" }], { workScope: "ep" }))
      .toEqual({ ok: false, error: { code: "invalidPageId", params: { page: "1" } } });
    expect(createStudioAnimaticFromPages([{ id: "p1" }, { id: "p1" }], { workScope: "ep" }))
      .toMatchObject({ ok: false, error: { code: "duplicatePageId" } });
    const many = Array.from({ length: STUDIO_ANIMATIC_MAX_SEGMENTS + 1 }, (_, i) => ({ id: `p-${i}`, canvasH: 1 }));
    expect(createStudioAnimaticFromPages(many, { workScope: "ep" }))
      .toEqual({ ok: false, error: { code: "tooManySegments", params: { max: String(STUDIO_ANIMATIC_MAX_SEGMENTS) } } });
    expect(createStudioAnimaticFromPages(
      [{ id: "p1", elements: [{ id: "x".repeat(181), type: "frame", x: 0, y: 0, width: 10, height: 10 }] }],
      { workScope: "ep" },
    )).toMatchObject({ ok: false, error: { code: "invalidCutId" } });
    expect(createStudioAnimaticFromPages(
      [{ id: "p1", canvasH: 100_000 }, { id: "p2", canvasH: 100_000 }],
      { workScope: "ep" },
    )).toMatchObject({ ok: false, error: { code: "stripTooLong" } });
  });

  it("plan emits duration codes with params", () => {
    const doc = animaticDocument();
    const segment = doc.segments[0]!;
    expect(planStudioAnimaticPreview({ ...doc, segments: [{ ...segment, holdMs: 0, transition: { kind: "cut", durationMs: 0 } }] }))
      .toMatchObject({ ok: false, error: { code: "invalidSegmentDuration" } });
    const long = Array.from({ length: 21 }, (_, i) => ({ ...segment, id: `d-${i}`, holdMs: 30_000, transition: { kind: "cut" as const, durationMs: 0 } }));
    expect(planStudioAnimaticPreview({ ...doc, segments: long }))
      .toEqual({ ok: false, error: { code: "totalDurationTooLong", params: { minutes: "10" } } });
  });

  it("import emits tooLarge/invalidJson codes with params", () => {
    expect(importStudioAnimaticDocument("x".repeat(STUDIO_ANIMATIC_MAX_IMPORT_BYTES + 1)))
      .toEqual({ ok: false, error: { code: "importTooLarge", params: { size: "1000" } } });
    expect(importStudioAnimaticDocument("{broken"))
      .toMatchObject({ ok: false, error: { code: "importInvalidJson" } });
    expect(exportStudioAnimaticDocument(animaticDocument()).ok).toBe(true);
  });
});

describe("R9 animatic — subtitle parser emits structured codes (통합 후속)", () => {
  it("parse failures carry codes that resolve to the pre-migration ko copy", () => {
    const empty = parseStudioAnimaticSubtitles("");
    expect(empty).toMatchObject({ ok: false, error: { code: "subtitlesEmpty" } });
    if (!empty.ok) expect(resolveStudioAnimaticError(empty.error)).toBe("자막 파일 내용이 비어 있습니다.");
    const noCues = parseStudioAnimaticSubtitles("자막이 아닌 메모\n그냥 텍스트");
    expect(noCues).toMatchObject({ ok: false, error: { code: "subtitlesNoCues" } });
    if (!noCues.ok) expect(resolveStudioAnimaticError(noCues.error)).toBe("자막 파일에서 읽을 수 있는 큐가 없습니다.");
  });
});

describe("R9 animatic — display-side resolution keeps ko copy identical", () => {
  it("resolves all 23 codes to the exact pre-migration Korean strings", () => {
    const cases: readonly [Parameters<typeof resolveStudioAnimaticError>[0], string][] = [
      [{ code: "notDocument" }, "애니매틱 문서 형식이 아닙니다."],
      [{ code: "unsupportedDocument" }, "지원하는 ToonStudio 애니매틱 v1 문서가 아닙니다."],
      [{ code: "invalidSettings" }, "애니매틱 설정 또는 세그먼트 한도가 올바르지 않습니다."],
      [{ code: "invalidItems" }, "유효하지 않은 컷·카메라·cue 항목이 있습니다."],
      [{ code: "duplicateSegmentId" }, "중복된 애니매틱 세그먼트 ID가 있습니다."],
      [{ code: "textLimitExceeded" }, "애니매틱 텍스트 메타데이터 한도를 넘었습니다."],
      [{ code: "invalidWorkScope" }, "유효한 작품 범위가 필요합니다."],
      [{ code: "invalidPageId", params: { page: "3" } }, "3페이지 ID가 올바르지 않습니다."],
      [{ code: "duplicatePageId" }, "중복된 페이지 ID가 있습니다."],
      [{ code: "tooManySegments", params: { max: "180" } }, "애니매틱은 최대 180개 페이지·컷까지 만들 수 있습니다."],
      [{ code: "invalidCutId" }, "유효하지 않은 컷 ID가 있습니다."],
      [{ code: "stripTooLong" }, "세로 페이지 스트립 길이 한도를 넘었습니다."],
      [{ code: "invalidSegmentDuration" }, "유효하지 않은 컷 길이가 있습니다."],
      [{ code: "totalDurationTooLong", params: { minutes: "10" } }, "총 길이는 10분 이하여야 합니다."],
      [{ code: "tooManyFrames", params: { max: "18,000" } }, "미리보기는 최대 18,000프레임까지 만들 수 있습니다."],
      [{ code: "exportTooLarge", params: { size: "800" } }, "애니매틱 JSON은 800KB 이하여야 합니다."],
      [{ code: "importTooLarge", params: { size: "1000" } }, "가져오기 파일은 1000KB 이하여야 합니다."],
      [{ code: "importInvalidJson" }, "애니매틱 JSON을 해석하지 못했습니다."],
      [{ code: "storageUnavailable" }, "브라우저 로컬 저장소를 사용할 수 없습니다."],
      [{ code: "storageReadFailed" }, "브라우저 로컬 저장소를 읽을 수 없습니다."],
      [{ code: "wrongWorkScope" }, "다른 작품 범위의 애니매틱 문서입니다."],
      [{ code: "saveNoStorage" }, "로컬 저장소가 없어 현재 탭에서만 유지됩니다."],
      [{ code: "saveStorageFull" }, "브라우저 저장 공간이 부족하거나 로컬 저장이 차단되었습니다."],
    ];
    expect(cases).toHaveLength(23);
    for (const [error, expected] of cases) {
      expect(resolveStudioAnimaticError(error)).toBe(expected);
    }
  });

  it("string-aggregator boundaries (load/save) still yield the original strings", () => {
    const doc = animaticDocument();
    expect(loadStudioAnimaticDocument(null, "episode-01"))
      .toEqual({ document: null, status: "unavailable", error: "브라우저 로컬 저장소를 사용할 수 없습니다." });
    const blocked: StudioAnimaticStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(loadStudioAnimaticDocument(blocked, "episode-01").error).toBe("브라우저 로컬 저장소를 읽을 수 없습니다.");
    expect(saveStudioAnimaticDocument(blocked, doc).error).toBe("브라우저 저장 공간이 부족하거나 로컬 저장이 차단되었습니다.");
    expect(saveStudioAnimaticDocument(null, doc).error).toBe("로컬 저장소가 없어 현재 탭에서만 유지됩니다.");
    const broken: StudioAnimaticStorage = { getItem: () => "{broken", setItem: () => undefined };
    expect(loadStudioAnimaticDocument(broken, "episode-01"))
      .toEqual({ document: null, status: "invalid", error: "애니매틱 JSON을 해석하지 못했습니다." });
    const exported = exportStudioAnimaticDocument(doc);
    if (!exported.ok) throw new Error(exported.error.code);
    const planted = new Map([[studioAnimaticStorageKey("episode-02"), exported.json]]);
    const scoped: StudioAnimaticStorage = {
      getItem: (key) => planted.get(key) ?? null,
      setItem: (key, value) => { planted.set(key, value); },
    };
    expect(loadStudioAnimaticDocument(scoped, "episode-02"))
      .toEqual({ document: null, status: "invalid", error: "다른 작품 범위의 애니매틱 문서입니다." });
  });

  it("producer source no longer carries the animatic error literals", () => {
    const producer = readFileSync(new URL("../studio-animatic-timeline.ts", import.meta.url), "utf-8");
    for (const literal of [
      "애니매틱 문서 형식이 아닙니다.",
      "지원하는 ToonStudio 애니매틱 v1 문서가 아닙니다.",
      "애니매틱 JSON을 해석하지 못했습니다.",
      "다른 작품 범위의 애니매틱 문서입니다.",
      "브라우저 로컬 저장소를 사용할 수 없습니다.",
      "로컬 저장소가 없어 현재 탭에서만 유지됩니다.",
      "개 페이지·컷까지 만들 수 있습니다.",
      "프레임까지 만들 수 있습니다.",
    ]) {
      expect(producer).not.toContain(literal);
    }
  });
});

describe("R9 TM remainder — export codes and storage boundaries", () => {
  function tmEntry(): StudioTranslationMemoryEntry {
    const created = createStudioTranslationMemoryEntry({
      workScope: "episode-01", sourceText: "안녕", speaker: "유나",
      sourceLocale: "ko", targetLocale: "en", translation: "Hello", sourceRevision: "r1",
    });
    if (!created.ok) throw new Error(created.error);
    return created.entry;
  }

  it("export emits structured codes and resolves to the original ko strings", () => {
    const invalid = { bogus: true } as unknown as StudioTranslationMemoryEntry;
    const failed = exportStudioTranslationMemory([invalid]);
    expect(failed).toEqual({ ok: false, error: { code: "exportInvalidEntries" } });
    if (!failed.ok) {
      expect(resolveStudioTranslationMemoryExportError(failed.error))
        .toBe("유효하지 않거나 저장 한도를 넘는 항목이 있어 내보내기를 중단했습니다.");
    }
    expect(resolveStudioTranslationMemoryExportError({ code: "exportTooLarge", params: { size: "1.5" } }))
      .toBe("내보내기 결과가 1.5MB 제한을 넘습니다.");
  });

  it("save resolves export failures at the SaveResult string boundary", () => {
    const storage = { getItem: () => null, setItem: () => undefined } as unknown as Storage;
    const invalid = { bogus: true } as unknown as StudioTranslationMemoryEntry;
    expect(saveStudioTranslationMemory(storage, [invalid]))
      .toEqual({ ok: false, error: "유효하지 않거나 저장 한도를 넘는 항목이 있어 내보내기를 중단했습니다." });
  });

  it("load/save storage boundaries still yield the original strings", () => {
    const entry = tmEntry();
    expect(loadStudioTranslationMemory(null).error).toBe("브라우저 로컬 저장소를 사용할 수 없습니다.");
    const blocked = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    } as unknown as Storage;
    expect(loadStudioTranslationMemory(blocked).error).toBe("브라우저 로컬 저장소를 읽을 수 없습니다.");
    expect(saveStudioTranslationMemory(null, [entry]).error).toBe("로컬 저장소가 없어 현재 탭에서만 유지됩니다.");
    expect(saveStudioTranslationMemory(blocked, [entry]).error).toBe("브라우저 저장 공간이 부족하거나 로컬 저장이 차단되었습니다.");
  });

  it("producer source no longer carries the export/storage error literals", () => {
    const producer = readFileSync(new URL("../studio-translation-memory.ts", import.meta.url), "utf-8");
    for (const literal of [
      "유효하지 않거나 저장 한도를 넘는 항목이 있어 내보내기를 중단했습니다.",
      "MB 제한을 넘습니다.",
      "브라우저 로컬 저장소를 사용할 수 없습니다.",
      "브라우저 저장 공간이 부족하거나 로컬 저장이 차단되었습니다.",
    ]) {
      expect(producer).not.toContain(literal);
    }
  });
});

/**
 * R11 (A4 D4): bg3d LT 레이어 계획 생산자 서브코드 46종 전수 이관.
 * 기존 code 31종을 문구 단위 서브코드(`<기존 code>.<문구 슬러그>`)로 분해했고,
 * 동적 1곳(missing-allocation.layerId)은 params.layerName에 역할 코드를 싣고
 * 해석 시점에 라벨 맵(layerName.*)으로 먼저 해석한다. ko 해석은 원문과 동일해야 한다.
 */

const LT_PNG = "data:image/png;base64,TUFJTg==";

describe("R11 bg3dLt — producer emits structured subcodes", () => {
  it("emits pageLocked / duplicateElementId subcodes without messages", () => {
    const locked = planStudioBg3dLtLayers({
      elements: [], groups: [], pageLocked: true,
      render: { pngDataUrl: LT_PNG, width: 100, height: 50, bg3dScene: { sceneId: "s" } },
    });
    expect(locked).toEqual({ ok: false, code: "page-locked.pageLocked" });
    const dup = planStudioBg3dLtLayers({
      elements: [
        { id: "x", type: "text" }, { id: "x", type: "text" },
      ],
      groups: [],
      render: { pngDataUrl: LT_PNG, width: 100, height: 50, bg3dScene: { sceneId: "s" } },
    });
    expect(dup).toEqual({ ok: false, code: "duplicate-element-id.duplicateElementId" });
  });

  it("emits layerId with the role code as the layerName param", () => {
    const result = planStudioBg3dLtLayers({
      elements: [], groups: [],
      render: {
        kind: "separated", width: 100, height: 50, bg3dScene: { sceneId: "s" },
        layers: [{ role: "tone", pngDataUrl: LT_PNG, width: 100, height: 50 }],
      },
      allocations: { bundleId: "b-1", groupId: "g-1", elementIds: {} },
      newElementTemplate: {
        id: "t", type: "image", src: LT_PNG, x: 0, y: 0, width: 100, height: 50,
      },
    });
    expect(result).toEqual({
      ok: false,
      code: "missing-allocation.layerId",
      params: { layerName: "tone" },
    });
  });
});

describe("R11 bg3dLt — display-side resolution keeps ko copy identical", () => {
  it("resolves all 46 subcodes to the exact pre-migration Korean strings", () => {
    const cases: readonly [StudioBg3dLtLayerPlanFailure, string][] = [
      [{ ok: false, code: "invalid-render-mode.renderResultFormat" }, "3D LT 렌더 결과 형식이 올바르지 않아요."],
      [{ ok: false, code: "invalid-render-mode.mixedModes" }, "분리 렌더와 통합 렌더 값이 섞여 있어요."],
      [{ ok: false, code: "invalid-render-mode.unknownLayerRole" }, "알 수 없는 3D LT 레이어 역할이 포함되어 있어요."],
      [{ ok: false, code: "invalid-render-mode.unsupportedFormat" }, "지원하지 않는 3D LT 렌더 형식이에요."],
      [{ ok: false, code: "invalid-render-dimensions.outOfRange" }, "3D LT 렌더 크기가 허용 범위를 벗어났어요."],
      [{ ok: false, code: "missing-scene.missingScene" }, "다시 편집할 3D 장면 정보가 없어요."],
      [{ ok: false, code: "missing-render-layer.missingLayer" }, "삽입할 3D LT 레이어가 없어요."],
      [{ ok: false, code: "duplicate-render-role.duplicateRole" }, "같은 역할의 3D LT 레이어가 중복되었어요."],
      [{ ok: false, code: "mismatched-layer-dimensions.layerSizeMismatch" }, "분리된 3D LT 레이어의 렌더 크기가 서로 달라요."],
      [{ ok: false, code: "invalid-png-data-url.layerPng" }, "3D LT 레이어 PNG 데이터가 올바르지 않아요."],
      [{ ok: false, code: "invalid-png-data-url.combinedPng" }, "통합 3D PNG 데이터가 올바르지 않아요."],
      [{ ok: false, code: "invalid-png-data-url.existingPngOrFragment" }, "기존 3D PNG 데이터나 장면 프래그먼트가 올바르지 않아요."],
      [{ ok: false, code: "page-locked.pageLocked" }, "검토 잠금된 페이지에는 3D LT 레이어를 적용할 수 없어요."],
      [{ ok: false, code: "duplicate-element-id.duplicateElementId" }, "페이지에 중복된 요소 ID가 있어 안전하게 적용할 수 없어요."],
      [{ ok: false, code: "duplicate-group-id.duplicateGroupId" }, "페이지에 중복된 그룹 ID가 있어 안전하게 적용할 수 없어요."],
      [{ ok: false, code: "target-not-found.targetNotFound" }, "다시 적용할 3D LT 레이어를 찾지 못했어요."],
      [{ ok: false, code: "target-not-image.targetNotImage" }, "선택한 요소는 3D LT 이미지 레이어가 아니에요."],
      [{ ok: false, code: "target-locked.layerLocked" }, "잠긴 3D LT 레이어는 변경할 수 없어요."],
      [{ ok: false, code: "target-locked.bundleLayerLocked" }, "잠긴 3D LT 번들 레이어는 변경할 수 없어요."],
      [{ ok: false, code: "target-locked.groupPngLocked" }, "잠긴 그룹의 기존 3D PNG는 변경할 수 없어요."],
      [{ ok: false, code: "invalid-bundle-metadata.incomplete" }, "기존 3D LT 번들 메타데이터가 불완전해요."],
      [{ ok: false, code: "invalid-bundle-metadata.mismatch" }, "기존 3D LT 번들 메타데이터가 일치하지 않아요."],
      [{ ok: false, code: "invalid-bundle-element.nonImageElement" }, "3D LT 번들에 이미지가 아닌 요소가 섞여 있어요."],
      [{ ok: false, code: "noncontiguous-bundle.noncontiguous" }, "3D LT 번들 레이어 사이에 다른 레이어가 끼어 있어요."],
      [{ ok: false, code: "inconsistent-bundle-geometry.placement" }, "기존 3D LT 번들의 배치 값이 올바르지 않아요."],
      [{ ok: false, code: "inconsistent-bundle-geometry.positionOrSize" }, "기존 3D LT 번들 레이어의 위치나 크기가 서로 달라요."],
      [{ ok: false, code: "inconsistent-bundle-geometry.existingPngPlacement" }, "기존 3D PNG의 배치 값이 올바르지 않아요."],
      [{ ok: false, code: "inconsistent-bundle-group.missingDedicatedGroup" }, "기존 3D LT 번들에 전용 그룹이 없어요."],
      [{ ok: false, code: "inconsistent-bundle-group.groupMismatch" }, "기존 3D LT 번들 레이어의 그룹이 서로 달라요."],
      [{ ok: false, code: "duplicate-bundle-role.duplicateRole" }, "기존 3D LT 번들에 같은 역할의 레이어가 중복되었어요."],
      [{ ok: false, code: "missing-bundle-group.groupNotFound" }, "기존 3D LT 번들의 전용 그룹을 찾지 못했어요."],
      [{ ok: false, code: "bundle-group-locked.groupLocked" }, "잠긴 3D LT 그룹은 변경할 수 없어요."],
      [{ ok: false, code: "mixed-bundle-group.mixedGroup" }, "3D LT 전용 그룹에 관련 없는 레이어가 섞여 있어요."],
      [{ ok: false, code: "missing-allocation.bundleAndGroupIds" }, "새 3D LT 번들과 그룹 ID가 필요해요."],
      [{ ok: false, code: "missing-allocation.identifiersUndecided" }, "3D LT 번들 식별자를 결정하지 못했어요."],
      [{ ok: false, code: "bundle-id-collision.bundleIdCollision" }, "새 3D LT 번들 ID가 기존 번들과 겹쳐요."],
      [{ ok: false, code: "group-id-collision.groupIdCollision" }, "새 3D LT 그룹 ID가 기존 그룹과 겹쳐요."],
      [{ ok: false, code: "allocation-collision.existingElement" }, "새 3D LT 레이어 ID가 기존 요소와 겹쳐요."],
      [{ ok: false, code: "allocation-collision.mutual" }, "새 3D LT 레이어 ID가 서로 겹쳐요."],
      [{ ok: false, code: "missing-element-template.missingTemplate" }, "새 3D LT 레이어를 만들 이미지 템플릿이 필요해요."],
      [{ ok: false, code: "invalid-element-template.template" }, "새 3D LT 이미지 템플릿이 올바르지 않아요."],
      [{ ok: false, code: "invalid-element-template.templatePlacement" }, "새 3D LT 이미지 템플릿의 배치 값이 올바르지 않아요."],
      [{ ok: false, code: "invalid-element-template.commonPlacementUndecided" }, "3D LT 레이어의 공통 배치 값을 결정하지 못했어요."],
      [{ ok: false, code: "template-source-mismatch.sourceMismatch" }, "이미지 템플릿이 현재 3D LT 렌더와 일치하지 않아요."],
      [{ ok: false, code: "template-aspect-mismatch.aspectMismatch" }, "이미지 템플릿과 3D LT 렌더의 화면 비율이 달라요."],
    ];
    expect(cases).toHaveLength(45);
    for (const [error, expected] of cases) {
      expect(resolveStudioBg3dLtLayerPlanError(error)).toBe(expected);
    }
  });

  it("resolves the layerId message through the coded layer-name map for every role", () => {
    for (const role of ["color", "tone", "texture-line", "main-line"] as const) {
      expect(resolveStudioBg3dLtLayerName(role)).toBe(STUDIO_BG3D_LT_LAYER_NAMES[role]);
      expect(resolveStudioBg3dLtLayerPlanError({
        ok: false, code: "missing-allocation.layerId", params: { layerName: role },
      })).toBe(`${STUDIO_BG3D_LT_LAYER_NAMES[role]} 레이어 ID가 필요해요.`);
    }
    expect(resolveStudioBg3dLtLayerName("unknown-role")).toBe("unknown-role");
  });

  it("producer source no longer carries the lt error literals", () => {
    const producer = readFileSync(new URL("../bg3d/studio-bg3d-lt-layer-plan.ts", import.meta.url), "utf-8");
    for (const literal of [
      "검토 잠금된 페이지에는 3D LT 레이어를 적용할 수 없어요.",
      "3D LT 렌더 결과 형식이 올바르지 않아요.",
      "레이어 ID가 필요해요.",
      "이미지 템플릿과 3D LT 렌더의 화면 비율이 달라요.",
    ]) {
      expect(producer).not.toContain(literal);
    }
  });
});
