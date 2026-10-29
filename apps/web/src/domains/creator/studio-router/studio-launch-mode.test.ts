import { describe, expect, it } from "vitest";

import {
  applyStudioLaunchDensity,
  preserveStudioLaunchDensity,
  readStudioLaunchDensity,
  readStudioLaunchPrimaryTool,
  STUDIO_LAUNCH_DENSITY_BY_UI_MODE,
} from "../studio-launch-mode";

describe("studio launch density mapping (BLUEPRINT §4.1: existing uiMode mapping, pinned)", () => {
  it("declares the full uiMode alias table in one place", () => {
    expect(STUDIO_LAUNCH_DENSITY_BY_UI_MODE).toEqual({
      focus: "focus",
      simple: "focus",
      basic: "simple",
      standard: "simple",
      full: "full",
      studio: "full",
    });
  });

  it("maps each declared alias and rejects anything else", () => {
    expect(readStudioLaunchDensity("?uiMode=focus")).toBe("focus");
    // Legacy alias: uiMode=simple has always launched the focused canvas.
    expect(readStudioLaunchDensity("?uiMode=simple")).toBe("focus");
    expect(readStudioLaunchDensity("?uiMode=basic")).toBe("simple");
    expect(readStudioLaunchDensity("?uiMode=standard")).toBe("simple");
    expect(readStudioLaunchDensity("?uiMode=full")).toBe("full");
    expect(readStudioLaunchDensity("?uiMode=studio")).toBe("full");
    expect(readStudioLaunchDensity("?uiMode=expert")).toBeNull();
    expect(readStudioLaunchDensity("?uiMode=constructor")).toBeNull();
    expect(readStudioLaunchDensity("?uiMode=toString")).toBeNull();
    expect(readStudioLaunchDensity("?uiMode=__proto__")).toBeNull();
    expect(readStudioLaunchDensity("")).toBeNull();
    expect(readStudioLaunchDensity("?other=full")).toBeNull();
  });

  it("treats a repeated uiMode as no hint at all", () => {
    expect(readStudioLaunchDensity("?uiMode=full&uiMode=focus")).toBeNull();
  });

  it("applies an explicit launch density once and leaves other settings untouched", () => {
    const settings = { general: { densityMode: "simple" as const }, other: 1 };
    const applied = applyStudioLaunchDensity(settings, "full");
    expect(applied.general.densityMode).toBe("full");
    expect(applied.other).toBe(1);
    expect(applyStudioLaunchDensity(settings, null)).toBe(settings);
    expect(applyStudioLaunchDensity(settings, "simple")).toBe(settings);
  });

  it("keeps the startTool hint behavior unchanged", () => {
    expect(readStudioLaunchPrimaryTool("?startTool=draw")).toBe("draw");
    expect(readStudioLaunchPrimaryTool("?startTool=select")).toBe("select");
    expect(readStudioLaunchPrimaryTool("?startTool=hand")).toBeNull();
    expect(readStudioLaunchPrimaryTool("?startTool=draw&startTool=select")).toBeNull();
  });

  it.each(Object.keys(STUDIO_LAUNCH_DENSITY_BY_UI_MODE))("프로젝트 단계에서 유효한 별칭 %s를 그대로 전달한다", (uiMode) => {
    const href = preserveStudioLaunchDensity("/studio/p/project-1/d/document-1?workspace=comic", `?view=script&uiMode=${uiMode}`);
    expect(href).toBe(`/studio/p/project-1/d/document-1?workspace=comic&uiMode=${uiMode}`);
    expect(readStudioLaunchDensity(href.slice(href.indexOf("?")))).toBe(readStudioLaunchDensity(`?uiMode=${uiMode}`));
  });

  it.each(["", "?uiMode=other", "?uiMode=constructor", "?uiMode=toString", "?uiMode=__proto__", "?uiMode=simple&uiMode=full"])("명시한 모드가 유효하지 않으면 저장된 사용자 선택을 유지한다: %s", (search) => {
    const href = "/studio/p/project-1/d/document-1?resume=latest";
    expect(preserveStudioLaunchDensity(href, search)).toBe(href);
  });

  it("목적지의 모드와 기존 문서 query·hash를 보존하고 출발지의 다른 정보는 복사하지 않는다", () => {
    expect(preserveStudioLaunchDensity("/studio/p/project-1/d/document-1?uiMode=full&workspace=comic", "?uiMode=simple"))
      .toBe("/studio/p/project-1/d/document-1?uiMode=full&workspace=comic");
    expect(preserveStudioLaunchDensity("/studio/p/project-1/d/document-1?resume=latest#page-2", "?view=script&room=private&uiMode=simple"))
      .toBe("/studio/p/project-1/d/document-1?resume=latest&uiMode=simple#page-2");
    expect(preserveStudioLaunchDensity("/market?project=project-1", "?uiMode=simple"))
      .toBe("/market?project=project-1");
  });
});
