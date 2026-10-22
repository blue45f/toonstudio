import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * 파일 크기 래칫 동결 패널 상태 문구 i18n 키 이관 계약
 * (A4 잔여 3라운드 — 동결 패널 줄중립 이관).
 *
 * 배경: 래칫 기준선과 동률이라 순증이 불가능한 동결 패널 5파일의
 * 로딩·실패·성공·빈 상태·확인 중·사용 불가 사유 문구가 호출부에 한국어로
 * 하드코딩돼 en 사용자의 동선이 끊겼다. 표시 정본은
 * studio-frozen-status-i18n 등록 모듈의 `studio.frozenStatus.*` 키이며,
 * 코드 안의 한국어 원문은 `frozenStatusText(키, …, 한국어 폴백)`의 폴백
 * 인자로만 남아야 한다. 소비 파일의 줄 수는 이관 전과 같거나 줄어야
 * 하며(래칫 동결), 증가분은 같은 파일의 다중행 호출 접기와 중복 제거로
 * 상쇄한다. 콘텐츠 본문·폼 라벨·placeholder·예시 데이터는 대상이 아니다.
 */

const HANGUL = /[가-힣]/;

function readSource(relativePath: string): string {
  return readFileSync(new URL(`./${relativePath}`, import.meta.url), "utf-8");
}

/** 등록 모듈(registerI18nLocaleEntries)의 locale 블록을 전부 병합해 파싱한다. */
function parseRegisterModule(source: string): Record<"ko" | "en", Record<string, string>> {
  const blocks: Record<string, Record<string, string>> = {};
  const pattern = /registerI18nLocaleEntries\("(ko|en)", \{([\s\S]*?)\}\);/g;
  for (const match of source.matchAll(pattern)) {
    const entries: Record<string, string> = {};
    for (const entry of (match[2] ?? "").matchAll(/"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g)) {
      entries[entry[1] ?? ""] = (entry[2] ?? "").replace(/\\"/g, '"');
    }
    blocks[match[1] ?? ""] = { ...(blocks[match[1] ?? ""] ?? {}), ...entries };
  }
  return blocks as Record<"ko" | "en", Record<string, string>>;
}

const MODULE_FILE = "studio-frozen-status-i18n.ts";
const PREFIX = "studio.frozenStatus.";
const CONSUMERS = [
  "StudioPaletteLibraryPanel.tsx",
  "StudioCommentsPanel.tsx",
  "StudioReferencePanel.tsx",
  "brush/StudioBrushLibraryPanel.tsx",
  "export/StudioExportMenuPanel.tsx",
] as const;
const MIGRATED_FILES = CONSUMERS;

/** 이관 전 줄 수(래칫 기준선) — 소비 파일은 이 줄 수를 넘을 수 없다. */
const BASELINE_LINES: Record<(typeof CONSUMERS)[number], number> = {
  "StudioPaletteLibraryPanel.tsx": 1043,
  "StudioCommentsPanel.tsx": 2075,
  "StudioReferencePanel.tsx": 2352,
  "brush/StudioBrushLibraryPanel.tsx": 1328,
  "export/StudioExportMenuPanel.tsx": 1941,
};

const blocks = parseRegisterModule(readSource(MODULE_FILE));
const ALL_KEYS = Object.keys(blocks.ko).sort();

describe("frozen panel status i18n r3frz", () => {
  it("등록 모듈의 ko/en 키가 패리티를 이루고 en에 한글이 없다", () => {
    expect(Object.keys(blocks.en).sort()).toEqual(ALL_KEYS);
    for (const key of ALL_KEYS) {
      expect(blocks.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
  });

  it("플레이스홀더가 ko/en에서 정확히 일치한다", () => {
    for (const key of ALL_KEYS) {
      const koPh = [...(blocks.ko[key] ?? "").matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort();
      const enPh = [...(blocks.en[key] ?? "").matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort();
      expect(enPh, `placeholder mismatch: ${key}`).toEqual(koPh);
    }
  });

  it("전 키가 소비 파일에서 참조되고 미등록 참조가 없다", () => {
    const consumerSource = CONSUMERS.map((file) => readSource(file)).join("\n");
    for (const key of ALL_KEYS) {
      expect(consumerSource.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const referenced = new Set(
      [...consumerSource.matchAll(new RegExp(`"(${PREFIX.replace(/\./g, "\\.")}[A-Za-z0-9.]+)"`, "g"))].map((m) => m[1] ?? ""),
    );
    for (const key of referenced) {
      expect(ALL_KEYS.includes(key), `dangling key reference: ${key}`).toBe(true);
    }
  });

  it("소비 파일의 폴백 인자가 등록된 ko 원문과 일치한다", () => {
    for (const file of CONSUMERS) {
      const source = readSource(file);
      const callPattern = /frozenStatusText\("(studio\.frozenStatus\.[A-Za-z0-9.]+)",((?:[^()]|\([^()]*\))*)\)/g;
      for (const match of source.matchAll(callPattern)) {
        const key = match[1] ?? "";
        const args = [...(match[2] ?? "").matchAll(/"((?:[^"\\]|\\.)*)"/g)];
        const fallback = (args.at(-1)?.[1] ?? "").replace(/\\"/g, '"');
        expect(fallback, `${file}: fallback mismatch for ${key}`).toBe(blocks.ko[key]);
      }
    }
  });

  it("이관 파일에 탐지기 위반이 없다", () => {
    for (const file of MIGRATED_FILES) {
      const violations = scanHardcodedStatusStrings(readSource(file));
      expect(violations, `${file}: ${JSON.stringify(violations)}`).toEqual([]);
    }
  });

  it("소비 파일 줄 수가 래칫 기준선을 넘지 않는다 (줄중립)", () => {
    for (const file of CONSUMERS) {
      const source = readSource(file);
      const lines = source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
      expect(lines, `${file} lines ${lines} > baseline ${BASELINE_LINES[file]}`).toBeLessThanOrEqual(BASELINE_LINES[file]);
    }
  });
});
