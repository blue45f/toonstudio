import { describe, expect, it } from "vitest";

import { planStudioStoryboard } from "../studio-storyboard-planner";

import {
  buildMyStoryBeats,
  buildMyStoryDraft,
  composeMyStoryScript,
  composeMyStorySynopsis,
} from "./my-story-draft";
import { myStoryInterviewReducer } from "./my-story-interview";
import { MY_STORY_TEMPLATE_IDS } from "./my-story-model";
import { MY_STORY_TEMPLATES, myStorySkeleton } from "./my-story-templates";
import { emptySession, FIXTURE_ANSWERS, FIXTURE_AT, fullSession } from "./my-story-test-fixture";

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

describe("buildMyStoryDraft — 규칙 기반 배치", () => {
  it("회고 8컷: 질문 8개가 컷 8장에 한 칸씩 그대로 놓인다", () => {
    const draft = must(buildMyStoryDraft(fullSession("retrospective"), "ko"));
    expect(draft.cutCount).toBe(8);
    expect(draft.cuts.map((cut) => cut.labelKo)).toEqual([
      "도입", "장소", "등장", "사건", "결정적 순간", "마음", "그 뒤", "한 줄",
    ]);
    expect(draft.cuts[0]?.summary).toBe(FIXTURE_ANSWERS.when);
    expect(draft.cuts[1]?.summary).toBe(FIXTURE_ANSWERS.where);
    expect(draft.cuts[2]?.summary).toBe(FIXTURE_ANSWERS.who);
    expect(draft.cuts[7]?.summary).toBe(FIXTURE_ANSWERS.message);
    expect(draft.blankCuts).toBe(0);
    expect(draft.filledCuts).toBe(8);
    expect(draft.logline).toBe(FIXTURE_ANSWERS.message);
  });

  it("회고 4컷: 칸을 컷 요약에 모으되 사용자의 글자를 바꾸지 않는다", () => {
    const draft = must(buildMyStoryDraft(fullSession("retrospective", { cutCount: 4 }), "ko"));
    expect(draft.cuts).toHaveLength(4);
    expect(draft.cuts[0]?.summary).toBe(
      [FIXTURE_ANSWERS.when, FIXTURE_ANSWERS.where, FIXTURE_ANSWERS.who].join(" / "),
    );
    expect(draft.cuts[3]?.summary).toBe([FIXTURE_ANSWERS.ending, FIXTURE_ANSWERS.message].join(" / "));
  });

  it("같은 입력이면 같은 초안이 나온다(결정적)", () => {
    const a = buildMyStoryDraft(fullSession("career"), "ko");
    const b = buildMyStoryDraft(fullSession("career"), "ko");
    expect(a).toEqual(b);
  });

  it("지어내지 않는다 — 초안에 나오는 모든 글은 답변에서 왔거나 고정된 틀 문구다", () => {
    for (const template of MY_STORY_TEMPLATES) {
      const session = fullSession(template.id);
      const draft = must(buildMyStoryDraft(session, "ko"));
      const answers = Object.values(session.answers).filter((value): value is string => typeof value === "string");
      for (const cut of draft.cuts) {
        for (const part of cut.parts) expect(answers).toContain(part.text);
        if (cut.narration?.text) {
          expect(answers.some((answer) => answer.includes(cut.narration?.text ?? "") || (cut.narration?.text ?? "").includes(answer))).toBe(true);
        }
      }
    }
  });

  it("빈 답변은 빈칸으로 남고 대신 채우지 않는다", () => {
    const draft = must(buildMyStoryDraft(emptySession("family"), "ko"));
    expect(draft.blankCuts).toBe(8);
    expect(draft.filledCuts).toBe(0);
    for (const cut of draft.cuts) {
      expect(cut.blank).toBe(true);
      expect(cut.summary).toBe("");
      expect(cut.parts).toEqual([]);
      expect(cut.missing.length).toBeGreaterThan(0);
      if (cut.narration) expect(cut.narration.text).toBe("");
      if (cut.balloon) expect(cut.balloon.text).toBe("");
    }
    expect(draft.warnings.map((warning) => warning.code)).toEqual(["blank-cuts", "few-answers"]);
  });

  it("일부만 답하면 그 칸이 놓인 컷만 채워지고 나머지는 빈칸이다", () => {
    let session = emptySession("retrospective");
    session = myStoryInterviewReducer(session, { type: "answer", slot: "where", text: "외갓집 마당", at: FIXTURE_AT });
    const draft = must(buildMyStoryDraft(session, "ko"));
    expect(draft.cuts[1]?.blank).toBe(false);
    expect(draft.cuts[1]?.summary).toBe("외갓집 마당");
    expect(draft.filledCuts).toBe(1);
    expect(draft.blankCuts).toBe(7);
    expect(draft.answered).toBe(1);
  });

  it("4컷 골격에서 일부 칸만 비면 컷은 채워진 조각만 보이고 빈 칸 이름을 알려 준다", () => {
    let session = fullSession("retrospective", { cutCount: 4 });
    session = myStoryInterviewReducer(session, { type: "answer", slot: "where", text: "", at: FIXTURE_AT });
    const draft = must(buildMyStoryDraft(session, "ko"));
    const first = must(draft.cuts[0]);
    expect(first.blank).toBe(false);
    expect(first.summary).toBe([FIXTURE_ANSWERS.when, FIXTURE_ANSWERS.who].join(" / "));
    expect(first.missing.map((entry) => entry.slot)).toEqual(["where"]);
  });

  it("나레이션은 상자 한도로 나누고, 넘치는 부분은 버리지 않고 이어 쓸 후보로 남긴다", () => {
    const long = "수돗가에 모였다. 수박을 나눠 먹었다. 동생이 웃었다. 할머니도 따라 웃으셨다. 매미 소리가 크게 들렸다.";
    const session = fullSession("retrospective", { answers: { event: long } });
    const draft = must(buildMyStoryDraft(session, "ko"));
    const cut = must(draft.cuts.find((entry) => entry.roleId === "event"));
    const narration = must(cut.narration);
    expect(narration.maxChars).toBe(40);
    expect(Array.from(narration.text).length).toBeLessThanOrEqual(40);
    expect([narration.text, ...narration.more].join(" ")).toBe(long);
    expect(draft.warnings.some((warning) => warning.code === "narration-overflow")).toBe(true);
  });

  it("말풍선은 사용자가 따옴표로 묶은 말만 올리고, 없으면 비운다", () => {
    const draft = must(buildMyStoryDraft(fullSession("retrospective"), "ko"));
    const event = must(draft.cuts.find((cut) => cut.roleId === "event"));
    const moment = must(draft.cuts.find((cut) => cut.roleId === "moment"));
    expect(event.balloon?.text).toBe("이거 내 거야");
    expect(moment.balloon?.text).toBe("많이 먹어라");
    const none = must(buildMyStoryDraft(
      fullSession("retrospective", { answers: { event: "수박을 나눠 먹었다", turn: "할머니가 웃으셨다" } }),
      "ko",
    ));
    expect(none.cuts.find((cut) => cut.roleId === "event")?.balloon?.text).toBe("");
    expect(none.cuts.find((cut) => cut.roleId === "moment")?.balloon?.text).toBe("");
    // 말풍선 계획이 없는 컷은 balloon 자체가 없다.
    expect(none.cuts.find((cut) => cut.roleId === "open")?.balloon).toBeNull();
  });

  it("말풍선 권장 글자 수를 넘는 대사는 줄이지 않고 알리기만 한다", () => {
    const quote = "가".repeat(30);
    const draft = must(buildMyStoryDraft(
      fullSession("retrospective", { answers: { turn: `할머니가 “${quote}” 하셨다` } }),
      "ko",
    ));
    const moment = must(draft.cuts.find((cut) => cut.roleId === "moment"));
    expect(moment.balloon?.text).toBe(quote);
    expect(moment.balloon?.overflow).toBe(true);
    expect(draft.warnings.some((warning) => warning.code === "balloon-overflow")).toBe(true);
  });

  it("사용자가 채택한 AI 나레이션만 나레이션 후보를 대신하고, 채택을 풀면 규칙 기반으로 돌아온다", () => {
    let session = fullSession("retrospective");
    session = myStoryInterviewReducer(session, { type: "adopt-narration", slot: "feeling", text: "배불렀고 든든했다", at: FIXTURE_AT });
    const adopted = must(buildMyStoryDraft(session, "ko"));
    const feeling = must(adopted.cuts.find((cut) => cut.roleId === "feeling"));
    expect(feeling.narration?.text).toBe("배불렀고 든든했다");
    expect(feeling.narration?.source).toBe("ai");
    // 사용자의 원래 답변은 컷 요약에 그대로 남는다.
    expect(feeling.summary).toBe(FIXTURE_ANSWERS.feeling);
    session = myStoryInterviewReducer(session, { type: "clear-narration", slot: "feeling", at: FIXTURE_AT });
    const cleared = must(buildMyStoryDraft(session, "ko"));
    expect(cleared.cuts.find((cut) => cut.roleId === "feeling")?.narration?.source).toBe("answer");
  });

  it("제목은 사용자가 정한 값, 없으면 로케일에 맞는 템플릿 기본 제목이다", () => {
    const base = fullSession("neighborhood");
    expect(must(buildMyStoryDraft(base, "ko")).title).toBe("우리 동네 이야기");
    expect(must(buildMyStoryDraft(base, "en")).title).toBe("A story from my neighborhood");
    const named = myStoryInterviewReducer(base, { type: "set-title", title: "  우리 골목  ", at: FIXTURE_AT });
    const draft = must(buildMyStoryDraft(named, "ko"));
    expect(draft.title).toBe("우리 골목");
    expect(draft.titleIsDefault).toBe(false);
  });

  it("개인정보처럼 보이는 입력이 있으면 경고 종류를 알린다(입력은 그대로)", () => {
    const session = fullSession("family", { answers: { who: "엄마 010-1234-5678" } });
    const draft = must(buildMyStoryDraft(session, "ko"));
    expect(draft.warnings).toContainEqual({ code: "sensitive-text", kinds: ["phone"] });
    expect(draft.cuts[0]?.summary).toContain("010-1234-5678");
  });

  it("주제가 없으면 초안도 없다", () => {
    expect(buildMyStoryDraft(myStoryInterviewReducer(emptySession("family"), { type: "reset", at: FIXTURE_AT }), "ko")).toBeNull();
  });
});

describe("composeMyStoryScript / composeMyStorySynopsis", () => {
  it("연출 메모 문단 + 컷마다 한 문단으로, 빈칸은 (빈칸)으로 남긴다", () => {
    let session = fullSession("retrospective", { cutCount: 4 });
    session = myStoryInterviewReducer(session, { type: "answer", slot: "feeling", text: "", at: FIXTURE_AT });
    const draft = must(buildMyStoryDraft(session, "ko"));
    const script = composeMyStoryScript(draft, "ko");
    const paragraphs = script.split("\n\n");
    expect(paragraphs).toHaveLength(5);
    expect(paragraphs[0]).toContain("내 이야기 초안 · 회고 · 4컷");
    expect(paragraphs[0]).toContain("따뜻한 회상");
    expect(paragraphs[0]).toContain("한 상자 40자 이내");
    expect(paragraphs[1]).toContain("컷 1 · 도입");
    expect(paragraphs[1]).toContain(`장면: ${FIXTURE_ANSWERS.when} / ${FIXTURE_ANSWERS.where} / ${FIXTURE_ANSWERS.who}`);
    expect(paragraphs[3]).toContain("컷 3 · 마음");
    expect(paragraphs[3]).toContain("(빈칸)");
    expect(paragraphs[3]).toContain("그때 마음");
    expect(paragraphs[2]).toContain("말풍선: “많이 먹어라”");
  });

  it("영어 로케일에서는 틀 문구가 영어로 나오고 사용자의 글은 그대로다", () => {
    const draft = must(buildMyStoryDraft(fullSession("family", { cutCount: 4 }), "en"));
    const script = composeMyStoryScript(draft, "en");
    expect(script).toContain("My story draft · Family · 4 panels");
    expect(script).toContain("Panel 1 · Cast");
    expect(script).toContain(FIXTURE_ANSWERS.who);
    expect(script).not.toContain("컷 1");
  });

  it("줄거리는 사용자가 쓴 사건·순간·결말 답변만 이어 붙인다(메모를 섞지 않는다)", () => {
    const synopsis = composeMyStorySynopsis(fullSession("retrospective"));
    expect(synopsis).toBe([FIXTURE_ANSWERS.event, FIXTURE_ANSWERS.turn, FIXTURE_ANSWERS.ending].join(" "));
    expect(composeMyStorySynopsis(emptySession("retrospective"))).toBe("");
    // 질문에 해당 칸이 없는 안전 수칙 팩은 있는 칸만 쓴다.
    const safety = composeMyStorySynopsis(fullSession("safety"));
    expect(safety).toContain(FIXTURE_ANSWERS.event);
    expect(safety).not.toContain("undefined");
  });
});

describe("buildMyStoryBeats — 기존 콘티 플래너로 이어지는 비트", () => {
  const combos = MY_STORY_TEMPLATE_IDS.flatMap((id) => {
    const template = MY_STORY_TEMPLATES.find((candidate) => candidate.id === id);
    return (template?.cutCounts ?? []).map((cutCount) => [id, cutCount] as const);
  });

  it.each(combos)("%s %i컷: 가득 찬 초안과 빈 초안 모두 planStudioStoryboard가 받아들인다", (id, cutCount) => {
    for (const session of [fullSession(id, { cutCount }), emptySession(id)]) {
      const draftSession = myStoryInterviewReducer(session, { type: "set-cut-count", cutCount, at: FIXTURE_AT });
      const draft = must(buildMyStoryDraft(draftSession, "ko"));
      const beats = buildMyStoryBeats(draft, "ko");
      expect(beats).toHaveLength(cutCount);
      expect(new Set(beats.map((beat) => beat.id)).size).toBe(cutCount);
      expect(beats.map((beat) => beat.order)).toEqual(Array.from({ length: cutCount }, (_, index) => index));
      const plan = planStudioStoryboard(beats);
      expect(plan.shots).toHaveLength(cutCount);
      // 대화·반응 비트에 인물이 있어 character-missing 경고가 나지 않는다.
      expect(plan.warnings.filter((warning) => warning.startsWith("character-missing"))).toEqual([]);
    }
  });

  it("비트 종류와 대사가 컷의 역할·말풍선에서 온다. 빈 컷의 요약은 빈칸 표시다", () => {
    const draft = must(buildMyStoryDraft(fullSession("retrospective"), "ko"));
    const beats = buildMyStoryBeats(draft, "ko");
    expect(beats.map((beat) => beat.kind)).toEqual([
      "setup", "setup", "setup", "action", "dialogue", "reaction", "transition", "reveal",
    ]);
    expect(beats[3]?.dialogue).toBe("이거 내 거야");
    expect(beats[0]?.summary).toBe(FIXTURE_ANSWERS.when);
    const blankBeats = buildMyStoryBeats(must(buildMyStoryDraft(emptySession("retrospective"), "ko")), "ko");
    expect(blankBeats[0]?.summary).toBe("(빈칸) 도입 — 직접 채워 주세요");
    expect(blankBeats.every((beat) => beat.dialogue === "")).toBe(true);
  });

  it("장면은 컷 수와 무관하게 네 덩어리로 묶인다", () => {
    const eight = buildMyStoryBeats(must(buildMyStoryDraft(fullSession("retrospective"), "ko")), "ko");
    expect([...new Set(eight.map((beat) => beat.sceneId))]).toHaveLength(4);
    const four = buildMyStoryBeats(must(buildMyStoryDraft(fullSession("safety"), "ko")), "ko");
    expect([...new Set(four.map((beat) => beat.sceneId))]).toHaveLength(4);
  });

  it("골격 정의의 컷 수와 초안 컷 수가 항상 같다", () => {
    for (const template of MY_STORY_TEMPLATES) {
      for (const cutCount of template.cutCounts) {
        const expected = myStorySkeleton(template, cutCount).cuts.length;
        const draft = must(buildMyStoryDraft(fullSession(template.id, { cutCount }), "ko"));
        expect(draft.cuts).toHaveLength(expected);
      }
    }
  });
});
