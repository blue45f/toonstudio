import { describe, expect, it, vi } from "vitest";

import {
  canShareReaderFeedback,
  copyReaderFeedback,
  createReaderFeedbackFile,
  exceedsJsonDepth,
  inspectJsonValue,
  parseReaderFeedbackText,
  readReaderFeedbackFile,
  readerFeedbackFilename,
  serializeReaderFeedbackFile,
  shareReaderFeedback,
} from "./reader-feedback-io";
import {
  READER_FEEDBACK_LIMITS,
  readerFeedbackFileSchema,
  readerFeedbackResponseSchema,
  type ReaderFeedbackResponse,
} from "./reader-feedback-schema";
import { CONTACT_MASK } from "./reader-feedback-text";

function rawResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "resp-1",
    createdAt: "2026-10-16T01:00:00.000Z",
    target: { kind: "package", id: "pkg-1", title: "새 연재작 1화", episode: 1 },
    nickname: "별빛",
    ratings: { fun: 3, understanding: 2 },
    reading: { status: "left", point: { mode: "cut", cut: 7, cutCount: 24 } },
    emotions: ["funny", "tense"],
    comment: "7컷에서 대사가 너무 빨리 지나가요.",
    spoiler: false,
    ...overrides,
  };
}

function rawFile(responses: readonly Record<string, unknown>[] = [rawResponse()], overrides: Record<string, unknown> = {}) {
  return { kind: "toonstudio-reader-feedback", version: 1, exportedAt: "2026-10-16T01:05:00.000Z", responses, ...overrides };
}

const parse = (value: unknown) => parseReaderFeedbackText(JSON.stringify(value));
const chars = (...codePoints: number[]) => String.fromCodePoint(...codePoints);

function expectFailure(result: ReturnType<typeof parseReaderFeedbackText>, code: string) {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.code).toBe(code);
}

function firstResponse(value: unknown): ReaderFeedbackResponse {
  const result = parse(value);
  if (!result.ok) throw new Error(`파싱 실패: ${result.code} ${JSON.stringify(result.issues)}`);
  return result.file.responses[0]!;
}

describe("응답 파일 읽기: 정상 경로", () => {
  it("내보낸 파일은 그대로 다시 가져올 수 있다(왕복)", () => {
    const response = readerFeedbackResponseSchema.parse(rawResponse());
    const file = createReaderFeedbackFile(response, "2026-10-16T01:05:00.000Z");
    const json = serializeReaderFeedbackFile(file);
    expect(parseReaderFeedbackText(json)).toEqual({ ok: true, file });
    expect(JSON.parse(json)).toMatchObject({ kind: "toonstudio-reader-feedback", version: 1 });
  });

  it("UTF-8 BOM 이 붙은 파일도 읽는다", () => {
    expect(parseReaderFeedbackText(`${chars(0xfeff)}${JSON.stringify(rawFile())}`).ok).toBe(true);
  });

  it("끝까지 읽음·스크롤 이탈·직접 적은 작품 이름·점수 없음 같은 가능한 모양을 모두 받는다", () => {
    expect(firstResponse(rawFile([rawResponse({ reading: { status: "finished" } })])).reading).toEqual({ status: "finished" });
    expect(firstResponse(rawFile([rawResponse({ reading: { status: "left", point: { mode: "scroll", percent: 100 } } })])).reading)
      .toEqual({ status: "left", point: { mode: "scroll", percent: 100 } });
    expect(firstResponse(rawFile([rawResponse({ target: { kind: "manual", id: null, title: "내 작품", episode: null }, nickname: null })])).target)
      .toEqual({ kind: "manual", id: null, title: "내 작품", episode: null });
    expect(firstResponse(rawFile([rawResponse({ ratings: { fun: null, understanding: null }, reading: { status: "unmarked" }, emotions: [], comment: "의견만 남겨요" })])).comment)
      .toBe("의견만 남겨요");
  });

  it("문자열 값에 __proto__ 같은 말이 들어 있는 것은 키가 아니므로 막지 않는다", () => {
    expect(firstResponse(rawFile([rawResponse({ comment: "__proto__ constructor prototype" })])).comment).toBe("__proto__ constructor prototype");
  });

  it("괄호가 많은 의견은 문자열 안이므로 깊이로 세지 않는다", () => {
    expect(parse(rawFile([rawResponse({ comment: "[[[[[[[[[[[[ {{{{{{{{{{ ]]]]]]]]]]]]" })])).ok).toBe(true);
    expect(parseReaderFeedbackText(JSON.stringify(rawFile([rawResponse({ comment: "따옴표 \\\" 와 [[[[[[[[" })]))).ok).toBe(true);
  });
});

describe("악의적·잘못된 입력 방어", () => {
  it("빈 입력·JSON 이 아닌 입력·객체가 아닌 JSON 을 거절한다", () => {
    expectFailure(parseReaderFeedbackText(""), "empty");
    expectFailure(parseReaderFeedbackText("   \n"), "empty");
    expectFailure(parseReaderFeedbackText("{ 깨짐"), "not-json");
    expectFailure(parseReaderFeedbackText("[1,2,3]"), "not-object");
    expectFailure(parseReaderFeedbackText("42"), "not-object");
    expectFailure(parseReaderFeedbackText("null"), "not-object");
  });

  it("큰 입력은 JSON 으로 풀기 전에 거절한다", () => {
    const huge = `{"kind":"toonstudio-reader-feedback","pad":"${"x".repeat(READER_FEEDBACK_LIMITS.maxFileBytes)}"}`;
    const parseSpy = vi.spyOn(JSON, "parse");
    expectFailure(parseReaderFeedbackText(huge), "too-large");
    expect(parseSpy).not.toHaveBeenCalled();
    parseSpy.mockRestore();
  });

  it("아주 깊은 중첩은 호출 스택을 쓰기 전에 거절한다", () => {
    expectFailure(parseReaderFeedbackText("[".repeat(100_000)), "too-deep");
    expectFailure(parseReaderFeedbackText(`${"{\"a\":".repeat(5_000)}1${"}".repeat(5_000)}`), "too-deep");
    expectFailure(parseReaderFeedbackText("[[[[[[[1]]]]]]]"), "too-deep");
  });

  it("노드 수가 너무 많은 배열은 거절한다", () => {
    const wide = JSON.stringify(Array.from({ length: READER_FEEDBACK_LIMITS.maxJsonNodes + 5 }, () => 0));
    expect(wide.length).toBeLessThan(READER_FEEDBACK_LIMITS.maxFileBytes);
    expectFailure(parseReaderFeedbackText(wide), "too-many-nodes");
  });

  it("프로토타입 오염 키는 어느 깊이에 있어도 파일 전체를 거절하고 전역 프로토타입을 바꾸지 않는다", () => {
    const base = JSON.stringify(rawFile());
    const polluted = [
      base.replace('{"kind"', '{"__proto__":{"polluted":"yes"},"kind"'),
      base.replace('"id":"resp-1"', '"id":"resp-1","constructor":{"prototype":{"polluted":"yes"}}'),
      base.replace('"ratings":{', '"ratings":{"__proto__":{"polluted":"yes"},'),
      base.replace('"point":{', '"point":{"prototype":{"polluted":"yes"},'),
    ];
    for (const text of polluted) {
      expectFailure(parseReaderFeedbackText(text), "forbidden-key");
      // zod 의 strictObject 는 own `__proto__` 키를 거절하지 않고 무시한다(실측). 그래서 스키마 앞의 명시적 키 검사가
      // 필요하다. 검사를 건너뛰어도 스키마의 출력에는 그 키가 실리지 않아 오염은 일어나지 않는다.
      const bypassed = readerFeedbackFileSchema.safeParse(JSON.parse(text));
      if (bypassed.success) expect(Object.keys(bypassed.data)).not.toContain("__proto__");
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted")).toBe(false);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    }
  });

  it("inspectJsonValue 는 배열 안의 객체까지 순회하고 반복문이라 재귀 한도와 무관하다", () => {
    expect(inspectJsonValue(JSON.parse('[{"a":[{"__proto__":1}]}]'), 100)).toBe("forbidden-key");
    expect(inspectJsonValue({ a: [1, { b: 2 }] }, 100)).toBe("ok");
    let nested: unknown = 1;
    for (let index = 0; index < 50_000; index += 1) nested = [nested];
    expect(inspectJsonValue(nested, 100_000)).toBe("ok");
  });

  it("exceedsJsonDepth 는 문자열 안의 괄호와 이스케이프된 따옴표를 무시한다", () => {
    expect(exceedsJsonDepth('{"a":"[[[[[[[[[[["}', 2)).toBe(false);
    expect(exceedsJsonDepth('{"a":"\\"[[[[[[[[[["}', 2)).toBe(false);
    expect(exceedsJsonDepth('{"a":[1]}', 2)).toBe(false);
    expect(exceedsJsonDepth('{"a":[[1]]}', 2)).toBe(true);
    expect(exceedsJsonDepth("]]]]][[", 2)).toBe(false);
  });

  it("kind·version 이 다르면 이유가 드러나게 거절한다", () => {
    expectFailure(parse({ kind: "toonstudio-beta-feedback", version: 1, feedback: [] }), "legacy-beta-feedback");
    expectFailure(parse({ kind: "toonstudio-beta", version: 1 }), "wrong-kind");
    expectFailure(parse({}), "wrong-kind");
    expectFailure(parse(rawFile(undefined, { version: 2 })), "newer-version");
    expectFailure(parse(rawFile(undefined, { version: 0 })), "unsupported-version");
    expectFailure(parse(rawFile(undefined, { version: "1" })), "unsupported-version");
  });

  it("알 수 없는 키는 모든 층에서 거절한다(이메일·IP 같은 식별 필드를 몰래 실어 보낼 수 없다)", () => {
    expectFailure(parse(rawFile(undefined, { extra: 1 })), "invalid");
    expectFailure(parse(rawFile([rawResponse({ email: "a@b.co" })])), "invalid");
    expectFailure(parse(rawFile([rawResponse({ target: { kind: "package", id: "p", title: "t", episode: 1, ip: "1.1.1.1" } })])), "invalid");
    expectFailure(parse(rawFile([rawResponse({ ratings: { fun: 1, understanding: 1, boredom: 3 } })])), "invalid");
    expectFailure(parse(rawFile([rawResponse({ reading: { status: "finished", point: { mode: "scroll", percent: 1 } } })])), "invalid");
  });

  it("범위를 벗어나거나 정수가 아닌 숫자를 거절한다", () => {
    const withPoint = (point: Record<string, unknown>) => rawFile([rawResponse({ reading: { status: "left", point } })]);
    for (const point of [
      { mode: "cut", cut: 0, cutCount: null },
      { mode: "cut", cut: 501, cutCount: null },
      { mode: "cut", cut: 1.5, cutCount: null },
      { mode: "cut", cut: 8, cutCount: 7 },
      { mode: "scroll", percent: -1 },
      { mode: "scroll", percent: 101 },
      { mode: "scroll", percent: 50.5 },
      { mode: "scroll", percent: "50" },
      { mode: "warp", percent: 5 },
    ]) expectFailure(parse(withPoint(point)), "invalid");
    expectFailure(parseReaderFeedbackText(JSON.stringify(withPoint({ mode: "cut", cut: 7, cutCount: null })).replace('"cut":7', '"cut":1e999')), "invalid");
    expectFailure(parse(rawFile([rawResponse({ ratings: { fun: 4, understanding: 1 } })])), "invalid");
    expectFailure(parse(rawFile([rawResponse({ ratings: { fun: 0, understanding: 1 } })])), "invalid");
    expectFailure(parse(rawFile([rawResponse({ ratings: { fun: "3", understanding: 1 } })])), "invalid");
    expectFailure(parse(rawFile([rawResponse({ target: { kind: "package", id: "p", title: "t", episode: 0 } })])), "invalid");
    expectFailure(parse(rawFile([rawResponse({ target: { kind: "package", id: "p", title: "t", episode: 10_000 } })])), "invalid");
  });

  it("id·시각·대상·감정 태그 형식을 지킨다", () => {
    for (const overrides of [
      { id: "<img src=x onerror=alert(1)>" },
      { id: "a b" },
      { id: "" },
      { id: "x".repeat(81) },
      { createdAt: "어제" },
      { createdAt: "2026-10-16" },
      { target: { kind: "manual", id: "p", title: "t", episode: null } },
      { target: { kind: "work", id: null, title: "t", episode: null } },
      { target: { kind: "package", id: "p", title: "   ", episode: null } },
      { target: { kind: "folder", id: "p", title: "t", episode: null } },
      { emotions: ["funny", "funny"] },
      { emotions: ["sparkle"] },
      { emotions: ["funny", "tense", "sad", "angry"] },
      { emotions: "funny" },
      { spoiler: "yes" },
    ]) expectFailure(parse(rawFile([rawResponse(overrides)])), "invalid");
  });

  it("응답이 0개이거나 상한보다 많거나 내용이 아예 없는 응답은 거절한다", () => {
    expectFailure(parse(rawFile([])), "invalid");
    const many = Array.from({ length: READER_FEEDBACK_LIMITS.maxResponsesPerFile + 1 }, (_, index) => rawResponse({ id: `r-${index}` }));
    expectFailure(parse(rawFile(many)), "invalid");
    expect(parse(rawFile(many.slice(0, READER_FEEDBACK_LIMITS.maxResponsesPerFile))).ok).toBe(true);
    expectFailure(parse(rawFile([rawResponse({ ratings: { fun: null, understanding: null }, reading: { status: "unmarked" }, emotions: [], comment: "  \n " })])), "invalid");
  });

  it("검증 실패 위치는 스키마의 경로만 알려 주고 입력의 키 이름을 되풀이하지 않는다", () => {
    const result = parse(rawFile([rawResponse({ "<script>alert(1)</script>": 1, ratings: { fun: 9, understanding: 1 } })]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.length).toBeLessThanOrEqual(5);
    expect(JSON.stringify(result.issues)).not.toContain("script");
    expect(result.issues.every((issue) => /^[A-Za-z0-9.[\]?]*$/u.test(issue.path))).toBe(true);
  });
});

describe("XSS·표시 위장 문자열은 일반 글자로만 남는다", () => {
  it("HTML·스크립트 조각은 해석하지 않고 글자 그대로 둔다(화면은 텍스트 노드로만 그린다)", () => {
    const attack = '<img src=x onerror="alert(1)"><script>alert(2)</script> javascript:alert(3)';
    const response = firstResponse(rawFile([rawResponse({
      target: { kind: "package", id: "pkg-1", title: attack, episode: 1 },
      nickname: "<b>굵게</b>",
      comment: attack,
    })]));
    expect(response.target.title).toBe(attack);
    expect(response.comment).toBe(attack);
    expect(response.nickname).toBe("<b>굵게</b>");
  });

  it("제어 문자·방향 전환 문자·제로폭 문자·짝 없는 서로게이트를 지우고 줄바꿈을 공백으로 접는다", () => {
    // 눈에 보이지 않는 문자를 소스에 직접 두지 않고 코드 포인트로 조립한다: NUL, RLO(U+202E), ZWSP, U+2066, NEL(U+0085), DEL.
    const dirty = ["a", chars(0), "b", chars(0x202e), "c", chars(0x200b), "d", chars(0x2066), "e", chars(0x85), "f", chars(0x7f), "g", "\n\n  h\ti"].join("");
    const text = JSON.stringify(rawFile([rawResponse({ comment: dirty })])).replace("g\\n", "g\\ud800");
    expect(text).toContain("\\ud800");
    const result = parseReaderFeedbackText(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.responses[0]!.comment).toBe("abcde fg h i");
      expect(result.file.responses[0]!.comment.isWellFormed()).toBe(true);
    }
  });

  it("ALM·금지된 서식 문자·한글 채움 문자도 지우고, 그것뿐인 의견은 답이 아니며 닉네임은 비운다", () => {
    // ALM(U+061C), 금지된 서식 문자(U+206A~U+206F), 한글 채움(U+3164), 반각 한글 채움(U+FFA0).
    const invisible = [0x61c, 0x206a, 0x206b, 0x206c, 0x206d, 0x206e, 0x206f, 0x3164, 0xffa0];
    const dirty = invisible.map((code) => `가${chars(code)}`).join("");
    expect(firstResponse(rawFile([rawResponse({ comment: dirty })])).comment).toBe("가".repeat(invisible.length));
    expect(firstResponse(rawFile([rawResponse({ nickname: `별${chars(0x3164)}빛` })])).nickname).toBe("별빛");
    expect(firstResponse(rawFile([rawResponse({ nickname: chars(...invisible) })])).nickname).toBeNull();
    // 이모지에 쓰이는 변형 선택자(U+FE0F)는 남긴다.
    const heart = chars(0x2764, 0xfe0f);
    expect(firstResponse(rawFile([rawResponse({ comment: `좋아요 ${heart}` })])).comment).toBe(`좋아요 ${heart}`);
    // 보이지 않는 글뿐인 의견만 있고 다른 답이 없으면 '내용이 없는 응답'이다.
    const empty = rawResponse({ ratings: { fun: null, understanding: null }, reading: { status: "unmarked" }, emotions: [], comment: chars(...invisible) });
    expectFailure(parse(rawFile([empty])), "invalid");
  });

  it("이메일·전화번호처럼 보이는 글은 가리고, 닉네임이 연락처이면 닉네임을 비운다", () => {
    const response = firstResponse(rawFile([rawResponse({
      comment: "연락은 test.user@example.com 또는 010-1234-5678, 02 123 4567, +82 10 2222 3333 으로요",
      nickname: "mail@example.com",
    })]));
    expect(response.comment).toBe(`연락은 ${CONTACT_MASK} 또는 ${CONTACT_MASK}, ${CONTACT_MASK}, ${CONTACT_MASK} 으로요`);
    expect(response.nickname).toBeNull();
    expect(firstResponse(rawFile([rawResponse({ nickname: "010 9999 8888" })])).nickname).toBeNull();
    expect(firstResponse(rawFile([rawResponse({ nickname: "  별   빛  " })])).nickname).toBe("별 빛");
    expect(firstResponse(rawFile([rawResponse({ nickname: "   " })])).nickname).toBeNull();
  });

  it("정규식 역추적을 노린 긴 입력도 제한 시간 안에 처리한다", () => {
    const hostile = ["a@".repeat(590), `${"a".repeat(1190)}@`, "0".repeat(1190), `0${"1-".repeat(590)}`, `${"가".repeat(600)}@${"b.".repeat(299)}`];
    const startedAt = performance.now();
    const responses = hostile.map((comment, index) => rawResponse({ id: `redos-${index}`, comment }));
    expect(parse(rawFile(responses)).ok).toBe(true);
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });

  it("날짜·컷 번호처럼 연락처가 아닌 숫자는 가리지 않는다", () => {
    const comment = "2026-10-16 업로드분 12컷부터 100% 스크롤했고 3000원 이상 값 20261016";
    expect(firstResponse(rawFile([rawResponse({ comment })])).comment).toBe(comment);
  });

  it("의견은 600자(코드 포인트)로 자르되 이모지를 반으로 쪼개지 않고, 원문이 상한의 2배를 넘으면 거절한다", () => {
    const long = firstResponse(rawFile([rawResponse({ comment: `${"가".repeat(599)}😀😀` })])).comment;
    expect(Array.from(long)).toHaveLength(READER_FEEDBACK_LIMITS.maxCommentLength);
    expect(long.isWellFormed()).toBe(true);
    expect(firstResponse(rawFile([rawResponse({ comment: "나".repeat(900) })])).comment).toHaveLength(READER_FEEDBACK_LIMITS.maxCommentLength);
    expectFailure(parse(rawFile([rawResponse({ comment: "나".repeat(READER_FEEDBACK_LIMITS.maxCommentLength * 2 + 1) })])), "invalid");
    expectFailure(parse(rawFile([rawResponse({ nickname: "닉".repeat(41) })])), "invalid");
  });
});

describe("파일 읽기·내보내기 보조", () => {
  it("크기를 먼저 확인하고 큰 파일은 내용을 읽지 않는다", async () => {
    const text = vi.fn(async () => "{}");
    expect(await readReaderFeedbackFile({ size: 0, text })).toEqual({ ok: false, code: "empty" });
    expect(await readReaderFeedbackFile({ size: READER_FEEDBACK_LIMITS.maxFileBytes + 1, text })).toEqual({ ok: false, code: "too-large" });
    expect(text).not.toHaveBeenCalled();
    expect(await readReaderFeedbackFile({ size: 2, text })).toEqual({ ok: true, text: "{}" });
  });

  it("읽다가 실패하면 다시 시도할 수 있는 오류로 알린다", async () => {
    expect(await readReaderFeedbackFile({ size: 10, text: async () => { throw new Error("NotReadableError"); } }))
      .toEqual({ ok: false, code: "read-failed" });
  });

  it("파일 이름은 영문·숫자뿐이라 제목이나 닉네임이 새지 않는다", () => {
    const response = readerFeedbackResponseSchema.parse(rawResponse({ id: "0a1b2c3d-aaaa-bbbb-cccc-ddddeeeeffff", nickname: "별빛" }));
    expect(readerFeedbackFilename(response)).toBe("toonstudio-reader-feedback-ep1-0a1b2c3d.json");
    const manual = readerFeedbackResponseSchema.parse(rawResponse({ id: "::--", target: { kind: "manual", id: null, title: "한글 제목", episode: null } }));
    expect(readerFeedbackFilename(manual)).toBe("toonstudio-reader-feedback-response.json");
  });

  it("공유는 지원 여부를 먼저 확인하고, 사용자가 닫은 것은 실패로 알리지 않는다", async () => {
    expect(canShareReaderFeedback(undefined, "a.json")).toBe(false);
    expect(canShareReaderFeedback({}, "a.json")).toBe(false);
    expect(canShareReaderFeedback({ share: async () => undefined, canShare: () => true }, "a.json")).toBe(true);
    expect(canShareReaderFeedback({ share: async () => undefined, canShare: () => false }, "a.json")).toBe(false);
    expect(canShareReaderFeedback({ share: async () => undefined, canShare: () => { throw new Error("x"); } }, "a.json")).toBe(false);

    const share = vi.fn(async (_data: ShareData) => undefined);
    expect(await shareReaderFeedback({ share, canShare: () => true }, "{}", "a.json", "제목")).toBe("shared");
    const data = share.mock.calls[0]![0];
    expect(data.files?.[0]?.name).toBe("a.json");
    expect(data.files?.[0]?.type).toBe("application/json");
    expect(await shareReaderFeedback(undefined, "{}", "a.json", "제목")).toBe("unsupported");
    expect(await shareReaderFeedback({ share: async () => { throw new DOMException("취소", "AbortError"); } }, "{}", "a.json", "제목")).toBe("cancelled");
    expect(await shareReaderFeedback({ share: async () => { throw new Error("boom"); } }, "{}", "a.json", "제목")).toBe("failed");
  });

  it("복사는 클립보드가 없거나 거절되면 결과로 알린다", async () => {
    const writeText = vi.fn(async () => undefined);
    expect(await copyReaderFeedback({ writeText }, "json")).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("json");
    expect(await copyReaderFeedback(undefined, "json")).toBe("unsupported");
    expect(await copyReaderFeedback({}, "json")).toBe("unsupported");
    expect(await copyReaderFeedback({ writeText: async () => { throw new Error("denied"); } }, "json")).toBe("failed");
  });
});
