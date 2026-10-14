import { describe, expect, it } from "vitest";

import {
  STUDIO_WORK_MODES,
  STUDIO_WORK_MODE_EXPOSURE,
  STUDIO_WORK_MODE_PIPELINE,
  loadStudioWorkModeState,
  nextStudioWorkMode,
  normalizeStudioWorkModeState,
  pickStudioWorkMode,
  resolveStudioWorkMode,
  saveStudioWorkModeState,
  studioWorkModeExposure,
  studioWorkModeOpenRegions,
  studioWorkModePrimaryRegions,
  suggestStudioWorkModeForStage,
  type StudioWorkModeStorage,
} from "./studio-work-mode";
import type { StudioUiChromeRegion } from "./studio-ui-density";

const ALL_REGIONS: readonly StudioUiChromeRegion[] = [
  "toolbar-assets",
  "toolbar-cut",
  "toolbar-draw",
  "toolbar-reference",
  "toolbar-scene",
  "toolbar-style",
  "toolbar-ai",
  "toolbar-insert",
  "left-panel",
  "right-panel",
  "page-strip",
  "status-rail",
  "tool-rail",
  "quick-actions",
];

function memoryStorage(): StudioWorkModeStorage & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
  };
}

describe("studio work mode exposure", () => {
  it("모든 모드가 전 영역을 빠짐없이 분류한다", () => {
    for (const mode of STUDIO_WORK_MODES) {
      const record = STUDIO_WORK_MODE_EXPOSURE[mode];
      expect(Object.keys(record).sort()).toEqual([...ALL_REGIONS].sort());
    }
  });

  it("전체 모드는 아무것도 접지 않는다 (기존 동작과 동일)", () => {
    for (const region of ALL_REGIONS) {
      expect(studioWorkModeExposure("all", region)).toBe("visible");
    }
    expect(studioWorkModeOpenRegions("all")).toHaveLength(ALL_REGIONS.length);
    expect(studioWorkModePrimaryRegions("all")).toHaveLength(0);
  });

  it("단계 모드는 자기 단계 도구를 primary로 두고 남의 단계 도구를 접는다", () => {
    expect(studioWorkModeExposure("storyboard", "toolbar-cut")).toBe("primary");
    expect(studioWorkModeExposure("storyboard", "toolbar-draw")).toBe("folded");
    expect(studioWorkModeExposure("draw", "toolbar-draw")).toBe("primary");
    expect(studioWorkModeExposure("color", "toolbar-style")).toBe("primary");
    expect(studioWorkModeExposure("post", "toolbar-style")).toBe("primary");
    expect(studioWorkModeExposure("post", "right-panel")).toBe("primary");
    expect(studioWorkModeExposure("post", "toolbar-insert")).toBe("folded");
    expect(studioWorkModeExposure("post", "toolbar-reference")).not.toBe("folded");
    expect(studioWorkModeExposure("lettering", "toolbar-insert")).toBe("primary");
    expect(studioWorkModeExposure("lettering", "toolbar-draw")).toBe("folded");
    expect(studioWorkModeExposure("finish", "toolbar-ai")).toBe("primary");
  });

  it("어느 모드에서도 페이지 띠와 상태 레일은 접지 않는다 (위치 감각 유지)", () => {
    for (const mode of STUDIO_WORK_MODE_PIPELINE) {
      expect(studioWorkModeExposure(mode, "page-strip")).not.toBe("folded");
      expect(studioWorkModeExposure(mode, "status-rail")).not.toBe("folded");
    }
  });

  it("primary는 항상 open 집합에 포함된다", () => {
    for (const mode of STUDIO_WORK_MODES) {
      const open = new Set(studioWorkModeOpenRegions(mode));
      for (const region of studioWorkModePrimaryRegions(mode)) {
        expect(open.has(region)).toBe(true);
      }
    }
  });
});

describe("studio work mode flow", () => {
  it("다음 모드는 파이프라인 순서를 따르고 마감에서 끝난다", () => {
    expect(nextStudioWorkMode("all")).toBe("storyboard");
    expect(nextStudioWorkMode("storyboard")).toBe("draw");
    expect(nextStudioWorkMode("draw")).toBe("color");
    expect(nextStudioWorkMode("color")).toBe("post");
    expect(nextStudioWorkMode("post")).toBe("lettering");
    expect(nextStudioWorkMode("lettering")).toBe("finish");
    expect(nextStudioWorkMode("finish")).toBeNull();
  });

  it("파이프라인 단계가 작업 모드로 제안된다", () => {
    expect(suggestStudioWorkModeForStage("storyboard")).toBe("storyboard");
    expect(suggestStudioWorkModeForStage("sketch")).toBe("draw");
    expect(suggestStudioWorkModeForStage("lineart")).toBe("draw");
    expect(suggestStudioWorkModeForStage("color")).toBe("color");
    expect(suggestStudioWorkModeForStage("post")).toBe("post");
    expect(suggestStudioWorkModeForStage("후보정")).toBe("post");
    expect(suggestStudioWorkModeForStage("lettering")).toBe("lettering");
    expect(suggestStudioWorkModeForStage("review")).toBe("finish");
    expect(suggestStudioWorkModeForStage("planning")).toBe("all");
    expect(suggestStudioWorkModeForStage(undefined)).toBe("all");
    expect(suggestStudioWorkModeForStage("모르는 단계")).toBe("all");
  });
});

describe("studio work mode state", () => {
  it("저장·로드 라운드트립이 유지된다", () => {
    const storage = memoryStorage();
    const picked = pickStudioWorkMode(loadStudioWorkModeState(storage), "color");
    expect(saveStudioWorkModeState(storage, picked)).toBe(true);
    const loaded = loadStudioWorkModeState(storage);
    expect(loaded.mode).toBe("color");
    expect(loaded.userPicked).toBe(true);
  });

  it("손상된 저장값은 전체 모드 기본값으로 복원된다", () => {
    expect(normalizeStudioWorkModeState(null).mode).toBe("all");
    expect(normalizeStudioWorkModeState({ mode: "이상한값" }).mode).toBe("all");
    expect(normalizeStudioWorkModeState("문자열").mode).toBe("all");
    const storage = memoryStorage();
    storage.setItem("toonstudio-studio-work-mode:v1", "{깨진 json");
    expect(loadStudioWorkModeState(storage).mode).toBe("all");
  });

  it("수동 선택이 단계 제안보다 우선한다", () => {
    const storage = memoryStorage();
    const picked = pickStudioWorkMode(loadStudioWorkModeState(storage), "lettering");
    expect(resolveStudioWorkMode(picked, "color")).toBe("lettering");
  });

  it("수동 선택 전에는 followStage 제안이 기본 모드가 된다", () => {
    const fresh = loadStudioWorkModeState(memoryStorage());
    expect(fresh.userPicked).toBe(false);
    expect(resolveStudioWorkMode(fresh, "color")).toBe("color");
    expect(resolveStudioWorkMode({ ...fresh, followStage: false }, "color")).toBe("all");
  });

  it("스토리지가 없어도 동작한다", () => {
    expect(loadStudioWorkModeState(null).mode).toBe("all");
    expect(saveStudioWorkModeState(null, loadStudioWorkModeState(null))).toBe(false);
  });
});
