import { describe, expect, it } from "vitest";

import type { StudioStoryBeat } from "../studio-storyboard-planner";
import type { EpisodePlanWithSynopsis } from "./studio-episode-synopsis";
import {
  withLoreEntryDefaults,
  type StudioLoreEntry,
  type StudioWorldLore,
} from "./studio-world-lore";
import {
  acknowledgeAllStudioLoreChanges,
  acknowledgeStudioLoreChange,
  adaptEpisodePlanToLoreSynopsisRef,
  adaptStudioStoryBeatToLoreDialogueRef,
  analyzeStudioLoreChangeImpacts,
  buildStudioLoreReferenceIndex,
  diffStudioWorldLore,
  summarizeStudioLoreChangeImpacts,
  type StudioLoreChangeReferenceSources,
} from "./studio-lore-change-impact";

function entry(partial: Partial<StudioLoreEntry> & Pick<StudioLoreEntry, "id" | "kind" | "name">): StudioLoreEntry {
  return withLoreEntryDefaults({
    aliases: [],
    summary: "",
    details: "",
    eraLabel: "",
    timelineOrder: null,
    relatedEntryIds: [],
    characterIds: [],
    origin: "authored",
    ...partial,
  });
}

const RULE = entry({
  id: "lore-rule-memory",
  kind: "rule",
  name: "물에 닿은 기억은 사라진다",
  aliases: ["기억 소실"],
  summary: "이 세계의 절대 규칙.",
  details: "예외는 아직 확인되지 않았다.",
  relatedEntryIds: ["lore-place-library"],
});
const LIBRARY = entry({
  id: "lore-place-library",
  kind: "place",
  name: "침수된 옛 도서관",
  aliases: ["옛 도서관"],
  summary: "간조 때만 드러나는 서고.",
  details: "물에 닿은 책은 기억을 잃는다.",
  relatedEntryIds: ["lore-rule-memory"],
});
const DIVER = entry({
  id: "lore-species-diver",
  kind: "species",
  name: "심해인",
  summary: "기억 소실의 영향을 받는 사람들.",
  details: "깊은 물에서 기억을 태워 버틴다.",
});

const PREVIOUS: StudioWorldLore = {
  projectId: "project-1",
  entries: [RULE, LIBRARY, DIVER],
};

const SOURCES: StudioLoreChangeReferenceSources = {
  synopses: [
    {
      episodeId: "ep-12",
      episodeNumber: 12,
      episodeLabel: "12화",
      title: "잠긴 층",
      fields: [
        { fieldLabel: "제목", text: "잠긴 층" },
        { fieldLabel: "줄거리", text: "서하는 옛 도서관에서 물에 닿은 기억은 사라진다 라는 문장을 발견한다." },
        { fieldLabel: "마무리 훅", text: "기억 소실이 시작된다." },
      ],
    },
  ],
  dialogues: [
    {
      beatId: "beat-1",
      sceneId: "scene-3",
      episodeId: "ep-12",
      episodeLabel: "12화",
      dialogue: "조심해. 물에 닿은 기억은 사라진다잖아.",
    },
    {
      beatId: "beat-2",
      sceneId: "scene-4",
      episodeId: "ep-12",
      episodeLabel: "12화",
      dialogue: "오늘은 날씨가 좋네.",
    },
  ],
};

describe("diffStudioWorldLore", () => {
  it("이름 변경을 잡고 변경 전 이름을 보존하며 id가 결정적이다", () => {
    const next: StudioWorldLore = {
      projectId: "project-1",
      entries: [{ ...RULE, name: "물에 젖은 기억은 지워진다" }, LIBRARY, DIVER],
    };
    const changes = diffStudioWorldLore(PREVIOUS, next);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.kind).toBe("entry-renamed");
    expect(changes[0]?.beforeName).toBe("물에 닿은 기억은 사라진다");
    expect(changes[0]?.afterName).toBe("물에 젖은 기억은 지워진다");
    expect(diffStudioWorldLore(PREVIOUS, next)[0]?.id).toBe(changes[0]?.id);
  });

  it("규칙 항목의 내용 변경은 규칙 문구로 요약한다", () => {
    const next: StudioWorldLore = {
      projectId: "project-1",
      entries: [{ ...RULE, details: "예외가 하나 있다 — 등불의 빛 아래에서는 유지된다." }, LIBRARY, DIVER],
    };
    const changes = diffStudioWorldLore(PREVIOUS, next);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.kind).toBe("entry-content-changed");
    expect(changes[0]?.summaryKo).toContain("규칙");
    expect(changes[0]?.id).toContain("details");
  });

  it("별칭만 바뀌면 사라진 별칭을 분리해 낸다", () => {
    const next: StudioWorldLore = {
      projectId: "project-1",
      entries: [{ ...RULE, aliases: ["기억 상실"] }, LIBRARY, DIVER],
    };
    const changes = diffStudioWorldLore(PREVIOUS, next);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.kind).toBe("entry-aliases-changed");
    expect(changes[0]?.removedAliases).toEqual(["기억 소실"]);
  });

  it("삭제는 error 심각도이고, 추가와 무변경은 변경이 아니다", () => {
    const next: StudioWorldLore = {
      projectId: "project-1",
      entries: [RULE, LIBRARY, entry({ id: "lore-faction-guild", kind: "faction", name: "등불지기 길드" })],
    };
    const changes = diffStudioWorldLore(PREVIOUS, next);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.kind).toBe("entry-removed");
    expect(changes[0]?.severity).toBe("error");
    expect(diffStudioWorldLore(PREVIOUS, PREVIOUS)).toEqual([]);
  });
});

describe("buildStudioLoreReferenceIndex", () => {
  it("줄거리 칸·대사·명시 연결·본문 언급을 항목별로 색인한다", () => {
    const index = buildStudioLoreReferenceIndex(PREVIOUS, SOURCES);
    const ruleRefs = index.byEntryId["lore-rule-memory"] ?? [];
    const kinds = ruleRefs.map((ref) => `${ref.kind}:${ref.via}`);
    // 줄거리 본문 칸 + 마무리 훅 칸(별칭) + 대사 + 도서관의 명시 연결 + 심해인의 본문 언급(별칭)
    expect(kinds).toContain("episode-synopsis:text-mention");
    expect(kinds).toContain("dialogue:text-mention");
    expect(kinds).toContain("lore-entry:explicit-link");
    expect(kinds).toContain("lore-entry:text-mention");
    expect(ruleRefs.filter((ref) => ref.kind === "episode-synopsis")).toHaveLength(2);
    const hookRef = ruleRefs.find((ref) => ref.detail.includes("마무리 훅"));
    expect(hookRef?.matchedSurface).toBe("기억 소실");
    expect(index.totalReferenceCount).toBeGreaterThanOrEqual(5);
  });

  it("1자 표기는 색인하지 않고, 참조 없는 항목은 키를 만들지 않는다", () => {
    const tiny = entry({ id: "lore-artifact-x", kind: "artifact", name: "등", summary: "" });
    const lore: StudioWorldLore = { projectId: "project-1", entries: [tiny] };
    const index = buildStudioLoreReferenceIndex(lore, SOURCES);
    expect(index.byEntryId["lore-artifact-x"]).toBeUndefined();
    expect(index.byEntryId["lore-species-diver"]).toBeUndefined();
  });
});

describe("analyzeStudioLoreChangeImpacts", () => {
  it("이름 변경: 옛 표기로 남은 줄거리·대사·연결 설정을 순서대로 뽑는다", () => {
    const next: StudioWorldLore = {
      projectId: "project-1",
      entries: [{ ...RULE, name: "물에 젖은 기억은 지워진다" }, LIBRARY, DIVER],
    };
    const notices = analyzeStudioLoreChangeImpacts(PREVIOUS, next, SOURCES);
    expect(notices).toHaveLength(1);
    const kinds = notices[0]?.impacts.map((impact) => impact.kind);
    expect(kinds).toEqual([
      "episode-synopsis",
      "episode-synopsis",
      "dialogue",
      "lore-entry",
      "lore-entry",
    ]);
    expect(notices[0]?.impacts[0]?.reasonKo).toContain("옛 표기");
  });

  it("별칭 변경: 사라진 별칭으로 적힌 참조만 세고 이름 언급은 제외한다", () => {
    const next: StudioWorldLore = {
      projectId: "project-1",
      entries: [{ ...RULE, aliases: ["기억 상실"] }, LIBRARY, DIVER],
    };
    const notices = analyzeStudioLoreChangeImpacts(PREVIOUS, next, SOURCES);
    expect(notices).toHaveLength(1);
    // 마무리 훅(별칭) + 심해인 요약(별칭)만 — 줄거리 본문·대사·도서관 연결은 이름 기준이라 제외
    expect(notices[0]?.impactCount).toBe(2);
    expect(
      notices[0]?.impacts.every((impact) => impact.matchedSurface === "기억 소실"),
    ).toBe(true);
  });

  it("내용 변경: 언급과 연결을 모두 세고, 영향 없는 변경은 알림에서 제외한다", () => {
    const next: StudioWorldLore = {
      projectId: "project-1",
      entries: [
        { ...RULE, details: "예외가 하나 있다." },
        LIBRARY,
        { ...DIVER, details: "아무도 참조하지 않는 종족 설명으로 교체." },
      ],
    };
    const notices = analyzeStudioLoreChangeImpacts(PREVIOUS, next, SOURCES);
    // 규칙은 줄거리·대사·연결·언급 전부에서 참조되고, 심해인은 아무도 참조하지
    // 않으므로 내용 변경 알림은 규칙 1건뿐이다.
    expect(notices.map((notice) => notice.change.entryId)).toEqual(["lore-rule-memory"]);
    expect(notices[0]?.impactCount).toBe(5);
  });

  it("삭제: 남아 있는 연결·언급이 전부 영향이 된다", () => {
    const next: StudioWorldLore = { projectId: "project-1", entries: [RULE, DIVER] };
    const notices = analyzeStudioLoreChangeImpacts(PREVIOUS, next, SOURCES);
    expect(notices).toHaveLength(1);
    expect(notices[0]?.change.kind).toBe("entry-removed");
    expect(notices[0]?.change.entryId).toBe("lore-place-library");
    // 규칙의 명시 연결 1건 + 12화 줄거리의 별칭 언급 1건
    expect(notices[0]?.impactCount).toBe(2);
  });
});

describe("확인·집계", () => {
  it("확인 전후로 배지 집계가 줄고, 없는 id 확인은 무시한다", () => {
    const next: StudioWorldLore = {
      projectId: "project-1",
      entries: [{ ...RULE, name: "물에 젖은 기억은 지워진다" }, LIBRARY, DIVER],
    };
    const notices = analyzeStudioLoreChangeImpacts(PREVIOUS, next, SOURCES);
    const before = summarizeStudioLoreChangeImpacts(notices, []);
    expect(before.unacknowledgedCount).toBe(1);
    expect(before.impactedSynopsisCount).toBe(2);
    expect(before.impactedDialogueCount).toBe(1);
    expect(before.impactedLoreEntryCount).toBe(2);

    expect(acknowledgeStudioLoreChange(notices, [], "lore-change:unknown")).toEqual([]);
    const acked = acknowledgeStudioLoreChange(notices, [], notices[0]!.change.id);
    const after = summarizeStudioLoreChangeImpacts(notices, acked);
    expect(after.unacknowledgedCount).toBe(0);
    expect(after.totalImpactCount).toBe(0);
    expect(acknowledgeAllStudioLoreChanges(notices, [])).toEqual([notices[0]!.change.id]);
  });
});

describe("어댑터", () => {
  it("EpisodePlan의 정본·확장 칸을 줄거리 참조로 펼친다", () => {
    const plan: EpisodePlanWithSynopsis = {
      id: "plan-12",
      projectId: "project-1",
      seasonId: null,
      episodeId: "ep-12",
      episodeNumber: 12,
      revision: 1,
      status: "draft",
      title: "잠긴 층",
      logline: "서하가 문을 연다.",
      openingHook: "",
      coreConflict: "",
      turningPoints: ["옛 도서관에 도착한다"],
      cliffhanger: "",
      goal: "규칙을 확인한다",
      synopsis: "물에 닿은 기억은 사라진다 라는 규칙과 마주한다.",
      characterRefs: [],
      locationRefs: [],
      targetCutCount: 40,
      targetScrollHeightPx: 30000,
      dialogueDensity: "medium",
      difficulty: 2,
      riskIds: [],
      narrativeRevisionRef: null,
      approvedByAssignmentIds: [],
      createdAt: "2026-10-14T00:00:00.000Z",
    };
    const ref = adaptEpisodePlanToLoreSynopsisRef(plan);
    expect(ref.episodeLabel).toBe("12화");
    expect(ref.fields.find((field) => field.fieldLabel === "핵심 사건")?.text).toContain("옛 도서관");
    const index = buildStudioLoreReferenceIndex(PREVIOUS, { synopses: [ref], dialogues: [] });
    expect(index.byEntryId["lore-place-library"]?.length).toBeGreaterThanOrEqual(1);
    expect(index.byEntryId["lore-rule-memory"]?.length).toBeGreaterThanOrEqual(1);
  });

  it("대사가 빈 비트는 대사 참조로 만들지 않는다", () => {
    const beat: StudioStoryBeat = {
      id: "beat-9",
      sceneId: "scene-9",
      order: 0,
      kind: "dialogue",
      summary: "서하가 말한다.",
      dialogue: "  ",
      characterIds: ["char-seoha"],
      locationId: null,
    };
    expect(
      adaptStudioStoryBeatToLoreDialogueRef(beat, { episodeId: "ep-12", episodeLabel: "12화" }),
    ).toBeNull();
    const withDialogue = adaptStudioStoryBeatToLoreDialogueRef(
      { ...beat, dialogue: "기억 소실이 시작됐어." },
      { episodeId: "ep-12", episodeLabel: "12화" },
    );
    expect(withDialogue?.dialogue).toContain("기억 소실");
  });
});
