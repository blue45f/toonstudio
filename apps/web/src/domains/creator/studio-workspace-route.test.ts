import { describe, expect, it } from "vitest";

import {
  STUDIO_DRAFT_CANVAS_PATHNAME,
  STUDIO_HOME_PATHNAME,
  createStudioDccNavigationState,
  isStudioWorkspaceLocation,
  isStudioWorkspaceRoutePathname,
  parseStudioWorkspaceRoute,
  shouldPreserveStudioRouteLifecycle,
  studio2dHref,
  studio2dSurfaceNavigationHref,
  studioCanvasHref,
  studioCanvasReturnHref,
  studioDccHref,
  studioDocumentToolNavigation,
  studioRouteStageKey,
  studioVirtualSpaceLifecycleKey,
  studioWorkspaceCanonicalHref,
  studioWorkspaceReturnHref,
} from "./studio-workspace-route";

describe("studio workspace routes", () => {
  it.each(["/studio/space", "/studio/p/project-1/space"])("%s 장소 이동만 같은 가상 사무실 lifecycle을 유지한다", (pathname) => {
    const initial = { pathname, search: "?place=creator-cafe&worldEdit=1&session=team-a" };
    const next = { pathname, search: "?place=personal-atelier&worldEdit=1&session=team-a" };
    expect(studioVirtualSpaceLifecycleKey(initial)).toBe(`${pathname}?worldEdit=1&session=team-a`);
    expect(studioRouteStageKey(next)).toBe(studioRouteStageKey(initial));
    expect(studioRouteStageKey({ pathname, search: "?place=personal-atelier&session=team-a" })).not.toBe(studioRouteStageKey(initial));
    expect(studioRouteStageKey({ pathname, search: "?place=personal-atelier&worldEdit=1&session=team-b" })).not.toBe(studioRouteStageKey(initial));
    expect(studioRouteStageKey({ pathname, search: "?place=creator-cafe" })).toBe(pathname);
  });

  it("다른 프로젝트와 가상 사무실 밖의 query는 lifecycle에서 제거하지 않는다", () => {
    expect(studioRouteStageKey({ pathname: "/studio/p/project-1/space", search: "?place=creator-cafe" }))
      .not.toBe(studioRouteStageKey({ pathname: "/studio/p/project-2/space", search: "?place=creator-cafe" }));
    for (const pathname of ["/studio/avatar", "/studio/p/project-1/space/extra", "/studio/p/%5C/space", "/studio/p/%/space"]) {
      const location = { pathname, search: "?place=creator-cafe" };
      expect(studioVirtualSpaceLifecycleKey(location)).toBeNull();
      expect(studioRouteStageKey(location)).toBe(`${pathname}?place=creator-cafe`);
    }
  });

  it.each([
    ["/studio/canvas", "", "canvas", null, null, "/studio/canvas"],
    ["/studio/canvas/poser", "?room=team-a", "poser", null, null, "/studio/canvas/poser"],
    ["/studio/canvas?id=legacy", "?id=legacy", "canvas", "legacy", null, "/studio/work/legacy/canvas"],
    ["/studio/work/work-1", "", "canvas", "work-1", null, "/studio/work/work-1/canvas"],
    ["/studio/work/work-1/canvas", "", "canvas", "work-1", null, "/studio/work/work-1/canvas"],
    ["/studio/comic", "", "comic", null, null, "/studio/comic"],
    ["/studio/work/work-1/animation", "", "animation", "work-1", null, "/studio/work/work-1/animation"],
    ["/studio/work/work-1/brushes", "", "brushes", "work-1", null, "/studio/work/work-1/brushes"],
    ["/studio/work/work-1/bg3d", "", "bg3d", "work-1", null, "/studio/work/work-1/bg3d"],
    ["/studio/work/work-1/poser", "", "poser", "work-1", null, "/studio/work/work-1/poser"],
    ["/studio/character", "", "character", null, null, "/studio/character"],
    ["/studio/work/work-1/character", "", "character", "work-1", null, "/studio/work/work-1/character"],
    ["/studio/remix/source-1/canvas", "", "canvas", null, null, "/studio/remix/source-1/canvas"],
    ["/studio/canvas?remix=source-1", "?remix=source-1", "canvas", null, null, "/studio/remix/source-1/canvas"],
    ["/studio/3d", "", "dcc", null, "model", "/studio/3d/dcc/model"],
    ["/studio/3d/dcc/sculpt", "", "dcc", null, "sculpt", "/studio/3d/dcc/sculpt"],
    ["/studio/work/work-1/3d", "", "dcc", "work-1", "model", "/studio/work/work-1/3d/dcc/model"],
    ["/studio/work/work-1/3d/dcc/shot", "", "dcc", "work-1", "shot", "/studio/work/work-1/3d/dcc/shot"],
    ["/studio/p/project-1/d/document-1", "?workspace=comic", "canvas", "document-1", null, "/studio/p/project-1/d/document-1"],
    ["/studio/p/project-1/d/document-1", "?workspace=3d", "bg3d", "document-1", null, "/studio/p/project-1/d/document-1"],
    ["/studio/draft/draft-1", "?workspace=slides", "canvas", null, null, "/studio/draft/draft-1"],
  ] as const)(
    "parses %s as a durable %s workspace route",
    (rawPath, search, surface, workId, dccMode, canonicalPathname) => {
      const pathname = rawPath.split("?")[0];
      const route = parseStudioWorkspaceRoute({ pathname, search });
      expect(route).toMatchObject({
        canonicalPathname,
        dccMode,
        surface,
        valid: true,
        workId,
      });
    },
  );

  it("retains canonical project, document, draft and workspace identity", () => {
    expect(parseStudioWorkspaceRoute({
      pathname: "/studio/p/project-1/d/document-2",
      search: "?workspace=localization&focus=cut%3A8&room=team-a",
    })).toMatchObject({
      valid: true,
      projectId: "project-1",
      documentId: "document-2",
      draftId: null,
      documentWorkspace: "localization",
      workId: "document-2",
      surface: "comic",
    });
    expect(parseStudioWorkspaceRoute({
      pathname: "/studio/draft/draft-7",
      search: "?workspace=design",
    })).toMatchObject({
      valid: true,
      projectId: null,
      documentId: null,
      draftId: "draft-7",
      documentWorkspace: "design",
      workId: null,
      surface: "canvas",
    });
  });

  it.each([
    ["/studio", "", "invalid-path"],
    ["/studio/work", "", "invalid-work-id"],
    ["/studio//3d/dcc/model", "", "invalid-path"],
    ["/studio/work//canvas", "", "invalid-path"],
    ["/studio/work/work-1//3d/dcc/model", "", "invalid-path"],
    ["/studio/work/%5C/canvas", "", "invalid-work-id"],
    ["/studio/work/work-1/3d/dcc/unknown", "", "invalid-path"],
    ["/studio/avatar", "", "invalid-path"],
    ["/studio/work/work-1/canvas", "?id=work-2", "work-id-conflict"],
    ["/studio/work/work-1/canvas", "?id=work-1&id=work-1", "invalid-work-id"],
    ["/studio/canvas", "?id=work-1&id=work-2", "invalid-work-id"],
    ["/studio/canvas", "?id=..", "invalid-work-id"],
    ["/studio/remix", "", "invalid-remix-id"],
    ["/studio/canvas", "?remix=source-1&remix=source-1", "invalid-remix-id"],
    ["/studio/work/work-1/canvas", "?remix=source-1", "identity-conflict"],
    ["/studio/canvas", "?id=work-1&remix=source-1", "identity-conflict"],
    ["/studio/canvas", "?mode=upload&mode=upload", "invalid-mode"],
    ["/studio/3d/dcc/model", "?mode=upload", "invalid-mode"],
    ["/studio/p/project-1/d/document-1", "?workspace=unknown", "invalid-path"],
    ["/studio/p/project-1/d/document-1", "?workspace=draw&workspace=comic", "invalid-path"],
  ] as const)("fails closed for %s", (pathname, search, errorCode) => {
    expect(parseStudioWorkspaceRoute({ pathname, search })).toEqual({
      errorCode,
      valid: false,
    });
  });

  it("builds canonical canvas and DCC hrefs without legacy identity or upload switches", () => {
    const search = "?id=work-1&mode=upload&room=room-2&remix=source-3";
    expect(studioCanvasHref({ search, workId: null })).toBe(
      "/studio/canvas?room=room-2",
    );
    expect(studioCanvasHref({ search, workId: "work/한글" })).toBe(
      "/studio/work/work%2F%ED%95%9C%EA%B8%80/canvas?room=room-2",
    );
    expect(studioDccHref({ mode: "cad", search, workId: "work/한글" })).toBe(
      "/studio/work/work%2F%ED%95%9C%EA%B8%80/3d/dcc/cad?room=room-2",
    );
    expect(studio2dHref({
      remixSourceWorkId: "source/한글",
      search,
      surface: "animation",
      workId: null,
    })).toBe(
      "/studio/remix/source%2F%ED%95%9C%EA%B8%80/animation?room=room-2",
    );
    expect(studio2dHref({
      search: "",
      surface: "brushes",
      workId: "work-1",
    })).toBe("/studio/work/work-1/brushes");
    expect(parseStudioWorkspaceRoute({
      pathname: "/studio/work/work%2F%ED%95%9C%EA%B8%80/3d/dcc/cad",
    })).toMatchObject({ valid: true, workId: "work/한글" });
  });

  it("canonicalizes document query state without legacy identity switches", () => {
    const route = parseStudioWorkspaceRoute({
      pathname: "/studio/p/project-1/d/document-1",
      search: "?workspace=comic&room=team-a&id=legacy&mode=upload&project=old",
    });
    if (!route.valid) throw new Error("fixture route failed");
    expect(studioWorkspaceCanonicalHref(route,
      "?workspace=comic&room=team-a&id=legacy&mode=upload&project=old",
    )).toBe(
      "/studio/p/project-1/d/document-1?room=team-a&workspace=comic",
    );
  });

  it.each([
    "/studio/p/project-1/d/document-1",
    "/studio/draft/draft-1",
  ])("로컬 %s의 3D 배경 진입과 닫기가 같은 문서와 lifecycle을 유지한다", (pathname) => {
    const search = "?workspace=draw&focus=cut%3A8&language=ko&version=v2&room=team-a&uiMode=focus";
    const route = parseStudioWorkspaceRoute({ pathname, search });
    if (!route.valid) throw new Error("fixture route failed");
    const bg3dHref = studio2dSurfaceNavigationHref({ ...route, workId: null }, "bg3d", search);
    expect(bg3dHref).toBe(`${pathname}?focus=cut%3A8&language=ko&room=team-a&uiMode=focus&version=v2&workspace=3d`);
    const bg3dSearch = bg3dHref.slice(bg3dHref.indexOf("?"));
    const bg3dRoute = parseStudioWorkspaceRoute({ pathname, search: bg3dSearch });
    if (!bg3dRoute.valid) throw new Error("fixture BG3D route failed");
    expect(bg3dRoute).toMatchObject({
      projectId: route.projectId,
      documentId: route.documentId,
      draftId: route.draftId,
      workId: route.workId,
      documentWorkspace: "3d",
      surface: "bg3d",
    });
    expect(studioRouteStageKey({ pathname, search: bg3dSearch }))
      .toBe(studioRouteStageKey({ pathname, search }));
    expect(studio2dSurfaceNavigationHref(bg3dRoute, "canvas", bg3dSearch))
      .toBe(`${pathname}?focus=cut%3A8&language=ko&room=team-a&uiMode=focus&version=v2&workspace=draw`);
  });

  it.each([
    ["/studio/draft/%ED%95%9C%EA%B8%80", "poser"],
    ["/studio/draft/draft-1", "character"],
    ["/studio/p/project-1/d/document-1", "poser"],
    ["/studio/p/project-1/d/document-1", "character"],
  ] as const)("%s에서 %s를 열고 닫을 때 문서·방·캔버스 lifecycle을 보존한다", (pathname, tool) => {
    const search = "?workspace=draw&focus=cut%3A8&language=ko&version=v2&room=team-a";
    const canvas = parseStudioWorkspaceRoute({ pathname, search });
    if (!canvas.valid) throw new Error("원고 경로");
    const href = studio2dSurfaceNavigationHref(canvas, tool, search);
    const opened = new URL(href, "https://toonstudio.test");
    expect(opened.pathname).toBe(pathname);
    expect(opened.searchParams.get("workspace")).toBe("3d");
    expect(opened.searchParams.get("tool3d")).toBe(tool);
    const route = parseStudioWorkspaceRoute(opened);
    if (!route.valid) throw new Error("도구 경로");
    expect(route).toMatchObject({ surface: tool, projectId: canvas.projectId, documentId: canvas.documentId, draftId: canvas.draftId });
    expect(studioRouteStageKey(opened)).toBe(studioRouteStageKey({ pathname, search }));
    expect(studioWorkspaceCanonicalHref(route, opened.search)).toBe(href);
    const bg = studio2dSurfaceNavigationHref(route, "bg3d", opened.search);
    expect(bg).not.toContain("tool3d");
    expect(bg).toContain("workspace=3d");
    expect(studio2dSurfaceNavigationHref(route, "canvas", opened.search)).toBe(
      `${pathname}?focus=cut%3A8&language=ko&room=team-a&version=v2&workspace=draw`,
    );
  });

  it.each([
    ["workspace=3d&tool3d=poser&tool3d=character", "bg3d", "3d"],
    ["workspace=3d&tool3d=unknown", "bg3d", "3d"],
    ["workspace=draw&tool3d=poser", "canvas", "draw"],
  ])("문서의 잘못되거나 오래된 3D 도구 상태를 정규화한다 (%s)", (search, surface, workspace) => {
    const pathname = "/studio/draft/draft-1";
    const route = parseStudioWorkspaceRoute({ pathname, search });
    if (!route.valid) throw new Error("도구 경로");
    expect(route.surface).toBe(surface);
    expect(studioWorkspaceCanonicalHref(route, search)).toBe(`${pathname}?workspace=${workspace}`);
  });

  it("keeps one route-stage lifecycle only within the same Studio document", () => {
    expect(studioRouteStageKey(STUDIO_HOME_PATHNAME)).toBe(STUDIO_HOME_PATHNAME);
    expect(studioRouteStageKey(STUDIO_DRAFT_CANVAS_PATHNAME)).toBe("/studio/draft/editor");
    expect(studioRouteStageKey("/studio/work/work-1/3d/dcc/model")).toBe(
      "/studio/work:work-1/editor",
    );
    expect(studioRouteStageKey({
      pathname: STUDIO_DRAFT_CANVAS_PATHNAME,
      search: "?id=work-1",
    })).toBe("/studio/work:work-1/editor");
    expect(studioRouteStageKey({
      pathname: "/studio/work/work-1/canvas",
      search: "?mode=upload",
    })).toBe("/studio/work:work-1/upload");
    expect(studioRouteStageKey({
      pathname: STUDIO_DRAFT_CANVAS_PATHNAME,
      search: "?remix=source-1",
    })).toBe("/studio/remix:source-1/editor");
    expect(studioRouteStageKey({
      pathname: "/studio/p/project-1/d/document-2",
      search: "?workspace=draw",
    })).toBe("/studio/project:project-1:document:document-2/editor");
    expect(studioRouteStageKey({
      pathname: "/studio/draft/draft-4",
      search: "?workspace=slides",
    })).toBe("/studio/draft:draft-4/editor");
    expect(studioRouteStageKey({
      pathname: "/studio/work/work-1/canvas",
      search: "?mode=upload&mode=upload",
    })).toBe("/studio/work/work-1/canvas?mode=upload&mode=upload");
    expect(studioRouteStageKey({
      pathname: "/studio/tools-companion",
      search: "?session=primary-a-1234",
    })).toBe("/studio/tools-companion?session=primary-a-1234");
    expect(studioRouteStageKey({
      pathname: "/studio/work/work-1/canvas",
      search: "?id=work-2",
    })).toBe("/studio/work/work-1/canvas?id=work-2");
    expect(studioRouteStageKey("/ranking")).toBe("/ranking");
    expect(shouldPreserveStudioRouteLifecycle(
      "/studio/work/work-1/canvas",
      "/studio/work/work-1/3d/dcc/model",
    )).toBe(true);
    expect(shouldPreserveStudioRouteLifecycle(
      "/studio/work/work-1/3d/dcc/model",
      "/studio/work/work-1/3d/dcc/shot",
    )).toBe(true);
    expect(shouldPreserveStudioRouteLifecycle(
      { pathname: "/studio/p/project-1/d/document-2", search: "?workspace=draw" },
      { pathname: "/studio/p/project-1/d/document-2", search: "?workspace=comic" },
    )).toBe(true);
    expect(shouldPreserveStudioRouteLifecycle(
      { pathname: "/studio/p/project-1/d/document-2", search: "?workspace=draw" },
      { pathname: "/studio/p/project-2/d/document-2", search: "?workspace=draw" },
    )).toBe(false);
    expect(shouldPreserveStudioRouteLifecycle(
      "/studio/work/work-1/canvas",
      "/studio/work/work-2/3d/dcc/model",
    )).toBe(false);
    expect(shouldPreserveStudioRouteLifecycle(
      STUDIO_HOME_PATHNAME,
      "/studio/work/work-1/canvas",
    )).toBe(false);
    expect(shouldPreserveStudioRouteLifecycle(
      { pathname: STUDIO_DRAFT_CANVAS_PATHNAME, search: "?id=work-1" },
      { pathname: "/studio/work/work-1/canvas", search: "" },
    )).toBe(true);
    expect(shouldPreserveStudioRouteLifecycle(
      { pathname: STUDIO_DRAFT_CANVAS_PATHNAME, search: "?remix=source-1" },
      { pathname: "/studio/remix/source-1/3d/dcc/model", search: "" },
    )).toBe(true);
    expect(shouldPreserveStudioRouteLifecycle(
      "/studio/remix/source-1/canvas",
      "/studio/remix/source-2/canvas",
    )).toBe(false);
    expect(shouldPreserveStudioRouteLifecycle(
      "/studio/work/work-1/canvas",
      "/studio/tools-companion",
    )).toBe(false);
    expect(shouldPreserveStudioRouteLifecycle(
      "/studio/work/work-1/canvas",
      "/studio/avatar",
    )).toBe(false);
    expect(shouldPreserveStudioRouteLifecycle(
      { pathname: "/studio/work/work-1/canvas", search: "" },
      { pathname: "/studio/work/work-1/canvas", search: "?mode=upload" },
    )).toBe(false);
    expect(shouldPreserveStudioRouteLifecycle(
      { pathname: "/studio/work/work-1/canvas", search: "" },
      {
        pathname: "/studio/work/work-1/canvas",
        search: "?mode=upload&mode=upload",
      },
    )).toBe(false);
    expect(shouldPreserveStudioRouteLifecycle(STUDIO_HOME_PATHNAME, "/ranking")).toBe(false);
  });

  it("distinguishes the Studio front door from actual editor workspace routes", () => {
    expect(isStudioWorkspaceRoutePathname(STUDIO_HOME_PATHNAME)).toBe(false);
    expect(isStudioWorkspaceRoutePathname(STUDIO_DRAFT_CANVAS_PATHNAME)).toBe(true);
    expect(isStudioWorkspaceRoutePathname("/studio/p/project-1/d/document-1")).toBe(true);
    expect(isStudioWorkspaceRoutePathname("/studio/draft/draft-1")).toBe(true);
    expect(isStudioWorkspaceRoutePathname("/studio/work/work-1/3d/dcc/cad")).toBe(true);
    expect(isStudioWorkspaceRoutePathname("/studio/tools-companion")).toBe(false);
    expect(isStudioWorkspaceRoutePathname("/studio//3d/dcc/model")).toBe(false);
    expect(isStudioWorkspaceRoutePathname("/studio/avatar")).toBe(false);
    expect(isStudioWorkspaceLocation({
      pathname: "/studio/work/work-1/canvas",
      search: "?id=work-2",
    })).toBe(false);
  });

  it("accepts only same-document canvas return receipts", () => {
    const canvasRoute = parseStudioWorkspaceRoute({
      pathname: "/studio/work/work-1/canvas",
    });
    const dccRoute = parseStudioWorkspaceRoute({
      pathname: "/studio/work/work-1/3d/dcc/model",
    });
    expect(canvasRoute.valid).toBe(true);
    expect(dccRoute.valid).toBe(true);
    if (!canvasRoute.valid || !dccRoute.valid) throw new Error("fixture route failed");
    const state = createStudioDccNavigationState(canvasRoute, {
      key: "canvas-entry",
      pathname: "/studio/work/work-1/canvas",
      search: "?room=team-2",
    });
    expect(studioWorkspaceReturnHref(state, dccRoute)).toBe(
      "/studio/work/work-1/canvas?room=team-2",
    );
    expect(studioWorkspaceReturnHref({
      studioWorkspaceReturn: {
        ...state.studioWorkspaceReturn,
        workId: "work-2",
      },
    }, dccRoute)).toBeNull();
    expect(studioWorkspaceReturnHref({
      studioWorkspaceReturn: {
        ...state.studioWorkspaceReturn,
        pathname: "/ranking",
      },
    }, dccRoute)).toBeNull();
  });

  it("returns from a DCC workbench to the canonical project document", () => {
    const documentRoute = parseStudioWorkspaceRoute({
      pathname: "/studio/p/project-1/d/document-1",
      search: "?workspace=draw&room=team-2",
    });
    const dccRoute = parseStudioWorkspaceRoute({
      pathname: "/studio/work/document-1/3d/dcc/model",
    });
    if (!documentRoute.valid || !dccRoute.valid) throw new Error("fixture route failed");
    const state = createStudioDccNavigationState(documentRoute, {
      key: "canonical-document-entry",
      pathname: "/studio/p/project-1/d/document-1",
      search: "?workspace=draw&room=team-2",
    });
    expect(studioWorkspaceReturnHref(state, dccRoute)).toBe(
      "/studio/p/project-1/d/document-1?room=team-2&workspace=draw",
    );
  });

  it("canonicalizes legacy draft return receipts to the explicit canvas route", () => {
    const dccRoute = parseStudioWorkspaceRoute({ pathname: "/studio/3d/dcc/model" });
    if (!dccRoute.valid) throw new Error("fixture route failed");
    expect(studioWorkspaceReturnHref({
      studioWorkspaceReturn: {
        entryKey: "legacy-draft",
        pathname: "/studio",
        remixSourceWorkId: null,
        search: "?room=team-2",
        version: 1,
        workId: null,
      },
    }, dccRoute)).toBe("/studio/canvas?room=team-2");
  });

  it("reads return receipts without invoking hostile accessors", () => {
    const route = parseStudioWorkspaceRoute({ pathname: "/studio/3d/dcc/model" });
    if (!route.valid) throw new Error("fixture route failed");
    const state = {};
    Object.defineProperty(state, "studioWorkspaceReturn", {
      get() {
        throw new Error("must not execute");
      },
    });
    expect(studioWorkspaceReturnHref(state, route)).toBeNull();
  });

  it("keeps remix identity in DCC entry and return receipts", () => {
    const canvasRoute = parseStudioWorkspaceRoute({
      pathname: "/studio/remix/source-1/animation",
    });
    const dccRoute = parseStudioWorkspaceRoute({
      pathname: "/studio/remix/source-1/3d/dcc/model",
    });
    if (!canvasRoute.valid || !dccRoute.valid) throw new Error("fixture route failed");
    const state = createStudioDccNavigationState(canvasRoute, {
      key: "remix-entry",
      pathname: "/studio/remix/source-1/animation",
      search: "?room=team-2",
    });
    expect(state.studioWorkspaceReturn.remixSourceWorkId).toBe("source-1");
    expect(studioWorkspaceReturnHref(state, dccRoute)).toBe(
      "/studio/remix/source-1/animation?room=team-2",
    );
    const otherDccRoute = parseStudioWorkspaceRoute({
      pathname: "/studio/remix/source-2/3d/dcc/model",
    });
    if (!otherDccRoute.valid) throw new Error("fixture route failed");
    expect(studioWorkspaceReturnHref(state, otherDccRoute)).toBeNull();
  });
});

describe("canvas return preserves manuscript identity", () => {
  it.each([
    // Webtoon now uses the canvas surface; returning retains its task tools.
    ["/studio/p/project-1/d/document-1", "comic", "comic"],
    ["/studio/p/project-1/d/document-1", "animation", "draw"],
    ["/studio/p/project-1/d/document-1", "3d", "draw"],
    ["/studio/p/project-1/d/document-1", "design", "design"],
    ["/studio/draft/draft-1", "storyboard", "draw"],
  ])("keeps %s when closing %s", (pathname, workspace, expectedWorkspace) => {
    const search = `?workspace=${workspace}&room=team-a&focus=page-1`;
    const parsed = parseStudioWorkspaceRoute({ pathname, search });
    if (!parsed.valid) throw new Error("Invalid route fixture");
    // Local-source resolution removes the remote id, not the document identity.
    const href = studioCanvasReturnHref({ ...parsed, workId: null }, search);
    const result = new URL(href, "https://studio.invalid");
    expect(result.pathname).toBe(pathname);
    expect(result.searchParams.get("workspace")).toBe(expectedWorkspace);
    expect(result.searchParams.get("room")).toBe("team-a");
    expect(result.searchParams.get("focus")).toBe("page-1");
    expect(shouldPreserveStudioRouteLifecycle({ pathname, search }, result)).toBe(true);
  });

  it.each([
    ["/studio/work/server-work/comic", "/studio/work/server-work/canvas"],
    ["/studio/remix/source-work/animation", "/studio/remix/source-work/canvas"],
    ["/studio/comic", "/studio/canvas"],
  ])("retains legacy authority for %s", (pathname, expected) => {
    const parsed = parseStudioWorkspaceRoute({ pathname });
    if (!parsed.valid) throw new Error("Invalid route fixture");
    expect(studioCanvasReturnHref(parsed, "?room=team-a")).toBe(`${expected}?room=team-a`);
  });
});


describe("editor surface navigation boundary", () => {
  it.each([
    "/studio/p/project-a/d/document-a?workspace=comic",
    "/studio/draft/drawing-a?workspace=comic",
    "/studio/work/server-a/comic",
    "/studio/remix/source-a/comic",
    "/studio/comic",
  ])("preserves canvas return semantics for %s", (href) => {
    const url = new URL(href, "https://studio.test");
    const route = parseStudioWorkspaceRoute(url);
    expect(route.valid).toBe(true);
    if (!route.valid) throw new Error("Invalid navigation fixture");
    expect(studio2dSurfaceNavigationHref(route, "canvas", "?room=team-a"))
      .toBe(studioCanvasReturnHref(route, "?room=team-a"));
  });

  it.each(["brushes", "bg3d", "poser", "character", "animation", "comic"] as const)(
    "keeps the existing non-canvas %s navigation", (surface) => {
      const route = parseStudioWorkspaceRoute({ pathname: "/studio/work/server-a/canvas" });
      if (!route.valid) throw new Error("Invalid server fixture");
      expect(studio2dSurfaceNavigationHref(route, surface, "?room=team-a"))
        .toBe(studio2dHref({ workId: "server-a", surface, search: "?room=team-a" }));
    },
  );

  it("새 원고에서 VRM 포저를 열고 닫으면 같은 방의 캔버스로 돌아온다", () => {
    const draft = parseStudioWorkspaceRoute({ pathname: "/studio/canvas" });
    if (!draft.valid) throw new Error("원고 경로 오류");
    const href = studio2dSurfaceNavigationHref(draft, "poser", "?room=team-a");
    expect(href).toBe("/studio/canvas/poser?room=team-a");
    const poser = parseStudioWorkspaceRoute(new URL(href, "https://studio.test"));
    if (!poser.valid) throw new Error("포저 경로 오류");
    expect(studio2dSurfaceNavigationHref(poser, "canvas", "?room=team-a")).toBe("/studio/canvas?room=team-a");
  });

  it("리믹스 문서의 기존 3D 배경 경로를 유지한다", () => {
    const route = parseStudioWorkspaceRoute({ pathname: "/studio/remix/source-a/canvas" });
    if (!route.valid) throw new Error("Invalid remix fixture");
    expect(studio2dSurfaceNavigationHref(route, "bg3d", "?room=team-a"))
      .toBe("/studio/remix/source-a/bg3d?room=team-a");
  });
});

describe("원고에서 연 3D 도구의 복귀 주소", () => {
  const pathname = "/studio/draft/return-a";
  const search = "?workspace=design&room=team-a&page=two&filter=ink";
  const origin = { pathname, search, hash: "#panel-4", key: "first", state: null };
  const routeFor = (href: string) => {
    const url = new URL(href, "http://localhost");
    const route = parseStudioWorkspaceRoute(url);
    if (!route.valid) throw new Error(route.errorCode);
    return route;
  };

  it.each(["poser", "character", "bg3d"] as const)("%s 닫기·도구 교체가 같은 원고의 원래 모드와 단서를 보존한다", (target) => {
    const open = studioDocumentToolNavigation(routeFor(pathname + search), target, origin);
    expect(open.href).toContain("#panel-4");
    expect(open.switchTool).toBe(false);
    const panel = new URL(open.href, "http://localhost");
    const panelLocation = { pathname, search: panel.search, hash: panel.hash, key: "second", state: open.state };
    const panelRoute = routeFor(open.href);
    const returned = new URL(studioWorkspaceReturnHref(open.state, panelRoute)!, "http://localhost");
    expect(returned.pathname).toBe(pathname);
    expect(returned.hash).toBe(origin.hash);
    expect([...returned.searchParams].sort()).toEqual([...new URLSearchParams(search)].sort());
    expect(studioDocumentToolNavigation(panelRoute, "canvas", panelLocation).back).toBe(true);
    expect(studioDocumentToolNavigation(panelRoute, "character", panelLocation)).toMatchObject({ switchTool: true, state: open.state });
    expect(studioWorkspaceReturnHref(open.state, routeFor(open.href.replace("return-a", "return-b")))).toBeNull();
    const deepLink = studioDocumentToolNavigation(panelRoute, "canvas", { ...panelLocation, state: null });
    expect(deepLink.back).toBe(false);
    expect(new URL(deepLink.href, "http://localhost").searchParams.get("workspace")).toBe("draw");
  });
});
