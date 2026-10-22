import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_STUDIO_WORK_MODE_STATE,
  resolveStudioWorkMode,
  suggestStudioWorkModeForStage,
} from "../../studio-work-mode";
import {
  currentStudioEpisodeStageId,
  loadStudioEpisodeStageId,
  type StudioEpisodeStageStateLike,
} from "./studio-episode-stage-source";

const CONTEXT = { productionProjectId: "proj-1", episodeId: "ep-7" } as const;

function states(
  ...entries: readonly (readonly [string, string])[]
): readonly StudioEpisodeStageStateLike[] {
  return entries.map(([id, status]) => ({ id, status }));
}

/** 공개 경계 대체재: 지정한 회차만 aggregate에 있고, 나머지는 없는 것으로 답한다. */
function depsWith(currentId: string | null) {
  return {
    getProductionProject: vi.fn(() =>
      Promise.resolve({ aggregate: { marker: "aggregate" } }),
    ),
    episodeStageForEpisode: vi.fn((_aggregate: never, episodeId: string) => {
      if (episodeId !== CONTEXT.episodeId) return null;
      return {
        states: states(
          ["plan", "done"],
          ["storyboard", currentId === "storyboard" ? "current" : "todo"],
          ["art", currentId === "art" ? "current" : "todo"],
          ["lettering", currentId === "lettering" ? "current" : "todo"],
          ["review", currentId === "review" ? "current" : "todo"],
          ["publish", "todo"],
          ["operate", "todo"],
        ),
      };
    }),
  };
}

describe("currentStudioEpisodeStageId", () => {
  it("returns the current stage id verbatim and nothing else", () => {
    expect(
      currentStudioEpisodeStageId(states(["plan", "done"], ["art", "current"], ["review", "todo"])),
    ).toBe("art");
  });

  it("returns null when no stage is current instead of inventing one", () => {
    expect(currentStudioEpisodeStageId(states(["publish", "done"], ["operate", "todo"]))).toBeNull();
    expect(currentStudioEpisodeStageId(states(["plan", "unknown"]))).toBeNull();
    expect(currentStudioEpisodeStageId([])).toBeNull();
    expect(currentStudioEpisodeStageId(null)).toBeNull();
    expect(currentStudioEpisodeStageId(undefined)).toBeNull();
  });
});

describe("loadStudioEpisodeStageId (canonical composition)", () => {
  it("derives the requested episode through the public boundary and keeps its stage verbatim", async () => {
    const deps = depsWith("storyboard");
    await expect(loadStudioEpisodeStageId(CONTEXT, deps)).resolves.toBe("storyboard");
    expect(deps.getProductionProject).toHaveBeenCalledWith("proj-1");
    expect(deps.episodeStageForEpisode).toHaveBeenCalledWith({ marker: "aggregate" }, "ep-7");
  });

  it("does not substitute another episode when the aggregate lacks the requested one", async () => {
    const deps = depsWith("storyboard");
    await expect(
      loadStudioEpisodeStageId({ productionProjectId: "proj-1", episodeId: "ep-missing" }, deps),
    ).resolves.toBeNull();
  });

  it("returns null when the aggregate read fails (no suggestion, no error surface)", async () => {
    const deps = {
      getProductionProject: vi.fn(() => Promise.reject(new Error("network"))),
      episodeStageForEpisode: vi.fn(() => null),
    };
    await expect(loadStudioEpisodeStageId(CONTEXT, deps)).resolves.toBeNull();
    expect(deps.episodeStageForEpisode).not.toHaveBeenCalled();
  });
});

describe("stage suggestion actually surfaces from the derived stage", () => {
  it("storyboard stage: follow-stage resolution adopts the storyboard mode", async () => {
    const stage = await loadStudioEpisodeStageId(CONTEXT, depsWith("storyboard"));
    expect(stage).toBe("storyboard");
    // useStudioWorkModePreference의 도출 경로 그대로: 수동 선택이 없고 followStage면 제안 모드가 적용 모드다.
    expect(resolveStudioWorkMode(DEFAULT_STUDIO_WORK_MODE_STATE, stage)).toBe("storyboard");
    expect(suggestStudioWorkModeForStage(stage)).toBe("storyboard");
  });

  it("storyboard stage: with follow-stage off, the suggestion differs from the saved mode (banner case)", () => {
    const notFollowing = { ...DEFAULT_STUDIO_WORK_MODE_STATE, followStage: false };
    const applied = resolveStudioWorkMode(notFollowing, "storyboard");
    const suggested = suggestStudioWorkModeForStage("storyboard");
    expect(applied).toBe("all");
    expect(suggested).toBe("storyboard");
    expect(suggested).not.toBe(applied);
  });

  it("review stage maps to the finish mode through the canonical suggest function only", async () => {
    const stage = await loadStudioEpisodeStageId(CONTEXT, depsWith("review"));
    expect(stage).toBe("review");
    expect(resolveStudioWorkMode(DEFAULT_STUDIO_WORK_MODE_STATE, stage)).toBe("finish");
  });

  it("art stage stays verbatim: no invented draw/color split, suggestion falls back to all", async () => {
    const stage = await loadStudioEpisodeStageId(CONTEXT, depsWith("art"));
    expect(stage).toBe("art");
    // 작화는 세분 단계(선화·채색·후보정)를 협업 상태만으로 가를 수 없어 정본 suggest가 전체로 둔다.
    expect(suggestStudioWorkModeForStage(stage)).toBe("all");
    expect(resolveStudioWorkMode(DEFAULT_STUDIO_WORK_MODE_STATE, stage)).toBe("all");
  });

  it("null stage keeps the pre-connection behavior exactly: saved mode applies, no suggestion", () => {
    expect(resolveStudioWorkMode(DEFAULT_STUDIO_WORK_MODE_STATE, null)).toBe("all");
    expect(resolveStudioWorkMode(DEFAULT_STUDIO_WORK_MODE_STATE, undefined)).toBe("all");
    // 수동 선택은 단계 유무와 무관하게 항상 우선한다(기존 게이팅 무변경 근거).
    const picked = { mode: "lettering" as const, followStage: true, userPicked: true };
    expect(resolveStudioWorkMode(picked, "storyboard")).toBe("lettering");
    expect(resolveStudioWorkMode(picked, null)).toBe("lettering");
  });
});
