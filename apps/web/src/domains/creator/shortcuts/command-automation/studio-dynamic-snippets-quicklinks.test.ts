import { describe, expect, it } from "vitest";

import {
  buildCommandSecondaryActions,
  buildStudioQuicklinkUri,
  expandDynamicTemplate,
  exportAutomationPackJson,
  importAutomationPackJson,
  matchAndExpandSnippetTrigger,
  parseStudioQuicklinkUri,
  planCommandMacroExecution,
  type StudioDynamicSnippet,
} from "./studio-dynamic-snippets-quicklinks";

describe("studio-dynamic-snippets-quicklinks", () => {
  it("동적 플레이스홀더({episode}, {clipboard | trim | uppercase}, {date}, {cursor})를 정확히 치환한다", () => {
    const result = expandDynamicTemplate(
      "{episode}_{cut}_{date:YYYY-MM-DD} [{clipboard | trim | uppercase}] {cursor}끝",
      {
        episode: "EP12",
        cut: "CUT04",
        clipboard: "  action scene  ",
        now: new Date(2026, 10, 20, 14, 30),
      },
    );

    expect(result.text).toBe("EP12_CUT04_2026-11-20 [ACTION SCENE] 끝");
    expect(result.cursorOffset).toBe("EP12_CUT04_2026-11-20 [ACTION SCENE] ".length);
    expect(result.unresolvedTokens).toEqual([]);
  });

  it("IME 조합 중에는 스니펫 확장을 차단하고 조합 완료 후 정확히 확장·캐럿을 배치한다", () => {
    const snippets: StudioDynamicSnippet[] = [
      {
        id: "snip-narration",
        trigger: "!내레이션",
        titleKo: "회차 내레이션 박스",
        template: "[{episode} · {character}] {cursor}",
        category: "lettering",
      },
    ];

    const blocked = matchAndExpandSnippetTrigger({
      inputText: "!내레이션",
      caretOffset: 5,
      snippets,
      context: { episode: "3화", character: "한하나" },
      isComposing: true,
    });
    expect(blocked.matched).toBe(false);
    expect(blocked.blockedByIme).toBe(true);

    const expanded = matchAndExpandSnippetTrigger({
      inputText: "도입 !내레이션",
      caretOffset: 8,
      snippets,
      context: { episode: "3화", character: "한하나" },
      isComposing: false,
    });
    expect(expanded.matched).toBe(true);
    expect(expanded.nextText).toBe("도입 [3화 · 한하나] ");
    expect(expanded.nextCaretOffset).toBe("도입 [3화 · 한하나] ".length);
  });

  it("허용 스킴 퀵링크, 허용 목록 매크로 체인, 2차 액션 패널, 민감정보 차단을 검증한다", () => {
    const uri = buildStudioQuicklinkUri({
      scheme: "bg3d-cam",
      targetPath: "classroom/sunset-angle",
      params: { fov: "24" },
    });
    const parsed = parseStudioQuicklinkUri(uri);
    expect(parsed.valid).toBe(true);
    expect(parsed.scheme).toBe("bg3d-cam");
    expect(parsed.params.fov).toBe("24");

    const unsafe = parseStudioQuicklinkUri("javascript://alert(1)");
    expect(unsafe.valid).toBe(false);

    const allowlist = new Set(["layer.create", "filter.apply-lut"]);
    const plan = planCommandMacroExecution(
      {
        id: "macro-sunset",
        titleKo: "노을 마무리 세트",
        steps: [
          { commandId: "layer.create", args: { name: "{cut}_노을광" } },
          { commandId: "filter.apply-lut", args: { preset: "sunset-warm" } },
        ],
      },
      allowlist,
      { cut: "CUT07" },
    );
    expect(plan.ok).toBe(true);
    expect(plan.steps[0]!.resolvedArgs.name).toBe("CUT07_노을광");
    expect(plan.atomicUndoLabelKo).toContain("2단계");

    const secondary = buildCommandSecondaryActions({
      isPinnedQuickSlot: false,
      hasDeeplink: true,
    });
    expect(secondary).toHaveLength(5);

    const safeExport = exportAutomationPackJson({
      snippets: [],
      quicklinks: [],
      macros: [],
    });
    expect(safeExport.ok).toBe(true);
    expect(importAutomationPackJson(safeExport.json!).ok).toBe(true);

    // 비밀 키 문자열 포함 시 내보내기 차단
    const leakedExport = exportAutomationPackJson({
      snippets: [
        {
          id: "bad",
          trigger: "!key",
          titleKo: "키",
          template: ["sk", "1234567890abcdef"].join("-"),
          category: "prompt",
        },
      ],
      quicklinks: [],
      macros: [],
    });
    expect(leakedExport.ok).toBe(false);
  });
});
