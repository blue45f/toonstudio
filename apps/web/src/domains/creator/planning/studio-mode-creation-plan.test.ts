import { describe, expect, it } from "vitest";

import { buildStudioModeLaunchHref, resolveStudioModeCreationPlan } from "../studio-mode-creation-plan";
import { defaultStudioAppSettings } from "../studio-app-settings";
import { applyStudioLaunchDensity, readStudioLaunchDensity } from "../studio-launch-mode";
import { createStudioWorkspaceDefaultState } from "../studio-workspaces";
import { applyStudioTaskWorkspace, studioTaskWorkspaceId } from "../studio-task-workspace";
import { studioDrawingClarityEligible } from "../studio-cuttoon-editor/StudioDrawingClarityPolicy";

const EXPECTED = {
  webtoon: ["comic", "draw"],
  illustration: ["draw", "draw"],
  image: ["image", "select"],
  design: ["design", "select"],
  slides: ["slides", "select"],
  storyboard: ["storyboard", "draw"],
  "three-d": ["3d", "select"],
  animation: ["animation", "select"],
} as const;

describe("studio mode creation plan", () => {
  it.each(Object.entries(EXPECTED))("routes %s into its own workspace and primary tool", (kind, expected) => {
    const plan = resolveStudioModeCreationPlan(kind as keyof typeof EXPECTED);
    expect(plan.document.workspace).toBe(expected[0]);
    expect(plan.launch.startTool).toBe(expected[1]);
    expect(plan.document.width).toBeGreaterThan(0);
    expect(plan.document.height).toBeGreaterThan(0);
  });

  it("replaces generic launch hints while preserving unrelated query state", () => {
    const plan = resolveStudioModeCreationPlan("three-d", "3d-pose");
    const href = buildStudioModeLaunchHref(
      { href: "/studio/p/p1/d/d1?workspace=draw&room=team-a&uiMode=focus&startTool=draw" },
      plan,
    );
    const [pathname, rawSearch = ""] = href.split("?", 2);
    const search = new URLSearchParams(rawSearch);
    expect(pathname).toBe("/studio/p/p1/d/d1");
    expect(search.get("workspace")).toBe("3d");
    expect(search.get("room")).toBe("team-a");
    expect(search.get("uiMode")).toBe("basic");
    expect(search.get("startTool")).toBe("select");
  });
});


describe("새 빠른 스케치의 기본 화면 진입", () => {
  function sketchHref() {
    return buildStudioModeLaunchHref({ href: "/studio/p/new-project/d/new-document?workspace=draw" },
      resolveStudioModeCreationPlan("illustration", "quick-sketch"));
  }

  it("자동 집중 모드를 붙이지 않고 새 기본 단순 그리기 화면에 진입한다", () => {
    const plan = resolveStudioModeCreationPlan("illustration", "quick-sketch");
    expect(plan.launch.uiMode).toBeNull();
    const search = new URL(sketchHref(), "http://local.test").search;
    expect(new URLSearchParams(search).get("workspace")).toBe("draw");
    expect(new URLSearchParams(search).get("startTool")).toBe("draw");
    expect(new URLSearchParams(search).has("uiMode")).toBe(false);
    const launchDensity = readStudioLaunchDensity(search);
    expect(launchDensity).toBeNull();
    const settings = defaultStudioAppSettings();
    const applied = applyStudioLaunchDensity(settings, launchDensity);
    expect(applied).toBe(settings);
    expect(applied.general.densityMode).toBe("simple");
    const workspaceId = studioTaskWorkspaceId("draw", applied.general.densityMode, search);
    expect(workspaceId).toBe("lineart");
    const state = applyStudioTaskWorkspace(createStudioWorkspaceDefaultState(null), workspaceId);
    expect(studioDrawingClarityEligible({ baseline: { ownerScope: "guest", source: "default", state },
      ownerScope: "guest", densityMode: applied.general.densityMode, workMode: "all", search, toolbarConfigured: false })).toBe(true);
  });

  it.each(["simple", "focus", "full"] as const)("저장한 %s 선택을 새 스케치 URL로 덮어쓰지 않는다", (densityMode) => {
    const defaults = defaultStudioAppSettings();
    const saved = { ...defaults, general: { ...defaults.general, densityMode } };
    const search = new URL(sketchHref(), "http://local.test").search;
    const applied = applyStudioLaunchDensity(saved, readStudioLaunchDensity(search));
    expect(applied).toBe(saved);
    expect(applied.general.densityMode).toBe(densityMode);
  });

  it.each(["basic", "focus", "full"])("목적지에서 명시한 %s와 연결 문맥은 그대로 둔다", (uiMode) => {
    const href = buildStudioModeLaunchHref({ href: `/studio/p/p1/d/d1?workspace=draw&uiMode=${uiMode}&room=keep&format=landscape` },
      resolveStudioModeCreationPlan("illustration", "quick-sketch"));
    const search = new URL(href, "http://local.test").searchParams;
    expect(search.get("uiMode")).toBe(uiMode);
    expect(search.get("room")).toBe("keep");
    expect(search.get("format")).toBe("landscape");
    expect(search.get("startTool")).toBe("draw");
  });

  it("다른 그림 서식의 기존 밀도 계획은 변경하지 않는다", () => {
    const plan = resolveStudioModeCreationPlan("illustration", "illustration-portrait");
    expect(plan.launch.uiMode).not.toBeNull();
    const href = buildStudioModeLaunchHref({ href: "/studio/p/p1/d/d1" }, plan);
    expect(new URL(href, "http://local.test").searchParams.get("uiMode")).toBe(plan.launch.uiMode);
  });
});
