// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  STUDIO_VIRTUAL_STAGE_STORAGE_KEY,
  applyStudioVirtualStageSearch,
  readStudioVirtualPreferredEngineMode,
  readStudioVirtualStageMode,
  resolveStudioVirtualStageKind,
  writeStudioVirtualPreferredEngineMode,
} from "./studio-virtual-space-stage-mode";

beforeEach(() => {
  localStorage.clear();
});

describe("studio-virtual-space-stage-mode", () => {
  it("URL 쿼리에 명시 지정이 없을 때 선호 엔진 모드를 저장·복원한다", () => {
    expect(readStudioVirtualPreferredEngineMode()).toBe("2d");
    expect(readStudioVirtualStageMode("")).toBe("2d");

    expect(writeStudioVirtualPreferredEngineMode("3d")).toBe(true);
    expect(localStorage.getItem(STUDIO_VIRTUAL_STAGE_STORAGE_KEY)).toBe("3d");
    expect(readStudioVirtualPreferredEngineMode()).toBe("3d");
    expect(readStudioVirtualStageMode("")).toBe("3d");

    // URL 쿼리에 명시적 ?stage= 지정이 있으면 저장된 선호보다 URL 쿼리가 우선한다.
    expect(readStudioVirtualStageMode("?stage=2d")).toBe("2d");
    expect(readStudioVirtualStageMode("?stage=legacy")).toBe("legacy");
    expect(readStudioVirtualPreferredEngineMode("?stage=2d")).toBe("2d");

    expect(writeStudioVirtualPreferredEngineMode("2d")).toBe(true);
    expect(readStudioVirtualPreferredEngineMode()).toBe("2d");
    expect(readStudioVirtualStageMode("")).toBe("2d");
  });

  it("applyStudioVirtualStageSearch가 stage 쿼리를 반영하고 ?stage=legacy 고착을 해제한다", () => {
    expect(applyStudioVirtualStageSearch("", "3d")).toBe("?stage=3d");
    expect(applyStudioVirtualStageSearch("", "2d")).toBe("");

    // ?stage=legacy 상태에서 3D로 전환하면 ?stage=3d가 되고, 2D로 전환하면 stage 쿼리가 제거된다.
    const fromLegacyTo3d = applyStudioVirtualStageSearch("?stage=legacy", "3d");
    expect(fromLegacyTo3d).toBe("?stage=3d");
    expect(resolveStudioVirtualStageKind({ engineMode: "3d", authoringMode: false, search: fromLegacyTo3d })).toBe("three");

    const fromLegacyTo2d = applyStudioVirtualStageSearch("?stage=legacy", "2d");
    expect(fromLegacyTo2d).toBe("");
    expect(resolveStudioVirtualStageKind({ engineMode: "2d", authoringMode: false, search: fromLegacyTo2d })).toBe("office2d");

    // 다른 쿼리 파라미터는 보존한다.
    expect(applyStudioVirtualStageSearch("?place=skyport&stage=legacy", "2d")).toBe("?place=skyport");
    expect(applyStudioVirtualStageSearch("?place=skyport&stage=legacy", "3d")).toBe("?place=skyport&stage=3d");
  });
});
