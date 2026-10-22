import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  importStudioTranslationMemory,
  loadStudioTranslationMemory,
  STUDIO_TRANSLATION_MEMORY_KIND,
  STUDIO_TRANSLATION_MEMORY_MAX_IMPORT_BYTES,
  STUDIO_TRANSLATION_MEMORY_MAX_IMPORT_CANDIDATES,
  STUDIO_TRANSLATION_MEMORY_VERSION,
} from "../studio-translation-memory";
import { resolveStudioTranslationMemoryImportError } from "./studio-producer-error-i18n";

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
    expect(blocks.ko?.length).toBe(5);
    expect(blocks.en).toEqual(blocks.ko);
  });
});
