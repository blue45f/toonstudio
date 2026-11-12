import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isImmersiveMobileRoute } from "./immersive-mobile-route";
import { resolveShellChrome, usesFloatingServiceNotice } from "../shell-chrome-policy";

describe("isImmersiveMobileRoute", () => {
  it.each(["/studio/canvas", "/studio/character", "/studio/bg3d", "/studio/work/1", "/studio/work/1/canvas", "/studio/work/1/brush-lab", "/studio/remix/abc/brush-lab"])(
    "treats %s as a Studio-owned mobile chrome route",
    (pathname) => {
      expect(isImmersiveMobileRoute(pathname)).toBe(true);
    }
  );

  it("실제 편집기에서는 늦은 서비스 알림이 캔버스 좌표를 밀지 않는다", () => {
    const source = readFileSync("apps/web/src/app/AppShell.tsx", "utf8");
    expect(source).toContain("<ServiceDegradedBanner immersive={usesFloatingServiceNotice(normalizedPath, shellChrome, {");
    expect(source).toContain("studioWorkspace: isStudioWorkspaceRoutePathname(pathname)");
    const editor = resolveShellChrome({ pathname: "/studio/canvas", normalizedPath: "/studio/canvas", hasTaskRoute: false, protectedCampus: false });
    expect(usesFloatingServiceNotice("/studio/canvas", editor, { studioWorkspace: true })).toBe(true);
  });

  it.each(["/", "/create", "/studio", "/studio/", "/studio/projects", "/studio/new", "/studio-guide", "/studios"])(
    "keeps global mobile controls on %s",
    (pathname) => {
      expect(isImmersiveMobileRoute(pathname)).toBe(false);
    }
  );
});
