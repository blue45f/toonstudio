import { describe, expect, it } from "vitest";

import { createExampleReaderFeedback, EXAMPLE_TITLE } from "./reader-feedback-example";
import { READER_FEEDBACK_LIMITS, readerFeedbackResponseSchema, type ReaderFeedbackResponse } from "./reader-feedback-schema";
import {
  CONTENT_DEDUPE_MIN_COMMENT,
  groupKeyOf,
  mergeReaderFeedback,
  peakBins,
  pickRepresentativeComments,
  sampleLevel,
  showsPercent,
  summarizeReaderFeedback,
  type FeedbackComment,
} from "./reader-feedback-summary";

function make(overrides: Record<string, unknown> = {}): ReaderFeedbackResponse {
  return readerFeedbackResponseSchema.parse({
    id: "r-1",
    createdAt: "2026-10-16T01:00:00.000Z",
    target: { kind: "package", id: "pkg-1", title: "새 연재작 1화", episode: 1 },
    nickname: null,
    ratings: { fun: 2, understanding: 2 },
    reading: { status: "finished" },
    emotions: [],
    comment: "",
    spoiler: false,
    ...overrides,
  });
}

const at = (minute: number) => new Date(Date.UTC(2026, 9, 16, 1, minute)).toISOString();

describe("체험용 예시 응답", () => {
  it("고정값이라 호출할 때마다 같고, 스키마를 통과한 14개(1화 8개·2화 6개)다", () => {
    const first = createExampleReaderFeedback();
    expect(first).toHaveLength(14);
    expect(createExampleReaderFeedback()).toEqual(first);
    expect(new Set(first.map((response) => response.id)).size).toBe(14);
    expect(first.every((response) => response.target.title === EXAMPLE_TITLE && response.target.kind === "manual")).toBe(true);
    expect(first.filter((response) => response.target.episode === 1)).toHaveLength(8);
  });
});

describe("응답 합치기와 중복 제거", () => {
  it("빈 목록에 합치면 모두 새로 들어오고, 같은 응답을 다시 합치면 모두 중복이다", () => {
    const examples = createExampleReaderFeedback();
    const first = mergeReaderFeedback([], examples);
    expect(first).toMatchObject({ added: 14, updated: 0, duplicates: 0, overflow: 0 });
    const again = mergeReaderFeedback(first.responses, examples);
    expect(again).toMatchObject({ added: 0, updated: 0, duplicates: 14, overflow: 0 });
    expect(again.responses).toEqual(first.responses);
  });

  it("같은 id 는 더 늦게 만든 응답이 이기고, 같거나 오래된 응답은 중복으로 센다", () => {
    const base = make({ id: "same", createdAt: at(10), comment: "처음 의견" });
    const newer = make({ id: "same", createdAt: at(20), comment: "고친 의견" });
    const older = make({ id: "same", createdAt: at(5), comment: "더 오래된 의견" });
    const merged = mergeReaderFeedback([base], [newer]);
    expect(merged).toMatchObject({ added: 0, updated: 1, duplicates: 0 });
    expect(merged.responses.map((response) => response.comment)).toEqual(["고친 의견"]);
    expect(mergeReaderFeedback(merged.responses, [older, base])).toMatchObject({ added: 0, updated: 0, duplicates: 2 });
  });

  it("id 가 같아도 대상·회차 묶음이 다르면 서로 다른 응답이다(옛 폼이 내보낸 파일의 회차 응답도 잃지 않는다)", () => {
    const manual = (episode: number | null, title = "내 작품") => ({ kind: "manual", id: null, title, episode });
    const ep1 = make({ id: "same", createdAt: at(10), target: manual(1), comment: "1화 의견입니다" });
    const ep2 = make({ id: "same", createdAt: at(20), target: manual(2), comment: "2화 의견입니다" });
    const none = make({ id: "same", createdAt: at(30), target: manual(null), comment: "회차 없는 의견입니다" });
    // 합쳐서 가져와도, 따로 가져와도 두 회차가 모두 남는다.
    expect(mergeReaderFeedback([], [ep1, ep2])).toMatchObject({ added: 2, updated: 0, duplicates: 0 });
    const apart = mergeReaderFeedback(mergeReaderFeedback([], [ep1]).responses, [ep2]);
    expect(apart).toMatchObject({ added: 1, updated: 0, duplicates: 0 });
    expect(apart.responses.map((response) => response.target.episode)).toEqual([1, 2]);
    expect(mergeReaderFeedback(apart.responses, [none])).toMatchObject({ added: 1, updated: 0, duplicates: 0 });
    // 같은 묶음이면 여전히 같은 응답을 고친 것이다: 더 늦은 쪽이 이기고, 같거나 오래되면 중복이다.
    const edited = make({ id: "same", createdAt: at(40), target: manual(2), comment: "고친 2화 의견입니다" });
    const again = mergeReaderFeedback(apart.responses, [edited, ep2]);
    expect(again).toMatchObject({ added: 0, updated: 1, duplicates: 1 });
    expect(again.responses.map((response) => [response.target.episode, response.comment])).toEqual([[1, "1화 의견입니다"], [2, "고친 2화 의견입니다"]]);
    // 대소문자·띄어쓰기만 다른 이름은 같은 묶음이다.
    const sameGroup = make({ id: "same", createdAt: at(50), target: manual(1, "  내   작품 "), comment: "다시 쓴 1화 의견입니다" });
    expect(mergeReaderFeedback(apart.responses, [sameGroup])).toMatchObject({ added: 0, updated: 1, duplicates: 0 });
  });

  it("묶음이 다른 같은 id 의 응답이 섞여 들어와도 결과 순서가 입력 순서에 좌우되지 않는다", () => {
    const manual = (episode: number) => ({ kind: "manual", id: null, title: "내 작품", episode });
    const a = make({ id: "same", createdAt: at(10), target: manual(1), comment: "1화 의견입니다" });
    const b = make({ id: "same", createdAt: at(10), target: manual(2), comment: "2화 의견입니다" });
    const forward = mergeReaderFeedback([], [a, b]).responses.map((response) => response.target.episode);
    const backward = mergeReaderFeedback([], [b, a]).responses.map((response) => response.target.episode);
    expect(forward).toEqual(backward);
  });

  it("한 번에 들어온 같은 id 의 여러 버전은 하나만 남기고 나머지는 중복으로 센다", () => {
    const v1 = make({ id: "x", createdAt: at(1), comment: "v1" });
    const v2 = make({ id: "x", createdAt: at(2), comment: "v2" });
    const v3 = make({ id: "x", createdAt: at(3), comment: "v3" });
    const fresh = mergeReaderFeedback([], [v1, v2]);
    expect(fresh).toMatchObject({ added: 1, updated: 0, duplicates: 1 });
    expect(fresh.responses[0]!.comment).toBe("v2");
    const existing = mergeReaderFeedback([], [v1]).responses;
    expect(mergeReaderFeedback(existing, [v2, v3])).toMatchObject({ added: 0, updated: 1, duplicates: 1 });
  });

  it("id 가 달라도 충분히 긴 의견까지 완전히 같으면 중복이고, 한 글자라도 다르면 새 응답이다", () => {
    const comment = "같은 말을 길게 적은 의견입니다";
    const original = make({ id: "a", comment, nickname: "별빛" });
    const clone = make({ id: "b", createdAt: at(30), comment, nickname: "별빛" });
    const different = make({ id: "c", createdAt: at(31), comment: `${comment}!`, nickname: "별빛" });
    expect(mergeReaderFeedback([original], [clone])).toMatchObject({ added: 0, duplicates: 1 });
    expect(mergeReaderFeedback([original], [clone, different])).toMatchObject({ added: 1, duplicates: 1 });
    expect(Array.from(comment).length).toBeGreaterThanOrEqual(CONTENT_DEDUPE_MIN_COMMENT);
  });

  it("의견이 없거나 짧은 응답은 점수가 똑같아도 서로 다른 독자일 수 있어 지우지 않는다", () => {
    const plain = (id: string, comment = "") => make({ id, createdAt: at(Number(id.slice(-1))), ratings: { fun: 3, understanding: 3 }, reading: { status: "finished" }, comment });
    const merged = mergeReaderFeedback([plain("r1")], [plain("r2"), plain("r3", "굿"), plain("r4", "굿")]);
    expect(merged).toMatchObject({ added: 3, duplicates: 0 });
    expect(merged.responses).toHaveLength(4);
    // 같은 id 로 다시 오면 그때는 중복이다.
    expect(mergeReaderFeedback(merged.responses, [plain("r2")])).toMatchObject({ added: 0, duplicates: 1 });
  });

  it("결과는 만든 시각 순이고 같으면 id 순이다", () => {
    const merged = mergeReaderFeedback([], [
      make({ id: "b", createdAt: at(5), comment: "b" }),
      make({ id: "a", createdAt: at(5), comment: "a" }),
      make({ id: "c", createdAt: at(1), comment: "c" }),
      make({ id: "d", createdAt: "2026-10-16T01:03:00Z", comment: "d" }),
    ]);
    expect(merged.responses.map((response) => response.id)).toEqual(["c", "d", "a", "b"]);
  });

  it("총수 상한을 넘으면 기존 응답을 지키고 새 응답을 받지 않으며 얼마나 못 받았는지 알린다", () => {
    const max = READER_FEEDBACK_LIMITS.maxTotalResponses;
    const make1000 = Array.from({ length: max }, (_, index) => make({ id: `old-${index}`, createdAt: at(index % 50), comment: `의견 ${index}` }));
    const full = mergeReaderFeedback([], make1000);
    expect(full.responses).toHaveLength(max);
    const extra = Array.from({ length: 5 }, (_, index) => make({ id: `new-${index}`, createdAt: at(59), comment: `새 의견 ${index}` }));
    const over = mergeReaderFeedback(full.responses, extra);
    expect(over).toMatchObject({ added: 0, overflow: 5 });
    expect(over.responses).toHaveLength(max);
    expect(over.responses.some((response) => response.id.startsWith("new-"))).toBe(false);
    // 상한에 걸려도 이미 있는 응답의 새 버전으로 바꾸는 것은 막지 않는다.
    expect(mergeReaderFeedback(full.responses, [make({ id: "old-0", createdAt: at(59), comment: "수정" })])).toMatchObject({ updated: 1, overflow: 0 });
  });

  it("합친 뒤 입력 배열을 바꾸지 않는다", () => {
    const existing = [make({ id: "z", createdAt: at(9), comment: "z" })];
    const incoming = [make({ id: "y", createdAt: at(1), comment: "y" })];
    const snapshot = JSON.stringify([existing, incoming]);
    mergeReaderFeedback(existing, incoming);
    expect(JSON.stringify([existing, incoming])).toBe(snapshot);
  });
});

describe("회차별 요약", () => {
  const groups = summarizeReaderFeedback(createExampleReaderFeedback());

  it("회차 번호 순으로 묶는다", () => {
    expect(groups.map((group) => [group.episode, group.count])).toEqual([[1, 8], [2, 6]]);
    expect(groups.every((group) => group.title === EXAMPLE_TITLE)).toBe(true);
    expect(groups.every((group) => group.sample === "small")).toBe(true);
  });

  it("점수의 평균과 분포를 센다", () => {
    const [first] = groups;
    expect(first!.fun).toEqual({ answered: 8, mean: 18 / 8, counts: [1, 4, 3] });
    expect(first!.understanding).toEqual({ answered: 8, mean: 17 / 8, counts: [2, 3, 3] });
    const second = groups[1]!;
    expect(second.fun).toMatchObject({ answered: 5, counts: [1, 1, 3] });
    expect(second.understanding.answered).toBe(6);
  });

  it("읽은 정도는 표시한 사람 기준으로 완독 비율을 낸다", () => {
    expect(groups[0]!.reading).toEqual({ finished: 3, left: 5, unmarked: 0, finishedShare: 3 / 8 });
    expect(groups[1]!.reading).toEqual({ finished: 3, left: 2, unmarked: 1, finishedShare: 3 / 5 });
  });

  it("컷 번호 이탈은 전체 컷 수까지 축을 잡아 구간별로 센다", () => {
    const cut = groups[0]!.dropOff.cut;
    expect(cut).toMatchObject({ total: 4, axisMax: 24, cutsPerBin: 2 });
    expect(cut.bins).toHaveLength(12);
    expect(cut.bins[0]).toEqual({ from: 1, to: 2, count: 0 });
    expect(cut.bins[3]).toEqual({ from: 7, to: 8, count: 3 });
    expect(cut.bins[7]).toEqual({ from: 15, to: 16, count: 1 });
    expect(cut.bins[11]).toEqual({ from: 23, to: 24, count: 0 });
    expect(cut.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(cut.total);
    expect(peakBins(cut.bins)).toEqual([{ from: 7, to: 8, count: 3 }]);
  });

  it("스크롤 이탈은 10% 단위 10구간으로 센다", () => {
    const scroll = groups[0]!.dropOff.scroll;
    expect(scroll.total).toBe(1);
    expect(scroll.bins).toHaveLength(10);
    expect(scroll.bins[4]).toEqual({ from: 40, to: 49, count: 1 });
    expect(scroll.bins[9]).toEqual({ from: 90, to: 100, count: 0 });
    expect(groups[1]!.dropOff.scroll.bins[7]).toEqual({ from: 70, to: 79, count: 1 });
  });

  it("컷이 많으면 구간을 20개 이하로 묶고 마지막 컷도 마지막 구간에 들어간다", () => {
    const [group] = summarizeReaderFeedback([
      make({ id: "first", reading: { status: "left", point: { mode: "cut", cut: 1, cutCount: 500 } }, comment: "처음" }),
      make({ id: "last", createdAt: at(2), reading: { status: "left", point: { mode: "cut", cut: 500, cutCount: 500 } }, comment: "끝" }),
    ]);
    const cut = group!.dropOff.cut;
    expect(cut.cutsPerBin).toBe(25);
    expect(cut.bins).toHaveLength(20);
    expect(cut.bins[0]).toMatchObject({ from: 1, to: 25, count: 1 });
    expect(cut.bins[19]).toMatchObject({ from: 476, to: 500, count: 1 });
  });

  it("이탈 표시가 없으면 구간은 비어 있고 최댓값 구간도 없다", () => {
    const [group] = summarizeReaderFeedback([make()]);
    expect(group!.dropOff.cut).toEqual({ total: 0, axisMax: 0, cutsPerBin: 1, bins: [] });
    expect(group!.dropOff.scroll.total).toBe(0);
    expect(peakBins(group!.dropOff.scroll.bins)).toEqual([]);
    expect(peakBins([{ from: 1, to: 1, count: 2 }, { from: 2, to: 2, count: 2 }, { from: 3, to: 3, count: 1 }])).toHaveLength(2);
  });

  it("감정은 많이 고른 순이고 같으면 정해진 순서다", () => {
    expect(groups[0]!.emotions.map((emotion) => [emotion.id, emotion.count])).toEqual([
      ["excited", 2], ["confused", 2], ["bored", 2],
      ["funny", 1], ["touched", 1], ["satisfied", 1], ["surprised", 1], ["tense", 1],
    ]);
    expect(groups[0]!.spoilerCount).toBe(1);
  });

  it("점수를 하나도 답하지 않으면 평균은 null 이다", () => {
    const [group] = summarizeReaderFeedback([make({ ratings: { fun: null, understanding: null }, comment: "의견만" })]);
    expect(group!.fun).toEqual({ answered: 0, mean: null, counts: [0, 0, 0] });
  });

  it("숨긴 의견은 대표 의견에서 빠지지만 집계와 전체 목록에는 그대로 있다", () => {
    const hidden = new Set(["example-1-3"]);
    const [group] = summarizeReaderFeedback(createExampleReaderFeedback(), hidden);
    expect(group!.hiddenCount).toBe(1);
    expect(group!.comments.find((comment) => comment.id === "example-1-3")?.hidden).toBe(true);
    expect(group!.representative.some((comment) => comment.id === "example-1-3")).toBe(false);
    expect(group!.fun).toEqual(groups[0]!.fun);
    expect(group!.dropOff).toEqual(groups[0]!.dropOff);
  });

  it("대표 의견은 최대 5개이고 문제 신호와 긍정 신호를 함께 담으며 스포일러는 뒤로 미룬다", () => {
    const representative = groups[0]!.representative;
    expect(representative).toHaveLength(5);
    expect(representative.some((comment) => comment.fun === 1 || comment.understanding === 1 || comment.reading.status === "left")).toBe(true);
    expect(representative.some((comment) => comment.fun === 3 && comment.understanding !== 1)).toBe(true);
    expect(representative.some((comment) => comment.spoiler)).toBe(false);
    expect(new Set(representative.map((comment) => comment.id)).size).toBe(5);
    expect(summarizeReaderFeedback(createExampleReaderFeedback())[0]!.representative).toEqual(representative);
  });
});

describe("묶음 키", () => {
  it("대상 id 와 회차가 같으면 한 묶음이고, 직접 적은 이름은 대소문자·공백 차이를 무시한다", () => {
    const groupsOf = (responses: ReaderFeedbackResponse[]) => summarizeReaderFeedback(responses).map((group) => group.count);
    expect(groupsOf([make({ id: "a" }), make({ id: "b", comment: "다른" })])).toEqual([2]);
    expect(groupsOf([make({ id: "a" }), make({ id: "b", target: { kind: "package", id: "pkg-1", title: "이름이 바뀜", episode: 1 } })])).toEqual([2]);
    expect(groupsOf([make({ id: "a" }), make({ id: "b", target: { kind: "package", id: "pkg-1", title: "새 연재작 1화", episode: 2 } })])).toEqual([1, 1]);
    const manual = (id: string, title: string) => make({ id, target: { kind: "manual", id: null, title, episode: null } });
    expect(groupsOf([manual("m1", "My   Story"), manual("m2", "my story"), manual("m3", "ＭＹ ＳＴＯＲＹ")])).toEqual([3]);
  });

  it("제목과 회차가 같은 다른 대상은 구분 표시가 필요하다고 알린다", () => {
    const result = summarizeReaderFeedback([
      make({ id: "a", target: { kind: "package", id: "pkg-aaaa", title: "새 연재작 1화", episode: 1 } }),
      make({ id: "b", target: { kind: "package", id: "pkg-bbbb", title: "새 연재작 1화", episode: 1 } }),
      make({ id: "c", target: { kind: "package", id: "pkg-cccc", title: "다른 작품", episode: 1 } }),
    ]);
    expect(result.map((group) => [group.title, group.needsDisambiguation])).toEqual([["다른 작품", false], ["새 연재작 1화", true], ["새 연재작 1화", true]]);
  });

  it("사용자 문자열이 __proto__·constructor 여도 묶음과 요약이 정상 동작하고 프로토타입이 바뀌지 않는다", () => {
    const target = { kind: "manual", id: null, title: "__proto__", episode: null };
    const result = summarizeReaderFeedback([
      make({ id: "p1", target, comment: "constructor", nickname: "__proto__" }),
      make({ id: "p2", target: { ...target, title: "constructor" }, comment: "prototype" }),
    ]);
    expect(result.map((group) => group.title).sort()).toEqual(["__proto__", "constructor"]);
    expect(groupKeyOf(make({ target }).target)).toBe("manual:__proto__#0");
    expect(({} as Record<string, unknown>).count).toBeUndefined();
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });
});

describe("표본 크기 등급", () => {
  it("5개 미만은 아주 작고 30개 미만은 작다", () => {
    expect([0, 1, 4].map(sampleLevel)).toEqual(["tiny", "tiny", "tiny"]);
    expect([5, 29].map(sampleLevel)).toEqual(["small", "small"]);
    expect([30, 1000].map(sampleLevel)).toEqual(["moderate", "moderate"]);
  });

  it("비율은 10개 이상일 때만 보여 준다", () => {
    expect(showsPercent(9)).toBe(false);
    expect(showsPercent(10)).toBe(true);
  });
});

describe("대표 의견 고르기", () => {
  function comment(overrides: Partial<FeedbackComment> & { id: string; text: string }): FeedbackComment {
    return {
      nickname: null,
      spoiler: false,
      fun: 2,
      understanding: 2,
      reading: { status: "finished" },
      createdAt: at(10),
      hidden: false,
      ...overrides,
    };
  }

  it("숨긴 의견과 빈 의견은 제외하고, 같은 말(구두점·대소문자 차이)은 한 번만 고른다", () => {
    const picked = pickRepresentativeComments([
      comment({ id: "a", text: "Nice art!" }),
      comment({ id: "b", text: "nice   art", createdAt: at(11) }),
      comment({ id: "c", text: "숨긴 의견", hidden: true }),
      comment({ id: "d", text: "" }),
      comment({ id: "e", text: "!!!" }),
    ]);
    // 같은 말은 더 자세한(긴) 쪽이 남는다.
    expect(picked.map((item) => item.id)).toEqual(["b", "e"]);
  });

  it("문제 신호 하나와 긍정 신호 하나를 먼저 고른 뒤 긴 의견 순으로 채운다", () => {
    const picked = pickRepresentativeComments([
      comment({ id: "long-neutral", text: "가".repeat(100) }),
      comment({ id: "mid-neutral", text: "나".repeat(60) }),
      comment({ id: "short-concern", text: "다".repeat(10), understanding: 1 }),
      comment({ id: "short-praise", text: "라".repeat(8), fun: 3 }),
    ], 3);
    expect(picked.map((item) => item.id)).toEqual(["short-concern", "short-praise", "long-neutral"]);
  });

  it("스포일러 의견은 자리가 남을 때만 들어가고, 개수 제한을 지킨다", () => {
    const items = [
      comment({ id: "spoiler", text: "가".repeat(150), spoiler: true, fun: 3 }),
      comment({ id: "a", text: "나".repeat(20) }),
      comment({ id: "b", text: "다".repeat(19) }),
    ];
    expect(pickRepresentativeComments(items, 2).map((item) => item.id)).toEqual(["a", "b"]);
    expect(pickRepresentativeComments(items, 5).map((item) => item.id)).toEqual(["a", "b", "spoiler"]);
    expect(pickRepresentativeComments(items, 0)).toEqual([]);
  });

  it("같은 입력이면 순서가 매번 같다", () => {
    const items = Array.from({ length: 12 }, (_, index) => comment({ id: `c-${index}`, text: `의견 ${index}`.padEnd(10, "가"), createdAt: at(index) }));
    expect(pickRepresentativeComments(items)).toEqual(pickRepresentativeComments([...items].reverse()));
  });
});
