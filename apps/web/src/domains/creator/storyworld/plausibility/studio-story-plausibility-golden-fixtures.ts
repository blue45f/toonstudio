/**
 * 개연성 점검 골든 세트: 코드로 만든 합성 이야기.
 *
 * 결함 이야기는 하나의 결함 종류만 심고, 깨끗한 이야기는 결함이 없다.
 * 테스트(studio-story-plausibility-golden.test.ts)가 결함 탐지 재현율, 정밀도, 깨끗한 이야기의
 * 오탐 0을 고정한다. 바이너리 픽스처 없이 전부 코드로 만든다.
 */
import { createForeshadowSeed, deriveForeshadowDigest } from "../../planning/studio-foreshadow-ledger";
import { buildEpisodeContinuityTimeline } from "../../planning/studio-episode-continuity-timeline";
import {
  STUDIO_STORYWORLD_SCHEMA_VERSION,
  type StoryworldCharacter,
  type StoryworldFactDefinition,
  type StoryworldProject,
  type StoryworldScene,
} from "../studio-storyworld-causality";
import type { PlausibilityExtraSources } from "./studio-story-plausibility-report";
import type { PlausibilityCategoryId, PlausibilitySeverity } from "./studio-story-plausibility-types";

export const HAEUN: StoryworldCharacter = { id: "haeun", name: "하은", goal: "사라진 동생을 찾는다" };
export const DOJIN: StoryworldCharacter = { id: "dojin", name: "도진", goal: "기억 시장을 지킨다" };

export function makeStory(
  id: string,
  title: string,
  parts: {
    readonly characters?: readonly StoryworldCharacter[];
    readonly facts?: readonly StoryworldFactDefinition[];
    readonly scenes: readonly StoryworldScene[];
    readonly setupContracts?: StoryworldProject["setupContracts"];
    readonly motifs?: StoryworldProject["motifs"];
  },
): StoryworldProject {
  return {
    schemaVersion: STUDIO_STORYWORLD_SCHEMA_VERSION,
    id,
    title,
    characters: parts.characters ?? [HAEUN],
    facts: parts.facts ?? [],
    scenes: parts.scenes,
    ...(parts.setupContracts ? { setupContracts: parts.setupContracts } : {}),
    ...(parts.motifs ? { motifs: parts.motifs } : {}),
    metadata: { receiptTimestampIso: "2026-10-15T00:00:00.000Z" },
  };
}

/** 장면 성격과 모든 질문에 "해당 없음"으로 답한 질문지 답. 점검 가능 범위를 채울 때 쓴다. */
export const ANSWERED_NONE: NonNullable<StoryworldScene["plausibility"]> = {
  roles: [],
  answers: {
    roles: "answered",
    motive: "not-applicable",
    cause: "not-applicable",
    information: "not-applicable",
    coincidence: "not-applicable",
    consequence: "not-applicable",
  },
};

function fact(id: string, label: string, extra: Partial<StoryworldFactDefinition> = {}): StoryworldFactDefinition {
  return { id, label, subjectId: "world", key: id, ...extra };
}

export interface GoldenExpectation {
  readonly module: string;
  readonly code: string;
  readonly category: PlausibilityCategoryId;
  readonly severity: PlausibilitySeverity;
}

export interface GoldenStory {
  readonly id: string;
  readonly kind: "defect" | "clean";
  readonly title: string;
  /** 심은 결함을 한 줄로. 깨끗한 이야기는 무엇을 확인하는지. */
  readonly note: string;
  readonly project: StoryworldProject;
  readonly extras?: PlausibilityExtraSources;
  readonly expected: readonly GoldenExpectation[];
}

// ── 결함 이야기 ───────────────────────────────────────────────────────

const knowledgeLeak = makeStory("g-knowledge-leak", "범인을 먼저 아는 탐정", {
  characters: [HAEUN, DOJIN],
  facts: [fact("culprit", "범인은 도진이다", { initialValue: true })],
  scenes: [
    { id: "s1", title: "의뢰", order: 10, timeIndex: 1, locationId: "사무실", participantIds: ["haeun"] },
    {
      id: "s2", title: "추궁", order: 20, timeIndex: 2, locationId: "사무실", participantIds: ["haeun", "dojin"],
      knowledgeUses: [{ characterId: "haeun", factId: "culprit", purpose: "범인을 지목한다" }],
    },
    {
      id: "s3", title: "단서 발견", order: 30, timeIndex: 3, locationId: "사무실", participantIds: ["haeun"],
      reveals: [{ factId: "culprit", audiences: ["haeun", "reader"] }],
    },
  ],
});

const missingPrecondition = makeStory("g-missing-precondition", "열쇠 없이 여는 금고", {
  facts: [fact("key-owned", "하은이 열쇠를 가졌다")],
  scenes: [
    { id: "s1", title: "시장", order: 10, timeIndex: 1, locationId: "시장", participantIds: ["haeun"] },
    {
      id: "s2", title: "금고 앞", order: 20, timeIndex: 2, locationId: "금고", participantIds: ["haeun"],
      preconditions: [{ factId: "key-owned", comparator: "equals", value: true }],
    },
  ],
});

const timeRegression = makeStory("g-time-regression", "설명 없는 시간 역행", {
  scenes: [
    { id: "s1", title: "아침", order: 10, timeIndex: 10, locationId: "집", participantIds: ["haeun"] },
    { id: "s2", title: "점심", order: 20, timeIndex: 20, locationId: "집", participantIds: ["haeun"] },
    { id: "s3", title: "아침 인사", order: 30, timeIndex: 5, locationId: "집", participantIds: ["haeun"] },
  ],
});

const impossibleTravel = makeStory("g-impossible-travel", "같은 시간 두 곳", {
  characters: [HAEUN, DOJIN],
  scenes: [
    { id: "s1", title: "시장의 두 사람", order: 10, timeIndex: 10, locationId: "시장", participantIds: ["haeun", "dojin"] },
    { id: "s2", title: "금고 앞의 하은", order: 20, timeIndex: 10, locationId: "금고", participantIds: ["haeun"] },
  ],
});

const unpaidSetup = makeStory("g-unpaid-setup", "거두지 않은 우산", {
  setupContracts: [{ id: "umbrella", label: "붉은 우산의 흠집", payoffDueByOrder: 30 }],
  scenes: [
    { id: "s1", title: "우산을 줍다", order: 10, timeIndex: 1, locationId: "시장", participantIds: ["haeun"], setupIds: ["umbrella"] },
    { id: "s2", title: "비 오는 거리", order: 20, timeIndex: 2, locationId: "시장", participantIds: ["haeun"] },
    { id: "s3", title: "결말", order: 30, timeIndex: 3, locationId: "시장", participantIds: ["haeun"] },
  ],
});

const orphanPayoff = makeStory("g-orphan-payoff", "심기 전에 거둔 복선", {
  setupContracts: [{ id: "umbrella", label: "붉은 우산의 흠집" }],
  scenes: [
    { id: "s1", title: "우산의 주인", order: 10, timeIndex: 1, locationId: "금고", participantIds: ["haeun"], payoffIds: ["umbrella"] },
    { id: "s2", title: "우산을 줍다", order: 20, timeIndex: 2, locationId: "시장", participantIds: ["haeun"], setupIds: ["umbrella"] },
  ],
});

const emotionalWhiplash = makeStory("g-emotional-whiplash", "연결 없는 감정 급변", {
  scenes: [
    {
      id: "s1", title: "재회", order: 10, timeIndex: 1, locationId: "시장", participantIds: ["haeun"],
      emotionalBeats: [{ characterId: "haeun", valence: 0.8, arousal: 0.2 }],
    },
    {
      id: "s2", title: "절규", order: 20, timeIndex: 2, locationId: "시장", participantIds: ["haeun"],
      emotionalBeats: [{ characterId: "haeun", valence: -0.9, arousal: 0.9 }],
    },
  ],
});

const prematureReveal = makeStory("g-premature-reveal", "너무 이른 정체 공개", {
  characters: [HAEUN, DOJIN],
  facts: [fact("identity", "도진은 사라진 동생이다", { initialValue: true, intendedReaderRevealOrder: 40 })],
  scenes: [
    {
      id: "s1", title: "첫 만남", order: 20, timeIndex: 1, locationId: "시장", participantIds: ["haeun", "dojin"],
      reveals: [{ factId: "identity", audiences: ["reader"] }],
    },
    { id: "s2", title: "고백", order: 40, timeIndex: 2, locationId: "시장", participantIds: ["haeun", "dojin"], reveals: [{ factId: "identity", audiences: ["haeun"] }] },
  ],
});

const factConflict = makeStory("g-fact-conflict", "서로 다른 금고 상태", {
  facts: [
    fact("vault-open-a", "금고가 열려 있다", { subjectId: "vault", key: "open", initialValue: true }),
    fact("vault-open-b", "금고가 잠겨 있다", { subjectId: "vault", key: "open", initialValue: false }),
  ],
  scenes: [
    {
      id: "s1", title: "금고 확인", order: 10, timeIndex: 1, locationId: "금고", participantIds: ["haeun"],
      preconditions: [{ factId: "vault-open-a", comparator: "exists" }, { factId: "vault-open-b", comparator: "exists" }],
    },
  ],
});

const dependencyOrder = makeStory("g-dependency-order", "원인이 결과보다 뒤", {
  scenes: [
    { id: "s1", title: "시작", order: 10, timeIndex: 1, locationId: "시장", participantIds: ["haeun"] },
    { id: "s2", title: "결과", order: 20, timeIndex: 2, locationId: "시장", participantIds: ["haeun"], dependsOnSceneIds: ["s3"] },
    { id: "s3", title: "원인", order: 30, timeIndex: 3, locationId: "시장", participantIds: ["haeun"] },
  ],
});

/** 해결 장면 앞 여섯 장면은 모두 사실을 다루지만, 해결이 기대는 사실은 한 번도 나오지 않는다. */
function modeledLeadIn(): readonly StoryworldScene[] {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `s${index + 1}`,
    title: `단계 ${index + 1}`,
    order: (index + 1) * 10,
    timeIndex: index + 1,
    locationId: "시장",
    participantIds: ["haeun"],
    ...(index === 0 ? {} : { preconditions: [{ factId: `step-${index}`, comparator: "equals" as const, value: true }] }),
    effects: [{ factId: `step-${index + 1}`, op: "set" as const, value: true }],
  }));
}

const stepFacts = Array.from({ length: 6 }, (_, index) => fact(`step-${index + 1}`, `${index + 1}단계 완료`, { initialValue: false }));

const unpreparedResolution = makeStory("g-unprepared-resolution", "갑자기 나타난 비밀 통로", {
  facts: [...stepFacts, fact("secret-passage", "비밀 통로가 있다", { initialValue: true })],
  scenes: [
    ...modeledLeadIn(),
    {
      id: "s7", title: "탈출", order: 70, timeIndex: 7, locationId: "시장", participantIds: ["haeun"],
      preconditions: [{ factId: "step-6", comparator: "equals", value: true }, { factId: "secret-passage", comparator: "equals", value: true }],
      plausibility: { roles: ["resolution"], answers: { roles: "answered" } },
    },
  ],
});

const motiveGap = makeStory("g-motive-gap", "이유를 모르는 선택", {
  scenes: [
    { id: "s1", title: "의뢰", order: 10, timeIndex: 1, locationId: "사무실", participantIds: ["haeun"] },
    {
      id: "s2", title: "금고를 열다", order: 20, timeIndex: 2, locationId: "금고", participantIds: ["haeun"],
      plausibility: {
        roles: ["decision"],
        motives: [{ characterId: "haeun", basis: "unknown" }],
        answers: { roles: "answered", motive: "unknown" },
      },
    },
  ],
});

const coincidenceWithoutClue = makeStory("g-coincidence", "단서 없는 우연한 구출", {
  characters: [HAEUN, DOJIN],
  scenes: [
    { id: "s1", title: "위기", order: 10, timeIndex: 1, locationId: "시장", participantIds: ["haeun"] },
    {
      id: "s2", title: "마침 나타난 구원자", order: 20, timeIndex: 2, locationId: "시장", participantIds: ["haeun", "dojin"],
      plausibility: {
        roles: ["resolution"],
        coincidence: { clue: "none" },
        answers: { roles: "answered", coincidence: "answered" },
      },
    },
  ],
});

const ageMismatch = makeStory("g-age-mismatch", "맞지 않는 나이", {
  characters: [{ ...HAEUN, birthYear: 2000 }],
  scenes: [
    { id: "s1", title: "열여덟의 여름", order: 10, timeIndex: 1, locationId: "집", participantIds: ["haeun"], storyYear: 2018 },
    { id: "s2", title: "그해 겨울", order: 20, timeIndex: 2, locationId: "집", participantIds: ["haeun"], storyYear: 2025, statedAges: [{ characterId: "haeun", age: 30 }] },
  ],
});

const ledgerSeed = createForeshadowSeed({
  id: "seed-letter",
  projectId: "p",
  title: "숨긴 편지",
  plantedIn: { episodeId: "ep-1" },
  expectedPayoff: { fromEpisodeId: "ep-2", toEpisodeId: "ep-3" },
  now: "2026-10-15T00:00:00.000Z",
});
const ledgerEpisodes = [
  { episodeId: "ep-1", episodeNumber: 1, title: "시작" },
  { episodeId: "ep-2", episodeNumber: 2, title: "중반" },
  { episodeId: "ep-3", episodeNumber: 3, title: "고비" },
  { episodeId: "ep-4", episodeNumber: 4, title: "현재" },
];
const ledgerDigest = deriveForeshadowDigest({
  seeds: [ledgerSeed],
  episodeOrder: ledgerEpisodes.map((episode) => episode.episodeId),
  currentEpisodeId: "ep-4",
});

const ledgerOverdue = makeStory("g-ledger-overdue", "회수 구간이 지난 편지", {
  scenes: [
    { id: "s1", title: "편지를 숨기다", order: 10, timeIndex: 1, locationId: "집", participantIds: ["haeun"], episodeNumber: 1 },
    { id: "s4", title: "지금의 이야기", order: 40, timeIndex: 4, locationId: "집", participantIds: ["haeun"], episodeNumber: 4 },
  ],
});

const timelineEpisodes = [
  { episodeId: "ep-1", episodeNumber: 1, title: "첫째 날" },
  { episodeId: "ep-2", episodeNumber: 2, title: "열흘 뒤" },
  { episodeId: "ep-3", episodeNumber: 3, title: "다시 첫째 날" },
];
const timelineTags = [
  { episodeId: "ep-1", storyDayStart: 1, storyDayEnd: 1, locationIds: [], timeLabel: null },
  { episodeId: "ep-2", storyDayStart: 11, storyDayEnd: 11, locationIds: [], timeLabel: null },
  { episodeId: "ep-3", storyDayStart: 2, storyDayEnd: 2, locationIds: [], timeLabel: null },
];
const timeline = buildEpisodeContinuityTimeline(timelineEpisodes, timelineTags, []);

const timelineRegression = makeStory("g-timeline-regression", "거꾸로 가는 회차", {
  scenes: [
    { id: "s1", title: "1화", order: 10, timeIndex: 1, locationId: "집", participantIds: ["haeun"], episodeNumber: 1 },
    { id: "s3", title: "3화", order: 30, timeIndex: 3, locationId: "집", participantIds: ["haeun"], episodeNumber: 3 },
  ],
});

// ── 깨끗한 이야기 ─────────────────────────────────────────────────────

/** 모든 질문에 답했고 해결의 근거가 앞에서 보였으며, 복선을 심고 거두고, 나이가 맞는다. */
const cleanMystery = makeStory("c-mystery", "열쇠와 우산", {
  characters: [{ ...HAEUN, birthYear: 2000, initialFactIds: ["market-rain"] }, DOJIN],
  facts: [
    fact("market-rain", "시장에는 밤마다 비가 온다", { initialValue: true, canonical: true }),
    fact("umbrella-scratch", "붉은 우산에 흠집이 있다", { initialValue: true }),
    fact("key-owned", "하은이 열쇠를 가졌다", { initialValue: false }),
    fact("vault-open", "금고가 열렸다", { initialValue: false }),
  ],
  setupContracts: [{ id: "umbrella", label: "붉은 우산의 흠집", payoffDueByOrder: 100 }],
  scenes: [
    {
      id: "s1", title: "비 내리는 시장", order: 10, timeIndex: 1, locationId: "시장", participantIds: ["haeun"], storyYear: 2020,
      statedAges: [{ characterId: "haeun", age: 20 }],
      reveals: [{ factId: "umbrella-scratch", audiences: ["haeun", "reader"] }],
      setupIds: ["umbrella"],
      emotionalBeats: [{ characterId: "haeun", valence: -0.2, arousal: 0.4 }],
      plausibility: ANSWERED_NONE,
    },
    {
      id: "s2", title: "열쇠 거래", order: 20, timeIndex: 2, locationId: "시장", participantIds: ["haeun", "dojin"],
      dependsOnSceneIds: ["s1"], effects: [{ factId: "key-owned", op: "set", value: true }],
      emotionalBeats: [{ characterId: "haeun", valence: 0.1, arousal: 0.5 }],
      plausibility: {
        roles: ["decision"],
        motives: [{ characterId: "haeun", basis: "goal" }, { characterId: "dojin", basis: "event", causeSceneId: "s1" }],
        answers: { roles: "answered", motive: "answered", cause: "answered", information: "not-applicable", coincidence: "not-applicable", consequence: "answered" },
      },
    },
    {
      id: "s3", title: "금고 앞", order: 30, timeIndex: 3, locationId: "금고", participantIds: ["haeun"],
      dependsOnSceneIds: ["s2"], preconditions: [{ factId: "key-owned", comparator: "equals", value: true }],
      effects: [{ factId: "vault-open", op: "set", value: true }],
      emotionalBeats: [{ characterId: "haeun", valence: 0.3, arousal: 0.6 }],
      plausibility: ANSWERED_NONE,
    },
    {
      id: "s4", title: "과거의 우산", order: 40, timeIndex: 0, locationId: "시장", participantIds: ["haeun"], storyYear: 2010,
      statedAges: [{ characterId: "haeun", age: 10 }],
      reveals: [{ factId: "umbrella-scratch", audiences: ["reader"] }],
      plausibility: { ...ANSWERED_NONE, roles: ["flashback"] },
    },
    {
      id: "s5", title: "우산의 주인", order: 50, timeIndex: 4, locationId: "금고", participantIds: ["haeun", "dojin"],
      dependsOnSceneIds: ["s3"],
      preconditions: [{ factId: "vault-open", comparator: "equals", value: true }, { factId: "umbrella-scratch", comparator: "equals", value: true }],
      knowledgeUses: [{ characterId: "haeun", factId: "umbrella-scratch", purpose: "우산 주인을 알아본다" }],
      plausibility: {
        roles: ["resolution"],
        answers: { roles: "answered", motive: "not-applicable", cause: "answered", information: "answered", coincidence: "not-applicable", consequence: "not-applicable" },
      },
    },
    {
      id: "s6", title: "에필로그", order: 60, timeIndex: 5, locationId: "시장", participantIds: ["haeun"],
      payoffIds: ["umbrella"], plausibility: ANSWERED_NONE,
    },
  ],
});

/** 장면과 등장인물만 있고 의미 필드는 비어 있다. 판정하지 않아야 하고 커버리지는 낮다. */
const cleanSparse = makeStory("c-sparse", "원고에서 막 가져온 초안", {
  characters: [HAEUN, DOJIN],
  scenes: [
    { id: "s1", title: "장면 1", order: 10, participantIds: ["haeun"] },
    { id: "s2", title: "장면 2", order: 20, participantIds: ["haeun", "dojin"] },
    { id: "s3", title: "장면 3", order: 30, participantIds: ["dojin"] },
    { id: "s4", title: "장면 4", order: 40, participantIds: ["haeun"] },
  ],
});

/** 회상을 회상 장면으로 밝혔고, 그 밖의 시간은 순서대로 흐른다. */
const cleanFlashback = makeStory("c-flashback", "회상이 있는 이야기", {
  scenes: [
    { id: "s1", title: "현재", order: 10, timeIndex: 100, locationId: "집", participantIds: ["haeun"], plausibility: ANSWERED_NONE },
    { id: "s2", title: "어린 시절", order: 20, timeIndex: 10, locationId: "시골집", participantIds: ["haeun"], plausibility: { ...ANSWERED_NONE, roles: ["flashback"] } },
    { id: "s3", title: "다시 현재", order: 30, timeIndex: 110, locationId: "집", participantIds: ["haeun"], plausibility: ANSWERED_NONE },
  ],
});

/** 긴 호흡의 복선: 심고 한참 뒤 거두되 약속(복선 계약)으로 이어져 있다. 회수 장면은 단서도 밝혔다. */
const cleanLongForeshadow = makeStory("c-long-foreshadow", "긴 복선", {
  facts: [fact("old-letter", "서랍 속 낡은 편지", { initialValue: true })],
  setupContracts: [{ id: "letter", label: "낡은 편지", payoffDueByOrder: 300 }],
  motifs: [{ id: "bell", label: "종소리", minOccurrences: 2, maxGapScenes: 12 }],
  scenes: Array.from({ length: 14 }, (_, index) => ({
    id: `s${index + 1}`,
    title: index === 0 ? "편지를 발견하다" : index === 13 ? "편지를 읽다" : `일상 ${index}`,
    order: (index + 1) * 10,
    timeIndex: index + 1,
    locationId: "집",
    participantIds: ["haeun"],
    motifIds: index === 0 || index === 13 ? ["bell"] : [],
    ...(index === 0 ? { setupIds: ["letter"], reveals: [{ factId: "old-letter", audiences: ["haeun", "reader"] }] } : {}),
    ...(index === 13
      ? {
        payoffIds: ["letter"],
        preconditions: [{ factId: "old-letter", comparator: "equals" as const, value: true }],
        plausibility: { roles: ["resolution" as const], answers: { roles: "answered" as const } },
      }
      : {}),
  })),
});

/** 나이 계산이 생일 때문에 한 살 어긋나도 모순으로 세지 않는다. 태어난 해가 지나서 등장한다. */
const cleanAges = makeStory("c-ages", "나이가 맞는 이야기", {
  characters: [{ ...HAEUN, birthYear: 2000 }, { ...DOJIN, birthYear: 1990 }],
  scenes: [
    { id: "s1", title: "2015년", order: 10, timeIndex: 1, locationId: "집", participantIds: ["haeun", "dojin"], storyYear: 2015, statedAges: [{ characterId: "haeun", age: 15 }, { characterId: "dojin", age: 24 }] },
    { id: "s2", title: "2020년", order: 20, timeIndex: 2, locationId: "집", participantIds: ["haeun", "dojin"], storyYear: 2020, statedAges: [{ characterId: "haeun", age: 19 }, { characterId: "dojin", age: 30 }] },
  ],
});

export const GOLDEN_STORIES: readonly GoldenStory[] = [
  {
    id: knowledgeLeak.id, kind: "defect", title: knowledgeLeak.title, project: knowledgeLeak,
    note: "단서를 얻기 전 장면에서 범인을 지목한다(아는 경로 없음)",
    expected: [{ module: "causality", code: "knowledge-leak", category: "information", severity: "error" }],
  },
  {
    id: missingPrecondition.id, kind: "defect", title: missingPrecondition.title, project: missingPrecondition,
    note: "열쇠를 얻은 적 없는데 금고를 연다",
    expected: [{ module: "causality", code: "missing-precondition", category: "cause-effect", severity: "error" }],
  },
  {
    id: timeRegression.id, kind: "defect", title: timeRegression.title, project: timeRegression,
    note: "회상 표시 없이 시간 값이 거꾸로 간다",
    expected: [{ module: "causality", code: "time-regression", category: "time-place", severity: "warning" }],
  },
  {
    id: impossibleTravel.id, kind: "defect", title: impossibleTravel.title, project: impossibleTravel,
    note: "같은 시간에 하은이 시장과 금고에 있다",
    expected: [{ module: "causality", code: "impossible-travel", category: "time-place", severity: "warning" }],
  },
  {
    id: unpaidSetup.id, kind: "defect", title: unpaidSetup.title, project: unpaidSetup,
    note: "기한까지 회수하지 않은 복선",
    expected: [{ module: "causality", code: "unpaid-setup", category: "foreshadowing", severity: "error" }],
  },
  {
    id: orphanPayoff.id, kind: "defect", title: orphanPayoff.title, project: orphanPayoff,
    note: "복선을 심기 전에 거둔다",
    expected: [{ module: "causality", code: "orphan-payoff", category: "foreshadowing", severity: "error" }],
  },
  {
    id: emotionalWhiplash.id, kind: "defect", title: emotionalWhiplash.title, project: emotionalWhiplash,
    note: "연결 없이 기쁨에서 절규로 점프",
    expected: [{ module: "causality", code: "emotional-whiplash", category: "emotion", severity: "warning" }],
  },
  {
    id: prematureReveal.id, kind: "defect", title: prematureReveal.title, project: prematureReveal,
    note: "계획한 공개 순서(40)보다 이른 순서(20)에 독자에게 공개",
    expected: [{ module: "causality", code: "premature-reader-reveal", category: "information", severity: "warning" }],
  },
  {
    id: factConflict.id, kind: "defect", title: factConflict.title, project: factConflict,
    note: "같은 속성에 서로 다른 처음 값을 선언",
    expected: [{ module: "continuity", code: "fact-initial-value-conflict", category: "setting-rules", severity: "error" }],
  },
  {
    id: dependencyOrder.id, kind: "defect", title: dependencyOrder.title, project: dependencyOrder,
    note: "원인으로 지정한 장면이 결과 장면보다 뒤에 있다",
    expected: [{ module: "causality", code: "dependency-order", category: "cause-effect", severity: "error" }],
  },
  {
    id: unpreparedResolution.id, kind: "defect", title: unpreparedResolution.title, project: unpreparedResolution,
    note: "해결 장면이 기대는 비밀 통로가 앞 장면에서 한 번도 나오지 않는다",
    expected: [{ module: "plausibility", code: "unprepared-resolution", category: "coincidence", severity: "warning" }],
  },
  {
    id: motiveGap.id, kind: "defect", title: motiveGap.title, project: motiveGap,
    note: "결정 장면의 동기를 '모름'으로 답했다",
    expected: [{ module: "plausibility", code: "motive-gap", category: "motive", severity: "suggestion" }],
  },
  {
    id: coincidenceWithoutClue.id, kind: "defect", title: coincidenceWithoutClue.title, project: coincidenceWithoutClue,
    note: "해결 장면이 단서 없는 우연이라고 답했다",
    expected: [{ module: "plausibility", code: "coincidence-without-clue", category: "coincidence", severity: "warning" }],
  },
  {
    id: ageMismatch.id, kind: "defect", title: ageMismatch.title, project: ageMismatch,
    note: "2000년생이 2025년에 30살이라고 한다",
    expected: [{ module: "plausibility", code: "age-mismatch", category: "character-consistency", severity: "error" }],
  },
  {
    id: ledgerOverdue.id, kind: "defect", title: ledgerOverdue.title, project: ledgerOverdue,
    note: "복선 장부: 3화까지 거두기로 한 편지를 4화에도 거두지 않았다",
    extras: {
      foreshadow: {
        overdue: ledgerDigest.overdue,
        dueSoon: ledgerDigest.dueSoon,
        episodes: ledgerEpisodes,
        totalCount: 1,
      },
    },
    expected: [{ module: "foreshadow-ledger", code: "overdue", category: "foreshadowing", severity: "warning" }],
  },
  {
    id: timelineRegression.id, kind: "defect", title: timelineRegression.title, project: timelineRegression,
    note: "회차 타임라인: 3화의 이야기 일차가 2화보다 앞선다",
    extras: { timeline: { candidates: timeline.candidates, episodes: timelineEpisodes, recordedCount: timeline.recordedCount } },
    expected: [{ module: "episode-timeline", code: "time-regression", category: "time-place", severity: "warning" }],
  },
  {
    id: cleanMystery.id, kind: "clean", title: cleanMystery.title, project: cleanMystery,
    note: "모든 질문에 답했고 해결의 근거가 앞에서 보였으며 복선을 거두고 회상을 밝혔다",
    expected: [],
  },
  {
    id: cleanSparse.id, kind: "clean", title: cleanSparse.title, project: cleanSparse,
    note: "의미 필드가 비어 있어 판정하지 않는다(커버리지만 낮다)",
    expected: [],
  },
  {
    id: cleanFlashback.id, kind: "clean", title: cleanFlashback.title, project: cleanFlashback,
    note: "회상 장면으로 밝힌 시간 역행은 경고하지 않는다",
    expected: [],
  },
  {
    id: cleanLongForeshadow.id, kind: "clean", title: cleanLongForeshadow.title, project: cleanLongForeshadow,
    note: "긴 호흡의 복선도 복선 계약으로 이어져 있으면 경고하지 않는다",
    expected: [],
  },
  {
    id: cleanAges.id, kind: "clean", title: cleanAges.title, project: cleanAges,
    note: "생일 때문에 한 살 어긋난 나이는 모순으로 세지 않는다",
    expected: [],
  },
];
