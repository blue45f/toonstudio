import { StudioWriterRoomDocumentSchema } from "@toonstudio/contracts/studio-writer-room";
import { describe, expect, it } from "vitest";

import { evaluateCutReadiness } from "../../planning/studio-story-living-spec-store";

import {
  buildWriterRoomDocumentFromSlashAst,
  detectInlineSlashTrigger,
  extractKoreanChoseong,
  parseSlashScriptDocument,
  searchMentionEntities,
  searchSlashDirectingCommands,
  serializeWriterRoomToSlashScript,
  type StoryBibleMentionCatalog,
} from "./studio-slash-script-director";

const SAMPLE_CATALOG: StoryBibleMentionCatalog = {
  entities: [
    {
      id: "char-hajin",
      kind: "character",
      name: "하진",
      aliases: ["주인공", "한하진"],
      characterLockId: "lock-hajin-v1",
      voicePresetId: "voice-hajin-calm",
    },
    {
      id: "char-seoyeon",
      kind: "character",
      name: "서연",
      aliases: ["라이벌"],
      characterLockId: "lock-seoyeon-v1",
      voicePresetId: "voice-seoyeon-sharp",
    },
    {
      id: "loc-rooftop",
      kind: "location",
      name: "학교옥상",
      aliases: ["옥상"],
      bg3dSetId: "bg3d-school-rooftop-sunset",
    },
    {
      id: "prop-letter",
      kind: "prop",
      name: "구겨진편지",
      aliases: ["편지"],
    },
    {
      id: "rule-curfew",
      kind: "rule",
      name: "야간통금규칙",
      aliases: ["통금"],
    },
  ],
};

describe("studio-slash-script-director", () => {
  it("matches Korean choseong and English aliases for slash commands and @ mentions", () => {
    expect(extractKoreanChoseong("말풍선")).toBe("ㅁㅍㅅ");
    expect(searchSlashDirectingCommands("ㅁㅍㅅ")[0]?.id).toBe("balloon");
    expect(searchSlashDirectingCommands("ㅎㄱㅇ")[0]?.id).toBe("sfx");
    expect(searchSlashDirectingCommands("ㅅㅇㄱㅈ")[0]?.id).toBe("voice_emotion");
    expect(searchSlashDirectingCommands("angle")[0]?.id).toBe("shot");

    expect(searchMentionEntities(SAMPLE_CATALOG, "ㅎㅈ")[0]?.id).toBe("char-hajin");
    expect(searchMentionEntities(SAMPLE_CATALOG, "옥상", "location")[0]?.id).toBe("loc-rooftop");
  });

  it("detects inline triggers safely while respecting IME composition and ignoring URLs/emails", () => {
    expect(detectInlineSlashTrigger("대사 입력 /말", 8, false)).toEqual({
      kind: "slash",
      query: "말",
      rangeStart: 6,
      rangeEnd: 8,
    });
    expect(detectInlineSlashTrigger("대사 입력 /말", 8, true)).toBeNull();
    expect(detectInlineSlashTrigger("참고 https://example.com/cut", 28, false)).toBeNull();
    expect(detectInlineSlashTrigger("연락 user@toonstudio.kr", 23, false)).toBeNull();
    expect(detectInlineSlashTrigger("장면 @하진", 6, false)).toEqual({
      kind: "mention",
      query: "하진",
      rangeStart: 3,
      rangeEnd: 6,
    });
  });

  it("parses inline slash commands, resolves @ story-bible entities, matches SFX presets, and builds 9-slot readiness seeds", () => {
    const script = [
      "# 1화 옥상의 비밀",
      "/배경세트 @학교옥상 · 노을 역광",
      "/컷 @하진 이 철문을 밀고 들어선다 @구겨진편지 를 쥔 채 @야간통금규칙 을 어긴다",
      "/샷 로우앵글 와이드 28mm",
      "/말풍선 @하진 [외침] 여기서 기다리고 있었어?",
      "/성우감정 @하진 긴장 · 숨 가쁘게",
      "/효과음 쾅! [강함/큼]",
      "/AI콘티 붉은 노을 역광 아래 교복 실루엣과 철문",
      "/컷 @서연 이 천천히 돌아본다 @미등록소품",
      "@서연: 늦었네.",
    ].join("\n");

    const ast = parseSlashScriptDocument(script, SAMPLE_CATALOG);
    expect(ast.episodeTitle).toBe("1화 옥상의 비밀");
    expect(ast.scenes).toHaveLength(1);
    expect(ast.scenes[0]?.bg3dSetId).toBe("bg3d-school-rooftop-sunset");
    expect(ast.cuts).toHaveLength(2);

    const cut1 = ast.cuts[0]!;
    expect(cut1.lensPreset).toBe("wide");
    expect(cut1.bg3dSetId).toBe("bg3d-school-rooftop-sunset");
    expect(cut1.characterIds).toContain("char-hajin");
    expect(cut1.characterLockIds).toContain("lock-hajin-v1");
    expect(cut1.propIds).toContain("prop-letter");
    expect(cut1.ruleIds).toContain("rule-curfew");
    expect(cut1.dialogues[0]?.emotion).toBe("shout");
    expect(cut1.dialogues[0]?.text).toBe("여기서 기다리고 있었어?");
    expect(cut1.sfxList[0]?.presetId).toBe("sfx-kwang");
    expect(cut1.sfxList[0]?.emphasis).toBe("strong");
    expect(cut1.sfxList[0]?.scale).toBe("large");
    expect(cut1.voiceCues[0]?.voicePresetId).toBe("voice-hajin-calm");
    expect(cut1.aiContiPrompts[0]).toContain("붉은 노을 역광");
    expect(evaluateCutReadiness(cut1.readinessSlots).label).toBe("9/9");

    const cut2 = ast.cuts[1]!;
    expect(cut2.dialogues[0]?.speakerId).toBe("char-seoyeon");
    expect(cut2.dialogues[0]?.text).toBe("늦었네.");
    expect(ast.unresolvedMentions).toHaveLength(1);
    expect(ast.unresolvedMentions[0]?.mentionText).toBe("미등록소품");
  });

  it("projects AST into a schema-valid StudioWriterRoomDocument and round-trips losslessly", () => {
    const script = [
      "# 2화 빗속의 추격",
      "/배경세트 @학교옥상 · 야간",
      "/컷 @하진 이 난간으로 달린다",
      "/샷 망원 85mm 클로즈업",
      "/말풍선 @하진 [일반] 거기 서!",
      "/효과음 쿵! [강함/큼]",
    ].join("\n");

    const ast = parseSlashScriptDocument(script, SAMPLE_CATALOG);
    const writerDoc = buildWriterRoomDocumentFromSlashAst(ast);
    const parsed = StudioWriterRoomDocumentSchema.safeParse(writerDoc);
    expect(parsed.success).toBe(true);
    expect(writerDoc.stages["panel-plan"].items).toHaveLength(1);
    expect(writerDoc.stages["dialogue-sfx"].dialogue[0]?.characterId).toBe("char-hajin");
    expect(writerDoc.stages["dialogue-sfx"].sfx[0]?.presetId).toBe("sfx-kung");

    const serialized = serializeWriterRoomToSlashScript(writerDoc, SAMPLE_CATALOG);
    const roundTripped = parseSlashScriptDocument(serialized, SAMPLE_CATALOG);
    expect(roundTripped.episodeTitle).toBe("2화 빗속의 추격");
    expect(roundTripped.cuts).toHaveLength(1);
    expect(roundTripped.cuts[0]?.shot).toBe("망원 85mm 클로즈업");
    expect(roundTripped.cuts[0]?.dialogues[0]?.text).toBe("거기 서!");
    expect(roundTripped.cuts[0]?.sfxList[0]?.presetId).toBe("sfx-kung");
  });
});
