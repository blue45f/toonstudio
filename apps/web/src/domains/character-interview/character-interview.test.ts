import { describe, expect, it } from "vitest";

import type { StudioStoryBible } from "../creator/studio-story-bible";
import type {
  StudioStoryBibleNarrative,
  StudioStoryCharacterProfile,
} from "../creator/planning/studio-character-profile";

import {
  buildCharacterInterviewCanon,
  buildInterviewMemo,
  buildInterviewQuestionChips,
  findInterviewExchange,
  interviewMemoSheetPatch,
  type CharacterInterviewMessage,
} from "./character-interview";

const profile: StudioStoryCharacterProfile = {
  characterId: "char-1",
  personality: "겉은 차갑지만 약자를 보면 못 지나친다.",
  speechStyle: "짧은 존댓말. 감정이 흔들리면 옛날식 말투가 섞인다.",
  background: "몰락한 기사의 집안에서 자랐다.",
  motivation: "동생을 지키는 것.",
  signatureLines: ["지키겠다고 했으면, 지켜야지요."],
  appearanceNotes: "왼쪽 눈썹에 흉터.",
};

const bible: StudioStoryBible = {
  projectId: "p1",
  characters: [
    { id: "char-1", name: "서연", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
    { id: "char-2", name: "도윤", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
  ],
  locations: [],
  facts: [
    { id: "f1", label: "서연은 검술 대회 우승자", characterIds: ["char-1"], locationId: null },
    { id: "f2", label: "다른 사실", characterIds: ["char-2"], locationId: null },
  ],
};

const narrative: StudioStoryBibleNarrative = {
  profiles: [profile],
  relations: [
    { id: "r1", fromCharacterId: "char-1", toCharacterId: "char-2", kind: "friend", label: "소꿉친구", note: "" },
  ],
};

const NOW = "2026-10-14T00:00:00.000Z";

describe("buildCharacterInterviewCanon — 캐논 시트 근거 고정", () => {
  it("시트 값만으로 엔진 프로필을 만들고 공개는 끈다", () => {
    const canon = buildCharacterInterviewCanon(bible, narrative, "char-1", {
      workTitle: "달의 기사",
      now: NOW,
    });
    expect(canon).not.toBeNull();
    expect(canon!.profile.characterName).toBe("서연");
    expect(canon!.profile.chatEnabled).toBe(false);
    expect(canon!.profile.canonSheetId).toBe("char-1");
    expect(canon!.profile.speechStyle).toContain("짧은 존댓말");
    expect(canon!.profile.personality).toContain("겉은 차갑지만");
    expect(canon!.profile.personality).toContain("동생을 지키는 것");
    expect(canon!.profile.worldview).toContain("몰락한 기사의 집안");
    expect(canon!.profile.worldview).toContain("지키겠다고 했으면");
    expect(canon!.profile.worldview).toContain("검술 대회 우승자");
    expect(canon!.profile.worldview).not.toContain("다른 사실");
    expect(canon!.profile.appearanceHint).toContain("흉터");
    expect(canon!.grounding.grounded).toBe(true);
    expect(canon!.grounding.missingFields).toEqual([]);
    expect(canon!.grounding.relationLabels).toEqual(["도윤 — 소꿉친구"]);
  });

  it("모르는 캐릭터는 null이다", () => {
    expect(buildCharacterInterviewCanon(bible, narrative, "nope")).toBeNull();
  });

  it("시트가 없으면 grounded=false이고 빈 필드가 그대로 드러난다", () => {
    const canon = buildCharacterInterviewCanon(bible, { profiles: [], relations: [] }, "char-2");
    expect(canon).not.toBeNull();
    expect(canon!.grounding.grounded).toBe(false);
    expect(canon!.grounding.needsProfile).toBe(true);
    expect(canon!.grounding.missingFields).toContain("personality");
    expect(canon!.grounding.missingFields).toContain("speechStyle");
    expect(canon!.profile.personality).toBe("");
    expect(canon!.profile.speechStyle).toBe("");
  });

  it("말투만 비어도 grounded=false이다(말투 검증이 인터뷰의 핵심)", () => {
    const partial: StudioStoryCharacterProfile = { ...profile, speechStyle: "  " };
    const canon = buildCharacterInterviewCanon(
      bible,
      { profiles: [partial], relations: [] },
      "char-1",
    );
    expect(canon!.grounding.grounded).toBe(false);
    expect(canon!.grounding.missingFields).toEqual(["speechStyle"]);
  });
});

describe("buildInterviewQuestionChips", () => {
  it("고정된 근거가 있는 항목의 칩만 낸다", () => {
    const canon = buildCharacterInterviewCanon(bible, narrative, "char-1")!;
    const chips = buildInterviewQuestionChips(canon);
    expect(chips.some((chip) => chip.includes("지키고 싶은"))).toBe(true);
    expect(chips.some((chip) => chip.includes("대표 대사"))).toBe(true);
    const bare = buildCharacterInterviewCanon(bible, { profiles: [], relations: [] }, "char-2")!;
    const bareChips = buildInterviewQuestionChips(bare);
    expect(bareChips.some((chip) => chip.includes("대표 대사"))).toBe(false);
  });
});

const authorMsg: CharacterInterviewMessage = {
  id: "m1",
  role: "author",
  text: "화가 나면 어떻게 말해?",
  createdAt: NOW,
};
const answerMsg: CharacterInterviewMessage = {
  id: "m2",
  role: "character",
  text: "…됐습니다.  그만하시지요.",
  createdAt: NOW,
};

describe("설정 메모", () => {
  it("교환(질문+답변)을 찾고 답변만 메모가 된다", () => {
    const exchange = findInterviewExchange([authorMsg, answerMsg], "m2");
    expect(exchange?.question?.id).toBe("m1");
    expect(findInterviewExchange([authorMsg, answerMsg], "m1")).toBeNull();
    expect(findInterviewExchange([authorMsg], "nope")).toBeNull();
  });

  it("메모 빌더는 본문을 정규화하고 원천을 남긴다", () => {
    const memo = buildInterviewMemo({
      characterId: "char-1",
      characterName: "서연",
      kind: "speech",
      answer: answerMsg,
      question: authorMsg,
      now: NOW,
      id: "memo-1",
    });
    expect(memo).not.toBeNull();
    // NFKC 정규화로 말줄임표(…)는 "..."가 된다 — 메모 빌더의 정규화 계약 그대로 고정한다.
    expect(memo!.body).toBe("...됐습니다. 그만하시지요.");
    expect(memo!.questionText).toBe("화가 나면 어떻게 말해?");
    expect(memo!.sourceAnswerId).toBe("m2");
    expect(memo!.title).toContain("말투");
  });

  it("작가 메시지나 빈 답변은 메모가 되지 않는다", () => {
    expect(
      buildInterviewMemo({
        characterId: "char-1",
        characterName: "서연",
        kind: "free",
        answer: authorMsg,
      }),
    ).toBeNull();
    expect(
      buildInterviewMemo({
        characterId: "char-1",
        characterName: "서연",
        kind: "free",
        answer: { ...answerMsg, text: "   " },
      }),
    ).toBeNull();
  });

  it("시트 패치는 덧붙이되 중복은 막고 free는 패치가 없다", () => {
    const memo = buildInterviewMemo({
      characterId: "char-1",
      characterName: "서연",
      kind: "speech",
      answer: answerMsg,
      now: NOW,
    })!;
    const patch = interviewMemoSheetPatch(memo, profile);
    expect(patch?.field).toBe("speechStyle");
    expect(patch?.alreadyReflected).toBe(false);
    expect(patch?.nextValue).toBe(`${profile.speechStyle}\n${memo.body}`);

    const reflected = interviewMemoSheetPatch(memo, {
      ...profile,
      speechStyle: `${profile.speechStyle}\n${memo.body}`,
    });
    expect(reflected?.alreadyReflected).toBe(true);
    expect(reflected?.nextValue).toBe(`${profile.speechStyle}\n${memo.body}`);

    const freeMemo = buildInterviewMemo({
      characterId: "char-1",
      characterName: "서연",
      kind: "free",
      answer: answerMsg,
      now: NOW,
    })!;
    expect(interviewMemoSheetPatch(freeMemo, profile)).toBeNull();
  });
});
