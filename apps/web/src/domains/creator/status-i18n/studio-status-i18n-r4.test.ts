import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * creator 루트 패널 상태 문구 i18n 키 이관 계약 (A4 잔여 4라운드, GUARDED 제외 5파일).
 *
 * 표시 정본은 studio.panelStatus.* 키이며 등록은 형제 모듈
 * studio-panel-status-i18n-r4.ts가 맡는다 (r3c06 모듈을 확장하면
 * studio-status-i18n-r3c06.test.ts의 키 개수 단언이 깨지는 것이 분리 근거다).
 * 대상은 3라운드 c06에서 잔여 6건으로 문서화됐던 바로 그 6건이며,
 * 이 테스트는 5파일의 탐지기 위반이 기본·생산자 채널 양 모드에서
 * 0건임을 고정한다.
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
      entries[entry[1] ?? ""] = (entry[2] ?? "").replace(/\\(.)/g, "$1");
    }
    blocks[match[1] ?? ""] = { ...(blocks[match[1] ?? ""] ?? {}), ...entries };
  }
  return blocks as Record<"ko" | "en", Record<string, string>>;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1] ?? "").sort();
}

const R4_KEYS = [
  "studio.panelStatus.assetRights.blockingError",
  "studio.panelStatus.finishQuality.needsWorkDescription",
  "studio.panelStatus.finishQuality.severityError",
  "studio.panelStatus.localAssets.libraryGuide",
  "studio.panelStatus.localizationQa.criticalErrorFailReason",
  "studio.panelStatus.productionInsights.severityError",
] as const;

const EXPECTED_KO: Readonly<Record<string, string>> = {
  "studio.panelStatus.assetRights.blockingError": "차단 오류",
  "studio.panelStatus.finishQuality.needsWorkDescription": "오류 위치로 이동해 원고와 검토 상태를 정리하세요.",
  "studio.panelStatus.finishQuality.severityError": "오류",
  "studio.panelStatus.localAssets.libraryGuide": "현재 기기의 이미지 보관함입니다. 삭제에 실패한 원본은 목록에 유지합니다. 3D 렌더 이미지는 평면 이미지이며 3D 모델 원본과 별개입니다.",
  "studio.panelStatus.localizationQa.criticalErrorFailReason": "치명 오류가 있으면 점수와 무관하게 미달입니다.",
  "studio.panelStatus.productionInsights.severityError": "오류",
};

const CONSUMERS = [
  "StudioAssetRightsManifestPanel.tsx",
  "StudioFinishQualityView.tsx",
  "StudioLocalAssetManager.tsx",
  "StudioLocalizationQaReport.tsx",
  "StudioProductionInsightsPanel.tsx",
] as const;

describe("studio panel status i18n r4 (GUARDED 제외 5파일)", () => {
  it("신규 모듈의 ko/en 키가 패리티를 이루고 신규 키 ko 원문·플레이스홀더가 정확하다", () => {
    const blocks = parseRegisterModule(readSource("studio-panel-status-i18n-r4.ts"));
    expect(Object.keys(blocks.ko).sort()).toEqual(Object.keys(blocks.en).sort());
    expect(Object.keys(blocks.ko).length).toBe(R4_KEYS.length);
    for (const key of R4_KEYS) {
      expect(blocks.ko[key], `ko missing ${key}`).toBe(EXPECTED_KO[key]);
      expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
      expect(placeholders(blocks.en[key] ?? ""), `placeholder mismatch ${key}`).toEqual(
        placeholders(blocks.ko[key] ?? ""),
      );
    }
  });

  it("신규 키가 소비 파일에서 실제로 참조되고 미등록 참조가 없다", () => {
    const consumerSource = CONSUMERS.map((file) => readSource(file)).join("\n");
    const blocks = parseRegisterModule(readSource("studio-panel-status-i18n-r4.ts"));
    const registered = new Set(Object.keys(blocks.ko));
    for (const key of R4_KEYS) {
      expect(consumerSource.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const referenced = new Set(
      [...consumerSource.matchAll(/panelStatusTextR4\("([^"]+)"/g)].map((match) => match[1] ?? ""),
    );
    expect([...referenced].sort()).toEqual([...R4_KEYS].sort());
    for (const key of referenced) {
      expect(registered.has(key), `dangling key reference: ${key}`).toBe(true);
    }
  });

  it("5파일의 탐지기 위반이 기본·생산자 채널 양 모드에서 0건이다", () => {
    for (const file of CONSUMERS) {
      const source = readSource(file);
      expect(scanHardcodedStatusStrings(source), `${file} default`).toEqual([]);
      expect(
        scanHardcodedStatusStrings(source, { includeProducerChannels: true }),
        `${file} producer`,
      ).toEqual([]);
    }
  });
});
