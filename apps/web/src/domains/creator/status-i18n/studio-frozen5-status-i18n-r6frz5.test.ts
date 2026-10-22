import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";
/**
 * 파일 크기 래칫 동결 패널 상태 문구 i18n 키 이관 계약 5
 * (A4 cat4 동결 tsx 꼬리 이관 — frozen5).
 *
 * 배경: 래칫 기준선과 동률이라 순증이 불가능한 동결 패널 34파일의
 * 로딩·실패·성공·빈 상태·확인 중·사용 불가 사유·aria-live 공지 문구가
 * 호출부에 한국어로 하드코딩돼 en 사용자의 동선이 끊겼다. 표시 정본은
 * studio-frozen5-status-i18n 등록 모듈의 `studio.frozenStatus5.*` 키이며,
 * 코드 안의 한국어 원문은 `frozenStatus5Text(키, …, 한국어 폴백)`의 폴백
 * 인자로만 남아야 한다. 3~6라운드 모듈(studio-frozen-status-i18n.ts,
 * studio-frozen2-status-i18n.ts, studio-frozen3-status-i18n.ts,
 * studio-frozen4-status-i18n.ts)은 각 테스트가 전 키의 소비 파일을 단언해
 * 확장할 수 없어 형제 모듈로 분리했다. 소비 파일의 줄 수는 이관 전과
 * 같거나 줄어야 하며(래칫 동결), 증가분은 같은 파일의 다중행 호출 접기와
 * 중복 문구 키 통합으로 상쇄한다. 콘텐츠 본문·폼 라벨·placeholder·예시
 * 데이터는 대상이 아니다. 잔여 탐지기 위반은 파일별로 고정한다
 * (StudioBrushStudio·StudioCuttoonEditorChrome의 닫기 aria-label 각 1건은
 * 라벨 채널이라 잔여로 문서화됨).
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

/**
 * frozenStatus5Text 호출을 균형 괄호 스캔으로 전부 추출한다. 파라미터 객체
 * 안에 중첩된 frozenStatus5Text 호출(예: 손 적용 상태의 측면 값 합성)도
 * 각각 잡는다. 반환값은 [키, 폴백] 쌍이며, 폴백은 최상위 인자 중 마지막
 * 문자열 리터럴이다.
 */
function extractFrozenCalls(source: string): Array<[string, string]> {
  const results: Array<[string, string]> = [];
  const needle = "frozenStatus5Text(";
  let idx = 0;
  for (;;) {
    const at = source.indexOf(needle, idx);
    if (at < 0) break;
    idx = at + needle.length;
    let pos = idx;
    let paren = 1;
    let brace = 0;
    let bracket = 0;
    let state: string | null = null;
    let escaped = false;
    let current = "";
    const parts: string[] = [];
    while (pos < source.length) {
      const c = source[pos] ?? "";
      if (state !== null) {
        current += c;
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === state) state = null;
        pos += 1;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        state = c;
        current += c;
        pos += 1;
        continue;
      }
      if (c === "(") paren += 1;
      else if (c === ")") {
        paren -= 1;
        if (paren === 0) {
          parts.push(current);
          current = "";
          pos += 1;
          break;
        }
      } else if (c === "{") brace += 1;
      else if (c === "}") brace -= 1;
      else if (c === "[") bracket += 1;
      else if (c === "]") bracket -= 1;
      else if (c === "," && paren === 1 && brace === 0 && bracket === 0) {
        parts.push(current);
        current = "";
        pos += 1;
        continue;
      }
      current += c;
      pos += 1;
    }
    const unquote = (raw: string): string | null => {
      const match = /^"((?:[^"\\]|\\.)*)"$/s.exec(raw.trim());
      return match ? (match[1] ?? "").replace(/\\"/g, '"') : null;
    };
    const key = parts.length > 0 ? unquote(parts[0] ?? "") : null;
    const fallback = parts.length > 0 ? unquote(parts[parts.length - 1] ?? "") : null;
    if (key !== null && fallback !== null) results.push([key, fallback]);
  }
  return results;
}

const MODULE_FILE = "studio-frozen5-status-i18n.ts";
const PREFIX = "studio.frozenStatus5.";
const CONSUMERS = [
  "../StudioCharacterBiblePanel.tsx",
  "../StudioPromisePayoffLedgerPanel.tsx",
  "../StudioWriterRoomPanel.tsx",
  "../brush/StudioBrushStudio.tsx",
  "../StudioLazyPanelStack.tsx",
  "../vrm/StudioVrmPoserViewport.tsx",
  "../bg3d/StudioBg3dEditorViewport.tsx",
  "../production-hub/ProductionRoleWorkspace.tsx",
  "../lift3d/StudioLift3dPage.tsx",
  "../ai/StudioToonAutomationWorkspace.tsx",
  "../vrm/StudioVrmAvatarForgePanel.tsx",
  "../vrm/StudioVrmPhotoPoseScanner.tsx",
  "../layer/StudioLayerLiftDialog.tsx",
  "../live/StudioLiveCanvasOverlay.tsx",
  "../StudioProjectCenterSearch.tsx",
  "../brush/StudioBrushLibrarySheet.tsx",
  "../StudioCompanionAssistantDisplay.tsx",
  "../StudioCompanionReferenceDisplay.tsx",
  "../StudioAnimTimelinePanel.tsx",
  "../StudioQuickAccessPalette.tsx",
  "../StudioGuidedHelpDialog.tsx",
  "../StudioContextHelpDialog.tsx",
  "../studio-cuttoon-editor/StudioCuttoonEditorChrome.tsx",
  "../comic/StudioQuickComicWizard.tsx",
  "../ai/StudioAiSuperSuiteModal.tsx",
  "../vrm/StudioVrmPropPanel.tsx",
  "../brush/StudioDrawOptionsBar.tsx",
  "../assistant/StudioWebtoonAssistantContent.tsx",
  "../studio-production/StudioProductionOperationsPanel.tsx",
  "../hybrid-dcc/StudioHybridDccModifierInspector.tsx",
  "../studio-chrome-ui.tsx",
  "../StudioStoryboardGridPanel.tsx",
  "../StudioPageListPaneBase.tsx",
  "../bg3d/StudioBg3dSceneAssistantWorkspace.tsx",
] as const;

/** 이관 전 줄 수(래칫 기준선) — 소비 파일은 이 줄 수를 넘을 수 없다. */
const BASELINE_LINES: Record<(typeof CONSUMERS)[number], number> = {
  "../StudioCharacterBiblePanel.tsx": 1076,
  "../StudioPromisePayoffLedgerPanel.tsx": 969,
  "../StudioWriterRoomPanel.tsx": 1789,
  "../brush/StudioBrushStudio.tsx": 1686,
  "../StudioLazyPanelStack.tsx": 1194,
  "../vrm/StudioVrmPoserViewport.tsx": 853,
  "../bg3d/StudioBg3dEditorViewport.tsx": 1210,
  "../production-hub/ProductionRoleWorkspace.tsx": 1213,
  "../lift3d/StudioLift3dPage.tsx": 815,
  "../ai/StudioToonAutomationWorkspace.tsx": 1307,
  "../vrm/StudioVrmAvatarForgePanel.tsx": 1259,
  "../vrm/StudioVrmPhotoPoseScanner.tsx": 885,
  "../layer/StudioLayerLiftDialog.tsx": 996,
  "../live/StudioLiveCanvasOverlay.tsx": 1579,
  "../StudioProjectCenterSearch.tsx": 1095,
  "../brush/StudioBrushLibrarySheet.tsx": 1963,
  "../StudioCompanionAssistantDisplay.tsx": 1418,
  "../StudioCompanionReferenceDisplay.tsx": 1415,
  "../StudioAnimTimelinePanel.tsx": 885,
  "../StudioQuickAccessPalette.tsx": 856,
  "../StudioGuidedHelpDialog.tsx": 826,
  "../StudioContextHelpDialog.tsx": 888,
  "../studio-cuttoon-editor/StudioCuttoonEditorChrome.tsx": 1020,
  "../comic/StudioQuickComicWizard.tsx": 909,
  "../ai/StudioAiSuperSuiteModal.tsx": 986,
  "../vrm/StudioVrmPropPanel.tsx": 1464,
  "../brush/StudioDrawOptionsBar.tsx": 1393,
  "../assistant/StudioWebtoonAssistantContent.tsx": 1354,
  "../studio-production/StudioProductionOperationsPanel.tsx": 840,
  "../hybrid-dcc/StudioHybridDccModifierInspector.tsx": 992,
  "../studio-chrome-ui.tsx": 1177,
  "../StudioStoryboardGridPanel.tsx": 804,
  "../StudioPageListPaneBase.tsx": 1266,
  "../bg3d/StudioBg3dSceneAssistantWorkspace.tsx": 1019,
};

/** 이관 뒤 탐지기 위반 수(실측 고정) — 17파일 전부 상태 채널 위반 0. */
const EXPECTED_VIOLATIONS: Record<(typeof CONSUMERS)[number], number> = {
  "../StudioCharacterBiblePanel.tsx": 0,
  "../StudioPromisePayoffLedgerPanel.tsx": 0,
  "../StudioWriterRoomPanel.tsx": 0,
  "../brush/StudioBrushStudio.tsx": 1,
  "../StudioLazyPanelStack.tsx": 0,
  "../vrm/StudioVrmPoserViewport.tsx": 0,
  "../bg3d/StudioBg3dEditorViewport.tsx": 0,
  "../production-hub/ProductionRoleWorkspace.tsx": 0,
  "../lift3d/StudioLift3dPage.tsx": 0,
  "../ai/StudioToonAutomationWorkspace.tsx": 0,
  "../vrm/StudioVrmAvatarForgePanel.tsx": 0,
  "../vrm/StudioVrmPhotoPoseScanner.tsx": 0,
  "../layer/StudioLayerLiftDialog.tsx": 0,
  "../live/StudioLiveCanvasOverlay.tsx": 0,
  "../StudioProjectCenterSearch.tsx": 0,
  "../brush/StudioBrushLibrarySheet.tsx": 0,
  "../StudioCompanionAssistantDisplay.tsx": 0,
  "../StudioCompanionReferenceDisplay.tsx": 0,
  "../StudioAnimTimelinePanel.tsx": 0,
  "../StudioQuickAccessPalette.tsx": 0,
  "../StudioGuidedHelpDialog.tsx": 0,
  "../StudioContextHelpDialog.tsx": 0,
  "../studio-cuttoon-editor/StudioCuttoonEditorChrome.tsx": 1,
  "../comic/StudioQuickComicWizard.tsx": 0,
  "../ai/StudioAiSuperSuiteModal.tsx": 0,
  "../vrm/StudioVrmPropPanel.tsx": 0,
  "../brush/StudioDrawOptionsBar.tsx": 0,
  "../assistant/StudioWebtoonAssistantContent.tsx": 0,
  "../studio-production/StudioProductionOperationsPanel.tsx": 0,
  "../hybrid-dcc/StudioHybridDccModifierInspector.tsx": 0,
  "../studio-chrome-ui.tsx": 0,
  "../StudioStoryboardGridPanel.tsx": 0,
  "../StudioPageListPaneBase.tsx": 0,
  "../bg3d/StudioBg3dSceneAssistantWorkspace.tsx": 0,
};

const blocks = parseRegisterModule(readSource(MODULE_FILE));
const ALL_KEYS = Object.keys(blocks.ko).sort();

describe("frozen panel status i18n r6frz5", () => {
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
      for (const [key, fallback] of extractFrozenCalls(readSource(file))) {
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
