import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { vrmGenerateStatusText } from "./studio-vrm-generate-status-i18n";

/**
 * 조형 패널 "새 VRM 캐릭터" 구역 상태 문구 키 계약.
 *
 * 표시 정본은 studio-vrm-generate-status-i18n 의 `studio.vrmGenerateStatus.*` 키다. 코드 안의 한국어
 * 원문은 `vrmGenerateStatusText(키, …, 한국어 폴백)` 의 폴백 인자로만 남고, ko 등록값과 글자 단위로 같아야
 * 한다. 두 로케일의 키 집합은 같아야 하고, 소비 파일이 쓰는 키는 모두 등록돼 있어야 한다.
 */

const CONSUMERS = [
  "../vrm/StudioVrmAvatarForgeGenerateSection.tsx",
  "../vrm/StudioVrmGenerateExportInfoForm.tsx",
  "../vrm/StudioVrmGenerateExpressionEditor.tsx",
  "../vrm/StudioVrmGenerateHairSwayControls.tsx",
] as const;

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf-8");
}

function parseRegisterModule(source: string): Record<"ko" | "en", Record<string, string>> {
  const blocks: Record<string, Record<string, string>> = {};
  for (const match of source.matchAll(/registerI18nLocaleEntries\("(ko|en)", \{([\s\S]*?)\}\);/gu)) {
    const entries: Record<string, string> = {};
    for (const entry of (match[2] ?? "").matchAll(/"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/gu)) {
      entries[entry[1] ?? ""] = (entry[2] ?? "").replace(/\\"/gu, '"');
    }
    blocks[match[1] ?? ""] = { ...(blocks[match[1] ?? ""] ?? {}), ...entries };
  }
  return { ko: blocks.ko ?? {}, en: blocks.en ?? {} };
}

/** 소비 파일의 `vrmGenerateStatusText("키", [{…},] "폴백")` 호출. */
function consumerCalls(source: string): { readonly key: string; readonly fallback: string }[] {
  return [...source.matchAll(
    /vrmGenerateStatusText\(\s*"([^"]+)",\s*(?:\{[^}]*\},\s*)?"((?:[^"\\]|\\.)*)",?\s*\)/gu,
  )].map((match) => ({ key: match[1] ?? "", fallback: match[2] ?? "" }));
}

const registered = parseRegisterModule(readSource("./studio-vrm-generate-status-i18n.ts"));

function setLang(lang: string): void {
  useI18n.setState({ lang });
}

describe("studio-vrm-generate-status-i18n", () => {
  it("registers the same keys for ko and en", () => {
    expect(Object.keys(registered.ko).length).toBeGreaterThan(0);
    expect(Object.keys(registered.en).sort()).toEqual(Object.keys(registered.ko).sort());
  });

  it("keeps every consumer key registered with the Korean fallback as its ko value", () => {
    const used = new Set<string>();
    for (const file of CONSUMERS) {
      const calls = consumerCalls(readSource(file));
      expect(calls.length, file).toBeGreaterThan(0);
      for (const { key, fallback } of calls) {
        used.add(key);
        expect(registered.ko[key], `${file} ${key}`).toBe(fallback);
      }
    }
    // 등록만 하고 아무도 쓰지 않는 키가 남지 않게 한다.
    expect([...used].sort()).toEqual(Object.keys(registered.ko).sort());
  });

  it("resolves the current locale and fills placeholders", () => {
    setLang("en");
    try {
      expect(vrmGenerateStatusText(
        "studio.vrmGenerateStatus.customExpressionLimit",
        { max: 12 },
        "커스텀 표정은 {max}개까지 둘 수 있어요.",
      )).toBe("You can keep up to 12 custom expressions.");
    } finally {
      setLang("ko");
    }
    expect(vrmGenerateStatusText(
      "studio.vrmGenerateStatus.customExpressionLimit",
      { max: 12 },
      "커스텀 표정은 {max}개까지 둘 수 있어요.",
    )).toBe("커스텀 표정은 12개까지 둘 수 있어요.");
  });
});
