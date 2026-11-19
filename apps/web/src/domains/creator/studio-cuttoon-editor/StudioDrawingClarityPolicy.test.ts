import { describe, expect, it } from "vitest";

import { studioDocumentHref } from "../studio-document-workspace";
import { isStudioDrawingEditorRoute } from "./StudioDrawingClarityPolicy";

function editor(pathname: string, search = "") {
  return isStudioDrawingEditorRoute({ pathname, search });
}

describe("원고 경로의 통합 편집기 판정", () => {
  it.each(["/studio/canvas", "/studio/comic", "/studio/work/abc/canvas", "/studio/remix/abc/comic", "/studio/draft/drawing-entry"])("%s의 역할·밀도·설치형 진입이 같은 편집기를 사용한다", pathname => {
    for (const search of ["", "?uiMode=basic", "?uiMode=focus", "?uiMode=full", "?roleWorkspace=review", "?drawingShell=app&startTool=draw", "?room=room-a&roleWorkspace=lettering"]) {
      expect(editor(pathname, search)).toBe(true);
    }
  });

  it.each(["draw", "comic", "storyboard"] as const)("이름 있는 %s 문서는 원고·편집 역할을 유지한다", workspace => {
    const href = studioDocumentHref({ projectId: "project-a", documentId: "page-a", workspace, search: "uiMode=full&roleWorkspace=review&room=room-a" });
    const { pathname, search } = new URL(href, "https://example.test");
    expect(editor(pathname, search)).toBe(true);
  });

  it.each(["/play", "/studio/poser", "/studio/bg3d", "/studio/character", "/studio/work/abc/assets", "/studio/work/abc/animation", "/studio/work/a/canvas/wrong"])("%s 전문 도구는 원고용 셸을 띄우지 않는다", pathname => {
    expect(editor(pathname, "?drawingShell=app&uiMode=basic")).toBe(false);
  });
});
