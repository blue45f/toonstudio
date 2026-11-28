import { describe, expect, it } from "vitest";
import {
  analyzeKoreanPunctuation,
  assignVoiceActorsWithoutSceneCollision,
  buildSceneInterferenceGraph,
  canonicalizeVoiceJson,
  compileVoiceActingProsodyScript,
  countKoreanSpeakableSyllables,
  countUnintendedDialogueOverlaps,
  escapeVoiceXml,
  inferAcousticReverbTag,
  inferVoiceDeliveryStyle,
  renderVoiceCastTimelineSvg,
  sha256VoiceUtf8Hex,
  summarizeVoiceCastScriptKo,
  type DialogueBalloonStyle,
  type EpisodeDialogueCueInput,
  type VoiceActorProfile,
} from "./index";

function makeCue(
  lineId: string,
  sceneId: string,
  cutId: string,
  characterId: string,
  textKo: string,
  balloonStyle: DialogueBalloonStyle = "oval-normal",
  extra?: Partial<EpisodeDialogueCueInput>,
): EpisodeDialogueCueInput {
  return { lineId, sceneId, cutId, characterId, textKo, balloonStyle, ...extra };
}

function makeStandardActors(): readonly VoiceActorProfile[] {
  return [
    {
      actorId: "va-minsu",
      nameKo: "김민수",
      vocalTier: "lead",
      fixedLeadCharacterIds: ["char-hero"],
      maxConsecutiveShoutLines: 3,
      hourlyRateKrw: 240000,
    },
    { actorId: "va-seoyeon", nameKo: "박서연", vocalTier: "lead", maxConsecutiveShoutLines: 3, hourlyRateKrw: 220000 },
    { actorId: "va-jihun", nameKo: "이지훈", vocalTier: "supporting", maxConsecutiveShoutLines: 3, hourlyRateKrw: 170000 },
    { actorId: "va-yujin", nameKo: "정유진", vocalTier: "narrator", maxConsecutiveShoutLines: 3, hourlyRateKrw: 190000 },
  ];
}

function makeEpisodeDialogueSample(): readonly EpisodeDialogueCueInput[] {
  return [
    makeCue("L01", "S01", "C01", "char-narrator", "비 내리는 골목 끝에서 모든 사건이 시작됐다.", "narration-box", { characterNameKo: "해설" }),
    makeCue("L02", "S01", "C02", "char-hero", "거기 서! 도망치지 마!!", "shout-jagged", { characterNameKo: "강하늘" }),
    makeCue("L03", "S01", "C03", "char-rival", "흥, 아직도 날 쫓아오다니...", "oval-normal", { characterNameKo: "윤도현" }),
    makeCue("L04", "S01", "C04", "char-hero", "이번엔 절대 놓치지 않는다!", "oval-normal", { characterNameKo: "강하늘", overlapInterrupt: true }),
    makeCue("L05", "S02", "C05", "char-hero", "저 녀석 눈빛이 예전과 달라...", "thought-cloud", { characterNameKo: "강하늘" }),
    makeCue("L06", "S02", "C06", "char-partner", "조용히 해... 저쪽에서 발소리가 들려.", "whisper-dashed", { characterNameKo: "한서아" }),
    makeCue("L07", "S02", "C07", "char-hq", "본부다. 현 위치 즉시 보고하라!", "phone-radio", { characterNameKo: "관제실" }),
  ];
}

describe("Wave 128 — 한국어 대사 운율·감정·호흡 및 타임라인 컴파일러", () => {
  it("6종 말풍선 스타일별 연기 전달 톤과 음향 리버브 태그를 정확히 분류한다", () => {
    const script = compileVoiceActingProsodyScript([
      makeCue("L1", "S1", "C1", "c1", "오늘 날씨가 맑다.", "oval-normal"),
      makeCue("L2", "S1", "C2", "c2", "당장 멈춰!!", "shout-jagged"),
      makeCue("L3", "S1", "C3", "c3", "들키면 안 돼...", "whisper-dashed"),
      makeCue("L4", "S1", "C4", "c4", "설마 그 사람이 범인인가?", "thought-cloud"),
      makeCue("L5", "S1", "C5", "c5", "그날 밤 시계가 멈췄다.", "narration-box"),
      makeCue("L6", "S1", "C6", "c6", "응답하라, 3팀!", "phone-radio"),
    ]);
    expect(script.lines.map((line) => line.deliveryStyle)).toEqual([
      "calm-dialogue",
      "shout",
      "whisper",
      "inner-monologue",
      "narration",
      "urgent-dialogue",
    ]);
    expect(script.lines.map((line) => line.acousticReverbTag)).toEqual([
      "dry-close",
      "dry-close",
      "dry-close",
      "inner-monologue-hall",
      "studio-narrator",
      "phone-bandpass",
    ]);
  });

  it("thought-cloud는 inner-monologue-hall, phone-radio는 phone-bandpass를 자동 배정한다", () => {
    expect(inferAcousticReverbTag("thought-cloud")).toBe("inner-monologue-hall");
    expect(inferAcousticReverbTag("phone-radio")).toBe("phone-bandpass");
    expect(inferAcousticReverbTag("narration-box")).toBe("studio-narrator");
    expect(inferAcousticReverbTag("oval-normal")).toBe("dry-close");
    expect(inferAcousticReverbTag("shout-jagged")).toBe("dry-close");
    expect(inferAcousticReverbTag("whisper-dashed")).toBe("dry-close");
  });

  it("shout-jagged + !! 대사는 whisper-dashed보다 엄격히 높은 에너지·피치·발화 속도를 가진다", () => {
    const script = compileVoiceActingProsodyScript([
      makeCue("S", "S1", "C1", "c1", "절대 물러서지 마!!", "shout-jagged"),
      makeCue("W", "S1", "C2", "c2", "조용히 숨어 있어...", "whisper-dashed"),
    ]);
    const [shout, whisper] = script.lines;
    expect(shout && whisper).toBeDefined();
    if (shout && whisper) {
      expect(shout.energyDb).toBeGreaterThan(whisper.energyDb);
      expect(shout.pitchShiftSemitones).toBeGreaterThan(whisper.pitchShiftSemitones);
      expect(shout.speakingRateSps).toBeGreaterThan(whisper.speakingRateSps);
    }
  });

  it("동일 말풍선에서도 문장부호(!!, ?!, ..., ~, —)에 따라 운율이 단조적으로 반응한다", () => {
    const script = compileVoiceActingProsodyScript([
      makeCue("plain", "S1", "C1", "c1", "지금 바로 출발하자.", "oval-normal"),
      makeCue("bang", "S1", "C2", "c1", "지금 바로 출발하자!!", "oval-normal"),
      makeCue("interro", "S1", "C3", "c1", "지금 바로 출발하자?!", "oval-normal"),
      makeCue("ellip", "S1", "C4", "c1", "지금 바로 출발하자...", "oval-normal"),
      makeCue("tilde", "S1", "C5", "c1", "지금 바로 출발하자~~", "oval-normal"),
      makeCue("dash", "S1", "C6", "c1", "지금 바로 출발하—", "oval-normal"),
    ]);
    const [plain, bang, interro, ellip, tilde, dash] = script.lines;
    expect(plain && bang && interro && ellip && tilde && dash).toBeDefined();
    if (plain && bang && interro && ellip && tilde && dash) {
      expect(bang.energyDb).toBeGreaterThan(plain.energyDb);
      expect(bang.pitchShiftSemitones).toBeGreaterThan(plain.pitchShiftSemitones);
      expect(interro.pitchShiftSemitones).toBeGreaterThan(plain.pitchShiftSemitones);
      expect(ellip.speakingRateSps).toBeLessThan(plain.speakingRateSps);
      expect(ellip.postHoldMs).toBeGreaterThan(plain.postHoldMs);
      expect(tilde.postHoldMs).toBeGreaterThan(plain.postHoldMs);
      expect(tilde.pitchShiftSemitones).toBeGreaterThan(plain.pitchShiftSemitones);
      expect(dash.postHoldMs).toBeLessThan(plain.postHoldMs);
      expect(dash.deliveryStyle).toBe("urgent-dialogue");
    }
  });

  it("문장부호 분석기가 !, ?, ?!, ..., ~, — 개수를 정확히 계수한다", () => {
    const profile = analyzeKoreanPunctuation("뭐라고?! 정말이야!! 잠깐... 기다려~ 앗—");
    expect(profile).toEqual({
      exclamationCount: 3,
      questionCount: 1,
      interrobangCount: 1,
      ellipsisCount: 1,
      tildeCount: 1,
      emDashCount: 1,
    });
  });

  it("한국어 음절 수 계산기가 한글·자모·숫자·영문 외래어를 결정론적으로 산출한다", () => {
    expect(countKoreanSpeakableSyllables("안녕하세요")).toBe(5);
    expect(countKoreanSpeakableSyllables("제3구역 OK!!")).toBe(5);
    expect(countKoreanSpeakableSyllables("ㅋㅋㅋ")).toBeGreaterThanOrEqual(2);
    expect(countKoreanSpeakableSyllables("   ")).toBe(0);
    expect(countKoreanSpeakableSyllables("...")).toBe(0);
  });

  it("빈 문자열·공백·문장부호 전용 대사 큐를 NaN 없이 안전하게 처리하고 emptyLineIds에 기록한다", () => {
    const script = compileVoiceActingProsodyScript([
      makeCue("E1", "S1", "C1", "c1", "", "oval-normal"),
      makeCue("E2", "S1", "C2", "c2", "   \t  ", "whisper-dashed"),
      makeCue("P1", "S1", "C3", "c1", "...", "thought-cloud"),
    ]);
    expect(script.emptyLineIds).toEqual(["E1", "E2"]);
    expect(script.lines[0]?.isEmptyCue).toBe(true);
    expect(script.lines[1]?.isEmptyCue).toBe(true);
    expect(script.lines[2]?.isEmptyCue).toBe(false);
    expect(script.lines[2]?.estimatedDurationMs).toBeGreaterThan(300);
    for (let i = 0; i < script.lines.length; i += 1) {
      const line = script.lines[i];
      expect(Number.isFinite(line?.estimatedDurationMs)).toBe(true);
      expect(Number.isFinite(line?.speakingRateSps)).toBe(true);
      expect(Number.isFinite(line?.energyDb)).toBe(true);
    }
    expect(script.unintendedOverlapCount).toBe(0);
  });

  it("일반 대사 시퀀스에서 비의도적 대사 겹침 0건과 씬 전환 간격 확장을 보장한다", () => {
    const script = compileVoiceActingProsodyScript([
      makeCue("L1", "S1", "C1", "c1", "첫 번째 대사입니다.", "oval-normal"),
      makeCue("L2", "S1", "C2", "c2", "같은 씬의 두 번째 대사입니다.", "oval-normal"),
      makeCue("L3", "S2", "C3", "c1", "다음 씬으로 넘어갔습니다.", "oval-normal"),
    ]);
    expect(script.unintendedOverlapCount).toBe(0);
    expect(script.intentionalInterruptCount).toBe(0);
    const [l1, l2, l3] = script.lines;
    expect(l1 && l2 && l3).toBeDefined();
    if (l1 && l2 && l3) {
      expect(l2.startMs - l1.endMs).toBeGreaterThan(0);
      expect(l3.startMs - l2.endMs).toBeGreaterThan(l2.startMs - l1.endMs);
    }
  });

  it("overlapInterrupt: true 대사만 직전 대사 말미 15%에 의도적 중첩되며 비의도적 겹침은 0건을 유지한다", () => {
    const script = compileVoiceActingProsodyScript([
      makeCue("L1", "S1", "C1", "c1", "잠깐만 내 말 좀 끝까지 들어봐 제발 부탁이야.", "oval-normal"),
      makeCue("L2", "S1", "C2", "c2", "듣기 싫어!", "shout-jagged", { overlapInterrupt: true }),
      makeCue("L3", "S1", "C3", "c1", "그럼 어쩔 수 없지.", "oval-normal"),
    ]);
    expect(script.unintendedOverlapCount).toBe(0);
    expect(script.intentionalInterruptCount).toBe(1);
    const [l1, l2, l3] = script.lines;
    expect(l1 && l2 && l3).toBeDefined();
    if (l1 && l2 && l3) {
      const expectedOverlap = Math.round(l1.estimatedDurationMs * 0.15);
      expect(l2.intentionalOverlapMs).toBe(expectedOverlap);
      expect(l2.startMs).toBe(l1.endMs - expectedOverlap);
      expect(l3.startMs).toBeGreaterThan(l2.endMs);
    }
  });

  it("긴 대사 뒤에 짧은 끼어들기가 연달아 나와도 2단계 이전 대사와 비의도적 겹침이 0건이다", () => {
    const script = compileVoiceActingProsodyScript([
      makeCue("L1", "S1", "C1", "c1", "아주 긴 설명 대사를 천천히 읊어 내려가며 사건의 배경과 동기를 상세히 밝히고 있다...", "narration-box"),
      makeCue("L2", "S1", "C2", "c2", "뭐!", "shout-jagged", { overlapInterrupt: true }),
      makeCue("L3", "S1", "C3", "c3", "거짓말!", "shout-jagged", { overlapInterrupt: true }),
      makeCue("L4", "S1", "C4", "c1", "사실이야.", "oval-normal"),
    ]);
    expect(script.unintendedOverlapCount).toBe(0);
    expect(countUnintendedDialogueOverlaps(script.lines)).toBe(0);
    const l1 = script.lines[0];
    const l3 = script.lines[2];
    expect(l1 && l3).toBeDefined();
    if (l1 && l3) expect(l3.startMs).toBeGreaterThanOrEqual(l1.endMs);
  });

  it("빈 대사 배열 입력 시 안전하게 0건 요약 대본을 반환한다", () => {
    const script = compileVoiceActingProsodyScript([]);
    expect(script.lines).toHaveLength(0);
    expect(script.scenes).toHaveLength(0);
    expect(script.totalDurationMs).toBe(0);
    expect(script.unintendedOverlapCount).toBe(0);
    expect(script.prosodyScriptSha256Hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("oval-normal에서 문장부호가 없으면 calm-dialogue, 느낌표가 있으면 urgent-dialogue를 추론한다", () => {
    expect(inferVoiceDeliveryStyle("oval-normal", analyzeKoreanPunctuation("그래 알았어."))).toBe("calm-dialogue");
    expect(inferVoiceDeliveryStyle("oval-normal", analyzeKoreanPunctuation("조심해!"))).toBe("urgent-dialogue");
  });
});

describe("Wave 128 — 씬 공존 간섭 그래프 컬러링 캐스팅 & 성대 피로 보호 스케줄러", () => {
  it("같은 씬에 동시 등장하는 캐릭터 쌍을 정확한 무방향 간섭 간선으로 구축한다", () => {
    const script = compileVoiceActingProsodyScript([
      makeCue("L1", "S1", "C1", "A", "안녕"),
      makeCue("L2", "S1", "C2", "B", "반가워"),
      makeCue("L3", "S2", "C3", "B", "왔어?"),
      makeCue("L4", "S2", "C4", "C", "응"),
    ]);
    const graph = buildSceneInterferenceGraph(script);
    expect(graph.maxSceneCliqueSize).toBe(2);
    expect(graph.edges).toEqual([
      { characterA: "A", characterB: "B", sharedSceneIds: ["S1"] },
      { characterA: "B", characterB: "C", sharedSceneIds: ["S2"] },
    ]);
  });

  it("표준 에피소드에서 고정 주연 성우를 존중하고 동일 씬 더블캐스팅 충돌 0건을 보장한다", () => {
    const script = compileVoiceActingProsodyScript(makeEpisodeDialogueSample());
    const castPlan = assignVoiceActorsWithoutSceneCollision(script, makeStandardActors());

    expect(castPlan.castFeasible).toBe(true);
    expect(castPlan.shortageActorCount).toBe(0);
    expect(castPlan.sameSceneDoubleCastCollisionCount).toBe(0);
    expect(castPlan.characterToActorId["char-hero"]).toBe("va-minsu");
    expect(castPlan.assignments.find((item) => item.characterId === "char-hero")?.assignmentMode).toBe("fixed-lead");
  });

  it("4인 동시 대화 씬(K4 클리크)을 4명 성우 풀로 동일 씬 충돌 0건에 배정한다", () => {
    const script = compileVoiceActingProsodyScript([
      makeCue("L1", "S1", "C1", "char-1", "작전 개시한다."),
      makeCue("L2", "S1", "C2", "char-2", "북문 확보 완료."),
      makeCue("L3", "S1", "C3", "char-3", "통신 감도 양호."),
      makeCue("L4", "S1", "C4", "char-4", "목표 시야 확보!"),
    ]);
    const castPlan = assignVoiceActorsWithoutSceneCollision(script, makeStandardActors());
    expect(castPlan.castFeasible).toBe(true);
    expect(castPlan.maxSceneCliqueSize).toBe(4);
    expect(castPlan.sameSceneDoubleCastCollisionCount).toBe(0);
    expect(new Set(Object.values(castPlan.characterToActorId)).size).toBe(4);
  });

  it("서로 다른 씬에만 등장하는 6명 캐릭터를 2명 성우로 무충돌 더블캐스팅한다", () => {
    const script = compileVoiceActingProsodyScript([
      makeCue("L1", "S1", "C1", "c1", "1씬 첫 화자"),
      makeCue("L2", "S1", "C2", "c2", "1씬 둘째 화자"),
      makeCue("L3", "S2", "C3", "c3", "2씬 첫 화자"),
      makeCue("L4", "S2", "C4", "c4", "2씬 둘째 화자"),
      makeCue("L5", "S3", "C5", "c5", "3씬 첫 화자"),
      makeCue("L6", "S3", "C6", "c6", "3씬 둘째 화자"),
    ]);
    const castPlan = assignVoiceActorsWithoutSceneCollision(script, [
      { actorId: "va-1", nameKo: "성우갑", vocalTier: "lead", hourlyRateKrw: 200000 },
      { actorId: "va-2", nameKo: "성우을", vocalTier: "supporting", hourlyRateKrw: 180000 },
    ]);
    expect(castPlan.castFeasible).toBe(true);
    expect(castPlan.sameSceneDoubleCastCollisionCount).toBe(0);
    expect(castPlan.characterToActorId["c1"]).not.toBe(castPlan.characterToActorId["c2"]);
    expect(castPlan.characterToActorId["c3"]).not.toBe(castPlan.characterToActorId["c4"]);
    expect(castPlan.characterToActorId["c5"]).not.toBe(castPlan.characterToActorId["c6"]);
  });

  it("복잡한 5-정점 휠/고리 공존 그래프에서도 3명 성우 백트래킹으로 무충돌 배정한다", () => {
    const script = compileVoiceActingProsodyScript([
      makeCue("L1", "S1", "C1", "v1", "1-2"), makeCue("L2", "S1", "C2", "v2", "1-2"),
      makeCue("L3", "S2", "C3", "v2", "2-3"), makeCue("L4", "S2", "C4", "v3", "2-3"),
      makeCue("L5", "S3", "C5", "v3", "3-4"), makeCue("L6", "S3", "C6", "v4", "3-4"),
      makeCue("L7", "S4", "C7", "v4", "4-5"), makeCue("L8", "S4", "C8", "v5", "4-5"),
      makeCue("L9", "S5", "C9", "v5", "5-1"), makeCue("L10", "S5", "C10", "v1", "5-1"),
    ]);
    const failPlan = assignVoiceActorsWithoutSceneCollision(script, makeStandardActors().slice(0, 2));
    expect(failPlan.castFeasible).toBe(false);
    expect(failPlan.shortageActorCount).toBeGreaterThanOrEqual(1);
    expect(failPlan.sameSceneDoubleCastCollisionCount).toBe(0);

    const okPlan = assignVoiceActorsWithoutSceneCollision(script, makeStandardActors().slice(0, 3));
    expect(okPlan.castFeasible).toBe(true);
    expect(okPlan.sameSceneDoubleCastCollisionCount).toBe(0);
  });

  it("씬 동시 화자 수(4명)보다 성우 수(2명)가 부족하면 임의 중복 없이 fail-closed로 보고한다", () => {
    const script = compileVoiceActingProsodyScript([
      makeCue("L1", "S1", "C1", "c1", "하나"),
      makeCue("L2", "S1", "C2", "c2", "둘"),
      makeCue("L3", "S1", "C3", "c3", "셋"),
      makeCue("L4", "S1", "C4", "c4", "넷"),
    ]);
    const castPlan = assignVoiceActorsWithoutSceneCollision(script, makeStandardActors().slice(0, 2));
    expect(castPlan.castFeasible).toBe(false);
    expect(castPlan.shortageActorCount).toBe(2);
    expect(castPlan.sameSceneDoubleCastCollisionCount).toBe(0);
    const unassigned = castPlan.assignments.filter((item) => item.actorId === null);
    expect(unassigned).toHaveLength(2);
    expect(unassigned.every((item) => item.assignmentMode === "unassigned-shortage")).toBe(true);
  });

  it("씬당 화자는 2명이지만 삼각 공존(C3 홀수 사이클)인 경우 2명 성우 불가·3명 성우 가능을 정확히 판정한다", () => {
    const script = compileVoiceActingProsodyScript([
      makeCue("L1", "S1", "C1", "A", "A"), makeCue("L2", "S1", "C2", "B", "B"),
      makeCue("L3", "S2", "C3", "B", "B"), makeCue("L4", "S2", "C4", "C", "C"),
      makeCue("L5", "S3", "C5", "C", "C"), makeCue("L6", "S3", "C6", "A", "A"),
    ]);
    const actors = makeStandardActors();
    const failPlan = assignVoiceActorsWithoutSceneCollision(script, actors.slice(0, 2));
    expect(failPlan.castFeasible).toBe(false);
    expect(failPlan.shortageActorCount).toBeGreaterThanOrEqual(1);
    expect(failPlan.sameSceneDoubleCastCollisionCount).toBe(0);

    const okPlan = assignVoiceActorsWithoutSceneCollision(script, actors.slice(0, 3));
    expect(okPlan.castFeasible).toBe(true);
    expect(okPlan.sameSceneDoubleCastCollisionCount).toBe(0);
  });

  it("동일 씬에 공존하는 두 캐릭터를 같은 성우에 고정 주연 지정하면 fail-closed로 차단한다", () => {
    const script = compileVoiceActingProsodyScript([
      makeCue("L1", "S1", "C1", "hero", "내가 먼저 간다."),
      makeCue("L2", "S1", "C2", "twin", "같이 가야지."),
    ]);
    const castPlan = assignVoiceActorsWithoutSceneCollision(script, [
      { actorId: "va-solo", nameKo: "김단독", vocalTier: "lead", fixedLeadCharacterIds: ["hero", "twin"], hourlyRateKrw: 250000 },
      { actorId: "va-other", nameKo: "이보조", vocalTier: "supporting", hourlyRateKrw: 180000 },
    ]);
    expect(castPlan.castFeasible).toBe(false);
    expect(castPlan.fixedLeadConflictIssues.length).toBeGreaterThan(0);
    expect(castPlan.sameSceneDoubleCastCollisionCount).toBe(1);
  });

  it("서로 다른 두 성우가 같은 고정 주연 캐릭터를 중복 청구하면 fail-closed로 차단한다", () => {
    const script = compileVoiceActingProsodyScript([makeCue("L1", "S1", "C1", "hero", "주인공 대사")]);
    const castPlan = assignVoiceActorsWithoutSceneCollision(script, [
      { actorId: "va-a", nameKo: "성우A", vocalTier: "lead", fixedLeadCharacterIds: ["hero"], hourlyRateKrw: 200000 },
      { actorId: "va-b", nameKo: "성우B", vocalTier: "lead", fixedLeadCharacterIds: ["hero"], hourlyRateKrw: 200000 },
    ]);
    expect(castPlan.castFeasible).toBe(false);
    expect(castPlan.fixedLeadConflictIssues).toHaveLength(1);
  });

  it("성우 풀이 0명이고 대사가 있으면 fail-closed로 부족 인원을 정확히 보고한다", () => {
    const script = compileVoiceActingProsodyScript([
      makeCue("L1", "S1", "C1", "c1", "누구 없어요?"),
      makeCue("L2", "S1", "C2", "c2", "여기 있습니다."),
    ]);
    const castPlan = assignVoiceActorsWithoutSceneCollision(script, []);
    expect(castPlan.castFeasible).toBe(false);
    expect(castPlan.shortageActorCount).toBe(2);
    expect(castPlan.sameSceneDoubleCastCollisionCount).toBe(0);
  });

  it("빈 대본에서는 성우 풀 유무와 무관하게 충돌 0건·비용 0원으로 안전 처리한다", () => {
    const castPlan = assignVoiceActorsWithoutSceneCollision(compileVoiceActingProsodyScript([]), makeStandardActors());
    expect(castPlan.castFeasible).toBe(true);
    expect(castPlan.sameSceneDoubleCastCollisionCount).toBe(0);
    expect(castPlan.estimatedTotalStudioCostKrw).toBe(0);
    expect(castPlan.hydrationBreakEvents).toHaveLength(0);
  });

  it("연속 외침 대사 3회까지는 휴식을 넣지 않고, 4회째 초과 시 성대 보호 수분 휴식을 삽입한다", () => {
    const threeShouts = compileVoiceActingProsodyScript([
      makeCue("L1", "S1", "C1", "char-hero", "멈춰!", "shout-jagged"),
      makeCue("L2", "S1", "C2", "char-hero", "안 돼!!", "shout-jagged"),
      makeCue("L3", "S1", "C3", "char-hero", "비켜!!", "shout-jagged"),
    ]);
    expect(assignVoiceActorsWithoutSceneCollision(threeShouts, makeStandardActors()).hydrationBreakEvents).toHaveLength(0);

    const fourShouts = compileVoiceActingProsodyScript([
      makeCue("L1", "S1", "C1", "char-hero", "멈춰!", "shout-jagged"),
      makeCue("L2", "S1", "C2", "char-hero", "안 돼!!", "shout-jagged"),
      makeCue("L3", "S1", "C3", "char-hero", "비켜!!", "shout-jagged"),
      makeCue("L4", "S1", "C4", "char-hero", "절대 안 져!!", "shout-jagged"),
    ]);
    const guardedPlan = assignVoiceActorsWithoutSceneCollision(fourShouts, makeStandardActors());
    expect(guardedPlan.hydrationBreakEvents).toHaveLength(1);
    expect(guardedPlan.hydrationBreakEvents[0]?.actorId).toBe("va-minsu");
    expect(guardedPlan.hydrationBreakEvents[0]?.afterLineId).toBe("L3");
    expect(guardedPlan.hydrationBreakEvents[0]?.beforeLineId).toBe("L4");
    expect(guardedPlan.hydrationBreakEvents[0]?.consecutiveShoutRun).toBe(4);
  });

  it("연속 외침 7회는 상한 3회 기준으로 수분 휴식 2회를 삽입하고, 중간 차분 대사는 카운터를 초기화한다", () => {
    const sevenShouts = compileVoiceActingProsodyScript(
      Array.from({ length: 7 }, (_, idx) =>
        makeCue(`SH${idx + 1}`, "S1", `C${idx + 1}`, "char-hero", `외침 ${idx + 1}!!`, "shout-jagged"),
      ),
    );
    const sevenPlan = assignVoiceActorsWithoutSceneCollision(sevenShouts, makeStandardActors());
    expect(sevenPlan.hydrationBreakEvents).toHaveLength(2);
    expect(sevenPlan.hydrationBreakEvents[0]?.afterLineId).toBe("SH3");
    expect(sevenPlan.hydrationBreakEvents[1]?.afterLineId).toBe("SH6");

    const resetSequence = compileVoiceActingProsodyScript([
      makeCue("A1", "S1", "C1", "char-hero", "하나!", "shout-jagged"),
      makeCue("A2", "S1", "C2", "char-hero", "둘!", "shout-jagged"),
      makeCue("A3", "S1", "C3", "char-hero", "셋!", "shout-jagged"),
      makeCue("CALM", "S1", "C4", "char-hero", "잠깐 숨 좀 돌리자.", "oval-normal"),
      makeCue("B1", "S1", "C5", "char-hero", "다시 하나!", "shout-jagged"),
      makeCue("B2", "S1", "C6", "char-hero", "다시 둘!", "shout-jagged"),
      makeCue("B3", "S1", "C7", "char-hero", "다시 셋!", "shout-jagged"),
    ]);
    expect(assignVoiceActorsWithoutSceneCollision(resetSequence, makeStandardActors()).hydrationBreakEvents).toHaveLength(0);
  });

  it("성우별 개별 maxConsecutiveShoutLines(2회)와 부스 비용 추정치 메타데이터를 정확히 반영한다", () => {
    const script = compileVoiceActingProsodyScript([
      makeCue("L1", "S1", "C1", "char-hero", "간다!", "shout-jagged"),
      makeCue("L2", "S1", "C2", "char-hero", "받아라!!", "shout-jagged"),
      makeCue("L3", "S1", "C3", "char-hero", "끝이다!!", "shout-jagged"),
    ]);
    const castPlan = assignVoiceActorsWithoutSceneCollision(script, [
      {
        actorId: "va-strict",
        nameKo: "성대보호성우",
        vocalTier: "lead",
        fixedLeadCharacterIds: ["char-hero"],
        maxConsecutiveShoutLines: 2,
        hourlyRateKrw: 300000,
      },
    ]);
    expect(castPlan.hydrationBreakEvents).toHaveLength(1);
    expect(castPlan.hydrationBreakEvents[0]?.maxAllowedConsecutiveShouts).toBe(2);
    expect(castPlan.isCostEstimate).toBe(true);
    expect(castPlan.estimatedTotalStudioCostKrw).toBeGreaterThanOrEqual(300000);
    expect(castPlan.costEstimateDisclaimerKo).toContain("추정치");
    expect(castPlan.totalBoothDurationMinutes).toBeGreaterThan(15);
  });

  it("내레이션 전용 화자가 있을 때 narrator 등급 성우를 우선 매칭한다", () => {
    const script = compileVoiceActingProsodyScript([
      makeCue("N1", "S1", "C1", "char-nar", "오래전 잊힌 기록이 열렸다.", "narration-box"),
      makeCue("H1", "S1", "C2", "char-hero", "여기가 입구인가.", "oval-normal"),
    ]);
    const castPlan = assignVoiceActorsWithoutSceneCollision(script, makeStandardActors());
    expect(castPlan.castFeasible).toBe(true);
    expect(castPlan.characterToActorId["char-nar"]).toBe("va-yujin");
  });
});

describe("Wave 128 — 순수 ES2017 FIPS 180-4 SHA-256 결정론 및 매니페스트 지문", () => {
  it("NIST FIPS 180-4 공식 SHA-256 테스트 벡터 3종과 정확히 일치한다", () => {
    expect(sha256VoiceUtf8Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256VoiceUtf8Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256VoiceUtf8Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("정규 JSON 직렬화와 매니페스트 SHA-256이 객체 키 순서와 무관하게 동일하다", () => {
    expect(canonicalizeVoiceJson({ b: 2, a: { y: true, x: -0 } })).toBe(
      canonicalizeVoiceJson({ a: { x: 0, y: true }, b: 2 }),
    );
    const scriptA = compileVoiceActingProsodyScript([
      { lineId: "L1", sceneId: "S1", cutId: "C1", characterId: "char-hero", textKo: "출발하자!", balloonStyle: "oval-normal" },
    ]);
    const scriptB = compileVoiceActingProsodyScript([
      { balloonStyle: "oval-normal", textKo: "출발하자!", characterId: "char-hero", cutId: "C1", sceneId: "S1", lineId: "L1" },
    ]);
    expect(scriptA.prosodyScriptSha256Hex).toBe(scriptB.prosodyScriptSha256Hex);

    const planA = assignVoiceActorsWithoutSceneCollision(scriptA, [
      { actorId: "va-1", nameKo: "김민수", vocalTier: "lead", fixedLeadCharacterIds: ["char-hero"], maxConsecutiveShoutLines: 3, hourlyRateKrw: 240000 },
    ]);
    const planB = assignVoiceActorsWithoutSceneCollision(scriptB, [
      { hourlyRateKrw: 240000, maxConsecutiveShoutLines: 3, fixedLeadCharacterIds: ["char-hero"], vocalTier: "lead", nameKo: "김민수", actorId: "va-1" },
    ]);
    expect(planA.scriptManifestSha256Hex).toBe(planB.scriptManifestSha256Hex);
    expect(planA.scriptManifestSha256Hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("대사 한 글자나 성우 단가가 바뀌면 매니페스트 SHA-256 지문이 즉시 달라진다", () => {
    const baseScript = compileVoiceActingProsodyScript(makeEpisodeDialogueSample());
    const mutatedScript = compileVoiceActingProsodyScript(
      makeEpisodeDialogueSample().map((cue) => (cue.lineId === "L02" ? { ...cue, textKo: "거기 서! 도망치지 마!!!" } : cue)),
    );
    const basePlan = assignVoiceActorsWithoutSceneCollision(baseScript, makeStandardActors());
    const mutatedPlan = assignVoiceActorsWithoutSceneCollision(mutatedScript, makeStandardActors());
    expect(basePlan.scriptManifestSha256Hex).not.toBe(mutatedPlan.scriptManifestSha256Hex);
  });
});

describe("Wave 128 — 인쇄 안전 순수 OKLCH SVG & 한국어 녹음 감독 브리프", () => {
  it("SVG가 순수 oklch(...)만 사용하고 원시 hex/rgb/rgba/hsl 및 NaN/Infinity가 0건이다", () => {
    const script = compileVoiceActingProsodyScript(makeEpisodeDialogueSample());
    const castPlan = assignVoiceActorsWithoutSceneCollision(script, makeStandardActors());
    const svg = renderVoiceCastTimelineSvg(script, castPlan, { titleKo: "제12화 골목 추격전 녹음 타임라인" });

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).toContain("캐스팅 무충돌");
    expect(svg).toContain("씬 공존 캐스팅 간섭·부스 요약");

    const rawHexPattern = new RegExp("#[0-9a-f]{3,8}\\b", "i");
    const rawFnPattern = new RegExp("\\b(?:rgba?|hsla?)\\(", "i");
    expect(rawHexPattern.test(svg)).toBe(false);
    expect(rawFnPattern.test(svg)).toBe(false);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("XML 특수문자(<, >, &, \", ')와 XSS 페이로드를 SVG에서 완전히 이스케이프한다", () => {
    const xssPayload = `<script>alert("x&y'z")</script>`;
    expect(escapeVoiceXml(xssPayload)).toBe("&lt;script&gt;alert(&quot;x&amp;y&apos;z&quot;)&lt;/script&gt;");

    const script = compileVoiceActingProsodyScript([
      makeCue("L1", `S1<>&"'`, "C1", "char-xss", xssPayload, "shout-jagged", { characterNameKo: `화자<"A&B'>` }),
    ]);
    const svg = renderVoiceCastTimelineSvg(
      script,
      assignVoiceActorsWithoutSceneCollision(script, makeStandardActors()),
      { titleKo: `제목 ${xssPayload}` },
    );
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
    expect(svg).toContain("&apos;");
  });

  it("성대 수분 휴식과 성우 부족 상태를 SVG 배지·마커로 정확히 시각화한다", () => {
    const shoutScript = compileVoiceActingProsodyScript([
      makeCue("S1", "SC1", "C1", "char-hero", "하나!", "shout-jagged"),
      makeCue("S2", "SC1", "C2", "char-hero", "둘!", "shout-jagged"),
      makeCue("S3", "SC1", "C3", "char-hero", "셋!", "shout-jagged"),
      makeCue("S4", "SC1", "C4", "char-hero", "넷!", "shout-jagged"),
    ]);
    const shoutSvg = renderVoiceCastTimelineSvg(
      shoutScript,
      assignVoiceActorsWithoutSceneCollision(shoutScript, makeStandardActors()),
    );
    expect(shoutSvg).toContain("수분 휴식");

    const shortageScript = compileVoiceActingProsodyScript([
      makeCue("A", "SC1", "C1", "c1", "화자1"),
      makeCue("B", "SC1", "C2", "c2", "화자2"),
      makeCue("C", "SC1", "C3", "c3", "화자3"),
    ]);
    const shortageSvg = renderVoiceCastTimelineSvg(
      shortageScript,
      assignVoiceActorsWithoutSceneCollision(shortageScript, makeStandardActors().slice(0, 1)),
    );
    expect(shortageSvg).toContain("성우 부족");
    expect(shortageSvg).toContain("미배정(성우 부족)");
  });

  it("한국어 녹음 감독 브리프가 핵심 검수 지표·추정치 고지·지문을 포함하고 번역투가 없다", () => {
    const script = compileVoiceActingProsodyScript([
      ...makeEpisodeDialogueSample(),
      makeCue("L08", "S03", "C08", "char-hero", "비켜!!", "shout-jagged", { characterNameKo: "강하늘" }),
      makeCue("L09", "S03", "C09", "char-hero", "물러서!!", "shout-jagged", { characterNameKo: "강하늘" }),
      makeCue("L10", "S03", "C10", "char-hero", "당장 열어!!", "shout-jagged", { characterNameKo: "강하늘" }),
      makeCue("L11", "S03", "C11", "char-hero", "늦기 전에!!", "shout-jagged", { characterNameKo: "강하늘" }),
    ]);
    const castPlan = assignVoiceActorsWithoutSceneCollision(script, makeStandardActors());
    const report = summarizeVoiceCastScriptKo(script, castPlan);

    expect(report).toContain("[녹음 감독 브리프]");
    expect(report).toContain("비의도적 대사 겹침 0건");
    expect(report).toContain("동일 씬 1인 2역 충돌 0건");
    expect(report).toContain("성대 보호 수분 휴식");
    expect(report).toContain("추정치");
    expect(report).toContain(castPlan.scriptManifestSha256Hex);

    const bannedPhrases = ["가능하게 합니다", "직관적인 경험을 제공합니다", "원활한 워크플로우", "보장하는 것을 목표로 합니다"];
    for (let i = 0; i < bannedPhrases.length; i += 1) {
      const phrase = bannedPhrases[i];
      if (phrase) expect(report).not.toContain(phrase);
    }
  });

  it("비유한(NaN/Infinity) 옵션이 들어와도 안전하게 기본값으로 폴백하고 입력을 변이하지 않는다", () => {
    const inputCues = makeEpisodeDialogueSample().map((cue) => ({ ...cue }));
    const snapshotBefore = JSON.stringify(inputCues);

    const script = compileVoiceActingProsodyScript(inputCues, {
      defaultInterLineGapMs: Number.NaN,
      sceneTransitionGapMs: Number.POSITIVE_INFINITY,
      interruptOverlapRatio: Number.NaN,
      minimumLineDurationMs: -100,
    });
    const castPlan = assignVoiceActorsWithoutSceneCollision(script, makeStandardActors(), {
      defaultMaxConsecutiveShoutLines: Number.NaN,
      hydrationBreakDurationMs: Number.NaN,
      takeRetakeMultiplier: Number.POSITIVE_INFINITY,
    });
    const svg = renderVoiceCastTimelineSvg(script, castPlan, { widthPx: Number.NaN });

    expect(JSON.stringify(inputCues)).toBe(snapshotBefore);
    expect(script.unintendedOverlapCount).toBe(0);
    expect(Number.isFinite(castPlan.estimatedTotalStudioCostKrw)).toBe(true);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });
});
