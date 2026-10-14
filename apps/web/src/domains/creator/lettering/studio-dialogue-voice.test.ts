import { describe, expect, it } from "vitest";

import type { DialogueBatchItem } from "./studio-dialogue-batch";
import {
  buildVoiceFingerprint,
  buildVoiceProfiles,
  countDialogueEojeol,
  dismissVoiceDeviation,
  evaluateVoiceFingerprintEligibility,
  extractSentenceEnding,
  findVoiceDeviations,
  setEpisodeVoiceException,
  splitDialogueSentences,
  voiceDeviationKey,
  voiceDeviationOptionsFromDispositions,
  voiceLinesFromDialogueItems,
  EMPTY_VOICE_DISPOSITIONS,
  VOICE_FINGERPRINT_MIN_ATTRIBUTION,
  VOICE_FINGERPRINT_MIN_SAMPLES,
  type VoiceAttributedLine,
} from "./studio-dialogue-voice";

const NOW = "2026-10-14T00:00:00.000Z";

/** 반말·짧은 문장 캐릭터 "민수"의 표본 대사 — 어미는 어/야/지 중심. */
function minsuLine(id: string, n: number): VoiceAttributedLine {
  const texts = [
    "알았어.",
    "그건 내가 할게. 걱정 마.",
    "뭐야, 진짜야?",
    "됐어. 그만해.",
    "같이 가. 혼자 가면 위험해.",
    "몰라. 물어보지 마.",
    "야, 그거 내 거야.",
    "빨리 와. 늦겠어.",
    "싫어. 안 해.",
    "그럼 네가 해. 난 빠질게.",
  ];
  return { id, text: texts[n % texts.length] ?? "알았어.", speakerId: "minsu", episodeId: "ep-1" };
}

function corpus(
  characterCount: number,
  unattributedCount = 0,
): VoiceAttributedLine[] {
  const lines: VoiceAttributedLine[] = [];
  for (let i = 0; i < characterCount; i += 1) lines.push(minsuLine(`m-${i}`, i));
  for (let i = 0; i < unattributedCount; i += 1) {
    lines.push({ id: `u-${i}`, text: "누구의 대사인지 모른다.", speakerId: null });
  }
  return lines;
}

describe("문장·어미 분석", () => {
  it("문장을 종결 부호와 줄바꿈으로 나누고 빈 문장을 버린다", () => {
    expect(splitDialogueSentences("갔어? 정말로!\n응.\n\n")).toEqual(["갔어?", "정말로!", "응."]);
    expect(splitDialogueSentences("  ")).toEqual([]);
  });

  it("어절 수를 공백 기준으로 센다", () => {
    expect(countDialogueEojeol("같이 가. 혼자 가면 위험해.")).toBe(5);
    expect(countDialogueEojeol("")).toBe(0);
  });

  it("긴 어미를 짧은 어미보다 먼저 분류한다(해요 ≠ 요)", () => {
    expect(extractSentenceEnding("지금 갈게요.")).toEqual({ ending: "요", politeness: "polite" });
    expect(extractSentenceEnding("제가 하겠습니다")).toEqual({
      ending: "겠습니다",
      politeness: "formal",
    });
    expect(extractSentenceEnding("알았어")).toEqual({ ending: "어", politeness: "casual" });
    expect(extractSentenceEnding("그는 떠났다")).toEqual({ ending: "다", politeness: "plain" });
    // 분류표에 없는 끝맺음은 지어내지 않고 "기타"로 둔다.
    expect(extractSentenceEnding("쾅")).toEqual({ ending: "기타", politeness: "unknown" });
  });
});

describe("자격 판정 — 표본·귀속률 미달이면 지문을 만들지 않는다", () => {
  it("표본 30개·귀속률 100%면 자격을 얻는다", () => {
    const eligibility = evaluateVoiceFingerprintEligibility({
      totalLineCount: 30,
      attributedLineCount: 30,
      characterLineCount: 30,
    });
    expect(eligibility).toMatchObject({ ok: true, reason: null });
  });

  it("표본이 29개면 insufficient-samples 로 막힌다", () => {
    const eligibility = evaluateVoiceFingerprintEligibility({
      totalLineCount: 29,
      attributedLineCount: 29,
      characterLineCount: 29,
    });
    expect(eligibility.ok).toBe(false);
    expect(eligibility.reason).toBe("insufficient-samples");
    expect(eligibility.message).toContain(String(VOICE_FINGERPRINT_MIN_SAMPLES));
  });

  it("귀속률 60% 미만이면 표본이 충분해도 low-attribution 으로 막힌다", () => {
    // 전체 100개 중 귀속 59개, 그중 이 캐릭터 40개.
    const eligibility = evaluateVoiceFingerprintEligibility({
      totalLineCount: 100,
      attributedLineCount: 59,
      characterLineCount: 40,
    });
    expect(eligibility.ok).toBe(false);
    expect(eligibility.reason).toBe("low-attribution");
    expect(eligibility.attributionRatio).toBeCloseTo(0.59);
    expect(eligibility.message).toContain("59%");
  });

  it("대사가 없으면 no-lines", () => {
    expect(
      evaluateVoiceFingerprintEligibility({
        totalLineCount: 0,
        attributedLineCount: 0,
        characterLineCount: 0,
      }).reason,
    ).toBe("no-lines");
  });

  it("buildVoiceFingerprint 는 자격 미달이면 null 이다", () => {
    expect(
      buildVoiceFingerprint({ characterId: "minsu", lines: corpus(29), now: NOW }),
    ).toBeNull();
    expect(
      buildVoiceFingerprint({
        characterId: "minsu",
        // 캐릭터 표본 40개지만 전체 100개 중 귀속 59개 → 귀속률 미달.
        lines: [...corpus(40), ...corpus(19).map((l, i) => ({ ...l, id: `j-${i}`, speakerId: "jisu" })), ...Array.from({ length: 41 }, (_, i) => ({ id: `x-${i}`, text: "모른다.", speakerId: null }))],
        now: NOW,
      }),
    ).toBeNull();
  });
});

describe("지문 집계", () => {
  it("어미 분포·평균 길이·대표 표현·말투 경향을 집계한다", () => {
    const fingerprint = buildVoiceFingerprint({
      characterId: "minsu",
      lines: corpus(VOICE_FINGERPRINT_MIN_SAMPLES),
      now: NOW,
    });
    expect(fingerprint).not.toBeNull();
    expect(fingerprint?.sampleLineCount).toBe(30);
    expect(fingerprint?.attributionRatio).toBe(1);
    expect(fingerprint?.totalLineCount).toBe(30);
    // 분포 비율 합은 1 (분류된 문장 기준).
    const ratioSum = (fingerprint?.endingDistribution ?? []).reduce(
      (sum, stat) => sum + stat.ratio,
      0,
    );
    expect(ratioSum).toBeCloseTo(1);
    // 반말 캐릭터라 casual 이 주 경향.
    expect(fingerprint?.dominantPoliteness?.level).toBe("casual");
    expect(fingerprint?.averageSentenceLength).toBeGreaterThan(0);
    expect(fingerprint?.sentenceLengthStdDev).toBeGreaterThanOrEqual(0);
    // 자주 쓰는 표현이 대표 표현으로 잡힌다("그건/내가" 반복 대사 3회 등장).
    expect((fingerprint?.signaturePhrases ?? []).length).toBeGreaterThan(0);
  });

  it("고정 대표 표현은 집계보다 앞에 오고, 금지 표현은 규칙에 그대로 남는다", () => {
    const fingerprint = buildVoiceFingerprint({
      characterId: "minsu",
      lines: corpus(30),
      authorRules: {
        forbiddenPhrases: ["존경합니다"],
        pinnedSignaturePhrases: ["됐거든"],
        notes: "",
      },
      now: NOW,
    });
    expect(fingerprint?.signaturePhrases[0]).toMatchObject({ phrase: "됐거든", pinned: true });
    expect(fingerprint?.authorRules.forbiddenPhrases).toEqual(["존경합니다"]);
  });

  it("buildVoiceProfiles 는 캐릭터별로 지문 또는 사유를 돌려준다", () => {
    const lines = [...corpus(30), { id: "j-0", text: "네, 알겠습니다.", speakerId: "jisu" }];
    const results = buildVoiceProfiles({ lines, characterIds: ["minsu", "jisu"], now: NOW });
    expect(results[0]?.fingerprint).not.toBeNull();
    expect(results[1]?.fingerprint).toBeNull();
    expect(results[1]?.eligibility.reason).toBe("insufficient-samples");
  });
});

describe("귀속 어댑터 — 모르는 화자는 지어내지 않는다", () => {
  function item(partial: Partial<DialogueBatchItem> & { id: string }): DialogueBatchItem {
    return {
      pageId: "p1",
      pageIndex: 0,
      elType: "bubble",
      text: "대사",
      hidden: false,
      locked: false,
      ...partial,
    };
  }

  it("맵에 없는 대사는 speakerId null, 숨김 대사는 기본 제외", () => {
    const lines = voiceLinesFromDialogueItems(
      [item({ id: "a", text: "안녕" }), item({ id: "b", text: "숨김", hidden: true }), item({ id: "c", text: "누구?" })],
      new Map([["a", "minsu"]]),
      new Map([["a", "ep-1"]]),
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ id: "a", speakerId: "minsu", episodeId: "ep-1" });
    expect(lines[1]).toMatchObject({ id: "c", speakerId: null, episodeId: null });
    // 전체 2개 중 귀속 1개 → 귀속률 0.5 (상수로 고정된 기준과 비교 가능).
    expect(VOICE_FINGERPRINT_MIN_ATTRIBUTION).toBe(0.6);
  });
});

describe("이탈 제안 — 제안만 하고, 무시·회차 예외가 가능하다", () => {
  const fingerprint = buildVoiceFingerprint({
    characterId: "minsu",
    lines: corpus(30),
    authorRules: { forbiddenPhrases: ["감사합니다"], pinnedSignaturePhrases: [], notes: "" },
    now: NOW,
  })!;

  it("존댓말로 쓴 대사는 ending-shift 제안이 된다(자동 수정안 없음)", () => {
    const deviations = findVoiceDeviations({
      fingerprint,
      lines: [
        { id: "d-1", text: "네, 제가 모시고 가겠습니다. 걱정하지 마세요.", speakerId: "minsu", episodeId: "ep-2" },
      ],
    });
    const shift = deviations.find((d) => d.kind === "ending-shift");
    expect(shift).toBeDefined();
    expect(shift?.lineId).toBe("d-1");
    // 제안에는 고치기 후보가 없다 — 타입에도, 값에도 없다.
    expect(shift).not.toHaveProperty("fix");
    expect(shift).not.toHaveProperty("replacement");
  });

  it("금지 표현은 통계와 무관하게 forbidden-phrase 제안이 된다", () => {
    const deviations = findVoiceDeviations({
      fingerprint,
      lines: [{ id: "d-2", text: "감사합니다.", speakerId: "minsu", episodeId: "ep-2" }],
    });
    expect(deviations.some((d) => d.kind === "forbidden-phrase")).toBe(true);
  });

  it("유난히 긴 대사는 length-outlier 제안이 된다", () => {
    const longText =
      "그때 말이야 사실은 내가 어제 밤에 혼자서 그 골목을 지나가다가 우연히 예전에 잃어버렸던 물건을 발견해서 얼마나 놀랐는지 몰라 정말로.";
    const deviations = findVoiceDeviations({
      fingerprint,
      lines: [{ id: "d-3", text: longText, speakerId: "minsu", episodeId: "ep-2" }],
    });
    expect(deviations.some((d) => d.kind === "length-outlier")).toBe(true);
  });

  it("평소 말투와 같은 대사는 제안이 없다", () => {
    const deviations = findVoiceDeviations({
      fingerprint,
      lines: [{ id: "d-4", text: "알았어. 같이 가.", speakerId: "minsu", episodeId: "ep-2" }],
    });
    expect(deviations).toHaveLength(0);
  });

  it("다른 캐릭터의 대사와 빈 대사는 보지 않는다", () => {
    const deviations = findVoiceDeviations({
      fingerprint,
      lines: [
        { id: "d-5", text: "제가 하겠습니다. 마세요.", speakerId: "jisu", episodeId: "ep-2" },
        { id: "d-6", text: "  ", speakerId: "minsu", episodeId: "ep-2" },
      ],
    });
    expect(deviations).toHaveLength(0);
  });

  it("무시한 제안은 다시 나오지 않는다", () => {
    const line: VoiceAttributedLine = {
      id: "d-7",
      text: "네, 제가 모시고 가겠습니다. 걱정하지 마세요.",
      speakerId: "minsu",
      episodeId: "ep-2",
    };
    const first = findVoiceDeviations({ fingerprint, lines: [line] });
    expect(first.length).toBeGreaterThan(0);
    const key = voiceDeviationKey("d-7", "ending-shift");
    const dispositions = dismissVoiceDeviation(EMPTY_VOICE_DISPOSITIONS, key);
    const second = findVoiceDeviations({
      fingerprint,
      lines: [line],
      options: voiceDeviationOptionsFromDispositions(dispositions),
    });
    expect(second.some((d) => d.kind === "ending-shift")).toBe(false);
  });

  it("회차 예외로 지정하면 그 회차 대사는 전부 제안에서 빠지고, 해제하면 돌아온다", () => {
    const line: VoiceAttributedLine = {
      id: "d-8",
      text: "네, 제가 모시고 가겠습니다. 걱정하지 마세요.",
      speakerId: "minsu",
      episodeId: "ep-2",
    };
    const excepted = setEpisodeVoiceException(EMPTY_VOICE_DISPOSITIONS, "ep-2", true);
    expect(
      findVoiceDeviations({
        fingerprint,
        lines: [line],
        options: voiceDeviationOptionsFromDispositions(excepted),
      }),
    ).toHaveLength(0);
    const released = setEpisodeVoiceException(excepted, "ep-2", false);
    expect(
      findVoiceDeviations({
        fingerprint,
        lines: [line],
        options: voiceDeviationOptionsFromDispositions(released),
      }).length,
    ).toBeGreaterThan(0);
  });

  it("대사 단위 예외(exceptedLineIds)도 동작한다", () => {
    const line: VoiceAttributedLine = {
      id: "d-9",
      text: "감사합니다.",
      speakerId: "minsu",
      episodeId: "ep-3",
    };
    expect(
      findVoiceDeviations({
        fingerprint,
        lines: [line],
        options: { exceptedLineIds: new Set(["d-9"]) },
      }),
    ).toHaveLength(0);
  });
});
