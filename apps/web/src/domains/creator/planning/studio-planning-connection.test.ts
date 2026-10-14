import { describe, expect, it } from "vitest";

import { studioProjectSectionHref } from "../studio-project-views";
import {
  EMPTY_STORY_BIBLE_NARRATIVE,
  upsertStoryCharacterProfile,
  upsertStoryCharacterRelation,
  type StudioStoryCharacterProfile,
  type StudioStoryCharacterRelation,
} from "./studio-character-profile";
import {
  createInitialStudioProjectPlanning,
  ensureStudioProjectPlanning,
  parseStudioProjectPlanning,
  readStudioProjectPlanning,
  saveStudioEpisodePlan,
  studioPlanningStorageKey,
} from "./studio-planning-store";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("planning surfaces connect to the project story views", () => {
  it("addresses the synopsis surface at story?view=episodes and sheets at view=characters", () => {
    expect(studioProjectSectionHref("project-1", "story", "episodes"))
      .toBe("/studio/p/project-1/story?view=episodes");
    expect(studioProjectSectionHref("project-1", "story", "characters"))
      .toBe("/studio/p/project-1/story?view=characters");
  });

  it("creates an initial season with one episode plan on first open", () => {
    const storage = new MemoryStorage();
    const state = ensureStudioProjectPlanning(storage, "project-1", "2026-10-13T00:00:00.000Z");
    expect(state.season.projectId).toBe("project-1");
    expect(state.plans).toHaveLength(1);
    expect(state.plans[0]?.episodeNumber).toBe(1);
    expect(state.season.episodeOrder).toEqual([state.plans[0]?.episodeId]);
    expect(state.plans[0]?.seasonId).toBe(state.season.seasonId);
    expect(storage.getItem(studioPlanningStorageKey("project-1"))).not.toBeNull();
    // Reopening returns the persisted state instead of recreating it.
    expect(ensureStudioProjectPlanning(storage, "project-1")).toEqual(state);
  });

  it("saves a synopsis edit and reads it back with a bumped revision", () => {
    const storage = new MemoryStorage();
    const initial = ensureStudioProjectPlanning(storage, "project-1", "2026-10-13T00:00:00.000Z");
    const plan = initial.plans[0]!;
    const saved = saveStudioEpisodePlan(storage, "project-1", {
      ...plan,
      goal: "주인공이 처음으로 거짓말을 들킨다",
      synopsis: "처음. 중간. 끝.",
      emotionalArc: { from: "들뜬", to: "불안한" },
      turningPoints: ["거짓말이 들통난다"],
      cliffhanger: "문이 열린다",
    });
    expect(saved.plans[0]?.revision).toBe(plan.revision + 1);
    const reread = readStudioProjectPlanning(storage, "project-1");
    expect(reread?.plans[0]).toMatchObject({
      goal: "주인공이 처음으로 거짓말을 들킨다",
      synopsis: "처음. 중간. 끝.",
      emotionalArc: { from: "들뜬", to: "불안한" },
      cliffhanger: "문이 열린다",
    });
  });

  it("rejects planning snapshots for another project or with malformed plans", () => {
    const initial = createInitialStudioProjectPlanning("project-1", "2026-10-13T00:00:00.000Z");
    expect(parseStudioProjectPlanning(initial, "project-2")).toBeNull();
    expect(parseStudioProjectPlanning({ ...initial, plans: [{ episodeId: 3 }] }, "project-1"))
      .toBeNull();
    expect(parseStudioProjectPlanning(null)).toBeNull();
  });

  it("upserts character sheets and relations by identity", () => {
    const profile: StudioStoryCharacterProfile = {
      characterId: "char-1",
      personality: "겁이 많지만 책임감 하나로 버틴다",
      speechStyle: "말이 짧다",
      background: "",
      motivation: "동생을 지키는 것",
      signatureLines: [],
      appearanceNotes: "",
    };
    const once = upsertStoryCharacterProfile(EMPTY_STORY_BIBLE_NARRATIVE, profile);
    const revised = upsertStoryCharacterProfile(once, { ...profile, personality: "용감하다" });
    expect(revised.profiles).toHaveLength(1);
    expect(revised.profiles[0]?.personality).toBe("용감하다");

    const relation: StudioStoryCharacterRelation = {
      id: "relation:char-1:char-2:other",
      fromCharacterId: "char-1",
      toCharacterId: "char-2",
      kind: "other",
      label: "형·동생",
      note: "",
    };
    const withRelation = upsertStoryCharacterRelation(revised, relation);
    const relabeled = upsertStoryCharacterRelation(withRelation, { ...relation, label: "라이벌" });
    expect(relabeled.relations).toHaveLength(1);
    expect(relabeled.relations[0]?.label).toBe("라이벌");
    expect(relabeled.profiles).toHaveLength(1);
  });
});
