import { describe, expect, it } from "vitest";

import type { StoryworldCharacter, StoryworldFactDefinition, StoryworldScene } from "../studio-storyworld-causality";
import { createPlausibilityContext } from "./studio-story-plausibility-context";
import {
  PLAUSIBILITY_AGE_TOLERANCE,
  PLAUSIBILITY_RECENT_WINDOW,
  PLAUSIBILITY_REMINDER_GAP,
  detectAgeArithmetic,
  detectDeclaredCoincidences,
  detectMotiveGaps,
  detectUnpreparedResolutions,
} from "./studio-story-plausibility-detectors";
import { HAEUN, makeStory } from "./studio-story-plausibility-golden-fixtures";

function scene(index: number, extra: Partial<StoryworldScene> = {}): StoryworldScene {
  return {
    id: `s${index}`,
    title: `장면 ${index}`,
    order: index * 10,
    timeIndex: index,
    locationId: "집",
    participantIds: ["haeun"],
    ...extra,
  };
}

const ROUTINE: Partial<StoryworldScene> = { effects: [{ factId: "routine", op: "set", value: true }] };
const routineFact: StoryworldFactDefinition = { id: "routine", label: "일상이 이어진다", subjectId: "world", key: "routine" };
const secret: StoryworldFactDefinition = { id: "secret", label: "비밀 통로가 있다", subjectId: "world", key: "secret", initialValue: true };
const RESOLVE: Partial<StoryworldScene> = {
  plausibility: { roles: ["resolution"] },
  preconditions: [{ factId: "secret", comparator: "equals", value: true }],
};

/** 앞 n개는 사실을 모델링한 일상 장면(해결 장면의 준비 구간), 마지막이 해결 장면이다. */
function resolutionStory(options: {
  readonly lead?: number;
  readonly facts?: readonly StoryworldFactDefinition[];
  readonly characters?: readonly StoryworldCharacter[];
  readonly resolve?: Partial<StoryworldScene>;
  readonly mutate?: (scenes: StoryworldScene[]) => void;
}) {
  const lead = options.lead ?? PLAUSIBILITY_RECENT_WINDOW;
  const scenes: StoryworldScene[] = [];
  for (let i = 1; i <= lead; i += 1) scenes.push(scene(i, ROUTINE));
  scenes.push(scene(lead + 1, options.resolve ?? RESOLVE));
  options.mutate?.(scenes);
  return createPlausibilityContext(makeStory("res", "해결", {
    characters: options.characters ?? [HAEUN],
    facts: options.facts ?? [routineFact, secret],
    scenes,
  }));
}

describe("해결이 준비되지 않은 일에 기대는 경우", () => {
  it("앞 6장면이 모두 입력되어 있고 근거를 한 번도 다루지 않았으면 추정 경고 하나", () => {
    const findings = detectUnpreparedResolutions(resolutionStory({}));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      category: "coincidence",
      severity: "warning",
      confidence: "heuristic",
      source: { module: "plausibility", code: "unprepared-resolution" },
      sceneIds: [`s${PLAUSIBILITY_RECENT_WINDOW + 1}`],
    });
    expect(findings[0]?.message).toContain("비밀 통로가 있다");
    expect(findings[0]?.options.some((option) => option.action.kind === "open-questionnaire")).toBe(true);
  });

  it("준비 구간에 입력이 빈 장면이 있으면 판정하지 않는다(입력 누락과 구별)", () => {
    const ctx = resolutionStory({ mutate: (scenes) => { scenes[2] = scene(3); } });
    expect(detectUnpreparedResolutions(ctx)).toEqual([]);
  });

  it("앞 장면이 6개보다 적어도, 있는 장면이 모두 입력되어 있으면 판정한다", () => {
    expect(detectUnpreparedResolutions(resolutionStory({ lead: 2 }))).toHaveLength(1);
  });

  it("첫 장면이 해결 장면이면 판정하지 않는다", () => {
    const ctx = createPlausibilityContext(makeStory("first", "첫 장면", { facts: [secret], scenes: [scene(1, RESOLVE)] }));
    expect(detectUnpreparedResolutions(ctx)).toEqual([]);
  });

  it("해결이 아닌 장면은 같은 모양이어도 판정하지 않는다", () => {
    const ctx = resolutionStory({ resolve: { preconditions: RESOLVE.preconditions ?? [] } });
    expect(detectUnpreparedResolutions(ctx)).toEqual([]);
  });

  it("정본 설정으로 표시한 사실은 앞에서 안 나와도 준비된 것으로 본다", () => {
    const ctx = resolutionStory({ facts: [routineFact, { ...secret, canonical: true }] });
    expect(detectUnpreparedResolutions(ctx)).toEqual([]);
  });

  it("작가가 단서 장면을 지정했으면 판정하지 않는다", () => {
    const ctx = resolutionStory({
      resolve: { ...RESOLVE, plausibility: { roles: ["resolution"], coincidence: { clue: "foreshadowed", clueSceneIds: ["s1"] } } },
    });
    expect(detectUnpreparedResolutions(ctx)).toEqual([]);
  });

  it("복선 계약의 회수 장면이면 엔진의 복선 규칙에 맡기고 판정하지 않는다", () => {
    const ctx = resolutionStory({ resolve: { ...RESOLVE, payoffIds: ["umbrella"] } });
    expect(detectUnpreparedResolutions(ctx)).toEqual([]);
  });

  it("처음 값이 없는 사실은 조용히 성립하지 않으므로 엔진의 오류에 맡긴다", () => {
    const { initialValue: _unused, ...withoutInitial } = secret;
    const ctx = resolutionStory({ facts: [routineFact, withoutInitial] });
    expect(detectUnpreparedResolutions(ctx)).toEqual([]);
  });

  it("바로 앞 장면에서 근거를 다뤘다면 준비된 것이다", () => {
    const ctx = resolutionStory({
      mutate: (scenes) => { scenes[PLAUSIBILITY_RECENT_WINDOW - 1] = scene(PLAUSIBILITY_RECENT_WINDOW, { reveals: [{ factId: "secret", audiences: ["reader"] }] }); },
    });
    expect(detectUnpreparedResolutions(ctx)).toEqual([]);
  });

  it("마지막 언급이 8장면 미만 전이면 조용하고, 8장면 이상 전이면 상기 제안만 낸다", () => {
    const build = (touchAt: number) => resolutionStory({
      lead: 9,
      mutate: (scenes) => { scenes[touchAt - 1] = scene(touchAt, { reveals: [{ factId: "secret", audiences: ["reader"] }] }); },
    });
    // 해결 장면은 10번째(인덱스 9). 인덱스 2(=3번째 장면)에서 언급하면 간격 7.
    expect(detectUnpreparedResolutions(build(3))).toEqual([]);
    const stale = detectUnpreparedResolutions(build(2));
    expect(PLAUSIBILITY_REMINDER_GAP).toBe(8);
    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatchObject({ severity: "suggestion", confidence: "heuristic", source: { code: "stale-preparation" } });
  });

  it("인물의 처음 지식으로 조용히 성립하는 지식 사용도 같은 규칙으로 본다", () => {
    const ctx = resolutionStory({
      characters: [{ ...HAEUN, initialFactIds: ["secret"] }],
      resolve: { plausibility: { roles: ["resolution"] }, knowledgeUses: [{ characterId: "haeun", factId: "secret" }] },
    });
    const findings = detectUnpreparedResolutions(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.source.code).toBe("unprepared-resolution");
  });

  it("사용하지 않는 장면은 준비 구간에서 세지 않는다", () => {
    const ctx = resolutionStory({ mutate: (scenes) => { scenes[0] = scene(1, { disabled: true }); } });
    expect(detectUnpreparedResolutions(ctx)).toHaveLength(1);
  });

  it("같은 입력이면 같은 id가 나온다", () => {
    const a = detectUnpreparedResolutions(resolutionStory({}));
    const b = detectUnpreparedResolutions(resolutionStory({}));
    expect(a.map((finding) => finding.id)).toEqual(b.map((finding) => finding.id));
  });
});

describe("작가가 우연이라고 답한 장면", () => {
  const ctxWith = (target: Partial<StoryworldScene>) =>
    createPlausibilityContext(makeStory("co", "우연", { scenes: [scene(1), scene(2), scene(3, target)] }));

  it("해결 장면에서 단서가 없다고 답하면 확정 경고, 그 밖의 장면은 제안이다", () => {
    const resolution = detectDeclaredCoincidences(ctxWith({ plausibility: { roles: ["resolution"], coincidence: { clue: "none" } } }));
    expect(resolution).toHaveLength(1);
    expect(resolution[0]).toMatchObject({ severity: "warning", confidence: "certain", title: "해결이 단서 없는 우연에 기대요" });
    const other = detectDeclaredCoincidences(ctxWith({ plausibility: { coincidence: { clue: "none" } } }));
    expect(other[0]).toMatchObject({ severity: "suggestion", confidence: "certain" });
  });

  it("모르겠다고 답하면 제안 하나만 낸다", () => {
    const findings = detectDeclaredCoincidences(ctxWith({ plausibility: { coincidence: { clue: "unknown" } } }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "suggestion", source: { code: "coincidence-undecided" } });
  });

  it("앞에 단서가 있다고 답했는데 단서 장면이 없으면 오류", () => {
    const findings = detectDeclaredCoincidences(ctxWith({ plausibility: { coincidence: { clue: "foreshadowed" } } }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "error", confidence: "certain", source: { code: "coincidence-clue-order" } });
  });

  it("단서 장면이 이 장면보다 뒤이거나 자기 자신이면 오류, 앞 장면이면 조용하다", () => {
    const later = createPlausibilityContext(makeStory("co", "우연", {
      scenes: [scene(1, { plausibility: { coincidence: { clue: "foreshadowed", clueSceneIds: ["s2"] } } }), scene(2)],
    }));
    expect(detectDeclaredCoincidences(later)[0]?.severity).toBe("error");
    const self = detectDeclaredCoincidences(ctxWith({ plausibility: { coincidence: { clue: "foreshadowed", clueSceneIds: ["s3"] } } }));
    expect(self[0]?.severity).toBe("error");
    const earlier = detectDeclaredCoincidences(ctxWith({ plausibility: { coincidence: { clue: "foreshadowed", clueSceneIds: ["s1", "s2"] } } }));
    expect(earlier).toEqual([]);
  });

  it("사용하지 않는 장면을 단서로 지정하면 오류", () => {
    const ctx = createPlausibilityContext(makeStory("co", "우연", {
      scenes: [scene(1, { disabled: true }), scene(2, { plausibility: { coincidence: { clue: "foreshadowed", clueSceneIds: ["s1"] } } })],
    }));
    expect(detectDeclaredCoincidences(ctx)[0]?.severity).toBe("error");
  });

  it("답이 없는 장면은 아무것도 만들지 않는다", () => {
    expect(detectDeclaredCoincidences(ctxWith({}))).toEqual([]);
  });
});

describe("동기 공백", () => {
  const ctxWith = (target: Partial<StoryworldScene>, characters: readonly StoryworldCharacter[] = [HAEUN]) =>
    createPlausibilityContext(makeStory("mo", "동기", { characters, scenes: [scene(1), scene(2, target)] }));

  it("결정 장면에서 동기를 모른다고 답한 인물이 있으면 제안", () => {
    const findings = detectMotiveGaps(ctxWith({
      plausibility: { roles: ["decision"], motives: [{ characterId: "haeun", basis: "unknown" }], answers: { motive: "unknown" } },
    }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ category: "motive", severity: "suggestion", confidence: "certain", source: { code: "motive-gap" } });
    expect(findings[0]?.message).toContain("하은");
  });

  it("동기를 골랐다면 조용하다(바라는 것·앞선 사건·감정)", () => {
    for (const basis of ["goal", "emotion"] as const) {
      expect(detectMotiveGaps(ctxWith({ plausibility: { roles: ["decision"], motives: [{ characterId: "haeun", basis }] } }))).toEqual([]);
    }
  });

  it("결정 장면이 아니면 모른다고 답해도 공백으로 보지 않는다", () => {
    expect(detectMotiveGaps(ctxWith({ plausibility: { motives: [{ characterId: "haeun", basis: "unknown" }] } }))).toEqual([]);
  });

  it("인물을 정하지 않고 동기 전체를 모른다고 답한 결정 장면도 알린다", () => {
    const findings = detectMotiveGaps(ctxWith({ plausibility: { roles: ["decision"], answers: { motive: "unknown" } } }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("중요한 선택에 이유가 있는지");
  });

  it("동기가 되는 사건이 뒤에 있으면 오류, 앞에 있으면 조용하다", () => {
    const after = detectMotiveGaps(ctxWith({ plausibility: { motives: [{ characterId: "haeun", basis: "event", causeSceneId: "s2" }] } }));
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ severity: "error", source: { code: "motive-source-after" } });
    expect(detectMotiveGaps(ctxWith({ plausibility: { motives: [{ characterId: "haeun", basis: "event", causeSceneId: "s1" }] } }))).toEqual([]);
  });

  it("‘바라는 것’이 동기라고 했는데 인물 설정이 비어 있으면 제안", () => {
    const noGoal: StoryworldCharacter = { id: "haeun", name: "하은" };
    const findings = detectMotiveGaps(ctxWith({ plausibility: { motives: [{ characterId: "haeun", basis: "goal" }] } }, [noGoal]));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.source.code).toBe("motive-goal-missing");
    expect(detectMotiveGaps(ctxWith({ plausibility: { motives: [{ characterId: "haeun", basis: "goal" }] } }))).toEqual([]);
  });
});

describe("나이·연도 산술", () => {
  const birth2000: StoryworldCharacter = { ...HAEUN, birthYear: 2000 };
  const ctxWith = (scenes: readonly StoryworldScene[], characters: readonly StoryworldCharacter[] = [birth2000]) =>
    createPlausibilityContext(makeStory("age", "나이", { characters, scenes }));

  it("생일 때문에 한 살 어긋나는 것은 모순이 아니다", () => {
    expect(PLAUSIBILITY_AGE_TOLERANCE).toBe(1);
    for (const age of [24, 25, 26]) {
      expect(detectAgeArithmetic(ctxWith([scene(1, { storyYear: 2025, statedAges: [{ characterId: "haeun", age }] })]))).toEqual([]);
    }
  });

  it("두 살 이상 어긋나면 확정 오류", () => {
    for (const age of [22, 28]) {
      const findings = detectAgeArithmetic(ctxWith([scene(1, { storyYear: 2025, statedAges: [{ characterId: "haeun", age }] })]));
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ severity: "error", confidence: "certain", category: "character-consistency", source: { code: "age-mismatch" } });
    }
  });

  it("태어난 해, 장면의 연도, 나이 중 하나라도 비면 판정하지 않는다", () => {
    expect(detectAgeArithmetic(ctxWith([scene(1, { storyYear: 2025, statedAges: [{ characterId: "haeun", age: 99 }] })], [HAEUN]))).toEqual([]);
    expect(detectAgeArithmetic(ctxWith([scene(1, { statedAges: [{ characterId: "haeun", age: 99 }] })]))).toEqual([]);
    expect(detectAgeArithmetic(ctxWith([scene(1, { storyYear: 2025 })]))).toEqual([]);
  });

  it("태어난 해보다 앞선 연도의 장면에 등장하면 확정 경고", () => {
    const findings = detectAgeArithmetic(ctxWith([scene(1, { storyYear: 1990 })]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "warning", confidence: "certain", source: { code: "appears-before-birth" } });
    expect(detectAgeArithmetic(ctxWith([scene(1, { storyYear: 2000 })]))).toEqual([]);
  });

  it("해가 흐른 만큼 나이가 변하지 않으면 확정 오류, 맞으면 조용하다(태어난 해가 없어도)", () => {
    const bad = detectAgeArithmetic(ctxWith([
      scene(1, { storyYear: 2010, statedAges: [{ characterId: "haeun", age: 10 }] }),
      scene(2, { storyYear: 2015, statedAges: [{ characterId: "haeun", age: 12 }] }),
    ], [HAEUN]));
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatchObject({ severity: "error", source: { code: "age-progression" } });
    const good = detectAgeArithmetic(ctxWith([
      scene(1, { storyYear: 2010, statedAges: [{ characterId: "haeun", age: 10 }] }),
      scene(2, { storyYear: 2015, statedAges: [{ characterId: "haeun", age: 15 }] }),
    ], [HAEUN]));
    expect(good).toEqual([]);
  });

  it("장면 순서와 이야기 속 연도 순서가 달라도(회상) 연도 기준으로 비교한다", () => {
    const findings = detectAgeArithmetic(ctxWith([
      scene(1, { storyYear: 2015, statedAges: [{ characterId: "haeun", age: 15 }] }),
      scene(2, { storyYear: 2010, statedAges: [{ characterId: "haeun", age: 10 }] }),
    ], [HAEUN]));
    expect(findings).toEqual([]);
  });

  it("알 수 없는 인물을 가리키는 나이는 건너뛴다", () => {
    expect(detectAgeArithmetic(ctxWith([scene(1, { storyYear: 2025, statedAges: [{ characterId: "ghost", age: 3 }] })]))).toEqual([]);
  });
});
