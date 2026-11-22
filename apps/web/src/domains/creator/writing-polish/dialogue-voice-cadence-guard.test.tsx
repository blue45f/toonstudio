// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildVoiceProfilesFromCodexEntities } from "../writer-room/studio-scrivenings-snapshot-codex";
import {
  BUBBLE_CADENCE_THRESHOLDS,
  MOBILE_VIEWPORT_WIDTH_PX,
  SFX_CULTURAL_DICTIONARY,
  classifyKoreanSentenceRegister,
  detectCharacterVoiceMismatches,
  evaluateMobileBubbleCadence,
  extractAndTranslateSfxInText,
  getBubbleCadenceThreshold,
  lookupSfxCulturalAdaptation,
  resolveBubbleCadenceCategory,
  type CharacterVoiceProfile,
} from "./dialogue-voice-cadence-guard";
import {
  analyzeStudioDialoguePolishPack,
  type WritingPolishDocument,
} from "./studio-writing-polish";
import { StudioWritingPolishPanel } from "./StudioWritingPolishPanel";

afterEach(cleanup);

const PROFILES: readonly CharacterVoiceProfile[] = [
  {
    characterId: "seojun",
    name: "서준",
    speechRegister: "banmal",
    preferredEndings: ["~어", "~야", "~지", "~다"],
    honorificRules: [
      {
        targetName: "선배",
        expectedAddress: "선배",
        disallowedAddresses: ["형님", "사장님"],
      },
    ],
    forbiddenWords: ["ㅋㅋ", "레전드"],
  },
  {
    characterId: "yuna",
    name: "유나",
    speechRegister: "haeyo",
    preferredEndings: ["~요", "~세요"],
    honorificRules: [
      {
        targetName: "서준",
        expectedAddress: "서준 씨",
        disallowedAddresses: ["야", "너 이 녀석"],
      },
    ],
    forbiddenWords: ["닥쳐"],
  },
  {
    characterId: "cat-mascot",
    name: "나비",
    speechRegister: "banmal",
    preferredEndings: ["~냥"],
    strictPreferredEnding: true,
    forbiddenWords: [],
  },
];

describe("축 29 · 캐릭터 말투 일관성 감지기 (dialogue-voice-cadence-guard)", () => {
  it("반말/해요체/하십시오체/하오체/고어 종결어미를 로컬에서 정확히 분류한다", () => {
    expect(classifyKoreanSentenceRegister("지금 당장 출발해.")).toBe("banmal");
    expect(classifyKoreanSentenceRegister("잠시만 기다려 주세요.")).toBe("haeyo");
    expect(classifyKoreanSentenceRegister("보고를 시작하겠습니다.")).toBe("hapsyo");
    expect(classifyKoreanSentenceRegister("그 검을 이리 넘기시오.")).toBe("haoche");
    expect(classifyKoreanSentenceRegister("네 죄를 알렷다!")).toBe("archaic");
    // '필요' 같은 명사 끝 '요'는 존댓말로 오탐하지 않는다
    expect(classifyKoreanSentenceRegister("필요")).toBe("neutral");
  });

  it("캐릭터 말투(반말↔존댓말), 호칭 이탈, 금지어, 고유 말버릇 어미 누락을 모두 감지한다", () => {
    const report = detectCharacterVoiceMismatches(
      [
        {
          id: "u1",
          characterId: "seojun",
          text: "형님, 이건 정말 죄송해요. ㅋㅋ 대박이네.",
          addresseeName: "선배",
        },
        {
          id: "u2",
          characterId: "yuna",
          text: "야, 빨리 나와. 닥쳐.",
          addresseeName: "서준",
        },
        {
          id: "u3",
          characterId: "cat-mascot",
          text: "오늘 밤 지붕 위로 올라가자.",
        },
      ],
      PROFILES,
    );

    expect(report.totalUtterancesChecked).toBe(3);
    expect(report.mismatches.some((m) => m.utteranceId === "u1" && m.kind === "register-mismatch")).toBe(
      true,
    );
    expect(report.mismatches.some((m) => m.utteranceId === "u1" && m.kind === "honorific-mismatch")).toBe(
      true,
    );
    expect(report.mismatches.some((m) => m.utteranceId === "u1" && m.kind === "forbidden-word")).toBe(
      true,
    );
    expect(report.mismatches.some((m) => m.utteranceId === "u2" && m.kind === "register-mismatch")).toBe(
      true,
    );
    expect(report.mismatches.some((m) => m.utteranceId === "u2" && m.kind === "honorific-mismatch")).toBe(
      true,
    );
    expect(report.mismatches.some((m) => m.utteranceId === "u2" && m.kind === "forbidden-word")).toBe(
      true,
    );
    expect(report.mismatches.some((m) => m.utteranceId === "u3" && m.kind === "ending-drift")).toBe(
      true,
    );
    expect(report.consistencyScore).toBeLessThan(80);
  });

  it("프로파일에 일치하는 대사는 불일치 0건 · 일관성 100점을 반환한다", () => {
    const report = detectCharacterVoiceMismatches(
      [
        { id: "ok1", characterId: "seojun", text: "선배, 이 편지는 내가 직접 챙길게." },
        { id: "ok2", characterId: "yuna", text: "서준 씨, 우산 챙기셨어요?" },
        { id: "ok3", characterId: "cat-mascot", text: "생선 냄새가 난다냥!" },
      ],
      PROFILES,
    );

    expect(report.mismatchCount).toBe(0);
    expect(report.consistencyScore).toBe(100);
  });
});

describe("축 29 · 모바일 390px 과밀 말풍선 & #145 BubbleVariant별 차등 임계치", () => {
  it("일반 말풍선은 18~36자 최적 · >38자 2분할 제안을 정확히 수행한다", () => {
    const optimalText = "비가 그치기 전에 우체국으로 돌아가야 해."; // 23자
    const optimal = evaluateMobileBubbleCadence({
      utteranceId: "dlg-opt",
      text: optimalText,
      bubbleVariant: "speech",
    });
    expect(optimal.threshold.viewportWidthPx).toBe(MOBILE_VIEWPORT_WIDTH_PX);
    expect(optimal.threshold.optimalMinChars).toBe(18);
    expect(optimal.threshold.optimalMaxChars).toBe(36);
    expect(optimal.threshold.splitOverChars).toBe(38);
    expect(optimal.status).toBe("optimal");
    expect(optimal.needsSplit).toBe(false);

    // 정확히 38자: 아직 분할 임계 초과 아님(dense)
    const boundary38 = "아무에게도 말하지 말라고 분명히 약속했잖아 지금 이 순간에도 말이야.";
    expect(boundary38.length).toBe(38);
    const at38 = evaluateMobileBubbleCadence({
      utteranceId: "dlg-38",
      text: boundary38,
      bubbleVariant: "speech",
    });
    expect(at38.status).toBe("dense");
    expect(at38.needsSplit).toBe(false);

    // 39자 이상(>38자): 과밀 2분할 제안
    const crowded = "비가 그치기 전에 우체국으로 돌아가야 해. 그렇지 않으면 열세 번째 편지가 사라져 버려.";
    expect(crowded.length).toBeGreaterThan(38);
    const splitReport = evaluateMobileBubbleCadence({
      utteranceId: "dlg-crowded",
      text: crowded,
      bubbleVariant: "speech",
    });
    expect(splitReport.status).toBe("crowded-split");
    expect(splitReport.needsSplit).toBe(true);
    expect(splitReport.splitProposal?.splitBoundaryKind).toBe("sentence");
    expect(splitReport.splitProposal?.firstBubble).toContain("돌아가야 해.");
    expect(splitReport.splitProposal?.secondBubble).toContain("사라져 버려.");
  });

  it("#145 동일한 42자 대사라도 일반·속삭임은 2분할을 제안하고 독백·내레이션은 차등 임계치로 통과시킨다", () => {
    const text42 = "자정이 넘은 골목 끝에서 낡은 시계탑 종소리가 울려 퍼지기 시작했어. 다들 멈춰.";
    expect(text42.length).toBeGreaterThan(38);
    expect(text42.length).toBeLessThanOrEqual(48);

    const standard = evaluateMobileBubbleCadence({ utteranceId: "b1", text: text42, bubbleVariant: "speech" });
    const whisper = evaluateMobileBubbleCadence({ utteranceId: "b2", text: text42, bubbleVariant: "whisper" });
    const monologue = evaluateMobileBubbleCadence({ utteranceId: "b3", text: text42, bubbleVariant: "thought" });
    const narration = evaluateMobileBubbleCadence({ utteranceId: "b4", text: text42, bubbleVariant: "box" });

    expect(resolveBubbleCadenceCategory("speech")).toBe("standard");
    expect(resolveBubbleCadenceCategory("whisper")).toBe("whisper");
    expect(resolveBubbleCadenceCategory("thought")).toBe("monologue");
    expect(resolveBubbleCadenceCategory("box")).toBe("narration");

    expect(BUBBLE_CADENCE_THRESHOLDS.whisper.splitOverChars).toBeLessThan(
      BUBBLE_CADENCE_THRESHOLDS.standard.splitOverChars,
    );
    expect(BUBBLE_CADENCE_THRESHOLDS.standard.splitOverChars).toBeLessThan(
      BUBBLE_CADENCE_THRESHOLDS.monologue.splitOverChars,
    );
    expect(BUBBLE_CADENCE_THRESHOLDS.monologue.splitOverChars).toBeLessThan(
      BUBBLE_CADENCE_THRESHOLDS.narration.splitOverChars,
    );

    expect(standard.needsSplit).toBe(true);
    expect(whisper.needsSplit).toBe(true);
    expect(monologue.needsSplit).toBe(false);
    expect(narration.needsSplit).toBe(false);

    // 속삭임은 28자만 되어도 분할, 내레이션은 65자에서 분할
    expect(
      evaluateMobileBubbleCadence({
        utteranceId: "w-over",
        text: "지금 문 밖에 누가 서 있는 것 같아, 숨소리 줄여.",
        bubbleVariant: "whisper",
      }).needsSplit,
    ).toBe(true);
    expect(
      evaluateMobileBubbleCadence({
        utteranceId: "n-over",
        text: "그날 밤 열두 시가 되자 서울 구도심의 모든 가로등이 일제히 꺼졌고, 아무도 존재를 몰랐던 13번 우체국 문이 천천히 열렸다.",
        bubbleVariant: "comic-narrative",
      }).needsSplit,
    ).toBe(true);
    expect(getBubbleCadenceThreshold("cloud-soft").category).toBe("monologue");
  });
});

describe("축 29 · 한국어→영어/일본어 의성어·의태어 문화권 대체 사전 & 런타임 연결", () => {
  it("30개 이상의 핵심 의성어·의태어를 보유하고 두근/쿵/철컥/와장창을 정확히 변환한다", () => {
    expect(SFX_CULTURAL_DICTIONARY.length).toBeGreaterThanOrEqual(30);
    expect(new Set(SFX_CULTURAL_DICTIONARY.map((e) => e.id)).size).toBe(
      SFX_CULTURAL_DICTIONARY.length,
    );

    const dugeun = lookupSfxCulturalAdaptation("두근");
    expect(dugeun?.entry.english).toBe("ba-dump");
    expect(dugeun?.entry.japanese).toBe("ドキッ");

    const dugeunVar = lookupSfxCulturalAdaptation("두근두근!");
    expect(dugeunVar?.entry.id).toBe("sfx-dugeun");

    expect(lookupSfxCulturalAdaptation("쿵")?.entry.english).toBe("THUD");
    expect(lookupSfxCulturalAdaptation("철컥")?.entry.japanese).toBe("カチャッ");
    expect(lookupSfxCulturalAdaptation("와장창")?.entry.english).toBe("CRASH");

    const inline = extractAndTranslateSfxInText("문이 철컥 열리자 심장이 두근두근 뛰고 밖에서 쏴아아 비가 내렸다.");
    expect(inline.map((item) => item.entry.korean)).toEqual(["철컥", "두근", "쏴아"]);
  });

  it("studio-writing-polish 통합 분석기와 writer-room Codex 브리지가 정상 동작한다", () => {
    const codexProfiles = buildVoiceProfilesFromCodexEntities([
      {
        id: "char-01",
        kind: "character",
        canonical: "서준",
        aliases: ["우편배달부"],
        status: "confirmed",
        summary: "주인공",
        voiceTone: "무뚝뚝한 반말",
      },
      {
        id: "char-02",
        kind: "character",
        canonical: "유나",
        aliases: ["시계공"],
        status: "confirmed",
        summary: "조력자",
        voiceTone: "정중한 존댓말 해요체",
      },
    ]);
    expect(codexProfiles).toHaveLength(2);
    expect(codexProfiles[0]?.speechRegister).toBe("banmal");
    expect(codexProfiles[1]?.speechRegister).toBe("haeyo");

    const docs: readonly WritingPolishDocument[] = [
      {
        id: "dlg-1",
        label: "1화 5컷 대사",
        kind: "dialogue",
        characterId: "char-01",
        bubbleVariant: "speech",
        text: "다시 또 죄송해요! 비가 쏴아아 쏟아지는데 지금 당장 열세 번째 편지를 찾아야 합니다.",
      },
    ];
    const pack = analyzeStudioDialoguePolishPack(docs, { voiceProfiles: codexProfiles });
    expect(pack.polishSuggestions.length).toBeGreaterThan(0);
    expect(pack.voiceConsistency.mismatchCount).toBeGreaterThan(0);
    expect(pack.mobileBubbleCadence[0]?.needsSplit).toBe(true);
    expect(pack.sfxAdaptationsByDocId["dlg-1"]?.[0]?.english).toBe("POUR");
  });

  it("StudioWritingPolishPanel에서 말투 불일치·모바일 2분할 적용·의성어 한→영/일 전환 UI가 동작한다", () => {
    const onApply = vi.fn();
    const docs: readonly WritingPolishDocument[] = [
      {
        id: "dlg-panel-1",
        label: "1화 8컷 서준 대사",
        kind: "dialogue",
        characterId: "seojun",
        bubbleVariant: "speech",
        addresseeName: "선배",
        text: "형님, 정말 죄송해요! 심장이 두근 뛰는데 지금 바로 우체국 지하로 내려가야 하거든요.",
      },
    ];

    render(
      <StudioWritingPolishPanel
        documents={docs}
        voiceProfiles={PROFILES}
        onApplyDocument={onApply}
      />,
    );

    expect(screen.getByTestId("studio-dialogue-voice-cadence-section")).toBeTruthy();
    expect(Number(screen.getByTestId("voice-mismatch-count").textContent)).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("bubble-split-proposal-dlg-panel-1")).toBeTruthy();
    expect(screen.getByTestId("sfx-inline-matches").textContent).toContain("ba-dump");

    // 2분할 버튼 클릭 시 호스트 onApplyDocument 호출
    fireEvent.click(screen.getByTestId("bubble-apply-split-dlg-panel-1"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]).toBe("dlg-panel-1");
    expect(String(onApply.mock.calls[0]?.[1])).toContain("\n");

    // 의성어 사전 일본어 전환
    fireEvent.click(screen.getByTestId("sfx-locale-ja"));
    expect(screen.getByTestId("sfx-lookup-result").textContent).toContain("ドキッ");
  });
});
