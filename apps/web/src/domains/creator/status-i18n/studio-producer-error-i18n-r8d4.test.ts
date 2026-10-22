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
  resolveStudioAnimaticError,
  resolveStudioTranslationMemoryExportError,
  resolveStudioTranslationMemoryImportError,
} from "./studio-producer-error-i18n";

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
    const source = readFileSync(new URL("./studio-producer-error-i18n.ts", import.meta.url), "utf-8");
    const blocks: Record<string, string[]> = {};
    for (const match of source.matchAll(/registerI18nLocaleEntries\("(ko|en)", \{([\s\S]*?)\}\);/g)) {
      blocks[match[1] ?? ""] = [...(match[2] ?? "").matchAll(/"(studio\.producerError\.[^"]+)":/g)].map((m) => m[1] ?? "");
    }
    // R9: 등록 블록이 구간별로 늘었다(tm 11 + animatic 25 — 본체 23 + 자막 파서 2). 블록 단위 누적으로 패리티를 본다.
    const accumulated: Record<string, string[]> = { ko: [], en: [] };
    for (const match of source.matchAll(/registerI18nLocaleEntries\("(ko|en)", \{([\s\S]*?)\}\);/g)) {
      accumulated[match[1] ?? ""]!.push(...[...(match[2] ?? "").matchAll(/"(studio\.producerError\.[^"]+)":/g)].map((m) => m[1] ?? ""));
    }
    expect(accumulated.ko).toHaveLength(36);
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
