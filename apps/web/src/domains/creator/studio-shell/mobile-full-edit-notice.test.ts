// 모바일 풀 편집 경계 계약 테스트 (inclusion 발견 7).
// (1) 닫힘 기억은 표면별 세션 키로 동작하고 저장소가 던져도 안전하다.
// (2) 안내 컴포넌트는 좁은 폭에서만·닫힘 버튼 44px·가능 작업 목록을 고정한다.
// (3) 풀 편집 진입점(StudioEditorRoute)이 안내를 실제로 배선한다.
// (4) 하단에 떠 있는 안내가 모달 대화상자·열린 모바일 시트의 취소/적용/메뉴 항목을 가리지 않는다.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  dismissMobileFullEditNotice,
  isMobileFullEditNoticeDismissed,
  mobileFullEditNoticeStorageKey,
} from "../mobile-full-edit-notice-storage";

const HERE = dirname(fileURLToPath(import.meta.url));
const noticeSource = readFileSync(join(HERE, "MobileFullEditNotice.tsx"), "utf-8");
const editorRouteSource = readFileSync(
  join(HERE, "../studio-router/routes/StudioEditorRoute.tsx"),
  "utf-8",
);
const overlayStackingCss = readFileSync(
  join(HERE, "../../../app/styles/studio-overlay-stacking.css"),
  "utf-8",
);
const mobileDockSource = readFileSync(join(HERE, "../StudioMobileEditingDock.tsx"), "utf-8");

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe("모바일 풀 편집 안내 닫힘 기억", () => {
  it("표면별 키로 닫힘을 기억하고 다른 표면에는 영향이 없다", () => {
    const storage = fakeStorage();
    expect(mobileFullEditNoticeStorageKey("studio-editor-canvas")).toBe(
      "toonstudio-mobile-full-edit-notice-dismissed:studio-editor-canvas",
    );
    expect(isMobileFullEditNoticeDismissed("studio-editor-canvas", () => storage)).toBe(false);
    dismissMobileFullEditNotice("studio-editor-canvas", () => storage);
    expect(isMobileFullEditNoticeDismissed("studio-editor-canvas", () => storage)).toBe(true);
    expect(isMobileFullEditNoticeDismissed("studio-editor-poser", () => storage)).toBe(false);
  });

  it("저장소가 예외를 던져도 읽기는 false, 닫기는 조용히 무시한다", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(isMobileFullEditNoticeDismissed("studio-editor-canvas", () => throwing)).toBe(false);
    expect(() => dismissMobileFullEditNotice("studio-editor-canvas", () => throwing)).not.toThrow();
  });
});

describe("모바일 풀 편집 안내 패턴 계약", () => {
  it("좁은 폭(1023px 이하)과 태블릿 가로에서만 렌더링하고 데스크톱에서는 나오지 않는다", () => {
    // 좁은 폭 쿼리 문자열의 정본은 studio-mobile-touch-flow 로 이동했다(A7).
    expect(noticeSource).toContain("MOBILE_FULL_EDIT_NOTICE_QUERY = STUDIO_TOUCH_NARROW_QUERY");
    expect(noticeSource).toContain("if ((!narrow && !touchTablet) || dismissed) return null;");
  });

  it("차단하지 않는 배너로 데스크톱 권장 + 가능 작업 목록 + 44px 닫기 동선을 제공한다", () => {
    expect(noticeSource).toContain('data-testid="mobile-full-edit-notice"');
    expect(noticeSource).toContain("풀 편집은 데스크톱에서 가장 편해요");
    expect(noticeSource).toContain("mobileCapabilities.map");
    expect(noticeSource).toContain("min-h-11 w-full");
    expect(noticeSource).toContain("size-11 shrink-0");
    // 모달이 아니라 aside 배너여야 편집 자체를 막지 않는다.
    expect(noticeSource).toContain("<aside");
    expect(noticeSource).not.toContain('role="dialog"');
  });

  it("풀 편집 진입점인 StudioEditorRoute가 표면별 안내를 배선한다", () => {
    expect(editorRouteSource).toContain("<MobileFullEditNotice");
    expect(editorRouteSource).toContain("surfaceId={`studio-editor-${route.surface}`}");
    // 되는/안 되는 목록은 라우트에 하드코딩하지 않고 표면별 정본 계획을 소비한다.
    // (전 표면 공통 "모바일 도크 그리기" 약속은 도크 없는 표면에서 거짓 안내였다 — A7.)
    expect(editorRouteSource).toContain("resolveStudioMobileTouchPlan(route.surface)");
    expect(editorRouteSource).toContain("mobileCapabilities={touchPlan.canDo}");
    expect(editorRouteSource).toContain("mobileLimitations={touchPlan.cannotDo}");
    expect(editorRouteSource).toContain("touchTier={touchPlan.tier}");
    expect(editorRouteSource).not.toContain("모바일 도크의 간단한 그리기·지우기");
  });

  it("안 되는 작업 목록을 가능 목록과 구분해 함께 보여 준다", () => {
    expect(noticeSource).toContain("mobileLimitations");
    expect(noticeSource).toContain("이 기기에서는 안 돼요");
    expect(noticeSource).toContain("data-studio-mobile-touch-tier={touchTier}");
  });

  it("태블릿 가로(데스크톱 폭 + 터치)에서도 안내가 렌더링된다", () => {
    expect(noticeSource).toContain("MOBILE_TOUCH_TABLET_NOTICE_QUERY");
    expect(noticeSource).toContain("STUDIO_TOUCH_TABLET_QUERY");
    expect(noticeSource).toContain("if ((!narrow && !touchTablet) || dismissed) return null;");
    const flowSource = readFileSync(join(HERE, "../studio-mobile-touch-flow.ts"), "utf-8");
    expect(flowSource).toContain(
      '"(pointer: coarse) and (min-width: 1024px) and (max-width: 1366px)"',
    );
  });
});

describe("모바일 풀 편집 안내 겹침 계약", () => {
  // 안내는 z-90 의 고정 배너라 가만히 두면 z-80 모달 대화상자의 취소·적용과 도크 메뉴 항목 위에 겹친다
  // (필터 창 반응형 검증과 모바일 브러시 검증이 "다른 요소가 입력을 가로막습니다"로 실패했다).
  it("CSS 가 고를 수 있는 안정 마커를 가진다", () => {
    expect(noticeSource).toContain('data-studio-mobile-full-edit-notice="true"');
    expect(noticeSource).toContain('data-testid="mobile-full-edit-notice"');
  });

  it("모달 대화상자나 열린 모바일 시트가 있는 동안에는 상호작용 계층을 비킨다", () => {
    const rule = overlayStackingCss.match(
      /html:has\(\[role="dialog"\]\[aria-modal="true"\]\) \[data-studio-mobile-full-edit-notice="true"\],\s*html:has\(\[data-studio-mobile-sheet\]:not\(\[hidden\]\):not\(\[aria-hidden="true"\]\)\) \[data-studio-mobile-full-edit-notice="true"\]\s*\{([^}]*)\}/u,
    )?.[1];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/display:\s*none\s*!important/u);
    // 숨김은 CSS 전용이다. 닫힘 기억(세션 저장)과 컴포넌트 상태는 건드리지 않는다.
    expect(rule).not.toMatch(/pointer-events|visibility/u);
  });

  it("닫힌 도크 시트는 hidden·aria-hidden 으로 표시돼 안내를 숨기지 않는다", () => {
    // 위 규칙은 :not([hidden]):not([aria-hidden="true"]) 로 "열린" 시트만 고른다.
    // 도크의 작업 메뉴와 색상 시트가 닫힘 상태를 같은 속성으로 표현하는 동안에만 안내가 항상 가려지지 않는다.
    expect(mobileDockSource).toContain('data-studio-mobile-sheet="tools"');
    expect(mobileDockSource).toContain("hidden={!workspaceDockExpanded}");
    expect(mobileDockSource).toContain("aria-hidden={!workspaceDockExpanded}");
    expect(mobileDockSource).toContain('data-studio-mobile-sheet="colors"');
    expect(mobileDockSource).toContain("hidden={!colorToolsOpen}");
    expect(mobileDockSource).toContain("aria-hidden={!colorToolsOpen}");
  });
});
