import { describe, expect, it } from "vitest";

import type { EpisodePlanWithSynopsis } from "../planning/studio-episode-synopsis";
import type { StudioStoryCharacterProfile } from "../planning/studio-character-profile";
import type { StudioStoryBeat } from "../studio-storyboard-planner";
import type { StudioStoryCharacter } from "../studio-story-bible";
import {
  addModelSheetRevision,
  emptyModelSheet,
  freezeModelSheet,
  type CharacterModelSheet,
} from "./model-sheet-freeze-model";
import type { ReviewSessionSummaryExport } from "./review-session-summary-export";
import {
  buildFrozenReferenceAttachment,
  buildStageHandoff,
  episodeCharacterIdsForHandoff,
  previousEpisodeStage,
  stageHandoffCharactersFromSheet,
  stageHandoffScenePlanInputs,
} from "./stage-handoff-model";

const FULL_PLAN: EpisodePlanWithSynopsis = {
  id: "plan-1",
  projectId: "project-1",
  seasonId: "season-1",
  episodeId: "episode-1",
  episodeNumber: 1,
  revision: 1,
  status: "draft",
  title: "1화",
  logline: "비 오는 밤, 해온이 봉투를 숨긴다.",
  openingHook: "",
  coreConflict: "",
  turningPoints: ["봉투를 숨긴다"],
  cliffhanger: "",
  goal: "봉투의 비밀을 감춘 채 밤을 넘긴다.",
  synopsis: "해온은 빗속에서 봉투를 코트 안쪽에 숨긴다. 동생이 그 장면을 목격한다.",
  emotionalArc: { from: "경계", to: "안도" },
  characterRefs: [],
  locationRefs: [],
  targetCutCount: 40,
  targetScrollHeightPx: 0,
  dialogueDensity: "medium",
  difficulty: 1,
  riskIds: [],
  narrativeRevisionRef: null,
  approvedByAssignmentIds: [],
  createdAt: "2026-10-13T00:00:00.000Z",
} as EpisodePlanWithSynopsis;

const CHARACTERS: readonly StudioStoryCharacter[] = [
  { id: "char-1", name: "해온", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
  { id: "char-2", name: "동생", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
];

const PROFILES: readonly StudioStoryCharacterProfile[] = [
  {
    characterId: "char-1",
    personality: "겁이 많지만 책임감 하나로 버틴다.",
    speechStyle: "말이 짧다.",
    background: "과거의 비밀이 있다.",
    motivation: "동생을 지키는 것",
    signatureLines: [],
    appearanceNotes: "",
  },
];

function beat(
  id: string,
  sceneId: string,
  order: number,
  summary: string,
): StudioStoryBeat {
  return {
    id,
    sceneId,
    order,
    kind: "setup",
    summary,
    dialogue: "",
    characterIds: [],
    locationId: null,
  };
}

const BEATS: readonly StudioStoryBeat[] = [
  beat("b2", "scene-2", 2, "동생이 봉투를 목격한다."),
  beat("b1", "scene-1", 1, "해온이 빗속을 걷는다."),
  beat("b3", "scene-2", 3, "동생이 입을 다문다."),
  beat("b4", "scene-3", 4, "새벽, 봉투가 사라졌다."),
  beat("b5", "scene-4", 5, "네 번째 장면 리드."),
];

describe("buildStageHandoff", () => {
  it("returns every section in canonical order for review with full data", () => {
    const result = buildStageHandoff({
      plan: FULL_PLAN,
      characters: stageHandoffCharactersFromSheet(CHARACTERS, PROFILES),
      beats: BEATS,
      targetStage: "review",
    });
    expect(result.isEmpty).toBe(false);
    expect(result.missing).toEqual([]);
    expect(result.sections.map((entry) => entry.kind)).toEqual([
      "synopsis",
      "goal",
      "emotion",
      "characters",
      "storyboard",
    ]);
    expect(result.sections[0]?.lines).toEqual([FULL_PLAN.synopsis]);
    expect(result.sections[1]?.lines).toEqual([FULL_PLAN.goal]);
    expect(result.sections[2]?.lines).toEqual(["경계 → 안도"]);
    expect(result.sections[0]?.sourceStage).toBe("plan");
    expect(result.sections[4]?.sourceStage).toBe("storyboard");
  });

  it("uses logline as the synopsis line when synopsis body is absent", () => {
    const { synopsis: _synopsis, ...rest } = FULL_PLAN;
    const result = buildStageHandoff({
      plan: rest as EpisodePlanWithSynopsis,
      targetStage: "review",
    });
    const synopsis = result.sections.find((entry) => entry.kind === "synopsis");
    expect(synopsis?.lines).toEqual([FULL_PLAN.logline]);
  });

  it("omits the goal section when goal duplicates the visible synopsis text", () => {
    const result = buildStageHandoff({
      plan: { ...FULL_PLAN, goal: FULL_PLAN.synopsis },
      targetStage: "review",
    });
    expect(result.sections.map((entry) => entry.kind)).not.toContain("goal");
  });

  it("with plan only, reports characters and storyboard as missing", () => {
    const result = buildStageHandoff({ plan: FULL_PLAN, targetStage: "review" });
    expect(result.isEmpty).toBe(false);
    expect(result.missing).toEqual(["characters", "storyboard"]);
    expect(result.sections.map((entry) => entry.kind)).toEqual([
      "synopsis",
      "goal",
      "emotion",
    ]);
  });

  it("is empty with all sources missing when input is entirely absent", () => {
    const result = buildStageHandoff({ targetStage: "review" });
    expect(result.isEmpty).toBe(true);
    expect(result.sections).toEqual([]);
    expect(result.missing).toEqual(["plan", "characters", "storyboard"]);
  });

  it("skips sections whose content is whitespace only", () => {
    const result = buildStageHandoff({
      plan: {
        ...FULL_PLAN,
        logline: "   ",
        synopsis: "  ",
        goal: " ",
        emotionalArc: { from: " ", to: "" },
      },
      characters: [{ name: "  " }],
      beats: [],
      targetStage: "review",
    });
    expect(result.isEmpty).toBe(true);
    expect(result.missing).toEqual(["plan", "characters", "storyboard"]);
  });

  it("summarizes characters from measured sheet fields only", () => {
    const inputs = stageHandoffCharactersFromSheet(CHARACTERS, PROFILES);
    const result = buildStageHandoff({
      characters: inputs,
      targetStage: "review",
    });
    const characters = result.sections.find((entry) => entry.kind === "characters");
    // personality 가 한 줄 특징이며, background("과거의 비밀")는 새지 않는다.
    expect(characters?.lines[0]).toBe("해온 — 겁이 많지만 책임감 하나로 버틴다.");
    expect(characters?.lines[0]).not.toContain("비밀");
    // 시트가 없는 캐릭터는 이름만 인용한다.
    expect(characters?.lines[1]).toBe("동생");
  });

  it("falls back to motivation then speechStyle for the character trait", () => {
    const result = buildStageHandoff({
      characters: [
        { name: "가", personality: " ", motivation: "복수", speechStyle: "짧게" },
        { name: "나", personality: "", motivation: null, speechStyle: "존댓말" },
      ],
      targetStage: "review",
    });
    const characters = result.sections.find((entry) => entry.kind === "characters");
    expect(characters?.lines).toEqual(["가 — 복수", "나 — 존댓말"]);
  });

  it("counts distinct scenes and beats and caps scene leads at three", () => {
    const result = buildStageHandoff({ beats: BEATS, targetStage: "review" });
    const storyboard = result.sections.find((entry) => entry.kind === "storyboard");
    expect(storyboard?.lines).toEqual([
      "장면 4 · 비트 5",
      "해온이 빗속을 걷는다.",
      "동생이 봉투를 목격한다.",
      "새벽, 봉투가 사라졌다.",
    ]);
  });

  it("selects sections per target stage: review shows all, lettering only storyboard+synopsis", () => {
    const input = {
      plan: FULL_PLAN,
      characters: stageHandoffCharactersFromSheet(CHARACTERS, PROFILES),
      beats: BEATS,
    } as const;
    const review = buildStageHandoff({ ...input, targetStage: "review" });
    const lettering = buildStageHandoff({ ...input, targetStage: "lettering" });
    const storyboard = buildStageHandoff({ ...input, targetStage: "storyboard" });
    const publish = buildStageHandoff({ ...input, targetStage: "publish" });
    expect(review.sections.map((entry) => entry.kind)).toEqual([
      "synopsis",
      "goal",
      "emotion",
      "characters",
      "storyboard",
    ]);
    expect(lettering.sections.map((entry) => entry.kind)).toEqual([
      "storyboard",
      "synopsis",
    ]);
    expect(storyboard.sections.map((entry) => entry.kind)).toEqual([
      "synopsis",
      "goal",
      "emotion",
      "characters",
    ]);
    expect(publish.sections.map((entry) => entry.kind)).toEqual(["synopsis", "goal"]);
    // 섹션 선택과 무관하게 missing 은 소스 기준으로 비어 있다.
    expect(lettering.missing).toEqual([]);
  });
});

/* 동결 기준본 첨부 픽스처 — 동결 게이트 정본 연산으로 실제 레코드를 만든다. */
function frozenSheetFor(
  characterId: string,
  overrides: { expressionRef?: string | null; poseRef?: string | null; assetRefs?: readonly string[] } = {},
): CharacterModelSheet {
  const drafted = addModelSheetRevision(emptyModelSheet(characterId), {
    expressionRef: "asset-expression-1",
    poseRef: "asset-pose-1",
    assetRefs: [],
    note: "",
    authorId: "artist-1",
    authorName: "작가",
    createdAt: "2026-10-14T08:00:00.000Z",
    ...overrides,
  }).sheet;
  return freezeModelSheet(drafted, {
    byId: "lead-1",
    byName: "리드",
    at: "2026-10-14T09:00:00.000Z",
  }).sheet;
}

function draftSheetFor(characterId: string): CharacterModelSheet {
  return addModelSheetRevision(emptyModelSheet(characterId), {
    expressionRef: "asset-expression-draft",
    poseRef: null,
    assetRefs: [],
    note: "",
    authorId: "artist-1",
    authorName: "작가",
    createdAt: "2026-10-14T08:00:00.000Z",
  }).sheet;
}

/** char-1 이 비트에 등장하고 char-2 는 등장하지 않는 비트 묶음. */
const BEATS_CHAR1_ONLY: readonly StudioStoryBeat[] = [
  { ...beat("fb1", "scene-1", 1, "해온이 빗속을 걷는다."), characterIds: ["char-1"] },
];

describe("frozen reference attachment", () => {
  it("carries characterId through stageHandoffCharactersFromSheet for the sheet join", () => {
    const inputs = stageHandoffCharactersFromSheet(CHARACTERS, PROFILES);
    expect(inputs.map((entry) => entry.characterId)).toEqual(["char-1", "char-2"]);
  });

  it("derives episode characters from plan refs first, then beat order, deduped", () => {
    const ids = episodeCharacterIdsForHandoff({
      plan: { ...FULL_PLAN, characterRefs: ["char-2"] },
      characters: stageHandoffCharactersFromSheet(CHARACTERS, PROFILES),
      beats: [
        { ...beat("x2", "s", 2, "둘째"), characterIds: ["char-1", "char-2"] },
        { ...beat("x1", "s", 1, "첫째"), characterIds: ["char-1"] },
      ],
    });
    expect(ids).toEqual(["char-2", "char-1"]);
  });

  it("falls back to the character list when neither plan refs nor beats name anyone", () => {
    const ids = episodeCharacterIdsForHandoff({
      characters: stageHandoffCharactersFromSheet(CHARACTERS, PROFILES),
    });
    expect(ids).toEqual(["char-1", "char-2"]);
  });

  it("attaches the frozen revision of appearing characters as a reference section", () => {
    const result = buildStageHandoff({
      plan: FULL_PLAN,
      characters: stageHandoffCharactersFromSheet(CHARACTERS, PROFILES),
      beats: BEATS_CHAR1_ONLY,
      modelSheets: [frozenSheetFor("char-1"), frozenSheetFor("char-2")],
      targetStage: "review",
    });
    // 등장하지 않는 char-2 의 동결본은 첨부되지 않는다.
    expect(result.frozenReferences.map((entry) => entry.characterId)).toEqual(["char-1"]);
    expect(result.frozenReferences[0]).toMatchObject({
      characterName: "해온",
      revision: 1,
      expressionRef: "asset-expression-1",
      poseRef: "asset-pose-1",
      frozenByName: "리드",
    });
    expect(result.unfrozenCharacters).toEqual([]);
    const section = result.sections.find((entry) => entry.kind === "frozenReferences");
    expect(section?.title).toEqual({ ko: "동결 기준본", en: "Frozen references" });
    expect(section?.lines).toEqual([
      "해온 — 동결 기준본 1판 · 표정 asset-expression-1 · 포즈 asset-pose-1",
    ]);
    expect(result.missing).not.toContain("frozenReferences");
  });

  it("guides unfrozen appearing characters (draft sheet and no sheet) instead of hiding them", () => {
    const result = buildStageHandoff({
      characters: stageHandoffCharactersFromSheet(CHARACTERS, PROFILES),
      beats: [
        { ...beat("g1", "s", 1, "둘 다 등장"), characterIds: ["char-1", "char-2"] },
      ],
      modelSheets: [draftSheetFor("char-1")],
      targetStage: "review",
    });
    expect(result.frozenReferences).toEqual([]);
    expect(result.unfrozenCharacters).toEqual([
      { characterId: "char-1", characterName: "해온", reason: "draft" },
      { characterId: "char-2", characterName: "동생", reason: "no-sheet" },
    ]);
    expect(result.missing).toContain("frozenReferences");
    expect(result.sections.map((entry) => entry.kind)).not.toContain("frozenReferences");
  });

  it("does not judge frozen state at all when modelSheets were not supplied", () => {
    const result = buildStageHandoff({
      characters: stageHandoffCharactersFromSheet(CHARACTERS, PROFILES),
      beats: BEATS_CHAR1_ONLY,
      targetStage: "review",
    });
    expect(result.frozenReferences).toEqual([]);
    expect(result.unfrozenCharacters).toEqual([]);
    expect(result.missing).not.toContain("frozenReferences");
    const attachment = buildFrozenReferenceAttachment({
      characters: stageHandoffCharactersFromSheet(CHARACTERS, PROFILES),
      beats: BEATS_CHAR1_ONLY,
    });
    expect(attachment.notEvaluated).toBe(true);
  });

  it("notes missing parts of an otherwise frozen revision (pose not in place)", () => {
    const result = buildStageHandoff({
      characters: stageHandoffCharactersFromSheet(CHARACTERS, PROFILES),
      beats: BEATS_CHAR1_ONLY,
      modelSheets: [frozenSheetFor("char-1", { poseRef: null, assetRefs: ["asset-costume-1"] })],
      targetStage: "art",
    });
    const section = result.sections.find((entry) => entry.kind === "frozenReferences");
    expect(section?.lines).toEqual([
      "해온 — 동결 기준본 1판 · 표정 asset-expression-1 · 기타 기준 1개 · 빠진 기준본: 포즈 기준본",
    ]);
    expect(result.frozenReferences[0]?.missingLabels).toEqual([
      { ko: "포즈 기준본", en: "pose reference" },
    ]);
  });

  it("selects the frozen section per target stage: art and review show it, lettering does not", () => {
    const input = {
      characters: stageHandoffCharactersFromSheet(CHARACTERS, PROFILES),
      beats: BEATS_CHAR1_ONLY,
      modelSheets: [frozenSheetFor("char-1")],
    } as const;
    const art = buildStageHandoff({ ...input, targetStage: "art" });
    const lettering = buildStageHandoff({ ...input, targetStage: "lettering" });
    expect(art.sections.map((entry) => entry.kind)).toContain("frozenReferences");
    expect(lettering.sections.map((entry) => entry.kind)).not.toContain("frozenReferences");
    // 단계 선택과 무관하게 구조화 첨부는 항상 돌려준다.
    expect(lettering.frozenReferences).toHaveLength(1);
  });
});

const SESSION_EXPORT: ReviewSessionSummaryExport = {
  sessionId: "session-1",
  episodeId: "episode-1",
  startedAt: "2026-10-14T00:00:00.000Z",
  endedAt: "2026-10-14T00:01:02.000Z",
  durationMs: 62_000,
  participantNames: ["PD", "작가 A"],
  hostName: "PD",
  decisions: [
    {
      id: "decision:session-1:1",
      actorId: "a",
      displayName: "작가 A",
      kind: "request-changes",
      summary: "3컷 표정 수정",
      at: "2026-10-14T00:00:02.000Z",
    },
    {
      id: "decision:session-1:2",
      actorId: "host",
      displayName: "PD",
      kind: "approve",
      summary: "선화 승인",
      at: "2026-10-14T00:00:03.000Z",
    },
  ],
  approvals: 1,
  changeRequests: 1,
  notes: 0,
  outcome: "changes-requested",
  headline: "참여 2명 · 승인 1건 · 수정 요청 1건 — 수정 요청 남음",
  exportedAt: "2026-10-14T00:01:10.000Z",
};

describe("검수 세션 결정 섹션 (인계 패키지 포함)", () => {
  it("세션 요약이 있으면 인계에 결정 이력 섹션이 자동으로 붙는다", () => {
    const handoff = buildStageHandoff({
      plan: FULL_PLAN,
      reviewSessionSummaries: [SESSION_EXPORT],
      targetStage: "review",
    });
    const section = handoff.sections.find((entry) => entry.kind === "reviewSession");
    expect(section).toBeDefined();
    expect(section?.title).toEqual({ ko: "검수 세션 결정", en: "Review session decisions" });
    expect(section?.sourceStage).toBe("review");
    expect(section?.lines[0]).toBe(SESSION_EXPORT.headline);
    expect(section?.lines).toContain("수정 요청 · 작가 A — 3컷 표정 수정");
    expect(section?.lines).toContain("승인 · PD — 선화 승인");
  });

  it("요약을 넘기지 않거나 비어 있으면 섹션을 만들지 않고 missing으로도 세지 않는다", () => {
    const without = buildStageHandoff({ plan: FULL_PLAN, targetStage: "review" });
    expect(without.sections.map((entry) => entry.kind)).not.toContain("reviewSession");
    const empty = buildStageHandoff({
      plan: FULL_PLAN,
      reviewSessionSummaries: [],
      targetStage: "review",
    });
    expect(empty.sections.map((entry) => entry.kind)).not.toContain("reviewSession");
    expect(empty.missing).not.toContain("plan");
  });

  it("여러 세션이면 가장 최근 세션을 대표로 인용하고 이전 세션 존재를 알린다", () => {
    const older: ReviewSessionSummaryExport = {
      ...SESSION_EXPORT,
      sessionId: "session-0",
      endedAt: "2026-10-13T00:01:02.000Z",
      headline: "참여 2명 · 승인 2건 · 수정 요청 0건 — 승인으로 마무리",
    };
    const handoff = buildStageHandoff({
      plan: FULL_PLAN,
      reviewSessionSummaries: [older, SESSION_EXPORT],
      targetStage: "review",
    });
    const section = handoff.sections.find((entry) => entry.kind === "reviewSession");
    expect(section?.lines[0]).toBe(SESSION_EXPORT.headline);
    expect(section?.lines.at(-1)).toContain("이전 세션 1건");
  });

  it("단계 선택: review·operate에는 포함되고 lettering·publish에서는 빠진다", () => {
    const input = { plan: FULL_PLAN, reviewSessionSummaries: [SESSION_EXPORT] } as const;
    expect(buildStageHandoff({ ...input, targetStage: "operate" }).sections.map((e) => e.kind)).toContain("reviewSession");
    expect(buildStageHandoff({ ...input, targetStage: "lettering" }).sections.map((e) => e.kind)).not.toContain("reviewSession");
    expect(buildStageHandoff({ ...input, targetStage: "publish" }).sections.map((e) => e.kind)).not.toContain("reviewSession");
  });
});

describe("장면 계획 인용 (비트 없을 때 콘티 구성)", () => {
  const SCENE_PLANS = [
    { order: 2, purpose: "옥상에서 봉투를 확인한다", emotionalBeat: "긴장" },
    { order: 1, purpose: "빗속 골목 도입", emotionalBeat: "" },
    { order: 3, purpose: "", emotionalBeat: "안도" },
    { order: 4, purpose: "네 번째 장면", emotionalBeat: "" },
  ] as const;

  it("builds the storyboard section from scene purposes in order, capped at three leads", () => {
    const result = buildStageHandoff({ scenePlans: SCENE_PLANS, targetStage: "art" });
    const storyboard = result.sections.find((entry) => entry.kind === "storyboard");
    expect(storyboard?.sourceStage).toBe("storyboard");
    expect(storyboard?.lines).toEqual([
      "장면 4",
      "빗속 골목 도입",
      "옥상에서 봉투를 확인한다",
      "안도",
    ]);
    expect(result.missing).not.toContain("storyboard");
  });

  it("prefers real beats over scene plans when both are supplied", () => {
    const result = buildStageHandoff({ beats: BEATS, scenePlans: SCENE_PLANS, targetStage: "art" });
    const storyboard = result.sections.find((entry) => entry.kind === "storyboard");
    expect(storyboard?.lines[0]).toBe("장면 4 · 비트 5");
  });

  it("still reports storyboard missing when scene plans are empty", () => {
    const result = buildStageHandoff({ scenePlans: [], targetStage: "art" });
    expect(result.missing).toContain("storyboard");
    expect(result.sections.some((entry) => entry.kind === "storyboard")).toBe(false);
  });

  it("stageHandoffScenePlanInputs sorts by order and normalizes nulls", () => {
    expect(stageHandoffScenePlanInputs(SCENE_PLANS).map((plan) => plan.order)).toEqual([1, 2, 3, 4]);
    expect(stageHandoffScenePlanInputs([{ order: 1 }])[0]).toEqual({
      order: 1,
      purpose: null,
      emotionalBeat: null,
    });
  });
});

describe("previousEpisodeStage", () => {
  it("points review back to lettering and storyboard back to plan", () => {
    expect(previousEpisodeStage("review").id).toBe("lettering");
    expect(previousEpisodeStage("storyboard").id).toBe("plan");
    expect(previousEpisodeStage("plan").id).toBe("plan");
    expect(previousEpisodeStage("review").primaryAction.target).toEqual({
      kind: "surface",
      surface: "manuscripts",
    });
  });
});
