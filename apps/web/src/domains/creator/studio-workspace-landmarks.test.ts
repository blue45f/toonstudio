import { describe, expect, it } from "vitest";

import {
  STUDIO_WORKSPACE_LANDMARKS,
  cycleStudioWorkspaceLandmark,
  studioWorkspaceLandmarkLabel,
  studioWorkspaceSkipLabel,
  type StudioWorkspaceLandmarkId,
} from "./studio-workspace-landmarks";

const ids: StudioWorkspaceLandmarkId[] = [
  "studio-menubar",
  "studio-canvas-workspace",
  "studio-inspector",
];

describe("studio workspace landmarks", () => {
  it("enters from the first or last visible region depending on direction", () => {
    expect(cycleStudioWorkspaceLandmark(ids, null, 1)).toBe("studio-menubar");
    expect(cycleStudioWorkspaceLandmark(ids, null, -1)).toBe("studio-inspector");
  });

  it("wraps in both directions while preserving the visible order", () => {
    expect(cycleStudioWorkspaceLandmark(ids, "studio-inspector", 1)).toBe(
      "studio-menubar",
    );
    expect(cycleStudioWorkspaceLandmark(ids, "studio-menubar", -1)).toBe(
      "studio-inspector",
    );
  });

  it("returns no target when every region is hidden", () => {
    expect(cycleStudioWorkspaceLandmark([], null, 1)).toBeNull();
  });

  it("keeps a human-readable label for announcements", () => {
    expect(studioWorkspaceLandmarkLabel("studio-canvas-workspace")).toBe(
      "캔버스",
    );
  });

  it("바로가기 단추 이름은 받침에 맞는 조사를 쓴다", () => {
    const labels = STUDIO_WORKSPACE_LANDMARKS.map(({ id }) => studioWorkspaceSkipLabel(id));
    expect(labels).toEqual([
      "문서 메뉴로 이동",
      // 받침 ㄴ 으로 끝나는 이름만 "으로" 가 붙는다. 예전에는 "도구 옵션로 이동" 으로 낭독됐다.
      "도구 옵션으로 이동",
      "그리기 도구로 이동",
      "캔버스로 이동",
      // 받침 ㄹ 은 "로" 를 쓴다.
      "작업 패널로 이동",
      "캔버스 상태로 이동",
    ]);
  });
});
