import { describe, expect, it } from "vitest";

import {
  classifyCharacterAgeGroup,
  compileAnimationFirstFramePrompt,
  compileAnimationMotionPrompt,
  compileStudyCardCharacterPrompt,
  configureContiPageSpread,
  evaluateContiRolePermissions,
  formatContiDialogueDirective,
  matchContiEmotionCategory,
  parseSheetPromptsFromNote,
  reconcileOfflineContiSync,
  resolveCharacterAutoColor,
  validateContiKeywords,
  type KaistoryContiPage,
} from "./kaistory-conti-model";

describe("kaistory-conti-model", () => {
  it("등장인물 나이 문자열에서 연령대를 자동 분류하고 순서 기반 색상을 배정한다", () => {
    expect(classifyCharacterAgeGroup("초등 4학년 (11세)")).toBe("child");
    expect(classifyCharacterAgeGroup("17세 고등학생")).toBe("teen");
    expect(classifyCharacterAgeGroup("24세 대학생")).toBe("young");
    expect(classifyCharacterAgeGroup("38세 교사")).toBe("adult");
    expect(classifyCharacterAgeGroup("72세 할아버지")).toBe("senior");
    expect(resolveCharacterAutoColor(0)).toBe("#FF6B6B");
    expect(resolveCharacterAutoColor(1)).toBe("#4ECDC4");
  });

  it("표정·분위기 문구에서 14종 감정 카테고리를 정확히 매칭한다", () => {
    expect(matchContiEmotionCategory("가슴이 두근거리며 설렘")).toBe("love");
    expect(matchContiEmotionCategory("시큰둥하고 무표정한 얼굴")).toBe("neutral_cold");
    expect(matchContiEmotionCategory("진땀을 흘리며 안절부절")).toBe("flustered");
    expect(matchContiEmotionCategory("의기양양하게 으스대는 표정")).toBe("smug");
  });

  it("키워드 개수(30개)와 글자 수(100자) 상한을 검증한다", () => {
    const valid = validateContiKeywords(["운동법칙", "관성", "운동법칙"]);
    expect(valid.ok).toBe(true);
    expect(valid.keywords).toEqual(["운동법칙", "관성"]);

    const tooLong = validateContiKeywords(["가".repeat(101)]);
    expect(tooLong.ok).toBe(false);
    expect(tooLong.errorKo).toContain("100자까지입니다");

    const tooMany = validateContiKeywords(
      Array.from({ length: 31 }, (_, idx) => `키워드_${idx}`),
    );
    expect(tooMany.ok).toBe(false);
    expect(tooMany.errorKo).toContain("30개까지입니다");
  });

  it("두 페이지 모두 컷이 있을 때만 2페이지 펼침(합침/숨김)을 허용한다", () => {
    const basePage: KaistoryContiPage = {
      id: "p1",
      pageNumber: 1,
      templateId: "A/B1-2_2row",
      keywords: [],
      b5GuideEnabled: true,
      borderCropPx: 0,
      spreadMode: "none",
      isSpreadHost: false,
      cuts: [
        {
          id: "c1",
          cutNumber: 1,
          shotType: "full",
          timeText: "아침",
          directorNote: "",
          colorReferenceMode: "like_sheet",
          aiColorDirective: "",
          keywords: [],
          placements: [],
          dialogues: [],
          outOfFrameCharacterImageUrls: [],
          webtoonDedicatedCutCountAfter: 0,
          aspectRatioWidth: 3,
          aspectRatioHeight: 4,
        },
      ],
    };
    const emptyPartner: KaistoryContiPage = {
      ...basePage,
      id: "p2",
      pageNumber: 2,
      cuts: [],
    };

    const rejected = configureContiPageSpread([basePage, emptyPartner], 1, "merge_webtoon");
    expect(rejected.ok).toBe(false);
    expect(rejected.messageKo).toBe("두 페이지 모두 컷이 있어야 펼침을 만들 수 있어요.");

    const validPartner: KaistoryContiPage = {
      ...emptyPartner,
      cuts: basePage.cuts,
    };
    const accepted = configureContiPageSpread([basePage, validPartner], 1, "hide_webtoon");
    expect(accepted.ok).toBe(true);
    expect(accepted.pages[0]?.spreadMode).toBe("hide_webtoon");
    expect(accepted.pages[0]?.isSpreadHost).toBe(true);
    expect(accepted.pages[1]?.spreadMode).toBe("hide_webtoon");
    expect(accepted.pages[1]?.isSpreadHost).toBe(false);
  });

  it("대사·보이스오버 6종 연출 문구와 16:9 애니메이션 프롬프트를 생성한다", () => {
    expect(
      formatContiDialogueDirective({
        id: "d1",
        speakerName: "지수",
        kind: "monologue",
        deliveryMode: "thought_vo",
        text: "설마 저게 블랙홀인가?",
        translations: {},
      }),
    ).toBe('지수 속마음 보이스오버 — 입은 움직이지 않고 표정으로만: "설마 저게 블랙홀인가?"');

    expect(
      formatContiDialogueDirective({
        id: "d2",
        speakerName: "",
        kind: "sfx",
        deliveryMode: "sfx_silent",
        text: "쿠구궁",
        translations: {},
      }),
    ).toBe("효과음 「쿠구궁」 소리가 난다 — 글자는 화면에 띄우지 않는다.");

    const firstFrame = compileAnimationFirstFramePrompt({
      aspectRatioWidth: 3,
      aspectRatioHeight: 4,
      backgroundHint: "과학실 칠판과 창가",
      lightingMood: "오후 햇살",
    });
    expect(firstFrame.already16By9).toBe(false);
    expect(firstFrame.prompt).toContain("원화는 세로(3:4)라 좌우가 모자랍니다.");

    const motion = compileAnimationMotionPrompt({
      cameraMotion: "push_face",
      characterAction: "고개를 들어 칠판을 본다",
      dialogues: [
        {
          id: "d3",
          speakerName: "지수",
          kind: "dialogue",
          deliveryMode: "shout",
          text: "이 문장은 마흔두 글자를 훨씬 넘겨서 십 초 제한 경고가 반드시 발생하도록 길게 작성한 테스트 대사입니다!",
          translations: {},
        },
      ],
    });
    expect(motion.exceedsSingleClipLimit).toBe(true);
    expect(motion.warningKo).toContain("10초를 넘어");
    expect(motion.prompt).toContain("얼굴에 아주 천천히 밀어 들어간다");
  });

  it("학습카드 인물 일관성 프롬프트와 차림별/장소 시트 프롬프트, 역할 권한, LWW 동기화를 처리한다", () => {
    const cardPrompt = compileStudyCardCharacterPrompt({
      basePrompt: "뉴턴의 운동 제2법칙 F=ma를 설명하는 학습카드",
      characterName: "한별",
    });
    expect(cardPrompt).toContain("첨부한 인물 그림(한별)과 같은 얼굴·머리·옷·색으로 인물을 그려 줘.");

    const parsedSheets = parseSheetPromptsFromNote(
      [
        "〔차림별 시트 프롬프트 — 실험복〕 흰 실험 가운과 보안경",
        "〔장소 시트 프롬프트 — 천문대 야경〕 별이 가득한 돔 천장",
        "[채색 프롬프트 — 저녁노을] 따뜻한 오렌지 역광",
      ].join("\n"),
    );
    expect(parsedSheets).toHaveLength(3);
    expect(parsedSheets[0]).toEqual({
      kind: "outfit",
      variant: "실험복",
      prompt: "흰 실험 가운과 보안경",
    });

    expect(evaluateContiRolePermissions("story_writer").canEditSynopsisAndScript).toBe(true);
    expect(evaluateContiRolePermissions("story_writer").canEditDrawingAndLayers).toBe(false);
    expect(evaluateContiRolePermissions("cartoonist").canEditDrawingAndLayers).toBe(true);

    const synced = reconcileOfflineContiSync(
      { entityId: "e1", baseVersion: 3, updatedAtMs: 1000, deviceId: "dev-a", payload: "old" },
      { entityId: "e1", baseVersion: 3, updatedAtMs: 2000, deviceId: "dev-b", payload: "new" },
    );
    expect(synced.winner).toBe("local");
    expect(synced.nextVersion).toBe(4);
    expect(synced.envelope.payload).toBe("new");
  });
});
