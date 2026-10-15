import { describe, expect, it, vi } from "vitest";

import { readCutPoseId, undoCutPoseChange, type CutPoseCarrier } from "../studio-cut-pose";

import {
  commitCutPoseChange,
  resolveCutPoseTarget,
  type StudioWebtoonAssistantCutPoseHost,
} from "./studio-webtoon-assistant-cut-pose";

import type { PageState } from "../studio-page-state";

function page(id: string, extra: Partial<PageState> & { posePresetId?: string } = {}): PageState {
  return { id, elements: [], bg: "paper", bgGrad: null, canvasH: 1200, ...extra };
}

const PAGES: readonly PageState[] = [
  page("p1"),
  page("p2", { name: "표지 컷" }),
  page("p3", { posePresetId: "xp_sprint" }),
];

/** PageState 는 posePresetId 를 선언하지 않는다 — 컷 포즈 계약의 최소 형태로 읽는다. */
function poseOf(target: PageState): string | undefined {
  const carrier: CutPoseCarrier = target;
  return readCutPoseId(carrier);
}

function hostOf(
  pages: readonly PageState[],
  currentPageId: string,
  commitPages: StudioWebtoonAssistantCutPoseHost["commitPages"],
): StudioWebtoonAssistantCutPoseHost {
  return { pages, currentPageId, commitPages };
}

describe("resolveCutPoseTarget", () => {
  it("uses the automatic page name and no pose for a plain page", () => {
    expect(resolveCutPoseTarget(PAGES, "p1")).toEqual({
      pageId: "p1",
      pageLabel: "1페이지",
      currentPoseId: null,
    });
  });

  it("prefers the name the artist gave the page", () => {
    expect(resolveCutPoseTarget(PAGES, "p2")?.pageLabel).toBe("표지 컷");
  });

  it("reads the pose that rides on the page, trimming nothing it should not", () => {
    expect(resolveCutPoseTarget(PAGES, "p3")).toEqual({
      pageId: "p3",
      pageLabel: "3페이지",
      currentPoseId: "xp_sprint",
    });
  });

  it("treats a blank or non-string stored pose as no pose", () => {
    const odd = [
      page("a", { posePresetId: "   " }),
      { ...page("b"), posePresetId: 42 } as unknown as PageState,
    ];
    expect(resolveCutPoseTarget(odd, "a")?.currentPoseId).toBeNull();
    expect(resolveCutPoseTarget(odd, "b")?.currentPoseId).toBeNull();
  });

  it("returns null when the current page is not in the list", () => {
    expect(resolveCutPoseTarget(PAGES, "missing")).toBeNull();
    expect(resolveCutPoseTarget([], "p1")).toBeNull();
  });
});

describe("commitCutPoseChange", () => {
  it("commits one immutable pages array with the pose set on the target page only", () => {
    const commit = vi.fn(() => true);
    expect(commitCutPoseChange(hostOf(PAGES, "p1", commit), "p1", "xp_kick")).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    const [next] = commit.mock.calls[0] as unknown as [PageState[]];
    expect(poseOf(next[0])).toBe("xp_kick");
    expect(next[1]).toBe(PAGES[1]);
    expect(next[2]).toBe(PAGES[2]);
    // 입력 배열과 페이지는 건드리지 않는다
    expect(PAGES[0]).not.toHaveProperty("posePresetId");
    expect(next).not.toBe(PAGES);
  });

  it("removes the stored key entirely when the pose is cleared, so the page looks like a legacy one", () => {
    const commit = vi.fn(() => true);
    commitCutPoseChange(hostOf(PAGES, "p3", commit), "p3", null);
    const [next] = commit.mock.calls[0] as unknown as [PageState[]];
    expect(next[2]).not.toHaveProperty("posePresetId");
    expect(Object.keys(next[2]).sort()).toEqual(Object.keys(PAGES[2]).filter((key) => key !== "posePresetId").sort());
  });

  it("does not commit, and counts as done, when nothing would change", () => {
    const commit = vi.fn(() => true);
    expect(commitCutPoseChange(hostOf(PAGES, "p3", commit), "p3", "xp_sprint")).toBe(true);
    expect(commitCutPoseChange(hostOf(PAGES, "p1", commit), "p1", null)).toBe(true);
    expect(commit).not.toHaveBeenCalled();
  });

  it("reports a refused commit (locked document, saving, stroke in progress) as false", () => {
    const commit = vi.fn(() => false);
    expect(commitCutPoseChange(hostOf(PAGES, "p1", commit), "p1", "xp_kick")).toBe(false);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("refuses a page that does not exist without calling the host", () => {
    const commit = vi.fn(() => true);
    expect(commitCutPoseChange(hostOf(PAGES, "p1", commit), "ghost", "xp_kick")).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });

  it("round-trips with the existing undo contract: applying then undoing returns the original pages", () => {
    let current: readonly PageState[] = PAGES;
    const commit = (next: PageState[]) => {
      current = next;
      return true;
    };
    const host = (): StudioWebtoonAssistantCutPoseHost => hostOf(current, "p3", commit);

    commitCutPoseChange(host(), "p3", "xp_kick");
    expect(poseOf(current[2])).toBe("xp_kick");

    // 패널이 쓰는 되돌리기와 같은 값 — before 로 다시 커밋한다
    const change = Object.freeze({ pageId: "p3", before: "xp_sprint", after: "xp_kick" });
    expect(poseOf(undoCutPoseChange(current, change)[2])).toBe("xp_sprint");
    commitCutPoseChange(host(), "p3", change.before);
    expect(poseOf(current[2])).toBe("xp_sprint");
  });
});
