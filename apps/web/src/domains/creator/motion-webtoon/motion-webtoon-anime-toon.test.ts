import { describe, expect, it } from "vitest";

import {
  applyCharacterVoicePresets,
  backAnimeToonStep,
  buildAnimeToonDraft,
  createAnimeToonWizardState,
  generateAnimeToonDraft,
  renameAnimeToonDraft,
  selectAnimeToonSource,
  suggestAnimeToonTitle,
  type AnimeToonWizardState,
} from "./motion-webtoon-anime-toon";
import { buildCaptionTrack } from "./motion-webtoon-captions";
import type { MotionCut, MotionEpisode } from "./motion-webtoon-model";

function makeCut(id: string, texts: string[], characterId = "char-1"): MotionCut {
  return {
    id,
    imageUrl: `https://example.com/${id}.png`,
    altKo: `컷 ${id}`,
    altEn: `Cut ${id}`,
    direction: { cameraMove: "static", durationSeconds: 6, intensity: 0.5 },
    transitionIn: "cut",
    bgm: { sceneMood: "daily", crossfadeSeconds: 2 },
    dialogues: texts.map((text, index) => ({
      id: `${id}-dlg-${index}`,
      text,
      characterId,
      startOffsetSeconds: 0,
    })),
  };
}

function makeEpisode(overrides?: Partial<MotionEpisode>): MotionEpisode {
  return {
    id: "ep-source",
    titleKo: "달빛 기사",
    titleEn: "Moonlight Knight",
    characters: [
      { id: "char-1", nameKo: "주인공", nameEn: "Hero", presetId: "narrator" },
      { id: "char-2", nameKo: "조연", nameEn: "Sidekick", presetId: "narrator" },
    ],
    cuts: [
      makeCut("cut-1", ["조심해! 위험해!"]),
      makeCut("cut-2", ["정말 행복해! 우리가 해냈어!"], "char-2"),
      makeCut("cut-3", []),
    ],
    ...overrides,
  };
}

/** 결정적 ID 발급 — 접두사별 카운터. */
function deterministicRandom(): () => number {
  let counter = 0;
  return () => {
    counter += 1;
    return counter / 1000;
  };
}

describe("suggestAnimeToonTitle", () => {
  it("원본 제목 뒤에 애니툰을 붙인다", () => {
    expect(suggestAnimeToonTitle(makeEpisode())).toBe("달빛 기사 애니툰");
  });

  it("이미 애니툰으로 끝나면 중복해서 붙이지 않는다", () => {
    expect(suggestAnimeToonTitle(makeEpisode({ titleKo: "달빛 기사 애니툰" }))).toBe("달빛 기사 애니툰");
  });

  it("제목이 비어 있으면 기본 제목을 쓴다", () => {
    expect(suggestAnimeToonTitle(makeEpisode({ titleKo: "  " }))).toBe("애니툰");
  });
});

describe("applyCharacterVoicePresets", () => {
  it("대사 감정이 강한 캐릭터의 음성 프리셋을 바꾼다", () => {
    const { episode, changedCount } = applyCharacterVoicePresets(makeEpisode());
    // char-1: tension → dramatic, char-2: joy → friendly
    expect(changedCount).toBe(2);
    expect(episode.characters[0]?.presetId).toBe("dramatic");
    expect(episode.characters[1]?.presetId).toBe("friendly");
  });

  it("대사가 없거나 전부 중립인 캐릭터는 건드리지 않는다", () => {
    const source = makeEpisode({
      cuts: [makeCut("cut-1", ["오늘 날씨가 좋네요"])],
    });
    const { episode, changedCount } = applyCharacterVoicePresets(source);
    expect(changedCount).toBe(0);
    expect(episode.characters[0]?.presetId).toBe("narrator");
    expect(episode.characters[1]?.presetId).toBe("narrator");
  });

  it("이미 맞는 프리셋이면 세지 않는다", () => {
    const source = makeEpisode({
      characters: [
        { id: "char-1", nameKo: "주인공", nameEn: "Hero", presetId: "dramatic" },
        { id: "char-2", nameKo: "조연", nameEn: "Sidekick", presetId: "narrator" },
      ],
      cuts: [makeCut("cut-1", ["조심해! 위험해!"])],
    });
    const { changedCount } = applyCharacterVoicePresets(source);
    expect(changedCount).toBe(0);
  });
});

describe("buildAnimeToonDraft", () => {
  it("AI 연출이 적용된 새 회차 복제본을 만든다 (원본 불변)", () => {
    const source = makeEpisode();
    const result = buildAnimeToonDraft(source, { random: deterministicRandom() });
    expect("draft" in result).toBe(true);
    if (!("draft" in result)) return;
    const { draft, summary } = result;
    // 새 회차이며 제목이 제안값이다
    expect(draft.id).not.toBe(source.id);
    expect(draft.titleKo).toBe("달빛 기사 애니툰");
    // AI 디렉터가 감정 기반 BGM을 입혔다 (tension → battle)
    expect(draft.cuts[0]?.bgm.sceneMood).toBe("battle");
    // 원본은 바뀌지 않는다
    expect(source.cuts[0]?.bgm.sceneMood).toBe("daily");
    expect(source.titleKo).toBe("달빛 기사");
    // 요약 수치
    expect(summary.cutCount).toBe(3);
    expect(summary.cutsWithDialogue).toBe(2);
    expect(summary.voicePresetAppliedCount).toBe(2);
    expect(summary.totalDurationSeconds).toBeGreaterThan(0);
  });

  it("컷·대사·캐릭터 ID를 새로 발급하고 대사-캐릭터 연결을 유지한다", () => {
    const source = makeEpisode();
    const result = buildAnimeToonDraft(source, { random: deterministicRandom() });
    if (!("draft" in result)) throw new Error("draft expected");
    const { draft } = result;
    const sourceCutIds = new Set(source.cuts.map((cut) => cut.id));
    for (const cut of draft.cuts) {
      expect(sourceCutIds.has(cut.id)).toBe(false);
    }
    const draftCharacterIds = new Set(draft.characters.map((character) => character.id));
    for (const cut of draft.cuts) {
      for (const dialogue of cut.dialogues) {
        expect(draftCharacterIds.has(dialogue.characterId)).toBe(true);
      }
    }
    // 두 번째 컷의 대사는 조연(char-2 → 새 ID)의 것으로 남는다
    const sidekick = draft.characters[1];
    expect(draft.cuts[1]?.dialogues[0]?.characterId).toBe(sidekick?.id);
  });

  it("자막 트랙이 초안에서 바로 만들어진다 (자막 연결)", () => {
    const result = buildAnimeToonDraft(makeEpisode(), { random: deterministicRandom() });
    if (!("draft" in result)) throw new Error("draft expected");
    const track = buildCaptionTrack(result.draft);
    expect(track.cues.length).toBe(2);
    expect(result.summary.captionCueCount).toBe(track.cues.length);
    expect(result.summary.skippedCaptionCount).toBe(track.skippedDialogueCount);
    // 자막 화자 이름이 새 캐릭터 ID로도 연결된다
    expect(track.cues[0]?.speakerNameKo).toBe("주인공");
    expect(track.cues[1]?.speakerNameKo).toBe("조연");
  });

  it("대사가 전혀 없으면 자막 0개로 정직하게 요약한다", () => {
    const source = makeEpisode({ cuts: [makeCut("cut-1", []), makeCut("cut-2", [])] });
    const result = buildAnimeToonDraft(source, { random: deterministicRandom() });
    if (!("draft" in result)) throw new Error("draft expected");
    expect(result.summary.captionCueCount).toBe(0);
    expect(result.summary.cutsWithDialogue).toBe(0);
  });

  it("컷이 없는 회차는 실패로 돌려준다", () => {
    const result = buildAnimeToonDraft(makeEpisode({ cuts: [] }));
    expect(result).toEqual({ failure: "no-cuts" });
  });

  it("사용자 지정 제목을 우선한다", () => {
    const result = buildAnimeToonDraft(makeEpisode(), {
      titleKo: "내 애니툰",
      random: deterministicRandom(),
    });
    if (!("draft" in result)) throw new Error("draft expected");
    expect(result.draft.titleKo).toBe("내 애니툰");
  });
});

describe("위저드 상태 전이", () => {
  it("선택 → 미리보기 → 결과로 전이하고 초안이 생성된다", () => {
    let state: AnimeToonWizardState = createAnimeToonWizardState();
    expect(state.step).toBe("select");
    state = selectAnimeToonSource(state, makeEpisode());
    expect(state.step).toBe("preview");
    expect(state.draftTitleKo).toBe("달빛 기사 애니툰");
    state = generateAnimeToonDraft(state, { random: deterministicRandom() });
    expect(state.step).toBe("result");
    expect(state.draft).not.toBeNull();
    expect(state.summary?.cutCount).toBe(3);
    expect(state.failure).toBeNull();
  });

  it("컷 없는 회차를 고르면 미리보기에서 실패가 남고 단계는 유지된다", () => {
    let state = selectAnimeToonSource(createAnimeToonWizardState(), makeEpisode({ cuts: [] }));
    state = generateAnimeToonDraft(state);
    expect(state.step).toBe("preview");
    expect(state.failure).toBe("no-cuts");
    expect(state.draft).toBeNull();
  });

  it("미리보기 단계가 아니면 자동 생성이 동작하지 않는다", () => {
    const state = generateAnimeToonDraft(createAnimeToonWizardState());
    expect(state.step).toBe("select");
    expect(state.draft).toBeNull();
  });

  it("뒤로 가면 결과 초안을 버리고 미리보기로, 미리보기에서는 처음으로 돌아간다", () => {
    let state = selectAnimeToonSource(createAnimeToonWizardState(), makeEpisode());
    state = generateAnimeToonDraft(state, { random: deterministicRandom() });
    state = backAnimeToonStep(state);
    expect(state.step).toBe("preview");
    expect(state.draft).toBeNull();
    expect(state.source).not.toBeNull();
    state = backAnimeToonStep(state);
    expect(state.step).toBe("select");
    expect(state.source).toBeNull();
  });

  it("결과 단계에서 제목을 고치면 초안에 반영된다", () => {
    let state = selectAnimeToonSource(createAnimeToonWizardState(), makeEpisode());
    state = generateAnimeToonDraft(state, { random: deterministicRandom() });
    state = renameAnimeToonDraft(state, "고친 제목");
    expect(state.draft?.titleKo).toBe("고친 제목");
    expect(state.draftTitleKo).toBe("고친 제목");
  });
});
