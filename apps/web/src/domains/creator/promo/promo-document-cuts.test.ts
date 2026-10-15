import { describe, expect, it } from "vitest";

import {
  buildPromoCutDrafts,
  clampPromoCaption,
  movePromoCutDraft,
  normalizePromoCaption,
  parsePromoDocumentCutBundle,
  PROMO_ALL_CANDIDATE_ID,
  PROMO_CAPTION_LIMIT,
  PROMO_DESCRIPTION_LIMIT,
  PROMO_DOCUMENT_CUTS_KIND,
  PROMO_DOCUMENT_CUTS_MAX,
  promoCaptionCandidateIdFor,
  promoCaptionCandidates,
  promoPanelsFromCutDrafts,
  readPromoDocumentCutBundle,
  selectedPromoCutCount,
  serializePromoDocumentCutBundle,
  setPromoCutDraftCandidate,
  setPromoCutDraftCaption,
  togglePromoCutDraft,
} from "./promo-document-cuts";
import { emptyPromoProject, localPromoPlan, parsePromoProject, promoShortFormWeights } from "./promo-model";

import type { PromoDocumentCut, PromoDocumentCutBundle, PromoDocumentDialogue } from "./promo-document-cuts";
import type { PromoPanel, PromoProject, PromoSeconds } from "./promo-model";

const image = "data:image/png;base64,aGVsbG8=";
function cut(order: number, dialogues: PromoDocumentDialogue[] = [], extra: Partial<PromoDocumentCut> = {}): PromoDocumentCut {
  return { id: `p${Math.floor(order / 3)}:f${order}`, pageId: `p${Math.floor(order / 3)}`, pageIndex: Math.floor(order / 3), frameId: `f${order}`, order, image, dialogues, ...extra };
}
function bundle(cuts: PromoDocumentCut[], extra: Partial<PromoDocumentCutBundle> = {}): PromoDocumentCutBundle {
  return { kind: PROMO_DOCUMENT_CUTS_KIND, version: 1, documentId: "doc-1", title: "별빛 아래", cuts, ...extra };
}
const say = (id: string, text: string): PromoDocumentDialogue => ({ id, text });
function project(seconds: PromoSeconds = 15, panels: PromoPanel[] = []): PromoProject {
  return { ...emptyPromoProject(), seconds, panels };
}
function counter() {
  let value = 0;
  return () => `new-${value++}`;
}

describe("컷 묶음 계약 검증", () => {
  const valid = bundle([cut(0, [say("b1", "안녕")]), cut(1)]);

  it("직렬화한 묶음을 다시 읽으면 같고 입력을 바꾸지 않는다", () => {
    const json = JSON.parse(serializePromoDocumentCutBundle(valid));
    expect(parsePromoDocumentCutBundle(json)).toEqual(valid);
    expect(valid.cuts).toHaveLength(2);
  });

  it("문서 ID와 제목은 생략할 수 있다", () => {
    const parsed = parsePromoDocumentCutBundle({ kind: PROMO_DOCUMENT_CUTS_KIND, version: 1, cuts: [] });
    expect(parsed).toEqual({ kind: PROMO_DOCUMENT_CUTS_KIND, version: 1, documentId: null, title: "", cuts: [] });
  });

  it.each([
    ["객체가 아님", "text"],
    ["다른 종류", { ...valid, kind: "toonstudio-translation-drafts" }],
    ["지원하지 않는 버전", { ...valid, version: 2 }],
    ["컷 목록 없음", { ...valid, cuts: "none" }],
    ["컷 수 초과", { ...valid, cuts: Array.from({ length: PROMO_DOCUMENT_CUTS_MAX + 1 }, (_, index) => cut(index)) }],
    ["컷 ID 중복", { ...valid, cuts: [cut(0), cut(1, [], { id: cut(0).id })] }],
    ["대사 ID 중복", { ...valid, cuts: [cut(0, [say("a", "하나"), say("a", "둘")])] }],
    ["대사 수 초과", { ...valid, cuts: [cut(0, Array.from({ length: 41 }, (_, index) => say(`d${index}`, "대사")))] }],
    ["대사가 문자열이 아님", { ...valid, cuts: [{ ...cut(0), dialogues: [{ id: "a", text: 3 }] }] }],
    ["원격 이미지", { ...valid, cuts: [cut(0, [], { image: "https://example.invalid/a.png" })] }],
    ["SVG 이미지", { ...valid, cuts: [cut(0, [], { image: "data:image/svg+xml;base64,aGVsbG8=" })] }],
    ["스크립트 이미지", { ...valid, cuts: [cut(0, [], { image: "javascript:alert(1)" })] }],
    ["페이지 순번이 음수", { ...valid, cuts: [cut(0, [], { pageIndex: -1 })] }],
    ["읽기 순서가 소수", { ...valid, cuts: [cut(0, [], { order: 1.5 })] }],
    ["프레임 ID 비어 있음", { ...valid, cuts: [cut(0, [], { frameId: "" })] }],
    ["앞뒤 공백 ID", { ...valid, cuts: [cut(0, [], { id: " x " })] }],
    ["문서 ID 형식 오류", { ...valid, documentId: 12 }],
  ])("거절한다: %s", (_label, input) => {
    expect(() => parsePromoDocumentCutBundle(input)).toThrow();
  });

  it("다른 종류의 파일은 어떤 파일을 골라야 하는지 안내한다", () => {
    expect(() => parsePromoDocumentCutBundle({ kind: "toonstudio-translation-drafts" })).toThrow("홍보 쇼츠용 컷 묶음");
  });

  it("파일에서 읽을 때 빈 파일·JSON이 아닌 파일·정상 파일을 구분한다", async () => {
    await expect(readPromoDocumentCutBundle(new File([], "empty.json"))).rejects.toThrow("빈 파일");
    await expect(readPromoDocumentCutBundle(new File(["not json"], "bad.json"))).rejects.toThrow("JSON으로 읽을 수 없는");
    await expect(readPromoDocumentCutBundle(new File([JSON.stringify({ hello: 1 })], "other.json"))).rejects.toThrow("컷 묶음 파일이 아니에요");
    await expect(readPromoDocumentCutBundle(new File([serializePromoDocumentCutBundle(valid)], "ok.json"))).resolves.toEqual(valid);
  });
});

describe("자막 후보 추출", () => {
  it("공백·줄바꿈을 한 칸으로 정리한다", () => {
    expect(normalizePromoCaption("  안녕\n\n  하세요 \t 여러분  ")).toBe("안녕 하세요 여러분");
    expect(promoCaptionCandidates([say("a", "  안녕\n하세요  ")]).map((candidate) => candidate.text)).toEqual(["안녕 하세요"]);
  });

  it("말풍선마다 후보 하나, 둘 이상이면 모두 이은 후보를 마지막에 둔다", () => {
    const candidates = promoCaptionCandidates([say("a", "어서 와"), say("b", "오랜만이야")]);
    expect(candidates.map((candidate) => [candidate.id, candidate.kind, candidate.text])).toEqual([
      ["a", "dialogue", "어서 와"],
      ["b", "dialogue", "오랜만이야"],
      [PROMO_ALL_CANDIDATE_ID, "all", "어서 와 오랜만이야"],
    ]);
    expect(candidates.at(-1)?.sourceIds).toEqual(["a", "b"]);
    expect(promoCaptionCandidates([say("a", "혼자")]).map((candidate) => candidate.kind)).toEqual(["dialogue"]);
  });

  it("기호뿐인 말풍선과 같은 문구의 반복은 후보에서 뺀다", () => {
    const candidates = promoCaptionCandidates([say("a", "!!!"), say("b", "…"), say("c", "정말?"), say("d", "정말?"), say("e", "   ")]);
    expect(candidates.map((candidate) => candidate.id)).toEqual(["c"]);
  });

  it("대사가 없으면 후보도 없다", () => {
    expect(promoCaptionCandidates([])).toEqual([]);
  });

  it("120자를 넘으면 문장 끝에서 자르고 잘렸음을 알린다", () => {
    const sentence = "이 문장은 서른 글자쯤 되는 길이로 적어 둔 문장입니다.";
    const long = `${sentence} ${sentence} ${sentence} ${sentence} ${sentence} ${sentence}`;
    const [candidate] = promoCaptionCandidates([say("a", long)]);
    expect(candidate?.truncated).toBe(true);
    expect(Array.from(candidate?.text ?? "").length).toBeLessThanOrEqual(PROMO_CAPTION_LIMIT);
    expect(candidate?.text.endsWith("입니다.")).toBe(true);
    const noBreak = clampPromoCaption("가".repeat(300));
    expect(noBreak.truncated).toBe(true);
    expect(Array.from(noBreak.text)).toHaveLength(PROMO_CAPTION_LIMIT);
    expect(noBreak.text.endsWith("…")).toBe(true);
    expect(clampPromoCaption("짧은 문장").truncated).toBe(false);
  });

  it("이모지가 많아도 프로젝트 검증이 세는 UTF-16 길이로 120자 안에 든다", () => {
    const clamped = clampPromoCaption("😀".repeat(100));
    expect(clamped).toEqual({ text: `${"😀".repeat(59)}…`, truncated: true });
    expect(clamped.text.length).toBeLessThanOrEqual(PROMO_CAPTION_LIMIT);
    expect(clampPromoCaption("😀".repeat(60)).truncated).toBe(false);
    expect(clampPromoCaption("😀".repeat(61)).truncated).toBe(true);
    // 이어 붙인 길이도 UTF-16으로 센다: 59 + 1 + 61 = 121. 글자(코드 포인트)로 세면 62라서 후보가 생겨 버린다.
    const joined = promoCaptionCandidates([say("a", `가${"😀".repeat(29)}`), say("b", `나${"😁".repeat(30)}`)]);
    expect(joined.map((candidate) => candidate.kind)).toEqual(["dialogue", "dialogue"]);
  });

  it("이어 붙인 후보가 120자를 넘으면 만들지 않는다", () => {
    const candidates = promoCaptionCandidates([say("a", "가".repeat(70)), say("b", "나".repeat(70))]);
    expect(candidates.map((candidate) => candidate.kind)).toEqual(["dialogue", "dialogue"]);
  });

  it("후보 ID는 글자 그대로 같은 자막에서만 되짚는다", () => {
    const candidates = promoCaptionCandidates([say("a", "하나"), say("b", "둘")]);
    expect(promoCaptionCandidateIdFor(candidates, "둘")).toBe("b");
    expect(promoCaptionCandidateIdFor(candidates, "하나 둘")).toBe(PROMO_ALL_CANDIDATE_ID);
    expect(promoCaptionCandidateIdFor(candidates, "둘 ")).toBeNull();
  });
});

describe("샷 초안", () => {
  it("파일 안의 배열 순서와 상관없이 읽기 순서(order → 페이지 → 원래 위치)로 정렬한다", () => {
    const drafts = buildPromoCutDrafts(bundle([cut(2), cut(0), cut(1, [], { order: 0, pageIndex: 5, id: "tie-b" }), cut(3, [], { order: 0, pageIndex: 5, id: "tie-c" })]), 12);
    expect(drafts.map((draft) => draft.cut.id)).toEqual(["p0:f0", "tie-b", "tie-c", "p0:f2"]);
  });

  it("앞에서부터 상한만큼 기본 선택하고 기본 자막은 첫 말풍선이다", () => {
    const cuts = Array.from({ length: 8 }, (_, index) => cut(index, [say(`d${index}`, `대사 ${index}`), say(`e${index}`, "다음 말")]));
    const drafts = buildPromoCutDrafts(bundle(cuts), 6);
    expect(drafts.map((draft) => draft.include)).toEqual([true, true, true, true, true, true, false, false]);
    expect(drafts[0]?.caption).toBe("대사 0");
    expect(drafts[0]?.candidateId).toBe("d0");
    expect(selectedPromoCutCount(drafts)).toBe(6);
  });

  it("대사가 없는 컷은 자막을 비워 둔다", () => {
    const [draft] = buildPromoCutDrafts(bundle([cut(0)]), 6);
    expect(draft).toMatchObject({ caption: "", candidateId: null, candidates: [] });
  });

  it("상한 0이면 아무 컷도 기본 선택하지 않는다", () => {
    expect(selectedPromoCutCount(buildPromoCutDrafts(bundle([cut(0), cut(1)]), 0))).toBe(0);
  });

  it("선택은 상한을 넘기지 못하고 해제는 언제나 된다", () => {
    const drafts = buildPromoCutDrafts(bundle([cut(0), cut(1), cut(2)]), 2);
    expect(drafts.map((draft) => draft.include)).toEqual([true, true, false]);
    expect(togglePromoCutDraft(drafts, "p0:f2", true, 2).map((draft) => draft.include)).toEqual([true, true, false]);
    const released = togglePromoCutDraft(drafts, "p0:f0", false, 2);
    expect(released.map((draft) => draft.include)).toEqual([false, true, false]);
    expect(togglePromoCutDraft(released, "p0:f2", true, 2).map((draft) => draft.include)).toEqual([false, true, true]);
    expect(togglePromoCutDraft(drafts, "missing", true, 5)).toEqual(drafts);
  });

  it("후보를 고르면 자막이 바뀌고, 직접 고치면 후보 선택이 풀리며 후보와 같아지면 다시 잡힌다", () => {
    let drafts = buildPromoCutDrafts(bundle([cut(0, [say("a", "하나"), say("b", "둘")])]), 3);
    drafts = setPromoCutDraftCandidate(drafts, "p0:f0", "b");
    expect(drafts[0]).toMatchObject({ caption: "둘", candidateId: "b" });
    drafts = setPromoCutDraftCaption(drafts, "p0:f0", "둘!");
    expect(drafts[0]).toMatchObject({ caption: "둘!", candidateId: null });
    drafts = setPromoCutDraftCaption(drafts, "p0:f0", "하나");
    expect(drafts[0]?.candidateId).toBe("a");
    expect(setPromoCutDraftCandidate(drafts, "p0:f0", "zzz")).toEqual(drafts);
  });

  it("순서 이동은 양끝에서 멈추고 입력을 바꾸지 않는다", () => {
    const drafts = buildPromoCutDrafts(bundle([cut(0), cut(1), cut(2)]), 3);
    expect(movePromoCutDraft(drafts, "p0:f0", 1).map((draft) => draft.cut.id)).toEqual(["p0:f1", "p0:f0", "p0:f2"]);
    expect(movePromoCutDraft(drafts, "p0:f0", -1).map((draft) => draft.cut.id)).toEqual(["p0:f0", "p0:f1", "p0:f2"]);
    expect(movePromoCutDraft(drafts, "p0:f2", 1).map((draft) => draft.cut.id)).toEqual(["p0:f0", "p0:f1", "p0:f2"]);
    expect(drafts.map((draft) => draft.cut.id)).toEqual(["p0:f0", "p0:f1", "p0:f2"]);
  });
});

describe("샷 초안 적용", () => {
  const dialogues = (index: number) => [say(`d${index}`, `컷 ${index} 대사`), say(`e${index}`, "이어지는 말")];
  const drafts = (count: number, capacity = 12) => buildPromoCutDrafts(bundle(Array.from({ length: count }, (_, index) => cut(index, dialogues(index)))), capacity);

  it("선택한 컷만 읽기 순서대로 새 컷으로 만들고 이미지·자막·설명을 채운다", () => {
    const result = promoPanelsFromCutDrafts(drafts(3), project(), "replace", counter());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.added).toBe(3);
    expect(result.panels.map((panel) => panel.id)).toEqual(["new-0", "new-1", "new-2"]);
    expect(result.panels.every((panel) => panel.src === image && panel.fit === "contain")).toBe(true);
    expect(result.panels[1]).toMatchObject({ caption: "컷 1 대사", description: "컷 1 대사\n이어지는 말" });
    expect(parsePromoProject({ ...project(), panels: result.panels })).toBeTruthy();
  });

  it("모션과 상대 길이는 로컬 연출 규칙을 따르되 자막과 설명은 바꾸지 않는다", () => {
    const base = drafts(3);
    const result = promoPanelsFromCutDrafts(base, project(15), "replace", counter());
    if (!result.ok) throw new Error(result.message);
    const reference = localPromoPlan({ ...project(15), panels: result.panels.map((panel) => ({ ...panel, description: "" })) });
    expect(result.panels.map((panel) => [panel.motion, panel.weight])).toEqual(reference.map((panel) => [panel.motion, panel.weight]));
    expect(result.panels.map((panel) => panel.caption)).toEqual(["컷 0 대사", "컷 1 대사", "컷 2 대사"]);
  });

  it("10초에서는 숏폼 가중치를 쓰고 자막을 비운 컷은 설명이 길어도 길어지지 않는다", () => {
    const quiet = bundle([cut(0, [say("a", "!!!")], { dialogues: [say("a", "가".repeat(400))] }), cut(1, [say("b", "짧게")])]);
    let list = buildPromoCutDrafts(quiet, 6);
    list = setPromoCutDraftCaption(list, list[0]?.cut.id ?? "", "");
    const result = promoPanelsFromCutDrafts(list, project(10), "replace", counter());
    if (!result.ok) throw new Error(result.message);
    expect(result.panels[0]?.caption).toBe("");
    expect(result.panels[0]?.description.length).toBeGreaterThan(0);
    expect(result.panels.map((panel) => panel.weight)).toEqual(promoShortFormWeights(["", "짧게"]));
  });

  it("설명은 500자 안으로 줄이고 줄였음을 말줄임표로 남긴다", () => {
    const wordy = bundle([cut(0, [say("a", "가".repeat(300)), say("b", "나".repeat(300))])]);
    const result = promoPanelsFromCutDrafts(buildPromoCutDrafts(wordy, 6), project(), "replace", counter());
    if (!result.ok) throw new Error(result.message);
    const description = result.panels[0]?.description ?? "";
    expect(Array.from(description)).toHaveLength(PROMO_DESCRIPTION_LIMIT);
    expect(description.endsWith("…")).toBe(true);
  });

  it("추가 모드는 기존 컷을 그대로 두고 모션 순환을 이어 붙인다", () => {
    const existing: PromoPanel[] = [
      { id: "old-0", src: image, description: "", caption: "기존 1", motion: "still", fit: "cover", weight: 2 },
      { id: "old-1", src: image, description: "", caption: "기존 2", motion: "still", fit: "cover", weight: 2 },
    ];
    const base = project(15, existing);
    const result = promoPanelsFromCutDrafts(drafts(2), base, "append", counter());
    if (!result.ok) throw new Error(result.message);
    expect(result.panels).toHaveLength(4);
    expect(result.panels.slice(0, 2)).toEqual(existing);
    expect(result.panels[0]).toBe(existing[0]);
    const replaced = promoPanelsFromCutDrafts(drafts(2), base, "replace", counter());
    if (!replaced.ok) throw new Error(replaced.message);
    expect(result.panels[2]?.motion).not.toBe(replaced.panels[0]?.motion);
    expect(base.panels).toHaveLength(2);
  });

  it("10초 영상은 7개 이상 선택하면 거절하고 6개까지만 받는다", () => {
    const seven = drafts(7, 7);
    const refused = promoPanelsFromCutDrafts(seven, project(10), "replace", counter());
    expect(refused).toMatchObject({ ok: false });
    expect(refused.ok ? "" : refused.message).toContain("6개");
    const six = drafts(7, 6);
    const accepted = promoPanelsFromCutDrafts(six, project(10), "replace", counter());
    expect(accepted.ok && accepted.panels).toHaveLength(6);
  });

  it("추가 모드의 남은 자리를 넘기면 남은 개수를 알리고, 가득 차면 교체를 안내한다", () => {
    const oldPanel = (id: string): PromoPanel => ({ id, src: image, description: "", caption: "", motion: "still", fit: "contain", weight: 1 });
    const existing = Array.from({ length: 5 }, (_, index) => oldPanel(`old-${index}`));
    const crowded = project(10, existing);
    const over = promoPanelsFromCutDrafts(drafts(3, 3), crowded, "append", counter());
    expect(over.ok ? "" : over.message).toContain("1개만 더");
    const full = promoPanelsFromCutDrafts(drafts(1, 1), project(10, [...existing, oldPanel("old-5")]), "append", counter());
    expect(full.ok ? "" : full.message).toContain("가득 찼어요");
  });

  it("고른 컷이 없거나 자막이 120자를 넘으면 거절한다", () => {
    const none = buildPromoCutDrafts(bundle([cut(0)]), 0);
    expect(promoPanelsFromCutDrafts(none, project(), "replace", counter())).toMatchObject({ ok: false });
    const long = setPromoCutDraftCaption(drafts(1), "p0:f0", "가".repeat(121));
    const refused = promoPanelsFromCutDrafts(long, project(), "replace", counter());
    expect(refused.ok ? "" : refused.message).toContain("120자");
  });

  it("이모지가 든 자막도 적용한 프로젝트가 parsePromoProject 검증을 통과한다", () => {
    const wordy = bundle([cut(0, [say("a", `가${"😀".repeat(90)}`)])]);
    const result = promoPanelsFromCutDrafts(buildPromoCutDrafts(wordy, 12), project(15), "replace", counter());
    if (!result.ok) throw new Error(result.message);
    const caption = result.panels[0]?.caption ?? "";
    expect(caption.length).toBeLessThanOrEqual(PROMO_CAPTION_LIMIT);
    const parsed = parsePromoProject(JSON.parse(JSON.stringify({ ...project(15), panels: result.panels })));
    expect(parsed.panels[0]?.caption).toBe(caption);
    // 직접 고친 자막이 UTF-16 길이로 120자를 넘으면 적용 전에 거절한다.
    const tooLong = setPromoCutDraftCaption(buildPromoCutDrafts(wordy, 12), "p0:f0", "😀".repeat(61));
    expect(promoPanelsFromCutDrafts(tooLong, project(15), "replace", counter())).toMatchObject({ ok: false });
  });

  it("기본 ID 생성기는 crypto.randomUUID를 쓰고 매번 다르다", () => {
    const result = promoPanelsFromCutDrafts(drafts(2), project(), "replace");
    if (!result.ok) throw new Error(result.message);
    expect(new Set(result.panels.map((panel) => panel.id)).size).toBe(2);
    expect(result.panels.every((panel) => /^[A-Za-z0-9_-]{1,80}$/u.test(panel.id))).toBe(true);
  });
});
