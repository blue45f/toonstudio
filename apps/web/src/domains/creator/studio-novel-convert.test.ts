import { describe, expect, it } from "vitest";

import { parseDialogueScript } from "./studio-dialogue";
import {
  buildWriterRoomDocumentFromNovelDraft,
  collectNovelSpeakers,
  mergeNovelCutWithNext,
  moveNovelCut,
  novelDraftToDialogueScript,
  parseNovelToScriptDraft,
  removeNovelCut,
  renameNovelSpeaker,
  setNovelCutSpeaker,
  splitNovelCutAtFirstSentence,
  updateNovelCutText,
  NOVEL_SOURCE_MAX_CHARS,
  type NovelScriptDraft,
} from "./studio-novel-convert";
import {
  admitStudioWriterRoomDocument,
  createEmptyStudioWriterRoomDocument,
} from "./studio-writer-room";

/**
 * 실제 한국어 소설 문단 샘플.
 * 의도적으로 섞은 케이스:
 *  - 따옴표 뒤 발화 동사("민준이 중얼거렸다") → 화자 추정
 *  - 따옴표 앞 발화 동사("달려와 말했다") → 화자 추정
 *  - 발화 동사가 없는 지문 뒤 대사 → 화자 미상 (지어내지 않음)
 *  - 목청만 높인 상인 대사 → 화자 미상
 *  - `이름:` 각본식 표기 (반복 등장) → 화자 확정
 */
const SAMPLE_NOVEL = [
  "밤하늘에 별이 총총했다. 민준은 낡은 정거장 벤치에 앉아 있었다.",
  "기차가 올 시간은 한참 지났지만, 그는 자리를 뜨지 않았다.",
  '"오늘도 안 오는 건가." 민준이 중얼거렸다. 그때 멀리서 발소리가 들렸다.',
  '지연이 숨을 헐떡이며 달려와 말했다. "미안해! 늦었지?"',
  '"괜찮아. 방금 왔어." 민준이 웃으며 말했다.',
  '지연은 벤치에 털썩 앉았다. "정말? 그럼 다행이다."',
  "***",
  "다음 날 아침, 시장은 사람들로 북적였다.",
  '상인들은 저마다 목청을 높였다. "자, 구경하세요!"',
  "민준: 지연아, 저기 봐. 대장간이 열었어.",
  "지연: 정말? 어제까지 닫혀 있었잖아.",
  "민준: 얼른 가 보자.",
  "지연: 그래, 가 보자.",
].join("\n\n");

describe("parseNovelToScriptDraft — 한국어 소설 샘플", () => {
  const result = parseNovelToScriptDraft(SAMPLE_NOVEL);

  it("장면 표지(***)로 장면을 나눈다", () => {
    expect(result.status).toBe("ok");
    expect(result.draft.scenes).toHaveLength(2);
    expect(result.stats.sceneCount).toBe(2);
  });

  it("지문과 대사를 컷으로 분리한다", () => {
    const [first] = result.draft.scenes;
    expect(first?.cuts[0]).toMatchObject({
      kind: "action",
      text: "밤하늘에 별이 총총했다. 민준은 낡은 정거장 벤치에 앉아 있었다.",
    });
    expect(result.stats.actionCount).toBe(8);
    expect(result.stats.dialogueCount).toBe(9);
    expect(result.stats.cutCount).toBe(17);
  });

  it("따옴표 뒤 발화 동사로 화자를 추정하고 추정으로 표시한다", () => {
    const [first] = result.draft.scenes;
    const dialogue = first?.cuts.find((cut) => cut.text === "오늘도 안 오는 건가.");
    expect(dialogue).toMatchObject({
      kind: "dialogue",
      speaker: "민준",
      speakerSource: "inferred",
    });
  });

  it("따옴표 앞 발화 동사로도 화자를 추정한다", () => {
    const [first] = result.draft.scenes;
    const dialogue = first?.cuts.find((cut) => cut.text === "미안해! 늦었지?");
    expect(dialogue).toMatchObject({ speaker: "지연", speakerSource: "inferred" });
  });

  it("발화 동사 패턴이 없으면 화자 미상으로 남긴다", () => {
    const [first, second] = result.draft.scenes;
    const noVerb = first?.cuts.find((cut) => cut.text === "정말? 그럼 다행이다.");
    expect(noVerb).toMatchObject({ speaker: null, speakerSource: "unknown" });
    const merchant = second?.cuts.find((cut) => cut.text === "자, 구경하세요!");
    expect(merchant).toMatchObject({ speaker: null, speakerSource: "unknown" });
    expect(result.stats.unknownSpeakerCount).toBe(2);
    expect(result.warnings.some((warning) => warning.includes("화자를 찾지 못한 대사"))).toBe(true);
  });

  it("`이름:` 각본식 표기는 화자 확정(explicit)이다", () => {
    const [, second] = result.draft.scenes;
    const dialogue = second?.cuts.find((cut) => cut.text.includes("대장간이 열었어"));
    expect(dialogue).toMatchObject({ speaker: "민준", speakerSource: "explicit" });
    expect(result.stats.speakers).toEqual(["민준", "지연"]);
  });
});

describe("parseNovelToScriptDraft — 표지·따옴표 변형", () => {
  it("빈 줄 2개 이상도 장면 경계다", () => {
    const result = parseNovelToScriptDraft("첫 장면이다.\n\n\n둘째 장면이다.");
    expect(result.draft.scenes).toHaveLength(2);
  });

  it("장 제목 줄은 장면 제목이 된다", () => {
    const result = parseNovelToScriptDraft("제1장 시작\n\n본문이 시작된다.");
    expect(result.draft.scenes[0]?.title).toBe("제1장 시작");
  });

  it("곡선 따옴표 대사도 추출한다", () => {
    const result = parseNovelToScriptDraft("“어서 와.” 민준이 말했다.");
    const dialogue = result.draft.scenes[0]?.cuts.find((cut) => cut.kind === "dialogue");
    expect(dialogue).toMatchObject({ text: "어서 와.", speaker: "민준", speakerSource: "inferred" });
  });

  it("`이름: \"대사\"` 한 번만 등장해도 확정 화자다", () => {
    const result = parseNovelToScriptDraft('민준: "지금 가야 해."');
    const dialogue = result.draft.scenes[0]?.cuts.find((cut) => cut.kind === "dialogue");
    expect(dialogue).toMatchObject({ text: "지금 가야 해.", speaker: "민준", speakerSource: "explicit" });
  });

  it("닫히지 않은 따옴표는 대사로 만들지 않고 지문으로 남긴다", () => {
    const result = parseNovelToScriptDraft('그는 "다녀올게 라고 끝내 말하지 못했다.');
    expect(result.stats.dialogueCount).toBe(0);
    expect(result.draft.scenes[0]?.cuts[0]?.kind).toBe("action");
    expect(result.draft.scenes[0]?.cuts[0]?.text).toContain("다녀올게");
  });

  it("대사가 없으면 지문만으로 초안을 만들고 경고를 남긴다", () => {
    const result = parseNovelToScriptDraft("바람이 불었다. 문이 천천히 열렸다.");
    expect(result.status).toBe("ok");
    expect(result.stats.dialogueCount).toBe(0);
    expect(result.warnings.some((warning) => warning.includes("따옴표 대사"))).toBe(true);
  });
});

describe("parseNovelToScriptDraft — 입력 상태 구분", () => {
  it("빈 입력은 empty 상태다", () => {
    expect(parseNovelToScriptDraft("").status).toBe("empty");
    expect(parseNovelToScriptDraft("  \n\n  ").status).toBe("empty");
  });

  it("상한을 넘는 입력은 자르지 않고 too-large 상태로 거부한다", () => {
    const result = parseNovelToScriptDraft("가".repeat(NOVEL_SOURCE_MAX_CHARS + 1));
    expect(result.status).toBe("too-large");
    expect(result.draft.scenes).toHaveLength(0);
    expect(result.warnings[0]).toContain("회차 단위로 나눠서");
  });
});

describe("초안 편집 연산", () => {
  const parsed = parseNovelToScriptDraft(SAMPLE_NOVEL);
  const draft: NovelScriptDraft = parsed.draft;

  it("컷 텍스트를 수정한다", () => {
    const target = draft.scenes[0]!.cuts[0]!;
    const next = updateNovelCutText(draft, target.id, "새벽하늘에 별이 졌다.");
    expect(next.scenes[0]?.cuts[0]?.text).toBe("새벽하늘에 별이 졌다.");
    expect(draft.scenes[0]?.cuts[0]?.text).not.toBe("새벽하늘에 별이 졌다.");
  });

  it("화자를 지정하면 출처가 manual이 되고, 해제하면 미상이 된다", () => {
    const unknown = draft.scenes[0]!.cuts.find((cut) => cut.speakerSource === "unknown" && cut.kind === "dialogue")!;
    const assigned = setNovelCutSpeaker(draft, unknown.id, "지연");
    expect(assigned.scenes[0]?.cuts.find((cut) => cut.id === unknown.id)).toMatchObject({
      speaker: "지연",
      speakerSource: "manual",
    });
    const cleared = setNovelCutSpeaker(assigned, unknown.id, null);
    expect(cleared.scenes[0]?.cuts.find((cut) => cut.id === unknown.id)).toMatchObject({
      speaker: null,
      speakerSource: "unknown",
    });
  });

  it("인물 단위 화자 이름 변경(renameNovelSpeaker)이 모든 대사에 적용된다", () => {
    const renamed = renameNovelSpeaker(draft, "민준", "김민준");
    const speakers = collectNovelSpeakers(renamed);
    expect(speakers.map((speaker) => speaker.name)).toEqual(["김민준", "지연"]);
  });

  it("지문+지문은 합치고, 화자가 다른 대사끼리는 합치지 않는다", () => {
    const scene = draft.scenes[0]!;
    const merged = mergeNovelCutWithNext(draft, scene.cuts[0]!.id);
    expect(merged.scenes[0]?.cuts.length).toBe(scene.cuts.length - 1);
    expect(merged.scenes[0]?.cuts[0]?.text).toContain("기차가 올 시간");

    const second = draft.scenes[1]!;
    const minjunCut = second.cuts.find(
      (cut) => cut.kind === "dialogue" && cut.speaker === "민준" && cut.text.includes("대장간")
    )!;
    const unchanged = mergeNovelCutWithNext(draft, minjunCut.id);
    expect(unchanged).toBe(draft);
  });

  it("컷을 첫 문장 뒤에서 나눈다. 문장이 하나면 나누지 않는다", () => {
    const scene = draft.scenes[0]!;
    const split = splitNovelCutAtFirstSentence(draft, scene.cuts[0]!.id);
    expect(split.scenes[0]?.cuts.length).toBe(scene.cuts.length + 1);
    expect(split.scenes[0]?.cuts[0]?.text).toBe("밤하늘에 별이 총총했다.");
    expect(split.scenes[0]?.cuts[1]?.text).toBe("민준은 낡은 정거장 벤치에 앉아 있었다.");

    const single = draft.scenes[1]!.cuts.find((cut) => cut.text.includes("북적였다"))!;
    expect(splitNovelCutAtFirstSentence(draft, single.id)).toBe(draft);
  });

  it("순서 변경과 삭제가 장면 안에서만 일어난다", () => {
    const scene = draft.scenes[0]!;
    const moved = moveNovelCut(draft, scene.cuts[0]!.id, 1);
    expect(moved.scenes[0]?.cuts[1]?.id).toBe(scene.cuts[0]!.id);
    expect(moveNovelCut(draft, scene.cuts[0]!.id, -1)).toBe(draft);
    const removed = removeNovelCut(draft, scene.cuts[0]!.id);
    expect(removed.scenes[0]?.cuts.length).toBe(scene.cuts.length - 1);
  });
});

describe("buildWriterRoomDocumentFromNovelDraft — 작가실 정본 반영", () => {
  const parsed = parseNovelToScriptDraft(SAMPLE_NOVEL);
  const base = createEmptyStudioWriterRoomDocument();
  const built = buildWriterRoomDocumentFromNovelDraft(base, parsed.draft, {
    characters: [{ id: "char-minjun", name: "민준" }],
  });

  it("작가실 문서 수용 검증을 통과한다", () => {
    const receipt = admitStudioWriterRoomDocument(built, base);
    expect(receipt.kind).toBe("accepted");
  });

  it("장면·컷·대사가 정본 구조로 들어가고 대사가 패널에 연결된다", () => {
    expect(built.stages.scenes.items).toHaveLength(2);
    expect(built.stages["panel-plan"].items.length).toBeGreaterThan(0);
    expect(built.stages["dialogue-sfx"].dialogue.length).toBe(9);
    const panelIds = new Set(built.stages["panel-plan"].items.map((panel) => panel.id));
    for (const line of built.stages["dialogue-sfx"].dialogue) {
      expect(panelIds.has(line.panelId)).toBe(true);
    }
    const sceneIds = new Set(built.stages.scenes.items.map((scene) => scene.id));
    for (const panel of built.stages["panel-plan"].items) {
      expect(sceneIds.has(panel.sceneId)).toBe(true);
    }
  });

  it("이름이 캐릭터 사전과 일치하면 연결하고, 없으면 null로 정직하게 둔다", () => {
    const minjunLines = built.stages["dialogue-sfx"].dialogue.filter(
      (line) => line.text === "오늘도 안 오는 건가."
    );
    expect(minjunLines[0]?.characterId).toBe("char-minjun");
    const jiyeonLines = built.stages["dialogue-sfx"].dialogue.filter(
      (line) => line.text === "미안해! 늦었지?"
    );
    expect(jiyeonLines[0]?.characterId).toBeNull();
    expect(built.stages.scenes.items[0]?.characterIds).toContain("char-minjun");
  });

  it("명시 매핑이 자동 매칭보다 우선하고 null 매핑은 연결을 막는다", () => {
    const mapped = buildWriterRoomDocumentFromNovelDraft(base, parsed.draft, {
      characters: [{ id: "char-minjun", name: "민준" }],
      speakerCharacterIds: { "민준": null, "지연": "char-jiyeon" },
    });
    const lines = mapped.stages["dialogue-sfx"].dialogue;
    expect(lines.find((line) => line.text === "오늘도 안 오는 건가.")?.characterId).toBeNull();
    expect(lines.find((line) => line.text === "미안해! 늦었지?")?.characterId).toBe("char-jiyeon");
  });

  it("알 수 없는 location/time/shot은 지어내지 않고 비워 둔다", () => {
    for (const scene of built.stages.scenes.items) {
      expect(scene.location).toBe("");
      expect(scene.time).toBe("");
    }
    expect(built.stages.scenes.items[0]?.summary).toContain("밤하늘에 별이 총총했다");
    expect(built.stages.scenes.items[1]?.summary).toContain("다음 날 아침");
    for (const panel of built.stages["panel-plan"].items) {
      expect(panel.shot).toBe("");
    }
  });

  it("기준 문서의 다른 단계는 그대로 유지한다", () => {
    const withPremise = createEmptyStudioWriterRoomDocument();
    withPremise.stages.premise = { text: "기존 기획 문장", characterIds: [] };
    const merged = buildWriterRoomDocumentFromNovelDraft(withPremise, parsed.draft);
    expect(merged.stages.premise.text).toBe("기존 기획 문장");
  });

  it("대사가 장면 첫 컷이면 빈 지문 패널을 만들어 대사를 연결한다", () => {
    const dialogueFirst = parseNovelToScriptDraft('"먼저 말부터 한다." 민준이 말했다.');
    const doc = buildWriterRoomDocumentFromNovelDraft(base, dialogueFirst.draft);
    expect(doc.stages["panel-plan"].items[0]?.action).toBe("");
    expect(doc.stages["dialogue-sfx"].dialogue[0]?.panelId).toBe(
      doc.stages["panel-plan"].items[0]?.id
    );
  });
});

describe("novelDraftToDialogueScript — 기존 대사 파이프라인 호환", () => {
  it("내보낸 미니 문법을 기존 parseDialogueScript가 다시 읽는다", () => {
    const parsed = parseNovelToScriptDraft(SAMPLE_NOVEL);
    const script = novelDraftToDialogueScript(parsed.draft);
    const lines = parseDialogueScript(script);
    const speeches = lines.filter((line) => line.kind === "speech");
    const narrations = lines.filter((line) => line.kind === "narration");
    expect(speeches.length).toBe(9);
    expect(narrations.length).toBe(8);
    expect(speeches.find((line) => line.text === "오늘도 안 오는 건가.")?.speaker).toBe("민준");
    // 화자 미상 대사는 이름을 지어내지 않고 빈 화자로 나간다.
    expect(speeches.find((line) => line.text === "정말? 그럼 다행이다.")?.speaker).toBe("");
  });
});
