// 모바일 풀 편집 경계 계약 테스트 (inclusion 발견 7).
// (1) 닫힘 기억은 표면별 세션 키로 동작하고 저장소가 던져도 안전하다.
// (2) 안내 컴포넌트는 좁은 폭에서만·닫힘 버튼 44px·가능 작업 목록을 고정한다.
// (3) 풀 편집 진입점(StudioEditorRoute)이 안내를 실제로 배선한다.
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
  it("좁은 폭(1023px 이하)에서만 렌더링하고 데스크톱에서는 나오지 않는다", () => {
    expect(noticeSource).toContain('MOBILE_FULL_EDIT_NOTICE_QUERY = "(max-width: 1023px)"');
    expect(noticeSource).toContain("if (!narrow || dismissed) return null;");
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
    expect(editorRouteSource).toContain("모바일 도크의 간단한 그리기·지우기");
  });
});
