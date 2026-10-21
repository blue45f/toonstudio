import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * A5 배선 소스 계약 — 시작 입구 표면이 정본(studio-start-entry)을 실제로
 * 소비하는지, 그리고 맥락 없는 bare 양식 링크가 입구 표면에 남지 않았는지를
 * 고정한다. 의도를 단 딥링크(?template=·?start= 등)는 계약상 허용이라
 * bare 문자열만 검사한다.
 */
const read = (relative: string): string =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

const BARE_FORM_LINK = /href="\/studio\/new"/;
const BARE_FORM_FALLBACK = /: "\/studio\/new"/;

describe("studio start entry wiring (A5)", () => {
  it("작업공간 홈 표면군은 정문을 소비하고 bare 양식 링크가 없다", () => {
    for (const file of [
      "./workspace/StudioWorkspacePage.tsx",
      "./workspace/StudioWorkspaceActivityRail.tsx",
      "./workspace/StudioWorkspaceLibraryEmptyState.tsx",
      "./workspace/StudioWorkspaceRecentWorks.tsx",
      "./workspace/StudioWorkspaceHero.tsx",
      "./workspace/StudioWorkspaceProjectPicker.tsx",
    ]) {
      const source = read(file);
      expect(source, file).toContain("STUDIO_START_GATEWAY_HREF");
      expect(source, file).not.toMatch(BARE_FORM_LINK);
      expect(source, file).not.toMatch(BARE_FORM_FALLBACK);
    }
  });

  it("라이브러리 로비의 주 행동은 정문이고, 템플릿 의도 카드는 직행을 유지한다", () => {
    const source = read("./studio-shell/StudioCreatorLobby.tsx");
    expect(source).toContain("STUDIO_START_GATEWAY_HREF");
    expect(source).not.toMatch(BARE_FORM_LINK);
    // 의도 딥링크(템플릿 프리셋)는 관문으로 돌리면 의도가 깨져 그대로 둔다.
    expect(source).toContain("/studio/new?kind=webtoon&template=webtoon-vertical");
  });

  it("온보딩 완료 기본 CTA는 양식 직행이 아니라 정문이다", () => {
    const source = read("./onboarding/CreatorAdaptiveOnboardingGate.tsx");
    expect(source).toContain('href: "/create"');
    expect(source).not.toContain('href: "/studio/new"');
  });

  it("생성 양식에는 관문으로 돌아가는 복귀 링크가 상시 있다", () => {
    const source = read("./studio-shell/StudioNewIntegratedPage.tsx");
    expect(source).toContain("STUDIO_START_FORM_BACK_HREF");
    expect(source).toContain("시작 방법 다시 고르기");
  });

  it("첫 저장 → 게시 제안이 저장 상태 크롬 마운트에 배선돼 있다", () => {
    const source = read("./StudioSaveStatusChromeMount.tsx");
    expect(source).toContain("StudioFirstPublishSuggestion");
    expect(source).toContain("signals.lastReceipt !== null");
    expect(source).toContain("publishSuggestion");
  });
});
