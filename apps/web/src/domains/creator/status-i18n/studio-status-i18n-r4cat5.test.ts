import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * cat5 재판정 이관 계약 (A4 4라운드).
 *
 * 배치 1·3에서 "본문·라벨"로 문서화돼 남았던 잔여를 재판정해 상태 문구로
 * 확정된 건만 후속 형제 모듈(studio-panel-status-i18n-r4cat5.ts,
 * studio-bg3d-panel-status-i18n-r4cat5.ts)로 이관했다. 기존 배치 모듈은
 * 키 개수 단언이 있어 확장하지 않는다. 이 테스트는 두 형제 모듈의
 * 패리티·소비·폴백 일치를 고정한다.
 */

const HANGUL = /[가-힣]/;

function readSource(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf-8");
}

function parseRegisterModule(source: string): Record<"ko" | "en", Record<string, string>> {
  const blocks: Record<string, Record<string, string>> = {};
  const pattern = /registerI18nLocaleEntries\("(ko|en)", \{([\s\S]*?)\}\);/g;
  for (const match of source.matchAll(pattern)) {
    const entries: Record<string, string> = {};
    for (const entry of (match[2] ?? "").matchAll(/"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g)) {
      entries[entry[1] ?? ""] = (entry[2] ?? "").replace(/\\"/g, '"');
    }
    blocks[match[1] ?? ""] = entries;
  }
  return blocks as Record<"ko" | "en", Record<string, string>>;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1] ?? "").sort();
}

const MODULES = [
  {
    file: "status-i18n/studio-panel-status-i18n-r4cat5.ts",
    consumers: ["StudioCommunityMarketplaceLifecycle.tsx", "StudioSelectionWorkbenchPanel.tsx"],
  },
  {
    file: "status-i18n/studio-bg3d-panel-status-i18n-r4cat5.ts",
    consumers: ["bg3d/StudioReferenceRebuildPresets.tsx"],
  },
] as const;

describe("cat5 재판정 이관 r4cat5", () => {
  for (const mod of MODULES) {
    const blocks = parseRegisterModule(readSource(mod.file));
    const allKeys = Object.keys(blocks.ko).sort();

    it(`${mod.file}: ko/en 패리티, en 한글 0, 플레이스홀더 일치`, () => {
      expect(allKeys.length).toBeGreaterThan(0);
      expect(Object.keys(blocks.en).sort()).toEqual(allKeys);
      for (const key of allKeys) {
        expect(blocks.ko[key], `ko missing ${key}`).toBeTruthy();
        expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
        expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
        expect(placeholders(blocks.en[key] ?? "")).toEqual(placeholders(blocks.ko[key] ?? ""));
      }
    });

    it(`${mod.file}: 전 키가 소비 파일에서 폴백 원문과 함께 참조된다`, () => {
      const consumerSource = mod.consumers.map((file) => readSource(file)).join("\n");
      for (const key of allKeys) {
        expect(consumerSource, `key not consumed: ${key}`).toContain(`"${key}"`);
        expect(consumerSource, `fallback mismatch: ${key}`).toContain(
          `"${key}", "${blocks.ko[key]}"`,
        );
      }
    });
  }

  it("소비 파일 3개에 탐지기 위반이 없다", () => {
    for (const file of [
      "StudioCommunityMarketplaceLifecycle.tsx",
      "StudioSelectionWorkbenchPanel.tsx",
      "bg3d/StudioReferenceRebuildPresets.tsx",
    ]) {
      expect(scanHardcodedStatusStrings(readSource(file)), file).toEqual([]);
    }
  });
});
