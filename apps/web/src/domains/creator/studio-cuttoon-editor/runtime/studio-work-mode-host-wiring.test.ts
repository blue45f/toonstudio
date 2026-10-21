import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { STUDIO_UI_CHROME_REGIONS } from "../../studio-ui-density";
import { STUDIO_WORK_MODES, STUDIO_WORK_MODE_EXPOSURE } from "../../studio-work-mode";

/**
 * 호스트 배선 계약 (A3) — 작업 모드는 모델·모드 바만으로는 부족하고, 호스트가
 * 모드 상태와 합성 게이트(uiChromeExposure)를 실제 렌더 트리에 전달해 각
 * 영역의 마운트 게이트가 참조해야 성립한다. 이 테스트는 그 배선이 사라지면
 * 실패한다 (파일 존재가 아니라 소비 지점을 고정한다).
 */
const HOST = "apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx";
const CHROME = "apps/web/src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorChrome.tsx";
const WORKSPACE = "apps/web/src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorWorkspace.tsx";
const TOOL_BELT_CONTENT = "apps/web/src/domains/creator/StudioToolBeltContent.tsx";
const CREATE_MODE_GROUPS = "apps/web/src/domains/creator/StudioToolBeltCreateModeGroups.tsx";
const PREFERENCES_RUNTIME =
  "apps/web/src/domains/creator/studio-cuttoon-editor/runtime/useStudioPreferencesRuntime.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** 어떤 모드에서든 folded가 되는 영역 — 반드시 실제 마운트 게이트가 있어야 한다. */
const FOLDED_SOMEWHERE = STUDIO_UI_CHROME_REGIONS.filter((region) =>
  STUDIO_WORK_MODES.some((mode) => STUDIO_WORK_MODE_EXPOSURE[mode][region] === "folded"),
);

describe("studio work-mode host wiring", () => {
  it("preferences runtime composes and exposes the work-mode gate", () => {
    const runtime = read(PREFERENCES_RUNTIME);
    expect(runtime).toContain("useStudioWorkModePreference");
    expect(runtime).toContain("uiChromeExposure");
    expect(runtime).toContain("workMode");
  });

  it("host passes workMode + uiChromeExposure into the editor view session", () => {
    const host = read(HOST);
    expect(host).toContain("workMode={workMode}");
    expect(host).toContain("setWorkMode={setWorkMode}");
    expect(host).toContain("suggestedWorkMode={suggestedWorkMode}");
    expect(host).toContain("uiChromeExposure={uiChromeExposure}");
  });

  it("chrome mounts the work-mode bar and forwards workMode to the tool belt", () => {
    const chrome = read(CHROME);
    expect(chrome).toContain("<StudioWorkModeBar");
    expect(chrome).toContain("mode={workMode}");
    expect(chrome).toContain("workMode={workMode}");
  });

  it("every region folded in some mode has a real mount gate", () => {
    const groups = read(CREATE_MODE_GROUPS);
    const workspace = read(WORKSPACE);
    for (const region of FOLDED_SOMEWHERE) {
      if (region === "tool-rail") {
        expect(workspace, region).toContain('uiChromeExposure("tool-rail")');
      } else {
        expect(groups, region).toContain(`allows("${region}")`);
      }
    }
    expect(groups).toContain("studioWorkModeAllowsRegion(workMode, region, workFoldExpanded)");
  });

  it("panel regions and quick actions also consult the composed gate", () => {
    const workspace = read(WORKSPACE);
    expect(workspace).toContain('uiChromeExposure("page-strip")');
    expect(workspace).toContain('uiChromeExposure("left-panel")');
    expect(workspace).toContain('uiChromeExposure("right-panel")');
    const belt = read(TOOL_BELT_CONTENT);
    expect(belt).toContain('studioWorkModeAllowsRegion(props.workMode ?? "all", "quick-actions"');
  });

  it("folded strips keep an expand affordance that reuses the density expansion", () => {
    const workspace = read(WORKSPACE);
    expect(workspace).toContain("data-studio-tool-rail-folded");
    expect(workspace).toContain("data-studio-page-list-folded");
    expect(workspace).toContain("data-studio-inspector-folded");
    expect(workspace.match(/setUiAdvancedToolsExpanded\?\.\(true\)/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
