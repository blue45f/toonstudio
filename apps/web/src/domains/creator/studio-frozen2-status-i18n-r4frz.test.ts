import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * 파일 크기 래칫 동결 패널 상태 문구 i18n 키 이관 계약 2
 * (A4 잔여 4라운드 — 동결 tsx 줄중립 이관).
 *
 * 배경: 래칫 기준선과 동률이라 순증이 불가능한 동결 패널 12파일의
 * 로딩·실패·성공·빈 상태·확인 중·사용 불가 사유 문구가 호출부에 한국어로
 * 하드코딩돼 en 사용자의 동선이 끊겼다. 표시 정본은
 * studio-frozen2-status-i18n 등록 모듈의 `studio.frozenStatus2.*` 키이며,
 * 코드 안의 한국어 원문은 `frozenStatus2Text(키, …, 한국어 폴백)`의 폴백
 * 인자로만 남아야 한다. 3라운드 모듈(studio-frozen-status-i18n.ts)은 그쪽
 * 테스트가 전 키의 소비 파일을 5개로 단언해 확장할 수 없어 형제 모듈로
 * 분리했다. 소비 파일의 줄 수는 이관 전과 같거나 줄어야 하며(래칫 동결),
 * 증가분은 같은 파일의 다중행 호출 접기와 중복 문구 키 통합으로 상쇄한다.
 * 콘텐츠 본문·폼 라벨·placeholder·예시 데이터는 대상이 아니다. 잔여 탐지기
 * 위반은 라벨·본문·생산자 진단 부류로만 남아야 하며 파일별로 고정한다.
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

const MODULE_FILE = "studio-frozen2-status-i18n.ts";
const PREFIX = "studio.frozenStatus2.";
const CONSUMERS = [
  "StudioWorkspaceInterchangeDialog.tsx",
  "StudioDialogueBatchPanel.tsx",
  "scene-3d/StudioMannequinPoserPanel.tsx",
  "StudioPublishPackagePanel.tsx",
  "StudioPublishingCommandCenter.tsx",
  "StudioTeamPanel.tsx",
  "StudioPublicationOperationsPanel.tsx",
  "storyworld/StudioStoryworldLabPage.tsx",
  "live/StudioLiveCollaborationPanel.tsx",
  "StudioCommunityMarketplacePanel.tsx",
  "StudioUploadPublish.tsx",
  "hybrid-dcc/StudioHybridDccViewportCore.tsx",
] as const;

/** 이관 전 줄 수(래칫 기준선) — 소비 파일은 이 줄 수를 넘을 수 없다. */
const BASELINE_LINES: Record<(typeof CONSUMERS)[number], number> = {
  "StudioWorkspaceInterchangeDialog.tsx": 1240,
  "StudioDialogueBatchPanel.tsx": 1737,
  "scene-3d/StudioMannequinPoserPanel.tsx": 2226,
  "StudioPublishPackagePanel.tsx": 1120,
  "StudioPublishingCommandCenter.tsx": 2104,
  "StudioTeamPanel.tsx": 1785,
  "StudioPublicationOperationsPanel.tsx": 968,
  "storyworld/StudioStoryworldLabPage.tsx": 863,
  "live/StudioLiveCollaborationPanel.tsx": 1290,
  "StudioCommunityMarketplacePanel.tsx": 2602,
  "StudioUploadPublish.tsx": 1070,
  "hybrid-dcc/StudioHybridDccViewportCore.tsx": 1969,
};

/**
 * 이관 뒤에도 남는 탐지기 위반 수(실측 고정). 전부 상태 채널이 아닌 부류다:
 * PublishPackage는 표시 prop 라벨 3건, PublicationOperations는 IANA 설명
 * 본문 1건, Hybrid는 생산자 진단 message 필드 3건(throw 채널과 함께 별도
 * 설계 대상). 나머지 파일은 0이어야 한다.
 */
const EXPECTED_VIOLATIONS: Record<(typeof CONSUMERS)[number], number> = {
  "StudioWorkspaceInterchangeDialog.tsx": 0,
  "StudioDialogueBatchPanel.tsx": 0,
  "scene-3d/StudioMannequinPoserPanel.tsx": 0,
  "StudioPublishPackagePanel.tsx": 3,
  "StudioPublishingCommandCenter.tsx": 0,
  "StudioTeamPanel.tsx": 0,
  "StudioPublicationOperationsPanel.tsx": 1,
  "storyworld/StudioStoryworldLabPage.tsx": 0,
  "live/StudioLiveCollaborationPanel.tsx": 0,
  "StudioCommunityMarketplacePanel.tsx": 0,
  "StudioUploadPublish.tsx": 0,
  "hybrid-dcc/StudioHybridDccViewportCore.tsx": 3,
};

const blocks = parseRegisterModule(readSource(MODULE_FILE));
const ALL_KEYS = Object.keys(blocks.ko).sort();

describe("frozen panel status i18n r4frz", () => {
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
      const callPattern = /frozenStatus2Text\("(studio\.frozenStatus2\.[A-Za-z0-9.]+)",((?:[^()]|\([^()]*\))*)\)/g;
      for (const match of source.matchAll(callPattern)) {
        const key = match[1] ?? "";
        const args = [...(match[2] ?? "").matchAll(/"((?:[^"\\]|\\.)*)"/g)];
        const fallback = (args.at(-1)?.[1] ?? "").replace(/\\"/g, '"');
        expect(fallback, `${file}: fallback mismatch for ${key}`).toBe(blocks.ko[key]);
      }
    }
  });

  it("이관 파일의 탐지기 위반이 파일별 고정값을 넘지 않는다", () => {
    for (const file of CONSUMERS) {
      const violations = scanHardcodedStatusStrings(readSource(file));
      expect(violations.length, `${file}: ${JSON.stringify(violations)}`).toBe(EXPECTED_VIOLATIONS[file]);
    }
  });

  it("소비 파일 줄 수가 래칫 기준선을 넘지 않는다 (줄중립)", () => {
    for (const file of CONSUMERS) {
      const source = readSource(file);
      const lines = source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
      expect(lines, `${file} lines ${lines} > baseline ${BASELINE_LINES[file]}`).toBeLessThanOrEqual(BASELINE_LINES[file]);
    }
  });

  it("등록 모듈이 800줄 상한을 넘지 않는다", () => {
    const source = readSource(MODULE_FILE);
    const lines = source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
    expect(lines, `module lines ${lines} > 800`).toBeLessThanOrEqual(800);
  });
});
