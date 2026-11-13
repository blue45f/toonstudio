import { describe, expect, it } from "vitest";
import { resolveStudioRoute } from "../studio-router/studio-route-manifest";
import { shouldPreserveStudioRouteLifecycle, studioRouteStageKey } from "../studio-workspace-route";
import { studioBrushTaskLifecycleKey } from "./studio-brush-task-route";

describe("브러시 작업 페이지와 편집 인스턴스 경계", () => {
  it.each(["/studio/assets/brushes/new", "/studio/assets/brushes/brush-1/edit", "/studio/work/work-1/brush-lab", "/studio/remix/source-1/brush-lab"])("%s의 작업 전환은 실제 RouteStage 키까지 유지한다", pathname => {
    const initial = { pathname, search: "?project=p1&brushTask=presets" };
    const next = { pathname, search: "?project=p1&brushTask=edit" };
    expect(studioBrushTaskLifecycleKey(initial)).toBe(`${pathname}?project=p1`);
    expect(studioRouteStageKey(next)).toBe(studioRouteStageKey(initial));
    expect(resolveStudioRoute(next).lifecycleKey).toBe(resolveStudioRoute(initial).lifecycleKey);
    expect(shouldPreserveStudioRouteLifecycle(initial, next)).toBe(true);
    expect(shouldPreserveStudioRouteLifecycle(initial, { ...next, search: "?project=p2&brushTask=edit" })).toBe(false);
  });
  it("다른 브러시·작품·리믹스 경로와 무관한 Studio 검색 조건은 합치지 않는다", () => {
    expect(studioBrushTaskLifecycleKey({ pathname: "/studio/assets/characters/new", search: "?brushTask=edit" })).toBeNull();
    expect(shouldPreserveStudioRouteLifecycle({ pathname: "/studio/assets/brushes/a/edit" }, { pathname: "/studio/assets/brushes/b/edit" })).toBe(false);
    expect(shouldPreserveStudioRouteLifecycle({ pathname: "/studio/work/a/brush-lab" }, { pathname: "/studio/remix/a/brush-lab" })).toBe(false);
  });
});
